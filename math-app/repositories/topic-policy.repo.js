'use strict';

/** Per-grade / per-maths-group allow-list for individual curriculum topics. */

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../db/database');
const { ALL_TAGS } = require('../engine/questionGenerator');
const { normalizeClassname } = require('../engine/classTags');

const SETTING_KEY = 'mathTopicPolicy';
const VALID_TAGS = new Set(ALL_TAGS);

function policyKey(className, mathGroup) {
  return `${normalizeClassname(className) || ''}|${String(mathGroup || '').trim()}`;
}

function sanitizeTags(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(list.filter(tag => typeof tag === 'string' && VALID_TAGS.has(tag)));
  return ALL_TAGS.filter(tag => seen.has(tag));
}

function sanitizePolicy(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^P[1-6]\|/.test(key)) continue;
    out[key] = sanitizeTags(value);
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

async function setRule(className, mathGroup, disabledTags) {
  const policy = await getPolicy();
  const key = policyKey(className, mathGroup);
  if (disabledTags === null) delete policy[key];
  else policy[key] = sanitizeTags(disabledTags);
  return savePolicy(policy);
}

function resolveRule(policy, className, mathGroup) {
  const grade = normalizeClassname(className);
  if (!grade) return { configured: false, disabledTags: [], source: null, groupConfigured: false };
  const group = String(mathGroup || '').trim();
  const groupKey = policyKey(grade, group);
  const gradeKey = policyKey(grade, '');
  const groupConfigured = Boolean(group) && Object.prototype.hasOwnProperty.call(policy, groupKey);
  const gradeConfigured = Object.prototype.hasOwnProperty.call(policy, gradeKey);
  if (groupConfigured) {
    return { configured: true, disabledTags: policy[groupKey], source: 'group', groupConfigured: true };
  }
  if (gradeConfigured) {
    return { configured: true, disabledTags: policy[gradeKey], source: 'grade', groupConfigured: false };
  }
  return { configured: false, disabledTags: [], source: null, groupConfigured: false };
}

async function ruleFor(className, mathGroup) {
  const grade = normalizeClassname(className);
  if (!grade) return resolveRule({}, '', '');
  return resolveRule(await getPolicy(), grade, mathGroup);
}

module.exports = {
  getPolicy,
  savePolicy,
  setRule,
  resolveRule,
  ruleFor,
  policyKey,
  sanitizeTags,
  SETTING_KEY,
};
