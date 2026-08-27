/**
 * Solve independent rear -> base -> minimal erase -> patch -> frontErase -> front layers
 * from a frozen target, bare base, canonical mask and semantic-region spec.
 * All inputs remain on the same 800x640 coordinates; no image is transformed.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [targetPath, basePath, maskPath, specPath, outputDirectory, prefix = 'back-straddled', frontErasePath = '-'] = process.argv.slice(2);
if (!targetPath || !basePath || !maskPath || !specPath || !outputDirectory) {
  console.error('usage: node scripts/solve-redrawn-straddled-layers.mjs <frozen-target> <base> <mask> <category-spec> <output-directory> [prefix] [front-erase-input|-]');
  process.exit(1);
}
const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
if (!['back', 'aura'].includes(spec.category)) throw new Error('straddled solver requires category "back" or "aura"');
const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const COLUMNS = 5; const ROWS = 4; const CHANNELS = 4; const PIXELS = WIDTH * HEIGHT;
const read = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT || result.info.channels !== CHANNELS) throw new Error(`${input} must decode to 800x640 RGBA`);
  return result.data;
};
const emptyAtlas = Buffer.alloc(PIXELS * CHANNELS);
const [target, base, mask, frontErase] = await Promise.all([
  read(targetPath), read(basePath), read(maskPath), frontErasePath === '-' ? emptyAtlas : read(frontErasePath),
]);
const sha256 = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const same = (left, right) => left[0] === right[0] && left[1] === right[1] && left[2] === right[2] && left[3] === right[3];
const rgbaAt = (buffer, at) => [buffer[at], buffer[at + 1], buffer[at + 2], buffer[at + 3]];
const writeRgba = (buffer, at, rgba) => { buffer[at] = rgba[0]; buffer[at + 1] = rgba[1]; buffer[at + 2] = rgba[2]; buffer[at + 3] = rgba[3]; };
const over = (background, foreground) => {
  const backgroundAlpha = background[3] / 255; const foregroundAlpha = foreground[3] / 255;
  const outputAlpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
  if (outputAlpha <= 0) return foregroundAlpha === 0 ? [...background] : [0, 0, 0, 0];
  return [
    Math.round((foreground[0] * foregroundAlpha + background[0] * backgroundAlpha * (1 - foregroundAlpha)) / outputAlpha),
    Math.round((foreground[1] * foregroundAlpha + background[1] * backgroundAlpha * (1 - foregroundAlpha)) / outputAlpha),
    Math.round((foreground[2] * foregroundAlpha + background[2] * backgroundAlpha * (1 - foregroundAlpha)) / outputAlpha),
    Math.round(outputAlpha * 255),
  ];
};
const channelCandidates = (ideal, targetChannel) => {
  const values = new Set();
  for (let offset = -4; offset <= 4; offset += 1) for (const value of [Math.round(ideal) + offset, Math.floor(ideal) + offset, Math.ceil(ideal) + offset]) {
    values.add(Math.max(0, Math.min(255, value)));
  }
  return [...values].sort((left, right) => Math.abs(left - targetChannel) - Math.abs(right - targetChannel));
};
const solveForeground = (background, wanted) => {
  if (same(background, wanted)) return [0, 0, 0, 0];
  const backgroundAlpha = background[3] / 255;
  for (let alphaByte = 255; alphaByte >= 1; alphaByte -= 1) {
    const alpha = alphaByte / 255; const outputAlpha = alpha + backgroundAlpha * (1 - alpha);
    if (Math.round(outputAlpha * 255) !== wanted[3]) continue;
    const channelOptions = [];
    let valid = true;
    for (let channel = 0; channel < 3; channel += 1) {
      const ideal = (wanted[channel] * outputAlpha - background[channel] * backgroundAlpha * (1 - alpha)) / alpha;
      const found = channelCandidates(ideal, wanted[channel]).find((value) => over(background, [
        channel === 0 ? value : 0, channel === 1 ? value : 0, channel === 2 ? value : 0, alphaByte,
      ])[channel] === wanted[channel]);
      if (found === undefined) { valid = false; break; }
      channelOptions.push(found);
    }
    if (!valid) continue;
    const candidate = [...channelOptions, alphaByte];
    if (same(over(background, candidate), wanted)) return candidate;
  }
  return null;
};
const solveRearUnderBase = (basePixel, wanted) => {
  if (same(basePixel, wanted)) return [0, 0, 0, 0];
  const baseAlpha = basePixel[3] / 255;
  if (baseAlpha >= 1) return null;
  for (let alphaByte = 255; alphaByte >= 1; alphaByte -= 1) {
    const rearAlpha = alphaByte / 255; const outputAlpha = baseAlpha + rearAlpha * (1 - baseAlpha);
    if (Math.round(outputAlpha * 255) !== wanted[3]) continue;
    const channels = []; let valid = true;
    for (let channel = 0; channel < 3; channel += 1) {
      const denominator = rearAlpha * (1 - baseAlpha);
      if (denominator <= 0) { valid = false; break; }
      const ideal = (wanted[channel] * outputAlpha - basePixel[channel] * baseAlpha) / denominator;
      const found = channelCandidates(ideal, wanted[channel]).find((value) => over([value, value, value, alphaByte], basePixel)[channel] === wanted[channel]);
      if (found === undefined) { valid = false; break; }
      channels.push(found);
    }
    if (!valid) continue;
    const candidate = [...channels, alphaByte];
    if (same(over(candidate, basePixel), wanted)) return candidate;
  }
  return null;
};

const semanticRegions = spec.layering?.semanticRegions ?? [];
if (semanticRegions.length === 0) throw new Error(`${spec.category} category requires layering.semanticRegions`);
const layers = new Set(['rear', 'patch', 'front']);
const allowedSemanticLayers = new Set(spec.layering?.allowedSemanticLayers ?? [...layers]);
for (const [index, region] of semanticRegions.entries()) {
  if (!layers.has(region.layer) || !allowedSemanticLayers.has(region.layer)
    || !Number.isInteger(region.row) || !Number.isInteger(region.column)
    || !Array.isArray(region.zone) || region.zone.length !== 4 || !region.semantic) throw new Error(`invalid semantic region ${index}`);
}
const pointInRegion = (region, row, column, localX, localY) => region.row === row && region.column === column
  && localX >= region.zone[0] && localX < region.zone[2] && localY >= region.zone[1] && localY < region.zone[3];
const assignments = new Int8Array(PIXELS); assignments.fill(-1);
const regionCounts = Array(semanticRegions.length).fill(0);
let targetBaseDifferencesOutsideMask = 0; let unassignedDifferencePixels = 0; let ambiguousSemanticRegionPixels = 0;
let nonBinaryMaskAlphaPixels = 0; let maskTransparentRgbNonZeroPixels = 0;
let frontEraseVisiblePixels = 0; let frontEraseNonBinaryAlphaPixels = 0;
let frontEraseTransparentRgbNonZeroPixels = 0; let frontEraseOutsideMaskPixels = 0;
const failedCellIndexes = new Set();
// frontErase is an explicitly authored late destination-out mask. Validate
// it independently from the composite and keep it source-coordinate exact.
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * CHANNELS;
  const alpha = frontErase[at + 3];
  if (alpha !== 0 && alpha !== 255) frontEraseNonBinaryAlphaPixels += 1;
  if (alpha === 0 && (frontErase[at] || frontErase[at + 1] || frontErase[at + 2])) frontEraseTransparentRgbNonZeroPixels += 1;
  if (alpha > 0) {
    frontEraseVisiblePixels += 1;
    if (mask[at + 3] === 0) frontEraseOutsideMaskPixels += 1;
  }
}
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * CHANNELS; const maskAlpha = mask[at + 3];
  if (maskAlpha !== 0 && maskAlpha !== 255) nonBinaryMaskAlphaPixels += 1;
  if (maskAlpha === 0 && (mask[at] || mask[at + 1] || mask[at + 2])) maskTransparentRgbNonZeroPixels += 1;
  const differs = !same(rgbaAt(target, at), rgbaAt(base, at));
  if (!differs) continue;
  const x = pixel % WIDTH; const y = Math.floor(pixel / WIDTH); const row = Math.floor(y / CELL); const column = Math.floor(x / CELL);
  const localX = x - column * CELL; const localY = y - row * CELL; const cellIndex = row * COLUMNS + column;
  if (maskAlpha === 0) { targetBaseDifferencesOutsideMask += 1; failedCellIndexes.add(cellIndex); }
  const matches = semanticRegions.map((region, regionIndex) => ({ region, regionIndex }))
    .filter(({ region }) => pointInRegion(region, row, column, localX, localY));
  if (matches.length === 0) { unassignedDifferencePixels += 1; failedCellIndexes.add(cellIndex); continue; }
  if (matches.length > 1) { ambiguousSemanticRegionPixels += 1; failedCellIndexes.add(cellIndex); continue; }
  assignments[pixel] = matches[0].regionIndex; regionCounts[matches[0].regionIndex] += 1;
}

const rear = Buffer.alloc(PIXELS * CHANNELS); const patch = Buffer.alloc(PIXELS * CHANNELS); const front = Buffer.alloc(PIXELS * CHANNELS);
const erase = Buffer.alloc(PIXELS * CHANNELS); const composite = Buffer.alloc(PIXELS * CHANNELS); const diff = Buffer.alloc(PIXELS * CHANNELS);
const afterRearBase = Buffer.alloc(PIXELS * CHANNELS);
let rearUnsolvablePixels = 0;
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * CHANNELS; const regionIndex = assignments[pixel]; const region = regionIndex >= 0 ? semanticRegions[regionIndex] : null;
  let rearPixel = [0, 0, 0, 0];
  if (region?.layer === 'rear') {
    const solution = solveRearUnderBase(rgbaAt(base, at), rgbaAt(target, at));
    if (!solution) { rearUnsolvablePixels += 1; failedCellIndexes.add(Math.floor(pixel / WIDTH / CELL) * COLUMNS + Math.floor((pixel % WIDTH) / CELL)); }
    else rearPixel = solution;
  }
  writeRgba(rear, at, rearPixel);
  // A transparent rear is a true no-op, including hidden RGB on alpha-zero
  // base pixels. This makes outside-mask preservation byte-exact.
  writeRgba(afterRearBase, at, rearPixel[3] === 0 ? rgbaAt(base, at) : over(rearPixel, rgbaAt(base, at)));
}

const eraseRegions = spec.solve?.eraseReplacement?.allowedRegions ?? [];
const eraseRegionCounts = Array(eraseRegions.length).fill(0);
let forcedErasePixels = 0; let unexpectedUnsolvablePixels = 0; let eraseOutsideAllowedRegions = 0;
let ambiguousEraseRegionPixels = 0; let replacementLayerTargetMismatchPixels = 0;
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * CHANNELS; const regionIndex = assignments[pixel];
  if (regionIndex < 0) continue;
  const region = semanticRegions[regionIndex];
  if (region.layer === 'rear') continue;
  const wanted = rgbaAt(target, at); const background = rgbaAt(afterRearBase, at);
  let solution = solveForeground(background, wanted); let erased = false;
  if (!solution) {
    const x = pixel % WIDTH; const y = Math.floor(pixel / WIDTH); const row = Math.floor(y / CELL); const column = Math.floor(x / CELL);
    const localX = x - column * CELL; const localY = y - row * CELL;
    const matches = eraseRegions.map((allowed, allowedIndex) => ({ allowed, allowedIndex }))
      .filter(({ allowed }) => pointInRegion(allowed, row, column, localX, localY) && (!allowed.layer || allowed.layer === region.layer));
    if (matches.length === 0) { unexpectedUnsolvablePixels += 1; eraseOutsideAllowedRegions += 1; failedCellIndexes.add(row * COLUMNS + column); continue; }
    if (matches.length > 1) { ambiguousEraseRegionPixels += 1; failedCellIndexes.add(row * COLUMNS + column); continue; }
    erased = true; forcedErasePixels += 1; eraseRegionCounts[matches[0].allowedIndex] += 1;
    writeRgba(erase, at, [255, 255, 255, 255]); solution = wanted;
  }
  writeRgba(region.layer === 'patch' ? patch : front, at, solution);
  if (erased && !same(solution, wanted)) replacementLayerTargetMismatchPixels += 1;
}

const eraseRegionResults = eraseRegions.map((region, index) => {
  const minimum = region.minimumPixels ?? 0; const maximum = region.maximumPixels ?? (spec.solve?.maximumErasePixels ?? 0);
  return { id: region.id ?? `erase-region-${index + 1}`, layer: region.layer ?? null, row: region.row, column: region.column, zone: region.zone, minimumPixels: minimum, maximumPixels: maximum, actualPixels: eraseRegionCounts[index], verdict: eraseRegionCounts[index] >= minimum && eraseRegionCounts[index] <= maximum ? 'PASS' : 'REJECT' };
});

let exactRgbaMismatchPixels = 0; let rearTransparentRgbNonZeroPixels = 0; let patchTransparentRgbNonZeroPixels = 0;
let frontTransparentRgbNonZeroPixels = 0; let eraseTransparentRgbNonZeroPixels = 0; let layerOutsideMaskPixels = 0; let eraseOutsideMaskPixels = 0;
let baseRgbaMismatchOutsideMaskPixels = 0;
const exactMismatchCells = Array(ROWS * COLUMNS).fill(0);
for (let pixel = 0; pixel < PIXELS; pixel += 1) {
  const at = pixel * CHANNELS;
  let result = rear[at + 3] === 0 ? rgbaAt(base, at) : over(rgbaAt(rear, at), rgbaAt(base, at));
  if (erase[at + 3] > 0) result = [0, 0, 0, 0];
  result = over(result, rgbaAt(patch, at));
  const lateEraseAlpha = frontErase[at + 3] / 255;
  if (lateEraseAlpha > 0) {
    const remainingAlpha = Math.round(result[3] * (1 - lateEraseAlpha));
    result = remainingAlpha > 0 ? [result[0], result[1], result[2], remainingAlpha] : [0, 0, 0, 0];
  }
  result = over(result, rgbaAt(front, at)); writeRgba(composite, at, result);
  if (mask[at + 3] === 0 && !same(result, rgbaAt(base, at))) baseRgbaMismatchOutsideMaskPixels += 1;
  if (!same(result, rgbaAt(target, at))) {
    exactRgbaMismatchPixels += 1; const cellIndex = Math.floor(pixel / WIDTH / CELL) * COLUMNS + Math.floor((pixel % WIDTH) / CELL);
    exactMismatchCells[cellIndex] += 1; failedCellIndexes.add(cellIndex); writeRgba(diff, at, [255, 24, 16, 255]);
  }
  for (const [buffer, key] of [[rear, 'rear'], [patch, 'patch'], [front, 'front'], [erase, 'erase']]) {
    if (buffer[at + 3] === 0 && (buffer[at] || buffer[at + 1] || buffer[at + 2])) {
      if (key === 'rear') rearTransparentRgbNonZeroPixels += 1;
      else if (key === 'patch') patchTransparentRgbNonZeroPixels += 1;
      else if (key === 'front') frontTransparentRgbNonZeroPixels += 1;
      else eraseTransparentRgbNonZeroPixels += 1;
    }
    if (buffer[at + 3] > 0 && mask[at + 3] === 0) {
      if (key === 'erase') eraseOutsideMaskPixels += 1; else layerOutsideMaskPixels += 1;
    }
  }
}

const DIR4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const topology = (buffer, row, column) => {
  const visible = new Uint8Array(CELL * CELL);
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) visible[y * CELL + x] = Number(buffer[(((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS) + 3] > 0);
  const seen = new Uint8Array(visible.length); let components = 0;
  for (let seed = 0; seed < visible.length; seed += 1) {
    if (!visible[seed] || seen[seed]) continue; components += 1; const queue = [seed]; seen[seed] = 1; let head = 0;
    while (head < queue.length) { const local = queue[head++]; const x = local % CELL; const y = Math.floor(local / CELL); for (const [dx, dy] of DIR4) { const nx = x + dx; const ny = y + dy; const next = ny * CELL + nx; if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL && visible[next] && !seen[next]) { seen[next] = 1; queue.push(next); } } }
  }
  const outside = new Uint8Array(visible.length); const queue = [];
  const push = (x, y) => { const local = y * CELL + x; if (outside[local] || visible[local]) return; outside[local] = 1; queue.push(local); };
  for (let x = 0; x < CELL; x += 1) { push(x, 0); push(x, CELL - 1); } for (let y = 0; y < CELL; y += 1) { push(0, y); push(CELL - 1, y); }
  let head = 0; while (head < queue.length) { const local = queue[head++]; const x = local % CELL; const y = Math.floor(local / CELL); for (const [dx, dy] of DIR4) { const nx = x + dx; const ny = y + dy; if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) push(nx, ny); } }
  let holes = 0; const holeSeen = new Uint8Array(visible.length);
  for (let seed = 0; seed < visible.length; seed += 1) {
    if (visible[seed] || outside[seed] || holeSeen[seed]) continue; holes += 1; const holeQueue = [seed]; holeSeen[seed] = 1; let holeHead = 0;
    while (holeHead < holeQueue.length) { const local = holeQueue[holeHead++]; const x = local % CELL; const y = Math.floor(local / CELL); for (const [dx, dy] of DIR4) { const nx = x + dx; const ny = y + dy; const next = ny * CELL + nx; if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL && !visible[next] && !outside[next] && !holeSeen[next]) { holeSeen[next] = 1; holeQueue.push(next); } } }
  }
  return { components, holes };
};
const topologySpecs = spec.layering?.topology?.layers ?? {};
const topologyCells = [];
for (const [layerName, buffer] of [['rear', rear], ['patch', patch], ['front', front]]) for (let row = 0; row < ROWS; row += 1) for (let column = 0; column < COLUMNS; column += 1) {
  const actual = topology(buffer, row, column); const layerSpec = topologySpecs[layerName] ?? {};
  const override = (layerSpec.cells ?? []).find((cell) => cell.row === row && cell.column === column) ?? {};
  const minimum = override.minimumComponents ?? override.expectedComponents ?? layerSpec.defaultMinimumComponents ?? 0;
  const maximum = override.maximumComponents ?? override.expectedComponents ?? layerSpec.defaultMaximumComponents ?? Number.MAX_SAFE_INTEGER;
  const expectedHoles = override.expectedHoles ?? layerSpec.defaultExpectedHoles ?? 0;
  const pass = actual.components >= minimum && actual.components <= maximum && actual.holes === expectedHoles;
  if (!pass) failedCellIndexes.add(row * COLUMNS + column);
  topologyCells.push({ layer: layerName, row, column, actualComponents: actual.components, minimumComponents: minimum, maximumComponents: maximum, actualHoles: actual.holes, expectedHoles, verdict: pass ? 'PASS' : 'REJECT' });
}

const semanticResults = semanticRegions.map((region, index) => {
  const minimum = region.minimumPixels ?? 1; const maximum = region.maximumPixels ?? CELL * CELL; const count = regionCounts[index];
  return { id: region.id ?? `semantic-${index + 1}`, layer: region.layer, semantic: region.semantic, row: region.row, column: region.column, zone: region.zone, minimumPixels: minimum, maximumPixels: maximum, actualDifferencePixels: count, verdict: count >= minimum && count <= maximum ? 'PASS' : 'REJECT' };
});
const requiredSemanticCoverage = spec.layering?.requiredSemanticCoverage ?? [];
const semanticCoverageResults = [];
for (const requirement of requiredSemanticCoverage) for (const row of requirement.rows ?? []) for (const column of requirement.columns ?? []) {
  const pixels = semanticResults.filter((region) => region.row === row && region.column === column && region.semantic === requirement.semantic && (!requirement.layers || requirement.layers.includes(region.layer))).reduce((sum, region) => sum + region.actualDifferencePixels, 0);
  const pass = pixels >= (requirement.minimumPixels ?? 1); if (!pass) failedCellIndexes.add(row * COLUMNS + column);
  semanticCoverageResults.push({ semantic: requirement.semantic, row, column, allowedLayers: requirement.layers ?? null, minimumPixels: requirement.minimumPixels ?? 1, actualPixels: pixels, verdict: pass ? 'PASS' : 'REJECT' });
}

await fs.mkdir(outputDirectory, { recursive: true });
const outputs = {
  rearPath: path.join(outputDirectory, `${prefix}-rear.png`), erasePath: path.join(outputDirectory, `${prefix}-erase.png`),
  patchPath: path.join(outputDirectory, `${prefix}-patch.png`), frontPath: path.join(outputDirectory, `${prefix}-front.png`),
  frontErasePath: path.join(outputDirectory, `${prefix}-front-erase.png`),
  compositePath: path.join(outputDirectory, `${prefix}-composite.png`), diffPath: path.join(outputDirectory, `${prefix}-diff.png`),
};
const write = (buffer, output) => sharp(buffer, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png({ compressionLevel: 9 }).toFile(output);
await Promise.all([
  write(rear, outputs.rearPath), write(erase, outputs.erasePath), write(patch, outputs.patchPath),
  write(front, outputs.frontPath), write(frontErase, outputs.frontErasePath),
  write(composite, outputs.compositePath), write(diff, outputs.diffPath),
]);
const maximumErasePixels = spec.solve?.maximumErasePixels ?? 0;
const metrics = {
  nonBinaryMaskAlphaPixels, maskTransparentRgbNonZeroPixels, targetBaseDifferencesOutsideMask,
  unassignedDifferencePixels, ambiguousSemanticRegionPixels, rearUnsolvablePixels, forcedErasePixels, unexpectedUnsolvablePixels,
  eraseOutsideAllowedRegions, ambiguousEraseRegionPixels, replacementLayerTargetMismatchPixels,
  layerOutsideMaskPixels, eraseOutsideMaskPixels, rearTransparentRgbNonZeroPixels, patchTransparentRgbNonZeroPixels,
  frontTransparentRgbNonZeroPixels, eraseTransparentRgbNonZeroPixels, baseRgbaMismatchOutsideMaskPixels, exactRgbaMismatchPixels,
  frontEraseVisiblePixels, frontEraseNonBinaryAlphaPixels, frontEraseTransparentRgbNonZeroPixels, frontEraseOutsideMaskPixels,
};
const accepted = Object.entries(metrics).every(([key, value]) => ['forcedErasePixels', 'frontEraseVisiblePixels'].includes(key)
  ? value <= (key === 'forcedErasePixels' ? maximumErasePixels : Number.MAX_SAFE_INTEGER) : value === 0)
  && eraseRegionResults.every((region) => region.verdict === 'PASS')
  && semanticResults.every((region) => region.verdict === 'PASS')
  && semanticCoverageResults.every((entry) => entry.verdict === 'PASS')
  && topologyCells.every((cell) => cell.verdict === 'PASS');
const report = {
  verdict: accepted ? 'DATA_PASS' : 'REJECT', category: spec.category,
  layerOrder: ['rear', 'base', 'minimal erase', 'patch', 'union frontErase', 'front'],
  geometry: { canvas: '800x640', cell: '160x160', resized: false, rotated: false, shifted: false, stretched: false, resampled: false },
  inputPolicy: {
    existingPublishedOutputRead: false,
    solvedOnlyFrom: ['frozen target', 'base', 'canonical mask', 'category semantic-region spec', ...(frontErasePath === '-' ? [] : ['explicit frontErase input'])],
    frontEraseInputPath: frontErasePath,
    frontEraseDerivedFromComposite: false,
  },
  metrics, exactMismatchCells, failedCells: [...failedCellIndexes].sort((a, b) => a - b).map((index) => `r${Math.floor(index / COLUMNS)}c${index % COLUMNS}`),
  semanticRegions: semanticResults, requiredSemanticCoverage: semanticCoverageResults,
  topologyCells, eraseReplacementRegions: eraseRegionResults,
  inputs: {
    targetPath, basePath, maskPath, specPath, frontErasePath,
    sha256: {
      target: await sha256(targetPath), base: await sha256(basePath), mask: await sha256(maskPath), spec: await sha256(specPath),
      ...(frontErasePath === '-' ? {} : { frontErase: await sha256(frontErasePath) }),
    },
  },
  outputs,
};
report.outputs.sha256 = Object.fromEntries(await Promise.all(Object.entries(outputs).map(async ([key, value]) => [key.replace(/Path$/, ''), await sha256(value)])));
const reportPath = path.join(outputDirectory, `${prefix}-report.json`); await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, metrics, failedCells: report.failedCells, reportPath, outputs }, null, 2));
if (!accepted) process.exitCode = 2;
