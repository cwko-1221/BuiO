import Phaser from 'phaser';
import {FLIGHT_CRAFT,moveGamePlayer,type CraftId,type GameKind,type GameState,type GameEntity,type GameEffect} from '../../lib/park-games.mjs';
import {PetAvatar} from '../game/PetAvatar';
import {petForDisplay} from '../game/petDisplay';
import type {Bootstrap,PetInstance} from '../types';
import type {ParkClient} from './client';
import art from './sky-art-assets.json';
import {audio} from '../audio';

export type SkyArtKey=keyof typeof art.assets;
export const skyUrl=(key:SkyArtKey)=>'/pet/assets/art/park/sky-patrol-v2/'+art.assets[key].file;
const key=(id:string)=>'park:sky:v2:'+id;
export interface MiniSceneHost {layout(w:number,h:number,top:number):void;artReady():void;failed(message:string):void;craft:CraftId}
export interface MiniSceneOptions {bootstrap:Bootstrap;pet:PetInstance;client:ParkClient;english:boolean}
interface Particle {image:Phaser.GameObjects.Image;x:number;y:number;vx:number;vy:number;born:number;life:number;size:number;alpha:number;spin:number;grow:number}
export class MiniGameScene extends Phaser.Scene {
  state?:GameState;session='';shield=false;special=false;
  readonly reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches||localStorage.getItem('pet-reduced-motion')==='1';
  readonly touchDevice=navigator.maxTouchPoints>0||matchMedia('(pointer: coarse)').matches;
  private pet?:PetAvatar;private plane?:Phaser.GameObjects.Image;private basket?:Phaser.GameObjects.Image;private pilotMask?:Phaser.GameObjects.Graphics;
  private field?:Phaser.GameObjects.Image;private graphics?:Phaser.GameObjects.Graphics;private engines:Phaser.GameObjects.Image[]=[];private clouds:Phaser.GameObjects.Image[]=[];
  private views=new Map<number,Phaser.GameObjects.Image>();private particles:Particle[]=[];private lastEvent=0;private failures:string[]=[];
  private keys?:Record<string,Phaser.Input.Keyboard.Key>;private target?:{x:number;y:number};private lastInput=0;private lastPlayerX=240;private receivedAt=0;
  private localPlayer?:{x:number;y:number};private drag?:{id:number;x:number;y:number};private pointerEvents=new AbortController();
  private inputSeq=0;private shieldPress=0;private specialPress=0;private actionHeld=0;
  private freeParticles:Particle[]=[];private alive=new Set<number>();private wasPaused=false;
  private motion=new Map<number,{x:number;y:number;vx:number;vy:number;at:number}>();
  constructor(private panel:MiniSceneHost,private options:MiniSceneOptions,private kind:GameKind){super('ParkMiniGame');}
  preload(){
    this.failures=[];(window as any).BuiLoading?.watchScene(this,{recoverOnError:false});
    const wanted:SkyArtKey[]=this.kind==='flight'?['swift','petal','nova','scout','interceptor','bomber','boss','valley','cloud']:['grove','basket','cloud'];
    for(const id of wanted)if(!this.textures.exists(key(id)))this.load.image(key(id),skyUrl(id));
    const failed=(file:Phaser.Loader.File)=>this.failures.push(file.key);this.load.on('loaderror',failed);this.load.once('complete',()=>this.load.off('loaderror',failed));
  }
  create(){
    const touch=this.input.manager.touch,touchEnabled=touch?.enabled;let cleaned=false;
    const clean=()=>{if(cleaned)return;cleaned=true;if(touch&&touchEnabled!==undefined)touch.enabled=touchEnabled;this.pointerEvents.abort();this.releaseDrag();this.scale?.off('resize',this.resize,this);this.pilotMask?.destroy();this.views.clear();this.motion.clear();this.particles=[];this.freeParticles=[];this.pet=undefined;};
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,clean);this.events.once(Phaser.Scenes.Events.DESTROY,clean);
    if(this.failures.length){this.panel.failed(this.options.english?'Some artwork could not load. Retry the artwork.':'部分遊戲圖片未能載入，請重試圖片。');return;}
    // Native pointer capture owns the mini-game's touch lifecycle. Suspending
    // Phaser's duplicate touch path also avoids cancelling non-cancelable events.
    if(touch)touch.enabled=false;
    this.cameras.main.setBackgroundColor('#173b3f');this.makeTextures();
    this.field=this.add.image(240,this.kind==='flight'?180:360,key(this.kind==='flight'?'valley':'grove')).setDepth(-20);
    this.field.setDisplaySize(this.kind==='flight'?720:480,this.kind==='flight'?1080:720);
    if(this.kind==='flight')this.add.rectangle(240,360,480,720,0x0d2938,.22).setDepth(-19);
    if(this.kind==='flight')for(let i=0;i<(this.touchDevice?3:5);i++){const cloud=this.add.image(i%2?375:90,i*210,key('cloud')).setDisplaySize(320+i%3*65,95+i%3*16).setAlpha(i%2?.16:.22).setDepth(i<3?-12:7);this.clouds.push(cloud);}
    this.graphics=this.add.graphics().setDepth(6);
    const pet=petForDisplay(this.options.pet),catalog=this.options.bootstrap.catalog,definition=catalog.pets.find(p=>p.id===pet.speciesId)!;
    this.pet=new PetAvatar(this,240,kindPetY(this.kind),definition,pet,{scale:this.kind==='flight'?.14:.4,layout:catalog.animationByPet?.[definition.id]??catalog.animation,fallbackTexture:'park:pet:'+definition.id,wearables:catalog.wearables,outfitAtlases:catalog.outfitAtlases,redrawnWearables:catalog.redrawnWearables});
    this.pet.play('idle','front');this.pet.setDepth(5);
    if(this.kind==='flight'){
      this.plane=this.add.image(240,628,key(this.panel.craft)).setDepth(4);this.selectCraft(this.panel.craft);
    this.pilotMask=this.make.graphics({x:0,y:0},false);this.pet.setMask(this.pilotMask.createGeometryMask());
      for(let i=0;i<2;i++)this.engines.push(this.add.image(240,660,'sky-fx-glow').setTint(0x8cecff).setBlendMode(Phaser.BlendModes.ADD).setDepth(3));
    }else this.basket=this.add.image(240,660,key('basket')).setDisplaySize(104,60).setDepth(6);
    this.keys=this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE,X')as Record<string,Phaser.Input.Keyboard.Key>;
    this.input.keyboard?.on('keydown-SPACE',(event:KeyboardEvent)=>event.preventDefault());
    this.bindPointer();
    this.resize();this.scale.on('resize',this.resize,this);this.panel.artReady();
  }
  selectCraft(craft:CraftId){if(this.plane){this.plane.setTexture(key(craft));this.plane.setScale((craft==='petal'?96:86)/this.plane.width);}this.engines.forEach(e=>e.setTint(FLIGHT_CRAFT[craft].color));}
  private bindPointer(){
    const canvas=this.game.canvas,signal=this.pointerEvents.signal;
    const point=(e:PointerEvent)=>{const r=canvas.getBoundingClientRect();return this.cameras.main.getWorldPoint((e.clientX-r.left)*this.scale.width/r.width,(e.clientY-r.top)*this.scale.height/r.height);};
    const playing=()=>this.session&&this.state?.status==='playing'&&!this.state.paused;
    const aim=(x:number,y:number)=>{this.target=moveGamePlayer(this.kind,this.panel.craft,this.localPlayer||this.state!.player,{x,y});this.localPlayer={...this.target};};
    canvas.addEventListener('pointerdown',e=>{
      if(!playing()||this.drag)return;const p=point(e);if(p.x<0||p.x>480||p.y<0||p.y>720)return;
      e.preventDefault();canvas.setPointerCapture(e.pointerId);
      if(e.pointerType==='mouse')aim(p.x,p.y);else this.drag={id:e.pointerId,x:p.x,y:p.y};
    },{signal,passive:false});
    canvas.addEventListener('pointermove',e=>{
      if(!playing())return;const p=point(e);
      if(this.drag?.id===e.pointerId){e.preventDefault();const from=this.localPlayer||this.state!.player;aim(from.x+p.x-this.drag.x,from.y+p.y-this.drag.y);this.drag.x=p.x;this.drag.y=p.y;}
      else if(e.pointerType==='mouse'&&!this.drag&&p.x>=0&&p.x<=480&&p.y>=0&&p.y<=720)aim(p.x,p.y);
    },{signal,passive:false});
    const end=(e:PointerEvent)=>{if(this.drag?.id===e.pointerId)this.releaseDrag();else if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);};
    canvas.addEventListener('pointerup',end,{signal});canvas.addEventListener('pointercancel',end,{signal});
    canvas.addEventListener('lostpointercapture',e=>{if(this.drag?.id===e.pointerId)this.drag=undefined;},{signal});
  }
  private releaseDrag(){const id=this.drag?.id;this.drag=undefined;if(id!==undefined&&this.game.canvas.hasPointerCapture(id))this.game.canvas.releasePointerCapture(id);}
  private controls(time:number,delta:number){
    const s=this.state;if(!s||!this.session||s.paused||s.status!=='playing')return;
    const mask=(this.keys?.A.isDown||this.keys?.LEFT.isDown?1:0)|(this.keys?.D.isDown||this.keys?.RIGHT.isDown?2:0)|(this.keys?.W.isDown||this.keys?.UP.isDown?4:0)|(this.keys?.S.isDown||this.keys?.DOWN.isDown?8:0);
    const held=(this.keys?.SPACE.isDown?16:0)|(this.keys?.X.isDown?32:0);
    if(this.shield||held&16&&!(this.actionHeld&16))this.shieldPress++;
    if(this.special||held&32&&!(this.actionHeld&32))this.specialPress++;
    this.shield=false;this.special=false;this.actionHeld=held;
    this.localPlayer=moveGamePlayer(this.kind,s.craft,this.localPlayer||s.player,{mask,x:this.target?.x,y:this.target?.y},Math.min(delta/1000,.05));
    if(mask)this.target={...this.localPlayer};
    if(time-this.lastInput>=50){this.lastInput=time;this.options.client.gameInput(this.session,{seq:++this.inputSeq,mask,x:this.localPlayer.x,y:this.localPlayer.y,shieldPress:this.shieldPress,specialPress:this.specialPress});}
  }
  private resize(){
    if(!this.cameras?.main)return;
    this.releaseDrag();
    const short=this.scale.height<500,top=short?48:54,bottom=short?48:58,available=Math.max(150,this.scale.height-top-bottom),height=Math.min(available,(this.scale.width-8)*1.5),width=height*2/3;
    const y=top+(available-height)/2;this.cameras.main.setViewport((this.scale.width-width)/2,y,width,height).setZoom(width/480).centerOn(240,360);this.panel.layout(width,height,y);
  }
  private makeTextures(){
    if(!this.textures.exists('sky-fx-glow')){const texture=this.textures.createCanvas('sky-fx-glow',96,96)!,c=texture.context,g=c.createRadialGradient(48,48,0,48,48,48);g.addColorStop(0,'#ffffff');g.addColorStop(.15,'#ffffffee');g.addColorStop(.4,'#ffffff50');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,96,96);texture.refresh();}
    for(const type of ['pulse','petal','lance','missile','beam','ember','orb','ring','pickup'])if(!this.textures.exists('sky-fx-'+type)){
      const texture=this.textures.createCanvas('sky-fx-'+type,64,96)!,c=texture.context;c.translate(32,48);
      c.shadowColor='#ffffff';c.shadowBlur=type==='pickup'?0:10;c.fillStyle='#fffcef';c.strokeStyle='#fffcef';c.lineWidth=4;
      if(type==='petal'){c.beginPath();c.moveTo(0,-31);c.bezierCurveTo(27,-9,13,21,0,32);c.bezierCurveTo(-13,21,-27,-9,0,-31);c.fill();c.stroke();}
      else if(type==='missile'){c.fillRect(-6,-24,12,43);c.beginPath();c.moveTo(0,-37);c.lineTo(8,-20);c.lineTo(-8,-20);c.fill();c.beginPath();c.moveTo(-6,8);c.lineTo(-17,27);c.lineTo(0,20);c.lineTo(17,27);c.lineTo(6,8);c.fill();}
      else if(type==='orb'||type==='ring'){c.shadowColor='#ff8b69';c.strokeStyle='#f87b69';c.fillStyle='#fff2c3';c.beginPath();c.arc(0,0,15,0,Math.PI*2);if(type==='orb'){c.fill();c.stroke();}else{c.lineWidth=7;c.stroke();}}
      else if(type==='pickup'){c.fillStyle='#173e48';c.beginPath();c.roundRect(-27,-28,54,56,13);c.fill();c.strokeStyle='#fff3ca';c.lineWidth=3;c.stroke();}
      else{c.beginPath();c.roundRect(type==='beam'?-11:-5,-39,type==='beam'?22:10,78,6);if(type==='ember'){c.fillStyle='#fff1c5';c.strokeStyle='#f38965';}c.fill();if(type==='ember')c.stroke();}texture.refresh();
    }
  }
  setState(state:GameState){
    if(this.state&&state.tick<this.state.tick)return;
    if(!this.localPlayer||state.paused||state.status==='ended')this.localPlayer={...state.player};
    const alive=this.alive;alive.clear();
    for(const entities of [state.fruit,state.enemies,state.shots,state.sparks,state.pickups])for(const e of entities){alive.add(e.id);const old=this.motion.get(e.id),dt=old?state.t-old.at:0;this.motion.set(e.id,{x:e.x,y:e.y,at:state.t,vx:e.vx??(dt>0?(e.x-old!.x)/dt:0),vy:e.vy??(dt>0?(e.y-old!.y)/dt:0)});}
    for(const id of this.motion.keys())if(!alive.has(id))this.motion.delete(id);
    this.state=state;this.receivedAt=performance.now();
  }
  resetRun(){this.releaseDrag();this.state=undefined;this.localPlayer=undefined;this.target=undefined;this.inputSeq=0;this.shieldPress=0;this.specialPress=0;this.actionHeld=0;this.lastInput=0;this.lastEvent=0;this.motion.clear();for(const view of this.views.values())view.destroy();this.views.clear();for(const p of [...this.particles,...this.freeParticles])p.image.destroy();this.particles=[];this.freeParticles=[];}
  clearControls(){this.releaseDrag();this.input.keyboard?.resetKeys();this.shield=false;this.special=false;this.actionHeld=0;this.shieldPress=this.state?.shieldPress||0;this.specialPress=this.state?.specialPress||0;this.localPlayer=this.state?{...this.state.player}:undefined;this.target=this.localPlayer?{...this.localPlayer}:undefined;}
  private particle(texture:string,x:number,y:number,color:number,size:number,life:number,vx=0,vy=0,alpha=1,grow=1,spin=0){
    if(this.particles.length>=(this.touchDevice?120:220))return;
    const reused=this.freeParticles.pop(),image=reused?.image||this.add.image(x,y,texture).setDepth(9);
    image.setTexture(texture).setPosition(x,y).setTint(color).setAlpha(alpha).setRotation(0).setActive(true).setVisible(true).setBlendMode(texture==='sky-fx-glow'?Phaser.BlendModes.ADD:Phaser.BlendModes.NORMAL);
    const particle=reused||{image,x,y,vx,vy,born:0,life,size,alpha,grow,spin};Object.assign(particle,{x,y,vx,vy,born:this.state?.t||0,life,size,alpha,grow,spin});this.particles.push(particle);
  }
  private burst(e:GameEffect){
    const reduced=this.reducedMotion,n=e.type==='explode'?(reduced?5:12)*Math.min(e.amount,2):e.type==='special'?(reduced?8:25):e.type==='catch'?6:3;
    const color=e.type==='hurt'?0xffa19b:e.type==='pickup'||e.type==='catch'?0xffe5a0:e.type==='special'?FLIGHT_CRAFT[this.state!.craft].color:0xffbd72;
    if(e.type==='explode'){
      this.particle('sky-fx-glow',e.x,e.y,0xffd79b,e.amount===3?150:75,.36,0,0,1,2);
      for(let i=0;i<(reduced?2:5);i++)this.particle(key('cloud'),e.x+(i-2)*8,e.y,0x6a7774,e.amount===3?100:43,.95,(i-2)*17,-18,.55,2.4,(i-2)*.12);
    }
    for(let i=0;i<n;i++){const a=i*2.399963+e.id,r=35+(i%5)*20;this.particle('sky-fx-glow',e.x,e.y,color,e.type==='special'?24:12,.25+(i%4)*.12,Math.cos(a)*r,Math.sin(a)*r,.9,.05);}
    if(!reduced&&!this.touchDevice&&e.type==='hurt')this.cameras.main.shake(110,.0025);
    if(e.type==='pickup'||e.type==='catch'){
      const text=this.add.text(e.x,e.y-15,e.type==='catch'?'+'+e.amount:({power:'POWER ↑',repair:'+♥',energy:'ENERGY +',shield:'SHIELD +'})[e.kind]||'+',{fontFamily:'sans-serif',fontSize:'15px',fontStyle:'bold',color:'#fff6ce',stroke:'#254a42',strokeThickness:3}).setOrigin(.5).setDepth(12);
      this.tweens.add({targets:text,y:e.y-52,alpha:0,duration:650,onComplete:()=>text.destroy()});
    }
  }
  private processEffects(){
    const s=this.state!;for(const e of s.effects){if(e.id<=this.lastEvent)continue;this.lastEvent=e.id;const pan=(e.x-240)/360;
      if(e.type==='fire'){audio.sky(e.kind,pan,.3);this.particle('sky-fx-glow',e.x,e.y,FLIGHT_CRAFT[s.craft].color,35,.075);}
      else if(e.type==='enemy-fire'){audio.sky('enemy',pan,.25);this.particle('sky-fx-glow',e.x,e.y,0xffb28c,24,.09);}
      else if(e.type==='rocket')audio.sky('rocket',pan,.35);
      else if(e.type==='hit'){audio.sky('hit',pan,.25);this.burst(e);let hit:Phaser.GameObjects.Image|undefined,distance=95*95;for(const view of this.views.values())if(view.getData('type')==='enemy'){const d=(view.x-e.x)**2+(view.y-e.y)**2;if(d<distance){hit=view;distance=d;}}hit?.setData('hitUntil',performance.now()+55);}
      else if(e.type==='explode'){audio.sky(e.kind==='boss'?'boss':'explode',pan,e.kind==='boss'?1:.6);this.burst(e);}
      else if(e.type==='catch'){audio.sky(e.kind==='gold'?'gold':'catch',pan,.6);this.burst(e);this.pet?.play('happy','front');}
      else if(e.type==='pickup'||e.type==='shield'||e.type==='hurt'||e.type==='special'){audio.sky(e.type,pan,.7);this.burst(e);}
      else if(e.type==='warning'||e.type==='boss'||e.type==='boss-phase')audio.sky('warning',0,.6);
      else if(e.type==='clear')audio.sky('victory',0,.9);
      if(e.type==='wave'||e.type==='boss'){const text=this.add.text(240,e.type==='boss'?265:290,e.type==='boss'?(this.options.english?'STORM ARK':'暴風方舟'):this.options.english?'WAVE '+e.amount:'第 '+e.amount+' 波',{fontFamily:'"Microsoft JhengHei",sans-serif',fontSize:'24px',fontStyle:'bold',color:e.type==='boss'?'#ffcfaa':'#f5f2d3',stroke:'#183c46',strokeThickness:5,letterSpacing:3}).setResolution(2).setOrigin(.5).setDepth(14);this.tweens.add({targets:text,y:text.y-20,alpha:0,delay:550,duration:650,onComplete:()=>text.destroy()});}
    }
  }
  private entity(e:GameEntity,type:string,blend:number,elapsed:number){
    let view=this.views.get(e.id);if(!view){
      const texture=type==='enemy'?key(e.kind||'scout'):type==='fruit'?e.kind==='acorn'?'park:world:acorn':'park:adventure:banana':'sky-fx-'+(type==='pickup'?'pickup':e.kind||'pulse');
      view=this.add.image(e.x,e.y,texture).setDepth(type==='enemy'?2:type==='fruit'?3:type==='pickup'?4:5).setData('type',type);this.views.set(e.id,view);
      const width=type==='enemy'?e.boss?222:e.kind==='bomber'?88:e.kind==='interceptor'?65:49:type==='fruit'?e.kind==='acorn'?33:e.kind==='gold'?59:49:type==='pickup'?31:type==='shot'?e.kind==='lance'?8:e.kind==='beam'?30:e.kind==='missile'?10:8:e.kind==='orb'?13:10;
      view.setScale(width/view.width);if(type==='shot')view.setTint(FLIGHT_CRAFT[this.state!.craft].color).setBlendMode(Phaser.BlendModes.ADD);if(e.kind==='gold')view.setTint(0xffd65d);
      if(type==='shot')view.setDisplaySize(width,e.kind==='beam'?130:e.kind==='lance'?45:e.kind==='petal'?23:e.kind==='missile'?28:32);
    }
    const motion=this.motion.get(e.id),previous=view.x;
    view.x+=(e.x+(motion?.vx||0)*elapsed-view.x)*blend;view.y+=(e.y+(motion?.vy||0)*elapsed-view.y)*blend;
    if(type==='enemy'){view.angle=Phaser.Math.Clamp((view.x-previous)*.8,-9,9);if(!this.reducedMotion&&(view.getData('hitUntil')||0)>performance.now())view.setTint(0x30382b).setTintMode(Phaser.TintModes.ADD);else view.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);}
    if(type==='shot'||type==='spark')view.rotation=Math.atan2(e.vx||0,-(e.vy||-1));
    if(type==='fruit')view.rotation=Math.sin((this.state!.t-e.id)*2)*.14;
    if(type==='pickup'){
      const symbol=({power:'P',repair:'+',energy:'E',shield:'S'})[e.kind||'power']||'P';
      this.graphics!.lineStyle(1,0xffedb8,.7).strokeCircle(view.x,view.y,20);view.setTint(e.kind==='repair'?0xc2f1bd:e.kind==='energy'?0x9ce5ff:0xffe6a0);
      // Small symbols are fixed artwork textures, generated once and reused.
      const symbolKey='sky-pickup-'+symbol;if(!this.textures.exists(symbolKey)){const texture=this.textures.createCanvas(symbolKey,64,96)!,c=texture.context;c.drawImage(this.textures.get('sky-fx-pickup').getSourceImage()as HTMLImageElement,0,0);c.font='bold 28px sans-serif';c.textAlign='center';c.fillStyle='#fff4cf';c.fillText(symbol,32,59);texture.refresh();}if(view.texture.key!==symbolKey)view.setTexture(symbolKey);
    }
    if(type==='shot'&&e.kind==='missile'&&!this.reducedMotion&&!this.state!.paused&&this.state!.t-(view.getData('trailAt')||-1)>.05){view.setData('trailAt',this.state!.t);this.particle('sky-fx-glow',view.x,view.y+8,0xffd39c,12,.18,0,50,.55,.05);}
  }
  update(time:number,delta:number){
    if(!this.pet||!this.graphics)return;this.controls(time,delta);
    const s=this.state,elapsed=s&&!s.paused&&s.status==='playing'?Math.min(.09,(performance.now()-this.receivedAt)/1000):0,t=s?s.t+elapsed:(this.reducedMotion?0:time/1000),blend=1-Math.exp(-Math.min(delta,100)/25),p=this.localPlayer||s?.player||{x:240,y:580};
    this.graphics.clear();
    if(this.kind==='flight'&&this.plane){
      if(this.field)this.field.y=180+Math.min(t,60)*6;
      this.clouds.forEach((cloud,i)=>cloud.y=((i*210+t*(i<3?22:38))%1120)-160);
      this.plane.setPosition(p.x,p.y);this.plane.angle+=(Phaser.Math.Clamp((p.x-this.lastPlayerX)*1.1,-8,8)-this.plane.angle)*.18;this.lastPlayerX=p.x;
      this.plane.setAlpha(s&&s.t<s.invincibleUntil&&Math.floor(t*10)%2?.42:1);
      const cockpit=this.panel.craft==='swift'?-11:this.panel.craft==='petal'?-1:-6;
      this.pet.setPosition(this.plane.x,this.plane.y+cockpit+19);this.pilotMask!.clear().fillStyle(0xffffff).fillEllipse(this.plane.x,this.plane.y+cockpit,18,21);
      this.graphics.lineStyle(1.3,0xffedbd,.8).strokeEllipse(this.plane.x,this.plane.y+cockpit,19,23);
      this.engines.forEach((image,i)=>{image.setPosition(this.plane!.x+(i?1:-1)*23,this.plane!.y+27);image.setDisplaySize(14+Math.sin(t*35+i)*2,42+Math.sin(t*26+i)*8);image.setAlpha(.6);});
      this.graphics.fillStyle(0xc8f7ff,.9).fillCircle(this.plane.x,this.plane.y,2.5);
      if(s&&t<s.shieldUntil){this.graphics.lineStyle(2,0xaff8e8,.9).strokeCircle(this.plane.x,this.plane.y,49);this.graphics.lineStyle(5,0x8bedd4,.18).strokeCircle(this.plane.x,this.plane.y,53);}
      if(s&&t<s.specialUntil){this.graphics.lineStyle(3,FLIGHT_CRAFT[s.craft].color,.7).strokeCircle(this.plane.x,this.plane.y,55+Math.sin(t*15)*5);}
      if(s&&t<s.specialUntil&&s.craft==='nova'){this.graphics.fillStyle(0xffd599,.18).fillRect(this.plane.x-28,0,56,this.plane.y-34);this.graphics.fillStyle(0xffd599,.6).fillRect(this.plane.x-12,0,24,this.plane.y-34);this.graphics.fillStyle(0xfff9de,.9).fillRect(this.plane.x-4,0,8,this.plane.y-34);}
    }else{
      this.pet.x=p.x;this.pet.y=p.y+35;this.basket?.setPosition(this.pet.x,p.y+32).setAngle(Math.sin(t*6)*.7);
      this.pet.setAlpha(s&&t<s.invincibleUntil&&Math.floor(t*10)%2?.45:1);
    }
    if(!s)return;
    if(!s.paused)this.processEffects();if(s.paused!==this.wasPaused){this.wasPaused=s.paused;if(s.paused)this.tweens.pauseAll();else this.tweens.resumeAll();}
    let count=0;for(const particle of this.particles){const age=t-particle.born,u=Phaser.Math.Clamp(age/particle.life,0,1);if(u>=1){particle.image.setActive(false).setVisible(false);this.freeParticles.push(particle);continue;}particle.image.setPosition(particle.x+particle.vx*age,particle.y+particle.vy*age).setDisplaySize(particle.size*(1+(particle.grow-1)*u),particle.size*(1+(particle.grow-1)*u)).setAlpha(particle.alpha*(1-u));particle.image.rotation=particle.spin*age;this.particles[count++]=particle;}this.particles.length=count;
    const alive=this.alive;alive.clear();for(const [entities,type]of [[s.fruit,'fruit'],[s.enemies,'enemy'],[s.shots,'shot'],[s.sparks,'spark'],[s.pickups,'pickup']]as const)for(const e of entities){alive.add(e.id);this.entity(e,type,blend,elapsed);}
    for(const[id,view]of this.views)if(!alive.has(id)){view.destroy();this.views.delete(id);}
    for(const e of s.enemies){
      if(e.boss||e.kind==='bomber'){for(const side of [-1,1]){const x=e.x+side*(e.boss?79:28),y=e.y+(e.boss?2:-3),radius=e.boss?10:6;this.graphics.lineStyle(1.4,0xf2d59e,.6);for(let i=0;i<3;i++){const angle=t*30+i*Math.PI*2/3;this.graphics.lineBetween(x+Math.cos(angle)*2,y+Math.sin(angle)*2,x+Math.cos(angle)*radius,y+Math.sin(angle)*radius);}this.graphics.fillStyle(0xffdd8f,.65+.2*Math.sin(t*9)).fillCircle(x,y,2);}}
      if(e.hp!<e.maxHp!&&!e.boss){this.graphics.fillStyle(0x18323c,.8).fillRoundedRect(e.x-18,e.y-30,36,4,2);this.graphics.fillStyle(0xffcd86).fillRoundedRect(e.x-18,e.y-30,36*e.hp!/e.maxHp!,4,2);}
      if(e.boss&&e.guardUntil&&t<e.guardUntil){this.graphics.lineStyle(3,0xaee7ee,.8).strokeEllipse(e.x,e.y,220,105);this.graphics.lineStyle(8,0x99e1e9,.14).strokeEllipse(e.x,e.y,226,111);}
      if(e.boss&&e.warningAt&&e.beamUntil&&t<e.beamUntil){const firing=t>=e.warningAt;this.graphics.fillStyle(firing?0xffe1b5:0xff7d78,firing?.7:.13).fillRect(e.beamX!-22,e.y+45,44,720-e.y);this.graphics.lineStyle(firing?3:1,0xffc3a4,.9).lineBetween(e.beamX!,e.y+45,e.beamX!,720);}
    }
  }
}
const kindPetY=(kind:GameKind)=>kind==='flight'?599:663;
