// One local, non-saving style prototype. The concept image is never referenced
// as terrain: this map is reconstructed from shared terrain/bridge geometry.
export const CEL_FOREST_PROFILE='cel-forest-v1';
export const CEL_FOREST_SPAWN={zone:'mosswood',x:-2,z:5.5,facing:'up'};
const point=([x,z])=>({x,z});
const path=(points,width=2.5)=>({material:'dirt',width,points:points.map(point)});
export const CEL_FOREST_PALETTE={
  grass:'#a1b477',grassLight:'#b0bf83',grassShade:'#8b9e66',
  dirt:'#d8bd88',dirtLight:'#e5ce9b',dirtShade:'#c3a674',
  bank:'#9c9567',bankShade:'#717d5a',bankLight:'#bbb780',
  water:'#72a6a8',waterLight:'#8cbbba',waterShade:'#5b9198',
  wood:'#bc9762',woodLight:'#d5b27b',woodShade:'#8c6e4c',
  outline:'#52604a',shadow:'#3f5745',stone:'#a6ad98',
};
const streamBanks={
  left:[[-.2,-14],[-.8,-11],[.4,-8],[1,-5],[.8,-2],[.1,1],[.6,4],[1.4,7],[1,10],[1.9,14],[2,16]],
  right:[[2.5,-14],[2,-11],[3.1,-8],[3.7,-5],[3.5,-2],[2.8,1],[3.3,4],[4.1,7],[3.7,10],[4.6,14],[4.7,16]],
};
export const CEL_FOREST_BRIDGE={id:'brook-crossing',minX:-.1,maxX:4,minZ:2.95,maxZ:5.05,
  outline:[[-.1,2.95],[4,2.95],[4,5.05],[-.1,5.05]].map(point)};
const stream={id:'fork-brook',material:'terrain_cel_stream',blocked:true,
  outline:[...streamBanks.left,...streamBanks.right.toReversed()].map(point),
  holes:[CEL_FOREST_BRIDGE.outline],banks:streamBanks};
const tree=(id,kind,x,z,scale=1)=>({id,kind,x,z,scale,colliders:[{dx:0,dz:-.05,rx:.48,rz:.35}]});
export const CEL_FOREST_PROTOTYPE_MAP={
  id:'mosswood',nameZh:'苔影森林・清溪岔路',nameEn:'Mosswood — Brook Fork Prototype',
  subtitleZh:'原尺寸場景試作・林徑分岔與清溪木橋',levelRange:'場景試作',music:'field',battleBackdrop:'meadow',
  skyColor:'#a8c2ae',fogColor:'#a8c2ae',ambientColor:'#f4e8c4',
  bounds:{minX:-15,maxX:15,minZ:-12,maxZ:14},arrival:CEL_FOREST_SPAWN,
  renderProfile:CEL_FOREST_PROFILE,terrainBase:'terrain_cel_grass',authoredFloor:true,
  palette:CEL_FOREST_PALETTE,bridges:[CEL_FOREST_BRIDGE],terrainRegions:[stream],groundPaintings:[],
  roads:[path([[-2,14],[-2.2,10],[-2,7],[-2,5]],2.7),
    path([[-2,5],[-5,3],[-8,-1],[-9,-6],[-12,-10]],2.5),
    path([[-2,5],[.6,4],[3.4,4],[6.3,1.5],[9,-2],[12,-6]],2.5)],
  buildings:[],portals:[],encounters:[],tallGrass:[],
  districts:[{nameZh:'清溪木橋',x:2,z:4},{nameZh:'林心岔路',x:-2,z:5},{nameZh:'西側林蔭',x:-8,z:-1}],
  props:[
    tree('west-bank-oak-a','cel_oak_a',-8.8,4.1,1.03),
    tree('west-bank-oak-b','cel_oak_b',-11.3,2.3,.94),
    tree('northwest-oak','cel_oak_b',-5.7,-2,.95),
    tree('northwest-oak-small','cel_oak_a',-8,-4.8,.78),
    tree('east-bank-oak-a','cel_oak_a',6.7,-2.4,1.02),
    tree('east-bank-oak-b','cel_oak_b',10.3,3,.9),
    tree('frontwest-oak','cel_oak_a',-9.3,11,1.03),
    tree('frontwest-oak-b','cel_oak_b',-12.2,9.5,.9),
    tree('fronteast-oak','cel_oak_b',7.6,11.8,1.08),
    tree('fronteast-oak-b','cel_oak_a',11.2,10.1,.94),
    {id:'fork-sign',kind:'cel_sign',x:-3.6,z:3.8,scale:1,colliders:[{dx:0,dz:0,rx:.2,rz:.16}]},
    {id:'east-bank-stones',kind:'cel_stones',x:4.1,z:6.3,scale:.85,colliders:[{dx:0,dz:-.05,rx:.38,rz:.24}]},
    {id:'west-glen-stones',kind:'cel_stones',x:-6.8,z:7.2,scale:.7,colliders:[{dx:0,dz:-.05,rx:.3,rz:.2}]},
    ...[[-.1,3.05],[4,3.05],[-.1,4.95],[4,4.95]].map(([x,z],i)=>({id:`bridge-post-${i}`,kind:'cel_bridge_post',x,z,colliders:[{dx:0,dz:0,rx:.16,rz:.17}]})),
  ],
  // Purposefully authored low details; they are not an encounter stamp field.
  groundDetails:[[-5.9,5.8],[-7.2,3.1],[-10.8,-.4],[-5.4,-3],[-.8,-3.6],[.2,-.4],[4.5,1],
    [5.1,6.3],[6.1,8.8],[.2,8],[-4.1,10.8],[-10,8.3],[8.2,5.7]].map(([x,z],i)=>({x,z,kind:i===1||i===9?'tiny_flower':'short_grass',variant:i%3})),
};

export function isLocalCelForestPrototype(location=globalThis.location){
  return Boolean(location&&['127.0.0.1','localhost'].includes(location.hostname)&&location.pathname.endsWith('/preview')&&new URLSearchParams(location.search).get('world-trial')===CEL_FOREST_PROFILE);
}
export function applyCelForestPrototype(maps,location=globalThis.location){
  if(!isLocalCelForestPrototype(location))return null;
  maps.mosswood=CEL_FOREST_PROTOTYPE_MAP;
  // A normal Meadow entry in this explicit local trial arrives inside the
  // prototype instead of the old forest's distant western coordinate.
  maps.meadow={...maps.meadow,portals:maps.meadow.portals.map(p=>p.targetZone==='mosswood'?{...p,targetSpawn:{...CEL_FOREST_SPAWN}}:p)};
  return{id:CEL_FOREST_PROFILE,zone:'mosswood',spawn:CEL_FOREST_SPAWN,map:maps.mosswood};
}
