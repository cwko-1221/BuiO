'use strict';

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../db/database');

const INITIAL_ACADEMIC_YEAR = '2025-26';

function nextAcademicYear(value) {
  const start = Number(String(value || '').slice(0, 4));
  if (!Number.isInteger(start)) throw new Error('Invalid academic year');
  return `${start + 1}-${String(start + 2).slice(-2)}`;
}

function snapshotFromUser(user, academicYear) {
  return {
    academicYear,
    studentId: user.studentid,
    className: user.classname || '',
    classNo: user.classno == null ? null : Number(user.classno),
    chineseGroup: user.chinesegroup || '',
    englishGroup: user.englishgroup || '',
    mathGroup: user.mathgroup || '',
  };
}

let schemaPromise;
async function ensureSchema() {
  if (config.db.mode !== 'postgres') return;
  if (!schemaPromise) schemaPromise = (async () => {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS PlatformSettings (
        SettingKey VARCHAR(80) PRIMARY KEY,
        SettingValue TEXT NOT NULL,
        UpdatedAt TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS StudentAcademicYears (
        AcademicYear VARCHAR(10) NOT NULL,
        StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
        ClassName VARCHAR(20) NOT NULL DEFAULT '',
        ClassNo INTEGER,
        ChineseGroup VARCHAR(20) NOT NULL DEFAULT '',
        EnglishGroup VARCHAR(20) NOT NULL DEFAULT '',
        MathGroup VARCHAR(20) NOT NULL DEFAULT '',
        CreatedAt TIMESTAMPTZ DEFAULT NOW(),
        UpdatedAt TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (AcademicYear, StudentID)
      );
      CREATE INDEX IF NOT EXISTS idx_student_academic_year_class
        ON StudentAcademicYears(AcademicYear, ClassName, ClassNo);
    `);
    const initialized = await pool.query(`INSERT INTO PlatformSettings (SettingKey, SettingValue)
      VALUES ('currentAcademicYear', $1) ON CONFLICT (SettingKey) DO NOTHING
      RETURNING SettingKey`, [INITIAL_ACADEMIC_YEAR]);
    if (initialized.rowCount > 0) {
      await pool.query(`INSERT INTO StudentAcademicYears
        (AcademicYear, StudentID, ClassName, ClassNo, ChineseGroup, EnglishGroup, MathGroup)
        SELECT $1, StudentID, COALESCE(ClassName, ''), ClassNo,
          COALESCE(ChineseGroup, ''), COALESCE(EnglishGroup, ''), COALESCE(MathGroup, '')
        FROM Users WHERE Role <> 'teacher'
        ON CONFLICT (AcademicYear, StudentID) DO NOTHING`, [INITIAL_ACADEMIC_YEAR]);
    }
  })().catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}

function ensureJsonData() {
  const data = store.load();
  let changed = false;
  if (!data.platformSettings || typeof data.platformSettings !== 'object') {
    data.platformSettings = { currentAcademicYear: INITIAL_ACADEMIC_YEAR };
    changed = true;
  }
  if (!data.platformSettings.currentAcademicYear) {
    data.platformSettings.currentAcademicYear = INITIAL_ACADEMIC_YEAR;
    changed = true;
  }
  if (!Array.isArray(data.studentAcademicYears)) {
    data.studentAcademicYears = [];
    changed = true;
  }
  if (data.platformSettings.currentAcademicYear === INITIAL_ACADEMIC_YEAR) {
    const existing = new Set(data.studentAcademicYears.map(row => `${row.academicYear}:${row.studentId}`));
    for (const user of data.users) {
      if (user.role === 'teacher') continue;
      const key = `${INITIAL_ACADEMIC_YEAR}:${user.studentid}`;
      if (!existing.has(key)) {
        data.studentAcademicYears.push(snapshotFromUser(user, INITIAL_ACADEMIC_YEAR));
        changed = true;
      }
    }
  }
  if (changed) store.save();
  return data;
}

async function getCurrentAcademicYear() {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(
      `SELECT SettingValue AS value FROM PlatformSettings WHERE SettingKey='currentAcademicYear'`
    );
    return rows[0]?.value || INITIAL_ACADEMIC_YEAR;
  }
  return ensureJsonData().platformSettings.currentAcademicYear;
}

async function listAcademicYears() {
  await ensureSchema();
  const current = await getCurrentAcademicYear();
  let years;
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query('SELECT DISTINCT AcademicYear AS year FROM StudentAcademicYears');
    years = rows.map(row => row.year);
  } else {
    years = ensureJsonData().studentAcademicYears.map(row => row.academicYear);
  }
  return [...new Set([...years, current])].sort().reverse();
}

async function listEnrollments(academicYear) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT e.AcademicYear AS "academicYear", e.StudentID AS "studentId",
        u.Name AS name, u.Role AS role, e.ClassName AS "className", e.ClassNo AS "classNo",
        e.ChineseGroup AS "chineseGroup", e.EnglishGroup AS "englishGroup", e.MathGroup AS "mathGroup"
      FROM StudentAcademicYears e JOIN Users u ON u.StudentID=e.StudentID
      WHERE e.AcademicYear=$1 ORDER BY COALESCE(e.ClassNo, 999), e.StudentID`, [academicYear]);
    return rows.map(row => ({ ...row, classNo: row.classNo == null ? null : Number(row.classNo) }));
  }
  const data = ensureJsonData();
  const names = new Map(data.users.map(user => [user.studentid, user]));
  return data.studentAcademicYears.filter(row => row.academicYear === academicYear).map(row => ({
    ...row,
    name: names.get(row.studentId)?.name || row.studentId,
    role: names.get(row.studentId)?.role || 'student',
  }));
}

async function findEnrollment(academicYear, studentId) {
  return (await listEnrollments(academicYear)).find(row => row.studentId === studentId) || null;
}

async function upsertCurrentStudent(user, opts = {}) {
  await ensureSchema();
  const academicYear = await getCurrentAcademicYear();
  if (config.db.mode === 'postgres') {
    const runner = opts.client || getPool();
    await runner.query(`INSERT INTO StudentAcademicYears
      (AcademicYear, StudentID, ClassName, ClassNo, ChineseGroup, EnglishGroup, MathGroup)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (AcademicYear, StudentID) DO UPDATE SET
        ClassName=EXCLUDED.ClassName, ClassNo=EXCLUDED.ClassNo,
        ChineseGroup=EXCLUDED.ChineseGroup, EnglishGroup=EXCLUDED.EnglishGroup,
        MathGroup=EXCLUDED.MathGroup, UpdatedAt=NOW()`, [
      academicYear, user.studentId, user.className || '', user.classNo,
      user.chineseGroup || '', user.englishGroup || '', user.mathGroup || '',
    ]);
    return;
  }
  const data = ensureJsonData();
  const snapshot = {
    academicYear, studentId: user.studentId, className: user.className || '', classNo: user.classNo,
    chineseGroup: user.chineseGroup || '', englishGroup: user.englishGroup || '', mathGroup: user.mathGroup || '',
  };
  const index = data.studentAcademicYears.findIndex(row => row.academicYear === academicYear && row.studentId === user.studentId);
  if (index >= 0) data.studentAcademicYears[index] = snapshot;
  else data.studentAcademicYears.push(snapshot);
  store.save();
}

async function updateCurrentEnrollment(studentId, field, value) {
  const allowed = {
    className: 'ClassName', classNo: 'ClassNo', chineseGroup: 'ChineseGroup',
    englishGroup: 'EnglishGroup', mathGroup: 'MathGroup',
  };
  const column = allowed[field];
  if (!column) return;
  const academicYear = await getCurrentAcademicYear();
  if (config.db.mode === 'postgres') {
    await getPool().query(`UPDATE StudentAcademicYears SET ${column}=$1, UpdatedAt=NOW()
      WHERE AcademicYear=$2 AND StudentID=$3`, [value, academicYear, studentId]);
    return;
  }
  const data = ensureJsonData();
  const row = data.studentAcademicYears.find(item => item.academicYear === academicYear && item.studentId === studentId);
  if (row) { row[field] = value; store.save(); }
}

async function promoteAllStudents() {
  await ensureSchema();
  const current = await getCurrentAcademicYear();
  const next = nextAcademicYear(current);
  if (config.db.mode === 'postgres') {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE Users SET ClassName=CASE
        WHEN ClassName='P6' THEN 'Graduated'
        WHEN ClassName ~ '^P[1-5]$' THEN 'P' || (SUBSTRING(ClassName FROM 2)::int + 1)::text
        ELSE ClassName END WHERE Role='student'`);
      await client.query(`INSERT INTO StudentAcademicYears
        (AcademicYear, StudentID, ClassName, ClassNo, ChineseGroup, EnglishGroup, MathGroup)
        SELECT $1, StudentID, COALESCE(ClassName, ''), ClassNo,
          COALESCE(ChineseGroup, ''), COALESCE(EnglishGroup, ''), COALESCE(MathGroup, '')
        FROM Users WHERE Role <> 'teacher'
        ON CONFLICT (AcademicYear, StudentID) DO NOTHING`, [next]);
      await client.query(`UPDATE PlatformSettings SET SettingValue=$1, UpdatedAt=NOW()
        WHERE SettingKey='currentAcademicYear'`, [next]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  } else {
    const data = ensureJsonData();
    for (const user of data.users) {
      if (user.role !== 'student') continue;
      if (user.classname === 'P6') user.classname = 'Graduated';
      else if (/^P[1-5]$/.test(user.classname || '')) user.classname = `P${Number(user.classname.slice(1)) + 1}`;
      const keyExists = data.studentAcademicYears.some(row => row.academicYear === next && row.studentId === user.studentid);
      if (!keyExists) data.studentAcademicYears.push(snapshotFromUser(user, next));
    }
    data.platformSettings.currentAcademicYear = next;
    store.save();
  }
  return { previousAcademicYear: current, currentAcademicYear: next };
}

module.exports = {
  INITIAL_ACADEMIC_YEAR,
  ensureSchema,
  getCurrentAcademicYear,
  listAcademicYears,
  listEnrollments,
  findEnrollment,
  upsertCurrentStudent,
  updateCurrentEnrollment,
  promoteAllStudents,
  nextAcademicYear,
};
