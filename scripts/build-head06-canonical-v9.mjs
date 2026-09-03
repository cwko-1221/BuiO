import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [v8Path, basePath, v9Path, reportPath] = process.argv.slice(2);
if (!v8Path || !basePath || !v9Path || !reportPath) {
  console.error('usage: node scripts/build-head06-canonical-v9.mjs <v8-target> <base> <v9-target> <lineage-report>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const CHANNELS = 4;
const corrections = [
  { index: 3, row: 0, column: 2, points: [[20, 72]] },
  { index: 4, row: 0, column: 3, points: [[26, 72]] },
  { index: 9, row: 1, column: 3, points: [[136, 80]] },
  { index: 10, row: 1, column: 4, points: [[51, 81]] },
  { index: 14, row: 2, column: 3, points: [[37, 86], [38, 86]] },
  { index: 16, row: 3, column: 0, points: [[104, 16], [105, 16], [104, 17], [105, 17], [106, 17], [138, 88]] },
  { index: 17, row: 3, column: 1, points: [[109, 23]] },
  { index: 19, row: 3, column: 3, points: [[31, 83], [31, 84], [30, 85]] },
  { index: 20, row: 3, column: 4, points: [[23, 44]] },
];

const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  return image.data;
};
const hashFile = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const hashPixels = (data) => crypto.createHash('sha256').update(data).digest('hex');

const [v8, base] = await Promise.all([read(v8Path), read(basePath)]);
const v9 = Buffer.from(v8);
const changed = [];
for (const correction of corrections) {
  for (const [localX, localY] of correction.points) {
    const x = correction.column * CELL + localX;
    const y = correction.row * CELL + localY;
    const at = (y * WIDTH + x) * CHANNELS;
    const before = Array.from(v9.subarray(at, at + CHANNELS));
    const replacement = Array.from(base.subarray(at, at + CHANNELS));
    replacement.forEach((value, channel) => { v9[at + channel] = value; });
    changed.push({ ...correction, points: undefined, localX, localY, x, y, before, replacement });
  }
}

await sharp(v9, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(v9Path);
const reread = await read(v9Path);
let decodedDifferencePixelsFromV8 = 0;
let unexpectedDifferencePixels = 0;
const intended = new Set(changed.map(({ x, y }) => y * WIDTH + x));
for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
  const at = pixel * CHANNELS;
  const differs = reread[at] !== v8[at]
    || reread[at + 1] !== v8[at + 1]
    || reread[at + 2] !== v8[at + 2]
    || reread[at + 3] !== v8[at + 3];
  if (differs) decodedDifferencePixelsFromV8 += 1;
  if (differs && !intended.has(pixel)) unexpectedDifferencePixels += 1;
}
const [v8Stat, v9Stat] = await Promise.all([fs.stat(v8Path), fs.stat(v9Path)]);
const report = {
  verdict: decodedDifferencePixelsFromV8 === changed.length && unexpectedDifferencePixels === 0 ? 'PASS' : 'REJECT',
  lineage: {
    source: v8Path,
    basePatchSource: basePath,
    output: v9Path,
    sourceBirthtimeUtc: v8Stat.birthtime.toISOString(),
    sourceMtimeUtc: v8Stat.mtime.toISOString(),
    outputBirthtimeUtc: v9Stat.birthtime.toISOString(),
    outputMtimeUtc: v9Stat.mtime.toISOString(),
    sourceSha256: await hashFile(v8Path),
    outputSha256: await hashFile(v9Path),
    sourceDecodedPixelSha256: hashPixels(v8),
    outputDecodedPixelSha256: hashPixels(reread),
    byteIdenticalToV8: (await hashFile(v8Path)) === (await hashFile(v9Path)),
    decodedPixelIdenticalToV8: hashPixels(v8) === hashPixels(reread),
  },
  correctionCount: changed.length,
  decodedDifferencePixelsFromV8,
  unexpectedDifferencePixels,
  corrections: changed,
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

