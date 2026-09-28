import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const PET_ID = 'portugal-number-7';
const SOURCE = path.join(ROOT, 'pet-app/art-source/imagegen/baked-wearables/portugal-number-7-perfect-v1');
const RAW = path.join(SOURCE, 'raw');
const PROCESSED = path.join(SOURCE, 'processed');
const ARTIFACT = path.join(ROOT, `artifacts/premium-character-atlases/${PET_ID}`);
const IMPORT = path.join(ARTIFACT, 'import');
const CELL = 512;
const ATLAS_SIZE = 4096;
const ALPHA_THRESHOLD = 8;
const MOTION_HEIGHT = 430;
const WALK_BASELINES = [476, 479, 476, 472, 476, 479, 476, 472];
const IDLE_BASELINE = 478;
const SPECIAL_BASELINE = 478;

const GROUPS = [
  { name: 'front-walk', file: 'front-walk-generated-v2.png', columns: 4, rows: 2, count: 8 },
  { name: 'right-walk', file: 'right-walk-generated-v1.png', columns: 4, rows: 2, count: 8 },
  { name: 'back-walk', file: 'back-walk-generated-v2.png', columns: 4, rows: 2, count: 8 },
  { name: 'front-idle', file: 'front-idle-generated-v1.png', columns: 4, rows: 2, count: 8 },
  { name: 'specials', file: 'specials-generated-v1.png', columns: 5, rows: 1, count: 5 },
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

async function splitConnectedPoses(file, expected, label, rows = 1) {
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
  const poses = components.filter((component) => component.count > 5000).sort((a, b) => {
    const rowA = Math.min(rows - 1, Math.floor((a.top + a.bottom) / 2 / info.height * rows));
    const rowB = Math.min(rows - 1, Math.floor((b.top + b.bottom) / 2 / info.height * rows));
    return rowA - rowB || a.left - b.left;
  });
  assert.equal(poses.length, expected, `${label} must contain exactly ${expected} connected poses`);
  const frames = [];
  for (const pose of poses) {
    assert(pose.left > 1 && pose.top > 1 && pose.right < info.width - 2 && pose.bottom < info.height - 2,
      `${label} contains a clipped pose at the source edge`);
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
  // Isolate complete connected characters BEFORE packing; a boot crossing an imaginary
  // generated grid boundary is preserved without importing any neighbouring character.
  const connected = await splitConnectedPoses(file, group.count, group.file, group.rows);
  return { ...group, ...connected };
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
  const centre = label.startsWith('specials') ? frame.width / 2 : await upperBodyCentre(frame.buffer);
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
// Front source cells 4 and 8 contain the opposite reach poses. Put these in the correct
// half-cycle without flipping any asymmetric shirt, hair or face artwork.
groups[0].frames = [0, 1, 2, 7, 4, 5, 6, 3].map((index) => groups[0].frames[index]);
// Every motion pose has one planted foot. Calibrate generated sheet/cell scale to the same
// standing height before the shared production scale; no limbs or upper-body regions are
// repainted or mirrored. This also accommodates the differently sized back source sheet.
const idleReferenceHeight = median(groups[3].frames.slice(0, 4).map((frame) => frame.height));
for (const group of groups.slice(0, 4)) group.frames = await Promise.all(group.frames.map(async (frame) => {
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
const clips = [
  { id: 'front', label: '正面行走', frames: [0,1,2,3,4,5,6,7] },
  { id: 'right', label: '側面行走', frames: [8,9,10,11,12,13,14,15] },
  { id: 'back', label: '背面行走', frames: [16,17,18,19,20,21,22,23] },
  { id: 'idle', label: '待機／眨眼', frames: [24,25,26,27,28,29,30,31], durations: [900,100,700,0,0,0,100,500] },
  ...['食嘢','開心','瞓覺','坐下','驚訝'].map((label, i) => ({ id: `special-${i}`, label, frames: [32+i] })),
];
await fs.writeFile(path.join(ARTIFACT, 'animation.json'), JSON.stringify({
  petId: PET_ID, canvas: [4096,4096], cell:512, columns:8, rows:8,
  runtimeRows:5, fps:10, clips, previewType:'standalone-phaser',
}, null, 2));
const phaserUrl = pathToFileURL(path.join(ROOT, 'node_modules/phaser/dist/phaser.min.js')).href;
const preview = `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>葡萄牙 7 號 · 動畫預覽</title><style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#142231;color:#ecf5fc;font:16px system-ui;max-width:1280px;margin:auto}h1{font-size:26px;margin:0 0 12px}p{line-height:1.7;color:#b5c8db}.controls{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}button,select{font:inherit;padding:10px 14px;color:#fff;background:#29465e;border:1px solid #67869f;border-radius:8px;cursor:pointer}#game{width:100%;border-radius:14px;overflow:hidden;border:1px solid #62839b}#game canvas{display:block;width:100%;height:auto}a{color:#9ddaff}#status{min-height:24px;font:14px monospace}@media(max-width:650px){body{padding:12px}h1{font-size:22px}}
</style><h1>葡萄牙 7 號 · 37 格動畫</h1><p>4096 × 4096 透明 atlas · 正面／側面／背面 8 幀行走 · 8 幀待機 · 5 個特別姿勢。使用與 pet-app 相同的 Phaser 動畫播放方式；這頁是角色素材預覽。</p><div class="controls"><button id="play">暫停</button><button id="next">下一格</button><label>速度 <select id="speed"><option value="0.5">0.5×</option><option selected value="1">1×</option><option value="1.5">1.5×</option></select></label><label>背景 <select id="background"><option value="#e9f0f6">淺色</option><option value="#263d52">深色</option><option value="#73baa0">綠色</option></select></label></div><div id="game"></div><div class="controls"><label>移動方向 <select id="direction"><option value="front">正面</option><option value="right">側面</option><option value="back">背面</option><option value="left">向左（側面翻轉）</option></select></label><button id="move">開始移動</button><button id="rest">瞓覺</button><button id="idle">待機</button></div><p id="status"></p><p><a href="import/pet-${PET_ID}-1.png" download>下載透明 atlas</a> · <a href="contact-sheet.png">逐格總覽</a> · <a href="animation.json">動作定義</a></p>
<script src="${phaserUrl}"></script><script>
const clips=${JSON.stringify(clips)},image='data:image/png;base64,${atlas.toString('base64')}';
let scene,paused=false,moving=false,mode='idle',direction='front';const qa=window.qa={ready:false,clips:{},stageSeen:new Set(),idleSamples:[],sprites:[],moving:false};
class Preview extends Phaser.Scene{
preload(){this.load.spritesheet('character',image,{frameWidth:512,frameHeight:512,endFrame:36});}
create(){scene=this;this.cameras.main.setBackgroundColor('#e9f0f6');
for(const clip of clips)this.anims.create({key:clip.id,frames:clip.frames.map((frame,i)=>({key:'character',frame,duration:clip.durations?.[i]??0})),frameRate:10,repeat:-1});
this.add.text(22,20,'8 FRAME WALK CYCLES / IDLE',{fontFamily:'system-ui',fontSize:'18px',color:'#334155'});
for(let i=0;i<4;i++){const clip=clips[i],x=140+i*285;this.add.text(x,54,clip.label,{fontFamily:'system-ui',fontSize:'18px',color:'#334155'}).setOrigin(.5,0);this.add.line(x,326,0,0,260,0,0x99aabb).setOrigin(.5);const s=this.add.sprite(x,222,'character').setScale(.49).play(clip.id);qa.sprites.push(s);qa.clips[clip.id]=new Set();s.on('animationupdate',(_,f)=>qa.clips[clip.id].add(Number(f.textureFrame)));qa.clips[clip.id].add(clip.frames[0]);}
for(let i=4;i<9;i++){const x=120+(i-4)*230,clip=clips[i];this.add.text(x,370,clip.label,{fontFamily:'system-ui',fontSize:'17px',color:'#334155'}).setOrigin(.5,0);this.add.sprite(x,476,'character',clip.frames[0]).setScale(.38);}
this.add.text(22,610,'MOVE → STOP / IDLE / REST',{fontFamily:'system-ui',fontSize:'18px',color:'#334155'});this.add.line(590,857,0,0,1140,0,0x99aabb).setOrigin(.5);this.avatar=this.add.sprite(160,739,'character').setScale(.5).play('idle');qa.avatar=this.avatar;qa.avatar.on('animationupdate',(_,f)=>qa.stageSeen.add(Number(f.textureFrame)));qa.ready=true;
}
update(_,delta){if(!qa.ready)return;if(moving&&!paused){this.avatar.x+=delta*.09*(direction==='left'?-1:1);if(this.avatar.x>1030)this.avatar.x=150;if(this.avatar.x<140)this.avatar.x=1020;}else if(mode==='idle'){qa.idleSamples.push({x:this.avatar.x,y:this.avatar.y,frame:Number(this.avatar.frame.name)});if(qa.idleSamples.length>1200)qa.idleSamples.shift();}document.querySelector('#status').textContent='frame '+this.avatar.frame.name+' · '+mode+' · x '+this.avatar.x.toFixed(1)+' / y '+this.avatar.y;}
}
const game=new Phaser.Game({type:Phaser.CANVAS,width:1180,height:890,parent:'game',scene:Preview,audio:{noAudio:true},banner:false});
function setMode(next){mode=next;moving=next==='walk';qa.moving=moving;qa.stageSeen.clear();qa.idleSamples=[];scene.avatar.setFlipX(moving&&direction==='left');scene.avatar.play(moving?(direction==='left'?'right':direction):mode==='rest'?'special-2':'idle');document.querySelector('#move').textContent=moving?'停止 → 待機':'開始移動';}
document.querySelector('#move').onclick=()=>setMode(moving?'idle':'walk');document.querySelector('#rest').onclick=()=>setMode('rest');document.querySelector('#idle').onclick=()=>setMode('idle');document.querySelector('#direction').onchange=e=>{direction=e.target.value;if(moving)setMode('walk');};
document.querySelector('#play').onclick=()=>{paused=!paused;for(const s of [...qa.sprites,scene.avatar])paused?s.anims.pause():s.anims.resume();document.querySelector('#play').textContent=paused?'播放':'暫停';};document.querySelector('#next').onclick=()=>{paused=true;document.querySelector('#play').textContent='播放';for(const s of [...qa.sprites,scene.avatar]){s.anims.pause();s.anims.nextFrame();}};
document.querySelector('#speed').onchange=e=>{for(const s of [...qa.sprites,scene.avatar])s.anims.timeScale=Number(e.target.value);};document.querySelector('#background').onchange=e=>scene.cameras.main.setBackgroundColor(e.target.value);
</script></html>`;
await fs.writeFile(path.join(ARTIFACT, 'preview.html'), preview);
console.log(JSON.stringify({ atlasPath, artifact: ARTIFACT, importDir: IMPORT, frames: frames.length, motionScale, specialScale }, null, 2));
