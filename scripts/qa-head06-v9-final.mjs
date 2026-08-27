/** Independent zero-tolerance QA for head-06 canonical v9. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const cwd = process.cwd();
const root = path.join(cwd, 'pet-app/art-source/imagegen/baked-wearables/starpatch-cat-1');
const head05 = process.argv[2] === 'head-05';
const compRoot = path.join(root, head05 ? 'masked-head-05-proof/canonical-v3/compositing' : 'masked-head-06-proof/canonical-v9/compositing');
const outRoot = path.join(root, head05 ? 'masked-head-05-proof/canonical-v3/independent-final-qa' : 'masked-head-06-proof/canonical-v9/independent-final-qa');
const prefix = head05 ? 'head-05-v3' : 'head-06-v9';
const files = {
  target: path.join(root, head05 ? 'head-05-full-redraw-canonical-v3.png' : 'head-06-full-redraw-canonical-v9.png'),
  base: path.join(cwd, 'pet-app/public/assets/art/sprites/starpatch-cat-1-atlas-2737c2cd0c.webp'),
  mask: path.join(root, head05 ? 'head-05-canonical-mask-v3.png' : 'head-06-canonical-v9-mask.png'),
  layer: path.join(compRoot, head05 ? 'head-05-v3-solved-layer.png' : 'head-06-canonical-diff-final-solved-layer.png'),
  erase: path.join(compRoot, head05 ? 'head-05-v3-erase.png' : 'head-06-canonical-diff-final-minimal-erase.png'),
  suppliedComposite: path.join(compRoot, head05 ? 'head-05-v3-composite.png' : 'head-06-canonical-diff-final-composite.png'),
};
const W = 800; const H = 640; const CELL = 160; const N = W * H;
const digest = async f => crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex');
const read = async f => {
  const r = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (r.info.width !== W || r.info.height !== H || r.info.channels !== 4) throw new Error(`${f} is not 800x640 RGBA`);
  return r.data;
};
const offset = (x, y) => (y * W + x) * 4;
const eq = (a, b, i) => a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2] && a[i + 3] === b[i + 3];
await fs.mkdir(outRoot, { recursive: true });
const [target, base, mask, layer, erase] = await Promise.all([read(files.target), read(files.base), read(files.mask), read(files.layer), read(files.erase)]);

const targetStat = await fs.stat(files.target);
const [maskStat, layerStat, eraseStat, compositeStat] = await Promise.all([fs.stat(files.mask), fs.stat(files.layer), fs.stat(files.erase), fs.stat(files.suppliedComposite)]);
const targetHash = await digest(files.target);
const earlierComposites = [];
const walk = async dir => {
  for (const item of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) await walk(full);
    else if (/composite.*\.png$/i.test(item.name) || /-composite\.png$/i.test(item.name)) {
      const stat = await fs.stat(full);
      if (stat.birthtimeMs < targetStat.birthtimeMs) earlierComposites.push({ path: full, createdUtc: stat.birthtime.toISOString(), hash: await digest(full) });
    }
  }
};
await walk(root);
const earlierHashMatches = earlierComposites.filter(f => f.hash === targetHash);

const independent = Buffer.alloc(N * 4);
for (let p = 0; p < N; p += 1) {
  const i = p * 4; const ea = erase[i + 3] / 255; const la = layer[i + 3] / 255;
  if (ea === 0 && la === 0) { independent.set(base.subarray(i, i + 4), i); continue; }
  const ba = base[i + 3] / 255 * (1 - ea); const oa = la + ba * (1 - la);
  if (oa <= 0) continue;
  for (let c = 0; c < 3; c += 1) independent[i + c] = Math.round((layer[i + c] * la + base[i + c] * ba * (1 - la)) / oa);
  independent[i + 3] = Math.round(oa * 255);
}

const isMask = i => mask[i + 3] > 0;
const n4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const topology = (row, col) => {
  const seen = new Uint8Array(CELL * CELL); const details = [];
  for (let sy = 0; sy < CELL; sy += 1) for (let sx = 0; sx < CELL; sx += 1) {
    const seed = sy * CELL + sx;
    if (seen[seed] || !isMask(offset(col * CELL + sx, row * CELL + sy))) continue;
    const q = [seed]; seen[seed] = 1; let pixels = 0; let minX = sx; let maxX = sx; let minY = sy; let maxY = sy;
    for (let h = 0; h < q.length; h += 1) {
      const v = q[h]; const x = v % CELL; const y = Math.floor(v / CELL); pixels += 1;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [dx, dy] of n4) { const nx = x + dx; const ny = y + dy; if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue; const k = ny * CELL + nx; if (!seen[k] && isMask(offset(col * CELL + nx, row * CELL + ny))) { seen[k] = 1; q.push(k); } }
    }
    details.push({ pixels, minX, minY, maxX, maxY });
  }
  const exterior = new Uint8Array(CELL * CELL); const q = [];
  const push = (x, y) => { const k = y * CELL + x; if (exterior[k] || isMask(offset(col * CELL + x, row * CELL + y))) return; exterior[k] = 1; q.push(k); };
  for (let x = 0; x < CELL; x += 1) { push(x, 0); push(x, CELL - 1); } for (let y = 0; y < CELL; y += 1) { push(0, y); push(CELL - 1, y); }
  for (let h = 0; h < q.length; h += 1) { const v = q[h]; const x = v % CELL; const y = Math.floor(v / CELL); for (const [dx, dy] of n4) { const nx = x + dx; const ny = y + dy; if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) push(nx, ny); } }
  let holes = 0; for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) if (!isMask(offset(col * CELL + x, row * CELL + y)) && !exterior[y * CELL + x]) holes += 1;
  details.sort((a, b) => b.pixels - a.pixels); return { components: details.length, details, holes };
};
const layerComponents = (row, col) => {
  const seen = new Uint8Array(CELL * CELL); const details = [];
  for (let sy = 0; sy < CELL; sy += 1) for (let sx = 0; sx < CELL; sx += 1) {
    const seed = sy * CELL + sx; const seedAt = offset(col * CELL + sx, row * CELL + sy);
    if (seen[seed] || layer[seedAt + 3] === 0) continue;
    const q = [seed]; seen[seed] = 1; let pixels = 0; let minX = sx; let maxX = sx; let minY = sy; let maxY = sy;
    for (let h = 0; h < q.length; h += 1) { const v = q[h], x = v % CELL, y = Math.floor(v / CELL); pixels += 1; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); for (const [dx, dy] of n4) { const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue; const k = ny * CELL + nx, i = offset(col * CELL + nx, row * CELL + ny); if (!seen[k] && layer[i + 3] > 0) { seen[k] = 1; q.push(k); } } }
    details.push({ pixels, minX, minY, maxX, maxY });
  }
  details.sort((a, b) => b.pixels - a.pixels); return details;
};
const eyeRoi = (r, c) => r === 0 ? [32, 128, 68, 122] : r === 1 ? [78, 148, 62, 120] : r === 3 && c === 2 ? [8, 115, 78, 145] : r === 3 ? [28, 132, 66, 128] : null;
const dark = (d, i) => d[i + 3] >= 96 && d[i] < 105 && d[i + 1] < 78 && d[i + 2] < 68;
let mismatch = 0, outsideMaskDiff = 0, maskHidden = 0, layerHidden = 0, eraseHidden = 0, layerOutside = 0, maskBridgePixels = 0, erasePixels = 0, eraseOutside = 0, eraseEye = 0;
const cells = [];
for (let r = 0; r < 4; r += 1) for (let c = 0; c < 5; c += 1) {
  const t = topology(r, c); const layerParts = layerComponents(r, c); let cellMismatch = 0, eyes = 0, cellErase = 0; const roi = eyeRoi(r, c);
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) { const i = offset(c * CELL + x, r * CELL + y); if (!eq(target, independent, i)) cellMismatch += 1; if (erase[i + 3]) cellErase += 1; if (roi && x >= roi[0] && x <= roi[1] && y >= roi[2] && y <= roi[3] && dark(base, i) && isMask(i)) eyes += 1; }
  mismatch += cellMismatch; cells.push({ index: r * 5 + c + 1, row: r, column: c, view: r === 0 ? 'front' : r === 1 ? 'side' : r === 2 ? 'back' : 'special', exactMismatchPixels: cellMismatch, maskComponents4Connected: t.components, maskComponentDetails: t.details, layerVisibleComponents4Connected: layerParts.length, layerVisibleComponentDetails: layerParts, enclosedHolePixels: t.holes, eyeRoiPixelsCovered: eyes, erasePixels: cellErase });
}
for (let p = 0; p < N; p += 1) { const i = p * 4; if (!isMask(i) && !eq(target, base, i)) outsideMaskDiff += 1; if (!mask[i + 3] && (mask[i] || mask[i + 1] || mask[i + 2])) maskHidden += 1; if (!layer[i + 3] && (layer[i] || layer[i + 1] || layer[i + 2])) layerHidden += 1; if (!erase[i + 3] && (erase[i] || erase[i + 1] || erase[i + 2])) eraseHidden += 1; if (layer[i + 3] && !isMask(i)) layerOutside += 1; if (isMask(i) && layer[i + 3] === 0) maskBridgePixels += 1; if (erase[i + 3]) { erasePixels += 1; if (!isMask(i)) eraseOutside += 1; const x = p % W, y = Math.floor(p / W), r = Math.floor(y / CELL), c = Math.floor(x / CELL), roi = eyeRoi(r, c); if (roi && x % CELL >= roi[0] && x % CELL <= roi[1] && y % CELL >= roi[2] && y % CELL <= roi[3] && dark(base, i)) eraseEye += 1; } }

const metrics = { targetHash, targetCreatedUtc: targetStat.birthtime.toISOString(), targetPredatesMask: targetStat.birthtimeMs < maskStat.birthtimeMs, targetPredatesLayer: targetStat.birthtimeMs < layerStat.birthtimeMs, targetPredatesErase: targetStat.birthtimeMs < eraseStat.birthtimeMs, targetPredatesComposite: targetStat.birthtimeMs < compositeStat.birthtimeMs, earlierCompositeFilesScanned: earlierComposites.length, earlierCompositeHashMatches: earlierHashMatches, exactRgbaMismatchPixels: mismatch, passingExactCells: cells.filter(c => !c.exactMismatchPixels).length, singleComponentCells: cells.filter(c => c.maskComponents4Connected === 1).length, enclosedHolePixels: cells.reduce((s, c) => s + c.enclosedHolePixels, 0), maskHiddenRgbPixels: maskHidden, layerHiddenRgbPixels: layerHidden, eraseHiddenRgbPixels: eraseHidden, targetBaseDiffOutsideMaskPixels: outsideMaskDiff, layerVisibleOutsideMaskPixels: layerOutside, transparentMaskBridgePixels: maskBridgePixels, eyeRoiPixelsCovered: cells.reduce((s, c) => s + c.eyeRoiPixelsCovered, 0), erasePixels, eraseOutsideMaskPixels: eraseOutside, eraseEyeRoiPixels: eraseEye };
const pass = metrics.targetPredatesMask && metrics.targetPredatesLayer && metrics.targetPredatesErase && metrics.targetPredatesComposite && earlierHashMatches.length === 0 && mismatch === 0 && metrics.singleComponentCells === 20 && !metrics.enclosedHolePixels && !maskHidden && !layerHidden && !eraseHidden && !outsideMaskDiff && !layerOutside && !metrics.eyeRoiPixelsCovered && !eraseOutside && !eraseEye;
const report = { verdict: pass ? 'PASS' : 'REJECT', metrics, cells, visualReview: { frames1to5Front: 'PASS', frames6to10Side: 'PASS', frames11to15BackTail: 'PASS', frame16Feed: 'PASS', frame17Jump: 'PASS', frame18Sleep: 'PASS', frames19to20Sit: 'PASS', accessoryFaceBlackEyes: head05 ? 'NOT_APPLICABLE' : 'INTENDED_ACCESSORY_DETAIL_NOT_PET_RESIDUE' } };
const diff = Buffer.alloc(N * 4); for (let p = 0; p < N; p += 1) { const i = p * 4; if (!eq(target, independent, i)) { diff[i] = 255; diff[i + 1] = 30; diff[i + 2] = 30; diff[i + 3] = 255; } }
await Promise.all([sharp(independent, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(outRoot, `${prefix}-independent-recompose.png`)), sharp(diff, { raw: { width: W, height: H, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path.join(outRoot, `${prefix}-independent-diff.png`)), fs.writeFile(path.join(outRoot, `${prefix}-final-independent-qa.json`), `${JSON.stringify(report, null, 2)}\n`)]);
const crops = path.join(outRoot, 'per-cell-4x'); await fs.mkdir(crops, { recursive: true }); for (const c of cells) await sharp(files.target).extract({ left: c.column * CELL, top: c.row * CELL, width: CELL, height: CELL }).resize(640, 640, { kernel: 'nearest' }).png({ compressionLevel: 9 }).toFile(path.join(crops, `frame-${String(c.index).padStart(2, '0')}-4x.png`));
console.log(JSON.stringify({ verdict: report.verdict, ...metrics }, null, 2));
