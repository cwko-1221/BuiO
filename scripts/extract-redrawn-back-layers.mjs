/** Extract split rear/front back-equipment layers from a registered complete pet redraw. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [basePath, dressedPath, guidePath, outputPrefix] = process.argv.slice(2);
if (!basePath || !dressedPath || !guidePath || !outputPrefix) {
  console.error('usage: node scripts/extract-redrawn-back-layers.mjs <base> <registered-dressed> <registered-guide> <output-prefix>');
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
const rear = Buffer.alloc(WIDTH * HEIGHT * 4);
const front = Buffer.alloc(WIDTH * HEIGHT * 4);
const erase = Buffer.alloc(WIDTH * HEIGHT * 4);
const alignment = [];

const colourFlags = (at) => {
  const r = dressed.data[at]; const g = dressed.data[at + 1]; const b = dressed.data[at + 2];
  const wing = (b > 105 && b > g * 1.03 && b > r * 0.72)
    || (r > 150 && b > 105 && r + b > g * 2.02);
  const leather = r > 55 && g > 20 && b < 105 && r > g * 1.18 && g > b * 1.04 && r + g + b < 505;
  return { wing, leather, equipment: wing || leather };
};
const copy = (target, targetAt, sourceAt) => {
  target[targetAt] = dressed.data[sourceAt];
  target[targetAt + 1] = dressed.data[sourceAt + 1];
  target[targetAt + 2] = dressed.data[sourceAt + 2];
  target[targetAt + 3] = dressed.data[sourceAt + 3];
};

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const candidate = new Uint8Array(CELL * CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * dressed.info.channels);
        if (dressed.data[at + 3] > 20 && colourFlags(at).equipment) candidate[y * CELL + x] = 1;
      }
    }

    let best = { dx: 0, dy: 0, score: -Infinity };
    for (let dy = -50; dy <= 50; dy += 1) {
      for (let dx = -50; dx <= 50; dx += 1) {
        let hit = 0; let miss = 0;
        for (let y = 0; y < CELL; y += 2) {
          for (let x = 0; x < CELL; x += 2) {
            const tx = x + dx; const ty = y + dy;
            if (tx < 0 || tx >= CELL || ty < 0 || ty >= CELL) continue;
            const guideAt = (((row * CELL + y) * WIDTH + column * CELL + x) * guide.info.channels);
            if (guide.data[guideAt + 3] < 48) continue;
            if (candidate[ty * CELL + tx]) hit += 1; else miss += 0.08;
          }
        }
        const score = hit - miss;
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
        if (candidate[local]) selected[local] = 1;
      }
    }
    // Recover pale membrane highlights and antialiased leather edges, but never leave the semantic
    // guide area or grow far enough to absorb the cat's similarly coloured fur.
    let frontier = [...selected.keys()].filter((index) => selected[index]);
    for (let step = 0; step < 3; step += 1) {
      const additions = [];
      for (const local of frontier) {
        const x = local % CELL; const y = Math.floor(local / CELL);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
          const neighbour = ny * CELL + nx;
          if (selected[neighbour] || !support[neighbour]) continue;
          const at = (((row * CELL + ny) * WIDTH + column * CELL + nx) * dressed.info.channels);
          if (dressed.data[at + 3] < 16) continue;
          selected[neighbour] = 1;
          additions.push(neighbour);
        }
      }
      frontier = additions;
    }

    const wingRegion = new Uint8Array(CELL * CELL);
    frontier = [];
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const local = y * CELL + x;
        if (!selected[local]) continue;
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * dressed.info.channels);
        if (colourFlags(at).wing) { wingRegion[local] = 1; frontier.push(local); }
      }
    }
    for (let step = 0; step < 4; step += 1) {
      const additions = [];
      for (const local of frontier) {
        const x = local % CELL; const y = Math.floor(local / CELL);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
          const neighbour = ny * CELL + nx;
          if (!selected[neighbour] || wingRegion[neighbour]) continue;
          wingRegion[neighbour] = 1;
          additions.push(neighbour);
        }
      }
      frontier = additions;
    }

    const membraneBehind = row === 0 || (row === 3 && column !== 2);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const local = y * CELL + x;
        if (!selected[local]) continue;
        const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * dressed.info.channels);
        const targetAt = sourceAt / dressed.info.channels * 4;
        if (membraneBehind && wingRegion[local]) {
          copy(rear, targetAt, sourceAt);
        } else {
          copy(front, targetAt, sourceAt);
          erase[targetAt] = 255; erase[targetAt + 1] = 255; erase[targetAt + 2] = 255;
          erase[targetAt + 3] = dressed.data[sourceAt + 3];
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
console.log(JSON.stringify({ rearPath, frontPath, erasePath, proofPath, alignment }, null, 2));
