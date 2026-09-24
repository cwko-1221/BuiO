import { PUSHER_FORWARD_Z, PUSHER_HOME_Z } from './CoinPusherDimensions';
import type { CoinPusherDropBeat } from './CoinPusherModel';

/**
 * Return a cosmetic cascade label for a short chain of confirmed payout coins.
 * This is presentation feedback; it never changes the number of coins credited.
 */
export const COIN_PUSHER_CASCADE_WINDOW_MS = 2500;
// Long-term cosmetic goals use only server-confirmed payout history; they never grant currency.
export const COIN_PUSHER_STAMP_THRESHOLDS = [5, 25, 100, 300, 1000] as const;

export interface CoinPusherTimingStreakState {
  count: number;
  best: number;
}

/** Count only physical coin landings on the forward stroke; misses break the cosmetic streak. */
export function advanceCoinPusherTimingStreak(
  state: CoinPusherTimingStreakState,
  beats: readonly CoinPusherDropBeat[],
): CoinPusherTimingStreakState {
  let count = Number.isFinite(state.count) ? Math.max(0, Math.floor(state.count)) : 0;
  let best = Number.isFinite(state.best) ? Math.max(count, Math.floor(state.best)) : count;
  for (const beat of beats) {
    if (beat === 'forward') {
      count += 1;
      best = Math.max(best, count);
    } else {
      count = 0;
    }
  }
  return { count, best };
}

export function coinPusherTimingStreakLabel(count: number, locale: string) {
  const streak = Math.floor(count);
  if (!Number.isFinite(streak) || streak < 2) return undefined;
  return locale === 'zh-HK'
    ? `順勢接住 · 連中 ×${streak}！`
    : `NICE TIMING · STREAK ×${streak}`;
}

/** Normalize the visible light sweep to the pusher's real travel, not a wall-clock timer. */
export function coinPusherTravelProgress(pusherZ: number) {
  const travel = PUSHER_FORWARD_Z - PUSHER_HOME_Z;
  if (!Number.isFinite(pusherZ) || travel <= 0) return 0;
  return Math.min(1, Math.max(0, (pusherZ - PUSHER_HOME_Z) / travel));
}

export interface CoinPusherStampProgress {
  total: number;
  unlockedCount: number;
  previousThreshold: number;
  nextThreshold?: number;
  stepProgress: number;
  stepSize?: number;
  percent: number;
}

/** Progress resets at each keepsake tier and uses only confirmed wallet-returned coins. */
export function coinPusherStampProgress(returnedCoins: number): CoinPusherStampProgress {
  const parsedTotal = Number(returnedCoins);
  const total = Number.isFinite(parsedTotal) ? Math.max(0, Math.floor(parsedTotal)) : 0;
  const unlockedCount = COIN_PUSHER_STAMP_THRESHOLDS.filter((threshold) => total >= threshold).length;
  const previousThreshold = unlockedCount > 0 ? COIN_PUSHER_STAMP_THRESHOLDS[unlockedCount - 1] : 0;
  const nextThreshold = COIN_PUSHER_STAMP_THRESHOLDS[unlockedCount];
  const stepSize = nextThreshold === undefined ? undefined : nextThreshold - previousThreshold;
  const stepProgress = stepSize === undefined ? 0 : Math.min(stepSize, Math.max(0, total - previousThreshold));
  const percent = stepSize === undefined ? 100 : Math.floor((stepProgress / stepSize) * 100);
  return { total, unlockedCount, previousThreshold, nextThreshold, stepProgress, stepSize, percent };
}

export interface CoinPusherCascadeState {
  count: number;
  lastAt: number;
}

export function advanceCoinPusherCascade(
  state: CoinPusherCascadeState,
  amount: number,
  now: number,
): CoinPusherCascadeState {
  const confirmedAmount = Math.floor(amount);
  if (!Number.isFinite(confirmedAmount) || confirmedAmount < 1 || !Number.isFinite(now)) return state;
  const continues = state.count > 0
    && now >= state.lastAt
    && now - state.lastAt <= COIN_PUSHER_CASCADE_WINDOW_MS;
  return { count: (continues ? state.count : 0) + confirmedAmount, lastAt: now };
}

export function coinPusherCascadeLabel(amount: number, locale: string) {
  const count = Math.floor(amount);
  if (!Number.isFinite(count) || count < 2) return undefined;
  return locale === 'zh-HK' ? `連環推出 ×${count}` : `CASCADE ×${count}`;
}
