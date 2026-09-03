/** Create a late anatomical erase mask for open-faced headwear that encloses pet ears. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [frontPath, outputPath] = process.argv.slice(2);
if (!frontPath || !outputPath) {
  console.error('usage: node scripts/create-redrawn-headwear-front-erase.mjs <registered-front-atlas> <output-mask>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const front = await sharp(frontPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (front.info.width !== WIDTH || front.info.height !== HEIGHT) {
  throw new Error(`${frontPath} must be ${WIDTH}x${HEIGHT}`);
}

const output = Buffer.alloc(WIDTH * HEIGHT * 4);
const stats = [];
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    let minX = CELL; let minY = CELL; let maxX = -1; let maxY = -1;
    const redByY = new Uint16Array(CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * front.info.channels);
        if (front.data[at + 3] < 20) continue;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        const r = front.data[at]; const g = front.data[at + 1]; const b = front.data[at + 2];
        if (r > 105 && g < 100 && b < 100 && r > g * 1.4 && r > b * 1.35) redByY[y] += 1;
      }
    }
    if (maxX < minX || maxY < minY) {
      stats.push({ column, row, erasePixels: 0 });
      continue;
    }
    let bandY = minY;
    for (let y = minY; y <= maxY; y += 1) {
      if (redByY[y] > redByY[bandY]) bandY = y;
    }
    let erasePixels = 0;
    const isFrontPose = row === 0 || (row === 3 && column !== 2);
    const earTop = Math.min(CELL - 1, minY + 7);
    const earBottom = Math.min(CELL - 1, bandY + 9);
    const centreX = (minX + maxX) / 2;
    const earSpread = Math.max(30, (maxX - minX) * 0.4);
    const maximumHalfWidth = Math.max(18, (maxX - minX) * 0.22);
    if (isFrontPose) for (let y = earTop; y <= earBottom; y += 1) {
      const progress = Math.max(0, Math.min(1, (y - earTop) / Math.max(1, earBottom - earTop)));
      const halfWidth = 3 + maximumHalfWidth * progress;
      for (let x = 0; x < CELL; x += 1) {
        const inLeftEar = Math.abs(x - (centreX - earSpread)) <= halfWidth;
        const inRightEar = Math.abs(x - (centreX + earSpread)) <= halfWidth;
        if (!inLeftEar && !inRightEar) continue;
        const at = ((row * CELL + y) * WIDTH + column * CELL + x) * 4;
        output[at] = 255;
        output[at + 1] = 255;
        output[at + 2] = 255;
        output[at + 3] = 255;
        erasePixels += 1;
      }
    }
    stats.push({
      column, row, minX, minY, maxX, maxY, bandY, earTop, earBottom, centreX, earSpread,
      maximumHalfWidth, erasePixels,
    });
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, stats }, null, 2));
