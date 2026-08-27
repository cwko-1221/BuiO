/**
 * Convert a generated full-redraw reference into a pixel-locked target.
 * The generated image remains the visual authority, while the original pet is
 * restored byte-for-byte everywhere the approved accessory mask is empty.
 * This makes an exact wearable-only recomposition possible without hiding body
 * changes inside a mask.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [fullPath, basePath, maskPath, outputPath, reportPath] = process.argv.slice(2);
if (!fullPath || !basePath || !maskPath || !outputPath || !reportPath) {
  console.error('usage: node scripts/lock-redrawn-target-to-base.mjs <full-reference> <base> <mask> <locked-target> <report>');
  process.exit(1);
}
const read = async (file) => {
  const image = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== 800 || image.info.height !== 640 || image.info.channels !== 4) throw new Error(`${file} must be 800x640 RGBA`);
  return image.data;
};
const [full, base, mask] = await Promise.all([read(fullPath), read(basePath), read(maskPath)]);
const output = Buffer.from(base);
let accessoryPixels = 0; let bodyBytesReplaced = 0; let fullReferenceVisibleMaskPixels = 0;
for (let at = 0; at < output.length; at += 4) {
  if (full[at + 3] > 0 && mask[at + 3] > 0) {
    fullReferenceVisibleMaskPixels += 1;
    for (let channel = 0; channel < 4; channel += 1) output[at + channel] = full[at + channel];
    accessoryPixels += 1;
  } else {
    for (let channel = 0; channel < 4; channel += 1) if (full[at + channel] !== base[at + channel]) bodyBytesReplaced += 1;
  }
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: 800, height: 640, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outputPath);
const sha256 = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report = {
  verdict: 'BODY_LOCKED_TARGET', fullPath, basePath, maskPath, outputPath,
  geometry: { canvas: '800x640', transformed: false, sameCoordinate: true },
  policy: 'full reference pixels inside mask; original pet bytes outside mask',
  accessoryPixels, fullReferenceVisibleMaskPixels, bodyBytesReplaced,
  hashes: { full: await sha256(fullPath), base: await sha256(basePath), mask: await sha256(maskPath), output: await sha256(outputPath) },
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
