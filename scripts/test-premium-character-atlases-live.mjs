import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
import sharp from 'sharp';
import crypto from 'node:crypto';

const PET_IDS = [
  'nezuko-kamado', 'dragon-ball-goku', 'crayon-shin-chan',
  'doraemon', 'hello-kitty', 'argentina-number-10', 'portugal-number-7', 'pikachu',
  'dragon-ball-frieza', 'one-piece-luffy', 'spy-family-anya', 'one-punch-saitama', 'naruto-uzumaki',
];
const selectedPet = process.argv.find((arg) => arg.startsWith('--pet='))?.slice(6);
const selectedPets = process.argv.find((arg) => arg.startsWith('--pets='))?.slice(7).split(',');
const RUN_PET_IDS = selectedPets || (selectedPet ? [selectedPet] : PET_IDS);
assert(RUN_PET_IDS.length && RUN_PET_IDS.every(id=>PET_IDS.includes(id)), 'Unknown premium character selection');
const NEW_PET_IDS = new Set(['pikachu','dragon-ball-frieza','one-piece-luffy','spy-family-anya','one-punch-saitama','naruto-uzumaki']);
const reservePort = () => new Promise((resolve, reject) => {
  const socket = net.createServer(); socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => {
    const port = socket.address().port; socket.close(() => resolve(port));
  });
});

const port = await reservePort();
const baseURL = `http://127.0.0.1:${port}`;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-premium-atlas-live-'));
const databaseFile = path.join(tempDir, 'db.json');
const servedDist = path.join(tempDir, 'pet-dist');
const artifactDir = path.resolve('artifacts/premium-character-atlases/live');
await fs.mkdir(artifactDir, { recursive: true });
// Express' send module treats the `.codex` segment in a managed-worktree path as a hidden
// path. Serve the exact production build from this isolated, dot-free directory instead.
await fs.cp(path.resolve('pet-app/dist'), servedDist, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({
  users: [
    { studentid: 'S001', name: '高質素角色測試', passwordhash: bcrypt.hashSync('test', 4),
      role: 'student', classname: 'QA', classno: 1, language: 'zh-HK' },
    { studentid: 'T001', name: '測試老師', passwordhash: bcrypt.hashSync('test', 4),
      role: 'teacher', classname: 'QA', classno: 0, language: 'zh-HK' },
  ],
  studentStats: [], questionLogs: [], _logId: 0,
}, null, 2));

process.env.BUIO_JSON_DB_FILE = databaseFile;
process.env.SUPABASE_DB_URL = '';
const require = createRequire(import.meta.url);
const repo = require('../pet-app/repositories/pet.repo.js');
for (let index = 0; index < RUN_PET_IDS.length; index += 1) {
  await repo.grantCoins('T001', ['S001'], 9999, {
    note: 'premium atlas live QA', idempotencyKey: `premium-atlas-grant-${index}`,
  });
}

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve('.'),
  env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: databaseFile,
    MOCK_AUTH: '1', NODE_ENV: 'development', SUPABASE_DB_URL: '',
    PET_APP_DIST_DIR: servedDist },
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
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => { errors.push(`pageerror: ${error.message}`); });
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.addInitScript(() => localStorage.setItem('pet-reduced-motion', '0'));
  const report = { fps: 10, pets: {}, errors };
  report.servedAssetHashes = {};
  const {catalog}=require('../pet-app/lib/catalog.js');
  for(const id of RUN_PET_IDS){
    const pet=catalog.pets.find(p=>p.id===id);report.servedAssetHashes[id]=[];
    for(const url of [...pet.atlas,...pet.art]){
      const relative=url.split('?')[0].replace('/pet/','');
      const expected=await fs.readFile(path.join(servedDist,relative));
      const response=await fetch(baseURL+url);assert(response.ok,'Missing served character asset '+url);
      const bytes=Buffer.from(await response.arrayBuffer());
      const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
      assert.equal(sha(bytes),sha(expected),'Live server served stale character art');
      report.servedAssetHashes[id].push({url,hash:sha(bytes)});
    }
  }

  for (const petId of RUN_PET_IDS) {
    await page.goto('/pet/preview', { waitUntil: 'networkidle' });
    const prepared = await page.evaluate(async (speciesId) => {
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
          headers: { 'Idempotency-Key': 'premium-atlas-live-starter' }, body: '{}' });
        state = await request('/api/pet/bootstrap');
      }
      let pet = state.pets.find((entry) => entry.speciesId === speciesId);
      if (!pet) {
        const result = await request('/api/pet/eggs/purchase', { method: 'POST',
          headers: { 'Idempotency-Key': `premium-atlas-live-${speciesId}` },
          body: JSON.stringify({ kind: 'direct', speciesId }) });
        pet = result.pet;
      }
      await request(`/api/pet/pets/${encodeURIComponent(pet.id)}/activate`, { method: 'POST', body: '{}' });
      // Empty only this disposable QA room so furniture cannot hide a gait or missing foot.
      await request('/api/pet/room', { method:'PUT',
        body:JSON.stringify({themeId:state.room.themeId,visibility:'private',placements:[]}) });
      return { petId: pet.id };
    }, petId);

    await page.goto('/pet/preview', { waitUntil: 'networkidle' });
    await page.locator('#game-root canvas').waitFor({ timeout: 15000 });
    const grantAcknowledgement = page.locator('[data-action="ack-grants"]');
    if (await grantAcknowledgement.isVisible().catch(() => false)) {
      await grantAcknowledgement.click();
      await page.locator('#modalRoot .modal-backdrop').waitFor({ state: 'detached' });
    }
    await page.waitForFunction((speciesId) => {
      const scene = window.__petGame?.scene?.getScene('Bedroom');
      return scene?.avatar?.sprite?.texture?.key?.includes(speciesId);
    }, petId, { timeout: 15000 });

    const petReport = { petId: prepared.petId, directions: {} };
    const runs = [
      { facing: 'front', target: { x: 7, y: 9.2 } },
      { facing: 'right', target: { x: 11.5, y: 6.8 } },
      { facing: 'back', target: { x: 7, y: 3.2 } },
    ];
    if (NEW_PET_IDS.has(petId)) runs.push({ facing: 'left', target: { x: 2.5, y: 6.8 } });
    for (const run of runs) {
      await page.evaluate(({ target }) => {
        const scene = window.__petGame.scene.getScene('Bedroom');
        scene.haltWalk(); scene.petSpot = { x: 7, y: 6.8 }; scene.seatPet(scene.petSpot); scene.walkTo(target);
      }, run);
      await page.waitForFunction((facing) => {
        const avatar = window.__petGame?.scene?.getScene('Bedroom')?.avatar;
        return avatar?.current === 'walk' && avatar?.facing === facing;
      }, run.facing, { timeout: 5000 });
      const sampling = page.evaluate(async () => new Promise((resolve) => {
        const values = [], captures = new Map(); const began = performance.now(); let idleSince = 0;
        const scene = window.__petGame.scene.getScene('Bedroom');
        function capture() {
          const avatar = scene.avatar, sprite = avatar.sprite, frame = Number(sprite.frame.name);
          if (avatar.current !== 'walk' || captures.has(frame)) return;
          const bounds = sprite.getBounds(), camera = scene.cameras.main;
          const crop = document.createElement('canvas');
          crop.width = Math.ceil(bounds.width + 8); crop.height = Math.ceil(bounds.height + 8);
          crop.getContext('2d').drawImage(scene.game.canvas,
            bounds.x-camera.scrollX-4, bounds.y-camera.scrollY-4,
            crop.width,crop.height,0,0,crop.width,crop.height);
          captures.set(frame,{frame,png:crop.toDataURL('image/png')});
        }
        scene.game.events.on('postrender',capture);
        const timer = setInterval(() => {
          const avatar = window.__petGame.scene.getScene('Bedroom').avatar;
          values.push({ at: Math.round(performance.now() - began), frame: Number(avatar.sprite.frame.name),
            x: Number(avatar.x.toFixed(2)), y: Number(avatar.y.toFixed(2)),
            facing: avatar.facing, action: avatar.current, flipX: avatar.sprite.flipX });
          if (avatar.current === 'idle') idleSince ||= performance.now(); else idleSince = 0;
          if ((idleSince && performance.now() - idleSince >= 450) || performance.now() - began >= 4500) {
            clearInterval(timer); scene.game.events.off('postrender',capture);
            resolve({values,captures:[...captures.values()]});
          }
        }, 30);
      }));
      await page.waitForTimeout(360);
      await page.locator('.room-stage').screenshot({ path: path.join(artifactDir, `${petId}-${run.facing}-walk.png`) });
      const { values: samples, captures: walkCaptures } = await sampling;
      const frames = [...new Set(samples.filter((sample) => sample.action === 'walk').map((sample) => sample.frame))];
      const moving = samples.filter((sample) => sample.action === 'walk');
      assert.equal(frames.length, 8, `${petId} ${run.facing} played ${frames.length}/8 frames: ${frames}`);
      assert.ok(moving.every((sample) => sample.facing === run.facing), `${petId} changed facing mid-run`);
      assert.ok(moving.every((sample) => sample.flipX === (run.facing === 'left')),
        `${petId} ${run.facing} uses the wrong sprite flip`);
      const stopped = samples.filter((sample) => sample.action === 'idle');
      assert.ok(stopped.length >= 4, `${petId} ${run.facing} did not settle into idle`);
      assert.ok(stopped.every((sample) => sample.frame >= 24 && sample.frame <= 31),
        `${petId} ${run.facing} settled outside its idle cycle`);
      assert.equal(new Set(stopped.map((sample) => `${sample.x}:${sample.y}`)).size, 1,
        `${petId} moves after stopping`);
      assert.equal(walkCaptures.length,8,`${petId} ${run.facing}: missing rendered walk evidence`);
      walkCaptures.sort((a,b)=>a.frame-b.frame);
      const walkTiles=[];
      for(const capture of walkCaptures) {
        const png=Buffer.from(capture.png.split(',')[1],'base64');
        await fs.writeFile(path.join(artifactDir,`${petId}-${run.facing}-frame-${capture.frame}.png`),png);
        walkTiles.push(await sharp(png).resize(240,280,{fit:'contain',background:'#edf2f7'}).png().toBuffer());
      }
      await sharp({create:{width:960,height:560,channels:4,background:'#edf2f7'}})
        .composite(walkTiles.map((input,i)=>({input,left:(i%4)*240,top:Math.floor(i/4)*280})))
        .png().toFile(path.join(artifactDir,`${petId}-${run.facing}-all-frames.png`));
      petReport.directions[run.facing] = { frames, samples, capturedFrames:walkCaptures.map(c=>c.frame) };
    }

    petReport.idle = await page.evaluate(async () => new Promise((resolve) => {
      const values = []; const began = performance.now();
      const timer = setInterval(() => {
        const avatar = window.__petGame.scene.getScene('Bedroom').avatar;
        values.push({ frame: Number(avatar.sprite.frame.name), x: Number(avatar.x.toFixed(2)),
          y: Number(avatar.y.toFixed(2)), action: avatar.current });
        values.at(-1).scale = `${avatar.sprite.scaleX}:${avatar.sprite.scaleY}:${avatar.scaleX}:${avatar.scaleY}`;
        if (performance.now() - began >= 2800) { clearInterval(timer); resolve(values); }
      }, 35);
    }));
    assert.deepEqual([...new Set(petReport.idle.map((sample) => sample.frame))].sort((a,b)=>a-b),
      [24,25,26,27,28,29,30,31], `${petId} idle did not play every frame`);
    assert.equal(new Set(petReport.idle.map((sample) => `${sample.x}:${sample.y}`)).size, 1,
      `${petId} avatar position changes during idle`);
    assert.equal(new Set(petReport.idle.map((sample) => sample.scale)).size, 1,
      `${petId} sprite scale changes during idle`);

    if (petId === 'argentina-number-10' || NEW_PET_IDS.has(petId)) {
      // Capture actual animation frames, not setFrame() approximations. Freeze only once
      // Phaser has naturally reached the requested frame, so short blink phases are visible.
      const captures = [];
      petReport.idleFrameCaptures = [];
      for (let frame = 24; frame <= 31; frame += 1) {
        const snapshot = await page.evaluate((target) => new Promise((resolve, reject) => {
          const avatar = window.__petGame.scene.getScene('Bedroom').avatar;
          const sprite = avatar.sprite;
          const timeout = setTimeout(() => {
            sprite.off('animationupdate', observe);
            reject(new Error(`Idle frame ${target} was not reached`));
          }, 5000);
          function observe() {
            if (Number(sprite.frame.name) !== target) return;
            clearTimeout(timeout); sprite.off('animationupdate', observe); sprite.anims.pause();
            const bounds = sprite.getBounds();
            const canvas = sprite.scene.game.canvas;
            const rect = canvas.getBoundingClientRect();
            const camera = sprite.scene.cameras.main;
            const sx = rect.width / canvas.width, sy = rect.height / canvas.height;
            resolve({ frame: target, x: avatar.x, y: avatar.y,
              scale: `${sprite.scaleX}:${sprite.scaleY}:${avatar.scaleX}:${avatar.scaleY}`,
              clip: { x: rect.left + (bounds.x - camera.scrollX) * sx,
                y: rect.top + (bounds.y - camera.scrollY) * sy,
                width: bounds.width * sx, height: bounds.height * sy } });
          }
          sprite.on('animationupdate', observe); observe();
        }), frame);
        const screenshot = await page.screenshot({ clip: snapshot.clip,
          path: path.join(artifactDir, `${petId}-idle-${frame}.png`) });
        captures.push(await sharp(screenshot).resize(240, 280, { fit: 'contain', background: '#edf2f7' }).png().toBuffer());
        petReport.idleFrameCaptures.push(snapshot);
        await page.evaluate(() => window.__petGame.scene.getScene('Bedroom').avatar.sprite.anims.resume());
      }
      assert.equal(new Set(petReport.idleFrameCaptures.map((s) => `${s.x}:${s.y}:${s.scale}`)).size, 1,
        `${petId} changes position or scale between captured idle frames`);
      await sharp({ create: { width: 960, height: 560, channels: 4, background: '#edf2f7' } })
        .composite(captures.map((input, i) => ({ input, left: (i % 4) * 240, top: Math.floor(i / 4) * 280 })))
        .png().toFile(path.join(artifactDir, `${petId}-idle-all-frames.png`));
    }

    await page.getByRole('button', { name: '休息' }).click();
    await page.waitForFunction(() => {
      const avatar = window.__petGame?.scene?.getScene('Bedroom')?.avatar;
      return avatar?.current === 'sleep' && Number(avatar?.sprite?.frame?.name) === 34;
    }, null, { timeout: 3000 });
    await page.locator('.room-stage').screenshot({ path: path.join(artifactDir, `${petId}-rest.png`) });
    petReport.rest = { action: 'sleep', frame: 34 };
    report.pets[petId] = petReport;
    console.log(`✓ ${petId}: ${Object.keys(petReport.directions).join('/')} 8-frame walk, fixed idle position, rest frame 34`);
  }

  await page.locator('[data-tab="shop"]').first().click();
  await page.locator('.shop-grid').waitFor({ timeout: 5000 });
  const mysteryCards = await page.evaluate((petIds) => petIds.map((petId) => {
    const button = document.querySelector(`[data-action="buy-direct-egg"][data-id="${petId}"]`);
    const card = button?.closest('.shop-card');
    const image = card?.querySelector('img');
    return {
      petId,
      mystery: card?.classList.contains('mystery-pet') ?? false,
      title: card?.querySelector('h3')?.textContent?.trim() ?? '',
      filter: image ? getComputedStyle(image).filter : 'missing',
    };
  }), PET_IDS);
  for (const card of mysteryCards) {
    assert.equal(card.mystery, true, `${card.petId} shop card lacks mystery styling`);
    assert.equal(card.title, '???', `${card.petId} leaks its name in the shop`);
    assert.notEqual(card.filter, 'none', `${card.petId} shop art is not a silhouette`);
    assert.match(card.filter,/brightness\(0\)/,`${card.petId} shop silhouette is not black`);
  }
  const normalCard = await page.evaluate(() => {
    const button = document.querySelector('[data-action="buy-direct-egg"][data-id="starpatch-cat"]');
    const card = button?.closest('.shop-card');
    const image = card?.querySelector('img');
    return { mystery: card?.classList.contains('mystery-pet') ?? false,
      title: card?.querySelector('h3')?.textContent?.trim() ?? '',
      filter: image ? getComputedStyle(image).filter : 'missing' };
  });
  assert.equal(normalCard.mystery, false, 'ordinary pet received mystery styling');
  assert.notEqual(normalCard.title, '???', 'ordinary pet name was hidden');
  assert.equal(normalCard.filter, 'none', 'ordinary pet artwork was filtered');
  await page.locator('.shop-grid').screenshot({ path: path.join(artifactDir, 'shop-mystery-pets.png') });
  report.shopMysteryCards = mysteryCards;
  console.log(`✓ shop hides all ${PET_IDS.length} special characters as black silhouettes named ???`);

  await page.locator('[data-tab="collection"]').first().click();
  await page.locator('.collection-grid').waitFor({ timeout: 5000 });
  const collectionMysteryCards = await page.evaluate((petIds) => petIds.map((petId) => {
    const card = document.querySelector(`.pet-card[data-species-id="${petId}"]`);
    const image = card?.querySelector('img');
    return {
      petId,
      mystery: card?.classList.contains('mystery-pet') ?? false,
      title: card?.querySelector('h3')?.textContent?.trim() ?? '',
      filter: image ? getComputedStyle(image).filter : 'missing',
    };
  }), PET_IDS);
  for (const card of collectionMysteryCards) {
    assert.equal(card.mystery, true, `${card.petId} collection card lacks mystery styling`);
    assert.equal(card.title, '???', `${card.petId} leaks its name in the collection`);
    assert.notEqual(card.filter, 'none', `${card.petId} collection art is not a silhouette`);
    assert.match(card.filter,/brightness\(0\)/,`${card.petId} collection silhouette is not black`);
  }
  const normalCollectionCard = await page.evaluate(() => {
    const card = document.querySelector('.pet-card[data-species-id="starpatch-cat"]');
    const image = card?.querySelector('img');
    return { mystery: card?.classList.contains('mystery-pet') ?? false,
      title: card?.querySelector('h3')?.textContent?.trim() ?? '',
      filter: image ? getComputedStyle(image).filter : 'missing' };
  });
  assert.equal(normalCollectionCard.mystery, false, 'ordinary collection pet received mystery styling');
  assert.notEqual(normalCollectionCard.title, '???', 'ordinary collection pet name was hidden');
  assert.equal(normalCollectionCard.filter, 'none', 'ordinary collection pet artwork was filtered');
  await page.locator('.collection-grid').screenshot({ path: path.join(artifactDir, 'collection-mystery-pets.png') });
  report.collectionMysteryCards = collectionMysteryCards;
  console.log(`✓ collection hides all ${PET_IDS.length} special characters as black silhouettes named ???`);

  assert.deepEqual(errors, [], `browser errors: ${errors.join('\n')}`);
  await fs.writeFile(path.join(artifactDir, selectedPet ? `report-${selectedPet}.json` : 'report.json'), JSON.stringify(report, null, 2));
  await context.close();
  console.log(`\nPremium character live playtest passed. Evidence: ${artifactDir}`);
} catch (error) {
  console.error(`Premium character live playtest failed. Server output:\n${logs}`);
  throw error;
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill('SIGTERM');
}
