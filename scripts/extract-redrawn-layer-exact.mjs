/** Apply a same-size mask to a full redraw without moving or resampling a single source pixel. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [fullRedrawPath, maskPath, outputPath] = process.argv.slice(2);
if (!fullRedrawPath || !maskPath || !outputPath) {
  console.error('usage: node scripts/extract-redrawn-layer-exact.mjs <full-redraw> <mask> <output-layer>');
  process.exit(1);
}
const WIDTH = 800;
const HEIGHT = 640;
const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error(`${input} must be 800x640`);
  return image;
};
const [source, mask] = await Promise.all([read(fullRedrawPath), read(maskPath)]);
const output = Buffer.alloc(WIDTH * HEIGHT * 4);
let pixels = 0;
for (let at = 0; at < output.length; at += 4) {
  const alpha = Math.round(source.data[at + 3] * (mask.data[at + 3] / 255));
  if (alpha > 0) {
    output[at] = source.data[at];
    output[at + 1] = source.data[at + 1];
    output[at + 2] = source.data[at + 2];
  }
  output[at + 3] = alpha;
  if (alpha) pixels += 1;
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, width: WIDTH, height: HEIGHT, pixels, transformed: false }, null, 2));
