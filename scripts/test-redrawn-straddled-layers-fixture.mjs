/**
 * Synthetic-only regression for the back layering order. This fixture is
 * not a production target and never reads a published wearable output.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const WIDTH = 800; const HEIGHT = 640; const CHANNELS = 4;
const outputDirectory = path.resolve(process.argv[2] ?? 'artifacts/redrawn-straddled-fixture');
await fs.mkdir(outputDirectory, { recursive: true });
const base = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
const expected = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
const mask = Buffer.alloc(WIDTH * HEIGHT * CHANNELS);
const write = (buffer, x, y, rgba) => {
  const at = (y * WIDTH + x) * CHANNELS;
  buffer[at] = rgba[0]; buffer[at + 1] = rgba[1]; buffer[at + 2] = rgba[2]; buffer[at + 3] = rgba[3];
};
const over = (background, foreground) => {
  const ba = background[3] / 255; const fa = foreground[3] / 255; const oa = fa + ba * (1 - fa);
  if (oa <= 0) return [0, 0, 0, 0];
  return [
    Math.round((foreground[0] * fa + background[0] * ba * (1 - fa)) / oa),
    Math.round((foreground[1] * fa + background[1] * ba * (1 - fa)) / oa),
    Math.round((foreground[2] * fa + background[2] * ba * (1 - fa)) / oa),
    Math.round(oa * 255),
  ];
};
const paint = (zone, baseRgba, expectedRgba) => {
  for (let y = zone[1]; y < zone[3]; y += 1) for (let x = zone[0]; x < zone[2]; x += 1) {
    write(base, x, y, baseRgba); write(expected, x, y, expectedRgba); write(mask, x, y, [255, 255, 255, 255]);
  }
};

// r0c0: a mathematically solvable rear layer under a semi-transparent base.
const semiRed = [200, 0, 0, 128]; const rearBlue = [0, 0, 200, 255];
paint([30, 30, 40, 40], semiRed, over(rearBlue, semiRed));
// Outside the mask, alpha-zero hidden RGB must survive byte-for-byte.
write(base, 10, 10, [17, 23, 41, 0]); write(expected, 10, 10, [17, 23, 41, 0]);
// r0c0: ordinary patch then ordinary front, both over an opaque base.
paint([50, 30, 60, 40], [200, 0, 0, 255], [0, 200, 0, 255]);
paint([70, 30, 80, 40], [200, 0, 0, 255], [0, 0, 200, 255]);
// r0c0: intentionally unsolvable source-over pixel; exact result needs the
// declared minimal erase followed by direct patch replacement.
paint([90, 30, 100, 40], semiRed, [0, 200, 0, 128]);
// r1c0: thin horizontal side wing semantic, proving it lies flat on the back.
paint([30, 230, 70, 238], [0, 0, 0, 0], [32, 180, 220, 255]);

const basePath = path.join(outputDirectory, 'synthetic-base.png');
const expectedPath = path.join(outputDirectory, 'synthetic-expected-final.png');
const maskPath = path.join(outputDirectory, 'synthetic-canonical-mask.png');
const save = (buffer, filePath) => sharp(buffer, { raw: { width: WIDTH, height: HEIGHT, channels: CHANNELS } }).png({ compressionLevel: 9 }).toFile(filePath);
await Promise.all([save(base, basePath), save(expected, expectedPath), save(mask, maskPath)]);

const spec = {
  schemaVersion: 1, category: 'back', fixtureOnly: true,
  atlas: { width: 800, height: 640, cellWidth: 160, cellHeight: 160, columns: 5, rows: 4 },
  layering: {
    mode: 'rear-base-erase-patch-front',
    semanticRegions: [
      { id: 'rear-under-base', layer: 'rear', semantic: 'rear-wing', row: 0, column: 0, zone: [30, 30, 40, 40], minimumPixels: 100, maximumPixels: 100 },
      { id: 'ordinary-patch', layer: 'patch', semantic: 'body-contact-patch', row: 0, column: 0, zone: [50, 30, 60, 40], minimumPixels: 100, maximumPixels: 100 },
      { id: 'ordinary-front', layer: 'front', semantic: 'front-wing', row: 0, column: 0, zone: [70, 30, 80, 40], minimumPixels: 100, maximumPixels: 100 },
      { id: 'erase-replacement-patch', layer: 'patch', semantic: 'minimal-replacement', row: 0, column: 0, zone: [90, 30, 100, 40], minimumPixels: 100, maximumPixels: 100 },
      { id: 'flat-side-wing', layer: 'front', semantic: 'side-wing-flat-on-back', row: 1, column: 0, zone: [30, 70, 70, 78], minimumPixels: 320, maximumPixels: 320 }
    ],
    requiredSemanticCoverage: [
      { semantic: 'side-wing-flat-on-back', rows: [1], columns: [0], layers: ['front'], minimumPixels: 320 }
    ],
    topology: {
      layers: {
        rear: { defaultMinimumComponents: 0, defaultMaximumComponents: 0, defaultExpectedHoles: 0, cells: [{ row: 0, column: 0, expectedComponents: 1, expectedHoles: 0 }] },
        patch: { defaultMinimumComponents: 0, defaultMaximumComponents: 0, defaultExpectedHoles: 0, cells: [{ row: 0, column: 0, expectedComponents: 2, expectedHoles: 0 }] },
        front: { defaultMinimumComponents: 0, defaultMaximumComponents: 0, defaultExpectedHoles: 0, cells: [{ row: 0, column: 0, expectedComponents: 1, expectedHoles: 0 }, { row: 1, column: 0, expectedComponents: 1, expectedHoles: 0 }] }
      }
    }
  },
  solve: {
    maximumErasePixels: 100, unexpectedUnsolvablePixels: 0, exactRgbaMismatchPixels: 0,
    eraseReplacement: { mode: 'minimal-source-over-fallback', allowedRegions: [{ id: 'declared-minimal-erase', layer: 'patch', row: 0, column: 0, zone: [90, 30, 100, 40], minimumPixels: 100, maximumPixels: 100 }] }
  }
};
const specPath = path.join(outputDirectory, 'synthetic-back-spec.json');
await fs.writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');
const solveDirectory = path.join(outputDirectory, 'solved');
const run = spawnSync(process.execPath, [
  'scripts/solve-redrawn-straddled-layers.mjs', expectedPath, basePath, maskPath, specPath, solveDirectory, 'synthetic-order',
], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
if (![0, 2].includes(run.status)) throw new Error(run.stderr || run.stdout || `solver exited ${run.status}`);
const reportPath = path.join(solveDirectory, 'synthetic-order-report.json');
const report = JSON.parse(await fs.readFile(reportPath, 'utf8'));
const hiddenRgb = report.metrics.rearTransparentRgbNonZeroPixels + report.metrics.patchTransparentRgbNonZeroPixels
  + report.metrics.frontTransparentRgbNonZeroPixels + report.metrics.eraseTransparentRgbNonZeroPixels;
const assertions = {
  verdict: report.verdict === 'DATA_PASS',
  exactRgbaZero: report.metrics.exactRgbaMismatchPixels === 0,
  baseHiddenRgbaPreservedOutsideMask: report.metrics.baseRgbaMismatchOutsideMaskPixels === 0,
  unexpectedUnsolvableZero: report.metrics.unexpectedUnsolvablePixels === 0,
  minimalEraseExactly100: report.metrics.forcedErasePixels === 100,
  transparentRgbZero: hiddenRgb === 0,
  declaredOrder: JSON.stringify(report.layerOrder) === JSON.stringify(['rear', 'base', 'minimal erase', 'patch', 'front']),
  sideWingSemanticPass: report.requiredSemanticCoverage.every((entry) => entry.verdict === 'PASS'),
  perLayerTopologyPass: report.topologyCells.every((entry) => entry.verdict === 'PASS'),
};
const pass = Object.values(assertions).every(Boolean);
const fixtureReport = {
  verdict: pass ? 'PASS' : 'REJECT', syntheticOnly: true, publishedOutputRead: false,
  inputs: { basePath, expectedPath, maskPath, specPath }, solverReportPath: reportPath,
  assertions, metrics: report.metrics, layerOrder: report.layerOrder,
};
const fixtureReportPath = path.join(outputDirectory, 'fixture-regression-report.json');
await fs.writeFile(fixtureReportPath, `${JSON.stringify(fixtureReport, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: fixtureReport.verdict, fixtureReportPath, solverReportPath: reportPath, assertions, metrics: report.metrics }, null, 2));
if (!pass) process.exitCode = 2;
