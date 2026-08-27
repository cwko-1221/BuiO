/** Extract the visible blue/gold/purple star barrette from an aligned complete pet redraw. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [dressedPath, outputPath] = process.argv.slice(2);
if (!dressedPath || !outputPath) {
  console.error('usage: node scripts/extract-redrawn-starclip-guide.mjs <registered-dressed-atlas> <output-guide>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const dressed = await sharp(dressedPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (dressed.info.width !== WIDTH || dressed.info.height !== HEIGHT) {
  throw new Error(`${dressedPath} must be ${WIDTH}x${HEIGHT}`);
}

const result = Buffer.alloc(WIDTH * HEIGHT * 4);
const neighbours8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const stats = [];

const classify = (at) => {
  const r = dressed.data[at];
  const g = dressed.data[at + 1];
  const b = dressed.data[at + 2];
  const alpha = dressed.data[at + 3];
  if (alpha < 20) return { seed: false, clip: false };
  const blue = b > 82 && b > r * 1.08 && b > g * 1.08 && r < 175;
  const purple = b > 75 && r > 48 && b > g * 1.24 && r > g * 1.02;
  const brightGold = r > 135 && g > 62 && b < 86 && r > g * 1.16 && g > b * 1.22;
  const darkGold = r > 50 && r < 175 && g > 24 && g < 118 && b < 64
    && r > g * 1.28 && g > b * 1.08;
  return { seed: blue || purple, clip: blue || purple || brightGold || darkGold };
};

const dilate = (source, radius) => {
  const target = new Uint8Array(CELL * CELL);
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      if (!source[y * CELL + x]) continue;
      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          if (ox * ox + oy * oy > radius * radius) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
          target[ny * CELL + nx] = 1;
        }
      }
    }
  }
  return target;
};

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const seedLimit = row === 3 ? [112, 100, 126, 100, 100][column] : [102, 104, 108][row];
    const seeds = new Uint8Array(CELL * CELL);
    const clipColours = new Uint8Array(CELL * CELL);
    let minX = CELL; let minY = CELL; let maxX = -1; let maxY = -1; let seedPixels = 0;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * dressed.info.channels);
        const type = classify(sourceAt);
        const local = y * CELL + x;
        if (type.clip) clipColours[local] = 1;
        if (!type.seed || y > seedLimit) continue;
        seeds[local] = 1;
        seedPixels += 1;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
    if (!seedPixels) {
      stats.push({ column, row, seedPixels: 0, guidePixels: 0 });
      continue;
    }
    const bounds = {
      left: Math.max(0, minX - 15),
      right: Math.min(CELL - 1, maxX + 15),
      top: Math.max(0, minY - 15),
      bottom: Math.min(CELL - 1, maxY + 15),
    };
    const connected = new Uint8Array(CELL * CELL);
    const queue = [];
    for (let y = bounds.top; y <= bounds.bottom; y += 1) {
      for (let x = bounds.left; x <= bounds.right; x += 1) {
        const local = y * CELL + x;
        if (!seeds[local]) continue;
        connected[local] = 1;
        queue.push(local);
      }
    }
    let head = 0;
    while (head < queue.length) {
      const local = queue[head++];
      const x = local % CELL;
      const y = Math.floor(local / CELL);
      for (const [ox, oy] of neighbours8) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx < bounds.left || nx > bounds.right || ny < bounds.top || ny > bounds.bottom) continue;
        const neighbour = ny * CELL + nx;
        if (connected[neighbour] || !clipColours[neighbour]) continue;
        connected[neighbour] = 1;
        queue.push(neighbour);
      }
    }
    const visible = dilate(connected, 2);
    let guidePixels = 0;
    for (let y = bounds.top; y <= bounds.bottom; y += 1) {
      for (let x = bounds.left; x <= bounds.right; x += 1) {
        const local = y * CELL + x;
        if (!visible[local]) continue;
        const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * dressed.info.channels);
        if (dressed.data[sourceAt + 3] < 20) continue;
        const targetAt = ((row * CELL + y) * WIDTH + column * CELL + x) * 4;
        result[targetAt] = 255;
        result[targetAt + 1] = 255;
        result[targetAt + 2] = 255;
        result[targetAt + 3] = 255;
        guidePixels += 1;
      }
    }
    stats.push({ column, row, seedPixels, guidePixels, bounds });
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(result, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, stats }, null, 2));
