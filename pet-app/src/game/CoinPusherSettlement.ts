import { idempotencyKey } from '../types';
import type { StoredCoinPusherPayout } from './CoinPusherSessionStore';

// A counter from an old snapshot or another tab can repeat. Keep each new catch
// globally unique while retries retain the event identity already in the outbox.
export function coinPusherPayoutEventId(playId: string): string {
  return `${playId}:${idempotencyKey()}`;
}

// A cached idempotent response describes the original commit, not today's budget.
export function settledCoinPusherRemaining(current: number, response: number): number {
  return Math.max(0, Math.min(current, Number.isFinite(response) ? response : current));
}

export interface SettlementError extends Error {
  status?: number;
  retryAfterMs?: number;
  requestId?: string;
}

export function rejectCoinPusherPayout(
  pending: StoredCoinPusherPayout[], payout: StoredCoinPusherPayout, error: SettlementError,
) {
  const status = error.status ?? 0;
  // Authentication can be repaired by signing in. Network/rate-limit failures
  // still use backoff. Only persist a rejection which a retry cannot repair.
  if (status < 400 || status >= 500 || [401, 403, 408, 429].includes(status)) return undefined;
  const rejection = { status, reason: error.message, ...(error.requestId ? { requestId: error.requestId } : {}) };
  const exhaustedPlay = status === 409 && error.message === 'Coin-pusher payout limit reached';
  for (const entry of pending) {
    if (entry.eventId === payout.eventId || (exhaustedPlay && entry.playId === payout.playId)) {
      entry.rejection = rejection;
    }
  }
  return { rejection, exhaustedPlay };
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
