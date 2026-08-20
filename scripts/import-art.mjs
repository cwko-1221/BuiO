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
// A room needs one extra step the first time. Every room in the game shares one grid, and no
// generator lands on a shape on request, so point at the floor's four corners once:
//
//   npm run room:corners -- art-inbox/room-sunny-oak.png
//
// That records them in scripts/room-floors.json, and importing then moves the floor onto the
// grid. Importing a room with no corners recorded leaves it uncorrected and says so.
//
// Assets are served out of pet-app/dist, which the build copies from public, so run
// npm run build:pet afterwards or the old art stays on screen.
//
// Usage:  npm run import:art -- art-inbox/*.png
//         npm run import:art -- --dry art-inbox/pet-starpatch-cat-1.png
//         npm run import:art -- --floor 23,26 77,26 99,100 1,100 art-inbox/room-x.png

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { findFloor } from './room-floor-fit.mjs';

const require = createRequire(import.meta.url);
const { catalog } = require('../pet-app/lib/catalog.js');

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const outIndex = argv.indexOf('--out');
/**
 * --floor takes the floor's four corners as per cent of the image: back-left, back-right,
 * front-right, front-left. The front pair is usually outside the picture, which is allowed and
 * is the whole point — a room drawn wider than its frame has its near corners off the edge.
 */
const CORNER = /^-?[0-9.]+,-?[0-9.]+$/;
const floorIndex = argv.indexOf('--floor');
const floorArgs = floorIndex < 0 ? [] : argv.slice(floorIndex + 1).filter((a, i, all) =>
  CORNER.test(a) && all.slice(0, i).every((b) => CORNER.test(b))).slice(0, 4);
const FLOOR_ARG = floorIndex < 0 ? null : floorArgs.map((pair) => pair.split(',').map((n) => Number(n) / 100));
if (FLOOR_ARG && FLOOR_ARG.length !== 4) {
  throw new Error('--floor wants four "x,y" corners in per cent: back-left back-right front-right front-left');
}

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

/**
 * Knock a flat background out of a sheet that came back without alpha.
 *
 * Not every generator honours a request for transparency, and a sheet on white cannot simply
 * have its white pixels deleted: this dragon has white markings on its wings, and keying by
 * colour punches holes straight through them. So the background is found by flooding inward
 * from the edges of the sheet instead — anything the flood cannot reach without crossing the
 * artwork is interior, and stays.
 *
 * The last pass softens the boundary by one pixel, because a hard cut leaves the pale fringe
 * the generator drew around each subject, and eighty of those stacked on a pet is a visible halo.
 */
async function knockOutBackground(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const at = (x, y) => (y * width + x) * channels;

  // The corners agree on the background colour; if they do not, this is not a flat matte.
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]]
    .map(([x, y]) => [data[at(x, y)], data[at(x, y) + 1], data[at(x, y) + 2]]);
  const [br, bg, bb] = corners[0];
  const agrees = corners.every(([r, g, b]) => Math.abs(r - br) + Math.abs(g - bg) + Math.abs(b - bb) < 24);
  if (!agrees) return null;

  const near = (index, tolerance) =>
    Math.abs(data[index] - br) + Math.abs(data[index + 1] - bg) + Math.abs(data[index + 2] - bb) <= tolerance;

  const background = new Uint8Array(width * height);
  const stack = [];
  for (let x = 0; x < width; x += 1) { stack.push(x, 0, x, height - 1); }
  for (let y = 0; y < height; y += 1) { stack.push(0, y, width - 1, y); }
  while (stack.length) {
    const y = stack.pop();
    const x = stack.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const flat = y * width + x;
    if (background[flat]) continue;
    if (!near(at(x, y), 46)) continue;
    background[flat] = 1;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }

  let cleared = 0;
  for (let i = 0; i < background.length; i += 1) {
    if (!background[i]) continue;
    data[i * channels + 3] = 0;
    cleared += 1;
  }
  if (cleared < background.length * 0.05) return null;   // nothing that looks like a matte

  // Feather: any kept pixel touching the background loses part of its alpha, which takes the
  // generator's pale outline with it instead of leaving it as a rim.
  const edge = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (background[y * width + x]) continue;
      const touching = (x > 0 && background[y * width + x - 1]) || (x < width - 1 && background[y * width + x + 1])
        || (y > 0 && background[(y - 1) * width + x]) || (y < height - 1 && background[(y + 1) * width + x]);
      if (touching && near(at(x, y), 132)) edge.push(at(x, y));
    }
  }
  for (const index of edge) data[index + 3] = Math.round(data[index + 3] * 0.35);

  return {
    buffer: await sharp(data, { raw: { width, height, channels } }).png().toBuffer(),
    cleared: cleared / background.length,
  };
}

/** Give every sheet an alpha channel, keying a flat matte out when the generator did not. */
async function loadSheet(file) {
  const raw = await sharp(file).ensureAlpha().png().toBuffer();
  const { data, info } = await sharp(raw).raw().toBuffer({ resolveWithObject: true });
  let clear = 0;
  for (let i = 3; i < data.length; i += info.channels) if (data[i] < 8) clear += 1;
  if (clear > (data.length / info.channels) * 0.02) return raw;   // already transparent
  const keyed = await knockOutBackground(raw);
  if (!keyed) {
    log('      no alpha and no flat background to key - importing as is');
    return raw;
  }
  log(`      no alpha; keyed a flat background off ${Math.round(keyed.cleared * 100)}% of the sheet`);
  return keyed.buffer;
}

/**
 * Measure the shape of a room's floor: where it starts, and how wide it is at the back and front.
 *
 * Every room in the game is the same size, so this is a check rather than a calibration: the
 * grid does not bend to fit a room, the room has to be drawn to fit the grid. What this reports
 * is how far a generated room has drifted, and whether it is worth generating again.
 *
 * The floor is found by flooding out from the bottom middle of the frame, comparing each pixel to
 * the one it spread from rather than to a fixed sample. Floors are shaded, darkening toward the
 * back, so a fixed sample loses them halfway up; comparing locally follows the gradient and still
 * stops dead at a skirting board. Two earlier attempts failed here: the strongest horizontal edge
 * is a wainscot rail, not the floor, and a fixed reference colour cut the floor in half.
 */
/**
 * The floor the game projects, as fractions of the room image. These are the same three numbers
 * BedroomScene draws its grid from. A room is used exactly as drawn, so all this does is check
 * that the grid lands on painted floor.
 */
const FLOOR_LINE = 0.41, BACK_SPAN = 0.57, FRONT_SPAN = 0.98;
const SPEC = { line: FLOOR_LINE, backSpan: BACK_SPAN, frontSpan: FRONT_SPAN };
/** Back left, back right, front right, front left — the order corners are clicked and stored in. */
const specQuad = () => {
  const back = SPEC.backSpan / 2, front = SPEC.frontSpan / 2;
  return [[.5 - back, SPEC.line], [.5 + back, SPEC.line], [.5 + front, 1], [.5 - front, 1]];
};

/** Solve a small dense system by elimination with partial pivoting. */
function solve(rows, values) {
  const n = values.length;
  const m = rows.map((row, i) => [...row, values[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    if (Math.abs(m[col][col]) < 1e-12) throw new Error('the four corners are degenerate');
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** The projective map taking one quad onto another — the only transform that keeps a plane flat. */
function homography(from, to) {
  const rows = [], values = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i], [u, v] = to[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); values.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]); values.push(v);
  }
  const h = solve(rows, values);
  return (x, y) => {
    const w = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  };
}

/** The room with the grid drawn on it, so where the grid lands is looked at rather than trusted. */
async function gridPreview(file, roomId) {
  const { width, height } = ROOM_SIZE;
  const back = (SPEC.backSpan / 2) * width, front = (SPEC.frontSpan / 2) * width;
  const top = SPEC.line * height, centre = width / 2, ratio = SPEC.backSpan / SPEC.frontSpan;
  const ease = (t) => (ratio * t) / (1 - (1 - ratio) * t);
  const pt = (gx, gy) => {
    const e = ease(gy / 10);
    return [centre + (gx / 14 - .5) * 2 * (back + (front - back) * e), top + (height - top) * e];
  };
  let lines = '';
  for (let c = 0; c <= 14; c++) { const [ax, ay] = pt(c, 0), [bx, by] = pt(c, 10); lines += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/>`; }
  for (let r = 0; r <= 10; r++) { const [ax, ay] = pt(0, r), [bx, by] = pt(14, r); lines += `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}"/>`; }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <g stroke="#00e5ff" stroke-width="2" opacity=".85" fill="none">${lines}</g>
    <polygon points="${pt(0, 0)} ${pt(14, 0)} ${pt(14, 10)} ${pt(0, 10)}" fill="none" stroke="#c0392b" stroke-width="5"/>
  </svg>`;
  const out = path.join('art-inbox', `checked-${roomId}.png`);
  await sharp(file).resize(width, height, { fit: 'fill' })
    .composite([{ input: Buffer.from(svg) }]).png().toFile(out);
  return out;
}

/**
 * Corners pointed at once are kept in the repository, so re-importing a room never asks again and
 * so the correction that produced a shipped room is on the record next to it.
 */
const FLOORS = 'scripts/room-floors.json';
const readFloors = async () => { try { return JSON.parse(await fs.readFile(FLOORS, 'utf8')); } catch { return {}; } };
const savedFloor = async (roomId) => (await readFloors())[roomId] || null;

async function importRoom(file, roomId, dry, quad) {
  const room = catalog.rooms.find((entry) => entry.id === roomId);
  if (!room) throw new Error(`no room called ${roomId}`);

  let corners = quad || await savedFloor(roomId);
  if (!corners) {
    // Nobody has pointed at this room's floor, so fit it: the wall meets the floor along three
    // long straight lines, and those can be found even where wall and floor are the same wood.
    corners = (await findFloor(file)).quad;
    log(`      fitted the floor's corners: ${corners.map((p) => p.map((n) => (n * 100).toFixed(1)).join(',')).join('  ')}`);
    log('      check it in the picture below - npm run room:corners to move any of them');
  }
  /**
   * The grid has to lie on painted floor everywhere, so the check is a margin: how much floor
   * there is beyond the grid's edge, at the back of the grid and at the front. Nothing left over
   * means the grid would hang past the skirting onto the wall, and that is a room to generate
   * again — there is nothing to correct here, because the picture is used exactly as it was drawn.
   */
  const backY = (corners[0][1] + corners[1][1]) / 2;
  const edgeAt = (side, y) => {
    const back = corners[side], front = corners[side === 0 ? 3 : 2];
    return back[0] + (front[0] - back[0]) * (y - backY) / (1 - backY);
  };
  const halfAt = (y) => (BACK_SPAN + (FRONT_SPAN - BACK_SPAN) * (y - FLOOR_LINE) / (1 - FLOOR_LINE)) / 2;
  const spare = (y) => Math.min(.5 - halfAt(y) - edgeAt(0, y), edgeAt(1, y) - (.5 + halfAt(y)));
  const toSpare = Math.min(spare(FLOOR_LINE), spare(1));

  log(`      floor starts ${(backY * 100).toFixed(1)}% against the grid's ${FLOOR_LINE * 100}%, `
    + `${(toSpare * 100).toFixed(1)}% of floor to spare beside the grid`);
  const check = await gridPreview(file, roomId);
  log(`      ${check}`);
  if ((backY > FLOOR_LINE || toSpare < 0) && !argv.includes('--anyway')) {
    log('      the grid would run off the painted floor - generate this room again, or --anyway');
    return 0;
  }
  if (!dry) await fs.writeFile(FLOORS, JSON.stringify({ ...await readFloors(), [roomId]: corners }, null, 2));

  const image = sharp(file).resize(ROOM_SIZE.width, ROOM_SIZE.height, { fit: 'fill' });
  const buffer = await image.flatten({ background: '#ffffff' }).webp({ quality: 90 }).toBuffer();
  await write(fileFor(room.art), buffer, dry);
  return 1;
}

// -------------------------------------------------------------- furniture ---
async function importFurniture(file, roomIds, dry) {
  const sheet = await loadSheet(file);
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
  const sheet = await loadSheet(file);
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
  const sheet = await loadSheet(file);
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
const consumed = new Set([...(outIndex >= 0 ? [outIndex + 1] : [])].map((i) => argv[i]));
const files = argv.filter((entry) => !entry.startsWith('--') && !consumed.has(entry) && !floorArgs.includes(entry));
if (!files.length) {
  console.error('usage: npm run import:art -- [--dry] [--out <dir>] [--floor "x,y x,y x,y x,y"] <sheet.png> ...');
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
      written = await importRoom(file, name.slice(5), dry, FLOOR_ARG);
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
if (!dry && !OUT_ROOT) {
  // The server reads pet-app/dist, which the build copies from pet-app/public. Importing without
  // building leaves the new art in the source tree and the old art on screen.
  log('next: npm run build:pet            copies the new art into the served bundle');
  log('      node scripts/pet-art/index.mjs --only=metrics   re-measures content boxes and anchors');
}
