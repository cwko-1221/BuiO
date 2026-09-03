/** Build the c01 v2 semantic replacement/erase + target-derived patch pack. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const [baseArg, targetArg, specArg, outputArg] = process.argv.slice(2);
if (!baseArg || !targetArg || !specArg || !outputArg) {
  console.error('usage: node scripts/build-head20-c01-v2-semantic-pack.mjs <800x640-base> <160x160-target> <head20-spec> <c01/v2-output>');
  process.exit(1);
}
const basePath = path.resolve(baseArg); const targetPath = path.resolve(targetArg);
const specPath = path.resolve(specArg); const outputDirectory = path.resolve(outputArg);
const SIZE = 160; const RGBA = 4;
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const sha256File = async (filePath) => sha256(await fs.readFile(filePath));
const [base, target] = await Promise.all([
  sharp(basePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
  sharp(targetPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }),
]);
if (base.info.width !== SIZE || base.info.height !== SIZE || base.info.channels !== RGBA) throw new Error('base must be 160x160 RGBA');
if (target.info.width !== SIZE || target.info.height !== SIZE || target.info.channels !== RGBA) throw new Error('target must be 160x160 RGBA');
const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));
const zones = [
  ...(spec.topology?.replacementZones ?? []),
  ...(spec.topology?.replacementExtensions ?? []),
].filter((entry) => entry.row === 0 && entry.column === 0 && Array.isArray(entry.zone)).map((entry) => entry.zone);
if (zones.length < 2) throw new Error(`expected amended c01 union, got ${zones.length} zones`);
const inside = (x, y) => zones.some(([left, top, right, bottom]) => x >= left && x < right && y >= top && y < bottom);

const unionMask = Buffer.alloc(SIZE * SIZE * RGBA);
const patch = Buffer.alloc(SIZE * SIZE * RGBA);
const visibleOverlay = Buffer.alloc(SIZE * SIZE * RGBA);
const composite = Buffer.from(base.data);
let unionPixels = 0; let unionTargetDiffPixels = 0; let earExtensionDiffPixels = 0;
for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
  const at = (y * SIZE + x) * RGBA;
  if (!inside(x, y)) continue;
  unionPixels += 1;
  unionMask[at + 3] = 255;
  // Erase the whole semantic union first.  The target-derived patch keeps
  // the target alpha, so transparent gaps remain transparent rather than
  // resurrecting base pixels beneath the erase layer.
  composite[at] = 0; composite[at + 1] = 0; composite[at + 2] = 0; composite[at + 3] = 0;
  patch[at] = target.data[at]; patch[at + 1] = target.data[at + 1]; patch[at + 2] = target.data[at + 2]; patch[at + 3] = target.data[at + 3];
  composite[at] = patch[at]; composite[at + 1] = patch[at + 1]; composite[at + 2] = patch[at + 2]; composite[at + 3] = patch[at + 3];
  if (target.data[at] !== base.data[at] || target.data[at + 1] !== base.data[at + 1] || target.data[at + 2] !== base.data[at + 2] || target.data[at + 3] !== base.data[at + 3]) {
    unionTargetDiffPixels += 1;
    if (x >= 31 && x < 38 && y >= 28 && y < 101) earExtensionDiffPixels += 1;
  }
  // The visible shell/visor layer preserves only source-drawn target content;
  // the opaque patch remains the exact-match layer after the erase step.
  visibleOverlay[at] = target.data[at]; visibleOverlay[at + 1] = target.data[at + 1]; visibleOverlay[at + 2] = target.data[at + 2]; visibleOverlay[at + 3] = target.data[at + 3];
}

const components = (alphaBuffer) => {
  const seen = new Uint8Array(SIZE * SIZE); const result = [];
  for (let y = 0; y < SIZE; y += 1) for (let x = 0; x < SIZE; x += 1) {
    const seed = y * SIZE + x; const at = seed * RGBA;
    if (seen[seed] || alphaBuffer[at + 3] === 0) continue;
    const queue = [seed]; seen[seed] = 1; let count = 0; let head = 0;
    while (head < queue.length) {
      const index = queue[head++]; count += 1; const cx = index % SIZE; const cy = Math.floor(index / SIZE);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx; const ny = cy + dy;
        if (nx < 0 || nx >= SIZE || ny < 0 || ny >= SIZE) continue;
        const next = ny * SIZE + nx;
        if (seen[next] || alphaBuffer[next * RGBA + 3] === 0) continue;
        seen[next] = 1; queue.push(next);
      }
    }
    result.push(count);
  }
  return result;
};
const unionComponents = components(unionMask);
// A union rectangle plus its measured extension has no enclosed transparent
// hole. Keep this explicit so a future spec edit cannot silently punch one.
const holePixels = [];
for (let y = 1; y < SIZE - 1; y += 1) for (let x = 1; x < SIZE - 1; x += 1) {
  const at = (y * SIZE + x) * RGBA;
  if (unionMask[at + 3] !== 0) continue;
  const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => unionMask[((y + dy) * SIZE + x + dx) * RGBA + 3] > 0);
  if (neighbors) holePixels.push([x, y]);
}
const mismatch = [];
for (let i = 0; i < composite.length; i += RGBA) {
  if (composite[i] !== target.data[i] || composite[i + 1] !== target.data[i + 1] || composite[i + 2] !== target.data[i + 2] || composite[i + 3] !== target.data[i + 3]) mismatch.push(i / RGBA);
}

await fs.mkdir(outputDirectory, { recursive: true });
const write = (buffer, filePath) => sharp(buffer, { raw: { width: SIZE, height: SIZE, channels: RGBA } }).png({ compressionLevel: 9 }).toFile(filePath);
const paths = {
  replacementUnionMask: path.join(outputDirectory, 'c01-v2-replacement-union-mask.png'),
  targetPatch: path.join(outputDirectory, 'c01-v2-target-patch.png'),
  visibleHelmetOverlay: path.join(outputDirectory, 'c01-v2-visible-helmet-overlay.png'),
  exactComposite: path.join(outputDirectory, 'c01-v2-exact-composite.png'),
  report: path.join(outputDirectory, 'c01-v2-semantic-pack-report.json'),
};
await Promise.all([
  write(unionMask, paths.replacementUnionMask),
  write(patch, paths.targetPatch),
  write(visibleOverlay, paths.visibleHelmetOverlay),
  write(composite, paths.exactComposite),
]);
const report = {
  schemaVersion: 1,
  job: 'starpatch-cat:1:head-20', attempt: 6, cell: 'c01', version: 'c01-v2',
  sourceTarget: targetPath, sourceTargetSha256: await sha256File(targetPath),
  zones, unionPixels, unionComponents4: unionComponents.length, unionHolePixels: holePixels.length,
  unionTargetDiffPixels, earExtensionTargetDiffPixels: earExtensionDiffPixels,
  layerOrder: ['base', 'erase:replacement-union-mask', 'patch:target-derived-alpha-preserving', 'visibleHelmetOverlay:diagnostic'],
  patchSemantics: 'target-derived shell/visor/collar pixels; alpha is retained so target background gaps remain transparent after erase',
  protectedBytes: 'base bytes remain unchanged outside amended union; tail/torso/legs/paws/bowl are outside union',
  exactCompositeMismatchPixels: mismatch.length,
  paths,
  verdict: unionComponents.length === 1 && holePixels.length === 0 && mismatch.length === 0 ? 'SEMANTIC_PACK_READY_PENDING_PROVENANCE_CRITIC' : 'REJECT_SEMANTIC_PACK',
  publishable: false,
};
await fs.writeFile(paths.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.verdict === 'REJECT_SEMANTIC_PACK') process.exit(2);
