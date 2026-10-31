import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
const out=path.resolve('tmp/whiteboard-upgrade/restart-live');await fs.mkdir(out,{recursive:true});
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'wb-browser-restart-'));
const db=path.join(temp,'db.json'),checkpoint=path.join(temp,'whiteboard-checkpoints.json');
const paper=path.join(temp,'paper.png');await fs.writeFile(paper,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jm1cAAAAASUVORK5CYII=','base64'));
const hash=bcrypt.hashSync('restart-test-only',10);
await fs.writeFile(db,JSON.stringify({users:[{studentid:'T001',name:'Teacher',role:'teacher',passwordhash:hash},{studentid:'W001',name:'Writer',role:'student',classname:'5A',passwordhash:hash}],studentStats:[],questionLogs:[],_logId:0}));
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const base='http://127.0.0.1:'+port,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));let child,browser;const errors=[];
async function until(fn,label){const end=Date.now()+60000;while(!await fn()){if(Date.now()>end)throw Error('Timeout '+label);await sleep(100);}}
function launch(){child=spawn(process.execPath,['server.js'],{windowsHide:true,env:{...process.env,GOOGLE_API_KEY:'',GOOGLE_CREDENTIALS_JSON:'',GOOGLE_APPLICATION_CREDENTIALS:'',BUIO_JSON_DB_FILE:db,SUPABASE_DB_URL:'',NODE_ENV:'development',PORT:String(port),MOCK_AUTH:'0'},stdio:['ignore','pipe','pipe']});for(const stream of[child.stdout,child.stderr])stream.on('data',x=>fs.appendFile(path.join(out,'server.log'),x).catch(()=>{}));}
async function stop(){if(child&&child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}}
async function ready(){await until(async()=>{try{return(await fetch(base+'/health/live',{signal:AbortSignal.timeout(1000)})).ok;}catch{return false;}},'health');}
async function records(){try{return JSON.parse(await fs.readFile(checkpoint,'utf8'));}catch{return[];}}
async function ink(page,y){const canvas=page.locator('canvas[class*="_canvas_"]'),r=await canvas.boundingBox();await page.mouse.move(r.x+r.width*.1,r.y+r.height*y);await page.mouse.down();await page.mouse.move(r.x+r.width*.8,r.y+r.height*y,{steps:20});await page.mouse.up();}
try{
 launch();await ready();browser=await chromium.launch({headless:true,channel:'chrome'});
 const tc=await browser.newContext({viewport:{width:1280,height:900}}),sc=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true});
 for(const[context,id]of[[tc,'T001'],[sc,'W001']])assert.equal((await context.request.post(base+'/api/auth/login',{data:{studentId:id,password:'restart-test-only'}})).status(),200);
 const teacher=await tc.newPage(),student=await sc.newPage();for(const p of[teacher,student])p.on('pageerror',e=>errors.push(e.message));
 await teacher.goto(base+'/whiteboard/class-teacher?room=restart-class');await sleep(200);
 await student.goto(base+'/whiteboard/class-student?room=restart-class&name=Writer');await student.locator('canvas[class*="_canvas_"]').waitFor();
 await teacher.locator('input[type=file]').setInputFiles(paper);
 await until(async()=> (await records()).some(row=>row.part==='room'&&row.payload.image?.startsWith('data:image/jpeg;')),'worksheet saved');
 const worksheet=(await records()).find(row=>row.part==='room').payload.image;
 await ink(student,.25);
 await until(async()=> (await records()).some(row=>row.part==='student:W001'&&row.payload.board?.strokes?.length===1),'first durable board');
 const session=(await(await tc.request.get(base+'/api/whiteboard/sessions')).json()).sessions[0];
 // Acknowledge a second stroke, then crash before the next ten-second disk batch.
 await ink(student,.7);await sleep(1800);
 assert.equal((await records()).find(row=>row.part==='student:W001').payload.board.strokes.length,1);
 await stop();launch();await ready();
 await until(async()=> (await(await tc.request.get(base+'/api/whiteboard/sessions')).json()).sessions.some(row=>row.roomCode==='restart-class'&&row.teacherConnected),'same class reconnects');
 assert.equal((await(await tc.request.get(base+'/api/whiteboard/sessions')).json()).sessions[0].startTime,session.startTime);
 assert.equal((await records()).find(row=>row.part==='room').payload.image,worksheet,'worksheet retained after cold restart');
 await until(async()=> (await records()).some(row=>row.part==='student:W001'&&row.payload.board?.strokes?.length===2),'newer local ink survives older disk checkpoint');
 const tile=teacher.locator('[class*="studentTile"]').filter({hasText:'Writer'}).locator('canvas');await tile.waitFor();
 await teacher.screenshot({path:path.join(out,'teacher-after-crash.png')});await student.screenshot({path:path.join(out,'student-after-crash.png')});
 await teacher.getByRole('button',{name:'Clear All',exact:true}).click();
 await until(async()=> (await records()).find(row=>row.part==='student:W001')?.payload.board===null,'clear saved');
 await stop();launch();await ready();
 await until(async()=> (await(await tc.request.get(base+'/api/whiteboard/sessions')).json()).sessions[0]?.teacherConnected,'clear survives another restart');
 await sleep(1000);
 const count=await student.locator('canvas[class*="_canvas_"]').evaluate(canvas=>{const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n;});assert.equal(count,0,'cleared strokes do not reappear');
 assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({pass:true,realLogin:true,actualServerCrashes:2,sameClassRestored:true,worksheetRestored:true,newerLocalInkPreserved:true,clearSurvivesRestart:true,errors,physicalIpad:false},null,2));
 console.log('Browser crash recovery, newer local ink, and persistent Clear passed.');
}finally{await browser?.close();await stop();assert.equal(path.dirname(temp),path.resolve(os.tmpdir()));await fs.rm(temp,{recursive:true,force:true});}
