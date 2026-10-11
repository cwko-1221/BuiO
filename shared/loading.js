// Small, local loading UI for every BuiO entry point. Only safe reads retry;
// writes continue to use their existing transactions/idempotency/outbox rules.
(function () {
  'use strict';
  if (window.BuiLoading) return;
  const nativeFetch = window.fetch.bind(window);
  const jobs = new Map(), recoveries = new WeakMap(), panels = new Map();
  let sequence = 0, status, showTimer, hideTimer, slowTimer, offlineDone;
  const english = () => (window.BuiI18n?.lang || document.documentElement.lang || '').startsWith('en');
  const say = (zh, en) => english() ? en : zh;
  const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
  const technical = /load.?fail|failed to (?:load|fetch)|could not (?:load|fetch)|unable to load|fetch failed|network.?error|network request|load failed|loading chunk|dynamically imported module|importing a module|connection (?:failed|error)|HTTP\s*5\d\d|載入失敗|讀取失敗|未能(?:載入|讀取|連線)|連線(?:失敗|錯誤)|網絡(?:錯誤|中斷)|網路(?:錯誤|中斷)|連接(?:失敗|錯誤)|server error|internal server|服務.*(?:逾時|連線)|timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|PERMISSION_DENIED|Unexpected token|Unexpected end of|invalid JSON|伺服器回應/i;
  const loadingText = /^(?:載入中|讀取中|正在(?:載入|讀取|準備|連接|重新連線|同步|儲存|等候)|Loading(?:\b|…)|Waiting\b|Preparing\b|Connecting\b|Reconnecting\b|Saving\b)/i;

  function mountStatus() {
    if (status || !document.body) return;
    status = document.createElement('div');
    status.id = 'buio-loading-status'; status.className = 'buio-loading-status'; status.hidden = true;
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const spinner = document.createElement('span'); spinner.className = 'buio-spinner'; spinner.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span'); copy.className = 'buio-loading-copy';
    const title = document.createElement('strong'), detail = document.createElement('small'); copy.append(title, detail);
    const retry = document.createElement('button'); retry.type = 'button'; retry.hidden = true;
    retry.onclick = () => location.reload();
    status.append(spinner, copy, retry); document.body.append(status);
  }
  function renderStatus() {
    mountStatus(); if (!status) return;
    if (!jobs.size) {
      clearTimeout(showTimer); showTimer = null; clearTimeout(slowTimer);
      hideTimer = setTimeout(() => { if (!jobs.size) status.hidden = true; }, 160);
      return;
    }
    clearTimeout(hideTimer);
    const active = [...jobs.values()];
    const age = Date.now() - Math.min(...active.map(job => job.at));
    const writable = active.some(job => job.write);
    status.querySelector('strong').textContent = !navigator.onLine
      ? say('正在等候網絡連線…', 'Waiting for a connection…')
      : active.find(job => job.label)?.label || (writable ? say('正在處理…', 'Working…') : say('正在載入…', 'Loading…'));
    status.querySelector('small').textContent = age >= 10000 ? say('準備需時較長，請稍候。', 'This is taking a little longer. Please wait.') : '';
    const retry = status.querySelector('button'); retry.hidden = writable || age < 30000;
    retry.textContent = say('重新載入', 'Reload');
    if (status.hidden && !showTimer) showTimer = setTimeout(() => { showTimer = null; if (jobs.size) { status.hidden = false; renderStatus(); } }, 450);
    clearTimeout(slowTimer); slowTimer = setTimeout(renderStatus, 2000);
  }
  function begin(label, { write = false } = {}) {
    const id = ++sequence; jobs.set(id, { label, write, at: Date.now() }); renderStatus();
    let finished = false;
    const done = () => { if (finished) return; finished = true; jobs.delete(id); renderStatus(); };
    done.update = next => { const job = jobs.get(id); if (job) { job.label = next; renderStatus(); } };
    return done;
  }
  async function run(task, label, options) {
    const done = begin(label, options);
    try { return await (typeof task === 'function' ? task() : task); } finally { done(); }
  }
  function watchScene(scene) {
    const label = say('正在載入遊戲素材…', 'Loading game assets…');
    const done = begin(label);
    const progress = value => done.update(`${label} ${Math.round(value * 100)}%`);
    const failed = () => recover(new Error('Game asset loading'));
    const finish = () => { done(); scene.load.off('progress', progress); scene.load.off('loaderror', failed); scene.load.off('complete', finish); scene.events.off('create', finish); scene.events.off('shutdown', finish); scene.events.off('destroy', finish); };
    scene.load.on('progress', progress); scene.load.on('loaderror', failed); scene.load.once('complete', finish);
    scene.events.once('create', finish); scene.events.once('shutdown', finish); scene.events.once('destroy', finish);
    return finish;
  }
  function wait(ms, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(signal.reason || new DOMException('Aborted', 'AbortError')); return; }
      const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(signal.reason || new DOMException('Aborted', 'AbortError')); };
      const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
      signal?.addEventListener('abort', abort, { once: true });
    });
  }
  function waitForConnection(signal) {
    if (navigator.onLine) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const clean = () => { clearTimeout(timer); window.removeEventListener('online', online); signal?.removeEventListener('abort', abort); };
      const online = () => { clean(); resolve(); };
      const abort = () => { clean(); reject(signal?.reason || new DOMException('Aborted', 'AbortError')); };
      const timer = setTimeout(() => { clean(); reject(new DOMException('Connection wait timed out', 'TimeoutError')); }, 120000);
      window.addEventListener('online', online, { once: true }); signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
  function trackBody(response, write) {
    // fetch resolves at the response headers. Keep feedback during slow bodies
    // and JSON parsing too, without changing Response/stream semantics.
    for (const method of ['json', 'text', 'blob', 'arrayBuffer', 'formData']) {
      const read = response[method].bind(response);
      try { Object.defineProperty(response, method, { configurable: true, value: (...args) => run(() => read(...args), undefined, { write }) }); } catch { /* a frozen Response retains the normal flow */ }
    }
    return response;
  }
  async function request(input, options = {}) {
    let url;
    try { url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, location.href); } catch { return nativeFetch(input, options); }
    if (url.origin !== location.origin) return nativeFetch(input, options);
    const method = String(options.method || input?.method || 'GET').toUpperCase();
    const read = method === 'GET' || method === 'HEAD';
    const background = /^\/api\/(?:classroom\/sessions|active-(?:whiteboard|buzzer)-sessions|games\/rooms|tower-defense\/classrooms|pet\/(?:access|pvp\/status|brawl\/pvp\/status)|buzzer\/sessions)$/.test(url.pathname);
    const safeRetry = read && /^\/api\//.test(url.pathname) && !options.keepalive && !background;
    const signal = options.signal || input?.signal;
    // Streaming consumers must be able to own their connection lifetime.
    if (new Headers(options.headers || input?.headers).get('Accept')?.includes('text/event-stream')) return nativeFetch(input, options);
    const done = background ? () => {} : begin(undefined, { write: !read });
    try {
      for (let attempt = 0; ; attempt++) {
        if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
        if (safeRetry) await waitForConnection(signal);
        const controller = new AbortController();
        const abort = () => controller.abort(signal?.reason);
        signal?.addEventListener('abort', abort, { once: true });
        const timeout = safeRetry ? setTimeout(() => controller.abort(new DOMException('Read timed out', 'TimeoutError')), 20000) : null;
        let retryDelay;
        try {
          const response = await nativeFetch(input, { ...options, signal: safeRetry ? controller.signal : signal });
          if (!safeRetry || !transientStatuses.has(response.status) || attempt >= 3) return background ? response : trackBody(response, !read);
          const retryAfter = response.headers.get('Retry-After');
          const seconds = Number(retryAfter);
          const indicated = retryAfter ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now()) : 0;
          retryDelay = Math.max(600 * 2 ** attempt, Math.min(12000, Number.isFinite(indicated) ? Math.max(0, indicated) : 0));
          try { await response.body?.cancel(); } catch { /* response already consumed */ }
        } catch (error) {
          if (!safeRetry || signal?.aborted || attempt >= 3) throw error;
          retryDelay = 600 * 2 ** attempt;
        } finally {
          clearTimeout(timeout); signal?.removeEventListener('abort', abort);
        }
        await wait(retryDelay + Math.random() * 200, signal);
      }
    } finally { done(); }
  }
  // Safe API reads have already used their bounded retries. A recovery panel
  // waits for an explicit action instead of continually polling a failed page.
  function recover(error, retry, target, { automatic = false } = {}) {
    const host = typeof target === 'string' ? document.querySelector(target) : target;
    const destination = host || document.body;
    if (!destination) return;
    recoveries.get(destination)?.();
    const panel = document.createElement('div'); panel.className = 'buio-loading-panel' + (host ? '' : ' buio-loading-floating');
    panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
    const spinner = document.createElement('span'); spinner.className = 'buio-spinner'; spinner.setAttribute('aria-hidden', 'true');
    const copy = document.createElement('span'); copy.className = 'buio-loading-copy';
    const title = document.createElement('strong'), detail = document.createElement('small'); copy.append(title, detail);
    title.textContent = say('正在準備內容…', 'Preparing your content…');
    detail.textContent = say('連線較慢，請稍候或再試一次。', 'Please wait, or try again.');
    const button = document.createElement('button'); button.type = 'button'; button.textContent = say('再試一次', 'Try again');
    panel.append(spinner, copy, button);
    if (host) host.replaceChildren(panel); else destination.append(panel);
    let timer, attempts = 0, pending = false, closed = false;
    const close = () => { closed = true; clearTimeout(timer); panels.delete(panel); panel.remove(); if (recoveries.get(destination) === close) recoveries.delete(destination); window.removeEventListener('online', online); };
    const tryAgain = async () => {
      if (pending || closed) return;
      clearTimeout(timer);
      if (!panel.isConnected) { close(); return; }
      if (typeof retry !== 'function') { location.reload(); return; }
      pending = true; button.disabled = true;
      try { await retry(); close(); }
      catch (nextError) { error = nextError; attempts++; schedule(); }
      finally { pending = false; button.disabled = false; }
    };
    const schedule = () => {
      if (!automatic || closed || attempts >= 3 || !navigator.onLine || document.hidden) return;
      const code = Number(error?.status || error?.statusCode || 0);
      if (code && !transientStatuses.has(code)) return;
      timer = setTimeout(tryAgain, Math.min(30000, 2000 * 2 ** attempts));
    };
    const online = () => { if (automatic && typeof retry === 'function') void tryAgain(); };
    const code = Number(error?.status || error?.statusCode || 0);
    if (code === 401 || code === 403) {
      automatic = false;
      title.textContent = say('請重新登入以繼續', 'Please sign in to continue');
      detail.textContent = ''; button.textContent = say('返回登入', 'Sign in'); button.onclick = () => { location.href = '/'; };
    } else button.onclick = tryAgain;
    recoveries.set(destination, close); panels.set(panel, close); window.addEventListener('online', online);
    if (typeof retry === 'function') schedule();
    return close;
  }
  function notify(message) {
    if (!technical.test(String(message || ''))) return false;
    // A write may already have committed. Keep the form and let the existing
    // retry/outbox flow decide what to send; never replay or reload it here.
    const panel = document.createElement('div'); panel.className = 'buio-loading-panel buio-loading-floating';
    panel.setAttribute('role', 'status');
    const spinner = document.createElement('span'); spinner.className = 'buio-spinner'; spinner.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.textContent = say('正在等候連線，請保留此頁再試一次。', 'Waiting for a connection. Keep this page and try again.');
    const close = document.createElement('button'); close.type = 'button'; close.textContent = say('知道了', 'OK'); close.onclick = () => panel.remove();
    document.querySelectorAll('[data-buio-network-notice]').forEach(node => node.remove());
    panel.dataset.buioNetworkNotice = ''; panel.append(spinner, text, close); document.body.append(panel);
    return true;
  }
  function decorate(node) {
    if (!node || node.nodeType !== 1 || node.closest?.('#buio-loading-status,.buio-loading-panel,.boot-screen')) return;
    const errorField = '[class*="error"],[class*="Error"],[class*="warning"],[class*="Warning"],[id$="Error"],[id$="-error"],[role="alert"]';
    const candidates = [node, ...node.querySelectorAll('[class*="loading"],[data-i18n],[data-bui-loading],' + errorField)];
    for (const element of candidates) {
      if (element.childElementCount || element.matches('script,style,input,textarea,option,select')) continue;
      if (element.matches(errorField) && technical.test(element.textContent)) {
        element.textContent = say('正在等候連線，請保留此頁再試一次。', 'Waiting for a connection. Keep this page and try again.');
        element.classList.remove('error'); element.setAttribute('role', 'status'); element.setAttribute('data-bui-waiting', '');
      } else if (!loadingText.test(element.textContent.trim())) element.removeAttribute('data-bui-waiting');
      element.classList.toggle('buio-loading-inline', loadingText.test(element.textContent.trim()) || element.hasAttribute('data-bui-loading'));
    }
  }
  function ready() { bootDone?.(); bootDone = null; }
  window.BuiLoading = { begin, run, watchScene, fetch: request, recover, notify, ready, isTechnical: value => technical.test(String(value?.message || value || '')) };
  window.fetch = request;
  let bootDone = begin(say('正在準備畫面…', 'Preparing the page…'));
  window.addEventListener('load', ready, { once: true });
  window.addEventListener('offline', () => { offlineDone ||= begin(say('正在等候網絡連線…', 'Waiting for a connection…')); });
  window.addEventListener('online', () => { offlineDone?.(); offlineDone = null; });
  window.addEventListener('pagehide', () => { jobs.clear(); renderStatus(); });
  window.addEventListener('error', event => {
    if (event.target?.matches?.('script[src],link[rel="stylesheet"]')) {
      ready(); recover(new Error('Resource loading'), undefined);
    }
  }, true);
  window.addEventListener('unhandledrejection', event => { if (technical.test(String(event.reason?.message || ''))) recover(event.reason); });
  let setupDone = false;
  const setup = () => {
    if (setupDone || !document.body) return;
    setupDone = true;
    mountStatus(); renderStatus(); decorate(document.body);
    new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'characterData') decorate(record.target.parentElement);
        else { decorate(record.target); for (const node of record.addedNodes) decorate(node); }
      }
      for (const [panel, close] of panels) if (!panel.isConnected) close();
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) setup(); else {
    // A deferred module may take a long time to download before DOMContentLoaded.
    // Mount as soon as the parser creates body, while that download continues.
    const bodyObserver = new MutationObserver(() => { if (document.body) { bodyObserver.disconnect(); setup(); } });
    bodyObserver.observe(document.documentElement, { childList: true });
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  }
  const nativeAlert = window.alert.bind(window);
  window.alert = message => { if (!notify(message)) nativeAlert(message); };
})();
