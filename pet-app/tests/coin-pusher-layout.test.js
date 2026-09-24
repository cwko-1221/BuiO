'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('vite');
const test = require('node:test');

test('loading preview and Rapier share the same collision-safe starter pile', async (t) => {
  const vite = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
  t.after(() => vite.close());

  const { COIN_HALF_THICKNESS, COIN_RADIUS, COIN_SPACING, createCoinPusherStarterLayout, FIXED_DECK_TOP_Y } =
    await vite.ssrLoadModule('/src/game/CoinPusherLayout.ts');
  const dimensions = await vite.ssrLoadModule('/src/game/CoinPusherDimensions.ts');
  const coins = createCoinPusherStarterLayout();
  assert.deepEqual(coins, createCoinPusherStarterLayout(), 'each new board must use the same stable preview layout');

  const baseLayer = coins.filter((coin) => Math.abs(coin.y - (FIXED_DECK_TOP_Y + COIN_HALF_THICKNESS)) < 1e-9);
  const upperLayer = coins.filter((coin) => Math.abs(coin.y - (FIXED_DECK_TOP_Y + COIN_HALF_THICKNESS * 3)) < 1e-9);
  assert.equal(baseLayer.length, 132);
  assert.equal(upperLayer.length, 25);
  assert.equal(coins.length, 157);
  assert.ok(coins.every(({ x, y, z }) => Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)));
  assert.ok(coins.every((coin) => Math.abs(coin.x) < 2.57
    && coin.z > dimensions.MAIN_DECK_BACK_Z && coin.z < dimensions.MAIN_DECK_FRONT_Z),
  'the preview pile must stay inside the actual deck and its side rails');

  const minimumBaseSpacing = COIN_RADIUS * 2 + .003;
  for (let left = 0; left < baseLayer.length; left += 1) {
    for (let right = left + 1; right < baseLayer.length; right += 1) {
      assert.ok(Math.hypot(baseLayer[left].x - baseLayer[right].x, baseLayer[left].z - baseLayer[right].z)
        >= minimumBaseSpacing - 1e-9, 'the flat preview coins must never start interpenetrating');
    }
  }
  for (let left = 0; left < upperLayer.length; left += 1) {
    for (let right = left + 1; right < upperLayer.length; right += 1) {
      assert.ok(Math.hypot(upperLayer[left].x - upperLayer[right].x, upperLayer[left].z - upperLayer[right].z)
        >= .52 - 1e-9, 'upper-layer coins must remain visibly separated');
    }
  }
  assert.ok(COIN_SPACING > COIN_RADIUS * 2, 'the hex rows must have positive edge clearance');
});
