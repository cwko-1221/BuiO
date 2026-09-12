/**
 * Build the high-quality Nezuko atlas from the three image-generation walk sheets.
 *
 * The generated sheets are 4x2 review layouts with a rendered checkerboard. This script removes
 * only edge-connected neutral background pixels, splits the eight slots exactly, and maps every
 * frame onto a shared 512px coordinate system. The torso stays fixed to the slot centre and the
 * source baseline is preserved, so extended feet do not make the character wobble sideways.
 *
 * The shipping source is an 8x8 4096px atlas. Rows 0-2 are the eight-frame front/right/back walk
 * cycles, row 3 contains stable directional idle frames, row 4 contains the five special poses,
 * and rows 5-7 intentionally remain transparent.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { findCells, keepPose } from './sheet-cells.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'pet-app', 'art-source', 'imagegen', 'baked-wearables');
const WORK_DIR = path.join(SOURCE_DIR, 'nezuko-kamado-best-v2');
const RAW_DIR = path.join(WORK_DIR, 'raw');
const PROCESSED_DIR = path.join(WORK_DIR, 'processed');
const OUTPUT = path.join(SOURCE_DIR, 'nezuko-kamado-atlas-best-v2-4096.png');
const PREVIEW = path.join(ROOT, 'artifacts', 'nezuko-best-v2-contact-sheet.png');
const IMPORT_DIR = path.join(ROOT, 'artifacts', 'nezuko-best-v2-import');
// The approved 5x4 source is the authority for idle and special poses. Never read those poses
// back from the shipping 8x5 atlas: doing so makes a rebuild recursively treat walk cells as
// idle cells after the runtime layout changes.
const LEGACY_ATLAS = path.join(SOURCE_DIR, 'nezuko-kamado-atlas-5x4-4096.png');
const LEGACY_COLUMNS = 5;
const LEGACY_ROWS = 4;

const FRAME = 512;
const SOURCE_COLUMNS = 8;
const SOURCE_ROWS = 8;
const SHEET_COLUMNS = 4;
const SHEET_ROWS = 2;
const ALPHA = 16;
const directions = ['front', 'right', 'back'];

const at = (x, y, width, channels) => (y * width + x) * channels;

function isCheckerPixel(data, index) {
  const r = data[index], g = data[index + 1], b = data[index + 2];
  return (r + g + b) / 3 >= 138 && Math.max(r, g, b) - Math.min(r, g, b) <= 26;
}

async function removeCheckerboard(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const background = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;

  const enqueue = (x, y) => {
    const flat = y * width + x;
    if (background[flat] || !isCheckerPixel(data, flat * channels)) return;
    background[flat] = 1;
    queue[tail++] = flat;
  };
  for (let x = 0; x < width; x += 1) { enqueue(x, 0); enqueue(x, height - 1); }
  for (let y = 0; y < height; y += 1) { enqueue(0, y); enqueue(width - 1, y); }

  while (head < tail) {
    const flat = queue[head++];
    const x = flat % width, y = (flat - x) / width;
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }

  let cleared = 0;
  for (let flat = 0; flat < background.length; flat += 1) {
    if (!background[flat]) continue;
    data[flat * channels + 3] = 0;
    cleared += 1;
  }
  if (cleared < width * height * 0.45) {
    throw new Error(`${path.basename(file)}: checkerboard removal reached only ${cleared} pixels`);
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function bounds(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1, pixels = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[at(x, y, info.width, info.channels) + 3] <= ALPHA) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y); pixels += 1;
    }
  }
  return right < left ? null : { left, top, right, bottom, width: right - left + 1,
    height: bottom - top + 1, pixels };
}

async function upperCentreX(buffer, box) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const limit = box.top + box.height * 0.68;
  let weightedX = 0, weight = 0;
  for (let y = box.top; y <= Math.min(box.bottom, Math.floor(limit)); y += 1) {
    for (let x = box.left; x <= box.right; x += 1) {
      const alpha = data[at(x, y, info.width, info.channels) + 3];
      if (alpha <= ALPHA) continue;
      weightedX += x * alpha; weight += alpha;
    }
  }
  return weight ? weightedX / weight : box.left + box.width / 2;
}

async function splitDirection(direction) {
  const file = path.join(RAW_DIR, `${direction}-walk-raw.png`);
  const clean = await removeCheckerboard(file);
  const meta = await sharp(clean).metadata();
  await fs.mkdir(path.join(PROCESSED_DIR, direction), { recursive: true });
  await sharp(clean).png().toFile(path.join(PROCESSED_DIR, `${direction}-clean.png`));
  const detected = await findCells(clean, SHEET_COLUMNS, SHEET_ROWS);

  const cells = [];
  for (let index = 0; index < 8; index += 1) {
    const column = index % SHEET_COLUMNS, row = Math.floor(index / SHEET_COLUMNS);
    const left = Math.round(column * meta.width / SHEET_COLUMNS);
    const right = Math.round((column + 1) * meta.width / SHEET_COLUMNS);
    const top = Math.round(row * meta.height / SHEET_ROWS);
    const bottom = Math.round((row + 1) * meta.height / SHEET_ROWS);
    const found = detected[index];
    if (!found) throw new Error(`${direction} frame ${index + 1} could not be isolated`);
    const rawCut = await sharp(clean).extract(found).png().toBuffer();
    const cut = await keepPose(clean, found, rawCut);
    const box = await bounds(cut);
    if (!box) throw new Error(`${direction} frame ${index + 1} is empty`);
    // Keep the detected character's coordinates relative to its intended grid slot. This recovers
    // hair that crosses the review grid while still locking the torso to the slot centre.
    cells.push({ direction, index, cut, box, upperX: await upperCentreX(cut, box),
      width: right - left, height: bottom - top });
  }
  return cells;
}

function sharedScale(groups) {
  const targetX = FRAME / 2;
  const margin = { left: 30, right: 30, top: 24 };
  let scale = Infinity;
  for (const group of groups) {
    for (const cell of group) {
      scale = Math.min(scale,
        (targetX - margin.left) / (cell.upperX - cell.box.left),
        (FRAME - margin.right - targetX) / (cell.box.right - cell.upperX),
        (472 - margin.top) / cell.box.height);
    }
  }
  return scale * 0.98;
}

async function normalizeWalk(group, scale) {
  // Contact, down, passing and up; repeat on the opposite foot. The controlled 10px source
  // amplitude becomes about three pixels in the 160px runtime atlas.
  const phaseBottom = [478, 488, 482, 472, 478, 488, 482, 472];
  const frames = [];
  for (const cell of group) {
    const sprite = await sharp(cell.cut).extract({ left: cell.box.left, top: cell.box.top,
      width: cell.box.width, height: cell.box.height }).png().toBuffer();
    const width = Math.max(1, Math.round(cell.box.width * scale));
    const height = Math.max(1, Math.round(cell.box.height * scale));
    const resized = await sharp(sprite).resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .png().toBuffer();
    const left = Math.round(FRAME / 2 - (cell.upperX - cell.box.left) * scale);
    const top = Math.round(phaseBottom[cell.index] - height);
    if (left < 0 || top < 0 || left + width > FRAME || top + height > FRAME) {
      throw new Error(`${cell.direction} frame ${cell.index + 1} would leave its 512px slot`);
    }
    const frame = await sharp({ create: { width: FRAME, height: FRAME, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: resized, left, top }]).png().toBuffer();
    const finalBounds = await bounds(frame);
    if (Math.min(finalBounds.left, finalBounds.top, FRAME - 1 - finalBounds.right,
      FRAME - 1 - finalBounds.bottom) < 16) {
      throw new Error(`${cell.direction} frame ${cell.index + 1} failed the 16px atlas safety margin`);
    }
    await sharp(frame).png().toFile(path.join(PROCESSED_DIR, cell.direction,
      `${String(cell.index + 1).padStart(2, '0')}.png`));
    frames.push(frame);
  }
  return frames;
}

async function legacyFrame(index) {
  const metadata = await sharp(LEGACY_ATLAS).metadata();
  const column = index % LEGACY_COLUMNS, row = Math.floor(index / LEGACY_COLUMNS);
  const left = Math.round(column * metadata.width / LEGACY_COLUMNS);
  const right = Math.round((column + 1) * metadata.width / LEGACY_COLUMNS);
  const top = Math.round(row * metadata.height / LEGACY_ROWS);
  const bottom = Math.round((row + 1) * metadata.height / LEGACY_ROWS);
  const cut = await sharp(LEGACY_ATLAS).extract({ left, top, width: right - left, height: bottom - top })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = cut;
  const labels = new Int32Array(info.width * info.height).fill(-1);
  const queue = new Int32Array(info.width * info.height);
  const parts = [];
  for (let start = 0; start < labels.length; start += 1) {
    if (labels[start] >= 0 || data[start * info.channels + 3] <= ALPHA) continue;
    const id = parts.length;
    let head = 0, tail = 0, count = 0;
    let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
    labels[start] = id; queue[tail++] = start;
    while (head < tail) {
      const flat = queue[head++], x = flat % info.width, y = (flat - x) / info.width;
      count += 1; x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
        const next = ny * info.width + nx;
        if (labels[next] >= 0 || data[next * info.channels + 3] <= ALPHA) continue;
        labels[next] = id; queue[tail++] = next;
      }
    }
    parts.push({ id, count, x0, y0, x1, y1 });
  }
  const core = [...parts].sort((a, b) => b.count - a.count)[0];
  if (!core) throw new Error(`legacy frame ${index} is empty`);
  const keep = new Set(parts.filter((part) => {
    if (part === core) return true;
    if (index !== 19) return false;
    // Only surprised has intentional detached punctuation. Other detached pieces in the legacy
    // cells are proven neighbour spill and must not survive into the rebuilt atlas.
    const apart = Math.max(core.x0 - part.x1, part.x0 - core.x1,
      core.y0 - part.y1, part.y0 - core.y1, 0);
    return part.count >= 10 && apart <= 18;
  }).map((part) => part.id));
  for (let flat = 0; flat < labels.length; flat += 1) {
    if (!keep.has(labels[flat])) data[flat * info.channels + 3] = 0;
  }
  const cleaned = await sharp(data, { raw: { width: info.width, height: info.height,
    channels: info.channels } }).png().toBuffer();
  return cleaned;
}

async function normalizeLegacy(buffer, targetHeight, targetBottom = 478) {
  const box = await bounds(buffer);
  if (!box) throw new Error('legacy pose is empty');
  const cropped = await sharp(buffer).extract({ left: box.left, top: box.top,
    width: box.width, height: box.height }).png().toBuffer();
  const scale = Math.min(targetHeight / box.height, 452 / box.width);
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const resized = await sharp(cropped).resize(width, height, {
    fit: 'fill', kernel: sharp.kernel.lanczos3,
  }).png().toBuffer();
  const resizedBox = await bounds(resized);
  const centre = await upperCentreX(resized, resizedBox);
  const left = Math.round(FRAME / 2 - centre);
  const top = Math.round(targetBottom - height);
  if (left < 0 || top < 0 || left + width > FRAME || top + height > FRAME) {
    throw new Error('normalized legacy pose would leave its 512px slot');
  }
  return sharp({ create: { width: FRAME, height: FRAME, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left, top }]).png().toBuffer();
}

async function composeAtlas(walkFrames) {
  const tiles = [];
  for (let row = 0; row < walkFrames.length; row += 1) {
    for (let column = 0; column < walkFrames[row].length; column += 1) {
      tiles.push({ input: walkFrames[row][column], left: column * FRAME, top: row * FRAME });
    }
  }

  // Restore the true neutral poses from the approved original 5x4 atlas. Match each pose to the
  // median height and baseline of its new walk, then duplicate it into the unused blink slot.
  // A generated blink changed the whole silhouette, which made the stopped character hop.
  const idleSource = [0, 5, 10];
  for (let direction = 0; direction < idleSource.length; direction += 1) {
    const heights = [];
    for (const frame of walkFrames[direction]) heights.push((await bounds(frame)).height);
    heights.sort((a, b) => a - b);
    const idle = await normalizeLegacy(await legacyFrame(idleSource[direction]), heights[4]);
    for (const column of [direction * 2, direction * 2 + 1]) {
      tiles.push({ input: idle, left: column * FRAME, top: 3 * FRAME });
    }
  }
  // eat, happy, sleep, sit, surprised
  for (let column = 0; column < 5; column += 1) {
    const special = await normalizeLegacy(await legacyFrame(15 + column), column === 2 ? 360 : 430);
    tiles.push({ input: special, left: column * FRAME, top: 4 * FRAME });
  }

  return sharp({ create: { width: SOURCE_COLUMNS * FRAME, height: SOURCE_ROWS * FRAME, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(tiles).png().toBuffer();
}

async function writePreview(walkFrames) {
  const gap = 12, width = 8 * 160 + 7 * gap, height = 3 * 160 + 2 * gap;
  const tiles = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      tiles.push({ input: await sharp(walkFrames[row][column]).resize(160, 160).png().toBuffer(),
        left: column * (160 + gap), top: row * (160 + gap) });
    }
  }
  await fs.mkdir(path.dirname(PREVIEW), { recursive: true });
  await sharp({ create: { width, height, channels: 4, background: { r: 245, g: 241, b: 235, alpha: 1 } } })
    .composite(tiles).png().toFile(PREVIEW);
}

await fs.mkdir(PROCESSED_DIR, { recursive: true });
const groups = [];
for (const direction of directions) groups.push(await splitDirection(direction));
const scale = sharedScale(groups);
const walkFrames = [];
for (const group of groups) walkFrames.push(await normalizeWalk(group, scale));
const atlas = await composeAtlas(walkFrames);
await fs.writeFile(OUTPUT, atlas);
await fs.writeFile(path.join(WORK_DIR, path.basename(OUTPUT)), atlas);
await fs.mkdir(IMPORT_DIR, { recursive: true });
for (let stage = 1; stage <= 4; stage += 1) {
  await fs.writeFile(path.join(IMPORT_DIR, `pet-nezuko-kamado-${stage}.png`), atlas);
}
await writePreview(walkFrames);

const meta = await sharp(atlas).metadata();
console.log(JSON.stringify({ output: OUTPUT, preview: PREVIEW, width: meta.width, height: meta.height,
  channels: meta.channels, hasAlpha: meta.hasAlpha, sharedScale: Number(scale.toFixed(4)) }, null, 2));
