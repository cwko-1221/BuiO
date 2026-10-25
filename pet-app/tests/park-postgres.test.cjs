'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const configPath = require.resolve('../../config');
const config = require(configPath);
require.cache[configPath].exports = { ...config, db: { mode: 'postgres' } };
const db = new PGlite(); let active, failSave = false;
const query = async (target, sql, params = []) => {
  if (failSave && sql.startsWith('UPDATE PetParkProgress')) throw new Error('transaction interrupted');
  const result = params.length ? await target.query(sql, params) : await target.exec(sql);
  const value = Array.isArray(result) ? result[result.length - 1] : result;
  return { ...value, rows: value?.rows || [], rowCount: value?.affectedRows ?? value?.rows?.length ?? 0 };
};
const databasePath = require.resolve('../../math-app/db/database');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: {
  getPool: () => ({ query: (sql, params) => query(active || db, sql, params) }),
  withTransaction: fn => db.transaction(async tx => { active = tx; try { return await fn({ query: (sql, params) => query(tx, sql, params) }); } finally { active = null; } }),
} };
const repo = require('../repositories/park.repo');
const pets = require('../repositories/pet.repo');
function stepMode(w, quest, id) { const o = w.OBJECTS.find(o => o.id === id); return quest.requirements?.[id] || ({ flowers: 'water', acorn: 'search', litter: 'sort', chime: 'melody', drum: 'melody', bell: 'melody' })[o.kind] || 'visit'; }
test('PostgreSQL commits wallet, ledger and progress together, rolls back interrupted claims and cascades deletion', async t => {
  t.after(() => db.close());
  await db.exec(`CREATE TABLE Users (StudentID varchar(20) PRIMARY KEY); INSERT INTO Users VALUES ('S001');`);
  const w = await import('../lib/park-world.mjs'), now = Date.parse('2026-10-19T09:00:00+08:00');
  const daily = w.dailyQuests(pets.hkDay(new Date(now)));
  await repo.updateSettings('T001', 5000);
  const quest = daily[0]; await repo.accept('S001', quest.id, { now });
  for (const step of quest.steps) await repo.interact('S001', step, { now, mode: stepMode(w, quest, step) });
  failSave = true; await assert.rejects(repo.interact('S001', quest.npc, { now }), /transaction interrupted/); failSave = false;
  assert.equal((await db.query('SELECT Balance FROM PetWallets')).rows[0].balance, 0);
  assert.equal((await db.query('SELECT * FROM PetCurrencyLedger')).rows.length, 0);
  assert.equal((await repo.read('S001', now)).quests[quest.id].completedAt, null);
  const result = await repo.interact('S001', quest.npc, { now }); assert.equal(result.balance, quest.reward);
  await repo.interact('S001', quest.npc, { now });
  assert.equal((await db.query('SELECT * FROM PetCurrencyLedger')).rows.length, 1);
  await repo.updateSettings('T001', quest.reward + 2);
  const second = daily[1]; await repo.accept('S001', second.id, { now }); for (const step of second.steps) await repo.interact('S001', step, { now, mode: stepMode(w, second, step) });
  assert.equal((await repo.interact('S001', second.npc, { now })).earned, 2);
  assert.equal((await repo.read('S001', now)).earned, quest.reward + 2);
  const nextDay = now + 86400000; await repo.updateSettings('T001',5000); await repo.accept('S001', 'banana', { now: nextDay });
  const balanceBeforeGame = Number((await db.query('SELECT Balance FROM PetWallets')).rows[0].balance);
  failSave = true; await assert.rejects(repo.recordGame('S001', 'banana', { score: 9, qualified: true }, 'pg-game', { now: nextDay }), /transaction interrupted/); failSave = false;
  assert.equal(Number((await db.query('SELECT Balance FROM PetWallets')).rows[0].balance), balanceBeforeGame);
  assert.equal((await repo.read('S001', nextDay)).games.banana, undefined);
  const game = await repo.recordGame('S001', 'banana', { score: 9, qualified: true }, 'pg-game', { now: nextDay }); assert.equal(game.gameCoins, 150);
  assert.ok(game.state.quests.banana.steps.includes('banana-game'));
  await repo.recordGame('S001', 'banana', { score: 9, qualified: true }, 'pg-game', { now: nextDay });
  assert.equal((await repo.read('S001', nextDay)).games.banana.plays, 1);
  assert.equal(Number((await db.query('SELECT Balance FROM PetWallets')).rows[0].balance), balanceBeforeGame + 150);
  await db.exec("DELETE FROM Users WHERE StudentID='S001'");
  assert.equal((await db.query('SELECT * FROM PetParkProgress')).rows.length, 0);
  assert.equal((await db.query('SELECT * FROM PetCurrencyLedger')).rows.length, 0);
});
