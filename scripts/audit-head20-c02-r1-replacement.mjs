/** Independent mechanical audit for head-20 c02/r1.  Read-only inputs. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseArg, targetArg, maskArg, layerArg, lineageArg, tailArg, earExtensionArg, petArg, accessoryArg, outputArg] = process.argv.slice(2);
if ([baseArg, targetArg, maskArg, layerArg, lineageArg, tailArg, earExtensionArg, petArg, accessoryArg, outputArg].some((value) => !value)) {
  throw new Error('usage: node scripts/audit-head20-c02-r1-replacement.mjs <base> <target> <mask> <layer> <lineage> <tail-mask> <ear-extension> <pet> <accessory> <output>');
}
const resolve = (value) => path.resolve(value); const SIZE = 160; const CH = 4; const PIXELS = SIZE * SIZE;
const paths = Object.fromEntries(Object.entries({ baseArg, targetArg, maskArg, layerArg, lineageArg, tailArg, earExtensionArg, petArg, accessoryArg, outputArg }).map(([key, value]) => [key.replace('Arg', ''), resolve(value)]));
const sha256 = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
const read = async (filePath, label) => {
  const image = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== SIZE || image.info.height !== SIZE || image.info.channels !== CH) throw new Error(`${label} must be 160x160 RGBA`);
  return image.data;
};
const [base, target, mask, layer, tail, extension] = await Promise.all([
  read(paths.base, 'base'), read(paths.target, 'target'), read(paths.mask, 'mask'), read(paths.layer, 'layer'), read(paths.tail, 'tail mask'), read(paths.earExtension, 'ear extension'),
]);
const lineage = JSON.parse(await fs.readFile(paths.lineage, 'utf8'));
const offset = (pixel) => pixel * CH;
const equals = (left, right, at) => left[at] === right[at] && left[at + 1] === right[at + 1] && left[at + 2] === right[at + 2] && left[at + 3] === right[at + 3];
const active = (image, pixel) => image[offset(pixel) + 3] > 0;
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const maskBinary = new Uint8Array(PIXELS);
for (let pixel = 0; pixel < PIXELS; pixel += 1) maskBinary[pixel] = active(mask, pixel) ? 1 : 0;
const connectedComponents = (binary) => {
  const seen = new Uint8Array(PIXELS); const sizes = [];
  for (let seed = 0; seed < PIXELS; seed += 1) {
    if (!binary[seed] || seen[seed]) continue;
    const queue = [seed]; seen[seed] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const cell = queue[cursor]; const x = cell % SIZE; const y = Math.floor(cell / SIZE);
      for (const [dx, dy] of dirs) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
        const next = ny * SIZE + nx;
        if (binary[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    sizes.push(queue.length);
  }
  return sizes;
};
const enclosedHoles = (binary) => {
  const reached = new Uint8Array(PIXELS); const queue = [];
  const push = (x, y) => { const cell = y * SIZE + x; if (!binary[cell] && !reached[cell]) { reached[cell] = 1; queue.push(cell); } };
  for (let x = 0; x < SIZE; x += 1) { push(x, 0); push(x, SIZE - 1); }
  for (let y = 0; y < SIZE; y += 1) { push(0, y); push(SIZE - 1, y); }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const cell = queue[cursor]; const x = cell % SIZE; const y = Math.floor(cell / SIZE);
    for (const [dx, dy] of dirs) { const nx = x + dx; const ny = y + dy; if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) push(nx, ny); }
  }
  let holes = 0; for (let cell = 0; cell < PIXELS; cell += 1) if (!binary[cell] && !reached[cell]) holes += 1;
  return holes;
};
const insideNative = (x, y) => x >= 36 && x < 134 && y >= 5 && y < 127;
const allowed = new Uint8Array(PIXELS);
for (let cell = 0; cell < PIXELS; cell += 1) { const x = cell % SIZE; const y = Math.floor(cell / SIZE); allowed[cell] = insideNative(x, y) || active(extension, cell) ? 1 : 0; }
const bodyChest = new Uint8Array(PIXELS); const raisedPaw = new Uint8Array(PIXELS);
for (let cell = 0; cell < PIXELS; cell += 1) {
  const x = cell % SIZE; const y = Math.floor(cell / SIZE);
  if (base[offset(cell) + 3] === 0) continue;
  if (y >= 101) bodyChest[cell] = 1;
  if (x >= 59 && x < 106 && y >= 91) raisedPaw[cell] = 1;
}
let maskPixels = 0; let outsideAllowed = 0; let layerMaskSupportMismatch = 0; let targetOutsideMask = 0;
let tailIntersection = 0; let bodyChestIntersection = 0; let raisedPawIntersection = 0; let transparentLayerRgb = 0;
for (let cell = 0; cell < PIXELS; cell += 1) {
  const at = offset(cell); const hasMask = Boolean(maskBinary[cell]); const hasLayer = active(layer, cell);
  if (hasMask) { maskPixels += 1; if (!allowed[cell]) outsideAllowed += 1; if (active(tail, cell)) tailIntersection += 1; if (bodyChest[cell]) bodyChestIntersection += 1; if (raisedPaw[cell]) raisedPawIntersection += 1; }
  if (hasMask !== hasLayer) layerMaskSupportMismatch += 1;
  if (!hasMask && !equals(base, target, at)) targetOutsideMask += 1;
  if (!hasLayer && (layer[at] !== 0 || layer[at + 1] !== 0 || layer[at + 2] !== 0)) transparentLayerRgb += 1;
}
const sourceOver = (destination, source, at) => {
  const sa = source[at + 3] / 255; const da = destination[at + 3] / 255; const oa = sa + da * (1 - sa);
  if (oa <= 0) return [0, 0, 0, 0];
  const channel = (index) => Math.round((source[at + index] * sa + destination[at + index] * da * (1 - sa)) / oa);
  return [channel(0), channel(1), channel(2), Math.round(oa * 255)];
};
const reconstructed = Buffer.from(base);
for (let cell = 0; cell < PIXELS; cell += 1) {
  if (!maskBinary[cell]) continue;
  const at = offset(cell); reconstructed[at] = 0; reconstructed[at + 1] = 0; reconstructed[at + 2] = 0; reconstructed[at + 3] = 0;
  const composited = sourceOver(reconstructed, layer, at);
  reconstructed[at] = composited[0]; reconstructed[at + 1] = composited[1]; reconstructed[at + 2] = composited[2]; reconstructed[at + 3] = composited[3];
}
let exactCompositeMismatch = 0;
for (let cell = 0; cell < PIXELS; cell += 1) if (!equals(reconstructed, target, offset(cell))) exactCompositeMismatch += 1;
const [baseHash, targetHash, maskHash, layerHash, tailHash, extensionHash, petHash, accessoryHash, rawHash] = await Promise.all([
  sha256(paths.base), sha256(paths.target), sha256(paths.mask), sha256(paths.layer), sha256(paths.tail), sha256(paths.earExtension), sha256(paths.pet), sha256(paths.accessory), sha256(lineage.rawFullRedrawSource.path),
]);
const hashesFreeze = lineage.frozenArtifactHashes ?? {};
const provenance = {
  rawSourceExistsAndHash: rawHash === lineage.rawFullRedrawSource.sha256 && Array.isArray(lineage.rawFullRedrawSource.dimensions) && lineage.rawFullRedrawSource.dimensions.join('x') === '1254x1254x3',
  generationDetails: [lineage.generation?.model, lineage.generation?.prompt, lineage.generation?.timestamp].every((value) => typeof value === 'string' && value.length > 0),
  originalPetPrototype: petHash === lineage.originalPrototypeLineage?.pet?.sha256,
  originalAccessoryPrototype: accessoryHash === lineage.originalPrototypeLineage?.accessory?.sha256,
  forbiddenInputs: lineage.forbiddenInputProof?.c01TargetMaskLayerComposite === 'NOT_READ' && lineage.forbiddenInputProof?.oldV2 === 'NOT_READ' && lineage.forbiddenInputProof?.r3bR4R5 === 'NOT_READ',
  frozenCandidateHashes: targetHash === hashesFreeze.target && maskHash === hashesFreeze.mask && layerHash === hashesFreeze.layer && tailHash === hashesFreeze.tail && extensionHash === hashesFreeze.earExtension,
};
provenance.pass = Object.values(provenance).every((value) => value === true);
const components = connectedComponents(maskBinary); const holes = enclosedHoles(maskBinary);
const gates = {
  provenance: provenance.pass,
  maskNonempty: maskPixels > 0,
  maskOneFourConnectedComponent: components.length === 1,
  maskNoEnclosedHoles: holes === 0,
  maskInsideNativePlusMeasuredEarExtension: outsideAllowed === 0,
  maskLayerSupportExact: layerMaskSupportMismatch === 0,
  tailProtection: tailIntersection === 0,
  bodyChestProtection: bodyChestIntersection === 0,
  raisedPawProtection: raisedPawIntersection === 0,
  targetUnchangedOutsideActualMask: targetOutsideMask === 0,
  transparentLayerRgbClean: transparentLayerRgb === 0,
  exactSameCoordinateEraseSourceOver: exactCompositeMismatch === 0,
  visualCritic: 'PENDING',
};
const mechanicalPass = Object.entries(gates).filter(([key]) => key !== 'visualCritic').every(([, value]) => value === true);
const report = {
  schemaVersion: 1, independent: true, job: 'starpatch-cat:1:head-20', attempt: 6, cell: 'c02', revision: 'r1',
  contract: 'actual mask only; base -> erase(actual mask) -> source-over(layer), no transforms; native zone plus measured ear-extension are containment permissions only',
  inputs: { baseHash, targetHash, maskHash, layerHash, tailHash, extensionHash, petHash, accessoryHash, rawHash, lineagePath: paths.lineage },
  provenance,
  metrics: { maskPixels, components4Connected: components.length, componentSizes: components, enclosedHolePixels: holes, maskOutsideAllowedPixels: outsideAllowed, layerMaskSupportMismatchPixels: layerMaskSupportMismatch, tailIntersectionPixels: tailIntersection, bodyChestIntersectionPixels: bodyChestIntersection, raisedPawIntersectionPixels: raisedPawIntersection, targetDifferenceOutsideActualMaskPixels: targetOutsideMask, transparentLayerRgbPixels: transparentLayerRgb, exactRgbaMismatchPixels: exactCompositeMismatch },
  gates, mechanicalVerdict: mechanicalPass ? 'PASS' : 'REJECT', verdict: mechanicalPass ? 'PASS_MASK_COMPOSITE_PENDING_INDEPENDENT_VISUAL_CRITIC' : 'REJECT', publishable: false,
};
await fs.writeFile(paths.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, output: paths.output, metrics: report.metrics, gates }, null, 2));
if (!mechanicalPass) process.exitCode = 2;
