/**
 * Refine the broad v5 cloud-cap silhouette without changing any coordinates.
 *
 * v5 correctly follows the visible cap silhouette but contains a few pet-fur
 * pixels at contact edges and one raised tail tip. This pass only removes those
 * warm pet-colour pixels and tiny islands; it never grows, moves, or resamples
 * the mask.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [fullRedrawPath, broadMaskPath, outputPath] = process.argv.slice(2);
if (!fullRedrawPath || !broadMaskPath || !outputPath) {
  console.error('usage: node scripts/refine-redrawn-cloudcap-v5-mask.mjs <full-redraw> <v5-mask> <output-mask>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error(`${input} must be 800x640`);
  return image.data;
};
const [source, broadMask] = await Promise.all([read(fullRedrawPath), read(broadMaskPath)]);
const output = Buffer.alloc(WIDTH * HEIGHT * 4);
const neighbours = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const stats = [];

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const selected = new Uint8Array(CELL * CELL);
    let capBottom = -1;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (broadMask[at + 3] > 8) capBottom = Math.max(capBottom, y);
      }
    }
    if (capBottom < 0) throw new Error(`empty v5 mask in row ${row}, column ${column}`);

    let removedWarm = 0;
    let removedTail = 0;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const globalAt = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (broadMask[globalAt + 3] <= 8 || source[globalAt + 3] <= 8) continue;
        const r = source[globalAt];
        const g = source[globalAt + 1];
        const b = source[globalAt + 2];

        const warmFur = r > 68
          && r > b * 1.075
          && g > b * 1.015
          && (r > g * 1.025 || r - b > 18);
        const saturatedRed = r > 140 && r > g * 1.12 && r > b * 1.14;
        const rainbowGreen = g > 98 && g > r * 0.72 && g > b * 0.82
          && Math.max(r, g, b) - Math.min(r, g, b) > 28;
        const goldOrOrange = r > 145 && g > 65 && b < 132 && r > b * 1.28;
        const cheekPink = r > 155 && g > 70 && b > 75 && r > g * 1.07 && r > b * 1.02;
        const upperDecoration = (cheekPink && y <= capBottom - 11)
          || (y <= capBottom - 28 && (saturatedRed || rainbowGreen || goldOrOrange));

        // These three contacts cannot be separated by connectivity alone:
        // the pet physically touches the cap. The coordinates describe source
        // pixels to reject, never a transform of the retained accessory.
        if (row === 3 && column === 0 && y < 42) {
          removedTail += 1;
          continue;
        }
        if (row === 3 && column === 1 && x > 113) {
          removedTail += 1;
          continue;
        }
        if (row === 3 && column === 2 && x > 82) {
          removedTail += 1;
          continue;
        }
        if (row === 3 && column === 2 && y > 78 && warmFur) {
          removedTail += 1;
          continue;
        }

        // A gold buckle can sit at the lower rear band. Retain gold only when
        // it is embedded in blue pixels on both sides; orange pet fur beneath
        // the brim does not have that support pattern.
        let supportedLowerGold = false;
        if (goldOrOrange && y > capBottom - 15) {
          let blueLeft = false;
          let blueRight = false;
          for (let offset = 1; offset <= 5; offset += 1) {
            for (const testX of [x - offset, x + offset]) {
              if (testX < 0 || testX >= CELL) continue;
              const testAt = (((row * CELL + y) * WIDTH + column * CELL + testX) * 4);
              const testR = source[testAt];
              const testG = source[testAt + 1];
              const testB = source[testAt + 2];
              const isBlue = testB > 72 && testG > 45 && testB > testR * 1.04 && testB > testG * 0.88;
              if (!isBlue) continue;
              if (testX < x) blueLeft = true;
              if (testX > x) blueRight = true;
            }
          }
          supportedLowerGold = blueLeft && blueRight;
        }

        const contactBandWarm = y >= capBottom - 6
          && r > 18
          && r > b + 3
          && g >= b - 2
          && r >= g - 3;
        if ((warmFur || contactBandWarm) && !upperDecoration && !supportedLowerGold) {
          removedWarm += 1;
          continue;
        }
        selected[y * CELL + x] = 1;
      }
    }

    const seen = new Uint8Array(CELL * CELL);
    const components = [];
    for (let seed = 0; seed < selected.length; seed += 1) {
      if (!selected[seed] || seen[seed]) continue;
      const queue = [seed];
      let head = 0;
      seen[seed] = 1;
      while (head < queue.length) {
        const local = queue[head++];
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        for (const [offsetX, offsetY] of neighbours) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= CELL || nextY < 0 || nextY >= CELL) continue;
          const next = nextY * CELL + nextX;
          if (!selected[next] || seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      components.push(queue);
    }
    components.sort((left, right) => right.length - left.length);
    let removedIsland = 0;
    for (const component of components.slice(1)) {
      if (component.length >= 20) continue;
      for (const local of component) selected[local] = 0;
      removedIsland += component.length;
    }

    let maskPixels = 0;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        if (!selected[y * CELL + x]) continue;
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        output[at] = 255;
        output[at + 1] = 255;
        output[at + 2] = 255;
        output[at + 3] = 255;
        maskPixels += 1;
      }
    }
    stats.push({ row, column, capBottom, maskPixels, removedWarm, removedTail, removedIsland });
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, width: WIDTH, height: HEIGHT, transformed: false, stats }, null, 2));
