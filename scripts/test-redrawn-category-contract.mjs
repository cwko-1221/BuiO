/**
 * Contract audit for fixed-coordinate redrawn wearable categories.
 * It creates reports only. With --run-head-regression it re-runs only the
 * already-approved head-05/head-06 batch regression; it never creates a target.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const runHeadRegression = process.argv.includes('--run-head-regression');
const outputIndex = process.argv.indexOf('--output');
const outputDirectory = path.resolve(outputIndex >= 0 && process.argv[outputIndex + 1]
  ? process.argv[outputIndex + 1] : 'artifacts/redrawn-category-contract-tests');
await fs.mkdir(outputDirectory, { recursive: true });
const readJson = async (input) => JSON.parse(await fs.readFile(input, 'utf8'));
const readText = (input) => fs.readFile(input, 'utf8');
const paths = {
  contract: 'scripts/redrawn-category-contract.json',
  runner: 'scripts/run-redrawn-wearable-batch.mjs',
  solver: 'scripts/solve-redrawn-source-over-layer.mjs',
  layeredSolver: 'scripts/solve-redrawn-straddled-layers.mjs',
  frontEraseQa: 'scripts/qa-redrawn-front-erase.mjs',
  faceQa: 'scripts/qa-face-wearable-apertures.mjs',
  layerManifestAudit: 'scripts/audit-redrawn-layer-manifest.mjs',
  sourceAudit: 'scripts/audit-direction-batch-sources.mjs',
  sourceTemplates: 'scripts/create-direction-source-templates.mjs',
  runtime: 'pet-app/src/game/PetAvatar.ts',
  preview: 'pet-app/src/main.ts',
  face: 'pet-app/art-source/imagegen/baked-wearables/starpatch-cat-1/masked-face-01-proof/independent-acceptance-spec/face-01-independent-acceptance-spec.json',
  neck: 'scripts/redrawn-category-specs/neck-10-back-empty.json',
  back: 'scripts/redrawn-category-specs/back-02-straddled.template.json',
  aura: 'scripts/redrawn-category-specs/aura-straddled.template.json',
  regression: 'scripts/redrawn-category-specs/batch-set-head05-head06-regression.json',
};
const [contract, face, neck, back, aura, regression, runner, solver, layeredSolver, frontEraseQa, faceQa, layerManifestAudit, sourceAudit, sourceTemplates, runtime, preview] = await Promise.all([
  readJson(paths.contract), readJson(paths.face), readJson(paths.neck), readJson(paths.back), readJson(paths.aura), readJson(paths.regression),
  readText(paths.runner), readText(paths.solver), readText(paths.layeredSolver), readText(paths.frontEraseQa), readText(paths.faceQa), readText(paths.layerManifestAudit), readText(paths.sourceAudit), readText(paths.sourceTemplates), readText(paths.runtime), readText(paths.preview),
]);

const sourceOver = (background, foreground) => {
  const ba = background[3] / 255; const fa = foreground[3] / 255; const oa = fa + ba * (1 - fa);
  if (oa <= 0) return [...background];
  return [
    Math.round((foreground[0] * fa + background[0] * ba * (1 - fa)) / oa),
    Math.round((foreground[1] * fa + background[1] * ba * (1 - fa)) / oa),
    Math.round((foreground[2] * fa + background[2] * ba * (1 - fa)) / oa),
    Math.round(oa * 255),
  ];
};
const compose = ({ rear, base, erase, patch, frontErase, front }) => {
  let result = rear[3] === 0 ? [...base] : sourceOver(rear, base);
  if (erase[3] > 0) result = [0, 0, 0, 0];
  result = sourceOver(result, patch);
  if (frontErase[3] > 0) result = [0, 0, 0, 0];
  return sourceOver(result, front);
};
const transparent = [0, 0, 0, 0];
const layeredActual = compose({
  rear: [0, 0, 255, 255], base: [255, 0, 0, 128], erase: transparent,
  patch: transparent, frontErase: transparent, front: transparent,
});
const eraseActual = compose({
  rear: transparent, base: [255, 0, 0, 255], erase: [255, 255, 255, 255],
  patch: [0, 255, 0, 128], frontErase: transparent, front: transparent,
});
const lateEraseActual = compose({
  rear: transparent, base: [255, 0, 0, 255], erase: transparent,
  patch: [0, 255, 0, 255], frontErase: [255, 255, 255, 255], front: [0, 0, 255, 255],
});

const checks = [];
const check = (name, pass, details = undefined) => checks.push({ name, verdict: pass ? 'PASS' : 'REJECT', ...(details === undefined ? {} : { details }) });
check('contract covers exactly head/face/neck/back/aura', JSON.stringify(Object.keys(contract.categories).sort()) === JSON.stringify(['aura', 'back', 'face', 'head', 'neck']));
check('contract fixes the 800x640 5x4 atlas without transforms', contract.geometry.width === 800 && contract.geometry.height === 640 && contract.geometry.columns === 5 && contract.geometry.rows === 4 && contract.geometry.transformAllowed === false);
check('runtime layer order contract is explicit', JSON.stringify(contract.runtimeOrder) === JSON.stringify(['rear', 'base', 'union erase', 'patch', 'union frontErase', 'front']));
check('rear is below semi-transparent base', JSON.stringify(layeredActual) === JSON.stringify([128, 0, 127, 255]), { actual: layeredActual });
check('union erase occurs before patch', JSON.stringify(eraseActual) === JSON.stringify([0, 255, 0, 128]), { actual: eraseActual });
check('frontErase occurs after patch and before front', JSON.stringify(lateEraseActual) === JSON.stringify([0, 0, 255, 255]), { actual: lateEraseActual });
check('single solver preserves hidden base RGBA outside coverage', solver.includes('Preserve those bytes outside erase/layer'));
check('runner routes both back and aura to the layered solver', runner.includes("['back', 'aura'].includes(category)") && runner.includes('solve-redrawn-straddled-layers.mjs'));
check('layered solver accepts only back/aura categories', layeredSolver.includes("['back', 'aura'].includes(spec.category)"));
check('layered solver enforces declared semantic layers', layeredSolver.includes('allowedSemanticLayers.has(region.layer)'));
check('batch frontErase has explicit input, output and independent QA gate', runner.includes("options.get('front-erase')")
  && runner.includes('qa-redrawn-front-erase.mjs') && runner.includes('frontEraseQa')
  && solver.includes('frontErasePath') && solver.includes('solvedFrontErasePath')
  && layeredSolver.includes('frontErasePath') && layeredSolver.includes('frontErasePath: path.join')
  && frontEraseQa.includes('derivedFromComposite: false') && frontEraseQa.includes('decodedMismatchPixels'));
check('batch lineage forbids composite-to-target circularity', runner.includes('targetImmutable') && runner.includes('targetPredatesMask') && !runner.includes('copyFile(solveReport.outputs.compositePath, targetPath)'));
check('layer manifest audit is exact and fail-closed', layerManifestAudit.includes("JSON.stringify(manifest.layerOrder) !== JSON.stringify(ORDER)")
  && layerManifestAudit.includes('nonBinaryMaskAlphaPixels')
  && layerManifestAudit.includes('undeclaredHoleCells')
  && layerManifestAudit.includes('exactRgbaMismatchPixels')
  && layerManifestAudit.includes('compositeUsedAsTarget: false')
  && layerManifestAudit.includes('readMaskRgba')
  && layerManifestAudit.includes('target may not be a composite/recompose output')
  && layerManifestAudit.includes('protectedRoiViolations')
  && layerManifestAudit.includes('maskPolicy'));
check('batch runner makes layer-manifest audit a publish gate', runner.includes('buildLayerManifest')
  && runner.includes('audit-redrawn-layer-manifest.mjs')
  && runner.includes('layerManifestAudit.publishable === true')
  && runner.includes('pipelinePass && missing.length === 0'));
check('direction source audit is fail-closed and transform-free', sourceAudit.includes('PASS_SOURCE_SHAPE')
  && sourceAudit.includes('REJECT_PREMASK')
  && sourceAudit.includes('transform.${key} must be false at source ingress')
  && sourceAudit.includes('resizes, converts, packs, or repairs'));
check('direction ingress audits every expected full redraw before masking', sourceAudit.includes('auditTargetLineage')
  && sourceAudit.includes('expectedFullRedraw')
  && sourceAudit.includes('targetLineage')
  && sourceAudit.includes('--lineage-roots'));
check('direction source templates preserve frozen coordinates', sourceTemplates.includes('TEMPLATES_CREATED')
  && sourceTemplates.includes('800x160') && sourceTemplates.includes('transformed: false')
  && sourceTemplates.includes('baseSha256'));

const faceBack = face.cells.filter((cell) => cell.row === 2);
check('face declares exactly 25 legal lens apertures', face.globalRules.expectedTotalTrueLensApertures === 25 && face.cells.reduce((sum, cell) => sum + cell.trueApertures, 0) === 25);
check('face back row is five completely empty cells', faceBack.length === 5 && faceBack.every((cell) => cell.mustBeEmpty && cell.trueApertures === 0));
check('face QA rejects undeclared holes and validates eye evidence', faceQa.includes('topology.holes.length === declaration.trueApertures') && faceQa.includes('eyeFeatureInsideAperture'));

const neckEmpty = neck.topology.emptyCells.filter((cell) => cell.row === 2).map((cell) => cell.column).sort((a, b) => a - b);
check('neck back row is five completely empty cells', JSON.stringify(neckEmpty) === JSON.stringify([0, 1, 2, 3, 4]));
check('back declares rear/base/erase/patch/front semantics', back.category === 'back' && back.layering.mode === 'rear-base-erase-patch-front'
  && ['rear', 'patch', 'front'].every((layer) => back.layering.topology.layers[layer]));
check('aura is rear/front only with patch and erase forbidden', aura.category === 'aura' && aura.layering.mode === 'rear-base-erase-patch-front'
  && JSON.stringify(aura.layering.allowedSemanticLayers) === JSON.stringify(['rear', 'front'])
  && aura.layering.topology.layers.patch.defaultMaximumComponents === 0 && aura.solve.maximumErasePixels === 0);
check('aura publish plan omits the transparent patch artifact', runner.includes("category === 'aura' ? '-'"));
check('head regression input set is exactly head-05/head-06', JSON.stringify(regression.items.map((item) => item.id).sort()) === JSON.stringify(['head-05-v3', 'head-06-v9']));

const runtimeRear = runtime.indexOf("redrawnAtlasKey(definition, stage, id, 'rear')");
const runtimeBase = runtime.indexOf('context.drawImage(source(baseKey)');
const runtimeErase = runtime.indexOf("redrawnAtlasKey(definition, stage, id, 'erase')");
const runtimePatch = runtime.indexOf("redrawnAtlasKey(definition, stage, id, 'patch')");
const runtimeFrontErase = runtime.indexOf("redrawnAtlasKey(definition, stage, id, 'frontErase')");
const runtimeFront = runtime.indexOf("redrawnAtlasKey(definition, stage, id, 'front')");
check('runtime implementation order matches the contract', runtimeRear >= 0 && runtimeRear < runtimeBase && runtimeBase < runtimeErase
  && runtimeErase < runtimePatch && runtimePatch < runtimeFrontErase && runtimeFrontErase < runtimeFront);
check('wardrobe preview uses the same mask-capable canvas compositor', preview.includes('figure-preview-canvas')
  && preview.includes("globalCompositeOperation=mode")
  && preview.includes("drawPass(1,'destination-out')")
  && preview.includes("drawPass(3,'destination-out')")
  && preview.includes('frontErase'));

const knownGaps = [
  {
    id: 'runtime-aura-modular-layers',
    open: runtime.includes("if (id.startsWith('aura-')) continue") && runtime.includes("filter((id) => !id.startsWith('aura-'))"),
    evidence: 'PetAvatar skips aura preload and removes aura IDs from modular composition.',
    minimalFix: 'Allow registered aura entries through preload/compose; keep only unregistered auras on the legacy placement path. Preserve the same rear/base/.../front ordering.',
  },
  {
    id: 'wardrobe-preview-erase-frontErase',
    open: !(preview.includes('figure-preview-canvas')
      && preview.includes("drawPass(1,'destination-out')")
      && preview.includes("drawPass(3,'destination-out')")),
    evidence: 'previewFigure must use a canvas compositor with the same erase/frontErase destination-out passes as PetAvatar.',
    minimalFix: 'Build/cache the preview frame from the same composed atlas canvas used by PetAvatar; CSS stacking alone cannot reproduce erase/frontErase.',
  },
  {
    id: 'batch-frontErase-authoring',
    open: runner.includes("(publishConfig.occludes ?? []).join(',') || '-', '-'") && !solver.includes('frontErase'),
    evidence: 'Batch publish args hard-code frontErase to "-" and the solver has no independent frontErase output.',
    minimalFix: 'Add an explicit, separately sourced frontErase input/QA stage; never infer it from the composite. Keep it optional for categories that do not require late anatomical masking.',
  },
];

let headRegression = { requested: runHeadRegression, verdict: 'NOT_RUN', command: null, summaryPath: null, items: [] };
if (runHeadRegression) {
  const command = [process.execPath, 'scripts/run-redrawn-wearable-batch-set.mjs', '--config', paths.regression, '--dry-run'];
  const run = spawnSync(command[0], command.slice(1), { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const summaryPath = path.resolve('artifacts/redrawn-wearable-batch-set-regression/batch-set-summary.json');
  let summary = null; try { summary = await readJson(summaryPath); } catch { /* surfaced below */ }
  headRegression = {
    requested: true, verdict: run.status === 0 && summary?.verdict === 'DATA_PASS' ? 'PASS' : 'REJECT',
    command, exitCode: run.status, summaryPath, items: summary?.items?.map((item) => ({ id: item.id, verdict: item.verdict, publishExecuted: item.publish?.executed })) ?? [],
    stderr: run.stderr?.trim() || null,
  };
  check('head-05/head-06 approved regression remains DATA_PASS', headRegression.verdict === 'PASS', headRegression);
  check('head regression never publishes', headRegression.items.every((item) => item.publishExecuted === false), headRegression.items);
}

const testPass = checks.every((entry) => entry.verdict === 'PASS');
const openGaps = knownGaps.filter((gap) => gap.open);
const report = {
  verdict: testPass ? 'TEST_PASS' : 'TEST_REJECT',
  implementationVerdict: testPass && openGaps.length === 0 ? 'FULL_CATEGORY_SUPPORT' : 'PARTIAL_SUPPORT_WITH_GAPS',
  noTargetGenerated: true, compositeUsedAsTarget: false, manifestOrRuntimeModified: false,
  contractPath: path.resolve(paths.contract), checks, headRegression, knownGaps, openGapCount: openGaps.length,
};
const reportPath = path.join(outputDirectory, 'category-contract-test-report.json');
const markdownPath = path.join(outputDirectory, 'category-contract-test-report.md');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await fs.writeFile(markdownPath, [
  '# Redrawn category contract test', '', `- Test verdict: **${report.verdict}**`,
  `- Implementation: **${report.implementationVerdict}**`, `- Head regression: ${headRegression.verdict}`,
  '- New target generated: no', '- Manifest/runtime modified: no', '',
  '## Checks', '', ...checks.map((entry) => `- ${entry.verdict}: ${entry.name}`), '',
  '## Open gaps', '', ...openGaps.map((gap) => `- ${gap.id}: ${gap.evidence} Minimal fix: ${gap.minimalFix}`), '',
].join('\n'), 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, implementationVerdict: report.implementationVerdict, reportPath, markdownPath, headRegression: headRegression.verdict, openGaps: openGaps.map((gap) => gap.id) }, null, 2));
if (!testPass) process.exitCode = 2;
