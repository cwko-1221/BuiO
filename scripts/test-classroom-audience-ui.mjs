// Run: node scripts/test-classroom-audience-ui.mjs
// Builds the real React client into a temporary directory. No project server,
// real login, JSON store, PostgreSQL connection, or real account data is used.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire, Module } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { chromium, expect } from 'playwright/test';

const project = fileURLToPath(new URL('..', import.meta.url));
const clientRoot = path.join(project, 'whiteboard-app/client');
const artifacts = path.join(project, 'artifacts/classroom-audience-qa');
const require = createRequire(import.meta.url);
const clientRequire = createRequire(path.join(clientRoot, 'package.json'));
const { io: connectSocket } = clientRequire('socket.io-client');
const cookieName = 'classroom_audience_ui_fixture';
const restricted = [{ classNames: ['P1'], groupField: 'chineseGroup', groupNames: ['A'] }];
const roster = {
  academicYear: 'fixture-only', classes: ['P1', 'P2'],
  students: [
    { studentId: 'S1', name: 'Fixture One', className: 'P1', chineseGroup: 'A', englishGroup: 'B', mathGroup: '1' },
    { studentId: 'S2', name: 'Fixture Two', className: 'P1', chineseGroup: 'B', englishGroup: 'A', mathGroup: '2' },
    { studentId: 'S3', name: 'Fixture Three', className: 'P2', chineseGroup: 'A', englishGroup: 'B', mathGroup: '1' },
    { studentId: 'S4', name: 'Fixture Ungrouped', className: 'P2', chineseGroup: '', englishGroup: '', mathGroup: '' },
  ],
};
const identities = new Map();
const tokens = new Map();
for (const studentId of ['T1', 'T2', ...roster.students.map(student => student.studentId)]) {
  const token = randomUUID();
  tokens.set(studentId, token);
  identities.set(token, { role: studentId.startsWith('T') ? 'teacher' : 'student', studentId });
}

// This dependency is unused with rosterProvider. Block it before importing the
// real socket module so an accidental fallback fails, never reaches real data.
const yearsPath = require.resolve('../math-app/repositories/academic-years.repo');
assert.equal(require.cache[yearsPath], undefined, 'run the fixture in its own Node process');
const yearsStub = new Module(yearsPath);
yearsStub.filename = yearsPath;
yearsStub.loaded = true;
yearsStub.exports = new Proxy({}, {
  get(_target, property) {
    throw new Error(`Fixture attempted to access the real academic-year repository: ${String(property)}`);
  },
});
require.cache[yearsPath] = yearsStub;
const registerWhiteboard = require('../whiteboard-app/server/socket');

function assertDataIsolation() {
  for (const modulePath of ['../db/jsonStore', '../math-app/db/database', '../config']) {
    assert.equal(require.cache[require.resolve(modulePath)], undefined,
      `fixture must never load ${modulePath}`);
  }
}
assertDataIsolation();

function sessionFromCookies(headers) {
  const token = String(headers.cookie || '').split(';').map(part => part.trim())
    .find(part => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  return { ...identities.get(token) };
}

function nextEvent(socket, event, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, listener);
      reject(new Error(`Timed out waiting for socket event ${event}`));
    }, 8000);
    function listener(value) {
      if (!predicate(value)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(value);
    }
    socket.on(event, listener);
  });
}

async function buildClient(outDir) {
  const vite = path.join(clientRoot, 'node_modules/vite/bin/vite.js');
  assert.ok(existsSync(vite), 'install whiteboard client dependencies before running this test');
  const output = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
      cwd: clientRoot, windowsHide: true,
      env: { ...process.env, NODE_ENV: 'production', VITE_SERVER_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let logs = '';
    child.stdout.on('data', chunk => { logs += chunk; });
    child.stderr.on('data', chunk => { logs += chunk; });
    const timer = setTimeout(() => { child.kill(); }, 60000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('exit', code => {
      clearTimeout(timer);
      if (code === 0) resolve(logs);
      else reject(new Error(`Temporary whiteboard build failed (${code}):\n${logs}`));
    });
  });
  if (output.trim()) console.log(output.trim());
}

function createFixture(dist) {
  const app = express();
  const requests = [];
  const buzzerPosts = [];
  const buzzerSessions = new Map();
  const streams = new Set();
  app.use(express.json());
  app.use((req, res, next) => {
    req.session = sessionFromCookies(req.headers);
    if (req.path.startsWith('/api/')) {
      res.once('finish', () => requests.push({ method: req.method, path: req.path,
        studentId: req.session.studentId, status: res.statusCode }));
    }
    next();
  });
  app.get('/api/auth/me', (req, res) => {
    if (!req.session.studentId) return res.status(401).json({ success: false });
    res.json({ success: true, student: { ...req.session, id: req.session.studentId,
      name: req.session.studentId === 'T1' ? 'lesson' : `Fixture ${req.session.studentId}`, language: 'zh-HK' } });
  });
  app.get('/api/homework/meta', (_req, res) => res.json({ success: true, canAccess: false }));
  app.get('/api/stats/teacher/all-users', (_req, res) => res.json({ success: true,
    students: roster.students, academicYears: ['fixture-only'], currentAcademicYear: 'fixture-only' }));
  app.get('/api/pet/teacher/roster', (_req, res) => res.json({ success: true, students: roster.students }));

  // Only buzzer setup uses mocks: the UI/assets and shared editor are production
  // files, but create/read/time/SSE endpoints store fixture payloads in memory.
  app.use('/api/buzzer', (req, res, next) => {
    if (req.session.role !== 'teacher') return res.status(403).json({ success: false });
    next();
  });
  app.get('/api/buzzer/roster', (_req, res) => res.json({ success: true, ...roster }));
  app.get('/api/buzzer/time', (_req, res) => res.json({ success: true, serverNow: Date.now() }));
  app.get('/api/buzzer/sessions', (_req, res) => res.json({ success: true, sessions: [] }));
  app.post('/api/buzzer/sessions', (req, res) => {
    buzzerPosts.push(structuredClone(req.body));
    const session = { id: `fixture-buzzer-${buzzerPosts.length}`, revision: 1, round: 1,
      phase: 'waiting', points: req.body.points, audienceRules: req.body.audienceRules,
      targetLabel: 'Fixture classroom', participants: [], participantCount: 0, serverNow: Date.now() };
    buzzerSessions.set(session.id, session);
    res.json({ success: true, session });
  });
  app.get('/api/buzzer/sessions/:id', (req, res) => {
    const session = buzzerSessions.get(req.params.id);
    if (!session) return res.status(404).json({ success: false });
    res.json({ success: true, session });
  });
  app.get('/api/buzzer/sessions/:id/events', (req, res) => {
    const session = buzzerSessions.get(req.params.id);
    if (!session) return res.status(404).end();
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.flushHeaders();
    res.write(`data: ${JSON.stringify(session)}\n\n`);
    streams.add(res);
    const heartbeat = setInterval(() => res.write('event: heartbeat\ndata: {}\n\n'), 1000);
    req.on('close', () => { clearInterval(heartbeat); streams.delete(res); });
  });

  const server = createServer(app);
  const io = new Server(server);
  io.use((socket, next) => {
    // Deliberately ignore client auth/packet identity: the test-only cookie is
    // the sole source for socket.request.session, just as req.session is above.
    socket.request.session = sessionFromCookies(socket.request.headers);
    next();
  });
  registerWhiteboard(io, app, { rosterProvider: async () => structuredClone(roster), teacherReconnectGraceMs: 100 });
  io.on('connection', socket => socket.on('__fixture-barrier', acknowledge => acknowledge()));
  app.use('/shared', express.static(path.join(project, 'shared')));
  app.use('/src', express.static(path.join(project, 'src')));
  app.use('/math-app/images', express.static(path.join(project, 'math-app/public/images')));
  app.get('/', (_req, res) => res.sendFile(path.join(project, 'index.html')));
  app.use('/whiteboard', express.static(dist));
  app.get('/whiteboard/{*route}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  app.get('/class-teacher', (req, res) => res.redirect(`/whiteboard/class-teacher?${new URLSearchParams(req.query)}`));
  app.use('/buzzer/assets', express.static(path.join(project, 'buzzer-app/public')));
  app.get('/buzzer', (_req, res) => res.sendFile(path.join(project, 'buzzer-app/public/index.html')));
  app.get('/__audience-fixture', (_req, res) => res.type('html').send(
    '<!doctype html><html lang="zh-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Audience dialog fixture</title></head><body><form id="ancestor"><button type="button" id="opener">Open audience dialog</button></form></body></html>',
  ));
  app.get('/favicon.ico', (_req, res) => res.status(204).end());
  app.use((req, res) => res.status(404).json({ success: false, message: `Unmocked fixture route: ${req.method} ${req.path}` }));
  return { server, io, requests, buzzerPosts, streams };
}

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-classroom-audience-ui-'));
const screenshots = [];
const clients = [];
const contexts = [];
const pages = [];
const errors = [];
const externalRequests = [];
const uiFindings = [];
let fixture, browser, baseURL;

async function contextFor(studentId) {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: cookieName, value: tokens.get(studentId), url: baseURL,
    httpOnly: true, sameSite: 'Lax' }]);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === baseURL || ['data:', 'blob:'].includes(url.protocol)) return route.continue();
    externalRequests.push(url.href);
    return route.abort('blockedbyclient');
  });
  context.on('page', page => {
    pages.push(page);
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(10000);
  });
  contexts.push(context);
  return context;
}

async function api(context, pathname, options) {
  const response = await context.request.get(pathname, options);
  assert.equal(response.status(), 200, `GET ${pathname}`);
  return response.json();
}

async function socketFor(studentId, auth = {}) {
  const socket = connectSocket(baseURL, { autoConnect: false, forceNew: true,
    reconnection: false, transports: ['websocket'], timeout: 8000, auth,
    extraHeaders: { Cookie: `${cookieName}=${tokens.get(studentId)}` } });
  socket.received = [];
  socket.onAny((event, value) => socket.received.push({ event, value }));
  clients.push(socket);
  const connected = nextEvent(socket, 'connect');
  socket.connect();
  await connected;
  return socket;
}

async function joinStudent(socket, name) {
  const ready = nextEvent(socket, 'teacher-connection', value => value.connected);
  socket.emit('join-room', { roomId: 'lesson', name, isTeacher: false });
  await ready;
  assert.equal(fixture.io.sockets.sockets.get(socket.id).rooms.has('lesson'), true);
}

async function selectP1ChineseA(container) {
  await container.getByRole('button', { name: '新增範圍', exact: true }).click();
  const row = container.locator('[data-audience-range]').last();
  await row.getByRole('checkbox', { name: 'P1', exact: true }).check();
  await row.getByRole('combobox').selectOption('chineseGroup');
  assert.deepEqual(await row.locator('[data-audience-control="group"]').evaluateAll(inputs => inputs.map(input => input.value)), ['A', 'B']);
  await row.getByRole('checkbox', { name: 'A', exact: true }).check();
  await expect(container.locator('.classroom-audience__count')).toHaveText('符合範圍：1 / 4 位學生');
}

async function assertLoadedRestriction(dialog) {
  await expect(dialog.locator('[data-audience-range]')).toHaveCount(1);
  await expect(dialog.getByRole('checkbox', { name: 'P1', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'P2', exact: true })).not.toBeChecked();
  await expect(dialog.getByRole('combobox')).toHaveValue('chineseGroup');
  await expect(dialog.getByRole('checkbox', { name: 'A', exact: true })).toBeChecked();
  await expect(dialog.getByRole('checkbox', { name: 'B', exact: true })).not.toBeChecked();
  await expect(dialog.locator('.classroom-audience__count')).toHaveText('符合範圍：1 / 4 位學生');
}

async function captureDialog(page, filename) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const screenshot = path.join(artifacts, filename);
  await page.screenshot({ path: screenshot });
  screenshots.push(screenshot);
  const layout = await dialog.evaluate(node => {
    const bounds = node.getBoundingClientRect();
    const right = bounds.left + node.clientLeft + node.clientWidth;
    const controls = [...node.querySelectorAll('button,input,select')].filter(control => control.getClientRects().length);
    return { x: bounds.x, right: bounds.right, viewport: innerWidth,
      width: node.clientWidth, scrollWidth: node.scrollWidth,
      outside: controls.filter(control => {
        const rect = control.getBoundingClientRect();
        return rect.left < bounds.left - 1 || rect.right > right + 1;
      }).map(control => control.textContent || control.value) };
  });
  assert.ok(layout.x >= -1 && layout.right <= layout.viewport + 1, `${filename}: dialog fits viewport`);
  assert.ok(layout.scrollWidth <= layout.width + 1, `${filename}: no horizontal dialog overflow (${JSON.stringify(layout)})`);
  assert.deepEqual(layout.outside, [], `${filename}: controls fit dialog`);
}

async function checkTabletHeader(page) {
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.getByRole('button', { name: '班級／組別', exact: true })).toBeVisible();
  const screenshot = path.join(artifacts, '09-whiteboard-header-tablet-1024.png');
  await page.screenshot({ path: screenshot });
  screenshots.push(screenshot);
  const layout = await page.locator('header').evaluate(header => {
    const describe = node => {
      const rect = node.getBoundingClientRect();
      return { text: node.textContent.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    };
    const blocks = [...header.children].filter(node => node.getClientRects().length).map(describe);
    const controls = [...header.querySelectorAll('button,svg')].filter(node => node.getClientRects().length).map(describe);
    const overlap = [];
    for (let index = 1; index < blocks.length; index++) {
      const before = blocks[index - 1], after = blocks[index];
      if (before.right > after.left + 1 && Math.min(before.bottom, after.bottom) > Math.max(before.top, after.top)) {
        overlap.push([before, after]);
      }
    }
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
      headerWidth: header.clientWidth, headerScrollWidth: header.scrollWidth,
      outside: controls.filter(control => control.left < -1 || control.right > innerWidth + 1), overlap, blocks };
  });
  if (layout.documentWidth > 1025 || layout.headerScrollWidth > layout.headerWidth + 1
    || layout.outside.length || layout.overlap.length) {
    uiFindings.push({ issue: 'Whiteboard header overflows or overlaps at 1024px', screenshot, layout });
    console.error('UI FINDING:', JSON.stringify(uiFindings.at(-1)));
  } else console.log('PASS whiteboard 1024px tablet header: no overflow, overlapping header blocks, or offscreen controls');
  await page.setViewportSize({ width: 1440, height: 1000 });
}

async function openWhiteboardDialog(page, expectedRules) {
  const load = page.waitForResponse(response => response.url().endsWith('/api/whiteboard/sessions/lesson/audience')
    && response.request().method() === 'GET');
  await page.getByRole('button', { name: '班級／組別', exact: true }).click();
  const response = await load;
  assert.equal(response.status(), 200, 'React button loads the owner audience API');
  assert.deepEqual((await response.json()).audienceRules, expectedRules);
  const dialog = page.getByRole('dialog', { name: '白板課堂可見範圍', exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function saveWhiteboardDialog(page, rules) {
  const saved = page.waitForResponse(response => response.url().endsWith('/api/whiteboard/sessions/lesson/audience')
    && response.request().method() === 'PUT');
  await page.getByRole('dialog').getByRole('button', { name: '儲存設定', exact: true }).click();
  const response = await saved;
  assert.deepEqual(response.request().postDataJSON(), { audienceRules: rules });
  assert.equal(response.status(), 200, 'real whiteboard PUT accepts the editor selection');
  assert.deepEqual((await response.json()).audienceRules, rules);
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

async function testWhiteboard() {
  const teacher = await contextFor('T1');
  const matching = await contextFor('S1');
  const excluded = await contextFor('S2');
  const otherTeacher = await contextFor('T2');
  const page = await teacher.newPage();
  await page.goto('/whiteboard/class-teacher?room=lesson');
  await expect(page.getByRole('heading', { name: 'Class Module', exact: true })).toBeVisible();
  await expect.poll(async () => (await teacher.request.get('/api/whiteboard/sessions/lesson/audience')).status()).toBe(200);
  assert.deepEqual((await api(teacher, '/api/whiteboard/sessions/lesson/audience')).audienceRules, []);
  for (const context of [matching, excluded]) {
    assert.equal((await api(context, '/api/whiteboard/sessions')).sessions.some(row => row.roomCode === 'lesson'), true,
      'default [] is visible to every student in the portal session list');
  }
  const s1 = await socketFor('S1');
  const s2 = await socketFor('S2');
  await joinStudent(s1, 'Fixture One');
  await joinStudent(s2, 'Fixture Two');
  await expect(page.getByText('2 Students Connected', { exact: true })).toBeVisible();
  await checkTabletHeader(page);

  let dialog = await openWhiteboardDialog(page, []);
  await expect(dialog.locator('[data-audience-range]')).toHaveCount(0);
  await expect(dialog.locator('.classroom-audience__summary')).toHaveText('所有學生都能見到');
  await expect(dialog.locator('.classroom-audience__count')).toHaveText('符合範圍：4 / 4 位學生');
  await captureDialog(page, '01-whiteboard-default-desktop.png');
  await selectP1ChineseA(dialog);
  assert.equal((await dialog.textContent()).includes('Fixture One'), false, 'editor shows counts, never student names');
  await captureDialog(page, '02-whiteboard-restricted-desktop.png');
  const evicted = nextEvent(s2, 'error', message => message.includes('你不屬於這個課堂'));
  await saveWhiteboardDialog(page, restricted);
  await evicted;
  assert.equal(fixture.io.sockets.sockets.get(s1.id).rooms.has('lesson'), true);
  assert.equal(fixture.io.sockets.sockets.get(s2.id).rooms.has('lesson'), false, 'existing nonmatching sockets leave the room');
  await expect(page.getByText('1 Student Connected', { exact: true })).toBeVisible();
  assert.equal((await api(matching, '/api/whiteboard/sessions')).sessions.some(row => row.roomCode === 'lesson'), true);
  assert.equal((await api(excluded, '/api/whiteboard/sessions')).sessions.some(row => row.roomCode === 'lesson'), false);
  assert.equal((await api(excluded, '/api/room-type/lesson')).exists, false);
  assert.equal((await otherTeacher.request.get('/api/whiteboard/sessions/lesson/audience')).status(), 403,
    'roomId does not substitute for the bound owner StudentID');
  assert.equal((await otherTeacher.request.put('/api/whiteboard/sessions/lesson/audience', { data: { audienceRules: [] } })).status(), 403);

  // A direct transport join with matching payload/auth claims still has S2's
  // cookie-bound session. Also test class AND group using S3 (P2 Chinese A).
  for (const studentId of ['S2', 'S3']) {
    const attacker = await socketFor(studentId, { role: 'teacher', studentId: 'T1' });
    const denied = nextEvent(attacker, 'error', message => message.includes('你不屬於這個課堂'));
    attacker.emit('join-room', { roomId: 'lesson', isTeacher: false, name: 'Fixture One',
      studentId: 'S1', className: 'P1', chineseGroup: 'A' });
    await denied;
    assert.equal(fixture.io.sockets.sockets.get(attacker.id).rooms.has('lesson'), false,
      `${studentId} cannot bypass audience rules with a direct socket join`);
    const escalation = nextEvent(attacker, 'error', message => message.includes('只可設定自己的課堂'));
    attacker.emit('join-room', { roomId: 'lesson', isTeacher: true, name: 'Teacher' });
    await escalation;
    assert.equal(fixture.io.sockets.sockets.get(attacker.id).rooms.has('lesson'), false);
  }
  const drawCount = s1.received.filter(item => item.event === 'draw').length;
  s2.emit('draw', { state: 'start', x: 0.5, y: 0.5 });
  await s2.timeout(8000).emitWithAck('__fixture-barrier');
  assert.equal(s1.received.filter(item => item.event === 'draw').length, drawCount, 'evicted socket cannot draw into the room');

  dialog = await openWhiteboardDialog(page, restricted);
  await assertLoadedRestriction(dialog);
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.evaluate(node => { node.scrollTop = 0; });
  await captureDialog(page, '03-whiteboard-restricted-narrow.png');
  await dialog.getByRole('button', { name: '儲存設定', exact: true }).scrollIntoViewIfNeeded();
  await captureDialog(page, '04-whiteboard-actions-narrow.png');
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeInViewport();
  await expect(dialog.getByRole('button', { name: '儲存設定', exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 360, height: 800 });
  await captureDialog(page, '05-whiteboard-dialog-360.png');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.deepEqual((await api(teacher, '/api/whiteboard/sessions/lesson/audience')).audienceRules, restricted);
  await page.setViewportSize({ width: 1440, height: 1000 });
  dialog = await openWhiteboardDialog(page, restricted);
  await assertLoadedRestriction(dialog);
  await dialog.getByRole('button', { name: '移除範圍 1', exact: true }).click();
  await expect(dialog.locator('[data-audience-range]')).toHaveCount(0);
  await expect(dialog.locator('.classroom-audience__summary')).toHaveText('所有學生都能見到');
  await expect(dialog.locator('.classroom-audience__count')).toHaveText('符合範圍：4 / 4 位學生');
  await saveWhiteboardDialog(page, []);
  assert.equal((await api(excluded, '/api/whiteboard/sessions')).sessions.some(row => row.roomCode === 'lesson'), true);
  await joinStudent(s2, 'Fixture Two');
  assert.deepEqual(JSON.parse(await page.evaluate(() => sessionStorage.getItem('whiteboard-audience:lesson'))), []);
  console.log('PASS real React ClassTeacher: load/edit/save/reload/cancel/clear, portal filtering, owner identity, socket eviction, spoof-proof joins, restored access, and desktop/narrow dialog layout');
}

async function testSharedDialog() {
  const teacher = await contextFor('T1');
  const page = await teacher.newPage();
  await page.goto('/__audience-fixture');
  await page.evaluate(async () => {
    const { openAudienceDialog } = await import('/shared/classroom-audience-dialog.mjs');
    window.fixtureConfirmations = [];
    window.fixtureSubmissions = 0;
    document.querySelector('#ancestor').addEventListener('submit', event => { event.preventDefault(); window.fixtureSubmissions++; });
    window.startFixtureDialog = (rules, hold = false) => {
      window.fixtureResult = { done: false };
      void openAudienceDialog({ title: '<Fixture> "Audience"', rules,
        onConfirm: async nextRules => {
          window.fixtureConfirmations.push(structuredClone(nextRules));
          if (hold) await new Promise(resolve => { window.releaseConfirmation = resolve; });
        },
      }).then(value => { window.fixtureResult = { done: true, value }; });
    };
  });
  const start = async rules => {
    await page.evaluate(rules => window.startFixtureDialog(rules), rules);
    const dialog = page.getByRole('dialog', { name: '<Fixture> "Audience"', exact: true });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  const result = async () => {
    await page.waitForFunction(() => window.fixtureResult.done);
    return page.evaluate(() => window.fixtureResult.value);
  };
  let dialog = await start([]);
  await expect(dialog.locator('[data-audience-range]')).toHaveCount(0);
  await expect(dialog.locator('h2')).toHaveText('<Fixture> "Audience"');
  await dialog.getByRole('button', { name: '儲存設定', exact: true }).click();
  assert.deepEqual(await result(), []);
  dialog = await start([]);
  await selectP1ChineseA(dialog);
  assert.deepEqual(await page.evaluate(() => window.fixtureConfirmations), [[]], 'editing alone cannot submit the dialog');
  await captureDialog(page, '06-shared-dialog-desktop.png');
  await dialog.getByRole('button', { name: '儲存設定', exact: true }).click();
  assert.deepEqual(await result(), restricted);
  assert.deepEqual(await page.evaluate(() => window.fixtureConfirmations), [[], restricted]);
  dialog = await start(restricted);
  await assertLoadedRestriction(dialog);
  await dialog.getByRole('button', { name: '移除範圍 1', exact: true }).click();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await result(), null);
  assert.deepEqual(await page.evaluate(() => window.fixtureConfirmations), [[], restricted], 'cancel does not call onConfirm');
  dialog = await start(restricted);
  await assertLoadedRestriction(dialog);
  await page.keyboard.press('Escape');
  assert.equal(await result(), null);
  assert.equal(await page.evaluate(() => window.fixtureSubmissions), 0, 'editor controls do not submit an ancestor form');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  assert.equal(await page.locator('link[data-classroom-style]').count(), 2, 'reopening does not duplicate shared stylesheets');

  dialog = await start([{ classNames: ['P1'], groupField: 'chineseGroup', groupNames: ['missing-fixture-group'] }]);
  await expect(dialog.locator('.classroom-audience__count')).toHaveText('符合範圍：0 / 4 位學生');
  await expect(dialog.getByRole('button', { name: '儲存設定', exact: true })).toBeDisabled();
  await dialog.getByRole('button', { name: '移除範圍 1', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '儲存設定', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal(await result(), null);

  await page.evaluate(rules => window.startFixtureDialog(rules, true), restricted);
  dialog = page.getByRole('dialog');
  await assertLoadedRestriction(dialog);
  await dialog.getByRole('button', { name: '儲存設定', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '儲存設定', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '移除範圍 1', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '儲存設定', exact: true })).toBeDisabled();
  await dialog.locator('form').evaluate(form => form.requestSubmit());
  assert.deepEqual(await page.evaluate(() => window.fixtureConfirmations), [[], restricted, restricted],
    'pending save cannot submit a second confirmation, even after another edit');
  await page.evaluate(() => window.releaseConfirmation());
  assert.deepEqual(await result(), restricted, 'pending confirmation keeps the submitted snapshot');
  console.log('PASS browser ESM openAudienceDialog: start/save/cancel/Escape, current-rule load, initial zero-match disable, pending-submit guard, escaping, style deduplication, and form safety');
}

async function testPortalLauncher() {
  const teacher = await contextFor('T1');
  // Close only the fixture room before exercising the actual portal launcher.
  await teacher.request.post('/api/whiteboard/sessions/end', { data: { roomId: 'lesson' } });
  const page = await teacher.newPage();
  await page.goto('/');
  await expect(page.locator('#openBoardBtn')).toBeVisible();
  await page.locator('#openBoardBtn').click();
  let dialog = page.getByRole('dialog', { name: '白板課堂可見範圍', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-audience-range]')).toHaveCount(0);
  await expect(dialog.locator('.classroom-audience__summary')).toHaveText('所有學生都能見到');
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  assert.equal(new URL(page.url()).pathname, '/', 'portal cancellation does not navigate or start a classroom');
  assert.equal((await api(teacher, '/api/whiteboard/sessions')).sessions.length, 0);

  await page.locator('#openBoardBtn').click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await Promise.all([
    page.waitForURL('**/whiteboard/class-teacher?room=lesson'),
    dialog.getByRole('button', { name: '開始課堂', exact: true }).click(),
  ]);
  await expect.poll(async () => (await teacher.request.get('/api/whiteboard/sessions/lesson/audience')).status()).toBe(200);
  assert.deepEqual((await api(teacher, '/api/whiteboard/sessions/lesson/audience')).audienceRules, [],
    'actual portal main.js starts a default-all room through the React socket');
  await teacher.request.post('/api/whiteboard/sessions/end', { data: { roomId: 'lesson' } });
  await page.goto('/');
  await expect(page.locator('#openBoardBtn')).toBeVisible();
  await page.locator('#openBoardBtn').click();
  dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await selectP1ChineseA(dialog);
  await captureDialog(page, '10-portal-start-dialog-desktop.png');
  await Promise.all([
    page.waitForURL('**/whiteboard/class-teacher?room=lesson'),
    dialog.getByRole('button', { name: '開始課堂', exact: true }).click(),
  ]);
  await expect.poll(async () => (await teacher.request.get('/api/whiteboard/sessions/lesson/audience')).status()).toBe(200);
  assert.deepEqual((await api(teacher, '/api/whiteboard/sessions/lesson/audience')).audienceRules, restricted,
    'portal selection survives sessionStorage handoff into the real React room join');
  assert.deepEqual(JSON.parse(await page.evaluate(() => sessionStorage.getItem('whiteboard-audience:lesson'))), restricted);
  await openWhiteboardDialog(page, restricted);
  await assertLoadedRestriction(page.getByRole('dialog'));
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  console.log('PASS actual portal src/main.js: whiteboard button opens native dialog, cancel stays on portal, default/restricted starts use basename URL, and initial rules reach the real socket room');
}

async function testBuzzerSetup() {
  for (const rules of [[], restricted]) {
    const teacher = await contextFor('T1');
    const page = await teacher.newPage();
    await page.goto('/buzzer');
    await expect(page.getByRole('heading', { name: '開啟搶答課堂', exact: true })).toBeVisible();
    const editor = page.locator('#audienceEditor');
    await expect(editor.locator('[data-audience-range]')).toHaveCount(0);
    await expect(editor.locator('.classroom-audience__summary')).toHaveText('所有學生都能見到');
    await expect(editor.locator('.classroom-audience__count')).toHaveText('符合範圍：4 / 4 位學生');
    const previousPosts = fixture.buzzerPosts.length;
    if (rules.length) {
      await selectP1ChineseA(editor);
      assert.equal(fixture.buzzerPosts.length, previousPosts, 'audience edits never submit buzzer setup');
      await page.screenshot({ path: path.join(artifacts, '07-buzzer-restricted-desktop.png'), fullPage: true });
      screenshots.push(path.join(artifacts, '07-buzzer-restricted-desktop.png'));
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: path.join(artifacts, '08-buzzer-restricted-narrow.png'), fullPage: true });
      screenshots.push(path.join(artifacts, '08-buzzer-restricted-narrow.png'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'narrow buzzer setup does not overflow');
      const choiceDirections = await editor.locator('.classroom-audience__choice')
        .evaluateAll(nodes => nodes.map(node => getComputedStyle(node).flexDirection));
      assert.deepEqual([...new Set(choiceDirections)], ['row'],
        'buzzer class and group checkbox captions stay horizontal despite global label styles');
    }
    const points = Number(await page.locator('#points').inputValue());
    const posted = page.waitForResponse(response => response.url().endsWith('/api/buzzer/sessions')
      && response.request().method() === 'POST');
    await page.getByRole('button', { name: '開始課堂', exact: true }).click();
    const response = await posted;
    assert.equal(response.status(), 200);
    assert.deepEqual(response.request().postDataJSON(), { audienceRules: rules, points });
    assert.deepEqual(fixture.buzzerPosts.at(-1), { audienceRules: rules, points });
    await expect(page.getByRole('heading', { name: '搶答課堂', exact: true })).toBeVisible();
    await teacher.close();
  }
  console.log('PASS production buzzer setup: default-all and P1 Chinese A POST payloads, no edit-triggered submission, and desktop/narrow UI (mock endpoints only)');
}

try {
  await fs.mkdir(artifacts, { recursive: true });
  console.log('Building the real whiteboard client in a temporary directory...');
  await buildClient(path.join(temporary, 'whiteboard'));
  fixture = createFixture(path.join(temporary, 'whiteboard'));
  await new Promise((resolve, reject) => {
    fixture.server.once('error', reject);
    fixture.server.listen(0, '127.0.0.1', resolve);
  });
  baseURL = `http://127.0.0.1:${fixture.server.address().port}`;
  const executablePath = [process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean).find(existsSync);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  await testWhiteboard();
  await testSharedDialog();
  await testBuzzerSetup();
  await testPortalLauncher();
  assertDataIsolation();
  assert.deepEqual(errors, [], 'no browser runtime errors');
  assert.deepEqual(externalRequests, [], 'all browser requests stay on the isolated fixture origin');
  assert.equal(fixture.requests.some(request => request.path === '/api/classroom-audience/options' && request.status === 200), true);
  console.log('PASS isolation: real data modules never loaded; only test cookies, temporary build, in-memory rooms/mock payloads, and loopback requests');
  console.log(`Screenshots:\n${screenshots.join('\n')}`);
  assert.deepEqual(uiFindings, [], 'all required UI layouts pass; concrete findings above need a source fix');
} catch (error) {
  for (const page of pages.filter(page => !page.isClosed())) {
    const failure = path.join(artifacts, `failure-${pages.indexOf(page) + 1}.png`);
    await page.screenshot({ path: failure }).catch(() => {});
  }
  console.error('Browser errors:', errors);
  console.error('Recent fixture API requests:', fixture?.requests.slice(-12));
  throw error;
} finally {
  // End rooms before closing teacher pages so reconnect timers cannot outlive
  // the fixture. Only this test's in-memory server receives the request.
  if (fixture?.server.listening) {
    await fetch(`${baseURL}/api/whiteboard/sessions/end`, { method: 'POST',
      headers: { Cookie: `${cookieName}=${tokens.get('T1')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: 'lesson' }), signal: AbortSignal.timeout(2000),
    }).catch(() => {});
  }
  for (const socket of clients) socket.disconnect();
  for (const context of contexts) await context.close().catch(() => {});
  await browser?.close();
  if (fixture) {
    for (const stream of fixture.streams) stream.end();
    await new Promise(resolve => fixture.io.close(resolve));
    if (fixture.server.listening) await new Promise(resolve => fixture.server.close(resolve));
  }
  const relative = path.relative(os.tmpdir(), temporary);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    && path.basename(temporary).startsWith('buio-classroom-audience-ui-'), 'cleanup stays inside the generated temporary directory');
  await fs.rm(temporary, { recursive: true, force: true });
  delete require.cache[yearsPath];
}
