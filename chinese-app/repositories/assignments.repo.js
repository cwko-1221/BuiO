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
    imageUrl: r.image_url || null,
    orderIndex: r.order_index,
  };
}

function groupLabel(classname, group) {
  // 'P1' + 'A組' -> '1A'
  const num = String(classname || '').replace(/^P/i, '');
  const letter = String(group || '').replace(/組/g, '');
  return `${num}${letter}`;
}

async function listForTeacher(teacherId) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT a.id, a.title, a.status, a.created_at,
           a.target_classname, a.target_group,
           (SELECT COUNT(*) FROM ncs_attempts at WHERE at.assignment_id = a.id)::int AS attempt_count,
           (SELECT COUNT(*) FROM users u
              WHERE u.role = 'student' AND u.classname = a.target_classname AND u.chinesegroup = a.target_group)::int AS target_count
      FROM ncs_assignments a
     WHERE a.created_by = $1
     ORDER BY a.created_at DESC`, [teacherId]);
  return rows.map(r => ({
    id: r.id, title: r.title, status: r.status, createdAt: r.created_at,
    targetClassname: r.target_classname, targetGroup: r.target_group,
    targetLabel: groupLabel(r.target_classname, r.target_group),
    attemptCount: r.attempt_count, targetCount: r.target_count,
  }));
}

async function listForStudent(studentId) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT a.id, a.title, a.status, a.created_at,
           a.target_classname, a.target_group,
           at.id AS attempt_id, at.status AS attempt_status, at.score AS attempt_score
      FROM users u
      JOIN ncs_assignments a
        ON a.target_classname = u.classname
       AND a.target_group = u.chinesegroup
      LEFT JOIN ncs_attempts at
        ON at.assignment_id = a.id AND at.student_id = u.studentid
     WHERE u.studentid = $1 AND a.status = 'published'
     ORDER BY a.created_at DESC`, [studentId]);
  return rows.map(r => ({
    id: r.id, title: r.title, status: r.status, createdAt: r.created_at,
    targetClassname: r.target_classname, targetGroup: r.target_group,
    targetLabel: groupLabel(r.target_classname, r.target_group),
    attempt: r.attempt_id ? {
      id: r.attempt_id, status: r.attempt_status, score: r.attempt_score,
    } : null,
  }));
}

async function getOne({ assignmentId }) {
  const pool = requirePg();
  const { rows: aRows } = await pool.query(`
    SELECT id, title, status, target_classname, target_group, created_by
      FROM ncs_assignments WHERE id = $1`, [assignmentId]);
  if (!aRows[0]) return null;
  const { rows: iRows } = await pool.query(`
    SELECT id, traditional_text, jyutping, english_meaning, image_url, order_index
      FROM ncs_assignment_items
     WHERE assignment_id = $1
     ORDER BY order_index`, [assignmentId]);
  const a = aRows[0];
  return {
    id: a.id, title: a.title, status: a.status,
    targetClassname: a.target_classname, targetGroup: a.target_group,
    targetLabel: groupLabel(a.target_classname, a.target_group),
    createdBy: a.created_by,
    items: iRows.map(mapItem),
  };
}

async function create({ teacherId, targetClassname, targetGroup, title, status, items }) {
  return withTransaction(async client => {
    const { rows: aRows } = await client.query(
      `INSERT INTO ncs_assignments (target_classname, target_group, title, status, created_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [targetClassname, targetGroup, title, status, teacherId]
    );
    const assignmentId = aRows[0].id;
    for (const it of items) {
      await client.query(
        `INSERT INTO ncs_assignment_items
           (assignment_id, traditional_text, jyutping, english_meaning, image_url, order_index)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [assignmentId, it.traditionalText, it.jyutping, it.englishMeaning, it.imageUrl || null, it.orderIndex]
      );
    }
    return { id: assignmentId, createdAt: aRows[0].created_at };
  });
}

async function updateStatus({ assignmentId, teacherId, status }) {
  const pool = requirePg();
  const { rowCount } = await pool.query(
    `UPDATE ncs_assignments SET status = $1 WHERE id = $2 AND created_by = $3`,
    [status, assignmentId, teacherId]
  );
  return rowCount > 0;
}

async function remove({ assignmentId, teacherId }) {
  const pool = requirePg();
  const { rowCount } = await pool.query(
    `DELETE FROM ncs_assignments WHERE id = $1 AND created_by = $2`,
    [assignmentId, teacherId]
  );
  return rowCount > 0;
}

async function studentHasAccess({ assignmentId, studentId }) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT 1 FROM users u
      JOIN ncs_assignments a
        ON a.target_classname = u.classname AND a.target_group = u.chinesegroup
     WHERE u.studentid = $1 AND a.id = $2 AND a.status = 'published'`,
    [studentId, assignmentId]);
  return rows.length > 0;
}

async function teacherOwns({ assignmentId, teacherId }) {
  const pool = requirePg();
  const { rows } = await pool.query(
    `SELECT 1 FROM ncs_assignments WHERE id = $1 AND created_by = $2`,
    [assignmentId, teacherId]);
  return rows.length > 0;
}

async function listGroupSummary() {
  // Returns { classname, group, count } for every classname+chinesegroup
  // combo that has at least one student. Used to populate the teacher dropdown.
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT classname, chinesegroup AS group_name, COUNT(*)::int AS count
      FROM users
     WHERE role = 'student' AND classname IS NOT NULL AND classname <> ''
       AND chinesegroup IS NOT NULL AND chinesegroup <> ''
     GROUP BY classname, chinesegroup
     ORDER BY classname, chinesegroup`);
  return rows.map(r => ({
    classname: r.classname,
    group: r.group_name,
    count: r.count,
    label: groupLabel(r.classname, r.group_name),
  }));
}

module.exports = {
  listForTeacher,
  listForStudent,
  getOne,
  create,
  updateStatus,
  remove,
  studentHasAccess,
  teacherOwns,
  listGroupSummary,
  groupLabel,
};
