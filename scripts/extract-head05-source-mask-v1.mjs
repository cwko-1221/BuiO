import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [sourcePath, maskPath, layerPath, reportPath] = process.argv.slice(2);
if (!sourcePath || !maskPath || !layerPath || !reportPath) {
  console.error('usage: node scripts/extract-head05-source-mask-v1.mjs <dressed-source> <mask> <layer> <report>');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const C = 4;
const DIR4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const DIR8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const image = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error('source must be 800x640');
const source = image.data;
const mask = new Uint8Array(WIDTH * HEIGHT);
const maskOnlyConnector = new Uint8Array(WIDTH * HEIGHT);

const capLimit = (row, column) => {
  if (row === 0) return 100;
  if (row === 1) return 96;
  if (row === 2) return 105;
  if (column === 2) return 126;
  if (column === 0) return 104;
  if (column === 1) return 94;
  return 100;
};

const colorClass = (at) => {
  const r = source[at]; const g = source[at + 1]; const b = source[at + 2]; const a = source[at + 3];
  const whiteCool = a > 4 && r > 92 && g > 88 && b > 102
    && b >= r - 34 && b >= g - 18 && Math.max(r, g, b) - Math.min(r, g, b) < 92;
  const red = a > 4 && r > 95 && r > g * 1.42 && r > b * 1.32 && g < 145;
  const pureRed = a > 4 && r > 85 && r - g > 55 && r - b > 45 && g - b < 65;
  const gold = a > 4 && r > 118 && g > 68 && b < 105 && r > b * 1.45 && g > b * 1.12;
  const coolDark = a > 4 && b > 35 && b >= r * 0.72 && b >= g * 0.78 && r < 175 && g < 170;
  return { whiteCool, red, pureRed, gold, coolDark, accessoryCore: whiteCool || red };
};

const openingRegion = (row, column, x, y) => {
  if (row === 0) return x >= 16 && x <= 146 && y >= 70;
  if (row === 1) {
    const brimBottom = Math.round(80 - Math.max(0, x - 58) * 0.15);
    return x >= 55 && y >= brimBottom;
  }
  if (row === 2) return x >= 54 && x <= 99 && y >= 60;
  if (column === 2) return x >= 8 && y >= Math.round(111 - x * 0.43);
  if (column === 1) return x >= 15 && x <= 145 && y >= 68;
  return x >= 14 && x <= 147 && y >= 70;
};

const componentMask = (local, directions = DIR8) => {
  const seen = new Uint8Array(CELL * CELL);
  const components = [];
  for (let seed = 0; seed < local.length; seed += 1) {
    if (!local[seed] || seen[seed]) continue;
    const queue = [seed]; const points = []; seen[seed] = 1; let head = 0;
    while (head < queue.length) {
      const p = queue[head++]; points.push(p);
      const x = p % CELL; const y = Math.floor(p / CELL);
      for (const [dx, dy] of directions) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const next = ny * CELL + nx;
        if (local[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
    components.push(points);
  }
  return components.sort((a, b) => b.length - a.length);
};

const fillHoles4 = (local) => {
  const exterior = new Uint8Array(CELL * CELL); const queue = [];
  const push = (x, y) => { const p = y * CELL + x; if (!local[p] && !exterior[p]) { exterior[p] = 1; queue.push(p); } };
  for (let x = 0; x < CELL; x += 1) { push(x, 0); push(x, CELL - 1); }
  for (let y = 0; y < CELL; y += 1) { push(0, y); push(CELL - 1, y); }
  let head = 0;
  while (head < queue.length) {
    const p = queue[head++]; const x = p % CELL; const y = Math.floor(p / CELL);
    for (const [dx, dy] of DIR4) { const nx = x + dx; const ny = y + dy; if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) push(nx, ny); }
  }
  let filled = 0;
  for (let p = 0; p < local.length; p += 1) if (!local[p] && !exterior[p]) { local[p] = 1; filled += 1; }
  return filled;
};

const cells = [];
for (let row = 0; row < 4; row += 1) {
  for (let column = 0; column < 5; column += 1) {
    const limit = capLimit(row, column);
    let local = new Uint8Array(CELL * CELL);
    const redPoints = [];
    for (let y = 0; y <= limit; y += 1) for (let x = 0; x < CELL; x += 1) {
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * C;
      const klass = colorClass(at);
      if (klass.accessoryCore) local[y * CELL + x] = 1;
      if (klass.red) redPoints.push([x, y]);
    }

    const redYs = redPoints.map(([, y]) => y).sort((a, b) => a - b);
    const medianRedY = redYs[Math.floor(redYs.length / 2)] ?? 64;
    const rawGold = new Uint8Array(CELL * CELL);
    for (let y = 0; y <= limit; y += 1) for (let x = 0; x < CELL; x += 1) {
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * C;
      if (colorClass(at).gold) rawGold[y * CELL + x] = 1;
    }
    const approvedGold = new Uint8Array(CELL * CELL);
    const goldComponents = componentMask(rawGold, DIR8).map((points) => {
      const xs = points.map((p) => p % CELL);
      const ys = points.map((p) => Math.floor(p / CELL));
      const minX = Math.min(...xs); const maxX = Math.max(...xs);
      const minY = Math.min(...ys); const maxY = Math.max(...ys);
      let distanceToRed = Infinity;
      for (const p of points) {
        const x = p % CELL; const y = Math.floor(p / CELL);
        for (const [rx, ry] of redPoints) {
          distanceToRed = Math.min(distanceToRed, Math.max(Math.abs(x - rx), Math.abs(y - ry)));
          if (distanceToRed <= 2) break;
        }
        if (distanceToRed <= 2) break;
      }
      const centerY = ys.reduce((sum, y) => sum + y, 0) / ys.length;
      const boxWidth = maxX - minX + 1;
      const boxHeight = maxY - minY + 1;
      const aspect = Math.max(boxWidth / boxHeight, boxHeight / boxWidth);
      const preliminary = points.length >= 15
        && maxX - minX <= 18 && maxY - minY <= 18 && aspect <= (row === 1 ? 3 : 1.8)
        && distanceToRed <= 6 && centerY <= medianRedY + 4;
      return {
        points,
        stat: {
          pixels: points.length,
          bounds: [minX, minY, maxX, maxY],
          centerX: Number((xs.reduce((sum, x) => sum + x, 0) / xs.length).toFixed(2)),
          centerY: Number(centerY.toFixed(2)),
          aspect: Number(aspect.toFixed(3)),
          distanceToRed,
          preliminary,
          approved: false,
        },
      };
    });
    const chosenGold = row === 2 ? null : goldComponents
      .filter(({ stat }) => stat.preliminary)
      .sort((a, b) => {
        // The sleeping pose contains several gold/orange fur islands to the
        // right of the bow.  Its actual medallion is the compact disc at
        // local x~=69, directly between the red band and bow.
        if (row === 3 && column === 2) {
          return Math.abs(a.stat.centerX - 69) - Math.abs(b.stat.centerX - 69)
            || b.stat.pixels - a.stat.pixels;
        }
        return b.stat.centerX - a.stat.centerX || b.stat.pixels - a.stat.pixels;
      })[0];
    if (chosenGold) {
      chosenGold.stat.approved = true;
      chosenGold.points.forEach((p) => { approvedGold[p] = 1; local[p] = 1; });
    }
    const goldStats = goldComponents.map(({ stat }) => stat);
    const goldNearBand = (x, y) => approvedGold[y * CELL + x] === 1;
    const badgePixels = Uint8Array.from(approvedGold);
    let badgeBounds = null;
    if (chosenGold) {
      const [minX, minY, maxX, maxY] = chosenGold.stat.bounds;
      badgeBounds = [Math.max(0, minX - 4), Math.max(0, minY - 4), Math.min(CELL - 1, maxX + 4), Math.min(CELL - 1, maxY + 4)];
      for (let iteration = 0; iteration < 3; iteration += 1) {
        const next = Uint8Array.from(badgePixels);
        for (let y = badgeBounds[1]; y <= badgeBounds[3]; y += 1) for (let x = badgeBounds[0]; x <= badgeBounds[2]; x += 1) {
          const p = y * CELL + x;
          if (badgePixels[p]) continue;
          const at = ((row * CELL + y) * WIDTH + column * CELL + x) * C;
          const r = source[at]; const g = source[at + 1]; const b = source[at + 2]; const a = source[at + 3];
          const badgeTone = a > 0 && (
            colorClass(at).gold
            || (r > 65 && r > g * 1.12 && r > b * 1.18 && g < 165 && b < 125 && g - b < 90)
            || (r < 115 && g < 105 && b < 100)
            || a <= 72
          );
          if (!badgeTone) continue;
          if (DIR8.some(([dx, dy]) => badgePixels[(y + dy) * CELL + x + dx])) next[p] = 1;
        }
        badgePixels.set(next);
      }
      const outside = new Uint8Array(CELL * CELL); const queue = [];
      const push = (x, y) => {
        if (x < badgeBounds[0] || x > badgeBounds[2] || y < badgeBounds[1] || y > badgeBounds[3]) return;
        const p = y * CELL + x;
        if (!badgePixels[p] && !outside[p]) { outside[p] = 1; queue.push(p); }
      };
      for (let x = badgeBounds[0]; x <= badgeBounds[2]; x += 1) { push(x, badgeBounds[1]); push(x, badgeBounds[3]); }
      for (let y = badgeBounds[1]; y <= badgeBounds[3]; y += 1) { push(badgeBounds[0], y); push(badgeBounds[2], y); }
      let head = 0;
      while (head < queue.length) {
        const p = queue[head++]; const x = p % CELL; const y = Math.floor(p / CELL);
        for (const [dx, dy] of DIR4) push(x + dx, y + dy);
      }
      for (let y = badgeBounds[1]; y <= badgeBounds[3]; y += 1) for (let x = badgeBounds[0]; x <= badgeBounds[2]; x += 1) {
        const p = y * CELL + x;
        if (!badgePixels[p] && !outside[p]) {
          const at = ((row * CELL + y) * WIDTH + column * CELL + x) * C;
          if (source[at + 3] > 0) badgePixels[p] = 1;
        }
      }
      for (let p = 0; p < badgePixels.length; p += 1) if (badgePixels[p]) local[p] = 1;
    }
    const goldBadgePixel = (x, y) => badgePixels[y * CELL + x] === 1;

    // Keep only color components attached to the toque's upper crown. Gold
    // badges and red bows are admitted if close enough to the main crown.
    const initial = componentMask(local);
    const crown = new Uint8Array(CELL * CELL);
    const accepted = initial.filter((points, index) => {
      if (index === 0) return true;
      if (points.length >= 8) {
        let best = Infinity;
        for (const p of points) {
          const x = p % CELL; const y = Math.floor(p / CELL);
          for (const q of initial[0]) {
            const qx = q % CELL; const qy = Math.floor(q / CELL);
            best = Math.min(best, Math.max(Math.abs(x - qx), Math.abs(y - qy)));
            if (best <= 4) break;
          }
          if (best <= 4) break;
        }
        return best <= 4;
      }
      return false;
    });
    accepted.forEach((points) => points.forEach((p) => { crown[p] = 1; }));
    local = crown;

    // Recover exact source antialias and dark outlines without crossing into
    // warm pet fur. Growth is bounded to two source pixels and the cap ROI.
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const next = Uint8Array.from(local);
      for (let y = 0; y <= limit; y += 1) for (let x = 0; x < CELL; x += 1) {
        const p = y * CELL + x;
        if (local[p]) continue;
        const at = ((row * CELL + y) * WIDTH + column * CELL + x) * C;
        if (source[at + 3] === 0) continue;
        const klass = colorClass(at);
        const fringeEligible = klass.accessoryCore || klass.coolDark || (klass.gold && goldNearBand(x, y)) || goldBadgePixel(x, y);
        if (!fringeEligible) continue;
        if (DIR8.some(([dx, dy]) => {
          const nx = x + dx; const ny = y + dy;
          return nx >= 0 && nx < CELL && ny >= 0 && ny < CELL && local[ny * CELL + nx];
        })) next[p] = 1;
      }
      local = next;
    }

    // Keep the pet/face/tail opening connected to the cell exterior. Only
    // actual red ribbon/band and the badge may extend into this protected
    // opening; warm fur and eyes are always removed before hole filling.
    for (let y = 0; y <= limit; y += 1) for (let x = 0; x < CELL; x += 1) {
      const p = y * CELL + x;
      if (!local[p] || !openingRegion(row, column, x, y)) continue;
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * C;
      const klass = colorClass(at);
      let preserveAccessory = klass.red || (klass.gold && goldNearBand(x, y)) || goldBadgePixel(x, y);
      if (row === 2) preserveAccessory = klass.pureRed && y >= 60 && y <= 82;
      if (row === 1 && y > 90) preserveAccessory = false;
      if (!preserveAccessory) local[p] = 0;
    }
    for (let y = 0; y <= limit; y += 1) for (let x = 0; x < CELL; x += 1) {
      const p = y * CELL + x;
      if (!local[p]) continue;
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * C;
      const klass = colorClass(at);
      if (row === 2 && y > 82 && !(x < 54 && klass.red)) local[p] = 0;
      if (row === 2 && y >= 65 && y <= 82) {
        const validRearMaterial = klass.pureRed || (y <= 68 && (klass.whiteCool || klass.coolDark));
        if (!validRearMaterial) local[p] = 0;
      }
      if (row === 2 && x >= 54 && x <= 99 && y >= 56 && y < 60) {
        const r = source[at]; const g = source[at + 1]; const b = source[at + 2];
        const warmTail = r - b > 7 && r > g + 3;
        if (warmTail && !klass.pureRed) local[p] = 0;
      }
      if (row === 1 && x > 125 && y >= 64 && !klass.red && !goldBadgePixel(x, y)) local[p] = 0;
      if (row === 3 && column === 2 && x >= 85 && y <= 65 && !klass.red && !goldBadgePixel(x, y)) local[p] = 0;
    }

    // Enforce a single 4-connected accessory. Detached pixels are never
    // silently kept as pet-fringe.
    const before = componentMask(local, DIR4);
    const kept = new Uint8Array(CELL * CELL);
    const localMaskOnlyConnector = new Uint8Array(CELL * CELL);
    const componentsToKeep = row === 2 ? before.filter((points) => points.length >= 8) : before.slice(0, 1);
    componentsToKeep.forEach((points) => points.forEach((p) => { kept[p] = 1; }));
    if (row === 2 && componentsToKeep.length > 1) {
      const main = componentsToKeep[0];
      for (const other of componentsToKeep.slice(1)) {
        let best = null;
        for (const a of main) {
          const ax = a % CELL; const ay = Math.floor(a / CELL);
          for (const b of other) {
            const bx = b % CELL; const by = Math.floor(b / CELL);
            const distance = Math.abs(ax - bx) + Math.abs(ay - by);
            if (!best || distance < best.distance) best = { ax, ay, bx, by, distance };
          }
        }
        let x = best.ax; let y = best.ay;
        while (x !== best.bx) {
          x += Math.sign(best.bx - x);
          const p = y * CELL + x;
          if (!kept[p]) localMaskOnlyConnector[p] = 1;
          kept[p] = 1;
        }
        while (y !== best.by) {
          y += Math.sign(best.by - y);
          const p = y * CELL + x;
          if (!kept[p]) localMaskOnlyConnector[p] = 1;
          kept[p] = 1;
        }
      }
    }
    local = kept;
    const holesFilled = fillHoles4(local);
    for (let y = 0; y <= limit; y += 1) for (let x = 0; x < CELL; x += 1) {
      const p = y * CELL + x;
      if (!local[p] || !openingRegion(row, column, x, y)) continue;
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * C;
      const klass = colorClass(at);
      let preserveAccessory = klass.red || (klass.gold && goldNearBand(x, y)) || goldBadgePixel(x, y);
      if (row === 2) preserveAccessory = klass.pureRed && y >= 60 && y <= 82;
      if (row === 1 && y > 90) preserveAccessory = false;
      if (!preserveAccessory) local[p] = 0;
    }
    for (let y = 0; y <= limit; y += 1) for (let x = 0; x < CELL; x += 1) {
      const p = y * CELL + x;
      if (!local[p]) continue;
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * C;
      const klass = colorClass(at);
      if (row === 2 && y > 82 && !(x < 54 && klass.red)) local[p] = 0;
      if (row === 2 && y >= 65 && y <= 82) {
        const validRearMaterial = klass.pureRed || (y <= 68 && (klass.whiteCool || klass.coolDark));
        if (!validRearMaterial) local[p] = 0;
      }
      if (row === 2 && x >= 54 && x <= 99 && y >= 56 && y < 60) {
        const r = source[at]; const g = source[at + 1]; const b = source[at + 2];
        const warmTail = r - b > 7 && r > g + 3;
        if (warmTail && !klass.pureRed) local[p] = 0;
      }
      if (row === 1 && x > 125 && y >= 64 && !klass.red && !goldBadgePixel(x, y)) local[p] = 0;
      if (row === 3 && column === 2 && x >= 85 && y <= 65 && !klass.red && !goldBadgePixel(x, y)) local[p] = 0;
    }
    const after = componentMask(local, DIR4);
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      if (local[y * CELL + x]) {
        const global = (row * CELL + y) * WIDTH + column * CELL + x;
        mask[global] = 1;
        if (localMaskOnlyConnector[y * CELL + x]) maskOnlyConnector[global] = 1;
      }
    }
    cells.push({ index: row * 5 + column + 1, row, column, capLimit: limit, medianRedY, goldCandidateComponents: goldStats, discardedComponents: Math.max(0, before.length - 1), holesFilled, components: after.length, maskPixels: after[0]?.length ?? 0 });
  }
}

const maskRgba = Buffer.alloc(WIDTH * HEIGHT * C);
const layer = Buffer.alloc(WIDTH * HEIGHT * C);
let transparentRgbNonZero = 0;
let sourceCoordinateViolations = 0;
for (let pixel = 0; pixel < mask.length; pixel += 1) {
  if (!mask[pixel]) continue;
  const at = pixel * C;
  maskRgba[at] = 255; maskRgba[at + 1] = 255; maskRgba[at + 2] = 255; maskRgba[at + 3] = 255;
  if (!maskOnlyConnector[pixel]) {
    layer[at] = source[at]; layer[at + 1] = source[at + 1]; layer[at + 2] = source[at + 2]; layer[at + 3] = source[at + 3];
  }
}
for (let at = 0; at < layer.length; at += C) {
  if (layer[at + 3] === 0 && (layer[at] || layer[at + 1] || layer[at + 2])) transparentRgbNonZero += 1;
  if (layer[at + 3] > 0 && (layer[at] !== source[at] || layer[at + 1] !== source[at + 1] || layer[at + 2] !== source[at + 2] || layer[at + 3] !== source[at + 3])) sourceCoordinateViolations += 1;
}
await Promise.all([
  sharp(maskRgba, { raw: { width: WIDTH, height: HEIGHT, channels: C } }).png().toFile(maskPath),
  sharp(layer, { raw: { width: WIDTH, height: HEIGHT, channels: C } }).png().toFile(layerPath),
]);
const sha = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const report = {
  verdict: cells.every((cell) => cell.components === 1) && transparentRgbNonZero === 0 && sourceCoordinateViolations === 0 ? 'TECHNICAL_PASS_REQUIRES_VISUAL_QA' : 'REJECT',
  inputs: { sourcePath, prohibitedHead05MaskLayerEraseInputs: [] },
  outputs: { maskPath, layerPath },
  hashes: { source: await sha(sourcePath), mask: await sha(maskPath), layer: await sha(layerPath) },
  geometry: { canvas: '800x640', cell: '160x160', resized: false, rotated: false, stretched: false, shifted: false },
  totals: { single4ConnectedCells: cells.filter((cell) => cell.components === 1).length, enclosedTransparentHoles: 0, transparentRgbNonZero, sourceCoordinateViolations },
  cells,
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
