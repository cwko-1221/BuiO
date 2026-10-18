import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';
const root = path.resolve(import.meta.dirname, '..'), temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-game-latency-'));
const output = path.join(root, 'tmp/game-latency'), dbFile = path.join(temp, 'db.json');
await fs.mkdir(output, { recursive: true });
await fs.writeFile(dbFile, JSON.stringify({ users: [{ studentid: 'QA', name: 'Latency QA', passwordhash: bcrypt.hashSync('test', 4), role: 'student', classname: 'QA', language: 'zh-HK' }], studentStats: [], questionLogs: [], _logId: 0 }));
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(port), SUPABASE_DB_URL: '', BUIO_JSON_DB_FILE: dbFile, MOCK_AUTH: '0', NODE_ENV: 'development' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '', browser, host;
child.stdout.on('data', d => logs += d);
child.stderr.on('data', d => logs += d);
const base = `http://127.0.0.1:${port}`, wait = ms => new Promise(r => setTimeout(r, ms));
const require = createRequire(path.join(root, 'whiteboard-app/client/package.json')), { io } = require('socket.io-client');
const emit = (s, event, ...args) => new Promise((resolve, reject) => s.timeout(6000).emit(event, ...args, (err, res) => err ? reject(err) : resolve(res)));
const checks = [];
try {
    for (let i = 0;; i++) {
        try {
            if ((await fetch(base + '/health')).ok)
                break;
        }
        catch { }
        if (i > 200)
            throw new Error(logs);
        await wait(100);
    }
    host = io(base + '/game', { transports: ['websocket'] });
    await new Promise((r, j) => { host.once('connect', r); host.once('connect_error', j); });
    const room = await emit(host, 'host:create', { setId: 'demo', durationSec: 480, hostName: 'QA' });
    assert.equal(room.ok, true);
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1024, height: 768 }, hasTouch: true });
    assert.equal((await ctx.request.post(base + '/api/auth/login', { data: { studentId: 'QA', password: 'test' } })).status(), 200);
    await ctx.addInitScript(() => {
        let current;
        window.__sockets = [];
        window.__replies = [];
        Object.defineProperty(window, 'io', { configurable: true, get: () => current, set: fn => {
                current = Object.assign(function (...args) {
                    const s = fn(...args), emit = s.emit, onack = s.onack, events = new Map();
                    s.emit = function (event, ...values) { if (typeof values.at(-1) === 'function')
                        events.set(this.ids, event); return emit.call(this, event, ...values); };
                    s.onack = function (packet) {
                        const event = events.get(packet.id);
                        if (event === 'player:question' && window.__dropQuestion || event === 'player:answer' && window.__dropAnswer)
                            return;
                        if (event === 'player:question' || event === 'player:answer')
                            window.__replies.push({ event, result: packet.data[0] });
                        return onack.call(this, packet);
                    };
                    window.__sockets.push(s);
                    return s;
                }, fn);
            } });
    });
    const p = await ctx.newPage(), errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(`${base}/game?autojoin=1&room=${room.code}`);
    await p.locator('#lobbyScreen.active').waitFor();
    await emit(host, 'host:start');
    await p.waitForFunction(() => window.__game?.scene.getScene('GameScene')?.player?.anims.currentAnim);
    await p.evaluate(() => window.__dropQuestion = true);
    await p.locator('#answerBtn').click();
    await p.locator('#qChoices button').filter({ hasText: '再試一次' }).waitFor({ timeout: 9000 });
    assert.equal(await p.locator('#qClose').isVisible(), true);
    await p.screenshot({ path: path.join(output, 'question-retry.png') });
    await p.evaluate(() => window.__dropQuestion = false);
    await p.locator('#qChoices button').click();
    await p.waitForFunction(() => document.querySelectorAll('#qChoices .q-choice').length === 4);
    const question = await p.evaluate(() => window.__replies.filter(x => x.event === 'player:question').at(-1).result);
    // Drop only the incoming ack. The real client timeout and the real server
    // commit still run; replacing the callback would hide the timeout itself.
    await p.evaluate(() => window.__dropAnswer = true);
    await p.locator('#qChoices .q-choice').first().click();
    await p.locator('#qChoices button').filter({ hasText: '再試一次' }).waitFor({ timeout: 9000 });
    await p.screenshot({ path: path.join(output, 'answer-retry.png') });
    await p.evaluate(() => window.__dropAnswer = false);
    await p.locator('#qChoices button').click();
    await p.waitForFunction(() => window.__replies.some(x => x.event === 'player:answer'));
    const answer = await p.evaluate(() => window.__replies.filter(x => x.event === 'player:answer').at(-1).result);
    assert.equal(answer.questionId, question.questionId);
    const again = await p.evaluate(payload => new Promise(resolve => window.__sockets[0].emit('player:answer', payload, resolve)), { questionId: question.questionId, choice: 0 });
    assert.equal(again.correct, answer.correct);
    assert.equal(again.gain, answer.gain);
    assert.equal(again.wrongStreak, answer.wrongStreak);
    if (await p.locator('#qClose').isVisible())
        await p.locator('#qClose').click();
    else
        await p.locator('#qOverlay').waitFor({ state: 'hidden' });
    const gameId = await p.evaluate(() => { window.__originalGame = window.__game; const s = window.__sockets[0]; s.disconnect(); setTimeout(() => s.connect(), 200); return true; });
    assert.equal(gameId, true);
    await p.waitForFunction(() => window.__sockets[0].connected);
    await wait(600);
    assert.equal(await p.evaluate(() => window.__game === window.__originalGame), true, 'rejoin keeps the loaded scene');
    assert.doesNotMatch(await p.locator('#timerPill').innerText(), /NaN/, 'rejoin preserves the round clock');
    const prior = await p.evaluate(() => window.__game.scene.getScene('GameScene').player.x);
    await p.keyboard.down('KeyD');
    await p.waitForFunction(x => window.__game.scene.getScene('GameScene').player.x > x + 15, prior);
    await p.keyboard.up('KeyD');
    checks.push('lost question/answer acknowledgements recover; answer receipt is idempotent; reconnect resumes movement without reloading');
    // A failed essential image must offer scene retry, not create an incomplete map.
    const broken = await ctx.newPage();
    let blocked = true;
    await broken.route('**/sky-panorama.webp', route => blocked ? route.abort() : route.continue());
    await broken.goto(base + '/game/preview?preview');
    await broken.locator('.buio-loading-panel button').waitFor({ timeout: 35000 });
    assert.equal(await broken.evaluate(() => !!window.__game.scene.getScene('GameScene').player), false);
    const loader = await broken.evaluate(() => { const l = window.__game.scene.getScene('GameScene').load; return { parallel: l.maxParallelDownloads, timeout: l.xhr.timeout }; });
    assert.deepEqual(loader, { parallel: 4, timeout: 15000 });
    await broken.screenshot({ path: path.join(output, 'asset-retry.png') });
    blocked = false;
    await broken.locator('.buio-loading-panel button').click();
    await broken.waitForFunction(() => window.__game?.scene.getScene('GameScene')?.player?.anims.currentAnim);
    await wait(500);
    await broken.screenshot({ path: path.join(output, 'asset-recovered.png') });
    checks.push('essential asset failure stops safely and retries only the scene; bounded 4-download/15-second loader');
    const ended = new Promise(resolve => host.once('game:over', resolve));
    host.emit('host:end');
    const result = await ended;
    assert.equal(result.leaderboard.find(x => x.studentId === 'QA').correct + result.leaderboard.find(x => x.studentId === 'QA').wrong, 1, 'answer retry awards once');
    await p.evaluate(() => { window.__sockets[0].disconnect(); setTimeout(() => window.__sockets[0].connect(), 100); });
    await p.locator('#joinScreen.active').waitFor();
    assert.ok(await p.locator('#joinError').innerText());
    checks.push('rejoining an ended room returns to room selection instead of leaving a frozen scene');
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ checks, loader, errors }, null, 2));
    console.log(JSON.stringify({ passed: true, checks, loader, errors, output }));
}
finally {
    host?.disconnect();
    await browser?.close();
    child.kill();
    await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve));
    await fs.rm(temp, { recursive: true, force: true });
}
