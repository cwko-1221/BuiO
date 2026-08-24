/** Remove large neutral checker islands trapped inside an otherwise valid effect ring. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, outputPath, reportPath] = process.argv.slice(2);
if (!inputPath || !outputPath || !reportPath) {
  console.error('usage: node scripts/clean-enclosed-checker-artifacts.mjs <input-target> <output-target> <report.json>');
  process.exit(1);
}
const WIDTH = 800; const HEIGHT = 640; const CELL = 160;
const image = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error('target must be 800x640');
const data = Buffer.from(image.data); const removed = [];
const neutralAt = (at) => data[at + 3] > 20
  && Math.min(data[at], data[at + 1], data[at + 2]) >= 226
  && Math.max(data[at], data[at + 1], data[at + 2]) - Math.min(data[at], data[at + 1], data[at + 2]) <= 7;
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  const seen = new Uint8Array(CELL * CELL);
  for (let seed = 0; seed < seen.length; seed += 1) {
    if (seen[seed]) continue;
    const sx = seed % CELL; const sy = Math.floor(seed / CELL);
    const seedAt = (((row * CELL + sy) * WIDTH + column * CELL + sx) * 4);
    if (!neutralAt(seedAt)) continue;
    const queue = [seed]; seen[seed] = 1; let head = 0;
    let minX = sx; let maxX = sx; let minY = sy; let maxY = sy;
    while (head < queue.length) {
      const local = queue[head++]; const x = local % CELL; const y = Math.floor(local / CELL);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const next = ny * CELL + nx; if (seen[next]) continue;
        const at = (((row * CELL + ny) * WIDTH + column * CELL + nx) * 4);
        if (!neutralAt(at)) continue; seen[next] = 1; queue.push(next);
      }
    }
    const boxWidth = maxX - minX + 1; const boxHeight = maxY - minY + 1;
    const fill = queue.length / (boxWidth * boxHeight);
    const rectangular = queue.length >= 20 && boxWidth * boxHeight >= 80 && fill >= 0.38
      && (boxWidth >= 12 || boxHeight >= 12);
    if (!rectangular) continue;
    for (const local of queue) {
      const x = local % CELL; const y = Math.floor(local / CELL);
      const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
      data[at] = 0; data[at + 1] = 0; data[at + 2] = 0; data[at + 3] = 0;
    }
    removed.push({ row, column, pixels: queue.length, bounds: [minX, minY, maxX, maxY], fill: Number(fill.toFixed(3)) });
  }
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(data, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outputPath);
const report = { inputPath, outputPath, removedComponents: removed, removedPixels: removed.reduce((sum, item) => sum + item.pixels, 0), verdict: 'CLEAN_ENCLOSED_NEUTRAL_ISLANDS' };
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
