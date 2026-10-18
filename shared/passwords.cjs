'use strict';
const path = require('node:path');
const { Worker } = require('node:worker_threads');

// bcryptjs is CPU work even when its Promise API is used. Keep that work off
// the thread which runs live game ticks and HTTP, with one bounded worker.
function createPasswordPool({ maxPending = 64, timeoutMs = 60000 } = {}) {
  let worker, sequence = 0, closed = false;
  const pending = new Map();
  const unavailable = () => Object.assign(new Error('登入服務正忙，請稍候再試。'), { status: 503, retryable: true });
  function finish(id, error, result) {
    const job = pending.get(id);
    if (!job) return;
    pending.delete(id); clearTimeout(job.timer);
    if (!pending.size) worker?.unref();
    error ? job.reject(error) : job.resolve(result);
  }
  function retire(target) {
    if (worker !== target) return;
    worker = undefined;
    for (const id of pending.keys()) finish(id, unavailable());
    return target.terminate();
  }
  function run(operation, password, value) {
    if (closed || pending.size >= maxPending) return Promise.reject(unavailable());
    if (!worker) {
      try {
        const target = worker = new Worker(path.join(__dirname, 'password-worker.cjs'));
        target.on('message', ({ id, result, failed }) => {
          if (worker === target) finish(id, failed ? unavailable() : null, result);
        });
        target.on('error', () => retire(target));
        target.on('exit', () => retire(target));
      } catch { return Promise.reject(unavailable()); }
    }
    const target = worker, id = ++sequence;
    target.ref();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => retire(target), timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try { target.postMessage({ id, operation, password, value }); }
      catch { finish(id, unavailable()); }
    });
  }
  async function close() {
    closed = true;
    const target = worker;
    if (target) await retire(target);
  }
  return { compare: (password, hash) => run('compare', password, hash),
    hash: (password, rounds = 10) => run('hash', password, rounds), close };
}

module.exports = { ...createPasswordPool(), createPasswordPool };
