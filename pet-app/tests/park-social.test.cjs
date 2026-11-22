'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const social = import('../lib/park-social.mjs');

test('cooperative melody needs actual input from both players; duplicates, early taps and forged pads cannot become points', async () => {
  const r = await social, now = 100000;
  const game = r.createDuet(4832, now), duplicate = r.createDuet(4832, now);
  assert.deepEqual(game, duplicate);
  assert.equal(r.inputDuet(game, 0, 0, game.notes[0][0], now).accepted, false);
  for (let round = 0; round < r.DUET.rounds; round++) {
    const at = r.duetTarget(game, round);
    assert.equal(r.inputDuet(game, 0, round, game.notes[round][0], at).result, 'perfect');
    assert.equal(r.inputDuet(game, 0, round, game.notes[round][0], at).accepted, false);
    if (round !== 2) assert.equal(r.inputDuet(game, 1, round, game.notes[round][1], at + 250).result, 'good');
    r.advanceDuet(game, at + r.DUET.windowMs);
  }
  const result = r.publicDuet(game, r.duetTarget(game, 7) + r.DUET.windowMs + 1);
  assert.equal(result.phase, 'result'); assert.equal(result.duets, 7); assert.equal(result.stars, 3); assert.equal(result.score, 875); assert.equal(result.maxCombo, 5);
  assert.equal(result.history[2], false, 'one player alone does not complete a duet');
  assert.equal(r.inputDuet(game, 1, 7, game.notes[7][1], result.endsAt + 1).accepted, false);
  const miss = r.createDuet(88, now), target = r.duetTarget(miss, 0);
  assert.equal(r.inputDuet(miss, 0, 0, miss.notes[0][0], miss.startedAt + 5).result, 'early');
  assert.equal(r.inputDuet(miss, 1, 0, (miss.notes[0][1] + 1) % 4, target).result, 'wrong');
  r.advanceDuet(miss, target + r.DUET.windowMs); assert.equal(miss.score, 0);
  assert.equal(r.inputDuet(miss, 0, 1, Infinity, target + 2500).reason, 'invalid');
  for (let seed = 1; seed <= 8; seed++) assert.equal(new Set(r.createDuet(seed, now).notes.flat()).size, 4);
});
