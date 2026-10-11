import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { PGlite } = require(process.argv[2] ? path.resolve(process.argv[2]) : '@electric-sql/pglite');
const engine = new PGlite();
process.env.NODE_ENV = 'development';
process.env.SUPABASE_DB_URL = 'postgres://isolated-test-only';
const dbPath = require.resolve('../math-app/db/database');
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
  getPool: () => ({ query: async (text, values) => {
    const result = await engine.query(text, values);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  } }),
} };
const repo = require('../homework-app/repositories/reports.repo');
try {
  const initial = await repo.getState('2026-27');
  assert.deepEqual(initial, { revision: 0, versions: [], tasks: [] });
  const file = Buffer.from('teacher-workbook-fixture').toString('base64');
  const data = { ...initial, versions: [{ week: 7, file, observed: { S001: 3 } }], tasks: [{ id: 'a'.repeat(64), studentId: 'S001', action: 'parent', done: false }] };
  await repo.saveState('2026-27', data, 0);
  await assert.rejects(repo.saveState('2026-27', data, 0), error => error.status === 409);
  const saved = await repo.getState('2026-27');
  assert.equal(saved.revision, 1);
  assert.deepEqual(Buffer.from(saved.versions[0].file, 'base64'), Buffer.from('teacher-workbook-fixture'));
  const writes = await Promise.allSettled([repo.saveState('2026-27', saved, 1), repo.saveState('2026-27', saved, 1)]);
  assert.equal(writes.filter(item => item.status === 'fulfilled').length, 1, 'only one concurrent update wins');
  assert.equal(writes.find(item => item.status === 'rejected').reason.status, 409);
  const updated = await repo.getState('2026-27');
  Object.assign(updated.tasks[0], { done: true, doneBy: 'T001' });
  await repo.saveState('2026-27', updated, updated.revision);
  const done = await repo.getState('2026-27');
  assert.equal(done.revision, 3);
  assert.ok(done.tasks[0].done);
  assert.equal(done.tasks[0].doneBy, 'T001');
  assert.deepEqual(await repo.getState('2027-28'), initial, 'academic years are isolated');
  console.log('PostgreSQL report schema, exact-file/observation persistence, atomic revision conflicts and task completion passed.');
} finally { await engine.close(); }
