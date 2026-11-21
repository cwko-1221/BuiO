'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

const configPath = require.resolve('../config');
const config = require(configPath);
require.cache[configPath].exports = { ...config, db: { mode: 'postgres' } };

const engine = new PGlite();
let interruptSettlement = false;
async function query(target, sql, params) {
  if (interruptSettlement && sql.startsWith('INSERT INTO HomeworkRewardProgress')) throw new Error('settlement interrupted');
  const result = params ? await target.query(sql, params) : (await target.exec(sql)).at(-1);
  return { ...result, rowCount: result.affectedRows || result.rows.length };
}
const databasePath = require.resolve('../math-app/db/database');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: {
  getPool: () => ({ query: (sql, params) => query(engine, sql, params) }),
  withTransaction: action => engine.transaction(transaction => action({ query: (sql, params) => query(transaction, sql, params) })),
} };

const academicYears = require('../math-app/repositories/academic-years.repo');
const homework = require('../homework-app/repositories/homework.repo');
const rewards = require('../homework-app/repositories/streak-rewards.repo');
const pet = require('../pet-app/repositories/pet.repo');
const { rewardDays, updateSchedule, validateSettings } = require('../homework-app/lib/terms');
const { todayHongKong } = require('../homework-app/lib/domain');

const year = '2026-27';
const calendar = {
  T1: { dateFrom: '2026-09-01', dateTo: '2026-11-11' },
  T2: { dateFrom: '2026-11-12', dateTo: '2027-02-28' },
  T3: { dateFrom: '2027-03-01', dateTo: '2027-07-15' },
};
const input = { activeTerm: 'T2', terms: calendar, baseCoins: 10 };

test('reward days start at activation, close at Hong Kong midnight, and preserve the effective base', () => {
  const settings = validateSettings(input, year);
  const scheduled = updateSchedule(null, settings, '2026-11-14');
  const changed = updateSchedule(scheduled, { ...settings, baseCoins: 12 }, '2026-11-16');
  assert.deepEqual(rewardDays(changed, '2026-11-14'), []);
  assert.deepEqual(rewardDays(changed, '2026-11-17'), [
    { date: '2026-11-14', term: 'T2', baseCoins: 10 },
    { date: '2026-11-15', term: 'T2', baseCoins: 10 },
    { date: '2026-11-16', term: 'T2', baseCoins: 12 },
  ]);
  assert.deepEqual(rewardDays(changed, todayHongKong(new Date('2026-11-16T15:59:59Z'))).map(day => day.baseCoins), [10, 10]);
  assert.deepEqual(rewardDays(changed, todayHongKong(new Date('2026-11-16T16:00:00Z'))).map(day => day.baseCoins), [10, 10, 12]);
  assert.throws(() => validateSettings({ ...input, terms: { ...calendar, T3: calendar.T2 } }, year), /重疊/);
});

test('midnight settlement restores a corrected streak, pays only the difference, and commits atomically', async t => {
  t.after(() => engine.close());
  await engine.exec(`CREATE TABLE Users (StudentID varchar(20) PRIMARY KEY, Name text, Role text,
    ClassName text, ClassNo int, ChineseGroup text, EnglishGroup text, MathGroup text);
    INSERT INTO Users (StudentID, Name, Role, ClassName) VALUES
      ('S001', 'One', 'student', 'P4'), ('S002', 'Two', 'student', 'P4'), ('S003', 'Three', 'student', 'P4');`);
  await academicYears.ensureSchema();
  await engine.query(`INSERT INTO StudentAcademicYears (AcademicYear, StudentID, Name, ClassName, CreatedAt)
    SELECT $1, StudentID, Name, ClassName,
      CASE WHEN StudentID='S003' THEN '2026-11-20T00:00:00+08:00' ELSE '2026-09-01T00:00:00+08:00' END::timestamptz
    FROM Users`, [year]);
  const settings = updateSchedule(null, validateSettings(input, year), '2026-11-12');
  await engine.query('INSERT INTO PlatformSettings (SettingKey, SettingValue) VALUES ($1,$2)', [`homeworkTerms:${year}`, JSON.stringify(settings)]);
  const record = { academicYear: year, className: 'P4', subject: 'science', date: '2026-11-14' };
  await homework.createRecord({ ...record, createdBy: 'T001',
    homeworks: [{ id: 'h1', title: 'Homework', statuses: [{ studentId: 'S001', status: 'missing', madeUp: true }] }] });

  const wallet = async student => (await engine.query('SELECT Balance AS balance FROM PetWallets WHERE StudentID=$1', [student])).rows[0]?.balance;
  const settle = () => rewards.settleYear(year, '2026-11-22');
  await rewards.settleYear(year, '2026-11-12');
  assert.equal(await rewards.getProgress(year, 'S001'), null);
  interruptSettlement = true;
  await assert.rejects(settle(), /settlement interrupted/);
  interruptSettlement = false;
  assert.equal(await wallet('S001'), undefined);
  assert.equal((await engine.query('SELECT * FROM PetCurrencyLedger')).rows.length, 0);

  await Promise.all([settle(), settle()]);
  assert.equal(await wallet('S001'), 310);
  assert.deepEqual(await rewards.getProgress(year, 'S001'), { date: '2026-11-21', streak: 7, coins: 70 });
  assert.equal(await wallet('S002'), 550);
  assert.equal(await wallet('S003'), 30);

  await homework.updateRecord({ ...record, updatedBy: 'T001',
    homeworks: [{ id: 'h1', title: 'Homework', statuses: [{ studentId: 'S001', status: 'complete' }] }] });
  await settle();
  await settle();
  assert.equal(await wallet('S001'), 550);
  assert.deepEqual(await rewards.getProgress(year, 'S001'), { date: '2026-11-21', streak: 10, coins: 100 });
  await pet.ensureStudent('S001');
  assert.equal(await wallet('S001'), 550);
});
