import { ASSET_BY_ID, ZONES, ZONE_NAMES } from './assets.js';
import { ASSET_GEOMETRY } from './asset-geometry.js';
import { alphaBounds, fittedSize } from './colliders.js';
import { FIXED_MAP, MAP_VERSION } from './fixed-map.js';

function hashString(value) {
  let h=2166136261;
  for (let i=0;i<value.length;i++) h=Math.imul(h^value.charCodeAt(i),16777619);
  return (h>>>0).toString(16).padStart(8,'0');
}

function snapObstacles(objects) {
  const byId=new Map(objects.map(object=>[object.id,object]));
  for (const object of objects.filter(object=>object.role==='obstacle' && object.supportId)) {
    const support=byId.get(object.supportId);
    if (!support) continue;
    const size=fittedSize(object), supportSize=fittedSize(support);
    const bounds=alphaBounds(object.assetId,size), supportBounds=alphaBounds(support.assetId,supportSize);
    object.y=support.y+supportBounds.minY-bounds.maxY+1;
  }
}

// Compatibility entry point: seed is deliberately ignored. The server may
// continue storing it, but every value returns this exact authored map.
export function buildCourse(seed=0) {
  const objects=FIXED_MAP.objects.map(source=>{
    const asset=ASSET_BY_ID.get(source.assetId);
    if (!asset) throw new Error(`Fixed map references missing asset ${source.assetId}`);
    return {...source,asset,difficulty:source.zone==='factory'?4:source.zone==='snow'?3:2,behavior:{...(source.behavior||{type:'static'})}};
  });
  snapObstacles(objects);
  const nodes=FIXED_MAP.nodes.map(node=>({...node}));
  const nodeByAltitude=altitude=>nodes.filter(node=>node.route==='main').sort((a,b)=>Math.abs(a.altitude-altitude)-Math.abs(b.altitude-altitude))[0];
  const sensors=FIXED_MAP.progressSensors.map(sensor=>({...sensor}));
  const checkpoints=FIXED_MAP.checkpoints.map(source=>{
    const node=nodeByAltitude(source.altitude);
    const zone=FIXED_MAP.zones.find(item=>source.altitude>=item.min && source.altitude<=item.max)?.id || 'castle';
    return {...source,x:node.x,y:node.y-12,progress:source.altitude/1000,zone,zoneName:ZONE_NAMES[zone]};
  });
  const instances=FIXED_MAP.zones.map((zone,index)=>({id:`fixed-zone-${zone.id}`,chunkId:`fixed-${zone.id}`,zone:zone.id,zoneName:ZONE_NAMES[zone.id],slot:index,difficulty:index+1,bounds:{x:0,y:FIXED_MAP.world.startY-zone.max*5,w:FIXED_MAP.world.width,h:(zone.max-zone.min)*5}}));
  const transformText=objects.map(object=>`${object.id}:${object.assetId}:${object.x}:${object.y}:${object.w}:${object.h}:${object.angle}:${object.role}:${object.supportId||''}`).join('|');
  const routeText=Object.values(FIXED_MAP.routes).flat().map(edge=>`${edge.type}:${edge.from}>${edge.to}`).join('|');
  const colliderText=objects.filter(object=>object.role!=='decor').map(object=>`${object.id}:${JSON.stringify(ASSET_GEOMETRY[object.assetId]?.parts||[])}`).join('|');
  const courseHash=hashString(`${MAP_VERSION}|${transformText}|${routeText}`);
  const colliderHash=hashString(`${MAP_VERSION}|${colliderText}`);
  return {
    seed, mapVersion:MAP_VERSION,
    world:{width:FIXED_MAP.world.width,height:FIXED_MAP.world.height},
    start:{...FIXED_MAP.start}, summit:{...FIXED_MAP.summit}, startAltitudeY:FIXED_MAP.start.y,
    objects,nodes,routes:{main:FIXED_MAP.routes.main.map(edge=>({...edge})),shortcut:FIXED_MAP.routes.shortcut.map(edge=>({...edge})),recovery:FIXED_MAP.routes.recovery.map(edge=>({...edge}))},
    sensors,checkpoints,instances,
    recoveryBounds:FIXED_MAP.recoveryBounds.map(item=>({...item})), hazards:FIXED_MAP.hazards.map(item=>({...item})),
    usedAssets:[...new Set([...objects.map(object=>object.assetId),'checkpoint-flag','summit-flag'])],
    stageCount:ZONES.length,stages:ZONES.map(zone=>ZONE_NAMES[zone]),courseHash,colliderHash
  };
}

export function validateCourse(course) {
  const errors=[];
  if (course.mapVersion!==MAP_VERSION) errors.push('unexpected map version');
  if (course.world.width!==5600 || course.world.height!==6200) errors.push('fixed world must be 5600x6200');
  if (course.instances.length!==6) errors.push(`expected 6 authored zones, got ${course.instances.length}`);
  if (course.checkpoints.map(item=>item.altitude).join(',')!=='0,210,274,448,573,704,820,930') errors.push('checkpoint altitudes changed');
  const nodes=new Map(course.nodes.map(node=>[node.id,node]));
  const objects=new Map(course.objects.map(object=>[object.id,object]));
  for (const [name,edges] of Object.entries(course.routes)) for (const edge of edges) {
    if (!nodes.has(edge.from)||!nodes.has(edge.to)) errors.push(`${name} edge references a missing node`);
  }
  let minMainMargin=1;
  let mainDescents=0;
  for (const edge of course.routes.main) {
    const a=nodes.get(edge.from), b=nodes.get(edge.to);
    if (!a||!b) continue;
    if (b.altitude<a.altitude) mainDescents++;
    const ao=objects.get(a.objectId), bo=objects.get(b.objectId);
    const aw=fittedSize(ao).w, bw=fittedSize(bo).w;
    const gap=Math.max(0,Math.abs(b.x-a.x)-(aw+bw)/2);
    const rise=Math.max(0,a.y-b.y);
    const horizontalMargin=1-gap/360;
    const verticalMargin=1-rise/165;
    const margin=Math.min(horizontalMargin,verticalMargin);
    minMainMargin=Math.min(minMainMargin,margin);
    if (margin<.18) errors.push(`main edge ${edge.from}>${edge.to} has only ${(margin*100).toFixed(1)}% margin`);
  }
  if (mainDescents<3) errors.push(`fixed route needs at least 3 deliberate descents, got ${mainDescents}`);
  let minRecoveryMargin=1;
  for (const edge of course.routes.recovery) {
    const a=nodes.get(edge.from), b=nodes.get(edge.to);
    if (!a||!b) continue;
    const ao=objects.get(a.objectId), bo=objects.get(b.objectId);
    const aw=fittedSize(ao).w, bw=fittedSize(bo).w;
    const gap=Math.max(0,Math.abs(b.x-a.x)-(aw+bw)/2);
    const rise=Math.max(0,a.y-b.y);
    const margin=Math.min(1-gap/360,1-rise/165);
    minRecoveryMargin=Math.min(minRecoveryMargin,margin);
    if (margin<.18) errors.push(`recovery edge ${edge.from}>${edge.to} has only ${(margin*100).toFixed(1)}% margin`);
  }
  const obstacles=course.objects.filter(object=>object.role==='obstacle'&&object.supportId);
  for (const object of obstacles) {
    const support=objects.get(object.supportId);
    if (!support) { errors.push(`${object.id} support missing`); continue; }
    const bounds=alphaBounds(object.assetId,fittedSize(object));
    const supportBounds=alphaBounds(support.assetId,fittedSize(support));
    const gap=Math.abs((object.y+bounds.maxY)-(support.y+supportBounds.minY));
    if (gap>2.1) errors.push(`${object.id} floats ${gap.toFixed(1)}px above support`);
  }
  if (course.objects.some(object=>object.role==='decor'&&object.supportId)) errors.push('decor must not own collision support');
  if (course.hazards.length<3) errors.push('factory laser maze is missing');

  // A reachable graph is not enough: two unrelated alpha bodies must never
  // occupy the same world space. That was the source of solid props appearing
  // inside bricks and of invisible dead ends between route rows.
  const solids=course.objects.filter(object=>object.role!=='decor').map(object=>{
    const bounds=alphaBounds(object.assetId,fittedSize(object));
    return {object,left:object.x+bounds.minX,right:object.x+bounds.maxX,top:object.y+bounds.minY,bottom:object.y+bounds.maxY};
  });
  let solidOverlaps=0;
  for (let i=0;i<solids.length;i++) for (let j=i+1;j<solids.length;j++) {
    const a=solids[i], b=solids[j];
    if (a.object.supportId===b.object.id||b.object.supportId===a.object.id) continue;
    if (a.object.tags?.includes('ground-chain')&&b.object.tags?.includes('ground-chain')) continue;
    const overlapX=Math.min(a.right,b.right)-Math.max(a.left,b.left);
    const overlapY=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top);
    if (overlapX>4&&overlapY>4) {
      solidOverlaps++;
      if (solidOverlaps<=8) errors.push(`${a.object.id} overlaps ${b.object.id} by ${overlapX.toFixed(0)}x${overlapY.toFixed(0)}px`);
    }
  }

  // Every main support needs at least one full player-sized standing column.
  // Search the actual alpha AABB instead of assuming the node centre is clear.
  const solidById=new Map(solids.map(solid=>[solid.object.id,solid]));
  let unsafeStandNodes=0;
  for (const node of course.nodes.filter(item=>item.route==='main')) {
    const own=solidById.get(node.objectId);
    if (!own) continue;
    const start=Math.min(own.right-29,own.left+29), end=Math.max(own.left+29,own.right-29);
    let safe=false;
    for (let x=start;x<=end+1;x+=10) {
      const left=x-29,right=x+29,top=own.top-76,bottom=own.top-4;
      const blocked=solids.some(solid=>solid.object.id!==node.objectId
        &&Math.min(right,solid.right)-Math.max(left,solid.left)>2
        &&Math.min(bottom,solid.bottom)-Math.max(top,solid.top)>2);
      if (!blocked) { safe=true; break; }
    }
    if (!safe) {
      unsafeStandNodes++;
      if (unsafeStandNodes<=8) errors.push(`${node.id} has no 58x72px safe standing column`);
    }
  }
  return {ok:errors.length===0,errors,stats:{mapVersion:course.mapVersion,objects:course.objects.length,assets:course.usedAssets.length,nodes:course.nodes.length,mainEdges:course.routes.main.length,recoveryEdges:course.routes.recovery.length,obstacles:obstacles.length,mainDescents,minMainMarginPct:Math.round(minMainMargin*100),minRecoveryMarginPct:Math.round(minRecoveryMargin*100),solidOverlaps,unsafeStandNodes,hash:course.courseHash,colliderHash:course.colliderHash}};
}
