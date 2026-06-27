'use strict';

const config = require('../../config');
const { getPool, withTransaction } = require('../../math-app/db/database');

function requirePg() {
  if (config.db.mode !== 'postgres') {
    const err = new Error('English module requires Postgres.');
    err.statusCode = 503;
    throw err;
  }
  return getPool();
}

function mapAttemptItem(r) {
  return {
    id: r.id,
    assignmentItemId: r.assignment_item_id,
    correct: r.correct,
    heartsLeft: r.hearts_left,
    attemptsUsed: r.attempts_used,
  };
}

async function ensure({ assignmentId, studentId }) {
  return withTransaction(async client => {
    const { rows: existing } = await client.query(
      `SELECT id, status, score FROM eng_attempts
        WHERE assignment_id = $1 AND student_id = $2`,
      [assignmentId, studentId]
    );
    if (existing[0]) {
      const { rows: items } = await client.query(
        `SELECT id, assignment_item_id, correct, hearts_left, attempts_used
           FROM eng_attempt_items WHERE attempt_id = $1`,
        [existing[0].id]
      );
      return {
        id: existing[0].id,
        status: existing[0].status,
        score: existing[0].score,
        items: items.map(mapAttemptItem),
      };
    }
    const { rows: created } = await client.query(
      `INSERT INTO eng_attempts (assignment_id, student_id)
       VALUES ($1, $2) RETURNING id, status, score`,
      [assignmentId, studentId]
    );
    const attemptId = created[0].id;
    const { rows: aitems } = await client.query(
      `SELECT id FROM eng_assignment_items WHERE assignment_id = $1 ORDER BY order_index`,
      [assignmentId]
    );
    const items = [];
    for (const ai of aitems) {
      const { rows: ins } = await client.query(
        `INSERT INTO eng_attempt_items (attempt_id, assignment_item_id)
         VALUES ($1, $2)
         RETURNING id, assignment_item_id, correct, hearts_left, attempts_used`,
        [attemptId, ai.id]
      );
      items.push(mapAttemptItem(ins[0]));
    }
    return { id: attemptId, status: created[0].status, score: created[0].score, items };
  });
}

const ALLOWED_FIELDS = {
  correct: 'correct',
  heartsLeft: 'hearts_left',
  attemptsUsed: 'attempts_used',
};

async function updateItem({ attemptId, studentId, assignmentItemId, patch }) {
  const pool = requirePg();
  const sets = [];
  const params = [attemptId, assignmentItemId];
  let idx = 3;
  for (const [k, v] of Object.entries(patch)) {
    const col = ALLOWED_FIELDS[k];
    if (!col) continue;
    sets.push(`${col} = $${idx}`);
    params.push(v);
    idx++;
  }
  if (!sets.length) return false;
  const { rowCount } = await pool.query(
    `UPDATE eng_attempt_items SET ${sets.join(', ')}
       WHERE attempt_id = $1 AND assignment_item_id = $2
       AND attempt_id IN (SELECT id FROM eng_attempts WHERE student_id = $${idx})`,
    [...params, studentId]
  );
  return rowCount > 0;
}

async function complete({ attemptId, studentId }) {
  return withTransaction(async client => {
    const { rows: owner } = await client.query(
      'SELECT id FROM eng_attempts WHERE id = $1 AND student_id = $2',
      [attemptId, studentId]
    );
    if (!owner[0]) {
      const err = new Error('Attempt not found');
      err.statusCode = 404;
      throw err;
    }
    const { rows: scoreRows } = await client.query(
      `SELECT COUNT(*) FILTER (WHERE correct)::int AS score
         FROM eng_attempt_items WHERE attempt_id = $1`,
      [attemptId]
    );
    const score = scoreRows[0].score;
    await client.query(
      `UPDATE eng_attempts SET status = 'completed', score = $1, completed_at = now()
        WHERE id = $2`,
      [score, attemptId]
    );
    return { score };
  });
}

async function listForAssignment({ assignmentId, teacherId }) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT at.id, at.status, at.score, at.started_at, at.completed_at,
           at.student_id, u.name AS student_name, u.classname, u.classno
      FROM eng_attempts at
      JOIN eng_assignments a ON a.id = at.assignment_id
      JOIN users u ON u.studentid = at.student_id
     WHERE at.assignment_id = $1 AND a.created_by = $2
     ORDER BY u.classname, u.classno, u.studentid`,
    [assignmentId, teacherId]);
  return rows.map(r => ({
    id: r.id, status: r.status, score: r.score,
    startedAt: r.started_at, completedAt: r.completed_at,
    studentId: r.student_id, studentName: r.student_name,
    className: r.classname || '', classNo: r.classno,
  }));
}

async function getAttemptDetail({ attemptId, teacherId }) {
  const pool = requirePg();
  const { rows: aRows } = await pool.query(`
    SELECT at.id, at.status, at.score, at.started_at, at.completed_at,
           at.student_id, u.name AS student_name,
           at.assignment_id, a.title AS assignment_title
      FROM eng_attempts at
      JOIN eng_assignments a ON a.id = at.assignment_id
      JOIN users u ON u.studentid = at.student_id
     WHERE at.id = $1 AND a.created_by = $2`,
    [attemptId, teacherId]);
  if (!aRows[0]) return null;
  const { rows: iRows } = await pool.query(`
    SELECT ai.id AS aitem_id, ai.word, ai.hint, ai.image_url, ai.order_index,
           ati.id, ati.assignment_item_id, ati.correct, ati.hearts_left, ati.attempts_used
      FROM eng_attempt_items ati
      JOIN eng_assignment_items ai ON ai.id = ati.assignment_item_id
     WHERE ati.attempt_id = $1
     ORDER BY ai.order_index`,
    [attemptId]);
  const a = aRows[0];
  return {
    id: a.id, status: a.status, score: a.score,
    startedAt: a.started_at, completedAt: a.completed_at,
    studentId: a.student_id, studentName: a.student_name,
    assignmentId: a.assignment_id, assignmentTitle: a.assignment_title,
    items: iRows.map(r => ({
      ...mapAttemptItem(r),
      word: r.word, hint: r.hint || '', imageUrl: r.image_url || null,
      orderIndex: r.order_index,
    })),
  };
}

async function remove({ attemptId, teacherId }) {
  const pool = requirePg();
  const { rowCount } = await pool.query(`
    DELETE FROM eng_attempts at
     USING eng_assignments a
     WHERE at.assignment_id = a.id AND at.id = $1 AND a.created_by = $2`,
    [attemptId, teacherId]);
  return rowCount > 0;
}

module.exports = {
  ensure, updateItem, complete, listForAssignment, getAttemptDetail, remove,
};
