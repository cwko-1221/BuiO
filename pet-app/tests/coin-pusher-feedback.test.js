'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { createServer } = require('vite');
const test = require('node:test');

test('paw-stamp progress agrees with cumulative payout totals at each milestone', async (t) => {
  const vite = await createServer({
    root: path.resolve(__dirname, '..'),
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
  t.after(() => vite.close());
  const {
    advanceCoinPusherTimingStreak, coinPusherStampProgress, coinPusherTimingStreakLabel,
    coinPusherTravelProgress, COIN_PUSHER_STAMP_THRESHOLDS,
  } = await vite.ssrLoadModule('/src/game/CoinPusherFeedback.ts');
  const dimensions = await vite.ssrLoadModule('/src/game/CoinPusherDimensions.ts');

  assert.equal(coinPusherTravelProgress(dimensions.PUSHER_HOME_Z), 0,
    'the idle/home pusher should leave its rail glow at the cool end');
  assert.equal(coinPusherTravelProgress((dimensions.PUSHER_HOME_Z + dimensions.PUSHER_FORWARD_Z) / 2), .5,
    'the rail glow should track half of the actual plate travel');
  assert.equal(coinPusherTravelProgress(dimensions.PUSHER_FORWARD_Z), 1,
    'the extended pusher should reach the warm end of the rail glow');
  assert.equal(coinPusherTravelProgress(dimensions.PUSHER_HOME_Z - 1), 0,
    'small solver excursions must not move the light outside its rear stop');
  assert.equal(coinPusherTravelProgress(dimensions.PUSHER_FORWARD_Z + 1), 1,
    'small solver excursions must not move the light beyond its front stop');
  assert.equal(coinPusherTravelProgress(Number.NaN), 0,
    'invalid visual progress must fall back to the safe idle color');

  assert.deepEqual(COIN_PUSHER_STAMP_THRESHOLDS, [5, 25, 100, 300, 1000],
    'the keepsake ladder should provide both early and long-term cosmetic goals');
  assert.deepEqual(coinPusherStampProgress(0), {
    total: 0, unlockedCount: 0, previousThreshold: 0, nextThreshold: 5, stepProgress: 0, stepSize: 5, percent: 0,
  });
  assert.deepEqual(coinPusherStampProgress(4), {
    total: 4, unlockedCount: 0, previousThreshold: 0, nextThreshold: 5, stepProgress: 4, stepSize: 5, percent: 80,
  });
  assert.deepEqual(coinPusherStampProgress(5), {
    total: 5, unlockedCount: 1, previousThreshold: 5, nextThreshold: 25, stepProgress: 0, stepSize: 20, percent: 0,
  }, 'unlocking one keepsake should start a fresh progress bar for the next tier');
  assert.deepEqual(coinPusherStampProgress(15), {
    total: 15, unlockedCount: 1, previousThreshold: 5, nextThreshold: 25, stepProgress: 10, stepSize: 20, percent: 50,
  });
  assert.deepEqual(coinPusherStampProgress(24), {
    total: 24, unlockedCount: 1, previousThreshold: 5, nextThreshold: 25, stepProgress: 19, stepSize: 20, percent: 95,
  });
  assert.deepEqual(coinPusherStampProgress(25), {
    total: 25, unlockedCount: 2, previousThreshold: 25, nextThreshold: 100, stepProgress: 0, stepSize: 75, percent: 0,
  });
  assert.deepEqual(coinPusherStampProgress(100), {
    total: 100, unlockedCount: 3, previousThreshold: 100, nextThreshold: 300, stepProgress: 0, stepSize: 200, percent: 0,
  });
  assert.deepEqual(coinPusherStampProgress(299), {
    total: 299, unlockedCount: 3, previousThreshold: 100, nextThreshold: 300, stepProgress: 199, stepSize: 200, percent: 99,
  });
  assert.deepEqual(coinPusherStampProgress(300), {
    total: 300, unlockedCount: 4, previousThreshold: 300, nextThreshold: 1000, stepProgress: 0, stepSize: 700, percent: 0,
  });
  assert.deepEqual(coinPusherStampProgress(1000), {
    total: 1000, unlockedCount: 5, previousThreshold: 1000, nextThreshold: undefined, stepProgress: 0, stepSize: undefined, percent: 100,
  });
  assert.equal(coinPusherStampProgress(-3).total, 0, 'negative persisted totals must not produce negative progress');
  assert.equal(coinPusherStampProgress(Number.NaN).percent, 0, 'invalid totals must safely display empty progress');

  const firstHit = advanceCoinPusherTimingStreak({ count: 0, best: 0 }, ['forward']);
  assert.deepEqual(firstHit, { count: 1, best: 1 }, 'one real forward-stroke landing starts a cosmetic streak');
  const secondHit = advanceCoinPusherTimingStreak(firstHit, ['forward']);
  assert.deepEqual(secondHit, { count: 2, best: 2 }, 'consecutive real forward-stroke landings extend the streak');
  assert.equal(coinPusherTimingStreakLabel(secondHit.count, 'zh-HK'), '順勢接住 · 連中 ×2！');
  assert.equal(coinPusherTimingStreakLabel(secondHit.count, 'en'), 'NICE TIMING · STREAK ×2');
  const missedBeat = advanceCoinPusherTimingStreak(secondHit, ['return', 'forward']);
  assert.deepEqual(missedBeat, { count: 1, best: 2 },
    'a non-forward landing breaks the current streak but preserves the session best');
  assert.equal(coinPusherTimingStreakLabel(missedBeat.count, 'zh-HK'), undefined,
    'a single hit should keep the existing lightweight timing cue');
});
