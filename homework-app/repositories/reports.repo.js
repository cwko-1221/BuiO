'use strict';

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../../math-app/db/database');
let schemaPromise;

async function ensureSchema() {
  if (config.db.mode !== 'postgres') return;
  if (!schemaPromise) schemaPromise = getPool().query(`CREATE TABLE IF NOT EXISTS HomeworkReportStates (
    AcademicYear VARCHAR(10) PRIMARY KEY, Revision INTEGER NOT NULL,
    State JSONB NOT NULL, UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}

async function getState(academicYear) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query('SELECT Revision AS revision, State AS state FROM HomeworkReportStates WHERE AcademicYear=$1', [academicYear]);
    return rows[0] ? { ...rows[0].state, revision: rows[0].revision } : { revision: 0, versions: [], tasks: [] };
  }
  const row = (store.load().homeworkReportStates || []).find(item => item.academicYear === academicYear);
  return row ? structuredClone(row.state) : { revision: 0, versions: [], tasks: [] };
}

async function saveState(academicYear, state, expectedRevision) {
  await ensureSchema();
  const next = { ...state, revision: expectedRevision + 1 };
  const conflict = () => Object.assign(new Error('總表已被其他老師更新，請重新載入後再試。'), { status: 409 });
  if (config.db.mode === 'postgres') {
    const query = expectedRevision === 0
      ? `INSERT INTO HomeworkReportStates (AcademicYear,Revision,State) VALUES ($1,$2,$3::jsonb) ON CONFLICT DO NOTHING RETURNING Revision`
      : `UPDATE HomeworkReportStates SET Revision=$2,State=$3::jsonb,UpdatedAt=NOW() WHERE AcademicYear=$1 AND Revision=$4 RETURNING Revision`;
    const values = [academicYear, next.revision, JSON.stringify(next)];
    if (expectedRevision !== 0) values.push(expectedRevision);
    const result = await getPool().query(query, values);
    if (!result.rowCount) throw conflict();
  } else {
    const data = store.load();
    const rows = data.homeworkReportStates || [];
    const existing = rows.find(item => item.academicYear === academicYear);
    if ((existing?.state.revision || 0) !== expectedRevision) throw conflict();
    const previous = data.homeworkReportStates;
    data.homeworkReportStates = rows.filter(item => item.academicYear !== academicYear).concat({ academicYear, state: next });
    try { store.save(); } catch (error) { data.homeworkReportStates = previous; throw error; }
  }
  return next;
}

module.exports = { getState, saveState, ensureSchema };
