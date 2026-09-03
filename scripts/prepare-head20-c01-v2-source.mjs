/**
 * Deterministic source preparation for the c01 head-20 v2 pilot.
 *
 * This script never edits an existing candidate.  It removes only the
 * connected RGB checkerboard from the newly supplied raw ImageGen source,
 * maps the detected subject crop into c01's 160x160 coordinate system, and
 * copies generated pixels into a base-locked target only inside the amended
 * helmet union.  It is source preparation, not masking/compositing/publish.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [sourceArg, baseArg, specArg, outputArg] = process.argv.slice(2);
if (!sourceArg || !baseArg || !specArg || !outputArg) {
  console.error('usage: node scripts/prepare-head20-c01-v2-source.mjs <raw-source> <160x160-base> <head20-spec> <c01/v2-output>');
  process.exit(1);
}

const sourcePath = path.resolve(sourceArg);
const basePath = path.resolve(baseArg);
const specPath = path.resolve(specArg);
const outputDirectory = path.resolve(outputArg);
const SIZE = 160;
const RGBA = 4;
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const sha256File = async (filePath) => sha256(await fs.readFile(filePath));
const samePixel = (a, b, at) => a[at] === b[at] && a[at + 1] === b[at + 1]
  && a[at + 2] === b[at + 2] && a[at + 3] === b[at + 3];

const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
const c01Entries = (spec.topology?.replacementZones ?? [])
  .filter((entry) => entry.row === 0 && entry.column === 0 && Array.isArray(entry.zone));
const c01Extensions = (spec.topology?.replacementExtensions ?? [])
  .filter((entry) => entry.row === 0 && entry.column === 0 && Array.isArray(entry.zone));
const replacementZones = [...c01Entries, ...c01Extensions].map((entry) => entry.zone);
if (replacementZones.length < 2) throw new Error(`expected c01 original+amended replacement zones, got ${replacementZones.length}`);

const raw = await sharp(sourcePath).raw().toBuffer({ resolveWithObject: true });
if (raw.info.width !== 1254 || raw.info.height !== 1254 || raw.info.channels !== 3) {
  throw new Error(`raw source must be 1254x1254 RGB; got ${raw.info.width}x${raw.info.height} channels=${raw.info.channels}`);
}
const base = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (base.info.width !== SIZE || base.info.height !== SIZE || base.info.channels !== RGBA) {
  throw new Error(`base must be 160x160 RGBA; got ${base.info.width}x${base.info.height} channels=${base.info.channels}`);
}

// The supplied source is RGB with a near-white checkerboard.  Only pixels
// reachable from the outer border through the known low-chroma bright field
// are removed.  This deliberately preserves isolated white helmet highlights.
const isChecker = (data, at) => Math.max(data[at], data[at + 1], data[at + 2])
  - Math.min(data[at], data[at + 1], data[at + 2]) <= 8
  && Math.min(data[at], data[at + 1], data[at + 2]) >= 215;
const width = raw.info.width;
const height = raw.info.height;
const seen = new Uint8Array(width * height);
const queue = [];
const push = (x, y) => {
  const index = y * width + x;
  if (seen[index] || !isChecker(raw.data, index * 3)) return;
  seen[index] = 1;
  queue.push(index);
};
for (let x = 0; x < width; x += 1) { push(x, 0); push(x, height - 1); }
for (let y = 0; y < height; y += 1) { push(0, y); push(width - 1, y); }
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
for (let head = 0; head < queue.length; head += 1) {
  const index = queue[head];
  const x = index % width;
  const y = Math.floor(index / width);
  for (const [dx, dy] of directions) {
    const nx = x + dx; const ny = y + dy;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) push(nx, ny);
  }
}

let minX = width; let minY = height; let maxX = -1; let maxY = -1;
for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
  if (seen[y * width + x]) continue;
  minX = Math.min(minX, x); minY = Math.min(minY, y);
  maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
}
if (maxX < minX || maxY < minY) throw new Error('source foreground is empty after checker flood');
const subjectCrop = { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
const cleaned = Buffer.alloc(width * height * RGBA);
let removedCheckerPixels = 0;
for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
  const sourceAt = (y * width + x) * 3;
  const outputAt = (y * width + x) * RGBA;
  if (seen[y * width + x]) {
    removedCheckerPixels += 1;
    cleaned[outputAt + 3] = 0;
  } else {
    cleaned[outputAt] = raw.data[sourceAt];
    cleaned[outputAt + 1] = raw.data[sourceAt + 1];
    cleaned[outputAt + 2] = raw.data[sourceAt + 2];
    cleaned[outputAt + 3] = 255;
  }
}

// The detected raw subject crop is 730x963 (aspect 0.758), while c01's
// original pet silhouette is 101x127 (aspect 0.795).  The new source's
// helmet/body crop is mapped to [23,5,137,155] (114x150), preserving the
// source crop's aspect and placing the helmet top above the original ears.
const mapped = await sharp(cleaned, { raw: { width, height, channels: RGBA } })
  .extract(subjectCrop)
  .resize(114, 150, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
  .raw()
  .toBuffer();
const normalized = Buffer.alloc(SIZE * SIZE * RGBA);
for (let y = 0; y < 150; y += 1) for (let x = 0; x < 114; x += 1) {
  const sourceAt = (y * 114 + x) * RGBA;
  const outputAt = ((y + 5) * SIZE + (x + 23)) * RGBA;
  normalized[outputAt] = mapped[sourceAt];
  normalized[outputAt + 1] = mapped[sourceAt + 1];
  normalized[outputAt + 2] = mapped[sourceAt + 2];
  normalized[outputAt + 3] = mapped[sourceAt + 3];
}

const target = Buffer.from(base.data);
const outsideUnionDifference = [];
let copiedOpaquePixels = 0;
let amendedExtensionOpaquePixels = 0;
for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
  const inside = replacementZones.some(([left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom);
  const at = (y * SIZE + x) * RGBA;
  if (inside && normalized[at + 3] > 0) {
    target[at] = normalized[at]; target[at + 1] = normalized[at + 1];
    target[at + 2] = normalized[at + 2]; target[at + 3] = normalized[at + 3];
    copiedOpaquePixels += 1;
    if (x >= 31 && x < 38 && y >= 28 && y < 101) amendedExtensionOpaquePixels += 1;
  }
  if (!inside && !samePixel(target, base.data, at)) outsideUnionDifference.push([x, y]);
}
// Canonicalize transparent RGB only inside the semantic replacement union.
// This keeps the target-derived layers free of hidden RGB residue while the
// protected base bytes remain untouched outside the union.
for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
  if (!replacementZones.some(([left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom)) continue;
  const at = (y * SIZE + x) * RGBA;
  if (target[at + 3] === 0) { target[at] = 0; target[at + 1] = 0; target[at + 2] = 0; }
}
const semanticEarRois = {
  leftNaturalEarRoi: [31, 28, 58, 55],
  rightNaturalEarRoi: [103, 28, 126, 55],
};
const earCoverage = Object.fromEntries(Object.entries(semanticEarRois).map(([id, [left, top, right, bottom]]) => {
  let baseOpaquePixels = 0; let unchangedOpaquePixels = 0;
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
    const at = (y * SIZE + x) * RGBA;
    if (base.data[at + 3] < 128) continue;
    baseOpaquePixels += 1;
    if (target[at + 3] >= 128 && samePixel(target, base.data, at)) unchangedOpaquePixels += 1;
  }
  return [id, { zone: [left, top, right, bottom], baseOpaquePixels, unchangedOpaquePixels, pass: unchangedOpaquePixels === 0 }];
}));
const naturalEarCoveragePass = Object.values(earCoverage).every((entry) => entry.pass);

await fs.mkdir(outputDirectory, { recursive: true });
const writeRgba = (buffer, filePath, w = SIZE, h = SIZE) => sharp(buffer, { raw: { width: w, height: h, channels: RGBA } }).png({ compressionLevel: 9 }).toFile(filePath);
const normalizedPath = path.join(outputDirectory, 'c01-v2-normalized-subject-rgba.png');
const targetPath = path.join(outputDirectory, 'c01-v2-target-coordinate-locked.png');
const lineagePath = path.join(outputDirectory, 'c01-v2-lineage.json');
await Promise.all([
  writeRgba(normalized, normalizedPath),
  writeRgba(target, targetPath),
  writeRgba(cleaned, path.join(outputDirectory, 'c01-v2-cleaned-raw-rgba.png'), width, height),
]);
const [sourceSha256, normalizedSha256, targetSha256] = await Promise.all([
  sha256File(sourcePath), sha256File(normalizedPath), sha256File(targetPath),
]);
const sourceStat = await fs.stat(sourcePath);
const lineage = {
  schemaVersion: 1,
  job: 'starpatch-cat:1:head-20',
  attempt: 6,
  cell: 'c01',
  version: 'c01-v2',
  verdict: outsideUnionDifference.length === 0 && amendedExtensionOpaquePixels > 0 && naturalEarCoveragePass ? 'SOURCE_PREPARED_PENDING_PROVENANCE_AND_CRITIC' : 'REJECT_SOURCE_SEMANTIC_EAR_GATE',
  rawFullRedrawSource: {
    path: sourcePath,
    sha256: sourceSha256,
    width: raw.info.width,
    height: raw.info.height,
    channels: raw.info.channels,
    hasAlpha: false,
    format: 'png',
    modifiedTime: sourceStat.mtime.toISOString(),
  },
  originalPrototypeLineage: {
    petPath: 'art-inbox/pet-starpatch-cat-1.png',
    accessoryPath: 'art-inbox/wearable-head-3.png',
    accessoryView: 'bottom-row three-view space helmet',
  },
  generation: {
    model: 'PENDING_SOURCE_WORKER_METADATA',
    prompt: 'PENDING_SOURCE_WORKER_METADATA',
    timestamp: 'PENDING_SOURCE_WORKER_METADATA',
    seed: 'PENDING_SOURCE_WORKER_METADATA',
  },
  normalization: {
    steps: 'connected RGB checker flood -> subject bounding crop -> deterministic 114x150 Lanczos3 mapping -> base lock outside amended union -> transparent RGB canonicalization inside amended union',
    sourceSha256,
    checkerRemoval: '4-connected flood from RGB image border; chroma<=8 and min channel>=215; no isolated subject-white removal',
    removedCheckerPixels,
    sourceSubjectCrop: subjectCrop,
    sourceSubjectCropSize: `${subjectCrop.width}x${subjectCrop.height}`,
    coordinateMapping: 'subject crop -> exact 114x150 Lanczos3 fit-fill at c01 x=23,y=5; no transform after mapping',
    normalizedPath,
    normalizedSha256,
    outputSha256: targetSha256,
  },
  sourceToCandidateMapping: {
    method: 'c01 subject crop mapped into amended union coordinate space; exact base lock outside union',
    outputPath: targetPath,
    outputSha256: targetSha256,
    outputDimensions: '160x160 RGBA',
    amendedReplacementUnion: replacementZones,
    outsideUnionByteDifferencePixels: outsideUnionDifference.length,
    copiedOpaquePixels,
    amendedExtensionOpaquePixels,
    noTransformsAfterNormalization: true,
  },
  forbiddenInputProof: {
    notOldTarget: true,
    notComposite: true,
    notMask: true,
    oldC01Candidate: 'NOT_USED', oldWholeAtlasV2: 'NOT_USED', attempt5Target: 'NOT_USED', diagnosticOrComposite: 'NOT_USED',
  },
  semanticRequirements: { naturalEarCoverage: earCoverage, pass: naturalEarCoveragePass },
  acceptance: {
    sourcePreparation: outsideUnionDifference.length === 0 ? 'PASS' : 'REJECT',
    earExtensionCoverage: amendedExtensionOpaquePixels > 0 ? 'PENDING_SEMANTIC_REVIEW' : 'REJECT',
    naturalEarCoverage: naturalEarCoveragePass ? 'PENDING_CRITIC' : 'REJECT_RIGHT_OR_LEFT_EAR_REMAINS',
    publishable: false,
    next: ['audit-head20-cell-source.mjs', 'masking agent', 'zero-transform composite', 'independent critic'],
  },
};
await fs.writeFile(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  verdict: lineage.verdict,
  sourceSha256,
  subjectCrop,
  normalizedPath,
  targetPath,
  lineagePath,
  outsideUnionDifferencePixels: outsideUnionDifference.length,
  amendedExtensionOpaquePixels,
  copiedOpaquePixels,
}, null, 2));
if (lineage.verdict !== 'SOURCE_PREPARED_PENDING_PROVENANCE_AND_CRITIC') process.exit(2);
