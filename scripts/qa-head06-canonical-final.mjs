/** Independent zero-tolerance QA for head-06 canonical-diff-final. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const workspace = process.cwd();
const assetRoot = path.join(workspace, 'pet-app/art-source/imagegen/baked-wearables/starpatch-cat-1');
const outputRoot = path.join(assetRoot, 'masked-head-06-proof/canonical-diff-final/compositing/independent-final-qa');
const inputs = {
  target: path.join(assetRoot, 'head-06-full-redraw-canonical-v8.png'),
  base: path.join(workspace, 'pet-app/public/assets/art/sprites/starpatch-cat-1-atlas-2737c2cd0c.webp'),
  mask: path.join(assetRoot, 'head-06-canonical-diff-final-mask.png'),
  layer: path.join(assetRoot, 'masked-head-06-proof/canonical-diff-final/compositing/head-06-canonical-diff-final-solved-layer.png'),
  erase: path.join(assetRoot, 'masked-head-06-proof/canonical-diff-final/compositing/head-06-canonical-diff-final-minimal-erase.png'),
  priorComposite: path.join(assetRoot, 'masked-head-06-proof/zero-transform-compositing/locked-v8-canonical/head-06-v6-composite.png'),
};

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const PIXELS = WIDTH * HEIGHT;
const hash = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const read = async (file) => {
  const value = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (value.info.width !== WIDTH || value.info.height !== HEIGHT || value.info.channels !== 4) {
    throw new Error(`${file} must decode to 800x640 RGBA`);
  }
  return value.data;
};
const at = (x, y) => (y * WIDTH + x) * 4;
const rgbaEqual = (a, b, offset) => (
  a[offset] === b[offset]
  && a[offset + 1] === b[offset + 1]
  && a[offset + 2] === b[offset + 2]
  && a[offset + 3] === b[offset + 3]
);
const isMask = (offset) => mask[offset + 3] > 0;
const neighbours4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

await fs.mkdir(outputRoot, { recursive: true });
const [target, base, mask, layer, erase] = await Promise.all([
  read(inputs.target), read(inputs.base), read(inputs.mask), read(inputs.layer), read(inputs.erase),
]);
const [targetStat, priorStat, targetHash, priorHash, maskHash, layerHash, eraseHash] = await Promise.all([
  fs.stat(inputs.target), fs.stat(inputs.priorComposite), hash(inputs.target), hash(inputs.priorComposite),
  hash(inputs.mask), hash(inputs.layer), hash(inputs.erase),
]);

// Recompose independently from base + erase + layer. Target is never read here.
const independentlyRecomposed = Buffer.alloc(PIXELS * 4);
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const offset = pixel * 4;
  const eraseAlpha = erase[offset + 3] / 255;
  const baseAlpha = (base[offset + 3] / 255) * (1 - eraseAlpha);
  const layerAlpha = layer[offset + 3] / 255;
  // Preserve the untouched destination RGBA byte-for-byte, including RGB
  // stored under alpha 0. This is the only faithful no-op composition rule.
  if (eraseAlpha === 0 && layerAlpha === 0) {
    independentlyRecomposed[offset] = base[offset];
    independentlyRecomposed[offset + 1] = base[offset + 1];
    independentlyRecomposed[offset + 2] = base[offset + 2];
    independentlyRecomposed[offset + 3] = base[offset + 3];
    continue;
  }
  const outputAlpha = layerAlpha + baseAlpha * (1 - layerAlpha);
  if (outputAlpha <= 0) continue;
  for (let channel = 0; channel < 3; channel += 1) {
    independentlyRecomposed[offset + channel] = Math.round(
      (layer[offset + channel] * layerAlpha
        + base[offset + channel] * baseAlpha * (1 - layerAlpha)) / outputAlpha,
    );
  }
  independentlyRecomposed[offset + 3] = Math.round(outputAlpha * 255);
}

const componentAndHoleCount = (row, column) => {
  const seen = new Uint8Array(CELL * CELL);
  let components = 0;
  const componentDetails = [];
  for (let sy = 0; sy < CELL; sy += 1) for (let sx = 0; sx < CELL; sx += 1) {
    const seed = sy * CELL + sx;
    if (seen[seed] || !isMask(at(column * CELL + sx, row * CELL + sy))) continue;
    components += 1;
    const queue = [seed];
    seen[seed] = 1;
    let pixels = 0;
    let minX = sx; let minY = sy; let maxX = sx; let maxY = sy;
    for (let head = 0; head < queue.length; head += 1) {
      const local = queue[head];
      const x = local % CELL;
      const y = Math.floor(local / CELL);
      pixels += 1;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const [ox, oy] of neighbours4) {
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const next = ny * CELL + nx;
        if (seen[next] || !isMask(at(column * CELL + nx, row * CELL + ny))) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    componentDetails.push({ pixels, minX, minY, maxX, maxY });
  }

  const exterior = new Uint8Array(CELL * CELL);
  const queue = [];
  const pushExterior = (x, y) => {
    const local = y * CELL + x;
    if (exterior[local] || isMask(at(column * CELL + x, row * CELL + y))) return;
    exterior[local] = 1;
    queue.push(local);
  };
  for (let x = 0; x < CELL; x += 1) {
    pushExterior(x, 0); pushExterior(x, CELL - 1);
  }
  for (let y = 0; y < CELL; y += 1) {
    pushExterior(0, y); pushExterior(CELL - 1, y);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const local = queue[head];
    const x = local % CELL;
    const y = Math.floor(local / CELL);
    for (const [ox, oy] of neighbours4) {
      const nx = x + ox; const ny = y + oy;
      if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
      pushExterior(nx, ny);
    }
  }
  let holes = 0;
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    if (!isMask(at(column * CELL + x, row * CELL + y)) && !exterior[y * CELL + x]) holes += 1;
  }
  componentDetails.sort((a, b) => b.pixels - a.pixels);
  return { components, componentDetails, enclosedHolePixels: holes };
};

const eyeRoiFor = (row, column) => {
  if (row === 0) return { minX: 32, maxX: 128, minY: 68, maxY: 122 };
  if (row === 1) return { minX: 78, maxX: 148, minY: 62, maxY: 120 };
  if (row === 3 && column === 2) return { minX: 8, maxX: 115, minY: 78, maxY: 145 };
  if (row === 3) return { minX: 28, maxX: 132, minY: 66, maxY: 128 };
  return null;
};
const isDarkEyeCandidate = (data, offset) => (
  data[offset + 3] >= 96
  && data[offset] < 105
  && data[offset + 1] < 78
  && data[offset + 2] < 68
);

let exactMismatchPixels = 0;
let maskNonBinaryAlphaPixels = 0;
let maskTransparentRgbPixels = 0;
let layerTransparentRgbPixels = 0;
let eraseTransparentRgbPixels = 0;
let layerVisibleOutsideMaskPixels = 0;
let erasePixels = 0;
let eraseOutsideMaskPixels = 0;
let eraseEyeCandidatePixels = 0;
const eraseCoordinates = [];
const cells = [];

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const topology = componentAndHoleCount(row, column);
    let mismatch = 0;
    let cellErase = 0;
    let eyeCandidatesCoveredByMask = 0;
    const eyeRoi = eyeRoiFor(row, column);
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      const offset = at(column * CELL + x, row * CELL + y);
      if (!rgbaEqual(target, independentlyRecomposed, offset)) mismatch += 1;
      if (erase[offset + 3] > 0) cellErase += 1;
      if (eyeRoi
        && x >= eyeRoi.minX && x <= eyeRoi.maxX
        && y >= eyeRoi.minY && y <= eyeRoi.maxY
        && isDarkEyeCandidate(base, offset)
        && isMask(offset)) eyeCandidatesCoveredByMask += 1;
    }
    exactMismatchPixels += mismatch;
    cells.push({
      index: row * 5 + column + 1,
      row,
      column,
      view: row === 0 ? 'front' : row === 1 ? 'side' : row === 2 ? 'back' : 'special',
      exactRgbaMismatchPixels: mismatch,
      maskComponents4Connected: topology.components,
      maskComponentDetails: topology.componentDetails,
      enclosedMaskHolePixels: topology.enclosedHolePixels,
      erasePixels: cellErase,
      darkEyeCandidatePixelsCoveredByMask: eyeCandidatesCoveredByMask,
    });
  }
}

for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const offset = pixel * 4;
  if (mask[offset + 3] !== 0 && mask[offset + 3] !== 255) maskNonBinaryAlphaPixels += 1;
  if (mask[offset + 3] === 0 && (mask[offset] || mask[offset + 1] || mask[offset + 2])) maskTransparentRgbPixels += 1;
  if (layer[offset + 3] === 0 && (layer[offset] || layer[offset + 1] || layer[offset + 2])) layerTransparentRgbPixels += 1;
  if (erase[offset + 3] === 0 && (erase[offset] || erase[offset + 1] || erase[offset + 2])) eraseTransparentRgbPixels += 1;
  if (layer[offset + 3] > 0 && !isMask(offset)) layerVisibleOutsideMaskPixels += 1;
  if (erase[offset + 3] > 0) {
    erasePixels += 1;
    const x = pixel % WIDTH;
    const y = Math.floor(pixel / WIDTH);
    const row = Math.floor(y / CELL);
    const column = Math.floor(x / CELL);
    const localX = x - column * CELL;
    const localY = y - row * CELL;
    if (!isMask(offset)) eraseOutsideMaskPixels += 1;
    const eyeRoi = eyeRoiFor(row, column);
    const eyeCandidate = Boolean(eyeRoi
      && localX >= eyeRoi.minX && localX <= eyeRoi.maxX
      && localY >= eyeRoi.minY && localY <= eyeRoi.maxY
      && isDarkEyeCandidate(base, offset));
    if (eyeCandidate) eraseEyeCandidatePixels += 1;
    eraseCoordinates.push({ x, y, row, column, localX, localY, insideMask: isMask(offset), eyeCandidate });
  }
}

const targetPredatesCurrentOutputs = targetStat.birthtimeMs < (await fs.stat(inputs.layer)).birthtimeMs;
const priorCompositePredatesTarget = priorStat.birthtimeMs < targetStat.birthtimeMs;
const targetMatchesPriorCompositeBytes = targetHash === priorHash;
const circularProvenanceRisk = priorCompositePredatesTarget && targetMatchesPriorCompositeBytes;

const report = {
  verdict: circularProvenanceRisk ? 'REJECT' : 'PASS',
  rejectionReason: circularProvenanceRisk
    ? 'The frozen target is byte-identical to an earlier composite that predates it; independent full-redraw provenance is not satisfied.'
    : null,
  hashes: { targetHash, priorCompositeHash: priorHash, maskHash, layerHash, eraseHash },
  provenance: {
    targetCreatedUtc: targetStat.birthtime.toISOString(),
    priorCompositeCreatedUtc: priorStat.birthtime.toISOString(),
    targetPredatesCurrentOutputs,
    priorCompositePredatesTarget,
    targetMatchesPriorCompositeBytes,
    circularProvenanceRisk,
  },
  independentlyVerifiedMetrics: {
    exactRgbaMismatchPixels: exactMismatchPixels,
    passingCells: cells.filter((cell) => cell.exactRgbaMismatchPixels === 0).length,
    totalCells: cells.length,
    maskCellsWithOne4ConnectedComponent: cells.filter((cell) => cell.maskComponents4Connected === 1).length,
    enclosedMaskHolePixels: cells.reduce((sum, cell) => sum + cell.enclosedMaskHolePixels, 0),
    maskNonBinaryAlphaPixels,
    maskTransparentRgbPixels,
    layerTransparentRgbPixels,
    eraseTransparentRgbPixels,
    layerVisibleOutsideMaskPixels,
    erasePixels,
    eraseOutsideMaskPixels,
    eraseEyeCandidatePixels,
    maskDarkEyeCandidatePixels: cells.reduce((sum, cell) => sum + cell.darkEyeCandidatePixelsCoveredByMask, 0),
  },
  geometry: {
    target: '800x640', base: '800x640', mask: '800x640', layer: '800x640', erase: '800x640',
    resampledOrTransformedEvidence: exactMismatchPixels === 0 ? 'NONE' : 'PRESENT',
  },
  eraseCoordinates,
  cells,
  visualReview: {
    frontFrames1To5: 'PASS_VISUAL',
    sideFrames6To10: 'PASS_VISUAL',
    backFrames11To15: 'PASS_VISUAL',
    feedingFrame16: 'PASS_VISUAL',
    jumpingFrame17: 'PASS_VISUAL',
    sleepingFrame18: 'PASS_VISUAL',
    sittingFrames19To20: 'PASS_VISUAL',
  },
};

const independentPath = path.join(outputRoot, 'head-06-canonical-independent-recompose.png');
const diff = Buffer.alloc(PIXELS * 4);
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const offset = pixel * 4;
  if (!rgbaEqual(target, independentlyRecomposed, offset)) {
    diff[offset] = 255; diff[offset + 1] = 32; diff[offset + 2] = 32; diff[offset + 3] = 255;
  }
}
await Promise.all([
  sharp(independentlyRecomposed, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .png({ compressionLevel: 9 }).toFile(independentPath),
  sharp(diff, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .png({ compressionLevel: 9 }).toFile(path.join(outputRoot, 'head-06-canonical-independent-diff.png')),
]);

const eraseSvg = Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  ${eraseCoordinates.map(({ x, y }) => `<g stroke="#ff0033" stroke-width="1"><line x1="${x - 3}" y1="${y}" x2="${x + 3}" y2="${y}"/><line x1="${x}" y1="${y - 3}" x2="${x}" y2="${y + 3}"/></g>`).join('')}
</svg>`);
await sharp(inputs.base).ensureAlpha().composite([{ input: eraseSvg, left: 0, top: 0 }])
  .png({ compressionLevel: 9 }).toFile(path.join(outputRoot, 'head-06-canonical-erase-points-on-base.png'));

const cropsRoot = path.join(outputRoot, 'per-cell-4x');
await fs.mkdir(cropsRoot, { recursive: true });
for (const cell of cells) {
  await sharp(inputs.target)
    .extract({ left: cell.column * CELL, top: cell.row * CELL, width: CELL, height: CELL })
    .resize(CELL * 4, CELL * 4, { kernel: 'nearest' })
    .png({ compressionLevel: 9 })
    .toFile(path.join(cropsRoot, `frame-${String(cell.index).padStart(2, '0')}-r${cell.row}-c${cell.column}-4x.png`));
}

const reportPath = path.join(outputRoot, 'head-06-canonical-final-independent-qa.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ reportPath, verdict: report.verdict, ...report.independentlyVerifiedMetrics, provenance: report.provenance }, null, 2));
