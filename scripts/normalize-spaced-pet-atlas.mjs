import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [sourceArg] = process.argv.slice(2);
if (!sourceArg) throw new Error('usage: node scripts/normalize-spaced-pet-atlas.mjs <generated-source>');
const sourcePath = path.resolve(sourceArg);
const root = process.cwd();
const outputDir = path.join(root, 'pet-app', 'art-source', 'imagegen', 'baked-wearables', 'cat');
const rawCopyPath = path.join(outputDir, 'pet-starpatch-cat-2-spaced-raw.png');
const finalPath = path.join(outputDir, 'pet-starpatch-cat-2.png');
const inboxPath = path.join(root, 'art-inbox', 'pet-starpatch-cat-2.png');

const src = await sharp(sourcePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = src.info.width, H = src.info.height, C = 4;
const rgba = Buffer.alloc(W * H * C);
for (let p = 0; p < W * H; p += 1) {
  rgba[p * C] = src.data[p * 3];
  rgba[p * C + 1] = src.data[p * 3 + 1];
  rgba[p * C + 2] = src.data[p * 3 + 2];
  rgba[p * C + 3] = 255;
}

const background = new Uint8Array(W * H), queue = new Int32Array(W * H);
let head = 0, tail = 0;
const checkerPixel = (p) => {
  const i = p * C, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
  return Math.min(r, g, b) > 216 && Math.max(r, g, b) - Math.min(r, g, b) < 15;
};
const add = (p) => { if (!background[p] && checkerPixel(p)) { background[p] = 1; queue[tail++] = p; } };
for (let x = 0; x < W; x += 1) { add(x); add((H - 1) * W + x); }
for (let y = 0; y < H; y += 1) { add(y * W); add(y * W + W - 1); }
while (head < tail) {
  const p = queue[head++], x = p % W, y = Math.floor(p / W);
  if (x > 0) add(p - 1); if (x + 1 < W) add(p + 1); if (y > 0) add(p - W); if (y + 1 < H) add(p + W);
}
for (let p = 0; p < W * H; p += 1) if (background[p]) rgba[p * C + 3] = 0;

const foreground = new Uint8Array(W * H);
for (let p = 0; p < W * H; p += 1) foreground[p] = rgba[p * C + 3] ? 1 : 0;
const seen = new Uint8Array(W * H), components = [];
for (let seed = 0; seed < foreground.length; seed += 1) if (foreground[seed] && !seen[seed]) {
  seen[seed] = 1; const pixels = [seed]; let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let q = 0; q < pixels.length; q += 1) {
    const p = pixels[q], x = p % W, y = Math.floor(p / W);
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) { const next = yy * W + xx; if (foreground[next] && !seen[next]) { seen[next] = 1; pixels.push(next); } }
    }
  }
  components.push({ pixels, size: pixels.length, minX, minY, maxX, maxY });
}
components.sort((a, b) => b.size - a.size);
const keep = components.slice(0, 20);
const cleaned = Buffer.alloc(W * H * C);
for (const component of keep) for (const p of component.pixels) {
  const i = p * C; cleaned[i] = rgba[i]; cleaned[i + 1] = rgba[i + 1]; cleaned[i + 2] = rgba[i + 2]; cleaned[i + 3] = rgba[i + 3];
}

const finalBuffer = await sharp(cleaned, { raw: { width: W, height: H, channels: C } })
  .resize(4096, 4096, { fit: 'fill', kernel: 'lanczos3' })
  .png()
  .toBuffer();
await fs.copyFile(sourcePath, rawCopyPath);
await fs.writeFile(finalPath, finalBuffer);
await fs.writeFile(inboxPath, finalBuffer);
console.log(JSON.stringify({ sourceDimensions: [W, H], componentsDetected: components.length, keptComponents: keep.length, keptSizes: keep.map((c) => c.size), rawCopyPath, finalPath, inboxPath }));
