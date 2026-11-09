import {PREMIUM_CROSSING_PROFILE} from '../data/worldPremiumPrototype.mjs';
import {PREMIUM_MATERIALS,PREMIUM_BRIDGE_ART as ART,PREMIUM_PROP_SPECS} from '../data/worldPremiumArt.mjs';
import {appendCelTrailMask as appendSharedTrailMask} from './worldCelTerrain.mjs';
import {getWorldMaterialPattern} from './worldMaterial.mjs';
import {paintFieldSurfaces} from './worldFieldArt.mjs';
export const isPremiumCrossingMap=map=>map?.renderProfile===PREMIUM_CROSSING_PROFILE;
const patterns=new WeakMap();
function pattern(c,spec,getImage,fallback){const entry=getImage?.(spec.src);if(!entry?.ready)return fallback;
 let variants=patterns.get(entry.img);if(!variants){variants=new Map();patterns.set(entry.img,variants)}
 if(!variants.has(spec.logicalPeriodWidth)){const p=getWorldMaterialPattern(c,entry.img,spec.logicalPeriodWidth);variants.set(spec.logicalPeriodWidth,p||fallback)}return variants.get(spec.logicalPeriodWidth);}
const polygon=(c,points,ux,uz)=>{c.moveTo(points[0].x*ux,points[0].z*uz);for(const p of points.slice(1))c.lineTo(p.x*ux,p.z*uz);c.closePath()};
// The shoreline is authored in ground units; all detail is a small, deterministic
// displacement around that line. Never fit bank art independently per chunk.
function shorePoints(bank){const out=[];for(let i=0;i<bank.length-1;i++){const a=bank[i],b=bank[i+1],steps=Math.max(2,Math.ceil(Math.hypot((b[0]-a[0])*58,(b[1]-a[1])*48)/18));for(let j=0;j<steps;j++){const t=j/steps,z=a[1]+(b[1]-a[1])*t;out.push({x:a[0]+(b[0]-a[0])*t+Math.sin(t*Math.PI)*(.045*Math.sin(z*3.7)+.024*Math.cos(z*7.1)),z})}}out.push({x:bank.at(-1)[0],z:bank.at(-1)[1]});return out;}
function ribbon(c,a,b,ux,uz){c.beginPath();polygon(c,[...a,...b.toReversed()],ux,uz)}
function paintBank(c,stream,side,ux,uz,getImage){
 const inward=side==='left'?1:-1,edge=shorePoints(stream.banks[side]);
 // Extend the hidden top into the clipped land. A displaced art edge must not
 // leave a hairline of water between the bank and the collision shoreline.
 const top=edge.map(({x,z})=>({x:x-inward*.11,z}));
 // A bank has a land lip, an exposed rock/soil slope, then a submerged toe.
 // The varying projected width resolves actual rock forms instead of squeezing
 // a large material into a uniform upright strip. Left-bank illumination shares
 // the existing upper-left scene light; the opposite face stays cooler.
 const toe=edge.map(({x,z})=>({x:x+inward*(.43+.12*Math.sin(z*.91)+.075*Math.sin(z*2.3)),z:z+.23+.035*Math.cos(z*1.7)}));
 const wet=toe.map(({x,z})=>({x:x+inward*(.10+.035*Math.sin(z*2.1)),z:z+.025}));
 const lip=edge.map(({x,z})=>({x:x+inward*(.085+.035*Math.sin(z*4.9)),z:z+.035}));
 ribbon(c,toe,wet,ux,uz);c.fillStyle='rgba(173,159,113,.075)';c.fill();
 ribbon(c,top,toe,ux,uz);c.fillStyle=pattern(c,PREMIUM_MATERIALS.bank,getImage,'#806849');c.fill();
 c.fillStyle=side==='left'?'rgba(32,49,37,.08)':'rgba(24,48,44,.21)';c.fill();
 // A soft attached wet line belongs to the toe, not a black outline around
 // the water. Two restrained passes retain the painted material underneath.
 for(const [width,alpha]of[[8,.09],[3,.16]]){c.beginPath();toe.forEach((p,i)=>i?c.lineTo(p.x*ux,p.z*uz):c.moveTo(p.x*ux,p.z*uz));c.strokeStyle=`rgba(20,47,42,${alpha})`;c.lineWidth=width;c.stroke()}
 ribbon(c,top,lip,ux,uz);c.fillStyle=pattern(c,PREMIUM_MATERIALS.grass,getImage,'#789450');c.fill();
}
function paintBridgeLanding(c,b,ux,uz,getImage){
 const ends=[[b.outline[0],b.outline[3],b.centerline[0],b.centerline[1]],[b.outline[1],b.outline[2],b.centerline[1],b.centerline[0]]];
 for(const [a,d,here,there]of ends){const vx=(here.x-there.x)*ux,vz=(here.z-there.z)*uz,len=Math.hypot(vx,vz),dx=vx/len,dz=vz/len;
  // Material apron follows the returned source's threshold and tapers into the
  // existing trail. It does not add a painted platform or change walkability.
  const far=[a,d].map(p=>({x:p.x+dx*42/ux,z:p.z+dz*42/uz}));
  for(const [amount,alpha]of[[1,.28],[.72,.38],[.4,.52]]){const taper=far.map((p,i)=>({x:[a,d][i].x+(p.x-[a,d][i].x)*amount,z:[a,d][i].z+(p.z-[a,d][i].z)*amount}));ribbon(c,[a,d],taper,ux,uz);c.fillStyle=pattern(c,PREMIUM_MATERIALS.earth,getImage,'#b29568');c.globalAlpha=alpha;c.fill()}c.globalAlpha=1;
  // Timber's contact shadow stays attached to its real threshold; the ground
  // remains continuous right to the planks rather than ending at a dark gap.
  const contact=[a,d].map(p=>({x:p.x+dx*5/ux,z:p.z+dz*5/uz}));ribbon(c,[a,d],contact,ux,uz);c.fillStyle='rgba(54,44,24,.13)';c.fill();
 }
}
function sourcePlacement(bridge,ux,uz){return{x:bridge.x*ux-ART.origin.x*ART.scale,y:bridge.z*uz-ART.origin.y*ART.scale,w:ART.width*ART.scale,h:ART.height*ART.scale}}
function layer(c,src,b,ux,uz,getImage){const e=getImage?.(src);if(!e?.ready)return;const r=sourcePlacement(b,ux,uz);c.drawImage(e.img,r.x,r.y,r.w,r.h)}
// Moving reflected light is a restrained overlay on the existing painted
// stream, kept away from the bank and the entire bridge/support footprint.
// Coordinates are anchored to the world so neither camera nor chunk movement
// changes the pattern. A reduced-motion preference freezes it in place.
export function paintPremiumWaterMotion(c,{map,time=0,unitX:ux=58,unitZ:uz=48,reducedMotion=false}={}){
 if(!isPremiumCrossingMap(map))return;
 const clock=reducedMotion?0:time,phase=clock*.22;
 const bridgeBands=(map.bridges||[]).map(b=>[Math.min(...b.outline.map(p=>p.z))-1.1,Math.max(...b.outline.map(p=>p.z))+1.1]);
 c.save();c.lineCap='round';
 for(const stream of map.terrainRegions||[]){
  if(stream.material!=='premium_water'||!stream.banks?.left||!stream.banks?.right)continue;
  const left=stream.banks.left,right=stream.banks.right;
  for(let i=0;i<left.length-1;i++){
   const z0=left[i][1],z1=left[i+1][1];
   for(let n=Math.ceil(z0*2);n<z1*2;n++){
    const progress=(phase+(n%3+3)%3*.12)%1,z=n/2+progress*.5;
    if(z>=z1)continue;
    if(bridgeBands.some(([min,max])=>z>min&&z<max))continue;
    const t=(z-z0)/(z1-z0),lx=left[i][0]+(left[i+1][0]-left[i][0])*t,rx=right[i][0]+(right[i+1][0]-right[i][0])*t;
    for(let j=0;j<3;j++){
     const seed=Math.sin(n*12.9898+j*78.233)*43758.5453,unit=seed-Math.floor(seed),x=lx+.7+(rx-lx-1.4)*unit;
     const shimmer=(.55+.45*Math.sin(clock*.8+n*1.91+j*2.3))*Math.sin(Math.PI*progress),w=4+unit*5;
     c.beginPath();c.moveTo(x*ux-w,z*uz);c.quadraticCurveTo(x*ux,(z*uz)-1.5,x*ux+w,z*uz+.2);
     c.lineWidth=.8+unit*.4;c.strokeStyle=`rgba(215,237,207,${.14*shimmer})`;c.stroke();
    }
   }
  }
 }
 c.restore();
}
export function paintPremiumCrossingTerrain(c,{map,chunkX,chunkY,unitX:ux=58,unitZ:uz=48,getImage}){
 if(!isPremiumCrossingMap(map))return false;
 const bounds={minX:chunkX/ux,maxX:(chunkX+512)/ux,minZ:chunkY/uz,maxZ:(chunkY+512)/uz};
 c.save();c.beginPath();c.rect(chunkX,chunkY,512,512);c.clip();
 c.fillStyle=pattern(c,PREMIUM_MATERIALS.grass,getImage,'#789450');c.fillRect(chunkX,chunkY,512,512);
 paintFieldSurfaces(c,{map,chunkX,chunkY,getImage,layer:'under'});
 c.fillStyle=pattern(c,PREMIUM_MATERIALS.earth,getImage,'#b29568');
 // A narrow material transition retains full source detail inside the trail.
 // It is world aligned, so cached chunk joins use identical edge samples.
 for(const [margin,alpha]of[[.1,.22],[.025,.5],[-.055,1]]){c.beginPath();appendSharedTrailMask(c,map,bounds,ux,uz,margin);c.globalAlpha=alpha;c.fill()}c.globalAlpha=1;
 c.beginPath();appendSharedTrailMask(c,map,bounds,ux,uz,-.055);c.fillStyle='rgba(216,193,146,.12)';c.fill();
 paintFieldSurfaces(c,{map,chunkX,chunkY,getImage,layer:'over'});
 for(const stream of map.terrainRegions||[]){
  if(stream.material!=='premium_water')continue;
  // Real painted water and attached bank faces share the collision shoreline.
  c.save();c.beginPath();polygon(c,stream.outline,ux,uz);c.clip();
  c.fillStyle=pattern(c,PREMIUM_MATERIALS.water,getImage,'#376b70');c.fillRect(chunkX,chunkY,512,512);
  c.save();c.beginPath();c.rect(chunkX,chunkY,512,512);for(const b of map.bridges||[])polygon(c,b.outline,ux,uz);c.clip('evenodd');
  for(const side of ['left','right'])paintBank(c,stream,side,ux,uz,getImage);c.restore();
  // Supports below deck level are buried by land and appear only in the river.
  // This removes foundation rectangles over the actual walkable approaches.
  for(const b of map.bridges||[])layer(c,ART.footings,b,ux,uz,getImage);
  c.restore();
 }
 for(const b of map.bridges||[]){paintBridgeLanding(c,b,ux,uz,getImage);layer(c,ART.base,b,ux,uz,getImage)}
 c.restore();return true;
}
// Splitting a diagonal rail into source-X bands gives each portion its true
// ground depth. A single sortY for the whole angled bridge clips actors wrongly.
export function getPremiumCrossingDrawables(map,{getImage,playerPos,bounds,unitX:ux=58,unitZ:uz=48}={}){
 if(!isPremiumCrossingMap(map))return[];const out=[];
 for(const bridge of map.bridges||[]){
  const r=sourcePlacement(bridge,ux,uz);
  if(bounds&&(r.x+r.w<bounds.left||r.x>bounds.right||r.y+r.h<bounds.top||r.y>bounds.bottom))continue;
  for(const side of ['back','front']){
   const edge=side==='back'?ART.backGround:ART.frontGround;
   for(let sx=0;sx<ART.width;sx+=24){const width=Math.min(24,ART.width-sx),middle=sx+width*.5;
    const t=Math.max(0,Math.min(1,(middle-edge[0][0])/(edge[1][0]-edge[0][0]))),sourceY=edge[0][1]+(edge[1][1]-edge[0][1])*t;
    out.push({sortY:bridge.z*uz+(sourceY-ART.origin.y)*ART.scale,draw:c=>{const e=getImage?.(ART[side]);if(!e?.ready)return;c.drawImage(e.img,sx,0,width,ART.height,r.x+sx*ART.scale,r.y,width*ART.scale,r.h)}});
   }
  }
 }
 for(const prop of map.props||[]){const spec=PREMIUM_PROP_SPECS[prop.kind];if(!spec)continue;const scale=prop.scale||1,w=spec.w*scale,h=spec.h*scale,x=prop.x*ux,y=prop.z*uz,left=x-w*spec.anchorX,top=y-h*spec.anchorY;
  if(bounds&&(left+w<bounds.left||left>bounds.right||top+h<bounds.top||top>bounds.bottom))continue;
  out.push({sortY:y,draw:c=>{const e=getImage?.(spec.src);if(!e?.ready)return;c.save();
   const behind=prop.kind==='premium_oak'&&playerPos&&playerPos.z<prop.z&&playerPos.z>prop.z-h/uz*.7&&Math.abs(playerPos.x-prop.x)<w/ux*.4;
   if(behind){const cut=h*.68;c.save();c.beginPath();c.rect(left,top,w,cut);c.clip();c.globalAlpha=.65;c.drawImage(e.img,left,top,w,h);c.restore();c.beginPath();c.rect(left,top+cut,w,h-cut);c.clip()}
   c.drawImage(e.img,left,top,w,h);c.restore();}});
 }
 return out;
}
