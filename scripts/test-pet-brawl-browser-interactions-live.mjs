import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
import { INPUT as I } from '../pet-app/lib/brawl/catalog.mjs';

const root = path.resolve('.');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-brawl-input-qa-'));
const databaseFile = path.join(temp, 'db.json');
const artifacts = path.resolve(process.env.PET_PLAYTEST_DIR || 'tmp/brawl-browser-interactions');
await fs.mkdir(artifacts, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({
  users: [{ studentid: 'S001', name: '手勢測試', passwordhash: bcrypt.hashSync('test', 4), role: 'student', classname: '5A', language: 'zh-HK' }],
  studentStats: [], questionLogs: [], _logId: 0,
}));
process.env.BUIO_JSON_DB_FILE = databaseFile;
process.env.SUPABASE_DB_URL = '';
const require = createRequire(import.meta.url);
const repo = require('../pet-app/repositories/pet.repo.js');
const store = require('../db/jsonStore.js');
await repo.ensureStudent('S001');
const fixture = store.load(), petId = randomUUID();
fixture.petInstances.push({ petId, studentId: 'S001', speciesId: 'pudding-pig', xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '', equippedSkills: [], equippedWearables: [] });
Object.assign(fixture.petProfiles[0], { activePetId: petId, starterEggClaimed: true });
store.save();
const port = await new Promise(resolve => {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1', () => { const port = listener.address().port; listener.close(() => resolve(port)); });
});
const baseURL = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), MOCK_AUTH: '1', NODE_ENV: 'development', PET_APP_DIST_DIR: process.env.PET_APP_DIST_DIR || path.join(root, 'pet-app/dist') },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '', browser, page;
server.stdout.on('data', data => logs += data);
server.stderr.on('data', data => logs += data);
const errors = [], devices = [];
const wait = async (fn, label, timeout = 30000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(label);
};
const battleState = () => page.evaluate(() => structuredClone(window.__petGame.scene.getScene('Brawl').runtime.state));
const dimensions = () => page.evaluate(() => ({ scale: visualViewport.scale, width: innerWidth, dpr: devicePixelRatio }));
const gestureContract = () => page.evaluate(() => {
  const target = document.querySelector('.brawl-player-hud');
  const fire = (type, properties = {}) => {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, properties); target.dispatchEvent(event); return event.defaultPrevented;
  };
  return {
    blocked: ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart', 'dragstart'].every(type => fire(type)),
    pinch: fire('touchmove', { touches: [{}, {}] }),
    touchAction: getComputedStyle(document.querySelector('#playSurface')).touchAction,
    userSelect: getComputedStyle(target).userSelect,
  };
});
try {
  await wait(async () => { try { return (await fetch(baseURL + '/health')).ok; } catch { return false; } }, 'server boot');
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const [name, viewport, mobile] of [
    ['desktop', { width: 1440, height: 900 }, false],
    ['ipad-landscape', { width: 1024, height: 768 }, true],
    ['phone-landscape', { width: 844, height: 390 }, true],
  ]) {
    const context = await browser.newContext({ baseURL, viewport, hasTouch: true, isMobile: mobile });
    await context.request.post('/api/auth/login', { data: { studentId: 'S001', password: 'test' } });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/pet');
    const originalViewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    await page.locator('[data-tab="brawl"]').click();
    await page.locator('[data-brawl="mode"][data-id="practice"]').click();
    const start = async () => {
      await page.locator('[data-brawl="start"]').first().click();
      await page.waitForFunction(() => window.__petGame?.scene.isActive('Brawl') && !document.querySelector('.brawl-loading'));
    };
    await start();
    assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'), /maximum-scale=1/);
    assert.deepEqual(await gestureContract(), { blocked: true, pinch: true, touchAction: 'none', userSelect: 'none' });
    const cdp = await context.newCDPSession(page);
    const hud = await page.locator('.brawl-player-hud > b').boundingBox();
    const x = Math.round(hud.x + hud.width / 2), y = Math.round(hud.y + hud.height / 2);
    const normal = await dimensions();
    await page.mouse.dblclick(x, y);
    await page.touchscreen.tap(x, y); await page.touchscreen.tap(x, y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(900);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.send('Input.synthesizePinchGesture', { x: Math.round(viewport.width / 2), y: Math.round(viewport.height / 2), scaleFactor: 1.6, gestureSourceType: 'touch' });
    await page.mouse.move(x, y); await page.keyboard.down('Control'); await page.mouse.wheel(0, -500); await page.keyboard.up('Control');
    await page.keyboard.press('Control+Equal');
    assert.deepEqual(await dimensions(), normal, 'double-tap, pinch and wheel/keyboard gestures cannot zoom');
    assert.equal(await page.evaluate(() => getSelection().toString()), '', 'long press does not select HUD text');

    const before = await battleState();
    await page.keyboard.down('KeyD'); await page.waitForTimeout(150); await page.keyboard.up('KeyD');
    assert.ok((await battleState()).actors[0].x > before.actors[0].x, 'keyboard movement is preserved');
    const stick = await page.locator('[data-stick]').boundingBox();
    const jump = await page.locator(`[data-battle-key="${I.JUMP}"]`).boundingBox();
    const touchBefore = await battleState();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [
      { id: 1, x: stick.x + stick.width * .8, y: stick.y + stick.height / 2 },
      { id: 2, x: jump.x + jump.width / 2, y: jump.y + jump.height / 2 },
    ] });
    await page.waitForTimeout(160);
    const touched = await battleState();
    assert.ok(touched.actors[0].x > touchBefore.actors[0].x, 'multi-finger joystick movement works');
    assert.ok(touched.actors[0].z > 1000, 'second finger can jump while the joystick is held');
    await page.screenshot({ path: path.join(artifacts, `${name}.png`), scale: 'css' });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.waitForTimeout(850);
    const stopped = (await battleState()).actors[0].x;
    await page.waitForTimeout(100);
    assert.equal((await battleState()).actors[0].x, stopped, 'cancelling touches releases movement');
    const attack = await page.locator(`[data-battle-key="${I.ATTACK}"]`).boundingBox();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: attack.x + attack.width / 2, y: attack.y + attack.height / 2 }] });
    await page.waitForTimeout(900);
    assert.match((await battleState()).actors[0].action, /attack/, 'long-held attack still runs combos');
    assert.equal(await page.locator('.brawl-attack.held').count(), 1);
    assert.equal(await page.evaluate(() => getSelection().toString()), '');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await page.locator('.brawl-attack.held').count(), 0, 'attack releases normally');

    await page.keyboard.press('Escape');
    await page.locator('.brawl-modal').waitFor();
    assert.equal(await page.locator('.brawl-modal').evaluate(node => getComputedStyle(node).userSelect), 'none');
    assert.equal(await page.locator('[data-brawl="continue"]').evaluate(node => getComputedStyle(node).touchAction), 'none', 'iPad menu styles cannot re-enable pinch');
    const paused = (await battleState()).tick;
    await page.waitForTimeout(100);
    assert.equal((await battleState()).tick, paused);
    await page.locator('[data-brawl="lobby"]').click();
    await page.locator('.brawl-fighter').first().waitFor();
    assert.equal(await page.locator('meta[name="viewport"]').getAttribute('content'), originalViewport, 'lobby restores the viewport');
    assert.equal(await page.locator('html.brawl-input-locked').count(), 0);
    await start();
    assert.equal(await page.locator('html.brawl-input-locked').count(), 1, 're-entering installs the lock again');
    await page.keyboard.press('Escape');
    await page.locator('[data-brawl="lobby"]').click();
    await page.locator('[data-tab="home"]').click();
    await page.waitForFunction(() => window.__petGame.scene.isActive('Bedroom'));
    assert.equal(await page.locator('meta[name="viewport"]').getAttribute('content'), originalViewport);
    const restored = await page.evaluate(() => {
      const event = new Event('gesturestart', { bubbles: true, cancelable: true });
      document.querySelector('.pet-shell').dispatchEvent(event);
      return { blocked: event.defaultPrevented, userSelect: getComputedStyle(document.querySelector('.pet-topbar')).userSelect };
    });
    assert.equal(restored.blocked, false, 'exiting removes the gesture listeners');
    assert.notEqual(restored.userSelect, 'none', 'bedroom text can be selected again');
    devices.push({ name, nativeZoomBlocked: true, longPressSelectionBlocked: true, multiTouchWorks: true, heldAttackWorks: true, pageRestored: true });
    console.log(`✓ ${name}: gestures blocked, controls preserved, exit restored`);
    await context.close();
  }
  assert.deepEqual(errors, []);
  const report = { pass: true, devices, errors, physicalIpadVerified: false };
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  await page?.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
  console.error(JSON.stringify({ pass: false, error: error.stack, errors, logs: logs.slice(-1500) }));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server.exitCode === null && !server.killed) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill(); await exited;
  }
  await fs.rm(temp, { recursive: true, force: true });
}
