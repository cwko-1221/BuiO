const finite = (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

// Network state stays independent from Phaser. The scene only renders the
// sampled pose, which makes smoothing deterministic and testable.
//
// The ghost leads the latest snapshot with a small, bounded amount of dead
// reckoning so remote players read as live instead of trailing the whole
// send-throttle + broadcast-tick + render-frame pipeline (~40ms before any
// real network latency is added). Prediction is asymmetric on purpose:
// horizontal and upward motion may lead, but a falling or grounded snapshot
// is never projected downward, so a landing can never be rendered below the
// real platform.
const STEP_MS = 1000/60;   // Matter velocities are px per 60Hz physics step
const BASE_LEAD_MS = 40;   // hides send throttle + server tick + render frame
const MAX_LEAD_MS = 120;   // on packet loss the ghost holds instead of flying on
const AIRBORNE = new Set(['jump','fall']);

export class RemoteGhostState {
  constructor(snapshot,receivedAt=0) {
    this.x=finite(snapshot.x);
    this.y=finite(snapshot.y);
    this.snapX=this.x;
    this.snapY=this.y;
    this.vx=0;
    this.vy=0;
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
    this.snapX=finite(snapshot.x,this.snapX);
    this.snapY=finite(snapshot.y,this.snapY);
    this.vx=finite(snapshot.vx);
    this.vy=finite(snapshot.vy);
    this.animation=snapshot.animation||this.animation;
    if (Math.hypot(this.snapX-this.x,this.snapY-this.y)>220) {
      // Checkpoint resets and reconnects should appear at the true position
      // immediately, rather than travelling through the course.
      this.x=this.snapX;
      this.y=this.snapY;
    }
    return true;
  }

  sample(now,deltaMs) {
    const lead=Math.min(Math.max(0,finite(now)-this.receivedAt)+BASE_LEAD_MS,MAX_LEAD_MS)/STEP_MS;
    const targetX=this.snapX+this.vx*lead;
    const rising=this.vy<0&&AIRBORNE.has(this.animation);
    const targetY=rising?this.snapY+this.vy*lead:this.snapY;
    // A short exponential approach absorbs both the gaps between 50Hz
    // snapshots and dead-reckoning corrections without visible snapping.
    const alpha=1-Math.exp(-Math.max(0,Math.min(finite(deltaMs),50))/12);
    this.x+=(targetX-this.x)*alpha;
    this.y+=(targetY-this.y)*alpha;
    if (Math.abs(targetX-this.x)<.05) this.x=targetX;
    if (Math.abs(targetY-this.y)<.05) this.y=targetY;
    return {x:this.x,y:this.y,targetX,targetY};
  }
}
