/**
 * Find the pieces on a sprite sheet by what was drawn, not by where a cell would be.
 *
 * A sheet is briefed as a strict grid, and a generator lays one out approximately: on the first
 * furniture sheet the pet bed was drawn wider than its column, so cutting the sheet into equal
 * cells sliced every piece down the middle and left the offcut in its neighbour. What is reliable
 * is that each piece sits roughly where its cell is and is surrounded by transparency — so the
 * grid says which piece is which, and the drawing itself says where that piece begins and ends.
 */
import sharp from 'sharp';

const ALPHA = 16;          // below this a pixel is background
const SPECK = 0.00015;     // blobs smaller than this fraction of the sheet are dust

/**
 * A box per cell, in source pixels, in reading order. A cell nothing was drawn in comes back null
 * rather than being skipped, so cell numbers keep meaning what the brief said they mean.
 */
export async function findCells(file, columns, rows) {
  const meta = await sharp(file).metadata();
  const scale = Math.min(1, 1024 / Math.max(meta.width, meta.height));
  const w = Math.round(meta.width * scale), h = Math.round(meta.height * scale);
  const { data } = await sharp(file).ensureAlpha().resize(w, h, { fit: 'fill' })
    .raw().toBuffer({ resolveWithObject: true });

  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const blobs = [];
  for (let start = 0; start < w * h; start += 1) {
    if (seen[start] || data[start * 4 + 3] < ALPHA) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    let left = w, right = 0, top = h, bottom = 0, count = 0, sumX = 0, sumY = 0;
    while (head < tail) {
      const at = queue[head++];
      const x = at % w, y = (at - x) / w;
      count += 1; sumX += x; sumY += y;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const next = ny * w + nx;
        if (seen[next] || data[next * 4 + 3] < ALPHA) continue;
        seen[next] = 1;
        queue[tail++] = next;
      }
    }
    if (count >= SPECK * w * h) blobs.push({ left, top, right, bottom, count, x: sumX / count, y: sumY / count });
  }

  // Which cell a blob belongs to is decided by where its weight is, not by where its edges
  // reach. That is what lets a piece be wider than its column without being claimed by the
  // next one along.
  const grouped = Array.from({ length: columns * rows }, () => []);
  for (const blob of blobs) {
    const column = Math.min(columns - 1, Math.max(0, Math.floor((blob.x / w) * columns)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor((blob.y / h) * rows)));
    grouped[row * columns + column].push(blob);
  }

  // Within a cell the largest blob is the piece, and another blob only joins it if it is close
  // by — a lamp shade clear of its base, the books standing in a rack. A piece drawn wider than
  // its column leaves a sliver over the boundary whose weight lands in the next cell along, and
  // taking the whole cell as one box swept that sliver into its neighbour: every wearable came
  // out with a crumb of the hat before it floating off to the left.
  const reach = 0.12 * (w / columns);
  const cells = grouped.map((blobsHere) => {
    if (!blobsHere.length) return null;
    const [core, ...rest] = [...blobsHere].sort((a, b) => b.count - a.count);
    let box = { left: core.left, top: core.top, right: core.right, bottom: core.bottom };
    let joined = true;
    while (joined) {
      joined = false;
      for (let i = rest.length - 1; i >= 0; i -= 1) {
        const blob = rest[i];
        const apart = Math.max(box.left - blob.right, blob.left - box.right,
          box.top - blob.bottom, blob.top - box.bottom);
        if (apart > reach) continue;
        box = {
          left: Math.min(box.left, blob.left), top: Math.min(box.top, blob.top),
          right: Math.max(box.right, blob.right), bottom: Math.max(box.bottom, blob.bottom),
        };
        rest.splice(i, 1);
        joined = true;
      }
    }
    return box;
  });
  // Two pieces drawn close enough to touch are one run of opaque pixels, so one cell takes both
  // and its neighbour comes up empty — the dragon wings and the cloud cape are joined at a wing
  // tip. Nothing in the drawing separates them, but the sheet is still a grid, so an empty cell
  // whose neighbour has spilled well into it takes back its own side of the boundary.
  const cellWidth = w / columns, cellHeight = h / rows;
  const spilled = 0.25;
  for (let index = 0; index < cells.length; index += 1) {
    if (cells[index]) continue;
    const column = index % columns, row = (index - column) / columns;
    const near = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of near) {
      const nx = column + dx, ny = row + dy;
      if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      const neighbour = cells[ny * columns + nx];
      if (!neighbour) continue;
      const left = column * cellWidth, right = (column + 1) * cellWidth;
      const top = row * cellHeight, bottom = (row + 1) * cellHeight;
      const over = Math.min(neighbour.right, right) - Math.max(neighbour.left, left);
      const under = Math.min(neighbour.bottom, bottom) - Math.max(neighbour.top, top);
      if (dx && (over < spilled * cellWidth || under <= 0)) continue;
      if (dy && (under < spilled * cellHeight || over <= 0)) continue;
      if (dx < 0) {
        cells[index] = { left, top: neighbour.top, right: neighbour.right, bottom: neighbour.bottom };
        neighbour.right = left - 1;
      } else if (dx > 0) {
        cells[index] = { left: neighbour.left, top: neighbour.top, right: right - 1, bottom: neighbour.bottom };
        neighbour.left = right;
      } else if (dy < 0) {
        cells[index] = { left: neighbour.left, top, right: neighbour.right, bottom: neighbour.bottom };
        neighbour.bottom = top - 1;
      } else {
        cells[index] = { left: neighbour.left, top: neighbour.top, right: neighbour.right, bottom: bottom - 1 };
        neighbour.top = bottom;
      }
      break;
    }
  }
  const back = 1 / scale;
  return cells.map((box) => box && {
    left: Math.max(0, Math.round(box.left * back)),
    top: Math.max(0, Math.round(box.top * back)),
    width: Math.min(meta.width, Math.round((box.right - box.left + 1) * back)),
    height: Math.min(meta.height, Math.round((box.bottom - box.top + 1) * back)),
  });
}

/**
 * Which pixels of a cut belong to the pose next door.
 *
 * A cell's box is found from what was drawn, but a box is a rectangle: where the pose next door
 * was drawn past its own column, whatever part of it falls inside this rectangle is extracted too,
 * and then scaled and seated along with the pose. In the room that reads as a chip of fur floating
 * beside the pet.
 *
 * What tells a crumb from the pose's own detached marks — the strokes beside a startled head, a
 * spark, a bubble — is not that it is separate, and not that it reaches the edge of the cut. It is
 * that it *carries on outside it*, and that most of it is out there. So the region is read large
 * enough to see past the box on every side, and a piece is marked only when more of it lies
 * outside the box than in: a crumb is the corner of something drawn next door, while a mark of the
 * pose's own that the box happens to clip is mostly inside it and stays.
 *
 * The size guard is there because a big enough piece running off the edge is more likely the pose
 * itself, split by a gap in the drawing, than a crumb of its neighbour.
 */
export async function crumbMask(sheet, box) {
  const meta = await sharp(sheet).metadata();
  // Wide enough to see how much of a piece is out there, not merely that some of it is.
  const margin = Math.round(Math.max(box.width, box.height) / 2);
  const left = Math.max(0, box.left - margin);
  const top = Math.max(0, box.top - margin);
  const around = {
    left,
    top,
    width: Math.min(meta.width - left, box.width + (box.left - left) + margin),
    height: Math.min(meta.height - top, box.height + (box.top - top) + margin),
  };
  const inset = { x: box.left - left, y: box.top - top };
  const { data, info } = await sharp(sheet).ensureAlpha().extract(around).raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const outside = (x, y) => x < inset.x || y < inset.y || x >= inset.x + box.width || y >= inset.y + box.height;

  const label = new Int32Array(w * h).fill(-1);
  const queue = new Int32Array(w * h);
  const parts = [];
  for (let start = 0; start < w * h; start += 1) {
    if (label[start] >= 0 || data[start * 4 + 3] < ALPHA) continue;
    const id = parts.length;
    let head = 0, tail = 0, count = 0, inner = 0, spills = false;
    queue[tail++] = start;
    label[start] = id;
    while (head < tail) {
      const at = queue[head++];
      const x = at % w, y = (at - x) / w;
      count += 1;
      if (outside(x, y)) spills = true; else inner += 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const next = ny * w + nx;
        if (label[next] >= 0 || data[next * 4 + 3] < ALPHA) continue;
        label[next] = id;
        queue[tail++] = next;
      }
    }
    parts.push({ id, count, inner, spills });
  }
  const core = parts.reduce((a, b) => (b.inner > a.inner ? b : a), { inner: -1 });
  const drop = new Set(parts
    .filter((part) => part !== core && part.inner > 0 && part.spills
      && part.inner < core.inner * 0.25 && part.count - part.inner > part.inner)
    .map((part) => part.id));
  if (!drop.size) return null;

  const mask = new Uint8Array(box.width * box.height);
  for (let y = 0; y < box.height; y += 1) {
    for (let x = 0; x < box.width; x += 1) {
      if (drop.has(label[(y + inset.y) * w + (x + inset.x)])) mask[y * box.width + x] = 1;
    }
  }
  return mask;
}

/** Clear the marked pixels out of a cut of the same size. */
export async function erase(cut, mask, box) {
  if (!mask) return cut;
  const { data } = await sharp(cut).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let at = 0; at < box.width * box.height; at += 1) if (mask[at]) data[at * 4 + 3] = 0;
  return sharp(data, { raw: { width: box.width, height: box.height, channels: 4 } }).png().toBuffer();
}

/** The cut with the neighbour's crumbs taken out of it. */
export async function keepPose(sheet, box, cut) {
  if (!box) return cut;
  return erase(cut, await crumbMask(sheet, box), box);
}
