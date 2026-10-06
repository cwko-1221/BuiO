import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { VERSION } from '../pet-app/lib/brawl/catalog.mjs';

const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-ranking-'));
process.env.BUIO_JSON_DB_FILE = path.join(temp, 'db.json'); process.env.SUPABASE_DB_URL = '';
await fs.writeFile(process.env.BUIO_JSON_DB_FILE, JSON.stringify({ users: [1, 2, 3, 4].map(n => ({ studentid: `S00${n}`, name: `同學${n}`, classname: n === 4 ? 'Graduated' : 'P5', role: 'student' })).concat({ studentid: 'T001', name: '老師', role: 'teacher' }), studentStats: [], questionLogs: [], _logId: 0 }));
const require = createRequire(import.meta.url), pets = require('../pet-app/repositories/pet.repo'), duels = require('../pet-app/repositories/brawl-duel.repo'), rank = require('../pet-app/repositories/brawl-ranking.repo'), rules = require('../pet-app/lib/brawl-ranking.cjs'), store = require('../db/jsonStore');
const { Server } = require('socket.io'), { io: client } = createRequire(path.resolve('whiteboard-app/client/package.json'))('socket.io-client');
const checks = [], pass = label => { checks.push(label); console.log('✓ ' + label); };
const ids = ['S001', 'S002', 'S003', 'S004'], petIds = ids.map(() => randomUUID()), sockets = [];
let server, io, service;
for (const [i, id] of ids.entries()) {
  await pets.ensureStudent(id); const d = store.load();
  d.petWallets.find(w => w.studentId === id).balance = 100000;
  d.petInstances.push({ studentId: id, petId: petIds[i], speciesId: 'starpatch-cat', xp: 0, stage: 1 });
}
store.save(); await rank.ensure();
const d = store.load(), balances = () => ids.map(id => d.petWallets.find(w => w.studentId === id).balance);
const state = id => d.petBrawlRanks.find(p => p.studentId === id);
const meta = (mode = 'ranked', pair = [0, 1]) => ({ id: randomUUID(), inviteId: randomUUID(), mode, version: VERSION, stageId: 'sunny-training', seed: 42, players: pair.map(i => ({ id: ids[i], name: `同學${i + 1}`, petId: petIds[i], fighterId: 'starpatch-cat' })) });
const play = async (winnerIndex = 0, mode = 'ranked') => { const match = await duels.charge(meta(mode)); await duels.finalize(match.id, { status: 'playing' }); return duels.finalize(match.id, { status: 'finished', winnerIndex, reason: 'battle_complete' }); };
try {
  for (let i = 0; i < 4; i++) await play();
  assert.equal(state('S001').tierWins, 4); assert.equal(state('S002').games, 4);
  const before = balances(), ledgerCount = d.petCurrencyLedger.length, old = structuredClone(d.petBrawlRanks);
  const match = await duels.charge(meta()); await duels.finalize(match.id, { status: 'playing' });
  const paid = balances(), save = store.save;
  store.save = () => { throw new Error('disk failure'); };
  await assert.rejects(duels.finalize(match.id, { status: 'finished', winnerIndex: 0 }), /disk failure/);
  store.save = save;
  assert.deepEqual(balances(), paid); assert.deepEqual(d.petBrawlRanks, old); assert.equal(d.petCurrencyLedger.length, ledgerCount + 2);
  const finished = await duels.finalize(match.id, { status: 'finished', winnerIndex: 0 });
  assert.equal(state('S001').tier, 1); assert.equal(state('S001').tierWins, 0); assert.equal(state('S001').wins, 5);
  assert.equal(finished.rankResults[0].promoted, true); assert.equal(finished.rankResults[0].promotionCoins, 100);
  assert.deepEqual(balances(), before.map((value, i) => i === 0 ? value - 400 : i === 1 ? value - 500 : value));
  await Promise.all([duels.finalize(match.id, { status: 'finished', winnerIndex: 0 }), rank.distribute(), rank.distribute()]);
  assert.equal(state('S001').wins, 5); assert.equal(d.petCurrencyLedger.filter(l => l.kind === 'brawl_rank_daily' && l.studentId === 'S001').length, 1);
  pass('fifth unranked win promotes to Bronze and pays 100 exactly once; failed persistence rolls back ranks, wallets and ledger');

  const snapshot = balances();
  await assert.rejects(duels.charge(meta()), /相同級別/); assert.deepEqual(balances(), snapshot);
  const ranksBefore = structuredClone(d.petBrawlRanks); await play(0, 'friendly'); assert.deepEqual(d.petBrawlRanks, ranksBefore);
  const second = state('S002'); Object.assign(second, { tier: 1, wins: 5, games: 10, tierWins: 0, rewardDay: rules.hkDay(), rewardPaid: 100 });
  Object.assign(state('S001'), { tierWins: 9, wins: 14, games: 14 }); store.save();
  const silver = await play(); assert.equal(state('S001').tier, 2); assert.equal(silver.rankResults[0].promotionCoins, 200);
  Object.assign(second, { tier: 2, rewardPaid: 300 }); Object.assign(state('S001'), { tierWins: 19, wins: 34, games: 34 }); store.save();
  const gold = await play(); assert.equal(state('S001').tier, 3); assert.equal(gold.rankResults[0].promotionCoins, 200);
  Object.assign(second, { tier: 3, rewardPaid: 500 }); Object.assign(state('S001'), { tierWins: 39, wins: 74, games: 74 }); store.save();
  const diamond = await play(); assert.equal(state('S001').tier, 4); assert.equal(diamond.rankResults[0].promotionCoins, 500);
  assert.equal(d.petCurrencyLedger.filter(l => l.kind === 'brawl_rank_daily' && l.studentId === 'S001').reduce((sum, l) => sum + l.delta, 0), 1000);
  pass('cross-tier charge is rejected; free duels never change ranking; Silver, Gold and Diamond promotions top up the current day to 300/500/1000');

  Object.assign(second, { tier: 4, rewardPaid: 1000 }); store.save();
  await play(null); assert.equal(state('S001').draws, 1); assert.equal(state('S001').games, 76); assert.equal(state('S001').wins, 75);
  const beforeCancel = structuredClone(d.petBrawlRanks), cancelled = await duels.charge(meta());
  await duels.finalize(cancelled.id, { status: 'cancelled', reason: 'preparation_error' }, true); assert.deepEqual(d.petBrawlRanks, beforeCancel);
  const restart = await duels.charge(meta()); await duels.finalize(restart.id, { status: 'playing' }); await duels.recover(); assert.deepEqual(d.petBrawlRanks, beforeCancel);
  pass('draws count toward played matches and win rate; refunds and interrupted server restarts never add matches or wins');

  const rewardAt = Date.now() + 3 * 86400000;
  const third = rank.jsonProfiles(['S003'])[0]; Object.assign(third, { tier: 2, rewardDay: rules.hkDay(), rewardPaid: 300, wins: 15, games: 20 });
  const graduate = rank.jsonProfiles(['S004'])[0]; Object.assign(graduate, { tier: 4, rewardDay: rules.hkDay(rewardAt - 2 * 86400000), rewardPaid: 1000 }); store.save();
  const offline = balances();
  assert.equal(await rank.distribute(rewardAt), 6900); assert.equal(await rank.distribute(rewardAt), 0);
  assert.deepEqual(balances(), offline.map((v, i) => v + [3000, 3000, 900, 0][i]));
  const board = await rank.overview('S001'); assert.deepEqual(board.leaderboard.map(p => p.studentId), ['S001', 'S002', 'S003']);
  assert.equal(board.self.winRate, 98.7); assert.equal(board.leaderboard[2].winRate, 75); assert.equal(board.leaderboard[2].games, 20);
  const persisted = spawnSync(process.execPath, ['-e', "require('./pet-app/repositories/brawl-ranking.repo').profiles(['S001']).then(r=>process.stdout.write(JSON.stringify(r[0])))"], { cwd: path.resolve('.'), env: process.env, encoding: 'utf8' });
  assert.equal(persisted.status, 0, persisted.stderr); assert.deepEqual(JSON.parse(persisted.stdout), state('S001'));
  pass('offline days are automatically credited once, graduated students are excluded, and the school table orders ranks with correct games and win rates');

  // Fresh unranked and Bronze profiles for the real invite/accept protocol.
  for (const [id, tier] of [['S001', 0], ['S002', 0], ['S003', 1]]) Object.assign(state(id), rules.initial(id), { tier, rewardDay: rules.hkDay(), rewardPaid: tier ? 100 : 0 }); store.save();
  server = http.createServer(); io = new Server(server);
  io.engine.use((req, res, next) => { req.session = { studentId: req.headers['x-student'], role: 'student' }; next(); });
  service = require('../pet-app/server/duel')(io, { countdownMs: 0 }); await service.startup;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const connect = async id => { const sock = client(`http://127.0.0.1:${server.address().port}/pet-brawl`, { extraHeaders: { 'x-student': id }, transports: ['websocket'], reconnection: false }); sockets.push(sock); await new Promise((resolve, reject) => { sock.once('connect', resolve); sock.once('connect_error', reject); }); return sock; };
  const [a, b, c] = await Promise.all(ids.slice(0, 3).map(connect));
  const request = (sock, event, body) => new Promise((resolve, reject) => sock.timeout(3000).emit(event, body, (error, result) => error ? reject(error) : resolve(result)));
  const ping = sock => request(sock, 'duel:presence', { active: true, busy: false, refresh: true });
  await Promise.all([a, b, c].map(ping));
  assert.equal((await ping(a)).peers.find(p => p.id === 'S003').rank.tierId, 'bronze');
  const invite = (target, mode = 'ranked') => request(a, 'duel:invite', { targetId: target, mode, petId: petIds[0], stageId: 'sunny-training', key: randomUUID() });
  const socketBefore = balances(); assert.equal((await invite('S003')).success, false); assert.deepEqual(balances(), socketBefore);
  let invitation = (await invite('S002')).invitation; assert.equal(invitation.mode, 'ranked'); assert.equal(invitation.rankTier, 0);
  await request(b, 'duel:reply', { inviteId: invitation.id, accept: false }); assert.deepEqual(balances(), socketBefore);
  await new Promise(r => setTimeout(r, 3100));
  invitation = (await invite('S002')).invitation;
  state('S002').tier = 1; store.save();
  assert.equal((await request(b, 'duel:reply', { inviteId: invitation.id, accept: true, petId: petIds[1] })).success, false);
  assert.deepEqual(balances(), socketBefore.map((v, i) => v + (i === 1 ? 100 : 0))); // independent daily Bronze reward, no entry fee.
  state('S002').tier = 0; store.save();
  await new Promise(r => setTimeout(r, 3100));
  invitation = (await invite('S002')).invitation;
  const accepted = await request(b, 'duel:reply', { inviteId: invitation.id, accept: true, petId: petIds[1] }); assert.equal(accepted.success, true);
  const mid = accepted.session.match.id; assert.equal(accepted.session.match.mode, 'ranked');
  await request(a, 'duel:ready', { matchId: mid }); await request(b, 'duel:ready', { matchId: mid });
  const deadline = Date.now() + 5000; while (service.rooms.get(mid).phase !== 'playing') { if (Date.now() > deadline) throw new Error('Match did not begin'); await new Promise(r => setTimeout(r, 20)); }
  await request(b, 'duel:leave', { matchId: mid });
  assert.equal(state('S001').wins, 1); assert.equal(state('S002').losses, 1); assert.equal(state('S001').games, 1);
  assert.equal(service.rooms.get(mid).meta.rankResults[0].tierWins, 1);
  pass('real sockets enforce tiers at invite and atomic acceptance, rejection charges neither player, and a started surrender records a ranked win/loss');

  await rank.distribute(); await require('../math-app/repositories/users.repo').deleteById('S003');
  assert.equal(d.petBrawlRanks.some(p => p.studentId === 'S003'), false);
  assert.equal((await rank.overview('S001')).leaderboard.some(p => p.studentId === 'S003'), false);
  pass('account deletion removes the owned ranking without changing other student records');
  const out = path.resolve(process.env.PET_BRAWL_RANK_OUT || 'artifacts/pet-playtest/brawl-ranking'); await fs.mkdir(out, { recursive: true });
  await fs.writeFile(path.join(out, 'server-report.json'), JSON.stringify({ passed: true, checks }, null, 2) + '\n');
} finally {
  for (const sock of sockets) sock.disconnect(); service?.close();
  if (io) await new Promise(resolve => io.close(resolve)); else server?.close();
  await fs.rm(temp, { recursive: true, force: true });
}
