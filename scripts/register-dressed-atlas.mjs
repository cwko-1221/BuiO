/** Register every complete dressed-pet cell to the shipped nude-pet cell before mask extraction. */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [basePath, dressedPath, guidePath, outputFolder, stemArg, registrationMode = 'silhouette'] = process.argv.slice(2);
if (!basePath || !dressedPath || !guidePath || !outputFolder) {
  console.error('usage: node scripts/register-dressed-atlas.mjs <base> <dressed> <guide> <output-folder>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const stem = stemArg || path.basename(dressedPath).replace(/-dressed(?:-atlas)?(?:-v\d+)?\.[^.]+$/i, '');
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT) throw new Error(`${input} must be 800x640`);
  return result;
};
const base = await read(basePath);
const dressed = await read(dressedPath);
const guide = await read(guidePath);

const largestComponent = (source, column, row) => {
  const seen = new Uint8Array(CELL * CELL);
  let best = null;
  const atAlpha = (x, y) => source.data[(((row * CELL + y) * WIDTH + column * CELL + x) * source.info.channels) + 3];
  for (let sy = 0; sy < CELL; sy += 1) {
    for (let sx = 0; sx < CELL; sx += 1) {
      const seed = sy * CELL + sx;
      if (seen[seed] || atAlpha(sx, sy) < 40) continue;
      const queue = [seed];
      seen[seed] = 1;
      let head = 0;
      let count = 0;
      let minX = sx; let maxX = sx; let minY = sy; let maxY = sy;
      while (head < queue.length) {
        const index = queue[head++];
        const x = index % CELL;
        const y = Math.floor(index / CELL);
        count += 1;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
          const neighbour = ny * CELL + nx;
          if (seen[neighbour] || atAlpha(nx, ny) < 40) continue;
          seen[neighbour] = 1;
          queue.push(neighbour);
        }
      }
      if (!best || count > best.count) best = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, count };
    }
  }
  return best;
};

const largestComponentWithoutGuide = (source, guideSource, column, row) => {
  const seen = new Uint8Array(CELL * CELL);
  let best = null;
  const atAlpha = (x, y) => {
    const sourceAt = (((row * CELL + y) * WIDTH + column * CELL + x) * source.info.channels) + 3;
    if (source.data[sourceAt] < 40) return 0;
    for (let oy = -14; oy <= 14; oy += 1) {
      for (let ox = -14; ox <= 14; ox += 1) {
        if (ox * ox + oy * oy > 196) continue;
        const nx = x + ox;
        const ny = y + oy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const guideAt = (((row * CELL + ny) * WIDTH + column * CELL + nx) * guideSource.info.channels) + 3;
        if (guideSource.data[guideAt] > 8) return 0;
      }
    }
    return source.data[sourceAt];
  };
  for (let sy = 0; sy < CELL; sy += 1) {
    for (let sx = 0; sx < CELL; sx += 1) {
      const seed = sy * CELL + sx;
      if (seen[seed] || atAlpha(sx, sy) < 40) continue;
      const queue = [seed];
      seen[seed] = 1;
      let head = 0;
      let count = 0;
      let minX = sx; let maxX = sx; let minY = sy; let maxY = sy;
      while (head < queue.length) {
        const index = queue[head++];
        const x = index % CELL;
        const y = Math.floor(index / CELL);
        count += 1;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
          if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
          const neighbour = ny * CELL + nx;
          if (seen[neighbour] || atAlpha(nx, ny) < 40) continue;
          seen[neighbour] = 1;
          queue.push(neighbour);
        }
      }
      if (!best || count > best.count) {
        best = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, count };
      }
    }
  }
  return best;
};

/** Bounds of the warm cream/orange pet fur, deliberately excluding blue/pink wings and leather. */
const furBounds = (source, column, row, minimumY = 0) => {
  const matches = new Uint8Array(CELL * CELL);
  for (let y = minimumY; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const at = (((row * CELL + y) * WIDTH + column * CELL + x) * source.info.channels);
      if (source.data[at + 3] < 40) continue;
      const r = source.data[at]; const g = source.data[at + 1]; const b = source.data[at + 2];
      if (r + g + b < 555 || r < b * 1.08 || g < b * 1.03) continue;
      matches[y * CELL + x] = 1;
    }
  }
  const seen = new Uint8Array(CELL * CELL);
  const components = [];
  for (let sy = minimumY; sy < CELL; sy += 1) {
    for (let sx = 0; sx < CELL; sx += 1) {
      const seed = sy * CELL + sx;
      if (seen[seed] || !matches[seed]) continue;
      const queue = [seed];
      seen[seed] = 1;
      let head = 0;
      let count = 0;
      let minX = sx; let minY = sy; let maxX = sx; let maxY = sy;
      while (head < queue.length) {
        const local = queue[head++];
        const x = local % CELL;
        const y = Math.floor(local / CELL);
        count += 1;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= CELL || ny < minimumY || ny >= CELL) continue;
          const neighbour = ny * CELL + nx;
          if (seen[neighbour] || !matches[neighbour]) continue;
          seen[neighbour] = 1;
          queue.push(neighbour);
        }
      }
      components.push({ x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, count });
    }
  }
  const largest = components.reduce((best, component) => (
    !best || component.count > best.count ? component : best
  ), null);
  if (!largest || largest.count <= 24) return null;

  // Generated cells can bleed one or two warm antialias pixels across a 160 px frame boundary.
  // Keep the pet's legitimate disconnected paws, chest and tail colour islands, but reject tiny
  // edge-touching islands that belong to the neighbouring cell.
  const selected = components.filter((component) => {
    const touchesSide = component.x <= 2 || component.x + component.width >= CELL - 2;
    return component.count >= Math.max(8, largest.count * 0.02)
      && (!touchesSide || component === largest || component.count >= largest.count * 0.5);
  });
  let minX = CELL; let minY = CELL; let maxX = -1; let maxY = -1; let count = 0;
  for (const component of selected) {
    minX = Math.min(minX, component.x);
    minY = Math.min(minY, component.y);
    maxX = Math.max(maxX, component.x + component.width - 1);
    maxY = Math.max(maxY, component.y + component.height - 1);
    count += component.count;
  }
  return count > 24 ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, count } : null;
};

const dressedLayers = [];
const guideLayers = [];
const transforms = [];
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const usesGuideAnchor = registrationMode === 'guide-scale';
    const usesBodyAnchor = registrationMode === 'body-translate' || registrationMode === 'body-scale';
    const usesFurAnchor = registrationMode === 'fur' || registrationMode === 'fur-translate' || usesBodyAnchor;
    const target = usesGuideAnchor
      ? largestComponent(base, column, row)
      : usesFurAnchor
        ? furBounds(base, column, row, usesBodyAnchor ? 64 : 0) ?? largestComponent(base, column, row)
        : largestComponent(base, column, row);
    const source = usesGuideAnchor
      ? largestComponentWithoutGuide(dressed, guide, column, row) ?? largestComponent(dressed, column, row)
      : usesFurAnchor
        ? furBounds(dressed, column, row, usesBodyAnchor ? 64 : 0) ?? largestComponent(dressed, column, row)
        : largestComponent(dressed, column, row);
    if (!target || !source) continue;
    // The alpha component can omit a detached tail tip or fringe. Give the source a tiny safe
    // margin and map the same rectangle for both dressed art and its isolation guide.
    const margin = 2;
    const sourceBox = {
      left: Math.max(0, source.x - margin),
      top: Math.max(0, source.y - margin),
      width: Math.min(CELL, source.x + source.width + margin) - Math.max(0, source.x - margin),
      height: Math.min(CELL, source.y + source.height + margin) - Math.max(0, source.y - margin),
    };
    const targetBox = {
      left: Math.max(0, target.x - margin),
      top: Math.max(0, target.y - margin),
      width: Math.min(CELL, target.x + target.width + margin) - Math.max(0, target.x - margin),
      height: Math.min(CELL, target.y + target.height + margin) - Math.max(0, target.y - margin),
    };
    let registeredDressed;
    let registeredGuide;
    let position;
    if (registrationMode === 'body-scale' || registrationMode === 'guide-scale') {
      const scale = Math.min(target.width / source.width, target.height / source.height);
      const scaledWidth = Math.max(1, Math.round(CELL * scale));
      const scaledHeight = Math.max(1, Math.round(CELL * scale));
      const destinationLeft = Math.round(
        target.x + target.width / 2 - (source.x + source.width / 2) * scale,
      );
      const destinationTop = Math.round(
        target.y + target.height - (source.y + source.height) * scale,
      );
      const cropLeft = Math.max(0, -destinationLeft);
      const cropTop = Math.max(0, -destinationTop);
      const targetLeft = Math.max(0, destinationLeft);
      const targetTop = Math.max(0, destinationTop);
      const width = Math.min(scaledWidth - cropLeft, CELL - targetLeft);
      const height = Math.min(scaledHeight - cropTop, CELL - targetTop);
      const cellExtract = { left: column * CELL, top: row * CELL, width: CELL, height: CELL };
      const [scaledDressed, scaledGuide] = await Promise.all([
        sharp(dressedPath).extract(cellExtract).resize(scaledWidth, scaledHeight, {
          fit: 'fill', kernel: sharp.kernel.lanczos3,
        }).png().toBuffer(),
        sharp(guidePath).extract(cellExtract).resize(scaledWidth, scaledHeight, {
          fit: 'fill', kernel: sharp.kernel.lanczos3,
        }).png().toBuffer(),
      ]);
      [registeredDressed, registeredGuide] = await Promise.all([
        sharp(scaledDressed).extract({ left: cropLeft, top: cropTop, width, height }).png().toBuffer(),
        sharp(scaledGuide).extract({ left: cropLeft, top: cropTop, width, height }).png().toBuffer(),
      ]);
      position = { left: column * CELL + targetLeft, top: row * CELL + targetTop };
      transforms.push({
        column,
        row,
        source: sourceBox,
        target: targetBox,
        scale,
        destinationLeft,
        destinationTop,
      });
    } else if (registrationMode === 'fur-translate' || registrationMode === 'body-translate') {
      const dx = Math.round(target.x + target.width / 2 - (source.x + source.width / 2));
      const dy = Math.round(target.y + target.height - (source.y + source.height));
      const sourceLeft = Math.max(0, -dx);
      const sourceTop = Math.max(0, -dy);
      const targetLeft = Math.max(0, dx);
      const targetTop = Math.max(0, dy);
      const width = CELL - Math.abs(dx);
      const height = CELL - Math.abs(dy);
      const extract = {
        left: column * CELL + sourceLeft,
        top: row * CELL + sourceTop,
        width,
        height,
      };
      [registeredDressed, registeredGuide] = await Promise.all([
        sharp(dressedPath).extract(extract).png().toBuffer(),
        sharp(guidePath).extract(extract).png().toBuffer(),
      ]);
      position = { left: column * CELL + targetLeft, top: row * CELL + targetTop };
      transforms.push({ column, row, source: sourceBox, target: targetBox, dx, dy });
    } else {
      const extract = {
        left: column * CELL + sourceBox.left,
        top: row * CELL + sourceBox.top,
        width: sourceBox.width,
        height: sourceBox.height,
      };
      [registeredDressed, registeredGuide] = await Promise.all([
        sharp(dressedPath).extract(extract).resize(targetBox.width, targetBox.height, { fit: 'fill', kernel: sharp.kernel.lanczos3 }).png().toBuffer(),
        sharp(guidePath).extract(extract).resize(targetBox.width, targetBox.height, { fit: 'fill', kernel: sharp.kernel.lanczos3 }).png().toBuffer(),
      ]);
      position = { left: column * CELL + targetBox.left, top: row * CELL + targetBox.top };
      transforms.push({ column, row, source: sourceBox, target: targetBox });
    }
    dressedLayers.push({ input: registeredDressed, ...position });
    guideLayers.push({ input: registeredGuide, ...position });
  }
}

const canvas = () => sharp({ create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
await fs.mkdir(outputFolder, { recursive: true });
const dressedOutput = path.join(outputFolder, `${stem}-registered-dressed.png`);
const guideOutput = path.join(outputFolder, `${stem}-registered-guide.png`);
await canvas().composite(dressedLayers).png().toFile(dressedOutput);
await canvas().composite(guideLayers).png().toFile(guideOutput);
console.log(JSON.stringify({ dressedOutput, guideOutput, registrationMode, transforms }, null, 2));
