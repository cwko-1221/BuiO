/**
 * Use an AI-isolated equipment guide only as geometry, then sample every visible output pixel
 * from the approved complete dressed-pet redraw. The standalone item art is never composited.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [
  basePath, dressedPath, guidePath, outputPrefix, radiusArg = '4',
  maximumShiftArg = '12', minimumScoreArg = '0.18', colourToleranceArg = '115',
] = process.argv.slice(2);
if (!basePath || !dressedPath || !guidePath || !outputPrefix) {
  console.error('usage: node scripts/extract-dressed-patch-from-guide.mjs <base> <dressed> <guide> <output-prefix> [contact-radius]');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const radius = Math.max(0, Math.min(12, Number(radiusArg)));
const configuredMaximumShift = Math.max(0, Math.min(60, Number(maximumShiftArg)));
const minimumScore = Math.max(-1, Math.min(1, Number(minimumScoreArg)));
const colourTolerance = Math.max(16, Math.min(300, Number(colourToleranceArg)));
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  }
  return result;
};

const base = await read(basePath);
const dressed = await read(dressedPath);
const guide = await read(guidePath);
const mask = new Uint8Array(WIDTH * HEIGHT);
const alignment = [];

const colourDistance = (guideAt, dressedAt) => {
  const red = guide.data[guideAt] - dressed.data[dressedAt];
  const green = guide.data[guideAt + 1] - dressed.data[dressedAt + 1];
  const blue = guide.data[guideAt + 2] - dressed.data[dressedAt + 2];
  return Math.sqrt(red * red + green * green + blue * blue);
};

// Expand only inside each atlas cell. The small falloff includes compressed fur and contact
// shadow around the equipment while preventing one pose from bleeding into its neighbour.
for (let cellY = 0; cellY < HEIGHT; cellY += CELL) {
  for (let cellX = 0; cellX < WIDTH; cellX += CELL) {
    let best = { dx: 0, dy: 0, score: -Infinity };
    // Image editing preserves the grid but can shift the isolated object by a few pixels. Match
    // its painted rainbow pattern back to the same pattern in the complete redraw per cell.
    const maximumShift = cellY / CELL === 3
      ? Math.max(38, configuredMaximumShift)
      : configuredMaximumShift;
    for (let dy = -maximumShift; dy <= maximumShift; dy += 1) {
      for (let dx = -maximumShift; dx <= maximumShift; dx += 1) {
        let score = 0;
        let samples = 0;
        for (let y = 0; y < CELL; y += 2) {
          for (let x = 0; x < CELL; x += 2) {
            const targetX = x + dx;
            const targetY = y + dy;
            if (targetX < 0 || targetX >= CELL || targetY < 0 || targetY >= CELL) continue;
            const guideAt = ((cellY + y) * WIDTH + cellX + x) * guide.info.channels;
            const guideAlpha = guide.data[guideAt + 3];
            if (guideAlpha < 48) continue;
            const dressedAt = ((cellY + targetY) * WIDTH + cellX + targetX) * dressed.info.channels;
            const dressedAlpha = dressed.data[dressedAt + 3];
            const distance = colourDistance(guideAt, dressedAt);
            score += guideAlpha / 255 * (dressedAlpha < 16 ? -1 : Math.max(-0.5, 1 - distance / 150));
            samples += 1;
          }
        }
        if (samples && score / samples > best.score) best = { dx, dy, score: score / samples };
      }
    }
    alignment.push({ column: cellX / CELL, row: cellY / CELL, ...best });

    // A guide edit sometimes invents an item that is fully occluded in the approved frame. A low
    // match means there is no trustworthy equipment region to extract, so leave that cell empty.
    if (best.score < minimumScore) continue;

    const aligned = new Uint8Array(CELL * CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const targetX = x + best.dx;
        const targetY = y + best.dy;
        if (targetX < 0 || targetX >= CELL || targetY < 0 || targetY >= CELL) continue;
        const guideAt = ((cellY + y) * WIDTH + cellX + x) * guide.info.channels;
        const sourceAlpha = guide.data[guideAt + 3];
        if (sourceAlpha < 8) continue;
        const dressedAt = ((cellY + targetY) * WIDTH + cellX + targetX) * dressed.info.channels;
        // The isolating edit can invent a scarf fragment in a special pose. Retain guide pixels
        // only where their colour actually matches the approved dressed redraw; the contact-radius
        // expansion below then recovers adjacent shadow and compressed fur.
        if (dressed.data[dressedAt + 3] < 8 || colourDistance(guideAt, dressedAt) > colourTolerance) continue;
        aligned[targetY * CELL + targetX] = sourceAlpha;
      }
    }

    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const sourceAlpha = aligned[y * CELL + x];
        if (sourceAlpha < 8) continue;
        const reach = Math.ceil(radius);
        for (let oy = -reach; oy <= reach; oy += 1) {
          for (let ox = -reach; ox <= reach; ox += 1) {
            const tx = x + ox;
            const ty = y + oy;
            if (tx < 0 || tx >= CELL || ty < 0 || ty >= CELL) continue;
            const distance = Math.hypot(ox, oy);
            if (distance > radius) continue;
            const falloff = radius <= 1 ? 1 : Math.min(1, Math.max(0, (radius + 0.5 - distance) / 2));
            const alpha = Math.round(sourceAlpha * falloff);
            const target = (cellY + ty) * WIDTH + cellX + tx;
            if (alpha > mask[target]) mask[target] = alpha;
          }
        }
      }
    }
  }
}

const patch = Buffer.alloc(WIDTH * HEIGHT * 4);
const erase = Buffer.alloc(WIDTH * HEIGHT * 4);
for (let index = 0; index < mask.length; index += 1) {
  const dressedAt = index * dressed.info.channels;
  const targetAt = index * 4;
  const alpha = Math.round(mask[index] * dressed.data[dressedAt + 3] / 255);
  patch[targetAt] = dressed.data[dressedAt];
  patch[targetAt + 1] = dressed.data[dressedAt + 1];
  patch[targetAt + 2] = dressed.data[dressedAt + 2];
  patch[targetAt + 3] = alpha;
  erase[targetAt] = 255;
  erase[targetAt + 1] = 255;
  erase[targetAt + 2] = 255;
  erase[targetAt + 3] = alpha;
}

await fs.mkdir(path.dirname(outputPrefix), { recursive: true });
const patchPath = `${outputPrefix}-patch.png`;
const maskPath = `${outputPrefix}-erase-mask.png`;
const proofPath = `${outputPrefix}-proof.png`;
await sharp(patch, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toFile(patchPath);
await sharp(erase, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toFile(maskPath);
const erased = await sharp(base.data, { raw: { width: WIDTH, height: HEIGHT, channels: base.info.channels } })
  .composite([{ input: erase, raw: { width: WIDTH, height: HEIGHT, channels: 4 }, blend: 'dest-out' }])
  .png()
  .toBuffer();
await sharp(erased)
  .composite([{ input: patch, raw: { width: WIDTH, height: HEIGHT, channels: 4 } }])
  .png()
  .toFile(proofPath);

console.log(JSON.stringify({
  patchPath, maskPath, proofPath, contactRadius: radius,
  maximumShift: configuredMaximumShift, minimumScore, colourTolerance, alignment,
}, null, 2));
