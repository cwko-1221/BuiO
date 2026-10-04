'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { statusFor, validate } = require('../lib/access-lock.cjs');
const now = Date.parse('2026-10-05T01:00:00Z');
const iso = offset => new Date(now + offset).toISOString();
const rule = (start, end, classes = ['5A']) => ({ academicYear: '2026-27', classes, startsAt: iso(start), endsAt: end === null ? null : iso(end), createdAt: iso(start), note: '上課時間' });

test('locks start inclusively, end exclusively, and cannot leak into another class/year', () => {
  const rules = [rule(0, 60000)];
  assert.equal(statusFor(rules, '2026-27', '5A', now - 1).locked, false);
  assert.equal(statusFor(rules, '2026-27', '5A', now).locked, true);
  assert.equal(statusFor(rules, '2026-27', '5A', now + 59999).locked, true);
  assert.equal(statusFor(rules, '2026-27', '5A', now + 60000).locked, false);
  assert.equal(statusFor(rules, '2026-27', '5B', now).locked, false);
  assert.equal(statusFor(rules, '2027-28', '5A', now).locked, false);
});
test('overlapping and adjacent reservations report the actual continuous unlock time', () => {
  const rules = [rule(-1, 60000), rule(30000, 120000), rule(120000, 180000), rule(240000, 300000)];
  assert.equal(statusFor(rules, '2026-27', '5A', now).endsAt, iso(180000));
  assert.equal(statusFor(rules, '2026-27', '5A', now + 180000).nextChangeAt, iso(240000));
  rules.push(rule(-1, null));
  assert.equal(statusFor(rules, '2026-27', '5A', now).endsAt, null);
});
test('schedule validation requires known classes, timezone, future end, and a bounded note', () => {
  const valid = { action: 'schedule', classes: ['5A', '5A'], startsAt: '2026-10-05T09:01:00+08:00', endsAt: '2026-10-05T09:30:00+08:00', note: ' 數學課 ' };
  assert.deepEqual(validate(valid, ['5A'], now), { action: 'schedule', classes: ['5A'], startsAt: iso(60000), endsAt: iso(1800000), note: '數學課' });
  for (const body of [{ ...valid, classes: ['fake'] }, { ...valid, classes: [] }, { ...valid, classes: ['5A', 5] }, { ...valid, action: 'open' }, { ...valid, startsAt: '2026-10-05T09:01' }, { ...valid, endsAt: null }, { ...valid, endsAt: iso(0) }, { ...valid, startsAt: iso(-120000) }, { ...valid, note: 'x'.repeat(241) }]) assert.throws(() => validate(body, ['5A'], now), { status: 400 });
  assert.equal(validate({ action: 'lock', classes: ['5A'], endsAt: null }, ['5A'], now).endsAt, null);
});

test('repository persists multi-class locks, unlocks only selected classes and isolates new years', async () => {
  const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), { spawnSync } = require('node:child_process');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'buio-access-unit-'));
  const dbFile = path.join(temp, 'db.json');
  fs.writeFileSync(dbFile, JSON.stringify({ users: [{ studentid: 'A', role: 'student', classname: '5A' }, { studentid: 'B', role: 'student', classname: '5B' }] }));
  try {
    process.env.BUIO_JSON_DB_FILE = dbFile; process.env.SUPABASE_DB_URL = '';
    const repo = require('../repositories/access-lock.repo');
    await repo.update('T', { action: 'lock', classes: ['5A', '5B'], note: '上課' });
    assert.equal((await repo.studentStatus('A')).locked, true);
    assert.equal((await repo.studentStatus('B')).locked, true);
    const timed = await repo.update('T', { action: 'lock', classes: ['5A'], endsAt: new Date(Date.now() + 300000).toISOString() });
    assert.ok(timed.classes.find(c => c.name === '5A').endsAt);
    assert.equal(timed.classes.find(c => c.name === '5B').endsAt, null);
    await assert.rejects(() => repo.assertAllowed('A'), { status: 423, code: 'PET_APP_LOCKED' });
    await repo.update('T', { action: 'schedule', classes: ['5A', '5B'], startsAt: new Date(Date.now() + 60000).toISOString(), endsAt: new Date(Date.now() + 120000).toISOString() });
    const unlocked = await repo.update('T', { action: 'unlock', classes: ['5A'] });
    assert.equal(unlocked.classes.find(c => c.name === '5A').locked, false);
    assert.equal(unlocked.classes.find(c => c.name === '5B').locked, true);
    assert.ok(unlocked.rules.every(r => r.classes.length === 1 && r.classes[0] === '5B'));
    const child = spawnSync(process.execPath, ['-e', "require('./pet-app/repositories/access-lock.repo').studentStatus('B').then(s=>process.stdout.write(JSON.stringify(s)))"], { cwd: path.resolve(__dirname, '../..'), env: process.env, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr); assert.equal(JSON.parse(child.stdout).locked, true);
    await repo.cancel(unlocked.rules.find(r => r.kind === 'lock').id);
    assert.equal((await repo.studentStatus('B')).locked, false);
    await repo.update('T', { action: 'lock', classes: ['5B'] });
    await require('../../math-app/repositories/academic-years.repo').promoteAllStudents();
    assert.ok((await repo.teacherSettings()).classes.every(c => !c.locked));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
});
