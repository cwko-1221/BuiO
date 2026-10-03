// Shared, integer-coordinate combat. No renderer callbacks, clocks or randomness.
const U=100,clamp=(n,l,h)=>Math.max(l,Math.min(h,n));
const foes=(s,a)=>s.actors.filter(t=>t.team!==a.team&&t.hp>0);
const bound=(s,x)=>clamp(Math.round(x),45*U,(s.mode==='campaign'?(s.cleared?5115:s.zone*1280+1235):1235)*U);
const nearest=(s,a,range,depth=85)=>foes(s,a).filter(t=>Math.abs(t.x-a.x)<=range*U&&Math.abs(t.y-a.y)<=depth*U).sort((l,r)=>Math.abs(l.x-a.x)+2*Math.abs(l.y-a.y)-Math.abs(r.x-a.x)-2*Math.abs(r.y-a.y)||l.id-r.id)[0];
const wind=k=>k.windup??12;
export function abilityDuration(k){return k.duration??Math.max(38,wind(k)+((k.volleys||k.pulses||1)-1)*(k.interval||k.period||8)+20);}
export function setupAbility(s,a,k){
  const target=nearest(s,a,k.range);a.abilityFacing=a.facing;
  a.abilityMotion={x:a.x,y:a.y,toX:bound(s,a.x+a.facing*k.range*U),toY:a.y,target:target?.id||0};
  a.abilityCaught=0;a.abilityContact=-1;
}
function release(s,a,k,extra={}){s.events.push({type:'skillRelease',actor:a.id,skill:a.skill,kind:k.kind,mechanic:k.mechanic,effect:k.effect,element:k.element,range:k.range,x:a.x/U,y:a.y/U,facing:a.facing,...extra});}
function status(s,a,t,k){
  if(k.slowTicks)t.slowUntil=Math.max(t.slowUntil||0,s.tick+k.slowTicks);
  if(k.rootTicks&&(!k.enemy||s.tick>=(t.rootReadyAt||0))){t.rootUntil=Math.max(t.rootUntil||0,s.tick+(t.boss?Math.min(12,k.rootTicks):k.rootTicks));if(k.enemy)t.rootReadyAt=t.rootUntil+90;}
  if(k.wetTicks||k.element==='water')t.wetUntil=s.tick+(k.wetTicks||150);
  if(k.burnTicks){const fresh=!(t.burnUntil>s.tick);t.burnOwner=a.id;t.burnUntil=Math.max(t.burnUntil||0,s.tick+k.burnTicks);if(fresh){t.burnNext=s.tick+30;s.events.push({type:'elementStatus',actor:t.id,element:'fire',x:t.x/U,y:t.y/U});}}
  if(k.markTicks){t.readOwner=a.id;t.readUntil=s.tick+k.markTicks;}
  if(k.element==='ice'){
    t.slowUntil=Math.max(t.slowUntil||0,s.tick+(k.slowTicks||90));
    t.chill=s.tick<(t.chillUntil||0)?(t.chill||0)+1:1;t.chillUntil=s.tick+100;
    if((k.freezeTicks||t.chill>=2)&&s.tick>=(t.freezeReadyAt||0)){
      t.freezeUntil=s.tick+(t.boss?24:k.freezeTicks||60);t.freezeReadyAt=t.freezeUntil+180;t.chill=0;
      s.events.push({type:'elementStatus',actor:t.id,element:'ice',x:t.x/U,y:t.y/U});
    }
  }
  if(k.shockTicks&&(!k.enemy||s.tick>=(t.shockReadyAt||0))){t.shockUntil=Math.max(t.shockUntil||0,s.tick+(t.boss?10:k.shockTicks));if(k.enemy)t.shockReadyAt=t.shockUntil+90;}
}
function hit(s,a,t,k,c,damage=k.damage,down=false,chain=false){
  const soaked=k.element==='lightning'&&t.wetUntil>s.tick;
  const before=s.events.length;
  const landed=c.impact(s,a,t,damage+(soaked?3:0),k.knock??(down?11:3),down,chain,{skill:true,element:k.element});
  if(landed&&s.events.slice(before).some(e=>e.type==='hit'&&e.actor===t.id&&e.source===a.id)){status(s,a,t,k);if(soaked){t.wetUntil=0;s.events.push({type:'elementStatus',actor:t.id,element:'lightning',x:t.x/U,y:t.y/U});}}
  return landed;
}
function area(s,a,k,c,x=a.x,y=a.y,r=k.radius||k.range,damage=k.damage,down=false,chain=false){
  for(const t of foes(s,a))if(!k.ignoreIds?.includes(t.id)&&Math.abs(t.x-x)<=r*U&&Math.abs(t.y-y)<=Math.min(78,r*.65)*U&&t.z<(k.airHit?150:45)*U)hit(s,a,t,k,c,damage,down,chain);
}
function line(s,a,k,c,damage=k.damage,down=false,chain=false){
  for(const t of foes(s,a)){const dx=(t.x-a.x)*a.facing,depth=k.mechanic==='flamethrower'?18+(k.depth||55)*clamp(dx/(k.range*U),0,1):k.depth||34;
    if(dx>=-15*U&&dx<=k.range*U&&Math.abs(t.y-a.y)<=depth*U&&t.z<65*U)hit(s,a,t,k,c,damage,down,chain);}
}
function buff(s,a,k){const until=s.tick+(k.buffTicks||150);
  if(k.shield){a.shield=k.shield;a.shieldUntil=until;}
  if(k.reflect)a.reflectUntil=until;
  if(k.haste){a.haste=k.haste;a.hasteUntil=until;}
  if(k.counter){a.counterDamage=k.counter;a.counterRange=k.range;a.counterUntil=until;a.counterEffect=k.effect;}
}
function field(s,a,k,extra={},announce=true){
  const f={id:s.nextId++,owner:a.id,team:a.team,kind:k.kind,effect:k.effect,element:k.element,mechanic:k.mechanic,x:bound(s,a.x+a.facing*k.range*U),y:a.y,radius:k.radius||90,spawnedAt:s.tick,starts:s.tick+(k.arm||0),expires:s.tick+(k.life||120),next:s.tick+(k.arm||0),facing:a.facing,pulses:0,skill:{...k},...extra};
  s.fields.push(f);if(announce)release(s,a,k,{fieldId:f.id,x:f.x/U,y:f.y/U,radius:f.radius,arm:Math.max(0,f.starts-s.tick),life:f.expires-s.tick});return f;
}
function shot(s,a,k,c,lane=0,extra={}){
  c.projectile(s,a,k.damage,k.range,k.speed||500,lane);
  const p=s.projectiles.at(-1);Object.assign(p,{ability:true,style:k.effect,element:k.element,skill:{...k},startX:a.x,returning:false,speed:k.speed||500,dy:0,bounces:0,...extra});return p;
}
function pulse(s,a,k,x,y,size){s.events.push({type:'abilityPulse',actor:a.id,effect:k.effect,element:k.element,x:x/U,y:y/U,size,kind:k.kind});}
export function updateAbility(s,a,k,t,c){
  const start=wind(k),q=t-start;
  if(k.mechanic==='projectile'||k.mechanic==='wave'){
    if(q>=0&&q%(k.interval||10)===0&&q/(k.interval||10)<(k.volleys||1)){release(s,a,k,{phase:q/(k.interval||10)});for(const lane of k.spread||[0])shot(s,a,k,c,lane);}
  }else if(['beam','stretch','orbit','flamethrower'].includes(k.mechanic)){
    const n=q/(k.period||8),pulses=k.pulses||1;
    if(q>=0&&Number.isInteger(n)&&n<pulses){release(s,a,k,{phase:n});const damage=n===pulses-1?k.finisher||k.damage:k.damage;
      if(k.mechanic==='orbit')area(s,a,k,c,a.x,a.y,k.range,damage,n===pulses-1,true);else line(s,a,k,c,damage,!!k.down,pulses>1);}
  }else if(k.mechanic==='lob'){
    if(q===0){release(s,a,k);const p=shot(s,a,k,c,0,{lob:true,flight:k.flight||36,age:0,fromX:a.x,fromY:a.y,toX:a.abilityMotion.toX,toY:a.y,remaining:k.range*U});p.z=45*U;}
  }else if(k.mechanic==='sky-shot'){
    const flight=a.actionDuration-start-8,progress=clamp(q/flight,0,1);
    if(q>=0&&q<=flight){a.z=Math.round((k.height||145)*U*4*progress*(1-progress));a.vz=0;
      if(q===Math.floor(flight*.45)){release(s,a,k);shot(s,a,k,c,0,{lob:true,flight:18,age:0,fromX:a.x,fromY:a.y,toX:a.abilityMotion.toX,toY:a.y,height:a.z/U,remaining:k.range*U});}
      if(q===flight){a.z=0;s.events.push({type:'land',actor:a.id});}}
  }else if(k.mechanic==='rasengan'){
    const m=a.abilityMotion;
    if(q===0)release(s,a,k);
    if(q>=0&&!a.abilityCaught&&q<22){a.x=bound(s,m.x+a.facing*k.range*U*(q+1)/22);
      const target=foes(s,a).find(t=>Math.abs(t.x-(a.x+a.facing*45*U))<80*U&&Math.abs(t.y-a.y)<38*U&&t.z<45*U&&!t.invuln);
      if(target&&hit(s,a,target,{...k,knock:0},c,k.damage,false,true)){a.abilityCaught=target.id;a.abilityContact=q;target.rootUntil=s.tick+(target.boss?12:30);}}
    const caught=s.actors.find(t=>t.id===a.abilityCaught),elapsed=q-a.abilityContact;
    if(caught&&caught.hp>0&&Math.abs(caught.x-a.x)<140*U&&Math.abs(caught.y-a.y)<50*U&&caught.z<65*U&&elapsed>0&&elapsed%(k.period||9)===0){const n=elapsed/(k.period||9);
      if(n<=k.pulses){const finish=n===k.pulses;hit(s,a,caught,{...k,knock:finish?15:0},c,finish?k.finisher:k.damage,finish,true);pulse(s,a,k,caught.x,caught.y,finish?150:65);}}
  }else if(t===start){
    if(k.mechanic==='fissure'||k.mechanic==='rain'){
      const target=s.actors.find(t=>t.id===a.abilityMotion.target),centerX=target?.x??a.abilityMotion.toX,centerY=target?.y??a.y,count=k.columns||3;
      for(let n=0;n<count;n++){
        const offset=n-(count-1)/2,x=k.mechanic==='fissure'?a.x+a.facing*(k.range-(count-1-n)*k.gap)*U:centerX+offset*k.gap*.65*U;
        const y=k.mechanic==='fissure'?a.y:clamp(centerY+offset*22*U,345*U,565*U),starts=s.tick+k.arm+n*k.interval;
        field(s,a,k,{x:bound(s,x),y,mechanic:'eruption',starts,next:starts,expires:starts+48},n===0);}
    }else if(['trap','field','tornado','barrage'].includes(k.mechanic))field(s,a,k);
    else if(k.mechanic==='sanctuary'){buff(s,a,k);field(s,a,k,{x:a.x,y:a.y,starts:s.tick,next:s.tick,mechanic:'sanctuary'});}
    else if(k.mechanic==='buff'){buff(s,a,k);release(s,a,k);}
    else if(k.mechanic==='scan'){release(s,a,k);area(s,a,k,c);}
    else if(k.mechanic==='chain'){
      let origin=a;const visited=new Set();release(s,a,k);
      for(let n=0;n<(k.jumps||3);n++){
        const target=foes(s,a).filter(e=>!visited.has(e.id)&&Math.abs(e.x-origin.x)<=(n?k.jumpRange:k.range)*U&&Math.abs(e.y-origin.y)<=85*U&&e.z<65*U).sort((l,r)=>Math.abs(l.x-origin.x)+2*Math.abs(l.y-origin.y)-Math.abs(r.x-origin.x)-2*Math.abs(r.y-origin.y)||l.id-r.id)[0];
        if(!target)break;visited.add(target.id);hit(s,a,target,k,c,Math.max(5,Math.round(k.damage*Math.pow(.72,n))));
        s.events.push({type:'abilityLink',actor:a.id,effect:k.effect,element:k.element,fromX:origin.x/U,fromY:origin.y/U,x:target.x/U,y:target.y/U});origin=target;
      }
    }else if(k.mechanic==='clones'){
      for(let n=0;n<(k.clones||3);n++)field(s,a,k,{x:bound(s,a.x+a.facing*(90+n*50)*U),y:clamp(a.y+(n-1)*32*U,345*U,565*U),starts:s.tick,next:s.tick+18+n*14,expires:s.tick+k.life},n===0);
    }
  }
}
export function tickFields(s,c){
  for(const f of s.fields){
    const a=s.actors.find(a=>a.id===f.owner);if(!a||a.hp<=0){f.expires=0;continue;}const k=f.skill;
    if(f.mechanic==='tornado')f.x=bound(s,f.x+f.facing*(k.speed||60)*U/60);
    if(k.pull&&s.tick>=f.starts)for(const t of foes(s,a))if(Math.abs(t.x-f.x)<f.radius*U&&Math.abs(t.y-f.y)<75*U&&t.z<35*U){const dx=f.x-t.x,dy=f.y-t.y,d=Math.max(U,Math.abs(dx)+Math.abs(dy)),pull=k.pull*U*(t.boss?.2:1);t.x=bound(s,t.x+dx/d*pull);t.y=clamp(Math.round(t.y+dy/d*pull),345*U,565*U);}
    if(s.tick<f.next||s.tick<f.starts)continue;
    if(f.mechanic==='sanctuary'){
      if(f.pulses<4){for(const t of s.actors)if(t.team===a.team&&t.hp>0&&Math.abs(t.x-f.x)<=f.radius*U&&Math.abs(t.y-f.y)<75*U)t.hp=Math.min(t.maxHp,t.hp+k.heal);
        for(const t of foes(s,a))if(Math.abs(t.x-f.x)<=f.radius*U&&Math.abs(t.y-f.y)<75*U)t.slowUntil=s.tick+(k.slowTicks||0);
        pulse(s,a,k,f.x,f.y,f.radius);f.pulses++;}f.next=s.tick+k.period;
    }else if(f.mechanic==='barrage'){
      if(f.pulses<(k.volleys||3)){const proxy={...a,x:f.x,y:f.y,facing:f.facing};shot(s,proxy,{...k,range:k.shotRange},c);f.pulses++;pulse(s,a,k,f.x,f.y,70);}f.next=s.tick+k.period;
    }else if(['field','tornado','clones'].includes(f.mechanic)){
      if(f.mechanic==='clones'){for(const t of foes(s,a))if(Math.abs(t.x-f.x)<=k.range*U&&(t.x-f.x)*f.facing>=-20*U&&Math.abs(t.y-f.y)<=42*U&&t.z<45*U)hit(s,a,t,k,c);}
      else area(s,a,k,c,f.x,f.y,f.radius,k.damage);
      pulse(s,a,k,f.x,f.y,f.radius);f.next=s.tick+(k.period||30);
    }else if(f.mechanic==='trap'){
      const target=foes(s,a).find(t=>Math.abs(t.x-f.x)<=f.radius*U&&Math.abs(t.y-f.y)<=50*U&&t.z<25*U&&!t.invuln);
      if(target){hit(s,a,target,k,c);f.expires=0;pulse(s,a,k,f.x,f.y,f.radius);}
    }else if(!f.fired){area(s,a,k,c,f.x,f.y,f.radius,k.damage,k.element!=='ice');f.fired=true;f.next=f.expires+1;pulse(s,a,k,f.x,f.y,f.radius);}
  }
  s.fields=s.fields.filter(f=>f.expires>s.tick);
}
function projectileBurst(s,p,a,k,c,directId=0){
  const r=k.radius||k.splash||100;
  if(p.lob)area(s,a,k,c,p.x,p.y,r,k.damage,true);
  else if(k.splash)area(s,a,{...k,ignoreIds:[directId]},c,p.x,p.y,k.splash,k.splashDamage);
  pulse(s,a,k,p.x,p.y,r);
  if((p.lob&&k.life)||k.impactField)field(s,a,{...k,damage:k.fieldDamage||2,arm:0,mechanic:'field'},{x:p.x,y:p.y,mechanic:'field'},false);
}
export function tickAbilityProjectile(s,p,c){
  const a=s.actors.find(a=>a.id===p.owner);if(!a){p.remaining=0;return;}const k=p.skill;
  if(p.lob){p.age++;const q=clamp(p.age/p.flight,0,1);p.x=bound(s,p.fromX+(p.toX-p.fromX)*q);p.y=Math.round(p.fromY+(p.toY-p.fromY)*q);p.z=Math.round((p.height||k.height||170)*U*4*q*(1-q)+45*U*(1-q));if(q===1){p.z=0;p.remaining=0;projectileBurst(s,p,a,k,c);}return;}
  if(p.returning){const dx=a.x-p.x,dy=a.y-p.y;
    if(Math.abs(dx)<30*U&&Math.abs(dy)<30*U){a.mp=Math.min(10000,a.mp+(k.catchMp||0));p.remaining=0;s.events.push({type:'catch',actor:a.id,effect:k.effect,x:p.x/U,y:p.y/U});return;}
    const d=Math.max(1,Math.abs(dx)+Math.abs(dy)),speed=p.speed*U/60;p.dx=Math.round(dx/d*speed);p.dy=Math.round(dy/d*speed);
  }else if(k.seek){const t=nearest(s,{...a,x:p.x,y:p.y},450,110);if(t)p.dy=clamp(Math.round((t.y-p.y)*.035),-180,180);}
  p.x+=p.dx;p.y+=p.dy||0;p.remaining-=Math.abs(p.dx)+Math.abs(p.dy||0);
  for(const t of foes(s,a))if(!p.hitIds.includes(t.id)&&Math.abs(t.x-p.x)<(k.size||36)*U&&Math.abs(t.y-p.y)<(k.depth||30)*U&&t.z<65*U){
    if(hit(s,a,t,k,c,p.damage,!!k.down)){p.hitIds.push(t.id);if(k.splash)projectileBurst(s,p,a,k,c,t.id);
      const next=k.ricochets>p.bounces?foes(s,a).filter(e=>!p.hitIds.includes(e.id)&&Math.abs(e.x-p.x)<260*U&&Math.abs(e.y-p.y)<100*U).sort((l,r)=>Math.abs(l.x-p.x)+Math.abs(l.y-p.y)-Math.abs(r.x-p.x)-Math.abs(r.y-p.y)||l.id-r.id)[0]:null;
      if(next){const dx=next.x-p.x,dy=next.y-p.y,d=Math.max(1,Math.abs(dx)+Math.abs(dy));p.dx=Math.round(dx/d*p.speed*U/60);p.dy=Math.round(dy/d*p.speed*U/60);p.bounces++;}
      else if(!k.pierce)p.remaining=0;
    }
  }
  if(p.remaining<=0&&k.returning&&!p.returning){p.returning=true;p.hitIds=[];p.remaining=(k.range+1280)*U;}
  else if(p.remaining<=0&&!k.returning&&k.splash&&!p.hitIds.length)projectileBurst(s,p,a,k,c);
  if(p.x<-100*U||p.x>5220*U||p.y<250*U||p.y>660*U)p.remaining=0;
}
export function tickStatuses(s,c){
  for(const t of s.actors){
    if(t.shieldUntil<=s.tick)t.shield=0;if(t.counterUntil<=s.tick)t.counterDamage=0;
    if(t.burnUntil>=s.tick&&t.burnNext<=s.tick&&t.hp>0){const a=s.actors.find(a=>a.id===t.burnOwner);if(a)c.impact(s,a,t,2,0,false,false,{dot:true,skill:true,element:'fire'});t.burnNext=s.tick+30;}
    if(t.hp>0&&t.shield>0&&t.reflectUntil>s.tick)for(const p of s.projectiles)if(t.shield>0&&p.team!==t.team&&!p.lob&&(p.reflections||0)<2&&Math.abs(p.x-t.x)<75*U&&Math.abs(p.y-t.y)<55*U&&(p.x-t.x)*t.facing>=-20*U){p.owner=t.id;p.team=t.team;p.dx=-p.dx;p.dy=-(p.dy||0);p.returning=false;p.hitIds=[];p.reflections=(p.reflections||0)+1;t.shield=Math.max(0,t.shield-3);s.events.push({type:'reflect',actor:t.id,element:'light',x:p.x/U,y:p.y/U});}
  }
}
