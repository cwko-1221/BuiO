'use strict';

const STUDENT_ID_RE = /^[A-Z0-9_-]{1,20}$/;

function normalizeStudentId(value) {
  return String(value ?? '').trim().toUpperCase();
}

function isValidStudentId(id) {
  return STUDENT_ID_RE.test(id);
}

function normalizeClassNo(value) {
  if (value === '' || value == null) return null;
  return Number(value);
}

function isValidClassNo(n) {
  if (n === null) return true;
  return Number.isInteger(n) && n >= 1 && n <= 99;
}

function isSupportedLanguage(lang) {
  return ['zh-HK', 'en-US'].includes(lang);
}

module.exports = {
  STUDENT_ID_RE,
  normalizeStudentId,
  isValidStudentId,
  normalizeClassNo,
  isValidClassNo,
  isSupportedLanguage,
};
