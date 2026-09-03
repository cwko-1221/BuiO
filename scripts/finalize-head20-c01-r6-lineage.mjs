/** Freeze r6 provenance after every image/audit hash has been produced. */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const out = path.resolve(process.argv[2] ?? 'artifacts/head20-attempt6-per-cell/c01/v2/revision-6');
const hashFile = async (p) => crypto.createHash('sha256').update(await fs.readFile(p)).digest('hex');
const p = (name) => path.join(out, name);
const lineagePath = p('r6-lineage.json'); const lineage = JSON.parse(await fs.readFile(lineagePath, 'utf8'));
const rawPath = p('r6-raw-full-dressed-imagegen-source.png');
const targetPath = p('r6-target-coordinate-locked-160x160.png'); const layerPath = p('r6-helmet-layer-same-coordinate-160x160.png'); const maskPath = p('r6-helmet-mask-same-coordinate-160x160.png');
const extensionPath = p('r6-left-earcup-extension-allowed-mask.png'); const evidencePath = p('r6-left-earcup-amendment-evidence.json'); const auditPath = p('r6-mechanical-audit.json');
const rawSha = await hashFile(rawPath);
lineage.generation = {
  model: 'built-in image_gen', timestamp: '2026-08-26T02:55:02.241Z',
  prompt: 'Use case: precise-object-edit. Fresh full-body front-facing redraw of the original orange-and-cream starpatch cat wearing wearable-head-3 bottom-row right blue-and-white galaxy space helmet; rounded symmetric blue-and-gold ear cups, continuous rounded outer helmet silhouette, deep navy galaxy visor with both cat eyes, both natural ears fully hidden, collar ending at neck above chest, no rectangular blue panels or blocks, transparent background.',
  lineage: 'r6 re-extracts only the independently generated r4 raw full-dressed source; it does not read r4/r5 targets, masks, layers, or composites.',
};
lineage.rawFullRedrawSource.sha256 = rawSha;
lineage.normalization.sourceSha256 = rawSha;
lineage.normalization.steps = 'r4 independent raw full-dressed source only -> connected RGB checker flood -> expanded crop [260,167,764,630] with 41px transparent left margin -> 129x122 Lanczos3 map at x=20,y=5 preserving visor/collar anchor -> source-alpha-derived closed silhouette -> base byte lock outside original c01 semantic union';
lineage.normalization.rawHelmetCrop = [260,167,764,630];
lineage.normalization.mappedPlacement = [20,5,149,127];
lineage.forbiddenInputProof = { notOldTarget:true, notComposite:true, notMask:true, usedRevision1:false, usedRevision2:false, usedWholeAtlasV2:false, usedAttempt5:false, r3bTargetLayerMaskComposite:'NOT_READ', r4TargetLayerMaskComposite:'NOT_READ', r5TargetLayerMaskComposite:'NOT_READ', permittedRawOnly:rawPath };
lineage.semanticMask.allowedZones = [[38,5,137,127],[31,28,38,101]];
lineage.semanticMask.diagnosticOnlyExtension = { evidencePath, evidenceSha256:await hashFile(evidencePath), pixelMaskPath:extensionPath, pixelMaskSha256:await hashFile(extensionPath), consumedByActualSupport:false };
lineage.sourceToCandidateMapping = { method:'r4 raw-only expanded-crop source mapping; no transform after extraction; coordinate target locks original base outside actual mask', basePath:lineage.sourceToCandidateMapping.basePath, baseSha256:lineage.sourceToCandidateMapping.baseSha256, targetPath, targetSha256:await hashFile(targetPath), rawOnlyInput:rawPath, rawOnlyInputSha256:rawSha };
lineage.mechanicalAudit = { path:auditPath, sha256:await hashFile(auditPath), verdict:'PASS_MECHANICAL_PENDING_VISUAL_CRITIC' };
lineage.frozenArtifactHashes = { rawFullDressed:rawSha, target:await hashFile(targetPath), layer:await hashFile(layerPath), mask:await hashFile(maskPath), diagnosticExtension:await hashFile(extensionPath), mechanicalAudit:await hashFile(auditPath) };
lineage.frozen = true; lineage.frozenAt = new Date().toISOString(); lineage.gates.critic = 'PENDING_INDEPENDENT_VISUAL_REVIEW'; lineage.gates.publishable = false;
await fs.writeFile(lineagePath, `${JSON.stringify(lineage,null,2)}\n`);
console.log(JSON.stringify({ lineagePath, frozen:lineage.frozen, hashes:lineage.frozenArtifactHashes },null,2));
