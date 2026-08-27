/** Build and prove a production target from same-coordinate wearable layers. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [sourceTargetPath, basePath, maskPath, layerPath, erasePath, outputDirectory] = process.argv.slice(2);
if (!sourceTargetPath || !basePath || !maskPath || !layerPath || !erasePath || !outputDirectory) {
  console.error('usage: node scripts/build-redrawn-production-locked-target.mjs <source-target> <base> <mask> <layer> <erase> <output-directory>');
  process.exit(1);
}
const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const CHANNELS = 4;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) throw new Error(`${input} must be 800x640`);
  return result.data;
};
const [sourceTarget, base, mask, layer, erase] = await Promise.all([
  read(sourceTargetPath), read(basePath), read(maskPath), read(layerPath), read(erasePath),
]);
const composite = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
let layerSourceRgbMismatchPixels = 0;
let layerAlphaFromMaskMismatchPixels = 0;
let erasePixels = 0;
for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
  const at = pixel * CHANNELS;
  const layerAlpha = layer[at + 3] / 255;
  const eraseAlpha = erase[at + 3] / 255;
  const baseAlpha = (base[at + 3] / 255) * (1 - eraseAlpha);
  const outputAlpha = layerAlpha + baseAlpha * (1 - layerAlpha);
  if (outputAlpha > 0) {
    for (let channel = 0; channel < 3; channel += 1) {
      composite[at + channel] = Math.round((
        layer[at + channel] * layerAlpha
        + base[at + channel] * baseAlpha * (1 - layerAlpha)
      ) / outputAlpha);
    }
    composite[at + 3] = Math.round(outputAlpha * 255);
  } else if (mask[at + 3] === 0 && erase[at + 3] === 0) {
    // Preserve even fully transparent base bytes outside the permitted region.
    for (let channel = 0; channel < CHANNELS; channel += 1) composite[at + channel] = base[at + channel];
  }
  if (layer[at + 3] > 0 && (
    layer[at] !== sourceTarget[at]
    || layer[at + 1] !== sourceTarget[at + 1]
    || layer[at + 2] !== sourceTarget[at + 2]
  )) layerSourceRgbMismatchPixels += 1;
  const expectedLayerAlpha = Math.round(sourceTarget[at + 3] * (mask[at + 3] / 255));
  if (layer[at + 3] !== expectedLayerAlpha) layerAlphaFromMaskMismatchPixels += 1;
  if (erase[at + 3] > 0) erasePixels += 1;
}

let enclosedMaskHolePixels = 0;
const maskHoleCells = [];
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  const outside = new Uint8Array(CELL * CELL);
  const queue = [];
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
  maskHoleCells.push({ row, column, enclosedHolePixels: holes });
}

let outsideMaskEraseBaseMismatchPixels = 0;
for (let at = 0; at < composite.length; at += CHANNELS) {
  if (mask[at + 3] > 0 || erase[at + 3] > 0) continue;
  if (composite[at] !== base[at]
    || composite[at + 1] !== base[at + 1]
    || composite[at + 2] !== base[at + 2]
    || composite[at + 3] !== base[at + 3]) outsideMaskEraseBaseMismatchPixels += 1;
}

await fs.mkdir(outputDirectory, { recursive: true });
const compositePath = path.join(outputDirectory, 'head-06-v6-composite.png');
const productionTargetPath = path.join(outputDirectory, 'head-06-v6-production-locked-target.png');
await Promise.all([
  sharp(composite, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png({ compressionLevel: 9 }).toFile(compositePath),
  sharp(composite, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png({ compressionLevel: 9 }).toFile(productionTargetPath),
]);
const productionDecoded = await read(productionTargetPath);
let lockedTargetExactMismatchPixels = 0;
for (let at = 0; at < composite.length; at += CHANNELS) {
  if (composite[at] !== productionDecoded[at]
    || composite[at + 1] !== productionDecoded[at + 1]
    || composite[at + 2] !== productionDecoded[at + 2]
    || composite[at + 3] !== productionDecoded[at + 3]) lockedTargetExactMismatchPixels += 1;
}
const hash = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const report = {
  verdict: layerSourceRgbMismatchPixels === 0
    && layerAlphaFromMaskMismatchPixels === 0
    && enclosedMaskHolePixels === 0
    && outsideMaskEraseBaseMismatchPixels === 0
    && lockedTargetExactMismatchPixels === 0 ? 'DATA_PASS' : 'REJECT',
  invariant: { canvas: '800x640', cell: '160x160', transformed: false, sampling: 'same pixel index only' },
  metrics: {
    layerSourceRgbMismatchPixels,
    layerAlphaFromMaskMismatchPixels,
    enclosedMaskHolePixels,
    erasePixels,
    outsideMaskEraseBaseMismatchPixels,
    lockedTargetExactMismatchPixels,
  },
  maskHoleCells,
  inputs: {
    sourceTargetPath, basePath, maskPath, layerPath, erasePath,
    sha256: {
      sourceTarget: await hash(sourceTargetPath), base: await hash(basePath), mask: await hash(maskPath),
      layer: await hash(layerPath), erase: await hash(erasePath),
    },
  },
  outputs: {
    compositePath, productionTargetPath,
    sha256: { composite: await hash(compositePath), productionTarget: await hash(productionTargetPath) },
  },
};
const reportPath = path.join(outputDirectory, 'head-06-v6-production-lock-report.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report.metrics, verdict: report.verdict, compositePath, productionTargetPath, reportPath }, null, 2));
if (report.verdict === 'REJECT') process.exitCode = 2;
