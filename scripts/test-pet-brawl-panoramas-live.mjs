import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {chromium} from 'playwright';
import {FIGHTERS,STAGES} from '../pet-app/lib/brawl/catalog.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-roster-browser-')),dbFile=path.join(temp,'db.json'),out=path.resolve(process.env.PET_PLAYTEST_DIR||'artifacts/pet-playtest/panoramas-v1');await fs.mkdir(out,{recursive:true});
await fs.writeFile(dbFile,JSON.stringify({users:['S001','S002','S003'].map((id,n)=>({studentid:id,name:['全角色測試','稀有對戰測試','未購買測試'][n],passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'})),studentStats:[],questionLogs:[],_logId:0}));
process.env.BUIO_JSON_DB_FILE=dbFile;process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),pets=require('../pet-app/repositories/pet.repo'),store=require('../db/jsonStore');for(const id of ['S001','S002','S003'])await pets.ensureStudent(id);
const fixture=store.load();for(const [id,roster] of [['S001',FIGHTERS],['S002',FIGHTERS.filter(f=>f.id==='monchhichi')]]){for(const f of roster)fixture.petInstances.push({petId:randomUUID(),studentId:id,speciesId:f.id,xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});Object.assign(fixture.petProfiles.find(p=>p.studentId===id),{activePetId:fixture.petInstances.find(p=>p.studentId===id).petId,starterEggClaimed:true});fixture.petWallets.find(w=>w.studentId===id).balance=2500;}store.save();
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'0',NODE_ENV:'development',PET_APP_DIST_DIR:process.env.PET_APP_DIST_DIR||path.resolve('pet-app/dist')},stdio:['ignore','pipe','pipe']});let logs='',browser;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const errors=[],failed=[],results=[];const pass=label=>{console.log('✓ '+label);results.push(label);};const balances=async()=>{const d=JSON.parse(await fs.readFile(dbFile,'utf8'));return ['S001','S002'].map(id=>d.petWallets.find(p=>p.studentId===id).balance);};
const ready=async p=>p.waitForFunction(()=>window.__petGame?.scene.isActive('Brawl')&&!document.querySelector('.brawl-loading'));
const leave=async p=>{await p.keyboard.press('Escape');await p.locator('[data-brawl="lobby"]').click();await p.locator('.brawl-roster-head').waitFor();};
// Fixtures below move only temporary preview state to audit renderer coverage;
// real keyboard and touch input are exercised separately without state edits.
const devices=[{width:1024,height:768},{width:1194,height:834},{width:1280,height:720},{width:844,height:390},{width:1920,height:810}];
const audit=async page=>page.evaluate(()=>{
 const scene=window.__petGame.scene.getScene('Brawl'),bg=scene.background,camera=scene.cameras.main,source=bg.texture.getSourceImage(),canvas=window.__petGame.canvas.getBoundingClientRect(),parent=document.getElementById('game-root').getBoundingClientRect();
 const player=scene.runtime.state.actors.find(a=>a.id===scene.runtime.playerId)||scene.runtime.state.actors[0];
 return {playerX:player.x/100,lookAhead:scene.lookAhead,world:scene.runtime.state.mode==='campaign'?5120:1280,missing:scene.children.list.filter(o=>o.texture?.key==='__MISSING').length,stage:scene.runtime.state.stageId,viewport:scene.viewportWidth,backgrounds:scene.children.list.filter(o=>o.type==='Image'&&o.texture?.key.startsWith('brawl-bg-')).length,scaleX:bg.scaleX,scaleY:bg.scaleY,x:bg.x,y:bg.y,width:bg.displayWidth,height:bg.displayHeight,sourceWidth:source.width,sourceHeight:source.height,scrollFactor:bg.scrollFactorX,frame:bg.frame.name,camera:camera.scrollX,canvas:{x:canvas.x,y:canvas.y,width:canvas.width,height:canvas.height},parent:{x:parent.x,y:parent.y,width:parent.width,height:parent.height}};
});
function covered(info){
 assert.equal(info.missing,0);assert.equal(info.backgrounds,1);assert.equal(info.frame,'__BASE');assert.equal(info.scrollFactor,0);
 assert.ok(Math.abs(info.scaleX-info.scaleY)<1e-9);assert.ok(Math.abs(info.width/info.height-info.sourceWidth/info.sourceHeight)<1e-9);
 assert.ok(Math.abs(info.x+Math.max(0,info.camera))<.01,'Painted floor follows the camera at full world speed');
 const target=info.viewport>=info.world?(info.world-info.viewport)/2:Math.max(0,Math.min(info.world-info.viewport,info.playerX-info.viewport*.453125+info.lookAhead));
 assert.ok(Math.abs(info.camera-target)<.01,'Camera reaches the player target in the same render frame');
 assert.ok(info.x<=.01&&info.x+info.width>=info.viewport-.01);assert.ok(info.y<=.01&&info.y+info.height>=719.99);
 assert.ok(Math.abs(info.canvas.width-info.parent.width)<=2&&Math.abs(info.canvas.height-info.parent.height)<=2,'Landscape canvas fills its parent proportionally');
}
try{
 const baseURL='http://127.0.0.1:'+port;for(let n=0;n<200;n++){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({baseURL,viewport:devices[0],hasTouch:true});
 assert.equal((await context.request.post('/api/auth/login',{data:{studentId:'S001',password:'test'}})).status(),200);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))failed.push(r.url());});
 await page.goto('/pet');await page.locator('[data-tab="brawl"]').click();await page.locator('.brawl-roster-head').waitFor();
 assert.deepEqual((await page.locator('.brawl-fighter').evaluateAll(ns=>ns.map(n=>n.dataset.id))).slice(-3),['monchhichi','dynasty-warriors-zhao-yun','sword-art-online-kirito']);
 await page.locator('[data-brawl="mode"][data-id="practice"]').click();
 const report=[];
 for(const [index,stage] of STAGES.entries()){
  await page.locator('[data-brawl="act"][data-id="'+Math.floor(index/4)+'"]').click();
  await page.locator('[data-brawl="start"][data-stage="'+stage.id+'"]').click();await ready(page);
  if(index===0){
   await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.runtime.state.actors[0].x=60000;scene.runtime.state.actors[0].facing=1;scene.lookAhead=90;scene.resizeViewport();scene.draw(16);});
   const walkStart=await audit(page);
   const before=await page.evaluate(()=>window.__petGame.scene.getScene('Brawl').runtime.state.actors[0].x);
   await page.keyboard.down('KeyD');await page.waitForTimeout(180);await page.keyboard.up('KeyD');
   assert.ok(await page.evaluate(x=>window.__petGame.scene.getScene('Brawl').runtime.state.actors[0].x>x,before));
   const walkEnd=await audit(page);covered(walkEnd);
   assert.ok(Math.abs((walkEnd.playerX-walkStart.playerX)-(walkEnd.camera-walkStart.camera))<.01,'Real held movement keeps actor and camera displacement equal');
   assert.ok(Math.abs((walkEnd.camera-walkStart.camera)+(walkEnd.x-walkStart.x))<.01,'Real held movement keeps background and camera displacement equal');
   await page.locator('[data-battle-key="16"]').tap();
   assert.ok((await page.locator('.brawl-buttons button,[data-stick]').evaluateAll(ns=>ns.map(n=>n.getBoundingClientRect().height))).every(h=>h>=64));
  }
  await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.__normalUpdate=scene.sys.sceneUpdate;scene.__changed=scene.runtime.changed;scene.runtime.changed=()=>{};scene.sys.sceneUpdate=(_t,d)=>scene.draw(Math.min(d,50));scene.runtime.state.mode='campaign';scene.runtime.state.actors[0].y=45500;});
  for(const size of index===0?devices:[devices[0]]){
   await page.setViewportSize(size);await page.waitForTimeout(120);
   const controls=await page.locator('.brawl-buttons button,[data-stick]').evaluateAll(ns=>ns.map(n=>({height:n.getBoundingClientRect().height,width:n.getBoundingClientRect().width})));
   assert.ok(controls.every(r=>r.height>=64&&r.width>=64));
   if(size.height<=500)assert.ok((await page.locator('.brawl-controls').boundingBox()).height<=145,'Compact phone controls keep the lane visible');
   // Real renderer displacement at interior world positions, independent of zone
   // labels: the camera and floor must travel 180 world pixels with the actor.
   await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.lookAhead=90;scene.runtime.state.actors[0].facing=1;scene.runtime.state.actors[0].x=260000;scene.resizeViewport();scene.draw(16);});
   const motionStart=await audit(page);
   await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.runtime.state.actors[0].x+=18000;scene.draw(16);});
   const motionEnd=await audit(page);covered(motionEnd);
   assert.ok(Math.abs(motionEnd.camera-motionStart.camera-180)<.01,'Camera follows actor displacement without trailing '+JSON.stringify({device:size,motionStart,motionEnd}));
   assert.ok(Math.abs(motionEnd.x-motionStart.x+180)<.01,'Background moves opposite the actor at full camera speed');
   for(const zone of [0,1,2,3]){
    await page.evaluate(zone=>{const scene=window.__petGame.scene.getScene('Brawl'),s=scene.runtime.state;s.zone=zone;s.actors[0].x=(zone===3?5030:zone*1280+300)*100;scene.resizeViewport();scene.draw(16);},zone);
    const info=await audit(page);covered(info);report.push({device:size,zone,...info});
    if(index===0||zone===0||zone===3)await page.screenshot({path:path.join(out,`${String(index+1).padStart(2,'0')}-${stage.id}-${size.width}x${size.height}-zone${zone+1}.png`)});
   }
  }
  if(index===0){
   await page.setViewportSize({width:768,height:1024});await page.keyboard.press('Escape');await page.locator('[data-brawl="continue"]').click();
   assert.ok((await page.locator('.brawl-notice').innerText()).includes('橫向'));await page.setViewportSize(devices[0]);await page.locator('[data-brawl="continue"]').click();
   await page.screenshot({path:path.join(out,'rotate-back-ipad.png')});
  }
  await page.evaluate(()=>{const scene=window.__petGame.scene.getScene('Brawl');scene.runtime.state.mode='practice';scene.runtime.changed=scene.__changed;scene.sys.sceneUpdate=scene.__normalUpdate;});
  await leave(page);assert.equal(await page.evaluate(()=>window.__petGame.scale.gameSize.width),1280);assert.equal(await page.evaluate(()=>window.__petGame.scale.gameSize.height),720);
  console.log('  panorama '+stage.id);
 }
 pass('Twenty chapters render exactly one complete image with uniform scaling and seamless camera movement through all four sections');
 pass('Five landscape device sizes fill the canvas, rotation keeps the existing portrait guard, and leaving restores the bedroom canvas');
 // A real campaign opening remains mandatory, with the new panorama behind it.
 await page.locator('[data-brawl="mode"][data-id="campaign"]').click();await page.locator('[data-brawl="act"][data-id="0"]').click();await page.locator('[data-brawl="start"][data-stage="sunny-training"]').click();await ready(page);await page.locator('.brawl-story-overlay').waitFor();
 assert.equal(await page.locator('[data-brawl="story-skip"]').count(),0);assert.equal(await page.evaluate(()=>window.__petGame.scene.getScene('Brawl').runtime.state.tick),0);
 await page.screenshot({path:path.join(out,'campaign-opening-ipad.png')});
 while(await page.locator('.brawl-story-overlay').count())await page.locator('[data-brawl="story-next"]').click();
 await page.waitForFunction(()=>window.__petGame.scene.getScene('Brawl').runtime.state.tick>0);covered(await audit(page));
 await page.keyboard.press('Escape');await page.screenshot({path:path.join(out,'campaign-floor-ipad.png')});await page.locator('[data-brawl="lobby"]').click();await page.locator('[data-brawl="abandon"]').click();
 await page.locator('[data-tab="home"]').click();await page.screenshot({path:path.join(out,'bedroom-restored-ipad.png')});
 assert.deepEqual(await balances(),[2500,2500]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 pass('Keyboard and touch controls work; mandatory campaign story, wallets and the restored room remain valid; no console or asset failures');
 await fs.writeFile(path.join(out,'results.json'),JSON.stringify({pass:true,devices,results,report,errors,failed},null,2));
}catch(error){await fs.writeFile(path.join(out,'failure.txt'),error.stack+'\n'+logs);throw error;}
finally{await browser?.close();server.kill();await new Promise(r=>server.once('exit',r));assert.ok(path.resolve(temp).startsWith(path.join(os.tmpdir(),'buio-roster-browser-')));await fs.rm(temp,{recursive:true,force:true});}
