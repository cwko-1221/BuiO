/** Widen the rear tail occlusion in the starpatch cat chef-toque front layer. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [frontPath, basePath, outputPath, proofPath] = process.argv.slice(2);
if (!frontPath || !basePath || !outputPath || !proofPath) {
  console.error('usage: node scripts/correct-redrawn-chef-back-occlusion.mjs <front-atlas> <base-atlas> <output-front> <output-proof>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const BACK_ROW = 2;

const front = await sharp(frontPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const base = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (const [label, image] of [['front', front], ['base', base]]) {
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) {
    throw new Error(`${label} atlas must be ${WIDTH}x${HEIGHT}`);
  }
}

const corrected = Buffer.from(front.data);
const stats = [];

for (let column = 0; column < 5; column += 1) {
  let redMinY = CELL;
  let redMaxY = -1;
  let redMinX = CELL;
  let redMaxX = -1;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const at = (((BACK_ROW * CELL + y) * WIDTH + column * CELL + x) * front.info.channels);
      if (front.data[at + 3] < 20) continue;
      const r = front.data[at];
      const g = front.data[at + 1];
      const b = front.data[at + 2];
      const isRibbonRed = r > 105 && g < 115 && b < 105 && r > g * 1.35 && r > b * 1.25;
      if (!isRibbonRed) continue;
      redMinX = Math.min(redMinX, x);
      redMaxX = Math.max(redMaxX, x);
      redMinY = Math.min(redMinY, y);
      redMaxY = Math.max(redMaxY, y);
    }
  }
  if (redMaxY < redMinY) throw new Error(`no rear red ribbon found in column ${column}`);

  // The base tail is centred at roughly x=82 in every registered rear cell. The generated
  // cutout traced it too tightly, so red antialiasing read as a ring at game size. Give the
  // tail a deliberate pocket of breathing room while leaving the off-centre bow intact.
  const centreX = 82;
  const top = Math.max(0, redMinY - 4);
  const bottom = Math.min(CELL - 1, redMaxY + 9);
  const fullHalfWidth = 22;
  const feather = 2;
  let clearedPixels = 0;
  for (let y = top - feather; y <= bottom + feather; y += 1) {
    if (y < 0 || y >= CELL) continue;
    const verticalDistance = y < top ? top - y : y > bottom ? y - bottom : 0;
    const roundedInset = verticalDistance > 0 ? verticalDistance : 0;
    const halfWidth = fullHalfWidth - roundedInset;
    if (halfWidth <= 0) continue;
    for (let x = Math.floor(centreX - halfWidth - feather); x <= Math.ceil(centreX + halfWidth + feather); x += 1) {
      if (x < 0 || x >= CELL) continue;
      const horizontalDistance = Math.max(0, Math.abs(x - centreX) - halfWidth);
      const edgeDistance = Math.hypot(horizontalDistance, verticalDistance);
      if (edgeDistance > feather) continue;
      const alphaScale = Math.max(0, Math.min(1, edgeDistance / feather));
      const at = (((BACK_ROW * CELL + y) * WIDTH + column * CELL + x) * 4);
      const previousAlpha = corrected[at + 3];
      corrected[at + 3] = Math.round(previousAlpha * alphaScale);
      if (corrected[at + 3] < previousAlpha) clearedPixels += 1;
    }
  }
  stats.push({ column, redMinX, redMaxX, redMinY, redMaxY, centreX, top, bottom, fullHalfWidth, clearedPixels });
}

const proof = Buffer.alloc(WIDTH * HEIGHT * 4);
for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
  const at = pixel * 4;
  const frontAlpha = corrected[at + 3] / 255;
  const baseAlpha = base.data[at + 3] / 255;
  const outputAlpha = frontAlpha + baseAlpha * (1 - frontAlpha);
  if (outputAlpha <= 0) continue;
  for (let channel = 0; channel < 3; channel += 1) {
    proof[at + channel] = Math.round(
      (corrected[at + channel] * frontAlpha + base.data[at + channel] * baseAlpha * (1 - frontAlpha)) / outputAlpha,
    );
  }
  proof[at + 3] = Math.round(outputAlpha * 255);
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await Promise.all([
  sharp(corrected, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outputPath),
  sharp(proof, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png({ compressionLevel: 9 }).toFile(proofPath),
]);
console.log(JSON.stringify({ outputPath, proofPath, stats }, null, 2));
