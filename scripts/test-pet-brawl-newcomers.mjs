import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {FIGHTERS,INPUT as I,VERSION,fightersForVersion} from '../pet-app/lib/brawl/catalog.mjs';
import {createBattle,stepBattle,replayBattle,battleResult} from '../pet-app/lib/brawl/simulation.mjs';
import * as v11 from '../pet-app/lib/brawl/legacy/v11/simulation.mjs';
import {interceptProjectile} from '../pet-app/lib/brawl/elemental-combat.mjs';
const zhao='dynasty-warriors-zhao-yun',kirito='sword-art-online-kirito';
const run=(s,n,mask=0,other=0)=>{const events=[];for(let t=0;t<n;t++){stepBattle(s,t===0?mask:0,t===0?other:0);events.push(...s.events.map(e=>({...e,tick:s.tick})));}return events;};
assert.equal(VERSION,'brawl-v13');assert.ok([zhao,kirito].every(id=>FIGHTERS.find(f=>f.id===id)?.skills.length===2));
// Compare the archive itself with the approved previous implementation, then
// verify routing, resumable states and authoritative input replays for every pet.
const archiveHashes={
  "abilities.mjs": "3c5c83e7352c1963fea98c0b8aebbcc2f8c0d409d3be5b503db7127c481ba09d",
  "adventure-design.mjs": "af22bf20d7162bfcc973cfef86d4cc806126e5be8988c6143ace992d9814c19a",
  "catalog.d.mts": "1def2ff25e4ca467c466177e9727998d8de9bc42fdea2e40c75ae3e7dee7b2d9",
  "catalog.mjs": "6e37ab1238ecc62c29ef0dcd13c183a269144512e8cb8dc0004e36fdd5bc4615",
  "elemental-combat.mjs": "10f63db771982ebce6bdf2fb837a675a20a5d52c82e58ba29cb213a37f6578b8",
  "elemental-kits.mjs": "e948f8ad0dc7d246e716697d2e871be48ff3f79e565de59430450855743789a1",
  "enemy-combat.d.mts": "fef091f36c4658a75093c6d97185c68cba5896977b853099358bcb88599cd2ee",
  "enemy-combat.mjs": "5c9e6197e29141acf2880f6876cdd11666ef310e7c0bed4e0e594b83f7e4ca14",
  "fighter-roster.mjs": "9f40a7d24083817d4b158df160796d368bcae67dc16f3b44b717f7afae6f6fa2",
  "fighter-utility.mjs": "a423d5861d7cef6819b899b4cc146e9d0e797a4df906f4c4e63eb2a7703ad18f",
  "simulation.d.mts": "b6f73eb460aca5a19c9ff34e848e152f2f86f043d0b8e33b3eca5451a67ed233",
  "simulation.mjs": "13eafb5927b16681e196bec69ef714e90278897a0ca788591ffa13a1021ecab8"
};
for(const [file,expected] of Object.entries(archiveHashes)){
 const bytes=fs.readFileSync('pet-app/lib/brawl/legacy/v11/'+file,'utf8').replaceAll('\r\n','\n');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,file+' approved v11 implementation');
}
assert.equal(fightersForVersion('brawl-v11').length,25);
for(const f of fightersForVersion('brawl-v11')){
 const options={version:'brawl-v11',mode:'practice',fighterId:f.id,seed:912},log=[{tick:1,mask:I.RIGHT},{tick:45,mask:0},{tick:46,mask:I.SKILL1},{tick:47,mask:0},{tick:190,mask:I.SKILL2},{tick:191,mask:0},{tick:330,mask:I.ATTACK},{tick:331,mask:0}];
 const archived=v11.createBattle(options);let routed=createBattle(options),mask=0;
 for(let tick=1;tick<=420;tick++){const frame=log.find(f=>f.tick===tick);if(frame)mask=frame.mask;v11.stepBattle(archived,mask);stepBattle(routed,mask);if(tick===170)routed=JSON.parse(JSON.stringify(routed));}
 assert.deepEqual(routed,archived,f.id+' saved state');assert.deepEqual(replayBattle(options,log,420,{terminal:false}),archived);assert.deepEqual(battleResult(routed),v11.battleResult(archived));
}
console.log('✓ v11 implementation frozen exactly; all 25 historical fighters resume and replay unchanged');

for(const [id,n,count,total] of [[zhao,0,3,26],[kirito,1,16,42]]){
 const s=createBattle({mode:'practice',fighterId:id}),[a,b]=s.actors;b.x=a.x+10000;
 const origin=a.x,cost=FIGHTERS.find(f=>f.id===id).skills[n].mp,events=run(s,340,n?I.SKILL2:I.SKILL1),hits=events.filter(e=>e.type==='hit'&&e.source===a.id);
 assert.equal(hits.length,count,id+' real strike count');assert.equal(hits.reduce((n,e)=>n+e.damage,0),total);assert.equal(b.maxHp-b.hp,total);assert.equal(a.x,origin,'stationary weapon skill');assert.ok(hits.at(-1).heavy);assert.ok(!hits.some(e=>e.mpGain),'skills do not refund MP');assert.ok(a.mp<10000-cost*100+1200);
 const duel=createBattle({mode:'pvp',fighterId:id,opponentId:'starpatch-cat'}),[p,t]=duel.actors;t.x=p.x+10000;
 const duelHits=run(duel,340,n?I.SKILL2:I.SKILL1).filter(e=>e.type==='hit'&&e.source===p.id);
 assert.equal(duelHits.length,count,id+' full combination works against a human opponent');assert.equal(t.maxHp-t.hp,total);
}
console.log('✓ Three spear strikes deal 26; sixteen alternating sword hits deal 42 with a single final knockdown and no dash or MP refund');

let s=createBattle({mode:'pvp',fighterId:kirito,opponentId:'starpatch-cat'}),[a,b]=s.actors;b.x=a.x+5500;
let events=run(s,1,I.SKILL2,I.ATTACK);events.push(...run(s,160));assert.ok(a.hp<a.maxHp);assert.equal(events.filter(e=>e.type==='skillRelease'&&e.actor===a.id).length,0,'melee interrupts the sword wind-up');
s=createBattle({mode:'pvp',fighterId:kirito,opponentId:'starpatch-cat'});[a,b]=s.actors;b.x=a.x+12000;a.mp=100;
run(s,1,I.SKILL2);assert.equal(a.cooldowns[1],0);assert.notEqual(a.action,'skill2');
s=createBattle({mode:'pvp',fighterId:kirito,opponentId:'starpatch-cat'});[a,b]=s.actors;b.x=a.x+10000;events=run(s,36,I.SKILL2);assert.ok(events.some(e=>e.type==='hit'&&e.source===a.id));
const rear={...structuredClone(b),id:s.nextId++,x:a.x-5500,y:a.y,facing:1,action:'idle',actionTick:0,actionDuration:0,invuln:0,stop:0,human:true,lastMask:0};s.actors.push(rear);
events.push(...run(s,1,0,I.ATTACK),...run(s,180));assert.ok(events.some(e=>e.type==='hit'&&e.source===rear.id&&e.actor===a.id));assert.ok(events.filter(e=>e.type==='skillRelease'&&e.actor===a.id).length<16,'rear melee interrupts an active sequence');
console.log('✓ Melee interrupts Starburst during wind-up and an active combo; insufficient MP does not cast or start cooldown');

s=createBattle({mode:'practice',fighterId:kirito});[a,b]=s.actors;b.x=a.x+21000;
const c={...structuredClone(b),id:s.nextId++,x:b.x+15000};s.actors.push(c);events=run(s,220,I.SKILL1);
const releases=events.filter(e=>e.type==='skillRelease');assert.equal(releases.length,2);
for(const t of [b,c]){const hits=events.filter(e=>e.type==='hit'&&e.actor===t.id);assert.equal(hits.length,2);assert.equal(t.maxHp-t.hp,24);assert.equal(t.slowUntil,hits.at(-1).tick+60);}
console.log('✓ Two ranged sword waves pierce two enemies each, dealing 24 per enemy and applying slow');

s=createBattle({mode:'pvp',fighterId:zhao,opponentId:'doraemon'});[a,b]=s.actors;b.x=a.x+32000;
events=run(s,22,I.SKILL2);const ward=s.fields[0];assert.ok(ward);assert.equal(ward.blocksLeft,2);const expires=ward.expires,ownHp=a.hp;
events=run(s,100,0,I.SKILL1);assert.equal(a.hp,ownHp);assert.equal(ward.blocksLeft,1);assert.equal(events.filter(e=>e.type==='wardBlock').length,1);
const projectile=(extra={})=>({id:s.nextId++,owner:b.id,team:b.team,x:a.x+24000,y:a.y,z:3500,dx:-28000,dy:0,remaining:50000,damage:35,hitIds:[],...extra});
assert.equal(interceptProjectile(s,projectile({team:a.team})),false);assert.equal(interceptProjectile(s,projectile({z:7000})),false);
const fast=projectile();assert.equal(interceptProjectile(s,fast),true,'swept projectile cannot tunnel through ward');assert.equal(fast.remaining,0);assert.equal(ward.blocksLeft,0);assert.equal(interceptProjectile(s,projectile()),false,'third projectile is not blocked');
ward.blocksLeft=2;run(s,8,I.RIGHT);assert.equal(ward.x,a.x);assert.equal(ward.y,a.y);
b.x=a.x+5500;events=run(s,28,0,I.ATTACK);assert.ok(a.hp<ownHp,'ward permits melee damage');assert.equal(ward.blocksLeft,2,'melee consumes no projectile charge');
run(s,expires-s.tick+1);assert.equal(s.fields.length,0,'ward expires after 150 ticks');
console.log('✓ Moving ward blocks two projectiles including fast swept shots, passes friendly/high shots and melee, then expires at 2.5 seconds');

for(const [id,bit] of [[zhao,I.SKILL1],[kirito,I.SKILL2]]){
 s=createBattle({mode:'pvp',fighterId:'starpatch-cat',opponentId:id});[a,b]=s.actors;a.x=b.x-10000;events=run(s,360,0,bit);assert.ok(events.some(e=>e.type==='skillRelease'&&e.actor===b.id),'guest slot uses the same skill');
 const options={mode:'practice',fighterId:id,seed:491},log=[{tick:1,mask:I.RIGHT},{tick:55,mask:0},{tick:56,mask:I.SKILL1},{tick:57,mask:0},{tick:250,mask:I.SKILL2},{tick:251,mask:0}];const live=createBattle(options);let mask=0;
 for(let tick=1;tick<=650;tick++){const f=log.find(f=>f.tick===tick);if(f)mask=f.mask;stepBattle(live,mask);}assert.deepEqual(replayBattle(options,log,650,{terminal:false}),live);
}
console.log('✓ Both new pets cast from the PvP guest slot and reproduce their authoritative input logs');
