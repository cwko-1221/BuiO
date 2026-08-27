/**
 * Audit whether an accessory-only, same-coordinate extraction can reproduce a
 * full-redraw atlas when composited over the original pet.
 *
 * Red pixels in the heatmap are target/base differences outside the mask.
 * Cyan pixels are target/composite differences inside the mask.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, basePath, maskPath, outputDirectory] = process.argv.slice(2);
if (!targetPath || !basePath || !maskPath || !outputDirectory) {
  console.error('usage: node scripts/audit-redrawn-accessory-mask.mjs <target> <base> <mask> <output-directory>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  }
  return image.data;
};

const [target, base, mask] = await Promise.all([read(targetPath), read(basePath), read(maskPath)]);
const extracted = Buffer.alloc(WIDTH * HEIGHT * 4);
const composite = Buffer.alloc(WIDTH * HEIGHT * 4);
const heatmap = Buffer.alloc(WIDTH * HEIGHT * 4);
const threshold = 8;

const over = (foreground, background, at, output) => {
  const foregroundAlpha = foreground[at + 3] / 255;
  const backgroundAlpha = background[at + 3] / 255;
  const outputAlpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
  if (outputAlpha <= 0) return;
  for (let channel = 0; channel < 3; channel += 1) {
    output[at + channel] = Math.round((
      foreground[at + channel] * foregroundAlpha
      + background[at + channel] * backgroundAlpha * (1 - foregroundAlpha)
    ) / outputAlpha);
  }
  output[at + 3] = Math.round(outputAlpha * 255);
};

for (let at = 0; at < target.length; at += 4) {
  const maskAlpha = mask[at + 3] / 255;
  extracted[at] = target[at];
  extracted[at + 1] = target[at + 1];
  extracted[at + 2] = target[at + 2];
  extracted[at + 3] = Math.round(target[at + 3] * maskAlpha);
  over(extracted, base, at, composite);
}

const metrics = [];
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const metric = {
      row,
      column,
      maskPixels: 0,
      visibleUnionPixels: 0,
      targetBaseOutsideMaskMismatchPixels: 0,
      targetCompositeMismatchPixels: 0,
      targetCompositeOutsideMaskMismatchPixels: 0,
      targetCompositeInsideMaskMismatchPixels: 0,
      targetCompositeAbsoluteError: 0,
      maskComponents: [],
    };
    const localMask = new Uint8Array(CELL * CELL);
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const globalX = column * CELL + x;
        const globalY = row * CELL + y;
        const at = (globalY * WIDTH + globalX) * 4;
        const local = y * CELL + x;
        const isMasked = mask[at + 3] > 8;
        if (isMasked) {
          localMask[local] = 1;
          metric.maskPixels += 1;
        }
        if (target[at + 3] > 8 || base[at + 3] > 8) metric.visibleUnionPixels += 1;
        let targetBaseDelta = 0;
        let targetCompositeDelta = 0;
        for (let channel = 0; channel < 4; channel += 1) {
          targetBaseDelta = Math.max(targetBaseDelta, Math.abs(target[at + channel] - base[at + channel]));
          const delta = Math.abs(target[at + channel] - composite[at + channel]);
          targetCompositeDelta = Math.max(targetCompositeDelta, delta);
          metric.targetCompositeAbsoluteError += delta;
        }
        if (!isMasked && targetBaseDelta > threshold) metric.targetBaseOutsideMaskMismatchPixels += 1;
        if (targetCompositeDelta > threshold) {
          metric.targetCompositeMismatchPixels += 1;
          if (isMasked) metric.targetCompositeInsideMaskMismatchPixels += 1;
          else metric.targetCompositeOutsideMaskMismatchPixels += 1;
          heatmap[at] = isMasked ? 0 : 255;
          heatmap[at + 1] = isMasked ? 220 : 30;
          heatmap[at + 2] = isMasked ? 255 : 30;
          heatmap[at + 3] = 235;
        }
      }
    }

    const seen = new Uint8Array(CELL * CELL);
    for (let seed = 0; seed < localMask.length; seed += 1) {
      if (!localMask[seed] || seen[seed]) continue;
      const queue = [seed];
      let head = 0;
      let minX = seed % CELL;
      let maxX = minX;
      let minY = Math.floor(seed / CELL);
      let maxY = minY;
      seen[seed] = 1;
      while (head < queue.length) {
        const local = queue[head++];
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (const [offsetX, offsetY] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
          const nextX = x + offsetX;
          const nextY = y + offsetY;
          if (nextX < 0 || nextX >= CELL || nextY < 0 || nextY >= CELL) continue;
          const next = nextY * CELL + nextX;
          if (!localMask[next] || seen[next]) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      metric.maskComponents.push({ pixels: queue.length, minX, minY, maxX, maxY });
    }
    metric.maskComponents.sort((left, right) => right.pixels - left.pixels);
    metric.targetCompositeMismatchPercent = Number((
      metric.targetCompositeMismatchPixels / Math.max(1, metric.visibleUnionPixels) * 100
    ).toFixed(2));
    metric.targetBaseOutsideMaskMismatchPercent = Number((
      metric.targetBaseOutsideMaskMismatchPixels / Math.max(1, metric.visibleUnionPixels) * 100
    ).toFixed(2));
    metric.targetCompositeMeanAbsoluteError = Number((
      metric.targetCompositeAbsoluteError / (CELL * CELL * 4)
    ).toFixed(2));
    metrics.push(metric);
  }
}

await fs.mkdir(outputDirectory, { recursive: true });
const save = (name, data) => sharp(data, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(path.join(outputDirectory, name));
await Promise.all([
  save('accessory-extracted-exact.png', extracted),
  save('mask-plus-original-no-transform.png', composite),
  save('target-composite-difference-heatmap.png', heatmap),
  fs.writeFile(path.join(outputDirectory, 'audit.json'), `${JSON.stringify({
    targetPath,
    basePath,
    maskPath,
    transformed: false,
    threshold,
    verdict: metrics.every((metric) => metric.targetCompositeMismatchPixels === 0) ? 'PASS' : 'REJECT',
    metrics,
  }, null, 2)}\n`),
]);
console.log(JSON.stringify({ outputDirectory, transformed: false, verdict: 'REJECT', metrics }, null, 2));
