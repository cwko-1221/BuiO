'use strict';

const { randomUUID } = require('crypto');
const { EventEmitter } = require('events');
const config = require('../config');
const store = require('../db/jsonStore');
const { getPool, withTransaction } = require('../math-app/db/database');
const { normalizeRules, matchesRules, describeRules, roster } = require('../shared/classroom-audience');
const users = require('../math-app/repositories/users.repo');
const pet = require('../pet-app/repositories/pet.repo');

const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
let schemaPromise;
let queue = Promise.resolve();
const changes = new EventEmitter();
changes.setMaxListeners(0);
const publish = session => changes.emit('change', session);
const origin = randomUUID();

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

async function all() {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query('SELECT State AS state FROM BuzzerSessions');
    return rows.map(row => row.state);
  }
  return structuredClone(store.load().buzzerSessions);
}

// Control actions lock their own classroom. Buzzes and readiness use one atomic UPDATE.
async function locked(operation, id) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    let changed;
    const result = await withTransaction(async client => {
      if (!id) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['buzzer-classrooms']);
      const { rows } = await client.query(id
        ? 'SELECT State AS state FROM BuzzerSessions WHERE SessionID::text=$1 FOR UPDATE'
        : 'SELECT State AS state FROM BuzzerSessions', id ? [id] : []);
      return operation(rows.map(row => row.state), async session => {
        await client.query(`WITH saved AS (
        INSERT INTO BuzzerSessions(SessionID,TeacherID,State) VALUES($1::uuid,$2,$3::jsonb)
        ON CONFLICT(SessionID) DO UPDATE SET State=EXCLUDED.State,UpdatedAt=NOW() RETURNING SessionID
        ) SELECT pg_notify('buio_buzzer', $4) FROM saved`,
        [session.id, session.teacherId, JSON.stringify(session), `${session.id}:${origin}`]);
        changed = session;
      }, client);
    });
    if (changed) publish(changed);
    return result;
  }
  const work = queue.then(() => operation(structuredClone(store.load().buzzerSessions), async session => {
    const data = store.load();
    const index = data.buzzerSessions.findIndex(row => row.id === session.id);
    if (index < 0) data.buzzerSessions.push(session); else data.buzzerSessions[index] = session;
    store.save();
    publish(session);
  }, null));
  queue = work.catch(() => {});
  return work;
}

function allowed(session, user) {
  return user.role === 'teacher' ? session.teacherId === user.studentId
    : user.role === 'student' && ((Array.isArray(session.audienceRules) && !session.audienceRules.length)
      || session.eligible.some(row => row.studentId === user.studentId));
}

function view(session, user) {
  if (!allowed(session, user)) fail('你不屬於這個課堂。', 403);
  const phase = session.phase === 'countdown' && Date.now() >= session.opensAt ? 'open' : session.phase;
  const winner = session.winnerId ? session.participants.find(row => row.studentId === session.winnerId) : null;
  const result = {
    id: session.id, teacherName: session.teacherName, targetLabel: session.targetLabel,
    points: session.points, phase, round: session.round, opensAt: session.opensAt,
    countdownAt: session.countdownAt || null, readyCount: (session.readyIds || []).length,
    armedCount: (session.armedIds || []).length, syncMessage: session.syncMessage || '',
    winner: winner ? { studentId: winner.studentId, name: winner.name } : null,
    verdict: session.verdict, participantCount: session.participants.length,
    serverNow: Date.now(), createdAt: session.createdAt, revision: session.revision || 0,
  };
  if (user.role === 'teacher') {
    if (Array.isArray(session.audienceRules)) result.audienceRules = session.audienceRules;
    result.participants = session.participants;
    result.waitingFor = session.participants.filter(row => !(session.readyIds || []).includes(row.studentId)).map(row => row.name);
  }
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
  let input = body.audienceRules;
  if (!Object.hasOwn(body, 'audienceRules') && body.className) {
    if (body.groupField && !body.groupName) fail('請選擇有效的科目組別。');
    input = [{ classNames: [body.className], groupField: body.groupField || '',
      groupNames: body.groupField ? [body.groupName] : [] }];
  }
  const audienceRules = normalizeRules(input);
  const { students } = await roster();
  const eligible = students.filter(row => matchesRules(row, audienceRules));
  const targetLabel = describeRules(audienceRules);
  if (audienceRules.length && !eligible.length) fail('所選班級或組別沒有學生。');
  const teacher = await users.findByIdSummary(user.studentId);
  return locked(async (rows, save) => {
    const existing = rows.find(row => row.teacherId === user.studentId && row.phase !== 'ended');
    if (existing) return view(existing, user);
    const session = { id: randomUUID(), teacherId: user.studentId, teacherName: teacher?.name || '老師',
      targetLabel, points, audienceRules, eligible: eligible.map(row => ({ studentId: row.studentId, name: row.name })),
      participants: [], phase: 'waiting', round: 0, opensAt: null, winnerId: null, verdict: null,
      createdAt: Date.now(), history: [] };
    await save(session);
    return view(session, user);
  });
}

async function get(id, user) {
  const session = await raw(id);
  if (!session) fail('找不到搶答課堂。', 404);
  return view(session, user);
}

async function raw(id) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query('SELECT State AS state FROM BuzzerSessions WHERE SessionID::text=$1', [id]);
    return rows[0]?.state;
  }
  return structuredClone(store.load().buzzerSessions.find(row => row.id === id));
}

function syncOptions(body) {
  if (body.visible !== true || body.clockReady !== true) fail('請保持搶答畫面開啟，並等待時鐘同步。', 409);
  const rtt = Number(body.rtt);
  if (!Number.isFinite(rtt) || rtt < 0 || rtt > 2000) fail('網絡未能同步，請重新連線。', 409);
  return Math.ceil(rtt);
}

// Only this conditional write is in the hot path: no BEGIN, whole-class lock or read-before-write.
async function fastAction(id, user, body, receivedAt) {
  if (user.role !== 'student') fail('只有學生可以搶答。', 403);
  if (!Number.isInteger(Number(body.round)) || Number(body.round) < 1) fail('無效題號。');
  await ensureSchema();
  const type = body.action;
  const rtt = type === 'ready' ? syncOptions(body) : 0;
  const ready = `COALESCE(State->'readyIds','[]'::jsonb)`;
  const nextReady = `CASE WHEN ${ready} ? $2 THEN ${ready} ELSE ${ready} || to_jsonb($2::text) END`;
  const armed = `COALESCE(State->'armedIds','[]'::jsonb)`;
  const nextArmed = `CASE WHEN ${armed} ? $2 THEN ${armed} ELSE ${armed} || to_jsonb($2::text) END`;
  const allReady = `jsonb_array_length(${nextReady})=jsonb_array_length(State->'participants')`;
  const allArmed = `jsonb_array_length(${nextArmed})=jsonb_array_length(State->'participants')`;
  const lead = `GREATEST(1500, GREATEST(COALESCE((State->>'maxRtt')::integer,0),$5::integer)*3+500)`;
  let fields, condition;
  if (type === 'ready') {
    fields = `jsonb_build_object('readyIds',${nextReady},'maxRtt',GREATEST(COALESCE((State->>'maxRtt')::integer,0),$5::integer),
      'phase',CASE WHEN ${allReady} THEN 'scheduled' ELSE 'preparing' END,
      'countdownAt',CASE WHEN ${allReady} THEN $4::bigint+${lead} ELSE NULL END,
      'opensAt',CASE WHEN ${allReady} THEN $4::bigint+${lead}+3000 ELSE NULL END)`;
    condition = `State->>'phase'='preparing'`;
  } else if (type === 'armed') {
    fields = `jsonb_build_object('armedIds',${nextArmed},'phase',CASE WHEN ${allArmed} THEN 'countdown' ELSE 'scheduled' END)`;
    condition = `State->>'phase'='scheduled' AND (State->>'countdownAt')::bigint>$4 AND ${ready} ? $2`;
  } else {
    fields = `jsonb_build_object('phase','claimed','winnerId',$2::text,'participants',
      (SELECT jsonb_agg(p || CASE WHEN p->>'studentId'=$2 THEN jsonb_build_object('successes',(p->>'successes')::integer+1) ELSE '{}'::jsonb END)
       FROM jsonb_array_elements(State->'participants') p))`;
    condition = `State->>'phase'='countdown' AND (State->>'opensAt')::bigint<=$4
      AND jsonb_array_length(${armed})=jsonb_array_length(State->'participants')`;
  }
  const { rows } = await getPool().query(`WITH changed AS (
    UPDATE BuzzerSessions SET State=State || ${fields} || jsonb_build_object('revision',COALESCE((State->>'revision')::integer,0)+1),UpdatedAt=NOW()
    WHERE SessionID::text=$1 AND (State->>'round')::integer=$3
      AND (State->'audienceRules'='[]'::jsonb OR State->'eligible' @> jsonb_build_array(jsonb_build_object('studentId',$2::text)))
      AND State->'participants' @> jsonb_build_array(jsonb_build_object('studentId',$2::text)) AND $5::integer>=0 AND ${condition}
    RETURNING State
  ) SELECT State AS state,pg_notify('buio_buzzer',$6) FROM changed`, [id, user.studentId, Number(body.round), receivedAt, rtt, `${id}:${origin}`]);
  if (!rows[0]) {
    // Failed requests still check class authorization before revealing round state.
    await get(id, user);
    fail('本題尚未準備好或已結束。', 409);
  }
  publish(rows[0].state);
  return view(rows[0].state, user);
}

async function interrupt(id, user, round, expired = false) {
  return locked(async (rows, save) => {
    const session = rows.find(row => row.id === id);
    if (!session || !allowed(session, user) || session.round !== round) return;
    if (user.role === 'student' && !session.participants.some(row => row.studentId === user.studentId)) return;
    if (!['preparing', 'scheduled', 'countdown'].includes(session.phase)) return;
    if (expired && (session.phase !== 'scheduled' || Date.now() < session.countdownAt)) return;
    session.phase = 'waiting'; session.opensAt = null; session.countdownAt = null;
    session.readyIds = []; session.armedIds = [];
    session.syncMessage = '有學生未同步或已離線，請確認所有同學已準備好後再搶答。';
    session.revision = (session.revision || 0) + 1;
    await save(session);
  }, id);
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
  if (config.db.mode === 'postgres' && ['buzz', 'ready', 'armed'].includes(body.action)) return fastAction(id, user, body, receivedAt);
  return locked(async (rows, save, client) => {
    const session = rows.find(row => row.id === id);
    if (!session) fail('找不到搶答課堂。', 404);
    if (!allowed(session, user)) fail('你不屬於這個課堂。', 403);
    const teacher = user.role === 'teacher';
    const type = body.action;
    if (['start', 'judge', 'cancel', 'end'].includes(type) && !teacher) fail('只有老師可以操作。', 403);
    if (['join', 'buzz', 'ready', 'armed'].includes(type) && user.role !== 'student') fail('只有學生可以搶答。', 403);
    if (session.phase === 'ended') fail('老師已結束課堂。', 409);
    if (type === 'join') {
      const existing = session.participants.some(row => row.studentId === user.studentId);
      if (existing && ['preparing', 'scheduled', 'countdown'].includes(session.phase)) {
        // A reload/reconnect must earn fresh readiness, including after a server restart.
        session.phase = 'waiting'; session.opensAt = null; session.countdownAt = null;
        session.readyIds = []; session.armedIds = [];
        session.syncMessage = '有學生重新連線，請確認所有同學已準備好後再搶答。';
      }
      if (!existing) {
        if (!['waiting', 'judged'].includes(session.phase)) fail('本題已開始，請待本題結束後加入。', 409);
        const student = session.eligible.find(row => row.studentId === user.studentId)
          || await users.findByIdSummary(user.studentId);
        session.participants.push({ studentId: user.studentId, name: student?.name || user.studentId, successes: 0, score: 0 });
      }
    } else if (type === 'start') {
      if (Number(body.round) !== session.round) fail('題目已更新，請重試。', 409);
      if (!['waiting', 'judged'].includes(session.phase)) fail('請先完成或取消本題。', 409);
      if (!session.participants.length) fail('請等待學生加入課堂。', 409);
      session.round++; session.phase = 'preparing'; session.opensAt = null; session.countdownAt = null;
      session.readyIds = []; session.armedIds = []; session.maxRtt = 0; session.syncMessage = '';
      session.winnerId = null; session.verdict = null;
    } else if (type === 'ready' || type === 'armed') {
      if (Number(body.round) !== session.round) fail('這一題已結束。', 409);
      if (!session.participants.some(row => row.studentId === user.studentId)) fail('請先加入課堂。', 403);
      if (type === 'ready') {
        const rtt = syncOptions(body);
        if (session.phase !== 'preparing') fail('本題已同步或已結束。', 409);
        if (!session.readyIds.includes(user.studentId)) session.readyIds.push(user.studentId);
        session.maxRtt = Math.max(session.maxRtt, rtt);
        if (session.readyIds.length === session.participants.length) {
          session.phase = 'scheduled';
          session.countdownAt = Date.now() + Math.max(1500, session.maxRtt * 3 + 500);
          session.opensAt = session.countdownAt + 3000;
        }
      } else {
        if (session.phase !== 'scheduled' || receivedAt >= session.countdownAt || !session.readyIds.includes(user.studentId)) fail('未能及時同步本題。', 409);
        if (!session.armedIds.includes(user.studentId)) session.armedIds.push(user.studentId);
        if (session.armedIds.length === session.participants.length) session.phase = 'countdown';
      }
    } else if (type === 'buzz') {
      if (Number(body.round) !== session.round) fail('這一題已結束。', 409);
      if (session.phase !== 'countdown' || receivedAt < session.opensAt || session.armedIds?.length !== session.participants.length) fail('尚未開始或已有同學搶答。', 409);
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
      if (!['preparing', 'scheduled', 'countdown', 'claimed'].includes(session.phase)) fail('目前沒有可取消的題目。', 409);
      session.phase = 'waiting'; session.winnerId = null; session.verdict = null;
    } else if (type === 'end') session.phase = 'ended';
    else fail('無效操作。');
    session.revision = (session.revision || 0) + 1;
    await save(session);
    return view(session, user);
  }, id);
}

module.exports = { roster, sessions, create, get, action, interrupt, all, raw, view, changes, origin };
