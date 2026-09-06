/**
 * Can an accessory baked on one creature be worn by another?
 *
 * Every species is drawn on the same twenty-pose template — same camera, same actions — so the
 * turn of the head in pose seven is a property of the pose, not of the animal. If that is true,
 * the rotation cancels when carrying a piece from one species to another, and all that is left
 * between them is where the head sits and how big it is, which the catalogue already measures for
 * every form as `facingAnchors` plus a per-frame motion track.
 *
 * That would make the expensive axis free: bake a piece once on the cat, wear it on all eighty
 * forms. This script tests it by carrying the cat's own baked patches onto the dog and the pig and
 * drawing the result. It writes to tmp/ and changes nothing.
 *
 *   node scripts/spike-cross-species.mjs [--items face-05,neck-06] [--out tmp/cross-species]
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
const OUT = option('out', 'tmp/cross-species');
const WANTED = option('items', 'face-05,face-11,head-03,neck-06').split(',');
// Targets are named "pet" or "pet:stage" — a later stage is as different a body as another
// species, so it is worth carrying onto as well.
const TARGETS = option('onto', 'cloud-ear-dog,pudding-pig').split(',').map((name) => {
  const [petId, stage] = name.split(':');
  return { petId, stage: Number(stage) || 1 };
});

const SOURCE = 'starpatch-cat';
const STAGE = 1;
const CELL = 160;
const COLUMNS = 5;
const ROWS = 4;

/** Which way each atlas cell faces, read off the shipped animation layout rather than assumed. */
const FACING = new Array(COLUMNS * ROWS).fill('front');
for (const action of catalog.animation.actions) {
  for (const frame of action.frames || []) FACING[frame] = action.facing;
}
// The layout files the curled sleeper under "front" because that is the direction it is played
// from, but it is drawn lying on its side and its head is nowhere the front landmarks say. Read it
// against the profile instead, which is the closer of the two measured sets.
FACING[17] = 'right';

/**
 * Where a slot hangs from, kept only for the cells the eyes cannot be seen in.
 */
const SLOT_FRAME = {
  head: { line: (a) => a.eye, across: 'headCentre', size: (a) => a.face },
  face: { line: (a) => a.eye, across: 'headCentre', size: (a) => a.face },
  neck: { line: (a) => a.eye, across: 'headCentre', size: (a) => a.face },
  back: { line: (a) => a.eye, across: 'centre', size: (a) => a.width },
  aura: { line: (a) => a.bottom, across: 'centre', size: (a) => a.width },
};

const decodeMotion = (packed) => {
  if (!packed) return null;
  const bytes = Buffer.from(packed, 'base64');
  return new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
};

const MEASURED = JSON.parse(await fs.readFile('tmp/eye-frames/eye-frames.json', 'utf8'));

/** The landmark table's guess at where the eyes are in one cell. */
function predicted(definition, stage, cell, slot) {
  const facing = FACING[cell];
  const rest = definition.facingAnchors?.[stage - 1]?.[facing] || definition.anchors?.[stage - 1];
  if (!rest) return null;
  const frame = SLOT_FRAME[slot] || SLOT_FRAME.face;
  const track = decodeMotion(definition.motion?.[stage - 1]);
  const at = track && cell * 4 + 3 < track.length ? cell * 4 : -1;
  const drift = at >= 0 ? track[at + 1] / CELL : 0;
  const centre = rest.centre + (at >= 0 ? track[at + 2] / CELL : 0);
  const stretch = at >= 0 ? 1 + track[at + 3] / 100 : 1;
  const across = frame.across === 'headCentre' ? (rest.headCentre ?? rest.centre) : rest.centre;
  return {
    x: (across + (centre - rest.centre)) * CELL,
    y: (frame.line(rest) + drift) * CELL,
    size: frame.size(rest) * stretch * CELL,
  };
}

/**
 * One creature's head frame in every cell: the eyes where they can be seen, and the landmark
 * table's guess elsewhere — corrected, so the guess agrees with the measurements it does have.
 *
 * Without that correction the two sources disagree by a fixed amount and the accessory jumps as the
 * creature turns from a cell that was measured into one that was not.
 */
const meanBy = (rows, pick) => rows.reduce((sum, r) => sum + pick(r), 0) / rows.length;

/**
 * How big one creature's face is against another's, taken from the eyes.
 *
 * This is the number the landmark table gets wrong. It calls the dog's face the wider of the two,
 * because it measures the whole muzzle; the eyes say the opposite — they sit closer together on the
 * dog than on the cat. Goggles are worn on the eyes, so it is the eyes that set their size, and
 * trusting the table instead draws them half again too large and lifts them off the face.
 *
 * Only cells showing both eyes can measure a span, so the ratio is taken once per pair of forms
 * rather than per cell: the frame-to-frame wobble is noise beside the difference between animals.
 */
function faceRatio(sourceCells, targetCells) {
  const sourcePairs = sourceCells.filter((c) => c.eyes === 2);
  const targetPairs = targetCells.filter((c) => c.eyes === 2);
  if (!sourcePairs.length || !targetPairs.length) return null;
  // Across the face and down it are different numbers, and on some animals very different: the
  // pig's eyes sit wider apart than the cat's while being drawn smaller. One scale cannot satisfy
  // both, so the piece is carried across by the span, which is what puts a lens over each eye, and
  // down by the eye's own height, which is what keeps the lens the size of the eye it covers.
  return {
    x: meanBy(targetPairs, (c) => c.span) / meanBy(sourcePairs, (c) => c.span),
    y: meanBy(targetPairs, (c) => c.tall) / meanBy(sourcePairs, (c) => c.tall),
  };
}

/** Where the landmark table says the eyes are, shifted to agree with the cells that were measured. */
function fallbacks(definition, stage, slot) {
  const measured = MEASURED[`${definition.id}:${stage}`] || [];
  const guess = Array.from({ length: COLUMNS * ROWS }, (_, cell) => predicted(definition, stage, cell, slot));
  const shift = {};
  for (const facing of ['front', 'right', 'back']) {
    const here = measured.filter((m) => m.eyes && FACING[m.cell] === facing && guess[m.cell]);
    const use = here.length ? here : measured.filter((m) => m.eyes && FACING[m.cell] === 'front' && guess[m.cell]);
    shift[facing] = use.length
      ? { dx: meanBy(use, (m) => m.x * CELL - guess[m.cell].x), dy: meanBy(use, (m) => m.y * CELL - guess[m.cell].y) }
      : { dx: 0, dy: 0 };
  }
  return guess.map((g, cell) => (g ? { x: g.x + shift[FACING[cell]].dx, y: g.y + shift[FACING[cell]].dy } : null));
}

/**
 * Pair up the two creatures cell by cell: where the piece sits now, and where it should go.
 *
 * A pair of eyes is measured at their midpoint and a single eye at itself, so a cell that shows two
 * on one creature and one on the other is measuring two different things. Those cells drop to the
 * table on both sides rather than being matched across a change of meaning.
 */
function pairing(source, sourceStage, target, targetStage, slot) {
  const sourceCells = MEASURED[`${source.id}:${sourceStage}`] || [];
  const targetCells = MEASURED[`${target.id}:${targetStage}`] || [];
  const ratio = faceRatio(sourceCells, targetCells) ?? { x: 1, y: 1 };
  const sourceGuess = fallbacks(source, sourceStage, slot);
  const targetGuess = fallbacks(target, targetStage, slot);
  return Array.from({ length: COLUMNS * ROWS }, (_, cell) => {
    const a = sourceCells.find((c) => c.cell === cell);
    const b = targetCells.find((c) => c.cell === cell);
    const matched = a && b && a.eyes && a.eyes === b.eyes;
    const from = matched ? { x: a.x * CELL, y: a.y * CELL } : sourceGuess[cell];
    const to = matched ? { x: b.x * CELL, y: b.y * CELL } : targetGuess[cell];
    if (!from || !to) return null;
    return { from, to, ratio, measured: !!matched };
  });
}

const readAtlas = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

const atlasFile = (petId, stage) => {
  const url = catalog.pets.find((pet) => pet.id === petId)?.atlas?.[stage - 1];
  if (!url) throw new Error(`no atlas for ${petId}:${stage}`);
  return path.join('pet-app/public', url.replace(/^\/pet\//, '').split('?')[0]);
};

/** Carry one cell of a patch from one creature's head frame into another's. */
function carry(patch, cell, from, to, ratio, out) {
  const col = cell % COLUMNS;
  const row = Math.floor(cell / COLUMNS);
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      // Inverse map: where in the source cell does this destination pixel come from?
      const sx = from.x + (x - to.x) / ratio.x;
      const sy = from.y + (y - to.y) / ratio.y;
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

/** Draw a patch over an atlas on a flat floor colour, at twice size so it can be judged. */
async function contact(atlas, layer, label) {
  const width = COLUMNS * CELL;
  const height = ROWS * CELL;
  const canvas = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    canvas[i * 4] = 122; canvas[i * 4 + 1] = 104; canvas[i * 4 + 2] = 92; canvas[i * 4 + 3] = 255;
  }
  const over = (source) => {
    for (let i = 0; i < width * height; i += 1) {
      const a = source[i * 4 + 3] / 255;
      if (!a) continue;
      for (let c = 0; c < 3; c += 1) {
        canvas[i * 4 + c] = Math.round(source[i * 4 + c] * a + canvas[i * 4 + c] * (1 - a));
      }
    }
  };
  over(atlas.data);
  over(layer);
  const title = Buffer.from(
    `<svg width="${width}" height="34"><rect width="100%" height="100%" fill="#101014"/>`
    + `<text x="10" y="23" font-family="Arial" font-size="16" fill="#e6e1d6">${label}</text></svg>`,
  );
  const body = await sharp(canvas, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return sharp({ create: { width, height: height + 34, channels: 4, background: { r: 16, g: 16, b: 20, alpha: 1 } } })
    .composite([{ input: title, top: 0, left: 0 }, { input: body, top: 34, left: 0 }])
    .png().toBuffer();
}

await fs.mkdir(OUT, { recursive: true });
const source = catalog.pets.find((pet) => pet.id === SOURCE);

for (const itemId of WANTED) {
  const entry = catalog.redrawnWearables[`${SOURCE}:${STAGE}:${itemId}`];
  if (!entry?.patch) { console.log(`${itemId}: no baked patch, skipped`); continue; }
  const patch = await readAtlas(path.join('pet-app/public', entry.patch.replace(/^\/pet\//, '')));
  const strips = [];

  const catAtlas = await readAtlas(atlasFile(SOURCE, STAGE));
  strips.push(await contact(catAtlas, patch.data, `${itemId}  ·  starpatch-cat  ·  baked (reference)`));

  for (const { petId: targetId, stage: targetStage } of TARGETS) {
    const target = catalog.pets.find((pet) => pet.id === targetId);
    if (!target) { console.log(`${targetId}: unknown`); continue; }
    const moved = Buffer.alloc(patch.data.length);
    const pairs = pairing(source, STAGE, target, targetStage, entry.slot);
    let carried = 0;
    let bothMeasured = 0;
    for (let cell = 0; cell < COLUMNS * ROWS; cell += 1) {
      const pair = pairs[cell];
      if (!pair) continue;
      carry(patch, cell, pair.from, pair.to, pair.ratio, moved);
      carried += 1;
      if (pair.measured) bothMeasured += 1;
    }
    const atlas = await readAtlas(atlasFile(targetId, STAGE));
    strips.push(await contact(atlas, moved, `${itemId}  ·  ${targetId}  ·  carried across (${carried}/20 cells)`));
    await sharp(moved, { raw: { width: patch.width, height: patch.height, channels: 4 } })
      .webp({ quality: 92 }).toFile(path.join(OUT, `${targetId}-1--${itemId}--carried.webp`));
  }

  const meta = await Promise.all(strips.map((s) => sharp(s).metadata()));
  const sheet = await sharp({
    create: {
      width: meta[0].width, height: meta.reduce((sum, m) => sum + m.height + 8, 0),
      channels: 4, background: { r: 16, g: 16, b: 20, alpha: 1 },
    },
  }).composite(strips.map((input, i) => ({
    input, left: 0, top: meta.slice(0, i).reduce((sum, m) => sum + m.height + 8, 0),
  }))).png().toFile(path.join(OUT, `${itemId}-across-species.png`));
  console.log(`${itemId}  →  ${path.join(OUT, `${itemId}-across-species.png`)}  ${sheet.width}x${sheet.height}`);
}
