/**
 * Extract a same-coordinate cloud-cap mask from the complete redraw.
 *
 * This deliberately never dilates the mask into warm pet pixels. The source
 * atlas is sampled at its original 800x640 coordinates; no resize, rotation,
 * translation, or resampling operation is performed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [fullRedrawPath, outputPath] = process.argv.slice(2);
if (!fullRedrawPath || !outputPath) {
  console.error('usage: node scripts/extract-redrawn-cloudcap-mask-v6.mjs <full-redraw> <output-mask>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const source = await sharp(fullRedrawPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (source.info.width !== WIDTH || source.info.height !== HEIGHT) {
  throw new Error(`${fullRedrawPath} must be ${WIDTH}x${HEIGHT}`);
}

const output = Buffer.alloc(WIDTH * HEIGHT * 4);
const neighbours = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const manualTop = new Map([
  // Feeding pose: a raised orange tail sits directly behind the rainbow. Its
  // pale tip is not part of the cap and must never enter the accessory mask.
  ['3,0', 42],
]);
const stats = [];

const colourClass = (r, g, b) => {
  const cloudWhite = r > 132 && g > 130 && b > 140
    && Math.max(r, g, b) - Math.min(r, g, b) < 62
    && b >= r - 5 && b >= g - 3;
  const capBlue = b > 72 && g > 48 && b > r * 1.025 && b > g * 0.89;
  const lavender = b > 88 && r > 55 && g > 55 && b >= r - 2 && b >= g - 2;
  const navyInk = r < 142 && g < 150 && b < 190
    && b >= r * 0.78 && b >= g * 0.79;
  const rainbowRed = r > 140 && r > g * 1.12 && r > b * 1.13;
  const rainbowGreen = g > 95 && g > r * 0.72 && g > b * 0.82
    && Math.max(r, g, b) - Math.min(r, g, b) > 28;
  const starGold = r > 145 && g > 68 && b < 126 && r > b * 1.32;
  const cheekPink = r > 155 && g > 70 && b > 80 && r > g * 1.08 && r > b * 1.03;
  return { cloudWhite, capBlue, lavender, navyInk, rainbowRed, rainbowGreen, starGold, cheekPink };
};

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const blueByY = new Uint16Array(CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (source.data[at + 3] < 8) continue;
        const { capBlue } = colourClass(source.data[at], source.data[at + 1], source.data[at + 2]);
        if (capBlue) blueByY[y] += 1;
      }
    }
    let capBottom = -1;
    for (let y = 0; y < CELL; y += 1) if (blueByY[y] >= 4) capBottom = y + 1;
    if (capBottom < 0) throw new Error(`missing blue brim in row ${row}, column ${column}`);
    capBottom = Math.min(CELL - 1, capBottom);
    const top = manualTop.get(`${row},${column}`) ?? 0;

    const eligible = new Uint8Array(CELL * CELL);
    for (let y = top; y <= capBottom; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (source.data[at + 3] < 8) continue;
        const classes = colourClass(source.data[at], source.data[at + 1], source.data[at + 2]);
        const upperAccent = y <= capBottom - 8
          && (classes.rainbowRed || classes.rainbowGreen || classes.starGold || classes.cheekPink);
        if (classes.cloudWhite || classes.capBlue || classes.lavender || classes.navyInk || upperAccent) {
          eligible[y * CELL + x] = 1;
        }
      }
    }

    // Select the largest semantic component. Warm pet fur is excluded from the
    // palette above, so touching forehead/tail pixels cannot bridge into it.
    const seen = new Uint8Array(CELL * CELL);
    const components = [];
    for (let seed = 0; seed < eligible.length; seed += 1) {
      if (!eligible[seed] || seen[seed]) continue;
      const queue = [seed];
      let head = 0;
      let minX = seed % CELL;
      let maxX = minX;
      let minY = Math.floor(seed / CELL);
      let maxY = minY;
      seen[seed] = 1;
      while (head < queue.length) {
        const local = queue[head++];
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (const [offsetX, offsetY] of neighbours) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= CELL || nextY < top || nextY > capBottom) continue;
          const next = nextY * CELL + nextX;
          if (!eligible[next] || seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      components.push({ pixels: queue, minX, minY, maxX, maxY });
    }
    components.sort((left, right) => right.pixels.length - left.pixels.length);
    const main = components[0];
    if (!main || main.pixels.length < 300) throw new Error(`missing cap component in row ${row}, column ${column}`);

    const selected = new Uint8Array(CELL * CELL);
    for (const local of main.pixels) selected[local] = 1;

    // Add detached rainbow/star/ink components only when they are close to the
    // cap and live above the brim. This restores genuine details without ever
    // accepting isolated tail highlights or background specks.
    const distanceToMainBox = (component) => {
      const dx = component.maxX < main.minX ? main.minX - component.maxX
        : component.minX > main.maxX ? component.minX - main.maxX : 0;
      const dy = component.maxY < main.minY ? main.minY - component.maxY
        : component.minY > main.maxY ? component.minY - main.maxY : 0;
      return Math.max(dx, dy);
    };
    for (const component of components.slice(1)) {
      if (component.pixels.length < 4 || component.maxY > capBottom - 5 || distanceToMainBox(component) > 7) continue;
      for (const local of component.pixels) selected[local] = 1;
    }

    // Fill only tiny enclosed ink gaps above the brim (the cloud's facial
    // details). The large opening below the brim, where the pet face belongs,
    // is never filled.
    const minBoxX = Math.max(0, main.minX - 1);
    const maxBoxX = Math.min(CELL - 1, main.maxX + 1);
    const minBoxY = Math.max(top, main.minY - 1);
    const maxBoxY = Math.min(capBottom - 8, main.maxY);
    const holeSeen = new Uint8Array(CELL * CELL);
    for (let seedY = minBoxY; seedY <= maxBoxY; seedY += 1) {
      for (let seedX = minBoxX; seedX <= maxBoxX; seedX += 1) {
        const seed = seedY * CELL + seedX;
        if (selected[seed] || holeSeen[seed]) continue;
        const queue = [seed];
        let head = 0;
        let touchesBox = false;
        holeSeen[seed] = 1;
        while (head < queue.length) {
          const local = queue[head++];
          const x = local % CELL;
          const y = Math.floor(local / CELL);
          if (x === minBoxX || x === maxBoxX || y === minBoxY || y === maxBoxY) touchesBox = true;
          for (const [offsetX, offsetY] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const nextX = x + offsetX;
            const nextY = y + offsetY;
            if (nextX < minBoxX || nextX > maxBoxX || nextY < minBoxY || nextY > maxBoxY) continue;
            const next = nextY * CELL + nextX;
            if (selected[next] || holeSeen[next]) continue;
            holeSeen[next] = 1;
            queue.push(next);
          }
        }
        if (!touchesBox && queue.length <= 90) for (const local of queue) selected[local] = 1;
      }
    }

    // Final cleanup is based on the actual exported pixels, so an island whose
    // opaque portion is only a few pixels cannot survive due to transparent
    // bridge pixels in the source.
    const finalSeen = new Uint8Array(CELL * CELL);
    const finalComponents = [];
    for (let seed = 0; seed < selected.length; seed += 1) {
      if (!selected[seed] || finalSeen[seed]) continue;
      const queue = [seed];
      let head = 0;
      finalSeen[seed] = 1;
      while (head < queue.length) {
        const local = queue[head++];
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        for (const [offsetX, offsetY] of neighbours) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= CELL || nextY < top || nextY > capBottom) continue;
          const next = nextY * CELL + nextX;
          if (!selected[next] || finalSeen[next]) continue;
          finalSeen[next] = 1;
          queue.push(next);
        }
      }
      finalComponents.push(queue);
    }
    finalComponents.sort((left, right) => right.length - left.length);
    for (const component of finalComponents.slice(1)) {
      if (component.length < 16) for (const local of component) selected[local] = 0;
    }

    let maskPixels = 0;
    for (let y = top; y <= capBottom; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const local = y * CELL + x;
        if (!selected[local]) continue;
        const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (source.data[sourceAt + 3] < 8) continue;
        const outputAt = sourceAt;
        output[outputAt] = 255;
        output[outputAt + 1] = 255;
        output[outputAt + 2] = 255;
        output[outputAt + 3] = 255;
        maskPixels += 1;
      }
    }
    stats.push({
      row,
      column,
      top,
      capBottom,
      maskPixels,
      semanticComponents: components.map((component) => component.pixels.length).slice(0, 8),
      bounds: { minX: main.minX, minY: main.minY, maxX: main.maxX, maxY: main.maxY },
    });
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, width: WIDTH, height: HEIGHT, transformed: false, stats }, null, 2));
