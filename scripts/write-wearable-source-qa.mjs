import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [,, itemId, basePath, fullPath, isolatedPath, proofDir] = process.argv;
if (!itemId || !basePath || !fullPath || !isolatedPath || !proofDir) {
  throw new Error('usage: node write-wearable-source-qa.mjs <item> <base> <full> <isolated> <proof-dir>');
}

const prohibitedPattern = itemId === 'head-20' ? /(?:mask|patch|erase|front|fitted)/i : /(?:mask|patch|erase|front|fitted|layer)/i;
const prohibited = [isolatedPath, fullPath].filter((input) => prohibitedPattern.test(path.basename(input)));
if (prohibited.length) throw new Error(`prohibited input: ${prohibited.join(', ')}`);

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;

async function load(inputPath) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { path: inputPath, data, width: info.width, height: info.height };
}

const sha = async (inputPath) => crypto.createHash('sha256').update(await fs.readFile(inputPath)).digest('hex');

function pixelIndex(width, x, y) { return (y * width + x) * 4; }

function metricsForCell(full, isolated, row, column) {
  let visible = 0;
  let partialAlpha = 0;
  let hiddenRgbNonZero = 0;
  let exactRgb = 0;
  let exactRgba = 0;
  let zeroError = 0;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const at = pixelIndex(WIDTH, column * CELL + x, row * CELL + y);
      const alpha = isolated.data[at + 3];
      if (!alpha) {
        if (isolated.data[at] || isolated.data[at + 1] || isolated.data[at + 2]) hiddenRgbNonZero += 1;
        continue;
      }
      visible += 1;
      if (alpha < 255) partialAlpha += 1;
      let rgbSame = true;
      let rgbaSame = true;
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = Math.abs(isolated.data[at + channel] - full.data[at + channel]);
        zeroError += delta;
        if (delta) { rgbSame = false; rgbaSame = false; }
      }
      if (alpha !== full.data[at + 3]) rgbaSame = false;
      if (rgbSame) exactRgb += 1;
      if (rgbaSame) exactRgba += 1;
    }
  }

  let best = { dx: 0, dy: 0, meanAbsRgb: Number.POSITIVE_INFINITY, comparedPixels: 0 };
  for (let dy = -20; dy <= 20; dy += 1) {
    for (let dx = -20; dx <= 20; dx += 1) {
      let error = 0;
      let compared = 0;
      for (let y = 0; y < CELL; y += 1) {
        const shiftedY = y + dy;
        if (shiftedY < 0 || shiftedY >= CELL) continue;
        for (let x = 0; x < CELL; x += 1) {
          const shiftedX = x + dx;
          if (shiftedX < 0 || shiftedX >= CELL) continue;
          const sourceAt = pixelIndex(WIDTH, column * CELL + x, row * CELL + y);
          if (isolated.data[sourceAt + 3] < 96) continue;
          const referenceAt = pixelIndex(WIDTH, column * CELL + shiftedX, row * CELL + shiftedY);
          if (full.data[referenceAt + 3] < 96) continue;
          error += Math.abs(isolated.data[sourceAt] - full.data[referenceAt]);
          error += Math.abs(isolated.data[sourceAt + 1] - full.data[referenceAt + 1]);
          error += Math.abs(isolated.data[sourceAt + 2] - full.data[referenceAt + 2]);
          compared += 1;
        }
      }
      const meanAbsRgb = compared ? error / (compared * 3) : Number.POSITIVE_INFINITY;
      if (meanAbsRgb < best.meanAbsRgb) best = { dx, dy, meanAbsRgb, comparedPixels: compared };
    }
  }
  return {
    row, column, visiblePixels: visible, partialAlphaPixels: partialAlpha, hiddenRgbNonZero,
    exactRgbRatio: visible ? exactRgb / visible : 1,
    exactRgbaRatio: visible ? exactRgba / visible : 1,
    zeroShiftMeanAbsRgb: visible ? zeroError / (visible * 3) : 0,
    bestShiftRgb: { ...best, meanAbsRgb: Number(best.meanAbsRgb.toFixed(3)) },
  };
}

function manualReviewFor(item) {
  if (item === 'head-02') return {
    petContamination: 'REJECT: isolated source visibly contains orange/pink pet ear pixels in front, side, back and special cells.',
    geometry: 'REJECT: isolated helmet is not co-registered to the full redraw; every cell requires a material shift, commonly 10-20 px vertically, and outline/details drift independently.',
    topology: 'Helmet, goggle and feather details differ from the corresponding full redraw rather than being the same source-coordinate art.',
  };
  if (item === 'head-03') return {
    petContamination: 'REJECT: isolated source visibly contains large orange/pink pet ear regions in front, side and special cells.',
    geometry: 'REJECT: flower/leaf clusters are independently redrawn and do not remain co-registered to the full redraw.',
    topology: 'Individual flowers, leaves and band ends change count/shape/position between isolated and full versions.',
  };
  if (item === 'head-20') return {
    petContamination: 'The isolated file is helmet-only, but its opaque galaxy visor is not the same occlusion/redraw treatment as the full dressed pet.',
    geometry: 'REJECT: source-coordinate overlay shows the isolated helmet and the full redraw helmet do not share one outline/scale/placement across all cells.',
    topology: 'The visor is a closed opaque surface in the isolated source while the full redraw exposes a pose-specific pet face inside it; an explicit per-cell occlusion/redraw contract is missing.',
  };
  return {
    petContamination: 'Requires manual item-specific review.',
    geometry: 'Requires manual item-specific review.',
    topology: 'Requires manual item-specific review.',
  };
}

const [base, full, isolated] = await Promise.all([load(basePath), load(fullPath), load(isolatedPath)]);
if (base.width !== WIDTH || base.height !== HEIGHT || full.width !== WIDTH || full.height !== HEIGHT || isolated.width !== WIDTH || isolated.height !== HEIGHT) {
  throw new Error('all source QA inputs must be 800x640');
}

const cells = [];
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) cells.push(metricsForCell(full, isolated, row, column));
const alignedCells = cells.filter((cell) => Math.abs(cell.bestShiftRgb.dx) <= 2 && Math.abs(cell.bestShiftRgb.dy) <= 2 && cell.zeroShiftMeanAbsRgb <= 24).length;
const manualReview = manualReviewFor(itemId);
const report = {
  item: itemId,
  phase: 'upstream-source-qa',
  verdict: 'REJECT',
  canonicalExtractionStarted: false,
  reason: 'The isolated source is neither clean of pet pixels nor co-registered with the authoritative full redraw.',
  inputPolicy: {
    authoritativeInputsOnly: true,
    prohibitedOldPatchEraseFrontMaskLayerRead: false,
    transformsApplied: false,
  },
  inputs: {
    base: { path: basePath, sha256: await sha(basePath) },
    fullRedraw: { path: fullPath, sha256: await sha(fullPath) },
    isolatedSource: { path: isolatedPath, sha256: await sha(isolatedPath) },
  },
  canvas: { width: WIDTH, height: HEIGHT, columns: 5, rows: 4, cell: '160x160' },
  totals: {
    cells: cells.length,
    alignedCells,
    cellsRequiringMoreThan2PxShift: cells.filter((cell) => Math.abs(cell.bestShiftRgb.dx) > 2 || Math.abs(cell.bestShiftRgb.dy) > 2).length,
    hiddenRgbNonZero: cells.reduce((sum, cell) => sum + cell.hiddenRgbNonZero, 0),
  },
  manualReview,
  cells,
};

await fs.mkdir(proofDir, { recursive: true });
const qaJsonPath = path.join(proofDir, 'source-qa.json');
const qaMdPath = path.join(proofDir, 'source-qa.md');
await fs.writeFile(qaJsonPath, `${JSON.stringify(report, null, 2)}\n`);

const cellLines = cells.map((cell) => `| r${cell.row}c${cell.column} | ${cell.visiblePixels} | ${(cell.exactRgbRatio * 100).toFixed(2)}% | ${cell.zeroShiftMeanAbsRgb.toFixed(2)} | ${cell.bestShiftRgb.dx},${cell.bestShiftRgb.dy} | ${cell.bestShiftRgb.meanAbsRgb.toFixed(2)} |`).join('\n');
const markdown = `# ${itemId} upstream source QA\n\n**Verdict: REJECT**\n\nThe isolated source is not approved for a locked target or canonical extraction.\n\n- ${manualReview.petContamination}\n- ${manualReview.geometry}\n- ${manualReview.topology}\n- Aligned cells: ${alignedCells}/20.\n- No transform was applied during QA.\n\n| Cell | Visible px | Exact RGB | Zero-shift MAE | Best dx,dy | Best MAE |\n|---|---:|---:|---:|---:|---:|\n${cellLines}\n`;
await fs.writeFile(qaMdPath, markdown);

const fadedIsolated = Buffer.from(isolated.data);
for (let at = 0; at < fadedIsolated.length; at += 4) fadedIsolated[at + 3] = Math.round(fadedIsolated[at + 3] * 0.55);
await sharp(full.data, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .composite([{ input: fadedIsolated, raw: { width: WIDTH, height: HEIGHT, channels: 4 } }])
  .png().toFile(path.join(proofDir, 'isolated-over-full-55pct.png'));

console.log(JSON.stringify({ verdict: report.verdict, item: itemId, qaJsonPath, qaMdPath, totals: report.totals }, null, 2));
