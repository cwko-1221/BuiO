/**
 * Regression test for the queue ingress target-lineage gate.
 *
 * It exercises the direction-source audit itself (not just the helper): an
 * expectedFullRedraw that is byte-identical to a prior composite is rejected
 * before masking readiness, while an independent RGBA atlas is allowed to
 * proceed when all four raw direction strips are valid.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const workspace = process.cwd();
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bui-o-lineage-gate-'));
const sourceFolder = path.join(tempRoot, 'sources');
const compositeRoot = path.join(tempRoot, 'history');
await fs.mkdir(sourceFolder, { recursive: true });
await fs.mkdir(compositeRoot, { recursive: true });

const writePng = async (filePath, color) => {
  await sharp({ create: { width: color.width, height: color.height, channels: 4, background: color.background } })
    .png().toFile(filePath);
};
const writeDirections = async (folder) => {
  for (const direction of ['front', 'side-right', 'back', 'special']) {
    await writePng(path.join(folder, `item-${direction}-strip.png`), {
      width: 800, height: 160, background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  }
};
const writeQueue = async (targetPath, folder) => {
  const job = {
    key: 'test-pet:1:head-test',
    petId: 'test-pet', stage: 1, wearableId: 'head-test', expectedFullRedraw: targetPath,
    directionBatch: ['front', 'side-right', 'back', 'special'].map((id) => ({
      id, source: path.join(folder, `item-${id}-strip.png`), transform: { resize: false, rotate: false, mirror: false, translate: false },
    })),
  };
  const queuePath = path.join(tempRoot, `queue-${path.basename(targetPath, '.png')}.json`);
  await fs.writeFile(queuePath, `${JSON.stringify({ jobs: [job] }, null, 2)}\n`);
  return queuePath;
};
const runAudit = async (queuePath, id) => {
  const outputPath = path.join(tempRoot, `audit-${id}.json`);
  const run = spawnSync(process.execPath, [
    'scripts/audit-direction-batch-sources.mjs', '--queue', queuePath,
    '--lineage-roots', compositeRoot, '--concurrency', '1', '--lineage-concurrency', '2', '--output', outputPath,
  ], { cwd: workspace, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (!run.stdout.trim()) throw new Error(`audit produced no JSON: ${run.stderr}`);
  return { exitCode: run.status, report: JSON.parse(await fs.readFile(outputPath, 'utf8')) };
};

try {
  const history = path.join(compositeRoot, 'earlier-composite.png');
  const copiedTarget = path.join(tempRoot, 'copied-target.png');
  await writePng(history, { width: 800, height: 640, background: { r: 90, g: 60, b: 30, alpha: 1 } });
  await fs.copyFile(history, copiedTarget);
  await writeDirections(sourceFolder);
  const rejected = await runAudit(await writeQueue(copiedTarget, sourceFolder), 'rejected');
  const rejectedJob = rejected.report.jobs[0];
  if (rejected.exitCode === 0 || rejected.report.verdict !== 'REJECT_PREMASK_SOURCES'
    || rejected.report.lineageConcurrency !== 2
    || rejectedJob.targetLineage?.verdict !== 'REJECT'
    || !rejectedJob.targetLineage.errors.some((message) => message.includes('match 1 earlier composite'))) {
    throw new Error(`composite-derived target was not rejected: ${JSON.stringify(rejected.report)}`);
  }

  const independentTarget = path.join(tempRoot, 'independent-target.png');
  await writePng(independentTarget, { width: 800, height: 640, background: { r: 91, g: 60, b: 30, alpha: 1 } });
  const accepted = await runAudit(await writeQueue(independentTarget, sourceFolder), 'accepted');
  const acceptedJob = accepted.report.jobs[0];
  if (accepted.exitCode !== 0 || accepted.report.verdict !== 'PASS_SOURCE_INVENTORY'
    || accepted.report.lineageConcurrency !== 2
    || acceptedJob.targetLineage?.verdict !== 'PASS'
    || acceptedJob.status !== 'READY_FOR_MASKING_PREFLIGHT') {
    throw new Error(`independent target was not admitted: ${JSON.stringify(accepted.report)}`);
  }
  console.log(JSON.stringify({
    verdict: 'TEST_PASS',
    rejectedComposite: rejectedJob.targetLineage.errors,
    acceptedIndependent: acceptedJob.targetLineage.verdict,
  }, null, 2));
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}
