/**
 * Build Nezuko's fully redrawn animation atlas from one consistent generated model.
 *
 * Source sheets:
 *   row 0  front walk, eight phases
 *   row 1  strict right-profile walk, eight phases
 *   row 2  back walk, eight phases
 *   row 3  front idle/breathe/blink, eight phases
 *   row 4  eat, happy, sleep, sit, surprised
 *
 * The shipping source is an exact 8x8, 4096px transparent atlas. Runtime uses the first five
 * rows. All frames share one scale and upper-body anchor. Front/back second steps receive a
 * deterministic opposite-leg pass below the garment hem, preventing image generation from
 * accidentally animating the same foot twice while preserving the horn and ribbon orientation.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { findCells, keepPose } from './sheet-cells.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'pet-app', 'art-source', 'imagegen', 'baked-wearables');
const WORK_DIR = path.join(SOURCE_ROOT, 'nezuko-kamado-perfect-v3');
const RAW_DIR = path.join(WORK_DIR, 'raw');
const PROCESSED_DIR = path.join(WORK_DIR, 'processed');
const OUTPUT = path.join(SOURCE_ROOT, 'nezuko-kamado-atlas-perfect-v3-4096.png');
const IMPORT_DIR = path.join(ROOT, 'artifacts', 'nezuko-perfect-v3-import');
const PREVIEW = path.join(ROOT, 'artifacts', 'nezuko-perfect-v3-contact-sheet.png');

const FRAME = 512;
const ALPHA = 16;
// Contact, down, passing, up, then the opposite foot. This becomes a restrained four-pixel
// runtime arc: enough to read weight transfer, never enough to resemble a hop.
const WALK_BOTTOMS = [478, 485, 481, 472, 478, 485, 481, 472];
const ROWS = ['front-walk', 'right-walk', 'back-walk', 'front-idle'];
const RAW_FILES = ['front-walk-raw.png', 'right-walk-raw.png', 'back-walk-raw.png', 'front-idle-raw.png'];

const pixel = (x, y, width, channels) => (y * width + x) * channels;

function checker(data, at) {
  const r = data[at], g = data[at + 1], b = data[at + 2];
  return (r + g + b) / 3 >= 132 && Math.max(r, g, b) - Math.min(r, g, b) <= 28;
}

/** Remove only edge-connected neutral checker pixels, preserving white costume details. */
async function transparentSheet(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const cornerAlpha = [0, width - 1, (height - 1) * width, height * width - 1]
    .map((at) => data[at * channels + 3]);
  if (cornerAlpha.every((alpha) => alpha <= ALPHA)) {
    return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
  }

  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const add = (x, y) => {
    const flat = y * width + x;
    if (seen[flat] || !checker(data, flat * channels)) return;
    seen[flat] = 1;
    queue[tail++] = flat;
  };
  for (let x = 0; x < width; x += 1) { add(x, 0); add(x, height - 1); }
  for (let y = 0; y < height; y += 1) { add(0, y); add(width - 1, y); }
  while (head < tail) {
    const flat = queue[head++], x = flat % width, y = (flat - x) / width;
    if (x) add(x - 1, y);
    if (x + 1 < width) add(x + 1, y);
    if (y) add(x, y - 1);
    if (y + 1 < height) add(x, y + 1);
  }
  if (tail < width * height * 0.35) throw new Error(`${path.basename(file)} background could not be isolated`);
  for (let at = 0; at < seen.length; at += 1) if (seen[at]) data[at * channels + 3] = 0;
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}

async function contentBounds(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
    if (data[pixel(x, y, info.width, info.channels) + 3] <= ALPHA) continue;
    left = Math.min(left, x); top = Math.min(top, y);
    right = Math.max(right, x); bottom = Math.max(bottom, y);
  }
  return right < left ? null : { left, top, right, bottom,
    width: right - left + 1, height: bottom - top + 1 };
}

async function upperCentre(buffer, box) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const bottom = Math.floor(box.top + box.height * 0.7);
  let sum = 0, weight = 0;
  for (let y = box.top; y <= bottom; y += 1) for (let x = box.left; x <= box.right; x += 1) {
    const alpha = data[pixel(x, y, info.width, info.channels) + 3];
    if (alpha <= ALPHA) continue;
    sum += x * alpha; weight += alpha;
  }
  return weight ? sum / weight : box.left + box.width / 2;
}

/** Keep the character and intentional large detached marks; discard checker dust and neighbours. */
async function cleanFragments(buffer, retainDetached = true) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const labels = new Int32Array(info.width * info.height).fill(-1);
  const queue = new Int32Array(info.width * info.height);
  const parts = [];
  for (let start = 0; start < labels.length; start += 1) {
    if (labels[start] >= 0 || data[start * info.channels + 3] <= ALPHA) continue;
    const id = parts.length;
    let head = 0, tail = 0, count = 0;
    labels[start] = id; queue[tail++] = start;
    while (head < tail) {
      const flat = queue[head++], x = flat % info.width, y = (flat - x) / info.width;
      count += 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= info.width || ny >= info.height) continue;
        const next = ny * info.width + nx;
        if (labels[next] >= 0 || data[next * info.channels + 3] <= ALPHA) continue;
        labels[next] = id; queue[tail++] = next;
      }
    }
    parts.push({ id, count });
  }
  const core = [...parts].sort((a, b) => b.count - a.count)[0];
  if (!core) return buffer;
  const threshold = retainDetached ? Math.max(24, Math.round(core.count * 0.0015)) : Infinity;
  const keep = new Set(parts.filter((part) => part === core || part.count >= threshold).map((part) => part.id));
  for (let at = 0; at < labels.length; at += 1) {
    if (!keep.has(labels[at])) data[at * info.channels + 3] = 0;
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png().toBuffer();
}

async function split(file, columns, rows, count, retainDetached = () => true) {
  const clean = await transparentSheet(file);
  const boxes = await findCells(clean, columns, rows);
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const box = boxes[index];
    if (!box) throw new Error(`${path.basename(file)} frame ${index + 1} is empty`);
    const raw = await sharp(clean).extract(box).png().toBuffer();
    const cut = await cleanFragments(await keepPose(clean, box, raw), retainDetached(index));
    const bounds = await contentBounds(cut);
    if (!bounds) throw new Error(`${path.basename(file)} frame ${index + 1} lost its character`);
    frames.push({ cut, bounds, upperX: await upperCentre(cut, bounds), index });
  }
  return frames;
}

function commonScale(groups) {
  let scale = Infinity;
  for (const frames of groups) for (const frame of frames) {
    scale = Math.min(scale,
      226 / Math.max(1, frame.upperX - frame.bounds.left),
      226 / Math.max(1, frame.bounds.right - frame.upperX),
      450 / frame.bounds.height);
  }
  return scale * 0.985;
}

async function normalize(frame, scale, bottom) {
  const sprite = await sharp(frame.cut).extract({ left: frame.bounds.left, top: frame.bounds.top,
    width: frame.bounds.width, height: frame.bounds.height }).png().toBuffer();
  const width = Math.max(1, Math.round(frame.bounds.width * scale));
  const height = Math.max(1, Math.round(frame.bounds.height * scale));
  const resized = await sharp(sprite).resize(width, height, {
    fit: 'fill', kernel: sharp.kernel.lanczos3,
  }).png().toBuffer();
  const left = Math.round(FRAME / 2 - (frame.upperX - frame.bounds.left) * scale);
  const top = Math.round(bottom - height);
  if (left < 0 || top < 0 || left + width > FRAME || top + height > FRAME) {
    throw new Error(`frame ${frame.index + 1} leaves its normalized slot`);
  }
  return sharp({ create: { width: FRAME, height: FRAME, channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left, top }]).png().toBuffer();
}

/** Opposite lower-body phase without mirroring identity-defining hair, horn or ribbon. */
async function oppositeLegs(upper, firstHalf) {
  const [{ data, info }, lower] = await Promise.all([
    sharp(upper).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(firstHalf).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const seam = 382;
  for (let y = seam; y < FRAME; y += 1) for (let x = 0; x < FRAME; x += 1) {
    const target = pixel(x, y, FRAME, info.channels);
    const source = pixel(FRAME - 1 - x, y, FRAME, info.channels);
    for (let channel = 0; channel < 4; channel += 1) data[target + channel] = lower.data[source + channel];
  }
  return sharp(data, { raw: { width: FRAME, height: FRAME, channels: 4 } }).png().toBuffer();
}

async function normalizeSpecials(frames) {
  const output = [];
  for (const frame of frames) {
    const scale = Math.min(440 / frame.bounds.height, 456 / frame.bounds.width);
    output.push(await normalize(frame, scale, 480));
  }
  return output;
}

async function contactSheet(rows) {
  const cell = 160, gap = 10;
  const width = 8 * cell + 7 * gap, height = 5 * cell + 4 * gap;
  const composites = [];
  for (let row = 0; row < rows.length; row += 1) for (let column = 0; column < rows[row].length; column += 1) {
    composites.push({ input: await sharp(rows[row][column]).resize(cell, cell).png().toBuffer(),
      left: column * (cell + gap), top: row * (cell + gap) });
  }
  await fs.mkdir(path.dirname(PREVIEW), { recursive: true });
  await sharp({ create: { width, height, channels: 4,
    background: { r: 245, g: 241, b: 235, alpha: 1 } } })
    .composite(composites).png().toFile(PREVIEW);
}

await fs.mkdir(PROCESSED_DIR, { recursive: true });
const groups = [];
for (const file of RAW_FILES) groups.push(await split(path.join(RAW_DIR, file), 4, 2, 8));
const scale = commonScale(groups);
const normalizedRows = [];
for (let row = 0; row < groups.length; row += 1) {
  const output = [];
  const destination = path.join(PROCESSED_DIR, ROWS[row]);
  await fs.mkdir(destination, { recursive: true });
  for (let index = 0; index < 8; index += 1) {
    const bottom = row === 3 ? 478 : WALK_BOTTOMS[index];
    output.push(await normalize(groups[row][index], scale, bottom));
  }
  if (row === 0 || row === 2) {
    for (let index = 4; index < 8; index += 1) {
      output[index] = await oppositeLegs(output[index], output[index - 4]);
    }
  }
  for (let index = 0; index < output.length; index += 1) {
    await fs.writeFile(path.join(destination, `${String(index + 1).padStart(2, '0')}.png`), output[index]);
  }
  normalizedRows.push(output);
}

const specials = await normalizeSpecials(await split(
  path.join(RAW_DIR, 'specials-raw.png'), 5, 1, 5, (index) => index === 4,
));
await fs.mkdir(path.join(PROCESSED_DIR, 'specials'), { recursive: true });
for (let index = 0; index < specials.length; index += 1) {
  await fs.writeFile(path.join(PROCESSED_DIR, 'specials', `${String(index + 1).padStart(2, '0')}.png`), specials[index]);
}
normalizedRows.push(specials);

const tiles = [];
for (let row = 0; row < normalizedRows.length; row += 1) {
  for (let column = 0; column < normalizedRows[row].length; column += 1) {
    tiles.push({ input: normalizedRows[row][column], left: column * FRAME, top: row * FRAME });
  }
}
const atlas = await sharp({ create: { width: 4096, height: 4096, channels: 4,
  background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(tiles).png().toBuffer();
await fs.writeFile(OUTPUT, atlas);
await fs.writeFile(path.join(WORK_DIR, path.basename(OUTPUT)), atlas);
await fs.mkdir(IMPORT_DIR, { recursive: true });
for (let stage = 1; stage <= 4; stage += 1) {
  await fs.writeFile(path.join(IMPORT_DIR, `pet-nezuko-kamado-${stage}.png`), atlas);
}
await contactSheet(normalizedRows);

const metadata = await sharp(atlas).metadata();
console.log(JSON.stringify({ output: OUTPUT, preview: PREVIEW, width: metadata.width,
  height: metadata.height, channels: metadata.channels, alpha: metadata.hasAlpha,
  sharedScale: Number(scale.toFixed(4)), frames: 37 }, null, 2));
