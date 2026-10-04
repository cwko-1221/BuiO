import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {FIGHTERS,INPUT as I,VERSION,fightersForVersion} from '../pet-app/lib/brawl/catalog.mjs';
import {createBattle,stepBattle,replayBattle,battleResult} from '../pet-app/lib/brawl/simulation.mjs';
import * as v12 from '../pet-app/lib/brawl/legacy/v12/simulation.mjs';
const id='monchhichi',fighter=FIGHTERS.find(f=>f.id===id);
const archiveHashes={
  "abilities.mjs": "3c5c83e7352c1963fea98c0b8aebbcc2f8c0d409d3be5b503db7127c481ba09d",
  "adventure-design.mjs": "af22bf20d7162bfcc973cfef86d4cc806126e5be8988c6143ace992d9814c19a",
  "catalog.d.mts": "1def2ff25e4ca467c466177e9727998d8de9bc42fdea2e40c75ae3e7dee7b2d9",
  "catalog.mjs": "be89973a82f411ac42f2de9fb014417aba274895eaae67019f5531d1107be7a8",
  "elemental-combat.mjs": "a1b1970e1edcae3ad43b5beff2606af49d237a6edd07f621679ff9a0aaf95cc9",
  "elemental-kits.mjs": "5e5162187b59f7b9d5997c6c4fc5aef0815d438765571568e4e3092741cb80c8",
  "enemy-combat.d.mts": "fef091f36c4658a75093c6d97185c68cba5896977b853099358bcb88599cd2ee",
  "enemy-combat.mjs": "5c9e6197e29141acf2880f6876cdd11666ef310e7c0bed4e0e594b83f7e4ca14",
  "fighter-roster.mjs": "8fecd6b69b8aceab0f13f6b25c237f7e1946f465543388223778d01a35bef622",
  "fighter-utility.mjs": "a423d5861d7cef6819b899b4cc146e9d0e797a4df906f4c4e63eb2a7703ad18f",
  "simulation.d.mts": "b6f73eb460aca5a19c9ff34e848e152f2f86f043d0b8e33b3eca5451a67ed233",
  "simulation.mjs": "6185159fa0b867bfaa7e29aed83ccce17050440bf1fc4781878b99e4e90a0fcc"
};
assert.equal(VERSION,'brawl-v13');assert.equal(fighter.rarity,'epic');
for(const [file,expected] of Object.entries(archiveHashes)){
 const source=fs.readFileSync('pet-app/lib/brawl/legacy/v12/'+file,'utf8').replaceAll('\r\n','\n');
 assert.equal(createHash('sha256').update(source).digest('hex'),expected,file+' approved v12 archive');
}
assert.equal(fightersForVersion('brawl-v12').length,27);assert.ok(!fightersForVersion('brawl-v12').some(f=>f.id===id));
for(const f of fightersForVersion('brawl-v12')){
 const options={version:'brawl-v12',mode:'practice',fighterId:f.id,seed:416},log=[{tick:1,mask:I.RIGHT},{tick:45,mask:0},{tick:46,mask:I.SKILL1},{tick:47,mask:0},{tick:190,mask:I.SKILL2},{tick:191,mask:0},{tick:330,mask:I.ATTACK},{tick:331,mask:0}];
 const archived=v12.createBattle(options);let routed=createBattle(options),mask=0;
 for(let tick=1;tick<=420;tick++){const frame=log.find(f=>f.tick===tick);if(frame)mask=frame.mask;v12.stepBattle(archived,mask);stepBattle(routed,mask);if(tick===170)routed=structuredClone(routed);}
 assert.deepEqual(routed,archived,f.id+' resumed state');assert.deepEqual(replayBattle(options,log,420,{terminal:false}),archived);assert.deepEqual(battleResult(routed),v12.battleResult(archived));
}
console.log('✓ All twelve v12 files match the approved implementation; twenty-seven historical pets resume and replay unchanged');
const run=(s,n,mask=0,other=0,hold=false)=>{const events=[];for(let t=0;t<n;t++){stepBattle(s,t===0?mask:0,hold?other:t===0?other:0);events.push(...s.events.map(e=>({...e,tick:s.tick})));}return events;};
const until=(s,predicate,max=200)=>{const events=[];for(let n=0;!predicate()&&n<max;n++)events.push(...run(s,1));assert.ok(predicate(),'expected combat phase reached');return events;};
const setup=(mode='practice')=>{const s=createBattle({mode,fighterId:id,opponentId:'starpatch-cat'}),[a,b]=s.actors;a.x=36000;b.x=67000;a.y=b.y=45500;return [s,a,b];};
let [s,a,b]=setup(),events=run(s,1,I.SKILL1);assert.equal(a.mp,6700);assert.equal(a.cooldowns[0],300);
events.push(...until(s,()=>s.projectiles.length>0));assert.equal(s.fields.length,0);const launch=s.tick,peel=s.projectiles[0];assert.ok(peel.lob&&peel.z>0);assert.equal(b.hp,b.maxHp);
events.push(...until(s,()=>s.fields.length>0));const field=s.fields[0];assert.equal(s.tick-launch,31);assert.equal(field.x,67000);assert.equal(field.y,a.y);assert.equal(field.starts-field.spawnedAt,12);assert.equal(field.expires-field.spawnedAt,240);assert.equal(b.hp,b.maxHp,'landing itself causes no damage');
events.push(...run(s,11));assert.equal(b.hp,b.maxHp,'arming window remains safe');events.push(...run(s,1));assert.equal(b.maxHp-b.hp,18);assert.equal(b.action,'fall');assert.equal(b.slowUntil,s.tick+90);assert.equal(s.fields.length,0);
events.push(...run(s,240));assert.equal(events.filter(e=>e.type==='hit'&&e.source===a.id).length,1);assert.equal(a.x,36000,'throw does not move the caster');assert.ok(!events.some(e=>e.mpGain));
console.log('✓ Airborne peel, safe landing and arming telegraph precede one 18-damage trip with knockdown and 1.5-second slow; no dash or MP refund');
for(const kind of ['expiry','air','other-lane','behind']){
 [s,a,b]=setup();if(kind==='other-lane')b.y+=7000;if(kind==='behind')b.x=a.x-8000;if(kind==='expiry')b.x=100000;
 run(s,1,I.SKILL1);until(s,()=>s.fields.length>0);const trap=s.fields[0];
 if(kind==='air'){for(let n=0;n<250;n++){b.z=6000;b.vz=200;run(s,1);}}
 else {run(s,trap.expires-s.tick-1);if(kind==='expiry'){b.x=trap.x;b.y=trap.y;}run(s,1);}
 assert.equal(b.hp,b.maxHp,kind+' does not trigger an invalid trip');assert.equal(s.fields.length,0,kind+' trap expires');
}
[s,a,b]=setup();b.x=100000;run(s,1,I.SKILL1);until(s,()=>s.fields.length>0);const trap=s.fields[0];run(s,12);const second={...structuredClone(b),id:s.nextId++,x:trap.x,y:trap.y};s.actors.push(second);b.x=trap.x;run(s,1);assert.equal(b.maxHp-b.hp,18);assert.equal(second.hp,second.maxHp,'one peel catches one foe');
[s,a,b]=setup();a.x=120000;run(s,1,I.SKILL1);until(s,()=>s.fields.length>0);assert.equal(s.fields[0].x,123500,'throw respects arena wall');
console.log('✓ One-use peel expires at four seconds, misses airborne/rear/other-lane foes and cannot damage an enemy on the expiration tick or outside the arena');
[s,a,b]=setup();a.hp=80;b.x=a.x+10000;events=run(s,1,I.SKILL2);assert.equal(a.mp,5000);assert.equal(a.cooldowns[1],540);
events.push(...until(s,()=>a.abilityCaught===b.id));assert.equal(b.maxHp-b.hp,8);assert.equal(a.hp,80);assert.equal(b.rootUntil,s.tick+42);
events.push(...run(s,180));const hits=events.filter(e=>e.type==='hit'&&e.source===a.id);assert.deepEqual(hits.map(e=>e.damage),[8,14]);assert.equal(a.hp,92);assert.equal(a.x,36000);assert.equal(events.filter(e=>e.type==='hugHeal').length,1);assert.equal(events.find(e=>e.type==='hugHeal').amount,12);assert.ok(hits.at(-1).heavy);
console.log('✓ Stationary hug holds one foe, deals 8 + 14 damage, knocks down on its finish and heals exactly twelve HP only after the second hit');
for(const kind of ['miss','rear','other-lane','guard','air','interrupt-windup','interrupt-hold']){
 [s,a,b]=setup('pvp');a.hp=80;b.x=a.x+10000;
 if(kind==='miss')b.x=a.x+30000;if(kind==='rear')b.x=a.x-10000;if(kind==='other-lane')b.y+=7000;
 if(kind==='interrupt-windup')b.x=a.x+5500;
 events=run(s,1,I.SKILL2,kind==='interrupt-windup'?I.ATTACK:kind==='guard'?I.GUARD:0);
 if(kind==='interrupt-hold'){
  events.push(...until(s,()=>a.abilityCaught===b.id));
  s.actors.push({...structuredClone(b),id:s.nextId++,x:a.x-5500,y:a.y,facing:1,action:'idle',actionTick:0,actionDuration:0,invuln:0,stop:0,rootUntil:0,knock:0,human:true,lastMask:0});events.push(...run(s,1,0,I.ATTACK));
 }
 if(kind==='air'){for(let n=0;n<140;n++){b.z=12000;b.vz=200;events.push(...run(s,1));}}
 else events.push(...run(s,180,0,kind==='guard'?I.GUARD:0,kind==='guard'));
 assert.equal(events.filter(e=>e.type==='hugHeal').length,0,kind+' earns no healing');assert.ok(a.hp<=80,kind+' cannot gain free HP');assert.equal(a.cooldowns[1]>0,true,'failed cast still spends cooldown');
}
for(const hp of [105,110]){[s,a,b]=setup();a.hp=hp;b.x=a.x+10000;events=run(s,180,I.SKILL2);assert.equal(a.hp,110);assert.equal(events.find(e=>e.type==='hugHeal').amount,110-hp);}
[s,a,b]=setup();b.x=a.x+10000;b.boss=true;run(s,1,I.SKILL2);until(s,()=>a.abilityCaught);assert.equal(b.rootUntil,s.tick+12,'boss hold is shorter');
for(const bit of [I.SKILL1,I.SKILL2]){[s,a,b]=setup();a.mp=100;run(s,1,bit);assert.ok(a.mp>=100&&a.mp<110);assert.deepEqual(a.cooldowns,[0,0]);assert.equal(a.action,'idle');}
console.log('✓ Misses, guard, airborne targets and interruptions during wind-up or hold grant no healing; HP caps, boss resistance and insufficient MP are respected');
for(const bit of [I.SKILL1,I.SKILL2]){
 s=createBattle({mode:'pvp',fighterId:'starpatch-cat',opponentId:id});[a,b]=s.actors;a.x=b.x-(bit===I.SKILL1?31000:10000);a.y=b.y;events=run(s,220,0,bit);assert.ok(events.some(e=>e.type==='hit'&&e.source===b.id),'guest slot lands '+bit);
}
for(const mode of ['practice','tutorial','campaign','duel','pvp']){
 const options={mode,fighterId:id,opponentId:'starpatch-cat',seed:537},log=[{tick:1,mask:I.RIGHT},{tick:40,mask:0},{tick:41,mask:I.SKILL1},{tick:42,mask:0},{tick:190,mask:I.SKILL2},{tick:191,mask:0}];
 const live=createBattle(options);let mask=0;for(let tick=1;tick<=500;tick++){const f=log.find(f=>f.tick===tick);if(f)mask=f.mask;stepBattle(live,mask);}assert.deepEqual(replayBattle(options,log,500,{terminal:false}),live,mode+' deterministic replay');
}
console.log('✓ Both PvP guest skills land and all five modes reproduce authoritative Monchhichi input logs');
// Shipping images must retain complete poses and transparent gutters at the
// exact cell sizes the renderer declares, rather than just pass file existence.
const manifest=JSON.parse(fs.readFileSync('pet-app/public/assets/art/brawl/manifest.json','utf8'));
const cast=manifest.fighterSkillAnimations[id];
for(const [clip,count] of [[cast,16],[manifest.skillFx['banana-prank'],8],[manifest.skillFx['plush-hug'],8]]){
 const file='pet-app/public/'+clip.url.replace('/pet/',''),meta=await sharp(file).metadata(),w=clip.frameWidth,h=clip.frameHeight;
 assert.ok(meta.hasAlpha&&meta.width<=2048&&meta.height<=2048);assert.equal(meta.width/w*meta.height/h,count);
 for(let n=0;n<count;n++){
  const {data,info}=await sharp(file).extract({left:n%(meta.width/w)*w,top:Math.floor(n/(meta.width/w))*h,width:w,height:h}).raw().toBuffer({resolveWithObject:true});let visible=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const alpha=data[(y*w+x)*info.channels+3];if(x<8||x>=w-8||y<4||y>=h-4)assert.equal(alpha,0,'clean transparent gutters');if(alpha>20)visible++;}
  assert.ok(visible>1000,'each cell contains a complete visible frame');
 }
}
console.log('✓ Sixteen casting poses and sixteen effect frames have genuine alpha, clean cell gutters and mobile-sized atlas dimensions');
