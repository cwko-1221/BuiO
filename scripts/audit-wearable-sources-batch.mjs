import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [,, basePath, ...imagePaths] = process.argv;
if (!basePath || imagePaths.length === 0) {
  throw new Error('usage: node audit-wearable-sources-batch.mjs <base> <images...>');
}

const CELL_W = 160;
const CELL_H = 160;
const COLS = 5;
const ROWS = 4;

async function load(path) {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { path, data, width: info.width, height: info.height, channels: info.channels };
}

async function sha(path) {
  return crypto.createHash('sha256').update(await fs.readFile(path)).digest('hex');
}

function cellStats(img) {
  if (img.width !== 800 || img.height !== 640) return null;
  const out = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLS; column += 1) {
      let alphaPixels = 0;
      let partialAlpha = 0;
      let opaqueAlpha = 0;
      let hiddenRgbNonZero = 0;
      let minX = CELL_W;
      let minY = CELL_H;
      let maxX = -1;
      let maxY = -1;
      for (let y = 0; y < CELL_H; y += 1) {
        for (let x = 0; x < CELL_W; x += 1) {
          const gx = column * CELL_W + x;
          const gy = row * CELL_H + y;
          const at = (gy * img.width + gx) * 4;
          const a = img.data[at + 3];
          if (a > 0) {
            alphaPixels += 1;
            if (a < 255) partialAlpha += 1;
            else opaqueAlpha += 1;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          } else if (img.data[at] || img.data[at + 1] || img.data[at + 2]) {
            hiddenRgbNonZero += 1;
          }
        }
      }
      out.push({ row, column, alphaPixels, partialAlpha, opaqueAlpha, hiddenRgbNonZero,
        bounds: alphaPixels ? [minX, minY, maxX, maxY] : null });
    }
  }
  return out;
}

function compareMasked(source, reference) {
  if (source.width !== reference.width || source.height !== reference.height) return { sameCanvas: false };
  const comparisonCellWidth = source.width / COLS;
  const comparisonCellHeight = source.height / ROWS;
  let sourceVisible = 0;
  let exactRgb = 0;
  let exactRgba = 0;
  let rgbAbsoluteError = 0;
  let alphaAbsoluteError = 0;
  const perCell = Array.from({ length: 20 }, (_, index) => ({
    row: Math.floor(index / 5), column: index % 5, sourceVisible: 0, exactRgb: 0, exactRgba: 0,
    rgbAbsoluteError: 0, alphaAbsoluteError: 0,
  }));
  for (let pixel = 0; pixel < source.width * source.height; pixel += 1) {
    const at = pixel * 4;
    if (!source.data[at + 3]) continue;
    sourceVisible += 1;
    const x = pixel % source.width;
    const y = Math.floor(pixel / source.width);
    const cellRow = Math.min(ROWS - 1, Math.floor(y / comparisonCellHeight));
    const cellColumn = Math.min(COLS - 1, Math.floor(x / comparisonCellWidth));
    const cell = perCell[cellRow * COLS + cellColumn];
    cell.sourceVisible += 1;
    let rgbSame = true;
    let rgbaSame = true;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(source.data[at + channel] - reference.data[at + channel]);
      rgbAbsoluteError += delta;
      cell.rgbAbsoluteError += delta;
      if (delta !== 0) rgbSame = false;
      if (delta !== 0) rgbaSame = false;
    }
    const alphaDelta = Math.abs(source.data[at + 3] - reference.data[at + 3]);
    alphaAbsoluteError += alphaDelta;
    cell.alphaAbsoluteError += alphaDelta;
    if (alphaDelta !== 0) rgbaSame = false;
    if (rgbSame) { exactRgb += 1; cell.exactRgb += 1; }
    if (rgbaSame) { exactRgba += 1; cell.exactRgba += 1; }
  }
  const summarizedCells = perCell.map((cell) => ({ ...cell,
    exactRgbRatio: cell.sourceVisible ? cell.exactRgb / cell.sourceVisible : 1,
    exactRgbaRatio: cell.sourceVisible ? cell.exactRgba / cell.sourceVisible : 1,
    meanAbsRgb: cell.sourceVisible ? cell.rgbAbsoluteError / (cell.sourceVisible * 3) : 0,
    meanAbsAlpha: cell.sourceVisible ? cell.alphaAbsoluteError / cell.sourceVisible : 0,
  }));
  if (source.width === 800 && source.height === 640) {
    for (const cell of summarizedCells) {
      let best = { dx: 0, dy: 0, meanAbsRgb: Number.POSITIVE_INFINITY, comparedPixels: 0 };
      for (let dy = -16; dy <= 16; dy += 1) {
        for (let dx = -16; dx <= 16; dx += 1) {
          let error = 0;
          let compared = 0;
          for (let localY = 0; localY < CELL_H; localY += 1) {
            const targetY = localY + dy;
            if (targetY < 0 || targetY >= CELL_H) continue;
            for (let localX = 0; localX < CELL_W; localX += 1) {
              const targetX = localX + dx;
              if (targetX < 0 || targetX >= CELL_W) continue;
              const sx = cell.column * CELL_W + localX;
              const sy = cell.row * CELL_H + localY;
              const sourceAt = (sy * source.width + sx) * 4;
              if (source.data[sourceAt + 3] < 96) continue;
              const rx = cell.column * CELL_W + targetX;
              const ry = cell.row * CELL_H + targetY;
              const referenceAt = (ry * reference.width + rx) * 4;
              if (reference.data[referenceAt + 3] < 96) continue;
              error += Math.abs(source.data[sourceAt] - reference.data[referenceAt]);
              error += Math.abs(source.data[sourceAt + 1] - reference.data[referenceAt + 1]);
              error += Math.abs(source.data[sourceAt + 2] - reference.data[referenceAt + 2]);
              compared += 1;
            }
          }
          const meanAbsRgb = compared ? error / (compared * 3) : Number.POSITIVE_INFINITY;
          if (meanAbsRgb < best.meanAbsRgb) best = { dx, dy, meanAbsRgb, comparedPixels: compared };
        }
      }
      cell.bestShiftRgb = { ...best, meanAbsRgb: Number(best.meanAbsRgb.toFixed(3)) };
    }
  }
  return {
    sameCanvas: true,
    sourceVisible,
    exactRgb,
    exactRgba,
    exactRgbRatio: sourceVisible ? exactRgb / sourceVisible : 1,
    exactRgbaRatio: sourceVisible ? exactRgba / sourceVisible : 1,
    meanAbsRgb: sourceVisible ? rgbAbsoluteError / (sourceVisible * 3) : 0,
    meanAbsAlpha: sourceVisible ? alphaAbsoluteError / sourceVisible : 0,
    perCell: summarizedCells,
  };
}

function compositeOver(layer, base) {
  if (layer.width !== base.width || layer.height !== base.height) return null;
  const data = Buffer.alloc(base.data.length);
  for (let pixel = 0; pixel < layer.width * layer.height; pixel += 1) {
    const at = pixel * 4;
    const a = layer.data[at + 3] / 255;
    for (let channel = 0; channel < 3; channel += 1) {
      data[at + channel] = Math.round(layer.data[at + channel] * a + base.data[at + channel] * (1 - a));
    }
    data[at + 3] = Math.round(layer.data[at + 3] + base.data[at + 3] * (1 - a));
  }
  return { path: 'composite', data, width: base.width, height: base.height, channels: 4 };
}

function compareAll(a, b) {
  if (!a || a.width !== b.width || a.height !== b.height) return { sameCanvas: false };
  let exactRgba = 0;
  let absoluteError = 0;
  for (let at = 0; at < a.data.length; at += 4) {
    let same = true;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(a.data[at + channel] - b.data[at + channel]);
      absoluteError += delta;
      if (delta !== 0) same = false;
    }
    if (same) exactRgba += 1;
  }
  const pixels = a.width * a.height;
  return { sameCanvas: true, pixels, exactRgba, exactRgbaRatio: exactRgba / pixels,
    meanAbsRgba: absoluteError / (pixels * 4) };
}

const base = await load(basePath);
const images = [];
for (const path of imagePaths) {
  const image = await load(path);
  const stat = await fs.stat(path);
  images.push({ image, stat, hash: await sha(path) });
}

const report = {
  base: { path: basePath, width: base.width, height: base.height, sha256: await sha(basePath) },
  images: images.map(({ image, stat, hash }) => ({
    path: image.path,
    width: image.width,
    height: image.height,
    sha256: hash,
    mtime: stat.mtime.toISOString(),
    cells: cellStats(image),
  })),
  pairwiseVisiblePixelComparisons: [],
  baseCompositeComparisons: [],
};

for (let i = 0; i < images.length; i += 1) {
  for (let j = 0; j < images.length; j += 1) {
    if (i === j) continue;
    report.pairwiseVisiblePixelComparisons.push({
      source: images[i].image.path,
      reference: images[j].image.path,
      metrics: compareMasked(images[i].image, images[j].image),
    });
    if (images[i].image.width === base.width && images[i].image.height === base.height) {
      report.baseCompositeComparisons.push({
        layer: images[i].image.path,
        reference: images[j].image.path,
        metrics: compareAll(compositeOver(images[i].image, base), images[j].image),
      });
    }
  }
}

console.log(JSON.stringify(report, null, 2));
