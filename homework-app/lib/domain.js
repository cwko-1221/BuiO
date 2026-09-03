'use strict';

const SUBJECTS = Object.freeze([
  { id: 'chinese-a', name: '中文 A組', groupField: 'chinesegroup', group: 'A' },
  { id: 'chinese-b', name: '中文 B組', groupField: 'chinesegroup', group: 'B' },
  { id: 'english-a', name: '英文 A組', groupField: 'englishgroup', group: 'A' },
  { id: 'english-b', name: '英文 B組', groupField: 'englishgroup', group: 'B' },
  { id: 'math-a', name: '數學 A組', groupField: 'mathgroup', group: 'A' },
  { id: 'math-b', name: '數學 B組', groupField: 'mathgroup', group: 'B' },
  { id: 'general-studies', name: '常識', grades: ['P3', 'P6'] },
  { id: 'humanities', name: '人文', grades: ['P1', 'P2', 'P4', 'P5'] },
  { id: 'science', name: '科學', grades: ['P1', 'P2', 'P4', 'P5'] },
  { id: 'visual-arts', name: '視藝' },
  { id: 'music', name: '音樂' },
  { id: 'pe', name: '體育' },
  { id: 'computer', name: '電腦' },
  { id: 'putonghua', name: '普通話' },
]);

const STUDENT_STATUSES = Object.freeze(['complete', 'missing', 'absent']);
// "Made up" is an independent follow-up flag, not a fourth attendance status.
const TEACHER_STATUSES = Object.freeze([...STUDENT_STATUSES]);

function subjectById(id) {
  return SUBJECTS.find(subject => subject.id === String(id || '')) || null;
}

function subjectsForGrade(className) {
  return SUBJECTS.filter(subject => !subject.grades || subject.grades.includes(className));
}

function normalizeGroup(value) {
  const text = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (/^(A|A組|GROUPA)$/.test(text)) return 'A';
  if (/^(B|B組|GROUPB)$/.test(text)) return 'B';
  return '';
}

function studentMatchesSubject(student, className, subjectId) {
  const subject = subjectById(subjectId);
  if (!subject || student.role === 'teacher' || student.classname !== className) return false;
  if (subject.grades && !subject.grades.includes(className)) return false;
  return !subject.groupField || normalizeGroup(student[subject.groupField]) === subject.group;
}

function currentAcademicYear(date = new Date()) {
  const year = date.getFullYear();
  const start = date.getMonth() >= 8 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function academicYears(date = new Date()) {
  const current = Number(currentAcademicYear(date).slice(0, 4));
  return [current - 1, current, current + 1].map(start => `${start}-${String(start + 1).slice(-2)}`);
}

function isAcademicYear(value) {
  const match = String(value || '').match(/^(20\d{2})-(\d{2})$/);
  return Boolean(match && Number(match[2]) === (Number(match[1]) + 1) % 100);
}

function isIsoDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

function todayHongKong(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

module.exports = {
  SUBJECTS, STUDENT_STATUSES, TEACHER_STATUSES,
  subjectById, subjectsForGrade, normalizeGroup, studentMatchesSubject,
  currentAcademicYear, academicYears, isAcademicYear, isIsoDate, todayHongKong,
};
