import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {chromium,webkit} from 'playwright';
import bcrypt from 'bcryptjs';
import {OBJECTS,interactionPoint} from '../pet-app/lib/park-world.mjs';
const build=path.resolve(process.env.PET_APP_TEST_DIST||'artifacts/sky-patrol-ipad-build-1'),output=path.resolve(process.argv.find(a=>a.startsWith('--output='))?.slice(9)||'artifacts/pet-playtest/sky-ipad-input-1');await fs.mkdir(output,{recursive:true});
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'buio-sky-v2-'));process.env.BUIO_JSON_DB_FILE=path.join(temporary,'db.json');process.env.SUPABASE_DB_URL='';
const users=[...['A001','A002','A003'].map((studentid,i)=>({studentid,name:['小晴','阿樂','小悠'][i],classname:'5A',role:'student'})),{studentid:'T001',name:'老師',role:'teacher'}].map(u=>({...u,language:'zh-HK',passwordhash:bcrypt.hashSync('test',4)}));
await fs.writeFile(process.env.BUIO_JSON_DB_FILE,JSON.stringify({users,studentStats:[],questionLogs:[],_logId:0}));
const require=createRequire(import.meta.url),pets=require('../pet-app/repositories/pet.repo'),repo=require('../pet-app/repositories/park.repo'),store=require('../db/jsonStore');
for(const [i,u]of users.filter(u=>u.role==='student').entries()){await pets.ensureStudent(u.studentid);const db=store.load(),petId=randomUUID();db.petInstances.push({petId,studentId:u.studentid,speciesId:['starpatch-cat','crescent-rabbit','pudding-pig'][i],xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});Object.assign(db.petProfiles.find(p=>p.studentId===u.studentid),{activePetId:petId,starterEggClaimed:true});db.petWallets.find(w=>w.studentId===u.studentid).balance=100;store.save();await repo.savePosition(u.studentid,interactionPoint(OBJECTS.find(o=>o.id==='sky-game')));}
const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),windowsHide:true,env:{...process.env,PORT:String(port),MOCK_AUTH:'0',NODE_ENV:'development',PET_APP_DIST_DIR:build},stdio:['ignore','pipe','pipe']});let logs='',browser;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const pages=[],contexts=[],errors=[],checks=[],results=[],viewports=[];const pass=s=>{checks.push(s);console.log('✓ '+s);};const shot=(p,name)=>p.screenshot({path:path.join(output,name+'.png')});
const screen=(page,x,y)=>page.evaluate(({x,y})=>{const c=window.__petPark.miniGame.scene.cameras.main,r=document.querySelector('.park-canvas canvas').getBoundingClientRect();return{x:r.x+(c.x+(x-c.worldView.x)*c.zoom)*r.width/window.__petPark.game.scale.width,y:r.y+(c.y+(y-c.worldView.y)*c.zoom)*r.height/window.__petPark.game.scale.height};},{x,y});
const sample=page=>page.evaluate(()=>{const m=window.__petPark.miniGame,s=m.scene;return{visual:{x:s.plane.x,y:s.plane.y},server:{...m.state.player},drag:s.drag,seq:m.state.inputSeq,shields:m.state.shields,press:m.state.shieldPress,scroll:[scrollX,scrollY],scale:visualViewport.scale};});
// WebKit rounds dispatched mouse coordinates to CSS pixels (under two world units).
const at=async(page,expected)=>{await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const state=await sample(page);assert.ok(Math.hypot(state.visual.x-expected.x,state.visual.y-expected.y)<2,JSON.stringify({expected,actual:state}));return state;};
try{
 const baseURL='http://127.0.0.1:'+port,until=Date.now()+25000;while(true){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}if(Date.now()>until)throw Error('server startup');await new Promise(r=>setTimeout(r,100));}
 for(const engine of (process.env.PET_INPUT_ENGINE?[process.env.PET_INPUT_ENGINE]:['chromium','webkit'])){
  browser=await (engine==='chromium'?chromium.launch({channel:'chrome',headless:true}):webkit.launch({headless:true}));
  const context=await browser.newContext({baseURL,viewport:{width:1024,height:768},deviceScaleFactor:2,hasTouch:true});contexts.push(context);
  assert.equal((await context.request.post('/api/auth/login',{data:{studentId:'A001',password:'test'}})).status(),200);
  const page=await context.newPage();pages.push(page);await page.addInitScript(()=>{const Native=window.AudioContext;window.__qaAudioContexts=[];if(!Native)return;window.AudioContext=class extends Native{constructor(...args){super(...args);window.__qaAudioContexts.push(this);}};});page.on('pageerror',e=>errors.push(engine+': '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push(engine+': '+m.text());});
  if(engine==='webkit'&&process.env.PET_WEBKIT_CANVAS==='1')await page.addInitScript(()=>{const native=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type.startsWith('webgl')||type==='experimental-webgl')return null;return native.call(this,type,...args);};});
  await page.goto('/pet');await page.waitForFunction(()=>window.__petGame?.scene?.getScene('Bedroom')?.sys.isActive(),{}, {timeout:40000});if(engine==='webkit')await page.locator('[data-tab="park"]').tap();else await page.locator('[data-tab="park"]').click();await page.waitForFunction(()=>window.__petPark?.client.ready&&document.querySelector('[data-park-loading]')?.hidden,{}, {timeout:12000});
  await page.evaluate(()=>window.__petPark.scene.walkToObject('sky-game'));await page.waitForFunction(()=>window.__petPark?.miniGame?.assetsReady,{}, {timeout:40000});await page.locator('[data-mini="craft"][data-craft="nova"]').click();await page.locator('[data-mini="start"]').click();await page.waitForFunction(()=>window.__petPark.miniGame.phase==='playing');
  if(process.env.PET_INPUT_PROFILE){const variants=await page.evaluate(async()=>{const style=document.createElement('style');document.head.append(style);const measure=async()=>{await new Promise(r=>setTimeout(r,250));const frames=[],start=performance.now();let last=start;await new Promise(resolve=>{const frame=now=>{frames.push(now-last);last=now;if(now-start<2000)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});frames.sort((a,b)=>a-b);return{count:frames.length,p50:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)]};};const baseline=await measure();style.textContent='.park-mini-root::before,.park-mini-root::after{display:none!important}.park-mini-root *{box-shadow:none!important;backdrop-filter:none!important;filter:none!important}';const noOverlay=await measure();style.textContent='';const restored=await measure();const scene=window.__petPark.miniGame.scene;scene.pet.setVisible(false);scene.clouds.forEach(c=>c.setVisible(false));scene.graphics.setVisible(false);scene.engines.forEach(c=>c.setVisible(false));const simpleCanvas=await measure();return{baseline,noOverlay,restored,simpleCanvas,renderer:scene.game.renderer.gl?'WebGL':'Canvas'};});results.push({engine,variants});await context.close();await browser.close();browser=undefined;continue;}
  await page.evaluate(()=>{
   const client=window.__petPark.client,scene=window.__petPark.miniGame.scene,send=client.gameInput.bind(client),socket=client.socket;
   window.__inputQa={frames:[],events:[],pointerLog:[],sent:0,received:0,bytes:0,pending:0,lastEvent:0};
   for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture'])document.addEventListener(type,e=>window.__inputQa.pointerLog.push({type,id:e.pointerId,target:e.target.tagName,action:e.target.dataset?.mini,drag:scene.drag&&{...scene.drag},at:performance.now()}),true);
   // Delay the real outbound samples and inbound server snapshots independently.
   // This remains the actual Socket.IO/production simulation/DOM/rendering path.
   client.gameInput=(session,input)=>{window.__inputQa.lastSample={session,...input};window.__inputQa.sent++;window.__inputQa.pending++;setTimeout(()=>{window.__inputQa.pending--;send(session,input);},180);};
   const listeners=[...socket.listeners('park:game:frame')];for(const listener of listeners)socket.off('park:game:frame',listener);
   socket.on('park:game:frame',payload=>{window.__inputQa.received++;window.__inputQa.bytes+=JSON.stringify(payload).length;for(const listener of listeners)setTimeout(()=>listener(payload),180);});
   socket.onAnyOutgoing((event,body)=>{if(event==='park:game:input')window.__inputQa.lastOutgoing=body;});
   const canvas=scene.game.canvas;canvas.addEventListener('pointermove',()=>{const q=window.__inputQa;q.lastEvent=performance.now();q.events.push({at:q.lastEvent,target:{...scene.localPlayer},drawn:false});});
   let previous=performance.now();scene.events.on('postupdate',()=>{const q=window.__inputQa,now=performance.now();q.frames.push(now-previous);previous=now;const e=q.events.at(-1);if(e&&!e.drawn&&Math.hypot(scene.plane.x-e.target.x,scene.plane.y-e.target.y)<.1){e.drawn=true;e.latency=now-e.at;}});
  });
  let touch,primary;
  if(engine==='chromium'){
   touch=await context.newCDPSession(page);await touch.send('Emulation.setCPUThrottlingRate',{rate:4});
   primary=await screen(page,160,550);const before=(await sample(page)).visual;
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...primary,id:1}]});await at(page,before);pass(engine+': a real touch down keeps the aircraft stationary');
   primary=await screen(page,280,470);await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...primary,id:1}]});const target={x:before.x+120,y:before.y-80};const immediate=await at(page,target);
   assert.ok(Math.hypot(immediate.server.x-target.x,immediate.server.y-target.y)>50,'latency test did not keep the authoritative snapshot behind the local plane');
   const shield=await page.locator('[data-mini="shield"]').boundingBox();const finger={x:shield.x+shield.width/2,y:shield.y+shield.height/2,id:2};
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...primary,id:1},finger]});await page.waitForTimeout(70);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[finger]});
   const drag=(await sample(page)).drag;assert.ok(drag,'second-finger action stole the flight drag: '+JSON.stringify(await page.evaluate(()=>({log:window.__inputQa.pointerLog,buttonTouch:getComputedStyle(document.querySelector('[data-mini="shield"]')).touchAction,canvasTouch:getComputedStyle(document.querySelector('.park-canvas canvas')).touchAction,state:window.__petPark.miniGame.state.paused}))));
   // Smooth continuous input over several seconds, including direction changes.
   for(let i=0;i<100;i++){
    const x=240+Math.sin(i*.08)*100,y=540+Math.cos(i*.07)*35;
    const state=await page.evaluate(()=>{const s=window.__petPark.miniGame.scene;return{drag:s.drag,player:s.localPlayer};});assert.ok(state.drag);
    primary=await screen(page,state.drag.x+x-state.player.x,state.drag.y+y-state.player.y);
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...primary,id:1}]});await at(page,{x,y});
   }
   await page.waitForFunction(()=>window.__petPark.miniGame.state.shieldPress===1,{}, {timeout:5000});assert.equal((await sample(page)).shields,2);
   // Cancellation must release capture; another contact can re-anchor anywhere.
   await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal((await sample(page)).drag,undefined);
   const held=(await sample(page)).visual;primary=await screen(page,100,420);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...primary,id:1}]});await at(page,held);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   pass(engine+': 4× CPU, continuous native drag, independent second-finger shield and touch cancellation pass with 360 ms injected network delay');
  }else{
   const before=(await sample(page)).visual,p=await screen(page,160,550);await page.touchscreen.tap(p.x,p.y);await at(page,before);assert.equal((await sample(page)).drag,undefined);
   for(let i=0;i<24;i++){const x=240+Math.sin(i*.1)*110,y=540+Math.cos(i*.1)*35,p=await screen(page,x,y);await page.mouse.move(p.x,p.y);await at(page,{x,y});}
   pass(engine+': WebKit native touch tap has no position jump; mouse input tracks directly under the same 360 ms delay');
  }
  const held=(await sample(page)).visual;await page.waitForTimeout(700);await at(page,held);
  const settled=await sample(page);assert.ok(Math.hypot(settled.server.x-held.x,settled.server.y-held.y)<.1,'server and renderer did not agree after delayed input');assert.deepEqual(settled.scroll,[0,0]);assert.equal(settled.scale,1);
  await shot(page,engine+'-tablet-playing');
  const pause=page.locator('[data-mini="pause"]');await pause.click();await page.locator('[data-mini="resume"]').waitFor();await page.waitForTimeout(500);assert.equal((await sample(page)).drag,undefined);
  await page.locator('[data-mini="resume"]').click();await page.locator('[data-mini="resume"]').waitFor({state:'detached'});await page.setViewportSize({width:820,height:1180});await page.waitForTimeout(200);await shot(page,engine+'-tablet-portrait');
  const data=await page.evaluate(()=>{const q=window.__inputQa,s=window.__petPark.miniGame.scene,frames=q.frames.filter(n=>n>0).sort((a,b)=>a-b),latencies=q.events.filter(e=>e.drawn).map(e=>e.latency).sort((a,b)=>a-b),percentile=(a,p)=>a[Math.min(a.length-1,Math.floor(a.length*p))];return{frames:frames.length,frameMs:{p50:percentile(frames,.5),p95:percentile(frames,.95),p99:percentile(frames,.99)},events:q.events.length,drawn:latencies.length,responseMs:{p50:percentile(latencies,.5),p95:percentile(latencies,.95),max:latencies.at(-1)},sent:q.sent,snapshots:q.received,bytes:q.bytes,particleObjects:s.particles.length+s.freeParticles.length,particleCap:120,canvas:[s.game.canvas.width,s.game.canvas.height],renderer:s.game.renderer.gl?'WebGL':'Canvas',dpr:devicePixelRatio,touchDevice:s.touchDevice,scroll:[scrollX,scrollY],overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.ok(data.drawn>=(engine==='chromium'?60:20));if(engine==='chromium')assert.ok(data.responseMs.p95<60,'input response exceeded the bounded next-frame target');assert.ok(data.particleObjects<=120);assert.equal(data.overflow,false);results.push({engine,injectedRoundTripMs:360,cpuSlowdown:engine==='chromium'?4:1,...data});
  await page.locator('[data-mini="exit"]').first().click();await page.locator('.park-mini-root').waitFor({state:'detached'});await context.close();await browser.close();browser=undefined;
 }
 assert.deepEqual(errors,[]);const report={pass:true,build,htmlSha256:createHash('sha256').update(await fs.readFile(path.join(build,'index.html'))).digest('hex'),checks,results,errors,scope:'Windows Chrome native emulated touch (4x CPU) and Windows Playwright WebKit test engine (WebGL, no Web Audio implementation here, silent fallback; functional checks only, no iPad performance inference); tablet DPR 2; physical iPad hardware not tested; PET_WEBKIT_CANVAS=1 explicitly exercises the Canvas fallback because Windows WebKit headless does not present WebGL artwork in screenshots'};await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){const diagnostic=await Promise.all(pages.map(p=>p.isClosed()?undefined:p.evaluate(async()=>{try{return await window.__petPark.client.request("park:game:input",window.__inputQa.lastSample);}catch(e){return{message:e.message};}}).catch(()=>{})));const debug=await Promise.all(pages.map(p=>p.isClosed()?undefined:p.evaluate(()=>{const s=window.__petPark?.miniGame?.scene;return{audio:window.__qaAudioContexts?.map(c=>c.state),qa:window.__inputQa,client:{ready:window.__petPark?.client.ready,connected:window.__petPark?.client.connected,locked:window.__petPark?.client.locked},body:document.body.innerText.slice(-1500),shield:s?.shield,press:s?.shieldPress,state:s?.state,drag:s?.drag};}).catch(()=>{})));await Promise.all(pages.map((p,i)=>p.isClosed()?undefined:shot(p,'failure-'+i).catch(()=>{})));await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:error.stack,errors,results,diagnostic,debug,logs:logs.slice(-4000)},null,2));console.error(error.stack);process.exitCode=1;}
finally{await browser?.close();server.kill();if(path.dirname(temporary)===path.resolve(os.tmpdir())&&path.basename(temporary).startsWith('buio-sky-v2-'))await fs.rm(temporary,{recursive:true,force:true});}
