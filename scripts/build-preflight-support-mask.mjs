/**
 * Build a conservative, category support mask for the cheap redraw preflight.
 *
 * This mask is intentionally NOT a publishable accessory mask.  It only tells
 * preflight which pixels a redraw is allowed to change before the expensive
 * semantic mask solver runs.  A candidate that changes the pet outside this
 * support is rejected; passing this gate never authorizes publication.
 *
 *   node scripts/build-preflight-support-mask.mjs <category> <out.png>
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [category, output] = process.argv.slice(2);
if (!category || !output) {
  throw new Error('usage: node scripts/build-preflight-support-mask.mjs <head|face|neck|back|aura> <out.png>');
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const COLS = 5;
const ROWS = 4;

// Coordinates are deliberately generous but stay category-local.  Protected
// eye/tail ROIs in preflight remain independent and will still reject unsafe
// coverage.  These boxes are a screening envelope, not final geometry.
const boxes = {
  head: [
    [18, 14, 146, 112], [44, 8, 159, 112], [18, 16, 146, 116], [18, 14, 146, 112],
  ],
  face: [
    [32, 54, 132, 126], [76, 48, 156, 124], [32, 52, 132, 126], [24, 48, 140, 130],
  ],
  neck: [
    [34, 92, 132, 154], [76, 88, 158, 154], [34, 88, 132, 154], [28, 86, 140, 154],
  ],
  back: [
    [18, 42, 144, 140], [44, 34, 159, 140], [18, 38, 144, 142], [18, 34, 148, 142],
  ],
  aura: [
    [4, 4, 156, 156], [4, 4, 156, 156], [4, 4, 156, 156], [4, 4, 156, 156],
  ],
};
if (!boxes[category]) throw new Error(`unknown category: ${category}`);

const alpha = Buffer.alloc(WIDTH * HEIGHT, 0);
for (let row = 0; row < ROWS; row += 1) {
  const [minX, minY, maxX, maxY] = boxes[category][row];
  for (let column = 0; column < COLS; column += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        alpha[(row * CELL + y) * WIDTH + column * CELL + x] = 255;
      }
    }
  }
}

const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
for (let index = 0; index < alpha.length; index += 1) {
  const at = index * 4;
  rgba[at] = 255;
  rgba[at + 1] = 255;
  rgba[at + 2] = 255;
  rgba[at + 3] = alpha[index];
}
await fs.mkdir(path.dirname(output), { recursive: true });
await sharp(rgba, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(output);
console.log(`${output}: ${category} preflight envelope (diagnostic only)`);
