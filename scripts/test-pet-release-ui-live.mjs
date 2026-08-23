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
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-pet-release-ui-'));
const databaseFile = path.join(tempDir, 'db.json');
const artifactDir = path.resolve('artifacts/pet-release-ui');
await fs.mkdir(artifactDir, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({
  users: [{
    studentid: 'S001', name: '陳小星', passwordhash: bcrypt.hashSync('student123', 4),
    role: 'student', classname: '5A', classno: 1, language: 'zh-HK',
  }],
  studentStats: [], questionLogs: [], _logId: 0,
  // Simulate an existing account whose old public pet has now been withdrawn. Bootstrap must
  // hide it and restore the starter choice instead of leaving the child with no playable pet.
  petProfiles: [{
    studentId: 'S001', coins: 20000, activePetId: 'legacy-pet', starterEggClaimed: true,
    eggPity: 17, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  }],
  petInstances: [{
    id: 'legacy-pet', studentId: 'S001', speciesId: 'crescent-rabbit', nickname: null,
    xp: 0, stage: 1, acquiredAt: new Date().toISOString(), equippedWearables: [],
    dailyXp: 0, dailyXpDate: '',
  }],
  petWallets: [{ studentId: 'S001', balance: 20000, updatedAt: new Date().toISOString() }],
  petInventory: [], petRoomLayouts: [{
    studentId: 'S001', themeId: 'sunny-oak', visibility: 'private', placements: [],
    updatedAt: new Date().toISOString(),
  }],
  petCurrencyLedger: [], petIdempotency: [], petTeacherGrantBatches: [],
  petRoomReactions: [], petAnonymousReactionTokens: [],
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
  let bootstrap = await ok(await context.request.get('/api/pet/bootstrap'), 'legacy bootstrap');
  assert.deepEqual(bootstrap.catalog.pets.map((pet) => pet.id), [
    'starpatch-cat', 'cloud-ear-dog', 'pudding-pig',
  ]);
  assert.deepEqual(bootstrap.pets, [], 'withdrawn pet leaked into the released collection');
  assert.equal(bootstrap.profile.activePetId, null);
  assert.equal(bootstrap.profile.starterEggClaimed, false);
  assert.equal(bootstrap.profile.eggPity, 0);
  const retiredActivation = await context.request.post('/api/pet/pets/legacy-pet/activate');
  assert.equal(retiredActivation.status(), 404, 'withdrawn pet can still be reactivated');

  await ok(await context.request.post('/api/pet/starter-egg/hatch', {
    headers: { 'Idempotency-Key': 'release-ui-starter' },
  }), 'restored starter egg');
  bootstrap = await ok(await context.request.get('/api/pet/bootstrap'), 'bootstrap after starter');
  if (!bootstrap.pets.some((pet) => pet.speciesId === 'starpatch-cat')) {
    await ok(await context.request.post('/api/pet/eggs/purchase', {
      data: { kind: 'direct', speciesId: 'starpatch-cat' },
      headers: { 'Idempotency-Key': 'release-ui-cat' },
    }), 'buy starpatch cat');
  }
  await ok(await context.request.post('/api/pet/shop/purchase', {
    data: { itemId: 'head-06', quantity: 1 },
    headers: { 'Idempotency-Key': 'release-ui-cloud-cap' },
  }), 'buy cloud cap');
  bootstrap = await ok(await context.request.get('/api/pet/bootstrap'), 'bootstrap after purchases');
  const cat = bootstrap.pets.find((pet) => pet.speciesId === 'starpatch-cat');
  assert.ok(cat, 'starpatch cat missing');
  await ok(await context.request.post(`/api/pet/pets/${cat.id}/activate`), 'activate cat');
  await ok(await context.request.put(`/api/pet/pets/${cat.id}/outfit`, {
    data: { wearableIds: ['head-06'] },
  }), 'equip cloud cap');

  await page.goto('/pet', { waitUntil: 'networkidle' });
  await page.locator('#game-root canvas').waitFor();
  await page.locator('[data-tab="collection"]').click();
  await page.locator('.pet-card').first().waitFor();
  assert.equal(await page.locator('.pet-card').count(), 3, 'collection must expose only three pets');
  assert.match(await page.locator('.panel-scroll .eyebrow').innerText(), /3 SPECIES · 12 FORMS/);
  await page.locator('[data-tab="shop"]').click();
  await page.locator('.shop-feature').waitFor();
  assert.equal(await page.locator('[data-action="buy-direct-egg"]').count(), 3,
    'shop must offer only three completed pets');
  assert.equal(await page.locator('[data-id="crescent-rabbit"]').count(), 0,
    'withdrawn pets must not remain purchasable');

  await page.locator('[data-tab="home"]').click();
  await page.locator('[data-action="open-outfit"]').click();
  await page.locator('.gear-board').waitFor();
  const preview = await page.locator('.gear-figure').evaluate((figure) => {
    const layers = [...figure.querySelectorAll('.figure-body')].map((layer) => (
      getComputedStyle(layer).backgroundImage
    ));
    return { layers };
  });
  assert.equal(preview.layers.length, 2, 'preview should contain the pet atlas and cloud-cap patch');
  assert.ok(preview.layers.some((url) => url.includes('outfit-atlases') && url.includes('head-06')),
    `cloud cap missing from preview layers: ${JSON.stringify(preview.layers)}`);
  assert.match(await page.locator('.picker-head h2').innerText(), /裝備 · 1\/5/);
  await page.screenshot({ path: path.join(artifactDir, '01-outfit-cloud-cap-preview-ipad-landscape.png') });
  await page.locator('[data-action="close-modal"]').click();

  const captureRoom = async (width, height, filename) => {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    const surface = page.locator('#playSurface');
    const computed = await surface.evaluate((element) => {
      const style = getComputedStyle(element);
      const canvas = element.querySelector('canvas');
      const surfaceRect = element.getBoundingClientRect();
      const canvasRect = canvas?.getBoundingClientRect();
      return {
        backgroundImage: style.backgroundImage,
        backgroundSize: style.backgroundSize,
        backgroundPosition: style.backgroundPosition,
        surface: { width: surfaceRect.width, height: surfaceRect.height },
        canvas: canvasRect ? { width: canvasRect.width, height: canvasRect.height } : null,
      };
    });
    assert.ok(computed.backgroundImage.includes('/room-backdrops/sunny-oak-backdrop-'),
      `room backdrop missing at ${width}x${height}: ${computed.backgroundImage}`);
    assert.equal(computed.backgroundSize, 'cover');
    assert.equal(computed.backgroundPosition, '50% 50%');
    assert.ok(computed.canvas?.width > 0 && computed.canvas?.height > 0, 'room canvas collapsed');
    await page.screenshot({ path: path.join(artifactDir, filename), fullPage: true });
    return computed;
  };
  const portrait = await captureRoom(820, 1180, '02-room-ipad-portrait.png');
  const landscape = await captureRoom(1180, 820, '03-room-ipad-landscape.png');
  assert.ok(Math.abs((portrait.canvas.width / portrait.canvas.height) - (16 / 9)) < 0.02);
  assert.ok(Math.abs((landscape.canvas.width / landscape.canvas.height) - (16 / 9)) < 0.02);
  assert.deepEqual(browserErrors, [], browserErrors.join('\n'));
  console.log(`✓ released pet catalogue, outfit preview and iPad room backdrop: ${artifactDir}`);
  await context.close();
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await fs.rm(tempDir, { recursive: true, force: true });
}
