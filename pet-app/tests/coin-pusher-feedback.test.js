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
    advanceCoinPusherTimingStreak, coinPusherCabinetFinish, coinPusherStampProgress,
    coinPusherImpactPan, coinPusherTimingGuidanceLabel, coinPusherTimingRecordLabel, coinPusherTimingStreakLabel,
    coinPusherTravelProgress, coinPusherRewardFlightLabels, planCoinPusherRewardFlightDelays, COIN_PUSHER_CABINET_FINISHES,
    coinPusherTrayImpactPulse, COIN_PUSHER_REWARD_FLIGHT_STAGGER_MS, COIN_PUSHER_STAMP_THRESHOLDS,
    COIN_PUSHER_TRAY_PULSE_DURATION_MS,
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

  assert.equal(coinPusherTrayImpactPulse(-1), 0, 'the catcher glow must stay dark before a real impact');
  assert.equal(coinPusherTrayImpactPulse(0), 0, 'the glow envelope must begin without a hard flash');
  assert.equal(coinPusherTrayImpactPulse(COIN_PUSHER_TRAY_PULSE_DURATION_MS / 2), 1,
    'the physical catch should reach a single smooth peak halfway through its pulse');
  assert.equal(coinPusherTrayImpactPulse(COIN_PUSHER_TRAY_PULSE_DURATION_MS), 0,
    'the catcher glow must finish within its bounded duration');
  assert.equal(coinPusherTrayImpactPulse(COIN_PUSHER_TRAY_PULSE_DURATION_MS + 1), 0,
    'the catcher glow must not linger after the reward catch');
  assert.equal(coinPusherTrayImpactPulse(Number.NaN), 0, 'invalid timing must never make the tray glow stick on');
  assert.ok(coinPusherTrayImpactPulse(60) > 0 && coinPusherTrayImpactPulse(60) < 1,
    'the tray pulse should fade in and out smoothly instead of toggling');

  assert.equal(coinPusherImpactPan([{ x: 195 }], 390), 0,
    'a center-lane coin impact should keep its sound centered');
  assert.equal(coinPusherImpactPan([{ x: 0 }], 390), -.72,
    'left-edge impacts should pan left but stop before the hard stereo edge');
  assert.equal(coinPusherImpactPan([{ x: 390 }], 390), .72,
    'right-edge payouts should pan right but stop before the hard stereo edge');
  assert.equal(coinPusherImpactPan([{ x: 97.5 }, { x: 292.5 }], 390), 0,
    'a combined multi-coin catch should average its physical origin instead of favoring one coin');
  assert.equal(coinPusherImpactPan([{ x: Number.NaN }], 390), 0,
    'invalid projection data should safely fall back to centered audio');
  assert.equal(coinPusherImpactPan([{ x: 20 }], 0), 0,
    'a hidden or unmeasurable viewport should not create extreme audio placement');

  assert.deepEqual(COIN_PUSHER_STAMP_THRESHOLDS, [5, 25, 100, 300, 1000],
    'the keepsake ladder should provide both early and long-term cosmetic goals');
  assert.deepEqual(COIN_PUSHER_CABINET_FINISHES.map((finish) => finish.id),
    ['classic', 'bronze', 'silver', 'gold', 'crystal', 'aurora'],
    'the default finish and five server-confirmed stamps should map to six ordered cabinet palettes');
  assert.equal(coinPusherCabinetFinish(0).brass, 0xd0a45c,
    'the unearned cabinet must preserve the original classic brass appearance');
  assert.equal(coinPusherCabinetFinish(1).id, 'bronze', 'the first confirmed stamp should unlock bronze');
  assert.equal(coinPusherCabinetFinish(5).id, 'aurora', 'the final confirmed stamp should unlock aurora');
  assert.equal(coinPusherCabinetFinish(-5).id, 'classic', 'negative saved progress must not unlock a finish');
  assert.equal(coinPusherCabinetFinish(99).id, 'aurora', 'finish tiers must clamp to the last unlocked palette');
  assert.equal(coinPusherCabinetFinish(Number.NaN).id, 'classic', 'invalid progress must fall back to the default palette');
  for (const field of ['brass', 'paleGold', 'glow']) {
    assert.equal(new Set(COIN_PUSHER_CABINET_FINISHES.map((finish) => finish[field])).size, 6,
      `each cabinet finish must visibly vary its ${field} treatment`);
  }
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
  assert.equal(coinPusherTimingRecordLabel(firstHit.count, 0, 'zh-HK'), undefined,
    'a single landing should not announce an unremarkable personal record');
  assert.equal(coinPusherTimingRecordLabel(secondHit.count, firstHit.best, 'zh-HK'), '順勢接住 · 個人新紀錄 ×2！',
    'a streak should celebrate only when it exceeds the previous personal best');
  assert.equal(coinPusherTimingRecordLabel(secondHit.count, secondHit.best, 'en'), undefined,
    'reaching an already-held best must not falsely announce a new record');
  assert.equal(coinPusherTimingGuidanceLabel('home-pause', 'zh-HK'), '後停 · 等前推');
  assert.equal(coinPusherTimingGuidanceLabel('front-pause', 'zh-HK'), '前停 · 等下一推');
  assert.equal(coinPusherTimingGuidanceLabel('return', 'en'), 'RETURN · NEXT PUSH');
  assert.equal(coinPusherTimingGuidanceLabel('forward', 'zh-HK'), undefined,
    'the positive forward-stroke cue should stay distinct from neutral beat guidance');
  const missedBeat = advanceCoinPusherTimingStreak(secondHit, ['return', 'forward']);
  assert.deepEqual(missedBeat, { count: 1, best: 2 },
    'a non-forward landing breaks the current streak but preserves the session best');
  assert.equal(coinPusherTimingStreakLabel(missedBeat.count, 'zh-HK'), undefined,
    'a single hit should keep the existing lightweight timing cue');

  const firstRewardBurst = planCoinPusherRewardFlightDelays(2, 1000, 0);
  assert.deepEqual(firstRewardBurst, {
    delaysMs: [0, COIN_PUSHER_REWARD_FLIGHT_STAGGER_MS],
    nextAvailableAt: 1000 + COIN_PUSHER_REWARD_FLIGHT_STAGGER_MS * 2,
  }, 'coins caught together should receive distinct, evenly spaced wallet flights');
  const overlappingBurst = planCoinPusherRewardFlightDelays(3, 1080, firstRewardBurst.nextAvailableAt);
  assert.deepEqual(overlappingBurst, {
    delaysMs: [240, 240 + COIN_PUSHER_REWARD_FLIGHT_STAGGER_MS, 240 + COIN_PUSHER_REWARD_FLIGHT_STAGGER_MS * 2],
    nextAvailableAt: 1800,
  }, 'a second physical catch must continue the visual queue instead of restarting on top of the first');
  const cappedBurst = planCoinPusherRewardFlightDelays(8, 5000, 0);
  assert.deepEqual(cappedBurst.delaysMs, [0, 160, 320, 480, 640],
    'large payouts should cap the number of separate flight visuals while keeping a readable cadence');
  assert.deepEqual(coinPusherRewardFlightLabels(8), ['+1', '+1', '+1', '+1', '+4'],
    'the normal flight labels should account for every credited coin without spawning more than five chips');
  assert.deepEqual(coinPusherRewardFlightLabels(8, true), ['+8'],
    'reduced-motion players should get one static total instead of stacked non-moving reward chips');
  assert.deepEqual(coinPusherRewardFlightLabels(0, true), [],
    'empty reward events must never imply that any coins were earned');
  assert.deepEqual(planCoinPusherRewardFlightDelays(Number.NaN, 5000, 0), {
    delaysMs: [], nextAvailableAt: 5000,
  }, 'invalid reward visuals must not create a flight or poison the next scheduled payout');
});
