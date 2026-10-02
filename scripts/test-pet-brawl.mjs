import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import sharp from 'sharp';
import {INPUT as I,VERSION,FIGHTERS,STAGES,DIFFICULTIES} from '../pet-app/lib/brawl/catalog.mjs';
import {createBattle,stepBattle,replayBattle,battleResult} from '../pet-app/lib/brawl/simulation.mjs';
import {playBot} from './pet-brawl-bot.mjs';

const pass=label=>console.log(`✓ ${label}`);
const ticks=(s,n,mask=0)=>{for(let i=0;i<n;i++)stepBattle(s,mask);};
const practice=fighterId=>createBattle({mode:'practice',fighterId,seed:1});
let s=practice(FIGHTERS[0].id),p=s.actors[0];
ticks(s,60,I.RIGHT);assert.equal(p.x,43000);assert.equal(p.y,45500);
ticks(s,60,I.UP);assert.equal(p.y,34500);assert.equal(p.z,0);
stepBattle(s,I.JUMP);ticks(s,25);assert.ok(p.z>9000);ticks(s,30);assert.equal(p.z,0);
assert.equal(p.y,34500);pass('independent ground-depth movement, jump height and arena bounds');
s=practice(FIGHTERS[0].id);ticks(s,5,I.RIGHT);stepBattle(s,0);stepBattle(s,I.RIGHT);ticks(s,10,I.RIGHT);assert.equal(s.actors[0].action,'run');stepBattle(s,0);assert.equal(s.actors[0].action,'idle');
pass('double-tap running persists while direction is held and ends on release');

s=practice(FIGHTERS[0].id);p=s.actors[0];p.x=57000;const target=s.actors[1];
for(let i=0;i<85;i++)stepBattle(s,i%12<6?I.ATTACK:0);
assert.ok(target.hp<target.maxHp-16);assert.ok(p.phase>=3);
pass('buffered three-hit attacks cause real damage');
for(const f of FIGHTERS.slice(0,3)){
  s=practice(f.id);p=s.actors[0];p.x=56000;
  stepBattle(s,I.SKILL1);assert.equal(p.action,'skill1');assert.equal(p.mp,10000-f.skills[0].mp*100);
  ticks(s,45);const cooldown=p.cooldowns[0];stepBattle(s,I.SKILL1);assert.ok(p.cooldowns[0]<cooldown,'cannot bypass cooldown');
  ticks(s,5);stepBattle(s,I.SKILL2);assert.equal(p.action,'skill2');assert.ok(p.mp<6000);
}
s=practice(FIGHTERS[0].id);stepBattle(s,I.GUARD);stepBattle(s,I.RIGHT|I.GUARD);stepBattle(s,I.ATTACK);assert.equal(s.actors[0].action,'skill1');
pass('all character skills, MP costs, cooldowns and guard-forward command');

function guardedDamage(guard){const b=practice(FIGHTERS[0].id);b.actors[0].x=57000;const t=b.actors[1];t.boss=false;t.guard=guard;for(let i=0;i<6;i++){t.action='guard';t.facing=-1;stepBattle(b,i===0?I.ATTACK:0);}return {damage:t.maxHp-t.hp,guard:t.guard,action:t.action};}
assert.equal(guardedDamage(10000).damage,1);assert.equal(guardedDamage(100).action,'break');
s=practice(FIGHTERS[0].id);s.actors[0].x=57000;s.actors[1].y=54000;stepBattle(s,I.ATTACK);ticks(s,22);assert.equal(s.actors[1].hp,s.actors[1].maxHp);
pass('facing guard, guard break and depth-separated hit detection');

s=createBattle({mode:'campaign'});s.actors[0].hp=0;stepBattle(s);assert.equal(s.status,'ko');stepBattle(s,I.RETRY);assert.equal(s.retries,1);assert.equal(s.actors[0].hp,100);assert.equal(s.actors[0].mp,10000);s.actors[0].hp=0;stepBattle(s);assert.equal(s.status,'lost');
const stopped=s.tick;stepBattle(s,I.RETRY);assert.equal(s.tick,stopped);
pass('one current-wave retry only, full restoration and terminal freeze');

const matrix=[];
for(const f of FIGHTERS.slice(0,3))for(const st of STAGES)for(const difficulty of Object.keys(DIFFICULTIES)){
  const options={mode:'campaign',fighterId:f.id,stageId:st.id,difficulty,seed:st.id==='starcrystal-cave'?4:1};
  const played=playBot(options);const replayed=replayBattle(options,played.inputs,played.endTick);
  assert.deepEqual(battleResult(replayed),played.result);
  matrix.push({fighter:f.id,stage:st.id,difficulty,seed:options.seed,...played.result});
}
assert.ok(matrix.filter(r=>r.difficulty==='easy'&&r.outcome==='won').length>=5);
for(const stage of STAGES)assert.ok(matrix.some(r=>r.stage===stage.id&&r.outcome==='won'),`${stage.id} playable with legal inputs`);
assert.throws(()=>replayBattle({},[{tick:1,mask:8192}],1));
assert.throws(()=>replayBattle({},[{tick:1,mask:4294967296}],1));
assert.throws(()=>replayBattle({},[{tick:2,mask:1},{tick:1,mask:2}],2));
assert.throws(()=>replayBattle({},[],20),/not complete/);
assert.throws(()=>replayBattle({},[],36001));
pass('27 full legal campaign logs replay identically; incomplete and malformed logs rejected');

const assets=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8'));
for(const f of FIGHTERS.slice(0,3)){
  for(const url of assets.fighters[f.id].pages){const meta=await sharp(path.join('pet-app/public',url.replace('/pet/',''))).metadata();assert.equal(meta.width,2048);assert.equal(meta.height,2048);assert.equal(meta.hasAlpha,true);}
  for(const clip of Object.values(assets.fighters[f.id].clips)){assert.ok(clip.start>=0&&clip.start+clip.count<=64);assert.ok(clip.page<2);}
}
pass('dedicated alpha atlases fit 2048 texture limits; clips remain inside pages');

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-brawl-unit-'));
process.env.BUIO_JSON_DB_FILE=path.join(temp,'db.json');process.env.SUPABASE_DB_URL='';
await fs.writeFile(process.env.BUIO_JSON_DB_FILE,JSON.stringify({users:[{studentId:'S001',role:'student'},{studentId:'S002',role:'student'}],studentStats:[],questionLogs:[],_logId:0}));
const require=createRequire(import.meta.url),petRepo=require('../pet-app/repositories/pet.repo.js'),repo=require('../pet-app/repositories/brawl.repo.js'),store=require('../db/jsonStore.js'),verifier=require('../pet-app/lib/brawl/verifier.cjs');
try{
  await petRepo.ensureStudent('S001');await petRepo.ensureStudent('S002');
  const data=store.load(),petId=randomUUID();
  data.petInstances.push({petId,studentId:'S001',speciesId:'pudding-pig',xp:1095,stage:2,dailyXp:95,dailyXpDate:petRepo.hkDay(),equippedSkills:[],equippedWearables:[]});store.save();
  const body={petId,stageId:STAGES[0].id,difficulty:'easy'};
  await assert.rejects(()=>repo.start('S002',body,'foreign'),{status:403});
  await assert.rejects(()=>repo.start('S001',{...body,stageId:STAGES[1].id},'locked'),{status:403});
  await assert.rejects(()=>repo.start('S001',{...body,difficulty:'hard'},'hard-locked'),{status:403});
  let first=await repo.start('S001',body,'first');assert.equal((await repo.start('S001',body,'first')).run.id,first.run.id);
  await assert.rejects(()=>repo.start('S001',{...body,difficulty:'normal'},'first'),{status:409});
  await assert.rejects(()=>repo.start('S001',body,'concurrent'),{status:409});
  await assert.rejects(()=>repo.finish('S002',first.run.id,{version:VERSION,inputs:[],endTick:1},'foreign'),{status:404});
  await assert.rejects(()=>repo.finish('S001',first.run.id,{version:VERSION,inputs:[],endTick:1,outcome:'won',hp:100},'forged'),{status:400});
  await repo.abandon('S001',first.run.id);
  pass('ownership, stage/hard locks, one active run, idempotency and forged results');

  const receipts=[];let attempts=0;
  while(receipts.length<4&&attempts++<40){
    const {run}=await repo.start('S001',body,randomUUID()),played=playBot(run.options);
    const log={version:VERSION,inputs:played.inputs,endTick:played.endTick};
    const results=await Promise.all([repo.finish('S001',run.id,log,'finish-a'),repo.finish('S001',run.id,log,'finish-b')]);
    assert.deepEqual(results[0],results[1],'concurrent settlement awards once');
    await assert.rejects(()=>repo.finish('S001',run.id,{...log,endTick:log.endTick-1},'changed-log'),{status:409});
    if(played.result.outcome==='won')receipts.push(results[0].receipt);
  }
  assert.equal(receipts.length,4,'four full replay-verified wins');
  assert.deepEqual(receipts.map(r=>r.rewards),[{coins:5,xp:5},{coins:5,xp:0},{coins:5,xp:0},{coins:0,xp:0}]);
  assert.equal(store.load().petWallets.find(w=>w.studentId==='S001').balance,15);
  assert.equal(store.load().petCurrencyLedger.filter(l=>l.kind==='brawl_win').length,3);
  const rewarded=store.load().petInstances.find(p=>p.petId===petId);assert.equal(rewarded.xp,1100);assert.equal(rewarded.stage,3);assert.equal(rewarded.dailyXp,100);
  assert.equal((await repo.getProgress('S001')).rewardsRemaining,0);
  const unlocked=await repo.start('S001',{...body,stageId:STAGES[1].id},'stage-2');await repo.abandon('S001',unlocked.run.id);
  // A previously recorded Normal clear is the prerequisite, regardless of pet.
  store.load().petBrawlProgress[0].state[STAGES[0].id+':normal']={stars:2,seconds:132,clears:1};store.save();
  const hard=await repo.start('S001',{...body,difficulty:'hard'},'hard-unlocked');await repo.abandon('S001',hard.run.id);
  pass('atomic rewards: 3 daily wins, partial XP cap, evolution, duplicate and concurrent settlement');

  // Advance the fixture's day without changing wall clock or production data.
  const fixture=store.load();fixture.petBrawlDailyRewards[0].day='2000-01-01';fixture.petInstances[0].dailyXpDate='2000-01-01';store.save();
  assert.equal((await repo.getProgress('S001')).rewardsRemaining,3);
  let nextDay;
  for(let attempt=0;attempt<10&&!nextDay;attempt++){const {run}=await repo.start('S001',body,randomUUID()),played=playBot(run.options);const {receipt}=await repo.finish('S001',run.id,{version:VERSION,inputs:played.inputs,endTick:played.endTick},randomUUID());if(receipt.outcome==='won')nextDay=receipt;}
  assert.deepEqual(nextDay?.rewards,{coins:5,xp:10});assert.equal(nextDay.rewardsRemaining,2);assert.equal(store.load().petInstances.find(p=>p.petId===petId).dailyXp,10);
  await fs.mkdir('artifacts/pet-playtest/brawl-v3',{recursive:true});
  await fs.writeFile('artifacts/pet-playtest/brawl-v3/simulation-report.json',JSON.stringify({pass:true,matrix,receipts,attempts},null,2));
  pass('Hong Kong day reset uses per-day reward and pet XP records');
}finally{await verifier.close();assert.ok(path.isAbsolute(temp)&&temp.startsWith(path.join(os.tmpdir(),'buio-brawl-unit-')));await fs.rm(temp,{recursive:true,force:true});}
