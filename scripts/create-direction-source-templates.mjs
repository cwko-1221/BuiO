/**
 * Create immutable authoring canvases from a frozen 800x640 pet atlas.
 *
 * This is a source-authoring aid, not a wearable generator and never a
 * publish step. It copies each production row byte-for-byte into an 800x160
 * RGBA PNG so an artist/editor can draw the wearable in the exact runtime
 * coordinates without guessing scale, anchor, or cell boundaries.
 *
 *   node scripts/create-direction-source-templates.mjs \
 *     --base pet-app/public/assets/art/sprites/starpatch-cat-1-atlas-2737c2cd0c.webp \
 *     --output artifacts/source-templates/starpatch-cat-1
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const valueFor = (name) => {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`missing value for --${name}`);
  return value;
};

const basePath = valueFor('base');
const outputDirectory = valueFor('output');
if (!basePath || !outputDirectory) {
  console.error('usage: node scripts/create-direction-source-templates.mjs --base <800x640 atlas> --output <directory> [--prefix name]');
  process.exit(1);
}
const prefix = valueFor('prefix') ?? path.basename(basePath, path.extname(basePath));
const WIDTH = 800;
const HEIGHT = 640;
const ROW_HEIGHT = 160;
const directions = [
  { id: 'front', row: 0, cells: [1, 2, 3, 4, 5] },
  { id: 'side-right', row: 1, cells: [6, 7, 8, 9, 10] },
  { id: 'back', row: 2, cells: [11, 12, 13, 14, 15] },
  { id: 'special', row: 3, cells: [16, 17, 18, 19, 20] },
];
const resolvedBase = path.resolve(process.cwd(), basePath);
const resolvedOutput = path.resolve(process.cwd(), outputDirectory);
const metadata = await sharp(resolvedBase).metadata();
if (metadata.width !== WIDTH || metadata.height !== HEIGHT) {
  throw new Error(`base must be ${WIDTH}x${HEIGHT}; got ${metadata.width ?? 'unknown'}x${metadata.height ?? 'unknown'}`);
}
if (metadata.channels !== 4 || metadata.hasAlpha !== true) {
  throw new Error('base must decode as explicit RGBA; source templates must not hide an opaque background');
}
const baseSha256 = crypto.createHash('sha256').update(await fs.readFile(resolvedBase)).digest('hex');
await fs.mkdir(resolvedOutput, { recursive: true });

const outputs = [];
for (const direction of directions) {
  const outputPath = path.join(resolvedOutput, `${prefix}--${direction.id}-strip.png`);
  await sharp(resolvedBase)
    .extract({ left: 0, top: direction.row * ROW_HEIGHT, width: WIDTH, height: ROW_HEIGHT })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
  const outputMetadata = await sharp(outputPath).metadata();
  if (outputMetadata.width !== WIDTH || outputMetadata.height !== ROW_HEIGHT
    || outputMetadata.channels !== 4 || outputMetadata.hasAlpha !== true) {
    throw new Error(`template failed production shape check: ${outputPath}`);
  }
  outputs.push({
    id: direction.id,
    row: direction.row,
    cells: direction.cells,
    source: path.relative(process.cwd(), outputPath).replaceAll('\\', '/'),
    sha256: crypto.createHash('sha256').update(await fs.readFile(outputPath)).digest('hex'),
    geometry: { width: WIDTH, height: ROW_HEIGHT, channels: 4, hasAlpha: true, transformed: false },
  });
}
const report = {
  schemaVersion: 1,
  role: 'AUTHORING_TEMPLATE_ONLY_NOT_A_WEARABLE_CANDIDATE',
  base: { path: path.relative(process.cwd(), resolvedBase).replaceAll('\\', '/'), sha256: baseSha256, geometry: { width: WIDTH, height: HEIGHT, channels: 4, hasAlpha: true } },
  outputDirectory: path.relative(process.cwd(), resolvedOutput).replaceAll('\\', '/'),
  contract: { directionBatch: 'front,side-right,back,special', cellWidth: 160, cellHeight: 160, columns: 5, transforms: false },
  outputs,
  generatedAt: new Date().toISOString(),
};
const reportPath = path.join(resolvedOutput, `${prefix}--direction-source-template-report.json`);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  verdict: 'TEMPLATES_CREATED',
  baseSha256,
  outputs: outputs.map(({ id, source }) => ({ id, source })),
  report: path.relative(process.cwd(), reportPath).replaceAll('\\', '/'),
}, null, 2));
