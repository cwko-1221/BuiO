import { copyFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = resolve(process.argv[2] ?? 'public/models/respiratory.glb');
const work = join(tmpdir(), `${basename(source, '.glb')}-${process.pid}`);
const cleaned = `${work}-clean.glb`;
const quantized = `${work}-quantized.glb`;
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(args) {
  const result = spawnSync(npx, ['--yes', '@gltf-transform/cli@4.5.0', ...args], {
    cwd: dirname(source),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

copyFileSync(source, `${work}-source.glb`);
try {
  run([
    'optimize', source, cleaned,
    '--compress', 'false', '--simplify', 'false', '--flatten', 'false',
    '--instance', 'false', '--join', 'false', '--palette', 'false',
    '--texture-compress', 'false', '--prune', 'true', '--weld', 'true',
    '--sparse', 'true',
  ]);
  run([
    'quantize', cleaned, quantized,
    '--quantization-volume', 'scene', '--quantize-position', '16',
    '--quantize-normal', '12', '--quantize-texcoord', '14',
    '--quantize-color', '8',
  ]);
  run(['validate', quantized]);
  renameSync(quantized, source);
  console.log(`Optimized ${source}: ${statSync(`${work}-source.glb`).size} -> ${statSync(source).size} bytes`);
} finally {
  for (const path of [`${work}-source.glb`, cleaned, quantized]) {
    rmSync(path, { force: true });
  }
}
