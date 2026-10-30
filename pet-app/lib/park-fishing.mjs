// The pond, fish movement and input cadence are authoritative, seeded simulation.
export const FISHING_WATER={x:490,y:275,rx:245,ry:155};
export const FISHING_FIGHT={safeMin:20,safeMax:78,breakAt:94,breakDelay:.55,tapInterval:.14};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const random=s=>{s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;};
export function fishingWaterPoint(x,y){
  const p=FISHING_WATER,dx=(x-p.x)/p.rx,dy=(y-p.y)/p.ry,d=Math.hypot(dx,dy),scale=d>1?1/d:1;
  return{x:p.x+dx*scale*p.rx,y:p.y+dy*scale*p.ry};
}
export function fishingSpot(x,y,spots){return spots.reduce((best,p,i)=>Math.hypot(p.x-x,p.y-y)<Math.hypot(spots[best].x-x,spots[best].y-y)?i:best,0);}
function emit(s,type){const l=s.leisure;s.effects.push({id:++s.effectSerial,type,x:l.castX,y:l.castY,kind:'fishing',amount:0,t:s.t});if(s.effects.length>40)s.effects.shift();l.feedback=type;l.feedbackUntil=s.t+1.2;}
function destination(s){const angle=random(s)*Math.PI*2,r=Math.sqrt(random(s))*.93;return{x:FISHING_WATER.x+Math.cos(angle)*FISHING_WATER.rx*r,y:FISHING_WATER.y+Math.sin(angle)*FISHING_WATER.ry*r};}
function spawnFish(s,id,spots){
  const spot=spots[id%spots.length],p=fishingWaterPoint(spot.x+(random(s)-.5)*100,spot.y+(random(s)-.5)*65),goal=destination(s);
  return{id,fish:spot.fish[Math.floor(random(s)*spot.fish.length)],...p,tx:goal.x,ty:goal.y,angle:Math.atan2(goal.y-p.y,goal.x-p.x),speed:18+random(s)*15,interest:.4+random(s)*.6,ignoreUntil:0,mode:'roam',turnAt:s.t+2+random(s)*4,until:0};
}
export function createFishing(s,spots){
  const l=s.leisure;Object.assign(l,{collection:[],fish:0,biteAt:0,phaseUntil:0,tension:42,progress:0,strain:0,escape:0,spot:0,castX:spots[0].x,castY:spots[0].y,length:0,records:[],nibbles:0,nibbleTarget:0,nibbleAt:0,abandonAt:0,hookAt:0,surging:false,activeFish:-1,noticeAt:0,lastReelAt:-100,reelTaps:0,fightUntil:0,fightDirection:0,fightX:spots[0].x,fightY:spots[0].y,stamina:1,runs:0,escapeReason:''});
  l.school=Array.from({length:9},(_,id)=>spawnFish(s,id,spots));
}
function swim(s,dt,spots){
  const l=s.leisure;
  for(let i=0;i<l.school.length;i++){
    const f=l.school[i];if(f.mode==='diving'){if(s.t>=f.until)l.school[i]=spawnFish(s,f.id,spots);continue;}
    if(f.mode==='hooked'){
      f.x=l.fightX;f.y=l.fightY+12;f.angle=l.surging?l.fightDirection+Math.sin(s.t*9)*.35:Math.atan2(390-f.y,245-f.x);continue;
    }
    if(f.mode==='nibble'){f.x=l.castX+Math.cos(f.angle)*-23+Math.sin(s.t*3)*3;f.y=l.castY+Math.sin(f.angle)*-23;continue;}
    if(f.mode==='roam'&&(s.t>=f.turnAt||Math.hypot(f.tx-f.x,f.ty-f.y)<12)){
      const p=destination(s);f.tx=p.x;f.ty=p.y;f.turnAt=s.t+3+random(s)*5;
    }
    if(f.mode==='approach'){f.tx=l.castX;f.ty=l.castY;}
    const dx=f.tx-f.x,dy=f.ty-f.y,d=Math.hypot(dx,dy),target=Math.atan2(dy,dx),turn=Math.atan2(Math.sin(target-f.angle),Math.cos(target-f.angle));
    f.angle+=clamp(turn,-dt*2.8,dt*2.8);const speed=f.mode==='approach'?65:f.mode==='flee'?135:f.speed;
    const p=fishingWaterPoint(f.x+Math.cos(f.angle)*Math.min(d,speed*dt),f.y+Math.sin(f.angle)*Math.min(d,speed*dt));f.x=p.x;f.y=p.y;
    if(f.mode==='flee'&&s.t>=f.until){f.mode='roam';f.turnAt=s.t;}
    if(f.mode==='approach'&&d<27){f.mode='nibble';l.nibbleTarget=1+Math.floor(random(s)*3);l.nibbleAt=s.t+.7+random(s)*1.1;l.abandonAt=random(s)<.1?s.t+.55+random(s)*.8:0;}
  }
}
function flee(s,f){
  const l=s.leisure,p=fishingWaterPoint(f.x+(f.x-l.castX)*8+100,f.y+(f.y-l.castY)*8-90);f.mode='flee';f.tx=p.x;f.ty=p.y;f.until=s.t+1.6;f.ignoreUntil=s.t+8+random(s)*12;
}
function leaveBait(s){
  const l=s.leisure,f=l.school.find(f=>f.id===l.activeFish);if(f)flee(s,f);
  // A curious fish can change its mind without ending the cast or awarding a catch.
  l.activeFish=-1;l.abandonAt=0;l.nibbleAt=0;l.noticeAt=s.t+2+random(s)*4;emit(s,'shy');
}
function lose(s,reason='slack'){
  const l=s.leisure,f=l.school.find(f=>f.id===l.activeFish);if(f)flee(s,f);
  l.phase='escaped';l.misses++;l.activeFish=-1;l.escapeReason=reason;emit(s,reason==='snap'?'snap':'miss');
}
function cast(s,input,spots){
  const l=s.leisure,p=fishingWaterPoint(Number.isFinite(input.x)?input.x/480*800:spots[0].x,Number.isFinite(input.y)?input.y/720*600:spots[0].y);
  Object.assign(l,{spot:fishingSpot(p.x,p.y,spots),castX:p.x,castY:p.y,phase:'casting',castAt:s.t,biteAt:0,nibbles:0,nibbleTarget:0,nibbleAt:0,abandonAt:0,activeFish:-1,escape:0,progress:0,reelTaps:0,surging:false,strain:0,tension:42,escapeReason:'',noticeAt:s.t+2.8+random(s)*5.2});emit(s,'cast');
}
export function stepFishing(s,input,pressed,dt,fish,spots){
  const l=s.leisure;swim(s,dt,spots);let hookedNow=false;
  if(pressed[0]){
    if(['ready','caught','escaped'].includes(l.phase))cast(s,input,spots);
    else if(l.phase==='waiting'){lose(s,'early');l.feedback='early';}
    else if(l.phase==='bite'){Object.assign(l,{phase:'reeling',hookAt:s.t,lastReelAt:s.t,progress:.04,escape:0,strain:0,tension:42,reelTaps:0,stamina:1,surging:true,fightUntil:s.t+.9+random(s)*.8,fightDirection:random(s)*Math.PI*2,fightX:l.castX,fightY:l.castY,runs:1});l.school.find(f=>f.id===l.activeFish).mode='hooked';emit(s,'hook');emit(s,'surge');hookedNow=true;}
  }
  if(l.phase==='casting'&&s.t>=l.castAt+.58){l.phase='waiting';emit(s,'plop');}
  if(l.phase==='waiting'){
    if(l.activeFish<0&&s.t>=l.noticeAt){
      l.noticeAt=s.t+1.4+random(s)*3;const candidates=l.school.filter(f=>f.mode==='roam'&&s.t>=f.ignoreUntil&&Math.hypot(f.x-l.castX,f.y-l.castY)<165);
      if(candidates.length){const f=candidates[Math.floor(random(s)*candidates.length)],distance=Math.hypot(f.x-l.castX,f.y-l.castY),attention=(.22+(1-distance/165)*.34)*f.interest;
        if(random(s)<attention){f.mode='approach';l.activeFish=f.id;l.fish=f.fish;l.nibbles=0;l.abandonAt=0;const range=fish[l.fish].length;l.length=Math.round((range[0]+random(s)*(range[1]-range[0]))*10)/10;emit(s,'notice');}}
    }
    const f=l.school.find(f=>f.id===l.activeFish);
    if(l.abandonAt&&s.t>=l.abandonAt)leaveBait(s);
    else if(f?.mode==='nibble'&&s.t>=l.nibbleAt){
      if(l.nibbles<l.nibbleTarget){l.nibbles++;l.nibbleAt=s.t+1+random(s)*1.5;emit(s,'nibble');if(random(s)<(l.nibbles===1?.28:.16))l.abandonAt=s.t+.45+random(s)*.7;}
      else if(random(s)<.88){l.phase='bite';l.biteAt=s.t;l.phaseUntil=s.t+1.25+random(s)*.35;emit(s,'bite');}
      else leaveBait(s);
    }
  }
  if(l.phase==='bite'&&s.t>l.phaseUntil)lose(s,'late');
  if(l.phase==='reeling'){
    // Only fresh, reasonably spaced presses count. A held mask, duplicate counter,
    // or a forged counter jump cannot generate repeated reeling impulses.
    const strength=clamp((fish[l.fish].pull-7)/13,0,1);
    if(s.t>=l.fightUntil){l.surging=!l.surging;l.fightUntil=s.t+(l.surging?.9+random(s)*1.1+strength*.3:1.9+random(s)*1.2);l.fightDirection=random(s)*Math.PI*2;if(l.surging){l.runs++;emit(s,'surge');}else emit(s,'recover');}
    l.stamina=clamp(l.stamina-dt*.009,.2,1);
    l.tension=clamp(l.tension+dt*((l.surging?(27+strength*7)*(.65+l.stamina*.35):0)-20),0,100);
    if(pressed[0]&&!hookedNow&&s.t-l.lastReelAt>=FISHING_FIGHT.tapInterval){
      l.lastReelAt=s.t;l.reelTaps++;l.tension=clamp(l.tension+(l.surging?14+strength*7:6+strength*2.5),0,100);
      if(l.tension>=FISHING_FIGHT.safeMin&&l.tension<=FISHING_FIGHT.safeMax){l.progress=clamp(l.progress+(l.surging?.006:.05+(1-l.stamina)*.02),0,1);l.stamina=clamp(l.stamina-.015,.2,1);l.escape=clamp(l.escape-.16,0,1);}emit(s,'reel');
    }
    const idle=s.t-l.lastReelAt;l.progress=clamp(l.progress-dt*(l.surging?.025:.003),0,1);
    l.escape=clamp(l.escape+dt*(idle>(l.surging?2.6:1.05)?.34:-.1)+dt*(l.tension<15?.16:0),0,1);
    l.strain=clamp(l.strain+dt*(l.tension>FISHING_FIGHT.breakAt?1:-1.2),0,2);
    const pull=l.surging?24:7,side=Math.sin((s.t-l.hookAt)*(l.surging?5:3)),p=fishingWaterPoint(l.castX+(245-l.castX)*l.progress*.7+Math.cos(l.fightDirection)*side*pull,l.castY+(390-l.castY)*l.progress*.7+Math.sin(l.fightDirection)*side*pull*.55);l.fightX=p.x;l.fightY=p.y;
    if(l.strain>=FISHING_FIGHT.breakDelay)lose(s,'snap');
    else if(l.escape>=1||s.t-l.hookAt>40)lose(s,'slack');
    else if(l.progress>=.99){const f=l.school.find(f=>f.id===l.activeFish);if(f){f.mode='diving';f.until=s.t+4;}l.phase='caught';l.hits++;l.completed++;s.caught++;s.score+=fish[l.fish].points;l.collection.push(l.fish);l.records.push({fish:l.fish,length:l.length,spot:l.spot});emit(s,'catch');}
  }
}
