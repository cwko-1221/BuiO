import Phaser from 'phaser';
import {VERSION,CLIPS,stageById,fightersForVersion,combatFighterById} from '../../lib/brawl/catalog.mjs';
import type {Actor,BattleState} from '../../lib/brawl/simulation.mjs';
import type {BrawlAssets} from './types';
import {ElementalVFX} from './ElementalVFX';
import {audio} from '../audio';
interface SceneData {state:BattleState;playerId?:number;assets:BrawlAssets;locale:string;paused:()=>boolean;step:(mask?:number)=>void;loaded:()=>void;failed:()=>void;changed:()=>void}
interface Effect {kind:string;x:number;y:number;age:number;life:number;color:number;size:number;angle:number;vx:number;vy:number;gravity:number;sprite?:Phaser.GameObjects.Image}
interface View {sprite:Phaser.GameObjects.Image;shadow:Phaser.GameObjects.Ellipse;bar:Phaser.GameObjects.Graphics;status:Phaser.GameObjects.Text;frozen?:boolean;trailTick:number;x:number;y:number;z:number}
const gold=0xffd36a,white=0xfff7dc,blue=0x74e9ff,red=0xff7259,earth=0xdec398;
export class BattleScene extends Phaser.Scene {
  private elemental?:ElementalVFX;
  private runtime!:SceneData;private accumulator=0;private views=new Map<number,View>();
  private fx!:Phaser.GameObjects.Graphics;private ground!:Phaser.GameObjects.Graphics;private ambient!:Phaser.GameObjects.Graphics;
  private arrow!:Phaser.GameObjects.Text;private comboText!:Phaser.GameObjects.Text;private banner!:Phaser.GameObjects.Container;
  private ownedTextures:string[]=[];private loadFailed=false;private lastZone=-1;private hudTick=-1;private victoryAt=-1;
  private effects:Effect[]=[];private bolts=new Map<number,Phaser.GameObjects.Image>();private eventQueue:any[]=[];private lookAhead=80;private visualTime=0;private deliveredTick=-1;private reduced=false;
  feedback={events:0,hits:0,casts:0,particles:0,cameraDistance:0};
  constructor(){super('Brawl');}
  private readonly onLoadError=()=>{this.loadFailed=true;};
  init(data:SceneData){this.runtime=data;this.accumulator=0;this.views.clear();this.clones.clear();this.bolts.clear();this.effects=[];this.eventQueue=[];this.ownedTextures=[];this.lastZone=-1;this.loadFailed=false;this.hudTick=-1;this.victoryAt=-1;this.visualTime=0;this.deliveredTick=-1;this.lookAhead=80;this.feedback={events:0,hits:0,casts:0,particles:0,cameraDistance:0};this.reduced=localStorage.getItem('pet-reduced-motion')==='1'||matchMedia('(prefers-reduced-motion: reduce)').matches;}
  preload(){const {state,assets}=this.runtime;const ids=[state.fighterId,...(['duel','pvp'].includes(state.mode)?[state.opponentId]:[])];
    for(const id of new Set(ids))assets.fighters[id].pages.forEach((url,page)=>{const key=`brawl-${id}-${page}`;if(!this.textures.exists(key)){this.load.spritesheet(key,url,{frameWidth:assets.fighters[id].frameWidth||256,frameHeight:assets.fighters[id].frameHeight||256});this.ownedTextures.push(key);}});
    if(!this.textures.exists('brawl-enemies')){this.load.spritesheet('brawl-enemies',assets.enemies.url,{frameWidth:256,frameHeight:256});this.ownedTextures.push('brawl-enemies');}
    const key=`brawl-bg-${state.stageId}`;if(!this.textures.exists(key)){this.load.image(key,assets.worlds?.[state.stageId]||assets.backgrounds[state.stageId]);this.ownedTextures.push(key);}
    if(assets.effects&&!this.textures.exists('brawl-vfx')){this.load.spritesheet('brawl-vfx',assets.effects.url,{frameWidth:assets.effects.frameSize,frameHeight:assets.effects.frameSize});this.ownedTextures.push('brawl-vfx');}
    if(assets.elementalFx&&!this.textures.exists('brawl-elemental')){this.load.spritesheet('brawl-elemental',assets.elementalFx.url,{frameWidth:assets.elementalFx.frameSize,frameHeight:assets.elementalFx.frameSize});this.ownedTextures.push('brawl-elemental');}
    this.load.on('loaderror',this.onLoadError);
  }
  create(){this.load.off('loaderror',this.onLoadError);this.events.once('shutdown',()=>{this.elemental?.destroy();this.elemental=undefined;this.load.off('loaderror',this.onLoadError);this.effects=[];this.eventQueue=[];this.views.clear();this.clones.clear();for(const key of this.ownedTextures)if(this.textures.exists(key))this.textures.remove(key);});if(this.loadFailed){this.runtime.failed();return;}
    const {state}=this.runtime,width=state.mode==='campaign'?5120:1280;
    const key=`brawl-bg-${state.stageId}`,texture=this.textures.get(key),source=texture.getSourceImage();
    const bands=state.stageId==='windbell-forest'?[.60,.78]:state.stageId==='starcrystal-cave'?[.51,.80]:[.56,.80],top=Math.round(source.height*bands[0]),bottom=Math.round(source.height*bands[1]);
    // Match the painted trail to the simulation's ground-depth band. Separate source
    // frames retain all scenery while avoiding characters walking over the distant lake.
    texture.add('sky',0,0,0,source.width,top);texture.add('floor',0,0,top,source.width,bottom-top);texture.add('front',0,0,bottom,source.width,source.height-bottom);
    this.add.image(width/2,172.5,key,'sky').setDisplaySize(width,345).setDepth(0);
    this.add.image(width/2,455,key,'floor').setDisplaySize(width,220).setDepth(0);
    this.add.image(width/2,642.5,key,'front').setDisplaySize(width,155).setDepth(650);
    this.cameras.main.setBounds(0,0,width,720);this.cameras.main.scrollX=Phaser.Math.Clamp(state.actors[0].x/100-520,0,width-1280);
    this.ambient=this.add.graphics().setDepth(2);this.ground=this.add.graphics().setDepth(330);this.fx=this.add.graphics().setDepth(9999);this.elemental=new ElementalVFX(this,this.runtime.assets,this.reduced);
    this.arrow=this.add.text(1150,400,'GO  ››',{fontFamily:'sans-serif',fontSize:'32px',fontStyle:'bold',color:'#fff1b7',stroke:'#3c4f55',strokeThickness:6}).setDepth(9998).setOrigin(.5);
    this.comboText=this.add.text(1230,150,'',{fontFamily:'sans-serif',fontSize:'30px',fontStyle:'bold',color:'#ffe49b',stroke:'#383047',strokeThickness:5,align:'right'}).setOrigin(1,0).setScrollFactor(0).setDepth(10001);
    this.banner=this.add.container(640,135).setScrollFactor(0).setDepth(10002);
    this.showBanner(stageById(state.stageId)!.name[this.zh?'zh-HK':'en-US'],state.mode==='campaign'?'01 / 04 · ADVENTURE':'PET BRAWL');
    this.runtime.loaded();this.draw(16);
  }
  private get player(){return this.runtime.state.actors.find(a=>a.id===this.runtime.playerId)||this.runtime.state.actors[0];}
  private get catKit(){return ['brawl-v3','brawl-v4','brawl-v5','brawl-v6','brawl-v7','brawl-v8'].includes(this.runtime.state.version);}
  private get zh(){return this.runtime.locale==='zh-HK';}
  receiveEvents(events:any[],tick:number){if(tick===this.deliveredTick)return;this.deliveredTick=tick;this.feedback.events+=events.length;this.eventQueue.push(...events);if(this.eventQueue.length>256)this.eventQueue.splice(0,this.eventQueue.length-256);}
  update(_time:number,delta:number){if(!this.runtime||!this.fx)return;if(!this.runtime.paused()&&this.runtime.state.status==='playing'){this.accumulator+=Math.min(delta,250);let steps=0;while(this.accumulator>=1000/60&&steps++<15){this.runtime.step();this.accumulator-=1000/60;if(this.runtime.state.status!=='playing')break;}}else this.accumulator=0;this.draw(Math.min(delta,50));}
  private frame(a:Actor){const assets=this.runtime.assets.fighters[a.kind];let action=a.action;
    if(!assets){const row=this.runtime.assets.enemies.rows[a.kind]||0,attacking=a.action.startsWith('attack');return {key:'brawl-enemies',frame:row*8+(attacking?4+Math.min(3,Math.floor(a.actionTick/Math.max(1,a.actionDuration)*4)):Math.floor(this.runtime.state.tick/9)%4)};}
    if(a.kind==='starpatch-cat'&&this.catKit){
      if(action==='skill1'){const c=assets.clips.attack1,index=a.actionTick<6?1:Math.min(7,3+Math.floor((a.actionTick-6)/4));return {key:`brawl-${a.kind}-${c.page}`,frame:c.start+index};}
      if(action==='skill2'){const t=a.actionTick,c=assets.clips[t<6?'skill1':t<16?'jump':t<=31?'skill2':'rise'],index=t<6?Math.min(3,t):t<16?2:t<=31?2+(Math.floor((t-16)%7/2)%4):Math.min(3,Math.floor((t-32)/4));return {key:`brawl-${a.kind}-${c.page}`,frame:c.start+index};}
    }
    if(!CLIPS[action])action='idle';const c=assets.clips[action]||assets.clips.idle;let index=0;
    if(action==='idle'){index=Math.floor(this.runtime.state.tick/12)%c.count;if(c.durations){let time=(this.runtime.state.tick*1000/60)%c.durations.reduce((n,d)=>n+d,0);index=0;while(index<c.count-1&&time>=c.durations[index])time-=c.durations[index++];}}else if(action==='walk'||action==='run')index=Math.floor(a.moveTick/(action==='run'?4:6))%c.count;
    else if(action==='guard')index=Math.min(c.count-1,Math.floor(a.actionTick/7));else if(action==='jump')index=a.vz>0?2:5;
    else if(action==='win'){if(this.victoryAt<0)this.victoryAt=this.time.now;index=Math.min(c.count-1,Math.floor((this.time.now-this.victoryAt)/110));}
    else if(action.startsWith('attack')&&(a.team===0||a.human)){const start=a.windup||6;index=a.actionTick<start?Math.floor(a.actionTick/start*3):3+Math.floor((a.actionTick-start)/Math.max(1,a.actionDuration-start)*(c.count-3));index=Math.min(c.count-1,index);}
    else index=Math.min(c.count-1,Math.floor(a.actionTick/Math.max(1,a.actionDuration||48)*c.count));index=Phaser.Math.Clamp(index,0,c.count-1);return {key:`brawl-${a.kind}-${c.page}`,frame:c.frames?.[index]??c.start+index};
  }
  private fighter(a?:Actor){return this.runtime.state.version===VERSION?combatFighterById(a?.kind||''):fightersForVersion(this.runtime.state.version).find(f=>f.id===a?.kind);}
  private color(a?:Actor){return this.fighter(a)?.color||(a&&a.id!==this.player.id?red:gold);}
  private rarityScale(a?:Actor){const rarity=this.fighter(a)?.rarity;return rarity==='epic'?1.45:rarity==='rare'?1.2:1;}
  private abilityVisual(e:any,a?:Actor){if(e.element||e.fieldId)return;const color=this.color(a),scale=this.rarityScale(a),x=e.x??(a?.x||0)/100,y=(e.y??(a?.y||0)/100)-55,face=e.facing??a?.facing??1;
    if(e.mechanic==='beam'||e.mechanic==='stretch')this.effect(e.mechanic,x,y,color,e.range,.28,face);
    else if(e.mechanic==='teleport'||e.mechanic==='retreat'){this.effect('portal',e.fromX,e.fromY-55,color,65*scale,.5);this.effect('portal',x,y,color,65*scale,.5);}
    else if(e.mechanic==='heal'||e.mechanic==='buff'||e.mechanic==='scan')this.effect(e.effect,x,y,color,85*scale,.65);
    else if(!e.fieldId)this.effect(e.effect||'ring',x+face*40,y,color,55*scale,.45);
    const count=this.reduced?3:Math.round(5*scale);for(let i=0;i<count;i++)this.effect('spark',x,y,i%2?color:white,2,.35,0,Math.cos(i*2.4)*100*scale,-50+Math.sin(i*2.4)*80,120);
  }
  private effect(kind:string,x:number,y:number,color:number,size=30,life=.35,angle=0,vx=0,vy=0,gravity=0){if(this.effects.length>=650)return;const clip=this.runtime.assets.effects?.clips[kind];let sprite:Phaser.GameObjects.Image|undefined;if(clip&&this.textures.exists('brawl-vfx')){sprite=this.add.image(x,y,'brawl-vfx',clip.start).setDepth(9999).setDisplaySize(size*(kind==='shock'?2:kind==='dust'?2:1.8),size*(kind==='shock'?1.3:kind==='dust'?1.5:1.8)).setOrigin(.5,kind==='shock'?.78:kind==='dust'?.7:.5);if(kind==='slash')sprite.setFlipX(angle<0);if(kind==='slash')sprite.setBlendMode(Phaser.BlendModes.ADD);}
    this.effects.push({kind,x,y,color,size,life,age:0,angle,vx,vy,gravity,sprite});this.feedback.particles++;}
  private burst(x:number,y:number,color:number,heavy=false){this.effect('flash',x,y,white,heavy?70:43,.16);this.effect('burst',x,y,color,heavy?90:60,.28);this.effect('ring',x,y,color,heavy?95:54,.34);
    for(let i=0;i<(this.reduced?5:heavy?20:12);i++){const angle=i*2.399963+this.visualTime*.1,speed=100+(i%5)*65;this.effect('spark',x,y,i%3===0?white:color,3+i%3,.25+(i%4)*.09,angle,Math.cos(angle)*speed,Math.sin(angle)*speed,250);}}
  private ghost(a:Actor,v:View){if(this.reduced)return;const ghost=this.add.image(v.sprite.x,v.sprite.y,v.sprite.texture.key,v.sprite.frame.name).setOrigin(.5,.9).setDisplaySize(v.sprite.displayWidth,v.sprite.displayHeight).setFlipX(v.sprite.flipX).setTint(this.color(a)).setAlpha(.28).setDepth(a.y/100-.5);this.tweens.add({targets:ghost,alpha:0,duration:210,onComplete:()=>ghost.destroy()});}
  private label(x:number,y:number,text:string,color:string,heavy=false){const label=this.add.text(x,y,text,{fontSize:heavy?'32px':'23px',fontFamily:'sans-serif',fontStyle:'bold',color,stroke:'#302e46',strokeThickness:5}).setOrigin(.5).setDepth(10000);this.tweens.add({targets:label,y:y-55,x:x+(this.feedback.hits%2?12:-12),alpha:0,duration:650,ease:'Cubic.Out',onComplete:()=>label.destroy()});}
  private showBanner(title:string,subtitle:string){this.tweens.killTweensOf(this.banner);this.banner.removeAll(true);const plate=this.add.graphics().fillStyle(0x17273b,.84).fillRoundedRect(-245,-34,490,88,14).lineStyle(2,gold,.7).strokeRoundedRect(-245,-34,490,88,14);const text=this.add.text(0,-15,title,{fontFamily:'sans-serif',fontSize:'28px',fontStyle:'bold',color:'#fff3cd'}).setOrigin(.5);const sub=this.add.text(0,27,subtitle,{fontFamily:'sans-serif',fontSize:'12px',color:'#b7d7df'}).setOrigin(.5);this.banner.add([plate,text,sub]).setAlpha(0);this.tweens.add({targets:this.banner,alpha:1,duration:180,hold:1700,yoyo:true});}
  private consume(){const s=this.runtime.state;let audible=0;for(const e of this.eventQueue.splice(0)){this.elemental?.event(e);const a=s.actors.find(a=>a.id===e.actor),source=s.actors.find(a=>a.id===e.source),x=e.x??(a?.x||0)/100,y=e.y??(a?.y||0)/100,z=e.z??(a?.z||0)/100,color=this.color(source||a),pan=(x-this.cameras.main.scrollX-640)/640;let cue='';
    if(e.type==='hit'||e.type==='block'){this.feedback.hits++;cue=e.type==='block'?'guard':e.heavy?'heavy':'hit';this.burst(x,y-z-65,e.type==='block'?blue:color,!!e.heavy);this.label(x,y-z-120,e.type==='block'?`${e.damage} · BLOCK`:String(e.damage),e.type==='block'?'#c9f8ff':source&&source.id!==this.player.id?'#ffb4a1':'#fff1b6',!!e.heavy);const view=this.views.get(e.actor);if(view){view.sprite.setTint(e.type==='block'?blue:white).setTintMode(Phaser.TintModes.FILL);this.time.delayedCall(75,()=>{if(view.sprite.active)view.sprite.clearTint();});}if(!this.reduced)this.cameras.main.shake(e.heavy?110:55,e.heavy?.0045:.0015);}
    else if(e.type==='statusTick'){this.label(x,y-z-112,`${e.damage} · ${this.runtime.locale==='zh-HK'?'灼燒':'BURN'}`,'#ffb87c');}
    else if(e.type==='strike'&&a){cue='whoosh';this.effect('slash',x+a.facing*65,y-z-65,this.color(a),e.combo===2||e.air?115:75,.22,a.facing);}
    else if(e.type==='jump'){cue='jump';this.effect('dust',x,y,earth,35,.35);}
    else if(e.type==='land'){cue='land';this.effect('dust',x,y,earth,30,.3);}
    else if(e.type==='cast'&&a){this.feedback.casts++;this.effect(a.kind==='starpatch-cat'&&this.catKit?'star':'charge',x,y-65,this.color(a),a.kind==='starpatch-cat'?36:75,.36);}
    else if(e.type==='skillRelease'&&a){cue=e.phase?'':e.mechanic==='beam'?'ki-beam':e.element||e.kind;const f=this.fighter(a);if(!e.phase)this.label(a.x/100,a.y/100-a.z/100-140,f?.skills[e.skill]?.name[this.zh?'zh-HK':'en-US']||'',a.kind==='cloud-ear-dog'?'#bff7ff':'#ffe4b0');if(e.mechanic)this.abilityVisual(e,a);else if(['stomp','sweep'].includes(e.kind)){this.effect(e.kind==='stomp'?'shock':'whirl',x,y,color,e.kind==='stomp'?190:160,.7);this.burst(x,y-8,color,true);if(!this.reduced)this.cameras.main.shake(180,.006);}else if(e.kind==='vortex')this.effect('vortex',x+a.facing*65,y-70,color,140,.7,a.facing);
      else if(e.kind==='blink'){const view=this.views.get(a.id);if(view&&!this.reduced){const departure={...a,x:e.fromX*100,y:e.fromY*100};const previousX=view.sprite.x,previousY=view.sprite.y;view.sprite.setPosition(e.fromX,e.fromY);this.ghost(departure,view);view.sprite.setPosition(previousX,previousY);}this.effect('star',e.fromX,e.fromY-65,0xbca4ff,52,.35);this.effect('star',x,y-65,gold,44,.28);for(let i=1;i<6;i++)this.effect('spark',e.fromX+(x-e.fromX)*i/6,e.fromY-60+(y-e.fromY)*i/6,0xd9baff,3,.3,0,0,-35);}
      else if(e.kind==='flurry'){this.effect('dust',x,y,earth,24,.3);this.effect('star',x,y-100,0xd9baff,32,.45);}}
    else if(e.type==='abilityPulse'){if(e.element==='lightning')cue='lightning';this.effect(e.effect,x,y-12,color,(e.size||90)*this.rarityScale(a),.55);this.effect('shock',x,y,color,(e.size||80)*.8,.5);}
    else if(e.type==='abilityLink'){this.effect('lightning',e.fromX,e.fromY-55,color,Math.hypot(x-e.fromX,y-e.fromY),.3,Math.atan2(y-e.fromY,x-e.fromX));}
    else if(e.type==='barrier'||e.type==='counter'){cue='guard';this.effect(e.effect||'shield',x,y-65,this.color(a),75,.45);this.label(x,y-120,e.type==='counter'?(this.zh?'反擊':'COUNTER'):`${e.damage} · SHIELD`,'#ccfaff');}
    else if(e.type==='catch'){cue='pickup';this.effect(e.effect,x,y-45,color,45,.35);}
    else if(e.type==='catStrike'&&a){cue='claw';const slash=this.runtime.assets.effects?.clips.slash;for(let i=0;i<(e.phase===2?2:1);i++){this.effect('slash',x,y-z-70,e.empowered?white:gold,e.phase===2?98:72,.28,a.facing);const fx=this.effects.at(-1);if(fx?.sprite&&slash)fx.sprite.setRotation((e.phase%2?-.55:.55)+(i?-.9:0));}if(e.empowered)this.effect('star',x,y-z-80,0xd9baff,65,.4);}
    else if(e.type==='warning'){cue='warning';if(a?.boss)this.label(x,y-200,'!','#ffbe92',true);}
    else if(e.type==='ko'){cue='ko';this.effect('dust',x,y,earth,65,.6);}
    else if(e.type==='pickup'){cue='pickup';this.burst(x,y-25,e.kind==='health'?0x95efa0:blue);this.label(x,y-85,e.kind==='health'?'+18 HP':'+25 MP',e.kind==='health'?'#b5ffb7':'#c4f5ff');}
    else if(e.type==='clear'){cue='clear';this.showBanner(this.zh?'戰區完成':'AREA CLEAR','GO  ››  NEXT AREA');}
    else if(e.type==='zone'){cue=e.zone===3?'warning':'pickup';this.showBanner(e.zone===3?stageById(s.stageId)!.bossName[this.zh?'zh-HK':'en-US']:this.zh?`第 ${e.zone+1} 戰區`:`AREA ${e.zone+1}`,e.zone===3?'BOSS ENCOUNTER':`${String(e.zone+1).padStart(2,'0')} / 04 · KEEP GOING`);}
    else if(e.type==='victory'){cue='clear';this.showBanner(this.zh?'冒險完成！':'VICTORY','✦  PET BRAWL  ✦');for(let i=0;i<60;i++)this.effect('spark',s.actors[0].x/100,s.actors[0].y/100-120,i%2?gold:blue,4,1.2,i,Math.cos(i)*220,-120-Math.abs(Math.sin(i))*230,300);}
    if(cue&&audible++<12)audio.brawl(cue==='sweep'?'whoosh':cue,pan,e.type==='ko'?.65:1);
  }}
  private draw(delta:number){const s=this.runtime.state,dt=this.runtime.paused()&&s.status==='playing'?0:delta/1000;this.visualTime+=dt;const player=this.player,width=s.mode==='campaign'?5120:1280,camera=this.cameras.main;
    this.lookAhead=Phaser.Math.Linear(this.lookAhead,player.facing*90,1-Math.exp(-delta/280));const target=Phaser.Math.Clamp(player.x/100-580+this.lookAhead,0,width-1280),before=camera.scrollX;camera.scrollX=Phaser.Math.Linear(camera.scrollX,target,1-Math.exp(-delta/110));this.feedback.cameraDistance+=Math.abs(before-camera.scrollX);
    if(s.zone!==this.lastZone){this.lastZone=s.zone;this.runtime.changed();}const alive=new Set(s.actors.map(a=>a.id));for(const [id,v] of this.views)if(!alive.has(id)){v.sprite.destroy();v.shadow.destroy();v.bar.destroy();v.status.destroy();this.views.delete(id);}this.ground.clear();
    for(const a of s.actors){const f=this.frame(a);let v=this.views.get(a.id);const size=a.boss&&!a.dummy?246:a.dummy?190:this.runtime.assets.fighters[a.kind]?180:166;let x=a.x/100,y=a.y/100,z=a.z/100;
      if(!v){v={sprite:this.add.image(x,y,f.key,f.frame).setOrigin(.5,.9),shadow:this.add.ellipse(x,y,size*.46,16,0x152036,.28),bar:this.add.graphics(),status:this.add.text(x,y,'',{fontFamily:'sans-serif',fontSize:'18px',fontStyle:'bold',color:'#f1faff',backgroundColor:'#13253e',padding:{x:6,y:3},stroke:'#13253e',strokeThickness:2}).setOrigin(.5,1).setDepth(10005),trailTick:-1,x,y,z};this.views.set(a.id,v);}if(s.mode==='pvp'&&Math.hypot(x-v.x,y-v.y)<180){const blend=1-Math.exp(-delta/40);x=Phaser.Math.Linear(v.x,x,blend);y=Phaser.Math.Linear(v.y,y,blend);z=Phaser.Math.Linear(v.z,z,blend);}v.x=x;v.y=y;v.z=z;const overlap=a.id!==player.id&&a.y>=player.y&&a.y-player.y<4500&&Math.abs(a.x-player.x)<(a.boss?8500:5000)&&Math.abs(a.z-player.z)<5000;
      const asset=this.runtime.assets.fighters[a.kind],pet=asset?.runtime==='pet',attacking=a.action.startsWith('attack')||a.action.startsWith('skill'),pulse=pet&&attacking?Math.sin(a.actionTick/Math.max(1,a.actionDuration)*Math.PI):0;
      v.sprite.setTexture(f.key,f.frame).setOrigin(.5,asset?.originY||.9).setDisplaySize(size*(1+pulse*.07),size*(1-pulse*.04)).setFlipX(this.runtime.assets.fighters[a.kind]?a.facing<0:a.facing>0).setPosition(x,y-z).setDepth(y).setAlpha(a.hp<=0?Math.max(0,1-a.actionTick/42):overlap?.6:a.invuln>0&&s.tick%8<4?.55:1).setAngle(a.action==='fall'?a.facing*18:a.action==='hit'?a.facing*-5:pet&&attacking?a.facing*pulse*8:0);
      const statusLabels:[[string,string],number][]=[[[this.runtime.locale==='zh-HK'?'冰封':'Frozen','#a6eeff'],a.freezeUntil],[[this.runtime.locale==='zh-HK'?'燃燒':'Burning','#ffc285'],a.burnUntil],[[this.runtime.locale==='zh-HK'?'束縛':'Rooted','#baf6b8'],a.rootUntil],[[this.runtime.locale==='zh-HK'?'麻痺':'Shocked','#fff4a5'],a.shockUntil],[[this.runtime.locale==='zh-HK'?'濕身':'Wet','#b3e8ff'],a.wetUntil],[[this.runtime.locale==='zh-HK'?'減速':'Slowed','#d0def5'],a.slowUntil]];const active=statusLabels.filter(([,until])=>until>s.tick).slice(0,2);v.status.setVisible(a.hp>0&&active.length>0).setPosition(x,y-size*.9-z-12).setText(active.map(([[label],until])=>`${label} ${((until-s.tick)/60).toFixed(1)}s`).join('\n')).setColor(active[0]?.[0][1]||'#ffffff');
      if(a.freezeUntil>s.tick){v.sprite.setTint(0x8ce4ff);v.frozen=true;}else if(v.frozen){v.sprite.clearTint();v.frozen=false;}
      v.shadow.setPosition(x,y).setDepth(y-1).setScale(Math.max(.4,1-z/200)).setAlpha(a.hp<=0?.1:.28);v.bar.clear().setDepth(y+1);if(a.id!==player.id&&!a.boss&&a.hp>0&&(a.hp<a.maxHp||Math.abs(a.x-player.x)<23000)){v.bar.fillStyle(0x1b263b,.8).fillRoundedRect(x-28,y-size*.9-z,56,6,3);v.bar.fillStyle(0xff9e77).fillRoundedRect(x-28,y-size*.9-z,56*a.hp/a.maxHp,6,3);}
      if(a.id===player.id)this.ground.lineStyle(2,gold,.55).strokeEllipse(x,y,56,17).fillStyle(gold,.9).fillTriangle(x-5,y+15,x+5,y+15,x,y+21);
      const catLeap=a.kind==='starpatch-cat'&&this.catKit&&a.action==='skill2'&&a.actionTick>=6&&a.actionTick<=31;
      if((catLeap||a.action==='run'||a.action==='skill1'&&(this.fighter(a)?.skills[0].kind==='dash'||!this.catKit))&&s.tick!==v.trailTick&&s.tick%4===0){v.trailTick=s.tick;if(catLeap||a.action==='skill1'&&['starpatch-cat','pudding-pig'].includes(a.kind))this.ghost(a,v);if(!catLeap)this.effect('dust',x-a.facing*20,y,earth,16,.3,0,-a.facing*30,-15);}this.actorFX(a);
    }
    this.consume();this.drawEffects(dt);this.drawMarks();this.drawFields();this.drawProjectiles();this.elemental?.draw(s,this.visualTime,dt);this.drawPickups();this.drawAmbient();this.arrow.setPosition((s.zone+1)*1280-110,465+Math.sin(this.visualTime*5)*8).setVisible(s.cleared&&s.zone<3&&s.mode==='campaign');const hits=s.mode==='pvp'?player.comboHits||0:s.comboHits,until=s.mode==='pvp'?player.comboUntil||0:s.comboUntil;this.comboText.setText(hits>1&&s.tick<until?`${hits} HITS\n${hits>=10?'SUPER COMBO':hits>=5?'GREAT COMBO':'COMBO'}`:'');if(s.tick-this.hudTick>=6||s.tick<this.hudTick){this.hudTick=s.tick;this.runtime.changed();}
  }
  private actorFX(a:Actor){const g=this.ground,x=a.x/100,y=a.y/100,color=this.color(a);if(a.id!==this.player.id&&a.action.startsWith('attack')&&a.actionTick<(a.windup||6)){const q=a.actionTick/(a.windup||6),alpha=.18+.12*Math.sin(this.visualTime*20);
    if(a.boss&&a.kind==='puppet'&&a.phase%2===0){const left=a.facing>0?x:x-370;g.fillStyle(red,alpha).fillRoundedRect(left,y-42,370,84,12).lineStyle(2,red,.8).strokeRoundedRect(left,y-42,370,84,12);for(let i=0;i<4;i++){const cx=x+a.facing*(65+i*75);g.lineStyle(3,gold,.6+q*.4).lineBetween(cx-a.facing*12,y-14,cx,y).lineBetween(cx,y,cx-a.facing*12,y+14);}}
    else{const shock=a.boss&&a.kind==='golem'&&a.phase%2===0,range=shock?420:a.boss?155:85;g.fillStyle(red,alpha).fillEllipse(x+(shock?0:a.facing*range*.5),y,range*2,shock?155:a.boss?105:52).lineStyle(3,red,.7).strokeEllipse(x+(shock?0:a.facing*range*.5),y,range*2,shock?155:a.boss?105:52);g.lineStyle(3,gold,.9).strokeEllipse(x,y,range*q*2,(shock?155:60)*q);}}
    if(a.action==='guard')g.lineStyle(3,blue,.7).strokeEllipse(x+a.facing*27,y-65,24,105);if(a.action==='skill1'&&a.actionTick>=10&&a.actionTick<28&&(this.fighter(a)?.skills[0].kind==='dash'||a.kind==='starpatch-cat'&&!this.catKit))g.lineStyle(4,color,.55).lineBetween(x-a.facing*120,y-25,x+a.facing*45,y-25).lineStyle(2,white,.8).lineBetween(x-a.facing*70,y-48,x+a.facing*35,y-48);
    const tick=this.runtime.state.tick;if(a.shield>0&&a.shieldUntil>tick)g.lineStyle(3,color,.65).strokeEllipse(x,y-65,90,145);if(a.hasteUntil>tick)g.lineStyle(2,color,.6).strokeEllipse(x,y,75,23);if(a.slowUntil>tick||a.rootUntil>tick)g.lineStyle(3,blue,.7).strokeEllipse(x,y,58,20);if(a.counterDamage&&a.counterUntil>tick)g.lineStyle(4,white,.8).beginPath().arc(x,y-65,66,Phaser.Math.DegToRad(a.facing>0?-65:115),Phaser.Math.DegToRad(a.facing>0?65:245)).strokePath();
    const kit=this.fighter(a)?.skills[a.skill];if(kit?.mechanic&&a.action.startsWith('skill')&&a.actionTick<Number(kit.windup||12)){const range=kit.range,depth=Number(kit.depth||35),col=a.team===this.player.team?color:red;g.fillStyle(col,.15).fillRoundedRect(a.facing>0?x:x-range,y-depth,range,depth*2,8).lineStyle(2,col,.6).strokeRoundedRect(a.facing>0?x:x-range,y-depth,range,depth*2,8);}
    if(a.readUntil>tick)g.lineStyle(2,0xf59bc3,.9).strokeCircle(x,y-170,12);
    if(a.starMarkUntil>this.runtime.state.tick&&a.hp>0)g.lineStyle(2,gold,.8).strokeEllipse(x,y,58,18);
  }
  private drawEffects(dt:number){const g=this.fx;g.clear();for(const e of this.effects){e.age+=dt;e.x+=e.vx*dt;e.y+=e.vy*dt;e.vy+=e.gravity*dt;const q=e.age/e.life,alpha=Math.max(0,1-q),size=e.size;if(e.sprite){const clip=this.runtime.assets.effects!.clips[e.kind];e.sprite.setFrame(clip.start+Math.min(clip.count-1,Math.floor(q*clip.count))).setPosition(e.x,e.y).setAlpha(alpha);if(q>=1)e.sprite.destroy();if(!['shock'].includes(e.kind))continue;}
    if(!['spark','flash','star','burst','ring','charge','dust','slash','shock','whirl','vortex'].includes(e.kind)){this.paintSpell(g,e.kind,e.x,e.y,e.color,size*(.6+q*.4),alpha,q,e.angle);continue;}
    if(e.kind==='spark')g.lineStyle(e.size,e.color,alpha).lineBetween(e.x,e.y,e.x-e.vx*.027,e.y-e.vy*.027);
    else if(e.kind==='flash')g.fillStyle(e.color,alpha*alpha*.9).fillCircle(e.x,e.y,size*(.5+q));
    else if(e.kind==='star'){for(let n=0;n<2;n++){g.lineStyle(n?2:4,e.color,alpha*(n?.4:.9)).beginPath();for(let i=0;i<=10;i++){const angle=-Math.PI/2+i*Math.PI/5+q*.6,r=(i%2?.4:1)*size*(.4+q*.5)*(n?1.4:1),x=e.x+Math.cos(angle)*r,y=e.y+Math.sin(angle)*r;i?g.lineTo(x,y):g.moveTo(x,y);}g.strokePath();}}
    else if(e.kind==='burst'){for(let i=0;i<8;i++){const a=i*Math.PI/4+.15,inner=size*.15,outer=size*(.4+q);g.fillStyle(e.color,alpha).fillTriangle(e.x+Math.cos(a-.12)*inner,e.y+Math.sin(a-.12)*inner,e.x+Math.cos(a)*outer,e.y+Math.sin(a)*outer,e.x+Math.cos(a+.12)*inner,e.y+Math.sin(a+.12)*inner);}}
    else if(['ring','charge'].includes(e.kind))g.lineStyle(2+alpha*5,e.color,alpha*.8).strokeCircle(e.x,e.y,size*(e.kind==='charge'?1-q*.7:.2+q));
    else if(e.kind==='dust'){for(let i=0;i<4;i++)g.fillStyle(e.color,alpha*.3).fillEllipse(e.x+(i-1.5)*size*q,e.y-size*q*.3,size*(.3+q*.6),size*(.14+q*.3));}
    else if(e.kind==='slash'){for(let n=0;n<3;n++){g.lineStyle((3-n)*4,e.color,alpha*(.7-n*.15)).beginPath();for(let i=0;i<=18;i++){const a=-1.35+i/18*2.7,px=e.x+e.angle*Math.cos(a)*size*(.35+q*.7),py=e.y+Math.sin(a)*size*.6;i?g.lineTo(px,py):g.moveTo(px,py);}g.strokePath();}}
    else if(e.kind==='shock'){for(let n=0;n<3;n++){const wave=Math.max(0,q-n*.13);g.lineStyle(7*(1-wave),e.color,alpha*.8).strokeEllipse(e.x,e.y,size*2*wave,size*.65*wave);}for(let i=0;i<14;i++){const a=i*2.4,r=size*q;g.fillStyle(i%2?earth:e.color,alpha*.8).fillTriangle(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r*.3-22*Math.sin(q*Math.PI),e.x+Math.cos(a)*r+5,e.y+Math.sin(a)*r*.3,e.x+Math.cos(a)*r-7,e.y+Math.sin(a)*r*.3);}}
    else if(['whirl','vortex'].includes(e.kind)){for(let i=0;i<5;i++){const r=size*(.45+i*.12),cy=e.y+(e.kind==='vortex'?(i-2)*21:0);g.lineStyle(5-i*.5,e.color,alpha*.7).strokeEllipse(e.x,cy,r*2,r*.35);const a=this.visualTime*16+i*1.5;g.fillStyle(white,alpha).fillEllipse(e.x+Math.cos(a)*r,cy+Math.sin(a)*r*.17,18,7);}}
  }this.effects=this.effects.filter(e=>e.age<e.life);}
  private drawMarks(){const g=this.fx;for(const a of this.runtime.state.actors){if(a.hp<=0||a.starMarkUntil<=this.runtime.state.tick||!a.starMarkUntil)continue;const size=a.boss&&!a.dummy?246:a.dummy?190:this.runtime.assets.fighters[a.kind]?180:166,x=a.x/100,y=a.y/100-a.z/100-size*.9-22,r=12;g.fillStyle(0x252445,.8).fillCircle(x,y,17).lineStyle(2,0xd9baff,1).beginPath();for(let i=0;i<=10;i++){const angle=-Math.PI/2+i*Math.PI/5,radius=i%2?r*.45:r,px=x+Math.cos(angle)*radius,py=y+Math.sin(angle)*radius;i?g.lineTo(px,py):g.moveTo(px,py);}g.strokePath();}}
  private drawProjectiles(){const g=this.fx,alive=new Set(this.runtime.state.projectiles.map(p=>p.id));for(const [id,v] of this.bolts)if(!alive.has(id)){v.destroy();this.bolts.delete(id);}for(const p of this.runtime.state.projectiles){if(p.skill?.element)continue;const x=p.x/100,y=p.y/100-p.z/100,dir=Math.sign(p.dx),owner=this.runtime.state.actors.find(a=>a.id===p.owner),color=p.ability?this.color(owner):p.team===this.player.team?blue:red;if(p.ability){this.paintSpell(g,p.style,x,y,color,(p.skill.splash?35:20)*this.rarityScale(owner),1,this.visualTime*3,dir);g.lineStyle(2,color,.5).lineBetween(x-dir*20,y,x-dir*55,y);continue;}if(p.ground){for(let i=0;i<4;i++){const xx=x-dir*i*12;g.fillStyle(i%2?color:white,.8-i*.15).fillTriangle(xx-13,y,xx,y-42-i%2*12,xx+18,y);}}
    else{const clip=this.runtime.assets.effects?.clips.bolt;if(clip){let image=this.bolts.get(p.id);if(!image){image=this.add.image(x,y,'brawl-vfx',clip.start).setDepth(9999);this.bolts.set(p.id,image);}image.setFrame(clip.start+2+Math.floor(this.visualTime*15)%4).setDisplaySize(150,90).setFlipX(dir<0).setOrigin(dir<0?.28:.72,.5).setPosition(x,y);continue;}g.fillStyle(color,.16).fillEllipse(x-dir*32,y,132,45).fillStyle(color,.4).fillEllipse(x-dir*14,y,78,30).fillStyle(color,.9).fillEllipse(x,y,46,28).fillStyle(white,.95).fillEllipse(x+dir*8,y-2,25,16);for(let i=0;i<3;i++)g.lineStyle(2,color,.7-i*.15).lineBetween(x-dir*(36+i*15),y-12+i*10,x-dir*(80+i*12),y-12+i*10);}}}
  private paintSpell(g:Phaser.GameObjects.Graphics,kind:string,x:number,y:number,color:number,size:number,alpha:number,q:number,dir=1){
    g.fillStyle(color,alpha*.14).fillCircle(x,y,Math.min(size,130));
    if(kind==='beam'||kind==='stretch'){
      const end=x+dir*size;g.lineStyle(kind==='beam'?26:15,color,alpha*.35).lineBetween(x,y,end,y).lineStyle(kind==='beam'?12:7,color,alpha).lineBetween(x,y,end,y).lineStyle(3,white,alpha).lineBetween(x,y,end,y);if(kind==='stretch')g.fillStyle(color,alpha).fillCircle(end,y,17);
    }else if(kind==='electric'||kind==='lightning'){
      const angle=kind==='lightning'?dir:-Math.PI/2,length=kind==='lightning'?size:size*1.8;
      for(let layer=0;layer<2;layer++){g.lineStyle(layer?2:6,layer?white:color,alpha).beginPath();for(let i=0;i<=8;i++){const d=i/8*length,j=i===0||i===8?0:Math.sin(i*2.4+q*8)*size*.13,px=x+Math.cos(angle)*d-Math.sin(angle)*j,py=y+Math.sin(angle)*d+Math.cos(angle)*j;i?g.lineTo(px,py):g.moveTo(px,py);}g.strokePath();}
    }else if(kind==='ball'){
      g.fillStyle(white,alpha).fillCircle(x,y,size*.65).lineStyle(3,color,alpha).strokeCircle(x,y,size*.65).fillStyle(color,alpha);for(let i=0;i<5;i++){const a=q+i*Math.PI*.4;g.fillCircle(x+Math.cos(a)*size*.36,y+Math.sin(a)*size*.36,size*.13);}g.fillCircle(x,y,size*.2);
    }else if(kind==='bubble'||kind==='shield'||kind==='portal'||kind==='psychic'){
      const height=kind==='portal'?size*1.6:size*1.3,width=kind==='portal'?size*.85:size*1.3;g.lineStyle(3,color,alpha).strokeEllipse(x,y,width,height).lineStyle(1,white,alpha*.8).strokeEllipse(x-size*.08,y-size*.08,width*.85,height*.85);g.fillStyle(white,alpha*.8).fillEllipse(x-size*.24,y-size*.29,size*.18,size*.09);if(kind==='psychic')g.lineStyle(2,color,alpha).strokeEllipse(x,y,size*1.8,size*.55);
    }else if(kind==='heart'){
      const r=size*.32;g.fillStyle(color,alpha).fillCircle(x-r*.5,y-r*.2,r).fillCircle(x+r*.5,y-r*.2,r).fillTriangle(x-r*1.45,y,x+r*1.45,y,x,y+r*2);
    }else if(kind==='ice'){
      for(let n=0;n<6;n++){const a=n*Math.PI/3+q*.3,ex=x+Math.cos(a)*size*.65,ey=y+Math.sin(a)*size*.65;g.lineStyle(3,white,alpha).lineBetween(x,y,ex,ey);for(const sign of [-1,1]){const b=a+sign*.7;g.lineStyle(2,color,alpha).lineBetween(x+Math.cos(a)*size*.4,y+Math.sin(a)*size*.4,x+Math.cos(a)*size*.4-Math.cos(b)*size*.2,y+Math.sin(a)*size*.4-Math.sin(b)*size*.2);}}
    }else if(kind==='leaves'){
      for(let n=0;n<3;n++){const a=q*3+n*2.1,cx=x+Math.cos(a)*size*.45,cy=y+Math.sin(a)*size*.35;g.fillStyle(color,alpha).fillEllipse(cx,cy,size*.45,size*.19).lineStyle(1,white,alpha*.6).lineBetween(cx-size*.2,cy,cx+size*.2,cy);}
    }else if(kind==='flame'){
      for(let n=0;n<5;n++){const dx=(n-2)*size*.25,tip=y-size*(.6+Math.sin(q*5+n)*.2);g.fillStyle(color,alpha*.8).fillTriangle(x+dx-size*.2,y+size*.3,x+dx,tip,x+dx+size*.2,y+size*.3);g.fillStyle(white,alpha*.7).fillTriangle(x+dx-size*.08,y+size*.2,x+dx,tip+size*.35,x+dx+size*.08,y+size*.2);}
    }else if(kind==='ribbon'){
      g.fillStyle(color,alpha).fillTriangle(x,y,x-size*.8,y-size*.45,x-size*.8,y+size*.45).fillTriangle(x,y,x+size*.8,y-size*.45,x+size*.8,y+size*.45).fillCircle(x,y,size*.2);
    }else if(kind==='crescent'){
      for(let n=0;n<3;n++)g.lineStyle(7-n*2,n===0?white:color,alpha*(1-n*.2)).beginPath().arc(x,y,size*(.4+n*.15),q-.8,q+2.1).strokePath();
    }else if(['spiral','ki','cosmic','wave','elastic'].includes(kind)){
      for(let n=0;n<3;n++){g.lineStyle(n===0?4:2,n===0?white:color,alpha*(1-n*.22)).beginPath();for(let i=0;i<=32;i++){const a=q*6+i*.3+n*2,r=kind==='wave'?size*(.35+n*.2):size*i/40,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r*(kind==='wave'?.35:1);i?g.lineTo(px,py):g.moveTo(px,py);}g.strokePath();}
    }else if(kind==='smoke'){
      for(let n=0;n<6;n++)g.fillStyle(color,alpha*.3).fillCircle(x+Math.cos(n)*size*.4,y+Math.sin(n)*size*.25,size*.3);
    }else{
      for(let n=0;n<8;n++){const a=n*Math.PI/4+q;g.lineStyle(n%2?3:5,n%2?white:color,alpha).lineBetween(x+Math.cos(a)*size*.2,y+Math.sin(a)*size*.2,x+Math.cos(a)*size*.75,y+Math.sin(a)*size*.75);}
    }
  }
  private clones=new Map<number,Phaser.GameObjects.Image>();
  private drawFields(){const s=this.runtime.state,g=this.fx,alive=new Set<number>();for(const f of s.fields||[]){const owner=s.actors.find(a=>a.id===f.owner);if(!owner)continue;const x=f.x/100,y=f.y/100,color=this.color(owner),armed=s.tick>=f.starts,q=Math.max(0,1-(f.starts-s.tick)/Math.max(1,f.skill.arm||1));g.lineStyle(2,owner.team===this.player.team?color:red,.7).strokeEllipse(x,y,f.radius*2,f.radius*.7).fillStyle(color,armed?.15:.08).fillEllipse(x,y,f.radius*2*q,f.radius*.7*q);
      if(f.mechanic==='clones'){alive.add(f.id);const frame=this.frame({...owner,action:'walk',moveTick:s.tick}),asset=this.runtime.assets.fighters[owner.kind];let clone=this.clones.get(f.id);if(!clone){clone=this.add.image(x,y,frame.key,frame.frame);this.clones.set(f.id,clone);}clone.setTexture(frame.key,frame.frame).setOrigin(.5,asset?.originY||.9).setDisplaySize(170,170).setAlpha(.4).setTint(color).setFlipX(f.facing<0).setPosition(x,y).setDepth(y);}
      else if(!f.skill.element)this.paintSpell(g,f.effect,x,y-15,color,f.radius*.4,armed?.6:.35,this.visualTime,1);
    }for(const [id,image] of this.clones)if(!alive.has(id)){image.destroy();this.clones.delete(id);}}
  private drawPickups(){const g=this.fx;for(const item of this.runtime.state.pickups||[]){const x=item.x/100,y=item.y/100-22+Math.sin(this.visualTime*4+item.id)*5,color=item.kind==='health'?0x9bffac:blue;g.fillStyle(color,.15).fillCircle(x,y,26).lineStyle(2,color,.8).strokeCircle(x,y,18).fillStyle(color,1);if(item.kind==='health')g.fillRoundedRect(x-12,y-4,24,8,2).fillRoundedRect(x-4,y-12,8,24,2);else g.fillTriangle(x-9,y,x,y-13,x+9,y).fillTriangle(x-9,y,x,y+13,x+9,y);}}
  private drawAmbient(){const g=this.ambient,s=this.runtime.state;g.clear();const cave=s.stageId==='starcrystal-cave',forest=s.stageId==='windbell-forest';for(let i=0;i<35;i++){const x=(i*163+Math.sin(i+this.visualTime*.3)*35)%5120,y=180+i%7*42+Math.sin(this.visualTime*.7+i)*15;g.fillStyle(cave?blue:forest?0xfff4a0:0xffffff,.2+.15*Math.sin(this.visualTime*2+i)).fillCircle(x,y,cave?2:1.5);}}
}
