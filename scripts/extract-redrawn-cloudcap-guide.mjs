/** Extract a registration guide for the cool-white/blue cloud cap from a complete pet redraw. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [dressedPath, outputPath] = process.argv.slice(2);
if (!dressedPath || !outputPath) {
  console.error('usage: node scripts/extract-redrawn-cloudcap-guide.mjs <registered-dressed-atlas> <output-guide>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const dressed = await sharp(dressedPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (dressed.info.width !== WIDTH || dressed.info.height !== HEIGHT) throw new Error(`${dressedPath} must be 800x640`);
const output = Buffer.alloc(WIDTH * HEIGHT * 4);
const stats = [];

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const candidates = new Uint8Array(CELL * CELL);
    const blueByY = new Uint16Array(CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (dressed.data[at + 3] < 20) continue;
        const r = dressed.data[at]; const g = dressed.data[at + 1]; const b = dressed.data[at + 2];
        if (b > 105 && g > 55 && b > r * 1.08 && b > g * 0.96) blueByY[y] += 1;
      }
    }
    let blueMaxY = -1;
    for (let y = 0; y < CELL; y += 1) if (blueByY[y] >= 4) blueMaxY = y;
    if (blueMaxY < 0) throw new Error(`no blue cap anchor in row ${row}, column ${column}`);
    // The brim/strap is the lowest blue construction piece in every pose. Limiting the growth to
    // that edge prevents cool cream chest fur from joining the white cloud component.
    const yLimit = Math.min(CELL - 1, blueMaxY + 2);
    for (let y = 0; y <= yLimit; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (dressed.data[at + 3] < 20) continue;
        const r = dressed.data[at];
        const g = dressed.data[at + 1];
        const b = dressed.data[at + 2];
        const high = Math.max(r, g, b);
        const low = Math.min(r, g, b);
        const coolWhite = r > 132 && g > 132 && b > 145 && b > r * 0.87 && b > g * 0.91;
        const blue = b > 82 && b > r * 1.06 && b > g * 0.94;
        const rainbowRed = r > 145 && r > g * 1.18 && r > b * 1.22;
        const rainbowGreen = g > 105 && g > r * 0.76 && g > b * 0.86 && high - low > 30;
        const gold = r > 145 && g > 75 && b < 115 && r > b * 1.45;
        const lavender = b > 95 && b > r * 0.96 && b > g * 0.98 && r > 72 && g > 72;
        if (coolWhite || blue || rainbowRed || rainbowGreen || gold || lavender) candidates[y * CELL + x] = 1;
      }
    }

    const seen = new Uint8Array(CELL * CELL);
    const components = [];
    for (let sy = 0; sy < CELL; sy += 1) {
      for (let sx = 0; sx < CELL; sx += 1) {
        const seed = sy * CELL + sx;
        if (seen[seed] || !candidates[seed]) continue;
        const queue = [seed];
        seen[seed] = 1;
        let head = 0;
        let minX = sx; let minY = sy; let maxX = sx; let maxY = sy; let pixels = 0;
        while (head < queue.length) {
          const local = queue[head++];
          const x = local % CELL;
          const y = Math.floor(local / CELL);
          minX = Math.min(minX, x); minY = Math.min(minY, y);
          maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); pixels += 1;
          for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
            const neighbour = ny * CELL + nx;
            if (seen[neighbour] || !candidates[neighbour]) continue;
            seen[neighbour] = 1;
            queue.push(neighbour);
          }
        }
        components.push({ minX, minY, maxX, maxY, pixels });
      }
    }
    const largest = components.reduce((best, component) => (
      !best || component.pixels > best.pixels ? component : best
    ), null);
    if (!largest || largest.pixels < 250) throw new Error(`no cloud-cap guide component in row ${row}, column ${column}`);
    const { minX, minY, maxX, maxY, pixels } = largest;

    // Fill the classified cap's bounding silhouette. Registration needs stable outer bounds rather
    // than exact internal holes, and the tight vertical limits keep all warm pet anatomy excluded.
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const at = ((row * CELL + y) * WIDTH + column * CELL + x) * 4;
        output[at] = 255;
        output[at + 1] = 255;
        output[at + 2] = 255;
        output[at + 3] = 255;
      }
    }
    stats.push({ row, column, minX, minY, maxX, maxY, pixels, components: components.length });
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, stats }, null, 2));
