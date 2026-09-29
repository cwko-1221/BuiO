// A cached idempotent response describes the original commit, not today's budget.
export function settledCoinPusherRemaining(current: number, response: number): number {
  return Math.max(0, Math.min(current, Number.isFinite(response) ? response : current));
}

export interface SettlementError extends Error {
  status?: number;
  retryAfterMs?: number;
  requestId?: string;
}

// Shared circuit breaker for the durable coin/prize outbox. New catches must not
// bypass an outage's backoff, and a permanent rejection must not loop forever.
export class CoinPusherSettlementRetries {
  private failures = new Map<string, { count: number; nextAt: number }>();
  private notBefore = 0;

  canAttempt(id: string, now = Date.now()) {
    return now >= Math.max(this.notBefore, this.failures.get(id)?.nextAt ?? 0);
  }

  fail(id: string, error: SettlementError, now = Date.now()) {
    const count = (this.failures.get(id)?.count ?? 0) + 1;
    const status = error.status ?? 0;
    const retryable = !status || status === 408 || status === 429 || status >= 500;
    const delay = Math.max(Math.min(60000, 5000 * 2 ** Math.min(count - 1, 4)), error.retryAfterMs ?? 0);
    const nextAt = retryable ? now + delay : Infinity;
    this.failures.set(id, { count, nextAt });
    if (retryable) this.notBefore = Math.max(this.notBefore, nextAt);
    return retryable;
  }

  succeed(id: string) { this.failures.delete(id); }

  nextAttempt(ids: readonly string[], now = Date.now()) {
    return Math.min(...ids.map(id => Math.max(now, this.notBefore, this.failures.get(id)?.nextAt ?? 0)));
  }
}
