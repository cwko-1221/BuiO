import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [fullRawPath, isolatedRawPath, fullNormalizedPath, isolatedReferencePath, layerPath, maskPath, reportPath] = process.argv.slice(2);
if (!fullRawPath || !isolatedRawPath || !fullNormalizedPath || !isolatedReferencePath || !layerPath || !maskPath || !reportPath) {
  console.error('usage: node scripts/normalize-face01-phase-c-v3.mjs <full-raw> <isolated-raw> <full-normalized> <isolated-normalized-reference> <clean-layer> <binary-mask> <qa-json>');
  process.exit(1);
}
if ([fullRawPath, isolatedRawPath].some((input) => /face-01-(?:mask|layer|patch|erase|output)/i.test(input))) {
  throw new Error('Phase C may read only the two new v3 raw image-generation atlases');
}

const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const CHANNELS = 4;
const DIR4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const DIR8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const normalize = async (input) => sharp(input).ensureAlpha().resize(WIDTH, HEIGHT, { fit: 'fill', kernel: sharp.kernel.lanczos3 }).png().toBuffer();
const [fullPng, isolatedPng] = await Promise.all([normalize(fullRawPath), normalize(isolatedRawPath)]);
await Promise.all([fs.writeFile(fullNormalizedPath, fullPng), fs.writeFile(isolatedReferencePath, isolatedPng)]);
const [{ data: full }, { data: isolated }] = await Promise.all([
  sharp(fullPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  sharp(isolatedPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
]);

const seedMask = new Uint8Array(WIDTH * HEIGHT);
for (let pixel = 0; pixel < seedMask.length; pixel += 1) {
  const at = pixel * CHANNELS;
  const r = isolated[at]; const g = isolated[at + 1]; const b = isolated[at + 2];
  const maximum = Math.max(r, g, b); const minimum = Math.min(r, g, b); const chroma = maximum - minimum;
  const gold = r >= g + 6 && g >= b + 4 && r > 90 && chroma >= 16;
  const darkOutline = maximum < 170 && chroma >= 12 && r >= g - 3 && g >= b - 8;
  seedMask[pixel] = Number(gold || darkOutline);
}

const componentPoints = (local) => {
  const seen = new Uint8Array(CELL * CELL); const components = [];
  for (let seed = 0; seed < local.length; seed += 1) {
    if (!local[seed] || seen[seed]) continue;
    const queue = [seed]; const points = []; seen[seed] = 1; let head = 0;
    while (head < queue.length) {
      const p = queue[head++]; const x = p % CELL; const y = Math.floor(p / CELL); points.push(p);
      for (const [dx, dy] of DIR4) {
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

const enclosedBackground = (local) => {
  const exterior = new Uint8Array(CELL * CELL); const queue = [];
  const push = (x, y) => { const p = y * CELL + x; if (!local[p] && !exterior[p]) { exterior[p] = 1; queue.push(p); } };
  for (let x = 0; x < CELL; x += 1) { push(x, 0); push(x, CELL - 1); }
  for (let y = 0; y < CELL; y += 1) { push(0, y); push(CELL - 1, y); }
  let head = 0;
  while (head < queue.length) {
    const p = queue[head++]; const x = p % CELL; const y = Math.floor(p / CELL);
    for (const [dx, dy] of DIR4) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) push(nx, ny);
    }
  }
  const seen = new Uint8Array(CELL * CELL); const holes = [];
  for (let seed = 0; seed < local.length; seed += 1) {
    if (local[seed] || exterior[seed] || seen[seed]) continue;
    const queue2 = [seed]; const points = []; seen[seed] = 1; let cursor = 0;
    while (cursor < queue2.length) {
      const p = queue2[cursor++]; const x = p % CELL; const y = Math.floor(p / CELL); points.push(p);
      for (const [dx, dy] of DIR4) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const next = ny * CELL + nx;
        if (!local[next] && !exterior[next] && !seen[next]) { seen[next] = 1; queue2.push(next); }
      }
    }
    holes.push(points);
  }
  return holes.sort((a, b) => b.length - a.length);
};

const cleanMask = new Uint8Array(WIDTH * HEIGHT);
const cells = [];
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  let local = new Uint8Array(CELL * CELL);
  if (row !== 2) {
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      local[y * CELL + x] = seedMask[(row * CELL + y) * WIDTH + column * CELL + x];
    }
    // Retain only the principal glasses component; tiny checker/noise matches
    // are never admitted as separate islands.
    const principal = componentPoints(local)[0] ?? [];
    local.fill(0); principal.forEach((p) => { local[p] = 1; });
    // Recover one pixel of pale antialias/highlight only where it is supported
    // on two sides by the established glasses material.
    const grown = Uint8Array.from(local);
    for (let y = 1; y < CELL - 1; y += 1) for (let x = 1; x < CELL - 1; x += 1) {
      const p = y * CELL + x;
      if (local[p]) continue;
      const neighbors = DIR8.reduce((sum, [dx, dy]) => sum + local[(y + dy) * CELL + x + dx], 0);
      if (neighbors < 2) continue;
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS;
      const r = isolated[at]; const g = isolated[at + 1]; const b = isolated[at + 2];
      if (r >= g - 2 && g >= b - 5 && Math.max(r, g, b) - Math.min(r, g, b) >= 4) grown[p] = 1;
    }
    local = grown;
  }

  let holes = enclosedBackground(local);
  const allowed = holes.filter((points) => points.length >= 55);
  const accidental = holes.filter((points) => points.length < 55);
  accidental.forEach((points) => points.forEach((p) => { local[p] = 1; }));
  holes = enclosedBackground(local);
  const allowedAfter = holes.filter((points) => points.length >= 55);
  const accidentalAfter = holes.filter((points) => points.length < 55);
  const components = componentPoints(local);
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    if (local[y * CELL + x]) cleanMask[(row * CELL + y) * WIDTH + column * CELL + x] = 1;
  }
  const xs = components[0]?.map((p) => p % CELL) ?? [];
  const ys = components[0]?.map((p) => Math.floor(p / CELL)) ?? [];
  cells.push({
    index: row * 5 + column + 1, row, column,
    expectedEmpty: row === 2,
    maskPixels: components.reduce((sum, points) => sum + points.length, 0),
    components: components.length,
    componentSizes: components.map((points) => points.length),
    localBounds: xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null,
    allowedLensApertures: allowedAfter.length,
    allowedLensAperturePixels: allowedAfter.map((points) => points.length),
    accidentalHolesFilled: accidental.reduce((sum, points) => sum + points.length, 0),
    accidentalHolesRemaining: accidentalAfter.map((points) => points.length),
  });
}

const layer = Buffer.alloc(WIDTH * HEIGHT * CHANNELS); const binary = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
for (let pixel = 0; pixel < cleanMask.length; pixel += 1) {
  if (!cleanMask[pixel]) continue;
  const at = pixel * CHANNELS;
  binary[at] = 255; binary[at + 1] = 255; binary[at + 2] = 255; binary[at + 3] = 255;
  layer[at] = isolated[at]; layer[at + 1] = isolated[at + 1]; layer[at + 2] = isolated[at + 2]; layer[at + 3] = 255;
}
await Promise.all([
  sharp(layer, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(layerPath),
  sharp(binary, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(maskPath),
]);

// Same-coordinate and bounded-shift color agreement are diagnostics only.
// Geometry is never altered to chase the full-redraw reference.
for (const cell of cells) {
  if (cell.expectedEmpty || cell.maskPixels === 0) { cell.alignment = null; continue; }
  const samples = [];
  for (let y = 0; y < CELL; y += 2) for (let x = 0; x < CELL; x += 2) {
    const pixel = (cell.row * CELL + y) * WIDTH + cell.column * CELL + x;
    if (cleanMask[pixel]) samples.push([x, y]);
  }
  const score = (dx, dy) => {
    let total = 0; let count = 0;
    for (const [x, y] of samples) {
      const fx = x + dx; const fy = y + dy;
      if (fx < 0 || fx >= CELL || fy < 0 || fy >= CELL) continue;
      const isolatedAt = ((cell.row * CELL + y) * WIDTH + cell.column * CELL + x) * CHANNELS;
      const fullAt = ((cell.row * CELL + fy) * WIDTH + cell.column * CELL + fx) * CHANNELS;
      total += Math.abs(isolated[isolatedAt] - full[fullAt])
        + Math.abs(isolated[isolatedAt + 1] - full[fullAt + 1])
        + Math.abs(isolated[isolatedAt + 2] - full[fullAt + 2]);
      count += 3;
    }
    return count ? total / count : Infinity;
  };
  const zeroShiftMeanAbsRgb = score(0, 0);
  let best = { dx: 0, dy: 0, meanAbsRgb: zeroShiftMeanAbsRgb };
  for (let dy = -24; dy <= 24; dy += 2) for (let dx = -24; dx <= 24; dx += 2) {
    const candidate = score(dx, dy);
    if (candidate < best.meanAbsRgb) best = { dx, dy, meanAbsRgb: candidate };
  }
  cell.alignment = {
    zeroShiftMeanAbsRgb: Number(zeroShiftMeanAbsRgb.toFixed(3)),
    bestShift: { dx: best.dx, dy: best.dy, meanAbsRgb: Number(best.meanAbsRgb.toFixed(3)) },
  };
}

let transparentRgbNonZero = 0; let layerPixelsOutsideMask = 0;
for (let pixel = 0; pixel < cleanMask.length; pixel += 1) {
  const at = pixel * CHANNELS;
  if (!layer[at + 3] && (layer[at] || layer[at + 1] || layer[at + 2])) transparentRgbNonZero += 1;
  if (layer[at + 3] && !cleanMask[pixel]) layerPixelsOutsideMask += 1;
}
const sha = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const visibleCells = cells.filter((cell) => !cell.expectedEmpty); const backCells = cells.filter((cell) => cell.expectedEmpty);
const structuralPass = visibleCells.every((cell) => cell.components === 1 && cell.accidentalHolesRemaining.length === 0)
  && backCells.every((cell) => cell.maskPixels === 0) && transparentRgbNonZero === 0 && layerPixelsOutsideMask === 0;
const alignmentPass = visibleCells.every((cell) => Math.abs(cell.alignment.bestShift.dx) <= 2
  && Math.abs(cell.alignment.bestShift.dy) <= 2 && cell.alignment.zeroShiftMeanAbsRgb <= 42);
const report = {
  verdict: structuralPass && alignmentPass ? 'TECHNICAL_PASS_REQUIRES_VISUAL_QA' : 'REJECT',
  reason: alignmentPass ? null : 'The clean isolated redraw does not remain co-registered with the normalized full redraw in every visible pose.',
  inputs: { fullRawPath, isolatedRawPath, prohibitedOldMaskLayerPatchEraseInputs: [] },
  outputs: { fullNormalizedPath, isolatedReferencePath, layerPath, maskPath },
  hashes: { fullRaw: await sha(fullRawPath), isolatedRaw: await sha(isolatedRawPath), fullNormalized: await sha(fullNormalizedPath), isolatedReference: await sha(isolatedReferencePath), layer: await sha(layerPath), mask: await sha(maskPath) },
  normalization: { rawCanvas: '1402x1122', outputCanvas: '800x640', sameFullCanvasTransform: true, fit: 'fill', kernel: 'lanczos3', furtherTransformAllowed: false },
  totals: {
    visibleSingleComponentCells: visibleCells.filter((cell) => cell.components === 1).length,
    emptyBackCells: backCells.filter((cell) => cell.maskPixels === 0).length,
    accidentalHolesRemaining: visibleCells.reduce((sum, cell) => sum + cell.accidentalHolesRemaining.length, 0),
    transparentRgbNonZero,
    layerPixelsOutsideMask,
    alignmentPassingCells: visibleCells.filter((cell) => Math.abs(cell.alignment.bestShift.dx) <= 2 && Math.abs(cell.alignment.bestShift.dy) <= 2 && cell.alignment.zeroShiftMeanAbsRgb <= 42).length,
  },
  visualReview: {
    verdict: 'REJECT',
    frontR0C0ToC4: 'The isolated redraw sits about 6-8 px above the same glasses in the full redraw.',
    sideR1C0ToC4: 'Topology is mirrored: isolated has the lens at the left and temple extending right; full redraw has the lens at the right and temple extending left.',
    feedingR3C0: 'Isolated redraw contains two tall upward temples that are not present in the full redraw.',
    sleepingR3C2: 'Isolated redraw is a horizontal front-view frame; full redraw follows the sleeping head with a diagonal frame.',
    surprisedR3C4: 'Isolated redraw contains two tall upward temples that are not present in the full redraw.',
    matteEdge: 'A pale baked-background fringe remains visible around parts of the isolated frame edge after checker removal; this candidate is not production-clean.',
  },
  cells,
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
