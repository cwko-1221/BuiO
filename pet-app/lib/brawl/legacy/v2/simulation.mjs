import {VERSION,TICKS,MAX_TICKS,INPUT as I,VALID_MASK,FIGHTERS,ENEMIES,STAGES,DIFFICULTIES,fighterById,stageById} from './catalog.mjs';
import * as legacy from '../simulation.mjs';
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
  if(options.version&&options.version!==VERSION)throw new Error('Unsupported battle version');
  const {fighterId=FIGHTERS[0].id,stageId=STAGES[0].id,difficulty='easy',mode='campaign',seed=1,opponentId=FIGHTERS[1].id}=options;
  if(!fighterById(fighterId)||!stageById(stageId)||!DIFFICULTIES[difficulty]||!['campaign','practice','tutorial','duel'].includes(mode)||!fighterById(opponentId))throw new Error('Invalid battle settings');
  const s={version:VERSION,seed:seed>>>0,rng:(seed>>>0)||1,fighterId,stageId,difficulty,mode,opponentId,tick:0,nextId:1,zone:0,spawned:0,total:6,spawnAt:0,status:'playing',retries:0,cleared:false,actors:[],projectiles:[],events:[],pickups:[],lesson:0,bossAdds:false,lastMask:0,freeze:0,comboHits:0,comboUntil:0,bestCombo:0,kills:0};
  s.actors.push(actor(s,fighterId,0,190,455));
  if(mode==='duel')s.actors.push(actor(s,opponentId,1,920,455));
  else if(mode==='practice'||mode==='tutorial'){const a=actor(s,'puppet',1,630,455);a.hp=a.maxHp=99999;a.dummy=true;s.actors.push(a);}
  return s;
}
function wave(s){
  s.total=s.zone===3?1:[6,8,10][s.zone];s.spawned=0;s.spawnAt=s.tick+30;s.cleared=false;s.bossAdds=false;
}
function begin(s,a,action,duration){a.action=action;a.actionTick=0;a.actionDuration=duration;a.hitIds=[];a.skill=-1;}
function skill(s,a,n){const f=fighterById(a.kind);if(!f)return false;const k=f.skills[n];if(a.z>0||a.cooldowns[n]>0||a.mp<k.mp*U)return false;begin(s,a,`skill${n+1}`,n===0?38:48);a.skill=n;a.mp-=k.mp*U;a.cooldowns[n]=k.cooldown;s.events.push({type:'cast',actor:a.id,skill:n});return true;}
function attack(s,a,n=0){
  a.rush=a.action==='run';
  a.combo=n;a.phase++;
  const enemyDelay=a.team===1&&!fighterById(a.kind)&&!a.boss?({easy:12,normal:6,hard:2}[s.difficulty])+10:0;
  // Capture the wind-up when the move starts; crossing half HP cannot shorten
  // an already visible telegraph underneath the player.
  a.windup=6+(n===2?4:0)+(a.boss?Math.round(DIFFICULTIES[s.difficulty].telegraph*(a.kind==='golem'&&a.hp<a.maxHp/2?.75:1)):a.team===1&&!fighterById(a.kind)?{easy:24,normal:18,hard:12}[s.difficulty]:0);
  begin(s,a,a.z>0?'air':`attack${n+1}`,a.z>0?24:a.boss?a.windup+40:Math.max(a.windup+14,20+(n===2?10:0)+(a.kind==='pudding-pig'?4:0)+enemyDelay));a.queued=false;
  s.events.push({type:'swing',actor:a.id,combo:n,air:a.z>0,rush:a.rush});
}
function impact(s,a,t,damage,knock=0,down=false){
  if(t.hp<=0||t.invuln>0||a.team===t.team)return;
  const d=DIFFICULTIES[s.difficulty];if(a.team===1&&!fighterById(a.kind))damage=Math.round(damage*d.damage/100);
  const facing=a.x===t.x?-t.facing:Math.sign(a.x-t.x);
  const blocked=t.action==='guard'&&t.facing===facing&&t.guard>0&&t.z===0;
  if(blocked){t.guard=Math.max(0,t.guard-damage*200);damage=Math.max(1,Math.floor(damage*.2));if(t.guard===0)begin(s,t,'break',45);}
  t.hp=Math.max(0,t.hp-damage);a.stop=down?3:1;t.stop=down?7:4;s.freeze=Math.max(s.freeze,down?4:2);
  if(a.team===0&&!blocked){s.comboHits=s.tick<=s.comboUntil?s.comboHits+1:1;s.comboUntil=s.tick+120;s.bestCombo=Math.max(s.bestCombo,s.comboHits);a.mp=Math.min(10000,a.mp+damage*20);}
  if(!blocked){t.hitChain=s.tick-t.lastHit<120?t.hitChain+1:1;t.lastHit=s.tick;t.knock=(a.x<=t.x?1:-1)*knock*U;
    if((!t.boss||t.action==='idle'||t.action==='walk')&&t.action!=='fall'){if(down||t.hitChain>=4){begin(s,t,'fall',30);t.hitChain=0;if(t.team===0)t.invuln=42;t.vz=Math.max(t.vz,420);t.z=Math.max(t.z,1);}else {begin(s,t,'hit',12);if(t.team===0)t.invuln=10;}}
  }
  s.events.push({type:blocked?'block':'hit',actor:t.id,source:a.id,damage,heavy:down,x:t.x/U,y:t.y/U,z:t.z/U});
  if(t.hp===0){begin(s,t,'fall',36);s.events.push({type:'ko',actor:t.id,x:t.x/U,y:t.y/U});if(t.team===1&&!t.dummy){s.kills++;if(s.mode==='campaign'&&s.kills%3===0)s.pickups.push({id:s.nextId++,kind:s.kills%6===0?'health':'mana',x:t.x,y:t.y,expires:s.tick+1200});}}
}
function melee(s,a,damage,range,depth=28,all=false,down=false){for(const t of s.actors){if(t.team===a.team||t.hp<=0||a.hitIds.includes(t.id))continue;const dx=(t.x-a.x)/U,dy=Math.abs(t.y-a.y)/U;
  if(Math.abs(dx)<=range&&dy<=depth&&(all||dx*a.facing>=-22)&&Math.abs(t.z-a.z)<(a.action==='skill2'?25:65)*U){a.hitIds.push(t.id);impact(s,a,t,damage,down?13:5,down);}
}}
function projectile(s,a,damage,range,speed=500,depthOffset=0,ground=false){s.projectiles.push({id:s.nextId++,owner:a.id,team:a.team,x:a.x+a.facing*45*U,y:a.y+depthOffset*U,z:(ground?8:35)*U,ground,dx:Math.round(a.facing*speed*U/TICKS),remaining:range*U,damage,hitIds:[]});}
function ai(s,a){
  if(a.dummy||a.hp<=0)return 0;
  if(s.tick-a.lastThink<6)return a.aiMask;
  a.lastThink=s.tick;const p=s.actors[0],dx=(p.x-a.x)/U,dy=(p.y-a.y)/U,e=fighterById(a.kind)||ENEMIES[a.kind];let mask=0;
  if(Math.abs(dx)>1&&['idle','walk','run','guard','jump'].includes(a.action))a.facing=Math.sign(dx);
  const busy=s.actors.filter(t=>t.team===1&&t.id!==a.id&&t.hp>0&&t.action.startsWith('attack')).length;
  const range=a.kind==='thrower'||a.kind==='squirrel'?320:a.boss&&(a.phase+1)%2===0?300:(e.range||85);
  if(Math.abs(dy)>18)mask|=dy>0?I.DOWN:I.UP;
  if(Math.abs(dx)>range*.85)mask|=dx>0?I.RIGHT:I.LEFT;
  else if(Math.abs(dx)<80&&a.kind==='thrower')mask|=dx>0?I.LEFT:I.RIGHT;
  if(Math.abs(dx)<range&&Math.abs(dy)<26&&s.tick>=a.nextAttack&&busy<DIFFICULTIES[s.difficulty].slots){
    mask|=I.ATTACK;a.nextAttack=s.tick+DIFFICULTIES[s.difficulty].reaction+40+Math.floor(random(s)*45);
    if(fighterById(a.kind)&&random(s)<.4)mask=I.SKILL1;else if(a.kind==='shield'&&random(s)<.28)mask=I.GUARD;
  }
  if(a.kind==='slime'&&s.tick%120<6)mask|=I.JUMP;
  a.aiMask=mask;return mask;
}
function updateActor(s,a,mask){
  if(a.hp<=0){a.actionTick++;return;}
  a.cooldowns=a.cooldowns.map(c=>Math.max(0,c-1));a.invuln=Math.max(0,a.invuln-1);
  a.mp=Math.min(10000,a.mp+10);if(a.action!=='guard')a.guard=Math.min(10000,a.guard+25);
  const pressed=mask&~a.lastMask;a.lastMask=mask;
  if(a.stop>0){a.stop--;return;}
  if(a.z>0||a.vz>0){a.z+=a.vz;a.vz-=36;if(a.z<=0){a.z=0;a.vz=0;s.events.push({type:'land',actor:a.id});if(a.action==='jump')begin(s,a,'idle',0);}}
  const moving=(mask&(I.LEFT|I.RIGHT|I.UP|I.DOWN))!==0;
  if(pressed&I.GUARD){a.guardCombo=s.tick;a.guardDirection=false;}
  if(s.tick-a.guardCombo<=24&&(mask&(a.facing===1?I.RIGHT:I.LEFT)))a.guardDirection=true;
  let requested=-1;if(pressed&I.SKILL1)requested=0;else if(pressed&I.SKILL2)requested=1;
  if(a.guardDirection&&s.tick-a.guardCombo<=24){if(pressed&I.ATTACK)requested=0;if(pressed&I.JUMP)requested=1;}
  if(pressed&I.ATTACK){a.bufferUntil=s.tick+10;if(a.action.startsWith('attack')&&a.actionTick>=6)a.queued=true;}
  if(a.team===0&&(mask&I.ATTACK)&&a.action.startsWith('attack')&&a.actionTick>=10)a.queued=true;
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
    const v=Math.round(e.speed*U/TICKS*(sprint?1.5:1)),diag=dx&&dy?.7071:1;
    a.x+=Math.round(dx*v*diag);a.y+=Math.round(dy*v*.7*diag);
    if(a.z===0){a.action=moving?(sprint?'run':'walk'):'idle';if(moving)a.moveTick++;}
  }else if(a.action.startsWith('attack')||a.action==='air'){
    const n=a.action==='air'?0:a.combo,start=a.windup||6;
    if(a.team===0&&a.rush&&a.actionTick<10)a.x+=a.facing*5*U;
    if(a.actionTick===start)s.events.push({type:'strike',actor:a.id,combo:n,air:a.action==='air',rush:a.rush});
    if(a.actionTick===1&&a.team===1&&a.boss)s.events.push({type:'warning',actor:a.id});
    if(a.boss&&a.phase%2===0&&a.kind==='puppet'&&a.actionTick>=start&&a.actionTick<start+18){a.x+=a.facing*13*U;melee(s,a,e.damage+3,95,40,false,true);}
    if(a.boss&&a.kind==='squirrel'&&a.phase%2===0&&a.actionTick>=start&&a.actionTick<start+24){a.z=Math.round(Math.sin((a.actionTick-start)/24*Math.PI)*90*U);a.x+=a.facing*8*U;if(a.actionTick===start+23){a.z=0;melee(s,a,18,135,55,true,true);}}
    if(a.actionTick>=start&&a.actionTick<start+4){
      if(a.boss&&a.kind==='golem'&&a.phase%2===0){if(a.actionTick===start)for(const direction of [-1,1]){const facing=a.facing;a.facing=direction;for(const depth of [-60,0,60])projectile(s,a,18,700,420,depth,true);a.facing=facing;}}
      else if(a.kind==='squirrel'){if(a.phase%2!==0&&a.actionTick===start)for(const depth of [-36,0,36])projectile(s,a,e.damage,600,500,depth);}
      else if(a.kind==='thrower'){if(a.actionTick===start)projectile(s,a,e.damage,600);}
      else if(a.boss&&a.kind==='puppet'&&a.phase%2===0){}
      else melee(s,a,f?(a.action==='air'?[14,12,18][FIGHTERS.indexOf(f)]:f.damage[n]+(a.rush?4:0)):e.damage,f?(n===2?112:a.rush?105:92):(e.range||90),a.boss?70:f?34:28,a.boss&&a.kind==='golem',n===2||a.boss||a.rush||a.action==='air');
    }
  }else if(a.action.startsWith('skill')&&f){
    const k=f.skills[a.skill],t=a.actionTick;
    if(t===(k.kind==='bolt'?12:k.kind==='dash'?10:20))s.events.push({type:'skillRelease',actor:a.id,skill:a.skill,kind:k.kind});
    if(k.kind==='dash'&&t>=10&&t<28){a.x+=Math.round(a.facing*k.range*U/18);if(a.kind==='starpatch-cat'&&t<18)a.invuln=2;melee(s,a,k.damage,75,28,false,true);}
    if(k.kind==='bolt'&&t===12)projectile(s,a,k.damage,k.range);
    if(k.kind==='vortex'&&[20,26,32].includes(t)){a.hitIds=[];melee(s,a,k.damage,k.range,45,false,t===32);}
    if(['stomp','sweep'].includes(k.kind)&&t===20)melee(s,a,k.damage,k.range,50,true,true);
  }
  if(a.knock){a.x+=a.knock;a.knock=Math.round(a.knock*.65);if(Math.abs(a.knock)<20)a.knock=0;}
  a.x=clamp(a.x,45*U,(s.mode==='campaign'?(s.cleared?5115:s.zone*1280+1235):1235)*U);a.y=clamp(a.y,345*U,565*U);
  if(a.actionDuration&&a.actionTick>=a.actionDuration){const old=a.action;
    if(old==='fall'){begin(s,a,'rise',20);a.invuln=a.team===0?56:20;}
    else if(old.startsWith('attack')&&a.queued&&a.combo<2)attack(s,a,a.combo+1);
    else {begin(s,a,'idle',0);if(old==='rise')a.invuln=a.team===0?36:0;}
  }
}
export function stepBattle(s,mask=0){
  if(s.version==='brawl-v1')return legacy.stepBattle(s,mask);
  if(!Number.isInteger(mask)||mask<0||mask>VALID_MASK)throw new Error('Invalid input');
  if(['won','lost','draw'].includes(s.status))return s;
  s.tick++;s.events=[];
  if(s.tick>=MAX_TICKS){s.status='lost';return s;}
  if(s.freeze>0&&s.status==='playing'){s.freeze--;s.frozenPress=(s.frozenPress||0)|(mask&(I.ATTACK|I.JUMP|I.SKILL1|I.SKILL2));return s;}
  mask|=s.frozenPress||0;s.frozenPress=0;
  if(s.status==='ko'){
    if(mask&I.RETRY&&s.retries===0){s.retries++;s.actors=[s.actors[0]];const p=s.actors[0];p.hp=p.maxHp;p.mp=p.guard=10000;p.x=(s.zone*1280+190)*U;p.y=455*U;p.z=p.vz=p.stop=p.knock=p.hitChain=p.runDirection=0;p.invuln=90;p.cooldowns=[0,0];p.bufferUntil=-1;p.guardCombo=p.lastHit=-999;p.guardDirection=p.queued=false;p.lastTap=[-99,-99];begin(s,p,'idle',0);p.lastMask=0;s.projectiles=[];s.pickups=[];s.status='playing';wave(s);s.events.push({type:'retry'});}
    else if(mask&I.END)s.status='lost';return s;
  }
  if(s.tick>=MAX_TICKS){s.status='lost';return s;}
  if(s.mode==='campaign'){
    const alive=s.actors.filter(a=>a.team===1&&a.hp>0).length,limit=s.zone===3?3:[3,4,6][s.zone];
    if(s.spawned<s.total&&alive<limit&&s.tick>=s.spawnAt){const stage=stageById(s.stageId),kind=s.zone===3?stage.boss:stage.enemies[Math.floor(random(s)*stage.enemies.length)];
      const a=actor(s,kind,1,s.zone*1280+720+random(s)*400,360+random(s)*190,s.zone===3);if(a.boss)a.actionDuration=0;s.actors.push(a);s.spawned++;s.spawnAt=s.tick+48;}
    const boss=s.actors.find(a=>a.boss&&a.team===1&&a.hp>0);if(boss&&boss.hp<boss.maxHp/2&&!s.bossAdds){s.bossAdds=true;for(let i=0;i<2;i++)s.actors.push(actor(s,'mushroom',1,s.zone*1280+850+i*100,380+i*140));}
  }
  for(const a of s.actors)updateActor(s,a,a.team===0?mask:ai(s,a));
  for(const p of s.projectiles){p.x+=p.dx;p.remaining-=Math.abs(p.dx);const owner=s.actors.find(a=>a.id===p.owner);if(!owner)continue;
    for(const t of s.actors)if(t.hp>0&&t.team!==p.team&&!p.hitIds.includes(t.id)&&Math.abs(t.x-p.x)<36*U&&Math.abs(t.y-p.y)<25*U&&t.z<(p.ground?25:60)*U){p.hitIds.push(t.id);impact(s,owner,t,p.damage,6);p.remaining=0;break;}}
  s.projectiles=s.projectiles.filter(p=>p.remaining>0);
  for(const item of s.pickups){if(Math.abs(s.actors[0].x-item.x)<55*U&&Math.abs(s.actors[0].y-item.y)<35*U&&s.actors[0].z<20*U){const p=s.actors[0];if(item.kind==='health')p.hp=Math.min(p.maxHp,p.hp+18);else p.mp=Math.min(10000,p.mp+2500);item.expires=0;s.events.push({type:'pickup',kind:item.kind,x:item.x/U,y:item.y/U});}}
  s.pickups=s.pickups.filter(item=>item.expires>s.tick);
  s.actors=s.actors.filter(a=>a.team===0||a.hp>0||a.actionTick<40);
  const p=s.actors[0];
  if(p.hp<=0){if(s.mode==='practice'||s.mode==='tutorial'){p.hp=p.maxHp;begin(s,p,'idle',0);}else s.status=s.mode==='campaign'&&s.retries===0?'ko':'lost';}
  if(s.mode==='campaign'&&s.status==='playing'&&s.spawned>=s.total&&!s.actors.some(a=>a.team===1&&a.hp>0)){
    if(!s.cleared)s.events.push({type:s.zone===3?'victory':'clear',zone:s.zone});
    s.cleared=true;if(s.zone===3){s.status='won';begin(s,p,'win',0);}else if(p.x>=((s.zone+1)*1280)*U){s.zone++;s.actors=[p];s.projectiles=[];s.pickups=[];p.hp=Math.min(p.maxHp,p.hp+20);p.mp=Math.min(10000,p.mp+2000);wave(s);s.events.push({type:'zone',zone:s.zone});}}
  if(s.mode==='duel'){
    const enemy=s.actors.find(a=>a.team===1);if(!enemy||enemy.hp===0)s.status='won';
    else if(s.tick>=5400){const difference=p.hp/p.maxHp-enemy.hp/enemy.maxHp;s.status=difference>0?'won':difference<0?'lost':'draw';}}
  if(s.mode==='tutorial'){
    const performed=[p.action==='walk'||p.action==='run',p.action.startsWith('attack'),p.z>0||p.vz>0,p.action==='guard',p.action==='skill1',p.action==='skill2'];
    if(performed[s.lesson])s.lesson++;if(s.lesson===6)s.status='won';
  }
  return s;
}
export function battleResult(s){if(s.version==='brawl-v1')return legacy.battleResult(s);return {outcome:s.status,ticks:s.tick,seconds:Math.round(s.tick/TICKS),retries:s.retries,hp:s.actors[0].hp,bestCombo:s.bestCombo,kills:s.kills,stars:s.status==='won'&&s.mode==='campaign'?1+Number(s.retries===0)+Number(s.tick<=18000&&s.actors[0].hp>=s.actors[0].maxHp*.4):0};}
export function replayBattle(options,inputs,endTick,{terminal=true}={}){
  if(options.version==='brawl-v1')return legacy.replayBattle(options,inputs,endTick,{terminal});
  if(!Number.isInteger(endTick)||endTick<0||endTick>MAX_TICKS||!Array.isArray(inputs)||inputs.length>MAX_TICKS+1)throw new Error('Invalid replay size');
  let previous=-1;for(const f of inputs){if(!f||!Number.isInteger(f.tick)||f.tick<=previous||f.tick<1||f.tick>endTick||!Number.isInteger(f.mask)||f.mask<0||f.mask>VALID_MASK)throw new Error('Invalid replay input');previous=f.tick;}
  const s=createBattle(options);let index=0,mask=0;
  for(let tick=1;tick<=endTick;tick++){if(inputs[index]?.tick===tick)mask=inputs[index++].mask;stepBattle(s,mask);if(s.tick!==tick)throw new Error('Replay continues after result');}
  if(terminal&&!['won','lost'].includes(s.status))throw new Error('Battle is not complete');return s;
}
