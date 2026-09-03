import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [targetPath, basePath, maskPath, layerPath, reportPath, proofDirectory] = process.argv.slice(2);
if (!targetPath || !basePath || !maskPath || !layerPath || !reportPath || !proofDirectory) {
  console.error('usage: node scripts/extract-head05-canonical-v1.mjs <target> <base> <mask> <layer> <report> <proof-dir>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const CHANNELS = 4;
const DIR4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const forbidden = /head-05-(?:source-(?:mask|layer)|isolated|front|exact)/i;
if (forbidden.test(targetPath) || forbidden.test(basePath)) {
  throw new Error('canonical extraction may read only the frozen target and the bare-pet base');
}

const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  return image.data;
};
const sha256 = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const [target, base] = await Promise.all([read(targetPath), read(basePath)]);
const differsAt = (at) => target[at] !== base[at]
  || target[at + 1] !== base[at + 1]
  || target[at + 2] !== base[at + 2]
  || target[at + 3] !== base[at + 3];

const exactDiff = new Uint8Array(WIDTH * HEIGHT);
for (let pixel = 0; pixel < exactDiff.length; pixel += 1) exactDiff[pixel] = Number(differsAt(pixel * CHANNELS));

const components4 = (bitmap, row, column) => {
  const seen = new Uint8Array(CELL * CELL);
  const components = [];
  for (let seed = 0; seed < CELL * CELL; seed += 1) {
    const sx = seed % CELL;
    const sy = Math.floor(seed / CELL);
    const global = (row * CELL + sy) * WIDTH + column * CELL + sx;
    if (seen[seed] || !bitmap[global]) continue;
    const queue = [seed];
    const points = [];
    seen[seed] = 1;
    let head = 0;
    while (head < queue.length) {
      const local = queue[head++];
      const x = local % CELL;
      const y = Math.floor(local / CELL);
      points.push(local);
      for (const [dx, dy] of DIR4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const next = ny * CELL + nx;
        const nextGlobal = (row * CELL + ny) * WIDTH + column * CELL + nx;
        if (!seen[next] && bitmap[nextGlobal]) { seen[next] = 1; queue.push(next); }
      }
    }
    components.push(points);
  }
  return components.sort((a, b) => b.length - a.length);
};

const componentDetail = (points, row, column) => {
  const xs = points.map((pixel) => pixel % CELL);
  const ys = points.map((pixel) => Math.floor(pixel / CELL));
  return {
    pixels: points.length,
    localBounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    globalBounds: [
      column * CELL + Math.min(...xs),
      row * CELL + Math.min(...ys),
      column * CELL + Math.max(...xs),
      row * CELL + Math.max(...ys),
    ],
    samples: points.slice(0, 24).map((pixel) => {
      const x = pixel % CELL;
      const y = Math.floor(pixel / CELL);
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS;
      return { local: [x, y], target: [...target.slice(at, at + CHANNELS)], base: [...base.slice(at, at + CHANNELS)] };
    }),
  };
};

const rgbaFor = (bitmap, sourcePixels = null) => {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  for (let pixel = 0; pixel < bitmap.length; pixel += 1) {
    if (!bitmap[pixel]) continue;
    const at = pixel * CHANNELS;
    if (sourcePixels) {
      rgba[at] = sourcePixels[at]; rgba[at + 1] = sourcePixels[at + 1];
      rgba[at + 2] = sourcePixels[at + 2]; rgba[at + 3] = sourcePixels[at + 3];
    } else {
      rgba[at] = 255; rgba[at + 1] = 255; rgba[at + 2] = 255; rgba[at + 3] = 255;
    }
  }
  return rgba;
};

await fs.mkdir(proofDirectory, { recursive: true });
const diagnosticMaskPath = path.join(proofDirectory, 'raw-exact-diff-mask.png');
const diagnosticLayerPath = path.join(proofDirectory, 'raw-exact-diff-layer.png');
await Promise.all([
  sharp(rgbaFor(exactDiff), { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(diagnosticMaskPath),
  sharp(rgbaFor(exactDiff, target), { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(diagnosticLayerPath),
]);

const initialCells = [];
let extraComponentPixels = 0;
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  const found = components4(exactDiff, row, column);
  const extras = found.slice(1).map((points) => componentDetail(points, row, column));
  extraComponentPixels += extras.reduce((sum, detail) => sum + detail.pixels, 0);
  initialCells.push({
    index: row * 5 + column + 1,
    row,
    column,
    exactDiffPixels: found.reduce((sum, points) => sum + points.length, 0),
    componentsBeforeHoleFill: found.length,
    mainComponentPixels: found[0]?.length ?? 0,
    extraComponents: extras,
  });
}

const inputHashes = { target: await sha256(targetPath), base: await sha256(basePath) };
if (extraComponentPixels > 0) {
  const rejected = {
    verdict: 'REJECT',
    reason: 'Frozen canonical target contains disconnected target/base exact-difference islands. Removing them would violate targetBaseDiffOutsideMask=0; keeping them would violate the required one 4-connected accessory component per cell.',
    inputs: { targetPath, basePath, prohibitedMaskLayerInputsRead: [] },
    hashes: inputHashes,
    requestedProductionOutputsNotWritten: { maskPath, layerPath },
    diagnostics: { diagnosticMaskPath, diagnosticLayerPath },
    geometry: { canvas: '800x640', cell: '160x160', resized: false, rotated: false, stretched: false, shifted: false },
    totals: {
      passingSingle4ConnectedCellsBeforeHoleFill: initialCells.filter((cell) => cell.componentsBeforeHoleFill === 1).length,
      extraComponentPixels,
      affectedCells: initialCells.filter((cell) => cell.componentsBeforeHoleFill !== 1).length,
    },
    cells: initialCells,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(rejected, null, 2)}\n`);
  console.log(JSON.stringify(rejected, null, 2));
  process.exitCode = 2;
} else {
  const productionMask = Uint8Array.from(exactDiff);
  const fillHoles4 = (row, column) => {
    const exterior = new Uint8Array(CELL * CELL);
    const queue = [];
    const push = (x, y) => {
      const local = y * CELL + x;
      const global = (row * CELL + y) * WIDTH + column * CELL + x;
      if (exterior[local] || productionMask[global]) return;
      exterior[local] = 1; queue.push(local);
    };
    for (let x = 0; x < CELL; x += 1) { push(x, 0); push(x, CELL - 1); }
    for (let y = 0; y < CELL; y += 1) { push(0, y); push(CELL - 1, y); }
    let head = 0;
    while (head < queue.length) {
      const local = queue[head++]; const x = local % CELL; const y = Math.floor(local / CELL);
      for (const [dx, dy] of DIR4) {
        const nx = x + dx; const ny = y + dy;
        if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) push(nx, ny);
      }
    }
    let filled = 0;
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      const local = y * CELL + x;
      const global = (row * CELL + y) * WIDTH + column * CELL + x;
      if (!productionMask[global] && !exterior[local]) { productionMask[global] = 1; filled += 1; }
    }
    return filled;
  };

  const eyeRoiFor = (row, column) => {
    if (row === 0) return [32, 128, 68, 122];
    if (row === 1) return [78, 148, 62, 120];
    if (row === 3 && column === 2) return [8, 115, 78, 145];
    if (row === 3) return [28, 132, 66, 128];
    return null;
  };
  const isDarkEye = (at) => base[at + 3] >= 96 && base[at] < 105 && base[at + 1] < 78 && base[at + 2] < 68;
  const cells = [];
  for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
    const holesFilled = fillHoles4(row, column);
    const found = components4(productionMask, row, column);
    const roi = eyeRoiFor(row, column);
    let eyeRoiOverlapPixels = 0;
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      if (!roi || x < roi[0] || x > roi[1] || y < roi[2] || y > roi[3]) continue;
      const pixel = (row * CELL + y) * WIDTH + column * CELL + x;
      if (productionMask[pixel] && isDarkEye(pixel * CHANNELS)) eyeRoiOverlapPixels += 1;
    }
    cells.push({ ...initialCells[row * 5 + column], holesFilled, componentsAfterHoleFill: found.length, eyeRoiOverlapPixels });
  }

  // Hole-fill pixels and any connectivity-only pixels remain transparent in
  // the layer. Only exact target/base difference pixels carry target RGBA.
  const maskRgba = rgbaFor(productionMask);
  const layerRgba = rgbaFor(exactDiff, target);
  await Promise.all([
    sharp(maskRgba, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(maskPath),
    sharp(layerRgba, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(layerPath),
  ]);
  let targetBaseDiffOutsideMask = 0;
  let transparentRgbNonZero = 0;
  let layerSourceCoordinateViolations = 0;
  for (let pixel = 0; pixel < exactDiff.length; pixel += 1) {
    const at = pixel * CHANNELS;
    if (exactDiff[pixel] && !productionMask[pixel]) targetBaseDiffOutsideMask += 1;
    if (!layerRgba[at + 3] && (layerRgba[at] || layerRgba[at + 1] || layerRgba[at + 2])) transparentRgbNonZero += 1;
    if (layerRgba[at + 3] && (layerRgba[at] !== target[at] || layerRgba[at + 1] !== target[at + 1] || layerRgba[at + 2] !== target[at + 2] || layerRgba[at + 3] !== target[at + 3])) layerSourceCoordinateViolations += 1;
  }
  const report = {
    verdict: cells.every((cell) => cell.componentsAfterHoleFill === 1 && cell.eyeRoiOverlapPixels === 0)
      && targetBaseDiffOutsideMask === 0 && transparentRgbNonZero === 0 && layerSourceCoordinateViolations === 0 ? 'PASS' : 'REJECT',
    inputs: { targetPath, basePath, prohibitedMaskLayerInputsRead: [] },
    outputs: { maskPath, layerPath },
    diagnostics: { diagnosticMaskPath, diagnosticLayerPath },
    hashes: { ...inputHashes, mask: await sha256(maskPath), layer: await sha256(layerPath) },
    geometry: { canvas: '800x640', cell: '160x160', resized: false, rotated: false, stretched: false, shifted: false },
    totals: {
      single4ConnectedCells: cells.filter((cell) => cell.componentsAfterHoleFill === 1).length,
      enclosedHolePixelsAfterFill: 0,
      targetBaseDiffOutsideMask,
      transparentRgbNonZero,
      layerSourceCoordinateViolations,
      eyeRoiOverlapPixels: cells.reduce((sum, cell) => sum + cell.eyeRoiOverlapPixels, 0),
    },
    cells,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
