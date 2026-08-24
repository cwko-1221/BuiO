/** Fail-fast source gate before any wearable masking work is allowed. */
import path from 'node:path';
import sharp from 'sharp';

const inputPath = process.argv[2];
const direction = process.argv[3] ?? 'unknown';
if (!inputPath) {
  console.error('usage: node scripts/check-direction-batch-source.mjs <strip.png> <front|side-right|back|special>');
  process.exit(2);
}

const errors = [];
let metadata;
try {
  metadata = await sharp(inputPath).metadata();
} catch (error) {
  errors.push(`cannot read source: ${error.message}`);
}
if (metadata) {
  if (metadata.format !== 'png') errors.push(`format must be png, got ${metadata.format ?? 'unknown'}`);
  if (metadata.width !== 800 || metadata.height !== 160) errors.push(`dimensions must be 800x160, got ${metadata.width}x${metadata.height}`);
  if (!metadata.hasAlpha || metadata.channels !== 4) errors.push('source must have an alpha channel (RGBA PNG); baked checkerboard/black backgrounds are forbidden');
}
const result = {
  schemaVersion: 1,
  input: path.relative(process.cwd(), path.resolve(inputPath)).replaceAll('\\', '/'),
  direction,
  expected: { width: 800, height: 160, format: 'png', channels: 4, alpha: true },
  observed: metadata ? {
    width: metadata.width,
    height: metadata.height,
    format: metadata.format,
    channels: metadata.channels,
    hasAlpha: metadata.hasAlpha,
  } : null,
  transformed: false,
  verdict: errors.length === 0 ? 'PASS_SOURCE_SHAPE' : 'REJECT_PREMASK',
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exitCode = 1;
