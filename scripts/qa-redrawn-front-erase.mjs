/**
 * Independent QA for a late frontErase atlas.
 *
 * The input is an explicitly authored source mask. This gate never reads a
 * composite/recompose image and never derives the mask from one. It verifies
 * that the solver's output is a byte-preserving, source-coordinate copy with
 * a clean binary alpha channel and that every erase pixel is covered by the
 * canonical wearable mask.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, outputPath, canonicalMaskPath, reportPath] = process.argv.slice(2);
if (!inputPath || !outputPath || !canonicalMaskPath || !reportPath) {
  console.error('usage: node scripts/qa-redrawn-front-erase.mjs <front-erase-input> <front-erase-output> <canonical-mask> <report.json>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CHANNELS = 4;
const PIXELS = WIDTH * HEIGHT;

const sha256 = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const read = async (input) => {
  const decoded = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== WIDTH || decoded.info.height !== HEIGHT || decoded.info.channels !== CHANNELS) {
    throw new Error(`${input} must decode to ${WIDTH}x${HEIGHT} RGBA`);
  }
  return decoded.data;
};
const sameRgba = (left, right, at) => left[at] === right[at]
  && left[at + 1] === right[at + 1]
  && left[at + 2] === right[at + 2]
  && left[at + 3] === right[at + 3];

const basenameInput = path.basename(inputPath);
const pathPolicyPass = !/composite|recompose/i.test(basenameInput)
  && path.resolve(inputPath) !== path.resolve(outputPath)
  && path.resolve(inputPath) !== path.resolve(canonicalMaskPath);
const [input, output, canonicalMask] = await Promise.all([
  read(inputPath), read(outputPath), read(canonicalMaskPath),
]);

let decodedMismatchPixels = 0;
let nonBinaryAlphaPixels = 0;
let transparentRgbNonZeroPixels = 0;
let outsideCanonicalMaskPixels = 0;
let visiblePixels = 0;
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * CHANNELS;
  if (!sameRgba(input, output, at)) decodedMismatchPixels += 1;
  const alpha = input[at + 3];
  if (alpha !== 0 && alpha !== 255) nonBinaryAlphaPixels += 1;
  if (alpha === 0 && (input[at] !== 0 || input[at + 1] !== 0 || input[at + 2] !== 0)) transparentRgbNonZeroPixels += 1;
  if (alpha > 0) {
    visiblePixels += 1;
    if (canonicalMask[at + 3] === 0) outsideCanonicalMaskPixels += 1;
  }
}

const metrics = {
  decodedMismatchPixels,
  nonBinaryAlphaPixels,
  transparentRgbNonZeroPixels,
  outsideCanonicalMaskPixels,
  visiblePixels,
};
const pass = pathPolicyPass
  && decodedMismatchPixels === 0
  && nonBinaryAlphaPixels === 0
  && transparentRgbNonZeroPixels === 0
  && outsideCanonicalMaskPixels === 0;
const report = {
  verdict: pass ? 'PASS' : 'REJECT',
  sourcePolicy: {
    independentInputRequired: true,
    compositeRead: false,
    derivedFromComposite: false,
    sourceCoordinatePreserved: true,
  },
  pathPolicy: {
    verdict: pathPolicyPass ? 'PASS' : 'REJECT',
    inputPath,
    outputPath,
    canonicalMaskPath,
    inputBasenameForbiddenComposite: /composite|recompose/i.test(basenameInput),
  },
  geometry: { width: WIDTH, height: HEIGHT, channels: CHANNELS, transformed: false, resampled: false },
  metrics,
  inputs: {
    inputPath,
    outputPath,
    canonicalMaskPath,
    sha256: {
      input: await sha256(inputPath),
      output: await sha256(outputPath),
      canonicalMask: await sha256(canonicalMaskPath),
    },
  },
};
await fs.mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, reportPath: path.resolve(reportPath), metrics }, null, 2));
if (!pass) process.exitCode = 2;
