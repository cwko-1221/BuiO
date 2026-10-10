'use strict';

// Bounded LRU values and shared in-flight work. Failures never poison the cache.
function createAsyncCache({ maxEntries = 512, maxBytes = 32 * 1024 * 1024, ttlMs = 86400000, sizeOf = value => value?.byteLength || 0, now = Date.now } = {}) {
  const values = new Map();
  const pending = new Map();
  let bytes = 0;
  let generation = 0;
  function remove(key) { const entry = values.get(key); if (entry) bytes -= entry.size; values.delete(key); }
  async function get(key, load) {
    const entry = values.get(key);
    if (entry && entry.expires > now()) {
      values.delete(key); values.set(key, entry);
      return entry.value;
    }
    remove(key);
    if (pending.has(key)) return pending.get(key);
    const revision = generation;
    const promise = Promise.resolve().then(load).then(value => {
      const size = Math.max(0, sizeOf(value));
      if (revision === generation && size <= maxBytes) {
        remove(key);
        while (values.size && (values.size >= maxEntries || bytes + size > maxBytes)) remove(values.keys().next().value);
        values.set(key, { value, size, expires: now() + ttlMs }); bytes += size;
      }
      return value;
    }).finally(() => { if (pending.get(key) === promise) pending.delete(key); });
    // Excess unique requests still run, but cannot grow the tracking map forever.
    if (pending.size < maxEntries) pending.set(key, promise);
    return promise;
  }
  return { get, clear() { generation++; values.clear(); pending.clear(); bytes = 0; }, stats() { return { entries: values.size, bytes, pending: pending.size }; } };
}

module.exports = { createAsyncCache };
