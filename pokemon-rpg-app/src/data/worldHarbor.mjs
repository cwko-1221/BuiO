// Tideglass is an authored coastal settlement: upper village loop, saltmarsh
// spur and a working T pier. The sea outline leaves the pier physically dry.
const road=(points,width=2.5,material='dirt')=>({material,width,points:points.map(([x,z])=>({x,z}))});
export const HARBOR_BOUNDS={minX:-42,maxX:42,minZ:-42,maxZ:42};
export const HARBOR_SHORE=[[-46,10],[-34,9],[-25,12],[-15,8],[-7,10],[0,9],
  [0,20],[-7,20],[-7,25],[0,25],[0,30],[10,30],[10,25],[18,25],[18,20],[10,20],
  [10,9],[20,7],[28,1],[36,-2],[46,-3],[46,60],[-46,60]].map(([x,z])=>({x,z}));
export const HARBOR_ROADS=[
  road([[36,-10],[25,-12],[11,-10],[4,0],[5,10],[5,28]],3),
  road([[25,-12],[26,-26],[9,-32],[-12,-29],[-26,-18],[-26,-3],[-14,3],[4,0]],2.7),
  road([[-26,-3],[-35,2],[-35,7],[-27,6],[-14,3]],2.1),
  road([[4,0],[17,1],[25,-3],[25,-12]],2.4),
  road([[-5,22.5],[16,22.5]],3.3,'stone'),
];
export function addTideglassHarbor(maps,floor) {
  if(!floor)return; // Source inspection/import is required before adding a region.
  maps.coast.roads.push(road([[-38,-11],[-46,-10]],2.8));
  maps.coast.portals.push({id:'gate_coast_to_harbor',nameZh:'西灣航路 ➔ 潮璃漁港',targetZone:'harbor',
    x:-47,z:-10,radius:2.2,targetSpawn:{x:33,z:-10,facing:'left'},color:'#6aaca9',artSrc:floor.waygateSrc,artWidth:230});
  maps.harbor={id:'harbor',nameZh:'潮璃漁港',nameEn:'Tideglass Fishing Harbor',
    subtitleZh:'風帆碼頭・鹽沼小徑・漁港環道',levelRange:'Lv. 9–15',music:'coast',battleBackdrop:'coast',
    skyColor:'#92c9cf',fogColor:'#c2d8d1',ambientColor:'#f2e6ce',bounds:HARBOR_BOUNDS,
    arrival:{x:33,z:-10},terrainBase:'terrain_sand_coast',authoredFloor:true,
    encounterGrassKind:'tall_grass_mosswood',
    groundPaintings:[floor],buildings:[],
    terrainRegions:[{id:'tideglass-bay',material:'terrain_water_coast',blocked:true,outline:floor.shoreline || HARBOR_SHORE}],
    portals:[{id:'gate_harbor_to_coast',nameZh:'東側灣徑 ➔ 蔚藍潮汐海岸',targetZone:'coast',
      x:37,z:-10,radius:2.2,targetSpawn:{x:-43,z:-10,facing:'right'},color:'#75bdc5',artSrc:floor.waygateSrc,artWidth:230}],
    roads:HARBOR_ROADS,
    districts:[{nameZh:'風帆碼頭',x:5,z:26.5},{nameZh:'漁人廣場',x:4,z:0},
      {nameZh:'鹽沼棧道',x:-34,z:5},{nameZh:'北灣松徑',x:9,z:-31},{nameZh:'潮岸瞭望',x:25,z:-3}],
    props:[{kind:'tree_palm',x:-32,z:-24,scale:.85},{kind:'tree_palm',x:-14,z:-34,scale:.9},
      {kind:'tree_palm',x:16,z:-35,scale:.8},{kind:'tree_palm',x:31,z:-22,scale:.85},
      {kind:'shore_rocks',x:-19,z:11,scale:1.1,colliders:[{dx:0,dz:-.3,rx:1.4,rz:.6}]},
      {kind:'shore_rocks',x:25,z:7,scale:.8,colliders:[{dx:0,dz:-.3,rx:1.4,rz:.6}]},
      // These small pillars are already painted into the pier floor. Their
      // visible footprints still have physical collision and remain clear of
      // the walking centre line; there is no extra overlay stamp.
      ...[[-5.1,20.1],[15.5,20.1],[5,28.5]].map(([x,z])=>({kind:'harbor_mooring',x,z,colliders:[{dx:0,dz:0,rx:.55,rz:.6}]}))],
    tallGrass:[{id:'saltmarsh-reeds',x:-31,z:-5,rx:4.5,rz:4,color:'#738c65'},
      {id:'north-bay-habitat',x:-12,z:-21,rx:6,rz:4,color:'#75966b'},
      {id:'coastal-herb-garden',x:18,z:-19,rx:5,rz:4,color:'#83a16f'}],
    encounters:[{speciesId:'squirtle',weight:30,minLv:9,maxLv:12},{speciesId:'eevee',weight:18,minLv:10,maxLv:13},
      {speciesId:'jigglypuff',weight:18,minLv:10,maxLv:13},{speciesId:'lapras',weight:12,minLv:12,maxLv:15},
      {speciesId:'sylveon',weight:12,minLv:11,maxLv:14},{speciesId:'pikachu',weight:10,minLv:10,maxLv:13}],
  };
}

