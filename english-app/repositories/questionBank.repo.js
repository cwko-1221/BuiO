'use strict';

const config = require('../../config');
const { getPool } = require('../../math-app/db/database');

function requirePg() {
  if (config.db.mode !== 'postgres') {
    const err = new Error('English question bank requires Postgres.');
    err.statusCode = 503;
    throw err;
  }
  return getPool();
}

const COLS = 'id, category, word, hint, emoji, image_url';

async function listCategories() {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT category, COUNT(*)::int AS count
      FROM eng_question_bank
     GROUP BY category
     ORDER BY category`);
  return rows.map(r => ({ category: r.category, count: r.count }));
}

async function randomItems(category, count) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT ${COLS} FROM eng_question_bank
     WHERE category = $1
     ORDER BY random()
     LIMIT $2`, [category, count]);
  return rows.map(mapRow);
}

async function listItems(category) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT ${COLS} FROM eng_question_bank
     WHERE category = $1
     ORDER BY word`, [category]);
  return rows.map(mapRow);
}

async function itemsByIds(ids) {
  const pool = requirePg();
  if (!ids.length) return [];
  const { rows } = await pool.query(`
    SELECT ${COLS} FROM eng_question_bank
     WHERE id = ANY($1::uuid[])`, [ids]);
  const byId = new Map(rows.map(r => [r.id, mapRow(r)]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

async function createItem({ category, word, hint, emoji, imageUrl }) {
  const pool = requirePg();
  const normalizedWord = normalizeWord(word);
  const { rows } = await pool.query(`
    INSERT INTO eng_question_bank (category, word, hint, emoji, image_url)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (category, word) DO NOTHING
    RETURNING ${COLS}`,
    [category, normalizedWord, hint || null, emoji || null, imageUrl || null]
  );
  if (!rows[0]) {
    const err = new Error('This word already exists in the selected category.');
    err.statusCode = 409;
    throw err;
  }
  return mapRow(rows[0]);
}

async function deleteItem(id) {
  const pool = requirePg();
  const { rowCount } = await pool.query(
    'DELETE FROM eng_question_bank WHERE id = $1', [id]);
  return rowCount > 0;
}

async function updateImageUrl(id, imageUrl) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    UPDATE eng_question_bank SET image_url = $2 WHERE id = $1
    RETURNING ${COLS}`, [id, imageUrl || null]);
  return rows[0] ? mapRow(rows[0]) : null;
}

function normalizeWord(word) {
  return String(word || '').trim().toLowerCase().replace(/[^a-z]/g, '');
}

function mapRow(r) {
  return {
    id: r.id,
    category: r.category,
    word: r.word,
    hint: r.hint || '',
    emoji: r.emoji || null,
    imageUrl: r.image_url || null,
  };
}

function resolveImageUrl(item) {
  if (item.imageUrl) return item.imageUrl;
  return emojiToImageUrl(item.emoji);
}

function emojiToImageUrl(emoji) {
  if (!emoji) return null;
  const codepoints = Array.from(emoji)
    .map(ch => ch.codePointAt(0))
    .filter(cp => cp !== 0xFE0F)
    .map(cp => cp.toString(16))
    .join('-');
  if (!codepoints) return null;
  return `https://github.githubassets.com/images/icons/emoji/unicode/${codepoints}.png?v8`;
}

module.exports = {
  listCategories, randomItems, listItems, itemsByIds,
  createItem, deleteItem, updateImageUrl,
  normalizeWord, emojiToImageUrl, resolveImageUrl,
};
