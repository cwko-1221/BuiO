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

  const creatures = await measureCreatures({ catalog, resolve, root, log });

  log(`measured ${measured} content boxes${missing ? `, ${missing} missing` : ''}, ${creatures.anchors} creature anchors over ${creatures.tracks} motion tracks`);
  return { counts: { measured, missing, ...creatures } };
}

/**
 * Where a hat, a pair of glasses and a collar belong on each creature, frame by frame.
 *
 * Atlas cells are square and no creature fills one, and the forms differ wildly — long ears,
 * horns, a shell, no neck at all. Any fixed proportion of the cell therefore floats accessories
 * above the squat creatures and buries them in the tall ones, so the runtime needs anchors
 * measured from the art itself.
 *
 * Measuring only the resting pose is not enough either. A creature's head travels 19px within
 * idle and 45px while it is happy, on a 160px cell — an accessory pinned to one set of anchors
 * stays put while the head moves out from under it, which is exactly what reads as a sticker
 * rather than something worn. So every frame is measured, and the difference from the resting
 * pose ships alongside as a compact per-frame track.
 */
async function measureCreatures({ catalog, resolve, root, log }) {
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(root, 'sprites', 'manifest.json'), 'utf8'));
  } catch {
    log('no sprite manifest yet; skipping creature anchors');
    return { anchors: 0, tracks: 0 };
  }
  const { frameWidth: cellW, frameHeight: cellH } = manifest;
  // The manifest has had two shapes. The pose sheet gives plain counts; the older one listed the
  // columns and rows it used. Reading .length off a number came back undefined, which put every
  // frame at NaN and quietly handed back whole-cell proportions for all eighty creatures.
  const count = (value, fallback) => (Array.isArray(value) ? value.length : Number(value) || fallback);
  const columns = manifest.gridColumns || count(manifest.columns, 1);
  const cells = columns * (manifest.gridRows || count(manifest.rows, 1));

  // Only the cells something is drawn in are measured; the rest of the grid is padding.
  const drawn = new Set();
  for (const clip of manifest.clips || []) for (const frame of clip.frames) drawn.add(frame);
  for (const action of Object.values(manifest.actions || {})) {
    for (let i = 0; i < action.count; i += 1) drawn.add(action.start + i);
  }
  const animated = drawn;

  const anchors = {};
  const motion = {};
  for (const pet of catalog.pets) {
    if (!pet.animated) continue;
    for (let stage = 0; stage < (pet.atlas?.length ?? 0); stage += 1) {
      let sheet;
      try {
        sheet = await sharp(resolve(pet.atlas[stage])).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      } catch {
        continue; // atlas not generated yet; the runtime falls back to whole-cell proportions
      }
      const cellAt = (index) => landmarks(sheet.data, sheet.info, {
        left: (index % columns) * cellW, top: Math.floor(index / columns) * cellH, width: cellW, height: cellH,
      });

      const rest = cellAt(0);
      if (!rest) continue;
      const key = `${pet.id}-${stage + 1}`;
      const round = (value) => Number(value.toFixed(4));
      anchors[key] = {
        top: round(rest.skull / cellH), eye: round(rest.eye / cellH), bottom: round(rest.bottom / cellH),
        centre: round(rest.centre / cellW), width: round(rest.width / cellW),
        head: round(rest.head / cellW), face: round(rest.face / cellW),
      };

      // Four signed bytes per cell: how far the skull and the eyes have moved, how far the body
      // has swayed, and how much wider it has become, all against the resting pose. Signed bytes
      // cover every pose measured and keep the whole table inside a few kilobytes.
      const track = new Int8Array(cells * 4);
      for (const index of animated) {
        const frame = index === 0 ? rest : cellAt(index);
        if (!frame) continue;
        track[index * 4] = clampByte(frame.skull - rest.skull);
        track[index * 4 + 1] = clampByte(frame.eye - rest.eye);
        track[index * 4 + 2] = clampByte(frame.centre - rest.centre);
        track[index * 4 + 3] = clampByte(Math.round((frame.width / rest.width - 1) * 100));
      }
      smooth(track, manifest.actions);
      motion[key] = Buffer.from(track.buffer).toString('base64');
    }
  }

  await fs.writeFile(path.join(root, 'sprites', 'body-metrics.json'), JSON.stringify(anchors, null, 0));
  await fs.writeFile(path.join(root, 'sprites', 'frame-motion.json'), JSON.stringify(motion, null, 0));
  return { anchors: Object.keys(anchors).length, tracks: Object.keys(motion).length };
}

const clampByte = (value) => Math.max(-127, Math.min(127, Math.round(value)));

/**
 * Median-of-three along each action, per channel.
 *
 * The landmarks are read off the pixels, so a single frame can disagree with its neighbours for
 * reasons that have nothing to do with where the head is — a blink darkens a different row, a
 * turned ear widens the silhouette. Left alone those one-frame spikes make a hat jump down over
 * the face and back, which looks worse than not tracking at all. A median throws out the odd
 * frame while leaving the real arc of the motion untouched.
 */
function smooth(track, actions) {
  for (const action of Object.values(actions || {})) {
    if (action.count < 3) continue;
    for (let channel = 0; channel < 4; channel += 1) {
      const source = Array.from({ length: action.count }, (_, i) => track[(action.start + i) * 4 + channel]);
      for (let i = 0; i < action.count; i += 1) {
        const window = [source[Math.max(0, i - 1)], source[i], source[Math.min(action.count - 1, i + 1)]].sort((a, b) => a - b);
        track[(action.start + i) * 4 + channel] = window[1];
      }
    }
  }
}

/** Fraction of the widest row a row must reach to count as skull rather than ear or horn. */
const SKULL_WIDTH_RATIO = 0.72;
/** Luminance below which a pixel reads as eye rather than fur. */
const EYE_LUMINANCE = 0.38;

/** Anchor lines and widths for one frame, in cell pixels. */
function landmarks(data, info, rect) {
  const { channels: C } = info;
  const stride = info.width * C;
  const alphaAt = (x, y) => data[(rect.top + y) * stride + (rect.left + x) * C + 3];
  const luminanceAt = (x, y) => {
    const i = (rect.top + y) * stride + (rect.left + x) * C;
    return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255;
  };

  let minX = rect.width;
  let minY = rect.height;
  let maxX = -1;
  let maxY = -1;
  const widths = new Int32Array(rect.height);
  for (let y = 0; y < rect.height; y += 1) {
    let rowMin = -1;
    let rowMax = -1;
    for (let x = 0; x < rect.width; x += 1) {
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

  return {
    skull, eye: eyeY, bottom: maxY + 1,
    centre: (minX + maxX + 1) / 2,
    width: maxX - minX + 1,
    // Widest row of the head region rather than the row halfway down it: a tapering muzzle or a
    // pointed mantle is narrower there than the eyes it has to sit above, and glasses fitted to
    // that would come out wider than the hat.
    head: headPeak,
    face: eyeMax - eyeMin + 1,
  };
}
