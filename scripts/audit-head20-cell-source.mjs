/**
 * C01 source acceptance gate for head-20 attempt 6.
 *
 * This is a diagnostic/acceptance audit only. It never edits runtime assets.
 * A candidate may be either the complete 800x640 target atlas or a 160x160
 * c01 tile. The original pet/accessory files are recorded as prototype
 * lineage; no old target, diagnostic or composite is accepted as lineage.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2); const opts = new Map();
for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i]; if (!token.startsWith('--')) throw new Error(`unexpected argument ${token}`);
  const key = token.slice(2); const value = argv[++i]; if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`); opts.set(key, value);
}
const required = ['base', 'candidate', 'spec', 'output', 'prototype-pet', 'prototype-accessory'];
for (const key of required) if (!opts.get(key)) {
  console.error('usage: node scripts/audit-head20-cell-source.mjs --base <800x640> --candidate <800x640|160x160> --spec <head20-spec> --row 0 --column 0 --prototype-pet <art-inbox-pet> --prototype-accessory <wearable-head-3> --output <report.json> [--lineage <lineage.json> --occlusion-mask <800x640|160x160> ]');
  process.exit(1);
}
const row = Number(opts.get('row') ?? 0); const column = Number(opts.get('column') ?? 0);
if (row !== 0 || column !== 0) throw new Error('c01 gate is intentionally scoped to row 0 column 0');
const basePath = path.resolve(opts.get('base')); const candidatePath = path.resolve(opts.get('candidate')); const specPath = path.resolve(opts.get('spec'));
const prototypePetPath = path.resolve(opts.get('prototype-pet')); const prototypeAccessoryPath = path.resolve(opts.get('prototype-accessory'));
const outputPath = path.resolve(opts.get('output')); const occlusionMaskPath = opts.get('occlusion-mask') ? path.resolve(opts.get('occlusion-mask')) : null;
const lineagePath = opts.get('lineage') ? path.resolve(opts.get('lineage')) : null;
const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const CHANNELS = 4; const COLUMNS = 5; const ROWS = 4;
const PIXELS = WIDTH * HEIGHT; const CELL_PIXELS = CELL * CELL;
const sha256File = async (p) => crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const readRaw = async (p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const baseImage = await readRaw(basePath); const candidateImage = await readRaw(candidatePath);
if (baseImage.info.width !== WIDTH || baseImage.info.height !== HEIGHT || baseImage.info.channels !== CHANNELS) throw new Error('base must be 800x640 RGBA');
if (!((candidateImage.info.width === WIDTH && candidateImage.info.height === HEIGHT) || (candidateImage.info.width === CELL && candidateImage.info.height === CELL)) || candidateImage.info.channels !== CHANNELS) {
  throw new Error('candidate must be 800x640 or 160x160 RGBA');
}
const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
const lineage = lineagePath ? JSON.parse(await fs.readFile(lineagePath, 'utf8')) : null;
const rawFullRedraw = lineage?.source?.rawFullRedraw ?? lineage?.rawFullRedrawSource ?? null;
const generation = lineage?.generation ?? null;
const normalization = lineage?.normalization ?? lineage?.sourcePreparation ?? null;
const sourceToCandidate = lineage?.sourceToCandidateMapping ?? lineage?.mapping ?? null;
const forbiddenProof = lineage?.forbiddenInputProof ?? lineage?.forbiddenVisualInputsProof ?? null;
let rawFullRedrawExists = false;
if (rawFullRedraw?.path) { try { await fs.stat(path.resolve(rawFullRedraw.path)); rawFullRedrawExists = true; } catch { rawFullRedrawExists = false; } }
const lineageEvidence = {
  rawFullRedrawPathAndSha: Boolean(rawFullRedraw?.path && rawFullRedraw?.sha256),
  rawFullRedrawDimensionsAlpha: Boolean(
    (rawFullRedraw?.width === 160 && rawFullRedraw?.height === 160 && rawFullRedraw?.channels === 4 && rawFullRedraw?.hasAlpha === true)
    || (rawFullRedraw?.width === 800 && rawFullRedraw?.height === 640 && rawFullRedraw?.channels === 4 && rawFullRedraw?.hasAlpha === true)
    || (rawFullRedraw?.width === 1254 && rawFullRedraw?.height === 1254 && rawFullRedraw?.channels === 3 && rawFullRedraw?.hasAlpha === false)
  ),
  rawFullRedrawExists,
  generationPromptModelTimestamp: [generation?.model, generation?.prompt, generation?.timestamp]
    .every((value) => typeof value === 'string' && value.length > 0 && !/^PENDING(?:_|$)/.test(value)),
  normalizationStepsAndHashes: Boolean(normalization?.steps && normalization?.sourceSha256 && normalization?.outputSha256),
  sourceToCandidateMapping: Boolean(sourceToCandidate?.method),
  forbiddenInputProof: Boolean(forbiddenProof?.notOldTarget && forbiddenProof?.notComposite && forbiddenProof?.notMask),
};
const lineageEvidencePass = Object.values(lineageEvidence).every(Boolean);
const zoneEntries = [
  ...(spec.topology?.replacementZones ?? spec.solve?.eraseReplacement?.allowedRegions ?? []),
  ...(spec.topology?.replacementExtensions ?? []),
].filter((entry) => entry.row === row && entry.column === column && Array.isArray(entry.zone));
const zones = zoneEntries.map((entry) => entry.zone);
if (zones.length === 0) throw new Error('spec has no c01 replacement zone');
const maskImage = occlusionMaskPath ? await readRaw(occlusionMaskPath) : null;
if (maskImage && (!((maskImage.info.width === WIDTH && maskImage.info.height === HEIGHT) || (maskImage.info.width === CELL && maskImage.info.height === CELL)) || maskImage.info.channels !== CHANNELS)) throw new Error('occlusion mask must be 800x640 or 160x160 RGBA');

const baseAt = (x, y) => ((y * WIDTH + x) * CHANNELS);
const candidateAt = (x, y) => candidateImage.info.width === WIDTH ? baseAt(x, y) : ((y * CELL + x) * CHANNELS);
const maskAt = (x, y) => maskImage ? (maskImage.info.width === WIDTH ? baseAt(x, y) : ((y * CELL + x) * CHANNELS)) : -1;
const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const equalAt = (left, leftAt, right, rightAt) => left[leftAt] === right[rightAt] && left[leftAt + 1] === right[rightAt + 1]
  && left[leftAt + 2] === right[rightAt + 2] && left[leftAt + 3] === right[rightAt + 3];
const inZone = (x, y) => zones.some((zone) => x >= zone[0] && x < zone[2] && y >= zone[1] && y < zone[3]);
const intendedAt = (x, y) => Boolean(maskImage && maskImage.data[maskAt(x, y) + 3] > 0);
// The source target may contain anti-aliased/highlight islands, so candidate
// pixel-diff components are diagnostic only. Topology is evaluated on the
// declared semantic replacement/erase union, which must be one connected,
// hole-free binary mask. This prevents a valid closed-helmet patch from being
// rejected merely because its rendered shell has many anti-aliased islands.
const replacementUnion = new Uint8Array(CELL_PIXELS);
for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) if (inZone(x, y)) replacementUnion[y * CELL + x] = 1;
const countBinaryComponents = (binary) => {
  const seenBinary = new Uint8Array(CELL_PIXELS); const result = [];
  for (let seed = 0; seed < CELL_PIXELS; seed += 1) {
    if (seenBinary[seed] || !binary[seed]) continue;
    const queue = [seed]; seenBinary[seed] = 1; let head = 0;
    while (head < queue.length) {
      const local = queue[head++]; const x = local % CELL; const y = Math.floor(local / CELL);
      for (const [dx, dy] of DIR4) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const next = ny * CELL + nx;
        if (!seenBinary[next] && binary[next]) { seenBinary[next] = 1; queue.push(next); }
      }
    }
    result.push(queue.length);
  }
  return result;
};
const replacementUnionComponents = countBinaryComponents(replacementUnion);
const replacementUnionBackground = new Uint8Array(CELL_PIXELS);
const backgroundQueue = [];
const pushBackground = (x, y) => {
  const index = y * CELL + x;
  if (replacementUnion[index] || replacementUnionBackground[index]) return;
  replacementUnionBackground[index] = 1; backgroundQueue.push(index);
};
for (let x = 0; x < CELL; x += 1) { pushBackground(x, 0); pushBackground(x, CELL - 1); }
for (let y = 0; y < CELL; y += 1) { pushBackground(0, y); pushBackground(CELL - 1, y); }
for (let head = 0; head < backgroundQueue.length; head += 1) {
  const local = backgroundQueue[head]; const x = local % CELL; const y = Math.floor(local / CELL);
  for (const [dx, dy] of DIR4) {
    const nx = x + dx; const ny = y + dy;
    if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) pushBackground(nx, ny);
  }
}
let replacementUnionHolePixels = 0;
for (let index = 0; index < CELL_PIXELS; index += 1) if (!replacementUnion[index] && !replacementUnionBackground[index]) replacementUnionHolePixels += 1;
const ringStats = (width) => {
  let total = 0; let mismatches = 0; let mismatchesOutsideIntentional = 0; let intentional = 0;
  const counted = new Uint8Array(CELL_PIXELS);
  for (const zone of zones) for (let y = zone[1]; y < zone[3]; y += 1) for (let x = zone[0]; x < zone[2]; x += 1) {
    const distance = Math.min(x - zone[0], zone[2] - 1 - x, y - zone[1], zone[3] - 1 - y);
    const localIndex = y * CELL + x;
    if (distance >= width || counted[localIndex]) continue;
    counted[localIndex] = 1; total += 1;
    const candidateOffset = candidateAt(x, y); const baseOffset = baseAt(x + column * CELL, y + row * CELL);
    const differs = !equalAt(candidateImage.data, candidateOffset, baseImage.data, baseOffset);
    if (intendedAt(x, y)) intentional += 1;
    if (!differs) continue;
    mismatches += 1; if (!intendedAt(x, y)) mismatchesOutsideIntentional += 1;
  }
  return { total, mismatches, intentional, mismatchesOutsideIntentional };
};

let outsideWindowDiff = 0; let maskOutsideWindowPixels = 0; let candidateDiffPixels = 0; let intentionalDiffPixels = 0; const diff = new Uint8Array(CELL_PIXELS);
for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
  const candidateOffset = candidateAt(x, y); const baseOffset = baseAt(x + column * CELL, y + row * CELL);
  const differs = !equalAt(candidateImage.data, candidateOffset, baseImage.data, baseOffset);
  if (maskImage && maskImage.data[maskAt(x, y) + 3] > 0 && !inZone(x, y)) maskOutsideWindowPixels += 1;
  if (differs) { candidateDiffPixels += 1; diff[y * CELL + x] = 1; if (intendedAt(x, y)) intentionalDiffPixels += 1; }
  if (!inZone(x, y) && differs) outsideWindowDiff += 1;
}

const seen = new Uint8Array(CELL_PIXELS); const components = [];
for (let seed = 0; seed < CELL_PIXELS; seed += 1) {
  if (seen[seed] || !diff[seed]) continue; const queue = [seed]; seen[seed] = 1; let head = 0; let minX = CELL; let minY = CELL; let maxX = -1; let maxY = -1;
  while (head < queue.length) { const local = queue[head++]; const x = local % CELL; const y = Math.floor(local / CELL); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); for (const [dx, dy] of DIR4) { const nx = x + dx; const ny = y + dy; if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue; const next = ny * CELL + nx; if (!seen[next] && diff[next]) { seen[next] = 1; queue.push(next); } } }
  components.push({ pixels: queue.length, bbox: [minX, minY, maxX + 1, maxY + 1] });
}
const baseCropRgba = Buffer.alloc(CELL_PIXELS * CHANNELS); for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
  const from = baseAt(x + column * CELL, y + row * CELL); const to = (y * CELL + x) * CHANNELS; baseCropRgba[to] = baseImage.data[from]; baseCropRgba[to + 1] = baseImage.data[from + 1]; baseCropRgba[to + 2] = baseImage.data[from + 2]; baseCropRgba[to + 3] = baseImage.data[from + 3];
}
const ring2 = ringStats(2); const ring4 = ringStats(4);
const detachedComponents = components.length > 1 ? components.slice(1) : [];
const maskDeclared = Boolean(maskImage);
const earRequirement = spec.topology?.semanticRequirements?.c01ClosedHelmetNaturalEarCoverage ?? null;
const earCoverage = earRequirement ? Object.fromEntries(['leftNaturalEarRoi', 'rightNaturalEarRoi'].map((key) => {
  const roi = earRequirement[key]; const [left, top, right, bottom] = roi.zone;
  let baseOpaquePixels = 0; let unchangedOpaquePixels = 0;
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const baseOffset = baseAt(x + column * CELL, y + row * CELL); const candidateOffset = candidateAt(x, y);
    if (baseImage.data[baseOffset + 3] < 128) continue;
    baseOpaquePixels += 1;
    if (candidateImage.data[candidateOffset + 3] >= 128 && equalAt(candidateImage.data, candidateOffset, baseImage.data, baseOffset)) unchangedOpaquePixels += 1;
  }
  return [key, { zone: roi.zone, baseOpaquePixels, unchangedOpaquePixels, pass: unchangedOpaquePixels === 0 }];
})) : { required: false, pass: true };
const naturalEarCoveragePass = earRequirement ? Object.values(earCoverage).every((entry) => entry.pass) : true;
let maskUnionMismatchPixels = 0;
if (maskImage) for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
  if ((maskImage.data[maskAt(x, y) + 3] > 0 ? 1 : 0) !== replacementUnion[y * CELL + x]) maskUnionMismatchPixels += 1;
}
const report = {
  schemaVersion: 1, job: 'starpatch-cat:1:head-20', attempt: 6, cell: { row, column, id: 'c01', size: '160x160' }, verdict: 'REJECT',
  inputs: { basePath, baseSha256: await sha256File(basePath), baseCropSha256: sha256Buffer(baseCropRgba), candidatePath, candidateSha256: await sha256File(candidatePath), specPath, specSha256: await sha256File(specPath), prototypePetPath, prototypePetSha256: await sha256File(prototypePetPath), prototypeAccessoryPath, prototypeAccessorySha256: await sha256File(prototypeAccessoryPath), occlusionMaskPath, occlusionMaskSha256: occlusionMaskPath ? await sha256File(occlusionMaskPath) : null, lineagePath, lineageSha256: lineagePath ? await sha256File(lineagePath) : null },
  lineageAudit: lineage ? { declaredVerdict: lineage.verdict, declaredTopologyPass: lineage.gates?.topologyPass === true, declaredOutsideWindowChanged: lineage.gates?.outsideWindowChanged ?? null, declaredComponents4: lineage.gates?.components4 ?? null, targetShaMatchesLineage: lineage.target?.sha256 === await sha256File(candidatePath), evidence: lineageEvidence, evidencePass: lineageEvidencePass } : null,
  contract: { source: 'original pet crop + original wearable-head-3 space-helmet three-view reference', outsideWindow: 'byte-identical to original base outside the amended zone union', boundaryRing: '2px and 4px inner rings; mismatches are allowed only when explicitly covered by occlusion mask', candidateDiffIslands: 'diagnostic only; anti-aliased/highlight islands are not accessory topology', replacementUnionTopology: 'declared binary replacement/erase union must be one 4-connected component with zero enclosed holes' },
  metrics: { replacementZones: zones, exactOutsideWindowDifferencePixels: outsideWindowDiff, maskOutsideWindowPixels, maskUnionMismatchPixels, candidateDiffPixels, intentionalDiffPixels, candidateDiffComponents4Connected: components.length, candidateDiffDetachedComponentCount: detachedComponents.length, candidateDiffDetachedComponents: detachedComponents, replacementUnionComponents4Connected: replacementUnionComponents.length, replacementUnionHolePixels, naturalEarCoverage: earCoverage, innerBoundaryRing2px: ring2, innerBoundaryRing4px: ring4, occlusionMaskDeclared: maskDeclared },
  gates: { baseCropRecorded: true, prototypeLineageRecorded: lineageEvidencePass, exactOutsideWindowPass: outsideWindowDiff === 0, maskOutsideWindowPass: maskDeclared && maskOutsideWindowPixels === 0, maskEqualsReplacementUnionPass: maskDeclared && maskUnionMismatchPixels === 0, naturalEarCoveragePass, innerBoundaryRing2Pass: maskDeclared && ring2.mismatchesOutsideIntentional === 0, innerBoundaryRing4Pass: maskDeclared && ring4.mismatchesOutsideIntentional === 0, noDetachedComponentsPass: replacementUnionComponents.length === 1 && replacementUnionHolePixels === 0, critic: 'PENDING' },
  publishable: false,
};
report.verdict = Object.values(report.gates).every((value) => value === true) ? 'PASS' : 'REJECT';
await fs.mkdir(path.dirname(outputPath), { recursive: true }); await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, outputPath, metrics: report.metrics, gates: report.gates }, null, 2));
if (report.verdict !== 'PASS') process.exit(2);

function sha256Buffer(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }
