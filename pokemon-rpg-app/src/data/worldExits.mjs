export const TRAIL_SIGN_ART='/pokemon-rpg/assets/overhaul/world/trail-signpost-v1.webp';
export function installTrailExits(maps){
  for(const map of Object.values(maps))for(const exit of map.portals||[]){
    const b=map.bounds,dx=exit.x-(b.minX+b.maxX)/2,dz=exit.z-(b.minZ+b.maxZ)/2;
    const horizontal=Math.abs(dx)>Math.abs(dz),sign=horizontal?{x:exit.x,z:exit.z-2.1}:{x:exit.x+2.1,z:exit.z};
    exit.appearance='trail';exit.sign=sign;
    exit.direction=horizontal?(dx>0?'east':'west'):(dz>0?'south':'north');
    delete exit.artSrc;
    const end=horizontal?{x:dx>0?b.maxX+12:b.minX-12,z:exit.z}:{x:exit.x,z:dz>0?b.maxZ+12:b.minZ-12};
    // The visible road continues through the trigger instead of ending in a
    // rounded platform beneath a sign. Its material matches the nearest route.
    let nearest=null,distance=Infinity;
    for(const road of map.roads||[])for(const p of road.points){const d=Math.hypot(p.x-exit.x,p.z-exit.z);if(d<distance){nearest=road;distance=d;}}
    map.roads.push({id:`${exit.id}-continuation`,material:nearest?.material||'dirt',width:nearest?.width||2.4,points:[{x:exit.x,z:exit.z},end]});
  }
}
