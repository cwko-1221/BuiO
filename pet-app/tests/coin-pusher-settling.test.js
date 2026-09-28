'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('vite');
const test = require('node:test');

test('supported coins absorb wobble without freezing flight, carrier movement or later shoves', async (t) => {
  const vite = await createServer({
    root: path.resolve(__dirname, '..'), server: { middlewareMode: true, hmr: false },
    appType: 'custom', logLevel: 'error', ssr: { noExternal: ['@dimforge/rapier3d'] },
  });
  t.after(() => vite.close());
  const { CoinPusherModel } = await vite.ssrLoadModule('/src/game/CoinPusherModel.ts');
  const { PUSHER_HOME_Z } = await vite.ssrLoadModule('/src/game/CoinPusherDimensions.ts');
  const { COIN_HALF_THICKNESS, FIXED_DECK_TOP_Y } = await vite.ssrLoadModule('/src/game/CoinPusherLayout.ts');
  const empty = () => {
    const model = new CoinPusherModel();
    for (const coin of model.coins.splice(0)) model.world.removeRigidBody(coin.body);
    return model;
  };
  const step = (model, frames) => {
    for (let frame = 0; frame < frames; frame += 1) model.update(1000 / 60);
  };

  const plate = empty();
  try {
    const id = plate.dropCoin(0);
    const coin = plate.coins.find(item => item.id === id);
    assert.ok(Math.abs(coin.body.angularDamping() - .9) < .0001, 'airborne tumble keeps the original flight drag');
    step(plate, 20);
    assert.equal(coin.impactReported, false, 'the damping check must still be in free flight');
    assert.ok(Math.abs(coin.body.angularDamping() - .9) < .0001);
    let landed;
    let settled;
    for (let frame = 20; frame < 180; frame += 1) {
      step(plate, 1);
      if (coin.impactReported) landed ??= frame;
      if (!coin.tumbling) { settled = frame; break; }
    }
    assert.ok(landed !== undefined && settled - landed < 60, 'an isolated drop settles within one second of contact');
    assert.equal(coin.body.angularDamping(), 5, 'contact drag must also cover older restored coins');
    assert.equal(coin.ridingPusher, true);
    const before = coin.body.translation().z;
    step(plate, 25);
    assert.ok(Math.abs(coin.body.translation().z - before) > .1, 'a calm coin still rides the moving plate');
    plate.startPayoutFall(coin);
    assert.ok(Math.abs(coin.body.angularDamping() - .9) < .0001, 'falling into the tray restores natural tipping drag');
    assert.equal(coin.body.isSleeping(), false, 'a released coin must be awake for gravity');
    assert.equal(coin.quietFrames, 0);
  } finally { plate.destroy(); }

  const idle = empty();
  try {
    const coin = idle.createCoin(0, .035 + COIN_HALF_THICKNESS + .008, PUSHER_HOME_Z + .5, true);
    step(idle, 100);
    assert.equal(coin.ridingPusher, true);
    assert.equal(coin.body.isSleeping(), true, 'a quiet plate dwell must not repeatedly wake its riders');
    const before = coin.body.translation().z;
    idle.dropCoin(-1);
    step(idle, 40);
    assert.equal(coin.body.isSleeping(), false, 'starting the mechanism wakes the supported coin');
    assert.equal(coin.ridingPusher, true);
    assert.ok(coin.body.translation().z - before > .1, 'the previously sleeping rider must follow the forward stroke');
  } finally { idle.destroy(); }

  const fixed = empty();
  try {
    const coin = fixed.createCoin(0, FIXED_DECK_TOP_Y + COIN_HALF_THICKNESS + .008, -.1, true);
    step(fixed, 100);
    assert.equal(coin.body.isSleeping(), true, 'a genuinely quiet fixed-bed coin may sleep');
    const before = coin.body.translation();
    const incoming = fixed.createCoin(-.4, before.y, before.z, false);
    incoming.body.setLinvel({ x: 1.4, y: 0, z: 0 }, true);
    step(fixed, 30);
    assert.ok(coin.body.translation().x - before.x > .025, 'a later collision wakes and shoves the quiet coin');
    assert.equal(fixed.drainEvents().some(event => event.type === 'coins-collected'), false,
      'settling and waking are not wallet payouts');
  } finally { fixed.destroy(); }

  const burst = new CoinPusherModel();
  try {
    for (let frame = 0; frame < 300; frame += 1) {
      if (frame % 15 === 0) burst.dropCoin(0);
      step(burst, 1);
    }
    // A bench dwell separates residual solver wobble from genuine ongoing pusher impacts.
    burst.mechanismStarted = false;
    step(burst, 180);
    const supported = burst.coins.filter(coin => !coin.falling);
    const maxSpin = Math.max(...supported.map(coin => {
      const angular = coin.body.angvel();
      return Math.hypot(angular.x, angular.y, angular.z);
    }));
    assert.ok(maxSpin < .45, `the crowded contact pile should reach the quiet settling band within three seconds (${maxSpin})`);
    assert.ok(supported.every(coin => coin.restNudges <= 2), 'the anti-wedge guard must not keep injecting repeated torque');
    const snapshot = burst.createSnapshot();
    for (const coin of snapshot.coins) delete coin.quietFrames;
    const restored = CoinPusherModel.restoreSnapshot(snapshot);
    try {
      assert.ok(restored.coins.every(coin => coin.quietFrames === 0), 'pre-settling saves remain compatible');
      step(restored, 5);
      assert.ok(restored.coins.every(coin => Number.isFinite(coin.quietFrames)));
    } finally { restored.destroy(); }
  } finally { burst.destroy(); }
});
