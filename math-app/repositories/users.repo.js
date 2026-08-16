'use strict';

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../db/database');
const academicYears = require('./academic-years.repo');

const classRank = name => {
  const m = String(name || '').match(/^P([1-6])$/i);
  if (m) return Number(m[1]);
  if (name === 'Graduated') return 98;
  return 99;
};

const sortStudents = arr => arr.sort((a, b) =>
  classRank(a.className) - classRank(b.className)
  || (a.classNo || 999) - (b.classNo || 999)
  || a.id.localeCompare(b.id)
);

const SELECT_BASE = `
  SELECT u.StudentID AS id, u.Name AS name, u.Role AS role,
         u.ClassName AS classname, u.ClassNo AS classno,
         u.ChineseGroup AS chinesegroup, u.EnglishGroup AS englishgroup,
         u.MathGroup AS mathgroup,
         COALESCE(SUM(s.TotalAttempted), 0) AS totalquestions,
         CASE WHEN SUM(s.TotalAttempted) > 0
              THEN ROUND(CAST(SUM(s.TotalCorrect) AS NUMERIC) / SUM(s.TotalAttempted) * 100, 1)
              ELSE 0 END AS overallaccuracy
  FROM Users u
  LEFT JOIN StudentStats s
    ON u.StudentID = s.StudentID AND s.Tag = ANY($1::text[])
`;

const ORDER_BY_CLASS = `
  ORDER BY CASE
    WHEN u.ClassName ~ '^P[1-6]$' THEN CAST(SUBSTRING(u.ClassName FROM 2) AS INT)
    WHEN u.ClassName = 'Graduated' THEN 98
    ELSE 99 END,
  COALESCE(u.ClassNo, 999), u.StudentID ASC
`;

function mapUserRow(r) {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    className: r.classname || '',
    classNo: r.classno == null ? null : Number(r.classno),
    chineseGroup: r.chinesegroup || '',
    englishGroup: r.englishgroup || '',
    mathGroup: r.mathgroup || '',
    totalQuestions: Number(r.totalquestions) || 0,
    overallAccuracy: Number(r.overallaccuracy) || 0,
  };
}

async function findById(studentId) {
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(
      'SELECT * FROM Users WHERE StudentID = $1', [studentId]);
    return rows[0] || null;
  }
  const u = store.load().users.find(x => x.studentid === studentId);
  return u || null;
}

async function findByIdSummary(studentId) {
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(
      'SELECT Name AS name, Role AS role, ClassName AS classname, ClassNo AS classno, Language AS language FROM Users WHERE StudentID = $1',
      [studentId]);
    return rows[0] || null;
  }
  const u = store.load().users.find(x => x.studentid === studentId);
  if (!u) return null;
  return {
    name: u.name, role: u.role,
    classname: u.classname || null,
    classno: u.classno || null,
    language: u.language || 'zh-HK',
  };
}

async function exists(studentId) {
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(
      'SELECT 1 FROM Users WHERE StudentID = $1', [studentId]);
    return rows.length > 0;
  }
  return !!store.load().users.find(u => u.studentid === studentId);
}

async function insert(user, opts = {}) {
  const client = opts.client;
  const params = [
    user.studentId, user.name, user.passwordHash, user.role,
    user.className || '', user.classNo,
    user.chineseGroup || '', user.englishGroup || '', user.mathGroup || '',
  ];
  if (config.db.mode === 'postgres') {
    const runner = client || getPool();
    await runner.query(`
      INSERT INTO Users (StudentID, Name, PasswordHash, Role, ClassName, ClassNo, ChineseGroup, EnglishGroup, MathGroup)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, params);
    return;
  }
  const d = store.load();
  if (d.users.find(u => u.studentid === user.studentId)) {
    throw new Error('duplicate key');
  }
  d.users.push({
    studentid: user.studentId,
    name: user.name,
    passwordhash: user.passwordHash,
    role: user.role,
    classname: user.className || '',
    classno: user.classNo,
    chinesegroup: user.chineseGroup || '',
    englishgroup: user.englishGroup || '',
    mathgroup: user.mathGroup || '',
    language: 'zh-HK',
  });
  store.save();
}

async function updateStudentProfile(user, opts = {}) {
  const passwordHash = user.passwordHash || null;
  if (config.db.mode === 'postgres') {
    const runner = opts.client || getPool();
    await runner.query(`UPDATE Users SET
      Name=$1, ClassName=$2, ClassNo=$3, ChineseGroup=$4, EnglishGroup=$5, MathGroup=$6,
      PasswordHash=COALESCE($7, PasswordHash)
      WHERE StudentID=$8 AND Role <> 'teacher'`, [
      user.name,
      user.className || '',
      user.classNo,
      user.chineseGroup || '',
      user.englishGroup || '',
      user.mathGroup || '',
      passwordHash,
      user.studentId,
    ]);
    return;
  }
  const existing = store.load().users.find(row => row.studentid === user.studentId && row.role !== 'teacher');
  if (!existing) return;
  existing.name = user.name;
  existing.classname = user.className || '';
  existing.classno = user.classNo;
  existing.chinesegroup = user.chineseGroup || '';
  existing.englishgroup = user.englishGroup || '';
  existing.mathgroup = user.mathGroup || '';
  if (passwordHash) existing.passwordhash = passwordHash;
  store.save();
}

const ALLOWED_UPDATE_FIELDS = {
  className: 'ClassName',
  classNo: 'ClassNo',
  chineseGroup: 'ChineseGroup',
  englishGroup: 'EnglishGroup',
  mathGroup: 'MathGroup',
};

async function updateField(studentId, field, value) {
  const col = ALLOWED_UPDATE_FIELDS[field];
  if (!col) throw new Error(`Field not updatable: ${field}`);
  if (config.db.mode === 'postgres') {
    await getPool().query(`UPDATE Users SET ${col} = $1 WHERE StudentID = $2`, [value, studentId]);
    await academicYears.updateCurrentEnrollment(studentId, field, value);
    return;
  }
  const u = store.load().users.find(x => x.studentid === studentId);
  if (u) {
    u[col.toLowerCase()] = value;
    store.save();
    await academicYears.updateCurrentEnrollment(studentId, field, value);
  }
}

async function updateLanguage(studentId, language) {
  if (config.db.mode === 'postgres') {
    await getPool().query('UPDATE Users SET Language = $1 WHERE StudentID = $2', [language, studentId]);
    return;
  }
  const u = store.load().users.find(x => x.studentid === studentId);
  if (u) { u.language = language; store.save(); }
}

async function deleteById(studentId) {
  if (config.db.mode === 'postgres') {
    await getPool().query('DELETE FROM QuestionLogs WHERE StudentID = $1', [studentId]);
    await getPool().query('DELETE FROM StudentStats WHERE StudentID = $1', [studentId]);
    await getPool().query('DELETE FROM Users WHERE StudentID = $1', [studentId]);
    return;
  }
  const d = store.load();
  d.users = d.users.filter(u => u.studentid !== studentId);
  if (Array.isArray(d.studentAcademicYears)) {
    d.studentAcademicYears = d.studentAcademicYears.filter(row => row.studentId !== studentId);
  }
  d.studentStats = d.studentStats.filter(s => s.studentid !== studentId);
  d.questionLogs = d.questionLogs.filter(l => l.studentid !== studentId);
  store.save();
  // Pet Paradise owns the per-table deletion semantics for its own data; duplicating them
  // here is how the two copies drifted apart in the first place.
  require('../../pet-app/repositories/pet.repo').purgeJsonStudent(studentId);
}

async function upgradeAllStudents() {
  return academicYears.promoteAllStudents();
}

async function listForTeacher(allTags, { includeTeachers = false, academicYear = '' } = {}) {
  if (academicYear) {
    const enrollments = await academicYears.listEnrollments(academicYear);
    const students = enrollments.map(row => ({
      id: row.studentId,
      name: row.name,
      role: 'student',
      className: row.className || '',
      classNo: row.classNo == null ? null : Number(row.classNo),
      chineseGroup: row.chineseGroup || '',
      englishGroup: row.englishGroup || '',
      mathGroup: row.mathGroup || '',
      totalQuestions: 0,
      overallAccuracy: 0,
    }));
    if (!includeTeachers) return sortStudents(students);
    const teachers = (await listForTeacher(allTags, { includeTeachers: true })).filter(user => user.role === 'teacher');
    return [...teachers, ...sortStudents(students)];
  }
  if (config.db.mode === 'postgres') {
    const where = includeTeachers ? '' : `WHERE u.Role != 'teacher'`;
    const groupBy = `GROUP BY u.StudentID, u.Role, u.ClassName, u.ClassNo, u.ChineseGroup, u.EnglishGroup, u.MathGroup`;
    const orderBy = includeTeachers
      ? `ORDER BY u.Role ASC, CASE WHEN u.ClassName ~ '^P[1-6]$' THEN CAST(SUBSTRING(u.ClassName FROM 2) AS INT) WHEN u.ClassName = 'Graduated' THEN 98 ELSE 99 END, COALESCE(u.ClassNo, 999), u.StudentID ASC`
      : ORDER_BY_CLASS;
    const { rows } = await getPool().query(
      `${SELECT_BASE} ${where} ${groupBy} ${orderBy}`,
      [allTags]
    );
    return rows.map(mapUserRow);
  }
  const d = store.load();
  const users = includeTeachers ? d.users : d.users.filter(u => u.role !== 'teacher');
  const out = users.map(u => {
    const stats = d.studentStats.filter(s => s.studentid === u.studentid && allTags.includes(s.tag));
    const totalq = stats.reduce((a, s) => a + (s.totalattempted || 0), 0);
    const totalc = stats.reduce((a, s) => a + (s.totalcorrect || 0), 0);
    return {
      id: u.studentid,
      name: u.name,
      role: u.role,
      className: u.classname || '',
      classNo: u.classno == null ? null : Number(u.classno),
      chineseGroup: u.chinesegroup || '',
      englishGroup: u.englishgroup || '',
      mathGroup: u.mathgroup || '',
      totalQuestions: totalq,
      overallAccuracy: totalq > 0 ? Math.round((totalc / totalq) * 1000) / 10 : 0,
    };
  });
  if (includeTeachers) {
    return out.sort((a, b) =>
      a.role.localeCompare(b.role)
      || classRank(a.className) - classRank(b.className)
      || (a.classNo || 999) - (b.classNo || 999)
      || a.id.localeCompare(b.id)
    );
  }
  return sortStudents(out);
}

async function count() {
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query('SELECT COUNT(*)::int AS c FROM Users');
    return rows[0].c;
  }
  return store.load().users.length;
}

module.exports = {
  findById,
  findByIdSummary,
  exists,
  insert,
  updateStudentProfile,
  updateField,
  updateLanguage,
  deleteById,
  upgradeAllStudents,
  listForTeacher,
  count,
  ALLOWED_UPDATE_FIELDS,
};
