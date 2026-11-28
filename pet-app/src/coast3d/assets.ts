import { COASTS, nearestTrail, shore, terrain } from './island';
import { TRIAL_MODELS } from './trial-placements';

type Shape = 'cottage'|'stall'|'awning'|'cart'|'sign'|'pot'|'moon'|'basin'|'steps'|'rail'|'bench'|'lamp'|'bed'|'gazebo'|'arch'|'leaf'|'pine'|'palm'|'flowers'|'rock'|'bridge'|'post'|'observatory'|'orrery'|'jetty'|'rope'|'boat'|'parasol'|'shrub'|'cascade';
export type Asset = { label:string; shape:Shape; size:readonly [number,number,number]; color:number; collision?:'box'|'trunk' };
// Width × depth × height. Assets are centred on their footprint, facing +Z.
export const ASSETS = {
  'crescent': {label:'月牙雕塑',shape:'moon',size:[3.9,1.25,4.1],color:0xffd374},
  'fountain': {label:'噴泉石池',shape:'basin',size:[9.6,9.6,1.3],color:0xf1d1a3,collision:'box'},
  'plaza-steps': {label:'廣場台階',shape:'steps',size:[5.8,2.7,.6],color:0xebc7aa},
  'plaza-railing': {label:'廣場石欄',shape:'rail',size:[3,.45,.86],color:0xf5d8a4,collision:'box'},
  'bench': {label:'鑄鐵木長椅',shape:'bench',size:[1.8,.68,.9],color:0xd48a43,collision:'box'},
  'lamp': {label:'黃銅球燈',shape:'lamp',size:[.47,.47,2.55],color:0xffce63,collision:'box'},
  'flower-bed': {label:'石砌花槽',shape:'bed',size:[2.15,1,.64],color:0xdaab80,collision:'box'},
  'market-coral': {label:'珊瑚山牆店屋',shape:'cottage',size:[10.5,7.6,6.7],color:0xe78864,collision:'box'},
  'market-salmon': {label:'杏紅拱門店屋',shape:'cottage',size:[8.8,7.2,6.2],color:0xeeb799,collision:'box'},
  'market-canopy': {label:'碧色布篷',shape:'awning',size:[4.5,3.1,3.1],color:0x43bda9},
  'market-stall': {label:'木蔬果攤',shape:'stall',size:[2.9,1.7,2.43],color:0x4cb5a1,collision:'box'},
  'market-cart': {label:'柑橘布篷攤車',shape:'cart',size:[2.3,1.25,2.05],color:0xe7a96a,collision:'box'},
  'market-sign': {label:'立地木招牌',shape:'sign',size:[.65,.44,1.12],color:0xbc8252,collision:'box'},
  'flower-pot': {label:'赤陶花盆',shape:'pot',size:[.59,.59,.75],color:0xd6865f},
  'gazebo': {label:'翡翠石柱涼亭',shape:'gazebo',size:[5.5,5.5,4.65],color:0x348b73},
  'flower-arch': {label:'向日葵花拱',shape:'arch',size:[3.2,1.05,3.05],color:0xf7c649},
  'gold-tree': {label:'金葉闊冠樹',shape:'leaf',size:[5.3,5.3,6.1],color:0xb9aa35,collision:'trunk'},
  'pink-tree': {label:'粉花樹',shape:'leaf',size:[5.4,5,5.55],color:0xfca0b2,collision:'trunk'},
  'green-tree': {label:'亮葉闊冠樹',shape:'leaf',size:[5.1,4.7,5.55],color:0x83b840,collision:'trunk'},
  'pine': {label:'藍綠松樹',shape:'pine',size:[3.15,3.15,5.75],color:0x3c8b62,collision:'trunk'},
  'palm': {label:'海岸棕櫚',shape:'palm',size:[4.4,4.4,5.3],color:0x91af39,collision:'trunk'},
  'lavender': {label:'紫薰衣草叢',shape:'flowers',size:[1.03,.83,.72],color:0x9d7dcd},
  'hydrangea': {label:'藍繡球花叢',shape:'flowers',size:[1.1,.9,.63],color:0x7da5ef},
  'daisy': {label:'奶白雛菊叢',shape:'flowers',size:[.97,.72,.47],color:0xfff0cc},
  'shore-rock': {label:'米灰海岸岩',shape:'rock',size:[2.3,1.6,1.2],color:0xada899},
  'west-bridge': {label:'西橋石拱橋身',shape:'bridge',size:[4.25,19,2.75],color:0xf4d0a7},
  'west-rail': {label:'西橋青金石欄',shape:'rail',size:[2.55,.37,.72],color:0x5eb3b9,collision:'box'},
  'west-post': {label:'西橋球頂柱',shape:'post',size:[.5,.5,1],color:0xebc496},
  'observatory': {label:'金肋翡翠圓頂觀星台',shape:'observatory',size:[10,8.4,8.4],color:0x4eaaa0,collision:'box'},
  'orrery': {label:'金色天球儀',shape:'orrery',size:[3.2,3,4.1],color:0xf2b94f,collision:'box'},
  'summit-steps': {label:'山徑石階',shape:'steps',size:[3.1,3.4,1.28],color:0xd7b395},
  'summit-rail': {label:'觀星台象牙石欄',shape:'rail',size:[2.7,.4,.85],color:0xd9bb8e,collision:'box'},
  'cliff-rock': {label:'層理崖壁岩塊',shape:'rock',size:[4.5,2.7,3.4],color:0x9daba1},
  'waterfall': {label:'三級瀑布岩床組件',shape:'cascade',size:[7.1,7.4,6.4],color:0x56ccd6},
  'boathouse': {label:'海藍船屋',shape:'cottage',size:[8.8,6.3,5.45],color:0x60a4dc,collision:'box'},
  'dock-deck': {label:'棧道木板組件',shape:'jetty',size:[3.8,3.4,.32],color:0xb58352},
  'dock-post': {label:'麻繩碼頭木樁',shape:'post',size:[.38,.38,1.33],color:0xb28156},
  'dock-rope': {label:'弧垂麻繩',shape:'rope',size:[2.7,.22,.46],color:0xefdbb3},
  'sailboat': {label:'象牙帆小船',shape:'boat',size:[2.55,4.6,4.3],color:0xf3e1aa},
  'parasol': {label:'藍白遮陽傘',shape:'parasol',size:[2.6,2.6,2.72],color:0x64acd1},
  'cottage-moss': {label:'苔綠屋頂小屋',shape:'cottage',size:[6.3,5.2,5.3],color:0x83a459,collision:'box'},
  'cottage-clay': {label:'橘陶屋頂小屋',shape:'cottage',size:[6.9,5.5,5.7],color:0xd17c59,collision:'box'},
  'cottage-clay-annex': {label:'橘陶矮簷花屋',shape:'cottage',size:[6.15,5.15,4.85],color:0xd99465,collision:'box'},
  'cottage-teal': {label:'青綠門小屋',shape:'cottage',size:[6.0,5.05,4.95],color:0x62a698,collision:'box'},
  'village-fence': {label:'村屋雙橫木欄',shape:'rail',size:[2.55,.28,.86],color:0xbe9662,collision:'box'},
  'shrub': {label:'矮圓灌木',shape:'shrub',size:[1.42,1.14,.86],color:0x86a641},
  'village-cart': {label:'薄荷條紋攤車',shape:'cart',size:[2.45,1.26,2.1],color:0x86cabc,collision:'box'},
  'east-bridge': {label:'東橋石拱橋身',shape:'bridge',size:[4.25,21.5,3.05],color:0xf0cba0},
  'east-rail': {label:'東橋藍釉欄杆',shape:'rail',size:[2.65,.37,.73],color:0x7eb3d1,collision:'box'},
  'east-post': {label:'東橋球頂柱',shape:'post',size:[.58,.58,1.1],color:0xffd4a7},
} as const satisfies Record<string,Asset>;
export type AssetId=keyof typeof ASSETS;
export type Placement = { id:AssetId; x:number; z:number; yaw:number; roll?:number; y?:number; scale?:number; stretch?:readonly [number,number,number] };
export const objects: Placement[]=[];
function set(id:AssetId,x:number,z:number,yaw=0,y?:number,scale?:number) { objects.push({id,x,z,yaw,y,scale}); }

export const fountainPlacement={id:'fountain',x:121,z:88,yaw:0,scale:2.20,stretch:[1,.535,1]} as const satisfies Placement;
export const moonPlacement={id:'crescent',x:121,z:88,yaw:0,y:4.9+1.3*2.20*.535,scale:1.47,stretch:[1.12,1.03,.91]} as const satisfies Placement;
objects.push(fountainPlacement,moonPlacement);
set('plaza-steps',121,112.9,0,4.14,1.27);objects.at(-1)!.stretch=[1.64,1,1.19];
for(let i=0;i<=24;i++){
  const angle=(i/24-.5)*2.87,r=22.8;
  const x=121+Math.sin(angle)*r,z=88-Math.cos(angle)*r;
  if(nearestTrail(x,z).distance>2.35)set('plaza-railing',x,z,-angle,undefined,.905);
}
for(const side of [-1,1]) {
  set('bench',121+side*18.6,86,side*Math.PI/2);
  set('bench',121+side*16,99,side*.6);
  set('lamp',121+side*7.35,112,0,undefined,1.45);
  set('flower-bed',121+side*8.4,109.5);
  set('pink-tree',121+side*25.5,89);
  set('pink-tree',121+side*14.1,108,side*.26,undefined,.96);
  set('green-tree',121+side*11.5,115,side*.52,undefined,.85);
  set('bench',121+side*16.5,94,side*1.08);
}
set('market-coral',51.6,38.6,-.13,undefined,1.24);set('market-salmon',76.4,33.4,.11,undefined,1.20);set('market-salmon',88.2,35.6,.18,undefined,1.06);
set('market-salmon',64.8,35.6,-.11,undefined,1.00);objects.at(-1)!.stretch=[1.06,.74,.96];
set('market-salmon',37.8,43.2,-.35,undefined,1.06);objects.at(-1)!.stretch=[1.05,.69,1.05];
set('market-salmon',100.2,42.0,.32,undefined,.95);objects.at(-1)!.stretch=[.95,.77,.96];
for(const [x,z,yaw] of [[52,45,-.14],[77.4,44,.09]]) {
  set('market-canopy',x,z,yaw,undefined,1.33);
  objects.at(-1)!.stretch=[3.21,1.48,1.55];
}
set('market-stall',52,50);set('market-stall',80,50,.16);set('market-cart',74,55,.55);
for(const [x,z,yaw] of [[48,45,-.15],[56.4,46,.11],[62.5,42.7,-.06],[70.6,45.2,-.15],[78.8,44,.11],[91.7,42,.20]]){
  set('market-stall',x,z,yaw,undefined,1.19);
  const c=Math.cos(yaw),s=Math.sin(yaw),[px,pz]=x>91?[91.5,43.4]:[x,z];
  const rx=px+2.28*c+.45*s, rz=pz-2.28*s+.45*c;
  const lx=px-2.28*c+.45*s, lz=pz+2.28*s+.45*c;
  if(nearestTrail(rx,rz).distance>1.15)set('flower-pot',rx,rz,yaw,undefined,1.28);
  if(nearestTrail(lx,lz).distance>1.15)set('flower-pot',lx,lz,-yaw);
}
set('market-stall',37.5,50.2,-.33,undefined,1.18);set('market-stall',96,49,.3,undefined,1.14);
set('market-cart',86.4,56.6,.28,undefined,1.18);
set('market-sign',62,55,-.15);set('flower-pot',71.2,43.2);set('flower-pot',86,43);
set('gazebo',52,82,0,undefined,2.23);objects.at(-1)!.stretch=[1,.81,1];
set('flower-arch',31,96,.16,undefined,2.48);objects.at(-1)!.stretch=[1,.67,.85];
set('gold-tree',31,83,0,undefined,1.16);set('pink-tree',56,98);set('bench',34,93,.25);
set('observatory',184,32.5,0,undefined,1.92);objects.at(-1)!.stretch=[1.12,1.07,.82];
set('orrery',200,38.3,-.18,undefined,1.78);
set('waterfall',145.9,52.8,.1,3.37,1.57);objects.at(-1)!.stretch=[1.1,.87,1.18];
{
  const rx=21.1, rz=15.6, bay=2.45;
  let index=0;
  for(let angle=-1.96; angle<=1.90; ){
    const x=183+rx*Math.sin(angle), z=36+rz*Math.cos(angle);
    const yaw=Math.atan2(rz*Math.sin(angle),rx*Math.cos(angle));
    const flatCorner=(side:number)=>terrain(x+side*1.22*Math.cos(yaw),z-side*1.22*Math.sin(yaw)).y;
    const clearRocks=angle<-1.58||angle>-.10;
    if(shore(x,z)>3.8&&nearestTrail(x,z).distance>2.65&&terrain(x,z).y>12.92&&flatCorner(-1)>12.92&&flatCorner(1)>12.92&&clearRocks){
      set('summit-rail',x,z,yaw,undefined,.907);
      const lx=x-.55*Math.sin(yaw), lz=z-.55*Math.cos(yaw);
      if(index%4===1 && Math.hypot(lx-200,lz-38.3)>4.4)set('lamp',lx,lz,yaw,undefined,.96);
      index++;
    }
    angle+=bay/Math.hypot(rx*Math.cos(angle),rz*Math.sin(angle));
  }
}
set('boathouse',211,74,-.12,1.59,1.87);objects.at(-1)!.stretch=[1.39,.83,.72];
set('sailboat',200,93,.44,.04,1.24);set('sailboat',215,97,-.4,.04,1.12);
set('sailboat',205,101,1.9,.04,.77);set('parasol',224.1,97,.3,1.75);set('parasol',217.9,108.9,0,1.75);
set('palm',196,77,-.2,undefined,1.2);set('palm',185,83,.85);set('palm',218,76,.42);
set('village-cart',184.7,151.5,.18,undefined,1.38);
export const cottagePlots=[
  {id:'cottage-teal',x:103,z:147.7,yaw:.23,scale:1.9,stretch:[1.22,.96,.86]},
  {id:'cottage-moss',x:123,z:133.3,yaw:-.13,scale:1.86,stretch:[1.21,.99,.88]},
  {id:'cottage-clay-annex',x:151.8,z:138.4,yaw:.12,scale:1.82,stretch:[1.12,1.02,.87]},
  {id:'cottage-clay',x:176,z:127.7,yaw:-.29,scale:1.72,stretch:[1.06,.93,.89]},
] as const satisfies readonly Placement[];

export function cottageLocation(plot:typeof cottagePlots[number],side:number,front:number):[number,number] {
  const sin=Math.sin(plot.yaw),cos=Math.cos(plot.yaw);
  return [plot.x+side*cos+front*sin,plot.z-side*sin+front*cos];
}
function blocksCottageEntrance(x:number,z:number) {
  return cottagePlots.some(plot=>{
    if(plot.id==='cottage-clay-annex'){
      const lateral=(x-plot.x)*Math.cos(plot.yaw)-(z-plot.z)*Math.sin(plot.yaw);
      const forward=(x-plot.x)*Math.sin(plot.yaw)+(z-plot.z)*Math.cos(plot.yaw);
      if(Math.abs(lateral)<8.9&&forward>3.9&&forward<16.1)return true;
    }
    const [px,pz]=cottageLocation(plot,0,6.7);
    return Math.hypot(x-px,(z-pz)*.85)<5.4;
  });
}

function inCottageKeepout(x:number,z:number,padSide=.9,padFront=.55) {
  return cottagePlots.some(plot=>{
    const [w,d]=ASSETS[plot.id].size;
    const halfW=w*plot.scale*plot.stretch[0]*.5+padSide;
    const halfD=d*plot.scale*plot.stretch[2]*.5;
    const dx=x-plot.x,dz=z-plot.z,c=Math.cos(plot.yaw),s=Math.sin(plot.yaw);
    const localSide=dx*c-dz*s, localFront=dx*s+dz*c;
    return Math.abs(localSide)<halfW && localFront>-halfD-padSide && localFront<halfD+padFront+1.35;
  });
}
function inRotatedBox(x:number,z:number,r:number,bx:number,bz:number,hw:number,hd:number,yaw:number) {
  const dx=x-bx, dz=z-bz, c=Math.cos(yaw), s=Math.sin(yaw);
  return Math.abs(dx*c-dz*s)<hw+r && Math.abs(dx*s+dz*c)<hd+r;
}
function inStructureKeepout(x:number,z:number,r:number,checkObjects=true) {
  if(Math.hypot(x-52,z-82)<6.70+r) return true; // gazebo stone platform & steps
  if(Math.hypot(x-184,z-32.5)<10.2+r) return true; // observatory plinth
  if(Math.hypot(x-200,z-38.3)<3.25+r) return true; // orrery steps
  if(Math.hypot(x-145.9,z-52.8)<6.8+r) return true; // waterfall cascades
  if(Math.hypot(x-121,z-88)<11.0+r) return true; // plaza fountain rim
  for(const side of [-1,1]) if(Math.hypot(x-(31+side*3.41*Math.cos(.16)),z-(96-side*3.41*Math.sin(.16)))<1.15+r) return true;
  if(inCottageKeepout(x,z,.55,.55)) return true;
  for(const tm of Object.values(TRIAL_MODELS)){
    if((tm as {above?:string}).above) continue;
    const rad=tm.source.startsWith('npc_done/') ? .80 : tm.metres*.52;
    if(Math.hypot(x-tm.x,z-tm.z)<rad+r+.28) return true;
  }
  if(!checkObjects) return false;
  return objects.some(o=>{
    const spec:Asset=ASSETS[o.id];
    const [w,d]=spec.size, st=o.stretch??[1,1,1], sc=o.scale??1;
    if(o.id==='boathouse'||o.id==='market-coral'||o.id==='market-salmon'||o.id==='village-cart'||o.id==='market-stall'||o.id==='market-cart'||o.id==='market-sign')
      return inRotatedBox(x,z,r+.28,o.x,o.z,w*st[0]*sc*.5,d*st[2]*sc*.5,o.yaw);
    if(o.id==='plaza-railing'||o.id==='summit-rail')
      return inRotatedBox(x,z,r+.50,o.x,o.z,w*st[0]*sc*.5,.22,o.yaw);
    if(o.id==='village-fence')
      return inRotatedBox(x,z,r+.22,o.x,o.z,w*st[0]*sc*.5,.22,o.yaw);
    return false;
  });
}
function fenceClear(x:number,z:number,r:number) {
  return !objects.some(o=>{
    if(o.id!=='village-fence') return false;
    return inRotatedBox(x,z,r,o.x,o.z,1.30*(o.stretch?.[0]??1)*(o.scale??1),0.22,o.yaw);
  });
}
function rockyClear(x:number,z:number,r:number) {
  return !objects.some(o=>{
    if(o.id!=='shore-rock'&&o.id!=='cliff-rock') return false;
    const [w,d]=ASSETS[o.id].size, st=o.stretch??[1,1,1], sc=o.scale??1;
    return inRotatedBox(x,z,r+.22,o.x,o.z,w*st[0]*sc*.5,d*st[2]*sc*.5,o.yaw);
  });
}
function onPavedOrBare(x:number,z:number) {
  const tr=terrain(x,z,true);
  if(tr.sand>.45) return true;
  if(x>199&&x<205&&z>20&&z<32) return false; // approved summit-east grassy terrace pocket
  if(tr.stone>.50||tr.rock>.78) return true;
  return false;
}
// Runtime placementFits destinations for shifted trees so plants never clip moved trunks.
const fitTreeDestinations: readonly [number,number,number][]=[
  [113.8,126,.86],[100.9,131.2,1.05],[143.9,109.1,.84],[160.1,83.5,1.08],
  [77.85,100.41,1],[101.8,123.6,1.72],[187.37,140.63,1],[195.8,78.2,1.05],[204.2,62.2,1],
];
function trunkClear(x:number,z:number,rad:number) {
  if(fitTreeDestinations.some(([tx,tz,sc])=>Math.hypot(tx-x,tz-z)<(.42*sc+rad+.42))) return false;
  return !objects.some(o=>(ASSETS[o.id] as Asset).collision==='trunk'&&Math.hypot(o.x-x,o.z-z)<(.42*(o.scale??1)+rad+.42));
}
function plantClear(id:AssetId,x:number,z:number) {
  const rad=id==='shrub'?.66:id==='hydrangea'?.56:.44;
  if(onPavedOrBare(x,z) || inStructureKeepout(x,z,rad) || !fenceClear(x,z,rad) || !rockyClear(x,z,rad) || !trunkClear(x,z,rad)) return false;
  return !objects.some(o=>{
    const d=Math.hypot(o.x-x,o.z-z), sc=o.scale??1;
    if(o.id==='lamp'||o.id==='flower-pot'||o.id==='bench'||o.id==='flower-bed') return d<(id==='shrub'?1.28:.95);
    if(o.id==='shrub') return d<(id==='shrub'?1.42:1.18);
    if(o.id==='lavender'||o.id==='hydrangea'||o.id==='daisy') {
      const orad=o.id==='hydrangea'?.56*sc:.44*sc;
      return d<(rad+orad+.06);
    }
    return false;
  });
}
function addFenceSegment(plot:typeof cottagePlots[number],s0:number,f0:number,s1:number,f1:number) {
  const ds=s1-s0, df=f1-f0, len=Math.hypot(ds,df);
  const [x0,z0]=cottageLocation(plot,s0,f0), [x1,z1]=cottageLocation(plot,s1,f1);
  const mx=.5*(x0+x1), mz=.5*(z0+z1);
  for(const [px,pz] of [[x0,z0],[mx,mz],[x1,z1]]){
    const road=nearestTrail(px,pz);
    if(shore(px,pz)<1.85 || road.distance<road.trail.width*.5+.02) return false;
  }
  const yaw=plot.yaw+Math.atan2(-df,ds);
  // Village fence panel posts are centered ~2.30m apart at scale 1; stretch X only so post height stays uniform.
  set('village-fence',mx,mz,yaw,undefined,1);
  objects.at(-1)!.stretch=[len/2.30,1,1];
  return true;
}

set('bench',146.8,153.2,.35);set('bench',164.3,152.4,-.16);
for(const [x,z] of [[143.2,144.8],[176,144],[188,153],[157,159],[122.4,154.0],[99.8,158.8],[168.4,82.0],[155.4,78.8],[86,75],[94,98],[53.0,115.0],[29,136]]) set('lamp',x,z,0,undefined,.84);

for(const [yard,plot] of cottagePlots.entries()){
  objects.push(plot);
  const [width,depth]=ASSETS[plot.id].size;
  const gate=depth*plot.scale*plot.stretch[2]*.5;
  const wing=width*plot.scale*plot.stretch[0]*.5;
  const fFront=gate+1.32, sGate=2.55, sElbow=Math.min(wing-.70,4.68), sSide=wing+.58, fElbow=gate+.32, fBack=gate-2.05;
  const stepHalfW=.74*plot.scale*plot.stretch[0];
  for(const side of [-1,1]){
    const okFront=addFenceSegment(plot,side*sGate,fFront,side*sElbow,fFront);
    const okCorner=okFront && addFenceSegment(plot,side*sElbow,fFront,side*sSide,fElbow);
    if(okCorner) addFenceSegment(plot,side*sSide,fElbow,side*sSide,fBack);
    // Flanking porch flower-pots & tidy two-tier garden border tucked cleanly inside the fence line.
    const [pxDoor,pzDoor]=cottageLocation(plot,side*(stepHalfW+.44),gate+.68);
    if(shore(pxDoor,pzDoor)>2.0 && nearestTrail(pxDoor,pzDoor).distance>1.75 && fenceClear(pxDoor,pzDoor,.45))
      set('flower-pot',pxDoor,pzDoor,plot.yaw+side*.20,undefined,1.12);
    const [pxGate,pzGate]=cottageLocation(plot,side*1.52,gate+1.46);
    if(shore(pxGate,pzGate)>2.0 && nearestTrail(pxGate,pzGate).distance>1.75 && fenceClear(pxGate,pzGate,.45) && Math.hypot(pxGate-pxDoor,pzGate-pzDoor)>.80)
      set('flower-pot',pxGate,pzGate,plot.yaw-side*.15,undefined,1.04);
    const bedCols=Math.max(2,Math.floor((sElbow-2.80)/1.04));
    for(let c=0;c<bedCols;c++){
      const latBack=side*(3.04+c*1.04);
      const [bx,bz]=cottageLocation(plot,latBack,gate+.50);
      const bId:AssetId=(c+yard+(side>0?1:0))%2===0?'hydrangea':'lavender';
      if(shore(bx,bz)>2.0 && nearestTrail(bx,bz).distance>1.75 && fenceClear(bx,bz,.55) && plantClear(bId,bx,bz))
        set(bId,bx,bz,plot.yaw+c*.6,undefined,.78+((c+yard)%3)*.06);
      const latFront=side*(3.48+c*1.00);
      if(Math.abs(latFront)<sElbow-.12){
        const [fx,fz]=cottageLocation(plot,latFront,gate+.72);
        if(shore(fx,fz)>2.0 && nearestTrail(fx,fz).distance>1.75 && fenceClear(fx,fz,.55) && plantClear('daisy',fx,fz))
          set('daisy',fx,fz,plot.yaw-c*.5,undefined,.80+((c+yard)%2)*.08);
      }
    }
    // Single coastal accent shrub cleanly outside outer side fence corner, well clear of trails & walls.
    const [sx,sz]=cottageLocation(plot,side*(sSide+1.05),gate-.75);
    if(shore(sx,sz)>2.2 && nearestTrail(sx,sz).distance>2.1 && plantClear('shrub',sx,sz) &&
       !objects.some(o=>(o.id==='pine'||o.id==='green-tree'||o.id==='pink-tree'||o.id==='gold-tree')&&Math.hypot(o.x-sx,o.z-sz)<2.1))
      set('shrub',sx,sz,plot.yaw+side*.5,undefined,.92);
  }
}
// Flower bands follow contour and walkway with non-overlapping botanical spacing.
const flowerBands: [AssetId,number,number,number,number,number][]=[
  ['lavender',29,88,12,2.8,.29],['hydrangea',29,99,11,2.7,.26],['daisy',40,85,13,2.4,-.32],
  ['lavender',50,91,9,2.15,.55],['hydrangea',51,99,10,2.5,-.68],['daisy',35,108,10,2.85,-.25],
  ['hydrangea',38,113,9,2,.35],['lavender',58.5,72.5,9,2.2,.46],['daisy',54.2,92.2,8,1.8,.22],
  ['daisy',163.8,48.0,4.5,1.1,.72],['hydrangea',202.8,28.8,5.0,.9,1.25],['daisy',200.5,22.8,5.2,1.1,.68],
  ['daisy',199,82,7,2.05,.16],['hydrangea',197.5,73.5,6.5,1.8,.65],
  ['lavender',139,151.5,7,1.5,.28],['hydrangea',162,151.5,8,1.5,-.32],['daisy',186,154.5,7,1.4,-.40],
  ['hydrangea',107,151.5,8,1.6,.30],['lavender',127,150.5,8,1.6,.12],['daisy',168,147.5,7,1.5,-.18],['daisy',171,156.2,8,1.8,.22],
];
for(const [id,x,z,length,width,yaw] of flowerBands){
  const nBand=Math.max(3,Math.round(length*1.25));
  for(let i=0;i<nBand;i++) {
    const t=(i/(nBand-1)-.5)*length,u=Math.sin(i*2.395)*width*.45;
    const px=x+t*Math.cos(yaw)+u*Math.sin(yaw),pz=z+t*Math.sin(yaw)-u*Math.cos(yaw);
    if(nearestTrail(px,pz).distance>2.05 && shore(px,pz)>2 && Math.hypot(px-121,pz-88)>16.75 && plantClear(id,px,pz))
      set(id,px,pz,i*.68,undefined,.86+(i%5)*.09);
  }
}
for(const [x,z,scale] of [[97,119,1.16],[108,123,1.02],[116,119,1.31],[136,114,1.18],[89,151,1.16],
  [135.9,137.4,1.34],[141.7,130,1.78],[146.1,136,1.33],[173.5,119.5,1.38],[181,123.8,1.44],[182.7,130,1.12],
  [147,40,1.1],[151,43,.93],[159,45,1.14],[168,32,1.09],[120,33,.97]]) set('pine',x,z,x*.3,undefined,scale);
for(const [id,x,z,yaw,scale] of [
  ['green-tree',92,145,-.32,2.08],['pink-tree',103,123,.57,1.92],['gold-tree',126.1,122.1,-.81,1.69],
  ['green-tree',164.6,130.5,.86,2.03],['pink-tree',180.6,137.8,.36,1.18],['green-tree',200.5,149.6,-.46,1.13],
] as const)if(nearestTrail(x,z).distance>2.7&&shore(x,z)>2.8)set(id,x,z,yaw,undefined,scale);
const rockShelves: { ledge:readonly (readonly [number,number])[]; rise:number; width:number }[]=[
  { ledge:[[139,42],[145,40],[151,39.3],[157,40],[162,40.2],[166,42.9]],rise:2.8,width:6.6 },
  { ledge:[[139,49],[144,48],[153,48.8],[158,49.7],[163,51.2],[166,54.9]],rise:3.5,width:7.2 },
  { ledge:[[138,55],[143,56],[150,58],[155,59.2],[161,61],[165,63]],rise:2.65,width:7.0 },
  { ledge:[[176.7,53],[181.5,55.4],[186.6,56.7],[191.5,56.8],[196.1,54.9],[201,51.4],[205.5,46],[208,40.8]],rise:4.1,width:7.7 },
  { ledge:[[178,59.4],[183.5,61.8],[189.3,62.1],[194.7,61.0],[200,58.1],[205.8,54.5],[210,47],[213,42]],rise:2.9,width:8.1 },
];
const pendingShelfFlora: { id:AssetId; x:number; z:number; yaw:number; scale:number }[]=[];
for(const {ledge,rise,width} of rockShelves) for(const [i,[x,z]] of ledge.entries()){
  if(nearestTrail(x,z).distance<4.8 || Math.hypot((x-145.5)*1.12,z-53)<5.8)continue;
  const next=ledge[Math.min(ledge.length-1,i+1)],before=ledge[Math.max(0,i-1)];
  const yaw=Math.atan2(before[1]-next[1],next[0]-before[0]);
  const height=terrain(x,z).y;
  set('cliff-rock',x,z,yaw+Math.sin(i*2.9)*.13,height-rise*.31,1);
  objects.at(-1)!.stretch=[width/4.5,rise/3.4,.98+(i%3)*.23];
  if(i%2===0){
    const reach=.58*width+.95, perpX=-Math.sin(yaw), perpZ=Math.cos(yaw);
    const [sx,sz]=x===150&&z===58?[153.6,55.2]:[x-perpX*reach*.55-1.1,z-perpZ*reach*.55-1.6];
    pendingShelfFlora.push({id:'shrub',x:sx,z:sz,yaw,scale:1.27});
    pendingShelfFlora.push({id:'daisy',x:x+1.42*1.75,z:z-.82*2.2,yaw:-yaw,scale:1.36});
  }
}
for(const [x,z] of [[102,35],[118,39],[133,36],[75,76],[61,74],[25,71],[22,104],[30,116],[38,131],[84,109],
  [93,111],[106,114],[124,120],[138,111],[145,95],[160,93],[173,72],[188,72],[192,155],[201,145],[185,131],[167,129],[93,163]]){
  for(let i=0;i<7;i++){
    const angle=i*2.399+x*.21,r=1.5+Math.sqrt(i)*2.1;
    const px=x+Math.sin(angle)*r,pz=z+Math.cos(angle)*r;
    if(shore(px,pz)<3.5||nearestTrail(px,pz).distance<2.9||blocksCottageEntrance(px,pz)||
      Math.hypot(px-52,pz-82)<9.0||Math.hypot(px-145.9,pz-52.8)<8.5||
      objects.some(p=>{
        const profile:Asset=ASSETS[p.id];
        if(profile.collision==='trunk') return Math.hypot(p.x-px,p.z-pz)<((p.scale??1)>1.3?3.4:1.85);
        if(profile.collision==='box'){
          const st=p.stretch??[1,1,1], sc=p.scale??1;
          return inRotatedBox(px,pz,1.95,p.x,p.z,profile.size[0]*st[0]*sc*.5,profile.size[1]*st[2]*sc*.5,p.yaw);
        }
        return Math.hypot(p.x-px,p.z-pz)<1.85;
      }))continue;
    set((i+Math.round(z))%6===1?'pink-tree':i%3===1?'gold-tree':z>122 && i%4!==0?'pine':'green-tree',
      px,pz,angle,undefined,.69+(i%5)*.15);
  }
}
for(const {id,x,z,yaw,scale} of pendingShelfFlora){
  if(shore(x,z)>2.2 && nearestTrail(x,z).distance>2.35 && terrain(x,z,true).rock<.80 && plantClear(id,x,z))
    set(id,x,z,yaw,undefined,scale);
}
// Ground cover forms dense borders around the groves and exposed paths.
const groveUnderstorey=[[28,76],[40,108],[32,120],[64,77],[77,85],[88,79],[96,90],[94,115],[102,121],[116,123],
  [128,122],[144,104],[146,82],[160,84],[175,72],[181,80],[200,68],[119,152],[139,161],[155,163],[187,151],[194,155]];
for(const [x,z] of groveUnderstorey) for(let i=0;i<19;i++){
  const angle=i*2.399+x*.35,r=.26+Math.sqrt(i)*1.28;
  const px=x+Math.cos(angle)*r,pz=z+Math.sin(angle)*r*.65;
  if(shore(px,pz)<2.2 || nearestTrail(px,pz).distance<2.5||Math.hypot(px-121,pz-88)<21||inCottageKeepout(px,pz))continue;
  const id=i%7<3?'shrub':i%3===0?'lavender':i%3===1?'daisy':'hydrangea';
  if(!plantClear(id,px,pz)) continue;
  set(id,px,pz,angle,undefined,.83+(i%6)*.12);
}
const rockSiteClear=(rx:number,rz:number,pad:number)=>!inStructureKeepout(rx,rz,pad,true)&&
  Math.hypot(rx-100.9,rz-131.2)>pad+1.1&&
  !objects.some(o=>{
    if((ASSETS[o.id] as Asset).collision==='trunk') return Math.hypot(o.x-rx,o.z-rz)<pad+.95;
    if(o.id==='shrub'||o.id==='lavender'||o.id==='hydrangea'||o.id==='daisy') return Math.hypot(o.x-rx,o.z-rz)<pad+.65;
    return false;
  });
for(const coast of COASTS)for(const [i,a] of coast.entries()) {
  const b=coast[(i+1)%coast.length], dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
  const count=Math.max(1,Math.round(len/4.2));
  for(let j=0;j<count;j++){
    const f=(j+.5)/count,inset=.48+.4*Math.cos(i*.63+j*2.39);
    const x=a[0]+dx*f-dz/len*inset,z=a[1]+dz*f+dx/len*inset;
    const profile=terrain(x,z);
    const nearBeach=profile.beach>.65;
    if(nearestTrail(x,z).distance<4.5 || (i*3+j)%7===4 || nearBeach&&(i+j)%4!==0)continue;
    const y=Math.max(-.33,profile.y-.14);
    const size=nearBeach?.82+((i+j)%3)*.16:1.16+((i*11+j*7)%8)*.19;
    if(!rockSiteClear(x,z,size*1.18)) continue;
    const bearing=-Math.atan2(dz,dx);
    set('shore-rock',x,z,bearing+.35*Math.sin(i*.7+j),y,size);
    if((i+j)%4===0 && size>1.04) {
      const bankX=x-dz/len*1.12,bankZ=z+dx/len*1.12;
      if(rockSiteClear(bankX,bankZ,size*1.06)){
        set('shore-rock',bankX,bankZ,bearing-.37,terrain(bankX,bankZ).y-.23,size*.90);
        const reach=1.25+size*1.08, flX=bankX-dz/len*reach, flZ=bankZ+dx/len*reach, flId=i%3===0?'hydrangea':'daisy';
        if(terrain(flX,flZ).y>=0.70 && nearestTrail(flX,flZ).distance>2.2 && plantClear(flId,flX,flZ)) set(flId,flX,flZ,i*.37,undefined,.97);
      }
    }
    if(!nearBeach&&(i*7+j*3)%11<3 && nearestTrail(x,z).distance>6.4){
      const rx=x-dz/len*.9,rz=z+dx/len*.9;
      if(rockSiteClear(rx,rz,size*1.75)){
        set('shore-rock',rx,rz,bearing+.52,y-.19,size*1.41);
        objects.at(-1)!.stretch=[1.30,1.51,1.22];
      }
    }
  }
}
// Prune any earlier-authored flora that landed on a rock, tree trunk, or blocked surface added later.
for(let k=objects.length-1;k>=0;k--){
  const o=objects[k];
  if(o.id!=='shrub'&&o.id!=='lavender'&&o.id!=='hydrangea'&&o.id!=='daisy') continue;
  const rad=o.id==='shrub'?.66:o.id==='hydrangea'?.56:.44;
  if(!rockyClear(o.x,o.z,rad)||onPavedOrBare(o.x,o.z)||!trunkClear(o.x,o.z,rad))
    objects.splice(k,1);
}

let seed=20261123;
export const authoredObjectCount=objects.length;
function random() { seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32; }
// Keep open patches between groves; navigation corridors have clearance on both sides.
for(let i=0;i<1240;i++) {
  const x=12+random()*211,z=14+random()*162,edge=shore(x,z);
  if(edge<1.35 || nearestTrail(x,z).distance<3.45 || inCottageKeepout(x,z) ||
      objects.some(o=>Math.hypot(x-o.x,z-o.z)<(ASSETS[o.id].size[0]/2+1.05)*(o.scale??1))) continue;
  const h=terrain(x,z).y;
  const r=random(), asset = edge < 2.55 ? 'shore-rock' : h>6 && edge<13 ? 'cliff-rock'
    : r<.1 ? z>128?'pine':x>170 && z>66?'palm':'green-tree'
    : r<.16 ? 'pink-tree' : r<.22 ? 'gold-tree' : r<.32 ? 'shrub' : r<.51 ? 'lavender' : r<.73 ? 'hydrangea' : 'daisy';
  const scale=.62+random()*.55;
  if (h>10 && ['pink-tree','gold-tree','green-tree','pine','palm'].includes(asset)) continue;
  if (['shrub','lavender','hydrangea','daisy'].includes(asset)) {
    if (h<0.65 || !plantClear(asset,x,z)) continue;
  } else if (asset==='shore-rock'||asset==='cliff-rock') {
    if (!rockSiteClear(x,z,2.5*scale)) continue;
  } else {
    if ((z>158&&x>99&&x<197)||blocksCottageEntrance(x,z)||inStructureKeepout(x,z,2.6*scale,true)||
        nearestTrail(x,z).distance<3.6||objects.some(o=>(ASSETS[o.id] as Asset).collision==='trunk'&&Math.hypot(o.x-x,o.z-z)<3.4)) continue;
  }
  if (Math.hypot(x-121,z-88)<19 || Math.hypot(x-65,z-47)<18 || ((x-183)/21.1)**2+((z-36)/15.6)**2<1.05) continue;
  set(asset,x,z,random()*6.28,undefined,scale);
}
