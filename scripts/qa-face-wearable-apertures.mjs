/**
 * Read-only, spec-driven QA for face wearables with intentional transparent
 * lens apertures. This does not author, alter, register, or resample artwork.
 *
 * The mask topology rules are deliberately different from solid headwear:
 * declared lens holes are required, undeclared enclosed holes are rejected,
 * and cells declared `mustBeEmpty` must contain no mask/layer/erase pixels.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const options = new Map();
for (let index = 0; index < argv.length; index += 1) {
  const key = argv[index];
  if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`missing value for ${key}`);
  options.set(key.slice(2), value);
  index += 1;
}

const specPath = options.get('spec');
const maskPath = options.get('mask');
const reportPath = options.get('report');
const basePath = options.get('base');
const targetPath = options.get('target');
const layerPath = options.get('layer');
const erasePath = options.get('erase');
if (!specPath) {
  console.error('usage: node scripts/qa-face-wearable-apertures.mjs --spec <spec.json> [--mask <mask.png> --report <report.json> --base <base> --target <target> --layer <layer> --erase <erase>]');
  process.exit(1);
}
if ((targetPath || layerPath || erasePath) && !maskPath) {
  throw new Error('--target/--layer/--erase require --mask');
}
if ((targetPath || layerPath) && !basePath) {
  throw new Error('--target/--layer require --base for independent source-over checks');
}
if (targetPath && !layerPath) throw new Error('--target requires --layer');

const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
const WIDTH = spec.atlas?.width;
const HEIGHT = spec.atlas?.height;
const CELL_WIDTH = spec.atlas?.cellWidth;
const CELL_HEIGHT = spec.atlas?.cellHeight;
const COLUMNS = spec.atlas?.columns;
const ROWS = spec.atlas?.rows;
const CHANNELS = 4;
const PIXELS = WIDTH * HEIGHT;
const checks = [];
const check = (name, passed, details = undefined) => {
  checks.push({ name, verdict: passed ? 'PASS' : 'REJECT', ...(details === undefined ? {} : { details }) });
  return passed;
};

const dimensionsAreValid = Number.isInteger(WIDTH) && Number.isInteger(HEIGHT)
  && Number.isInteger(CELL_WIDTH) && Number.isInteger(CELL_HEIGHT)
  && Number.isInteger(COLUMNS) && Number.isInteger(ROWS)
  && WIDTH === CELL_WIDTH * COLUMNS && HEIGHT === CELL_HEIGHT * ROWS;
check('spec atlas dimensions form an exact cell grid', dimensionsAreValid, spec.atlas);
check('face-01 atlas remains fixed at 800x640 with 160x160 cells',
  WIDTH === 800 && HEIGHT === 640 && CELL_WIDTH === 160 && CELL_HEIGHT === 160 && COLUMNS === 5 && ROWS === 4);

const expectedCellCount = COLUMNS * ROWS;
const cellsByIndex = new Map((spec.cells ?? []).map((cell) => [cell.index, cell]));
const emptyCellKeys = new Set((spec.cells ?? [])
  .filter((cell) => cell.mustBeEmpty === true)
  .map((cell) => `${cell.row}:${cell.column}`));
check('spec declares exactly one entry for every atlas cell',
  cellsByIndex.size === expectedCellCount && (spec.cells ?? []).length === expectedCellCount);
let specCellGeometryValid = true;
let declaredApertures = 0;
for (let index = 1; index <= expectedCellCount; index += 1) {
  const cell = cellsByIndex.get(index);
  if (!cell || cell.row !== Math.floor((index - 1) / COLUMNS) || cell.column !== (index - 1) % COLUMNS
    || !Number.isInteger(cell.trueApertures) || cell.trueApertures < 0
    || !Array.isArray(cell.apertureZones) || cell.apertureZones.length !== cell.trueApertures) {
    specCellGeometryValid = false;
    continue;
  }
  for (const zone of cell.apertureZones) {
    if (!Array.isArray(zone) || zone.length !== 4
      || zone.some((value) => !Number.isFinite(value))
      || zone[0] < 0 || zone[1] < 0 || zone[2] > CELL_WIDTH || zone[3] > CELL_HEIGHT
      || zone[0] >= zone[2] || zone[1] >= zone[3]) specCellGeometryValid = false;
  }
  declaredApertures += cell.trueApertures;
}
check('per-cell aperture declarations and search zones are structurally valid', specCellGeometryValid);
check('declared total aperture count matches the global rule',
  declaredApertures === spec.globalRules?.expectedTotalTrueLensApertures,
  { declaredApertures, expected: spec.globalRules?.expectedTotalTrueLensApertures });

const hash = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const readImage = async (input) => {
  const result = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (result.info.width !== WIDTH || result.info.height !== HEIGHT || result.info.channels !== CHANNELS) {
    throw new Error(`${input} must decode to ${WIDTH}x${HEIGHT} RGBA; got ${result.info.width}x${result.info.height}x${result.info.channels}`);
  }
  return result.data;
};
const localToAt = (row, column, x, y) => ((((row * CELL_HEIGHT + y) * WIDTH) + column * CELL_WIDTH + x) * CHANNELS);
const neighbors4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

const analyzeCellTopology = (mask, row, column) => {
  const size = CELL_WIDTH * CELL_HEIGHT;
  const componentSeen = new Uint8Array(size);
  const components = [];
  for (let seedY = 0; seedY < CELL_HEIGHT; seedY += 1) for (let seedX = 0; seedX < CELL_WIDTH; seedX += 1) {
    const seed = seedY * CELL_WIDTH + seedX;
    if (componentSeen[seed] || mask[localToAt(row, column, seedX, seedY) + 3] === 0) continue;
    const queue = [seed]; componentSeen[seed] = 1; let head = 0;
    let area = 0; let minX = CELL_WIDTH; let minY = CELL_HEIGHT; let maxX = -1; let maxY = -1;
    while (head < queue.length) {
      const local = queue[head++]; const x = local % CELL_WIDTH; const y = Math.floor(local / CELL_WIDTH);
      area += 1; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const [offsetX, offsetY] of neighbors4) {
        const nextX = x + offsetX; const nextY = y + offsetY;
        if (nextX < 0 || nextX >= CELL_WIDTH || nextY < 0 || nextY >= CELL_HEIGHT) continue;
        const next = nextY * CELL_WIDTH + nextX;
        if (componentSeen[next] || mask[localToAt(row, column, nextX, nextY) + 3] === 0) continue;
        componentSeen[next] = 1; queue.push(next);
      }
    }
    components.push({ area, bbox: [minX, minY, maxX + 1, maxY + 1] });
  }

  const outside = new Uint8Array(size); const outsideQueue = [];
  const pushOutside = (x, y) => {
    const local = y * CELL_WIDTH + x;
    if (outside[local] || mask[localToAt(row, column, x, y) + 3] > 0) return;
    outside[local] = 1; outsideQueue.push(local);
  };
  for (let x = 0; x < CELL_WIDTH; x += 1) { pushOutside(x, 0); pushOutside(x, CELL_HEIGHT - 1); }
  for (let y = 0; y < CELL_HEIGHT; y += 1) { pushOutside(0, y); pushOutside(CELL_WIDTH - 1, y); }
  let outsideHead = 0;
  while (outsideHead < outsideQueue.length) {
    const local = outsideQueue[outsideHead++]; const x = local % CELL_WIDTH; const y = Math.floor(local / CELL_WIDTH);
    for (const [offsetX, offsetY] of neighbors4) {
      const nextX = x + offsetX; const nextY = y + offsetY;
      if (nextX >= 0 && nextX < CELL_WIDTH && nextY >= 0 && nextY < CELL_HEIGHT) pushOutside(nextX, nextY);
    }
  }

  const holeSeen = new Uint8Array(size);
  const holeLabels = new Int16Array(size); holeLabels.fill(-1);
  const holes = [];
  for (let seedY = 0; seedY < CELL_HEIGHT; seedY += 1) for (let seedX = 0; seedX < CELL_WIDTH; seedX += 1) {
    const seed = seedY * CELL_WIDTH + seedX;
    if (outside[seed] || holeSeen[seed] || mask[localToAt(row, column, seedX, seedY) + 3] > 0) continue;
    const label = holes.length; const queue = [seed]; holeSeen[seed] = 1; holeLabels[seed] = label; let head = 0;
    let area = 0; let minX = CELL_WIDTH; let minY = CELL_HEIGHT; let maxX = -1; let maxY = -1; let sumX = 0; let sumY = 0;
    while (head < queue.length) {
      const local = queue[head++]; const x = local % CELL_WIDTH; const y = Math.floor(local / CELL_WIDTH);
      area += 1; sumX += x; sumY += y;
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      for (const [offsetX, offsetY] of neighbors4) {
        const nextX = x + offsetX; const nextY = y + offsetY;
        if (nextX < 0 || nextX >= CELL_WIDTH || nextY < 0 || nextY >= CELL_HEIGHT) continue;
        const next = nextY * CELL_WIDTH + nextX;
        if (outside[next] || holeSeen[next] || mask[localToAt(row, column, nextX, nextY) + 3] > 0) continue;
        holeSeen[next] = 1; holeLabels[next] = label; queue.push(next);
      }
    }
    const width = maxX - minX + 1; const height = maxY - minY + 1;
    holes.push({
      area, bbox: [minX, minY, maxX + 1, maxY + 1], width, height,
      aspectRatio: Math.max(width / height, height / width),
      centroid: [sumX / area, sumY / area],
    });
  }
  return { components, holes, holeLabels };
};

const zoneContains = (zone, x, y) => x >= zone[0] && x < zone[2] && y >= zone[1] && y < zone[3];
const chooseEyeFeature = (base, row, column, zone) => {
  // The aperture zone is deliberately narrow enough that the nearest dark
  // connected feature to its centre is the corresponding iris/pupil or
  // closed-eye stroke. This is evidence for aperture alignment, not a
  // replacement for visual semantic review.
  const [x0, y0, x1, y1] = zone.map(Math.round);
  const zoneWidth = x1 - x0; const zoneHeight = y1 - y0; const seen = new Uint8Array(zoneWidth * zoneHeight);
  const isEyeInkCandidate = (x, y) => {
    const at = localToAt(row, column, x, y); const red = base[at]; const green = base[at + 1]; const blue = base[at + 2];
    return base[at + 3] >= 128 && ((red < 125 && green < 100 && blue < 90) || (red < 80 && green < 80 && blue < 80));
  };
  const candidates = [];
  for (let seedY = y0; seedY < y1; seedY += 1) for (let seedX = x0; seedX < x1; seedX += 1) {
    const seed = (seedY - y0) * zoneWidth + seedX - x0;
    if (seen[seed] || !isEyeInkCandidate(seedX, seedY)) continue;
    const queue = [[seedX, seedY]]; seen[seed] = 1; let head = 0; const pixels = []; let sumX = 0; let sumY = 0;
    while (head < queue.length) {
      const [x, y] = queue[head++]; pixels.push([x, y]); sumX += x; sumY += y;
      for (const [offsetX, offsetY] of [...neighbors4, [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const nextX = x + offsetX; const nextY = y + offsetY;
        if (nextX < x0 || nextX >= x1 || nextY < y0 || nextY >= y1) continue;
        const next = (nextY - y0) * zoneWidth + nextX - x0;
        if (seen[next] || !isEyeInkCandidate(nextX, nextY)) continue;
        seen[next] = 1; queue.push([nextX, nextY]);
      }
    }
    if (pixels.length >= 2) {
      const centroid = [sumX / pixels.length, sumY / pixels.length];
      const zoneCenter = [(x0 + x1 - 1) / 2, (y0 + y1 - 1) / 2];
      const distanceToZoneCenter = Math.hypot(centroid[0] - zoneCenter[0], centroid[1] - zoneCenter[1]);
      candidates.push({ pixels, area: pixels.length, centroid, distanceToZoneCenter });
    }
  }
  candidates.sort((left, right) => left.distanceToZoneCenter - right.distanceToZoneCenter || right.area - left.area);
  return candidates[0] ?? null;
};

let mask; let base; let target; let layer; let erase;
const inputs = { specPath, sha256: { spec: await hash(specPath) } };
const cells = [];
const metrics = {};
if (maskPath) {
  [mask, base, target, layer, erase] = await Promise.all([
    readImage(maskPath), basePath ? readImage(basePath) : null, targetPath ? readImage(targetPath) : null,
    layerPath ? readImage(layerPath) : null, erasePath ? readImage(erasePath) : null,
  ]);
  Object.assign(inputs, { maskPath, basePath, targetPath, layerPath, erasePath });
  inputs.sha256.mask = await hash(maskPath);
  if (basePath) inputs.sha256.base = await hash(basePath);
  if (targetPath) inputs.sha256.target = await hash(targetPath);
  if (layerPath) inputs.sha256.layer = await hash(layerPath);
  if (erasePath) inputs.sha256.erase = await hash(erasePath);

  let nonBinaryMaskAlphaPixels = 0; let maskTransparentRgbNonZeroPixels = 0; let maskPixels = 0;
  for (let pixel = 0; pixel < PIXELS; pixel += 1) {
    const at = pixel * CHANNELS; const alpha = mask[at + 3];
    if (alpha !== 0 && alpha !== 255) nonBinaryMaskAlphaPixels += 1;
    if (alpha > 0) maskPixels += 1;
    if (alpha === 0 && (mask[at] !== 0 || mask[at + 1] !== 0 || mask[at + 2] !== 0)) maskTransparentRgbNonZeroPixels += 1;
  }
  Object.assign(metrics, { maskPixels, nonBinaryMaskAlphaPixels, maskTransparentRgbNonZeroPixels });
  check('mask alpha is binary', nonBinaryMaskAlphaPixels === 0, nonBinaryMaskAlphaPixels);
  check('mask transparent RGB is zero', maskTransparentRgbNonZeroPixels === 0, maskTransparentRgbNonZeroPixels);

  let totalHoles = 0; let topologyRejectCells = 0; let backNonEmptyCells = 0; let uncoveredEyeFeaturePixels = 0; let coveredEyeFeaturePixels = 0;
  const shapeRule = spec.globalRules?.apertureShape ?? {};
  for (let index = 1; index <= expectedCellCount; index += 1) {
    const declaration = cellsByIndex.get(index);
    const { row, column } = declaration;
    const topology = analyzeCellTopology(mask, row, column);
    totalHoles += topology.holes.length;
    const maskCellPixels = topology.components.reduce((sum, component) => sum + component.area, 0);
    const mustBeEmpty = declaration.mustBeEmpty === true;
    const expectedComponents = mustBeEmpty ? 0 : spec.globalRules.nonBackVisibleLayerComponents4ConnectedPerCell;
    const matchedHoleIndexes = new Set(); const apertures = [];
    for (let apertureIndex = 0; apertureIndex < declaration.apertureZones.length; apertureIndex += 1) {
      const zone = declaration.apertureZones[apertureIndex];
      const candidates = topology.holes
        .map((hole, holeIndex) => ({ hole, holeIndex }))
        .filter(({ hole, holeIndex }) => !matchedHoleIndexes.has(holeIndex) && zoneContains(zone, hole.centroid[0], hole.centroid[1]))
        .sort((left, right) => {
          const zoneCenterX = (zone[0] + zone[2]) / 2; const zoneCenterY = (zone[1] + zone[3]) / 2;
          return Math.hypot(left.hole.centroid[0] - zoneCenterX, left.hole.centroid[1] - zoneCenterY)
            - Math.hypot(right.hole.centroid[0] - zoneCenterX, right.hole.centroid[1] - zoneCenterY);
        });
      const match = candidates[0] ?? null;
      if (match) matchedHoleIndexes.add(match.holeIndex);
      const shapePass = match !== null
        && match.hole.width >= shapeRule.minWidth && match.hole.height >= shapeRule.minHeight
        && match.hole.aspectRatio <= shapeRule.maxAspectRatio;
      let eyeFeature = null; let eyeFeatureInsideAperture = null; let eyeFeatureCoveredPixels = null;
      if (base && shapeRule.mustContainBaseEyeCentroid) {
        eyeFeature = chooseEyeFeature(base, row, column, zone);
        if (eyeFeature && match) {
          const eyeX = Math.max(0, Math.min(CELL_WIDTH - 1, Math.round(eyeFeature.centroid[0])));
          const eyeY = Math.max(0, Math.min(CELL_HEIGHT - 1, Math.round(eyeFeature.centroid[1])));
          eyeFeatureInsideAperture = topology.holeLabels[eyeY * CELL_WIDTH + eyeX] === match.holeIndex;
          eyeFeatureCoveredPixels = eyeFeature.pixels.filter(([x, y]) => mask[localToAt(row, column, x, y) + 3] > 0).length;
          coveredEyeFeaturePixels += eyeFeatureCoveredPixels;
          uncoveredEyeFeaturePixels += eyeFeature.pixels.length - eyeFeatureCoveredPixels;
        } else {
          eyeFeatureInsideAperture = false; eyeFeatureCoveredPixels = eyeFeature?.pixels.length ?? 0;
          coveredEyeFeaturePixels += eyeFeatureCoveredPixels;
        }
      }
      apertures.push({
        apertureIndex, zone, matchedHoleIndex: match?.holeIndex ?? null, hole: match?.hole ?? null,
        shapePass,
        eyeFeature: eyeFeature ? { area: eyeFeature.area, centroid: eyeFeature.centroid } : null,
        eyeFeatureInsideAperture, eyeFeatureCoveredPixels,
      });
    }
    const allExpectedAperturesMatch = apertures.every((aperture) => aperture.shapePass)
      && matchedHoleIndexes.size === declaration.trueApertures && topology.holes.length === declaration.trueApertures;
    const eyeEvidencePass = !shapeRule.mustContainBaseEyeCentroid
      || (base !== null && apertures.every((aperture) => aperture.eyeFeatureInsideAperture === true && aperture.eyeFeatureCoveredPixels === 0));
    const backEmptyPass = !mustBeEmpty || maskCellPixels === 0;
    const topologyPass = topology.components.length === expectedComponents && allExpectedAperturesMatch && eyeEvidencePass && backEmptyPass;
    if (!topologyPass) topologyRejectCells += 1;
    if (mustBeEmpty && maskCellPixels !== 0) backNonEmptyCells += 1;
    cells.push({
      index, row, column, view: declaration.view, mustBeEmpty, maskPixels: maskCellPixels,
      expectedComponents4Connected: expectedComponents, actualComponents4Connected: topology.components.length,
      expectedApertures: declaration.trueApertures, actualEnclosedTransparentComponents: topology.holes.length,
      components: topology.components, enclosedTransparentComponents: topology.holes,
      apertures, topologyVerdict: topologyPass ? 'PASS' : 'REJECT',
    });
  }
  Object.assign(metrics, { totalEnclosedTransparentComponents: totalHoles, topologyRejectCells, backNonEmptyCells, uncoveredEyeFeaturePixels, coveredEyeFeaturePixels });
  check('every cell matches its declared component and aperture topology', topologyRejectCells === 0, { topologyRejectCells });
  check('total enclosed transparent components equals declared true lens apertures', totalHoles === declaredApertures, { totalHoles, declaredApertures });
  check('declared empty back cells contain no mask pixels', backNonEmptyCells === 0, { backNonEmptyCells });
  if (shapeRule.mustContainBaseEyeCentroid) {
    check('base eye-feature evidence is supplied', base !== null, { basePath: basePath ?? null });
    if (base) check('each aperture contains its corresponding base eye feature without mask coverage', coveredEyeFeaturePixels === 0 && cells.every((cell) => cell.apertures.every((aperture) => aperture.eyeFeatureInsideAperture !== false)), { coveredEyeFeaturePixels });
  }

  const analyzeOptionalAsset = (data, name, requireBinaryAlpha) => {
    if (!data) return null;
    let transparentRgbNonZeroPixels = 0; let outsideMaskPixels = 0; let backPixels = 0; let nonBinaryAlphaPixels = 0; let visiblePixels = 0;
    for (let pixel = 0; pixel < PIXELS; pixel += 1) {
      const at = pixel * CHANNELS; const alpha = data[at + 3];
      const row = Math.floor(pixel / WIDTH / CELL_HEIGHT); const column = Math.floor((pixel % WIDTH) / CELL_WIDTH);
      if (requireBinaryAlpha && alpha !== 0 && alpha !== 255) nonBinaryAlphaPixels += 1;
      if (alpha > 0) {
        visiblePixels += 1;
        if (mask[at + 3] === 0) outsideMaskPixels += 1;
        if (emptyCellKeys.has(`${row}:${column}`)) backPixels += 1;
      }
      if (alpha === 0 && (data[at] !== 0 || data[at + 1] !== 0 || data[at + 2] !== 0)) transparentRgbNonZeroPixels += 1;
    }
    Object.assign(metrics, {
      [`${name}VisiblePixels`]: visiblePixels,
      [`${name}TransparentRgbNonZeroPixels`]: transparentRgbNonZeroPixels,
      [`${name}OutsideMaskPixels`]: outsideMaskPixels,
      [`${name}BackPixels`]: backPixels,
      ...(requireBinaryAlpha ? { [`${name}NonBinaryAlphaPixels`]: nonBinaryAlphaPixels } : {}),
    });
    check(`${name} transparent RGB is zero`, transparentRgbNonZeroPixels === 0, transparentRgbNonZeroPixels);
    check(`${name} alpha remains inside the face mask`, outsideMaskPixels === 0, outsideMaskPixels);
    check(`${name} is empty in the back row`, backPixels === 0, backPixels);
    if (requireBinaryAlpha) check(`${name} alpha is binary`, nonBinaryAlphaPixels === 0, nonBinaryAlphaPixels);
    return { visiblePixels };
  };
  analyzeOptionalAsset(layer, 'layer', false);
  const eraseSummary = analyzeOptionalAsset(erase, 'erase', true);
  if (eraseSummary) check('face-01 erase is zero unless separately approved point-by-point', eraseSummary.visiblePixels === 0, eraseSummary);

  if (target && base && layer) {
    let targetBaseDifferencesOutsideCoverage = 0; let exactRgbaMismatchPixels = 0;
    const cellExactMismatches = Array(expectedCellCount).fill(0);
    for (let pixel = 0; pixel < PIXELS; pixel += 1) {
      const at = pixel * CHANNELS; const erased = erase ? erase[at + 3] > 0 : false;
      const covered = mask[at + 3] > 0 || erased;
      if (!covered && [0, 1, 2, 3].some((channel) => target[at + channel] !== base[at + channel])) targetBaseDifferencesOutsideCoverage += 1;
      const baseAlpha = erased ? 0 : base[at + 3] / 255; const layerAlpha = layer[at + 3] / 255;
      const outputAlpha = layerAlpha + baseAlpha * (1 - layerAlpha);
      const result = [0, 0, 0, 0];
      if (outputAlpha <= 0) {
        if (!erased && layerAlpha === 0) {
          result[0] = base[at]; result[1] = base[at + 1]; result[2] = base[at + 2]; result[3] = base[at + 3];
        }
      } else {
        for (let channel = 0; channel < 3; channel += 1) {
          result[channel] = Math.round((layer[at + channel] * layerAlpha + base[at + channel] * baseAlpha * (1 - layerAlpha)) / outputAlpha);
        }
        result[3] = Math.round(outputAlpha * 255);
      }
      if ([0, 1, 2, 3].some((channel) => result[channel] !== target[at + channel])) {
        exactRgbaMismatchPixels += 1;
        const row = Math.floor(pixel / WIDTH / CELL_HEIGHT); const column = Math.floor((pixel % WIDTH) / CELL_WIDTH);
        cellExactMismatches[row * COLUMNS + column] += 1;
      }
    }
    Object.assign(metrics, { targetBaseDifferencesOutsideCoverage, exactRgbaMismatchPixels, cellExactMismatches });
    check('target and base are exact outside mask/erase coverage', targetBaseDifferencesOutsideCoverage === 0, targetBaseDifferencesOutsideCoverage);
    check('independent fixed-coordinate base+erase+layer source-over exactly matches target RGBA', exactRgbaMismatchPixels === 0, { exactRgbaMismatchPixels, cellExactMismatches });
  }
}

const hasCandidate = Boolean(maskPath);
const accepted = checks.every((entry) => entry.verdict === 'PASS');
const report = {
  verdict: hasCandidate ? (accepted ? 'DATA_PASS' : 'REJECT') : (accepted ? 'SPEC_PASS_NO_CANDIDATE' : 'SPEC_REJECT'),
  mode: hasCandidate ? 'read-only candidate QA' : 'spec-only preflight',
  geometry: { width: WIDTH, height: HEIGHT, cellWidth: CELL_WIDTH, cellHeight: CELL_HEIGHT, columns: COLUMNS, rows: ROWS, resized: false, rotated: false, shifted: false, stretched: false, resampled: false },
  topologyPolicy: {
    intentionalTransparentHoles: 'exactly the per-cell declared lens apertures',
    undeclaredEnclosedTransparentComponents: 'REJECT',
    emptyCells: 'zero mask/layer/erase alpha',
  },
  transparentRgbPolicy: 'mask/layer/erase RGB must be zero wherever their alpha is zero',
  checks, metrics, cells, inputs,
  limitations: [
    'Eye-feature detection is deterministic evidence derived from the frozen base within declared aperture zones; it does not replace visual semantic review.',
    'Gold/brown glasses and orange/cream fur overlap in colour, so pet-pixel contamination still requires source-coordinate review or an independently approved protection mask.',
  ],
};
if (reportPath) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify(report, null, 2));
if (!accepted) process.exitCode = 2;
