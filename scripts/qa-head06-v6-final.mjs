/** Independent, zero-tolerance QA for the head-06 locked-v6 candidate. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const workspace = process.cwd();
const assetRoot = path.join(workspace, 'pet-app/art-source/imagegen/baked-wearables/starpatch-cat-1');
const productionRoot = path.join(assetRoot, 'masked-head-06-proof/zero-transform-compositing/locked-v6-qa-production');
const outputRoot = process.argv[2] ? path.resolve(process.argv[2]) : productionRoot;
const inputs = {
  sourceTarget: path.join(assetRoot, 'head-06-locked-target-v6-solid-v4.png'),
  mask: path.join(assetRoot, 'head-06-locked-v6-refined-mask-solid-v6-qa.png'),
  layer: path.join(assetRoot, 'head-06-locked-v6-refined-layer-solid-v6-qa.png'),
  base: path.join(workspace, 'pet-app/public/assets/art/sprites/starpatch-cat-1-atlas-2737c2cd0c.webp'),
  productionTarget: path.join(productionRoot, 'head-06-v6-production-locked-target.png'),
  recompose: path.join(productionRoot, 'head-06-v6-composite.png'),
};

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const PIXELS = WIDTH * HEIGHT;
const read = async (file) => {
  const value = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (value.info.width !== WIDTH || value.info.height !== HEIGHT || value.info.channels !== 4) {
    throw new Error(`${file} must decode to 800x640 RGBA`);
  }
  return value.data;
};

await fs.mkdir(outputRoot, { recursive: true });
const [sourceTarget, mask, layer, base, productionTarget, recompose] = await Promise.all(
  Object.values(inputs).map(read),
);

const at = (x, y) => (y * WIDTH + x) * 4;
const rgbaEqual = (left, right, offset) => (
  left[offset] === right[offset]
  && left[offset + 1] === right[offset + 1]
  && left[offset + 2] === right[offset + 2]
  && left[offset + 3] === right[offset + 3]
);
const maskVisible = (offset) => mask[offset + 3] > 0;
const ratio = (n, d) => d ? Number((n / d).toFixed(6)) : 1;

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

const countEnclosedMaskHolePixels = (row, column) => {
  const exterior = new Uint8Array(CELL * CELL);
  const queue = [];
  const push = (x, y) => {
    const local = y * CELL + x;
    if (exterior[local]) return;
    const offset = at(column * CELL + x, row * CELL + y);
    if (maskVisible(offset)) return;
    exterior[local] = 1;
    queue.push(local);
  };
  for (let x = 0; x < CELL; x += 1) {
    push(x, 0);
    push(x, CELL - 1);
  }
  for (let y = 0; y < CELL; y += 1) {
    push(0, y);
    push(CELL - 1, y);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const local = queue[head];
    const x = local % CELL;
    const y = Math.floor(local / CELL);
    if (x > 0) push(x - 1, y);
    if (x + 1 < CELL) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < CELL) push(x, y + 1);
  }
  let holes = 0;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const offset = at(column * CELL + x, row * CELL + y);
      if (!maskVisible(offset) && !exterior[y * CELL + x]) holes += 1;
    }
  }
  return holes;
};

const cells = [];
let sourceTargetMismatchPixels = 0;
let productionTargetMismatchPixels = 0;
let layerSourceRgbMismatchPixels = 0;
let layerAlphaMaskMismatchPixels = 0;
let visibleLayerOutsideMaskPixels = 0;
let hiddenRgbOutsideMaskPixels = 0;
let enclosedMaskHolePixels = 0;

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    let sourceMismatch = 0;
    let productionMismatch = 0;
    let visibleUnion = 0;
    let visibleExact = 0;
    let darkEyePixels = 0;
    let darkEyePixelsCovered = 0;
    const eyeRoi = eyeRoiFor(row, column);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const offset = at(column * CELL + x, row * CELL + y);
        if (!rgbaEqual(sourceTarget, recompose, offset)) sourceMismatch += 1;
        if (!rgbaEqual(productionTarget, recompose, offset)) productionMismatch += 1;
        if (sourceTarget[offset + 3] > 0 || recompose[offset + 3] > 0) {
          visibleUnion += 1;
          if (rgbaEqual(sourceTarget, recompose, offset)) visibleExact += 1;
        }
        if (eyeRoi
          && x >= eyeRoi.minX && x <= eyeRoi.maxX
          && y >= eyeRoi.minY && y <= eyeRoi.maxY
          && isDarkEyeCandidate(base, offset)) {
          darkEyePixels += 1;
          if (maskVisible(offset)) darkEyePixelsCovered += 1;
        }
      }
    }
    const holes = countEnclosedMaskHolePixels(row, column);
    sourceTargetMismatchPixels += sourceMismatch;
    productionTargetMismatchPixels += productionMismatch;
    enclosedMaskHolePixels += holes;
    cells.push({
      index: row * 5 + column + 1,
      row,
      column,
      view: row === 0 ? 'front' : row === 1 ? 'side' : row === 2 ? 'back' : 'special',
      sourceTargetVsRecomposeMismatchPixels: sourceMismatch,
      sourceTargetVsRecomposeVisibleExactRate: ratio(visibleExact, visibleUnion),
      productionTargetVsRecomposeMismatchPixels: productionMismatch,
      enclosedMaskHolePixels: holes,
      darkEyeCandidatePixels: darkEyePixels,
      darkEyeCandidatePixelsCoveredByMask: darkEyePixelsCovered,
      darkEyeCandidateOcclusionRate: ratio(darkEyePixelsCovered, darkEyePixels),
      sourceTargetExactVerdict: sourceMismatch === 0 ? 'PASS' : 'REJECT',
    });
  }
}

for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const offset = pixel * 4;
  const inMask = maskVisible(offset);
  const layerVisible = layer[offset + 3] > 0;
  if (layerVisible !== inMask) layerAlphaMaskMismatchPixels += 1;
  if (layerVisible && !inMask) visibleLayerOutsideMaskPixels += 1;
  if (inMask && (
    layer[offset] !== sourceTarget[offset]
    || layer[offset + 1] !== sourceTarget[offset + 1]
    || layer[offset + 2] !== sourceTarget[offset + 2]
  )) layerSourceRgbMismatchPixels += 1;
  if (!inMask && (layer[offset] !== 0 || layer[offset + 1] !== 0 || layer[offset + 2] !== 0)) {
    hiddenRgbOutsideMaskPixels += 1;
  }
}

const report = {
  verdict: 'REJECT',
  reason: 'The specified source locked target and the recomposition differ in all 20 cells.',
  inputs,
  metrics: {
    canvasPixels: PIXELS,
    sourceTargetVsRecomposeMismatchPixels: sourceTargetMismatchPixels,
    sourceTargetVsRecomposeExactRate: ratio(PIXELS - sourceTargetMismatchPixels, PIXELS),
    productionTargetVsRecomposeMismatchPixels: productionTargetMismatchPixels,
    productionTargetComparisonIsIndependent: false,
    layerSourceRgbMismatchPixels,
    layerAlphaMaskMismatchPixels,
    visibleLayerOutsideMaskPixels,
    hiddenRgbOutsideMaskPixels,
    enclosedMaskHolePixels,
    sourceTargetPassingCells: cells.filter((cell) => cell.sourceTargetExactVerdict === 'PASS').length,
    totalCells: cells.length,
  },
  interpretation: {
    maskClosedHoles: enclosedMaskHolePixels === 0 ? 'PASS' : 'REJECT',
    visibleLayerResidueOutsideMask: visibleLayerOutsideMaskPixels === 0 ? 'PASS' : 'REJECT',
    transparentPixelRgbSanitation: hiddenRgbOutsideMaskPixels === 0 ? 'PASS' : 'REJECT',
    zeroTransformSourceCoordinateCopy: layerSourceRgbMismatchPixels === 0 && layerAlphaMaskMismatchPixels === 0 ? 'PASS' : 'REJECT',
    specifiedSourceTargetVsRecompose: sourceTargetMismatchPixels === 0 ? 'PASS' : 'REJECT',
    generatedProductionTargetVsRecompose: productionTargetMismatchPixels === 0 ? 'PASS_BUT_CIRCULAR' : 'REJECT',
    visual: {
      frontAndSideEyes: 'PASS_WITH_PIXEL_FLAGS_IN_CELLS_4_AND_19',
      backTail: 'PASS_VISUAL',
      feedingJumpingSleeping: 'PASS_VISUAL',
    },
  },
  cells,
};

const reportPath = path.join(outputRoot, 'head-06-v6-final-independent-qa.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

const hiddenRgb = Buffer.alloc(PIXELS * 4);
const diff = Buffer.alloc(PIXELS * 4);
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const offset = pixel * 4;
  if (!maskVisible(offset) && (layer[offset] || layer[offset + 1] || layer[offset + 2])) {
    hiddenRgb[offset] = layer[offset];
    hiddenRgb[offset + 1] = layer[offset + 1];
    hiddenRgb[offset + 2] = layer[offset + 2];
    hiddenRgb[offset + 3] = 255;
  }
  if (!rgbaEqual(sourceTarget, recompose, offset)) {
    diff[offset] = 255;
    diff[offset + 1] = 32;
    diff[offset + 2] = 32;
    diff[offset + 3] = 255;
  }
}
await Promise.all([
  sharp(layer, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputRoot, 'head-06-v6-final-layer-visible-only.png')),
  sharp(hiddenRgb, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputRoot, 'head-06-v6-final-hidden-rgb-residue.png')),
  sharp(diff, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outputRoot, 'head-06-v6-final-source-vs-recompose-diff.png')),
]);

console.log(JSON.stringify({ reportPath, ...report.metrics }, null, 2));
