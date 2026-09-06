/**
 * Find each creature's eyes in every atlas cell.
 *
 * Carrying an accessory from one animal to another needs one thing the two pictures share, and the
 * catalogue's landmark table is not it: `top` is the top of the silhouette, which is the cat's
 * pointed ears and the dog's floppy ones — two different parts of two different heads. The eyes are
 * the same feature on every creature in the set, they are drawn large and dark against pale fur,
 * and they are measured per cell rather than per facing, so they follow the head as it nods.
 *
 * A cell yields two eyes from the front, one in profile, and none from behind, which is itself the
 * reading: no eyes means the head is turned away and the anchors have to carry that cell instead.
 *
 *   node scripts/measure-eye-frames.mjs [--pets starpatch-cat,cloud-ear-dog] [--out tmp/eye-frames]
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
const OUT = option('out', 'tmp/eye-frames');
const PETS = option('pets', catalog.pets.map((p) => p.id).join(',')).split(',');
const STAGES = option('stages', '1,2,3,4').split(',').map(Number);
const CELL = 160;
const COLUMNS = 5;
const ROWS = 4;

const atlasFile = (petId, stage) => {
  const url = catalog.pets.find((pet) => pet.id === petId)?.atlas?.[stage - 1];
  return url ? path.join('pet-app/public', url.replace(/^\/pet\//, '').split('?')[0]) : null;
};

/**
 * The dark, roughly round blobs in the top half of a body, largest first.
 *
 * Eyes are not the only dark thing in the picture — every shape carries an ink outline — so the
 * test is not darkness alone but darkness with a middle to it: an outline is one or two pixels
 * across and fails the roundness and area checks that an eye passes easily.
 */
function eyesIn(rgba, width, cell, index) {
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const at = (x, y) => ((row * cell + y) * width + col * cell + x) * 4;

  let minY = cell;
  let maxY = -1;
  let minX = cell;
  let maxX = -1;
  // What counts as dark is decided per cell, not once for the sheet. A sleeping creature's shut eye
  // is drawn as a mid-brown arc rather than the near-black of an open pupil, and a fixed threshold
  // that finds the pupil cannot see the arc at all — which is how the sleeper ended up with no
  // landmark and wore its crown on its paws.
  const lit = [];
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const i = at(x, y);
      if (rgba[i + 3] < 200) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      lit.push(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    }
  }
  if (!lit.length) return [];
  lit.sort((p, q) => p - q);
  const middle = lit[lit.length >> 1];
  const cut = Math.max(70, Math.min(150, middle * 0.62));
  const dark = new Uint8Array(cell * cell);
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const i = at(x, y);
      if (rgba[i + 3] < 200) continue;
      const luma = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      if (luma < cut) dark[y * cell + x] = 1;
    }
  }
  if (maxY < 0) return [];
  // Eyes live in the head, and the head is the upper part of the body. Looking below that line
  // finds paw pads and the shadow under the belly.
  const floor = minY + (maxY - minY) * 0.62;

  const seen = new Uint8Array(cell * cell);
  const blobs = [];
  const queue = new Int32Array(cell * cell);
  for (let start = 0; start < cell * cell; start += 1) {
    if (seen[start] || !dark[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail += 1, tail - 1] = start;
    seen[start] = 1;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let x0 = cell;
    let x1 = -1;
    let y0 = cell;
    let y1 = -1;
    while (head < tail) {
      const p = queue[head += 1, head - 1];
      const x = p % cell;
      const y = (p - x) / cell;
      area += 1; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cell || ny >= cell) continue;
        const to = ny * cell + nx;
        if (seen[to] || !dark[to]) continue;
        seen[to] = 1;
        queue[tail += 1, tail - 1] = to;
      }
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const round = Math.min(w, h) / Math.max(w, h);
    const filled = area / (w * h);
    const cy = sy / area;
    if (cy > floor) continue;
    // An open eye is a round mass. A shut one — asleep, or mid-blink — is a drawn arc: as wide as
    // the eye it closes but only a few pixels deep, which the roundness test throws away. Both are
    // the same landmark, so both are kept, and a shut eye reports the width it would have open.
    const shut = w >= 7 && h <= Math.max(4, w * 0.55) && area >= 10 && area <= 400;
    if (shut) { blobs.push({ x: sx / area, y: cy, area: area * 3, w, h: Math.round(w * 0.85), shut: true }); continue; }
    if (area < 24 || area > 900) continue;
    if (round < 0.45 || filled < 0.45) continue;
    blobs.push({ x: sx / area, y: cy, area, w, h });
  }
  blobs.sort((a, b) => b.area - a.area);
  if (blobs.length < 2) return blobs.slice(0, 1);
  // A pair of eyes sits level and matches in size; the second largest dark blob is otherwise as
  // likely to be a nose or a hoof.
  const [first] = blobs;
  const mate = blobs.slice(1).find((b) => Math.abs(b.y - first.y) < first.h * 0.7
    && b.area > first.area * 0.35 && Math.abs(b.x - first.x) > first.w * 0.6);
  return mate ? [first, mate].sort((a, b) => a.x - b.x) : [first];
}

await fs.mkdir(OUT, { recursive: true });
const found = {};

for (const petId of PETS) {
  for (const stage of STAGES) {
    const file = atlasFile(petId, stage);
    if (!file) continue;
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cell = Math.round(info.width / COLUMNS);
    const cells = [];
    const marks = [];
    for (let index = 0; index < COLUMNS * ROWS; index += 1) {
      const eyes = eyesIn(data, info.width, cell, index);
      if (eyes.length === 2) {
        const y = (eyes[0].y + eyes[1].y) / 2;
        const x = (eyes[0].x + eyes[1].x) / 2;
        const span = Math.abs(eyes[1].x - eyes[0].x);
        cells.push({
          cell: index, eyes: 2, x: x / cell, y: y / cell, span: span / cell,
          // How big one eye is drawn, which is what a lens has to cover. It is not implied by the
          // span: the dog's eyes sit closer together than the cat's and are drawn larger.
          eye: (eyes[0].w + eyes[1].w) / 2 / cell, tall: (eyes[0].h + eyes[1].h) / 2 / cell,
          // Each eye on its own as well as the pair. Binding a lens to the eye it covers needs to
          // know where that one eye is, not where the two of them average out.
          each: eyes.map((e) => ({ x: e.x / cell, y: e.y / cell, w: e.w / cell, h: e.h / cell })),
        });
      } else if (eyes.length === 1) {
        // In profile only one eye shows, so the span across the eyes is gone. The eye's own width
        // stands in for it: it is drawn to the same proportion of the face on every creature here.
        cells.push({
          cell: index, eyes: 1, x: eyes[0].x / cell, y: eyes[0].y / cell,
          span: (eyes[0].w * 2.6) / cell, eye: eyes[0].w / cell, tall: eyes[0].h / cell,
          each: [{ x: eyes[0].x / cell, y: eyes[0].y / cell, w: eyes[0].w / cell, h: eyes[0].h / cell }],
        });
      } else {
        cells.push({ cell: index, eyes: 0 });
      }
      for (const eye of eyes) marks.push({ index, ...eye });
    }
    found[`${petId}:${stage}`] = cells;
    const seen = cells.filter((c) => c.eyes).length;
    console.log(`${petId}:${stage}  ${seen}/20 cells with eyes  (${cells.filter((c) => c.eyes === 2).length} pairs)`);

    if (stage === 1) {
      const overlay = marks.map(({ index, x, y, w, h }) => {
        const col = index % COLUMNS;
        const row = Math.floor(index / COLUMNS);
        return `<circle cx="${col * cell + x}" cy="${row * cell + y}" r="${Math.max(w, h) / 2 + 2}" `
          + 'fill="none" stroke="#25d0c0" stroke-width="2"/>';
      }).join('');
      const svg = Buffer.from(
        `<svg width="${info.width}" height="${info.height}">${overlay}</svg>`,
      );
      await sharp(file).composite([{ input: svg }]).png()
        .toFile(path.join(OUT, `${petId}-${stage}-eyes.png`));
    }
  }
}

await fs.writeFile(path.join(OUT, 'eye-frames.json'), `${JSON.stringify(found, null, 2)}\n`);
console.log(`\n${path.join(OUT, 'eye-frames.json')}`);
