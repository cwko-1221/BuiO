import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

process.env.NODE_ENV = 'development';
const require = createRequire(import.meta.url);
const configPath = require.resolve('../config');
const config = require(configPath);
require.cache[configPath].exports = { ...config, db: { mode: 'json' } };
const memory = { users: [] };
let saves = 0, payments = 0, loseFirstReply = true;
const storePath = require.resolve('../db/jsonStore');
require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { load: () => memory, save: () => { saves++; } } };
const pets = require('../pet-app/repositories/pet.repo');
const originalGrant = pets.grantCoins;
pets.grantCoins = async (...args) => {
  payments++;
  const response = await originalGrant(...args);
  if (loseFirstReply) { loseFirstReply = false; throw Object.assign(new Error('Reply lost after commit'), { code: 'TEST_REPLY_LOST' }); }
  return response;
};
const demo = require('../game-app/lib/demoSet');
const express = require('express'), { Server } = require('socket.io');
const app = express();
function session(req, _res, next) {
  req.session = { studentId: req.headers['x-test-id'], role: req.headers['x-test-role'] };
  next();
}
app.use(session);
app.get('/fixture', (_req, res) => res.send('<script src="/socket.io/socket.io.js"></script>'));
app.get('/wallet', (req, res) => res.json({ balance: memory.petWallets?.find(wallet => wallet.studentId === req.session.studentId)?.balance || 0 }));
const http = createServer(app), io = new Server(http);
io.engine.use(session);
require('../quiz-app/server/socket')(io, app);
await new Promise(resolve => http.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${http.address().port}`;
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const errors = [];
async function connect(page, preview = false) {
  await page.goto(`${base}/fixture`);
  await page.evaluate(preview => {
    window.latest = null;
    window.quiz = io('/quiz', { auth: { preview } });
    window.quiz.on('quiz:state', state => { window.latest = state; });
  }, preview);
  await page.waitForFunction(() => window.quiz.connected);
}
async function player(id, role, preview = false) {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-test-id': id, 'x-test-role': role } });
  const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
  await connect(page, preview); return page;
}
const rpc = (page, event, data = {}) => page.evaluate(({ event, data }) => new Promise(resolve => window.quiz.emit(event, data, resolve)), { event, data });
const phase = (page, value) => page.waitForFunction(phase => window.latest?.phase === phase, value);
const balance = page => page.evaluate(async () => (await (await fetch('/wallet')).json()).balance);
async function begin(host) {
  assert.equal((await rpc(host, 'host:next')).ok, true);
  await host.waitForFunction(() => window.latest?.phase === 'question' && Date.now() >= window.latest.opensAt + 10);
  return host.evaluate(() => window.latest.roundId);
}
async function finish(host) { assert.equal((await rpc(host, 'host:end')).ok, true); assert.equal((await rpc(host, 'host:close')).ok, true); }
try {
  const host = await player('T001', 'teacher'), first = await player('S001', 'student'), second = await player('S002', 'student'), observer = await player('T002', 'teacher');
  for (const coinsPerCorrect of [0, -1, 1.5, 1001, '25']) assert.equal((await rpc(host, 'host:create', { coinRewardEnabled: true, coinsPerCorrect })).ok, false);
  assert.equal((await rpc(first, 'host:create', { coinRewardEnabled: true, coinsPerCorrect: 25 })).ok, false);
  const room = await rpc(host, 'host:create', { setId: demo.id, seconds: 5, limit: 2, coinRewardEnabled: true, coinsPerCorrect: 25 });
  assert.equal(room.ok, true);
  for (const page of [first, second, observer]) assert.equal((await rpc(page, 'player:join', { code: room.code, name: 'Fixture' })).ok, true);
  const roundId = await begin(host), correct = demo.questions[0].correctIndex;
  await rpc(first, 'player:answer', { roundId, choice: correct, amount: 10000, studentId: 'S002' });
  assert.equal(await balance(first), 0, 'no correctness or wallet reward leaks before reveal');
  assert.equal(await first.evaluate(() => window.latest.me.coinReward), undefined);
  await rpc(second, 'player:answer', { roundId, choice: (correct + 1) % 4 });
  await rpc(observer, 'player:answer', { roundId, choice: correct });
  await phase(host, 'results');
  await host.waitForFunction(() => window.latest.coinDelivery.failed === 1);
  assert.equal(await balance(first), 25, 'the actual pet wallet is credited');
  assert.equal(await balance(second), 0, 'wrong answers do not earn coins');
  assert.equal(await balance(observer), 0, 'teacher accounts cannot farm student rewards');
  assert.equal((await rpc(first, 'host:retryRewards')).ok, false);
  assert.equal((await rpc(first, 'player:answer', { roundId, choice: correct })).ok, false);
  await rpc(host, 'host:reveal');
  assert.equal(payments, 1);
  await rpc(host, 'host:leaderboard');
  assert.equal((await rpc(host, 'host:next')).ok, false, 'unsettled payments cannot be silently skipped');
  assert.equal((await rpc(host, 'host:close')).ok, false);
  await rpc(host, 'host:retryRewards');
  await host.waitForFunction(() => window.latest.coinDelivery.failed === 0 && window.latest.coinDelivery.pending === 0);
  assert.equal(await balance(first), 25, 'retry after a committed but lost reply never pays twice');
  assert.equal(memory.petCurrencyLedger.length, 1);
  assert.match(memory.petCurrencyLedger[0].note, /第 1 題/);
  assert.match(memory.petCurrencyLedger[0].metadata.idempotencyKey, /^quiz:/);
  await connect(first);
  await rpc(first, 'player:join', { code: room.code, name: 'Reconnected' });
  assert.equal(await balance(first), 25);
  await begin(host);
  await finish(host);
  assert.equal(await balance(first), 25, 'unanswered questions do not earn coins');

  const disabled = await rpc(host, 'host:create', { setId: demo.id, seconds: 5, limit: 1 });
  await rpc(first, 'player:join', { code: disabled.code, name: 'Disabled' });
  const disabledRound = await begin(host);
  await rpc(first, 'player:answer', { roundId: disabledRound, choice: correct });
  await phase(host, 'results'); await finish(host);
  assert.equal(await balance(first), 25, 'disabled rewards never change the wallet');

  const previewHost = await player('T001', 'teacher', true);
  const preview = await rpc(previewHost, 'host:create', { setId: demo.id, seconds: 5, limit: 1, coinRewardEnabled: true, coinsPerCorrect: 500 });
  await rpc(first, 'player:join', { code: preview.code, name: 'Preview' });
  const beforePreview = saves, previewRound = await begin(previewHost);
  await rpc(first, 'player:answer', { roundId: previewRound, choice: correct });
  await phase(first, 'results');
  assert.deepEqual(await first.evaluate(() => window.latest.me.coinReward), { amount: 500, status: 'preview' });
  assert.equal(await balance(first), 25); assert.equal(saves, beforePreview);
  await finish(previewHost);
  assert.equal(payments, 2); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: ['real pet wallet', 'correct answers only', 'teacher authorization', 'server-owned amount and identity',
    'lost-reply retry', 'duplicate answer and reveal', 'reconnect', 'disabled rewards', 'preview isolation', 'unanswered questions'], balance: await balance(first), ledgerEntries: memory.petCurrencyLedger.length }));
} finally {
  await browser.close(); await new Promise(resolve => io.close(resolve));
}
