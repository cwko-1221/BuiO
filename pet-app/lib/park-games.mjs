import {PARK_ECONOMY} from './park-economy.mjs';
// Deterministic fixed-step arcade simulation. Rendering and sound consume bounded events.
import {LEISURE_RULES,createLeisure,stepLeisure,leisureResult} from "./park-leisure.mjs";
export const GAME_SIZE = { width: 480, height: 720 };
export const GAME_RULES = {
  ...LEISURE_RULES,
  banana: { duration: 45, target: 8, reward: PARK_ECONOMY.gameReward, name: { 'zh-HK': '香蕉接接樂', 'en-US': 'Banana Basket' } },
  flight: { duration: 60, target: 6, reward: PARK_ECONOMY.gameReward, name: { 'zh-HK': '寵物天空巡遊', 'en-US': 'Pet Sky Patrol' } },
};
export const FLIGHT_CRAFT = {
  swift: { name: {'zh-HK':'晨星號','en-US':'Starling'}, weapon:{'zh-HK':'高速雙連射','en-US':'Twin pulse'}, special:{'zh-HK':'星光突擊','en-US':'Star rush'}, speed:350, interval:.18, color:0x80e4ff },
  petal: { name: {'zh-HK':'森羽號','en-US':'Leafwing'}, weapon:{'zh-HK':'花瓣扇形炮','en-US':'Petal spread'}, special:{'zh-HK':'花雨綻放','en-US':'Blossom nova'}, speed:315, interval:.24, color:0xa4efac },
  nova: { name: {'zh-HK':'霞光號','en-US':'Sundancer'}, weapon:{'zh-HK':'貫穿炮・追蹤彈','en-US':'Lance + missiles'}, special:{'zh-HK':'曙光光束','en-US':'Dawn beam'}, speed:290, interval:.28, color:0xffcc7e },
};
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function entity(s,data){return{id:++s.serial,...data};}
function effect(s,type,x,y,kind='',amount=0){s.effects.push({id:++s.effectSerial,type,x,y,kind,amount,t:s.t});if(s.effects.length>90)s.effects.splice(0,s.effects.length-90);}
export function createGame(kind,seed=1,options={}){
  if(!Object.hasOwn(GAME_RULES,kind))throw Error('Unknown park game');
  const craft=options.craft??'swift';if(kind==='flight'&&!Object.hasOwn(FLIGHT_CRAFT,craft))throw Error('Unknown aircraft');
  const state={kind,craft:kind==='flight'?craft:'swift',seed:seed>>>0,serial:0,effectSerial:0,tick:0,t:0,status:'playing',paused:false,
    score:0,caught:0,misses:0,combo:0,bestCombo:0,kills:0,lives:kind==='banana'?3:5,player:{x:240,y:628},
    fruit:[],enemies:[],shots:[],sparks:[],pickups:[],effects:[],nextSpawn:.8,nextShot:.2,nextRocket:1.4,
    invincibleUntil:0,shields:3,shieldUntil:0,shieldHeld:false,specialHeld:false,specialUntil:0,nextSpecialShot:0,
    energy:40,power:1,wave:0,bossSpawned:false,bossDefeated:false,victory:false,inputSeq:0,shieldPress:0,specialPress:0};
  if(Object.hasOwn(LEISURE_RULES,kind))createLeisure(state);return state;
}
// Shared by immediate local presentation and the authoritative simulation.
// Pointer controls are direct; keyboard controls retain each aircraft's speed.
export function moveGamePlayer(kind,craft,p,input={},dt=1/30){
  const mask=input.mask||0,speed=kind==='banana'?390:FLIGHT_CRAFT[craft].speed;
  let dx=(mask&2?1:0)-(mask&1?1:0),dy=kind==='flight'?(mask&8?1:0)-(mask&4?1:0):0;
  if(!dx&&!dy&&Number.isFinite(input.x)){dx=input.x-p.x;dy=kind==='flight'&&Number.isFinite(input.y)?input.y-p.y:0;}
  else if(dx||dy){const length=Math.hypot(dx,dy);dx=dx/length*speed*dt;dy=dy/length*speed*dt;}
  return{x:clamp(p.x+dx,35,445),y:kind==='banana'?628:clamp(p.y+dy,310,655)};
}
function movePlayer(s,input,dt){
  const mask=input.mask||0,p=s.player;Object.assign(p,moveGamePlayer(s.kind,s.craft,p,input,dt));
  const shield=(mask&16)&&!s.shieldHeld||input.shieldPress>s.shieldPress,special=(mask&32)&&!s.specialHeld||input.specialPress>s.specialPress;
  if(s.kind==='flight'&&shield&&s.shields>0){s.shields--;s.shieldUntil=s.t+2.5;effect(s,'shield',p.x,p.y);}
  if(s.kind==='flight'&&special&&s.energy>=100){s.energy=0;s.specialUntil=s.t+1.8;s.nextSpecialShot=s.t;s.sparks=[];effect(s,'special',p.x,p.y,s.craft);}
  s.shieldPress=Math.max(s.shieldPress,input.shieldPress||0);s.specialPress=Math.max(s.specialPress,input.specialPress||0);s.inputSeq=input.seq??s.inputSeq;
  s.shieldHeld=!!(mask&16);s.specialHeld=!!(mask&32);
}
// Test the complete relative motion, so a quick drag cannot pass through danger.
function sweptCircle(from,to,a,b,radius){
  const x=a.x-from.x,y=a.y-from.y,dx=b.x-to.x-x,dy=b.y-to.y-y,length=dx*dx+dy*dy;
  const u=length?clamp(-(x*dx+y*dy)/length,0,1):0;
  return(x+u*dx)**2+(y+u*dy)**2<radius*radius;
}
function sweptBasket(from,to,a,b){
  let low=0,high=1;
  for(const [axis,radius]of [['x',44],['y',30]]){
    const start=a[axis]-from[axis],delta=b[axis]-to[axis]-start;
    if(!delta){if(Math.abs(start)>=radius)return false;continue;}
    let enter=(-radius-start)/delta,exit=(radius-start)/delta;if(enter>exit)[enter,exit]=[exit,enter];low=Math.max(low,enter);high=Math.min(high,exit);if(low>high)return false;
  }return true;
}
function hurt(s){
  if(s.t<s.invincibleUntil||s.t<s.shieldUntil||s.t<s.specialUntil)return;
  s.lives--;s.combo=0;s.invincibleUntil=s.t+1.2;effect(s,'hurt',s.player.x,s.player.y);
}
function bananaStep(s,dt,previous){
  if(s.t>=s.nextSpawn){
    const hazard=s.t>3&&random(s)<.22,golden=!hazard&&random(s)<.15;
    s.fruit.push(entity(s,{x:40+random(s)*400,y:-40,vy:190+s.t*2+random(s)*65,vx:s.t>20?(random(s)-.5)*70:0,kind:hazard?'acorn':golden?'gold':'banana'}));
    s.nextSpawn+=Math.max(.38,.74-s.t*.006);
  }
  for(const fruit of s.fruit){
    const before={x:fruit.x,y:fruit.y};fruit.y+=fruit.vy*dt;fruit.x=clamp(fruit.x+fruit.vx*dt,22,458);
    if(sweptBasket(previous,s.player,before,fruit)){
      fruit.dead=true;
      if(fruit.kind==='acorn')hurt(s);
      else{s.caught++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);const points=(fruit.kind==='gold'?3:1)+(s.combo%5===0?2:0);s.score+=points;effect(s,'catch',fruit.x,fruit.y,fruit.kind,points);}
    }else if(fruit.y>740){fruit.dead=true;if(fruit.kind!=='acorn'){s.misses++;s.combo=0;effect(s,'miss',fruit.x,690);}}
  }s.fruit=s.fruit.filter(f=>!f.dead);
}
function playerShot(s,angle,kind,damage=1,offset=0,pierce=1,speed=580){
  s.shots.push(entity(s,{x:s.player.x+offset,y:s.player.y-34,vx:Math.sin(angle)*speed,vy:-Math.cos(angle)*speed,kind,damage,pierce,hitIds:[],born:s.t}));
}
function weapons(s){
  const craft=FLIGHT_CRAFT[s.craft],level=s.power;
  if(s.t>=s.nextShot){
    if(s.craft==='swift'){for(const offset of [-11,11])playerShot(s,0,'pulse',.82+.1*(level-1),offset);if(level>1)for(const side of [-1,1])playerShot(s,side*.12,'pulse',.6,side*20);}
    if(s.craft==='petal'){const count=level===3?5:3;for(let i=0;i<count;i++)playerShot(s,(i-(count-1)/2)*.16,'petal',.95+.12*(level-1));}
    if(s.craft==='nova'){playerShot(s,0,'lance',1.8+.25*(level-1),0,2+level,620);if(level>1)for(const side of [-1,1])playerShot(s,side*.04,'lance',.7,side*15,2);}
    effect(s,'fire',s.player.x,s.player.y-34,s.craft);s.nextShot+=craft.interval;
  }
  if(s.craft==='nova'&&s.t>=s.nextRocket){for(const side of [-1,1])playerShot(s,side*.24,'missile',2.2,side*26,1,350);s.nextRocket+=1.6;effect(s,'rocket',s.player.x,s.player.y);}
  if(s.t<s.specialUntil&&s.t>=s.nextSpecialShot){
    if(s.craft==='swift')for(const offset of [-26,-13,0,13,26])playerShot(s,0,'pulse',1.6,offset,3,760);
    if(s.craft==='petal')for(let i=-5;i<=5;i++)playerShot(s,i*.19,'petal',2,0,3,600);
    if(s.craft==='nova')playerShot(s,0,'beam',4,0,20,1000);
    s.nextSpecialShot+=.15;
  }
}
function spawnEnemies(s){
  const wave=s.t<17?1:s.t<34?2:3;
  if(wave!==s.wave&&!s.bossSpawned){s.wave=wave;effect(s,'wave',240,240,'',wave);}
  if(s.t<46&&s.t>=s.nextSpawn){
    const count=wave===1?1:2,center=100+random(s)*280;
    for(let i=0;i<count;i++){
      const roll=random(s),kind=wave===1?'scout':roll<.4?'scout':roll<.78?'interceptor':'bomber';
      const hp=kind==='scout'?2.8:kind==='interceptor'?7:15,x=clamp(center+(i-.5)*90,48,432);
      s.enemies.push(entity(s,{x,baseX:x,y:-70-i*85,hp,maxHp:hp,kind,vy:kind==='scout'?95+wave*5:kind==='interceptor'?78:50,phase:random(s)*6,fireAt:s.t+.8,boss:false}));
    }s.nextSpawn+=wave===1?1.1:wave===2?1.5:1.25;
  }
  if(!s.bossSpawned&&s.t>=48){
    s.bossSpawned=true;s.enemies.push(entity(s,{x:240,baseX:240,y:-150,hp:118,maxHp:118,kind:'boss',vy:110,phase:0,stage:1,guardUntil:0,fireAt:50.7,boss:true,attack:0,warningAt:0,beamUntil:0,beamX:240,nextBeam:52.4}));
    effect(s,'boss',240,140);
  }
}
function enemyFire(s,e){
  effect(s,'enemy-fire',e.x,e.y+25);
  const aim=Math.atan2(s.player.y-e.y,s.player.x-e.x),phase=e.boss?(e.hp/e.maxHp<.34?3:e.hp/e.maxHp<.68?2:1):0;
  let angles=e.kind==='scout'?[0]:e.kind==='interceptor'?[-.24,0,.24]:[-.5,-.25,0,.25,.5];
  if(e.boss)angles=phase===1?[-.6,-.4,-.2,0,.2,.4,.6]:[-.5,-.25,0,.25,.5];
  for(const offset of angles)s.sparks.push(entity(s,{x:e.x,y:e.y+28,vx:Math.cos(aim+offset)*145,vy:Math.sin(aim+offset)*145,kind:e.kind==='scout'?'ember':'orb'}));
  if(e.boss&&phase>1)for(let i=0;i<12;i++){const a=i*Math.PI/6+s.t*.3;s.sparks.push(entity(s,{x:e.x,y:e.y+15,vx:Math.cos(a)*115,vy:Math.sin(a)*115,kind:'ring'}));}
  e.fireAt=s.t+(e.boss?1.15:e.kind==='interceptor'?2.2:2.8);e.attack=(e.attack||0)+1;
}
function killEnemy(s,e){
  if(e.dead)return;e.dead=true;s.kills++;s.combo++;s.bestCombo=Math.max(s.bestCombo,s.combo);s.score+=e.boss?30:e.kind==='bomber'?3:e.kind==='interceptor'?2:1;
  s.energy=clamp(s.energy+(e.boss?0:9),0,100);effect(s,'explode',e.x,e.y,e.kind,e.boss?3:e.kind==='bomber'?2:1);
  if(e.boss){s.bossDefeated=true;s.sparks=[];effect(s,'clear',e.x,e.y);}
  else if(s.kills%4===0){const kind=['power','energy','repair','power','shield'][(s.kills/4-1)%5];s.pickups.push(entity(s,{x:clamp(e.x,35,445),y:e.y,vy:94,kind,born:s.t}));}
}
function flightStep(s,dt,previous){
  s.energy=clamp(s.energy+dt*1.2,0,100);weapons(s);spawnEnemies(s);
  for(const shot of s.shots){
    if(shot.kind==='missile'){
      const target=s.enemies.filter(e=>!e.dead&&e.y>0&&e.y<shot.y).sort((a,b)=>Math.hypot(a.x-shot.x,a.y-shot.y)-Math.hypot(b.x-shot.x,b.y-shot.y))[0];
      if(target){const angle=Math.atan2(target.y-shot.y,target.x-shot.x);shot.vx+=(Math.cos(angle)*370-shot.vx)*.13;shot.vy+=(Math.sin(angle)*370-shot.vy)*.13;}
    }shot.y+=shot.vy*dt;shot.x+=shot.vx*dt;
  }
  for(const e of s.enemies){
    const before={x:e.x,y:e.y};
    e.y=e.boss?Math.min(125,e.y+e.vy*dt):e.y+e.vy*dt;
    e.x=clamp(e.baseX+Math.sin(s.t*(e.boss?.9:e.kind==='interceptor'?2.5:1.65)+e.phase)*(e.boss?105:e.kind==='interceptor'?65:24),e.boss?115:32,e.boss?365:448);
    if(e.boss&&e.y>=110&&s.t>=e.nextBeam&&!e.warningAt){e.beamX=s.player.x;e.warningAt=s.t+1.15;e.beamUntil=e.warningAt+.65;e.nextBeam=s.t+3.7;effect(s,'warning',e.beamX,e.y);}
    if(e.boss&&e.warningAt&&s.t>=e.warningAt&&s.t<e.beamUntil&&Math.min(previous.x,s.player.x)<e.beamX+22&&Math.max(previous.x,s.player.x)>e.beamX-22)hurt(s);
    if(e.boss&&e.warningAt&&s.t>=e.beamUntil)e.warningAt=0;
    if(s.t>=e.fireAt&&e.y>30&&e.y<570)enemyFire(s,e);
    for(const shot of s.shots)if(!shot.dead&&!e.dead&&!shot.hitIds.includes(e.id)&&Math.abs(shot.x-e.x)<(e.boss?83:e.kind==='bomber'?42:27)+(shot.kind==='beam'?22:0)&&Math.abs(shot.y-e.y)<(e.boss?48:27)){
      shot.hitIds.push(e.id);shot.pierce--;if(shot.pierce<=0)shot.dead=true;
      if(e.boss&&s.t<e.guardUntil){effect(s,'absorb',shot.x,shot.y);continue;}
      e.hp-=shot.damage;
      if(e.boss&&e.stage<3&&e.hp<=e.maxHp*(e.stage===1?.66:.33)){e.hp=e.maxHp*(e.stage===1?.66:.33);e.stage++;e.guardUntil=s.t+.85;e.fireAt=Math.min(e.fireAt,s.t+.25);effect(s,'boss-phase',e.x,e.y,'',e.stage);}
      effect(s,'hit',shot.x,shot.y,shot.kind,shot.damage);if(e.hp<=0)killEnemy(s,e);
    }
    if(!e.dead&&sweptCircle(previous,s.player,before,e,e.boss?75:36)){hurt(s);if(!e.boss){e.dead=true;effect(s,'explode',e.x,e.y,e.kind,1);}}
    if(e.y>790)e.dead=true;
  }
  for(const spark of s.sparks){
    const before={x:spark.x,y:spark.y};spark.x+=spark.vx*dt;spark.y+=spark.vy*dt;
    if(sweptCircle(previous,s.player,before,spark,s.t<s.shieldUntil?49:17)){if(s.t<s.shieldUntil)effect(s,'absorb',spark.x,spark.y);else hurt(s);spark.dead=true;}
  }
  for(const p of s.pickups){
    const before={x:p.x,y:p.y};p.y+=p.vy*dt;const distance=Math.hypot(p.x-s.player.x,p.y-s.player.y);
    if(distance<78){p.x+=(s.player.x-p.x)*dt*8;p.y+=(s.player.y-p.y)*dt*8;}
    if(sweptCircle(previous,s.player,before,p,29)){p.dead=true;if(p.kind==='power')s.power=Math.min(3,s.power+1);else if(p.kind==='repair')s.lives=Math.min(5,s.lives+1);else if(p.kind==='shield')s.shields=Math.min(3,s.shields+1);else s.energy=Math.min(100,s.energy+35);s.score+=2;effect(s,'pickup',p.x,p.y,p.kind);}
  }
  s.enemies=s.enemies.filter(e=>!e.dead);s.shots=s.shots.filter(e=>!e.dead&&e.y>-80&&e.y<780&&e.x>-90&&e.x<570);
  s.sparks=s.sparks.filter(e=>!e.dead&&e.y<780&&e.y>-70&&e.x>-60&&e.x<540).slice(-180);s.pickups=s.pickups.filter(e=>!e.dead&&e.y<780);
}
export function stepGame(s,input={},dt=1/30){
  if(s.status!=='playing'||s.paused)return s;
  dt=clamp(dt,0,1/30);if(dt===0)return s;s.tick++;s.t=s.tick/30;s.effects=s.effects.filter(e=>s.t-e.t<1.65);
  if(Object.hasOwn(LEISURE_RULES,s.kind)){stepLeisure(s,input,dt);return s;}
  const previous={...s.player};movePlayer(s,input,dt);if(s.kind==='banana')bananaStep(s,dt,previous);else flightStep(s,dt,previous);
  if(s.lives<=0||s.t>=GAME_RULES[s.kind].duration||s.bossDefeated){s.status='ended';s.victory=s.kind==='banana'?s.caught>=8:s.bossDefeated;}
  return s;
}
export function gameResult(s){if(s.leisure)return leisureResult(s);return{score:s.score,qualified:s.kind==='banana'?s.caught>=8:s.kills>=6,caught:s.caught,kills:s.kills,combo:s.bestCombo,victory:s.victory,seconds:Math.round(s.t)};}
