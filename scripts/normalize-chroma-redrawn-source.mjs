/**
 * Convert an opaque, single-colour ImageGen background into real alpha before
 * normalising a 5 x 4 redraw atlas to the production 800 x 640 canvas.
 *
 * The background colour is measured from the outer border. Edge pixels are
 * unmatted against that measured colour so a saturated chroma fringe is not
 * baked into the wearable outline.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [inputPath, outputPath, reportPath] = process.argv.slice(2);
if (!inputPath || !outputPath || !reportPath) {
  console.error('usage: node scripts/normalize-chroma-redrawn-source.mjs <input> <output> <report>');
  process.exit(1);
}

const source = await sharp(inputPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = source.info;
if (channels !== 3) throw new Error(`expected RGB input, received ${channels} channels`);

const border = [];
const inset = Math.max(2, Math.min(12, Math.floor(Math.min(width, height) * 0.01)));
for (let y = 0; y < height; y += 1) {
  for (let x = 0; x < width; x += 1) {
    if (x >= inset && x < width - inset && y >= inset && y < height - inset) continue;
    const at = (y * width + x) * channels;
    border.push([source.data[at], source.data[at + 1], source.data[at + 2]]);
  }
}
const median = (channel) => {
  const values = border.map((sample) => sample[channel]).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
};
const background = [median(0), median(1), median(2)];
const output = Buffer.alloc(width * height * 4);
const transparentDistance = 18;
const opaqueDistance = 88;
const backgroundMagentaExcess = (
  (background[0] - background[1]) + (background[2] - background[1])
) / 2;
let transparentPixels = 0;
let partialPixels = 0;
let opaquePixels = 0;

const smoothstep = (value) => value * value * (3 - 2 * value);
for (let pixel = 0; pixel < width * height; pixel += 1) {
  const sourceAt = pixel * channels;
  const outputAt = pixel * 4;
  const rgb = [source.data[sourceAt], source.data[sourceAt + 1], source.data[sourceAt + 2]];
  const distance = Math.hypot(
    rgb[0] - background[0], rgb[1] - background[1], rgb[2] - background[2],
  );
  let distanceCoverage = 0;
  if (distance >= opaqueDistance) distanceCoverage = 1;
  else if (distance > transparentDistance) {
    distanceCoverage = smoothstep(
      (distance - transparentDistance) / (opaqueDistance - transparentDistance),
    );
  }
  // Euclidean distance alone marks a half-white/half-magenta antialias pixel as opaque because
  // its green channel is far from the key colour. The remaining magenta excess reveals the true
  // coverage of pale sailor-hat edges and lets the unmatte remove the coloured halo.
  const currentMagentaExcess = ((rgb[0] - rgb[1]) + (rgb[2] - rgb[1])) / 2;
  const spillCoverage = backgroundMagentaExcess > 80
    ? Math.max(0, Math.min(1, 1 - currentMagentaExcess / backgroundMagentaExcess))
    : 1;
  const alpha = Math.round(255 * Math.min(distanceCoverage, spillCoverage));

  if (alpha === 0) {
    transparentPixels += 1;
    continue;
  }
  if (alpha === 255) opaquePixels += 1;
  else partialPixels += 1;
  const coverage = alpha / 255;
  for (let channel = 0; channel < 3; channel += 1) {
    // C = coverage * foreground + (1 - coverage) * background.
    const unmatted = (rgb[channel] - (1 - coverage) * background[channel]) / coverage;
    output[outputAt + channel] = Math.max(0, Math.min(255, Math.round(unmatted)));
  }
  output[outputAt + 3] = alpha;
}

const normalized = await sharp(output, { raw: { width, height, channels: 4 } })
  .resize(800, 640, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
  .raw()
  .toBuffer({ resolveWithObject: true });
let normalizedTransparentPixels = 0;
let hiddenRgbBeforeSanitation = 0;
for (let at = 0; at < normalized.data.length; at += 4) {
  if (normalized.data[at + 3] !== 0) continue;
  normalizedTransparentPixels += 1;
  if (normalized.data[at] || normalized.data[at + 1] || normalized.data[at + 2]) {
    hiddenRgbBeforeSanitation += 1;
  }
  normalized.data[at] = 0;
  normalized.data[at + 1] = 0;
  normalized.data[at + 2] = 0;
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(normalized.data, { raw: { width: 800, height: 640, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
const sha256 = async (file) => crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report = {
  inputPath,
  outputPath,
  inputCanvas: [width, height],
  outputCanvas: [800, 640],
  measuredBackgroundRgb: background,
  thresholds: {
    transparentDistance,
    opaqueDistance,
    distanceMetric: 'minimum of RGB Euclidean smoothstep and magenta-spill coverage',
    backgroundMagentaExcess: Number(backgroundMagentaExcess.toFixed(3)),
  },
  highResolutionPixels: { transparent: transparentPixels, partial: partialPixels, opaque: opaquePixels },
  outputTransparentPixels: normalizedTransparentPixels,
  hiddenRgbBeforeSanitation,
  hiddenRgbAfterSanitation: 0,
  operationOrder: ['border background measurement', 'soft chroma matte', 'edge unmatte', 'atlas resize', 'transparent RGB sanitation'],
  inputSha256: await sha256(inputPath),
  outputSha256: await sha256(outputPath),
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
