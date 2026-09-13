'use strict';

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../../math-app/db/database');
const academicYears = require('../../math-app/repositories/academic-years.repo');
const { studentMatchesSubject } = require('../lib/domain');

let schemaPromise;
async function ensureSchema() {
  if (config.db.mode !== 'postgres') return;
  if (!schemaPromise) schemaPromise = getPool().query(`
    CREATE TABLE IF NOT EXISTS HomeworkMonitors (
      ID BIGSERIAL PRIMARY KEY, AcademicYear VARCHAR(10) NOT NULL,
      ClassName VARCHAR(20) NOT NULL, Subject VARCHAR(40) NOT NULL,
      StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
      CreatedBy VARCHAR(20), CreatedAt TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (AcademicYear, ClassName, Subject, StudentID)
    );
    CREATE TABLE IF NOT EXISTS HomeworkRecords (
      ID BIGSERIAL PRIMARY KEY, AcademicYear VARCHAR(10) NOT NULL,
      ClassName VARCHAR(20) NOT NULL, Subject VARCHAR(40) NOT NULL,
      RecordDate DATE NOT NULL, Homeworks JSONB NOT NULL DEFAULT '[]'::jsonb,
      CreatedBy VARCHAR(20), SubmittedAt TIMESTAMPTZ DEFAULT NOW(),
      UpdatedBy VARCHAR(20), UpdatedAt TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (AcademicYear, ClassName, Subject, RecordDate)
    );
    CREATE TABLE IF NOT EXISTS HomeworkSubjectTeachers (
      ID BIGSERIAL PRIMARY KEY, AcademicYear VARCHAR(10) NOT NULL,
      ClassName VARCHAR(20) NOT NULL, Subject VARCHAR(40) NOT NULL,
      TeacherID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
      CreatedBy VARCHAR(20), CreatedAt TIMESTAMPTZ DEFAULT NOW(),
      UpdatedBy VARCHAR(20), UpdatedAt TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (AcademicYear, ClassName, Subject)
    );
    CREATE INDEX IF NOT EXISTS idx_homework_monitors_student ON HomeworkMonitors(StudentID);
    CREATE INDEX IF NOT EXISTS idx_homework_records_filter ON HomeworkRecords(AcademicYear, ClassName, Subject, RecordDate);
    CREATE INDEX IF NOT EXISTS idx_homework_subject_teachers_teacher ON HomeworkSubjectTeachers(TeacherID, AcademicYear);
  `).catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}

function jsonData() {
  const data = store.load();
  if (!Array.isArray(data.homeworkMonitors)) data.homeworkMonitors = [];
  if (!Array.isArray(data.homeworkRecords)) data.homeworkRecords = [];
  if (!Number.isInteger(data._homeworkMonitorId)) data._homeworkMonitorId = 0;
  if (!Number.isInteger(data._homeworkRecordId)) data._homeworkRecordId = 0;
  if (!Array.isArray(data.homeworkSubjectTeachers)) data.homeworkSubjectTeachers = [];
  if (!Number.isInteger(data._homeworkSubjectTeacherId)) data._homeworkSubjectTeacherId = 0;
  return data;
}

function mapUser(user) {
  return {
    id: user.studentid, name: user.name, role: user.role,
    className: user.classname || '', classNo: user.classno == null ? null : Number(user.classno),
    chineseGroup: user.chinesegroup || '', englishGroup: user.englishgroup || '', mathGroup: user.mathgroup || '',
  };
}

function normalizeStoredHomeworks(homeworks) {
  if (!Array.isArray(homeworks)) return [];
  return homeworks.map(homework => ({
    ...homework,
    statuses: (Array.isArray(homework.statuses) ? homework.statuses : []).map(row => (
      row.status === 'made_up'
        ? { ...row, status: 'missing', madeUp: true }
        : { ...row, madeUp: Boolean(row.madeUp) }
    )),
  }));
}

async function listClassStudents(academicYear, className) {
  await academicYears.ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT e.StudentID AS studentid, u.Name AS name, u.Role AS role, e.ClassName AS classname,
        e.ClassNo AS classno, e.ChineseGroup AS chinesegroup, e.EnglishGroup AS englishgroup, e.MathGroup AS mathgroup
      FROM StudentAcademicYears e JOIN Users u ON u.StudentID=e.StudentID
      WHERE e.AcademicYear=$1 AND u.Role <> 'teacher' AND e.ClassName=$2
      ORDER BY COALESCE(e.ClassNo, 999), e.StudentID`, [academicYear, className]);
    return rows.map(mapUser);
  }
  return (await academicYears.listEnrollments(academicYear))
    .filter(row => row.role !== 'teacher' && row.className === className)
    .sort((a, b) => (Number(a.classNo) || 999) - (Number(b.classNo) || 999) || a.studentId.localeCompare(b.studentId))
    .map(row => ({
      id: row.studentId, name: row.name, role: row.role, className: row.className,
      classNo: row.classNo, chineseGroup: row.chineseGroup, englishGroup: row.englishGroup, mathGroup: row.mathGroup,
    }));
}

async function listStudents(academicYear, className, subject) {
  const students = await listClassStudents(academicYear, className);
  return students.filter(student => studentMatchesSubject({
    studentid: student.id, name: student.name, role: student.role,
    classname: student.className, classno: student.classNo,
    chinesegroup: student.chineseGroup, englishgroup: student.englishGroup, mathgroup: student.mathGroup,
  }, className, subject));
}

async function findUser(studentId, academicYear = '') {
  if (academicYear) {
    const enrollment = await academicYears.findEnrollment(academicYear, studentId);
    if (!enrollment) return null;
    return {
      studentid: enrollment.studentId, name: enrollment.name, role: enrollment.role,
      classname: enrollment.className, classno: enrollment.classNo,
      chinesegroup: enrollment.chineseGroup, englishgroup: enrollment.englishGroup, mathgroup: enrollment.mathGroup,
    };
  }
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`SELECT StudentID AS studentid, Name AS name, Role AS role,
      ClassName AS classname, ClassNo AS classno, ChineseGroup AS chinesegroup,
      EnglishGroup AS englishgroup, MathGroup AS mathgroup FROM Users WHERE StudentID=$1`, [studentId]);
    return rows[0] || null;
  }
  return jsonData().users.find(user => user.studentid === studentId) || null;
}

async function listMonitors(filters = {}) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const values = [];
    const where = [];
    for (const [column, value] of [['AcademicYear', filters.academicYear], ['ClassName', filters.className], ['Subject', filters.subject], ['StudentID', filters.studentId]]) {
      if (value) { values.push(value); where.push(`${column}=$${values.length}`); }
    }
    const { rows } = await getPool().query(`SELECT ID AS id, AcademicYear AS "academicYear", ClassName AS "className",
      Subject AS subject, StudentID AS "studentId" FROM HomeworkMonitors ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY AcademicYear DESC, ClassName, Subject, StudentID`, values);
    return rows;
  }
  return jsonData().homeworkMonitors.filter(row =>
    (!filters.academicYear || row.academicYear === filters.academicYear)
    && (!filters.className || row.className === filters.className)
    && (!filters.subject || row.subject === filters.subject)
    && (!filters.studentId || row.studentId === filters.studentId));
}

async function replaceMonitors({ academicYear, className, subject, studentIds, createdBy }) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM HomeworkMonitors WHERE AcademicYear=$1 AND ClassName=$2 AND Subject=$3', [academicYear, className, subject]);
      for (const studentId of studentIds) await client.query(`INSERT INTO HomeworkMonitors
        (AcademicYear,ClassName,Subject,StudentID,CreatedBy) VALUES ($1,$2,$3,$4,$5)`, [academicYear, className, subject, studentId, createdBy]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  } else {
    const data = jsonData();
    data.homeworkMonitors = data.homeworkMonitors.filter(row => !(row.academicYear === academicYear && row.className === className && row.subject === subject));
    for (const studentId of studentIds) data.homeworkMonitors.push({
      id: ++data._homeworkMonitorId, academicYear, className, subject, studentId, createdBy, createdAt: new Date().toISOString(),
    });
    store.save();
  }
  return listMonitors({ academicYear, className, subject });
}

function mapSubjectTeacher(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    academicYear: row.academicYear || row.academicyear,
    className: row.className || row.classname,
    subject: row.subject,
    teacherId: row.teacherId || row.teacherid,
    teacherName: row.teacherName || row.teachername || row.teacherId || row.teacherid,
  };
}

function mapTeacher(user) {
  return { id: user.studentid, name: user.name, role: user.role };
}

async function listTeachers() {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`SELECT StudentID AS id, Name AS name, Role AS role
      FROM Users WHERE Role='teacher' ORDER BY Name, StudentID`);
    return rows;
  }
  return jsonData().users.filter(user => user.role === 'teacher').sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant') || a.studentid.localeCompare(b.studentid)
  ).map(mapTeacher);
}

async function listSubjectTeachers(filters = {}) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const values = [];
    const where = [];
    for (const [column, value] of [
      ['AcademicYear', filters.academicYear], ['ClassName', filters.className],
      ['Subject', filters.subject], ['TeacherID', filters.teacherId],
    ]) {
      if (value) { values.push(value); where.push(`st.${column}=$${values.length}`); }
    }
    const { rows } = await getPool().query(`SELECT st.ID AS id, st.AcademicYear AS "academicYear",
      st.ClassName AS "className", st.Subject AS subject, st.TeacherID AS "teacherId",
      u.Name AS "teacherName" FROM HomeworkSubjectTeachers st
      JOIN Users u ON u.StudentID=st.TeacherID
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY st.AcademicYear DESC, st.ClassName, st.Subject, u.Name, st.TeacherID`, values);
    return rows.map(mapSubjectTeacher);
  }
  const data = jsonData();
  const names = new Map(data.users.map(user => [user.studentid, user.name]));
  return data.homeworkSubjectTeachers.filter(row =>
    (!filters.academicYear || row.academicYear === filters.academicYear)
    && (!filters.className || row.className === filters.className)
    && (!filters.subject || row.subject === filters.subject)
    && (!filters.teacherId || row.teacherId === filters.teacherId)
  ).map(row => mapSubjectTeacher({ ...row, teacherName: names.get(row.teacherId) || row.teacherId }))
    .sort((a, b) => a.className.localeCompare(b.className) || a.subject.localeCompare(b.subject));
}

async function replaceSubjectTeachers({ academicYear, className, assignments, updatedBy }) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM HomeworkSubjectTeachers WHERE AcademicYear=$1 AND ClassName=$2', [academicYear, className]);
      for (const assignment of assignments) {
        await client.query(`INSERT INTO HomeworkSubjectTeachers
          (AcademicYear, ClassName, Subject, TeacherID, CreatedBy, UpdatedBy)
          VALUES ($1,$2,$3,$4,$5,$5)`, [academicYear, className, assignment.subject, assignment.teacherId, updatedBy]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  } else {
    const data = jsonData();
    data.homeworkSubjectTeachers = data.homeworkSubjectTeachers.filter(row =>
      row.academicYear !== academicYear || row.className !== className
    );
    for (const assignment of assignments) data.homeworkSubjectTeachers.push({
      id: ++data._homeworkSubjectTeacherId, academicYear, className,
      subject: assignment.subject, teacherId: assignment.teacherId,
      createdBy: updatedBy, updatedBy, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    store.save();
  }
  return listSubjectTeachers({ academicYear, className });
}

function mapRecord(row) {
  if (!row) return null;
  const raw = row.date || row.recorddate;
  const date = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
  return {
    id: Number(row.id), academicYear: row.academicYear || row.academicyear,
    className: row.className || row.classname, subject: row.subject,
    date, homeworks: normalizeStoredHomeworks(row.homeworks),
    createdBy: row.createdBy || row.createdby, submittedAt: row.submittedAt || row.submittedat,
    updatedBy: row.updatedBy || row.updatedby, updatedAt: row.updatedAt || row.updatedat,
  };
}

async function findRecord({ academicYear, className, subject, date }) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`SELECT ID AS id, AcademicYear AS "academicYear", ClassName AS "className",
      Subject AS subject, RecordDate AS date, Homeworks AS homeworks, CreatedBy AS "createdBy",
      SubmittedAt AS "submittedAt", UpdatedBy AS "updatedBy", UpdatedAt AS "updatedAt"
      FROM HomeworkRecords WHERE AcademicYear=$1 AND ClassName=$2 AND Subject=$3 AND RecordDate=$4`, [academicYear, className, subject, date]);
    return mapRecord(rows[0]);
  }
  return mapRecord(jsonData().homeworkRecords.find(row => row.academicYear === academicYear && row.className === className && row.subject === subject && row.date === date));
}

async function createRecord(payload) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`INSERT INTO HomeworkRecords
      (AcademicYear,ClassName,Subject,RecordDate,Homeworks,CreatedBy,UpdatedBy)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6) RETURNING ID AS id`,
      [payload.academicYear, payload.className, payload.subject, payload.date, JSON.stringify(payload.homeworks), payload.createdBy]);
    return findRecord(payload);
  }
  const data = jsonData();
  if (await findRecord(payload)) throw Object.assign(new Error('Record exists'), { code: 'RECORD_EXISTS' });
  const now = new Date().toISOString();
  data.homeworkRecords.push({ id: ++data._homeworkRecordId, ...payload, submittedAt: now, updatedBy: payload.createdBy, updatedAt: now });
  store.save();
  return findRecord(payload);
}

async function updateRecord(payload) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const result = await getPool().query(`UPDATE HomeworkRecords SET Homeworks=$1::jsonb, UpdatedBy=$2, UpdatedAt=NOW()
      WHERE AcademicYear=$3 AND ClassName=$4 AND Subject=$5 AND RecordDate=$6`,
      [JSON.stringify(payload.homeworks), payload.updatedBy, payload.academicYear, payload.className, payload.subject, payload.date]);
    if (!result.rowCount) return null;
    return findRecord(payload);
  }
  const row = jsonData().homeworkRecords.find(item => item.academicYear === payload.academicYear && item.className === payload.className && item.subject === payload.subject && item.date === payload.date);
  if (!row) return null;
  row.homeworks = payload.homeworks;
  row.updatedBy = payload.updatedBy;
  row.updatedAt = new Date().toISOString();
  store.save();
  return mapRecord(row);
}

/**
 * Remove one day's record, and hand back what was removed so the caller can say what it deleted.
 *
 * A record is identified the same way everywhere else identifies it — year, class, subject, date —
 * rather than by its id, so a caller cannot delete a row it did not first look up.
 */
async function deleteRecord({ academicYear, className, subject, date }) {
  await ensureSchema();
  const existing = await findRecord({ academicYear, className, subject, date });
  if (!existing) return null;
  if (config.db.mode === 'postgres') {
    const result = await getPool().query(
      'DELETE FROM HomeworkRecords WHERE AcademicYear=$1 AND ClassName=$2 AND Subject=$3 AND RecordDate=$4',
      [academicYear, className, subject, date],
    );
    return result.rowCount ? existing : null;
  }
  const rows = jsonData().homeworkRecords;
  const at = rows.findIndex(row => row.academicYear === academicYear && row.className === className
    && row.subject === subject && row.date === date);
  if (at < 0) return null;
  rows.splice(at, 1);
  store.save();
  return existing;
}

async function listRecords(filters = {}) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const values = [];
    const where = [];
    for (const [column, value] of [['AcademicYear', filters.academicYear], ['ClassName', filters.className], ['Subject', filters.subject]]) {
      if (value) { values.push(value); where.push(`${column}=$${values.length}`); }
    }
    if (filters.dateFrom) { values.push(filters.dateFrom); where.push(`RecordDate >= $${values.length}`); }
    if (filters.dateTo) { values.push(filters.dateTo); where.push(`RecordDate <= $${values.length}`); }
    const { rows } = await getPool().query(`SELECT ID AS id, AcademicYear AS "academicYear", ClassName AS "className",
      Subject AS subject, RecordDate AS date, Homeworks AS homeworks, CreatedBy AS "createdBy", SubmittedAt AS "submittedAt",
      UpdatedBy AS "updatedBy", UpdatedAt AS "updatedAt" FROM HomeworkRecords
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY RecordDate DESC, Subject`, values);
    return rows.map(mapRecord);
  }
  return jsonData().homeworkRecords.filter(row =>
    (!filters.academicYear || row.academicYear === filters.academicYear)
    && (!filters.className || row.className === filters.className)
    && (!filters.subject || row.subject === filters.subject)
    && (!filters.dateFrom || row.date >= filters.dateFrom)
    && (!filters.dateTo || row.date <= filters.dateTo))
    .sort((a, b) => b.date.localeCompare(a.date) || a.subject.localeCompare(b.subject)).map(mapRecord);
}

module.exports = {
  ensureSchema, listStudents, listClassStudents, findUser, listMonitors, replaceMonitors,
  listTeachers, listSubjectTeachers, replaceSubjectTeachers,
  findRecord, createRecord, updateRecord, deleteRecord, listRecords,
};
