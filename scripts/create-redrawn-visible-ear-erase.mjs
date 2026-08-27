/** Remove only small, detached base-ear remnants left visible outside an enclosed front layer. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [basePath, frontPath, outputPath] = process.argv.slice(2);
if (!basePath || !frontPath || !outputPath) {
  console.error('usage: node scripts/create-redrawn-visible-ear-erase.mjs <base-atlas> <front-atlas> <output-mask>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error(`${input} must be 800x640`);
  return image;
};
const [base, front] = await Promise.all([read(basePath), read(frontPath)]);
const output = Buffer.alloc(WIDTH * HEIGHT * 4);
const stats = [];

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const visible = new Uint8Array(CELL * CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        // A very soft cap-edge pixel still lets the warm base ear read as a coloured fringe.
        if (base.data[at + 3] > 8 && front.data[at + 3] < 245) visible[y * CELL + x] = 1;
      }
    }

    const seen = new Uint8Array(CELL * CELL);
    const components = [];
    for (let sy = 0; sy < CELL; sy += 1) {
      for (let sx = 0; sx < CELL; sx += 1) {
        const seed = sy * CELL + sx;
        if (seen[seed] || !visible[seed]) continue;
        const queue = [seed];
        const pixels = [];
        seen[seed] = 1;
        let head = 0;
        let minX = sx; let minY = sy; let maxX = sx; let maxY = sy;
        while (head < queue.length) {
          const local = queue[head++];
          pixels.push(local);
          const x = local % CELL;
          const y = Math.floor(local / CELL);
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
          for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
            const neighbour = ny * CELL + nx;
            if (seen[neighbour] || !visible[neighbour]) continue;
            seen[neighbour] = 1;
            queue.push(neighbour);
          }
        }
        components.push({ minX, minY, maxX, maxY, pixels });
      }
    }

    const selected = components.filter((component) => {
      const count = component.pixels.length;
      const height = component.maxY - component.minY + 1;
      const rowCeiling = row === 2 ? 69 : 111;
      const isHighDetachedFragment = component.minY < 65
        && component.maxY <= rowCeiling
        && count < 1250
        && height < 88;
      // Sleeping pose deliberately leaves a continuous ear/head silhouette below a tilted cap.
      return !(row === 3 && column === 2) && isHighDetachedFragment;
    });

    const selectedPixels = new Uint8Array(CELL * CELL);
    for (const component of selected) {
      for (const pixel of component.pixels) selectedPixels[pixel] = 1;
    }
    // Two pixels of expansion remove the coloured antialias fringe without approaching the body.
    let erasePixels = 0;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        let shouldErase = false;
        for (let oy = -2; oy <= 2 && !shouldErase; oy += 1) {
          for (let ox = -2; ox <= 2; ox += 1) {
            if (ox * ox + oy * oy > 4) continue;
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
            if (selectedPixels[ny * CELL + nx]) { shouldErase = true; break; }
          }
        }
        if (!shouldErase) continue;
        const at = ((row * CELL + y) * WIDTH + column * CELL + x) * 4;
        output[at] = 255;
        output[at + 1] = 255;
        output[at + 2] = 255;
        output[at + 3] = 255;
        erasePixels += 1;
      }
    }
    stats.push({
      row,
      column,
      components: components.map((component) => ({
        x: component.minX,
        y: component.minY,
        width: component.maxX - component.minX + 1,
        height: component.maxY - component.minY + 1,
        pixels: component.pixels.length,
      })),
      selected: selected.length,
      erasePixels,
    });
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, stats }, null, 2));
