import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { createBoardDelta } from '../whiteboard-app/client/src/utils/boardDelta.mjs';

const checkpointIntervalMs=Number(process.argv.find(x=>x.startsWith('--checkpoint-ms='))?.slice(16)||1500);
assert.ok(checkpointIntervalMs>=250&&checkpointIntervalMs<=1500);
const duration = Number(process.argv.find(x=>x.startsWith('--seconds='))?.slice(10)||1800);
assert.ok(duration>=30&&duration<=7200);
const out=path.resolve(process.argv.find(x=>x.startsWith('--output='))?.slice(9)||'tmp/classroom-mixed-load');
await fs.mkdir(out,{recursive:true});
const fingerprintFiles=['whiteboard-app/server/socket.js','whiteboard-app/server/checkpoints.js','whiteboard-app/server/board-vectors.js','whiteboard-app/client/src/utils/boardDelta.mjs','pet-app/server/duel.js','shared/passwords.cjs','homework-app/lib/weekly-reports.js','homework-app/lib/report-work.js'];
const fingerprint=async()=>Object.fromEntries(await Promise.all(fingerprintFiles.map(async file=>[file,createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
const sourcesAtStart=await fingerprint();
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-mixed-class-'));
process.env.BUIO_JSON_DB_FILE=path.join(temp,'db.json');process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),{io:connect}=require('../whiteboard-app/client/node_modules/socket.io-client');
const ids=Array.from({length:28},(_,i)=>'L'+String(i+1).padStart(3,'0')),password='isolated-load-only';
const hash=bcrypt.hashSync(password,10);
await fs.writeFile(process.env.BUIO_JSON_DB_FILE,JSON.stringify({users:[...ids,'T001'].map(studentid=>({studentid,name:studentid,role:studentid==='T001'?'teacher':'student',classname:'5A',passwordhash:hash})),studentStats:[],questionLogs:[],_logId:0}));
const pets=require('../pet-app/repositories/pet.repo'),store=require('../db/jsonStore'),petIds=ids.slice(0,8).map(()=>randomUUID());
for(const id of ids.slice(0,8))await pets.ensureStudent(id);
const data=store.load();ids.slice(0,8).forEach((id,i)=>{data.petWallets.find(w=>w.studentId===id).balance=100000;data.petInstances.push({petId:petIds[i],studentId:id,speciesId:'starpatch-cat',xp:0,stage:1,equippedSkills:[],equippedWearables:[]});});store.save();
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const base='http://127.0.0.1:'+port,stats={draws:0,peerDraws:0,checkpoints:0,checkpointBytes:0,loginBursts:0,logins:0,reports:0,duelFrames:0,matches:0,restoredStudents:0,restarts:0,errors:[]};
const health=[],latency=[],reportTimes=[],metrics=[],sockets=[],writers=[],duelists=[],cookies=new Map();let child,stopping=false,restarting=false;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(fn,label,ms=60000){const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error('Timeout: '+label);await sleep(100);}}
function launch(){child=spawn(process.execPath,['scripts/lib/classroom-load-server.cjs'],{windowsHide:true,env:{...process.env,GOOGLE_API_KEY:'',GOOGLE_CREDENTIALS_JSON:'',GOOGLE_APPLICATION_CREDENTIALS:'',PORT:String(port),NODE_ENV:'development',MOCK_AUTH:'0'},stdio:['ignore','pipe','pipe','ipc']});child.stdout.on('data',x=>fs.appendFile(path.join(out,'server.log'),x).catch(()=>{}));child.stderr.on('data',x=>fs.appendFile(path.join(out,'server-error.log'),x).catch(()=>{}));child.on('message',m=>{if(m.type==='metrics')metrics.push({...m,at:Date.now()});});}
async function ready(){await wait(async()=>{try{return(await fetch(base+'/health/live',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},'server health');}
async function login(id){const start=performance.now(),res=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({studentId:id,password}),signal:AbortSignal.timeout(30000)});assert.equal(res.status,200,await res.text());stats.logins++;cookies.set(id,res.headers.getSetCookie().map(x=>x.split(';')[0]).join('; '));return performance.now()-start;}
function socket(id,namespace=''){const s=connect(base+namespace,{forceNew:true,transports:['websocket'],extraHeaders:{Cookie:cookies.get(id)},reconnection:true,reconnectionDelay:300,reconnectionDelayMax:1500});sockets.push(s);return s;}
function emit(s,event,body){return new Promise((resolve,reject)=>s.timeout(10000).emit(event,body,(error,result)=>error?reject(error):resolve(result)));}
async function classroom(){
 const teacher=socket('T001');teacher.on('connect',()=>teacher.emit('join-room',{roomId:'load-class',isTeacher:true}));
 teacher.on('draw',point=>{stats.draws++;if(stats.draws%100===0)latency.push(Date.now()-point.sentAt);});teacher.on('error',m=>{if(!stopping)stats.errors.push('teacher: '+m);});
 await wait(()=>teacher.connected,'teacher');await sleep(200);
 for(const id of ids){const s=socket(id),w={id,s,codec:createBoardDelta(),strokes:[],shapes:[],ready:false,flight:false,step:0,seq:0};writers.push(w);
  s.on('connect',()=>{w.codec.reset();s.emit('join-room',{roomId:'load-class',isTeacher:false});});
  s.on('teacher-connection',state=>{w.codec.generation(state.boardGeneration);w.ready=true;});
  s.on('disconnect',()=>{w.ready=false;w.flight=false;});s.on('draw',()=>stats.peerDraws++);
  s.on('clear-board',state=>{w.strokes=[];w.shapes=[];w.codec.reset();w.codec.generation(state?.boardGeneration);});
  s.on('student-board-snapshot',snapshot=>{if(snapshot.strokes?.length)stats.restoredStudents++;});
  s.on('error',m=>{if(!stopping)stats.errors.push(id+': '+m);});
 }
 await wait(()=>writers.every(w=>w.ready),'28 student memberships');
 return teacher;
}
async function games(){
 for(const [i,id]of ids.slice(0,8).entries()){const s=socket(id,'/pet-brawl'),d={id,s,i,match:null,seq:0};duelists.push(d);s.on('duel:frame',()=>stats.duelFrames++);s.on('duel:result',()=>{d.match=null;});s.on('disconnect',()=>{d.match=null;});}
 await wait(()=>duelists.every(d=>d.s.connected),'game sockets');
}
async function startMatches(){
 for(const d of duelists)if(d.s.connected)await emit(d.s,'duel:presence',{active:true,busy:false});
 for(let i=0;i<8;i+=2){const a=duelists[i],b=duelists[i+1];if(a.match||b.match||!a.s.connected||!b.s.connected)continue;
  const invite=await emit(a.s,'duel:invite',{targetId:b.id,petId:petIds[i],stageId:'sunny-training',key:randomUUID()});
  if(!invite.success)continue;
  const accept=await emit(b.s,'duel:reply',{inviteId:invite.invitation.id,accept:true,petId:petIds[i+1]});if(!accept.success)continue;
  const matchId=accept.session.match.id;
  const replies=await Promise.all([a,b].map(d=>emit(d.s,'duel:ready',{matchId})));
  assert.ok(replies.every(r=>r.success));for(const d of[a,b]){d.match=matchId;d.seq=0;}stats.matches++;
 }
}
const timers=[];
try{
 launch();await ready();await Promise.all([...ids,'T001'].map(login));
 const teacher=await classroom();await games();await startMatches();
 const began=Date.now(),startTime=(await(await fetch(base+'/api/whiteboard/sessions',{headers:{Cookie:cookies.get('T001')}})).json()).sessions[0].startTime;
 timers.push(setInterval(()=>{if(restarting)return;for(const w of writers){if(!w.ready||!w.s.connected)continue;const p=w.step++%60,x=.1+p*.011,y=.1+(Math.floor(w.step/60)%25)*.025;const point={x,y};if(p===0)w.strokes.push({color:'#111827',size:1.5,isEraser:Math.floor(w.step/60)%11===0,points:[]});w.strokes.at(-1)?.points.push(point);w.s.emit('draw',{...point,state:p===0?'start':p===59?'end':'move',color:'#111827',size:1.5,isEraser:w.strokes.at(-1)?.isEraser,sentAt:Date.now()});}for(const d of duelists)if(d.match&&d.s.connected)d.s.emit('duel:input',{matchId:d.match,seq:++d.seq,mask:Math.floor(d.seq/90)%2?1:2});},1000/30));
 timers.push(setInterval(()=>{if(restarting)return;for(const w of writers){if(!w.ready||w.flight)continue;w.flight=true;const packet=w.codec.build({strokes:w.strokes,shapes:w.shapes,baseImageData:null});stats.checkpoints++;stats.checkpointBytes+=JSON.stringify(packet).length;void emit(w.s,'student-board-snapshot',packet).then(result=>{w.codec.result(packet,result);if(!result.success&&!result.needsReset)stats.errors.push('checkpoint rejected '+w.id);}).catch(error=>{if(!restarting)stats.errors.push(error.message);}).finally(()=>{w.flight=false;});}},checkpointIntervalMs));
 let lastGames=Date.now(),lastLogin=0,disconnected=false,teacherRejoined=false,serverRestarted=false;
 while(Date.now()-began<duration*1000){
  const elapsed=(Date.now()-began)/1000;
  const start=performance.now();const res=await fetch(base+'/health/live',{signal:AbortSignal.timeout(10000)});assert.equal(res.status,200);health.push(performance.now()-start);
  if(Date.now()-lastGames>8000){lastGames=Date.now();await startMatches();}
  if(elapsed-lastLogin>=60||(!lastLogin&&elapsed>5)){lastLogin=elapsed;await Promise.all(ids.slice(0,8).map(login));stats.loginBursts++;const reportAt=performance.now();await Promise.all(['P1','P2','P3','P4','P5','P6'].map(async className=>{const query=new URLSearchParams({academicYear:'2026-27',className,mode:'week',week:'6',dateFrom:'2026-09-04',dateTo:'2026-10-09'});const response=await fetch(base+'/api/homework/class-analysis?'+query,{headers:{Cookie:cookies.get('T001')},signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,await response.text());stats.reports++;}));reportTimes.push(performance.now()-reportAt);}
  if(!disconnected&&elapsed>duration*.2){disconnected=true;for(const w of writers.slice(0,14))w.s.io.engine.close();await wait(()=>writers.every(w=>w.ready),'14 students reconnect');}
  if(!teacherRejoined&&elapsed>duration*.4){teacherRejoined=true;teacher.io.engine.close();await wait(()=>teacher.connected,'teacher reconnect');await sleep(300);}
  if(!serverRestarted&&elapsed>duration*.65){serverRestarted=true;restarting=true;child.kill();await new Promise(resolve=>child.once('exit',resolve));launch();await ready();await wait(()=>writers.every(w=>w.ready)&&teacher.connected,'server restart recovery');const current=(await(await fetch(base+'/api/whiteboard/sessions',{headers:{Cookie:cookies.get('T001')}})).json()).sessions.find(s=>s.roomCode==='load-class');assert.equal(current?.startTime,startTime,'cold server restores the same classroom');stats.restarts++;restarting=false;await startMatches();}
  if(Math.floor(elapsed)%30===0){await fs.writeFile(path.join(out,'progress.json'),JSON.stringify({elapsedSeconds:Math.round(elapsed),...stats,lastMetric:metrics.at(-1)},null,2));}
  await sleep(500);
 }
 timers.forEach(clearInterval);await sleep(1000);
 assert.equal(stats.peerDraws,0);assert.ok(stats.draws>duration*28*15,'sustained real pen traffic');assert.ok(stats.duelFrames>duration*30,'concurrent authoritative game frames');assert.equal(stats.restarts,1);assert.equal(stats.errors.length,0,stats.errors.slice(0,10).join('; '));
 assert.deepEqual(await fingerprint(),sourcesAtStart,'load-tested source files must remain unchanged throughout the run');
 const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.min(a.length-1,Math.floor(a.length*p))]||0;
 const report={pass:true,startedAt:new Date(began).toISOString(),durationSeconds:(Date.now()-began)/1000,students:28,checkpointIntervalMs,simultaneousGamePlayers:8,...stats,reportBatchP95Ms:percentile(reportTimes,.95),healthP95Ms:percentile(health,.95),healthMaxMs:Math.max(...health),penP95Ms:percentile(latency,.95),penMaxMs:Math.max(...latency),cpuP95Percent:percentile(metrics.map(m=>m.cpuPercent),.95),rssMaxMiB:Math.max(...metrics.map(m=>m.rss))/1048576,eventLoopP95Ms:percentile(metrics.map(m=>m.eventLoopP95),.95),eventLoopMaxMs:Math.max(...metrics.map(m=>m.eventLoopMax)),sourceFingerprints:sourcesAtStart,sourceSha256:createHash('sha256').update(await fs.readFile('whiteboard-app/server/socket.js')).digest('hex'),environment:'Windows, isolated JSON database, real Node server and Socket.IO; no physical iPads, school Wi-Fi, Render CPU quota ; weekly report preview included, export/upload not part of the sustained workload'};
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await fs.writeFile(path.join(out,'metrics.json'),JSON.stringify(metrics));console.log(JSON.stringify(report,null,2));
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({message:error.message,stack:error.stack,...stats},null,2));throw error;}
finally{stopping=true;timers.forEach(clearInterval);sockets.forEach(s=>s.disconnect());if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}assert.equal(path.dirname(temp),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
