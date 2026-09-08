'use strict';

/**
 * Which question tiers (銅/銀/金/鑽) a class or math group is allowed to receive.
 *
 * A teacher can switch a tier off for a whole grade, or for one math group
 * inside it — "P4 B組 沒有鑽石題" — and the switch has to hold in two places at
 * once: the adaptive engine must stop generating those questions, and the
 * ability radar must stop drawing a chart for a tier the child never sees.
 * Both read the same effective tag list, so storing the policy alone is enough.
 *
 * The whole policy is one JSON row in PlatformSettings rather than a table of
 * its own: it is a handful of keys, always read in full, and PlatformSettings
 * already exists in both storage modes.
 */

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../db/database');
const { TIER_IDS, normalizeClassname } = require('../engine/classTags');

const SETTING_KEY = 'mathTierPolicy';

// '' as the group means "the whole grade" — the fallback a group inherits until
// it is given a row of its own.
function policyKey(className, mathGroup) {
  return `${normalizeClassname(className) || ''}|${String(mathGroup || '').trim()}`;
}

function sanitizeTiers(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  for (const id of list) if (TIER_IDS.includes(id)) seen.add(id);
  return TIER_IDS.filter(id => seen.has(id));
}

function sanitizePolicy(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!/^P[1-6]\|/.test(key)) continue;
    out[key] = sanitizeTiers(value);
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

/** Set (or, with `disabledTiers === null`, clear) the rule for one class/group. */
async function setRule(className, mathGroup, disabledTiers) {
  const policy = await getPolicy();
  const key = policyKey(className, mathGroup);
  if (disabledTiers === null) delete policy[key];
  else policy[key] = sanitizeTiers(disabledTiers);
  return savePolicy(policy);
}

/**
 * The tiers a given student's class/group may not receive. A group-specific
 * rule replaces the grade-wide one outright — a group set to "nothing
 * disabled" is a deliberate exemption, not an oversight.
 */
function resolve(policy, className, mathGroup) {
  const grade = normalizeClassname(className);
  if (!grade) return [];
  const group = String(mathGroup || '').trim();
  if (group && policy[policyKey(grade, group)]) return policy[policyKey(grade, group)];
  return policy[policyKey(grade, '')] || [];
}

async function disabledTiersFor(className, mathGroup) {
  const grade = normalizeClassname(className);
  if (!grade) return [];
  return resolve(await getPolicy(), grade, mathGroup);
}

module.exports = { getPolicy, savePolicy, setRule, resolve, disabledTiersFor, policyKey, SETTING_KEY };
