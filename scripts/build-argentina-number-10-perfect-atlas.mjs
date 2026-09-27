import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const PET_ID = 'argentina-number-10';
const SOURCE = path.join(ROOT, 'pet-app/art-source/imagegen/baked-wearables/argentina-number-10-perfect-v1');
const RAW = path.join(SOURCE, 'raw');
const PROCESSED = path.join(SOURCE, 'processed');
const ARTIFACT = path.join(ROOT, `artifacts/premium-character-atlases/${PET_ID}`);
const IMPORT = path.join(ARTIFACT, 'import');
const CELL = 512;
const ATLAS_SIZE = 4096;
const ALPHA_THRESHOLD = 8;
const MOTION_HEIGHT = 430;
const WALK_BASELINES = [476, 480, 476, 470, 476, 480, 476, 470];
const IDLE_BASELINE = 478;
const SPECIAL_BASELINE = 478;

const GROUPS = [
  { name: 'front-walk', file: 'front-walk-generated-v2.png', columns: 4, rows: 2, count: 8 },
  { name: 'right-walk', file: 'right-walk-generated-v2.png', columns: 4, rows: 2, count: 8 },
  { name: 'back-walk', file: 'back-walk-generated-v2.png', columns: 4, rows: 2, count: 8 },
  { name: 'front-idle', file: 'front-idle-generated-v2.png', columns: 4, rows: 2, count: 8 },
  { name: 'specials', file: 'specials-generated-v2.png', columns: 5, rows: 1, count: 5 },
];

const empty = (width, height, background = '#00000000') => sharp({
  create: { width, height, channels: 4, background },
});
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

async function alphaBounds(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let top = info.height;
  let right = -1;
  let bottom = -1;
  let opaque = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] <= ALPHA_THRESHOLD) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      opaque += 1;
    }
  }
  if (right < left) return null;
  return { left, top, width: right - left + 1, height: bottom - top + 1, right, bottom, opaque };
}

async function cleanCell(buffer, label) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > ALPHA_THRESHOLD) continue;
    data[i] = 0;
    data[i + 1] = 0;
    data[i + 2] = 0;
    data[i + 3] = 0;
  }
  // A generated sheet can place two rows directly against their shared boundary. Retain only
  // the intended connected character so a hair/boot fragment from the neighbouring slot can
  // never survive merely because it crossed that boundary by one pixel.
  const labels = new Int32Array(pixels).fill(-1);
  const queue = new Int32Array(pixels);
  const components = [];
  for (let start = 0; start < pixels; start += 1) {
    if (labels[start] >= 0 || data[start * 4 + 3] <= ALPHA_THRESHOLD) continue;
    const id = components.length;
    let head = 0;
    let tail = 0;
    labels[start] = id;
    queue[tail++] = start;
    while (head < tail) {
      const current = queue[head++];
      const x = current % info.width;
      const y = Math.floor(current / info.width);
      const neighbours = [
        x > 0 ? current - 1 : -1,
        x + 1 < info.width ? current + 1 : -1,
        y > 0 ? current - info.width : -1,
        y + 1 < info.height ? current + info.width : -1,
      ];
      for (const next of neighbours) {
        if (next < 0 || labels[next] >= 0 || data[next * 4 + 3] <= ALPHA_THRESHOLD) continue;
        labels[next] = id;
        queue[tail++] = next;
      }
    }
    components.push(tail);
  }
  assert(components.length > 0, `${label} contains no connected artwork`);
  const intended = components.indexOf(Math.max(...components));
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    if (labels[pixel] === intended || data[pixel * 4 + 3] === 0) continue;
    data[pixel * 4] = 0;
    data[pixel * 4 + 1] = 0;
    data[pixel * 4 + 2] = 0;
    data[pixel * 4 + 3] = 0;
  }
  const cleaned = await sharp(data, { raw: info }).png().toBuffer();
  const bounds = await alphaBounds(cleaned);
  assert(bounds && bounds.opaque > 1500, `${label} is empty or contains only fragments`);
  assert(bounds.left >= 1 && bounds.right <= info.width - 2,
  `${label} touches its raw source cell boundary: ${JSON.stringify({ bounds, width: info.width, height: info.height })}`);
  const cropped = await sharp(cleaned).extract(bounds).png().toBuffer();
  return { buffer: cropped, width: bounds.width, height: bounds.height, opaque: bounds.opaque };
}

async function splitConnectedPoses(file, expected, label) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const labels = new Int32Array(pixels).fill(-1);
  const queue = new Int32Array(pixels);
  const components = [];
  for (let start = 0; start < pixels; start += 1) {
    if (labels[start] >= 0 || data[start * 4 + 3] <= ALPHA_THRESHOLD) continue;
    const id = components.length;
    let head = 0;
    let tail = 0;
    let left = info.width;
    let top = info.height;
    let right = -1;
    let bottom = -1;
    labels[start] = id;
    queue[tail++] = start;
    while (head < tail) {
      const current = queue[head++];
      const x = current % info.width;
      const y = Math.floor(current / info.width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
      const neighbours = [
        x > 0 ? current - 1 : -1,
        x + 1 < info.width ? current + 1 : -1,
        y > 0 ? current - info.width : -1,
        y + 1 < info.height ? current + info.width : -1,
      ];
      for (const next of neighbours) {
        if (next < 0 || labels[next] >= 0 || data[next * 4 + 3] <= ALPHA_THRESHOLD) continue;
        labels[next] = id;
        queue[tail++] = next;
      }
    }
    components.push({ id, count: tail, left, top, right, bottom });
  }
  const poses = components.filter((component) => component.count > 5000).sort((a, b) => a.left - b.left);
  assert.equal(poses.length, expected, `${label} must contain exactly ${expected} connected poses`);
  const frames = [];
  for (const pose of poses) {
    const padding = 4;
    const width = pose.right - pose.left + 1;
    const height = pose.bottom - pose.top + 1;
    const outputWidth = width + padding * 2;
    const outputHeight = height + padding * 2;
    const pixelsOut = Buffer.alloc(outputWidth * outputHeight * 4);
    for (let y = pose.top; y <= pose.bottom; y += 1) {
      for (let x = pose.left; x <= pose.right; x += 1) {
        const sourcePixel = y * info.width + x;
        if (labels[sourcePixel] !== pose.id) continue;
        const destination = ((y - pose.top + padding) * outputWidth + x - pose.left + padding) * 4;
        data.copy(pixelsOut, destination, sourcePixel * 4, sourcePixel * 4 + 4);
      }
    }
    frames.push({
      buffer: await sharp(pixelsOut, { raw: { width: outputWidth, height: outputHeight, channels: 4 } }).png().toBuffer(),
      width: outputWidth,
      height: outputHeight,
      opaque: pose.count,
    });
  }
  return { frames, sourceWidth: info.width, sourceHeight: info.height };
}

async function splitGroup(group) {
  const file = path.join(RAW, group.file);
  const metadata = await sharp(file).metadata();
  if (group.name === 'specials') {
    const connected = await splitConnectedPoses(file, group.count, group.file);
    return { ...group, ...connected };
  }
  const frames = [];
  for (let index = 0; index < group.count; index += 1) {
    const column = index % group.columns;
    const row = Math.floor(index / group.columns);
    const left = Math.round(column * metadata.width / group.columns);
    const right = Math.round((column + 1) * metadata.width / group.columns);
    const top = Math.round(row * metadata.height / group.rows);
    const bottom = Math.round((row + 1) * metadata.height / group.rows);
    const rawCell = await sharp(file).extract({
      left,
      top,
      width: right - left,
      height: bottom - top,
    }).png().toBuffer();
    frames.push(await cleanCell(rawCell, `${group.name} frame ${index + 1}`));
  }
  return { ...group, sourceWidth: metadata.width, sourceHeight: metadata.height, frames };
}

async function upperBodyCentre(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const limit = Math.max(1, Math.floor(info.height * 0.64));
  let weightedX = 0;
  let weight = 0;
  for (let y = 0; y < limit; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * 4 + 3];
      if (alpha <= ALPHA_THRESHOLD) continue;
      weightedX += x * alpha;
      weight += alpha;
    }
  }
  assert(weight > 0, 'Upper-body anchor could not be measured');
  return weightedX / weight;
}

async function makeTile(frame, scale, baseline, label) {
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const centre = await upperBodyCentre(frame.buffer);
  const left = Math.round(CELL / 2 - centre * scale);
  const top = Math.round(baseline - height);
  assert(left >= 16 && top >= 16 && left + width <= CELL - 16 && top + height <= CELL - 16,
    `${label} leaves the 16px safety gutter (${left},${top},${width},${height})`);
  const resized = await sharp(frame.buffer).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const tile = await empty(CELL, CELL).composite([{ input: resized, left, top }]).png().toBuffer();
  const bounds = await alphaBounds(tile);
  assert(bounds, `${label} disappeared during normalization`);
  return { tile, left, top, width, height, baseline, bounds };
}

async function renderReview(frames, columns, destination, title) {
  const previewCell = 256;
  const labelHeight = 38;
  const rows = Math.ceil(frames.length / columns);
  const width = columns * previewCell;
  const height = rows * (previewCell + labelHeight);
  const composites = [];
  let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
  for (let index = 0; index < frames.length; index += 1) {
    const frame = frames[index];
    const x = (index % columns) * previewCell;
    const y = Math.floor(index / columns) * (previewCell + labelHeight);
    svg += `<text x="${x + 10}" y="${y + 24}" fill="#334155" font-family="Arial,sans-serif" font-size="15">${title} ${String(index + 1).padStart(2, '0')}</text>`;
    svg += `<path d="M ${x} ${y + labelHeight + 239} h ${previewCell}" stroke="#b7c5d4" stroke-width="1"/>`;
    composites.push({
      input: await sharp(frame.tile).resize(previewCell, previewCell).png().toBuffer(),
      left: x,
      top: y + labelHeight,
    });
  }
  svg += '</svg>';
  composites.push({ input: Buffer.from(svg), left: 0, top: 0 });
  await sharp({ create: { width, height, channels: 4, background: '#edf2f7' } })
    .composite(composites)
    .png()
    .toFile(destination);
}

await fs.mkdir(PROCESSED, { recursive: true });
await fs.mkdir(IMPORT, { recursive: true });
await fs.mkdir(ARTIFACT, { recursive: true });

const groups = [];
for (const group of GROUPS) groups.push(await splitGroup(group));
// The generator returned the second idle row at roughly 94% of the first row's scale even
// though the pose itself is unchanged. Correct that source-sheet scale error before applying
// the one shared motion scale; otherwise the avatar visibly shrinks during every blink.
const idleReferenceHeight = median(groups[3].frames.slice(0, 4).map((frame) => frame.height));
groups[3].frames = await Promise.all(groups[3].frames.map(async (frame) => {
  const sourceCorrectionScale = idleReferenceHeight / frame.height;
  const width = Math.round(frame.width * sourceCorrectionScale);
  const height = idleReferenceHeight;
  return {
    ...frame,
    buffer: await sharp(frame.buffer).resize(width, height, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer(),
    width,
    height,
    sourceCorrectionScale,
  };
}));
const motionFrames = groups.slice(0, 4).flatMap((group) => group.frames);
const motionScale = Math.min(
  MOTION_HEIGHT / Math.max(...motionFrames.map((frame) => frame.height)),
  448 / Math.max(...motionFrames.map((frame) => frame.width)),
);
assert(motionScale > 0.5 && motionScale < 2, `Implausible shared motion scale ${motionScale}`);
const normalizedMotionHeight = median(groups[3].frames.map((frame) => frame.height)) * motionScale;
const specialFrames = groups[4].frames;
const uprightSpecials = [specialFrames[0], specialFrames[1], specialFrames[4]];
const specialScale = Math.min(
  normalizedMotionHeight / median(uprightSpecials.map((frame) => frame.height)),
  448 / Math.max(...specialFrames.map((frame) => frame.width)),
);

const frames = [];
for (let row = 0; row < groups.length; row += 1) {
  const group = groups[row];
  const outputDir = path.join(PROCESSED, group.name);
  await fs.mkdir(outputDir, { recursive: true });
  for (let column = 0; column < group.frames.length; column += 1) {
    const sourceFrame = group.frames[column];
    const scale = row === 4 ? specialScale : motionScale;
    const baseline = row < 3 ? WALK_BASELINES[column] : row === 3 ? IDLE_BASELINE : SPECIAL_BASELINE;
    const normalized = await makeTile(sourceFrame, scale, baseline, `${group.name} frame ${column + 1}`);
    const index = row * 8 + column;
    const output = path.join(outputDir, `${String(column + 1).padStart(2, '0')}.png`);
    await fs.writeFile(output, normalized.tile);
    frames.push({ index, row, column, group: group.name, sourceFrame: column + 1, scale, ...normalized });
  }
}

const atlas = await empty(ATLAS_SIZE, ATLAS_SIZE).composite(frames.map((frame) => ({
  input: frame.tile,
  left: frame.column * CELL,
  top: frame.row * CELL,
}))).png().toBuffer();
const atlasPath = path.join(SOURCE, `${PET_ID}-atlas-perfect-v1-4096.png`);
await fs.writeFile(atlasPath, atlas);
for (let stage = 1; stage <= 4; stage += 1) {
  await fs.writeFile(path.join(IMPORT, `pet-${PET_ID}-${stage}.png`), atlas);
}

const atlasMetadata = await sharp(atlas).metadata();
assert.equal(atlasMetadata.width, ATLAS_SIZE);
assert.equal(atlasMetadata.height, ATLAS_SIZE);
assert.equal(atlasMetadata.channels, 4);
assert.equal(atlasMetadata.hasAlpha, true);
const atlasRaw = await sharp(atlas).raw().toBuffer();
const cellChecks = [];
for (let index = 0; index < 64; index += 1) {
  let opaque = 0;
  let edge = 0;
  const row = Math.floor(index / 8);
  const column = index % 8;
  for (let y = 0; y < CELL; y += 1) {
    for (let x = 0; x < CELL; x += 1) {
      const alpha = atlasRaw[((row * CELL + y) * ATLAS_SIZE + column * CELL + x) * 4 + 3];
      if (alpha <= ALPHA_THRESHOLD) continue;
      opaque += 1;
      if (x === 0 || y === 0 || x === CELL - 1 || y === CELL - 1) edge += 1;
    }
  }
  assert.equal(edge, 0, `Atlas cell ${index} touches a neighbour boundary`);
  assert(index < 37 ? opaque > 1500 : opaque === 0, `Atlas cell ${index} population is invalid`);
  cellChecks.push({ index, opaque, edge });
}

for (const row of [0, 1, 2]) {
  const rowFrames = frames.filter((frame) => frame.row === row);
  assert.deepEqual(rowFrames.map((frame) => frame.baseline), WALK_BASELINES, `walk row ${row} gait arc changed`);
  assert.equal(new Set(rowFrames.map((frame) => hash(frame.tile))).size, 8, `walk row ${row} contains duplicate frames`);
  const firstHalf = hash(Buffer.concat(rowFrames.slice(0, 4).map((frame) => frame.tile)));
  const secondHalf = hash(Buffer.concat(rowFrames.slice(4).map((frame) => frame.tile)));
  assert.notEqual(firstHalf, secondHalf, `walk row ${row} repeats one half-cycle`);
}
const idleFrames = frames.filter((frame) => frame.row === 3);
assert.ok(idleFrames.every((frame) => frame.baseline === IDLE_BASELINE), 'Idle baseline is not locked');
assert.equal(new Set(idleFrames.map((frame) => hash(frame.tile))).size, 8, 'Idle frames collapsed to duplicates');
const stageHashes = await Promise.all(Array.from({ length: 4 }, async (_, index) => hash(
  await fs.readFile(path.join(IMPORT, `pet-${PET_ID}-${index + 1}.png`)),
)));
assert.equal(new Set(stageHashes).size, 1, 'Growth-stage atlas copies do not match');

await renderReview(frames, 8, path.join(ARTIFACT, 'contact-sheet.png'), PET_ID);
for (let row = 0; row < 5; row += 1) {
  const rowFrames = frames.filter((frame) => frame.row === row);
  await renderReview(rowFrames, row === 4 ? 5 : 4, path.join(ARTIFACT, `${GROUPS[row].name}-review.png`), GROUPS[row].name);
}
await fs.writeFile(path.join(SOURCE, 'model-reference.png'), idleFrames[0].tile);

const report = {
  petId: PET_ID,
  sourceAtlas: path.relative(ROOT, atlasPath),
  dimensions: [ATLAS_SIZE, ATLAS_SIZE],
  grid: { columns: 8, rows: 8, cell: CELL, runtimeRows: 5 },
  populatedFrames: 37,
  transparentReservedFrames: 27,
  motionScale,
  specialScale,
  walkBaselines: WALK_BASELINES,
  idleBaseline: IDLE_BASELINE,
  stageHashes,
  sources: groups.map((group) => ({
    name: group.name,
    file: group.file,
    dimensions: [group.sourceWidth, group.sourceHeight],
    frames: group.frames.map((frame) => ({
      width: frame.width,
      height: frame.height,
      opaque: frame.opaque,
      sourceCorrectionScale: frame.sourceCorrectionScale ?? 1,
    })),
  })),
  checks: {
    rgba4096: true,
    exact8x8Grid: true,
    allRequiredFramesPopulated: true,
    reservedFramesTransparent: true,
    noCellBoundaryPixels: true,
    sharedMotionScale: true,
    stableUpperBodyCentre: true,
    restrainedWalkArc: true,
    idleBaselineLocked: true,
    distinctWalkFrames: true,
    distinctHalfCycles: true,
    stageCopiesIdentical: true,
  },
  cells: cellChecks,
  frames: frames.map((frame) => ({
    index: frame.index,
    group: frame.group,
    sourceFrame: frame.sourceFrame,
    scale: frame.scale,
    left: frame.left,
    top: frame.top,
    width: frame.width,
    height: frame.height,
    baseline: frame.baseline,
    bounds: frame.bounds,
    hash: hash(frame.tile),
  })),
};
await fs.writeFile(path.join(ARTIFACT, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ atlasPath, artifact: ARTIFACT, importDir: IMPORT, frames: frames.length, motionScale, specialScale }, null, 2));
