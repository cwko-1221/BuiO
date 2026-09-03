/** Create pixel-preserving 2x per-cell proofs for two 800x640 atlases. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [leftPath, rightPath, outputDirectory, scaleArgument = '2', cellsArgument = 'all'] = process.argv.slice(2);
if (!leftPath || !rightPath || !outputDirectory) {
  console.error('usage: node scripts/create-redrawn-per-cell-proof.mjs <left-atlas> <right-atlas> <output-directory>');
  process.exit(1);
}
const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const SCALE = Number.parseInt(scaleArgument, 10);
if (!Number.isInteger(SCALE) || SCALE < 1 || SCALE > 8) throw new Error(`scale must be an integer from 1 to 8; got ${scaleArgument}`);
const parseCells = (value) => {
  if (value === 'all') return new Set(Array.from({ length: 20 }, (_, index) => index));
  const selected = new Set();
  for (const token of value.split(',').map((part) => part.trim()).filter(Boolean)) {
    const match = /^r([0-3])c([0-4])$/i.exec(token);
    if (!match) throw new Error(`cells must be all or comma-separated r0c0..r3c4; got ${token}`);
    selected.add(Number(match[1]) * 5 + Number(match[2]));
  }
  if (selected.size === 0) throw new Error('cells selection cannot be empty');
  return selected;
};
const selectedCells = parseCells(cellsArgument);
for (const input of [leftPath, rightPath]) {
  const metadata = await sharp(input).metadata();
  if (metadata.width !== WIDTH || metadata.height !== HEIGHT) throw new Error(`${input} must be 800x640`);
}
await fs.mkdir(outputDirectory, { recursive: true });
const contactLayers = [];
const files = [];
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  if (!selectedCells.has(row * 5 + column)) continue;
  const region = { left: column * CELL, top: row * CELL, width: CELL, height: CELL };
  const [left, right] = await Promise.all([
    sharp(leftPath).extract(region).resize(CELL * SCALE, CELL * SCALE, { kernel: 'nearest' }).png().toBuffer(),
    sharp(rightPath).extract(region).resize(CELL * SCALE, CELL * SCALE, { kernel: 'nearest' }).png().toBuffer(),
  ]);
  const pair = await sharp({ create: {
    width: CELL * SCALE * 2,
    height: CELL * SCALE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 1 },
  } }).composite([
    { input: left, left: 0, top: 0 },
    { input: right, left: CELL * SCALE, top: 0 },
  ]).png({ compressionLevel: 9 }).toBuffer();
  const file = path.join(outputDirectory, `frame-r${row}-c${column}-left-vs-right-${SCALE}x.png`);
  await fs.writeFile(file, pair);
  files.push(file);
  contactLayers.push({ input: pair, left: column * CELL * SCALE * 2, top: row * CELL * SCALE });
}
const contactSheetPath = path.join(outputDirectory, `${selectedCells.size === 20 ? 'all' : 'selected'}-frames-left-vs-right-${SCALE}x.png`);
await sharp({ create: {
  width: 5 * CELL * SCALE * 2,
  height: 4 * CELL * SCALE,
  channels: 4,
  background: { r: 0, g: 0, b: 0, alpha: 1 },
} }).composite(contactLayers).png({ compressionLevel: 9 }).toFile(contactSheetPath);
console.log(JSON.stringify({
  transformed: false,
  displayScale: SCALE,
  selectedCells: [...selectedCells].map((index) => `r${Math.floor(index / 5)}c${index % 5}`),
  contactSheetPath,
  files,
}, null, 2));
