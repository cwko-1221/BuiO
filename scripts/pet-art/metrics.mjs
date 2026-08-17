// Content-box metrics for placeable art.
//
// Props are authored on a fixed 640x640 canvas, but the drawn object occupies only part of it
// and is not centred — a 1x1 side table might be 206x229 pixels sitting at (217,267). The
// runtime needs to scale a piece to the grid footprint it occupies and stand it on the floor,
// and it can only do that against the object's real bounds. Measuring the alpha bounding box
// here keeps that cost at build time instead of paying it on every client.
//
// Runs last in the pipeline so it always measures the current art.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export const category = 'metrics';

const ALPHA_THRESHOLD = 16;

/** Alpha bounding box in canvas pixels, normalised to 0..1 fractions of the canvas. */
async function contentBox(file, region) {
  const pipeline = sharp(file);
  if (region) pipeline.extract(region);
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] <= ALPHA_THRESHOLD) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null; // fully transparent
  return {
    x: Number((minX / info.width).toFixed(4)),
    y: Number((minY / info.height).toFixed(4)),
    width: Number(((maxX - minX + 1) / info.width).toFixed(4)),
    height: Number(((maxY - minY + 1) / info.height).toFixed(4)),
  };
}

export async function generate({ catalog, resolve, root, log }) {
  const metrics = {};
  let measured = 0;
  let missing = 0;

  for (const item of [...catalog.furniture, ...catalog.wearables]) {
    if (!item.art) continue;
    const file = resolve(item.art);
    try {
      const box = await contentBox(file);
      if (box) {
        metrics[item.id] = box;
        measured += 1;
      }
    } catch {
      missing += 1; // not generated yet; the runtime falls back to whole-canvas fitting
    }
  }

  await fs.mkdir(path.join(root, 'collectibles'), { recursive: true });
  await fs.writeFile(path.join(root, 'collectibles', 'metrics.json'), JSON.stringify(metrics, null, 0));

  const bodies = await measureBodies({ catalog, resolve, root, log });

  log(`measured ${measured} content boxes${missing ? `, ${missing} missing` : ''}, ${bodies} creature anchors`);
  return { counts: { measured, missing, bodies } };
}

/**
 * Where a hat, a pair of glasses and a collar belong on each creature.
 *
 * Atlas cells are square and no creature fills one, and the forms differ wildly — long ears,
 * horns, a shell, no neck at all. Any fixed proportion of the cell therefore floats accessories
 * above the squat creatures and buries them in the tall ones, so the runtime needs anchors
 * measured from the art itself. Doing it here keeps the cost at build time.
 *
 * The idle pose is the resting one, so it is the right frame to fit accessories against.
 */
async function measureBodies({ catalog, resolve, root, log }) {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(root, 'sprites', 'manifest.json'), 'utf8'));
  } catch {
    log('no sprite manifest yet; skipping creature anchors');
    return 0;
  }
  const region = { left: 0, top: 0, width: manifest.frameWidth, height: manifest.frameHeight };

  const bodies = {};
  for (const pet of catalog.pets) {
    for (let stage = 0; stage < (pet.atlas?.length ?? 0); stage += 1) {
      try {
        const { data, info } = await sharp(resolve(pet.atlas[stage])).extract(region).ensureAlpha().raw()
          .toBuffer({ resolveWithObject: true });
        const found = anchors(data, info);
        if (found) bodies[`${pet.id}-${stage + 1}`] = found;
      } catch {
        // atlas not generated yet; the runtime falls back to fitting against the whole cell
      }
    }
  }
  await fs.writeFile(path.join(root, 'sprites', 'body-metrics.json'), JSON.stringify(bodies, null, 0));
  return Object.keys(bodies).length;
}

/** Fraction of the widest row a row must reach to count as skull rather than ear or horn. */
const SKULL_WIDTH_RATIO = 0.72;
/** Luminance below which a pixel reads as eye rather than fur. */
const EYE_LUMINANCE = 0.38;

/** Anchor lines and widths for one idle frame, as 0..1 fractions of the cell. */
function anchors(data, info) {
  const { width: W, height: H, channels: C } = info;
  const alphaAt = (x, y) => data[(y * W + x) * C + 3];
  const luminanceAt = (x, y) => {
    const i = (y * W + x) * C;
    return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  };

  let minX = W;
  let minY = H;
  let maxX = -1;
  let maxY = -1;
  const widths = new Int32Array(H);
  for (let y = 0; y < H; y += 1) {
    let rowMin = -1;
    let rowMax = -1;
    for (let x = 0; x < W; x += 1) {
      if (alphaAt(x, y) <= ALPHA_THRESHOLD) continue;
      if (rowMin < 0) rowMin = x;
      rowMax = x;
    }
    if (rowMin < 0) continue;
    widths[y] = rowMax - rowMin + 1;
    if (rowMin < minX) minX = rowMin;
    if (rowMax > maxX) maxX = rowMax;
    if (y < minY) minY = y;
    maxY = y;
  }
  if (maxY < 0) return null;

  // Eye line: every form has large high-contrast eyes, and they are the one landmark that stays
  // on the face whatever the silhouette does, so the darkest row of the upper body locates the
  // face far more reliably than any proportion of the body.
  const searchTo = Math.round(minY + (maxY - minY) * 0.72);
  let eyeY = minY;
  let darkest = 0;
  for (let y = minY; y <= searchTo; y += 1) {
    let dark = 0;
    for (let x = minX; x <= maxX; x += 1) {
      if (alphaAt(x, y) <= 128) continue;
      const luminance = luminanceAt(x, y);
      if (luminance < EYE_LUMINANCE) dark += EYE_LUMINANCE - luminance;
    }
    if (dark > darkest) { darkest = dark; eyeY = y; }
  }

  // Top of the skull: the first row broad enough to be head rather than ear, horn or antenna,
  // so a hat lands on the head with the ears poking past it rather than hovering above them.
  // Measured only above the eyes and against the widest row up there — a winged or wide-hipped
  // form is broadest at the body, and comparing against that never finds a head at all.
  let headPeak = 0;
  for (let y = minY; y <= eyeY; y += 1) if (widths[y] > headPeak) headPeak = widths[y];
  let skull = minY;
  for (let y = minY; y <= eyeY; y += 1) {
    if (widths[y] >= headPeak * SKULL_WIDTH_RATIO) { skull = y; break; }
  }

  let eyeMin = maxX;
  let eyeMax = minX;
  for (let x = minX; x <= maxX; x += 1) {
    if (alphaAt(x, eyeY) <= 128 || luminanceAt(x, eyeY) >= EYE_LUMINANCE) continue;
    if (x < eyeMin) eyeMin = x;
    if (x > eyeMax) eyeMax = x;
  }
  if (eyeMax < eyeMin) { eyeMin = minX; eyeMax = maxX; }

  const round = (value) => Number(value.toFixed(4));
  return {
    top: round(skull / H),
    eye: round(eyeY / H),
    bottom: round((maxY + 1) / H),
    centre: round(((minX + maxX + 1) / 2) / W),
    width: round((maxX - minX + 1) / W),
    // Widest row of the head region rather than the row halfway down it: a tapering muzzle or a
    // pointed mantle is narrower there than the eyes it has to sit above, and glasses fitted to
    // that would come out wider than the hat.
    head: round(headPeak / W),
    face: round((eyeMax - eyeMin + 1) / W),
  };
}
