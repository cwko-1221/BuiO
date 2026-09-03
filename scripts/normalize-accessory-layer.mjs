import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [rawPath, id, version = 'v1'] = process.argv.slice(2);
if (!rawPath || !id) throw new Error('usage: node scripts/normalize-accessory-layer.mjs <raw-layer> <wearable-id>');
const root = process.cwd();
const basePath = path.join(root, 'art-inbox', 'pet-starpatch-cat-1.png');
const sourceMeta = await sharp(path.resolve(rawPath)).metadata();
const raw = await sharp(path.resolve(rawPath)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = raw.info.width, H = raw.info.height, C = 4;
const working = Buffer.from(raw.data);
if (!sourceMeta.hasAlpha) {
  const bg = new Uint8Array(W * H), queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  const cornerAverage = [0, W - 1, (H - 1) * W, H * W - 1].reduce((sum, p) => {
    const i = p * C; return sum + working[i] + working[i + 1] + working[i + 2];
  }, 0) / 12;
  const backgroundPixel = (p) => {
    const i = p * C, r = working[i], g = working[i + 1], b = working[i + 2];
    if (cornerAverage < 64) return Math.max(r, g, b) < 42 && Math.max(r, g, b) - Math.min(r, g, b) < 24;
    return Math.min(r, g, b) > 218 && Math.max(r, g, b) - Math.min(r, g, b) < 14;
  };
  const add = (p) => { if (!bg[p] && backgroundPixel(p)) { bg[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < W; x += 1) { add(x); add((H - 1) * W + x); }
  for (let y = 0; y < H; y += 1) { add(y * W); add(y * W + W - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % W, y = Math.floor(p / W);
    if (x > 0) add(p - 1); if (x + 1 < W) add(p + 1); if (y > 0) add(p - W); if (y + 1 < H) add(p + W);
  }
  for (let p = 0; p < W * H; p += 1) working[p * C + 3] = bg[p] ? 0 : 255;
}
const threshold = 64;
const bin = new Uint8Array(W * H);
for (let p = 0; p < W * H; p += 1) bin[p] = working[p * C + 3] >= threshold ? 1 : 0;
const seen = new Uint8Array(W * H), components = [];
for (let s = 0; s < bin.length; s += 1) if (bin[s] && !seen[s]) {
  seen[s] = 1; const q = [s]; let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let k = 0; k < q.length; k += 1) {
    const p = q[k], x = p % W, y = Math.floor(p / W);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) { const z = yy * W + xx; if (bin[z] && !seen[z]) { seen[z] = 1; q.push(z); } }
    }
  }
  components.push({ pixels: q, size: q.length, minX, minY, maxX, maxY });
}
components.sort((a, b) => b.size - a.size);
const keep = components.slice(0, 20);
const cleaned = Buffer.alloc(W * H * C);
for (const comp of keep) for (const p of comp.pixels) {
  const i = p * C;
  cleaned[i] = working[i]; cleaned[i + 1] = working[i + 1]; cleaned[i + 2] = working[i + 2]; cleaned[i + 3] = working[i + 3];
}
const normalized = await sharp(cleaned, { raw: { width: W, height: H, channels: C } }).resize(4096, 4096, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
const outDir = path.join(root, 'pet-app', 'art-source', 'imagegen', 'baked-wearables', 'cat', id);
const layerPath = path.join(outDir, `${id}-accessory-layer-${version}-4096.png`);
const compositePath = path.join(outDir, `${id}-dressed-layered-${version}-4096.png`);
await fs.writeFile(layerPath, normalized);
const base = await sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const layer = await sharp(normalized).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const composite = Buffer.from(base.data);
let active = 0;
for (let p = 0; p < 4096 * 4096; p += 1) {
  const i = p * C;
  if (layer.data[i + 3] > 0) { composite[i] = layer.data[i]; composite[i + 1] = layer.data[i + 1]; composite[i + 2] = layer.data[i + 2]; composite[i + 3] = Math.max(base.data[i + 3], layer.data[i + 3]); active += 1; }
}
await sharp(composite, { raw: { width: 4096, height: 4096, channels: C } }).png().toFile(compositePath);
console.log(JSON.stringify({ id, rawDimensions: [W, H], componentsDetected: components.length, keptComponents: keep.length, keptSizes: keep.map((c) => c.size), layerPath, compositePath, activePixels: active }));
