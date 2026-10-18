'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');
const { presenceView } = require('../pet-app/server/duel-presence.cjs');

const member = (id, options = {}) => ({
  active: true, busy: false, locked: false, seenAt: 1000,
  ...options,
  profile: { id, name: id, className: 'P1', rank: { tier: 0 }, pets: [{}], ...options.profile },
});
const quote = ranks => ranks.map(rank => rank.tier);

test('rosters keep tab, expiry, busy, reservation and live-match rules', () => {
  const members = new Map([
    ['self', member('SELF', { profile: { rank: { tier: 1 } } })],
    ['self2', member('SELF', { profile: { rank: { tier: 4 } } })],
    ['open', member('OPEN', { profile: { className: 'P2' } })],
    ['busy', member('BUSY')],
    ['busy2', member('BUSY', { active: false, busy: true, profile: { name: 'Latest', rank: { tier: 2 } } })],
    ['reserved', member('RESERVED')],
    ['playing', member('PLAYING')],
    ['finished', member('FINISHED')],
    ['noPet', member('NO_PET', { profile: { pets: [] } })],
    ['hidden', member('HIDDEN', { active: false })],
    ['locked', member('LOCKED', { locked: true })],
    ['expired', member('EXPIRED', { seenAt: -24000 })],
  ]);
  const rooms = new Map([
    ['live', { meta: { status: 'playing', players: [{ id: 'PLAYING' }] } }],
    ['finished', { meta: { status: 'finished', players: [{ id: 'FINISHED' }] } }],
  ]);
  const view = presenceView(members, rooms, new Map([['RESERVED', 'invitation']]), 1000, quote);
  const peers = view.peersFor('SELF'), byId = new Map(peers.map(row => [row.id, row]));
  assert.deepEqual(peers.map(row => row.id), ['FINISHED', 'BUSY', 'NO_PET', 'PLAYING', 'RESERVED', 'OPEN']);
  assert.equal(view.ids.size, 10, 'one recipient per account, including hidden tabs');
  assert.equal(byId.get('BUSY').name, 'Latest');
  assert.deepEqual(byId.get('BUSY').rankTerms, [1, 2], 'viewer uses its first tab; peer uses its last tab');
  for (const id of ['BUSY', 'RESERVED', 'PLAYING', 'NO_PET']) assert.equal(byId.get(id).available, false);
  for (const id of ['OPEN', 'FINISHED']) assert.equal(byId.get(id).available, true);
  assert.equal(byId.get('NO_PET').hasFighter, false);
  assert.ok(view.peersFor('UNKNOWN').every(row => row.rankTerms === undefined));
  members.get('locked').locked = false;
  assert.ok(!view.peersFor('SELF').some(row => row.id === 'LOCKED'), 'one broadcast is a stable snapshot');
  assert.ok(presenceView(members, rooms, new Map(), 1000, quote).peersFor('SELF').some(row => row.id === 'LOCKED'));
});

test('a 60-student broadcast scans connections and live matches only once', () => {
  const rows = Array.from({ length: 60 }, (_, i) => member('QA' + i));
  let connectionReads = 0, matchReads = 0;
  const members = { *values() { for (const row of rows) { connectionReads++; yield row; } } };
  const rooms = { *values() { for (let i = 0; i < 30; i++) { matchReads++; yield { meta: { status: 'playing', players: [{ id: 'QA' + (i * 2) }, { id: 'QA' + (i * 2 + 1) }] } }; } } };
  const view = presenceView(members, rooms, new Map(), 1000, quote);
  for (const id of view.ids) {
    const peers = view.peersFor(id);
    assert.equal(peers.length, 59);
    assert.ok(peers.every(peer => !peer.available));
  }
  assert.equal(connectionReads, 60);
  assert.equal(matchReads, 30);
});

test('heartbeats keep the same roster signature; expiry, first-tab ranks and membership invalidate it', () => {
  const members = new Map([['a', member('A')], ['a2', member('A')], ['b', member('B')]]);
  const view = () => presenceView(members, new Map(), new Map(), 1000, quote);
  const before = view().signature;
  members.get('b').seenAt = 999;
  assert.equal(view().signature, before);
  members.get('a').profile.rank = { tier: 2 };
  assert.notEqual(view().signature, before, 'own quote changes even when the peer-facing last tab stays unchanged');
  const ranked = view().signature;
  members.get('b').seenAt = -24000;
  assert.notEqual(view().signature, ranked);
  const expired = view().signature;
  members.delete('b');
  assert.notEqual(view().signature, expired, 'offline recipients must still be cleaned up');
});

function repository(relative, database) {
  const filename = path.resolve(__dirname, '..', relative), native = createRequire(filename);
  const module = { exports: {} };
  const require = id => id.endsWith('/config') ? { db: { mode: 'postgres' } }
    : id.endsWith('/db/database') ? database : native(id);
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require, module, exports: module.exports, console }, { filename });
  return module.exports;
}

test('all 71 initial tags use one SQL write, retain existing marks and roll back with their caller', async t => {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(`CREATE TABLE StudentStats (StudentID text,Tag text,TotalAttempted integer,TotalCorrect integer,AccuracyRate numeric,PRIMARY KEY(StudentID,Tag));
    INSERT INTO StudentStats VALUES ('QA','existing',3,2,66.67);`);
  let calls = 0;
  const stats = repository('math-app/repositories/stats.repo.js', { getPool() { throw Error('Transaction must own this write'); } });
  const tags = ['existing', ...Array.from({ length: 70 }, (_, i) => 'tag-' + i)];
  await db.transaction(async tx => stats.ensureTagsForStudent('QA', tags,
    { client: { query: (...args) => { calls++; return tx.query(...args); } } }));
  assert.equal(calls, 1);
  assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM StudentStats')).rows[0].n, 71);
  assert.deepEqual((await db.query("SELECT TotalAttempted,TotalCorrect,AccuracyRate::text FROM StudentStats WHERE Tag='existing'")).rows[0],
    { totalattempted: 3, totalcorrect: 2, accuracyrate: '66.67' });
  await assert.rejects(db.transaction(async tx => {
    await stats.ensureTagsForStudent('ROLLBACK', tags, { client: tx });
    throw Error('abort import');
  }), /abort import/);
  assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM StudentStats WHERE StudentID='ROLLBACK'")).rows[0].n, 0);
  await stats.ensureTagsForStudent('EMPTY', [], { client: { query() { throw Error('Empty tags must not query'); } } });
});

test('enrollment writes can finish when every connection in the pool is occupied', async () => {
  let available = 2, initialized = false, nestedReads = 0;
  const waiting = [];
  const acquire = () => new Promise((resolve, reject) => {
    const grant = () => {
      clearTimeout(timer); available--;
      let released = false;
      resolve({
        async query(sql) { await new Promise(resolve => setTimeout(resolve, 1)); return { rows: /SELECT SettingValue/.test(sql) ? [{ value: '2026-27' }] : [], rowCount: 0 }; },
        release() { if (released) return; released = true; available++; waiting.shift()?.(); },
      });
    };
    const timer = setTimeout(() => { const i = waiting.indexOf(grant); if (i >= 0) waiting.splice(i, 1); reject(Error('Pool exhausted by nested acquisition')); }, 1000);
    if (available) grant(); else waiting.push(grant);
  });
  const pool = { async query(sql, args) {
    if (!initialized) return { rows: [], rowCount: 0 };
    nestedReads++;
    const client = await acquire();
    try { return await client.query(sql, args); } finally { client.release(); }
  } };
  const years = repository('math-app/repositories/academic-years.repo.js', { getPool: () => pool });
  await years.ensureSchema(); initialized = true;
  await Promise.all(Array.from({ length: 8 }, async (_, i) => {
    const client = await acquire();
    try { await years.upsertCurrentStudent({ studentId: 'QA' + i, className: 'P1' }, { client }); }
    finally { client.release(); }
  }));
  assert.equal(nestedReads, 0, 'reading the current year must use the supplied transaction');
  assert.equal(available, 2);
});
