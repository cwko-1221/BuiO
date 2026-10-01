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

const temp=await fs.mkdtemp(path.join(os.tmpdir(),'buio-pvp-live-'));
const dbFile=path.join(temp,'db.json'),artifacts=path.resolve(process.env.PET_BRAWL_PVP_OUT||'artifacts/pet-playtest/brawl-pvp');await fs.mkdir(artifacts,{recursive:true});
await fs.writeFile(dbFile,JSON.stringify({users:[
  {studentid:'S001',name:'小晴',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5A',language:'zh-HK'},
  {studentid:'S002',name:'阿樂',passwordhash:bcrypt.hashSync('test',4),role:'student',classname:'5B',language:'zh-HK'},
  {studentid:'T001',name:'老師',passwordhash:bcrypt.hashSync('test',4),role:'teacher',language:'zh-HK'}
],studentStats:[],questionLogs:[],_logId:0}));
process.env.BUIO_JSON_DB_FILE=dbFile;process.env.SUPABASE_DB_URL='';
const require=createRequire(import.meta.url),repo=require('../pet-app/repositories/pet.repo'),store=require('../db/jsonStore');
for(const id of ['S001','S002'])await repo.ensureStudent(id);const fixture=store.load();
for(const [index,id] of ['S001','S002'].entries()){const petId=randomUUID();fixture.petInstances.push({petId,studentId:id,speciesId:index?'pudding-pig':'starpatch-cat',xp:0,stage:1,dailyXp:0,dailyXpDate:'',equippedSkills:[],equippedWearables:[]});Object.assign(fixture.petProfiles.find(p=>p.studentId===id),{activePetId:petId,starterEggClaimed:true});fixture.petWallets.find(w=>w.studentId===id).balance=3500;}store.save();
const port=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const server=spawn(process.execPath,['server.js'],{cwd:path.resolve('.'),env:{...process.env,PORT:String(port),MOCK_AUTH:'0',NODE_ENV:'development',PET_APP_DIST_DIR:process.env.PET_APP_DIST_DIR||path.resolve('pet-app/dist')},stdio:['ignore','pipe','pipe']});
let logs='',browser,a,b,checks=[],errors=[],failures=[],pages=[];server.stdout.on('data',d=>logs+=d);server.stderr.on('data',d=>logs+=d);
const pass=label=>{checks.push(label);console.log('✓ '+label);};
const data=async()=>JSON.parse(await fs.readFile(dbFile,'utf8'));
const balances=async()=>{const d=await data();return ['S001','S002'].map(id=>d.petWallets.find(w=>w.studentId===id).balance);};
const state=p=>p.evaluate(()=>structuredClone(window.__petGame.scene.getScene('Brawl').runtime.state));
const openLobby=async p=>{await p.locator('[data-tab="brawl"]').click();await p.locator('[data-brawl="mode"][data-id="pvp"]').click();await p.locator('[data-brawl="invite"]').waitFor();};
const invite=async()=>{await a.locator('[data-brawl="invite"][data-target="S002"]').waitFor();await a.locator('[data-brawl="invite"][data-target="S002"]').click();await b.locator('[data-duel-action="accept"]').waitFor();};
const playReady=async p=>{await p.waitForFunction(()=>{const s=window.__petGame?.scene.keys.Brawl;return s?.sys.isActive()&&s.fx&&!document.querySelector('.brawl-loading')&&!document.querySelector('.pvp-wait');},{},{timeout:20000});await p.locator('[data-brawl="continue"]').click({timeout:500}).catch(()=>{});};
const lobbyAgain=async p=>{await p.locator('[data-brawl="again"]').click();await p.locator('[data-brawl="invite"]').waitFor();};
const shot=(p,name)=>p.screenshot({path:path.join(artifacts,name+'.png')});
try{
  const baseURL=`http://127.0.0.1:${port}`,deadline=Date.now()+20000;while(true){try{if((await fetch(baseURL+'/health')).ok)break;}catch{}if(Date.now()>deadline)throw new Error('Server startup timed out');await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true});const contexts=[];
  for(const [n,id] of ['S001','S002'].entries()){const ctx=await browser.newContext({baseURL,viewport:{width:n?1024:1280,height:n?768:900},hasTouch:true});assert.equal((await ctx.request.post('/api/auth/login',{data:{studentId:id,password:'test'}})).status(),200);contexts.push(ctx);const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!m.text().includes('net::ERR_FAILED'))errors.push(m.text());});p.on('requestfailed',r=>{if(!r.failure()?.errorText.includes('ERR_ABORTED'))failures.push(new URL(r.url()).pathname);});await p.goto('/pet');await p.locator('[data-tab="brawl"]').waitFor();pages.push(p);}[a,b]=pages;
  await openLobby(a);await a.locator('[data-brawl="fighter"][data-id="starpatch-cat"]').click();await a.locator('[data-brawl="invite"][data-target="S002"]:enabled').waitFor();assert.ok((await a.locator('#pvpPeers').innerText()).includes('阿樂'));assert.ok((await a.locator('#pvpPeers').innerText()).includes('5B'));await shot(a,'01-online-students');
  await invite();assert.equal(await b.locator('[data-tab="home"]').getAttribute('aria-current'),'page');await shot(b,'02-invitation-in-room-ipad');await b.locator('[data-duel-action="reject"]').click();await a.locator('.pvp-invite-card').waitFor({state:'detached'});assert.deepEqual(await balances(),[3500,3500]);assert.equal((await data()).petCurrencyLedger.filter(l=>l.kind==='brawl_duel_entry').length,0);
  pass('online students across classes, recipient room notification, rejection without either wallet being charged');

  await a.waitForTimeout(3100);await invite();await b.locator('[data-duel-action="accept"]').click();await Promise.all(pages.map(playReady));assert.deepEqual(await balances(),[3000,3000]);
  await a.waitForFunction(()=>document.querySelector('#coinBalance')?.textContent?.includes('3,000'));await b.waitForFunction(()=>document.querySelector('#coinBalance')?.textContent?.includes('3,000'));assert.equal(await a.locator('#brawlWave').innerText(),'同學對戰');assert.ok((await a.locator('.brawl-player-hud>b').innerText()).includes('星'));assert.ok((await b.locator('.brawl-player-hud>b').innerText()).includes('豬'));
  const before=await state(a);await a.keyboard.down('KeyD');await b.keyboard.down('KeyA');await a.waitForTimeout(900);await a.keyboard.up('KeyD');await b.keyboard.up('KeyA');await a.waitForTimeout(200);const moved=await state(a);assert.ok(moved.actors[0].x>before.actors[0].x+10000);assert.ok(moved.actors[1].x<before.actors[1].x-10000);
  await a.keyboard.down('KeyD');await a.waitForFunction(()=>window.__petGame.scene.getScene('Brawl').runtime.state.actors[1].x-window.__petGame.scene.getScene('Brawl').runtime.state.actors[0].x<7000);await a.keyboard.up('KeyD');await a.waitForTimeout(180);const hp=(await state(a)).actors[1].hp;await a.keyboard.press('KeyJ');await a.waitForTimeout(650);assert.ok((await state(b)).actors[1].hp<hp);await a.keyboard.press('KeyU');await a.waitForTimeout(500);assert.ok((await state(b)).actors[0].cooldowns[0]>0);await shot(a,'03-two-player-cat');await shot(b,'04-two-player-pig-ipad');
  // Touch control is routed to the receiving player's actor, including concurrent pointers.
  const stick=await b.locator('[data-stick]').boundingBox(),jump=await b.locator('[data-battle-key="32"]').boundingBox(),cdp=await contexts[1].newCDPSession(b),touchBefore=await state(b);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:stick.x+stick.width*.1,y:stick.y+stick.height/2},{id:2,x:jump.x+jump.width/2,y:jump.y+jump.height/2}]});await b.waitForTimeout(200);const touched=await state(b);assert.ok(touched.actors[1].x<touchBefore.actors[1].x);assert.ok(touched.actors[1].z>0);await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await shot(b,'05-ipad-multitouch');
  const matchId=await a.evaluate(()=>sessionStorage.getItem('pet-live-duel:S001'));await a.reload();await playReady(a);assert.equal(await a.evaluate(()=>sessionStorage.getItem('pet-live-duel:S001')),matchId);assert.deepEqual(await balances(),[3000,3000]);assert.equal((await data()).petCurrencyLedger.filter(l=>l.kind==='brawl_duel_entry').length,2);
  await a.keyboard.press('Escape');const tick=(await state(b)).tick;await b.waitForTimeout(250);assert.ok((await state(b)).tick>tick);await a.locator('[data-brawl="pvp-leave"]').click();await b.locator('[data-brawl="again"]').waitFor();assert.ok((await b.locator('#brawlDialogTitle').innerText()).includes('勝利'));assert.deepEqual(await balances(),[3000,3000]);await shot(b,'06-duel-victory');
  // Blurring a finished duel must leave its result visible, with no settlement request loop.
  await b.evaluate(()=>window.dispatchEvent(new Event('blur')));assert.ok((await b.locator('#brawlDialogTitle').innerText()).includes('勝利'));await Promise.all(pages.map(lobbyAgain));
  pass('both players enter, fees update onscreen, keyboard combat/skills, receiver multitouch, reload recovery, non-pausing menu and surrender result');

  await b.locator('[data-tab="home"]').click();await a.waitForTimeout(3100);await invite();await b.route('**/assets/art/brawl/**',route=>route.abort('failed'));await b.locator('[data-duel-action="accept"]').click();await Promise.all(pages.map(p=>p.locator('[data-brawl="again"]').waitFor({timeout:20000})));assert.deepEqual(await balances(),[3000,3000]);assert.equal((await data()).petCurrencyLedger.filter(l=>l.kind==='brawl_duel_refund').length,2);assert.ok((await b.locator('.brawl-modal').innerText()).includes('退回'));await shot(b,'07-preparation-refund');await b.unroute('**/assets/art/brawl/**');await Promise.all(pages.map(lobbyAgain));
  pass('actual asset-load failure cancels the match, refunds both fees and presents the refund result');
  assert.deepEqual(errors,[]);assert.ok(failures.every(url=>url.includes('/assets/art/brawl/')),JSON.stringify(failures));const report={pass:true,checks,errors,expectedFailedAssets:failures.length,browser:'Windows Chrome',viewports:[[1280,900],[1024,768]],postgresVerified:false,physicalIpadVerified:false};await fs.writeFile(path.join(artifacts,'browser-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await Promise.all(pages.map((p,n)=>shot(p,'failure-'+n).catch(()=>{})));console.error(JSON.stringify({pass:false,error:error.stack,errors,failures,logs:logs.slice(-2500)}));process.exitCode=1;}
finally{await browser?.close();server.kill();await fs.rm(temp,{recursive:true,force:true});}
