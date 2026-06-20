'use strict';

const config = require('../../config');
const { getPool } = require('../../math-app/db/database');

function requirePg() {
  if (config.db.mode !== 'postgres') {
    const err = new Error('Chinese module requires Postgres (SUPABASE_DB_URL not set).');
    err.statusCode = 503;
    throw err;
  }
  return getPool();
}

async function listForTeacher(teacherId) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT c.id, c.name, c.created_at,
           COUNT(cs.student_id)::int AS student_count
      FROM ncs_classes c
      LEFT JOIN ncs_class_students cs ON cs.class_id = c.id
     WHERE c.teacher_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC`, [teacherId]);
  return rows.map(r => ({
    id: r.id, name: r.name, createdAt: r.created_at, studentCount: r.student_count,
  }));
}

async function listForStudent(studentId) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT c.id, c.name, c.teacher_id, u.name AS teacher_name
      FROM ncs_class_students cs
      JOIN ncs_classes c ON c.id = cs.class_id
      JOIN users u ON u.studentid = c.teacher_id
     WHERE cs.student_id = $1
     ORDER BY c.name`, [studentId]);
  return rows.map(r => ({
    id: r.id, name: r.name, teacherId: r.teacher_id, teacherName: r.teacher_name,
  }));
}

async function create({ teacherId, name }) {
  const pool = requirePg();
  const { rows } = await pool.query(
    `INSERT INTO ncs_classes (teacher_id, name) VALUES ($1, $2)
     ON CONFLICT (teacher_id, name) DO NOTHING
     RETURNING id, name, created_at`,
    [teacherId, name]
  );
  if (!rows[0]) {
    const err = new Error('Class already exists');
    err.statusCode = 409;
    throw err;
  }
  return { id: rows[0].id, name: rows[0].name, createdAt: rows[0].created_at, studentCount: 0 };
}

async function remove({ classId, teacherId }) {
  const pool = requirePg();
  const { rowCount } = await pool.query(
    'DELETE FROM ncs_classes WHERE id = $1 AND teacher_id = $2',
    [classId, teacherId]
  );
  return rowCount > 0;
}

async function ownsClass({ classId, teacherId }) {
  const pool = requirePg();
  const { rows } = await pool.query(
    'SELECT 1 FROM ncs_classes WHERE id = $1 AND teacher_id = $2',
    [classId, teacherId]
  );
  return rows.length > 0;
}

async function listStudentsInClass(classId) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT u.studentid AS id, u.name, u.classname AS class_name, u.classno AS class_no
      FROM ncs_class_students cs
      JOIN users u ON u.studentid = cs.student_id
     WHERE cs.class_id = $1
     ORDER BY COALESCE(u.classno, 999), u.studentid`, [classId]);
  return rows.map(r => ({
    id: r.id, name: r.name, className: r.class_name || '', classNo: r.class_no,
  }));
}

async function addStudents({ classId, studentIds }) {
  const pool = requirePg();
  if (!studentIds.length) return { added: 0, skipped: 0 };
  const values = studentIds.map((_, i) => `($1, $${i + 2})`).join(',');
  const params = [classId, ...studentIds];
  const { rowCount } = await pool.query(
    `INSERT INTO ncs_class_students (class_id, student_id)
     VALUES ${values}
     ON CONFLICT (class_id, student_id) DO NOTHING`,
    params
  );
  return { added: rowCount, skipped: studentIds.length - rowCount };
}

async function removeStudent({ classId, studentId }) {
  const pool = requirePg();
  const { rowCount } = await pool.query(
    'DELETE FROM ncs_class_students WHERE class_id = $1 AND student_id = $2',
    [classId, studentId]
  );
  return rowCount > 0;
}

module.exports = {
  listForTeacher,
  listForStudent,
  create,
  remove,
  ownsClass,
  listStudentsInClass,
  addStudents,
  removeStudent,
};
