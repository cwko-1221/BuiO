/**
 * Remove an opaque neutral checkerboard from the imagegen chef-hat redraw and
 * normalize the 5x4 atlas to the production 800x640 canvas.
 *
 * This is source-art normalization performed before any wearable mask exists.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, outputPath, reportPath] = process.argv.slice(2);
if (!inputPath || !outputPath || !reportPath) {
  console.error('usage: node scripts/normalize-chef-redraw-source.mjs <input> <output> <report>');
  process.exit(1);
}

const source = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = source.info;
const data = source.data;
const background = new Uint8Array(width * height);
const queue = [];
const isNeutralChecker = (pixel) => {
  const at = pixel * channels;
  const r = data[at];
  const g = data[at + 1];
  const b = data[at + 2];
  return Math.min(r, g, b) >= 218 && Math.max(r, g, b) - Math.min(r, g, b) <= 16;
};
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const pixel = y * width + x;
  if (background[pixel] || !isNeutralChecker(pixel)) return;
  background[pixel] = 1;
  queue.push(pixel);
};
for (let x = 0; x < width; x += 1) {
  push(x, 0);
  push(x, height - 1);
}
for (let y = 0; y < height; y += 1) {
  push(0, y);
  push(width - 1, y);
}
let head = 0;
while (head < queue.length) {
  const pixel = queue[head++];
  const x = pixel % width;
  const y = Math.floor(pixel / width);
  push(x - 1, y);
  push(x + 1, y);
  push(x, y - 1);
  push(x, y + 1);
}

let clearedPixels = 0;
for (let pixel = 0; pixel < background.length; pixel += 1) {
  const at = pixel * channels;
  if (background[pixel]) {
    data[at] = 0;
    data[at + 1] = 0;
    data[at + 2] = 0;
    data[at + 3] = 0;
    clearedPixels += 1;
  } else {
    data[at + 3] = 255;
  }
}

const normalized = await sharp(data, { raw: { width, height, channels } })
  .resize(800, 640, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
let transparentPixels = 0;
let hiddenRgbPixels = 0;
for (let at = 0; at < normalized.data.length; at += 4) {
  if (normalized.data[at + 3] === 0) {
    transparentPixels += 1;
    if (normalized.data[at] || normalized.data[at + 1] || normalized.data[at + 2]) hiddenRgbPixels += 1;
    normalized.data[at] = 0;
    normalized.data[at + 1] = 0;
    normalized.data[at + 2] = 0;
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(normalized.data, { raw: { width: 800, height: 640, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
const report = {
  inputPath,
  outputPath,
  inputCanvas: [width, height],
  outputCanvas: [800, 640],
  operationOrder: ['edge-connected checker removal', 'atlas normalization', 'transparent RGB sanitation'],
  maskExistedDuringNormalization: false,
  clearedPixels,
  clearedPercent: Number((clearedPixels / (width * height) * 100).toFixed(3)),
  outputTransparentPixels: transparentPixels,
  hiddenRgbPixelsAfterSanitation: 0,
  hiddenRgbPixelsBeforeSanitation: hiddenRgbPixels,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
