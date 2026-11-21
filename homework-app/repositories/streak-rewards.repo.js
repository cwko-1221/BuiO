'use strict';

const { randomUUID } = require('node:crypto');
const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool, withTransaction } = require('../../math-app/db/database');
const academicYears = require('../../math-app/repositories/academic-years.repo');
const pet = require('../../pet-app/repositories/pet.repo');
const homework = require('./homework.repo');
const terms = require('./terms.repo');
const { rewardDays, shiftDate } = require('../lib/terms');
const { todayHongKong } = require('../lib/domain');

const KIND = 'homework_streak';
const isSchoolClass = name => /^P[1-6]$/.test(name);
let schemaPromise;

async function ensureSchema() {
  if (config.db.mode !== 'postgres') return;
  if (!schemaPromise) schemaPromise = getPool().query(`
    CREATE TABLE IF NOT EXISTS HomeworkRewardProgress (
      AcademicYear VARCHAR(10) NOT NULL,
      StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
      SettledDate DATE NOT NULL, Streak INTEGER NOT NULL, Coins INTEGER NOT NULL,
      PRIMARY KEY (AcademicYear, StudentID)
    );
    ALTER TABLE HomeworkRewardProgress ENABLE ROW LEVEL SECURITY;
  `).catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}

async function getProgress(year, studentId) {
  if (config.db.mode !== 'postgres') {
    const students = store.load().homeworkRewardProgress?.[year];
    return students && Object.hasOwn(students, studentId) ? students[studentId] : null;
  }
  await ensureSchema();
  const { rows } = await getPool().query(`SELECT SettledDate::text AS date, Streak AS streak, Coins AS coins
    FROM HomeworkRewardProgress WHERE AcademicYear=$1 AND StudentID=$2`, [year, studentId]);
  return rows[0] || null;
}

function calculate(days, students, missing, paid) {
  const missingByStudent = new Map();
  for (const { studentId, date } of missing) {
    if (!missingByStudent.has(studentId)) missingByStudent.set(studentId, new Set());
    missingByStudent.get(studentId).add(date);
  }
  const paidByDay = new Map(paid.map(row => [`${row.studentId}:${row.date}`, Number(row.coins)]));
  const calendar = days.map(day => ({ ...day, previousDate: shiftDate(day.date, -1) }));
  const credits = [];
  const progress = [];
  for (const { studentId, enrolledOn } of students) {
    let latest = null;
    for (const { date, term, baseCoins, previousDate } of calendar) {
      if (enrolledOn && date < enrolledOn) continue;
      const streak = missingByStudent.get(studentId)?.has(date) ? 0 : 1 + (latest?.date === previousDate ? latest.streak : 0);
      const coins = streak * baseCoins;
      latest = { studentId, date, streak, coins };
      // A restored streak can increase several past rewards. Credit the unpaid difference for each day.
      const delta = coins - (paidByDay.get(`${studentId}:${date}`) || 0);
      if (delta > 0) credits.push({ studentId, date, term, streak, coins, delta });
    }
    if (latest) progress.push(latest);
  }
  return { credits, progress };
}

async function settlePostgres(year, today) {
  await Promise.all([ensureSchema(), pet.ensureSchema(), homework.ensureSchema()]);
  return withTransaction(async client => {
    const settings = await terms.getSettings(year, { client, lock: true });
    const days = rewardDays(settings, today);
    if (!days.length) return;
    const students = await client.query(`SELECT e.StudentID AS "studentId",
      (e.CreatedAt AT TIME ZONE 'Asia/Hong_Kong')::date::text AS "enrolledOn"
      FROM StudentAcademicYears e JOIN Users u USING (StudentID)
      WHERE e.AcademicYear=$1 AND u.Role='student' AND e.ClassName ~ '^P[1-6]$'`, [year]);
    const missing = await client.query(`SELECT DISTINCT status->>'studentId' AS "studentId", r.RecordDate::text AS date
      FROM HomeworkRecords r
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.Homeworks)='array' THEN r.Homeworks ELSE '[]'::jsonb END) AS hw
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(hw->'statuses')='array' THEN hw->'statuses' ELSE '[]'::jsonb END) AS status
      WHERE r.AcademicYear=$1 AND r.RecordDate BETWEEN $2 AND $3 AND status->>'status' IN ('missing','made_up')`,
    [year, days[0].date, days.at(-1).date]);
    const paid = await client.query(`SELECT StudentID AS "studentId", Metadata->>'date' AS date, SUM(Delta) AS coins
      FROM PetCurrencyLedger WHERE Kind='homework_streak' AND Metadata->>'academicYear'=$1 GROUP BY StudentID, Metadata->>'date'`, [year]);
    const { credits, progress } = calculate(days, students.rows, missing.rows, paid.rows);
    if (credits.length) {
      const ids = [...new Set(credits.map(row => row.studentId))];
      await client.query(`INSERT INTO PetWallets (StudentID) SELECT id FROM unnest($1::text[]) AS id
        ORDER BY id ON CONFLICT DO NOTHING`, [ids]);
      await client.query('SELECT StudentID FROM PetWallets WHERE StudentID=ANY($1::text[]) ORDER BY StudentID FOR UPDATE', [ids]);
      await client.query(`WITH entries AS (
        INSERT INTO PetCurrencyLedger (TransactionID, StudentID, Delta, Kind, IdempotencyKey, Metadata)
        SELECT gen_random_uuid(), c."studentId", c.delta, $1::text,
          concat($1::text, ':', $2::text, ':', c.date, ':', c.coins),
          jsonb_build_object('academicYear', $2::text, 'date', c.date, 'term', c.term, 'streak', c.streak, 'coins', c.coins)
        FROM jsonb_to_recordset($3::jsonb) AS c("studentId" text, date text, term text, streak int, coins int, delta int)
        ON CONFLICT DO NOTHING
        RETURNING StudentID, Delta
      ), totals AS (
        SELECT StudentID, SUM(Delta) AS coins FROM entries GROUP BY StudentID
      )
      UPDATE PetWallets w SET Balance=w.Balance+t.coins, UpdatedAt=NOW() FROM totals t WHERE w.StudentID=t.StudentID`,
      [KIND, year, JSON.stringify(credits)]);
    }
    await client.query(`INSERT INTO HomeworkRewardProgress (AcademicYear, StudentID, SettledDate, Streak, Coins)
      SELECT $1, p."studentId", p.date, p.streak, p.coins
      FROM jsonb_to_recordset($2::jsonb) AS p("studentId" text, date date, streak int, coins int)
      ON CONFLICT (AcademicYear, StudentID) DO UPDATE SET SettledDate=EXCLUDED.SettledDate,
        Streak=EXCLUDED.Streak, Coins=EXCLUDED.Coins
      WHERE (HomeworkRewardProgress.SettledDate, HomeworkRewardProgress.Streak, HomeworkRewardProgress.Coins)
        IS DISTINCT FROM (EXCLUDED.SettledDate, EXCLUDED.Streak, EXCLUDED.Coins)`, [year, JSON.stringify(progress)]);
  });
}

function settleJson(year, today) {
  const data = store.load();
  const days = rewardDays(data.homeworkTermSettings?.[year], today);
  if (!days.length) return;
  const studentIds = new Set(data.users.filter(user => user.role === 'student').map(user => user.studentid));
  const students = (data.studentAcademicYears || []).filter(row =>
    row.academicYear === year && isSchoolClass(row.className) && studentIds.has(row.studentId))
    .map(row => ({ studentId: row.studentId, enrolledOn: row.createdAt && todayHongKong(new Date(row.createdAt)) }));
  const missing = [];
  for (const record of data.homeworkRecords || []) {
    if (record.academicYear !== year || record.date < days[0].date || record.date > days.at(-1).date) continue;
    for (const assignment of Array.isArray(record.homeworks) ? record.homeworks : []) {
      for (const row of Array.isArray(assignment.statuses) ? assignment.statuses : []) {
        if (row.status === 'missing' || row.status === 'made_up') missing.push({ studentId: row.studentId, date: record.date });
      }
    }
  }
  const previousLedger = data.petCurrencyLedger;
  const previousWallets = data.petWallets;
  const previousProgress = data.homeworkRewardProgress;
  const totals = new Map();
  for (const row of previousLedger || []) {
    if (row.kind !== KIND || row.metadata?.academicYear !== year) continue;
    const { date } = row.metadata;
    const key = `${row.studentId}:${date}`;
    totals.set(key, { studentId: row.studentId, date, coins: (totals.get(key)?.coins || 0) + row.delta });
  }
  const { credits, progress } = calculate(days, students, missing, [...totals.values()]);
  const latest = Object.fromEntries(progress.map(({ studentId, ...value }) => [studentId, value]));
  if (!credits.length && JSON.stringify(latest) === JSON.stringify(previousProgress?.[year])) return;
  if (credits.length) {
    const now = new Date().toISOString();
    const wallets = new Map((previousWallets || []).map(row => [row.studentId, row]));
    const entries = credits.map(({ studentId, delta, ...metadata }) => {
      wallets.set(studentId, { studentId, balance: (wallets.get(studentId)?.balance || 0) + delta, updatedAt: now });
      return { transactionId: randomUUID(), studentId, delta, kind: KIND, createdAt: now,
        idempotencyKey: `${KIND}:${year}:${metadata.date}:${metadata.coins}`, metadata: { academicYear: year, ...metadata } };
    });
    data.petWallets = [...wallets.values()];
    data.petCurrencyLedger = [...(previousLedger || []), ...entries];
  }
  data.homeworkRewardProgress = { ...previousProgress, [year]: latest };
  try { store.save(); }
  catch (error) {
    data.petWallets = previousWallets;
    data.petCurrencyLedger = previousLedger;
    data.homeworkRewardProgress = previousProgress;
    throw error;
  }
}

async function settleYear(year, today = todayHongKong()) {
  const settings = await terms.getSettings(year);
  if (!rewardDays(settings, today).length) return;
  if (config.db.mode === 'postgres') return settlePostgres(year, today);
  settleJson(year, today);
}

const retries = new Map();
async function reconcile(year) {
  try {
    await settleYear(year);
    clearTimeout(retries.get(year));
    retries.delete(year);
  } catch (error) {
    console.error('[homework rewards]', year, error.message);
    if (!retries.has(year)) retries.set(year, setTimeout(() => {
      retries.delete(year);
      void reconcile(year);
    }, 60000).unref());
  }
}

function startSettlement() {
  async function run(scheduledDay) {
    try {
      const today = todayHongKong();
      const yesterday = shiftDate(today, -1);
      for (const [year, settings] of Object.entries(await terms.listSettings())) {
        if (scheduledDay !== today || rewardDays(settings, today).at(-1)?.date === yesterday) await reconcile(year);
      }
      const tomorrow = shiftDate(today, 1);
      const midnight = new Date(`${tomorrow}T00:00:00+08:00`).getTime();
      setTimeout(run, Math.max(0, midnight - Date.now()), tomorrow).unref();
    } catch (error) {
      console.error('[homework reward scheduler]', error.message);
      setTimeout(run, 60000).unref();
    }
  }
  void run();
}

module.exports = { getProgress, settleYear, reconcile, startSettlement };
