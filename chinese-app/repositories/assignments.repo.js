'use strict';

const config = require('../../config');
const { getPool, withTransaction } = require('../../math-app/db/database');

function requirePg() {
  if (config.db.mode !== 'postgres') {
    const err = new Error('Chinese module requires Postgres.');
    err.statusCode = 503;
    throw err;
  }
  return getPool();
}

function mapItem(r) {
  return {
    id: r.id,
    traditionalText: r.traditional_text,
    jyutping: r.jyutping,
    englishMeaning: r.english_meaning,
    orderIndex: r.order_index,
  };
}

async function listForTeacher(teacherId) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT a.id, a.title, a.status, a.created_at,
           a.class_id, c.name AS class_name,
           (SELECT COUNT(*) FROM ncs_attempts at WHERE at.assignment_id = a.id)::int AS attempt_count
      FROM ncs_assignments a
      JOIN ncs_classes c ON c.id = a.class_id
     WHERE c.teacher_id = $1
     ORDER BY a.created_at DESC`, [teacherId]);
  return rows.map(r => ({
    id: r.id, title: r.title, status: r.status, createdAt: r.created_at,
    classId: r.class_id, className: r.class_name, attemptCount: r.attempt_count,
  }));
}

async function listForStudent(studentId) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT a.id, a.title, a.status, a.created_at,
           c.id AS class_id, c.name AS class_name,
           at.id AS attempt_id, at.status AS attempt_status, at.score AS attempt_score
      FROM ncs_class_students cs
      JOIN ncs_classes c ON c.id = cs.class_id
      JOIN ncs_assignments a ON a.class_id = c.id
      LEFT JOIN ncs_attempts at ON at.assignment_id = a.id AND at.student_id = cs.student_id
     WHERE cs.student_id = $1 AND a.status = 'published'
     ORDER BY a.created_at DESC`, [studentId]);
  return rows.map(r => ({
    id: r.id, title: r.title, status: r.status, createdAt: r.created_at,
    classId: r.class_id, className: r.class_name,
    attempt: r.attempt_id ? {
      id: r.attempt_id, status: r.attempt_status, score: r.attempt_score,
    } : null,
  }));
}

async function getOne({ assignmentId }) {
  const pool = requirePg();
  const { rows: aRows } = await pool.query(`
    SELECT a.id, a.title, a.status, a.class_id, a.created_by, c.teacher_id, c.name AS class_name
      FROM ncs_assignments a
      JOIN ncs_classes c ON c.id = a.class_id
     WHERE a.id = $1`, [assignmentId]);
  if (!aRows[0]) return null;
  const { rows: iRows } = await pool.query(`
    SELECT id, traditional_text, jyutping, english_meaning, order_index
      FROM ncs_assignment_items
     WHERE assignment_id = $1
     ORDER BY order_index`, [assignmentId]);
  const a = aRows[0];
  return {
    id: a.id, title: a.title, status: a.status, classId: a.class_id,
    teacherId: a.teacher_id, createdBy: a.created_by, className: a.class_name,
    items: iRows.map(mapItem),
  };
}

async function create({ teacherId, classId, title, status, items }) {
  return withTransaction(async client => {
    const { rows: cRows } = await client.query(
      'SELECT 1 FROM ncs_classes WHERE id = $1 AND teacher_id = $2',
      [classId, teacherId]
    );
    if (!cRows.length) {
      const err = new Error('Class not found');
      err.statusCode = 404;
      throw err;
    }
    const { rows: aRows } = await client.query(
      `INSERT INTO ncs_assignments (class_id, title, status, created_by)
       VALUES ($1, $2, $3, $4) RETURNING id, created_at`,
      [classId, title, status, teacherId]
    );
    const assignmentId = aRows[0].id;
    for (const it of items) {
      await client.query(
        `INSERT INTO ncs_assignment_items
           (assignment_id, traditional_text, jyutping, english_meaning, order_index)
         VALUES ($1, $2, $3, $4, $5)`,
        [assignmentId, it.traditionalText, it.jyutping, it.englishMeaning, it.orderIndex]
      );
    }
    return { id: assignmentId, createdAt: aRows[0].created_at };
  });
}

async function updateStatus({ assignmentId, teacherId, status }) {
  const pool = requirePg();
  const { rowCount } = await pool.query(`
    UPDATE ncs_assignments a SET status = $1
      FROM ncs_classes c
     WHERE a.class_id = c.id AND a.id = $2 AND c.teacher_id = $3`,
    [status, assignmentId, teacherId]);
  return rowCount > 0;
}

async function remove({ assignmentId, teacherId }) {
  const pool = requirePg();
  const { rowCount } = await pool.query(`
    DELETE FROM ncs_assignments a
     USING ncs_classes c
     WHERE a.class_id = c.id AND a.id = $1 AND c.teacher_id = $2`,
    [assignmentId, teacherId]);
  return rowCount > 0;
}

async function studentHasAccess({ assignmentId, studentId }) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT 1 FROM ncs_assignments a
      JOIN ncs_class_students cs ON cs.class_id = a.class_id
     WHERE a.id = $1 AND cs.student_id = $2 AND a.status = 'published'`,
    [assignmentId, studentId]);
  return rows.length > 0;
}

module.exports = {
  listForTeacher,
  listForStudent,
  getOne,
  create,
  updateStatus,
  remove,
  studentHasAccess,
};
