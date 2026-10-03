import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {createBattle,stepBattle,replayBattle} from '../pet-app/lib/brawl/simulation.mjs';
import * as v3 from '../pet-app/lib/brawl/legacy/v3/simulation.mjs';
import {INPUT as I} from '../pet-app/lib/brawl/catalog.mjs';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-pvp-test-'));
process.env.BUIO_JSON_DB_FILE=path.join(temp,'db.json');process.env.SUPABASE_DB_URL='';
await fs.writeFile(process.env.BUIO_JSON_DB_FILE,JSON.stringify({users:[1,2,3].map(n=>({studentid:'S00'+n,name:'同學'+n,classname:'5A',role:'student'})).concat({studentid:'T001',name:'老師',role:'teacher'}),studentStats:[],questionLogs:[],_logId:0}));
const require=createRequire(import.meta.url),pets=require('../pet-app/repositories/pet.repo'),repo=require('../pet-app/repositories/brawl-duel.repo'),store=require('../db/jsonStore');
const {Server}=require('socket.io');
const {io:client}=createRequire(path.resolve('whiteboard-app/client/package.json'))('socket.io-client');
const checks=[],pass=label=>{checks.push(label);console.log('✓ '+label);};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn){const end=Date.now()+4000;while(!fn()){if(Date.now()>end)throw new Error('Timed out waiting for duel state');await delay(20);}}
for(let n=1;n<=3;n++)await pets.ensureStudent('S00'+n);
const d=store.load(),ids=['S001','S002','S003'],petIds=ids.map(()=>randomUUID()),fighters=['starpatch-cat','pudding-pig','cloud-ear-dog'];
for(let n=0;n<3;n++){d.petWallets.find(w=>w.studentId===ids[n]).balance=5000;d.petInstances.push({petId:petIds[n],studentId:ids[n],speciesId:fighters[n],xp:0,stage:1,equippedSkills:[],equippedWearables:[]});}store.save();
const balances=()=>ids.map(id=>d.petWallets.find(w=>w.studentId===id).balance);
const entries=()=>d.petCurrencyLedger.filter(l=>l.kind==='brawl_duel_entry').length;
const meta=()=>({id:randomUUID(),version:'brawl-v8',stageId:'sunny-training',seed:1,players:ids.slice(0,2).map((id,n)=>({id,petId:petIds[n],fighterId:fighters[n],name:id}))});
let server,io,duels,sockets=[];
try{
  const baseline=balances();let m=meta();d.petWallets[1].balance=499;store.save();await assert.rejects(repo.charge(m),/不足/);assert.deepEqual(balances(),[5000,499,5000]);assert.equal(entries(),0);d.petWallets[1].balance=5000;
  m=meta();m.players[1].petId=petIds[0];await assert.rejects(repo.charge(m),/擁有/);assert.equal(entries(),0);
  await assert.rejects(repo.charge(meta(),()=>false),/失效/);assert.deepEqual(balances(),baseline);
  const originalSave=store.save;store.save=()=>{throw new Error('disk failed');};await assert.rejects(repo.charge(meta()),/disk failed/);store.save=originalSave;assert.deepEqual(balances(),baseline);assert.equal(entries(),0);store.save();
  m=meta();const concurrent=await Promise.allSettled([repo.charge(m),repo.charge(meta())]);assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);const paid=concurrent.find(r=>r.status==='fulfilled').value;
  await repo.charge(paid);assert.deepEqual(balances(),[4500,4500,5000]);assert.equal(entries(),2);
  await Promise.all([repo.finalize(paid.id,{status:'cancelled',reason:'test'},true),repo.finalize(paid.id,{status:'cancelled',reason:'test'},true)]);assert.deepEqual(balances(),baseline);assert.equal(d.petCurrencyLedger.filter(l=>l.kind==='brawl_duel_refund').length,2);
  pass('two-wallet atomic payment, insufficient funds, ownership, persistence rollback, concurrent charge and idempotent refunds');

  // Both players are human: an idle opponent never walks or casts an AI move.
  let s=createBattle({mode:'pvp',fighterId:fighters[0],opponentId:fighters[1]});const idle=structuredClone(s.actors[1]);for(let n=0;n<120;n++)stepBattle(s);assert.equal(s.actors[1].x,idle.x);assert.equal(s.actors[1].action,'idle');
  stepBattle(s,I.RIGHT,I.LEFT);assert.ok(s.actors[0].x>19000);assert.ok(s.actors[1].x<92000);assert.throws(()=>stepBattle(s,0,1024),/Invalid/);
  s=createBattle({mode:'pvp',fighterId:fighters[0],opponentId:fighters[0]});s.actors[0].x=56000;s.actors[1].x=63000;
  const hits=[];for(let n=0;n<110;n++){stepBattle(s,n===0?I.SKILL2:0,0);hits.push(...s.events.filter(e=>e.type==='hit'));}assert.equal(hits.length,3);assert.equal(s.actors[1].maxHp-s.actors[1].hp,30);
  s=createBattle({mode:'pvp',fighterId:fighters[0],opponentId:fighters[0]});s.actors[0].x=63000;s.actors[1].x=70000;const reverse=[];
  for(let n=0;n<110;n++){stepBattle(s,0,n===0?I.SKILL2:0);reverse.push(...s.events.filter(e=>e.type==='hit'));}assert.equal(reverse.length,3);assert.equal(s.actors[0].maxHp-s.actors[0].hp,30);
  s=createBattle({mode:'pvp',fighterId:fighters[0],opponentId:fighters[0]});for(let n=0;n<5400;n++)stepBattle(s);assert.equal(s.status,'draw');
  s=createBattle({mode:'pvp',fighterId:fighters[0],opponentId:fighters[1]});s.actors[0].hp=80;s.actors[1].hp=90;for(let n=0;n<5400;n++)stepBattle(s);assert.equal(s.status,'won','time limit compares HP ratios, not absolute HP');
  const opts={version:'brawl-v3',mode:'practice',seed:123,fighterId:fighters[0]},old=v3.createBattle(opts),inputs=[{tick:1,mask:I.RIGHT},{tick:80,mask:0},{tick:90,mask:I.SKILL1},{tick:91,mask:0},{tick:120,mask:I.SKILL2},{tick:121,mask:0}];let mask=0;for(let tick=1;tick<=240;tick++){const input=inputs.find(f=>f.tick===tick);if(input)mask=input.mask;v3.stepBattle(old,mask);}assert.deepEqual(replayBattle(opts,inputs,240,{terminal:false}),old);
  pass('independent human controls, symmetric three-hit cat skill, invalid inputs and exact v3 save compatibility');

  let time=Date.now();server=http.createServer();io=new Server(server);io.engine.use((req,res,next)=>{req.session={studentId:req.headers['x-test-student'],role:req.headers['x-test-student']==='T001'?'teacher':'student'};next();});
  duels=require('../pet-app/server/duel')(io,{now:()=>time,countdownMs:0,inviteMs:60000,prepareMs:10000,reconnectMs:2000});await duels.startup;
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
  const connect=async id=>{const sock=client(url+'/pet-brawl',{extraHeaders:{'x-test-student':id},transports:['websocket'],reconnection:false});sockets.push(sock);sock.received={};sock.onAny((event,data)=>sock.received[event]=data);await new Promise((resolve,reject)=>{sock.once('connect',resolve);sock.once('connect_error',reject);});return sock;};
  const rejected=client(url+'/pet-brawl',{extraHeaders:{'x-test-student':'T001'},transports:['websocket'],reconnection:false});await new Promise(r=>rejected.once('connect_error',r));rejected.close();
  const [a,b,c]=await Promise.all(ids.map(connect));
  const request=(sock,event,data)=>new Promise((resolve,reject)=>sock.timeout(3000).emit(event,data,(error,response)=>error?reject(error):resolve(response)));
  const ping=sock=>request(sock,'duel:presence',{active:true,busy:false,refresh:true});await Promise.all([a,b,c].map(ping));
  assert.equal((await ping(a)).peers.length,2);
  const invite=async()=>{time+=4000;await Promise.all([a,b].map(ping));const r=await request(a,'duel:invite',{targetId:ids[1],petId:petIds[0],stageId:'sunny-training',key:randomUUID()});assert.equal(r.success,true,JSON.stringify(r));return r.invitation;};
  let inv=await invite();assert.equal((await request(c,'duel:reply',{inviteId:inv.id,accept:false})).success,false);assert.deepEqual(balances(),baseline);
  assert.equal((await request(b,'duel:reply',{inviteId:inv.id,accept:false})).success,true);assert.deepEqual(balances(),baseline);
  inv=await invite();await request(a,'duel:cancel',{inviteId:inv.id});assert.deepEqual(balances(),baseline);
  inv=await invite();time+=60001;await until(()=>duels.invites.get(inv.id).status==='expired');assert.equal((await request(b,'duel:reply',{inviteId:inv.id,accept:true,petId:petIds[1]})).success,false);assert.deepEqual(balances(),baseline);
  inv=await invite();await request(b,'duel:presence',{active:false,busy:false});assert.equal(duels.invites.get(inv.id).status,'cancelled');await ping(b);assert.deepEqual(balances(),baseline);
  inv=await invite();d.petWallets[1].balance=499;store.save();assert.equal((await request(b,'duel:reply',{inviteId:inv.id,accept:true,petId:petIds[1]})).success,false);assert.deepEqual(balances(),[5000,499,5000]);d.petWallets[1].balance=5000;store.save();
  pass('student-only namespace, online roster, refusal, sender cancellation, expiry, offline cancellation and insufficient funds never charge either side');

  const accept=async()=>{inv=await invite();const response=await request(b,'duel:reply',{inviteId:inv.id,accept:true,petId:petIds[1]});assert.equal(response.success,true,JSON.stringify(response));return response.session.match.id;};
  let mid=await accept(),r=duels.rooms.get(mid);assert.deepEqual(balances(),[4500,4500,5000]);const entryCount=entries();assert.equal((await request(b,'duel:reply',{inviteId:inv.id,accept:true,petId:petIds[1]})).success,true);assert.equal(entries(),entryCount);assert.equal((await request(c,'duel:ready',{matchId:mid})).success,false);
  await request(a,'duel:ready',{matchId:mid});await request(b,'duel:ready',{matchId:mid});await until(()=>r.phase==='playing');
  a.emit('duel:input',{matchId:mid,seq:1,mask:I.RIGHT});b.emit('duel:input',{matchId:mid,seq:1,mask:I.LEFT});await delay(30);time+=150;await until(()=>r.state.tick>0);assert.ok(r.state.actors[0].x>19000);assert.ok(r.state.actors[1].x<92000);
  const seq=r.seq[0];await request(a,'duel:ready',{matchId:mid});assert.equal(r.seq[0],seq);c.emit('duel:input',{matchId:mid,seq:999,mask:I.SKILL1});a.emit('duel:input',{matchId:mid,seq:999,mask:1024});await delay(35);assert.equal(r.seq[0],seq);
  a.emit('duel:input',{matchId:mid,seq:2,mask:I.JUMP});a.emit('duel:input',{matchId:mid,seq:3,mask:0});await delay(20);time+=50;await until(()=>r.state.actors[0].z>0);
  // A transport disconnect freezes the authoritative clock until a new socket is ready.
  a.disconnect();await until(()=>r.phase==='reconnecting');const frozen=r.state.tick;time+=500;await delay(40);assert.equal(r.state.tick,frozen);const a2=await connect(ids[0]);await ping(a2);await request(a2,'duel:ready',{matchId:mid});await until(()=>r.phase==='playing');assert.equal(entries(),entryCount);
  await request(a2,'duel:leave',{matchId:mid});assert.equal(r.meta.winnerIndex,1);assert.equal(r.meta.status,'finished');assert.deepEqual(balances(),[4500,4500,5000]);assert.equal((await request(a2,'duel:leave',{matchId:mid})).success,false);
  const stored=await request(a2,'duel:presence',{active:true,busy:false,matchId:mid});assert.equal(stored.result.match.id,mid);
  pass('accepted payment exactly once, server-owned controls, tap buffering, reconnect without repayment, surrender and durable results');
  // Swap the inviter socket after reconnect, keeping a single account identity.
  sockets.splice(sockets.indexOf(a),1);a.disconnect();
  const sendInvite=async()=>{time+=4000;await Promise.all([a2,b].map(ping));const response=await request(a2,'duel:invite',{targetId:ids[1],petId:petIds[0],stageId:'sunny-training',key:randomUUID()});assert.equal(response.success,true,JSON.stringify(response));inv=response.invitation;const response2=await request(b,'duel:reply',{inviteId:inv.id,accept:true,petId:petIds[1]});assert.equal(response2.success,true);return duels.rooms.get(response2.session.match.id);};
  r=await sendInvite();time+=10001;await until(()=>r.meta.status==='cancelled');assert.equal(r.meta.refunded,true);assert.deepEqual(balances(),[4500,4500,5000]);
  r=await sendInvite();await request(a2,'duel:leave',{matchId:r.meta.id});assert.equal(r.meta.refunded,true);assert.deepEqual(balances(),[4500,4500,5000]);
  r=await sendInvite();await request(a2,'duel:ready',{matchId:r.meta.id});await request(b,'duel:ready',{matchId:r.meta.id});await until(()=>r.phase==='playing');a2.disconnect();await until(()=>r.phase==='reconnecting');time+=2001;await until(()=>r.meta.status==='finished');assert.equal(r.meta.winnerIndex,1);assert.equal(r.meta.refunded,undefined);assert.deepEqual(balances(),[4000,4000,5000]);
  pass('preparation timeout and pre-start leave refund both, while a started disconnect gives the connected player a forfeit win');

  const a3=await connect(ids[0]);await ping(a3);time+=4000;await ping(b);let response=await request(a3,'duel:invite',{targetId:ids[1],petId:petIds[0],stageId:'sunny-training',key:randomUUID()});assert.equal(response.success,true);response=await request(b,'duel:reply',{inviteId:response.invitation.id,accept:true,petId:petIds[1]});r=duels.rooms.get(response.session.match.id);await request(a3,'duel:ready',{matchId:r.meta.id});await request(b,'duel:ready',{matchId:r.meta.id});await until(()=>r.phase==='playing');a3.disconnect();b.disconnect();await until(()=>r.controllers.every(c=>c===null));time+=2001;await until(()=>r.meta.status==='cancelled');assert.equal(r.meta.reason,'both_disconnected');assert.deepEqual(balances(),[4000,4000,5000]);
  pass('both players disconnecting cancels and refunds the abandoned match');

  m=meta();await repo.charge(m);assert.equal(await repo.recover(),1);assert.equal(await repo.recover(),0);assert.deepEqual(balances(),[4000,4000,5000]);
  m=meta();await repo.charge(m);await require('../math-app/repositories/users.repo').deleteById('S001');assert.equal(d.petWallets.find(w=>w.studentId==='S002').balance,4000);assert.equal(d.petBrawlDuels.some(m=>m.players.some(p=>p.id==='S001')),false);
  pass('server restart refunds once and account deletion refunds the opponent before purging the match');
  await fs.mkdir('artifacts/pet-playtest/brawl-pvp',{recursive:true});await fs.writeFile('artifacts/pet-playtest/brawl-pvp/server-report.json',JSON.stringify({checks,passed:true},null,2));
}finally{for(const sock of sockets)sock.disconnect();duels?.close();if(io)await new Promise(r=>io.close(r));else if(server)server.close();await fs.rm(temp,{recursive:true,force:true});}
