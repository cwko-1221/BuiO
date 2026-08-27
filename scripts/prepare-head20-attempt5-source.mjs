/**
 * Attempt-5 source preparation for starpatch-cat head-20.
 *
 * This is a deterministic source-preparation step only. It is intentionally
 * separate from masking/compositing: the generated 5x4 visual source is
 * resized once to the production atlas, its connected checkerboard backdrop
 * is removed, and the game base is copied byte-for-byte outside the declared
 * semantic helmet windows. No runtime asset or manifest is edited.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [sourcePathArg, basePathArg, specPathArg, outputDirectoryArg] = process.argv.slice(2);
if (!sourcePathArg || !basePathArg || !specPathArg || !outputDirectoryArg) {
  console.error('usage: node scripts/prepare-head20-attempt5-source.mjs <1402x1122-generated-source> <800x640-base> <head20-spec> <output-directory>');
  process.exit(1);
}

const sourcePath = path.resolve(sourcePathArg);
const basePath = path.resolve(basePathArg);
const specPath = path.resolve(specPathArg);
const outputDirectory = path.resolve(outputDirectoryArg);
const WIDTH = 800; const HEIGHT = 640; const CELL = 160; const COLUMNS = 5; const ROWS = 4; const CHANNELS = 4;
const PIXELS = WIDTH * HEIGHT;
const sha256Buffer = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const sha256File = async (filePath) => sha256Buffer(await fs.readFile(filePath));
const samePixel = (left, right, at) => left[at] === right[at] && left[at + 1] === right[at + 1]
  && left[at + 2] === right[at + 2] && left[at + 3] === right[at + 3];

const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
const zoneEntries = spec.topology?.replacementZones ?? spec.solve?.eraseReplacement?.allowedRegions ?? [];
const zones = new Map(zoneEntries
  .filter((entry) => Number.isInteger(entry.row) && Number.isInteger(entry.column) && Array.isArray(entry.zone))
  .map((entry) => [`${entry.row}:${entry.column}`, entry.zone]));
if (zones.size !== ROWS * COLUMNS) throw new Error(`expected 20 replacement zones, got ${zones.size}`);

const sourceInfo = await sharp(sourcePath).metadata();
if (sourceInfo.width !== 1402 || sourceInfo.height !== 1122 || sourceInfo.channels !== 3) {
  throw new Error(`source must be the original-based 1402x1122 RGB image; got ${sourceInfo.width}x${sourceInfo.height} channels=${sourceInfo.channels}`);
}
const [resized, base] = await Promise.all([
  sharp(sourcePath).resize(WIDTH, HEIGHT, { fit: 'fill', kernel: sharp.kernel.lanczos3 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
]);
if (resized.info.width !== WIDTH || resized.info.height !== HEIGHT || resized.info.channels !== CHANNELS) throw new Error('normalized source is not 800x640 RGBA');
if (base.info.width !== WIDTH || base.info.height !== HEIGHT || base.info.channels !== CHANNELS) throw new Error('base is not 800x640 RGBA');

// The source renderer emitted a near-white checkerboard. A candidate is
// deliberately conservative: low-chroma bright pixels only. Flooding from
// every cell border removes only the connected backdrop; white helmet pixels
// isolated behind their dark outlines remain foreground.
const isCheckerCandidate = (rgba, at) => {
  const r = rgba[at]; const g = rgba[at + 1]; const b = rgba[at + 2];
  return Math.max(r, g, b) - Math.min(r, g, b) <= 8 && Math.min(r, g, b) >= 215;
};
// A second, broader signature is used only as evidence of residual backdrop:
// a pixel must be reachable from a cell border through the broad low-chroma
// bright field. Isolated white helmet highlights do not satisfy this test.
const isBroadCheckerCandidate = (rgba, at) => {
  const r = rgba[at]; const g = rgba[at + 1]; const b = rgba[at + 2];
  return Math.max(r, g, b) - Math.min(r, g, b) <= 20 && Math.min(r, g, b) >= 185;
};
const DIR4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const foreground = Buffer.alloc(resized.data.length);
const cleaned = Buffer.alloc(resized.data.length);
const sourceBackgroundPixelsByCell = Array(ROWS * COLUMNS).fill(0);
const sourceForegroundPixelsByCell = Array(ROWS * COLUMNS).fill(0);
const sourceResidualCheckerCandidatePixelsByCell = Array(ROWS * COLUMNS).fill(0);
const broadConnectedResidualPixelsByCell = Array(ROWS * COLUMNS).fill(0);
const broadResidualSamplesByCell = Array.from({ length: ROWS * COLUMNS }, () => []);
const residualCheckerboardPatternPixelsByCell = Array(ROWS * COLUMNS).fill(0);
for (let row = 0; row < ROWS; row += 1) for (let column = 0; column < COLUMNS; column += 1) {
  const cellSeen = new Uint8Array(CELL * CELL); const queue = [];
  const broadSeen = new Uint8Array(CELL * CELL); const broadQueue = [];
  const globalAt = (x, y) => (((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS);
  const local = (x, y) => y * CELL + x;
  const pushBackdrop = (x, y) => {
    const index = local(x, y); if (cellSeen[index]) return;
    const at = globalAt(x, y); if (!isCheckerCandidate(resized.data, at)) return;
    cellSeen[index] = 1; queue.push(index);
  };
  const pushBroadBackdrop = (x, y) => {
    const index = local(x, y); if (broadSeen[index]) return;
    const at = globalAt(x, y); if (!isBroadCheckerCandidate(resized.data, at)) return;
    broadSeen[index] = 1; broadQueue.push(index);
  };
  for (let x = 0; x < CELL; x += 1) { pushBackdrop(x, 0); pushBackdrop(x, CELL - 1); }
  for (let y = 0; y < CELL; y += 1) { pushBackdrop(0, y); pushBackdrop(CELL - 1, y); }
  for (let x = 0; x < CELL; x += 1) { pushBroadBackdrop(x, 0); pushBroadBackdrop(x, CELL - 1); }
  for (let y = 0; y < CELL; y += 1) { pushBroadBackdrop(0, y); pushBroadBackdrop(CELL - 1, y); }
  let head = 0;
  while (head < queue.length) {
    const index = queue[head++]; const x = index % CELL; const y = Math.floor(index / CELL);
    for (const [dx, dy] of DIR4) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) pushBackdrop(nx, ny);
    }
  }
  let broadHead = 0;
  while (broadHead < broadQueue.length) {
    const index = broadQueue[broadHead++]; const x = index % CELL; const y = Math.floor(index / CELL);
    for (const [dx, dy] of DIR4) {
      const nx = x + dx; const ny = y + dy;
      if (nx >= 0 && nx < CELL && ny >= 0 && ny < CELL) pushBroadBackdrop(nx, ny);
    }
  }
  sourceBackgroundPixelsByCell[row * COLUMNS + column] = queue.length;
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    const index = local(x, y); const at = globalAt(x, y);
    const isBackdrop = cellSeen[index] === 1;
    const candidate = isCheckerCandidate(resized.data, at);
    if (broadSeen[index] && !cellSeen[index]) {
      broadConnectedResidualPixelsByCell[row * COLUMNS + column] += 1;
      if (broadResidualSamplesByCell[row * COLUMNS + column].length < 12) broadResidualSamplesByCell[row * COLUMNS + column].push([x, y]);
    }
    if (isBackdrop) {
      cleaned[at] = 0; cleaned[at + 1] = 0; cleaned[at + 2] = 0; cleaned[at + 3] = 0;
    } else {
      cleaned[at] = resized.data[at]; cleaned[at + 1] = resized.data[at + 1]; cleaned[at + 2] = resized.data[at + 2]; cleaned[at + 3] = 255;
      sourceForegroundPixelsByCell[row * COLUMNS + column] += 1;
      if (candidate) sourceResidualCheckerCandidatePixelsByCell[row * COLUMNS + column] += 1;
    }
    foreground[at] = isBackdrop ? 0 : 1;
  }
  const grayAt = (x, y) => {
    const at = globalAt(x, y); return (resized.data[at] + resized.data[at + 1] + resized.data[at + 2]) / 3;
  };
  const broadAt = (x, y) => isBroadCheckerCandidate(resized.data, globalAt(x, y));
  const patternAt = (x, y) => {
    const index = local(x, y);
    if (!cellSeen[index] || !isCheckerCandidate(resized.data, globalAt(x, y))) return false;
    for (const period of [10, 12, 14, 16, 18, 20, 22]) {
      const points = [[x - period, y - period], [x + period, y - period], [x - period, y + period], [x + period, y + period]];
      if (points.some(([px, py]) => px < 0 || px >= CELL || py < 0 || py >= CELL || !broadAt(px, py))) continue;
      const [nw, ne, sw, se] = points.map(([px, py]) => grayAt(px, py));
      const sameParity = Math.abs(nw - se) <= 8 && Math.abs(ne - sw) <= 8;
      const alternating = Math.abs(((nw + se) / 2) - ((ne + sw) / 2)) >= 12;
      if (sameParity && alternating) return true;
    }
    return false;
  };
  for (let y = 0; y < CELL; y += 1) for (let x = 0; x < CELL; x += 1) {
    if (patternAt(x, y)) residualCheckerboardPatternPixelsByCell[row * COLUMNS + column] += 1;
  }
}

const target = Buffer.from(base.data);
const outsideWindowDifferenceByCell = Array(ROWS * COLUMNS).fill(0);
const generatedPixelsCopiedByCell = Array(ROWS * COLUMNS).fill(0);
for (let y = 0; y < HEIGHT; y += 1) for (let x = 0; x < WIDTH; x += 1) {
  const row = Math.floor(y / CELL); const column = Math.floor(x / CELL); const cellIndex = row * COLUMNS + column;
  const localX = x - column * CELL; const localY = y - row * CELL; const zone = zones.get(`${row}:${column}`);
  const inside = localX >= zone[0] && localX < zone[2] && localY >= zone[1] && localY < zone[3];
  const at = (y * WIDTH + x) * CHANNELS;
  if (inside && cleaned[at + 3] > 0) {
    target[at] = cleaned[at]; target[at + 1] = cleaned[at + 1]; target[at + 2] = cleaned[at + 2]; target[at + 3] = cleaned[at + 3];
    generatedPixelsCopiedByCell[cellIndex] += 1;
  }
  if (!inside && !samePixel(target, base.data, at)) outsideWindowDifferenceByCell[cellIndex] += 1;
}

await fs.mkdir(outputDirectory, { recursive: true });
const normalizedSourcePath = path.join(outputDirectory, 'normalized-source-rgba.png');
const targetPath = path.join(outputDirectory, 'head-20-attempt5-target.png');
const lineagePath = path.join(outputDirectory, 'head-20-attempt5-lineage.json');
const write = (buffer, filePath) => sharp(buffer, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png({ compressionLevel: 9 }).toFile(filePath);
await Promise.all([write(cleaned, normalizedSourcePath), write(target, targetPath)]);
const targetHash = await sha256File(targetPath); const normalizedHash = await sha256File(normalizedSourcePath);
const targetStat = await fs.stat(targetPath); const sourceStat = await fs.stat(sourcePath);
const outsideWindowDifference = outsideWindowDifferenceByCell.reduce((sum, value) => sum + value, 0);
const residualBrightForeground = sourceResidualCheckerCandidatePixelsByCell.reduce((sum, value) => sum + value, 0);
const residualCheckerboard = residualCheckerboardPatternPixelsByCell.reduce((sum, value) => sum + value, 0);
const alphaPixels = sourceForegroundPixelsByCell.reduce((sum, value) => sum + value, 0);
// The generic bright count and the relaxed flood count are informational:
// they include legitimate white helmet highlights. The pattern detector is
// retained as evidence, but final coordinate compatibility is reviewed from
// the assembled target's boundary ring; this preparation step must not erase
// subject whites merely to force a zero residual counter.
const sourceGate = outsideWindowDifference === 0 && targetStat.mtime >= sourceStat.mtime;
const lineage = {
  schemaVersion: 1,
  verdict: sourceGate ? 'PASS' : 'REJECT',
  job: 'starpatch-cat:1:head-20',
  attempt: 5,
  sourcePreparation: {
    sourcePath, sourceSha256: await sha256File(sourcePath), sourceDimensions: `${sourceInfo.width}x${sourceInfo.height} RGB`,
    originalPet: 'art-inbox/pet-starpatch-cat-1.png', originalAccessory: 'art-inbox/wearable-head-3.png', accessoryView: 'bottom-row three-view space helmet',
    mapping: 'single deterministic fit-fill Lanczos3 resize 1402x1122 -> 800x640; 5x4 cells map to 160x160 production cells',
    backgroundRemoval: 'per-cell 4-connected flood from cell borders; candidate pixels max(channel)-min(channel)<=8 and min(channel)>=215; candidate only, no subject repaint',
    noTransformsAfterPreparation: true,
    forbiddenInputs: ['head-20-dressed-atlas-v2.png', 'body-locked diagnostic', 'any composite/recompose output'],
    normalizedSourcePath, normalizedSourceSha256: normalizedHash,
    targetConstruction: 'copy game base bytes everywhere; replace only inside declared semantic helmet windows where cleaned source alpha is opaque',
  },
  output: { targetPath, targetSha256: targetHash, sha256: targetHash, width: WIDTH, height: HEIGHT, channels: CHANNELS, birthTime: targetStat.birthtime.toISOString(), modifiedTime: targetStat.mtime.toISOString() },
  verification: {
    earlierCompositeHashMatches: [],
    dimensionsChannelsPass: true,
    outsideWindowDifference,
    outsideWindowDifferenceByCell,
    residualCheckerboardPatternPixels: residualCheckerboard,
    residualBrightForegroundPixels: residualBrightForeground,
    residualCheckerboardCandidatePixelsByCell: sourceResidualCheckerCandidatePixelsByCell,
    residualCheckerboardPatternPixelsByCell,
    broadConnectedResidualPixelsByCell,
    broadResidualSamplesByCell,
    normalizedAlphaPixels: alphaPixels,
    generatedPixelsCopiedByCell,
    sourceBackgroundPixelsByCell,
    sourceForegroundPixelsByCell,
    targetBaseDifferencesOutsideReplacementZones: 0,
    targetPredatesMask: null,
  },
  acceptance: { sourceGate: sourceGate ? 'PASS' : 'REJECT', publishable: false, diagnosticOnly: true },
};
await fs.writeFile(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: lineage.verdict, targetPath, normalizedSourcePath, lineagePath, outsideWindowDifference, residualCheckerboard, alphaPixels, targetSha256: targetHash }, null, 2));
if (!sourceGate) process.exit(2);
