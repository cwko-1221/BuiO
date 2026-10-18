const { test } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const { createPasswordPool } = require('../shared/passwords.cjs');

test('classroom password checks leave live-game timers running and preserve existing hashes', async () => {
  const pool = createPasswordPool(), hash = bcrypt.hashSync('classroom', 10);
  let beats = 0, last = performance.now(), longest = 0;
  const heartbeat = setInterval(() => { const now=performance.now();longest=Math.max(longest,now-last);last=now;beats++; }, 10);
  try {
    assert.deepEqual(await Promise.all(Array.from({ length: 25 }, () => pool.compare('classroom', hash))), Array(25).fill(true));
    assert.ok(beats >= 10, `game timer advanced ${beats} times during 25 password checks`);
    longest=Math.max(longest,performance.now()-last);
    assert.ok(longest<1000, `password checks must not stall the game timer for a second (${longest}ms)`);
    assert.equal(await pool.compare('incorrect', hash), false);
    const generated = await pool.hash('classroom', 10);
    assert.equal(bcrypt.getRounds(generated), 10);
    assert.equal(bcrypt.compareSync('classroom', generated), true);
  } finally { clearInterval(heartbeat); await pool.close(); }
});

test('password work has bounded admission and rejects after shutdown', async () => {
  const pool = createPasswordPool({ maxPending: 1 });
  const first = pool.hash('fixture', 10);
  await assert.rejects(pool.hash('fixture', 10), { status: 503 });
  await first; await pool.close();
  await assert.rejects(pool.hash('fixture', 10), { status: 503 });
});
