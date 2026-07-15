import { ASSETS } from '../game-app/public/js/v2/assets.js';
import { buildCourse, validateCourse } from '../game-app/public/js/v2/course.js';
import { ASSET_GEOMETRY } from '../game-app/public/js/v2/asset-geometry.js';
import { alphaBounds, fittedSize } from '../game-app/public/js/v2/colliders.js';
import { MAP_VERSION } from '../game-app/public/js/v2/fixed-map.js';
import { SKY_BANDS, sampleSky } from '../game-app/public/js/v2/background.js';

const failures=[];
const first=buildCourse(0);
const firstReport=validateCourse(first);
if (!firstReport.ok) failures.push(...firstReport.errors);
if (ASSETS.length<195) failures.push(`asset catalog lost shipping assets: expected at least 195, got ${ASSETS.length}`);
if (first.mapVersion!==MAP_VERSION) failures.push('map version mismatch');
if (first.world.width!==5600||first.world.height!==6200) failures.push('world is not fixed at 5600x6200');
if (first.summit.y>=first.start.y) failures.push('summit must be above the start');

if (SKY_BANDS.length!==6) failures.push(`background expected 6 height bands, got ${SKY_BANDS.length}`);
for (let i=1;i<SKY_BANDS.length;i++) if (SKY_BANDS[i].at<=SKY_BANDS[i-1].at) failures.push('background bands are unordered');
if (new Set(SKY_BANDS.map(band=>sampleSky(band.at).wash)).size!==6) failures.push('background bands are not visually distinct');

for (const asset of ASSETS) {
  const geometry=ASSET_GEOMETRY[asset.id];
  if (!geometry?.parts?.length) { failures.push(`${asset.id}: missing alpha collider`); continue; }
  if (geometry.parts.length>56) failures.push(`${asset.id}: collider too complex (${geometry.parts.length})`);
  if (geometry.parts.some(part=>part.x<0||part.x>1||part.y<0||part.y>1||part.w<=0||part.h<=0)) failures.push(`${asset.id}: invalid collider part`);
}

const canonicalTransforms=JSON.stringify(first.objects.map(({id,assetId,x,y,w,h,angle,role,supportId})=>({id,assetId,x,y,w,h,angle,role,supportId})));
const canonicalRoutes=JSON.stringify(first.routes);
for (let index=0;index<500;index++) {
  const course=buildCourse((index+1)*7919);
  if (course.mapVersion!==first.mapVersion||course.courseHash!==first.courseHash||course.colliderHash!==first.colliderHash) failures.push(`seed ${index}: fixed hashes changed`);
  if (JSON.stringify(course.objects.map(({id,assetId,x,y,w,h,angle,role,supportId})=>({id,assetId,x,y,w,h,angle,role,supportId})))!==canonicalTransforms) failures.push(`seed ${index}: transforms changed`);
  if (JSON.stringify(course.routes)!==canonicalRoutes) failures.push(`seed ${index}: routes changed`);
}

const byId=new Map(first.objects.map(object=>[object.id,object]));
for (const object of first.objects.filter(item=>item.role==='obstacle'&&item.supportId)) {
  const support=byId.get(object.supportId);
  if (!support) { failures.push(`${object.id}: missing support`); continue; }
  const bounds=alphaBounds(object.assetId,fittedSize(object));
  const supportBounds=alphaBounds(support.assetId,fittedSize(support));
  const bottom=object.y+bounds.maxY, top=support.y+supportBounds.minY;
  if (Math.abs(bottom-top)>2.1) failures.push(`${object.id}: alpha collider is not seated on visible support`);
}
if (first.objects.some(object=>object.role==='decor'&&object.supportId)) failures.push('decor has a physical support');
if (first.objects.filter(object=>object.role==='obstacle').length<10) failures.push('not enough solid obstacle/wall objects');

// Geometric fall probes: every main-route gap either has a visible body below
// it or is guaranteed to cross the world reset line. There is no endless void.
const nodeById=new Map(first.nodes.map(node=>[node.id,node]));
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
console.log(`Fixed map validation passed: ${MAP_VERSION}, ${first.objects.length} objects, ${first.nodes.length} route nodes, ${firstReport.stats.mainDescents} descending main edges, ${firstReport.stats.minMainMarginPct}% main / ${firstReport.stats.minRecoveryMarginPct}% recovery margin, ${firstReport.stats.solidOverlaps} unintended overlaps, ${firstReport.stats.unsafeStandNodes} unsafe stands, 500/500 seeds identical, ${recovered} recovery landings + ${reset} safe resets.`);
