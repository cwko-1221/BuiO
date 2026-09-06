/**
 * Does one transform per pose serve every accessory in a slot?
 *
 * The whole point of the proposed pipeline is that "where the head goes in pose p" is a property
 * of the pet, not of the thing worn on it. If that holds, one drawing of an accessory can be
 * carried into all twenty poses by a transform derived once, and the twenty-poses-per-item cost
 * disappears. This script tests the claim against the accessories already baked, and changes
 * nothing: it reads the published patches and writes a report and a picture to tmp/.
 *
 * For each item and each pose it estimates the affine that best carries the item's own art from
 * its facing's canonical pose onto that pose, then asks the question that matters: if every item
 * in the slot is forced to use the *same* transform — the slot's median — how much fit is lost?
 * Where the answer is "almost none", the pipeline works. Where it is not, that pose is one the
 * plan repairs by redrawing, and the residual here is what picks it out.
 *
 *   node scripts/spike-slot-transforms.mjs [--items 29] [--out tmp/slot-transforms]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { catalog } = require('../pet-app/lib/catalog.js');

const argv = process.argv.slice(2);
const option = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? argv[at + 1] : fallback;
};
const OUT = option('out', 'tmp/slot-transforms');
const LIMIT = Number(option('items', '999'));

const PET = 'starpatch-cat';
const STAGE = 1;
const COLUMNS = 5;
const ROWS = 4;

/**
 * A collar seen from the side is a different drawing, not the front drawing turned. So a pose is
 * carried from the canonical pose *of its own facing*: the first cell of its row. Row four is the
 * exception — it holds one-off poses, and each is mapped from whichever facing it is drawn in.
 */
const SOURCE_OF = [
  null, 0, 0, 0, 0,
  null, 5, 5, 5, 5,
  null, 10, 10, 10, 10,
  0, 0, 5, 0, 0,
];
const POSE_NAME = [
  'idle front', 'walk front A', 'walk front B', 'walk front C', 'blink front',
  'idle side', 'walk side A', 'walk side B', 'walk side C', 'crouch side',
  'idle back', 'walk back A', 'walk back B', 'walk back C', 'blink back',
  'feeding', 'jumping', 'sleeping', 'sitting', 'surprised',
];

// --- small dense-matrix helpers, all 2x2 -----------------------------------------------------

const mul = (A, B) => [
  A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3],
  A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3],
];
const apply = (A, x, y) => [A[0] * x + A[1] * y, A[2] * x + A[3] * y];
const invert = (A) => {
  const det = A[0] * A[3] - A[1] * A[2];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-9) return null;
  return [A[3] / det, -A[1] / det, -A[2] / det, A[0] / det];
};
const rotation = (t) => [Math.cos(t), -Math.sin(t), Math.sin(t), Math.cos(t)];

/** Both square roots of a symmetric positive-definite 2x2, by eigendecomposition. */
function roots(a, b, c) {
  const mid = (a + c) / 2;
  const gap = Math.hypot((a - c) / 2, b);
  const l1 = Math.max(mid + gap, 1e-6);
  const l2 = Math.max(mid - gap, 1e-6);
  let v1;
  if (Math.abs(b) > 1e-9) { const n = Math.hypot(l1 - c, b); v1 = [(l1 - c) / n, b / n]; }
  else v1 = a >= c ? [1, 0] : [0, 1];
  const v2 = [-v1[1], v1[0]];
  const V = [v1[0], v2[0], v1[1], v2[1]];
  const Vt = [V[0], V[2], V[1], V[3]];
  const half = mul(mul(V, [Math.sqrt(l1), 0, 0, Math.sqrt(l2)]), Vt);
  const invHalf = mul(mul(V, [1 / Math.sqrt(l1), 0, 0, 1 / Math.sqrt(l2)]), Vt);
  return { half, invHalf };
}

// --- reading the published patches ------------------------------------------------------------

/** One cell's alpha, plus the moments the transform is initialised from. */
function cellStats(alpha, width, cell, index) {
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const x0 = col * cell;
  const y0 = row * cell;
  const data = new Float32Array(cell * cell);
  let m0 = 0;
  let mx = 0;
  let my = 0;
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const a = alpha[(y0 + y) * width + (x0 + x)] / 255;
      data[y * cell + x] = a;
      m0 += a; mx += a * x; my += a * y;
    }
  }
  if (m0 < 12) return { area: m0, data, empty: true };
  const cx = mx / m0;
  const cy = my / m0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const a = data[y * cell + x];
      if (!a) continue;
      const dx = x - cx;
      const dy = y - cy;
      sxx += a * dx * dx; sxy += a * dx * dy; syy += a * dy * dy;
    }
  }
  return { area: m0, data, empty: false, cx, cy, sxx: sxx / m0, sxy: sxy / m0, syy: syy / m0 };
}

/**
 * How far the carried art sits from the real art, in pixels of the atlas cell.
 *
 * Overlap is the wrong headline for these shapes: a collar is a thin arc, so an error of one pixel
 * along both its edges halves the intersection while being invisible on screen. Distance says what
 * the eye would say — a strap two pixels low is two pixels low whether it is thin or thick.
 */
function displacement(source, target, cell, M, t) {
  const Minv = invert(M);
  if (!Minv) return Infinity;
  const warped = new Uint8Array(cell * cell);
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const [sx, sy] = apply(Minv, x - t[0], y - t[1]);
      const ix = Math.round(sx);
      const iy = Math.round(sy);
      if (ix >= 0 && iy >= 0 && ix < cell && iy < cell && source[iy * cell + ix] > 0.4) warped[y * cell + x] = 1;
    }
  }
  const solid = new Uint8Array(cell * cell);
  for (let i = 0; i < target.length; i += 1) solid[i] = target[i] > 0.4 ? 1 : 0;
  const edge = (mask) => {
    const out = [];
    for (let y = 0; y < cell; y += 1) {
      for (let x = 0; x < cell; x += 1) {
        if (!mask[y * cell + x]) continue;
        const open = x === 0 || y === 0 || x === cell - 1 || y === cell - 1
          || !mask[y * cell + x - 1] || !mask[y * cell + x + 1]
          || !mask[(y - 1) * cell + x] || !mask[(y + 1) * cell + x];
        if (open) out.push([x, y]);
      }
    }
    return out;
  };
  /** Chamfer distance to a set of points, swept forwards then backwards. */
  const field = (points) => {
    const dist = new Float32Array(cell * cell).fill(1e6);
    for (const [x, y] of points) dist[y * cell + x] = 0;
    const step = (x, y, dx, dy, add) => {
      const fx = x + dx;
      const fy = y + dy;
      if (fx < 0 || fy < 0 || fx >= cell || fy >= cell) return;
      const value = dist[fy * cell + fx] + add;
      if (value < dist[y * cell + x]) dist[y * cell + x] = value;
    };
    for (let y = 0; y < cell; y += 1) for (let x = 0; x < cell; x += 1) {
      step(x, y, -1, 0, 1); step(x, y, 0, -1, 1); step(x, y, -1, -1, 1.414); step(x, y, 1, -1, 1.414);
    }
    for (let y = cell - 1; y >= 0; y -= 1) for (let x = cell - 1; x >= 0; x -= 1) {
      step(x, y, 1, 0, 1); step(x, y, 0, 1, 1); step(x, y, 1, 1, 1.414); step(x, y, -1, 1, 1.414);
    }
    return dist;
  };
  const realEdge = edge(solid);
  const warpEdge = edge(warped);
  if (!realEdge.length || !warpEdge.length) return Infinity;
  // Symmetric: how far the drawn outline sits from the carried one, and the other way round. A
  // one-sided reading calls a warp that covers the real shape and a lot besides a perfect fit.
  const toWarp = field(warpEdge);
  const toReal = field(realEdge);
  const pick = (points, dist) => {
    const values = points.map(([x, y]) => Math.min(dist[y * cell + x], cell)).sort((a, b) => a - b);
    return values[values.length >> 1];
  };
  return Math.max(pick(realEdge, toWarp), pick(warpEdge, toReal));
}

/** Overlap of the source cell carried by (M, t) with the target cell, as intersection over union. */
function overlap(source, target, cell, M, t) {
  const Minv = invert(M);
  if (!Minv) return 0;
  let both = 0;
  let either = 0;
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const [sx, sy] = apply(Minv, x - t[0], y - t[1]);
      let warped = 0;
      const ix = Math.round(sx);
      const iy = Math.round(sy);
      if (ix >= 0 && iy >= 0 && ix < cell && iy < cell) warped = source[iy * cell + ix];
      const here = target[y * cell + x];
      const a = warped > 0.4 ? 1 : 0;
      const b = here > 0.4 ? 1 : 0;
      if (a && b) both += 1;
      if (a || b) either += 1;
    }
  }
  return either ? both / either : 0;
}

/**
 * The best affine carrying one cell onto another.
 *
 * Moments fix everything but the turn: the two covariances give the shape change up to a rotation,
 * so the rotation is the one parameter left to search, and it is searched on the picture itself
 * rather than on the moments, because overlap is what the eye will judge.
 */
function fit(source, target, cell) {
  if (source.empty || target.empty) return null;
  const s = roots(source.sxx, source.sxy, source.syy);
  const t = roots(target.sxx, target.sxy, target.syy);
  const base = (theta) => {
    const M = mul(mul(t.half, rotation(theta)), s.invHalf);
    const off = apply(M, source.cx, source.cy);
    return { M, t: [target.cx - off[0], target.cy - off[1]] };
  };
  let best = { score: -1 };
  for (let deg = 0; deg < 360; deg += 3) {
    const cand = base((deg * Math.PI) / 180);
    const score = overlap(source.data, target.data, cell, cand.M, cand.t);
    if (score > best.score) best = { score, deg, ...cand };
  }
  for (let deg = best.deg - 3; deg <= best.deg + 3; deg += 0.5) {
    const cand = base((deg * Math.PI) / 180);
    const score = overlap(source.data, target.data, cell, cand.M, cand.t);
    if (score > best.score) best = { score, deg, ...cand };
  }
  return best;
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

// --- run ---------------------------------------------------------------------------------------

const bySlot = new Map();
for (const [key, entry] of Object.entries(catalog.redrawnWearables)) {
  const [petId, stage, itemId] = key.split(':');
  if (petId !== PET || Number(stage) !== STAGE) continue;
  const url = entry.patch || entry.front || entry.rear;
  if (!url) continue;
  if (!bySlot.has(entry.slot)) bySlot.set(entry.slot, []);
  bySlot.get(entry.slot).push({ itemId, file: path.join('pet-app/public', url.replace(/^\/pet\//, '')) });
}

await fs.mkdir(OUT, { recursive: true });
const report = { pet: `${PET}:${STAGE}`, slots: {}, poses: {} };
const sheets = [];

for (const [slot, items] of [...bySlot].sort()) {
  const use = items.slice(0, LIMIT);
  console.log(`\n${slot}  ${use.length} items`);
  const cells = new Map();
  let cell = 0;
  for (const item of use) {
    const image = sharp(item.file).ensureAlpha();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    cell = Math.round(info.width / COLUMNS);
    const alpha = new Uint8Array(info.width * info.height);
    for (let i = 0; i < alpha.length; i += 1) alpha[i] = data[i * 4 + 3];
    cells.set(item.itemId, Array.from({ length: COLUMNS * ROWS }, (_, i) => cellStats(alpha, info.width, cell, i)));
  }

  const perPose = [];
  for (let pose = 0; pose < COLUMNS * ROWS; pose += 1) {
    const from = SOURCE_OF[pose];
    if (from === null) continue;
    const fits = [];
    let hidden = 0;
    for (const item of use) {
      const source = cells.get(item.itemId)[from];
      const target = cells.get(item.itemId)[pose];
      // A piece the pose only half shows has moments that describe the visible half, so the fit it
      // asks for is not a statement about the head. Those are counted, not averaged in.
      if (!source.empty && !target.empty && (target.area < source.area * 0.55 || target.area > source.area * 1.8)) {
        hidden += 1;
        continue;
      }
      const best = fit(source, target, cell);
      if (best) fits.push({ itemId: item.itemId, ...best });
    }
    if (fits.length < 3) { perPose.push({ pose, drawn: fits.length, hidden, skipped: true }); continue; }

    // The slot's own transform: the median of what each item asked for, which is the number the
    // pipeline would ship. Median rather than mean so one badly fitted item cannot drag it.
    const shared = {
      M: [0, 1, 2, 3].map((i) => median(fits.map((f) => f.M[i]))),
      t: [0, 1].map((i) => median(fits.map((f) => f.t[i]))),
    };
    const sharedScores = [];
    const sharedPixels = [];
    const ownPixels = [];
    for (const f of fits) {
      const source = cells.get(f.itemId)[from];
      const target = cells.get(f.itemId)[pose];
      sharedScores.push(overlap(source.data, target.data, cell, shared.M, shared.t));
      sharedPixels.push(displacement(source.data, target.data, cell, shared.M, shared.t));
      ownPixels.push(displacement(source.data, target.data, cell, f.M, f.t));
    }
    const own = median(fits.map((f) => f.score));
    const together = median(sharedScores);
    const ownPx = median(ownPixels);
    const sharedPx = median(sharedPixels);
    perPose.push({
      pose, from, drawn: fits.length, hidden,
      ownFit: own, sharedFit: together, ownPx, sharedPx,
      worstPx: Math.max(...sharedPixels),
      shared,
    });
    // Two pixels on a 160px cell is under a pixel and a half on screen, which is where a
    // misplaced strap stops being something anyone notices.
    const verdict = sharedPx <= 2 ? 'warp' : sharedPx <= 4 ? 'check' : 'REDRAW';
    console.log(
      `  ${String(pose).padStart(2)} ${POSE_NAME[pose].padEnd(13)} `
      + `n=${String(fits.length).padStart(2)}${hidden ? `+${hidden}h` : '   '}`
      + `  own ${ownPx.toFixed(1)}px  shared ${sharedPx.toFixed(1)}px  worst ${Math.max(...sharedPixels).toFixed(1)}px`
      + `  (IoU ${own.toFixed(2)}→${together.toFixed(2)})  ${verdict}`,
    );
  }
  report.slots[slot] = { items: use.map((i) => i.itemId), poses: perPose };

  // A picture of the claim: the slot's own transform applied to the first item, red where the
  // real art is and the warp is not, green the other way, grey where they agree.
  const sample = use[0];
  const canvas = Buffer.alloc(COLUMNS * cell * ROWS * cell * 4);
  for (let pose = 0; pose < COLUMNS * ROWS; pose += 1) {
    const entry = perPose.find((p) => p.pose === pose);
    const target = cells.get(sample.itemId)[pose];
    const source = entry && !entry.skipped ? cells.get(sample.itemId)[entry.from] : null;
    const Minv = entry && !entry.skipped ? invert(entry.shared.M) : null;
    const col = pose % COLUMNS;
    const row = Math.floor(pose / COLUMNS);
    for (let y = 0; y < cell; y += 1) {
      for (let x = 0; x < cell; x += 1) {
        let warped = 0;
        if (Minv && source) {
          const [sx, sy] = apply(Minv, x - entry.shared.t[0], y - entry.shared.t[1]);
          const ix = Math.round(sx);
          const iy = Math.round(sy);
          if (ix >= 0 && iy >= 0 && ix < cell && iy < cell) warped = source.data[iy * cell + ix];
        }
        const here = target.data[y * cell + x];
        const a = warped > 0.4;
        const b = here > 0.4;
        const at = (((row * cell) + y) * COLUMNS * cell + (col * cell) + x) * 4;
        if (a && b) { canvas[at] = 120; canvas[at + 1] = 120; canvas[at + 2] = 128; canvas[at + 3] = 255; }
        else if (b) { canvas[at] = 208; canvas[at + 1] = 64; canvas[at + 2] = 48; canvas[at + 3] = 255; }
        else if (a) { canvas[at] = 40; canvas[at + 1] = 170; canvas[at + 2] = 150; canvas[at + 3] = 255; }
        else { canvas[at] = 18; canvas[at + 1] = 19; canvas[at + 2] = 24; canvas[at + 3] = 255; }
      }
    }
  }
  const file = path.join(OUT, `${slot}-shared-transform.png`);
  await sharp(canvas, { raw: { width: COLUMNS * cell, height: ROWS * cell, channels: 4 } }).png().toFile(file);
  sheets.push(file);
}

await fs.writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`\n${sheets.join('\n')}\n${path.join(OUT, 'report.json')}`);
