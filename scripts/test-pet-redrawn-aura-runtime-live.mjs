/** Focused runtime contract for registered modular aura layers.
 *
 * The production catalog currently has no approved aura redraw. This test therefore injects a
 * same-coordinate test entry into the bootstrap response only. It proves that the runtime uses
 * the registered rear/patch/front atlas path, and that removing that entry restores the legacy
 * aura fallback. No art manifest or production asset is changed.
 */
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
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-pet-redrawn-aura-'));
const databaseFile = path.join(tempDir, 'db.json');
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
  const context = await browser.newContext({
    baseURL, viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });

  await context.request.get('/api/auth/me');
  await ok(await context.request.post('/api/pet/dev/unlimited-money'), 'unlimited money');
  await ok(await context.request.post('/api/pet/starter-egg/hatch', {
    headers: { 'Idempotency-Key': 'redrawn-aura-starter' },
  }), 'starter');
  let bootstrap = await ok(await context.request.get('/api/pet/bootstrap'), 'bootstrap');
  if (!bootstrap.pets.some((entry) => entry.speciesId === 'starpatch-cat')) {
    await ok(await context.request.post('/api/pet/eggs/purchase', {
      data: { kind: 'direct', speciesId: 'starpatch-cat' },
      headers: { 'Idempotency-Key': 'redrawn-aura-cat' },
    }), 'starpatch-cat');
  }
  await ok(await context.request.post('/api/pet/shop/purchase', {
    data: { itemId: 'aura-01', quantity: 1 },
    headers: { 'Idempotency-Key': 'redrawn-aura-01' },
  }), 'aura-01');
  await ok(await context.request.post('/api/pet/shop/purchase', {
    data: { itemId: 'head-05', quantity: 1 },
    headers: { 'Idempotency-Key': 'redrawn-aura-head-05' },
  }), 'head-05');
  bootstrap = await ok(await context.request.get('/api/pet/bootstrap'), 'bootstrap after purchase');
  const pet = bootstrap.pets.find((entry) => entry.speciesId === 'starpatch-cat');
  assert.ok(pet, 'starpatch-cat missing');
  await ok(await context.request.post(`/api/pet/pets/${pet.id}/activate`), 'activate');
  await ok(await context.request.put(`/api/pet/pets/${pet.id}/outfit`, {
    // Deliberately save the slots in the opposite order from the compositor. Preview and room
    // must still agree on aura -> head rather than treating the API array as z-order.
    data: { wearableIds: ['head-05', 'aura-01'] },
  }), 'aura outfit');

  // Toggle this test-only bootstrap augmentation without touching the production catalog.
  let injectRegisteredAura = true;
  await page.route('**/api/pet/bootstrap', async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    if (injectRegisteredAura) {
      const baseAtlas = data.catalog.pets.find((entry) => entry.id === 'starpatch-cat')?.atlas?.[0];
      assert.ok(baseAtlas, 'starpatch-cat atlas missing from bootstrap');
      data.catalog.redrawnWearables['starpatch-cat:1:aura-01'] = {
        slot: 'aura',
        // Reuse a real atlas URL as a deterministic test layer. The runtime key and zero legacy
        // pieces are the contract under test; production aura art is deliberately not published.
        rear: baseAtlas,
        patch: baseAtlas,
        front: baseAtlas,
      };
    }
    await route.fulfill({ response, body: JSON.stringify(data) });
  });

  await page.goto('/pet', { waitUntil: 'networkidle' });
  await page.locator('#game-root canvas').waitFor();
  await page.waitForFunction(() => {
    const avatar = window.__petGame?.scene?.getScene('Bedroom')?.avatar;
    return avatar?.sprite?.texture?.key?.startsWith('redrawn-composite-starpatch-cat-1-aura-01');
  }, null, { timeout: 15000 });
  const registered = await page.evaluate(() => {
    const avatar = window.__petGame.scene.getScene('Bedroom').avatar;
    const scene = window.__petGame.scene.getScene('Bedroom');
    return {
      texture: avatar.sprite.texture.key,
      worn: avatar.worn.length,
      auraLayerKeys: ['rear', 'patch', 'front'].map((layer) => (
        `redrawn-starpatch-cat-1-aura-01-${layer}`
      )).map((key) => ({ key, loaded: scene.textures.exists(key) })),
    };
  });
  assert.match(registered.texture, /^redrawn-composite-starpatch-cat-1-aura-01/);
  assert.equal(registered.worn, 0, 'registered aura fell through to legacy wearable placement');
  assert.deepEqual(registered.auraLayerKeys.map((entry) => entry.loaded), [true, true, true]);

  await page.locator('[data-action="open-outfit"]').click();
  await page.locator('.figure-preview-canvas[data-ready="true"]').waitFor({ timeout: 5000 });
  const previewOrder = await page.locator('.figure-preview-canvas[data-ready="true"]').evaluate((canvas) => (
    JSON.parse(decodeURIComponent(canvas.dataset.layers || '[]')).map((entry) => entry.slot)
  ));
  assert.deepEqual(previewOrder, ['aura', 'head'], 'preview used saved outfit order instead of canonical layer order');
  await page.locator('[data-action="close-modal"]').click();

  // Remove only the injected entry. The same equipped item must then use the compatibility
  // artwork, proving that fallback remains available for auras not yet redrawn.
  injectRegisteredAura = false;
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#game-root canvas').waitFor();
  await page.waitForFunction(() => {
    const avatar = window.__petGame?.scene?.getScene('Bedroom')?.avatar;
    return avatar?.sprite?.texture?.key === 'redrawn-composite-starpatch-cat-1-head-05'
      && avatar?.worn?.length === 1;
  }, null, { timeout: 15000 });
  const fallback = await page.evaluate(() => {
    const avatar = window.__petGame.scene.getScene('Bedroom').avatar;
    return { texture: avatar.sprite.texture.key, worn: avatar.worn.length, slot: avatar.worn[0]?.slotKey };
  });
  assert.deepEqual(fallback, { texture: 'redrawn-composite-starpatch-cat-1-head-05', worn: 1, slot: 'aura' });
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('✓ registered aura uses rear/patch/front atlas layers with no legacy sticker');
  console.log('✓ unregistered aura preserves legacy fallback');
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await fs.rm(tempDir, { recursive: true, force: true });
}
