import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseArg, dressedArg, outputArg] = process.argv.slice(2);
if (!baseArg || !dressedArg || !outputArg) {
  throw new Error('usage: node scripts/align-pet2-dressed-atlas.mjs <base.png> <dressed.png> <output.png>');
}

const basePath = path.resolve(baseArg);
const dressedPath = path.resolve(dressedArg);
const outputPath = path.resolve(outputArg);

async function loadRgba(file) {
  const result = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== 4096 || result.info.height !== 4096 || result.info.channels !== 4) {
    throw new Error(`${file} must be 4096x4096 RGBA`);
  }
  return result.data;
}

function components(data) {
  const width = 4096;
  const height = 4096;
  const pixels = width * height;
  const foreground = new Uint8Array(pixels);
  const seen = new Uint8Array(pixels);
  const queue = new Int32Array(pixels);
  const result = [];

  for (let p = 0; p < pixels; p += 1) foreground[p] = data[p * 4 + 3] > 0 ? 1 : 0;

  for (let seed = 0; seed < pixels; seed += 1) {
    if (!foreground[seed] || seen[seed]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = seed;
    seen[seed] = 1;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let sumX = 0;
    let sumY = 0;
    const support = [];

    while (head < tail) {
      const p = queue[head++];
      support.push(p);
      const x = p % width;
      const y = Math.floor(p / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;

      const add = (next) => {
        if (next < 0 || next >= pixels || seen[next] || !foreground[next]) return;
        seen[next] = 1;
        queue[tail++] = next;
      };
      if (x > 0) add(p - 1);
      if (x + 1 < width) add(p + 1);
      if (y > 0) add(p - width);
      if (y + 1 < height) add(p + width);
    }

    if (support.length < 5000) continue;
    const centerX = sumX / support.length;
    const centerY = sumY / support.length;
    const row = Math.max(0, Math.min(3, Math.floor(centerY / 1024)));
    const column = Math.max(0, Math.min(4, Math.floor(centerX / (4096 / 5))));
    const key = row * 5 + column + 1;
    const bandHeight = Math.max(32, Math.min(96, Math.round((maxY - minY + 1) * 0.12)));
    const bottomXs = support
      .filter((p) => Math.floor(p / width) >= maxY - bandHeight + 1 && data[p * 4 + 3] >= 128)
      .map((p) => p % width)
      .sort((a, b) => a - b);
    const bottomMedianX = bottomXs[Math.floor(bottomXs.length / 2)];
    if (result.some((component) => component.key === key)) throw new Error(`multiple components mapped to cell ${key}`);
    result.push({ key, support, minX, minY, maxX, maxY, bottomMedianX });
  }

  result.sort((a, b) => a.key - b.key);
  if (result.length !== 20 || result.some((component, index) => component.key !== index + 1)) {
    throw new Error(`expected one main component in each of 20 cells; got keys ${result.map(({ key }) => key).join(',')}`);
  }
  return result;
}

const base = await loadRgba(basePath);
const dressed = await loadRgba(dressedPath);
const baseComponents = components(base);
const dressedComponents = components(dressed);
const aligned = Buffer.alloc(4096 * 4096 * 4);
const transforms = [];

for (let index = 0; index < 20; index += 1) {
  const reference = baseComponents[index];
  const source = dressedComponents[index];
  const dx = reference.bottomMedianX - source.bottomMedianX;
  const dy = reference.maxY - source.maxY;
  transforms.push({ cell: index + 1, dx, dy });

  for (const p of source.support) {
    const x = p % 4096;
    const y = Math.floor(p / 4096);
    const xx = x + dx;
    const yy = y + dy;
    if (xx < 0 || xx >= 4096 || yy < 0 || yy >= 4096) {
      throw new Error(`cell ${index + 1} translation clips pixel ${x},${y}`);
    }
    const sourceIndex = p * 4;
    const targetIndex = (yy * 4096 + xx) * 4;
    const sourceAlpha = dressed[sourceIndex + 3];
    if (sourceAlpha >= aligned[targetIndex + 3]) {
      aligned[targetIndex] = dressed[sourceIndex];
      aligned[targetIndex + 1] = dressed[sourceIndex + 1];
      aligned[targetIndex + 2] = dressed[sourceIndex + 2];
      aligned[targetIndex + 3] = sourceAlpha;
    }
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(aligned, { raw: { width: 4096, height: 4096, channels: 4 } }).png().toFile(outputPath);
console.log(JSON.stringify({ basePath, dressedPath, outputPath, transforms }, null, 2));
