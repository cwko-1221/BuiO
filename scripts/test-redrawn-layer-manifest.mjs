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

await fs.rm(root, { recursive: true, force: true });
console.log(JSON.stringify({ verdict: 'TEST_PASS', pass: passReport.verdict, reject: rejectReport.verdict, rejectedHoles: rejectReport.metrics.undeclaredHoleCells }, null, 2));
