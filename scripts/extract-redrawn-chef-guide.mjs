/** Extract the visible white/red/gold chef toque from an aligned complete pet redraw. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [dressedPath, outputPath] = process.argv.slice(2);
if (!dressedPath || !outputPath) {
  console.error('usage: node scripts/extract-redrawn-chef-guide.mjs <registered-dressed-atlas> <output-guide>');
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
  if (alpha < 20) return { seed: false, hat: false, hanging: false };
  const red = r > 118 && g < 92 && b < 88 && r > g * 1.55 && r > b * 1.5;
  const coolWhite = r > 150 && g > 148 && b > 158 && b > r * 0.91 && b > g * 0.94
    && Math.max(r, g, b) - Math.min(r, g, b) < 82;
  const lavenderShadow = b > 95 && b > r * 0.94 && b > g * 0.98 && r > 72 && g > 72;
  const gold = r > 130 && g > 65 && b < 92 && r > g * 1.12 && g > b * 1.2;
  const darkGold = r > 48 && r < 175 && g > 25 && g < 120 && b < 66
    && r > g * 1.25 && g > b * 1.05;
  return {
    seed: red,
    hat: red || coolWhite || lavenderShadow || gold || darkGold,
    hanging: red,
  };
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
    const seedLimit = row === 3 ? [116, 106, 132, 106, 106][column] : [108, 110, 116][row];
    const seeds = new Uint8Array(CELL * CELL);
    const hatColours = new Uint8Array(CELL * CELL);
    const hangingColours = new Uint8Array(CELL * CELL);
    let minX = CELL; let minY = CELL; let maxX = -1; let maxY = -1; let seedPixels = 0;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * dressed.info.channels);
        const type = classify(sourceAt);
        const local = y * CELL + x;
        if (type.hat) hatColours[local] = 1;
        if (type.hanging) hangingColours[local] = 1;
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
      left: Math.max(0, minX - 24),
      right: Math.min(CELL - 1, maxX + 24),
      top: Math.max(0, minY - 72),
      bottom: Math.min(CELL - 1, maxY + 18),
    };
    // The sash/bow can hang below the hat band. Only saturated red/gold pixels are allowed that
    // low; white/lavender pixels below the band belong to the kitten's face or chest.
    const fabricPadding = row === 3
      ? [14, 11, 13, 11, 11][column]
      : [8, 12, 18][row];
    const fabricBottom = Math.min(CELL - 1, minY + fabricPadding);
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
        if (
          connected[neighbour]
          || !hatColours[neighbour]
          || (ny > fabricBottom && !hangingColours[neighbour])
        ) continue;
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
        if (y > fabricBottom && !hangingColours[local]) continue;
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
    stats.push({ column, row, seedPixels, guidePixels, bounds, fabricBottom });
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(result, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, stats }, null, 2));
