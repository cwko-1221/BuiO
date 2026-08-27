import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const reservePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const port = socket.address().port;
    socket.close(() => resolve(port));
  });
});

const port = await reservePort();
const baseURL = `http://127.0.0.1:${port}`;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-pet-full-outfit-'));
const databaseFile = path.join(tempDir, 'db.json');
const artifactDir = path.resolve(process.env.PET_FULL_OUTFIT_DIR || 'artifacts/pet-full-outfit');
await fs.mkdir(artifactDir, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({
  users: [{ studentid: 'S001', name: '陳小星', passwordhash: bcrypt.hashSync('student123', 4), role: 'student', classname: '5A', classno: 1, language: 'zh-HK' }],
  studentStats: [], questionLogs: [], _logId: 0,
}, null, 2));

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve('.'),
  env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: databaseFile, MOCK_AUTH: '1', NODE_ENV: 'development', SUPABASE_DB_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', (chunk) => logs += chunk);
server.stderr.on('data', (chunk) => logs += chunk);
const waitForServer = async () => {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${baseURL}/health`)).ok) return; } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  throw new Error(`Server did not start.\n${logs}`);
};
const ok = async (response, label) => {
  const body = await response.json().catch(() => null);
  assert.equal(response.ok(), true, `${label}: ${response.status()} ${JSON.stringify(body)}`);
  return body;
};

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

  await context.request.get('/api/auth/me');
  await ok(await context.request.post('/api/pet/dev/unlimited-money'), 'unlimited money');
  await ok(await context.request.post('/api/pet/starter-egg/hatch', { headers: { 'Idempotency-Key': 'full-outfit-starter' } }), 'starter');
  let bootstrap = await ok(await context.request.get('/api/pet/bootstrap'), 'bootstrap after hatch');
  if (!bootstrap.pets.some((entry) => entry.speciesId === 'starpatch-cat')) {
    await ok(await context.request.post('/api/pet/eggs/purchase', {
      data: { kind: 'direct', speciesId: 'starpatch-cat' },
      headers: { 'Idempotency-Key': 'full-outfit-cat' },
    }), 'starpatch-cat');
  }
  for (const itemId of ['head-20', 'neck-10', 'back-02']) {
    await ok(await context.request.post('/api/pet/shop/purchase', {
      data: { itemId, quantity: 1 }, headers: { 'Idempotency-Key': `full-outfit-${itemId}` },
    }), itemId);
  }
  bootstrap = await ok(await context.request.get('/api/pet/bootstrap'), 'bootstrap');
  const pet = bootstrap.pets.find((entry) => entry.speciesId === 'starpatch-cat');
  assert.ok(pet, 'starpatch-cat missing after hatch/purchase');
  await ok(await context.request.post(`/api/pet/pets/${pet.id}/activate`), 'activate');
  await ok(await context.request.put(`/api/pet/pets/${pet.id}/outfit`, {
    data: { wearableIds: ['head-20', 'neck-10', 'back-02'] },
  }), 'full outfit');

  await page.goto('/pet', { waitUntil: 'networkidle' });
  await page.locator('#game-root canvas').waitFor();
  await page.waitForFunction(() => {
    const avatar = window.__petGame?.scene?.getScene('Bedroom')?.avatar;
    return avatar?.fullOutfit === true && avatar?.worn?.length === 0;
  }, null, { timeout: 15000 });

  const expectedRows = { front: [0, 4], right: [5, 9], back: [10, 14], left: [5, 9] };
  for (const facing of ['front', 'right', 'back', 'left']) {
    await page.evaluate((way) => window.__petGame.scene.getScene('Bedroom').avatar.play('idle', way), facing);
    await page.waitForTimeout(280);
    const state = await page.evaluate(() => {
      const scene = window.__petGame.scene.getScene('Bedroom');
      const avatar = scene.avatar;
      const canvas = document.querySelector('#game-root canvas');
      const rect = canvas.getBoundingClientRect();
      const camera = scene.cameras.main;
      const sx = (camera.x + (avatar.x - camera.scrollX) * camera.zoom) * (rect.width / canvas.width) + rect.x;
      const sy = (camera.y + (avatar.y - camera.scrollY) * camera.zoom) * (rect.height / canvas.height) + rect.y;
      return {
        fullOutfit: avatar.fullOutfit,
        worn: avatar.worn.length,
        texture: avatar.sprite.texture.key,
        frame: Number(avatar.sprite.frame.name),
        flipX: avatar.sprite.flipX,
        sx, sy,
      };
    });
    assert.equal(state.fullOutfit, true);
    assert.equal(state.worn, 0, `${facing}: old free-positioned wearables were still created`);
    assert.match(state.texture, /^outfit-starpatch-cat-1-back-02\+head-20\+neck-10$/);
    assert.ok(state.frame >= expectedRows[facing][0] && state.frame <= expectedRows[facing][1], `${facing}: frame ${state.frame} is in the wrong atlas row`);
    assert.equal(state.flipX, facing === 'left', `${facing}: mirror state is wrong`);
    const clip = {
      x: Math.max(0, Math.min(880, state.sx - 150)),
      y: Math.max(0, Math.min(520, state.sy - 190)),
      width: 300,
      height: 300,
    };
    await page.screenshot({ path: path.join(artifactDir, `starpatch-cat-full-outfit-${facing}.png`), clip });
  }
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log(`✓ complete redrawn outfit atlas used in four directions: ${artifactDir}`);
  console.log('✓ old positioned wearable collection stayed empty');
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await fs.rm(tempDir, { recursive: true, force: true });
}
