/** Run several offline redrawn-wearable batch items with bounded concurrency. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const configIndex = argv.indexOf('--config');
if (configIndex < 0 || !argv[configIndex + 1]) {
  console.error('usage: node scripts/run-redrawn-wearable-batch-set.mjs --config <batch-set.json> [--dry-run]');
  process.exit(1);
}
const configPath = path.resolve(argv[configIndex + 1]);
const forceDryRun = argv.includes('--dry-run');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
if (!Array.isArray(config.items) || config.items.length === 0) throw new Error('batch-set config requires a non-empty items array');
const concurrency = Math.max(1, Math.min(4, Number(config.concurrency) || 2));
const setOutput = path.resolve(config.output ?? path.join('artifacts', 'redrawn-wearable-batch-set', path.basename(configPath, path.extname(configPath))));
await fs.mkdir(setOutput, { recursive: true });

const runItem = async (item) => {
  const itemOutput = path.resolve(item.output ?? path.join(setOutput, item.id));
  const prefix = item.prefix ?? item.id;
  const referencedInputs = {
    base: item.base, target: item.target, spec: item.spec, lineage: item.lineage,
    ...(item.frontErase ? { frontErase: item.frontErase } : {}),
    ...(item.frozenAcceptanceSpec ? { frozenAcceptanceSpec: item.frozenAcceptanceSpec } : {}),
    ...(item.authoritativeFullDressed ? { authoritativeFullDressed: item.authoritativeFullDressed } : {}),
  };
  const missingInputs = [];
  for (const [role, inputPath] of Object.entries(referencedInputs)) {
    if (!inputPath) { missingInputs.push({ role, path: inputPath ?? null }); continue; }
    try { await fs.access(path.resolve(inputPath)); } catch { missingInputs.push({ role, path: path.resolve(inputPath) }); }
  }
  if (missingInputs.length > 0) return {
    id: item.id, exitCode: 2, verdict: 'REJECT', summaryPath: null,
    preflight: { verdict: 'REJECT', missingInputs, batchProcessStarted: false },
    publish: { executed: false, ready: false, reason: 'missing canonical/config input; rejected before item process start' },
    stdout: '', stderr: '',
  };
  return new Promise((resolve) => {
  const args = [
    'scripts/run-redrawn-wearable-batch.mjs',
    '--base', item.base, '--target', item.target, '--spec', item.spec, '--lineage', item.lineage,
    '--output', itemOutput, '--prefix', prefix,
  ];
  if (item.frontErase) args.push('--front-erase', item.frontErase);
  if (forceDryRun || item.dryRun !== false) args.push('--dry-run');
  for (const [key, value] of [
    ['retry-cells', item.retryCells], ['seed-mask', item.seedMask], ['expected-mask', item.expectedMask], ['expected-report', item.expectedReport],
    ['publish-pet-id', item.publish?.petId], ['publish-stage', item.publish?.stage], ['publish-wearable-id', item.publish?.wearableId],
    ['publish-slot', item.publish?.slot], ['publish-occludes', item.publish?.occludes?.join(',')],
  ]) if (value !== undefined && value !== null && value !== '') args.push(`--${key}`, String(value));
  const child = spawn(process.execPath, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', async (code) => {
    const summaryPath = path.join(itemOutput, `${prefix}-batch-summary.json`);
    let summary = null;
    try { summary = JSON.parse(await fs.readFile(summaryPath, 'utf8')); } catch { /* reported below */ }
    resolve({ id: item.id, exitCode: code, verdict: summary?.verdict ?? 'ERROR', summaryPath,
      preflight: { verdict: 'PASS', missingInputs: [], batchProcessStarted: true },
      publish: summary?.publish ?? { executed: false, ready: false, reason: 'item failed before publish plan' }, stdout: stdout.trim(), stderr: stderr.trim() });
  });
  });
};

const results = Array(config.items.length); let cursor = 0;
const worker = async () => {
  while (true) {
    const index = cursor; cursor += 1;
    if (index >= config.items.length) return;
    results[index] = await runItem(config.items[index]);
  }
};
await Promise.all(Array.from({ length: Math.min(concurrency, config.items.length) }, worker));
const passed = results.every((result) => result.exitCode === 0 && result.verdict === 'DATA_PASS');
const summary = {
  verdict: passed ? 'DATA_PASS' : 'REJECT', mode: 'OFFLINE_BATCH_SET_NO_PUBLISH',
  configPath, concurrency, published: false, manifestOrRuntimeModified: false,
  items: results, completedUtc: new Date().toISOString(),
};
const summaryPath = path.join(setOutput, 'batch-set-summary.json');
const markdownPath = path.join(setOutput, 'batch-set-summary.md');
await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
await fs.writeFile(markdownPath, [
  '# Redrawn wearable batch set', '', `- Verdict: **${summary.verdict}**`, '- Published: no',
  `- Concurrency: ${concurrency}`, '',
  ...results.map((result) => `- ${result.id}: ${result.verdict} — ${result.summaryPath}`), '',
].join('\n'), 'utf8');
console.log(JSON.stringify({ verdict: summary.verdict, summaryPath, markdownPath, items: results.map(({ id, verdict, summaryPath: itemSummary }) => ({ id, verdict, summaryPath: itemSummary })) }, null, 2));
if (!passed) process.exitCode = 2;
