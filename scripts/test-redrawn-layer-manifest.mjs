/** Synthetic pass/reject regression for audit-redrawn-layer-manifest.mjs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const root = await fs.mkdtemp(path.join(process.cwd(), 'artifacts', 'layer-manifest-test-'));
const width = 800; const height = 640; const channels = 4; const pixels = width * height;
const rgba = (r, g, b, a) => [r, g, b, a];
const write = async (name, data) => {
  const output = path.join(root, name);
  await sharp(data, { raw: { width, height, channels } }).png().toFile(output);
  return output;
};
const writeRgb = async (name, data) => {
  const output = path.join(root, name);
  await sharp(data, { raw: { width, height, channels: 3 } }).png().toFile(output);
  return output;
};
const base = Buffer.alloc(pixels * channels);
const target = Buffer.alloc(pixels * channels);
const patch = Buffer.alloc(pixels * channels);
const patchMask = Buffer.alloc(pixels * channels);
const eraseMask = Buffer.alloc(pixels * channels);
for (let pixel = 0; pixel < pixels; pixel += 1) {
  const at = pixel * channels;
  for (const [buffer, color] of [[base, rgba(30, 60, 90, 255)], [target, rgba(30, 60, 90, 255)]]) buffer.set(color, at);
}
for (let y = 10; y < 30; y += 1) for (let x = 10; x < 30; x += 1) {
  const pixel = y * width + x; const at = pixel * channels;
  patchMask[at + 3] = 255; patch.set(rgba(220, 40, 40, 255), at); target.set(rgba(220, 40, 40, 255), at);
}
// A topology bridge may cover an unchanged alpha-zero base pixel. The auditor
// must preserve its hidden RGBA bytes instead of zeroing them during no-op over.
base.set(rgba(7, 8, 9, 0), (15 * width + 15) * channels);
target.set(rgba(7, 8, 9, 0), (15 * width + 15) * channels);
patch.set(rgba(0, 0, 0, 0), (15 * width + 15) * channels);
for (let y = 10; y < 30; y += 1) for (let x = 170; x < 190; x += 1) {
  const pixel = y * width + x; eraseMask[pixel * channels + 3] = 255; target.fill(0, pixel * channels, pixel * channels + channels);
}
const paths = {
  base: await write('base.png', base), target: await write('target.png', target),
  patch: await write('patch.png', patch), patchMask: await write('patch-mask.png', patchMask),
  eraseMask: await write('erase-mask.png', eraseMask),
};
const manifest = {
  schemaVersion: 1,
  identity: { petId: 'fixture-cat', stage: 1, wearableId: 'fixture-head', slot: 'head' },
  geometry: { width, height, cellWidth: 160, cellHeight: 160, columns: 5, rows: 4, transformAllowed: false },
  target: paths.target, base: paths.base,
  layerOrder: ['rear', 'erase', 'patch', 'frontErase', 'front'],
  emptyByDefault: [],
  maskPolicy: { allowUnchangedSupportPixels: true, maximumUnchangedSupportPixels: 1 },
  layers: {
    erase: { kind: 'destination-out', mask: paths.eraseMask },
    patch: { kind: 'content', mask: paths.patchMask, image: paths.patch },
  },
};
const manifestPath = path.join(root, 'manifest.json');
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
const run = (input) => spawnSync(process.execPath, ['scripts/audit-redrawn-layer-manifest.mjs', input], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const pass = run(manifestPath);
const passReport = JSON.parse(pass.stdout);
if (pass.status !== 0 || passReport.verdict !== 'DATA_PASS') throw new Error(`valid fixture rejected: ${pass.stdout}\n${pass.stderr}`);

const badMask = Buffer.from(patchMask);
for (let y = 16; y < 24; y += 1) for (let x = 16; x < 24; x += 1) badMask[(y * width + x) * channels + 3] = 0;
const badMaskPath = await write('bad-mask.png', badMask);
const badManifest = { ...manifest, layers: { ...manifest.layers, patch: { ...manifest.layers.patch, mask: badMaskPath } } };
const badManifestPath = path.join(root, 'bad-manifest.json');
await fs.writeFile(badManifestPath, `${JSON.stringify(badManifest, null, 2)}\n`, 'utf8');
const reject = run(badManifestPath);
const rejectReport = JSON.parse(reject.stdout);
if (reject.status === 0 || rejectReport.verdict !== 'REJECT' || rejectReport.metrics.undeclaredHoleCells === 0) throw new Error(`invalid fixture was not rejected: ${reject.stdout}\n${reject.stderr}`);

// Relative paths must resolve from the manifest bundle, not the caller cwd.
const relativeManifest = {
  ...manifest,
  target: 'target.png', base: 'base.png',
  layers: {
    erase: { kind: 'destination-out', mask: 'erase-mask.png' },
    patch: { kind: 'content', mask: 'patch-mask.png', image: 'patch.png' },
  },
};
const relativeManifestPath = path.join(root, 'relative-manifest.json');
await fs.writeFile(relativeManifestPath, `${JSON.stringify(relativeManifest, null, 2)}\n`, 'utf8');
const relativeRun = run(relativeManifestPath);
const relativeReport = JSON.parse(relativeRun.stdout);
if (relativeRun.status !== 0 || relativeReport.verdict !== 'DATA_PASS') throw new Error(`relative manifest was rejected: ${relativeRun.stdout}\n${relativeRun.stderr}`);

// A frozen full redraw can never be reused as a layer image.
const targetSourceManifestPath = path.join(root, 'target-source-manifest.json');
const targetSourceManifest = { ...manifest, layers: { patch: { kind: 'content', mask: paths.patchMask, image: paths.target } } };
await fs.writeFile(targetSourceManifestPath, `${JSON.stringify(targetSourceManifest, null, 2)}\n`, 'utf8');
const targetSourceRun = run(targetSourceManifestPath);
const targetSourceReport = JSON.parse(targetSourceRun.stdout);
if (targetSourceRun.status === 0 || targetSourceReport.verdict !== 'REJECT') throw new Error(`target-as-layer source was not rejected: ${targetSourceRun.stdout}`);

// Opaque RGB masks are ambiguous and must fail instead of becoming an all-on alpha mask.
const rgbMask = await writeRgb('rgb-mask.png', Buffer.alloc(pixels * 3, 255));
const rgbMaskManifestPath = path.join(root, 'rgb-mask-manifest.json');
const rgbMaskManifest = { ...manifest, layers: { patch: { kind: 'content', mask: rgbMask, image: paths.patch } } };
await fs.writeFile(rgbMaskManifestPath, `${JSON.stringify(rgbMaskManifest, null, 2)}\n`, 'utf8');
const rgbMaskRun = run(rgbMaskManifestPath);
const rgbMaskReport = JSON.parse(rgbMaskRun.stdout);
if (rgbMaskRun.status === 0 || rgbMaskReport.verdict !== 'REJECT') throw new Error(`opaque RGB mask was not rejected: ${rgbMaskRun.stdout}`);

// A manifest with no changed pixels and no declared layers is not evidence.
const emptyManifestPath = path.join(root, 'empty-manifest.json');
const emptyManifest = { ...manifest, target: paths.base, layers: {} };
await fs.writeFile(emptyManifestPath, `${JSON.stringify(emptyManifest, null, 2)}\n`, 'utf8');
const emptyRun = run(emptyManifestPath);
const emptyReport = JSON.parse(emptyRun.stdout);
if (emptyRun.status === 0 || emptyReport.verdict !== 'REJECT') throw new Error(`empty manifest was not rejected: ${emptyRun.stdout}`);

// Protected pet ROIs are critic input, not optional visual guidance.
const protectedManifestPath = path.join(root, 'protected-manifest.json');
const protectedManifest = { ...manifest, protectedRois: [{ id: 'eye', row: 0, column: 0, zone: [10, 10, 30, 30] }] };
await fs.writeFile(protectedManifestPath, `${JSON.stringify(protectedManifest, null, 2)}\n`, 'utf8');
const protectedRun = run(protectedManifestPath);
const protectedReport = JSON.parse(protectedRun.stdout);
if (protectedRun.status === 0 || protectedReport.verdict !== 'REJECT' || protectedReport.metrics.protectedRoiViolations === 0) throw new Error(`protected ROI contamination was not rejected: ${protectedRun.stdout}`);

await fs.rm(root, { recursive: true, force: true });
console.log(JSON.stringify({ verdict: 'TEST_PASS', pass: passReport.verdict, reject: rejectReport.verdict, rejectedHoles: rejectReport.metrics.undeclaredHoleCells, relative: relativeReport.verdict, targetSource: targetSourceReport.verdict, rgbMask: rgbMaskReport.verdict, empty: emptyReport.verdict, protected: protectedReport.verdict }, null, 2));
