'use strict';

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool, withTransaction } = require('../../math-app/db/database');
const academicYears = require('../../math-app/repositories/academic-years.repo');
const { publicSettings, updateSchedule } = require('../lib/terms');
const { todayHongKong } = require('../lib/domain');

const prefix = 'homeworkTerms:';

async function getSettings(year, { client, lock = false } = {}) {
  await academicYears.ensureSchema();
  if (config.db.mode !== 'postgres') return store.load().homeworkTermSettings?.[year] || null;
  const { rows } = await (client || getPool()).query(
    `SELECT SettingValue AS value FROM PlatformSettings WHERE SettingKey=$1 ${lock ? 'FOR UPDATE' : ''}`,
    [prefix + year],
  );
  return rows[0] ? JSON.parse(rows[0].value) : null;
}

async function listSettings() {
  await academicYears.ensureSchema();
  if (config.db.mode !== 'postgres') return store.load().homeworkTermSettings || {};
  const { rows } = await getPool().query(
    'SELECT SettingKey AS key, SettingValue AS value FROM PlatformSettings WHERE SettingKey LIKE $1',
    [prefix + '%'],
  );
  return Object.fromEntries(rows.map(row => [row.key.slice(prefix.length), JSON.parse(row.value)]));
}

async function saveSettings(year, settings) {
  await academicYears.ensureSchema();
  if (config.db.mode === 'postgres') {
    return withTransaction(async client => {
      await client.query(`INSERT INTO PlatformSettings (SettingKey, SettingValue) VALUES ($1, '{}')
        ON CONFLICT (SettingKey) DO NOTHING`, [prefix + year]);
      const previous = await getSettings(year, { client, lock: true });
      const saved = updateSchedule(previous, settings, todayHongKong());
      await client.query('UPDATE PlatformSettings SET SettingValue=$2, UpdatedAt=NOW() WHERE SettingKey=$1',
        [prefix + year, JSON.stringify(saved)]);
      return saved;
    });
  }
  const data = store.load();
  const previous = data.homeworkTermSettings;
  const saved = updateSchedule(previous?.[year], settings, todayHongKong());
  data.homeworkTermSettings = { ...previous, [year]: saved };
  try { store.save(); }
  catch (error) { data.homeworkTermSettings = previous; throw error; }
  return saved;
}

async function listPublicSettings() {
  const settings = await listSettings();
  return Object.fromEntries(Object.entries(settings).map(([year, value]) => [year, publicSettings(value)]));
}

module.exports = { getSettings, listSettings, listPublicSettings, saveSettings };
