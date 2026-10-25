'use strict';
const { randomUUID, randomBytes } = require('node:crypto');
const rulesPromise = import('../lib/park-social.mjs');
const worldPromise = import('../lib/park-world.mjs');
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
const INVITE_MS = 15000, NEAR = 360, HOLD_NEAR = 420;

module.exports = function createParkSocial({ players, now = Date.now, current, allowed, emitRoom = () => {} }) {
  const invitations = new Map(), pending = new Map(), sessions = new Map(), membership = new Map(), cooldown = new Map(), pairCooldown = new Map();
  let disposed = false, runningTick = false;
  const send = (p, payload) => p?.socket?.emit('park:social', { ...payload, at: now() });
  const other = (invite, id) => invite.from.id === id ? invite.to : invite.from;
  const available = p => p && players.get(p.id) === p && p.socket.connected !== false && p.active && !p.locked && !p.game && !p.pending;
  const isBusy = id => membership.has(id);
  function finishInvite(invite, reason, actorId) {
    invitations.delete(invite.id);
    for (const p of [invite.from, invite.to]) { if (pending.get(p.id) === invite.id) pending.delete(p.id); send(p, { type: 'invitation-ended', invitationId: invite.id, reason, actorId }); }
  }
  function cancelSession(session, reason, actorId) {
    sessions.delete(session.id);
    for (const p of session.members) { if (membership.get(p.id) === session.id) membership.delete(p.id); send(p, { type: 'ended', sessionId: session.id, reason, actorId }); }
  }
  function cancelPlayer(id, reason = 'left') {
    const invite = invitations.get(pending.get(id)); if (invite) finishInvite(invite, reason, id);
    const session = sessions.get(membership.get(id)); if (session) cancelSession(session, reason, id);
  }
  async function pair(from, to, distance = NEAR) {
    if (!available(from) || !available(to) || from.id === to.id || from.room !== to.room) fail('請找同班、在附近而且有空的同學。');
    if (Math.hypot(from.x - to.x, from.y - to.y) > distance) fail('先走近這位同學，再邀請一起玩。');
    const world = await worldPromise;
    if (!world.clearLine(from, to)) fail('請走到同一邊的空地，再邀請同學。');
    return [from, to];
  }
  const invitationFrame = (invite, id) => ({ id: invite.id, kind: invite.kind, direction: invite.to.id === id ? 'incoming' : 'outgoing', peer: { id: other(invite, id).id, name: other(invite, id).name }, expiresAt: invite.expiresAt });
  function sessionFrame(session, id, rules) { return { id: session.id, role: session.members[0].id === id ? 0 : 1, members: session.members.map(p => ({ id: p.id, name: p.name })), game: rules.publicDuet(session.game, now()) }; }
  function broadcastSession(session, rules) { for (const p of session.members) send(p, { type: 'session', session: sessionFrame(session, p.id, rules) }); }
  async function invite(socket, body) {
    const from = await allowed(socket);
    if (typeof body.peerId !== 'string' || body.peerId.length > 128 || !['duet', 'highfive'].includes(body.kind)) fail('無效的同學互動。', 400);
    const to = players.get(body.peerId); await pair(from, to);
    await allowed(to.socket); current(socket); await pair(from, to);
    if (pending.has(from.id) || pending.has(to.id) || isBusy(from.id) || isBusy(to.id)) fail('有一個邀請正在等候回覆，請稍候。');
    if (now() < (cooldown.get(from.id) || 0) || now() < (pairCooldown.get([from.id, to.id].sort().join(':')) || 0)) fail('讓同學休息一下，稍後再邀請。', 429);
    const value = { id: randomUUID(), kind: body.kind, from, to, expiresAt: now() + INVITE_MS };
    invitations.set(value.id, value); pending.set(from.id, value.id); pending.set(to.id, value.id); cooldown.set(from.id, now() + 8000);
    for (const p of [from, to]) send(p, { type: 'invitation', invitation: invitationFrame(value, p.id) });
    return { invitation: invitationFrame(value, from.id) };
  }
  async function reply(socket, body) {
    const p = await allowed(socket), value = invitations.get(body.invitationId);
    if (!value || !['accept', 'decline', 'cancel'].includes(body.action)) fail('這個邀請已結束。');
    if (body.action === 'cancel') { if (value.from !== p) fail('不能取消別人的邀請。', 403); finishInvite(value, 'cancelled', p.id); return {}; }
    if (value.to !== p) fail('只有收到邀請的同學可以回覆。', 403);
    if (now() >= value.expiresAt) { finishInvite(value, 'expired'); fail('邀請時間已過，請重新邀請。'); }
    if (body.action === 'decline') { pairCooldown.set([value.from.id, value.to.id].sort().join(':'), now() + 30000); finishInvite(value, 'declined', p.id); return {}; }
    await allowed(value.from.socket); await pair(value.from, p); current(socket);
    if (!invitations.has(value.id) || now() >= value.expiresAt || isBusy(p.id) || isBusy(value.from.id)) fail('這個邀請已結束。');
    const rules = await rulesPromise;
    // Recheck after the final await, then consume synchronously. Concurrent
    // accept packets must never create two sessions for one invitation.
    if (!invitations.has(value.id) || now() >= value.expiresAt || isBusy(p.id) || isBusy(value.from.id) || ![value.from, value.to].every(available)) fail('這個邀請已結束。');
    current(socket);
    for (const member of [value.from, value.to]) { member.path = []; member.mask = 0; member.pending = null; member.seated = null; member.seenAt = now(); }
    finishInvite(value, 'accepted', p.id);
    if (value.kind === 'highfive') {
      const effect = { type: 'effect', kind: 'highfive', members: [value.from, value.to].map(member => ({ id: member.id, name: member.name, x: member.x, y: member.y })) };
      emitRoom(p.room, { ...effect, at: now() }); return { effect };
    }
    const session = { id: randomUUID(), members: [value.from, value.to], game: rules.createDuet(randomBytes(4).readUInt32LE(0), now()), finishedAt: null, createdAt: now() };
    sessions.set(session.id, session); for (const member of session.members) membership.set(member.id, session.id);
    broadcastSession(session, rules); return { session: sessionFrame(session, p.id, rules) };
  }
  async function input(socket, body) {
    const p = current(socket), session = sessions.get(membership.get(p.id));
    if (!session || session.id !== body.sessionId || !session.members.includes(p)) fail('雙人遊戲已結束。');
    if (!available(p)) { cancelSession(session, 'unavailable', p.id); fail('雙人遊戲已中斷。'); }
    const rules = await rulesPromise;
    if (sessions.get(session.id) !== session || membership.get(p.id) !== session.id || !session.members.every(available)) fail('雙人遊戲已中斷。');
    const result = rules.inputDuet(session.game, session.members.indexOf(p), body.round, body.pad, now());
    if (!result.accepted && result.reason === 'invalid') fail('無效的合奏操作。', 400);
    p.seenAt = now(); broadcastSession(session, rules); return { accepted: result.accepted, result: result.result };
  }
  async function control(socket, body) {
    const p = current(socket), session = sessions.get(membership.get(p.id));
    if (!session || session.id !== body.sessionId || !session.members.includes(p) || body.action !== 'leave') fail('雙人遊戲已結束。');
    cancelSession(session, 'left', p.id); return {};
  }
  async function tick() {
    if (disposed || runningTick) return; runningTick = true;
    try {
      const rules = await rulesPromise;
      for (const value of invitations.values()) {
        if (now() >= value.expiresAt) finishInvite(value, 'expired');
        else if (![value.from, value.to].every(available) || value.from.room !== value.to.room || Math.hypot(value.from.x - value.to.x, value.from.y - value.to.y) > HOLD_NEAR) finishInvite(value, 'unavailable');
      }
      for (const session of sessions.values()) {
        const [a, b] = session.members;
        if (!session.members.every(available) || a.room !== b.room || Math.hypot(a.x - b.x, a.y - b.y) > HOLD_NEAR) { cancelSession(session, 'unavailable'); continue; }
        rules.advanceDuet(session.game, now());
        if (session.game.phase === 'result') { session.finishedAt ??= now(); if (now() - session.finishedAt >= 45000) { cancelSession(session, 'finished'); continue; } }
        else if (now() - session.createdAt > rules.DUET.maxMs) { cancelSession(session, 'expired'); continue; }
        broadcastSession(session, rules);
      }
      if (cooldown.size > 2000) for (const [id, until] of cooldown) if (until < now()) cooldown.delete(id);
      if (pairCooldown.size > 2000) for (const [id, until] of pairCooldown) if (until < now()) pairCooldown.delete(id);
    } finally { runningTick = false; }
  }
  function attach(socket, handle) {
    handle('park:social:invite', body => invite(socket, body)); handle('park:social:reply', body => reply(socket, body));
    handle('park:social:input', body => input(socket, body)); handle('park:social:control', body => control(socket, body));
    handle('park:social:state', async () => { const p = await allowed(socket), rules = await rulesPromise; current(socket); const value = invitations.get(pending.get(p.id)), session = sessions.get(membership.get(p.id)); return { invitation: value ? invitationFrame(value, p.id) : null, session: session ? sessionFrame(session, p.id, rules) : null }; });
  }
  function dispose() { disposed = true; for (const value of [...invitations.values()]) finishInvite(value, 'unavailable'); for (const session of [...sessions.values()]) cancelSession(session, 'unavailable'); cooldown.clear(); pairCooldown.clear(); }
  return { attach, tick, cancelPlayer, isBusy, dispose, invitations, sessions };
};
