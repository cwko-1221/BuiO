/**
 * Derive a pixel-level c01 visible-tail protection mask from the original
 * base crop. This replaces the unsafe x>=104 rectangular tail ROI for the
 * closed-helmet semantic review; it is diagnostic/spec evidence only.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseArg, outputArg] = process.argv.slice(2);
if (!baseArg || !outputArg) {
  console.error('usage: node scripts/derive-head20-c01-tail-protection.mjs <160x160-base> <output-directory>');
  process.exit(1);
}
const basePath = path.resolve(baseArg); const outputDirectory = path.resolve(outputArg);
const SIZE = 160; const RGBA = 4;
const base = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (base.info.width !== SIZE || base.info.height !== SIZE || base.info.channels !== RGBA) throw new Error('base must be 160x160 RGBA');
const alpha = (x, y) => base.data[(y * SIZE + x) * RGBA + 3] >= 128;
const allowed = (x, y) => x >= 114 && x < 141 && y >= 74 && y < 101 && alpha(x, y);
const seed = [118, 82];
if (!allowed(...seed)) throw new Error('tail seed is not an opaque base pixel');
const mask = new Uint8Array(SIZE * SIZE); const queue = [seed[1] * SIZE + seed[0]]; mask[queue[0]] = 1;
for (let head = 0; head < queue.length; head += 1) {
  const index = queue[head]; const x = index % SIZE; const y = Math.floor(index / SIZE);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx; const ny = y + dy;
    if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
    const next = ny * SIZE + nx;
    if (!mask[next] && allowed(nx, ny)) { mask[next] = 1; queue.push(next); }
  }
}
const outputMask = Buffer.alloc(SIZE * SIZE * RGBA); let minX = SIZE; let minY = SIZE; let maxX = -1; let maxY = -1;
let pixels = 0; let rightEarIntersection = 0; let bodyIntersection = 0;
for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
  const index = y * SIZE + x; const at = index * RGBA;
  if (!mask[index]) continue;
  outputMask[at + 3] = 255; pixels += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  if (x >= 103 && x < 126 && y >= 28 && y < 55) rightEarIntersection += 1;
  if (y >= 101) bodyIntersection += 1;
}
const tailMaskPath = path.join(outputDirectory, 'c01-tail-visible-pixels-mask.png');
const evidencePath = path.join(outputDirectory, 'c01-tail-protection-evidence.json');
await fs.mkdir(outputDirectory, { recursive: true });
await sharp(outputMask, { raw: { width: SIZE, height: SIZE, channels: RGBA } }).png({ compressionLevel: 9 }).toFile(tailMaskPath);
const evidence = {
  schemaVersion: 1, job: 'starpatch-cat:1:head-20', cell: 'c01', sourceBase: basePath,
  sourceBaseSha256: crypto.createHash('sha256').update(await fs.readFile(basePath)).digest('hex'),
  method: '4-connected alpha>=128 flood from seed [128,86] constrained to visible-tail semantic window x=[114,141), y=[74,101); excludes head/ear zone and torso below collar',
  seed, constraint: [114, 74, 141, 101], pixels, bounds: [minX, minY, maxX + 1, maxY + 1],
  rightEarRoi: [103, 28, 126, 55], rightEarIntersectionPixels: rightEarIntersection,
  protectedBodyRoi: [0, 101, 160, 160], bodyIntersectionPixels: bodyIntersection,
  tailMaskPath, verdict: rightEarIntersection === 0 && bodyIntersection === 0 ? 'PASS_TIGHT_TAIL_MASK' : 'REJECT_TAIL_MASK_INTERSECTION',
};
await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(evidence, null, 2));
if (evidence.verdict !== 'PASS_TIGHT_TAIL_MASK') process.exit(2);
