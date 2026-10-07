'use strict';

const years = require('../math-app/repositories/academic-years.repo');
const SUBJECTS = { chineseGroup: '中文', englishGroup: '英文', mathGroup: '數學' };
const invalid = () => { throw Object.assign(new Error('課堂可見範圍設定不正確。'), { status: 400 }); };

function names(value = []) {
  if (!Array.isArray(value) || value.length > 50) invalid();
  if (value.some(name => typeof name !== 'string' || name.length > 80)) invalid();
  return [...new Set(value.map(name => name.trim()).filter(Boolean))];
}

function normalizeRules(input = []) {
  if (!Array.isArray(input) || input.length > 20) invalid();
  const rules = input.map(rule => {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) invalid();
    const groupField = rule.groupField ?? '';
    if (typeof groupField !== 'string') invalid();
    if (groupField && !Object.hasOwn(SUBJECTS, groupField)) invalid();
    const groupNames = names(rule.groupNames);
    if (groupNames.length && !groupField) invalid();
    return { classNames: names(rule.classNames), groupField, groupNames };
  });
  // One unrestricted OR branch makes the whole audience unrestricted.
  return rules.some(rule => !rule.classNames.length && !rule.groupNames.length) ? [] : rules;
}

function matchesRules(student, rules = []) {
  if (!rules.length) return true;
  if (!student) return false;
  return rules.some(rule => (!rule.classNames.length || rule.classNames.includes(String(student.className || '').trim()))
    && (!rule.groupNames.length || rule.groupNames.includes(String(student[rule.groupField] || '').trim())));
}

function describeRules(rules = []) {
  if (!rules.length) return '所有學生';
  return rules.map(rule => [
    rule.classNames.length ? rule.classNames.join('、') : '所有班級',
    rule.groupField ? `${SUBJECTS[rule.groupField]} ${rule.groupNames.length ? rule.groupNames.join('、') : '全部組別'}` : '',
  ].filter(Boolean).join(' · ')).join(' / ');
}

async function roster() {
  const academicYear = await years.getCurrentAcademicYear();
  const students = (await years.listEnrollments(academicYear)).filter(row => row.role !== 'teacher');
  return { academicYear, students, classes: [...new Set(students.map(row => row.className).filter(Boolean))].sort() };
}

module.exports = { normalizeRules, matchesRules, describeRules, roster };
