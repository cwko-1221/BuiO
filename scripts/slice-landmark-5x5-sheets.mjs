import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ZONES = ['dawnleaf', 'meadow', 'mosswood', 'coast', 'canyon', 'twilight'];
const SOURCE_DIR = path.resolve('pokemon-rpg-app/art-sources/overhaul/world-adventure-v1');
const OUT_DIR = path.resolve('pokemon-rpg-app/public/assets/overhaul/world/landmarks');
const ATLAS_OUT = path.resolve('pokemon-rpg-app/src/data/landmarkAtlas.mjs');

fs.mkdirSync(OUT_DIR, { recursive: true });

function isBgCandidate(r, g, b, a, bgR, bgG, bgB, tol = 44) {
  if (a < 16) return true;
  const dr = r - bgR;
  const dg = g - bgG;
  const db = b - bgB;
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  if (dist <= tol) return true;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  const lum = (r + g + b) / 3;
  // Catch neutral/warm studio white, soft studio floor cast shadows, & light sticker rims outside the dark ink outline
  if (lum >= 148 && maxC - minC <= 28 && b <= r + 10) return true;
  return false;
}

function isInteriorWhiteCandidate(r, g, b, a) {
  if (a < 16) return true;
  // Never eat cool-blue highlights (e.g. blue beach umbrella canopy where b > r + 4)
  if (b > r + 4) return false;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  return minC >= 214 && maxC - minC <= 26;
}

function isPureWhiteSeed(r, g, b, a) {
  if (a < 16) return true;
  if (b > r + 3) return false;
  const maxC = Math.max(r, g, b);
  const minC = Math.min(r, g, b);
  return minC >= 232 && maxC >= 244 && maxC - minC <= 18;
}

export async function processCell(rawBuf, cellW, cellH, outPath) {
  const data = new Uint8Array(rawBuf);
  const visited = new Uint8Array(cellW * cellH);
  const isBg = new Uint8Array(cellW * cellH);

  const cornerCoords = [
    [1, 1], [cellW - 2, 1], [1, cellH - 2], [cellW - 2, cellH - 2],
    [Math.floor(cellW / 2), 1], [Math.floor(cellW / 2), cellH - 2],
  ];
  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (const [cx, cy] of cornerCoords) {
    const idx = (cy * cellW + cx) * 4;
    sumR += data[idx];
    sumG += data[idx + 1];
    sumB += data[idx + 2];
    count++;
  }
  const bgR = Math.round(sumR / count);
  const bgG = Math.round(sumG / count);
  const bgB = Math.round(sumB / count);

  // 1. Flood fill from all 4 border edges
  const queue = new Int32Array(cellW * cellH);
  let head = 0, tail = 0;
  const push = (x, y) => {
    if (x < 0 || x >= cellW || y < 0 || y >= cellH) return;
    const p = y * cellW + x;
    if (visited[p]) return;
    visited[p] = 1;
    const idx = p * 4;
    if (isBgCandidate(data[idx], data[idx + 1], data[idx + 2], data[idx + 3], bgR, bgG, bgB, 42)) {
      isBg[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < cellW; x++) {
    push(x, 0);
    push(x, cellH - 1);
  }
  for (let y = 0; y < cellH; y++) {
    push(0, y);
    push(cellW - 1, y);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % cellW;
    const y = (p - x) / cellW;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }

  // 2. Detect enclosed studio-white holes inside open frames (gazebos, fences, canopies, pergolas, wagons)
  const holeVisited = new Uint8Array(cellW * cellH);
  const comp = [];
  for (let y = 1; y < cellH - 1; y++) {
    for (let x = 1; x < cellW - 1; x++) {
      const startP = y * cellW + x;
      if (isBg[startP] || holeVisited[startP]) continue;
      const sIdx = startP * 4;
      if (!isPureWhiteSeed(data[sIdx], data[sIdx + 1], data[sIdx + 2], data[sIdx + 3])) continue;

      comp.length = 0;
      let qHead = 0;
      holeVisited[startP] = 1;
      comp.push(startP);

      while (qHead < comp.length) {
        const curr = comp[qHead++];
        const cx = curr % cellW;
        const cy = (curr - cx) / cellW;
        const neighbors = [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ];
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= cellW || ny < 0 || ny >= cellH) continue;
          const np = ny * cellW + nx;
          if (isBg[np] || holeVisited[np]) continue;
          const nIdx = np * 4;
          if (isInteriorWhiteCandidate(data[nIdx], data[nIdx + 1], data[nIdx + 2], data[nIdx + 3])) {
            holeVisited[np] = 1;
            comp.push(np);
          }
        }
      }

      if (comp.length >= 16) {
        for (const p of comp) {
          isBg[p] = 1;
        }
      }
    }
  }

  // 3. Multi-pass edge de-haloing & color decontamination
  for (let pass = 0; pass < 4; pass++) {
    const newlyTransparent = [];
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const p = y * cellW + x;
        if (isBg[p]) continue;
        let adjBg = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= cellW || ny < 0 || ny >= cellH || isBg[ny * cellW + nx]) {
              adjBg++;
            }
          }
        }
        if (adjBg === 0) continue;
        const idx = p * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const lum = (r + g + b) / 3;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        if (lum >= 198 && sat <= 30 && b <= r + 8) {
          data[idx + 3] = 0;
          newlyTransparent.push(p);
        } else if (lum >= 155 && sat <= 42 && b <= r + 10) {
          const factor = Math.max(0.1, Math.min(0.78, (205 - lum) / 60));
          data[idx] = Math.round(r * 0.45);
          data[idx + 1] = Math.round(g * 0.45);
          data[idx + 2] = Math.round(b * 0.45);
          data[idx + 3] = Math.round(data[idx + 3] * factor);
        }
      }
    }
    for (const p of newlyTransparent) isBg[p] = 1;
  }

  let minX = cellW, minY = cellH, maxX = -1, maxY = -1;
  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < cellW; x++) {
      const p = y * cellW + x;
      const idx = p * 4;
      if (isBg[p]) {
        data[idx + 3] = 0;
        continue;
      }
      if (data[idx + 3] > 20) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    minX = 0; minY = 0; maxX = cellW - 1; maxY = cellH - 1;
  } else {
    minX = Math.max(0, minX - 2);
    minY = Math.max(0, minY - 2);
    maxX = Math.min(cellW - 1, maxX + 2);
    maxY = Math.min(cellH - 1, maxY + 2);
  }

  const trimW = maxX - minX + 1;
  const trimH = maxY - minY + 1;
  const outBuf = await sharp(Buffer.from(data.buffer), {
    raw: { width: cellW, height: cellH, channels: 4 },
  })
    .extract({ left: minX, top: minY, width: trimW, height: trimH })
    .webp({ quality: 92, alphaQuality: 96 })
    .toBuffer();
  fs.writeFileSync(outPath, outBuf);

  return { width: trimW, height: trimH };
}

async function main() {
  const atlas = {};
  for (const zone of ZONES) {
    const srcPath = path.join(SOURCE_DIR, `${zone}-landmarks-5x5-v1.png`);
    if (!fs.existsSync(srcPath)) {
      console.warn(`Missing ${srcPath}, skipping...`);
      continue;
    }
    const meta = await sharp(srcPath).metadata();
    const W = meta.width;
    const H = meta.height;
    const colW = Math.floor(W / 5);
    const rowH = Math.floor(H / 5);
    atlas[zone] = [];
    for (let idx = 0; idx < 25; idx++) {
      const r = Math.floor(idx / 5);
      const c = idx % 5;
      const padX = Math.max(2, Math.round(colW * 0.015));
      const padY = Math.max(2, Math.round(rowH * 0.015));
      const left = c * colW + padX;
      const top = r * rowH + padY;
      const width = colW - padX * 2;
      const height = rowH - padY * 2;
      const rawBuf = await sharp(srcPath)
        .extract({ left, top, width, height })
        .ensureAlpha()
        .raw()
        .toBuffer();

      const fileName = `${zone}-landmark-${String(idx + 1).padStart(2, '0')}-v1.webp`;
      const outPath = path.join(OUT_DIR, fileName);
      const dims = await processCell(rawBuf, width, height, outPath);
      atlas[zone].push({
        src: `/pokemon-rpg/assets/overhaul/world/landmarks/${fileName}`,
        width: dims.width,
        height: dims.height,
      });
    }
    console.log(`Sliced 25 landmark assets for ${zone} (${W}x${H})`);
  }

  const code = `// 150 built-in ImageGen regional architectural & landmark setpieces (6 x 5x5 sheets).\nexport const LANDMARK_ATLAS = ${JSON.stringify(atlas, null, 2)};\n`;
  fs.writeFileSync(ATLAS_OUT, code, 'utf8');
  console.log(`Wrote ${ATLAS_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
