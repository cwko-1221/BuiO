/** Extract a tight face-wear replacement using guide shape plus metallic-line candidates. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [basePath, dressedPath, guidePath, outputPrefix] = process.argv.slice(2);
if (!basePath || !dressedPath || !guidePath || !outputPrefix) {
  console.error('usage: node scripts/extract-redrawn-face-layer.mjs <base> <registered-dressed> <registered-guide> <output-prefix>');
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
const [base, dressed, guide] = await Promise.all([read(basePath), read(dressedPath), read(guidePath)]);
const patch = Buffer.alloc(WIDTH * HEIGHT * 4);
const erase = Buffer.alloc(WIDTH * HEIGHT * 4);
const alignment = [];

const isMetal = (at) => {
  const r = dressed.data[at]; const g = dressed.data[at + 1]; const b = dressed.data[at + 2];
  const brightGold = r > 145 && g > 72 && b < 125 && r > g * 1.16 && g > b * 1.05;
  const darkArm = r > 65 && g > 25 && b < 90 && r > g * 1.2 && g > b * 1.04;
  return brightGold || darkArm;
};
const copy = (targetAt, sourceAt, strength) => {
  const alpha = Math.round(dressed.data[sourceAt + 3] * strength / 255);
  patch[targetAt] = dressed.data[sourceAt];
  patch[targetAt + 1] = dressed.data[sourceAt + 1];
  patch[targetAt + 2] = dressed.data[sourceAt + 2];
  patch[targetAt + 3] = alpha;
  erase[targetAt] = 255; erase[targetAt + 1] = 255; erase[targetAt + 2] = 255;
  erase[targetAt + 3] = alpha;
};

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const metal = new Uint8Array(CELL * CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * dressed.info.channels);
        if (dressed.data[at + 3] > 20 && isMetal(at)) metal[y * CELL + x] = 1;
      }
    }
    let best = { dx: 0, dy: 0, score: -Infinity };
    for (let dy = -55; dy <= 55; dy += 1) {
      for (let dx = -55; dx <= 55; dx += 1) {
        let hit = 0; let miss = 0;
        for (let y = 0; y < CELL; y += 2) {
          for (let x = 0; x < CELL; x += 2) {
            const tx = x + dx; const ty = y + dy;
            if (tx < 0 || tx >= CELL || ty < 0 || ty >= CELL) continue;
            const guideAt = (((row * CELL + y) * WIDTH + column * CELL + x) * guide.info.channels);
            if (guide.data[guideAt + 3] < 48) continue;
            if (metal[ty * CELL + tx]) hit += 1; else miss += 0.1;
          }
        }
        // The isolation edit preserves the grid. A distant match is almost certainly the gold
        // forehead star or food bowl, not a legitimately shifted pair of glasses.
        const score = hit - miss - 0.25 * (dx * dx + dy * dy);
        if (score > best.score) best = { dx, dy, score };
      }
    }
    alignment.push({ column, row, ...best });

    const support = new Uint8Array(CELL * CELL);
    const selected = new Uint8Array(CELL * CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const tx = x + best.dx; const ty = y + best.dy;
        if (tx < 0 || tx >= CELL || ty < 0 || ty >= CELL) continue;
        const guideAt = (((row * CELL + y) * WIDTH + column * CELL + x) * guide.info.channels);
        if (guide.data[guideAt + 3] < 8) continue;
        const local = ty * CELL + tx;
        support[local] = 1;
        // Alignment is discovered from metallic candidates, but the final replacement follows
        // the complete semantic glasses silhouette. Keeping only gold candidates deletes pale
        // lens rims and the foreshortened profile ring at game scale.
        selected[local] = 255;
      }
    }

    // Face equipment remains readable when a small amount of the approved, locally redrawn eye
    // and fur region travels with it. A soft ten-pixel replacement also tolerates tiny guide drift
    // without turning the output back into a standalone glasses sticker.
    const localReplacement = new Uint8Array(CELL * CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        if (!selected[y * CELL + x]) continue;
        for (let oy = -10; oy <= 10; oy += 1) {
          for (let ox = -10; ox <= 10; ox += 1) {
            const nx = x + ox; const ny = y + oy;
            if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
            const distance = Math.hypot(ox, oy);
            if (distance > 10) continue;
            const strength = distance <= 8 ? 255 : Math.round((10 - distance) / 2 * 255);
            const neighbour = ny * CELL + nx;
            if (strength > localReplacement[neighbour]) localReplacement[neighbour] = strength;
          }
        }
      }
    }
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const strength = localReplacement[y * CELL + x];
        if (!strength) continue;
        const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * dressed.info.channels);
        copy(sourceAt / dressed.info.channels * 4, sourceAt, strength);
      }
    }
  }
}

await fs.mkdir(path.dirname(outputPrefix), { recursive: true });
const raw = { width: WIDTH, height: HEIGHT, channels: 4 };
const patchPath = `${outputPrefix}-patch.png`;
const erasePath = `${outputPrefix}-erase-mask.png`;
const proofPath = `${outputPrefix}-proof.png`;
await Promise.all([
  sharp(patch, { raw }).png().toFile(patchPath),
  sharp(erase, { raw }).png().toFile(erasePath),
]);
const body = await sharp(base.data, { raw: { width: WIDTH, height: HEIGHT, channels: base.info.channels } })
  .composite([{ input: erase, raw, blend: 'dest-out' }]).png().toBuffer();
await sharp(body).composite([{ input: patch, raw }]).png().toFile(proofPath);
console.log(JSON.stringify({ patchPath, erasePath, proofPath, alignment }, null, 2));
