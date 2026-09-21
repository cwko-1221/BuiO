'use strict';

/**
 * Which question categories (operations, whole numbers, fractions, decimals) a class or
 * math group may receive. This mirrors the tier policy, but keeps the two
 * settings in separate PlatformSettings keys so existing tier data remains
 * unchanged.
 */

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../db/database');
const { QUESTION_TYPE_IDS, normalizeClassname } = require('../engine/classTags');

const SETTING_KEY = 'mathQuestionTypePolicy';

function policyKey(className, mathGroup) {
  return `${normalizeClassname(className) || ''}|${String(mathGroup || '').trim()}`;
}

function sanitizeQuestionTypes(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  for (const id of list) if (QUESTION_TYPE_IDS.includes(id)) seen.add(id);
  return QUESTION_TYPE_IDS.filter(id => seen.has(id));
}

function sanitizePolicy(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^P[1-6]\|/.test(key)) continue;
    out[key] = sanitizeQuestionTypes(value);
  }
  return out;
}

let schemaPromise;
async function ensureSchema() {
  if (config.db.mode !== 'postgres') return;
  if (!schemaPromise) schemaPromise = getPool().query(`
    CREATE TABLE IF NOT EXISTS PlatformSettings (
      SettingKey VARCHAR(80) PRIMARY KEY,
      SettingValue TEXT NOT NULL,
      UpdatedAt TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}

async function getPolicy() {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(
      'SELECT SettingValue AS value FROM PlatformSettings WHERE SettingKey = $1', [SETTING_KEY]);
    if (!rows[0]) return {};
    try { return sanitizePolicy(JSON.parse(rows[0].value)); }
    catch { return {}; }
  }
  const data = store.load();
  if (!data.platformSettings || typeof data.platformSettings !== 'object') return {};
  return sanitizePolicy(data.platformSettings[SETTING_KEY]);
}

async function savePolicy(policy) {
  const clean = sanitizePolicy(policy);
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    await getPool().query(`
      INSERT INTO PlatformSettings (SettingKey, SettingValue, UpdatedAt)
      VALUES ($1, $2, NOW())
      ON CONFLICT (SettingKey) DO UPDATE SET SettingValue = EXCLUDED.SettingValue, UpdatedAt = NOW()`,
      [SETTING_KEY, JSON.stringify(clean)]);
    return clean;
  }
  const data = store.load();
  if (!data.platformSettings || typeof data.platformSettings !== 'object') data.platformSettings = {};
  data.platformSettings[SETTING_KEY] = clean;
  store.save();
  return clean;
}

/** Set (or, with disabledQuestionTypes === null, clear) one class/group rule. */
async function setRule(className, mathGroup, disabledQuestionTypes) {
  const policy = await getPolicy();
  const key = policyKey(className, mathGroup);
  if (disabledQuestionTypes === null) delete policy[key];
  else policy[key] = sanitizeQuestionTypes(disabledQuestionTypes);
  return savePolicy(policy);
}

/** A group-specific rule replaces the grade-wide rule, just like tier policy. */
function resolve(policy, className, mathGroup) {
  const grade = normalizeClassname(className);
  if (!grade) return [];
  const group = String(mathGroup || '').trim();
  if (group && policy[policyKey(grade, group)]) return policy[policyKey(grade, group)];
  return policy[policyKey(grade, '')] || [];
}

async function disabledQuestionTypesFor(className, mathGroup) {
  const grade = normalizeClassname(className);
  if (!grade) return [];
  return resolve(await getPolicy(), grade, mathGroup);
}

module.exports = {
  getPolicy,
  savePolicy,
  setRule,
  resolve,
  disabledQuestionTypesFor,
  policyKey,
  SETTING_KEY,
};
