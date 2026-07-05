'use strict';

const config = require('../../config');
const { getPool } = require('../../math-app/db/database');

function requirePg() {
  if (config.db.mode !== 'postgres') {
    const err = new Error('遊戲題庫需要 Postgres 資料庫（開發模式可使用示範題庫）。');
    err.statusCode = 503;
    throw err;
  }
  return getPool();
}

function pgAvailable() {
  return config.db.mode === 'postgres';
}

async function listSets(teacherId) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT s.id, s.title, s.created_at, COUNT(q.id)::int AS question_count
      FROM game_question_sets s
      LEFT JOIN game_questions q ON q.set_id = s.id
     WHERE s.created_by = $1
     GROUP BY s.id
     ORDER BY s.created_at DESC`, [teacherId]);
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    createdAt: r.created_at,
    questionCount: r.question_count,
  }));
}

async function getSetWithQuestions(setId) {
  const pool = requirePg();
  const { rows: sets } = await pool.query(
    'SELECT id, title, created_by FROM game_question_sets WHERE id = $1', [setId]);
  if (!sets[0]) return null;
  const { rows } = await pool.query(`
    SELECT id, question, choices, correct_index
      FROM game_questions
     WHERE set_id = $1
     ORDER BY order_index, id`, [setId]);
  return {
    id: sets[0].id,
    title: sets[0].title,
    createdBy: sets[0].created_by,
    questions: rows.map(mapQuestion),
  };
}

async function createSet({ teacherId, title, questions }) {
  const pool = requirePg();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`
      INSERT INTO game_question_sets (title, created_by)
      VALUES ($1, $2) RETURNING id`, [title, teacherId]);
    const setId = rows[0].id;
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await client.query(`
        INSERT INTO game_questions (set_id, question, choices, correct_index, order_index)
        VALUES ($1, $2, $3, $4, $5)`,
        [setId, q.question, JSON.stringify(q.choices), q.correctIndex, i]);
    }
    await client.query('COMMIT');
    return setId;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function replaceSetQuestions({ setId, teacherId, title, questions }) {
  const pool = requirePg();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rowCount } = await client.query(`
      UPDATE game_question_sets SET title = $1
       WHERE id = $2 AND created_by = $3`, [title, setId, teacherId]);
    if (!rowCount) {
      const err = new Error('題庫不存在或無權限。');
      err.statusCode = 404;
      throw err;
    }
    await client.query('DELETE FROM game_questions WHERE set_id = $1', [setId]);
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await client.query(`
        INSERT INTO game_questions (set_id, question, choices, correct_index, order_index)
        VALUES ($1, $2, $3, $4, $5)`,
        [setId, q.question, JSON.stringify(q.choices), q.correctIndex, i]);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function deleteSet(setId, teacherId) {
  const pool = requirePg();
  const { rowCount } = await pool.query(
    'DELETE FROM game_question_sets WHERE id = $1 AND created_by = $2',
    [setId, teacherId]);
  return rowCount > 0;
}

function mapQuestion(r) {
  return {
    id: r.id,
    question: r.question,
    choices: Array.isArray(r.choices) ? r.choices : JSON.parse(r.choices),
    correctIndex: r.correct_index,
  };
}

module.exports = { pgAvailable, listSets, getSetWithQuestions, createSet, replaceSetQuestions, deleteSet };
