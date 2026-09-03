import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [v1Path, basePath, v2Path, lineagePath, compositeRoot] = process.argv.slice(2);
if (!v1Path || !basePath || !v2Path || !lineagePath || !compositeRoot) {
  console.error('usage: node scripts/build-head05-canonical-v2.mjs <v1-target> <base> <v2-target> <lineage-json> <scan-root>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CHANNELS = 4;
const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  return image.data;
};
const sha256Buffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const sha256File = async (input) => sha256Buffer(await fs.readFile(input));

// Exact pixels reported by canonical-v1 extraction QA. These are component
// members, not rectangular guesses.
const repairs = [
  ...[[46, 79], [47, 79], [46, 80], [48, 79], [47, 80], [45, 80], [46, 81], [49, 79], [48, 80], [47, 81], [45, 81], [46, 82], [48, 81], [47, 82], [45, 82], [46, 83], [48, 82]]
    .map(([x, y]) => ({ row: 2, column: 2, localX: x, localY: y })),
  ...Array.from({ length: 11 }, (_, offset) => ({ row: 2, column: 3, localX: 30, localY: 28 + offset })),
].map((repair) => ({
  ...repair,
  globalX: repair.column * 160 + repair.localX,
  globalY: repair.row * 160 + repair.localY,
}));

const [v1, base] = await Promise.all([read(v1Path), read(basePath)]);
const v2 = Buffer.from(v1);
for (const repair of repairs) {
  const at = (repair.globalY * WIDTH + repair.globalX) * CHANNELS;
  base.copy(v2, at, at, at + CHANNELS);
}
await sharp(v2, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(v2Path);

const decodedV2 = await read(v2Path);
const intended = new Set(repairs.map(({ globalX, globalY }) => globalY * WIDTH + globalX));
const changed = [];
let unexpectedChangedPixels = 0;
let intendedUnchangedPixels = 0;
for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
  const at = pixel * CHANNELS;
  const differs = v1[at] !== decodedV2[at]
    || v1[at + 1] !== decodedV2[at + 1]
    || v1[at + 2] !== decodedV2[at + 2]
    || v1[at + 3] !== decodedV2[at + 3];
  if (differs) changed.push(pixel);
  if (differs && !intended.has(pixel)) unexpectedChangedPixels += 1;
  if (!differs && intended.has(pixel)) intendedUnchangedPixels += 1;
}
const repairedToExactBasePixels = repairs.filter(({ globalX, globalY }) => {
  const at = (globalY * WIDTH + globalX) * CHANNELS;
  return decodedV2[at] === base[at] && decodedV2[at + 1] === base[at + 1]
    && decodedV2[at + 2] === base[at + 2] && decodedV2[at + 3] === base[at + 3];
}).length;

const listFiles = async (directory) => {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(absolute));
    else files.push(absolute);
  }
  return files;
};
const v2Hash = await sha256File(v2Path);
const earlierCompositePaths = (await listFiles(compositeRoot))
  .filter((input) => /head-05.*composite.*\.png$/i.test(path.basename(input)))
  .filter((input) => path.resolve(input) !== path.resolve(v2Path));
const earlierCompositeHashes = [];
for (const input of earlierCompositePaths) earlierCompositeHashes.push({ path: input, sha256: await sha256File(input) });
const earlierCompositeHashMatches = earlierCompositeHashes.filter(({ sha256 }) => sha256 === v2Hash);
const stat = await fs.stat(v2Path);
const v1Hash = await sha256File(v1Path);
const baseHash = await sha256File(basePath);
const pass = changed.length === repairs.length
  && unexpectedChangedPixels === 0
  && intendedUnchangedPixels === 0
  && repairedToExactBasePixels === repairs.length
  && v2Hash !== v1Hash
  && earlierCompositeHashMatches.length === 0;

const lineage = {
  verdict: pass ? 'PASS' : 'REJECT',
  role: 'immutable locked dressed-art target authored before canonical-v2 production extraction',
  inputs: { v1Path, basePath, sha256: { v1: v1Hash, base: baseHash } },
  output: {
    v2Path,
    sha256: v2Hash,
    birthtimeUtc: stat.birthtime.toISOString(),
    mtimeUtc: stat.mtime.toISOString(),
  },
  geometry: { canvas: '800x640', transformed: false },
  repairPixels: repairs,
  verification: {
    requestedRepairPixels: repairs.length,
    decodedChangedPixels: changed.length,
    unexpectedChangedPixels,
    intendedUnchangedPixels,
    repairedToExactBasePixels,
    v2HashDiffersFromV1: v2Hash !== v1Hash,
    earlierCompositeFilesScanned: earlierCompositeHashes.length,
    earlierCompositeHashMatches,
  },
};
await fs.mkdir(path.dirname(lineagePath), { recursive: true });
await fs.writeFile(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`);
console.log(JSON.stringify(lineage, null, 2));
if (!pass) process.exitCode = 2;
