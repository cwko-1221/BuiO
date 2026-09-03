/**
 * Derive the minimal, pixel-accurate semantic permission needed to round the
 * c01 left helmet ear-cup. It is a proposal only: it never changes the
 * production head-20 spec or any runtime asset.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseArg, tailArg, outputArg] = process.argv.slice(2);
if (!baseArg || !tailArg || !outputArg) throw new Error('usage: node scripts/derive-head20-c01-r5-left-earcup-amendment.mjs <base160> <tail-mask160> <output-dir>');
const SIZE = 160; const C = 4;
const basePath = path.resolve(baseArg); const tailPath = path.resolve(tailArg); const out = path.resolve(outputArg);
const read = (p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const hashFile = async (p) => hash(await fs.readFile(p));
const [base, tail] = await Promise.all([read(basePath), read(tailPath)]);
if (base.info.width !== SIZE || base.info.height !== SIZE || tail.info.width !== SIZE || tail.info.height !== SIZE) throw new Error('both inputs must be 160x160');

// The only new territory is the transparent left-side arc x=24..30. It is
// deliberately a curved lobe, not a rectangular extension. Old semantic
// permission already begins at x=31.
const spans = [
  [28, 30, 31], [29, 29, 31], [30, 28, 31], [31, 27, 31], [32, 26, 31],
  [33, 25, 31], [34, 24, 31], [35, 24, 31], [36, 24, 31], [37, 24, 31],
  [38, 24, 31], [39, 24, 31], [40, 24, 31], [41, 24, 31], [42, 24, 31],
  [43, 24, 31], [44, 24, 31], [45, 24, 31], [46, 24, 31], [47, 24, 31],
  [48, 24, 31], [49, 24, 31], [50, 24, 31], [51, 24, 31], [52, 24, 31],
  [53, 24, 31], [54, 24, 31], [55, 24, 31], [56, 24, 31], [57, 24, 31],
  [58, 25, 31], [59, 26, 31], [60, 27, 31], [61, 28, 31], [62, 29, 31], [63, 30, 31],
];
const mask = Buffer.alloc(SIZE * SIZE * C); let candidatePixels = 0; let alphaGt0 = 0; let alphaGte4 = 0; let protectedIntersection = 0; let tailIntersection = 0;
const oldUnion = (x, y) => (x >= 38 && x < 137 && y >= 5 && y < 127) || (x >= 31 && x < 38 && y >= 28 && y < 101);
for (const [y, left, right] of spans) for (let x = left; x < right; x += 1) {
  if (oldUnion(x, y)) throw new Error('proposal must contain only newly needed pixels');
  const at = (y * SIZE + x) * C; candidatePixels += 1;
  const alpha = base.data[at + 3]; if (alpha > 0) alphaGt0 += 1; if (alpha >= 4) alphaGte4 += 1;
  if (tail.data[at + 3] >= 128) tailIntersection += 1;
  if (y >= 101) protectedIntersection += 1;
  // Alpha <=3 is a matte-only residual, not a visible original-pet pixel.
  if (alpha > 3) throw new Error(`proposed extension crosses visible base pixel at ${x},${y}, alpha=${alpha}`);
  mask[at] = 255; mask[at + 1] = 255; mask[at + 2] = 255; mask[at + 3] = 255;
}
if (tailIntersection || protectedIntersection) throw new Error(`protected intersection tail=${tailIntersection} body=${protectedIntersection}`);
await fs.mkdir(out, { recursive: true });
const maskPath = path.join(out, 'r5-left-earcup-extension-allowed-mask.png');
await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: C } }).png({ compressionLevel: 9 }).toFile(maskPath);
const evidence = {
  schemaVersion: 1,
  job: 'starpatch-cat:1:head-20', cell: 'c01', revision: 'r5', status: 'PROPOSED_SEMANTIC_AMENDMENT',
  purpose: 'round the left helmet ear-cup contour without allowing a rectangular slab or any body/tail replacement',
  amendment: {
    id: 'c01-rounded-left-earcup-transparent-arc-r5',
    boundingZone: [24, 28, 31, 64],
    pixelMask: maskPath,
    pixelMaskSha256: await hashFile(maskPath),
    rule: 'only pixels with original base alpha <= 3 are newly permitted; old x=31..37 natural-ear permission remains unchanged',
  },
  inputs: { basePath, baseSha256: await hashFile(basePath), tailPath, tailSha256: await hashFile(tailPath) },
  metrics: { candidatePixels, baseAlphaGt0Pixels: alphaGt0, baseAlphaGte4Pixels: alphaGte4, tailIntersectionPixels: tailIntersection, bodyLegPawBowlIntersectionPixels: protectedIntersection, oldUnionIntersectionPixels: 0 },
  protectedRois: { trueTailMask: [114, 74, 129, 101], torsoLegsPawsBowl: [0, 101, 160, 160], rightNaturalEar: [103, 28, 126, 55] },
  verdict: alphaGte4 === 0 && tailIntersection === 0 && protectedIntersection === 0 ? 'PASS_PROPOSED_MINIMAL_TRANSPARENT_EXTENSION' : 'REJECT',
};
await fs.writeFile(path.join(out, 'r5-left-earcup-amendment-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
