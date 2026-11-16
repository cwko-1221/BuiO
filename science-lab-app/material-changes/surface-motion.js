// A damped surface response for rendering only. It never changes temperature,
// phase, quantities or the student's scientific observations.
export class SurfaceMotion {
  constructor() { this.x=0; this.z=0; this.vx=0; this.vz=0; this.radial=0;this.radialVelocity=0;this.lastX=0;this.lastZ=0;this.lastY=0; }
  impulse(x=.85,z=.4) { this.vx+=x; this.vz+=z; }
  liftImpulse() { this.radialVelocity+=.16; }
  step(dt, velocityX, velocityZ, fluid, viscous=false, reduced=false, velocityY=0) {
    if (!dt) return;
    if (fluid<.001 || reduced) { this.x=this.z=this.vx=this.vz=this.radial=this.radialVelocity=0; this.lastX=velocityX;this.lastZ=velocityZ;this.lastY=velocityY;return; }
    const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
    const ax=clamp((velocityX-this.lastX)/dt,-22,22), az=clamp((velocityZ-this.lastZ)/dt,-22,22);
    const ay=clamp((velocityY-this.lastY)/dt,-16,16);
    this.lastX=velocityX; this.lastZ=velocityZ;this.lastY=velocityY;
    const spring=viscous?23:42, damping=viscous?3.8:2.1;
    for(let remaining=dt;remaining>0;remaining-=1/120) {
      const step=Math.min(1/120,remaining);
      this.vx+=(-spring*this.x-damping*this.vx-ax*.19)*step;
      this.vz+=(-spring*this.z-damping*this.vz-az*.19)*step;
      this.x=clamp(this.x+this.vx*step,-.26,.26); this.z=clamp(this.z+this.vz*step,-.26,.26);
      this.radialVelocity+=(-60*this.radial-(viscous?5:2.8)*this.radialVelocity-ay*.045)*step;
      this.radial=clamp(this.radial+this.radialVelocity*step,-.055,.055);
    }
  }
  height(x,z,time) {
    // Two travelling modes ride on the inertial tilt. Unlike a rotated disc,
    // the centre and edges bend independently and continue after release.
    const strength=Math.min(.06,Math.sqrt(this.energy)*.25);
    const wave=strength*(Math.sin(x*8-time*7)*Math.cos(z*5-time*2)*.65+Math.sin(z*9+time*5)*.35);
    const radialWave=this.radial*(1-2*(x*x+z*z)/(.625*.625));
    return Math.max(-.105,Math.min(.105,this.x*x+this.z*z+wave+radialWave));
  }
  get energy() { return this.x*this.x+this.z*this.z+this.radial*this.radial+(this.vx*this.vx+this.vz*this.vz+this.radialVelocity*this.radialVelocity)*.02; }
}

// A radial grid across the WHOLE liquid surface, not a cylinder cap fan with
// only one centre vertex. Duplicate side vertices keep a clean meniscus edge.
export function liquidMeshData(radius, bottomRadius, depth, segments=64, rings=18) {
  const positions=[0,depth/2,0], indices=[];
  for(let r=1;r<=rings;r++) for(let i=0;i<segments;i++) {
    const angle=i/segments*Math.PI*2, distance=radius*r/rings;
    positions.push(Math.cos(angle)*distance,depth/2,Math.sin(angle)*distance);
  }
  for(let i=0;i<segments;i++) indices.push(0,1+(i+1)%segments,1+i);
  for(let r=1;r<rings;r++) for(let i=0;i<segments;i++) {
    const a=1+(r-1)*segments+i,b=1+(r-1)*segments+(i+1)%segments,c=a+segments,d=b+segments;
    indices.push(a,b,c,b,d,c);
  }
  const side=positions.length/3;
  for(let i=0;i<=segments;i++) {
    const a=i/segments*Math.PI*2;
    positions.push(Math.cos(a)*radius,depth/2,Math.sin(a)*radius,Math.cos(a)*bottomRadius,-depth/2,Math.sin(a)*bottomRadius);
  }
  for(let i=0;i<segments;i++) {const a=side+i*2;indices.push(a,a+2,a+1,a+2,a+3,a+1);}
  return {positions,indices,topCount:1+segments*rings};
}

export function deformSurface(geometry, original, depth, motion, time, fluid) {
  const position=geometry.getAttribute('position'); let low=Infinity, high=-Infinity;
  // Area-weighted mean removes net height drift, so waves redistribute the
  // liquid instead of apparently creating or losing material.
  let sum=0,weight=0;
  for(let i=0;i<(geometry.userData.topCount??position.count);i++) {
    if(original[i*3+1]<depth/2-.0001)continue;
    const x=original[i*3],z=original[i*3+2],w=Math.max(.001,Math.hypot(x,z));
    sum+=motion.height(x,z,time)*w;weight+=w;
  }
  const mean=weight?sum/weight:0;
  for(let i=0;i<position.count;i++) {
    const x=original[i*3], y=original[i*3+1], z=original[i*3+2];
    const topWeight=Math.max(0,Math.min(1,y/depth+.5));
    const next=y+(motion.height(x,z,time)-mean)*topWeight*fluid;
    position.setY(i,next); if(topWeight>.99){low=Math.min(low,next);high=Math.max(high,next);}
  }
  position.needsUpdate=true; geometry.computeVertexNormals();
  return Number.isFinite(high-low)?high-low:0;
}
