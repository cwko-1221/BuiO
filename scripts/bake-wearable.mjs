/**
 * Lift an accessory out of a redrawn pose by comparing it with the pose it was drawn onto.
 *
 * The hope was that a redraw is the original with something added, so that everything the two
 * pictures disagree about is the addition. It is not: asked to draw the same sheet again with
 * spectacles on it, the generator draws the whole cat again. On the first sheet measured, 58 per
 * cent of the inked pixels differ by 1 to 7 and another 18 per cent by 8 to 15 — everywhere, not
 * only where the spectacles are. A plain difference marks the entire animal.
 *
 * What separates them is not how big the difference is but how it is spread. An accessory is a
 * large connected region of strong difference in one place; a redrawn cat is a fine haze of weak
 * difference over all of it. So the mask is grown the way an edge detector grows one: seeded only
 * where the difference is emphatic, spread into neighbours while it stays appreciable, and then
 * anything too small to be a worn thing is dropped.
 *
 *   node scripts/bake-wearable.mjs <base.png> <redraw.png> [out-dir]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

/** A difference this strong is something that was added; below the low mark it is redraw haze. */
let SEED = 64;
let SPREAD = 28;
/** Fraction of the sheet below which a region is noise rather than a worn thing. */
const SMALLEST = 0.00002;
/** Half the thickness of the thinnest thing worth keeping, in pixels of the source sheet. */
let OPENING = 3;
// How far the opening may be undone, walking only over ground the rough mask held. Left at the
// opening radius this is the plain opening; raised, it is what lets a hard opening cut a fur
// strand off an accessory without taking the accessory's rim with it.
let REACH = OPENING;
/** Fraction of the sheet below which an island is a stray brush stroke rather than a worn thing. */
const KEEP_ABOVE = 0.0001;
/** How solid the middle of a worn thing is, in pixels. An outline never has this much. */
let SOLID = 7;
/**
 * The largest enclosed gap that is a fault rather than a feature, in pixels of the sheet.
 *
 * A gap the mask has left in the middle of a worn thing is a hole the floor shows through. A gap a
 * pair of spectacles leaves is the lens, and the creature's own eye has to show through it. What
 * tells them apart is size: measured over these sheets a lens runs to twenty-five thousand pixels
 * and the largest fault in a cape to three thousand, an order of magnitude clear of each other.
 */
let FILL = 12000;
/** How far either side of the creature's silhouette counts as its outline, in pixels. */
let EDGE = 14;
/** A piece this much along the outline and this thin is the creature, not something worn. */
const ON_EDGE = 0.75;
let THIN = 22;

const raw = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

/**
 * How differently two pictures read at a pixel — which is not how differently they are stored.
 *
 * These two share an alpha channel exactly, to the byte, so the only difference is colour. But
 * colour under a nearly transparent pixel is nearly invisible, and along the soft edge of a
 * silhouette the two disagree wildly about a colour nobody can see. Weighting by coverage is what
 * stops that edge being read as something worn: it drew a halo round every cat.
 */
function difference(a, b, count) {
  const gap = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) {
    const at = i * 4;
    let worst = Math.abs(a[at + 3] - b[at + 3]);
    const seen = Math.max(a[at + 3], b[at + 3]) / 255;
    for (let c = 0; c < 3; c += 1) {
      const d = Math.abs(a[at + c] - b[at + c]) * seen;
      if (d > worst) worst = d;
    }
    gap[i] = Math.round(worst);
  }
  return gap;
}

/** Drop every island smaller than a worn thing would be. */
function dropSpecks(mask, width, height, floor) {
  const queue = new Int32Array(width * height);
  const seen = new Uint8Array(width * height);
  let dropped = 0;
  let kept = 0;
  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] || !mask[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail += 1, tail - 1] = start;
    seen[start] = 1;
    const island = [start];
    while (head < tail) {
      const at = queue[head += 1, head - 1];
      const x = at % width;
      const y = (at - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (seen[next] || !mask[next]) continue;
        seen[next] = 1;
        queue[tail += 1, tail - 1] = next;
        island.push(next);
      }
    }
    if (island.length >= floor) { kept += 1; continue; }
    for (const at of island) mask[at] = 0;
    dropped += 1;
  }
  return { kept, dropped };
}

/** Regions of emphatic difference, grown along whatever difference remains appreciable. */
function findRegions(gap, width, height) {
  const mask = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const regions = [];
  for (let start = 0; start < width * height; start += 1) {
    if (mask[start] || gap[start] < SEED) continue;
    let head = 0;
    let tail = 0;
    queue[tail += 1, tail - 1] = start;
    mask[start] = 1;
    const pixels = [start];
    while (head < tail) {
      const at = queue[head += 1, head - 1];
      const x = at % width;
      const y = (at - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (mask[next] || gap[next] < SPREAD) continue;
        mask[next] = 1;
        queue[tail += 1, tail - 1] = next;
        pixels.push(next);
      }
    }
    regions.push(pixels);
  }

  const floor = SMALLEST * width * height;
  let kept = 0;
  for (const pixels of regions) {
    if (pixels.length >= floor) { kept += 1; continue; }
    for (const at of pixels) mask[at] = 0;
  }
  return { mask, regions: kept };
}

/**
 * Shrink or grow a mask by a radius, one axis at a time.
 *
 * A square structuring element separates into a horizontal pass and a vertical one, which turns
 * a thirteen-by-thirteen window from a hundred and sixty-nine tests per pixel into twenty-six.
 * On a sheet of sixteen million pixels that is the difference between usable and not.
 */
function sweep(mask, width, height, radius, keep) {
  const pass = (from, along) => {
    const to = new Uint8Array(width * height);
    const outer = along ? height : width;
    const inner = along ? width : height;
    for (let a = 0; a < outer; a += 1) {
      for (let b = 0; b < inner; b += 1) {
        let value = keep === 'all' ? 1 : 0;
        for (let d = -radius; d <= radius; d += 1) {
          const n = b + d;
          if (n < 0 || n >= inner) { if (keep === 'all') value = 0; continue; }
          const at = along ? a * width + n : n * width + a;
          if (keep === 'all') { if (!from[at]) { value = 0; break; } } else if (from[at]) { value = 1; break; }
        }
        to[along ? a * width + b : b * width + a] = value;
      }
    }
    return to;
  };
  return pass(pass(mask, true), false);
}

/**
 * Close the gaps a mask has left inside itself, up to a size, and leave the larger ones alone.
 *
 * Where an accessory is painted in nearly the colour it covers — a white cape over cream fur — the
 * difference between the two pictures falls under the mark the mask grows by, and the mask steps
 * over those pixels. What is left is a gap enclosed by accessory on every side, which the game
 * draws the floor through. A gap that is not enclosed is not a fault: it is the mask's outline.
 */
function fillGaps(mask, width, height, largest) {
  const count = width * height;
  const outside = new Uint8Array(count);
  const queue = new Int32Array(count);
  let tail = 0;
  const reach = (p) => { if (!outside[p] && !mask[p]) { outside[p] = 1; queue[tail += 1, tail - 1] = p; } };
  for (let x = 0; x < width; x += 1) { reach(x); reach((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { reach(y * width); reach(y * width + width - 1); }
  for (let head = 0; head < tail; head += 1) {
    const p = queue[head];
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) reach(p - 1);
    if (x + 1 < width) reach(p + 1);
    if (y > 0) reach(p - width);
    if (y + 1 < height) reach(p + width);
  }

  const seen = new Uint8Array(count);
  let filled = 0;
  let left = 0;
  for (let start = 0; start < count; start += 1) {
    if (seen[start] || mask[start] || outside[start]) continue;
    let head = 0;
    let end = 0;
    queue[end += 1, end - 1] = start;
    seen[start] = 1;
    const gap = [start];
    while (head < end) {
      const at = queue[head += 1, head - 1];
      const x = at % width;
      const y = (at - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (seen[next] || mask[next] || outside[next]) continue;
        seen[next] = 1;
        queue[end += 1, end - 1] = next;
        gap.push(next);
      }
    }
    if (gap.length > largest) { left += 1; continue; }
    for (const at of gap) mask[at] = 1;
    filled += 1;
  }
  return { filled, left };
}

const shrinkBy = (mask, width, height, radius) => sweep(mask, width, height, radius, 'all');
const growBy = (mask, width, height, radius) => sweep(mask, width, height, radius, 'any');

/**
 * Grow a mask back inside another one, and no further than a given number of steps.
 *
 * A plain opening severs a fur strand from the accessory it is joined to, which is the only way
 * to be rid of one — but the same erosion takes the accessory's own rim and any part of it
 * narrower than the radius, and those come back as holes. Regrowing inside the rough mask
 * restores them: everything the erosion took is within `radius` of what survived. A strand is
 * long, so capping the walk stops it travelling back along its whole length; it returns as a stub
 * of `steps` pixels, which the outline filter can then take.
 */
function regrowWithin(seed, limit, width, height, steps) {
  const out = Uint8Array.from(seed);
  let front = [];
  for (let at = 0; at < width * height; at += 1) if (out[at]) front.push(at);
  for (let step = 0; step < steps && front.length; step += 1) {
    const next = [];
    for (const at of front) {
      const x = at % width;
      const y = (at - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const to = ny * width + nx;
        if (out[to] || !limit[to]) continue;
        out[to] = 1;
        next.push(to);
      }
    }
    front = next;
  }
  return out;
}

/**
 * Take out the pieces of a mask that are the creature's own outline, drawn again.
 *
 * Asked for the sheet a second time the generator draws the whole creature again, and its fur lands
 * a pixel or two off where the first drawing put it. Where the thing being worn stands well clear of
 * the fur in colour, that discrepancy stays under the mark the mask grows by and never shows. Where
 * it does not — pale frost on cream cheeks, pearls on a cream chest — the mask has to be grown so
 * meanly to catch the accessory that the discrepancy comes too, and the layer arrives with loops of
 * fur outline floating around the thing that was wanted.
 *
 * Such a loop can be told apart without knowing what was drawn: it runs along the silhouette the
 * base sheet has, and it is thin — its area over its longest side is a handful of pixels, where a
 * collar or a pair of spectacles is tens. Both conditions together, because a fine chain is thin
 * without lying on the outline, and the hem of a cape lies on the outline without being thin.
 */
function dropOutline(mask, body, width, height) {
  const wide = growBy(body, width, height, EDGE);
  const core = shrinkBy(body, width, height, EDGE);
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let dropped = 0;
  let pixels = 0;
  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] || !mask[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail += 1, tail - 1] = start;
    seen[start] = 1;
    const piece = [start];
    let left = width;
    let right = 0;
    let top = height;
    let bottom = 0;
    let along = 0;
    while (head < tail) {
      const at = queue[head += 1, head - 1];
      const x = at % width;
      const y = (at - x) / width;
      if (wide[at] && !core[at]) along += 1;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (seen[next] || !mask[next]) continue;
        seen[next] = 1;
        queue[tail += 1, tail - 1] = next;
        piece.push(next);
      }
    }
    const spine = piece.length / Math.max(right - left + 1, bottom - top + 1);
    if (along / piece.length < ON_EDGE || spine > THIN) continue;
    for (const at of piece) mask[at] = 0;
    dropped += 1;
    pixels += piece.length;
  }
  return { dropped, pixels };
}

/**
 * Keep the pieces of a mask that have something solid in them, whole.
 *
 * The difference along a redrawn outline is a band several pixels across — thicker than a fur
 * stroke and so surviving a small opening, but still a line. A collar is not: it has beads, a
 * knot, a pendant, something with a middle. So the mask is opened hard enough to erase any line,
 * and every region of the original mask containing what survives is restored in full. That keeps
 * a fine chain hanging off a solid pendant, which a plain opening would have cut away, and drops
 * an outline that has no solid part anywhere along it.
 */
function keepSolidRegions(mask, width, height, radius) {
  const cores = shrinkBy(mask, width, height, radius);
  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const kept = new Uint8Array(width * height);
  let solid = 0;
  let thin = 0;
  for (let start = 0; start < width * height; start += 1) {
    if (seen[start] || !mask[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail += 1, tail - 1] = start;
    seen[start] = 1;
    const island = [start];
    let hasCore = false;
    while (head < tail) {
      const at = queue[head += 1, head - 1];
      if (cores[at]) hasCore = true;
      const x = at % width;
      const y = (at - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (seen[next] || !mask[next]) continue;
        seen[next] = 1;
        queue[tail += 1, tail - 1] = next;
        island.push(next);
      }
    }
    if (!hasCore) { thin += 1; continue; }
    solid += 1;
    for (const at of island) kept[at] = 1;
  }
  return { kept, solid, thin };
}

const argv = process.argv.slice(2);
// One set of thresholds does not fit every sheet: a gold spectacle frame is thin and breaks up if
// the mask is grown too meanly, and a pale ruff repainted around a collar spreads into it if the
// mask is grown too generously. Each sheet is looked at and the numbers set for it.
const option = (name, fallback) => {
  const at = argv.indexOf(`--${name}`);
  return at >= 0 ? Number(argv[at + 1]) : fallback;
};
SEED = option('seed', SEED);
SPREAD = option('spread', SPREAD);
SOLID = option('solid', SOLID);
OPENING = option('opening', OPENING);
// How far the opening is allowed to grow back, over the rough mask only. Defaults to the opening
// radius, which is the plain morphological opening this had before the flag existed.
REACH = option('reach', OPENING);
FILL = option('fill', FILL);
THIN = option('thin', THIN);
EDGE = option('edge', EDGE);
const [baseFile, redrawFile, outDir = 'tmp/baked'] = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
if (!baseFile || !redrawFile) {
  console.error('usage: node scripts/bake-wearable.mjs <base.png> <redraw.png> [out-dir]');
  process.exit(1);
}

const base = await raw(baseFile);
const redraw = await raw(redrawFile);
if (base.width !== redraw.width || base.height !== redraw.height) {
  throw new Error(`different sizes: ${base.width}x${base.height} against ${redraw.width}x${redraw.height}`);
}
const { width, height } = base;
const count = width * height;

const gap = difference(base.data, redraw.data, count);
const { mask: rough } = findRegions(gap, width, height);
// The opening is normally undone by the same radius it was made with. `--reach` walks further
// than that, but only over ground the rough mask already held, which is what lets the opening be
// set hard enough to cut a fur strand off without the accessory's rim going with it.
const opened = REACH > OPENING
  ? regrowWithin(shrinkBy(rough, width, height, OPENING), rough, width, height, REACH)
  : growBy(shrinkBy(rough, width, height, OPENING), width, height, OPENING);
const { kept: mask, thin } = keepSolidRegions(opened, width, height, SOLID);
// The creature as the base sheet drew it, which is what says where its outline runs.
const body = new Uint8Array(count);
for (let at = 0; at < count; at += 1) body[at] = base.data[at * 4 + 3] > 32 ? 1 : 0;
const outline = dropOutline(mask, body, width, height);
// Small gaps inside the mask are closed and large ones are not: a pair of spectacles is a rim
// around a hole, and through that hole the creature's own eye has to show, whereas a gap in the
// middle of a cape is a hole the floor shows through.
const { filled, left: kept } = fillGaps(mask, width, height, FILL);
const { kept: regions, dropped } = dropSpecks(mask, width, height, KEEP_ABOVE * width * height);

let masked = 0;
for (let at = 0; at < count; at += 1) if (mask[at]) masked += 1;

// The accessory is what the redraw has inside the mask; everything else stays as it was drawn.
const layer = Buffer.alloc(count * 4);
const dressed = Buffer.from(base.data);
for (let at = 0; at < count; at += 1) {
  if (!mask[at]) continue;
  for (let c = 0; c < 4; c += 1) {
    layer[at * 4 + c] = redraw.data[at * 4 + c];
    dressed[at * 4 + c] = redraw.data[at * 4 + c];
  }
}

// Inside the mask the dressed picture has to be the redraw exactly. Outside it, it has to be the
// original exactly — and how far that has drifted from the redraw is the cat being redrawn, which
// is worth reporting rather than hiding.
let wrongInside = 0;
let driftOutside = 0;
let inkedOutside = 0;
for (let at = 0; at < count; at += 1) {
  const i = at * 4;
  let worst = 0;
  for (let c = 0; c < 4; c += 1) worst = Math.max(worst, Math.abs(dressed[i + c] - redraw.data[i + c]));
  if (mask[at]) { if (worst) wrongInside += 1; continue; }
  if (base.data[i + 3] > 8 || redraw.data[i + 3] > 8) {
    inkedOutside += 1;
    if (worst > 15) driftOutside += 1;
  }
}

await fs.mkdir(outDir, { recursive: true });
const name = path.basename(redrawFile).replace(/\.[^.]+$/, '');
const asPng = (buffer) => sharp(buffer, { raw: { width, height, channels: 4 } }).png();
await asPng(layer).toFile(path.join(outDir, `${name}-layer.png`));
await asPng(dressed).toFile(path.join(outDir, `${name}-dressed.png`));

const share = (masked / count) * 100;
console.log(`seed ${SEED} spread ${SPREAD} solid ${SOLID} opening ${OPENING}`);
console.log(`mask: ${regions} region${regions === 1 ? '' : 's'} kept, ${thin.toLocaleString()} outlines and ${dropped.toLocaleString()} specks dropped, ${masked.toLocaleString()} pixels (${share.toFixed(2)}% of the sheet)`);
console.log(`outline: ${outline.dropped.toLocaleString()} pieces of the creature's own edge removed, ${outline.pixels.toLocaleString()} pixels`);
console.log(`gaps: ${filled.toLocaleString()} closed, ${kept.toLocaleString()} left open as deliberate`);
console.log(wrongInside
  ? `FAILED: ${wrongInside} masked pixels are not the redraw`
  : 'inside the mask the dressed pose is the redraw, pixel for pixel');
console.log(`outside the mask ${driftOutside.toLocaleString()} of ${inkedOutside.toLocaleString()} inked pixels differ from the redraw by more than 15 — that is the cat having been drawn again`);
console.log(`${outDir}/${name}-layer.png`);
