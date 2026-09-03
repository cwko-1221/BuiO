/**
 * Extract a feathered local replacement from a fully redrawn dressed-pet atlas.
 *
 * The guide only locates the wearable. The exported patch deliberately carries the surrounding
 * redrawn fur/face so small, perspective-sensitive accessories survive game-scale rendering and
 * meet the pet with natural occlusion instead of looking like a sticker.
 *
 *   node scripts/extract-redrawn-local-region.mjs \
 *     <base> <registered-dressed> <registered-guide> <output-prefix> \
 *     [inner-radius] [feather] [silhouette-guard] [core-radius]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [
  basePath,
  dressedPath,
  guidePath,
  outputPrefix,
  innerArg = '20',
  featherArg = '4',
  guardArg = '0',
  coreArg = '4',
] = process.argv.slice(2);
if (!basePath || !dressedPath || !guidePath || !outputPrefix) {
  console.error('usage: node scripts/extract-redrawn-local-region.mjs <base> <registered-dressed> <registered-guide> <output-prefix> [inner-radius] [feather] [silhouette-guard] [core-radius]');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const innerRadius = Number(innerArg);
const feather = Number(featherArg);
const silhouetteGuard = Number(guardArg);
const coreRadius = Number(coreArg);
const outerRadius = innerRadius + feather;
if (
  !Number.isFinite(innerRadius) || innerRadius < 0
  || !Number.isFinite(feather) || feather < 0
  || !Number.isFinite(silhouetteGuard) || silhouetteGuard < 0
  || !Number.isFinite(coreRadius) || coreRadius < 0
) {
  throw new Error('radius, feather, silhouette-guard and core-radius must be non-negative numbers');
}

const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}`);
  }
  return result;
};

const [base, dressed, guide] = await Promise.all([read(basePath), read(dressedPath), read(guidePath)]);
const patch = Buffer.alloc(WIDTH * HEIGHT * 4);
const erase = Buffer.alloc(WIDTH * HEIGHT * 4);
const cellStats = [];

const chamfer = (distance) => {
  const diagonal = Math.SQRT2;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const at = y * CELL + x;
      let value = distance[at];
      if (x > 0) value = Math.min(value, distance[at - 1] + 1);
      if (y > 0) value = Math.min(value, distance[at - CELL] + 1);
      if (x > 0 && y > 0) value = Math.min(value, distance[at - CELL - 1] + diagonal);
      if (x + 1 < CELL && y > 0) value = Math.min(value, distance[at - CELL + 1] + diagonal);
      distance[at] = value;
    }
  }
  for (let y = CELL - 1; y >= 0; y -= 1) {
    for (let x = CELL - 1; x >= 0; x -= 1) {
      const at = y * CELL + x;
      let value = distance[at];
      if (x + 1 < CELL) value = Math.min(value, distance[at + 1] + 1);
      if (y + 1 < CELL) value = Math.min(value, distance[at + CELL] + 1);
      if (x + 1 < CELL && y + 1 < CELL) value = Math.min(value, distance[at + CELL + 1] + diagonal);
      if (x > 0 && y + 1 < CELL) value = Math.min(value, distance[at + CELL - 1] + diagonal);
      distance[at] = value;
    }
  }
  return distance;
};

const guideDistanceField = (column, row) => {
  const distance = new Float32Array(CELL * CELL);
  distance.fill(Number.POSITIVE_INFINITY);
  let guidePixels = 0;

  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * guide.info.channels);
      if (guide.data[sourceAt + 3] > 8) {
        distance[y * CELL + x] = 0;
        guidePixels += 1;
      }
    }
  }

  return { distance: chamfer(distance), guidePixels };
};

const baseEdgeDistanceField = (column, row) => {
  const distance = new Float32Array(CELL * CELL);
  distance.fill(Number.POSITIVE_INFINITY);
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * base.info.channels);
      if (base.data[sourceAt + 3] < 20) distance[y * CELL + x] = 0;
    }
  }
  return chamfer(distance);
};

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const { distance, guidePixels } = guideDistanceField(column, row);
    const edgeDistance = silhouetteGuard > 0 ? baseEdgeDistanceField(column, row) : null;
    if (!guidePixels) {
      cellStats.push({ column, row, guidePixels: 0, replacementPixels: 0 });
      continue;
    }
    let replacementPixels = 0;
    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const local = y * CELL + x;
        const value = distance[local];
        if (value > outerRadius) continue;
        // The semantic guide itself may legitimately sit over exterior fur. Only the larger
        // surrounding redraw is blocked from the outer silhouette, preventing doubled ears,
        // detached tufts and light matte ghosts from a slightly different generated silhouette.
        if (edgeDistance && value > coreRadius && edgeDistance[local] <= silhouetteGuard) continue;
        const strength = value <= innerRadius || feather === 0
          ? 255
          : Math.max(0, Math.min(255, Math.round((outerRadius - value) / feather * 255)));
        if (!strength) continue;

        const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * dressed.info.channels);
        const baseAt = (((row * CELL + y) * WIDTH + column * CELL + x) * base.info.channels);
        const targetAt = ((row * CELL + y) * WIDTH + column * CELL + x) * 4;
        const dressedAlpha = dressed.data[sourceAt + 3];
        const baseAlpha = base.data[baseAt + 3];
        const patchAlpha = Math.round(dressedAlpha * strength / 255);
        const eraseAlpha = Math.round(Math.max(dressedAlpha, baseAlpha) * strength / 255);

        patch[targetAt] = dressed.data[sourceAt];
        patch[targetAt + 1] = dressed.data[sourceAt + 1];
        patch[targetAt + 2] = dressed.data[sourceAt + 2];
        patch[targetAt + 3] = patchAlpha;
        erase[targetAt] = 255;
        erase[targetAt + 1] = 255;
        erase[targetAt + 2] = 255;
        erase[targetAt + 3] = eraseAlpha;
        if (patchAlpha || eraseAlpha) replacementPixels += 1;
      }
    }
    cellStats.push({ column, row, guidePixels, replacementPixels });
  }
}

await fs.mkdir(path.dirname(outputPrefix), { recursive: true });
const raw = { width: WIDTH, height: HEIGHT, channels: 4 };
const patchPath = `${outputPrefix}-patch.png`;
const erasePath = `${outputPrefix}-erase-mask.png`;
const proofPath = `${outputPrefix}-proof.png`;
await Promise.all([
  sharp(patch, { raw }).png({ compressionLevel: 9 }).toFile(patchPath),
  sharp(erase, { raw }).png({ compressionLevel: 9 }).toFile(erasePath),
]);
const baseBody = await sharp(base.data, {
  raw: { width: WIDTH, height: HEIGHT, channels: base.info.channels },
}).composite([{ input: erase, raw, blend: 'dest-out' }]).png().toBuffer();
await sharp(baseBody).composite([{ input: patch, raw }]).png({ compressionLevel: 9 }).toFile(proofPath);

console.log(JSON.stringify({
  patchPath,
  erasePath,
  proofPath,
  innerRadius,
  feather,
  silhouetteGuard,
  coreRadius,
  cellStats,
}, null, 2));
