import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

process.env.NODE_ENV = 'development';
const require = createRequire(import.meta.url);
const express = require('express');
const { Server } = require('socket.io');
const root = resolve('.'), output = resolve('artifacts/quiz-mode-20261029');
mkdirSync(output, { recursive: true });
const image = `data:image/webp;base64,${readFileSync(resolve('game-app/public/images/game/sky-panorama.webp')).toString('base64')}`;
const set = { id: 'quiz-fixture', title: '問答課堂測試', createdBy: 'teacher', questions: [
  { question: '圖中天空的主要顏色是甚麼？', image, choices: ['紅色', '藍色', '黃色', '綠色'], correctIndex: 1 },
  { question: '7 × 8 等於多少？', image: null, choices: ['48', '54', '56', '64'], correctIndex: 2 },
] };
const repoPath = require.resolve('../game-app/repositories/questionSets.repo');
const originalRepo = require.cache[repoPath];
require.cache[repoPath] = { id: repoPath, filename: repoPath, loaded: true, exports: {
  pgAvailable: () => true,
  listSets: async () => [{ id: set.id, title: set.title, questionCount: 2 }],
  getSetWithQuestions: async id => id === set.id ? set : null,
} };
const app = express();
function fixtureSession(req, _res, next) {
  const role = req.headers['x-quiz-test-role'];
  req.session = role ? { studentId: req.headers['x-quiz-test-user'] || role, role } : {};
  next();
}
app.use(fixtureSession);
const names = { s1: '心怡', s2: '梓朗', s3: '芷晴' };
app.get('/api/auth/me', (req, res) => req.session.studentId
  ? res.json({ student: { studentId: req.session.studentId, name: names[req.session.studentId] || req.session.studentId, role: req.session.role } })
  : res.status(401).json({ success: false }));
app.use('/api/games', require('../game-hub-app/routes/hub'));
app.get(['/api/game/sessions', '/api/tower-defense/sessions'], (_req, res) => res.json({ sessions: [] }));
app.use('/shared', express.static(resolve('shared')));
app.use('/games/js', express.static(resolve('game-hub-app/public/js')));
app.use('/games/css', express.static(resolve('game-hub-app/public/css')));
app.get('/games/preview', (_req, res) => res.sendFile(resolve('game-hub-app/public/index.html')));
app.use('/quiz-mode/css', express.static(resolve('quiz-app/public/css')));
app.use('/quiz-mode/js', express.static(resolve('quiz-app/public/js')));
app.use('/quiz-mode/assets', express.static(resolve('quiz-app/public/assets')));
app.use('/game/js', express.static(resolve('game-app/public/js')));
app.get(['/quiz-mode/host/preview', '/quiz-mode/preview'], (_req, res) => res.sendFile(resolve('quiz-app/public/index.html')));
app.get('/fixture', (_req, res) => res.send('<script src="/socket.io/socket.io.js"></script>'));
const http = createServer(app), io = new Server(http, { maxHttpBufferSize: 10 * 1024 * 1024 });
io.engine.use(fixtureSession);
require('../quiz-app/server/socket')(io, app);
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${http.address().port}`;
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const errors = [];
const contexts = [];
const pageFor = async (role, user, viewport = { width: 1440, height: 900 }, mobile = false) => {
  const context = await browser.newContext({ viewport, hasTouch: mobile, isMobile: mobile,
    extraHTTPHeaders: role ? { 'x-quiz-test-role': role, 'x-quiz-test-user': user } : {} });
  contexts.push(context);
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', dialog => void dialog.accept());
  return page;
};
const teacher = await pageFor('teacher', 'teacher');
await teacher.addInitScript(() => {
  window.__quizTestContexts = []; window.__quizTestAnimations = [];
  const NativeContext = window.AudioContext;
  window.AudioContext = class extends NativeContext {
    constructor(...args) { super(...args); window.__quizTestContexts.push(this); }
    createDynamicsCompressor() { const compressor = super.createDynamicsCompressor(); window.__quizTestCompressor = compressor; return compressor; }
  };
  const animate = Element.prototype.animate;
  Element.prototype.animate = function(...args) { window.__quizTestAnimations.push(this.className); return animate.apply(this, args); };
});
const students = [await pageFor('student', 's1', { width: 1180, height: 820 }, true),
  await pageFor('student', 's2', { width: 390, height: 844 }, true),
  await pageFor('student', 's3', { width: 820, height: 1180 }, true)];
const studentPackets = [];
for (const page of students) page.on('websocket', ws => ws.on('framereceived', ({ payload }) => {
  const packet = String(payload);
  if (!packet.startsWith('42/quiz,')) return;
  const [event, value] = JSON.parse(packet.slice(packet.indexOf('[')));
  if (event === 'quiz:state') studentPackets.push(value);
}));
const numberIn = value => Number(value.replace(/[^0-9]/g, ''));
const settledScores = () => teacher.waitForFunction(() => [...document.querySelectorAll('.score-value')]
  .every(cell => Number(cell.textContent.replace(/,/g, '')) === Number(cell.dataset.score)));
const audioLevel = () => teacher.evaluate(async () => {
  const context = window.__quizTestContexts[0];
  if (!context || context.state !== 'running') return { state: context?.state || 'missing', rms: 0 };
  const analyser = context.createAnalyser(); analyser.fftSize = 1024;
  window.__quizTestCompressor.connect(analyser);
  await new Promise(resolve => setTimeout(resolve, 300));
  const samples = new Float32Array(1024); analyser.getFloatTimeDomainData(samples);
  window.__quizTestCompressor.disconnect(analyser);
  return { state: context.state, rms: Math.sqrt(samples.reduce((n, x) => n + x * x, 0) / samples.length) };
});
try {
  await teacher.goto(`${base}/games/preview?role=teacher`);
  await teacher.locator('[data-select-set="quiz-fixture"]').click();
  await teacher.locator('[data-game="quiz"]').click();
  await teacher.locator('#quizSecondsInput').selectOption('5');
  await teacher.screenshot({ path: resolve(output, 'hub-third-mode.png'), fullPage: true });
  await teacher.locator('#createGameBtn').click();
  await teacher.waitForURL(/\/quiz-mode\/host\/preview/);
  await teacher.waitForSelector('#nextBtn:disabled');
  const code = (await teacher.locator('#pinValue').textContent()).trim();
  assert.match(code, /^\d{6}$/);
  for (const student of students) {
    await student.goto(`${base}/games/preview?role=student`);
    await student.locator('[data-filter="quiz"]').click();
    await student.locator(`[data-room-code="${code}"]`).click();
    await student.waitForSelector('.waiting-state h1');
  }
  await teacher.waitForFunction(() => document.querySelectorAll('#roster li').length === 3);
  await teacher.waitForFunction(() => document.querySelector('.lobby-trophy')?.naturalWidth > 100);
  await teacher.waitForTimeout(750);
  await teacher.screenshot({path:resolve(output,'host-lobby-polished.png')});
  await students[0].screenshot({path:resolve(output,'ipad-waiting-polished.png')});
  await teacher.bringToFront();
  await teacher.locator('#audioSettings summary').click();
  assert.equal(await teacher.locator('#musicToggle').isChecked(), true, 'teacher background music is on by default');
  const music = await audioLevel();
  assert.equal(music.state, 'running'); assert.ok(music.rms > .0001, 'the soundtrack produces real audio samples');
  await teacher.locator('#volumeSlider').focus(); await teacher.locator('#volumeSlider').press('Home');
  assert.ok((await audioLevel()).rms < .0001, 'zero volume silences the output');
  await teacher.locator('#volumeSlider').evaluate(input => { input.value = '35'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await teacher.locator('#musicToggle').uncheck();
  assert.equal(await teacher.locator('#musicToggle').isChecked(), false);
  await teacher.locator('#musicToggle').check();
  await teacher.locator('#audioSettings summary').click();
  assert.equal(await students[0].locator('#musicToggle').isChecked(), false, 'students do not play competing music by default');
  await teacher.locator('#nextBtn').click();
  await teacher.waitForFunction(() => document.getElementById('questionImage')?.naturalWidth > 100);
  await teacher.waitForTimeout(500);
  await teacher.screenshot({ path: resolve(output, 'host-question-image.png') });
  const fits = await teacher.locator('.host-choices').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight);
  assert.equal(fits, true, 'all choices stay visible on the teacher screen');
  for (const student of students) {
    await student.waitForSelector('[data-answer="1"]:enabled');
    assert.equal(await student.locator('[data-answer]').count(), 4);
    assert.equal(await student.locator('#questionImage, #questionText, .choice-text').count(), 0, 'student UI never renders question content');
    const geometry=await student.locator('#answerPad').evaluate(pad=>{
      const bounds=pad.getBoundingClientRect();
      return {right:bounds.right,bottom:bounds.bottom,width:innerWidth,height:innerHeight,buttons:[...pad.children].map(button=>({width:button.getBoundingClientRect().width,height:button.getBoundingClientRect().height}))};
    });
    assert.ok(geometry.right<=geometry.width+1&&geometry.bottom<=geometry.height+1,'all four answer buttons stay in the viewport');
    assert.ok(geometry.buttons.every(b=>b.width>=130&&b.height>=140),'answer targets remain large');
  }
  await students[0].screenshot({ path: resolve(output, 'ipad-student-buttons.png') });
  await students[1].screenshot({ path: resolve(output, 'phone-student-buttons.png') });
  await students[0].locator('[data-answer="1"]').tap();
  await teacher.waitForFunction(() => document.getElementById('answerCount')?.textContent.includes('1 / 3'));
  await students[0].reload();
  await students[0].waitForSelector('[data-answer="1"][aria-pressed="true"]:disabled');
  assert.equal(numberIn(await students[0].locator('.personal-score').textContent()), 0, 'live scores do not disclose correctness');
  await students[1].locator('[data-answer="1"]').tap();
  await teacher.waitForFunction(() => document.getElementById('answerCount')?.textContent.includes('2 / 3'));
  await teacher.reload();
  await teacher.waitForSelector('#answerCount');
  assert.equal(await teacher.locator('#volumeSlider').inputValue(), '35', 'audio preferences survive refresh');
  assert.match(await teacher.locator('#answerCount').textContent(), /2 \/ 3/);
  await students[2].locator('[data-answer="0"]').tap();
  await teacher.waitForSelector('#distributionChart');
  assert.deepEqual(await teacher.locator('.bar-count').allTextContents(), ['1', '2', '0', '0']);
  await teacher.locator('[data-bar="1"]').click();
  assert.match(await teacher.locator('#voterDetails').textContent(), /心怡/);
  assert.match(await teacher.locator('#voterDetails').textContent(), /梓朗/);
  assert.doesNotMatch(await teacher.locator('#voterDetails').textContent(), /芷晴/);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    await teacher.setViewportSize(viewport);
    const alignment = await teacher.locator('.distribution-choices').evaluate(choices => {
      const captions = [...document.querySelectorAll('.bar-caption')];
      return [...choices.children].map((choice, index) => {
        const answer = choice.getBoundingClientRect(), caption = captions[index].getBoundingClientRect();
        return { offset: Math.abs(answer.x + answer.width / 2 - caption.x - caption.width / 2), align: getComputedStyle(choice).textAlign };
      });
    });
    assert.ok(alignment.every(choice => choice.offset < 1 && choice.align === 'center'), `answers align beneath A/B/C/D at ${viewport.width}px`);
  }
  await teacher.setViewportSize({ width: 1440, height: 900 });
  await teacher.screenshot({ path: resolve(output, 'host-bars-and-names.png') });
  await teacher.locator('#questionTab').click();
  await teacher.waitForFunction(() => document.getElementById('reviewQuestionImage')?.naturalWidth > 100);
  assert.equal(await teacher.locator('#answerAnalysis').isVisible(), false);
  assert.equal(await teacher.locator('#reviewQuestionText').textContent(), set.questions[0].question);
  assert.equal(await teacher.locator('#questionReview .choice').count(), 4);
  await teacher.waitForTimeout(300);
  await teacher.screenshot({ path: resolve(output, 'host-review-question-image.png') });
  await teacher.locator('#statisticsTab').click();
  assert.match(await teacher.locator('#voterDetails').textContent(), /心怡/);
  await teacher.locator('[data-bar="0"]').click();
  assert.match(await teacher.locator('#voterDetails').textContent(), /芷晴/);
  await teacher.locator('#scoresBtn').click();
  await teacher.waitForSelector('#scoreTable tbody tr');
  await settledScores();
  assert.equal(await teacher.locator('#scoreTable tbody tr').count(), 3, 'all students appear in each leaderboard');
  const firstScores = await teacher.locator('.score-value').allTextContents();
  assert.ok(numberIn(firstScores[0]) > numberIn(firstScores[1]), 'faster correct answers earn more points');
  assert.equal(numberIn(firstScores[2]), 0);
  await teacher.screenshot({ path: resolve(output, 'host-all-scores.png') });
  await teacher.locator('#nextBtn').click();
  for (const student of students) await student.waitForSelector('[data-answer="2"]:enabled');
  await students[0].locator('[data-answer="2"]').tap();
  await students[1].locator('[data-answer="0"]').tap();
  await teacher.waitForSelector('#distributionChart', { timeout: 10000 });
  await teacher.locator('#unansweredBtn').click();
  assert.match(await teacher.locator('#voterDetails').textContent(), /芷晴/);
  await teacher.locator('#scoresBtn').click();
  await teacher.locator('#finishBtn').click();
  await teacher.waitForSelector('.podium');
  await teacher.waitForFunction(()=>document.querySelector('.final-trophy')?.naturalWidth>100);
  await settledScores();
  assert.ok(await teacher.evaluate(() => window.__quizTestAnimations.some(name => String(name).includes('bar-fill'))), 'result bars animate');
  assert.ok(await teacher.evaluate(() => window.__quizTestAnimations.some(name => String(name).includes('podium-step'))), 'the final podium animates');
  assert.equal(await teacher.locator('#scoreTable tbody tr').count(), 3);
  await teacher.waitForTimeout(1000);
  await teacher.screenshot({ path: resolve(output, 'host-final-leaderboard.png') });
  await students[0].reload();
  await students[0].waitForSelector('.podium');
  assert.equal(await students[0].locator('#scoreTable tbody tr').count(), 3, 'final scores survive reconnect');
  const downloadPromise = teacher.waitForEvent('download');
  await teacher.locator('#exportBtn').click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), `BuiO-quiz-${code}.csv`);
  await teacher.emulateMedia({ reducedMotion: 'reduce' });
  await teacher.waitForSelector('#quizConfetti', { state: 'detached' });
  assert.equal(await teacher.locator('#quizConfetti').count(), 0, 'reduced motion removes decorative effects');
  assert.equal(await teacher.locator('.quiz-sparks').count(), 0, 'reduced motion clears spark effects');
  assert.equal(await teacher.evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0);
  assert.ok(studentPackets.some(packet => packet.phase === 'question'), 'live student packets were inspected');
  for (const packet of studentPackets) {
    assert.equal(packet.question, undefined, 'question text, image and choices never reach student sockets');
    assert.equal(packet.distribution, undefined, 'individual answer lists stay teacher-only');
    if (packet.phase === 'question') {
      assert.equal(packet.correctIndex, undefined);
      assert.equal(packet.me.result, undefined);
      assert.equal(packet.leaderboard, undefined);
    }
  }

  const attacker = await pageFor('student', 'attacker');
  await attacker.goto(`${base}/fixture`);
  const denied = await attacker.evaluate(() => new Promise(resolve => {
    const socket = io('/quiz', { forceNew: true });
    socket.on('connect', () => socket.emit('host:create', { role: 'teacher' }, result => { socket.disconnect(); resolve(result); }));
  }));
  assert.equal(denied.ok, false, 'student sessions cannot create teacher rooms');
  const anonymous = await pageFor(null, null);
  await anonymous.goto(`${base}/fixture`);
  const anonymousDenied = await anonymous.evaluate(() => new Promise(resolve => {
    const socket = io('/quiz', { forceNew: true });
    socket.on('connect_error', e => { socket.disconnect(); resolve(e.message); });
  }));
  assert.match(anonymousDenied, /登入/);
  assert.deepEqual(errors, []);
  await teacher.locator('#closeBtn').click();
  console.log(JSON.stringify({ code, checks: ['hub integration', 'projected image and choices', 'three student screens', 'touch answers',
    'real-time counts', 'teacher and student reconnects', 'all-answered reveal', 'bar voter details', 'speed points', 'timeout and non-answers',
    'all-player scoreboards', 'final rankings', 'CSV export', 'student/anonymous authorization',
    'real audio output', 'volume and music controls', 'audio preference persistence', 'question/image review',
    'preserved voter selection', 'bar and podium transitions', 'animated scores', 'reduced motion',
    'custom trophy assets', 'responsive answer targets', 'lobby artwork', 'bounded spark effects'], audio: music, firstScores, output }, null, 2));
} catch (failure) {
  console.error(JSON.stringify({ errors, teacher: await teacher.locator('body').innerText(),
    students: await Promise.all(students.map(page => page.locator('body').innerText())) }, null, 2));
  await teacher.screenshot({ path: resolve(output, 'failure-host.png'), fullPage: true });
  throw failure;
} finally {
  await browser.close();
  await new Promise(resolve => io.close(resolve));
  if (originalRepo) require.cache[repoPath] = originalRepo; else delete require.cache[repoPath];
}
