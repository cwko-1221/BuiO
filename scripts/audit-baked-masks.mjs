/**
 * Look over a baked accessory layer for the two ways it goes wrong.
 *
 * A mask fails by having too little or too much. Too little shows as a hole: a patch of the
 * accessory left out, surrounded on all sides by accessory, which the game will draw the floor
 * through. Too much shows as the creature's own outline coming along for the ride: the generator
 * redrew the fur, the redraw's outline sits a pixel or two off the original's, and the difference
 * between them is a thin arc that hugs the silhouette. Both are easy to miss by eye on a sheet of
 * twenty poses and neither survives being counted.
 *
 * An arc of borrowed outline is told from a real accessory by two things at once: it lies along
 * the edge of the creature as the base sheet drew it, and it is thin — its area divided by its
 * longest side is a couple of pixels, where a collar or a cape is tens.
 *
 *   node scripts/audit-baked-masks.mjs <base.png> <layer.png…>
 */
import path from 'node:path';
import sharp from 'sharp';

/** How far either side of the base silhouette counts as being on its edge, in sheet pixels. */
const BAND = 14;
/** A region this much on the edge and this thin is the creature's outline, not something worn. */
const ON_EDGE = 0.75;
const THIN = 6;

const grow = (mask, W, H, r) => {
  const pass = (from, along) => {
    const to = new Uint8Array(W * H);
    const outer = along ? H : W;
    const inner = along ? W : H;
    for (let a = 0; a < outer; a += 1) {
      let run = -1;
      for (let b = 0; b < inner; b += 1) if (from[along ? a * W + b : b * W + a]) run = b;
      if (run < 0) continue;
      for (let b = 0; b < inner; b += 1) {
        let on = 0;
        for (let d = -r; d <= r && !on; d += 1) {
          const n = b + d;
          if (n >= 0 && n < inner && from[along ? a * W + n : n * W + a]) on = 1;
        }
        to[along ? a * W + b : b * W + a] = on;
      }
    }
    return to;
  };
  return pass(pass(mask, true), false);
};
const shrink = (mask, W, H, r) => {
  const flip = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i += 1) flip[i] = mask[i] ? 0 : 1;
  const out = grow(flip, W, H, r);
  for (let i = 0; i < W * H; i += 1) out[i] = out[i] ? 0 : 1;
  return out;
};

/** Every connected run of set pixels, with the box it occupies. */
function regions(mask, W, H) {
  const seen = new Uint8Array(W * H);
  const queue = new Int32Array(W * H);
  const found = [];
  for (let start = 0; start < W * H; start += 1) {
    if (seen[start] || !mask[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail += 1, tail - 1] = start;
    seen[start] = 1;
    let left = W, right = 0, top = H, bottom = 0, area = 0;
    const pixels = [];
    while (head < tail) {
      const at = queue[head += 1, head - 1];
      const x = at % W;
      const y = (at - x) / W;
      area += 1;
      pixels.push(at);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const next = ny * W + nx;
        if (seen[next] || !mask[next]) continue;
        seen[next] = 1;
        queue[tail += 1, tail - 1] = next;
      }
    }
    found.push({ pixels, area, left, right, top, bottom });
  }
  return found;
}

const [baseFile, ...layers] = process.argv.slice(2);
if (!baseFile || !layers.length) {
  console.error('usage: node scripts/audit-baked-masks.mjs <base.png> <layer.png…>');
  process.exit(1);
}

const base = await sharp(baseFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = base.info.width;
const H = base.info.height;
const N = W * H;
const body = new Uint8Array(N);
for (let i = 0; i < N; i += 1) body[i] = base.data[i * 4 + 3] > 32 ? 1 : 0;
const band = new Uint8Array(N);
{
  const wide = grow(body, W, H, BAND);
  const tight = shrink(body, W, H, BAND);
  for (let i = 0; i < N; i += 1) band[i] = wide[i] && !tight[i] ? 1 : 0;
}

console.log('sheet          pieces  outline-arcs  arc px    holes  worst hole  verdict');
for (const file of layers) {
  const { data } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i += 1) mask[i] = data[i * 4 + 3] > 8 ? 1 : 0;

  // Pieces of the mask, and which of them are the creature's own outline.
  let arcs = 0;
  let arcPixels = 0;
  const pieces = regions(mask, W, H);
  for (const piece of pieces) {
    let onEdge = 0;
    for (const at of piece.pixels) if (band[at]) onEdge += 1;
    const spine = piece.area / Math.max(piece.right - piece.left + 1, piece.bottom - piece.top + 1);
    if (onEdge / piece.area >= ON_EDGE && spine <= THIN) { arcs += 1; arcPixels += piece.area; }
  }

  // Holes: transparent, and not reachable from outside the mask.
  const outside = new Uint8Array(N);
  const queue = new Int32Array(N);
  let tail = 0;
  const reach = (p) => { if (!outside[p] && !mask[p]) { outside[p] = 1; queue[tail += 1, tail - 1] = p; } };
  for (let x = 0; x < W; x += 1) { reach(x); reach((H - 1) * W + x); }
  for (let y = 0; y < H; y += 1) { reach(y * W); reach(y * W + W - 1); }
  for (let head = 0; head < tail; head += 1) {
    const p = queue[head];
    const x = p % W;
    const y = (p - x) / W;
    if (x > 0) reach(p - 1);
    if (x + 1 < W) reach(p + 1);
    if (y > 0) reach(p - W);
    if (y + 1 < H) reach(p + W);
  }
  const gaps = new Uint8Array(N);
  for (let i = 0; i < N; i += 1) gaps[i] = !mask[i] && !outside[i] ? 1 : 0;
  const holes = regions(gaps, W, H);
  const worst = holes.reduce((big, hole) => Math.max(big, hole.area), 0);

  const name = path.basename(file).replace(/-full-redraw.*/, '');
  const bad = [];
  if (arcs) bad.push(`${arcs} outline`);
  if (worst > 400) bad.push('holes');
  console.log(`${name.padEnd(14)} ${String(pieces.length).padStart(6)}  ${String(arcs).padStart(12)}  ${String(arcPixels).padStart(7)}  `
    + `${String(holes.length).padStart(6)}  ${String(worst).padStart(10)}  ${bad.length ? bad.join(', ') : 'clean'}`);
}
