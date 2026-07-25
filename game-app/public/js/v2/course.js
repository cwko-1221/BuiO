import { ASSET_BY_ID, REJECTED_STYLE_ASSET_IDS, SIDE_VIEW_BLOCK_IDS, ZONES, ZONE_NAMES } from './assets.js?v=20260719-six-launchers';
import { ASSET_GEOMETRY } from './asset-geometry.js?v=20260719-six-launchers';
import { alphaBounds, fittedSize } from './colliders.js?v=20260719-six-launchers';
import { FIXED_MAP, MAP_VERSION } from './fixed-map.js?v=20260725-unique-checkpoints-1';

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
  const objectById=new Map(objects.map(object=>[object.id,object]));
  const nodes=FIXED_MAP.nodes.map(source=>{
    const object=objectById.get(source.objectId);
    if (!object) return {...source};
    const size=fittedSize(object);
    const bounds=alphaBounds(object.assetId,size);
    // Route sensors, checkpoints and validation all use the real painted top
    // of the support instead of the loose authoring box.
    return {...source,x:object.x,y:object.y+bounds.minY-8};
  });
  const nodeByAltitude=altitude=>nodes.filter(node=>node.route==='main').sort((a,b)=>Math.abs(a.altitude-altitude)-Math.abs(b.altitude-altitude))[0];
  const sensors=FIXED_MAP.progressSensors.map(sensor=>({...sensor}));
  const sensorByAltitude=altitude=>sensors.slice().sort((a,b)=>Math.abs(a.altitude-altitude)-Math.abs(b.altitude-altitude))[0];
  const checkpoints=FIXED_MAP.checkpoints.map(source=>{
    const node=nodeByAltitude(source.nodeAltitude??source.altitude);
    const sensor=sensorByAltitude(source.altitude);
    const zone=FIXED_MAP.zones.find(item=>source.altitude>=item.min && source.altitude<=item.max)?.id || 'castle';
    return {...source,x:source.x??node.x,y:source.y??node.y,progress:sensor.progress,zone,zoneName:ZONE_NAMES[zone]};
  });
  const instances=FIXED_MAP.zones.map((zone,index)=>({id:`fixed-zone-${zone.id}`,chunkId:`fixed-${zone.id}`,zone:zone.id,zoneName:ZONE_NAMES[zone.id],slot:index,difficulty:index+1,bounds:{x:0,y:FIXED_MAP.world.startY-zone.max*5,w:FIXED_MAP.world.width,h:(zone.max-zone.min)*5}}));
  const transformText=objects.map(object=>`${object.id}:${object.assetId}:${object.x}:${object.y}:${object.w}:${object.h}:${object.angle}:${object.role}:${object.supportId||''}:${JSON.stringify(object.behavior)}`).join('|');
  const routeText=Object.values(FIXED_MAP.routes).flat().map(edge=>`${edge.type}:${edge.from}>${edge.to}`).join('|');
  const hazardText=FIXED_MAP.hazards.map(hazard=>`${hazard.id}:${hazard.type}:${hazard.x}:${hazard.y}:${hazard.w}:${hazard.h}:${hazard.cycleMs}:${hazard.activeMs}:${hazard.phaseMs}`).join('|');
  const colliderText=objects.filter(object=>object.role!=='decor').map(object=>`${object.id}:${JSON.stringify(ASSET_GEOMETRY[object.assetId]?.parts||[])}`).join('|');
  const courseHash=hashString(`${MAP_VERSION}|${transformText}|${routeText}|${hazardText}`);
  const colliderHash=hashString(`${MAP_VERSION}|${colliderText}|${hazardText}`);
  return {
    seed, mapVersion:MAP_VERSION,
    world:{width:FIXED_MAP.world.width,height:FIXED_MAP.world.height},
    start:{...FIXED_MAP.start}, summit:{...FIXED_MAP.summit}, startAltitudeY:FIXED_MAP.start.y,
    objects,nodes,routes:{main:FIXED_MAP.routes.main.map(edge=>({...edge})),shortcut:FIXED_MAP.routes.shortcut.map(edge=>({...edge})),recovery:FIXED_MAP.routes.recovery.map(edge=>({...edge}))},
    sensors,checkpoints,instances,
    recoveryBounds:FIXED_MAP.recoveryBounds.map(item=>({...item})), hazards:FIXED_MAP.hazards.map(item=>({...item})),
    annotations:(FIXED_MAP.annotations||[]).map(item=>({...item,arrow:item.arrow?{...item.arrow}:undefined})),
    usedAssets:[...new Set([
      ...objects.map(object=>object.assetId),
      ...(FIXED_MAP.annotations||[]).map(item=>item.assetId).filter(Boolean),
      'checkpoint-flag','ref-summit-flag'
    ])],
    stageCount:ZONES.length,stages:ZONES.map(zone=>ZONE_NAMES[zone]),courseHash,colliderHash
  };
}

export function validateCourse(course) {
  const errors=[];
  if (course.mapVersion!==MAP_VERSION) errors.push('unexpected map version');
  if (course.world.width!==5600 || course.world.height!==8700) errors.push('fixed world must be 5600x8700');
  if (course.instances.length!==6) errors.push(`expected 6 authored zones, got ${course.instances.length}`);
  if (course.checkpoints.map(item=>item.altitude).join(',')!=='0,210,274,448,573,704,820,930,1058,1198,1324,1464') errors.push('checkpoint altitudes changed');
  const checkpointNames=course.checkpoints.map(item=>item.name);
  if (checkpointNames.some(name=>typeof name!=='string'||!name.trim())) errors.push('every checkpoint must have a name');
  if (new Set(checkpointNames).size!==checkpointNames.length) errors.push('checkpoint names must be unique');
  const nodes=new Map(course.nodes.map(node=>[node.id,node]));
  const objects=new Map(course.objects.map(object=>[object.id,object]));
  for (const object of course.objects.filter(item=>item.role!=='decor')) {
    const size=fittedSize(object);
    if (object.x-size.w/2<-4||object.x+size.w/2>course.world.width+4) errors.push(`${object.id} extends beyond the fixed world width`);
  }
  for (const [name,edges] of Object.entries(course.routes)) for (const edge of edges) {
    if (!nodes.has(edge.from)||!nodes.has(edge.to)) errors.push(`${name} edge references a missing node`);
  }
  let minMainMargin=1;
  let minLauncherMargin=1;
  let launcherEdges=0;
  let mainDescents=0;
  for (const edge of course.routes.main) {
    const a=nodes.get(edge.from), b=nodes.get(edge.to);
    if (!a||!b) continue;
    if (b.altitude<a.altitude) {
      mainDescents++;
      errors.push(`main edge ${edge.from}>${edge.to} descends; the authored route must keep climbing`);
    }
    const ao=objects.get(a.objectId), bo=objects.get(b.objectId);
    const aw=fittedSize(ao).w, bw=fittedSize(bo).w;
    const gap=Math.max(0,Math.abs(b.x-a.x)-(aw+bw)/2);
    const rise=Math.max(0,a.y-b.y);
    const launcherEdge=edge.type==='launcher'&&ao.behavior?.type==='launcher';
    if (launcherEdge) {
      launcherEdges++;
      const margin=Math.min(1-gap/400,1-rise/300);
      minLauncherMargin=Math.min(minLauncherMargin,margin);
      if (gap<130||gap>190) errors.push(`launcher edge ${edge.from}>${edge.to} has an unsafe power-20 landing gap (${gap.toFixed(0)}px)`);
      const {power,flightMs}=ao.behavior;
      if (rise<0||rise>190||power!==20||'airSpeed' in ao.behavior||flightMs<1600||flightMs>2200) {
        errors.push(`launcher edge ${edge.from}>${edge.to} exceeds its normal-control envelope (${gap.toFixed(0)}px gap, ${rise.toFixed(0)}px rise, ${power} power)`);
      }
      // Matter's measured apex is just under 0.98 * power² for this player.
      // A full-height launch is intentional; instead of lowering the force,
      // keep its vertical column free of later route platforms.
      const estimatedApex=power*power*.98;
      if (estimatedApex<rise+16) errors.push(`launcher edge ${edge.from}>${edge.to} has insufficient apex clearance`);
      const overhead=course.nodes.filter(node=>node.route==='main'&&node.id!==a.id&&node.y<a.y-20&&node.y>a.y-estimatedApex-60).find(node=>{
        const object=objects.get(node.objectId);
        return object&&Math.abs(node.x-a.x)<fittedSize(object).w/2+34;
      });
      if (overhead) errors.push(`launcher edge ${edge.from}>${edge.to} has ${overhead.id} directly above its flight column`);
      continue;
    }
    const horizontalMargin=1-gap/360;
    const verticalMargin=1-rise/165;
    const margin=Math.min(horizontalMargin,verticalMargin);
    minMainMargin=Math.min(minMainMargin,margin);
    if (margin<.18) errors.push(`main edge ${edge.from}>${edge.to} has only ${(margin*100).toFixed(1)}% margin`);
    // The broad theoretical envelope above includes a fully accelerated
    // double-jump. Main-route edges must also be comfortable from rest, which
    // is the situation after a player stops to answer a question. The safe
    // airborne gap shrinks as the destination rises.
    const authoredDoubleJump=bo.tags?.includes('double-jump-gap');
    const launcherApproach=bo.tags?.includes('launcher-approach-gap');
    const restStartGap=authoredDoubleJump?260:launcherApproach?180:Math.max(120,260-rise);
    if (gap>restStartGap) errors.push(`main edge ${edge.from}>${edge.to} cannot be cleared from rest (${gap.toFixed(0)}px gap, ${rise.toFixed(0)}px rise)`);
  }
  // Recovery paths may fall back, but the visible main line is deliberately
  // one continuous ascent.  This prevents a future edit from quietly turning
  // the map back into stacked horizontal rows.
  if (mainDescents>0) errors.push(`fixed route has ${mainDescents} descending main edges`);
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
  if (course.objects.some(object=>object.role==='decor')) errors.push('playable course must not contain pass-through decor objects');
  const timedLasers=course.hazards.filter(hazard=>hazard.type==='timed-laser');
  if (course.hazards.length!==5||timedLasers.length!==5) errors.push(`fixed course must contain exactly 5 timed lasers, got ${timedLasers.length}/${course.hazards.length}`);
  for (const hazard of timedLasers) {
    if (hazard.altitude<=700) errors.push(`${hazard.id} appears below the 700m laser section`);
    if (hazard.cycleMs!==4000||hazard.activeMs!==2000) errors.push(`${hazard.id} must alternate 2 seconds blocked / 2 seconds open`);
    if (hazard.w<8||hazard.w>20||hazard.h<320) errors.push(`${hazard.id} has an invalid passage beam size`);
    if (hazard.x-hazard.w/2<0||hazard.x+hazard.w/2>course.world.width) errors.push(`${hazard.id} extends beyond the fixed world width`);
    if (hazard.x<400||hazard.x>course.world.width-400) errors.push(`${hazard.id} is too close to a world side boundary`);
  }
  const farmCheckpoint=course.checkpoints.find(checkpoint=>checkpoint.altitude===573);
  const farmFlagNode=course.nodes.find(node=>node.route==='main'&&node.altitude===556);
  if (!farmCheckpoint||!farmFlagNode
    ||Math.abs(farmCheckpoint.x-farmFlagNode.x)>1||farmCheckpoint.flagSide!==-1) {
    errors.push('573m checkpoint is not attached to the reviewed 556m platform');
  }
  const sideViewBlocks=course.objects.filter(object=>SIDE_VIEW_BLOCK_IDS.has(object.assetId));
  if (sideViewBlocks.length) errors.push(`front-facing course contains side-view blocks: ${sideViewBlocks.map(object=>object.assetId).join(', ')}`);
  const rejectedStyle=course.objects.filter(object=>REJECTED_STYLE_ASSET_IDS.has(object.assetId));
  if (rejectedStyle.length) errors.push(`course contains rejected placeholder art: ${rejectedStyle.map(object=>object.assetId).join(', ')}`);

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
  // Some authored route nodes are intentionally "touch-and-go" footholds
  // (bowls, logs and narrow boats). They are still checked by the jump-envelope
  // graph, but only nodes explicitly marked safe are required to hold a full
  // idle player column.
  for (const node of course.nodes.filter(item=>item.route==='main'&&item.safe!==false)) {
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

  // Across the full 1500m route, a later support must never become a low
  // ceiling over an earlier foothold. Reserve 120px (well above the 70px
  // character) so normal and double-jump arcs both have breathing room.
  const mainIds=new Set(course.nodes.filter(node=>node.route==='main').map(node=>node.objectId));
  const mainSolids=solids.filter(solid=>mainIds.has(solid.object.id));
  let blockedOverheads=0;
  for (let i=0;i<mainSolids.length;i++) for (let j=0;j<mainSolids.length;j++) {
    if (i===j) continue;
    const lower=mainSolids[i], upper=mainSolids[j];
    if (lower.object.tags?.includes('screenshot-tight-clearance')
      &&upper.object.tags?.includes('screenshot-tight-clearance')) continue;
    if (upper.bottom>=lower.top) continue;
    const overlapX=Math.min(lower.right,upper.right)-Math.max(lower.left,upper.left);
    const clearance=lower.top-upper.bottom;
    if (overlapX>4&&clearance<120) {
      blockedOverheads++;
      if (blockedOverheads<=8) errors.push(`${lower.object.id} has only ${clearance.toFixed(0)}px clearance below ${upper.object.id}`);
    }
  }
  return {ok:errors.length===0,errors,stats:{mapVersion:course.mapVersion,objects:course.objects.length,assets:course.usedAssets.length,nodes:course.nodes.length,mainEdges:course.routes.main.length,launcherEdges,minLauncherMarginPct:Math.round(minLauncherMargin*100),recoveryEdges:course.routes.recovery.length,obstacles:obstacles.length,mainDescents,minMainMarginPct:Math.round(minMainMargin*100),minRecoveryMarginPct:Math.round(minRecoveryMargin*100),solidOverlaps,unsafeStandNodes,blockedOverheads,hash:course.courseHash,colliderHash:course.colliderHash}};
}
