/**
 * Diagnostic body-lock for head-07 sailor-cap masking.
 *
 * This is deliberately not a publisher. It creates a derived target in which
 * the original base atlas is authoritative everywhere except for cap pixels
 * that survive the protected eye/tail filters. The resulting target, mask and
 * layer are useful for testing the same-coordinate compositing contract, but
 * must never replace the independently frozen full-redraw target.
 *
 * Usage:
 *   node scripts/build-head07-body-locked-target.mjs \
 *     <clean-target> <base> <source-mask> <output-directory>
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, basePath, maskPath, outputDirectory, tailMode = 'bow-aware'] = process.argv.slice(2);
if (!targetPath || !basePath || !maskPath || !outputDirectory) {
  console.error('usage: node scripts/build-head07-body-locked-target.mjs <clean-target> <base> <source-mask> <output-directory> [bow-aware|strict-tail]');
  process.exit(1);
}
if (!['bow-aware', 'strict-tail'].includes(tailMode)) throw new Error(`unknown tail mode: ${tailMode}`);

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const CHANNELS = 4;
const PIXELS = WIDTH * HEIGHT;

const readRgba = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}; got ${image.info.width}x${image.info.height}`);
  }
  return image.data;
};

// A prior masking handoff wrote an RGB black/white mask, while later handoffs
// wrote a true-alpha mask. Read either form without accidentally treating an
// opaque RGB background as a full-canvas alpha mask.
const readMask = async (input) => {
  const image = await sharp(input).raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT) {
    throw new Error(`${input} must be ${WIDTH}x${HEIGHT}; got ${image.info.width}x${image.info.height}`);
  }
  if (![1, 2, 3, 4].includes(image.info.channels)) {
    throw new Error(`${input} has unsupported channel count ${image.info.channels}`);
  }
  const alpha = new Uint8Array(PIXELS);
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const at = pixel * image.info.channels;
    alpha[pixel] = image.info.channels >= 4 ? image.data[at + 3] : image.data[at];
  }
  return { alpha, channels: image.info.channels };
};

const [target, base, sourceMask] = await Promise.all([
  readRgba(targetPath),
  readRgba(basePath),
  readMask(maskPath),
]);

const at = (x, y) => (y * WIDTH + x) * CHANNELS;
const pixel = (x, y) => y * WIDTH + x;
const inRoi = (x, y, roi) => x >= roi.minX && x <= roi.maxX && y >= roi.minY && y <= roi.maxY;

// These are the frozen QA protected regions, expressed in cell-local
// coordinates. Eye filtering is material-aware: it removes only mask pixels
// that would cover eye ink, so the cap band is not needlessly erased. Tail
// filtering keeps the blue/gold bow and its one-pixel antialias fringe while
// dropping pet-coloured pixels that leak into the bow/tail support region.
const eyeRoiFor = (row, column) => {
  if (row === 0) return { minX: 32, maxX: 128, minY: 68, maxY: 122 };
  if (row === 1) return { minX: 78, maxX: 148, minY: 62, maxY: 120 };
  if (row === 3 && column === 2) return { minX: 8, maxX: 115, minY: 78, maxY: 145 };
  if (row === 3) return { minX: 28, maxX: 132, minY: 66, maxY: 128 };
  return null;
};
const tailRoiFor = (row) => {
  if (row === 1) return { minX: 0, maxX: 72, minY: 34, maxY: 122 };
  if (row === 2) return { minX: 42, maxX: 112, minY: 54, maxY: 132 };
  return null;
};

const eyeInk = (data, offset) => {
  if (data[offset + 3] < 96) return false;
  return data[offset] < 105 && data[offset + 1] < 78 && data[offset + 2] < 68;
};
const blueMaterial = (data, offset) => {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  const min = Math.min(r, g, b);
  return b >= 42 && b > r * 1.06 && b >= g * 0.96 && b - min >= 18;
};
const goldMaterial = (data, offset) => {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return r >= 120 && g >= 65 && b <= 130 && r > g * 1.05 && g > b * 1.08;
};

const targetMaterial = (globalX, globalY) => {
  const offset = at(globalX, globalY);
  return blueMaterial(target, offset) || goldMaterial(target, offset);
};
const hasBowMaterialNearby = (globalX, globalY) => {
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const x = globalX + ox;
      const y = globalY + oy;
      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) continue;
      if (targetMaterial(x, y)) return true;
    }
  }
  return false;
};

const refinedMask = new Uint8Array(PIXELS);
const layer = Buffer.alloc(PIXELS * CHANNELS);
const lockedTarget = Buffer.from(base);
const stats = {
  sourceMaskPixels: 0,
  keptMaskPixels: 0,
  clearedPixels: 0,
  clearedEyePixels: 0,
  clearedTailPetPixels: 0,
  clearedTargetTransparentPixels: 0,
  sourceMaskChannels: sourceMask.channels,
  byCell: [],
};

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const originX = column * CELL;
    const originY = row * CELL;
    const eyeRoi = eyeRoiFor(row, column);
    const tailRoi = tailRoiFor(row);
    const cellStats = {
      row,
      column,
      index: row * 5 + column + 1,
      sourceMaskPixels: 0,
      keptMaskPixels: 0,
      clearedEyePixels: 0,
      clearedTailPetPixels: 0,
      clearedTargetTransparentPixels: 0,
    };

    for (let y = 0; y < CELL; y += 1) {
      for (let x = 0; x < CELL; x += 1) {
        const globalX = originX + x;
        const globalY = originY + y;
        const p = pixel(globalX, globalY);
        if (sourceMask.alpha[p] === 0) continue;
        cellStats.sourceMaskPixels += 1;
        stats.sourceMaskPixels += 1;
        const offset = at(globalX, globalY);
        let keep = true;

        // Never copy a transparent/empty target pixel into an opaque layer.
        if (target[offset + 3] === 0) {
          keep = false;
          cellStats.clearedTargetTransparentPixels += 1;
          stats.clearedTargetTransparentPixels += 1;
        }

        if (keep && eyeRoi && inRoi(x, y, eyeRoi) && eyeInk(base, offset)) {
          keep = false;
          cellStats.clearedEyePixels += 1;
          stats.clearedEyePixels += 1;
        }

        // In the tail support ROI, the strict mode removes every layer pixel
        // over visible base. It is the zero-contamination audit baseline. The
        // default bow-aware mode preserves blue/gold bow material and a
        // one-pixel fringe, retaining the legal rear bow lobes while dropping
        // warm/pale pet tail pixels.
        const strictTailContamination = tailMode === 'strict-tail'
          && tailRoi && inRoi(x, y, tailRoi) && base[offset + 3] > 0;
        const bowAwareTailContamination = tailMode === 'bow-aware'
          && tailRoi && inRoi(x, y, tailRoi)
          && !targetMaterial(globalX, globalY)
          && !hasBowMaterialNearby(globalX, globalY);
        if (keep && (strictTailContamination || bowAwareTailContamination)) {
          keep = false;
          cellStats.clearedTailPetPixels += 1;
          stats.clearedTailPetPixels += 1;
        }

        if (keep) {
          refinedMask[p] = 255;
          cellStats.keptMaskPixels += 1;
          stats.keptMaskPixels += 1;
          for (let channel = 0; channel < CHANNELS; channel += 1) {
            layer[offset + channel] = target[offset + channel];
            lockedTarget[offset + channel] = target[offset + channel];
          }
        } else {
          stats.clearedPixels += 1;
        }
      }
    }
    stats.byCell.push(cellStats);
  }
}

// PNG clean targets conventionally canonicalize fully transparent RGB to
// zero. The source WebP contains hidden RGB below alpha 1; retaining those
// bytes is correct for visible-pixel body-lock semantics, but a compositor
// that emits transparent black will otherwise show a false exact-RGBA diff.
// Keep both forms so the report can distinguish a real visible mismatch from
// this non-rendering storage detail.
const lockedTargetCanonical = Buffer.from(lockedTarget);
let hiddenTransparentRgbPixels = 0;
for (let p = 0; p < PIXELS; p += 1) {
  const offset = p * CHANNELS;
  if (lockedTargetCanonical[offset + 3] !== 0) continue;
  if (lockedTargetCanonical[offset] || lockedTargetCanonical[offset + 1] || lockedTargetCanonical[offset + 2]) {
    hiddenTransparentRgbPixels += 1;
    lockedTargetCanonical[offset] = 0;
    lockedTargetCanonical[offset + 1] = 0;
    lockedTargetCanonical[offset + 2] = 0;
  }
}

const hashFile = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const writeRgba = async (outputPath, data) => {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp(data, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);
};
const writeMask = async (outputPath, alpha) => {
  const rgba = Buffer.alloc(PIXELS * CHANNELS);
  for (let p = 0; p < PIXELS; p += 1) {
    rgba[p * 4 + 3] = alpha[p];
  }
  await writeRgba(outputPath, rgba);
};

const outputPaths = {
  refinedMask: path.join(outputDirectory, 'mask-alpha-refined-protected-roi.png'),
  layer: path.join(outputDirectory, 'layer-refined-protected-roi.png'),
  lockedTarget: path.join(outputDirectory, 'locked-target-body-exact.png'),
  lockedTargetCanonical: path.join(outputDirectory, 'locked-target-body-exact-rgba0.png'),
  report: path.join(outputDirectory, 'body-lock-report.json'),
};
await writeMask(outputPaths.refinedMask, refinedMask);
await writeRgba(outputPaths.layer, layer);
await writeRgba(outputPaths.lockedTarget, lockedTarget);
await writeRgba(outputPaths.lockedTargetCanonical, lockedTargetCanonical);

let lockedOutsideMaskMismatch = 0;
let lockedInsideMaskTargetMismatch = 0;
let lockedVsCleanTargetMismatch = 0;
for (let p = 0; p < PIXELS; p += 1) {
  const offset = p * CHANNELS;
  const same = (left, right) => left[offset] === right[offset]
    && left[offset + 1] === right[offset + 1]
    && left[offset + 2] === right[offset + 2]
    && left[offset + 3] === right[offset + 3];
  if (!refinedMask[p] && !same(lockedTarget, base)) lockedOutsideMaskMismatch += 1;
  if (refinedMask[p] && !same(lockedTarget, target)) lockedInsideMaskTargetMismatch += 1;
  if (!same(lockedTarget, target)) lockedVsCleanTargetMismatch += 1;
}

const report = {
  verdict: 'LOCKED_TARGET_DIAGNOSTIC_ONLY',
  warning: 'Derived body-lock artifact. It is not an authoritative redraw and must not be published or used as a manifest target.',
  contract: {
    operation: 'lockedTarget = base everywhere; target pixel copied only at refinedMask alpha 255; no resize/shift/rotation/warp',
    sourceTarget: targetPath,
    sourceBase: basePath,
    sourceMask: maskPath,
    protectedFiltering: tailMode === 'strict-tail'
      ? 'eye ink pixels removed; every candidate layer pixel over visible base in frozen side/back tail ROIs removed'
      : 'eye ink pixels removed; tail ROI retains only blue/gold bow material plus one-pixel fringe',
    tailMode,
  },
  inputSha256: {
    target: await hashFile(targetPath),
    base: await hashFile(basePath),
    sourceMask: await hashFile(maskPath),
  },
  outputSha256: {
    refinedMask: await hashFile(outputPaths.refinedMask),
    layer: await hashFile(outputPaths.layer),
    lockedTarget: await hashFile(outputPaths.lockedTarget),
    lockedTargetCanonical: await hashFile(outputPaths.lockedTargetCanonical),
  },
  outputs: outputPaths,
  stats: {
    ...stats,
    clearedPixels: stats.clearedPixels,
    lockedOutsideMaskMismatch,
    lockedInsideMaskTargetMismatch,
    lockedVsCleanTargetMismatch,
    hiddenTransparentRgbPixels,
    exactBodyLockInvariant: lockedOutsideMaskMismatch === 0 && lockedInsideMaskTargetMismatch === 0,
    canonicalTransparentTargetIsForExactRgbaQa: true,
  },
};
await fs.writeFile(outputPaths.report, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
