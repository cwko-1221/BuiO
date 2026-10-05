'use strict';

class GameQuestionPenalty {
  constructor() {
    this.wrongStreak = 0;
    this.cooldownUntil = 0;
  }

  snapshot(now = Date.now()) {
    if (this.cooldownUntil && now >= this.cooldownUntil) {
      this.cooldownUntil = 0;
      this.wrongStreak = 0;
    }
    return { wrongStreak: this.wrongStreak, cooldownMs: Math.max(0, this.cooldownUntil - now) };
  }

  recordAnswer(correct, now = Date.now()) {
    const state = this.snapshot(now);
    if (state.cooldownMs) return state;
    this.wrongStreak = correct ? 0 : this.wrongStreak + 1;
    if (this.wrongStreak >= 3) this.cooldownUntil = now + 5000;
    return this.snapshot(now);
  }
}

if (typeof module !== 'undefined' && module.exports) module.exports = GameQuestionPenalty;
if (typeof window !== 'undefined') window.BuiGameQuestionPenalty = GameQuestionPenalty;
