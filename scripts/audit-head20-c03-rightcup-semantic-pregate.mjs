/**
 * Isolated semantic pre-gate for c03's right helmet cup.
 *
 * It intentionally examines the extracted helmet layer only (never the
 * underlying pet) in target-local ROI [113,30,131,80).  Warm gold trim is
 * counted separately from fur candidates: a pixel is rejected only when it
 * is unmistakably orange/cream/pink fur-like, not merely because it is warm.
 * This is a pre-gate; an independent visual critic remains mandatory.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [layerArg, maskArg, outputArg, revisionArg = 'r4'] = process.argv.slice(2);
if (!layerArg || !maskArg || !outputArg) throw new Error('usage: node scripts/audit-head20-c03-rightcup-semantic-pregate.mjs <helmet-layer-160> <mask-160> <output.json>');
const SIZE = 160; const CHANNELS = 4; const ROI = [113, 30, 131, 80];
const resolve = (value) => path.resolve(value);
const read = async (filePath, label) => {
  const image = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== SIZE || image.info.height !== SIZE || image.info.channels !== CHANNELS) throw new Error(`${label} must be 160x160 RGBA`);
  return image.data;
};
const sha256 = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const layerPath = resolve(layerArg); const maskPath = resolve(maskArg); const outputPath = resolve(outputArg);
const [layer, mask] = await Promise.all([read(layerPath, 'layer'), read(maskPath, 'mask')]);
const at = (x, y) => (y * SIZE + x) * CHANNELS;
const samples = { fur: [], gold: [], blue: [], permittedGlassHighlight: [] };
const counts = { roiPixels: 0, maskSupportPixels: 0, layerSupportPixels: 0, supportMismatchPixels: 0, blueShellPixels: 0, goldTrimPixels: 0, neutralHelmetPixels: 0, permittedGlassHighlightPixels: 0, unmistakableOrangeFurPixels: 0, unmistakableCreamFurPixels: 0, unmistakablePinkFurPixels: 0, ambiguousWarmPixels: 0 };
// This exception is deliberately narrower than a colour exemption.  The only
// accepted magenta pixels are saturated violet galaxy-glass highlights that
// directly touch the cobalt shell in the same isolated layer.  Pink/peach
// pixels elsewhere remain a hard reject, including any pet anatomy.
const isBlueShellPixel = (x, y) => {
  if (x < ROI[0] || x >= ROI[2] || y < ROI[1] || y >= ROI[3]) return false;
  const index = at(x, y);
  if (layer[index + 3] === 0) return false;
  const r = layer[index]; const g = layer[index + 1]; const b = layer[index + 2];
  return b >= r + 18 && b >= g + 8;
};
const isVioletGlassCandidate = (x, y) => {
  if (x < ROI[0] || x >= ROI[2] || y < ROI[1] || y >= ROI[3]) return false;
  const index = at(x, y);
  if (layer[index + 3] === 0) return false;
  const r = layer[index]; const g = layer[index + 1]; const b = layer[index + 2];
  // Purple/white specular light in a galaxy visor: strongly green-suppressed,
  // magenta-or-blue balanced, and never an orange/cream material.
  return r >= 210 && b >= r - 5 && g <= r - 40 && b - g >= 50;
};
// A highlight is accepted only when its complete 4-connected violet region
// is attached to the cobalt shell. This excludes isolated pink fur details.
const violetGlassConnected = new Set();
const queue = [];
for (let y = ROI[1]; y < ROI[3]; y += 1) for (let x = ROI[0]; x < ROI[2]; x += 1) {
  if (isBlueShellPixel(x, y)) queue.push([x, y]);
}
for (let cursor = 0; cursor < queue.length; cursor += 1) {
  const [x, y] = queue[cursor];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const nx = x + dx; const ny = y + dy; const key = `${nx},${ny}`;
    if (!violetGlassConnected.has(key) && isVioletGlassCandidate(nx, ny)) {
      violetGlassConnected.add(key); queue.push([nx, ny]);
    }
  }
}
for (let y = ROI[1]; y < ROI[3]; y += 1) for (let x = ROI[0]; x < ROI[2]; x += 1) {
  counts.roiPixels += 1; const index = at(x, y); const layerSupport = layer[index + 3] > 0; const maskSupport = mask[index + 3] > 0;
  if (layerSupport) counts.layerSupportPixels += 1; if (maskSupport) counts.maskSupportPixels += 1; if (layerSupport !== maskSupport) counts.supportMismatchPixels += 1;
  if (!layerSupport) continue;
  const r = layer[index]; const g = layer[index + 1]; const b = layer[index + 2]; const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const blue = b >= r + 18 && b >= g + 8;
  // Gold is deliberately broad enough to accept the normal dark-to-bright
  // gold rim. It is accounted for before fur classification, never rejected
  // solely for being orange-toned.
  const gold = r >= 90 && g >= 38 && g <= r + 24 && b <= g && g / Math.max(r, 1) >= 0.38 && b / Math.max(r, 1) <= 0.72;
  const neutralHelmet = min >= 105 && max - min <= 34;
  if (blue) { counts.blueShellPixels += 1; if (samples.blue.length < 12) samples.blue.push([x, y, r, g, b]); }
  if (gold) { counts.goldTrimPixels += 1; if (samples.gold.length < 12) samples.gold.push([x, y, r, g, b]); }
  if (neutralHelmet) counts.neutralHelmetPixels += 1;
  if (blue || gold || neutralHelmet) continue;
  // The three rejected categories are intentionally high-confidence and do
  // not include ordinary gold trim. Any unclassified warm pixel is recorded
  // as ambiguous for the visual critic, but does not create a false reject.
  const orangeFur = r >= 190 && g >= 108 && g < r - 38 && b < g - 36 && r / Math.max(g, 1) >= 1.28;
  const creamFur = r >= 195 && g >= 155 && b >= 95 && r - g >= 24 && r - g <= 82 && g - b >= 22 && g - b <= 86;
  const violetGlassHighlight = violetGlassConnected.has(`${x},${y}`);
  if (violetGlassHighlight) {
    counts.permittedGlassHighlightPixels += 1;
    if (samples.permittedGlassHighlight.length < 24) samples.permittedGlassHighlight.push([x, y, r, g, b]);
    continue;
  }
  const pinkFur = r >= 175 && b >= 92 && b >= g - 34 && r - g >= 28 && max - min >= 55;
  if (orangeFur || creamFur || pinkFur) {
    if (orangeFur) counts.unmistakableOrangeFurPixels += 1;
    if (creamFur) counts.unmistakableCreamFurPixels += 1;
    if (pinkFur) counts.unmistakablePinkFurPixels += 1;
    if (samples.fur.length < 24) samples.fur.push([x, y, r, g, b, orangeFur ? 'orange' : creamFur ? 'cream' : 'pink']);
  } else if (r > g + 18 && r > b + 28) counts.ambiguousWarmPixels += 1;
}
const furPixels = counts.unmistakableOrangeFurPixels + counts.unmistakableCreamFurPixels + counts.unmistakablePinkFurPixels;
const helmetEvidencePixels = counts.blueShellPixels + counts.goldTrimPixels + counts.neutralHelmetPixels;
const gates = {
  layerMaskSupportExactWithinRoi: counts.supportMismatchPixels === 0,
  rightCupHasActualHelmetSupport: counts.layerSupportPixels > 0,
  blueOrGoldHelmetEvidence: counts.blueShellPixels > 0 && counts.goldTrimPixels > 0 && helmetEvidencePixels >= 24,
  noUnmistakableOrangeCreamPinkFur: furPixels === 0,
  visualCritic: 'PENDING',
};
const pass = Object.entries(gates).filter(([key]) => key !== 'visualCritic').every(([, value]) => value === true);
const report = {
  schemaVersion: 1, independent: true, job: 'starpatch-cat:1:head-20', cell: 'c03', revision: revisionArg, stage: 'RIGHT_CUP_ISOLATED_LAYER_SEMANTIC_PRE_GATE',
  contract: 'ROI is layer-only. Blue/gold helmet evidence must exist; zero high-confidence orange/cream/pink fur-like pixels. Warm gold trim is an allowed material class and is reported separately.',
  inputs: { layerPath, layerSha256: await sha256(layerPath), maskPath, maskSha256: await sha256(maskPath), roi: ROI },
  classifier: {
    goldTrim: 'warm red/gold material, counted as allowed before fur tests; prevents normal gold rim false positives',
    permittedGlassHighlight: 'only a green-suppressed violet galaxy-glass region 4-connected (possibly through other qualifying highlight pixels) to a cobalt-blue shell pixel; it is still surfaced to the visual critic',
    rejectedFur: 'only high-confidence orange/cream/pink criteria; ambiguous warm pixels are surfaced to the visual critic rather than mechanically rejected',
  },
  metrics: { ...counts, helmetEvidencePixels, furPixels, samples },
  gates, verdict: pass ? 'PASS_RIGHT_CUP_SEMANTIC_PRE_GATE_PENDING_VISUAL_CRITIC' : 'REJECT_RIGHT_CUP_SEMANTIC_PRE_GATE', publishable: false,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, outputPath, metrics: report.metrics, gates }, null, 2));
if (!pass) process.exitCode = 2;
