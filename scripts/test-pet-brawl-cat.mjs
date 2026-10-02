import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {createBattle,stepBattle,replayBattle,battleResult} from '../pet-app/lib/brawl/simulation.mjs';
import * as v2 from '../pet-app/lib/brawl/legacy/v2/simulation.mjs';
import {INPUT as I,VERSION,FIGHTERS,fightersForVersion} from '../pet-app/lib/brawl/catalog.mjs';
import {brawlSound} from '../pet-app/lib/brawl/sound.mjs';
import {playBot,botInput} from './pet-brawl-bot.mjs';
const out='artifacts/pet-playtest/brawl-v7/cat-regression';await fs.mkdir(out,{recursive:true});
const ticks=(s,n)=>{const events=[];for(let t=0;t<n;t++){stepBattle(s);events.push(...s.events);}return events;};
const arena=()=>{const s=createBattle({mode:'practice'});s.actors[0].x=56000;return s;};
const cast=(s,key)=>{stepBattle(s,key);return [...s.events,...ticks(s,100)];};
const castGuarded=(s,target)=>{const events=[];for(let n=0;n<101;n++){target.action='guard';target.facing=-1;stepBattle(s,n===0?I.SKILL1:0);events.push(...s.events);}return events;};
const reports=[];
assert.equal(VERSION,'brawl-v7');assert.equal(fightersForVersion('brawl-v2')[0].skills[0].kind,'dash');
assert.notEqual(FIGHTERS[0].skills[0].kind,FIGHTERS[2].skills[0].kind);
assert.notEqual(FIGHTERS[0].skills[1].kind,FIGHTERS[2].skills[1].kind);
// Guarded foe, intervening enemy and lane separation: a precise back attack.
let s=arena(),p=s.actors[0],target=s.actors[1];target.action='guard';target.facing=-1;
const other={...target,id:3,x:59500,y:45500,action:'idle',hitIds:[],cooldowns:[0,0]};s.actors.push(other);
// Keep the nearer foe in a different lane; crossing it must never cause charge damage.
other.y=51000;const events=castGuarded(s,target);
assert.equal(target.maxHp-target.hp,18);assert.equal(other.hp,other.maxHp);
assert.ok(p.x>target.x);assert.equal(p.facing,-1);assert.equal(target.starMarkOwner,p.id);
assert.ok(target.starMarkUntil>s.tick);assert.equal(target.guard,10000);
assert.equal(events.filter(e=>e.type==='skillRelease').length,1);
reports.push({case:'rear attack bypasses frontal guard; no travel or area damage',damage:18});
// Queue a quick I tap during Starstep recovery, including local hit stop.
s=arena();p=s.actors[0];target=s.actors[1];stepBattle(s,I.SKILL1);
while(p.actionTick<6)stepBattle(s);stepBattle(s,I.SKILL2);
const follow=ticks(s,140);assert.ok(follow.some(e=>e.type==='cast'&&e.skill===1));assert.equal(target.maxHp-target.hp,54);assert.equal(target.starMarkUntil,0);
// Unmarked and marked three-hit pursuit, with a secondary foe inside the strike area.
for(const marked of [false,true]){
  s=arena();p=s.actors[0];target=s.actors[1];
  const extra={...target,id:3,x:64000,hitIds:[],cooldowns:[0,0]};s.actors.push(extra);
  if(marked){target.starMarkOwner=p.id;target.starMarkUntil=240;}
  stepBattle(s,I.SKILL2);let height=0;const hits=[];
  for(let n=0;n<100;n++){stepBattle(s);height=Math.max(height,p.z);hits.push(...s.events.filter(e=>e.type==='hit'));}
  assert.deepEqual(hits.map(e=>e.damage),[7,7,marked?22:16]);assert.ok(height>=10000);
  assert.equal(extra.hp,extra.maxHp);assert.equal(p.z,0);assert.equal(p.action,'idle');
  if(marked)assert.equal(target.starMarkUntil,0);
  reports.push({case:marked?'marked finisher':'unmarked three-hit pursuit',damage:hits.map(e=>e.damage),peakHeight:height/100});
}
// Prioritize an owned, live mark over a nearer foe, even when facing away.
s=arena();p=s.actors[0];target=s.actors[1];target.starMarkOwner=p.id;target.starMarkUntil=240;p.facing=-1;
s.actors.push({...target,id:3,x:52000,starMarkOwner:0,hitIds:[],cooldowns:[0,0]});
stepBattle(s,I.SKILL2);assert.equal(p.catTarget,target.id);ticks(s,100);assert.equal(target.maxHp-target.hp,36);
// Expired or foreign marks give no bonus and are not consumed.
for(const [owner,until] of [[1,0],[99,240]]){s=arena();target=s.actors[1];target.starMarkOwner=owner;target.starMarkUntil=until;cast(s,I.SKILL2);assert.equal(target.maxHp-target.hp,30);assert.equal(target.starMarkUntil,until);}
// A target moving away after the leap starts is not replaced or chased indefinitely.
s=arena();stepBattle(s,I.SKILL2);s.actors[1].x=110000;const misses=ticks(s,100);assert.equal(s.actors[1].hp,99999);assert.ok(s.actors[0].x<65000);assert.equal(misses.some(e=>e.type==='hit'),false);
// KO target: finish the arc safely instead of retargeting the crowd.
s=arena();stepBattle(s,I.SKILL2);s.actors[1].hp=0;s.actors[1].action='fall';ticks(s,100);assert.equal(s.actors[0].z,0);assert.equal(s.actors[0].action,'idle');
// Empty casts, cost/cooldown, edge clamps, deterministic side and mark expiry.
for(const key of [I.SKILL1,I.SKILL2]){
  s=createBattle({mode:'practice'});p=s.actors[0];stepBattle(s,key);assert.equal(p.mp,key===I.SKILL1?8000:6500);const e=ticks(s,100);assert.equal(e.some(e=>e.type==='hit'),false);assert.equal(p.z,0);
  const mp=p.mp;stepBattle(s,key);assert.equal(p.action,'idle');assert.equal(p.mp,mp+10);
  s=arena();p=s.actors[0];p.mp=100;stepBattle(s,key);assert.equal(p.action,'idle');
  for(const facing of [-1,1]){s=createBattle({mode:'practice'});p=s.actors[0];p.x=facing===1?123000:5000;p.facing=facing;s.actors=[];s.actors.push(p);cast(s,key);assert.ok(p.x>=4500&&p.x<=123500);assert.equal(p.z,0);}
}
// At the wall a guard may still cover the landing point; do not award a star mark.
s=arena();p=s.actors[0];target=s.actors[1];p.x=114000;target.x=122000;target.action='guard';target.facing=-1;
castGuarded(s,target);assert.equal(target.maxHp-target.hp,3);assert.ok(!target.starMarkUntil);
s=arena();cast(s,I.SKILL1);ticks(s,240);assert.ok(s.actors[1].starMarkUntil<=s.tick);
reports.push({case:'target priority, escaped/KO targets, whiffs, cost, cooldown, expiry and both world edges',pass:true});
// Ground projectiles miss the leap, while aerial interruption returns to physics.
s=arena();stepBattle(s,I.SKILL2);ticks(s,10);p=s.actors[0];assert.ok(p.z>6000);s.projectiles.push({id:99,owner:s.actors[1].id,team:1,x:p.x-700,y:p.y,z:800,ground:true,dx:700,remaining:10000,damage:18,hitIds:[]});const hp=p.hp;stepBattle(s);assert.equal(p.hp,hp);
p.action='hit';p.actionDuration=12;p.actionTick=0;p.catMotion=null;ticks(s,100);assert.equal(p.z,0);assert.equal(p.action,'idle');
// Exact v2 continuation and worker settlement survive the protocol upgrade.
const options={version:'brawl-v2',fighterId:'starpatch-cat',stageId:'sunny-training',difficulty:'easy',mode:'campaign',seed:1};
const old=v2.createBattle(options),inputs=[];let last=-1,checkpoint;
while(!['won','lost'].includes(old.status)&&old.tick<36000){const mask=botInput(old);if(mask!==last){inputs.push({tick:old.tick+1,mask});last=mask;}v2.stepBattle(old,mask);if(old.tick===600)checkpoint=structuredClone(old);}
assert.deepEqual(replayBattle(options,inputs.filter(f=>f.tick<=600),600,{terminal:false}),checkpoint);
assert.deepEqual(battleResult(replayBattle(options,inputs,old.tick)),v2.battleResult(old));
const require=createRequire(import.meta.url),verifier=require('../pet-app/lib/brawl/verifier.cjs');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-cat-compat-'));process.env.BUIO_JSON_DB_FILE=path.join(temp,'db.json');process.env.SUPABASE_DB_URL='';
await fs.writeFile(process.env.BUIO_JSON_DB_FILE,JSON.stringify({users:[{studentId:'S001',role:'student'}],studentStats:[],questionLogs:[],_logId:0}));
try{
  assert.deepEqual(await verifier.verify(options,inputs,old.tick),v2.battleResult(old));
  const petRepo=require('../pet-app/repositories/pet.repo.js'),repo=require('../pet-app/repositories/brawl.repo.js'),store=require('../db/jsonStore.js');await petRepo.ensureStudent('S001');
  const data=store.load(),petId=randomUUID();data.petInstances.push({petId,studentId:'S001',speciesId:'starpatch-cat',xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});store.save();
  const {run}=await repo.start('S001',{petId,stageId:'sunny-training',difficulty:'easy'},'compat');
  const fixture=store.load(),issued=fixture.petBrawlRuns.find(r=>r.id===run.id);issued.version='brawl-v2';issued.options={...options};store.save();
  const receipt=await repo.finish('S001',run.id,{version:'brawl-v2',inputs,endTick:old.tick},'old-finish');assert.equal(receipt.receipt.outcome,old.status);
  reports.push({case:'v2 save continuation, worker replay and existing-run API settlement',pass:true});
  const campaigns=[];for(const stageId of ['sunny-training','windbell-forest','starcrystal-cave']){const options={fighterId:'starpatch-cat',stageId,seed:stageId==='starcrystal-cave'?4:1},played=playBot(options);assert.equal(played.result.outcome,'won');assert.deepEqual(battleResult(replayBattle(options,played.inputs,played.endTick)),played.result);campaigns.push({stageId,...played.result});}
  for(const cue of ['blink','flurry','claw']){const samples=brawlSound(cue);const peak=Math.max(...samples.map(Math.abs));assert.ok(peak<.99);assert.ok(Math.sqrt(samples.reduce((v,x)=>v+x*x,0)/samples.length)>.008);}
  await fs.writeFile(path.join(out,'cat-mechanics-report.json'),JSON.stringify({pass:true,reports,campaigns},null,2));console.log('Cat target mechanics, three-hit mark combo, whiffs, bounds, leap, v2 compatibility and all three legal campaign wins passed');
}finally{await verifier.close();assert.ok(temp.startsWith(path.join(os.tmpdir(),'buio-cat-compat-')));await fs.rm(temp,{recursive:true,force:true});}
