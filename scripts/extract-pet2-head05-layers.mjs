import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const basePath = path.join(root, 'pet-app', 'art-source', 'imagegen', 'baked-wearables', 'cat', 'pet-starpatch-cat-2.png');
const targetPath = path.join(root, 'pet-app', 'art-source', 'imagegen', 'baked-wearables', 'cat', 'head-05', 'head-05-pet2-dressed-atlas-v1-4096.png');
const outputDir = path.join(root, 'pet-app', 'art-source', 'imagegen', 'baked-wearables', 'cat', 'head-05', 'layers-pet2-v1');
await fs.mkdir(outputDir, { recursive: true });

const baseRaw = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const targetRaw = await sharp(targetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = baseRaw.info.width, H = baseRaw.info.height, C = 4, count = W * H;
if (W !== targetRaw.info.width || H !== targetRaw.info.height) throw new Error('base/target dimensions differ');
const base = baseRaw.data, target = targetRaw.data;
const rearMask = new Uint8Array(count), frontSeed = new Uint8Array(count), frontMask = new Uint8Array(count);

const isRed = (r, g, b) => r > 115 && r > g * 1.76 && r > b * 1.48;
const isNeutralHat = (r, g, b) => {
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  return (max > 128 && max - min < 48 && b >= r - 24) || (b > r + 3 && b > g + 2);
};

// Label the 20 actual sprite silhouettes.  The generated antialiasing can cross
// theoretical 5x4 grid boundaries by one pixel, so grid rectangles are not a
// reliable semantic boundary.
const labels = new Uint8Array(count), seen = new Uint8Array(count), components = [];
for (let seed = 0; seed < count; seed += 1) {
  if (seen[seed] || target[seed * C + 3] < 24) continue;
  const label = components.length + 1;
  seen[seed] = 1; labels[seed] = label;
  const queue = [seed];
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let q = 0; q < queue.length; q += 1) {
    const p = queue[q], x = p % W, y = Math.floor(p / W);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    const neighbors = [x ? p - 1 : -1, x + 1 < W ? p + 1 : -1, y ? p - W : -1, y + 1 < H ? p + W : -1];
    for (const next of neighbors) if (next >= 0 && !seen[next] && target[next * C + 3] >= 24) {
      seen[next] = 1; labels[next] = label; queue.push(next);
    }
  }
  components.push({ label, pixelCount: queue.length, bounds: [minX, minY, maxX, maxY] });
}
if (components.length !== 20) throw new Error(`expected 20 dressed sprites, found ${components.length}`);

const cells = [];
for (let index = 0; index < components.length; index += 1) {
  const component = components[index], [minX, minY, maxX, maxY] = component.bounds;
  const spriteHeight = maxY - minY + 1;
  const headBottom = minY + Math.floor(spriteHeight * 0.52);
  let redMinX = maxX, redMinY = maxY, redMaxX = minX, redMaxY = minY, redPixels = 0;
  for (let y = minY; y <= headBottom; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const p = y * W + x, i = p * C;
    if (labels[p] === component.label && isRed(target[i], target[i + 1], target[i + 2])) {
      frontSeed[p] = 1; redPixels += 1;
      redMinX = Math.min(redMinX, x); redMinY = Math.min(redMinY, y); redMaxX = Math.max(redMaxX, x); redMaxY = Math.max(redMaxY, y);
    }
  }
  if (!redPixels) throw new Error(`no chef-red seed in component ${index + 1}`);
  const crownX0 = Math.max(minX, redMinX - 70), crownX1 = Math.min(maxX, redMaxX + 70);
  const crownY1 = Math.min(headBottom, redMaxY + 6);
  for (let y = minY; y <= crownY1; y += 1) for (let x = crownX0; x <= crownX1; x += 1) {
    const p = y * W + x, i = p * C;
    if (labels[p] !== component.label || frontSeed[p]) continue;
    if (isNeutralHat(target[i], target[i + 1], target[i + 2])) rearMask[p] = 1;
  }
  cells.push({ row: Math.floor(index / 5), col: index % 5, spriteBounds: component.bounds, redBounds: [redMinX, redMinY, redMaxX, redMaxY], redPixels });
}

// Expand the red seed just enough to include the gold badge, bow outlines, and
// anti-aliased band edge.  Restrict it to opaque target pixels near each seed.
let wave = new Uint8Array(frontSeed);
for (let iteration = 0; iteration < 7; iteration += 1) {
  const next = new Uint8Array(wave);
  for (let p = 0; p < count; p += 1) if (wave[p]) {
    const x = p % W, y = Math.floor(p / W);
    if (x) next[p - 1] = 1;
    if (x + 1 < W) next[p + 1] = 1;
    if (y) next[p - W] = 1;
    if (y + 1 < H) next[p + W] = 1;
  }
  wave = next;
}
for (let p = 0; p < count; p += 1) if (wave[p] && target[p * C + 3] >= 12) frontMask[p] = 1;

// Prevent the front-band expansion from absorbing orange ear/fur interiors.
// Direct red pixels are always retained; neighboring neutral/gold/dark outline
// pixels are retained, but saturated orange pet pixels are not.
for (let p = 0; p < count; p += 1) if (frontMask[p] && !frontSeed[p]) {
  const i = p * C, r = target[i], g = target[i + 1], b = target[i + 2];
  const gold = r > 145 && g > 75 && g < 178 && b < 88;
  const neutral = Math.max(r, g, b) - Math.min(r, g, b) < 58;
  const darkOutline = Math.max(r, g, b) < 115;
  if (!gold && !neutral && !darkOutline) frontMask[p] = 0;
}

// Remove front pixels from the rear layer; retain a small overlap only through
// normal alpha compositing at anti-aliased edges.
for (let p = 0; p < count; p += 1) if (frontSeed[p]) rearMask[p] = 0;

const rear = Buffer.alloc(count * C), front = Buffer.alloc(count * C);
let rearPixels = 0, frontPixels = 0;
for (let p = 0; p < count; p += 1) {
  const i = p * C;
  if (rearMask[p]) {
    rear[i] = target[i]; rear[i + 1] = target[i + 1]; rear[i + 2] = target[i + 2]; rear[i + 3] = target[i + 3]; rearPixels += 1;
  }
  if (frontMask[p]) {
    front[i] = target[i]; front[i + 1] = target[i + 1]; front[i + 2] = target[i + 2]; front[i + 3] = target[i + 3]; frontPixels += 1;
  }
}

const rawOptions = { raw: { width: W, height: H, channels: C } };
const rearPng = await sharp(rear, rawOptions).png().toBuffer();
const frontPng = await sharp(front, rawOptions).png().toBuffer();
const basePng = await sharp(base, rawOptions).png().toBuffer();
const compositePng = await sharp({ create: { width: W, height: H, channels: 4, background: '#00000000' } })
  .composite([{ input: rearPng }, { input: basePng }, { input: frontPng }])
  .png().toBuffer();
const composite = (await sharp(compositePng).raw().toBuffer({ resolveWithObject: true })).data;

const rearMaskRgba = Buffer.alloc(count * C), frontMaskRgba = Buffer.alloc(count * C), diff = Buffer.alloc(count * C);
let fullTargetMismatchPixels = 0, changedOutsideVisibleLayer = 0;
for (let p = 0; p < count; p += 1) {
  const i = p * C;
  if (rearMask[p]) rearMaskRgba.fill(255, i, i + 4);
  if (frontMask[p]) frontMaskRgba.fill(255, i, i + 4);
  const delta = Math.max(Math.abs(composite[i] - target[i]), Math.abs(composite[i + 1] - target[i + 1]), Math.abs(composite[i + 2] - target[i + 2]), Math.abs(composite[i + 3] - target[i + 3]));
  if (delta > 8) {
    fullTargetMismatchPixels += 1;
    diff[i] = 255; diff[i + 1] = Math.max(0, 220 - delta); diff[i + 2] = 0; diff[i + 3] = 230;
  }
  const visibleLayer = front[i + 3] > 0 || (rear[i + 3] > 0 && base[i + 3] === 0);
  if (!visibleLayer && (composite[i] !== base[i] || composite[i + 1] !== base[i + 1] || composite[i + 2] !== base[i + 2] || composite[i + 3] !== base[i + 3])) changedOutsideVisibleLayer += 1;
}

const files = {
  rear: path.join(outputDir, 'head-05-rear.png'),
  front: path.join(outputDir, 'head-05-front.png'),
  rearMask: path.join(outputDir, 'head-05-rear-mask.png'),
  frontMask: path.join(outputDir, 'head-05-front-mask.png'),
  composite: path.join(outputDir, 'head-05-composite-on-original-pet.png'),
  fullRedrawDiff: path.join(outputDir, 'head-05-full-redraw-difference.png'),
  proof: path.join(outputDir, 'head-05-layer-proof.png'),
  report: path.join(outputDir, 'head-05-layer-report.json'),
};
await Promise.all([
  fs.writeFile(files.rear, rearPng), fs.writeFile(files.front, frontPng),
  sharp(rearMaskRgba, rawOptions).png().toFile(files.rearMask), sharp(frontMaskRgba, rawOptions).png().toFile(files.frontMask),
  fs.writeFile(files.composite, compositePng), sharp(diff, rawOptions).png().toFile(files.fullRedrawDiff),
]);

const tileSize = 768;
const proofSources = [basePath, targetPath, files.rear, files.front, files.composite, files.fullRedrawDiff];
const proofLabels = ['ORIGINAL PET', 'FULL REDRAW', 'REAR LAYER', 'FRONT LAYER', 'ZERO-TRANSFORM COMPOSITE', 'DIFF VS FULL REDRAW'];
const proofLayers = [];
for (let k = 0; k < proofSources.length; k += 1) {
  const tile = await sharp(proofSources[k]).resize(tileSize, tileSize).png().toBuffer();
  const left = (k % 3) * tileSize, top = Math.floor(k / 3) * tileSize;
  proofLayers.push({ input: tile, left, top });
  proofLayers.push({ input: Buffer.from(`<svg width="${tileSize}" height="44"><rect width="100%" height="44" fill="#111827dd"/><text x="18" y="30" font-family="Arial" font-size="22" font-weight="700" fill="white">${proofLabels[k]}</text></svg>`), left, top });
}
await sharp({ create: { width: tileSize * 3, height: tileSize * 2, channels: 4, background: '#382f31ff' } })
  .composite(proofLayers).png().toFile(files.proof);

const report = {
  id: 'head-05', dimensions: [W, H], grid: [5, 4],
  base: basePath, fullRedraw: targetPath,
  layers: { rearPixels, frontPixels, eraseMaskRequired: false },
  checks: { changedOutsideVisibleLayer, fullTargetMismatchPixels, note: 'Full redraw also changes pet pixels; zero-transform composite intentionally preserves original pet outside visible accessory layers.' },
  cells, files,
};
await fs.writeFile(files.report, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
