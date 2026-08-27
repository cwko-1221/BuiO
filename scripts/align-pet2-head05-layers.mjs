import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const catDir = path.join(root, 'pet-app', 'art-source', 'imagegen', 'baked-wearables', 'cat');
const basePath = path.join(catDir, 'pet-starpatch-cat-2.png');
const targetPath = path.join(catDir, 'head-05', 'head-05-pet2-dressed-atlas-v1-4096.png');
const sourceDir = path.join(catDir, 'head-05', 'layers-pet2-v1');
const outputDir = path.join(catDir, 'head-05', 'layers-pet2-v2-aligned');
await fs.mkdir(outputDir, { recursive: true });

const load = async (file) => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const baseRaw = await load(basePath), targetRaw = await load(targetPath);
const rearRaw = await load(path.join(sourceDir, 'head-05-rear.png'));
const frontRaw = await load(path.join(sourceDir, 'head-05-front.png'));
const W = baseRaw.info.width, H = baseRaw.info.height, C = 4, count = W * H;
const rawOptions = { raw: { width: W, height: H, channels: C } };

function labelComponents(data, alphaThreshold = 24, minPixels = 1000) {
  const seen = new Uint8Array(count), labels = new Uint8Array(count), found = [];
  for (let seed = 0; seed < count; seed += 1) {
    if (seen[seed] || data[seed * C + 3] < alphaThreshold) continue;
    seen[seed] = 1;
    const queue = [seed];
    let minX = W, minY = H, maxX = 0, maxY = 0;
    for (let q = 0; q < queue.length; q += 1) {
      const p = queue[q], x = p % W, y = Math.floor(p / W);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      const nexts = [x ? p - 1 : -1, x + 1 < W ? p + 1 : -1, y ? p - W : -1, y + 1 < H ? p + W : -1];
      for (const next of nexts) if (next >= 0 && !seen[next] && data[next * C + 3] >= alphaThreshold) { seen[next] = 1; queue.push(next); }
    }
    if (queue.length >= minPixels) found.push({ pixels: queue, bounds: [minX, minY, maxX, maxY], pixelCount: queue.length });
  }
  found.sort((a, b) => ((a.bounds[1] + a.bounds[3]) - (b.bounds[1] + b.bounds[3])) || ((a.bounds[0] + a.bounds[2]) - (b.bounds[0] + b.bounds[2])));
  found.forEach((component, index) => { component.label = index + 1; for (const p of component.pixels) labels[p] = component.label; });
  return { components: found, labels };
}

function cellKey(bounds) {
  const [minX, minY, maxX, maxY] = bounds;
  return `${Math.max(0, Math.min(3, Math.floor(((minY + maxY) / 2) / (H / 4))))}:${Math.max(0, Math.min(4, Math.floor(((minX + maxX) / 2) / (W / 5))))}`;
}

function lowerMetrics(component, labels) {
  const [minX, minY, maxX, maxY] = component.bounds;
  const startY = maxY - Math.floor((maxY - minY + 1) * 0.43);
  let lowerMinX = maxX, lowerMaxX = minX, lowerMaxY = minY;
  for (let y = startY; y <= maxY; y += 1) for (let x = minX; x <= maxX; x += 1) {
    const p = y * W + x;
    if (labels[p] === component.label) { lowerMinX = Math.min(lowerMinX, x); lowerMaxX = Math.max(lowerMaxX, x); lowerMaxY = Math.max(lowerMaxY, y); }
  }
  return { width: lowerMaxX - lowerMinX + 1, anchorX: (lowerMinX + lowerMaxX) / 2, anchorY: lowerMaxY };
}

const baseInfo = labelComponents(baseRaw.data), targetInfo = labelComponents(targetRaw.data);
if (baseInfo.components.length !== 20 || targetInfo.components.length !== 20) throw new Error(`expected 20 components, base=${baseInfo.components.length}, target=${targetInfo.components.length}`);
const baseByCell = new Map(baseInfo.components.map((component) => [cellKey(component.bounds), component]));
const targetByCell = new Map(targetInfo.components.map((component) => [cellKey(component.bounds), component]));

// Keep only the 20 largest connected rear pieces: the chef crowns.  This drops
// neutral face highlights that the semantic color pass intentionally treated as
// uncertain, before any alignment is applied.
const rearParts = labelComponents(rearRaw.data, 24, 40).components.sort((a, b) => b.pixelCount - a.pixelCount).slice(0, 20);
const rearClean = Buffer.alloc(count * C);
for (const component of rearParts) for (const p of component.pixels) {
  const i = p * C; rearClean[i] = rearRaw.data[i]; rearClean[i + 1] = rearRaw.data[i + 1]; rearClean[i + 2] = rearRaw.data[i + 2]; rearClean[i + 3] = rearRaw.data[i + 3];
}

const alignedRearLayers = [], alignedFrontLayers = [], transforms = [];
for (const [key, targetComponent] of targetByCell) {
  const baseComponent = baseByCell.get(key);
  if (!baseComponent) throw new Error(`missing base component for cell ${key}`);
  const targetMetric = lowerMetrics(targetComponent, targetInfo.labels);
  const baseMetric = lowerMetrics(baseComponent, baseInfo.labels);
  const scale = Math.max(0.95, Math.min(1.05, baseMetric.width / targetMetric.width));
  const [x0, y0, x1, y1] = targetComponent.bounds;
  const cropWidth = x1 - x0 + 1, cropHeight = y1 - y0 + 1;
  const width = Math.max(1, Math.round(cropWidth * scale)), height = Math.max(1, Math.round(cropHeight * scale));
  const left = Math.round(baseMetric.anchorX - (targetMetric.anchorX - x0) * scale);
  const top = Math.round(baseMetric.anchorY - (targetMetric.anchorY - y0) * scale);
  const buildCrop = async (data) => sharp(data, rawOptions).extract({ left: x0, top: y0, width: cropWidth, height: cropHeight }).resize(width, height, { kernel: 'lanczos3' }).png().toBuffer();
  alignedRearLayers.push({ input: await buildCrop(rearClean), left, top });
  alignedFrontLayers.push({ input: await buildCrop(frontRaw.data), left, top });
  transforms.push({ cell: key, scale, sourceBounds: targetComponent.bounds, destinationAnchor: [baseMetric.anchorX, baseMetric.anchorY], placement: [left, top, width, height] });
}

const transparent = { create: { width: W, height: H, channels: 4, background: '#00000000' } };
const rearPng = await sharp(transparent).composite(alignedRearLayers).png().toBuffer();
const frontPng = await sharp(transparent).composite(alignedFrontLayers).png().toBuffer();
const frontAlignedRaw = await sharp(frontPng).raw().toBuffer({ resolveWithObject: true });
const frontSupport = new Uint8Array(count);
for (let p = 0; p < count; p += 1) frontSupport[p] = frontAlignedRaw.data[p * C + 3] >= 12 ? 1 : 0;
let expandedSupport = frontSupport;
for (let iteration = 0; iteration < 8; iteration += 1) {
  const next = new Uint8Array(expandedSupport);
  for (let p = 0; p < count; p += 1) if (expandedSupport[p]) {
    const x = p % W, y = Math.floor(p / W);
    if (x) next[p - 1] = 1; if (x + 1 < W) next[p + 1] = 1;
    if (y) next[p - W] = 1; if (y + 1 < H) next[p + W] = 1;
  }
  expandedSupport = next;
}

// Back-facing sprites need one original-pet foreground sublayer: the central
// raised tail crosses in front of the wraparound band.  Copy only original base
// pixels in the narrow central strip where they intersect the aligned band.
const occluder = Buffer.alloc(count * C);
for (const [key, component] of baseByCell) if (key.startsWith('2:')) {
  const [minX, minY, maxX, maxY] = component.bounds;
  const centerX = (minX + maxX) / 2, halfWidth = Math.max(22, (maxX - minX + 1) * 0.10);
  const y1 = minY + Math.floor((maxY - minY + 1) * 0.62);
  for (let y = minY; y <= y1; y += 1) for (let x = Math.max(minX, Math.floor(centerX - halfWidth)); x <= Math.min(maxX, Math.ceil(centerX + halfWidth)); x += 1) {
    const p = y * W + x, i = p * C;
    if (expandedSupport[p] && baseRaw.data[i + 3] >= 12) {
      occluder[i] = baseRaw.data[i]; occluder[i + 1] = baseRaw.data[i + 1]; occluder[i + 2] = baseRaw.data[i + 2]; occluder[i + 3] = baseRaw.data[i + 3];
    }
  }
}
const occluderPng = await sharp(occluder, rawOptions).png().toBuffer();
const basePng = await sharp(baseRaw.data, rawOptions).png().toBuffer();
const compositePng = await sharp(transparent).composite([{ input: rearPng }, { input: basePng }, { input: frontPng }, { input: occluderPng }]).png().toBuffer();
const compositeRaw = await sharp(compositePng).raw().toBuffer({ resolveWithObject: true });

const diff = Buffer.alloc(count * C);
let fullTargetMismatchPixels = 0;
for (let p = 0; p < count; p += 1) {
  const i = p * C;
  const delta = Math.max(Math.abs(compositeRaw.data[i] - targetRaw.data[i]), Math.abs(compositeRaw.data[i + 1] - targetRaw.data[i + 1]), Math.abs(compositeRaw.data[i + 2] - targetRaw.data[i + 2]), Math.abs(compositeRaw.data[i + 3] - targetRaw.data[i + 3]));
  if (delta > 8) { fullTargetMismatchPixels += 1; diff[i] = 255; diff[i + 1] = Math.max(0, 220 - delta); diff[i + 3] = 230; }
}

const files = {
  rear: path.join(outputDir, 'head-05-rear-aligned.png'),
  front: path.join(outputDir, 'head-05-front-aligned.png'),
  petOccluder: path.join(outputDir, 'head-05-pet-occluder.png'),
  composite: path.join(outputDir, 'head-05-composite-on-original-pet.png'),
  diff: path.join(outputDir, 'head-05-full-redraw-difference.png'),
  proof: path.join(outputDir, 'head-05-layer-proof.png'),
  report: path.join(outputDir, 'head-05-layer-report.json'),
};
await Promise.all([fs.writeFile(files.rear, rearPng), fs.writeFile(files.front, frontPng), fs.writeFile(files.petOccluder, occluderPng), fs.writeFile(files.composite, compositePng), sharp(diff, rawOptions).png().toFile(files.diff)]);

const tileSize = 768;
const proofSources = [basePath, targetPath, files.rear, files.front, files.petOccluder, files.composite];
const proofLabels = ['ORIGINAL PET', 'FULL REDRAW', 'ALIGNED REAR', 'ALIGNED FRONT', 'PET OCCLUDER', 'COMPOSITE ON ORIGINAL'];
const proofLayers = [];
for (let k = 0; k < proofSources.length; k += 1) {
  const left = (k % 3) * tileSize, top = Math.floor(k / 3) * tileSize;
  proofLayers.push({ input: await sharp(proofSources[k]).resize(tileSize, tileSize).png().toBuffer(), left, top });
  proofLayers.push({ input: Buffer.from(`<svg width="${tileSize}" height="44"><rect width="100%" height="44" fill="#111827dd"/><text x="18" y="30" font-family="Arial" font-size="22" font-weight="700" fill="white">${proofLabels[k]}</text></svg>`), left, top });
}
await sharp({ create: { width: tileSize * 3, height: tileSize * 2, channels: 4, background: '#382f31ff' } }).composite(proofLayers).png().toFile(files.proof);

const report = { id: 'head-05', version: 'pet2-v2-aligned', dimensions: [W, H], grid: [5, 4], base: basePath, fullRedraw: targetPath, compositionOrder: ['rear', 'originalPet', 'front', 'petOccluder'], fullTargetMismatchPixels, transforms, files };
await fs.writeFile(files.report, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ id: report.id, version: report.version, fullTargetMismatchPixels, transforms, files }, null, 2));
