import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
const require=createRequire(import.meta.url),express=require('express'),{Server}=require('socket.io'),{chromium,webkit}=require('playwright');
const out=path.resolve(process.argv.find(x=>x.startsWith('--output='))?.slice(9)||'tmp/whiteboard-fast-sync');await fs.mkdir(out,{recursive:true});
const app=express();app.use(express.json());const identity=(req,res,next)=>{const id=/qa=([^;]+)/.exec(req.headers.cookie||'')?.[1];req.session=id?{studentId:id,studentName:id,role:id==='T1'?'teacher':'student'}:null;next();};app.use(identity);
app.get('/api/pet/teacher/roster',(req,res)=>res.json({students:[]}));const http=createServer(app),io=new Server(http);io.engine.use(identity);
const api=require('../whiteboard-app/server/socket')(io,app,{checkpointStore:null,repairIntervalMs:250});
app.use('/shared',express.static(path.resolve('shared')));app.use('/whiteboard',express.static(path.resolve('whiteboard-app/client/dist')));app.use('/whiteboard',(req,res)=>res.sendFile(path.resolve('whiteboard-app/client/dist/index.html')));
await new Promise(r=>http.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+http.address().port,sleep=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
async function until(fn,label){const end=Date.now()+10000;while(!await fn()){if(Date.now()>end)throw Error(label);await sleep(20);}}
async function gesture(page,{x=.1,y=.4,to=.8,steps=8,tool='Pen'}={}){
 await page.locator(tool==='Eraser'?'button[title="Eraser"]':'button[title="Pen"]').click();
 await page.evaluate(({x,y,to,steps})=>{const c=document.querySelector('canvas[class*="_canvas_"]'),r=c.getBoundingClientRect();const send=(type,p,buttons)=>c.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerType:'pen',pointerId:11,buttons,clientX:r.left+p*r.width,clientY:r.top+y*r.height}));send('pointerdown',x,1);for(let i=1;i<=steps;i++)send('pointermove',x+(to-x)*i/(steps+1),1);send('pointerup',to,0);},{x,y,to,steps});
}
async function mask(page,teacher=false){return page.evaluate(teacher=>{const src=teacher?window.__qaCanvases.find(c=>!c.isConnected&&c.width===800&&c.height===600):document.querySelector('canvas[class*="_canvas_"]');if(!src)throw Error('No drawing layer');const c=document.createElement('canvas');c.width=800;c.height=600;c.getContext('2d').drawImage(src,0,0,800,600);const p=c.getContext('2d').getImageData(0,0,800,600).data,out=[];for(let i=0;i<p.length;i+=4)if(p[i+3]>64&&p[i]<130&&p[i+1]<130&&p[i+2]<130)out.push(i/4);return out;},teacher);}
function compare(a,b){const sa=new Set(a),sb=new Set(b);const near=(set,i)=>{for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)if(set.has(i+y*800+x))return true;return false;};const missing=a.filter(i=>!near(sb,i)).length,extra=b.filter(i=>!near(sa,i)).length;return {studentPixels:a.length,teacherPixels:b.length,missing,extra,agreement:1-(missing+extra)/Math.max(1,a.length+b.length)};}
try{for(const[name,engine]of[['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true,...(name==='chromium'?{channel:'chrome'}:{})});try{
 const tc=await browser.newContext({viewport:{width:1280,height:900}}),sc=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true});await tc.addCookies([{name:'qa',value:'T1',url:base}]);await sc.addCookies([{name:'qa',value:'S1',url:base}]);
 await tc.addInitScript(()=>{window.__qaCanvases=[];const make=document.createElement.bind(document);document.createElement=(tag,...args)=>{const el=make(tag,...args);if(tag.toLowerCase()==='canvas')window.__qaCanvases.push(el);return el;};});
 const t=await tc.newPage(),s=await sc.newPage(),errors=[];for(const p of[t,s])p.on('pageerror',e=>errors.push(e.message));const room='fast-'+name;
 await t.goto(base+'/whiteboard/class-teacher?room='+room);await sleep(100);await s.goto(base+'/whiteboard/class-student?room='+room+'&name=S1');await s.locator('canvas[class*="_canvas_"]').waitFor();await until(()=>api.rooms.get(room)?.students.has('student:S1'),'membership');
 const cases=[];const check=async label=>{await sleep(120);const value=compare(await mask(s),await mask(t,true));cases.push({label,...value});};
 await gesture(s,{steps:0});await check('fast down/up without a delivered move');
 await t.getByRole('button',{name:'Clear All',exact:true}).click();await sleep(100);
 await gesture(s,{});await gesture(s,{tool:'Eraser',x:.3,to:.6,steps:0});await check('fast erase across existing ink');
 await t.getByRole('button',{name:'Clear All',exact:true}).click();await sleep(100);await gesture(s,{y:.2});await until(()=>api.rooms.get(room).studentBoards.get('student:S1')?.strokes?.length,'checkpoint');
 const snapshot=structuredClone(api.rooms.get(room).studentBoards.get('student:S1'));
 await gesture(s,{y:.7});await gesture(s,{tool:'Eraser',y:.2,x:.3,to:.6,steps:3});await sleep(100);
 const teacherSocket=[...io.sockets.sockets.values()].find(socket=>socket.request.session.studentId==='T1');teacherSocket.emit('student-board-snapshot',{...snapshot,studentId:'student:S1'});
 await check('older accepted checkpoint arrives after newer live ink and erase');await sleep(1900);await check('settled authoritative checkpoint');
 await t.locator('[class*="studentTile"]').filter({hasText:'S1'}).click();
 await t.getByRole('button',{name:'Eraser',exact:true}).click();
 const zoom=t.locator('canvas[class*="zoomCanvas"]'),zr=await zoom.boundingBox();
 await t.mouse.move(zr.x+zr.width*.15,zr.y+zr.height*.7);await t.mouse.down();
 await t.mouse.move(zr.x+zr.width*.5,zr.y+zr.height*.7,{steps:6});await sleep(80);
 await gesture(s,{x:.2,to:.7,y:.7,steps:4});
 await t.mouse.move(zr.x+zr.width*.85,zr.y+zr.height*.7,{steps:8});await t.mouse.up();
 await sleep(700);await check('student writes between two parts of a teacher erase');
 await s.setViewportSize({width:1100,height:800});await sleep(100);
 await check('interleaved edits survive resizing and vector replay');
 await t.screenshot({path:path.join(out,name+'-teacher.png')});await s.screenshot({path:path.join(out,name+'-student.png')});assert.deepEqual(errors,[]);results.push({browser:name,cases,errors});
 }finally{await browser.close();}}
 const mismatch=results.some(r=>r.cases.some(c=>c.agreement<.985||c.studentPixels===0));await fs.writeFile(path.join(out,'report.json'),JSON.stringify({pass:!mismatch,scope:'real UI handlers, actual Socket.IO, normalized ink masks with one-pixel tolerance; no physical iPad',results},null,2));console.log(JSON.stringify(results,null,2));if(process.argv.includes('--expect-mismatch'))assert.ok(mismatch,'baseline must reproduce inconsistency');else assert.equal(mismatch,false,'student and teacher drawing layers diverged');
}finally{await new Promise(r=>io.close(r));}
