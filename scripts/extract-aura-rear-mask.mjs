/**
 * Extract a rear-only aura from a dressed atlas without touching pet pixels.
 * The base alpha is the occlusion contract: a rear aura may only be visible where
 * the original pet is transparent. This is a fast category-specific pilot, not a
 * replacement for the final visual critic.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, basePath, maskPath, layerPath, reportPath] = process.argv.slice(2);
if (!targetPath || !basePath || !maskPath || !layerPath) {
  console.error('usage: node scripts/extract-aura-rear-mask.mjs <target> <base> <mask> <layer> [report.json]');
  process.exit(1);
}
const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (file) => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const [target, base] = await Promise.all([read(targetPath), read(basePath)]);
if (target.info.width !== WIDTH || base.info.width !== WIDTH || target.info.height !== HEIGHT || base.info.height !== HEIGHT) {
  throw new Error('aura inputs must be 800x640');
}
const mask = Buffer.alloc(WIDTH * HEIGHT * 4);
const layer = Buffer.alloc(WIDTH * HEIGHT * 4);
const neighbours = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const idx = (x, y) => (y * WIDTH + x) * 4;
const eyeRoiFor = (row, column) => {
  if (row === 0) return { minX: 32, maxX: 128, minY: 68, maxY: 122 };
  if (row === 1) return { minX: 78, maxX: 148, minY: 62, maxY: 120 };
  if (row === 3 && column === 2) return { minX: 8, maxX: 115, minY: 78, maxY: 145 };
  if (row === 3) return { minX: 28, maxX: 132, minY: 66, maxY: 128 };
  return null;
};
const tailRoiFor = (row) => {
  if (row === 1) return { minX: 0, maxX: 72, minY: 34, maxY: 122 };
  if (row === 2) return { minX: 42, maxX: 112, minY: 54, maxY: 132 };
  return null;
};
const inRoi = (x, y, roi) => roi && x >= roi.minX && x <= roi.maxX && y >= roi.minY && y <= roi.maxY;
// Keep a small safety moat around the original pet silhouette. This absorbs
// anti-aliased fur edges while preserving the aura ring outside the pet.
const protectedBase = new Uint8Array(WIDTH * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) for (let x = 0; x < WIDTH; x += 1) {
  const at = idx(x, y);
  if (base.data[at + 3] < 32) continue;
  for (let oy = -10; oy <= 10; oy += 1) for (let ox = -10; ox <= 10; ox += 1) {
    if (ox * ox + oy * oy > 100) continue;
    const nx = x + ox; const ny = y + oy;
    if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) protectedBase[ny * WIDTH + nx] = 1;
  }
}
const isSeed = (at) => {
  const x = (at / 4) % WIDTH; const y = Math.floor((at / 4) / WIDTH);
  const row = Math.floor(y / CELL); const column = Math.floor(x / CELL);
  const localX = x % CELL; const localY = y % CELL;
  if (target.data[at + 3] < 40 || protectedBase[y * WIDTH + x] || inRoi(localX, localY, eyeRoiFor(row, column)) || inRoi(localX, localY, tailRoiFor(row))) return false;
  const r = target.data[at]; const g = target.data[at + 1]; const b = target.data[at + 2];
  const blue = b > 95 && b > r * 1.08 && b > g * 1.03;
  const purple = b > 90 && r > g * 1.05 && b > g * 1.15;
  const cyan = g > 105 && b > 105 && g > r * 1.05 && b > r * 1.05;
  const gold = r > 170 && g > 95 && b < 135 && r > g * 1.13 && g > b * 1.2;
  return blue || purple || cyan || gold;
};
const isPaintedAura = (at) => {
  const x = (at / 4) % WIDTH; const y = Math.floor((at / 4) / WIDTH);
  const row = Math.floor(y / CELL); const column = Math.floor(x / CELL);
  const localX = x % CELL; const localY = y % CELL;
  if (target.data[at + 3] < 20 || protectedBase[y * WIDTH + x] || inRoi(localX, localY, eyeRoiFor(row, column)) || inRoi(localX, localY, tailRoiFor(row))) return false;
  const r = target.data[at]; const g = target.data[at + 1]; const b = target.data[at + 2];
  const chroma = Math.max(r, g, b) - Math.min(r, g, b);
  const blueTint = b > r * 1.03 && b > g * 1.03 && b > 90;
  const purpleTint = b > g * 1.08 && r > g * 1.02 && b > 85;
  const cyanTint = g > r * 1.03 && b > r * 1.03 && g > 85;
  const warmStar = r > 155 && g > 82 && b < 145 && r > g * 1.08 && g > b * 1.15;
  return chroma > 18 && (blueTint || purpleTint || cyanTint || warmStar);
};
const selected = new Uint8Array(WIDTH * HEIGHT);
let seedPixels = 0;
let nearbyNeutralPixels = 0;
const neutral = (at) => {
  const r = target.data[at]; const g = target.data[at + 1]; const b = target.data[at + 2];
  return Math.min(r, g, b) >= 226 && Math.max(r, g, b) - Math.min(r, g, b) <= 7;
};
// Keep the complete rear effect, including pale antialiasing, but reject large
// neutral checker remnants unless they touch chromatic aura paint.
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    const gx = column * CELL + x; const gy = row * CELL + y; const at = idx(gx, gy);
    const protectedPixel = protectedBase[gy * WIDTH + gx]
      || inRoi(x, y, eyeRoiFor(row, column))
      || inRoi(x, y, tailRoiFor(row));
    if (protectedPixel || target.data[at + 3] < 20) continue;
    if (!neutral(at)) { selected[gy * WIDTH + gx] = 1; if (isSeed(at)) seedPixels += 1; continue; }
    let chromaticNeighbour = false;
    for (let oy = -2; oy <= 2 && !chromaticNeighbour; oy += 1) for (let ox = -2; ox <= 2; ox += 1) {
      const nx = x + ox; const ny = y + oy;
      if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
      const neighbourAt = idx(column * CELL + nx, row * CELL + ny);
      if (!neutral(neighbourAt) && isPaintedAura(neighbourAt)) { chromaticNeighbour = true; break; }
    }
    if (chromaticNeighbour) { selected[gy * WIDTH + gx] = 1; nearbyNeutralPixels += 1; }
  }
}
let maskPixels = 0;
for (let y = 0; y < HEIGHT; y += 1) for (let x = 0; x < WIDTH; x += 1) {
  const at = idx(x, y); const selectedPixel = selected[y * WIDTH + x] === 1;
  if (!selectedPixel) continue;
  mask[at] = 255; mask[at + 1] = 255; mask[at + 2] = 255; mask[at + 3] = 255;
  layer[at] = target.data[at]; layer[at + 1] = target.data[at + 1]; layer[at + 2] = target.data[at + 2]; layer[at + 3] = target.data[at + 3];
  maskPixels += 1;
}
await Promise.all([
  fs.mkdir(path.dirname(maskPath), { recursive: true }),
  fs.mkdir(path.dirname(layerPath), { recursive: true }),
]);
await Promise.all([
  sharp(mask, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png({ compressionLevel: 9 }).toFile(maskPath),
  sharp(layer, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png({ compressionLevel: 9 }).toFile(layerPath),
]);
const report = {
  targetPath, basePath, maskPath, layerPath,
  category: 'aura', layerRole: 'rear', transformed: false,
  seedPixels, maskPixels, petOcclusionRule: 'base alpha >= 32 is never masked',
  verdict: maskPixels > 0 ? 'CANDIDATE_FOR_COMPOSITE_QA' : 'REJECT_NO_AURA_SEEDS',
};
if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
