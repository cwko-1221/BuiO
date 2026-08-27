/**
 * Remove pet pixels from the broad head-06 locked-target-v2 mask.
 * Retained pixels stay at their original 800x640 coordinates. No geometric
 * transform or resampling is performed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, broadMaskPath, outputPath] = process.argv.slice(2);
if (!targetPath || !broadMaskPath || !outputPath) {
  console.error('usage: node scripts/refine-redrawn-cloudcap-locked-v2-mask.mjs <target> <broad-mask> <output-mask>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  return image.data;
};
const [source, broadMask] = await Promise.all([read(targetPath), read(broadMaskPath)]);
const output = Buffer.alloc(WIDTH * HEIGHT * 4);
const neighbours = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const stats = [];

const classesFor = (r, g, b) => ({
  cloudWhite: r > 132 && g > 128 && b > 140
    && Math.max(r, g, b) - Math.min(r, g, b) < 64
    && b >= r - 7 && b >= g - 5,
  capBlue: b > 78 && g > 50 && b > r * 1.04 && b > g * 0.89,
  lavender: b > 88 && r > 50 && g > 50 && b >= r - 3 && b >= g - 3,
  saturatedRed: r > 140 && r > g * 1.12 && r > b * 1.14,
  rainbowGreen: g > 95 && g > r * 0.72 && g > b * 0.82
    && Math.max(r, g, b) - Math.min(r, g, b) > 28,
  starGold: r > 148 && g > 66 && b < 132 && r > b * 1.28,
  cheekPink: r > 155 && g > 70 && b > 72 && r > g * 1.07 && r > b * 1.02,
  coolInk: r < 142 && g < 152 && b < 192 && b >= r * 0.76 && b >= g * 0.76,
});

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    let capBottom = -1;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (broadMask[at + 3] > 8) capBottom = Math.max(capBottom, y);
      }
    }
    if (capBottom < 0) throw new Error(`empty input mask at row ${row}, column ${column}`);

    let feedingRaisedTailPixels = 0;
    if (row === 3 && column === 0) {
      for (let y = 0; y < 18; y += 1) {
        for (let x = 85; x < 130; x += 1) {
          const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
          const r = source[at];
          const g = source[at + 1];
          const b = source[at + 2];
          if (source[at + 3] > 8 && r > 150 && g > 110 && b > 70
            && r - g < 80 && g - b < 90) feedingRaisedTailPixels += 1;
        }
      }
    }
    const hasRaisedFeedingTail = feedingRaisedTailPixels > 20;

    const selected = new Uint8Array(CELL * CELL);
    let removedWarmPet = 0;
    let removedSpecialPet = 0;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
        if (broadMask[at + 3] <= 8 || source[at + 3] <= 8) continue;
        const r = source[at];
        const g = source[at + 1];
        const b = source[at + 2];
        const classes = classesFor(r, g, b);
        const warmPet = r > 54
          && r > b * 1.105
          && g > b * 1.025
          && (r > g * 1.025 || r - b > 22);
        const allowedUpperDecoration = (classes.cheekPink && y <= capBottom - 20)
          || (y <= capBottom - 25
            && (classes.saturatedRed || classes.rainbowGreen || classes.starGold));

        let supportedRearBuckle = false;
        if (row === 2 && classes.starGold && y >= capBottom - 16) {
          let blueLeft = false;
          let blueRight = false;
          for (let offset = 1; offset <= 7; offset += 1) {
            for (const testX of [x - offset, x + offset]) {
              if (testX < 0 || testX >= CELL) continue;
              const testAt = (((row * CELL + y) * WIDTH + column * CELL + testX) * 4);
              const test = classesFor(source[testAt], source[testAt + 1], source[testAt + 2]);
              if (!test.capBlue) continue;
              if (testX < x) blueLeft = true;
              else blueRight = true;
            }
          }
          supportedRearBuckle = blueLeft && blueRight;
        }

        // Raised tail behind the feeding-pose rainbow. Keep only the rainbow
        // and star where the tail and accessory touch.
        if (row === 3 && column === 0 && hasRaisedFeedingTail) {
          const paleTail = r > 125 && g > 92 && b > 62
            && r - g < 66 && g - b < 72 && r > b + 10;
          const rainbowYellow = r > 165 && g > 118 && b < 122 && r - g < 105;
          const feedingDecoration = classes.saturatedRed || classes.rainbowGreen
            || classes.capBlue || classes.lavender || classes.starGold || rainbowYellow
            || (classes.coolInk && y >= 14 && x <= 107);
          if ((y <= 21 && x >= 97)
            || (y <= 29 && x >= 101)
            || (y < 36 && x > 87 && (paleTail || !feedingDecoration)
            && !(classes.starGold && x > 96 && y > 24))) {
            removedSpecialPet += 1;
            continue;
          }
        }

        // Sleeping pose: the body and ear touch the slanted brim. Limit the
        // right/bottom contact region to the cap's cool palette.
        if (row === 3 && column === 2) {
          if (x > 118 || (x >= 115 && y >= 60) || (y > 112 && x > 104)) {
            removedSpecialPet += 1;
            continue;
          }
          const sleepingForehead = y >= 87 && y <= 100 && x >= 40 && x <= 105
            && r > g * 1.01 && r > b * 1.04;
          if (sleepingForehead) {
            removedSpecialPet += 1;
            continue;
          }
          if (x > 80 && y > 68
            && !(classes.cloudWhite || classes.capBlue || classes.lavender || classes.coolInk)) {
            removedSpecialPet += 1;
            continue;
          }
        }

        // Jumping pose: a raised tail tuft touches the right cloud lobe and a
        // warm forehead patch sits immediately under the curved blue brim.
        // Neither belongs to the accessory.
        if (row === 3 && column === 1) {
          if (x > 124 && y > 45) {
            removedSpecialPet += 1;
            continue;
          }
          const foreheadFur = y >= 50 && y <= 61 && x >= 55 && x <= 96
            && r > g * 1.05 && r > b * 1.10;
          if (foreheadFur) {
            removedSpecialPet += 1;
            continue;
          }
          if (y > 62 && x > 45 && x < 110
            && !(classes.capBlue || classes.coolInk)) {
            removedSpecialPet += 1;
            continue;
          }
        }

        const contactZone = y >= capBottom - 25;
        const contactWarm = y >= capBottom - 7
          && r > 20 && r - b > 5 && r - g > 1 && g >= b - 3;
        if (contactZone && (warmPet || contactWarm)
          && !allowedUpperDecoration && !supportedRearBuckle) {
          removedWarmPet += 1;
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
          if (nextX < 0 || nextX >= CELL || nextY < 0 || nextY >= CELL) continue;
          const next = nextY * CELL + nextX;
          if (!selected[next] || seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      components.push({ pixels: queue, minX, minY, maxX, maxY });
    }
    components.sort((left, right) => right.pixels.length - left.pixels.length);

    let removedIslands = 0;
    for (const component of components.slice(1)) {
      const mustRemove = row === 1 || component.pixels.length < 24;
      if (!mustRemove) continue;
      for (const local of component.pixels) selected[local] = 0;
      removedIslands += component.pixels.length;
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
    stats.push({
      row,
      column,
      capBottom,
      maskPixels,
      removedWarmPet,
      removedSpecialPet,
      removedIslands,
      hasRaisedFeedingTail,
      feedingRaisedTailPixels,
      remainingComponents: components.filter((component, index) => index === 0
        || !(row === 1 || component.pixels.length < 24)).map((component) => ({
        pixels: component.pixels.length,
        bounds: [component.minX, component.minY, component.maxX, component.maxY],
      })),
    });
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, width: WIDTH, height: HEIGHT, transformed: false, stats }, null, 2));
