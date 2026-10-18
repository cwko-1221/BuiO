import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// Real Socket.IO and authoritative simulation, isolated from school data.
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-classroom-network-'));
process.env.BUIO_JSON_DB_FILE = path.join(temp, 'db.json');
process.env.SUPABASE_DB_URL = '';
const ids = Array.from({ length: 25 }, (_, i) => `QA${i + 1}`);
await fs.writeFile(process.env.BUIO_JSON_DB_FILE, JSON.stringify({
  users: ids.map(studentid => ({ studentid, name: studentid, classname: '5A', role: 'student' })),
  studentStats: [], questionLogs: [], _logId: 0,
}));
const require = createRequire(import.meta.url), { Server } = require('socket.io');
const { io: connect } = createRequire(path.resolve('whiteboard-app/client/package.json'))('socket.io-client');
const pets = require('../pet-app/repositories/pet.repo'), store = require('../db/jsonStore');
for (const id of ids) await pets.ensureStudent(id);
const db = store.load(), petIds = ids.map(() => randomUUID());
ids.forEach((id, i) => {
  db.petWallets.find(w => w.studentId === id).balance = 10000;
  db.petInstances.push({ petId: petIds[i], studentId: id, speciesId: 'starpatch-cat',
    xp: 0, stage: 1, equippedSkills: [], equippedWearables: [] });
});
store.save();
const server = http.createServer(), io = new Server(server), sockets = [], events = [];
io.engine.use((req, _res, next) => { req.session = { studentId: req.headers['x-qa-student'], role: 'student' }; next(); });
const duels = require('../pet-app/server/duel')(io, { countdownMs: 0 });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const emit = (socket, event, body) => new Promise((resolve, reject) => socket.timeout(5000)
  .emit(event, body, (error, data) => error ? reject(error) : resolve(data)));
try {
  await duels.startup;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/pet-brawl`;
  await Promise.all(ids.map(async (id, index) => {
    const socket = connect(url, { extraHeaders: { 'x-qa-student': id }, transports: ['websocket'], reconnection: false });
    sockets[index] = socket; events[index] = [];
    socket.onAny((event, data) => events[index].push({ event, data }));
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    assert.equal((await emit(socket, 'duel:presence', { active: true, busy: false })).success, true);
  }));
  await wait(100);
  events.forEach(list => list.length = 0);
  await wait(2200);
  const unchangedPackets = events.flat().filter(e => e.event === 'duel:peers').length;
  assert.equal(unchangedPackets, 0, 'unchanged rosters should not download repeatedly');
  assert.equal((await emit(sockets[0], 'duel:presence', { active: true, busy: false })).peers.length, 24);
  assert.equal((await emit(sockets[24], 'duel:presence', { active: false, busy: false })).success, true);
  await wait(60);
  assert.equal(events[0].filter(e => e.event === 'duel:peers').at(-1).data.peers.length, 23);
  await emit(sockets[24], 'duel:presence', { active: true, busy: false });

  const rooms = await Promise.all(Array.from({ length: 12 }, async (_, pair) => {
    const i = pair * 2;
    const invitation = await emit(sockets[i], 'duel:invite', { targetId: ids[i + 1], petId: petIds[i],
      stageId: 'sunny-training', key: randomUUID() });
    assert.equal(invitation.success, true, JSON.stringify(invitation));
    const accepted = await emit(sockets[i + 1], 'duel:reply', { inviteId: invitation.invitation.id,
      accept: true, petId: petIds[i + 1] });
    assert.equal(accepted.success, true, JSON.stringify(accepted));
    const matchId = accepted.session.match.id;
    await Promise.all([sockets[i], sockets[i + 1]].map(s => emit(s, 'duel:ready', { matchId })));
    return duels.rooms.get(matchId);
  }));
  await wait(100); assert.ok(rooms.every(r => r.phase === 'playing'));
  events.forEach(list => list.length = 0);
  const before = rooms.map(r => r.state.tick);
  await wait(1200);
  const counts = events.slice(0, 24).map(list => list.filter(e => e.event === 'duel:frame').length);
  assert.ok(counts.every(n => n >= 32 && n <= 40), JSON.stringify(counts));
  assert.ok(rooms.every((r, i) => r.state.tick - before[i] >= 55), 'all 12 authoritative simulations progress');

  // Inject actual server transport backpressure: frames drop instead of queuing.
  const serverSocket = [...io.of('/pet-brawl').sockets.values()].find(s => s.data.profile.id === ids[0]);
  const transport = serverSocket.conn.transport;
  await wait(30); const buffered = serverSocket.conn.writeBuffer.length;
  transport.writable = false;
  await wait(320);
  assert.equal(serverSocket.conn.writeBuffer.length, buffered, 'old display states do not accumulate');
  transport.writable = true;
  events[0].length = 0; await wait(100);
  assert.ok(events[0].some(e => e.event === 'duel:frame'), 'latest display resumes after congestion');
  const room = rooms[0];
  assert.equal((await emit(sockets[0], 'duel:leave', { matchId: room.meta.id })).success, true);
  await wait(60);
  assert.equal(events[1].filter(e => e.event === 'duel:result').at(-1).data.match.status, 'finished');
  console.log(JSON.stringify({ passed: true, students: 25, simultaneousMatches: 12,
    unchangedRosterPacketsOver2200Ms: unchangedPackets, framesPer1200Ms: counts,
    congestedTransportQueuedFrames: 0, reliableResultVerified: true }));
} finally {
  sockets.forEach(s => s.disconnect()); duels.close();
  await new Promise(resolve => io.close(resolve));
  await fs.rm(temp, { recursive: true, force: true });
}
