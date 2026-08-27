/** Extract the visible red/blue/gold crown silhouette from a fully redrawn pet atlas. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [dressedPath, outputPath] = process.argv.slice(2);
if (!dressedPath || !outputPath) {
  console.error('usage: node scripts/extract-redrawn-crown-guide.mjs <dressed-atlas> <output-guide>');
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
const stats = [];
const neighbours8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

const classify = (at) => {
  const r = dressed.data[at];
  const g = dressed.data[at + 1];
  const b = dressed.data[at + 2];
  const alpha = dressed.data[at + 3];
  if (alpha < 20) return { seed: false, crown: false };
  const redVelvet = r > 130 && g < 62 && b < 52 && r > g * 2.25 && r > b * 2.15;
  const blueJewel = b > 105 && b > r * 1.08 && b > g * 1.18 && r < 155;
  const crownGold = r > 115 && g > 45 && b < 62 && r > g * 1.3 && g > b * 1.25;
  const darkGoldOutline = r > 55 && r < 175 && g > 20 && g < 110 && b < 38 && r > g * 1.35;
  return {
    seed: redVelvet || blueJewel,
    crown: redVelvet || blueJewel || crownGold || darkGoldOutline,
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
    const seeds = new Uint8Array(CELL * CELL);
    const crownColours = new Uint8Array(CELL * CELL);
    let minX = CELL; let minY = CELL; let maxX = -1; let maxY = -1; let seedPixels = 0;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * dressed.info.channels);
        const type = classify(sourceAt);
        const local = y * CELL + x;
        if (type.crown) crownColours[local] = 1;
        // Crown accents live in the head zone. This excludes similarly red paw pads, food and
        // matte fringe without assuming a particular crown width or ear occlusion shape.
        const seedLimit = row === 3 ? [65, 62, 100, 65, 65][column] : [78, 88, 68][row];
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

    // Limit extraction to the crown neighbourhood. This rejects the kitten's gold forehead star
    // and orange fur even though their hue overlaps some polished-gold highlights.
    const bounds = {
      left: Math.max(0, minX - 18),
      right: Math.min(CELL - 1, maxX + 18),
      top: Math.max(0, minY - 18),
      bottom: Math.min(CELL - 1, maxY + 12),
    };
    // Traverse only actual crown-colour pixels. Expanding before connectivity would bridge the
    // gold band into orange ear fur and the forehead star, producing the same cut-ear defect the
    // modular mask is meant to prevent.
    const admissible = crownColours;
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
        if (connected[neighbour] || !admissible[neighbour]) continue;
        connected[neighbour] = 1;
        queue.push(neighbour);
      }
    }

    // Remove secondary face/eye components below the crown. Legitimate pieces separated by an
    // occluding ear still overlap the main crown's vertical span; false iris/star matches do not.
    const componentSeen = new Uint8Array(CELL * CELL);
    const components = [];
    for (let y = bounds.top; y <= bounds.bottom; y += 1) {
      for (let x = bounds.left; x <= bounds.right; x += 1) {
        const seed = y * CELL + x;
        if (componentSeen[seed] || !connected[seed]) continue;
        const pixels = [seed];
        componentSeen[seed] = 1;
        let componentHead = 0;
        let minComponentY = y;
        let maxComponentY = y;
        let componentSeedPixels = 0;
        while (componentHead < pixels.length) {
          const local = pixels[componentHead++];
          const px = local % CELL;
          const py = Math.floor(local / CELL);
          minComponentY = Math.min(minComponentY, py);
          maxComponentY = Math.max(maxComponentY, py);
          if (seeds[local]) componentSeedPixels += 1;
          for (const [ox, oy] of neighbours8) {
            const nx = px + ox;
            const ny = py + oy;
            if (nx < bounds.left || nx > bounds.right || ny < bounds.top || ny > bounds.bottom) continue;
            const neighbour = ny * CELL + nx;
            if (componentSeen[neighbour] || !connected[neighbour]) continue;
            componentSeen[neighbour] = 1;
            pixels.push(neighbour);
          }
        }
        components.push({
          pixels,
          minY: minComponentY,
          maxY: maxComponentY,
          seedPixels: componentSeedPixels,
        });
      }
    }
    const primary = components.reduce((best, component) => (
      !best || component.pixels.length > best.pixels.length ? component : best
    ), null);
    const crownComponents = new Uint8Array(CELL * CELL);
    for (const component of components) {
      const overlapsPrimary = primary
        && component.minY <= primary.maxY + 3
        && component.maxY >= primary.minY - 3;
      if (
        !overlapsPrimary
        || component.pixels.length < 10
        || (component !== primary && component.seedPixels < 6)
      ) continue;
      for (const local of component.pixels) crownComponents[local] = 1;
    }

    // A tiny final expansion captures pearl interiors and antialiased gold edges without growing
    // across the occlusion gap made by an ear.
    const visible = dilate(crownComponents, 2);
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
