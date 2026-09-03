/**
 * Deterministically pack four independently authored 5-cell direction strips
 * into the game's 5x4 800x640 atlas.
 *
 * Each input must already be an exact 800x160 strip. This tool only copies raw
 * pixels into rows; it never resizes, rotates, mirrors, shifts, or resamples.
 * Generate and approve the four strips before invoking this packer.
 *
 *   node scripts/pack-redrawn-direction-batches.mjs \
 *     front.png side-right.png back.png special.png atlas.png [report.json]
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [frontPath, sidePath, backPath, specialPath, outputPath, reportPath = '-'] = process.argv.slice(2);
if (!frontPath || !sidePath || !backPath || !specialPath || !outputPath) {
  console.error('usage: node scripts/pack-redrawn-direction-batches.mjs <front-800x160> <side-right-800x160> <back-800x160> <special-800x160> <output-800x640> [report.json|-]');
  process.exit(1);
}

const WIDTH = 800;
const ROW_HEIGHT = 160;
const ROWS = [
  { directionBatch: 'front', path: frontPath, row: 0 },
  { directionBatch: 'side-right', path: sidePath, row: 1 },
  { directionBatch: 'back', path: backPath, row: 2 },
  { directionBatch: 'special', path: specialPath, row: 3 },
];
const readStrip = async ({ path: inputPath, directionBatch, row }) => {
  const decoded = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== WIDTH || decoded.info.height !== ROW_HEIGHT) {
    throw new Error(`${directionBatch} strip must be 800x160; got ${decoded.info.width}x${decoded.info.height}`);
  }
  return { ...decoded, path: inputPath, directionBatch, row };
};
const strips = await Promise.all(ROWS.map(readStrip));
const atlas = Buffer.alloc(WIDTH * ROW_HEIGHT * 4 * ROWS.length);
for (const strip of strips) {
  const destinationOffset = strip.row * WIDTH * ROW_HEIGHT * 4;
  strip.data.copy(atlas, destinationOffset);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(atlas, { raw: { width: WIDTH, height: ROW_HEIGHT * ROWS.length, channels: 4 } })
  .png({ compressionLevel: 9 }).toFile(outputPath);

const hash = async (inputPath) => crypto.createHash('sha256').update(await fs.readFile(inputPath)).digest('hex');
const report = {
  schemaVersion: 1,
  atlas: { width: WIDTH, height: ROW_HEIGHT * ROWS.length, cellWidth: 160, cellHeight: 160, columns: 5, rows: 4 },
  directionBatches: await Promise.all(strips.map(async (strip) => ({
    directionBatch: strip.directionBatch,
    row: strip.row,
    sourcePath: strip.path,
    sourceSha256: await hash(strip.path),
    sourceWidth: WIDTH,
    sourceHeight: ROW_HEIGHT,
  }))),
  policy: {
    transformed: false,
    operation: 'raw row copy only',
    leftFacingSideMustBeRuntimeFlip: true,
    targetMustBeFrozenBeforeMasking: true,
  },
  output: { path: outputPath, sha256: await hash(outputPath) },
};
if (reportPath !== '-') {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(report, null, 2));
