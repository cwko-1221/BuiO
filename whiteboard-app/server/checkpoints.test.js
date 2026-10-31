const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createStore, createCheckpoints } = require('./checkpoints');

test('atomic JSON checkpoints survive a new store and retain an explicit end tombstone', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wb-checkpoints-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'boards.json');
  const store = createStore({ mode: 'json', file });
  await store.write([{ room: 'a', part: 'room', payload: { sessionId: 'first', ownerId: 'T1' } },
    { room: 'a', part: 'student:S1', payload: { sessionId: 'first', board: { strokes: [1,2,3] } } }]);
  const fresh = createStore({ mode: 'json', file });
  assert.equal((await fresh.load())[1].payload.board.strokes.length, 3);
  await fresh.write([{ room: 'a', part: 'room', payload: { sessionId: 'first', ended: true } }]);
  assert.equal((await createStore({ mode: 'json', file }).load())[0].payload.ended, true);
});

test('slow or failed persistence coalesces newer boards and never overwrites a newer tombstone', async () => {
  let release, fail = true; const batches = [];
  const queue = createCheckpoints({ write: async rows => {
    batches.push(rows); if (fail) { await new Promise(resolve => { release = resolve; }); throw Error('offline'); }
  } }, { intervalMs: 100000 });
  queue.put('r', 'room', { version: 1 });
  const first = queue.flush();
  queue.put('r', 'room', { ended: true });
  release(); await assert.rejects(first, /offline/);
  fail = false; await queue.flush();
  assert.deepEqual(batches[1], [{ room: 'r', part: 'room', payload: { ended: true } }]);
  assert.equal(queue.pending(), 0); await queue.close();
});

test('PostgreSQL stores only changed parts in one batch and excludes expired checkpoints', async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const pg = new PGlite();
  const store = createStore({ mode: 'postgres', query: (text, args) => args ? pg.query(text,args) :
    text.includes('CREATE TABLE') ? pg.exec(text).then(() => ({ rows: [] })) : pg.query(text) });
  try {
    await store.write([{ room: 'r', part: 'room', payload: { ownerId: 'T1' } }, { room: 'r', part: 's', payload: { strokes: [1] } }]);
    await store.write([{ room: 'r', part: 's', payload: { strokes: [1,2] } }]);
    assert.equal((await store.load()).find(row => row.part === 's').payload.strokes.length, 2);
    await pg.exec('CREATE ROLE wb_browser; GRANT SELECT ON WhiteboardCheckpoints TO wb_browser; SET ROLE wb_browser;');
    assert.equal((await pg.query('SELECT * FROM WhiteboardCheckpoints')).rows.length,0,'RLS keeps private drawings inaccessible even if a browser role receives SELECT');
    await pg.exec('RESET ROLE;');
    await pg.query("UPDATE WhiteboardCheckpoints SET UpdatedAt=NOW()-INTERVAL '3 hours'");
    assert.deepEqual(await store.load(), []);
  } finally { await pg.close(); }
});
