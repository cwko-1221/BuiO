/**
 * Diagnostic only: preserve the frozen head-20 reference inside the declared
 * helmet windows and restore the original pet bytes everywhere else.
 *
 * This output is never an approval target. It exists to separate the source
 * body's drift blocker from later mask/composite topology blockers. The report
 * records the source reference hash and the number of restored body pixels.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [fullPath, basePath, specPath, outputPath, reportPath] = process.argv.slice(2);
if (!fullPath || !basePath || !specPath || !outputPath || !reportPath) {
  console.error('usage: node scripts/build-head20-body-locked-diagnostic.mjs <full-reference> <base> <spec> <output> <report>');
  process.exit(1);
}
const read = async (file) => {
  const image = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== 800 || image.info.height !== 640 || image.info.channels !== 4) throw new Error(`${file} must be 800x640 RGBA`);
  return image.data;
};
const [full, base, spec] = await Promise.all([
  read(fullPath), read(basePath), fs.readFile(specPath, 'utf8').then(JSON.parse),
]);
const zones = new Map((spec.topology?.replacementZones ?? spec.solve?.eraseReplacement?.allowedRegions ?? [])
  .filter((entry) => Number.isInteger(entry.row) && Number.isInteger(entry.column) && Array.isArray(entry.zone))
  .map((entry) => [`${entry.row}:${entry.column}`, entry.zone]));
if (zones.size !== 20) throw new Error(`expected 20 per-cell replacement zones; got ${zones.size}`);
const output = Buffer.from(base);
let changedPixelsInside = 0; let restoredPixelsOutside = 0; let restoredBytesOutside = 0;
for (let y = 0; y < 640; y += 1) for (let x = 0; x < 800; x += 1) {
  const row = Math.floor(y / 160); const column = Math.floor(x / 160); const zone = zones.get(`${row}:${column}`);
  const inside = x - column * 160 >= zone[0] && x - column * 160 < zone[2]
    && y - row * 160 >= zone[1] && y - row * 160 < zone[3];
  const at = (y * 800 + x) * 4;
  const differs = full[at] !== base[at] || full[at + 1] !== base[at + 1]
    || full[at + 2] !== base[at + 2] || full[at + 3] !== base[at + 3];
  if (inside) {
    for (let channel = 0; channel < 4; channel += 1) output[at + channel] = full[at + channel];
    if (differs) changedPixelsInside += 1;
  } else {
    if (differs) restoredPixelsOutside += 1;
    for (let channel = 0; channel < 4; channel += 1) {
      if (full[at + channel] !== base[at + channel]) restoredBytesOutside += 1;
      output[at + channel] = base[at + channel];
    }
  }
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: 800, height: 640, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outputPath);
const sha256 = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report = {
  verdict: 'DIAGNOSTIC_BODY_LOCKED_NOT_PUBLISHABLE',
  sourceFullRedraw: fullPath,
  basePath,
  specPath,
  outputPath,
  geometry: { canvas: '800x640', transformed: false, sameCoordinate: true },
  policy: 'source full-redraw pixels inside helmet replacement windows; base pixels outside windows',
  metrics: { changedPixelsInside, restoredPixelsOutside, restoredBytesOutside },
  hashes: { sourceFullRedraw: await sha256(fullPath), base: await sha256(basePath), output: await sha256(outputPath) },
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
