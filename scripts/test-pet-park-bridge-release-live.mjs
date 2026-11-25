// Independent release check: actual alpha-visible paws, authoritative packets,
// finite rail geometry and deliberate dropped incoming frames in an isolated DB.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
import { PARK_BRIDGES, FOOT_RADIUS } from '../pet-app/lib/park-layout-v4.mjs';
import { WORLD, WALKMESH, walkable } from '../pet-app/lib/park-world.mjs';

const build = path.resolve(process.env.PET_APP_TEST_DIST || 'artifacts/pet-park-release-build');
await fs.access(path.join(build, 'index.html'));
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) || 'artifacts/pet-playtest/release-v4-geometry');
await fs.mkdir(output, { recursive: true });
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-bridge-release-'));
process.env.BUIO_JSON_DB_FILE = path.join(temp, 'db.json'); process.env.SUPABASE_DB_URL = '';
const users = ['G001', 'G002'].map((id, i) => ({ studentid: id, name: i ? '橋邊檢查貓' : '橋邊檢查兔', classname: '5A', role: 'student', language: 'zh-HK', passwordhash: bcrypt.hashSync('test', 4) }));
await fs.writeFile(process.env.BUIO_JSON_DB_FILE, JSON.stringify({ users, studentStats: [], questionLogs: [], _logId: 0 }));
const require = createRequire(import.meta.url), pets = require('../pet-app/repositories/pet.repo'), store = require('../db/jsonStore');
for (const [i, user] of users.entries()) {
  await pets.ensureStudent(user.studentid); const data = store.load(), id = randomUUID();
  data.petInstances.push({ petId: id, studentId: user.studentid, speciesId: i ? 'starpatch-cat' : 'crescent-rabbit', xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '', equippedSkills: [], equippedWearables: [] });
  Object.assign(data.petProfiles.find(p => p.studentId === user.studentid), { activePetId: id, starterEggClaimed: true }); store.save();
}
const port = await new Promise(resolve => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });
const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env: { ...process.env, PORT: String(port), MOCK_AUTH: '0', NODE_ENV: 'development', PET_APP_DIST_DIR: build }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser, page, lastWalk;
server.stdout.on('data', data => logs += data); server.stderr.on('data', data => logs += data);
const errors = [], measurements = [], checks = [];
const pass = text => { checks.push(text); console.log('✓ ' + text); };
const screenshot = name => page.screenshot({ path: path.join(output, name + '.png') });
async function walk(point) {
  lastWalk = point;
  await page.evaluate(point => { window.__bridgeProbe.moveError = null; window.__petPark.scene.walk(point.x, point.y); }, point);
  await page.waitForFunction(point => { const p = window.__petPark.client.frames.get('G001'); return window.__bridgeProbe.moveError || p && !p.moving && Math.hypot(p.x - point.x, p.y - point.y) < 3; }, point, { timeout: 40000 });
  assert.equal(await page.evaluate(() => window.__bridgeProbe.moveError), null, 'a legal click-to-walk destination was rejected');
  await page.waitForTimeout(280);
}
async function measure(label) {
  const sample = await page.evaluate(() => window.__bridgeProbe.read());
  assert.ok(sample?.paws?.length, label + ': no opaque pet paw pixels were measurable');
  assert.ok(walkable(sample.logical.x, sample.logical.y), label + ': server feet are inside an obstacle');
  assert.ok(Math.abs(sample.baseline.y - sample.logical.y) < 5, label + ': rendered paw baseline differs from the authoritative ground point by ' + (sample.baseline.y - sample.logical.y).toFixed(2));
  for (const paw of sample.paws) assert.ok(WALKMESH.contains(paw, 0), label + ': a visible opaque paw pixel touches a rail, water or planter at ' + JSON.stringify(paw));
  assert.ok(sample.nameFontPx >= 12 && sample.nameFontPx <= 19, label + ': unreadable or oversized player name (' + sample.nameFontPx + 'px)');
  measurements.push({ label, ...sample }); return sample;
}

try {
  const baseURL = `http://127.0.0.1:${port}`, until = Date.now() + 25000;
  while (true) { try { if ((await fetch(baseURL + '/health')).ok) break; } catch {} if (Date.now() > until) throw Error('isolated server did not start'); await new Promise(resolve => setTimeout(resolve, 100)); }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 960 }, hasTouch: true });
  assert.equal((await context.request.post('/api/auth/login', { data: { studentId: 'G001', password: 'test' } })).status(), 200);
  page = await context.newPage(); page.on('pageerror', error => errors.push(error.stack || error.message));
  page.on('response', response => { if (response.url().includes('/pet/assets/') && response.status() >= 400) errors.push(response.status() + ' ' + response.url()); });
  await page.goto('/pet'); await page.locator('[data-tab="park"]').click();
  await page.waitForFunction(() => window.__petPark?.client.ready && window.__petPark.scene?.actors.size && document.querySelector('[data-park-loading]')?.hidden, {}, { timeout: 40000 });
  assert.equal(await page.evaluate(() => window.__petPark.scene.textures.exists('park:storybook:terrain')), false, 'the old enlarged bitmap must not be the active terrain');
  await page.evaluate(() => {
    const park = window.__petPark, samples = [], cache = new Map();
    function pawsFor(sprite) {
      const frame = sprite.frame, key = sprite.texture.key + ':' + frame.name;
      if (cache.has(key)) return cache.get(key);
      const width = frame.cutWidth, height = frame.cutHeight, canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const c = canvas.getContext('2d', { willReadFrequently: true });
      c.drawImage(sprite.texture.getSourceImage(), frame.cutX, frame.cutY, width, height, 0, 0, width, height);
      const rgba = c.getImageData(0, 0, width, height).data;
      let bottom = -1; for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] > 180) bottom = y;
      const points = []; let left = width, right = -1;
      for (let y = bottom - 2; y <= bottom; y++) for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] > 180) { points.push({ x: x + .5 + (frame.x || 0), y: y + 1 + (frame.y || 0) }); left = Math.min(left, x); right = Math.max(right, x); }
      const result = { points, center: { x: (left + right + 1) / 2 + (frame.x || 0), y: bottom + 1 + (frame.y || 0) } }; cache.set(key, result); return result;
    }
    function read() {
      const actor = park.scene.actors.get('G001'), sprite = actor?.avatar.sprite, logical = park.client.frames.get('G001'); if (!sprite || !logical) return null;
      const data = pawsFor(sprite), matrix = sprite.getWorldTransformMatrix();
      const transform = p => matrix.transformPoint((sprite.flipX ? sprite.width - p.x : p.x) - sprite.displayOriginX, p.y - sprite.displayOriginY);
      const baseline = transform(data.center), paws = data.points.map(transform);
      return { logical: { x: logical.x, y: logical.y }, visualOrigin: { x: actor.avatar.x, y: actor.avatar.y }, baseline: { x: baseline.x, y: baseline.y }, paws: paws.map(p => ({ x: p.x, y: p.y })), frame: sprite.frame.name, nameFontPx: parseFloat(actor.label.style.fontSize) * actor.label.scaleY * park.scene.cameras.main.zoom };
    }
    const probe = { read, samples, packets: [], collecting: false, dropped: 0, dropUntil: 0, moveError: null };
    park.scene.events.on('postupdate', () => { if (probe.collecting && samples.length < 20000) { const value = read(); if (value) samples.push(value); } });
    const socket = park.client.socket, original = socket.onevent;
    socket.onevent = function(packet) {
      if (packet.data?.[0] === 'park:frame') {
        const self = packet.data[1]?.peers?.find(p => p.id === 'G001'); if (self && probe.packets.length < 20000) probe.packets.push({ x: self.x, y: self.y });
        if (performance.now() < probe.dropUntil) { probe.dropped++; return; }
      }
      return original.call(this, packet);
    };
    const originalMove = park.client.move;
    park.client.move = function(x, y) { const promise = originalMove.call(this, x, y); promise.catch(error => probe.moveError = error.message); return promise; };
    window.__bridgeProbe = probe;
  });
  await measure('home-idle'); await screenshot('01-home-actual-paws');
  for (const bridge of [...PARK_BRIDGES].reverse()) {
    const center = { x: bridge.x + bridge.width / 2, y: bridge.y + bridge.height / 2 };
    await walk({ x: bridge.x - 100, y: center.y });
    await walk({ x: bridge.x + bridge.width + 100, y: center.y }); await measure(bridge.id + '-east-bank');
    await walk(center); await measure(bridge.id + '-deck-center'); await screenshot(`02-${bridge.id}-deck-center`);
    for (const [side, key, y] of [['north', 'ArrowUp', bridge.y + 28 + FOOT_RADIUS + 2], ['south', 'ArrowDown', bridge.y + bridge.height - 28 - FOOT_RADIUS - 2]]) {
      await walk({ x: center.x, y });
      await page.keyboard.down(key); await page.waitForTimeout(1300); await page.keyboard.up(key); await page.waitForTimeout(300);
      await measure(bridge.id + '-' + side + '-rail-contact'); await screenshot(`03-${bridge.id}-${side}-rail-contact`);
      const frame = await page.evaluate(() => window.__petPark.client.frames.get('G001'));
      assert.ok(side === 'north' ? frame.y >= bridge.y + 28 + FOOT_RADIUS - .001 : frame.y <= bridge.y + bridge.height - 28 - FOOT_RADIUS + .001);
    }
    for (const [corner, x, y, horizontal, vertical] of [
      ['north-west', bridge.x + 60, bridge.y + 28 + FOOT_RADIUS + 2, 'ArrowLeft', 'ArrowUp'],
      ['north-east', bridge.x + bridge.width - 60, bridge.y + 28 + FOOT_RADIUS + 2, 'ArrowRight', 'ArrowUp'],
      ['south-west', bridge.x + 60, bridge.y + bridge.height - 28 - FOOT_RADIUS - 2, 'ArrowLeft', 'ArrowDown'],
      ['south-east', bridge.x + bridge.width - 60, bridge.y + bridge.height - 28 - FOOT_RADIUS - 2, 'ArrowRight', 'ArrowDown'],
    ]) {
      await walk({ x, y }); await page.keyboard.down(horizontal); await page.keyboard.down(vertical); await page.waitForTimeout(650); await page.keyboard.up(horizontal); await page.keyboard.up(vertical); await page.waitForTimeout(250);
      await measure(bridge.id + '-' + corner + '-diagonal');
    }
    await walk({ x: bridge.x - 100, y: center.y });
    const target = { x: bridge.x + bridge.width + 160, y: bridge.y - 160 };
    assert.ok(walkable(target.x, target.y));
    await page.evaluate(point => { const p = window.__bridgeProbe; p.samples.length = 0; p.dropped = 0; p.collecting = true; p.dropUntil = performance.now() + 3800; window.__petPark.scene.walk(point.x, point.y); }, target);
    await page.waitForTimeout(4600);
    await page.waitForFunction(point => { const p = window.__petPark.client.frames.get('G001'); return p && Math.hypot(p.x - point.x, p.y - point.y) < 4; }, target, { timeout: 15000 });
    await page.waitForTimeout(500); await measure(bridge.id + '-after-dropped-frames'); await screenshot(`04-${bridge.id}-after-frame-gap`);
    const probe = await page.evaluate(() => { window.__bridgeProbe.collecting = false; return { dropped: window.__bridgeProbe.dropped, samples: window.__bridgeProbe.samples }; });
    assert.ok(probe.dropped >= 25, 'the packet-gap fixture must actually drop incoming park frames');
    for (const sample of probe.samples) for (const paw of sample.paws) assert.ok(WALKMESH.contains(paw, 0), bridge.id + ': visible paw clips geometry during frame-gap recovery at ' + JSON.stringify(paw));
    pass(`${bridge.id}: finite deck, both rails, four diagonal corners, safe dry-bank ends and ${probe.samples.length} rendered samples with an incoming frame gap`);
  }
  await walk({ x: PARK_BRIDGES[0].x + PARK_BRIDGES[0].width / 2, y: PARK_BRIDGES[0].y + PARK_BRIDGES[0].height / 2 });
  const desktop = await measure('wood-desktop-final');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(500);
  const phone = await measure('wood-phone-final'); await screenshot('05-phone-native-bridge');
  assert.ok(Math.abs(desktop.nameFontPx - phone.nameFontPx) < .6, 'player names should keep their screen size across camera zooms');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  pass('the crescent rabbit paws align to authoritative ground points and remain on native bridge surfaces on desktop and phone');
  const packets = await page.evaluate(() => window.__bridgeProbe.packets);
  assert.ok(packets.length > 200, 'the independent check must observe real movement packets');
  for (const packet of packets) assert.ok(walkable(packet.x, packet.y), 'an actual server frame published an illegal foot point');
  pass(`${packets.length} actual incoming movement frames preserve legal authoritative feet, including intentionally dropped frames`);
  assert.deepEqual(errors, []);
  const report = { pass: true, build, htmlSha256: createHash('sha256').update(await fs.readFile(path.join(build, 'index.html'))).digest('hex'), world: WORLD, footRadius: FOOT_RADIUS, checks, errors, measurements, incomingMovementPackets: packets.length, browser: 'Windows Chrome; headless; desktop and emulated phone', physicalMobileVerified: false };
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ pass: true, checks, measurements: measurements.length, errors }));
} catch (error) {
  if (page) await screenshot('failure').catch(() => {});
  const state = page ? await page.evaluate(() => ({ frame: window.__petPark?.client.frames.get('G001'), route: window.__petPark?.scene.route, blocked: window.__petPark?.scene.blocked, notice: document.querySelector('.park-notice')?.textContent })).catch(() => null) : null;
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack, lastWalk, state, errors, measurements, serverLogs: logs.slice(-4000) }, null, 2));
  console.error(error.stack); process.exitCode = 1;
} finally {
  await browser?.close(); server.kill();
  if (path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('buio-bridge-release-')) await fs.rm(temp, { recursive: true, force: true });
}
