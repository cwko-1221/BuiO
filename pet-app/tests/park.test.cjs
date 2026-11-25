'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'buio-park-unit-'));
process.env.BUIO_JSON_DB_FILE = path.join(temp, 'db.json'); process.env.SUPABASE_DB_URL = '';
fs.writeFileSync(process.env.BUIO_JSON_DB_FILE, JSON.stringify({ users: [{ studentid: 'S001', role: 'student' }, { studentid: 'S002', role: 'student' }], studentStats: [], questionLogs: [] }));
const pets = require('../repositories/pet.repo');
const repo = require('../repositories/park.repo');
const store = require('../../db/jsonStore');
const world = import('../lib/park-world.mjs');
const now = Date.parse('2026-10-19T09:00:00+08:00');
function stepMode(w, quest, id) { const o = w.OBJECTS.find(o => o.id === id); return quest.requirements?.[id] || ({ flowers: 'water', acorn: 'search', litter: 'sort', chime: 'melody', drum: 'melody', bell: 'melody' })[o.kind] || 'visit'; }
after(() => { if (path.dirname(temp) === path.resolve(os.tmpdir()) && path.basename(temp).startsWith('buio-park-unit-')) fs.rmSync(temp, { recursive: true, force: true }); });


test('four districts, fourteen requests and every interaction are reachable without crossing solids', async () => {
  const w = await world; assert.equal(w.ZONES.length, 4); assert.equal(w.QUESTS.length, 14); assert.ok(w.OBJECTS.length >= 35);
  const seen = new Set();
  for (let day = 0; day < 90; day++) { const daily = w.dailyQuests(new Date(Date.UTC(2026,9,1)+day*86400000).toISOString().slice(0,10)); assert.equal(new Set(daily.map(q => q.id)).size, 3); daily.forEach(q => seen.add(q.id)); }
  assert.equal(seen.size, 14);
  for (const road of [...w.ROADS, ...w.BRANCHES]) for (let i = 1; i < road.length; i++) assert.ok(w.clearLine(road[i - 1], road[i]), 'visible trail crosses a solid');
  const crowd = []; for (let i = 0; i < 30; i++) { const point = w.spawnPoint(crowd); assert.ok(w.walkable(point.x, point.y)); assert.ok(crowd.every(other => Math.hypot(other.x - point.x, other.y - point.y) >= 95)); crowd.push(point); }
  for (const object of w.OBJECTS) {
    const point = w.interactionPoint(object); assert.ok(w.walkable(point.x, point.y), object.id);
    const route = w.findPath(w.WORLD.spawn, point); assert.ok(route.length, object.id);
    let previous = w.WORLD.spawn;
    for (const leg of route) { assert.ok(w.clearLine(previous, leg), object.id); previous = leg; }
    const player = { ...w.WORLD.spawn, path: route.map(point => ({ ...point })), mask: 0, facing: 'front' };
    for (let tick = 0; player.path.length && tick < 4000; tick++) {
      const before = { x: player.x, y: player.y }; w.stepPlayer(player, .05);
      assert.ok(w.walkable(player.x, player.y), object.id + ': authoritative step'); assert.ok(w.clearLine(before, player), object.id + ': published interpolation');
    }
    assert.ok(Math.hypot(player.x - point.x, player.y - point.y) < .01, object.id + ': complete movement reaches its interaction');
  }
  for (const point of [{ x: NaN, y: 20 }, { x: 40000, y: 500 }, { x: -20, y: 100 }]) assert.deepEqual(w.findPath(w.WORLD.spawn, point), []);
});
test('authoritative movement normalizes diagonals and caps stalled ticks', async () => {
  const w = await world, p = { ...w.WORLD.spawn, path: [], mask: 10, facing: 'front' };
  w.stepPlayer(p, 30); assert.ok(Math.hypot(p.x - w.WORLD.spawn.x, p.y - w.WORLD.spawn.y) <= w.WORLD.speed * .151);
  assert.ok(w.walkable(p.x, p.y)); assert.equal(p.path.length, 0);
});

test('finished cottage, flower beds and lily pond reject walking through their footprints and keep their approaches open', async () => {
  const w = await world;
  for (const id of ['home-door', 'flowers-a', 'flowers-b', 'flowers-c', 'pond']) {
    const object = w.OBJECTS.find(o => o.id === id);
    assert.equal(w.walkable(object.x, object.y + (object.footprint.dy || 0)), false, id);
    const approach = w.interactionPoint(object); assert.equal(w.walkable(approach.x, approach.y), true, id);
    assert.ok(w.findPath(w.WORLD.spawn, approach).length, id);
  }
});

test('illustrated plaza keeps building interiors, fountain basin and tree roots solid while paths remain open', async () => {
  const w = await world, fountain = w.OBJECTS.find(o => o.id === 'fountain');
  const buildings = w.OBJECTS.filter(o => o.kind === 'cottage').map(o => ({ x: o.x, y: o.y + o.footprint.dy }));
  for (const point of [...buildings, fountain, ...w.SCENERY.filter(o => o.kind === 'tree').slice(0, 8)]) {
    assert.equal(w.walkable(point.x, point.y), false, JSON.stringify(point));
  }
  const north = { x: fountain.x, y: fountain.y - 300 }, west = { x: fountain.x - 300, y: fountain.y }, front = { x: fountain.x, y: fountain.y + 120 };
  for (const point of [north, west, front, w.interactionPoint(fountain)]) assert.equal(w.walkable(point.x, point.y), true);
  const from = { x: fountain.x - 280, y: fountain.y }, target = { x: fountain.x + 280, y: fountain.y };
  assert.equal(w.clearLine(from, target), false);
  const path = w.findPath(from, target); assert.ok(path.length > 1);
  let previous = from; for (const point of path) { assert.ok(w.clearLine(previous, point)); previous = point; }
});

test('the authored creek blocks shortcuts and each finite bridge carries a complete authoritative crossing', async () => {
  const w = await world, { PARK_BRIDGES, FOOT_RADIUS } = await import('../lib/park-layout-v4.mjs');
  for (const [left, right] of [[{ x: 2150, y: 650 }, { x: 2920, y: 650 }], [{ x: 2100, y: 3130 }, { x: 2920, y: 3130 }]]) {
    assert.equal(w.clearLine(left, right), false, 'walking straight across water must fail');
    const route = w.findPath(left, right); assert.ok(route.length > 1);
    const player = { ...left, path: route, mask: 0, facing: 'front' };
    for (let i = 0; player.path.length && i < 1600; i++) { w.stepPlayer(player, .1); assert.ok(w.walkable(player.x, player.y)); }
    assert.ok(Math.hypot(player.x - right.x, player.y - right.y) < 2);
  }
  for (const bridge of PARK_BRIDGES) {
    const a = { x: bridge.x - 100, y: bridge.y + bridge.height / 2 }, b = { x: bridge.x + bridge.width + 100, y: a.y };
    assert.equal(w.clearLine(a, b), true, 'finite bridge deck stays open');
    for (const rail of bridge.rails) for (let i = 0; i <= 10; i++) {
      const p = { x: rail.x + rail.width * i / 10, y: rail.y + rail.height / 2 };
      assert.equal(w.walkable(p.x, p.y), false, 'rail solid cannot be overridden by the deck');
    }
    for (const y of [bridge.y + 28 + FOOT_RADIUS - .5, bridge.y + bridge.height - 28 - FOOT_RADIUS + .5]) assert.equal(w.walkable(bridge.x + bridge.width / 2, y), false, 'feet cannot overhang either rail');
  }
  for (const point of [{ x: 2520, y: 1510 }, { x: 2500, y: 3130 }]) assert.equal(w.walkable(point.x, point.y), false);
});
test('daily progress, concurrent retries, bonus, Hong Kong midnight and student isolation', async () => {
  const w = await world, day = pets.hkDay(new Date(now)), daily = w.dailyQuests(day);
  await pets.ensureStudent('S001'); await pets.ensureStudent('S002');
  assert.equal((await repo.settings()).dailyCap, 5000);
  await repo.interact('S001', daily[0].steps[0], { now });
  assert.deepEqual((await repo.read('S001', now)).quests, {});
  for (const quest of daily) {
    await repo.accept('S001', quest.id, { now });
    const early = await repo.interact('S001', quest.npc, { now }); assert.equal(early.earned, 0);
    for (const step of quest.steps) await Promise.all(Array.from({ length: 4 }, () => repo.interact('S001', step, { now, mode: stepMode(w, quest, step) })));
    const pending = (await repo.read('S001', now)).quests[quest.id]; assert.equal(pending.steps.length, quest.steps.length);
    await Promise.all(Array.from({ length: 8 }, () => repo.interact('S001', quest.npc, { now })));
  }
  const state = await repo.read('S001', now), expected = Math.min(5000, daily.reduce((n, q) => n + q.reward, 200));
  assert.equal(state.earned, expected); assert.equal(state.bonusClaimed, true);
  assert.equal(store.load().petWallets.find(w => w.studentId === 'S001').balance, expected);
  const ledger = store.load().petCurrencyLedger.filter(row => row.kind === 'park_daily');
  assert.equal(ledger.length, 4); assert.equal(new Set(ledger.map(row => row.idempotencyKey)).size, 4);
  assert.deepEqual((await repo.read('S002', now)).quests, {});
  assert.equal((await repo.read('S001', Date.parse('2026-10-19T23:59:59+08:00'))).earned, expected);
  assert.equal((await repo.read('S001', Date.parse('2026-10-20T00:00:00+08:00'))).earned, 0);
  const notFeatured = w.QUESTS.find(q => !daily.includes(q)); assert.ok((await repo.accept('S001', notFeatured.id, { now })).state.quests[notFeatured.id]);
  await assert.rejects(repo.accept('S001', 'missing-quest', { now }), { status: 400 });
});
test('teacher cap changes, commit permission failures and failed disk writes preserve wallet/progress', async () => {
  const w = await world, quest = w.dailyQuests(pets.hkDay(new Date(now)))[0];
  await repo.updateSettings('T001', 3);
  for (const value of [-1, 5001, 2.5, '5', NaN]) await assert.rejects(repo.updateSettings('T001', value), { status: 400 });
  await assert.rejects(repo.accept('S002', quest.id, { now, canCommit: () => { throw new Error('locked'); } }), /locked/);
  assert.deepEqual((await repo.read('S002', now)).quests, {});
  await repo.accept('S002', quest.id, { now }); for (const step of quest.steps) await repo.interact('S002', step, { now, mode: stepMode(w, quest, step) });
  const before = structuredClone(store.load()), save = store.save; store.save = () => { throw new Error('disk interrupted'); };
  await assert.rejects(repo.interact('S002', quest.npc, { now }), /disk interrupted/); store.save = save;
  assert.deepEqual(store.load().petCurrencyLedger, before.petCurrencyLedger);
  assert.deepEqual(store.load().petWallets, before.petWallets);
  assert.deepEqual(store.load().petParkProgress, before.petParkProgress);
  assert.equal((await repo.interact('S002', quest.npc, { now })).earned, 3);
  await repo.updateSettings('T001', 0); assert.equal((await repo.settings()).dailyCap, 0);
  pets.purgeJsonStudent('S002'); assert.ok(!store.load().petParkProgress.some(row => row.studentId === 'S002'));
  assert.ok(store.load().petParkProgress.some(row => row.studentId === 'S001'));
});
test('activity steps require the matching proof, ordered clues and game rewards stay idempotent under the shared cap', async () => {
  const w = await world, later = now + 86400000;
  await repo.updateSettings('T001', 5000);
  await repo.accept('S001', 'pipes', { now: later });
  await repo.interact('S001', 'sluice', { now: later, mode: 'pipes' });
  assert.deepEqual((await repo.read('S001', later)).quests.pipes.steps, []);
  await repo.interact('S001', 'pond', { now: later });
  await repo.interact('S001', 'sluice', { now: later });
  assert.deepEqual((await repo.read('S001', later)).quests.pipes.steps, ['pond']);
  await repo.interact('S001', 'sluice', { now: later, mode: 'pipes' });
  assert.equal((await repo.interact('S001', 'deer', { now: later })).earned, 500);
  await repo.accept('S001', 'banana', { now: later });
  const result = await repo.recordGame('S001', 'banana', { score: 14, qualified: true }, 'session-one', { now: later });
  assert.equal(result.gameCoins, 150); assert.ok(result.state.quests.banana.steps.includes('banana-game'));
  assert.equal((await repo.recordGame('S001', 'banana', { score: 14, qualified: true }, 'session-one', { now: later })).earned, 0);
  const replay = await repo.recordGame('S001', 'banana', { score: 21, qualified: true }, 'session-two', { now: later });
  assert.equal(replay.gameCoins, 0); assert.equal(replay.state.games.banana.best, 21); assert.equal(replay.state.games.banana.plays, 2);
  await repo.updateSettings('T001', 651);
  assert.equal((await repo.interact('S001', 'post', { now: later })).earned, 1);
  assert.equal((await repo.read('S001', later)).earned, 651);
  assert.ok((await repo.read('S001', later)).discoveries.includes('pond'));
});

test('new leisure games keep day-specific fish collections and idempotent rewards inside the same coin cap',async()=>{
  await repo.updateSettings('T001',5000);await pets.ensureStudent('S002');const day=Date.parse('2026-11-03T12:00:00+08:00');
  const first=await repo.recordGame('S002','fishing',{score:7,qualified:true,collection:[1,3]},'fishing-one',{now:day});assert.equal(first.gameCoins,150);assert.deepEqual(first.state.games.fishing.collection,[1,3]);
  const duplicate=await repo.recordGame('S002','fishing',{score:999,qualified:true,collection:[5]},'fishing-one',{now:day});assert.equal(duplicate.earned,0);assert.equal(duplicate.balance,first.balance);assert.equal(duplicate.state.games.fishing.best,7);assert.deepEqual(duplicate.state.games.fishing.collection,[1,3]);
  const next=await repo.recordGame('S002','fishing',{score:12,qualified:true,collection:[3,5]},'fishing-two',{now:day});assert.equal(next.gameCoins,0);assert.deepEqual(next.state.games.fishing.collection,[1,3,5]);assert.equal(next.state.games.fishing.plays,2);
  for(const kind of ['rhythm','lantern','golf']){const r=await repo.recordGame('S002',kind,{score:12,qualified:true},'first-'+kind,{now:day});assert.equal(r.gameCoins,150);assert.ok(r.state.earned<=5000);}
  const tomorrow=await repo.recordGame('S002','fishing',{score:3,qualified:true,collection:[0]},'tomorrow',{now:day+86400000});assert.equal(tomorrow.gameCoins,150);assert.deepEqual(tomorrow.state.games.fishing.collection,[0]);
});
