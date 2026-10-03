import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {INPUT as I,VERSION} from '../pet-app/lib/brawl/catalog.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-utility-pvp-'));process.env.BUIO_JSON_DB_FILE=path.join(temp,'db.json');process.env.SUPABASE_DB_URL='';
await fs.writeFile(process.env.BUIO_JSON_DB_FILE,JSON.stringify({users:['S001','S002'].map(studentid=>({studentid,name:studentid,classname:'5A',role:'student'})),studentStats:[],questionLogs:[],_logId:0}));
const require=createRequire(import.meta.url),pets=require('../pet-app/repositories/pet.repo'),store=require('../db/jsonStore'),{Server}=require('socket.io'),{io:client}=createRequire(path.resolve('whiteboard-app/client/package.json'))('socket.io-client');
const ids=['S001','S002'],petIds=ids.map(()=>randomUUID());for(const id of ids)await pets.ensureStudent(id);const d=store.load();
for(const [n,id] of ids.entries()){d.petInstances.push({petId:petIds[n],studentId:id,speciesId:n?'doraemon':'naruto-uzumaki',xp:0,stage:1,equippedSkills:[],equippedWearables:[]});d.petWallets.find(w=>w.studentId===id).balance=5000;}store.save();
let time=Date.now(),duels;const server=http.createServer(),io=new Server(server),sockets=[],events=[[],[]];
io.engine.use((req,_res,next)=>{req.session={studentId:req.headers['x-test-student'],role:'student'};next();});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const until=async fn=>{const end=Date.now()+4000;while(!fn()){if(Date.now()>end)throw Error('socket condition timeout');await delay(10);}};
const request=(sock,event,data)=>new Promise((resolve,reject)=>sock.timeout(3000).emit(event,data,(e,r)=>e?reject(e):resolve(r)));
try{
 duels=require('../pet-app/server/duel')(io,{now:()=>time,countdownMs:0});await duels.startup;await new Promise(r=>server.listen(0,'127.0.0.1',r));
 for(const [n,id] of ids.entries()){
  const socket=client('http://127.0.0.1:'+server.address().port+'/pet-brawl',{extraHeaders:{'x-test-student':id},transports:['websocket'],reconnection:false});sockets.push(socket);socket.frame=null;
  socket.on('duel:frame',frame=>{socket.frame=frame;events[n].push(...frame.events);});await new Promise((r,j)=>{socket.once('connect',r);socket.once('connect_error',j);});
  await request(socket,'duel:presence',{active:true,busy:false,refresh:true});
 }
 const invitation=(await request(sockets[0],'duel:invite',{targetId:ids[1],petId:petIds[0],stageId:'sunny-training',key:randomUUID()})).invitation;assert.ok(invitation);
 const accepted=await request(sockets[1],'duel:reply',{inviteId:invitation.id,accept:true,petId:petIds[1]});assert.equal(accepted.success,true);const room=duels.rooms.get(accepted.session.match.id),mid=room.meta.id;assert.equal(room.meta.version,VERSION);
 for(const socket of sockets)await request(socket,'duel:ready',{matchId:mid});await until(()=>room.phase==='playing');
 let seq=0;const input=async(a,b)=>{seq++;for(const [n,mask] of [a,b].entries())sockets[n].emit('duel:input',{matchId:mid,seq,mask});await until(()=>room.seq.every(v=>v===seq));};
 const advance=async ticks=>{const end=room.state.tick+ticks;while(room.state.tick<end){await input(...room.masks);const before=room.state.tick;time+=150;await until(()=>room.state.tick>before);await delay(25);}while(room.state.tick%3){await input(...room.masks);const before=room.state.tick;time+=17;await until(()=>room.state.tick>before);await delay(20);}await until(()=>sockets.every(s=>s.frame?.state.tick===room.state.tick));};
 await input(I.SKILL1,I.SKILL2);await advance(45);assert.equal(room.state.actors.filter(a=>a.cloneOwner).length,2);assert.ok(room.state.actors[1].flightUntil>room.state.tick);assert.equal(room.state.actors[1].hp,110);
 assert.ok(sockets.every(s=>s.frame.state.actors.filter(a=>a.cloneOwner).length===2),'both clients receive actual clone actors');
 await input(0,I.ATTACK);await advance(85);assert.equal(room.state.actors[1].flightShots,0);assert.equal(room.state.actors[1].hp,110);
 assert.ok(events.every(log=>log.filter(e=>e.type==='airRay').length===3),'both clients receive exactly three rays');
 await input(0,0);await advance(75);assert.equal(room.state.actors.filter(a=>a.cloneOwner).length,0);assert.ok(room.state.tick>=180&&room.state.tick<240);await advance(70);assert.equal(room.state.actors[1].flightUntil,0);
 assert.ok(events.every(log=>log.filter(e=>e.type==='cloneSmoke'&&!e.spawn).length===2),'two removal smoke events reach each client');
 assert.equal(room.state.status,'playing');assert.equal(room.state.kills,0);assert.deepEqual(sockets[0].frame.state,sockets[1].frame.state);assert.deepEqual(sockets[0].frame.state,JSON.parse(JSON.stringify(room.state)));
 assert.deepEqual(ids.map(id=>d.petWallets.find(w=>w.studentId===id).balance),[4500,4500]);assert.equal(d.petCurrencyLedger.filter(l=>l.kind==='brawl_duel_entry').length,2);
 await request(sockets[0],'duel:leave',{matchId:mid});assert.equal(room.meta.status,'finished');assert.equal(room.meta.winnerIndex,1);
 console.log('✓ Real v11 socket duel synchronizes two AI clones, exactly three aerial rays, flight immunity, expiry/smoke and identical authoritative states; each wallet pays 500 once');
}finally{for(const socket of sockets)socket.disconnect();duels?.close();await new Promise(r=>io.close(r));const resolved=path.resolve(temp);assert.ok(resolved.startsWith(path.join(os.tmpdir(),'buio-utility-pvp-')));await fs.rm(resolved,{recursive:true,force:true});}
