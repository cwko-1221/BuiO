// Only replay endpoints whose server operations are idempotent. IndexedDB is
// scoped to the account. Homework snapshots remain available for review after
// their automatic replay window expires; they must not disappear with a draft.
(function () {
  'use strict';
  const allowed = url => /^\/api\/(chinese|english)\/student\/attempts\/[\da-f-]{36}\/items\/[\da-f-]{36}$/.test(url)
    || url === '/api/chinese/upload' || url === '/api/quiz/submit' || url === '/api/homework/records';
  const nativeFetch = window.fetch.bind(window);
  const isHomework = job => job.url === '/api/homework/records';
  const expired = job => Date.now() - job.createdAt > 86400000;
  const permanent = response => !response.ok && response.status < 500 && ![408, 429].includes(response.status);
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
  function notice(pending, blocked = false, runnable = pending, reviewJob = null) {
    hasPending = pending; hasRunnable = runnable;
    window.dispatchEvent(new CustomEvent('buio:pending', { detail: { pending, blocked } }));
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
      if (reviewJob) {
        banner.textContent = english ? 'Homework draft is on this device. Review it and save again.' : '功課草稿已保留在此裝置，請核對或修正後再儲存。';
        const link = document.createElement('a'); link.textContent = english ? 'Open draft' : '打開草稿';
        link.href = '/homework?draft=' + encodeURIComponent(reviewJob.resource); link.style.marginLeft = '12px'; banner.append(link);
      } else if (blocked) { const button = document.createElement('button'); button.textContent = english ? 'Retry' : '重試'; button.style.marginLeft='12px'; button.onclick=()=>resume(true).catch(schedule); banner.append(button); }
    }
  }
  async function refreshNotice() {
    const rows = (await transaction('readonly', store => store.getAll())).filter(row => row.accountId === knownAccount?.id);
    notice(rows.length > 0, rows.some(row => row.blocked), rows.some(row => !row.blocked), rows.find(row => isHomework(row) && row.blocked));
  }
  // Legacy queues could contain a rejected snapshot followed by many corrected
  // copies. Homework is a complete form, so keep its latest intent atomically,
  // requiring review if any of those copies was rejected. Other writes keep FIFO.
  async function homeworkDrafts() {
    const id = knownAccount?.id, revision = generation;
    if (!id) return [];
    await transaction('readwrite', store => {
      const request = store.getAll();
      request.onsuccess = () => {
        if (revision !== generation) return;
        const groups = new Map();
        for (const row of request.result.filter(row => row.accountId === id && isHomework(row))) {
          if (!groups.has(row.resource)) groups.set(row.resource, []);
          groups.get(row.resource).push(row);
        }
        for (const rows of groups.values()) {
          rows.sort((a, b) => a.createdAt - b.createdAt);
          const latest = rows.at(-1), rejected = rows.find(row => row.blocked);
          let needsReview = false;
          try { needsReview = latest.method === 'PUT' && !JSON.parse(latest.body.value).baseVersion; } catch { needsReview = true; }
          // Old clients did not include a base version. A full update from such
          // a queue needs the current record reviewed before it can overwrite.
          if (rejected || expired(latest) || needsReview) {
            latest.blocked = true;
            latest.status ||= rejected?.status;
            latest.errorMessage ||= rejected?.errorMessage || '';
          }
          for (const old of rows.slice(0, -1)) store.delete(old.id);
          store.put(latest);
        }
      };
      return request;
    });
    const rows = await transaction('readonly', store => store.getAll());
    return revision === generation ? rows.filter(row => row.accountId === id && isHomework(row)).sort((a,b) => b.createdAt - a.createdAt) : [];
  }
  async function markBlocked(job, status, errorMessage) {
    await transaction('readwrite', store => {
      const request = store.get(job.id);
      request.onsuccess = () => {
        // A different tab may already have replaced this full snapshot.
        if (request.result) store.put({ ...request.result, blocked: true, status, errorMessage });
      };
      return request;
    });
  }
  async function deliver(job, revision) {
    if (revision !== generation) throw Object.assign(Error('The signed-in account changed.'), { status: 401 });
    const send = part => nativeFetch(part.url, { method: part.method, headers: { ...part.headers, 'X-BuiO-Account': job.accountId }, body: unpack(part.body), credentials: 'include', signal: AbortSignal.timeout(20000) });
    let response = await send(job);
    if (revision !== generation) return response;
    if (response.ok && job.followUp) response = await send(job.followUp);
    if (revision !== generation) return response;
    if (response.ok) {
      let result;
      if (isHomework(job)) {
        result = await response.clone().json();
        if (!result.success || !result.record) throw Error('未能確認功課已儲存，草稿仍保留在此裝置，請再試一次。');
      }
      await transaction('readwrite', store => store.delete(job.id));
      if (result && revision === generation) window.dispatchEvent(new CustomEvent('buio:homework-synced', { detail: { resource: job.resource, body: JSON.parse(job.body.value), result } }));
    } else if (permanent(response)) {
      // Permanent authorization/validation failures require the current UI to
      // handle them; never replay them in another account or silently overwrite.
      const result = await response.clone().json().catch(() => ({}));
      await markBlocked(job, response.status, typeof result.message === 'string' ? result.message.slice(0, 250) : '');
    }
    return response;
  }
  function schedule() { clearTimeout(timer); if (hasPending && hasRunnable) timer = setTimeout(() => resume().catch(() => {}), Math.min(60000, 15000 * 2 ** Math.min(failures, 2)) + Math.random() * 1000); }
  function serialize(fn) { const result = running.then(fn); running = result.catch(() => {}); return result; }
  async function resume(force = false) {
    if (document.hidden || !navigator.onLine) { schedule(); return; }
    return serialize(async () => {
      if (!(await transaction('readonly', store => store.getAll())).length) { notice(false); return; }
      const revision = generation, id = await account();
      await homeworkDrafts();
      const rows = await transaction('readonly', store => store.getAll());
      await refreshNotice();
      const blockedResources = new Set();
      for (const job of rows.sort((a, b) => a.createdAt - b.createdAt)) {
        if (revision !== generation) break;
        if (job.accountId !== id || expired(job)) {
          if (!isHomework(job)) await transaction('readwrite', store => store.delete(job.id));
          continue;
        }
        if ((job.blocked && !force) || blockedResources.has(job.resource)) { blockedResources.add(job.resource); continue; }
        const response = await deliver(job, revision);
        if (permanent(response)) blockedResources.add(job.resource);
        if (response.status >= 500 || [408, 429].includes(response.status)) break;
      }
      await refreshNotice();
      failures = 0;
    }).catch(async error => { failures++; await refreshNotice().catch(() => {}); throw error; }).finally(schedule);
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
      for (const row of rows) if (expired(row) && !isHomework(row)) await transaction('readwrite', store => store.delete(row.id));
      const retained = rows.filter(row => row.id !== job.id && (!expired(row) || isHomework(row)) && !(isHomework(job) && row.accountId === accountId && row.resource === job.resource));
      job.bytes = bodyBytes(job.body) + bodyBytes(job.followUp?.body);
      if (retained.length >= 40 || retained.reduce((sum, row) => sum + (row.bytes ?? bodyBytes(row.body) + bodyBytes(row.followUp?.body)), job.bytes) > 40 * 1024 * 1024) {
        throw Error('待同步資料過多，請恢復連線後再繼續。');
      }
      await transaction('readwrite', store => {
        if (!isHomework(job)) return store.put(job);
        const request = store.getAll();
        request.onsuccess = () => {
          if (revision !== generation) return;
          const older = request.result.filter(row => row.accountId === accountId && row.resource === job.resource);
          const latest = older.sort((a, b) => a.createdAt - b.createdAt).at(-1);
          // Retrying the identical request must keep its receipt key, including
          // when the server committed but its response was lost.
          if (latest?.method === job.method && latest.body.value === job.body.value) {
            job.id = latest.id; job.headers['idempotency-key'] = latest.headers['idempotency-key'];
          }
          job.createdAt = Math.max(job.createdAt, ...older.map(row => row.createdAt + 1));
          for (const row of older) store.delete(row.id);
          store.put(job);
        };
        return request;
      });
      try {
        // Preserve order when an earlier update has not been acknowledged.
        const pending = await transaction('readonly', store => store.getAll());
        for (const older of pending.filter(row => row.id !== job.id && row.accountId === accountId && row.resource === job.resource && row.createdAt <= job.createdAt).sort((a,b) => a.createdAt-b.createdAt)) {
          if (older.blocked) throw Error('較早的資料未能同步，請按下方「重試」處理。');
          const prior = await deliver(older, revision);
          if (permanent(prior)) throw Error('較早的資料未能同步，請按下方「重試」處理。');
          if (prior.status >= 500 || [408,429].includes(prior.status)) throw Error('Earlier operation is waiting to sync');
        }
        const response = await deliver(job, revision);
        if (revision === generation) await refreshNotice();
        return response;
      } catch (error) { if (revision === generation) { await refreshNotice().catch(() => notice(true)); failures++; schedule(); } throw error; }
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
  window.BuiReliable = { request, resume, clear, remember, homeworkDrafts };
})();
