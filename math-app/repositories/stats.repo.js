'use strict';

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../db/database');

const UPSERT_SQL = `
  INSERT INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate)
  VALUES ($1, $2, 1, $3, $3 * 100)
  ON CONFLICT (StudentID, Tag) DO UPDATE
    SET TotalAttempted = StudentStats.TotalAttempted + 1,
        TotalCorrect   = StudentStats.TotalCorrect + EXCLUDED.TotalCorrect,
        AccuracyRate   = ROUND(
          CAST(StudentStats.TotalCorrect + EXCLUDED.TotalCorrect AS NUMERIC)
          / (StudentStats.TotalAttempted + 1) * 100, 2)
`;

async function ensureTagsForStudent(studentId, allTags, { client } = {}) {
  if (config.db.mode === 'postgres') {
    const runner = client || getPool();
    for (const tag of allTags) {
      await runner.query(`
        INSERT INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate)
        VALUES ($1, $2, 0, 0, 0.0)
        ON CONFLICT (StudentID, Tag) DO NOTHING`, [studentId, tag]);
    }
    return;
  }
  const d = store.load();
  for (const tag of allTags) {
    if (!d.studentStats.find(s => s.studentid === studentId && s.tag === tag)) {
      d.studentStats.push({ studentid: studentId, tag, totalattempted: 0, totalcorrect: 0, accuracyrate: 0 });
    }
  }
  store.save();
}

async function recordAttempt(studentId, tag, isCorrect, { client } = {}) {
  if (config.db.mode === 'postgres') {
    const runner = client || getPool();
    await runner.query(UPSERT_SQL, [studentId, tag, isCorrect ? 1 : 0]);
    return;
  }
  const d = store.load();
  let s = d.studentStats.find(x => x.studentid === studentId && x.tag === tag);
  if (!s) {
    s = { studentid: studentId, tag, totalattempted: 0, totalcorrect: 0, accuracyrate: 0 };
    d.studentStats.push(s);
  }
  s.totalattempted += 1;
  if (isCorrect) s.totalcorrect += 1;
  s.accuracyrate = s.totalattempted > 0 ? Math.round((s.totalcorrect / s.totalattempted) * 1000) / 10 : 0;
  store.save();
}

async function overview(studentId, allTags) {
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT COALESCE(SUM(TotalAttempted), 0) AS totalquestions,
             COALESCE(SUM(TotalCorrect), 0) AS totalcorrect,
             CASE WHEN SUM(TotalAttempted) > 0
                  THEN ROUND(CAST(SUM(TotalCorrect) AS NUMERIC) / SUM(TotalAttempted) * 100, 1)
                  ELSE 0 END AS overallaccuracy
      FROM StudentStats
      WHERE StudentID = $1 AND Tag = ANY($2::text[])`, [studentId, allTags]);
    return rows[0];
  }
  const stats = store.load().studentStats.filter(
    s => s.studentid === studentId && allTags.includes(s.tag));
  const tq = stats.reduce((a, b) => a + (b.totalattempted || 0), 0);
  const tc = stats.reduce((a, b) => a + (b.totalcorrect || 0), 0);
  return {
    totalquestions: tq,
    totalcorrect: tc,
    overallaccuracy: tq > 0 ? Math.round((tc / tq) * 1000) / 10 : 0,
  };
}

async function tagBreakdown(studentId, allTags) {
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT Tag AS tag, TotalAttempted AS totalattempted,
             TotalCorrect AS totalcorrect, AccuracyRate AS accuracyrate
      FROM StudentStats
      WHERE StudentID = $1 AND Tag = ANY($2::text[])
      ORDER BY Tag`, [studentId, allTags]);
    return rows;
  }
  return store.load().studentStats
    .filter(s => s.studentid === studentId && allTags.includes(s.tag))
    .map(s => ({
      tag: s.tag,
      totalattempted: s.totalattempted,
      totalcorrect: s.totalcorrect,
      accuracyrate: s.accuracyrate,
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag));
}

async function weaknesses(studentId, allTags, threshold = 70) {
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT Tag AS tag, TotalAttempted AS totalattempted,
             TotalCorrect AS totalcorrect, AccuracyRate AS accuracyrate
      FROM StudentStats
      WHERE StudentID = $1 AND TotalAttempted > 0 AND AccuracyRate < $3 AND Tag = ANY($2::text[])
      ORDER BY AccuracyRate ASC`, [studentId, allTags, threshold]);
    return rows;
  }
  return store.load().studentStats
    .filter(s => s.studentid === studentId && allTags.includes(s.tag) && s.totalattempted > 0 && s.accuracyrate < threshold)
    .sort((a, b) => a.accuracyrate - b.accuracyrate);
}

module.exports = {
  ensureTagsForStudent,
  recordAttempt,
  overview,
  tagBreakdown,
  weaknesses,
};
