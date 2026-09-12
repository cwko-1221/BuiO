import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const reservePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer(); socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const port = socket.address().port; socket.close(() => resolve(port));
  });
});

const port = await reservePort();
const baseURL = `http://127.0.0.1:${port}`;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-nezuko-walk-'));
const databaseFile = path.join(tempDir, 'db.json');
const artifactDir = path.resolve('artifacts/nezuko-walk-live');
await fs.mkdir(artifactDir, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({
  users: [{ studentid: 'S001', name: '禰豆子步態測試', passwordhash: bcrypt.hashSync('test', 4),
    role: 'student', classname: 'QA', classno: 1, language: 'zh-HK' }],
  studentStats: [], questionLogs: [], _logId: 0,
}, null, 2));

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve('.'),
  env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: databaseFile,
    MOCK_AUTH: '1', NODE_ENV: 'development', SUPABASE_DB_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', (chunk) => { logs += chunk; });
server.stderr.on('data', (chunk) => { logs += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${baseURL}/health`)).ok) return; } catch { /* keep trying */ }
    await new Promise((wake) => { setTimeout(wake, 125); });
  }
  throw new Error(`Server did not start.\n${logs}`);
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => { errors.push(`pageerror: ${error.message}`); });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.addInitScript(() => localStorage.setItem('pet-reduced-motion', '0'));
  await page.goto('/pet/preview', { waitUntil: 'networkidle' });

  const prepared = await page.evaluate(async () => {
    const request = async (url, options = {}) => {
      const response = await fetch(url, { credentials: 'include', ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
      const body = await response.json();
      if (!response.ok || body.success === false) throw new Error(body.message || `${response.status}`);
      return body;
    };
    let state = await request('/api/pet/bootstrap');
    if (!state.profile.starterEggClaimed) {
      await request('/api/pet/starter-egg/hatch', { method: 'POST',
        headers: { 'Idempotency-Key': 'nezuko-walk-live-starter' }, body: '{}' });
      state = await request('/api/pet/bootstrap');
    }
    let pet = state.pets.find((entry) => entry.speciesId === 'nezuko-kamado');
    if (!pet) {
      const result = await request('/api/pet/eggs/purchase', { method: 'POST',
        headers: { 'Idempotency-Key': 'nezuko-walk-live' },
        body: JSON.stringify({ kind: 'direct', speciesId: 'nezuko-kamado' }) });
      pet = result.pet;
    }
    await request(`/api/pet/pets/${encodeURIComponent(pet.id)}/activate`, { method: 'POST', body: '{}' });
    state = await request('/api/pet/bootstrap');
    return { petId: pet.id, activePetId: state.profile.activePetId,
      pets: state.pets.map((entry) => ({ id: entry.id, speciesId: entry.speciesId })) };
  });

  await page.goto('/pet/preview', { waitUntil: 'networkidle' });
  try {
    await page.locator('#game-root canvas').waitFor({ timeout: 15000 });
  } catch (error) {
    await page.screenshot({ path: path.join(artifactDir, 'boot-failure.png'), fullPage: true });
    const body = (await page.locator('body').innerText()).slice(0, 1500);
    throw new Error(`Pet room did not boot at ${page.url()}\n${body}\n${errors.join('\n')}\n${error.message}`);
  }
  try {
    await page.waitForFunction(() => {
      const scene = window.__petGame?.scene?.getScene('Bedroom');
      return scene?.avatar?.sprite?.texture?.key?.includes('nezuko-kamado');
    }, null, { timeout: 15000 });
  } catch (error) {
    const scene = await page.evaluate(() => {
      const current = window.__petGame?.scene?.getScene('Bedroom');
      return { texture: current?.avatar?.sprite?.texture?.key, avatar: current?.model?.activePet,
        definition: current?.model?.petDefinition?.id };
    });
    throw new Error(`Nezuko was not active. prepared=${JSON.stringify(prepared)} scene=${JSON.stringify(scene)}\n${error.message}`);
  }

  const report = { petId: prepared.petId, fps: 10, directions: {}, errors };
  const runs = [
    { facing: 'front', target: { x: 7, y: 9.2 } },
    { facing: 'right', target: { x: 11.5, y: 6.8 } },
    { facing: 'back', target: { x: 7, y: 3.2 } },
  ];

  for (const run of runs) {
    await page.evaluate(({ target }) => {
      const scene = window.__petGame.scene.getScene('Bedroom');
      scene.haltWalk();
      scene.petSpot = { x: 7, y: 6.8 };
      scene.seatPet(scene.petSpot);
      scene.walkTo(target);
    }, run);
    await page.waitForFunction((facing) => {
      const avatar = window.__petGame?.scene?.getScene('Bedroom')?.avatar;
      return avatar?.current === 'walk' && avatar?.facing === facing;
    }, run.facing, { timeout: 5000 });

    const sampling = page.evaluate(async ({ facing }) => new Promise((resolve) => {
      const values = []; const began = performance.now(); let idleSince = 0;
      const timer = setInterval(() => {
        const scene = window.__petGame.scene.getScene('Bedroom');
        const avatar = scene.avatar;
        values.push({ at: Math.round(performance.now() - began), frame: Number(avatar.sprite.frame.name),
          x: Number(avatar.x.toFixed(2)), y: Number(avatar.y.toFixed(2)),
          facing: avatar.facing, action: avatar.current });
        if (avatar.current === 'idle') idleSince ||= performance.now(); else idleSince = 0;
        if ((idleSince && performance.now() - idleSince >= 650) || performance.now() - began >= 5000) {
          clearInterval(timer); resolve(values);
        }
      }, 35);
    }), run);
    await page.waitForTimeout(420);
    await page.locator('.room-stage').screenshot({
      path: path.join(artifactDir, `${run.facing}-walk.png`),
    });
    const samples = await sampling;
    await page.locator('.room-stage').screenshot({
      path: path.join(artifactDir, `${run.facing}-idle.png`),
    });
    const frames = [...new Set(samples.filter((sample) => sample.action === 'walk')
      .map((sample) => sample.frame))];
    const moving = samples.filter((sample) => sample.action === 'walk');
    const first = moving[0], last = moving[moving.length - 1];
    const speed = Math.hypot(last.x - first.x, last.y - first.y) / Math.max(1, last.at - first.at) * 1000;
    const distancePerCycle = speed * (8 / 10);
    assert.equal(frames.length, 8, `${run.facing} movement played ${frames.length} of 8 frames: ${frames}`);
    assert.ok(samples.every((sample) => sample.facing === run.facing),
      `${run.facing} movement changed facing mid-run`);
    assert.ok(distancePerCycle>=80&&distancePerCycle<=115,
      `${run.facing} movement covers ${distancePerCycle.toFixed(1)}px per gait cycle`);
    const stopped = samples.filter((sample) => sample.action === 'idle');
    assert.ok(stopped.length >= 4, `${run.facing} did not settle long enough to inspect idle`);
    assert.equal(new Set(stopped.map((sample) => sample.frame)).size, 1,
      `${run.facing} idle changes frames after stopping`);
    assert.equal(new Set(stopped.map((sample) => `${sample.x}:${sample.y}`)).size, 1,
      `${run.facing} avatar position moves after stopping`);
    report.directions[run.facing] = { frames, speed: Number(speed.toFixed(2)),
      distancePerCycle: Number(distancePerCycle.toFixed(2)), samples };
  }

  await page.getByRole('button', { name: '休息' }).click();
  await page.waitForFunction(() => {
    const avatar = window.__petGame?.scene?.getScene('Bedroom')?.avatar;
    return avatar?.current === 'sleep' && Number(avatar?.sprite?.frame?.name) === 34;
  }, null, { timeout: 3000 });
  report.rest = await page.evaluate(() => {
    const avatar = window.__petGame.scene.getScene('Bedroom').avatar;
    return { action: avatar.current, frame: Number(avatar.sprite.frame.name) };
  });
  await page.locator('.room-stage').screenshot({ path: path.join(artifactDir, 'rest.png') });

  assert.deepEqual(errors, [], `browser errors: ${errors.join('\n')}`);
  await fs.writeFile(path.join(artifactDir, 'report.json'), JSON.stringify(report, null, 2));
  await page.close();
  await context.close();
  console.log(`✓ Nezuko front/right/back movement played all eight frames without browser errors`);
  console.log(`  evidence: ${artifactDir}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
