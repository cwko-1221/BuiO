import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
const require=createRequire(import.meta.url),express=require('express'),{Server}=require('socket.io'),{chromium}=require('playwright');
const app=express();app.use(express.json());
const identify=(req,res,next)=>{const id=/qa=([^;]+)/.exec(req.headers.cookie||'')?.[1];req.session=id?{studentId:id,studentName:id,role:id==='T1'?'teacher':'student'}:null;next();};
app.use(identify);app.get('/api/pet/teacher/roster',(req,res)=>res.json({students:[]}));
const server=createServer(app),io=new Server(server);io.engine.use(identify);
const whiteboard=require('../whiteboard-app/server/socket')(io,app,{checkpointStore:null,repairIntervalMs:300});
app.use('/shared',express.static(path.resolve('shared')));app.use('/whiteboard',express.static(path.resolve('whiteboard-app/client/dist')));
app.use('/whiteboard',(req,res)=>res.sendFile(path.resolve('whiteboard-app/client/dist/index.html')));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const out=path.resolve('tmp/whiteboard-upgrade/views-live');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'}),results=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+12000;while(!await fn()){if(Date.now()>end)throw Error(label);await wait(50);}}
const inkPixels=canvas=>{const d=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]<150&&d[i+3])n++;return n;};
try{
 for(const [teacherPath,studentPath]of[['teacher','student'],['class-teacher','class-student']]){
  const tc=await browser.newContext({viewport:{width:1280,height:900}}),sc=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true});
  await tc.addCookies([{name:'qa',value:'T1',url:base}]);await sc.addCookies([{name:'qa',value:'S1',url:base}]);
  const t=await tc.newPage(),s=await sc.newPage(),errors=[];for(const p of[t,s])p.on('pageerror',e=>errors.push(e.message));
  await t.addInitScript(()=>{const f=CanvasRenderingContext2D.prototype.clearRect;window.__paints=0;CanvasRenderingContext2D.prototype.clearRect=function(...a){if(this.canvas.isConnected)window.__paints++;return f.apply(this,a);};});
  const room='views-'+teacherPath;await t.goto(base+'/whiteboard/'+teacherPath+'?room='+room);await wait(100);
  await s.goto(base+'/whiteboard/'+studentPath+'?room='+room+'&name=S1');const board=s.locator('canvas[class*="_canvas_"]');await board.waitFor();
  const r=await board.boundingBox();await s.mouse.move(r.x+r.width*.1,r.y+r.height*.3);await s.mouse.down();await s.mouse.move(r.x+r.width*.8,r.y+r.height*.3,{steps:20});await s.mouse.up();
  await until(()=>whiteboard.rooms.get(room)?.studentBoards.get('student:S1')?.protocol===2,'shared checkpoint pipeline');
  const tile=t.locator('[class*="studentTile"]').filter({hasText:'S1'}).locator('canvas');await tile.waitFor();await until(async()=>await tile.evaluate(inkPixels)>20,'visible ink');
  await s.getByRole('button',{name:'Shapes',exact:true}).click();
  await s.getByRole('button',{name:'Square',exact:true}).click();
  const sr=await board.boundingBox();
  await s.mouse.move(sr.x+sr.width*.2,sr.y+sr.height*.45);await s.mouse.down();await s.mouse.move(sr.x+sr.width*.4,sr.y+sr.height*.65,{steps:10});await s.mouse.up();
  await until(()=>whiteboard.rooms.get(room).studentBoards.get('student:S1').shapes.length===1,'shape saved');
  const beforeShape=whiteboard.rooms.get(room).studentBoards.get('student:S1').shapes[0].startX;
  await s.mouse.move(sr.x+sr.width*.25,sr.y+sr.height*.5);await s.mouse.down();await s.mouse.move(sr.x+sr.width*.45,sr.y+sr.height*.55,{steps:10});await s.mouse.up();
  await until(()=>whiteboard.rooms.get(room).studentBoards.get('student:S1').shapes[0].startX>beforeShape+.1,'shape move saved');
  await t.reload();await tile.waitFor();await until(async()=>await tile.evaluate(inkPixels)>20,'checkpoint restored after teacher reload');
  await wait(500);const before=await t.evaluate(()=>window.__paints);await wait(500);assert.equal(await t.evaluate(()=>window.__paints),before,'idle drawing stopped');
  await tile.click();const zoom=t.locator('canvas[class*="zoomCanvas"]');await zoom.waitFor();const z=await zoom.boundingBox();
  await t.mouse.move(z.x+z.width*.2,z.y+z.height*.7);await t.mouse.down();await t.mouse.move(z.x+z.width*.8,z.y+z.height*.7,{steps:15});await t.mouse.up();
  await until(()=>whiteboard.rooms.get(room).studentBoards.get('student:S1').strokes.some(stroke=>stroke.color==='#ef4444'),'teacher annotation saved');
  await t.screenshot({path:path.join(out,teacherPath+'-zoom.png')});
  await t.locator('[class*="closeZoomBtn"]').click();await t.getByRole('button',{name:/Clear All/}).click();
  await until(async()=>await board.evaluate(inkPixels)===0,'student cleared');assert.deepEqual(errors,[]);
  results.push({teacherPath,studentPath,sharedDeltaCheckpoints:true,reloadRestoresInk:true,idlePaints:0,teacherAnnotation:true,shapeCreatedAndMoved:true,clear:true,errors});
  await tc.close();await sc.close();
 }
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({pass:true,results},null,2));console.log('Both whiteboard entry points passed drawing, reload, idle, annotation and clear.');
}finally{await browser.close();await new Promise(r=>io.close(r));}
