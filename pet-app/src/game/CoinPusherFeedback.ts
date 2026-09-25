import { PUSHER_FORWARD_Z, PUSHER_HOME_Z } from './CoinPusherDimensions';
import type { CoinPusherDropBeat } from './CoinPusherModel';

/**
 * Return a cosmetic cascade label for a short chain of confirmed payout coins.
 * This is presentation feedback; it never changes the number of coins credited.
 */
export const COIN_PUSHER_CASCADE_WINDOW_MS = 2500;
// Long-term cosmetic goals use only server-confirmed payout history; they never grant currency.
export const COIN_PUSHER_STAMP_THRESHOLDS = [5, 25, 100, 300, 1000] as const;

export interface CoinPusherCabinetFinish {
  id: 'classic' | 'bronze' | 'silver' | 'gold' | 'crystal' | 'aurora';
  brass: number;
  paleGold: number;
  glow: number;
  glowEmissive: number;
  homeGlow: number;
  frontGlow: number;
}

/** Purely cosmetic finishes: index 0 is the default; each confirmed stamp unlocks one tier. */
export const COIN_PUSHER_CABINET_FINISHES: readonly CoinPusherCabinetFinish[] = [
  { id: 'classic', brass: 0xd0a45c, paleGold: 0xe6cf96, glow: 0x82cfc7, glowEmissive: 0x1a7168, homeGlow: 0x1a7168, frontGlow: 0xa85b1b },
  { id: 'bronze', brass: 0xc47a59, paleGold: 0xecc08a, glow: 0xefa66b, glowEmissive: 0x814b31, homeGlow: 0x4e6962, frontGlow: 0xbd643b },
  { id: 'silver', brass: 0x9eafc1, paleGold: 0xe5eef4, glow: 0x9bd8e8, glowEmissive: 0x316575, homeGlow: 0x286a75, frontGlow: 0x6287c9 },
  { id: 'gold', brass: 0xdbb246, paleGold: 0xffe3a0, glow: 0xffd365, glowEmissive: 0x98661d, homeGlow: 0x7a7139, frontGlow: 0xd08124 },
  { id: 'crystal', brass: 0x8db8c8, paleGold: 0xd5f3ff, glow: 0x9ce8ed, glowEmissive: 0x367282, homeGlow: 0x306976, frontGlow: 0x7760bc },
  { id: 'aurora', brass: 0x75c6b4, paleGold: 0xcbf3d8, glow: 0x82edd3, glowEmissive: 0x24796d, homeGlow: 0x2b7184, frontGlow: 0x9d68bf },
];

export function coinPusherCabinetFinish(unlockedCount: number) {
  const tier = Number.isFinite(unlockedCount)
    ? Math.max(0, Math.min(COIN_PUSHER_CABINET_FINISHES.length - 1, Math.floor(unlockedCount)))
    : 0;
  return COIN_PUSHER_CABINET_FINISHES[tier];
}

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

export const COIN_PUSHER_REWARD_FLIGHT_STAGGER_MS = 160;
export const COIN_PUSHER_REWARD_FLIGHT_VISIBLE_LIMIT = 5;

/** Space wallet-flight visuals so fast physical catches remain individually readable. */
export function planCoinPusherRewardFlightDelays(amount: number, now: number, nextAvailableAt: number) {
  const count = Number.isFinite(amount)
    ? Math.min(COIN_PUSHER_REWARD_FLIGHT_VISIBLE_LIMIT, Math.max(0, Math.floor(amount)))
    : 0;
  const currentTime = Number.isFinite(now) ? now : 0;
  const firstAvailableAt = Number.isFinite(nextAvailableAt)
    ? Math.max(currentTime, nextAvailableAt)
    : currentTime;
  const delaysMs = Array.from({ length: count }, (_, index) =>
    Math.max(0, Math.round(firstAvailableAt - currentTime + index * COIN_PUSHER_REWARD_FLIGHT_STAGGER_MS)));
  return {
    delaysMs,
    nextAvailableAt: firstAvailableAt + count * COIN_PUSHER_REWARD_FLIGHT_STAGGER_MS,
  };
}

/** Preserve the exact payout count while reducing simultaneous decorative chips to one static total. */
export function coinPusherRewardFlightLabels(amount: number, reducedMotion = false) {
  const total = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  const visibleCount = Math.min(total, reducedMotion ? 1 : COIN_PUSHER_REWARD_FLIGHT_VISIBLE_LIMIT);
  return Array.from({ length: visibleCount }, (_, index) => {
    if (reducedMotion) return `+${total}`;
    if (total > visibleCount && index === visibleCount - 1) return `+${total - visibleCount + 1}`;
    return '+1';
  });
}
