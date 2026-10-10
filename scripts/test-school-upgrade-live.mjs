import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
const root=path.resolve(import.meta.dirname,'..'), temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-upgrade-'));
const file=path.join(temp,'db.json'),base='http://127.0.0.1:3188';
const hash=bcrypt.hashSync('fixture-password',4);
const users=['Q1','Q2',...Array.from({length:60},(_,i)=>'S'+String(i+1).padStart(3,'0'))].map(studentid=>({studentid,name:'Fixture',role:'student',classname:'P1',classno:1,chinesegroup:'A',englishgroup:'A',mathgroup:'A',language:'zh-HK',passwordhash:hash}));
await fs.writeFile(file,JSON.stringify({users,studentStats:[],questionLogs:[],_logId:0}));
const child=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3188',BUIO_JSON_DB_FILE:file,SUPABASE_DB_URL:'',NODE_ENV:'test',SESSION_SECRET:'fixture-session',ADMIN_PASSWORD:'fixture-admin-secret',GOOGLE_API_KEY:'',GOOGLE_CREDENTIALS_JSON:''},stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
const cookie=res=>res.headers.getSetCookie().map(row=>row.split(';')[0]).join('; ');
async function login(id){const res=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId:id,password:'fixture-password'})});assert.equal(res.status,200);return cookie(res);}
async function quiz(jar){const res=await fetch(base+'/api/quiz/questions?count=6',{headers:{Cookie:jar}});assert.equal(res.status,200);return {data:await res.json(),jar:cookie(res)||jar};}
const answers=data=>data.questions.map(q=>({index:q.index,userAnswer:0,timeTaken:1}));
const percentile=rows=>[...rows].sort((a,b)=>a-b)[Math.floor(rows.length*.95)];
let browser;
try{
  for(let n=0;n<60;n++){try{if((await fetch(base+'/health/live')).ok)break;}catch{}if(child.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,100));}
  const loads=[];
  for(const count of [30,60]){
    const times=[];
    await Promise.all(users.slice(2,2+count).map(async user=>{
      const start=performance.now(),q=await quiz(await login(user.studentid));
      const options={method:'POST',headers:{Cookie:q.jar,'Content-Type':'application/json','Idempotency-Key':q.data.quizId},body:JSON.stringify({answers:answers(q.data)})};
      const first=await fetch(base+'/api/quiz/submit',options);assert.equal(first.status,200);const result=await first.json();
      const retry=await fetch(base+'/api/quiz/submit',options);assert.equal(retry.status,200);assert.deepEqual(await retry.json(),result);
      times.push(performance.now()-start);
    }));
    loads.push({concurrentStudents:count,flowP95Ms:percentile(times),environment:'isolated local JSON fixture; login + questions + submit + replay; not Render/Supabase p95'});
    console.log('Classroom fixture passed:',count,'students');
  }
  let saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.questionLogs.length,540);assert.equal(saved.operationReceipts.length,90);
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const context=await browser.newContext({viewport:{width:1100,height:800}}),page=await context.newPage();
  await context.request.post(base+'/api/auth/login',{data:{studentId:'Q1',password:'fixture-password'}});
  await page.goto(base+'/');await page.waitForFunction(()=>window.BuiReliable);
  await page.evaluate(()=>window.BuiReliable.remember('Q1'));
  let q=await context.request.get(base+'/api/quiz/questions?count=6'), data=await q.json();
  let lost=true;
  await context.route('**/api/quiz/submit',async route=>{if(lost){lost=false;await route.fetch();await route.abort('failed');}else await route.continue();});
  await page.evaluate(async({data,body})=>{try{await window.BuiReliable.request('/api/quiz/submit',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':data.quizId},body:JSON.stringify(body)});}catch{}},{data,body:{answers:answers(data)}});
  await context.unroute('**/api/quiz/submit');await page.reload();await page.waitForFunction(()=>window.BuiReliable);await page.evaluate(()=>window.BuiReliable.resume());
  saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.questionLogs.filter(row=>row.studentid==='Q1').length,6,'lost response must not duplicate results');
  console.log('Lost response and reload replay passed');
  q=await context.request.get(base+'/api/quiz/questions?count=6');data=await q.json();
  await page.evaluate(()=>window.BuiReliable.remember('Q1'));await context.setOffline(true);
  await page.evaluate(async({data,body})=>{try{await window.BuiReliable.request('/api/quiz/submit',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':data.quizId},body:JSON.stringify(body)});}catch{}},{data,body:{answers:answers(data)}});
  await new Promise(resolve=>setTimeout(resolve,10000));await context.setOffline(false);await page.evaluate(()=>window.BuiReliable.resume());
  saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.questionLogs.filter(row=>row.studentid==='Q1').length,12);
  console.log('Ten-second offline retention passed');
  q=await context.request.get(base+'/api/quiz/questions?count=6');data=await q.json();
  await context.setOffline(true);await page.evaluate(async({data,body})=>{try{await window.BuiReliable.request('/api/quiz/submit',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':data.quizId},body:JSON.stringify(body)});}catch{}},{data,body:{answers:answers(data)}});
  await context.request.post(base+'/api/auth/login',{data:{studentId:'Q2',password:'fixture-password'}});
  await context.setOffline(false);await page.evaluate(()=>window.BuiReliable.resume());
  saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.questionLogs.filter(row=>row.studentid==='Q2').length,0);assert.equal(saved.questionLogs.filter(row=>row.studentid==='Q1').length,12);
  const refused=await context.request.post(base+'/api/quiz/submit',{headers:{'X-BuiO-Account':'Q1'},data:{answers:[]}});assert.equal(refused.status(),403);
  console.log('Account switch cannot replay another student’s work');
  const assignmentId='00000000-0000-4000-8000-000000000001', itemId='00000000-0000-4000-8000-000000000002', attemptId='00000000-0000-4000-8000-000000000003';
  const recordingUrl='/api/chinese/recordings?path='+encodeURIComponent(`Q2/${assignmentId}/${itemId}/practice.webm`);
  const blobBytes=Array.from({length:4096},(_,index)=>index%256);
  let uploads=0, linked=0;
  await context.route('**/api/chinese/upload',async route=>{
    uploads++;
    assert.equal(route.request().headers()['x-buio-account'],'Q2');
    assert.ok(route.request().postDataBuffer().includes(Buffer.from(blobBytes)),'recording bytes must survive IndexedDB and reload');
    await route.fulfill({status:uploads===1?503:200,contentType:'application/json',body:JSON.stringify({publicUrl:recordingUrl})});
  });
  await context.route('**/api/chinese/student/attempts/**/items/**',async route=>{
    linked++; assert.equal(route.request().postDataJSON().speechRecordingUrl,recordingUrl);
    await route.fulfill({status:200,contentType:'application/json',body:'{"success":true}'});
  });
  await page.evaluate(async({blobBytes,assignmentId,itemId,attemptId,recordingUrl})=>{
    const form=new FormData(); form.append('file',new Blob([new Uint8Array(blobBytes)],{type:'audio/webm'}),'fixture.webm');
    form.append('assignmentId',assignmentId); form.append('itemId',itemId); form.append('phase','practice');
    const response=await window.BuiReliable.request('/api/chinese/upload',{method:'POST',body:form,followUp:{url:`/api/chinese/student/attempts/${attemptId}/items/${itemId}`,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({speechRecordingUrl:recordingUrl})}});
    if(response.status!==503)throw Error('fixture must leave recording pending');
  },{blobBytes,assignmentId,itemId,attemptId,recordingUrl});
  assert.equal(linked,0); await page.reload(); await page.waitForFunction(()=>window.BuiReliable); await page.evaluate(()=>window.BuiReliable.resume());
  assert.equal(uploads,2); assert.equal(linked,1); console.log('Recording bytes and link update survive reload');
  await context.close();
  const labContext=await browser.newContext(),lab=await labContext.newPage();const requests=[];
  const network=await labContext.newCDPSession(lab);
  await network.send('Network.enable');
  await network.send('Network.emulateNetworkConditions',{offline:false,latency:300,downloadThroughput:125000,uploadThroughput:32000});
  lab.on('request',request=>requests.push(request.url()));
  await lab.goto(base+'/science-lab/preview',{waitUntil:'networkidle'});await lab.waitForSelector('#experimentGrid button');
  await lab.waitForFunction(()=>getComputedStyle(document.querySelector('#bootScreen')).visibility==='hidden');
  const catalogTransfer=await lab.evaluate(()=>performance.getEntriesByType('resource').reduce((sum,row)=>sum+row.transferSize,0));
  assert.ok(!requests.some(url=>/\.glb|\/assets\/(three|physics|LabRenderer)-/.test(url)),'catalog must not download 3D or physics');
  await fs.mkdir(path.join(root,'docs/school-upgrade'),{recursive:true});
  await fs.writeFile(path.join(root,'docs/school-upgrade/load-fixture.json'),JSON.stringify({loads,offlineSeconds:10,lostResponseReplay:true,accountIsolation:true,recordingReload:true,catalogDefers3d:true,catalogTransferBytes:catalogTransfer,network:{downloadMbps:1,uploadKbps:256,latencyMs:300}},null,2)+'\n');
  await lab.screenshot({path:path.join(root,'tmp/school-upgrade-catalog.png'),fullPage:true});await labContext.close();
  console.log('School upgrade browser, isolation and 30/60 classroom tests passed.');
}finally{
  await browser?.close();child.kill('SIGTERM');await Promise.race([once(child,'exit'),new Promise(r=>setTimeout(r,3000))]);
  await fs.rm(temp,{recursive:true,force:true});
}
