/**
 * Strict, zero-tolerance QA for a redrawn wearable extracted at source coordinates.
 *
 * This script never edits an asset. It measures whether:
 * 1. the extracted wearable pixels are copied from the full redraw without movement;
 * 2. the recomposition actually matches the full redraw in every atlas cell; and
 * 3. differences outside the wearable mask make an exact match mathematically impossible.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, proofPath, basePath, maskPath, layerPath, outputPath] = process.argv.slice(2);
if (!targetPath || !proofPath || !basePath || !maskPath || !layerPath) {
  console.error('usage: node scripts/qa-redrawn-mask-recomposition.mjs <target> <proof> <base> <mask> <layer> [report.json]');
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

const [target, proof, base, mask, layer] = await Promise.all([
  read(targetPath),
  read(proofPath),
  read(basePath),
  read(maskPath),
  read(layerPath),
]);

const pixelOffset = (x, y) => (y * WIDTH + x) * CHANNELS;
const rgbaEqual = (a, b, at) => (
  a[at] === b[at]
  && a[at + 1] === b[at + 1]
  && a[at + 2] === b[at + 2]
  && a[at + 3] === b[at + 3]
);

const boundsOf = (data, originX, originY, predicate) => {
  let minX = CELL;
  let minY = CELL;
  let maxX = -1;
  let maxY = -1;
  let pixels = 0;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const at = pixelOffset(originX + x, originY + y);
      if (!predicate(data, at, x, y)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      pixels += 1;
    }
  }
  return pixels ? { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, pixels } : null;
};

const ratio = (numerator, denominator) => denominator ? Number((numerator / denominator).toFixed(6)) : 1;
const eyeRoiFor = (row, column) => {
  if (row === 0) return { minX: 32, maxX: 128, minY: 68, maxY: 122 };
  if (row === 1) return { minX: 78, maxX: 148, minY: 62, maxY: 120 };
  if (row === 3 && column === 2) return { minX: 8, maxX: 115, minY: 78, maxY: 145 };
  if (row === 3) return { minX: 28, maxX: 132, minY: 66, maxY: 128 };
  return null;
};
const isEyeInk = (data, at) => {
  if (data[at + 3] < 96) return false;
  const r = data[at];
  const g = data[at + 1];
  const b = data[at + 2];
  return r < 105 && g < 78 && b < 68;
};
const tailRoiFor = (row) => {
  if (row === 1) return { minX: 0, maxX: 72, minY: 34, maxY: 122 };
  if (row === 2) return { minX: 42, maxX: 112, minY: 54, maxY: 132 };
  return null;
};
const atlasCells = [];
let atlasUnion = 0;
let atlasExact = 0;
let atlasMaskPixels = 0;
let atlasLayerSourceExact = 0;
let atlasOutsideMaskComparable = 0;
let atlasOutsideMaskMismatch = 0;
let atlasAlphaIntersection = 0;
let atlasAlphaUnion = 0;

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const originX = column * CELL;
    const originY = row * CELL;
    let union = 0;
    let exact = 0;
    let absoluteError = 0;
    let maskPixels = 0;
    let layerSourceExact = 0;
    let layerCoordinateViolations = 0;
    let outsideMaskComparable = 0;
    let outsideMaskMismatch = 0;
    let alphaIntersection = 0;
    let alphaUnion = 0;
    let baseEyeInkPixels = 0;
    let baseEyeInkCoveredByMask = 0;
    let targetVisibleEyeInkPixels = 0;
    let proofVisibleEyeInkPixels = 0;
    let tailRegionUnion = 0;
    let tailRegionExact = 0;
    let maskOverVisibleBaseInTailRegion = 0;
    const eyeRoi = eyeRoiFor(row, column);
    const tailRoi = tailRoiFor(row);

    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = pixelOffset(originX + x, originY + y);
        const targetVisible = target[at + 3] > 0;
        const proofVisible = proof[at + 3] > 0;
        const masked = mask[at + 3] > 0;
        const layerVisible = layer[at + 3] > 0;

        if (targetVisible || proofVisible) {
          union += 1;
          if (rgbaEqual(target, proof, at)) exact += 1;
          for (let channel = 0; channel < CHANNELS; channel += 1) {
            absoluteError += Math.abs(target[at + channel] - proof[at + channel]);
          }
        }
        if (targetVisible && proofVisible) alphaIntersection += 1;
        if (targetVisible || proofVisible) alphaUnion += 1;

        if (masked) {
          maskPixels += 1;
          if (layerVisible && rgbaEqual(layer, target, at)) layerSourceExact += 1;
          if (!layerVisible) layerCoordinateViolations += 1;
        } else if (layerVisible) {
          layerCoordinateViolations += 1;
        }

        // These pixels cannot be repaired by a wearable-only mask. If the full
        // redraw differs from the base here, recomposition cannot be identical.
        if (!masked && (targetVisible || base[at + 3] > 0)) {
          outsideMaskComparable += 1;
          if (!rgbaEqual(target, base, at)) outsideMaskMismatch += 1;
        }

        if (eyeRoi
          && x >= eyeRoi.minX && x <= eyeRoi.maxX
          && y >= eyeRoi.minY && y <= eyeRoi.maxY) {
          if (isEyeInk(base, at)) {
            baseEyeInkPixels += 1;
            if (masked) baseEyeInkCoveredByMask += 1;
          }
          if (!masked && isEyeInk(target, at)) targetVisibleEyeInkPixels += 1;
          if (!masked && isEyeInk(proof, at)) proofVisibleEyeInkPixels += 1;
        }

        if (tailRoi
          && x >= tailRoi.minX && x <= tailRoi.maxX
          && y >= tailRoi.minY && y <= tailRoi.maxY) {
          if (targetVisible || proofVisible) {
            tailRegionUnion += 1;
            if (rgbaEqual(target, proof, at)) tailRegionExact += 1;
          }
          if (masked && base[at + 3] > 0) maskOverVisibleBaseInTailRegion += 1;
        }
      }
    }

    const targetBounds = boundsOf(target, originX, originY, (data, at) => data[at + 3] > 0);
    const proofBounds = boundsOf(proof, originX, originY, (data, at) => data[at + 3] > 0);
    const maskBounds = boundsOf(mask, originX, originY, (data, at) => data[at + 3] > 0);
    const baseBounds = boundsOf(base, originX, originY, (data, at) => data[at + 3] > 0);
    const targetVisibleEyeInkBounds = eyeRoi ? boundsOf(
      target,
      originX,
      originY,
      (data, at, x, y) => x >= eyeRoi.minX && x <= eyeRoi.maxX
        && y >= eyeRoi.minY && y <= eyeRoi.maxY
        && mask[at + 3] === 0
        && isEyeInk(data, at),
    ) : null;
    const proofVisibleEyeInkBounds = eyeRoi ? boundsOf(
      proof,
      originX,
      originY,
      (data, at, x, y) => x >= eyeRoi.minX && x <= eyeRoi.maxX
        && y >= eyeRoi.minY && y <= eyeRoi.maxY
        && mask[at + 3] === 0
        && isEyeInk(data, at),
    ) : null;

    const cell = {
      row,
      column,
      index: row * 5 + column + 1,
      view: row === 0 ? 'front' : row === 1 ? 'side' : row === 2 ? 'back' : 'special',
      targetBounds,
      proofBounds,
      baseBounds,
      accessoryMaskBounds: maskBounds,
      proofExactRgbaRate: ratio(exact, union),
      proofMeanAbsoluteRgbaError: union ? Number((absoluteError / (union * CHANNELS)).toFixed(3)) : 0,
      silhouetteIou: ratio(alphaIntersection, alphaUnion),
      maskPixelCount: maskPixels,
      extractedLayerExactSourcePixelRate: ratio(layerSourceExact, maskPixels),
      extractedLayerCoordinateViolations: layerCoordinateViolations,
      outsideMaskMismatchRateAgainstBase: ratio(outsideMaskMismatch, outsideMaskComparable),
      eyeFit: eyeRoi ? {
        baseEyeInkPixels,
        baseEyeInkCoveredByWearableMask: baseEyeInkCoveredByMask,
        baseEyeInkOccludedRate: ratio(baseEyeInkCoveredByMask, baseEyeInkPixels),
        targetVisibleEyeInkPixels,
        proofVisibleEyeInkPixels,
        targetVisibleEyeInkBounds,
        proofVisibleEyeInkBounds,
      } : null,
      tailFit: tailRoi ? {
        targetVsProofExactRgbaRate: ratio(tailRegionExact, tailRegionUnion),
        accessoryMaskPixelsOverVisibleBase: maskOverVisibleBaseInTailRegion,
      } : null,
      exactMatch: exact === union,
      verdict: exact === union ? 'PASS' : 'REJECT',
    };
    atlasCells.push(cell);
    atlasUnion += union;
    atlasExact += exact;
    atlasMaskPixels += maskPixels;
    atlasLayerSourceExact += layerSourceExact;
    atlasOutsideMaskComparable += outsideMaskComparable;
    atlasOutsideMaskMismatch += outsideMaskMismatch;
    atlasAlphaIntersection += alphaIntersection;
    atlasAlphaUnion += alphaUnion;
  }
}

const report = {
  inputs: { targetPath, proofPath, basePath, maskPath, layerPath },
  acceptancePolicy: {
    requiredProofExactRgbaRate: 1,
    requiredSilhouetteIou: 1,
    requiredExtractedLayerExactSourcePixelRate: 1,
    requiredExtractedLayerCoordinateViolations: 0,
    cellRule: 'All 20 cells must independently pass. Any mismatch rejects the asset.',
  },
  atlas: {
    proofExactRgbaRate: ratio(atlasExact, atlasUnion),
    silhouetteIou: ratio(atlasAlphaIntersection, atlasAlphaUnion),
    extractedLayerExactSourcePixelRate: ratio(atlasLayerSourceExact, atlasMaskPixels),
    outsideMaskMismatchRateAgainstBase: ratio(atlasOutsideMaskMismatch, atlasOutsideMaskComparable),
    passingCells: atlasCells.filter((cell) => cell.verdict === 'PASS').length,
    totalCells: atlasCells.length,
  },
  theoreticalFinding: atlasOutsideMaskMismatch === 0
    ? 'No mismatch was found outside the wearable mask.'
    : 'The full-redraw pet and original base pet differ outside the wearable mask. A wearable-only overlay cannot reproduce the full redraw exactly.',
  verdict: atlasCells.every((cell) => cell.verdict === 'PASS') ? 'PASS' : 'REJECT',
  cells: atlasCells,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, serialized);
}
process.stdout.write(serialized);
