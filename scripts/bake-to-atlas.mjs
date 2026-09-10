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

import { crumbMask, erase, findCells } from './sheet-cells.mjs';

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

/**
 * The pixels of a frame that are sitting nowhere.
 *
 * Everything in a layer was lifted from a picture of this creature wearing the thing, so every part
 * of it either lies on the creature or hangs off its edge — which is to say, every part of it is
 * joined to something that touches the silhouette. A run of pixels alone in clear space is not the
 * accessory; it is a crumb the mask picked up, and in the room it reads as a speck floating beside
 * the pet. Only small pieces are dropped: a large one alone in the air is more likely a pendant
 * swinging clear than a mistake, and worth looking at rather than silently removing.
 */
function dropFloating(frame, pet, cell, share) {
  const near = new Uint8Array(cell * cell);
  for (let y = 0; y < cell; y += 1) {
    for (let x = 0; x < cell; x += 1) {
      const at = y * cell + x;
      if (pet[at]
        || (x > 0 && pet[at - 1]) || (x + 1 < cell && pet[at + 1])
        || (y > 0 && pet[at - cell]) || (y + 1 < cell && pet[at + cell])) near[at] = 1;
    }
  }
  let total = 0;
  for (let at = 0; at < cell * cell; at += 1) if (frame[at * 4 + 3] > 16) total += 1;
  const seen = new Uint8Array(cell * cell);
  let dropped = 0;
  for (let start = 0; start < cell * cell; start += 1) {
    if (seen[start] || frame[start * 4 + 3] <= 16) continue;
    const queue = [start];
    seen[start] = 1;
    const members = [start];
    let touches = false;
    while (queue.length) {
      const at = queue.pop();
      if (near[at]) touches = true;
      const x = at % cell, y = (at - x) / cell;
      for (const next of [x > 0 ? at - 1 : -1, x + 1 < cell ? at + 1 : -1, y > 0 ? at - cell : -1, y + 1 < cell ? at + cell : -1]) {
        if (next < 0 || seen[next] || frame[next * 4 + 3] <= 16) continue;
        seen[next] = 1; queue.push(next); members.push(next);
      }
    }
    if (touches || members.length > total * share) continue;
    for (const at of members) frame[at * 4 + 3] = 0;
    dropped += members.length;
  }
  return dropped;
}

const argv = process.argv.slice(2);
/**
 * Frames to leave the accessory out of.
 *
 * The layer is only ever as good as the sheet it was lifted from, and a sheet can put a thing
 * somewhere it does not belong: the dog's back-facing poses were drawn with its pendants swinging
 * at the hindquarters rather than round its neck. Nothing here can move that. What it can do is
 * decline to carry it, which on a creature that hides its collar behind its own ears from that
 * angle is what the frame should show anyway.
 *
 *   --skip 10,11,12,13,14
 */
const skipAt = argv.indexOf('--skip');
const SKIP = new Set(skipAt >= 0 ? String(argv[skipAt + 1]).split(',').map(Number) : []);
const [petFile, layerFile, outFile] = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
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
  // The neighbour's crumb is rubbed out of the pose before it is measured, exactly as the importer
  // does it — the transform is read off these bounds, so measuring a box the importer did not use
  // would put every accessory a pixel or two out in that pose.
  //
  // The same pixels come out of the accessory's own cut further down. Those pixels are not this
  // pose, so nothing worn on this pose belongs there either: the redraw altered the crumb along
  // with everything else it touched, the bake could only read that as something added, and the
  // result was a fleck of the neighbour's fur floating beside the sleeping dog.
  const box = boxes?.[index];
  const crumbs = box ? await crumbMask(petSheet, box) : null;
  const pose = await erase(await cut(petSheet, meta, index, boxes), crumbs, box);
  cells.push({ pose, crumbs, box, bounds: await contentBounds(pose) });
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
let floated = 0;
/** A piece alone in the air larger than this share of the frame is left for a person to judge. */
const FLOATING_SHARE = 0.2;
for (let index = 0; index < cells.length; index += 1) {
  const { bounds } = cells[index];
  if (!bounds || SKIP.has(index)) continue;
  const width = Math.max(1, Math.round(bounds.width * shared));
  const height = Math.max(1, Math.round(bounds.height * shared));
  const left = Math.round((CELL - width) / 2);
  const top = Math.max(0, Math.round(CELL * 0.97) - height);

  // Where the pose lands in its cell fixes where every pixel of the cut lands, accessory included.
  const across = width / bounds.width;
  const down = height / bounds.height;
  const offsetX = left - Math.round(bounds.left * across);
  const offsetY = top - Math.round(bounds.top * down);

  // A cape is drawn wider than the creature it hangs on, so a cut can reach past the cell on any
  // side. It is composited on a padded canvas and the cell taken back out of the middle, which
  // clips it to its own frame exactly as the room's camera would. The pose goes through the very
  // same path as the accessory, so the two land on each other to the pixel.
  const place = async (buffer) => {
    const size = await sharp(buffer).metadata();
    const scaledWidth = Math.max(1, Math.round(size.width * across));
    const scaledHeight = Math.max(1, Math.round(size.height * down));
    const scaled = await sharp(buffer).resize(scaledWidth, scaledHeight, { fit: 'fill' }).png().toBuffer();
    const margin = Math.max(0, -offsetX, -offsetY, offsetX + scaledWidth - CELL, offsetY + scaledHeight - CELL);
    const padded = await sharp({
      create: {
        width: CELL + margin * 2, height: CELL + margin * 2, channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }).composite([{ input: scaled, left: offsetX + margin, top: offsetY + margin }]).png().toBuffer();
    return sharp(padded).extract({ left: margin, top: margin, width: CELL, height: CELL }).png().toBuffer();
  };

  const piece = await erase(await cut(layerSheet, meta, index, boxes), cells[index].crumbs, cells[index].box);
  const frame = await sharp(await place(piece)).ensureAlpha().raw().toBuffer();
  const petFrame = await sharp(await place(cells[index].pose)).ensureAlpha().raw().toBuffer();
  const pet = new Uint8Array(CELL * CELL);
  for (let at = 0; at < CELL * CELL; at += 1) pet[at] = petFrame[at * 4 + 3] > 16 ? 1 : 0;
  floated += dropFloating(frame, pet, CELL, FLOATING_SHARE);
  const framed = await sharp(frame, { raw: { width: CELL, height: CELL, channels: 4 } }).png().toBuffer();
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
  + `  (scale ${shared.toFixed(4)})`
  + (floated ? `, ${floated} px floating dropped` : ''));
