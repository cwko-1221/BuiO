/**
 * Bounded, read-only candidate selector for the redrawn-wearable queue.
 *
 * This is a triage report, not an acceptance gate. It deliberately refuses to
 * treat a body-locked target as a replacement for the authoritative full
 * redraw. A candidate must still go through mask extraction, exact source-over
 * recomposition, and an independent critic before it can be published.
 *
 * Usage:
 *   node scripts/select-redrawn-wearable-candidates.mjs \
 *     [queue.json] [report.json] [--pet=starpatch-cat] [--limit=20]
 */
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';

const argv = process.argv.slice(2);
const positional = argv.filter((argument) => !argument.startsWith('--'));
const queuePath = positional[0] || 'pet-app/art-source/imagegen/redrawn-wearable-production-queue.json';
const reportPath = positional[1] || null;
const option = (name, fallback) => {
  const prefix = `--${name}=`;
  const value = argv.find((argument) => argument.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
};
const petFilter = option('pet', null);
const limit = Math.max(1, Math.min(100, Number.parseInt(option('limit', '20'), 10) || 20));
const pixelThreshold = Math.max(0, Math.min(255, Number.parseInt(option('threshold', '8'), 10) || 8));

const ROOT = process.cwd();
const resolveInput = (value, base = ROOT) => path.isAbsolute(value) ? value : path.resolve(base, value);
const queueAbsolutePath = resolveInput(queuePath);
const readJson = async (filePath) => JSON.parse(await fs.readFile(filePath, 'utf8'));
const imageExtensions = new Set(['.png', '.webp', '.jpg', '.jpeg']);

const safeReadDir = async (directory) => {
  try { return await fs.readdir(directory, { withFileTypes: true }); } catch { return []; }
};

// The source tree contains many crops and historical attempts. The cap is
// intentional: triage should be cheap and deterministic, never an unbounded
// recursive crawl of generated assets.
const collectEvidenceFiles = async (directory, itemId, maxDepth = 4, maxEntries = 900) => {
  const files = [];
  const queue = [{ directory, depth: 0 }];
  let visitedEntries = 0;
  while (queue.length && visitedEntries < maxEntries) {
    const current = queue.shift();
    const entries = await safeReadDir(current.directory);
    entries.sort((left, right) => left.name.localeCompare(right.name));
    // Proof folders are named after the item (for example
    // masked-head-06-proof). Visit those first so a large sibling history
    // cannot starve the bounded scan of the current item's independent QA.
    const itemLower = itemId.toLowerCase();
    entries.sort((left, right) => {
      const leftPriority = left.isDirectory() && left.name.toLowerCase().includes(itemLower) ? -1 : 0;
      const rightPriority = right.isDirectory() && right.name.toLowerCase().includes(itemLower) ? -1 : 0;
      return leftPriority - rightPriority || left.name.localeCompare(right.name);
    });
    for (const entry of entries) {
      if (visitedEntries++ >= maxEntries) break;
      const absolute = path.join(current.directory, entry.name);
      if (entry.isDirectory()) {
        if (current.depth < maxDepth) {
          const currentIsItemTree = current.directory.toLowerCase().includes(itemLower);
          const entryIsItemTree = entry.name.toLowerCase().includes(itemLower);
          // Once inside an item proof tree, finish that subtree before moving
          // to sibling historical attempts. This keeps the bounded scan useful
          // even when the source folder has thousands of old crops.
          if (currentIsItemTree || entryIsItemTree) queue.unshift({ directory: absolute, depth: current.depth + 1 });
          else queue.push({ directory: absolute, depth: current.depth + 1 });
        }
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') continue;
      const normalized = absolute.toLowerCase();
      if (normalized.includes(itemId.toLowerCase())) files.push(absolute);
    }
  }
  return files;
};

const collectTargetCandidates = async (sourceFolder, expectedPath, itemId) => {
  const output = [];
  const seen = new Set();
  const add = (candidate) => {
    const key = path.normalize(candidate).toLowerCase();
    if (!seen.has(key) && output.length < 12) { seen.add(key); output.push(candidate); }
  };
  add(expectedPath);
  // Include only same-coordinate atlas-looking files. Crops, guides and raw
  // ImageGen canvases are intentionally excluded from the triage set.
  for (const entry of await safeReadDir(sourceFolder)) {
    if (!entry.isFile() || !imageExtensions.has(path.extname(entry.name).toLowerCase())) continue;
    const lower = entry.name.toLowerCase();
    if (!lower.includes(itemId.toLowerCase()) || !lower.includes('dressed-atlas')) continue;
    if (lower.includes('raw') || lower.includes('checker') || lower.includes('crop')) continue;
    add(path.join(sourceFolder, entry.name));
  }
  return output;
};

const asString = (value) => typeof value === 'string' ? value.toUpperCase() : '';
const sha256 = async (filePath) => crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex').toLowerCase();

const inspectEvidence = async (files, candidatePath) => {
  const evidence = [];
  let independentPass = false;
  let independentReject = false;
  let bodyLockedEvidence = false;
  const candidateName = path.basename(candidatePath).toLowerCase();
  const candidateHash = await sha256(candidatePath).catch(() => null);
  for (const filePath of files) {
    let parsed;
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 2_000_000) continue;
      parsed = await readJson(filePath);
    } catch { continue; }
    const text = JSON.stringify(parsed).toLowerCase();
    const fileText = filePath.toLowerCase();
    const looksLikeQa = /qa|audit|critic|lineage|source/.test(fileText);
    // This records a warning about historical body-lock work, but does not
    // taint the authoritative full-redraw candidate. Only a candidate path
    // containing a locked-target marker is classified as diagnostic below.
    const isBodyLockedEvidence = /body[-_ ]?locked|author[-_ ]?locked|locked[-_ ]?target|production[-_ ]?lock|never_publish|diagnostic_only/.test(`${fileText} ${text}`);
    const independent = parsed && typeof parsed === 'object'
      && (parsed.independentPass === true || parsed.auditMode === 'independent-read-only'
        || text.includes('independent critic') || text.includes('independent-final')
        || fileText.includes('independent-final') || fileText.includes('independent-qa'));
    const verdicts = [
      parsed?.verdict, parsed?.independentVerdict, parsed?.technicalVerdict,
      parsed?.strictVerdict, parsed?.finalVerdict, parsed?.producerVerdict,
    ].map(asString);
    const pass = independent && looksLikeQa && verdicts.includes('PASS');
    const reject = independent && looksLikeQa && (verdicts.includes('REJECT') || parsed.independentPass === false);
    const reportHashMatches = candidateHash && text.includes(candidateHash);
    // Historical proof folders contain many PASS/REJECT reports for earlier
    // targets. A verdict is evidence for this candidate only when the report
    // names its exact file or embeds its SHA-256; item-level folder names are
    // intentionally not enough.
    const targetMatch = text.includes(candidateName) || reportHashMatches;
    if (isBodyLockedEvidence) bodyLockedEvidence = true;
    if (pass && targetMatch) independentPass = true;
    if (reject && targetMatch) independentReject = true;
    if (isBodyLockedEvidence || pass || reject) {
      evidence.push({
        path: path.relative(ROOT, filePath),
        bodyLockedEvidence: isBodyLockedEvidence,
        targetMatch,
        independentPass: pass && targetMatch,
        independentReject: reject && targetMatch,
      });
    }
  }
  return { evidence, independentPass, independentReject, bodyLockedEvidence };
};

const imageCache = new Map();
const readImage = async (filePath) => {
  const key = path.normalize(filePath).toLowerCase();
  if (!imageCache.has(key)) {
    imageCache.set(key, sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  return imageCache.get(key);
};

const measureAgainstBase = async (targetPath, basePath) => {
  let target;
  let base;
  try {
    [target, base] = await Promise.all([readImage(targetPath), readImage(basePath)]);
  } catch (error) {
    return { readable: false, reason: error instanceof Error ? error.message : String(error) };
  }
  if (target.info.width !== 800 || target.info.height !== 640) {
    return { readable: true, dimensions: [target.info.width, target.info.height], validCanvas: false };
  }
  if (base.info.width !== 800 || base.info.height !== 640) {
    return { readable: true, dimensions: [target.info.width, target.info.height], validCanvas: false, reason: 'base is not 800x640' };
  }
  let exactChanged = 0;
  let thresholdChanged = 0;
  let alphaChanged = 0;
  const cellChanged = Array.from({ length: 20 }, () => 0);
  for (let pixel = 0; pixel < target.data.length; pixel += 4) {
    let maxDelta = 0;
    for (let channel = 0; channel < 4; channel += 1) {
      maxDelta = Math.max(maxDelta, Math.abs(target.data[pixel + channel] - base.data[pixel + channel]));
    }
    if (maxDelta > 0) {
      exactChanged += 1;
      const index = Math.floor(pixel / 4);
      cellChanged[Math.floor(index / (160 * 800)) * 5 + Math.floor((index % 800) / 160)] += 1;
    }
    if (maxDelta > pixelThreshold) thresholdChanged += 1;
    if (target.data[pixel + 3] !== base.data[pixel + 3]) alphaChanged += 1;
  }
  return {
    readable: true,
    dimensions: [800, 640],
    validCanvas: true,
    exactChangedPixels: exactChanged,
    thresholdChangedPixels: thresholdChanged,
    thresholdChangedRate: Number((thresholdChanged / (800 * 640)).toFixed(6)),
    alphaChangedPixels: alphaChanged,
    changedPixelsPerCell: cellChanged,
    note: 'Whole-atlas delta is only a triage lower bound; it is not outside-mask proof.',
  };
};

const queue = await readJson(queueAbsolutePath);
const jobs = Array.isArray(queue.jobs) ? queue.jobs : [];
const filteredJobs = jobs.filter((job) => !petFilter || job.petId === petFilter);
const rows = [];
for (const job of filteredJobs) {
  const expectedPath = resolveInput(job.expectedFullRedraw);
  const basePath = resolveInput(job.baseAtlas);
  const sourceFolder = resolveInput(job.sourceFolder);
  const candidates = await collectTargetCandidates(sourceFolder, expectedPath, job.wearableId);
  const evidenceFiles = await collectEvidenceFiles(sourceFolder, job.wearableId);
  for (const candidatePath of candidates) {
    const relativeCandidate = path.relative(ROOT, candidatePath);
    const exists = await fs.access(candidatePath).then(() => true).catch(() => false);
    if (!exists) continue;
    const evidence = await inspectEvidence(evidenceFiles, candidatePath);
    const measurement = await measureAgainstBase(candidatePath, basePath);
    const pathDiagnostic = /body[-_ ]?locked|author[-_ ]?locked|locked[-_ ]?target|production[-_ ]?lock|never_publish|diagnostic_only/i.test(candidatePath);
    const diagnosticOnly = pathDiagnostic;
    const evidenceReject = evidence.independentReject;
    const recommendation = diagnosticOnly
      ? 'NEVER_PUBLISH_DIAGNOSTIC_BODY_LOCK'
      : !measurement.readable || !measurement.validCanvas
        ? 'REJECT_INVALID_CANVAS'
        : evidenceReject
          ? 'REJECT_INDEPENDENT_EVIDENCE'
          : 'RUN_MASK_AND_SOURCE_OVER_PRECHECK';
    const priority = (recommendation === 'RUN_MASK_AND_SOURCE_OVER_PRECHECK' ? 2_000_000 : 0)
      + (evidence.independentPass ? 100_000 : 0)
      - (diagnosticOnly ? 1_000_000 : 0)
      - (evidenceReject ? 500_000 : 0)
      - (measurement.thresholdChangedPixels || Number.MAX_SAFE_INTEGER);
    rows.push({
      key: job.key,
      petId: job.petId,
      stage: job.stage,
      wearableId: job.wearableId,
      slot: job.slot,
      queueStatus: job.status,
      candidate: relativeCandidate,
      expectedFullRedraw: path.relative(ROOT, expectedPath),
      diagnosticOnly,
      evidence: {
        independentPassFound: evidence.independentPass,
        independentRejectFound: evidenceReject,
        bodyLockedEvidenceFound: evidence.bodyLockedEvidence,
        relevantReports: evidence.evidence,
      },
      measurement,
      recommendation,
      priority,
    });
  }
}

rows.sort((left, right) => right.priority - left.priority || left.key.localeCompare(right.key) || left.candidate.localeCompare(right.candidate));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  inputs: {
    queuePath: path.relative(ROOT, queueAbsolutePath),
    petFilter,
    limit,
    pixelThreshold,
    readOnly: true,
  },
  policy: {
    purpose: 'bounded triage only; no mask, composite, critic or manifest mutation',
    bodyLockedTargets: 'diagnostic only; never substitute for the original full redraw and never publish',
    wholeAtlasDelta: 'priority hint only; it cannot certify body preservation because the wearable mask is not yet known',
    nextGate: 'run preflight-redrawn-wearable, then exact mask-only audit and independent critic',
  },
  totals: {
    queueJobs: jobs.length,
    filteredJobs: filteredJobs.length,
    candidatesFound: rows.length,
    readyForMaskPrecheck: rows.filter((row) => row.recommendation === 'RUN_MASK_AND_SOURCE_OVER_PRECHECK').length,
    diagnosticOnly: rows.filter((row) => row.diagnosticOnly).length,
    rejectedByEvidence: rows.filter((row) => row.recommendation === 'REJECT_INDEPENDENT_EVIDENCE').length,
  },
  priority: rows.slice(0, limit),
  allCandidates: rows,
};
const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (reportPath) {
  const absoluteReportPath = resolveInput(reportPath);
  await fs.mkdir(path.dirname(absoluteReportPath), { recursive: true });
  await fs.writeFile(absoluteReportPath, serialized);
}
process.stdout.write(serialized);
