'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../lib/brawl-ranking.cjs');

test('promotion uses points in each tier, losses deduct points, draws do not, and Diamond is the cap', () => {
  const p = rules.initial('S001');
  for (const [tier, needed] of [25, 50, 100, 200].entries()) {
    assert.equal(p.tier, tier);
    for (let i = 0; i < needed / 5 - 1; i++) rules.record(p, true);
    assert.equal(p.points, needed - 5);
    rules.record(p, false); assert.equal(p.points, needed - 10);
    rules.record(p, null); assert.equal(p.points, needed - 10); assert.equal(p.tier, tier);
    rules.record(p, true); assert.equal(p.points, needed - 5); assert.equal(p.tier, tier);
    rules.record(p, true); assert.equal(p.tier, tier + 1); assert.equal(p.points, 0);
  }
  assert.equal(p.wins, 79); assert.equal(p.games, 87); assert.equal(p.losses, 4); assert.equal(p.draws, 4);
  rules.record(p, true); assert.equal(p.tier, 4); assert.equal(p.points, 5);
  assert.equal(rules.publicRank(p).pointsToPromote, null);
  assert.equal(rules.publicRank(p).winRate, 90.9);
  rules.record(p, false, -13); assert.equal(p.points, 0); assert.equal(p.tier, 4);
});
test('all 25 tier pairs use the requested upset/favorite points and 500-to-100 entry fees', () => {
  for (let first = 0; first <= 4; first++) for (let second = 0; second <= 4; second++) {
    const t = rules.terms(first, second), gap = Math.abs(first - second);
    assert.equal(t.fee, [500, 400, 300, 200, 100][gap]);
    assert.equal(t.winPoints[0], first <= second ? [5, 7, 9, 11, 13][gap] : [5, 4, 3, 2, 1][gap]);
    assert.equal(t.winPoints[1], second <= first ? [5, 7, 9, 11, 13][gap] : [5, 4, 3, 2, 1][gap]);
  }
});
test('legacy tier wins convert once to points without resetting tiers, statistics or reward cursors', () => {
  const old = { ...rules.initial('S001'), tier: 1, tierWins: 9, wins: 14, games: 20, losses: 6, rewardDay: '2026-10-06', rewardPaid: 100 };
  delete old.points; delete old.schemaVersion;
  assert.equal(rules.publicRank(old).points, 45); assert.equal(old.points, undefined, 'reading public data does not mutate storage');
  rules.migrate(old); assert.equal(old.points, 45); assert.equal(old.schemaVersion, 2);
  old.points = 35; rules.migrate(old); assert.equal(old.points, 35);
  assert.equal(old.tier, 1); assert.equal(old.games, 20); assert.equal(old.wins, 14); assert.equal(old.rewardDay, '2026-10-06'); assert.equal(old.rewardPaid, 100);
  const low = { ...old, points: 10, name: '甲', studentId: 'S001' }, high = { ...old, points: 20, wins: 1, name: '乙', studentId: 'S002' };
  assert.deepEqual([low, high].sort(rules.compare).map(p => p.studentId), ['S002', 'S001']);
});
test('daily rewards use the HK date, pay offline days once and only top up after same-day promotion', () => {
  const p = { ...rules.initial('S001'), tier: 1 };
  assert.equal(rules.hkDay(Date.parse('2026-10-06T15:59:59Z')), '2026-10-06');
  assert.equal(rules.hkDay(Date.parse('2026-10-06T16:00:00Z')), '2026-10-07');
  const at = Date.parse('2026-10-06T08:00:00Z');
  let plan = rules.rewardPlan(p, at); assert.equal(plan.amount, 100); rules.markPaid(p, plan);
  assert.equal(rules.rewardPlan(p, at), null);
  p.tier = 2; plan = rules.rewardPlan(p, at); assert.equal(plan.amount, 200); rules.markPaid(p, plan);
  p.tier = 3; plan = rules.rewardPlan(p, at); assert.equal(plan.amount, 200); rules.markPaid(p, plan);
  p.tier = 4; plan = rules.rewardPlan(p, at); assert.equal(plan.amount, 500); rules.markPaid(p, plan);
  assert.equal(rules.rewardPlan(p, at), null);
  plan = rules.rewardPlan(p, at + 3 * 86400000); assert.equal(plan.amount, 3000); assert.equal(plan.days, 3);
  assert.equal(plan.fromDay, '2026-10-07'); assert.equal(plan.toDay, '2026-10-09'); rules.markPaid(p, plan);
  assert.equal(rules.rewardPlan(p, at + 3 * 86400000), null);
  assert.equal(rules.rewardPlan(p, at), null);
  assert.equal(rules.rewardPlan(rules.initial('S002'), at), null);
});
