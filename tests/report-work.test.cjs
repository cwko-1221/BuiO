const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createReportWork } = require('../homework-app/lib/report-work');
test('six class previews share one read without caching stale results', async () => {
  const queue=createReportWork();let runs=0;
  const prepare=async()=>{runs++;await new Promise(r=>setTimeout(r,10));return { revision:runs };};
  const results=await Promise.all(Array.from({length:6},()=>queue.preview('week-9',prepare)));
  assert.equal(runs,1);assert.ok(results.every(r=>r.revision===1));
  assert.equal((await queue.preview('week-9',prepare)).revision,2);
});
test('exports and uploads serialize with previews, failures release the queue, and overload is bounded', async () => {
  const queue=createReportWork(2);let release,active=0,max=0;
  const first=queue.run(async()=>{active++;max=Math.max(max,active);await new Promise(r=>{release=r;});active--;throw Error('invalid workbook');});
  const second=queue.run(async()=>{active++;max=Math.max(max,active);active--;return 'saved';});
  await assert.rejects(queue.run(async()=>{}),e=>e.status===503);
  release();await assert.rejects(first,/invalid workbook/);assert.equal(await second,'saved');assert.equal(max,1);
  assert.equal(await queue.run(async()=>42),42);
});
