import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countMatchedStudents,
  getAudienceGroupNames,
  matchesAudienceRules,
  normalizeAudienceRules,
} from './classroom-audience-editor.mjs';

const roster = {
  classes: ['P1', 'P2'],
  students: [
    { studentId: '1', name: 'One', className: 'P1', chineseGroup: 'A', englishGroup: 'B', mathGroup: '1' },
    { studentId: '2', name: 'Two', className: 'P1', chineseGroup: 'B', englishGroup: 'A', mathGroup: '2' },
    { studentId: '3', name: 'Three', className: 'P2', chineseGroup: 'A', englishGroup: 'B', mathGroup: '1' },
    { studentId: '4', name: 'Four', className: 'P2', chineseGroup: 'C', englishGroup: 'A', mathGroup: '2' },
    { studentId: '5', name: 'Ungrouped', className: 'P2', chineseGroup: '', englishGroup: ' ', mathGroup: null },
    { studentId: '6', name: 'No class', className: '', chineseGroup: 'A', englishGroup: '', mathGroup: '' },
  ],
};
const range = (classNames = [], groupField = '', groupNames = []) => ({ classNames, groupField, groupNames });

test('no rules and an empty range both include all students', () => {
  assert.equal(countMatchedStudents(roster), 6);
  assert.equal(countMatchedStudents(roster, [range()]), 6);
  assert.equal(countMatchedStudents(roster, [range(['P1']), range()]), 6);
  assert.equal(countMatchedStudents({ students: [] }, []), 0);
  assert.equal(countMatchedStudents(undefined), 0);
});

test('multiple ranges use OR and each range uses class AND group', () => {
  const rules = [range(['P1'], 'chineseGroup', ['A']), range(['P2'], 'englishGroup', ['B'])];
  assert.equal(countMatchedStudents(roster, rules), 2);
  assert.deepEqual(roster.students.map((student) => matchesAudienceRules(student, rules)),
    [true, false, true, false, false, false]);
});

test('overlapping ranges count a matching student only once', () => {
  assert.equal(countMatchedStudents(roster, [range(['P1']), range([], 'chineseGroup', ['A'])]), 4);
});

test('empty class selection covers every class and students without a class', () => {
  assert.equal(countMatchedStudents(roster, [range([], 'chineseGroup', ['A'])]), 3);
  assert.equal(countMatchedStudents(roster, [range(['P1', 'P2'])]), 5);
});

test('subject without selected groups includes ungrouped students in its classes', () => {
  for (const subject of ['chineseGroup', 'englishGroup', 'mathGroup']) {
    assert.equal(countMatchedStudents(roster, [range(['P2'], subject)]), 3);
    assert.equal(countMatchedStudents(roster, [range([], subject)]), 6);
  }
});

test('multiple classes and group labels are multi-select unions within a range', () => {
  assert.equal(countMatchedStudents(roster, [range(['P1', 'P2'], 'chineseGroup', ['A', 'B'])]), 3);
  assert.equal(countMatchedStudents(roster, [range(['P1'], 'mathGroup', ['2'])]), 1);
  assert.equal(countMatchedStudents(roster, [range(['missing'], 'chineseGroup', ['A'])]), 0);
  assert.equal(countMatchedStudents(roster, [range(['P1'], 'chineseGroup', ['missing'])]), 0);
});

test('group choices use only nonempty labels in the selected classes and subject', () => {
  assert.deepEqual(getAudienceGroupNames(roster, range(['P1'], 'chineseGroup')), ['A', 'B']);
  assert.deepEqual(getAudienceGroupNames(roster, range(['P2'], 'chineseGroup')), ['A', 'C']);
  assert.deepEqual(getAudienceGroupNames(roster, range([], 'chineseGroup')), ['A', 'B', 'C']);
  assert.deepEqual(getAudienceGroupNames(roster, range(['P2'], 'englishGroup')), ['B', 'A']);
  assert.deepEqual(getAudienceGroupNames(roster, range(['missing'], 'chineseGroup')), []);
  assert.deepEqual(getAudienceGroupNames(roster, range(['P1'])), []);
});

test('normalization copies, deduplicates, trims, and discards invalid subject groups', () => {
  const input = [range([' P1 ', 'P1', '', null], 'chineseGroup', [' A ', 'A', ' ']),
    range(['P2'], 'name', ['ignored']), null];
  const normalized = normalizeAudienceRules(input);
  assert.deepEqual(normalized, [range(['P1'], 'chineseGroup', ['A']), range(['P2']), range()]);
  normalized[0].classNames.push('P2');
  normalized[0].groupNames.push('B');
  assert.deepEqual(input[0].classNames, [' P1 ', 'P1', '', null]);
  assert.deepEqual(input[0].groupNames, [' A ', 'A', ' ']);
  assert.deepEqual(normalizeAudienceRules(null), []);
});

test('untrusted labels remain literal values when matching', () => {
  const className = '<img src=x onerror=alert(1)> & "P1"';
  const groupName = '<script>alert(1)</script>';
  const untrusted = { students: [{ className, chineseGroup: groupName }] };
  const rules = [range([className], 'chineseGroup', [groupName])];
  assert.equal(countMatchedStudents(untrusted, rules), 1);
  assert.deepEqual(getAudienceGroupNames(untrusted, rules[0]), [groupName]);
});
