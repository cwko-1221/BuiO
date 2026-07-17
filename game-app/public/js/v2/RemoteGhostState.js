const MATTER_VELOCITY_TO_PX_PER_MS = 60 / 1000;

const finite = (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

// Network state stays independent from Phaser. The scene only renders the
// sampled pose, which makes latency compensation deterministic and testable.
export class RemoteGhostState {
  constructor(snapshot,receivedAt=0) {
    this.x=finite(snapshot.x);
    this.y=finite(snapshot.y);
    this.snapshot=null;
    this.sequence=-1;
    this.receivedAt=receivedAt;
    this.push(snapshot,receivedAt);
  }

  push(snapshot,receivedAt) {
    const sequence=finite(snapshot.seq,0);
    if (this.sequence>=0&&sequence>0&&sequence<=this.sequence) return false;
    this.sequence=sequence;
    this.receivedAt=receivedAt;
    this.snapshot={
      x:finite(snapshot.x,this.x),y:finite(snapshot.y,this.y),
      vx:finite(snapshot.vx),vy:finite(snapshot.vy),
      ageMs:clamp(finite(snapshot.ageMs),0,180)
    };
    return true;
  }

  sample(now,deltaMs) {
    if (!this.snapshot) return {x:this.x,y:this.y};
    const sinceReceipt=clamp(now-this.receivedAt,0,140);
    // Half a packet of lead compensates for the next snapshot still being in
    // flight. The cap prevents a dropped packet from sending a ghost away.
    const predictionMs=clamp(this.snapshot.ageMs+sinceReceipt+35,0,180);
    const targetX=this.snapshot.x+this.snapshot.vx*predictionMs*MATTER_VELOCITY_TO_PX_PER_MS;
    const targetY=this.snapshot.y+this.snapshot.vy*predictionMs*MATTER_VELOCITY_TO_PX_PER_MS;
    const error=Math.hypot(targetX-this.x,targetY-this.y);
    if (error>260) {
      // Respawns and checkpoint resets should never glide through the map.
      this.x=targetX; this.y=targetY;
    } else {
      const alpha=1-Math.exp(-clamp(deltaMs,0,50)/48);
      this.x+=(targetX-this.x)*alpha;
      this.y+=(targetY-this.y)*alpha;
    }
    return {x:this.x,y:this.y,targetX,targetY,predictionMs};
  }
}
