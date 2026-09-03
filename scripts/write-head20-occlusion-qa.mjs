import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [,, basePath, layerPath, fullPath, proofDir] = process.argv;
if (!basePath || !layerPath || !fullPath || !proofDir) throw new Error('usage: node write-head20-occlusion-qa.mjs <base> <layer> <full> <proof-dir>');
for (const input of [layerPath, fullPath]) if (/(?:fitted|mask|patch|erase)/i.test(path.basename(input))) throw new Error(`prohibited old output: ${input}`);

async function load(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== 800 || info.height !== 640) throw new Error(`${input} must be 800x640`);
  return data;
}
const [base, layer, full] = await Promise.all([load(basePath), load(layerPath), load(fullPath)]);
const composite = Buffer.alloc(base.length);
const occlusionMask = Buffer.alloc(base.length);
const diffMap = Buffer.alloc(base.length);
const cells = [];
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) cells.push({ row, column, overlapPixels: 0, opaqueOcclusionPixels: 0, partialOcclusionPixels: 0, mismatchPixels: 0, mismatchAbsRgba: 0, bounds: null });

for (let y = 0; y < 640; y += 1) {
  for (let x = 0; x < 800; x += 1) {
    const at = (y * 800 + x) * 4;
    const cell = cells[Math.floor(y / 160) * 5 + Math.floor(x / 160)];
    const la = layer[at + 3] / 255;
    for (let channel = 0; channel < 3; channel += 1) composite[at + channel] = Math.round(layer[at + channel] * la + base[at + channel] * (1 - la));
    composite[at + 3] = Math.round(layer[at + 3] + base[at + 3] * (1 - la));
    if (layer[at + 3] && base[at + 3]) {
      cell.overlapPixels += 1;
      if (layer[at + 3] >= 250) cell.opaqueOcclusionPixels += 1;
      else cell.partialOcclusionPixels += 1;
      const localX = x % 160; const localY = y % 160;
      if (!cell.bounds) cell.bounds = [localX, localY, localX, localY];
      else { cell.bounds[0] = Math.min(cell.bounds[0], localX); cell.bounds[1] = Math.min(cell.bounds[1], localY); cell.bounds[2] = Math.max(cell.bounds[2], localX); cell.bounds[3] = Math.max(cell.bounds[3], localY); }
      occlusionMask[at] = 255; occlusionMask[at + 1] = 255; occlusionMask[at + 2] = 255; occlusionMask[at + 3] = 255;
    }
    let same = true;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(composite[at + channel] - full[at + channel]);
      cell.mismatchAbsRgba += delta;
      if (delta) same = false;
    }
    if (!same) {
      cell.mismatchPixels += 1;
      diffMap[at] = 255; diffMap[at + 1] = 0; diffMap[at + 2] = 255; diffMap[at + 3] = 255;
    }
  }
}
for (const cell of cells) cell.meanAbsRgba = Number((cell.mismatchAbsRgba / (160 * 160 * 4)).toFixed(3));

await fs.mkdir(proofDir, { recursive: true });
const compositePath = path.join(proofDir, 'base-plus-layer-source-qa.png');
const occlusionMaskPath = path.join(proofDir, 'base-overlap-occlusion-mask.png');
const diffMapPath = path.join(proofDir, 'base-plus-layer-vs-full-diff.png');
await sharp(composite, { raw: { width: 800, height: 640, channels: 4 } }).png().toFile(compositePath);
await sharp(occlusionMask, { raw: { width: 800, height: 640, channels: 4 } }).png().toFile(occlusionMaskPath);
await sharp(diffMap, { raw: { width: 800, height: 640, channels: 4 } }).png().toFile(diffMapPath);

const report = {
  item: 'head-20', verdict: 'REJECT',
  reason: 'The isolated helmet is not a coordinate-locked layer for the selected full redraw and its opaque visor requires a missing pose-specific pet redraw/erase contract.',
  inputs: { basePath, layerPath, fullPath },
  occlusionDefinition: 'Pixels where isolated layer alpha>0 overlaps base pet alpha>0; opaque means isolated alpha>=250.',
  requiredIfRegenerated: 'For each pose, the target must explicitly freeze helmet shell/visor, identify the base pixels hidden by shell/visor, and bake only the intended pet face visible inside the visor. The current source pair cannot define that contract.',
  totals: {
    overlapPixels: cells.reduce((sum, cell) => sum + cell.overlapPixels, 0),
    opaqueOcclusionPixels: cells.reduce((sum, cell) => sum + cell.opaqueOcclusionPixels, 0),
    partialOcclusionPixels: cells.reduce((sum, cell) => sum + cell.partialOcclusionPixels, 0),
    mismatchPixels: cells.reduce((sum, cell) => sum + cell.mismatchPixels, 0),
  },
  outputs: { compositePath, occlusionMaskPath, diffMapPath },
  cells,
};
const jsonPath = path.join(proofDir, 'occlusion-qa.json');
const mdPath = path.join(proofDir, 'occlusion-qa.md');
await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
const rows = cells.map((cell) => `| r${cell.row}c${cell.column} | ${cell.overlapPixels} | ${cell.opaqueOcclusionPixels} | ${cell.partialOcclusionPixels} | ${cell.mismatchPixels} | ${cell.bounds?.join(',') ?? '-'} |`).join('\n');
await fs.writeFile(mdPath, `# head-20 occlusion QA\n\n**Verdict: REJECT**\n\n${report.reason}\n\n| Cell | Base overlap | Opaque | Partial | Composite mismatch | Local bounds |\n|---|---:|---:|---:|---:|---|\n${rows}\n`);
console.log(JSON.stringify({ verdict: report.verdict, jsonPath, mdPath, totals: report.totals }, null, 2));
