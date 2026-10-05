export class PlayerStateThrottle {
  constructor() {
    this.last = null;
    this.sentAt = -Infinity;
  }

  shouldSend(state, now) {
    const last = this.last;
    const changed = !last || state.animation !== last.animation || state.facing !== last.facing
      || state.checkpoint?.id !== last.checkpointId || Math.abs(state.x - last.x) > 220 || Math.abs(state.y - last.y) > 220;
    const active = !last || Math.abs(state.x - last.x) > .2 || Math.abs(state.y - last.y) > .2 || state.animation !== 'idle';
    if (!changed && now - this.sentAt < (active ? 100 : 250)) return false;
    this.sentAt = now;
    this.last = { x: state.x, y: state.y, animation: state.animation, facing: state.facing, checkpointId: state.checkpoint?.id };
    return true;
  }
}
