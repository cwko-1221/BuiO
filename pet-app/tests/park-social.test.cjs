'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const social = import('../lib/park-social.mjs');
const world = import('../lib/park-world.mjs');
const createSocial = require('../server/park-social');

test('cooperative melody needs actual input from both players; duplicates, early taps and forged pads cannot become points', async () => {
  const r = await social, now = 100000;
  const game = r.createDuet(4832, now), duplicate = r.createDuet(4832, now);
  assert.deepEqual(game, duplicate);
  assert.equal(r.inputDuet(game, 0, 0, game.notes[0][0], now).accepted, false);
  for (let round = 0; round < r.DUET.rounds; round++) {
    const at = r.duetTarget(game, round);
    assert.equal(r.inputDuet(game, 0, round, game.notes[round][0], at).result, 'perfect');
    assert.equal(r.inputDuet(game, 0, round, game.notes[round][0], at).accepted, false);
    if (round !== 2) assert.equal(r.inputDuet(game, 1, round, game.notes[round][1], at + 250).result, 'good');
    r.advanceDuet(game, at + r.DUET.windowMs);
  }
  const result = r.publicDuet(game, r.duetTarget(game, 7) + r.DUET.windowMs + 1);
  assert.equal(result.phase, 'result'); assert.equal(result.duets, 7); assert.equal(result.stars, 3); assert.equal(result.score, 875); assert.equal(result.maxCombo, 5);
  assert.equal(result.history[2], false, 'one player alone does not complete a duet');
  assert.equal(r.inputDuet(game, 1, 7, game.notes[7][1], result.endsAt + 1).accepted, false);
  const miss = r.createDuet(88, now), target = r.duetTarget(miss, 0);
  assert.equal(r.inputDuet(miss, 0, 0, miss.notes[0][0], miss.startedAt + 5).result, 'early');
  assert.equal(r.inputDuet(miss, 1, 0, (miss.notes[0][1] + 1) % 4, target).result, 'wrong');
  r.advanceDuet(miss, target + r.DUET.windowMs); assert.equal(miss.score, 0);
  assert.equal(r.inputDuet(miss, 0, 1, Infinity, target + 2500).reason, 'invalid');
  for (let seed = 1; seed <= 8; seed++) assert.equal(new Set(r.createDuet(seed, now).notes.flat()).size, 4);
});

async function fixture() {
  const w = await world;
  let clock = 100000;
  const events = [], players = new Map(), handlers = new Map();
  const socket = id => ({ id: `socket-${id}`, connected: true, data: { studentId: id }, emit(event, body) { events.push({ id, event, body }); } });
  const a = { id: 'A', name: '小晴', room: '5A', active: true, locked: false, game: null, pending: null, x: w.WORLD.spawn.x, y: w.WORLD.spawn.y, socket: socket('A') };
  let near;
  for (let dy = -90; dy <= 90 && !near; dy += 30) for (let dx = -90; dx <= 90 && !near; dx += 30) if (Math.hypot(dx, dy) >= 60 && w.walkable(a.x + dx, a.y + dy) && w.clearLine(a, { x: a.x + dx, y: a.y + dy })) near = { x: a.x + dx, y: a.y + dy };
  assert.ok(near, 'spawn has space for a nearby classmate');
  const b = { ...a, ...near, id: 'B', name: '阿樂', socket: socket('B') }, c = { ...b, id: 'C', room: '5B', socket: socket('C') };
  players.set(a.id, a); players.set(b.id, b); players.set(c.id, c);
  const current = s => { const p = players.get(s.data.studentId); if (!p || p.socket !== s || p.locked) throw Object.assign(new Error('forbidden'), { status: 423 }); return p; };
  const value = createSocial({ players, now: () => clock, current, allowed: async s => current(s), emitRoom: (room, body) => events.push({ room, body }) });
  for (const p of players.values()) { const h = new Map(); value.attach(p.socket, (event, fn) => h.set(event, fn)); handlers.set(p.id, h); }
  return { ...value, a, b, c, players, events, request: (id, event, body = {}) => handlers.get(id).get('park:social:' + event)(body), advance: ms => { clock += ms; }, time: () => clock };
}

test('nearby high fives require recipient consent and reject cross-class, stale, self, distant and blocked requests', async () => {
  const f = await fixture();
  await assert.rejects(f.request('A', 'invite', { peerId: 'C', kind: 'highfive' }));
  await assert.rejects(f.request('A', 'invite', { peerId: 'A', kind: 'highfive' }));
  await assert.rejects(f.request('A', 'invite', { peerId: 'B', kind: 'fake' }));
  const invite = (await f.request('A', 'invite', { peerId: 'B', kind: 'highfive' })).invitation;
  assert.equal(f.events.filter(e => e.body?.type === 'effect').length, 0);
  await assert.rejects(f.request('A', 'reply', { invitationId: invite.id, action: 'accept' }), { status: 403 });
  await assert.rejects(f.request('C', 'reply', { invitationId: invite.id, action: 'accept' }), { status: 403 });
  await f.request('B', 'reply', { invitationId: invite.id, action: 'accept' });
  assert.equal(f.events.filter(e => e.body?.type === 'effect').length, 1); assert.equal(f.isBusy('A'), false); assert.equal(f.invitations.size, 0);
  await assert.rejects(f.request('B', 'reply', { invitationId: invite.id, action: 'accept' }));
  f.advance(9000); f.b.x += 1000;
  await assert.rejects(f.request('A', 'invite', { peerId: 'B', kind: 'duet' }));
  const w = await world; let blockedPair;
  for (const o of w.OBJECTS.filter(o => o.footprint)) {
    const distance = o.footprint.ry + 55, y = o.y + (o.footprint.dy || 0), a = { x: o.x, y: y - distance }, b = { x: o.x, y: y + distance };
    if (distance * 2 <= 360 && w.walkable(a.x, a.y) && w.walkable(b.x, b.y) && !w.clearLine(a, b)) { blockedPair = [a, b]; break; }
  }
  assert.ok(blockedPair, 'there is a visible solid separating nearby walkable positions'); Object.assign(f.a, blockedPair[0]); Object.assign(f.b, blockedPair[1]);
  await assert.rejects(f.request('A', 'invite', { peerId: 'B', kind: 'duet' }), /同一邊/); f.dispose();
});

test('invitations handle decline, sender cancellation and timeout without stranding either player or enabling spam', async () => {
  const f = await fixture();
  let invite = (await f.request('A', 'invite', { peerId: 'B', kind: 'duet' })).invitation;
  await f.request('B', 'reply', { invitationId: invite.id, action: 'decline' }); assert.equal(f.invitations.size, 0);
  f.advance(9000); await assert.rejects(f.request('A', 'invite', { peerId: 'B', kind: 'duet' }), { status: 429 });
  f.advance(22000); invite = (await f.request('A', 'invite', { peerId: 'B', kind: 'duet' })).invitation;
  await assert.rejects(f.request('B', 'reply', { invitationId: invite.id, action: 'cancel' }), { status: 403 });
  await f.request('A', 'reply', { invitationId: invite.id, action: 'cancel' }); assert.equal(f.invitations.size, 0);
  f.advance(9000); invite = (await f.request('A', 'invite', { peerId: 'B', kind: 'duet' })).invitation;
  f.advance(15000); await f.tick(); assert.equal(f.invitations.size, 0); assert.ok(f.events.some(e => e.body?.reason === 'expired'));
  await assert.rejects(f.request('B', 'reply', { invitationId: invite.id, action: 'accept' })); f.dispose();
});

test('two live participants receive one authoritative shared score; forged session IDs cannot submit for a partner', async () => {
  const f = await fixture(), r = await social;
  const invite = (await f.request('A', 'invite', { peerId: 'B', kind: 'duet' })).invitation;
  const session = (await f.request('B', 'reply', { invitationId: invite.id, action: 'accept' })).session;
  assert.equal(f.isBusy('A'), true); assert.equal(f.isBusy('B'), true); assert.equal(session.role, 1);
  await assert.rejects(f.request('C', 'input', { sessionId: session.id, round: 0, pad: 0 }));
  await assert.rejects(f.request('A', 'input', { sessionId: 'forged', round: 0, pad: 0 }));
  const internal = f.sessions.get(session.id);
  for (let round = 0; round < r.DUET.rounds; round++) {
    f.advance(r.duetTarget(internal.game, round) - f.time());
    await f.request('A', 'input', { sessionId: session.id, round, pad: internal.game.notes[round][0], score: 999999, role: 1 });
    if (round !== 3) await f.request('B', 'input', { sessionId: session.id, round, pad: internal.game.notes[round][1] });
    f.advance(r.DUET.windowMs); await f.tick();
  }
  const frameA = (await f.request('A', 'state')).session, frameB = (await f.request('B', 'state')).session;
  assert.equal(frameA.game.score, 1050); assert.equal(frameB.game.score, 1050); assert.equal(frameA.game.duets, 7); assert.equal(frameA.game.phase, 'result');
  await f.request('B', 'control', { sessionId: session.id, action: 'leave' }); assert.equal(f.isBusy('A'), false); assert.equal(f.sessions.size, 0); f.dispose();
});

test('concurrent accepts consume one invitation exactly once and cannot leak a second game', async () => {
  const f = await fixture(), invite = (await f.request('A', 'invite', { peerId: 'B', kind: 'duet' })).invitation;
  const replies = await Promise.allSettled(Array.from({ length: 8 }, () => f.request('B', 'reply', { invitationId: invite.id, action: 'accept' })));
  assert.equal(replies.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.sessions.size, 1); assert.equal(f.invitations.size, 0);
  f.cancelPlayer('A', 'locked'); assert.equal(f.sessions.size, 0); assert.equal(f.isBusy('B'), false); f.dispose();
});

test('disconnects, locked access, invisibility, socket replacement and expiry cancel sessions for both players', async () => {
  for (const change of [f => { f.b.socket.connected = false; }, f => { f.b.locked = true; }, f => { f.b.active = false; }, f => { f.players.set('B', { ...f.b }); }, f => { f.b.room = '5B'; }, f => { f.b.x += 600; }]) {
    const f = await fixture(); const invite = (await f.request('A', 'invite', { peerId: 'B', kind: 'duet' })).invitation;
    await f.request('B', 'reply', { invitationId: invite.id, action: 'accept' }); change(f); await f.tick();
    assert.equal(f.sessions.size, 0); assert.equal(f.isBusy('A'), false); assert.equal(f.isBusy('B'), false); f.dispose();
  }
  const f = await fixture(); const invite = (await f.request('A', 'invite', { peerId: 'B', kind: 'duet' })).invitation;
  await f.request('B', 'reply', { invitationId: invite.id, action: 'accept' }); f.advance(24000); await f.tick(); f.advance(46000); await f.tick(); assert.equal(f.sessions.size, 0); f.dispose();
});
