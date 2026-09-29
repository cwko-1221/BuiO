import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const root = path.resolve('.');
const require = createRequire(path.join(root, 'pet-app/package.json'));
const { createServer } = require('vite');
const port = await new Promise(resolve => {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1', () => { const port = listener.address().port; listener.close(() => resolve(port)); });
});
const baseURL = `http://127.0.0.1:${port}`;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-pusher-input-qa-'));
const databaseFile = path.join(temp, 'db.json');
const artifacts = path.resolve(process.env.PET_PLAYTEST_DIR || 'tmp/coin-pusher-browser-interactions');
await fs.mkdir(artifacts, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({
  users: [{ studentid: 'S001', name: '手勢測試', passwordhash: bcrypt.hashSync('test', 4), role: 'student', classname: '5A', language: 'en-US' }],
  studentStats: [], questionLogs: [], _logId: 0,
  petArcadePrizes: [{ studentId: 'S001', state: { issued: 1000000, prizes: [] } }],
}));
const server = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: databaseFile, MOCK_AUTH: '1', NODE_ENV: 'development', SUPABASE_DB_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '', browser, vite, page;
server.stdout.on('data', data => logs += data);
server.stderr.on('data', data => logs += data);
const wait = async (fn, label, timeout = 30000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 100)); }
  throw new Error(label);
};
const errors = [], report = [];
try {
  await wait(async () => { try { return (await fetch(baseURL + '/health')).ok; } catch { return false; } }, 'server boot');
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  vite = await createServer({ root: path.join(root, 'pet-app'), server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', ssr: { noExternal: ['@dimforge/rapier3d'] } });
  const { CoinPusherModel } = await vite.ssrLoadModule('/src/game/CoinPusherModel.ts');
  const model = new CoinPusherModel();
  for (const coin of [...model.coins]) model.removeCoin(coin);
  const emptyBoard = model.createSnapshot(); model.destroy();
  for (const [name, viewport, mobile] of [
    ['desktop', { width: 1440, height: 900 }, false],
    ['ipad-landscape', { width: 1180, height: 820 }, true],
    ['phone', { width: 390, height: 844 }, true],
  ]) {
    const context = await browser.newContext({ baseURL, viewport, hasTouch: true, isMobile: mobile });
    await context.request.get('/api/auth/me');
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/pet');
    if (name === 'desktop') {
      await context.request.post('/api/pet/dev/unlimited-money');
      await page.reload();
      await page.locator('[data-action="hatch"]').click();
      await page.locator('.reveal-card').waitFor();
      await page.reload();
    }
    const originalViewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    await page.evaluate(async model => new Promise((resolve, reject) => {
      const request = indexedDB.open('buio-pet-coin-pusher', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('studentSessions', { keyPath: 'studentId' });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction('studentSessions', 'readwrite');
        tx.objectStore('studentSessions').put({ version: 1, studentId: 'S001', updatedAt: Date.now(), model, plays: [], payoutSequence: 0, pendingPayouts: [] });
        tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => reject(tx.error);
      };
    }), emptyBoard);
    const balance = async () => (await (await context.request.get('/api/pet/bootstrap')).json()).wallet.balance;
    const before = await balance();
    await page.locator('[data-tab="coinPusher"]').click();
    await page.waitForFunction(() => document.documentElement.classList.contains('coin-pusher-input-locked'));
    assert.match(await page.locator('meta[name="viewport"]').getAttribute('content'), /maximum-scale=1/);
    await wait(async () => await page.locator('#coin-pusher-root').getAttribute('aria-busy') === 'false', 'cabinet ready');
    const contract = await page.evaluate(() => {
      const target = document.querySelector('.coin-pusher-hud');
      const fire = (type, properties = {}) => {
        const event = new Event(type, { bubbles: true, cancelable: true });
        for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value });
        target.dispatchEvent(event); return event.defaultPrevented;
      };
      const style = getComputedStyle(target);
      return {
        blocked: ['gesturestart', 'gesturechange', 'gestureend', 'dblclick', 'contextmenu', 'selectstart', 'dragstart'].every(type => fire(type)),
        pinch: fire('touchmove', { touches: [{}, {}] }),
        singleTouch: fire('touchmove', { touches: [{}] }),
        ctrlWheel: fire('wheel', { ctrlKey: true }), plainWheel: fire('wheel'),
        ctrlPlus: fire('keydown', { key: '+', ctrlKey: true }), metaMinus: fire('keydown', { key: '-', metaKey: true }),
        userSelect: style.userSelect, touchAction: style.touchAction,
        canvasTouchAction: getComputedStyle(document.querySelector('#coin-pusher-root canvas')).touchAction,
      };
    });
    assert.equal(contract.blocked, true); assert.equal(contract.pinch, true);
    assert.equal(contract.ctrlWheel, true); assert.equal(contract.ctrlPlus, true); assert.equal(contract.metaMinus, true);
    assert.equal(contract.singleTouch, false); assert.equal(contract.plainWheel, false);
    assert.equal(contract.userSelect, 'none'); assert.equal(contract.touchAction, 'pan-x pan-y'); assert.equal(contract.canvasTouchAction, 'none');

    const cdp = await context.newCDPSession(page);
    const hud = await page.locator('.coin-pusher-brand strong').boundingBox();
    assert.ok(hud, 'title visible');
    const x = Math.round(hud.x + hud.width / 2), y = Math.round(hud.y + hud.height / 2);
    const dimensions = () => page.evaluate(() => ({ scale: visualViewport.scale, width: innerWidth, dpr: devicePixelRatio }));
    const normal = await dimensions();
    await page.mouse.move(x, y); await page.keyboard.down('Control'); await page.mouse.wheel(0, -500); await page.keyboard.up('Control');
    await page.keyboard.press('Control+Equal'); await page.keyboard.press('Control+Minus'); await page.keyboard.press('Control+0');
    await page.touchscreen.tap(x, y); await page.touchscreen.tap(x, y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await page.waitForTimeout(800);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.send('Input.synthesizePinchGesture', { x: Math.round(viewport.width / 2), y: Math.round(viewport.height / 2), scaleFactor: 1.6, gestureSourceType: 'touch' });
    await page.waitForTimeout(200);
    assert.deepEqual(await dimensions(), normal, 'wheel, keyboard, double-tap and native pinch cannot zoom');
    assert.equal(await page.evaluate(() => getSelection().toString()), '', 'long press does not select text');
    assert.equal(await balance(), before, 'zoom/tap/long-press gestures do not spend coins');

    await page.locator('.coin-pusher-collection').click();
    await page.locator('.coin-pusher-collection-modal').waitFor();
    assert.equal(await page.locator('.coin-pusher-collection-modal').evaluate(node => getComputedStyle(node).userSelect), 'none', 'dialogs cannot be selected either');
    await page.keyboard.press('Escape');
    await wait(async () => await page.locator('#modalRoot').innerHTML() === '', 'close collection');

    // Preserve the normal drop button, keyboard and one-finger swipe exactly once each.
    let drops = 0;
    page.on('request', request => { if (request.url().endsWith('/api/pet/coin-pusher/play') && request.method() === 'POST') drops++; });
    await page.locator('.coin-pusher-drop').click();
    await wait(() => drops === 1, 'button drop');
    await wait(async () => await page.locator('.coin-pusher-drop').isEnabled(), 'keyboard drop ready');
    await page.locator('#coin-pusher-root canvas').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Space');
    await wait(() => drops === 2, 'keyboard drop');
    await wait(async () => await page.locator('.coin-pusher-drop').isEnabled(), 'swipe drop ready');
    const canvas = await page.locator('#coin-pusher-root canvas').boundingBox();
    const cx = Math.round(canvas.x + canvas.width * .5), cy = Math.round(canvas.y + canvas.height * .75);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy + 100, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(() => drops === 3, 'swipe drop');
    await wait(async () => (await balance()) === before - 3, 'three inputs cost one coin each');
    await page.screenshot({ path: path.join(artifacts, `${name}.png`), scale: 'css' });

    await page.locator('.coin-pusher-back').click();
    await page.waitForFunction(() => !document.documentElement.classList.contains('coin-pusher-input-locked'));
    assert.equal(await page.locator('meta[name="viewport"]').getAttribute('content'), originalViewport, 'bedroom viewport restored exactly');
    const restored = await page.evaluate(async () => {
      const target = document.querySelector('.pet-shell');
      const gesture = new Event('gesturestart', { bubbles: true, cancelable: true }); target.dispatchEvent(gesture);
      const menu = new Event('contextmenu', { bubbles: true, cancelable: true }); target.dispatchEvent(menu);
      const range = document.createRange(); range.selectNodeContents(document.querySelector('.pet-topbar'));
      getSelection().addRange(range); await new Promise(resolve => setTimeout(resolve, 50));
      const selected = !!getSelection().toString(); getSelection().removeAllRanges();
      return { gesture: gesture.defaultPrevented, menu: menu.defaultPrevented, selected };
    });
    assert.deepEqual(restored, { gesture: false, menu: false, selected: true }, 'bedroom native interaction restored');
    await page.locator('[data-tab="coinPusher"]').click();
    await wait(async () => await page.locator('#coin-pusher-root').getAttribute('aria-busy') === 'false', 're-enter cabinet');
    assert.equal(await page.locator('html').evaluate(node => node.classList.contains('coin-pusher-input-locked')), true);
    await page.locator('.coin-pusher-back').click();
    assert.equal(await page.locator('meta[name="viewport"]').getAttribute('content'), originalViewport, 'repeat exit does not leak locks');
    report.push({ name, nativeZoomBlocked: true, longPressSelectionBlocked: true, paidInputs: drops, bedroomRestored: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  const result = { pass: true, devices: report, errors };
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  await page?.screenshot({ path: path.join(artifacts, 'failure.png') }).catch(() => {});
  console.error(JSON.stringify({ pass: false, error: error.stack, errors, logs: logs.slice(-1500) })); process.exitCode = 1;
} finally {
  await browser?.close(); await vite?.close(); if (!server.killed) server.kill();
}
