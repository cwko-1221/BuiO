// RTT midpoint estimates server time; the least delayed sample minimizes queueing error.
// performance.now() keeps the countdown independent of device clock adjustments.
export function createClock(now = () => performance.now()) {
  let offset = 0, rtt = Infinity, sampledAt = -Infinity;
  return {
    get ready() { return Number.isFinite(rtt) && now() - sampledAt < 60000; },
    get rtt() { return rtt; },
    get offset() { return offset; },
    now: () => now() + offset,
    async sync(request, count = 5) {
      const samples = [];
      for (let n = 0; n < count; n++) {
        const before = now();
        const serverNow = await request();
        const after = now();
        if (Number.isFinite(serverNow)) samples.push({ rtt: after - before, offset: serverNow - (before + after) / 2 });
      }
      if (!samples.length) throw new Error('Clock synchronization failed');
      const best = samples.sort((a, b) => a.rtt - b.rtt)[0];
      offset = best.offset; rtt = best.rtt; sampledAt = now();
      return { offset, rtt };
    },
    invalidate() { sampledAt = -Infinity; },
  };
}
