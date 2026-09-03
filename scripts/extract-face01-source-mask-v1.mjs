import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import sharp from 'sharp';

const [sourcePath, maskPath, layerPath, reportPath] = process.argv.slice(2);
if (!sourcePath || !maskPath || !layerPath || !reportPath) {
  console.error('usage: node scripts/extract-face01-source-mask-v1.mjs <dressed-source> <mask> <layer> <report>');
  process.exit(1);
}
if (/face-01-(?:mask|layer|patch|erase|output)/i.test(sourcePath)) throw new Error('only the dressed source atlas may be read');

const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const CHANNELS = 4;
const DIR4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const DIR8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const image = await sharp(sourcePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (image.info.width !== WIDTH || image.info.height !== HEIGHT) throw new Error('source must be 800x640');
const source = image.data;
const mask = new Uint8Array(WIDTH * HEIGHT);

const front = (leftX, rightX, y, rx = 22, ry = 18) => ({
  rings: [
    { cx: leftX, cy: y, outerRx: rx, outerRy: ry, innerRx: rx - 5, innerRy: ry - 5 },
    { cx: rightX, cy: y, outerRx: rx, outerRy: ry, innerRx: rx - 5, innerRy: ry - 5 },
  ],
  segments: [
    { ax: leftX + rx - 3, ay: y - 2, bx: rightX - rx + 3, by: y - 2, width: 1.6 },
    { ax: leftX - rx - 7, ay: y, bx: leftX - rx + 2, by: y, width: 1.25 },
    { ax: rightX + rx - 2, ay: y, bx: rightX + rx + 7, by: y, width: 1.25 },
  ],
  expectedApertures: 2,
});

const specs = [
  [front(58, 102, 82), front(58, 102, 82), front(58, 102, 82), front(59, 103, 82), front(59, 103, 82)],
  Array.from({ length: 5 }, () => ({
    rings: [
      { cx: 124, cy: 79, outerRx: 14, outerRy: 18, innerRx: 10, innerRy: 13 },
      { cx: 153, cy: 79, outerRx: 7, outerRy: 16, innerRx: 4, innerRy: 12 },
    ],
    segments: [
      { ax: 70, ay: 78, bx: 111, by: 79, width: 1.4 },
      { ax: 136, ay: 78, bx: 147, by: 78, width: 1.4 },
    ],
    expectedApertures: 1,
  })),
  [null, null, null, null, null],
  [
    front(58, 96, 99, 19, 18),
    front(58, 99, 76, 20, 18),
    {
      rings: [
        { cx: 56, cy: 112, outerRx: 19, outerRy: 19, innerRx: 14, innerRy: 14 },
        { cx: 93, cy: 96, outerRx: 19, outerRy: 19, innerRx: 14, innerRy: 14 },
      ],
      segments: [{ ax: 73, ay: 104, bx: 77, by: 102, width: 1.8 }],
      expectedApertures: 2,
    },
    front(58, 101, 75, 20, 18),
    front(58, 102, 70, 20, 18),
  ],
];

const ellipseValue = (x, y, ring, inner = false) => {
  const rx = inner ? ring.innerRx : ring.outerRx;
  const ry = inner ? ring.innerRy : ring.outerRy;
  return ((x - ring.cx) / rx) ** 2 + ((y - ring.cy) / ry) ** 2;
};
const distanceToSegment = (x, y, segment) => {
  const vx = segment.bx - segment.ax; const vy = segment.by - segment.ay;
  const denominator = vx * vx + vy * vy;
  const t = denominator === 0 ? 0 : Math.max(0, Math.min(1, ((x - segment.ax) * vx + (y - segment.ay) * vy) / denominator));
  return Math.hypot(x - (segment.ax + vx * t), y - (segment.ay + vy * t));
};
const inRingCorridor = (x, y, ring) => ellipseValue(x, y, ring) <= 1.03 && ellipseValue(x, y, ring, true) >= 0.97;
const inLensInterior = (x, y, ring) => ellipseValue(x, y, ring, true) < 0.94;
const inCorridor = (x, y, spec) => spec.rings.some((ring) => inRingCorridor(x, y, ring))
  || spec.segments.some((segment) => distanceToSegment(x, y, segment) <= segment.width);

const frameColor = (at, relaxed = false) => {
  const r = source[at]; const g = source[at + 1]; const b = source[at + 2]; const a = source[at + 3];
  if (a <= 3) return false;
  const darkBrown = r < 185 && g < 135 && b < 100 && r >= g * 1.06 && g >= b * 0.92;
  const saturatedGold = r > 95 && r > g * 1.13 && g > b * 1.14 && b < 145;
  const paleGold = r > 170 && r - g > (relaxed ? 5 : 11) && g - b > (relaxed ? 6 : 11) && b < 220;
  const neutralOutline = r < 125 && g < 105 && b < 95 && Math.max(r, g, b) - Math.min(r, g, b) < 55;
  return darkBrown || saturatedGold || paleGold || neutralOutline;
};

const components4 = (local) => {
  const seen = new Uint8Array(CELL * CELL); const result = [];
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
    result.push(points);
  }
  return result.sort((a, b) => b.length - a.length);
};

const enclosedBackground4 = (local) => {
  const exterior = new Uint8Array(CELL * CELL); const queue = [];
  const push = (x, y) => {
    const p = y * CELL + x;
    if (!local[p] && !exterior[p]) { exterior[p] = 1; queue.push(p); }
  };
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

const cells = [];
for (let row = 0; row < 4; row += 1) for (let column = 0; column < 5; column += 1) {
  const spec = specs[row][column];
  if (!spec) {
    cells.push({ index: row * 5 + column + 1, row, column, expectedEmpty: true, maskPixels: 0, components: 0, allowedLensApertures: 0, accidentalHolesFilled: 0 });
    continue;
  }
  let local = new Uint8Array(CELL * CELL);
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    if (!inCorridor(x, y, spec) || spec.rings.some((ring) => inLensInterior(x, y, ring))) continue;
    const at = ((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS;
    if (source[at + 3] > 3) local[y * CELL + x] = 1;
  }
  // Recover source antialias pixels while remaining inside the narrow frame corridor.
  for (let iteration = 0; iteration < 2; iteration += 1) {
    const next = Uint8Array.from(local);
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
      const p = y * CELL + x;
      if (local[p] || !inCorridor(x, y, spec) || spec.rings.some((ring) => inLensInterior(x, y, ring))) continue;
      const at = ((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS;
      if (!frameColor(at, true)) continue;
      if (DIR8.some(([dx, dy]) => {
        const nx = x + dx; const ny = y + dy;
        return nx >= 0 && nx < CELL && ny >= 0 && ny < CELL && local[ny * CELL + nx];
      })) next[p] = 1;
    }
    local = next;
  }

  // Remove tiny detached color matches. Real frame parts are at least 8px.
  const initialComponents = components4(local);
  const kept = new Uint8Array(CELL * CELL);
  initialComponents.filter((points) => points.length >= 8).forEach((points) => points.forEach((p) => { kept[p] = 1; }));
  local = kept;

  // Classify the two large lens openings separately from accidental material holes.
  const holesBefore = enclosedBackground4(local);
  const allowed = [];
  let accidentalHolesFilled = 0;
  for (const hole of holesBefore) {
    const cx = hole.reduce((sum, p) => sum + p % CELL, 0) / hole.length;
    const cy = hole.reduce((sum, p) => sum + Math.floor(p / CELL), 0) / hole.length;
    const matchesLens = hole.length >= 80 && spec.rings.some((ring) => ellipseValue(cx, cy, ring, true) < 0.8);
    if (matchesLens) { allowed.push(hole); continue; }
    hole.forEach((p) => { local[p] = 1; });
    accidentalHolesFilled += hole.length;
  }

  const finalComponents = components4(local);
  const holesAfter = enclosedBackground4(local);
  const finalAllowed = holesAfter.filter((hole) => {
    const cx = hole.reduce((sum, p) => sum + p % CELL, 0) / hole.length;
    const cy = hole.reduce((sum, p) => sum + Math.floor(p / CELL), 0) / hole.length;
    return hole.length >= 80 && spec.rings.some((ring) => ellipseValue(cx, cy, ring, true) < 0.8);
  });
  const accidentalAfter = holesAfter.filter((hole) => !finalAllowed.includes(hole));
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    if (local[y * CELL + x]) mask[(row * CELL + y) * WIDTH + column * CELL + x] = 1;
  }
  cells.push({
    index: row * 5 + column + 1, row, column, expectedEmpty: false,
    maskPixels: local.reduce((sum, value) => sum + value, 0),
    components: finalComponents.length,
    componentSizes: finalComponents.map((points) => points.length),
    expectedLensApertures: spec.expectedApertures,
    allowedLensApertures: finalAllowed.length,
    allowedLensAperturePixels: finalAllowed.map((hole) => hole.length),
    accidentalHolesFilled,
    accidentalHolesRemaining: accidentalAfter.map((hole) => hole.length),
  });
}

const maskRgba = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
const layer = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
let transparentRgbNonZero = 0; let sourceCoordinateViolations = 0;
for (let pixel = 0; pixel < mask.length; pixel += 1) {
  if (!mask[pixel]) continue;
  const at = pixel * CHANNELS;
  maskRgba[at] = 255; maskRgba[at + 1] = 255; maskRgba[at + 2] = 255; maskRgba[at + 3] = 255;
  layer[at] = source[at]; layer[at + 1] = source[at + 1]; layer[at + 2] = source[at + 2]; layer[at + 3] = source[at + 3];
}
for (let at = 0; at < layer.length; at += CHANNELS) {
  if (!layer[at + 3] && (layer[at] || layer[at + 1] || layer[at + 2])) transparentRgbNonZero += 1;
  if (layer[at + 3] && (layer[at] !== source[at] || layer[at + 1] !== source[at + 1] || layer[at + 2] !== source[at + 2] || layer[at + 3] !== source[at + 3])) sourceCoordinateViolations += 1;
}
await Promise.all([
  sharp(maskRgba, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(maskPath),
  sharp(layer, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png().toFile(layerPath),
]);
const sha = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const visibleCells = cells.filter((cell) => !cell.expectedEmpty);
const backCells = cells.filter((cell) => cell.expectedEmpty);
const pass = visibleCells.every((cell) => cell.components === 1
    && cell.allowedLensApertures === cell.expectedLensApertures
    && cell.accidentalHolesRemaining.length === 0)
  && backCells.every((cell) => cell.maskPixels === 0)
  && transparentRgbNonZero === 0 && sourceCoordinateViolations === 0;
const report = {
  verdict: pass ? 'TECHNICAL_PASS_REQUIRES_VISUAL_QA' : 'REJECT',
  inputs: { sourcePath, prohibitedFace01MaskLayerPatchEraseOutputInputs: [] },
  outputs: { maskPath, layerPath },
  hashes: { source: await sha(sourcePath), mask: await sha(maskPath), layer: await sha(layerPath) },
  geometry: { canvas: '800x640', cell: '160x160', resized: false, rotated: false, stretched: false, shifted: false },
  totals: {
    visibleSingle4ConnectedCells: visibleCells.filter((cell) => cell.components === 1).length,
    emptyBackCells: backCells.filter((cell) => cell.maskPixels === 0).length,
    allowedLensApertures: visibleCells.reduce((sum, cell) => sum + cell.allowedLensApertures, 0),
    expectedLensApertures: visibleCells.reduce((sum, cell) => sum + cell.expectedLensApertures, 0),
    accidentalHolesRemaining: visibleCells.reduce((sum, cell) => sum + cell.accidentalHolesRemaining.length, 0),
    transparentRgbNonZero,
    sourceCoordinateViolations,
  },
  cells,
};
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
