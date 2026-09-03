import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [masterPath, candidatePath, outputPath] = process.argv.slice(2);
if (!masterPath || !candidatePath || !outputPath) {
  throw new Error('usage: node scripts/align-face10-rear-complete-poses.mjs <master> <candidate> <output>');
}

const SIZE = 4096;
const COLUMNS = 5;
const ROW_TOP = 2048;
const ROW_BOTTOM = 3072;
const LOWER_BAND = 220;

const readRgba = async (file) => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const master = await readRgba(masterPath);
const candidate = await readRgba(candidatePath);
for (const image of [master, candidate]) {
  if (image.info.width !== SIZE || image.info.height !== SIZE || image.info.channels !== 4) {
    throw new Error('master and candidate must both be 4096x4096 RGBA');
  }
}

function components(data, x0, x1, y0, y1) {
  const width = x1 - x0;
  const height = y1 - y0;
  const visited = new Uint8Array(width * height);
  const found = [];
  const opaque = (local) => {
    const x = x0 + (local % width);
    const y = y0 + Math.floor(local / width);
    return data[(y * SIZE + x) * 4 + 3] > 0;
  };
  for (let local = 0; local < visited.length; local += 1) {
    if (visited[local] || !opaque(local)) continue;
    const queue = [local];
    const pixels = [];
    visited[local] = 1;
    let minX = x1, minY = y1, maxX = x0 - 1, maxY = y0 - 1;
    for (let head = 0; head < queue.length; head += 1) {
      const p = queue[head];
      pixels.push(p);
      const lx = p % width;
      const ly = Math.floor(p / width);
      const x = x0 + lx;
      const y = y0 + ly;
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = lx + dx, ny = ly + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (!visited[next] && opaque(next)) { visited[next] = 1; queue.push(next); }
      }
    }
    if (pixels.length >= 32) found.push({ pixels, originX: x0, originY: y0, scanWidth: width, minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 });
  }
  return found;
}

function selectRear(data, x0, x1) {
  const candidates = components(data, x0, x1, 1984, ROW_BOTTOM)
    .filter((part) => part.minY < 2700)
    .sort((a, b) => b.pixels.length - a.pixels.length);
  if (!candidates.length) throw new Error(`no rear sprite component in x=${x0}..${x1}`);
  return candidates[0];
}

function lowerGeometry(component, bandHeight = LOWER_BAND) {
  const startY = component.maxY - bandHeight;
  let minX = SIZE, maxX = -1, sx = 0, count = 0;
  for (const local of component.pixels) {
    const x = component.originX + (local % component.scanWidth);
    const y = component.originY + Math.floor(local / component.scanWidth);
    if (y < startY) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); sx += x; count += 1;
  }
  if (!count) throw new Error('rear component has no lower-body pixels');
  return { minX, maxX, width: maxX - minX + 1, cx: sx / count };
}

const placements = [];
const layers = [];
const eraseMask = Buffer.alloc(SIZE * SIZE * 4);
for (let column = 0; column < COLUMNS; column += 1) {
  const x0 = Math.floor(column * SIZE / COLUMNS);
  const x1 = Math.floor((column + 1) * SIZE / COLUMNS);
  const mFull = selectRear(master.data, x0, x1);
  const cFull = selectRear(candidate.data, x0, x1);
  for (const local of cFull.pixels) {
    const x = cFull.originX + (local % cFull.scanWidth);
    const y = cFull.originY + Math.floor(local / cFull.scanWidth);
    const i = (y * SIZE + x) * 4;
    eraseMask[i] = 255; eraseMask[i + 1] = 255; eraseMask[i + 2] = 255; eraseMask[i + 3] = 255;
  }
  const mLow = lowerGeometry(mFull);
  const cLow = lowerGeometry(cFull);
  const scale = mLow.width / cLow.width;
  if (scale < 0.70 || scale > 1.18) throw new Error(`unsafe complete-pose scale ${scale.toFixed(4)} in rear column ${column + 1}`);

  const pad = 8;
  const crop = {
    left: Math.max(0, cFull.minX - pad),
    top: Math.max(1984, cFull.minY - pad),
    width: Math.min(SIZE, cFull.maxX + pad + 1) - Math.max(0, cFull.minX - pad),
    height: Math.min(ROW_BOTTOM, cFull.maxY + pad + 1) - Math.max(1984, cFull.minY - pad),
  };
  const width = Math.round(crop.width * scale);
  const height = Math.round(crop.height * scale);
  const isolated = Buffer.alloc(crop.width * crop.height * 4);
  for (const local of cFull.pixels) {
    const sourceX = cFull.originX + (local % cFull.scanWidth);
    const sourceY = cFull.originY + Math.floor(local / cFull.scanWidth);
    if (sourceX < crop.left || sourceX >= crop.left + crop.width || sourceY < crop.top || sourceY >= crop.top + crop.height) continue;
    const si = (sourceY * SIZE + sourceX) * 4;
    const di = ((sourceY - crop.top) * crop.width + (sourceX - crop.left)) * 4;
    candidate.data.copy(isolated, di, si, si + 4);
  }
  const sprite = await sharp(isolated, { raw: { width: crop.width, height: crop.height, channels: 4 } }).resize(width, height, {
    kernel: sharp.kernel.lanczos3,
  }).png({ compressionLevel: 9 }).toBuffer();

  const left = Math.round(mLow.cx - (cLow.cx - crop.left) * scale);
  const top = Math.round(mFull.maxY - (cFull.maxY - crop.top) * scale);
  layers.push({ input: sprite, left, top });
  placements.push({ column: column + 1, scale, left, top, masterBottom: mFull.maxY, sourceBottom: cFull.maxY });
}

const clear = await sharp(eraseMask, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await sharp(candidatePath).ensureAlpha().composite([
  { input: clear, blend: 'dest-out' },
  ...layers,
]).png({ compressionLevel: 9 }).toFile(outputPath);

console.log(JSON.stringify({ outputPath: path.resolve(outputPath), placements }, null, 2));
