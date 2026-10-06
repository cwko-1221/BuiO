import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-pet-grant-grade-'));
const dbFile = path.join(temp, 'db.json');
const out = path.resolve(process.env.PET_GRANT_GRADE_OUT || 'artifacts/pet-playtest/grant-grade');
await fs.mkdir(out, { recursive: true });
const students = [
  ['S401', '四年級阿明', 'P4', 'A', '', 'M'],
  ['S501', '五年級小晴', 'P5', 'A', 'D', 'M'],
  ['S502', '五年級阿樂', 'P5B', 'A', '', 'N'],
  ['S503', '五年級小星', '5A', 'B組', 'A', 'M'],
  ['S601', '六年級小月', 'P6', 'A', 'C', 'M'],
  ['S701', '已畢業同學', 'Graduated', 'A', 'C', 'M'],
  ['S801', '無效班別同學', 'P50', 'A', 'C', 'M'],
];
await fs.writeFile(dbFile, JSON.stringify({
  users: [
    ...students.map(([id, name, className, chineseGroup, englishGroup, mathGroup]) => ({ studentid: id, name, role: 'student', classname: id === 'S501' ? 'P4' : className, chinesegroup: chineseGroup, englishgroup: englishGroup, mathgroup: mathGroup, passwordhash: bcrypt.hashSync('test', 4), language: 'zh-HK' })),
    { studentid: 'S901', name: '上學年的同學', role: 'student', classname: 'P5', chinesegroup: 'A', passwordhash: bcrypt.hashSync('test', 4) },
    { studentid: 'T001', name: '陳老師', role: 'teacher', classname: 'P5', chinesegroup: 'A', passwordhash: bcrypt.hashSync('test', 4), language: 'zh-HK' },
  ],
  platformSettings: { currentAcademicYear: '2026-27' },
  studentAcademicYears: [
    ...students.map(([studentId, name, className, chineseGroup, englishGroup, mathGroup]) => ({ academicYear: '2026-27', studentId, name, className, chineseGroup, englishGroup, mathGroup })),
    { academicYear: '2025-26', studentId: 'S501', name: '五年級小晴', className: 'P4', chineseGroup: 'A' },
    { academicYear: '2025-26', studentId: 'S901', name: '上學年的同學', className: 'P5', chineseGroup: 'A' },
  ], studentStats: [], questionLogs: [], _logId: 0,
}));
process.env.BUIO_JSON_DB_FILE = dbFile;
process.env.SUPABASE_DB_URL = '';
const require = createRequire(import.meta.url);
const pets = require('../pet-app/repositories/pet.repo');
const store = require('../db/jsonStore');
for (const id of [...students.map(s => s[0]), 'S901']) await pets.ensureStudent(id);
for (const wallet of store.load().petWallets) wallet.balance = 1000;
store.save();
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const baseURL = `http://127.0.0.1:${port}`;
let server, browser, logs = '';
const checks = [], errors = [];
const pass = label => { checks.push(label); console.log('✓ ' + label); };
const wallets = async () => Object.fromEntries(JSON.parse(await fs.readFile(dbFile, 'utf8')).petWallets.map(w => [w.studentId, w.balance]));
const ids = result => result.recipients.map(r => r.studentId).sort();
const groupBody = { scope: 'group', grade: 'P5', groupField: 'chineseGroup', groupName: 'A', amount: 200, note: 'P5 中文 A組課堂表現' };
try {
  server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env: { ...process.env, PORT: String(port), MOCK_AUTH: '0', NODE_ENV: 'development', PET_APP_DIST_DIR: process.env.PET_APP_DIST_DIR || path.resolve('pet-app/dist'), SESSION_SECRET: 'isolated-grant-grade-test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => logs += d); server.stderr.on('data', d => logs += d);
  const deadline = Date.now() + 20000;
  while (true) { try { if ((await fetch(baseURL + '/health')).ok) break; } catch {} if (Date.now() > deadline) throw new Error('Server startup timed out'); await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 1194, height: 834 }, hasTouch: true });
  assert.equal((await context.request.post('/api/auth/login', { data: { studentId: 'T001', password: 'test' } })).status(), 200);
  const request = (route, body, key = randomUUID()) => context.request.post(`/api/pet/teacher/grants/${route}`, { data: body, headers: { 'Idempotency-Key': key } });
  const roster = await (await context.request.get('/api/pet/teacher/roster')).json();
  assert.deepEqual(roster.grades, ['P4', 'P5', 'P6']);
  assert.equal(roster.students.find(s => s.studentId === 'S501').grade, 'P5');
  assert.equal(roster.students.find(s => s.studentId === 'S503').grade, 'P5');
  assert.ok(!roster.students.some(s => ['T001', 'S901'].includes(s.studentId)));
  const baseline = await wallets();
  const preview = await (await request('preview', groupBody)).json();
  assert.deepEqual(ids(preview), ['S501', 'S502']);
  assert.equal(preview.count, 2); assert.equal(preview.total, 400);
  assert.deepEqual(await wallets(), baseline);
  pass('current-year grade scoping excludes other grades, teachers, old enrolments and malformed class names');

  for (const body of [
    { ...groupBody, grade: undefined }, { ...groupBody, grade: '' }, { ...groupBody, grade: 'P3' }, { ...groupBody, grade: 'P50' },
    { ...groupBody, groupField: 'className' }, { ...groupBody, groupName: 'C' },
  ]) for (const route of ['preview', 'commit']) assert.equal((await request(route, body)).status(), 400, `${route}: ${JSON.stringify(body)}`);
  const student = await browser.newContext({ baseURL });
  await student.request.post('/api/auth/login', { data: { studentId: 'S501', password: 'test' } });
  for (const route of ['preview', 'commit']) assert.equal((await student.request.post(`/api/pet/teacher/grants/${route}`, { data: groupBody })).status(), 403);
  assert.deepEqual(await wallets(), baseline);
  pass('both preview and commit require a valid grade and group; student requests cannot grant coins');

  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto('/pet'); await page.locator('.teacher-shell').waitFor();
  await page.locator('[data-scope="group"]').click();
  assert.equal(await page.locator('#previewGrant').isDisabled(), true);
  assert.equal(await page.locator('#grantGroupName').isDisabled(), true);
  await page.locator('#grantGroupGrade').selectOption('P5');
  assert.deepEqual(await page.locator('#grantGroupName option').evaluateAll(opts => opts.map(o => o.value)), ['', 'A', 'B組']);
  await page.locator('#grantGroupName').selectOption('A');
  assert.match(await page.locator('#grantSummaryLine').innerText(), /2 名學生/);
  assert.match(await page.locator('#grantSummaryHint').innerText(), /P5 中文 A組/);
  await page.locator('#grantGroupGrade').selectOption('P6');
  assert.equal(await page.locator('#grantGroupName').inputValue(), '');
  assert.equal(await page.locator('#previewGrant').isDisabled(), true);
  await page.locator('#grantGroupName').selectOption('A');
  assert.match(await page.locator('#grantSummaryLine').innerText(), /1 名學生/);
  await page.locator('#grantGroupGrade').selectOption('P4');
  await page.locator('#grantGroupField').selectOption('englishGroup');
  assert.equal(await page.locator('#grantGroupName').isDisabled(), true);
  assert.match(await page.locator('#grantGroupName').innerText(), /未有該科組別/);
  await page.locator('#grantGroupGrade').selectOption('P5');
  assert.deepEqual(await page.locator('#grantGroupName option').evaluateAll(opts => opts.map(o => o.value)), ['', 'A', 'D']);
  await page.locator('#grantGroupName').selectOption('A');
  assert.match(await page.locator('#grantSummaryLine').innerText(), /1 名學生/);
  await page.locator('#grantGroupField').selectOption('mathGroup');
  await page.locator('#grantGroupName').selectOption('M');
  assert.match(await page.locator('#grantSummaryLine').innerText(), /2 名學生/);
  await page.locator('#grantGroupField').selectOption('chineseGroup');
  await page.locator('#grantGroupName').selectOption('A');
  await page.locator('#grantAmount').fill('200');
  pass('grade and subject changes reset the selection; group lists and live counts reflect only the chosen grade');

  for (const [name, width, height] of [['ipad-landscape', 1194, 834], ['ipad-portrait', 834, 1194], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#grantGroupGrade').scrollIntoViewIfNeeded();
    const sizes = await page.locator('.grant-group-fields select').evaluateAll(selects => selects.map(s => ({ width: s.getBoundingClientRect().width, height: s.getBoundingClientRect().height })));
    assert.ok(sizes.every(s => s.height >= 52 && s.width >= 120), JSON.stringify(sizes));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: path.join(out, `01-groups-${name}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1194, height: 834 });
  const responsePromise = page.waitForResponse(r => r.url().endsWith('/teacher/grants/preview'));
  await page.locator('#previewGrant').click();
  const livePreview = await (await responsePromise).json();
  assert.deepEqual(ids(livePreview), ['S501', 'S502']);
  await page.locator('.grant-confirm').waitFor();
  assert.equal(await page.locator('.grant-target').innerText(), 'P5 中文 A組');
  const names = await page.locator('.grant-confirm .recipients').innerText();
  assert.ok(names.includes('五年級小晴') && names.includes('五年級阿樂'));
  assert.ok(!names.includes('四年級') && !names.includes('六年級'));
  await page.screenshot({ path: path.join(out, '02-confirmation-ipad.png'), fullPage: true });
  pass('iPad landscape, portrait and mobile retain large controls; confirmation shows P5 Chinese A and the exact recipients');

  const commitPromise = page.waitForResponse(r => r.url().endsWith('/teacher/grants/commit'));
  await page.locator('#commitGrant').click();
  const commitResponse = await commitPromise, committed = await commitResponse.json();
  assert.equal(commitResponse.status(), 201); assert.equal(committed.count, 2);
  await page.locator('#grantMessage').filter({ hasText: '合共 400' }).waitFor();
  const expected = { ...baseline, S501: 1200, S502: 1200 };
  assert.deepEqual(await wallets(), expected);
  const commitRequest = commitResponse.request();
  assert.equal(commitRequest.postDataJSON().grade, 'P5');
  const retry = await request('commit', commitRequest.postDataJSON(), commitRequest.headers()['idempotency-key']);
  assert.equal(retry.status(), 201); assert.deepEqual(await wallets(), expected);
  const deduction = { ...groupBody, amount: -50 };
  assert.deepEqual(ids(await (await request('preview', deduction)).json()), ['S501', 'S502']);
  assert.equal((await request('commit', deduction)).status(), 201);
  assert.deepEqual(await wallets(), { ...baseline, S501: 1150, S502: 1150 });
  const excessive = { ...groupBody, amount: -2000 };
  assert.equal((await (await request('preview', excessive)).json()).canCommit, false);
  assert.equal((await request('commit', excessive)).status(), 409);
  assert.deepEqual(await wallets(), { ...baseline, S501: 1150, S502: 1150 });
  pass('actual grants and deductions affect only P5 Chinese A, retry is idempotent and insufficient deductions remain blocked');

  assert.deepEqual(ids(await (await request('preview', { scope: 'class', className: 'P5B', amount: 20 })).json()), ['S502']);
  assert.deepEqual(ids(await (await request('preview', { scope: 'students', studentIds: ['S401', 'S601'], amount: 20 })).json()), ['S401', 'S601']);
  assert.deepEqual(errors, []);
  pass('whole-class and individual selections still work without a grade; browser has no runtime errors');
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ pass: true, checks }, null, 2) + '\n');
} catch (error) {
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ pass: false, checks, error: error.stack, logs }, null, 2) + '\n');
  throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) { const ended = new Promise(r => server.once('exit', r)); server.kill(); await ended; }
  await fs.rm(temp, { recursive: true, force: true });
}
