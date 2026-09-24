'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { brotliDecompressSync } = require('node:zlib');
const test = require('node:test');

const distRoot = path.resolve(process.env.PET_COIN_PUSHER_DIST_ROOT || path.resolve(__dirname, '..', 'dist'));
const forbidden = [
  '/dev/unlimited-money',
  'grantUnlimitedMoney',
];
const required = [
  '/api/pet/coin-pusher/play',
  '/api/pet/coin-pusher/payout',
];

function textFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...textFiles(fullPath));
    else if (/\.(?:html|js|css|json|map|txt)$/i.test(entry.name)) files.push(fullPath);
  }
  return files;
}

test('production pet artifact contains the paid coin-pusher client but no dev-money endpoint', () => {
  const files = textFiles(distRoot);
  assert.ok(files.length > 0, `missing production artifact at ${distRoot}`);
  const artifact = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const marker of forbidden) {
      assert.equal(content.includes(marker), false, `${marker} leaked into ${path.relative(distRoot, file)}`);
    }
  }
  for (const marker of required) assert.equal(artifact.includes(marker), true, `${marker} missing from production client`);
});

test('production Rapier WASM has a valid compact Brotli sidecar for mobile delivery', () => {
  const assetsDir = path.join(distRoot, 'assets');
  const wasmName = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).find((name) => /^rapier_wasm3d_bg.*\.wasm$/i.test(name))
    : undefined;
  const wasmPath = wasmName ? path.join(assetsDir, wasmName) : undefined;
  assert.ok(wasmPath, `missing Rapier WASM in ${path.join(distRoot, 'assets')}`);
  const compressedPath = `${wasmPath}.br`;
  assert.equal(fs.existsSync(compressedPath), true, 'the build must emit a precompressed .wasm.br sidecar');

  const wasm = fs.readFileSync(wasmPath);
  const compressed = fs.readFileSync(compressedPath);
  assert.deepEqual(brotliDecompressSync(compressed), wasm, 'the Brotli sidecar must decode byte-for-byte to the WASM');
  assert.ok(compressed.length < wasm.length * .285,
    `maximum-quality Brotli should keep the mobile physics download under 28.5% of its raw size (${compressed.length}/${wasm.length})`);
});

test('production desktop coin-pusher artwork stays within its cold-load transfer budget', () => {
  const assetsDir = path.join(distRoot, 'assets');
  const budgets = [
    { name: 'backboard', pattern: /^coin-pusher-backboard-desktop-v2.*\.webp$/i, bytes: 200_000 },
    { name: 'minted coin face', pattern: /^coin-pusher-minted-paw-desktop-v2.*\.webp$/i, bytes: 110_000 },
  ];
  let combinedBytes = 0;
  for (const budget of budgets) {
    const name = fs.readdirSync(assetsDir).find((entry) => budget.pattern.test(entry));
    assert.ok(name, `missing optimized desktop ${budget.name} texture in ${assetsDir}`);
    const bytes = fs.statSync(path.join(assetsDir, name)).size;
    assert.ok(bytes <= budget.bytes,
      `desktop ${budget.name} texture should stay under ${budget.bytes} bytes (got ${bytes})`);
    combinedBytes += bytes;
  }
  assert.ok(combinedBytes <= 300_000,
    `desktop coin-pusher artwork should stay under 300 KB combined (got ${combinedBytes})`);
});
