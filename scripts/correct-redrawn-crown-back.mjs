/** Remove a front-facing blue jewel accidentally hallucinated onto the rear crown sprites. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [dressedPath, guidePath, outputPath] = process.argv.slice(2);
if (!dressedPath || !guidePath || !outputPath) {
  console.error('usage: node scripts/correct-redrawn-crown-back.mjs <registered-dressed> <registered-guide> <output>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) throw new Error(`${input} must be 800x640`);
  return result;
};
const [dressed, guide] = await Promise.all([read(dressedPath), read(guidePath)]);
const output = Buffer.from(dressed.data);
let correctedPixels = 0;

for (let y = CELL * 2; y < CELL * 3; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    const dressedAt = (y * WIDTH + x) * dressed.info.channels;
    const guideAt = (y * WIDTH + x) * guide.info.channels;
    if (guide.data[guideAt + 3] < 8 || dressed.data[dressedAt + 3] < 20) continue;
    const r = dressed.data[dressedAt];
    const g = dressed.data[dressedAt + 1];
    const b = dressed.data[dressedAt + 2];
    if (b < 88 || b < r * 1.05 || b < g * 1.04) continue;
    const value = Math.max(r, g, b);
    output[dressedAt] = Math.min(255, Math.round(value * 1.02 + 22));
    output[dressedAt + 1] = Math.min(155, Math.round(value * 0.4 + 8));
    output[dressedAt + 2] = Math.min(105, Math.round(value * 0.27 + 5));
    correctedPixels += 1;
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, {
  raw: { width: WIDTH, height: HEIGHT, channels: dressed.info.channels },
}).png({ compressionLevel: 9 }).toFile(outputPath);
console.log(JSON.stringify({ outputPath, correctedPixels }, null, 2));
