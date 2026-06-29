'use strict';

const config = require('../../config');
const { getPool } = require('../../math-app/db/database');

function requirePg() {
  if (config.db.mode !== 'postgres') {
    const err = new Error('Question bank requires Postgres.');
    err.statusCode = 503;
    throw err;
  }
  return getPool();
}

async function listCategories() {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT category, COUNT(*)::int AS count
      FROM ncs_question_bank
     GROUP BY category
     ORDER BY category`);
  return rows.map(r => ({ category: r.category, count: r.count }));
}

async function randomItems(category, count) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT id, traditional_text, english_meaning, emoji
      FROM ncs_question_bank
     WHERE category = $1
     ORDER BY random()
     LIMIT $2`, [category, count]);
  return rows.map(mapRow);
}

async function listItems(category) {
  const pool = requirePg();
  const { rows } = await pool.query(`
    SELECT id, traditional_text, english_meaning, emoji
      FROM ncs_question_bank
     WHERE category = $1
     ORDER BY traditional_text`, [category]);
  return rows.map(mapRow);
}

async function itemsByIds(ids) {
  const pool = requirePg();
  if (!ids.length) return [];
  const { rows } = await pool.query(`
    SELECT id, traditional_text, english_meaning, emoji
      FROM ncs_question_bank
     WHERE id = ANY($1::uuid[])`, [ids]);
  // Preserve the order the teacher selected them in.
  const byId = new Map(rows.map(r => [r.id, mapRow(r)]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

function mapRow(r) {
  return {
    id: r.id,
    traditionalText: r.traditional_text,
    englishMeaning: r.english_meaning,
    emoji: r.emoji || null,
  };
}

// Convert an emoji like '🍎' to a GitHub-hosted PNG URL.
// Strips the variation selector (U+FE0F) that GitHub's URL scheme omits.
function emojiToImageUrl(emoji) {
  if (!emoji) return null;
  const codepoints = Array.from(emoji)
    .map(ch => ch.codePointAt(0))
    .filter(cp => cp !== 0xFE0F)            // drop VS-16
    .map(cp => cp.toString(16))
    .join('-');
  if (!codepoints) return null;
  return `https://github.githubassets.com/images/icons/emoji/unicode/${codepoints}.png?v8`;
}

module.exports = { listCategories, randomItems, listItems, itemsByIds, emojiToImageUrl };
