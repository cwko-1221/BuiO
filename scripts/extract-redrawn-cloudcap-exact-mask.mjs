/** Segment the cloud cap in place; output is a same-coordinate mask, never a redrawn layer. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [fullRedrawPath, outputPath] = process.argv.slice(2);
if (!fullRedrawPath || !outputPath) {
  console.error('usage: node scripts/extract-redrawn-cloudcap-exact-mask.mjs <full-redraw> <output-mask>');
  process.exit(1);
}
const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const source = await sharp(fullRedrawPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (source.info.width !== WIDTH || source.info.height !== HEIGHT) throw new Error(`${fullRedrawPath} must be 800x640`);
const output = Buffer.alloc(WIDTH * HEIGHT * 4);
const neighbours = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const stats = [];

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const blueByY = new Uint16Array(CELL);
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
      if (source.data[at + 3] < 20) continue;
      const r = source.data[at]; const g = source.data[at + 1]; const b = source.data[at + 2];
      if (b > 105 && g > 55 && b > r * 1.08 && b > g * 0.96) blueByY[y] += 1;
    }
    let capBottom = -1;
    for (let y = 0; y < CELL; y += 1) if (blueByY[y] >= 4) capBottom = y + 2;
    if (capBottom < 0) throw new Error(`missing blue brim in row ${row}, column ${column}`);
    capBottom = Math.min(CELL - 1, capBottom);

    const candidate = new Uint8Array(CELL * CELL);
    const accentCandidate = new Uint8Array(CELL * CELL);
    for (let y = 0; y <= capBottom; y += 1) for (let x = 0; x < CELL; x += 1) {
      const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
      if (source.data[at + 3] < 20) continue;
      const r = source.data[at]; const g = source.data[at + 1]; const b = source.data[at + 2];
      const coolWhite = r > 145 && g > 145 && b > 150
        && Math.max(r, g, b) - Math.min(r, g, b) < 46
        && b > r * 0.95 && b > g * 0.97;
      const blue = b > 75 && b > r * 1.04 && b > g * 0.91;
      const lavender = b > 95 && b > r * 0.98 && b > g * 0.99 && r > 70 && g > 70;
      const rainbowRed = r > 145 && g < 165 && b < 150 && r > g * 1.15 && r > b * 1.2;
      const rainbowGreen = g > 105 && g > r * 0.76 && g > b * 0.86
        && Math.max(r, g, b) - Math.min(r, g, b) > 32;
      const gold = r > 155 && g > 75 && b < 118 && r > b * 1.42;
      // Warm accent colours also occur throughout the cat. They must never be
      // allowed to decide the main component (especially in the sleeping cell).
      if (coolWhite || blue || lavender) candidate[y * CELL + x] = 1;
      if (rainbowRed || rainbowGreen || gold) accentCandidate[y * CELL + x] = 1;
    }

    const seen = new Uint8Array(CELL * CELL);
    const components = [];
    for (let sy = 0; sy <= capBottom; sy += 1) for (let sx = 0; sx < CELL; sx += 1) {
      const seed = sy * CELL + sx;
      if (seen[seed] || !candidate[seed]) continue;
      const queue = [seed]; const pixels = []; seen[seed] = 1; let head = 0;
      let minX = sx; let minY = sy; let maxX = sx; let maxY = sy;
      while (head < queue.length) {
        const local = queue[head++]; pixels.push(local);
        const x = local % CELL; const y = Math.floor(local / CELL);
        minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
        for (const [ox, oy] of neighbours) {
          const nx = x + ox; const ny = y + oy;
          if (nx < 0 || nx >= CELL || ny < 0 || ny > capBottom) continue;
          const next = ny * CELL + nx;
          if (seen[next] || !candidate[next]) continue;
          seen[next] = 1; queue.push(next);
        }
      }
      components.push({ pixels, minX, minY, maxX, maxY });
    }
    const main = components.reduce((best, component) => !best || component.pixels.length > best.pixels.length ? component : best, null);
    if (!main || main.pixels.length < 250) throw new Error(`missing cloud component in row ${row}, column ${column}`);

    const barrier = new Uint8Array(CELL * CELL);
    const addWithOutline = (local) => {
        const x = local % CELL; const y = Math.floor(local / CELL);
        for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox; const ny = y + oy;
          if (nx < 0 || nx >= CELL || ny < 0 || ny > capBottom) continue;
          barrier[ny * CELL + nx] = 1;
        }
    };
    for (const local of main.pixels) addWithOutline(local);

    // Restore only upper rainbow/star accents spatially attached to the cloud.
    // This prevents orange tails and sleeping-body fur from entering the mask.
    const accentBottom = Math.min(capBottom, Math.round(main.minY + (main.maxY - main.minY) * 0.58));
    for (let y = Math.max(0, main.minY - 8); y <= accentBottom; y += 1) {
      for (let x = Math.max(0, main.minX - 8); x <= Math.min(CELL - 1, main.maxX + 8); x += 1) {
        const local = y * CELL + x;
        if (accentCandidate[local]) addWithOutline(local);
      }
    }

    // Fill only tiny, fully enclosed details inside the cap (eyes/mouth and
    // narrow ink gaps). Large enclosed areas are deliberately never filled.
    const minBoxX = Math.max(0, main.minX - 2);
    const maxBoxX = Math.min(CELL - 1, main.maxX + 2);
    const minBoxY = Math.max(0, main.minY - 2);
    const maxBoxY = Math.min(capBottom, main.maxY + 2);
    const holeSeen = new Uint8Array(CELL * CELL);
    for (let sy = minBoxY; sy <= maxBoxY; sy += 1) for (let sx = minBoxX; sx <= maxBoxX; sx += 1) {
      const seed = sy * CELL + sx;
      if (barrier[seed] || holeSeen[seed]) continue;
      const queue = [seed]; const hole = []; holeSeen[seed] = 1; let head = 0; let touchesBox = false;
      while (head < queue.length) {
        const local = queue[head++]; hole.push(local);
        const x = local % CELL; const y = Math.floor(local / CELL);
        if (x === minBoxX || x === maxBoxX || y === minBoxY || y === maxBoxY) touchesBox = true;
        for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = x + ox; const ny = y + oy;
          if (nx < minBoxX || nx > maxBoxX || ny < minBoxY || ny > maxBoxY) continue;
          const next = ny * CELL + nx;
          if (barrier[next] || holeSeen[next]) continue;
          holeSeen[next] = 1; queue.push(next);
        }
      }
      if (!touchesBox && hole.length <= 180) for (const local of hole) barrier[local] = 1;
    }

    // Remove isolated colour flecks (for example a one-pixel warm tail sample)
    // without touching any real cap or detached rainbow/star component.
    const cleanupSeen = new Uint8Array(CELL * CELL);
    for (let sy = 0; sy <= capBottom; sy += 1) for (let sx = 0; sx < CELL; sx += 1) {
      const seed = sy * CELL + sx;
      if (!barrier[seed] || cleanupSeen[seed]) continue;
      const queue = [seed]; const island = []; cleanupSeen[seed] = 1; let head = 0;
      while (head < queue.length) {
        const local = queue[head++]; island.push(local);
        const x = local % CELL; const y = Math.floor(local / CELL);
        for (const [ox, oy] of neighbours) {
          const nx = x + ox; const ny = y + oy;
          if (nx < 0 || nx >= CELL || ny < 0 || ny > capBottom) continue;
          const next = ny * CELL + nx;
          if (!barrier[next] || cleanupSeen[next]) continue;
          cleanupSeen[next] = 1; queue.push(next);
        }
      }
      if (island.length < 12) for (const local of island) barrier[local] = 0;
    }

    let maskPixels = 0;
    for (let y = 0; y <= capBottom; y += 1) for (let x = 0; x < CELL; x += 1) {
      const local = y * CELL + x;
      // Never flood-fill the cap silhouette. A broad fill also captures the pet
      // face/body underneath the brim. Keep only source-coordinate pixels that
      // are connected to the cap's own palette, plus the one-pixel outline.
      if (!barrier[local]) continue;
      const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
      if (source.data[sourceAt + 3] < 8) continue;
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * 4;
      output[at] = 255; output[at + 1] = 255; output[at + 2] = 255; output[at + 3] = 255; maskPixels += 1;
    }
    stats.push({ row, column, capBottom, maskPixels, components: components.length });
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, transformed: false, stats }, null, 2));
