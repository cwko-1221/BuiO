// Removes enclosed white background pockets (e.g. between Meowth's arm and tail)
// that the original border flood-fill could not reach. Seeds are reviewed by hand
// in 512x512 portrait coordinates; directional 128px sprites reuse scaled seeds.
import fs from 'node:fs/promises';
import sharp from 'sharp';

const SEEDS = {
  meowth: [[337, 282], [306, 330]],
  charizard: [[377, 341], [371, 306]],
  lucario: [[302, 266]],
  sylveon: [[280, 250], [276, 287], [146, 349]],
};
const PORTRAIT_DIR = 'pokemon-rpg-app/public/assets/pokemon';
const SPRITE_DIR = 'pokemon-rpg-app/public/assets/sprites/pokemon';

const isWhite = (d, i, minLum = 220, maxDiff = 28) => {
  const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
  return d[i * 4 + 3] >= 32 && Math.min(r, g, b) >= minLum && Math.max(r, g, b) - Math.min(r, g, b) <= maxDiff;
};

function clearPockets(data, w, h, seeds, radius) {
  const removed = new Uint8Array(w * h), queue = [];
  for (const [sx, sy] of seeds) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    const x = sx + dx, y = sy + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (!removed[i] && isWhite(data, i)) { removed[i] = 1; queue.push(i); }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % w, y = (i - x) / w;
    for (const n of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
      if (n >= 0 && !removed[n] && isWhite(data, n)) { removed[n] = 1; queue.push(n); }
    }
  }
  // Two passes of anti-aliased white fringe bordering the cleared pocket.
  for (let pass = 0; pass < 2; pass++) {
    const fringe = [];
    for (let i = 0; i < w * h; i++) {
      if (removed[i] || !data[i * 4 + 3]) continue;
      const x = i % w, y = (i - x) / w;
      const touches = (x > 0 && removed[i - 1]) || (x < w - 1 && removed[i + 1]) || (y > 0 && removed[i - w]) || (y < h - 1 && removed[i + w]);
      if (touches && isWhite(data, i, 195, 35)) fringe.push(i);
    }
    for (const i of fringe) removed[i] = 1;
  }
  let count = 0;
  for (let i = 0; i < w * h; i++) if (removed[i]) { data[i * 4 + 3] = 0; count++; }
  return { removed, count };
}

async function load(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}
sharp.cache(false);
const save = async (file, { data, w, h }) => {
  const buf = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 95, alphaQuality: 100 }).toBuffer();
  await fs.writeFile(file, buf);
};

for (const [id, seeds] of Object.entries(SEEDS)) {
  const portraitFile = `${PORTRAIT_DIR}/${id}.webp`;
  const portrait = await load(portraitFile);
  const p = clearPockets(portrait.data, portrait.w, portrait.h, seeds, 4);
  await save(portraitFile, portrait);

  // 128px directional sprites use a different crop/scale, so map each sprite pixel
  // into the cleaned portrait through their alpha bounding boxes and clear pixels
  // that fall inside the removed pocket (dilated by 1 portrait-scale sprite pixel).
  const bbox = ({ data, w, h }) => {
    let l = w, t = h, r = -1, b = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 24) {
      l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
    }
    return { l, t, r, b };
  };
  const pb = bbox(portrait);
  const pocketAt = (px, py) => {
    const x = Math.round(px), y = Math.round(py);
    if (x < 0 || y < 0 || x >= portrait.w || y >= portrait.h) return false;
    return p.removed[y * portrait.w + x] === 1;
  };
  let spriteCount = 0;
  for (const [dir, mirror] of [['down', false], ['left', false], ['right', true], ['up', false]]) {
    const file = `${SPRITE_DIR}/${id}_${dir}.webp`;
    const img = await load(file);
    const sb = bbox(img), cleared = new Uint8Array(img.w * img.h);
    const sx = (pb.r - pb.l) / Math.max(1, sb.r - sb.l), sy = (pb.b - pb.t) / Math.max(1, sb.b - sb.t);
    for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
      const i = y * img.w + x;
      if (!img.data[i * 4 + 3]) continue;
      const mx = mirror ? sb.r - (x - sb.l) : x;
      const px = pb.l + (mx - sb.l) * sx, py = pb.t + (y - sb.t) * sy;
      // Require the pocket to cover the whole sprite pixel footprint so outlines survive.
      const hx = sx * 0.5, hy = sy * 0.5;
      if (!(pocketAt(px, py) && pocketAt(px - hx, py) && pocketAt(px + hx, py) && pocketAt(px, py - hy) && pocketAt(px, py + hy))) {
        // Partially covered edge pixel: only drop it if it is pale background fringe.
        if (dir === 'up' || !pocketAt(px, py) || !isWhite(img.data, i, 175, 45)) continue;
      }
      img.data[i * 4 + 3] = 0; cleared[i] = 1; spriteCount++;
    }
    // Downsampled sprites keep a speckled pale rim along the pocket; peel it.
    if (dir !== 'up') for (let pass = 0; pass < 2; pass++) {
      const rim = [];
      for (let i = 0; i < img.w * img.h; i++) {
        if (cleared[i] || !img.data[i * 4 + 3]) continue;
        const x = i % img.w, y = (i - x) / img.w;
        const touches = (x > 0 && cleared[i - 1]) || (x < img.w - 1 && cleared[i + 1]) || (y > 0 && cleared[i - img.w]) || (y < img.h - 1 && cleared[i + img.w]);
        if (touches && isWhite(img.data, i, 165, 55)) rim.push(i);
      }
      for (const i of rim) { img.data[i * 4 + 3] = 0; cleared[i] = 1; spriteCount++; }
    }
    await save(file, img);
  }
  console.log(`${id}: portrait ${p.count}px, sprites ${spriteCount}px cleared`);
}
