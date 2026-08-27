/**
 * Split a sampled wing/harness redraw into layers that straddle the pet.
 *
 * Front-facing wing membranes sit behind the body while their harness remains in front. Profile,
 * rear-facing and curled/sleeping poses show the wing across the visible back and stay in front.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [basePath, combinedPath, outputPrefix] = process.argv.slice(2);
if (!basePath || !combinedPath || !outputPrefix) {
  console.error('usage: node scripts/split-redrawn-back-layers.mjs <base-atlas> <combined-patch> <output-prefix>');
  process.exit(1);
}
const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) throw new Error(`${input} must be 800x640`);
  return result;
};
const [base, combined] = await Promise.all([read(basePath), read(combinedPath)]);
const rear = Buffer.alloc(WIDTH * HEIGHT * 4);
const front = Buffer.alloc(WIDTH * HEIGHT * 4);
const erase = Buffer.alloc(WIDTH * HEIGHT * 4);

const copyPixel = (target, targetAt, sourceAt) => {
  target[targetAt] = combined.data[sourceAt];
  target[targetAt + 1] = combined.data[sourceAt + 1];
  target[targetAt + 2] = combined.data[sourceAt + 2];
  target[targetAt + 3] = combined.data[sourceAt + 3];
};
const isWingColour = (at) => {
  const r = combined.data[at];
  const g = combined.data[at + 1];
  const b = combined.data[at + 2];
  // Iridescent blue/cyan/pink membrane. Brown leather and cream contact fur deliberately fail.
  return (b > 105 && b > g * 1.04 && b > r * 0.76)
    || (r > 155 && b > 115 && (r + b) > g * 2.12);
};

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    // Front-facing cells: the wing membrane is behind the pet. The curled sleep pose is the one
    // special-row exception because its folded wing lies visibly across the body.
    const splitMembraneBehind = row === 0 || (row === 3 && column !== 2);
    const rearMask = new Uint8Array(CELL * CELL);
    if (splitMembraneBehind) {
      const seeds = [];
      for (let y = 0; y < CELL; y += 1) {
        for (let x = 0; x < CELL; x += 1) {
          const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * combined.info.channels);
          if (combined.data[sourceAt + 3] > 20 && isWingColour(sourceAt)) {
            const local = y * CELL + x;
            rearMask[local] = 1;
            seeds.push(local);
          }
        }
      }
      // Recover gold edging, antialiasing and immediate wing contact without walking through the
      // connected leather harness. Four pixels is enough at the 160px production cell scale.
      for (let step = 0; step < 4; step += 1) {
        const additions = [];
        for (const local of seeds) {
          const x = local % CELL;
          const y = Math.floor(local / CELL);
          for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
            const neighbour = ny * CELL + nx;
            if (rearMask[neighbour]) continue;
            const sourceAt = (((row * CELL + ny) * WIDTH + column * CELL + nx) * combined.info.channels);
            if (combined.data[sourceAt + 3] < 12) continue;
            rearMask[neighbour] = 1;
            additions.push(neighbour);
          }
        }
        seeds.splice(0, seeds.length, ...additions);
      }
    }

    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * combined.info.channels);
        const targetAt = sourceAt / combined.info.channels * 4;
        const alpha = combined.data[sourceAt + 3];
        if (!alpha) continue;
        if (rearMask[y * CELL + x]) {
          copyPixel(rear, targetAt, sourceAt);
        } else {
          copyPixel(front, targetAt, sourceAt);
          erase[targetAt] = 255;
          erase[targetAt + 1] = 255;
          erase[targetAt + 2] = 255;
          erase[targetAt + 3] = alpha;
        }
      }
    }
  }
}

await fs.mkdir(path.dirname(outputPrefix), { recursive: true });
const raw = { width: WIDTH, height: HEIGHT, channels: 4 };
const rearPath = `${outputPrefix}-rear.png`;
const frontPath = `${outputPrefix}-front.png`;
const erasePath = `${outputPrefix}-erase-mask.png`;
const proofPath = `${outputPrefix}-proof.png`;
await Promise.all([
  sharp(rear, { raw }).png().toFile(rearPath),
  sharp(front, { raw }).png().toFile(frontPath),
  sharp(erase, { raw }).png().toFile(erasePath),
]);
const body = await sharp(base.data, { raw: { width: WIDTH, height: HEIGHT, channels: base.info.channels } })
  .composite([{ input: erase, raw, blend: 'dest-out' }]).png().toBuffer();
await sharp(rear, { raw }).composite([{ input: body }, { input: front, raw }]).png().toFile(proofPath);
console.log(JSON.stringify({ rearPath, frontPath, erasePath, proofPath }, null, 2));
