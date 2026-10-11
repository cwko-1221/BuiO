'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
const { PGlite } = require('@electric-sql/pglite');
const rules = require('../lib/brawl-ranking.cjs');
const root = path.resolve(__dirname, '../..');

function load(file, api, overrides = {}, clock = Date) {
  const filename = path.join(root, file), native = createRequire(filename), module = { exports: {} };
  const localRequire = id => {
    if (id in overrides) return overrides[id];
    if (id.endsWith('/config')) return { db: { mode: 'postgres' } };
    if (id.endsWith('/db/database')) return api;
    return native(id);
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    require: localRequire, module, exports: module.exports, Date: clock, console, structuredClone,
  }, { filename });
  return module.exports;
}

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE Users (StudentID varchar(20) PRIMARY KEY, Name text, Role text,
    ClassName text, ClassNo integer, ChineseGroup text, EnglishGroup text, MathGroup text);
    INSERT INTO Users SELECT 'S'||lpad(n::text,3,'0'),'Student '||n,'student','5A',n,'','',''
      FROM generate_series(1,157) AS n;
    INSERT INTO Users VALUES ('T001','Teacher','teacher','5A',1,'','','');`);
  const reads = [];
  let failRankSave = false, transactionTarget = null;
  const adapter = target => ({ async query(sql, params = []) {
    if (failRankSave && sql.startsWith('UPDATE PetBrawlRanks SET State=$2')) throw Error('write interrupted');
    const result = params.length ? await target.query(sql, params) : (await target.exec(sql)).at(-1);
    if (/^\s*SELECT/i.test(sql)) reads.push({ sql, rows: result?.rows || [] });
    return { ...result, rowCount: result?.rowCount ?? result?.affectedRows ?? result?.rows?.length ?? 0 };
  } });
  // PGlite has one connection: route repository-level reads through the active
  // test transaction rather than queueing them behind that same transaction.
  const pool = { query: (...args) => adapter(transactionTarget || db).query(...args),
    connect: async () => ({ ...adapter(db), release() {} }) };
  const transaction = fn => db.transaction(async tx => {
    transactionTarget = tx;
    try { return await fn(adapter(tx)); } finally { transactionTarget = null; }
  });
  const api = { getPool: () => pool, withTransaction: transaction };
  const years = load('math-app/repositories/academic-years.repo.js', api);
  await years.ensureSchema();
  return { db, api, years, reads, transaction, setFailRankSave: value => { failRankSave = value; } };
}

test('120 seconds of classroom access polls share bounded reads and use only student/class fields', async t => {
  const f = await fixture(t);
  let now = Date.parse('2026-10-11T08:00:00Z');
  class Clock extends Date { static now() { return now; } }
  const access = load('pet-app/repositories/access-lock.repo.js', f.api,
    { '../../math-app/repositories/academic-years.repo': f.years }, Clock);
  const classes = await f.years.listStudentClasses('2025-26');
  assert.equal(classes.length, 157);
  assert.deepEqual(Object.keys(classes[0]).sort(), ['className', 'studentId']);
  await access.studentStatus('S001', now);
  f.reads.length = 0;
  for (let second = 1; second <= 120; second++) {
    now += 1000;
    const statuses = await Promise.all(Array.from({ length: 60 }, (_, i) => access.studentStatus(`S${String(i + 1).padStart(3, '0')}`, now)));
    assert.ok(statuses.every(s => s.className === '5A' && !s.locked));
  }
  assert.equal(f.reads.length, 12, 'four snapshot refreshes, three reads each, despite 7,200 polls');
  assert.equal(f.reads.filter(r => r.rows.length === 157).length, 4);
  assert.ok(f.reads.flatMap(r => r.rows).every(r => !('name' in r) && !('mathGroup' in r)));

  // A schedule boundary is evaluated from cached data, not cached status.
  await access.update('T001', { action: 'schedule', classes: ['5A'],
    startsAt: new Date(now + 1000).toISOString(), endsAt: new Date(now + 5000).toISOString() });
  assert.equal((await access.studentStatus('S001', now)).locked, false);
  const beforeBoundary = f.reads.length;
  now += 1000;
  assert.equal((await access.studentStatus('S001', now)).locked, true);
  await assert.rejects(access.assertAllowed('S001'), { status: 423, code: 'PET_APP_LOCKED' });
  now += 4000;
  assert.equal((await access.studentStatus('S001', now)).locked, false);
  assert.equal(f.reads.length, beforeBoundary, 'start and end do not need new SQL');

  await assert.rejects(access.update('T001', { action: 'lock', classes: ['5B'], endsAt: null }), { status: 400 });
  await f.years.updateCurrentEnrollment('S002', 'className', '5B');
  await access.update('T001', { action: 'lock', classes: ['5B'], endsAt: null });
  assert.equal((await access.studentStatus('S001', now)).locked, false);
  await f.years.updateCurrentEnrollment('S001', 'className', '5B');
  assert.equal((await access.studentStatus('S001', now)).locked, true, 'a committed class move invalidates immediately');
  await access.update('T001', { action: 'unlock', classes: ['5B'] });
  assert.equal((await access.studentStatus('S001', now)).locked, false, 'teacher unlock is immediate');
  await access.update('T001', { action: 'lock', classes: ['5B'], endsAt: null });
  await f.years.promoteAllStudents();
  const promoted = await access.studentStatus('S001', now);
  assert.equal(promoted.academicYear, '2026-27');
  assert.equal(promoted.locked, false, 'the new year never inherits old locks');
});

test('bulk enrollment imports notify after commit and rollback cannot invalidate with uncommitted classes', async t => {
  const f = await fixture(t);
  let changes = 0;
  f.years.events.on('changed', () => { changes++; });
  const student = { studentId: 'S001', name: 'Student 1', className: '5B', classNo: 1 };
  await assert.rejects(f.transaction(async client => {
    await f.years.upsertCurrentStudent(student, { client });
    assert.equal(changes, 0);
    throw Error('abort import');
  }));
  assert.equal((await f.years.findEnrollment('2025-26', 'S001')).className, '5A');
  assert.equal(changes, 0);
  await f.transaction(async client => {
    await f.years.upsertCurrentStudent(student, { client });
    assert.equal(changes, 0);
  });
  f.years.notifyEnrollmentChanged();
  assert.equal(changes, 1);
  assert.equal((await f.years.findEnrollment('2025-26', 'S001')).className, '5B');
});

test('an invalidated in-flight access read cannot serve or re-cache the previous class; failures retry', async () => {
  const now = Date.parse('2026-10-11T08:00:00Z');
  let release, rosterReads = 0, fail = false;
  const years = { events: new EventEmitter(), getCurrentAcademicYear: async () => '2026-27',
    listStudentClasses: async () => {
      if (fail) { fail = false; throw Error('network'); }
      if (++rosterReads === 1) return new Promise(resolve => { release = () => resolve([{ studentId: 'S001', className: '5A' }]); });
      return [{ studentId: 'S001', className: '5B' }];
    } };
  const rule = { academicYear: '2026-27', classes: ['5B'], startsAt: new Date(now - 1000).toISOString(), endsAt: null };
  const api = { getPool: () => ({ query: async sql => ({ rows: sql.startsWith('SELECT') ? [{ state: rule }] : [] }) }) };
  const access = load('pet-app/repositories/access-lock.repo.js', api,
    { '../../math-app/repositories/academic-years.repo': years });
  const oldRead = access.studentStatus('S001', now);
  while (!release) await Promise.resolve();
  years.events.emit('changed');
  assert.equal((await access.studentStatus('S001', now)).locked, true);
  release();
  assert.equal((await oldRead).locked, true, 'a caller already waiting must also get the updated class');
  fail = true; years.events.emit('changed');
  await assert.rejects(access.studentStatus('S001', now), /network/);
  assert.equal((await access.studentStatus('S001', now)).locked, true);
});

test('Postgres reward sweeps return only eligible unpaid ranks and preserve midnight, promotions and rollback', async t => {
  const f = await fixture(t), at = Date.parse('2026-10-11T15:59:59Z');
  await f.db.exec(`CREATE TABLE PetWallets(StudentID varchar(20) PRIMARY KEY, Balance integer NOT NULL DEFAULT 0, UpdatedAt timestamptz);
    CREATE TABLE PetCurrencyLedger(TransactionID uuid PRIMARY KEY, StudentID varchar(20), ActorID varchar(20),
      Delta integer, Kind text, IdempotencyKey text, Metadata jsonb, UNIQUE(StudentID,IdempotencyKey));
    INSERT INTO PetWallets SELECT StudentID,0,now() FROM Users;`);
  const rank = load('pet-app/repositories/brawl-ranking.repo.js', f.api, {
    './pet.repo': { ensureSchema: async () => {} },
    '../../math-app/repositories/academic-years.repo': { INITIAL_ACADEMIC_YEAR: '2025-26',
      ensureSchema: f.years.ensureSchema, listEnrollments: () => { throw Error('must not download roster'); } },
  });
  await rank.ensure();
  const profiles = [
    { ...rules.initial('S001') },
    { ...rules.initial('S002'), tier: 1, rewardDay: '2026-10-11', rewardPaid: 100 },
    { ...rules.initial('S003'), tier: 2, rewardDay: '2026-10-09', rewardPaid: 300 },
    { ...rules.initial('S004'), tier: 4, rewardDay: '2026-10-09', rewardPaid: 1000 },
    { ...rules.initial('S005'), tier: 1, rewardDay: '2026-10-11', rewardPaid: 20 },
    { ...rules.initial('S006'), tier: 1, rewardDay: '2026-10-13', rewardPaid: 100 },
    { ...rules.initial('S007'), tier: 4, rewardDay: '2026-10-09', rewardPaid: 1000 },
    { ...rules.initial('S008'), tier: 2 },
    { ...rules.initial('T001'), tier: 1, rewardDay: '2026-10-09', rewardPaid: 100 },
  ];
  for (const p of profiles) await f.db.query('INSERT INTO PetBrawlRanks(StudentID,State) VALUES ($1,$2::jsonb)', [p.studentId, JSON.stringify(p)]);
  await f.years.updateCurrentEnrollment('S004', 'className', 'Graduated');
  await f.db.query('DELETE FROM StudentAcademicYears WHERE StudentID=$1', ['S007']);
  const dueReads = () => f.reads.filter(r => r.sql.includes('JOIN StudentAcademicYears') && r.sql.includes('PetBrawlRanks'));
  const firstAmount = await rank.distribute(at);
  assert.equal(firstAmount, 980, JSON.stringify(dueReads().at(-1)?.rows));
  assert.equal(dueReads().at(-1).rows.length, 3);
  assert.equal(await rank.distribute(at), 0);
  assert.equal(dueReads().at(-1).rows.length, 0, 'already-paid minute sweeps return zero profile data');
  const balance = async id => (await f.db.query('SELECT Balance AS balance FROM PetWallets WHERE StudentID=$1', [id])).rows[0].balance;
  for (const id of ['S001', 'S004', 'S006', 'S007', 'T001']) assert.equal(await balance(id), 0);
  assert.equal(await rank.distribute(at + 1000), 800, 'Hong Kong midnight pays the new day, including offline students');
  assert.equal(await rank.distribute(at + 1000), 0);

  await f.db.query(`UPDATE PetBrawlRanks SET State=State || '{"tier":2}'::jsonb WHERE StudentID='S005'`);
  assert.equal(await rank.distribute(at + 1000, 'S005'), 200, 'same-day promotion still tops up immediately');
  assert.equal(dueReads().at(-1).rows.length, 1);
  const before = await balance('S005');
  f.setFailRankSave(true);
  await assert.rejects(rank.distribute(at + 86401000, 'S005'), /write interrupted/);
  assert.equal(await balance('S005'), before, 'a failed profile save rolls back the wallet and receipt');
  f.setFailRankSave(false);
  assert.equal(await rank.distribute(at + 86401000, 'S005'), 300);
  assert.equal(await rank.distribute(at + 86401000, 'S005'), 0);
});
