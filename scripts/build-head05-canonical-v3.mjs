import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [v2Path, basePath, v3Path, lineagePath, compositeRoot] = process.argv.slice(2);
if (!v2Path || !basePath || !v3Path || !lineagePath || !compositeRoot) {
  console.error('usage: node scripts/build-head05-canonical-v3.mjs <v2-target> <base> <v3-target> <lineage-json> <scan-root>');
  process.exit(1);
}
const WIDTH = 800; const HEIGHT = 640; const CHANNELS = 4;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  return result.data;
};
const shaFile = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const repairs = [
  [0, 2, 98, 70], [0, 2, 99, 70], [0, 2, 100, 70], [0, 2, 100, 71], [0, 2, 101, 71],
  [0, 3, 100, 70], [0, 3, 101, 70],
].map(([row, column, localX, localY]) => ({ row, column, localX, localY, globalX: column * 160 + localX, globalY: row * 160 + localY }));
const [v2, base] = await Promise.all([read(v2Path), read(basePath)]);
const v3 = Buffer.from(v2);
for (const { globalX, globalY } of repairs) {
  const at = (globalY * WIDTH + globalX) * CHANNELS;
  base.copy(v3, at, at, at + CHANNELS);
}
await sharp(v3, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(v3Path);
const decoded = await read(v3Path);
const intended = new Set(repairs.map(({ globalX, globalY }) => globalY * WIDTH + globalX));
let decodedChangedPixels = 0; let unexpectedChangedPixels = 0; let intendedUnchangedPixels = 0;
for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
  const at = pixel * CHANNELS;
  const changed = v2[at] !== decoded[at] || v2[at + 1] !== decoded[at + 1] || v2[at + 2] !== decoded[at + 2] || v2[at + 3] !== decoded[at + 3];
  if (changed) decodedChangedPixels += 1;
  if (changed && !intended.has(pixel)) unexpectedChangedPixels += 1;
  if (!changed && intended.has(pixel)) intendedUnchangedPixels += 1;
}
const repairedToExactBasePixels = repairs.filter(({ globalX, globalY }) => {
  const at = (globalY * WIDTH + globalX) * CHANNELS;
  return decoded[at] === base[at] && decoded[at + 1] === base[at + 1] && decoded[at + 2] === base[at + 2] && decoded[at + 3] === base[at + 3];
}).length;
const walk = async (directory) => {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await walk(absolute)); else result.push(absolute);
  }
  return result;
};
const v3Hash = await shaFile(v3Path); const v2Hash = await shaFile(v2Path); const baseHash = await shaFile(basePath);
const earlierCompositePaths = (await walk(compositeRoot)).filter((input) => /head-05.*composite.*\.png$/i.test(path.basename(input)));
const earlierCompositeHashes = [];
for (const input of earlierCompositePaths) earlierCompositeHashes.push({ path: input, sha256: await shaFile(input) });
const earlierCompositeHashMatches = earlierCompositeHashes.filter(({ sha256 }) => sha256 === v3Hash);
const stat = await fs.stat(v3Path);
const pass = decodedChangedPixels === repairs.length && unexpectedChangedPixels === 0 && intendedUnchangedPixels === 0
  && repairedToExactBasePixels === repairs.length && v3Hash !== v2Hash && earlierCompositeHashMatches.length === 0;
const lineage = {
  verdict: pass ? 'PASS' : 'REJECT',
  role: 'immutable locked dressed-art target authored before canonical-v3 production extraction',
  inputs: { v2Path, basePath, sha256: { v2: v2Hash, base: baseHash } },
  output: { v3Path, sha256: v3Hash, birthtimeUtc: stat.birthtime.toISOString(), mtimeUtc: stat.mtime.toISOString() },
  geometry: { canvas: '800x640', transformed: false },
  repairPixels: repairs,
  verification: { requestedRepairPixels: repairs.length, decodedChangedPixels, unexpectedChangedPixels, intendedUnchangedPixels, repairedToExactBasePixels, v3HashDiffersFromV2: v3Hash !== v2Hash, earlierCompositeFilesScanned: earlierCompositeHashes.length, earlierCompositeHashMatches },
};
await fs.mkdir(path.dirname(lineagePath), { recursive: true });
await fs.writeFile(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`);
console.log(JSON.stringify(lineage, null, 2));
if (!pass) process.exitCode = 2;
