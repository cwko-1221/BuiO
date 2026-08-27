import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [,, fullPath, maskPath, layerPath, qaPath] = process.argv;
if (!fullPath || !maskPath || !layerPath || !qaPath) throw new Error('usage: node extract-head03-from-full-phase-d.mjs <full> <mask> <layer> <qa>');
if (/(?:mask|layer|patch|erase|front)/i.test(path.basename(fullPath))) throw new Error('full redraw must be the sole pixel input');

const WIDTH = 800; const HEIGHT = 640; const CELL = 160;
const { data: full, info } = await sharp(fullPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (info.width !== WIDTH || info.height !== HEIGHT) throw new Error('full redraw must be 800x640');

const mask = new Uint8Array(WIDTH * HEIGHT);
const index = (x, y) => y * WIDTH + x;
const rgba = (x, y) => (y * WIDTH + x) * 4;
const distance = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

const roiByCell = [
  [18,12,142,76],[18,12,142,76],[22,12,142,75],[20,12,142,75],[22,10,144,76],
  [35,20,150,104],[38,18,150,104],[40,18,150,104],[42,18,151,104],[42,18,151,104],
  [16,25,144,90],[16,25,144,90],[18,25,144,92],[18,25,144,92],[20,25,145,92],
  [16,20,145,95],[18,12,145,85],[4,32,145,132],[18,12,145,88],[18,12,145,88],
];

function features(r, g, b) {
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const green = g >= 42 && g - Math.min(r, b) >= 15 && g > b * 1.10 && g > r * 1.03;
  const blue = b >= 72 && b - Math.min(r, g) >= 18 && b > g * 1.03 && b > r * 1.03;
  const vividPink = r >= 115 && b >= 55 && r > g * 1.12 && b > g * 0.62 && r - g >= 22;
  const yellowCenter = r >= 135 && g >= 85 && b <= 135 && r > b * 1.25 && g > b * 1.05;
  const whitePetal = min >= 145 && max - min <= 62;
  const darkStem = max <= 125 && r >= g * 0.65 && g >= b * 0.75;
  const grayOutline = max <= 135 && max - min <= 38;
  const orangeFur = r >= 145 && g >= 75 && b <= 115 && r > g * 1.18 && g > b * 1.08;
  const earPink = r >= 135 && g >= 55 && g <= 175 && b >= 45 && b <= 150 && r - g >= 35;
  return { green, blue, vividPink, yellowCenter, whitePetal, darkStem, grayOutline, orangeFur, earPink };
}

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const cellIndex = row * 5 + column;
    const [minX, minY, maxX, maxY] = roiByCell[cellIndex];
    const seed = new Uint8Array(CELL * CELL);
    const candidate = new Uint8Array(CELL * CELL);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const at = rgba(column * CELL + x, row * CELL + y);
        if (!full[at + 3]) continue;
        const f = features(full[at], full[at + 1], full[at + 2]);
        const local = y * CELL + x;
        if (f.green || f.blue) seed[local] = 1;
        if (f.green || f.blue || f.vividPink || f.yellowCenter || f.whitePetal || f.darkStem || f.grayOutline) candidate[local] = 1;
        if (f.orangeFur || f.earPink) {
          if (!f.green && !f.blue) candidate[local] = 0;
        }
      }
    }

    // Add flower colors only when they lie close to a green/blue structural seed.
    for (let pass = 0; pass < 7; pass += 1) {
      let changed = false;
      const nextSeed = new Uint8Array(seed);
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const local = y * CELL + x;
          if (seed[local] || !candidate[local]) continue;
          const neighbors = [[x-1,y],[x+1,y],[x,y-1],[x,y+1],[x-1,y-1],[x+1,y-1],[x-1,y+1],[x+1,y+1]];
          if (neighbors.some(([nx,ny]) => nx >= 0 && nx < CELL && ny >= 0 && ny < CELL && seed[ny * CELL + nx])) {
            nextSeed[local] = 1; changed = true;
          }
        }
      }
      seed.set(nextSeed);
      if (!changed) break;
    }

    // Keep semantic components with enough chromatic structure; small detached flowers are allowed in special poses.
    const seen = new Uint8Array(CELL * CELL);
    const components = [];
    for (let y = minY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
      const start = y * CELL + x;
      if (!seed[start] || seen[start]) continue;
      const queue = [start]; seen[start] = 1; const pixels = [];
      while (queue.length) {
        const current = queue.pop(); pixels.push(current);
        const cx = current % CELL; const cy = Math.floor(current / CELL);
        for (const [nx,ny] of [[cx-1,cy],[cx+1,cy],[cx,cy-1],[cx,cy+1]]) {
          if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
          const next = ny * CELL + nx;
          if (seed[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
        }
      }
      if (pixels.length >= 7) components.push(pixels);
    }
    for (const component of components) for (const local of component) {
      const x = local % CELL; const y = Math.floor(local / CELL);
      mask[index(column * CELL + x, row * CELL + y)] = 255;
    }
  }
}

// Preserve source antialias only on the exterior of already selected semantic pixels.
const grown = new Uint8Array(mask);
for (let y = 1; y < HEIGHT - 1; y += 1) for (let x = 1; x < WIDTH - 1; x += 1) {
  const atPixel = index(x, y); if (mask[atPixel]) continue;
  const at = rgba(x, y); const alpha = full[at + 3]; if (!alpha || alpha === 255) continue;
  if ([index(x-1,y),index(x+1,y),index(x,y-1),index(x,y+1)].some((neighbor) => mask[neighbor])) grown[atPixel] = 255;
}
mask.set(grown);

const layer = Buffer.alloc(full.length);
let visiblePixels = 0; let hiddenRgbNonZero = 0;
for (let pixel = 0; pixel < mask.length; pixel += 1) {
  const at = pixel * 4;
  if (mask[pixel]) { full.copy(layer, at, at, at + 4); visiblePixels += 1; }
  else if (layer[at] || layer[at + 1] || layer[at + 2]) hiddenRgbNonZero += 1;
}

await fs.mkdir(path.dirname(maskPath), { recursive: true });
await sharp(Buffer.from(mask), { raw: { width: WIDTH, height: HEIGHT, channels: 1 } }).png().toFile(maskPath);
await sharp(layer, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } }).png().toFile(layerPath);
const report = {
  item: 'head-03', phase: 'phase-d-full-source-direct-extraction', verdict: 'CANDIDATE_REQUIRES_VISUAL_QA',
  inputPolicy: { soleFinalPixelSource: fullPath, oldMaskLayerPatchEraseRead: false, transformsApplied: false },
  outputs: { maskPath, layerPath }, totals: { visiblePixels, hiddenRgbNonZero },
  notes: ['Disconnected flower/leaf groups are semantically allowed.', 'No source pixel was moved or synthesized.'],
};
await fs.writeFile(qaPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
