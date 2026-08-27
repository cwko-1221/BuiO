/**
 * c03 closed-helmet intermediate-layer gate.
 *
 * An accessory layer may contain a translucent/tinted visor, but it must not
 * contain rasterised pet anatomy copied from the dressed target.  The base
 * face must remain the base pet at composition time; this gate catches layers
 * that smuggle eyes, nose/mouth, forehead star, or fur into the helmet layer.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseArg, layerArg, maskArg, outputArg, revisionArg = 'r9'] = process.argv.slice(2);
if (!baseArg || !layerArg || !maskArg || !outputArg) throw new Error('usage: node scripts/audit-head20-c03-accessory-only-anatomy-pregate.mjs <base-160> <layer-160> <mask-160> <output.json> [revision]');
const SIZE = 160; const CHANNELS = 4;
const ROIS = {
  leftEye: [48, 43, 76, 72], rightEye: [83, 43, 111, 72],
  foreheadStar: [71, 25, 91, 45],
  // These are face-core ROIs, deliberately excluding the helmet rim,
  // ear-cups, and collar.  Hardware may legitimately be opaque around the
  // face; copied anatomy may not appear in the visor interior.
  noseMouth: [68, 64, 93, 75],
  faceFur: [52, 38, 108, 75],
};
const resolve = (value) => path.resolve(value);
const read = async (filePath, label) => {
  const image = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== SIZE || image.info.height !== SIZE || image.info.channels !== CHANNELS) throw new Error(`${label} must be 160x160 RGBA`);
  return image.data;
};
const sha256 = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const basePath = resolve(baseArg); const layerPath = resolve(layerArg); const maskPath = resolve(maskArg); const outputPath = resolve(outputArg);
const [base, layer, mask] = await Promise.all([read(basePath, 'base'), read(layerPath, 'layer'), read(maskPath, 'mask')]);
const at = (x, y) => (y * SIZE + x) * CHANNELS;
const anatomyMetrics = {};
for (const [name, [left, top, right, bottom]] of Object.entries(ROIS)) {
  const result = { opaqueLayerPixels: 0, amberIrisPixels: 0, neutralDarkPupilPixels: 0, pinkNoseMouthPixels: 0, yellowStarPixels: 0, creamFurPixels: 0, nearBaseColourPixels: 0, samples: [] };
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const index = at(x, y); if (layer[index + 3] < 192) continue; // translucent visor/tint remains permitted
    result.opaqueLayerPixels += 1;
    const r = layer[index]; const g = layer[index + 1]; const b = layer[index + 2];
    const difference = Math.abs(r - base[index]) + Math.abs(g - base[index + 1]) + Math.abs(b - base[index + 2]);
    if (difference <= 48 && base[index + 3] > 0) result.nearBaseColourPixels += 1;
    const amberIris = r >= 100 && g >= 45 && g <= r && b <= 90;
    const darkPupil = r <= 75 && g <= 75 && b <= 75;
    const pinkFeature = r >= 150 && b >= 90 && b >= g - 45 && r - g >= 20;
    const yellowFeature = r >= 170 && g >= 100 && b <= 110;
    const creamFeature = r >= 195 && g >= 155 && b >= 95 && r - g >= 20 && g - b >= 20;
    if (amberIris) result.amberIrisPixels += 1;
    if (darkPupil) result.neutralDarkPupilPixels += 1;
    if (pinkFeature) result.pinkNoseMouthPixels += 1;
    if (yellowFeature) result.yellowStarPixels += 1;
    if (creamFeature) result.creamFurPixels += 1;
    if ((amberIris || darkPupil || pinkFeature || yellowFeature || creamFeature) && result.samples.length < 16) result.samples.push([x, y, r, g, b]);
  }
  anatomyMetrics[name] = result;
}
let layerMaskMismatchPixels = 0;
for (let pixel = 0; pixel < SIZE * SIZE; pixel += 1) if ((layer[pixel * CHANNELS + 3] > 0) !== (mask[pixel * CHANNELS + 3] > 0)) layerMaskMismatchPixels += 1;
const eyeEvidence = (entry) => entry.amberIrisPixels >= 24 && entry.neutralDarkPupilPixels >= 12;
const copiedEyes = eyeEvidence(anatomyMetrics.leftEye) || eyeEvidence(anatomyMetrics.rightEye);
const copiedStar = anatomyMetrics.foreheadStar.yellowStarPixels >= 30;
const copiedNoseMouth = anatomyMetrics.noseMouth.pinkNoseMouthPixels >= 20 && anatomyMetrics.noseMouth.neutralDarkPupilPixels >= 5;
const copiedFur = anatomyMetrics.faceFur.nearBaseColourPixels >= 90 || anatomyMetrics.faceFur.creamFurPixels >= 110;
const gates = {
  noOpaqueCopiedEyesOrPupils: !copiedEyes,
  noOpaqueCopiedForeheadStar: !copiedStar,
  noOpaqueCopiedNoseOrMouth: !copiedNoseMouth,
  noOpaqueCopiedOrangeCreamFur: !copiedFur,
  layerMaskSupportRecorded: layerMaskMismatchPixels === 0,
  visualCritic: 'PENDING',
};
const pass = Object.entries(gates).filter(([key]) => key !== 'visualCritic').every(([, value]) => value === true);
const report = {
  schemaVersion: 1, independent: true, job: 'starpatch-cat:1:head-20', cell: 'c03', revision: revisionArg,
  stage: 'ACCESSORY_ONLY_ANATOMY_EXCLUSION_PRE_GATE',
  contract: 'Opaque intermediate-layer pixels may describe helmet shell, trim, or visor graphics only. They must not reproduce pet eyes/pupils, nose/mouth, forehead star, or face fur. Alpha below 192 is treated as a permitted translucent visor/tint, not copied anatomy.',
  inputs: { basePath, baseSha256: await sha256(basePath), layerPath, layerSha256: await sha256(layerPath), maskPath, maskSha256: await sha256(maskPath), rois: ROIS },
  thresholds: { eye: 'amber >=24 AND neutral-dark >=12 in either eye ROI', foreheadStar: 'yellow >=30', noseMouth: 'pink >=20 AND neutral-dark >=5', faceFur: 'near-base-colour >=90 OR cream >=110' },
  metrics: { anatomyMetrics, layerMaskSupportMismatchPixels: layerMaskMismatchPixels, copiedEyes, copiedStar, copiedNoseMouth, copiedFur },
  gates, verdict: pass ? 'PASS_ACCESSORY_ONLY_ANATOMY_PRE_GATE_PENDING_VISUAL_CRITIC' : 'REJECT_LAYER_CONTAINS_PET_ANATOMY', publishable: false,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, outputPath, anatomy: { copiedEyes, copiedStar, copiedNoseMouth, copiedFur }, gates }, null, 2));
if (!pass) process.exitCode = 2;
