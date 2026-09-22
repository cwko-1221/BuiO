'use strict';

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../../math-app/db/database');
const users = require('../../math-app/repositories/users.repo');

const TABLE_NUMBERS = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9]);
let schemaPromise;

async function ensureSchema() {
  if (config.db.mode !== 'postgres') return;
  if (!schemaPromise) {
    schemaPromise = getPool().query(`
      CREATE TABLE IF NOT EXISTS MultiplicationChecks (
        ID BIGSERIAL PRIMARY KEY,
        StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
        TeacherID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
        TableNumber SMALLINT NOT NULL CHECK (TableNumber BETWEEN 2 AND 9),
        IsSuccess BOOLEAN NOT NULL,
        CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_multiplication_checks_student
        ON MultiplicationChecks(StudentID, TableNumber, CreatedAt DESC);
      CREATE INDEX IF NOT EXISTS idx_multiplication_checks_created
        ON MultiplicationChecks(CreatedAt DESC);
    `).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function jsonData() {
  const data = store.load();
  if (!Array.isArray(data.multiplicationChecks)) data.multiplicationChecks = [];
  if (!Number.isInteger(data._multiplicationCheckId)) data._multiplicationCheckId = 0;
  return data;
}

function normalizeGroup(value) {
  return String(value || '').trim();
}

function emptyCounts() {
  return Object.fromEntries(TABLE_NUMBERS.map(number => [String(number), 0]));
}

function mapStudent(student, counts = emptyCounts()) {
  return {
    id: student.id,
    name: student.name,
    className: student.className || '',
    classNo: student.classNo == null ? null : Number(student.classNo),
    mathGroup: normalizeGroup(student.mathGroup),
    counts,
    totalScore: Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0),
  };
}

function sortStudents(students) {
  return students.sort((a, b) =>
    String(a.className).localeCompare(String(b.className), 'zh-Hant')
    || (a.classNo || 999) - (b.classNo || 999)
    || String(a.id).localeCompare(String(b.id))
  );
}

async function listOverview(group = '') {
  await ensureSchema();
  const selectedGroup = normalizeGroup(group);
  const allStudents = await users.listForTeacher([], { includeTeachers: false });
  const students = allStudents
    .filter(student => !selectedGroup || normalizeGroup(student.mathGroup) === selectedGroup)
    .map(student => mapStudent(student));

  if (config.db.mode === 'postgres') {
    const params = [selectedGroup];
    const { rows } = await getPool().query(`
      SELECT StudentID AS "studentId", TableNumber AS "tableNumber",
             COALESCE(SUM(CASE WHEN IsSuccess = TRUE THEN 1 ELSE -1 END), 0)::int AS score
      FROM MultiplicationChecks
      WHERE ($1 = '' OR StudentID IN (
        SELECT StudentID FROM Users
        WHERE Role <> 'teacher' AND COALESCE(MathGroup, '') = $1
      ))
      GROUP BY StudentID, TableNumber`, params);
    const byStudent = new Map(students.map(student => [student.id, student]));
    for (const row of rows) {
      const student = byStudent.get(row.studentId);
      if (student && TABLE_NUMBERS.includes(Number(row.tableNumber))) {
        student.counts[String(row.tableNumber)] = Number(row.score) || 0;
      }
    }
  } else {
    const byStudent = new Map(students.map(student => [student.id, student]));
    for (const row of jsonData().multiplicationChecks) {
      const student = byStudent.get(row.studentid);
      const tableNumber = Number(row.tableNumber);
      if (student && TABLE_NUMBERS.includes(tableNumber)) {
        student.counts[String(tableNumber)] += row.isSuccess ? 1 : -1;
      }
    }
  }

  students.forEach(student => {
    student.totalScore = Object.values(student.counts).reduce((sum, value) => sum + Number(value || 0), 0);
  });

  const groups = [...new Set(allStudents.map(student => normalizeGroup(student.mathGroup)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));

  return { groups, students: sortStudents(students), tableNumbers: TABLE_NUMBERS };
}

async function listRecent(group = '', limit = 24) {
  await ensureSchema();
  const selectedGroup = normalizeGroup(group);
  const boundedLimit = Math.max(1, Math.min(100, Number(limit) || 24));
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT c.ID AS id, c.StudentID AS "studentId", u.Name AS "studentName",
             c.TableNumber AS "tableNumber", c.IsSuccess AS "isSuccess",
             c.CreatedAt AS "createdAt"
      FROM MultiplicationChecks c
      JOIN Users u ON u.StudentID = c.StudentID
      WHERE ($1 = '' OR COALESCE(u.MathGroup, '') = $1)
      ORDER BY c.CreatedAt DESC, c.ID DESC
      LIMIT $2`, [selectedGroup, boundedLimit]);
    return rows.map(row => ({
      ...row,
      tableNumber: Number(row.tableNumber),
      isSuccess: Boolean(row.isSuccess),
    }));
  }

  const data = jsonData();
  const userMap = new Map(data.users.filter(user => user.role !== 'teacher').map(user => [user.studentid, user]));
  return data.multiplicationChecks
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id - a.id)
    .filter(row => {
      if (!selectedGroup) return true;
      return normalizeGroup(userMap.get(row.studentid)?.mathgroup) === selectedGroup;
    })
    .slice(0, boundedLimit)
    .map(row => ({
      id: row.id,
      studentId: row.studentid,
      studentName: userMap.get(row.studentid)?.name || row.studentid,
      tableNumber: Number(row.tableNumber),
      isSuccess: Boolean(row.isSuccess),
      createdAt: row.createdAt,
    }));
}

async function recordAttempt({ studentId, tableNumber, isSuccess, teacherId }) {
  await ensureSchema();
  const student = await users.findById(studentId);
  if (!student || student.role === 'teacher') {
    throw Object.assign(new Error('找不到這名學生'), { statusCode: 400 });
  }

  const normalizedTable = Number(tableNumber);
  if (!TABLE_NUMBERS.includes(normalizedTable)) {
    throw Object.assign(new Error('乘數表必須是 2 至 9'), { statusCode: 400 });
  }
  const success = Boolean(isSuccess);
  const createdAt = new Date().toISOString();

  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      INSERT INTO MultiplicationChecks (StudentID, TeacherID, TableNumber, IsSuccess, CreatedAt)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING ID AS id, StudentID AS "studentId", TableNumber AS "tableNumber",
                IsSuccess AS "isSuccess", CreatedAt AS "createdAt"`,
    [studentId, teacherId, normalizedTable, success, createdAt]);
    return rows[0];
  }

  const data = jsonData();
  data._multiplicationCheckId += 1;
  const attempt = {
    id: data._multiplicationCheckId,
    studentid: studentId,
    teacherid: teacherId,
    tableNumber: normalizedTable,
    isSuccess: success,
    createdAt,
  };
  data.multiplicationChecks.push(attempt);
  store.save();
  return {
    id: attempt.id,
    studentId: attempt.studentid,
    tableNumber: attempt.tableNumber,
    isSuccess: attempt.isSuccess,
    createdAt: attempt.createdAt,
  };
}

module.exports = {
  TABLE_NUMBERS,
  ensureSchema,
  listOverview,
  listRecent,
  recordAttempt,
};
