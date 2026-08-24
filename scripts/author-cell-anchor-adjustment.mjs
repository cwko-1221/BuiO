/**
 * Authoring-only anchor adjustment for a newly generated isolated accessory
 * atlas.  It copies pixels between fixed 160x160 cells without scaling or
 * rotation.  Run this before composing the canonical target and before mask
 * extraction; never use it on an already solved/published layer.
 *
 *   node scripts/author-cell-anchor-adjustment.mjs input.png output.png '[{"row":1,"column":0,"dx":18,"dy":-5}]'
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, outputPath, adjustmentsJson = '[]'] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('usage: node scripts/author-cell-anchor-adjustment.mjs <isolated-atlas> <output> <adjustments-json>');
  process.exit(1);
}
const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const CHANNELS = 4;
const adjustments = JSON.parse(adjustmentsJson);
const byCell = new Map(adjustments.map((item) => [`${item.row}:${item.column}`, {
  dx: Math.round(Number(item.dx || 0)), dy: Math.round(Number(item.dy || 0)),
}]));
const decoded = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (decoded.info.width !== WIDTH || decoded.info.height !== HEIGHT) {
  throw new Error(`${inputPath} must be 800x640; got ${decoded.info.width}x${decoded.info.height}`);
}
const output = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  const { dx, dy } = byCell.get(`${row}:${column}`) || { dx: 0, dy: 0 };
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    const sourceX = column * CELL + x;
    const sourceY = row * CELL + y;
    const sourceAt = (sourceY * WIDTH + sourceX) * CHANNELS;
    const destX = x + dx;
    const destY = y + dy;
    if (destX < 0 || destX >= CELL || destY < 0 || destY >= CELL) continue;
    const destAt = ((row * CELL + destY) * WIDTH + column * CELL + destX) * CHANNELS;
    for (let channel = 0; channel < CHANNELS; channel += 1) output[destAt + channel] = decoded.data[sourceAt + channel];
  }
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } })
  .png({ compressionLevel: 9 }).toFile(outputPath);
console.log(JSON.stringify({ inputPath, outputPath, adjustments, transformed: true, mode: 'authoring-only-translation-no-scale-no-rotation' }));
