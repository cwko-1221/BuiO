/**
 * Fit an accessory baked on one creature onto another, at every angle.
 *
 * What carries a piece across is a correspondence, not a resemblance. Sliding a window over the
 * other animal until the shapes inside it balance sounds principled and is not: a crown sits on a
 * boundary with most of the body below it, so matching what is inside the window walks the crown
 * down the face until the weight above and below it agrees. Matching outlines only trades one
 * ambiguity for another, because a cat's ears and a dog's are not the same outline.
 *
 * The eyes are a correspondence. They are the same feature on every creature in the set, they are
 * measured per cell so they follow the head as it nods, and everything else is expressed against
 * them: how far above the eyes the crown sat on the cat, in eye-widths, is where it goes on the pig.
 * Where a creature has turned away and has no eyes to find, the widest row of its head stands in — a
 * line both animals have from behind, and one that does not care whose ears are pointed.
 *
 * Pieces worn on the eyes get more than that. A single transform has to choose between landing a
 * lens on each eye and drawing it the size of the eye it covers, and on a face proportioned unlike
 * the one it was drawn for it cannot do both; so those are bound per eye, each lens following its
 * own, which is linear blend skinning with the eyes standing in for bones.
 *
 *   node scripts/fit-wearable.mjs [--items face-05] [--onto cloud-ear-dog,pudding-pig:3]
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
const OUT = option('out', 'tmp/fitted');
const WANTED = option('items', 'face-05,face-11,head-03,neck-06').split(',');
const TARGETS = option('onto', 'cloud-ear-dog,pudding-pig').split(',').map((name) => {
  const [petId, stage] = name.split(':');
  return { petId, stage: Number(stage) || 1 };
});

const SOURCE = 'starpatch-cat';
const STAGE = 1;
const CELL = 160;
const COLUMNS = 5;
const ROWS = 4;
const EYES = JSON.parse(await fs.readFile('tmp/eye-frames/eye-frames.json', 'utf8'));
/**
 * The ways of wearing a thing on the head that go round it rather than onto one side of it. These
 * are the pieces a creature's ears belong in front of; a clip is pinned to an ear and a pair of
 * goggles sits on the face, and neither is covered by anything.
 */
const BEHIND_EARS = new Set(['crown', 'hat', 'headset', 'helmet']);

const atlasFile = (petId, stage) => {
  const url = catalog.pets.find((pet) => pet.id === petId)?.atlas?.[stage - 1];
  if (!url) throw new Error(`no atlas for ${petId}:${stage}`);
  return path.join('pet-app/public', url.replace(/^\/pet\//, '').split('?')[0]);
};
const readAtlas = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};
const mean = (rows, pick) => rows.reduce((sum, r) => sum + pick(r), 0) / rows.length;

/**
 * The widest row of a creature's head — a line it still has with its back turned.
 *
 * `within` narrows the search to a band of the cell. Standing up, the head is the widest thing in
 * the top of the picture and needs no help being found; curled up asleep it is not, and the widest
 * row across the top of a sleeping animal is its back. The piece being carried says which end of
 * the curl to look at: it was worn on the head on the cat, and every creature is drawn lying the
 * same way round.
 */
function headLine(atlas, cell, within) {
  const col = cell % COLUMNS;
  const row = Math.floor(cell / COLUMNS);
  const rows = [];
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < CELL; y += 1) {
    let best = null;
    let start = -1;
    for (let x = 0; x <= CELL; x += 1) {
      const inside = !within || (x >= within.from && x <= within.to);
      const on = x < CELL && inside
        && atlas.data[((row * CELL + y) * atlas.width + col * CELL + x) * 4 + 3] > 128;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        const run = { left: start, right: x - 1, width: x - start };
        if (!best || run.width > best.width) best = run;
        start = -1;
      }
    }
    rows.push(best);
    if (best) { if (top < 0) top = y; bottom = y; }
  }
  if (top < 0) return null;
  let head = top;
  // Upright, the head is the widest thing in the top of the picture. Crouched or curled it is not —
  // a dog with its rear in the air is widest across the rump — so once the piece has said which
  // part of the cell to look in, the whole of that part is searched rather than its top alone.
  const limit = within ? bottom : top + Math.round((bottom - top) * 0.45);
  for (let y = top; y <= limit; y += 1) if (rows[y] && rows[y].width > (rows[head]?.width ?? 0)) head = y;
  const line = rows[head];
  return { x: (line.left + line.right) / 2, y: head, width: line.width };
}

/**
 * One creature's frame in every cell: where the face is, how wide it is, and how tall.
 *
 * Across and down are separate numbers because on some animals they disagree sharply — the pig's
 * eyes sit wider apart than the cat's while being drawn smaller — and one scale would have to split
 * the difference, spreading its goggles onto its cheeks.
 */
function frames(petId, stage, atlas, within) {
  const cells = EYES[`${petId}:${stage}`] || [];
  const heads = Array.from({ length: COLUMNS * ROWS }, (_, cell) => headLine(atlas, cell, within?.[cell]));
  // How this creature's eyes sit against its own head line, learnt from the cells that show both,
  // so a cell with no eyes can still be given a frame on the same footing as one that has them.
  const known = cells.filter((c) => c.eyes === 2 && heads[c.cell]);
  const overHead = known.length ? mean(known, (c) => (c.y * CELL - heads[c.cell].y) / heads[c.cell].width) : 0;
  const spanOverHead = known.length ? mean(known, (c) => (c.span * CELL) / heads[c.cell].width) : 0.5;
  const tallOverHead = known.length ? mean(known, (c) => (c.tall * CELL) / heads[c.cell].width) : 0.25;

  return Array.from({ length: COLUMNS * ROWS }, (_, cell) => {
    const seen = cells.find((c) => c.cell === cell && c.eyes);
    const head = heads[cell];
    if (seen && seen.eyes === 2) {
      return {
        x: seen.x * CELL, y: seen.y * CELL,
        across: seen.span * CELL, down: seen.tall * CELL, eyes: 2, each: seen.each,
        // What a piece is sized against depends on what it spans. Goggles are worn on the eyes and
        // take the span across them; a garland goes round the head and takes the head. On the cat
        // those are nearly the same; on a big-headed dog with small eyes they are not, and sizing
        // its garland by its eyes leaves a bracelet on a forehead.
        head: head?.width,
      };
    }
    if (seen && seen.eyes === 1 && head) {
      // One eye fixes where the head is but not how wide the face is, so the width comes from the
      // head line, kept in proportion by what the front views measured.
      return {
        x: seen.x * CELL, y: seen.y * CELL,
        across: head.width * spanOverHead, down: head.width * tallOverHead, eyes: 1, each: seen.each,
        head: head.width,
      };
    }
    if (!head) return null;
    return {
      x: head.x, y: head.y + overHead * head.width,
      across: head.width * spanOverHead, down: head.width * tallOverHead, eyes: 0, head: head.width,
    };
  });
}

/** Carry one cell rigidly in the frame: same place against the eyes, same size against the face. */
function carry(patch, cell, from, to, out, spansHead) {
  const col = cell % COLUMNS;
  const row = Math.floor(cell / COLUMNS);
  // A piece that goes round the head is sized by the head; one worn on the face by the face.
  const byHead = spansHead && from.head && to.head;
  const rx = byHead ? to.head / from.head : to.across / from.across;
  const ry = byHead ? to.head / from.head : to.down / from.down;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const sx = from.x + (x - to.x) / rx;
      const sy = from.y + (y - to.y) / ry;
      const ix = Math.round(sx);
      const iy = Math.round(sy);
      if (ix < 0 || iy < 0 || ix >= CELL || iy >= CELL) continue;
      const src = ((row * CELL + iy) * patch.width + col * CELL + ix) * 4;
      if (!patch.data[src + 3]) continue;
      const dst = ((row * CELL + y) * patch.width + col * CELL + x) * 4;
      for (let c = 0; c < 4; c += 1) out[dst + c] = patch.data[src + c];
    }
  }
}

/**
 * Carry one cell by a blend of each eye's own transform, so both lenses land and each is the size
 * of the eye it covers. Walked at half-pixel steps and splatted, or a piece that grows combs.
 */
function bindToEyes(patch, cell, from, to, out) {
  const col = cell % COLUMNS;
  const row = Math.floor(cell / COLUMNS);
  const anchors = (frame) => {
    const points = frame.each.map((e) => ({ x: e.x * CELL, y: e.y * CELL, size: e.w * CELL }));
    points.push({
      x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2, size: frame.across,
    });
    return points;
  };
  const a = anchors(from);
  const b = anchors(to);
  const turn = Math.atan2(b[1].y - b[0].y, b[1].x - b[0].x) - Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const accum = new Float32Array(CELL * CELL * 5);
  const put = (x, y, r, g, bl, alpha) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const px = ix + dx;
      const py = iy + dy;
      if (px < 0 || py < 0 || px >= CELL || py >= CELL || w <= 0) continue;
      const at = (py * CELL + px) * 5;
      accum[at] += r * alpha * w; accum[at + 1] += g * alpha * w; accum[at + 2] += bl * alpha * w;
      accum[at + 3] += alpha * w; accum[at + 4] += w;
    }
  };
  for (let y = 0; y < CELL; y += 0.5) {
    for (let x = 0; x < CELL; x += 0.5) {
      const src = ((row * CELL + Math.round(y)) * patch.width + col * CELL + Math.round(x)) * 4;
      const alpha = patch.data[src + 3];
      if (!alpha) continue;
      let total = 0;
      let dx = 0;
      let dy = 0;
      for (let i = 0; i < a.length && i < b.length; i += 1) {
        const d = Math.hypot(x - a[i].x, y - a[i].y);
        const w = 1 / (d * d + 4);
        const s = b[i].size / a[i].size;
        const ox = x - a[i].x;
        const oy = y - a[i].y;
        dx += w * (b[i].x + s * (ox * cos - oy * sin));
        dy += w * (b[i].y + s * (ox * sin + oy * cos));
        total += w;
      }
      if (!total) continue;
      put(dx / total, dy / total, patch.data[src], patch.data[src + 1], patch.data[src + 2], alpha / 255);
    }
  }
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const at = (y * CELL + x) * 5;
      if (!accum[at + 4]) continue;
      const alpha = accum[at + 3] / accum[at + 4];
      if (alpha <= 0.004) continue;
      const dst = ((row * CELL + y) * patch.width + col * CELL + x) * 4;
      out[dst] = Math.min(255, Math.round(accum[at] / accum[at + 3]));
      out[dst + 1] = Math.min(255, Math.round(accum[at + 1] / accum[at + 3]));
      out[dst + 2] = Math.min(255, Math.round(accum[at + 2] / accum[at + 3]));
      out[dst + 3] = Math.min(255, Math.round(alpha * 255));
    }
  }
}

/**
 * How much of a piece is against the body, as a fraction of the piece.
 *
 * A crown that has floated off the head and one that has sunk into the face both look wrong in the
 * same measurable way: the share of the piece touching the creature stops matching what it was on
 * the creature it was drawn for. It is a coarse reading and it does not know a good fit from a
 * plausible one, but it finds the cells that have gone somewhere else without anyone looking.
 */
function seated(atlas, layer, width, cell) {
  const col = cell % COLUMNS;
  const row = Math.floor(cell / COLUMNS);
  let on = 0;
  let all = 0;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const at = ((row * CELL + y) * width + col * CELL + x) * 4;
      if (layer[at + 3] < 40) continue;
      all += 1;
      if (atlas[at + 3] > 128) on += 1;
    }
  }
  // A mark of a few dozen pixels — a whisker of frost, a tear line seen from behind — swings this
  // ratio wildly while being invisible at the size the game draws. Those are not readings.
  return all < 120 ? null : on / all;
}

/**
 * The parts of a creature that belong in front of what it is wearing.
 *
 * A crown carried from the cat is drawn over everything, so on the dog it lies across the floppy
 * ears instead of passing behind them, and reads as stuck on rather than worn. The cat's own baked
 * art has this right because it was drawn that way; a carried piece has to be told.
 *
 * Ears are the parts of the head that stand out to the side of the face. Taking everything above
 * the eyes and outside the width of the face catches them on all three creatures without knowing
 * what species it is looking at — pointed, floppy or small and folded — while leaving the crown of
 * the head, which a piece worn there sits on top of, alone.
 */
function earsOf(atlas, cell, frame) {
  if (!frame || !frame.across) return null;
  const col = cell % COLUMNS;
  const row = Math.floor(cell / COLUMNS);
  const mask = new Uint8Array(CELL * CELL);
  // The face is wider than the span across the eyes — cheeks and muzzle sit outside it — so the
  // line between face and ear is drawn a whole eye-span out from the middle, not half of one.
  const half = frame.across;
  for (let y = 0; y < CELL; y += 1) {
    // Below the eyes is cheek and muzzle, which nothing worn on the head passes behind.
    if (y > frame.y + frame.down * 0.4) continue;
    for (let x = 0; x < CELL; x += 1) {
      if (Math.abs(x - frame.x) < half) continue;
      if (atlas.data[((row * CELL + y) * atlas.width + col * CELL + x) * 4 + 3] < 128) continue;
      mask[y * CELL + x] = 1;
    }
  }
  return mask;
}

/** Take back the pixels a creature's own ears should cover. */
function occlude(layer, patchWidth, cell, ears) {
  if (!ears) return 0;
  const col = cell % COLUMNS;
  const row = Math.floor(cell / COLUMNS);
  let taken = 0;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      if (!ears[y * CELL + x]) continue;
      const at = ((row * CELL + y) * patchWidth + col * CELL + x) * 4;
      if (!layer[at + 3]) continue;
      layer[at] = 0; layer[at + 1] = 0; layer[at + 2] = 0; layer[at + 3] = 0;
      taken += 1;
    }
  }
  return taken;
}

const contact = async (atlas, layer, text) => {
  const width = COLUMNS * CELL;
  const height = ROWS * CELL;
  const canvas = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    canvas[i * 4] = 122; canvas[i * 4 + 1] = 104; canvas[i * 4 + 2] = 92; canvas[i * 4 + 3] = 255;
  }
  for (const source of [atlas.data, layer]) {
    if (!source) continue;
    for (let i = 0; i < width * height; i += 1) {
      const a = source[i * 4 + 3] / 255;
      if (!a) continue;
      for (let c = 0; c < 3; c += 1) canvas[i * 4 + c] = Math.round(source[i * 4 + c] * a + canvas[i * 4 + c] * (1 - a));
    }
  }
  const body = await sharp(canvas, { raw: { width, height, channels: 4 } }).png().toBuffer();
  const title = Buffer.from(`<svg width="${width}" height="32"><rect width="100%" height="100%" fill="#101014"/>`
    + `<text x="10" y="22" font-family="Arial" font-size="15" fill="#e6e1d6">${text}</text></svg>`);
  return sharp({ create: { width, height: height + 32, channels: 4, background: { r: 16, g: 16, b: 20, alpha: 1 } } })
    .composite([{ input: title, top: 0, left: 0 }, { input: body, top: 32, left: 0 }]).png().toBuffer();
};

/** Which part of a cell the piece occupies, as a band to look for the head in. */
function bandOf(patch, cell) {
  const col = cell % COLUMNS;
  const row = Math.floor(cell / COLUMNS);
  let left = CELL;
  let right = -1;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      if (patch.data[((row * CELL + y) * patch.width + col * CELL + x) * 4 + 3] < 40) continue;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (right < 0) return null;
  const pad = Math.max(18, (right - left) * 0.6);
  return { from: Math.max(0, left - pad), to: Math.min(CELL - 1, right + pad) };
}

await fs.mkdir(OUT, { recursive: true });
const report = [];
const sourceAtlas = await readAtlas(atlasFile(SOURCE, STAGE));

for (const itemId of WANTED) {
  const entry = catalog.redrawnWearables[`${SOURCE}:${STAGE}:${itemId}`];
  if (!entry?.patch) { console.log(`${itemId}: no baked patch`); continue; }
  const patch = await readAtlas(path.join('pet-app/public', entry.patch.replace(/^\/pet\//, '')));
  const fit = catalog.wearables.find((item) => item.id === itemId)?.fit;
  // Only the poses with no eyes to go on lean on this hint; where the eyes are found the frame
  // comes from them and the band is never consulted.
  const bands = Array.from({ length: COLUMNS * ROWS }, (_, cell) => bandOf(patch, cell));
  const sourceFrames = frames(SOURCE, STAGE, sourceAtlas, bands);
  const strips = [await contact(sourceAtlas, patch.data, `${itemId} · ${SOURCE} · baked (reference)`)];

  for (const { petId: targetId, stage: targetStage } of TARGETS) {
    const atlas = await readAtlas(atlasFile(targetId, targetStage));
    const targetFrames = frames(targetId, targetStage, atlas, bands);
    const fitted = Buffer.alloc(patch.data.length);
    let placed = 0;
    let bound = 0;
    let hidden = 0;
    for (let cell = 0; cell < COLUMNS * ROWS; cell += 1) {
      const from = sourceFrames[cell];
      const to = targetFrames[cell];
      if (!from || !to) continue;
      // Only a piece worn on the eyes is bound to them, and only where both creatures show the
      // same pair. Everything else keeps its shape and is placed in the frame.
      if (entry.slot === 'face' && from.eyes === 2 && to.eyes === 2) {
        bindToEyes(patch, cell, from, to, fitted);
        bound += 1;
      } else {
        carry(patch, cell, from, to, fitted, BEHIND_EARS.has(fit));
      }
      // Whether the ears go in front is not decided by the slot: a garland passes behind them and a
      // hair clip is pinned to one, and both are head pieces. The catalogue already draws that
      // distinction — the same `fit` the room places by — so it is read rather than guessed.
      if (BEHIND_EARS.has(fit)) hidden += occlude(fitted, patch.width, cell, earsOf(atlas, cell, to));
      placed += 1;
    }
    const suspect = [];
    for (let cell = 0; cell < COLUMNS * ROWS; cell += 1) {
      const was = seated(sourceAtlas.data, patch.data, patch.width, cell);
      const now = seated(atlas.data, fitted, patch.width, cell);
      if (was === null || now === null) continue;
      if (Math.abs(now - was) > 0.2) suspect.push(`${cell}:${now > was ? '+' : ''}${Math.round((now - was) * 100)}%`);
    }
    report.push({ item: itemId, onto: `${targetId}:${targetStage}`, placed, bound, suspect });
    await sharp(fitted, { raw: { width: patch.width, height: patch.height, channels: 4 } })
      .webp({ quality: 92 }).toFile(path.join(OUT, `${targetId}-${targetStage}--${itemId}--fitted.webp`));
    strips.push(await contact(atlas, fitted, `${itemId} · ${targetId}:${targetStage} · ${placed}/20 cells, `
      + `${bound} bound${suspect.length ? `, ${suspect.length} to check` : ''}`));
    console.log(`${itemId} → ${targetId}:${targetStage}  ${placed}/20 (${bound} bound${hidden ? `, ${hidden}px behind ears` : ''})`
      + (suspect.length ? `  check ${suspect.join(' ')}` : '  clean'));
  }

  const meta = await Promise.all(strips.map((s) => sharp(s).metadata()));
  await sharp({
    create: {
      width: meta[0].width, height: meta.reduce((sum, m) => sum + m.height + 8, 0),
      channels: 4, background: { r: 16, g: 16, b: 20, alpha: 1 },
    },
  }).composite(strips.map((input, i) => ({ input, left: 0, top: meta.slice(0, i).reduce((s, m) => s + m.height + 8, 0) })))
    .png().toFile(path.join(OUT, `${itemId}-fitted.png`));
}

await fs.writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const cells = report.reduce((sum, r) => sum + r.placed, 0);
const flagged = report.reduce((sum, r) => sum + r.suspect.length, 0);
console.log(`\n${cells} cells fitted, ${flagged} to check `
  + `(${((1 - flagged / Math.max(1, cells)) * 100).toFixed(1)}% seated as they were on the cat)`);
console.log(OUT);
