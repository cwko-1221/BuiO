// Authored terrain silhouettes. Rendering and collision consume the SAME
// sampled outline, so a painted shore cannot disagree with the walking area.
import { COAST_PAINTED_FLOOR } from './coastPaintedFloor.mjs';
import { MOSSWOOD_PAINTED_FLOOR } from './mosswoodPaintedFloor.mjs';
function smoothOutline(points, steps = 10) {
  const result = [];
  for (let i = 0; i < points.length; i++) {
    const p0 = points[(i-1+points.length)%points.length];
    const p1 = points[i], p2 = points[(i+1)%points.length], p3 = points[(i+2)%points.length];
    for (let j = 0; j < steps; j++) {
      const t = j/steps, t2 = t*t, t3 = t2*t;
      const sample = (axis) => .5*((2*p1[axis])+(-p0[axis]+p2[axis])*t+
        (2*p0[axis]-5*p1[axis]+4*p2[axis]-p3[axis])*t2+
        (-p0[axis]+3*p1[axis]-3*p2[axis]+p3[axis])*t3);
      result.push({x:sample(0),z:sample(1)});
    }
  }
  return result;
}

export function insideTerrainRegion(x, z, region) {
  let inside = false;
  const points = region.outline;
  for (let i = 0, j = points.length-1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.z>z)!==(b.z>z) && x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x) inside = !inside;
  }
  // Bridges and dry islands are authored holes in the same terrain geometry;
  // walking and rendering can share a river outline without invisible water.
  return inside && !(region.holes || []).some(outline=>insideTerrainRegion(x,z,{outline}));
}

const authored = {
  mosswood:[
    {id:'stillleaf-pool',material:'terrain_water_ocean',blocked:true,
      outline:MOSSWOOD_PAINTED_FLOOR.pools[0]},
    {id:'southern-fern-pool',material:'terrain_water_ocean',blocked:true,
      outline:MOSSWOOD_PAINTED_FLOOR.pools[1]},
  ],
  meadow: [
    {id:'willow-pond',material:'terrain_water_ocean',rim:'#8cad96',blocked:true,
      points:[[-21,10],[-17,8.5],[-13,11],[-14,15.5],[-19,18],[-22,14]]},
  ],
  coast: [
    {id:'tidal-bay',material:'terrain_water_coast',rim:'#d4eee4',blocked:true,
      floorPatch:COAST_PAINTED_FLOOR,
      outline:[{x:18,z:-11},{x:20,z:-4},...COAST_PAINTED_FLOOR.shoreline,
        ...[[-30,20],[-45,24],[-62,50],[54,52],[54,-24],[29,-21]].map(([x,z])=>({x,z}))]},
  ],
  canyon: [
    {id:'northern-lava-shelf',material:'terrain_lava',rim:'#9c492e',blocked:true,
      points:[[-68,-50],[-67,-20],[-42,-17],[-30,-19],[-20,-15],[-12,-18],[-4,-14],[4,-18],[14,-15],[26,-18],[40,-15],[60,-20],[60,-50]]},
    {id:'southern-lava-fissure',material:'terrain_lava',rim:'#9c492e',blocked:true,
      points:[[-68,50],[-65,22],[-44,18],[-26,20],[-17,17],[-8,19],[0,17],[10,20],[18,17],[26,20],[43,18],[60,22],[60,50]]},
  ],
  twilight: [
    {id:'western-reflecting-pool',material:'terrain_astral_water',rim:'#657c95',blocked:true,
      points:[[-46,-64],[-21,-58],[-18,-42],[-18,-26],[-20,-14],[-18,-5],[-20,5],[-16,16],[-18,28],[-20,50],[-46,56]]},
    {id:'eastern-reflecting-pool',material:'terrain_astral_water',rim:'#657c95',blocked:true,
      points:[[46,-64],[21,-58],[20,-42],[18,-26],[20,-14],[17,-5],[20,5],[18,16],[20,28],[21,50],[46,56]]},
  ],
};

export const WORLD_ART_REGIONS = Object.fromEntries(Object.entries(authored).map(([zone,regions]) =>
  [zone,regions.map(({points,...region}) => ({...region,outline:region.outline || smoothOutline(points)}))]));
