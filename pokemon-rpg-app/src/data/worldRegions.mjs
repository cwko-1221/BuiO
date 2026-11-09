// Authored regions beyond the original town-and-four-spokes world. New regions
// have their own routes, encounter habitats, landmarks and physical terrain.
import { MOSSWOOD_PAINTED_FLOOR } from './mosswoodPaintedFloor.mjs';
const road=(points,width=2.4)=>({material:'dirt',width,points:points.map(([x,z])=>({x,z}))});
const grass=(id,x,z,rx,rz)=>({id,x,z,rx,rz,color:'#557849'});
const waygate='/pokemon-rpg/assets/overhaul/world/waygate-v2-candidate.webp';

export function addAuthoredWorldRegions(maps) {
  maps.meadow.roads.push(road([[42,10],[50,7],[57,0]],2.6));
  maps.meadow.portals.push({id:'gate_meadow_to_mosswood',nameZh:'東境林口 ➔ 苔影森林',
    targetZone:'mosswood',x:57,z:0,radius:2.2,targetSpawn:{x:-31,z:0,facing:'right'},color:'#6fa98b',artSrc:waygate});
  maps.mosswood={
    id:'mosswood',nameZh:'苔影森林',nameEn:'Mosswood Forest',
    subtitleZh:'苔蘚林徑・林間水潭・古樹遺跡',levelRange:'Lv. 6–12',
    music:'field',battleBackdrop:'meadow',skyColor:'#8bb9aa',fogColor:'#b4cdb9',ambientColor:'#e0ead2',
    bounds:{minX:-42,maxX:42,minZ:-48,maxZ:48},arrival:{x:-31,z:0},
    terrainBase:'terrain_forest_mosswood',buildings:[],
    groundPaintings:[MOSSWOOD_PAINTED_FLOOR],
    authoredFloor:true,
    portals:[{id:'gate_mosswood_to_meadow',nameZh:'西側林口 ➔ 翡翠微風草原',targetZone:'meadow',
      x:-35,z:0,radius:2.2,targetSpawn:{x:54,z:0,facing:'left'},color:'#b5c978',artSrc:waygate}],
    roads:[
      road([[-36,0],[-20,0],[0,0],[20,0],[32,0]],2.8),
      road([[0,0],[10,-10],[8,-25],[-4,-34],[-18,-32],[-31,-20],[-30,-5],[-20,0]]),
      road([[0,0],[-10,10],[-8,24],[4,34],[14,33],[20,15],[31,16],[31,8],[20,0]]),
      road([[8,-25],[20,-31],[31,-27],[34,-16],[32,0]],2.1),
    ],
    districts:[{nameZh:'苔光林心',x:0,z:0},{nameZh:'靜葉水潭',x:-29,z:-25},
      {nameZh:'古樹遺跡',x:20,z:-31},{nameZh:'蕈光迴廊',x:4,z:34},{nameZh:'南境觀林臺',x:14,z:33}],
    props:[
      ...[[-36,-31],[-33,-38],[-25,-39],[-12,-40],[2,-42],[16,-39],[29,-37],[36,-30],
        [-36,-12],[-35,9],[-32,19],[-25,31],[-14,37],[-5,40],[8,42],[23,38],[34,31],
        [37,20],[36,6],[36,-7],[-17,-8],[-8,-18],[1,-27],[18,-17],[23,-9],[-18,12],[-20,23],[3,21],[12,13]]
        .map(([x,z],i)=>({kind:i%5===0?'tree_pine':'tree_oak',x,z,scale:.88+(i%4)*.075})),
      {kind:'woodland_ruin',x:20,z:-35,scale:1.2,colliders:[{dx:-1.3,dz:-.9,rx:.55,rz:.6},{dx:1.3,dz:-.9,rx:.55,rz:.6}]},
      ...[[-24,8,.85],[19,6,1],[8,29,.9]].map(([x,z,scale])=>({kind:'mosswood_log',x,z,scale,
        colliders:[{dx:0,dz:-.25,rx:1.35,rz:.4}]})),
      ...[[-12,-28],[3,-36],[28,-20],[-26,24],[20,30],[-11,6]].map(([x,z])=>({kind:'woodland_shrubs',x,z,scale:.72})),
    ],
    tallGrass:[grass('moss-heart',-5,5,5,3),grass('north-fern-bed',14,-18,5,4),
      grass('west-leaf-bed',-23,17,6,5),grass('south-mushroom-bed',4,28,4,3),grass('east-woodland-bed',28,-9,5,5)],
    encounters:[{speciesId:'pikachu',weight:25,minLv:6,maxLv:10},{speciesId:'bulbasaur',weight:20,minLv:6,maxLv:10},
      {speciesId:'eevee',weight:20,minLv:7,maxLv:11},{speciesId:'riolu',weight:18,minLv:8,maxLv:12},
      {speciesId:'jigglypuff',weight:12,minLv:7,maxLv:10},{speciesId:'snorlax',weight:5,minLv:10,maxLv:12}],
  };
}
