'use strict';

const { randomUUID } = require('crypto');
const config = require('../config');
const store = require('../db/jsonStore');
const { getPool, withTransaction } = require('../math-app/db/database');
const years = require('../math-app/repositories/academic-years.repo');
const users = require('../math-app/repositories/users.repo');
const pet = require('../pet-app/repositories/pet.repo');

const GROUPS = { chineseGroup: '中文', englishGroup: '英文', mathGroup: '數學' };
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
let schemaPromise;
let queue = Promise.resolve();

async function ensureSchema() {
  await pet.ensureSchema();
  if (config.db.mode !== 'postgres') {
    const data = store.load();
    if (!Array.isArray(data.buzzerSessions)) { data.buzzerSessions = []; store.save(); }
    return;
  }
  if (!schemaPromise) schemaPromise = getPool().query(`CREATE TABLE IF NOT EXISTS BuzzerSessions (
    SessionID UUID PRIMARY KEY, TeacherID VARCHAR(20) NOT NULL, State JSONB NOT NULL,
    UpdatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
  ); CREATE INDEX IF NOT EXISTS idx_buzzer_teacher ON BuzzerSessions(TeacherID);`)
    .catch(error => { schemaPromise = null; throw error; });
  await schemaPromise;
}

async function roster() {
  const academicYear = await years.getCurrentAcademicYear();
  const students = (await years.listEnrollments(academicYear)).filter(row => row.role !== 'teacher');
  return { academicYear, students, classes: [...new Set(students.map(row => row.className).filter(Boolean))].sort() };
}

async function all() {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query('SELECT State AS state FROM BuzzerSessions');
    return rows.map(row => row.state);
  }
  return structuredClone(store.load().buzzerSessions);
}

// A database lock serializes first-buzz and judging across workers. JSON uses a queue.
async function locked(operation) {
  await ensureSchema();
  if (config.db.mode === 'postgres') return withTransaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['buzzer-classrooms']);
    const { rows } = await client.query('SELECT State AS state FROM BuzzerSessions');
    return operation(rows.map(row => row.state), async session => {
      await client.query(`INSERT INTO BuzzerSessions(SessionID,TeacherID,State) VALUES($1,$2,$3::jsonb)
        ON CONFLICT(SessionID) DO UPDATE SET State=EXCLUDED.State,UpdatedAt=NOW()`,
      [session.id, session.teacherId, JSON.stringify(session)]);
    }, client);
  });
  const work = queue.then(() => operation(structuredClone(store.load().buzzerSessions), async session => {
    const data = store.load();
    const index = data.buzzerSessions.findIndex(row => row.id === session.id);
    if (index < 0) data.buzzerSessions.push(session); else data.buzzerSessions[index] = session;
    store.save();
  }, null));
  queue = work.catch(() => {});
  return work;
}

function allowed(session, user) {
  return user.role === 'teacher' ? session.teacherId === user.studentId
    : user.role === 'student' && session.eligible.some(row => row.studentId === user.studentId);
}

function view(session, user) {
  if (!allowed(session, user)) fail('你不屬於這個課堂。', 403);
  const phase = session.phase === 'countdown' && Date.now() >= session.opensAt ? 'open' : session.phase;
  const winner = session.winnerId ? session.participants.find(row => row.studentId === session.winnerId) : null;
  const result = {
    id: session.id, teacherName: session.teacherName, targetLabel: session.targetLabel,
    points: session.points, phase, round: session.round, opensAt: session.opensAt,
    winner: winner ? { studentId: winner.studentId, name: winner.name } : null,
    verdict: session.verdict, participantCount: session.participants.length,
    serverNow: Date.now(), createdAt: session.createdAt, revision: session.revision || 0,
  };
  if (user.role === 'teacher') result.participants = session.participants;
  else result.me = session.participants.find(row => row.studentId === user.studentId) || null;
  return result;
}

async function sessions(user) {
  return (await all()).filter(row => row.phase !== 'ended' && allowed(row, user)).map(row => ({
    id: row.id, teacherId: row.id, teacherName: row.teacherName, roomCode: row.targetLabel,
    startTime: row.createdAt, type: 'buzzer', active: true,
  }));
}

async function create(user, body) {
  const points = Number(body.points);
  if (!Number.isInteger(points) || points < 1 || points > 10000) fail('每題分數須為 1 至 10000 的整數。');
  const { students } = await roster();
  let eligible = students.filter(row => row.className === body.className);
  let targetLabel = String(body.className || '');
  if (body.groupField) {
    if (!Object.hasOwn(GROUPS, body.groupField) || !body.groupName) fail('請選擇有效的科目組別。');
    eligible = eligible.filter(row => row[body.groupField] === body.groupName);
    targetLabel += ` · ${GROUPS[body.groupField]} ${body.groupName}`;
  }
  if (!eligible.length) fail('所選班級或組別沒有學生。');
  const teacher = await users.findByIdSummary(user.studentId);
  return locked(async (rows, save) => {
    const existing = rows.find(row => row.teacherId === user.studentId && row.phase !== 'ended');
    if (existing) return view(existing, user);
    const session = { id: randomUUID(), teacherId: user.studentId, teacherName: teacher?.name || '老師',
      targetLabel, points, eligible: eligible.map(row => ({ studentId: row.studentId, name: row.name })),
      participants: [], phase: 'waiting', round: 0, opensAt: null, winnerId: null, verdict: null,
      createdAt: Date.now(), history: [] };
    await save(session);
    return view(session, user);
  });
}

async function get(id, user) {
  const session = (await all()).find(row => row.id === id);
  if (!session) fail('找不到搶答課堂。', 404);
  return view(session, user);
}

async function reward(session, winner, client) {
  const key = `buzzer:${session.id}:${session.round}`;
  const note = `搶答課堂 · ${session.targetLabel} · 第 ${session.round} 題`;
  await pet.ensureStudent(winner.studentId, client);
  const ledger = { transactionId: randomUUID(), studentId: winner.studentId, actorId: session.teacherId,
    delta: session.points, kind: 'teacher_grant', idempotencyKey: key, note,
    metadata: { buzzerSessionId: session.id, round: session.round }, createdAt: new Date().toISOString() };
  if (client) {
    const inserted = await client.query(`INSERT INTO PetCurrencyLedger
      (TransactionID,StudentID,ActorID,Delta,Kind,IdempotencyKey,Note,Metadata)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT DO NOTHING RETURNING TransactionID`,
    [ledger.transactionId, ledger.studentId, ledger.actorId, ledger.delta, ledger.kind, key, note, JSON.stringify(ledger.metadata)]);
    if (inserted.rowCount) await client.query('UPDATE PetWallets SET Balance=Balance+$2,UpdatedAt=NOW() WHERE StudentID=$1', [winner.studentId, session.points]);
  } else {
    const data = store.load();
    if (!data.petCurrencyLedger.some(row => row.studentId === winner.studentId && row.idempotencyKey === key)) {
      const wallet = data.petWallets.find(row => row.studentId === winner.studentId);
      wallet.balance += session.points; wallet.updatedAt = ledger.createdAt;
      data.petCurrencyLedger.push(ledger);
      // The enclosing save persists the wallet, ledger and classroom together.
    }
  }
}

async function action(id, user, body) {
  const receivedAt = Date.now();
  return locked(async (rows, save, client) => {
    const session = rows.find(row => row.id === id);
    if (!session) fail('找不到搶答課堂。', 404);
    if (!allowed(session, user)) fail('你不屬於這個課堂。', 403);
    const teacher = user.role === 'teacher';
    const type = body.action;
    if (['start', 'judge', 'cancel', 'end'].includes(type) && !teacher) fail('只有老師可以操作。', 403);
    if (['join', 'buzz'].includes(type) && user.role !== 'student') fail('只有學生可以搶答。', 403);
    if (session.phase === 'ended') fail('老師已結束課堂。', 409);
    if (type === 'join') {
      if (!session.participants.some(row => row.studentId === user.studentId)) {
        const student = session.eligible.find(row => row.studentId === user.studentId);
        session.participants.push({ ...student, successes: 0, score: 0 });
      }
    } else if (type === 'start') {
      if (Number(body.round) !== session.round) fail('題目已更新，請重試。', 409);
      if (!['waiting', 'judged'].includes(session.phase)) fail('請先完成或取消本題。', 409);
      if (!session.participants.length) fail('請等待學生加入課堂。', 409);
      session.round++; session.phase = 'countdown'; session.opensAt = Date.now() + 3000;
      session.winnerId = null; session.verdict = null;
    } else if (type === 'buzz') {
      if (Number(body.round) !== session.round) fail('這一題已結束。', 409);
      if (session.phase !== 'countdown' || receivedAt < session.opensAt) fail('尚未開始或已有同學搶答。', 409);
      const participant = session.participants.find(row => row.studentId === user.studentId);
      if (!participant) fail('請先加入課堂。', 403);
      // The first request inside the lock owns the round before any asynchronous work.
      session.winnerId = participant.studentId; participant.successes++; session.phase = 'claimed';
    } else if (type === 'judge') {
      if (Number(body.round) !== session.round) fail('這一題已結束。', 409);
      if (typeof body.correct !== 'boolean') fail('請選擇正確或錯誤。');
      if (session.phase === 'judged') {
        if (session.verdict !== body.correct) fail('本題已評分。', 409);
        return view(session, user);
      }
      if (session.phase !== 'claimed') fail('請等待學生搶答。', 409);
      const winner = session.participants.find(row => row.studentId === session.winnerId);
      if (body.correct) { await reward(session, winner, client); winner.score += session.points; }
      session.verdict = body.correct; session.phase = 'judged';
      session.history.push({ round: session.round, studentId: winner.studentId, correct: body.correct, points: body.correct ? session.points : 0 });
    } else if (type === 'cancel') {
      if (Number(body.round) !== session.round) fail('題目已更新。', 409);
      if (!['countdown', 'claimed'].includes(session.phase)) fail('目前沒有可取消的題目。', 409);
      session.phase = 'waiting'; session.winnerId = null; session.verdict = null;
    } else if (type === 'end') session.phase = 'ended';
    else fail('無效操作。');
    session.revision = (session.revision || 0) + 1;
    await save(session);
    return view(session, user);
  });
}

module.exports = { roster, sessions, create, get, action, all, view };
