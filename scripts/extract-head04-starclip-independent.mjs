/**
 * Independent same-coordinate head-04 star-clip masker.
 *
 * Inputs are the frozen full redraw, the frozen head-04 spec, and the frozen
 * base atlas.  No previous head-04 mask/layer/composite is read.  The output
 * is intentionally a critic candidate: exact recompose and protected-pet
 * gates remain explicit in the report and are never silently waived.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, specPath, maskPath, layerPath, reportPath] = process.argv.slice(2);
if (!targetPath || !specPath || !maskPath || !layerPath || !reportPath) throw new Error('usage: node scripts/extract-head04-starclip-independent.mjs <frozen-target> <spec> <mask> <layer> <report>');
if (!/head-04-dressed-atlas-v1\.png$/i.test(path.basename(targetPath))) throw new Error('head-04 frozen target required');
const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
if (spec.item?.id !== 'head-04' || spec.atlas?.cells !== 20) throw new Error('head-04 frozen spec required');
const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const CHANNELS = 4;
const target = await sharp(targetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (target.info.width !== WIDTH || target.info.height !== HEIGHT) throw new Error('head-04 target must be 800x640');
const d = target.data;
const sha = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const basePath = path.resolve(spec.references.base.path); const baseHash = await sha(basePath); if (baseHash !== spec.references.base.sha256) throw new Error(`frozen base hash mismatch: ${baseHash}`);
const base = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); if (base.info.width !== WIDTH || base.info.height !== HEIGHT) throw new Error('frozen base must be 800x640');
const at = (col, row, x, y) => ((row * CELL + y) * WIDTH + col * CELL + x) * CHANNELS;
const local = (x, y) => y * CELL + x;
const colour = (offset) => {
  const r = d[offset]; const g = d[offset + 1]; const b = d[offset + 2];
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return {
    r, g, b, spread,
    blue: b >= 48 && b > r * 1.08 && b >= g * 0.96 && b - Math.min(r, g, b) >= 14,
    purple: r >= 65 && b >= 78 && r > g * 1.08 && b > g * 1.04,
    gold: r >= 105 && g >= 50 && b <= 165 && r > g * 1.04 && g > b * 1.07,
    coolEdge: b >= r - 2 && b >= g - 2 && (spread >= 5 || Math.min(r, g, b) < 220),
    warmPet: r > b + 12 && r >= g,
  };
};
const nearBits = (bits, x, y, distance = 2) => {
  for (let oy = -distance; oy <= distance; oy += 1) for (let ox = -distance; ox <= distance; ox += 1) {
    const nx = x + ox; const ny = y + oy;
    if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL && bits[local(nx, ny)]) return true;
  }
  return false;
};
const components = (bits) => {
  const seen = new Uint8Array(bits.length); const out = [];
  for (let s = 0; s < bits.length; s += 1) if (bits[s] && !seen[s]) {
    const queue = [s]; const pixels = []; seen[s] = 1; let minX = CELL; let minY = CELL; let maxX = -1; let maxY = -1;
    for (let head = 0; head < queue.length; head += 1) {
      const p = queue[head]; pixels.push(p); const x = p % CELL; const y = Math.floor(p / CELL);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const n = local(nx, ny); if (bits[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
      }
    }
    out.push({ pixels, size: pixels.length, bounds: [minX, minY, maxX, maxY] });
  }
  return out.sort((a, b) => b.size - a.size);
};
const fillHoles = (bits) => {
  const outside = new Uint8Array(bits.length); const queue = [];
  for (let y = 0; y < CELL; y += 1) for (const x of [0, CELL - 1]) { const p = local(x, y); if (!bits[p] && !outside[p]) { outside[p] = 1; queue.push(p); } }
  for (let x = 0; x < CELL; x += 1) for (const y of [0, CELL - 1]) { const p = local(x, y); if (!bits[p] && !outside[p]) { outside[p] = 1; queue.push(p); } }
  for (let head = 0; head < queue.length; head += 1) {
    const p = queue[head]; const x = p % CELL; const y = Math.floor(p / CELL);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) {
      const n = local(nx, ny); if (!bits[n] && !outside[n]) { outside[n] = 1; queue.push(n); }
    }
  }
  let holes = 0; for (let p = 0; p < bits.length; p += 1) if (!bits[p] && !outside[p]) { bits[p] = 1; holes += 1; }
  return holes;
};

const mask = new Uint8Array(WIDTH * HEIGHT); const cells = [];
for (let row = 0; row < 4; row += 1) for (let col = 0; col < 5; col += 1) {
  const cellNo = row * 5 + col; const bits = new Uint8Array(CELL * CELL); const bluePurple = new Uint8Array(CELL * CELL); const gold = new Uint8Array(CELL * CELL);
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    const o = at(col, row, x, y); if (d[o + 3] < 128) continue; const c = colour(o); const p = local(x, y);
    if (c.blue || c.purple) bluePurple[p] = 1;
  }
  // Gold is semantic only when attached to the blue/purple clip material.
  // This excludes the cat's orange forehead star and ear fur.
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    const o = at(col, row, x, y); if (d[o + 3] < 128) continue; const c = colour(o); const p = local(x, y);
    const baseOffset = at(col, row, x, y); const baseDistance = base.data[baseOffset + 3] < 128 ? 255 : Math.hypot(d[o] - base.data[baseOffset], d[o + 1] - base.data[baseOffset + 1], d[o + 2] - base.data[baseOffset + 2]);
    if (c.gold && baseDistance >= 48 && nearBits(bluePurple, x, y, 2)) gold[p] = 1;
  }
  for (let p = 0; p < bits.length; p += 1) if (bluePurple[p] || gold[p]) bits[p] = 1;
  // Recover only same-coordinate antialiasing that touches recognised clip
  // material.  No geometric transform, colour replacement or old mask read.
  for (let pass = 0; pass < 2; pass += 1) {
    const next = new Uint8Array(bits); let changed = false;
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      const p = local(x, y); if (next[p] || !nearBits(bits, x, y, 1)) continue;
      const o = at(col, row, x, y); if (d[o + 3] < 128) continue; const c = colour(o);
      // Never flood through the cat's orange fur.  Warm gold may enter only
      // when the same-coordinate pixel is directly attached to the recognised
      // blue/purple clip face; cool antialiasing may enter only at a one-pixel
      // edge of that face.  This keeps ear/fur colour from becoming ribbon.
      const goldAttached = c.gold && nearBits(bluePurple, x, y, 2);
      if (c.blue || c.purple || goldAttached) { next[p] = 1; changed = true; }
    }
    bits.set(next); if (!changed) break;
  }
  const rejectedIslands = []; const rankedComponents = components(bits);
  // In this frozen target the blue/purple star-and-ribbon silhouette is one
  // connected semantic assembly in every cell.  Any detached component is a
  // pet/edge speck (or checker remnant), not a legal second accessory part;
  // drop it before topology repair.  This is stricter than merely rejecting
  // 1–2 pixel islands and prevents body pixels below the head from surviving.
  for (const component of rankedComponents.slice(1)) {
    rejectedIslands.push({ size: component.size, bounds: component.bounds, reason: 'detached-from-primary-clip-assembly' });
    for (const p of component.pixels) bits[p] = 0;
  }
  const holePixels = fillHoles(bits);
  let count = 0; for (let p = 0; p < bits.length; p += 1) if (bits[p]) { const x = p % CELL; const y = Math.floor(p / CELL); mask[(row * CELL + y) * WIDTH + col * CELL + x] = 1; count += 1; }
  cells.push({ cell: cellNo + 1, row, column: col, maskPixels: count, holePixels, rejectedIslands, components: components(bits).map((entry) => ({ size: entry.size, bounds: entry.bounds })) });
}

const layer = Buffer.alloc(WIDTH * HEIGHT * CHANNELS); let maskPixels = 0; let hiddenRgbNonZero = 0;
for (let p = 0; p < mask.length; p += 1) { const o = p * CHANNELS; if (mask[p]) { layer[o] = d[o]; layer[o + 1] = d[o + 1]; layer[o + 2] = d[o + 2]; layer[o + 3] = 255; maskPixels += 1; } }
for (let p = 0; p < mask.length; p += 1) { const o = p * CHANNELS; if (!mask[p] && (layer[o] || layer[o + 1] || layer[o + 2])) hiddenRgbNonZero += 1; }
const maskRgba = Buffer.alloc(WIDTH * HEIGHT * CHANNELS); for (let p = 0; p < mask.length; p += 1) if (mask[p]) { const o = p * CHANNELS; maskRgba[o] = 255; maskRgba[o + 1] = 255; maskRgba[o + 2] = 255; maskRgba[o + 3] = 255; }
await fs.mkdir(path.dirname(maskPath), { recursive: true }); await Promise.all([
  sharp(maskRgba, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png({ compressionLevel: 9 }).toFile(maskPath),
  sharp(layer, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png({ compressionLevel: 9 }).toFile(layerPath),
]);
let recomposeMismatchPixels = 0; let recomposeMaskRegionMismatchPixels = 0; let recomposeOutsideMaskMismatchPixels = 0; let recomposeTotalMae = 0; let targetEqualsBaseExact = 0;
for (let p = 0; p < mask.length; p += 1) { const o = p * CHANNELS; const on = mask[p] !== 0; let differs = false; let exact = true; for (let c = 0; c < CHANNELS; c += 1) { if (d[o + c] !== base.data[o + c]) exact = false; const composite = on ? d[o + c] : base.data[o + c]; const delta = Math.abs(composite - d[o + c]); recomposeTotalMae += delta; if (delta) differs = true; } if (on && exact) targetEqualsBaseExact += 1; if (differs) { recomposeMismatchPixels += 1; if (on) recomposeMaskRegionMismatchPixels += 1; else recomposeOutsideMaskMismatchPixels += 1; } }
const report = { schemaVersion: 1, verdict: 'CANDIDATE_FOR_INDEPENDENT_CRITIC', item: { id: 'head-04', category: 'head', pet: 'starpatch-cat', form: 1 }, inputs: { frozenTarget: targetPath, spec: specPath, base: basePath, previousMaskLayerRead: false }, outputs: { mask: maskPath, layer: layerPath }, geometry: { canvas: '800x640', cell: '160x160', columns: 5, rows: 4, cells: 20, transformed: false, registration: 'none' }, hashes: { frozenTarget: await sha(targetPath), spec: await sha(specPath), base: baseHash, mask: await sha(maskPath), layer: await sha(layerPath) }, totals: { maskPixels, hiddenRgbNonZero }, lineage: { target: 'frozen head-04-dressed-atlas-v1.png per head-04 spec; no prior candidate read', coordinatesPreserved: true }, bodyLock: { procedure: 'Build semantic blue/purple/gold clip mask from frozen target only; reject detached islands; source-over with frozen base at exact coordinates; critic must verify eye/face/ear/fur/tail/paw/body ROIs.', metrics: { targetEqualsBaseExact, recomposeMismatchPixels, recomposeMaskRegionMismatchPixels, recomposeOutsideMaskMismatchPixels, recomposeTotalMae, exactRecompose: recomposeMismatchPixels === 0 } }, method: 'same-coordinate hue-locked star/ribbon/clasp extraction; gold admitted only adjacent to blue/purple; enclosed holes filled; 1-2px islands rejected', cells };
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8'); console.log(JSON.stringify({ verdict: report.verdict, outputs: report.outputs, totals: report.totals, recompose: report.bodyLock.metrics, cellPixels: cells.map((cell) => cell.maskPixels) }, null, 2));
