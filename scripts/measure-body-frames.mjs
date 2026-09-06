/**
 * Measure the lines a wearable hangs from, on every creature, in every pose.
 *
 * The eyes alone only serve the pieces worn on the eyes: bound to them, a collar at the throat is
 * scaled by a span it sits nowhere near and comes out worse than not binding it at all. Every slot
 * needs its own line — a crown the skull, a collar the throat, a pack the back — and it has to be
 * the same line on a cat, a dog and a pig, or a piece carried between them lands somewhere else.
 *
 * Each line is measured as a horizontal segment across the silhouette, which gives a wearable two
 * points to bind to: where the line sits and how wide the creature is there. Two points carry a
 * rotation and a scale between them, so the same measurement serves all three facings — and unlike
 * the eyes, a silhouette is still there when the creature turns its back, which is the pose the
 * whole thing used to fall apart in.
 *
 *   node scripts/measure-body-frames.mjs [--pets starpatch-cat] [--out tmp/body-frames]
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
const OUT = option('out', 'tmp/body-frames');
const PETS = option('pets', catalog.pets.map((p) => p.id).join(',')).split(',');
const STAGES = option('stages', '1,2,3,4').split(',').map(Number);
const COLUMNS = 5;
const ROWS = 4;

const atlasFile = (petId, stage) => {
  const url = catalog.pets.find((pet) => pet.id === petId)?.atlas?.[stage - 1];
  return url ? path.join('pet-app/public', url.replace(/^\/pet\//, '').split('?')[0]) : null;
};

/**
 * The silhouette of one cell, read row by row.
 *
 * Only the widest run in a row is kept. A creature in profile puts its tail out to one side and a
 * walking one lifts a paw clear of the body; counting every inked pixel in the row would let those
 * decide where the head is, when what is wanted is the run the body itself occupies.
 */
function profile(rgba, width, cell, index) {
  const col = index % COLUMNS;
  const row = Math.floor(index / COLUMNS);
  const rows = [];
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < cell; y += 1) {
    let best = null;
    let start = -1;
    for (let x = 0; x <= cell; x += 1) {
      const on = x < cell && rgba[((row * cell + y) * width + col * cell + x) * 4 + 3] > 128;
      if (on && start < 0) start = x;
      if (!on && start >= 0) {
        const run = { left: start, right: x - 1, width: x - start };
        if (!best || run.width > best.width) best = run;
        start = -1;
      }
    }
    rows.push(best);
    if (best) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return { rows, top, bottom };
}

const widestBetween = (rows, from, to) => {
  let best = -1;
  for (let y = from; y <= to; y += 1) if (rows[y] && (best < 0 || rows[y].width > rows[best].width)) best = y;
  return best;
};
const narrowestBetween = (rows, from, to) => {
  let best = -1;
  for (let y = from; y <= to; y += 1) if (rows[y] && (best < 0 || rows[y].width < rows[best].width)) best = y;
  return best;
};

/**
 * The three lines, found from the shape alone.
 *
 * The head is the widest row in the top of the body and the chest the widest in the bottom; between
 * them the silhouette pinches at the throat, and that pinch is the narrowest row of the two. The
 * skull is found by walking down from the very top until the creature is wide enough to be a head
 * rather than the tip of an ear — which is what keeps a crown off the cat's ear tips and out of the
 * dog's floppy ones, the two being nothing like each other at the very top.
 */
function lines(rgba, width, cell, index) {
  const { rows, top, bottom } = profile(rgba, width, cell, index);
  if (top < 0 || bottom - top < 8) return null;
  const height = bottom - top;
  const headRow = widestBetween(rows, top, top + Math.round(height * 0.45));
  const chestRow = widestBetween(rows, top + Math.round(height * 0.5), bottom);
  if (headRow < 0 || chestRow < 0) return null;
  const throatRow = narrowestBetween(rows, headRow, Math.max(headRow + 1, chestRow));

  // The skull is read straight down the middle of the head rather than by how wide the creature
  // has become, because at the very top the two are nothing alike: a cat's ears are two thin spikes
  // with a dip between them and a dog's are one broad curtain. Down the centre line, both give the
  // top of the dome a crown would actually rest on.
  const headMid = Math.round((rows[headRow].left + rows[headRow].right) / 2);
  let skullRow = headRow;
  for (let y = top; y <= headRow; y += 1) {
    const on = rows[y] && headMid >= rows[y].left && headMid <= rows[y].right;
    if (on) { skullRow = y; break; }
  }
  const seg = (y) => (rows[y] ? { y: y / cell, left: rows[y].left / cell, right: rows[y].right / cell } : null);
  return {
    cell: index,
    skull: seg(skullRow),
    head: seg(headRow),
    throat: seg(throatRow),
    chest: seg(chestRow),
    top: top / cell,
    bottom: bottom / cell,
  };
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
      const measured = lines(data, info.width, cell, index);
      cells.push(measured || { cell: index });
      if (!measured) continue;
      const col = index % COLUMNS;
      const row = Math.floor(index / COLUMNS);
      for (const [name, colour] of [['skull', '#ffd166'], ['throat', '#25d0c0'], ['chest', '#e86a5c']]) {
        const line = measured[name];
        if (!line) continue;
        marks.push(`<line x1="${col * cell + line.left * cell}" y1="${row * cell + line.y * cell}" `
          + `x2="${col * cell + line.right * cell}" y2="${row * cell + line.y * cell}" `
          + `stroke="${colour}" stroke-width="2.5"/>`);
      }
    }
    found[`${petId}:${stage}`] = cells;
    console.log(`${petId}:${stage}  ${cells.filter((c) => c.skull).length}/20 cells measured`);
    if (stage === 1) {
      await sharp(file)
        .composite([{ input: Buffer.from(`<svg width="${info.width}" height="${info.height}">${marks.join('')}</svg>`) }])
        .png().toFile(path.join(OUT, `${petId}-${stage}-lines.png`));
    }
  }
}

await fs.writeFile(path.join(OUT, 'body-frames.json'), `${JSON.stringify(found, null, 2)}\n`);
console.log(`\n${path.join(OUT, 'body-frames.json')}`);
