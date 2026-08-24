/** Seal small enclosed holes in a same-coordinate accessory mask and target. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, maskPath, outputTargetPath, outputMaskPath, maxHoleArg = '200'] = process.argv.slice(2);
if (!targetPath || !maskPath || !outputTargetPath || !outputMaskPath) {
  console.error('usage: node scripts/seal-redrawn-accessory-holes.mjs <target> <mask> <output-target> <output-mask> [max-hole-pixels]');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const maxHolePixels = Number(maxHoleArg);
const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  return image.data;
};
const [sourceTarget, sourceMask] = await Promise.all([read(targetPath), read(maskPath)]);
const target = Buffer.from(sourceTarget);
const mask = Buffer.from(sourceMask);
const four = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const stats = [];

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const seen = new Uint8Array(CELL * CELL);
    const holes = [];
    for (let sy = 0; sy < CELL; sy += 1) for (let sx = 0; sx < CELL; sx += 1) {
      const seed = sy * CELL + sx;
      const seedAt = (((row * CELL + sy) * WIDTH + column * CELL + sx) * 4);
      if (seen[seed] || mask[seedAt + 3] > 8) continue;
      const queue = [seed]; seen[seed] = 1; let head = 0; let touchesCellEdge = false;
      while (head < queue.length) {
        const local = queue[head++];
        const x = local % CELL; const y = Math.floor(local / CELL);
        if (x === 0 || x === CELL - 1 || y === 0 || y === CELL - 1) touchesCellEdge = true;
        for (const [ox, oy] of four) {
          const nx = x + ox; const ny = y + oy;
          if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
          const next = ny * CELL + nx;
          const at = (((row * CELL + ny) * WIDTH + column * CELL + nx) * 4);
          if (seen[next] || mask[at + 3] > 8) continue;
          seen[next] = 1; queue.push(next);
        }
      }
      if (!touchesCellEdge && queue.length <= maxHolePixels) holes.push(queue);
    }

    let sealedPixels = 0;
    let reconstructedTransparentPixels = 0;
    for (const hole of holes) {
      for (const local of hole) {
        const x = local % CELL; const y = Math.floor(local / CELL);
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        mask[at] = 255; mask[at + 1] = 255; mask[at + 2] = 255; mask[at + 3] = 255;
        sealedPixels += 1;
        if (target[at + 3] > 8) continue;

        // A normalization matte can leave an isolated transparent pixel inside
        // painted fabric. Reconstruct only that pixel from the nearest opaque
        // accessory neighbours; no geometry is moved or resampled.
        const samples = [];
        for (let radius = 1; radius <= 4 && !samples.length; radius += 1) {
          for (let oy = -radius; oy <= radius; oy += 1) for (let ox = -radius; ox <= radius; ox += 1) {
            if (Math.max(Math.abs(ox), Math.abs(oy)) !== radius) continue;
            const nx = x + ox; const ny = y + oy;
            if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
            const neighbourAt = (((row * CELL + ny) * WIDTH + column * CELL + nx) * 4);
            if (mask[neighbourAt + 3] <= 8 || target[neighbourAt + 3] <= 8) continue;
            samples.push(neighbourAt);
          }
        }
        if (!samples.length) throw new Error(`unable to reconstruct enclosed pixel at row ${row}, column ${column}, x ${x}, y ${y}`);
        for (let channel = 0; channel < 3; channel += 1) {
          target[at + channel] = Math.round(samples.reduce((sum, sampleAt) => sum + target[sampleAt + channel], 0) / samples.length);
        }
        target[at + 3] = 255;
        reconstructedTransparentPixels += 1;
      }
    }
    stats.push({ row, column, holes: holes.length, sealedPixels, reconstructedTransparentPixels });
  }
}

await Promise.all([
  fs.mkdir(path.dirname(outputTargetPath), { recursive: true }),
  fs.mkdir(path.dirname(outputMaskPath), { recursive: true }),
]);
await Promise.all([
  sharp(target, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outputTargetPath),
  sharp(mask, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png({ compressionLevel: 9 }).toFile(outputMaskPath),
]);
console.log(JSON.stringify({
  targetPath: outputTargetPath,
  maskPath: outputMaskPath,
  maxHolePixels,
  transformed: false,
  stats,
}, null, 2));
