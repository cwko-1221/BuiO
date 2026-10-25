// Small, authoritative cooperative game. There is no client-supplied score.
export const DUET = Object.freeze({ rounds: 8, countdownMs: 2600, roundMs: 2500, cueMs: 1600, windowMs: 600, perfectMs: 180, maxMs: 26000 });
export const SOCIAL_PADS = Object.freeze([
  { id: 0, glyph: '☀', zh: '陽光', en: 'Sun', color: '#dfad4d' },
  { id: 1, glyph: '❧', zh: '樹葉', en: 'Leaf', color: '#699c75' },
  { id: 2, glyph: '◆', zh: '水滴', en: 'Drop', color: '#73a8b2' },
  { id: 3, glyph: '✿', zh: '花朵', en: 'Flower', color: '#c98494' },
]);
export function createDuet(seed, now) {
  let value = seed >>> 0;
  const random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value; };
  const deck = () => { const pads = [0, 1, 2, 3]; for (let i = pads.length - 1; i > 0; i--) { const j = (random() >>> 8) % (i + 1); [pads[i], pads[j]] = [pads[j], pads[i]]; } return pads; };
  const a = [...deck(), ...deck()], b = [...deck(), ...deck()];
  return { startedAt: now + DUET.countdownMs, notes: a.map((pad, i) => [pad, b[i]]), attempts: Array.from({ length: DUET.rounds }, () => [null, null]), resolved: [], score: 0, duets: 0, combo: 0, maxCombo: 0, phase: 'countdown' };
}
export function duetRound(state, now) { return Math.max(0, Math.min(DUET.rounds - 1, Math.floor((now - state.startedAt) / DUET.roundMs))); }
export function duetTarget(state, round) { return state.startedAt + round * DUET.roundMs + DUET.cueMs; }
export function advanceDuet(state, now) {
  for (let round = 0; round < DUET.rounds; round++) {
    if (state.resolved[round] !== undefined || now < duetTarget(state, round) + DUET.windowMs) continue;
    const success = state.attempts[round].every(a => a?.result === 'good' || a?.result === 'perfect');
    state.resolved[round] = success;
    if (success) { state.duets++; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo); state.score += 100 + state.attempts[round].filter(a => a.result === 'perfect').length * 25; }
    else state.combo = 0;
  }
  state.phase = now < state.startedAt ? 'countdown' : state.resolved.length === DUET.rounds && state.resolved.every(v => v !== undefined) ? 'result' : 'playing';
  return state;
}
export function inputDuet(state, role, round, pad, now) {
  advanceDuet(state, now);
  if (![0, 1].includes(role) || !Number.isInteger(round) || !Number.isInteger(pad) || pad < 0 || pad > 3) return { accepted: false, reason: 'invalid' };
  if (state.phase !== 'playing' || round !== duetRound(state, now)) return { accepted: false, reason: 'round' };
  if (state.attempts[round][role]) return { accepted: false, reason: 'already' };
  const offset = now - duetTarget(state, round);
  const result = offset < -DUET.windowMs ? 'early' : offset > DUET.windowMs ? 'late' : pad !== state.notes[round][role] ? 'wrong' : Math.abs(offset) <= DUET.perfectMs ? 'perfect' : 'good';
  state.attempts[round][role] = { pad, result, at: now };
  return { accepted: true, result };
}
export function publicDuet(state, now) {
  advanceDuet(state, now); const round = duetRound(state, now);
  return { kind: 'duet', phase: state.phase, at: now, startedAt: state.startedAt, endsAt: duetTarget(state, DUET.rounds - 1) + DUET.windowMs, round, totalRounds: DUET.rounds, targetAt: duetTarget(state, round), windowMs: DUET.windowMs, pads: state.notes[round], attempts: state.attempts[round].map(a => a?.result || null), score: state.score, duets: state.duets, combo: state.combo, maxCombo: state.maxCombo, history: Array.from({ length: DUET.rounds }, (_, i) => state.resolved[i] ?? null), stars: state.duets >= 7 ? 3 : state.duets >= 5 ? 2 : state.duets >= 1 ? 1 : 0, qualified: state.duets >= 5 };
}
