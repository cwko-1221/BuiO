/** Independent critic for the c01 v2 semantic replacement pack. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseArg, targetArg, maskArg, patchArg, compositeArg, specArg, lineageArg, tailEvidenceArg, outputArg] = process.argv.slice(2);
if ([baseArg, targetArg, maskArg, patchArg, compositeArg, specArg, lineageArg, tailEvidenceArg, outputArg].some((v) => !v)) {
  console.error('usage: node scripts/critic-head20-c01-v2-semantic-pack.mjs <base160> <target160> <union-mask> <patch> <composite> <spec> <lineage> <tail-evidence> <output>');
  process.exit(1);
}
const resolve = (p) => path.resolve(p);
const [basePath, targetPath, maskPath, patchPath, compositePath, specPath, lineagePath, tailEvidencePath, outputPath] = [baseArg, targetArg, maskArg, patchArg, compositeArg, specArg, lineageArg, tailEvidenceArg, outputArg].map(resolve);
const SIZE = 160; const RGBA = 4; const PIXELS = SIZE * SIZE; const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const read = async (p) => sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const sha256File = async (p) => crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const [base, target, mask, patch, composite] = await Promise.all([basePath, targetPath, maskPath, patchPath, compositePath].map(read));
for (const [label, image] of [['base', base], ['target', target], ['mask', mask], ['patch', patch], ['composite', composite]]) {
  if (image.info.width !== SIZE || image.info.height !== SIZE || image.info.channels !== RGBA) throw new Error(`${label} must be 160x160 RGBA`);
}
const spec = JSON.parse(await fs.readFile(specPath, 'utf8')); const lineage = JSON.parse(await fs.readFile(lineagePath, 'utf8')); const tailEvidence = JSON.parse(await fs.readFile(tailEvidencePath, 'utf8'));
const zones = [
  ...(spec.topology?.replacementZones ?? []), ...(spec.topology?.replacementExtensions ?? []),
].filter((entry) => entry.row === 0 && entry.column === 0 && Array.isArray(entry.zone)).map((entry) => entry.zone);
const inZone = (x, y) => zones.some(([left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom);
const equal = (a, b, at) => a[at] === b[at] && a[at + 1] === b[at + 1] && a[at + 2] === b[at + 2] && a[at + 3] === b[at + 3];
const alphaBinary = new Uint8Array(PIXELS); for (let i = 0; i < PIXELS; i += 1) alphaBinary[i] = mask.data[i * RGBA + 3] > 0 ? 1 : 0;
const countComponents = (binary) => { const seen = new Uint8Array(PIXELS); const sizes = []; for (let seed = 0; seed < PIXELS; seed += 1) { if (seen[seed] || !binary[seed]) continue; const q = [seed]; seen[seed] = 1; for (let head = 0; head < q.length; head += 1) { const local = q[head]; const x = local % SIZE; const y = Math.floor(local / SIZE); for (const [dx, dy] of DIR4) { const nx = x + dx; const ny = y + dy; if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue; const next = ny * SIZE + nx; if (!seen[next] && binary[next]) { seen[next] = 1; q.push(next); } } } sizes.push(q.length); } return sizes; };
const components = countComponents(alphaBinary);
const bgSeen = new Uint8Array(PIXELS); const bgQueue = []; const pushBg = (x, y) => { const i = y * SIZE + x; if (alphaBinary[i] || bgSeen[i]) return; bgSeen[i] = 1; bgQueue.push(i); };
for (let x = 0; x < SIZE; x += 1) { pushBg(x, 0); pushBg(x, SIZE - 1); }
for (let y = 0; y < SIZE; y += 1) { pushBg(0, y); pushBg(SIZE - 1, y); }
for (let head = 0; head < bgQueue.length; head += 1) { const local = bgQueue[head]; const x = local % SIZE; const y = Math.floor(local / SIZE); for (const [dx, dy] of DIR4) { const nx = x + dx; const ny = y + dy; if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) pushBg(nx, ny); } }
let holes = 0; for (let i = 0; i < PIXELS; i += 1) if (!alphaBinary[i] && !bgSeen[i]) holes += 1;
let unionMismatch = 0; let outsideTargetDiff = 0; let maskOutside = 0; let patchOutside = 0; let patchTransparentRgb = 0; let compositeMismatch = 0;
const reconstructed = Buffer.from(base.data);
for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
  const at = (y * SIZE + x) * RGBA; const should = inZone(x, y); const hasMask = mask.data[at + 3] > 0;
  if ((should ? 1 : 0) !== (hasMask ? 1 : 0)) unionMismatch += 1;
  if (!should && !equal(target.data, base.data, at)) outsideTargetDiff += 1;
  if (!should && hasMask) maskOutside += 1;
  if (!should && patch.data[at + 3] > 0) patchOutside += 1;
  if (patch.data[at + 3] === 0 && (patch.data[at] || patch.data[at + 1] || patch.data[at + 2])) patchTransparentRgb += 1;
  if (should) { reconstructed[at] = 0; reconstructed[at + 1] = 0; reconstructed[at + 2] = 0; reconstructed[at + 3] = 0; reconstructed[at] = patch.data[at]; reconstructed[at + 1] = patch.data[at + 1]; reconstructed[at + 2] = patch.data[at + 2]; reconstructed[at + 3] = patch.data[at + 3]; }
  if (!equal(reconstructed, target.data, at)) compositeMismatch += 1;
}
const earRequirement = spec.topology?.semanticRequirements?.c01ClosedHelmetNaturalEarCoverage;
const earCoverage = Object.fromEntries(['leftNaturalEarRoi', 'rightNaturalEarRoi'].map((id) => {
  const [left, top, right, bottom] = earRequirement[id].zone; let unchangedOpaquePixels = 0; let baseOpaquePixels = 0;
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) { const at = (y * SIZE + x) * RGBA; if (base.data[at + 3] < 128) continue; baseOpaquePixels += 1; if (target.data[at + 3] >= 128 && equal(target.data, base.data, at)) unchangedOpaquePixels += 1; }
  return [id, { zone: earRequirement[id].zone, baseOpaquePixels, unchangedOpaquePixels, pass: unchangedOpaquePixels === 0 }];
}));
const raw = lineage.rawFullRedrawSource; const gen = lineage.generation; const norm = lineage.normalization; const mapping = lineage.sourceToCandidateMapping; const forbidden = lineage.forbiddenInputProof;
const provenance = {
  rawSource: Boolean(raw?.path && raw?.sha256 && raw?.width && raw?.height && raw?.channels),
  rawSourceExists: Boolean(raw?.path && await fs.stat(path.resolve(raw.path)).then(() => true).catch(() => false)),
  generation: [gen?.model, gen?.prompt, gen?.timestamp].every((v) => typeof v === 'string' && v.length > 0 && !/^PENDING(?:_|$)/.test(v)),
  normalization: Boolean(norm?.steps && norm?.sourceSha256 && norm?.outputSha256),
  mapping: Boolean(mapping?.method),
  forbiddenInputProof: Boolean(forbidden?.notOldTarget && forbidden?.notComposite && forbidden?.notMask),
};
const provenancePass = Object.values(provenance).every(Boolean);
const report = {
  schemaVersion: 1, job: 'starpatch-cat:1:head-20', attempt: 6, cell: 'c01', version: 'c01-v2',
  independent: true, inputs: { basePath, targetPath, maskPath, patchPath, compositePath, targetSha256: await sha256File(targetPath), maskSha256: await sha256File(maskPath) },
  semanticUnion: { zones, pixels: alphaBinary.reduce((sum, value) => sum + value, 0), components4: components.length, componentSizes: components, holePixels: holes, matchesSpecPixels: unionMismatch === 0 },
  exactness: { outsideTargetDiffPixels: outsideTargetDiff, maskOutsideUnionPixels: maskOutside, patchOutsideUnionPixels: patchOutside, transparentPatchRgbPixels: patchTransparentRgb, reconstructedCompositeMismatchPixels: compositeMismatch },
  earCoverage, tailProtection: { verdict: tailEvidence.verdict, pixels: tailEvidence.pixels, bounds: tailEvidence.bounds, rightEarIntersectionPixels: tailEvidence.rightEarIntersectionPixels, bodyIntersectionPixels: tailEvidence.bodyIntersectionPixels },
  provenance, 
  candidateDiffIslands: 'not used as topology gate; semantic union is the topology gate',
  verdict: components.length === 1 && holes === 0 && unionMismatch === 0 && outsideTargetDiff === 0 && maskOutside === 0 && patchOutside === 0 && patchTransparentRgb === 0 && compositeMismatch === 0 && Object.values(earCoverage).every((v) => v.pass) && tailEvidence.verdict === 'PASS_TIGHT_TAIL_MASK' && provenancePass ? 'PASS' : 'REJECT',
  blocker: 'right-ear coverage and/or independent raw generation provenance' , publishable: false,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true }); await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); console.log(JSON.stringify(report, null, 2));
if (report.verdict !== 'PASS') process.exit(2);
