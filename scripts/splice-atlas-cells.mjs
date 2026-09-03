/** Copy selected 160x160 cells between same-size 5x4 atlases without resampling. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [basePath, donorPath, outputPath, cellsArg] = process.argv.slice(2);
if (!basePath || !donorPath || !outputPath || !cellsArg) {
  console.error('usage: node scripts/splice-atlas-cells.mjs <base> <donor> <output> <row:column,...>');
  process.exit(1);
}
const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  return result.data;
};
const [base, donor] = await Promise.all([read(basePath), read(donorPath)]);
const output = Buffer.from(base);
const cells = cellsArg.split(',').map((entry) => entry.split(':').map(Number));
for (const [row, column] of cells) {
  if (!Number.isInteger(row) || !Number.isInteger(column) || row < 0 || row >= 4 || column < 0 || column >= 5) {
    throw new Error(`invalid cell ${row}:${column}`);
  }
  for (let y = row * CELL; y < (row + 1) * CELL; y += 1) {
    const start = (y * WIDTH + column * CELL) * 4;
    donor.copy(output, start, start, start + CELL * 4);
  }
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, cells, transformed: false, resampled: false }, null, 2));
