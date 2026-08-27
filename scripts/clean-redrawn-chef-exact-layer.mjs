/** Clean pet leakage below the chef-hat band while preserving the full redraw's exact placement. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, specialFallbackPath, outputPath] = process.argv.slice(2);
if (!inputPath || !specialFallbackPath || !outputPath) {
  console.error('usage: node scripts/clean-redrawn-chef-exact-layer.mjs <exact-extracted-layer> <clean-special-row-fallback> <output-layer>');
  process.exit(1);
}
const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const source = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (source.info.width !== WIDTH || source.info.height !== HEIGHT) throw new Error(`${inputPath} must be 800x640`);
const output = Buffer.from(source.data);
const specialFallback = await sharp(specialFallbackPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (specialFallback.info.width !== WIDTH || specialFallback.info.height !== HEIGHT) throw new Error(`${specialFallbackPath} must be 800x640`);
const stats = [];

for (let row = 0; row < 3; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const red = new Uint8Array(CELL * CELL);
    const redByY = new Uint16Array(CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (source.data[at + 3] < 20) continue;
        const r = source.data[at]; const g = source.data[at + 1]; const b = source.data[at + 2];
        const isRibbonRed = r > 105 && g < 115 && b < 105 && r > g * 1.35 && r > b * 1.25;
        if (!isRibbonRed) continue;
        red[y * CELL + x] = 1;
        redByY[y] += 1;
      }
    }
    let peakY = 0;
    for (let y = 1; y < CELL; y += 1) if (redByY[y] > redByY[peakY]) peakY = y;
    const peak = redByY[peakY];
    let bandBottom = peakY;
    for (let y = peakY; y < CELL; y += 1) {
      if (redByY[y] >= Math.max(4, peak * 0.25)) bandBottom = y;
    }

    const redNear = new Uint8Array(CELL * CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        if (!red[y * CELL + x]) continue;
        for (let oy = -3; oy <= 3; oy += 1) {
          for (let ox = -3; ox <= 3; ox += 1) {
            if (ox * ox + oy * oy > 9) continue;
            const nx = x + ox; const ny = y + oy;
            if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
            redNear[ny * CELL + nx] = 1;
          }
        }
      }
    }

    let removed = 0;
    const cleanBelow = bandBottom + 2;
    for (let y = cleanBelow + 1; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        if (redNear[y * CELL + x]) continue;
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (output[at + 3]) removed += 1;
        output[at + 3] = 0;
      }
    }
    stats.push({ row, column, peakY, bandBottom, cleanBelow, removed });
  }
}

// The exact semantic extraction is intentionally used for all directional animation rows. Its
// sleeping cell intersects too much warm pet fur, so the already-clean isolated special row is the
// safer source for all five one-off actions until each can be compared independently.
for (let y = CELL * 3; y < HEIGHT; y += 1) {
  const start = y * WIDTH * 4;
  specialFallback.data.copy(output, start, start, start + WIDTH * 4);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, stats }, null, 2));
