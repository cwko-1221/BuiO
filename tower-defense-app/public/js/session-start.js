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
    catch (cause) { throw Object.assign(new Error('Invalid response', { cause }), { code: 'BAD_RESPONSE', status: response.status }); }
    if (!data || typeof data !== 'object') throw Object.assign(new Error('Invalid response'), { code: 'BAD_RESPONSE', status: response.status });
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

export async function startQuestionSession(api, body, signal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try { return await api('/session', { method: 'POST', body, signal }); }
    catch (error) {
      if (signal.aborted || attempt || !(error.retryable || error instanceof TypeError) || error.retryAfterMs > 5000) throw error;
      const delay = Math.max(error.retryAfterMs || 0, 600 + Math.random() * 400);
      await new Promise((resolve, reject) => {
        const cancel = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, delay);
        signal.addEventListener('abort', cancel, { once: true });
      });
    }
  }
}
