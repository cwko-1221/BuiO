/**
 * Bind an accessory to the landmarks it is worn on, rather than carrying it as one rigid picture.
 *
 * One transform cannot land a pair of goggles on two eyes that are spaced and sized differently
 * from the pair they were drawn for: the cat's eyes are narrow-set and large, the pig's wide-set
 * and small, and a single scale has to choose which of the two to get right. Both can be right at
 * once only if each lens follows its own eye.
 *
 * So the piece is not cut into parts by hand. Every pixel is bound to all of the landmarks at once,
 * weighted by how near it is to each, and moves with a blend of their transforms — the same linear
 * blend skinning a rigged mesh uses, with the eyes standing in for bones. A pixel over the left eye
 * is carried almost entirely by the left eye's transform; one halfway along the strap is carried by
 * both, so the strap stretches between them instead of tearing.
 *
 *   node scripts/spike-bound-parts.mjs [--items face-05] [--onto cloud-ear-dog,pudding-pig]
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
const OUT = option('out', 'tmp/bound-parts');
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
const MEASURED = JSON.parse(await fs.readFile('tmp/eye-frames/eye-frames.json', 'utf8'));

const atlasFile = (petId, stage) => {
  const url = catalog.pets.find((pet) => pet.id === petId)?.atlas?.[stage - 1];
  if (!url) throw new Error(`no atlas for ${petId}:${stage}`);
  return path.join('pet-app/public', url.replace(/^\/pet\//, '').split('?')[0]);
};
const readAtlas = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

/**
 * The points a piece is bound to in one cell: each eye, and the head between them.
 *
 * The eyes alone leave the far ends of a strap with nothing near to follow, so the midpoint is
 * carried as a third landmark, sized by the distance across the eyes rather than by either eye. It
 * is what the parts of the piece that belong to the head as a whole hang from.
 */
function landmarks(cells, cell) {
  const found = cells.find((c) => c.cell === cell && c.eyes && c.each);
  if (!found) return null;
  const points = found.each.map((e) => ({ x: e.x * CELL, y: e.y * CELL, size: e.w * CELL }));
  if (points.length === 2) {
    points.push({
      x: (points[0].x + points[1].x) / 2,
      y: (points[0].y + points[1].y) / 2,
      size: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
    });
  }
  return points;
}

/**
 * Carry one cell by a blend of the landmarks' own transforms.
 *
 * Each landmark moves and resizes on its own, so the left lens takes the left eye's scale and the
 * right lens the right eye's; the shared rotation comes from how the line between the eyes has
 * turned. Weights fall off with the square of the distance, which keeps a lens rigid over its eye
 * and lets the strap between them stretch smoothly.
 *
 * The map is applied forwards and the source is walked at half-pixel steps, because a piece that
 * grows would otherwise be written to every other pixel and come out combed.
 */
function bind(patch, cell, from, to, out) {
  const col = cell % COLUMNS;
  const row = Math.floor(cell / COLUMNS);
  const turn = from.length >= 2 && to.length >= 2
    ? Math.atan2(to[1].y - to[0].y, to[1].x - to[0].x) - Math.atan2(from[1].y - from[0].y, from[1].x - from[0].x)
    : 0;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);

  const width = COLUMNS * CELL;
  const accum = new Float32Array(CELL * CELL * 5);
  const put = (x, y, r, g, b, a) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const px = ix + dx;
      const py = iy + dy;
      if (px < 0 || py < 0 || px >= CELL || py >= CELL || w <= 0) continue;
      const at = (py * CELL + px) * 5;
      accum[at] += r * a * w; accum[at + 1] += g * a * w; accum[at + 2] += b * a * w;
      accum[at + 3] += a * w; accum[at + 4] += w;
    }
  };

  for (let y = 0; y < CELL; y += 0.5) {
    for (let x = 0; x < CELL; x += 0.5) {
      const src = ((row * CELL + Math.round(y)) * width + col * CELL + Math.round(x)) * 4;
      const alpha = patch.data[src + 3];
      if (!alpha) continue;
      let total = 0;
      let dx = 0;
      let dy = 0;
      for (let i = 0; i < from.length && i < to.length; i += 1) {
        const d = Math.hypot(x - from[i].x, y - from[i].y);
        const w = 1 / (d * d + 4);
        const s = to[i].size / from[i].size;
        // Turn about this landmark, scale by its own change of size, then land on where it moved to.
        const ox = x - from[i].x;
        const oy = y - from[i].y;
        dx += w * (to[i].x + s * (ox * cos - oy * sin));
        dy += w * (to[i].y + s * (ox * sin + oy * cos));
        total += w;
      }
      if (!total) continue;
      put(dx / total, dy / total, patch.data[src], patch.data[src + 1], patch.data[src + 2], alpha / 255);
    }
  }

  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const at = (y * CELL + x) * 5;
      const cover = accum[at + 4];
      if (!cover) continue;
      const a = accum[at + 3] / cover;
      if (a <= 0.004) continue;
      const dst = ((row * CELL + y) * width + col * CELL + x) * 4;
      out[dst] = Math.min(255, Math.round(accum[at] / accum[at + 3]));
      out[dst + 1] = Math.min(255, Math.round(accum[at + 1] / accum[at + 3]));
      out[dst + 2] = Math.min(255, Math.round(accum[at + 2] / accum[at + 3]));
      out[dst + 3] = Math.min(255, Math.round(a * 255));
    }
  }
}

const label = (text, width) => Buffer.from(
  `<svg width="${width}" height="30"><rect width="100%" height="100%" fill="#101014"/>`
  + `<text x="9" y="21" font-family="Arial" font-size="15" fill="#e6e1d6">${text}</text></svg>`,
);

await fs.mkdir(OUT, { recursive: true });
const source = catalog.pets.find((pet) => pet.id === SOURCE);
const sourceCells = MEASURED[`${SOURCE}:${STAGE}`] || [];

for (const itemId of WANTED) {
  const entry = catalog.redrawnWearables[`${SOURCE}:${STAGE}:${itemId}`];
  if (!entry?.patch) { console.log(`${itemId}: no baked patch`); continue; }
  const patch = await readAtlas(path.join('pet-app/public', entry.patch.replace(/^\/pet\//, '')));

  for (const { petId: targetId, stage: targetStage } of TARGETS) {
    const targetCells = MEASURED[`${targetId}:${targetStage}`] || [];
    const bound = Buffer.alloc(patch.data.length);
    const done = [];
    for (let cell = 0; cell < COLUMNS * ROWS; cell += 1) {
      const from = landmarks(sourceCells, cell);
      const to = landmarks(targetCells, cell);
      if (!from || !to || from.length !== to.length) continue;
      bind(patch, cell, from, to, bound);
      done.push(cell);
    }
    await sharp(bound, { raw: { width: patch.width, height: patch.height, channels: 4 } })
      .webp({ quality: 92 }).toFile(path.join(OUT, `${targetId}-${targetStage}--${itemId}--bound.webp`));
    console.log(`${itemId} → ${targetId}:${targetStage}  bound on ${done.length} cells [${done.join(' ')}]`);

    // Side by side with the rigid carry, over the creature, at a size the fit can be judged at.
    const rigid = path.join('tmp/cross-v6', `${targetId}-${targetStage}--${itemId}--carried.webp`);
    const hasRigid = await fs.access(rigid).then(() => true, () => false);
    const atlas = await readAtlas(atlasFile(targetId, targetStage));
    const show = done.filter((c) => c < 5 || c >= 18).slice(0, 3);
    if (!show.length) continue;
    const Z = 340;
    const strips = [];
    for (const [name, layer] of [['rigid: one transform', hasRigid ? (await readAtlas(rigid)).data : null],
      ['bound: each lens to its own eye', bound]]) {
      if (!layer) continue;
      const cellsOut = [];
      for (const c of show) {
        const x = (c % COLUMNS) * CELL;
        const y = Math.floor(c / COLUMNS) * CELL;
        const base = await sharp(atlas.data, { raw: { width: atlas.width, height: atlas.height, channels: 4 } })
          .extract({ left: x, top: y, width: CELL, height: CELL }).png().toBuffer();
        const over = await sharp(layer, { raw: { width: patch.width, height: patch.height, channels: 4 } })
          .extract({ left: x, top: y, width: CELL, height: CELL }).png().toBuffer();
        const one = await sharp({ create: { width: CELL, height: CELL, channels: 4, background: { r: 122, g: 104, b: 92, alpha: 1 } } })
          .composite([{ input: base }, { input: over }]).png().toBuffer();
        cellsOut.push(await sharp(one).resize(Z, Z).png().toBuffer());
      }
      const row = await sharp({ create: { width: show.length * Z, height: Z, channels: 4, background: { r: 16, g: 16, b: 20, alpha: 1 } } })
        .composite(cellsOut.map((input, i) => ({ input, left: i * Z, top: 0 }))).png().toBuffer();
      strips.push(await sharp({ create: { width: show.length * Z, height: Z + 30, channels: 4, background: { r: 16, g: 16, b: 20, alpha: 1 } } })
        .composite([{ input: label(`${itemId} · ${targetId} · ${name}`, show.length * Z), top: 0, left: 0 }, { input: row, top: 30, left: 0 }])
        .png().toBuffer());
    }
    await sharp({ create: { width: show.length * Z, height: strips.length * (Z + 30), channels: 4, background: { r: 16, g: 16, b: 20, alpha: 1 } } })
      .composite(strips.map((input, i) => ({ input, left: 0, top: i * (Z + 30) })))
      .png().toFile(path.join(OUT, `${itemId}-${targetId}-compare.png`));
  }
}
console.log(`\n${OUT}`);
