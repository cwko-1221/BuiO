export const DEFAULT_CRUMBLE_BEHAVIOR = Object.freeze({
  type: 'crumble',
  triggerDelayMs: 140,
  fallDurationMs: 650,
  respawnMs: 4000
});

export class CrumblePlatformState {
  constructor(behavior = DEFAULT_CRUMBLE_BEHAVIOR) {
    this.behavior = { ...DEFAULT_CRUMBLE_BEHAVIOR, ...behavior, type:'crumble' };
    this.phase = 'ready';
    this.triggeredAt = -Infinity;
  }

  trigger(time) {
    if (this.phase !== 'ready') return false;
    this.phase = 'warning';
    this.triggeredAt = time;
    return true;
  }

  update(time) {
    const previous = this.phase;
    const warningEnds = this.triggeredAt + this.behavior.triggerDelayMs;
    const fallEnds = warningEnds + this.behavior.fallDurationMs;
    const hiddenEnds = fallEnds + this.behavior.respawnMs;
    if (this.phase === 'warning' && time >= warningEnds) this.phase = 'falling';
    if (this.phase === 'falling' && time >= fallEnds) this.phase = 'hidden';
    if (this.phase === 'hidden' && time >= hiddenEnds) {
      this.phase = 'ready';
      this.triggeredAt = -Infinity;
    }
    return { phase:this.phase, changed:this.phase !== previous };
  }
}
