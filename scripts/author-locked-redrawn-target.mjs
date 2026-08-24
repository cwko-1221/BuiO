/**
 * Build a body-locked diagnostic target from the original pet and a source-art
 * wearable layer. This is deliberately NOT an authoritative full-redraw target:
 * it must never be used to hide differences in an earlier AI redraw or to satisfy
 * final lineage QA. Use it only to test whether a candidate layer is mathematically
 * composable; the authoritative target must still be the untouched full redraw.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [basePath, sourceLayerPath, targetPath, lineagePath] = process.argv.slice(2);
if (!basePath || !sourceLayerPath || !targetPath || !lineagePath) {
  console.error('usage: node scripts/author-locked-redrawn-target.mjs <base> <source-layer> <target> <lineage>');
  process.exit(1);
}
const WIDTH = 800;
const HEIGHT = 640;
const PIXELS = WIDTH * HEIGHT;
const read = async (file) => {
  const result = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT || result.info.channels !== 4) {
    throw new Error(`${file} must decode to 800x640 RGBA`);
  }
  return result.data;
};
const [base, sourceLayer] = await Promise.all([read(basePath), read(sourceLayerPath)]);
const target = Buffer.alloc(PIXELS * 4);
let sourceLayerPixels = 0;
let baseBytesPreservedOutsideLayer = 0;
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * 4;
  const frontAlpha = sourceLayer[at + 3] / 255;
  if (frontAlpha > 0) sourceLayerPixels += 1;
  if (frontAlpha === 0) {
    for (let channel = 0; channel < 4; channel += 1) target[at + channel] = base[at + channel];
    baseBytesPreservedOutsideLayer += 1;
    continue;
  }
  const baseAlpha = base[at + 3] / 255;
  const outputAlpha = frontAlpha + baseAlpha * (1 - frontAlpha);
  if (outputAlpha <= 0) {
    for (let channel = 0; channel < 4; channel += 1) target[at + channel] = base[at + channel];
    continue;
  }
  for (let channel = 0; channel < 3; channel += 1) {
    target[at + channel] = Math.round((
      sourceLayer[at + channel] * frontAlpha
      + base[at + channel] * baseAlpha * (1 - frontAlpha)
    ) / outputAlpha);
  }
  target[at + 3] = Math.round(outputAlpha * 255);
}

await fs.mkdir(path.dirname(targetPath), { recursive: true });
await sharp(target, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(targetPath);
const hash = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const lineage = {
  role: 'DIAGNOSTIC_ONLY_body_locked_target_not_authoritative_redraw',
  authority: 'never_publish_and_never_substitute_for_the_original_full_redraw',
  canvas: '800x640',
  transformedDuringAuthoring: false,
  productionMaskOrLayerRead: false,
  inputs: {
    basePath,
    sourceLayerPath,
    sha256: { base: await hash(basePath), sourceLayer: await hash(sourceLayerPath) },
  },
  output: {
    targetPath,
    sha256: await hash(targetPath),
    writtenUtc: (await fs.stat(targetPath)).mtime.toISOString(),
  },
  metrics: { sourceLayerPixels, baseBytesPreservedOutsideLayer },
};
await fs.mkdir(path.dirname(lineagePath), { recursive: true });
await fs.writeFile(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(lineage, null, 2));
