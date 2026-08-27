import fs from 'node:fs/promises';
import sharp from 'sharp';

const [targetPath, basePath, maskPath, layerPath, reportPath] = process.argv.slice(2);
if (!targetPath || !basePath || !maskPath || !layerPath || !reportPath) {
  console.error('usage: node scripts/extract-cloudcap-canonical-diff-final.mjs <target> <base> <mask> <layer> <report>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const CHANNELS = 4;

const read = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  }
  return image.data;
};

const [target, base] = await Promise.all([read(targetPath), read(basePath)]);
const mask = new Uint8Array(WIDTH * HEIGHT);

for (let pixel = 0; pixel < mask.length; pixel += 1) {
  const at = pixel * CHANNELS;
  mask[pixel] = Number(
    target[at] !== base[at]
    || target[at + 1] !== base[at + 1]
    || target[at + 2] !== base[at + 2]
    || target[at + 3] !== base[at + 3],
  );
}

const neighbors8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const neighbors4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];

const components = (row, column) => {
  const seen = new Uint8Array(CELL * CELL);
  const found = [];
  for (let seed = 0; seed < seen.length; seed += 1) {
    const sx = seed % CELL;
    const sy = Math.floor(seed / CELL);
    const global = (row * CELL + sy) * WIDTH + column * CELL + sx;
    if (!mask[global] || seen[seed]) continue;
    const queue = [seed];
    seen[seed] = 1;
    let head = 0;
    const pixels = [];
    while (head < queue.length) {
      const local = queue[head++];
      pixels.push(local);
      const x = local % CELL;
      const y = Math.floor(local / CELL);
      for (const [dx, dy] of neighbors8) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const next = ny * CELL + nx;
        const nextGlobal = (row * CELL + ny) * WIDTH + column * CELL + nx;
        if (seen[next] || !mask[nextGlobal]) continue;
        seen[next] = 1;
        queue.push(next);
      }
    }
    found.push(pixels);
  }
  return found.sort((a, b) => b.length - a.length);
};

const connectComponents = (row, column) => {
  let found = components(row, column);
  let connectors = 0;
  while (found.length > 1) {
    const main = found[0];
    const other = found[1];
    let best = null;
    for (const a of main) {
      const ax = a % CELL;
      const ay = Math.floor(a / CELL);
      for (const b of other) {
        const bx = b % CELL;
        const by = Math.floor(b / CELL);
        const distance = Math.max(Math.abs(ax - bx), Math.abs(ay - by));
        if (!best || distance < best.distance) best = { ax, ay, bx, by, distance };
      }
    }
    let x = best.ax;
    let y = best.ay;
    while (x !== best.bx || y !== best.by) {
      x += Math.sign(best.bx - x);
      y += Math.sign(best.by - y);
      const global = (row * CELL + y) * WIDTH + column * CELL + x;
      if (!mask[global]) {
        mask[global] = 1;
        connectors += 1;
      }
    }
    found = components(row, column);
  }
  return connectors;
};

const fillEnclosedHoles4 = (row, column) => {
  const outside = new Uint8Array(CELL * CELL);
  const queue = [];
  const push = (x, y) => {
    const local = y * CELL + x;
    const global = (row * CELL + y) * WIDTH + column * CELL + x;
    if (outside[local] || mask[global]) return;
    outside[local] = 1;
    queue.push(local);
  };
  for (let x = 0; x < CELL; x += 1) { push(x, 0); push(x, CELL - 1); }
  for (let y = 0; y < CELL; y += 1) { push(0, y); push(CELL - 1, y); }
  let head = 0;
  while (head < queue.length) {
    const local = queue[head++];
    const x = local % CELL;
    const y = Math.floor(local / CELL);
    for (const [dx, dy] of neighbors4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) push(nx, ny);
    }
  }
  let filled = 0;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const local = y * CELL + x;
      const global = (row * CELL + y) * WIDTH + column * CELL + x;
      if (!mask[global] && !outside[local]) {
        mask[global] = 1;
        filled += 1;
      }
    }
  }
  return filled;
};

const cells = [];
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const connectors = connectComponents(row, column);
    const holesFilled = fillEnclosedHoles4(row, column);
    const after = components(row, column);
    cells.push({ row, column, connectors, holesFilled, components: after.length, maskPixels: after[0]?.length ?? 0 });
  }
}

const maskRgba = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
const layer = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
let initialDifferencePixels = 0;
let maskPixels = 0;
let targetBaseDifferencesOutsideMask = 0;
let transparentRgbNonZero = 0;
const impossibleSameAlphaChanges = [];
const genericDarkFaceCovered = [];

for (let pixel = 0; pixel < mask.length; pixel += 1) {
  const at = pixel * CHANNELS;
  const x = pixel % WIDTH;
  const y = Math.floor(pixel / WIDTH);
  const differs = target[at] !== base[at]
    || target[at + 1] !== base[at + 1]
    || target[at + 2] !== base[at + 2]
    || target[at + 3] !== base[at + 3];
  if (differs) initialDifferencePixels += 1;
  if (differs && !mask[pixel]) targetBaseDifferencesOutsideMask += 1;
  if (!mask[pixel]) continue;
  maskPixels += 1;
  maskRgba[at] = 255;
  maskRgba[at + 1] = 255;
  maskRgba[at + 2] = 255;
  maskRgba[at + 3] = 255;

  // This is a pet-specific replacement matte. Visible pixels are copied from
  // the frozen canonical target at the exact same coordinate.
  layer[at] = target[at];
  layer[at + 1] = target[at + 1];
  layer[at + 2] = target[at + 2];
  layer[at + 3] = target[at + 3];

  if (differs
    && target[at + 3] === base[at + 3]
    && target[at + 3] > 0
    && target[at + 3] < 255
    && (target[at] !== base[at] || target[at + 1] !== base[at + 1] || target[at + 2] !== base[at + 2])) {
    impossibleSameAlphaChanges.push({
      x, y,
      row: Math.floor(y / CELL), column: Math.floor(x / CELL),
      localX: x % CELL, localY: y % CELL,
      base: Array.from(base.subarray(at, at + 4)),
      target: Array.from(target.subarray(at, at + 4)),
    });
  }

  const localY = y % CELL;
  if (localY < 112 && base[at + 3] > 64 && base[at] < 92 && base[at + 1] < 82 && base[at + 2] < 82) {
    genericDarkFaceCovered.push({
      x, y,
      row: Math.floor(y / CELL), column: Math.floor(x / CELL),
      localX: x % CELL, localY,
    });
  }
}

for (let at = 0; at < layer.length; at += CHANNELS) {
  if (layer[at + 3] === 0 && (layer[at] || layer[at + 1] || layer[at + 2])) transparentRgbNonZero += 1;
}

await Promise.all([
  sharp(maskRgba, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(maskPath),
  sharp(layer, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(layerPath),
]);

const report = {
  verdict: impossibleSameAlphaChanges.length === 0 ? 'PENDING_COMPOSITE_QA' : 'REJECT',
  reason: impossibleSameAlphaChanges.length === 0
    ? null
    : 'A normal source-over layer cannot change RGB while keeping the same partial alpha without an erase/replacement operation.',
  inputs: { targetPath, basePath, oldMaskOrLayerInputs: [] },
  outputs: { maskPath, layerPath },
  geometry: { canvas: '800x640', cell: '160x160', resized: false, rotated: false, stretched: false, shifted: false },
  totals: {
    initialDifferencePixels,
    maskPixels,
    targetBaseDifferencesOutsideMask,
    transparentRgbNonZero,
    impossibleSamePartialAlphaRgbChanges: impossibleSameAlphaChanges.length,
    genericDarkFaceCandidatesCovered: genericDarkFaceCovered.length,
  },
  cells,
  impossibleSameAlphaChanges,
  genericDarkFaceCovered,
  interpretation: 'The layer is an exact-coordinate replacement matte. Normal source-over is separately required to pass before acceptance.',
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
