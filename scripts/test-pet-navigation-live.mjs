import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const port = await new Promise(resolve => {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
});
const baseURL = `http://127.0.0.1:${port}`;
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-pet-navigation-'));
const databaseFile = path.join(directory, 'db.json');
const artifacts = path.resolve(process.env.PET_NAV_TEST_OUTPUT || 'artifacts/pet-navigation');
await fs.mkdir(artifacts, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({ users: [
  { studentid: 'NAVZH', name: '導覽測試', role: 'student', language: 'zh-HK', classname: '5A', passwordhash: bcrypt.hashSync('navigation123', 4) },
  { studentid: 'NAVEN', name: 'Navigation test', role: 'student', language: 'en-US', classname: '5A', passwordhash: bcrypt.hashSync('navigation123', 4) },
] }));
const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve('.'), windowsHide: true,
  env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: databaseFile, MOCK_AUTH: '0', NODE_ENV: 'development', SUPABASE_DB_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '', browser;
server.stdout.on('data', chunk => logs += chunk); server.stderr.on('data', chunk => logs += chunk);
const errors = [], results = [];
const viewports = [
  { width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 768, height: 1024 },
  { width: 720, height: 900 }, { width: 700, height: 900 }, { width: 600, height: 900 },
  { width: 480, height: 800 }, { width: 430, height: 932 }, { width: 390, height: 844 },
  { width: 375, height: 667 }, { width: 360, height: 640 }, { width: 320, height: 568 },
  { width: 844, height: 390 }, { width: 667, height: 375 }, { width: 568, height: 320 },
];
const capture = new Set([1440, 1024, 768, 390, 320, 844, 667, 568]);
const tabs = ['home', 'coast', 'collection', 'shop', 'realShop', 'coinPusher', 'brawl', 'visit', 'settings'];
try {
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(`${baseURL}/health`)).ok) break; } catch {}
    if (n === 99) throw new Error('Fixture server failed to start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const [studentId, locale] of [['NAVZH', 'zh-HK'], ['NAVEN', 'en-US']]) {
    const context = await browser.newContext({ baseURL, viewport: viewports[0], reducedMotion: 'reduce' });
    assert.equal((await context.request.post('/api/auth/login', { data: { studentId, password: 'navigation123' } })).status(), 200);
    assert.equal((await context.request.post('/api/pet/starter-egg/hatch', { headers: { 'Idempotency-Key': `hatch-${studentId}` }, data: {} })).status(), 201);
    for (const url of ['/api/pet/park/state', '/pet/park-3d-qa/', '/pet/assets/art/park/wish-plaza-v1/ground-v1-644668151f96.webp', '/pet/assets/art/park/island-v1/grass-d5bb82ad4fcc.webp']) {
      assert.equal((await context.request.get(url)).status(), 404, url);
    }
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(id => sessionStorage.setItem('pet-park-open:' + id, '1'), studentId);
    await page.goto('/pet'); await page.locator('.pet-nav button').first().waitFor();
    await page.waitForFunction(() => window.__petGame?.scene.isActive('Bedroom'));
    assert.equal(await page.locator('[data-tab="home"][aria-current="page"]').count(), 1);
    assert.equal(await page.evaluate(() => window.__petGame.textures.exists('park:room-exit')), false);
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      const state = await page.locator('.pet-nav').evaluate(nav => {
        const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
        const buttons = [...nav.querySelectorAll('button')].map(button => {
          const icon = button.querySelector('.icon'), label = button.querySelector('.pet-nav-label') || button.lastElementChild;
          const r = rect(button), hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
          return { tab: button.dataset.tab, rect: r, label: rect(label), labelText: label.textContent,
            labelVisible: getComputedStyle(label).display !== 'none', labelOverflow: label.scrollWidth > label.clientWidth + 1,
            iconVisible: getComputedStyle(icon).display !== 'none' && rect(icon).width > 0 && rect(icon).height > 0,
            clickable: hit === button || button.contains(hit) };
        });
        return { rect: rect(nav), width: nav.clientWidth, contentWidth: nav.scrollWidth, mainHeight: document.querySelector('#petMain').getBoundingClientRect().height, buttons };
      });
      const label = `${locale} ${viewport.width}x${viewport.height}`;
      try {
        assert.deepEqual(state.buttons.map(button => button.tab), tabs, label);
        assert.ok(state.contentWidth <= state.width + 1, `${label}: all buttons must fit without horizontal scrolling`);
        assert.ok(state.rect.bottom <= viewport.height + 1 && state.mainHeight >= 100, `${label}: navigation must stay in the viewport and leave room for the pet`);
        for (const button of state.buttons) {
          const r = button.rect, text = button.label;
          assert.ok(r.width >= 44 && r.height >= 44, `${label} ${button.tab}: touch target must be at least 44px`);
          assert.ok(r.x >= -1 && r.right <= viewport.width + 1 && r.y >= state.rect.y - 1 && r.bottom <= state.rect.bottom + 1, `${label} ${button.tab}: button is clipped`);
          assert.ok(button.iconVisible && button.labelVisible && button.clickable, `${label} ${button.tab}: icon, label and hit target must all be visible`);
          assert.ok(!button.labelOverflow && text.x >= r.x - 1 && text.right <= r.right + 1 && text.y >= r.y - 1 && text.bottom <= r.bottom + 1, `${label} ${button.tab}: full label must fit inside its button`);
        }
        for (let a = 0; a < state.buttons.length; a++) for (let b = a + 1; b < state.buttons.length; b++) {
          const one = state.buttons[a].rect, two = state.buttons[b].rect;
          const gapX = Math.max(two.x - one.right, one.x - two.right), gapY = Math.max(two.y - one.bottom, one.y - two.bottom);
          assert.ok(gapX >= 3.5 || gapY >= 3.5, `${label}: buttons must stay separated`);
        }
      } catch (error) {
        await page.screenshot({ path: path.join(artifacts, `failure-${locale}-${viewport.width}x${viewport.height}.png`) });
        throw error;
      }
      const rows = new Set(state.buttons.map(button => Math.round(button.rect.y))).size;
      results.push({ locale, ...viewport, rows, navigationHeight: Math.round(state.rect.height), allVisible: true });
      if (capture.has(viewport.width)) await page.screenshot({ path: path.join(artifacts, `${locale}-${viewport.width}x${viewport.height}.png`) });
      if ([1024, 390, 667].includes(viewport.width)) {
        for (const tab of ['realShop', 'collection', 'settings', 'home']) {
          await page.locator(`.pet-nav [data-tab="${tab}"]`).click();
          await page.waitForFunction(tab => document.querySelector(`.pet-nav [data-tab="${tab}"]`)?.getAttribute('aria-current') === 'page', tab);
        }
      }
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ passed: true, configurations: results.length, results }, null, 2));
  console.log(`Pet navigation passed: ${results.length} Chinese/English layouts, ${tabs.length} visible destinations, and a working room without the retired map.`);
} catch (error) { console.error(logs.split('\n').filter(line => /\[pet\]|Error:/.test(line)).slice(-10).join('\n')); throw error; }
finally {
  await browser?.close(); server.kill();
  if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('buio-pet-navigation-')) await fs.rm(directory, { recursive: true, force: true });
}
