'use strict';
// Excel parsing/export shares the classroom process. Keep one report job active,
// bound its waiting list, and share simultaneous previews of the same period.
function createReportWork(capacity = 8) {
  let tail = Promise.resolve(), queued = 0;
  const pending = new Map();
  function run(task) {
    if (queued >= capacity) return Promise.reject(Object.assign(new Error('報表正在處理，請稍後再試。'), { status: 503 }));
    queued++;
    const promise = tail.then(task).finally(() => { queued--; });
    tail = promise.catch(() => {});
    return promise;
  }
  function preview(key, task) {
    if (pending.has(key)) return pending.get(key);
    const promise = run(task).finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }
  return { run, preview };
}
module.exports = { createReportWork };
