'use strict';

const { randomUUID } = require('crypto');
const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool, withTransaction } = require('../../math-app/db/database');
const pet = require('./pet.repo');
const { settings, transition, advance, fail } = require('../lib/quiet-room');

let schemaPromise;
async function ensureSchema() {
  await pet.ensureSchema();
  if (config.db.mode !== 'postgres') {
    const data = store.load();
    if (!Array.isArray(data.petQuietRooms)) { data.petQuietRooms = []; store.save(); }
    return;
  }
  if (!schemaPromise) schemaPromise = getPool().query(`CREATE TABLE IF NOT EXISTS PetQuietRooms (
    SessionID UUID PRIMARY KEY, ActorID VARCHAR(20) NOT NULL, StartKey VARCHAR(120) NOT NULL,
    State JSONB NOT NULL, UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(ActorID, StartKey)
  ); CREATE INDEX IF NOT EXISTS idx_pet_quiet_actor ON PetQuietRooms(ActorID, UpdatedAt DESC);`)
    .catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}

// Serialize JSON writes; Postgres uses the same per-teacher lock across application instances.
let queue = Promise.resolve();
async function locked(actorId, operation) {
  await ensureSchema();
  if (config.db.mode === 'postgres') return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`pet-quiet:${actorId}`]);
    const { rows } = await client.query('SELECT State AS state FROM PetQuietRooms WHERE ActorID=$1 ORDER BY UpdatedAt DESC', [actorId]);
    const sessions = rows.map(row => row.state);
    const save = async session => client.query(`INSERT INTO PetQuietRooms(SessionID,ActorID,StartKey,State)
      VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(SessionID) DO UPDATE SET State=EXCLUDED.State,UpdatedAt=NOW()`,
    [session.id, actorId, session.startKey, JSON.stringify(session)]);
    return operation(sessions, save, client, async rows => { for (const row of rows) await save(row); });
  });
  const work = queue.then(async () => {
    const sessions = store.load().petQuietRooms;
    const save = async session => {
      const index = sessions.findIndex(row => row.id === session.id);
      if (index < 0) sessions.push(session); else sessions[index] = session;
      store.save();
    };
    const saveMany = async rows => {
      const data = store.load(), before = data.petQuietRooms, changes = new Map(rows.map(row => [row.id, row]));
      data.petQuietRooms = before.map(row => changes.get(row.id) || row).concat(rows.filter(row => !before.some(old => old.id === row.id)));
      try { store.save(); } catch (error) { data.petQuietRooms = before; throw error; }
    };
    return operation(sessions.filter(row => row.actorId === actorId).map(row => structuredClone(row)), save, null, saveMany);
  });
  queue = work.catch(() => {});
  return work;
}

async function settle(session, client) {
  if (session.status !== 'completed' || session.payout) return;
  const amount = session.remainingReward;
  const count = session.studentIds.length;
  const batchId = randomUUID();
  const note = `安靜房間 · ${session.targetLabel} · 超標 ${session.breaches} 次`;
  if (client && amount > 0) {
    for (const studentId of [...session.studentIds].sort()) {
      await pet.ensureStudent(studentId, client);
      await client.query('UPDATE PetWallets SET Balance=Balance+$2,UpdatedAt=NOW() WHERE StudentID=$1', [studentId, amount]);
      await client.query(`INSERT INTO PetCurrencyLedger(TransactionID,StudentID,ActorID,Delta,Kind,BatchID,Note,Metadata)
        VALUES($1,$2,$3,$4,'teacher_grant',$5,$6,$7::jsonb)`,
      [randomUUID(), studentId, session.actorId, amount, batchId, note, JSON.stringify({ quietRoomId: session.id })]);
    }
  } else if (amount > 0) {
    // Ensure wallets before the synchronous mutation below, so no partial grant is observable.
    for (const studentId of session.studentIds) await pet.ensureStudent(studentId);
    const data = store.load();
    for (const studentId of session.studentIds) {
      const wallet = data.petWallets.find(row => row.studentId === studentId);
      wallet.balance += amount;
      wallet.updatedAt = new Date().toISOString();
      data.petCurrencyLedger.push({ transactionId: randomUUID(), studentId, actorId: session.actorId, delta: amount,
        kind: 'teacher_grant', batchId, note, metadata: { quietRoomId: session.id }, createdAt: new Date().toISOString() });
    }
  }
  session.payout = { amount, count, total: amount * count, batchId };
}

function view(session) {
  if (!session) return null;
  const { events, startKey, actorId, studentIds, ...visible } = session;
  return { ...visible, count: studentIds.length, serverNow: Date.now() };
}

async function start(actorId, body, recipients, startKey, targetLabel) {
  const options = settings(body);
  if (!startKey) fail('缺少防重複提交識別碼。');
  if (!recipients.length) fail('請先選擇有學生的班別或組別。');
  return locked(actorId, async (sessions, save, client) => {
    const cached = sessions.find(row => row.startKey === startKey);
    if (cached) { advance(cached, Date.now()); await settle(cached, client); await save(cached); return view(cached); }
    const active = sessions.find(row => ['running', 'paused'].includes(row.status));
    if (active) { advance(active, Date.now()); await settle(active, client); await save(active); }
    if (active && ['running', 'paused'].includes(active.status)) fail('已有安靜房間，請先繼續或結束。', 409);
    const now = Date.now();
    const session = { id: randomUUID(), actorId, startKey, ...options, targetLabel,
      studentIds: [...new Set(recipients)], status: 'running', remainingMs: options.durationSeconds * 1000,
      remainingReward: options.reward, breaches: 0, events: [], lastNoiseAt: null, lastTick: now, createdAt: now, payout: null };
    await save(session);
    return view(session);
  });
}

async function current(actorId) {
  return locked(actorId, async (sessions, save, client) => {
    const session = sessions.sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!session) return null;
    advance(session, Date.now()); await settle(session, client); await save(session);
    return view(session);
  });
}

async function update(actorId, id, action, eventId) {
  if (action === 'restart') return restart(actorId, id, eventId);
  return locked(actorId, async (sessions, save, client) => {
    const session = sessions.find(row => row.id === id);
    if (!session) fail('找不到安靜房間。', 404);
    transition(session, action, Date.now(), eventId);
    await settle(session, client); await save(session);
    return view(session);
  });
}

async function restart(actorId, id, key) {
  if (typeof key !== 'string' || !key || key.length > 120) fail('缺少有效的防重複提交識別碼。');
  return locked(actorId, async (sessions, save, client, saveMany) => {
    const previous = sessions.find(row => row.id === id);
    if (!previous) fail('找不到安靜房間。', 404);
    // A round can have only one successor, even with retries or two teacher tabs.
    const existing = sessions.find(row => row.restartOf === id);
    if (existing) { advance(existing, Date.now()); await settle(existing, client); await save(existing); return view(existing); }
    if (sessions.some(row => row.startKey === key || row.id !== id && ['running', 'paused'].includes(row.status))) fail('已有另一個挑戰，請重新載入。', 409);
    const now = Date.now(), options = settings(previous);
    const next = { id: randomUUID(), actorId, startKey: key, restartOf: id, ...options, targetLabel: previous.targetLabel,
      studentIds: [...previous.studentIds], status: 'running', remainingMs: options.durationSeconds * 1000,
      remainingReward: options.reward, breaches: 0, events: [], lastNoiseAt: null, lastTick: now, createdAt: Math.max(now, previous.createdAt + 1), payout: null };
    // Restarting discards the unfinished reward; completed payouts remain untouched.
    if (['running', 'paused'].includes(previous.status)) previous.status = 'cancelled';
    await saveMany([previous, next]);
    return view(next);
  });
}

module.exports = { start, current, update };
