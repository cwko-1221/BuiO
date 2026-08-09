'use strict';

const crypto = require('crypto');
const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../../math-app/db/database');
const academicYears = require('../../math-app/repositories/academic-years.repo');
const { LEVELS, getWord } = require('../data/curriculum');

let schemaPromise;
async function ensureSchema() {
  if (config.db.mode !== 'postgres') return;
  if (!schemaPromise) schemaPromise = getPool().query(`
    CREATE TABLE IF NOT EXISTS PhonicsAttempts (
      ID UUID PRIMARY KEY,
      AcademicYear VARCHAR(10) NOT NULL,
      StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
      LevelID VARCHAR(60) NOT NULL,
      WordID VARCHAR(60) NOT NULL,
      Correct BOOLEAN NOT NULL,
      Mistakes INTEGER NOT NULL DEFAULT 0,
      Stars INTEGER NOT NULL DEFAULT 1,
      ElapsedMs INTEGER NOT NULL DEFAULT 0,
      CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_phonics_attempt_student_year
      ON PhonicsAttempts(AcademicYear, StudentID, CreatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_phonics_attempt_level
      ON PhonicsAttempts(AcademicYear, LevelID, WordID);
  `).catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}

function jsonAttempts() {
  const data = store.load();
  if (!Array.isArray(data.phonicsAttempts)) {
    data.phonicsAttempts = [];
    store.save();
  }
  return data.phonicsAttempts;
}

function starRating(correct, mistakes) {
  if (!correct) return 0;
  if (mistakes === 0) return 3;
  if (mistakes <= 2) return 2;
  return 1;
}

async function recordAttempt({ academicYear, studentId, wordId, correct, mistakes, elapsedMs }) {
  await ensureSchema();
  const entry = getWord(wordId);
  if (!entry) throw Object.assign(new Error('找不到這個 Phonics 單字'), { statusCode: 400 });
  const normalizedMistakes = Math.max(0, Math.min(99, Number(mistakes) || 0));
  const normalizedElapsed = Math.max(0, Math.min(30 * 60 * 1000, Number(elapsedMs) || 0));
  const attempt = {
    id: crypto.randomUUID(), academicYear, studentId,
    levelId: entry.levelId, wordId: entry.id, correct: Boolean(correct),
    mistakes: normalizedMistakes,
    stars: starRating(Boolean(correct), normalizedMistakes),
    elapsedMs: normalizedElapsed,
    createdAt: new Date().toISOString(),
  };
  if (config.db.mode === 'postgres') {
    await getPool().query(`INSERT INTO PhonicsAttempts
      (ID, AcademicYear, StudentID, LevelID, WordID, Correct, Mistakes, Stars, ElapsedMs, CreatedAt)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [
      attempt.id, attempt.academicYear, attempt.studentId, attempt.levelId,
      attempt.wordId, attempt.correct, attempt.mistakes, attempt.stars,
      attempt.elapsedMs, attempt.createdAt,
    ]);
  } else {
    jsonAttempts().push(attempt);
    store.save();
  }
  return attempt;
}

async function listAttempts(academicYear, studentIds = null) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const params = [academicYear];
    let filter = '';
    if (studentIds) {
      params.push(studentIds);
      filter = ' AND StudentID=ANY($2::text[])';
    }
    const { rows } = await getPool().query(`SELECT
      ID AS id, AcademicYear AS "academicYear", StudentID AS "studentId",
      LevelID AS "levelId", WordID AS "wordId", Correct AS correct,
      Mistakes AS mistakes, Stars AS stars, ElapsedMs AS "elapsedMs",
      CreatedAt AS "createdAt"
      FROM PhonicsAttempts WHERE AcademicYear=$1${filter} ORDER BY CreatedAt DESC`, params);
    return rows.map(row => ({ ...row, mistakes: Number(row.mistakes), stars: Number(row.stars), elapsedMs: Number(row.elapsedMs) }));
  }
  return jsonAttempts()
    .filter(item => item.academicYear === academicYear && (!studentIds || studentIds.includes(item.studentId)))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function summarizeStudent(attempts) {
  const byWord = {};
  for (const attempt of attempts) {
    const current = byWord[attempt.wordId] || {
      wordId: attempt.wordId, attempts: 0, correctAttempts: 0,
      bestStars: 0, lastAttemptAt: null,
    };
    current.attempts += 1;
    if (attempt.correct) current.correctAttempts += 1;
    current.bestStars = Math.max(current.bestStars, attempt.stars || 0);
    if (!current.lastAttemptAt || attempt.createdAt > current.lastAttemptAt) current.lastAttemptAt = attempt.createdAt;
    byWord[attempt.wordId] = current;
  }
  const levels = LEVELS.map(level => {
    const words = level.words.map(entry => byWord[entry.id] || {
      wordId: entry.id, attempts: 0, correctAttempts: 0, bestStars: 0, lastAttemptAt: null,
    });
    const mastered = words.filter(item => item.bestStars >= 2).length;
    return {
      levelId: level.id, wordCount: words.length, mastered,
      stars: words.reduce((sum, item) => sum + item.bestStars, 0), words,
    };
  });
  return {
    attempts: attempts.length,
    correctAttempts: attempts.filter(item => item.correct).length,
    masteredWords: Object.values(byWord).filter(item => item.bestStars >= 2).length,
    totalWords: LEVELS.reduce((sum, level) => sum + level.words.length, 0),
    totalStars: Object.values(byWord).reduce((sum, item) => sum + item.bestStars, 0),
    lastAttemptAt: attempts[0]?.createdAt || null,
    levels,
  };
}

async function studentProgress({ academicYear, studentId }) {
  return summarizeStudent(await listAttempts(academicYear, [studentId]));
}

async function teacherSummary({ academicYear, className = '' }) {
  const enrollments = (await academicYears.listEnrollments(academicYear))
    .filter(row => row.role !== 'teacher' && (!className || row.className === className));
  const attempts = await listAttempts(academicYear, enrollments.map(row => row.studentId));
  const grouped = new Map(enrollments.map(row => [row.studentId, []]));
  for (const attempt of attempts) grouped.get(attempt.studentId)?.push(attempt);
  return enrollments.map(row => ({
    id: row.studentId, name: row.name, className: row.className,
    classNo: row.classNo, ...summarizeStudent(grouped.get(row.studentId) || []),
  })).sort((a, b) => (a.className || '').localeCompare(b.className || '') || (a.classNo || 999) - (b.classNo || 999));
}

module.exports = { ensureSchema, recordAttempt, studentProgress, teacherSummary, starRating };
