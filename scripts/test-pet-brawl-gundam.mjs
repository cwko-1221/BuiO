import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {VERSION,FIGHTERS,INPUT as I,fightersForVersion} from '../pet-app/lib/brawl/catalog.mjs';
import {createBattle,stepBattle,replayBattle,battleResult} from '../pet-app/lib/brawl/simulation.mjs';
import * as old from '../pet-app/lib/brawl/legacy/v14/simulation.mjs';
const id='gundam-rx-78-2',out='artifacts/pet-playtest/gundam-brawl',checks=[],require=createRequire(import.meta.url);
const pass=text=>{checks.push(text);console.log('✓ '+text);};
const run=(s,n,input=0,other=0)=>{const events=[];for(let t=0;t<n;t++){stepBattle(s,t===0?input:0,t===0?other:0);events.push(...s.events.map(e=>({...e,tick:s.tick})));}return events;};
assert.equal(VERSION,'brawl-v15');assert.equal(FIGHTERS.length,29);assert.equal(FIGHTERS.at(-1).id,id);
assert.equal(FIGHTERS.find(f=>f.id===id).rarity,'epic');assert.equal(new Set(FIGHTERS.flatMap(f=>f.skills.map(k=>k.kind))).size,58);
// Approved bdf6d204 rules, with only the archived import paths relocated.
const archiveHashes={
  "abilities.mjs": "3c5c83e7352c1963fea98c0b8aebbcc2f8c0d409d3be5b503db7127c481ba09d",
  "adventure-design.mjs": "af22bf20d7162bfcc973cfef86d4cc806126e5be8988c6143ace992d9814c19a",
  "catalog.d.mts": "1def2ff25e4ca467c466177e9727998d8de9bc42fdea2e40c75ae3e7dee7b2d9",
  "catalog.mjs": "5d1b4439d27a6ce1a0bc33b2229c0e541a955f1f865fb5ad2d3752d941d436f1",
  "elemental-combat.mjs": "0198d2f92ffc026908553ae9299b623021e4f1c04b12f6047a0beb4da2cacd37",
  "elemental-kits.mjs": "5e67ab6700bdcb94a990b37e97fa7c4448cc3909ed8496cf9d271d1390cab623",
  "enemy-combat.d.mts": "fef091f36c4658a75093c6d97185c68cba5896977b853099358bcb88599cd2ee",
  "enemy-combat.mjs": "5c9e6197e29141acf2880f6876cdd11666ef310e7c0bed4e0e594b83f7e4ca14",
  "fighter-roster.mjs": "2df6d5f7d95d2830d7e79a85e41b7fe733839b50e4be73450d4929dd5b37e1fc",
  "fighter-utility.mjs": "12909982212d4e99fd19e0f5d663a07c75d3958df1a956f7c2bb611fc718889f",
  "simulation.d.mts": "b6f73eb460aca5a19c9ff34e848e152f2f86f043d0b8e33b3eca5451a67ed233",
  "simulation.mjs": "613e503a3f45553e1026c963f5adc8d9e394e634bbf7ba625044a330f4ac0597"
};
assert.deepEqual((await fs.readdir('pet-app/lib/brawl/legacy/v14')).sort(),Object.keys(archiveHashes).sort());
for(const [name,expected] of Object.entries(archiveHashes)){
  const bytes=(await fs.readFile('pet-app/lib/brawl/legacy/v14/'+name,'utf8')).replaceAll('\r\n','\n');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,'Exact v14 archive '+name);
}
assert.equal(fightersForVersion('brawl-v14').length,28);assert.ok(!fightersForVersion('brawl-v14').some(f=>f.id===id));
const log=[{tick:1,mask:I.RIGHT},{tick:45,mask:0},{tick:46,mask:I.SKILL1},{tick:47,mask:0},{tick:190,mask:I.SKILL2},{tick:191,mask:0},{tick:330,mask:I.ATTACK},{tick:331,mask:0}];
for(const f of fightersForVersion('brawl-v14')){
  const options={version:'brawl-v14',mode:'practice',fighterId:f.id,seed:717},original=old.createBattle(options);let routed=createBattle(options),mask=0;
  for(let tick=1;tick<=420;tick++){const frame=log.find(f=>f.tick===tick);if(frame)mask=frame.mask;old.stepBattle(original,mask);stepBattle(routed,mask);if(tick===170)routed=structuredClone(routed);}
  assert.deepEqual(routed,original,f.id+' v14 resume');assert.deepEqual(replayBattle(options,log,420,{terminal:false}),original);assert.deepEqual(battleResult(routed),old.battleResult(original));
}
pass('All twelve v14 files are archived exactly; all 28 previous fighters resume and replay unchanged');
for(const [skill,total,mp,distance] of [[0,36,35,40000],[1,32,45,13000]])for(const facing of [1,-1]){
  const s=createBattle({fighterId:id,opponentId:'starpatch-cat',mode:'pvp',seed:51}),[a,b]=s.actors;
  a.x=60000;a.facing=facing;b.x=a.x+facing*distance;b.y=a.y;
  const origin=a.x,mask=skill?I.SKILL2:I.SKILL1;stepBattle(s,mask,0);assert.equal(a.mp,10000-mp*100);assert.equal(a.cooldowns[skill],FIGHTERS.at(-1).skills[skill].cooldown);
  const events=[...s.events,...run(s,150)],hits=events.filter(e=>e.type==='hit'&&e.source===a.id);
  assert.equal(hits.length,3);assert.equal(hits.reduce((n,h)=>n+h.damage,0),total);assert.equal(b.maxHp-b.hp,total);assert.equal(a.x,origin);
  assert.ok(!hits.some(e=>e.mpGain));if(skill)assert.ok(hits.at(-1).heavy);
  const before=a.mp;run(s,1,mask);assert.ok(a.mp>=before,'cooldown cannot spend MP again');
}
for(const skill of [0,1]){
  const s=createBattle({fighterId:id,mode:'practice'}),a=s.actors[0];a.mp=0;run(s,1,skill?I.SKILL2:I.SKILL1);assert.equal(a.cooldowns[skill],0);assert.ok(!a.action.startsWith('skill'));
}
let s=createBattle({fighterId:id,mode:'practice'});s.actors[1].y=s.actors[0].y+13000;assert.equal(run(s,160,I.SKILL1).filter(e=>e.type==='hit').length,0);
s=createBattle({fighterId:id,mode:'practice'});s.actors[1].x=s.actors[0].x+90000;assert.equal(run(s,160,I.SKILL1).filter(e=>e.type==='hit').length,0);
s=createBattle({fighterId:id,opponentId:'starpatch-cat',mode:'pvp'});s.actors[1].x=s.actors[0].x+5500;
assert.equal(run(s,120,I.SKILL2,I.ATTACK).filter(e=>e.type==='skillRelease'&&e.actor===1).length,0);assert.ok(s.actors[0].hp<s.actors[0].maxHp);
s=createBattle({fighterId:id,mode:'practice'});s.actors[1].x=s.actors[0].x+5500;s.actors[0].mp=4000;
assert.ok(run(s,30,I.ATTACK).some(e=>e.type==='hit'&&e.mpGain>0));
pass('Both directions: rifle deals 3 × 12 and saber 8 + 8 + 16; MP/cooldowns, lane/range dodges, interruption and basic-hit MP work');
const options={fighterId:id,mode:'practice',seed:717},live=createBattle(options);let mask=0;
for(let tick=1;tick<=420;tick++){const frame=log.find(f=>f.tick===tick);if(frame)mask=frame.mask;stepBattle(live,mask);}
assert.deepEqual(replayBattle(options,log,420,{terminal:false}),live);
pass('New Gundam input logs replay deterministically with the same resulting state');
const manifest=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8')),assets=require('../pet-app/lib/brawl/assets.cjs').completeAssets(manifest,FIGHTERS),fighter=assets.fighters[id];
for(const action of ['skill1','skill2','attack1','attack2','attack3','air']){const clip=fighter.clips[action];assert.equal(clip.count,8);assert.ok(fighter.pages[clip.page].includes(id));if(action.startsWith('skill'))assert.equal(clip.emitters.length,8);else assert.equal(clip.poseTimeline,'strike');}
for(const file of new Set([...manifest.fighterSkillAnimations[id].map(a=>a.url),manifest.skillFx['rx-beam-rifle'].url,manifest.skillFx['rx-beam-saber'].url])){
  const {data,info}=await sharp('pet-app/public/'+file.slice('/pet/'.length)).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,1536);assert.equal(info.height,768);
  for(let n=0;n<8;n++){
    let occupied=0;for(let y=0;y<384;y++)for(let x=0;x<384;x++){const a=data[(((Math.floor(n/4)*384+y)*info.width+n%4*384+x)*4)+3];if(x<4||x>=380||y<4||y>=380)assert.equal(a,0,'Clear gutters '+file+':'+n);if(a>16)occupied++;}
    assert.ok(occupied>500,'Full, non-empty sprite '+file+':'+n);
  }
}
const build=JSON.parse(await fs.readFile(out+'/build-report.json','utf8'));for(const strip of Object.values(build.poses)){assert.equal(new Set(strip.frames.map(f=>f.scale)).size,1);assert.ok(strip.scale/strip.desired>.88);}
pass('Six battle clips use the generated poses; 32 source effect/pose frames have true alpha, clear gutters and fixed per-strip scale/heel anchors');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-gundam-unit-'));process.env.BUIO_JSON_DB_FILE=path.join(temp,'db.json');process.env.SUPABASE_DB_URL='';
await fs.writeFile(process.env.BUIO_JSON_DB_FILE,JSON.stringify({users:[{studentid:'S001',role:'student'},{studentid:'S002',role:'student'}],studentStats:[],questionLogs:[],_logId:0}));
try{
  const pets=require('../pet-app/repositories/pet.repo'),repo=require('../pet-app/repositories/brawl.repo'),duels=require('../pet-app/repositories/brawl-duel.repo'),store=require('../db/jsonStore');
  for(const id of ['S001','S002'])await pets.ensureStudent(id);const data=store.load(),pet={petId:randomUUID(),studentId:'S001',speciesId:id,xp:0,stage:1},other={petId:randomUUID(),studentId:'S002',speciesId:'starpatch-cat',xp:0,stage:1};data.petInstances.push(pet,other);for(const w of data.petWallets)w.balance=1500;store.save();
  for(const mode of ['practice','tutorial','duel','campaign']){assert.equal((await repo.access('S001',{petId:pet.petId,fighterId:id,mode})).allowed,true);await assert.rejects(repo.access('S002',{petId:pet.petId,fighterId:id,mode}),{status:403});}
  const {run}=await repo.start('S001',{petId:pet.petId,stageId:'sunny-training',difficulty:'easy'},randomUUID());assert.equal(run.options.fighterId,id);assert.equal(run.options.version,VERSION);await repo.abandon('S001',run.id);
  for(const mode of ['friendly','ranked']){
    const match={id:randomUUID(),mode,version:VERSION,stageId:'sunny-training',seed:1,players:[{id:'S001',petId:pet.petId,fighterId:id},{id:'S002',petId:other.petId,fighterId:other.speciesId}]};
    await assert.rejects(duels.charge({...match,id:randomUUID(),players:[match.players[0],{id:'S002',petId:pet.petId,fighterId:id}]}),{status:403});assert.ok(data.petWallets.every(w=>w.balance===1500));
    const accepted=await duels.charge(match);assert.equal(accepted.fee,500);assert.ok(data.petWallets.every(w=>w.balance===1000));await duels.finalize(match.id,{status:'cancelled',reason:'qa_before_start'},true);assert.ok(data.petWallets.every(w=>w.balance===1500));
  }
  pass('Purchased Gundam enters all solo modes, adventure, free/ranked duels; foreign or spoofed ownership rejects before charging either wallet');
}finally{assert.ok(path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(temp,{recursive:true,force:true});}
await fs.writeFile(out+'/unit-report.json',JSON.stringify({passed:true,version:VERSION,checks},null,2)+'\n');
