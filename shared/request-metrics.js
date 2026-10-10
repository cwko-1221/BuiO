'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');
const requests = new AsyncLocalStorage();
const marked = Symbol('buioMeasuredClient');
const elapsed = start => Number(process.hrtime.bigint() - start) / 1e6;

function instrumentPool(pool) {
  const connect = pool.connect.bind(pool);
  pool.connect = function (...args) {
    const metrics = requests.getStore();
    const start = process.hrtime.bigint();
    let finished = false;
    const done = () => { if (!finished && metrics) metrics.poolWaitMs += elapsed(start); finished = true; };
    const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
    try {
      if (callback) return connect(...args, (...values) => { done(); metrics ? requests.run(metrics, () => callback(...values)) : callback(...values); });
      return connect(...args).then(value => { done(); return value; }, error => { done(); throw error; });
    } catch (error) { done(); throw error; }
  };
  pool.on('connect', client => {
    if (client[marked]) return;
    client[marked] = true;
    const query = client.query.bind(client);
    client.query = function (...args) {
      const metrics = requests.getStore();
      const start = process.hrtime.bigint();
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        const ms = elapsed(start);
        if (metrics) { metrics.sqlCount++; metrics.sqlMs += ms; }
        if (ms >= 1000) console.warn('[db]', JSON.stringify({ event: 'slow_execution', requestId: metrics?.requestId || null, durationMs: Math.round(ms), operation: String(args[0]?.text || args[0] || '').trim().match(/^[A-Z]+/i)?.[0]?.toUpperCase() || 'QUERY' }));
      };
      const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
      try {
        if (callback) return query(...args, (...values) => { done(); callback(...values); });
        const result = query(...args);
        return result?.then ? result.then(value => { done(); return value; }, error => { done(); throw error; }) : result;
      } catch (error) { done(); throw error; }
    };
  });
  return pool;
}

async function measurePhase(name, fn) {
  const metrics = requests.getStore();
  const start = process.hrtime.bigint();
  try { return await fn(); }
  finally { if (metrics) metrics.phases[name] = (metrics.phases[name] || 0) + elapsed(start); }
}

module.exports = { requests, instrumentPool, measurePhase };
