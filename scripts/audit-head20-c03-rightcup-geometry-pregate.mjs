/**
 * c03 right-cup geometry gate.  This is mask-contour analysis, not a colour
 * classifier: it rejects a rectangular right-side extension that reads as a
 * clipped tail/body block instead of a rounded blue/gold ear cup.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [maskArg, outputArg, revisionArg = 'r4'] = process.argv.slice(2);
if (!maskArg || !outputArg) throw new Error('usage: node scripts/audit-head20-c03-rightcup-geometry-pregate.mjs <mask-160.png> <output.json> [revision]');
const SIZE = 160; const CHANNELS = 4;
const maskPath = path.resolve(maskArg); const outputPath = path.resolve(outputArg);
const image = await sharp(maskPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (image.info.width !== SIZE || image.info.height !== SIZE || image.info.channels !== CHANNELS) throw new Error('mask must be 160x160 RGBA');
const alpha = (x, y) => image.data[(y * SIZE + x) * CHANNELS + 3] > 0;
const contourArea = [105, 70, 132, 91];
const blockProbe = [113, 79, 132, 91];
const spans = [];
for (let y = contourArea[1]; y < contourArea[3]; y += 1) {
  const active = []; for (let x = contourArea[0]; x < contourArea[2]; x += 1) if (alpha(x, y)) active.push(x);
  spans.push({ y, left: active.length ? active[0] : null, right: active.length ? active.at(-1) : null, width: active.length });
}
const probeRows = [];
for (let y = blockProbe[1]; y < blockProbe[3]; y += 1) {
  let opaque = 0; for (let x = blockProbe[0]; x < blockProbe[2]; x += 1) if (alpha(x, y)) opaque += 1;
  probeRows.push({ y, opaque, full: opaque === blockProbe[2] - blockProbe[0] });
}
const probeColumns = [];
for (let x = blockProbe[0]; x < blockProbe[2]; x += 1) {
  let opaque = 0; for (let y = blockProbe[1]; y < blockProbe[3]; y += 1) if (alpha(x, y)) opaque += 1;
  probeColumns.push({ x, opaque, full: opaque === blockProbe[3] - blockProbe[1] });
}
const longestRun = (items, predicate) => { let best = 0; let run = 0; for (let index = 0; index < items.length; index += 1) { if (predicate(items[index], index)) { run += 1; best = Math.max(best, run); } else run = 0; } return best; };
const fullWidthStraightRows = longestRun(probeRows, (row) => row.full);
const fullHeightStraightColumns = longestRun(probeColumns, (column) => column.full);
// Rounded cups may have short antialias flats. Four or more full 19px rows
// AND four or more full 12px columns prove a solid 19x12 rectilinear block.
const rectilinearBlock = fullWidthStraightRows >= 4 && fullHeightStraightColumns >= 4;
const boundaryRights = spans.filter((span) => span.right !== null).map((span) => span.right);
const boundarySteps = boundaryRights.slice(1).map((right, index) => right - boundaryRights[index]);
const flatRightEdgeRows = longestRun(spans, (span, index) => index > 0 && span.right !== null && spans[index - 1].right === span.right);
const report = {
  schemaVersion: 1, independent: true, job: 'starpatch-cat:1:head-20', cell: 'c03', revision: revisionArg,
  stage: 'RIGHT_CUP_MASK_CONTOUR_GEOMETRY_PRE_GATE',
  contract: 'Reject a full-width/full-height opaque rectilinear protrusion in the target-local lower right-cup probe. Acceptance is geometry-only and does not infer helmet identity from color.',
  inputs: { maskPath, maskSha256: crypto.createHash('sha256').update(await fs.readFile(maskPath)).digest('hex'), contourArea, blockProbe },
  metrics: { contourRowSpans: spans, probeRows, probeColumns, fullWidthStraightRows, fullHeightStraightColumns, flatRightEdgeRows, boundarySteps },
  gates: { noRectilinearRightCupProtrusion: !rectilinearBlock, visualCritic: 'PENDING' },
  verdict: rectilinearBlock ? 'REJECT_RECTILINEAR_RIGHT_CUP_PROTRUSION' : 'PASS_CURVED_OR_NON_RECTILINEAR_RIGHT_CUP_PENDING_VISUAL_CRITIC', publishable: false,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, outputPath, metrics: { fullWidthStraightRows, fullHeightStraightColumns, flatRightEdgeRows } }, null, 2));
if (rectilinearBlock) process.exitCode = 2;
