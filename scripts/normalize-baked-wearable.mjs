/**
 * Turn an ImageGen wearable-only contact sheet into the game's exact 5 x 4 atlas.
 *
 * Built-in ImageGen reliably preserves the requested grid but may render transparency as a near-
 * black matte. The matte is connected to the canvas edge, while the dark painted detail inside a
 * helmet, wing or leather strap is enclosed by its coloured rim. Flooding only edge-connected,
 * low-chroma dark pixels removes the matte without punching holes in the artwork. The cleaned
 * result is then resized as one sheet, preserving every cell's relative position.
 *
 *   node scripts/normalize-baked-wearable.mjs input.png output.png
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import sharp from 'sharp';

const [input, output, matteMode = 'dark'] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node scripts/normalize-baked-wearable.mjs <input> <output> [dark|light]');
  process.exit(1);
}

const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const pixels = info.width * info.height;
const matte = new Uint8Array(pixels);
const queued = new Uint8Array(pixels);
const queue = new Int32Array(pixels);
let head = 0;
let tail = 0;

const candidate = (index) => {
  const at = index * info.channels;
  const r = data[at];
  const g = data[at + 1];
  const b = data[at + 2];
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  // ImageGen may return a near-black matte or bake its light checkerboard into the pixels. In
  // either case the matte is neutral and edge-connected; chroma protects painted fur, metal and
  // leather even when their brightness happens to be similar.
  return matteMode === 'light'
    // The generated checkerboard is nearly neutral #f4f4f4/#fdfdfd. Keep this deliberately
    // narrow: a broad "light neutral" rule can walk from the background through antialiasing
    // into a cream pet or white helmet and punch transparent holes in the finished redraw.
    ? low > 228 && high - low < 7
    : high < 18 || (high < 92 && high - low < 24);
};

const push = (index) => {
  if (queued[index] || !candidate(index)) return;
  queued[index] = 1;
  queue[tail++] = index;
};

for (let x = 0; x < info.width; x += 1) {
  push(x);
  push((info.height - 1) * info.width + x);
}
for (let y = 0; y < info.height; y += 1) {
  push(y * info.width);
  push(y * info.width + info.width - 1);
}

while (head < tail) {
  const index = queue[head++];
  matte[index] = 1;
  const x = index % info.width;
  const y = Math.floor(index / info.width);
  if (x > 0) push(index - 1);
  if (x + 1 < info.width) push(index + 1);
  if (y > 0) push(index - info.width);
  if (y + 1 < info.height) push(index + info.width);
}

const rgba = Buffer.alloc(pixels * 4);
let transparent = 0;
for (let index = 0; index < pixels; index += 1) {
  const source = index * info.channels;
  const target = index * 4;
  const r = data[source];
  const g = data[source + 1];
  const b = data[source + 2];
  const certainMatte = matteMode === 'light'
    ? false
    : Math.max(r, g, b) < 8;
  const alpha = matte[index] || certainMatte ? 0 : 255;
  rgba[target] = r;
  rgba[target + 1] = g;
  rgba[target + 2] = b;
  rgba[target + 3] = alpha;
  if (!alpha) transparent += 1;
}

await fs.mkdir(path.dirname(output), { recursive: true });
await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
  .resize(800, 640, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
  .png({ compressionLevel: 9 })
  .toFile(output);

console.log(`${output}: ${info.width}x${info.height} -> 800x640, ${Math.round(transparent / pixels * 1000) / 10}% matte removed`);
