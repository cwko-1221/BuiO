import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const port = await new Promise(resolve => { const socket = net.createServer(); socket.listen(0, '127.0.0.1', () => { const n = socket.address().port; socket.close(() => resolve(n)); }); });
const baseURL = `http://127.0.0.1:${port}`;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-quiet-live-'));
const databaseFile = path.join(temp, 'db.json');
const artifacts = path.resolve('artifacts/pet-playtest/quiet-room');
await fs.mkdir(artifacts, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({ users: [
  { studentid: 'T001', name: '黃老師', role: 'teacher', passwordhash: bcrypt.hashSync('teacher123', 4), language: 'zh-HK' },
  { studentid: 'S001', name: '陳小星', role: 'student', classname: '5A', classno: 1, chinesegroup: 'A組', englishgroup: 'B組', mathgroup: 'A組', passwordhash: bcrypt.hashSync('student123', 4) },
  { studentid: 'S002', name: '李月兒', role: 'student', classname: '5A', classno: 2, chinesegroup: 'B組', englishgroup: 'B組', mathgroup: 'A組', passwordhash: bcrypt.hashSync('student123', 4) },
  { studentid: 'S003', name: '林小雲', role: 'student', classname: '5B', classno: 1, chinesegroup: 'A組', passwordhash: bcrypt.hashSync('student123', 4) },
], studentStats: [], questionLogs: [], _logId: 0 }));
const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env: { ...process.env, NODE_ENV: 'development', PORT: String(port), BUIO_JSON_DB_FILE: databaseFile, SUPABASE_DB_URL: '', MOCK_AUTH: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
let browser;
try {
  let ready = false;
  for (let n = 0; n < 100; n++) { try { if ((await fetch(`${baseURL}/health`)).ok) { ready = true; break; } } catch {} await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.ok(ready, logs);
  if (process.argv.includes('--serve-only')) { console.log(JSON.stringify({ baseURL, pid: server.pid, databaseFile })); await new Promise(() => {}); }
  browser = await chromium.launch({ headless: true, channel: 'chrome', args: ['--use-fake-device-for-media-stream'] });
  // Use native getUserMedia before installing the controllable audio fixture below.
  // An API mock bypasses Permissions-Policy, so it cannot catch a blocked document.
  const native = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  await native.request.post('/api/auth/login', { data: { studentId: 'T001', password: 'teacher123' } });
  for (const url of ['/pet', '/pet/', '/pet/preview']) {
    const response = await native.request.get(url);
    assert.equal(response.headers()['permissions-policy'], 'camera=(), microphone=(self), geolocation=()');
  }
  const nativePage = await native.newPage();
  await nativePage.goto('/pet', { waitUntil: 'networkidle' });
  assert.equal(await nativePage.evaluate(() => document.featurePolicy.allowsFeature('microphone')), true);
  assert.equal(await nativePage.evaluate(() => document.featurePolicy.allowsFeature('camera')), false);
  assert.equal(await nativePage.evaluate(async () => (await navigator.permissions.query({ name: 'microphone' })).state), 'prompt');
  await native.grantPermissions(['microphone']);
  await nativePage.locator('[data-teacher-tool="quiet"]').click();
  await nativePage.locator('#quietStart:enabled').waitFor();
  await nativePage.locator('#quietMicTest').click();
  await nativePage.waitForFunction(() => document.querySelector('#quietMicStatus').textContent.includes('麥克風偵測中'));
  assert.match(await nativePage.locator('#quietLevelText').innerText(), /^\d+ \/ 100$/);
  await nativePage.locator('#quietMicTest').click();
  await nativePage.waitForFunction(() => document.querySelector('#quietMicStatus').textContent === '麥克風已關閉');
  await native.close();
  const nativeStudent = await browser.newContext({ baseURL });
  await nativeStudent.request.post('/api/auth/login', { data: { studentId: 'S001', password: 'student123' } });
  assert.equal((await nativeStudent.request.get('/pet')).headers()['permissions-policy'], 'camera=(), microphone=(), geolocation=()');
  await nativeStudent.close();
  console.log('✓ teacher document permits microphone consent and native getUserMedia; student document keeps microphone disabled');
  if (process.argv.includes('--microphone-only')) { console.log('✓ native microphone permission regression passed'); process.exitCode = 0; }
  else {
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  assert.equal((await context.request.get('/api/pet/teacher/quiet-room')).status(), 403);
  assert.equal((await context.request.post('/api/auth/login', { data: { studentId: 'T001', password: 'teacher123' } })).status(), 200);
  assert.equal((await context.request.post('/api/pet/teacher/quiet-room', { data: { scope: 'group', className: '5A', groupField: '__proto__', groupName: 'x', durationSeconds: 10, threshold: 45, reward: 20, penalty: 7 }, headers: { 'Idempotency-Key': 'bad-group' } })).status(), 400);
  await context.addInitScript(() => {
    window.__quietAmplitude = .001;
    window.__quietGains = new Set();
    window.__quietPenaltyNotes = [];
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = createOscillator.call(this);
      let frequency = oscillator.frequency.value;
      const setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
      oscillator.frequency.setValueAtTime = (value, time) => { frequency = value; return setFrequency(value, time); };
      const start = oscillator.start.bind(oscillator);
      oscillator.start = time => {
        if (oscillator.type === 'triangle') window.__quietPenaltyNotes.push({ frequency, time, state: this.state });
        start(time);
      };
      return oscillator;
    };
    window.__quietSetAmplitude = value => { window.__quietAmplitude = value; window.__quietGains.forEach(gain => { gain.gain.value = value; }); };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const oscillator = context.createOscillator(); const gain = context.createGain();
      gain.gain.value = window.__quietAmplitude; window.__quietGains.add(gain);
      const destination = context.createMediaStreamDestination(); oscillator.connect(gain); gain.connect(destination); oscillator.start(); await context.resume();
      destination.stream.getTracks().forEach(track => {
        const stop = track.stop.bind(track);
        track.stop = () => { stop(); oscillator.stop(); window.__quietGains.delete(gain); void context.close(); };
      });
      return destination.stream;
    };
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/pet', { waitUntil: 'networkidle' });
  await page.locator('[data-teacher-tool="quiet"]').click();
  await page.locator('#quietStart:enabled').waitFor();
  assert.match(await page.locator('.quiet-room-badge').innerText(), /專注花園/);
  assert.equal(await page.locator('.quiet-room-stage').getByRole('img', { name: /專注夥伴/ }).count(), 3);
  assert.doesNotMatch(await page.locator('#teacherQuietMain').innerText(), /睡覺|美夢|入睡|夢鄉/);
  const garden = await page.locator('.quiet-garden-scene').evaluate(el => getComputedStyle(el).backgroundImage.slice(5, -2));
  assert.equal((await context.request.get(garden)).status(), 200);
  await page.waitForFunction(() => Array.from(document.querySelectorAll('.quiet-pet')).every(el => {
    const image = new Image(); image.src = getComputedStyle(el).backgroundImage.slice(5,-2); return image.complete;
  }));
  await page.screenshot({ path: path.join(artifacts, '01-setup-desktop.png'), fullPage: true });
  await page.locator('.quiet-room-stage').screenshot({ path: path.join(artifacts, '01-focus-garden-stage.png') });
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.screenshot({ path: path.join(artifacts, '01-focus-garden-tablet.png') });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'tablet has no horizontal overflow');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-quiet-scope="group"]').click();
  assert.match(await page.locator('#quietRecipients').innerText(), /共 1 人.*陳小星/);
  await page.locator('#quietSubject').selectOption('englishGroup');
  assert.match(await page.locator('#quietRecipients').innerText(), /共 2 人/);
  await page.locator('#quietSubject').selectOption('chineseGroup');
  await page.locator('#quietMinutes').fill('0'); await page.locator('#quietSeconds').fill('20');
  await page.locator('#quietReward').fill('20'); await page.locator('#quietPenalty').fill('7');
  await page.locator('#quietStart').click();
  await page.waitForFunction(() => document.querySelector('#quietStatus').textContent.includes('專注中'));
  assert.equal(await page.locator('#quietNew').isVisible(), false, 'new round cannot replace an active session');
  assert.match(await page.locator('#quietSessionInfo').innerText(), /5A · 中文 A組/);
  await page.evaluate(() => window.__quietSetAmplitude(.5));
  await page.waitForFunction(() => document.querySelector('#quietBreaches').textContent === '1');
  assert.equal(await page.locator('#quietRewardLeft').innerText(), '13');
  assert.deepEqual(await page.evaluate(() => window.__quietPenaltyNotes.map(note => note.frequency)), [660, 440, 330], 'one confirmed deduction plays one descending cue');
  assert.ok(await page.evaluate(() => window.__quietPenaltyNotes.every(note => note.state === 'running')), 'the start gesture unlocks actual Web Audio output');
  await page.waitForTimeout(1800);
  assert.equal(await page.locator('#quietBreaches').innerText(), '1', 'sustained noise deducts once');
  assert.equal(await page.evaluate(() => window.__quietPenaltyNotes.length), 3, 'sustained noise does not repeat the cue');
  await page.screenshot({ path: path.join(artifacts, '02-live-noise.png') });
  await page.locator('#quietQuickPause').click();
  await page.waitForFunction(() => document.querySelector('#quietPause').textContent.includes('繼續') && !document.querySelector('#quietPause').disabled);
  const frozen = await page.locator('#quietTime').innerText();
  await page.waitForTimeout(2300);
  assert.equal(await page.locator('#quietTime').innerText(), frozen);
  assert.equal(await page.locator('#quietBreaches').innerText(), '1');
  assert.equal(await page.evaluate(() => window.__quietPenaltyNotes.length), 3, 'pausing silences penalty cues');
  await page.screenshot({ path: path.join(artifacts, '03-paused.png') });
  await page.evaluate(() => window.__quietSetAmplitude(.001));
  await page.locator('#quietQuickPause').click();
  await page.waitForFunction(() => document.querySelector('#quietStatus').textContent.includes('專注中'));
  await page.waitForTimeout(1400);
  await page.evaluate(() => window.__quietSetAmplitude(.5));
  await page.waitForFunction(() => document.querySelector('#quietBreaches').textContent === '2');
  assert.equal(await page.locator('#quietRewardLeft').innerText(), '6');
  assert.deepEqual(await page.evaluate(() => window.__quietPenaltyNotes.map(note => note.frequency)), [660, 440, 330, 660, 440, 330], 'another burst after quiet and resume plays one more cue');
  await page.evaluate(() => window.__quietSetAmplitude(.001));
  await page.locator('#quietResult:not([hidden])').waitFor({ timeout: 30000 });
  assert.match(await page.locator('#quietResult').innerText(), /已發放給 1 人，每人 6 金幣/);
  assert.equal(await page.evaluate(() => window.__quietPenaltyNotes.length), 6, 'completion and heartbeats do not replay the cue');
  let roster = await (await context.request.get('/api/pet/teacher/roster')).json();
  assert.deepEqual(roster.students.map(row => row.balance), [6, 0, 0]);
  const session = (await (await context.request.get('/api/pet/teacher/quiet-room')).json()).session;
  await context.request.post(`/api/pet/teacher/quiet-room/${session.id}`, { data: { action: 'heartbeat' } });
  roster = await (await context.request.get('/api/pet/teacher/roster')).json(); assert.equal(roster.students[0].balance, 6);
  await page.screenshot({ path: path.join(artifacts, '04-completed.png') });
  console.log('✓ group selection, real Web Audio metering, repeated noise, pause/resume and exactly-once group payout');

  await page.locator('#quietNew').click(); await page.locator('#quietMinutes').fill('0'); await page.locator('#quietSeconds').fill('10');
  await page.locator('#quietReward').fill('9'); await page.locator('#quietStart').click();
  await page.locator('#quietResult:not([hidden])').waitFor({ timeout: 16000 });
  roster = await (await context.request.get('/api/pet/teacher/roster')).json();
  assert.deepEqual(roster.students.map(row => row.balance), [15, 9, 0]);
  console.log('✓ whole-class completion credits each selected classmate only');

  await page.locator('#quietNew').click(); await page.locator('#quietMinutes').fill('0'); await page.locator('#quietSeconds').fill('20');
  await page.locator('#quietStart').click();
  await page.waitForFunction(() => document.querySelector('#quietStatus').textContent.includes('專注中'));
  await page.reload({ waitUntil: 'networkidle' }); await page.locator('[data-teacher-tool="quiet"]').click();
  await page.waitForFunction(() => document.querySelector('#quietStatus')?.textContent.includes('已暫停'));
  await page.locator('#quietCancel').click(); await page.locator('#quietConfirmCancel').click();
  await page.waitForFunction(() => document.querySelector('#quietStatus').textContent === '已結束');
  roster = await (await context.request.get('/api/pet/teacher/roster')).json(); assert.deepEqual(roster.students.map(row => row.balance), [15, 9, 0]);
  console.log('✓ reload restores paused session; cancellation issues no coins');
  await page.locator('#quietNew').click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(artifacts, '05-setup-phone.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal overflow');
  await page.locator('#quietMinutes').fill('0'); await page.locator('#quietSeconds').fill('20'); await page.locator('#quietStart').click();
  await page.waitForFunction(() => document.querySelector('#quietStatus').textContent.includes('專注中'));
  await page.locator('#quietQuickPause').click();
  await page.waitForFunction(() => document.querySelector('#quietStatus').textContent.includes('已暫停'));
  await page.locator('#teacherQuietMain').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: path.join(artifacts, '06-live-phone.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'active mobile no horizontal overflow');
  await page.locator('#quietCancel').click(); await page.locator('#quietConfirmCancel').click();
  await page.waitForFunction(() => document.querySelector('#quietStatus').textContent === '已結束');

  const denied = await browser.newContext({ baseURL });
  await denied.request.post('/api/auth/login', { data: { studentId: 'T001', password: 'teacher123' } });
  await denied.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
  const deniedPage = await denied.newPage(); await deniedPage.goto('/pet'); await deniedPage.locator('[data-teacher-tool="quiet"]').click();
  await deniedPage.locator('#quietNew').click(); await deniedPage.locator('#quietStart').click();
  await deniedPage.waitForFunction(() => document.querySelector('#quietMessage').textContent.includes('允許麥克風'));
  assert.equal(await deniedPage.locator('#quietForm').isVisible(), true);
  assert.equal((await (await denied.request.get('/api/pet/teacher/quiet-room')).json()).session.status, 'cancelled');
  console.log('✓ microphone denial keeps setup and does not start countdown');
  const student = await browser.newContext({ baseURL });
  await student.request.post('/api/auth/login', { data: { studentId: 'S001', password: 'student123' } });
  assert.equal((await student.request.get('/api/pet/teacher/quiet-room')).status(), 403);
  assert.equal((await student.request.post('/api/pet/teacher/quiet-room', { data: {} })).status(), 403);
  const grants = await (await student.request.get('/api/pet/grant-notifications')).json();
  assert.equal(grants.grants.length, 2); assert.match(grants.grants[0].reason, /安靜房間/);
  assert.deepEqual(errors, []);
  console.log('✓ student permissions, reward notifications, mobile layout and no browser runtime errors');
  console.log(`Screenshots: ${artifacts}`);
  }
} finally {
  await browser?.close(); server.kill();
}
