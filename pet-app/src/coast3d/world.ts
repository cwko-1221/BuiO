import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ASSETS, authoredObjectCount, cottageLocation, cottagePlots, fountainPlacement, moonPlacement, objects, type Asset, type AssetId, type Placement } from './assets';
import { detectDeviceTier } from './device';
import { createFountainWater } from './fountain-water';
import { createNpcWanderSystem } from './npc-wander';
import { createSkyDome } from './sky';
import { createWaterfallWater } from './waterfall-water';
import { WIDTH, DEPTH, CHUNK, STAIR_LANDING_RADIUS, trails, terrain, nodes, staircase, stairLevels, shore, trailHeight, nearestTrail } from './island';
import { makeModel } from './models';
import { createTerrain, createScarps, createWater, deckGeometry, deckMiter, dockEdge, groundMaterials, type ArtMaterials } from './terrain';
import type { TrialModel } from './trial-models';

export type IslandCollider = { x:number; y:number; z:number; w:number; h:number; d:number; yaw:number; shape?:'round'; walkable?:boolean; noCamera?:boolean; dynamic?:string };
export type Appearance = { model: T.Object3D; official:boolean; preview?:boolean };
export const CLUTTER_LAYER = 1;
export const REFLECT_LAYER = 2;
const officialGlbUrls=import.meta.glob<string>('./models/*.glb',{eager:true,query:'?url',import:'default'});
export const OFFICIAL_ASSET_IDS: ReadonlySet<AssetId> = new Set(
  Object.keys(officialGlbUrls).map(file=>file.slice('./models/'.length,-4) as AssetId)
);
type Vegetation = { near:T.Vector3; radiusSq:number; chunk:T.InstancedMesh; home:T.Matrix4; instance:number; fadeMaterial:T.Material|T.Material[] };
type OfficialPart = { geometry:T.BufferGeometry; material:T.Material|T.Material[]; canopy:boolean; fadeMaterial?:T.Material|T.Material[]; localCenter:T.Vector3; radius:number };
const yaxis=new T.Vector3(0,1,0), dynamicMatrix=new T.Matrix4();
const landmarkAssets = new Set<AssetId>([
  'crescent','fountain','observatory','waterfall','west-bridge','east-bridge',
]);
const skylineAssets = new Set<AssetId>([
  'pine','green-tree','gold-tree','pink-tree','palm','cliff-rock','shore-rock','parasol',
  'dock-deck','dock-post','west-post','east-post','west-rail','east-rail','market-stall',
  'market-cart','village-cart','lamp','plaza-steps','summit-steps',
  'market-coral','market-salmon','market-canopy','gazebo','flower-arch','orrery','boathouse','sailboat',
  'cottage-moss','cottage-clay','cottage-clay-annex','cottage-teal',
]);
const noShadowAssets = new Set<AssetId>([
  'daisy','lavender','hydrangea','shrub','flower-pot','flower-bed',
  'plaza-steps','summit-steps','dock-deck','dock-rope','west-rail','east-rail',
]);
const coarseNoShadowAssets = new Set<AssetId>([
  'shore-rock','plaza-railing','summit-rail','dock-post','market-sign','west-post','east-post',
]);
const clutterAssets = new Set<AssetId>([
  'daisy','lavender','hydrangea','shrub','flower-pot','flower-bed','bench',
  'village-fence','plaza-railing','summit-rail','plaza-steps','summit-steps',
  'shore-rock','cliff-rock','dock-post','dock-rope','dock-deck',
  'east-post','west-post','east-rail','west-rail',
  'pine','green-tree','gold-tree','pink-tree','palm',
  'market-stall','market-canopy','lamp','parasol','sailboat','village-cart',
]);
const instancedOfficialAssets = new Set<AssetId>([
  'daisy','lavender','hydrangea','shrub','flower-pot','flower-bed','bench',
  'village-fence','plaza-railing','summit-rail','summit-steps','dock-post','dock-rope','dock-deck',
  'east-post','west-post','east-rail','west-rail',
  'pine','green-tree','gold-tree','pink-tree','palm','lamp','parasol','market-stall',
  'market-salmon','market-canopy','market-cart','sailboat',
  'cottage-moss','cottage-clay','cottage-clay-annex','cottage-teal',
]);
const reflectAssets = new Set<AssetId>(['crescent','fountain','observatory','waterfall']);
const secondaryPbrMaps = ['normalMap','roughnessMap','metalnessMap','aoMap','bumpMap','displacementMap'] as const;
let scratchCanvas:HTMLCanvasElement|undefined;
function resizeTextureToImageData(tex:T.Texture, maxDim:number) {
  const img=tex.image as { width?:number; height?:number }|undefined;
  const w=img?.width??0, h=img?.height??0;
  if(w<=maxDim && h<=maxDim)return;
  const scale=maxDim/Math.max(w,h), nw=Math.max(64,Math.round(w*scale)), nh=Math.max(64,Math.round(h*scale));
  const canvas=scratchCanvas??=document.createElement('canvas');
  canvas.width=nw;canvas.height=nh;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  if(ctx){
    ctx.clearRect(0,0,nw,nh);
    ctx.drawImage(img as CanvasImageSource,0,0,nw,nh);
    tex.image=ctx.getImageData(0,0,nw,nh);
    tex.needsUpdate=true;
  }
}
export function releaseTextureScratch() {
  if(scratchCanvas){scratchCanvas.width=0;scratchCanvas.height=0;scratchCanvas=undefined;}
}
export function capModelTextures(root:T.Object3D, maxDim:number, stripSecondary=false) {
  const seen=new Set<T.Texture>();
  root.traverse(node=>{
    if(!(node instanceof T.Mesh))return;
    for(const mat of Array.isArray(node.material)?node.material:[node.material]){
      if(!mat)continue;
      if(stripSecondary){
        const std=mat as T.MeshStandardMaterial;
        for(const key of secondaryPbrMaps){
          const map=std[key] as T.Texture|null|undefined;
          if(!map)continue;
          if(key==='metalnessMap' && typeof std.metalness==='number' && std.metalness>.35)std.metalness=.15;
          if(key==='roughnessMap' && typeof std.roughness==='number' && std.roughness<.45)std.roughness=.85;
          map.dispose();
          (std as unknown as Record<string,unknown>)[key]=null;
          mat.needsUpdate=true;
        }
      }
      for(const val of Object.values(mat)){
        if(!(val instanceof T.Texture)||seen.has(val))continue;
        seen.add(val);
        resizeTextureToImageData(val,maxDim);
      }
    }
  });
}
export function capArtTextures(art:ArtMaterials, maxDim:number) {
  for(const tex of Object.values(art))if(tex)resizeTextureToImageData(tex,maxDim);
}

function plazaStonework(boxes:IslandCollider[], plants:Placement[], phoneDevice=false) {
  const stonework=new T.Group();
  const color=new T.MeshStandardMaterial({color:0xf2d1ae,roughness:.86});
  const blocks=new T.InstancedMesh(new T.BoxGeometry(1.02,.49,.55),color,154);
  const transform=new T.Object3D();
  let count=0;
  for(const radius of [22.6,24.65])for(let i=0;i<80;i++){
    const a=i/80*Math.PI*2;
    if(Math.abs(a-Math.PI*.5)<.153)continue;
    const x=121+Math.cos(a)*radius,z=88+Math.sin(a)*radius;
    transform.position.set(x,terrain(x,z).y-.204,z);
    transform.rotation.y=-a-Math.PI/2;
    transform.scale.set(radius*Math.PI*2/80/.99,1,1);transform.updateMatrix();
    if(count>=blocks.count)break;
    blocks.setMatrixAt(count++,transform.matrix);
  }
  blocks.count=count;blocks.receiveShadow=true;blocks.castShadow=true;
  stonework.add(blocks);
  // Low curved retaining beds flank the wide southern steps (merged by material to minimize draw calls).
  const top=new T.MeshStandardMaterial({color:0xffe4b9,roughness:.85});
  const fill=new T.MeshStandardMaterial({color:0x658444,roughness:.98,side:T.DoubleSide});
  const wallMat=new T.MeshStandardMaterial({color:0xe4b992,side:T.DoubleSide,roughness:.91});
  const soilGeos:T.BufferGeometry[]=[], lipGeos:T.BufferGeometry[]=[], wallGeos:T.BufferGeometry[]=[];
  for(const side of [-1,1]){
    const path:number[]=[], indices:number[]=[], profiles:T.Vector3[][]=[[],[]];
    const count=28;
    for(let i=0;i<=count;i++){
      const angle=side*(.31+i*.038);
      for(const [j,r] of [23.7,25.6].entries()){
        const x=121+Math.sin(angle)*r,z=88+Math.cos(angle)*r,y=terrain(x,z).y+.44;
        path.push(x,y-.04,z);profiles[j].push(new T.Vector3(x,y,z));
      }
      if(i<count)indices.push(i*2,i*2+2,i*2+1,i*2+1,i*2+2,i*2+3);
      if(i>0){
        const middle=angle-side*.019,r=24.65;
        const x=121+Math.sin(middle)*r,z=88+Math.cos(middle)*r;
        const edges=[...profiles[0].slice(-2),...profiles[1].slice(-2)];
        const bottom=Math.min(...edges.map(p=>p.y))-.61, top=Math.max(...edges.map(p=>p.y))+.14;
        const bedTop=top+1.15;
        boxes.push({x,y:(bedTop+bottom)*.5,z,w:r*.038+.083,h:bedTop-bottom,d:2.18,yaw:middle,noCamera:true});
        for(const [row,plantRadius] of [24.12,25.07].entries()) {
          if(phoneDevice && (i+row)%3!==0)continue;
          const a=middle+Math.sin(i*2.4+row)*.010;
          const px=121+Math.sin(a)*plantRadius,pz=88+Math.cos(a)*plantRadius;
          if(objects.some(o=>(ASSETS[o.id] as Asset).collision==='trunk'&&Math.hypot(o.x-px,o.z-pz)<1.25))continue;
          const inner=(profiles[0][i-1].y+profiles[0][i].y)*.5, outer=(profiles[1][i-1].y+profiles[1][i].y)*.5;
          const y=T.MathUtils.lerp(inner,outer,(plantRadius-23.7)/1.9)-.035;
          plants.push({id:(i+row)%4===0?'daisy':(i+row)%3===0?'lavender':'hydrangea',x:px,y,z:pz,yaw:i*2.4,scale:.88+((i+row)%5)*.092});
        }
      }
    }
    const soil=new T.BufferGeometry();
    soil.setAttribute('position',new T.Float32BufferAttribute(path,3));soil.setIndex(indices);soil.computeVertexNormals();
    soilGeos.push(normalizeForMerge(soil));soil.dispose();
    for(const profile of profiles){
      const lipG=new T.TubeGeometry(new T.CatmullRomCurve3(profile),44,.15,8);
      lipGeos.push(normalizeForMerge(lipG));lipG.dispose();
      const verts=profile.flatMap(p=>[p.x,p.y-.08,p.z,p.x,p.y-.52,p.z]);
      const wall=new T.BufferGeometry();wall.setAttribute('position',new T.Float32BufferAttribute(verts,3));
      wall.setIndex(indices);wall.computeVertexNormals();
      wallGeos.push(normalizeForMerge(wall));wall.dispose();
    }
    for(const i of [0,count]) {
      const points=profiles.map(row=>row[i]);
      const cap=new T.BufferGeometry();
      cap.setAttribute('position',new T.Float32BufferAttribute(points.flatMap(p=>[p.x,p.y,p.z,p.x,p.y-.52,p.z]),3));
      cap.setIndex([0,1,2,2,1,3]);cap.computeVertexNormals();
      wallGeos.push(normalizeForMerge(cap));cap.dispose();
      const endLip=new T.TubeGeometry(new T.LineCurve3(points[0],points[1]),2,.15,8);
      lipGeos.push(normalizeForMerge(endLip));endLip.dispose();
    }
  }
  const addMerged=(geos:T.BufferGeometry[],mat:T.Material,name:string,cast:boolean)=>{
    const merged=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());
    if(!merged)return;
    const m=new T.Mesh(merged,mat);m.name=name;m.castShadow=cast;m.receiveShadow=true;stonework.add(m);
  };
  addMerged(soilGeos,fill,'plaza-bed-soil',false);
  addMerged(lipGeos,top,'plaza-bed-lip',!phoneDevice);
  addMerged(wallGeos,wallMat,'plaza-bed-wall',false);
  return stonework;
}

function solidModelPart(root:T.Object3D, placement:T.Matrix4) {
  const positions:number[]=[], indices:number[]=[];
  const matrix=new T.Matrix4(), point=new T.Vector3();
  root.traverse(node=>{
    if(!(node instanceof T.Mesh))return;
    matrix.multiplyMatrices(placement,node.matrixWorld);
    const attribute=node.geometry.getAttribute('position'), index=node.geometry.index;
    const offset=positions.length/3;
    for(let i=0;i<attribute.count;i++){
      point.fromBufferAttribute(attribute,i).applyMatrix4(matrix);positions.push(point.x,point.y,point.z);
    }
    for(let i=0;i<(index?.count??attribute.count);i++)indices.push(offset+(index?index.getX(i):i));
  });
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);
  return geometry;
}

function gazeboFloor(geometry:T.BufferGeometry,x:number,z:number) {
  const vertices=geometry.getAttribute('position'), levels=new Map<number,{y:number;radius:number}>();
  for(let i=0;i<vertices.count;i++){
    const y=vertices.getY(i),key=Math.round(y*10000);
    const radius=Math.hypot(vertices.getX(i)-x,vertices.getZ(i)-z);
    levels.set(key,{y,radius:Math.max(radius,levels.get(key)?.radius??0)});
  }
  return gazeboRamp([...levels.values()].sort((a,b)=>a.y-b.y),x,z);
}

function gazeboRamp(rows:{y:number;radius:number}[],x:number,z:number) {
  const bottom=rows[0],top=rows[rows.length-1], count=64;
  const positions:number[]=[],indices:number[]=[];
  // A shallow collision bevel spans the visible stone treads. The thinner
  // individually modelled nosings otherwise catch a capsule in their seams.
  for(let i=0;i<count;i++){
    const a=i/count*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
    positions.push(x+c*(bottom.radius+.055),bottom.y-.03,z+s*(bottom.radius+.055),x+c*top.radius,top.y,z+s*top.radius);
    const j=(i+1)%count*2,k=i*2;
    indices.push(k,k+1,j,j,k+1,j+1,count*2,j+1,k+1);
  }
  positions.push(x,top.y,z);
  const ramp=new T.BufferGeometry();
  ramp.setAttribute('position',new T.Float32BufferAttribute(positions,3));ramp.setIndex(indices);
  return {ramp,steps:rows.slice(1).reverse(),x,z};
}

function islandBanners() {
  const group=new T.Group();
  const bronze=new T.MeshStandardMaterial({color:0x927547,metalness:.22,roughness:.55});
  const gilt=new T.MeshStandardMaterial({color:0xf5c871,metalness:.12,roughness:.52});
  const cloth=[0x4aacd1,0x65b2dc,0xeeb557].map(color=>new T.MeshStandardMaterial({color,side:T.DoubleSide,roughness:.84}));
  for(const [x,z,bearing] of [[106.7,73.4,.24],[135.2,74.0,-.24],[221.8,85.3,.12]]) {
    const harbor=x>200;
    const flag=new T.Group(), h=harbor?5.8:4.75;
    flag.position.set(x,harbor?1.59:terrain(x,z).y,z);flag.rotation.y=bearing;
    const pole=new T.Mesh(new T.CylinderGeometry(.054,.086,h,12),bronze);pole.position.y=h*.5;
    const foot=new T.Mesh(new T.CylinderGeometry(.19,.24,.2,12),bronze);foot.position.y=.1;
    const knob=new T.Mesh(new T.SphereGeometry(.122,12,8),gilt);knob.position.y=h+.035;
    flag.add(pole,foot,knob);
    const banners=harbor?[{color:2,base:h-.26},{color:1,base:h-1.27}]:[{color:0,base:h-.35}];
    for(const {color,base} of banners){
      const width=harbor?2.05:1.46,length=harbor?.72:1.92;
      const patch=new T.PlaneGeometry(width,length,24,8);
      const points=patch.getAttribute('position');
      for(let i=0;i<points.count;i++){
        const px=points.getX(i),py=points.getY(i),u=px/width+.5,v=py/length+.5;
        points.setXYZ(i,px+width*.5+.11,py+(harbor?.30*u*Math.sin(u*6.3):.35*(1-v)*Math.abs(2*u-1)),.20*u*Math.sin(u*7.8-v*1.55));
      }
      patch.computeVertexNormals();
      const banner=new T.Mesh(patch,cloth[color]);banner.position.y=base-length*.5;
      flag.add(banner);
      if(harbor)continue;
      const beam=new T.Mesh(new T.CylinderGeometry(.034,.034,width+.20,8).rotateZ(Math.PI/2),gilt);
      beam.position.set(width*.5+.11,base+.04,0);flag.add(beam);
      const emblem=new T.Mesh(new T.TorusGeometry(.24,.027,7,29,Math.PI*1.40),gilt);
      emblem.position.set(.78,base-.78,.127);emblem.rotation.z=Math.PI*.38;flag.add(emblem);
    }
    flag.traverse(node=>{if(node instanceof T.Mesh)node.castShadow=true;});
    group.add(flag);
  }
  return group;
}

function lagoonBotanics() {
  const plants=new T.Group(),leaf=new T.Shape();
  const r=.61;
  leaf.moveTo(.13,0);
  for(let i=0;i<=30;i++){
    const a=.37+i*(Math.PI*2-.74)/30;
    leaf.lineTo(Math.cos(a)*r,Math.sin(a)*r);
  }
  leaf.closePath();
  const blade=new T.ShapeGeometry(leaf).rotateX(-Math.PI/2);
  const pink=new T.SphereGeometry(.20,9,5);
  const padMat=new T.MeshStandardMaterial({color:0xffffff,roughness:.89,side:T.DoubleSide});
  const petalMat=new T.MeshStandardMaterial({color:0xffffff,roughness:.75});
  const centre=new T.SphereGeometry(.09,10,6),pollen=new T.MeshStandardMaterial({color:0xfacc69,roughness:.9});
  const padShades=[0x80ae47,0x6d9b42,0x92bd54,0x749742].map(c=>new T.Color(c));
  const petalShades=[0xef9db1,0xe588b0,0xf9b9c4].map(c=>new T.Color(c));
  const padMatrices:T.Matrix4[]=[], padColors:T.Color[]=[];
  const budMatrices:T.Matrix4[]=[];
  const petalMatrices:T.Matrix4[]=[], petalColors:T.Color[]=[];
  const pose=new T.Object3D();
  for(const [gx,gz] of [[59,124],[56,128],[67,130],[62,135],[53,136]])for(let i=0;i<6;i++){
    const a=i*2.399,rad=.56+i*.47,x=gx+Math.sin(a)*rad,z=gz+Math.cos(a)*rad;
    if(shore(x,z)>-.4)continue;
    pose.position.set(x,.046+i*.002,z);pose.rotation.set(0,a,0);pose.scale.setScalar(.57+(i%4)*.21);pose.updateMatrix();
    padMatrices.push(pose.matrix.clone());padColors.push(padShades[i%4]);
    if(i%3!==0)continue;
    pose.position.set(x,.19,z);pose.rotation.set(0,0,0);pose.scale.setScalar(1);pose.updateMatrix();
    budMatrices.push(pose.matrix.clone());
    for(let j=0;j<7;j++){
      const angle=j*Math.PI*2/7;
      pose.position.set(x+Math.sin(angle)*.12,.135,z+Math.cos(angle)*.12);
      pose.scale.set(.37,.28,.8);pose.rotation.set(.33,angle,0,'YXZ');pose.updateMatrix();
      petalMatrices.push(pose.matrix.clone());petalColors.push(petalShades[j%3]);
    }
  }
  if(padMatrices.length){
    const pads=new T.InstancedMesh(blade,padMat,padMatrices.length);
    padMatrices.forEach((m,i)=>{pads.setMatrixAt(i,m);pads.setColorAt(i,padColors[i]);});
    pads.computeBoundingSphere();plants.add(pads);
  }
  if(budMatrices.length){
    const buds=new T.InstancedMesh(centre,pollen,budMatrices.length);
    budMatrices.forEach((m,i)=>buds.setMatrixAt(i,m));
    buds.computeBoundingSphere();plants.add(buds);
  }
  if(petalMatrices.length){
    const petals=new T.InstancedMesh(pink,petalMat,petalMatrices.length);
    petalMatrices.forEach((m,i)=>{petals.setMatrixAt(i,m);petals.setColorAt(i,petalColors[i]);});
    petals.computeBoundingSphere();plants.add(petals);
  }
  return plants;
}

function cottageWalkways() {
  const geometry=new T.CylinderGeometry(.35,.41,.065,8);
  const stepsPerHouse=6;
  const stones=new T.InstancedMesh(geometry,new T.MeshStandardMaterial({color:0xe8d4b2,roughness:.93}),cottagePlots.length*stepsPerHouse);
  const pose=new T.Object3D();
  let count=0;
  for(const cottage of cottagePlots) {
    const depth=ASSETS[cottage.id].size[1]*cottage.scale*cottage.stretch[2];
    for(let i=0;i<stepsPerHouse;i++){
      const [x,z]=cottageLocation(cottage,Math.sin(i*.65)*.14,depth*.54+.74+i*.78);
      const road=nearestTrail(x,z,false);
      if(shore(x,z)<1.4 || road.distance<road.trail.width*.48+.32)break;
      pose.position.set(x,terrain(x,z).y+.014,z);
      pose.rotation.y=cottage.yaw+i*.28;
      pose.scale.set(1.06-(i%2)*.10,1,.84+(i%3)*.06);
      pose.updateMatrix();stones.setMatrixAt(count++,pose.matrix);
    }
  }
  stones.count=count;stones.receiveShadow=true;stones.castShadow=true;
  return stones;
}

export function lighting(scene:T.Scene) {
  scene.background=new T.Color(0x9ecfd1);
  scene.fog=new T.FogExp2(0xa4cfce,.0054);
  const hemi=new T.HemisphereLight(0xfff0df,0x9eb9b1,1.56);
  hemi.layers.enable(REFLECT_LAYER);
  scene.add(hemi);
  const sun=new T.DirectionalLight(0xffe3be,2.23);
  sun.layers.enable(REFLECT_LAYER);
  sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-62,right:62,top:62,bottom:-62,near:1,far:145});
  sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00035;sun.shadow.normalBias=.065;
  scene.add(sun,sun.target);
  return sun;
}
/**
 * Approved rock variants share one atlas and a single material. Batch
 * each silhouette per visibility tile without dropping the baked textures.
 */
const treeFoliageAssets = new Set<AssetId>(['pink-tree','green-tree','gold-tree','pine','palm']);
function enhanceFoliageMaterial(material:T.Material) {
  if(!(material instanceof T.MeshStandardMaterial) || material.userData.foliageEnhanced)return;
  material.userData.foliageEnhanced=true;
  material.side=T.DoubleSide;
  if(material.alphaTest>0)material.alphaTest=Math.max(material.alphaTest,.40);
  const prevCompile=material.onBeforeCompile;
  material.onBeforeCompile=(shader,renderer)=>{
    prevCompile?.(shader,renderer);
    shader.vertexShader=shader.vertexShader
      .replace('#include <common>','#include <common>\nvarying vec3 vFoliageWorld;\nvarying vec3 vFoliageN;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec4 fwPos=modelMatrix*instanceMatrix*vec4(transformed,1.);
          vFoliageN=normalize(mat3(modelMatrix)*mat3(instanceMatrix)*objectNormal);
        #else
          vec4 fwPos=modelMatrix*vec4(transformed,1.);
          vFoliageN=normalize(mat3(modelMatrix)*objectNormal);
        #endif
        vFoliageWorld=fwPos.xyz;`);
    shader.fragmentShader=shader.fragmentShader
      .replace('#include <common>','#include <common>\nvarying vec3 vFoliageWorld;\nvarying vec3 vFoliageN;')
      .replace('#include <opaque_fragment>',`
        vec3 sssSun=normalize(vec3(-.45,.78,.43));
        vec3 sssView=normalize(cameraPosition-vFoliageWorld);
        vec3 sssN=normalize(vFoliageN);
        float sssBack=pow(clamp(dot(-sssView,sssSun),0.,1.),2.6);
        float sssWrap=clamp(dot(sssN,sssSun)*.5+.5,0.,1.);
        float sssSky=clamp(sssN.y*.5+.5,0.,1.);
        vec3 sssCol=diffuseColor.rgb*vec3(1.10,1.04,.96);
        outgoingLight+=sssCol*(.10+.15*sssWrap+.07*sssSky+.32*sssBack)*vec3(1.,.94,.84);
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=>'moonbay-foliage-sss-v1';
  material.needsUpdate=true;
}
function normalizeForMerge(geometry:T.BufferGeometry) {
  const g=geometry.index?geometry.toNonIndexed():geometry.clone();
  for(const key of Object.keys(g.attributes)){
    if(key!=='position'&&key!=='normal'&&key!=='uv')g.deleteAttribute(key);
  }
  if(!g.getAttribute('normal'))g.computeVertexNormals();
  return g;
}
function officialInstanceSources(model:T.Object3D, id?:AssetId): OfficialPart[] {
  const parts:OfficialPart[]=[];
  const fadeCache=new Map<T.Material,T.Material>();
  const isTree=id!==undefined && treeFoliageAssets.has(id);
  const toFade=(m:T.Material)=>{
    let cached=fadeCache.get(m);
    if(!cached){cached=m.clone();cached.transparent=true;cached.opacity=.24;cached.depthWrite=false;fadeCache.set(m,cached);}
    return cached;
  };
  model.updateMatrixWorld(true);
  const grouped=new Map<T.Material,{canopy:boolean;geos:T.BufferGeometry[]}>();
  const multiMat:OfficialPart[]=[];
  model.traverse(node=>{
    if(!(node instanceof T.Mesh))return;
    let canopy=false;
    for(let cur:T.Object3D|null=node;cur&&cur!==model;cur=cur.parent)if(cur.name==='canopy'){canopy=true;break;}
    if(canopy && isTree){
      for(const m of Array.isArray(node.material)?node.material:[node.material])enhanceFoliageMaterial(m);
    }
    const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld);
    if(Array.isArray(node.material)){
      geometry.computeBoundingBox();
      const box=geometry.boundingBox!;
      multiMat.push({
        geometry,
        material:node.material,
        canopy,
        fadeMaterial:canopy?node.material.map(toFade):undefined,
        localCenter:box.getCenter(new T.Vector3()),
        radius:Math.max(1.4,box.getSize(new T.Vector3()).length()*.28),
      });
      return;
    }
    const bucket=grouped.get(node.material);
    if(bucket && bucket.canopy===canopy){
      bucket.geos.push(geometry);
    } else if(!bucket){
      grouped.set(node.material,{canopy,geos:[geometry]});
    } else {
      geometry.computeBoundingBox();
      const box=geometry.boundingBox!;
      multiMat.push({
        geometry,
        material:node.material,
        canopy,
        fadeMaterial:canopy?toFade(node.material):undefined,
        localCenter:box.getCenter(new T.Vector3()),
        radius:Math.max(1.4,box.getSize(new T.Vector3()).length()*.28),
      });
    }
  });
  for(const [mat,{canopy,geos}] of grouped){
    let geometry:T.BufferGeometry;
    if(geos.length===1){
      geometry=geos[0];
    } else {
      const normalized=geos.map(normalizeForMerge);
      const merged=mergeGeometries(normalized,false);
      normalized.forEach(g=>g.dispose());
      if(merged){
        geos.forEach(g=>g.dispose());
        geometry=merged;
      } else {
        for(const g of geos){
          g.computeBoundingBox();
          const box=g.boundingBox!;
          parts.push({geometry:g,material:mat,canopy,fadeMaterial:canopy?toFade(mat):undefined,localCenter:box.getCenter(new T.Vector3()),radius:Math.max(1.4,box.getSize(new T.Vector3()).length()*.28)});
        }
        continue;
      }
    }
    geometry.computeBoundingBox();
    const box=geometry.boundingBox!;
    const localCenter=box.getCenter(new T.Vector3());
    const radius=Math.max(1.4,box.getSize(new T.Vector3()).length()*.28);
    const fadeMaterial=canopy?toFade(mat):undefined;
    parts.push({geometry,material:mat,canopy,fadeMaterial,localCenter,radius});
  }
  return [...parts,...multiMat];
}

function rockInstanceSources(model:T.Object3D,id:AssetId) {
  const parts:T.Mesh[]=[];
  model.updateMatrixWorld(true);
  model.traverse(part=>{if(part instanceof T.Mesh)parts.push(part);});
  if(!parts.length || !parts.every(part=>part.name.startsWith(id+'-')))return;
  const material=parts[0].material;
  if(!(material instanceof T.MeshStandardMaterial) || parts.some(part=>part.material!==material))return;
  return parts.map(part=>({name:part.name,geometry:part.geometry.clone().applyMatrix4(part.matrixWorld),material}));
}

function shoreRockBase(p:Placement) {
  const height=p.y??terrain(p.x,p.z).y;
  if(height<=.15)return height;
  const radius=.49*(p.scale??1), shoulder=terrain(p.x,p.z).y;
  const relief=Math.max(...[[radius,0],[-radius,0],[0,radius],[0,-radius]].map(([x,z])=>
    Math.abs(terrain(p.x+x,p.z+z).y-shoulder)));
  // On sloping banks embed the foot far enough to preserve contact downhill.
  return height-Math.min(.18,relief*.37);
}

// Fit protruding bedrock tips to their actual ledges. Anchor coordinates
// remain stable for variant assignment and deterministic vegetation placement.
const cliffShelfFits: Readonly<Record<string,{x:number;z:number;bury:number;width:number;depth:number;turn:number}>>={
  '157:40':{x:158.03,z:39.92,bury:.27,width:.75,depth:.79,turn:-.16},
  '150:58':{x:152,z:57.6,bury:.39,width:.71,depth:.79,turn:.12},
  '201:51.4':{x:200.20,z:50.70,bury:.70,width:.87,depth:.72,turn:.11},
};

function rockPlacement(id:AssetId,p:Placement) {
  const originalY=p.y??terrain(p.x,p.z).y;
  const fit=id==='cliff-rock'?cliffShelfFits[p.x+':'+p.z]:undefined;
  const x=fit?.x??p.x,z=fit?.z??p.z,yaw=p.yaw+(fit?.turn??0);
  const [sx,sy,sz]=p.stretch??[1,1,1];
  const stretch:[number,number,number]=[sx*(fit?.width??1),sy,sz*(fit?.depth??1)];
  const pose={x,y:originalY-(fit?.bury??0),z,yaw,stretch};
  if(id==='shore-rock')return {...pose,y:shoreRockBase(p)};
  if(!p.stretch)return pose;
  const dx=Math.sin(yaw),dz=Math.cos(yaw),reach=1.07*stretch[2]*(p.scale??1);
  const baseExposure=pose.y-terrain(x+dx*reach,z+dz*reach).y;
  if(baseExposure<=.05)return pose;
  // Steep shelves vary by metres across one placement. Embed the exposed
  // ledges and bring their front heels into the convex hillside.
  const inset=Math.min(.82,baseExposure*.46);
  return {...pose,x:x-dx*inset,y:pose.y-Math.min(.55,baseExposure*.38),z:z-dz*inset};
}

type PlacementFit = {from:readonly [number,number];to:readonly [number,number];scale?:number};
const placementFits: Partial<Record<AssetId,readonly PlacementFit[]>>={
  'green-tree':[{from:[121.56,123.74],to:[113.8,126],scale:.86}],
  'gold-tree':[
    {from:[108.43,119.16],to:[100.9,131.2],scale:1.05},
    {from:[137.87,114.6],to:[143.9,109.1],scale:.84},
    {from:[149.07,91.01],to:[160.1,83.5],scale:1.08},
  ],
  'pink-tree':[
    {from:[87.85,114.41],to:[77.85,100.41]},
    {from:[103,123],to:[101.8,123.6],scale:1.72},
    {from:[201.37,151.63],to:[187.37,140.63]},
  ],
  'pine':[
    {from:[136,114],to:[132.5,126]},
    {from:[97,119],to:[96.2,120.2]},
    {from:[89,151],to:[88,152]},
    {from:[146.1,136],to:[140.1,135]},
    {from:[173.5,119.5],to:[177.5,118.5]},
    {from:[181,123.8],to:[188,123.8]},
    {from:[182.7,130],to:[192.5,134]},
    {from:[147,40],to:[142,35]},
    {from:[197.11,148.36],to:[201.5,155]},
    {from:[161.92,128.26],to:[165.8,138.3]},
    {from:[162.23,133.62],to:[161.2,136.6]},
    {from:[108,123],to:[108.8,123.3]},
  ],
  palm:[
    {from:[196,77],to:[195.8,78.2],scale:1.05},
    {from:[218,76],to:[204.2,62.2]},
  ],
  'market-stall':[
    {from:[96,49],to:[95,52.8]},
    {from:[91.7,42],to:[91.5,43.4]},
  ],
  'market-canopy':[{from:[52,45],to:[52,49.0]}],
  'market-cart':[
    {from:[74,55],to:[75.5,52.2]},
    {from:[86.4,56.6],to:[90.5,56.2]},
  ],
  bench:[
    {from:[102.4,86],to:[107.2,85.5]},
    {from:[104.5,94],to:[107.8,93.2]},
    {from:[105,99],to:[110.6,98]},
    {from:[34,93],to:[40,95]},
    {from:[164.3,152.4],to:[156.2,150.6]},
  ],
  'flower-bed':[
    {from:[112.6,109.5],to:[113,107.6]},
    {from:[129.4,109.5],to:[128.6,104.8]},
  ],
  lamp:[
    {from:[53,122],to:[49,121]},
    {from:[113.65,112],to:[114.28,112.1]},
    {from:[128.35,112],to:[127.72,112.1]},
  ],
};

function assignRockVariants(placements:Placement[],count:number) {
  const groups=Array.from({length:count},()=>[] as Placement[]);
  const assigned=new Map<Placement,number>();
  for(const p of placements) {
    // Favor the silhouette least recently seen in this immediate area.
    const offset=Math.abs(Math.round(19*p.x+13*p.z))%count;
    let winner=offset,best=-1;
    for(let i=0;i<count;i++) {
      const index=(offset+i)%count;
      let nearest=Infinity;
      for(const q of groups[index])nearest=Math.min(nearest,(p.x-q.x)**2+(p.z-q.z)**2);
      if(nearest>best){best=nearest;winner=index;}
    }
    groups[winner].push(p);
    assigned.set(p,winner);
  }
  return assigned;
}

function flattened(root:T.Object3D, canopy:boolean) {
  root.updateMatrixWorld(true);
  const geometries:T.BufferGeometry[]=[];
  root.traverse(child=>{
    if(!(child instanceof T.Mesh))return;
    let twig:T.Object3D|null=child;
    let leafy=false;
    while(twig && twig!==root){if(twig.name==='canopy'){leafy=true;break;}twig=twig.parent;}
    if(leafy!==canopy)return;
    const geometry=child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
    for(const attribute of Object.keys(geometry.attributes)) if(attribute!=='position' && attribute!=='normal' && attribute!=='uv') geometry.deleteAttribute(attribute);
    if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
    if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*2),2));
    const source=(Array.isArray(child.material)?child.material[0]:child.material) as T.MeshStandardMaterial;
    const color=source.color??new T.Color(0xffffff), colors=new Float32Array(geometry.getAttribute('position').count*3);
    for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
    geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    geometry.applyMatrix4(child.matrixWorld);
    geometries.push(geometry);
  });
  const merged=geometries.length ? mergeGeometries(geometries) : null;
  geometries.forEach(g=>g.dispose());
  return merged;
}

type DockPrimitive = { position:Float32Array; normal:Float32Array; uv:Float32Array|null; material:T.Material };
type DockVertex = { u:number; ly:number; s:number; nx:number; ny:number; nz:number; tx:number; ty:number };
function extractDockPrimitives(root:T.Object3D): DockPrimitive[] {
  root.updateMatrixWorld(true);
  const out:DockPrimitive[]=[], nmat=new T.Matrix3();
  root.traverse(child=>{
    if(!(child instanceof T.Mesh))return;
    const g=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();
    if(!g.getAttribute('normal'))g.computeVertexNormals();
    g.applyMatrix4(child.matrixWorld);
    nmat.getNormalMatrix(child.matrixWorld);
    const pos=g.getAttribute('position'), norm=g.getAttribute('normal'), uv=g.getAttribute('uv');
    const nArr=new Float32Array(norm.count*3), v=new T.Vector3();
    for(let i=0;i<norm.count;i++){v.fromBufferAttribute(norm,i).applyMatrix3(nmat).normalize();nArr[i*3]=v.x;nArr[i*3+1]=v.y;nArr[i*3+2]=v.z;}
    const mats=Array.isArray(child.material)?child.material:[child.material];
    const groups=g.groups.length&&mats.length>1?g.groups:[{start:0,count:pos.count,materialIndex:0}];
    for(const grp of groups){
      const count=Math.min(grp.count,pos.count-grp.start);
      if(count<=0)continue;
      const pSub=(pos.array as Float32Array).slice(grp.start*3,(grp.start+count)*3);
      const nSub=nArr.slice(grp.start*3,(grp.start+count)*3);
      const uSub=uv?(uv.array as Float32Array).slice(grp.start*2,(grp.start+count)*2):null;
      out.push({position:pSub,normal:nSub,uv:uSub,material:mats[grp.materialIndex??0]});
    }
    g.dispose();
  });
  return out;
}
function clipDockPoly(poly:DockVertex[], dist:(p:DockVertex)=>number): DockVertex[] {
  if(poly.length<3)return [];
  const res:DockVertex[]=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i], b=poly[(i+1)%poly.length], da=dist(a), db=dist(b);
    const ina=da>=-1e-5, inb=db>=-1e-5;
    if(ina)res.push(a);
    if(ina!==inb){
      const t=da/(da-db);
      res.push({u:a.u+(b.u-a.u)*t,ly:a.ly+(b.ly-a.ly)*t,s:a.s+(b.s-a.s)*t,
        nx:a.nx+(b.nx-a.nx)*t,ny:a.ny+(b.ny-a.ny)*t,nz:a.nz+(b.nz-a.nz)*t,
        tx:a.tx+(b.tx-a.tx)*t,ty:a.ty+(b.ty-a.ty)*t});
    }
  }
  return res.length>=3?res:[];
}
function pickDockWoodPrimitive(primitives:DockPrimitive[]): DockPrimitive {
  return primitives.find(prim=>{
    const {position:p,normal:n}=prim;
    for(let k=0;k<p.length;k+=9)if((n[k+1]+n[k+4]+n[k+7])/3>.96&&(p[k+1]+p[k+4]+p[k+7])/3>.312)return true;
    return false;
  })??primitives[0];
}
function plankCenterUV(prim:DockPrimitive): readonly [number,number,number,number] {
  const {position:p,normal:n,uv}=prim;
  if(!uv)return [.25,.25,.75,.75];
  for(let k=0;k<p.length;k+=9){
    const ny=(n[k+1]+n[k+4]+n[k+7])/3, py=(p[k+1]+p[k+4]+p[k+7])/3;
    if(ny<.96||py<.312)continue;
    const vi=k/3*2;
    const us=[uv[vi],uv[vi+2],uv[vi+4]], vs=[uv[vi+1],uv[vi+3],uv[vi+5]];
    const u0=Math.min(...us), u1=Math.max(...us), v0=Math.min(...vs), v1=Math.max(...vs);
    if(u1-u0<.02&&v1-v0<.02)continue;
    const cu=(us[0]+us[1]+us[2])/3, cv=(vs[0]+vs[1]+vs[2])/3;
    return [cu+(u0-cu)*.45,cv+(v0-cv)*.45,cu+(u1-cu)*.45,cv+(v1-cv)*.45];
  }
  return [.4,.4,.6,.6];
}
function appendMiterSleeper(trailIn:typeof trails[number], trailOut:typeof trails[number], nx:number, nz:number, w:number, edgeVec:readonly[number,number], prim:DockPrimitive, group:T.Group) {
  const node=trailIn.b, [ex,ez]=edgeVec, len=Math.hypot(ex,ez);
  const bx=ex/len, bz=ez/len, mx=-bz, mz=bx, hw=.052, bev=.008, top=node.y+.003, bot=node.y-.322;
  const pOut=(trailOut.a===node?trailOut.b:trailOut.a).at, od=Math.hypot(pOut[0]-node.at[0],pOut[1]-node.at[1]);
  let n2x=-(pOut[1]-node.at[1])/od, n2z=(pOut[0]-node.at[0])/od;
  if(n2x*bx+n2z*bz<0){ n2x=-n2x; n2z=-n2z; }
  const inNeg=((trailIn.a.at[0]-node.at[0])*mx+(trailIn.a.at[1]-node.at[1])*mz)<0;
  const nNeg:[number,number]=inNeg?[nx,nz]:[n2x,n2z], nPos:[number,number]=inNeg?[n2x,n2z]:[nx,nz];
  const spanLimits=(nx_:number,nz_:number,o:number): [number,number]=>{
    const dnb=nx_*bx+nz_*bz, dnm=nx_*mx+nz_*mz;
    return [(-w-o*dnm)/dnb,(w-o*dnm)/dnb];
  };
  const [uA,vA,uB,vB]=plankCenterUV(prim);
  const pos:number[]=[], norm:number[]=[], uvs:number[]=[];
  const pt=(o:number,lam:number,y:number): [number,number,number]=>[node.at[0]+lam*bx+o*mx,y,node.at[1]+lam*bz+o*mz];
  const pushTri=(a:[number,number,number],b:[number,number,number],c:[number,number,number],u0:number,v0:number,u1:number,v1:number)=>{
    const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2], vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
    let nrx=uy*vz-uz*vy, nry=uz*vx-ux*vz, nrz=ux*vy-uy*vx;
    const nl=Math.hypot(nrx,nry,nrz)||1; nrx/=nl; nry/=nl; nrz/=nl;
    pos.push(...a,...b,...c); norm.push(nrx,nry,nrz,nrx,nry,nrz,nrx,nry,nrz); uvs.push(u0,v0,u1,v0,u1,v1);
  };
  const halves: [number,number,[number,number],readonly[number,number][]][]=[
    [-hw,0,nNeg,[[-hw,bot],[0,bot],[0,top],[-hw+bev,top],[-hw,top-bev]]],
    [0,hw,nPos,[[0,bot],[hw,bot],[hw,top-bev],[hw-bev,top],[0,top]]],
  ];
  const yc=.5*(bot+top);
  for(const [oStart,oEnd,[hnx,hnz],ring] of halves){
    for(let i=0;i<ring.length;i++){
      const [o0,y0]=ring[i], [o1,y1]=ring[(i+1)%ring.length];
      if(Math.abs(o0)<1e-6&&Math.abs(o1)<1e-6)continue;
      const [l0m,l0p]=spanLimits(hnx,hnz,o0), [l1m,l1p]=spanLimits(hnx,hnz,o1);
      const a0=pt(o0,l0m,y0), a1=pt(o0,l0p,y0), b1=pt(o1,l1p,y1), b0=pt(o1,l1m,y1);
      pushTri(a0,a1,b1,uA,vA,uB,vB); pushTri(a0,b1,b0,uA,vA,uB,vB);
    }
    const oc=.5*(oStart+oEnd), [lcm,lcp]=spanLimits(hnx,hnz,oc);
    const cm=pt(oc,lcm,yc), cp=pt(oc,lcp,yc);
    for(let i=0;i<ring.length;i++){
      const [o0,y0]=ring[i], [o1,y1]=ring[(i+1)%ring.length];
      const [l0m,l0p]=spanLimits(hnx,hnz,o0), [l1m,l1p]=spanLimits(hnx,hnz,o1);
      pushTri(cm,pt(o1,l1m,y1),pt(o0,l0m,y0),uA,vA,uB,vB);
      pushTri(cp,pt(o0,l0p,y0),pt(o1,l1p,y1),uA,vA,uB,vB);
    }
  }
  const g=new T.BufferGeometry();
  g.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));
  g.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  const m=new T.Mesh(g,prim.material);m.castShadow=true;m.receiveShadow=true;group.add(m);
}
function appendMiteredDockSpan(trail:typeof trails[number], primitives:DockPrimitive[], emittedJoints:Set<object>, group:T.Group) {
  const a=trail.a.at, b=trail.b.at, {d,w,tx,tz,nx,nz,aEdge,bEdge}=deckMiter(trail,.03);
  const rx=-nx, rz=-nz, leadA=-(aEdge[0]*tx+aEdge[1]*tz), leadB=-(bEdge[0]*tx+bEdge[1]*tz);
  const sMin=Math.min(0,-Math.abs(leadA)), sMax=Math.max(d,d+Math.abs(leadB));
  const [W,D,H]=ASSETS['dock-deck'].size, halfW=W/2;
  const count=Math.max(1,Math.round((sMax-sMin)/D)), step=(sMax-sMin)/count, sz=step/D;
  for(const src of primitives){
    const outPos:number[]=[], outNorm:number[]=[], outUv:number[]=[];
    const pArr=src.position, nArr=src.normal, uArr=src.uv;
    for(let i=0;i<count;i++){
      const sCenter=sMin+(i+.5)*step;
      for(let k=0;k<pArr.length;k+=9){
        const tri:DockVertex[]=[];
        for(let c=0;c<3;c++){
          const vi=k/3+c;
          tri.push({u:pArr[k+c*3]/halfW,ly:pArr[k+c*3+1],s:sCenter+pArr[k+c*3+2]*sz,
            nx:nArr[k+c*3],ny:nArr[k+c*3+1],nz:nArr[k+c*3+2],
            tx:uArr?uArr[vi*2]:0,ty:uArr?uArr[vi*2+1]:0});
        }
        let clipped=clipDockPoly(tri,v=>v.s-v.u*leadA);
        clipped=clipDockPoly(clipped,v=>d+v.u*leadB-v.s);
        for(let t=1;t+1<clipped.length;t++){
          for(const v of [clipped[0],clipped[t],clipped[t+1]]){
            const den=Math.max(.05,d+v.u*(leadB-leadA));
            const frac=Math.min(1,Math.max(0,(v.s-v.u*leadA)/den));
            const ySurf=trail.a.y+(trail.b.y-trail.a.y)*frac;
            outPos.push(a[0]+v.u*w*rx+v.s*tx, ySurf+(v.ly-H), a[1]+v.u*w*rz+v.s*tz);
            const nl=Math.hypot(v.nx,v.ny,v.nz)||1;
            outNorm.push((v.nx*rx+v.nz*tx)/nl, v.ny/nl, (v.nx*rz+v.nz*tz)/nl);
            outUv.push(v.tx,v.ty);
          }
        }
      }
    }
    if(!outPos.length)continue;
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(outPos,3));
    geo.setAttribute('normal',new T.Float32BufferAttribute(outNorm,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(outUv,2));
    const mesh=new T.Mesh(geo,src.material);
    mesh.castShadow=true;mesh.receiveShadow=true;
    group.add(mesh);
  }
  const nextTrail=trails.find(t=>t.deck&&t!==trail&&t.surface==='wood'&&(t.a===trail.b||t.b===trail.b));
  if(nextTrail&&!emittedJoints.has(trail.b)&&primitives.length){
    emittedJoints.add(trail.b);
    appendMiterSleeper(trail,nextTrail,nx,nz,w,bEdge,pickDockWoodPrimitive(primitives),group);
  }
}
export type LoadProgress = { addTotal(n:number):void; step():void };
export function createIslandModelLoader() {
  const loader=new GLTFLoader();
  loader.register(parser=>{parser.textureLoader=new T.TextureLoader(loader.manager);return {name:'Moonbay3dEmbeddedTextures'};});
  return loader;
}
export async function officialModels(progress?:LoadProgress) {
  const loader=createIslandModelLoader();
  const entries=Object.entries(officialGlbUrls);
  progress?.addTotal(entries.length);
  const models = new Map<AssetId,Appearance>();
  await Promise.all(entries.map(async ([file,url])=>{
    const id=file.slice('./models/'.length,-4) as AssetId;
    if(!Object.hasOwn(ASSETS,id))throw Error('Unknown Moonbay model '+id);
    const {scene}=await loader.loadAsync(url);
    progress?.step();
    const bbox=new T.Box3().setFromObject(scene), measures=bbox.getSize(new T.Vector3());
    const [w,d,h]=ASSETS[id].size;
    if (Math.abs(measures.x/w-1)>.12 || Math.abs(measures.z/d-1)>.12 || Math.abs(measures.y/h-1)>.12 ||
      Math.abs(bbox.min.y)>.10 || Math.abs(bbox.min.x+bbox.max.x)>.14 || Math.abs(bbox.min.z+bbox.max.z)>.14) {
      throw Error('GLB dimensions or origin do not match the handoff: '+id);
    }
    models.set(id,{model:scene,official:true});
  }));
  return models;
}

type LowColliderBox = { cx:number; cz:number; w:number; d:number };
function extractLowColliderBox(root:T.Object3D, yMax=1.6): LowColliderBox | null {
  root.updateMatrixWorld(true);
  let minX=Infinity, maxX=-Infinity, minZ=Infinity, maxZ=-Infinity;
  const v=new T.Vector3();
  root.traverse(child=>{
    if(!(child instanceof T.Mesh))return;
    const pos=child.geometry.getAttribute('position');
    if(!pos)return;
    for(let i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i).applyMatrix4(child.matrixWorld);
      if(v.y>=-.05 && v.y<=yMax){
        if(v.x<minX)minX=v.x; if(v.x>maxX)maxX=v.x;
        if(v.z<minZ)minZ=v.z; if(v.z>maxZ)maxZ=v.z;
      }
    }
  });
  if(!Number.isFinite(minX)||maxX-minX<.05||maxZ-minZ<.05)return null;
  return {cx:(minX+maxX)*.5,cz:(minZ+maxZ)*.5,w:maxX-minX,d:maxZ-minZ};
}
type PlinthFootprint = {
  minX:number; maxX:number; minZ:number; maxZ:number;
  steps?: { minX:number; maxX:number; maxZ:number };
};
function extractPlinthFootprint(root:T.Object3D): PlinthFootprint | null {
  root.updateMatrixWorld(true);
  const xs:number[]=[], zs:number[]=[];
  const v=new T.Vector3();
  let allMinX=Infinity, allMaxX=-Infinity, allMinZ=Infinity;
  root.traverse(child=>{
    if(!(child instanceof T.Mesh))return;
    const pos=child.geometry.getAttribute('position');
    if(!pos)return;
    for(let i=0;i<pos.count;i++){
      v.fromBufferAttribute(pos,i).applyMatrix4(child.matrixWorld);
      if(v.y>=-0.03 && v.y<=0.12){
        xs.push(v.x); zs.push(v.z);
        if(v.x<allMinX)allMinX=v.x;
        if(v.x>allMaxX)allMaxX=v.x;
        if(v.z<allMinZ)allMinZ=v.z;
      }
    }
  });
  if(!xs.length || allMaxX-allMinX<.5)return null;
  const centerX=(allMinX+allMaxX)*.5, sideThreshold=(allMaxX-allMinX)*.26;
  let minX=Infinity, maxX=-Infinity, maxZ=-Infinity;
  for(let i=0;i<xs.length;i++){
    if(Math.abs(xs[i]-centerX)>sideThreshold){
      if(xs[i]<minX)minX=xs[i];
      if(xs[i]>maxX)maxX=xs[i];
      if(zs[i]>maxZ)maxZ=zs[i];
    }
  }
  if(!Number.isFinite(maxZ))return null;
  let stepMinX=Infinity, stepMaxX=-Infinity, stepMaxZ=-Infinity;
  for(let i=0;i<xs.length;i++){
    if(zs[i]>maxZ+.05){
      if(xs[i]<stepMinX)stepMinX=xs[i];
      if(xs[i]>stepMaxX)stepMaxX=xs[i];
      if(zs[i]>stepMaxZ)stepMaxZ=zs[i];
    }
  }
  const steps=Number.isFinite(stepMaxZ)&&stepMaxX-stepMinX>.3?{minX:stepMinX,maxX:stepMaxX,maxZ:stepMaxZ}:undefined;
  return {minX,maxX,minZ:allMinZ,maxZ,steps};
}
function minFootprintTerrainY(p:Placement, fp:PlinthFootprint) {
  const sc=p.scale??1, [sx,,sz]=p.stretch??[1,1,1];
  const c=Math.cos(p.yaw), s=Math.sin(p.yaw);
  let minY=Infinity;
  const sample=(lx:number,lz:number)=>{
    const wx=p.x+lx*sx*sc*c+lz*sz*sc*s;
    const wz=p.z-lx*sx*sc*s+lz*sz*sc*c;
    const ty=terrain(wx,wz).y;
    if(ty<minY)minY=ty;
  };
  for(let ix=0;ix<=4;ix++){
    const lx=fp.minX+(fp.maxX-fp.minX)*(ix/4);
    for(let iz=0;iz<=4;iz++){
      const lz=fp.minZ+(fp.maxZ-fp.minZ)*(iz/4);
      sample(lx,lz);
    }
  }
  if(fp.steps){
    for(const lx of [fp.steps.minX,(fp.steps.minX+fp.steps.maxX)*.5,fp.steps.maxX]) sample(lx,fp.steps.maxZ);
  }
  return minY;
}
function createLimestoneMasonryTexture() {
  const size=128, data=new Uint8Array(size*size*4);
  const hash=(x:number,y:number)=>{const n=Math.sin(x*127.1+y*311.7)*43758.5453;return n-Math.floor(n);};
  for(let y=0;y<size;y++) for(let x=0;x<size;x++){
    const row=y>>5, shift=(row&1)*32;
    const bx=(x+shift)&63, by=y&31;
    const colIdx=((x+shift)>>6)&1;
    const mortar=bx<2||bx>62||by<2||by>30;
    const bevel=by===2||bx===2 ? 10 : (by===30||bx===62 ? -10 : 0);
    const blockTint=(hash(colIdx+row*3.1,row*7.3)-.5)*14;
    const grain=(hash(x,y)-.5)*9;
    const baseR=220, baseG=207, baseB=184;
    const delta=mortar ? -34+grain*.4 : blockTint+bevel+grain;
    const i=(y*size+x)*4;
    data[i]=Math.max(0,Math.min(255,Math.round(baseR+delta)));
    data[i+1]=Math.max(0,Math.min(255,Math.round(baseG+delta*.96)));
    data[i+2]=Math.max(0,Math.min(255,Math.round(baseB+delta*.90)));
    data[i+3]=255;
  }
  const tex=new T.DataTexture(data,size,size,T.RGBAFormat);
  tex.colorSpace=T.SRGBColorSpace;
  tex.wrapS=tex.wrapT=T.RepeatWrapping;
  tex.magFilter=T.LinearFilter;
  tex.minFilter=T.LinearMipmapLinearFilter;
  tex.generateMipmaps=true;
  tex.needsUpdate=true;
  return tex;
}
function buildFoundationGeometry(fp:PlinthFootprint, dropLocal:number, worldScaleX:number, worldScaleY:number, worldScaleZ:number) {
  const pos:number[]=[], norm:number[]=[], uvs:number[]=[], cols:number[]=[];
  const topY=.045, botY=-dropLocal;
  const tileW=1.45, tileH=.92;
  const topCol=[1.0,.995,.985], botCol=[.72,.70,.67];
  const pushBox=(x0:number,x1:number,z0:number,z1:number)=>{
    const wWorld=(x1-x0)*worldScaleX, dWorld=(z1-z0)*worldScaleZ, hWorld=(topY-botY)*worldScaleY;
    const quad=(a:[number,number,number],b:[number,number,number],c:[number,number,number],d:[number,number,number],
      n:[number,number,number],uLen:number,vLen:number)=>{
      const u1=uLen/tileW, v1=vLen/tileH;
      const verts:[number,number,number,number,number,number[]][]=[
        [...a,0,0,botCol],[...b,u1,0,botCol],[...c,u1,v1,topCol],[...d,0,v1,topCol],
      ];
      for(const idx of [0,1,2, 0,2,3]){
        const [vx,vy,vz,uu,vv,col]=verts[idx];
        pos.push(vx,vy,vz);norm.push(...n);uvs.push(uu,vv);cols.push(...col);
      }
    };
    // +Z front, -Z back, +X right, -X left, +Y top cap (closes any open-bottom plinth lip)
    quad([x0,botY,z1],[x1,botY,z1],[x1,topY,z1],[x0,topY,z1],[0,0,1],wWorld,hWorld);
    quad([x1,botY,z0],[x0,botY,z0],[x0,topY,z0],[x1,topY,z0],[0,0,-1],wWorld,hWorld);
    quad([x1,botY,z1],[x1,botY,z0],[x1,topY,z0],[x1,topY,z1],[1,0,0],dWorld,hWorld);
    quad([x0,botY,z0],[x0,botY,z1],[x0,topY,z1],[x0,topY,z0],[-1,0,0],dWorld,hWorld);
    const capVerts:[number,number,number,number,number][]=[
      [x0,topY,z1,0,0],[x1,topY,z1,wWorld/tileW,0],[x1,topY,z0,wWorld/tileW,dWorld/tileW],[x0,topY,z0,0,dWorld/tileW],
    ];
    for(const idx of [0,1,2, 0,2,3]){
      const [vx,vy,vz,uu,vv]=capVerts[idx];
      pos.push(vx,vy,vz);norm.push(0,1,0);uvs.push(uu,vv);cols.push(...topCol);
    }
  };
  const inset=.012;
  pushBox(fp.minX+inset,fp.maxX-inset,fp.minZ+inset,fp.maxZ-inset);
  if(fp.steps){
    pushBox(fp.steps.minX+inset,fp.steps.maxX-inset,fp.maxZ-.08,fp.steps.maxZ-inset);
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));
  geo.setAttribute('normal',new T.Float32BufferAttribute(norm,3));
  geo.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  geo.setAttribute('color',new T.Float32BufferAttribute(cols,3));
  return geo;
}

export function createIsland(scene:T.Scene, approved:Map<AssetId,Appearance>, trials:TrialModel[]=[], sculpted=new Map<AssetId,Appearance>(), art:ArtMaterials={}) {
  const tier=detectDeviceTier();
  const coarseDevice=tier!=='desktop';
  const phoneDevice=tier==='phone';
  const group=new T.Group(), {textures,terrainMaterial}=groundMaterials(art);
  const reefs=objects.filter(p=>p.id==='shore-rock' && (p.y??0)<=.13 && shore(p.x,p.z)<1.3)
    .map(p=>[p.x,p.z,1.17*(p.scale??1)*(p.stretch?.[0]??1)] as const);
  const edges=new Float32Array((WIDTH+1)*(DEPTH+1));
  const pieces=createTerrain(terrainMaterial,edges), water=createWater(art.water,reefs,edges), scarps=createScarps(textures.rock);
  const sky=createSkyDome();
  sky.mesh.layers.enable(REFLECT_LAYER);
  const pool=fountainPlacement, basinSize=ASSETS.fountain.size;
  const fountain=createFountainWater(pool.x,terrain(pool.x,pool.z).y,pool.z,basinSize[0]*pool.scale,basinSize[2]*pool.scale*pool.stretch[1],{
    reflectLayer:REFLECT_LAYER,
    onReflect:(on)=>sky.setReflectMode(on),
  });
  const waterfall=createWaterfallWater();
  const moon=moonPlacement, [mw,md,mh]=ASSETS.crescent.size.map((size,i)=>size*moon.scale*moon.stretch[i]);
  const moonBounds=new T.Box3(new T.Vector3(moon.x-mw/2,moon.y,moon.z-md/2),new T.Vector3(moon.x+mw/2,moon.y+mh,moon.z+md/2));
  const boxes:IslandCollider[]=[], planterPlants:Placement[]=[], structures=scarps.map(scarp=>scarp.geometry), vegetation:Vegetation[]=[];
  const gazeboFloors:ReturnType<typeof gazeboFloor>[]=[];
  const lagoon=lagoonBotanics(), walkways=cottageWalkways(), stonework=plazaStonework(boxes,planterPlants,phoneDevice), banners=islandBanners();
  if(coarseDevice)walkways.castShadow=false;
  water.layers.set(CLUTTER_LAYER);
  lagoon.traverse(o=>{if(o instanceof T.Mesh)o.layers.set(CLUTTER_LAYER);});
  walkways.layers.set(CLUTTER_LAYER);
  stonework.traverse(o=>{if(o instanceof T.Mesh)o.layers.enable(REFLECT_LAYER);});
  banners.traverse(o=>{if(o instanceof T.Mesh)o.layers.enable(REFLECT_LAYER);});
  group.add(sky.mesh,...pieces,...scarps,water,fountain.group,stonework,lagoon,banners,walkways);
  const officialCanopies: { bounds:T.Box3; meshes:{ mesh:T.Mesh; solid:T.Material|T.Material[]; fade:T.Material|T.Material[] }[] }[]=[];
  const sharedCanopyFade=new Map<T.Material,T.Material>();
  const getCanopyFade=(m:T.Material)=>{
    let cached=sharedCanopyFade.get(m);
    if(!cached){cached=m.clone();cached.transparent=true;cached.opacity=.22;cached.depthWrite=false;sharedCanopyFade.set(m,cached);}
    return cached;
  };
  type Tile = { group:T.Group; x:number; z:number };
  const skylineTiles=new Map<string,Tile>(), detailTiles=new Map<string,Tile>();
  const tileFor=(p:Pick<Placement,'x'|'z'>, id:AssetId)=>{
    const isSky=skylineAssets.has(id) && !(coarseDevice && id==='shore-rock');
    const store=isSky?skylineTiles:detailTiles;
    const step=isSky?CHUNK*2:CHUNK;
    const x=Math.floor(p.x/step)*step,z=Math.floor(p.z/step)*step,key=(isSky?'s:':'d:')+x+':'+z;
    if(!store.has(key)){const tile=new T.Group();tile.name='objects-'+key;store.set(key,{group:tile,x:x+step*.5,z:z+step*.5});group.add(tile);}
    return store.get(key)!.group;
  };
  const fadeMaterial=new T.MeshStandardMaterial({vertexColors:true,transparent:true,opacity:.22,depthWrite:false,roughness:.9});
  const solidMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.86});
  const stoneFaces=new T.MeshStandardMaterial({vertexColors:true,roughness:.92});
  stoneFaces.onBeforeCompile=shader=>{
    shader.uniforms.stoneGrain={value:textures.rock};
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 stonePosition;')
      .replace('#include <begin_vertex>',`#include <begin_vertex>
        #ifdef USE_INSTANCING
          stonePosition=(instanceMatrix*vec4(transformed,1.)).xyz;
        #else
          stonePosition=transformed;
        #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 stonePosition; uniform sampler2D stoneGrain;')
      .replace('#include <color_fragment>',`#include <color_fragment>
        vec2 stoneUV=vec2(stonePosition.x+stonePosition.z*.65,stonePosition.y)*vec2(.46,.61);
        float mottling=texture2D(stoneGrain,stoneUV).r;
        float layer=sin(stonePosition.y*3.3+sin(stonePosition.x*.44+stonePosition.z*.29)*.87);
        diffuseColor.rgb*=.88+.30*mottling+.041*layer;`);
  };
  const board=new T.MeshStandardMaterial({map:textures.wood,color:0xf7dac1,roughness:.83,side:T.DoubleSide});
  const flagStone=new T.MeshStandardMaterial({map:textures.stone,color:0xffe1b6,roughness:.83});
  const foundationMaterial=new T.MeshStandardMaterial({map:createLimestoneMasonryTexture(),vertexColors:true,roughness:.90});
  const batch=new Map<AssetId,Placement[]>();
  const add=(p:Placement)=>{
    const list=batch.get(p.id)??[];list.push(p);batch.set(p.id,list);
  };
  for(const [index,p] of objects.entries()) {
    if(p.id==='market-sign' && !approved.has('market-sign') && trials.some(trial=>trial.id==='wooden-signpost'))continue;
    if(index>=authoredObjectCount && trials.some(({placement,size})=>
      Math.hypot(p.x-placement.x,p.z-placement.z)<Math.max(size.x,size.z)*.5+ASSETS[p.id].size[0]*(p.scale??1)*.42))continue;
    add(p);
  }
  planterPlants.forEach(add);
  for(const {id:trialId,placement,object,size} of trials){
    if(trialId==='wooden-signpost' && approved.has('market-sign'))continue;
    object.traverse(child=>{if(child instanceof T.Mesh){child.layers.set(CLUTTER_LAYER);if(coarseDevice && size.y<=1.45)child.castShadow=false;}});
    group.add(object);
    const {x,z,yaw,collider}=placement;
    if(!collider)continue;
    const actor=placement.source.startsWith('npc_done/');
    const h=size.y;
    const w=size.x*(actor ? .92 : .96),d=size.z*(actor ? .90 : .96);
    const shape=collider==='round'?'round':undefined;
    const walkable=trialId==='stone-platform';
    const bh=walkable ? h : (trialId==='stone-fountain' ? Math.max(h,2.8) : Math.max(h,1.9));
    boxes.push({x,z,y:object.position.y+bh/2,yaw,w,h:bh,d,shape,walkable,noCamera:true,dynamic:actor&&placement.wander?trialId:undefined});
  }
  const bySpan=[
    {a:'west-north',b:'west-south',c:'west-crown',id:'west-bridge',rail:'west-rail',post:'west-post'},
    {a:'east-north',b:'east-south',c:'east-crown',id:'east-bridge',rail:'east-rail',post:'east-post'},
  ] as const;
  for(const item of bySpan) {
    const a=nodes[item.a],b=nodes[item.b],c=nodes[item.c];
    const yaw=Math.atan2(b.at[0]-a.at[0],b.at[1]-a.at[1]);
    const span=Math.hypot(a.at[0]-b.at[0],a.at[1]-b.at[1]);
    // Dressed stone bridges anchor slightly below the tide line and align their
    // cornice caps directly beneath the two sloped deck halves.
    const dressed=approved.has(item.id);
    const heightScale=item.id==='west-bridge'?1.19:1.10;
    add({id:item.id,x:(a.at[0]+b.at[0])/2,z:(a.at[1]+b.at[1])/2,y:dressed?-.04:c.y-ASSETS[item.id].size[2]-.25,yaw,
      stretch:[1,dressed?heightScale:1,span/ASSETS[item.id].size[1]]});
  }
  const dockPrimitives=approved.has('dock-deck')?extractDockPrimitives(approved.get('dock-deck')!.model):null;
  const dockJoints=new Set<object>();
  for(const trail of trails.filter(t=>t.deck)) {
    const a=trail.a.at,b=trail.b.at,dx=b[0]-a[0],dz=b[1]-a[1],distance=Math.hypot(dx,dz);
    const yaw=Math.atan2(dx,dz), nx=-dz/distance,nz=dx/distance;
    const wood=trail.surface==='wood';
    const assembly=wood?null:trail.a.at[0]<90?bySpan[0]:bySpan[1];
    const shape=deckGeometry(trail,.025);structures.push(shape);
    if(wood && dockPrimitives) {
      appendMiteredDockSpan(trail,dockPrimitives,dockJoints,group);
    } else {
      const paved=new T.Mesh(shape,wood?board:flagStone);paved.receiveShadow=true;group.add(paved);
      if(wood){const edge=new T.Mesh(dockEdge(shape),board);edge.receiveShadow=true;group.add(edge);}
    }
    if(wood && dockPrimitives) {
      const {aEdge:pAEdge,bEdge:pBEdge}=deckMiter(trail,-.09);
      const skipStart=trails.some(t=>t.deck&&t.surface==='wood'&&t.b===trail.a);
      for(const side of [-1,1]) {
        const ax=a[0]+pAEdge[0]*side, az=a[1]+pAEdge[1]*side;
        const bx=b[0]+pBEdge[0]*side, bz=b[1]+pBEdge[1]*side;
        const edx=bx-ax, edz=bz-az, edgeLen=Math.hypot(edx,edz);
        const edgeYaw=Math.atan2(edx,edz), nEdge=Math.max(1,Math.round(edgeLen/2.7));
        const rise=trail.b.y-trail.a.y;
        const bayRun=Math.hypot(edgeLen,rise)/nEdge;
        for(let i=0;i<=nEdge;i++) {
          const t=i/nEdge, x=ax+edx*t, z=az+edz*t, y=trail.a.y+rise*t;
          if(!(skipStart && i===0)) add({id:'dock-post',x,z,y:y-.015,yaw:edgeYaw});
          if(i===nEdge)continue;
          const mid=t+.5/nEdge, mX=ax+edx*mid, mZ=az+edz*mid, mY=trail.a.y+rise*mid;
          add({id:'dock-rope',x:mX,z:mZ,y:mY+.49,yaw:edgeYaw-Math.PI/2,
            roll:Math.atan2(rise,edgeLen),stretch:[bayRun/ASSETS['dock-rope'].size[0],1,1]});
          boxes.push({x:mX,y:mY+.92,z:mZ,w:.22,h:1.84,d:edgeLen/nEdge+.12,yaw:edgeYaw,noCamera:true});
        }
      }
      continue;
    }
    const n=Math.ceil(distance/(wood?2.7:2.45));
    for (const side of [-1,1]) {
      const offset=(trail.width/2+.105)*side;
      for(let i=0;i<=n;i++) {
        const t=i/n, x=a[0]+dx*t+nx*offset,z=a[1]+dz*t+nz*offset,y=trailHeight(trail,t);
        if(i===0 || i===n || wood) {
          const crownNode=assembly?nodes[assembly.c]:undefined;
          const dressedPost=!!assembly&&approved.has(assembly.post);
          // Two bridge grades meet at the crown. Use one terminal centered
          // between the two rail axes instead of centering a post per grade.
          if(dressedPost&&crownNode&&i===n&&trail.b===crownNode){
            const other=(trail.a===nodes[assembly.a]?nodes[assembly.b]:nodes[assembly.a]).at;
            const hdx=other[0]-b[0],hdz=other[1]-b[1],length=Math.hypot(hdx,hdz);
            add({id:assembly.post,x:b[0]+(nx-hdz/length)*offset*.5,
              z:b[1]+(nz+hdx/length)*offset*.5,y:y-.067,yaw:yaw*.5+Math.atan2(hdx,hdz)*.5});
          } else if(!(dressedPost&&crownNode&&i===0&&trail.a===crownNode)){
            add({id:assembly?.post??'dock-post',x,z,y:y-(dressedPost?.067:.1),yaw});
          }
        }
        if(i===n)continue;
        const middle=t+.5/n, mX=a[0]+dx*middle+nx*offset,mZ=a[1]+dz*middle+nz*offset,mY=trailHeight(trail,middle);
        const rail=assembly?.rail??'dock-rope';
        if((rail==='west-rail'||rail==='east-rail')&&approved.has(rail)) {
          // The sill follows the exact grade of each deck half and meets its
          // neighbour at the module joint instead of bridging it horizontally.
          const rise=trail.b.y-trail.a.y;
          const run=Math.hypot(distance,rise)/n;
          add({id:rail,x:mX,z:mZ,y:mY-.012,yaw:yaw-Math.PI/2,
            roll:Math.atan2(rise,distance),stretch:[(run-.008)/ASSETS[rail].size[0],1,1]});
        } else add({id:rail,x:mX,z:mZ,y:mY+(wood?.41:.015),yaw:yaw-Math.PI/2});
        boxes.push({x:mX,y:mY+.92,z:mZ,w:.19,h:1.84,d:distance/n+.16,yaw,noCamera:true});
      }
    }
  }
  const landingStone=new T.MeshStandardMaterial({color:0xe8c4a4,roughness:.91,map:textures.stone});
  const railStone=new T.MeshStandardMaterial({color:0xf4d6b2,roughness:.83});
  const balusterGeometry=new T.LatheGeometry([
    [.153,0],[.153,.09],[.111,.12],[.08,.23],[.122,.35],[.122,.4],[.083,.5],[.106,.62],[.168,.66],[.168,.72]
  ].map(([r,y])=>new T.Vector2(r,y)),12);
  const landings=new Set<TerrainNode>();
  const balusterOffsets:[number,number,number][]=[];
  const curbMat=new T.MeshStandardMaterial({color:0xd7b69a,side:T.DoubleSide,roughness:.93});
  const curbGeos:T.BufferGeometry[]=[], railGeos:T.BufferGeometry[]=[];
  type TerrainNode=(typeof staircase)[number]['a'];
  for (const {a,b,rise,modules:count,width,length,pad} of staircase) {
    const dx=b.at[0]-a.at[0],dz=b.at[1]-a.at[1],yaw=Math.atan2(dx,dz);
    const run=length-2*pad;
    for(let i=0;i<count;i++){
      const t=(pad+(i+.5)/count*run)/length,x=a.at[0]+dx*t,z=a.at[1]+dz*t;
      add({id:'summit-steps',x,z,y:a.y+rise*i/count,yaw:yaw+Math.PI,
        stretch:[width/ASSETS['summit-steps'].size[0],rise/count/ASSETS['summit-steps'].size[2],run/count/ASSETS['summit-steps'].size[1]]});
    }
    const along=(width+.08)*.5, nx=-dz/length*along,nz=dx/length*along;
    const values:number[]=[], indices:number[]=[];
    for(const [i,t] of stairLevels({a,b,rise,modules:count,width,length,pad}).entries()){
      const ay=(i<2?a.y:b.y)+.012,x=a.at[0]+dx*t,z=a.at[1]+dz*t;
      values.push(x+nx,ay,z+nz,x-nx,ay,z-nz);
      if(i<3)indices.push(i*2,i*2+2,i*2+1,i*2+1,i*2+2,i*2+3);
    }
    const slope=new T.BufferGeometry();
    slope.setAttribute('position',new T.Float32BufferAttribute(values,3));slope.setIndex(indices);
    structures.push(slope);
    for(const side of [-1,1]){
      const posts:number[]=[], quads=[0,1,2,1,3,2];
      for(const i of [1,2]){
        const x=values[i*6+(side===1?0:3)],y=values[i*6+1],z=values[i*6+2+(side===1?0:3)];
        posts.push(x,y+.035,z,x,y-.79,z);
      }
      const g=new T.BufferGeometry();
      g.setAttribute('position',new T.Float32BufferAttribute(posts,3));g.setIndex(quads);g.computeVertexNormals();
      curbGeos.push(normalizeForMerge(g));g.dispose();
      const railPoints:T.Vector3[]=[];
      const lengthOfRail=run-.44,count=Math.ceil(lengthOfRail/.69);
      for(let i=0;i<=count;i++){
        const t=(pad+.22+i*lengthOfRail/count)/length;
        const x=a.at[0]+dx*t+side*nx*1.06,z=a.at[1]+dz*t+side*nz*1.06;
        const y=a.y+rise*(t*length-pad)/run;
        railPoints.push(new T.Vector3(x,y+.77,z));
        balusterOffsets.push([x,y+.035,z]);
      }
      const railG=new T.TubeGeometry(new T.CatmullRomCurve3(railPoints),count*2,.105,8);
      railGeos.push(normalizeForMerge(railG));railG.dispose();
    }
    landings.add(a);landings.add(b);
  }
  if(curbGeos.length){
    const mergedCurbs=mergeGeometries(curbGeos,false);curbGeos.forEach(g=>g.dispose());
    if(mergedCurbs){const m=new T.Mesh(mergedCurbs,curbMat);m.name='stair-curbs';m.receiveShadow=true;group.add(m);}
  }
  if(railGeos.length){
    const mergedRails=mergeGeometries(railGeos,false);railGeos.forEach(g=>g.dispose());
    if(mergedRails){const m=new T.Mesh(mergedRails,railStone);m.name='stair-rails';m.castShadow=!coarseDevice;m.receiveShadow=true;group.add(m);}
  }
  if(balusterOffsets.length){
    const balusters=new T.InstancedMesh(balusterGeometry,railStone,balusterOffsets.length);
    balusters.name='stair-balusters';
    const bp=new T.Object3D();
    balusterOffsets.forEach(([x,y,z],i)=>{bp.position.set(x,y,z);bp.updateMatrix();balusters.setMatrixAt(i,bp.matrix);});
    balusters.receiveShadow=true;balusters.castShadow=!coarseDevice;balusters.computeBoundingSphere();
    group.add(balusters);
  }
  const landingGeos:T.BufferGeometry[]=[];
  const baseLanding=new T.CylinderGeometry(STAIR_LANDING_RADIUS,STAIR_LANDING_RADIUS+.08,.39,12);
  for(const node of landings){
    const lg=normalizeForMerge(baseLanding);
    lg.translate(node.at[0],node.y-.186,node.at[1]);
    landingGeos.push(lg);
    structures.push(new T.CircleGeometry(STAIR_LANDING_RADIUS,12).rotateX(-Math.PI/2).translate(node.at[0],node.y+.012,node.at[1]));
  }
  baseLanding.dispose();
  if(landingGeos.length){
    const mergedLandings=mergeGeometries(landingGeos,false);landingGeos.forEach(g=>g.dispose());
    if(mergedLandings){const m=new T.Mesh(mergedLandings,landingStone);m.name='stair-landings';m.receiveShadow=true;m.castShadow=!coarseDevice;group.add(m);}
  }
  const foundationGeos:T.BufferGeometry[]=[];
  for(const [id,anchors] of batch) {
    const asset:Asset=ASSETS[id], replace=approved.get(id)??sculpted.get(id);
    const fits=replace?.official?placementFits[id]:undefined;
    const fitted=fits?anchors.map(p=>{
      const fit=fits.find(({from})=>Math.abs(p.x-from[0])<.02&&Math.abs(p.z-from[1])<.02);
      return fit?{...p,x:fit.to[0],z:fit.to[1],scale:fit.scale??p.scale}:p;
    }):anchors;
    const previewGazebo=id==='gazebo'&&replace?.preview;
    const placements=previewGazebo?fitted.map(p=>({...p,y:(p.y??terrain(p.x,p.z).y)-.34,yaw:p.yaw+.38})):fitted;
    const model=replace?.model ?? makeModel(id);
    const stoneBatches=(id==='shore-rock'||id==='cliff-rock')&&replace?.official?rockInstanceSources(model,id):undefined;
    const officialBatches=!stoneBatches&&replace?.official&&instancedOfficialAssets.has(id)&&placements.length>=2
      ? officialInstanceSources(model,id) : undefined;
    const castShadow=!noShadowAssets.has(id) && !(coarseDevice && coarseNoShadowAssets.has(id)) && (asset.size[2]>.70||id==='village-fence');
    const direct=!stoneBatches&&!officialBatches&&replace&&(replace.official||replace.preview||['cottage','observatory','gazebo','moon','basin','boat','cascade','orrery','bridge'].includes(asset.shape));
    const transform=new T.Object3D();
    if(previewGazebo) {
      for(const p of placements) {
        const scale=p.scale??1,[sx,sy,sz]=p.stretch??[1,1,1],base=p.y??terrain(p.x,p.z).y;
        const rise=sy*scale, width=sx*scale, depth=sz*scale;
        // Local profile sampled from the Tripo plinth and column bases.
        const rows=[[2.93,0],[2.73,.255],[2.52,.442],[2.30,.611]]
          .map(([radius,y])=>({radius:radius*Math.min(width,depth),y:base+y*rise}));
        rows[0].y=terrain(p.x,p.z).y;
        const platform=gazeboRamp(rows,p.x,p.z);
        gazeboFloors.push(platform);structures.push(platform.ramp);
        for(const column of [22,69,111,155,202,248,292,336]) {
          const angle=T.MathUtils.degToRad(column);
          const x=Math.sin(angle)*1.93*width,z=Math.cos(angle)*1.93*depth;
          const c=Math.cos(p.yaw),s=Math.sin(p.yaw),height=2.42*rise;
          boxes.push({x:p.x+x*c+z*s,z:p.z-x*s+z*c,y:base+.61*rise+height/2,
            w:.47*width,d:.47*depth,h:height,yaw:p.yaw,shape:'round',noCamera:true});
        }
      }
    } else if(id==='gazebo'){
      const reference=model.getObjectByName('gazebo-platform')?model:makeModel(id);
      reference.updateMatrixWorld(true);
      for(const p of placements){
        transform.position.set(p.x,p.y??terrain(p.x,p.z).y,p.z);
        transform.rotation.y=p.yaw;transform.scale.set(...p.stretch??[1,1,1]).multiplyScalar(p.scale??1);transform.updateMatrix();
        for(const name of ['gazebo-platform','gazebo-columns']){
          const part=reference.getObjectByName(name);
          if(!part)continue;
          const solid=solidModelPart(part,transform.matrix);
          if(name==='gazebo-platform'){
            const platform=gazeboFloor(solid,p.x,p.z);
            gazeboFloors.push(platform);structures.push(platform.ramp);solid.dispose();
          }else structures.push(solid);
        }
      }
      if(reference!==model)reference.traverse(node=>{if(node instanceof T.Mesh)node.geometry.dispose();});
    }
    const buckets=new Map<T.Group,Placement[]>();
    if(!direct) for(const p of placements){const tile=tileFor(p,id),own=buckets.get(tile)??[];own.push(p);buckets.set(tile,own);}
    const plinthFootprint=asset.shape==='cottage'?extractPlinthFootprint(model):null;
    const isReflectLandmark=reflectAssets.has(id)||(!phoneDevice && id==='market-coral');
    // Build merged world-space limestone foundations for any sloped cottage/market building (works for both direct & instanced!)
    if(plinthFootprint){
      for(const p of placements){
        const baseY=p.y??terrain(p.x,p.z).y;
        const sc=p.scale??1, [sx,sy,sz]=p.stretch??[1,1,1];
        const minGround=minFootprintTerrainY(p,plinthFootprint);
        const dropWorld=baseY-minGround;
        if(dropWorld>.03){
          const dropLocal=(dropWorld+.85)/(sy*sc);
          const geo=buildFoundationGeometry(plinthFootprint,dropLocal,sx*sc,sy*sc,sz*sc);
          transform.position.set(p.x,baseY,p.z);
          transform.rotation.set(0,p.yaw,p.roll??0,'YXZ');
          transform.scale.set(sx,sy,sz).multiplyScalar(sc);
          transform.updateMatrix();
          geo.applyMatrix4(transform.matrix);
          foundationGeos.push(geo);
        }
      }
    }
    // Approved GLBs retain their authored PBR materials and textures.
    if(direct) for(const p of placements) {
      const pose=model.clone(true);
      const baseY=p.y??terrain(p.x,p.z).y;
      const sc=p.scale??1, [sx,sy,sz]=p.stretch??[1,1,1];
      pose.position.set(p.x,baseY,p.z);pose.rotation.set(0,p.yaw,p.roll??0,'YXZ');
      pose.scale.set(sx,sy,sz).multiplyScalar(sc);
      pose.traverse(child=>{
        if(child instanceof T.Mesh){
          child.castShadow=castShadow;child.receiveShadow=true;
          if(clutterAssets.has(id))child.layers.set(CLUTTER_LAYER);
          if(isReflectLandmark)child.layers.enable(REFLECT_LAYER);
        }
      });
      if(id==='waterfall'&&replace.official){
        waterfall.dress(pose);
        if(isReflectLandmark)pose.traverse(child=>{if(child instanceof T.Mesh)child.layers.enable(REFLECT_LAYER);});
        const bed=pose.getObjectByName('Cascade_bedrock_and_fractured_banks');
        if(bed){
          pose.updateMatrixWorld(true);
          structures.push(solidModelPart(bed,new T.Matrix4()));
        }
      }
      if(landmarkAssets.has(id)) group.add(pose); else tileFor(p,id).add(pose);
      if(id==='crescent')moonBounds.setFromObject(pose);
      const canopy=pose.getObjectByName('canopy');
      if(canopy) {
        const meshes: (typeof officialCanopies)[number]['meshes']=[];
        canopy.traverse(child=>{if(child instanceof T.Mesh)meshes.push({mesh:child,solid:child.material,fade:Array.isArray(child.material)?child.material.map(getCanopyFade):getCanopyFade(child.material)});});
        officialCanopies.push({bounds:new T.Box3().setFromObject(canopy),meshes});
      }
    }
    else if(officialBatches) {
      const isClutter=clutterAssets.has(id);
      for(const [tile,local] of buckets) for(const part of officialBatches) {
        const mesh=new T.InstancedMesh(part.geometry,part.material,local.length);
        mesh.name=id+(part.canopy?'-canopy':'');mesh.castShadow=castShadow;mesh.receiveShadow=true;
        if(isClutter)mesh.layers.set(CLUTTER_LAYER);
        for(const [i,p] of local.entries()) {
          transform.position.set(p.x,p.y??terrain(p.x,p.z).y,p.z);
          transform.rotation.set(0,p.yaw,p.roll??0,'YXZ');
          transform.scale.set(...p.stretch??[1,1,1]).multiplyScalar(p.scale??1);transform.updateMatrix();
          mesh.setMatrixAt(i,transform.matrix);
          if(part.canopy && part.fadeMaterial) {
            const near=part.localCenter.clone().applyMatrix4(transform.matrix);
            const scaleMax=Math.max(...(p.stretch??[1,1,1]))*(p.scale??1);
            vegetation.push({near,radiusSq:(part.radius*Math.min(1.15,scaleMax))**2,chunk:mesh,instance:i,home:transform.matrix.clone(),fadeMaterial:part.fadeMaterial});
          }
        }
        mesh.computeBoundingSphere();tile.add(mesh);
      }
    }
    else if(stoneBatches) {
      const assignments=assignRockVariants(placements,stoneBatches.length);
      for(const [tile,local] of buckets) for(const [index,stone] of stoneBatches.entries()) {
        const rocks=local.filter(p=>assignments.get(p)===index);
        if(!rocks.length)continue;
        const instances=new T.InstancedMesh(stone.geometry,stone.material,rocks.length);
        instances.name=stone.name;
        instances.castShadow=castShadow;
        instances.receiveShadow=true;
        instances.layers.set(CLUTTER_LAYER);
        for(const [i,p] of rocks.entries()) {
          const {x,y,z,yaw,stretch}=rockPlacement(id,p);
          transform.position.set(x,y,z);
          transform.quaternion.setFromAxisAngle(yaxis,yaw);
          transform.scale.set(...stretch).multiplyScalar(p.scale??1);
          transform.updateMatrix();
          instances.setMatrixAt(i,transform.matrix);
        }
        instances.computeBoundingSphere();
        tile.add(instances);
      }
    }
    else for(const canopy of [false,true]) {
      const geometry=flattened(model,canopy);
      if(!geometry)continue;
      const isClutter=clutterAssets.has(id);
      for(const [tile,local] of buckets) {
        const mesh=new T.InstancedMesh(geometry,id==='shore-rock'||id==='cliff-rock'?stoneFaces:solidMaterial,local.length);
        mesh.name=id+(canopy?'-canopy':'');mesh.castShadow=castShadow;mesh.receiveShadow=true;
        if(isClutter)mesh.layers.set(CLUTTER_LAYER);
        for(const [i,p] of local.entries()) {
          transform.position.set(p.x,p.y??terrain(p.x,p.z).y,p.z);
          transform.rotation.set(0,p.yaw,p.roll??0,'YXZ');
          transform.scale.set(...p.stretch??[1,1,1]).multiplyScalar(p.scale??1);transform.updateMatrix();
          mesh.setMatrixAt(i,transform.matrix);
          if(canopy) vegetation.push({near:transform.position.clone().add(new T.Vector3(0,asset.size[2]*(p.scale??1)*.73,0)),radiusSq:2.35,chunk:mesh,instance:i,home:transform.matrix.clone(),fadeMaterial});
        }
        mesh.computeBoundingSphere();tile.add(mesh);
      }
    }
    if(!direct) model.traverse(o=>{
      if(!(o instanceof T.Mesh))return;
      o.geometry.dispose();
      if(!officialBatches) for(const m of Array.isArray(o.material)?o.material:[o.material]){
        if(m!==stoneBatches?.[0].material&&(replace || m instanceof T.MeshStandardMaterial&&m.emissiveIntensity===.2))m.dispose();
      }
    });
    if(id==='plaza-steps'){
      // Replace discrete riser cuboids with a continuous walkable ramp so pets
      // never snag on 15 cm step corners while visibleFoot preserves crisp tread height.
      for(const p of placements){
        const [sx,sy,sz]=p.stretch??[1,1,1], scale=p.scale??1;
        const [w,d,h]=asset.size;
        const width=w*sx*scale, depth=d*sz*scale, rise=h*sy*scale;
        const base=p.y??terrain(p.x,p.z).y;
        const halfW=width*.5, zFront=depth*.5+.14, zBack=-depth*.5-.06;
        const sin=Math.sin(p.yaw), cos=Math.cos(p.yaw);
        const corner=(lx:number,ly:number,lz:number):[number,number,number]=>[
          p.x+lx*cos+lz*sin, ly, p.z-lx*sin+lz*cos,
        ];
        const ramp=new T.BufferGeometry();
        ramp.setAttribute('position',new T.Float32BufferAttribute([
          ...corner(-halfW,base-.06,zFront), ...corner(halfW,base-.06,zFront),
          ...corner(-halfW,base+rise+.008,zBack), ...corner(halfW,base+rise+.008,zBack),
        ],3));
        ramp.setIndex([0,1,2, 1,3,2]);
        structures.push(ramp);
      }
    }
    if(id==='shore-rock'||id==='cliff-rock'){
      for(const p of placements){
        const fitted=stoneBatches?rockPlacement(id,p):undefined;
        const [sx,sy,sz]=fitted?.stretch??p.stretch??[1,1,1], scale=p.scale??1;
        const [w,d,h]=asset.size;
        const solidWidth=w*sx*scale*.72,solidDepth=d*sz*scale*.78,solidHeight=h*sy*scale*.82;
        const {x,y:base,z,yaw}=fitted??{x:p.x,y:p.y??terrain(p.x,p.z).y,z:p.z,yaw:p.yaw};
        const approach=nearestTrail(x,z);
        if(base+solidHeight<.3 || approach.distance<approach.trail.width/2+Math.max(solidWidth,solidDepth)/2+.4)continue;
        boxes.push({x,y:base+solidHeight/2,z,w:solidWidth,h:solidHeight,d:solidDepth,yaw,shape:'round',noCamera:id==='shore-rock'});
      }
    }
    if(id==='market-canopy'&&replace?.official){
      for(const p of placements){
        const scale=p.scale??1,[ax,,az]=p.stretch??[1,1,1];
        const w=asset.size[0]*ax*scale,d=asset.size[1]*az*scale,base=p.y??terrain(p.x,p.z).y;
        const c=Math.cos(p.yaw),s=Math.sin(p.yaw);
        for(const [mx,mz] of [[-0.482*w,0.4565*d],[0.482*w,0.4355*d],[0,-0.4565*d]] as const)
          boxes.push({x:p.x+mx*c+mz*s,y:base+1.4,z:p.z-mx*s+mz*c,w:.48,h:2.8,d:.48,yaw:p.yaw,shape:'round',noCamera:true});
      }
    }
    if(id==='flower-arch'){
      for(const p of placements){
        const base=p.y??terrain(p.x,p.z).y, c=Math.cos(p.yaw), s=Math.sin(p.yaw);
        for(const side of [-1,1])
          boxes.push({x:p.x+side*3.41*c,y:base+1.5,z:p.z-side*3.41*s,w:1.05,h:3.0,d:1.05,yaw:p.yaw,shape:'round',noCamera:true});
      }
    }
    if(id==='flower-pot'){
      for(const p of placements){
        const sc=p.scale??1, base=p.y??terrain(p.x,p.z).y, diam=.54*sc;
        boxes.push({x:p.x,y:base+.82,z:p.z,w:diam,h:1.64,d:diam,yaw:p.yaw,shape:'round',noCamera:true});
      }
    }
    if(id==='parasol'){
      for(const p of placements){
        const sc=p.scale??1, base=p.y??terrain(p.x,p.z).y, diam=.68*sc;
        boxes.push({x:p.x,y:base+.95*sc,z:p.z,w:diam,h:1.90*sc,d:diam,yaw:p.yaw,shape:'round',noCamera:true});
      }
    }
    if(!asset.collision || id==='west-rail' || id==='east-rail')continue;
    const isRail=id==='plaza-railing'||id==='summit-rail'||id==='village-fence';
    const blocksCamera=asset.shape==='cottage'||asset.shape==='observatory';
    const lowBox=asset.collision==='box'&&!isRail&&id!=='fountain'&&id!=='lamp'&&id!=='flower-bed'
      ? extractLowColliderBox(model,1.6) : null;
    for(const p of placements) {
      const scale=p.scale??1,[ax,ay,az]=p.stretch??[1,1,1];
      const w=asset.size[0]*ax,d=asset.size[1]*az,h=asset.size[2]*ay;
      const y=p.y??terrain(p.x,p.z).y;
      if(id==='fountain'){
        // Tall camera-transparent barrier prevents jumping pets from landing inside the fountain basin without snapping camera.
        const keepOut=3.4;
        boxes.push({x:p.x,y:y+keepOut*.5,z:p.z,w:w*scale*.995,d:d*scale*.995,h:keepOut,yaw:p.yaw,shape:'round',noCamera:true});
      } else if(id==='lamp'||id==='flower-bed'){
        const bh=id==='flower-bed'?1.80:h*scale;
        boxes.push({x:p.x,y:y+bh*.5,z:p.z,w:w*scale,d:d*scale,h:bh,yaw:p.yaw,shape:id==='lamp'?'round':undefined,noCamera:true});
      } else if(isRail){
        const rw=w*1.02*scale, rd=d*scale;
        boxes.push({x:p.x,y:y+.92,z:p.z,w:rw,h:1.84,d:rd,yaw:p.yaw,noCamera:true});
      } else if(asset.collision==='trunk'){
        const bh=h*.85*scale, diam=.66*scale;
        boxes.push({x:p.x,y:y+bh*.5,z:p.z,w:diam,h:bh,d:diam,yaw:p.yaw,shape:'round',noCamera:true});
      } else {
        const minGround=plinthFootprint?minFootprintTerrainY(p,plinthFootprint):y;
        const bottom=minGround<y-.03?minGround-.5:y;
        const bh=blocksCamera?h*scale:Math.max(h*scale,1.82);
        const top=y+bh;
        const bw=(lowBox?lowBox.w*ax*.98:w*.94)*scale;
        const bd=(lowBox?lowBox.d*az*.98:d*.94)*scale;
        const c=Math.cos(p.yaw), s=Math.sin(p.yaw);
        const lx=lowBox?lowBox.cx*ax*scale:0, lz=lowBox?lowBox.cz*az*scale:0;
        const bx=p.x+lx*c+lz*s, bz=p.z-lx*s+lz*c;
        const shape=id==='orrery'?'round':undefined;
        boxes.push({x:bx,y:(top+bottom)*.5,z:bz,w:bw,h:top-bottom,d:bd,yaw:p.yaw,shape,noCamera:!blocksCamera});
      }
    }
  }
  if(foundationGeos.length){
    const mergedFoundations=mergeGeometries(foundationGeos,false);
    foundationGeos.forEach(g=>g.dispose());
    if(mergedFoundations){
      const foundationsMesh=new T.Mesh(mergedFoundations,foundationMaterial);
      foundationsMesh.name='island-foundations';
      foundationsMesh.receiveShadow=true;
      group.add(foundationsMesh);
    }
  }
  // Cape, beach and plains use the same chunk meshes for visible ground and collision.
  const npcs=createNpcWanderSystem(trials,boxes);
  scene.add(group);
  const skylineRange=phoneDevice?82:coarseDevice?120:220, detailRange=phoneDevice?36:coarseDevice?58:145;
  const faded = new Map<Vegetation,T.Mesh>();
  const ray=new T.Line3(), closest=new T.Vector3(), canopyRay=new T.Ray(), hit=new T.Vector3();
  function softenCanopies(eye:T.Vector3,subject:T.Vector3) {
    ray.set(eye,subject);
    const distance=eye.distanceToSquared(subject);
    canopyRay.origin.copy(eye);
    canopyRay.direction.subVectors(subject,eye).normalize();
    for(const tree of officialCanopies) {
      const hidden=tree.bounds.containsPoint(eye) ||
        (canopyRay.intersectBox(tree.bounds,hit)!==null && eye.distanceToSquared(hit)<distance);

      for(const leaf of tree.meshes)leaf.mesh.material=hidden?leaf.fade:leaf.solid;
    }
    for(const tree of vegetation) {
      if(!tree.chunk.parent!.visible && !faded.has(tree))continue;
      const inside=tree.chunk.parent!.visible && ray.closestPointToPoint(tree.near,true,closest).distanceToSquared(tree.near)<tree.radiusSq;
      if(inside && !faded.has(tree)) {
        const ghost=new T.Mesh(tree.chunk.geometry,tree.fadeMaterial);
        ghost.castShadow=false;ghost.layers.mask=tree.chunk.layers.mask;
        ghost.matrix.copy(tree.home);ghost.matrixAutoUpdate=false;
        group.add(ghost);faded.set(tree,ghost);
        tree.chunk.setMatrixAt(tree.instance,dynamicMatrix.makeScale(0,0,0));tree.chunk.instanceMatrix.needsUpdate=true;
      } else if(!inside && faded.has(tree)) {
        faded.get(tree)!.removeFromParent();faded.delete(tree);
        tree.chunk.setMatrixAt(tree.instance,tree.home);tree.chunk.instanceMatrix.needsUpdate=true;
      }
    }
  }
  function showChunks(x:number,z:number,overview:boolean) {
    let changed=false;
    for(const tile of skylineTiles.values()){
      const visible=overview||Math.hypot(tile.x-x,tile.z-z)<skylineRange;
      if(tile.group.visible!==visible){tile.group.visible=visible;changed=true;}
    }
    for(const tile of detailTiles.values()){
      const visible=overview||Math.hypot(tile.x-x,tile.z-z)<detailRange;
      if(tile.group.visible!==visible){tile.group.visible=visible;changed=true;}
    }
    return changed;
  }
  function gazeboTread(x:number,y:number,z:number) {
    for(const floor of gazeboFloors){
      const radius=Math.hypot(x-floor.x,z-floor.z);
      const tread=floor.steps.find(step=>radius<step.radius-.025&&Math.abs(step.y-y)<.25);
      if(tread)return tread.y;
    }
    return y;
  }
  return {group,pieces,structures,boxes,water,fountain,waterfall,sky,npcs,moonBounds,gazeboTread,softenCanopies,showChunks,finish() {
    fountain.release();
    sky.release();
    npcs.release();
    const geometry=new Set<T.BufferGeometry>(), materials=new Set<T.Material>([fadeMaterial,solidMaterial,stoneFaces,board,flagStone,foundationMaterial,terrainMaterial,water.material]);
    group.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Points){geometry.add(o.geometry); for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
    for(const tree of officialCanopies)for(const leaf of tree.meshes)
      for(const m of [...(Array.isArray(leaf.solid)?leaf.solid:[leaf.solid]),...(Array.isArray(leaf.fade)?leaf.fade:[leaf.fade])])materials.add(m);
    for(const tree of vegetation)for(const m of Array.isArray(tree.fadeMaterial)?tree.fadeMaterial:[tree.fadeMaterial])materials.add(m);
    structures.forEach(g=>geometry.add(g));
    geometry.forEach(g=>g.dispose());
    for(const m of materials) {
      for(const v of Object.values(m))if(v instanceof T.Texture)v.dispose();
      m.dispose();
    }
    for(const t of Object.values(textures))t.dispose();
    art.water?.dispose();
    water.material.uniforms.foam.value?.dispose();group.removeFromParent();
  }};
}

export function overviewCamera(aspect:number) {
  const pitch=.57,distance=345;
  const w=Math.max(WIDTH+13,(DEPTH*Math.sin(pitch)+26)*aspect), h=w/aspect;
  const camera=new T.PerspectiveCamera(T.MathUtils.radToDeg(2*Math.atan(h/(2*distance))),aspect,.2,650);
  camera.position.set(WIDTH/2,Math.sin(pitch)*distance+3,DEPTH/2+Math.cos(pitch)*distance);
  camera.lookAt(WIDTH/2,3,DEPTH/2);
  camera.updateMatrixWorld();return camera;
}
