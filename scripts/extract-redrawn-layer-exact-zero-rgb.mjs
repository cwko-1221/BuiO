/** Copy selected target pixels at the same coordinates and zero every transparent RGB byte. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, maskPath, outputPath] = process.argv.slice(2);
if (!targetPath || !maskPath || !outputPath) {
  console.error('usage: node scripts/extract-redrawn-layer-exact-zero-rgb.mjs <target> <mask> <output-layer>');
  process.exit(1);
}
const WIDTH = 800;
const HEIGHT = 640;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) throw new Error(`${input} must be 800x640`);
  return result.data;
};
const [target, mask] = await Promise.all([read(targetPath), read(maskPath)]);
const output = Buffer.alloc(WIDTH * HEIGHT * 4);
let visiblePixels = 0;
let transparentRgbNonZero = 0;
for (let at = 0; at < output.length; at += 4) {
  if (mask[at + 3] === 0 || target[at + 3] === 0) continue;
  output[at] = target[at];
  output[at + 1] = target[at + 1];
  output[at + 2] = target[at + 2];
  output[at + 3] = target[at + 3];
  visiblePixels += 1;
}
for (let at = 0; at < output.length; at += 4) {
  if (output[at + 3] === 0 && (output[at] !== 0 || output[at + 1] !== 0 || output[at + 2] !== 0)) {
    transparentRgbNonZero += 1;
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
  visiblePixels,
  transparentRgbNonZero,
  transformed: false,
  resampled: false,
  shifted: false,
}, null, 2));
