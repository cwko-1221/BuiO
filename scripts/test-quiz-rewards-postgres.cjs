'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const configPath = require.resolve('../config');
const config = require(configPath);
require.cache[configPath].exports = { ...config, db: { mode: 'postgres' } };
const databasePath = require.resolve('../math-app/db/database');
const db = new PGlite();
let interruptReceipt = false;
const query = async (target, sql, args = []) => {
  if (interruptReceipt && sql.startsWith('INSERT INTO PetIdempotency')) throw new Error('Interrupted reward transaction');
  const value = args.length ? await target.query(sql, args) : await target.exec(sql);
  const result = Array.isArray(value) ? value[value.length - 1] : value;
  return { ...result, rows: result?.rows || [], rowCount: result?.affectedRows ?? result?.rows?.length ?? 0 };
};
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: {
  getPool: () => ({ query: (sql, args) => query(db, sql, args) }),
  withTransaction: run => db.transaction(tx => run({ query: (sql, args) => query(tx, sql, args) })),
} };
const pets = require('../pet-app/repositories/pet.repo');
test('quiz rewards use atomic, persistent pet-wallet grants and replay-safe round keys', async t => {
  t.after(() => db.close());
  await db.exec("CREATE TABLE Users(StudentID varchar(20) PRIMARY KEY); INSERT INTO Users VALUES ('T001'),('S001'),('S002');");
  const first = { idempotencyKey: 'quiz:4c734897-6a97-4305-a2fd-2653889b0bb5', note: 'Quiz question 1' };
  const credited = await pets.grantCoins('T001', ['S001', 'S002'], 25, first);
  assert.equal(credited.count, 2);
  const replay = await pets.grantCoins('T001', ['S001', 'S002'], 25, first);
  assert.deepEqual(replay, credited);
  assert.deepEqual((await db.query('SELECT Balance FROM PetWallets ORDER BY StudentID')).rows.map(row => row.balance), [25, 25]);
  assert.equal((await db.query('SELECT * FROM PetCurrencyLedger')).rows.length, 2);
  const next = { idempotencyKey: 'quiz:58a1ac10-eb62-43c7-a8ba-d45d3d9d062c', note: 'Quiz question 2' };
  interruptReceipt = true;
  await assert.rejects(pets.grantCoins('T001', ['S001', 'S002'], 10, next), /Interrupted/);
  interruptReceipt = false;
  assert.deepEqual((await db.query('SELECT Balance FROM PetWallets ORDER BY StudentID')).rows.map(row => row.balance), [25, 25]);
  assert.equal((await db.query('SELECT * FROM PetCurrencyLedger')).rows.length, 2);
  await pets.grantCoins('T001', ['S001', 'S002'], 10, next);
  assert.deepEqual((await db.query('SELECT Balance FROM PetWallets ORDER BY StudentID')).rows.map(row => row.balance), [35, 35]);
  assert.equal((await db.query('SELECT * FROM PetCurrencyLedger')).rows.length, 4);
});
