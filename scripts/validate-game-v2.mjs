import { ASSETS } from '../game-app/public/js/v2/assets.js';
import { CHUNKS } from '../game-app/public/js/v2/chunks.js';
import { buildCourse, validateCourse } from '../game-app/public/js/v2/course.js';
import { ASSET_GEOMETRY } from '../game-app/public/js/v2/asset-geometry.js';
import { fittedSize } from '../game-app/public/js/v2/colliders.js';

const failures = [];
const hashes = new Set();
let maxPlain = 0;
let minIrregular = 100;
let minAssets = Infinity;

if (ASSETS.length !== 174) failures.push(`asset catalog expected 174, got ${ASSETS.length}`);
if (CHUNKS.length !== 48) failures.push(`chunk library expected 48, got ${CHUNKS.length}`);
for (const asset of ASSETS) {
  const geometry = ASSET_GEOMETRY[asset.id];
  if (!geometry?.parts?.length) { failures.push(`${asset.id}: missing alpha collider`); continue; }
  if (geometry.parts.length > 56) failures.push(`${asset.id}: collider too complex (${geometry.parts.length} parts)`);
  if (geometry.parts.some(part => part.x < 0 || part.x > 1 || part.y < 0 || part.y > 1 || part.w <= 0 || part.h <= 0)) failures.push(`${asset.id}: invalid normalized collider part`);
  const fitted = fittedSize({ assetId:asset.id, asset, w:asset.renderSize.w, h:asset.renderSize.h });
  if (Math.abs(fitted.w / fitted.h - geometry.aspect) > .001) failures.push(`${asset.id}: render aspect is distorted`);
  if (fitted.w > asset.renderSize.w * 2.4 + .01 || fitted.h > asset.renderSize.h * 2.4 + .01) failures.push(`${asset.id}: fitted size exceeds safe authored bounds`);
}

for (let seed = 1; seed <= 500; seed++) {
  const course = buildCourse(seed * 7919);
  const report = validateCourse(course);
  hashes.add(course.courseHash);
  maxPlain = Math.max(maxPlain, report.stats.plainRectPct);
  minIrregular = Math.min(minIrregular, report.stats.irregularPct);
  minAssets = Math.min(minAssets, report.stats.assets);
  if (!report.ok) failures.push(`seed ${seed * 7919}: ${report.errors.join(', ')}`);
  for (const object of course.objects) {
    const geometry = ASSET_GEOMETRY[object.assetId];
    const size = fittedSize(object);
    if (size.w < 41.99) failures.push(`seed ${seed * 7919}: ${object.assetId} is narrower than the player foothold`);
    if (Math.abs(size.w / size.h - geometry.aspect) > .001) failures.push(`seed ${seed * 7919}: ${object.assetId} placement distorts aspect`);
  }
  const repeat = buildCourse(seed * 7919);
  if (repeat.courseHash !== course.courseHash) failures.push(`seed ${seed * 7919}: non-deterministic course hash`);
}

if (hashes.size < 450) failures.push(`course diversity too low: ${hashes.size}/500 unique hashes`);
if (failures.length) {
  console.error(`Game V2 validation failed (${failures.length})`);
  failures.slice(0, 25).forEach(f => console.error(`- ${f}`));
  process.exit(1);
}

console.log(`Game V2 validation passed: ${ASSETS.length} assets, ${CHUNKS.length} chunks, 500 seeds, ${hashes.size} unique maps, max ${maxPlain}% plain rectangles, min ${minIrregular}% irregular, min ${minAssets} assets/run.`);
