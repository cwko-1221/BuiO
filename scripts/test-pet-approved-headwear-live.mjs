import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const port = await new Promise((resolve, reject) => {
  const socket = net.createServer();
  socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const value = socket.address().port;
    socket.close(() => resolve(value));
  });
});
const baseURL = `http://127.0.0.1:${port}`;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-approved-headwear-'));
const databaseFile = path.join(tempDir, 'db.json');
const artifactDir = path.resolve('artifacts/pet-redrawn-wearable');
await fs.mkdir(artifactDir, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({
  users: [{
    studentid: 'S001', name: '陳小星', passwordhash: bcrypt.hashSync('student123', 4),
    role: 'student', classname: '5A', classno: 1, language: 'zh-HK',
  }],
  studentStats: [], questionLogs: [], _logId: 0,
}, null, 2));

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve('.'),
  env: {
    ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: databaseFile,
    MOCK_AUTH: '1', NODE_ENV: 'development', SUPABASE_DB_URL: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', (chunk) => { logs += chunk; });
server.stderr.on('data', (chunk) => { logs += chunk; });
const ok = async (response, label) => {
  const body = await response.json().catch(() => null);
  assert.equal(response.ok(), true, `${label}: ${response.status()} ${JSON.stringify(body)}`);
  return body;
};

let browser;
try {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${baseURL}/health`)).ok) break; } catch { /* retry */ }
    if (attempt === 79) throw new Error(`Server did not start.\n${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 125));
  }
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ baseURL, viewport: { width: 1180, height: 820 } });
  const page = await context.newPage();
  const browserErrors = [];
  page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`console: ${message.text()}`);
  });

  await context.request.get('/api/auth/me');
  await ok(await context.request.post('/api/pet/dev/unlimited-money'), 'unlimited money');
  await ok(await context.request.post('/api/pet/starter-egg/hatch', {
    headers: { 'Idempotency-Key': 'approved-headwear-starter' },
  }), 'starter');
  let bootstrap = await ok(await context.request.get('/api/pet/bootstrap'), 'bootstrap');
  if (!bootstrap.pets.some((entry) => entry.speciesId === 'starpatch-cat')) {
    await ok(await context.request.post('/api/pet/eggs/purchase', {
      data: { kind: 'direct', speciesId: 'starpatch-cat' },
      headers: { 'Idempotency-Key': 'approved-headwear-cat' },
    }), 'starpatch-cat');
  }
  const compatibilityItems = ['face-01', 'neck-10', 'back-02', 'aura-01'];
  for (const itemId of ['head-05', 'head-06', ...compatibilityItems]) {
    await ok(await context.request.post('/api/pet/shop/purchase', {
      data: { itemId, quantity: 1 },
      headers: { 'Idempotency-Key': `approved-${itemId}` },
    }), itemId);
  }
  bootstrap = await ok(await context.request.get('/api/pet/bootstrap'), 'bootstrap after purchases');
  assert.deepEqual(
    Object.keys(bootstrap.catalog.redrawnWearables).sort(),
    ['starpatch-cat:1:head-05', 'starpatch-cat:1:head-06'],
    'only independently approved redraws may be published',
  );
  const pet = bootstrap.pets.find((entry) => entry.speciesId === 'starpatch-cat');
  assert.ok(pet, 'starpatch-cat missing');
  await ok(await context.request.post(`/api/pet/pets/${pet.id}/activate`), 'activate');

  const expectedRows = { front: [0, 4], right: [5, 9], back: [10, 14], left: [5, 9] };
  for (const { itemId, stem } of [
    { itemId: 'head-05', stem: 'starpatch-cat-redrawn-chef-hat-approved' },
    { itemId: 'head-06', stem: 'starpatch-cat-redrawn-cloud-cap-approved' },
  ]) {
    await ok(await context.request.put(`/api/pet/pets/${pet.id}/outfit`, {
      data: { wearableIds: [itemId] },
    }), `${itemId} outfit`);
    await page.goto('/pet', { waitUntil: 'networkidle' });
    await page.locator('#game-root canvas').waitFor();
    const expectedTexture = `redrawn-composite-starpatch-cat-1-${itemId}`;
    await page.waitForFunction((texture) => (
      window.__petGame?.scene?.getScene('Bedroom')?.avatar?.sprite?.texture?.key === texture
    ), expectedTexture, { timeout: 15000 });

    for (const facing of ['front', 'right', 'back', 'left']) {
      await page.evaluate((way) => window.__petGame.scene.getScene('Bedroom').avatar.play('idle', way), facing);
      await page.waitForTimeout(300);
      const state = await page.evaluate(() => {
        const scene = window.__petGame.scene.getScene('Bedroom');
        const avatar = scene.avatar;
        const canvas = document.querySelector('#game-root canvas');
        const rect = canvas.getBoundingClientRect();
        const camera = scene.cameras.main;
        return {
          texture: avatar.sprite.texture.key,
          frame: Number(avatar.sprite.frame.name),
          flipX: avatar.sprite.flipX,
          worn: avatar.worn.length,
          sx: (camera.x + (avatar.x - camera.scrollX) * camera.zoom) * (rect.width / canvas.width) + rect.x,
          sy: (camera.y + (avatar.y - camera.scrollY) * camera.zoom) * (rect.height / canvas.height) + rect.y,
        };
      });
      assert.equal(state.texture, expectedTexture);
      assert.equal(state.worn, 0, `${itemId}/${facing}: legacy sticker rendered`);
      assert.ok(state.frame >= expectedRows[facing][0] && state.frame <= expectedRows[facing][1]);
      assert.equal(state.flipX, facing === 'left');
      await page.screenshot({
        path: path.join(artifactDir, `${stem}-${facing}.png`),
        clip: {
          x: Math.max(0, Math.min(880, state.sx - 150)),
          y: Math.max(0, Math.min(520, state.sy - 190)),
          width: 300, height: 300,
        },
      });
    }
  }

  // Publishing one fitted item must never disable the rest of the wardrobe. Keep the approved
  // chef hat on the composed pet atlas while every unfinished slot uses its directional artwork.
  await ok(await context.request.put(`/api/pet/pets/${pet.id}/outfit`, {
    data: { wearableIds: ['head-05', ...compatibilityItems] },
  }), 'hybrid redraw + legacy outfit');
  await page.goto('/pet', { waitUntil: 'networkidle' });
  await page.locator('#game-root canvas').waitFor();
  await page.waitForFunction(() => {
    const avatar = window.__petGame?.scene?.getScene('Bedroom')?.avatar;
    return avatar?.sprite?.texture?.key === 'redrawn-composite-starpatch-cat-1-head-05'
      && avatar?.worn?.length === 4;
  }, null, { timeout: 15000 });
  const hybrid = await page.evaluate(() => {
    const avatar = window.__petGame.scene.getScene('Bedroom').avatar;
    return {
      texture: avatar.sprite.texture.key,
      legacySlots: avatar.worn.map((piece) => piece.slotKey).sort(),
      legacyTextures: avatar.worn.map((piece) => piece.image.texture.key).sort(),
    };
  });
  assert.equal(hybrid.texture, 'redrawn-composite-starpatch-cat-1-head-05');
  assert.deepEqual(hybrid.legacySlots, ['aura', 'back', 'face', 'neck']);
  assert.deepEqual(hybrid.legacyTextures, compatibilityItems.slice().sort());
  assert.deepEqual(browserErrors, [], browserErrors.join('\n'));
  console.log(`✓ approved chef hat and cloud cap rendered in four directions: ${artifactDir}`);
  console.log('✓ approved redraw and unfinished face/neck/back/aura items remain wearable together');
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await fs.rm(tempDir, { recursive: true, force: true });
}
