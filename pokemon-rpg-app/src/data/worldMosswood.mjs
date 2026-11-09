import {PREMIUM_CROSSING_MAP,PREMIUM_BRIDGE} from './worldPremiumPrototype.mjs';
const point=([x,z])=>({x,z});
const road=(points,width=2.4)=>({material:'dirt',width,points:points.map(p=>Array.isArray(p)?point(p):p)});
const grass=(id,x,z,rx,rz)=>({id,x,z,rx,rz,color:'#557849'});

// The bridge's source-derived deck, banks and rail footprints are shared with
// the approved scene. Routes extend around it into a persistent world region.
export function installMosswoodForest(maps){
  const previous=maps.mosswood,base=structuredClone(PREMIUM_CROSSING_MAP);
  const [west,east]=PREMIUM_BRIDGE.centerline;
  maps.mosswood={...base,
    nameZh:'苔影森林',nameEn:'Mosswood Forest',
    subtitleZh:'清溪木橋・古樹遺跡・兩岸林徑',levelRange:'Lv. 6–12',
    bounds:{...previous.bounds},arrival:{x:-31,z:0,facing:'right'},
    modularTerrain:true,atlasArt:'atlas-mosswood-v3',atlasCrop:[0,0,1,1],
    portals:[{id:'gate_mosswood_to_meadow',nameZh:'西側林口 ➔ 翡翠微風草原',targetZone:'meadow',x:-35,z:0,radius:2.2,targetSpawn:{x:54,z:0,facing:'left'},color:'#8fa572'}],
    roads:[
      road([[-41,0],[-35,0],[-25,0],[-21,7],[-15,9],[-7,9],[-3.6,8],west,east,[6,1.2],[9,-3],[18,-18],[28,-24],[34,-8],[26,8],[16,17],[7,12],[6,7],east],2.5),
      road([[-25,0],[-29,-12],[-25,-25],[-14,-32],[-8,-21],[-7,-10],[-6.5,0],west],2.3),
      road([[-3.6,8],[-6,20],[-10,31],[-18,31],[-29,28],[-34,15],[-35,0]],2.3),
      road([[18,-18],[18,-28],[24,-33],[30,-31]],2.1),
      road([[16,17],[23,24],[24,32],[15,35],[8,30],[7,12]],2.2),
    ],
    districts:[{nameZh:'西側林口',x:-31,z:0},{nameZh:'清溪木橋',x:1,z:4.5},
      {nameZh:'蕨葉幽徑',x:-23,z:-25},{nameZh:'古樹遺跡',x:24,z:-33},
      {nameZh:'蕈光林地',x:-18,z:30},{nameZh:'南境觀林臺',x:24,z:32}],
    tallGrass:[grass('west-fern-habitat',-20,-14,5,4),grass('south-mushroom-habitat',-20,20,5,4),
      grass('east-brook-habitat',12,8,4,3),grass('ruin-fern-habitat',27,-18,4,4),grass('south-canopy-habitat',17,28,4,3)],
    encounters:structuredClone(previous.encounters),incompleteArt:[],
  };
  const forest=maps.mosswood;
  forest.props.push(
    {kind:'woodland_ruin',x:24,z:-36,scale:1.05,colliders:[{dx:-1.3,dz:-.9,rx:.55,rz:.6},{dx:1.3,dz:-.9,rx:.55,rz:.6}]},
    {kind:'trail_sign',x:-5.2,z:7,scale:1,colliders:[{dx:0,dz:0,rx:.18,rz:.15}]},
    ...[[-20,-20],[-24,22],[20,11],[13,-29]].map(([x,z])=>({kind:'mosswood_log',x,z,scale:.8,colliders:[{dx:0,dz:-.2,rx:1.1,rz:.32}]})),
    ...[[-23,-29],[-20,33],[27,30],[30,-28],[-31,-8],[12,-15],[21,19]].map(([x,z])=>({kind:'woodland_shrubs',x,z,scale:.65})),
    // Authored canopy backdrops give destination clearings a real forest edge.
    ...[[17,-38,1.1],[25,-41,1.4],[32,-39,1.15],[35,-33,.95],[-32,-29,1.05],[-25,-37,1.12],[-15,-39,1.1],[-24,36,1.1],[-12,38,1.08],[29,36,1.05],[18,40,1.12]].map(([x,z,scale],i)=>({id:`mosswood-landmark-canopy-${i}`,kind:'premium_oak',x,z,scale,colliders:[{dx:0,dz:0,rx:.5,rz:.34}]})),
    ...[[20,-35],[29,-35],[21,-39],[-28,-29],[-18,34],[28,33]].map(([x,z])=>({kind:'premium_shrubs',x,z,scale:.6})),
  );
  return forest;
}
