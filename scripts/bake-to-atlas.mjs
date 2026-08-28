/**
 * Register a baked accessory layer onto the pet's own atlas, frame for frame.
 *
 * The old way of wearing a thing was to place a picture of it against measured landmarks and hope
 * it followed the creature through twenty poses. It does not: the creature turns, crouches, curls
 * up to sleep, and a sticker pinned to a landmark slides off it.
 *
 * A layer baked out of a redraw already sits exactly where it belongs — it was lifted from a
 * picture of this creature in these poses. So nothing needs placing. What it needs is to be put
 * through the very same per-cell transform the pet's atlas was built with, and then it can be
 * drawn straight over the matching frame with no arithmetic at all.
 *
 * That transform is not a scale of the whole sheet: import-art trims each pose to what was drawn,
 * scales every pose by one shared factor so the creature does not pulse as it walks, and stands it
 * on the cell's floor. So the pet sheet is measured here and the accessory is carried along by it —
 * measured from the pet, never from itself, because an accessory has its own extent and measuring
 * it would land it somewhere of its own.
 *
 *   node scripts/bake-to-atlas.mjs <pet-sheet.png> <layer.png> <out.webp>
 */
import path from 'node:path';
import sharp from 'sharp';

import { findCells } from './sheet-cells.mjs';

const CELL = 160;
const COLUMNS = 5;
const ROWS = 4;
/** The rows that are the creature standing, which set the shared scale. */
const STANDING_ROWS = 3;

/** Alpha bounding box, or null when nothing was drawn. Same rule as the importer's. */
async function contentBounds(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const cut = async (sheet, meta, index, boxes) => {
  const found = boxes?.[index];
  if (found) return sharp(sheet).extract(found).png().toBuffer();
  const width = Math.floor(meta.width / COLUMNS);
  const height = Math.floor(meta.height / ROWS);
  return sharp(sheet)
    .extract({ left: (index % COLUMNS) * width, top: Math.floor(index / COLUMNS) * height, width, height })
    .png().toBuffer();
};

const [petFile, layerFile, outFile] = process.argv.slice(2);
if (!petFile || !layerFile || !outFile) {
  console.error('usage: node scripts/bake-to-atlas.mjs <pet-sheet.png> <layer.png> <out.webp>');
  process.exit(1);
}

const petSheet = await sharp(petFile).ensureAlpha().png().toBuffer();
const layerSheet = await sharp(layerFile).ensureAlpha().png().toBuffer();
const meta = await sharp(petSheet).metadata();
const layerMeta = await sharp(layerSheet).metadata();
if (meta.width !== layerMeta.width || meta.height !== layerMeta.height) {
  throw new Error(`the layer is ${layerMeta.width}x${layerMeta.height} and the pet sheet is ${meta.width}x${meta.height}`);
}

// The cells are found on the pet sheet and used for both, so a pose that was drawn wide does not
// get one box on one sheet and a different box on the other.
const boxes = await findCells(petFile, COLUMNS, ROWS);
const cells = [];
for (let index = 0; index < COLUMNS * ROWS; index += 1) {
  const pose = await cut(petSheet, meta, index, boxes);
  cells.push({ pose, bounds: await contentBounds(pose) });
}
const drawn = cells.filter((entry) => entry.bounds);
if (!drawn.length) throw new Error('the pet sheet is empty');

// One scale for the whole sheet, from the middle of the standing poses — the importer's rule,
// restated here rather than guessed, because a different scale is a creature that pulses.
const standing = cells.slice(0, STANDING_ROWS * COLUMNS)
  .filter((entry) => entry.bounds).map((entry) => entry.bounds.height).sort((a, b) => a - b);
const reference = standing.length ? standing[Math.floor(standing.length / 2)]
  : Math.max(...drawn.map((entry) => entry.bounds.height));
const tallest = Math.max(...drawn.map((entry) => entry.bounds.height));
const widest = Math.max(...drawn.map((entry) => entry.bounds.width));
const shared = Math.min((CELL * 0.80) / reference, (CELL * 0.96) / tallest, (CELL * 0.94) / widest);

const tiles = [];
let worn = 0;
for (let index = 0; index < cells.length; index += 1) {
  const { bounds } = cells[index];
  if (!bounds) continue;
  const width = Math.max(1, Math.round(bounds.width * shared));
  const height = Math.max(1, Math.round(bounds.height * shared));
  const left = Math.round((CELL - width) / 2);
  const top = Math.max(0, Math.round(CELL * 0.97) - height);

  // Where the pose lands in its cell fixes where every pixel of the cut lands, accessory included.
  const across = width / bounds.width;
  const down = height / bounds.height;
  const piece = await cut(layerSheet, meta, index, boxes);
  const pieceMeta = await sharp(piece).metadata();
  const scaledWidth = Math.max(1, Math.round(pieceMeta.width * across));
  const scaledHeight = Math.max(1, Math.round(pieceMeta.height * down));
  const scaled = await sharp(piece).resize(scaledWidth, scaledHeight, { fit: 'fill' }).png().toBuffer();
  const offsetX = left - Math.round(bounds.left * across);
  const offsetY = top - Math.round(bounds.top * down);

  // A cape is drawn wider than the creature it hangs on, so the piece can reach past the cell on
  // any side. It is composited on a padded canvas and the cell taken back out of the middle,
  // which clips it to its own frame exactly as the room's camera would.
  const margin = Math.max(0, -offsetX, -offsetY, offsetX + scaledWidth - CELL, offsetY + scaledHeight - CELL);
  const padded = await sharp({
    create: {
      width: CELL + margin * 2, height: CELL + margin * 2, channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: scaled, left: offsetX + margin, top: offsetY + margin }]).png().toBuffer();
  const framed = await sharp(padded)
    .extract({ left: margin, top: margin, width: CELL, height: CELL }).png().toBuffer();
  if (!await contentBounds(framed)) continue;
  worn += 1;
  tiles.push({
    input: framed,
    left: (index % COLUMNS) * CELL,
    top: Math.floor(index / COLUMNS) * CELL,
  });
}

await sharp({
  create: { width: COLUMNS * CELL, height: ROWS * CELL, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).composite(tiles).webp({ lossless: true, alphaQuality: 100 }).toFile(outFile);

console.log(`${path.basename(outFile)}  ${worn} of ${COLUMNS * ROWS} frames carry the accessory`
  + `  (scale ${shared.toFixed(4)})`);
