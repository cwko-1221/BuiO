/**
 * Fail-closed validation for the direction-aware redrawn wearable queue.
 * This is metadata validation only: it never turns a candidate into a
 * publishable asset and never rewrites the queue.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { catalog } = require('../pet-app/lib/catalog.js');

const workspace = process.cwd();
const queuePath = path.resolve(
  workspace,
  process.argv[2] ?? 'pet-app/art-source/imagegen/redrawn-wearable-production-queue.json',
);
const queue = JSON.parse(await fs.readFile(queuePath, 'utf8'));
const manifestPath = path.resolve(workspace, 'pet-app/public/assets/art/outfit-atlases/manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const errors = [];
const warnings = [];
const expectedBatches = [
  ['front', [1, 2, 3, 4, 5]],
  ['side-right', [6, 7, 8, 9, 10]],
  ['back', [11, 12, 13, 14, 15]],
  ['special', [16, 17, 18, 19, 20]],
];
const slots = new Set(['head', 'face', 'neck', 'back']);
const layers = new Set(['rear', 'erase', 'patch', 'front']);
const directions = new Set(['front', 'side-right', 'back', 'special']);
const anchorNames = new Set([
  'headContactArc', 'tailSafeBoundary', 'eyeLine', 'muzzleClearance',
  'neckContactArc', 'pendantDrop', 'backSpine', 'auraCenter',
]);

function fail(job, message) {
  errors.push(`${job.key ?? '<unknown job>'}: ${message}`);
}

if (!Array.isArray(queue.jobs) || queue.jobs.length === 0) {
  errors.push('queue.jobs must be a non-empty array');
}

const expectedJobs = new Set();
const importedPath = path.resolve(workspace, 'pet-app/public/assets/art/sprites/imported.json');
const imported = JSON.parse(await fs.readFile(importedPath, 'utf8'));
const physical = catalog.wearables.filter((item) => item.slot !== 'aura');
for (const pet of catalog.pets.filter((candidate) => imported[candidate.id])) {
  for (const stage of queue.scope?.activeStages ?? []) {
    for (const item of physical) expectedJobs.add(`${pet.id}:${stage}:${item.id}`);
  }
}
const seenKeys = new Set();

for (const job of queue.jobs ?? []) {
  if (seenKeys.has(job.key)) fail(job, 'duplicate job key');
  seenKeys.add(job.key);
  if (!expectedJobs.has(job.key)) fail(job, 'job key is outside the declared pet/stage/wearable scope');
  for (const field of ['petId', 'stage', 'wearableId', 'slot', 'baseAtlas', 'sourceFolder', 'expectedFullRedraw']) {
    if (job[field] === undefined || job[field] === null || job[field] === '') fail(job, `missing ${field}`);
  }
  if (job.contractVersion !== 'direction-aware-v1') fail(job, 'missing direction-aware-v1 contractVersion');
  if (!slots.has(job.slot)) fail(job, `unsupported slot ${job.slot}`);
  if (!Array.isArray(job.directionBatch) || job.directionBatch.length !== 4) {
    fail(job, 'directionBatch must contain exactly four batches');
    continue;
  }
  for (let i = 0; i < expectedBatches.length; i += 1) {
    const [id, cells] = expectedBatches[i];
    const batch = job.directionBatch[i];
    if (!batch || batch.id !== id) fail(job, `batch ${i + 1} must be ${id}`);
    if (JSON.stringify(batch?.cells) !== JSON.stringify(cells)) fail(job, `${id} cells do not match [${cells.join(',')}]`);
    if (!directions.has(batch?.id)) fail(job, `${id} is not a supported direction batch`);
    if (typeof batch?.source !== 'string' || !batch.source.endsWith('.png')) fail(job, `${id} source must be a PNG strip path`);
    const transform = batch?.transform;
    if (!transform || Object.keys(transform).some((key) => !['resize', 'rotate', 'mirror', 'translate'].includes(key))) {
      fail(job, `${id} transform contains unsupported flags`);
    }
    for (const flag of ['resize', 'rotate', 'mirror', 'translate']) {
      if (transform?.[flag] !== false) fail(job, `${id} transform.${flag} must be false`);
    }
  }
  if (!Array.isArray(job.anchorSpec) || job.anchorSpec.length === 0) fail(job, 'anchorSpec is empty');
  const order = job.occlusionSpec?.layerOrder;
  if (JSON.stringify(order) !== JSON.stringify(['rear', 'erase', 'patch', 'front'])) {
    fail(job, 'occlusionSpec.layerOrder must be exactly rear/erase/patch/front');
  }
  if (!Array.isArray(job.occlusionSpec?.protected) || job.occlusionSpec.protected.length === 0) fail(job, 'occlusionSpec.protected is empty');
  if (!Array.isArray(job.semanticComponents) || job.semanticComponents.length === 0) fail(job, 'semanticComponents is empty');
  if (job.anchorSpec?.some((anchor) => !anchorNames.has(anchor))) fail(job, 'anchorSpec contains an unknown anchor');
  if (job.semanticComponents?.some((component) => typeof component !== 'string' || component.length === 0)) fail(job, 'semanticComponents contains an invalid value');
  if (!Array.isArray(job.emptyByDefault)) fail(job, 'emptyByDefault must be an array');
  if (job.emptyByDefault?.some((direction) => !directions.has(direction))) fail(job, 'emptyByDefault contains an unknown direction');
  if (job.emptyByDefault?.includes('side-right')) fail(job, 'side-right cannot be empty by default');
  if (job.slot === 'face' || job.slot === 'neck') {
    if (!job.emptyByDefault.includes('back')) fail(job, `${job.slot} must declare back empty by default`);
  }
  const manifestEntry = manifest.modular?.[job.key] ?? null;
  if (Boolean(manifestEntry) !== (job.status === 'ready')) fail(job, 'status and manifest.modular entry disagree');
  if (job.published !== null && JSON.stringify(job.published) !== JSON.stringify(manifestEntry)) fail(job, 'published does not equal manifest.modular entry');
  if (job.status === 'ready') {
    warnings.push(`${job.key}: legacy ready entry has no direction-batch PASS evidence; runtime stays approved but new publish is blocked`);
  }
}

for (const key of Object.keys(manifest.modular ?? {})) {
  if (!seenKeys.has(key)) errors.push(`manifest.modular contains out-of-scope entry ${key}`);
}
if (seenKeys.size !== expectedJobs.size) errors.push(`job coverage mismatch: expected ${expectedJobs.size}, found ${seenKeys.size}`);

const result = {
  schemaVersion: 1,
  queue: path.relative(workspace, queuePath).replaceAll('\\', '/'),
  jobs: queue.jobs?.length ?? 0,
  directionBatchContract: 'direction-aware-v1',
  errorCount: errors.length,
  warningCount: warnings.length,
  warnings,
  verdict: errors.length === 0 ? 'PASS_METADATA_ONLY' : 'REJECT',
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exitCode = 1;
