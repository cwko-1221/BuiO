import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseAtlas, feedingRaw, jumpingRaw, outputAtlas, row3Atlas, row3Raw] = process.argv.slice(2);
if (!baseAtlas || !feedingRaw || !jumpingRaw || !outputAtlas) {
  throw new Error('usage: node scripts/compose-face10-complete-pose-fixes.mjs <base-atlas> <feeding-raw> <jumping-raw> <output-atlas>');
}

async function removeBlack(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const n = width * height;
  const bg = new Uint8Array(n);
  const q = new Uint32Array(n);
  let head = 0, tail = 0;
  const paper = (p) => {
    const i = p * 3;
    return Math.max(data[i], data[i + 1], data[i + 2]) <= 24;
  };
  const add = (p) => { if (!bg[p] && paper(p)) { bg[p] = 1; q[tail++] = p; } };
  for (let x = 0; x < width; x++) { add(x); add((height - 1) * width + x); }
  for (let y = 1; y < height - 1; y++) { add(y * width); add(y * width + width - 1); }
  while (head < tail) {
    const p = q[head++], x = p % width, y = Math.floor(p / width);
    if (x) add(p - 1); if (x + 1 < width) add(p + 1);
    if (y) add(p - width); if (y + 1 < height) add(p + width);
  }
  const rgba = Buffer.alloc(n * 4);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let p = 0; p < n; p++) {
    const si = p * 3, di = p * 4;
    rgba[di] = data[si]; rgba[di + 1] = data[si + 1]; rgba[di + 2] = data[si + 2];
    rgba[di + 3] = bg[p] ? 0 : 255;
    if (!bg[p]) { const x = p % width, y = Math.floor(p / width); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
  }
  return { rgba, width, height, bbox: { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 } };
}

async function cropAndScale(cut, targetWidth) {
  const b = cut.bbox;
  const scale = targetWidth / b.width;
  const width = Math.round(b.width * scale);
  const height = Math.round(b.height * scale);
  const png = await sharp(cut.rgba, { raw: { width: cut.width, height: cut.height, channels: 4 } })
    .extract({ left: b.minX, top: b.minY, width: b.width, height: b.height })
    .resize(width, height, { kernel: sharp.kernel.lanczos3 })
    .png({ compressionLevel: 9 }).toBuffer();
  return { png, width, height, scale };
}

const feedingCut = await removeBlack(feedingRaw);
const jumpingCut = await removeBlack(jumpingRaw);

// Widths are locked to stable master landmarks: the feeding bowl/body envelope
// and the jumping animal envelope.  The complete pose is scaled uniformly.
const feeding = await cropAndScale(feedingCut, 680);
const jumping = await cropAndScale(jumpingCut, 690);

// Place by master landmarks: feeding bowl baseline and jumping lowest hind paw.
const feedLeft = 96;
const feedBottom = 3912;
const jumpLeft = 884;
const jumpBottom = 3820;

const clear = Buffer.from(`<svg width="4096" height="4096"><rect x="0" y="2920" width="819" height="1176" fill="black"/><rect x="819" y="2920" width="880" height="1176" fill="black"/></svg>`);
const composites = [];
if (row3Atlas) {
  const clearRow3 = Buffer.from(`<svg width="4096" height="4096"><rect x="0" y="2048" width="4096" height="1024" fill="black"/></svg>`);
  const row3 = await sharp(row3Atlas).ensureAlpha().extract({ left: 0, top: 2048, width: 4096, height: 920 }).png().toBuffer();
  composites.push({ input: clearRow3, blend: 'dest-out' }, { input: row3, left: 0, top: 2048 });
}
if (row3Raw) {
  // The rear row is supplied as one newly generated complete-redraw strip.
  // Keep every cat+helmet pose intact: only remove the border-connected black
  // canvas, then apply one uniform scale and one rigid translation to the strip.
  const rearCut = await removeBlack(row3Raw);
  const rear = await cropAndScale(rearCut, 3970);
  const rearLeft = Math.round((4096 - rear.width) / 2);
  const rearBottom = 2988;
  // Begin below the side-view feet, but slightly above the nominal row boundary
  // so no antialiased tips from the rejected rear row can survive.
  const clearRear = Buffer.from(`<svg width="4096" height="4096"><rect x="0" y="1984" width="4096" height="1088" fill="black"/></svg>`);
  composites.push(
    { input: clearRear, blend: 'dest-out' },
    { input: rear.png, left: rearLeft, top: rearBottom - rear.height },
  );
}
composites.push(
  { input: clear, blend: 'dest-out' },
  { input: feeding.png, left: feedLeft, top: feedBottom - feeding.height },
  { input: jumping.png, left: jumpLeft, top: jumpBottom - jumping.height },
);
await fs.mkdir(path.dirname(path.resolve(outputAtlas)), { recursive: true });
await sharp(baseAtlas).ensureAlpha()
  .composite(composites)
  .png({ compressionLevel: 9 }).toFile(outputAtlas);

console.log(JSON.stringify({ outputAtlas: path.resolve(outputAtlas), feeding: { source: feedingCut.bbox, ...feeding, png: undefined, left: feedLeft, top: feedBottom - feeding.height }, jumping: { source: jumpingCut.bbox, ...jumping, png: undefined, left: jumpLeft, top: jumpBottom - jumping.height }, rearRow: row3Raw ? 'complete-redraw strip normalized as one rigid unit' : null }, null, 2));
