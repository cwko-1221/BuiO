/**
 * Audit a same-canvas wearable mask without recompositing it with the pet.
 *
 * The checks here are deliberately geometric/pixel exact. Semantic review
 * (for example, deciding whether a cream edge is cloud or cat fur) remains a
 * separate visual gate.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, broadMaskPath, refinedMaskPath, layerPath, reportPath] = process.argv.slice(2);
if (!targetPath || !broadMaskPath || !refinedMaskPath || !layerPath) {
  console.error('usage: node scripts/audit-redrawn-mask-only.mjs <target> <broad-mask> <refined-mask> <layer> [report.json]');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const CHANNELS = 4;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  }
  return result.data;
};
const [target, broad, mask, layer] = await Promise.all([
  read(targetPath), read(broadMaskPath), read(refinedMaskPath), read(layerPath),
]);

const neighbours = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];
const cardinalNeighbours = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const cells = [];
let atlasPixels = 0;
let atlasSubsetViolations = 0;
let atlasLayerViolations = 0;
let atlasNonBinaryAlpha = 0;

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const selected = new Uint8Array(CELL * CELL);
    let pixels = 0;
    let subsetViolations = 0;
    let layerViolations = 0;
    let nonBinaryAlpha = 0;
    let minX = CELL;
    let minY = CELL;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = ((((row * CELL) + y) * WIDTH + (column * CELL) + x) * CHANNELS);
        const alpha = mask[at + 3];
        if (alpha !== 0 && alpha !== 255) nonBinaryAlpha += 1;
        if (!alpha) {
          if (layer[at + 3] !== 0) layerViolations += 1;
          continue;
        }
        selected[y * CELL + x] = 1;
        pixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        if (broad[at + 3] === 0) subsetViolations += 1;
        const expectedAlpha = Math.round(target[at + 3] * (alpha / 255));
        if (layer[at] !== target[at]
          || layer[at + 1] !== target[at + 1]
          || layer[at + 2] !== target[at + 2]
          || layer[at + 3] !== expectedAlpha) {
          layerViolations += 1;
        }
      }
    }

    const seen = new Uint8Array(CELL * CELL);
    const components = [];
    for (let seed = 0; seed < selected.length; seed += 1) {
      if (!selected[seed] || seen[seed]) continue;
      const queue = [seed];
      let head = 0;
      let componentMinX = seed % CELL;
      let componentMaxX = componentMinX;
      let componentMinY = Math.floor(seed / CELL);
      let componentMaxY = componentMinY;
      seen[seed] = 1;
      while (head < queue.length) {
        const local = queue[head++];
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        componentMinX = Math.min(componentMinX, x);
        componentMaxX = Math.max(componentMaxX, x);
        componentMinY = Math.min(componentMinY, y);
        componentMaxY = Math.max(componentMaxY, y);
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
      components.push({
        pixels: queue.length,
        bounds: [componentMinX, componentMinY, componentMaxX, componentMaxY],
      });
    }
    components.sort((left, right) => right.pixels - left.pixels);

    // A transparent region fully surrounded by selected mask pixels is an
    // enclosed pinhole. Open arches and the canvas exterior touch a cell edge
    // and therefore are not counted as holes.
    const transparentSeen = new Uint8Array(CELL * CELL);
    const enclosedTransparentHoles = [];
    for (let seed = 0; seed < selected.length; seed += 1) {
      if (selected[seed] || transparentSeen[seed]) continue;
      const queue = [seed];
      let head = 0;
      let touchesCellEdge = false;
      let holeMinX = seed % CELL;
      let holeMaxX = holeMinX;
      let holeMinY = Math.floor(seed / CELL);
      let holeMaxY = holeMinY;
      transparentSeen[seed] = 1;
      while (head < queue.length) {
        const local = queue[head++];
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        holeMinX = Math.min(holeMinX, x);
        holeMaxX = Math.max(holeMaxX, x);
        holeMinY = Math.min(holeMinY, y);
        holeMaxY = Math.max(holeMaxY, y);
        if (x === 0 || y === 0 || x === CELL - 1 || y === CELL - 1) touchesCellEdge = true;
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
      if (!touchesCellEdge) {
        enclosedTransparentHoles.push({
          pixels: queue.length,
          bounds: [holeMinX, holeMinY, holeMaxX, holeMaxY],
        });
      }
    }
    cells.push({
      row,
      column,
      pixels,
      bounds: pixels ? [minX, minY, maxX, maxY] : null,
      subsetViolations,
      layerCoordinateOrSourceViolations: layerViolations,
      nonBinaryMaskAlphaPixels: nonBinaryAlpha,
      components,
      enclosedTransparentHoles,
      technicalVerdict: pixels > 0
        && subsetViolations === 0
        && layerViolations === 0
        && nonBinaryAlpha === 0
        && components.length === 1
        && enclosedTransparentHoles.length === 0 ? 'PASS' : 'REJECT',
    });
    atlasPixels += pixels;
    atlasSubsetViolations += subsetViolations;
    atlasLayerViolations += layerViolations;
    atlasNonBinaryAlpha += nonBinaryAlpha;
  }
}

const technicalPass = cells.every((cell) => cell.technicalVerdict === 'PASS');
const report = {
  inputs: { targetPath, broadMaskPath, refinedMaskPath, layerPath },
  canvas: { width: WIDTH, height: HEIGHT, cell: CELL },
  geometry: {
    transformed: false,
    resampled: false,
    shifted: false,
    refinedMaskIsSubsetOfBroadMask: atlasSubsetViolations === 0,
  },
  atlas: {
    maskPixels: atlasPixels,
    subsetViolations: atlasSubsetViolations,
    layerCoordinateOrSourceViolations: atlasLayerViolations,
    nonBinaryMaskAlphaPixels: atlasNonBinaryAlpha,
    passingCells: cells.filter((cell) => cell.technicalVerdict === 'PASS').length,
    totalCells: cells.length,
  },
  limitation: 'Technical PASS does not certify semantic purity. Every cell still requires visual rejection of pet fur, ears, tail, body, eyes, and shadows.',
  technicalVerdict: technicalPass ? 'PASS' : 'REJECT',
  cells,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, serialized);
}
process.stdout.write(serialized);
