/** Regression coverage for strict RGBA ingress in preflight-redrawn-wearable. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const root = await fs.mkdtemp(path.join(process.cwd(), 'artifacts', 'redrawn-preflight-test-'));
const width = 800;
const height = 640;
const pixels = width * height;
const rgba = Buffer.alloc(pixels * 4);
const target = Buffer.alloc(pixels * 4);
const mask = Buffer.alloc(pixels * 4);
for (let pixel = 0; pixel < pixels; pixel += 1) {
  const at = pixel * 4;
  rgba[at] = 30; rgba[at + 1] = 40; rgba[at + 2] = 50; rgba[at + 3] = 255;
  target.set(rgba.subarray(at, at + 4), at);
}
for (let y = 10; y < 30; y += 1) for (let x = 10; x < 30; x += 1) {
  const at = (y * width + x) * 4;
  target[at] = 220; target[at + 1] = 80; target[at + 2] = 40;
  mask[at + 3] = 255;
}
const writeRgba = async (name, data) => {
  const output = path.join(root, name);
  await sharp(data, { raw: { width, height, channels: 4 } }).png().toFile(output);
  return output;
};
const writeRgb = async (name) => {
  const output = path.join(root, name);
  await sharp(Buffer.alloc(pixels * 3, 255), { raw: { width, height, channels: 3 } }).png().toFile(output);
  return output;
};
const basePath = await writeRgba('base.png', rgba);
const targetPath = await writeRgba('target.png', target);
const maskPath = await writeRgba('mask.png', mask);
const reportPath = path.join(root, 'report.json');
const run = (targetInput, supportMask) => spawnSync(
  process.execPath,
  ['scripts/preflight-redrawn-wearable.mjs', targetInput, basePath, supportMask, reportPath],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);

const pass = run(targetPath, maskPath);
const passReport = JSON.parse(await fs.readFile(reportPath, 'utf8'));
if (pass.status !== 0 || passReport.verdict !== 'EARLY_PASS_TO_MASK_SOLVER') {
  throw new Error(`valid RGBA fixture rejected: ${pass.stdout}\n${pass.stderr}`);
}

const rgbMaskPath = await writeRgb('rgb-mask.png');
const rgbMaskRun = run(targetPath, rgbMaskPath);
if (rgbMaskRun.status === 0 || !`${rgbMaskRun.stdout}\n${rgbMaskRun.stderr}`.includes('explicit RGBA alpha')) {
  throw new Error(`opaque RGB support mask was not rejected: ${rgbMaskRun.stdout}\n${rgbMaskRun.stderr}`);
}

const rgbTargetPath = await writeRgb('rgb-target.png');
const rgbTargetRun = run(rgbTargetPath, maskPath);
if (rgbTargetRun.status === 0 || !`${rgbTargetRun.stdout}\n${rgbTargetRun.stderr}`.includes('explicit RGBA alpha')) {
  throw new Error(`opaque RGB full redraw was not rejected: ${rgbTargetRun.stdout}\n${rgbTargetRun.stderr}`);
}

await fs.rm(root, { recursive: true, force: true });
console.log(JSON.stringify({ verdict: 'TEST_PASS', valid: passReport.verdict, rgbMask: 'REJECT', rgbTarget: 'REJECT' }, null, 2));
