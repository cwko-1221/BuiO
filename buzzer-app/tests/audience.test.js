'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const audience = require('../../shared/classroom-audience');

const teacher = { studentId: 'T1', role: 'teacher' };
const student = studentId => ({ studentId, role: 'student' });
const students = [
  { studentId: 'S1', name: '學生一', className: '5A', chineseGroup: 'A', englishGroup: 'B', mathGroup: 'A' },
  { studentId: 'S2', name: '學生二', className: '5B', chineseGroup: 'B', englishGroup: 'A', mathGroup: 'B' },
  { studentId: 'S3', name: '學生三', className: '6A', chineseGroup: 'C', englishGroup: 'C', mathGroup: 'A' },
  { studentId: 'S4', name: '學生四', className: '5A', chineseGroup: 'C', englishGroup: 'C', mathGroup: 'B' },
];

function load(filename, dependencies) {
  const source = fs.readFileSync(filename, 'utf8');
  const module = { exports: {} };
  vm.runInThisContext(`(function(require, module, exports) {\n${source}\n})`, { filename })(
    id => Object.hasOwn(dependencies, id) ? dependencies[id] : require(id), module, module.exports);
  return module.exports;
}

function fixture(initialStudents = students) {
  const data = { buzzerSessions: [], petWallets: [], petCurrencyLedger: [] };
  const currentStudents = structuredClone(initialStudents);
  const accounts = new Map(currentStudents.map(row => [row.studentId, { name: row.name, role: 'student' }]));
  accounts.set('T1', { name: '老師', role: 'teacher' });
  const lookups = [];
  const repo = load(path.resolve(__dirname, '../repository.js'), {
    '../config': { db: { mode: 'json' } },
    '../db/jsonStore': { load: () => data, save: () => {} },
    '../math-app/db/database': {},
    '../shared/classroom-audience': { ...audience, roster: async () => ({
      academicYear: '2026-27', students: currentStudents, classes: [...new Set(currentStudents.map(row => row.className))],
    }) },
    '../math-app/repositories/users.repo': { findByIdSummary: async id => { lookups.push(id); return accounts.get(id); } },
    '../pet-app/repositories/pet.repo': {
      ensureSchema: async () => {},
      ensureStudent: async id => {
        if (!data.petWallets.some(row => row.studentId === id)) data.petWallets.push({ studentId: id, balance: 0 });
      },
    },
  });
  return { repo, data, currentStudents, accounts, lookups };
}

test('default and explicitly unbounded rooms admit students added after creation', async () => {
  for (const body of [{ points: 10 }, { points: 10, audienceRules: [] }, {
    points: 10, audienceRules: [{ classNames: [], groupField: 'englishGroup', groupNames: [] }],
  }]) {
    const { repo, data, accounts, lookups } = fixture();
    const room = await repo.create(teacher, body);
    assert.deepEqual(room.audienceRules, []);
    assert.equal(room.targetLabel, audience.describeRules([]));
    accounts.set('LATE', { name: '後加入的學生', role: 'student' });
    const late = student('LATE');
    assert.equal((await repo.sessions(late))[0].id, room.id);
    assert.equal((await repo.get(room.id, late)).me, null);
    assert.equal(Object.hasOwn(await repo.get(room.id, late), 'audienceRules'), false);
    const joined = await repo.action(room.id, late, { action: 'join', name: '偽造姓名' });
    assert.deepEqual(joined.me, { studentId: 'LATE', name: '後加入的學生', successes: 0, score: 0 });
    assert.ok(lookups.includes('LATE'));
    assert.ok(!data.buzzerSessions[0].eligible.some(row => row.studentId === 'LATE'));
    await repo.action(room.id, late, { action: 'join' });
    assert.equal((await repo.get(room.id, teacher)).participantCount, 1);
    assert.throws(() => repo.view(data.buzzerSessions[0], { studentId: 'T2', role: 'teacher' }), { status: 403 });
    assert.throws(() => repo.view(data.buzzerSessions[0], { studentId: 'X', role: 'guest' }), { status: 403 });
  }
});

test('an unrestricted room can start with an empty roster', async () => {
  const { repo, accounts } = fixture([]);
  const room = await repo.create(teacher, { audienceRules: [], points: 10 });
  accounts.set('LATE', { name: '新同學', role: 'student' });
  assert.equal((await repo.action(room.id, student('LATE'), { action: 'join' })).me.name, '新同學');
  await repo.action(room.id, teacher, { action: 'end' });
  assert.deepEqual(await repo.sessions(student('LATE')), []);
});

test('multiple classes and groups use OR across subjects and AND within each rule', async () => {
  const { repo, data, currentStudents } = fixture();
  const rules = [
    { classNames: [' 5A ', '5B', '5A'], groupField: 'chineseGroup', groupNames: ['A', 'B'] },
    { classNames: [], groupField: 'mathGroup', groupNames: ['A'] },
  ];
  const room = await repo.create(teacher, { audienceRules: rules, points: 20 });
  assert.deepEqual(room.audienceRules, audience.normalizeRules(rules));
  assert.equal(room.targetLabel, audience.describeRules(room.audienceRules));
  assert.deepEqual(data.buzzerSessions[0].eligible.map(row => row.studentId), ['S1', 'S2', 'S3']);
  for (const id of ['S1', 'S2', 'S3']) assert.equal((await repo.sessions(student(id)))[0].id, room.id);
  const outsider = student('S4');
  assert.deepEqual(await repo.sessions(outsider), []);
  await assert.rejects(repo.get(room.id, outsider), { status: 403 });
  assert.throws(() => repo.view(data.buzzerSessions[0], outsider), { status: 403 }, 'SSE uses the same authorized view');
  for (const action of ['join', 'ready', 'armed', 'buzz', 'start', 'judge', 'cancel', 'end']) {
    await assert.rejects(repo.action(room.id, outsider, { action, round: 1 }), { status: 403 });
  }
  // Eligibility is the creation-time roster snapshot, even if a matching enrollment is added later.
  currentStudents.push({ studentId: 'NEW', name: '新同學', className: '5A', chineseGroup: 'A' });
  await assert.rejects(repo.action(room.id, student('NEW'), { action: 'join' }), { status: 403 });
  currentStudents[0].className = '9Z'; currentStudents[0].chineseGroup = 'Z'; currentStudents[0].mathGroup = 'Z';
  assert.equal((await repo.action(room.id, student('S1'), { action: 'join' })).me.name, '學生一');
  await repo.action(room.id, teacher, { action: 'start', round: 0 });
  await repo.interrupt(room.id, outsider, 1);
  assert.equal((await repo.get(room.id, teacher)).phase, 'preparing');
});

test('class-only and group-only rules accept all groups and all classes respectively', async () => {
  for (const [rules, expected] of [
    [[{ classNames: ['5A', '5B'], groupField: 'englishGroup', groupNames: [] }], ['S1', 'S2', 'S4']],
    [[{ classNames: [], groupField: 'englishGroup', groupNames: ['A', 'B'] }], ['S1', 'S2']],
  ]) {
    const { repo, data } = fixture();
    await repo.create(teacher, { audienceRules: rules, points: 10 });
    assert.deepEqual(data.buzzerSessions[0].eligible.map(row => row.studentId), expected);
  }
});

test('legacy create bodies convert only when audienceRules is omitted', async () => {
  for (const [body, expected] of [
    [{ className: '5A', points: 10 }, ['S1', 'S4']],
    [{ className: '5A', groupField: 'chineseGroup', groupName: 'A', points: 10 }, ['S1']],
    [{ className: '5A', groupField: '__proto__', groupName: 'bad', audienceRules: [], points: 10 }, ['S1', 'S2', 'S3', 'S4']],
  ]) {
    const { repo, data } = fixture();
    const room = await repo.create(teacher, body);
    assert.ok(Array.isArray(room.audienceRules));
    assert.deepEqual(data.buzzerSessions[0].eligible.map(row => row.studentId), expected);
  }
  for (const body of [
    { className: '5A', groupField: 'mathGroup' },
    { className: '5A', groupField: '__proto__', groupName: 'A' },
    { className: 'missing' },
    { audienceRules: [{ classNames: ['missing'] }] },
    { audienceRules: null },
    { audienceRules: [{ groupField: 'not-a-subject', groupNames: ['A'] }] },
    { audienceRules: [{ classNames: '5A' }] },
  ]) await assert.rejects(fixture().repo.create(teacher, { ...body, points: 10 }), { status: 400 });
});

test('saved sessions without audienceRules retain their exact eligible access', async () => {
  const { repo, data } = fixture();
  const room = await repo.create(teacher, { className: '5A', points: 10 });
  delete data.buzzerSessions[0].audienceRules;
  assert.equal(Object.hasOwn(await repo.get(room.id, teacher), 'audienceRules'), false);
  assert.equal((await repo.sessions(student('S1')))[0].id, room.id);
  assert.deepEqual(await repo.sessions(student('S2')), []);
  await assert.rejects(repo.action(room.id, student('S2'), { action: 'join' }), { status: 403 });
  assert.equal((await repo.action(room.id, student('S1'), { action: 'join' })).me.name, '學生一');
  assert.equal(Object.hasOwn(await repo.create(teacher, { audienceRules: [], points: 10 }), 'audienceRules'), false);
});

test('late students preserve readiness barriers, first-buzz exclusivity and exactly-once pet rewards', async () => {
  const { repo, data, accounts } = fixture();
  const room = await repo.create(teacher, { points: 10 });
  const first = student('S1'), late = student('LATE');
  accounts.set('LATE', { name: '新同學', role: 'student' });
  await repo.action(room.id, first, { action: 'join' });
  await repo.action(room.id, late, { action: 'join' });
  await repo.action(room.id, teacher, { action: 'start', round: 0 });
  const ready = { action: 'ready', round: 1, visible: true, clockReady: true, rtt: 20 };
  await repo.action(room.id, first, ready);
  assert.equal((await repo.get(room.id, teacher)).phase, 'preparing');
  const scheduled = await repo.action(room.id, late, ready);
  assert.equal(scheduled.opensAt - scheduled.countdownAt, 3000);
  await repo.action(room.id, first, { action: 'armed', round: 1 });
  assert.equal((await repo.get(room.id, teacher)).phase, 'scheduled');
  await repo.action(room.id, late, { action: 'armed', round: 1 });
  await assert.rejects(repo.action(room.id, late, { action: 'buzz', round: 1 }), { status: 409 });
  data.buzzerSessions[0].opensAt = Date.now() - 1;
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => repo.action(room.id, late, { action: 'buzz', round: 1 })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await repo.get(room.id, teacher)).winner.name, '新同學');
  for (let i = 0; i < 3; i++) await repo.action(room.id, teacher, { action: 'judge', round: 1, correct: true });
  assert.equal(data.petWallets.find(row => row.studentId === 'LATE').balance, 10);
  assert.equal(data.petCurrencyLedger.length, 1);
  assert.equal((await repo.get(room.id, late)).me.score, 10);
});

test('HTTP listing, direct access, actions and SSE enforce the same restricted audience', async t => {
  const express = require('express');
  const { repo } = fixture();
  const room = await repo.create(teacher, { audienceRules: [{ classNames: ['5A'], groupField: 'chineseGroup', groupNames: ['A'] }], points: 10 });
  const router = load(path.resolve(__dirname, '../routes.js'), {
    './repository': repo,
    '../config': { db: { mode: 'json' } },
    '../math-app/middleware/auth': require('../../math-app/middleware/auth'),
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { if (req.headers['x-student-id']) req.session = student(req.headers['x-student-id']); next(); });
  app.use('/api/buzzer', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/buzzer`;
  assert.equal((await fetch(`${base}/sessions`)).status, 401);
  const headers = { 'x-student-id': 'S2', 'Content-Type': 'application/json' };
  assert.deepEqual((await (await fetch(`${base}/sessions`, { headers })).json()).sessions, []);
  for (const suffix of ['', '/events']) assert.equal((await fetch(`${base}/sessions/${room.id}${suffix}`, { headers })).status, 403);
  for (const action of ['join', 'unready', 'ready', 'armed', 'buzz']) {
    assert.equal((await fetch(`${base}/sessions/${room.id}/actions`, {
      method: 'POST', headers, body: JSON.stringify({ action, round: 1 }),
    })).status, 403);
  }
  const controller = new AbortController();
  const stream = await fetch(`${base}/sessions/${room.id}/events`, { headers: { 'x-student-id': 'S1' }, signal: controller.signal });
  assert.equal(stream.status, 200);
  const { value } = await stream.body.getReader().read();
  assert.match(Buffer.from(value).toString(), /data: .*"id"/);
  controller.abort();
});
