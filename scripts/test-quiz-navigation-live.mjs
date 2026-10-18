import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const { io } = createRequire(path.join(root, 'whiteboard-app/client/package.json'))('socket.io-client');
const { gradeQuizAnswer } = require('../math-app/engine/quiz-grading');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-quiz-nav-'));
const file = path.join(temp, 'db.json'), out = path.join(root, 'tmp/quiz-navigation-qa');
await fs.mkdir(out, { recursive: true });
const passwordhash = bcrypt.hashSync('test', 4);
await fs.writeFile(file, JSON.stringify({ users: ['S001', 'S002', 'T001'].map(studentid => ({ studentid, name: studentid, role: studentid === 'T001' ? 'teacher' : 'student', classname: 'P1', language: 'zh-HK', passwordhash })), studentStats: [], questionLogs: [], _logId: 0 }));
const port = 3191, baseURL = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: file, SUPABASE_DB_URL: '', NODE_ENV: 'test', SESSION_SECRET: 'quiz-fixture-only', GOOGLE_API_KEY: '', GOOGLE_CREDENTIALS_JSON: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '', browser;
child.stdout.on('data', chunk => serverLog += chunk); child.stderr.on('data', chunk => serverLog += chunk);
const checks = [], timings = {}, errors = [], dialogs = [];
const pass = name => { checks.push(name); console.log('PASS', name); };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async (condition, timeout = 5000) => { const end = Date.now() + timeout; while (!condition()) { if (Date.now() > end) throw Error('Fixture condition timed out'); await pause(30); } };
const saved = async () => JSON.parse(await fs.readFile(file, 'utf8'));
const login = async (context, id = 'S001') => { const r = await context.request.post('/api/auth/login', { data: { studentId: id, password: 'test' } }); assert.equal(r.status(), 200); };
const answer = text => { assert.match(text, /^[\d\s()+\-×÷]+$/); return String(Function('return ' + text.replaceAll('×', '*').replaceAll('÷', '/'))()); };
try {
  for (let n = 0; n < 80; n++) { try { if ((await fetch(baseURL + '/health/live')).ok) break; } catch {} if (child.exitCode !== null) throw Error(serverLog); await pause(100); }
  assert.match((await fetch(baseURL + '/health/live')).headers.get('server-timing'), /app;dur=/);
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ baseURL, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
  const externalFonts = [];
  await page.route('https://fonts.googleapis.com/**', route => externalFonts.push(route));
  const recordDialog = dialog => { dialogs.push(dialog.message()); return dialog.dismiss(); };
  page.on('dialog', recordDialog);
  await login(context);

  const heldHomework = [];
  await page.route('**/api/homework/{meta,pending}', route => heldHomework.push(route));
  const opened = performance.now();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.locator('#openMathBtn').waitFor({ timeout: 3000 });
  timings.homeReadyWithHomeworkUnavailableMs = Math.round(performance.now() - opened);
  await until(() => heldHomework.length === 2);
  assert.match(await page.locator('.homework-reminder').innerText(), /載入/);
  assert.ok(!await page.locator('.homework-reminder.clear').count());
  await page.screenshot({ path: path.join(out, '01-home-usable-while-homework-pending.png') });
  // A late background read must not erase a settings form the user has opened.
  await page.locator('[data-view="settings"]').click();
  await page.locator('#settingsForm [name="language"]').selectOption('en-US');
  for (const route of heldHomework.splice(0)) await route.fulfill({ json: new URL(route.request().url()).pathname.endsWith('/meta') ? { success: true, canAccess: true } : { success: true, pending: [{ date: '2026-10-18', subjectName: '中文', homework: 'Fixture homework' }], history: [] } });
  await pause(250);
  assert.equal(await page.locator('#settingsForm [name="language"]').inputValue(), 'en-US');
  await page.locator('[data-view="dashboard"]').click();
  assert.match(await page.locator('.homework-reminders').innerText(), /Fixture homework/);
  await page.unroute('**/api/homework/{meta,pending}');
  pass('portal is usable while both homework requests are stalled; it does not invent an empty record or erase an open form');

  // Verify stale homework responses cannot contaminate a new login.
  await page.route('**/api/homework/{meta,pending}', route => heldHomework.push(route));
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.locator('#openMathBtn').waitFor();
  await until(() => heldHomework.length === 2);
  const oldHomework = heldHomework.splice(0);
  await page.locator('#logoutBtn').click();
  await page.locator('#userIdInput').fill('S002'); await page.locator('#passwordInput').fill('test');
  await page.locator('#loginForm button[type="submit"]').click(); await page.locator('#openMathBtn').waitFor();
  await until(() => heldHomework.length === 2);
  for (const route of heldHomework.splice(0)) await route.fulfill({ json: { success: true, canAccess: false, pending: [], history: [] } });
  await page.locator('.homework-reminder.clear').waitFor();
  for (const route of oldHomework) await route.fulfill({ json: { success: true, canAccess: true, pending: [{ homework: 'Wrong old account' }], history: [] } });
  await pause(200);
  assert.ok(!(await page.locator('#app').innerText()).includes('Wrong old account'));
  assert.equal(await page.locator('[data-open-module="homework"]').count(), 0);
  await page.unroute('**/api/homework/{meta,pending}');
  pass('logout/login isolates late homework replies from the previous account');

  await login(context);
  let gradeHttp = 0, gradeMode = 'healthy', socketReady = false, delayAcknowledgements = false, dropAcknowledgements = false;
  let quizData;
  page.on('response', async response => { if (new URL(response.url()).pathname === '/api/quiz/questions' && response.ok()) quizData = await response.json(); });
  const heldGrades = [];
  await page.route('**/api/quiz/grade', route => {
    gradeHttp++;
    if (gradeMode === 'stall' || (gradeMode === 'stall-first' && gradeHttp === 1)) { heldGrades.push(route); return; }
    return route.continue();
  });
  await page.routeWebSocket('**/socket.io/**', route => {
    const server = route.connectToServer();
    server.onMessage(message => {
      const text = String(message);
      if (text.startsWith('40/math-quiz,')) socketReady = true;
      if (dropAcknowledgements && text.startsWith('43/math-quiz,')) return;
      if (delayAcknowledgements && text.startsWith('43/math-quiz,')) { setTimeout(() => { try { route.send(message); } catch {} }, 2500); return; }
      route.send(message);
    });
  });
  await page.goto('/quiz.html'); await page.locator('#quiz-state').waitFor({ state: 'visible' });
  await until(() => socketReady && quizData);
  const enterAnswer = async value => {
    for (const digit of await page.locator('#answer-input').inputValue()) await page.locator('[data-key="backspace"]').click();
    for (const digit of value) await page.locator(`[data-key="${digit}"]`).click();
  };
  const fillAndSubmit = async (value, expectedQuestion) => {
    await enterAnswer(value);
    const at = performance.now(); await page.locator('#submit-answer-btn').click();
    await page.waitForFunction(n => document.querySelector('#question-number').textContent.includes(String(n)), expectedQuestion);
    return Math.round(performance.now() - at);
  };
  gradeMode = 'stall';
  timings.socketFeedbackIncludingAnimationMs = await fillAndSubmit(answer(quizData.questions[0].questionText), 2);
  assert.equal(gradeHttp, 0, 'healthy persistent feedback does not send a per-question HTTP request');
  assert.equal((await saved()).questionLogs.length, 0, 'feedback has no persistence side effects');
  await page.screenshot({ path: path.join(out, '02-authoritative-feedback-with-stalled-http.png') });
  pass('server feedback advances a question despite stalled HTTP, without guessing or writing marks');

  gradeMode = 'healthy'; delayAcknowledgements = true;
  timings.socketTimeoutFallbackMs = await fillAndSubmit(answer(quizData.questions[1].questionText), 3);
  assert.equal(gradeHttp, 1);
  await pause(1500);
  assert.match(await page.locator('#question-number').innerText(), /3/);
  pass('a delayed socket acknowledgement falls back to HTTP once and cannot skip a later question');

  gradeMode = 'stall-first'; gradeHttp = 0; dropAcknowledgements = true;
  timings.lostHttpFallbackMs = await fillAndSubmit(answer(quizData.questions[2].questionText), 4);
  assert.equal(gradeHttp, 2, 'only the read-only feedback retries');
  for (const route of heldGrades.splice(0)) await route.abort().catch(() => {});
  pass('a lost HTTP feedback response has one bounded retry and preserves authoritative grading');

  gradeMode = 'stall'; gradeHttp = 0;
  const retained = answer(quizData.questions[3].questionText);
  await enterAnswer(retained);
  await pause(1200);
  const thinkingTime = Number(await page.locator('#timer-value').innerText());
  await page.locator('#submit-answer-btn').click();
  await page.waitForFunction(() => !document.querySelector('#submit-answer-btn').disabled, null, { timeout: 20000 });
  assert.equal(await page.locator('#answer-input').inputValue(), retained);
  assert.match(await page.locator('#question-number').innerText(), /4/);
  assert.equal(gradeHttp, 2);
  assert.equal((await saved()).questionLogs.length, 0);
  assert.match(await page.locator('#grade-status').innerText(), /重試判分/);
  assert.equal(await page.locator('#submit-answer-btn').innerText(), '重試判分');
  assert.deepEqual(dialogs, [], 'transport failure never opens a native technical-error dialog');
  await page.locator('#buio-loading-status').waitFor({ state: 'hidden', timeout: 1500 });
  await pause(150);
  assert.ok(Number(await page.locator('#timer-value').innerText()) >= thinkingTime, 'retry preserves the existing thinking time');
  await page.screenshot({ path: path.join(out, '05-feedback-failure-keeps-answer.png') });
  for (const route of heldGrades.splice(0)) await route.abort().catch(() => {});
  pass('when both transports fail, the answer stays editable and the UI never invents a grade');

  gradeMode = 'healthy'; delayAcknowledgements = false; dropAcknowledgements = false;
  for (let i = 3; i < 6; i++) {
    await enterAnswer(i === 5 ? '999' : answer(quizData.questions[i].questionText));
    await page.locator('#submit-answer-btn').click();
    if (i < 5) await page.waitForFunction(n => document.querySelector('#question-number').textContent.includes(String(n)), i + 2);
  }
  await page.locator('#results-state').waitFor({ state: 'visible' });
  assert.equal((await saved()).questionLogs.length, 6);
  assert.equal((await saved()).questionLogs.filter(q => q.iscorrect).length, 5);
  assert.equal((await saved()).operationReceipts.length, 1);
  assert.ok((await saved()).questionLogs[3].timespent >= 1, 'a retry does not reset the saved thinking time');
  pass('the completed set is regraded and persisted exactly once, including an intentionally wrong answer');

  let heldChart;
  await page.route('**/vendor/chart.js/4.4.7/chart.umd.js', route => { heldChart = route; });
  const dashOpened = performance.now();
  const dashResponse = await page.goto('/dashboard.html', { waitUntil: 'commit' });
  timings.dashboardCommitMs = Math.round(performance.now() - dashOpened);
  await page.waitForLoadState('domcontentloaded');
  timings.dashboardDomMs = Math.round(performance.now() - dashOpened);
  timings.dashboardServerTiming = dashResponse.headers()['server-timing'];
  await page.locator('#dashboard-content').waitFor({ state: 'visible', timeout: 3000 });
  timings.dashboardReadyWithChartStalledMs = Math.round(performance.now() - dashOpened);
  timings.dashboardNavigation = await page.evaluate(() => performance.getEntriesByType('navigation').map(e => ({ duration: e.duration, requestStart: e.requestStart, responseStart: e.responseStart, responseEnd: e.responseEnd, domInteractive: e.domInteractive, domContentLoadedEventEnd: e.domContentLoadedEventEnd })));
  assert.equal(await page.locator('#total-questions').innerText(), '6');
  assert.equal(await page.locator('#total-correct').innerText(), '5');
  assert.ok(await page.locator('#back-home-link').isVisible());
  assert.ok(timings.dashboardReadyWithChartStalledMs < 3000, 'stalled external assets cannot delay the dashboard');
  await until(() => heldChart);
  await page.screenshot({ path: path.join(out, '03-dashboard-usable-before-chart.png') });
  await heldChart.continue(); await page.unroute('**/vendor/chart.js/4.4.7/chart.umd.js');
  await page.waitForFunction(() => typeof Chart !== 'undefined' && document.querySelector('#radar-tier-grid canvas'));
  await page.screenshot({ path: path.join(out, '04-dashboard-charts-loaded.png') });
  await page.locator('#back-home-link').click(); await page.locator('#greeting').waitFor();
  pass('dashboard totals/navigation do not wait for charts; the pinned local chart renders and Home works');
  assert.equal(externalFonts.length, 0, 'math pages never request a blocking external font');
  pass('quiz, dashboard and math Home initialize without any external font dependency');

  // Auth and quiz identity are checked on the real Socket.IO namespace.
  const socket = io(baseURL + '/math-quiz', { transports: ['websocket'], auth: { quizId: 'wrong-quiz' }, reconnection: false });
  const rejected = await new Promise((resolve, reject) => { const t = setTimeout(() => reject(Error('Anonymous socket accepted or stalled')), 3000); socket.on('connect_error', e => { clearTimeout(t); resolve(e.data.status); }); });
  socket.disconnect(); assert.equal(rejected, 401);
  const freshQuiz = await (await context.request.get('/api/quiz/questions?count=6')).json();
  const signedCookie = (await context.cookies()).map(c => `${c.name}=${c.value}`).join('; ');
  const signedSocket = io(baseURL + '/math-quiz', { transports: ['websocket'], auth: { quizId: freshQuiz.quizId }, extraHeaders: { Cookie: signedCookie }, reconnection: false });
  await new Promise((resolve, reject) => { signedSocket.once('connect', resolve); signedSocket.once('connect_error', reject); });
  const malformed = await signedSocket.timeout(2000).emitWithAck('quiz:grade', { quizId: freshQuiz.quizId, index: 1, userAnswer: { toString: 'invalid' } });
  assert.equal(malformed.status, 400);
  const changed = await signedSocket.timeout(2000).emitWithAck('quiz:grade', { quizId: 'wrong', index: 1, userAnswer: 0 });
  assert.equal(changed.status, 409);
  const realFeedback = await signedSocket.timeout(2000).emitWithAck('quiz:grade', { quizId: freshQuiz.quizId, index: 1, userAnswer: answer(freshQuiz.questions[0].questionText), isCorrect: false, correctAnswer: 123456 });
  assert.equal(realFeedback.result.isCorrect, true); signedSocket.disconnect();
  assert.equal((await saved()).questionLogs.length, 6);
  const question = { index: 1, tag: 'frac_add', answerType: 'fraction', answerNumerator: 1, answerDenominator: 2, questionText: '1/4 + 1/4' };
  const session = { studentId: 'fixture', currentQuizId: 'fixture-quiz', currentQuiz: [question] };
  assert.equal(gradeQuizAnswer(session, { quizId: 'other', index: 1 }, true).status, 409);
  assert.equal(gradeQuizAnswer(session, { quizId: 'fixture-quiz', index: 1, userNumerator: 1, userDenominator: 2, correctAnswer: 99 }, true).result.isCorrect, true);
  assert.equal(gradeQuizAnswer(session, { quizId: 'fixture-quiz', index: 1, userNumerator: 2, userDenominator: 4, isCorrect: true }, true).result.isCorrect, false);
  session.currentQuiz = [{ index: 1, tag: 'add_up_to_3n', questionText: '0.1 + 0.2', correctAnswer: 0.3 }];
  assert.equal(gradeQuizAnswer(session, { quizId: 'fixture-quiz', index: 1, userAnswer: '0.3' }, true).result.isCorrect, true);
  assert.equal(gradeQuizAnswer(session, { quizId: 'fixture-quiz', index: 1, userAnswer: '0.3evil', isCorrect: true }, true).result.isCorrect, false);
  pass('anonymous sockets, changed quiz ids and forged grade fields are rejected; fraction/decimal grading stays exact');
  const noSocketPage = await context.newPage(); noSocketPage.on('pageerror', e => errors.push(e.message));
  await noSocketPage.route('**/socket.io/socket.io.min.js', route => route.abort());
  const noSocketQuestions = noSocketPage.waitForResponse(r => new URL(r.url()).pathname === '/api/quiz/questions' && r.ok());
  await noSocketPage.goto('/quiz.html');
  const fallbackQuiz = await (await noSocketQuestions).json();
  await noSocketPage.locator('#quiz-state').waitFor({ state: 'visible' });
  for (const digit of answer(fallbackQuiz.questions[0].questionText)) await noSocketPage.locator(`[data-key="${digit}"]`).click();
  await noSocketPage.locator('#submit-answer-btn').click();
  await noSocketPage.waitForFunction(() => document.querySelector('#question-number').textContent.includes('2'));
  assert.equal(await noSocketPage.locator('.buio-loading-floating').count(), 0, 'optional transport failure never adds a whole-page recovery prompt');
  await noSocketPage.close();
  pass('a missing Socket.IO library still permits normal HTTP grading and never prevents entry');
  const slowPage = await context.newPage(); slowPage.on('pageerror', e => errors.push(e.message)); slowPage.on('dialog', recordDialog);
  await slowPage.route('**/socket.io/socket.io.min.js', route => route.abort());
  let slowRequests = 0, slowPrimary; const slowBackups = [];
  await slowPage.route('**/api/quiz/grade', async route => {
    if (++slowRequests > 1) { slowBackups.push(route); return; }
    slowPrimary = route.request(); await pause(3500); await route.continue();
  });
  const slowQuestions = slowPage.waitForResponse(r => new URL(r.url()).pathname === '/api/quiz/questions' && r.ok());
  await slowPage.goto('/quiz.html'); const slowQuiz = await (await slowQuestions).json();
  await slowPage.locator('#quiz-state').waitFor({ state: 'visible' });
  for (const digit of answer(slowQuiz.questions[0].questionText)) await slowPage.locator(`[data-key="${digit}"]`).click();
  const slowStart = performance.now(); await slowPage.locator('#submit-answer-btn').click();
  await slowPage.waitForFunction(() => document.querySelector('#question-number').textContent.includes('2'), null, { timeout: 8000 });
  timings.slowValidHttpMs = Math.round(performance.now() - slowStart);
  assert.equal(slowRequests, 2, 'one read-only backup starts without cancelling the primary');
  assert.equal(slowPrimary.failure(), null, 'the slow primary finishes normally');
  assert.equal(await slowPage.locator('#grade-status').isVisible(), false);
  for (const route of slowBackups) await route.abort().catch(() => {});
  await slowPage.close();
  pass('a valid 3.5-second HTTP reply is accepted once without a premature abort or dialog');

  const latePage = await context.newPage(); latePage.on('pageerror', e => errors.push(e.message)); latePage.on('dialog', recordDialog);
  let lateReady = false; const lateHttp = [];
  await latePage.route('**/api/quiz/grade', route => lateHttp.push(route));
  await latePage.routeWebSocket('**/socket.io/**', route => {
    const server = route.connectToServer();
    server.onMessage(message => {
      const text = String(message);
      if (text.startsWith('40/math-quiz,')) lateReady = true;
      if (text.startsWith('43/math-quiz,')) { setTimeout(() => { try { route.send(message); } catch {} }, 3500); return; }
      route.send(message);
    });
  });
  const lateQuestions = latePage.waitForResponse(r => new URL(r.url()).pathname === '/api/quiz/questions' && r.ok());
  await latePage.goto('/quiz.html'); const lateQuiz = await (await lateQuestions).json();
  await latePage.locator('#quiz-state').waitFor({ state: 'visible' }); await until(() => lateReady);
  for (const digit of answer(lateQuiz.questions[0].questionText)) await latePage.locator(`[data-key="${digit}"]`).click();
  const lateStart = performance.now(); await latePage.locator('#submit-answer-btn').click();
  await latePage.waitForFunction(() => document.querySelector('#question-number').textContent.includes('2'), null, { timeout: 8000 });
  timings.lateSocketWithStalledHttpMs = Math.round(performance.now() - lateStart);
  assert.ok(lateHttp.length >= 1 && lateHttp.length <= 2, 'HTTP fallback stays bounded while the socket reply is delayed');
  assert.equal(await latePage.locator('#grade-status').isVisible(), false);
  for (const route of lateHttp) await route.abort().catch(() => {});
  await latePage.close();
  pass('a late valid socket reply wins while HTTP is stalled and cancels only the redundant request');
  assert.deepEqual(dialogs, []);
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ pass: true, checks, timings, errors, dialogs, fixture: 'isolated local JSON; not production classroom timings' }, null, 2));
  console.log(JSON.stringify(timings, null, 2));
} catch (error) {
  await fs.writeFile(path.join(out, 'failure.json'), JSON.stringify({ error: error.stack, checks, timings, errors, serverLog: serverLog.slice(-5000) }, null, 2));
  throw error;
} finally {
  await browser?.close(); child.kill('SIGTERM'); await Promise.race([once(child, 'exit'), pause(3000)]);
  const resolved = path.resolve(temp);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir())); assert.ok(path.basename(resolved).startsWith('buio-quiz-nav-'));
  await fs.rm(resolved, { recursive: true, force: true });
}
