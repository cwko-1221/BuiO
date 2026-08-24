/**
 * Compose a same-coordinate accessory layer over a pet atlas while preserving
 * the original base RGBA bytes wherever the layer is transparent.
 *
 * This is intentionally separate from the visual proof compositor: a frozen
 * target used for source-over solving must not rewrite RGB hidden under alpha
 * zero.  No resize, crop, transform, or colour conversion is performed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [basePath, layerPath, outputPath] = process.argv.slice(2);
if (!basePath || !layerPath || !outputPath) {
  console.error('usage: node scripts/compose-preserve-base-rgba.mjs <base> <same-coordinate-layer> <output>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CHANNELS = 4;
const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}; got ${image.info.width}x${image.info.height}`);
  }
  return image.data;
};

const [base, layer] = await Promise.all([read(basePath), read(layerPath)]);
const output = Buffer.alloc(base.length);
for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
  const at = pixel * CHANNELS;
  const layerAlpha = layer[at + 3] / 255;
  if (layerAlpha <= 0) {
    // Preserve even RGB hidden below transparent base pixels. This is required
    // for exact byte-for-byte proof after a later mask extraction.
    output[at] = base[at];
    output[at + 1] = base[at + 1];
    output[at + 2] = base[at + 2];
    output[at + 3] = base[at + 3];
    continue;
  }
  const baseAlpha = base[at + 3] / 255;
  const outputAlpha = layerAlpha + baseAlpha * (1 - layerAlpha);
  if (outputAlpha <= 0) continue;
  output[at] = Math.round((layer[at] * layerAlpha + base[at] * baseAlpha * (1 - layerAlpha)) / outputAlpha);
  output[at + 1] = Math.round((layer[at + 1] * layerAlpha + base[at + 1] * baseAlpha * (1 - layerAlpha)) / outputAlpha);
  output[at + 2] = Math.round((layer[at + 2] * layerAlpha + base[at + 2] * baseAlpha * (1 - layerAlpha)) / outputAlpha);
  output[at + 3] = Math.round(outputAlpha * 255);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, width: WIDTH, height: HEIGHT, transforms: false, preservesTransparentBaseRgb: true }));
