/**
 * Extract an independent head-07 sailor-cap layer from the frozen clean
 * target.  This deliberately does not read any earlier head-07 mask/layer or
 * the forbidden background-removal PNG.  All pixels stay at their checker
 * reference coordinates; no resize, registration, rotation or colour-key
 * replacement is applied to the output layer.
 *
 * Usage:
 *   node scripts/extract-head07-sailor-independent.mjs \
 *     <clean-target-800x640> <raw-authority> <spec> <mask> <layer> <report>
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [cleanPath, rawPath, specPath, maskPath, layerPath, reportPath] = process.argv.slice(2);
if (!cleanPath || !rawPath || !specPath || !maskPath || !layerPath || !reportPath) {
  throw new Error('usage: node scripts/extract-head07-sailor-independent.mjs <clean-target> <raw-authority> <spec> <mask> <layer> <report>');
}
const forbidden = /head-07-dressed-atlas-v1\.png$/i;
for (const input of [cleanPath, rawPath]) if (forbidden.test(path.basename(input))) throw new Error(`forbidden head-07 candidate input: ${input}`);
if (!/head-07-dressed-atlas-v1-raw\.png$/i.test(path.basename(rawPath))) throw new Error('raw authority must be head-07-dressed-atlas-v1-raw.png');
const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
if (spec.item?.id !== 'head-07' || spec.atlas?.cells !== 20) throw new Error('head-07 frozen spec required');
const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const CHANNELS = 4;
const target = await sharp(cleanPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (target.info.width !== WIDTH || target.info.height !== HEIGHT) throw new Error('clean target must be 800x640');
const authority = await sharp(rawPath).metadata();
if (authority.width !== 1402 || authority.height !== 1122) throw new Error('raw authority must be 1402x1122');
const targetData = target.data;
const at = (column, row, x, y) => ((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS;
const local = (x, y) => y * CELL + x;

const colour = (offset) => {
  const r = targetData[offset]; const g = targetData[offset + 1]; const b = targetData[offset + 2];
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return {
    r, g, b, spread,
    blue: b >= 42 && b > r * 1.06 && b >= g * 0.96 && b - Math.min(r, g, b) >= 18,
    gold: r >= 110 && g >= 55 && b <= 155 && r > g * 1.04 && g > b * 1.05,
    // Lavender seam, cool shadow and cap antialiasing.  Neutral checker
    // pixels have spread <=2 and min >=240 and are excluded from this seed.
    cool: b >= r - 1 && b >= g - 1 && (spread >= 4 || Math.min(r, g, b) < 228),
    warmPet: r > b + 8 && r >= g,
  };
};

const componentInfo = (bits) => {
  const seen = new Uint8Array(bits.length); const components = [];
  for (let seed = 0; seed < bits.length; seed += 1) {
    if (!bits[seed] || seen[seed]) continue;
    const queue = [seed]; seen[seed] = 1; const pixels = [];
    let minX = CELL; let minY = CELL; let maxX = -1; let maxY = -1;
    for (let head = 0; head < queue.length; head += 1) {
      const p = queue[head]; pixels.push(p); const x = p % CELL; const y = Math.floor(p / CELL);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const n = local(nx, ny); if (bits[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
      }
    }
    components.push({ pixels, size: pixels.length, bounds: [minX, minY, maxX, maxY] });
  }
  return components.sort((a, b) => b.size - a.size);
};
const nearBits = (bits, x, y, distance = 2) => {
  for (let oy = -distance; oy <= distance; oy += 1) for (let ox = -distance; ox <= distance; ox += 1) {
    const nx = x + ox; const ny = y + oy;
    if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL && bits[local(nx, ny)]) return true;
  }
  return false;
};

const mask = new Uint8Array(WIDTH * HEIGHT);
const cells = [];
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  const cellNo = row * 5 + column;
  const blueRows = new Array(CELL).fill(0);
  const blue = new Uint8Array(CELL * CELL);
  const material = new Uint8Array(CELL * CELL);
  const cool = new Uint8Array(CELL * CELL);
  const gold = new Uint8Array(CELL * CELL);
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    const offset = at(column, row, x, y); const c = colour(offset); const p = local(x, y);
    if (targetData[offset + 3] < 128) continue;
    if (c.blue) { blue[p] = 1; blueRows[y] += 1; }
    if (c.cool) cool[p] = 1;
    if (c.gold) gold[p] = 1;
  }
  const bandRow = blueRows.indexOf(Math.max(...blueRows));
  const goldGuardX = [];
  for (let y = Math.max(0, bandRow - 3); y <= Math.min(CELL - 1, bandRow + 3); y += 1) for (let x = 0; x < CELL; x += 1) if (blue[local(x, y)]) goldGuardX.push(x);
  const goldGuardMin = goldGuardX.length ? Math.min(...goldGuardX) : 0;
  const goldGuardMax = goldGuardX.length ? Math.max(...goldGuardX) : CELL - 1;
  // Resolve gold that is physically attached to the blue cap assembly before
  // admitting any warm pixels. Orange pet fur elsewhere in the cell is never
  // a gold accessory component.
  const accessoryGold = new Uint8Array(CELL * CELL);
  // The pet's forehead star begins below the brim. Keep the gold anchor's
  // terminal pixels, but stop the gold search four pixels below the detected
  // band row; anything lower is protected pet face/forehead content.
  for (let y = 0; y < Math.min(CELL, bandRow + 5); y += 1) for (let x = goldGuardMin; x <= goldGuardMax; x += 1) {
    const p = local(x, y); if (gold[p] && nearBits(blue, x, y, 3)) accessoryGold[p] = 1;
  }
  // Only material above/around the blue brim is allowed to define the cap
  // envelope.  Warm ears/fur below the brim can never enter this guard.
  const capMaterial = new Uint8Array(CELL * CELL);
  for (let y = 0; y <= Math.min(CELL - 1, bandRow + 3); y += 1) for (let x = 0; x < CELL; x += 1) {
    const p = local(x, y); if (cool[p] || blue[p]) capMaterial[p] = 1;
  }
  // Use the widest blue-band support span as the cap's horizontal guard.  In
  // rear cells, cool-toned ear interiors sit outside this span; allowing the
  // raw cap-material min/max would therefore copy both ears into the crown.
  // A four-pixel antialias allowance keeps the outer lavender seam intact.
  const bandSupportX = [];
  for (let y = Math.max(0, bandRow - 2); y <= Math.min(CELL - 1, bandRow + 2); y += 1) for (let x = 0; x < CELL; x += 1) if (blue[local(x, y)]) bandSupportX.push(x);
  const supportMin = bandSupportX.length ? Math.max(0, Math.min(...bandSupportX) - 4) : 0;
  const supportMax = bandSupportX.length ? Math.min(CELL - 1, Math.max(...bandSupportX) + 4) : CELL - 1;
  const rows = [];
  for (let y = 0; y <= Math.min(CELL - 1, bandRow + 3); y += 1) {
    const xs = []; for (let x = supportMin; x <= supportMax; x += 1) if (capMaterial[local(x, y)]) xs.push(x);
    if (xs.length >= 2) rows.push({ y, min: Math.min(...xs), max: Math.max(...xs) });
  }
  if (!rows.length) throw new Error(`cell ${cellNo + 1} has no cap envelope material`);
  const minY = rows[0].y; const maxY = Math.min(CELL - 1, bandRow + 3);
  const bounds = [];
  const median = (values) => { const sorted = values.slice().sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
  for (let y = minY; y <= maxY; y += 1) {
    const before = rows.filter((entry) => entry.y <= y).at(-1); const after = rows.find((entry) => entry.y >= y);
    const fallback = before ?? after;
    const left = before && after ? Math.round(before.min + (after.min - before.min) * ((y - before.y) / Math.max(1, after.y - before.y))) : fallback.min;
    const right = before && after ? Math.round(before.max + (after.max - before.max) * ((y - before.y) / Math.max(1, after.y - before.y))) : fallback.max;
    const sample = rows.filter((entry) => Math.abs(entry.y - y) <= 2);
    bounds.push({ y, min: median(sample.map((entry) => entry.min)), max: median(sample.map((entry) => entry.max)), interpolatedLeft: left, interpolatedRight: right });
  }
  // Seed the cap crown from the envelope.  Keep a one-pixel antialiasing
  // allowance around the traced silhouette, but reject warm pet pixels at the
  // boundary.  This is the body-lock: only a warm pixel physically touching a
  // previously recognised accessory-gold pixel may enter the crown.  Without
  // this guard the cat's orange ears are indistinguishable from the cap's
  // gold anchor when the envelope is rasterised.
  for (const bound of bounds) for (let x = Math.max(0, bound.min - 1); x <= Math.min(CELL - 1, bound.max + 1); x += 1) {
    const offset = at(column, row, x, bound.y); const c = colour(offset);
    const p = local(x, bound.y);
    const goldNearby = x >= goldGuardMin && x <= goldGuardMax && (accessoryGold[p] || nearBits(accessoryGold, x, bound.y, 1));
    if (targetData[offset + 3] >= 128 && (!c.warmPet || goldNearby)) mask[(row * CELL + bound.y) * WIDTH + column * CELL + x] = 255;
  }
  // Blue bow, band, and gold anchor/knot outside the crown envelope.  Their
  // hue is disjoint from this pet's orange fur; the head-height limit prevents
  // tail/body/eye contamination.  One-pixel antialiasing is recovered only
  // within Chebyshev distance one of recognized material.
  const seed = new Uint8Array(CELL * CELL);
  for (let y = 0; y < Math.min(CELL, bandRow + 36); y += 1) for (let x = 0; x < CELL; x += 1) {
    const offset = at(column, row, x, y); const c = colour(offset); const p = local(x, y);
    if (targetData[offset + 3] >= 128 && (c.blue || accessoryGold[p])) seed[p] = 1;
  }
  for (let pass = 0; pass < 2; pass += 1) {
    const next = new Uint8Array(seed); let changed = false;
    for (let y = 0; y < Math.min(CELL, bandRow + 36); y += 1) for (let x = 0; x < CELL; x += 1) {
      const p = local(x, y); if (next[p]) continue;
      let near = false; for (let oy = -1; oy <= 1 && !near; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
        const nx = x + ox; const ny = y + oy; if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL && seed[local(nx, ny)]) near = true;
      }
      if (!near) continue;
      const c = colour(at(column, row, x, y));
      const goldNearby = x >= goldGuardMin && x <= goldGuardMax && (accessoryGold[p] || nearBits(accessoryGold, x, y, 1));
      // Outside the crown, a cool pixel is only antialiasing when it hugs an
      // existing blue/gold material pixel.  Do not let isolated cool/neutral
      // antialiasing on the pet's forehead star or eye bridge the mask.
      const coolEdge = c.cool && c.spread >= 4 && nearBits(seed, x, y, 1);
      if (c.blue || goldNearby || coolEdge) { next[p] = 1; changed = true; }
    }
    seed.set(next); if (!changed) break;
  }
  for (let p = 0; p < seed.length; p += 1) if (seed[p]) {
    const x = p % CELL; const y = Math.floor(p / CELL); mask[(row * CELL + y) * WIDTH + column * CELL + x] = 255;
  }
  // Topology repair is deliberately limited to enclosed zero regions inside
  // this cell's already recognised accessory mask.  A 4-connected flood from
  // the cell border identifies genuine holes (for example the dark centre of
  // the anchor); open concavities between the brim/bow and the pet remain
  // transparent.  Filling only enclosed regions keeps eye/tail pixels out of
  // the mask while guaranteeing the frozen spec's hole count is zero.
  const cellBits = new Uint8Array(CELL * CELL);
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) cellBits[local(x, y)] = mask[(row * CELL + y) * WIDTH + column * CELL + x] ? 1 : 0;
  const outside = new Uint8Array(CELL * CELL); const queue = [];
  for (let y = 0; y < CELL; y += 1) for (const x of [0, CELL - 1]) {
    const p = local(x, y); if (!cellBits[p] && !outside[p]) { outside[p] = 1; queue.push(p); }
  }
  for (let x = 0; x < CELL; x += 1) for (const y of [0, CELL - 1]) {
    const p = local(x, y); if (!cellBits[p] && !outside[p]) { outside[p] = 1; queue.push(p); }
  }
  for (let head = 0; head < queue.length; head += 1) {
    const p = queue[head]; const x = p % CELL; const y = Math.floor(p / CELL);
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
      const n = local(nx, ny); if (!cellBits[n] && !outside[n]) { outside[n] = 1; queue.push(n); }
    }
  }
  let holePixels = 0;
  for (let p = 0; p < cellBits.length; p += 1) if (!cellBits[p] && !outside[p]) {
    cellBits[p] = 1; holePixels += 1;
    const x = p % CELL; const y = Math.floor(p / CELL); mask[(row * CELL + y) * WIDTH + column * CELL + x] = 255;
  }
  // Reject detached 1–2 pixel specks.  They are normally checker/edge noise
  // (or a warm pet antialias pixel) rather than part of the cap; accepting
  // them would violate the frozen spec's loose-island rule.  Components of
  // three pixels or more remain eligible for critic review.
  const rejectedIslands = [];
  for (const component of componentInfo(cellBits)) if (component.size < 3) {
    rejectedIslands.push({ size: component.size, bounds: component.bounds });
    for (const p of component.pixels) {
      cellBits[p] = 0;
      const x = p % CELL; const y = Math.floor(p / CELL); mask[(row * CELL + y) * WIDTH + column * CELL + x] = 0;
    }
  }
  const semantic = cellBits;
  for (let p = 0; p < semantic.length; p += 1) {
    const x = p % CELL; const y = Math.floor(p / CELL);
    if (mask[(row * CELL + y) * WIDTH + column * CELL + x]) semantic[p] = 1;
  }
  cells.push({ cell: cellNo + 1, row, column, bandRow, capEnvelope: { minY, maxY, bounds: bounds.map(({ y, min, max }) => [y, min, max]) }, maskPixels: semantic.reduce((sum, value) => sum + value, 0), holes: { holePixels, remaining: 0 }, rejectedIslands, components: componentInfo(semantic).map((entry) => ({ size: entry.size, bounds: entry.bounds })) });
}

const layer = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
let maskPixels = 0; let hiddenRgbNonZero = 0;
for (let y = 0; y < HEIGHT; y += 1) for (let x = 0; x < WIDTH; x += 1) {
  const pixel = y * WIDTH + x; const source = pixel * CHANNELS;
  if (mask[pixel]) {
    layer[source] = targetData[source]; layer[source + 1] = targetData[source + 1]; layer[source + 2] = targetData[source + 2]; layer[source + 3] = 255; maskPixels += 1;
  } else if (layer[source] || layer[source + 1] || layer[source + 2]) hiddenRgbNonZero += 1;
}
const maskRgba = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
for (let p = 0; p < mask.length; p += 1) { const o = p * CHANNELS; if (mask[p]) { maskRgba[o] = 255; maskRgba[o + 1] = 255; maskRgba[o + 2] = 255; maskRgba[o + 3] = 255; } }
await fs.mkdir(path.dirname(maskPath), { recursive: true });
await Promise.all([
  sharp(maskRgba, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png({ compressionLevel: 9 }).toFile(maskPath),
  sharp(layer, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png({ compressionLevel: 9 }).toFile(layerPath),
]);
const sha = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const basePath = path.resolve(spec.references?.base?.path ?? '');
if (!basePath || !(await fs.stat(basePath).catch(() => false))) throw new Error(`frozen base reference missing: ${basePath}`);
const baseHash = await sha(basePath);
if (spec.references?.base?.sha256 && baseHash !== spec.references.base.sha256) throw new Error(`frozen base hash mismatch: ${baseHash}`);
const base = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (base.info.width !== WIDTH || base.info.height !== HEIGHT) throw new Error(`frozen base atlas must be ${WIDTH}x${HEIGHT}`);
let maskOnTransparentBase = 0; let targetEqualsBaseExact = 0;
let recomposeMismatchPixels = 0; let recomposeMaskRegionMismatchPixels = 0; let recomposeOutsideMaskMismatchPixels = 0; let recomposeTotalMae = 0;
for (let p = 0; p < mask.length; p += 1) if (mask[p]) {
  const o = p * CHANNELS;
  if (base.data[o + 3] < 128) maskOnTransparentBase += 1;
  let exact = true; for (let c = 0; c < CHANNELS; c += 1) if (targetData[o + c] !== base.data[o + c]) exact = false;
  if (exact) targetEqualsBaseExact += 1;
}
for (let p = 0; p < mask.length; p += 1) {
  const o = p * CHANNELS; const on = mask[p] !== 0; let differs = false;
  for (let c = 0; c < CHANNELS; c += 1) {
    const composite = on ? targetData[o + c] : base.data[o + c];
    const delta = Math.abs(composite - targetData[o + c]); recomposeTotalMae += delta; if (delta) differs = true;
  }
  if (differs) { recomposeMismatchPixels += 1; if (on) recomposeMaskRegionMismatchPixels += 1; else recomposeOutsideMaskMismatchPixels += 1; }
}
const report = {
  schemaVersion: 1,
  verdict: 'CANDIDATE_FOR_INDEPENDENT_CRITIC',
  item: { id: 'head-07', category: 'head', pet: 'starpatch-cat', form: 1 },
  inputs: { cleanTarget: cleanPath, rawAuthority: rawPath, spec: specPath, base: basePath, forbiddenInputRead: false },
  outputs: { mask: maskPath, layer: layerPath },
  geometry: { canvas: '800x640', cell: '160x160', columns: 5, rows: 4, cells: 20, transformed: false, registration: 'none' },
  hashes: { cleanTarget: await sha(cleanPath), rawAuthority: await sha(rawPath), spec: await sha(specPath), base: baseHash, mask: await sha(maskPath), layer: await sha(layerPath) },
  totals: { maskPixels, hiddenRgbNonZero },
  lineage: { rawToClean: 'authoritative raw 1402x1122 -> clean target 800x640 via sharp lanczos3; see clean-target-v3.json', cleanTargetFrozenBeforeMask: true, forbiddenAncestorRead: false, checkerCoordinatesPreserved: true },
  bodyLock: { procedure: 'Read frozen base atlas by spec hash; build mask only from clean target in same coordinates; reject warm pet pixels and detached 1-2px islands; never use base to copy layer colour; compositing critic must still verify protected eye/face/ear/fur/tail/paw/bowl/body ROIs.', metrics: { baseCanvas: `${base.info.width}x${base.info.height}`, maskOnTransparentBase, targetEqualsBaseExact, recomposeMismatchPixels, recomposeMaskRegionMismatchPixels, recomposeOutsideMaskMismatchPixels, recomposeTotalMae, exactRecompose: recomposeMismatchPixels === 0 } },
  method: 'same-coordinate semantic cap envelope plus hue-locked blue/gold material; warm pet pixels excluded; enclosed holes filled; detached 1-2px islands rejected; no prior mask/layer read',
  cells,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, outputs: report.outputs, totals: report.totals, cellPixels: cells.map((cell) => cell.maskPixels) }, null, 2));
