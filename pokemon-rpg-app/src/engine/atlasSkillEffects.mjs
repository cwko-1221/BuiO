const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// Charge moves carry the caster to the contact, then return it to its stage
// anchor. The wreath shares this path; it is not an unrelated projectile.
export function getChargePresentation({elapsed,art,sourceX,sourceY,targetX,targetY,sourceSize,targetSize,sourceGeometry,targetGeometry}) {
  const direction=targetX>=sourceX?1:-1;
  const gap=Math.max(28,(sourceSize+targetSize)*.22);
  const arrivalX=targetX-direction*gap;
  const travel=clamp(elapsed/art.impact,0,1);
  const recoverAt=art.impact+1/art.fps;
  const recovery=clamp((elapsed-recoverAt)/Math.max(.01,art.duration-recoverAt),0,1);
  const smooth=recovery*recovery*(3-2*recovery);
  const weight=elapsed<=recoverAt?travel:1-smooth;
  const burst=clamp((elapsed-art.impact)*art.fps,0,1);
  const fit=art.fitCaster&&sourceGeometry&&art.wrapCoverage;
  const sourceFoot=fit?(sourceGeometry.bottom-.9)*sourceSize:0;
  const targetFoot=fit&&targetGeometry?(targetGeometry.bottom-.9)*targetSize:0;
  const radius=fit?Math.max(.5-sourceGeometry.left,sourceGeometry.right-.5):0;
  const minimumSize=fit?sourceSize*Math.max(radius*2/art.wrapCoverage.width,
    (sourceGeometry.bottom-sourceGeometry.top)/art.wrapCoverage.height)*1.06:0;
  // Keep one cast size while wrapping the creature, then ease the broken
  // fragments toward their ordinary scale instead of snapping at release.
  const release=clamp((elapsed-art.impact)/Math.max(.01,art.duration-art.impact),0,1);
  const wrapWeight=1-release*release*(3-2*release);
  return {actorX:sourceX+(arrivalX-sourceX)*weight,actorY:sourceY+(targetY-sourceY)*weight,
    effectX:elapsed<art.impact?sourceX+(arrivalX-sourceX)*travel:arrivalX+(targetX-arrivalX)*burst,
    effectY:elapsed<art.impact?sourceY+(targetY-sourceY)*travel+sourceFoot:targetY+sourceFoot+(targetFoot-sourceFoot)*burst,
    minimumSize,wrapWeight};
}

// Authored impact frames combine with delivery appropriate to the actual move:
// pressure streams, a chain of bubbles, or a rolling ground-level wave.
export function drawAtlasSkillEffect(ctx,{fx,art,image,sx,sy,tx,ty,viewW,viewH}) {
  const age=fx.elapsed,wind=art.anticipation || 0;
  const size=clamp(Math.min(viewW,viewH)*.27,125,240)*(art.sizeScale || 1);
  const drawFrame=(frame,x,y,drawSize,alpha=1,flip=false)=>{
    frame=clamp(frame,0,art.frames-1);
    ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);if(flip)ctx.scale(-1,1);
    ctx.drawImage(image,frame%art.columns*art.cellSize,Math.floor(frame/art.columns)*art.cellSize,
      art.cellSize,art.cellSize,-drawSize*art.anchor[0],-drawSize*art.anchor[1],drawSize,drawSize);
    ctx.restore();
  };
  if(art.delivery==='wheel'||art.delivery==='charge') {
    const travel=clamp(age/art.impact,0,1);
    const point=fx.deliveryPosition;
    const chargeSize=size+Math.max(0,(point?.minimumSize||0)-size)*(point?.wrapWeight??1);
    drawFrame(Math.floor(age*art.fps),point?.effectX ?? sx+(tx-sx)*travel,
      point?.effectY ?? sy+70+(ty+65-sy-70)*travel,chargeSize,1,tx<sx);
    return;
  }
  if(art.delivery==='strike') {
    drawFrame(Math.floor(age*art.fps),tx,ty+(art.targetOffsetY || 0),size);
    return;
  }
  if(art.delivery==='wave') {
    const travel=clamp(age/art.impact,0,1);
    drawFrame(Math.floor(age*art.fps),sx+(tx-sx)*travel,sy+65+(ty-sy)*travel,size,1,tx<sx);
    return;
  }
  if(art.delivery==='beam') {
    const travel=clamp(age/Math.max(.01,wind),0,1);
    const endX=sx+(tx-sx)*travel,endY=sy+(ty-sy)*travel;
    const strength=age<wind?1:clamp((wind+.25-age)/.25,0,1);
    if(strength>.01) {
      const width=art.beamWidth*clamp(Math.min(viewW,viewH)/700,.65,1.2);
      const dx=endX-sx,dy=endY-sy,length=Math.hypot(dx,dy) || 1,nx=-dy/length,ny=dx/length;
      ctx.save();ctx.globalAlpha=strength;ctx.lineCap='round';ctx.lineJoin='round';
      ctx.beginPath();
      for(let i=0;i<=24;i++) {
        const p=i/24;
        const ripple=Math.sin(p*Math.PI)*Math.sin(p*21-age*38)*width*.12;
        const x=sx+dx*p+nx*ripple,y=sy+dy*p+ny*ripple;
        i?ctx.lineTo(x,y):ctx.moveTo(x,y);
      }
      const water=ctx.createLinearGradient(sx,sy,endX,endY);
      water.addColorStop(0,'#42b5d3');water.addColorStop(.45,'#b0eff7');water.addColorStop(1,'#eefeff');
      ctx.strokeStyle='#369cc196';ctx.lineWidth=width*1.45;ctx.stroke();
      ctx.strokeStyle=water;ctx.lineWidth=width;ctx.stroke();
      ctx.strokeStyle='#e6ffffd9';ctx.lineWidth=width*.25;ctx.stroke();
      ctx.restore();
      if(age<wind)drawFrame(0,sx,sy,90,.8);
    }
  } else if(art.delivery==='bubbles' && age<wind) {
    for(let i=0;i<4;i++) {
      const delay=i*.035,p=clamp((age-delay)/Math.max(.01,wind-delay),0,1);
      if(age<delay || p>=1)continue;
      const x=sx+(tx-sx)*p,y=sy+(ty-sy)*p-Math.sin(p*Math.PI)*(13+(i%2)*12);
      drawFrame(0,x,y,125+(i%2)*30,.9);
    }
  }
  if(age>=wind)drawFrame(Math.floor((age-wind)*art.fps),tx,ty+(art.targetOffsetY || 0),size);
}
