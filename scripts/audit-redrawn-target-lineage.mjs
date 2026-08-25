/**
 * Fail-fast lineage audit for a frozen full-redraw target.
 *
 * This runs before masking.  It is intentionally independent from the layer
 * solver: a target whose bytes already equal an earlier composite is not a
 * full redraw, even when a later mask/composite can reproduce it perfectly.
 * The audit is read-only apart from an optional JSON report.
 *
 *   node scripts/audit-redrawn-target-lineage.mjs \
 *     --target <800x640-target.png> \
 *     --roots artifacts,pet-app/art-source/imagegen \
 *     [--lineage lineage.json] [--output report.json]
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const valueFor = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const targetInput = valueFor('--target');
const rootsInput = valueFor('--roots');
const lineageInput = valueFor('--lineage');
const outputInput = valueFor('--output');
if (!targetInput || !rootsInput) {
  console.error('usage: node scripts/audit-redrawn-target-lineage.mjs --target <target.png> --roots <root[,root...]> [--lineage lineage.json] [--output report.json]');
  process.exit(2);
}

const targetPath = path.resolve(targetInput);
const roots = rootsInput.split(',').map((value) => path.resolve(value.trim())).filter(Boolean);
const sha256 = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const relative = (input) => path.relative(process.cwd(), input).replaceAll('\\', '/');
const errors = [];
const warnings = [];

const targetStat = await fs.stat(targetPath).catch((error) => {
  errors.push(`target cannot be read: ${error.message}`);
  return null;
});
const targetHash = targetStat ? await sha256(targetPath) : null;
let targetMetadata = null;
if (targetStat) {
  targetMetadata = await sharp(targetPath).metadata().catch((error) => {
    errors.push(`target metadata cannot be read: ${error.message}`);
    return null;
  });
  if (targetMetadata && (targetMetadata.width !== 800 || targetMetadata.height !== 640 || targetMetadata.channels !== 4 || targetMetadata.hasAlpha !== true)) {
    errors.push(`target must decode as 800x640 RGBA; got ${targetMetadata.width ?? '?'}x${targetMetadata.height ?? '?'} channels=${targetMetadata.channels ?? '?'} alpha=${targetMetadata.hasAlpha ?? false}`);
  }
  if (/composite|recompose/i.test(path.basename(targetPath))) errors.push('target filename may not contain composite or recompose');
}

const walk = async (root) => {
  const files = [];
  const visit = async (directory) => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile() && /\.(?:png|webp)$/i.test(entry.name) && /composite|recompose/i.test(entry.name)) files.push(full);
    }
  };
  await visit(root);
  return files;
};

const candidatePaths = [...new Set((await Promise.all(roots.map(walk))).flat())]
  .filter((input) => path.resolve(input) !== targetPath);
const matches = [];
for (const candidate of candidatePaths) {
  const candidateHash = await sha256(candidate).catch(() => null);
  if (candidateHash && candidateHash === targetHash) matches.push({ path: relative(candidate), sha256: candidateHash });
}
if (matches.length > 0) errors.push(`target bytes match ${matches.length} earlier composite/recompose output(s)`);

let lineage = null;
if (lineageInput) {
  const lineagePath = path.resolve(lineageInput);
  lineage = await fs.readFile(lineagePath, 'utf8').then(JSON.parse).catch((error) => {
    errors.push(`lineage cannot be read: ${error.message}`);
    return null;
  });
  if (lineage) {
    const declaredPath = lineage.output?.targetPath ?? lineage.output?.path ?? lineage.output?.v3Path ?? lineage.lineage?.output;
    const declaredHash = typeof lineage.output?.sha256 === 'string'
      ? lineage.output.sha256
      : lineage.output?.sha256?.target ?? lineage.lineage?.outputSha256;
    const earlier = lineage.verification?.earlierCompositeHashMatches ?? lineage.lineage?.earlierCompositeScan?.sha256Matches
      ?? lineage.lineage?.earlierCompositeHashMatches;
    if (lineage.verdict !== 'PASS') errors.push('lineage verdict must be PASS');
    if (!declaredPath || path.resolve(declaredPath) !== targetPath) errors.push('lineage target path does not identify this exact target');
    if (!declaredHash || declaredHash !== targetHash) errors.push('lineage target SHA256 does not match this target');
    if (!Array.isArray(earlier) || earlier.length !== 0) errors.push('lineage must prove zero earlier composite hash matches');
  }
}

if (targetStat && targetStat.mtimeMs > Date.now() + 60_000) warnings.push('target modification time is in the future; check clock or copied-artifact metadata');
const report = {
  schemaVersion: 1,
  verdict: errors.length === 0 ? 'PASS' : 'REJECT',
  target: { path: relative(targetPath), sha256: targetHash, metadata: targetMetadata },
  scan: { roots: roots.map(relative), candidateCount: candidatePaths.length, compositeHashMatches: matches },
  lineage: lineageInput ? { path: relative(path.resolve(lineageInput)), supplied: Boolean(lineage) } : null,
  errors,
  warnings,
  policy: {
    targetMustBeIndependent: true,
    compositeHashMatchRejects: true,
    noPixelRepairOrTransformPerformed: true,
  },
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputInput) {
  const outputPath = path.resolve(outputInput);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, serialized, 'utf8');
}
process.stdout.write(serialized);
if (report.verdict !== 'PASS') process.exitCode = 2;
