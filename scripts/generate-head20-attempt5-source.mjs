/**
 * Build an independent head-20 full-redraw source from the original inbox art.
 *
 * This is intentionally not a mask/composite recovery script: it reads only
 * the original pet/accessory art and the shipped base atlas.  The base atlas
 * supplies the locked non-head bytes; the three original helmet views supply
 * the replacement artwork.  No prior head-20 target, layer, mask, or proof is
 * an input.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const ROOT = process.cwd();
const originalPetPath = path.resolve(ROOT, 'art-inbox/pet-starpatch-cat-1.png');
const originalAccessoryPath = path.resolve(ROOT, 'art-inbox/wearable-head-3.png');
const basePath = path.resolve(ROOT, 'pet-app/public/assets/art/sprites/starpatch-cat-1-atlas-2737c2cd0c.webp');
const outputDir = path.resolve(ROOT, 'artifacts/head20-attempt5-source');
const outputPath = path.join(outputDir, 'head-20-attempt5-independent-full-redraw.png');
const lineagePath = path.join(outputDir, 'head-20-attempt5-lineage.json');

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const CHANNELS = 4;
const originalAccessory = await sharp(originalAccessoryPath).raw().toBuffer({ resolveWithObject: true });
const originalPetMeta = await sharp(originalPetPath).metadata();
const accessoryMeta = await sharp(originalAccessoryPath).metadata();
const baseMeta = await sharp(basePath).metadata();
if (originalPetMeta.width !== 4096 || originalPetMeta.height !== 4096 || originalPetMeta.channels !== 4 || !originalPetMeta.hasAlpha) {
  throw new Error('original pet source must be 4096x4096 RGBA');
}
if (accessoryMeta.width !== 4096 || accessoryMeta.height !== 4096 || accessoryMeta.channels !== 4 || !accessoryMeta.hasAlpha) {
  throw new Error('original accessory source must be 4096x4096 RGBA');
}
if (baseMeta.width !== WIDTH || baseMeta.height !== HEIGHT) throw new Error('base atlas must be 800x640');

const sha256 = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');

// Locate the three large helmet assemblies in the bottom row of the original
// accessory sheet.  Their pixels, not any previous generated layer, are used.
const { data, info } = originalAccessory;
const sourceW = info.width;
const sourceH = info.height;
const pixelCount = sourceW * sourceH;
const occupied = new Uint8Array(pixelCount);
for (let i = 0, p = 3; i < pixelCount; i += 1, p += CHANNELS) occupied[i] = data[p] > 10 ? 1 : 0;
const seen = new Uint8Array(pixelCount);
const queue = new Int32Array(pixelCount);
const components = [];
for (let index = 0; index < pixelCount; index += 1) {
  if (!occupied[index] || seen[index]) continue;
  let head = 0;
  let tail = 0;
  let count = 0;
  let minX = sourceW;
  let minY = sourceH;
  let maxX = -1;
  let maxY = -1;
  queue[tail++] = index;
  seen[index] = 1;
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
  if (count > 100000 && minY > 2200 && minX > 2000) components.push({ count, bbox: [minX, minY, maxX + 1, maxY + 1] });
}
components.sort((left, right) => left.bbox[0] - right.bbox[0]);
if (components.length !== 3) throw new Error(`expected 3 original helmet assemblies, found ${components.length}`);

const refs = [];
for (const component of components) {
  const [left, top, right, bottom] = component.bbox;
  const width = right - left;
  const height = bottom - top;
  const raw = await sharp(originalAccessoryPath).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  refs.push({ ...component, width, height, raw: raw.data });
}

const base = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const target = Buffer.from(base.data);
const baseWindows = [];
const placementPlans = [];
const topologyResults = [];

// Placement is intentionally explicit and cell-local.  These are helmet
// replacement windows; no placement touches the locked tail/body/bowl bytes.
const planFor = (cell) => {
  const row = Math.floor(cell / 5);
  const col = cell % 5;
  if (row === 0) return { reference: 0, width: 122, height: 128, x: 19, y: 0 };
  if (row === 1) return { reference: 1, width: 115, height: 127, x: 43, y: 0 };
  if (row === 2) return { reference: 2, width: 126, height: 123, x: 17, y: 0 };
  if (cell === 17) return { reference: 1, width: 114, height: 113, x: 38, y: 9 };
  if (cell === 18) return { reference: 1, width: 116, height: 105, x: 8, y: 29 };
  return { reference: 0, width: 122, height: 128, x: 19, y: 0 };
};

const alphaAt = (rgba, width, x, y) => rgba[(y * width + x) * CHANNELS + 3];
const analyzeTopology = (rgba, width, height) => {
  const occupied = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) occupied[y * width + x] = alphaAt(rgba, width, x, y) >= 128 ? 1 : 0;
  }
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let components = 0;
  for (let index = 0; index < occupied.length; index += 1) {
    if (!occupied[index] || visited[index]) continue;
    components += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = index;
    visited[index] = 1;
    while (head < tail) {
      const current = queue[head++];
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [];
      if (x > 0) neighbors.push(current - 1);
      if (x + 1 < width) neighbors.push(current + 1);
      if (y > 0) neighbors.push(current - width);
      if (y + 1 < height) neighbors.push(current + width);
      for (const next of neighbors) {
        if (occupied[next] && !visited[next]) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
  }
  const outside = new Uint8Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (index) => {
    if (index < 0 || index >= occupied.length || occupied[index] || outside[index]) return;
    outside[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) { enqueue(x); enqueue((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) {
    const current = queue[head++];
    const x = current % width;
    const y = Math.floor(current / width);
    const neighbors = [];
    if (x > 0) neighbors.push(current - 1);
    if (x + 1 < width) neighbors.push(current + 1);
    if (y > 0) neighbors.push(current - width);
    if (y + 1 < height) neighbors.push(current + width);
    for (const next of neighbors) enqueue(next);
  }
  let enclosedTransparent = 0;
  for (let index = 0; index < occupied.length; index += 1) {
    if (!occupied[index] && !outside[index]) enclosedTransparent += 1;
  }
  return { components4: components, enclosedTransparentPixels: enclosedTransparent, pass: components === 1 && enclosedTransparent === 0 };
};
const sourceOver = (dst, at, src) => {
  const sa = src[3] / 255;
  if (sa <= 0) return;
  const da = dst[at + 3] / 255;
  const outA = sa + da * (1 - sa);
  for (let channel = 0; channel < 3; channel += 1) {
    dst[at + channel] = Math.round((src[channel] * sa + dst[at + channel] * da * (1 - sa)) / outA);
  }
  dst[at + 3] = Math.round(outA * 255);
};

for (let cell = 0; cell < 20; cell += 1) {
  const plan = planFor(cell);
  const ref = refs[plan.reference];
  const resized = await sharp(ref.raw, { raw: { width: ref.width, height: ref.height, channels: CHANNELS } })
    .resize(plan.width, plan.height, { fit: 'fill', kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const row = Math.floor(cell / 5);
  const col = cell % 5;
  const window = { row, column: col, x: plan.x, y: plan.y, width: plan.width, height: plan.height };
  baseWindows.push(window);
  placementPlans.push({ ...window, reference: plan.reference, referenceBBox: refs[plan.reference].bbox });
  topologyResults.push({ cell: cell + 1, reference: plan.reference, ...analyzeTopology(resized.data, plan.width, plan.height) });
  for (let y = 0; y < plan.height; y += 1) {
    for (let x = 0; x < plan.width; x += 1) {
      const srcAt = (y * plan.width + x) * CHANNELS;
      const dstX = col * CELL + plan.x + x;
      const dstY = row * CELL + plan.y + y;
      if (dstX < 0 || dstX >= WIDTH || dstY < 0 || dstY >= HEIGHT) continue;
      sourceOver(target, (dstY * WIDTH + dstX) * CHANNELS, resized.data.subarray(srcAt, srcAt + CHANNELS));
    }
  }
}

const outsideWindowChanged = [];
for (let row = 0; row < 4; row += 1) {
  for (let col = 0; col < 5; col += 1) {
    const cell = row * 5 + col;
    const w = baseWindows[cell];
    let changed = 0;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        if (x >= w.x && x < w.x + w.width && y >= w.y && y < w.y + w.height) continue;
        const at = ((row * CELL + y) * WIDTH + col * CELL + x) * CHANNELS;
        for (let channel = 0; channel < CHANNELS; channel += 1) {
          if (target[at + channel] !== base.data[at + channel]) { changed += 1; break; }
        }
      }
    }
    outsideWindowChanged.push(changed);
  }
}

await fs.mkdir(outputDir, { recursive: true });
await sharp(target, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(outputPath);
const exactBodyLock = outsideWindowChanged.every((count) => count === 0);
const topologyPass = topologyResults.every((result) => result.pass);
const lineage = {
  schemaVersion: 1,
  attempt: 5,
  verdict: exactBodyLock && topologyPass ? 'SOURCE_STRUCTURAL_PASS' : exactBodyLock ? 'REJECT_HELMET_TOPOLOGY' : 'REJECT_OUTSIDE_WINDOW_DRIFT',
  sourcePolicy: {
    originalPet: { path: path.relative(ROOT, originalPetPath).replaceAll('\\', '/'), sha256: await sha256(originalPetPath), metadata: originalPetMeta },
    originalAccessory: { path: path.relative(ROOT, originalAccessoryPath).replaceAll('\\', '/'), sha256: await sha256(originalAccessoryPath), metadata: accessoryMeta },
    baseAtlas: { path: path.relative(ROOT, basePath).replaceAll('\\', '/'), sha256: await sha256(basePath), metadata: baseMeta },
    forbiddenInputs: ['head-20-dressed-atlas-v2', 'body-lock diagnostics', 'masks', 'composites', 'prior generated layers'],
  },
  target: { path: path.relative(ROOT, outputPath).replaceAll('\\', '/'), sha256: await sha256(outputPath), width: WIDTH, height: HEIGHT, channels: 4, hasAlpha: true },
  geometry: { columns: 5, rows: 4, cellWidth: CELL, cellHeight: CELL, transformedBaseBytesOutsideWindows: false },
  placementPlans,
  outsideWindowChanged,
  semanticPreGate: { helmetAssemblyTopology: topologyPass ? 'PASS_ONE_HOLE_FREE_4_CONNECTED_PER_CELL' : 'REJECT', topologyResults, exactBodyByteLock: exactBodyLock },
};
await fs.writeFile(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`);
console.log(JSON.stringify(lineage, null, 2));
