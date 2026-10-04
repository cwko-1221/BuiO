import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import {VERSION,FIGHTERS,STAGES,INPUT as I,fightersForVersion} from '../pet-app/lib/brawl/catalog.mjs';
import {createBattle,stepBattle,replayBattle,battleResult} from '../pet-app/lib/brawl/simulation.mjs';
import * as v9 from '../pet-app/lib/brawl/legacy/v9/simulation.mjs';
import * as v10 from '../pet-app/lib/brawl/legacy/v10/simulation.mjs';

const run=(s,n,mask=0,other=0)=>{const events=[];for(let i=0;i<n;i++){stepBattle(s,mask,other);events.push(...s.events);}return events;};
const wait=(s,condition,limit=400,mask=0,other=0)=>{const events=[];while(!condition()&&limit-->0){stepBattle(s,mask,other);events.push(...s.events);}assert.ok(condition(),'condition completed within its tick budget');return events;};
const arena=(fighter,opponent='dragon-ball-goku')=>createBattle({mode:'pvp',fighterId:fighter,opponentId:opponent});
const pass=text=>console.log('✓ '+text);
assert.equal(VERSION,'brawl-v12');

// These isolated fixtures change starting positions, never damage results. All
// effects below are produced by the real input and shared simulation paths.
let s=arena('spy-family-anya'),a=s.actors[0],b=s.actors[1];b.x=a.x+5500;
run(s,1,I.SKILL1);run(s,40);assert.equal(b.hp,b.maxHp);assert.equal(b.readBonus,8);assert.ok(b.readUntil>s.tick);
const hp=b.hp;let events=run(s,1,I.ATTACK);events.push(...wait(s,()=>b.hp<hp,30));
assert.equal(hp-b.hp,16);assert.equal(b.readUntil,0);assert.equal(b.mindStunUntil-s.tick,60);
const x=b.x;run(s,28,0,I.RIGHT|I.SKILL1);assert.equal(b.x,x);assert.equal(b.cooldowns[0],0);
run(s,100);a.x=b.x-5500;events=run(s,1,I.ATTACK);events.push(...run(s,35));
assert.equal(events.find(e=>e.type==='hit'&&e.source===a.id).damage,8,'the consumed mark cannot add damage twice');
s=arena('spy-family-anya');[a,b]=s.actors;b.x=a.x+5500;run(s,1,I.SKILL1,I.GUARD);run(s,40,0,I.GUARD);
events=run(s,1,I.ATTACK,I.GUARD);events.push(...run(s,22,0,I.GUARD));assert.ok(events.some(e=>e.type==='block'));assert.ok(b.readUntil>s.tick);assert.equal(b.mindStunUntil,undefined);
pass('Anya marks without initial damage, adds exactly 8 and one second of real stun on the first landed attack; guard preserves the mark');

s=arena('spy-family-anya');[a,b]=s.actors;run(s,1,I.SKILL2);run(s,40);const wardHp=a.hp,foeHp=b.hp;events=[];
for(let n=0;n<3;n++){b.x=a.x+5500;b.y=a.y;events.push(...run(s,1,0,I.ATTACK));events.push(...run(s,48));assert.equal(a.hp,wardHp);assert.equal(a.wardMeleeLeft,2-n);}
assert.equal(events.filter(e=>e.type==='reflect').length,3);assert.equal(foeHp-b.hp,24);assert.equal(a.wardUntil,0);
b.x=a.x+5500;b.y=a.y;run(s,1,0,I.ATTACK);run(s,30);assert.equal(wardHp-a.hp,8);
for(const opponent of ['doraemon','argentina-number-10']){
 s=arena('spy-family-anya',opponent);[a,b]=s.actors;b.x=a.x+31000;run(s,1,I.SKILL2);run(s,40);
 const ownHp=a.hp,enemyHp=b.hp;events=run(s,1,0,opponent==='doraemon'?I.SKILL1:I.SKILL2);events.push(...run(s,180));
 assert.equal(events.filter(e=>e.type==='reflect').length,1);assert.equal(a.hp,ownHp);assert.equal(enemyHp-b.hp,opponent==='doraemon'?35:25);assert.equal(s.projectiles.length,0);assert.equal(a.wardUntil,0);assert.equal(a.wardRangedLeft,0);
}
pass('Ward reflects three separate melee strikes or one ranged hit, consumes intercepted normal/homing projectiles, and never applies the same hit again');

s=arena('doraemon');[a,b]=s.actors;b.x=a.x+14000;const start=b.x;
events=run(s,1,I.SKILL1);events.push(...run(s,140));assert.equal(b.maxHp-b.hp,35);assert.ok(Math.abs((b.x-start)/100-640)<2,`half-arena knockback: ${(b.x-start)/100}`);
s=arena('doraemon');[a,b]=s.actors;a.x=100000;b.x=116000;run(s,1,I.SKILL1);run(s,140);assert.equal(b.x,123500,'the wall limits displacement');
pass('Air Cannon deals 35 and pushes approximately 640 pixels, with arena walls limiting the displacement');

s=arena('doraemon','argentina-number-10');[a,b]=s.actors;b.x=a.x+31000;
run(s,1,I.SKILL2);wait(s,()=>a.flightUntil>s.tick);const flightStart=s.tick,flightEnd=a.flightUntil;assert.equal(flightEnd-flightStart,240);
const flyHp=a.hp,groundHp=b.hp;events=run(s,1,0,I.SKILL2);events.push(...run(s,40));events.push(...run(s,110,I.ATTACK));
assert.equal(events.filter(e=>e.type==='airRay').length,3);assert.equal(b.hp,groundHp-42);assert.equal(a.hp,flyHp);assert.equal(a.flightShots,0);assert.ok(s.projectiles.length,'homing waits beneath a flying enemy');
events=run(s,flightEnd-s.tick-1,I.ATTACK);assert.equal(a.hp,flyHp);assert.equal(a.z,22000);assert.equal(events.filter(e=>e.type==='airRay').length,0);
run(s,1);assert.equal(a.flightUntil,0);assert.equal(a.z,0);assert.equal(flightEnd,s.tick);assert.equal(a.hp,flyHp-25,'the waiting ball connects after the flight ends');
s=arena('doraemon');[a,b]=s.actors;b.x=a.x+5500;run(s,1,I.SKILL2);wait(s,()=>a.flightUntil>s.tick);const safe=a.hp;
run(s,120,I.RIGHT|I.ATTACK,I.ATTACK);assert.equal(a.hp,safe);assert.ok(a.x>19000);assert.equal(a.flightShots,0);
pass('Take-copter lasts exactly four seconds, permits movement and exactly three 14-damage basic rays, prevents incoming attacks and lands before a waiting homing ball hits');

for(const [behind,depth,invuln] of [[true,220,0],[false,-110,120],[true,0,0]]){
 s=arena('argentina-number-10');[a,b]=s.actors;a.x=60000;a.y=34500;b.x=behind?16000:110000;b.y=a.y+depth*100;b.invuln=invuln;
 events=run(s,1,I.SKILL2);events.push(...run(s,240,0,behind?I.RIGHT|I.RUN:I.LEFT|I.RUN));
 assert.equal(events.filter(e=>e.type==='hit'&&e.source===a.id&&e.actor===b.id).length,1);assert.equal(b.maxHp-b.hp,25);assert.equal(s.projectiles.length,0);
}
pass('Homing football hits a running target behind the shooter, tracks across the full depth, and waits through hit protection');

s=createBattle({mode:'practice',fighterId:'naruto-uzumaki'});[a,b]=s.actors;b.x=a.x+18000;
events=run(s,1,I.SKILL1);events.push(...wait(s,()=>s.actors.filter(t=>t.cloneOwner).length===2));
let clones=s.actors.filter(t=>t.cloneOwner);const ids=clones.map(t=>t.id),expires=clones[0].cloneExpires;assert.equal(expires-s.tick,180);assert.ok(clones.every(t=>t.hp===1&&t.team===a.team));assert.equal(s.fields.length,0);
const ownerX=a.x;events.push(...run(s,120));assert.equal(a.x,ownerX);assert.ok(ids.every(id=>events.some(e=>e.type==='hit'&&e.source===id)),'both clones approach and strike without owner inputs');assert.ok(events.filter(e=>ids.includes(e.source)).every(e=>!e.mpGain));
events.push(...run(s,expires-s.tick-1));assert.equal(s.actors.filter(t=>t.cloneOwner).length,2,'clones still exist on tick 179');events.push(...run(s,1));assert.equal(s.actors.filter(t=>t.cloneOwner).length,0);assert.equal(events.filter(e=>e.type==='cloneSmoke'&&!e.spawn).length,2);
s=arena('doraemon','naruto-uzumaki');[a,b]=s.actors;a.x=20000;b.x=80000;run(s,1,0,I.SKILL1);wait(s,()=>s.actors.filter(t=>t.cloneOwner).length===2);
clones=s.actors.filter(t=>t.cloneOwner);const clone=clones[0];clone.y=34500;clones[1].y=56500;a.y=34500;a.invuln=500;
for(let n=0;n<1;n++){
 a.x=clone.x-5500;a.facing=1;events=run(s,1,I.ATTACK);events.push(...run(s,30));
 assert.ok(events.some(e=>e.type==='hit'&&e.source===a.id&&e.actor===clone.id&&e.damage===1));
 assert.ok(events.some(e=>e.type==='cloneSmoke'&&!e.spawn&&e.actor===clone.id));
}
assert.ok(!s.actors.includes(clone));assert.equal(s.kills,0);assert.equal(s.pickups.length,0);assert.equal(s.status,'playing');
s=createBattle({mode:'practice',fighterId:'naruto-uzumaki'});run(s,1,I.SKILL1);wait(s,()=>s.actors.length===4);a=s.actors[0];a.cooldowns[0]=0;a.mp=10000;run(s,45);run(s,1,I.SKILL1);run(s,15);assert.equal(s.actors.filter(t=>t.cloneOwner).length,2,'recasting replaces rather than duplicates clones');
a.hp=0;events=run(s,1);assert.equal(s.actors.filter(t=>t.cloneOwner).length,0);assert.equal(events.filter(e=>e.type==='cloneSmoke'&&!e.spawn).length,2);
pass('Two autonomous real clones pursue and attack, each expires at three seconds or its first hit with smoke, and clones grant no MP, kills or pickups; recasts and owner death clean up');

// Unmodified starting states and only legal input frames exercise authoritative
// saves/replay separately from the isolated positioning fixtures above.
const changed=['one-piece-luffy','spy-family-anya','doraemon','argentina-number-10','naruto-uzumaki'];
for(const id of changed)for(const mode of ['practice','duel','campaign','pvp']){
 const options={version:VERSION,mode,fighterId:id,opponentId:'naruto-uzumaki',stageId:STAGES[0].id,seed:937};s=createBattle(options);
 const log=[];let previous=-1;
 for(let tick=1;tick<=660&&!(['won','lost','draw'].includes(s.status));tick++){
  const mask=tick<80?I.RIGHT:tick===81?I.SKILL1:tick===180?I.SKILL2:tick%100<30?I.ATTACK:0;
  if(mask!==previous){log.push({tick,mask});previous=mask;}stepBattle(s,mask);
 }
 assert.ok(s.tick>0);assert.deepEqual(replayBattle(options,log,s.tick,{terminal:false}),s);
}
for(const [version,archive] of [['brawl-v9',v9],['brawl-v10',v10]])for(const f of fightersForVersion(version))for(const mode of ['practice','campaign']){
 const options={version,mode,fighterId:f.id,stageId:STAGES[14].id,seed:987},log=[{tick:1,mask:I.RIGHT},{tick:60,mask:0},{tick:61,mask:I.SKILL1},{tick:62,mask:0},{tick:160,mask:I.SKILL2},{tick:161,mask:0}],old=archive.createBattle(options);let mask=0;
 for(let tick=1;tick<=400;tick++){const frame=log.find(f=>f.tick===tick);if(frame)mask=frame.mask;archive.stepBattle(old,mask);}
 assert.deepEqual(replayBattle(options,log,400,{terminal:false}),old);assert.deepEqual(battleResult(old),archive.battleResult(old));
}
pass('All five changed fighters replay deterministically in four modes; all 25 archived v9/v10 fighters retain exact skills, NPC combat and results');

const manifest=JSON.parse(await fs.readFile('pet-app/public/assets/art/brawl/manifest.json','utf8'));
for(const name of ['gum-pistol','gum-gatling']){
 const clip=manifest.skillFx[name],file='pet-app/public/'+clip.url.replace('/pet/',''),meta=await sharp(file).metadata();assert.equal(meta.width,2048);assert.equal(meta.height,512);assert.ok(meta.hasAlpha);assert.equal(clip.frames,8);
 for(let n=0;n<8;n++){
  const {data,info}=await sharp(file).extract({left:n%4*512,top:Math.floor(n/4)*256,width:512,height:256}).raw().toBuffer({resolveWithObject:true});let occupied=0;
  for(let y=0;y<256;y++)for(let x=0;x<512;x++){const alpha=data[(y*512+x)*info.channels+3];if(x<12||x>=500||y<4||y>=252)assert.equal(alpha,0,'transparent gutters prevent clipping and texture bleed');if(alpha>20)occupied++;}
  assert.ok(occupied>1500,'each animation frame contains a complete visible pose');
 }
}
pass('Both redrawn Luffy effects contain eight full transparent frames with clean gutters and iPad-sized textures');
assert.equal(FIGHTERS.length,27);
