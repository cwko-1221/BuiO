/**
 * Strict c01/head-20 r3 masking + composition acceptance gate.
 *
 * The replacement windows declared in the category spec are containment
 * permissions, never a substitute for the actual binary replacement mask.
 * This script only reads candidate artifacts and writes a diagnostic report;
 * it does not touch a runtime atlas, manifest, or prior attempt artifact.
 *
 * Required reconstruction contract (no position/scale/angle transforms):
 *   original base -> erase(actual mask support) -> source-over(target patch)
 * The reconstruction must be byte-identical to the independent full-dressed
 * target.  The actual mask must be one closed, hole-free 4-connected shape,
 * contained in the semantic permission union, and must not consume visible
 * tail, torso, legs, paws, or bowl support from the original base.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const options = new Map();
for (let index = 0; index < process.argv.length - 2; index += 1) {
  const key = process.argv[index + 2];
  if (!key.startsWith('--')) continue;
  const value = process.argv[index + 3];
  if (!value || value.startsWith('--')) throw new Error(`missing value for ${key}`);
  options.set(key.slice(2), value);
  index += 1;
}
const required = ['base', 'target', 'mask', 'patch', 'spec', 'prototype-pet', 'prototype-accessory', 'output'];
for (const key of required) if (!options.get(key)) throw new Error(`missing --${key}`);

const SIZE = 160; const CHANNELS = 4; const PIXELS = SIZE * SIZE;
const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const resolve = (value) => path.resolve(value);
const read = async (filePath, label) => {
  const image = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== SIZE || image.info.height !== SIZE || image.info.channels !== CHANNELS) throw new Error(`${label} must be exactly 160x160 RGBA`);
  return image.data;
};
const sha256 = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const equal = (left, right, offset) => left[offset] === right[offset] && left[offset + 1] === right[offset + 1]
  && left[offset + 2] === right[offset + 2] && left[offset + 3] === right[offset + 3];
const offsetAt = (x, y) => (y * SIZE + x) * CHANNELS;
const supportAt = (data, pixel) => data[pixel * CHANNELS + 3] > 0;
const countComponents = (binary) => {
  const visited = new Uint8Array(PIXELS); const sizes = [];
  for (let seed = 0; seed < PIXELS; seed += 1) {
    if (!binary[seed] || visited[seed]) continue;
    const queue = [seed]; visited[seed] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const pixel = queue[cursor]; const x = pixel % SIZE; const y = Math.floor(pixel / SIZE);
      for (const [dx, dy] of DIR4) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
        const next = ny * SIZE + nx;
        if (binary[next] && !visited[next]) { visited[next] = 1; queue.push(next); }
      }
    }
    sizes.push(queue.length);
  }
  return sizes;
};
const holePixels = (binary) => {
  const outer = new Uint8Array(PIXELS); const queue = [];
  const enqueue = (x, y) => {
    const pixel = y * SIZE + x;
    if (binary[pixel] || outer[pixel]) return;
    outer[pixel] = 1; queue.push(pixel);
  };
  for (let x = 0; x < SIZE; x += 1) { enqueue(x, 0); enqueue(x, SIZE - 1); }
  for (let y = 0; y < SIZE; y += 1) { enqueue(0, y); enqueue(SIZE - 1, y); }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor]; const x = pixel % SIZE; const y = Math.floor(pixel / SIZE);
    for (const [dx, dy] of DIR4) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) enqueue(nx, ny);
    }
  }
  let holes = 0;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) if (!binary[pixel] && !outer[pixel]) holes += 1;
  return holes;
};
const rgbaSourceOver = (destination, source, offset) => {
  const sourceAlpha = source[offset + 3] / 255; const destinationAlpha = destination[offset + 3] / 255;
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha);
  if (outputAlpha <= 0) return [0, 0, 0, 0];
  const channel = (index) => Math.round(((source[offset + index] * sourceAlpha) + (destination[offset + index] * destinationAlpha * (1 - sourceAlpha))) / outputAlpha);
  return [channel(0), channel(1), channel(2), Math.round(outputAlpha * 255)];
};

const basePath = resolve(options.get('base')); const targetPath = resolve(options.get('target'));
const maskPath = resolve(options.get('mask')); const patchPath = resolve(options.get('patch'));
const specPath = resolve(options.get('spec')); const outputPath = resolve(options.get('output'));
const petPrototypePath = resolve(options.get('prototype-pet')); const accessoryPrototypePath = resolve(options.get('prototype-accessory'));
const [base, target, mask, patch] = await Promise.all([
  read(basePath, 'base'), read(targetPath, 'target'), read(maskPath, 'mask'), read(patchPath, 'patch'),
]);
const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
const zoneEntries = [
  ...(spec.topology?.replacementZones ?? []),
  ...(spec.topology?.replacementExtensions ?? []),
].filter((entry) => entry.row === 0 && entry.column === 0 && Array.isArray(entry.zone));
if (!zoneEntries.length) throw new Error('head-20 spec has no c01 replacement zones');
const insideAny = (x, y, regions) => regions.some(([left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom);
const allowedZones = zoneEntries.map((entry) => entry.zone);
const allowed = new Uint8Array(PIXELS);
for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) if (insideAny(x, y, allowedZones)) allowed[y * SIZE + x] = 1;

// The tail needs a pixel-accurate protection mask because its bounding box
// overlaps the broad helmet permission window.  Other protected regions are
// derived from original-base alpha, so blank background in their rectangle is
// not falsely treated as pet anatomy.
const protectedRois = (spec.topology?.protectedRois ?? []).filter((entry) => entry.row === 0 && entry.column === 0);
const anatomy = new Uint8Array(PIXELS); const anatomyBreakdown = {};
const protectedMembership = new Map();
for (const roi of protectedRois) {
  const pixels = new Uint8Array(PIXELS);
  if (roi.pixelMask) {
    const protectionPath = resolve(roi.pixelMask);
    const protection = await read(protectionPath, `protected mask ${roi.id}`);
    for (let pixel = 0; pixel < PIXELS; pixel += 1) if (supportAt(protection, pixel)) pixels[pixel] = 1;
  } else if (Array.isArray(roi.zone)) {
    for (let y = roi.zone[1]; y < roi.zone[3]; y += 1) for (let x = roi.zone[0]; x < roi.zone[2]; x += 1) {
      const pixel = y * SIZE + x;
      if (base[pixel * CHANNELS + 3] > 0) pixels[pixel] = 1;
    }
  }
  let count = 0;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) if (pixels[pixel]) { anatomy[pixel] = 1; count += 1; }
  anatomyBreakdown[roi.id] = count;
  protectedMembership.set(roi.id, pixels);
}

const silhouette = new Uint8Array(PIXELS); let silhouettePixels = 0; let maskOutsideAllowed = 0;
let patchOutsideMask = 0; let transparentPatchRgb = 0; let targetOutsideMaskDiff = 0;
let protectedSupportPixels = 0; const protectedSupportByRoi = Object.fromEntries(protectedRois.map((roi) => [roi.id, 0]));
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const x = pixel % SIZE; const y = Math.floor(pixel / SIZE); const offset = pixel * CHANNELS;
  if (supportAt(mask, pixel)) {
    silhouette[pixel] = 1; silhouettePixels += 1;
    if (!allowed[pixel]) maskOutsideAllowed += 1;
    if (anatomy[pixel]) {
      protectedSupportPixels += 1;
      for (const roi of protectedRois) {
        if (protectedMembership.get(roi.id)[pixel]) protectedSupportByRoi[roi.id] += 1;
      }
    }
  }
  if (!silhouette[pixel] && supportAt(patch, pixel)) patchOutsideMask += 1;
  if (patch[offset + 3] === 0 && (patch[offset] !== 0 || patch[offset + 1] !== 0 || patch[offset + 2] !== 0)) transparentPatchRgb += 1;
  if (!silhouette[pixel] && !equal(base, target, offset)) targetOutsideMaskDiff += 1;
}

const components = countComponents(silhouette); const holes = holePixels(silhouette);
const reconstructed = Buffer.from(base);
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const offset = pixel * CHANNELS;
  // A replacement layer has no effect outside its own actual silhouette.
  // Skipping that region also preserves transparent-RGB bytes in the original
  // atlas, which matters because this gate compares all four channels.
  if (!silhouette[pixel]) continue;
  reconstructed[offset] = 0; reconstructed[offset + 1] = 0; reconstructed[offset + 2] = 0; reconstructed[offset + 3] = 0;
  const composited = rgbaSourceOver(reconstructed, patch, offset);
  reconstructed[offset] = composited[0]; reconstructed[offset + 1] = composited[1]; reconstructed[offset + 2] = composited[2]; reconstructed[offset + 3] = composited[3];
}
let exactRgbaMismatchPixels = 0;
for (let pixel = 0; pixel < PIXELS; pixel += 1) if (!equal(reconstructed, target, pixel * CHANNELS)) exactRgbaMismatchPixels += 1;

const lineagePath = options.get('lineage') ? resolve(options.get('lineage')) : null;
let provenance = { provided: false, pass: false };
if (lineagePath) {
  const lineage = JSON.parse(await fs.readFile(lineagePath, 'utf8'));
  const raw = lineage.rawFullRedrawSource ?? lineage.source?.rawFullRedraw;
  const generation = lineage.generation;
  const normalization = lineage.normalization ?? lineage.sourcePreparation;
  const mapping = lineage.sourceToCandidateMapping ?? lineage.mapping;
  const forbidden = lineage.forbiddenInputProof ?? lineage.forbiddenVisualInputsProof;
  provenance = {
    provided: true,
    rawFullRedraw: Boolean(raw?.path && raw?.sha256 && raw?.width && raw?.height && raw?.channels),
    generation: [generation?.model, generation?.prompt, generation?.timestamp].every((value) => typeof value === 'string' && value.length > 0 && !/^PENDING(?:_|$)/.test(value)),
    normalization: Boolean(normalization?.steps && (normalization?.sourceSha256 || normalization?.hashes)),
    mapping: Boolean(mapping?.method || mapping?.targetPath),
    forbiddenInputs: Boolean(forbidden?.notOldTarget || forbidden?.oldWholeAtlasV2 === 'NOT_READ') && Boolean(forbidden?.notComposite || forbidden?.composites === 'NOT_READ') && Boolean(forbidden?.notMask || forbidden?.priorMasks === 'NOT_READ'),
  };
  provenance.pass = Object.entries(provenance).filter(([key]) => !['provided', 'pass'].includes(key)).every(([, value]) => value === true);
}

const gates = {
  sourcePrototypesRecorded: Boolean(await sha256(petPrototypePath)) && Boolean(await sha256(accessoryPrototypePath)),
  actualMaskNonEmpty: silhouettePixels > 0,
  actualMaskInsideAllowedUnion: maskOutsideAllowed === 0,
  actualMaskOneFourConnectedComponent: components.length === 1,
  actualMaskNoEnclosedHoles: holes === 0,
  patchHasNoSupportOutsideActualMask: patchOutsideMask === 0,
  patchHasNoTransparentRgbGarbage: transparentPatchRgb === 0,
  targetChangesOnlyInsideActualMask: targetOutsideMaskDiff === 0,
  actualMaskAvoidsTrueTailBodyLegPawBowlSupport: protectedSupportPixels === 0,
  exactSameCoordinateErasePatchComposite: exactRgbaMismatchPixels === 0,
  rawFullRedrawProvenance: provenance.pass,
  critic: 'PENDING',
};
const report = {
  schemaVersion: 1,
  job: 'starpatch-cat:1:head-20', attempt: 6, cell: 'c01', version: 'r3',
  contract: {
    allowedUnion: 'containment only; it is not the replacement silhouette',
    composition: 'base -> erase(actual binary silhouette) -> source-over(target-derived patch), identical coordinates and no transforms',
    anatomyProtection: 'actual silhouette may not cover original visible tail/body/legs/paws/bowl support',
  },
  inputs: {
    basePath, targetPath, maskPath, patchPath, specPath, lineagePath,
    baseSha256: await sha256(basePath), targetSha256: await sha256(targetPath), maskSha256: await sha256(maskPath), patchSha256: await sha256(patchPath),
    petPrototypePath, petPrototypeSha256: await sha256(petPrototypePath), accessoryPrototypePath, accessoryPrototypeSha256: await sha256(accessoryPrototypePath),
  },
  metrics: {
    allowedZones, allowedUnionPixels: allowed.reduce((sum, value) => sum + value, 0),
    actualSilhouettePixels: silhouettePixels, actualSilhouetteComponents4Connected: components.length, actualSilhouetteComponentSizes: components,
    actualSilhouetteEnclosedHolePixels: holes, maskOutsideAllowedUnionPixels: maskOutsideAllowed,
    protectedBaseSupportPixelsByRoi: anatomyBreakdown, protectedSupportIntersectionPixels: protectedSupportPixels, protectedSupportIntersectionByRoi: protectedSupportByRoi,
    patchOutsideActualMaskPixels: patchOutsideMask, transparentPatchRgbPixels: transparentPatchRgb, targetDifferenceOutsideActualMaskPixels: targetOutsideMaskDiff,
    exactRgbaMismatchPixels,
  },
  provenance,
  gates,
  maskCompositeVerdict: 'REJECT',
  verdict: 'REJECT', publishable: false,
};
const maskCompositeGateValues = Object.entries(gates).filter(([key]) => key !== 'critic').map(([, value]) => value);
report.maskCompositeVerdict = maskCompositeGateValues.every((value) => value === true) ? 'PASS' : 'REJECT';
// This agent verifies deterministic masking/composition only. A separate
// visual critic is deliberately required before publishing, but a pending
// critic must not be reported as a failed mask/composite construction.
report.verdict = report.maskCompositeVerdict === 'PASS' ? 'PASS_MASK_COMPOSITE_PENDING_INDEPENDENT_VISUAL_CRITIC' : 'REJECT';
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, outputPath, metrics: report.metrics, gates: report.gates }, null, 2));
if (report.maskCompositeVerdict !== 'PASS') process.exitCode = 2;
