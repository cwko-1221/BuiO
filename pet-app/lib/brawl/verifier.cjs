'use strict';
const { Worker } = require('node:worker_threads');
const path = require('node:path');

function bounded(name, fallback, max) {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 && n <= max ? n : fallback;
}

// Reserve CPU for HTTP and live duels. Startup time is not verification time.
// A retry of the same validated run/digest shares its pending job.
function createVerifier({ workerCount = bounded('BRAWL_VERIFY_WORKERS', 1, 4),
  timeoutMs = bounded('BRAWL_VERIFY_TIMEOUT_MS', 15000, 30000),
  startupMs = 20000, queueMs = 120000, maxQueued = 32,
  workerFactory = () => new Worker(path.join(__dirname, 'verifier-worker.mjs')) } = {}) {
  let sequence = 0, closed = false;
  const queue = [], slots = [], pending = new Map();
  const unavailable = message => Object.assign(new Error(message), { status: 503, retryable: true });
  function complete(job, error, result) {
    clearTimeout(job.queueTimer);
    if (job.key && pending.get(job.key) === job.promise) pending.delete(job.key);
    if (error) job.reject(error); else job.resolve(result);
  }
  function retire(slot, error) {
    if (!slots.includes(slot)) return;
    clearTimeout(slot.timer); slots.splice(slots.indexOf(slot), 1);
    const job = slot.job || (!slot.ready ? queue.shift() : null);
    slot.job = null;
    if (job) complete(job, error);
    void slot.worker.terminate();
    pump();
  }
  function start() {
    while (!closed && queue.length && slots.length < workerCount) {
      let worker;
      try { worker = workerFactory(); }
      catch { complete(queue.shift(), unavailable('驗證服務正在重新連線，請稍後重試。')); continue; }
      const slot = { worker, ready: false, job: null, timer: null };
      slots.push(slot); worker.unref();
      slot.timer = setTimeout(() => retire(slot, unavailable('驗證服務啟動逾時，請稍後重試。')), startupMs);
      worker.on('message', message => {
        if (message.ready) { clearTimeout(slot.timer); slot.ready = true; pump(); return; }
        const job = slot.job;
        if (!job || message.id !== job.payload.id) return;
        clearTimeout(slot.timer); slot.job = null; worker.unref();
        complete(job, message.error ? Object.assign(new Error(message.error), { status: 400 }) : null, message.result);
        pump();
      });
      worker.on('error', () => retire(slot, unavailable('驗證服務已停止，請稍後重試。')));
      worker.on('exit', () => retire(slot, unavailable('驗證服務已停止，請稍後重試。')));
    }
  }
  function pump() {
    if (closed) return;
    start();
    for (const slot of slots) {
      if (!slot.ready || slot.job || !queue.length) continue;
      const job = slot.job = queue.shift();
      clearTimeout(job.queueTimer); slot.worker.ref();
      slot.timer = setTimeout(() => retire(slot, unavailable('驗證需時較長，請稍後重試。')), timeoutMs);
      try { slot.worker.postMessage(job.payload); }
      catch { clearTimeout(slot.timer); slot.job = null; slot.worker.unref(); complete(job, Object.assign(new Error('無效的冒險紀錄。'), { status: 400 })); queueMicrotask(pump); }
    }
  }
  function verify(options, inputs, endTick, key) {
    if (closed) return Promise.reject(unavailable('Verifier stopped'));
    if (key && pending.has(key)) return pending.get(key);
    if (queue.length >= maxQueued) return Promise.reject(unavailable('正在驗證其他對局，請稍後重試。'));
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const job = { resolve, reject, promise, key, payload: { id: ++sequence, options, inputs, endTick } };
    job.queueTimer = setTimeout(() => {
      const index = queue.indexOf(job);
      if (index >= 0) { queue.splice(index, 1); complete(job, unavailable('驗證排隊逾時，請稍後重試。')); }
    }, queueMs);
    if (key) pending.set(key, promise);
    queue.push(job); pump();
    return promise;
  }
  async function close() {
    closed = true;
    for (const job of queue.splice(0)) complete(job, unavailable('Verifier stopped'));
    const workers = slots.splice(0);
    for (const slot of workers) { clearTimeout(slot.timer); if (slot.job) complete(slot.job, unavailable('Verifier stopped')); }
    await Promise.all(workers.map(slot => slot.worker.terminate()));
  }
  return { verify, close };
}
module.exports = { ...createVerifier(), createVerifier };
