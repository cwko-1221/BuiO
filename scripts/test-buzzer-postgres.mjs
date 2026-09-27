// Pass a temporary @electric-sql/pglite installation directory to test the real PostgreSQL SQL engine.
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
const dbPath = require.resolve('../math-app/db/database');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  getPool: () => ({ query: (text, values) => query(engine, text, values) }),
  queryWithRetry: (text, values) => query(engine, text, values),
  withTransaction: fn => engine.transaction(tx => fn({ query: (text, values) => query(tx, text, values) })),
} };
await engine.exec(`CREATE TABLE Users(StudentID VARCHAR(20) PRIMARY KEY, Name VARCHAR(120), Role VARCHAR(20),
  ClassName VARCHAR(20), ClassNo INTEGER, ChineseGroup VARCHAR(20), EnglishGroup VARCHAR(20), MathGroup VARCHAR(20), Language VARCHAR(20));
  INSERT INTO Users(StudentID,Name,Role,ClassName,ClassNo) VALUES
    ('T001','老師','teacher',NULL,NULL),('S001','學生一','student','5A',1),('S002','學生二','student','5A',2),('S003','別班學生','student','5B',1);`);
const repo = require('../buzzer-app/repository');
const teacher = { studentId: 'T001', role: 'teacher' };
const first = { studentId: 'S001', role: 'student' };
const second = { studentId: 'S002', role: 'student' };
try {
  const room = await repo.create(teacher, { className: '5A', points: 10 });
  const id = room.id;
  await repo.action(id, first, { action: 'join' }); await repo.action(id, second, { action: 'join' });
  await repo.action(id, teacher, { action: 'start', round: 0 });
  await repo.action(id, first, { action: 'ready', round: 1, visible: true, clockReady: true, rtt: 20 });
  assert.equal((await repo.get(id, teacher)).phase, 'preparing');
  await assert.rejects(repo.action(id, first, { action: 'buzz', round: 1 }), error => error.status === 409);
  await repo.action(id, second, { action: 'ready', round: 1, visible: true, clockReady: true, rtt: 250 });
  const schedule = await repo.get(id, teacher);
  assert.equal(schedule.phase, 'scheduled'); assert.equal(schedule.opensAt - schedule.countdownAt, 3000);
  await repo.action(id, first, { action: 'armed', round: 1 });
  assert.equal((await repo.get(id, teacher)).phase, 'scheduled');
  await repo.action(id, second, { action: 'armed', round: 1 });
  assert.equal((await repo.get(id, teacher)).phase, 'countdown');
  await assert.rejects(repo.action(id, first, { action: 'buzz', round: 1 }), error => error.status === 409);
  await engine.query(`UPDATE BuzzerSessions SET State=State || jsonb_build_object('opensAt',$2::bigint) WHERE SessionID=$1::uuid`, [id, Date.now() - 100]);
  const buzzes = await Promise.allSettled(Array.from({ length: 30 }, (_, i) => repo.action(id, i % 2 ? first : second, { action: 'buzz', round: 1 })));
  assert.equal(buzzes.filter(row => row.status === 'fulfilled').length, 1);
  const winner = (await repo.get(id, teacher)).winner.studentId;
  await repo.action(id, teacher, { action: 'judge', round: 1, correct: true });
  await repo.action(id, teacher, { action: 'judge', round: 1, correct: true });
  assert.equal((await engine.query('SELECT Balance FROM PetWallets WHERE StudentID=$1', [winner])).rows[0].balance, 10);
  assert.equal((await engine.query('SELECT COUNT(*)::integer AS count FROM PetCurrencyLedger')).rows[0].count, 1);
  await repo.action(id, teacher, { action: 'start', round: 1 });
  await assert.rejects(repo.action(id, first, { action: 'ready', round: 1, visible: true, clockReady: true, rtt: 20 }), error => error.status === 409);
  await assert.rejects(repo.action(id, { studentId: 'S003', role: 'student' }, { action: 'ready', round: 2, visible: true, clockReady: true, rtt: 20 }), error => error.status === 403);
  await repo.interrupt(id, first, 2);
  assert.equal((await repo.get(id, teacher)).phase, 'waiting');
  await repo.action(id, teacher, { action: 'start', round: 2 });
  for (const student of [first, second]) await repo.action(id, student, { action: 'ready', round: 3, visible: true, clockReady: true, rtt: 20 });
  for (const student of [first, second]) await repo.action(id, student, { action: 'armed', round: 3 });
  await repo.action(id, first, { action: 'join' });
  assert.equal((await repo.get(id, teacher)).phase, 'waiting', 'reconnect invalidates readiness from the previous connection');
  await repo.action(id, teacher, { action: 'start', round: 3 });
  for (const student of [first, second]) await repo.action(id, student, { action: 'ready', round: 4, visible: true, clockReady: true, rtt: 20 });
  await engine.query(`UPDATE BuzzerSessions SET State=State || jsonb_build_object('countdownAt',$2::bigint) WHERE SessionID=$1::uuid`, [id, Date.now() - 100]);
  await repo.interrupt(id, teacher, 4, true);
  assert.equal((await repo.get(id, teacher)).phase, 'waiting', 'missing final confirmation cannot start a countdown');
  console.log('✓ PostgreSQL engine: schema/NOTIFY SQL; ready/armed barriers; 30 atomic racing buzzes; transactional/idempotent pet payout; stale-round and class authorization; interruption');
} finally { await engine.close(); }
