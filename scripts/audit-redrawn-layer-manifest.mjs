/**
 * Strict audit for a same-coordinate rear/erase/patch/front layer manifest.
 *
 * The manifest is deliberately explicit: every visible layer owns a binary
 * support mask and (except destination-out layers) a sampled RGBA image. The
 * target is recomposited from the base and these declared inputs; the target
 * itself is never used as a repair source.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [manifestPath, reportPath = ''] = process.argv.slice(2);
if (!manifestPath) {
  console.error('usage: node scripts/audit-redrawn-layer-manifest.mjs <layer-manifest.json> [report.json]');
  process.exit(1);
}

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const COLUMNS = 5;
const ROWS = 4;
const CHANNELS = 4;
const PIXELS = WIDTH * HEIGHT;
const ORDER = ['rear', 'erase', 'patch', 'frontErase', 'front'];
const DIRECTION_ROWS = { front: 0, 'side-right': 1, back: 2, special: 3 };
const DESTINATION_OUT = new Set(['erase', 'frontErase']);

const manifestAbsolute = path.resolve(manifestPath);
const manifest = JSON.parse(await fs.readFile(manifestAbsolute, 'utf8'));
const manifestDirectory = path.dirname(manifestAbsolute);
const resolveInput = (value) => path.isAbsolute(value) ? value : path.resolve(process.cwd(), value);
const hashFile = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const same = (left, right) => left[0] === right[0] && left[1] === right[1] && left[2] === right[2] && left[3] === right[3];
const rgbaAt = (buffer, pixel) => {
  const at = pixel * CHANNELS;
  return [buffer[at], buffer[at + 1], buffer[at + 2], buffer[at + 3]];
};
const writeRgba = (buffer, pixel, rgba) => {
  const at = pixel * CHANNELS;
  buffer[at] = rgba[0]; buffer[at + 1] = rgba[1]; buffer[at + 2] = rgba[2]; buffer[at + 3] = rgba[3];
};
const over = (background, foreground) => {
  const ba = background[3] / 255;
  const fa = foreground[3] / 255;
  if (fa === 0) return [...background];
  const oa = fa + ba * (1 - fa);
  if (oa <= 0) return [...background];
  return [
    Math.round((foreground[0] * fa + background[0] * ba * (1 - fa)) / oa),
    Math.round((foreground[1] * fa + background[1] * ba * (1 - fa)) / oa),
    Math.round((foreground[2] * fa + background[2] * ba * (1 - fa)) / oa),
    Math.round(oa * 255),
  ];
};

const readRgba = async (input) => {
  const decoded = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (decoded.info.width !== WIDTH || decoded.info.height !== HEIGHT || decoded.info.channels !== CHANNELS) {
    throw new Error(`${input} must decode to ${WIDTH}x${HEIGHT} RGBA`);
  }
  return decoded.data;
};

const errors = [];
const warnings = [];
const fail = (message) => errors.push(message);
const layerEntries = manifest.layers && typeof manifest.layers === 'object' ? manifest.layers : {};
const identity = manifest.identity ?? {};
for (const field of ['petId', 'stage', 'wearableId', 'slot']) {
  if (identity[field] === undefined || identity[field] === '') fail(`identity.${field} is required`);
}
if (JSON.stringify(manifest.layerOrder) !== JSON.stringify(ORDER)) fail(`layerOrder must be exactly ${ORDER.join('/')}`);
if (manifest.geometry?.transformAllowed !== false) fail('geometry.transformAllowed must be false');
for (const direction of manifest.emptyByDefault ?? []) {
  if (!(direction in DIRECTION_ROWS)) fail(`unknown emptyByDefault direction ${direction}`);
}
for (const layer of Object.keys(layerEntries)) {
  if (!ORDER.includes(layer)) fail(`unknown layer ${layer}`);
}

let target;
let base;
try {
  target = await readRgba(resolveInput(manifest.target));
  base = await readRgba(resolveInput(manifest.base));
} catch (error) {
  fail(`target/base read failed: ${error.message}`);
}

const loaded = {};
const layerMetrics = {};
for (const layer of ORDER) {
  const entry = layerEntries[layer];
  if (!entry) {
    layerMetrics[layer] = { declared: false, visibleMaskPixels: 0, visibleLayerPixels: 0 };
    continue;
  }
  if (typeof entry.mask !== 'string' || !entry.mask) {
    fail(`${layer}.mask is required`);
    continue;
  }
  const maskPath = resolveInput(entry.mask);
  let mask;
  try { mask = await readRgba(maskPath); } catch (error) { fail(`${layer} mask read failed: ${error.message}`); continue; }
  let content = null;
  const kind = entry.kind ?? (DESTINATION_OUT.has(layer) ? 'destination-out' : 'content');
  if (DESTINATION_OUT.has(layer) && kind !== 'destination-out') fail(`${layer}.kind must be destination-out`);
  if (!DESTINATION_OUT.has(layer) && kind !== 'content') fail(`${layer}.kind must be content`);
  if (kind === 'content') {
    if (typeof entry.image !== 'string' || !entry.image) fail(`${layer}.image is required for content layer`);
    else {
      try { content = await readRgba(resolveInput(entry.image)); } catch (error) { fail(`${layer} image read failed: ${error.message}`); }
    }
  } else if (entry.image) {
    fail(`${layer} destination-out layer may not also declare image`);
  }
  let nonBinaryMaskAlphaPixels = 0;
  let maskTransparentRgbNonZeroPixels = 0;
  let transparentLayerRgbNonZeroPixels = 0;
  let layerOutsideMaskPixels = 0;
  let maskWithoutLayerPixels = 0;
  let visibleMaskPixels = 0;
  let visibleLayerPixels = 0;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const at = pixel * CHANNELS;
    const alpha = mask[at + 3];
    if (alpha !== 0 && alpha !== 255) nonBinaryMaskAlphaPixels += 1;
    if (alpha === 0 && (mask[at] || mask[at + 1] || mask[at + 2])) maskTransparentRgbNonZeroPixels += 1;
    if (alpha > 0) visibleMaskPixels += 1;
    if (content) {
      const contentAlpha = content[at + 3];
      if (contentAlpha > 0) {
        visibleLayerPixels += 1;
        if (alpha === 0) layerOutsideMaskPixels += 1;
      }
      if (contentAlpha === 0 && (content[at] || content[at + 1] || content[at + 2])) transparentLayerRgbNonZeroPixels += 1;
      if (alpha > 0 && contentAlpha === 0) maskWithoutLayerPixels += 1;
    }
  }
  loaded[layer] = { mask, content, kind };
  layerMetrics[layer] = {
    declared: true,
    kind,
    visibleMaskPixels,
    visibleLayerPixels,
    nonBinaryMaskAlphaPixels,
    maskTransparentRgbNonZeroPixels,
    transparentLayerRgbNonZeroPixels,
    layerOutsideMaskPixels,
    maskWithoutLayerPixels,
  };
}

const unionMask = new Uint8Array(PIXELS);
for (const layer of ORDER) {
  const mask = loaded[layer]?.mask;
  if (!mask) continue;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) unionMask[pixel] = unionMask[pixel] || Number(mask[pixel * CHANNELS + 3] > 0);
}

const emptyDirectionViolations = [];
for (const direction of manifest.emptyByDefault ?? []) {
  const row = DIRECTION_ROWS[direction];
  for (let column = 0; column < COLUMNS; column += 1) {
    let pixels = 0;
    for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) pixels += unionMask[(row * CELL + y) * WIDTH + column * CELL + x];
    if (pixels > 0) emptyDirectionViolations.push({ direction, row, column, pixels });
  }
}

const holeCells = [];
const componentCells = [];
const cardinal = [[0, -1], [-1, 0], [1, 0], [0, 1]];
for (let row = 0; row < ROWS; row += 1) for (let column = 0; column < COLUMNS; column += 1) {
  const selected = new Uint8Array(CELL * CELL);
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    selected[y * CELL + x] = unionMask[(row * CELL + y) * WIDTH + column * CELL + x];
  }
  const seen = new Uint8Array(selected.length);
  let components = 0;
  for (let seed = 0; seed < selected.length; seed += 1) {
    if (!selected[seed] || seen[seed]) continue;
    components += 1; const queue = [seed]; seen[seed] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const local = queue[head]; const x = local % CELL; const y = Math.floor(local / CELL);
      for (const [dx, dy] of cardinal) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const next = ny * CELL + nx;
        if (selected[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
      }
    }
  }
  const outside = new Uint8Array(selected.length); const outsideQueue = [];
  const pushOutside = (x, y) => {
    const local = y * CELL + x;
    if (outside[local] || selected[local]) return;
    outside[local] = 1; outsideQueue.push(local);
  };
  for (let x = 0; x < CELL; x += 1) { pushOutside(x, 0); pushOutside(x, CELL - 1); }
  for (let y = 0; y < CELL; y += 1) { pushOutside(0, y); pushOutside(CELL - 1, y); }
  for (let head = 0; head < outsideQueue.length; head += 1) {
    const local = outsideQueue[head]; const x = local % CELL; const y = Math.floor(local / CELL);
    for (const [dx, dy] of cardinal) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) pushOutside(nx, ny);
    }
  }
  let holes = 0; let holePixels = 0;
  for (let seed = 0; seed < selected.length; seed += 1) {
    if (selected[seed] || outside[seed]) continue;
    holes += 1; const queue = [seed]; outside[seed] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const local = queue[head]; holePixels += 1; const x = local % CELL; const y = Math.floor(local / CELL);
      for (const [dx, dy] of cardinal) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || nx >= CELL || ny < 0 || ny >= CELL) continue;
        const next = ny * CELL + nx;
        if (!selected[next] && !outside[next]) { outside[next] = 1; queue.push(next); }
      }
    }
  }
  componentCells.push({ row, column, components });
  if (holes > 0) holeCells.push({ row, column, holes, holePixels });
}
const declaredHoles = manifest.allowedHoles ?? [];
const holeMismatch = holeCells.filter((cell) => !declaredHoles.some((allowed) => allowed.row === cell.row && allowed.column === cell.column && allowed.holes === cell.holes));

const composite = Buffer.from(base ?? Buffer.alloc(PIXELS * CHANNELS));
const applyContent = (layer) => {
  const entry = loaded[layer];
  if (!entry?.content) return;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const at = pixel * CHANNELS;
    if (entry.mask[at + 3] > 0) writeRgba(composite, pixel, over(rgbaAt(composite, pixel), rgbaAt(entry.content, pixel)));
  }
};
const applyDestinationOut = (layer) => {
  const entry = loaded[layer];
  if (!entry?.mask) return;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) if (entry.mask[pixel * CHANNELS + 3] > 0) writeRgba(composite, pixel, [0, 0, 0, 0]);
};
applyContent('rear');
applyDestinationOut('erase');
applyContent('patch');
applyDestinationOut('frontErase');
applyContent('front');

let exactRgbaMismatchPixels = 0;
let targetBaseOutsideMaskMismatchPixels = 0;
let maskPixelsWithNoTargetBaseDifference = 0;
const cellMetrics = Array.from({ length: ROWS * COLUMNS }, (_, index) => ({
  index: index + 1, row: Math.floor(index / COLUMNS), column: index % COLUMNS,
  maskPixels: 0, targetBaseOutsideMaskMismatchPixels: 0, exactRgbaMismatchPixels: 0,
}));
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const masked = unionMask[pixel] > 0;
  const targetPixel = rgbaAt(target ?? Buffer.alloc(PIXELS * CHANNELS), pixel);
  const basePixel = rgbaAt(base ?? Buffer.alloc(PIXELS * CHANNELS), pixel);
  const compositePixel = rgbaAt(composite, pixel);
  const cell = cellMetrics[Math.floor(pixel / WIDTH / CELL) * COLUMNS + Math.floor((pixel % WIDTH) / CELL)];
  if (masked) cell.maskPixels += 1;
  if (masked && same(targetPixel, basePixel)) maskPixelsWithNoTargetBaseDifference += 1;
  if (!masked && !same(targetPixel, basePixel)) { targetBaseOutsideMaskMismatchPixels += 1; cell.targetBaseOutsideMaskMismatchPixels += 1; }
  if (!same(targetPixel, compositePixel)) { exactRgbaMismatchPixels += 1; cell.exactRgbaMismatchPixels += 1; }
}

const metrics = {
  targetBaseOutsideMaskMismatchPixels,
  maskPixelsWithNoTargetBaseDifference,
  exactRgbaMismatchPixels,
  emptyDirectionViolations: emptyDirectionViolations.length,
  holeCells: holeCells.length,
  undeclaredHoleCells: holeMismatch.length,
  layerMetrics,
};
const technicalErrors = Object.values(layerMetrics).reduce((sum, layer) => sum
  + (layer.nonBinaryMaskAlphaPixels ?? 0)
  + (layer.maskTransparentRgbNonZeroPixels ?? 0)
  + (layer.transparentLayerRgbNonZeroPixels ?? 0)
  + (layer.layerOutsideMaskPixels ?? 0), 0);
for (const [layer, details] of Object.entries(layerMetrics)) {
  if ((details.maskWithoutLayerPixels ?? 0) > 0) {
    warnings.push(`${layer}: ${details.maskWithoutLayerPixels} support-mask pixels have no visible content; allowed as unchanged target/base coverage but review semantically`);
  }
}
const accepted = errors.length === 0
  && technicalErrors === 0
  && targetBaseOutsideMaskMismatchPixels === 0
  && exactRgbaMismatchPixels === 0
  && emptyDirectionViolations.length === 0
  && holeMismatch.length === 0;
const report = {
  schemaVersion: 1,
  verdict: accepted ? 'DATA_PASS' : 'REJECT',
  publishable: accepted,
  transformed: false,
  inputPolicy: { targetImmutable: true, compositeUsedAsTarget: false, sameCoordinate: true },
  identity,
  layerOrder: ORDER,
  inputs: {
    manifest: manifestAbsolute,
    target: manifest.target ? { path: resolveInput(manifest.target), sha256: await hashFile(resolveInput(manifest.target)).catch(() => null) } : null,
    base: manifest.base ? { path: resolveInput(manifest.base), sha256: await hashFile(resolveInput(manifest.base)).catch(() => null) } : null,
  },
  metrics,
  cells: cellMetrics,
  holeCells,
  componentCells,
  emptyDirectionViolations,
  errors,
  warnings,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) {
  await fs.mkdir(path.dirname(path.resolve(reportPath)), { recursive: true });
  await fs.writeFile(reportPath, serialized, 'utf8');
}
process.stdout.write(serialized);
if (!accepted) process.exitCode = 2;
