/**
 * Strict QA for a same-coordinate redrawn wearable composite.
 *
 * This script never resizes, rotates, stretches, or repositions any input.
 * Every output pixel is computed from the same pixel index in the 800x640
 * target, base, wearable layer, and optional erase mask.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [targetPath, basePath, layerPath, erasePath = '-', outputDirectory] = process.argv.slice(2);
if (!targetPath || !basePath || !layerPath || !outputDirectory) {
  console.error('usage: node scripts/verify-redrawn-zero-transform-composite.mjs <target> <base> <layer> <erase|-> <output-directory>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const CHANNELS = 4;
const PIXELS = WIDTH * HEIGHT;

const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}; got ${image.info.width}x${image.info.height}`);
  }
  return image.data;
};

const [target, base, layer, erase] = await Promise.all([
  read(targetPath),
  read(basePath),
  read(layerPath),
  erasePath === '-' ? Promise.resolve(Buffer.alloc(PIXELS * CHANNELS)) : read(erasePath),
]);
const hashFile = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const inputHashes = {
  target: await hashFile(targetPath),
  base: await hashFile(basePath),
  layer: await hashFile(layerPath),
  erase: erasePath === '-' ? null : await hashFile(erasePath),
};

const composite = Buffer.alloc(PIXELS * CHANNELS);
const diff = Buffer.alloc(PIXELS * CHANNELS);
const cells = Array.from({ length: 20 }, (_, index) => ({
  row: Math.floor(index / 5),
  column: index % 5,
  exactMismatchPixels: 0,
  visualMismatchPixels: 0,
  maxVisualDelta: 0,
  sumVisualDelta: 0,
  unfixableOutsideWearablePixels: 0,
  targetBaseOutsideWearablePixels: 0,
  layerPixels: 0,
  erasePixels: 0,
  baseDarkFacePixelsCoveredByLayer: 0,
  layerTargetRgbMismatchPixels: 0,
}));

const premultipliedDelta = (left, right, at) => {
  const leftAlpha = left[at + 3] / 255;
  const rightAlpha = right[at + 3] / 255;
  return Math.max(
    Math.abs(left[at] * leftAlpha - right[at] * rightAlpha),
    Math.abs(left[at + 1] * leftAlpha - right[at + 1] * rightAlpha),
    Math.abs(left[at + 2] * leftAlpha - right[at + 2] * rightAlpha),
    Math.abs(left[at + 3] - right[at + 3]),
  );
};

for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * CHANNELS;
  const x = pixel % WIDTH;
  const y = Math.floor(pixel / WIDTH);
  const cell = cells[Math.floor(y / CELL) * 5 + Math.floor(x / CELL)];

  // Late erase, then foreground layer. Inputs are sampled only at `at`.
  const eraseAlpha = erase[at + 3] / 255;
  const baseAlpha = (base[at + 3] / 255) * (1 - eraseAlpha);
  const layerAlpha = layer[at + 3] / 255;
  const outputAlpha = layerAlpha + baseAlpha * (1 - layerAlpha);
  if (outputAlpha > 0) {
    for (let channel = 0; channel < 3; channel += 1) {
      composite[at + channel] = Math.round(
        (layer[at + channel] * layerAlpha + base[at + channel] * baseAlpha * (1 - layerAlpha)) / outputAlpha,
      );
    }
    composite[at + 3] = Math.round(outputAlpha * 255);
  } else if (eraseAlpha <= 0) {
    // Preserve hidden RGBA bytes from the authoritative base when no visible
    // layer/erase exists. A PNG target may intentionally retain those bytes;
    // zeroing them here creates a false exact-mismatch despite an identical
    // rendered image and violates the same invariant used by the solver.
    composite[at] = base[at];
    composite[at + 1] = base[at + 1];
    composite[at + 2] = base[at + 2];
    composite[at + 3] = base[at + 3];
  }

  const exactMismatch = composite[at] !== target[at]
    || composite[at + 1] !== target[at + 1]
    || composite[at + 2] !== target[at + 2]
    || composite[at + 3] !== target[at + 3];
  if (exactMismatch) cell.exactMismatchPixels += 1;

  const visualDelta = premultipliedDelta(composite, target, at);
  cell.maxVisualDelta = Math.max(cell.maxVisualDelta, visualDelta);
  cell.sumVisualDelta += visualDelta;
  if (visualDelta > 8) cell.visualMismatchPixels += 1;

  const layerPresent = layer[at + 3] > 0;
  const erasePresent = erase[at + 3] > 0;
  if (layerPresent) cell.layerPixels += 1;
  if (erasePresent) cell.erasePixels += 1;

  // Outside both wearable and erase coverage, no legal compositing operation
  // can alter the base. Any target/base difference here proves that this
  // target cannot be reconstructed from an accessory-only mask.
  if (!layerPresent && !erasePresent) {
    cell.targetBaseOutsideWearablePixels += 1;
    if (premultipliedDelta(target, base, at) > 8) {
      cell.unfixableOutsideWearablePixels += 1;
    }
  }

  if (layerPresent) {
    if (layer[at] !== target[at]
      || layer[at + 1] !== target[at + 1]
      || layer[at + 2] !== target[at + 2]) {
      cell.layerTargetRgbMismatchPixels += 1;
    }

    // Diagnostic only: dark face-detail pixels in the upper part of a base
    // frame that are covered by the headwear. Visual review determines which
    // of these are eyes rather than outlines.
    const localY = y % CELL;
    const darkFaceDetail = localY < 112
      && base[at + 3] > 64
      && base[at] < 92
      && base[at + 1] < 82
      && base[at + 2] < 82;
    if (darkFaceDetail) cell.baseDarkFacePixelsCoveredByLayer += 1;
  }

  if (visualDelta > 0) {
    const strength = Math.min(255, Math.round(72 + visualDelta * 1.6));
    diff[at] = 255;
    diff[at + 1] = visualDelta <= 8 ? 190 : 30;
    diff[at + 2] = 20;
    diff[at + 3] = strength;
  }
}

for (const cell of cells) {
  cell.meanVisualDelta = Number((cell.sumVisualDelta / (CELL * CELL)).toFixed(3));
  delete cell.sumVisualDelta;
  cell.visualMismatchPercent = Number((cell.visualMismatchPixels / (CELL * CELL) * 100).toFixed(3));
  cell.unfixableOutsideWearablePercent = Number((
    cell.unfixableOutsideWearablePixels / Math.max(1, cell.targetBaseOutsideWearablePixels) * 100
  ).toFixed(3));
}

const totals = cells.reduce((sum, cell) => {
  for (const key of [
    'exactMismatchPixels',
    'visualMismatchPixels',
    'unfixableOutsideWearablePixels',
    'targetBaseOutsideWearablePixels',
    'layerPixels',
    'erasePixels',
    'baseDarkFacePixelsCoveredByLayer',
    'layerTargetRgbMismatchPixels',
  ]) sum[key] += cell[key];
  sum.maxVisualDelta = Math.max(sum.maxVisualDelta, cell.maxVisualDelta);
  return sum;
}, {
  exactMismatchPixels: 0,
  visualMismatchPixels: 0,
  maxVisualDelta: 0,
  unfixableOutsideWearablePixels: 0,
  targetBaseOutsideWearablePixels: 0,
  layerPixels: 0,
  erasePixels: 0,
  baseDarkFacePixelsCoveredByLayer: 0,
  layerTargetRgbMismatchPixels: 0,
});
totals.visualMismatchPercent = Number((totals.visualMismatchPixels / PIXELS * 100).toFixed(3));
totals.unfixableOutsideWearablePercent = Number((
  totals.unfixableOutsideWearablePixels / Math.max(1, totals.targetBaseOutsideWearablePixels) * 100
).toFixed(3));

const largestDarkComponents = (image, row, column, coverage = null) => {
  const mask = new Uint8Array(CELL * CELL);
  for (let localY = 45; localY < 112; localY += 1) {
    for (let localX = 0; localX < CELL; localX += 1) {
      const at = (((row * CELL + localY) * WIDTH + column * CELL + localX) * CHANNELS);
      const luminance = image[at] * 0.2126 + image[at + 1] * 0.7152 + image[at + 2] * 0.0722;
      if (image[at + 3] > 64 && luminance < 62) mask[localY * CELL + localX] = 1;
    }
  }
  const seen = new Uint8Array(CELL * CELL);
  const components = [];
  for (let seed = 0; seed < mask.length; seed += 1) {
    if (!mask[seed] || seen[seed]) continue;
    const queue = [seed];
    seen[seed] = 1;
    let head = 0;
    let pixels = 0;
    let coveredPixels = 0;
    let minX = CELL; let minY = CELL; let maxX = -1; let maxY = -1;
    let sumX = 0; let sumY = 0;
    while (head < queue.length) {
      const local = queue[head++];
      const x = local % CELL;
      const y = Math.floor(local / CELL);
      pixels += 1; sumX += x; sumY += y;
      if (coverage) {
        const coverageAt = (((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS);
        if (coverage[coverageAt + 3] > 0) coveredPixels += 1;
      }
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          if (ox === 0 && oy === 0) continue;
          const nextX = x + ox; const nextY = y + oy;
          if (nextX < 0 || nextX >= CELL || nextY < 0 || nextY >= CELL) continue;
          const next = nextY * CELL + nextX;
          if (!mask[next] || seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
    }
    if (pixels >= 5) components.push({
      pixels,
      ...(coverage ? {
        coveredPixels,
        coveredPercent: Number((coveredPixels / pixels * 100).toFixed(1)),
      } : {}),
      bounds: [minX, minY, maxX, maxY],
      centroid: [Number((sumX / pixels).toFixed(1)), Number((sumY / pixels).toFixed(1))],
    });
  }
  return components.sort((left, right) => right.pixels - left.pixels).slice(0, 12);
};

const darkDetailGeometry = [
  { label: 'front-reference', row: 0, column: 0 },
  { label: 'side-reference', row: 1, column: 0 },
].map((reference) => ({
  ...reference,
  note: 'Largest components are diagnostic candidates only; visual review identifies the pet-eye components.',
  target: largestDarkComponents(target, reference.row, reference.column),
  base: largestDarkComponents(base, reference.row, reference.column, layer),
  composite: largestDarkComponents(composite, reference.row, reference.column),
}));

const accepted = totals.exactMismatchPixels === 0
  && totals.layerTargetRgbMismatchPixels === 0
  && totals.unfixableOutsideWearablePixels === 0;
const report = {
  accepted,
  verdict: accepted ? 'PASS' : 'REJECT',
  reason: accepted
    ? 'The same-coordinate accessory composite is pixel-identical to the full redraw.'
    : 'The same-coordinate accessory composite differs from the full redraw; differences outside wearable/erase coverage cannot be repaired by compositing.',
  invariant: {
    canvas: `${WIDTH}x${HEIGHT}`,
    cell: `${CELL}x${CELL}`,
    transformed: false,
    sampling: 'same pixel index only',
  },
  inputs: { targetPath, basePath, layerPath, erasePath, sha256: inputHashes },
  totals,
  cells,
  darkDetailGeometry,
};

await fs.mkdir(outputDirectory, { recursive: true });
const compositePath = path.join(outputDirectory, 'composite.png');
const diffPath = path.join(outputDirectory, 'diff-heatmap.png');
const reportPath = path.join(outputDirectory, 'report.json');
await Promise.all([
  sharp(composite, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } })
    .png({ compressionLevel: 9 }).toFile(compositePath),
  sharp(diff, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } })
    .png({ compressionLevel: 9 }).toFile(diffPath),
  fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'),
]);

console.log(JSON.stringify({ compositePath, diffPath, reportPath, verdict: report.verdict, totals }, null, 2));
if (!accepted) process.exitCode = 2;
