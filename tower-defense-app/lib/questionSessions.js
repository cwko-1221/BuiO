'use strict';
const crypto = require('crypto');
const defaultSet = require('./defaultQuestions');
const { rooms, findPlayerForOwner } = require('./classrooms');
const sessions = new Map(), starts = new Map();
const QUESTION_TTL_MS = 20_000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
function publicSet(set) {
  return { id: set.id, title: set.title, questionCount: set.questions.length, builtin: set.id === defaultSet.id };
}
// Both transports enter the same synchronous operation, so a late HTTP response
// and a socket fallback cannot allocate different sessions for the same start.
function startSession(owner, body = {}, { preview = false, prepare = false } = {}) {
  if (!owner) fail(401, '請先登入平台。');
  const roomCode = String(body.roomCode || '').trim();
  let set = defaultSet;
  if (roomCode) {
    const room = rooms.get(roomCode);
    if (!room || !(['playing', ...(prepare ? ['lobby'] : [])].includes(room.phase))) fail(409, '老師尚未開始，或課堂已經結束。');
    if (!findPlayerForOwner(room, owner) && !preview) fail(403, '你尚未加入這個塔防房間。');
    set = room.set;
  } else if (!preview) fail(400, '請先加入老師建立的塔防房間。');
  const requestId = body.startRequestId;
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{16,80}$/.test(requestId))) fail(400, '開始請求識別碼不正確。');
  const startKey = requestId ? JSON.stringify([owner, roomCode, requestId]) : null;
  const existing = startKey && sessions.get(starts.get(startKey));
  if (existing && Date.now() - existing.touchedAt < SESSION_TTL_MS) {
    existing.touchedAt = Date.now();
    return { success: true, sessionId: existing.id, set: publicSet(existing.set) };
  }
  const id = crypto.randomUUID(), order = set.questions.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1); [order[i], order[j]] = [order[j], order[i]];
  }
  sessions.set(id, { id, owner, roomCode: roomCode || null, startKey, set, order,
    cursor: 0, streak: 0, correct: 0, answered: 0, active: null, touchedAt: Date.now() });
  if (startKey) starts.set(startKey, id);
  return { success: true, sessionId: id, set: publicSet(set) };
}
setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) if (session.touchedAt < cutoff) {
    sessions.delete(id);
    if (session.startKey && starts.get(session.startKey) === id) starts.delete(session.startKey);
  }
}, 10 * 60 * 1000).unref();
function shuffledQuestion(question) {
  const entries = question.choices.map((choice, index) => ({ choice, correct: index === question.correctIndex }));
  for (let index = entries.length - 1; index > 0; index--) {
    const swap = crypto.randomInt(index + 1);
    [entries[index], entries[swap]] = [entries[swap], entries[index]];
  }
  return {
    prompt: question.question,
    image: question.image || null,
    choices: entries.map(entry => entry.choice),
    correctIndex: entries.findIndex(entry => entry.correct),
  };
}

function requireGameSession(owner, body, roomCode) {
  const session = sessions.get(String(body?.sessionId || ''));
  if (!session || session.owner !== owner) fail(404, '遊戲答題連線已失效，請重新開始。');
  if (roomCode !== undefined && session.roomCode !== roomCode) fail(403, '你尚未加入這個塔防房間。');
  if (session.roomCode && rooms.get(session.roomCode)?.phase !== 'playing') fail(410, '老師已結束這個課堂。');
  session.touchedAt = Date.now();
  return session;
}

function issueQuestion(owner, body, roomCode) {
  const session = requireGameSession(owner, body, roomCode);
  const now = Date.now();
  const requestId = body?.requestId;
  if (requestId !== undefined && (typeof requestId !== 'string' || !/^[\w-]{16,80}$/.test(requestId))) fail(400, '取題請求識別碼不正確。');
  const issuedToken = requestId && session.recentQuestions?.get(requestId);
  if (issuedToken && (session.active?.token !== issuedToken || session.active.used || session.active.expiresAt <= now)) {
    fail(409, '這條題目已經失效。');
  }
  if (!session.active || session.active.used || session.active.expiresAt <= now) {
    if (session.cursor >= session.order.length) {
      session.cursor = 0;
      session.order.reverse();
    }
    const raw = session.set.questions[session.order[session.cursor++]];
    session.active = {
      ...shuffledQuestion(raw), token: crypto.randomUUID(), baseReward: 45,
      expiresAt: now + QUESTION_TTL_MS, used: false,
    };
  }
  const { token, prompt, image, choices, expiresAt, baseReward } = session.active;
  if (requestId) {
    session.recentQuestions ??= new Map();
    session.recentQuestions.set(requestId, token);
    if (session.recentQuestions.size > 8) session.recentQuestions.delete(session.recentQuestions.keys().next().value);
  }
  return { success: true, question: { token, prompt, image, choices, expiresAt, baseReward,
    remainingMs: expiresAt - now } };
}

function gradeAnswer(owner, body, roomCode) {
  const session = requireGameSession(owner, body, roomCode);
  const prior = session.recentAnswers?.get(body?.token);
  const answerIndex = Number(body?.answerIndex);
  if (prior && prior.answerIndex === answerIndex) return prior.result;
  const active = session.active;
  if (!active || active.token !== body?.token || active.used) fail(409, '這條題目已經失效。');
  active.used = true;
  session.answered += 1;
  const timedOut = Date.now() > active.expiresAt;
  const correct = !timedOut && Number.isInteger(answerIndex) && answerIndex === active.correctIndex;
  if (correct) {
    session.streak += 1;
    session.correct += 1;
  } else session.streak = 0;
  const result = {
    success: true, correct, timedOut, correctIndex: active.correctIndex,
    reward: correct ? active.baseReward + Math.min(40, (session.streak - 1) * 5) : 0,
    streak: session.streak, accuracy: session.correct / session.answered,
  };
  session.recentAnswers ??= new Map();
  session.recentAnswers.set(active.token, { answerIndex, result });
  if (session.recentAnswers.size > 8) session.recentAnswers.delete(session.recentAnswers.keys().next().value);
  return result;
}

module.exports = { sessions, publicSet, startSession, issueQuestion, gradeAnswer };
