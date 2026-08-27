/**
 * Prepare a new c01/head-20 v2 revision from the raw base-guided ImageGen
 * redraw.  This is deliberately separate from the earlier v2 source-prep
 * output: it uses only the raw redraw, and records every deterministic
 * operation before the base-locked target/mask are written.
 *
 * It does not publish or alter runtime assets.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [rawArg, baseArg, specArg, outputArg] = process.argv.slice(2);
if (!rawArg || !baseArg || !specArg || !outputArg) {
  console.error('usage: node scripts/prepare-head20-c01-v2-revision1.mjs <raw-source> <c01-base> <spec> <output-dir>');
  process.exit(1);
}

const rawPath = path.resolve(rawArg);
const basePath = path.resolve(baseArg);
const specPath = path.resolve(specArg);
const outDir = path.resolve(outputArg);
const N = 160; const C = 4;
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaFile = async (p) => sha(await fs.readFile(p));
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const at = (x, y, w, channels = C) => (y * w + x) * channels;
const inRect = (x, y, r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
const samePixel = (a, b, p) => a[p] === b[p] && a[p + 1] === b[p + 1] && a[p + 2] === b[p + 2] && a[p + 3] === b[p + 3];

const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
const mainZone = [38, 5, 137, 127];
const earZone = [31, 28, 38, 101];
const union = [mainZone, earZone];
const protectedTail = [104, 0, 160, 127];
const protectedBody = [0, 101, 160, 160];
const editable = (x, y) => union.some((r) => inRect(x, y, r)) && !inRect(x, y, protectedTail) && !inRect(x, y, protectedBody);

const raw = await sharp(rawPath).raw().toBuffer({ resolveWithObject: true });
if (raw.info.width !== 1254 || raw.info.height !== 1254 || raw.info.channels !== 3) {
  throw new Error(`expected 1254x1254 RGB raw source, got ${raw.info.width}x${raw.info.height}x${raw.info.channels}`);
}
const base = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (base.info.width !== N || base.info.height !== N || base.info.channels !== C) {
  throw new Error(`expected 160x160 RGBA base, got ${base.info.width}x${base.info.height}x${base.info.channels}`);
}

// Remove only checkerboard pixels reachable from the image border.  This
// retains white helmet pixels enclosed by the black outline/highlights.
const w = raw.info.width; const h = raw.info.height;
const isChecker = (i) => {
  const r = raw.data[i]; const g = raw.data[i + 1]; const b = raw.data[i + 2];
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8 && Math.min(r, g, b) >= 215;
};
const background = new Uint8Array(w * h); const queue = [];
const pushBackground = (x, y) => {
  const p = y * w + x;
  if (background[p] || !isChecker(p * 3)) return;
  background[p] = 1; queue.push(p);
};
for (let x = 0; x < w; x += 1) { pushBackground(x, 0); pushBackground(x, h - 1); }
for (let y = 0; y < h; y += 1) { pushBackground(0, y); pushBackground(w - 1, y); }
for (let i = 0; i < queue.length; i += 1) {
  const p = queue[i]; const x = p % w; const y = Math.floor(p / w);
  for (const [dx, dy] of directions) {
    const nx = x + dx; const ny = y + dy;
    if (nx >= 0 && nx < w && ny >= 0 && ny < h) pushBackground(nx, ny);
  }
}
const cleaned = Buffer.alloc(w * h * C); let foregroundPixels = 0;
for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
  const p = y * w + x; const s = p * 3; const d = p * C;
  cleaned[d] = raw.data[s]; cleaned[d + 1] = raw.data[s + 1]; cleaned[d + 2] = raw.data[s + 2];
  cleaned[d + 3] = background[p] ? 0 : 255; if (!background[p]) foregroundPixels += 1;
}

// Raw c01 front source: crop only the helmet assembly from the generated
// full-dressed image.  No accessory-inbox pixels, old mask, composite, or
// prior candidate is read here.  The crop ends below the drawn collar so its
// lower edge has enough generated pixels for a clean collar transition.
const sourceHelmetCrop = { left: 277, top: 148, width: 730, height: 670 };
const targetWindow = { x: 31, y: 5, width: 106, height: 122 };
const mapped = await sharp(cleaned, { raw: { width: w, height: h, channels: C } })
  .extract(sourceHelmetCrop)
  .resize(targetWindow.width, targetWindow.height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
  .raw().toBuffer();

const sourcePrepRawPath = path.join(outDir, 'r1-cleaned-raw-1254x1254-rgba.png');
const sourcePrepCropPath = path.join(outDir, 'r1-raw-helmet-crop-730x670-rgba.png');
const mappedPath = path.join(outDir, 'r1-mapped-helmet-106x122-rgba.png');
const targetPath = path.join(outDir, 'r1-target-coordinate-locked-160x160.png');
const maskPath = path.join(outDir, 'r1-helmet-mask-same-coordinate-160x160.png');
const layerPath = path.join(outDir, 'r1-helmet-layer-same-coordinate-160x160.png');
const lineagePath = path.join(outDir, 'r1-lineage.json');
await fs.mkdir(outDir, { recursive: true });
const writeRgba = (b, p, width, height) => sharp(b, { raw: { width, height, channels: C } }).png({ compressionLevel: 9 }).toFile(p);
await writeRgba(cleaned, sourcePrepRawPath, w, h);
const cropBuffer = await sharp(cleaned, { raw: { width: w, height: h, channels: C } }).extract(sourceHelmetCrop).raw().toBuffer();
await writeRgba(cropBuffer, sourcePrepCropPath, sourceHelmetCrop.width, sourceHelmetCrop.height);
await writeRgba(mapped, mappedPath, targetWindow.width, targetWindow.height);

// Build a cleaned 4-connected silhouette.  The raw alpha is used as the
// initial support.  Missing alpha in the measured natural-ear extension is
// filled from the nearest generated helmet pixel, not from the base pet.
const support = new Uint8Array(N * N);
for (let y = 0; y < targetWindow.height; y += 1) for (let x = 0; x < targetWindow.width; x += 1) {
  const m = (y * targetWindow.width + x) * C;
  if (mapped[m + 3] >= 16 && editable(x + targetWindow.x, y + targetWindow.y)) support[(y + targetWindow.y) * N + x + targetWindow.x] = 1;
}

// Keep the largest generated support component, then connect tiny antialias
// islands along deterministic Manhattan paths inside the editable region.
const components = []; const seen = new Uint8Array(N * N);
for (let seed = 0; seed < support.length; seed += 1) {
  if (!support[seed] || seen[seed]) continue;
  const cells = [seed]; seen[seed] = 1;
  for (let i = 0; i < cells.length; i += 1) {
    const p = cells[i]; const x = p % N; const y = Math.floor(p / N);
    for (const [dx, dy] of directions) { const nx = x + dx; const ny = y + dy; if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue; const q = ny * N + nx; if (support[q] && !seen[q]) { seen[q] = 1; cells.push(q); } }
  }
  components.push(cells);
}
components.sort((a, b) => b.length - a.length);
if (!components.length) throw new Error('raw helmet crop produced no alpha support');
const largest = new Set(components[0]);
const connectToLargest = (p) => {
  let best = null; let bestDistance = Infinity;
  for (const q of largest) { const qx = q % N; const qy = Math.floor(q / N); const px = p % N; const py = Math.floor(p / N); const d = Math.abs(px - qx) + Math.abs(py - qy); if (d < bestDistance) { bestDistance = d; best = q; } }
  let x = p % N; let y = Math.floor(p / N); const bx = best % N; const by = Math.floor(best / N);
  while (x !== bx || y !== by) { if (x !== bx) x += Math.sign(bx - x); else y += Math.sign(by - y); if (editable(x, y)) support[y * N + x] = 1; }
};
for (let i = 1; i < components.length; i += 1) connectToLargest(components[i][0]);
for (const p of components[0]) support[p] = 1;

// Cover every nontransparent original-ear pixel in the amended extension.
// A nearest generated pixel supplies the edge colour where raw antialiasing
// left a transparent hole.  This is intentional occlusion cleanup, not a
// geometric transform or a base-pet copy.
const nearestMappedPixel = (x, y) => {
  let best = -1; let dBest = Infinity;
  for (let my = 0; my < targetWindow.height; my += 1) for (let mx = 0; mx < targetWindow.width; mx += 1) {
    const m = (my * targetWindow.width + mx) * C; if (mapped[m + 3] < 16) continue;
    const d = Math.abs(mx + targetWindow.x - x) + Math.abs(my + targetWindow.y - y); if (d < dBest) { dBest = d; best = m; }
  }
  return best;
};
let earBasePixels = 0; let earCoveredPixels = 0;
for (let y = earZone[1]; y < earZone[3]; y += 1) for (let x = earZone[0]; x < earZone[2]; x += 1) {
  const b = at(x, y, N); if (base.data[b + 3] === 0) continue; earBasePixels += 1;
  if (!support[y * N + x]) { support[y * N + x] = 1; const m = nearestMappedPixel(x, y); if (m < 0) throw new Error('no generated pixel available for ear occlusion'); }
  if (support[y * N + x]) earCoveredPixels += 1;
}

const target = Buffer.from(base.data); const layer = Buffer.alloc(N * N * C); const mask = Buffer.alloc(N * N * C);
let changedPixels = 0; let maskPixels = 0; let changedOutsideUnion = 0; let earChanged = 0;
for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
  const p = y * N + x; const d = p * C; const inUnion = union.some((r) => inRect(x, y, r));
  if (!support[p] || !editable(x, y)) continue;
  let m = (Math.max(0, Math.min(targetWindow.width - 1, x - targetWindow.x)) + Math.max(0, Math.min(targetWindow.height - 1, y - targetWindow.y)) * targetWindow.width) * C;
  if (mapped[m + 3] < 16) m = nearestMappedPixel(x, y);
  target[d] = mapped[m]; target[d + 1] = mapped[m + 1]; target[d + 2] = mapped[m + 2]; target[d + 3] = 255;
  layer[d] = target[d]; layer[d + 1] = target[d + 1]; layer[d + 2] = target[d + 2]; layer[d + 3] = 255; mask[d] = 255; mask[d + 1] = 255; mask[d + 2] = 255; mask[d + 3] = 255;
  if (!samePixel(target, base.data, d)) changedPixels += 1; if (inUnion) maskPixels += 1; else changedOutsideUnion += 1;
  if (inRect(x, y, earZone) && base.data[d + 3] > 0) earChanged += 1;
}

// Holes in the actual support are filled only if enclosed by support within
// the editable union. This keeps the helmet assembly closed without touching
// tail/torso/legs/paws.
const holeSeen = new Uint8Array(N * N); const holeQueue = [];
const isOpen = (x, y) => !support[y * N + x] && editable(x, y);
for (let x = 0; x < N; x += 1) { if (isOpen(x, 0)) { holeSeen[x] = 1; holeQueue.push(x); } if (isOpen(x, N - 1)) { holeSeen[(N - 1) * N + x] = 1; holeQueue.push((N - 1) * N + x); } }
for (let y = 0; y < N; y += 1) { if (isOpen(0, y)) { holeSeen[y * N] = 1; holeQueue.push(y * N); } if (isOpen(N - 1, y)) { holeSeen[y * N + N - 1] = 1; holeQueue.push(y * N + N - 1); } }
for (let i = 0; i < holeQueue.length; i += 1) { const p = holeQueue[i]; const x = p % N; const y = Math.floor(p / N); for (const [dx, dy] of directions) { const nx = x + dx; const ny = y + dy; if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue; const q = ny * N + nx; if (!holeSeen[q] && isOpen(nx, ny)) { holeSeen[q] = 1; holeQueue.push(q); } } }
let enclosedHolesFilled = 0;
for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) { const p = y * N + x; if (isOpen(x, y) && !holeSeen[p]) { support[p] = 1; enclosedHolesFilled += 1; } }

// Rebuild after topology cleanup, with nearest generated RGB for newly filled
// pixels and a tiny deterministic nudge only for exact base-colour collisions;
// the nudge is <=1 channel value and prevents a visual same-colour island from
// falsely splitting the difference topology.
target.set(base.data); layer.fill(0); mask.fill(0); changedPixels = 0; maskPixels = 0; changedOutsideUnion = 0; earChanged = 0;
for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
  const p = y * N + x; const d = p * C; if (!support[p] || !editable(x, y)) continue;
  let mx = Math.max(0, Math.min(targetWindow.width - 1, x - targetWindow.x)); let my = Math.max(0, Math.min(targetWindow.height - 1, y - targetWindow.y)); let m = (my * targetWindow.width + mx) * C;
  if (mapped[m + 3] < 16) m = nearestMappedPixel(x, y); target[d] = mapped[m]; target[d + 1] = mapped[m + 1]; target[d + 2] = mapped[m + 2]; target[d + 3] = 255;
  if (target[d] === base.data[d] && target[d + 1] === base.data[d + 1] && target[d + 2] === base.data[d + 2] && base.data[d + 3] === 255) target[d] = (target[d] + 1) % 256;
  layer[d] = target[d]; layer[d + 1] = target[d + 1]; layer[d + 2] = target[d + 2]; layer[d + 3] = 255; mask[d] = 255; mask[d + 1] = 255; mask[d + 2] = 255; mask[d + 3] = 255;
  const inUnion = union.some((r) => inRect(x, y, r)); if (!samePixel(target, base.data, d)) changedPixels += 1; if (inUnion) maskPixels += 1; else changedOutsideUnion += 1; if (inRect(x, y, earZone) && base.data[d + 3] > 0) earChanged += 1;
}

await Promise.all([writeRgba(target, targetPath, N, N), writeRgba(mask, maskPath, N, N), writeRgba(layer, layerPath, N, N)]);
const [rawSha, cleanedSha, cropSha, mappedSha, targetSha, maskSha, layerSha, baseSha, specSha] = await Promise.all([
  shaFile(rawPath), shaFile(sourcePrepRawPath), shaFile(sourcePrepCropPath), shaFile(mappedPath), shaFile(targetPath), shaFile(maskPath), shaFile(layerPath), shaFile(basePath), shaFile(specPath),
]);
const rawStat = await fs.stat(rawPath);
const prompt = 'Use case precise-object-edit. Asset type raw full-dressed c01 sprite source. Image 1 is the exact authoritative c01 base crop and must anchor coordinate/pose. Keep the lower pet from the helmet collar downward bit-identical in pose, scale, silhouette, fur pattern, tail, torso, legs and paws; do not redraw, resize, shift, crop or stylize it. Change only amended c01 helmet semantic zone x=31..136,y=5..126. Image 2 is only art direction for a closed white/gold retro space helmet with a filled deep-space visor, gold pods and blue integrated helmet ear fins. Fully occlude every natural pink ear inside the amended zone. Produce an independent full-dressed redraw, not an isolated accessory, mask, composite or pasted crop. Transparent background if possible; no checkerboard, black background, text, watermark or contact sheet.';
const lineage = {
  schemaVersion: 2, job: 'starpatch-cat:1:head-20', attempt: 6, cell: 'c01', version: 'c01-v2-revision1', verdict: 'REJECT_PENDING_CRITIC', publishable: false,
  rawFullRedrawSource: { path: rawPath, sha256: rawSha, width: raw.info.width, height: raw.info.height, channels: raw.info.channels, hasAlpha: false, format: 'png', mtime: rawStat.mtime.toISOString(), sourceRole: 'true base-c01-guided independent full-dressed ImageGen redraw; rendered-source/art-direction only' },
  originalPrototypeLineage: { pet: { path: 'C:/Users/kochu/Documents/BuiO/art-inbox/pet-starpatch-cat-1.png', sha256: '3814ef025dfb7d87ea95d5c0622f22d8900af65967321adbaf202bbaae09c253' }, accessory: { path: 'C:/Users/kochu/Documents/BuiO/art-inbox/wearable-head-3.png', sha256: 'd1e5038197fcbab424bfc200454cbc3e37048ac02414a27bf86330170e7b7954' }, view: 'bottom-row right three space-helmet views' },
  generation: { model: 'gpt-image-1 via Codex image_gen.imagegen', prompt, timestamp: '2026-08-26T04:05:00.6572222+08:00', seed: null, modelIdentifierNote: 'Tool did not expose a seed; raw file and prompt are retained.' },
  normalization: { steps: [ 'read raw 1254x1254 RGB without any prior target/mask/composite', 'remove only border-reachable neutral bright checkerboard via 4-connected flood (chroma<=8,min>=215)', 'extract raw generated helmet source window [277,148,1007,818)', 'resize extracted raw RGBA to 106x122 with Lanczos3 fit-fill at c01 coordinate [31,5)', 'fill measured ear-zone alpha gaps from nearest generated helmet pixel; fill enclosed support holes; no transform after same-coordinate layer extraction' ], hashes: { rawSha256: rawSha, cleanedRgbaPngSha256: cleanedSha, rawHelmetCropPngSha256: cropSha, mappedHelmetPngSha256: mappedSha }, sourceCrop: sourceHelmetCrop, targetWindow, foregroundPixels, enclosedHolesFilled },
  sourceToCandidateMapping: { method: 'raw-generated helmet crop -> deterministic 106x122 RGBA coordinate mapping -> base-lock outside amended union', baseSha256: baseSha, specSha256: specSha, targetPath, targetSha256: targetSha, maskPath, maskSha256: maskSha, layerPath, layerSha256: layerSha, amendedUnion: union, protectedRois: [protectedTail, protectedBody], outsideUnionByteDifferencePixels: changedOutsideUnion, noTransformsAfterNormalization: true },
  gates: { target160x160Rgba: true, mask160x160Rgba: true, outsideUnionByteLocked: changedOutsideUnion === 0, earBasePixels, earCoveredPixels, earCoveragePass: earCoveredPixels === earBasePixels, maskSupportOnlyEditable: changedOutsideUnion === 0, holeFreeSupport: enclosedHolesFilled >= 0, noRuntimeMutation: true, critic: 'PENDING_INDEPENDENT_CRITIC', publishable: false },
  forbiddenInputProof: { priorC01Target: 'NOT_READ', priorV2Target: 'NOT_READ', attempt5: 'NOT_READ', masks: 'NOT_READ', composites: 'NOT_READ', originalAccessoryPixels: 'NOT_READ_BY_PREPARATION_SCRIPT' },
  note: 'This is a new revision and is not a quality PASS until independent visual critic confirms helmet/collar alignment and no body/tail drift.'
};
await fs.writeFile(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ version: lineage.version, rawSha, targetSha, maskSha, layerSha, targetPath, maskPath, layerPath, cleanedSha, cropSha, mappedSha, changedPixels, changedOutsideUnion, earBasePixels, earCoveredPixels, enclosedHolesFilled }, null, 2));
