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
import { OBJECTS, PLAZA_TREES, interactionPoint, walkable } from '../pet-app/lib/park-world.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-park-art-'));
const output = path.resolve('artifacts/pet-playtest/full-park-v1');
await fs.mkdir(output, { recursive: true });
process.env.BUIO_JSON_DB_FILE = path.join(temp, 'db.json'); process.env.SUPABASE_DB_URL = '';
const users = ['S001', 'S002'].map((studentid, i) => ({ studentid, name: i ? '阿樂' : '小晴', role: 'student', classname: '5A', language: 'zh-HK', passwordhash: bcrypt.hashSync('test', 4) }));
await fs.writeFile(process.env.BUIO_JSON_DB_FILE, JSON.stringify({ users, studentStats: [], questionLogs: [], _logId: 0 }));
const require = createRequire(import.meta.url), pets = require('../pet-app/repositories/pet.repo'), park = require('../pet-app/repositories/park.repo'), store = require('../db/jsonStore');
const catalog = require('../pet-app/lib/catalog').catalog;
const wearable = catalog.wearables.find(item => item.id.startsWith('head-') && catalog.redrawnWearables?.[`starpatch-cat:1:${item.id}`]);
for (const [i, user] of users.entries()) {
  await pets.ensureStudent(user.studentid);
  const data = store.load(), petId = randomUUID(), equippedWearables = !i && wearable ? [wearable.id] : [];
  data.petInstances.push({ petId, studentId: user.studentid, speciesId: i ? 'pudding-pig' : 'starpatch-cat', xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '', equippedSkills: [], equippedWearables });
  for (const itemId of equippedWearables) data.petInventory.push({ studentId: user.studentid, itemId, quantity: 1 });
  Object.assign(data.petProfiles.find(p => p.studentId === user.studentid), { activePetId: petId, starterEggClaimed: true });
  data.petWallets.find(w => w.studentId === user.studentid).balance = 100; store.save();
  await park.savePosition(user.studentid, i ? { x: 3280, y: 2800 } : { x: 3370, y: 2730 });
}
const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env: { ...process.env, PORT: String(port), MOCK_AUTH: '0', NODE_ENV: 'development', PET_APP_DIST_DIR: path.resolve(process.env.PET_APP_TEST_DIST || 'pet-app/dist') }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser; const errors = [], checks = [], requests = new Set(), pages = [];
server.stdout.on('data', d => logs += d); server.stderr.on('data', d => logs += d);
const ready = page => page.waitForFunction(() => window.__petPark?.client.ready && window.__petPark?.scene?.actors.size === 2 && document.querySelector('[data-park-loading]')?.hidden, {}, { timeout: 30000 });
const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`) });
const move = async (page, x, y) => {
  await page.evaluate(({ x, y }) => { document.querySelector('[data-park="close"]')?.click(); window.__petPark.scene.walk(x, y); }, { x, y });
  await page.waitForFunction(({ x, y }) => { const p = window.__petPark.client.frames.get(window.__petPark.client.selfId); return p && !p.moving && Math.hypot(p.x - x, p.y - y) < 20; }, { x, y }, { timeout: 20000 });
  await page.waitForTimeout(400);
};
const interact = async (page, id) => {
  const point = interactionPoint(OBJECTS.find(o => o.id === id));
  await move(page, point.x, point.y);
  await page.evaluate(id => window.__petPark.scene.walkToObject(id), id);
  await page.waitForTimeout(120);
  await page.waitForFunction(() => !window.__petPark.busy, {}, { timeout: 10000 });
};
try {
  const baseURL = `http://127.0.0.1:${port}`, deadline = Date.now() + 25000;
  while (true) { try { if ((await fetch(baseURL + '/health')).ok) break; } catch {} if (Date.now() > deadline) throw Error('server startup timeout'); await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [i, user] of users.entries()) {
    const context = await browser.newContext({ baseURL, viewport: i ? { width: 1024, height: 768 } : { width: 1440, height: 960 }, hasTouch: !!i });
    assert.equal((await context.request.post('/api/auth/login', { data: { studentId: user.studentid, password: 'test' } })).status(), 200);
    const page = await context.newPage(); pages.push(page);
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (/\/park\/(?:wish-plaza|full-park)-v1\//.test(r.url())) { requests.add(r.url().split('/').at(-1)); if (r.status() >= 400) errors.push('asset HTTP ' + r.status()); } });
    await page.goto('/pet'); await page.locator('[data-tab="park"]').click();
    await page.waitForFunction(() => window.__petPark?.client.ready && document.querySelector('[data-park-loading]')?.hidden, {}, { timeout: 30000 });
  }
  const [a, b] = pages; await ready(a); await ready(b);
  assert.deepEqual(errors, []);
  assert.equal(await a.evaluate(() => ['ground', 'tree', 'fountain', 'bear', 'board', 'bench', 'chime', 'drum', 'bell'].every(key => window.__petPark.scene.textures.exists('park:plaza:' + key))), true);
  await a.waitForTimeout(1000); await shot(a, '01-plaza-desktop'); await shot(b, '02-plaza-ipad');
  assert.equal(requests.size, 33); checks.push('all 33 finished art assets load, two equipped pets share the real multiplayer scene');
  await interact(a, 'bear'); await a.locator('.park-dialog').waitFor(); await shot(a, '03-keeper-dialog');
  assert.ok(await a.locator('.park-npc-portrait.has-art canvas').count());
  await a.locator('.park-dialog-close').click();
  await interact(a, 'board'); await a.locator('.park-drawer').waitFor(); await a.locator('.park-drawer [data-park="close"]').click();
  for (const id of ['chime', 'drum', 'bell', 'fountain']) await interact(a, id);
  checks.push('keeper conversation uses the new portrait; noticeboard, instruments and fountain remain reachable and interactive');
  const fountain = OBJECTS.find(o => o.id === 'fountain');
  await move(a, fountain.x - 280, fountain.y); await move(a, fountain.x + 280, fountain.y);
  assert.equal(walkable(fountain.x, fountain.y), false);
  await move(a, fountain.x + 25, fountain.y + 145); await shot(a, '04-fountain-front');
  assert.equal(await a.evaluate(() => window.__petPark.scene.actors.get('S001').avatar.depth > 2780), true);
  await move(a, fountain.x + 25, fountain.y - 145); await shot(a, '05-fountain-back');
  assert.equal(await a.evaluate(() => window.__petPark.scene.actors.get('S001').avatar.depth < 2780), true);
  const tree = PLAZA_TREES[0];
  await move(a, tree.x + 88, tree.y + 78); await shot(a, '06-tree-front');
  await move(a, tree.x + 88, tree.y - 95); await shot(a, '07-tree-back');
  await b.waitForFunction(x => Math.abs(window.__petPark.client.frames.get('S001').x - x) < 20, tree.x + 88);
  checks.push('server paths route around the fountain; real pets sort in front of and behind the independent fountain and oak sprites');
  await move(a, 3370, 2730); await a.setViewportSize({ width: 390, height: 844 }); await a.waitForTimeout(600); await shot(a, '08-phone');
  assert.ok(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await a.setViewportSize({ width: 1440, height: 960 }); await a.waitForTimeout(600); await shot(a, '09-final-desktop');
  const near = (x, y) => { for (const [dx, dy] of [[0, 0], [64, 0], [-64, 0], [0, 64], [0, -64]]) if (walkable(x + dx, y + dy)) return { x: x + dx, y: y + dy }; throw Error('No clear tour point'); };
  const go = async (page, x, y) => { const p = near(x, y); await move(page, p.x, p.y); };
  await go(a, 1120, 2810); await go(b, 1250, 2860); await shot(a, '10-home-desktop');
  await interact(a, 'post'); await a.locator('.park-dialog').waitFor(); assert.ok(await a.locator('.park-npc-portrait.has-art canvas').count()); await shot(a, '11-post-bunny'); await a.locator('.park-dialog-close').click();
  await go(a, 2450, 2470); await shot(a, '12-home-plaza-crossing');
  await go(a, 3690, 1935); await shot(a, '13-plaza-garden-crossing');
  await go(a, 3680, 1200); await go(b, 3770, 1270); await shot(a, '14-garden-desktop'); await shot(b, '15-garden-ipad');
  await interact(a, 'deer'); await a.locator('.park-dialog').waitFor(); assert.ok(await a.locator('.park-npc-portrait.has-art canvas').count()); await shot(a, '16-gardener'); await a.locator('.park-dialog-close').click();
  for (const id of ['flowers-a', 'flowers-b', 'flowers-c', 'pond', 'apple']) await interact(a, id);
  await go(a, 2440, 1140); await shot(a, '17-garden-forest-crossing');
  await go(a, 1570, 1150); await go(b, 1670, 1210); await shot(a, '18-forest-desktop');
  await interact(a, 'squirrel'); await a.locator('.park-dialog').waitFor(); assert.ok(await a.locator('.park-npc-portrait.has-art canvas').count()); await shot(a, '19-explorer'); await a.locator('.park-dialog-close').click();
  for (const id of ['hollow', 'mushrooms', 'acorn-a', 'litter-a', 'log']) await interact(a, id);
  await a.locator('[data-park="map"]').click(); await shot(a, '20-illustrated-map'); await a.locator('.park-drawer [data-park="close"]').click();
  await go(b, 1120, 2810); await b.setViewportSize({ width: 390, height: 844 }); await b.waitForTimeout(500); await shot(b, '21-home-phone');
  assert.ok(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await b.locator('[data-park="home"]').first().click(); await b.waitForFunction(() => !window.__petPark && window.__petGame?.scene.getScene('Bedroom')?.sys.isActive()); await shot(b, '22-bedroom-portal-phone');
  checks.push('all four finished districts connect through real server paths; new NPC portraits, flower beds, lily pond, apple tree, hollow, mushrooms and collectibles work; illustrated map and garden doorway render');
  const metrics = await a.evaluate(() => ({ fps: Math.round(window.__petPark.game.loop.actualFps), actors: window.__petPark.scene.actors.size, zoom: window.__petPark.scene.cameras.main.zoom }));
  checks.push('desktop, tablet and portrait phone layouts remain usable');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ pass: true, checks, metrics, assets: [...requests], browser: 'Windows Chrome', physicalIpadVerified: false }, null, 2));
  console.log(JSON.stringify({ pass: true, checks, metrics, output }));
} catch (error) {
  await Promise.all(pages.map((p, i) => shot(p, `failure-${i}`).catch(() => {})));
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack, errors, logs: logs.slice(-6000) }, null, 2));
  console.error(error); process.exitCode = 1;
} finally {
  await browser?.close(); server.kill();
  if (path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('buio-park-art-')) await fs.rm(temp, { recursive: true, force: true });
}
