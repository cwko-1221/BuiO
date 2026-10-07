import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../../', import.meta.url));
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-buzzer-audience-'));
const databaseFile = path.join(temporary, 'db.json');
const port = await new Promise(resolve => {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); });
});
const baseURL = `http://127.0.0.1:${port}`;
await fs.writeFile(databaseFile, JSON.stringify({ users: [
  { studentid: 'T1', name: '老師', role: 'teacher', passwordhash: bcrypt.hashSync('teacher123', 4) },
  { studentid: 'T2', name: 'Teacher', role: 'teacher', language: 'en-US', passwordhash: bcrypt.hashSync('teacher123', 4) },
  { studentid: 'S1', name: '學生一', role: 'student', classname: '5A', chinesegroup: 'A', englishgroup: 'A', mathgroup: 'A', passwordhash: bcrypt.hashSync('student123', 4) },
  { studentid: 'S2', name: '學生二', role: 'student', classname: '5B', chinesegroup: 'B', englishgroup: 'B', mathgroup: 'B', passwordhash: bcrypt.hashSync('student123', 4) },
  { studentid: 'S3', name: '學生三', role: 'student', classname: '6A', chinesegroup: 'C', englishgroup: 'A', mathgroup: 'A', passwordhash: bcrypt.hashSync('student123', 4) },
  { studentid: 'S4', name: '學生四', role: 'student', classname: '5A', chinesegroup: 'C', englishgroup: 'C', mathgroup: 'C', passwordhash: bcrypt.hashSync('student123', 4) },
] }));

let server, browser, logs = '';
const errors = [];
try {
  server = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env,
    NODE_ENV: 'development', PORT: String(port), BUIO_JSON_DB_FILE: databaseFile, SUPABASE_DB_URL: '', MOCK_AUTH: '0',
  }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  let started = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${baseURL}/health`)).ok) { started = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(started, logs);
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const contexts = await Promise.all(Array.from({ length: 6 }, () => browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })));
  const [teacher, englishTeacher, first, second, third, outsider] = contexts;
  await Promise.all(contexts.map((context, i) => context.request.post('/api/auth/login', {
    data: { studentId: ['T1', 'T2', 'S1', 'S2', 'S3', 'S4'][i], password: i < 2 ? 'teacher123' : 'student123' },
  }).then(response => assert.equal(response.status(), 200))));
  const host = await teacher.newPage();
  host.on('pageerror', error => errors.push(error.message));
  await host.goto('/buzzer');
  await host.locator('#createClass').waitFor();
  assert.equal(await host.locator('#points').inputValue(), '10');
  assert.equal(await host.locator('[data-audience-range]').count(), 0);
  assert.equal(await host.locator('#createClass').isEnabled(), true);
  assert.match(await host.locator('.classroom-audience__summary').innerText(), /所有學生/);
  assert.match(await host.locator('.classroom-audience__count').innerText(), /4 \/ 4/);
  const defaultPost = host.waitForRequest(request => request.url().endsWith('/api/buzzer/sessions') && request.method() === 'POST');
  await host.locator('#createClass').click();
  assert.deepEqual((await defaultPost).postDataJSON(), { audienceRules: [], points: 10 });
  await host.locator('[data-action="start"]').waitFor();
  const defaultId = new URL(host.url()).searchParams.get('session');
  assert.ok(defaultId);
  assert.equal(await host.locator('.classroom-audience').count(), 0, 'editor is destroyed when entering the classroom');
  for (const context of [first, second, third, outsider]) {
    const list = await (await context.request.get('/api/buzzer/sessions')).json();
    assert.equal(list.sessions[0].id, defaultId);
    assert.equal((await context.request.post(`/api/buzzer/sessions/${defaultId}/actions`, { data: { action: 'join' } })).status(), 200);
  }
  await teacher.request.post(`/api/buzzer/sessions/${defaultId}/actions`, { data: { action: 'end' } });
  await host.goto('/buzzer');
  await host.locator('#createClass').waitFor();

  // Combine multiple classes/groups and a different subject in another OR range.
  await host.locator('[data-audience-action="add"]').click();
  const range1 = host.locator('[data-audience-range]').nth(0);
  await range1.locator('[data-audience-control="class"][value="5A"]').check();
  await range1.locator('[data-audience-control="class"][value="5B"]').check();
  await range1.locator('[data-audience-control="subject"]').selectOption('chineseGroup');
  await range1.locator('[data-audience-control="group"][value="A"]').check();
  await range1.locator('[data-audience-control="group"][value="B"]').check();
  await host.locator('[data-audience-action="add"]').click();
  const range2 = host.locator('[data-audience-range]').nth(1);
  await range2.locator('[data-audience-control="class"][value="6A"]').check();
  await range2.locator('[data-audience-control="subject"]').selectOption('mathGroup');
  await range2.locator('[data-audience-control="group"][value="A"]').check();
  assert.match(await host.locator('.classroom-audience__count').innerText(), /3 \/ 4/);

  // Changing classes keeps the selected group restriction even when it has no matches.
  await range1.locator('[data-audience-control="class"][value="5B"]').uncheck();
  await range1.locator('[data-audience-control="group"][value="A"]').uncheck();
  await range2.locator('[data-audience-action="remove"]').click();
  assert.match(await host.locator('.classroom-audience__count').innerText(), /0 \/ 4/);
  assert.equal(await host.locator('#createClass').isDisabled(), true);
  await host.locator('[data-audience-action="add"]').click();
  assert.equal(await host.locator('#createClass').isEnabled(), true, 'an unbounded OR range opens the audience');
  await host.locator('[data-audience-range]').nth(1).locator('[data-audience-action="remove"]').click();
  assert.equal(await host.locator('#createClass').isDisabled(), true);
  await range1.locator('[data-audience-control="class"][value="5B"]').check();
  await range1.locator('[data-audience-control="group"][value="A"]').check();
  await host.locator('[data-audience-action="add"]').click();
  await range2.locator('[data-audience-control="class"][value="6A"]').check();
  await range2.locator('[data-audience-control="subject"]').selectOption('mathGroup');
  await range2.locator('[data-audience-control="group"][value="A"]').check();
  await host.locator('#points').fill('20');
  const restrictedPost = host.waitForRequest(request => request.url().endsWith('/api/buzzer/sessions') && request.method() === 'POST');
  await host.locator('#createClass').click();
  const sent = (await restrictedPost).postDataJSON();
  assert.deepEqual(sent, { audienceRules: [
    { classNames: ['5A', '5B'], groupField: 'chineseGroup', groupNames: ['B', 'A'] },
    { classNames: ['6A'], groupField: 'mathGroup', groupNames: ['A'] },
  ], points: 20 });
  await host.locator('[data-action="start"]').waitFor();
  const id = new URL(host.url()).searchParams.get('session');
  assert.deepEqual((await (await teacher.request.get(`/api/buzzer/sessions/${id}`)).json()).session.audienceRules, sent.audienceRules);
  assert.deepEqual((await (await outsider.request.get('/api/buzzer/sessions')).json()).sessions, []);
  for (const suffix of ['', '/events']) assert.equal((await outsider.request.get(`/api/buzzer/sessions/${id}${suffix}`)).status(), 403);
  assert.equal((await outsider.request.post(`/api/buzzer/sessions/${id}/actions`, { data: { action: 'join' } })).status(), 403);

  // Exercise the existing SSE, countdown and reward behavior through the browser.
  const studentPage = await third.newPage();
  studentPage.on('pageerror', error => errors.push(error.message));
  await studentPage.goto(`/buzzer?session=${id}`);
  await studentPage.getByRole('heading', { name: '等待問題', exact: true }).waitFor();
  await host.locator('[data-action="start"]:enabled').click();
  await host.locator('.countdown').waitFor();
  await studentPage.locator('[data-action="buzz"]:enabled').waitFor();
  await studentPage.locator('[data-action="buzz"]').click();
  await host.locator('[data-action="correct"]:enabled').waitFor();
  assert.equal(await host.locator('.winner-name').innerText(), '學生三');
  await host.locator('[data-action="correct"]').click();
  await studentPage.waitForFunction(() => document.querySelector('#score')?.textContent === '20');
  assert.equal((await (await third.request.get('/api/pet/bootstrap')).json()).wallet.balance, 20);
  await teacher.request.post(`/api/buzzer/sessions/${id}/actions`, { data: { action: 'judge', round: 1, correct: true } });
  assert.equal((await (await third.request.get('/api/pet/bootstrap')).json()).wallet.balance, 20);
  await studentPage.reload();
  await studentPage.waitForFunction(() => document.querySelector('#score')?.textContent === '20');
  await host.locator('[data-action="end"]:enabled').click();
  await studentPage.getByRole('heading', { name: '課堂已結束', exact: true }).waitFor();

  const english = await englishTeacher.newPage();
  english.on('pageerror', error => errors.push(error.message));
  await english.goto('/buzzer');
  await english.locator('#createClass').waitFor();
  assert.match(await english.locator('.classroom-audience__title').innerText(), /Visible to students \(optional\)/);
  assert.equal(await english.locator('#createClass').innerText(), 'Start class');
  await english.setViewportSize({ width: 390, height: 844 });
  assert.equal(await english.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'setup fits a phone');
  await english.route('**/api/buzzer/roster', route => route.fulfill({ json: { success: true, academicYear: '2026-27', students: [], classes: [] } }));
  await english.reload();
  await english.locator('#createClass').waitFor();
  assert.match(await english.locator('.classroom-audience__count').innerText(), /0 \/ 0/);
  assert.equal(await english.locator('#createClass').isEnabled(), true);
  await english.locator('[data-audience-action="add"]').click();
  await english.locator('[data-audience-control="subject"]').selectOption('englishGroup');
  assert.equal(await english.locator('#createClass').isEnabled(), true, 'subject-only rule remains unrestricted on an empty roster');
  assert.deepEqual(errors, []);
  console.log('✓ live buzzer audience: all by default; multiple classes, subjects and groups; empty-match guard; POST rules; access/SSE; countdown; pet rewards; reload; English; phone; empty roster');
} catch (error) { console.error(logs.slice(-7000)); throw error; }
finally {
  await browser?.close();
  if (server && server.exitCode === null) { const stopped = new Promise(resolve => server.once('exit', resolve)); server.kill(); await stopped; }
  await fs.rm(temporary, { recursive: true, force: true });
}
