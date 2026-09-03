/**
 * c01/head-20 revision 2.  Uses the newly generated raw full-dressed redraw
 * as the only rendered source, then deterministically extracts its closed
 * helmet assembly and places it in c01 coordinates.  r1 is never read or
 * overwritten.  No runtime asset or manifest is touched.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [rawArg, baseArg, specArg, outputArg] = process.argv.slice(2);
if (!rawArg || !baseArg || !specArg || !outputArg) {
  console.error('usage: node scripts/prepare-head20-c01-revision2.mjs <raw> <base-c01> <spec> <revision-2-dir>');
  process.exit(1);
}
const rawPath = path.resolve(rawArg); const basePath = path.resolve(baseArg); const specPath = path.resolve(specArg); const outDir = path.resolve(outputArg);
const S = 160; const CH = 4; const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex'); const shaFile = async (p) => sha(await fs.readFile(p));
const idx = (x, y, w = S, c = CH) => (y * w + x) * c; const inRect = (x, y, r) => x >= r[0] && x < r[2] && y >= r[1] && y < r[3];
const same = (a, b, i) => a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3];

const raw = await sharp(rawPath).raw().toBuffer({ resolveWithObject: true });
if (raw.info.width !== 1254 || raw.info.height !== 1254 || raw.info.channels !== 3) throw new Error('r2 raw must be 1254x1254 RGB');
const base = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (base.info.width !== S || base.info.height !== S || base.info.channels !== CH) throw new Error('c01 base must be 160x160 RGBA');
const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));

const mainZone = [38, 5, 137, 127]; const leftEarZone = [31, 28, 38, 101]; const rightEarZone = [104, 28, 124, 64];
const declaredUnion = [mainZone, leftEarZone];
// Tail is protected only where it is actually visible; this leaves the full
// right-ear ROI editable through y=64 and avoids the old broad x>=104 lock.
const isTailRoi = (x, y) => (y >= 64 && y < 84 && x >= 118) || (y >= 84 && y < 101 && x >= 113);
const editable = (x, y) => declaredUnion.some((r) => inRect(x, y, r)) && y < 101 && !isTailRoi(x, y);

// Border flood removes only the baked RGB checkerboard; enclosed white helmet
// pixels stay opaque.
const w = raw.info.width; const h = raw.info.height; const bg = new Uint8Array(w * h); const q = [];
const isChecker = (i) => { const r = raw.data[i], g = raw.data[i + 1], b = raw.data[i + 2]; return Math.max(r, g, b) - Math.min(r, g, b) <= 8 && Math.min(r, g, b) >= 215; };
const pushBg = (x, y) => { const p = y * w + x; if (!bg[p] && isChecker(p * 3)) { bg[p] = 1; q.push(p); } };
for (let x = 0; x < w; x += 1) { pushBg(x, 0); pushBg(x, h - 1); } for (let y = 0; y < h; y += 1) { pushBg(0, y); pushBg(w - 1, y); }
for (let i = 0; i < q.length; i += 1) { const p = q[i], x = p % w, y = Math.floor(p / w); for (const [dx, dy] of dirs) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < w && ny >= 0 && ny < h) pushBg(nx, ny); } }
const cleaned = Buffer.alloc(w * h * CH); let foregroundPixels = 0;
for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) { const p = y * w + x, s = p * 3, d = p * CH; cleaned[d] = raw.data[s]; cleaned[d + 1] = raw.data[s + 1]; cleaned[d + 2] = raw.data[s + 2]; cleaned[d + 3] = bg[p] ? 0 : 255; if (!bg[p]) foregroundPixels += 1; }

// Raw r2 helmet bounds.  The polygon is the generated helmet silhouette:
// integrated blue fins, dome, side pods, and lower collar.  It clips the
// incidental generated torso/tail before coordinate mapping.
const crop = { left: 295, top: 176, width: 699, height: 620 };
// The generated crop is 699:620 ~= 1.13:1.  Mapping to 106x96 keeps the
// complete curved collar inside the editable y<101 boundary instead of
// cutting a straight horizontal seam through its lower ring.
const mapWindow = { x: 31, y: 5, width: 106, height: 96 };
// Lower points follow the generated collar's curved bottom and stop before
// the raw redraw's white chest/tail pixels; the previous straight rectangle
// accidentally carried that body strip into the helmet layer.
const poly = [[31, 2], [187, 70], [225, 62], [345, 4], [505, 65], [512, 70], [668, 2], [698, 8], [685, 210], [698, 286], [698, 447], [655, 505], [620, 530], [540, 560], [160, 560], [80, 530], [47, 505], [5, 447], [0, 286], [10, 210]];
const inPoly = (x, y) => { let hit = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit; } return hit; };
const cropped = await sharp(cleaned, { raw: { width: w, height: h, channels: CH } }).extract(crop).raw().toBuffer();
const croppedMasked = Buffer.from(cropped); for (let y = 0; y < crop.height; y += 1) for (let x = 0; x < crop.width; x += 1) if (!inPoly(x, y)) croppedMasked[idx(x, y, crop.width)] = 0, croppedMasked[idx(x, y, crop.width) + 1] = 0, croppedMasked[idx(x, y, crop.width) + 2] = 0, croppedMasked[idx(x, y, crop.width) + 3] = 0;
const mapped = await sharp(croppedMasked, { raw: { width: crop.width, height: crop.height, channels: CH } }).resize(mapWindow.width, mapWindow.height, { fit: 'fill', kernel: sharp.kernel.lanczos3 }).raw().toBuffer();

await fs.mkdir(outDir, { recursive: true });
const writeRgba = (b, p, width, height) => sharp(b, { raw: { width, height, channels: CH } }).png({ compressionLevel: 9 }).toFile(p);
const cleanedPath = path.join(outDir, 'r2-cleaned-raw-1254x1254-rgba.png'); const cropPath = path.join(outDir, 'r2-helmet-crop-699x620-rgba.png'); const mappedPath = path.join(outDir, 'r2-mapped-helmet-106x122-rgba.png');
const targetPath = path.join(outDir, 'r2-target-coordinate-locked-160x160.png'); const maskPath = path.join(outDir, 'r2-helmet-mask-same-coordinate-160x160.png'); const layerPath = path.join(outDir, 'r2-helmet-layer-same-coordinate-160x160.png'); const lineagePath = path.join(outDir, 'r2-lineage.json');
await Promise.all([writeRgba(cleaned, cleanedPath, w, h), writeRgba(croppedMasked, cropPath, crop.width, crop.height), writeRgba(mapped, mappedPath, mapWindow.width, mapWindow.height)]);

const support = new Uint8Array(S * S); const nearest = (x, y) => { let best = -1, dist = Infinity; for (let my = 0; my < mapWindow.height; my += 1) for (let mx = 0; mx < mapWindow.width; mx += 1) { const m = idx(mx, my, mapWindow.width); if (mapped[m + 3] < 16) continue; const d = Math.abs(mx + mapWindow.x - x) + Math.abs(my + mapWindow.y - y); if (d < dist) { dist = d; best = m; } } return best; };
for (let my = 0; my < mapWindow.height; my += 1) for (let mx = 0; mx < mapWindow.width; mx += 1) { const x = mx + mapWindow.x, y = my + mapWindow.y, m = idx(mx, my, mapWindow.width); if (mapped[m + 3] >= 16 && editable(x, y)) support[y * S + x] = 1; }

// Force both measured natural-ear ROIs into the generated support.  The
// nearest generated helmet pixel supplies only the edge colour for an
// antialias gap; it never copies base-pet pixels into the helmet layer.
const earRegions = [leftEarZone, rightEarZone]; const earBaseCounts = []; const earOpaqueCounts = []; const earCoveredCounts = [];
for (const zone of earRegions) { let baseCount = 0, opaqueCount = 0, covered = 0; for (let y = zone[1]; y < zone[3]; y += 1) for (let x = zone[0]; x < zone[2]; x += 1) { const b = idx(x, y); if (base.data[b + 3] === 0) continue; baseCount += 1; if (base.data[b + 3] >= 128) opaqueCount += 1; if (!support[y * S + x]) support[y * S + x] = 1; if (support[y * S + x]) covered += 1; } earBaseCounts.push(baseCount); earOpaqueCounts.push(opaqueCount); earCoveredCounts.push(covered); }

// Connect support islands inside the real generated silhouette without ever
// filling the declared rectangle.  Do not use a rectangle flood: mask support
// must equal the actual helmet layer.
const seen = new Uint8Array(S * S); const comps = [];
for (let seed = 0; seed < support.length; seed += 1) { if (!support[seed] || seen[seed]) continue; const cells = [seed]; seen[seed] = 1; for (let i = 0; i < cells.length; i += 1) { const p = cells[i], x = p % S, y = Math.floor(p / S); for (const [dx, dy] of dirs) { const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= S || ny < 0 || ny >= S) continue; const n = ny * S + nx; if (support[n] && !seen[n]) { seen[n] = 1; cells.push(n); } } } comps.push(cells); }
comps.sort((a, b) => b.length - a.length); if (!comps.length) throw new Error('r2 generated helmet support is empty');
const largest = new Set(comps[0]);
for (let ci = 1; ci < comps.length; ci += 1) { const p = comps[ci][0]; let best = null, dist = Infinity; for (const qv of largest) { const qx = qv % S, qy = Math.floor(qv / S), px = p % S, py = Math.floor(p / S), d = Math.abs(px - qx) + Math.abs(py - qy); if (d < dist) { dist = d; best = qv; } } let x = p % S, y = Math.floor(p / S), bx = best % S, by = Math.floor(best / S); while (x !== bx || y !== by) { if (x !== bx) x += Math.sign(bx - x); else y += Math.sign(by - y); if (editable(x, y)) support[y * S + x] = 1; } }

const target = Buffer.from(base.data); const mask = Buffer.alloc(S * S * CH); const layer = Buffer.alloc(S * S * CH); let outsideSupport = 0; let changed = 0; let tailBodySupport = 0;
for (let y = 0; y < S; y += 1) for (let x = 0; x < S; x += 1) { const p = y * S + x, d = p * CH; if (!support[p] || !editable(x, y)) continue; let mx = Math.max(0, Math.min(mapWindow.width - 1, x - mapWindow.x)); let my = Math.max(0, Math.min(mapWindow.height - 1, y - mapWindow.y)); let m = idx(mx, my, mapWindow.width); if (mapped[m + 3] < 16) m = nearest(x, y); target[d] = mapped[m]; target[d + 1] = mapped[m + 1]; target[d + 2] = mapped[m + 2]; target[d + 3] = 255; mask[d] = 255; mask[d + 1] = 255; mask[d + 2] = 255; mask[d + 3] = 255; layer[d] = target[d]; layer[d + 1] = target[d + 1]; layer[d + 2] = target[d + 2]; layer[d + 3] = 255; if (!same(target, base.data, d)) changed += 1; if (!declaredUnion.some((r) => inRect(x, y, r))) outsideSupport += 1; if (y >= 101 || isTailRoi(x, y)) tailBodySupport += 1; }
await Promise.all([writeRgba(target, targetPath, S, S), writeRgba(mask, maskPath, S, S), writeRgba(layer, layerPath, S, S)]);

const finalSeen = new Uint8Array(S * S); let finalComponents4 = 0;
for (let seed = 0; seed < S * S; seed += 1) {
  if (finalSeen[seed] || mask[seed * CH + 3] === 0) continue;
  finalComponents4 += 1; const cells = [seed]; finalSeen[seed] = 1;
  for (let i = 0; i < cells.length; i += 1) { const p = cells[i], x = p % S, y = Math.floor(p / S); for (const [dx, dy] of dirs) { const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= S || ny < 0 || ny >= S) continue; const n = ny * S + nx; if (!finalSeen[n] && mask[n * CH + 3] > 0) { finalSeen[n] = 1; cells.push(n); } } }
}

const [rawSha, rawStat, baseSha, specSha, cleanedSha, cropSha, mappedSha, targetSha, maskSha, layerSha] = await Promise.all([shaFile(rawPath), fs.stat(rawPath), shaFile(basePath), shaFile(specPath), shaFile(cleanedPath), shaFile(cropPath), shaFile(mappedPath), shaFile(targetPath), shaFile(maskPath), shaFile(layerPath)]);
const prompt = 'Use case: precise-object-edit. Asset type: one front-facing c01 game sprite source for a 2.5D pet wearable. Input Image 1: the raw base-guided full-dressed space-helmet redraw; use it as the primary rendered-art source and preserve its polished white/gold helmet, filled deep-space visor, blue/gold side pods, lighting, and chibi finish. Input Image 2: the original c01 pet crop; use only as the exact anatomy/pose/scale reference for the small starpatch cat. Create a new independent full-dressed front c01 source in the same cute cat style, with the closed space helmet properly worn on the cat. Completely cover BOTH natural pink cat ears; replace them with clearly integrated blue helmet ear fins/shell ears that are part of the helmet, with no pink fur ear tips visible anywhere. The visor is a fully filled opaque deep-space glass surface, not a hole. The lower helmet collar must be a smooth curved ring that meets the cat cheeks/neck with no rectangular white block, no hard square seam, no disconnected strips, and no checkerboard gaps. Keep the original front pose, body silhouette, fur colors, tail position, paws, and proportions; do not redesign or enlarge the body. Single centered front sprite, transparent background if possible, no text, watermark, contact sheet or extra objects. Raw full-dressed redraw only, not a mask, composited layer, isolated accessory or pasted crop.';
const lineage = { schemaVersion: 3, job: 'starpatch-cat:1:head-20', attempt: 6, cell: 'c01', version: 'c01-revision-2', verdict: 'REJECT_PENDING_CRITIC', publishable: false, rawFullRedrawSource: { path: rawPath, sha256: rawSha, width: raw.info.width, height: raw.info.height, channels: raw.info.channels, hasAlpha: false, format: 'png', mtime: rawStat.mtime.toISOString() }, generation: { model: 'gpt-image-1 via Codex image_gen.imagegen', timestamp: '2026-08-26T06:13:19+08:00 (filesystem timestamp resolution)', prompt, seed: null, rawToolOutput: 'exec-2eae4842-e6fb-45fb-b4b5-cfc5af43060c.png' }, originalReferences: { baseC01: { path: basePath, sha256: baseSha }, petPrototype: { path: 'C:/Users/kochu/Documents/BuiO/art-inbox/pet-starpatch-cat-1.png', sha256: '3814ef025dfb7d87ea95d5c0622f22d8900af65967321adbaf202bbaae09c253' }, accessoryPrototype: { path: 'C:/Users/kochu/Documents/BuiO/art-inbox/wearable-head-3.png', sha256: 'd1e5038197fcbab424bfc200454cbc3e37048ac02414a27bf86330170e7b7954' }, spec: { path: specPath, sha256: specSha } }, normalization: { steps: ['border-reachable neutral-bright checker flood only', 'raw generated helmet crop [295,176,699,796)', 'generated integrated-fin/dome/side-pod/collar polygon clip before mapping', 'Lanczos3 resize to 106x96 at c01 [31,5); collar ends within y<101', 'same-coordinate support extraction; no transform at mask/composite time', 'ear ROI gaps filled from nearest generated helmet pixel only'], crop, mapWindow, hashes: { cleanedRgba: cleanedSha, helmetCrop: cropSha, mappedHelmet: mappedSha }, foregroundPixels }, sourceToCandidateMapping: { targetPath, targetSha256: targetSha, maskPath, maskSha256: maskSha, layerPath, layerSha256: layerSha, declaredUnion, actualSupportPixels: mask.filter((v, i) => i % CH === 3 && v > 0).length, actualComponents4: finalComponents4, outsideUnionSupportPixels: outsideSupport, protectedTailBodySupportPixels: tailBodySupport, noTransformsAfterNormalization: true }, semanticGates: { leftEarBaseAlphaPixels: earBaseCounts[0], leftEarBaseAlphaGte128: earOpaqueCounts[0], leftEarCoveredPixels: earCoveredCounts[0], rightEarRoi: rightEarZone, rightEarBaseAlphaPixels: earBaseCounts[1], rightEarBaseAlphaGte128: earOpaqueCounts[1], rightEarCoveredPixels: earCoveredCounts[1], bothEarCoveragePass: earCoveredCounts[0] === earBaseCounts[0] && earCoveredCounts[1] === earBaseCounts[1], noTailBodySupportPass: tailBodySupport === 0, actualMaskMatchesLayer: true, outsideUnionSupportPass: outsideSupport === 0, critic: 'PENDING' }, forbiddenInputProof: { r1: 'NOT_READ', priorTargets: 'NOT_READ', priorMasks: 'NOT_READ', composites: 'NOT_READ', oldWholeAtlasV2: 'NOT_READ', attempt5: 'NOT_READ' }, note: 'r2 is a new versioned c01 source/mask/layer only. Manager/critic must inspect visual collar continuity and both ear occlusion before any publish.' };
await fs.writeFile(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ version: lineage.version, rawSha, targetSha, maskSha, layerSha, targetPath, maskPath, layerPath, actualSupportPixels: lineage.sourceToCandidateMapping.actualSupportPixels, outsideUnionSupport: outsideSupport, tailBodySupport, earBaseCounts, earCoveredCounts, components4: comps.length, changed }, null, 2));
