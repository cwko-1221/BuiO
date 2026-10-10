'use strict';

const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../db/database');

// Hong Kong has no daylight-saving changes. Keep the database predicate on the
// timestamp itself, so existing time indexes remain usable in either DB mode.
function hongKongDayBounds(now = new Date()) {
  const day = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00+08:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
}

async function insert(log, { client } = {}) {
  const params = [
    log.studentId, log.tag, log.questionText, log.correctAnswer,
    log.userAnswer, !!log.isCorrect, log.timeSpent,
  ];
  if (config.db.mode === 'postgres') {
    const runner = client || getPool();
    await runner.query(`
      INSERT INTO QuestionLogs (StudentID, Tag, Question, CorrectAnswer, UserAnswer, IsCorrect, TimeSpent)
      VALUES ($1,$2,$3,$4,$5,$6,$7)`, params);
    return;
  }
  store.load().questionLogs.push({
    id: store.nextLogId(),
    studentid: log.studentId,
    tag: log.tag,
    question: log.questionText,
    correctanswer: log.correctAnswer,
    useranswer: log.userAnswer,
    iscorrect: !!log.isCorrect,
    timespent: log.timeSpent,
    timestamp: new Date().toISOString(),
  });
  store.save();
}

async function insertMany(logs, { client } = {}) {
  if (!logs || logs.length === 0) return;

  if (config.db.mode === 'postgres') {
    const runner = client || getPool();
    const values = [];
    const placeholders = logs.map((log, index) => {
      const offset = index * 7;
      values.push(
        log.studentId, log.tag, log.questionText, log.correctAnswer,
        log.userAnswer, !!log.isCorrect, log.timeSpent,
      );
      return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7})`;
    });
    await runner.query(`
      INSERT INTO QuestionLogs (StudentID, Tag, Question, CorrectAnswer, UserAnswer, IsCorrect, TimeSpent)
      VALUES ${placeholders.join(',')}`, values);
    return;
  }

  const d = store.load();
  for (const log of logs) {
    d.questionLogs.push({
      id: store.nextLogId(),
      studentid: log.studentId,
      tag: log.tag,
      question: log.questionText,
      correctanswer: log.correctAnswer,
      useranswer: log.userAnswer,
      iscorrect: !!log.isCorrect,
      timespent: log.timeSpent,
      timestamp: new Date().toISOString(),
    });
  }
  store.save();
}

async function todayOverview(studentId, allTags) {
  const { start, end } = hongKongDayBounds();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT COUNT(*) AS todayquestions,
             COALESCE(SUM(CAST(IsCorrect AS INT)), 0) AS todaycorrect,
             CASE WHEN COUNT(*) > 0
                  THEN ROUND(CAST(SUM(CAST(IsCorrect AS INT)) AS NUMERIC) / COUNT(*) * 100, 1)
                  ELSE 0 END AS todayaccuracy,
             COALESCE(ROUND(CAST(AVG(TimeSpent) AS NUMERIC), 1), 0) AS avgtime
      FROM QuestionLogs
      WHERE StudentID = $1 AND Timestamp >= $3 AND Timestamp < $4 AND Tag = ANY($2::text[])`,
      [studentId, allTags, start, end]);
    return rows[0];
  }
  const logs = store.load().questionLogs.filter(
    l => l.studentid === studentId && allTags.includes(l.tag)
      && Date.parse(l.timestamp) >= Date.parse(start) && Date.parse(l.timestamp) < Date.parse(end));
  const tq = logs.length;
  const tc = logs.filter(l => l.iscorrect).length;
  const avg = tq > 0 ? Math.round((logs.reduce((a, l) => a + (l.timespent || 0), 0) / tq) * 10) / 10 : 0;
  return {
    todayquestions: tq,
    todaycorrect: tc,
    todayaccuracy: tq > 0 ? Math.round((tc / tq) * 1000) / 10 : 0,
    avgtime: avg,
  };
}

async function history(studentId, allTags, { limit = 50, offset = 0, tag = null } = {}) {
  limit = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 50));
  offset = Math.max(0, Number.parseInt(offset, 10) || 0);
  if (config.db.mode === 'postgres') {
    const params = [studentId, allTags];
    let sql = `
      SELECT ID AS logid, Tag AS tag, Question AS questiontext,
             CorrectAnswer AS correctanswer, UserAnswer AS useranswer,
             IsCorrect AS iscorrect, TimeSpent AS timetaken, Timestamp AS timestamp
      FROM QuestionLogs
      WHERE StudentID = $1 AND Tag = ANY($2::text[])`;
    if (tag) { params.push(tag); sql += ` AND Tag = $${params.length}`; }
    params.push(limit, offset);
    sql += ` ORDER BY Timestamp DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
    const { rows } = await getPool().query(sql, params);
    return rows;
  }
  let logs = store.load().questionLogs.filter(
    l => l.studentid === studentId && allTags.includes(l.tag));
  if (tag) logs = logs.filter(l => l.tag === tag);
  logs.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return logs.slice(offset, offset + limit).map(l => ({
    logid: l.id,
    tag: l.tag,
    questiontext: l.question,
    correctanswer: l.correctanswer,
    useranswer: l.useranswer,
    iscorrect: l.iscorrect,
    timetaken: l.timespent,
    timestamp: l.timestamp,
  }));
}

async function historyCount(studentId, allTags, { tag = null } = {}) {
  if (config.db.mode === 'postgres') {
    const params = [studentId, allTags];
    let sql = `SELECT COUNT(*)::int AS c FROM QuestionLogs WHERE StudentID = $1 AND Tag = ANY($2::text[])`;
    if (tag) { params.push(tag); sql += ` AND Tag = $${params.length}`; }
    const { rows } = await getPool().query(sql, params);
    return rows[0].c;
  }
  let logs = store.load().questionLogs.filter(
    l => l.studentid === studentId && allTags.includes(l.tag));
  if (tag) logs = logs.filter(l => l.tag === tag);
  return logs.length;
}

async function timeAnalysis(studentId, allTags) {
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT Tag AS tag, COUNT(*) AS count,
             ROUND(CAST(AVG(TimeSpent) AS NUMERIC), 1) AS avgtime,
             ROUND(CAST(MIN(TimeSpent) AS NUMERIC), 1) AS mintime,
             ROUND(CAST(MAX(TimeSpent) AS NUMERIC), 1) AS maxtime
      FROM QuestionLogs
      WHERE StudentID = $1 AND TimeSpent > 0 AND Tag = ANY($2::text[])
      GROUP BY Tag ORDER BY avgtime DESC`, [studentId, allTags]);
    return rows;
  }
  const logs = store.load().questionLogs.filter(
    l => l.studentid === studentId && allTags.includes(l.tag) && (l.timespent || 0) > 0);
  const byTag = new Map();
  for (const l of logs) {
    let agg = byTag.get(l.tag);
    if (!agg) { agg = { sum: 0, count: 0, min: Infinity, max: 0 }; byTag.set(l.tag, agg); }
    agg.sum += l.timespent; agg.count += 1;
    if (l.timespent < agg.min) agg.min = l.timespent;
    if (l.timespent > agg.max) agg.max = l.timespent;
  }
  return Array.from(byTag.entries())
    .map(([tag, a]) => ({
      tag, count: a.count,
      avgtime: Math.round((a.sum / a.count) * 10) / 10,
      mintime: a.min === Infinity ? 0 : a.min,
      maxtime: a.max,
    }))
    .sort((a, b) => b.avgtime - a.avgtime);
}

module.exports = {
  insert,
  insertMany,
  todayOverview,
  history,
  historyCount,
  timeAnalysis,
};
