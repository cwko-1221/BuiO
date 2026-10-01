import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {chromium} from 'playwright';
import {INPUT as I,DIFFICULTIES} from '../pet-app/lib/brawl/catalog.mjs';
import {botInput} from './pet-brawl-bot.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-brawl-quality-')),dbFile=path.join(temp,'db.json'),out=path.resolve(process.env.PET_BRAWL_QUALITY_OUT||'artifacts/pet-playtest/brawl-v3/quality');
await fs.mkdir(out,{recursive:true});await fs.writeFile(dbFile,JSON.stringify({users:[{studentid:'S001',name:'Quality playtest',role:'student',language:'zh-HK'}],studentStats:[],questionLogs:[],_logId:0}));
process.env.BUIO_JSON_DB_FILE=dbFile;process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),repo=require('../pet-app/repositories/pet.repo.js'),store=require('../db/jsonStore.js');await repo.ensureStudent('S001');
const data=store.load();for(const speciesId of ['starpatch-cat','cloud-ear-dog','pudding-pig'])data.petInstances.push({petId:randomUUID(),studentId:'S001',speciesId,xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});Object.assign(data.petProfiles[0],{activePetId:data.petInstances[0].petId,starterEggClaimed:true});store.save();
const port=await new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const p=socket.address().port;socket.close(()=>resolve(p));});});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'1',NODE_ENV:'development',PET_APP_DIST_DIR:process.env.PET_APP_DIST_DIR||path.resolve('artifacts/pet-brawl-v3-build')},stdio:['ignore','pipe','pipe']});
let browser,page,logs='';server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const errors=[],consoleErrors=[],results=[];const snapshot=()=>page.evaluate(()=>{const s=window.__petGame.scene.getScene('Brawl');return {state:structuredClone(s.runtime.state),camera:s.cameras.main.scrollX,fps:window.__petGame.loop.actualFps,feedback:{...s.feedback},effects:s.effects.length};});
async function ready(){await page.waitForFunction(()=>window.__petGame?.scene.isActive('Brawl')&&!document.querySelector('.brawl-loading'));}
async function leave(){await page.keyboard.press('Escape');await page.locator('[data-brawl="lobby"]').click();await page.locator('.brawl-fighter').first().waitFor();}
async function shot(name){await page.screenshot({path:path.join(out,name+'.png')});}
try{
  const baseURL=`http://127.0.0.1:${port}`;for(let i=0;i<200;i++){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({baseURL,viewport:{width:1440,height:900}});
  await context.addInitScript(()=>{
    window.__audioTaps=[];const connect=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(target,...args){if(target===this.context.destination){const ctx=this.context,analyser=ctx.createAnalyser(),stream=ctx.createMediaStreamDestination(),recorder=new MediaRecorder(stream.stream),chunks=[];analyser.fftSize=2048;connect.call(this,analyser);connect.call(analyser,stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(100);window.__audioTaps.push({ctx,analyser,stream,recorder,chunks});}return connect.call(this,target,...args);};
    localStorage.setItem('pet-audio-muted','0');localStorage.setItem('pet-music-level','0.3');localStorage.setItem('pet-sfx-level','0.75');
  });
  await context.request.get('/api/auth/me');page=await context.newPage();await fs.writeFile(path.join(out,'actual-game-video.webm'),Buffer.alloc(0));await page.exposeFunction('__saveVideo',async base64=>fs.appendFile(path.join(out,'actual-game-video.webm'),Buffer.from(base64,'base64')));page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')consoleErrors.push(e.text());});await page.goto('/pet');await page.locator('[data-tab="brawl"]').click();await page.locator('.brawl-fighter').first().waitFor();
  for(const [index,id] of ['starpatch-cat','cloud-ear-dog','pudding-pig'].entries()){
    await page.locator(`[data-brawl="fighter"][data-id="${id}"]`).click();await page.locator('[data-brawl="mode"][data-id="practice"]').click();await page.locator('[data-brawl="start"]').nth(index).click();await ready();if(index===0)await page.evaluate(()=>{const source=document.querySelector('#game-root canvas'),canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');window.__petGame.events.on('postrender',()=>ctx.drawImage(source,0,0));const stream=canvas.captureStream(30);stream.addTrack(window.__audioTaps.at(-1).stream.stream.getAudioTracks()[0]);const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8,opus',videoBitsPerSecond:2000000});window.__videoCapture={recorder,pending:Promise.resolve(),bytes:0};recorder.ondataavailable=e=>{if(e.data.size){window.__videoCapture.bytes+=e.data.size;window.__videoCapture.pending=window.__videoCapture.pending.then(async()=>{const base64=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.slice(reader.result.lastIndexOf(',')+1));reader.readAsDataURL(e.data);});await window.__saveVideo(base64);});}};recorder.start(1000);});await page.waitForTimeout(2100);
    if(id==='starpatch-cat'){await page.keyboard.down('KeyD');await page.waitForFunction(()=>window.__petGame.scene.getScene('Brawl').runtime.state.actors[0].x>=53000);await page.keyboard.up('KeyD');await page.waitForTimeout(80);}await page.keyboard.press('KeyU');await page.waitForFunction(id=>{const s=window.__petGame.scene.getScene('Brawl'),p=s.runtime.state.actors[0];return p.action==='skill1'&&p.actionTick>=(id==='starpatch-cat'?8:14);},id);await shot(id+'-skill1');await page.waitForTimeout(600);
    await page.keyboard.down('KeyD');await page.waitForFunction(()=>window.__petGame.scene.getScene('Brawl').runtime.state.actors[0].x>=53000);await page.keyboard.up('KeyD');await page.waitForTimeout(80);
    await page.keyboard.press('KeyI');await page.waitForFunction(()=>window.__petGame.scene.getScene('Brawl').effects.some(e=>['shock','whirl','vortex','slash'].includes(e.kind)&&e.age>.08&&e.age<.4));await shot(id+'-skill2');await page.waitForTimeout(700);
    await page.keyboard.down('KeyJ');await page.waitForTimeout(950);await shot(id+'-combo');await page.keyboard.up('KeyJ');const sampled=await snapshot();assert.ok(sampled.feedback.casts>=2);assert.ok(sampled.feedback.hits>0);assert.ok(sampled.feedback.particles>20);results.push({fighter:id,feedback:sampled.feedback});await leave();
  }
  // Measure the actual post-master output, including the mute path, and retain its recording.
  const rms=()=>page.evaluate(()=>{const a=window.__audioTaps.at(-1).analyser,v=new Float32Array(a.fftSize);a.getFloatTimeDomainData(v);return Math.sqrt(v.reduce((sum,x)=>sum+x*x,0)/v.length);});
  await page.locator('[data-brawl="mode"][data-id="practice"]').click();await page.locator('[data-brawl="start"]').first().click();await ready();await page.waitForTimeout(500);let audible=0;for(let n=0;n<8;n++){audible=Math.max(audible,await rms());await page.waitForTimeout(80);}assert.ok(audible>.001,'actual output contains audible energy');await page.locator('[data-brawl="sound"]').click();await page.waitForTimeout(200);const muted=await rms();assert.ok(muted<.00001,'mute silences actual output');await page.locator('[data-brawl="sound"]').click();await page.waitForTimeout(200);let restored=0;for(let n=0;n<8;n++){restored=Math.max(restored,await rms());await page.waitForTimeout(80);}assert.ok(restored>.001);await leave();
  console.log(JSON.stringify({audio:{audible,muted},skillChecks:results}));
  // Full real-time campaigns: legal inputs once per normal simulation tick; no time scale,
  // HP, positions, actors, random state or outcomes are modified by the test.
  if(process.env.PET_BRAWL_QUALITY_SKILLS_ONLY!=='1')for(let stage=0;stage<3;stage++){let stageWon=false;for(let attempt=0;attempt<3&&!stageWon;attempt++){
    await page.locator(`[data-brawl="fighter"][data-id="${process.env.PET_BRAWL_CAMPAIGN_FIGHTER||'pudding-pig'}"]`).click();await page.locator('[data-brawl="mode"][data-id="campaign"]').click();await page.locator('[data-brawl="start"]').nth(stage).click();await ready();
    await page.evaluate(({source,I,DIFFICULTIES})=>{const decide=new Function('I','DIFFICULTIES',`return (${source})`)(I,DIFFICULTIES),scene=window.__petGame.scene.getScene('Brawl'),original=scene.runtime.step;scene.runtime.step=mask=>original(mask??decide(scene.runtime.state));}, {source:botInput.toString(),I,DIFFICULTIES});
    let lastZone=-1,lastX=0,maxDelta=0,frames=0,minFps=100,start=Date.now(),zoneScreens=[];
    while(true){await page.waitForTimeout(1000);const shotState=await snapshot(),s=shotState.state,p=s.actors[0];frames++;minFps=Math.min(minFps,shotState.fps);maxDelta=Math.max(maxDelta,Math.abs(p.x-lastX)/100);lastX=p.x;
      if(s.zone!==lastZone){lastZone=s.zone;await shot(`stage-${stage+1}-zone-${s.zone+1}`);zoneScreens.push({zone:s.zone,x:p.x/100,camera:shotState.camera});console.log(`stage ${stage+1}, zone ${s.zone+1}, HP ${p.hp}, camera ${shotState.camera.toFixed(1)}, tick ${s.tick}`);}
      if(s.status==='ko'){await page.locator('[data-brawl="retry"]').click();continue;}
      if(['won','lost'].includes(s.status)){await page.locator('[data-brawl="again"]').waitFor({timeout:20000});await shot(`stage-${stage+1}-result`);results.push({stage:s.stageId,outcome:s.status,ticks:s.tick,seconds:(Date.now()-start)/1000,minFps,zones:zoneScreens,feedback:shotState.feedback});stageWon=s.status==='won';if(stageWon){assert.equal(zoneScreens.length,4);assert.ok(shotState.feedback.cameraDistance>2500);}await page.locator('[data-brawl="again"]').click();break;}
      assert.ok(Date.now()-start<450000,'campaign finishes in bounded real time');
    }
  }assert.ok(stageWon,`stage ${stage+1} playable in three attempts`);}
  const audioData=await page.evaluate(async()=>{const tap=window.__audioTaps.at(-1);await new Promise(resolve=>{tap.recorder.onstop=resolve;tap.recorder.stop();});const buffer=await new Blob(tap.chunks,{type:'audio/webm'}).arrayBuffer();return Array.from(new Uint8Array(buffer));});await fs.writeFile(path.join(out,'actual-game-audio.webm'),Buffer.from(audioData));
  const videoBytes=await page.evaluate(async()=>{const tap=window.__videoCapture;await new Promise(resolve=>{tap.recorder.onstop=resolve;tap.recorder.stop();});await tap.pending;return tap.bytes;});assert.ok(videoBytes>100000);
  assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);await fs.writeFile(path.join(out,'quality-report.json'),JSON.stringify({pass:true,realTime:true,videoBytes,audio:{audible,muted,bytes:audioData.length},results,errors,consoleErrors},null,2));await context.close();console.log('Quality playtest passed');
}catch(error){await shot('failure').catch(()=>{});console.error(JSON.stringify({error:error.stack,errors,consoleErrors,results,logs:logs.slice(-500)}));process.exitCode=1;}
finally{await browser?.close();server.kill();}
