// The caller keeps the same run, log and idempotency key on every attempt.
// Only an uncertain/transient response retries; a rejected log never does.
export async function retrySettlement(send, { attempts = 6, maxElapsedMs = 120000,
  now = Date.now, wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const start = now();
  for (let attempt = 0; ; attempt++) {
    try { return await send(); }
    catch (error) {
      const status = Number(error?.status || 0);
      const transient = status ? [408,425,429,500,502,503,504].includes(status)
        : ['AbortError','TimeoutError','TypeError'].includes(error?.name);
      const delay = Math.max(Math.min(5000, 600 * 2 ** attempt), error?.retryAfterMs || 0);
      if (!transient || attempt + 1 >= attempts || now() - start + delay >= maxElapsedMs) throw error;
      await wait(delay);
    }
  }
}
