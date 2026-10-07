// Optional isolated SQL-engine verification: pass an @electric-sql/pglite package directory.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2] ? path.resolve(process.argv[2]) : '@electric-sql/pglite');
const engine = new PGlite();
process.env.NODE_ENV = 'development';
process.env.SUPABASE_DB_URL = 'postgres://isolated-test-only';

async function query(db, text, values = []) {
  const result = !values.length && text.includes(';') ? (await db.exec(text)).at(-1) : await db.query(text, values);
  return { ...result, rowCount: result.affectedRows || result.rows.length };
}
const dbPath = require.resolve('../../math-app/db/database');
let transactionDb;
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  getPool: () => ({ query: (text, values) => query(engine, text, values) }),
  // PGlite has one connection. Route the read-only user summary through the active
  // transaction; a real PostgreSQL pool can serve that lookup on another connection.
  queryWithRetry: (text, values) => query(transactionDb || engine, text, values),
  withTransaction: fn => engine.transaction(async tx => {
    transactionDb = tx;
    try { return await fn({ query: (text, values) => query(tx, text, values) }); }
    finally { transactionDb = null; }
  }),
} };

const teacher = { studentId: 'T1', role: 'teacher' };
const student = studentId => ({ studentId, role: 'student' });
const ready = round => ({ action: 'ready', round, visible: true, clockReady: true, rtt: 20 });
try {
  await engine.exec(`CREATE TABLE Users(StudentID VARCHAR(20) PRIMARY KEY, Name VARCHAR(120), Role VARCHAR(20),
    ClassName VARCHAR(20), ClassNo INTEGER, ChineseGroup VARCHAR(20), EnglishGroup VARCHAR(20), MathGroup VARCHAR(20), Language VARCHAR(20));
    INSERT INTO Users(StudentID,Name,Role,ClassName,ChineseGroup) VALUES
      ('T1','老師','teacher',NULL,NULL),('S1','學生一','student','5A','A'),
      ('S2','學生二','student','5B','B'),('S3','別班學生','student','6A','C');`);
  const repo = require('../repository');
  const room = await repo.create(teacher, { audienceRules: [], points: 10 });
  await engine.exec(`INSERT INTO Users(StudentID,Name,Role,ClassName) VALUES ('LATE','新同學','student','9A')`);
  const late = student('LATE');
  assert.equal((await repo.sessions(late))[0].id, room.id);
  assert.equal((await repo.action(room.id, late, { action: 'join' })).me.name, '新同學');
  await repo.action(room.id, teacher, { action: 'start', round: 0 });
  const scheduled = await repo.action(room.id, late, ready(1));
  assert.equal(scheduled.phase, 'scheduled');
  assert.equal(scheduled.opensAt - scheduled.countdownAt, 3000);
  await repo.action(room.id, late, { action: 'armed', round: 1 });
  await engine.query(`UPDATE BuzzerSessions SET State=State || jsonb_build_object('opensAt',$2::bigint) WHERE SessionID=$1::uuid`, [room.id, Date.now() - 1]);
  const races = await Promise.allSettled(Array.from({ length: 30 }, () => repo.action(room.id, late, { action: 'buzz', round: 1 })));
  assert.equal(races.filter(result => result.status === 'fulfilled').length, 1);
  await repo.action(room.id, teacher, { action: 'judge', round: 1, correct: true });
  await repo.action(room.id, teacher, { action: 'judge', round: 1, correct: true });
  assert.equal((await engine.query(`SELECT Balance AS balance FROM PetWallets WHERE StudentID='LATE'`)).rows[0].balance, 10);
  assert.equal((await engine.query('SELECT COUNT(*)::integer AS count FROM PetCurrencyLedger')).rows[0].count, 1);
  await repo.action(room.id, teacher, { action: 'end' });

  const restricted = await repo.create(teacher, { points: 20, audienceRules: [
    { classNames: ['5A', '5B'], groupField: 'chineseGroup', groupNames: ['A', 'B'] },
  ] });
  assert.deepEqual((await repo.raw(restricted.id)).eligible.map(row => row.studentId), ['S1', 'S2']);
  for (const id of ['S3', 'LATE']) {
    assert.deepEqual(await repo.sessions(student(id)), []);
    await assert.rejects(repo.get(restricted.id, student(id)), { status: 403 });
    await assert.rejects(repo.action(restricted.id, student(id), { action: 'join' }), { status: 403 });
  }
  await repo.action(restricted.id, student('S1'), { action: 'join' });
  await repo.action(restricted.id, teacher, { action: 'start', round: 0 });
  // Even an inconsistent saved participant must not bypass the atomic update's audience guard.
  await engine.query(`UPDATE BuzzerSessions SET State=jsonb_set(State,'{participants}',
    (State->'participants') || '[{"studentId":"S3","name":"別班學生","successes":0,"score":0}]'::jsonb) WHERE SessionID=$1::uuid`, [restricted.id]);
  const before = await repo.raw(restricted.id);
  await assert.rejects(repo.action(restricted.id, student('S3'), ready(1)), { status: 403 });
  assert.deepEqual(await repo.raw(restricted.id), before, 'denied readiness cannot mutate the saved session');
  await repo.action(restricted.id, student('S1'), ready(1));
  await repo.action(restricted.id, teacher, { action: 'end' });

  const legacy = await repo.create(teacher, { className: '5A', points: 10 });
  await engine.query(`UPDATE BuzzerSessions SET State=State-'audienceRules' WHERE SessionID=$1::uuid`, [legacy.id]);
  assert.equal(Object.hasOwn(await repo.get(legacy.id, teacher), 'audienceRules'), false);
  assert.deepEqual(await repo.sessions(late), []);
  await assert.rejects(repo.action(legacy.id, late, { action: 'join' }), { status: 403 });
  await repo.action(legacy.id, student('S1'), { action: 'join' });
  await repo.action(legacy.id, teacher, { action: 'start', round: 0 });
  assert.equal((await repo.action(legacy.id, student('S1'), ready(1))).phase, 'scheduled');
  console.log('✓ PostgreSQL audience: later-added account; shared-rule eligibility; atomic authorization; 30 racing buzzes; pet rewards; saved legacy access');
} finally { await engine.close(); }
