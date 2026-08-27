/**
 * Extract a modular neck replacement from a complete dressed-pet redraw.
 *
 * The final patch contains pixels from the approved complete redraw, never from standalone item
 * art. It replaces the scarf and the lower dressed body; the blend boundary sits under the scarf,
 * so compressed fur and contact shadows survive without exposing a redraw seam.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [basePath, dressedPath, outputFolder] = process.argv.slice(2);
if (!basePath || !dressedPath || !outputFolder) {
  console.error('usage: node scripts/extract-dressed-neck-patch.mjs <base-atlas> <dressed-atlas> <output-folder>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const COLUMNS = 5;
const ROWS = 4;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  }
  return result;
};

const base = await read(basePath);
const dressed = await read(dressedPath);
const patch = Buffer.alloc(WIDTH * HEIGHT * 4);
const erase = Buffer.alloc(WIDTH * HEIGHT * 4);

const alphaAt = (source, x, y) => source.data[(y * WIDTH + x) * source.info.channels + 3];
const smoothstep = (from, to, value) => {
  const t = Math.max(0, Math.min(1, (value - from) / Math.max(1, to - from)));
  return t * t * (3 - 2 * t);
};

for (let row = 0; row < ROWS; row += 1) {
  // Neckwear is intentionally invisible from behind.
  if (row === 2) continue;
  for (let column = 0; column < COLUMNS; column += 1) {
    const cellLeft = column * CELL;
    const cellTop = row * CELL;
    let minY = CELL;
    let maxY = -1;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        if (alphaAt(dressed, cellLeft + x, cellTop + y) < 24) continue;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxY < minY) continue;

    // Start the replacement just above the scarf. The redraw itself supplies all pixels below,
    // including the scarf, compressed neck fur, chest, paws and its contact shadows. Different
    // pose rows need slightly different starts because a profile neck sits lower than a front one.
    const fraction = row === 1 ? 0.39 : row === 3 ? 0.42 : 0.40;
    const boundary = minY + (maxY - minY + 1) * fraction;
    const feather = 5;

    for (let y = 0; y < CELL; y += 1) {
      const region = smoothstep(boundary - feather, boundary + feather, y);
      if (region <= 0) continue;
      for (let x = 0; x < CELL; x += 1) {
        const globalX = cellLeft + x;
        const globalY = cellTop + y;
        const sourceAt = (globalY * WIDTH + globalX) * dressed.info.channels;
        const targetAt = (globalY * WIDTH + globalX) * 4;
        const dressedAlpha = dressed.data[sourceAt + 3];
        if (!dressedAlpha) continue;
        const alpha = Math.round(dressedAlpha * region);
        patch[targetAt] = dressed.data[sourceAt];
        patch[targetAt + 1] = dressed.data[sourceAt + 1];
        patch[targetAt + 2] = dressed.data[sourceAt + 2];
        patch[targetAt + 3] = alpha;
        erase[targetAt] = 255;
        erase[targetAt + 1] = 255;
        erase[targetAt + 2] = 255;
        erase[targetAt + 3] = alpha;
      }
    }
  }
}

await fs.mkdir(outputFolder, { recursive: true });
const patchPath = path.join(outputFolder, 'neck-10-redraw-patch.png');
const erasePath = path.join(outputFolder, 'neck-10-erase-mask.png');
const proofPath = path.join(outputFolder, 'neck-10-masked-proof.png');
await sharp(patch, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toFile(patchPath);
await sharp(erase, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toFile(erasePath);

const erasedBase = await sharp(base.data, {
  raw: { width: WIDTH, height: HEIGHT, channels: base.info.channels },
})
  .composite([{ input: erase, raw: { width: WIDTH, height: HEIGHT, channels: 4 }, blend: 'dest-out' }])
  .png()
  .toBuffer();
await sharp(erasedBase).composite([{ input: patch, raw: { width: WIDTH, height: HEIGHT, channels: 4 } }]).png().toFile(proofPath);

console.log(JSON.stringify({ patchPath, erasePath, proofPath }, null, 2));
