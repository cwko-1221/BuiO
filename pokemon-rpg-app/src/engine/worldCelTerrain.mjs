import { CEL_FOREST_PROFILE,CEL_FOREST_PALETTE } from '../data/worldCelPrototype.mjs';
import { CEL_FOREST_PROP_SPECS } from '../data/worldCelArt.mjs';
import { CEL_FOREST_MATERIALS,CEL_FOREST_BRIDGE_ART } from '../data/worldCelMaterials.mjs';

export const isCelForestMap=map=>map?.renderProfile===CEL_FOREST_PROFILE;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function segmentDistance(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);}
export function celTrailDistance(map,x,z){
  let distance=Infinity;
  for(const road of map.roads)for(let i=1;i<road.points.length;i++)distance=Math.min(distance,segmentDistance(x,z,road.points[i-1],road.points[i])-road.width*.5);
  // Small coherent edge variation, under8 logical pixels. No blur or noise.
  return distance+.055*Math.sin(x*4.2+z*1.8)+.035*Math.sin(z*6.1-x*1.7);
}
function polygon(c,points,ux,uz){c.moveTo(points[0].x*ux,points[0].z*uz);for(const p of points.slice(1))c.lineTo(p.x*ux,p.z*uz);c.closePath();}
function bankRibbon(c,bank,side,ux,uz,{face=false}={}){
  const inner=[],outer=[];
  for(let i=1;i<bank.length;i++){
    const a=bank[i-1],b=bank[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),steps=Math.ceil(len/.2),sign=side==='left'?1:-1;
    const nx=-dz/len*sign,nz=dx/len*sign;
    for(let k=i===1?0:1;k<=steps;k++){
      const t=k/steps,x=a[0]+dx*t,z=a[1]+dz*t;
      // Subtle soil breaks are exterior to the unchanged collision shoreline.
      const width=face?-.025-.012*Math.sin(z*6.3+x*2.1):.105+.035*Math.sin(z*5.7+x*2.3)+.02*Math.sin(z*11.1);
      inner.push({x,z});outer.push({x:x+nx*width,z:z+nz*width});
    }
  }
  polygon(c,[...inner,...outer.reverse()],ux,uz);
}
const materialCache=new WeakMap();
function materialPattern(c,spec,getImage,fallback,tint=null){
  const entry=getImage?.(spec.src);if(!entry?.ready)return fallback;
  let variants=materialCache.get(entry.img);if(!variants){variants=new Map();materialCache.set(entry.img,variants);}
  const key=`${spec.logicalPeriodWidth}:${tint||'original'}`;
  if(!variants.has(key)){
    let surface=entry.img;
    if(tint){
      surface=document.createElement('canvas');surface.width=entry.img.naturalWidth;surface.height=entry.img.naturalHeight;
      const s=surface.getContext('2d');s.drawImage(entry.img,0,0);s.globalCompositeOperation='color';s.fillStyle=tint;s.fillRect(0,0,surface.width,surface.height);
      // Water inherits only the material's painted value shapes, not soil hue.
      s.globalCompositeOperation='multiply';s.fillStyle='#c0c8cc';s.fillRect(0,0,surface.width,surface.height);
    }
    const pattern=c.createPattern(surface,'repeat');pattern?.setTransform(new DOMMatrix().scale(spec.logicalPeriodWidth/entry.img.naturalWidth));variants.set(key,pattern||fallback);
  }
  return variants.get(key);
}

// A world-aligned marching-square material mask. All cells sample the same
// corner values and interpolate the same shared edges, including chunk seams.
// Subpaths are filled together to prevent anti-aliased interior grid lines.
export function appendCelTrailMask(c,map,{minX,maxX,minZ,maxZ},ux=58,uz=48,margin=0){
  const step=.25;
  for(let row=Math.floor(minZ/step)-1;row<=Math.ceil(maxZ/step)+1;row++)for(let col=Math.floor(minX/step)-1;col<=Math.ceil(maxX/step)+1;col++){
    const x=col*step,z=row*step,ps=[{x,z},{x:x+step,z},{x:x+step,z:z+step},{x,z:z+step}],vs=ps.map(p=>celTrailDistance(map,p.x,p.z)-margin);
    const bits=vs.reduce((n,v,i)=>n|(v<=0?1<<i:0),0);if(!bits)continue;
    if(bits===15){polygon(c,ps,ux,uz);continue;}
    const edges=ps.map((a,i)=>{const b=ps[(i+1)%4],va=vs[i],vb=vs[(i+1)%4],t=va/(va-vb||1);return{x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};});
    if((bits===5||bits===10)&&celTrailDistance(map,x+step/2,z+step/2)>margin){
      for(let i=0;i<4;i++)if(vs[i]<=0)polygon(c,[ps[i],edges[i],edges[(i+3)%4]],ux,uz);
      continue;
    }
    const points=[];for(let i=0;i<4;i++){if(vs[i]<=0)points.push(ps[i]);if((vs[i]<=0)!==(vs[(i+1)%4]<=0))points.push(edges[i]);}
    if(points.length>=3)polygon(c,points,ux,uz);
  }
}

function paintBridgeDeck(c,b,p,ux,uz,getImage){
  const x=b.minX*ux,y=b.minZ*uz,w=(b.maxX-b.minX)*ux,h=(b.maxZ-b.minZ)*uz;
  const art=CEL_FOREST_BRIDGE_ART.deck,entry=getImage?.(art.src);
  if(entry?.ready){
    const sx=w/art.width,sy=h/art.height;
    c.drawImage(entry.img,x-art.left*sx,y-art.top*sy,art.sourceWidth*sx,art.sourceHeight*sy);
    return;
  }
  // Loading-only fallback: registered painted layers replace this once ready.
  c.fillStyle=p.woodShade;c.fillRect(x,y+4,w,h+2);
  c.fillStyle=p.wood;c.fillRect(x,y,w,h);
  const count=13,board=w/count;
  for(let i=0;i<count;i++){
    c.fillStyle=i%4===1?p.woodLight:p.wood;c.fillRect(x+i*board+1,y+1,board-1,h-2);
    c.strokeStyle=p.woodShade;c.lineWidth=1;c.beginPath();c.moveTo(x+(i+1)*board,y);c.lineTo(x+(i+1)*board,y+h);c.stroke();
    if(i%3===0){c.strokeStyle='#a28155';c.beginPath();c.moveTo(x+(i+.3)*board,y+h*.25);c.lineTo(x+(i+.38)*board,y+h*.48);c.stroke();}
  }
  c.strokeStyle=p.outline;c.lineWidth=1.5;c.strokeRect(x,y,w,h);
  // Shared material apron meets both ends without a pasted ground rectangle.
  c.fillStyle=p.dirt;c.fillRect(x-7,y+3,7,h-6);c.fillRect(x+w,y+3,7,h-6);
}

export function paintCelForestTerrain(c,{map,chunkX,chunkY,unitX:ux=58,unitZ:uz=48,getImage}){
  if(!isCelForestMap(map))return false;
  const p=map.palette||CEL_FOREST_PALETTE,b={minX:chunkX/ux,maxX:(chunkX+512)/ux,minZ:chunkY/uz,maxZ:(chunkY+512)/uz};
  c.save();c.beginPath();c.rect(chunkX,chunkY,512,512);c.clip();
  const grass=materialPattern(c,CEL_FOREST_MATERIALS.grass,getImage,p.grass),dirt=materialPattern(c,CEL_FOREST_MATERIALS.dirt,getImage,p.dirt);
  c.fillStyle=grass;c.fillRect(chunkX,chunkY,512,512);
  // The shared mask stays identical; its content is now native-density paint.
  // No giant polygon masses or isolated hexagonal "worn" marks remain.
  c.beginPath();appendCelTrailMask(c,map,b,ux,uz);c.fillStyle=dirt;c.fill();
  for(const region of map.terrainRegions||[]){
    if(region.material!=='terrain_cel_stream')continue;
    // A narrow painted earth rim is attached to the SAME shore as collision.
    for(const side of['left','right']){c.beginPath();bankRibbon(c,region.banks[side],side,ux,uz);c.fillStyle=dirt;c.fill();}
    c.save();c.beginPath();polygon(c,region.outline,ux,uz);c.clip();
    c.fillStyle=materialPattern(c,CEL_FOREST_MATERIALS.dirt,getImage,p.water,p.water);c.fillRect(chunkX,chunkY,512,512);
    c.beginPath();polygon(c,region.outline,ux,uz);c.strokeStyle=materialPattern(c,CEL_FOREST_MATERIALS.grass,getImage,p.waterLight,p.waterLight);c.lineWidth=24;c.globalAlpha=.4;c.stroke();c.globalAlpha=1;
    // This short shaded soil face places water below the grass plane. It is
    // not a blurred halo, shifted coastline or independent background painting.
    for(const side of['left','right']){c.beginPath();bankRibbon(c,region.banks[side],side,ux,uz,{face:true});c.fillStyle=materialPattern(c,CEL_FOREST_MATERIALS.dirt,getImage,p.bankShade,'#999068');c.fill();}
    c.restore();
  }
  for(const bridge of map.bridges||[])paintBridgeDeck(c,bridge,p,ux,uz,getImage);
  // Existing painted roots meet the same grass material directly. Opaque
  // ellipse/polygon pads underneath them exposed the cutout and are removed.
  c.restore();return true;
}

function bridgeRail(c,b,z,p,ux,uz,getImage,id){
  const x1=b.minX*ux,x2=b.maxX*ux,y=z*uz,postH=39;
  const art=CEL_FOREST_BRIDGE_ART[id],entry=getImage?.(art.src);
  if(entry?.ready){const scale=(x2-x1)/(art.right-art.left);c.drawImage(entry.img,x1-art.left*scale,y-art.footY*scale,art.sourceWidth*scale,art.sourceHeight*scale);return;}
  c.lineJoin='round';c.lineCap='round';
  c.strokeStyle=p.outline;c.lineWidth=10;c.beginPath();c.moveTo(x1,y-postH+10);c.lineTo(x2,y-postH+10);c.stroke();
  c.strokeStyle=p.wood;c.lineWidth=7;c.stroke();c.strokeStyle=p.woodLight;c.lineWidth=1.5;c.beginPath();c.moveTo(x1,y-postH+7);c.lineTo(x2,y-postH+7);c.stroke();
  for(const x of[x1,x2]){
    c.fillStyle=p.woodShade;c.fillRect(x-5,y-postH,10,postH);c.fillStyle=p.wood;c.fillRect(x-4,y-postH,6,postH);
    c.strokeStyle=p.outline;c.lineWidth=1.2;c.strokeRect(x-5,y-postH,10,postH);
    c.beginPath();c.ellipse(x,y-postH,5,5*48/58,0,0,Math.PI*2);c.fillStyle=p.woodLight;c.fill();c.stroke();
  }
}

// Renderer appends these to its EXISTING player/follower depth-sorted drawList.
// getImage(src) must return its normal {img,ready} entry; no new image loader.
export function getCelForestDrawables(map,{getImage,playerPos,unitX:ux=58,unitZ:uz=48}={}){
  if(!isCelForestMap(map))return[];const p=map.palette||CEL_FOREST_PALETTE,out=[];
  for(const bridge of map.bridges||[])for(const[id,z]of[['back',bridge.minZ+.1],['front',bridge.maxZ-.1]])out.push({sortY:z*uz,draw:c=>bridgeRail(c,bridge,z,p,ux,uz,getImage,id)});
  // A few authored low reeds break the bank lip, never a repeated tuft field.
  const bankDetails=[{kind:'short_grass',x:-.05,z:1,scale:1.15},{kind:'short_grass',x:3.65,z:-2,scale:1.25},{kind:'short_grass',x:1.12,z:7,scale:1.1}];
  for(const prop of [...map.props,...(map.groundDetails||[]),...bankDetails]){
    const spec=CEL_FOREST_PROP_SPECS[prop.kind];if(!spec)continue;
    const scale=prop.scale||1,w=spec.w*scale,h=spec.h*scale,x=prop.x*ux,y=prop.z*uz;
    out.push({sortY:y,draw:c=>{const e=getImage(spec.src);if(!e?.ready)return;c.save();
      const left=x-w*(spec.anchorX??.5),top=y-h*spec.anchorY;
      const behind=prop.kind.startsWith('cel_oak')&&playerPos&&playerPos.z<prop.z&&playerPos.z>prop.z-h/uz*.7&&Math.abs(playerPos.x-prop.x)<w/ux*.4;
      if(behind){
        const cut=h*.7;c.save();c.beginPath();c.rect(left,top,w,cut);c.clip();c.globalAlpha=.72;c.drawImage(e.img,left,top,w,h);c.restore();
        c.beginPath();c.rect(left,top+cut,w,h-cut);c.clip();
      }
      c.drawImage(e.img,left,top,w,h);c.restore();}});
  }
  return out;
}
