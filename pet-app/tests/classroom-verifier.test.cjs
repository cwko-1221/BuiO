'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createVerifier } = require('../lib/brawl/verifier.cjs');

class FixtureWorker extends EventEmitter {
  constructor({ readyMs = 5, workMs = 2, stall = false } = {}) {
    super(); this.workMs = workMs; this.stall = stall; this.sent = 0;
    this.timer = setTimeout(() => this.emit('message', { ready: true }), readyMs);
  }
  ref() {} unref() {}
  postMessage(job) { this.sent++; if (!this.stall) this.work = setTimeout(() => this.emit('message',
    { id: job.id, result: { endTick: job.endTick } }), this.workMs); }
  async terminate() { clearTimeout(this.timer); clearTimeout(this.work); this.emit('exit', 0); }
}

test('25 classmates queue safely and duplicate receipt retries share a single verification', async t => {
  const workers = [];
  const pool = createVerifier({ workerFactory: () => { const w = new FixtureWorker(); workers.push(w); return w; } });
  t.after(() => pool.close());
  const jobs = Array.from({ length: 25 }, (_, i) => pool.verify({}, [], i, `student-${i}`));
  const retry = pool.verify({}, [], 24, 'student-24');
  assert.equal(retry, jobs[24]);
  assert.deepEqual((await Promise.all(jobs)).map(r => r.endTick), Array.from({ length: 25 }, (_, i) => i));
  assert.equal(workers.length, 1); assert.equal(workers[0].sent, 25);
  await pool.verify({}, [], 25, 'student-24'); assert.equal(workers[0].sent, 26, 'completed work is not cached as another log');
});

test('slow worker startup gets its own deadline instead of consuming the replay budget', async t => {
  const pool = createVerifier({ timeoutMs: 40, startupMs: 500,
    workerFactory: () => new FixtureWorker({ readyMs: 90, workMs: 5 }) });
  t.after(() => pool.close());
  assert.equal((await pool.verify({}, [], 4)).endTick, 4);
});

test('a stuck worker is replaced and queued classmates still complete', async t => {
  let created = 0;
  const pool = createVerifier({ timeoutMs: 50, workerFactory: () => new FixtureWorker({ stall: ++created === 1 }) });
  t.after(() => pool.close());
  const first = assert.rejects(pool.verify({}, [], 1), { status: 503, retryable: true });
  const second = pool.verify({}, [], 2);
  await first; assert.equal((await second).endTick, 2); assert.equal(created, 2);
});

test('queue admission and shutdown remain bounded', async () => {
  const pool = createVerifier({ maxQueued: 1, workerFactory: () => new FixtureWorker({ readyMs: 500 }) });
  const accepted = assert.rejects(pool.verify({}, [], 1, 'first'), { status: 503 });
  await assert.rejects(pool.verify({}, [], 2, 'second'), { status: 503 });
  await pool.close(); await accepted; await assert.rejects(pool.verify({}, [], 3), { status: 503 });
});

test('an unsendable log does not strand the next queued student', async t => {
  const pool = createVerifier({ workerFactory: () => {
    const worker = new FixtureWorker(), post = worker.postMessage.bind(worker);
    worker.postMessage = job => { if (job.endTick === 1) throw new Error('DataCloneError'); post(job); };
    return worker;
  } });
  t.after(() => pool.close());
  const rejected = assert.rejects(pool.verify({}, [], 1), { status: 400 });
  const next = pool.verify({}, [], 2);
  await rejected; assert.equal((await next).endTick, 2);
});

test('settlement retries transient responses within a budget and never retries rejected logs', async () => {
  const { retrySettlement } = await import('../lib/brawl/settlement-retry.mjs');
  let calls = 0, now = 0;
  const result = await retrySettlement(async () => {
    if (++calls < 3) throw Object.assign(Error('busy'), { status: 503 });
    return { receipt: 'once' };
  }, { now: () => now, wait: async ms => { now += ms; } });
  assert.equal(result.receipt, 'once'); assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(retrySettlement(async () => { calls++; throw Object.assign(Error('invalid'), { status: 400 }); }));
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(retrySettlement(async () => { calls++; throw new TypeError('network'); }, { attempts: 3, wait: async () => {} }));
  assert.equal(calls, 3);
});
