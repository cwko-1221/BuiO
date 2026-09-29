import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const root = path.resolve('.');
const require = createRequire(path.join(root, 'pet-app/package.json'));
const { createServer } = require('vite');
const port = await new Promise(resolve => { const listener = net.createServer(); listener.listen(0, '127.0.0.1', () => { const port = listener.address().port; listener.close(() => resolve(port)); }); });
const baseURL = `http://127.0.0.1:${port}`;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-pusher-teacher-qa-'));
const databaseFile = path.join(temp, 'db.json');
const artifacts = path.resolve(process.env.PET_PLAYTEST_DIR || 'tmp/coin-pusher-teacher-settings-qa');
await fs.mkdir(artifacts, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({
  users: ['T001','S001','S002','S003'].map(studentid => ({ studentid, name: studentid === 'T001' ? '老師測試' : '學生測試', passwordhash: bcrypt.hashSync('test',4), role: studentid === 'T001' ? 'teacher' : 'student', classname: studentid === 'S002' ? '6B' : '5A', language: 'zh-HK' })),
  studentStats: [], questionLogs: [], _logId: 0,
  petArcadePrizes: ['S001','S002','S003'].map(studentId => ({ studentId, state: { issued: 1000000, prizes: [] } })),
}));
let server, logs = '', browser, vite, page;
const bootServer = () => {
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: databaseFile, MOCK_AUTH: '0', NODE_ENV: 'development', SUPABASE_DB_URL: '' }, stdio: ['ignore','pipe','pipe'] });
  server.stdout.on('data', data => logs += data); server.stderr.on('data', data => logs += data);
};
const wait = async (fn, label, timeout = 30000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve,100)); } throw new Error(label); };
const health = async () => { try { return (await fetch(baseURL + '/health')).ok; } catch { return false; } };
const login = async (context, studentId) => assert.equal((await context.request.post('/api/auth/login', { data: { studentId, password: 'test' } })).status(),200);
const errors = [], devices = [];
bootServer();
try {
  await wait(health,'server boot');
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  vite = await createServer({ root: path.join(root,'pet-app'), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', ssr: { noExternal: ['@dimforge/rapier3d'] } });
  const { CoinPusherModel } = await vite.ssrLoadModule('/src/game/CoinPusherModel.ts');
  const dimensions = await vite.ssrLoadModule('/src/game/CoinPusherDimensions.ts');
  const model = new CoinPusherModel();
  for (const coin of [...model.coins]) model.removeCoin(coin);
  const empty = model.createSnapshot();
  for (const x of [-.8,0,.8]) {
    const id = model.dropCoin(x), coin = model.coins.find(coin => coin.id === id);
    coin.body.setTranslation({ x, y: .25, z: dimensions.PAYOUT_TRAY_CENTER_Z },true);
    coin.body.setLinvel({ x: 0, y: 0, z: 0 },true);
  }
  const catches = model.createSnapshot(); model.destroy();

  const oldBudgets = new Map();
  for (const studentId of ['S001','S002','S003']) {
    const old = await browser.newContext({baseURL}); await login(old,studentId);
    await old.request.post('/api/pet/dev/unlimited-money');
    const play = await (await old.request.post('/api/pet/coin-pusher/play',{headers:{'Idempotency-Key':randomUUID()},data:{}})).json();
    assert.equal(play.rewardPerCoin,1); oldBudgets.set(studentId,play.playId); await old.close();
  }

  const teacher = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  await login(teacher,'T001'); page = await teacher.newPage();
  page.on('pageerror',error => errors.push(error.message));
  await page.route('**/api/pet/teacher/coin-pusher/settings', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'load failure fixture' }) }), { times: 1 });
  await page.goto('/pet'); await page.locator('[data-teacher-tool="arcade"]').click();
  await page.locator('#retryCoinPusherSettings').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#saveCoinPusherSettings').isDisabled(),true,'unavailable setting must not present a false default');
  await page.locator('#retryCoinPusherSettings').click();
  await wait(async () => await page.locator('#coinPusherRewardPerCoin').isEnabled(),'retry settings load');
  assert.equal(await page.locator('#coinPusherRewardPerCoin').inputValue(),'1');
  for (const invalid of ['0','101','1.5']) {
    await page.locator('#coinPusherRewardPerCoin').fill(invalid);
    assert.equal(await page.locator('#coinPusherRewardPerCoin').evaluate(node => node.validity.valid),false);
  }
  await page.locator('#coinPusherRewardPerCoin').fill('7'); await page.locator('#saveCoinPusherSettings').click();
  await wait(async () => (await page.locator('#coinPusherSettingsStatus').innerText()).includes('已儲存'),'settings saved');
  const readSettings = async () => (await (await teacher.request.get('/api/pet/teacher/coin-pusher/settings')).json());
  assert.equal((await readSettings()).rewardPerCoin,7);
  for (const [name,viewport] of [['desktop',{width:1440,height:900}],['ipad-landscape',{width:1180,height:820}],['phone',{width:390,height:844}]]) {
    await page.setViewportSize(viewport);
    const tab = await page.locator('[data-teacher-tool="arcade"]').boundingBox();
    assert.ok(tab.x >= 0 && tab.x + tab.width <= viewport.width,'teacher tabs fit viewport');
    await page.locator('#saveCoinPusherSettings').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts,`teacher-${name}.png`),scale:'css' });
  }
  await page.locator('[data-teacher-tool="coins"]').click(); assert.equal(await page.locator('#teacherCoinMain').isVisible(),true,'grant tool unaffected');
  await page.locator('[data-teacher-tool="quiet"]').click(); assert.equal(await page.locator('#teacherQuietMain').isVisible(),true,'quiet room tool unaffected');
  await page.locator('[data-teacher-tool="arcade"]').click(); assert.equal(await page.locator('#coinPusherRewardPerCoin').inputValue(),'7');

  const seed = async (p,studentId,model,plays,pendingPayouts=[]) => p.evaluate(async ({studentId,model,plays,pendingPayouts}) => new Promise((resolve,reject) => {
    const request=indexedDB.open('buio-pet-coin-pusher',1); request.onupgradeneeded=()=>request.result.createObjectStore('studentSessions',{keyPath:'studentId'});request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result,tx=db.transaction('studentSessions','readwrite');tx.objectStore('studentSessions').put({version:1,studentId,updatedAt:Date.now(),model,plays,payoutSequence:0,pendingPayouts});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};
  }),{studentId,model,plays,pendingPayouts});
  const open = async p => { await p.goto('/pet'); await p.locator('[data-tab="coinPusher"]').click(); await wait(async()=>await p.locator('#coin-pusher-root').getAttribute('aria-busy')==='false','cabinet ready'); };
  const plays = [];
  for (const [index,[name,viewport]] of [['desktop',{width:1440,height:900}],['ipad-landscape',{width:1180,height:820}],['phone',{width:390,height:844}]].entries()) {
    const studentId=`S00${index+1}`, context=await browser.newContext({baseURL,viewport,hasTouch:true,isMobile:index>0});
    await login(context,studentId); page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{window.__rewardLabels=[];new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof HTMLElement&&node.classList.contains('coin-pusher-reward-fly'))window.__rewardLabels.push(node.textContent);}).observe(document,{subtree:true,childList:true});});
    await context.request.post('/api/pet/dev/unlimited-money');
    await page.goto('/pet');await page.locator('[data-action="hatch"]').click();await page.locator('.reveal-card').waitFor();
    const response=await context.request.post('/api/pet/coin-pusher/play',{headers:{'Idempotency-Key':randomUUID()},data:{rewardPerCoin:999}});
    assert.equal(response.status(),200);const play=await response.json();assert.equal(play.rewardPerCoin,7);plays.push({studentId,playId:play.playId});
    const balance=async()=>(await(await context.request.get('/api/pet/bootstrap')).json()).wallet.balance;
    const before=await balance();await seed(page,studentId,catches,[{playId:oldBudgets.get(studentId),remaining:100},{playId:play.playId,remaining:100}]);
    await open(page);await wait(async()=>(await balance())===before+21,'three physical catches credit 3 x 7');
    await wait(async()=>await page.evaluate(()=>window.__rewardLabels.filter(label=>label==='+7').length===3),'three +7 wallet animations');
    await page.screenshot({path:path.join(artifacts,`student-${name}.png`),scale:'css'});
    assert.equal(await page.locator('html').evaluate(node=>node.classList.contains('coin-pusher-input-locked')),true,'native zoom/selection lock remains active');
    assert.equal((await context.request.put('/api/pet/teacher/coin-pusher/settings',{data:{rewardPerCoin:100}})).status(),403,'student cannot change rewards');
    assert.equal((await context.request.get('/api/pet/teacher/coin-pusher/settings')).status(),403);
    devices.push({name,physicalCatches:3,walletReward:21,animation:'+7',teacherOnly:true});await context.close();
  }
  // A committed event and a durable uncommitted event both retain the original
  // authorized rate when the teacher changes the school setting.
  assert.equal((await teacher.request.put('/api/pet/teacher/coin-pusher/settings',{data:{rewardPerCoin:2}})).status(),200);
  const replay=await browser.newContext({baseURL,viewport:{width:1440,height:900}});await login(replay,'S001');page=await replay.newPage();
  const oldPlay=plays[0].playId,pending={playId:oldPlay,amount:1,eventId:randomUUID(),requestKey:randomUUID()};
  await page.goto('/health');await seed(page,'S001',empty,[{playId:oldPlay,remaining:97}],[pending]);
  const before=(await(await replay.request.get('/api/pet/bootstrap')).json()).wallet.balance;
  await open(page);await wait(async()=>(await(await replay.request.get('/api/pet/bootstrap')).json()).wallet.balance===before+7,'pending reward keeps old rate');
  const oldEvent=(await(await replay.request.post('/api/pet/coin-pusher/payout',{headers:{'Idempotency-Key':pending.requestKey},data:pending})).json());assert.equal(oldEvent.earned,7);
  const fresh=(await(await replay.request.post('/api/pet/coin-pusher/play',{headers:{'Idempotency-Key':randomUUID()},data:{}})).json());assert.equal(fresh.rewardPerCoin,2);
  const credited=await replay.request.post('/api/pet/coin-pusher/payout',{headers:{'Idempotency-Key':randomUUID()},data:{playId:fresh.playId,eventId:randomUUID(),amount:1,rewardPerCoin:999}});assert.equal((await credited.json()).earned,2);
  await teacher.request.put('/api/pet/teacher/coin-pusher/settings',{data:{rewardPerCoin:3}});
  await wait(async()=>await page.locator('.coin-pusher-drop').isEnabled(),'live setting drop ready');
  const paidResponse=page.waitForResponse(response=>response.url().endsWith('/api/pet/coin-pusher/play')&&response.request().method()==='POST');
  await page.locator('.coin-pusher-drop').click();assert.equal((await(await paidResponse).json()).rewardPerCoin,3,'already-open cabinet picks up the new setting on its next paid drop');
  await wait(async()=>(await page.locator('#coinPusherSystemStatus').innerText()).includes('+3'),'HUD reflects authoritative new-drop rate');
  await teacher.request.put('/api/pet/teacher/coin-pusher/settings',{data:{rewardPerCoin:2}});
  for(const value of [0,101,1.5,'7',null,true])assert.equal((await teacher.request.put('/api/pet/teacher/coin-pusher/settings',{data:{rewardPerCoin:value}})).status(),400);
  await replay.close();await teacher.close();

  // Only restart the isolated child created by this script; never the user's localhost.
  const exited=new Promise(resolve=>server.once('exit',resolve));server.kill();await exited;bootServer();await wait(health,'isolated restart');
  const restarted=await browser.newContext({baseURL});await login(restarted,'T001');
  assert.equal((await(await restarted.request.get('/api/pet/teacher/coin-pusher/settings')).json()).rewardPerCoin,2,'setting survives server restart');
  const data=JSON.parse(await fs.readFile(databaseFile,'utf8'));assert.ok(data.petCurrencyLedger.filter(row=>row.kind==='coin_pusher_payout').every(row=>row.delta===row.metadata.caughtCoins*row.metadata.rewardPerCoin));
  assert.deepEqual(errors,[]);
  const report={pass:true,devices,pendingRatePreserved:true,restartPersistence:true,errors};await fs.writeFile(path.join(artifacts,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await restarted.close();
} catch(error) {
  await page?.screenshot({path:path.join(artifacts,'failure.png')}).catch(()=>{});console.error(JSON.stringify({pass:false,error:error.stack,errors,logs:logs.slice(-1500)}));process.exitCode=1;
} finally {await browser?.close();await vite?.close();if(server&&!server.killed)server.kill();}
