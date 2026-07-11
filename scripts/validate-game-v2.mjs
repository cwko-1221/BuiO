import { ASSETS } from '../game-app/public/js/v2/assets.js';
import { CHUNKS } from '../game-app/public/js/v2/chunks.js';
import { buildCourse, validateCourse } from '../game-app/public/js/v2/course.js';

const failures = [];
const hashes = new Set();
let maxPlain = 0;
let minIrregular = 100;
let minAssets = Infinity;

if (ASSETS.length !== 174) failures.push(`asset catalog expected 174, got ${ASSETS.length}`);
if (CHUNKS.length !== 48) failures.push(`chunk library expected 48, got ${CHUNKS.length}`);

for (let seed = 1; seed <= 500; seed++) {
  const course = buildCourse(seed * 7919);
  const report = validateCourse(course);
  hashes.add(course.courseHash);
  maxPlain = Math.max(maxPlain, report.stats.plainRectPct);
  minIrregular = Math.min(minIrregular, report.stats.irregularPct);
  minAssets = Math.min(minAssets, report.stats.assets);
  if (!report.ok) failures.push(`seed ${seed * 7919}: ${report.errors.join(', ')}`);
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
