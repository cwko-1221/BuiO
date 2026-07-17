const finite = (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Network state stays independent from Phaser. The scene only renders the
// sampled pose, which makes smoothing deterministic and testable. Never
// extrapolate velocity here: a landing packet must never be rendered below
// the real platform just because an older packet was still falling.
export class RemoteGhostState {
  constructor(snapshot,receivedAt=0) {
    this.x=finite(snapshot.x);
    this.y=finite(snapshot.y);
    this.targetX=this.x;
    this.targetY=this.y;
    this.sequence=-1;
    this.receivedAt=receivedAt;
    this.animation=snapshot.animation||'idle';
    this.push(snapshot,receivedAt);
  }

  push(snapshot,receivedAt) {
    const sequence=finite(snapshot.seq,0);
    if (this.sequence>=0&&sequence>0&&sequence<=this.sequence) return false;
    this.sequence=sequence;
    this.receivedAt=receivedAt;
    this.targetX=finite(snapshot.x,this.x);
    this.targetY=finite(snapshot.y,this.y);
    this.animation=snapshot.animation||this.animation;
    if (Math.hypot(this.targetX-this.x,this.targetY-this.y)>220) {
      // Checkpoint resets and reconnects should appear at the true position
      // immediately, rather than travelling through the course.
      this.x=this.targetX;
      this.y=this.targetY;
    }
    return true;
  }

  sample(_now,deltaMs) {
    // A short exponential approach fills the visual gap between 50 Hz network
    // snapshots on a 60/120 Hz display. It cannot overshoot the latest real
    // coordinate, so ground penetration from prediction is impossible.
    const alpha=1-Math.exp(-Math.max(0,Math.min(Number(deltaMs)||0,50))/12);
    this.x+=(this.targetX-this.x)*alpha;
    this.y+=(this.targetY-this.y)*alpha;
    if (Math.abs(this.targetX-this.x)<.05) this.x=this.targetX;
    if (Math.abs(this.targetY-this.y)<.05) this.y=this.targetY;
    return {x:this.x,y:this.y,targetX:this.targetX,targetY:this.targetY};
  }
}
