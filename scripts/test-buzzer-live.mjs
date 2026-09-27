import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const port = await new Promise(resolve => {
  const server = net.createServer();
  server.listen(0, '127.0.0.1', () => { const p = server.address().port; server.close(() => resolve(p)); });
});
const baseURL = `http://127.0.0.1:${port}`;
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-buzzer-'));
const databaseFile = path.join(temporary, 'db.json');
const artifacts = path.resolve('artifacts/buzzer-qa');
await fs.mkdir(artifacts, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({ users: [
  { studentid: 'T001', name: '陳老師', role: 'teacher', passwordhash: bcrypt.hashSync('teacher123', 4) },
  { studentid: 'T002', name: '李老師', role: 'teacher', language: 'en-US', passwordhash: bcrypt.hashSync('teacher123', 4) },
  { studentid: 'S001', name: '陳小星', role: 'student', classname: '5A', classno: 1, chinesegroup: 'A組', englishgroup: 'B組', mathgroup: 'A組', passwordhash: bcrypt.hashSync('student123', 4) },
  { studentid: 'S002', name: '李月兒', role: 'student', classname: '5A', classno: 2, chinesegroup: 'B組', englishgroup: 'B組', mathgroup: 'A組', passwordhash: bcrypt.hashSync('student123', 4) },
  { studentid: 'S003', name: '林小雲', role: 'student', classname: '5B', classno: 1, englishgroup: 'B組', passwordhash: bcrypt.hashSync('student123', 4) },
], studentStats: [], questionLogs: [], _logId: 0 }));
let server, browser, logs = '';
const start = async () => {
  server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env: { ...process.env,
    NODE_ENV: 'development', PORT: String(port), BUIO_JSON_DB_FILE: databaseFile, SUPABASE_DB_URL: '', MOCK_AUTH: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
  for (let n = 0; n < 100; n++) {
    try { if ((await fetch(`${baseURL}/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(logs);
};
const stop = async () => {
  if (server && server.exitCode === null) { const exited = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exited; }
};
try {
  await start();
  if (process.argv.includes('--serve-only')) { console.log(JSON.stringify({ baseURL, pid: server.pid, databaseFile })); await new Promise(() => {}); }
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const contexts = await Promise.all(Array.from({ length: 5 }, () => browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } })));
  const [teacher, s1, s2, outsider, otherTeacher] = contexts;
  assert.equal((await teacher.request.get('/api/buzzer/sessions')).status(), 401);
  await Promise.all(contexts.map((context, i) => context.request.post('/api/auth/login', {
    data: { studentId: ['T001', 'S001', 'S002', 'S003', 'T002'][i], password: [0, 4].includes(i) ? 'teacher123' : 'student123' },
  })));
  assert.equal((await s1.request.post('/api/buzzer/sessions', { data: { className: '5A', points: 20 } })).status(), 403);
  for (const data of [{ className: '5A', points: -2 }, { className: '5Z', points: 20 }, { className: '5A', groupField: '__proto__', groupName: 'x', points: 20 }]) {
    assert.equal((await teacher.request.post('/api/buzzer/sessions', { data })).status(), 400);
  }
  const pages = await Promise.all([teacher, s1, s2, otherTeacher].map(context => context.newPage()));
  const [host, student1, student2, english] = pages;
  const errors = []; pages.forEach(page => page.on('pageerror', error => errors.push(error.message)));
  await host.goto('/'); await host.locator('#openBuzzerBtn').click();
  await host.locator('#createClass').waitFor();
  await host.locator('#groupField').selectOption('chineseGroup');
  assert.match(await host.locator('#recipients').innerText(), /共 1 人.*陳小星/);
  await host.locator('#groupField').selectOption('englishGroup');
  assert.match(await host.locator('#recipients').innerText(), /共 2 人/);
  await host.locator('#points').fill('20');
  await host.screenshot({ path: path.join(artifacts, '01-teacher-setup.png'), fullPage: true });
  await host.locator('#createClass').click();
  await host.locator('[data-action="start"]').waitFor();
  const id = new URL(host.url()).searchParams.get('session');
  assert.ok(id);
  const action = (context, data) => context.request.post(`/api/buzzer/sessions/${id}/actions`, { data });
  const snapshot = async context => (await (await context.request.get(`/api/buzzer/sessions/${id}`)).json()).session;
  const balance = async context => (await (await context.request.get('/api/pet/bootstrap')).json()).wallet.balance;
  assert.equal((await outsider.request.get(`/api/buzzer/sessions/${id}`)).status(), 403);
  assert.equal((await outsider.request.get('/api/buzzer/sessions')).status(), 200);
  assert.equal((await (await outsider.request.get('/api/buzzer/sessions')).json()).sessions.length, 0);
  assert.equal((await action(otherTeacher, { action: 'end' })).status(), 403);
  assert.equal((await action(s1, { action: 'start', round: 0 })).status(), 403);
  await Promise.all([student1.goto('/'), student2.goto('/')]);
  for (const page of [student1, student2]) {
    await page.getByRole('heading', { name: '課堂', exact: true }).waitFor();
    await page.locator(`[data-session-id="${id}"]`).click();
    await page.getByRole('heading', { name: '等待問題', exact: true }).waitFor();
    assert.equal(await page.locator('[data-action="buzz"]').count(), 0);
  }
  await host.locator('[data-action="start"]:enabled').waitFor();
  await student1.setViewportSize({ width: 390, height: 844 });
  await student1.screenshot({ path: path.join(artifacts, '02-student-waiting-phone.png') });
  await host.locator('[data-action="start"]').click();
  await host.locator('.countdown').waitFor();
  assert.equal((await action(s1, { action: 'buzz', round: 1 })).status(), 409, 'early buzz rejected by server');
  await student1.locator('[data-action="buzz"]:enabled').waitFor();
  await student1.screenshot({ path: path.join(artifacts, '03-student-buzz-phone.png') });
  await student1.locator('[data-action="buzz"]').click();
  await host.locator('[data-action="correct"]').waitFor();
  assert.equal(await host.locator('.winner-name').innerText(), '陳小星');
  await host.screenshot({ path: path.join(artifacts, '04-teacher-winner.png') });
  await host.locator('[data-action="correct"]').click();
  await student1.waitForFunction(() => document.querySelector('#score')?.textContent === '20');
  assert.equal(await balance(s1), 20);
  await Promise.all(Array.from({ length: 8 }, () => action(teacher, { action: 'judge', round: 1, correct: true })));
  assert.equal(await balance(s1), 20, 'duplicate judgments do not grant twice');
  assert.equal((await action(teacher, { action: 'judge', round: 1, correct: false })).status(), 409);
  await student1.reload(); await student1.locator('#score').waitFor();
  assert.equal(await student1.locator('#successes').innerText(), '1');
  assert.equal(await student1.locator('#score').innerText(), '20');
  await host.locator('[data-action="start"]:enabled').click();
  await student2.locator('[data-action="buzz"]:enabled').waitFor();
  await student2.locator('[data-action="buzz"]').click();
  await host.locator('[data-action="wrong"]').click();
  await student2.waitForFunction(() => document.querySelector('#successes')?.textContent === '1');
  assert.equal(await balance(s2), 0, 'incorrect answer does not award coins');
  await host.locator('[data-action="start"]:enabled').click();
  await student1.locator('[data-action="buzz"]:enabled').waitFor();
  const races = await Promise.all(Array.from({ length: 20 }, (_, i) => action(i % 2 ? s1 : s2, { action: 'buzz', round: 3 })));
  assert.equal(races.filter(response => response.status() === 200).length, 1, 'one winner for simultaneous/duplicate taps');
  let current = await snapshot(teacher);
  assert.equal(current.participants.reduce((total, row) => total + row.successes, 0), 3);
  await action(teacher, { action: 'judge', round: 3, correct: true });
  assert.equal(await balance(s1) + await balance(s2), 40);
  await stop(); await start();
  await host.reload(); await host.locator('[data-action="start"]:enabled').waitFor();
  current = await snapshot(teacher);
  assert.equal(current.round, 3);
  assert.equal(current.participants.reduce((total, row) => total + row.score, 0), 40);
  assert.equal((await action(teacher, { action: 'judge', round: 3, correct: true })).status(), 200);
  assert.equal(await balance(s1) + await balance(s2), 40, 'restart and retry retain exactly-once rewards');
  await host.locator('[data-action="start"]').click();
  await host.locator('[data-action="cancel"]').click();
  assert.equal((await snapshot(teacher)).phase, 'waiting');
  await host.locator('[data-action="end"]:enabled').click();
  await host.getByRole('heading', { name: '課堂已結束' }).waitFor();
  await student1.getByRole('heading', { name: '課堂已結束' }).waitFor();
  assert.equal((await (await s1.request.get('/api/buzzer/sessions')).json()).sessions.length, 0);
  assert.equal((await action(s1, { action: 'join' })).status(), 409);
  await english.goto('/buzzer');
  await english.getByRole('heading', { name: 'Open a buzz classroom' }).waitFor();
  assert.equal(await english.locator('#createClass').innerText(), 'Start class');
  const disk = JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  assert.equal(disk.petCurrencyLedger.filter(row => row.metadata?.buzzerSessionId === id).length, 2);
  assert.deepEqual(errors, [], 'no browser runtime errors');
  console.log('✓ portal entry and classes label; class/subject-group targeting; phone UI; realtime 3-second countdown; authenticated first-buzz race; correct/incorrect judgments; exactly-once pet coins; reload/restart; cancellation/end; English UI');
} catch (error) { console.error(logs.slice(-7000)); throw error; }
finally { await browser?.close(); await stop(); }
