/**
 * Shared, read-only lineage audit for a frozen full-redraw target.
 *
 * This module deliberately does not repair, resize, or otherwise transform
 * the target. A target whose bytes match a prior composite/recompose output
 * is rejected before any masking work starts.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sha256 = async (input) => crypto.createHash('sha256').update(await fs.readFile(input)).digest('hex');
const relative = (input, cwd = process.cwd()) => path.relative(cwd, input).replaceAll('\\', '/');

const walkCompositeOutputs = async (root) => {
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

const readLineage = async (lineageInput) => fs.readFile(lineageInput, 'utf8').then(JSON.parse).catch(() => null);

/**
 * @param {{targetInput:string, rootsInput:string|string[], lineageInput?:string|null, candidateCache?:Map<string,string[]|Promise<string[]>>, candidateHashCache?:Map<string,string|null|Promise<string|null>>}} options
 */
export const auditTargetLineage = async ({ targetInput, rootsInput, lineageInput = null, candidateCache = null, candidateHashCache = null }) => {
  const targetPath = path.resolve(targetInput);
  const roots = (Array.isArray(rootsInput) ? rootsInput : String(rootsInput ?? '').split(','))
    .map((value) => path.resolve(String(value).trim())).filter(Boolean);
  const errors = [];
  const warnings = [];
  const targetStat = await fs.stat(targetPath).catch((error) => {
    errors.push(`target cannot be read: ${error.message}`);
    return null;
  });
  const targetHash = targetStat ? await sha256(targetPath).catch((error) => {
    errors.push(`target cannot be hashed: ${error.message}`);
    return null;
  }) : null;
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

  const cacheKey = roots.map((root) => path.normalize(root).toLowerCase()).sort().join('|');
  let candidatePaths;
  if (candidateCache?.has(cacheKey)) candidatePaths = await candidateCache.get(cacheKey);
  else {
    const scan = Promise.all(roots.map(walkCompositeOutputs)).then((lists) => [...new Set(lists.flat())]);
    if (candidateCache) candidateCache.set(cacheKey, scan);
    candidatePaths = await scan;
    if (candidateCache) candidateCache.set(cacheKey, candidatePaths);
  }
  const candidates = candidatePaths.filter((input) => path.resolve(input) !== targetPath);
  const matches = [];
  if (targetHash) {
    for (const candidate of candidates) {
      const normalizedCandidate = path.normalize(candidate).toLowerCase();
      let candidateHash;
      if (candidateHashCache?.has(normalizedCandidate)) candidateHash = await candidateHashCache.get(normalizedCandidate);
      else {
        const hash = sha256(candidate).catch(() => null);
        if (candidateHashCache) candidateHashCache.set(normalizedCandidate, hash);
        candidateHash = await hash;
        if (candidateHashCache) candidateHashCache.set(normalizedCandidate, candidateHash);
      }
      if (candidateHash && candidateHash === targetHash) matches.push({ path: relative(candidate), sha256: candidateHash });
    }
  }
  if (matches.length > 0) errors.push(`target bytes match ${matches.length} earlier composite/recompose output(s)`);

  let lineage = null;
  if (lineageInput) {
    const lineagePath = path.resolve(lineageInput);
    lineage = await readLineage(lineagePath);
    if (!lineage) errors.push('lineage cannot be read');
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
  return {
    schemaVersion: 1,
    verdict: errors.length === 0 ? 'PASS' : 'REJECT',
    target: { path: relative(targetPath), sha256: targetHash, metadata: targetMetadata },
    scan: { roots: roots.map((root) => relative(root)), candidateCount: candidates.length, compositeHashMatches: matches },
    lineage: lineageInput ? { path: relative(path.resolve(lineageInput)), supplied: Boolean(lineage) } : null,
    errors,
    warnings,
    policy: {
      targetMustBeIndependent: true,
      compositeHashMatchRejects: true,
      noPixelRepairOrTransformPerformed: true,
    },
  };
};
