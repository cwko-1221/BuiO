import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const { createClock } = await import(`data:text/javascript,${encodeURIComponent(await fs.readFile(new URL('../buzzer-app/public/clock.js', import.meta.url), 'utf8'))}`);

let monotonic = 100;
const epoch = 1700000000000;
const clock = createClock(() => monotonic);
let sample = 0;
await clock.sync(async () => {
  const queueDelay = [500, 200, 0, 900, 350][sample++];
  monotonic += 20;
  const serverNow = epoch + monotonic;
  monotonic += 20 + queueDelay;
  return serverNow;
});
assert.equal(clock.rtt, 40);
assert.equal(clock.offset, epoch);
assert.equal(clock.now(), epoch + monotonic);
assert.equal(clock.ready, true);
monotonic += 3000;
assert.equal(clock.now(), epoch + monotonic, 'countdown uses elapsed time, not the device wall clock');
monotonic += 60000;
assert.equal(clock.ready, false, 'stale clock samples cannot enable buzzing');
clock.invalidate();
assert.equal(clock.ready, false);
console.log('✓ clock midpoint calibration, lowest-RTT sample, queue jitter, monotonic countdown and stale-clock lockout');
