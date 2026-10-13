import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { chromium, webkit } from 'playwright';
import { requestJson, startQuestionSession } from '../tower-defense-app/public/js/session-start.js';

const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.TOWER_START_QA_OUT || 'tmp/tower-defense-start-20261013');
mkdirSync(output, { recursive: true });
const baseline = process.argv.includes('--baseline');
const require = createRequire(import.meta.url);
const clientRequire = createRequire(resolve(root, 'whiteboard-app/client/package.json'));
const { io: connect } = clientRequire('socket.io-client');
// Import the real router/socket code behind strict local stubs. No .env, school
// database, credentials or existing JSON data are loaded by this fixture.
for (const [file, exports] of [['../config', { isProd: false }],
  ['../game-app/repositories/questionSets.repo', { pgAvailable: () => false,
    getSetWithQuestions: () => { throw new Error('Fixture must never access a school question bank'); } }]]) {
  const filename = require.resolve(file);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
const questions = require('../tower-defense-app/routes/questions');
const register = require('../tower-defense-app/server/socket');
const { rooms } = require('../tower-defense-app/lib/classrooms');
const app = express();
const policies = new Map(), responses = new Map(), attempts = new Map();
app.use(express.json());
app.use((req, _res, next) => {
  const cookie = req.headers.cookie?.split(';').map(value => value.trim()).find(value => value.startsWith('qa-student='));
  req.session = { studentId: req.get('x-qa-student') || cookie?.slice('qa-student='.length) || 'qa-default', role: 'student' };
  next();
});
app.get('/api/auth/me', (req, res) => res.json({ student: { id: req.session.studentId, name: 'Startup QA' } }));
app.post('/api/tower-defense/session', (req, res, next) => {
  const owner = req.session.studentId, policy = policies.get(owner) || {};
  const count = (attempts.get(owner) || 0) + 1;
  attempts.set(owner, count);
  if (policy.hang) return;
  if (count <= (policy.fail || 0)) return res.status(503).json({ success: false, message: 'Temporarily unavailable' });
  const json = res.json.bind(res);
  res.json = data => {
    const saved = responses.get(owner) || []; saved.push(data); responses.set(owner, saved);
    if (policy.drop && count === 1) { res.socket.destroy(); return res; }
    if (policy.delay) { setTimeout(() => json(data), policy.delay); return res; }
    return json(data);
  };
  next();
});
app.use('/api/tower-defense', questions);
// Managed worktrees live under .codex; sendFile otherwise ignores that ancestor.
app.get(['/tower-defense', '/tower-defense/preview'], (_req, res) => res.sendFile(resolve(root, 'tower-defense-app/public/index.html'), { dotfiles: 'allow' }));
app.get('/tower-defense/teacher/preview', (_req, res) => res.sendFile(resolve(root, 'tower-defense-app/public/teacher.html'), { dotfiles: 'allow' }));
if (baseline) {
  app.get('/tower-defense/js/main.js', (_req, res) => res.type('js').send(execFileSync('git',
    ['show', 'f6d569ec:tower-defense-app/public/js/main.js'], { encoding: 'utf8' })));
}
app.use('/tower-defense', express.static(resolve(root, 'tower-defense-app/public')));
app.use('/shared', express.static(resolve(root, 'shared')));
app.get('/vendor/phaser/4.2.1/phaser.min.js', (_req, res) => res.sendFile(resolve(root, 'node_modules/phaser/dist/phaser.min.js'), { dotfiles: 'allow' }));
app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ success: false, message: error.message }));
const server = createServer(app), io = new Server(server);
register(io, app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const actors = [];
const socket = async () => {
  const actor = connect(`${base}/tower-defense`, { transports: ['websocket'], reconnection: false }); actors.push(actor);
  await new Promise((resolve, reject) => { actor.once('connect', resolve); actor.once('connect_error', reject); });
  return actor;
};
const emit = (actor, event, payload) => new Promise((resolve, reject) => {
  const ack = (error, data) => error ? reject(error) : resolve(data);
  if (payload === undefined) actor.timeout(5000).emit(event, ack);
  else actor.timeout(5000).emit(event, payload, ack);
});
async function classroom() {
  const teacher = await socket(), created = await emit(teacher, 'host:create', {});
  assert.equal(created.ok, true);
  return { teacher, code: created.code };
}
async function post(owner, path, body) {
  const response = await fetch(`${base}/api/tower-defense${path}`, { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-qa-student': owner }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
const chromePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const reports = [];

function blockedAudio({ mode }) {
  const Native = window.AudioContext || window.webkitAudioContext || class {
    constructor() { this.destination = {}; this.currentTime = 0; }
    createGain() { return { connect() {}, gain: { value: 1, cancelScheduledValues() {}, setTargetAtTime() {} } }; }
  };
  window.__qaAudioResumeCalls = 0;
  window.AudioContext = function () {
    const context = new Native();
    Object.defineProperty(context, 'state', { get: () => 'suspended' });
    context.resume = () => {
      window.__qaAudioResumeCalls++;
      if (mode === 'reject') return Promise.reject(new Error('Audio permission denied'));
      return new Promise(() => {});
    };
    return context;
  };
}
async function student(browser, owner, room, { audio = 'pending' } = {}) {
  const context = await browser.newContext({ viewport: baseline ? { width: 1366, height: 900 } : { width: 1024, height: 700 }, hasTouch: true, isMobile: true });
  await context.addCookies([{ name: 'qa-student', value: owner, url: base }]);
  if (audio) await context.addInitScript(blockedAudio, { mode: audio });
  const page = await context.newPage();
  page.on('pageerror', error => console.error('CLIENT ERROR', owner, error.message));
  page.on('dialog', dialog => void dialog.dismiss());
  await page.goto(`${base}/tower-defense?autojoin=1&room=${room.code}`);
  try { await page.waitForSelector('#menuScreen.active'); }
  catch (error) {
    await page.screenshot({ path: resolve(output, `${owner}-join-failure.png`) });
    console.error('JOIN DIAGNOSTIC', owner, await page.evaluate(() => ({ url: location.href,
      classroom: window.__towerDefense?.classroom, screen: document.querySelector('.screen.active')?.id,
      error: document.querySelector('#joinError')?.textContent,
      scripts: [...document.scripts].map(s => s.src) })));
    throw error;
  }
  await page.locator('[data-map="starport"]').tap();
  await page.waitForFunction(() => window.__towerDefense.classroom?.phase === 'lobby');
  for (let i = 0; i < 100 && !rooms.get(room.code)?.players.get(`s:${owner}`)?.mapId; i++) await page.waitForTimeout(20);
  assert.equal(rooms.get(room.code).players.get(`s:${owner}`).mapId, 'starport');
  return { context, page };
}
async function deployed(page) {
  try { await page.waitForSelector('#gameScreen.active canvas', { timeout: 15000 }); }
  catch(error){console.error('DEPLOY DIAGNOSTIC',await page.evaluate(()=>({url:location.href,classroom:window.__towerDefense?.classroom,audio:window.__towerDefense?.audioState,lastError:window.__towerDefense?.lastError,resumes:window.__qaAudioResumeCalls,button:document.querySelector('#startCampaignBtn')?.textContent,screen:document.querySelector('.screen.active')?.id})));throw error;}
  await page.waitForFunction(() => !!window.__towerDefense.scene);
}

try {
  if (!baseline) {
    // Timeouts also cover a response whose headers arrived but body never ends.
    for (const fetcher of [() => new Promise(() => {}), async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })]) {
      await assert.rejects(requestJson('/fixture', {}, { timeoutMs: 25, fetcher }), error => error.code === 'REQUEST_TIMEOUT');
    }
    const abort = new AbortController();
    const pending = requestJson('/fixture', { signal: abort.signal }, { fetcher: () => new Promise(() => {}) });
    abort.abort(); await assert.rejects(pending, error => error.name === 'AbortError');
    let permanentCalls = 0;
    await assert.rejects(startQuestionSession(async () => { permanentCalls++; throw Object.assign(new Error('Forbidden'), { status: 403 }); }, {}, new AbortController().signal));
    assert.equal(permanentCalls, 1, 'permission failures are not retried');

    const load = await classroom();
    const students = await Promise.all(Array.from({ length: 30 }, async (_, index) => {
      const owner = `load-${index}`, player = await socket();
      assert.equal((await emit(player, 'player:join', { code: load.code, studentId: owner, name: 'Load QA' })).ok, true);
      assert.equal((await emit(player, 'player:select-map', { mapId: 'starport' })).ok, true);
      return { owner, player };
    }));
    assert.equal((await emit(load.teacher, 'host:start')).ok, true);
    await Promise.all(students.map(async ({ owner }) => {
      const body = { roomCode: load.code, startRequestId: `start-load-request-${owner}` };
      const [first, replay] = await Promise.all([post(owner, '/session', body), post(owner, '/session', body)]);
      assert.equal(first.status, 201); assert.equal(first.data.sessionId, replay.data.sessionId);
      const question = await post(owner, '/question', { sessionId: first.data.sessionId });
      assert.equal(question.data.question.choices.length, 4);
      const denied = await post('other-student', '/question', { sessionId: first.data.sessionId });
      assert.equal(denied.status, 404, 'session retries do not bypass ownership');
    }));
    reports.push({ scenario: '30 simultaneous students', sessions: 30, duplicateSessionIds: 0 });
    load.teacher.emit('host:close');
  }

  for (const [engine, type, launch] of [['chromium', chromium, chromePath ? { executablePath: chromePath } : {}], ['webkit', webkit, {}]]) {
    const browser = await type.launch({ headless: true, ...launch });
    try {
      for (const mode of baseline ? ['pending'] : ['pending', 'reject', 'normal']) {
        const room = await classroom(), owner = `${engine}-${mode}`;
        if (!baseline && mode === 'pending') policies.set(owner, { delay: 400 });
        const { context, page } = await student(browser, owner, room, { audio: mode === 'normal' ? null : mode });
        assert.equal((await emit(room.teacher, 'host:start')).ok, true);
        if (!baseline) io.of('/tower-defense').to(room.code).emit('classroom:start', {});
        if (baseline) {
          await page.waitForFunction(() => window.__qaAudioResumeCalls > 0, null, {timeout:5000});
          await page.waitForTimeout(1000);
          assert.equal(attempts.get(owner) || 0, 0, 'old client waits on audio before sending any bank request');
          assert.equal(await page.locator('#startCampaignBtn').isDisabled(), true);
          assert.match(await page.locator('#startCampaignBtn span').textContent(), /同步|Syncing/);
          await page.screenshot({ path: resolve(output, `${engine}-baseline-stuck.png`), fullPage: true });
        } else {
          await deployed(page);
          if (mode === 'normal' && engine === 'chromium') assert.equal(await page.evaluate(() => window.__towerDefense.audioState.musicActive), true);
          if (mode !== 'normal') assert.equal(await page.evaluate(() => window.__towerDefense.audioState.musicActive), false, 'blocked audio does not accumulate scheduled music');
          const firstSession = responses.get(owner)[0].sessionId;
          io.of('/tower-defense').to(room.code).emit('classroom:start', {});
          await page.waitForTimeout(100);
          assert.equal(attempts.get(owner), 1, 'duplicate starts do not replace a running campaign');
          await page.locator('#quizBtn').tap();
          await page.waitForSelector('#questionPanel.open .choice-button');
          await page.screenshot({ path: resolve(output, `${engine}-${mode}-deployed.png`) });
          assert.equal(responses.get(owner)[0].sessionId, firstSession);
        }
        reports.push({ engine, audio: mode, baseline, sessionRequests: attempts.get(owner) || 0 });
        room.teacher.emit('host:close'); await context.close();
      }
      if (baseline) continue;

      // A missing download retries only missing textures, preserving the bank
      // session and keeping simulation time frozen until the canvas is ready.
      {
        const room = await classroom(), owner = `${engine}-asset-recovery`;
        const { context, page } = await student(browser, owner, room);
        let blocked = true;
        await page.route('**/tower-defense/assets/maps/starport.webp', route => blocked ? route.abort('failed') : route.continue());
        await emit(room.teacher, 'host:start');
        await page.locator('.buio-loading-panel').waitFor();
        assert.equal(await page.evaluate(() => window.__towerDefense.scene), null);
        const firstSession = responses.get(owner)[0].sessionId;
        await page.screenshot({ path: resolve(output, `${engine}-asset-recovery-loading.png`) });
        blocked = false;
        await deployed(page);
        await page.locator('.buio-loading-panel').waitFor({ state: 'hidden' });
        assert.equal(attempts.get(owner), 1);
        assert.equal(responses.get(owner)[0].sessionId, firstSession);
        await page.screenshot({ path: resolve(output, `${engine}-asset-recovered.png`) });
        reports.push({ engine, scenario: 'missing asset recovers without reload or new bank session', requests: 1 });
        room.teacher.emit('host:close'); await context.close();
      }

      for (const [scenario, policy] of [['lost-response', { drop: true }], ['temporary-failure', { fail: 1 }], ['manual-retry', { fail: 2 }]]) {
        const room = await classroom(), owner = `${engine}-${scenario}`;
        policies.set(owner, policy);
        const { context, page } = await student(browser, owner, room);
        await emit(room.teacher, 'host:start');
        if (scenario === 'manual-retry') {
          await page.waitForFunction(() => !document.querySelector('#startCampaignBtn').disabled);
          assert.equal(attempts.get(owner), 2);
          await page.locator('#startCampaignBtn').scrollIntoViewIfNeeded();
          await page.screenshot({ path: resolve(output, `${engine}-retry-button.png`) });
          policies.delete(owner);
          await page.locator('#startCampaignBtn').tap();
        }
        await deployed(page);
        if (scenario === 'lost-response') {
          assert.equal(responses.get(owner).length, 2);
          assert.equal(responses.get(owner)[0].sessionId, responses.get(owner)[1].sessionId, 'a lost acknowledgement reuses the committed session');
        }
        reports.push({ engine, scenario, attempts: attempts.get(owner) });
        room.teacher.emit('host:close'); await context.close();
      }

      // A student misses the start event while disconnected. Rejoin restores the
      // chosen map and obtains the authoritative playing state before deploying.
      const room = await classroom(), owner = `${engine}-reconnect`;
      const buddy = await socket();
      await emit(buddy, 'player:join', { code: room.code, studentId: `${owner}-buddy` });
      await emit(buddy, 'player:select-map', { mapId: 'starport' });
      const { context, page } = await student(browser, owner, room);
      await context.setOffline(true);
      const studentSocket = [...io.of('/tower-defense').sockets.values()].find(s => s.data.playerKey === `s:${owner}`);
      studentSocket.conn.close();
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.equal((await emit(room.teacher, 'host:start')).ok, true);
      await context.setOffline(false);
      await deployed(page);
      const before = attempts.get(owner);
      [...io.of('/tower-defense').sockets.values()].find(s => s.data.playerKey === `s:${owner}`).conn.close();
      await page.waitForTimeout(2500);
      assert.equal(attempts.get(owner), before, 'reconnecting after deployment preserves the existing campaign');
      assert.equal(await page.locator('#gameScreen').evaluate(el => el.classList.contains('active')), true);
      reports.push({ engine, scenario: 'missed start and reconnect', requests: before });
      room.teacher.emit('host:close'); await context.close();
    } finally { await browser.close(); }
  }
  writeFileSync(resolve(output, baseline ? 'baseline.json' : 'report.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify({ passed: reports.length, baseline, output, reports }, null, 2));
  if (process.argv.includes('--full')) {
    const result = await promisify(execFile)(process.execPath, ['scripts/test-tower-defense-live.mjs'],
      { cwd: root, env: { ...process.env, TOWER_DEFENSE_BASE_URL: base }, maxBuffer: 1024 * 1024 });
    console.log(result.stdout); if (result.stderr) console.error(result.stderr);
  }
} finally {
  for (const actor of actors) actor.disconnect();
  rooms.clear();
  await new Promise(resolve => io.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
