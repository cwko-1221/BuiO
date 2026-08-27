/**
 * Report transparent components enclosed by an accessory mask in each atlas
 * cell. Components connected to a cell edge are external openings, not holes.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [maskPath, sourcePath, outputPath] = process.argv.slice(2);
if (!maskPath || !sourcePath || !outputPath) {
  console.error('usage: node scripts/audit-accessory-mask-holes.mjs <mask> <source> <output-json>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  }
  return result.data;
};
const [mask, source] = await Promise.all([read(maskPath), read(sourcePath)]);
const steps = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const cells = [];

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const seen = new Uint8Array(CELL * CELL);
    const holes = [];
    for (let seed = 0; seed < seen.length; seed += 1) {
      if (seen[seed]) continue;
      const seedX = seed % CELL;
      const seedY = Math.floor(seed / CELL);
      const seedAt = (((row * CELL + seedY) * WIDTH + column * CELL + seedX) * 4);
      if (mask[seedAt + 3] > 8) continue;
      const queue = [seed];
      let head = 0;
      let touchesCellEdge = false;
      let minX = seedX;
      let maxX = seedX;
      let minY = seedY;
      let maxY = seedY;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let opaqueSourcePixels = 0;
      seen[seed] = 1;
      while (head < queue.length) {
        const local = queue[head++];
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (x === 0 || x === CELL - 1 || y === 0 || y === CELL - 1) touchesCellEdge = true;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (source[at + 3] > 8) {
          sumR += source[at];
          sumG += source[at + 1];
          sumB += source[at + 2];
          opaqueSourcePixels += 1;
        }
        for (const [offsetX, offsetY] of steps) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= CELL || nextY < 0 || nextY >= CELL) continue;
          const next = nextY * CELL + nextX;
          if (seen[next]) continue;
          const nextAt = (((row * CELL + nextY) * WIDTH + column * CELL + nextX) * 4);
          if (mask[nextAt + 3] > 8) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      if (!touchesCellEdge) {
        holes.push({
          pixels: queue.length,
          bounds: [minX, minY, maxX, maxY],
          opaqueSourcePixels,
          meanSourceRgb: opaqueSourcePixels ? [
            Math.round(sumR / opaqueSourcePixels),
            Math.round(sumG / opaqueSourcePixels),
            Math.round(sumB / opaqueSourcePixels),
          ] : null,
        });
      }
    }
    holes.sort((left, right) => right.pixels - left.pixels);
    cells.push({ row, column, enclosedHoleCount: holes.length, enclosedHolePixels: holes.reduce((sum, hole) => sum + hole.pixels, 0), holes });
  }
}

const result = {
  maskPath,
  sourcePath,
  verdict: cells.every((cell) => cell.enclosedHoleCount === 0) ? 'PASS' : 'REJECT',
  totalEnclosedHoles: cells.reduce((sum, cell) => sum + cell.enclosedHoleCount, 0),
  totalEnclosedHolePixels: cells.reduce((sum, cell) => sum + cell.enclosedHolePixels, 0),
  cells,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
