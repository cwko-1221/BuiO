'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'buio-park-movement-'));
process.env.BUIO_JSON_DB_FILE = path.join(temp, 'db.json'); process.env.SUPABASE_DB_URL = '';
fs.writeFileSync(process.env.BUIO_JSON_DB_FILE, JSON.stringify({ users: [], studentStats: [], questionLogs: [] }));
const register = require('../server/park');

class Socket extends EventEmitter {
  get volatile() { return this; }
  connected = true;
  data = { studentId: 'S001', expiresAt: 9000000 };
  request = { headers: {}, session: { studentId: 'S001', role: 'student' } };
  join() {}
  leave() {}
  disconnect() { this.connected = false; this.emit('disconnect'); }
}

function harness() {
  const packets = [], callbacks = [];
  let clock = 1000000;
  const namespace = new EventEmitter(); namespace.use = () => {};
  namespace.to = room => ({ emit: (event, payload) => packets.push({ room, event, payload }), volatile: { emit: (event, payload) => packets.push({ room, event, payload }) } });
  const io = { of: () => namespace, httpServer: new EventEmitter() };
  const realInterval = global.setInterval;
  let service;
  try {
    global.setInterval = (callback, delay) => { const token = { unref() {} }; callbacks.push({ callback, delay, token }); return token; };
    service = register(io, { now: () => clock });
  } finally { global.setInterval = realInterval; }
  const socket = new Socket(); namespace.emit('connection', socket);
  const player = { id: 'S001', socket, name: '測試寵物', className: '5A', room: 'park:runtime:5A', pet: { id: 'pet-1' }, x: 1220, y: 2850, path: [], mask: 0, facing: 'front', locked: false, active: true, inputAt: clock, seenAt: clock, pending: null, game: null, emoteUntil: 0 };
  service.players.set(player.id, player);
  const tick = callbacks.find(item => item.delay === 100).callback;
  return { service, socket, player, namespace, packets,
    request: (event, body = {}) => new Promise(resolve => socket.emit(event, body, resolve)),
    advance: async () => { clock += 100; await tick(); return packets.filter(packet => packet.event === 'park:frame').at(-1)?.payload.peers.find(p => p.id === player.id); },
    advanceGame: async () => { clock += 1000 / 30; await callbacks.find(item => Math.abs(item.delay - 1000 / 30) < .01).callback(); },
    clock: () => clock,
  };
}

test('production arcade samples apply on the next physics tick, ignore stale input, retain taps and pause idle clients', async t => {
  const g=await import('../lib/park-games.mjs'),h=harness();t.after(()=>h.service.dispose());
  const state=g.createGame('flight'),clock=h.clock();h.player.game={id:'run',day:require('../repositories/pet.repo').hkDay(new Date(clock)),startedAt:clock,inputAt:clock,frameAt:clock,inputSeq:0,accumulator:0,input:{},state};
  for(const body of [{seq:NaN},{seq:-1},{shieldPress:1.2},{specialPress:Infinity},{x:481},{y:-1}])assert.equal((await h.request('park:game:input',{session:'run',mask:0,...body})).status,400);
  assert.equal((await h.request('park:game:input',{session:'run',mask:0,x:400,y:400,seq:2,shieldPress:1})).success,true);
  assert.equal((await h.request('park:game:input',{session:'run',mask:0,x:50,y:650,seq:1})).stale,true);
  await h.advanceGame();assert.deepEqual(state.player,{x:400,y:400});assert.equal(state.inputSeq,2);assert.equal(state.shields,2);
  // A later motion sample cannot erase a short action, even before simulation.
  await h.request('park:game:input',{session:'run',mask:0,x:410,y:400,seq:3,shieldPress:2});
  await h.request('park:game:input',{session:'run',mask:0,x:420,y:400,seq:4,shieldPress:1});
  await h.advanceGame();assert.equal(state.shields,1);assert.equal(state.shieldPress,2);assert.equal(state.player.x,420);
  for(let i=0;i<12;i++)await h.advanceGame();assert.equal(state.shields,1);
  for(let i=0;i<60;i++)await h.advanceGame();assert.equal(state.paused,true);const tick=state.tick;await h.advanceGame();assert.equal(state.tick,tick);
});

test.after(() => { if (path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('buio-park-movement-')) fs.rmSync(temp, { recursive: true, force: true }); });

test('production movement handlers reject rail destinations and publish safe floats after contact with each bridge rail', async t => {
  const rules = await import('../lib/park-world.mjs'), { PARK_BRIDGES, FOOT_RADIUS } = await import('../lib/park-layout-v4.mjs');
  const h = harness(); t.after(() => h.service.dispose());
  for (const bridge of PARK_BRIDGES) for (const side of ['north', 'south']) {
    const rail = bridge.rails[side === 'north' ? 0 : 1], y = side === 'north' ? rail.y + rail.height + FOOT_RADIUS + .000001 : rail.y - FOOT_RADIUS - .000001;
    Object.assign(h.player, { x: bridge.x + bridge.width / 2, y, path: [], mask: 0 });
    const denied = await h.request('park:move', { x: h.player.x, y: rail.y + rail.height / 2 });
    assert.equal(denied.success, false); assert.equal(denied.status, 400);
    assert.equal((await h.request('park:input', { mask: side === 'north' ? 4 : 8 })).success, true);
    const packet = await h.advance(); assert.ok(packet); assert.ok(rules.walkable(packet.x, packet.y));
    assert.equal(packet.x, h.player.x); assert.equal(packet.y, h.player.y, 'broadcast must preserve the authoritative safe float');
    assert.equal(rules.walkable(Math.round(packet.x), Math.round(packet.y)), false, 'fixture must actually detect the old rounding regression');
    for (let i = 0; i < 12; i++) {
      const previous = { x: h.player.x, y: h.player.y };
      await h.request('park:input', { mask: side === 'north' ? 4 : 8 });
      const frame = await h.advance(); assert.ok(rules.walkable(frame.x, frame.y)); assert.ok(rules.clearLine(previous, frame));
    }
  }
});

test('production click-to-walk paths cross both bridges and every published foot position and step stays legal', async t => {
  const rules = await import('../lib/park-world.mjs'), { PARK_BRIDGES } = await import('../lib/park-layout-v4.mjs');
  const h = harness(); t.after(() => h.service.dispose());
  for (const bridge of PARK_BRIDGES) for (const reverse of [false, true]) {
    const left = { x: bridge.x - 100, y: bridge.y + bridge.height / 2 }, right = { x: bridge.x + bridge.width + 100, y: left.y };
    const start = reverse ? right : left, target = reverse ? left : right;
    Object.assign(h.player, start, { path: [], mask: 0 });
    const accepted = await h.request('park:move', target); assert.equal(accepted.success, true); assert.ok(accepted.path.length);
    let steps = 0;
    while (h.player.path.length && steps++ < 100) {
      const previous = { x: h.player.x, y: h.player.y }, packet = await h.advance();
      assert.ok(packet); assert.ok(rules.walkable(packet.x, packet.y)); assert.ok(rules.clearLine(previous, packet));
      assert.ok(Math.hypot(packet.x - previous.x, packet.y - previous.y) <= rules.WORLD.speed * .101);
    }
    assert.ok(steps < 100); assert.ok(Math.hypot(h.player.x - target.x, h.player.y - target.y) < .001);
  }
});

test('production rejoin refuses an invalid cached position as well as an invalid saved river position', async t => {
  const rules = await import('../lib/park-world.mjs'), h = harness(); t.after(() => h.service.dispose());
  const pets = require('../repositories/pet.repo'), repo = require('../repositories/park.repo'), users = require('../../math-app/repositories/users.repo'), access = require('../repositories/access-lock.repo');
  const status = { academicYear: '2026-27', className: '5A', locked: false };
  const replacements = [
    [pets, 'getBootstrap', async () => ({ profile: { activePetId: 'pet-1' }, pets: [{ id: 'pet-1' }] })],
    [repo, 'read', async () => ({ day: '2026-10-25', position: { x: 2520, y: 1810 } })],
    [repo, 'settings', async () => ({ dailyCap: 50 })],
    [repo, 'savePosition', async () => {}],
    [users, 'findById', async () => ({ studentid: 'S001', name: '測試寵物', role: 'student' })],
    [access, 'assertAllowed', async () => status],
  ];
  const originals = replacements.map(([target, key, fn]) => { const original = target[key]; target[key] = fn; return [target, key, original]; });
  t.after(() => originals.forEach(([target, key, value]) => target[key] = value));
  Object.assign(h.player, { x: 2520, y: 1810, room: 'park:2026-27:5A' });
  assert.equal(rules.walkable(h.player.x, h.player.y), false, 'fixture starts in the river');
  const replacement = new Socket(); h.namespace.emit('connection', replacement);
  const joined = await new Promise(resolve => replacement.emit('park:join', {}, resolve));
  assert.equal(joined.success, true); assert.ok(rules.walkable(joined.self.x, joined.self.y), 'a reconnect cannot preserve obsolete blocked terrain coordinates');
  assert.ok(rules.walkable(h.service.players.get('S001').x, h.service.players.get('S001').y));
});

test('authored world covers every bed and solid once, rejects stale paths, and guards visible interpolation after missing frames', async () => {
  const w = await import('../lib/park-world.mjs'), layout = await import('../lib/park-layout-v4.mjs');
  assert.equal(w.OBJECTS.length, Object.keys(layout.PARK_OBJECT_PLACEMENTS).length);
  for (const object of w.OBJECTS) assert.deepEqual({ x: object.x, y: object.y, at: object.at, footprint: object.footprint, solid: object.solid }, { x: layout.PARK_OBJECT_PLACEMENTS[object.id].x, y: layout.PARK_OBJECT_PLACEMENTS[object.id].y, at: layout.PARK_OBJECT_PLACEMENTS[object.id].at, footprint: layout.PARK_OBJECT_PLACEMENTS[object.id].footprint, solid: layout.PARK_OBJECT_PLACEMENTS[object.id].solid });
  for (const bed of layout.LANDSCAPE_BEDS) assert.equal(w.walkable(bed.x, bed.y), false);
  for (const plot of layout.GARDEN_PLOTS) {
    assert.equal(w.walkable(plot.x + plot.width / 2, plot.y + plot.height / 2), false);
    assert.equal(w.walkable(plot.at.x, plot.at.y), true); assert.ok(w.findPath(w.WORLD.spawn, plot.at).length);
  }
  const mailbox = w.OBJECTS.find(o => o.id === 'mailbox'), centerY = mailbox.y + mailbox.footprint.dy;
  assert.equal(w.walkable(mailbox.x + mailbox.footprint.rx + layout.FOOT_RADIUS + .5, centerY), true, 'do not add foot clearance twice');
  assert.equal(w.walkable(mailbox.x + mailbox.footprint.rx + layout.FOOT_RADIUS - .5, centerY), false);
  const bridge = layout.PARK_BRIDGES[0], current = { x: bridge.x - 100, y: bridge.y + bridge.height / 2 }, latest = { x: bridge.x + bridge.width + 100, y: bridge.y - 160 };
  assert.ok(w.walkable(current.x, current.y)); assert.ok(w.walkable(latest.x, latest.y));
  assert.equal(w.clearLine(current, latest), false);
  const rawMiddle = { x: (current.x + latest.x) / 2, y: (current.y + latest.y) / 2 };
  assert.equal(w.walkable(rawMiddle.x, rawMiddle.y), false, 'raw network interpolation reproduces the old water/rail defect');
  const visible = w.safeVisualPosition(current, latest, .5); assert.ok(w.walkable(visible.x, visible.y)); assert.deepEqual(visible, latest);
  const stale = { ...current, path: [{ x: bridge.x + bridge.width / 2, y: bridge.rails[0].y + 10 }], mask: 0, facing: 'front' };
  w.stepPlayer(stale, .1); assert.equal(stale.path.length, 0); assert.deepEqual({ x: stale.x, y: stale.y }, current);
  // Measured after actual diagonal keyboard contact in the independent browser
  // gate. The player must be able to issue another click-to-walk operation.
  const cornerContact = { x: 2192.500370533898, y: 2584.363238114654 };
  assert.ok(w.walkable(cornerContact.x, cornerContact.y));
  assert.ok(w.findPath(cornerContact, { x: 2780, y: 2588 }).length, 'legal rail contact must not strand the actor');
});
