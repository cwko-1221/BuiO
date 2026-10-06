import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-pet-access-'));
const dbFile = path.join(temp, 'db.json');
const out = path.resolve(process.env.PET_ACCESS_OUT || 'artifacts/pet-playtest/access-lock');
await fs.mkdir(out, { recursive: true });
await fs.writeFile(dbFile, JSON.stringify({ users: [
  { studentid: 'S001', name: '小晴', role: 'student', classname: '5A', language: 'zh-HK', passwordhash: bcrypt.hashSync('test', 4) },
  { studentid: 'S002', name: '阿樂', role: 'student', classname: '5B', language: 'zh-HK', passwordhash: bcrypt.hashSync('test', 4) },
  { studentid: 'T001', name: '陳老師', role: 'teacher', language: 'zh-HK', passwordhash: bcrypt.hashSync('test', 4) },
], studentStats: [], questionLogs: [], _logId: 0 }));
process.env.BUIO_JSON_DB_FILE = dbFile; process.env.SUPABASE_DB_URL = '';
const require = createRequire(import.meta.url), pets = require('../pet-app/repositories/pet.repo'), store = require('../db/jsonStore');
for (const id of ['S001', 'S002']) await pets.ensureStudent(id);
const fixture = store.load();
for (const [index, id] of ['S001', 'S002'].entries()) {
  const petId = randomUUID(); fixture.petInstances.push({ petId, studentId: id, speciesId: index ? 'pudding-pig' : 'starpatch-cat', xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '', equippedSkills: [], equippedWearables: [] });
  Object.assign(fixture.petProfiles.find(r => r.studentId === id), { activePetId: petId, starterEggClaimed: true });
  fixture.petWallets.find(r => r.studentId === id).balance = 3000;
}
store.save();
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const baseURL = `http://127.0.0.1:${port}`, errors = [], checks = [], pages = [];
let server, browser, logs = '';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const pass = label => { checks.push(label); console.log('✓ ' + label); };
async function startServer() {
  server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env: { ...process.env, PORT: String(port), MOCK_AUTH: '0', NODE_ENV: 'development', PET_APP_DIST_DIR: process.env.PET_APP_DIST_DIR || path.resolve('pet-app/dist'), SESSION_SECRET: 'isolated-pet-access-browser-test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => logs += d); server.stderr.on('data', d => logs += d);
  const deadline = Date.now() + 20000;
  while (true) { try { if ((await fetch(baseURL + '/health')).ok) return; } catch {} if (Date.now() > deadline) throw new Error('Server startup timed out'); await pause(100); }
}
async function stopServer() { if (!server || server.exitCode !== null) return; const finished = new Promise(resolve => server.once('exit', resolve)); server.kill(); await finished; }
const data = async () => JSON.parse(await fs.readFile(dbFile, 'utf8'));
const balances = async () => (await data()).petWallets.sort((a, b) => a.studentId.localeCompare(b.studentId)).map(w => w.balance);
const shot = (p, name) => p.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
const tick = p => p.evaluate(() => window.__petGame?.scene.keys.Brawl?.runtime?.state.tick);
const arcadeSession = p => p.evaluate(() => new Promise((resolve,reject) => { const request=indexedDB.open('buio-pet-coin-pusher');request.onsuccess=()=>{const db=request.result,read=db.transaction('studentSessions').objectStore('studentSessions').get('S001');read.onsuccess=()=>{db.close();resolve(read.result);};read.onerror=()=>reject(read.error);};request.onerror=()=>reject(request.error); }));
const lockScreen = p => p.locator('.pet-access-overlay:not([hidden]) #petAccessTitle');
const lockPost = (context, body) => context.request.post('/api/pet/teacher/access', { data: body });
try {
  await startServer(); browser = await chromium.launch({ channel: 'chrome', headless: true });
  const contexts = [];
  for (const id of ['T001', 'S001', 'S002']) {
    const context = await browser.newContext({ baseURL, viewport: { width: 1194, height: 834 }, hasTouch: true, timezoneId: id === 'T001' ? 'America/New_York' : 'Asia/Hong_Kong' });
    assert.equal((await context.request.post('/api/auth/login', { data: { studentId: id, password: 'test' } })).status(), 200);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    contexts.push(context); pages.push(page); await page.goto('/pet');
  }
  const [tc, ac, bc] = contexts, [teacher, a, b] = pages;
  const anon = await browser.newContext({ baseURL });
  assert.equal((await anon.request.get('/api/pet/access')).status(), 401);
  assert.equal((await anon.request.get('/api/pet/teacher/access')).status(), 403);
  assert.equal((await lockPost(ac, { action: 'lock', classes: ['5B'] })).status(), 403);
  for (const bad of [{ action: 'lock', classes: ['fake'] }, { action: 'schedule', classes: ['5A'], startsAt: 'invalid', endsAt: null }, { action: 'lock', classes: [] }]) assert.equal((await lockPost(tc, bad)).status(), 400);
  pass('teacher-only controls, unauthenticated access denied, invalid classes and dates rejected');

  await teacher.locator('[data-teacher-tool="access"]').click();
  await teacher.locator('[data-access-class][value="5A"]').waitFor();
  await teacher.locator('.teacher-header').scrollIntoViewIfNeeded();await shot(teacher,'00-teacher-access-overview');
  await teacher.locator('[data-access-class][value="5A"]').check();
  await a.locator('[data-tab="brawl"]').click(); await a.locator('[data-brawl="mode"][data-id="practice"]').click();
  await a.locator('[data-brawl="start"]').first().click(); await a.waitForFunction(() => window.__petGame?.scene.keys.Brawl?.runtime?.state.tick > 5);
  await a.keyboard.down('KeyD');
  await teacher.locator('#petAccessDuration').selectOption('manual');
  await teacher.locator('#petAccessNote').fill('現在是數學課，請專心上課。');
  await teacher.locator('.pet-access-submit').click(); await teacher.locator('.pet-access-message').filter({ hasText: '已鎖定' }).waitFor();
  await lockScreen(a).waitFor(); assert.equal(await lockScreen(a).innerText(), '樂園休息中');
  assert.ok((await a.locator('.pet-access-lock-note').innerText()).includes('數學課'));
  assert.equal(await b.locator('.pet-access-overlay:not([hidden])').count(), 0);
  assert.equal(await a.locator('#app').evaluate(n => n.inert), true);
  const stopped = await tick(a); await a.keyboard.press('Escape'); await a.keyboard.press('KeyJ'); await a.keyboard.up('KeyD'); await pause(700); assert.equal(await tick(a), stopped);
  await shot(a, '01-student-lock-ipad-landscape'); await shot(teacher, '02-teacher-locked-ipad-landscape');
  await teacher.locator('.teacher-header').scrollIntoViewIfNeeded();
  await shot(teacher, '02b-teacher-lock-overview');
  const petId = fixture.petInstances.find(p => p.studentId === 'S001').petId;
  const denied = [
    ['get', '/api/pet/bootstrap'], ['get', '/api/pet/brawl/catalog'], ['get', '/api/pet/brawl/progress'], ['get', '/api/pet/rooms/class'],
    ['post', '/api/pet/starter-egg/hatch'], ['post', '/api/pet/eggs/purchase'], ['post', '/api/pet/shop/purchase'], ['post', '/api/pet/coin-pusher/play'], ['post', '/api/pet/coin-pusher/prizes'],
    ['post', `/api/pet/pets/${petId}/feed`], ['post', `/api/pet/pets/${petId}/activate`], ['put', `/api/pet/pets/${petId}/outfit`], ['put', '/api/pet/room'], ['post', '/api/pet/brawl/runs'], ['post', '/api/pet/brawl/access'],
  ];
  for (const [method, url] of denied) { const response = await ac.request[method](url, { data: { className: '5B', classes: ['5B'] } }); assert.equal(response.status(), 423, url); assert.equal((await response.json()).code, 'PET_APP_LOCKED'); }
  assert.equal((await ac.request.get('/api/pet/access?className=5B')).status(), 200);
  assert.equal((await (await ac.request.get('/api/pet/access?className=5B')).json()).access.className, '5A');
  assert.equal((await bc.request.get('/api/pet/bootstrap')).status(), 200);
  assert.deepEqual(await balances(), [3000, 3000]);
  pass('active practice freezes, keyboard cannot dismiss the lock, all student API surfaces block, other class stays open and wallets stay intact');
  await teacher.locator('#petAccessDuration').selectOption('15');await teacher.locator('.pet-access-submit').click();
  await teacher.waitForFunction(()=>document.querySelector('.pet-access-message')?.textContent.includes('已鎖定'));
  const changedDuration=await (await tc.request.get('/api/pet/teacher/access')).json();
  assert.ok(changedDuration.classes.find(c=>c.name==='5A').endsAt);assert.equal(changedDuration.rules.length,1);
  pass('changing an indefinite lock to a timed lock replaces its current interval');

  const lockedContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, storageState: await ac.storageState() });
  const lockedPage = await lockedContext.newPage(); pages.push(lockedPage); const opened = [];
  lockedPage.on('request', r => opened.push(new URL(r.url()).pathname));
  await lockedPage.goto('/pet'); await lockScreen(lockedPage).waitFor();
  assert.ok(!opened.includes('/api/pet/bootstrap')); assert.equal(await lockedPage.locator('[data-tab="home"]').count(), 0);
  await shot(lockedPage, '03-locked-on-entry-mobile');
  await teacher.locator('[data-access="unlock"]').click(); await a.locator('.pet-access-overlay').waitFor({ state: 'hidden' });
  await lockedPage.locator('[data-tab="home"]').waitFor();
  await a.locator('[data-brawl="continue"]').click(); await a.waitForFunction(before => window.__petGame.scene.keys.Brawl.runtime.state.tick > before, stopped);
  pass('locked page cannot bootstrap after reload; teacher unlock automatically restores access and saved practice can resume');

  // The teacher browser deliberately uses New York time. datetime-local still means Hong Kong.
  await teacher.locator('[name="accessMode"][value="schedule"]').check();
  const future = new Date(Date.now() + 8 * 3600000 + 20 * 60000).toISOString().slice(0, 16);
  const futureEnd = new Date(Date.now() + 8 * 3600000 + 50 * 60000).toISOString().slice(0, 16);
  await teacher.locator('#petAccessStartsAt').fill(future); await teacher.locator('#petAccessEndsAt').fill(futureEnd); await teacher.locator('.pet-access-submit').click();
  await teacher.locator('.pet-access-badge').filter({ hasText: '已預約' }).waitFor();
  const saved = (await data()).petAccessLocks.find(r => r.kind === 'schedule');
  assert.equal(saved.startsAt, new Date(future + ':00+08:00').toISOString());
  await shot(teacher, '04-teacher-reservation-hk-time');
  await teacher.setViewportSize({ width: 834, height: 1194 }); await shot(teacher, '05-teacher-ipad-portrait');
  await teacher.setViewportSize({ width: 390, height: 844 });
  assert.equal(await teacher.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const accessScroller = teacher.locator('#teacherAccessMain');
  const accessScrollMetrics = await accessScroller.evaluate((node) => ({ clientHeight: node.clientHeight, scrollHeight: node.scrollHeight }));
  assert.ok(accessScrollMetrics.scrollHeight > accessScrollMetrics.clientHeight, JSON.stringify(accessScrollMetrics));
  const accessScrollTop = await accessScroller.evaluate((node) => { node.scrollTop = node.scrollHeight; return node.scrollTop; });
  assert.ok(accessScrollTop > 0, `teacher access page did not scroll: ${accessScrollTop}`);
  const sizes = await teacher.locator('.pet-access-submit, .pet-access-unlock, [data-access="cancel"], .pet-access-class').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect().height));
  assert.ok(sizes.every(h => h >= 52), JSON.stringify(sizes)); await shot(teacher, '06-teacher-mobile');
  await teacher.locator('[data-access="cancel"]').click(); await teacher.locator('.pet-access-empty').waitFor();
  await teacher.setViewportSize({ width: 1194, height: 834 });
  pass('teacher schedule uses Hong Kong time even on another device timezone; cancellation and large controls work across iPad/mobile layouts');

  await a.keyboard.press('Escape'); await a.locator('[data-brawl="lobby"]').click(); await a.locator('[data-tab="home"]').click();
  const startsAt = new Date(Date.now() + 4000).toISOString(), endsAt = new Date(Date.now() + 14000).toISOString();
  assert.equal((await lockPost(tc, { action: 'schedule', classes: ['5A'], startsAt, endsAt, note: '預約上課時間' })).status(), 200);
  await lockScreen(a).waitFor({ timeout: 10000 });
  await stopServer(); await startServer();
  const accessAfterRestart = await (await ac.request.get('/api/pet/access')).json(); assert.equal(accessAfterRestart.access.locked, true);
  await a.reload(); await lockScreen(a).waitFor();
  await a.locator('[data-tab="home"]').waitFor({ timeout: 20000 });
  assert.equal((await (await ac.request.get('/api/pet/access')).json()).access.locked, false);
  pass('scheduled lock starts automatically, survives server restart, then expires and opens the student app automatically');

  await a.locator('[data-tab="coinPusher"]').click();
  await a.locator('[data-action="coin-pusher-drop"]:enabled').waitFor({timeout:30000});
  await a.locator('[data-action="coin-pusher-drop"]').click();
  await a.waitForTimeout(800);
  assert.equal((await data()).petCoinPusherPlays.length,1);
  assert.equal((await lockPost(tc,{action:'lock',classes:['5A'],note:'推銀機暫停'})).status(),200);
  await lockScreen(a).waitFor(); await a.waitForTimeout(200);
  const frozen=await arcadeSession(a);assert.ok(frozen.model.mechanismStarted);
  await a.keyboard.press('Space');await a.keyboard.press('Enter');await a.waitForTimeout(5500);
  const frozenLater=await arcadeSession(a);assert.equal(frozenLater.model.elapsed,frozen.model.elapsed);
  assert.deepEqual(frozenLater.model.coins,frozen.model.coins);
  assert.equal((await data()).petCoinPusherPlays.length,1);
  assert.equal((await lockPost(tc,{action:'unlock',classes:['5A']})).status(),200);
  await a.locator('.pet-access-overlay').waitFor({state:'hidden'});await a.waitForTimeout(5500);
  assert.ok((await arcadeSession(a)).model.elapsed>frozen.model.elapsed);
  assert.equal((await data()).petCoinPusherPlays.length,1);
  await a.locator('[data-action="coin-pusher-exit"]').click();
  pass('paid coin-pusher physics and its saved board freeze, retain the paid drop, resume after unlock and never charge an extra play');

  const duelBefore=await balances();
  await a.locator('[data-tab="brawl"]').click(); await a.locator('[data-brawl="mode"][data-id="pvp"]').click();
  await a.locator('[data-brawl="invite"][data-target="S002"]:enabled').waitFor(); await a.locator('[data-brawl="invite"][data-target="S002"]').click();
  await b.locator('[data-duel-action="accept"]').click();
  await Promise.all([a, b].map(p => p.waitForFunction(() => window.__petGame?.scene.keys.Brawl?.runtime?.state.tick > 5 && !document.querySelector('.pvp-wait'), {}, { timeout: 20000 })));
  assert.deepEqual(await balances(), duelBefore.map(v=>v-500));
  assert.equal((await lockPost(tc, { action: 'lock', classes: ['5A'], note: '下課了，請離開樂園。' })).status(), 200);
  await lockScreen(a).waitFor(); await b.locator('#brawlDialogTitle').filter({ hasText: '已取消' }).waitFor();
  assert.ok((await b.locator('.brawl-modal').innerText()).includes('入場費已退回'));
  assert.deepEqual(await balances(), duelBefore);
  const d = await data(); assert.equal(d.petBrawlDuels.find(r => r.reason === 'pet_app_locked')?.refunded, true);
  assert.equal(d.petCurrencyLedger.filter(r => r.kind === 'brawl_duel_refund').length, 2);
  await shot(b, '07-duel-cancel-refund');
  assert.equal((await lockPost(tc, { action: 'unlock', classes: ['5A'] })).status(), 200);
  await a.locator('.pet-access-overlay').waitFor({state:'hidden'});
  await a.waitForFunction(balance=>Number(document.querySelector('#coinBalance').textContent.replaceAll(',',''))===balance,duelBefore[0]);
  pass('locking either player cancels a live paid duel and refunds exactly 500 coins to each player');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ pass: true, checks, errors, browser: 'Chrome', physicalIpadVerified: false, postgresVerified: false }, null, 2));
} catch (error) {
  await Promise.all(pages.map((p, i) => shot(p, 'failure-' + i).catch(() => {})));
  await fs.writeFile(path.join(out, 'failure.txt'), error.stack + '\n' + logs.slice(-7000)); throw error;
} finally { await browser?.close(); await stopServer(); await fs.rm(temp, { recursive: true, force: true }); }
