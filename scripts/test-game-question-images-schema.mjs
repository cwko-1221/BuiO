import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const configPath = require.resolve('../config');
const dbPath = require.resolve('../math-app/db/database');
const repoPath = require.resolve('../game-app/repositories/questionSets.repo');
const originalConfig = require.cache[configPath];
const originalDb = require.cache[dbPath];
const originalRepo = require.cache[repoPath];
const image = 'data:image/png;base64,aW1hZ2U=';
const question = { question: 'Picture question', choices: ['A', 'B'], correctIndex: 1, image };

function fixture({ columnExists = false, failMigration = false } = {}) {
  const calls = [];
  let nextId = 0;
  const sets = new Map();
  const questions = new Map();
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('information_schema.columns')) return { rows: columnExists ? [{ exists: 1 }] : [] };
      if (sql.startsWith('ALTER TABLE')) {
        if (failMigration) { failMigration = false; throw new Error('migration unavailable'); }
        columnExists = true;
        return { rows: [] };
      }
      if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [] };
      if (sql.includes('INSERT INTO game_question_sets')) {
        const id = `set-${++nextId}`;
        sets.set(id, { id, title: params[0], created_by: params[1] });
        return { rows: [{ id }] };
      }
      if (sql.includes('INSERT INTO game_questions')) {
        assert.equal(columnExists, true, 'image schema must be ready before writing questions');
        questions.set(params[0], params[1].map((text, index) => ({
          id: `q-${index}`, question: text, choices: JSON.parse(params[2][index]),
          correct_index: params[3][index], image_data: params[5][index],
        })));
        return { rows: [] };
      }
      if (sql.startsWith('SELECT id, title, created_by')) return { rows: sets.has(params[0]) ? [sets.get(params[0])] : [] };
      if (sql.includes('FROM game_questions')) {
        if (sql.includes('image_data')) assert.equal(columnExists, true, 'image schema must be ready before reading images');
        return { rows: (questions.get(params[0]) || []).map(row => {
          if (sql.includes('image_data')) return row;
          const { image_data, ...plain } = row;
          return plain;
        }) };
      }
      if (sql.includes('UPDATE game_question_sets')) {
        const set = sets.get(params[1]);
        if (!set || set.created_by !== params[2]) return { rowCount: 0, rows: [] };
        set.title = params[0];
        return { rowCount: 1, rows: [] };
      }
      if (sql.startsWith('DELETE FROM game_questions')) { questions.delete(params[0]); return { rows: [] }; }
      throw new Error(`Unexpected query: ${sql}`);
    },
    async connect() { calls.push({ sql: 'CONNECT' }); return { query: pool.query, release() { calls.push({ sql: 'RELEASE' }); } }; },
  };
  require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: { db: { mode: 'postgres' } } };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { getPool: () => pool } };
  delete require.cache[repoPath];
  return { repo: require(repoPath), calls, sets, questions };
}

try {
  const old = fixture();
  const ids = await Promise.all(Array.from({ length: 3 }, () => old.repo.createSet({ teacherId: 'teacher', title: 'Images', questions: [question] })));
  assert.equal(old.calls.filter(c => c.sql.includes('information_schema.columns')).length, 1, 'concurrent requests share schema preparation');
  assert.equal(old.calls.filter(c => c.sql.startsWith('ALTER TABLE')).length, 1, 'old schema migrates once');
  assert.ok(old.calls.findIndex(c => c.sql.startsWith('ALTER TABLE')) < old.calls.findIndex(c => c.sql === 'BEGIN'), 'migration runs outside question write transactions');
  const loaded = await old.repo.getSetWithQuestions(ids[0]);
  assert.equal(loaded.questions[0].image, image, 'stored image is returned to teachers and games');
  assert.deepEqual(loaded.questions[0].choices, question.choices);
  await old.repo.replaceSetQuestions({ setId: ids[0], teacherId: 'teacher', title: 'Updated', questions: [{ ...question, image: null }] });
  assert.equal((await old.repo.getSetWithQuestions(ids[0])).questions[0].image, null, 'text-only questions remain valid');
  assert.equal(old.calls.filter(c => c.sql.includes('information_schema.columns')).length, 1, 'successful schema checks are cached');

  const current = fixture({ columnExists: true });
  const id = await current.repo.createSet({ teacherId: 'teacher', title: 'Existing schema', questions: [question] });
  assert.equal(current.calls.some(c => c.sql.startsWith('ALTER TABLE')), false, 'up-to-date databases never take an ALTER TABLE lock');
  await assert.rejects(current.repo.replaceSetQuestions({ setId: id, teacherId: 'other', title: 'Forbidden', questions: [question] }), e => e.statusCode === 404);
  assert.equal(current.calls.at(-2).sql, 'ROLLBACK');
  assert.equal(current.calls.at(-1).sql, 'RELEASE');

  const read = fixture();
  read.sets.set('legacy', { id: 'legacy', title: 'Legacy', created_by: 'teacher' });
  read.questions.set('legacy', [{ id: 'q', question: 'Text', choices: ['A', 'B'], correct_index: 0 }]);
  await read.repo.getSetWithQuestions('legacy', { includeImages: false });
  assert.equal(read.calls.some(c => c.sql.includes('information_schema.columns')), false, 'plain reads do not require image migration');
  assert.equal((await read.repo.getSetWithQuestions('legacy')).questions[0].image, null);
  assert.equal(read.calls.filter(c => c.sql.startsWith('ALTER TABLE')).length, 1, 'image reads also migrate legacy schemas');

  const retry = fixture({ failMigration: true });
  await assert.rejects(retry.repo.createSet({ teacherId: 'teacher', title: 'Retry', questions: [question] }), /migration unavailable/);
  assert.equal(retry.calls.some(c => c.sql === 'CONNECT'), false, 'migration failure does not start a write transaction');
  await retry.repo.createSet({ teacherId: 'teacher', title: 'Retry', questions: [question] });
  assert.equal(retry.calls.filter(c => c.sql.startsWith('ALTER TABLE')).length, 2, 'failed schema preparation can retry');
  console.log('Question image schema passed: legacy migration, current schema, concurrent requests, image round-trip, plain questions, authorization and migration retry.');
} finally {
  for (const [path, original] of [[configPath, originalConfig], [dbPath, originalDb], [repoPath, originalRepo]]) {
    if (original) require.cache[path] = original; else delete require.cache[path];
  }
}
