import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
import { clearWalk, findRoute, places, spawn as start, walkable, walkHeight } from '../pet-app/src/coast/layout.ts';

for (const a of [start, ...places]) for (const b of places) {
  const route = findRoute(a,b);
  assert.ok(route.length && route.at(-1).x === b.x && route.at(-1).y === b.y);
  assert.ok(route.every((p,i) => clearWalk(i ? route[i-1] : a,p)), 'Route crosses an obstacle');
}
assert.ok(!walkable({x:500,y:582}) && !walkable({x:1350,y:429}) && !walkable({x:835,y:370}));
assert.ok(walkHeight({x:1293,y:152}) > walkHeight({x:1168,y:288}) + 10);
assert.ok(walkHeight({x:442,y:476}) > walkHeight({x:359,y:505}) + 2);

const output = path.resolve(process.env.PET_COAST_TEST_OUTPUT || 'artifacts/pet-coast');
await mkdir(output, { recursive: true });
const fixture = await mkdtemp(path.join(os.tmpdir(), 'buio-pet-coast-'));
const database = path.join(fixture, 'db.json');
await writeFile(database, JSON.stringify({ users: [
  { studentid: 'COAST1', name: '海岸測試', classname: '5A', role: 'student', language: 'zh-HK', passwordhash: bcrypt.hashSync('coast-test', 4) },
] }));
const socket = createServer().listen(0, '127.0.0.1');
await once(socket, 'listening');
const { port } = socket.address();
await new Promise(resolve => socket.close(resolve));
const baseURL = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server.js'], {
  windowsHide: true,
  env: { ...process.env, NODE_ENV: 'development', PORT: String(port), BUIO_JSON_DB_FILE: database, MOCK_AUTH: '0', SUPABASE_DB_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '', browser;
server.stdout.on('data', data => { logs += data; });
server.stderr.on('data', data => { logs += data; });

try {
  for (let i = 0; i < 160; i++) {
    if (await fetch(baseURL + '/health/live').then(response => response.ok, () => false)) break;
    if (i === 159 || server.exitCode !== null) throw Error('Coast fixture server did not start');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  assert.equal((await context.request.post('/api/auth/login', { data: { studentId: 'COAST1', password: 'coast-test' } })).status(), 200);
  assert.equal((await context.request.post('/api/pet/starter-egg/hatch', { headers: { 'Idempotency-Key': 'coast-first-pet' }, data: {} })).status(), 201);
  const page = await context.newPage(), errors = [], failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', msg => { if (/GLTFLoader: Couldn't load texture|violates.*Content Security Policy|WebGL.*error/i.test(msg.text())) errors.push(msg.text()); });
  page.on('response', response => { if (response.status() >= 400 && response.url().includes('/pet/assets/')) failed.push(response.url()); });
  await page.goto('/pet');
  await page.getByRole('button', { name: '海岸小鎮', exact: true }).click();
  const coastline = page.locator('.moonbay[data-ready="true"]');
  await coastline.waitFor({ timeout: 25000 });
  await page.waitForFunction(() => document.querySelector('.moonbay')?.dataset.district === 'crescent');
  assert.ok(Number(await coastline.getAttribute('data-joints')) >= 6);
  const loaded = await page.evaluate(() => performance.getEntriesByType('resource').map(x => x.name.split('/').at(-1)));
  assert.equal(loaded.filter(x => /^terrain-.*\.webp$/.test(x)).length,9);
  assert.ok(loaded.some(x => /^landmarks-.*\.webp$/.test(x)));
  await page.screenshot({ path: path.join(output, 'crescent-square.png') });
  const xBefore = Number(await coastline.getAttribute('data-x'));
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(x => Number(document.querySelector('.moonbay').dataset.x) > x+4 && document.querySelector('.moonbay').dataset.gait === 'Walk',xBefore);
  await page.keyboard.up('ArrowRight');
  await page.locator('[data-coast="map"]').click();
  assert.equal(await page.locator('[data-coast-place]:visible').count(), 6);
  await page.screenshot({ path: path.join(output, 'whole-island.png') });
  if (!process.argv.includes('--preview')) {
    for (const id of ['marina', 'lookout', 'market', 'garden', 'village', 'crescent']) {
      await page.locator('[data-coast-place="' + id + '"]').click();
      if (id === 'garden' || id === 'village') {
        const west = id === 'garden';
        if (west) {
          await page.waitForFunction(() => {
            const d = document.querySelector('.moonbay').dataset;
            return Number(d.x) < 573 && Number(d.x) > 535 && Number(d.y) >= 464;
          },null,{timeout:75000});
          await page.evaluate(() => {
            const stream = document.querySelector('.moonbay canvas').captureStream(24);
            const recorder = new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3500000});
            const chunks = [];
            recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
            window.coastTestRecording = { recorder, done:new Promise(resolve => recorder.onstop = async () => {
              stream.getTracks().forEach(track => track.stop());
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));
            }) };
            recorder.start();
          });
        }
        await page.waitForFunction(w => {
          const d = document.querySelector('.moonbay').dataset;
          return d.gait === 'Walk' && Number(d.x) > (w ? 427 : 1155) && Number(d.x) < (w ? 459 : 1186)
            && Number(d.y) > (w ? 467 : 451) && Number(d.y) < (w ? 492 : 478);
        },west,{ timeout:75000 });
        await coastline.screenshot({path:path.join(output,west ? 'west-bridge.png' : 'east-bridge.png')});
      }
      await page.waitForFunction(value => document.querySelector('.moonbay')?.dataset.arrived === value, id, { timeout: 85000 });
      const place = places.find(p => p.id === id);
      assert.equal(Number(await coastline.getAttribute('data-x')),place.x);
      assert.equal(Number(await coastline.getAttribute('data-y')),place.y);
      if (id === 'garden') {
        const video = await page.evaluate(async () => {
          const recording = window.coastTestRecording; recording.recorder.stop(); return recording.done;
        });
        await writeFile(path.join(output,'garden-bridge.webm'),Buffer.from(video,'base64'));
      }
      await page.screenshot({ path: path.join(output, id + '.png') });
      await page.locator('[data-coast="map"]').click();
      console.log('Reached ' + id + ' on foot');
    }
  }
  await page.keyboard.press('Escape');
  await page.locator('[data-coast="home"]').click();
  await page.waitForFunction(() => window.__petGame?.scene.isActive('Bedroom'));
  assert.equal(await page.locator('.moonbay canvas').count(), 0);
  for (const url of ['/api/pet/park/state', '/pet/park-3d-qa/', '/pet/assets/art/park/island-v1/grass-d5bb82ad4fcc.webp']) {
    assert.equal((await context.request.get(url)).status(), 404, url);
  }
  const phone = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    storageState: await context.storageState() });
  const mobile = await phone.newPage();
  mobile.on('pageerror', error => errors.push(error.message));
  await mobile.goto('/pet');
  await mobile.getByRole('button', { name: '海岸小鎮', exact: true }).tap();
  await mobile.locator('.moonbay[data-ready="true"]').waitFor({ timeout: 25000 });
  const pad = mobile.locator('[data-coast-move="ArrowLeft"]');
  await pad.waitFor();
  const rect = await pad.boundingBox();
  assert.ok(rect.width >= 44 && rect.height >= 44);
  const phoneX = Number(await mobile.locator('.moonbay').getAttribute('data-x'));
  await pad.tap();
  await mobile.waitForFunction(x => Number(document.querySelector('.moonbay').dataset.x) < x,phoneX);
  await mobile.screenshot({ path: path.join(output, 'phone.png') });
  await mobile.locator('[data-coast="map"]').tap();
  assert.equal(await mobile.locator('[data-coast-place]:visible').count(), 6);
  await mobile.screenshot({ path: path.join(output, 'phone-overview.png') });
  await mobile.locator('[data-coast-place="crescent"]').tap();
  await mobile.waitForFunction(() => document.querySelector('.moonbay').dataset.arrived === 'crescent');
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  assert.ok((await readFile(path.join(output, 'whole-island.png'))).length > 50000, 'Island render should contain art');
  console.log('Moonbay Coast rendered on desktop and touch screens. The former map and its API returned 404.');
} catch (error) {
  console.error(logs.split('\n').slice(-18).join('\n'));
  throw error;
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const stopped = once(server, 'exit');
    server.kill();
    await stopped;
  }
  await rm(fixture, { recursive: true, force: true });
}
