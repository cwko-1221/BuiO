/**
 * Cheap, read-only gate for a generated dressed atlas.
 *
 * Run this before doing expensive semantic masking/compositing work. A full redraw
 * that changed the pet outside the declared wearable mask can never be reproduced
 * by a wearable-only layer, so it is rejected immediately. This intentionally does
 * not replace the final per-pixel solver or independent critic.
 *
 *   node scripts/preflight-redrawn-wearable.mjs target.png base.webp mask.png report.json
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, basePath, maskPath, reportPath] = process.argv.slice(2);
if (!targetPath || !basePath || !maskPath) {
  console.error('usage: node scripts/preflight-redrawn-wearable.mjs <target> <base> <mask> [report.json]');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const CHANNELS = 4;
const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  }
  return image.data;
};
const [target, base, mask] = await Promise.all([read(targetPath), read(basePath), read(maskPath)]);

const atOf = (x, y) => (y * WIDTH + x) * CHANNELS;
const sameRgba = (left, right, at) => (
  left[at] === right[at]
  && left[at + 1] === right[at + 1]
  && left[at + 2] === right[at + 2]
  && left[at + 3] === right[at + 3]
);
const inRoi = (x, y, roi) => roi && x >= roi.minX && x <= roi.maxX && y >= roi.minY && y <= roi.maxY;

// Conservative protected regions. These are only early-warning counters; final
// category specs remain authoritative and may use tighter per-cell ROIs.
const eyeRoiFor = (row, column) => {
  if (row === 0) return { minX: 32, maxX: 128, minY: 68, maxY: 122 };
  if (row === 1) return { minX: 78, maxX: 148, minY: 62, maxY: 120 };
  if (row === 3 && column === 2) return { minX: 8, maxX: 115, minY: 78, maxY: 145 };
  if (row === 3) return { minX: 28, maxX: 132, minY: 66, maxY: 128 };
  return null;
};
const tailRoiFor = (row) => {
  if (row === 1) return { minX: 0, maxX: 72, minY: 34, maxY: 122 };
  if (row === 2) return { minX: 42, maxX: 112, minY: 54, maxY: 132 };
  return null;
};

const cells = [];
let outsideMaskMismatch = 0;
let outsideComparable = 0;
let maskPixels = 0;
let maskOverBasePixels = 0;
let eyeCovered = 0;
let tailCovered = 0;

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    let cellOutsideMismatch = 0;
    let cellComparable = 0;
    let cellMaskPixels = 0;
    let cellMaskOverBasePixels = 0;
    let cellEyeCovered = 0;
    let cellTailCovered = 0;
    const eyeRoi = eyeRoiFor(row, column);
    const tailRoi = tailRoiFor(row);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const at = atOf(column * CELL + x, row * CELL + y);
        const masked = mask[at + 3] > 0;
        if (masked) {
          cellMaskPixels += 1;
          if (base[at + 3] > 0) cellMaskOverBasePixels += 1;
          if (inRoi(x, y, eyeRoi)) cellEyeCovered += 1;
          if (inRoi(x, y, tailRoi)) cellTailCovered += 1;
          continue;
        }
        if (target[at + 3] > 0 || base[at + 3] > 0) {
          cellComparable += 1;
          if (!sameRgba(target, base, at)) cellOutsideMismatch += 1;
        }
      }
    }
    const cell = {
      index: row * 5 + column + 1,
      row,
      column,
      maskPixels: cellMaskPixels,
      maskOverBasePixels: cellMaskOverBasePixels,
      outsideMaskMismatchPixels: cellOutsideMismatch,
      outsideMaskComparablePixels: cellComparable,
      outsideMaskMismatchRate: cellComparable ? Number((cellOutsideMismatch / cellComparable).toFixed(6)) : 0,
      protectedEyeMaskPixels: cellEyeCovered,
      protectedTailMaskPixels: cellTailCovered,
      earlyVerdict: cellOutsideMismatch === 0 && cellEyeCovered === 0 && cellTailCovered === 0 ? 'PASS' : 'REJECT',
    };
    cells.push(cell);
    outsideMaskMismatch += cellOutsideMismatch;
    outsideComparable += cellComparable;
    maskPixels += cellMaskPixels;
    maskOverBasePixels += cellMaskOverBasePixels;
    eyeCovered += cellEyeCovered;
    tailCovered += cellTailCovered;
  }
}

const report = {
  schemaVersion: 1,
  inputs: { targetPath, basePath, maskPath },
  policy: {
    purpose: 'cheap preflight only; final semantic and source-over QA remains mandatory',
    outsideMaskMustMatchBase: true,
    protectedEyeAndTailMustBeUnmasked: true,
  },
  totals: {
    maskPixels,
    maskOverBasePixels,
    outsideMaskComparablePixels: outsideComparable,
    outsideMaskMismatchPixels: outsideMaskMismatch,
    outsideMaskMismatchRate: outsideComparable ? Number((outsideMaskMismatch / outsideComparable).toFixed(6)) : 0,
    protectedEyeMaskPixels: eyeCovered,
    protectedTailMaskPixels: tailCovered,
  },
  verdict: outsideMaskMismatch === 0 && eyeCovered === 0 && tailCovered === 0 ? 'EARLY_PASS_TO_MASK_SOLVER' : 'EARLY_REJECT',
  cells,
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, serialized);
}
process.stdout.write(serialized);
