import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-rank-live-'));
const dbFile = path.join(temp, 'db.json'), out = path.resolve(process.env.PET_BRAWL_RANK_OUT || 'artifacts/pet-playtest/brawl-ranking');
await fs.mkdir(out, { recursive: true });
const users = [
  ['S001', '小晴', 'P5', 1, 9, 14, 20], ['S002', '阿樂', 'P6', 1, 4, 9, 13], ['S003', '小星', 'P4', 2, 3, 18, 26],
  ['S004', '月兒', 'P6', 4, 5, 80, 100], ['S005', '小峰', 'P5', 3, 15, 50, 70], ['S006', '新同學', 'P4', 0, 0, 0, 0],
];
await fs.writeFile(dbFile, JSON.stringify({ users: users.map(([id, name, className]) => ({ studentid: id, name, role: 'student', classname: className, language: id === 'S003' ? 'en-US' : 'zh-HK', passwordhash: bcrypt.hashSync('test', 4) })).concat({ studentid: 'T001', name: '陳老師', role: 'teacher', language: 'zh-HK', passwordhash: bcrypt.hashSync('test', 4) }), studentStats: [], questionLogs: [], _logId: 0 }));
process.env.BUIO_JSON_DB_FILE = dbFile; process.env.SUPABASE_DB_URL = '';
const require = createRequire(import.meta.url), pets = require('../pet-app/repositories/pet.repo'), rank = require('../pet-app/repositories/brawl-ranking.repo'), rules = require('../pet-app/lib/brawl-ranking.cjs'), store = require('../db/jsonStore');
for (const [id] of users) await pets.ensureStudent(id); await rank.ensure();
const fixture = store.load();
for (const [id, , , tier, tierWins, wins, games] of users) {
  const petId = randomUUID(); fixture.petInstances.push({ petId, studentId: id, speciesId: id === 'S002' ? 'pudding-pig' : 'starpatch-cat', xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '', equippedSkills: [], equippedWearables: [] });
  Object.assign(fixture.petProfiles.find(p => p.studentId === id), { activePetId: petId, starterEggClaimed: true });
  fixture.petWallets.find(w => w.studentId === id).balance = 5000;
  Object.assign(rank.jsonProfiles([id])[0], { tier, tierWins, wins, games, losses: games - wins, rewardDay: tier ? rules.hkDay(Date.now() - 86400000) : '', rewardPaid: rules.TIERS[tier].dailyCoins });
}
store.save();
const port = await new Promise(resolve => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const baseURL = `http://127.0.0.1:${port}`, checks = [], errors = [], pages = [];
let server, browser, logs = '';
let expectLockedResponses = false;
const pass = label => { checks.push(label); console.log('✓ ' + label); };
const data = async () => JSON.parse(await fs.readFile(dbFile, 'utf8'));
const balances = async () => Object.fromEntries((await data()).petWallets.map(w => [w.studentId, w.balance]));
const board = async context => (await context.request.get('/api/pet/brawl/ranking')).json();
const shot = (page, name) => page.screenshot({ path: path.join(out, name + '.png') });
const playReady = async page => page.waitForFunction(() => { const s = window.__petGame?.scene.keys.Brawl; return s?.sys.isActive() && s.fx && !document.querySelector('.brawl-loading') && !document.querySelector('.pvp-wait'); }, {}, { timeout: 25000 });
try {
  server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env: { ...process.env, PORT: String(port), MOCK_AUTH: '0', NODE_ENV: 'development', PET_APP_DIST_DIR: process.env.PET_APP_DIST_DIR || path.resolve('pet-app/dist'), SESSION_SECRET: 'isolated-ranked-browser-test' }, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', d => logs += d); server.stderr.on('data', d => logs += d);
  const deadline = Date.now() + 20000; while (true) { try { if ((await fetch(baseURL + '/health')).ok) break; } catch {} if (Date.now() > deadline) throw new Error('Server startup timed out'); await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const anon = await browser.newContext({ baseURL }); assert.equal((await anon.request.get('/api/pet/brawl/ranking')).status(), 401);
  const teacher = await browser.newContext({ baseURL }); await teacher.request.post('/api/auth/login', { data: { studentId: 'T001', password: 'test' } });
  assert.equal((await teacher.request.get('/api/pet/brawl/ranking')).status(), 403);
  const contexts = [];
  for (const [i, id] of ['S001', 'S002', 'S003'].entries()) {
    const context = await browser.newContext({ baseURL, viewport: i === 1 ? { width: 1024, height: 768 } : { width: 1194, height: 834 }, hasTouch: true }); contexts.push(context);
    assert.equal((await context.request.post('/api/auth/login', { data: { studentId: id, password: 'test' } })).status(), 200);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('net::ERR_FAILED') && !(expectLockedResponses && message.text().includes('423 (Locked)'))) errors.push(message.text()); });
    pages.push(page); await page.goto('/pet'); await page.locator('[data-tab="brawl"]').waitFor();
  }
  const [a, b, c] = pages, [ac, bc, cc] = contexts;
  assert.deepEqual(await balances(), { S001: 5100, S002: 5100, S003: 5300, S004: 6000, S005: 5500, S006: 5000 });
  const dailyLedger = (await data()).petCurrencyLedger.filter(l => l.kind === 'brawl_rank_daily'); assert.equal(dailyLedger.length, 5);
  await Promise.all([board(ac), board(ac), ac.request.get('/api/pet/bootstrap')]);
  assert.equal((await data()).petCurrencyLedger.filter(l => l.kind === 'brawl_rank_daily').length, 5);
  const first = await board(ac); assert.deepEqual(first.leaderboard.map(p => p.tierId), ['diamond', 'gold', 'silver', 'bronze', 'bronze', 'unranked']);
  assert.equal(first.self.winRate, 70); assert.equal(first.self.games, 20);
  pass('student-only school rankings include all five tiers; startup pays online and offline students 100/300/500/1000 exactly once');

  await a.locator('[data-tab="brawl"]').click(); await a.locator('.brawl-mode-tabs [data-brawl="mode"][data-id="ranked"]').click();
  await a.locator('[data-brawl="invite"][data-target="S002"]:enabled').waitFor();
  assert.equal(await a.locator('[data-brawl="invite"][data-target="S003"]').isDisabled(), true);
  assert.match(await a.locator('.rank-progress-head').innerText(), /再勝 1 場/);
  assert.match(await a.locator('.rank-stats').innerText(), /70%/);
  assert.match(await a.locator('.rank-benefit').innerText(), /今日已自動入帳/);
  await a.locator('.rank-summary').screenshot({ path: path.join(out, '01-bronze-progress-ipad.png') });
  await a.locator('.pvp-panel').scrollIntoViewIfNeeded(); await shot(a, '02-ranked-opponents-ipad');
  for (const target of ['S002', 'S003']) { const box = await a.locator(`[data-brawl="invite"][data-target="${target}"]`).boundingBox(); assert.ok(box.height >= 56); }
  await a.locator('.brawl-mode-tabs [data-brawl="mode"][data-id="pvp"]').click();
  await a.locator('[data-brawl="invite"][data-target="S003"]:enabled').waitFor();
  await a.locator('.brawl-mode-tabs [data-brawl="mode"][data-id="ranked"]').click();
  await a.locator('[data-brawl="invite"][data-target="S002"]:enabled').waitFor();
  await a.locator('[data-brawl="invite"][data-target="S002"]').click();
  await b.locator('[data-duel-action="accept"]').waitFor();
  assert.match(await b.locator('#duelInviteTitle').innerText(), /排名對戰/);
  assert.match(await b.locator('.pvp-invite-card').innerText(), /正式計入排名/);
  await shot(b, '03-ranked-invitation-ipad');
  const before = await balances(); await b.locator('[data-duel-action="reject"]').click();
  await a.locator('.pvp-invite-card').waitFor({ state: 'detached' }); assert.deepEqual(await balances(), before);
  assert.equal((await board(ac)).self.games, 20);
  pass('same-tier ranked opponents only, free mode still permits other tiers, large iPad buttons and explicit ranked invitations; declining changes neither coins nor matches');

  await a.waitForTimeout(3100); await a.locator('[data-brawl="invite"][data-target="S002"]:enabled').click();
  await b.locator('[data-duel-action="accept"]').click(); await Promise.all([a, b].map(playReady));
  assert.equal(await a.locator('#brawlWave').innerText(), '排名對戰 · 銅');
  assert.deepEqual(await balances(), { ...before, S001: 4600, S002: 4600 });
  await shot(a, '04-ranked-battle-ipad');
  await b.locator('[data-brawl="pause"]').click(); await b.locator('[data-brawl="pvp-leave"]').click();
  await a.locator('.rank-result').waitFor(); assert.match(await a.locator('.rank-result').innerText(), /晉級成功/);
  assert.match(await a.locator('.rank-result').innerText(), /\+200/); assert.match(await a.locator('.rank-result').innerText(), /銀/);
  await a.waitForFunction(() => document.querySelector('#coinBalance')?.textContent?.includes('4,800'));
  assert.deepEqual(await balances(), { ...before, S001: 4800, S002: 4600 });
  const promoted = await board(ac); assert.equal(promoted.self.tierId, 'silver'); assert.equal(promoted.self.tierWins, 0); assert.equal(promoted.self.games, 21); assert.equal(promoted.self.winRate, 71.4);
  assert.equal((await board(bc)).self.tierWins, 4); assert.equal((await board(bc)).self.games, 14);
  await shot(a, '05-promotion-and-daily-topup-ipad');
  await a.reload(); await a.locator('[data-tab="brawl"]').click(); await a.locator('.brawl-mode-tabs [data-brawl="mode"][data-id="leaderboard"]').click();
  await a.locator('.rank-table').waitFor(); await a.locator('.rank-board').scrollIntoViewIfNeeded();
  assert.match(await a.locator('[data-rank-student="S001"]').innerText(), /71\.4%/); assert.match(await a.locator('[data-rank-student="S001"]').innerText(), /21/);
  assert.equal((await board(ac)).self.games, 21); assert.deepEqual(await balances(), { ...before, S001: 4800, S002: 4600 });
  await shot(a, '06-school-leaderboard-ipad-landscape');
  pass('real ranked surrender settles one win/loss, Bronze tenth win promotes to Silver, adds only 200 coins, and reload preserves ranks, games and win rate');

  for (const [name, width, height] of [['ipad-portrait', 834, 1194], ['mobile', 390, 844]]) {
    await a.setViewportSize({ width, height }); await a.locator('.rank-board').scrollIntoViewIfNeeded();
    assert.equal(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await a.locator('.rank-self').isVisible(), true);
    const box = await a.locator('.rank-board-head button').boundingBox(); assert.ok(box.height >= 56);
    await shot(a, '07-school-leaderboard-' + name);
  }
  await c.locator('[data-tab="brawl"]').click(); await c.locator('.brawl-mode-tabs [data-brawl="mode"][data-id="leaderboard"]').click();
  assert.match(await c.locator('.rank-board h2').innerText(), /School leaderboard/); assert.match(await c.locator('.rank-summary').innerText(), /Silver/);
  pass('school leaderboard is usable on iPad portrait and mobile with large controls, horizontal table scroll and English labels');

  // A teacher lock must refund a paid ranked duel without awarding a win.
  await a.setViewportSize({ width: 1194, height: 834 });
  await a.locator('.brawl-mode-tabs [data-brawl="mode"][data-id="ranked"]').click();
  await a.locator('[data-brawl="invite"][data-target="S003"]:enabled').click();
  await c.locator('[data-duel-action="accept"]').click(); await Promise.all([a, c].map(playReady));
  const paid = await balances(), games = (await board(ac)).self.games;
  expectLockedResponses = true;
  assert.equal((await teacher.request.post('/api/pet/teacher/access', { data: { action: 'lock', classes: ['P5'], note: '上課時間' } })).status(), 200);
  await a.locator('.pet-access-overlay:not([hidden])').waitFor();
  await c.locator('.brawl-modal').filter({ hasText: 'refunded' }).waitFor();
  assert.deepEqual(await balances(), { ...paid, S001: paid.S001 + 500, S003: paid.S003 + 500 });
  assert.equal((await data()).petBrawlRanks.find(p => p.studentId === 'S001').games, games);
  await teacher.request.post('/api/pet/teacher/access', { data: { action: 'unlock', classes: ['P5'] } });
  await a.locator('.pet-access-overlay:not([hidden])').waitFor({ state: 'detached' });
  pass('teacher access locks cancel and refund started ranked matches without counting a match or changing promotion progress');
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(out, 'browser-report.json'), JSON.stringify({ passed: true, checks, errors }, null, 2) + '\n');
} catch (error) {
  for (const [i, page] of pages.entries()) await shot(page, 'failure-' + i).catch(() => {});
  await fs.writeFile(path.join(out, 'browser-report.json'), JSON.stringify({ passed: false, checks, error: error.stack, logs, errors }, null, 2) + '\n'); throw error;
} finally {
  await browser?.close();
  if (server && server.exitCode === null) { const ended = new Promise(resolve => server.once('exit', resolve)); server.kill(); await ended; }
  await fs.rm(temp, { recursive: true, force: true });
}
