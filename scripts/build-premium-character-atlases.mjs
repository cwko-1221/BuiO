/**
 * Build the extended 8x8 / 4096px character atlases used by premium pet-app characters.
 *
 * Each character owns five generated source sheets under:
 *   pet-app/art-source/imagegen/baked-wearables/<id>-perfect-v1/raw/
 *
 * Runtime uses the first five rows:
 *   0 front walk, 1 right-profile walk, 2 back walk, 3 front idle, 4 specials.
 * Remaining cells stay transparent. Every frame is isolated, cleaned, and normalized around one
 * shared scale and upper-body anchor before it can reach the importer.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { findCells, keepPose } from './sheet-cells.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_ROOT = path.join(ROOT, 'pet-app', 'art-source', 'imagegen', 'baked-wearables');
const ARTIFACT_ROOT = path.join(ROOT, 'artifacts', 'premium-character-atlases');
const FRAME = 512;
const ALPHA = 16;
const WALK_BOTTOMS = [478, 485, 481, 472, 478, 485, 481, 472];
const RAW_ROWS = ['front-walk', 'right-walk', 'back-walk', 'front-idle'];
const CHARACTERS = [
  { id: 'dragon-ball-goku', label: 'Goku' },
  { id: 'crayon-shin-chan', label: 'Crayon Shin-chan' },
  { id: 'doraemon', label: 'Doraemon' },
  { id: 'hello-kitty', label: 'Hello Kitty' },
];

const pixel = (x, y, width, channels) => (y * width + x) * channels;

function neutralBackground(data, at) {
  const r = data[at], g = data[at + 1], b = data[at + 2];
  return (r + g + b) / 3 >= 128 && Math.max(r, g, b) - Math.min(r, g, b) <= 32;
}

/** Remove edge-connected baked checker/neutral backgrounds while retaining white costume areas. */
async function transparentSheet(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const corners = [0, width - 1, (height - 1) * width, height * width - 1]
    .map((at) => data[at * channels + 3]);
  if (corners.every((alpha) => alpha <= ALPHA)) {
    return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
  }

  const seen = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0, tail = 0;
  const add = (x, y) => {
    const flat = y * width + x;
    if (seen[flat] || !neutralBackground(data, flat * channels)) return;
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
  if (tail < width * height * 0.25) {
    throw new Error(`${path.basename(file)}: opaque background could not be isolated safely`);
  }
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
  const lower = Math.floor(box.top + box.height * 0.68);
  let sum = 0, weight = 0;
  for (let y = box.top; y <= lower; y += 1) for (let x = box.left; x <= box.right; x += 1) {
    const alpha = data[pixel(x, y, info.width, info.channels) + 3];
    if (alpha <= ALPHA) continue;
    sum += x * alpha; weight += alpha;
  }
  return weight ? sum / weight : box.left + box.width / 2;
}

/** Keep the character and intentional detached marks; remove isolated checker dust. */
async function cleanFragments(buffer) {
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
  const threshold = Math.max(32, Math.round(core.count * 0.0015));
  const keep = new Set(parts.filter((part) => part === core || part.count >= threshold).map((part) => part.id));
  for (let at = 0; at < labels.length; at += 1) if (!keep.has(labels[at])) data[at * info.channels + 3] = 0;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .png().toBuffer();
}

async function splitGrid(file, columns, rows, count) {
  const clean = await transparentSheet(file);
  const boxes = await findCells(clean, columns, rows);
  const frames = [];
  for (let index = 0; index < count; index += 1) {
    const box = boxes[index];
    if (!box) throw new Error(`${path.basename(file)} frame ${index + 1} is empty`);
    const raw = await sharp(clean).extract(box).png().toBuffer();
    const cut = await cleanFragments(await keepPose(clean, box, raw));
    const bounds = await contentBounds(cut);
    if (!bounds) throw new Error(`${path.basename(file)} frame ${index + 1} is empty`);
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

async function contactSheet(rows, destination) {
  const cell = 160, gap = 10;
  const width = 8 * cell + 7 * gap, height = 5 * cell + 4 * gap;
  const composites = [];
  for (let row = 0; row < rows.length; row += 1) for (let column = 0; column < rows[row].length; column += 1) {
    composites.push({ input: await sharp(rows[row][column]).resize(cell, cell).png().toBuffer(),
      left: column * (cell + gap), top: row * (cell + gap) });
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await sharp({ create: { width, height, channels: 4,
    background: { r: 245, g: 241, b: 235, alpha: 1 } } })
    .composite(composites).png().toFile(destination);
}

const reports = [];
for (const character of CHARACTERS) {
  const workDir = path.join(SOURCE_ROOT, `${character.id}-perfect-v1`);
  const rawDir = path.join(workDir, 'raw');
  const processedDir = path.join(workDir, 'processed');
  const output = path.join(SOURCE_ROOT, `${character.id}-atlas-perfect-v1-4096.png`);
  const artifactDir = path.join(ARTIFACT_ROOT, character.id);
  const importDir = path.join(artifactDir, 'import');
  await fs.mkdir(processedDir, { recursive: true });

  const groups = [];
  for (const row of RAW_ROWS) groups.push(await splitGrid(path.join(rawDir, `${row}-raw.png`), 4, 2, 8));
  const specialsSource = await splitGrid(path.join(rawDir, 'specials-raw.png'), 5, 1, 5);
  const scale = commonScale(groups);
  const normalizedRows = [];
  for (let row = 0; row < groups.length; row += 1) {
    const destination = path.join(processedDir, RAW_ROWS[row]);
    await fs.mkdir(destination, { recursive: true });
    const frames = [];
    for (let index = 0; index < 8; index += 1) {
      let frame = await normalize(groups[row][index], scale, row === 3 ? 478 : WALK_BOTTOMS[index]);
      frames.push(frame);
      await fs.writeFile(path.join(destination, `${String(index + 1).padStart(2, '0')}.png`), frame);
    }
    normalizedRows.push(frames);
  }

  const specials = [];
  const specialDir = path.join(processedDir, 'specials');
  await fs.mkdir(specialDir, { recursive: true });
  for (let index = 0; index < specialsSource.length; index += 1) {
    const source = specialsSource[index];
    const specialScale = Math.min(scale,
      226 / Math.max(1, source.upperX - source.bounds.left),
      226 / Math.max(1, source.bounds.right - source.upperX),
      450 / source.bounds.height);
    let frame = await normalize(source, specialScale, 480);
    specials.push(frame);
    await fs.writeFile(path.join(specialDir, `${String(index + 1).padStart(2, '0')}.png`), frame);
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
  await fs.writeFile(output, atlas);
  await fs.writeFile(path.join(workDir, path.basename(output)), atlas);
  await fs.mkdir(importDir, { recursive: true });
  for (let stage = 1; stage <= 4; stage += 1) {
    await fs.writeFile(path.join(importDir, `pet-${character.id}-${stage}.png`), atlas);
  }
  const preview = path.join(artifactDir, 'contact-sheet.png');
  await contactSheet(normalizedRows, preview);
  reports.push({ id: character.id, label: character.label, output, preview,
    sharedScale: Number(scale.toFixed(4)), frames: 37 });
}

await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
await fs.writeFile(path.join(ARTIFACT_ROOT, 'build-report.json'), JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
