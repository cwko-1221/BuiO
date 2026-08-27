import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [targetPath, basePath, maskPath, layerPath, reportPath] = process.argv.slice(2);
if (!targetPath || !basePath || !maskPath || !layerPath || !reportPath) {
  console.error('usage: node scripts/extract-head06-canonical-v9.mjs <v9-target> <base> <mask> <layer> <report>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const CHANNELS = 4;
const DIR4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  return image.data;
};
const sha256 = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const [target, base] = await Promise.all([read(targetPath), read(basePath)]);
const mask = new Uint8Array(WIDTH * HEIGHT);
for (let pixel = 0; pixel < mask.length; pixel += 1) {
  const at = pixel * CHANNELS;
  mask[pixel] = Number(target[at] !== base[at]
    || target[at + 1] !== base[at + 1]
    || target[at + 2] !== base[at + 2]
    || target[at + 3] !== base[at + 3]);
}

const components4 = (row, column) => {
  const seen = new Uint8Array(CELL * CELL);
  const result = [];
  for (let seed = 0; seed < seen.length; seed += 1) {
    const sx = seed % CELL;
    const sy = Math.floor(seed / CELL);
    const global = (row * CELL + sy) * WIDTH + column * CELL + sx;
    if (seen[seed] || !mask[global]) continue;
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
        if (!seen[next] && mask[nextGlobal]) { seen[next] = 1; queue.push(next); }
      }
    }
    result.push(points);
  }
  return result.sort((a, b) => b.length - a.length);
};

const fillHoles4 = (row, column) => {
  const outside = new Uint8Array(CELL * CELL);
  const queue = [];
  const push = (x, y) => {
    const local = y * CELL + x;
    const global = (row * CELL + y) * WIDTH + column * CELL + x;
    if (outside[local] || mask[global]) return;
    outside[local] = 1;
    queue.push(local);
  };
  for (let x = 0; x < CELL; x += 1) { push(x, 0); push(x, CELL - 1); }
  for (let y = 0; y < CELL; y += 1) { push(0, y); push(CELL - 1, y); }
  let head = 0;
  while (head < queue.length) {
    const local = queue[head++];
    const x = local % CELL;
    const y = Math.floor(local / CELL);
    for (const [dx, dy] of DIR4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) push(nx, ny);
    }
  }
  let filled = 0;
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    const local = y * CELL + x;
    const global = (row * CELL + y) * WIDTH + column * CELL + x;
    if (!mask[global] && !outside[local]) { mask[global] = 1; filled += 1; }
  }
  return filled;
};

const eyeRoiFor = (row, column) => {
  if (row === 0) return { minX: 32, maxX: 128, minY: 68, maxY: 122 };
  if (row === 1) return { minX: 78, maxX: 148, minY: 62, maxY: 120 };
  if (row === 3 && column === 2) return { minX: 8, maxX: 115, minY: 78, maxY: 145 };
  if (row === 3) return { minX: 28, maxX: 132, minY: 66, maxY: 128 };
  return null;
};
const isDarkEye = (at) => base[at + 3] >= 96 && base[at] < 105 && base[at + 1] < 78 && base[at + 2] < 68;

const initialCells = [];
let initialExtraComponentPixels = 0;
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  const found = components4(row, column);
  const extraPixels = found.slice(1).reduce((sum, points) => sum + points.length, 0);
  initialExtraComponentPixels += extraPixels;
  initialCells.push({ index: row * 5 + column + 1, row, column, componentsBeforeHoleFill: found.length, extraComponentPixels: extraPixels });
}

// Never silently discard a target/base difference. A remaining island means
// the locked target itself must be corrected before extraction.
if (initialExtraComponentPixels > 0) {
  const rejected = {
    verdict: 'REJECT',
    reason: 'The v9 target still contains disconnected target/base difference islands; target correction is required.',
    inputs: { targetPath, basePath, oldMaskOrLayerInputs: [] },
    initialExtraComponentPixels,
    cells: initialCells,
  };
  await fs.writeFile(reportPath, `${JSON.stringify(rejected, null, 2)}\n`);
  console.log(JSON.stringify(rejected, null, 2));
  process.exitCode = 2;
} else {
  const cells = [];
  for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
    const holesFilled = fillHoles4(row, column);
    const found = components4(row, column);
    let eyeOverlap = 0;
    const roi = eyeRoiFor(row, column);
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      if (!roi || x < roi.minX || x > roi.maxX || y < roi.minY || y > roi.maxY) continue;
      const globalX = column * CELL + x;
      const globalY = row * CELL + y;
      const pixel = globalY * WIDTH + globalX;
      if (mask[pixel] && isDarkEye(pixel * CHANNELS)) eyeOverlap += 1;
    }
    cells.push({
      ...initialCells[row * 5 + column],
      holesFilled,
      componentsAfterHoleFill: found.length,
      maskPixels: found[0]?.length ?? 0,
      eyeRoiOverlapPixels: eyeOverlap,
    });
  }

  const maskRgba = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  const layer = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  let targetBaseDiffOutsideMask = 0;
  let transparentRgbNonZero = 0;
  let layerSourceCoordinateViolations = 0;
  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    const at = pixel * CHANNELS;
    const differs = target[at] !== base[at]
      || target[at + 1] !== base[at + 1]
      || target[at + 2] !== base[at + 2]
      || target[at + 3] !== base[at + 3];
    if (differs && !mask[pixel]) targetBaseDiffOutsideMask += 1;
    if (!mask[pixel]) continue;
    maskRgba[at] = 255; maskRgba[at + 1] = 255; maskRgba[at + 2] = 255; maskRgba[at + 3] = 255;
    layer[at] = target[at]; layer[at + 1] = target[at + 1]; layer[at + 2] = target[at + 2]; layer[at + 3] = target[at + 3];
  }
  for (let at = 0; at < layer.length; at += CHANNELS) {
    if (layer[at + 3] === 0 && (layer[at] || layer[at + 1] || layer[at + 2])) transparentRgbNonZero += 1;
    if (layer[at + 3] > 0 && (layer[at] !== target[at] || layer[at + 1] !== target[at + 1] || layer[at + 2] !== target[at + 2] || layer[at + 3] !== target[at + 3])) layerSourceCoordinateViolations += 1;
  }
  await Promise.all([
    sharp(maskRgba, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(maskPath),
    sharp(layer, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(layerPath),
  ]);
  const report = {
    verdict: cells.every((cell) => cell.componentsAfterHoleFill === 1 && cell.eyeRoiOverlapPixels === 0)
      && targetBaseDiffOutsideMask === 0 && transparentRgbNonZero === 0 && layerSourceCoordinateViolations === 0 ? 'PASS' : 'REJECT',
    inputs: { targetPath, basePath, oldMaskOrLayerInputs: [] },
    outputs: { maskPath, layerPath },
    hashes: { target: await sha256(targetPath), base: await sha256(basePath), mask: await sha256(maskPath), layer: await sha256(layerPath) },
    geometry: { canvas: '800x640', cell: '160x160', resized: false, rotated: false, stretched: false, shifted: false },
    totals: {
      single4ConnectedCells: cells.filter((cell) => cell.componentsAfterHoleFill === 1).length,
      enclosedHolePixels: 0,
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

