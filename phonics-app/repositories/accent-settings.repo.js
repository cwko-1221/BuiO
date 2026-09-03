'use strict';

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../../math-app/db/database');

const DEFAULT_ACCENT = 'en-gb';
const ACCENTS = Object.freeze({
  'en-gb': '英式英語',
  'en-us': '美式英語',
});

function normalizeAccent(value) {
  const accent = String(value || '').toLowerCase();
  return Object.hasOwn(ACCENTS, accent) ? accent : DEFAULT_ACCENT;
}

let schemaPromise;
async function ensureSchema() {
  if (config.db.mode !== 'postgres') return;
  if (!schemaPromise) schemaPromise = getPool().query(`
    CREATE TABLE IF NOT EXISTS PhonicsClassSettings (
      AcademicYear VARCHAR(10) NOT NULL,
      ClassName VARCHAR(20) NOT NULL,
      Accent VARCHAR(10) NOT NULL DEFAULT 'en-gb'
        CHECK (Accent IN ('en-gb', 'en-us')),
      UpdatedBy VARCHAR(20),
      UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (AcademicYear, ClassName)
    );
  `).catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}

function jsonSettings() {
  const data = store.load();
  if (!Array.isArray(data.phonicsClassSettings)) {
    data.phonicsClassSettings = [];
    store.save();
  }
  return data.phonicsClassSettings;
}

async function listClassAccents(academicYear) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`SELECT
      ClassName AS "className", Accent AS accent, UpdatedBy AS "updatedBy",
      UpdatedAt AS "updatedAt"
      FROM PhonicsClassSettings WHERE AcademicYear=$1 ORDER BY ClassName`, [academicYear]);
    return rows.map(row => ({ ...row, accent: normalizeAccent(row.accent) }));
  }
  return jsonSettings()
    .filter(row => row.academicYear === academicYear)
    .map(row => ({ ...row, accent: normalizeAccent(row.accent) }));
}

async function getClassAccent(academicYear, className) {
  const row = (await listClassAccents(academicYear)).find(item => item.className === className);
  return row?.accent || DEFAULT_ACCENT;
}

async function setClassAccent({ academicYear, className, accent, updatedBy }) {
  await ensureSchema();
  const normalized = normalizeAccent(accent);
  if (normalized !== accent) {
    throw Object.assign(new Error('只可選擇英式或美式英語'), { statusCode: 400 });
  }
  const setting = {
    academicYear,
    className,
    accent: normalized,
    updatedBy: updatedBy || null,
    updatedAt: new Date().toISOString(),
  };
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`INSERT INTO PhonicsClassSettings
      (AcademicYear, ClassName, Accent, UpdatedBy, UpdatedAt)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (AcademicYear, ClassName) DO UPDATE SET
        Accent=EXCLUDED.Accent, UpdatedBy=EXCLUDED.UpdatedBy, UpdatedAt=EXCLUDED.UpdatedAt
      RETURNING AcademicYear AS "academicYear", ClassName AS "className",
        Accent AS accent, UpdatedBy AS "updatedBy", UpdatedAt AS "updatedAt"`, [
      setting.academicYear, setting.className, setting.accent,
      setting.updatedBy, setting.updatedAt,
    ]);
    return rows[0];
  }
  const settings = jsonSettings();
  const index = settings.findIndex(row => row.academicYear === academicYear && row.className === className);
  if (index >= 0) settings[index] = setting;
  else settings.push(setting);
  store.save();
  return setting;
}

module.exports = {
  ACCENTS,
  DEFAULT_ACCENT,
  normalizeAccent,
  ensureSchema,
  listClassAccents,
  getClassAccent,
  setClassAccent,
};
