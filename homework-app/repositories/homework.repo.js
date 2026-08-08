'use strict';

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../../math-app/db/database');
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
    CREATE INDEX IF NOT EXISTS idx_homework_monitors_student ON HomeworkMonitors(StudentID);
    CREATE INDEX IF NOT EXISTS idx_homework_records_filter ON HomeworkRecords(AcademicYear, ClassName, Subject, RecordDate);
  `).catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}

function jsonData() {
  const data = store.load();
  if (!Array.isArray(data.homeworkMonitors)) data.homeworkMonitors = [];
  if (!Array.isArray(data.homeworkRecords)) data.homeworkRecords = [];
  if (!Number.isInteger(data._homeworkMonitorId)) data._homeworkMonitorId = 0;
  if (!Number.isInteger(data._homeworkRecordId)) data._homeworkRecordId = 0;
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

async function listClassStudents(className) {
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT StudentID AS studentid, Name AS name, Role AS role, ClassName AS classname,
        ClassNo AS classno, ChineseGroup AS chinesegroup, EnglishGroup AS englishgroup, MathGroup AS mathgroup
      FROM Users WHERE Role <> 'teacher' AND ClassName = $1
      ORDER BY COALESCE(ClassNo, 999), StudentID`, [className]);
    return rows.map(mapUser);
  }
  return jsonData().users.filter(row => row.role !== 'teacher' && row.classname === className)
    .sort((a, b) => (Number(a.classno) || 999) - (Number(b.classno) || 999) || a.studentid.localeCompare(b.studentid))
    .map(mapUser);
}

async function listStudents(className, subject) {
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT StudentID AS studentid, Name AS name, Role AS role, ClassName AS classname,
        ClassNo AS classno, ChineseGroup AS chinesegroup, EnglishGroup AS englishgroup, MathGroup AS mathgroup
      FROM Users WHERE Role <> 'teacher' AND ClassName = $1 ORDER BY COALESCE(ClassNo, 999), StudentID`, [className]);
    return rows.filter(row => studentMatchesSubject(row, className, subject)).map(mapUser);
  }
  return jsonData().users.filter(row => studentMatchesSubject(row, className, subject))
    .sort((a, b) => (Number(a.classno) || 999) - (Number(b.classno) || 999) || a.studentid.localeCompare(b.studentid))
    .map(mapUser);
}

async function findUser(studentId) {
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

function mapRecord(row) {
  if (!row) return null;
  return {
    id: Number(row.id), academicYear: row.academicYear || row.academicyear,
    className: row.className || row.classname, subject: row.subject,
    date: String(row.date || row.recorddate).slice(0, 10), homeworks: normalizeStoredHomeworks(row.homeworks),
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

module.exports = { ensureSchema, listStudents, listClassStudents, findUser, listMonitors, replaceMonitors, findRecord, createRecord, updateRecord, listRecords };
