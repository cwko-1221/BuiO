'use strict';
const crypto = require('crypto');
const defaultSet = require('./defaultQuestions');
const { rooms, findPlayerForOwner } = require('./classrooms');
const sessions = new Map(), starts = new Map();
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
module.exports = { sessions, publicSet, startSession };
