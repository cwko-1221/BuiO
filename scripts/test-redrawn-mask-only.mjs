/**
 * Regression test for the same-coordinate accessory mask gate.
 *
 * The fixture deliberately contains twenty valid atlas cells.  The first run
 * must pass; the second introduces one enclosed transparent pixel and must be
 * rejected.  This keeps accidental pinholes from becoming publishable masks.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

const WIDTH = 800;
const HEIGHT = 640;
const CELL = 160;
const CHANNELS = 4;

const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, stdout, stderr }));
});

const makeFixture = (withHole) => {
  const target = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  const broad = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  const mask = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  const layer = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      for (let y = 24; y < 136; y += 1) {
        for (let x = 24; x < 136; x += 1) {
          if (withHole && row === 0 && column === 0 && x === 80 && y === 80) continue;
          const at = (((row * CELL + y) * WIDTH + column * CELL + x) * CHANNELS);
          target[at] = 245;
          target[at + 1] = 150;
          target[at + 2] = 45;
          target[at + 3] = 255;
          broad[at] = 255;
          broad[at + 1] = 255;
          broad[at + 2] = 255;
          broad[at + 3] = 255;
          mask[at] = 255;
          mask[at + 1] = 255;
          mask[at + 2] = 255;
          mask[at + 3] = 255;
          layer[at] = target[at];
          layer[at + 1] = target[at + 1];
          layer[at + 2] = target[at + 2];
          layer[at + 3] = target[at + 3];
        }
      }
    }
  }
  return { target, broad, mask, layer };
};

const write = (buffer, destination) => sharp(buffer, {
  raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS },
}).png().toFile(destination);

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-mask-only-'));
try {
  for (const withHole of [false, true]) {
    const fixture = makeFixture(withHole);
    const prefix = withHole ? 'hole' : 'solid';
    const paths = Object.fromEntries(await Promise.all(
      Object.entries(fixture).map(async ([name, buffer]) => {
        const destination = path.join(root, `${prefix}-${name}.png`);
        await write(buffer, destination);
        return [name, destination];
      }),
    ));
    const reportPath = path.join(root, `${prefix}.json`);
    const result = await run([
      'scripts/audit-redrawn-mask-only.mjs', paths.target, paths.broad,
      paths.mask, paths.layer, reportPath,
    ]);
    assert.equal(result.code, 0, `${prefix}: audit should return a JSON report\n${result.stderr}`);
    const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
    assert.equal(report.technicalVerdict, withHole ? 'REJECT' : 'PASS', `${prefix}: unexpected verdict`);
    if (withHole) {
      assert.ok(report.cells.some((cell) => cell.enclosedTransparentHoles.length === 1), 'pinhole was not reported');
    }
  }
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log(`TEST_PASS ${crypto.randomUUID().slice(0, 8)} mask-only topology gate`);
