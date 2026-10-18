import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { chromium, webkit } from 'playwright';

// Isolated transport fixture: exercise the real student client without reading
// school credentials, changing local student data or connecting to production.
const root = resolve(import.meta.dirname, '..');
const output = resolve(process.env.GAME_IPAD_QA_OUT || 'tmp/game-ipad-ui-20261012');
mkdirSync(output, { recursive: true });
const question = {
  question: '觀察圖片中的高山和路線，哪個選項最能解釋登山者應該如何選擇安全路線？請仔細閱讀所有選項。',
  choices: [
    '一直沿着最陡峭的山坡向上爬，遇到濕滑的石頭也不用停下來觀察。',
    '只選擇距離最短的路線，忽略沿途標示和天氣變化，繼續快速前進。',
    '先觀察地形、路線標示及天氣，選擇安全的山徑，遇到危險時停下來重新評估。',
    '跟隨其他人離開指定山徑，不帶地圖和足夠飲用水，以減輕背包重量。',
  ],
  image: '/qa/tall-picture.svg',
};
const app = express();
app.get(['/game/preview', '/game'], (_req, res) => res.sendFile('play.html', { root: resolve(root, 'game-app/public') }));
app.use('/game', express.static(resolve(root, 'game-app/public')));
app.use('/shared', express.static(resolve(root, 'shared')));
app.get('/vendor/phaser/4.2.1/phaser.min.js', (_req, res) => res.sendFile('phaser.min.js', { root: resolve(root, 'node_modules/phaser/dist') }));
app.get('/api/auth/me', (_req, res) => res.json({ student: { id: 'fixture-only', name: 'UI QA' } }));
app.get('/api/game/my-pet', (_req, res) => res.json({ pet: null }));
app.get('/api/game/sessions', (_req, res) => res.json({ sessions: [] }));
app.get('/qa/tall-picture.svg', (_req, res) => setTimeout(() => res.type('svg').send(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1600"><rect width="800" height="1600" fill="#d8efff"/><path d="M0 1400L380 120L800 1400Z" fill="#58a879"/><path d="M380 120L490 460L330 410Z" fill="white"/><path d="M450 1350L250 1050L520 750L370 450" fill="none" stroke="#fff2b4" stroke-width="30"/></svg>'), 650));
const server = createServer(app);
const io = new Server(server);
const room = io.of('/game');
const counts = { answers: 0, questions: 0 };
room.on('connection', socket => {
  socket.on('player:join', (_payload, ack) => ack({ ok: true, phase: 'playing', seed: 20260711,
    durationSec: 480, startedAt: Date.now(), settings: { maxEnergy: 100 }, avatar: { character: 'blue' } }));
  socket.on('player:question', (_payload, ack) => { counts.questions++; setTimeout(() => ack({ ok: true, ...question }), 350); });
  socket.on('player:answer', ({ choice }, ack) => { counts.answers++; setTimeout(() => ack({ ok: true,
    correct: choice === 2, correctChoice: 2, energy: 40, gain: 25, streak: 0 }), 650); });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const chromePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const reports = [];

async function assertFits(page, label) {
  await page.waitForFunction(() => {
    const card = document.querySelector('.q-box').getBoundingClientRect();
    const overlay = document.querySelector('#qOverlay').getBoundingClientRect();
    return Math.abs(overlay.width - visualViewport.width) < 1 && Math.abs(overlay.height - visualViewport.height) < 1
      && card.width > 0 && card.height > 0 && card.bottom <= innerHeight + 1 && card.top >= -1
      && card.left >= -1 && card.right <= innerWidth + 1;
  });
  const report = await page.evaluate(() => {
    const card = document.querySelector('.q-box');
    const overlay = document.querySelector('#qOverlay').getBoundingClientRect();
    const selectors = ['#qText', '#qImage', '.q-choice', '#qFeedback', '#qCooldown', '#qClose'];
    const elements = selectors.flatMap(selector => [...document.querySelectorAll(selector)])
      .filter(element => !element.hidden && getComputedStyle(element).display !== 'none');
    return { scale: Number(getComputedStyle(card).transform.match(/matrix\(([^,]+)/)?.[1] || 1),
      imageLoaded: document.querySelector('#qImage').naturalWidth > 0,
      landscape: card.classList.contains('q-landscape-image'),
      scrollable: getComputedStyle(card).overflowY,
      pageScroll: [scrollX, scrollY], viewportScale: visualViewport.scale,
      clipped: elements.filter(element => {
        const box = element.getBoundingClientRect();
        return box.top < overlay.top - 1 || box.left < overlay.left - 1
          || box.right > overlay.right + 1 || box.bottom > overlay.bottom + 1
          || element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1;
      }).map(element => element.id || element.textContent),
    };
  });
  assert.deepEqual(report.clipped, [], `${label}: all text, images and buttons must fit`);
  assert.equal(report.scrollable, 'visible', `${label}: no scroll area inside the card`);
  assert.deepEqual(report.pageScroll, [0, 0], `${label}: no page scroll`);
  assert.equal(report.viewportScale, 1, `${label}: document remains at its original scale`);
  return { label, ...report };
}

async function guardChecks(page) {
  return page.evaluate(async () => {
    const send = (target, type, changed, active = changed) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, { changedTouches: { value: changed }, touches: { value: active } });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    let id = 0;
    const tap = target => {
      const box = target.getBoundingClientRect();
      const touch = { identifier: ++id, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 };
      send(target, 'touchstart', [touch]);
      return send(target, 'touchend', [touch], []);
    };
    const reset = () => send(document.body, 'touchcancel', [], []);
    const results = [];
    for (const selector of ['#btnJump', '#gameCanvas canvas', '#answerBtn', '#qText', '.q-choice', '#qImage', '#qClose']) {
      // Clone the target so Phaser's own touch cancellation cannot make a
      // missing page-level guard appear to pass the canvas regression.
      const wrapper = document.createElement('div');
      if (selector === '#btnJump') wrapper.className = 'touch-controls';
      if (selector === '#gameCanvas canvas') wrapper.id = 'gameCanvas';
      const target = document.querySelector(selector).cloneNode(true);
      target.style.cssText = 'position:fixed;left:100px;top:100px;width:100px;height:50px';
      wrapper.append(target); document.body.append(wrapper);
      reset();
      const first = tap(target);
      await new Promise(resolve => setTimeout(resolve, 350));
      const second = tap(target);
      const third = tap(target);
      results.push({ selector, first, second, third });
      wrapper.remove();
    }
    reset();
    const target = document.querySelector('#gameCanvas');
    const first = { identifier: ++id, clientX: 100, clientY: 100 };
    const second = { identifier: ++id, clientX: 160, clientY: 100 };
    send(target, 'touchstart', [first]);
    const multiStart = send(target, 'touchstart', [second], [first, second]);
    const multiEnd = send(target, 'touchend', [second], [first]);
    send(target, 'touchend', [first], []);
    const gestures = ['gesturestart', 'gesturechange', 'gestureend', 'dblclick'].map(type => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      target.dispatchEvent(event); return event.defaultPrevented;
    });
    reset();
    // A button can appear at the same location after the first tap.
    const original = document.createElement('button'), replacement = document.createElement('button');
    for (const button of [original, replacement]) {
      button.style.cssText = 'position:fixed;left:200px;top:200px;width:100px;height:50px';
      document.body.append(button);
    }
    let replacementClicks = 0;
    replacement.onclick = () => replacementClicks++;
    tap(original); original.remove();
    const replacementBlocked = tap(replacement);
    replacement.remove();
    return { results, multiStart, multiEnd, gestures, replacementBlocked, replacementClicks };
  });
}

try {
  for (const [engine, type, launch] of [['chromium', chromium, chromePath ? { executablePath: chromePath } : {}], ['webkit', webkit, {}]]) {
    const browser = await type.launch({ headless: true, ...launch });
    try {
      const early = await browser.newContext({ viewport: { width: 1024, height: 640 }, hasTouch: true, isMobile: true });
      const earlyPage = await early.newPage();
      await earlyPage.route('**/game/js/v2/main.js*', route => new Promise(resolve => setTimeout(resolve, 1500)).then(() => route.continue()));
      await earlyPage.goto(`${base}/game`, { waitUntil: 'commit' });
      await earlyPage.waitForSelector('#roomList');
      assert.equal(await earlyPage.evaluate(() => window.BuiGameTouchGuard), true, 'guard runs while the game module is still downloading');
      assert.equal(await earlyPage.evaluate(() => !!window.__game), false);
      const earlyBlocked = await earlyPage.evaluate(() => {
        const event = new Event('gesturestart', { bubbles: true, cancelable: true });
        document.body.dispatchEvent(event); return event.defaultPrevented;
      });
      assert.equal(earlyBlocked, true);
      await early.close();

      for (const [name, width, height] of [['ipad-landscape', 1024, 640], ['ipad-toolbar', 1024, 500],
        ['ipad-air', 1180, 720], ['ipad-split-landscape', 744, 480], ['ipad-portrait', 768, 1024],
        ['phone-landscape', 844, 350], ['phone-portrait', 390, 664]]) {
        const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`${base}/game?autojoin=1&room=qa`);
        await page.waitForFunction(() => window.__game?.scene.getScene('GameScene')?.player);
        // Rapid double jump keeps both pointer actions even when its touchend is refused.
        await page.evaluate(() => {
          const scene = window.__game.scene.getScene('GameScene');
          window.__jumpPresses = 0;
          const original = scene.setAction.bind(scene);
          scene.setAction = (action, value) => { if (action === 'jump' && value) window.__jumpPresses++; original(action, value); };
        });
        await page.locator('#btnJump').tap();
        await page.locator('#btnJump').tap();
        assert.equal(await page.evaluate(() => window.__jumpPresses), 2, 'double tapping jump still queues two jumps');
        if (engine === 'chromium' && name === 'ipad-landscape') {
          const session = await context.newCDPSession(page);
          const right = await page.locator('#btnRight').boundingBox(), jump = await page.locator('#btnJump').boundingBox();
          const point = (box, id) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2, id });
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(right, 1)] });
          assert.equal(await page.evaluate(() => window.__game.scene.getScene('GameScene').actions.right), true);
          await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(right, 1), point(jump, 2)] });
          assert.equal(await page.evaluate(() => window.__jumpPresses), 3, 'holding a direction and adding a second finger still jumps');
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [point(jump, 2)] });
          await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          assert.equal(await page.evaluate(() => window.__game.scene.getScene('GameScene').actions.right), false);
          assert.equal(await page.locator('.tbtn.is-pressed').count(), 0, 'multi-touch releases every held control');
          await session.detach();
        }
        await page.locator('#answerBtn').tap();
        await page.waitForSelector('.q-choice');
        reports.push({ engine, name, ...await assertFits(page, 'image-pending') });
        await page.waitForFunction(() => document.querySelector('#qImage').naturalWidth > 0);
        reports.push({ engine, name, ...await assertFits(page, 'image-loaded') });
        const priorAnswers = counts.answers;
        const choiceBox = await page.locator('.q-choice').first().boundingBox();
        await page.locator('.q-choice').first().tap();
        await page.touchscreen.tap(choiceBox.x + choiceBox.width / 2, choiceBox.y + choiceBox.height / 2);
        await page.waitForSelector('#qClose', { state: 'visible' });
        assert.equal(counts.answers - priorAnswers, 1, 'repeated taps during a delayed answer send only one answer');
        reports.push({ engine, name, ...await assertFits(page, 'wrong-answer-and-continue') });
        await page.screenshot({ path: resolve(output, `${engine}-${name}.png`) });
        if (name === 'ipad-landscape') {
          const guard = await guardChecks(page);
          for (const result of guard.results) {
            assert.equal(result.first, false, `${result.selector}: first tap is preserved`);
            assert.equal(result.second, true, `${result.selector}: second tap at 350ms is blocked`);
            assert.equal(result.third, true, `${result.selector}: triple taps stay blocked`);
          }
          assert.equal(guard.multiStart, true);
          assert.equal(guard.multiEnd, true);
          assert.deepEqual(guard.gestures, [true, true, true, true]);
          assert.equal(guard.replacementBlocked, true);
          assert.equal(guard.replacementClicks, 1);
          await page.evaluate(() => {
            document.querySelector('#qText').textContent += '請閱讀題目中的每一句話，並比較選項中描述的行動。'.repeat(8);
            document.querySelectorAll('.q-choice').forEach((button, i) => button.textContent += (i % 2 ? 'LongUnbrokenChoice'.repeat(15) : '這是一個較長的選項，需要完整顯示所有文字。'.repeat(10)));
            document.querySelector('#qCooldown').hidden = false;
            document.querySelector('#qCooldown').textContent = '連續答錯三次，請等候 5 秒後再答題。';
          });
          reports.push({ engine, name, ...await assertFits(page, 'long-text-and-cooldown') });
          await page.setViewportSize({ width: 768, height: 1024 });
          reports.push({ engine, name, ...await assertFits(page, 'rotated-portrait') });
          await page.setViewportSize({ width: 1024, height: 420 });
          reports.push({ engine, name, ...await assertFits(page, 'toolbar-reduced-height') });
          // Safari can shrink/offset only the visual viewport, without resizing
          // the layout viewport. Exercise that event separately from rotation.
          await page.evaluate(() => {
            window.__qaActualViewport = window.visualViewport;
            Object.defineProperty(window, 'visualViewport', { configurable: true,
              value: { width: 1024, height: 280, offsetLeft: 0, offsetTop: 70, scale: 1 } });
            window.__qaActualViewport.dispatchEvent(new Event('resize'));
          });
          reports.push({ engine, name, ...await assertFits(page, 'visual-viewport-only-change') });
          await page.evaluate(() => {
            Object.defineProperty(window, 'visualViewport', { configurable: true, value: window.__qaActualViewport });
            window.visualViewport.dispatchEvent(new Event('resize'));
          });
          await assertFits(page, 'visual-viewport-restored');
        }
        await page.locator('#qClose').tap();
        await page.waitForSelector('#qOverlay', { state: 'hidden' });
        await page.locator('#answerBtn').tap();
        await page.waitForSelector('.q-choice');
        await page.locator('.q-choice').nth(2).tap();
        await page.waitForSelector('#qOverlay', { state: 'hidden' });
        if (name === 'ipad-landscape') {
          await page.goto(`${base}/game/preview?preview`);
          await page.waitForFunction(() => window.__game?.scene.getScene('GameScene')?.player);
          await page.locator('#answerBtn').tap();
          await page.waitForSelector('.q-choice');
          assert.equal(await page.locator('#qImage').isVisible(), false);
          reports.push({ engine, name, ...await assertFits(page, 'text-only-question') });
          await page.locator('.q-choice').first().tap();
          await page.waitForSelector('#qClose', { state: 'visible' });
          reports.push({ engine, name, ...await assertFits(page, 'text-only-feedback-and-continue') });
          await page.locator('#qClose').tap();
          await page.waitForSelector('#qOverlay', { state: 'hidden' });
        }
        assert.deepEqual(errors, [], `${engine}/${name}: no client errors`);
        await context.close();
      }
    } finally { await browser.close(); }
  }
  writeFileSync(resolve(output, 'report.json'), JSON.stringify({ reports, counts }, null, 2));
  console.log(JSON.stringify({ passed: reports.length, engines: ['chromium', 'webkit'], output,
    checks: 'early loading, double/triple taps, multi-touch controls, double jump, delayed images/answers, all text/continue, long text, text-only questions, rotation, visual viewport/toolbar height and correct-answer close' }, null, 2));
} finally {
  await new Promise(resolve => io.close(resolve));
  await new Promise(resolve => server.close(resolve));
}
