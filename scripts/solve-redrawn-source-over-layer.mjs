/**
 * Solve a same-coordinate RGBA source-over layer from frozen target/base/mask.
 * No existing wearable layer is read, and no image is transformed or resampled.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, basePath, maskPath, outputDirectory, outputPrefix = 'head-06-canonical-diff-final', frontErasePath = '-'] = process.argv.slice(2);
if (!targetPath || !basePath || !maskPath || !outputDirectory) {
  console.error('usage: node scripts/solve-redrawn-source-over-layer.mjs <frozen-target> <base> <mask> <output-directory> [output-prefix] [front-erase-input|-]');
  process.exit(1);
}

const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const CHANNELS = 4;
const PIXELS = WIDTH * HEIGHT;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}; got ${result.info.width}x${result.info.height}`);
  }
  return result.data;
};
const emptyAtlas = Buffer.alloc(PIXELS * CHANNELS);
const [target, base, mask, frontErase] = await Promise.all([
  read(targetPath), read(basePath), read(maskPath), frontErasePath === '-' ? emptyAtlas : read(frontErasePath),
]);

const layer = Buffer.alloc(PIXELS * CHANNELS);
const erase = Buffer.alloc(PIXELS * CHANNELS);
const composite = Buffer.alloc(PIXELS * CHANNELS);
const diff = Buffer.alloc(PIXELS * CHANNELS);

const sourceOver = (baseAt, layerRgba, erased) => {
  const baseAlpha = erased ? 0 : base[baseAt + 3] / 255;
  const layerAlpha = layerRgba[3] / 255;
  const outputAlpha = layerAlpha + baseAlpha * (1 - layerAlpha);
  if (outputAlpha <= 0) {
    // Frozen target and decoded WebP base carry identical 1–2 byte RGB noise
    // under some alpha-zero pixels. Preserve those bytes outside erase/layer
    // so exact RGBA comparison remains meaningful; generated transparent
    // layer and erase pixels themselves remain RGB zero.
    return erased ? [0, 0, 0, 0] : [base[baseAt], base[baseAt + 1], base[baseAt + 2], base[baseAt + 3]];
  }
  return [
    Math.round((layerRgba[0] * layerAlpha + base[baseAt] * baseAlpha * (1 - layerAlpha)) / outputAlpha),
    Math.round((layerRgba[1] * layerAlpha + base[baseAt + 1] * baseAlpha * (1 - layerAlpha)) / outputAlpha),
    Math.round((layerRgba[2] * layerAlpha + base[baseAt + 2] * baseAlpha * (1 - layerAlpha)) / outputAlpha),
    Math.round(outputAlpha * 255),
  ];
};

const solveChannel = (baseAt, layerAlphaByte, targetAlphaByte, targetChannel, channel) => {
  const baseAlpha = base[baseAt + 3] / 255;
  const layerAlpha = layerAlphaByte / 255;
  const outputAlpha = layerAlpha + baseAlpha * (1 - layerAlpha);
  if (layerAlpha === 0) return base[baseAt + channel] === targetChannel ? 0 : null;
  const ideal = (targetChannel * outputAlpha - base[baseAt + channel] * baseAlpha * (1 - layerAlpha)) / layerAlpha;
  const candidates = new Set();
  for (let offset = -4; offset <= 4; offset += 1) {
    candidates.add(Math.max(0, Math.min(255, Math.round(ideal) + offset)));
    candidates.add(Math.max(0, Math.min(255, Math.floor(ideal) + offset)));
    candidates.add(Math.max(0, Math.min(255, Math.ceil(ideal) + offset)));
  }
  const ordered = [...candidates].sort((left, right) => Math.abs(left - targetChannel) - Math.abs(right - targetChannel));
  for (const value of ordered) {
    const test = sourceOver(baseAt, [
      channel === 0 ? value : 0,
      channel === 1 ? value : 0,
      channel === 2 ? value : 0,
      layerAlphaByte,
    ], false);
    if (test[3] === targetAlphaByte && test[channel] === targetChannel) return value;
  }
  return null;
};

let maskPixels = 0;
let nonBinaryMaskAlphaPixels = 0;
let maskTransparentRgbNonZeroPixels = 0;
let targetBaseDifferencesOutsideMask = 0;
let maskPixelsWithNoTargetBaseDifference = 0;
let forcedErasePixels = 0;
let unexpectedUnsolvablePixels = 0;
let frontEraseVisiblePixels = 0;
let frontEraseNonBinaryAlphaPixels = 0;
let frontEraseTransparentRgbNonZeroPixels = 0;
let frontEraseOutsideMaskPixels = 0;
const forcedEraseCoordinates = [];
const unexpectedUnsolvableCoordinates = [];

// frontErase is an explicitly authored late destination-out mask. Validate
// its own source-coordinate pixels; never derive it from the composite.
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * CHANNELS;
  const alpha = frontErase[at + 3];
  if (alpha !== 0 && alpha !== 255) frontEraseNonBinaryAlphaPixels += 1;
  if (alpha === 0 && (frontErase[at] || frontErase[at + 1] || frontErase[at + 2])) frontEraseTransparentRgbNonZeroPixels += 1;
  if (alpha > 0) {
    frontEraseVisiblePixels += 1;
    if (mask[at + 3] === 0) frontEraseOutsideMaskPixels += 1;
  }
}

for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * CHANNELS;
  const maskAlpha = mask[at + 3];
  if (maskAlpha !== 0 && maskAlpha !== 255) nonBinaryMaskAlphaPixels += 1;
  if (maskAlpha === 0 && (mask[at] !== 0 || mask[at + 1] !== 0 || mask[at + 2] !== 0)) {
    maskTransparentRgbNonZeroPixels += 1;
  }
  const differs = target[at] !== base[at]
    || target[at + 1] !== base[at + 1]
    || target[at + 2] !== base[at + 2]
    || target[at + 3] !== base[at + 3];
  if (maskAlpha === 0) {
    if (differs) targetBaseDifferencesOutsideMask += 1;
    continue;
  }
  maskPixels += 1;
  // A topology bridge may deliberately include unchanged base pixels so the
  // mask remains one 4-connected component. Those pixels need no layer and
  // must pass the base through unchanged.
  if (!differs) {
    maskPixelsWithNoTargetBaseDifference += 1;
    continue;
  }

  const samePartialAlphaRgbChange = base[at + 3] === target[at + 3]
    && target[at + 3] > 0 && target[at + 3] < 255
    && (base[at] !== target[at] || base[at + 1] !== target[at + 1] || base[at + 2] !== target[at + 2]);
  const baseAlpha = base[at + 3] / 255;
  const alphaCandidates = [];
  for (let layerAlphaByte = 1; layerAlphaByte <= 255; layerAlphaByte += 1) {
    const layerAlpha = layerAlphaByte / 255;
    if (Math.round((layerAlpha + baseAlpha * (1 - layerAlpha)) * 255) === target[at + 3]) {
      alphaCandidates.push(layerAlphaByte);
    }
  }
  alphaCandidates.sort((left, right) => right - left);
  let solution = null;
  for (const layerAlphaByte of alphaCandidates) {
    const red = solveChannel(at, layerAlphaByte, target[at + 3], target[at], 0);
    const green = solveChannel(at, layerAlphaByte, target[at + 3], target[at + 1], 1);
    const blue = solveChannel(at, layerAlphaByte, target[at + 3], target[at + 2], 2);
    if (red === null || green === null || blue === null) continue;
    const candidate = [red, green, blue, layerAlphaByte];
    const result = sourceOver(at, candidate, false);
    if (result.every((value, channel) => value === target[at + channel])) {
      solution = candidate;
      break;
    }
  }
  if (!solution) {
    if (samePartialAlphaRgbChange) {
      forcedErasePixels += 1;
      forcedEraseCoordinates.push({
        x: pixel % WIDTH, y: Math.floor(pixel / WIDTH),
        row: Math.floor(pixel / WIDTH / CELL), column: Math.floor((pixel % WIDTH) / CELL),
      });
    } else {
      unexpectedUnsolvablePixels += 1;
      unexpectedUnsolvableCoordinates.push({ x: pixel % WIDTH, y: Math.floor(pixel / WIDTH) });
    }
    // Erase only after exhaustive 8-bit source-over search fails.
    erase[at] = 255; erase[at + 1] = 255; erase[at + 2] = 255; erase[at + 3] = 255;
    solution = [target[at], target[at + 1], target[at + 2], target[at + 3]];
  }
  layer[at] = solution[0]; layer[at + 1] = solution[1];
  layer[at + 2] = solution[2]; layer[at + 3] = solution[3];
}

let enclosedMaskHolePixels = 0;
const holeCells = [];
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  const componentSeen = new Uint8Array(CELL * CELL);
  let fourConnectedComponents = 0;
  for (let seedY = 0; seedY < CELL; seedY += 1) for (let seedX = 0; seedX < CELL; seedX += 1) {
    const seed = seedY * CELL + seedX;
    const seedAt = (((row * CELL + seedY) * WIDTH + column * CELL + seedX) * CHANNELS);
    if (componentSeen[seed] || mask[seedAt + 3] === 0) continue;
    fourConnectedComponents += 1;
    const componentQueue = [seed]; componentSeen[seed] = 1; let componentHead = 0;
    while (componentHead < componentQueue.length) {
      const local = componentQueue[componentHead++]; const x = local % CELL; const y = Math.floor(local / CELL);
      for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const next = ny * CELL + nx;
        const nextAt = (((row * CELL + ny) * WIDTH + column * CELL + nx) * CHANNELS);
        if (componentSeen[next] || mask[nextAt + 3] === 0) continue;
        componentSeen[next] = 1; componentQueue.push(next);
      }
    }
  }
  const outside = new Uint8Array(CELL * CELL); const queue = [];
  const push = (x, y) => {
    const local = y * CELL + x;
    const at = (((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS);
    if (outside[local] || mask[at + 3] > 0) return;
    outside[local] = 1; queue.push(local);
  };
  for (let x = 0; x < CELL; x += 1) { push(x, 0); push(x, CELL - 1); }
  for (let y = 0; y < CELL; y += 1) { push(0, y); push(CELL - 1, y); }
  let head = 0;
  while (head < queue.length) {
    const local = queue[head++]; const x = local % CELL; const y = Math.floor(local / CELL);
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + ox; const ny = y + oy;
      if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) push(nx, ny);
    }
  }
  let holes = 0;
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    const at = (((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS);
    if (mask[at + 3] === 0 && !outside[y * CELL + x]) holes += 1;
  }
  enclosedMaskHolePixels += holes;
  holeCells.push({ row, column, fourConnectedComponents, enclosedHolePixels: holes });
}

const cellsWithOneFourConnectedComponent = holeCells.filter((cell) => cell.fourConnectedComponents === 1).length;

let exactRgbaMismatchPixels = 0;
let layerTransparentRgbNonZeroPixels = 0;
let eraseTransparentRgbNonZeroPixels = 0;
let frozenTargetTransparentRgbNonZeroPixels = 0;
let eraseOutsideMaskPixels = 0;
let layerOutsideMaskPixels = 0;
const cells = Array.from({ length: 20 }, (_, index) => ({
  row: Math.floor(index / 5), column: index % 5, exactRgbaMismatchPixels: 0, erasePixels: 0,
}));
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * CHANNELS;
  const erased = erase[at + 3] > 0;
  let result = sourceOver(at, [layer[at], layer[at + 1], layer[at + 2], layer[at + 3]], erased);
  const lateEraseAlpha = frontErase[at + 3] / 255;
  if (lateEraseAlpha > 0) {
    const remainingAlpha = Math.round(result[3] * (1 - lateEraseAlpha));
    result = remainingAlpha > 0 ? [result[0], result[1], result[2], remainingAlpha] : [0, 0, 0, 0];
  }
  composite[at] = result[0]; composite[at + 1] = result[1]; composite[at + 2] = result[2]; composite[at + 3] = result[3];
  const cell = cells[Math.floor(pixel / WIDTH / CELL) * 5 + Math.floor((pixel % WIDTH) / CELL)];
  if (erased) cell.erasePixels += 1;
  if (erased && mask[at + 3] === 0) eraseOutsideMaskPixels += 1;
  if (layer[at + 3] > 0 && mask[at + 3] === 0) layerOutsideMaskPixels += 1;
  const mismatch = result.some((value, channel) => value !== target[at + channel]);
  if (mismatch) {
    exactRgbaMismatchPixels += 1; cell.exactRgbaMismatchPixels += 1;
    diff[at] = 255; diff[at + 1] = 30; diff[at + 2] = 20; diff[at + 3] = 255;
  }
  if (layer[at + 3] === 0 && (layer[at] !== 0 || layer[at + 1] !== 0 || layer[at + 2] !== 0)) {
    layerTransparentRgbNonZeroPixels += 1;
  }
  if (erase[at + 3] === 0 && (erase[at] !== 0 || erase[at + 1] !== 0 || erase[at + 2] !== 0)) {
    eraseTransparentRgbNonZeroPixels += 1;
  }
  if (target[at + 3] === 0 && (target[at] !== 0 || target[at + 1] !== 0 || target[at + 2] !== 0)) {
    frozenTargetTransparentRgbNonZeroPixels += 1;
  }
}

await fs.mkdir(outputDirectory, { recursive: true });
const layerPath = path.join(outputDirectory, `${outputPrefix}-solved-layer.png`);
const erasePath = path.join(outputDirectory, `${outputPrefix}-erase.png`);
const solvedFrontErasePath = path.join(outputDirectory, `${outputPrefix}-front-erase.png`);
const compositePath = path.join(outputDirectory, `${outputPrefix}-composite.png`);
const diffPath = path.join(outputDirectory, `${outputPrefix}-diff.png`);
const writeRaw = (data, output) => sharp(data, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } })
  .png({ compressionLevel: 9 }).toFile(output);
await Promise.all([
  writeRaw(layer, layerPath), writeRaw(erase, erasePath), writeRaw(frontErase, solvedFrontErasePath),
  writeRaw(composite, compositePath), writeRaw(diff, diffPath),
]);
const hash = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const metrics = {
  maskPixels, maskPixelsWithNoTargetBaseDifference, nonBinaryMaskAlphaPixels, maskTransparentRgbNonZeroPixels,
  targetBaseDifferencesOutsideMask, enclosedMaskHolePixels,
  cellsWithOneFourConnectedComponent,
  forcedErasePixels, unexpectedUnsolvablePixels,
  eraseOutsideMaskPixels, layerOutsideMaskPixels,
  layerTransparentRgbNonZeroPixels, eraseTransparentRgbNonZeroPixels,
  frozenTargetTransparentRgbNonZeroPixels,
  frontEraseVisiblePixels, frontEraseNonBinaryAlphaPixels, frontEraseTransparentRgbNonZeroPixels,
  frontEraseOutsideMaskPixels,
  exactRgbaMismatchPixels,
};
const accepted = nonBinaryMaskAlphaPixels === 0
  && maskTransparentRgbNonZeroPixels === 0
  && targetBaseDifferencesOutsideMask === 0
  && enclosedMaskHolePixels === 0
  && cellsWithOneFourConnectedComponent === 20
  && unexpectedUnsolvablePixels === 0
  && eraseOutsideMaskPixels === 0
  && layerOutsideMaskPixels === 0
  && layerTransparentRgbNonZeroPixels === 0
  && eraseTransparentRgbNonZeroPixels === 0
  && frontEraseNonBinaryAlphaPixels === 0
  && frontEraseTransparentRgbNonZeroPixels === 0
  && frontEraseOutsideMaskPixels === 0
  && exactRgbaMismatchPixels === 0;
const report = {
  verdict: accepted ? 'DATA_PASS' : 'REJECT',
  geometry: { canvas: '800x640', cell: '160x160', resized: false, rotated: false, shifted: false, stretched: false },
  inputPolicy: {
    existingWearableLayerRead: false,
    solvedOnlyFrom: ['frozen target', 'base', 'mask', ...(frontErasePath === '-' ? [] : ['explicit frontErase input'])],
    frontEraseInputPath: frontErasePath,
    frontEraseDerivedFromComposite: false,
  },
  metrics, cells, holeCells, forcedEraseCoordinates, unexpectedUnsolvableCoordinates,
  inputs: {
    targetPath, basePath, maskPath, frontErasePath,
    sha256: {
      target: await hash(targetPath), base: await hash(basePath), mask: await hash(maskPath),
      ...(frontErasePath === '-' ? {} : { frontErase: await hash(frontErasePath) }),
    },
  },
  outputs: {
    layerPath, erasePath, frontErasePath: solvedFrontErasePath, compositePath, diffPath,
    sha256: {
      layer: await hash(layerPath), erase: await hash(erasePath), frontErase: await hash(solvedFrontErasePath),
      composite: await hash(compositePath), diff: await hash(diffPath),
    },
  },
};
const reportPath = path.join(outputDirectory, `${outputPrefix}-report.json`);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, metrics, layerPath, erasePath, frontErasePath: solvedFrontErasePath, compositePath, diffPath, reportPath }, null, 2));
if (!accepted) process.exitCode = 2;
