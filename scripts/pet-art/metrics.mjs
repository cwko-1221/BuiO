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
async function contentBox(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
  log(`measured ${measured} content boxes${missing ? `, ${missing} missing` : ''}`);
  return { counts: { measured, missing } };
}
