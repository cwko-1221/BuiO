import { ASSETS } from '../game-app/public/js/v2/assets.js';
import { buildCourse, validateCourse } from '../game-app/public/js/v2/course.js';
import { ASSET_GEOMETRY } from '../game-app/public/js/v2/asset-geometry.js';
import { alphaBounds, fittedSize } from '../game-app/public/js/v2/colliders.js';
import { MAP_VERSION, MAX_ROUTE_OBJECT_HEIGHT, PLAYER_VISUAL_HEIGHT } from '../game-app/public/js/v2/fixed-map.js';
import { SKY_BANDS, sampleSky } from '../game-app/public/js/v2/background.js';

const failures=[];
const first=buildCourse(0);
const firstReport=validateCourse(first);
if (!firstReport.ok) failures.push(...firstReport.errors);
if (ASSETS.length<195) failures.push(`asset catalog lost shipping assets: expected at least 195, got ${ASSETS.length}`);
if (first.mapVersion!==MAP_VERSION) failures.push('map version mismatch');
if (first.world.width!==5600||first.world.height!==8700) failures.push('world is not fixed at 5600x8700');
if (first.summit.y>=first.start.y) failures.push('summit must be above the start');
if (first.objects.some(object=>object.role==='decor')) failures.push('runtime map contains pass-through decor');

if (SKY_BANDS.length!==6) failures.push(`background expected 6 height bands, got ${SKY_BANDS.length}`);
for (let i=1;i<SKY_BANDS.length;i++) if (SKY_BANDS[i].at<=SKY_BANDS[i-1].at) failures.push('background bands are unordered');
if (new Set(SKY_BANDS.map(band=>sampleSky(band.at).wash)).size!==6) failures.push('background bands are not visually distinct');

for (const asset of ASSETS) {
  const geometry=ASSET_GEOMETRY[asset.id];
  if (!geometry?.parts?.length) { failures.push(`${asset.id}: missing alpha collider`); continue; }
  if (geometry.parts.length>56) failures.push(`${asset.id}: collider too complex (${geometry.parts.length})`);
  if (geometry.parts.some(part=>part.x<0||part.x>1||part.y<0||part.y>1||part.w<=0||part.h<=0)) failures.push(`${asset.id}: invalid collider part`);
}

const canonicalTransforms=JSON.stringify(first.objects.map(({id,assetId,x,y,w,h,angle,role,supportId,behavior})=>({id,assetId,x,y,w,h,angle,role,supportId,behavior})));
const canonicalRoutes=JSON.stringify(first.routes);
for (let index=0;index<500;index++) {
  const course=buildCourse((index+1)*7919);
  if (course.mapVersion!==first.mapVersion||course.courseHash!==first.courseHash||course.colliderHash!==first.colliderHash) failures.push(`seed ${index}: fixed hashes changed`);
  if (JSON.stringify(course.objects.map(({id,assetId,x,y,w,h,angle,role,supportId,behavior})=>({id,assetId,x,y,w,h,angle,role,supportId,behavior})))!==canonicalTransforms) failures.push(`seed ${index}: transforms changed`);
  if (JSON.stringify(course.routes)!==canonicalRoutes) failures.push(`seed ${index}: routes changed`);
}

const byId=new Map(first.objects.map(object=>[object.id,object]));
const nodeById=new Map(first.nodes.map(node=>[node.id,node]));

// Screenshot review contract: removed props stay absent, moved props keep the
// requested rows, and the final launcher remains above-left of the bed.
const screenshotRemoved=['fixed-074','fixed-084','fixed-091','fixed-143','fixed-162','fixed-172','fixed-173','fixed-183','fixed-184','fixed-185','fixed-201'];
for (const id of screenshotRemoved) {
  if (byId.has(id)) failures.push(`${id}: screenshot-reviewed prop returned to the runtime map`);
  if (first.nodes.find(node=>node.objectId===id)?.route!=='removed') failures.push(`${id}: removed prop returned to a route`);
}
for (const [id,y,route] of [['fixed-103',5680,'main'],['fixed-104',5680,'main'],['fixed-171',3330,'main']]) {
  const object=byId.get(id),node=first.nodes.find(item=>item.objectId===id);
  if (!object||Math.abs(object.y-y)>.1||node?.route!==route) failures.push(`${id}: screenshot-reviewed placement changed`);
}
const reviewedBed=byId.get('fixed-200'),reviewedLauncher=byId.get('fixed-202');
if (!reviewedBed||!reviewedLauncher||reviewedLauncher.x>=reviewedBed.x) failures.push('final launcher is no longer left of the bed');
if (reviewedLauncher) {
  const bounds=alphaBounds(reviewedLauncher.assetId,fittedSize(reviewedLauncher));
  const standingAltitude=(first.startAltitudeY-(reviewedLauncher.y+bounds.minY-35))/5;
  if (Math.abs(standingAltitude-1355)>.2) failures.push(`final launcher standing height changed to ${standingAltitude.toFixed(1)}m`);
}

// The first prop climb must remain a compact, forgiving introduction. Large
// side faces can be mathematically reachable yet stop the player before their
// feet ever reach the top (the former crate/shield/barrel dead end).
for (const node of first.nodes.filter(item=>item.route==='main'&&item.altitude>=137&&item.altitude<=258)) {
  const object=byId.get(node.objectId);
  const size=fittedSize(object);
  if (size.h>130.1) failures.push(`${object.id}: early-climb prop is too tall (${size.h.toFixed(0)}px)`);
}
for (const edge of first.routes.main) {
  const a=nodeById.get(edge.from), b=nodeById.get(edge.to);
  if (!a||!b||a.altitude<137||b.altitude>274) continue;
  const ao=byId.get(a.objectId), bo=byId.get(b.objectId);
  const rise=Math.max(0,a.y-b.y);
  const gap=Math.max(0,Math.abs(b.x-a.x)-(fittedSize(ao).w+fittedSize(bo).w)/2);
  if (edge.type==='launcher') continue;
  const doubleJump=bo.tags?.includes('double-jump-gap');
  if (rise>(doubleJump?135:110)) failures.push(`${edge.from}>${edge.to}: early-climb rise is ${rise.toFixed(0)}px`);
  if (gap>(doubleJump?260:180)) failures.push(`${edge.from}>${edge.to}: early-climb gap is ${gap.toFixed(0)}px`);
}

// The entire main route is a chain of compact footholds, not isolated
// oversized set-pieces. Every physical support is at most 1.2 player-heights.
// Most airborne gaps stay below 140px, while a small
// authored set of clearly tagged challenges deliberately requires a double
// jump without approaching the theoretical maximum.
if (MAX_ROUTE_OBJECT_HEIGHT!==PLAYER_VISUAL_HEIGHT*1.2) failures.push('route height limit is not 1.2x the player height');
for (const node of first.nodes.filter(item=>item.route==='main')) {
  const object=byId.get(node.objectId);
  const size=fittedSize(object);
  if (size.h>MAX_ROUTE_OBJECT_HEIGHT+.1) failures.push(`${object.id}: route prop is too tall (${size.h.toFixed(0)}px > ${MAX_ROUTE_OBJECT_HEIGHT}px)`);
  if (size.w>MAX_ROUTE_OBJECT_HEIGHT+.1) failures.push(`${object.id}: route prop is too wide (${size.w.toFixed(0)}px > ${MAX_ROUTE_OBJECT_HEIGHT}px)`);
}
for (const edge of first.routes.main) {
  const a=nodeById.get(edge.from), b=nodeById.get(edge.to);
  if (!a||!b||b.altitude<120) continue;
  const ao=byId.get(a.objectId), bo=byId.get(b.objectId);
  const gap=Math.max(0,Math.abs(b.x-a.x)-(fittedSize(ao).w+fittedSize(bo).w)/2);
  if (edge.type==='launcher') continue;
  const doubleJump=bo.tags?.includes('double-jump-gap');
  const launcherApproach=bo.tags?.includes('launcher-approach-gap');
  if (doubleJump&&(gap<230||gap>255)) failures.push(`${edge.from}>${edge.to}: double-jump gap is ${gap.toFixed(0)}px`);
  if (!doubleJump&&!launcherApproach&&gap>140.1) failures.push(`${edge.from}>${edge.to}: compact-route gap is ${gap.toFixed(0)}px`);
  if (launcherApproach&&!bo.tags?.includes('screenshot-removal-approach')&&(gap<150||gap>175)) failures.push(`${edge.from}>${edge.to}: launcher approach gap is ${gap.toFixed(0)}px`);
  if (bo.tags?.includes('review-spacing')&&gap<105) failures.push(`${edge.from}>${edge.to}: reviewed spacing collapsed to ${gap.toFixed(0)}px`);
}
const doubleJumpCount=first.objects.filter(object=>object.tags?.includes('double-jump-gap')).length;
if (doubleJumpCount<18||doubleJumpCount>34) failures.push(`fixed course must contain 18-34 normal double-jump gaps alongside launchers, got ${doubleJumpCount}`);

// Launcher crossings are short, dense authored boosts. They must use the same
// normal air steering, power 20, and never share crumble logic.
const launcherEdges=first.routes.main.filter(edge=>edge.type==='launcher');
if (launcherEdges.length!==6) failures.push(`expected 6 launcher crossings, got ${launcherEdges.length}`);
const launcherGuides=first.annotations.filter(note=>note.type==='launcher-guide');
if (launcherGuides.length!==launcherEdges.length) failures.push(`expected one direction arrow per launcher, got ${launcherGuides.length}/${launcherEdges.length}`);
for (const edge of launcherEdges) {
  const a=nodeById.get(edge.from),b=nodeById.get(edge.to);
  const ao=byId.get(a.objectId),bo=byId.get(b.objectId);
  const gap=Math.max(0,Math.abs(b.x-a.x)-(fittedSize(ao).w+fittedSize(bo).w)/2);
  if (a.altitude<300) failures.push(`${ao.id}: launcher appears before 300m`);
  if (ao.assetId!=='slingshot-platform'||ao.behavior?.type!=='launcher') failures.push(`${ao.id}: launcher art/behavior mismatch`);
  if (ao.behavior?.power!==20||'airSpeed' in ao.behavior) failures.push(`${ao.id}: launcher must use power 20 and ordinary air steering`);
  if ('velocityX' in ao.behavior||'targetX' in ao.behavior) failures.push(`${ao.id}: launcher must not steer toward its landing`);
  if (ao.angle!==0) failures.push(`${ao.id}: launcher is not vertically aligned`);
  const guide=launcherGuides.find(note=>note.id===`launcher-arrow-${a.altitude}`);
  if (!guide||guide.assetId!=='ref-jump-arrow'||guide.showText!==false) failures.push(`${ao.id}: missing launcher direction arrow`);
  if (guide&&guide.flipX!==(b.x<a.x)) failures.push(`${ao.id}: launcher arrow points in the wrong direction`);
  const rise=a.y-b.y;
  if (gap<130||gap>190||rise<0||rise>190) failures.push(`${edge.from}>${edge.to}: launcher landing is outside the power-20 envelope (${gap.toFixed(0)}px gap, ${rise.toFixed(0)}px rise)`);
  if (ao.tags?.includes('crumble-platform')) failures.push(`${ao.id}: launcher cannot crumble`);
  const apex=ao.behavior.power*ao.behavior.power*.98;
  const overhead=first.nodes.filter(node=>node.route==='main'&&node.id!==a.id&&node.y<a.y-20&&node.y>a.y-apex-60).find(node=>{
    const object=byId.get(node.objectId);
    return object&&Math.abs(node.x-a.x)<fittedSize(object).w/2+34;
  });
  if (overhead) failures.push(`${ao.id}: ${overhead.objectId} is directly above the power-20 flight column`);
}

// Five visible laser gates begin above 700m. Each blocks for two seconds and
// then becomes fully non-colliding for two seconds. The beam must occupy only
// the air gap between its declared consecutive route supports.
if (first.hazards.length!==5) failures.push(`expected 5 timed laser passages, got ${first.hazards.length}`);
for (const hazard of first.hazards) {
  if (hazard.type!=='timed-laser'||hazard.altitude<=700) failures.push(`${hazard.id}: invalid laser type/altitude`);
  if (hazard.cycleMs!==4000||hazard.activeMs!==2000) failures.push(`${hazard.id}: laser must use a 2s blocked / 2s open cycle`);
  if (hazard.x<400||hazard.x>first.world.width-400) failures.push(`${hazard.id}: laser is too close to a world side boundary (${hazard.x.toFixed(0)}px)`);
  const from=first.nodes.find(node=>node.route==='main'&&node.altitude===hazard.fromAltitude);
  const to=first.nodes.find(node=>node.route==='main'&&node.altitude===hazard.toAltitude);
  if (!from||!to) { failures.push(`${hazard.id}: route anchors are missing`); continue; }
  const edge=first.routes.main.find(item=>item.from===from.id&&item.to===to.id);
  if (!edge||edge.type!=='main') failures.push(`${hazard.id}: laser is not inside a normal main-route edge`);
  const fromObject=byId.get(from.objectId),toObject=byId.get(to.objectId);
  const fromSize=fittedSize(fromObject),toSize=fittedSize(toObject);
  const left=from.x<to.x?from.x+fromSize.w/2:to.x+toSize.w/2;
  const right=from.x<to.x?to.x-toSize.w/2:from.x-fromSize.w/2;
  if (hazard.x<=left+hazard.w/2||hazard.x>=right-hazard.w/2) failures.push(`${hazard.id}: beam is not centred in its visible route gap`);
  const overlapsSolid=first.objects.some(object=>{
    const size=fittedSize(object),bounds=alphaBounds(object.assetId,size);
    const objectLeft=object.x+bounds.minX,objectRight=object.x+bounds.maxX;
    const objectTop=object.y+bounds.minY,objectBottom=object.y+bounds.maxY;
    return Math.min(hazard.x+hazard.w/2,objectRight)-Math.max(hazard.x-hazard.w/2,objectLeft)>2
      &&Math.min(hazard.y+hazard.h/2,objectBottom)-Math.max(hazard.y-hazard.h/2,objectTop)>2;
  });
  if (overlapsSolid) failures.push(`${hazard.id}: laser beam overlaps a solid route object`);
}

const farmCheckpoint=first.checkpoints.find(checkpoint=>checkpoint.altitude===573);
const farmFlagNode=first.nodes.find(node=>node.route==='main'&&node.altitude===556);
if (!farmCheckpoint||!farmFlagNode
  ||Math.abs(farmCheckpoint.x-farmFlagNode.x)>1||farmCheckpoint.flagSide!==-1) {
  failures.push('573m flag must overlap the reviewed 556m platform');
}

// Crumbling supports begin only after 300m and average one per ten route
// objects. They never replace checkpoints, double-jump landings or authored
// switchback pivots, and their timing is a stable part of the map manifest.
const crumbleEligible=first.nodes.filter(node=>node.route==='main'&&node.altitude>=300&&node.altitude<1470);
const crumbleNodes=crumbleEligible.filter(node=>byId.get(node.objectId)?.behavior?.type==='crumble');
const expectedCrumbleCount=Math.floor(crumbleEligible.length/10);
if (crumbleNodes.length!==expectedCrumbleCount) failures.push(`expected ${expectedCrumbleCount} crumble supports, got ${crumbleNodes.length}`);
let previousCrumbleIndex=-1;
for (const node of crumbleNodes) {
  const object=byId.get(node.objectId);
  const behavior=object.behavior;
  if (node.altitude<300) failures.push(`${object.id}: crumble support appears before 300m`);
  if (!object.tags?.includes('crumble-platform')) failures.push(`${object.id}: crumble tag missing`);
  if (object.tags?.includes('double-jump-gap')||object.tags?.includes('switchback-turn')) failures.push(`${object.id}: crumble support replaced a protected challenge`);
  if (behavior.triggerDelayMs!==140||behavior.fallDurationMs!==650||behavior.respawnMs!==4000) failures.push(`${object.id}: crumble timing changed`);
  if ([448,573,704,820,930,1058,1198,1324,1464].some(altitude=>Math.abs(node.altitude-altitude)<=8)) failures.push(`${object.id}: crumble support is too close to a checkpoint`);
  const index=crumbleEligible.indexOf(node);
  if (previousCrumbleIndex>=0&&(index-previousCrumbleIndex<7||index-previousCrumbleIndex>14)) failures.push(`${object.id}: crumble interval is ${index-previousCrumbleIndex}, expected about 10`);
  previousCrumbleIndex=index;
}

for (const object of first.objects.filter(item=>item.role==='obstacle'&&item.supportId)) {
  const support=byId.get(object.supportId);
  if (!support) { failures.push(`${object.id}: missing support`); continue; }
  const bounds=alphaBounds(object.assetId,fittedSize(object));
  const supportBounds=alphaBounds(support.assetId,fittedSize(support));
  const bottom=object.y+bounds.maxY, top=support.y+supportBounds.minY;
  if (Math.abs(bottom-top)>2.1) failures.push(`${object.id}: alpha collider is not seated on visible support`);
}
if (first.objects.some(object=>object.role==='decor'&&object.supportId)) failures.push('decor has a physical support');
if (first.objects.filter(object=>object.role==='obstacle').length<8) failures.push('not enough solid tutorial masonry objects');

// Geometric fall probes: every main-route gap either has a visible body below
// it or is guaranteed to cross the world reset line. There is no endless void.
let recovered=0, reset=0;
for (const edge of first.routes.main) {
  const a=nodeById.get(edge.from),b=nodeById.get(edge.to);
  const probeX=(a.x+b.x)/2, probeY=Math.max(a.y,b.y)+20;
  const landing=first.objects.filter(object=>object.role!=='decor').map(object=>{
    const bounds=alphaBounds(object.assetId,fittedSize(object));
    return {object,left:object.x+bounds.minX,right:object.x+bounds.maxX,top:object.y+bounds.minY};
  }).filter(item=>probeX>=item.left&&probeX<=item.right&&item.top>=probeY).sort((x,y)=>x.top-y.top)[0];
  if (landing) recovered++; else reset++;
}
if (recovered+reset!==first.routes.main.length) failures.push('fall probe did not terminate');

if (failures.length) {
  console.error(`Fixed map validation failed (${failures.length})`);
  failures.slice(0,30).forEach(failure=>console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Fixed map validation passed: ${MAP_VERSION}, ${first.objects.length} objects, ${first.nodes.length} route nodes, ${firstReport.stats.launcherEdges} launcher crossings, ${firstReport.stats.mainDescents} descending main edges, ${firstReport.stats.minMainMarginPct}% main / ${firstReport.stats.minRecoveryMarginPct}% recovery margin, ${firstReport.stats.solidOverlaps} unintended overlaps, ${firstReport.stats.unsafeStandNodes} unsafe stands, ${firstReport.stats.blockedOverheads} blocked overheads, 500/500 seeds identical, ${recovered} recovery landings + ${reset} safe resets.`);
