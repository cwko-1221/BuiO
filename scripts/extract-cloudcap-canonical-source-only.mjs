/**
 * Independently segment the cloud cap from the canonical full redraw.
 * The only image input is the canonical target itself. No prior mask, layer,
 * base pet, or transformed reference is read by this extractor.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, outputMaskPath] = process.argv.slice(2);
if (!targetPath || !outputMaskPath) {
  console.error('usage: node scripts/extract-cloudcap-canonical-source-only.mjs <canonical-target> <output-mask>');
  process.exit(1);
}
const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const image = await sharp(targetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error('canonical target must be 800x640');
const source = image.data;
const output = Buffer.alloc(WIDTH * HEIGHT * 4);
const maxYFor = [
  [102, 102, 102, 102, 104],
  [98, 98, 98, 98, 98],
  [98, 98, 98, 98, 98],
  [106, 92, 132, 98, 98],
];
const neighbours = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];
const cardinalNeighbours = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const atFor = (row, column, x, y) => ((((row * CELL) + y) * WIDTH + (column * CELL) + x) * 4);
const classify = (r, g, b) => ({
  cloud: r > 118 && g > 114 && b > 120
    && b >= r - 32 && b >= g - 23
    && Math.max(r, g, b) - Math.min(r, g, b) < 92,
  strongBlue: b > 82 && g > 56 && b > r * 1.075 && b > g * 0.88,
  cool: b > 52 && g > 35 && b >= r * 0.97 && b >= g * 0.80,
  darkCool: r < 145 && g < 152 && b < 202 && b >= r * 0.76 && b >= g * 0.75,
  pink: r > 150 && g > 65 && b > 72 && r > g * 1.055 && r > b * 1.015,
  red: r > 132 && r > g * 1.16 && r > b * 1.09,
  yellow: r > 150 && g > 86 && b < 145 && r > b * 1.15,
  green: g > 82 && g >= r * 0.62 && g > b * 0.92,
});

const stats = [];
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const maxY = maxYFor[row][column];
    const decorMaxY = maxY - 32;
    const brimBottom = new Int16Array(CELL).fill(-1);
    for (let x = 0; x < CELL; x += 1) {
      for (let y = Math.max(34, maxY - 58); y <= maxY; y += 1) {
        const at = atFor(row, column, x, y);
        if (source[at + 3] <= 2) continue;
        const c = classify(source[at], source[at + 1], source[at + 2]);
        if (c.strongBlue) brimBottom[x] = y;
      }
    }

    const selected = new Uint8Array(CELL * CELL);
    for (let y = 0; y <= maxY; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = atFor(row, column, x, y);
        if (source[at + 3] <= 2) continue;
        const r = source[at];
        const g = source[at + 1];
        const b = source[at + 2];
        const c = classify(r, g, b);
        const decoration = y <= decorMaxY && (c.red || c.yellow || c.green || c.cool || c.darkCool);
        const faceDetail = y <= maxY - 12 && (c.darkCool || c.pink);
        const beneathBrim = brimBottom[x] >= 0 && y > brimBottom[x] + 1;
        if (!beneathBrim && (c.cloud || c.cool || faceDetail || decoration)) {
          selected[y * CELL + x] = 1;
        }
      }
    }

    const componentsOf = (map) => {
      const seen = new Uint8Array(map.length);
      const components = [];
      for (let seed = 0; seed < map.length; seed += 1) {
        if (!map[seed] || seen[seed]) continue;
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
            if (!map[next] || seen[next]) continue;
            seen[next] = 1;
            queue.push(next);
          }
        }
        components.push(queue);
      }
      components.sort((left, right) => right.length - left.length);
      return components;
    };

    const initialComponents = componentsOf(selected);
    const main = initialComponents[0] ?? [];
    selected.fill(0);
    for (const local of main) selected[local] = 1;

    // Include one source-pixel anti-alias fringe around the independently
    // identified silhouette, while refusing warm pet-colour growth.
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const additions = [];
      for (let local = 0; local < selected.length; local += 1) {
        if (!selected[local]) continue;
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        for (const [offsetX, offsetY] of cardinalNeighbours) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= CELL || nextY < 0 || nextY > maxY) continue;
          const next = nextY * CELL + nextX;
          if (selected[next]) continue;
          const at = atFor(row, column, nextX, nextY);
          if (source[at + 3] <= 2) continue;
          const r = source[at];
          const g = source[at + 1];
          const b = source[at + 2];
          const c = classify(r, g, b);
          const beneathBrim = brimBottom[nextX] >= 0 && nextY > brimBottom[nextX] + 1;
          const warmPet = r > 48 && r > b * 1.09 && g > b * 1.015
            && (r > g * 1.025 || r - b > 20);
          const allowedWarmDecoration = nextY <= decorMaxY && (c.red || c.yellow || c.green);
          if (!beneathBrim && (!warmPet || allowedWarmDecoration)) additions.push(next);
        }
      }
      for (const local of additions) selected[local] = 1;
    }

    // Fill only transparent regions fully enclosed by the selected hat. The
    // face opening beneath the brim reaches the cell exterior and is retained.
    const transparentSeen = new Uint8Array(selected.length);
    let holesFilled = 0;
    for (let seed = 0; seed < selected.length; seed += 1) {
      if (selected[seed] || transparentSeen[seed]) continue;
      const queue = [seed];
      let head = 0;
      let touchesEdge = false;
      transparentSeen[seed] = 1;
      while (head < queue.length) {
        const local = queue[head++];
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        if (x === 0 || y === 0 || x === CELL - 1 || y === CELL - 1 || y > maxY) touchesEdge = true;
        for (const [offsetX, offsetY] of cardinalNeighbours) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= CELL || nextY < 0 || nextY >= CELL) continue;
          const next = nextY * CELL + nextX;
          if (selected[next] || transparentSeen[next]) continue;
          transparentSeen[next] = 1;
          queue.push(next);
        }
      }
      if (touchesEdge) continue;
      for (const local of queue) {
        selected[local] = 1;
        holesFilled += 1;
      }
    }

    // Source-only semantic pruning at known pet/accessory contact zones. These
    // rules inspect target colours and local pose geometry; no external mask is
    // consulted.
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const local = y * CELL + x;
        if (!selected[local]) continue;
        const at = atFor(row, column, x, y);
        const r = source[at];
        const g = source[at + 1];
        const b = source[at + 2];
        const c = classify(r, g, b);
        const strictCloud = r > 128 && g > 124 && b > 134
          && b >= r - 15 && b >= g - 11;
        const warmPet = r > 42 && r > b * 1.075 && g > b * 1.01
          && (r > g * 1.018 || r - b > 17);
        const darkWarm = r < 155 && r > b * 1.10 && g >= b * 0.88;
        let remove = false;

        const sideMinimumX = [60, 55, 52, 55, 50][column];
        if (row === 1 && x < sideMinimumX) remove = true;

        if (row === 2 && y < 48 && warmPet) {
          const starGold = r > 150 && g > 94 && b < 105
            && r > b * 1.28 && g > b * 1.12
            && x >= 27 && x <= 66 && y >= 14;
          const rainbowColour = (c.red || c.yellow || c.green || c.cool)
            && x >= 43 && x <= 116;
          if (!starGold && !rainbowColour) remove = true;
        }

        if (row === 2 && x >= 57 && x <= 104 && y >= 49) {
          const belowCloudArch = y >= 67;
          const relaxedCloud = r > 145 && g > 138 && b > 145
            && b >= r - 28 && b >= g - 21;
          const accessoryHere = c.strongBlue || c.cool || c.darkCool
            || (!belowCloudArch && relaxedCloud);
          if (!accessoryHere) remove = true;
        }
        if (row === 2 && y >= 49) {
          const normalizedY = (y - 89) / 40;
          const halfWidth = normalizedY * normalizedY < 1
            ? 24 * Math.sqrt(1 - normalizedY * normalizedY) : 0;
          const preserveRearBand = y >= 65 && (c.strongBlue || c.cool || c.darkCool);
          if (halfWidth > 0 && Math.abs(x - 80) <= halfWidth && !preserveRearBand) remove = true;
        }

        if (row === 3 && column === 1 && x > 124) remove = true;

        if (row === 3 && column === 2) {
          if (x > 118 || (y > 106 && x > 60)) remove = true;
          if (x > 78 && y > 54) {
            const capFacePink = c.pink && x <= 84 && y <= 79;
            const relaxedCloud = r > 145 && g > 138 && b > 145
              && b >= r - 30 && b >= g - 22;
            const accessoryHere = strictCloud || relaxedCloud || c.strongBlue || c.cool || c.darkCool || capFacePink;
            if (!accessoryHere) remove = true;
          }
        }

        if (row === 3 && column >= 3 && x > 100 && y > 64
          && !(c.strongBlue || c.cool || c.darkCool)) remove = true;

        const contactZone = y >= maxY - 25;
        const protectedRearBlue = row === 2 && (c.strongBlue || c.cool || c.darkCool);
        if (contactZone && warmPet && !protectedRearBlue && y > decorMaxY) remove = true;
        if (remove) selected[local] = 0;
      }
    }

    // Semantic pruning can expose a few enclosed single-pixel gaps in cloud
    // shading. Seal only genuinely enclosed regions; pet openings remain
    // connected to the exterior.
    const finalTransparentSeen = new Uint8Array(selected.length);
    for (let seed = 0; seed < selected.length; seed += 1) {
      if (selected[seed] || finalTransparentSeen[seed]) continue;
      const queue = [seed];
      let head = 0;
      let touchesEdge = false;
      finalTransparentSeen[seed] = 1;
      while (head < queue.length) {
        const local = queue[head++];
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        if (x === 0 || y === 0 || x === CELL - 1 || y === CELL - 1 || y > maxY) touchesEdge = true;
        for (const [offsetX, offsetY] of cardinalNeighbours) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= CELL || nextY < 0 || nextY >= CELL) continue;
          const next = nextY * CELL + nextX;
          if (selected[next] || finalTransparentSeen[next]) continue;
          finalTransparentSeen[next] = 1;
          queue.push(next);
        }
      }
      if (touchesEdge) continue;
      for (const local of queue) {
        selected[local] = 1;
      }
    }

    const finalComponents = componentsOf(selected);
    const finalMain = finalComponents[0] ?? [];
    selected.fill(0);
    for (const local of finalMain) selected[local] = 1;
    let pixels = 0;
    let minX = CELL;
    let minY = CELL;
    let maxX = -1;
    let finalMaxY = -1;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        if (!selected[y * CELL + x]) continue;
        const at = atFor(row, column, x, y);
        output[at] = 255;
        output[at + 1] = 255;
        output[at + 2] = 255;
        output[at + 3] = 255;
        pixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        finalMaxY = Math.max(finalMaxY, y);
      }
    }
    stats.push({ row, column, pixels, bounds: [minX, minY, maxX, finalMaxY], holesFilled });
  }
}

await fs.mkdir(path.dirname(outputMaskPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputMaskPath);
console.log(JSON.stringify({
  targetPath,
  outputMaskPath,
  extractionInputs: ['canonical-target-only'],
  transformed: false,
  resampled: false,
  shifted: false,
  stats,
}, null, 2));
