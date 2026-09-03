/**
 * Final, targeted cleanup for head-06 locked target v3.
 *
 * All cells begin with refined v1. Only feeding (r3c0) and sleeping
 * (r3c2) are changed. Every retained/restored pixel stays at its original
 * 800x640 target coordinate; no transform or resampling is performed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, preliminaryMaskPath, refinedV1MaskPath, outputPath] = process.argv.slice(2);
if (!targetPath || !preliminaryMaskPath || !refinedV1MaskPath || !outputPath) {
  console.error('usage: node scripts/finalize-redrawn-cloudcap-locked-v3-mask.mjs <target> <preliminary-mask> <refined-v1-mask> <output-mask>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  }
  return result.data;
};
const [target, preliminary, refinedV1] = await Promise.all([
  read(targetPath), read(preliminaryMaskPath), read(refinedV1MaskPath),
]);
const output = Buffer.from(refinedV1);
const atFor = (row, column, x, y) => ((((row * CELL) + y) * WIDTH + (column * CELL) + x) * 4);
const setSelected = (at, selected) => {
  output[at] = selected ? 255 : 0;
  output[at + 1] = selected ? 255 : 0;
  output[at + 2] = selected ? 255 : 0;
  output[at + 3] = selected ? 255 : 0;
};
const colour = (at) => {
  const r = target[at];
  const g = target[at + 1];
  const b = target[at + 2];
  return {
    r, g, b,
    cloudWhite: r > 132 && g > 128 && b > 140
      && Math.max(r, g, b) - Math.min(r, g, b) < 64
      && b >= r - 7 && b >= g - 5,
    sleepCloud: r > 150 && g > 145 && b > 148
      && b >= r - 28 && b >= g - 20,
    capBlue: b > 70 && g > 48 && b > r * 1.025 && b > g * 0.86,
    lavender: b > 82 && r > 45 && g > 45 && b >= r - 2 && b >= g - 3,
    strictCoolInk: r < 150 && g < 160 && b < 205
      && b >= r * 0.88 && b >= g * 0.86,
    cheekPink: r > 158 && g > 78 && b > 84 && r > g * 1.07 && r > b * 1.02,
    rainbowRed: r > 135 && r - g > 32 && b >= g * 0.62,
    rainbowYellow: r > 165 && g > 118 && b < 122 && r - g < 105,
    rainbowGreen: g > 92 && g >= r * 0.62 && g > b * 1.04,
    rainbowBlue: b > 78 && g > 55 && b >= r * 0.94,
  };
};
const pointInPolygon = (x, y, polygon) => {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [currentX, currentY] = polygon[current];
    const [previousX, previousY] = polygon[previous];
    const crosses = ((currentY > y) !== (previousY > y))
      && (x < ((previousX - currentX) * (y - currentY)) / (previousY - currentY) + currentX);
    if (crosses) inside = !inside;
  }
  return inside;
};

let feedingRemoved = 0;
const starPolygon = [
  [108, 27], [112, 38], [124, 39], [114, 47], [117, 60],
  [107, 52], [97, 59], [100, 47], [91, 40], [103, 38],
];
for (let y = 18; y <= 36; y += 1) {
  for (let x = 88; x <= 124; x += 1) {
    const at = atFor(3, 0, x, y);
    if (refinedV1[at + 3] === 0) continue;
    const c = colour(at);
    const inStar = pointInPolygon(x + 0.5, y + 0.5, starPolygon);
    const rainbowRight = y <= 20 ? 96 : y <= 24 ? 99 : y <= 28 ? 102 : 105;
    const inRainbow = x <= rainbowRight && y <= 34
      && (c.rainbowRed || c.rainbowYellow || c.rainbowGreen || c.rainbowBlue || c.strictCoolInk);
    // Cream/orange pixels outside the visible rainbow and star are the raised
    // feeding-pose tail. Dark outline is retained only as part of those two
    // explicit accessory shapes, preventing a detached fur fringe.
    if (!inStar && !inRainbow) {
      setSelected(at, false);
      feedingRemoved += 1;
    }
  }
}

let sleepingRemoved = 0;
let sleepingRestored = 0;
for (let y = 52; y <= 122; y += 1) {
  for (let x = 74; x <= 118; x += 1) {
    const at = atFor(3, 2, x, y);
    if (preliminary[at + 3] === 0) {
      if (output[at + 3] !== 0) {
        setSelected(at, false);
        sleepingRemoved += 1;
      }
      continue;
    }
    const c = colour(at);
    const capFaceCheek = c.cheekPink && x <= 81 && y <= 78;
    const accessoryPixel = c.cloudWhite || c.sleepCloud || c.capBlue || c.lavender || c.strictCoolInk || capFaceCheek;
    const insideHatExtent = x <= 110 && !(y > 103 && x > 62);
    const selected = accessoryPixel && insideHatExtent;
    if (selected && refinedV1[at + 3] === 0) sleepingRestored += 1;
    if (!selected && refinedV1[at + 3] !== 0) sleepingRemoved += 1;
    setSelected(at, selected);
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({
  outputPath,
  width: WIDTH,
  height: HEIGHT,
  transformed: false,
  resampled: false,
  shifted: false,
  changedCells: [
    { row: 3, column: 0, feedingTailPixelsRemoved: feedingRemoved },
    { row: 3, column: 2, petPixelsRemoved: sleepingRemoved, accessoryPixelsRestored: sleepingRestored },
  ],
}, null, 2));
