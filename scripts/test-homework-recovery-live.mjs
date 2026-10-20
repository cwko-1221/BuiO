import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { chromium, webkit } from 'playwright';

const require = createRequire(import.meta.url), bcrypt = require('bcryptjs');
const root = path.resolve(import.meta.dirname, '..');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-homework-recovery-'));
const file = path.join(temp, 'db.json'), port = 3196, base = `http://127.0.0.1:${port}`;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const year = '2025-26'; // The isolated JSON store's initial academic year.
const passwordhash = bcrypt.hashSync('fixture-password', 4);
await fs.writeFile(file, JSON.stringify({
  users: ['T1', 'S1', 'S2'].map(studentid => ({ studentid, name: `Fixture ${studentid}`, role: studentid === 'T1' ? 'teacher' : 'student', classname: 'P5', classno: studentid === 'S2' ? 2 : 1, chinesegroup: 'A', englishgroup: 'A', mathgroup: 'A', language: 'zh-HK', passwordhash })),
  studentStats: [], questionLogs: [], _logId: 0,
  homeworkMonitors: ['science', 'music', 'humanities', 'computer'].map((subject, index) => ({ id: index + 1, academicYear: year, className: 'P5', subject, studentId: 'S1', createdBy: 'T1' })),
  _homeworkMonitorId: 4, homeworkRecords: [], _homeworkRecordId: 0,
}));
const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: file, SUPABASE_DB_URL: '', NODE_ENV: 'test', SESSION_SECRET: 'fixture-session', ADMIN_PASSWORD: 'fixture-admin', REQUEST_METRICS_SAMPLE_RATE: '0', GOOGLE_API_KEY: '', GOOGLE_CREDENTIALS_JSON: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '', browser, diagnosticPage;
child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
const scope = subject => ({ academicYear: year, className: 'P5', subject, date: today });
const payload = (subject, title = 'Fixture homework') => ({ ...scope(subject), homeworks: [{ id: `fixture-${subject}`, title, statuses: [{ studentId: 'S1', status: 'complete' }, { studentId: 'S2', status: 'missing' }] }] });
try {
  for (let n = 0; n < 80; n++) {
    try { if ((await fetch(base + '/health/live')).ok) break; } catch {}
    if (child.exitCode !== null) throw Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = process.env.BUIO_HOMEWORK_ENGINE === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const context = await browser.newContext({ viewport: { width: 1024, height: 1366 } }), page = await context.newPage();
  diagnosticPage = page;
  page.on('pageerror', error => console.error('Browser error:', error.message));
  const login = async id => assert.equal((await context.request.post(base + '/api/auth/login', { data: { studentId: id, password: 'fixture-password' } })).status(), 200);
  await login('S1');
  await page.goto(base + '/homework/'); await page.waitForSelector('#submitRecord');
  const send = (body, method = 'POST') => page.evaluate(async ({ body, method }) => {
    try {
      const response = await window.BuiReliable.request('/api/homework/records', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    } catch (error) { return { error: error.message }; }
  }, { body, method });
  const resource = subject => '/api/homework/records:' + [year, 'P5', subject, today].join(':');
  const read = async subject => (await (await context.request.get(base + '/api/homework/records?' + new URLSearchParams(scope(subject)))).json()).record;
  const rows = () => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('buio-pending-writes', 1);
    open.onsuccess = () => { const tx = open.result.transaction('writes'), request = tx.objectStore('writes').getAll(); tx.oncomplete = () => { resolve(request.result); open.result.close(); }; tx.onerror = () => reject(tx.error); };
  }));
  const seed = jobs => page.evaluate(jobs => new Promise((resolve, reject) => {
    const open = indexedDB.open('buio-pending-writes', 1);
    open.onsuccess = () => { const tx = open.result.transaction('writes', 'readwrite'); jobs.forEach(job => tx.objectStore('writes').put(job)); tx.oncomplete = () => { resolve(); open.result.close(); }; tx.onerror = () => reject(tx.error); };
  }), jobs);
  const job = (subject, key, body, extra = {}) => ({ id: 'S1:' + key, accountId: 'S1', url: '/api/homework/records', method: 'POST', resource: resource(subject), headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: { type: 'text', value: JSON.stringify(body) }, createdAt: Date.now(), ...extra });
  const select = async subject => {
    const ids = { science: '1', music: '2', humanities: '3', computer: '4' };
    if (await page.locator('#studentAssignment').inputValue() === ids[subject]) return;
    const loaded = page.waitForResponse(response => response.url().includes('/api/homework/records?') && new URL(response.url()).searchParams.get('subject') === subject);
    await page.locator('#studentAssignment').selectOption(ids[subject]); await loaded;
    await page.waitForFunction(id => document.querySelector('#studentAssignment')?.value === id && document.querySelector('#submitRecord') && !document.querySelector('#submitRecord').disabled, ids[subject]);
  };
  const save = async status => {
    const response = page.waitForResponse(response => response.url().endsWith('/api/homework/records') && ['POST', 'PUT'].includes(response.request().method()));
    await page.locator('#submitRecord').click();
    assert.equal((await response).status(), status);
    await page.waitForFunction(() => !document.querySelector('#submitRecord')?.disabled);
  };
  const invalid = await send(payload('science', ''));
  assert.equal(invalid.status, 400, 'fixture must create a real validation failure');
  const corrected = await send(payload('science'));
  assert.equal(corrected.status, 201, `Corrected homework must not be blocked by an earlier invalid snapshot: ${JSON.stringify(corrected)}`);
  console.log('PASS: a rejected blank-title snapshot cannot poison a corrected homework save');

  // The real form must reject an empty name before persisting an invalid job.
  await select('music');
  for (const input of await page.locator('.status-options input[value="complete"]').all()) await input.check();
  let requests = 0;
  const countWrites = request => { if (request.url().endsWith('/api/homework/records') && ['POST', 'PUT'].includes(request.method())) requests++; };
  page.on('request', countWrites);
  await page.locator('#submitRecord').click();
  assert.ok((await page.locator('.notice.error').textContent()).includes('功課名稱'));
  assert.equal(requests, 0, 'invalid title must not create a queued server request');
  assert.equal((await rows()).length, 0);
  console.log('PASS: empty homework names are caught locally without poisoning the queue');

  // Model the already broken iPad, including a full old 40-entry queue. The
  // latest corrected snapshot must survive reload and be available for review.
  const legacy = Array.from({ length: 40 }, (_, index) => job('humanities', `legacy-write-${index}`, payload('humanities', index === 39 ? 'Recovered latest draft' : ''), { createdAt: Date.now() - 50000 + index, ...(index === 0 ? { blocked: true, status: 400 } : {}) }));
  await seed(legacy); await page.reload(); await page.waitForSelector('.draft-recovery');
  assert.equal(await page.locator('.homework-name').inputValue(), 'Recovered latest draft');
  assert.equal(await page.locator('.status-options input[value="missing"]:checked').count(), 1);
  assert.equal((await rows()).length, 1, 'legacy snapshots must compact atomically to the latest complete form');
  assert.ok((await page.locator('#buio-pending-notice').textContent()).includes('草稿'));
  let duplicateRequests = 0;
  await context.route('**/api/homework/records', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    duplicateRequests++; await new Promise(resolve => setTimeout(resolve, 180)); await route.continue();
  });
  const confirmed = page.waitForResponse(response => response.url().endsWith('/api/homework/records') && response.request().method() === 'POST');
  await page.locator('#submitRecord').click();
  await page.locator('#submitRecord').evaluate(button => button.click());
  assert.equal((await confirmed).status(), 201);
  await page.waitForFunction(() => !document.querySelector('#submitRecord').disabled);
  assert.equal(duplicateRequests, 1, 'double taps must submit only one save');
  assert.equal((await read('humanities')).homeworks[0].title, 'Recovered latest draft');
  assert.equal((await rows()).length, 0);
  await context.unroute('**/api/homework/records');
  console.log('PASS: a broken legacy queue restores all selected statuses, saves once, and unlocks');

  let lost = true;
  await context.route('**/api/homework/records', async route => {
    if (lost && route.request().method() === 'POST') { lost = false; await route.fetch(); await route.abort('failed'); }
    else await route.continue();
  });
  const lostAck = await send(payload('music', 'Lost response test'));
  assert.ok(lostAck.error, 'simulate a committed save with a lost response');
  assert.ok(await read('music'));
  const key = (await rows())[0].headers['idempotency-key'];
  const replay = await send(payload('music', 'Lost response test'));
  assert.equal(replay.status, 201, 'an identical retry must replay its successful receipt, not receive a duplicate conflict');
  await context.unroute('**/api/homework/records');
  let data = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(data.operationReceipts.filter(row => row.key === key).length, 1);
  assert.equal(data.homeworkRecords.filter(row => row.subject === 'music').length, 1);
  console.log('PASS: lost acknowledgements retain the same receipt key and cannot duplicate records');

  const musicBefore = await read('music');
  await seed([job('music', 'legacy-unversioned-update', { ...scope('music'), homeworks: [{ ...musicBefore.homeworks[0], title: 'Review old offline update' }] }, { method: 'PUT' })]);
  await page.reload(); await page.waitForSelector('.draft-recovery');
  assert.equal(await page.locator('.homework-name').inputValue(), 'Review old offline update');
  assert.equal((await read('music')).homeworks[0].title, musicBefore.homeworks[0].title, 'legacy updates without a version must not overwrite newer saved content on boot');
  assert.equal((await rows())[0].blocked, true);
  await save(200);
  assert.equal((await read('music')).homeworks[0].title, 'Review old offline update');
  console.log('PASS: legacy updates without a base version require review before overwriting saved work');

  await select('science');
  await page.locator('.homework-name').fill('Local edits to preserve');
  const teacher = await browser.newContext();
  assert.equal((await teacher.request.post(base + '/api/auth/login', { data: { studentId: 'T1', password: 'fixture-password' } })).status(), 200);
  const latest = await read('science');
  const changed = await teacher.request.put(base + '/api/homework/records', { data: { ...scope('science'), baseVersion: latest.version, homeworks: [{ ...latest.homeworks[0], title: 'New teacher version' }] } });
  assert.equal(changed.status(), 200);
  await save(409);
  assert.equal(await page.locator('.homework-name').inputValue(), 'Local edits to preserve');
  assert.ok((await page.locator('.draft-comparison').textContent()).includes('New teacher version'));
  assert.equal((await read('science')).homeworks[0].title, 'New teacher version', 'conflicts must not silently overwrite a teacher update');
  await page.locator('.draft-comparison summary').click();
  await fs.mkdir(path.join(root, 'tmp/homework-recovery'), { recursive: true });
  await page.screenshot({ path: path.join(root, `tmp/homework-recovery/conflict-${process.env.BUIO_HOMEWORK_ENGINE || 'chromium'}.png`), fullPage: true });
  await save(200);
  assert.equal((await read('science')).homeworks[0].title, 'Local edits to preserve');
  assert.equal((await rows()).length, 0);
  console.log('PASS: conflicting saves preserve the form and require review before an explicit update');

  let finishSave;
  const saveGate = new Promise(resolve => finishSave = resolve);
  await context.route('**/api/homework/records', async route => {
    if (route.request().method() === 'PUT') { await saveGate; await route.continue(); }
    else await route.continue();
  });
  await page.locator('.homework-name').fill('Submitted snapshot');
  const inFlight = page.waitForRequest(request => request.url().endsWith('/api/homework/records') && request.method() === 'PUT');
  await page.locator('#submitRecord').click(); await inFlight;
  await page.locator('.homework-name').fill('Edits made while saving');
  const completed = page.waitForResponse(response => response.url().endsWith('/api/homework/records') && response.request().method() === 'PUT');
  finishSave(); assert.equal((await completed).status(), 200);
  await page.waitForFunction(() => !document.querySelector('#submitRecord').disabled);
  assert.equal(await page.locator('.homework-name').inputValue(), 'Edits made while saving');
  assert.equal((await read('science')).homeworks[0].title, 'Submitted snapshot');
  assert.ok((await page.locator('.student-message-bottom').textContent()).includes('新增的修改'));
  await context.unroute('**/api/homework/records');
  await save(200);
  assert.equal((await read('science')).homeworks[0].title, 'Edits made while saving');
  console.log('PASS: typing during a save cannot be overwritten by its older acknowledgement');

  // Failed permissions remain enforced; only restoring the actual monitor
  // appointment permits the corrected request to succeed.
  const appointment = { academicYear: year, className: 'P5', subject: 'computer' };
  assert.equal((await teacher.request.put(base + '/api/homework/monitors', { data: { ...appointment, studentIds: [] } })).status(), 200);
  assert.equal((await send(payload('computer'))).status, 403);
  assert.equal((await teacher.request.put(base + '/api/homework/monitors', { data: { ...appointment, studentIds: ['S1'] } })).status(), 200);
  assert.equal((await send(payload('computer'))).status, 201);
  assert.equal((await rows()).length, 0);
  console.log('PASS: permission failures recover after reappointment without bypassing authorization');

  await select('music');
  await page.locator('.homework-name').fill('Offline draft retained');
  await context.setOffline(true);
  await page.locator('#submitRecord').click();
  await page.waitForFunction(() => !document.querySelector('#submitRecord').disabled);
  assert.ok((await rows()).some(row => JSON.parse(row.body.value).homeworks[0].title === 'Offline draft retained'));
  await context.route('**/api/homework/records', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false}' }) : route.continue());
  await context.setOffline(false); await page.reload(); await page.waitForSelector('.draft-recovery');
  assert.equal(await page.locator('.homework-name').inputValue(), 'Offline draft retained');
  await context.unroute('**/api/homework/records');
  await save(200);
  assert.equal((await read('music')).homeworks[0].title, 'Offline draft retained');
  assert.equal((await rows()).length, 0, 'a manual save racing recovery must not manufacture a conflict with the same saved content');
  console.log('PASS: offline homework survives reload and then saves with its form intact');

  // The form must render while replay is stuck, rather than awaiting its 20s
  // deadline. Gate the background write until after the UI assertion.
  const computer = await read('computer'), deferred = { ...scope('computer'), baseVersion: computer.version, homeworks: computer.homeworks };
  await seed([job('computer', 'slow-background-write', deferred, { method: 'PUT' })]);
  let release, began;
  const gate = new Promise(resolve => release = resolve), started = new Promise(resolve => began = resolve);
  await context.route('**/api/homework/records', async route => {
    if (route.request().method() === 'PUT') { began(); await gate; await route.fulfill({ status: 503, contentType: 'application/json', body: '{"success":false}' }); }
    else await route.continue();
  });
  const start = performance.now(); await page.reload(); await page.waitForSelector('#submitRecord');
  assert.ok(performance.now() - start < 2500, 'background retry must not block form boot in a local fixture');
  await started;
  const released = page.waitForResponse(response => response.url().endsWith('/api/homework/records') && response.request().method() === 'PUT');
  release(); await released; await context.unroute('**/api/homework/records');
  // Finish the same queued operation before the retention/account assertions.
  await page.evaluate(() => window.BuiReliable.resume(true));
  assert.equal((await rows()).length, 0);
  console.log('PASS: slow background synchronization does not block opening the homework editor');

  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const oldBody = { ...payload('humanities', 'Old unsynced work'), date: yesterday };
  await seed([job('humanities', 'expired-homework-draft', oldBody, { resource: '/api/homework/records:' + [year, 'P5', 'humanities', yesterday].join(':'), createdAt: Date.now() - 172800000 })]);
  await page.reload(); await page.waitForSelector('.draft-recovery');
  assert.ok((await page.locator('.draft-recovery').textContent()).includes('老師'));
  assert.equal(await page.locator('#submitRecord').count(), 0, 'past dates stay read-only for monitors');
  assert.equal((await rows()).length, 1, 'old homework must remain available for teacher-assisted recovery');
  await login('S2');
  await page.evaluate(() => window.BuiReliable.remember('S2'));
  assert.deepEqual(await page.evaluate(() => window.BuiReliable.homeworkDrafts()), []);
  await page.evaluate(() => window.BuiReliable.resume(true));
  assert.equal((await rows()).length, 1, 'another account cannot replay or discard this monitor’s draft');
  assert.equal((await context.request.post(base + '/api/homework/records', { headers: { 'X-BuiO-Account': 'S1' }, data: payload('humanities') })).status(), 403);
  console.log('PASS: expired drafts are retained, dates stay protected, and accounts remain isolated');
  await teacher.close();
  page.off('request', countWrites);
  assert.ok(output.includes('HOMEWORK_TITLE_REQUIRED'), 'validation rejects must emit a safe diagnostic code');
  console.log(`All homework recovery browser scenarios passed (${process.env.BUIO_HOMEWORK_ENGINE || 'chromium'}).`);
} catch (error) {
  if (diagnosticPage) console.error('Fixture UI:', (await diagnosticPage.locator('body').innerText()).slice(0, 2400));
  throw error;
} finally {
  await browser?.close(); child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
  await fs.rm(temp, { recursive: true, force: true });
}
