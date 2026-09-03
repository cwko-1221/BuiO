/**
 * Independent, read-only acceptance audit for c03 r9's accessory-only final
 * package. It intentionally does not trust the package's self-checks.
 *
 * The only output is a new JSON review. No input PNG or lineage file is ever
 * written or normalised in place.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SIZE = 160;
const CHANNELS = 4;
const finalDir = path.resolve(process.argv[2] ?? 'artifacts/head20-attempt6-per-cell/c03/revision-9/accessory-only-final');
const outputPath = path.resolve(process.argv[3] ?? path.join(finalDir, 'c03-r9-independent-accessory-only-final-review.json'));
const basePath = path.resolve('artifacts/head20-attempt6-per-cell/c03/c03-base-original-160x160.png');
const file = (name) => path.join(finalDir, name);
const paths = {
  lineage: file('c03-r9-accessory-only-final-lineage.json'),
  target: file('c03-r9-body-preserving-complete-dressed-target-160x160.png'),
  composite: file('c03-r9-zero-transform-composite-160x160.png'),
  combined: file('c03-r9-hardware-tint-layer-160x160.png'),
  hardware: file('c03-r9-hardware-layer-160x160.png'),
  tint: file('c03-r9-visor-tint-layer-160x160.png'),
  silhouette: file('c03-r9-wearable-silhouette-mask-160x160.png'),
  opaqueErase: file('c03-r9-opaque-erase-mask-160x160.png'),
  visualCritic: file('c03-r9-accessory-only-final-visual-critic.json'),
};

const sha256 = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const exists = async (input) => fs.access(input).then(() => true).catch(() => false);
const readRgba = async (input, label) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== SIZE || result.info.height !== SIZE || result.info.channels !== CHANNELS) {
    throw new Error(`${label} must be exactly ${SIZE}x${SIZE} RGBA`);
  }
  return result.data;
};
const px = (x, y) => (y * SIZE + x) * CHANNELS;
const alpha = (buffer, pixel) => buffer[pixel * CHANNELS + 3];
const exactMismatch = (a, b) => {
  let count = 0;
  for (let p = 0; p < SIZE * SIZE; p += 1) {
    const i = p * CHANNELS;
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) count += 1;
  }
  return count;
};
const supportMismatch = (a, b) => {
  let count = 0;
  for (let p = 0; p < SIZE * SIZE; p += 1) if ((alpha(a, p) > 0) !== (alpha(b, p) > 0)) count += 1;
  return count;
};
const transparentRgb = (buffer) => {
  let count = 0;
  for (let p = 0; p < SIZE * SIZE; p += 1) {
    const i = p * CHANNELS;
    if (buffer[i + 3] === 0 && (buffer[i] !== 0 || buffer[i + 1] !== 0 || buffer[i + 2] !== 0)) count += 1;
  }
  return count;
};
const sourceOver = (dst, src) => {
  const out = Buffer.from(dst);
  for (let p = 0; p < SIZE * SIZE; p += 1) {
    const i = p * CHANNELS;
    const sa = src[i + 3] / 255;
    const da = out[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) { out[i] = 0; out[i + 1] = 0; out[i + 2] = 0; out[i + 3] = 0; continue; }
    for (let c = 0; c < 3; c += 1) out[i + c] = Math.round((src[i + c] * sa + out[i + c] * da * (1 - sa)) / oa);
    out[i + 3] = Math.round(oa * 255);
  }
  return out;
};
const clearMask = (base, mask) => {
  const out = Buffer.from(base);
  for (let p = 0; p < SIZE * SIZE; p += 1) {
    const i = p * CHANNELS;
    if (mask[i + 3] > 0) out.fill(0, i, i + CHANNELS);
  }
  return out;
};
const topology = (mask) => {
  const total = SIZE * SIZE;
  const seen = new Uint8Array(total);
  const foreground = (p) => alpha(mask, p) > 0;
  const neighbours = (p) => {
    const x = p % SIZE; const y = Math.floor(p / SIZE); const list = [];
    if (x > 0) list.push(p - 1); if (x + 1 < SIZE) list.push(p + 1); if (y > 0) list.push(p - SIZE); if (y + 1 < SIZE) list.push(p + SIZE);
    return list;
  };
  let components = 0; let foregroundPixels = 0;
  for (let p = 0; p < total; p += 1) {
    if (!foreground(p)) continue;
    foregroundPixels += 1;
    if (seen[p]) continue;
    components += 1; seen[p] = 1; const queue = [p];
    for (let h = 0; h < queue.length; h += 1) for (const n of neighbours(queue[h])) if (foreground(n) && !seen[n]) { seen[n] = 1; queue.push(n); }
  }
  // Flood outside transparent space. Any transparent pixel left is a genuine enclosed hole.
  const outside = new Uint8Array(total); const queue = [];
  for (let x = 0; x < SIZE; x += 1) for (const y of [0, SIZE - 1]) { const p = y * SIZE + x; if (!foreground(p) && !outside[p]) { outside[p] = 1; queue.push(p); } }
  for (let y = 0; y < SIZE; y += 1) for (const x of [0, SIZE - 1]) { const p = y * SIZE + x; if (!foreground(p) && !outside[p]) { outside[p] = 1; queue.push(p); } }
  for (let h = 0; h < queue.length; h += 1) for (const n of neighbours(queue[h])) if (!foreground(n) && !outside[n]) { outside[n] = 1; queue.push(n); }
  let holes = 0; for (let p = 0; p < total; p += 1) if (!foreground(p) && !outside[p]) holes += 1;
  return { foregroundPixels, fourConnectedComponents: components, enclosedTransparentHolePixels: holes };
};
const outputName = {
  combined: 'wearableLayer', hardware: 'hardwareLayer', tint: 'visorTintLayer', silhouette: 'wearableSilhouetteMask', opaqueErase: 'opaqueEraseMask', target: 'target', composite: 'composite',
};
const main = async () => {
  const missing = [];
  for (const [label, input] of Object.entries({ base: basePath, ...paths })) if (!(await exists(input))) missing.push({ label, path: input });
  const report = { schemaVersion: 1, independent: true, role: 'masking_and_compositing_critic', job: 'starpatch-cat:1:head-20', cell: 'c03', revision: 'r9-accessory-only-final', inputPaths: { base: basePath, ...paths }, missing, gates: {}, metrics: {}, evidence: {}, verdict: 'REJECT_MISSING_REQUIRED_INPUT', publishable: false };
  if (missing.length) { await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify({ verdict: report.verdict, missing }, null, 2)); process.exitCode = 2; return; }
  const lineage = JSON.parse(await fs.readFile(paths.lineage, 'utf8'));
  const [base, target, composite, combined, hardware, tint, silhouette, opaqueErase] = await Promise.all([
    readRgba(basePath, 'base'), readRgba(paths.target, 'target'), readRgba(paths.composite, 'composite'), readRgba(paths.combined, 'combined'), readRgba(paths.hardware, 'hardware'), readRgba(paths.tint, 'tint'), readRgba(paths.silhouette, 'silhouette'), readRgba(paths.opaqueErase, 'opaque erase'),
  ]);
  const hashes = { base: await sha256(basePath) };
  for (const [key, property] of Object.entries(outputName)) hashes[key] = await sha256(paths[key]);
  const hashGates = { base: hashes.base === lineage.originals?.base?.sha256 };
  for (const [key, property] of Object.entries(outputName)) hashGates[`lineage_${key}`] = hashes[key] === lineage.outputs?.[property]?.sha256;
  const topo = topology(silhouette);
  let targetOutsideSilhouetteDiff = 0;
  let eraseOnNonOpaqueHardware = 0;
  let eraseOutsideSilhouette = 0;
  for (let p = 0; p < SIZE * SIZE; p += 1) {
    const i = p * CHANNELS;
    if (silhouette[i + 3] === 0 && (base[i] !== target[i] || base[i + 1] !== target[i + 1] || base[i + 2] !== target[i + 2] || base[i + 3] !== target[i + 3])) targetOutsideSilhouetteDiff += 1;
    if (opaqueErase[i + 3] > 0 && hardware[i + 3] !== 255) eraseOnNonOpaqueHardware += 1;
    if (opaqueErase[i + 3] > 0 && silhouette[i + 3] === 0) eraseOutsideSilhouette += 1;
  }
  const rebuiltSeparately = sourceOver(sourceOver(clearMask(base, opaqueErase), tint), hardware);
  const rebuiltCombined = sourceOver(clearMask(base, opaqueErase), combined);
  const transparentRgbCounts = { target: transparentRgb(target), composite: transparentRgb(composite), combined: transparentRgb(combined), hardware: transparentRgb(hardware), tint: transparentRgb(tint), silhouette: transparentRgb(silhouette), opaqueErase: transparentRgb(opaqueErase) };
  const preGateResults = {};
  for (const [name, detail] of Object.entries(lineage.preGates ?? {})) {
    const hasPath = await exists(detail.path);
    let parsed = null; let hashMatches = false;
    if (hasPath) { const content = await fs.readFile(detail.path, 'utf8'); parsed = JSON.parse(content); hashMatches = crypto.createHash('sha256').update(content).digest('hex') === detail.sha256; }
    preGateResults[name] = { exists: hasPath, hashMatches, declaredVerdict: parsed?.verdict ?? null, passes: Boolean(hasPath && hashMatches && String(parsed?.verdict ?? '').startsWith('PASS')) };
  }
  const requiredPreGates = ['c03-r9-accessory-only-anatomy-pregate.json', 'c03-r9-accessory-only-rightcup-semantic-pregate.json', 'c03-r9-accessory-only-rightcup-geometry-pregate.json'];
  const visualCritic = JSON.parse(await fs.readFile(paths.visualCritic, 'utf8'));
  // A frozen independent visual critic's REJECT is a hard anatomy-audit failure. It cannot be
  // replaced by the builder's own provisional pre-gate PASS declaration.
  const anatomyAudit = { existingIndependentVisualCriticVerdict: visualCritic.verdict ?? null, releaseDecision: visualCritic.releaseDecision ?? null, passes: String(visualCritic.verdict ?? '').startsWith('PASS') && String(visualCritic.releaseDecision ?? '').includes('PUBLISHABLE') };
  report.hashes = hashes;
  report.evidence = { lineageStatus: lineage.status, hashGates, preGates: preGateResults, anatomyAudit, existingVisualCriticPath: paths.visualCritic };
  report.metrics = {
    storedCompositeVsTargetExactRgbaMismatchPixels: exactMismatch(composite, target),
    targetOutsideSilhouetteBaseDiffPixels: targetOutsideSilhouetteDiff,
    silhouetteTopology: topo,
    combinedLayerVsSilhouetteSupportMismatchPixels: supportMismatch(combined, silhouette),
    opaqueEraseMaskOnNonOpaqueHardwarePixels: eraseOnNonOpaqueHardware,
    opaqueEraseMaskOutsideSilhouettePixels: eraseOutsideSilhouette,
    reconstructedSeparateTintThenHardwareVsTargetExactRgbaMismatchPixels: exactMismatch(rebuiltSeparately, target),
    reconstructedCombinedLayerVsTargetExactRgbaMismatchPixels: exactMismatch(rebuiltCombined, target),
    transparentRgbResiduePixels: transparentRgbCounts,
  };
  report.gates = {
    allRequiredInputsPresent: true,
    lineageHashesMatch: Object.values(hashGates).every(Boolean),
    storedCompositeExactlyMatchesTarget: report.metrics.storedCompositeVsTargetExactRgbaMismatchPixels === 0,
    reconstructedBaseEraseTintHardwareExactlyMatchesTarget: report.metrics.reconstructedSeparateTintThenHardwareVsTargetExactRgbaMismatchPixels === 0,
    reconstructedBaseEraseCombinedLayerExactlyMatchesTarget: report.metrics.reconstructedCombinedLayerVsTargetExactRgbaMismatchPixels === 0,
    targetUnchangedOutsideActualSilhouette: targetOutsideSilhouetteDiff === 0,
    actualSilhouetteIsSingleFourConnectedComponent: topo.foregroundPixels > 0 && topo.fourConnectedComponents === 1,
    actualSilhouetteHasNoEnclosedHoles: topo.enclosedTransparentHolePixels === 0,
    combinedLayerSupportExactlyMatchesSilhouette: report.metrics.combinedLayerVsSilhouetteSupportMismatchPixels === 0,
    opaqueEraseOnlyOnFullyOpaqueHardware: eraseOnNonOpaqueHardware === 0,
    opaqueEraseInsideSilhouette: eraseOutsideSilhouette === 0,
    allThreeR9PreGatesExistHashMatchAndPass: requiredPreGates.every((name) => preGateResults[name]?.passes === true),
    independentAccessoryOnlyAnatomyAuditPasses: anatomyAudit.passes,
    noTransparentRgbResidue: Object.values(transparentRgbCounts).every((count) => count === 0),
  };
  const failures = Object.entries(report.gates).filter(([, value]) => value !== true).map(([key]) => key);
  report.failures = failures;
  report.verdict = failures.length === 0 ? 'PASS_INDEPENDENT_MASK_COMPOSITE_AND_ANATOMY_REVIEW' : 'REJECT_INDEPENDENT_MASK_COMPOSITE_AND_ANATOMY_REVIEW';
  report.publishable = failures.length === 0;
  await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ verdict: report.verdict, outputPath, failures, metrics: report.metrics }, null, 2));
  if (failures.length) process.exitCode = 2;
};
await main();
