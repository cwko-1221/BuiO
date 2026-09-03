import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [masterPath, candidatePath, outputPath] = process.argv.slice(2);
if (!masterPath || !candidatePath || !outputPath) throw new Error('usage: node scripts/align-face10-special-complete-poses.mjs <master> <candidate> <output>');

const SIZE = 4096;
const read = async (file) => sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const master = await read(masterPath);
const candidate = await read(candidatePath);

const jobs = [
  { name: 'feeding', x0: 0, x1: 819, y0: 2920, y1: 4096 },
  { name: 'jumping', x0: 819, x1: 1638, y0: 2920, y1: 4096 },
];

function foreground(data, job) {
  const pixels = [];
  let minX = job.x1, minY = job.y1, maxX = job.x0 - 1, maxY = job.y0 - 1;
  for (let y = job.y0; y < job.y1; y += 1) for (let x = job.x0; x < job.x1; x += 1) {
    const i = (y * SIZE + x) * 4;
    if (data[i + 3] === 0) continue;
    pixels.push(y * SIZE + x);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (!pixels.length) throw new Error(`no ${job.name} foreground`);
  return { pixels, minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function lower(subject, bandHeight = 220) {
  const startY = subject.maxY - bandHeight;
  let minX = SIZE, maxX = -1, sx = 0, count = 0;
  for (const p of subject.pixels) {
    const x = p % SIZE, y = Math.floor(p / SIZE);
    if (y < startY) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); sx += x; count += 1;
  }
  return { width: maxX - minX + 1, cx: sx / count };
}

const erase = Buffer.alloc(SIZE * SIZE * 4);
const layers = [];
const placements = [];
for (const job of jobs) {
  const m = foreground(master.data, job);
  const c = foreground(candidate.data, job);
  const ml = lower(m), cl = lower(c);
  const scale = ml.width / cl.width;
  if (scale < 0.78 || scale > 1.12) throw new Error(`unsafe ${job.name} scale ${scale.toFixed(4)}`);

  const pad = 8;
  const crop = {
    left: Math.max(job.x0, c.minX - pad), top: Math.max(job.y0, c.minY - pad),
    width: Math.min(job.x1, c.maxX + pad + 1) - Math.max(job.x0, c.minX - pad),
    height: Math.min(job.y1, c.maxY + pad + 1) - Math.max(job.y0, c.minY - pad),
  };
  const isolated = Buffer.alloc(crop.width * crop.height * 4);
  for (const p of c.pixels) {
    const x = p % SIZE, y = Math.floor(p / SIZE), si = p * 4;
    const mi = p * 4;
    erase[mi] = 255; erase[mi + 1] = 255; erase[mi + 2] = 255; erase[mi + 3] = 255;
    const di = ((y - crop.top) * crop.width + (x - crop.left)) * 4;
    candidate.data.copy(isolated, di, si, si + 4);
  }
  const width = Math.round(crop.width * scale), height = Math.round(crop.height * scale);
  const sprite = await sharp(isolated, { raw: { width: crop.width, height: crop.height, channels: 4 } })
    .resize(width, height, { kernel: sharp.kernel.lanczos3 }).png({ compressionLevel: 9 }).toBuffer();
  const left = Math.round(ml.cx - (cl.cx - crop.left) * scale);
  const top = Math.round(m.maxY - (c.maxY - crop.top) * scale);
  layers.push({ input: sprite, left, top });
  placements.push({ name: job.name, scale, left, top, masterBottom: m.maxY, sourceBottom: c.maxY });
}

const erasePng = await sharp(erase, { raw: { width: SIZE, height: SIZE, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await sharp(candidatePath).ensureAlpha().composite([{ input: erasePng, blend: 'dest-out' }, ...layers])
  .png({ compressionLevel: 9 }).toFile(outputPath);
console.log(JSON.stringify({ outputPath: path.resolve(outputPath), placements }, null, 2));
