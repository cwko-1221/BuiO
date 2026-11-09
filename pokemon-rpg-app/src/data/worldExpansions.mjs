// Authored exploration loops. Existing quest sites and gate approaches keep
// their coordinates; new districts grow around them rather than scaling saves.
const road=(points,width=2.3,material='dirt')=>({material,width,points:points.map(([x,z])=>({x,z}))});
const groveOffsets=[[-6,-4],[-1,-6],[4,-5],[-4,0],[2,-1],[7,1],[-2,5],[4,6]];
function grove(map,kind,x,z,scale=1) {
  const angle=Math.sin(x*12.9898+z*78.233)*Math.PI;
  groveOffsets.forEach(([dx,dz],i)=>{
    const px=x+(dx*Math.cos(angle)-dz*Math.sin(angle)+Math.sin(i*4.7+x)*.9)*scale;
    const pz=z+(dx*Math.sin(angle)+dz*Math.cos(angle)+Math.cos(i*5.3+z)*.9)*scale;
    const blocksTrail=map.roads.some(road=>road.points.some((b,j)=>{
      if(!j)return false;const a=road.points[j-1],vx=b.x-a.x,vz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((px-a.x)*vx+(pz-a.z)*vz)/(vx*vx+vz*vz || 1)));
      return Math.hypot(px-a.x-t*vx,pz-a.z-t*vz)<road.width/2+1.4;
    }));
    if(!blocksTrail)map.props.push({kind,x:px,z:pz,scale:.87+(i%4)*.09});
  });
}
const grass=(id,x,z,rx,rz)=>({id,x,z,rx,rz,color:'#6a874d'});
const cliff=(x,z)=>({kind:'canyon_cliff',x,z,scale:1,
  // Front rim follows the diagonal visible rock base. The raised ledge behind
  // it meets the nonwalkable lava shelf, rather than hiding walkable flat land.
  footprint:{outline:[[-5.7,-1.8],[-1,-.9],[5.7,.15],[5.7,-10],[-5.7,-10]].map(([x,z])=>({x,z}))}});
const rocks=(x,z,scale=1)=>({kind:'shore_rocks',x,z,scale,colliders:[{dx:0,dz:-.35,rx:1.5,rz:.65}]});
const ruin=(x,z)=>({kind:'woodland_ruin',x,z,scale:1,colliders:[
  {dx:-1.28,dz:-.9,rx:.52,rz:.58},{dx:1.28,dz:-.9,rx:.52,rz:.58},
  {dx:-2.2,dz:-.1,rx:.55,rz:.5},{dx:2.3,dz:-.05,rx:.55,rz:.5}]});
function shrubs(map,points) {
  points.forEach(([x,z,scale=1])=>{
    const onTrail=map.roads.some(road=>road.points.some((b,j)=>{
      if(!j)return false;const a=road.points[j-1],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz || 1)));
      return Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<road.width/2+.9;
    }));
    if(!onTrail)map.props.push({kind:'woodland_shrubs',x,z,scale});
  });
}

export function applyWorldExpansions(maps) {
  const town=maps.dawnleaf;
  town.bounds={minX:-42,maxX:42,minZ:-42,maxZ:42};
  town.roads.push(road([[-18,0],[-27,-7],[-30,-20],[-20,-31],[-5,-33],[17,-31],[29,-19],[28,-7],[18,0]],2.8),
    road([[-18,0],[-28,10],[-29,21],[-18,30],[0,32],[20,27],[28,14],[18,0]],2.5));
  grove(town,'tree_oak',-28,-25,.9);grove(town,'tree_oak',27,-27,.85);
  grove(town,'tree_oak',-25,26,.9);grove(town,'tree_oak',25,27,.8);
  town.districts=[{nameZh:'晨曦廣場',x:0,z:6},{nameZh:'北苑林徑',x:-16,z:-30},{nameZh:'南庭散步道',x:4,z:31}];
  shrubs(town,[[-12,10,.7],[12,10,.75],[-21,-11,.8],[20,-11,.8],[-28,25],[25,23,.9]]);

  const meadow=maps.meadow;
  meadow.bounds={minX:-38,maxX:62,minZ:-48,maxZ:48};
  meadow.roads.push(road([[17,0],[29,-1],[38,-12],[34,-27],[18,-34],[4,-24],[-8,-14],[-10,.5]]),
    road([[29,-1],[42,10],[38,24],[22,32],[8,24],[0,10],[0,-1]]));
  for(const [x,z,s] of [[20,-38,1],[42,-29,.9],[-20,-26,.9],[50,1,.9],[42,32,.85],[13,38,.9]])grove(meadow,'tree_oak',x,z,s);
  meadow.tallGrass.push(grass('north-herb-bed',17,-25,6,4),grass('east-wildflower-bed',49,13,5,6),grass('south-grove-bed',20,22,6,4));
  meadow.districts=[{nameZh:'翠葉神祠',x:18,z:3},{nameZh:'北風林徑',x:18,z:-33},{nameZh:'南風花野',x:24,z:31},{nameZh:'東境草甸',x:41,z:12}];
  meadow.props.push(ruin(20,-36));
  shrubs(meadow,[[-15,8,.8],[-12,16,.9],[12,-28],[28,-33,.85],[44,27],[35,30,.8],[45,-23,.9],[49,-1,.7]]);

  const coast=maps.coast;
  coast.bounds={minX:-52,maxX:44,minZ:-46,maxZ:42};
  coast.roads.push(road([[0,-17],[-12,-22],[-27,-21],[-38,-11],[-35,3],[-22,9],[-9,6],[0,-2]],2.4),
    road([[-27,-21],[-25,-33],[-10,-36],[5,-31],[9,-20]],2.2));
  for(const [x,z,s] of [[-39,-28,.85],[-43,-3,.8],[-23,1,.7],[-13,-36,.8],[6,-33,.7]])grove(coast,'tree_palm',x,z,s);
  coast.tallGrass.push(grass('coastal-thicket',-32,-10,5,6),grass('saltwind-oasis',-12,-28,5,4));
  coast.districts=[{nameZh:'潮汐燈塔',x:13,z:16},{nameZh:'西灣棕櫚林',x:-35,z:-10},{nameZh:'鹽風小徑',x:-12,z:-35}];
  coast.props.push(rocks(16,6,.85),rocks(9,18),rocks(-28,18,1.1),rocks(-42,-12,.8));

  const canyon=maps.canyon;
  canyon.bounds={minX:-56,maxX:48,minZ:-38,maxZ:38};
  canyon.roads.push(road([[-13,5],[-26,8],[-39,4],[-45,-4],[-35,-10],[-23,-8],[-16,-5]],2.5),
    road([[15,0],[27,-6],[36,-3],[38,6],[26,10],[15,5]],2.2));
  for(const [x,z,s] of [[-43,-13,.75],[-43,13,.8],[-26,13,.7],[29,-12,.7],[36,13,.6]])grove(canyon,'tree_pine',x,z,s);
  canyon.tallGrass.push(grass('western-ash-garden',-35,6,6,3.5),grass('eastern-ash-garden',30,4,5,3));
  canyon.districts=[{nameZh:'烈焰武館',x:-14,z:5},{nameZh:'西境灰燼林',x:-39,z:3},{nameZh:'赤岩迴廊',x:32,z:2},{nameZh:'赤岩瞭望',x:-35,z:-10},{nameZh:'東境岩壁',x:34,z:-9.5}];
  canyon.props.push(cliff(-38,-12),cliff(2,-13.5),cliff(34,-11.5));

  const twilight=maps.twilight;
  twilight.bounds={minX:-34,maxX:34,minZ:-52,maxZ:44};
  twilight.roads.push(road([[0,-9],[-9,-17],[-9,-30],[0,-40],[10,-34],[10,-20],[0,-9]],2.5,'stone'),
    road([[0,17],[-10,23],[-11,33],[0,36],[11,30],[10,21],[0,17]],2.1,'stone'));
  for(const [x,z,s] of [[-13,-36,.5],[13,-36,.5],[-14,30,.45],[14,30,.45]]) {
    grove(twilight,'crystal_twilight',x,z,s);
  }
  twilight.tallGrass.push(grass('northern-moonreeds',-6,-31,4,4),grass('southern-moonreeds',6,29,4,3));
  twilight.districts=[{nameZh:'星輝祭壇',x:0,z:-9},{nameZh:'月影迴廊',x:0,z:-39},{nameZh:'南境星庭',x:0,z:35}];
}
