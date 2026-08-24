/**
 * Fail-closed validation for the direction-aware redrawn wearable queue.
 * This is metadata validation only: it never turns a candidate into a
 * publishable asset and never rewrites the queue.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const workspace = process.cwd();
const queuePath = path.resolve(
  workspace,
  process.argv[2] ?? 'pet-app/art-source/imagegen/redrawn-wearable-production-queue.json',
);
const queue = JSON.parse(await fs.readFile(queuePath, 'utf8'));
const errors = [];
const expectedBatches = [
  ['front', [1, 2, 3, 4, 5]],
  ['side-right', [6, 7, 8, 9, 10]],
  ['back', [11, 12, 13, 14, 15]],
  ['special', [16, 17, 18, 19, 20]],
];
const slots = new Set(['head', 'face', 'neck', 'back']);
const layers = new Set(['rear', 'erase', 'patch', 'front']);

function fail(job, message) {
  errors.push(`${job.key ?? '<unknown job>'}: ${message}`);
}

if (!Array.isArray(queue.jobs) || queue.jobs.length === 0) {
  errors.push('queue.jobs must be a non-empty array');
}

for (const job of queue.jobs ?? []) {
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
    if (typeof batch?.source !== 'string' || !batch.source.endsWith('.png')) fail(job, `${id} source must be a PNG strip path`);
    const transform = batch?.transform;
    for (const flag of ['resize', 'rotate', 'mirror', 'translate']) {
      if (transform?.[flag] !== false) fail(job, `${id} transform.${flag} must be false`);
    }
  }
  if (!Array.isArray(job.anchorSpec) || job.anchorSpec.length === 0) fail(job, 'anchorSpec is empty');
  const order = job.occlusionSpec?.layerOrder;
  if (!Array.isArray(order) || order.length !== 4 || order.some((layer) => !layers.has(layer))) {
    fail(job, 'occlusionSpec.layerOrder must be rear/erase/patch/front');
  }
  if (!Array.isArray(job.semanticComponents) || job.semanticComponents.length === 0) fail(job, 'semanticComponents is empty');
  if (!Array.isArray(job.emptyByDefault)) fail(job, 'emptyByDefault must be an array');
  if (job.emptyByDefault?.includes('side-right')) fail(job, 'side-right cannot be empty by default');
  if (job.slot === 'face' || job.slot === 'neck') {
    if (!job.emptyByDefault.includes('back')) fail(job, `${job.slot} must declare back empty by default`);
  }
}

const result = {
  schemaVersion: 1,
  queue: path.relative(workspace, queuePath).replaceAll('\\', '/'),
  jobs: queue.jobs?.length ?? 0,
  directionBatchContract: 'direction-aware-v1',
  errorCount: errors.length,
  verdict: errors.length === 0 ? 'PASS_METADATA_ONLY' : 'REJECT',
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exitCode = 1;
