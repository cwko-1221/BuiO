/** Canonicalize an RGBA mask: transparent pixels must have RGB=0, alpha is preserved. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('usage: node scripts/sanitize-alpha-mask.mjs <input-mask> <output-mask>');
  process.exit(1);
}
const image = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const data = Buffer.from(image.data);
let cleared = 0;
for (let at = 0; at < data.length; at += 4) {
  if (data[at + 3] !== 0) continue;
  if (data[at] || data[at + 1] || data[at + 2]) cleared += 1;
  data[at] = 0; data[at + 1] = 0; data[at + 2] = 0;
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(data, { raw: { width: image.info.width, height: image.info.height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ inputPath, outputPath, clearedTransparentRgbPixels: cleared, transformed: false }, null, 2));
