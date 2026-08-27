import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [,, rawFullPath, rawLayerPath, layerPath, fullPath, fullV2Path, proofDir] = process.argv;
if (!rawFullPath || !rawLayerPath || !layerPath || !fullPath || !fullV2Path || !proofDir) {
  throw new Error('usage: node write-head20-lineage-qa.mjs <raw-full> <raw-layer> <layer> <full> <full-v2> <proof-dir>');
}
for (const input of [rawFullPath, rawLayerPath, layerPath, fullPath, fullV2Path]) {
  if (/(?:fitted|mask|patch|erase)/i.test(path.basename(input))) throw new Error(`prohibited old output: ${input}`);
}

const sha = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
async function describe(input) {
  const [metadata, stat, hash] = await Promise.all([sharp(input).metadata(), fs.stat(input), sha(input)]);
  return { path: input, width: metadata.width, height: metadata.height, hasAlpha: metadata.hasAlpha, mtime: stat.mtime.toISOString(), sha256: hash };
}

async function normalizedRaw(input, output) {
  await sharp(input).resize(800, 640, { fit: 'fill', kernel: sharp.kernel.lanczos3 }).png().toFile(output);
  return output;
}

async function load(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function visiblePixelComparison(source, reference) {
  let visible = 0;
  let exactRgb = 0;
  let error = 0;
  for (let pixel = 0; pixel < source.width * source.height; pixel += 1) {
    const at = pixel * 4;
    if (!source.data[at + 3]) continue;
    visible += 1;
    let same = true;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(source.data[at + channel] - reference.data[at + channel]);
      error += delta;
      if (delta) same = false;
    }
    if (same) exactRgb += 1;
  }
  return { visiblePixels: visible, exactRgbRatio: visible ? exactRgb / visible : 1, meanAbsRgb: visible ? error / (visible * 3) : 0 };
}

await fs.mkdir(proofDir, { recursive: true });
const normalizedRawFullPath = path.join(proofDir, 'head-20-dressed-atlas-v1-raw-normalized-review.png');
const normalizedRawLayerPath = path.join(proofDir, 'head-20-layer-raw-normalized-review.png');
await normalizedRaw(rawFullPath, normalizedRawFullPath);
await normalizedRaw(rawLayerPath, normalizedRawLayerPath);

const descriptions = {};
for (const [key, input] of Object.entries({ rawFullPath, rawLayerPath, layerPath, fullPath, fullV2Path, normalizedRawFullPath, normalizedRawLayerPath })) descriptions[key] = await describe(input);

const [layer, full, fullV2, rawLayerNormalized, rawFullNormalized] = await Promise.all([
  load(layerPath), load(fullPath), load(fullV2Path), load(normalizedRawLayerPath), load(normalizedRawFullPath),
]);

const report = {
  item: 'head-20',
  verdict: 'REJECT',
  selectedFullReferenceForSourceQa: fullV2Path,
  selectionReason: 'v2 is the latest cleaned 800x640 full-redraw variant; no signed metadata proves it was generated from the same coordinate-locked pass as the isolated layer.',
  inferredChronologyOnly: [
    descriptions.rawFullPath,
    descriptions.rawLayerPath,
    descriptions.layerPath,
    descriptions.fullPath,
    descriptions.fullV2Path,
  ],
  normalizationReview: {
    transform: 'full-canvas 1402x1122 to 800x640, fit fill, Lanczos3; QA preview only',
    rawLayerToLayer: visiblePixelComparison(layer, rawLayerNormalized),
    rawFullToFull: visiblePixelComparison(full, rawFullNormalized),
    rawFullToFullV2: visiblePixelComparison(fullV2, rawFullNormalized),
  },
  conclusion: 'The chronology is compatible with an initial full render followed by a separately generated isolated helmet, then independent normalization/cleanup. The files are not a coordinate-locked extraction pair, and overlay QA independently rejects them.',
};

const jsonPath = path.join(proofDir, 'lineage-qa.json');
const mdPath = path.join(proofDir, 'lineage-qa.md');
await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
await fs.writeFile(mdPath, `# head-20 lineage QA\n\n**Verdict: REJECT**\n\n${report.selectionReason}\n\n${report.conclusion}\n\nThe raw review normalization is diagnostic only and is not a production transform. No fitted/mask/patch/erase file was read.\n`);
console.log(JSON.stringify({ verdict: report.verdict, jsonPath, mdPath, normalizationReview: report.normalizationReview }, null, 2));
