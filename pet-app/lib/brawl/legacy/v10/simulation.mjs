import {summonClones,tickClones,cloneInput,updateFlight} from './fighter-utility.mjs';
import {enemyBrain,prepareEnemyAttack,runEnemyAttack} from './enemy-combat.mjs';
import {VERSION,TICKS,MAX_TICKS,INPUT as I,VALID_MASK,FIGHTERS,ENEMIES,STAGES,DIFFICULTIES,fighterById as releasedFighterById,combatFighterById as fighterById,stageById} from './catalog.mjs';
import * as legacy from '../simulation.mjs';
import * as v2 from '../v2/simulation.mjs';
import * as v3 from '../v3/simulation.mjs';
import * as v4 from '../v4/simulation.mjs';
import * as v5 from '../v5/simulation.mjs';
import * as v6 from '../v6/simulation.mjs';
import * as v7 from '../v7/simulation.mjs';
import * as v8 from '../v8/simulation.mjs';
import * as v9 from '../v9/simulation.mjs';
import {abilityDuration,setupAbility,updateAbility,tickFields,tickAbilityProjectile,tickStatuses} from './abilities.mjs';
const combat={impact,melee,projectile,summon:(s,a,k)=>summonClones(s,a,k,actor)};
const U=100;
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
function random(s){let x=s.rng;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng/4294967296;}
function actor(s,kind,team,x,y,boss=false){
  const f=fighterById(kind),e=f||ENEMIES[kind],d=DIFFICULTIES[s.difficulty];
  const hp=f?e.hp:Math.round(e.hp*d.hp/100);
  return {id:s.nextId++,kind,team,boss,x:Math.round(x*U),y:Math.round(y*U),z:0,vz:0,facing:team===0?1:-1,hp,maxHp:hp,mp:10000,guard:10000,action:'idle',actionTick:0,actionDuration:0,combo:0,queued:false,bufferUntil:-1,hitIds:[],cooldowns:[0,0],stop:0,invuln:0,lastMask:0,stun:0,knock:0,hitChain:0,lastHit:-999,lastThink:-999,aiMask:0,nextAttack:0,guardCombo:-999,guardDirection:false,lastTap:[-99,-99],phase:0,moveTick:0,skill:-1};
}
export function createBattle(options={}){
  if(options.version==='brawl-v1')return legacy.createBattle(options);
  if(options.version==='brawl-v2')return v2.createBattle(options);
  if(options.version==='brawl-v3')return v3.createBattle(options);
  if(options.version==='brawl-v4')return v4.createBattle(options);
  if(options.version==='brawl-v5')return v5.createBattle(options);
  if(options.version==='brawl-v6')return v6.createBattle(options);
  if(options.version==='brawl-v7')return v7.createBattle(options);
  if(options.version==='brawl-v8')return v8.createBattle(options);if(options.version==='brawl-v9')return v9.createBattle(options);
  if(options.version&&options.version!==VERSION)throw new Error('Unsupported battle version');
  const {fighterId=FIGHTERS[0].id,stageId=STAGES[0].id,difficulty='easy',mode='campaign',seed=1,opponentId=FIGHTERS[1].id}=options;
  if(!releasedFighterById(fighterId)||!stageById(stageId)||!DIFFICULTIES[difficulty]||!['campaign','practice','tutorial','duel','pvp'].includes(mode)||!releasedFighterById(opponentId))throw new Error('Invalid battle settings');
  const s={version:VERSION,seed:seed>>>0,rng:(seed>>>0)||1,fighterId,stageId,difficulty,mode,opponentId,tick:0,nextId:1,zone:0,spawned:0,total:stageById(stageId).encounters[0],spawnAt:0,status:'playing',retries:0,cleared:false,actors:[],projectiles:[],fields:[],hazards:[],events:[],pickups:[],lesson:0,bossAdds:false,lastMask:0,freeze:0,comboHits:0,comboUntil:0,bestCombo:0,kills:0};
  s.actors.push(actor(s,fighterId,0,190,455));
  if(mode==='duel'||mode==='pvp'){s.actors.push(actor(s,opponentId,1,920,455));if(mode==='pvp')s.actors[1].human=true;}
  else if(mode==='practice'||mode==='tutorial'){const a=actor(s,'puppet',1,630,455);a.hp=a.maxHp=99999;a.dummy=true;s.actors.push(a);}
  return s;
}
function wave(s){
  s.total=s.zone===3?1:stageById(s.stageId).encounters[s.zone];s.spawned=0;s.spawnAt=s.tick+30;s.cleared=false;s.bossAdds=false;
}
function begin(s,a,action,duration){a.action=action;a.actionTick=0;a.actionDuration=duration;a.hitIds=[];a.skill=-1;a.catTarget=0;a.catMotion=null;a.abilityMotion=null;a.enemyAttack=null;if(action!=='idle')a.catQueueUntil=-1;}
function catTarget(s,a,k){
  // Stable target selection is shared by the client, saves and server replay.
  const candidates=s.actors.filter(t=>t.team!==a.team&&t.hp>0&&t.invuln===0&&t.z<65*U&&Math.abs(t.x-a.x)<=k.range*U&&Math.abs(t.y-a.y)<=(k.kind==='blink'?48:70)*U&&((t.x-a.x)*a.facing>=-22*U||(k.kind==='flurry'&&t.starMarkOwner===a.id&&t.starMarkUntil>s.tick)));
  return candidates.sort((l,r)=>{
    const marked=t=>k.kind==='flurry'&&t.starMarkOwner===a.id&&t.starMarkUntil>s.tick?1:0;
    return marked(r)-marked(l)||(Math.abs(l.x-a.x)+2*Math.abs(l.y-a.y))-(Math.abs(r.x-a.x)+2*Math.abs(r.y-a.y))||l.id-r.id;
  })[0];
}
function skill(s,a,n){const f=fighterById(a.kind);if(!f)return false;const k=f.skills[n];if(a.z>0||a.cooldowns[n]>0||a.mp<k.mp*U)return false;begin(s,a,`skill${n+1}`,k.mechanic?abilityDuration(k):k.kind==='blink'?28:n===0?38:48);a.skill=n;a.mp-=k.mp*U;a.cooldowns[n]=k.cooldown;
  if(k.kind==='blink'||k.kind==='flurry'){const target=catTarget(s,a,k);a.catTarget=target?.id||0;a.catMotion={x:a.x,y:a.y,toX:target?target.x-a.facing*56*U:a.x+a.facing*100*U,toY:target?.y??a.y};}
  if(k.mechanic)setupAbility(s,a,k);
  s.events.push({type:'cast',actor:a.id,skill:n});return true;
}
function attack(s,a,n=0){
  a.rush=a.action==='run';
  a.combo=n;a.phase++;
  const enemyDelay=a.team===1&&!fighterById(a.kind)&&!a.boss?({easy:12,normal:6,hard:2}[s.difficulty])+10:0;
  // Capture the wind-up when the move starts; crossing half HP cannot shorten
  // an already visible telegraph underneath the player.
  a.windup=6+(n===2?4:0)+(a.boss?Math.round(DIFFICULTIES[s.difficulty].telegraph*(a.kind==='golem'&&a.hp<a.maxHp/2?.75:1)):a.team===1&&!fighterById(a.kind)?{easy:24,normal:18,hard:12}[s.difficulty]:0);
  begin(s,a,a.z>0?'air':`attack${n+1}`,a.z>0?24:a.boss?a.windup+40:Math.max(a.windup+14,20+(n===2?10:0)+(a.kind==='pudding-pig'?4:0)+enemyDelay));a.queued=false;prepareEnemyAttack(s,a);
  s.events.push({type:'swing',actor:a.id,combo:n,air:a.z>0,rush:a.rush});
}
function impact(s,a,t,damage,knock=0,down=false,chain=false,options={}){
  if(t.flightUntil>s.tick||t.hp<=0||!options.ignoreInvuln&&!options.dot&&t.invuln>0&&!(chain&&t.invulnSource===a.id&&t.action==='hit')||a.team===t.team)return false;
  const d=DIFFICULTIES[s.difficulty];if(!options.scaled&&a.team===1&&!fighterById(a.kind))damage=Math.round(damage*d.damage/100);
  const facing=a.x===t.x?-t.facing:Math.sign(a.x-t.x);
  const blocked=!options.unblockable&&!options.dot&&t.action==='guard'&&t.facing===facing&&t.guard>0&&t.z===0;
  if(!options.dot&&!options.reflected&&t.wardUntil>s.tick&&(t.wardMeleeLeft>0||t.wardRangedLeft>0)){
    const ranged=options.ranged||Math.abs(a.x-t.x)>170*U;
    if(ranged){t.wardRangedLeft=0;t.wardMeleeLeft=0;t.wardUntil=0;}else{t.wardMeleeLeft--;if(!t.wardMeleeLeft){t.wardUntil=0;t.wardRangedLeft=0;}}
    s.events.push({type:'reflect',actor:t.id,source:a.id,element:'psychic',x:t.x/U,y:t.y/U,toX:a.x/U,toY:a.y/U,ranged,remaining:t.wardMeleeLeft});
    impact(s,t,a,damage,6,false,false,{skill:true,reflected:true,scaled:true,ignoreInvuln:true,unblockable:true});return false;
  }
  if(!options.dot&&t.counterDamage&&t.counterUntil>s.tick&&Math.abs(a.x-t.x)<=(t.counterRange||150)*U&&Math.abs(a.y-t.y)<=60*U&&t.facing===facing){const retaliation=t.counterDamage;t.counterDamage=0;t.invuln=Math.max(t.invuln,12);s.events.push({type:'counter',actor:t.id,source:a.id,effect:t.counterEffect,x:t.x/U,y:t.y/U});impact(s,t,a,retaliation,8,false,false,{skill:true});return false;}
  if(t.shield>0&&t.shieldUntil>s.tick){const absorbed=Math.min(t.shield,damage);t.shield-=absorbed;damage-=absorbed;s.events.push({type:'barrier',actor:t.id,damage:absorbed,x:t.x/U,y:t.y/U});if(damage<=0)return false;}
  const mindMarked=!options.dot&&!options.reflected&&!blocked&&t.readOwner===a.id&&t.readUntil>s.tick;
  if(mindMarked){damage+=t.readBonus||8;t.readUntil=0;t.mindStunUntil=s.tick+(t.readStun||60);s.events.push({type:'mindStun',actor:t.id,x:t.x/U,y:t.y/U});}
  if(t.cloneOwner)damage=1;
  if(blocked){t.guard=Math.max(0,t.guard-damage*200);damage=Math.max(1,Math.floor(damage*.2));if(t.guard===0)begin(s,t,'break',45);}
  t.hp=Math.max(0,t.hp-damage);if(!options.dot){a.stop=down?3:1;t.stop=down?7:4;s.freeze=Math.max(s.freeze,down?4:2);}
  if(!options.dot&&(a.team===0||a.human)&&!blocked){a.comboHits=s.tick<=(a.comboUntil||0)?(a.comboHits||0)+1:1;a.comboUntil=s.tick+120;a.bestCombo=Math.max(a.bestCombo||0,a.comboHits);if(a.team===0){s.comboHits=s.tick<=s.comboUntil?s.comboHits+1:1;s.comboUntil=s.tick+120;s.bestCombo=Math.max(s.bestCombo,s.comboHits);}}
  // Basic strikes reward engaging at close range; skills and damage over time never refund their cost.
  let mpGain=0;if(!options.dot&&!options.skill&&!blocked&&!a.cloneOwner&&fighterById(a.kind)){const before=a.mp;a.mp=Math.min(10000,a.mp+Math.min(200,damage*10));mpGain=a.mp-before;}
  if(!options.dot&&!blocked){t.hitChain=s.tick-t.lastHit<120?t.hitChain+1:1;t.lastHit=s.tick;t.knock=(a.x<=t.x?1:-1)*knock*U;
    if((!t.boss||t.action==='idle'||t.action==='walk')&&t.action!=='fall'){if(down||t.hitChain>=4){begin(s,t,'fall',30);t.hitChain=0;if(t.team===0||t.human){t.invuln=42;t.invulnSource=a.id;}t.vz=Math.max(t.vz,420);t.z=Math.max(t.z,1);}else {begin(s,t,'hit',12);if(t.team===0||t.human){t.invuln=10;t.invulnSource=a.id;}}}
  }
  s.events.push({type:options.dot?'statusTick':blocked?'block':'hit',element:options.element,...(mpGain?{mpGain}:{}),actor:t.id,source:a.id,damage,heavy:down,x:t.x/U,y:t.y/U,z:t.z/U});
  if(t.hp===0){begin(s,t,'fall',36);s.events.push({type:'ko',actor:t.id,x:t.x/U,y:t.y/U});if(t.team===1&&!t.dummy&&!t.cloneOwner){s.kills++;if(s.mode==='campaign'&&s.kills%3===0)s.pickups.push({id:s.nextId++,kind:s.kills%6===0?'health':'mana',x:t.x,y:t.y,expires:s.tick+1200});}}
  return true;
}
function melee(s,a,damage,range,depth=28,all=false,down=false){for(const t of s.actors){if(t.team===a.team||t.hp<=0||a.hitIds.includes(t.id))continue;const dx=(t.x-a.x)/U,dy=Math.abs(t.y-a.y)/U;
  if(Math.abs(dx)<=range&&dy<=depth&&(all||dx*a.facing>=-22)&&Math.abs(t.z-a.z)<(a.action==='skill2'?25:65)*U){a.hitIds.push(t.id);impact(s,a,t,damage,down?13:5,down);}
}}
function projectile(s,a,damage,range,speed=500,depthOffset=0,ground=false){s.projectiles.push({id:s.nextId++,owner:a.id,team:a.team,x:a.x+a.facing*45*U,y:a.y+depthOffset*U,z:(ground?8:35)*U,ground,dx:Math.round(a.facing*speed*U/TICKS),remaining:range*U,damage,hitIds:[]});}
function catStrike(s,a,target,damage,phase,finisher=false,mark=false){
  if(!target||target.hp<=0||Math.abs(target.x-a.x)>100*U||Math.abs(target.y-a.y)>40*U||target.z>=65*U)return;
  const empowered=finisher&&target.starMarkOwner===a.id&&target.starMarkUntil>s.tick;
  const hp=target.hp,eventStart=s.events.length;impact(s,a,target,damage+(empowered?6:0),finisher?10:2,finisher,s.mode==='pvp'&&a.skill===1,{skill:true});
  const hit=s.events.slice(eventStart).some(e=>e.type==='hit'&&e.actor===target.id&&e.source===a.id);
  if(hp>target.hp&&hit){if(mark){target.starMarkOwner=a.id;target.starMarkUntil=s.tick+240;}if(empowered)target.starMarkUntil=0;}
  s.events.push({type:'catStrike',actor:a.id,target:target.id,phase,empowered:!!empowered,x:target.x/U,y:target.y/U,z:target.z/U});
}
function catSkill(s,a,k,t){
  const target=s.actors.find(e=>e.id===a.catTarget),motion=a.catMotion;
  if(k.kind==='blink'){
    if(t===6){const fromX=a.x/U,fromY=a.y/U;
      // Only the locked foe is struck: crossing a crowd never deals charge damage.
      const reachable=target&&target.hp>0&&Math.abs(target.x-a.x)<=k.range*U&&Math.abs(target.y-a.y)<=48*U;
      const right=(s.mode==='campaign'?(s.cleared?5115:s.zone*1280+1235):1235)*U;
      let landing=clamp(reachable?target.x-target.facing*62*U:a.x+a.facing*100*U,45*U,right);
      if(reachable&&(landing-target.x)*target.facing>-24*U)landing=clamp(target.x+target.facing*62*U,45*U,right);
      a.x=landing;
      if(reachable){a.y=target.y;a.facing=target.x>=a.x?1:-1;}a.invuln=Math.max(a.invuln,12);a.knock=0;
      s.events.push({type:'skillRelease',actor:a.id,skill:a.skill,kind:k.kind,x:a.x/U,y:a.y/U,fromX,fromY});
      if(reachable)catStrike(s,a,target,k.damage,0,false,true);
    }
  }else if(motion){
    // A committed arc, rather than homing or repeated teleports. Enemies can escape it.
    if(t>=6&&t<=34){const q=(t-6)/28,ease=Math.min(1,q*2);a.x=Math.round(motion.x+(motion.toX-motion.x)*ease);a.y=Math.round(motion.y+(motion.toY-motion.y)*ease);a.z=Math.round(110*U*4*q*(1-q));a.vz=0;
      if(target&&target.hp>0)a.facing=target.x>=a.x?1:-1;
      if(t===6)s.events.push({type:'skillRelease',actor:a.id,skill:a.skill,kind:k.kind});
      if([16,23,30].includes(t))catStrike(s,a,target,t===30?16:7,(t-16)/7,t===30);
      if(t===34){a.z=0;s.events.push({type:'land',actor:a.id});}
    }
  }
}
function ai(s,a){
  if(a.dummy||a.hp<=0)return 0;
  if(s.tick-a.lastThink<6)return a.aiMask;
  a.lastThink=s.tick;const p=s.actors.filter(t=>t.team!==a.team&&t.hp>0).sort((l,r)=>(Math.abs(l.x-a.x)+2*Math.abs(l.y-a.y))-(Math.abs(r.x-a.x)+2*Math.abs(r.y-a.y))||l.id-r.id)[0];if(!p)return 0;const dx=(p.x-a.x)/U,dy=(p.y-a.y)/U,e=fighterById(a.kind)||ENEMIES[a.kind];let mask=0;
  if(Math.abs(dx)>1&&['idle','walk','run','guard','jump'].includes(a.action))a.facing=Math.sign(dx);
  const busy=s.actors.filter(t=>t.team===1&&t.id!==a.id&&t.hp>0&&t.action.startsWith('attack')).length;
  const fighter=fighterById(a.kind),available=fighter?.skills.map((k,n)=>({k,n})).filter(({k,n})=>!a.cooldowns[n]&&a.mp>=k.mp*U)||[];
  const brain=enemyBrain(a);
  const range=fighter?(available.length?Math.min(310,Math.max(105,...available.map(({k})=>(k.range||160)*.65))):85):brain==='thrower'||brain==='squirrel'?320:a.boss&&(a.phase+1)%2===0?300:(e.range||85);
  if(Math.abs(dy)>18)mask|=dy>0?I.DOWN:I.UP;
  if(Math.abs(dx)>range*.85)mask|=dx>0?I.RIGHT:I.LEFT;
  else if(Math.abs(dx)<80&&brain==='thrower')mask|=dx>0?I.LEFT:I.RIGHT;
  if(Math.abs(dx)<range&&Math.abs(dy)<26&&s.tick>=a.nextAttack&&busy<DIFFICULTIES[s.difficulty].slots){
    mask|=I.ATTACK;a.nextAttack=s.tick+DIFFICULTIES[s.difficulty].reaction+40+Math.floor(random(s)*45);
    if(fighter){const choices=available.filter(({k})=>Math.abs(dx)<=Math.max(150,k.range||150));const choice=choices[Math.floor(random(s)*choices.length)];if(choice&&random(s)<.75)mask=choice.n===0?I.SKILL1:I.SKILL2;else if(Math.abs(dx)>110)mask=dx>0?I.RIGHT:I.LEFT;}else if(brain==='shield'&&random(s)<.28)mask=I.GUARD;
  }
  if(brain==='slime'&&s.tick%120<6)mask|=I.JUMP;
  a.aiMask=mask;return mask;
}
function updateActor(s,a,mask){
  if(a.hp>0&&(a.freezeUntil>s.tick||a.mindStunUntil>s.tick)){a.invuln=Math.max(0,a.invuln-1);a.lastMask=mask;return;}
  if(a.shockUntil>s.tick)mask&=~(I.SKILL1|I.SKILL2);
  if(a.hp<=0){a.actionTick++;return;}
  a.cooldowns=a.cooldowns.map(c=>Math.max(0,c-1));a.invuln=Math.max(0,a.invuln-1);
  a.mpRegenCarry=(a.mpRegenCarry||0)+200;const manaGain=Math.floor(a.mpRegenCarry/TICKS);a.mpRegenCarry%=TICKS;a.mp=Math.min(10000,a.mp+manaGain);if(a.action!=='guard')a.guard=Math.min(10000,a.guard+25);
  if(a.flightUntil>s.tick){updateFlight(s,a,mask,combat,I);a.lastMask=mask;return;}
  const pressed=mask&~a.lastMask;a.lastMask=mask;
  if(a.kind==='starpatch-cat'&&a.action==='skill1'&&a.actionTick>=6&&(pressed&I.SKILL2))a.catQueueUntil=s.tick+30;
  if(a.stop>0){a.stop--;return;}
  if((a.z>0||a.vz>0)&&!(a.action==='skill2'&&a.kind==='starpatch-cat')&&!(a.action.startsWith('skill')&&['leap','sky-shot'].includes(fighterById(a.kind)?.skills[a.skill]?.mechanic))){a.z+=a.vz;a.vz-=36;if(a.z<=0){a.z=0;a.vz=0;s.events.push({type:'land',actor:a.id});if(a.action==='jump')begin(s,a,'idle',0);}}
  const moving=(mask&(I.LEFT|I.RIGHT|I.UP|I.DOWN))!==0;
  if(pressed&I.GUARD){a.guardCombo=s.tick;a.guardDirection=false;}
  if(s.tick-a.guardCombo<=24&&(mask&(a.facing===1?I.RIGHT:I.LEFT)))a.guardDirection=true;
  let requested=-1;if(pressed&I.SKILL1)requested=0;else if(pressed&I.SKILL2)requested=1;
  if(requested<0&&a.kind==='starpatch-cat'&&a.action==='idle'&&a.catQueueUntil>=s.tick)requested=1;
  if(a.guardDirection&&s.tick-a.guardCombo<=24){if(pressed&I.ATTACK)requested=0;if(pressed&I.JUMP)requested=1;}
  if(pressed&I.ATTACK){a.bufferUntil=s.tick+10;if(a.action.startsWith('attack')&&a.actionTick>=6)a.queued=true;}
  if((a.team===0||a.human)&&(mask&I.ATTACK)&&a.action.startsWith('attack')&&a.actionTick>=10)a.queued=true;
  const free=['idle','walk','run','guard','jump'].includes(a.action);
  if(free){
    if(requested>=0&&skill(s,a,requested)){a.bufferUntil=-1;a.guardCombo=-999;}
    else if(a.bufferUntil>=s.tick&&!(mask&I.GUARD)){attack(s,a);a.bufferUntil=-1;}
    else if((pressed&I.JUMP)&&a.z===0){a.vz=900;begin(s,a,'jump',0);s.events.push({type:'jump',actor:a.id});}
    else if(mask&I.GUARD&&a.z===0&&a.guard>0){if(a.action!=='guard')begin(s,a,'guard',0);}
    else if(a.action==='guard')begin(s,a,'idle',0);
  }
  a.actionTick++;
  const f=fighterById(a.kind),e=f||ENEMIES[a.kind];
  if(['idle','walk','run','jump'].includes(a.action)){
    let dx=(mask&I.RIGHT?1:0)-(mask&I.LEFT?1:0),dy=(mask&I.DOWN?1:0)-(mask&I.UP?1:0);
    if(dx)a.facing=dx;
    for(const [n,bit] of [[0,I.LEFT],[1,I.RIGHT]])if(pressed&bit){a.runDirection=s.tick-a.lastTap[n]<=15?(n===0?-1:1):0;a.lastTap[n]=s.tick;}
    if(!dx||a.runDirection!==dx)a.runDirection=0;
    const sprint=(mask&I.RUN)!==0||!!a.runDirection;
    const statusSpeed=(a.rootUntil>s.tick?0:a.slowUntil>s.tick?.55:1)*(a.hasteUntil>s.tick?a.haste:1);
    const v=Math.round(e.speed*U/TICKS*(sprint?1.5:1)*statusSpeed),diag=dx&&dy?.7071:1;
    a.x+=Math.round(dx*v*diag);a.y+=Math.round(dy*v*.7*diag);
    if(a.z===0){a.action=moving?(sprint?'run':'walk'):'idle';if(moving)a.moveTick++;}
  }else if(a.action.startsWith('attack')||a.action==='air'){
    const n=a.action==='air'?0:a.combo,start=a.windup||6;
    if((a.team===0||a.human)&&a.rush&&a.actionTick<10)a.x+=a.facing*5*U;
    if(a.actionTick===start)s.events.push({type:'strike',actor:a.id,combo:n,air:a.action==='air',rush:a.rush});
    if(a.actionTick===1&&a.team===1&&a.boss)s.events.push({type:'warning',actor:a.id});
    if(!runEnemyAttack(s,a,combat)){
    if(a.boss&&a.phase%2===0&&a.kind==='puppet'&&a.actionTick>=start&&a.actionTick<start+18){a.x+=a.facing*13*U;melee(s,a,e.damage+3,95,40,false,true);}
    if(a.boss&&a.kind==='squirrel'&&a.phase%2===0&&a.actionTick>=start&&a.actionTick<start+24){a.z=Math.round(Math.sin((a.actionTick-start)/24*Math.PI)*90*U);a.x+=a.facing*8*U;if(a.actionTick===start+23){a.z=0;melee(s,a,18,135,55,true,true);}}
    if(a.actionTick>=start&&a.actionTick<start+4){
      if(a.boss&&a.kind==='golem'&&a.phase%2===0){if(a.actionTick===start)for(const direction of [-1,1]){const facing=a.facing;a.facing=direction;for(const depth of [-60,0,60])projectile(s,a,18,700,420,depth,true);a.facing=facing;}}
      else if(a.kind==='squirrel'){if(a.phase%2!==0&&a.actionTick===start)for(const depth of [-36,0,36])projectile(s,a,e.damage,600,500,depth);}
      else if(a.kind==='thrower'){if(a.actionTick===start)projectile(s,a,e.damage,600);}
      else if(a.boss&&a.kind==='puppet'&&a.phase%2===0){}
      else melee(s,a,f?(a.action==='air'?(f.airDamage??f.damage[2]):f.damage[n]+(a.rush?4:0)):e.damage,f?(n===2?112:a.rush?105:92):(e.range||90),a.boss?70:f?34:28,a.boss&&a.kind==='golem',n===2||a.boss||a.rush||a.action==='air');
    }
    }
  }else if(a.action.startsWith('skill')&&f){
    const k=f.skills[a.skill],t=a.actionTick;
    if(k.mechanic)updateAbility(s,a,k,t,combat);
    else if(k.kind==='blink'||k.kind==='flurry')catSkill(s,a,k,t);
    else if(t===(k.kind==='bolt'?12:k.kind==='dash'?10:20))s.events.push({type:'skillRelease',actor:a.id,skill:a.skill,kind:k.kind});
    if(!k.mechanic&&k.kind==='dash'&&t>=10&&t<28){a.x+=Math.round(a.facing*k.range*U/18);if(a.kind==='starpatch-cat'&&t<18)a.invuln=2;melee(s,a,k.damage,75,28,false,true);}
    if(k.kind==='bolt'&&t===12)projectile(s,a,k.damage,k.range);
    if(k.kind==='vortex'&&[20,26,32].includes(t)){a.hitIds=[];melee(s,a,k.damage,k.range,45,false,t===32);}
    if(['stomp','sweep'].includes(k.kind)&&t===20)melee(s,a,k.damage,k.range,50,true,true);
  }
  if(a.knock){a.x+=a.knock;a.knock=Math.round(a.knock*.65);if(Math.abs(a.knock)<20)a.knock=0;}
  a.x=clamp(a.x,45*U,(s.mode==='campaign'?(s.cleared?5115:s.zone*1280+1235):1235)*U);a.y=clamp(a.y,345*U,565*U);
  if(a.actionDuration&&a.actionTick>=a.actionDuration){const old=a.action;
    if(old==='fall'){begin(s,a,'rise',20);a.invuln=a.team===0||a.human?56:20;}
    else if(old.startsWith('attack')&&a.queued&&a.combo<2)attack(s,a,a.combo+1);
    else {begin(s,a,'idle',0);if(old==='rise')a.invuln=a.team===0||a.human?36:0;}
  }
}
export function stepBattle(s,mask=0,opponentMask=0){
  if(s.version==='brawl-v1')return legacy.stepBattle(s,mask);
  if(s.version==='brawl-v2')return v2.stepBattle(s,mask);
  if(s.version==='brawl-v3')return v3.stepBattle(s,mask);
  if(s.version==='brawl-v4')return v4.stepBattle(s,mask,opponentMask);
  if(s.version==='brawl-v5')return v5.stepBattle(s,mask,opponentMask);
  if(s.version==='brawl-v6')return v6.stepBattle(s,mask,opponentMask);
  if(s.version==='brawl-v7')return v7.stepBattle(s,mask,opponentMask);
  if(s.version==='brawl-v8')return v8.stepBattle(s,mask,opponentMask);if(s.version==='brawl-v9')return v9.stepBattle(s,mask,opponentMask);
  if(!Number.isInteger(mask)||mask<0||mask>VALID_MASK)throw new Error('Invalid input');
  if(s.mode==='pvp'&&(!Number.isInteger(opponentMask)||opponentMask<0||opponentMask>1023||mask>1023))throw new Error('Invalid multiplayer input');
  if(['won','lost','draw'].includes(s.status))return s;
  s.tick++;s.events=[];
  if(s.tick>=MAX_TICKS){s.status='lost';return s;}
  // Timed summons and flight expire on world ticks even during hit-stop.
  tickClones(s);for(const a of s.actors)if(a.flightUntil&&a.flightUntil<=s.tick){a.flightUntil=0;a.flightShots=0;a.z=a.vz=0;begin(s,a,'idle',0);s.events.push({type:'land',actor:a.id,x:a.x/U,y:a.y/U});}
  if(s.freeze>0&&s.status==='playing'){s.freeze--;s.frozenPress=(s.frozenPress||0)|(mask&(I.ATTACK|I.JUMP|I.SKILL1|I.SKILL2));if(s.mode==='pvp')s.frozenOpponent=(s.frozenOpponent||0)|(opponentMask&(I.ATTACK|I.JUMP|I.SKILL1|I.SKILL2));return s;}
  mask|=s.frozenPress||0;s.frozenPress=0;
  if(s.mode==='pvp'){opponentMask|=s.frozenOpponent||0;s.frozenOpponent=0;}
  if(s.status==='ko'){
    if(mask&I.RETRY&&s.retries===0){s.retries++;s.actors=[s.actors[0]];const p=s.actors[0];p.hp=p.maxHp;p.mp=p.guard=10000;p.x=(s.zone*1280+190)*U;p.y=455*U;p.z=p.vz=p.stop=p.knock=p.hitChain=p.runDirection=0;p.invuln=90;p.cooldowns=[0,0];p.mpRegenCarry=p.burnNext=p.chill=p.chillUntil=0;p.shield=p.counterDamage=p.slowUntil=p.rootUntil=p.hasteUntil=p.burnUntil=p.readUntil=p.starMarkUntil=p.freezeUntil=p.shockUntil=p.wetUntil=p.freezeReadyAt=0;p.flightUntil=p.flightShots=p.wardUntil=p.wardMeleeLeft=p.wardRangedLeft=p.mindStunUntil=0;p.bufferUntil=-1;p.guardCombo=p.lastHit=-999;p.guardDirection=p.queued=false;p.lastTap=[-99,-99];begin(s,p,'idle',0);p.lastMask=0;s.projectiles=[];s.fields=[];s.hazards=[];s.pickups=[];s.status='playing';wave(s);s.events.push({type:'retry'});}
    else if(mask&I.END)s.status='lost';return s;
  }
  if(s.tick>=MAX_TICKS){s.status='lost';return s;}
  if(s.mode==='campaign'){
    const alive=s.actors.filter(a=>a.team===1&&a.hp>0).length,limit=s.zone===3?3:[3,4,6][s.zone];
    if(s.spawned<s.total&&alive<limit&&s.tick>=s.spawnAt){const stage=stageById(s.stageId),kind=s.zone===3?stage.boss:stage.enemies[Math.floor(random(s)*stage.enemies.length)];
      const a=actor(s,kind,1,s.zone*1280+720+random(s)*400,360+random(s)*190,s.zone===3);if(a.boss)a.actionDuration=0;s.actors.push(a);s.spawned++;s.spawnAt=s.tick+48;}
    const boss=s.actors.find(a=>a.boss&&a.team===1&&a.hp>0);if(boss&&boss.hp<boss.maxHp/2&&!s.bossAdds){s.bossAdds=true;for(let i=0;i<2;i++)s.actors.push(actor(s,stageById(s.stageId).enemies[i%stageById(s.stageId).enemies.length],1,s.zone*1280+850+i*100,380+i*140));}
  }
  tickClones(s);tickStatuses(s,combat);
  for(const a of [...s.actors])updateActor(s,a,a.cloneOwner?cloneInput(s,a,I):a.team===0?mask:s.mode==='pvp'?opponentMask:ai(s,a));
  for(const p of s.projectiles){if(p.ability){tickAbilityProjectile(s,p,combat);continue;}p.x+=p.dx;p.remaining-=Math.abs(p.dx);const owner=s.actors.find(a=>a.id===p.owner);if(!owner)continue;
    for(const t of s.actors)if(t.hp>0&&t.team!==p.team&&!p.hitIds.includes(t.id)&&Math.abs(t.x-p.x)<36*U&&Math.abs(t.y-p.y)<25*U&&t.z<(p.ground?25:60)*U){p.hitIds.push(t.id);impact(s,owner,t,p.damage,6,false,false,{ranged:true});p.remaining=0;break;}}
  s.projectiles=s.projectiles.filter(p=>p.remaining>0);
  tickFields(s,combat);
  for(const item of s.pickups){if(Math.abs(s.actors[0].x-item.x)<55*U&&Math.abs(s.actors[0].y-item.y)<35*U&&s.actors[0].z<20*U){const p=s.actors[0];if(item.kind==='health')p.hp=Math.min(p.maxHp,p.hp+18);else p.mp=Math.min(10000,p.mp+2500);item.expires=0;s.events.push({type:'pickup',kind:item.kind,x:item.x/U,y:item.y/U});}}
  s.pickups=s.pickups.filter(item=>item.expires>s.tick);
  tickClones(s);s.actors=s.actors.filter(a=>a.team===0||a.hp>0||a.actionTick<40);
  const p=s.actors[0];
  if(p.hp<=0){if(s.mode==='practice'||s.mode==='tutorial'){p.hp=p.maxHp;begin(s,p,'idle',0);}else s.status=s.mode==='campaign'&&s.retries===0?'ko':'lost';}
  if(s.mode==='campaign'&&s.status==='playing'&&s.spawned>=s.total&&!s.actors.some(a=>a.team===1&&a.hp>0)){
    if(!s.cleared)s.events.push({type:s.zone===3?'victory':'clear',zone:s.zone});
    s.cleared=true;if(s.zone===3){s.status='won';begin(s,p,'win',0);}else if(p.x>=((s.zone+1)*1280)*U){s.zone++;s.actors=[p];s.projectiles=[];s.fields=[];s.hazards=[];s.pickups=[];p.hp=Math.min(p.maxHp,p.hp+20);p.mp=Math.min(10000,p.mp+2000);wave(s);s.events.push({type:'zone',zone:s.zone});}}
  if(s.mode==='duel'||s.mode==='pvp'){
    const enemy=s.actors.find(a=>a.team===1);if(!enemy||enemy.hp===0)s.status='won';
    else if(s.tick>=5400){const difference=p.hp/p.maxHp-enemy.hp/enemy.maxHp;s.status=difference>0?'won':difference<0?'lost':'draw';}
    if(s.mode==='pvp'&&p.hp<=0&&enemy?.hp<=0)s.status='draw';}
  if(s.mode==='tutorial'){
    const performed=[p.action==='walk'||p.action==='run',p.action.startsWith('attack'),p.z>0||p.vz>0,p.action==='guard',p.action==='skill1',p.action==='skill2'];
    if(performed[s.lesson])s.lesson++;if(s.lesson===6)s.status='won';
  }
  return s;
}
export function battleResult(s){if(s.version==='brawl-v1')return legacy.battleResult(s);if(s.version==='brawl-v2')return v2.battleResult(s);if(s.version==='brawl-v3')return v3.battleResult(s);if(s.version==='brawl-v4')return v4.battleResult(s);if(s.version==='brawl-v5')return v5.battleResult(s);if(s.version==='brawl-v6')return v6.battleResult(s);if(s.version==='brawl-v7')return v7.battleResult(s);if(s.version==='brawl-v8')return v8.battleResult(s);if(s.version==='brawl-v9')return v9.battleResult(s);return {outcome:s.status,ticks:s.tick,seconds:Math.round(s.tick/TICKS),retries:s.retries,hp:s.actors[0].hp,bestCombo:s.bestCombo,kills:s.kills,stars:s.status==='won'&&s.mode==='campaign'?1+Number(s.retries===0)+Number(s.tick<=18000&&s.actors[0].hp>=s.actors[0].maxHp*.4):0};}
export function replayBattle(options,inputs,endTick,{terminal=true}={}){
  if(options.version==='brawl-v1')return legacy.replayBattle(options,inputs,endTick,{terminal});
  if(options.version==='brawl-v2')return v2.replayBattle(options,inputs,endTick,{terminal});if(options.version==='brawl-v3')return v3.replayBattle(options,inputs,endTick,{terminal});if(options.version==='brawl-v4')return v4.replayBattle(options,inputs,endTick,{terminal});if(options.version==='brawl-v5')return v5.replayBattle(options,inputs,endTick,{terminal});if(options.version==='brawl-v6')return v6.replayBattle(options,inputs,endTick,{terminal});if(options.version==='brawl-v7')return v7.replayBattle(options,inputs,endTick,{terminal});if(options.version==='brawl-v8')return v8.replayBattle(options,inputs,endTick,{terminal});if(options.version==='brawl-v9')return v9.replayBattle(options,inputs,endTick,{terminal});
  if(!Number.isInteger(endTick)||endTick<0||endTick>MAX_TICKS||!Array.isArray(inputs)||inputs.length>MAX_TICKS+1)throw new Error('Invalid replay size');
  let previous=-1;for(const f of inputs){if(!f||!Number.isInteger(f.tick)||f.tick<=previous||f.tick<1||f.tick>endTick||!Number.isInteger(f.mask)||f.mask<0||f.mask>VALID_MASK)throw new Error('Invalid replay input');previous=f.tick;}
  const s=createBattle(options);let index=0,mask=0;
  for(let tick=1;tick<=endTick;tick++){if(inputs[index]?.tick===tick)mask=inputs[index++].mask;stepBattle(s,mask);if(s.tick!==tick)throw new Error('Replay continues after result');}
  if(terminal&&!['won','lost'].includes(s.status))throw new Error('Battle is not complete');return s;
}
