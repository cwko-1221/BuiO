// Deterministic utility skills. Coordinates and lifetimes use simulation ticks.
const U=100,clamp=(n,l,h)=>Math.max(l,Math.min(h,n));
const right=s=>(s.mode==='campaign'?(s.cleared?5115:s.zone*1280+1235):1235)*U;
const targets=(s,a)=>s.actors.filter(t=>t.team!==a.team&&t.hp>0);
const nearest=(s,a)=>targets(s,a).sort((l,r)=>(Math.abs(l.x-a.x)+2*Math.abs(l.y-a.y))-(Math.abs(r.x-a.x)+2*Math.abs(r.y-a.y))||l.id-r.id)[0];
export function summonClones(s,owner,k,createActor){
  for(const old of s.actors.filter(a=>a.cloneOwner===owner.id))old.cloneExpires=s.tick;
  tickClones(s);
  for(let n=0;n<2;n++){
    const x=clamp(owner.x+owner.facing*(55+n*45)*U,45*U,right(s)),y=clamp(owner.y+(n?30:-30)*U,345*U,565*U);
    const a=createActor(s,owner.kind,owner.team,x/U,y/U);
    Object.assign(a,{cloneOwner:owner.id,cloneExpires:s.tick+k.life,hp:1,maxHp:1,mp:0,facing:owner.facing,nextAttack:s.tick+12+n*9});
    s.actors.push(a);s.events.push({type:'cloneSmoke',actor:a.id,x:x/U,y:y/U,spawn:true});
  }
}
export function tickClones(s){
  s.actors=s.actors.filter(a=>{
    if(!a.cloneOwner)return true;
    const owner=s.actors.find(t=>t.id===a.cloneOwner);
    if(a.hp>0&&a.cloneExpires>s.tick&&owner?.hp>0)return true;
    s.events.push({type:'cloneSmoke',actor:a.id,x:a.x/U,y:a.y/U,spawn:false});return false;
  });
}
export function cloneInput(s,a,I){
  const t=nearest(s,a);if(!t)return 0;
  const dx=t.x-a.x,dy=t.y-a.y;let mask=0;
  if(Math.abs(dx)>U)a.facing=Math.sign(dx);
  if(Math.abs(dy)>16*U)mask|=dy>0?I.DOWN:I.UP;
  if(Math.abs(dx)>65*U)mask|=dx>0?I.RIGHT:I.LEFT;
  if(Math.abs(dx)<90*U&&Math.abs(dy)<32*U&&t.z<65*U&&s.tick>=a.nextAttack){mask|=I.ATTACK;a.nextAttack=s.tick+38;}
  return mask;
}
export function updateFlight(s,a,mask,c,I){
  a.action='flight';a.actionDuration=0;a.actionTick++;a.z=220*U;a.vz=0;a.knock=0;
  const dx=(mask&I.RIGHT?1:0)-(mask&I.LEFT?1:0),dy=(mask&I.DOWN?1:0)-(mask&I.UP?1:0);
  if(dx)a.facing=dx;
  a.x=clamp(a.x+dx*350,45*U,right(s));a.y=clamp(a.y+dy*245,345*U,565*U);if(dx||dy)a.moveTick++;
  if(mask&I.ATTACK&&a.flightShots>0&&s.tick>=a.flightNextShot){
    a.flightShots--;a.flightNextShot=s.tick+24;
    const t=targets(s,a).filter(t=>(t.x-a.x)*a.facing>=-20*U&&Math.abs(t.x-a.x)<=900*U&&Math.abs(t.y-a.y)<=65*U&&t.z<65*U).sort((l,r)=>Math.abs(l.x-a.x)-Math.abs(r.x-a.x)||l.id-r.id)[0];
    if(t)c.impact(s,a,t,14,7,false,false,{ranged:true});
    s.events.push({type:'airRay',actor:a.id,element:'wind',x:a.x/U,y:a.y/U,z:a.z/U,facing:a.facing,toX:t?t.x/U:a.x/U+a.facing*800,toY:t?t.y/U:a.y/U,shots:a.flightShots});
  }
}
