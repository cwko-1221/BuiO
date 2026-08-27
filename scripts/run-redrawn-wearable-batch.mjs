/**
 * Stable, offline orchestration for same-coordinate redrawn wearables.
 *
 * Stages:
 *  1. immutable target-lineage gate (target must predate mask extraction),
 *  2. canonical target/base exact-difference mask extraction,
 *  3. category-aware topology / semantic-hole / empty-cell gate,
 *  4. exact 8-bit source-over layer solve with transparent-RGB cleanup,
 *  5. independent exact recompose checks and 4x per-cell proof,
 *  6. JSON + Markdown summary and a failed-cell retry interface.
 *
 * This script never publishes or edits runtime/manifest files.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const options = new Map();
const booleanFlags = new Set(['dry-run']);
for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];
  if (!argument.startsWith('--')) throw new Error(`unexpected argument: ${argument}`);
  const key = argument.slice(2);
  if (booleanFlags.has(key)) { options.set(key, true); continue; }
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`missing value for ${argument}`);
  options.set(key, value); index += 1;
}

const required = ['base', 'target', 'spec', 'lineage', 'output', 'prefix'];
for (const key of required) if (!options.get(key)) {
  console.error('usage: node scripts/run-redrawn-wearable-batch.mjs --base <800x640 pet> --target <frozen target> --spec <category spec> --lineage <target lineage.json> --output <proof directory> --prefix <asset id> [--front-erase <explicit 800x640 mask>] [--dry-run] [--retry-cells r0c0,r1c2 --seed-mask <previous mask>] [--expected-mask <approved mask> --expected-report <approved solve report>]');
  process.exit(1);
}

const startedAt = new Date();
const basePath = path.resolve(options.get('base'));
const targetPath = path.resolve(options.get('target'));
const specPath = path.resolve(options.get('spec'));
const lineagePath = path.resolve(options.get('lineage'));
const outputDirectory = path.resolve(options.get('output'));
const prefix = options.get('prefix');
const dryRun = options.get('dry-run') === true;
const seedMaskPath = options.get('seed-mask') ? path.resolve(options.get('seed-mask')) : null;
const expectedMaskPath = options.get('expected-mask') ? path.resolve(options.get('expected-mask')) : null;
const expectedReportPath = options.get('expected-report') ? path.resolve(options.get('expected-report')) : null;
const frontEraseInputPath = options.get('front-erase') && options.get('front-erase') !== '-'
  ? path.resolve(options.get('front-erase')) : null;
if (/composite|recompose/i.test(path.basename(targetPath))) throw new Error('frozen target filename cannot be a composite/recompose output');
if (targetPath === outputDirectory || targetPath.startsWith(`${outputDirectory}${path.sep}`)) throw new Error('frozen target cannot live inside the pipeline output directory');
if (frontEraseInputPath && /composite|recompose/i.test(path.basename(frontEraseInputPath))) {
  throw new Error('frontErase input must be an explicitly authored mask, not a composite/recompose output');
}
if (frontEraseInputPath && (frontEraseInputPath === targetPath || frontEraseInputPath === basePath || frontEraseInputPath === outputDirectory
  || frontEraseInputPath.startsWith(`${outputDirectory}${path.sep}`))) {
  throw new Error('frontErase input must be a separate source outside the batch output directory');
}

const sha256 = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const targetHashBefore = await sha256(targetPath);
const [spec, lineage] = await Promise.all([
  fs.readFile(specPath, 'utf8').then(JSON.parse),
  fs.readFile(lineagePath, 'utf8').then(JSON.parse),
]);
const publishConfig = {
  ...(spec.publish ?? {}),
  ...(options.get('publish-pet-id') ? { petId: options.get('publish-pet-id') } : {}),
  ...(options.get('publish-stage') ? { stage: Number(options.get('publish-stage')) } : {}),
  ...(options.get('publish-wearable-id') ? { wearableId: options.get('publish-wearable-id') } : {}),
  ...(options.get('publish-slot') ? { slot: options.get('publish-slot') } : {}),
  ...(options.get('publish-occludes') ? { occludes: options.get('publish-occludes').split(',').map((value) => value.trim()).filter(Boolean) } : {}),
};
const faceSpec = Array.isArray(spec.cells) && Number.isInteger(spec.globalRules?.expectedTotalTrueLensApertures);
const category = spec.category ?? (faceSpec ? 'face' : null);
if (!category) throw new Error('category spec must declare `category`, or use the face aperture-spec schema');
const atlas = spec.atlas ?? {};
const WIDTH = atlas.width; const HEIGHT = atlas.height;
const CELL_WIDTH = atlas.cellWidth; const CELL_HEIGHT = atlas.cellHeight;
const COLUMNS = atlas.columns; const ROWS = atlas.rows; const CHANNELS = 4;
if (WIDTH !== 800 || HEIGHT !== 640 || CELL_WIDTH !== 160 || CELL_HEIGHT !== 160 || COLUMNS !== 5 || ROWS !== 4) {
  throw new Error('batch pipeline currently requires the production 800x640 atlas with 20 160x160 cells');
}
const PIXELS = WIDTH * HEIGHT; const CELL_PIXELS = CELL_WIDTH * CELL_HEIGHT;

const parseCells = (value) => {
  const all = new Set(Array.from({ length: ROWS * COLUMNS }, (_, index) => index));
  if (!value || value === 'all') return all;
  const selected = new Set();
  for (const token of value.split(',').map((part) => part.trim()).filter(Boolean)) {
    let index;
    const coordinate = /^r([0-3])c([0-4])$/i.exec(token);
    if (coordinate) index = Number(coordinate[1]) * COLUMNS + Number(coordinate[2]);
    else if (/^(?:[1-9]|1\d|20)$/.test(token)) index = Number(token) - 1;
    else throw new Error(`retry cell must be r0c0..r3c4 or 1..20; got ${token}`);
    selected.add(index);
  }
  if (selected.size === 0) throw new Error('retry cell selection cannot be empty');
  return selected;
};
const selectedCells = parseCells(options.get('retry-cells'));
const selectedCellNames = [...selectedCells].sort((left, right) => left - right)
  .map((index) => `r${Math.floor(index / COLUMNS)}c${index % COLUMNS}`);
const partialRetry = selectedCells.size !== ROWS * COLUMNS;
if (partialRetry && !seedMaskPath) throw new Error('--retry-cells requires --seed-mask so untouched cells remain byte-position stable');

const readImage = async (input) => {
  const image = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (image.info.width !== WIDTH || image.info.height !== HEIGHT || image.info.channels !== CHANNELS) {
    throw new Error(`${input} must decode to ${WIDTH}x${HEIGHT} RGBA`);
  }
  return image.data;
};
const [base, target, seedMask, frontEraseInput] = await Promise.all([
  readImage(basePath), readImage(targetPath), seedMaskPath ? readImage(seedMaskPath) : null,
  frontEraseInputPath ? readImage(frontEraseInputPath) : null,
]);
const targetStat = await fs.stat(targetPath);

const lineageDeclaredPath = lineage.output?.v3Path ?? lineage.output?.targetPath ?? lineage.output?.path
  ?? lineage.lineage?.output ?? lineage.output?.v9Path;
const lineageDeclaredHash = (typeof lineage.output?.sha256 === 'string' ? lineage.output.sha256 : null)
  ?? lineage.output?.sha256?.target ?? lineage.lineage?.outputSha256;
const earlierCompositeMatches = lineage.verification?.earlierCompositeHashMatches
  ?? lineage.lineage?.earlierCompositeScan?.sha256Matches
  ?? lineage.lineage?.earlierCompositeHashMatches;
const lineageChecks = [
  { name: 'lineage verdict is PASS', pass: lineage.verdict === 'PASS' },
  { name: 'lineage declares this exact frozen target path', pass: Boolean(lineageDeclaredPath) && path.resolve(lineageDeclaredPath) === targetPath },
  { name: 'lineage declares this exact frozen target hash', pass: lineageDeclaredHash === targetHashBefore },
  { name: 'lineage proves no earlier composite byte-copy became target', pass: Array.isArray(earlierCompositeMatches) && earlierCompositeMatches.length === 0 },
  { name: 'target existed before this extraction run', pass: targetStat.mtime < startedAt },
  { name: 'target filename is not composite/recompose', pass: !/composite|recompose/i.test(path.basename(targetPath)) },
];
if (seedMaskPath) {
  const seedStat = await fs.stat(seedMaskPath);
  lineageChecks.push({ name: 'frozen target predates the seed mask used for retry', pass: targetStat.birthtime <= seedStat.birthtime || targetStat.mtime <= seedStat.mtime });
}
const lineagePass = lineageChecks.every((entry) => entry.pass);
if (!lineagePass) {
  const failure = { verdict: 'REJECT', stage: 'target-lineage', lineageChecks, targetPath, targetHashBefore, lineagePath };
  await fs.mkdir(outputDirectory, { recursive: true });
  const failureSummaryPath = path.join(outputDirectory, `${prefix}-batch-summary.json`);
  const failureMarkdownPath = path.join(outputDirectory, `${prefix}-batch-summary.md`);
  await Promise.all([
    fs.writeFile(failureSummaryPath, `${JSON.stringify(failure, null, 2)}\n`, 'utf8'),
    fs.writeFile(failureMarkdownPath, `# ${prefix} redrawn wearable batch\n\n- Verdict: **REJECT**\n- Stage: target-lineage\n- Mask extraction: not started\n- Published: no\n`, 'utf8'),
  ]);
  console.error(JSON.stringify({ ...failure, summaryPath: failureSummaryPath, markdownPath: failureMarkdownPath }, null, 2)); process.exit(2);
}

const maskBitmap = new Uint8Array(PIXELS);
if (seedMask) {
  for (let pixel = 0; pixel < PIXELS; pixel += 1) maskBitmap[pixel] = Number(seedMask[pixel * CHANNELS + 3] > 0);
}
const exactDifference = new Uint8Array(PIXELS);
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * CHANNELS;
  exactDifference[pixel] = Number(target[at] !== base[at] || target[at + 1] !== base[at + 1]
    || target[at + 2] !== base[at + 2] || target[at + 3] !== base[at + 3]);
}
for (const cellIndex of selectedCells) {
  const row = Math.floor(cellIndex / COLUMNS); const column = cellIndex % COLUMNS;
  for (let y = 0; y < CELL_HEIGHT; y += 1) for (let x = 0; x < CELL_WIDTH; x += 1) {
    const global = (row * CELL_HEIGHT + y) * WIDTH + column * CELL_WIDTH + x;
    maskBitmap[global] = exactDifference[global];
  }
}

const DIR4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const analyzeCell = (bitmap, row, column) => {
  const components = []; const seen = new Uint8Array(CELL_PIXELS);
  const localToGlobal = (x, y) => (row * CELL_HEIGHT + y) * WIDTH + column * CELL_WIDTH + x;
  for (let seed = 0; seed < CELL_PIXELS; seed += 1) {
    const seedX = seed % CELL_WIDTH; const seedY = Math.floor(seed / CELL_WIDTH);
    if (seen[seed] || !bitmap[localToGlobal(seedX, seedY)]) continue;
    const queue = [seed]; seen[seed] = 1; let head = 0; let sumX = 0; let sumY = 0;
    let minX = CELL_WIDTH; let minY = CELL_HEIGHT; let maxX = -1; let maxY = -1;
    while (head < queue.length) {
      const local = queue[head++]; const x = local % CELL_WIDTH; const y = Math.floor(local / CELL_WIDTH);
      sumX += x; sumY += y; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const [offsetX, offsetY] of DIR4) {
        const nextX = x + offsetX; const nextY = y + offsetY;
        if (nextX < 0 || nextX >= CELL_WIDTH || nextY < 0 || nextY >= CELL_HEIGHT) continue;
        const next = nextY * CELL_WIDTH + nextX;
        if (!seen[next] && bitmap[localToGlobal(nextX, nextY)]) { seen[next] = 1; queue.push(next); }
      }
    }
    components.push({ pixels: queue.length, bbox: [minX, minY, maxX + 1, maxY + 1], centroid: [sumX / queue.length, sumY / queue.length] });
  }
  const exterior = new Uint8Array(CELL_PIXELS); const exteriorQueue = [];
  const pushExterior = (x, y) => {
    const local = y * CELL_WIDTH + x;
    if (exterior[local] || bitmap[localToGlobal(x, y)]) return;
    exterior[local] = 1; exteriorQueue.push(local);
  };
  for (let x = 0; x < CELL_WIDTH; x += 1) { pushExterior(x, 0); pushExterior(x, CELL_HEIGHT - 1); }
  for (let y = 0; y < CELL_HEIGHT; y += 1) { pushExterior(0, y); pushExterior(CELL_WIDTH - 1, y); }
  let exteriorHead = 0;
  while (exteriorHead < exteriorQueue.length) {
    const local = exteriorQueue[exteriorHead++]; const x = local % CELL_WIDTH; const y = Math.floor(local / CELL_WIDTH);
    for (const [offsetX, offsetY] of DIR4) {
      const nextX = x + offsetX; const nextY = y + offsetY;
      if (nextX >= 0 && nextX < CELL_WIDTH && nextY >= 0 && nextY < CELL_HEIGHT) pushExterior(nextX, nextY);
    }
  }
  const holes = []; const holeSeen = new Uint8Array(CELL_PIXELS);
  for (let seed = 0; seed < CELL_PIXELS; seed += 1) {
    const seedX = seed % CELL_WIDTH; const seedY = Math.floor(seed / CELL_WIDTH);
    if (exterior[seed] || holeSeen[seed] || bitmap[localToGlobal(seedX, seedY)]) continue;
    const queue = [seed]; holeSeen[seed] = 1; let head = 0; let sumX = 0; let sumY = 0;
    let minX = CELL_WIDTH; let minY = CELL_HEIGHT; let maxX = -1; let maxY = -1;
    while (head < queue.length) {
      const local = queue[head++]; const x = local % CELL_WIDTH; const y = Math.floor(local / CELL_WIDTH);
      sumX += x; sumY += y; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const [offsetX, offsetY] of DIR4) {
        const nextX = x + offsetX; const nextY = y + offsetY;
        if (nextX < 0 || nextX >= CELL_WIDTH || nextY < 0 || nextY >= CELL_HEIGHT) continue;
        const next = nextY * CELL_WIDTH + nextX;
        if (!exterior[next] && !holeSeen[next] && !bitmap[localToGlobal(nextX, nextY)]) { holeSeen[next] = 1; queue.push(next); }
      }
    }
    const width = maxX - minX + 1; const height = maxY - minY + 1;
    holes.push({ pixels: queue.length, bbox: [minX, minY, maxX + 1, maxY + 1], width, height, aspectRatio: Math.max(width / height, height / width), centroid: [sumX / queue.length, sumY / queue.length] });
  }
  return { components, holes };
};
const fillCellHoles = (bitmap, row, column) => {
  const localToGlobal = (x, y) => (row * CELL_HEIGHT + y) * WIDTH + column * CELL_WIDTH + x;
  const exterior = new Uint8Array(CELL_PIXELS); const queue = [];
  const push = (x, y) => { const local = y * CELL_WIDTH + x; if (exterior[local] || bitmap[localToGlobal(x, y)]) return; exterior[local] = 1; queue.push(local); };
  for (let x = 0; x < CELL_WIDTH; x += 1) { push(x, 0); push(x, CELL_HEIGHT - 1); }
  for (let y = 0; y < CELL_HEIGHT; y += 1) { push(0, y); push(CELL_WIDTH - 1, y); }
  let head = 0;
  while (head < queue.length) {
    const local = queue[head++]; const x = local % CELL_WIDTH; const y = Math.floor(local / CELL_WIDTH);
    for (const [offsetX, offsetY] of DIR4) { const nextX = x + offsetX; const nextY = y + offsetY; if (nextX >= 0 && nextX < CELL_WIDTH && nextY >= 0 && nextY < CELL_HEIGHT) push(nextX, nextY); }
  }
  let filled = 0;
  for (let y = 0; y < CELL_HEIGHT; y += 1) for (let x = 0; x < CELL_WIDTH; x += 1) {
    const local = y * CELL_WIDTH + x; const global = localToGlobal(x, y);
    if (!bitmap[global] && !exterior[local]) { bitmap[global] = 1; filled += 1; }
  }
  return filled;
};

// Some closed headwear is rendered as several anti-aliased islands (visor,
// shell highlights and side hardware).  Connect only through pixels where the
// frozen target is byte-identical to the base, and only inside an explicitly
// declared semantic bridge zone.  These are support pixels: the solved layer
// still carries the target bytes and exact recomposition remains mandatory.
const bridgeCellComponents = (bitmap, row, column, zone) => {
  if (!zone) return { bridgedPixels: 0, unresolvedComponents: 0 };
  const localIndex = (x, y) => y * CELL_WIDTH + x;
  const globalIndex = (x, y) => (row * CELL_HEIGHT + y) * WIDTH + column * CELL_WIDTH + x;
  const inZone = (x, y) => x >= zone[0] && x < zone[2] && y >= zone[1] && y < zone[3];
  const labelComponents = () => {
    const labels = new Int32Array(CELL_PIXELS); labels.fill(-1); const components = [];
    for (let seed = 0; seed < CELL_PIXELS; seed += 1) {
      if (!bitmap[globalIndex(seed % CELL_WIDTH, Math.floor(seed / CELL_WIDTH))] || labels[seed] >= 0) continue;
      const queue = [seed]; labels[seed] = components.length; let head = 0;
      while (head < queue.length) {
        const local = queue[head++]; const x = local % CELL_WIDTH; const y = Math.floor(local / CELL_WIDTH);
        for (const [offsetX, offsetY] of DIR4) {
          const nx = x + offsetX; const ny = y + offsetY;
          if (nx < 0 || nx >= CELL_WIDTH || ny < 0 || ny >= CELL_HEIGHT) continue;
          const next = localIndex(nx, ny);
          if (labels[next] >= 0 || !bitmap[globalIndex(nx, ny)]) continue;
          labels[next] = components.length; queue.push(next);
        }
      }
      components.push(queue);
    }
    return { labels, components };
  };
  let bridgedPixels = 0;
  let unresolvedComponents = 0;
  while (true) {
    const { labels, components } = labelComponents();
    if (components.length <= 1) break;
    const principal = components[0];
    const targetComponent = components[1];
    const targetSet = new Uint8Array(CELL_PIXELS);
    for (const local of targetComponent) targetSet[local] = 1;
    const seen = new Uint8Array(CELL_PIXELS); const parent = new Int32Array(CELL_PIXELS); parent.fill(-1);
    const queue = [];
    for (const local of principal) { seen[local] = 1; queue.push(local); }
    let found = -1;
    for (let head = 0; head < queue.length && found < 0; head += 1) {
      const local = queue[head]; const x = local % CELL_WIDTH; const y = Math.floor(local / CELL_WIDTH);
      for (const [offsetX, offsetY] of DIR4) {
        const nx = x + offsetX; const ny = y + offsetY;
        if (nx < 0 || nx >= CELL_WIDTH || ny < 0 || ny >= CELL_HEIGHT || !inZone(nx, ny)) continue;
        const next = localIndex(nx, ny); if (seen[next]) continue;
        const global = globalIndex(nx, ny);
        // Existing mask pixels are traversable; otherwise only unchanged
        // target/base pixels may be used as invisible support bridges.
        if (!bitmap[global] && exactDifference[global]) continue;
        seen[next] = 1; parent[next] = local; queue.push(next);
        if (targetSet[next]) { found = next; break; }
      }
    }
    if (found < 0) { unresolvedComponents += components.length - 1; break; }
    // `found` is already a pixel in the target component and is therefore
    // already marked in the mask.  Walk from its parent so the support path
    // actually receives pixels; starting at `found` would make no mutation
    // and repeat the same component search forever.
    let cursor = parent[found];
    while (cursor >= 0 && !bitmap[globalIndex(cursor % CELL_WIDTH, Math.floor(cursor / CELL_WIDTH))]) {
      bitmap[globalIndex(cursor % CELL_WIDTH, Math.floor(cursor / CELL_WIDTH))] = 1;
      bridgedPixels += 1; cursor = parent[cursor];
    }
  }
  return { bridgedPixels, unresolvedComponents };
};

const topologyCellOverrides = new Map((spec.topology?.cells ?? []).map((cell) => [`${cell.row}:${cell.column}`, cell]));
const faceCellDeclarations = new Map((spec.cells ?? []).map((cell) => [`${cell.row}:${cell.column}`, cell]));
const emptyCellKeys = new Set([
  ...(spec.topology?.emptyCells ?? []).map((cell) => Array.isArray(cell) ? `${cell[0]}:${cell[1]}` : `${cell.row}:${cell.column}`),
  ...(spec.cells ?? []).filter((cell) => cell.mustBeEmpty).map((cell) => `${cell.row}:${cell.column}`),
]);
const fillEnclosedHoles = category === 'head' ? spec.topology?.fillEnclosedHoles !== false : spec.topology?.fillEnclosedHoles === true;
const holesFilledByCell = Array(ROWS * COLUMNS).fill(0);
if (fillEnclosedHoles) for (const cellIndex of selectedCells) {
  holesFilledByCell[cellIndex] = fillCellHoles(maskBitmap, Math.floor(cellIndex / COLUMNS), cellIndex % COLUMNS);
}

const expectedFor = (row, column) => {
  const key = `${row}:${column}`; const custom = topologyCellOverrides.get(key); const face = faceCellDeclarations.get(key);
  const empty = emptyCellKeys.has(key) || custom?.mustBeEmpty === true || face?.mustBeEmpty === true;
  if (faceSpec) {
    const components = empty ? 0 : spec.globalRules.nonBackVisibleLayerComponents4ConnectedPerCell;
    return { empty, componentMinimum: components, componentMaximum: components, holes: face.trueApertures, apertureZones: face.apertureZones, componentGroups: [] };
  }
  const componentGroups = custom?.componentGroups ?? spec.topology?.componentGroups ?? [];
  const explicitComponents = empty ? 0 : (custom?.expectedComponents4Connected ?? spec.topology?.expectedComponents4ConnectedPerCell);
  const componentMinimum = explicitComponents ?? custom?.minimumComponents4Connected ?? spec.topology?.minimumComponents4ConnectedPerCell ?? (componentGroups.length
    ? componentGroups.reduce((sum, group) => sum + (group.expectedComponents ?? group.minimumComponents ?? 1), 0)
    : (category === 'head' ? 1 : null));
  const componentMaximum = explicitComponents ?? custom?.maximumComponents4Connected ?? spec.topology?.maximumComponents4ConnectedPerCell ?? (componentGroups.length
    ? componentGroups.reduce((sum, group) => sum + (group.expectedComponents ?? group.maximumComponents ?? group.minimumComponents ?? 1), 0)
    : (category === 'head' ? 1 : null));
  return {
    empty,
    componentMinimum, componentMaximum,
    // Head accessories never gain a hole merely because they have multiple
    // legitimate pieces. Semantic apertures belong to face/category specs.
    holes: category === 'head' ? 0 : (custom?.expectedEnclosedTransparentComponents ?? spec.topology?.expectedEnclosedTransparentComponentsPerCell ?? null),
    apertureZones: custom?.apertureZones ?? [],
    componentGroups,
  };
};
const zoneContains = (zone, point) => point[0] >= zone[0] && point[0] < zone[2] && point[1] >= zone[1] && point[1] < zone[3];
const extractionCells = []; const failedCellSet = new Set();
const declaredBridgeZones = spec.topology?.bridgeZones ?? [];
const semanticBridgeZones = spec.topology?.connectComponents4Connected === true
  ? (spec.solve?.eraseReplacement?.allowedRegions ?? [])
  : [];
const bridgeZones = new Map([...declaredBridgeZones, ...semanticBridgeZones]
  .filter((entry) => Number.isInteger(entry.row) && Number.isInteger(entry.column) && Array.isArray(entry.zone))
  .map((entry) => [`${entry.row}:${entry.column}`, entry.zone]));
// A target/base difference is not automatically an accessory pixel. When a
// category declares replacement windows, every difference outside its local
// semantic window is body drift/contamination and must reject before masking.
// Fall back to the solve replacement regions so older specs get the same
// protection without duplicating geometry.
const replacementZoneEntries = [
  ...(spec.topology?.replacementZones ?? spec.solve?.eraseReplacement?.allowedRegions ?? []),
  ...(spec.topology?.replacementExtensions ?? []),
];
const replacementZones = new Map();
for (const entry of replacementZoneEntries) {
  if (!Number.isInteger(entry.row) || !Number.isInteger(entry.column) || !Array.isArray(entry.zone)) continue;
  const key = `${entry.row}:${entry.column}`;
  const zones = replacementZones.get(key) ?? [];
  zones.push(entry.zone); replacementZones.set(key, zones);
}
let targetBaseDifferencesOutsideReplacementZones = 0;
const targetBaseDifferencesOutsideReplacementZonesByCell = Array(ROWS * COLUMNS).fill(0);
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  if (!exactDifference[pixel] || replacementZones.size === 0) continue;
  const x = pixel % WIDTH; const y = Math.floor(pixel / WIDTH);
  const row = Math.floor(y / CELL_HEIGHT); const column = Math.floor(x / CELL_WIDTH);
  const zones = replacementZones.get(`${row}:${column}`) ?? [];
  const localPoint = [x - column * CELL_WIDTH, y - row * CELL_HEIGHT];
  if (!zones.some((zone) => zoneContains(zone, localPoint))) {
    targetBaseDifferencesOutsideReplacementZones += 1;
    targetBaseDifferencesOutsideReplacementZonesByCell[row * COLUMNS + column] += 1;
  }
}
const bridgedPixelsByCell = Array(ROWS * COLUMNS).fill(0);
const unresolvedBridgeComponentsByCell = Array(ROWS * COLUMNS).fill(0);
for (let row = 0; row < ROWS; row += 1) for (let column = 0; column < COLUMNS; column += 1) {
  const cellIndex = row * COLUMNS + column;
  if (spec.topology?.connectComponents4Connected === true) {
    const bridge = bridgeCellComponents(maskBitmap, row, column, bridgeZones.get(`${row}:${column}`));
    bridgedPixelsByCell[cellIndex] = bridge.bridgedPixels;
    unresolvedBridgeComponentsByCell[cellIndex] = bridge.unresolvedComponents;
    if (fillEnclosedHoles) holesFilledByCell[cellIndex] += fillCellHoles(maskBitmap, row, column);
  }
  const topology = analyzeCell(maskBitmap, row, column); const expected = expectedFor(row, column);
  const maskPixels = topology.components.reduce((sum, component) => sum + component.pixels, 0);
  let aperturesPass = true;
  if (expected.apertureZones?.length) {
    const matched = new Set();
    for (const zone of expected.apertureZones) {
      const found = topology.holes.findIndex((hole, holeIndex) => !matched.has(holeIndex) && zoneContains(zone, hole.centroid));
      if (found < 0) aperturesPass = false; else matched.add(found);
    }
    if (matched.size !== topology.holes.length) aperturesPass = false;
  }
  const componentGroupResults = [];
  let componentGroupsPass = true;
  if (expected.componentGroups?.length) {
    const assignments = expected.componentGroups.map(() => []);
    let ambiguousOrUnassignedComponents = 0;
    topology.components.forEach((component, componentIndex) => {
      const matches = expected.componentGroups
        .map((group, groupIndex) => ({ group, groupIndex }))
        .filter(({ group }) => Array.isArray(group.zone) && zoneContains(group.zone, component.centroid));
      if (matches.length !== 1) ambiguousOrUnassignedComponents += 1;
      else assignments[matches[0].groupIndex].push(componentIndex);
    });
    expected.componentGroups.forEach((group, groupIndex) => {
      const minimum = group.expectedComponents ?? group.minimumComponents ?? 1;
      const maximum = group.expectedComponents ?? group.maximumComponents ?? minimum;
      const count = assignments[groupIndex].length;
      const pass = count >= minimum && count <= maximum;
      if (!pass) componentGroupsPass = false;
      componentGroupResults.push({ id: group.id ?? `group-${groupIndex + 1}`, zone: group.zone, minimumComponents: minimum, maximumComponents: maximum, actualComponents: count, componentIndexes: assignments[groupIndex], verdict: pass ? 'PASS' : 'REJECT' });
    });
    if (ambiguousOrUnassignedComponents > 0) componentGroupsPass = false;
    componentGroupResults.push({ id: '__assignment__', ambiguousOrUnassignedComponents, verdict: ambiguousOrUnassignedComponents === 0 ? 'PASS' : 'REJECT' });
  }
  const pass = expected.componentMinimum !== null && expected.componentMaximum !== null && expected.holes !== null
    && topology.components.length >= expected.componentMinimum && topology.components.length <= expected.componentMaximum
    && topology.holes.length === expected.holes
    && (!expected.empty || maskPixels === 0) && aperturesPass && componentGroupsPass;
  if (!pass) failedCellSet.add(cellIndex);
  extractionCells.push({
    index: cellIndex + 1, row, column, selectedForRetry: selectedCells.has(cellIndex), holesFilled: holesFilledByCell[cellIndex],
    targetBaseDifferencesOutsideReplacementZones: targetBaseDifferencesOutsideReplacementZonesByCell[cellIndex],
    maskPixels, expectedComponents4Connected: { minimum: expected.componentMinimum, maximum: expected.componentMaximum }, actualComponents4Connected: topology.components.length,
    expectedEnclosedTransparentComponents: expected.holes, actualEnclosedTransparentComponents: topology.holes.length,
    components: topology.components, componentGroups: componentGroupResults,
    enclosedTransparentComponents: topology.holes, aperturesPass, componentGroupsPass,
    bridgedSupportPixels: bridgedPixelsByCell[cellIndex],
    unresolvedBridgeComponents: unresolvedBridgeComponentsByCell[cellIndex],
    verdict: pass ? 'PASS' : 'REJECT',
  });
}
let targetBaseDifferenceOutsideMask = 0;
for (let pixel = 0; pixel < PIXELS; pixel += 1) if (exactDifference[pixel] && !maskBitmap[pixel]) targetBaseDifferenceOutsideMask += 1;
const extractionPass = failedCellSet.size === 0 && targetBaseDifferenceOutsideMask === 0
  && targetBaseDifferencesOutsideReplacementZones === 0;

await fs.mkdir(outputDirectory, { recursive: true });
const maskPath = path.join(outputDirectory, `${prefix}-canonical-mask.png`);
const extractionReportPath = path.join(outputDirectory, `${prefix}-extraction-report.json`);
const maskRgba = Buffer.alloc(PIXELS * CHANNELS);
for (let pixel = 0; pixel < PIXELS; pixel += 1) if (maskBitmap[pixel]) {
  const at = pixel * CHANNELS; maskRgba[at] = 255; maskRgba[at + 1] = 255; maskRgba[at + 2] = 255; maskRgba[at + 3] = 255;
}
await sharp(maskRgba, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png({ compressionLevel: 9 }).toFile(maskPath);
const maskStat = await fs.stat(maskPath);
const targetPredatesMask = targetStat.birthtime <= maskStat.birthtime || targetStat.mtime <= maskStat.mtime;
lineageChecks.push({ name: 'frozen target predates generated canonical mask', pass: targetPredatesMask });
const extractionReport = {
  verdict: extractionPass && targetPredatesMask ? 'PASS' : 'REJECT', category,
  geometry: { canvas: '800x640', cell: '160x160', resized: false, rotated: false, shifted: false, stretched: false, resampled: false },
  retry: { partialRetry, selectedCells: selectedCellNames, seedMaskPath },
  inputs: { basePath, targetPath, specPath, lineagePath, sha256: { base: await sha256(basePath), target: targetHashBefore, spec: await sha256(specPath), lineage: await sha256(lineagePath), ...(seedMaskPath ? { seedMask: await sha256(seedMaskPath) } : {}) } },
  output: { maskPath, sha256: await sha256(maskPath) },
  lineageChecks,
  metrics: {
    targetBaseDifferenceOutsideMask,
    targetBaseDifferencesOutsideReplacementZones,
    failedCells: failedCellSet.size,
    transparentMaskRgbNonZeroPixels: 0,
  },
  cells: extractionCells,
};
await fs.writeFile(extractionReportPath, `${JSON.stringify(extractionReport, null, 2)}\n`, 'utf8');

const runNode = (script, args, allowedCodes = [0]) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [script, ...args], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => allowedCodes.includes(code) ? resolve({ code, stdout, stderr }) : reject(new Error(`${script} exited ${code}\n${stderr || stdout}`)));
});
const writeAlphaMask = async (sourcePath, destinationPath) => {
  const source = await readImage(sourcePath);
  const mask = Buffer.alloc(PIXELS * CHANNELS);
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const sourceAt = pixel * CHANNELS;
    const alpha = source[sourceAt + 3];
    const maskAt = sourceAt;
    if (alpha > 0) { mask[maskAt] = 255; mask[maskAt + 1] = 255; mask[maskAt + 2] = 255; }
    mask[maskAt + 3] = alpha;
  }
  await sharp(mask, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png({ compressionLevel: 9 }).toFile(destinationPath);
};
const fullEmptyDirectionRows = (emptyCells) => {
  const rows = new Set();
  for (const row of [0, 1, 2, 3]) {
    if (emptyCells.filter((cell) => cell.row === row).length === COLUMNS) rows.add(row);
  }
  return [...rows].map((row) => ['front', 'side-right', 'back', 'special'][row]);
};
const buildLayerManifest = async (solveReport, manifestPath) => {
  const outputs = solveReport.outputs ?? {};
  const manifestLayers = {};
  let maximumUnchangedSupportPixels = 0;
  const maskDirectory = path.join(path.dirname(manifestPath), 'layer-masks');
  await fs.mkdir(maskDirectory, { recursive: true });
  const addContent = async (layer, imagePath) => {
    if (!imagePath) return;
    // The canonical target/base difference mask is the topology authority.
    // It may intentionally contain unchanged 4-connected bridge pixels;
    // the auditor requires that this exception is declared explicitly.
    const content = await readImage(imagePath);
    let unchangedSupportPixels = 0;
    for (let pixel = 0; pixel < PIXELS; pixel += 1) {
      if (maskBitmap[pixel] && content[pixel * CHANNELS + 3] === 0) unchangedSupportPixels += 1;
    }
    maximumUnchangedSupportPixels = Math.max(maximumUnchangedSupportPixels, unchangedSupportPixels);
    manifestLayers[layer] = { kind: 'content', image: path.resolve(imagePath), mask: path.resolve(maskPath) };
  };
  const addDestinationOut = async (layer, imagePath) => {
    if (!imagePath) return;
    const maskPath = path.join(maskDirectory, `${prefix}-${layer}-alpha-mask.png`);
    await writeAlphaMask(imagePath, maskPath);
    manifestLayers[layer] = { kind: 'destination-out', mask: maskPath };
  };
  if (outputs.rearPath) await addContent('rear', outputs.rearPath);
  if (outputs.erasePath) await addDestinationOut('erase', outputs.erasePath);
  if (outputs.patchPath) await addContent('patch', outputs.patchPath);
  else if (outputs.layerPath) await addContent('patch', outputs.layerPath);
  if (outputs.frontErasePath) await addDestinationOut('frontErase', outputs.frontErasePath);
  if (outputs.frontPath) await addContent('front', outputs.frontPath);
  const emptyCells = [
    ...(spec.topology?.emptyCells ?? []),
    ...(spec.layerManifest?.emptyCells ?? []),
  ].map((cell) => Array.isArray(cell) ? { row: cell[0], column: cell[1] } : cell);
  const declaredEmptyDirections = Array.isArray(spec.layerManifest?.emptyByDefault)
    ? spec.layerManifest.emptyByDefault
    : fullEmptyDirectionRows(emptyCells);
  const identity = {
    petId: publishConfig.petId ?? 'UNSET',
    stage: publishConfig.stage ?? 'UNSET',
    wearableId: publishConfig.wearableId ?? spec.wearableId ?? prefix,
    slot: publishConfig.slot ?? spec.publish?.slot ?? spec.slot ?? category,
  };
  const manifest = {
    schemaVersion: 1,
    identity,
    layerOrder: ['rear', 'erase', 'patch', 'frontErase', 'front'],
    geometry: { width: WIDTH, height: HEIGHT, cellWidth: CELL_WIDTH, cellHeight: CELL_HEIGHT, columns: COLUMNS, rows: ROWS, transformAllowed: false },
    target: targetPath,
    base: basePath,
    emptyByDefault: declaredEmptyDirections,
    maskPolicy: { allowUnchangedSupportPixels: true, maximumUnchangedSupportPixels },
    ...(Array.isArray(spec.layerManifest?.allowedHoles) ? { allowedHoles: spec.layerManifest.allowedHoles } : {}),
    layers: manifestLayers,
    provenance: {
      generatedBy: 'run-redrawn-wearable-batch.mjs',
      targetIsFrozenFullRedraw: true,
      compositeNeverUsedAsTarget: true,
      sourceCoordinateTransforms: { resized: false, rotated: false, shifted: false, stretched: false, resampled: false },
    },
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
};
const solveDirectory = path.join(outputDirectory, 'compositing');
const solvePrefix = `${prefix}-batch`;
let solveReport = null; let solveMathPass = null; let faceQaReport = null; let eraseReplacementQa = null; let frontEraseQa = null; let proof = null; let expectedComparison = null;
let layerManifestAudit = null;
let pipelinePass = extractionReport.verdict === 'PASS';
if (pipelinePass) {
  await fs.mkdir(solveDirectory, { recursive: true });
  const straddledLayers = ['back', 'aura'].includes(category) && spec.layering?.mode === 'rear-base-erase-patch-front';
  const frontEraseArg = frontEraseInputPath ?? '-';
  if (straddledLayers) {
    await runNode('scripts/solve-redrawn-straddled-layers.mjs', [targetPath, basePath, maskPath, specPath, solveDirectory, solvePrefix, frontEraseArg], [0, 2]);
  } else {
    await runNode('scripts/solve-redrawn-source-over-layer.mjs', [targetPath, basePath, maskPath, solveDirectory, solvePrefix, frontEraseArg], [0, 2]);
  }
  const solveReportPath = path.join(solveDirectory, `${solvePrefix}-report.json`);
  solveReport = JSON.parse(await fs.readFile(solveReportPath, 'utf8'));
  const metrics = solveReport.metrics;
  const maximumErasePixels = spec.solve?.maximumErasePixels ?? 0;
  const layerTransparentRgbNonZeroPixels = straddledLayers
    ? metrics.rearTransparentRgbNonZeroPixels + metrics.patchTransparentRgbNonZeroPixels + metrics.frontTransparentRgbNonZeroPixels
    : metrics.layerTransparentRgbNonZeroPixels;
  const mathPass = metrics.nonBinaryMaskAlphaPixels === 0 && metrics.maskTransparentRgbNonZeroPixels === 0
    && metrics.targetBaseDifferencesOutsideMask === 0 && metrics.unexpectedUnsolvablePixels === (spec.solve?.unexpectedUnsolvablePixels ?? 0)
    && metrics.forcedErasePixels <= maximumErasePixels && metrics.eraseOutsideMaskPixels === 0
    && (metrics.layerOutsideMaskPixels ?? 0) === 0 && layerTransparentRgbNonZeroPixels === 0
    && metrics.eraseTransparentRgbNonZeroPixels === 0
    && (metrics.frontEraseNonBinaryAlphaPixels ?? 0) === 0
    && (metrics.frontEraseTransparentRgbNonZeroPixels ?? 0) === 0
    && (metrics.frontEraseOutsideMaskPixels ?? 0) === 0
    && metrics.exactRgbaMismatchPixels === (spec.solve?.exactRgbaMismatchPixels ?? 0)
    && (!straddledLayers || (metrics.unassignedDifferencePixels === 0 && metrics.ambiguousSemanticRegionPixels === 0
      && metrics.rearUnsolvablePixels === 0 && metrics.eraseOutsideAllowedRegions === 0
      && metrics.ambiguousEraseRegionPixels === 0 && metrics.replacementLayerTargetMismatchPixels === 0
      && metrics.baseRgbaMismatchOutsideMaskPixels === 0
      && solveReport.verdict === 'DATA_PASS'));
  solveMathPass = mathPass;
  pipelinePass = pipelinePass && mathPass;

  const erasePolicy = spec.solve?.eraseReplacement ?? {};
  const allowedRegions = erasePolicy.allowedRegions ?? [];
  if (straddledLayers) {
    eraseReplacementQa = {
      verdict: solveReport.eraseReplacementRegions?.every((region) => region.verdict === 'PASS')
        && metrics.eraseOutsideAllowedRegions === 0 && metrics.ambiguousEraseRegionPixels === 0
        && metrics.replacementLayerTargetMismatchPixels === 0 ? 'PASS' : 'REJECT',
      policy: { mode: erasePolicy.mode ?? 'minimal-source-over-fallback', maximumErasePixels, requireLayerEqualsTargetAtErase: true },
      metrics: {
        erasePixels: metrics.forcedErasePixels,
        eraseOutsideAllowedRegions: metrics.eraseOutsideAllowedRegions,
        ambiguousEraseRegionPixels: metrics.ambiguousEraseRegionPixels,
        replacementLayerTargetMismatchPixels: metrics.replacementLayerTargetMismatchPixels,
        nonBinaryEraseAlphaPixels: 0,
        minimalFallbackProof: metrics.unexpectedUnsolvablePixels === 0,
      },
      regions: solveReport.eraseReplacementRegions ?? [],
    };
    await fs.writeFile(path.join(outputDirectory, `${prefix}-erase-replacement-qa.json`), `${JSON.stringify(eraseReplacementQa, null, 2)}\n`, 'utf8');
    pipelinePass = pipelinePass && eraseReplacementQa.verdict === 'PASS';
  } else {
  const [solvedLayer, solvedErase] = await Promise.all([
    readImage(solveReport.outputs.layerPath), readImage(solveReport.outputs.erasePath),
  ]);
  const regionCounts = allowedRegions.map(() => 0);
  let erasePixels = 0; let eraseOutsideAllowedRegions = 0; let ambiguousEraseRegionPixels = 0;
  let replacementLayerTargetMismatchPixels = 0; let nonBinaryEraseAlphaPixels = 0;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const at = pixel * CHANNELS; const eraseAlpha = solvedErase[at + 3];
    if (eraseAlpha !== 0 && eraseAlpha !== 255) nonBinaryEraseAlphaPixels += 1;
    if (eraseAlpha === 0) continue;
    erasePixels += 1;
    const x = pixel % WIDTH; const y = Math.floor(pixel / WIDTH);
    const row = Math.floor(y / CELL_HEIGHT); const column = Math.floor(x / CELL_WIDTH);
    const localPoint = [x - column * CELL_WIDTH, y - row * CELL_HEIGHT];
    const matches = allowedRegions
      .map((region, regionIndex) => ({ region, regionIndex }))
      .filter(({ region }) => region.row === row && region.column === column && zoneContains(region.zone, localPoint));
    if (matches.length === 0) eraseOutsideAllowedRegions += 1;
    else {
      if (matches.length > 1) ambiguousEraseRegionPixels += 1;
      regionCounts[matches[0].regionIndex] += 1;
    }
    if (solvedLayer[at] !== target[at] || solvedLayer[at + 1] !== target[at + 1]
      || solvedLayer[at + 2] !== target[at + 2] || solvedLayer[at + 3] !== target[at + 3]) replacementLayerTargetMismatchPixels += 1;
  }
  const regionResults = allowedRegions.map((region, index) => {
    const minimum = region.minimumPixels ?? 0; const maximum = region.maximumPixels ?? maximumErasePixels;
    return { id: region.id ?? `replacement-${index + 1}`, row: region.row, column: region.column, zone: region.zone, minimumPixels: minimum, maximumPixels: maximum, actualPixels: regionCounts[index], verdict: regionCounts[index] >= minimum && regionCounts[index] <= maximum ? 'PASS' : 'REJECT' };
  });
  const erasePolicyDeclaredWhenNeeded = maximumErasePixels === 0 || allowedRegions.length > 0;
  const minimalFallbackProof = erasePixels === metrics.forcedErasePixels && metrics.unexpectedUnsolvablePixels === 0;
  const eraseReplacementPass = erasePolicyDeclaredWhenNeeded && erasePixels <= maximumErasePixels
    && eraseOutsideAllowedRegions === 0 && ambiguousEraseRegionPixels === 0
    && replacementLayerTargetMismatchPixels === 0 && nonBinaryEraseAlphaPixels === 0
    && regionResults.every((region) => region.verdict === 'PASS') && minimalFallbackProof;
  eraseReplacementQa = {
    verdict: eraseReplacementPass ? 'PASS' : 'REJECT',
    policy: { mode: erasePolicy.mode ?? 'minimal-source-over-fallback', maximumErasePixels, requireLayerEqualsTargetAtErase: true },
    metrics: { erasePixels, eraseOutsideAllowedRegions, ambiguousEraseRegionPixels, replacementLayerTargetMismatchPixels, nonBinaryEraseAlphaPixels, minimalFallbackProof },
    regions: regionResults,
  };
  await fs.writeFile(path.join(outputDirectory, `${prefix}-erase-replacement-qa.json`), `${JSON.stringify(eraseReplacementQa, null, 2)}\n`, 'utf8');
  pipelinePass = pipelinePass && eraseReplacementPass;
  }

  // frontErase is gated from its explicit source/output pair, independently
  // of the composite. A missing source is valid for categories that do not
  // need a late anatomical mask, but an offered source must pass this gate.
  if (frontEraseInputPath) {
    const frontEraseQaPath = path.join(outputDirectory, `${prefix}-front-erase-qa.json`);
    await runNode('scripts/qa-redrawn-front-erase.mjs', [
      frontEraseInputPath, solveReport.outputs.frontErasePath, maskPath, frontEraseQaPath,
    ], [0, 2]);
    frontEraseQa = JSON.parse(await fs.readFile(frontEraseQaPath, 'utf8'));
    pipelinePass = pipelinePass && frontEraseQa.verdict === 'PASS';
  } else {
    frontEraseQa = {
      verdict: 'NOT_REQUIRED',
      sourcePolicy: { independentInputRequired: false, compositeRead: false, derivedFromComposite: false },
      outputPath: solveReport?.outputs?.frontErasePath ?? null,
    };
  }

  if (category === 'face') {
    const faceQaPath = path.join(outputDirectory, `${prefix}-face-aperture-qa.json`);
    await runNode('scripts/qa-face-wearable-apertures.mjs', [
      '--spec', specPath, '--mask', maskPath, '--base', basePath, '--target', targetPath,
      '--layer', solveReport.outputs.layerPath, '--erase', solveReport.outputs.erasePath, '--report', faceQaPath,
    ], [0, 2]);
    faceQaReport = JSON.parse(await fs.readFile(faceQaPath, 'utf8'));
    pipelinePass = pipelinePass && faceQaReport.verdict === 'DATA_PASS';
  }

  const proofDirectory = path.join(outputDirectory, 'proof-4x');
  const proofRun = await runNode('scripts/create-redrawn-per-cell-proof.mjs', [
    targetPath, solveReport.outputs.compositePath, proofDirectory, '4', partialRetry ? selectedCellNames.join(',') : 'all',
  ]);
  proof = JSON.parse(proofRun.stdout);

  if (expectedMaskPath || expectedReportPath) {
    expectedComparison = { verdict: 'PASS', maskDecodedMismatchPixels: null, outputDecodedMismatchPixels: {}, metricMismatches: [] };
    const compareDecoded = async (leftPath, rightPath) => {
      const [left, right] = await Promise.all([readImage(leftPath), readImage(rightPath)]); let mismatch = 0;
      for (let pixel = 0; pixel < PIXELS; pixel += 1) {
        const at = pixel * CHANNELS;
        if (left[at] !== right[at] || left[at + 1] !== right[at + 1] || left[at + 2] !== right[at + 2] || left[at + 3] !== right[at + 3]) mismatch += 1;
      }
      return mismatch;
    };
    if (expectedMaskPath) expectedComparison.maskDecodedMismatchPixels = await compareDecoded(maskPath, expectedMaskPath);
    if (expectedReportPath) {
      const expected = JSON.parse(await fs.readFile(expectedReportPath, 'utf8'));
      for (const key of ['layer', 'rear', 'patch', 'front', 'frontErase', 'erase', 'composite', 'diff']) {
        if (expected.outputs?.[`${key}Path`] && solveReport.outputs?.[`${key}Path`]) {
          expectedComparison.outputDecodedMismatchPixels[key] = await compareDecoded(solveReport.outputs[`${key}Path`], path.resolve(expected.outputs[`${key}Path`]));
        }
      }
      for (const key of ['exactRgbaMismatchPixels', 'enclosedMaskHolePixels', 'cellsWithOneFourConnectedComponent', 'forcedErasePixels', 'unexpectedUnsolvablePixels', 'targetBaseDifferencesOutsideMask', 'layerTransparentRgbNonZeroPixels', 'eraseTransparentRgbNonZeroPixels']) {
        if (expected.metrics?.[key] !== undefined && solveReport.metrics?.[key] !== expected.metrics[key]) expectedComparison.metricMismatches.push({ key, expected: expected.metrics[key], actual: solveReport.metrics?.[key] });
      }
    }
    const comparisonPass = (expectedComparison.maskDecodedMismatchPixels === null || expectedComparison.maskDecodedMismatchPixels === 0)
      && Object.values(expectedComparison.outputDecodedMismatchPixels).every((value) => value === 0)
      && expectedComparison.metricMismatches.length === 0;
    expectedComparison.verdict = comparisonPass ? 'PASS' : 'REJECT'; pipelinePass = pipelinePass && comparisonPass;
  }

  // Produce and audit an explicit rear/erase/patch/front layer manifest from
  // solver outputs. This is an additional independent recomposition check:
  // the frozen full redraw remains the target, while the audit recomposes from
  // the original base and declared layers only.
  const layerManifestPath = path.join(outputDirectory, `${prefix}-layer-manifest.json`);
  const layerManifestReportPath = path.join(outputDirectory, `${prefix}-layer-manifest-audit.json`);
  await buildLayerManifest(solveReport, layerManifestPath);
  const layerAuditRun = await runNode('scripts/audit-redrawn-layer-manifest.mjs', [layerManifestPath, layerManifestReportPath], [0, 2]);
  layerManifestAudit = JSON.parse(await fs.readFile(layerManifestReportPath, 'utf8'));
  layerManifestAudit.manifestPath = layerManifestPath;
  layerManifestAudit.reportPath = layerManifestReportPath;
  pipelinePass = pipelinePass && layerManifestAudit.publishable === true;
}

const targetHashAfter = await sha256(targetPath);
const targetImmutable = targetHashAfter === targetHashBefore;
pipelinePass = pipelinePass && targetImmutable;
const solverFailedCells = new Set();
for (const cell of solveReport?.cells ?? []) if (cell.exactRgbaMismatchPixels > 0 || cell.erasePixels > (spec.solve?.maximumErasePixels ?? 0)) solverFailedCells.add(cell.row * COLUMNS + cell.column);
for (const coordinate of solveReport?.unexpectedUnsolvableCoordinates ?? []) {
  solverFailedCells.add(Math.floor(coordinate.y / CELL_HEIGHT) * COLUMNS + Math.floor(coordinate.x / CELL_WIDTH));
}
for (const cellName of solveReport?.failedCells ?? []) {
  const match = /^r(\d+)c(\d+)$/.exec(cellName);
  if (match) solverFailedCells.add(Number(match[1]) * COLUMNS + Number(match[2]));
}
for (const cell of faceQaReport?.cells ?? []) if (cell.topologyVerdict !== 'PASS') solverFailedCells.add(cell.row * COLUMNS + cell.column);
for (const index of solverFailedCells) failedCellSet.add(index);
const failedCells = [...failedCellSet].sort((left, right) => left - right).map((index) => `r${Math.floor(index / COLUMNS)}c${index % COLUMNS}`);
const summaryPath = path.join(outputDirectory, `${prefix}-batch-summary.json`);
const markdownPath = path.join(outputDirectory, `${prefix}-batch-summary.md`);
const retryArguments = failedCells.length === 0 ? [] : [
  '--base', basePath, '--target', targetPath, '--spec', specPath, '--lineage', lineagePath,
  '--output', outputDirectory, '--prefix', prefix, '--retry-cells', failedCells.join(','), '--seed-mask', maskPath,
  ...(frontEraseInputPath ? ['--front-erase', frontEraseInputPath] : []),
  ...(dryRun ? ['--dry-run'] : []),
];
const summary = {
  verdict: pipelinePass ? 'DATA_PASS' : 'REJECT', mode: dryRun ? 'DRY_RUN_NO_PUBLISH' : 'OFFLINE_BUILD_NO_PUBLISH', category,
  noPublish: true, manifestOrRuntimeModified: false,
  geometry: { canvas: '800x640', cell: '160x160', transformed: false, resampled: false },
  lineage: { verdict: lineagePass && targetPredatesMask && targetImmutable ? 'PASS' : 'REJECT', targetHashBefore, targetHashAfter, targetImmutable, targetPredatesMask, checks: lineageChecks },
  extraction: { reportPath: extractionReportPath, verdict: extractionReport.verdict, maskPath, maskHash: extractionReport.output.sha256, selectedCells: selectedCellNames },
  solve: solveReport ? {
    solverVerdict: solveReport.verdict,
    solverMode: solveReport.layerOrder ? 'rear-base-erase-patch-front' : 'single-source-over-layer',
    mathVerdict: solveMathPass ? 'PASS' : 'REJECT',
    topologyAuthority: 'category spec / extraction report',
    reportPath: path.join(solveDirectory, `${solvePrefix}-report.json`), metrics: solveReport.metrics, outputs: solveReport.outputs,
  } : null,
  eraseReplacementQa,
  frontEraseQa,
  categoryQa: faceQaReport ? { verdict: faceQaReport.verdict, reportPath: path.join(outputDirectory, `${prefix}-face-aperture-qa.json`) } : { verdict: extractionReport.verdict },
  proof, expectedComparison, layerManifestAudit, failedCells,
  retry: { supported: true, mutationScope: 'only selected mask cells; global exact recomposition is always rechecked', command: failedCells.length ? [process.execPath, 'scripts/run-redrawn-wearable-batch.mjs', ...retryArguments] : null },
  publish: (() => {
    const requiredPublishFields = ['petId', 'stage', 'wearableId', 'slot'];
    const missing = requiredPublishFields.filter((field) => publishConfig[field] === undefined || publishConfig[field] === null || publishConfig[field] === '');
    const patchPath = category === 'aura' ? '-' : (solveReport?.outputs?.patchPath ?? solveReport?.outputs?.layerPath);
    const rearPath = solveReport?.outputs?.rearPath ?? '-';
    const frontPath = solveReport?.outputs?.frontPath ?? '-';
    const frontErasePath = frontEraseInputPath ? (solveReport?.outputs?.frontErasePath ?? '-') : '-';
    const args = missing.length || !solveReport ? null : [
      publishConfig.petId, String(publishConfig.stage), publishConfig.wearableId, publishConfig.slot,
      patchPath, solveReport.metrics.forcedErasePixels > 0 ? solveReport.outputs.erasePath : '-',
      rearPath, frontPath, (publishConfig.occludes ?? []).join(',') || '-', frontErasePath,
    ];
    const ready = pipelinePass && missing.length === 0 && Boolean(solveReport);
    return { executed: false, ready, missing, blockedByPipeline: !pipelinePass, script: 'scripts/publish-redrawn-wearable.mjs', args: ready ? args : null, command: ready && args ? [process.execPath, 'scripts/publish-redrawn-wearable.mjs', ...args] : null };
  })(),
  completedUtc: new Date().toISOString(),
};
await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
const markdown = [
  `# ${prefix} redrawn wearable batch`, '',
  `- Verdict: **${summary.verdict}**`,
  `- Mode: ${summary.mode}`, `- Category: ${category}`, '- Published: no',
  `- Target lineage: ${summary.lineage.verdict}`, `- Target immutable: ${targetImmutable ? 'PASS' : 'REJECT'}`,
  `- Canonical extraction: ${extractionReport.verdict}`, `- Target/base differences outside replacement zones: ${extractionReport.metrics.targetBaseDifferencesOutsideReplacementZones}`,
  `- Exact RGBA mismatch pixels: ${solveReport?.metrics?.exactRgbaMismatchPixels ?? 'not run'}`,
  `- Unexpected unsolvable pixels: ${solveReport?.metrics?.unexpectedUnsolvablePixels ?? 'not run'}`,
  `- Transparent layer RGB residue: ${solveReport ? (solveReport.metrics.layerTransparentRgbNonZeroPixels
    ?? ((solveReport.metrics.rearTransparentRgbNonZeroPixels ?? 0) + (solveReport.metrics.patchTransparentRgbNonZeroPixels ?? 0) + (solveReport.metrics.frontTransparentRgbNonZeroPixels ?? 0))) : 'not run'}`,
  `- Transparent erase RGB residue: ${solveReport?.metrics?.eraseTransparentRgbNonZeroPixels ?? 'not run'}`,
  `- Erase/replacement QA: ${eraseReplacementQa?.verdict ?? 'not run'}`,
  `- frontErase source QA: ${frontEraseQa?.verdict ?? 'not run'}`,
  `- Failed cells: ${failedCells.length ? failedCells.join(', ') : 'none'}`,
  `- 4x proof: ${proof?.contactSheetPath ?? 'not generated'}`,
  `- Expected PASS comparison: ${expectedComparison?.verdict ?? 'not requested'}`, '',
  `- Layer manifest audit: ${layerManifestAudit?.verdict ?? 'not run'}${layerManifestAudit?.reportPath ? ` — ${layerManifestAudit.reportPath}` : ''}`,
  `- Publish args ready: ${summary.publish.ready ? 'yes (not executed)' : 'no; missing ' + summary.publish.missing.join(', ')}`, '',
  'The pipeline never writes the game manifest or runtime. A frozen target with invalid or circular lineage is rejected before mask extraction.', '',
].join('\n');
await fs.writeFile(markdownPath, markdown, 'utf8');
console.log(JSON.stringify({ verdict: summary.verdict, summaryPath, markdownPath, maskPath, failedCells, proof: proof?.contactSheetPath ?? null, expectedComparison: expectedComparison?.verdict ?? null }, null, 2));
if (!pipelinePass) process.exitCode = 2;
