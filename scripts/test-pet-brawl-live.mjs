import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import bcrypt from 'bcryptjs';
import {chromium} from 'playwright';
import {botInput} from './pet-brawl-bot.mjs';
import {stepBattle} from '../pet-app/lib/brawl/simulation.mjs';
import {INPUT as I} from '../pet-app/lib/brawl/catalog.mjs';

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-brawl-live-'));
const dbFile=path.join(temp,'db.json'),artifacts=path.resolve(process.env.PET_BRAWL_LIVE_OUT||'artifacts/pet-playtest/brawl-v7/flow-regression');
await fs.mkdir(artifacts,{recursive:true});
await fs.writeFile(dbFile,JSON.stringify({users:[
  {studentid:'S001',name:'大亂鬥測試',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'},
  {studentid:'S002',name:'首次進入測試',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'},
  {studentid:'T001',name:'老師測試',passwordhash:bcrypt.hashSync('test',4),role:'teacher',language:'zh-HK'},
],studentStats:[],questionLogs:[],_logId:0}));
process.env.BUIO_JSON_DB_FILE=dbFile;process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),repo=require('../pet-app/repositories/pet.repo.js'),store=require('../db/jsonStore.js');
await repo.ensureStudent('S001');const fixture=store.load(),petId=randomUUID();
fixture.petInstances.push({petId,studentId:'S001',speciesId:'pudding-pig',xp:2200,stage:4,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});
for(const speciesId of ['starpatch-cat','cloud-ear-dog'])fixture.petInstances.push({petId:randomUUID(),studentId:'S001',speciesId,xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});
Object.assign(fixture.petProfiles[0],{activePetId:petId,starterEggClaimed:true});store.save();
const port=await new Promise(resolve=>{const sock=net.createServer();sock.listen(0,'127.0.0.1',()=>{const p=sock.address().port;sock.close(()=>resolve(p));});});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'1',NODE_ENV:'development',PET_APP_DIST_DIR:process.env.PET_APP_DIST_DIR||path.resolve('pet-app/dist')},stdio:['ignore','pipe','pipe']});
let logs='',browser,page;server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const errors=[],consoleErrors=[],failures=[],checks=[];
const pass=label=>{checks.push(label);console.log(`✓ ${label}`);};
const shot=name=>page.screenshot({path:path.join(artifacts,name+'.png')});
const state=()=>page.evaluate(()=>structuredClone(window.__petGame.scene.getScene('Brawl').runtime.state));
async function ready(){await page.waitForFunction(()=>{const scene=window.__petGame?.scene.keys.Brawl;return scene?.sys.isActive()&&scene.fx&&!document.querySelector('.brawl-loading');});}
async function openBrawl(){await page.locator('[data-tab="brawl"]').click();await page.locator('.brawl-fighter').first().waitFor();}
async function leave(){await page.keyboard.press('Escape');await page.locator('[data-brawl="lobby"]').click();await page.locator('.brawl-fighter').first().waitFor();}
try{
  const baseURL=`http://127.0.0.1:${port}`,deadline=Date.now()+20000;
  while(true){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}if(Date.now()>deadline)throw new Error('Server startup timed out');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({baseURL,viewport:{width:1440,height:900},hasTouch:true});
  assert.equal((await context.request.get('/api/pet/brawl/progress')).status(),401);
  await context.request.get('/api/auth/me');
  const teacher=await browser.newContext({baseURL});await teacher.request.post('/api/auth/login',{data:{studentId:'T001',password:'test'}});assert.equal((await teacher.request.get('/api/pet/brawl/catalog')).status(),403);await teacher.close();
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',message=>{if(message.type()==='error'&&!message.text().includes('net::ERR_FAILED'))consoleErrors.push(message.text());});page.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))failures.push({url:new URL(r.url()).pathname,error:r.failure()?.errorText});});
  await page.goto('/pet');
  const failedCatalog=route=>route.abort('failed');await page.route('**/api/pet/brawl/catalog',failedCatalog);await page.locator('[data-tab="brawl"]').click();await page.locator('[data-brawl="load"]').waitFor();await page.unroute('**/api/pet/brawl/catalog',failedCatalog);await page.locator('[data-brawl="load"]').click();await page.locator('.brawl-fighter').first().waitFor();
  assert.equal(await page.locator('.brawl-fighter').count(),3);
  await page.locator('#brawlDifficulty').selectOption('hard');assert.equal(await page.locator('[data-brawl="start"]').first().isDisabled(),true);assert.ok((await page.locator('[data-brawl="start"]').first().innerText()).includes('標準'));await page.locator('#brawlDifficulty').selectOption('easy');
  for(const [w,h] of [[1440,900],[1180,820],[1024,768]]){await page.setViewportSize({width:w,height:h});await shot(`lobby-${w}`);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
  await page.locator('[data-brawl="filter"][data-id="all"]').click();await page.locator('[data-brawl="fighter"][data-id="thunderhorn-goat"]').click();assert.equal(await page.locator('[data-brawl="start"]').first().isDisabled(),true);await page.locator('[data-brawl="filter"][data-id="owned"]').click();await page.locator('[data-brawl="fighter"][data-id="starpatch-cat"]').click();
  await page.locator('[data-brawl="mode"][data-id="practice"]').click();assert.equal(await page.locator('[data-brawl="start"]').first().isEnabled(),true);
  await page.locator('[data-brawl="start"]').first().click();await ready();
  const before=await state();await page.keyboard.down('KeyD');await page.waitForTimeout(250);await page.keyboard.up('KeyD');const moved=await state();assert.ok(moved.actors[0].x>before.actors[0].x+2000);
  await page.keyboard.down('KeyK');await page.waitForTimeout(160);await page.keyboard.up('KeyK');assert.ok((await state()).actors[0].z>1000);await shot('practice-jump-desktop');await page.waitForTimeout(650);
  await page.keyboard.press('KeyU');await page.waitForTimeout(100);assert.ok((await state()).actors[0].cooldowns[0]>0);await page.waitForTimeout(800);
  await page.keyboard.press('KeyI');await page.waitForTimeout(100);assert.ok((await state()).actors[0].cooldowns[1]>0);
  await page.keyboard.press('Escape');const paused=(await state()).tick;await page.waitForTimeout(200);assert.equal((await state()).tick,paused);await shot('pause-ipad');await page.locator('[data-brawl="continue"]').click();
  await page.waitForTimeout(900);
  // Actual concurrent touch pointers: stick + jump, followed by cancellation.
  const stick=await page.locator('[data-stick]').boundingBox(),jump=await page.locator(`[data-battle-key="${I.JUMP}"]`).boundingBox();
  const cdp=await context.newCDPSession(page),touchBefore=await state();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:stick.x+stick.width*.85,y:stick.y+stick.height/2},{id:2,x:jump.x+jump.width/2,y:jump.y+jump.height/2}]});
  await page.waitForTimeout(200);const touched=await state();assert.ok(touched.actors[0].x>touchBefore.actors[0].x);assert.ok(touched.actors[0].z>1000);await shot('ipad-multitouch');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await page.waitForTimeout(800);const released=(await state()).actors[0].x;await page.waitForTimeout(150);assert.equal((await state()).actors[0].x,released);
  await page.setViewportSize({width:768,height:1024});await page.locator('.brawl-modal').waitFor();const rotated=(await state()).tick;await page.waitForTimeout(150);assert.equal((await state()).tick,rotated);await shot('portrait-paused');
  await page.setViewportSize({width:1024,height:768});await page.locator('[data-brawl="lobby"]').click();
  pass('desktop keys, owned characters, landscape multitouch, cancel, pause and rotation');

  // Actual quick U -> I taps must buffer the follow-up and consume the rear-hit mark.
  await page.locator('[data-brawl="start"]').first().click();await ready();
  await page.keyboard.down('KeyD');await page.waitForFunction(()=>window.__petGame.scene.getScene('Brawl').runtime.state.actors[0].x>=53000);await page.keyboard.up('KeyD');await page.waitForTimeout(80);
  await page.keyboard.press('KeyU');await page.waitForFunction(()=>{const p=window.__petGame.scene.getScene('Brawl').runtime.state.actors[0];return p.action==='skill1'&&p.actionTick>=6;});await page.keyboard.press('KeyI');
  await page.waitForFunction(()=>{const p=window.__petGame.scene.getScene('Brawl').runtime.state.actors[0];return p.action==='skill2'&&p.actionTick>=23;});await shot('cat-buffered-combo-ipad');
  await page.waitForTimeout(1000);const combo=await state();assert.equal(combo.actors[1].maxHp-combo.actors[1].hp,54);assert.equal(combo.actors[1].starMarkUntil,0);assert.equal(combo.actors[0].z,0);await leave();
  pass('cat rear-hit star mark → buffered I tap → three claws → empowered finisher');

  await page.locator('[data-brawl="mode"][data-id="tutorial"]').click();await page.locator('[data-brawl="start"]').first().click();await ready();
  for(const [lesson,key] of ['KeyD','KeyJ','KeyK','KeyL','KeyU','KeyI'].entries()){await page.keyboard.press(key);await page.waitForFunction(n=>window.__petGame.scene.getScene('Brawl').runtime.state.lesson>n,lesson);await page.waitForTimeout(850);}
  await page.locator('[data-brawl="again"]').waitFor();assert.equal((await state()).status,'won');await page.locator('[data-brawl="again"]').click();
  await page.locator('[data-brawl="mode"][data-id="duel"]').click();await page.locator('[data-brawl="start"]').first().click();await ready();assert.equal((await state()).actors[1].kind,'starpatch-cat');await shot('ai-duel-ipad');await leave();
  pass('guided tutorial completion and AI duel scene');

  await page.locator('[data-brawl="fighter"][data-id="cloud-ear-dog"]').click();await page.locator('[data-brawl="mode"][data-id="practice"]').click();
  const failedAsset=route=>route.abort('failed');await page.route('**/cloud-ear-dog-a-*.webp',failedAsset);await page.locator('[data-brawl="start"]').first().click();await page.locator('.brawl-modal [data-brawl="lobby"]').waitFor();assert.ok((await page.locator('.brawl-modal').innerText()).includes('素材'));await shot('asset-error-recovery');await page.unroute('**/cloud-ear-dog-a-*.webp',failedAsset);await page.locator('[data-brawl="lobby"]').click();
  await page.locator('[data-brawl="start"]').first().click();await ready();await page.keyboard.press('KeyU');await page.waitForTimeout(150);assert.ok((await state()).actors[0].cooldowns[0]>0);await leave();
  pass('catalog and texture failures offer working retries; cloud-ear dog reloads successfully');

  await page.locator('[data-brawl="fighter"][data-id="pudding-pig"]').click();await page.locator('[data-brawl="mode"][data-id="campaign"]').click();
  await page.locator('[data-brawl="start"]').first().click();await ready();await page.keyboard.down('KeyD');await page.waitForTimeout(200);await page.keyboard.up('KeyD');await page.keyboard.press('Escape');
  const saved=await state();await page.locator('[data-brawl="lobby"]').click();await page.reload();await openBrawl();await page.locator('[data-brawl="resume"]').click();await ready();
  const restored=await state();assert.equal(restored.tick,saved.tick);assert.deepEqual(restored.actors,saved.actors);assert.equal(restored.fighterId,'pudding-pig');await shot('resume-ipad');
  pass('IndexedDB restores the exact campaign tick and actors after reload');

  // Continue using legal input masks. Acceleration avoids waiting several minutes;
  // the server independently replays the complete log before any wallet/XP change.
  let won=false;
  for(let attempt=0;attempt<10&&!won;attempt++){
    await page.locator('[data-brawl="continue"]').click();await page.keyboard.press('Escape');
    const copy=await state(),masks=[];let bossIndex=-1;
    while(!['won','lost'].includes(copy.status)&&copy.tick<36000){const mask=botInput(copy);masks.push(mask);stepBattle(copy,mask);if(copy.zone===3&&copy.actors.some(a=>a.boss&&a.action.startsWith('attack')&&a.actionTick===15)&&bossIndex<0)bossIndex=masks.length;}
    if(bossIndex>0){await page.evaluate(frames=>{const r=window.__petGame.scene.getScene('Brawl').runtime;frames.forEach(m=>r.step(m));document.querySelector('.brawl-modal').style.visibility='hidden';},masks.slice(0,bossIndex));await page.waitForFunction(()=>{const scene=window.__petGame.scene.getScene('Brawl');return Math.abs(scene.cameras.main.scrollX-Math.max(0,Math.min(3840,scene.runtime.state.actors[0].x/100-580+scene.runtime.state.actors[0].facing*90)))<1;});await shot('campaign-boss-ipad');await page.evaluate(()=>document.querySelector('.brawl-modal').style.visibility='');}
    let rejectSettlement=true;
    const block=async route=>{if(rejectSettlement){rejectSettlement=false;await route.abort('failed');}else await route.continue();};
    await page.route('**/api/pet/brawl/runs/*/finish',block);
    await page.evaluate(frames=>{const r=window.__petGame.scene.getScene('Brawl').runtime;frames.forEach(m=>r.step(m));},masks.slice(Math.max(0,bossIndex)));
    await page.locator('[data-brawl="finish-retry"]').waitFor();await page.unroute('**/api/pet/brawl/runs/*/finish',block);
    await page.locator('[data-brawl="finish-retry"]').click();await page.locator('[data-brawl="again"]').waitFor({timeout:20000});
    won=copy.status==='won';if(won){await shot('campaign-reward-ipad');assert.ok((await page.locator('.brawl-result-rewards').innerText()).includes('+5'));}
    await page.locator('[data-brawl="again"]').click();
    if(!won){await page.locator('[data-brawl="start"]').first().click();await ready();await page.keyboard.press('Escape');}
  }
  assert.equal(won,true,'campaign wins using legal inputs');
  const final=JSON.parse(await fs.readFile(dbFile,'utf8'));assert.equal(final.petCurrencyLedger.filter(l=>l.kind==='brawl_win').length,1);assert.equal(final.petInstances.find(p=>p.petId===petId).xp,2210);
  assert.equal(final.petBrawlRuns.filter(r=>r.result?.outcome==='won').length,1);assert.ok(final.petBrawlProgress[0].state['sunny-training:easy']);
  assert.equal(await page.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('buio-pet-brawl',1);q.onsuccess=()=>{const r=q.result.transaction('sessions').objectStore('sessions').get('S001');r.onsuccess=()=>resolve(r.result===undefined);r.onerror=reject;};})),true);
  await page.locator('[data-tab="home"]').click();await page.waitForFunction(()=>window.__petGame.scene.isActive('Bedroom'));assert.equal(await page.locator('#brawl-root').count(),0);assert.equal(await page.evaluate(()=>window.__petGame.scene.isActive('Brawl')),false);assert.equal(await page.evaluate(()=>Object.keys(window.__petGame.textures.list).some(k=>k.startsWith('brawl-'))),false);
  pass('full campaign → failed network settlement → retry → exactly one wallet/XP reward → room cleanup');
  const newcomer=await browser.newContext({baseURL,viewport:{width:1180,height:820}});await newcomer.request.post('/api/auth/login',{data:{studentId:'S002',password:'test'}});const np=await newcomer.newPage();np.on('pageerror',e=>errors.push(e.message));
  await np.goto('/pet');await np.locator('[data-action="hatch"]').waitFor();await np.locator('[data-tab="brawl"]').click();await np.locator('[data-brawl="mode"][data-id="practice"]').click();assert.equal(await np.locator('[data-brawl="start"]:enabled').count(),0);await np.locator('[data-tab="home"]').click();await np.locator('[data-action="hatch"]').click();await np.locator('.reveal-card').waitFor();await np.locator('[data-action="back-home"]').click();await np.waitForFunction(()=>window.__petGame?.scene.isActive('Bedroom')&&document.querySelector('#game-root canvas')?.clientWidth>0);await np.locator('[data-tab="brawl"]').click();await np.locator('[data-brawl="mode"][data-id="practice"]').click();await np.locator('[data-brawl="start"]').first().click();await np.waitForFunction(()=>window.__petGame?.scene.isActive('Brawl')&&!document.querySelector('.brawl-loading'));await np.keyboard.press('Escape');await np.locator('[data-brawl="lobby"]').click();await np.locator('[data-tab="home"]').click();await np.waitForFunction(()=>window.__petGame.scene.isActive('Bedroom'));assert.equal(await np.locator('#game-root canvas').count(),1);await np.screenshot({path:path.join(artifacts,'first-hatch-owned-practice.png')});await newcomer.close();
  pass('new student cannot borrow; hatches an owned starter, practices and returns to the rebuilt room canvas');
  assert.deepEqual(errors,[]);
  assert.deepEqual(consoleErrors,[]);
  // The deliberate aborted settlement request is expected and reported separately.
  assert.ok(failures.every(f=>f.url.endsWith('/finish')||f.url.endsWith('/brawl/catalog')||f.url.includes('/brawl/cloud-ear-dog-a-')),JSON.stringify(failures));
  const report={pass:true,browser:'Windows Chrome',viewports:[[1440,900],[1180,820],[1024,768],[768,1024]],checks,errors,consoleErrors,expectedNetworkFailures:failures,postgresVerified:false,physicalIpadVerified:false};
  await fs.writeFile(path.join(artifacts,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await shot('failure').catch(()=>{});console.error(JSON.stringify({pass:false,error:error.stack,errors,failures,logs:logs.slice(-1600)}));process.exitCode=1;}
finally{await browser?.close();server.kill();}
