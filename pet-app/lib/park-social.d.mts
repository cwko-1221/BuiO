export type SocialPad = { id: number; glyph: string; zh: string; en: string; color: string };
export type DuetResult = 'early' | 'late' | 'wrong' | 'perfect' | 'good';
export interface DuetState { startedAt: number; notes: number[][]; attempts: ({ pad: number; result: DuetResult; at: number } | null)[][]; resolved: boolean[]; score: number; duets: number; combo: number; maxCombo: number; phase: 'countdown' | 'playing' | 'result' }
export interface DuetFrame { kind: 'duet'; phase: 'countdown' | 'playing' | 'result'; at: number; startedAt: number; endsAt: number; round: number; totalRounds: number; targetAt: number; windowMs: number; pads: number[]; attempts: (DuetResult | null)[]; score: number; duets: number; combo: number; maxCombo: number; history: (boolean | null)[]; stars: number; qualified: boolean }
export const DUET: Readonly<{ rounds: number; countdownMs: number; roundMs: number; cueMs: number; windowMs: number; perfectMs: number; maxMs: number }>;
export const SOCIAL_PADS: readonly SocialPad[];
export function createDuet(seed: number, now: number): DuetState;
export function duetRound(state: DuetState, now: number): number;
export function duetTarget(state: DuetState, round: number): number;
export function advanceDuet(state: DuetState, now: number): DuetState;
export function inputDuet(state: DuetState, role: number, round: number, pad: number, now: number): { accepted: boolean; result?: DuetResult; reason?: string };
export function publicDuet(state: DuetState, now: number): DuetFrame;
