'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../lib/brawl-ranking.cjs');

test('rank thresholds are wins in each tier, losses never reset them, and Diamond is the cap', () => {
  const p = rules.initial('S001');
  for (const [tier, needed] of [5, 10, 20, 40].entries()) {
    assert.equal(p.tier, tier);
    for (let i = 0; i < needed - 1; i++) rules.record(p, true);
    const progress = p.tierWins; rules.record(p, false); rules.record(p, null);
    assert.equal(p.tierWins, progress); assert.equal(p.tier, tier);
    rules.record(p, true); assert.equal(p.tier, tier + 1); assert.equal(p.tierWins, 0);
  }
  assert.equal(p.wins, 75); assert.equal(p.games, 83); assert.equal(p.losses, 4); assert.equal(p.draws, 4);
  rules.record(p, true); assert.equal(p.tier, 4); assert.equal(p.tierWins, 1);
  assert.equal(rules.publicRank(p).winsToPromote, null);
  assert.equal(rules.publicRank(p).winRate, 90.5);
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
