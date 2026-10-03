import {enemyKit} from '../../lib/brawl/enemy-combat.mjs';
import Phaser from 'phaser';
import {VERSION,fightersForVersion,combatFighterById} from '../../lib/brawl/catalog.mjs';
import type {Actor,BattleState} from '../../lib/brawl/simulation.mjs';
import type {BrawlAssets} from './types';
type Burst={event:any;age:number;life:number};
const C:Record<string,number>={fire:0xff8f28,ice:0x70e5ff,lightning:0xffdd58,water:0x55d9ef,wind:0xadf6ff,earth:0xc99862,nature:0x89eb67,lunar:0xcbb8ff,light:0xffd76a,physical:0xffe1a0,ki:0x56dfff,chakra:0x55cfff,psychic:0xff8fcf};
// Disposable presentation only: the shared simulation owns all hitboxes and statuses.
export class ElementalVFX {
  private g:Phaser.GameObjects.Graphics;
  private sprites:Phaser.GameObjects.Image[]=[];
  private used=0;private bursts:Burst[]=[];
  stats={sprites:0,peak:0,beamWidth:0,flameLength:0,atlasFrames:{} as Record<string,number[]>};
  constructor(private scene:Phaser.Scene,private assets:BrawlAssets,private reduced:boolean){this.g=scene.add.graphics().setDepth(9900);}
  destroy(){this.g.destroy();this.sprites.forEach(s=>s.destroy());this.sprites=[];this.bursts=[];}
  event(event:any){
    if(event.type==='cloneSmoke')event={...event,kind:'shadow-clones',element:'chakra'};
    if(event.type==='catStrike')event={...event,kind:'flurry',element:'light'};
    if(event.type==='skillRelease'&&event.kind==='blink')event={...event,element:'light'};
    if(this.hasAtlas(event.kind)&&['abilityPulse','skillRelease','cloneSmoke','catStrike','abilityLink'].includes(event.type)){
      if(this.bursts.length>=32)this.bursts.shift();this.bursts.push({event,age:0,life:event.type==='catStrike'?.28:.65});return;
    }
    if(event.element&&(['abilityPulse','abilityLink','reflect','elementStatus','airRay','mindStun'].includes(event.type)||event.type==='skillRelease'&&['scan','buff'].includes(event.mechanic))){
      if(this.bursts.length>=32)this.bursts.shift();this.bursts.push({event,age:0,life:event.type==='abilityLink'?.32:.65});
    }
  }
  private hasAtlas(kind:string){return !!this.assets.skillFx?.[kind]&&this.scene.textures.exists('brawl-skill-'+kind);}
  // Reuse the bounded sprite pool. Transparent padding is excluded from the
  // requested visible size; mirror the anchor as well as the pixels.
  private atlas(kind:string,frame:number,x:number,y:number,width:number,height?:number,alpha=1,flip=false,angle=0){
    const clip=this.assets.skillFx?.[kind];if(!clip||!this.hasAtlas(kind)||this.used>=72)return false;
    frame=Math.max(0,Math.min(clip.frames-1,Math.floor(frame)));
    let image=this.sprites[this.used++];if(!image){image=this.scene.add.image(x,y,'brawl-skill-'+kind,frame);this.sprites.push(image);}
    const w=width/clip.widthRatio,h=height?height/(clip.heightRatio||.9):w*clip.frameHeight/clip.frameWidth;
    image.setTexture('brawl-skill-'+kind,frame).setOrigin(flip?1-clip.originX:clip.originX,clip.originY??.5).setVisible(true).setPosition(x,y).setDisplaySize(w,h).setAlpha(alpha).setFlipX(flip).setRotation(angle).setDepth(9950);
    const frames=this.stats.atlasFrames[kind]??=[];if(!frames.includes(frame))frames.push(frame);return true;
  }
  private sprite(frame:string,x:number,y:number,w:number,h=w,alpha=1,flip=false,angle=0){
    const index=this.assets.elementalFx?.frames[frame];if(index===undefined||!this.scene.textures.exists('brawl-elemental')||this.used>=72)return;
    let s=this.sprites[this.used++];if(!s){s=this.scene.add.image(x,y,'brawl-elemental',index);this.sprites.push(s);}
    s.setTexture('brawl-elemental',index).setOrigin(.5,.5).setVisible(true).setFrame(index).setPosition(x,y).setDisplaySize(w,h).setAlpha(alpha).setFlipX(flip).setRotation(angle).setDepth(9950);
  }
  private orb(frame:string,x:number,y:number,r:number,time:number,color:number,alpha=1){
    this.g.fillStyle(color,.14*alpha).fillCircle(x,y,r*1.3).fillStyle(color,.18*alpha).fillCircle(x,y,r);
    this.sprite(frame,x,y,r*2.15,r*2.15,alpha,false,frame==='spiral-orb'?time*4:0);
    if(frame==='spiral-orb')this.sprite(frame,x,y,r*2.7,r*2.7,alpha*.24,false,-time*3);
    for(let n=0;n<(this.reduced?2:5);n++){const a=time*5+n*1.3;this.g.lineStyle(n?2:4,n%2?color:0xffffff,alpha*.8).beginPath().arc(x,y,r*(.45+n*.11),a,a+1.8).strokePath();}
  }
  private bolt(x:number,y:number,tx:number,ty:number,color:number,alpha:number,time:number){
    for(const width of [17,7,2]){this.g.lineStyle(width,width===2?0xffffff:color,alpha*(width===17?.18:.9)).beginPath();
      for(let n=0;n<=12;n++){const q=n/12,j=n===0||n===12?0:Math.sin(n*7+time*18)*18;const px=x+(tx-x)*q+j,py=y+(ty-y)*q+j*.45;n?this.g.lineTo(px,py):this.g.moveTo(px,py);}this.g.strokePath();}
  }
  private charge(a:Actor,k:any,time:number){
    const q=Math.min(1,a.actionTick/(k.windup||12)),x=a.x/100,y=a.y/100-a.z/100,color=C[k.element]||0xffffff;
    if(k.mechanic==='stretch'){this.stretch(a,k,-1);return;}
    if(this.hasAtlas(k.kind)){
      const above=!!k.orb,ground=this.assets.skillFx?.[k.kind].anchor==='ground';
      this.atlas(k.kind,Math.min(2,Math.floor(q*3)),ground||above?x:x+a.facing*42,ground?y:above?y-205:y-85,above?180:ground?135:70,undefined,.65+q*.35,a.facing<0);return;
    }
    if(k.mechanic==='flamethrower'){
      this.sprite(k.effect==='bloodflame'?'bloodflame':'fireball',x+a.facing*(40+q*15),y-85,25+q*55,30+q*60,.3+q*.5,a.facing<0);
      this.g.fillStyle(color,q*.22).fillCircle(x+a.facing*42,y-85,20+q*20);
    }
    if(['beam','rasengan'].includes(k.mechanic)||k.orb){
      this.sprite('gold-aura',x,y-80,140+q*85,190+q*75,.35+q*.25);
      const above=k.orb,yOrb=above?y-205:y-85,xOrb=above?x:x+a.facing*57;
      this.orb(k.mechanic==='rasengan'?'spiral-orb':'ki-head',xOrb,yOrb,(above?80:50)*(.2+q*.8),time,color,.8);
      for(let n=0;n<(this.reduced?2:8);n++){const angle=n*Math.PI/4+time*2,r=(1-q)*85+20;this.g.lineStyle(2,color,.8).lineBetween(xOrb+Math.cos(angle)*r,yOrb+Math.sin(angle)*r,xOrb+Math.cos(angle)*(r+12),yOrb+Math.sin(angle)*(r+12));}
    }
  }
  private channel(a:Actor,k:any,time:number){
    const x=a.x/100+a.facing*48,y=a.y/100-a.z/100-85,face=a.facing,range=k.range-48,color=k.effect==='cosmic'?0xd578ff:k.effect==='bloodflame'?0xff6eba:C[k.element]||0xffffff;
    if(k.mechanic!=='stretch'&&this.hasAtlas(k.kind)){
      const frame=3+Math.floor((a.actionTick-Number(k.windup||12))/4)%3;
      const height=k.mechanic==='beam'?(k.beamWidth||120)*1.25:(k.depth||56)*2.2;
      this.atlas(k.kind,frame,x,y,range,height,1,face<0);
      if(k.mechanic==='beam')this.stats.beamWidth=Math.max(this.stats.beamWidth,k.beamWidth||120);
      else this.stats.flameLength=Math.max(this.stats.flameLength,range);return;
    }
    if(k.mechanic==='flamethrower'){
      const length=range*(.92+.05*Math.sin(time*13)),height=(k.depth||56)*2.2;
      this.sprite(k.effect==='bloodflame'?'bloodflame':'fire-plume',x+face*length*.47,y,length*1.2,height*1.35,.95,face<0);
      this.sprite(k.effect==='bloodflame'?'bloodflame':'fire-plume',x+face*length*.38,y-7,length*.8,height*.84,.48,face<0);
      this.sprite(k.effect==='bloodflame'?'bloodflame':'fireball',x+face*length*.87,y+Math.sin(time*17)*12,height*.95,height*1.05,.68,face<0,Math.sin(time*11)*.08);
      this.g.fillStyle(k.effect==='bloodflame'?0xffc4eb:0xffee9b,.38).fillTriangle(x,y-13,x+face*length,y-height*.4,x+face*length,y+height*.4);this.stats.flameLength=Math.max(this.stats.flameLength,length);
    }else if(k.mechanic==='beam'){
      const width=k.beamWidth||120,pulse=1+.05*Math.sin(time*22),end=x+face*range;
      for(const [w,alpha,col] of [[width*1.35,.14,color],[width,.38,color],[width*.62,.85,color],[width*.28,1,0xffffff]])this.g.lineStyle(w*pulse,col,alpha).lineBetween(x,y,end,y);
      this.sprite(k.effect==='cosmic'?'cosmic-burst':'ki-head',end-face*12,y,width*1.65,width*1.6,1,face<0);
      this.orb('ki-head',x,y,width*.4,time,color,.8);
      for(let n=0;n<(this.reduced?1:3);n++){
        const run=(time*580+n*range/3)%range;
        this.sprite('ki-head',x+face*run,y,width*1.3,width*.65,.26,face<0);
      }
      for(let n=0;n<5;n++){const offset=(n-2)*width*.16,run=(time*530+n*90)%range;this.g.lineStyle(3,0xffffff,.6).lineBetween(x+face*run,y+offset,x+face*Math.min(range,run+70),y+offset);}
      this.stats.beamWidth=Math.max(this.stats.beamWidth,width);
    }else if(k.mechanic==='stretch'){
      if(this.stretch(a,k,a.actionTick-Number(k.windup||12)))return;
      const end=x+face*range,offset=k.pulses>1?Math.sin(time*25)*34:0;
      this.g.lineStyle(23,0xbb6454,.8).lineBetween(x,y,end,y+offset).lineStyle(13,0xffc2a3,1).lineBetween(x,y-3,end,y+offset-3);
      this.g.fillStyle(0xffc2a3,1).fillRoundedRect(end-30,y+offset-25,60,48,13).lineStyle(3,0x7d3c32,1).strokeRoundedRect(end-30,y+offset-25,60,48,13);
    }
  }
  private stretch(a:Actor,k:any,q:number){
    const clip=this.assets.skillFx?.[k.kind];if(!clip||!this.scene.textures.exists('brawl-skill-'+k.kind)||this.used>=72)return false;
    const face=a.facing,x=a.x/100+face*30,y=a.y/100-a.z/100-85,range=k.range-30;
    let sprite=this.sprites[this.used++];if(!sprite){sprite=this.scene.add.image(x,y,'brawl-skill-'+k.kind);this.sprites.push(sprite);}
    const frame=q<0?0:k.pulses>1?(q<35?1+(Math.floor(q/3)%5):Math.min(7,6+Math.floor((q-35)/8))):Math.min(7,1+Math.floor(q*7/18));
    sprite.setTexture('brawl-skill-'+k.kind,frame).setOrigin(face<0?1-clip.originX:clip.originX,.5).setPosition(x,y).setDisplaySize(range/clip.widthRatio,k.pulses>1?245:155).setFlipX(face<0).setAlpha(1).setRotation(0).setDepth(9950).setVisible(true);const frames=this.stats.atlasFrames[k.kind]??=[];if(!frames.includes(frame))frames.push(frame);return true;
  }
  draw(s:BattleState,time:number,dt:number){
    this.used=0;this.g.clear();
    if(!['brawl-v7','brawl-v8','brawl-v9','brawl-v10','brawl-v11'].includes(s.version)){this.sprites.forEach(sprite=>sprite.setVisible(false));this.bursts=[];this.stats.sprites=0;return;}
    for(const a of s.actors){const fighter=s.version===VERSION?combatFighterById(a.kind):fightersForVersion(s.version).find(f=>f.id===a.kind),k=(fighter?.skills[a.skill]||(['brawl-v9','brawl-v10',VERSION].includes(s.version)?enemyKit(a):undefined)) as any,x=a.x/100,y=a.y/100-(a.flightUntil>s.tick?Math.min(a.z/100,a.y/100-300):a.z/100);
      if(k&&(k.element||this.hasAtlas(k.kind))&&(a.action.startsWith('skill')||!fighter&&a.action.startsWith('attack'))){
        const wind=Number(k.windup||12),end=wind+(Number(k.pulses||1)-1)*Number(k.period||8)+18;
        if(a.actionTick<wind)this.charge(a,k,time);
        else if(['flamethrower','beam','stretch'].includes(k.mechanic!)&&a.actionTick<end)this.channel(a,k,time);
        if(k.mechanic==='rasengan'&&a.actionTick>=wind&&!this.atlas(k.kind,3+Math.floor(a.actionTick/3)%3,x+a.facing*65,y-80,Number(k.size||62)*2.2,undefined,1,a.facing<0))this.orb('spiral-orb',x+a.facing*65,y-80,Number(k.size||62),time,C.chakra);
        if(k.mechanic==='orbit'){const color=C[k.element]||C.physical;for(let n=0;n<3;n++){const angle=time*9+n*2.1,cx=x+Math.cos(angle)*Number(k.range)*.6,cy=y-60+Math.sin(angle)*40;if(!this.atlas(k.kind,3+Math.floor(s.tick/4)%3,cx,cy,74))this.ball(cx,cy,24,color,time);}}
      }
      if(a.readUntil>s.tick&&!this.atlas('mind-scan',3+Math.floor(s.tick/5)%3,x,y-160,92)){this.g.lineStyle(3,C.psychic,.9).strokeEllipse(x,y-70,135,175);this.heart(x,y-180,17,C.psychic,1);}
      if(a.wardUntil>s.tick&&!this.atlas('foreseen-counter',Math.floor(s.tick/6)%2?5:2,x,y-75,180,200,.85)){this.g.lineStyle(5,C.psychic,.85).strokeEllipse(x,y-70,155,195);for(let n=0;n<a.wardMeleeLeft;n++){const angle=time*3+n*Math.PI*2/3;this.heart(x+Math.cos(angle)*80,y-75+Math.sin(angle)*92,14,C.psychic,.9);}}
      if(a.mindStunUntil>s.tick)for(let n=0;n<3;n++){const angle=time*5+n*2.1;this.g.fillStyle(C.psychic,.95).fillCircle(x+Math.cos(angle)*40,y-155+Math.sin(angle)*12,6);}
      if(a.flightUntil>s.tick&&!this.atlas('take-copter',3+Math.floor(s.tick/2)%3,x,y-158,80)){const bottom=y,rotorY=bottom-158;this.g.lineStyle(5,0xdec87d,1).lineBetween(x,rotorY,x,rotorY+20);this.g.fillStyle(0xffe894,.9).fillEllipse(x,rotorY,60+Math.sin(time*40)*25,7).fillCircle(x,rotorY,6);this.g.lineStyle(2,C.wind,.4).strokeEllipse(x,rotorY,94,16);}
      if(a.rootUntil>s.tick&&a.wetUntil>s.tick)this.g.fillStyle(C.water,.12).fillEllipse(x,y-65,135,180).lineStyle(4,C.water,.9).strokeEllipse(x,y-65,135,180);
      if(a.hp>0&&a.freezeUntil>s.tick){this.sprite('ice-crystal',x,y-75,190,240,.8);this.g.lineStyle(4,C.ice,.8).strokeEllipse(x,y,120,32);for(let n=0;n<4;n++)this.g.fillStyle(0xebfdff,.8).fillCircle(x+Math.cos(n*1.6+time)*63,y-80+Math.sin(n*1.6+time)*65,3);}
      if(a.hp>0&&a.burnUntil>s.tick){this.sprite('fire-eruption',x,y-52,125,150,this.reduced?.6:.6+Math.sin(time*7)*.08);this.g.fillStyle(C.fire,.12).fillEllipse(x,y-65,105,145);if(!this.reduced)for(let n=0;n<3;n++){const q=(time*1.5+n/3)%1;this.g.fillStyle(n%2?0xfff0a0:C.fire,1-q).fillCircle(x+Math.sin(n*3+time)*38,y-25-q*120,3);}}
      if(a.wetUntil>s.tick)for(let n=0;n<3;n++)this.g.fillStyle(C.water,.8).fillEllipse(x-27+n*27,y-40+(time*50+n*17)%40,7,14);
      if(a.shield>0&&a.shieldUntil>s.tick){const ward=fighter?.skills.find(k=>k.mechanic==='buff'&&(k.shield||k.counter)),color=C[String(ward?.element||'nature')]||C.nature;if(ward&&this.atlas(ward.kind,Math.floor(s.tick/6)%2?5:2,x+a.facing*32,y-70,150,175,.85))continue;this.g.fillStyle(color,.1).fillEllipse(x,y-70,140,190).lineStyle(4,color,.75).strokeEllipse(x,y-70,140,190);}
    }
    for(const p of s.projectiles){if(!p.skill?.element)continue;const k=p.skill,x=p.x/100,y=p.y/100-p.z/100-(k.effect==='wave'?0:38),dir=Math.sign(p.dx)||1,color=C[k.element]||C.physical,size=k.size||35;
      if(this.atlas(k.kind,2+Math.floor(s.tick/5)%2,x,y,k.effect==='wave'?260:k.kind==='serious-punch'?250:Math.max(90,size*(k.orb?2.4:2.9)),undefined,1,dir<0))continue;
      if(['ball','power-ball'].includes(k.effect)){if(k.effect==='power-ball')this.sprite('fireball',x-dir*45,y,160,95,.9,dir<0);this.ball(x,y,size*.75,color,time);}
      else if(k.effect==='bubble'){this.g.fillStyle(C.water,.12).fillCircle(x,y,size).lineStyle(4,C.water,.9).strokeCircle(x,y,size).lineStyle(2,0xffffff,.9).beginPath().arc(x-4,y-4,size*.8,3.2,4.9).strokePath();}
      else if(k.effect==='flame'||k.effect==='mud')this.sprite(k.effect==='flame'?'fireball':'mud-ball',x,y,size*2.8,size*2.2,.95,dir<0);
      else if(k.effect==='leaves')this.sprite('leaf-storm',x,y,100,75,1,dir<0,time*4);
      else if(k.effect==='wave')this.sprite('tidal-wave',x-dir*28,y,230,200,.92,dir<0);
      else if(k.effect==='ki'||k.effect==='cosmic'||k.effect==='electric')this.orb(k.effect==='cosmic'?'cosmic-burst':'ki-head',x,y,size,time,color);
      else if(k.effect==='crescent'){this.sprite('moon-disc',x,y,size*2.7,size*2.7,.9,false,time*4);this.g.lineStyle(14,0xe9dbff,1).beginPath().arc(x,y,size,time*7,time*7+4.2).strokePath().lineStyle(5,0xffffff,1).beginPath().arc(x,y,size*.75,time*7,time*7+4.2).strokePath();}
      else if(k.effect==='ribbon')this.sprite('ribbon-bow',x-dir*10,y,size*3,size*2,.95,dir<0);
      else{if(k.effect==='impact')this.sprite('pressure-wave',x-dir*size*.2,y,size*2.7,size*2.3,.85,dir<0);this.g.fillStyle(color,.18).fillEllipse(x-dir*25,y,size*4,size*2).fillStyle(0xffffff,.95).fillEllipse(x,y,size*2,size*.85).lineStyle(5,color,.7).beginPath().arc(x,y,size*1.25,-1.2,1.2).strokePath();}
      this.g.lineStyle(3,color,.4).lineBetween(x-dir*size,y,x-dir*(size+65),y);
    }
    for(const f of s.fields||[])this.field(f,s,time);
    for(const b of this.bursts){b.age+=dt;const e=b.event,q=b.age/b.life,color=C[e.element]||C.light,alpha=1-q;
      if(this.hasAtlas(e.kind)){
        const ground=this.assets.skillFx?.[e.kind].anchor==='ground',caster=s.actors.find(a=>a.id===e.actor),face=e.facing??caster?.facing??1,frame=Math.min(7,3+Math.floor(q*5));
        // Releases are small flashes; damaging fields/projectiles own the large visual.
        const size=e.type==='cloneSmoke'?170:e.type==='catStrike'?160:e.type==='abilityPulse'?Math.min(310,(e.size||90)*2):e.mechanic==='scan'?220:e.mechanic==='buff'?170:95;
        if(e.type==='abilityLink'){const dx=e.x-e.fromX,dy=e.y-e.fromY;this.atlas(e.kind,frame,e.fromX,e.fromY-75,Math.hypot(dx,dy),90,alpha,false,Math.atan2(dy,dx));}
        else this.atlas(e.kind,frame,e.x,e.y-(ground?0:75),size,undefined,alpha,face<0);
        if(e.kind==='blink'&&e.fromX!==undefined)this.atlas(e.kind,frame,e.fromX,e.fromY-75,135,undefined,alpha,face<0);
        if(e.mechanic==='scan')this.g.lineStyle(5,color,alpha*.6).strokeEllipse(e.x,e.y-65,e.range*2*q,e.range*.65*q);
      }else if(e.type==='skillRelease'&&e.mechanic==='scan'){
        this.sprite('cosmic-burst',e.x,e.y-75,180,180,alpha*.35,false,time);
        for(let n=0;n<3;n++){const r=e.range*Math.min(1,q+n*.16);this.g.lineStyle(7-n*2,color,alpha*.75).strokeEllipse(e.x,e.y-65,r*2,r*.65);}
        for(let n=0;n<5;n++){const angle=time*4+n*1.26;this.heart(e.x+Math.cos(angle)*e.range*q*.8,e.y-65+Math.sin(angle)*e.range*q*.26,9,color,alpha);}
      }else if(e.type==='airRay'){
        const fromY=Math.max(300,e.y-e.z)-80,endY=e.toY-70;this.g.lineStyle(12,C.wind,alpha*.35).lineBetween(e.x,fromY,e.toX,endY).lineStyle(5,0xffffff,alpha).lineBetween(e.x,fromY,e.toX,endY);this.orb('ki-head',e.toX,endY,22,time,C.wind,alpha);
      }else if(e.type==='reflect'&&e.toX!==undefined){this.bolt(e.x,e.y-75,e.toX,e.toY-75,C.psychic,alpha,time);
      }else if(e.type==='skillRelease'&&e.mechanic==='buff'){
        this.sprite('gold-aura',e.x,e.y-75,160+q*70,210+q*50,alpha*.4);
        this.g.lineStyle(5,color,alpha).strokeEllipse(e.x,e.y-70,135+q*65,180+q*75);
      }else if(e.type==='abilityLink')this.bolt(e.fromX,e.fromY-75,e.x,e.y-75,color,alpha,time);
      else if(e.type==='abilityPulse'){
        const size=Math.min(250,e.size||110),x=e.x,y=e.y;
        if(['fire','ice','lightning','ki','chakra'].includes(e.element))this.sprite(e.element==='fire'?'fire-eruption':e.element==='ice'?'ice-crystal':e.element==='lightning'?'lightning':e.element==='chakra'?'spiral-orb':'cosmic-burst',x,y-size*.65,size*1.8*(.55+q),size*2*(.55+q),alpha);
        this.g.lineStyle(8*(1-q)+1,color,alpha*.8).strokeEllipse(x,y,size*2*q,size*.75*q);
      }else this.g.lineStyle(4,color,alpha).strokeCircle(e.x,e.y-70,35+q*65);
    }
    this.bursts=this.bursts.filter(b=>b.age<b.life);for(let n=this.used;n<this.sprites.length;n++)this.sprites[n].setVisible(false);
    this.stats.sprites=this.used;this.stats.peak=Math.max(this.stats.peak,this.used);
  }
  private field(f:any,s:BattleState,time:number){
    if(f.mechanic==='clones')return;
    const x=f.x/100,y=f.y/100,r=f.radius,color=C[f.element]||C.physical,armed=s.tick>=f.starts;
    this.g.lineStyle(armed?3:2,color,armed?.5:.9).strokeEllipse(x,y,r*2,r*.72).fillStyle(color,armed?.09:.13).fillEllipse(x,y,r*2,r*.72);
    if(!armed){const q=(s.tick-f.spawnedAt)/Math.max(1,f.starts-f.spawnedAt);this.g.lineStyle(4,0xffffff,.65).beginPath().arc(x,y,r*.55,-Math.PI/2,-Math.PI/2+Math.PI*2*q).strokePath();return;}
    if(this.hasAtlas(f.kind)){
      const age=s.tick-f.starts,remaining=f.expires-s.tick,frame=remaining<16?6+Math.floor((16-remaining)/8):f.mechanic==='eruption'?Math.min(5,3+Math.floor(age/6)):3+Math.floor(age/5)%3;
      const width=f.mechanic==='eruption'?Math.max(150,r*2.2):r*2, height=f.element==='lightning'?350:f.mechanic==='eruption'?260:f.mechanic==='tornado'?r*2.4:f.effect==='bubble'?r*2:undefined;
      this.atlas(f.kind,frame,x,y,width,height,Math.min(1,remaining/12),f.facing<0);return;
    }
    if(f.mechanic==='eruption'){
      if(f.element==='ice'){
        const grow=Math.min(1,(s.tick-f.starts+1)/8),fade=Math.min(1,(f.expires-s.tick)/16);
        this.sprite('blizzard',x,y-12,160,65,.35*fade);
        this.sprite('ice-crystal',x-30,y-36*grow,85,105*grow,.72*fade,false,-.18);
        this.sprite('ice-crystal',x+28,y-30*grow,78,92*grow,.72*fade,false,.2);
        this.sprite('ice-crystal',x,y-102*grow,140,270*grow,.95*fade);
      }
      else if(f.element==='lightning')this.sprite('lightning',x,y-180,145,400,.92);
      else if(f.element==='fire')this.sprite(f.effect==='bloodflame'?'bloodflame':'fire-eruption',x,y-95,210,250,.9,false,f.effect==='bloodflame'?-Math.PI/2:0);
      else if(f.element==='earth'){this.sprite('rock-eruption',x,y-80,160,240,.96);for(let n=0;n<5;n++){const dx=(n-2)*22,h=60+(n%3)*30;this.g.fillStyle(n%2?0xb08a62:0xd4ad78,1).fillTriangle(x+dx-25,y,x+dx,y-h,x+dx+22,y).lineStyle(3,0x59402b,.8).lineBetween(x+dx,y-h,x+dx-8,y-15);}}
      else if(f.element==='lunar'){
        this.sprite('moon-disc',x,y-90,170,180,.85,false,time*2);
        this.g.lineStyle(6,C.lunar,.6).lineBetween(x,y-220,x,y-65).lineStyle(2,0xffffff,.85).lineBetween(x,y-220,x,y-65);
      }else this.orb('ki-head',x,y-85,70,time,color,.75);
    }else if(f.mechanic==='tornado'){
      const frame=f.element==='nature'?'leaf-storm':f.element==='ice'?'blizzard':'wind-tornado';this.sprite(frame,x,y-108,r*1.7,r*2.15,.82);
      for(let n=0;n<4;n++){const cy=y-28-n*43,rx=r*(.4+n*.15);this.g.lineStyle(3,color,.7).strokeEllipse(x,cy,rx*2,rx*.45);const angle=time*6+n*2;this.g.fillStyle(0xffffff,.8).fillEllipse(x+Math.cos(angle)*rx,cy+Math.sin(angle)*rx*.22,17,7);}
    }else if(f.mechanic==='sanctuary'){this.sprite('tidal-wave',x,y-28,r*2,r,.2);for(let n=0;n<4;n++)this.heart(x+Math.sin(n*3+time)*r*.6,y-30-((time*35+n*30)%110),20,f.effect==='heart'?0xff8bbd:C.water,.7);}
    else if(f.mechanic==='barrage'){this.g.fillStyle(0xff80b7,.2).fillRoundedRect(x-38,y-140,76,140,10).lineStyle(7,0xff85c6,.9).strokeRoundedRect(x-38,y-140,76,140,10);this.orb('ki-head',x,y-70,30,time,C.wind,.75);}
    else if(f.effect==='bubble'){this.g.lineStyle(4,C.water,.7).strokeEllipse(x,y-45,r*1.6,r*1.7).fillStyle(C.water,.08).fillEllipse(x,y-45,r*1.6,r*1.7);}
    else if(f.element==='fire')this.sprite('fire-eruption',x,y-45,r*2,r*1.4,.7);
    else if(f.element==='nature'){this.sprite('root-eruption',x,y-55,r*1.8,r*1.5,.7);for(let n=0;n<8;n++){const angle=n*.8;this.g.lineStyle(6,C.nature,.7).beginPath().arc(x+Math.cos(angle)*r*.6,y+Math.sin(angle)*r*.25-22,28,time+n,time+n+2.5).strokePath();}}
    else if(f.effect==='mud')this.g.fillStyle(0x906844,.4).fillEllipse(x,y,r*2,r*.7);
    else this.sprite('cosmic-burst',x,y-45,r*1.6,r*1.6,.35);
  }
  private ball(x:number,y:number,r:number,color:number,time:number){this.g.fillStyle(0xfffbef,1).fillCircle(x,y,r).lineStyle(3,color,.85).strokeCircle(x,y,r).fillStyle(0x3d4553,.95).fillCircle(x,y,r*.28);for(let n=0;n<5;n++){const a=time*5+n*1.26;this.g.fillStyle(0x3d4553,.9).fillCircle(x+Math.cos(a)*r*.62,y+Math.sin(a)*r*.62,r*.15);}}
  private heart(x:number,y:number,r:number,color:number,alpha:number){this.g.fillStyle(color,alpha).fillCircle(x-r*.4,y-r*.2,r*.5).fillCircle(x+r*.4,y-r*.2,r*.5).fillTriangle(x-r*.86,y,x+r*.86,y,x,y+r);}
}
