'use strict';
const { randomUUID } = require('node:crypto');
const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool, withTransaction } = require('../../math-app/db/database');
const pets = require('./pet.repo');
const academicYears = require('../../math-app/repositories/academic-years.repo');
const rules = require('../lib/brawl-ranking.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
let schema;

async function ensure() {
  await pets.ensureSchema();
  if (config.db.mode === 'json') { store.load().petBrawlRanks ??= []; return; }
  schema ??= getPool().query(`CREATE TABLE IF NOT EXISTS PetBrawlRanks (
    StudentID VARCHAR(20) PRIMARY KEY REFERENCES Users(StudentID) ON DELETE CASCADE,
    State JSONB NOT NULL, UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );`).catch(error => { schema = null; throw error; });
  await schema;
}
async function profiles(ids) {
  await ensure();
  const rows = config.db.mode === 'postgres'
    ? (await getPool().query('SELECT State AS state FROM PetBrawlRanks WHERE StudentID=ANY($1::text[])', [ids])).rows.map(row => row.state)
    : store.load().petBrawlRanks.filter(row => ids.includes(row.studentId));
  return ids.map(id => copy(rows.find(row => row.studentId === id) || rules.initial(id)));
}
// Call after locking wallets in sorted order, inside the duel transaction.
async function lockProfiles(client, ids) {
  for (const id of ids) await client.query('INSERT INTO PetBrawlRanks (StudentID,State) VALUES ($1,$2::jsonb) ON CONFLICT DO NOTHING', [id, JSON.stringify(rules.initial(id))]);
  return (await client.query('SELECT State AS state FROM PetBrawlRanks WHERE StudentID=ANY($1::text[]) ORDER BY StudentID FOR UPDATE', [ids])).rows.map(row => row.state);
}
function jsonProfiles(ids) {
  const rows = store.load().petBrawlRanks;
  return ids.map(id => { let p = rows.find(row => row.studentId === id); if (!p) { p = rules.initial(id); rows.push(p); } return p; });
}
function assertSameTier(rows, expectedTier) {
  if (rows.length !== 2 || rows[0].tier !== rows[1].tier || (expectedTier != null && rows.some(p => p.tier !== expectedTier))) {
    throw Object.assign(new Error('排名對戰只限相同級別；級別已改變，請重新邀請。'), { status: 409 });
  }
}
async function payPg(client, profile, at) {
  const plan = rules.rewardPlan(profile, at); if (!plan) return 0;
  const inserted = await client.query(`INSERT INTO PetCurrencyLedger
    (TransactionID,StudentID,ActorID,Delta,Kind,IdempotencyKey,Metadata)
    VALUES ($1,$2,$2,$3,'brawl_rank_daily',$4,$5::jsonb) ON CONFLICT DO NOTHING RETURNING TransactionID`,
  [randomUUID(), profile.studentId, plan.amount, plan.key, JSON.stringify(plan)]);
  if (inserted.rowCount) await client.query('UPDATE PetWallets SET Balance=Balance+$2,UpdatedAt=NOW() WHERE StudentID=$1', [profile.studentId, plan.amount]);
  rules.markPaid(profile, plan);
  return inserted.rowCount ? plan.amount : 0;
}
function payJson(profile, at) {
  const d = store.load(), plan = rules.rewardPlan(profile, at); if (!plan) return 0;
  const wallet = d.petWallets.find(w => w.studentId === profile.studentId);
  if (!wallet) return 0;
  const old = d.petCurrencyLedger.some(row => row.studentId === profile.studentId && row.idempotencyKey === plan.key);
  if (!old) {
    wallet.balance += plan.amount; wallet.updatedAt = new Date(at).toISOString();
    d.petCurrencyLedger.push({ transactionId: randomUUID(), studentId: profile.studentId, actorId: profile.studentId, delta: plan.amount,
      kind: 'brawl_rank_daily', idempotencyKey: plan.key, metadata: plan, createdAt: wallet.updatedAt });
  }
  rules.markPaid(profile, plan); return old ? 0 : plan.amount;
}
async function savePg(client, p) { await client.query('UPDATE PetBrawlRanks SET State=$2::jsonb,UpdatedAt=NOW() WHERE StudentID=$1', [p.studentId, JSON.stringify(p)]); }
function recordResult(state, rows, at) {
  return state.players.map((player, index) => {
    const profile = rows.find(p => p.studentId === player.id), beforeTier = profile.tier;
    rules.record(profile, state.winnerIndex == null ? null : state.winnerIndex === index, at);
    return { studentId: player.id, beforeTier, promoted: profile.tier > beforeTier, ...rules.publicRank(profile) };
  });
}
async function finishPg(client, state, at = Date.now()) {
  const rows = await lockProfiles(client, state.players.map(p => p.id).sort());
  for (const row of rows) await payPg(client, row, at);
  const results = recordResult(state, rows, at);
  for (const row of rows) { const coins = await payPg(client, row, at); await savePg(client, row); results.find(r => r.studentId === row.studentId).promotionCoins = coins; }
  state.rankResults = results;
}
function finishJson(state, at = Date.now()) {
  const rows = jsonProfiles(state.players.map(p => p.id));
  for (const row of rows) payJson(row, at);
  const results = recordResult(state, rows, at);
  for (const row of rows) results.find(r => r.studentId === row.studentId).promotionCoins = payJson(row, at);
  state.rankResults = results;
}
async function currentStudents() {
  const academicYear = await academicYears.getCurrentAcademicYear();
  const students = (await academicYears.listEnrollments(academicYear)).filter(row => row.role !== 'teacher' && row.className !== 'Graduated');
  return { academicYear, students };
}
// Pays every eligible ranked student, including offline students. Runs at startup
// and once per minute; the durable reward cursor catches up after server downtime.
async function distribute(at = Date.now(), onlyId) {
  await ensure();
  const { students } = await currentStudents();
  const eligible = new Set(students.map(row => row.studentId).filter(id => !onlyId || id === onlyId));
  if (config.db.mode === 'postgres') {
    const rows = (await getPool().query('SELECT State AS state FROM PetBrawlRanks WHERE StudentID=ANY($1::text[])', [[...eligible]])).rows.map(r => r.state).filter(p => rules.rewardPlan(p, at));
    let amount = 0;
    for (const p of rows) amount += await withTransaction(async client => {
      const wallet = await client.query('SELECT StudentID FROM PetWallets WHERE StudentID=$1 FOR UPDATE', [p.studentId]);
      if (!wallet.rowCount) return 0;
      const row = (await client.query('SELECT State AS state FROM PetBrawlRanks WHERE StudentID=$1 FOR UPDATE', [p.studentId])).rows[0]?.state;
      if (!row) return 0;
      const paid = await payPg(client, row, at); await savePg(client, row); return paid;
    });
    return amount;
  }
  const d = store.load(), rows = d.petBrawlRanks.filter(p => eligible.has(p.studentId) && rules.rewardPlan(p, at));
  if (!rows.length) return 0;
  const before = copy(d.petBrawlRanks), wallets = copy(d.petWallets), length = d.petCurrencyLedger.length;
  try { const amount = rows.reduce((total, p) => total + payJson(p, at), 0); store.save(); return amount; }
  catch (error) { d.petBrawlRanks = before; for (const w of wallets) Object.assign(d.petWallets.find(row => row.studentId === w.studentId), w); d.petCurrencyLedger.length = length; throw error; }
}
async function overview(studentId) {
  await distribute(Date.now(), studentId);
  const { academicYear, students } = await currentStudents(), ids = students.map(row => row.studentId);
  const ranks = await profiles([...new Set([...ids, studentId])]);
  const leaderboard = students.map(student => ({ ...rules.publicRank(ranks.find(row => row.studentId === student.studentId)), name: student.name, className: student.className }))
    .sort(rules.compare).map((row, index) => ({ ...row, position: index + 1 }));
  return { academicYear, day: rules.hkDay(), tiers: rules.TIERS, self: rules.publicRank(ranks.find(p => p.studentId === studentId)), leaderboard,
    position: leaderboard.find(p => p.studentId === studentId)?.position || null };
}
module.exports = { ensure, profiles, lockProfiles, jsonProfiles, assertSameTier, finishPg, finishJson, distribute, overview, publicRank: rules.publicRank };
