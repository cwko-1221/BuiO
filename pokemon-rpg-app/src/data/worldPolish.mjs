import {insideTerrainRegion} from './worldArtLayouts.mjs';
import {NPCS} from './trainers.mjs';
const segmentDistance=(x,z,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a.x-dx*t,z-a.z-dz*t);};
function softenShore(points){
  let line=points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z)>.15);
  if(line.length<3)return points;
  for(let n=0;n<2;n++)line=line.flatMap((a,i)=>{const b=line[(i+1)%line.length];return[{x:a.x*.75+b.x*.25,z:a.z*.75+b.z*.25},{x:a.x*.25+b.x*.75,z:a.z*.25+b.z*.75}];});
  return line;
}
function dressRoutes(map){
  const woodland=['dawnleaf','meadow','mosswood'].includes(map.id),coast=map.id==='coast';
  const kind=woodland?(map.renderProfile==='premium-crossing-v1'?'premium_oak':'tree_oak'):coast?'tree_palm':map.id==='twilight'?'crystal_twilight':'rock_canyon';
  const candidates=[];let serial=0;
  for(const road of map.roads||[])for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<3)continue;
    for(let d=3;d<length;d+=map.id==='mosswood'?5.8:8.5){
      const sign=serial++%2?1:-1,t=d/length,offset=road.width/2+2.8+Math.sin(serial*2.7)*.45;
      candidates.push({kind,x:a.x+dx*t-dz/length*offset*sign,z:a.z+dz*t+dx/length*offset*sign,scale:woodland?.82+(serial%4)*.075:coast?.76:.72});
      if(map.id==='mosswood')candidates.push({kind,x:a.x+dx*t-dz/length*(offset+3.4)*sign+1.1,z:a.z+dz*t+dx/length*(offset+3.4)*sign+1.8,scale:.88});
    }
  }
  const b=map.bounds;
  for(const prop of candidates){
    if(prop.x<b.minX+2||prop.x>b.maxX-2||prop.z<b.minZ+2||prop.z>b.maxZ-2)continue;
    if((map.terrainRegions||[]).some(r=>r.blocked&&insideTerrainRegion(prop.x,prop.z,r)))continue;
    if((map.roads||[]).some(r=>r.points.some((b,i)=>i&&segmentDistance(prop.x,prop.z,r.points[i-1],b)<r.width/2+2.1)))continue;
    if((map.buildings||[]).some(p=>Math.abs(p.x-prop.x)<p.w/2+3&&Math.abs(p.z-prop.z)<p.d/2+4))continue;
    if((map.portals||[]).some(p=>Math.hypot(p.x-prop.x,p.z-prop.z)<4))continue;
    if(NPCS.some(p=>(p.zone||'dawnleaf')===map.id&&Math.hypot(p.x-prop.x,p.z-prop.z)<3.8))continue;
    if(map.props.some(p=>Math.hypot(p.x-prop.x,p.z-prop.z)<2.7))continue;
    if(kind==='premium_oak')prop.colliders=[{dx:0,dz:0,rx:.5,rz:.34}];
    prop.id=`${map.id}-route-scenery-${map.props.length}`;map.props.push(prop);
  }
}
// All playable regions use native-density materials and their actual geometry.
// Giant baked scene paintings hid routes and exposed rectangular outer edges.
export function applyWorldPolish(maps){
  for(const map of Object.values(maps)){
    map.modularTerrain=true;
    if(map.renderProfile==='premium-crossing-v1'){dressRoutes(map);continue;}
    map.authoredFloor=false;
    map.groundPaintings=[];
    for(const region of map.terrainRegions||[])delete region.floorPatch;
    for(const region of map.terrainRegions||[])region.outline=softenShore(region.outline);
    dressRoutes(map);
  }
}
