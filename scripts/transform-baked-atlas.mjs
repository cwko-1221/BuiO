/** Apply one production normalization transform independently inside every 160px atlas cell. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [input, output, scaleArg = '1', xArg = '0', yArg = '0'] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/transform-baked-atlas.mjs <input> <output> [scale] [x] [y]');
  process.exit(1);
}

const CELL = 160;
const COLUMNS = 5;
const ROWS = 4;
const scale = Number(scaleArg);
const dx = Number(xArg);
const dy = Number(yArg);
if (!Number.isFinite(scale) || scale <= 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) {
  throw new Error('scale/x/y must be finite and scale must be positive');
}

const source = sharp(input).ensureAlpha();
const metadata = await source.metadata();
if (metadata.width !== CELL * COLUMNS || metadata.height !== CELL * ROWS) {
  throw new Error(`${input} must be ${CELL * COLUMNS}x${CELL * ROWS}`);
}

const layers = [];
const size = Math.max(1, Math.round(CELL * scale));
for (let row = 0; row < ROWS; row += 1) {
  for (let column = 0; column < COLUMNS; column += 1) {
    const cell = await sharp(input)
      .extract({ left: column * CELL, top: row * CELL, width: CELL, height: CELL })
      .resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .png()
      .toBuffer();
    layers.push({
      input: cell,
      left: Math.round(column * CELL + (CELL - size) / 2 + dx),
      top: Math.round(row * CELL + (CELL - size) / 2 + dy),
    });
  }
}

await fs.mkdir(path.dirname(output), { recursive: true });
await sharp({ create: {
  width: CELL * COLUMNS,
  height: CELL * ROWS,
  channels: 4,
  background: { r: 0, g: 0, b: 0, alpha: 0 },
} })
  .composite(layers)
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`${output}: cell transform scale=${scale}, x=${dx}, y=${dy}`);
