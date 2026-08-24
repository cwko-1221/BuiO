/** Remove frozen head-04 protected eye/tail pixels from a legacy candidate mask.
 * This is a diagnostic helper only; it never publishes or changes the frozen redraw.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, basePath, outputPath, reportPath] = process.argv.slice(2);
if (!inputPath || !basePath || !outputPath) {
  console.error('usage: node scripts/refine-head04-semantic-mask.mjs <mask> <base> <output-mask> [report.json]');
  process.exit(1);
}
const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (file) => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const [mask, base] = await Promise.all([read(inputPath), read(basePath)]);
if (mask.info.width !== WIDTH || base.info.width !== WIDTH || mask.info.height !== HEIGHT || base.info.height !== HEIGHT) {
  throw new Error('head-04 masks must be 800x640');
}
const output = Buffer.from(mask.data);
const eyeRoiFor = (row) => row === 1 ? { minX: 78, maxX: 148, minY: 62, maxY: 120 } : null;
const tailRoiFor = (row) => row === 2 ? { minX: 42, maxX: 112, minY: 54, maxY: 132 } : null;
const inRoi = (x, y, roi) => roi && x >= roi.minX && x <= roi.maxX && y >= roi.minY && y <= roi.maxY;
const isEyeInk = (at) => base.data[at + 3] >= 96 && base.data[at] < 105 && base.data[at + 1] < 78 && base.data[at + 2] < 68;
let clearedEye = 0;
let clearedTail = 0;
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const gx = column * CELL + x;
        const gy = row * CELL + y;
        const at = (gy * WIDTH + gx) * 4;
        if (output[at + 3] === 0) continue;
        if (inRoi(x, y, eyeRoiFor(row)) && isEyeInk(at)) {
          output[at + 3] = 0;
          clearedEye += 1;
        } else if (inRoi(x, y, tailRoiFor(row)) && base.data[at + 3] > 0) {
          output[at + 3] = 0;
          clearedTail += 1;
        }
      }
    }
  }
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outputPath);
const report = { inputPath, basePath, outputPath, transformed: false, clearedEyePixels: clearedEye, clearedTailPixels: clearedTail, verdict: 'DIAGNOSTIC_ONLY' };
if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}
console.log(JSON.stringify(report, null, 2));
