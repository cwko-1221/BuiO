/**
 * Revision-6 semantic-amendment evidence.  This is a proposal-only pixel
 * mask: it opens no visible pet pixels and never alters the production spec.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseArg, tailArg, outputArg] = process.argv.slice(2);
if (![baseArg, tailArg, outputArg].every(Boolean)) throw new Error('usage: node scripts/derive-head20-c01-r6-left-earcup-amendment.mjs <base160> <tail160> <output-dir>');
const SIZE = 160; const C = 4;
const out = path.resolve(outputArg); const basePath = path.resolve(baseArg); const tailPath = path.resolve(tailArg);
const read = (p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const fileSha = async (p) => sha(await fs.readFile(p));
const [base, tail] = await Promise.all([read(basePath), read(tailPath)]);
if (base.info.width !== SIZE || base.info.height !== SIZE || tail.info.width !== SIZE || tail.info.height !== SIZE) throw new Error('expected 160x160 RGBA inputs');

// These row bounds are the newly exposed part of the rounded cup in the
// widened r6 raw crop, after its 129x122 map at (20,5). Existing semantic
// permission already covers x>=31; this mask is the exact x<31 remainder.
const spans = [
  [61, 30, 31], [62, 30, 31], [63, 29, 31], [64, 29, 31], [65, 28, 31],
  [66, 28, 31], [67, 28, 31], [68, 28, 31], [69, 27, 31], [70, 27, 31],
  [71, 27, 31], [72, 27, 31], [73, 27, 31], [74, 27, 31], [75, 27, 31],
  [76, 27, 31], [77, 27, 31], [78, 27, 31], [79, 27, 31], [80, 28, 31],
  [81, 28, 31], [82, 28, 31], [83, 28, 31], [84, 28, 31],
  [87, 29, 31], [88, 29, 31], [89, 30, 31], [90, 30, 31],
];
const oldUnion = (x, y) => (x >= 38 && x < 137 && y >= 5 && y < 127) || (x >= 31 && x < 38 && y >= 28 && y < 101);
const mask = Buffer.alloc(SIZE * SIZE * C);
let candidatePixels = 0; let alphaGt0 = 0; let alphaGte4 = 0; let tailIntersection = 0; let bodyIntersection = 0;
for (const [y, left, right] of spans) for (let x = left; x < right; x += 1) {
  if (oldUnion(x, y)) throw new Error(`not a new r6 pixel ${x},${y}`);
  const at = (y * SIZE + x) * C; const alpha = base.data[at + 3];
  candidatePixels += 1; if (alpha > 0) alphaGt0 += 1; if (alpha >= 4) alphaGte4 += 1;
  if (tail.data[at + 3] >= 128) tailIntersection += 1;
  if (y >= 101) bodyIntersection += 1;
  if (alpha > 3) throw new Error(`extension reaches visible base at ${x},${y}, alpha=${alpha}`);
  mask[at] = mask[at + 1] = mask[at + 2] = mask[at + 3] = 255;
}
if (tailIntersection || bodyIntersection) throw new Error(`protected intersection tail=${tailIntersection} body=${bodyIntersection}`);
await fs.mkdir(out, { recursive: true });
const maskPath = path.join(out, 'r6-left-earcup-extension-allowed-mask.png');
await sharp(mask, { raw: { width: SIZE, height: SIZE, channels: C } }).png({ compressionLevel: 9 }).toFile(maskPath);
const evidence = {
  schemaVersion: 1, job: 'starpatch-cat:1:head-20', cell: 'c01', revision: 'r6', status: 'PROPOSED_SEMANTIC_AMENDMENT',
  purpose: 'permit only the widened raw source’s genuine rounded left ear-cup contour; no rectangular slab, body, tail, legs, paws, bowl, or old extraction input',
  amendment: { id: 'c01-rounded-left-earcup-transparent-arc-r6', boundingZone: [27, 61, 31, 91], pixelMask: maskPath, pixelMaskSha256: await fileSha(maskPath), rule: 'new pixels require original alpha <= 3; all x>=31 pixels are already in the original c01 permission' },
  inputs: { basePath, baseSha256: await fileSha(basePath), tailPath, tailSha256: await fileSha(tailPath) },
  metrics: { candidatePixels, baseAlphaGt0Pixels: alphaGt0, baseAlphaGte4Pixels: alphaGte4, tailIntersectionPixels: tailIntersection, bodyLegPawBowlIntersectionPixels: bodyIntersection, oldUnionIntersectionPixels: 0 },
  protectedRois: { trueTailMask: [114, 74, 129, 101], torsoLegsPawsBowl: [0, 101, 160, 160], rightNaturalEar: [103, 28, 126, 55] },
  verdict: alphaGte4 === 0 && tailIntersection === 0 && bodyIntersection === 0 ? 'PASS_PROPOSED_MINIMAL_TRANSPARENT_EXTENSION' : 'REJECT',
};
await fs.writeFile(path.join(out, 'r6-left-earcup-amendment-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
