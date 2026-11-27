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
const root = resolve('.'), output = resolve('artifacts/quiz-mode-20261116');
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
app.get(['/quiz-mode/host/preview', '/quiz-mode/preview', '/quiz-mode/host', '/quiz-mode'], (_req, res) => res.sendFile(resolve('quiz-app/public/index.html')));
app.get('/fixture', (_req, res) => res.send('<script src="/socket.io/socket.io.js"></script>'));
const http = createServer(app), io = new Server(http, { maxHttpBufferSize: 10 * 1024 * 1024 });
const petPath = require.resolve('../pet-app/repositories/pet.repo');
const originalPet = require.cache[petPath];
let payments = 0, allowPayments = false, failPayments = true;
require.cache[petPath] = { id: petPath, filename: petPath, loaded: true, exports: { grantCoins: async () => {
  payments++; if (!allowPayments || failPayments) throw Object.assign(new Error('Fixture payment interrupted'), { code: 'TEST_DELIVERY_FAILED' });
  return { count: 1, amount: 8 };
} } };
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
  assert.equal(await teacher.locator('#quizCoinsPerCorrectInput').isDisabled(), true);
  await teacher.locator('#quizCoinRewardToggle').check();
  await teacher.locator('#quizCoinsPerCorrectInput').fill('17');
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
  assert.match(await teacher.locator('.lobby-facts').textContent(), /17/);
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
  await teacher.waitForSelector('#questionIntro:not([hidden])');
  for (const page of [teacher, ...students]) {
    await page.waitForSelector('#questionIntro:not([hidden])');
    const cover = await page.locator('#questionIntro').evaluate(intro => {
      const bounds = intro.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
        viewportWidth: innerWidth, viewportHeight: innerHeight, inert: document.getElementById('main').inert };
    });
    assert.deepEqual([cover.x, cover.y, cover.width, cover.height], [0, 0, cover.viewportWidth, cover.viewportHeight], 'the pre-question transition covers the whole viewport');
    assert.equal(cover.inert, true, 'content behind the countdown cannot be focused or pressed');
  }
  assert.equal(await teacher.locator('#questionText').isVisible(), false, 'question text is hidden until the countdown finishes');
  for (const student of students) {
    assert.equal(await student.locator('[data-answer]:enabled').count(), 0, 'answers stay locked during the transition');
    assert.equal(await student.locator('#questionText').isVisible(), false, 'student question text stays hidden until the countdown finishes');
    assert.equal(await student.locator('#questionImage').isVisible(), false, 'student question image stays hidden until the countdown finishes');
    assert.equal(await student.locator('#answerPad .choice-text').first().isVisible(), false, 'student choice text stays hidden until the countdown finishes');
  }
  await students[2].emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await students[2].locator('#questionIntro').isVisible(), true, 'reduced motion keeps the preparation countdown');
  await students[2].waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running'));
  assert.equal(await students[2].evaluate(() => document.getAnimations().filter(a => a.playState === 'running').length), 0, 'reduced motion disables the curtain animation');
  await teacher.waitForTimeout(450);
  await teacher.screenshot({ path: resolve(output, 'host-question-intro.png') });
  await students[1].screenshot({ path: resolve(output, 'phone-question-intro.png') });
  await students[2].screenshot({ path: resolve(output, 'ipad-question-intro-reduced.png') });
  await teacher.waitForSelector('#questionIntro', { state: 'hidden' });
  assert.equal(await teacher.locator('#main').evaluate(main => main.inert), false);
  assert.equal(await teacher.locator('#questionText').isVisible(), true);
  await students[2].emulateMedia({ reducedMotion: 'no-preference' });
  const firstRound = studentPackets.find(packet => packet.phase === 'question');
  assert.equal(firstRound.closesAt - firstRound.opensAt, 5000, 'the transition does not consume any answer time');
  await teacher.waitForFunction(() => document.getElementById('questionImage')?.naturalWidth > 100);
  await teacher.waitForTimeout(500);
  await teacher.screenshot({ path: resolve(output, 'host-question-image.png') });
  const fits = await teacher.locator('.host-choices').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight);
  assert.equal(fits, true, 'all choices stay visible on the teacher screen');
  for (const student of students) {
    await student.waitForSelector('[data-answer="1"]:enabled');
    await student.waitForFunction(() => document.getElementById('questionImage')?.naturalWidth > 100);
    assert.equal(await student.locator('[data-answer]').count(), 4);
    assert.equal(await student.locator('#questionText').isVisible(), true);
    assert.equal(await student.locator('#questionText').textContent(), set.questions[0].question);
    assert.equal(await student.locator('#questionImage').isVisible(), true);
    assert.deepEqual(await student.locator('#answerPad .choice-text').allTextContents(), set.questions[0].choices);
    const geometry = await student.evaluate(() => {
      const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      const pad = document.getElementById('answerPad');
      return {
        title: bounds('#questionText'),
        image: bounds('#questionImage'),
        pad: bounds('#answerPad'),
        fit: getComputedStyle(document.getElementById('questionImage')).objectFit,
        width: innerWidth,
        height: innerHeight,
        buttons: [...pad.children].map(button => { const r = button.getBoundingClientRect(); return { width: r.width, height: r.height }; }),
      };
    });
    assert.equal(geometry.fit, 'contain');
    assert.ok(geometry.image.width >= 140 && geometry.image.height >= 120, `student image remains clearly visible: ${JSON.stringify(geometry.image)}`);
    assert.ok(geometry.title.bottom <= geometry.image.y + 1 && geometry.image.bottom <= geometry.pad.y + 1, 'student question, image and choices never overlap');
    assert.ok(geometry.pad.right <= geometry.width + 1 && geometry.pad.bottom <= geometry.height + 1, 'all four answer buttons stay in the viewport');
    assert.ok(geometry.buttons.every(b => b.width >= 130 && b.height >= 64), `answer targets remain comfortable: ${JSON.stringify(geometry.buttons)}`);
  }
  await students[0].screenshot({ path: resolve(output, 'ipad-student-buttons.png') });
  await students[1].screenshot({ path: resolve(output, 'phone-student-buttons.png') });
  await students[0].locator('[data-answer="1"]').tap();
  await teacher.waitForFunction(() => document.getElementById('answerCount')?.textContent.includes('1 / 3'));
  await students[0].reload();
  await students[0].waitForSelector('[data-answer="1"][aria-pressed="true"]:disabled');
  assert.equal(await students[0].locator('#questionIntro').isVisible(), false, 'reconnecting during answers does not replay the intro');
  assert.equal(numberIn(await students[0].locator('.personal-score').textContent()), 0, 'live scores do not disclose correctness');
  await students[1].locator('[data-answer="1"]').tap();
  await teacher.waitForFunction(() => document.getElementById('answerCount')?.textContent.includes('2 / 3'));
  await teacher.reload();
  await teacher.waitForSelector('#answerCount');
  assert.equal(await teacher.locator('#volumeSlider').inputValue(), '35', 'audio preferences survive refresh');
  assert.match(await teacher.locator('#answerCount').textContent(), /2 \/ 3/);
  await students[2].locator('[data-answer="0"]').tap();
  await teacher.waitForSelector('#distributionChart');
  await students[0].waitForSelector('.coin-feedback');
  assert.match(await students[0].locator('.coin-feedback').textContent(), /17.*預覽/);
  assert.equal(await students[2].locator('.coin-feedback').count(), 0, 'wrong answers do not earn coin rewards');
  for (const student of students.slice(0, 2)) {
    await student.waitForSelector('.coin-feedback');
    assert.equal(await student.locator('#questionText').isVisible(), true);
    assert.equal(await student.locator('#questionImage').isVisible(), true);
    assert.deepEqual(await student.locator('#answerPad .choice-text').allTextContents(), set.questions[0].choices);
    assert.ok(await student.locator('#answerPad').evaluate(pad => pad.getBoundingClientRect().bottom <= innerHeight + 1), 'reward feedback keeps question, image and student answer buttons in view');
  }
  await students[0].screenshot({ path: resolve(output, 'ipad-student-results-image.png') });
  assert.equal(payments, 0, 'preview rooms never write real wallets');
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
  await teacher.waitForSelector('#questionIntro:not([hidden])');
  assert.match(await teacher.locator('#introQuestion').textContent(), /2 \/ 2/);
  for (const student of students) {
    await student.waitForSelector('[data-answer="2"]:enabled');
    assert.equal(await student.locator('#questionText').textContent(), set.questions[1].question);
    assert.equal(await student.locator('#questionImage').count(), 0);
    assert.deepEqual(await student.locator('#answerPad .choice-text').allTextContents(), set.questions[1].choices);
    assert.ok(await student.locator('#answerPad').evaluate(pad => pad.getBoundingClientRect().bottom <= innerHeight + 1));
  }
  await students[1].screenshot({ path: resolve(output, 'phone-student-text-question.png') });
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
    assert.equal(packet.distribution, undefined, 'individual answer lists stay teacher-only');
    if (['question', 'results'].includes(packet.phase)) {
      assert.ok(packet.question && typeof packet.question.question === 'string' && packet.question.choices.length === 4, 'student receives question and choices during active/results phase');
      assert.equal(packet.question.correctIndex, undefined, 'question payload never includes correctIndex');
    } else {
      assert.equal(packet.question, undefined, 'non-question phases do not carry question payloads');
    }
    if (packet.phase === 'question') {
      assert.equal(packet.correctIndex, undefined);
      assert.equal(packet.me.result, undefined);
      assert.equal(packet.me.coinReward, undefined);
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
  await teacher.waitForFunction(() => document.getElementById('roomPin').hidden);
  const cancelledIntro = await teacher.evaluate(async () => {
    const { QuizPresentation } = await import('/quiz-mode/js/QuizPresentation.js?v=20261115-intro-1');
    const visual = new QuizPresentation(document.getElementById('main'));
    let fired = false;
    visual.questionIntro({ key: 'cancelled-round', label: 'Next question', remainingMs: 50, onReady: () => { fired = true; } });
    const covered = !document.getElementById('questionIntro').hidden && document.getElementById('main').inert;
    visual.present({ code: 'cancelled', phase: 'lobby', roundId: null }, { host: true });
    await new Promise(resolve => setTimeout(resolve, 100));
    const restored = document.getElementById('questionIntro').hidden && !document.body.classList.contains('question-intro-active')
      && [...document.querySelectorAll('.topbar, #main, #controls')].every(node => !node.inert);
    visual.destroy();
    return { covered, restored, fired };
  });
  assert.deepEqual(cancelledIntro, { covered: true, restored: true, fired: false }, 'leaving the question cancels the cover and pending timer');
  await teacher.goto(`${base}/quiz-mode/host/preview`);
  await teacher.waitForSelector('#coinRewardToggle');
  assert.equal(await teacher.locator('#coinsPerCorrectInput').isDisabled(), true);
  await teacher.locator('#coinRewardToggle').check();
  assert.equal(await teacher.locator('#coinsPerCorrectInput').isEnabled(), true);
  await teacher.screenshot({ path: resolve(output, 'host-coin-settings.png') });
  set.questions[0].question = '圖 A、B、C 的四條邊各自等長。哪些圖形是菱形？ Each of shapes A, B and C has four equal sides. Which shapes are rhombuses?';
  set.questions[0].choices = ['只有圖 A Shape A only', '只有圖 B Shape B only', '只有圖 A 和圖 C Shapes A and C only', '圖 A、B 和 C Shapes A, B and C'];
  await teacher.goto(`${base}/quiz-mode/host/preview?autocreate=1&setId=quiz-fixture&seconds=120&limit=1`);
  await teacher.waitForSelector('#nextBtn');
  const layoutCode = (await teacher.locator('#pinValue').textContent()).trim();
  await students[0].goto(`${base}/quiz-mode/preview?room=${layoutCode}&autojoin=1&name=Layout`);
  await teacher.locator('#nextBtn:enabled').click();
  await teacher.waitForSelector('#questionIntro', { state: 'hidden' });
  await teacher.waitForSelector('#questionImage');
  for (const viewport of [{ width: 1920, height: 940 }, { width: 1440, height: 900 }, { width: 1180, height: 820 }, { width: 1024, height: 768 }, { width: 820, height: 1180 }]) {
    await teacher.setViewportSize(viewport);
    const layout = await teacher.evaluate(() => {
      const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
      return { title: bounds('#questionText'), image: bounds('#questionImage'), choices: bounds('.host-choices'), footer: bounds('#controls'),
        fit: getComputedStyle(document.getElementById('questionImage')).objectFit, width: innerWidth, height: innerHeight };
    });
    assert.ok(layout.title.bottom <= layout.image.y + 1 && layout.image.bottom <= layout.choices.y + 1, `question, image and answers never overlap at ${viewport.width}px`);
    assert.ok(layout.choices.bottom <= layout.footer.y + 1 && layout.footer.bottom <= layout.height + 1, 'all choices and teacher controls stay visible');
    assert.equal(layout.fit, 'contain');
    if (viewport.width === 1920) {
      assert.ok(layout.image.width >= 550 && layout.image.height >= 290, `100% zoom keeps the image large: ${JSON.stringify(layout.image)}`);
    }
    await teacher.screenshot({ path: resolve(output, `host-large-image-${viewport.width}.png`) });
  }
  await students[0].waitForSelector('#questionImage');
  for (const viewport of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    await students[0].setViewportSize(viewport);
    const layout = await students[0].evaluate(() => {
      const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom, right: r.right }; };
      return { title: bounds('#questionText'), image: bounds('#questionImage'), choices: bounds('#answerPad'),
        fit: getComputedStyle(document.getElementById('questionImage')).objectFit, width: innerWidth, height: innerHeight };
    });
    assert.ok(layout.title.bottom <= layout.image.y + 1 && layout.image.bottom <= layout.choices.y + 1, `student bilingual question, image and answers never overlap at ${viewport.width}px`);
    assert.ok(layout.choices.bottom <= layout.height + 1 && layout.choices.right <= layout.width + 1, `all student bilingual choices stay visible at ${viewport.width}px`);
    assert.ok(layout.image.width >= 140 && layout.image.height >= 120, `student bilingual image remains clearly visible at ${viewport.width}px`);
    assert.equal(layout.fit, 'contain');
    await students[0].screenshot({ path: resolve(output, `student-large-image-${viewport.width}.png`) });
  }
  await students[0].setViewportSize({ width: 1180, height: 820 });
  await teacher.locator('#endBtn').click();
  await teacher.waitForSelector('#closeBtn');
  await teacher.locator('#closeBtn').click();
  assert.deepEqual(errors, []);
  allowPayments = true;
  await teacher.goto(`${base}/quiz-mode/host`);
  await teacher.waitForSelector('#coinRewardToggle');
  await teacher.locator('#bankSelect').selectOption('quiz-fixture');
  await teacher.locator('#coinRewardToggle').check();
  await teacher.locator('#coinsPerCorrectInput').fill('8');
  await teacher.locator('#createBtn').click();
  await teacher.waitForSelector('#nextBtn');
  const paidCode = (await teacher.locator('#pinValue').textContent()).trim();
  await students[0].goto(`${base}/quiz-mode?room=${paidCode}&autojoin=1&name=Reward`);
  await teacher.locator('#nextBtn:enabled').click();
  await students[0].locator('[data-answer="1"]:enabled').click();
  await teacher.waitForSelector('#retryCoinsBtn');
  await students[0].waitForSelector('.coin-feedback');
  assert.match(await students[0].locator('.coin-feedback').textContent(), /尚未派發/);
  failPayments = false;
  await teacher.locator('#retryCoinsBtn').click();
  await teacher.waitForSelector('.coin-delivery', { state: 'detached' });
  await students[0].waitForFunction(() => document.querySelector('.coin-feedback')?.textContent.includes('+8'));
  assert.match(await students[0].locator('.coin-feedback').textContent(), /已存入寵物樂園/);
  assert.equal(await students[0].locator('#questionText').isVisible(), true);
  assert.equal(await students[0].locator('#questionImage').isVisible(), true);
  assert.ok(await students[0].locator('#answerPad').evaluate(pad => pad.getBoundingClientRect().bottom <= innerHeight + 1));
  await students[0].screenshot({ path: resolve(output, 'student-coins-deposited.png') });
  assert.equal(payments, 2);
  await teacher.locator('#endBtn').click();
  await teacher.waitForSelector('#closeBtn'); await teacher.locator('#closeBtn').click();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ code, checks: ['hub integration', 'projected image and choices', 'three student screens', 'touch answers',
    'real-time counts', 'teacher and student reconnects', 'all-answered reveal', 'bar voter details', 'speed points', 'timeout and non-answers',
    'all-player scoreboards', 'final rankings', 'CSV export', 'student/anonymous authorization',
    'real audio output', 'volume and music controls', 'audio preference persistence', 'question/image review',
    'preserved voter selection', 'bar and podium transitions', 'animated scores', 'reduced motion',
    'custom trophy assets', 'responsive answer targets', 'lobby artwork', 'bounded spark effects',
    'fullscreen pre-question countdown', 'preserved answer duration', 'intro reconnect handling', 'intro cancellation',
    'coin settings and preview isolation', 'large bilingual question images at 100% zoom',
    'student question text, image and choices across viewports'], audio: music, firstScores, output }, null, 2));
} catch (failure) {
  console.error(JSON.stringify({ errors, teacher: await teacher.locator('body').innerText(),
    students: await Promise.all(students.map(page => page.locator('body').innerText())) }, null, 2));
  await teacher.screenshot({ path: resolve(output, 'failure-host.png'), fullPage: true });
  throw failure;
} finally {
  await browser.close();
  await new Promise(resolve => io.close(resolve));
  if (originalRepo) require.cache[repoPath] = originalRepo; else delete require.cache[repoPath];
  if (originalPet) require.cache[petPath] = originalPet; else delete require.cache[petPath];
}
