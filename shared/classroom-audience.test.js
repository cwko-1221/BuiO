const assert = require('node:assert/strict');
const { test } = require('node:test');
const { normalizeRules, matchesRules, describeRules } = require('./classroom-audience');

const p1a = { className: 'P1', chineseGroup: 'A', englishGroup: 'B', mathGroup: 'C' };
const p2b = { className: 'P2', chineseGroup: 'B', englishGroup: 'B', mathGroup: 'A' };

test('unset scope remains visible to all students, including ungrouped accounts', () => {
  assert.deepEqual(normalizeRules(), []);
  assert.equal(matchesRules(null, []), true);
  assert.equal(describeRules([]), '所有學生');
  assert.deepEqual(normalizeRules([{ classNames: ['P1'] }, {}]), []);
});

test('multiple classes combine with the selected subject groups, not a different subject', () => {
  const rules = normalizeRules([{ classNames: ['P1', 'P2'], groupField: 'chineseGroup', groupNames: ['A'] }]);
  assert.equal(matchesRules(p1a, rules), true);
  assert.equal(matchesRules(p2b, rules), false);
  assert.equal(matchesRules(null, rules), false);
  assert.match(describeRules(rules), /中文 A/);
});

test('alternative ranges allow class/group combinations without widening other classes', () => {
  const rules = normalizeRules([
    { classNames: ['P1'], groupField: 'chineseGroup', groupNames: ['A'] },
    { classNames: ['P2'], groupField: 'englishGroup', groupNames: ['B'] },
  ]);
  assert.equal(matchesRules(p1a, rules), true);
  assert.equal(matchesRules(p2b, rules), true);
  assert.equal(matchesRules({ ...p1a, className: 'P3' }, rules), false);
  assert.equal(matchesRules({ ...p1a, chineseGroup: 'C' }, rules), false);
});

test('class-only and group-only ranges work, and malformed restrictions do not become public', () => {
  assert.equal(matchesRules(p1a, normalizeRules([{ classNames: ['P1'] }])), true);
  assert.equal(matchesRules(p2b, normalizeRules([{ groupField: 'mathGroup', groupNames: ['A'] }])), true);
  assert.throws(() => normalizeRules([{ classNames: 'P1' }]), { status: 400 });
  assert.throws(() => normalizeRules([{ groupField: 'scienceGroup' }]), { status: 400 });
  assert.throws(() => normalizeRules([{ groupNames: ['A'] }]), { status: 400 });
});
