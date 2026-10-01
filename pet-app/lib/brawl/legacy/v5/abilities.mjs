// Deterministic abilities. Positions use the simulator's integer 1/100-pixel units.
// Only combat callbacks mutate HP; the scene consumes events and never resolves hits.
const U=100, clamp=(n,l,h)=>Math.max(l,Math.min(h,n));
const foes=(s,a)=>s.actors.filter(t=>t.team!==a.team&&t.hp>0);
const bound=(s,x)=>clamp(Math.round(x),45*U,(s.mode==='campaign'?(s.cleared?5115:s.zone*1280+1235):1235)*U);
const nearest=(s,a,range,depth=80)=>foes(s,a).filter(t=>Math.abs(t.x-a.x)<=range*U&&Math.abs(t.y-a.y)<=depth*U).sort((l,r)=>Math.abs(l.x-a.x)+2*Math.abs(l.y-a.y)-Math.abs(r.x-a.x)-2*Math.abs(r.y-a.y)||l.id-r.id)[0];
const wind=k=>k.windup??12;
export function abilityDuration(k){return k.duration??Math.max(38,wind(k)+(k.mechanic==='dash'?18:k.mechanic==='rush'?(k.pulses-1)*(k.period||10)+8:Math.max((k.pulses||1)-1,(k.volleys||1)-1)*(k.period||k.interval||8))+18);}
export function setupAbility(s,a,k){
  const t=k.preferTarget===false?null:nearest(s,a,k.range),x=a.x,y=a.y;
  a.abilityMotion={x,y,toX:bound(s,k.targeted&&t?t.x-a.facing*45*U:x+a.facing*k.range*U),toY:k.targeted&&t?t.y:y,target:t?.id||0};
  a.abilityFacing=a.facing;
}
function release(s,a,k,extra={}){s.events.push({type:'skillRelease',actor:a.id,skill:a.skill,kind:k.kind,mechanic:k.mechanic,effect:k.effect,range:k.range,x:a.x/U,y:a.y/U,facing:a.facing,...extra});}
function status(s,a,t,k){
  if(k.slowTicks)t.slowUntil=Math.max(t.slowUntil||0,s.tick+k.slowTicks);
  if(k.rootTicks)t.rootUntil=Math.max(t.rootUntil||0,s.tick+k.rootTicks);
  if(k.burnTicks){t.burnOwner=a.id;t.burnUntil=s.tick+k.burnTicks;t.burnNext=s.tick+30;}
  if(k.markTicks){t.readOwner=a.id;t.readUntil=s.tick+k.markTicks;}
}
function hit(s,a,t,k,c,damage=k.damage,down=false,chain=false){const landed=c.impact(s,a,t,damage,k.knock??(down?11:3),down,chain);if(landed)status(s,a,t,k);return landed;}
function area(s,a,k,c,x=a.x,y=a.y,r=k.range,damage=k.damage,down=false,chain=false){
  for(const t of foes(s,a))if(Math.abs(t.x-x)<=r*U&&Math.abs(t.y-y)<=Math.min(60,r*.6)*U&&t.z<55*U)hit(s,a,t,k,c,damage,down,chain);
}
function line(s,a,k,c,damage=k.damage,down=false,chain=false){
  for(const t of foes(s,a)){const dx=(t.x-a.x)*a.facing;if(dx>=-15*U&&dx<=k.range*U&&Math.abs(t.y-a.y)<=(k.depth||34)*U&&t.z<60*U)hit(s,a,t,k,c,damage,down,chain);}
}
function buff(s,a,k){
  const until=s.tick+(k.buffTicks||150);
  if(k.shield){a.shield=k.shield;a.shieldUntil=until;}
  if(k.haste){a.haste=k.haste;a.hasteUntil=until;}
  if(k.counter){a.counterDamage=k.counter;a.counterRange=k.range;a.counterUntil=until;a.counterEffect=k.effect;}
}
function field(s,a,k,extra={}){
  const motion=a.abilityMotion,range=k.range*U;
  let x=bound(s,a.x+a.facing*range),y=a.y;
  if(k.mechanic==='target-blast'){const target=s.actors.find(t=>t.id===motion.target);if(target){x=target.x;y=target.y;}}
  const f={id:s.nextId++,owner:a.id,team:a.team,kind:k.kind,effect:k.effect,mechanic:k.mechanic,x,y,radius:k.radius||90,starts:s.tick+(k.arm??0),expires:s.tick+(k.life||120),next:s.tick+(k.arm??0),hits:[],facing:a.facing,skill:{...k},...extra};
  s.fields.push(f);release(s,a,k,{fieldId:f.id,x:x/U,y:y/U,radius:f.radius,arm:k.arm||0,life:k.life||120});
}
export function updateAbility(s,a,k,t,c){
  const start=wind(k),q=t-start;
  if(k.mechanic==='projectile'){
    if(q>=0&&q%(k.interval||10)===0&&q/(k.interval||10)<(k.volleys||1)){
      release(s,a,k);for(const lane of k.spread||[0]){
        c.projectile(s,a,k.damage,k.range,k.speed||500,lane);
        Object.assign(s.projectiles.at(-1),{ability:true,style:k.effect,skill:{...k},startX:a.x,returning:false,speed:k.speed||500,dy:0});
      }
    }
  }else if(k.mechanic==='dash'){
    if(q===0){release(s,a,k);a.invuln=Math.max(a.invuln,k.invuln||0);}
    if(q>=0&&q<18){a.x=bound(s,a.x+a.facing*k.range*U/18);for(const target of foes(s,a))if(!a.hitIds.includes(target.id)&&Math.abs(target.x-a.x)<75*U&&Math.abs(target.y-a.y)<32*U&&target.z<40*U){if(hit(s,a,target,k,c,k.damage,true))a.hitIds.push(target.id);}}
  }else if(k.mechanic==='rush'){
    const period=k.period||10,pulses=k.pulses||2;
    if(q>=0&&q<period*(pulses-1)+7){const phase=Math.floor(q/period),n=q%period;if(n===0){a.hitIds=[];release(s,a,k,{phase});}if(n<7){a.x=bound(s,a.x+a.facing*k.range*U/(pulses*7));for(const target of foes(s,a))if(!a.hitIds.includes(target.id)&&Math.abs(target.x-a.x)<82*U&&Math.abs(target.y-a.y)<34*U&&target.z<45*U){if(hit(s,a,target,k,c,k.damage,phase===pulses-1,true))a.hitIds.push(target.id);}}}
  }else if(k.mechanic==='leap'){
    const duration=a.actionDuration-start-8,m=a.abilityMotion;
    if(q===0)release(s,a,k,{toX:m.toX/U,toY:m.toY/U});
    if(q>=0&&q<=duration){const p=q/duration;a.x=bound(s,m.x+(m.toX-m.x)*p);a.y=Math.round(m.y+(m.toY-m.y)*p);a.z=Math.round((k.height||100)*U*4*p*(1-p));a.vz=0;
      if(q===duration){a.z=0;area(s,a,k,c,a.x,a.y,85,k.damage,true);buff(s,a,k);s.events.push({type:'abilityPulse',actor:a.id,effect:k.effect,x:a.x/U,y:a.y/U,size:100});s.events.push({type:'land',actor:a.id});}}
  }else if(k.mechanic==='beam'||k.mechanic==='stretch'||k.mechanic==='flurry-melee'||k.mechanic==='orbit'){
    const n=q/(k.period||8),pulses=k.pulses||1;
    if(q>=0&&Number.isInteger(n)&&n<pulses){release(s,a,k,{phase:n});const damage=n===pulses-1?(k.finisher||k.damage):k.damage,down=!!k.down||((k.mechanic==='flurry-melee'||k.mechanic==='orbit')&&n===pulses-1);
      if(k.mechanic==='orbit')area(s,a,k,c,a.x,a.y,k.range,damage,down,true);else line(s,a,k,c,damage,down,pulses>1);}
  }else if(t===start){
    if(['trap','blast','target-blast','field'].includes(k.mechanic))field(s,a,k);
    else if(k.mechanic==='retreat'){
      field(s,a,k,{x:a.x,y:a.y,mechanic:'trap'});const fromX=a.x/U;a.x=bound(s,a.x-a.facing*k.range*U);a.invuln=Math.max(a.invuln,k.invuln||0);a.knock=0;release(s,a,k,{fromX,fromY:a.y/U});
    }else if(k.mechanic==='teleport'){
      const target=s.actors.find(t=>t.id===a.abilityMotion.target),fromX=a.x/U,fromY=a.y/U;
      const reachable=target&&target.hp>0&&Math.abs(target.x-a.x)<=k.range*U&&Math.abs(target.y-a.y)<=80*U;
      a.x=bound(s,k.preferTarget!==false&&reachable?target.x-target.facing*62*U:a.x+a.facing*k.range*U);
      if(k.preferTarget!==false&&reachable){a.y=target.y;a.facing=target.x>=a.x?1:-1;}
      a.knock=0;a.invuln=Math.max(a.invuln,k.invuln||0);buff(s,a,k);release(s,a,k,{fromX,fromY});if(k.damage)area(s,a,k,c,a.x,a.y,90,k.damage);
    }else if(k.mechanic==='heal'||k.mechanic==='buff'){
      buff(s,a,k);a.hp=Math.min(a.maxHp,a.hp+(k.heal||0));release(s,a,k);if(k.damage&&k.mechanic==='heal')area(s,a,k,c,a.x,a.y,k.range,k.damage);
    }else if(k.mechanic==='scan'){
      release(s,a,k);area(s,a,k,c,a.x,a.y,k.range,k.damage);
    }else if(k.mechanic==='chain'){
      let origin=a;const visited=new Set();release(s,a,k);
      for(let n=0;n<(k.jumps||3);n++){
        const target=foes(s,a).filter(e=>!visited.has(e.id)&&Math.abs(e.x-origin.x)<=(n?k.jumpRange:k.range)*U&&Math.abs(e.y-origin.y)<=80*U&&e.z<65*U).sort((l,r)=>Math.abs(l.x-origin.x)+2*Math.abs(l.y-origin.y)-Math.abs(r.x-origin.x)-2*Math.abs(r.y-origin.y)||l.id-r.id)[0];
        if(!target)break;visited.add(target.id);hit(s,a,target,k,c,Math.max(4,Math.round(k.damage*Math.pow(.6,n))));s.events.push({type:'abilityLink',actor:a.id,effect:k.effect,fromX:origin.x/U,fromY:origin.y/U,x:target.x/U,y:target.y/U});origin=target;
      }
    }else if(k.mechanic==='clones'){
      for(let n=0;n<(k.clones||2);n++)field(s,a,k,{x:bound(s,a.x+a.facing*(75+n*45)*U),y:clamp(a.y+(n?28:-28)*U,345*U,565*U),starts:s.tick,next:s.tick+15+n*15,expires:s.tick+k.life});
    }
  }
}
export function tickFields(s,c){
  for(const f of s.fields){const a=s.actors.find(a=>a.id===f.owner);if(!a||a.hp<=0){f.expires=0;continue;}if(s.tick<f.next||s.tick<f.starts)continue;
    const k=f.skill;if(f.mechanic==='field'||f.mechanic==='clones'){
      if(f.mechanic==='clones'){for(const t of foes(s,a))if(Math.abs(t.x-f.x)<=k.range*U&&(t.x-f.x)*f.facing>=-20*U&&Math.abs(t.y-f.y)<=40*U&&t.z<45*U)hit(s,a,t,k,c);}
      else area(s,a,k,c,f.x,f.y,f.radius,k.damage);
      s.events.push({type:'abilityPulse',actor:a.id,effect:k.effect,x:f.x/U,y:f.y/U,size:f.radius});f.next=s.tick+(k.period||30);
    }else if(f.mechanic==='trap'){
      const target=foes(s,a).find(t=>Math.abs(t.x-f.x)<=f.radius*U&&Math.abs(t.y-f.y)<=50*U&&t.z<25*U&&!t.invuln);
      if(target){hit(s,a,target,k,c);f.expires=0;s.events.push({type:'abilityPulse',actor:a.id,effect:k.effect,x:f.x/U,y:f.y/U,size:f.radius});}
    }else {area(s,a,k,c,f.x,f.y,f.radius,k.damage,true);f.expires=0;s.events.push({type:'abilityPulse',actor:a.id,effect:k.effect,x:f.x/U,y:f.y/U,size:f.radius});}
  }
  s.fields=s.fields.filter(f=>f.expires>s.tick);
}
export function tickAbilityProjectile(s,p,c){
  const a=s.actors.find(a=>a.id===p.owner);if(!a){p.remaining=0;return;}
  const k=p.skill;
  if(p.returning){const dx=a.x-p.x,dy=a.y-p.y;if(Math.abs(dx)<30*U&&Math.abs(dy)<30*U){a.mp=Math.min(10000,a.mp+(k.catchMp||0));p.remaining=0;s.events.push({type:'catch',actor:a.id,effect:k.effect,x:p.x/U,y:p.y/U});return;}const d=Math.max(1,Math.abs(dx)+Math.abs(dy)),speed=p.speed*U/60;p.dx=Math.round(dx/d*speed);p.dy=Math.round(dy/d*speed);}
  else if(k.seek){const t=nearest(s,{...a,x:p.x,y:p.y},450,110);if(t)p.dy=clamp(Math.round((t.y-p.y)*.035),-170,170);}
  p.x+=p.dx;p.y+=p.dy||0;p.remaining-=Math.abs(p.dx)+Math.abs(p.dy||0);
  for(const t of foes(s,a))if(!p.hitIds.includes(t.id)&&Math.abs(t.x-p.x)<36*U&&Math.abs(t.y-p.y)<30*U&&t.z<60*U){
    if(hit(s,a,t,k,c,p.damage)){p.hitIds.push(t.id);if(k.splash){area(s,a,{...k,damage:k.splashDamage},c,p.x,p.y,k.splash,k.splashDamage);s.events.push({type:'abilityPulse',actor:a.id,effect:k.effect,x:p.x/U,y:p.y/U,size:k.splash});}if(!k.pierce)p.remaining=0;}
  }
  if(p.remaining<=0&&k.returning&&!p.returning){p.returning=true;p.hitIds=[];p.remaining=(k.range+1280)*U;}else if(p.x<-100*U||p.x>5220*U||p.y<250*U||p.y>660*U)p.remaining=0;
}
export function tickStatuses(s,c){
  for(const t of s.actors){if(t.shieldUntil<=s.tick)t.shield=0;if(t.counterUntil<=s.tick)t.counterDamage=0;
    if(t.burnUntil>=s.tick&&t.burnNext<=s.tick&&t.hp>0){const a=s.actors.find(a=>a.id===t.burnOwner);if(a)c.impact(s,a,t,2,0,false);t.burnNext=s.tick+30;}}
}
