import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
import { OBJECTS, dailyQuests, interactionPoint, WORLD } from '../pet-app/lib/park-world.mjs';

const smoke = process.argv.includes('--smoke');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-park-live-'));
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || 'artifacts/pet-playtest/outdoor-park'); await fs.mkdir(output, { recursive: true });
const dbFile = path.join(temp, 'db.json'), passwordhash = bcrypt.hashSync('test', 4);
const users = [
  { studentid: 'S001', name: '小晴', role: 'student', classname: '5A' },
  { studentid: 'S002', name: '阿樂', role: 'student', classname: '5A' },
  { studentid: 'S003', name: '小悠', role: 'student', classname: '5B' },
  { studentid: 'T001', name: '老師', role: 'teacher' },
  { studentid: 'S004', name: '未分班甲', role: 'student', classname: '' },
  { studentid: 'S005', name: '未分班乙', role: 'student', classname: '' },
  ...Array.from({ length: 28 }, (_, i) => ({ studentid: `P${String(i + 1).padStart(3, '0')}`, name: `樂園同學${i + 1}`, role: 'student', classname: '5A' })),
].map(user => ({ ...user, language: 'zh-HK', passwordhash }));
await fs.writeFile(dbFile, JSON.stringify({ users, studentStats: [], questionLogs: [], _logId: 0 }));
process.env.BUIO_JSON_DB_FILE = dbFile; process.env.SUPABASE_DB_URL = '';
const require = createRequire(import.meta.url), pets = require('../pet-app/repositories/pet.repo'), store = require('../db/jsonStore');
const catalog = require('../pet-app/lib/catalog').catalog;
const outfit = catalog.wearables.find(item => item.id.startsWith('head-') && catalog.redrawnWearables?.[`starpatch-cat:1:${item.id}`]);
for (const [i, user] of users.filter(user => user.role === 'student').entries()) {
  await pets.ensureStudent(user.studentid); const data = store.load(), petId = randomUUID();
  const equippedWearables = user.studentid === 'S001' && outfit ? [outfit.id] : [];
  data.petInstances.push({ petId, studentId: user.studentid, speciesId: i % 2 ? 'pudding-pig' : 'starpatch-cat', xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '', equippedSkills: [], equippedWearables });
  for (const id of equippedWearables) data.petInventory.push({ studentId: user.studentid, itemId: id, quantity: 1 });
  Object.assign(data.petProfiles.find(p => p.studentId === user.studentid), { activePetId: petId, starterEggClaimed: true });
  data.petWallets.find(w => w.studentId === user.studentid).balance = 100;
}
store.save();
const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env: { ...process.env, PORT: String(port), MOCK_AUTH: '0', NODE_ENV: 'development', PET_APP_DIST_DIR: path.resolve(process.env.PET_APP_TEST_DIST || 'pet-app/dist') }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser, pages = [], contexts = [], checks = [], errors = [], metrics = {};
server.stdout.on('data', data => logs += data); server.stderr.on('data', data => logs += data);
const pass = label => { checks.push(label); console.log('✓ ' + label); };
const shot = (page, name) => page.screenshot({ path: path.join(output, name + '.png') });
const request = (page, event, body) => page.evaluate(({ event, body }) => window.__petPark.client.request(event, body), { event, body });
const ready = page => page.waitForFunction(() => window.__petPark?.client.ready && window.__petPark?.scene?.sys.isActive() && window.__petPark.scene.actors.size > 0 && document.querySelector('[data-park-loading]')?.hidden, {}, { timeout: 30000 });
const walk = async (page, id) => {
  await page.evaluate(id => { document.querySelector('[data-park="close"]')?.click(); window.__petPark.scene.walkToObject(id); }, id);
  const point = interactionPoint(OBJECTS.find(object => object.id === id));
  await page.waitForFunction(({ x, y }) => { const park = window.__petPark, p = park?.client.frames.get(park.client.selfId); return p && !p.moving && Math.hypot(p.x - x, p.y - y) < 135; }, point, { timeout: 45000 });
  await page.waitForFunction(() => !window.__petPark.busy, {}, { timeout: 15000 });
};
try {
  const baseURL = `http://127.0.0.1:${port}`, deadline = Date.now() + 25000;
  while (true) { try { if ((await fetch(baseURL + '/health')).ok) break; } catch {} if (Date.now() > deadline) throw Error('Server startup timed out'); await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [index, id] of ['S001', 'S002', 'S003', 'T001'].entries()) {
    const context = await browser.newContext({ baseURL, viewport: index === 1 ? { width: 1024, height: 768 } : { width: 1365, height: 900 }, hasTouch: index === 1 });
    assert.equal((await context.request.post('/api/auth/login', { data: { studentId: id, password: 'test' } })).status(), 200);
    contexts.push(context); const page = await context.newPage(); pages.push(page); page.on('pageerror', error => errors.push(error.stack || error.message));
    await page.addInitScript(() => { const remove = Storage.prototype.removeItem; Storage.prototype.removeItem = function(key) { if (String(key).startsWith('pet-park-open:')) (window.__parkStorageTrace ||= []).push(new Error().stack); return remove.call(this, key); }; });
    await page.goto('/pet'); await page.locator(index === 3 ? '[data-teacher-tool="park"]' : '[data-tab="park"]').waitFor();
  }
  const [a, b, c, teacher] = pages;
  await a.waitForFunction(() => window.__petGame?.scene.getScene('Bedroom')?.sys.isActive());
  await shot(a, '01-bedroom-exit');
  const bounds = await a.locator('#game-root canvas').boundingBox();
  await a.mouse.click(bounds.x + bounds.width * 1120 / 1280, bounds.y + bounds.height * 555 / 720);
  await a.waitForFunction(() => window.__petPark || window.__petGame?.scene.getScene('Bedroom')?.exitPending, {}, { timeout: 3000 });
  await ready(a); await b.locator('[data-tab="park"]').click(); await ready(b); await c.locator('[data-tab="park"]').click(); await ready(c);
  await a.waitForFunction(() => window.__petPark.client.peers.some(p => p.id === 'S002'));
  await a.waitForFunction(() => !!window.__petPark.scene.actors.get('S002')?.avatar.sprite, {}, { timeout: 15000 });
  if (outfit) { await b.waitForFunction(() => !!window.__petPark.scene.actors.get('S001')?.avatar.sprite); assert.deepEqual(await b.evaluate(() => window.__petPark.client.peers.find(p => p.id === 'S001').pet.equippedWearables), [outfit.id]); }
  assert.deepEqual((await a.evaluate(() => window.__petPark.client.peers.map(p => p.id))).sort(), ['S001', 'S002']);
  assert.deepEqual(await c.evaluate(() => window.__petPark.client.peers.map(p => p.id)), ['S003']);
  const before = await a.evaluate(() => window.__petPark.client.frames.get('S001'));
  await a.keyboard.down('KeyD'); await a.waitForTimeout(700); await a.keyboard.up('KeyD');
  await b.waitForFunction(x => window.__petPark.client.frames.get('S001')?.x > x + 100, before.x);
  await a.locator('[data-park="emotes"]').click(); await a.locator('[data-park="emote"][data-emote="hello"]').click();
  await b.waitForFunction(() => window.__petPark.client.frames.get('S001')?.emote === 'hello');
  await shot(a, '02-home-lane-desktop'); await shot(b, '03-two-pets-ipad');
  pass('walk through the bedroom exit, same-class live pets, cross-class isolation, keyboard movement and shared greetings');
  // A move target is not a client-supplied position: a distant interaction must fail.
  const invalid = await a.evaluate(async () => { try { await window.__petPark.client.request('park:begin', { objectId: 'deer' }); return false; } catch { return true; } }); assert.equal(invalid, true);
  assert.equal((await contexts[0].request.put('/api/pet/teacher/park/settings', { data: { dailyCap: 50 } })).status(), 403);
  await a.locator('[data-park="quests"]').first().click(); await shot(a, '04-daily-requests'); await a.locator('.park-drawer [data-park="close"]').click();
  await teacher.locator('[data-teacher-tool="park"]').click(); await teacher.locator('#teacherParkMain input:not(:disabled)').waitFor();
  await teacher.locator('#teacherParkMain input').fill('50'); await teacher.locator('#teacherParkMain [type="submit"]').click();
  await teacher.waitForFunction(() => document.querySelector('#teacherParkMain [role="status"]')?.textContent?.includes('已儲存')); await shot(teacher, '05-teacher-limit');
  pass('daily request UI, distant-interaction rejection and teacher-only daily reward settings');
  assert.equal(await a.evaluate(() => sessionStorage.getItem('pet-park-open:S001')), '1');
  await a.reload(); await ready(a); pass('refresh returns directly to the outdoor park');
  const scopeContext = await browser.newContext({ baseURL }), scopePage = await scopeContext.newPage();
  await scopePage.goto('/health'); await scopePage.addScriptTag({ url: baseURL + '/socket.io/socket.io.js' });
  for (const id of ['S004', 'S005']) {
    assert.equal((await scopeContext.request.post('/api/auth/login', { data: { studentId: id, password: 'test' } })).status(), 200);
    const peers = await scopePage.evaluate(() => new Promise((resolve, reject) => { const socket = window.io('/pet-park', { forceNew: true, transports: ['websocket'] }); (window.scopeSockets ||= []).push(socket); socket.on('connect', () => socket.emit('park:join', {}, result => result.success ? resolve(result.peers.map(p => p.id)) : reject(Error(result.message)))); socket.on('connect_error', reject); }));
    assert.deepEqual(peers, [id]);
  }
  await scopePage.waitForTimeout(2600); assert.equal(await scopePage.evaluate(() => window.scopeSockets.every(socket => socket.connected)), true);
  await scopeContext.close(); pass('unassigned students keep separate private parks through periodic access checks');
  if (!smoke) {
    const day = await a.evaluate(() => window.__petPark.progress.day), daily = dailyQuests(day);
    for (const quest of daily) {
      await walk(a, quest.npc); await a.locator(`[data-park="accept"][data-quest="${quest.id}"]`).click();
      await a.waitForFunction(id => !!window.__petPark.progress.quests[id], quest.id); await a.locator('.park-dialog-close').click();
      for (const step of quest.steps) { await walk(a, step); await a.waitForFunction(({ id, step }) => window.__petPark.progress.quests[id]?.steps.includes(step), { id: quest.id, step }); if (await a.locator('.park-dialog').count()) await a.locator('.park-dialog-close').click(); }
      await walk(a, quest.npc); await a.waitForFunction(id => !!window.__petPark.progress.quests[id]?.completedAt, quest.id);
      await shot(a, `request-${quest.id}-complete`); await a.locator('.park-dialog-close').click();
    }
    const expected = daily.reduce((sum, q) => sum + q.reward, 5), saved = await a.evaluate(() => window.__petPark.progress);
    assert.equal(saved.earned, expected); assert.equal(saved.bonusClaimed, true);
    assert.equal((await (await contexts[0].request.get('/api/pet/bootstrap')).json()).wallet.balance, 100 + expected);
    await walk(a, daily[0].npc); await a.locator('.park-dialog-close').click();
    assert.equal((await (await contexts[0].request.get('/api/pet/bootstrap')).json()).wallet.balance, 100 + expected);
    await a.reload(); await ready(a); assert.equal(await a.evaluate(() => window.__petPark.progress.earned), expected);
    await a.evaluate(() => window.__petPark.client.socket.disconnect());
    await a.locator('[data-park="retry"]').waitFor({ state: 'visible' }); await a.locator('[data-park="retry"]').click(); await ready(a);
    assert.equal(await a.evaluate(() => window.__petPark.progress.earned), expected);
    pass('complete all three real walking routes, NPC acceptance and hand-in, daily bonus, repeat claim rejection, refresh and reconnect recovery');
    await a.locator('[data-park="map"]').click(); await a.locator('[data-park="zone"][data-zone="plaza"]').click();
    await a.waitForFunction(() => { const p = window.__petPark.client.frames.get('S001'); return p && !p.moving && Math.hypot(p.x - 3290, p.y - 2660) < 20; }, {}, { timeout: 45000 });
    await shot(a, '06-plaza-desktop');
    // Independent socket clients use real student cookies, sharing one browser renderer for the load test.
    const loadContext = await browser.newContext({ baseURL }); const loadPage = await loadContext.newPage();
    await loadPage.goto('/health'); await loadPage.addScriptTag({ url: baseURL + '/socket.io/socket.io.js' });
    for (let i = 1; i <= 28; i++) {
      assert.equal((await loadContext.request.post('/api/auth/login', { data: { studentId: `P${String(i).padStart(3, '0')}`, password: 'test' } })).status(), 200);
      await loadPage.evaluate(() => new Promise((resolve, reject) => { const socket = window.io('/pet-park', { forceNew: true, transports: ['websocket'] }); (window.parkLoadSockets ||= []).push(socket); socket.on('connect', () => socket.emit('park:join', {}, result => result.success ? resolve(result.self.id) : reject(Error(result.message)))); socket.on('connect_error', reject); }));
    }
    await a.waitForFunction(() => window.__petPark.client.peers.length === 30);
    await b.waitForFunction(() => window.__petPark.scene.actors.size === 30, {}, { timeout: 30000 });
    await loadPage.evaluate(() => { for (const socket of window.parkLoadSockets) socket.emit('park:input', { mask: 2 }); });
    await b.waitForTimeout(350); await loadPage.evaluate(() => { for (const socket of window.parkLoadSockets) socket.emit('park:input', { mask: 0 }); });
    metrics = await b.evaluate(() => ({ peers: window.__petPark.client.peers.length, actors: window.__petPark.scene.actors.size, fps: Math.round(window.__petPark.game.loop.actualFps), viewport: [innerWidth, innerHeight] }));
    await shot(b, '07-thirty-pets-ipad'); await loadContext.close();
    pass('30 authenticated same-class students share authoritative world frames and render in the iPad viewport');
    await b.locator('[data-park="map"]').click(); await b.locator('[data-park="zone"][data-zone="garden"]').click();
    await b.waitForFunction(() => { const p = window.__petPark.client.frames.get('S002'); return p && !p.moving && Math.hypot(p.x - 3680, p.y - 1200) < 20; }, {}, { timeout: 45000 }); await shot(b, '08-garden-ipad');
    const stick = await b.locator('[data-park-stick]').boundingBox(); const original = await b.evaluate(() => window.__petPark.client.frames.get('S002'));
    await b.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2); await b.mouse.down(); await b.mouse.move(stick.x + stick.width * .85, stick.y + stick.height / 2); await b.waitForTimeout(650); await b.mouse.up();
    assert.ok((await b.evaluate(() => window.__petPark.client.frames.get('S002'))).x > original.x + 70);
    await b.setViewportSize({ width: 390, height: 844 }); await b.waitForTimeout(500); await shot(b, '09-phone-portrait');
    assert.ok((await b.locator('.park-canvas canvas').boundingBox()).height > 300);
    assert.ok(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    pass('touch joystick, garden district, portrait phone resize and playfield layout');
    assert.equal((await contexts[3].request.post('/api/pet/teacher/access', { data: { action: 'lock', classes: ['5A'], endsAt: null, note: '上課了' } })).status(), 200);
    await a.waitForFunction(() => !window.__petPark?.client.ready); await b.waitForFunction(() => !window.__petPark?.client.ready);
    await a.locator('.pet-access-overlay').waitFor({ state: 'visible' }); assert.equal(await c.evaluate(() => window.__petPark.client.ready), true);
    await shot(a, '10-teacher-lock');
    assert.equal((await contexts[3].request.post('/api/pet/teacher/access', { data: { action: 'unlock', classes: ['5A'] } })).status(), 200);
    await ready(a); await ready(b);
    assert.equal(await a.evaluate(() => window.__petPark.progress.earned), expected);
    await a.locator('[data-park="home"]').first().click(); await a.waitForFunction(() => !window.__petPark && window.__petGame?.scene.getScene('Bedroom')?.sys.isActive());
    assert.equal(await a.locator('#park-root').isHidden(), true); await shot(a, '11-back-home');
    pass('teacher lock stops the selected class, other class keeps playing, unlock restores progress, and the home button restores the bedroom');
  }
  assert.deepEqual(errors, []);
  const report = { pass: true, smoke, checks, errors, metrics, browser: 'Windows Chrome', physicalIpadVerified: false, productionPostgresVerified: false };
  await fs.writeFile(path.join(output, smoke ? 'smoke-report.json' : 'browser-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) {
  const states = await Promise.all(pages.map(page => page.evaluate(() => { const p = window.__petPark; return { park: !!p, ready: p?.client.ready, sceneReady: p?.sceneReady, actors: p?.scene?.actors.size, sceneActive: p?.scene?.sys.isActive(), restore: sessionStorage.getItem('pet-park-open:S001'), storageTrace: window.__parkStorageTrace, status: document.querySelector('[data-park-loading-message]')?.textContent, body: document.body.innerText.slice(-1000) }; }).catch(() => null)));
  await Promise.all(pages.map((page, i) => shot(page, 'failure-' + i).catch(() => {})));
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack, errors, states, logs: logs.slice(-6000) }, null, 2));
  console.error(JSON.stringify({ error: error.stack, errors, states })); process.exitCode = 1;
} finally {
  await browser?.close(); server.kill();
  if (path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('buio-park-live-')) await fs.rm(temp, { recursive: true, force: true });
}
