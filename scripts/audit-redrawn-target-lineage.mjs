/**
 * CLI wrapper for the shared frozen-target lineage audit.
 *
 *   node scripts/audit-redrawn-target-lineage.mjs \
 *     --target <800x640-target.png> \
 *     --roots artifacts,pet-app/art-source/imagegen \
 *     [--lineage lineage.json] [--output report.json]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { auditTargetLineage } from './lib/audit-redrawn-target-lineage.mjs';

const argv = process.argv.slice(2);
const valueFor = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
};
const targetInput = valueFor('--target');
const rootsInput = valueFor('--roots');
const lineageInput = valueFor('--lineage') ?? null;
const outputInput = valueFor('--output');
if (!targetInput || !rootsInput) {
  console.error('usage: node scripts/audit-redrawn-target-lineage.mjs --target <target.png> --roots <root[,root...]> [--lineage lineage.json] [--output report.json]');
  process.exit(2);
}

const report = await auditTargetLineage({ targetInput, rootsInput, lineageInput });
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputInput) {
  const outputPath = path.resolve(outputInput);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, serialized, 'utf8');
}
process.stdout.write(serialized);
if (report.verdict !== 'PASS') process.exitCode = 2;
