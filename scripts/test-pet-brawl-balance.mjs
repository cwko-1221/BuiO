import assert from 'node:assert/strict';
import {FIGHTERS,ENEMIES,VERSION,INPUT as I,fightersForVersion} from '../pet-app/lib/brawl/catalog.mjs';
import {createBattle,stepBattle,replayBattle,battleResult} from '../pet-app/lib/brawl/simulation.mjs';
import * as v7 from '../pet-app/lib/brawl/legacy/v7/simulation.mjs';
import {ENEMIES as oldEnemies} from '../pet-app/lib/brawl/legacy/v7/catalog.mjs';

const run=(s,n,mask=0,opponent=0)=>{const events=[];for(let i=0;i<n;i++){stepBattle(s,mask,opponent);events.push(...s.events);}return events;};
assert.equal(VERSION,'brawl-v8');
for(const f of FIGHTERS)for(const [n,k] of f.skills.entries())assert.equal(k.mp,Math.ceil(fightersForVersion('brawl-v7').find(old=>old.id===f.id).skills[n].mp*1.25));
let s=createBattle({mode:'practice'}),p=s.actors[0];p.mp=1000;run(s,600);assert.equal(p.mp,3000);
s=createBattle({mode:'practice',fighterId:'dragon-ball-goku'});p=s.actors[0];stepBattle(s,I.SKILL1);run(s,130);stepBattle(s,I.SKILL2);assert.equal(p.action,'idle');assert.ok(p.mp<6000);
for(const [id,e] of Object.entries(ENEMIES)){assert.ok(e.hp>=oldEnemies[id].hp*1.14);assert.ok(e.damage>oldEnemies[id].damage);}
console.log('✓ All 50 skills cost 25% more MP, idle recovery is exactly 2 MP/sec, the ultimate cannot follow a beam without saving MP, and enemies are stronger');

s=createBattle({mode:'pvp',fighterId:'spark-hamster',opponentId:'dragon-ball-goku'});p=s.actors[0];let t=s.actors[1];t.x=p.x+28000;stepBattle(s,I.SKILL1);
let dotDuringChannel=false;const fireLog=[];
for(let i=0;i<95;i++){stepBattle(s);fireLog.push(...s.events);if(p.action==='skill1'&&s.events.some(e=>e.type==='statusTick'))dotDuringChannel=true;}
assert.ok(dotDuringChannel,'Repeated flame hits must not postpone burn damage');assert.ok(t.burnUntil-s.tick>=120);assert.ok(fireLog.filter(e=>e.type==='statusTick').length>=2);
const before=t.hp,combo=s.comboHits,mp=p.mp;Object.assign(t,{invuln:600,invulnSource:-1,action:'guard',facing:-1,guard:10000,counterDamage:50,counterUntil:s.tick+200});s.freeze=0;const later=run(s,60,0,I.GUARD);assert.equal(before-t.hp,4);assert.equal(s.comboHits,combo);assert.ok(p.mp-mp<=200);assert.equal(later.some(e=>e.type==='counter'),false);assert.equal(later.some(e=>e.type==='hit'||e.type==='block'),false);
assert.equal(t.action,'guard','Burn must not create a perpetual stun');
run(s,200);const expired=t.hp;run(s,60);assert.equal(t.hp,expired);
console.log('✓ Burning lasts three seconds after the final hit, ticks while flames are channeling, survives hit invulnerability and guard, expires, and grants no MP or stun');

function freeze(boss=false){const s=createBattle({mode:'pvp',fighterId:'snowfeather-penguin',opponentId:'dragon-ball-goku'}),p=s.actors[0],t=s.actors[1];t.x=p.x+44000;t.boss=boss;stepBattle(s,I.SKILL1);for(let i=0;i<140&&!(t.freezeUntil>s.tick);i++)stepBattle(s);assert.ok(t.freezeUntil>s.tick);return s;}
s=freeze();t=s.actors[1];const freezeTicks=t.freezeUntil-s.tick;assert.equal(freezeTicks,72);const x=t.x;run(s,30,0,I.RIGHT|I.SKILL1);assert.equal(t.x,x);assert.equal(t.action,'hit');assert.equal(t.cooldowns[0],0);assert.equal(t.invuln,0,'Ice must not extend hit protection across the whole freeze');const frozenHp=t.hp;s.actors[0].x=t.x-5000;stepBattle(s,I.ATTACK,I.RIGHT);run(s,12,0,I.RIGHT);assert.ok(t.hp<frozenHp&&t.freezeUntil>s.tick,'A frozen opponent remains vulnerable to follow-up strikes');
run(s,160,0,I.RIGHT);assert.ok(t.x>x);assert.ok(t.freezeReadyAt>s.tick,'Ice resistance prevents an immediate second freeze');
const boss=freeze(true);assert.equal(boss.actors[1].freezeUntil-boss.tick,24);
console.log('✓ Ice immobilizes a human opponent for 1.2 seconds, blocks casting, then releases movement; resistance prevents repeated freezes and bosses have a shorter duration');

const options={version:VERSION,mode:'pvp',fighterId:'spark-hamster',opponentId:'snowfeather-penguin'};
// Input-only replay uses an identical initial arena; no fixture edits are included in the verified log.
s=createBattle(options);const inputs=[{tick:1,mask:I.RIGHT},{tick:85,mask:0},{tick:86,mask:I.SKILL1},{tick:87,mask:0},{tick:200,mask:I.SKILL2},{tick:201,mask:0}];
let mask=0;for(let tick=1;tick<=500;tick++){const frame=inputs.find(f=>f.tick===tick);if(frame)mask=frame.mask;stepBattle(s,mask);}
assert.deepEqual(replayBattle(options,inputs,500,{terminal:false}),s);
for(const f of fightersForVersion('brawl-v7')){
  const options={version:'brawl-v7',mode:'practice',fighterId:f.id,seed:987},log=[{tick:1,mask:I.RIGHT},{tick:50,mask:0},{tick:51,mask:I.SKILL1},{tick:52,mask:0},{tick:160,mask:I.SKILL2},{tick:161,mask:0}],old=v7.createBattle(options);let mask=0;
  for(let tick=1;tick<=400;tick++){const frame=log.find(f=>f.tick===tick);if(frame)mask=frame.mask;v7.stepBattle(old,mask);}
  assert.deepEqual(replayBattle(options,log,400,{terminal:false}),old);assert.deepEqual(battleResult(old),v7.battleResult(old));
}
console.log('✓ v8 elemental combat replays deterministically and all 25 archived v7 fighters retain their exact original rules');
