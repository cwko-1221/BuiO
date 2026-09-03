/** Repair only checker-connected cavities inside the frozen sailor-cap crown ROIs. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, donorPath, outputPath, reportPath] = process.argv.slice(2);
if (!targetPath || !donorPath || !outputPath || !reportPath) {
  console.error('usage: node scripts/repair-cap-crown-holes.mjs <clean-target> <aligned-crown-donor> <output> <report>');
  process.exit(1);
}
const read = async (file) => {
  const image = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== 800 || image.info.height !== 640 || image.info.channels !== 4) throw new Error(`${file} must be 800x640 RGBA`);
  return image.data;
};
const [target, donor] = await Promise.all([read(targetPath), read(donorPath)]);
const repaired = Buffer.from(target);
// Local coordinates are intentionally conservative: they cover the crown above the band and
// never touch eyes, ears, tail, face or body. The donor is consulted only where the clean target
// is transparent, so no existing target pixel can be displaced by this repair.
const polygons = [
  [[34, 66], [38, 28], [52, 9], [80, 1], [110, 8], [126, 27], [132, 66]], // front
  [[43, 65], [50, 27], [76, 5], [111, 9], [136, 38], [132, 65]], // side
  [[34, 66], [39, 27], [53, 8], [80, 1], [110, 8], [127, 27], [132, 66]], // back
];
const rowKind = (row) => (row === 1 ? 1 : row === 2 ? 2 : 0);
const inside = (x, y, polygon) => {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]; const [xj, yj] = polygon[j];
    const crossing = ((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crossing) result = !result;
  }
  return result;
};
let repairedPixels = 0; let donorOpaquePixels = 0;
for (let row = 0; row < 4; row += 1) for (let col = 0; col < 5; col += 1) {
  const polygon = polygons[rowKind(row)];
  for (let y = 0; y < 160; y += 1) for (let x = 0; x < 160; x += 1) {
    if (!inside(x, y, polygon)) continue;
    const at = ((row * 160 + y) * 800 + col * 160 + x) * 4;
    if (target[at + 3] !== 0) continue;
    if (donor[at + 3] === 0) continue;
    donorOpaquePixels += 1;
    for (let channel = 0; channel < 4; channel += 1) repaired[at + channel] = donor[at + channel];
    repairedPixels += 1;
  }
}
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(repaired, { raw: { width: 800, height: 640, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outputPath);
const sha256 = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report = {
  verdict: 'CROWN_HOLE_REPAIR_APPLIED', targetPath, donorPath, outputPath,
  geometry: { canvas: '800x640', transformed: false, donorOnlyWhenTargetTransparent: true },
  roi: 'per-cell conservative crown polygons above the blue band', repairedPixels, donorOpaquePixels,
  targetSha256: await sha256(targetPath), donorSha256: await sha256(donorPath), outputSha256: await sha256(outputPath),
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
