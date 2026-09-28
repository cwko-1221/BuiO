'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('vite');
const test = require('node:test');

test('a shelf coin rides both strokes until the backboard physically strips the crowded shelf', async (t) => {
  const vite = await createServer({
    root: path.resolve(__dirname, '..'), server: { middlewareMode: true, hmr: false },
    appType: 'custom', logLevel: 'error', ssr: { noExternal: ['@dimforge/rapier3d'] },
  });
  t.after(() => vite.close());
  const { CoinPusherModel } = await vite.ssrLoadModule('/src/game/CoinPusherModel.ts');
  const dimensions = await vite.ssrLoadModule('/src/game/CoinPusherDimensions.ts');
  const { COIN_RADIUS, COIN_HALF_THICKNESS, FIXED_DECK_TOP_Y } =
    await vite.ssrLoadModule('/src/game/CoinPusherLayout.ts');
  const empty = () => {
    const model = new CoinPusherModel();
    for (const coin of model.coins.splice(0)) model.world.removeRigidBody(coin.body);
    return model;
  };

  // A lone coin has nothing to push it off: neither the reversal nor the end pause is a release.
  let totalBlockedFrames = 0;
  for (const elapsed of [0, 1.9, 2.4, 3.3, 2.7]) {
    const model = empty();
    try {
      model.mechanismStarted = true;
      model.elapsed = elapsed;
      model.pusherZ = model.normalPusherZ(elapsed);
      model.pusherBody.setTranslation({ x: 0, y: .02, z: model.pusherZ }, true);
      const z = dimensions.REAR_CASE_FRONT_Z + .43;
      const coin = model.createCoin(0, .067, z, elapsed !== 2.7);
      coin.tumbling = false;
      coin.body.setEnabledRotations(false, true, false, true);
      coin.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      let attached = false;
      let returnFrames = 0;
      let blockedFrames = 0;
      for (let frame = 0; frame < 450; frame += 1) {
        const before = coin.body.translation();
        const plateBefore = model.pusherZ;
        model.update(1000 / 60);
        const position = coin.body.translation();
        attached ||= coin.ridingPusher;
        if (!attached) continue;
        assert.equal(coin.ridingPusher, true,
          `the lone shelf coin must not detach merely because the plate reverses (start ${elapsed}, frame ${frame})`);
        assert.equal(coin.transferringToDeck, false, 'no edge crossing means no shelf-to-table fall');
        const rearLimit = dimensions.REAR_CASE_FRONT_Z + .004 + COIN_RADIUS + .006;
        const expectedZ = Math.max(rearLimit, before.z + model.pusherZ - plateBefore);
        assert.ok(Math.abs(position.z - expectedZ) < .015,
          `a free rider follows the plate; a rear-blocked rider stops at the backboard (${position.z}, ${expectedZ})`);
        assert.ok(position.y > .055, 'a supported shelf coin must never sink to the lower deck');
        if (model.strokeDirection === 'return') {
          returnFrames += 1;
          if (Math.abs(position.z - rearLimit) < .015) blockedFrames += 1;
        }
      }
      assert.equal(attached, true, `landing at cycle time ${elapsed} must establish a carrier, including return/dwell`);
      assert.ok(returnFrames > 30, 'the fixture must exercise a sustained return stroke');
      totalBlockedFrames += blockedFrames;
      assert.equal(model.drainEvents().some((event) => event.type === 'coins-collected'), false,
        'shelf transport must not itself award student coins');
    } finally { model.destroy(); }
  }
  assert.ok(totalBlockedFrames > 0, 'the fixtures must reach the backboard before relative sliding begins');

  const crowded = empty();
  try {
    crowded.mechanismStarted = true;
    crowded.elapsed = 1.9;
    crowded.pusherZ = dimensions.PUSHER_FORWARD_Z;
    crowded.pusherBody.setTranslation({ x: 0, y: .02, z: crowded.pusherZ }, true);
    const coins = Array.from({ length: 5 }, (_, index) => {
      const coin = crowded.createCoin(0, .067, dimensions.REAR_CASE_FRONT_Z + COIN_RADIUS + .018 + index * .343, true);
      coin.tumbling = false;
      coin.body.setEnabledRotations(false, true, false, true);
      crowded.attachPusherRider(coin);
      return coin;
    });
    let rearContact = false;
    let crossedFront = false;
    let landed = false;
    let releaseZ;
    const frontCoin = coins.at(-1);
    for (let frame = 0; frame < 150; frame += 1) {
      crowded.update(1000 / 60);
      rearContact ||= coins[0].body.translation().z <= dimensions.REAR_CASE_FRONT_Z + COIN_RADIUS + .025;
      const position = frontCoin.body.translation();
      if (frontCoin.transferringToDeck) {
        crossedFront = true;
        releaseZ ??= position.z;
        assert.equal(rearContact, true, 'release needs actual rear-wall pressure, not just a return phase');
        assert.ok(position.z >= crowded.pusherZ + dimensions.PUSHER_HALF_DEPTH - .025,
          'the coin must clear the slab front before falling, never pass down through its middle');
      }
      if (crossedFront && crowded.hasVerticalFixedContact(frontCoin)) {
        landed = true;
        const rotation = frontCoin.body.rotation();
        const axisY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
        const halfHeight = COIN_RADIUS * Math.sqrt(Math.max(0, 1 - axisY * axisY)) + COIN_HALF_THICKNESS * Math.abs(axisY);
        assert.ok(position.y - halfHeight < FIXED_DECK_TOP_Y + .02,
          'the stripped coin must land on the lower tabletop');
        break;
      }
    }
    assert.equal(crossedFront, true, 'backboard pressure must push the crowded front coin off the retracting shelf');
    assert.equal(landed, true, `the stripped coin must visibly fall onto the table (release z ${releaseZ})`);
    assert.equal(crowded.drainEvents().some((event) => event.type === 'coins-collected'), false,
      'shelf-to-table transfer is not a wallet payout');
  } finally { crowded.destroy(); }
});
