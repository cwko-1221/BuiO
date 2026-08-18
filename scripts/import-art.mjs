// Bring generated sprite sheets into the pet module.
//
// The art is produced as a handful of large sheets — one room per image, twenty pieces of
// furniture to a sheet, twenty poses of one creature to a sheet. The runtime wants individual
// files at hashed paths, at fixed canvas sizes, with each object squared up the same way. This
// script is the bridge: it slices a sheet on its grid, trims each cell to what was actually
// drawn, and re-seats it on the canvas the runtime expects.
//
// Which sheet is which comes from the file name, and nothing else:
//
//   room-<roomId>.png                     one room, 1600x900, opaque
//   furniture-<roomA>-<roomB>.png         5x4, cells 1-10 room A, cells 11-20 room B
//   wearable-<slot>.png                   grid per slot, in catalogue order
//   pet-<speciesId>-<stage>.png           5x4 poses of one creature at one stage
//
// By default this overwrites the live assets. Pass --out <dir> to write a copy somewhere else
// and look at a batch before it replaces anything.
//
// Usage:  npm run import:art -- art-inbox/*.png
//         npm run import:art -- --dry art-inbox/pet-starpatch-cat-1.png

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';

const require = createRequire(import.meta.url);
const { catalog } = require('../pet-app/lib/catalog.js');

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const outIndex = argv.indexOf('--out');
const OUT_ROOT = outIndex >= 0 ? path.resolve(argv[outIndex + 1]) : null;
const PUBLIC_ROOT = path.resolve('pet-app/public');
/** Canvas the runtime expects for each kind of standalone object. */
const PROP_CANVAS = 640;
const ROOM_SIZE = { width: 1600, height: 900 };
/** One atlas cell. Kept small on purpose: the whole sheet has to fit older tablets' texture limit. */
const ATLAS_CELL = 160;
const ATLAS_COLUMNS = 5;
const ATLAS_ROWS = 4;

/** Poses in a creature sheet, cell by cell. Row 4 is played facing the viewer whatever the walk. */
const POSE_ROWS = ['front', 'right', 'back'];
const POSE_COLUMNS = ['idle', 'walk-a', 'walk-pass', 'walk-b', 'blink'];
const FRONT_ONLY = ['eat', 'happy', 'sleep', 'sit', 'surprised'];

const WEARABLE_GRID = { head: [5, 4], face: [4, 3], neck: [4, 4], back: [4, 4], aura: [4, 4] };

const log = (...parts) => console.log(...parts);

/** Where a published asset URL lives on disk. */
const fileFor = (url) => path.join(OUT_ROOT || PUBLIC_ROOT, url.replace('/pet/assets', 'assets'));

/** Alpha bounding box of an image buffer, or null when nothing was drawn. */
async function contentBounds(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Cut one cell out of a sheet laid out as a uniform grid. */
async function cell(sheet, meta, columns, rows, index) {
  const width = Math.floor(meta.width / columns);
  const height = Math.floor(meta.height / rows);
  return sharp(sheet)
    .extract({ left: (index % columns) * width, top: Math.floor(index / columns) * height, width, height })
    .png().toBuffer();
}

/**
 * Re-seat a cut-out on a fixed canvas.
 *
 * Generated sheets never land their subjects in exactly the same place twice, so what was drawn
 * is trimmed out and placed deliberately: centred horizontally, and either standing on the
 * canvas floor or centred, depending on whether the thing stands on something.
 */
async function seat(buffer, { canvas, fill = 0.86, standing = true, scale }) {
  const bounds = await contentBounds(buffer);
  if (!bounds) return null;
  const trimmed = await sharp(buffer).extract(bounds).png().toBuffer();
  const factor = scale ?? Math.min((canvas * fill) / bounds.width, (canvas * fill) / bounds.height);
  const width = Math.max(1, Math.round(bounds.width * factor));
  const height = Math.max(1, Math.round(bounds.height * factor));
  const resized = await sharp(trimmed).resize(width, height).png().toBuffer();
  const top = standing ? Math.round(canvas * 0.97) - height : Math.round((canvas - height) / 2);
  return sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left: Math.round((canvas - width) / 2), top: Math.max(0, top) }])
    .webp({ quality: 92 }).toBuffer();
}

async function write(target, buffer, dry) {
  if (dry) return log(`      would write ${path.relative('.', target)}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, buffer);
}

// ------------------------------------------------------------------ rooms ---
async function importRoom(file, roomId, dry) {
  const room = catalog.rooms.find((entry) => entry.id === roomId);
  if (!room) throw new Error(`no room called ${roomId}`);
  const buffer = await sharp(file).resize(ROOM_SIZE.width, ROOM_SIZE.height, { fit: 'fill' })
    .flatten({ background: '#ffffff' }).webp({ quality: 90 }).toBuffer();
  await write(fileFor(room.art), buffer, dry);
  return 1;
}

// -------------------------------------------------------------- furniture ---
async function importFurniture(file, roomIds, dry) {
  const sheet = await sharp(file).png().toBuffer();
  const meta = await sharp(sheet).metadata();
  let written = 0;
  for (let block = 0; block < roomIds.length; block += 1) {
    const pieces = catalog.furniture.filter((item) => item.roomId === roomIds[block]);
    if (!pieces.length) throw new Error(`no furniture for room ${roomIds[block]}`);
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      const cut = await cell(sheet, meta, 5, 4, block * 10 + index);
      // A rug lies flat and is centred; everything else stands on the floor of its canvas.
      const seated = await seat(cut, { canvas: PROP_CANVAS, standing: piece.layer !== 'rug' });
      if (!seated) { log(`      cell ${block * 10 + index + 1} is empty, skipped`); continue; }
      await write(fileFor(piece.art), seated, dry);
      written += 1;
    }
  }
  return written;
}

// --------------------------------------------------------------- wearables ---
async function importWearables(file, slot, dry) {
  const grid = WEARABLE_GRID[slot];
  if (!grid) throw new Error(`unknown wearable slot ${slot}`);
  const items = catalog.wearables.filter((item) => item.slot === slot);
  const sheet = await sharp(file).png().toBuffer();
  const meta = await sharp(sheet).metadata();
  let written = 0;
  for (let index = 0; index < items.length; index += 1) {
    const cut = await cell(sheet, meta, grid[0], grid[1], index);
    const seated = await seat(cut, { canvas: PROP_CANVAS, standing: false, fill: 0.8 });
    if (!seated) { log(`      cell ${index + 1} is empty, skipped`); continue; }
    await write(fileFor(items[index].art), seated, dry);
    written += 1;
  }
  return written;
}

// -------------------------------------------------------------------- pets ---
/**
 * One creature at one stage becomes two things: the atlas the room animates, and the single
 * portrait used by the collection and the shop.
 *
 * Every cell is scaled by the same factor and stood on the same baseline. Left to itself a
 * generator draws the creature a little larger in one pose than the next, and that reads as the
 * pet pulsing as it walks — far more obvious than any single frame being slightly off.
 */
async function importPet(file, speciesId, stage, dry) {
  const pet = catalog.pets.find((entry) => entry.id === speciesId);
  if (!pet) throw new Error(`no species called ${speciesId}`);
  const sheet = await sharp(file).png().toBuffer();
  const meta = await sharp(sheet).metadata();

  const cells = [];
  for (let index = 0; index < ATLAS_COLUMNS * ATLAS_ROWS; index += 1) {
    const cut = await cell(sheet, meta, ATLAS_COLUMNS, ATLAS_ROWS, index);
    cells.push({ cut, bounds: await contentBounds(cut) });
  }
  const drawn = cells.filter((entry) => entry.bounds);
  if (!drawn.length) throw new Error(`${path.basename(file)} is empty`);
  // One scale for the whole sheet, taken from the standing poses.
  //
  // Scaling each cell to fill its own would flatten the poses that are meant to differ - a
  // curled sleeper would be blown up to the height of a standing walk. Taking the tallest cell
  // as the reference has the opposite fault: one happy hop with the feet off the ground shrinks
  // the entire creature. The middle of the fifteen walking cells is the honest reference, since
  // by construction they are all the same creature standing, and the fit against the tallest
  // cell is kept only so nothing gets clipped by its cell.
  const standing = cells.slice(0, POSE_ROWS.length * ATLAS_COLUMNS)
    .filter((entry) => entry.bounds).map((entry) => entry.bounds.height).sort((a, b) => a - b);
  const reference = standing.length ? standing[Math.floor(standing.length / 2)]
    : Math.max(...drawn.map((entry) => entry.bounds.height));
  const tallest = Math.max(...drawn.map((entry) => entry.bounds.height));
  const widest = Math.max(...drawn.map((entry) => entry.bounds.width));
  const shared = Math.min(
    (ATLAS_CELL * 0.80) / reference,
    (ATLAS_CELL * 0.96) / tallest,
    (ATLAS_CELL * 0.94) / widest,
  );

  const tiles = [];
  for (let index = 0; index < cells.length; index += 1) {
    if (!cells[index].bounds) continue;
    const seated = await seat(cells[index].cut, { canvas: ATLAS_CELL, standing: true, scale: shared });
    tiles.push({
      input: await sharp(seated).png().toBuffer(),
      left: (index % ATLAS_COLUMNS) * ATLAS_CELL,
      top: Math.floor(index / ATLAS_COLUMNS) * ATLAS_CELL,
    });
  }
  const atlas = await sharp({
    create: { width: ATLAS_COLUMNS * ATLAS_CELL, height: ATLAS_ROWS * ATLAS_CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(tiles).webp({ quality: 92 }).toBuffer();
  await write(fileFor(pet.atlas[stage - 1]), atlas, dry);

  // The portrait is the front-facing idle, at the size the rest of the interface expects.
  const portrait = await seat(cells[0].cut, { canvas: PROP_CANVAS, standing: true, fill: 0.88 });
  if (portrait) await write(fileFor(pet.art[stage - 1]), portrait, dry);
  return 2;
}

/** The frame table the runtime reads, derived from the sheet layout rather than restated. */
function spriteManifest() {
  const clips = [];
  POSE_ROWS.forEach((facing, row) => {
    const base = row * ATLAS_COLUMNS;
    clips.push({ name: 'idle', facing, frames: [base + 0, base + 0, base + 4] });
    // Contact, pass, contact, pass reads as a step rather than a shuffle.
    clips.push({ name: 'walk', facing, frames: [base + 1, base + 2, base + 3, base + 2] });
  });
  FRONT_ONLY.forEach((name, column) => {
    clips.push({ name, facing: 'front', frames: [3 * ATLAS_COLUMNS + column] });
  });
  return {
    frameWidth: ATLAS_CELL, frameHeight: ATLAS_CELL,
    columns: ATLAS_COLUMNS, rows: ATLAS_ROWS, fps: 8,
    directions: POSE_ROWS,
    poses: { rows: POSE_ROWS, columns: POSE_COLUMNS, frontOnly: FRONT_ONLY },
    clips,
  };
}

// -------------------------------------------------------------------- main ---
const files = argv.filter((entry, index) => !entry.startsWith('--') && argv[index - 1] !== '--out');
if (!files.length) {
  console.error('usage: npm run import:art -- [--dry] [--out <dir>] <sheet.png> ...');
  process.exit(1);
}

let assets = 0;
let sheets = 0;
let touchedPets = false;
for (const file of files) {
  const name = path.basename(file).replace(/\.(png|webp|jpg|jpeg)$/i, '');
  log(`\n${path.basename(file)}`);
  try {
    let written = 0;
    if (name.startsWith('room-')) {
      written = await importRoom(file, name.slice(5), dry);
    } else if (name.startsWith('furniture-')) {
      const ids = name.slice(10).split('+');
      written = await importFurniture(file, ids.length > 1 ? ids : splitRoomPair(name.slice(10)), dry);
    } else if (name.startsWith('wearable-')) {
      written = await importWearables(file, name.slice(9), dry);
    } else if (name.startsWith('pet-')) {
      const match = name.match(/^pet-(.+)-(\d)$/);
      if (!match) throw new Error('expected pet-<speciesId>-<stage>');
      written = await importPet(file, match[1], Number(match[2]), dry);
      touchedPets = true;
    } else {
      throw new Error('unrecognised name; expected room- / furniture- / wearable- / pet-');
    }
    assets += written;
    sheets += 1;
    log(`      ${written} asset${written === 1 ? '' : 's'}`);
  } catch (error) {
    log(`      skipped: ${error.message}`);
  }
}

/** Room ids contain hyphens, so a furniture pair is split on the known ids rather than on "-". */
function splitRoomPair(stem) {
  const ids = catalog.rooms.map((room) => room.id).sort((a, b) => b.length - a.length);
  for (const first of ids) {
    if (!stem.startsWith(`${first}-`)) continue;
    const second = stem.slice(first.length + 1);
    if (ids.includes(second)) return [first, second];
  }
  throw new Error(`cannot tell which two rooms "${stem}" means`);
}

if (touchedPets && !dry) {
  const target = path.join(OUT_ROOT || PUBLIC_ROOT, 'assets', 'art', 'sprites', 'manifest.json');
  await fs.writeFile(target, JSON.stringify(spriteManifest(), null, 0));
  log('\nrewrote sprites/manifest.json for the pose sheet layout');
}

log(`\n${sheets} sheet${sheets === 1 ? '' : 's'} → ${assets} asset${assets === 1 ? '' : 's'}${dry ? ' (dry run)' : ''}`);
if (!dry) log('run `node scripts/pet-art/index.mjs --only=metrics` to re-measure content boxes and anchors');
