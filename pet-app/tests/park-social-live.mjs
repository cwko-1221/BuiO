// Real signed-in browser participants; isolated temporary users and JSON store.
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
import { WORLD, clearLine, walkable } from '../lib/park-world.mjs';
const root = path.resolve('.'), build=path.resolve(process.env.PET_APP_TEST_DIST || 'pet-app/dist'), output = path.resolve(process.argv.find(a => a.startsWith('--output='))?.slice(9) || 'artifacts/pet-playtest/park-social');
await fs.mkdir(output, { recursive: true });
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-park-social-'));
process.env.BUIO_JSON_DB_FILE = path.join(temporary, 'db.json'); process.env.SUPABASE_DB_URL = '';
const passwordhash = bcrypt.hashSync('test', 4), users = [{ studentid: 'S001', name: '小晴', classname: '5A', role: 'student' }, { studentid: 'S002', name: '阿樂', classname: '5A', role: 'student' }, { studentid: 'S003', name: '小悠', classname: '5B', role: 'student' }, { studentid: 'T001', name: '老師', role: 'teacher' }].map(u => ({ ...u, language: 'zh-HK', passwordhash }));
await fs.writeFile(process.env.BUIO_JSON_DB_FILE, JSON.stringify({ users, studentStats: [], questionLogs: [], _logId: 0 }));
const require = createRequire(import.meta.url), pets = require('../repositories/pet.repo'), repo = require('../repositories/park.repo'), store = require('../../db/jsonStore');
let second;
for (let dy = -160; dy <= 160 && !second; dy += 40) for (let dx = -160; dx <= 160 && !second; dx += 40) if (Math.hypot(dx, dy) >= 140 && walkable(WORLD.spawn.x + dx, WORLD.spawn.y + dy) && clearLine(WORLD.spawn, { x: WORLD.spawn.x + dx, y: WORLD.spawn.y + dy })) second = { x: WORLD.spawn.x + dx, y: WORLD.spawn.y + dy };
assert.ok(second, 'need room for both real classmates near the spawn');
for (const [i, u] of users.filter(u => u.role === 'student').entries()) {
  await pets.ensureStudent(u.studentid); const data = store.load(), petId = randomUUID();
  data.petInstances.push({ petId, studentId: u.studentid, speciesId: i === 1 ? 'pudding-pig' : 'starpatch-cat', xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '', equippedSkills: [], equippedWearables: [] });
  Object.assign(data.petProfiles.find(p => p.studentId === u.studentid), { activePetId: petId, starterEggClaimed: true }); store.save();
  await repo.savePosition(u.studentid, i === 1 ? second : WORLD.spawn);
}
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); }); });
const server = spawn(process.execPath, ['server.js'], { cwd: root, windowsHide:true, env: { ...process.env, PORT: String(port), MOCK_AUTH: '0', NODE_ENV: 'development', PET_APP_DIST_DIR: build }, stdio: ['ignore', 'pipe', 'pipe'] });
let browser, logs = ''; const errors = [], pages = [], contexts = [], checks = [];
server.stdout.on('data', chunk => logs += chunk); server.stderr.on('data', chunk => logs += chunk);
const shot = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`) });
const pass = message => { checks.push(message); console.log('✓ ' + message); };
const ready = page => page.waitForFunction(() => window.__petPark?.social && window.__petPark.client.ready && window.__petPark.scene?.actors.size && document.querySelector('[data-park-loading]')?.hidden, {}, { timeout: 40000 });
const request = (page, event, body = {}) => page.evaluate(({ event, body }) => window.__petPark.client.request('park:social:' + event, body), { event, body });
async function open(page) { await page.locator('[data-park="peers"]').first().click(); await page.locator('.park-social-nearby').waitFor(); }
async function invite(from, peer, kind = 'duet') {
  await open(from); await from.locator(`[data-social="invite-${kind}"][data-peer="${peer}"]`).click(); await from.locator('.park-social-invitation').waitFor();
}
async function accept(page) { await page.locator('[data-social="accept"]').waitFor(); await page.locator('[data-social="accept"]').click(); }
try {
  const baseURL = `http://127.0.0.1:${port}`, deadline = Date.now() + 30000;
  while (true) { try { if ((await fetch(baseURL + '/health')).ok) break; } catch {} if (Date.now() > deadline) throw Error('Server did not become healthy'); await new Promise(r => setTimeout(r, 150)); }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [i, id] of ['S001', 'S002', 'S003'].entries()) {
    const context = await browser.newContext({ baseURL, viewport: i === 1 ? { width: 390, height: 844 } : { width: 1440, height: 960 }, hasTouch: i === 1 }); contexts.push(context);
    assert.equal((await context.request.post('/api/auth/login', { data: { studentId: id, password: 'test' } })).status(), 200);
    const page = await context.newPage(); pages.push(page); page.on('pageerror', error => errors.push(error.stack || error.message)); page.on('response', r => { if (r.url().includes('/pet/assets/') && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto('/pet'); await page.locator('[data-tab="park"]').click(); await ready(page);
    await page.evaluate(() => { window.__socialEvidence = []; window.__petPark.client.addEventListener('social', event => window.__socialEvidence.push(event.detail)); });
  }
  const [a, b, c] = pages;
  await a.waitForFunction(() => window.__petPark.client.peers.length === 2); assert.equal(await c.evaluate(() => window.__petPark.client.peers.length), 1);
  const peerPoint = await a.evaluate(() => { const s = window.__petPark.scene, pet = s.actors.get('S002').avatar, camera = s.cameras.main, r = document.querySelector('.park-canvas canvas').getBoundingClientRect(); return { x: r.x + (pet.x - camera.worldView.x) * camera.zoom, y: r.y + (pet.y - 75 - camera.worldView.y) * camera.zoom }; });
  await a.mouse.click(peerPoint.x, peerPoint.y); await a.locator('.park-social-nearby').waitFor(); await a.locator('[data-social="close-nearby"]').click();
  pass('clicking the actual classmate pet opens nearby interactions without moving into the pet');
  await assert.rejects(request(a, 'invite', { peerId: 'S003', kind: 'duet' }));
  await invite(a, 'S002'); await shot(a, '01-outgoing-invitation'); await shot(b, '02-phone-incoming-invitation');
  await a.waitForFunction(() => !window.__petPark.social.invitation, {}, { timeout: 18000 }); await b.waitForFunction(() => !window.__petPark.social.invitation);
  assert.equal(await a.evaluate(() => !!window.__petPark.social.session), false); pass('a real invitation expires without pulling either player into a game; different classes remain isolated');
  await invite(b, 'S001', 'highfive'); await accept(a);
  await a.waitForFunction(() => window.__socialEvidence.some(e => e.type === 'effect' && e.kind === 'highfive')); await b.waitForFunction(() => window.__socialEvidence.some(e => e.type === 'effect' && e.kind === 'highfive'));
  assert.equal(await c.evaluate(() => window.__socialEvidence.filter(e => e.type === 'effect').length), 0); await shot(a, '03-consenting-highfive'); pass('two classmates consent to one shared high-five; effects do not leak to another class');
  await invite(a, 'S002'); await accept(b); await a.waitForFunction(() => window.__petPark.social.session); await b.waitForFunction(() => window.__petPark.social.session);
  assert.equal(await a.evaluate(() => window.__petPark.social.session.id), await b.evaluate(() => window.__petPark.social.session.id));
  assert.equal(await a.evaluate(() => window.__petPark.social.session.role), 0); assert.equal(await b.evaluate(() => window.__petPark.social.session.role), 1);
  const movement = await a.evaluate(async () => { const f = window.__petPark.client.frames.get('S001'); try { await window.__petPark.client.move(f.x + 20, f.y); return 'allowed'; } catch (error) { return error.message; } });
  assert.match(movement, /合奏|雙人|同學|duet/i); await shot(a, '04-duet-countdown'); await shot(b, '05-phone-duet-countdown');
  for (let round = 0; round < 8; round++) {
    await a.waitForFunction(round => { const p = window.__petPark.social, s = p.session; return s?.game.phase === 'playing' && s.game.round === round && Date.now() + p.offset >= s.game.targetAt - 70 && Date.now() + p.offset < s.game.targetAt + 350; }, round, { timeout: 7000 });
    const [padA, padB] = await Promise.all([a.evaluate(() => { const s = window.__petPark.social.session; return s.game.pads[s.role]; }), b.evaluate(() => { const s = window.__petPark.social.session; return s.game.pads[s.role]; })]);
    const actions = [a.locator(`[data-social="pad"][data-pad="${padA}"]`).click()]; if (round !== 3) actions.push(b.locator(`[data-social="pad"][data-pad="${padB}"]`).click()); await Promise.all(actions);
    if (round === 4) { await shot(a, '06-playing-duet'); await shot(b, '07-phone-playing-duet'); }
    if (round === 4) {
      await b.setViewportSize({width:844,height:390});
      const targets=await b.locator('.park-social-pads button').evaluateAll(buttons=>buttons.map(b=>{const r=b.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
      assert.ok(targets.every(r=>r.x>=0&&r.y>=0&&r.x+r.width<=844&&r.y+r.height<=390&&r.height>=44&&r.width>=44));
      assert.ok(await b.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot(b,'07b-landscape-playing-duet');
    }
  }
  await a.waitForFunction(() => window.__petPark.social.session?.game.phase === 'result', {}, { timeout: 5000 }); await b.waitForFunction(() => window.__petPark.social.session?.game.phase === 'result');
  const resultA = await a.evaluate(() => window.__petPark.social.session.game), resultB = await b.evaluate(() => window.__petPark.social.session.game);
  assert.equal(resultA.duets, 7); assert.equal(resultA.history[3], false); assert.equal(resultA.stars, 3); assert.equal(resultA.score, resultB.score); assert.ok(resultA.score >= 700 && resultA.score <= 1050);
  await b.setViewportSize({width:390,height:844});
  assert.match(await a.locator('.park-social-game').innerText(), /已獲三星/);
  assert.ok(await b.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); await shot(a, '08-shared-result'); await shot(b, '09-phone-shared-result');
  const previousSession = await a.evaluate(() => window.__petPark.social.session.id);
  await a.locator('.park-social-result-actions [data-social="replay"]').click(); await accept(b); await a.waitForFunction(previous => window.__petPark.social.session?.id && window.__petPark.social.session.id !== previous, previousSession);
  pass('two browsers play all eight beats through real buttons; a missed partner beat gives no duet, scores match, and replay requests fresh consent');
  await contexts[1].close();
  await a.waitForFunction(() => !window.__petPark.social.session); pass('closing one browser cancels the duet for its classmate');
  const restored = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true }); contexts[1] = restored;
  await restored.request.post('/api/auth/login', { data: { studentId: 'S002', password: 'test' } }); const rejoined = await restored.newPage(); pages[1] = rejoined; rejoined.on('pageerror', error => errors.push(error.stack || error.message)); rejoined.on('response', r => { if (r.url().includes('/pet/assets/') && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); }); await rejoined.goto('/pet'); await rejoined.locator('[data-tab="park"]').click(); await ready(rejoined);
  await invite(rejoined, 'S001'); await accept(a); await a.waitForFunction(() => window.__petPark.social.session);
  const teacher = await browser.newContext({ baseURL }); contexts.push(teacher); await teacher.request.post('/api/auth/login', { data: { studentId: 'T001', password: 'test' } });
  assert.equal((await teacher.request.post('/api/pet/teacher/access', { data: { action: 'lock', classes: ['5A'], endsAt: null, note: '上課了' } })).status(), 200);
  await a.locator('.pet-access-overlay').waitFor(); await rejoined.locator('.pet-access-overlay').waitFor(); assert.equal(await a.locator('.park-social-game').count(), 0); await shot(a, '10-teacher-lock');
  await teacher.request.post('/api/pet/teacher/access', { data: { action: 'unlock', classes: ['5A'] } }); await ready(a); await ready(rejoined); pass('teacher locking ends both cooperative sessions and unlocking restores playable controls');
  await a.waitForTimeout(8200); await invite(a, 'S002', 'highfive'); await rejoined.locator('[data-social="decline"]').click(); await a.waitForFunction(() => !window.__petPark.social.invitation); await rejoined.waitForFunction(() => !window.__petPark.social.invitation);
  await assert.rejects(request(a, 'invite', { peerId: 'S002', kind: 'duet' })); pass('declining clears both prompts and prevents repeated invitations from disturbing the recipient');
  assert.deepEqual(errors, []); const report = { pass: true, build,htmlSha256:createHash('sha256').update(await fs.readFile(path.join(build,'index.html'))).digest('hex'),checks, errors, sharedResult: resultA, browser: 'Windows Chrome with real authenticated contexts', mobile: '390 × 844 and844 ×390 emulation; physical device not claimed' }; await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) {
  await Promise.all(pages.map((page, i) => shot(page, 'failure-' + i).catch(() => {}))); await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: error.stack, errors, logs: logs.slice(-5000) }, null, 2)); console.error(error.stack); process.exitCode = 1;
} finally {
  await browser?.close(); server.kill();
  if (path.dirname(temporary) === path.resolve(os.tmpdir()) && path.basename(temporary).startsWith('buio-park-social-')) await fs.rm(temporary, { recursive: true, force: true });
}
