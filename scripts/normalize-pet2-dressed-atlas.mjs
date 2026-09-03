import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [sourceArg, id] = process.argv.slice(2);
if (!sourceArg || !id) throw new Error('usage: node scripts/normalize-pet2-dressed-atlas.mjs <generated-source> <wearable-id>');
const sourcePath = path.resolve(sourceArg);
const root = process.cwd();
const outputDir = path.join(root, 'pet-app', 'art-source', 'imagegen', 'baked-wearables', 'cat', id);
const rawCopyPath = path.join(outputDir, `${id}-pet2-dressed-atlas-v1-raw.png`);
const finalPath = path.join(outputDir, `${id}-pet2-dressed-atlas-v1-4096.png`);
const meta = await sharp(sourcePath).metadata();
const src = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = src.info.width, H = src.info.height, C = 4;
const rgba = Buffer.from(src.data);
let backgroundMode = meta.hasAlpha ? 'alpha' : 'unknown';

if (!meta.hasAlpha) {
  const background = new Uint8Array(W * H), queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  const corners = [0, W - 1, (H - 1) * W, H * W - 1];
  const cornerRgb = corners.reduce((sum, p) => {
    const i = p * C; return [sum[0] + rgba[i], sum[1] + rgba[i + 1], sum[2] + rgba[i + 2]];
  }, [0, 0, 0]).map((v) => v / corners.length);
  const cornerMean = (cornerRgb[0] + cornerRgb[1] + cornerRgb[2]) / 3;
  backgroundMode = cornerRgb[1] > 150 && cornerRgb[1] > cornerRgb[0] * 1.7 && cornerRgb[1] > cornerRgb[2] * 1.7
    ? 'green'
    : cornerMean < 64 ? 'dark' : 'light';
  const backgroundPixel = (p) => {
    const i = p * C, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    if (backgroundMode === 'green') return g > 120 && g > r * 1.45 && g > b * 1.45;
    if (backgroundMode === 'dark') return Math.max(r, g, b) < 42 && Math.max(r, g, b) - Math.min(r, g, b) < 24;
    return Math.min(r, g, b) > 216 && Math.max(r, g, b) - Math.min(r, g, b) < 15;
  };
  const add = (p) => { if (!background[p] && backgroundPixel(p)) { background[p] = 1; queue[tail++] = p; } };
  for (let x = 0; x < W; x += 1) { add(x); add((H - 1) * W + x); }
  for (let y = 0; y < H; y += 1) { add(y * W); add(y * W + W - 1); }
  while (head < tail) {
    const p = queue[head++], x = p % W, y = Math.floor(p / W);
    if (x > 0) add(p - 1); if (x + 1 < W) add(p + 1); if (y > 0) add(p - W); if (y + 1 < H) add(p + W);
  }
  for (let p = 0; p < W * H; p += 1) rgba[p * C + 3] = background[p] ? 0 : 255;
  if (backgroundMode === 'green') {
    const keyed = Buffer.from(rgba);
    for (let p = 0; p < W * H; p += 1) {
      const i = p * C;
      if (keyed[i + 3] === 0) continue;
      const excess = keyed[i + 1] - Math.max(keyed[i], keyed[i + 2]);
      if (excess <= 8) continue;
      const x = p % W, y = Math.floor(p / W);
      let donor = -1;
      for (let radius = 1; radius <= 4 && donor < 0; radius += 1) {
        for (let dy = -radius; dy <= radius && donor < 0; dy += 1) {
          for (const dx of [-radius, radius]) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = (yy * W + xx) * C;
            if (keyed[j + 3] > 0 && keyed[j + 1] <= Math.max(keyed[j], keyed[j + 2]) + 8) { donor = j; break; }
          }
        }
        for (let dx = -radius + 1; dx < radius && donor < 0; dx += 1) {
          for (const dy of [-radius, radius]) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = (yy * W + xx) * C;
            if (keyed[j + 3] > 0 && keyed[j + 1] <= Math.max(keyed[j], keyed[j + 2]) + 8) { donor = j; break; }
          }
        }
      }
      if (donor >= 0) {
        rgba[i] = keyed[donor]; rgba[i + 1] = keyed[donor + 1]; rgba[i + 2] = keyed[donor + 2];
        rgba[i + 3] = Math.round(255 * Math.max(0.18, 1 - (excess - 8) / 180));
      } else {
        rgba[i + 3] = excess > 48 ? 0 : 160;
      }
    }
  }
}

// The generated checkerboard is almost pure white.  A simple edge flood can
// therefore enter the white interior of the chef toque through sub-pixel gaps
// in its pale outline.  Recover only that enclosed crown, using the red hatband
// in each grid cell as the local anchor and the surviving lavender contour as
// the row boundary.  This does not alter RGB pixels or any part of the pet.
if (id === 'head-05' && backgroundMode === 'light') {
  for (let row = 0; row < 4; row += 1) {
    const y0 = Math.floor(row * H / 4), y1 = Math.floor((row + 1) * H / 4);
    for (let col = 0; col < 5; col += 1) {
      const x0 = Math.floor(col * W / 5), x1 = Math.floor((col + 1) * W / 5);
      const red = [];
      for (let y = y0; y < y0 + Math.floor((y1 - y0) * 0.58); y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const i = (y * W + x) * C, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
          if (r > 130 && r > g * 1.45 && r > b * 1.25) red.push([x, y]);
        }
      }
      if (red.length < 12) continue;
      const bandTop = Math.min(...red.map(([, y]) => y));
      const bandXs = red.map(([x]) => x).sort((a, b) => a - b);
      const center = bandXs[Math.floor(bandXs.length / 2)];
      const searchRadius = Math.floor((x1 - x0) * 0.27);
      const rows = new Map();
      for (let y = y0; y < bandTop; y += 1) {
        const contourXs = [];
        for (let x = Math.max(x0, center - searchRadius); x < Math.min(x1, center + searchRadius); x += 1) {
          const i = (y * W + x) * C, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
          const mean = (r + g + b) / 3, chroma = Math.max(r, g, b) - Math.min(r, g, b);
          if (mean < 247.5 || chroma > 3) contourXs.push(x);
        }
        if (contourXs.length >= 3 && contourXs[contourXs.length - 1] - contourXs[0] >= 7) {
          rows.set(y, [contourXs[0], contourXs[contourXs.length - 1]]);
        }
      }
      const validYs = [...rows.keys()].sort((a, b) => a - b);
      if (!validYs.length) continue;
      // Discard isolated checker/noise rows above the actual crown.  The crown
      // is the lowest run whose gaps never exceed five source pixels.
      let top = validYs[validYs.length - 1], last = top;
      for (let k = validYs.length - 2; k >= 0; k -= 1) {
        if (last - validYs[k] > 5) break;
        top = validYs[k]; last = validYs[k];
      }
      const usable = validYs.filter((y) => y >= top);
      for (let y = top; y < bandTop; y += 1) {
        let bounds = rows.get(y);
        if (!bounds) {
          const below = usable.find((yy) => yy > y);
          const above = [...usable].reverse().find((yy) => yy < y);
          if (above === undefined && below === undefined) continue;
          if (above === undefined) bounds = rows.get(below);
          else if (below === undefined) bounds = rows.get(above);
          else {
            const t = (y - above) / (below - above), a = rows.get(above), b = rows.get(below);
            bounds = [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t)];
          }
        }
        const left = Math.max(x0, bounds[0] - 1), right = Math.min(x1 - 1, bounds[1] + 1);
        for (let x = left; x <= right; x += 1) rgba[(y * W + x) * C + 3] = 255;
      }
    }
  }
}

const foreground = new Uint8Array(W * H);
for (let p = 0; p < foreground.length; p += 1) foreground[p] = rgba[p * C + 3] >= 32 ? 1 : 0;
const seen = new Uint8Array(W * H), components = [];
for (let seed = 0; seed < foreground.length; seed += 1) if (foreground[seed] && !seen[seed]) {
  seen[seed] = 1; const pixels = [seed];
  for (let q = 0; q < pixels.length; q += 1) {
    const p = pixels[q], x = p % W, y = Math.floor(p / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < W && yy < H) { const next = yy * W + xx; if (foreground[next] && !seen[next]) { seen[next] = 1; pixels.push(next); } }
    }
  }
  components.push({ pixels, size: pixels.length });
}
components.sort((a, b) => b.size - a.size);
// A chroma-key source is already background-clean.  Keep small intentionally
// detached accessory parts (for example the wizard hat's hanging crystal)
// instead of assuming exactly one connected component per sprite.
const keep = backgroundMode === 'green' ? components.filter((component) => component.size >= 3) : components.slice(0, 20);
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
console.log(JSON.stringify({ id, sourceDimensions: [W, H], sourceHasAlpha: Boolean(meta.hasAlpha), componentsDetected: components.length, keptComponents: keep.length, rawCopyPath, finalPath }));
