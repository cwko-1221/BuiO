/**
 * Rank already-generated redraw candidates before masking/compositing.
 *
 * Candidate JSON format:
 * {
 *   "base": "...base atlas...",
 *   "candidates": [
 *     { "id": "head-08", "category": "head", "target": "...png", "supportMask": "...png" }
 *   ]
 * }
 *
 * The support mask is a diagnostic envelope only; it is never a publishable
 * mask.  A PASS means only that a candidate is cheap enough to send to the
 * semantic solver.  Final source-over and independent critic checks remain
 * mandatory.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, reportPath] = process.argv.slice(2);
if (!inputPath) throw new Error('usage: node scripts/rank-redrawn-preflight-candidates.mjs <candidates.json> [report.json]');
const spec = JSON.parse(await fs.readFile(inputPath, 'utf8'));
if (!spec.base || !Array.isArray(spec.candidates)) throw new Error('candidates.json requires base and candidates[]');

const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const CHANNELS = 4;
const read = async (file) => {
  const image = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error(`${file} must be ${WIDTH}x${HEIGHT}`);
  return image.data;
};
const base = await read(spec.base);
const inRoi = (x, y, roi) => x >= roi.minX && x <= roi.maxX && y >= roi.minY && y <= roi.maxY;
const eyeRoiFor = (row) => row === 0 ? { minX: 32, maxX: 128, minY: 68, maxY: 122 }
  : row === 1 ? { minX: 78, maxX: 148, minY: 62, maxY: 120 }
  : row === 3 ? { minX: 28, maxX: 132, minY: 66, maxY: 128 } : null;
const tailRoiFor = (row) => row === 1 ? { minX: 0, maxX: 72, minY: 34, maxY: 122 }
  : row === 2 ? { minX: 42, maxX: 112, minY: 54, maxY: 132 } : null;
const same = (a, b, at) => a[at] === b[at] && a[at + 1] === b[at + 1] && a[at + 2] === b[at + 2] && a[at + 3] === b[at + 3];

const rank = [];
for (const candidate of spec.candidates) {
  const [target, mask] = await Promise.all([read(candidate.target), read(candidate.supportMask)]);
  let outsideMaskMismatch = 0; let outsideComparable = 0; let maskPixels = 0; let eyeCovered = 0; let tailCovered = 0;
  const cells = [];
  for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
    let mismatch = 0; let comparable = 0; let masked = 0; let eye = 0; let tail = 0;
    const eyeRoi = eyeRoiFor(row); const tailRoi = tailRoiFor(row);
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS;
      if (mask[at + 3] > 0) {
        masked += 1; maskPixels += 1;
        if (eyeRoi && inRoi(x, y, eyeRoi)) { eye += 1; eyeCovered += 1; }
        if (tailRoi && inRoi(x, y, tailRoi)) { tail += 1; tailCovered += 1; }
      } else if (target[at + 3] > 0 || base[at + 3] > 0) {
        comparable += 1; outsideComparable += 1;
        if (!same(target, base, at)) { mismatch += 1; outsideMaskMismatch += 1; }
      }
    }
    cells.push({ index: row * 5 + column + 1, row, column, maskPixels: masked,
      outsideMaskMismatchPixels: mismatch, outsideMaskComparablePixels: comparable,
      protectedEyeMaskPixels: eye, protectedTailMaskPixels: tail });
  }
  const verdict = outsideMaskMismatch === 0 && eyeCovered === 0 && tailCovered === 0 ? 'EARLY_PASS_TO_MASK_SOLVER' : 'EARLY_REJECT';
  rank.push({ ...candidate, verdict, totals: { maskPixels, outsideMaskMismatchPixels: outsideMaskMismatch,
    outsideMaskComparablePixels: outsideComparable,
    outsideMaskMismatchRate: outsideComparable ? Number((outsideMaskMismatch / outsideComparable).toFixed(6)) : 0,
    protectedEyeMaskPixels: eyeCovered, protectedTailMaskPixels: tailCovered }, cells });
}
rank.sort((a, b) => (a.verdict === b.verdict ? a.totals.outsideMaskMismatchPixels - b.totals.outsideMaskMismatchPixels : a.verdict === 'EARLY_PASS_TO_MASK_SOLVER' ? -1 : 1));
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), policy: 'diagnostic preflight ranking; never publish from this report', base: spec.base, candidates: rank };
const output = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) { await fs.mkdir(path.dirname(reportPath), { recursive: true }); await fs.writeFile(reportPath, output); }
process.stdout.write(output);
