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
