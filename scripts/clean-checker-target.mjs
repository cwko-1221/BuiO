/**
 * Freeze a clean 5x4 dressed target from an opaque, checker-backed redraw.
 * Only neutral, bright pixels connected to the atlas border are removed. White
 * accessory panels remain intact when enclosed by their coloured outline.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, outputPath, reportPath] = process.argv.slice(2);
if (!inputPath || !outputPath || !reportPath) {
  console.error('usage: node scripts/clean-checker-target.mjs <checker-target-800x640> <clean-target> <report>');
  process.exit(1);
}
const sourceMetadata = await sharp(inputPath).metadata();
const sourceSize = [sourceMetadata.width, sourceMetadata.height];
// The frozen head-07 authority is the 1402x1122 raw.  The checker reference
// is exactly the raw resized with sharp's lanczos3 kernel (verified byte-for-
// byte); accepting both forms keeps this utility useful for audit reruns while
// making the normalization explicit and deterministic.
const normalized = sourceMetadata.width === 1402 && sourceMetadata.height === 1122
  ? sharp(inputPath).resize(800, 640, { fit: 'fill', kernel: 'lanczos3' })
  : sharp(inputPath);
const image = await normalized.removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = image.info;
if (width !== 800 || height !== 640 || channels !== 3) throw new Error('input must be opaque 800x640 RGB or authoritative 1402x1122 RGB raw');
const pixels = width * height;
const background = new Uint8Array(pixels);
const queued = new Uint8Array(pixels);
const queue = new Int32Array(pixels);
let head = 0;
let tail = 0;
const isChecker = (index) => {
  const at = index * channels;
  const r = image.data[at]; const g = image.data[at + 1]; const b = image.data[at + 2];
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return Math.min(r, g, b) >= 226 && spread <= 7;
};
const push = (index) => {
  if (index < 0 || index >= pixels || queued[index] || !isChecker(index)) return;
  queued[index] = 1; queue[tail++] = index;
};
for (let x = 0; x < width; x += 1) { push(x); push((height - 1) * width + x); }
for (let y = 0; y < height; y += 1) { push(y * width); push(y * width + width - 1); }
while (head < tail) {
  const index = queue[head++]; background[index] = 1;
  const x = index % width; const y = Math.floor(index / width);
  if (x) push(index - 1); if (x + 1 < width) push(index + 1);
  if (y) push(index - width); if (y + 1 < height) push(index + width);
}

// The solid white/lavender cap crown is intentionally close to the checker
// values.  A neutral colour key therefore punches holes through it.  Before
// writing alpha, recover the crown envelope from its cool/lavender seam and
// blue band.  This is a same-coordinate semantic guard, not a transform: it
// only protects pixels in the fixed 160x160 cell where the sailor cap is
// visible.  Warm pet fur/ears are not part of the material predicate.
const CELL = 160;
const localAt = (column, row, x, y) => ((row * CELL + y) * width + column * CELL + x) * channels;
const coolMaterial = (at) => {
  const r = image.data[at]; const g = image.data[at + 1]; const b = image.data[at + 2];
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  // Blue/lavender seams and dark antialiasing are high-confidence material;
  // neutral checker pixels (typically spread <= 2 and min >= 240) are not.
  return (b >= r - 1 && b >= g - 1 && (spread >= 4 || Math.min(r, g, b) < 228))
    || (b > r + 2 && b > g + 1);
};
const blueMaterial = (at) => {
  const r = image.data[at]; const g = image.data[at + 1]; const b = image.data[at + 2];
  return b >= 42 && b > r * 1.06 && b >= g * 0.96 && b - Math.min(r, g, b) >= 18;
};
const capEnvelopes = [];
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  const blueRows = new Array(CELL).fill(0);
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    const at = localAt(column, row, x, y);
    if (blueMaterial(at)) blueRows[y] += 1;
  }
  const bandRow = blueRows.indexOf(Math.max(...blueRows));
  const rows = [];
  for (let y = 0; y <= Math.min(CELL - 1, bandRow + 3); y += 1) {
    const xs = [];
    for (let x = 0; x < CELL; x += 1) if (coolMaterial(localAt(column, row, x, y))) xs.push(x);
    // A one-pixel speck is not a reliable silhouette edge; it is retained in
    // the ordinary border flood-fill but must not expand the crown envelope.
    if (xs.length >= 2) rows.push({ y, min: Math.min(...xs), max: Math.max(...xs) });
  }
  if (!rows.length) { capEnvelopes.push(null); continue; }
  const minY = rows[0].y; const maxY = Math.min(CELL - 1, bandRow + 3);
  const bounds = [];
  const median = (values) => {
    const sorted = values.slice().sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  for (let y = minY; y <= maxY; y += 1) {
    const before = rows.filter((entry) => entry.y <= y).at(-1);
    const after = rows.find((entry) => entry.y >= y);
    const left = before && after ? Math.round(before.min + (after.min - before.min) * ((y - before.y) / Math.max(1, after.y - before.y))) : (before ?? after).min;
    const right = before && after ? Math.round(before.max + (after.max - before.max) * ((y - before.y) / Math.max(1, after.y - before.y))) : (before ?? after).max;
    const sample = rows.filter((entry) => Math.abs(entry.y - y) <= 2);
    bounds.push({ y, min: median(sample.map((entry) => entry.min)), max: median(sample.map((entry) => entry.max)) });
  }
  capEnvelopes.push({ minY, maxY, bounds, bandRow });
}
let crownProtectedPixels = 0;
for (let cell = 0; cell < capEnvelopes.length; cell += 1) {
  const envelope = capEnvelopes[cell];
  if (!envelope) continue;
  const row = Math.floor(cell / 5); const column = cell % 5;
  for (const { y, min, max } of envelope.bounds) for (let x = Math.max(0, min); x <= Math.min(CELL - 1, max); x += 1) {
    const index = (row * CELL + y) * width + column * CELL + x;
    if (background[index]) { background[index] = 2; crownProtectedPixels += 1; }
  }
}
const output = Buffer.alloc(pixels * 4);
let transparentPixels = 0; let opaquePixels = 0; let checkerPixels = 0;
for (let index = 0; index < pixels; index += 1) {
  const sourceAt = index * channels; const outputAt = index * 4;
  const alpha = background[index] === 1 ? 0 : 255;
  if (alpha === 0) { transparentPixels += 1; checkerPixels += 1; }
  else opaquePixels += 1;
  output[outputAt] = image.data[sourceAt]; output[outputAt + 1] = image.data[sourceAt + 1];
  output[outputAt + 2] = image.data[sourceAt + 2]; output[outputAt + 3] = alpha;
  if (!alpha) { output[outputAt] = 0; output[outputAt + 1] = 0; output[outputAt + 2] = 0; }
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outputPath);
const sha256 = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report = {
  verdict: 'CLEAN_TARGET_FROZEN', inputPath, outputPath, canvas: '800x640', connectivity: 4,
  checkerRule: 'min RGB >= 226 and channel spread <= 7, border-connected only; cool cap envelope protects white/lavender crown',
  sourceSize, normalization: sourceSize[0] === 1402 && sourceSize[1] === 1122 ? 'sharp lanczos3 1402x1122 -> 800x640' : 'none (already 800x640)',
  crownProtectedPixels,
  transparentPixels, opaquePixels, checkerPixels,
  inputSha256: await sha256(inputPath), outputSha256: await sha256(outputPath),
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
