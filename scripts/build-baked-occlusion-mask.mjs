/** Build a per-cell body cut-out mask from a fitted opaque wearable layer. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [input, output, radiusArg = '5', alphaThresholdArg = '32'] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/build-baked-occlusion-mask.mjs <wearable-atlas> <mask-atlas> [radius] [alpha-threshold]');
  process.exit(1);
}

const radius = Math.max(0, Math.round(Number(radiusArg)));
const alphaThreshold = Math.max(1, Math.min(255, Math.round(Number(alphaThresholdArg))));
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const mask = new Uint8Array(info.width * info.height);
const CELL = 160;

// Dilation never crosses a cell boundary: an item in one pose cannot erase its neighbour.
for (let row = 0; row < info.height / CELL; row += 1) {
  for (let column = 0; column < info.width / CELL; column += 1) {
    const left = column * CELL;
    const top = row * CELL;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const pixel = ((top + y) * info.width + left + x);
        if (data[pixel * info.channels + 3] < alphaThreshold) continue;
        for (let oy = -radius; oy <= radius; oy += 1) {
          for (let ox = -radius; ox <= radius; ox += 1) {
            if (ox * ox + oy * oy > radius * radius) continue;
            const tx = x + ox;
            const ty = y + oy;
            if (tx < 0 || tx >= CELL || ty < 0 || ty >= CELL) continue;
            mask[(top + ty) * info.width + left + tx] = 255;
          }
        }
      }
    }
  }
}

const rgba = Buffer.alloc(info.width * info.height * 4);
for (let index = 0; index < mask.length; index += 1) {
  const at = index * 4;
  rgba[at] = 255;
  rgba[at + 1] = 255;
  rgba[at + 2] = 255;
  rgba[at + 3] = mask[index];
}

await fs.mkdir(path.dirname(output), { recursive: true });
await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(output);
console.log(`${output}: ${radius}px per-cell occlusion expansion, alpha threshold ${alphaThreshold}`);
