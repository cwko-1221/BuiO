// Bound the whole response, including its body. Only session creation below
// retries a POST, using the same server-side idempotent key on both attempts.
export async function requestJson(url, options = {}, { timeoutMs = 10000, fetcher = fetch } = {}) {
  const { signal, ...request } = options;
  if (signal?.aborted) throw signal.reason;
  const controller = new AbortController();
  let timer, cancel;
  const boundary = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error('Request timed out'), { code: 'REQUEST_TIMEOUT', retryable: true }));
      controller.abort();
    }, timeoutMs);
    cancel = () => { controller.abort(); reject(signal.reason || new DOMException('Cancelled', 'AbortError')); };
    signal?.addEventListener('abort', cancel, { once: true });
  });
  const work = (async () => {
    const response = await fetcher(url, { ...request, signal: controller.signal });
    let data;
    try { data = await response.json(); }
    catch (cause) { throw Object.assign(new Error('Invalid response', { cause }), { code: 'BAD_RESPONSE', status: response.status, retryable: response.ok || response.status >= 500 }); }
    if (!data || typeof data !== 'object') throw Object.assign(new Error('Invalid response'), { code: 'BAD_RESPONSE', status: response.status, retryable: response.ok || response.status >= 500 });
    if (!response.ok || data.success === false) {
      const after = response.headers.get('Retry-After');
      const retryAfterMs = after ? (/^\d+$/.test(after) ? Number(after) * 1000 : Math.max(0, Date.parse(after) - Date.now())) : 0;
      throw Object.assign(new Error(data.message || 'Request failed'), { status: response.status, retryAfterMs,
        retryable: [408, 425, 429, 500, 502, 503, 504].includes(response.status) });
    }
    return data;
  })();
  try { return await Promise.race([work, boundary]); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}

export function socketRequest(socket, event, body, signal, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason || new DOMException('Cancelled', 'AbortError'));
    if (!socket?.connected) return reject(Object.assign(new Error('Socket unavailable'), { retryable: true }));
    let settled = false;
    const finish = (error, data) => {
      if (settled) return; settled = true;
      signal?.removeEventListener('abort', cancel);
      if (error) reject(error); else resolve(data);
    };
    const cancel = () => finish(signal.reason || new DOMException('Cancelled', 'AbortError'));
    signal?.addEventListener('abort', cancel, { once: true });
    socket.timeout(timeoutMs).emit(event, body, (error, data) => {
      if (error) return finish(Object.assign(new Error('Socket request timed out'), { retryable: true }));
      if (!data?.success) return finish(Object.assign(new Error(data?.message || 'Request failed'), {
        status: data?.status || 500, retryable: [408, 425, 429, 500, 502, 503, 504].includes(data?.status || 500),
      }));
      finish(null, data);
    });
  });
}

export async function startQuestionSession(api, body, signal, { fallback, diagnostic = () => {}, preferSocket = false } = {}) {
  // Classroom control already uses this connection, as does Don't Look Down.
  // Avoid opening a separate HTTP request on the normal preparation path.
  if (preferSocket && fallback) {
    diagnostic('socket-start');
    try { const data = await fallback(body, signal); diagnostic('socket-ok'); return data; }
    catch (error) {
      diagnostic('socket-failed', { status: error.status || 0 });
      if (signal.aborted || (error.status && !error.retryable)) throw error;
    }
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const started = performance.now();
    diagnostic('http-start');
    try {
      const data = await api('/session', { method: 'POST', body, signal, timeoutMs: fallback ? 3000 : 10000 });
      diagnostic('http-ok', { durationMs: Math.round(performance.now() - started) });
      return data;
    }
    catch (error) {
      diagnostic('http-failed', { status: error.status || 0, durationMs: Math.round(performance.now() - started) });
      if (signal.aborted || !(error.retryable || error instanceof TypeError) || error.retryAfterMs > 5000) throw error;
      if (fallback) {
        diagnostic('socket-start');
        try { const data = await fallback(body, signal); diagnostic('socket-ok'); return data; }
        catch (next) {
          diagnostic('socket-failed', { status: next.status || 0 });
          if (signal.aborted || (next.status && !next.retryable)) throw next;
        }
      }
      if (attempt) throw error;
      const delay = Math.max(error.retryAfterMs || 0, 600 + Math.random() * 400);
      await new Promise((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, delay);
        signal.addEventListener('abort', cancel, { once: true });
      });
    }
  }
}
