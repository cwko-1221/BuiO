// Only replay endpoints whose server operations are idempotent. IndexedDB is
// scoped to the account and stores pending writes for at most 24 hours.
(function () {
  'use strict';
  const allowed = url => /^\/api\/(chinese|english)\/student\/attempts\/[\da-f-]{36}\/items\/[\da-f-]{36}$/.test(url)
    || url === '/api/chinese/upload' || url === '/api/quiz/submit' || url === '/api/homework/records';
  const nativeFetch = window.fetch.bind(window);
  let dbPromise, running = Promise.resolve(), timer, generation = 0;
  let hasPending = false, hasRunnable = false, failures = 0;
  let knownAccount = null;
  function remember(id) { knownAccount = { id, at: Date.now() }; }
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('buio-pending') : null;
  function database() {
    return dbPromise ||= new Promise((resolve, reject) => {
      const request = indexedDB.open('buio-pending-writes', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('writes', { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { dbPromise = null; reject(request.error); };
    });
  }
  async function transaction(mode, fn) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('writes', mode), request = fn(tx.objectStore('writes'));
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = tx.onerror = () => reject(tx.error || Error('Pending write could not be saved'));
    });
  }
  async function account(allowCached = false) {
    const revision = generation;
    try {
    const response = await nativeFetch('/api/auth/me', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw Object.assign(Error('Please sign in to synchronize.'), { status: response.status });
    const data = await response.json();
    if (!data.student?.id) throw Error('Session unavailable');
    if (revision !== generation) throw Object.assign(Error('The signed-in account changed.'), { status: 401 });
    remember(data.student.id);
    return data.student.id;
    } catch (error) {
      if (allowCached && !error.status && knownAccount && Date.now() - knownAccount.at < 86400000) return knownAccount.id;
      throw error;
    }
  }
  function pack(body) {
    if (body instanceof FormData) return { type: 'form', entries: [...body.entries()].map(([name, value]) => [name, value, value instanceof File ? value.name : null]) };
    return { type: 'text', value: body || null };
  }
  function unpack(body) {
    if (body.type !== 'form') return body.value;
    const form = new FormData();
    for (const [name, value, filename] of body.entries) filename ? form.append(name, value, filename) : form.append(name, value);
    return form;
  }
  function bodyBytes(body) {
    if (!body) return 0;
    return body.type === 'form'
      ? body.entries.reduce((sum, [name, value]) => sum + name.length * 2 + (value instanceof Blob ? value.size : String(value).length * 2), 0)
      : String(body.value || '').length * 2;
  }
  function notice(pending, blocked = false, runnable = pending) {
    hasPending = pending; hasRunnable = runnable;
    window.dispatchEvent(new CustomEvent('buio:pending', { detail: { pending } }));
    let banner = document.getElementById('buio-pending-notice');
    if (!banner && pending) {
      banner = document.createElement('div'); banner.id = 'buio-pending-notice'; banner.setAttribute('role', 'status');
      banner.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);max-width:90vw;padding:10px 18px;border-radius:12px;background:#fff7d4;color:#493f17;z-index:99999;font-size:14px;box-shadow:0 2px 12px #0002';
      document.body.append(banner);
    }
    if (banner) {
      const english = document.documentElement.lang.startsWith('en');
      banner.hidden = !pending;
      banner.textContent = blocked ? english ? 'Some saved changes need a retry.' : '部分資料未能同步，請重試。' : english ? 'Saved on this device. Waiting to sync…' : '已保留在此裝置，等待連線後同步…';
      if (blocked) { const button = document.createElement('button'); button.textContent = english ? 'Retry' : '重試'; button.style.marginLeft='12px'; button.onclick=()=>resume(true).catch(schedule); banner.append(button); }
    }
  }
  async function deliver(job, revision) {
    if (revision !== generation) throw Object.assign(Error('The signed-in account changed.'), { status: 401 });
    const send = part => nativeFetch(part.url, { method: part.method, headers: { ...part.headers, 'X-BuiO-Account': job.accountId }, body: unpack(part.body), credentials: 'include', signal: AbortSignal.timeout(20000) });
    let response = await send(job);
    if (revision !== generation) return response;
    if (response.ok && job.followUp) response = await send(job.followUp);
    if (revision !== generation) return response;
    if (response.ok) await transaction('readwrite', store => store.delete(job.id));
    else if (response.status < 500 && ![408, 429].includes(response.status)) {
      // Permanent authorization/validation failures require the current UI to
      // handle them; never replay them in another account or silently overwrite.
      await transaction('readwrite', store => store.put({ ...job, blocked: true, status: response.status }));
    }
    return response;
  }
  function schedule() { clearTimeout(timer); if (hasPending && hasRunnable) timer = setTimeout(() => resume().catch(() => {}), Math.min(60000, 15000 * 2 ** Math.min(failures, 2)) + Math.random() * 1000); }
  function serialize(fn) { const result = running.then(fn); running = result.catch(() => {}); return result; }
  async function resume(force = false) {
    if (document.hidden || !navigator.onLine) { schedule(); return; }
    return serialize(async () => {
      const rows = await transaction('readonly', store => store.getAll());
      notice(rows.length > 0, rows.some(row => row.blocked), rows.some(row => !row.blocked));
      if (!rows.length) return;
      const revision = generation, id = await account();
      const blockedResources = new Set();
      for (const job of rows.sort((a, b) => a.createdAt - b.createdAt)) {
        if (revision !== generation) break;
        if (job.accountId !== id || Date.now() - job.createdAt > 86400000) { await transaction('readwrite', store => store.delete(job.id)); continue; }
        if ((job.blocked && !force) || blockedResources.has(job.resource)) { blockedResources.add(job.resource); continue; }
        const response = await deliver(job, revision);
        if (!response.ok && response.status < 500 && ![408,429].includes(response.status)) blockedResources.add(job.resource);
        if (response.status >= 500 || [408, 429].includes(response.status)) break;
      }
      const remaining = (await transaction('readonly', store => store.getAll())).filter(row => row.accountId === id);
      notice(remaining.length > 0, remaining.some(row => row.blocked), remaining.some(row => !row.blocked));
      failures = 0;
    }).catch(error => { failures++; throw error; }).finally(schedule);
  }
  async function request(url, options = {}) {
    if (!allowed(url) || !['POST', 'PUT', 'PATCH'].includes(options.method || 'GET')) return nativeFetch(url, options);
    const revision = generation;
    const accountId = knownAccount?.id || await account(true);
    if (revision !== generation) throw Error('The signed-in account changed.');
    const headers = Object.fromEntries(new Headers(options.headers).entries());
    headers['idempotency-key'] ||= crypto.randomUUID();
    const job = { id: accountId + ':' + headers['idempotency-key'], accountId, url, method: options.method, headers, body: pack(options.body), createdAt: Date.now(), followUp: options.followUp ? { ...options.followUp, body: pack(options.followUp.body) } : null };
    const fields = url === '/api/chinese/upload' ? Object.fromEntries(options.body.entries()) : url === '/api/homework/records' ? JSON.parse(options.body) : {};
    job.resource = url + (url === '/api/quiz/submit' ? ':' + headers['idempotency-key'] : url === '/api/chinese/upload' ? ':' + [fields.assignmentId,fields.itemId,fields.phase].join(':') : url === '/api/homework/records' ? ':' + [fields.academicYear,fields.className,fields.subject,fields.date].join(':') : '');
    if (job.followUp && !allowed(job.followUp.url)) throw Error('Unsupported follow-up operation');
    return serialize(async () => {
      const rows = await transaction('readonly', store => store.getAll()).catch(() => null);
      if (revision !== generation) throw Error('The signed-in account changed.');
      if (rows === null) return nativeFetch(url, options); // private browsing/storage denial retains the existing online flow
      for (const row of rows) if (Date.now() - row.createdAt > 86400000) await transaction('readwrite', store => store.delete(row.id));
      const retained = rows.filter(row => row.id !== job.id && Date.now() - row.createdAt <= 86400000);
      job.bytes = bodyBytes(job.body) + bodyBytes(job.followUp?.body);
      if (retained.length >= 40 || retained.reduce((sum, row) => sum + (row.bytes ?? bodyBytes(row.body) + bodyBytes(row.followUp?.body)), job.bytes) > 40 * 1024 * 1024) {
        throw Error('待同步資料過多，請恢復連線後再繼續。');
      }
      await transaction('readwrite', store => store.put(job));
      try {
        // Preserve order when an earlier update has not been acknowledged.
        const pending = await transaction('readonly', store => store.getAll());
        for (const older of pending.filter(row => row.id !== job.id && row.accountId === accountId && row.resource === job.resource && row.createdAt <= job.createdAt).sort((a,b) => a.createdAt-b.createdAt)) {
          if (older.blocked) throw Error('Earlier operation needs a retry');
          const prior = await deliver(older, revision);
          if (prior.status >= 500 || [408,429].includes(prior.status)) throw Error('Earlier operation is waiting to sync');
        }
        const response = await deliver(job, revision);
        const remaining = await transaction('readonly', store => store.getAll());
        if (revision === generation) notice(remaining.length > 0, remaining.some(row => row.blocked), remaining.some(row => !row.blocked));
        return response;
      } catch (error) { if (revision === generation) { notice(true); failures++; schedule(); } throw error; }
    });
  }
  async function clear(broadcast = true) {
    knownAccount = null;
    generation++; clearTimeout(timer);
    await transaction('readwrite', store => store.clear()).catch(() => {});
    notice(false); if (broadcast) channel?.postMessage('clear');
  }
  channel?.addEventListener('message', () => clear(false));
  addEventListener('online', () => resume().catch(schedule));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume().catch(schedule); });
  window.BuiReliable = { request, resume, clear, remember };
})();
