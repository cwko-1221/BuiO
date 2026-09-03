/** Build only the c1 full-redraw source for head-20 from inbox originals. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const ROOT = process.cwd();
const petPath = path.resolve(ROOT, 'art-inbox/pet-starpatch-cat-1.png');
const accessoryPath = path.resolve(ROOT, 'art-inbox/wearable-head-3.png');
const basePath = path.resolve(ROOT, 'pet-app/public/assets/art/sprites/starpatch-cat-1-atlas-2737c2cd0c.webp');
const outDir = path.resolve(ROOT, 'artifacts/head20-attempt6-per-cell/c01');
const baseCropPath = path.join(outDir, 'c01-base-original-160x160.png');
const referencePath = path.join(outDir, 'c01-original-helmet-front-reference.png');
const targetPath = path.join(outDir, 'c01-target-independent-full-redraw-v2.png');
const occlusionMaskPath = path.join(outDir, 'c01-intentional-occlusion-mask-v2.png');
const lineagePath = path.join(outDir, 'c01-lineage-v2.json');
const WIDTH = 160;
const HEIGHT = 160;
const CHANNELS = 4;
const sha256 = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');

const petMeta = await sharp(petPath).metadata();
const accessoryMeta = await sharp(accessoryPath).metadata();
const baseMeta = await sharp(basePath).metadata();
if (petMeta.width !== 4096 || petMeta.height !== 4096 || petMeta.channels !== 4 || !petMeta.hasAlpha) throw new Error('inbox pet must be 4096x4096 RGBA');
if (accessoryMeta.width !== 4096 || accessoryMeta.height !== 4096 || accessoryMeta.channels !== 4 || !accessoryMeta.hasAlpha) throw new Error('inbox accessory must be 4096x4096 RGBA');
if (baseMeta.width !== 800 || baseMeta.height !== 640 || baseMeta.channels !== 4 || !baseMeta.hasAlpha) throw new Error('game base must be 800x640 RGBA');

await fs.mkdir(outDir, { recursive: true });
const baseCell = await sharp(basePath).extract({ left: 0, top: 0, width: WIDTH, height: HEIGHT }).ensureAlpha().png().toBuffer();
await fs.writeFile(baseCropPath, baseCell);
const baseRaw = await sharp(baseCell).raw().toBuffer({ resolveWithObject: true });

// Locate the original bottom-row front helmet assembly without consulting any
// previous target, layer, mask, diagnostic, or composite.
const accessoryRaw = await sharp(accessoryPath).raw().toBuffer({ resolveWithObject: true });
const sourceW = accessoryRaw.info.width;
const sourceH = accessoryRaw.info.height;
const N = sourceW * sourceH;
const occupied = new Uint8Array(N);
for (let i = 0, p = 3; i < N; i += 1, p += CHANNELS) occupied[i] = accessoryRaw.data[p] > 10 ? 1 : 0;
const seen = new Uint8Array(N);
const queue = new Int32Array(N);
let front = null;
for (let start = 0; start < N; start += 1) {
  if (!occupied[start] || seen[start]) continue;
  let head = 0;
  let tail = 0;
  let count = 0;
  let minX = sourceW;
  let minY = sourceH;
  let maxX = -1;
  let maxY = -1;
  queue[tail++] = start;
  seen[start] = 1;
  while (head < tail) {
    const current = queue[head++];
    const x = current % sourceW;
    const y = Math.floor(current / sourceW);
    count += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    const neighbors = [];
    if (x > 0) neighbors.push(current - 1);
    if (x + 1 < sourceW) neighbors.push(current + 1);
    if (y > 0) neighbors.push(current - sourceW);
    if (y + 1 < sourceH) neighbors.push(current + sourceW);
    for (const next of neighbors) {
      if (occupied[next] && !seen[next]) {
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
  }
  if (count > 300000 && minX > 2000 && minY > 2200) {
    const candidate = { count, bbox: [minX, minY, maxX + 1, maxY + 1] };
    if (!front || candidate.bbox[0] < front.bbox[0]) front = candidate;
  }
}
if (!front) throw new Error('original front helmet assembly not found');
const [left, top, right, bottom] = front.bbox;
const referenceRaw = await sharp(accessoryPath).extract({ left, top, width: right - left, height: bottom - top }).raw().toBuffer({ resolveWithObject: true });
await sharp(referenceRaw.data, { raw: { width: referenceRaw.info.width, height: referenceRaw.info.height, channels: CHANNELS } }).png().toFile(referencePath);

// c1 frozen helmet window.  The prior collar was visually rejected because it
// exposed natural pink ear pixels.  The new target intentionally owns the
// entire declared window, while bytes outside it remain immutable.
const helmetWindow = { x: 31, y: 5, width: 106, height: 122 };
const continuityCollar = 0;
const inner = {
  x: helmetWindow.x + continuityCollar,
  y: helmetWindow.y + continuityCollar,
  width: helmetWindow.width - continuityCollar * 2,
  height: helmetWindow.height - continuityCollar * 2,
};
const resized = await sharp(referenceRaw.data, { raw: { width: referenceRaw.info.width, height: referenceRaw.info.height, channels: CHANNELS } })
  .resize(inner.width, inner.height, { fit: 'fill', kernel: 'lanczos3' })
  .raw()
  .toBuffer({ resolveWithObject: true });
const target = Buffer.from(baseRaw.data);
for (let y = 0; y < inner.height; y += 1) {
  for (let x = 0; x < inner.width; x += 1) {
    const srcAt = (y * inner.width + x) * CHANNELS;
    const dstAt = ((inner.y + y) * WIDTH + inner.x + x) * CHANNELS;
    const srcA = resized.data[srcAt + 3] / 255;
    if (srcA <= 0) continue;
    const dstA = target[dstAt + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    for (let channel = 0; channel < 3; channel += 1) target[dstAt + channel] = Math.round((resized.data[srcAt + channel] * srcA + target[dstAt + channel] * dstA * (1 - srcA)) / outA);
    target[dstAt + 3] = Math.round(outA * 255);
  }
}
await sharp(target, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(targetPath);

const intentionalOcclusionMask = Buffer.alloc(WIDTH * HEIGHT * CHANNELS, 0);
for (let y = 0; y < inner.height; y += 1) {
  for (let x = 0; x < inner.width; x += 1) {
    const srcAt = (y * inner.width + x) * CHANNELS;
    if (resized.data[srcAt + 3] === 0) continue;
    const dstAt = ((inner.y + y) * WIDTH + inner.x + x) * CHANNELS;
    intentionalOcclusionMask[dstAt] = 255;
    intentionalOcclusionMask[dstAt + 1] = 255;
    intentionalOcclusionMask[dstAt + 2] = 255;
    intentionalOcclusionMask[dstAt + 3] = 255;
  }
}
await sharp(intentionalOcclusionMask, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(occlusionMaskPath);

const samePixel = (a, b, at) => a[at] === b[at] && a[at + 1] === b[at + 1] && a[at + 2] === b[at + 2] && a[at + 3] === b[at + 3];
let outsideWindowChanged = 0;
let collarChanged = 0;
let changedWithoutOcclusionMask = 0;
let maskOutsideWindowPixels = 0;
for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    const at = (y * WIDTH + x) * CHANNELS;
    const maskOn = intentionalOcclusionMask[at + 3] > 0;
    if (maskOn && !(x >= helmetWindow.x && x < helmetWindow.x + helmetWindow.width && y >= helmetWindow.y && y < helmetWindow.y + helmetWindow.height)) maskOutsideWindowPixels += 1;
    if (!samePixel(target, baseRaw.data, at)) {
      if (!(x >= helmetWindow.x && x < helmetWindow.x + helmetWindow.width && y >= helmetWindow.y && y < helmetWindow.y + helmetWindow.height)) outsideWindowChanged += 1;
      if (x >= helmetWindow.x && x < helmetWindow.x + helmetWindow.width && y >= helmetWindow.y && y < helmetWindow.y + helmetWindow.height && !(x >= inner.x && x < inner.x + inner.width && y >= inner.y && y < inner.y + inner.height)) collarChanged += 1;
      if (!maskOn) changedWithoutOcclusionMask += 1;
    }
  }
}

const support = new Uint8Array(inner.width * inner.height);
for (let i = 0; i < support.length; i += 1) support[i] = resized.data[i * CHANNELS + 3] >= 128 ? 1 : 0;
let components4 = 0;
const supportSeen = new Uint8Array(support.length);
const supportQueue = new Int32Array(support.length);
for (let i = 0; i < support.length; i += 1) {
  if (!support[i] || supportSeen[i]) continue;
  components4 += 1;
  let head = 0;
  let tail = 0;
  supportQueue[tail++] = i;
  supportSeen[i] = 1;
  while (head < tail) {
    const current = supportQueue[head++];
    const x = current % inner.width;
    const y = Math.floor(current / inner.width);
    const neighbors = [];
    if (x > 0) neighbors.push(current - 1);
    if (x + 1 < inner.width) neighbors.push(current + 1);
    if (y > 0) neighbors.push(current - inner.width);
    if (y + 1 < inner.height) neighbors.push(current + inner.width);
    for (const next of neighbors) if (support[next] && !supportSeen[next]) { supportSeen[next] = 1; supportQueue[tail++] = next; }
  }
}
const flood = new Uint8Array(support.length);
let head = 0;
let tail = 0;
const enqueue = (index) => { if (index < 0 || index >= support.length || support[index] || flood[index]) return; flood[index] = 1; supportQueue[tail++] = index; };
for (let x = 0; x < inner.width; x += 1) { enqueue(x); enqueue((inner.height - 1) * inner.width + x); }
for (let y = 0; y < inner.height; y += 1) { enqueue(y * inner.width); enqueue(y * inner.width + inner.width - 1); }
while (head < tail) {
  const current = supportQueue[head++];
  const x = current % inner.width;
  const y = Math.floor(current / inner.width);
  if (x > 0) enqueue(current - 1); if (x + 1 < inner.width) enqueue(current + 1); if (y > 0) enqueue(current - inner.width); if (y + 1 < inner.height) enqueue(current + inner.width);
}
let enclosedTransparentPixels = 0;
for (let i = 0; i < support.length; i += 1) if (!support[i] && !flood[i]) enclosedTransparentPixels += 1;

const lineage = {
  schemaVersion: 1,
  attempt: 6,
  cell: 'r0c0',
  verdict: outsideWindowChanged === 0 && collarChanged === 0 && changedWithoutOcclusionMask === 0 && maskOutsideWindowPixels === 0 && components4 === 1 && enclosedTransparentPixels === 0 ? 'SOURCE_SEMANTIC_PASS' : 'REJECT',
  sources: {
    originalPet: { path: path.relative(ROOT, petPath).replaceAll('\\', '/'), sha256: await sha256(petPath), metadata: petMeta },
    originalAccessory: { path: path.relative(ROOT, accessoryPath).replaceAll('\\', '/'), sha256: await sha256(accessoryPath), metadata: accessoryMeta, frontHelmetBBox: front.bbox },
    baseC01: { path: path.relative(ROOT, baseCropPath).replaceAll('\\', '/'), sha256: await sha256(baseCropPath), width: WIDTH, height: HEIGHT, channels: 4, hasAlpha: true },
  },
  target: { path: path.relative(ROOT, targetPath).replaceAll('\\', '/'), sha256: await sha256(targetPath), width: WIDTH, height: HEIGHT, channels: 4, hasAlpha: true },
  intentionalOcclusionMask: { path: path.relative(ROOT, occlusionMaskPath).replaceAll('\\', '/'), sha256: await sha256(occlusionMaskPath), width: WIDTH, height: HEIGHT, channels: 4, hasAlpha: true },
  forbiddenVisualInputs: ['head-20 v2', 'attempt5', 'body-lock diagnostics', 'masks', 'composites', 'prior generated layers'],
  geometry: { helmetWindow, continuityCollar, innerRedrawRect: inner, noResizeOfBase: true },
  gates: { outsideWindowChanged, collarChanged, changedWithoutOcclusionMask, maskOutsideWindowPixels, components4, enclosedTransparentPixels, bodyPoseTailBytesLocked: outsideWindowChanged === 0, topologyPass: components4 === 1 && enclosedTransparentPixels === 0, occlusionMaskPass: changedWithoutOcclusionMask === 0 && maskOutsideWindowPixels === 0 },
};
await fs.writeFile(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`);
console.log(JSON.stringify(lineage, null, 2));
