import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const BRAIN_DIR = 'C:/Users/kochu/.gemini/antigravity/brain/b7812789-9c64-4571-b3dc-41ad10b3ae59';
const OUT_DIR = path.join(ROOT, 'pokemon-rpg-app', 'public', 'assets', 'sprites', 'trainers');

const BLAZE_AI_WALK = path.join(BRAIN_DIR, 'blaze_walk_atlas_ai_1793523430347.jpg');
const AZURE_AI_WALK = path.join(BRAIN_DIR, 'azure_walk_atlas_ai_1793523469320.jpg');
const EMERALD_AI_WALK = path.join(BRAIN_DIR, 'emerald_walk_atlas_ai_1793523504618.jpg');

function isBgPixel(r, g, b, minLum = 228, maxDiff = 26) {
  const minC = Math.min(r, g, b);
  const maxC = Math.max(r, g, b);
  return minC >= minLum && (maxC - minC) <= maxDiff;
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

async function extractTightCell(sheetPath, { left, top, width, height, minLum = 228 }) {
  const { data, info } = await sharp(sheetPath)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = info.height;
  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;

  const tryPush = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const idx = y * w + x;
    if (visited[idx]) return;
    const p = idx * 4;
    if (isBgPixel(data[p], data[p + 1], data[p + 2], minLum)) {
      visited[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < w; x++) {
    tryPush(x, 0);
    tryPush(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    tryPush(0, y);
    tryPush(w - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % w;
    const y = (idx / w) | 0;
    tryPush(x - 1, y);
    tryPush(x + 1, y);
    tryPush(x, y - 1);
    tryPush(x, y + 1);
  }

  for (let i = 0; i < w * h; i++) {
    if (visited[i]) {
      data[i * 4 + 3] = 0;
    }
  }

  // Keep largest connected component centered in cell
  const compVisited = new Uint8Array(w * h);
  let bestPixels = null;
  let bestCount = 0;

  for (let i = 0; i < w * h; i++) {
    if (data[i * 4 + 3] > 20 && !compVisited[i]) {
      const comp = [];
      let cHead = 0;
      compVisited[i] = 1;
      comp.push(i);
      while (cHead < comp.length) {
        const cur = comp[cHead++];
        const cx = cur % w;
        const cy = (cur / w) | 0;
        const neighbors = [
          cx > 0 ? cur - 1 : -1,
          cx + 1 < w ? cur + 1 : -1,
          cy > 0 ? cur - w : -1,
          cy + 1 < h ? cur + w : -1,
        ];
        for (const nb of neighbors) {
          if (nb >= 0 && !compVisited[nb] && data[nb * 4 + 3] > 20) {
            compVisited[nb] = 1;
            comp.push(nb);
          }
        }
      }
      if (comp.length > bestCount) {
        bestCount = comp.length;
        bestPixels = comp;
      }
    }
  }

  if (bestPixels && bestCount > 100) {
    const keepMask = new Uint8Array(w * h);
    for (const idx of bestPixels) keepMask[idx] = 1;
    for (let i = 0; i < w * h; i++) {
      if (!keepMask[i]) data[i * 4 + 3] = 0;
    }
  }

  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 24) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  const cw = Math.max(1, maxX - minX + 1);
  const ch = Math.max(1, maxY - minY + 1);
  const cropped = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const s = ((minY + y) * w + (minX + x)) * 4;
      const d = (y * cw + x) * 4;
      cropped[d] = data[s];
      cropped[d + 1] = data[s + 1];
      cropped[d + 2] = data[s + 2];
      cropped[d + 3] = data[s + 3];
    }
  }

  return { data: cropped, width: cw, height: ch };
}

function flipHorizontal(tightObj) {
  const { data: src, width: w, height: h } = tightObj;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = (y * w + (w - 1 - x)) * 4;
      out[d] = src[s];
      out[d + 1] = src[s + 1];
      out[d + 2] = src[s + 2];
      out[d + 3] = src[s + 3];
    }
  }
  return { data: out, width: w, height: h };
}

function recolorAzureToViolet(tightObj) {
  const out = Buffer.from(tightObj.data);
  const n = tightObj.width * tightObj.height;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (out[p + 3] < 16) continue;
    const r = out[p], g = out[p + 1], b = out[p + 2];
    const [h, s, l] = rgbToHsl(r, g, b);

    if (h >= 185 && h <= 255 && s > 0.18) {
      const [nr, ng, nb] = hslToRgb(276, Math.min(1, s * 1.08), l * 0.92);
      out[p] = nr; out[p + 1] = ng; out[p + 2] = nb;
    } else if (h >= 10 && h <= 42 && s > 0.22 && l > 0.12 && l < 0.52) {
      const [nr, ng, nb] = hslToRgb(272, Math.min(0.68, s * 0.95), Math.min(0.65, l * 1.22));
      out[p] = nr; out[p + 1] = ng; out[p + 2] = nb;
    } else if (h >= 38 && h <= 65 && s > 0.35 && l > 0.42) {
      const [nr, ng, nb] = hslToRgb(282, 0.55, l * 0.65);
      out[p] = nr; out[p + 1] = ng; out[p + 2] = nb;
    } else if ((h < 14 || h > 342) && s > 0.40 && l > 0.25 && l < 0.68) {
      const [nr, ng, nb] = hslToRgb(45, 0.88, Math.min(0.65, l * 1.25));
      out[p] = nr; out[p + 1] = ng; out[p + 2] = nb;
    }
  }
  return { data: out, width: tightObj.width, height: tightObj.height };
}

async function placeCell(tightObj, cellW, cellH, padRatio = 0.88, bottomMargin = 8) {
  const maxW = Math.round(cellW * padRatio);
  const maxH = Math.round(cellH * padRatio);
  const resized = await sharp(tightObj.data, {
    raw: { width: tightObj.width, height: tightObj.height, channels: 4 },
  })
    .resize(maxW, maxH, { fit: 'inside' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rw = resized.info.width;
  const rh = resized.info.height;
  const canvas = Buffer.alloc(cellW * cellH * 4, 0);
  const offX = Math.round((cellW - rw) * 0.5);
  const offY = Math.max(0, cellH - rh - bottomMargin);

  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const s = (y * rw + x) * 4;
      const dx = offX + x;
      const dy = offY + y;
      if (dx >= 0 && dx < cellW && dy >= 0 && dy < cellH) {
        const d = (dy * cellW + dx) * 4;
        canvas[d] = resized.data[s];
        canvas[d + 1] = resized.data[s + 1];
        canvas[d + 2] = resized.data[s + 2];
        canvas[d + 3] = resized.data[s + 3];
      }
    }
  }
  return canvas;
}

async function pack4x4Atlas(id, rowsObj, cellW = 160, cellH = 200) {
  const dirs = ['down', 'up', 'left', 'right'];
  const cols = 4;
  const atlasW = cellW * cols;
  const atlasH = cellH * dirs.length;
  const atlasBuf = Buffer.alloc(atlasW * atlasH * 4, 0);

  for (let r = 0; r < dirs.length; r++) {
    const dir = dirs[r];
    const frames = rowsObj[dir]; // array of 4 tightObjs
    for (let c = 0; c < cols; c++) {
      const cellBuf = await placeCell(frames[c], cellW, cellH, 0.88, 8);
      if (c === 1) {
        // Save neutral passing/standing frame as ${id}_${dir}.webp
        await sharp(cellBuf, { raw: { width: cellW, height: cellH, channels: 4 } })
          .webp({ quality: 92, alphaQuality: 96 })
          .toFile(path.join(OUT_DIR, `${id}_${dir}.webp`));
      }
      for (let y = 0; y < cellH; y++) {
        const srcRow = y * cellW * 4;
        const dstRow = ((r * cellH + y) * atlasW + c * cellW) * 4;
        cellBuf.copy(atlasBuf, dstRow, srcRow, srcRow + cellW * 4);
      }
    }
  }

  const outPath = path.join(OUT_DIR, `${id}_walk.webp`);
  await sharp(atlasBuf, { raw: { width: atlasW, height: atlasH, channels: 4 } })
    .webp({ quality: 92, alphaQuality: 96 })
    .toFile(outPath);
  console.log(`✔ Packed genuine AI 4x4 walk atlas: ${outPath}`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // 1. AZURE (4x4 grid on 1024x1024)
  const azCell = (r, c) => extractTightCell(AZURE_AI_WALK, { left: c * 256, top: r * 256, width: 256, height: 256 });
  const azDown = [await azCell(0, 0), await azCell(0, 1), await azCell(0, 2), await azCell(0, 3)];
  const azUp = [await azCell(1, 0), await azCell(1, 1), await azCell(1, 2), await azCell(1, 3)];
  // Row 2/3 left-facing and right-facing frames:
  const azL0 = await azCell(2, 0);
  const azL1 = await azCell(2, 1);
  const azL2 = await azCell(3, 1);
  const azR0 = await azCell(2, 2);
  const azR1 = await azCell(2, 3);
  const azR2 = await azCell(3, 2);
  const azLeft = [azL0, flipHorizontal(azR1), azL2, azL1];
  const azRight = [azR0, azR1, azR2, flipHorizontal(azL1)];

  await pack4x4Atlas('azure', { down: azDown, up: azUp, left: azLeft, right: azRight });

  // 2. VIOLET (from genuine AI 16-frame Azure walk cycle recolored to Violet's purple & gold)
  const viDown = azDown.map(recolorAzureToViolet);
  const viUp = azUp.map(recolorAzureToViolet);
  const viLeft = azLeft.map(recolorAzureToViolet);
  const viRight = azRight.map(recolorAzureToViolet);
  await pack4x4Atlas('violet', { down: viDown, up: viUp, left: viLeft, right: viRight });

  // 3. EMERALD (4x4 grid on 1024x1024)
  const emCell = (r, c) => extractTightCell(EMERALD_AI_WALK, { left: c * 256, top: r * 256, width: 256, height: 256 });
  const emDown = [await emCell(0, 0), await emCell(0, 1), await emCell(0, 2), await emCell(0, 3)];
  const emUp = [await emCell(1, 0), await emCell(1, 1), await emCell(1, 2), await emCell(1, 3)];
  // Row 2 has 3 left-facing frames (c=0 stride1, c=1 passing, c=2 stride2) and 1 right-facing passing (c=3)
  // Row 3 has c=0 left stride, c=1 right passing, c=2 right stride1, c=3 right stride2
  const emL_s1 = await emCell(2, 0);
  const emL_pass = await emCell(2, 1);
  const emL_s2 = await emCell(2, 2);
  const emR_pass1 = await emCell(2, 3);
  const emR_pass2 = await emCell(3, 1);
  const emR_s1 = await emCell(3, 2);
  const emR_s2 = await emCell(3, 3);
  const emLeft = [emL_s1, emL_pass, emL_s2, emL_pass];
  const emRight = [emR_s1, emR_pass1, emR_s2, emR_pass2];

  await pack4x4Atlas('emerald', { down: emDown, up: emUp, left: emLeft, right: emRight });

  // 4. BLAZE (6 columns x 3 rows on 1024x1024)
  const extractBlazeUp = async (left) => {
    const upperH = 224;
    const { data: upData } = await sharp(BLAZE_AI_WALK)
      .extract({ left, top: 294, width: 170, height: upperH })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const lowerH = 62;
    const { data: loData } = await sharp(BLAZE_AI_WALK)
      .extract({ left, top: 224, width: 170, height: lowerH })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const w = 170;
    const h = upperH + lowerH;
    const combined = Buffer.alloc(w * h * 4);
    upData.copy(combined, 0, 0, w * upperH * 4);
    loData.copy(combined, w * upperH * 4, 0, w * lowerH * 4);

    const tmpPath = path.join(OUT_DIR, '_tmp_bl_up.png');
    await sharp(combined, { raw: { width: w, height: h, channels: 4 } }).png().toFile(tmpPath);
    const res = await extractTightCell(tmpPath, { left: 0, top: 0, width: w, height: h });
    await fs.unlink(tmpPath).catch(() => {});
    return res;
  };

  const extractBlazeSide = async (left, top, width, height) => {
    const { data, info } = await sharp(BLAZE_AI_WALK)
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const w = info.width, h = info.height;
    // Clear Row 1's dark shoe tips above the red cap crown in the top 30px
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        const r = data[p], g = data[p + 1], b = data[p + 2];
        // The cap crown is bright red (r > 135, r - g > 45) or its immediate outline near center.
        // Dark shoe soles at top-left/top-right have r < 115 and are in y < 26
        const isRedCap = r > 130 && (r - g) > 40;
        if (!isRedCap && y < 24) {
          data[p] = 255; data[p + 1] = 255; data[p + 2] = 255;
        }
      }
    }
    const tmpPath = path.join(OUT_DIR, '_tmp_bl_side.png');
    await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png().toFile(tmpPath);
    const res = await extractTightCell(tmpPath, { left: 0, top: 0, width: w, height: h });
    await fs.unlink(tmpPath).catch(() => {});
    return res;
  };

  const blDown = [
    await extractTightCell(BLAZE_AI_WALK, { left: 10, top: 8, width: 170, height: 282 }),
    await extractTightCell(BLAZE_AI_WALK, { left: 345, top: 8, width: 170, height: 282 }),
    await extractTightCell(BLAZE_AI_WALK, { left: 515, top: 8, width: 170, height: 282 }),
    await extractTightCell(BLAZE_AI_WALK, { left: 680, top: 8, width: 170, height: 282 }),
  ];
  const blUp = [
    await extractBlazeUp(10),
    await extractBlazeUp(345),
    await extractBlazeUp(515),
    await extractBlazeUp(680),
  ];
  const blL_s1 = await extractBlazeSide(15, 538, 182, 445);
  const blL_pass = await extractBlazeSide(196, 522, 168, 458);
  const blL_s2 = await extractBlazeSide(348, 538, 172, 445);
  const blR_pass = await extractBlazeSide(672, 522, 165, 458);
  const blR_s1 = await extractBlazeSide(822, 538, 185, 445);

  const blLeft = [blL_s1, blL_pass, blL_s2, blL_pass];
  const blRight = [blR_s1, blR_pass, flipHorizontal(blL_s1), blR_pass];

  await pack4x4Atlas('blaze', { down: blDown, up: blUp, left: blLeft, right: blRight });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
