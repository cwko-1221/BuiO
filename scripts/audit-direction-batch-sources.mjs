/**
 * Read-only, parallel ingress audit for direction-aware wearable sources.
 *
 * This deliberately runs before any masking or compositing work. It never
 * resizes, converts, packs, or repairs an image; a source either already is
 * the production-shaped 800x160 RGBA PNG or it is rejected at ingress.
 *
 *   node scripts/audit-direction-batch-sources.mjs \
 *     --queue pet-app/art-source/imagegen/redrawn-wearable-production-queue.json \
 *     --pet starpatch-cat --stage 1 \
 *     --output artifacts/direction-source-audit.json
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const valueFor = (name) => {
  const index = argv.indexOf(`--${name}`);
  if (index < 0) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`missing value for --${name}`);
  return value;
};

const queuePath = valueFor('queue');
if (!queuePath) {
  console.error('usage: node scripts/audit-direction-batch-sources.mjs --queue <queue.json> [--pet id] [--stage n] [--output report.json] [--concurrency n]');
  process.exit(1);
}
const petFilter = valueFor('pet');
const stageValue = valueFor('stage');
const stageFilter = stageValue === null ? null : Number(stageValue);
if (stageFilter !== null && !Number.isInteger(stageFilter)) throw new Error('--stage must be an integer');
const outputPath = valueFor('output');
const concurrencyValue = valueFor('concurrency');
const concurrency = Math.max(1, Math.min(16, Number(concurrencyValue ?? 8)));
if (!Number.isInteger(concurrency)) throw new Error('--concurrency must be an integer');

const EXPECTED = { width: 800, height: 160, format: 'png', channels: 4, hasAlpha: true };
const sha256 = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const resolveInput = (input) => path.resolve(process.cwd(), input);
const relative = (input) => path.relative(process.cwd(), input).replaceAll('\\', '/');

const queue = JSON.parse(await fs.readFile(resolveInput(queuePath), 'utf8'));
if (!Array.isArray(queue.jobs)) throw new Error('queue.jobs must be an array');
const jobs = queue.jobs.filter((job) => (
  (!petFilter || job.petId === petFilter)
  && (stageFilter === null || job.stage === stageFilter)
));
if (jobs.length === 0) throw new Error('no queue jobs matched the requested filters');

const sources = [];
for (const job of jobs) {
  if (!Array.isArray(job.directionBatch) || job.directionBatch.length !== 4) {
    sources.push({
      key: job.key,
      petId: job.petId,
      stage: job.stage,
      wearableId: job.wearableId,
      direction: null,
      source: null,
      resolvedSource: null,
      verdict: 'REJECT_PREMASK',
      errors: ['directionBatch must contain exactly four direction sources'],
    });
    continue;
  }
  const seenDirections = new Set();
  for (const direction of job.directionBatch) {
    const id = direction?.id ?? null;
    const source = typeof direction?.source === 'string' ? direction.source : null;
    const errors = [];
    if (!['front', 'side-right', 'back', 'special'].includes(id)) errors.push(`unsupported direction id: ${id ?? 'missing'}`);
    if (seenDirections.has(id)) errors.push(`duplicate direction id: ${id}`);
    seenDirections.add(id);
    if (!source) errors.push('source path is missing');
    sources.push({
      key: job.key,
      petId: job.petId,
      stage: job.stage,
      wearableId: job.wearableId,
      direction: id,
      source,
      resolvedSource: source ? resolveInput(source) : null,
      declaredTransform: direction?.transform ?? null,
      errors,
    });
  }
}

let cursor = 0;
const worker = async () => {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= sources.length) return;
    const entry = sources[index];
    if (entry.errors.length > 0 || !entry.resolvedSource) {
      entry.verdict = 'REJECT_PREMASK';
      continue;
    }
    try {
      const metadata = await sharp(entry.resolvedSource).metadata();
      entry.observed = {
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        format: metadata.format ?? null,
        channels: metadata.channels ?? null,
        hasAlpha: metadata.hasAlpha === true,
      };
      if (metadata.width !== EXPECTED.width) entry.errors.push(`dimensions must be ${EXPECTED.width}x${EXPECTED.height}, got ${metadata.width ?? 'unknown'}x${metadata.height ?? 'unknown'}`);
      if (metadata.height !== EXPECTED.height) entry.errors.push(`dimensions must be ${EXPECTED.width}x${EXPECTED.height}, got ${metadata.width ?? 'unknown'}x${metadata.height ?? 'unknown'}`);
      if (metadata.format !== EXPECTED.format) entry.errors.push(`format must be ${EXPECTED.format}, got ${metadata.format ?? 'unknown'}`);
      if (metadata.channels !== EXPECTED.channels || metadata.hasAlpha !== EXPECTED.hasAlpha) {
        entry.errors.push('source must be an explicit RGBA PNG with alpha; checkerboard/opaque RGB sources are forbidden');
      }
      if (entry.errors.length === 0) entry.sha256 = await sha256(entry.resolvedSource);
    } catch (error) {
      entry.errors.push(`cannot read source: ${error.message}`);
    }
    entry.verdict = entry.errors.length === 0 ? 'PASS_SOURCE_SHAPE' : 'REJECT_PREMASK';
  }
};
await Promise.all(Array.from({ length: Math.min(concurrency, sources.length) }, worker));

const byKey = new Map();
for (const entry of sources) {
  if (!byKey.has(entry.key)) byKey.set(entry.key, []);
  byKey.get(entry.key).push(entry);
}
const jobResults = jobs.map((job) => {
  const directionResults = byKey.get(job.key) ?? [];
  const pass = directionResults.length === 4 && directionResults.every((entry) => entry.verdict === 'PASS_SOURCE_SHAPE');
  return {
    key: job.key,
    petId: job.petId,
    stage: job.stage,
    wearableId: job.wearableId,
    status: pass ? 'READY_FOR_MASKING_PREFLIGHT' : 'REJECT_PREMASK',
    directionResults,
  };
});
const summary = {
  schemaVersion: 1,
  queue: relative(resolveInput(queuePath)),
  filters: { pet: petFilter, stage: stageFilter },
  expected: EXPECTED,
  concurrency,
  jobCount: jobs.length,
  directionSources: sources.length,
  readyJobs: jobResults.filter((job) => job.status === 'READY_FOR_MASKING_PREFLIGHT').length,
  rejectedJobs: jobResults.filter((job) => job.status === 'REJECT_PREMASK').length,
  passedSources: sources.filter((entry) => entry.verdict === 'PASS_SOURCE_SHAPE').length,
  rejectedSources: sources.filter((entry) => entry.verdict === 'REJECT_PREMASK').length,
  verdict: jobResults.every((job) => job.status === 'READY_FOR_MASKING_PREFLIGHT') ? 'PASS_SOURCE_INVENTORY' : 'REJECT_PREMASK_SOURCES',
  jobs: jobResults,
  generatedAt: new Date().toISOString(),
};
if (outputPath) {
  const resolvedOutput = resolveInput(outputPath);
  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fs.writeFile(resolvedOutput, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({
  verdict: summary.verdict,
  queue: summary.queue,
  jobCount: summary.jobCount,
  readyJobs: summary.readyJobs,
  rejectedJobs: summary.rejectedJobs,
  passedSources: summary.passedSources,
  rejectedSources: summary.rejectedSources,
  output: outputPath ? relative(resolveInput(outputPath)) : null,
}, null, 2));
if (summary.verdict !== 'PASS_SOURCE_INVENTORY') process.exitCode = 2;
