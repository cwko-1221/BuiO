/** Build a same-coordinate chef-hat mask directly from the complete redraw. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [fullRedrawPath, outputPath] = process.argv.slice(2);
if (!fullRedrawPath || !outputPath) {
  console.error('usage: node scripts/extract-redrawn-chef-exact-mask.mjs <full-redraw> <output-mask>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const source = await sharp(fullRedrawPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (source.info.width !== WIDTH || source.info.height !== HEIGHT) throw new Error(`${fullRedrawPath} must be 800x640`);

const output = Buffer.alloc(WIDTH * HEIGHT * 4);
const neighbours8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const neighbours4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const stats = [];

for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const red = new Uint8Array(CELL * CELL);
    const fabric = new Uint8Array(CELL * CELL);
    const gold = new Uint8Array(CELL * CELL);
    let redMinX = CELL; let redMinY = CELL; let redMaxX = -1; let redMaxY = -1;

    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      const at = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
      if (source.data[at + 3] < 20) continue;
      const r = source.data[at]; const g = source.data[at + 1]; const b = source.data[at + 2];
      const isRed = r > 112 && g < 132 && b < 122 && r > g * 1.28 && r > b * 1.25;
      const coolWhite = r > 138 && g > 136 && b > 148
        && b > r * 0.91 && b > g * 0.95
        && Math.max(r, g, b) - Math.min(r, g, b) < 78;
      const lavender = r > 64 && g > 64 && b > 92 && b > r * 0.95 && b > g * 0.98;
      const isGold = r > 135 && g > 62 && b < 112 && r > b * 1.35 && g > b * 0.72;
      const local = y * CELL + x;
      if (isRed) {
        red[local] = 1;
        redMinX = Math.min(redMinX, x); redMinY = Math.min(redMinY, y);
        redMaxX = Math.max(redMaxX, x); redMaxY = Math.max(redMaxY, y);
      }
      if (coolWhite || lavender || isRed) fabric[local] = 1;
      if (isGold) gold[local] = 1;
    }
    if (redMaxX < 0) throw new Error(`missing chef band in row ${row}, column ${column}`);

    const bounds = {
      left: Math.max(0, redMinX - 26),
      right: Math.min(CELL - 1, redMaxX + 26),
      top: Math.max(0, redMinY - 76),
      bottom: Math.min(CELL - 1, redMaxY + 15),
    };
    const whiteBottomPadding = row === 3
      ? [12, 10, 13, 10, 10][column]
      : [7, 11, 17][row];
    const whiteBottom = Math.min(CELL - 1, redMinY + whiteBottomPadding);
    const selected = new Uint8Array(CELL * CELL);

    // Select source-coordinate fabric colours inside the hat's red-band bounds.
    // White below the band is pet fur, so only red/gold may extend lower.
    for (let y = bounds.top; y <= bounds.bottom; y += 1) for (let x = bounds.left; x <= bounds.right; x += 1) {
      const local = y * CELL + x;
      if ((fabric[local] && (y <= whiteBottom || red[local])) || gold[local]) selected[local] = 1;
    }

    // Gold is accepted only when it belongs to the band/medallion area, never
    // when it is isolated orange pet fur.
    for (let y = bounds.top; y <= bounds.bottom; y += 1) for (let x = bounds.left; x <= bounds.right; x += 1) {
      const local = y * CELL + x;
      if (!gold[local] || red[local]) continue;
      let nearRed = false;
      for (let oy = -8; oy <= 8 && !nearRed; oy += 1) for (let ox = -8; ox <= 8; ox += 1) {
        if (ox * ox + oy * oy > 64) continue;
        const nx = x + ox; const ny = y + oy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        if (red[ny * CELL + nx]) { nearRed = true; break; }
      }
      if (!nearRed) selected[local] = 0;
    }

    // One-pixel expansion captures the exact dark antialias outline. This does
    // not move or resample any source pixel.
    const barrier = new Uint8Array(CELL * CELL);
    for (let y = bounds.top; y <= bounds.bottom; y += 1) for (let x = bounds.left; x <= bounds.right; x += 1) {
      const local = y * CELL + x;
      if (!selected[local]) continue;
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
        const nx = x + ox; const ny = y + oy;
        if (nx < bounds.left || nx > bounds.right || ny < bounds.top || ny > bounds.bottom) continue;
        // Below the band, exclude warm fur even when adjacent to red fabric.
        if (ny > whiteBottom && !red[ny * CELL + nx] && !gold[ny * CELL + nx]) continue;
        barrier[ny * CELL + nx] = 1;
      }
    }

    // Fill only small enclosed ink details in the toque. The large rear tail
    // opening is intentionally above this size limit and remains transparent.
    const seen = new Uint8Array(CELL * CELL);
    for (let sy = bounds.top; sy <= whiteBottom; sy += 1) for (let sx = bounds.left; sx <= bounds.right; sx += 1) {
      const seed = sy * CELL + sx;
      if (barrier[seed] || seen[seed]) continue;
      const queue = [seed]; const hole = []; seen[seed] = 1; let head = 0; let touches = false;
      while (head < queue.length) {
        const local = queue[head++]; hole.push(local);
        const x = local % CELL; const y = Math.floor(local / CELL);
        if (x === bounds.left || x === bounds.right || y === bounds.top || y === whiteBottom) touches = true;
        for (const [ox, oy] of neighbours4) {
          const nx = x + ox; const ny = y + oy;
          if (nx < bounds.left || nx > bounds.right || ny < bounds.top || ny > whiteBottom) continue;
          const next = ny * CELL + nx;
          if (barrier[next] || seen[next]) continue;
          seen[next] = 1; queue.push(next);
        }
      }
      if (!touches && hole.length <= 150) for (const local of hole) barrier[local] = 1;
    }

    // Remove tiny disconnected colour noise; the bow and medallion are much larger.
    const componentSeen = new Uint8Array(CELL * CELL);
    for (let sy = bounds.top; sy <= bounds.bottom; sy += 1) for (let sx = bounds.left; sx <= bounds.right; sx += 1) {
      const seed = sy * CELL + sx;
      if (!barrier[seed] || componentSeen[seed]) continue;
      const queue = [seed]; const pixels = []; componentSeen[seed] = 1; let head = 0;
      while (head < queue.length) {
        const local = queue[head++]; pixels.push(local);
        const x = local % CELL; const y = Math.floor(local / CELL);
        for (const [ox, oy] of neighbours8) {
          const nx = x + ox; const ny = y + oy;
          if (nx < bounds.left || nx > bounds.right || ny < bounds.top || ny > bounds.bottom) continue;
          const next = ny * CELL + nx;
          if (!barrier[next] || componentSeen[next]) continue;
          componentSeen[next] = 1; queue.push(next);
        }
      }
      if (pixels.length < 16) for (const local of pixels) barrier[local] = 0;
    }

    let maskPixels = 0;
    for (let y = bounds.top; y <= bounds.bottom; y += 1) for (let x = bounds.left; x <= bounds.right; x += 1) {
      const local = y * CELL + x;
      if (!barrier[local]) continue;
      const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * 4);
      if (source.data[sourceAt + 3] < 8) continue;
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * 4;
      output[at] = 255; output[at + 1] = 255; output[at + 2] = 255; output[at + 3] = 255;
      maskPixels += 1;
    }
    stats.push({ row, column, bounds, whiteBottom, maskPixels });
  }
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await sharp(output, { raw: { width: WIDTH, height: HEIGHT, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(outputPath);
console.log(JSON.stringify({ outputPath, transformed: false, stats }, null, 2));
