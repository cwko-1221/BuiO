/** Extract the visible safari/pith-helmet silhouette from a fully redrawn pet atlas. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [dressedPath, outputPath] = process.argv.slice(2);
if (!dressedPath || !outputPath) {
  console.error('usage: node scripts/extract-redrawn-safari-guide.mjs <dressed-atlas> <output-guide>');
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

const colourType = (at) => {
  const r = dressed.data[at];
  const g = dressed.data[at + 1];
  const b = dressed.data[at + 2];
  const alpha = dressed.data[at + 3];
  if (alpha < 20) return { seed: false, helmet: false };

  // The saturated lenses and feather are unambiguous anchors. The leather and canvas ranges are
  // intentionally conservative: connectivity grows through the actual hat, not orange pet fur.
  const blueLens = b > 72 && b > r * 1.03 && b > g * 1.02 && r < 145;
  const redFeather = r > 125 && g < 98 && b < 82 && r > g * 1.45 && r > b * 1.55;
  const leather = r > 45 && r < 180 && g > 20 && g < 112 && b < 74
    && r > g * 1.35 && g > b * 1.08;
  const brass = r > 118 && g > 62 && g < 170 && b < 72 && r > g * 1.18 && g > b * 1.25;
  const tanCanvas = r > 135 && g > 88 && b > 36 && b < 148
    && r > g * 1.08 && g > b * 1.18 && (r - b) > 62;
  const paleCanvas = r > 185 && g > 145 && b > 88 && b < 185
    && r > g * 1.025 && g > b * 1.08 && (r - b) > 42;

  return {
    seed: blueLens || redFeather || leather,
    helmet: blueLens || redFeather || leather || brass || tanCanvas || paleCanvas,
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
    const helmetColours = new Uint8Array(CELL * CELL);
    const seeds = new Uint8Array(CELL * CELL);
    const seedLimit = row === 3 ? [92, 96, 120, 90, 90][column] : [92, 96, 96][row];
    let seedPixels = 0;
    let minX = CELL; let minY = CELL; let maxX = -1; let maxY = -1;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * dressed.info.channels);
        const type = colourType(sourceAt);
        const local = y * CELL + x;
        if (type.helmet) helmetColours[local] = 1;
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
      left: Math.max(0, minX - 22),
      right: Math.min(CELL - 1, maxX + 22),
      top: Math.max(0, minY - 18),
      bottom: Math.min(CELL - 1, maxY + 18),
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
        if (connected[neighbour] || !helmetColours[neighbour]) continue;
        connected[neighbour] = 1;
        queue.push(neighbour);
      }
    }

    // Keep substantial head-zone components containing a unique helmet seed. This preserves the
    // feather when an ear separates it from the dome while rejecting eyes, paws and food below.
    const seen = new Uint8Array(CELL * CELL);
    const selected = new Uint8Array(CELL * CELL);
    for (let sy = bounds.top; sy <= bounds.bottom; sy += 1) {
      for (let sx = bounds.left; sx <= bounds.right; sx += 1) {
        const seed = sy * CELL + sx;
        if (seen[seed] || !connected[seed]) continue;
        const pixels = [seed];
        seen[seed] = 1;
        let componentHead = 0;
        let componentSeeds = 0;
        let componentMinY = sy;
        while (componentHead < pixels.length) {
          const local = pixels[componentHead++];
          const x = local % CELL;
          const y = Math.floor(local / CELL);
          if (seeds[local]) componentSeeds += 1;
          componentMinY = Math.min(componentMinY, y);
          for (const [ox, oy] of neighbours8) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx < bounds.left || nx > bounds.right || ny < bounds.top || ny > bounds.bottom) continue;
            const neighbour = ny * CELL + nx;
            if (seen[neighbour] || !connected[neighbour]) continue;
            seen[neighbour] = 1;
            pixels.push(neighbour);
          }
        }
        if (pixels.length < 12 || componentSeeds < 4 || componentMinY > seedLimit) continue;
        for (const local of pixels) selected[local] = 1;
      }
    }

    const visible = dilate(selected, 2);
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
