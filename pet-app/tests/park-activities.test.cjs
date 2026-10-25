const { test } = require('node:test');
const assert = require('node:assert/strict');
test('all puzzle variants accept valid solutions and reject incomplete or substituted answers', async () => {
  const a = await import('../lib/park-activities.mjs');
  for (let seed = 1; seed <= 40; seed++) {
    const search = a.createChallenge('search', 'acorn-a', seed);
    assert.equal(a.verifyChallenge(search, search.target), true); assert.equal(a.verifyChallenge(search, (search.target + 1) % 6), false);
    assert.equal('target' in a.publicChallenge(search), false);
    const water = a.createChallenge('water', 'flowers-a', seed);
    assert.equal(a.verifyChallenge(water, water.targets), true); assert.equal(a.verifyChallenge(water, [0, 0, 0]), false);
    const melody = a.createChallenge('melody', 'bell', seed);
    assert.equal(melody.notes.length, 5); assert.equal(a.verifyChallenge(melody, melody.notes), true); assert.equal(a.verifyChallenge(melody, melody.notes.slice(1)), false);
    const pipes = a.createChallenge('pipes', 'sluice', seed);
    assert.equal(a.verifyChallenge(pipes, a.PIPE_SOLUTION), true); assert.equal(a.verifyChallenge(pipes, Array(9).fill(15)), false);
  }
  assert.equal(a.verifyChallenge(a.createChallenge('code', 'hollow'), '243'), true);
  assert.equal(a.verifyChallenge(a.createChallenge('code', 'hollow'), '423'), false);
});
test('fixed-step games are deterministic, pause freezes play, targets require actual catches or pops', async () => {
  const g = await import('../lib/park-games.mjs');
  for (const kind of ['banana', 'flight']) {
    const a = g.createGame(kind, 123), b = g.createGame(kind, 123);
    a.paused = true; g.stepGame(a, { mask: 2 }); assert.equal(a.t, 0); a.paused = false;
    for (let i = 0; i < 30 * 65; i++) {
      const input = { x: 240 + Math.sin(i / 110) * 150, y: 620, mask: i % 300 === 0 ? 16 : 0 };
      g.stepGame(a, input); g.stepGame(b, input);
    }
    assert.deepEqual(a, b); assert.equal(a.status, 'ended');
    const result = g.gameResult(a);
    assert.equal(result.qualified, kind === 'banana' ? result.caught >= 8 : result.kills >= 6);
    const previous = structuredClone(a); g.stepGame(a, { mask: 15 }); assert.deepEqual(a, previous);
  }
});
