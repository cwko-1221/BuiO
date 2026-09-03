/** Build a transparent, filled semantic guide from an ImageGen isolation sheet on a smooth matte. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, outputPath, deltaArg = '14'] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error('usage: node scripts/extract-isolation-guide-from-gradient.mjs <input> <output> [edge-delta]');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const deltaThreshold = Number(deltaArg);
const resized = await sharp(inputPath).resize(WIDTH, HEIGHT, { fit: 'fill' }).removeAlpha().raw()
  .toBuffer({ resolveWithObject: true });
const blurred = await sharp(resized.data, { raw: resized.info }).blur(6).raw().toBuffer();
const mask = new Uint8Array(WIDTH * HEIGHT);

for (let index = 0; index < WIDTH * HEIGHT; index += 1) {
  const at = index * resized.info.channels;
  const delta = Math.max(
    Math.abs(resized.data[at] - blurred[at]),
    Math.abs(resized.data[at + 1] - blurred[at + 1]),
    Math.abs(resized.data[at + 2] - blurred[at + 2]),
  );
  if (delta >= deltaThreshold) mask[index] = 1;
}

const dilate = (source, radius = 1) => {
  const result = new Uint8Array(source.length);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      let found = 0;
      for (let oy = -radius; oy <= radius && !found; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
          if (source[ny * WIDTH + nx]) { found = 1; break; }
        }
      }
      result[y * WIDTH + x] = found;
    }
  }
  return result;
};

let working = dilate(mask, 1);
const cleaned = new Uint8Array(working.length);
const componentStats = [];

// Work cell-by-cell so an accidental line can never leak into a neighbouring animation frame.
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const seen = new Uint8Array(CELL * CELL);
    const kept = [];
    for (let sy = 0; sy < CELL; sy += 1) {
      for (let sx = 0; sx < CELL; sx += 1) {
        const localSeed = sy * CELL + sx;
        const globalSeed = (row * CELL + sy) * WIDTH + column * CELL + sx;
        if (seen[localSeed] || !working[globalSeed]) continue;
        const queue = [localSeed];
        const pixels = [];
        seen[localSeed] = 1;
        let head = 0;
        while (head < queue.length) {
          const local = queue[head++];
          pixels.push(local);
          const x = local % CELL;
          const y = Math.floor(local / CELL);
          for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
            if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
            const neighbour = ny * CELL + nx;
            const global = (row * CELL + ny) * WIDTH + column * CELL + nx;
            if (seen[neighbour] || !working[global]) continue;
            seen[neighbour] = 1;
            queue.push(neighbour);
          }
        }
        // Smooth matte gradients create only tiny numerical edges. Every intended frame part is
        // substantially larger, including the rear temple ends.
        const touchesCellBorder = pixels.some((local) => {
          const x = local % CELL;
          const y = Math.floor(local / CELL);
          return x <= 2 || x >= CELL - 3 || y <= 2 || y >= CELL - 3;
        });
        if (pixels.length >= 12 && pixels.length < 5000 && !touchesCellBorder) kept.push(pixels);
      }
    }
    for (const pixels of kept) {
      for (const local of pixels) {
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        cleaned[(row * CELL + y) * WIDTH + column * CELL + x] = 1;
      }
    }

    // Fill enclosed lens interiors, retaining the outline as the semantic boundary.
    const outside = new Uint8Array(CELL * CELL);
    const queue = [];
    const pushOutside = (x, y) => {
      if (x < 0 || x >= CELL || y < 0 || y >= CELL) return;
      const local = y * CELL + x;
      const global = (row * CELL + y) * WIDTH + column * CELL + x;
      if (outside[local] || cleaned[global]) return;
      outside[local] = 1;
      queue.push(local);
    };
    for (let x = 0; x < CELL; x += 1) { pushOutside(x, 0); pushOutside(x, CELL - 1); }
    for (let y = 0; y < CELL; y += 1) { pushOutside(0, y); pushOutside(CELL - 1, y); }
    let head = 0;
    while (head < queue.length) {
      const local = queue[head++];
      const x = local % CELL;
      const y = Math.floor(local / CELL);
      pushOutside(x - 1, y); pushOutside(x + 1, y); pushOutside(x, y - 1); pushOutside(x, y + 1);
    }
    let filledPixels = 0;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const local = y * CELL + x;
        const global = (row * CELL + y) * WIDTH + column * CELL + x;
        if (!outside[local]) { cleaned[global] = 1; filledPixels += 1; }
      }
    }
    componentStats.push({ column, row, components: kept.length, filledPixels });
  }
}

working = dilate(cleaned, 1);
const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
for (let index = 0; index < WIDTH * HEIGHT; index += 1) {
  const at = index * 4;
  rgba[at] = 255;
  rgba[at + 1] = 255;
  rgba[at + 2] = 255;
  rgba[at + 3] = working[index] ? 255 : 0;
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(rgba, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, deltaThreshold, componentStats }, null, 2));
