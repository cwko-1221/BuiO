#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { experiments, experimentById, getNextExperiment } from '../science-lab-app/public/js/data/experiments.js';
import { LabSimulation } from '../science-lab-app/public/js/simulation/LabSimulation.js';
import { runRespiratoryInterpenetrationCheck } from './check-respiratory-interpenetration.mjs';

const root = path.resolve('.');
const sourceRoot = path.join(root, 'science-lab-app', 'public');
const distRoot = path.join(root, 'science-lab-app', 'dist');

function readGlbJson(buffer, label) {
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF', `${label}: valid GLB header`);
  assert.equal(buffer.readUInt32LE(4), 2, `${label}: glTF 2 container`);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      const text = buffer.subarray(offset + 8, offset + 8 + length).toString('utf8').replace(/\0+$/u, '');
      return JSON.parse(text);
    }
    offset += 8 + length;
  }
  assert.fail(`${label}: GLB has no JSON chunk`);
}

const sha256 = (contents) => createHash('sha256').update(contents).digest('hex');

assert.deepEqual(
  experiments.map((item) => item.id),
  ['density-column', 'water-filter', 'electric-crane', 'light-reflection', 'heat-conduction', 'force-coaster', 'air-expansion', 'respiratory-system'],
  'the focused release exposes exactly the eight selected investigations in order',
);
assert.deepEqual(experiments.map((item) => item.number), [1, 2, 3, 4, 5, 6, 7, 8], 'visible experiment numbers are contiguous');
for (const removedId of ['lab-safety', 'transmission', 'root-viewer', 'food-web', 'eco-house', 'light-lab', 'sound-vacuum', 'earth-moon-sun']) {
  assert.equal(experimentById.has(removedId), false, `${removedId}: removed investigation has no route entry`);
}
assert.equal(getNextExperiment('respiratory-system')?.id, 'density-column', 'next-station flow wraps from the last station to the first');
assert.equal(getNextExperiment('sound-vacuum'), null, 'unknown legacy route cannot silently enter another experiment');
assert.equal(new Set(experiments.map((item) => item.id)).size, experiments.length, 'experiment ids are unique');
assert.deepEqual(
  new Set(experiments.map((item) => item.topic)),
  new Set(['環境', '物質', '能量', '力與運動', '人體']),
  'all retained science areas are represented',
);

const respiratoryExperiment = experimentById.get('respiratory-system');
const respiratoryAdjustments = respiratoryExperiment.steps.filter((step) => step.action.type === 'adjust');
assert.ok(respiratoryAdjustments.length >= 3, 'respiratory lesson compares inhale, exhale and inhale again');
assert.deepEqual(new Set(respiratoryAdjustments.map((step) => step.action.subject)), new Set(['breath']),
  'one coupled breath timeline controls ribs, lungs, airway and diaphragm');
assert.deepEqual(respiratoryAdjustments.map((step) => Math.sign((step.action.min + step.action.max) / 2)), [1, -1, 1],
  'respiratory lesson visibly compares inspiration and expiration endpoints');

const actionTypes = new Set();
const comparisonExperiments = [];
for (const experiment of experiments) {
  assert.match(experiment.id, /^[a-z0-9-]+$/, `${experiment.id}: stable id`);
  assert.ok(experiment.title && experiment.question && experiment.objective, `${experiment.id}: complete inquiry framing`);
  assert.ok(experiment.safety && experiment.modelNote, `${experiment.id}: safety and model limits`);
  assert.ok(experiment.curriculum.items.startsWith('#'), `${experiment.id}: PDF equipment mapping`);
  assert.ok(experiment.curriculum.codes.length >= 1, `${experiment.id}: learning content mapping`);
  assert.ok(experiment.apparatus.length >= 4, `${experiment.id}: apparatus list`);
  assert.ok(experiment.steps.length >= 4, `${experiment.id}: multi-step investigation`);
  assert.equal(experiment.prediction.options.length, 3, `${experiment.id}: prediction choices`);
  assert.ok(experiment.prediction.answer >= 0 && experiment.prediction.answer < 3, `${experiment.id}: valid prediction answer`);
  assert.ok(experiment.result.observation && experiment.result.explanation, `${experiment.id}: evidence and explanation`);

  // Every station runs the same inquiry cycle: observe, hypothesise, test,
  // analyse and reflect, explain.
  assert.ok(experiment.observe?.caption && experiment.observe?.wonder,
    `${experiment.id}: observation phase sets up a question`);
  assert.ok(Array.isArray(experiment.observe.notice) && experiment.observe.notice.length >= 2,
    `${experiment.id}: observation phase tells students what to look for`);
  assert.ok(experiment.analysis?.evidence, `${experiment.id}: analysis phase restates the evidence`);
  const reflection = experiment.analysis.reflection;
  assert.ok(reflection?.prompt && reflection?.because, `${experiment.id}: analysis phase asks a reflection question`);
  assert.equal(reflection.options.length, 3, `${experiment.id}: reflection offers three choices`);
  assert.ok(reflection.answer >= 0 && reflection.answer < 3, `${experiment.id}: reflection has a valid answer`);
  assert.notEqual(experiment.observe.wonder, experiment.analysis.evidence,
    `${experiment.id}: the opening question does not give away the finding`);
  if (experiment.result.comparison) {
    comparisonExperiments.push(experiment.id);
    const comparison = experiment.result.comparison;
    for (const field of ['leftLabel', 'leftValue', 'rightLabel', 'rightValue', 'conclusion']) {
      assert.ok(comparison[field], `${experiment.id}: controlled comparison includes ${field}`);
    }
  }

  const simulation = new LabSimulation(experiment);
  simulation.setPrediction(experiment.prediction.answer);
  const firstStep = simulation.step;
  const rejected = simulation.dispatchAction({ type: firstStep.action.type, subject: '__wrong__', target: firstStep.action.target });
  assert.equal(rejected.accepted, false, `${experiment.id}: invalid apparatus is rejected`);
  assert.equal(simulation.state.currentStep, 0, `${experiment.id}: invalid action cannot advance`);

  for (const step of experiment.steps) {
    const expected = step.action;
    actionTypes.add(expected.type);
    const action = { type: expected.type, subject: expected.subject, target: expected.target };
    if (expected.type === 'adjust') action.value = (expected.min + expected.max) / 2;
    if (expected.type === 'stir') action.amount = expected.amount;
    if (expected.type === 'label') {
      assert.ok(expected.pairs && Object.keys(expected.pairs).length >= 2,
        `${experiment.id}: ${expected.subject} pairs every card with a box`);
      assert.equal(new Set(Object.values(expected.pairs)).size, Object.keys(expected.pairs).length,
        `${experiment.id}: ${expected.subject} gives each card a box of its own`);
      // A board that is only partly filled in must not pass.
      const [firstCard] = Object.keys(expected.pairs);
      const partial = { ...expected.pairs };
      delete partial[firstCard];
      assert.equal(simulation.dispatchAction({ type: 'label', subject: expected.subject, pairs: partial }).accepted, false,
        `${experiment.id}: an unfinished board is rejected`);
      // So must a board where two cards are swapped.
      const cards = Object.keys(expected.pairs);
      const swapped = { ...expected.pairs, [cards[0]]: expected.pairs[cards[1]], [cards[1]]: expected.pairs[cards[0]] };
      assert.equal(simulation.dispatchAction({ type: 'label', subject: expected.subject, pairs: swapped }).accepted, false,
        `${experiment.id}: cards in the wrong boxes are rejected`);
      action.pairs = { ...expected.pairs };
    }
    if (expected.type === 'record') {
      assert.ok(expected.label && Array.isArray(expected.options) && expected.options.length >= 2,
        `${experiment.id}: ${expected.subject} records a labelled reading`);
      assert.ok(expected.answer >= 0 && expected.answer < expected.options.length,
        `${experiment.id}: ${expected.subject} has a readable correct value`);
      action.value = expected.answer;
    }
    if (expected.evidence) {
      action.evidence = {
        contact: true,
        distance: 0,
        angleErrorDeg: 0,
        impulse: Number(expected.evidence.minImpulse || 0) + .1,
      };
    }
    const result = simulation.dispatchAction(action);
    assert.equal(result.accepted, true, `${experiment.id}: golden path accepts ${expected.type}/${expected.subject}`);
  }
  assert.equal(simulation.state.complete, true, `${experiment.id}: golden path completes`);
  assert.equal(simulation.state.observations.length, experiment.steps.length, `${experiment.id}: every action records evidence`);
  const recordSteps = experiment.steps.filter((step) => step.action.type === 'record');
  assert.equal(simulation.state.records.length, recordSteps.length,
    `${experiment.id}: every recording step lands one row in the data table`);
  const restored = new LabSimulation(experiment, simulation.serialize());
  assert.deepEqual(restored.serialize(), simulation.serialize(), `${experiment.id}: save/restore round trip`);
}

assert.deepEqual(comparisonExperiments.sort(), ['force-coaster'],
  'only investigations with a fair single-variable A/B setup receive comparison cards');

for (const verb of ['place', 'connect', 'pour', 'adjust', 'tap', 'record']) {
  assert.ok(actionTypes.has(verb), `interaction grammar includes ${verb}`);
}

const allText = JSON.stringify(experiments);
for (const term of ['不可飲用', '教學疊加圖', '公平比較', '閉合電路']) {
  assert.ok(allText.includes(term), `critical science/safety language includes ${term}`);
}

const indexSource = await readFile(path.join(sourceRoot, 'index.html'), 'utf8');
for (const id of ['labCanvas', 'accessibleActionButton', 'soundToggle', 'motionToggle', 'contrastToggle', 'variableSlider', 'toastRegion', 'phenomenonStage', 'phenomenonExplainButton', 'resultComparison', 'stageScreen', 'stageKicker', 'stageBody', 'stageNext', 'recordPanel']) {
  assert.match(indexSource, new RegExp(`id="${id}"`), `accessible UI includes #${id}`);
}
assert.doesNotMatch(indexSource, /(?:src|href)=["']https?:\/\//, 'student shell has no third-party runtime assets');
assert.match(indexSource, /id="progressCount">0 \/ 8</, 'pre-boot progress count matches the focused release');
for (const removedArea of ['地球與太空', '生命與健康']) {
  assert.equal(indexSource.includes(removedArea), false, `catalog has no empty filter for ${removedArea}`);
}
const cssSource = await readFile(path.join(sourceRoot, 'css', 'science-lab.css'), 'utf8');
assert.match(cssSource, /#mainContent \{ pointer-events: none; \}/, 'empty HUD space lets pointer gestures reach the 3D canvas');
assert.match(cssSource, /\.card-art \{[^}]*display: block;/, 'catalog art occupies its own layout row');
assert.match(cssSource, /\.card-copy \{[^}]*display: block;/, 'catalog copy does not overlap card art');
assert.match(cssSource, /\.interaction-label \{[^}]*font-size: 16px;/, 'apparatus labels use a readable 16px minimum');
assert.match(cssSource, /\.mission-panel\.collapsed[\s\S]{0,600}\.mission-toggle-copy/, 'collapsed mission UI keeps a compact step tab');
assert.match(cssSource, /\.phenomenon-stage \{/, 'completion includes a dedicated observation stage before explanation');
const fallbackSource = await readFile(path.join(sourceRoot, 'js', 'render', 'FallbackRenderer.js'), 'utf8');
assert.match(fallbackSource, /performAccessibleAction\(\)/, 'non-WebGL devices retain a complete action path');
assert.doesNotMatch(`${cssSource}\n${fallbackSource}`, /https?:\/\//, 'generated visuals do not require third-party assets');
const rendererSource = await readFile(path.join(sourceRoot, 'js', 'render', 'LabRenderer.js'), 'utf8');
assert.match(rendererSource, /userData\.pourSocket[\s\S]{0,120}userData\.gripPivot/,
  'pour animation is driven by the authored vessel lip and grip pivot');
assert.match(rendererSource, /const active = this\.animations;[\s\S]{0,100}this\.animations = \[\];/,
  'animation completions can safely enqueue the vessel return stroke');
assert.doesNotMatch(rendererSource, /this\.animations = this\.animations\.filter/,
  'animation queue does not discard callbacks that schedule follow-up motion');
const mainSource = await readFile(path.join(sourceRoot, 'js', 'main.js'), 'utf8');
assert.match(mainSource, /getCompletedCount\(activeExperimentIds\)/, 'legacy completion records are filtered to active investigations');
assert.match(mainSource, /getLastPlayed\(activeExperimentIds\)/, 'legacy last-played records cannot break the continue button');
assert.match(mainSource, /if \(id \|\| currentExperiment\) showCatalog\(\)/, 'removed and unknown hashes return to the catalog');

const sceneFiles = [
  path.join(sourceRoot, 'js', 'render', 'ExperimentScenes.js'),
  path.join(sourceRoot, 'js', 'render', 'scenes', 'MatterForceScenes.js'),
  path.join(sourceRoot, 'js', 'render', 'scenes', 'EnergyScenes.js'),
  path.join(sourceRoot, 'js', 'render', 'scenes', 'BodyScenes.js'),
];
const sceneSource = (await Promise.all(sceneFiles.map((file) => readFile(file, 'utf8')))).join('\n');
for (const experiment of experiments) {
  assert.ok(sceneSource.includes(`'${experiment.id}'`) || sceneSource.includes(`${experiment.id}:`), `${experiment.id}: has a dedicated 3D scene builder`);
  for (const step of experiment.steps) {
    if (step.action.type === 'record') continue;
    assert.ok(sceneSource.includes(`'${step.action.subject}'`), `${experiment.id}: scene registers ${step.action.subject}`);
    if (step.action.target) assert.ok(sceneSource.includes(`'${step.action.target}'`), `${experiment.id}: scene registers ${step.action.target}`);
  }
}
assert.match(sceneSource, /new CircuitSystem\(/, 'electromagnetic crane uses the retained circuit model');
assert.match(sceneSource, /rough-track/, 'force challenge retains its physical rough-surface collider');
assert.doesNotMatch(allText, /砂石和濾紙|三組測試|分辨振幅和頻率|比較表面和斜角/, 'experiment claims match the implemented comparisons');

const distIndex = await readFile(path.join(distRoot, 'index.html'), 'utf8');
const assetMatches = [...distIndex.matchAll(/(?:src|href)="(\/science-lab\/assets\/[^"]+)"/g)].map((match) => match[1]);
assert.ok(assetMatches.length >= 2, 'production entry references hashed assets under /science-lab/assets');
for (const assetUrl of assetMatches) {
  const relative = assetUrl.replace('/science-lab/', '');
  await stat(path.join(distRoot, relative));
}
const jsAssets = (await readdir(path.join(distRoot, 'assets'))).filter((file) => file.endsWith('.js'));
assert.ok(jsAssets.length >= 1, 'production JavaScript exists');
assert.equal((await readdir(path.join(distRoot, 'assets'))).some((file) => file.endsWith('.map')), false, 'production build does not expose source maps');
const productionJs = (await Promise.all(jsAssets.map((file) => readFile(path.join(distRoot, 'assets', file), 'utf8')))).join('\n');
for (const removedId of ['lab-safety', 'transmission', 'root-viewer', 'food-web', 'eco-house', 'light-lab', 'sound-vacuum', 'earth-moon-sun']) {
  // Quoted, because bare words like "transmission" are also Three.js material
  // properties that legitimately appear throughout the bundle.
  assert.equal(productionJs.includes(`"${removedId}"`) || productionJs.includes(`'${removedId}'`), false,
    `${removedId}: removed scene is absent from the production bundle`);
}
const glbAssets = (await readdir(path.join(distRoot, 'assets'))).filter((file) => file.endsWith('.glb'));
// The apparatus kit and the respiratory model are modelled and exported from
// Blender separately, because only one station wants the anatomy. The budget is
// on the total, which is what a pupil actually downloads.
assert.equal(glbAssets.length, 2, 'production includes the equipment kit and the respiratory model');
const glbBytes = (await Promise.all(glbAssets.map(async (file) => (await stat(path.join(distRoot, 'assets', file))).size)))
  .reduce((sum, size) => sum + size, 0);
// Raised from 2.5 MB at the client's request: the respiratory model is meant
// to stand up to a medical student's eye, and the anatomy that takes — twelve
// ribs with a costal margin, a mediastinum, C-shaped tracheal cartilage — costs
// geometry. Still one download, still cached after the first visit.
assert.ok(glbBytes < 4_000_000, `Blender models stay within the download budget (actual ${glbBytes} bytes)`);

const publicRespiratory = await readFile(path.join(sourceRoot, 'models', 'respiratory.glb'));
const respiratoryAsset = glbAssets.find((file) => file.startsWith('respiratory-'));
assert.ok(respiratoryAsset, 'production contains the hashed respiratory model');
const distRespiratory = await readFile(path.join(distRoot, 'assets', respiratoryAsset));
assert.equal(sha256(distRespiratory), sha256(publicRespiratory),
  'the deployed respiratory GLB is byte-identical to the checked Blender export');

const respiratoryGlb = readGlbJson(publicRespiratory, 'respiratory model');
assert.deepEqual(
  respiratoryGlb.nodes.map((node) => node.name).sort(),
  ['airway', 'body', 'diaphragm', 'lungs', 'mediastinum', 'ribcage', 'spine'],
  'respiratory GLB preserves all seven anatomical systems as semantic nodes',
);
const materialNames = respiratoryGlb.materials.map((material) => material.name);
const lobeMaterials = ['lung_LLL', 'lung_LUL', 'lung_RLL', 'lung_RML', 'lung_RUL'];
for (const material of lobeMaterials) {
  assert.ok(materialNames.includes(material), `respiratory GLB preserves ${material} as a distinct lung lobe material`);
}
const lungNode = respiratoryGlb.nodes.find((node) => node.name === 'lungs');
const lungMesh = respiratoryGlb.meshes[lungNode.mesh];
assert.deepEqual(
  lungMesh.primitives.map((primitive) => materialNames[primitive.material]).sort(),
  [...lobeMaterials].sort(),
  'the lung mesh ships exactly five lobe primitives',
);
for (const nodeName of ['ribcage', 'airway', 'lungs', 'body', 'diaphragm']) {
  const node = respiratoryGlb.nodes.find((candidate) => candidate.name === nodeName);
  assert.deepEqual(respiratoryGlb.meshes[node.mesh].extras?.targetNames, ['Inhale', 'Exhale'],
    `${nodeName}: Blender-authored inhale and exhale endpoints survive export`);
}
const totalGzip = jsAssets.reduce(async (sumPromise, file) => {
  const sum = await sumPromise;
  const contents = await readFile(path.join(distRoot, 'assets', file));
  return sum + gzipSync(contents).length;
}, Promise.resolve(0));
assert.ok(await totalGzip < 1400 * 1024, `compressed JS including local Rapier WASM stays below 1.4 MiB (actual ${await totalGzip} bytes)`);

// Clips are optional, but the route that serves them and the note explaining
// where they go must both exist, or a dropped-in file goes nowhere.
const mediaReadme = await readFile(path.join(sourceRoot, 'media', 'README.md'), 'utf8');
for (const experiment of experiments) {
  assert.ok(mediaReadme.includes(`${experiment.id}.mp4`), `${experiment.id}: observation clip filename is documented`);
}
const mainPhaseSource = await readFile(path.join(sourceRoot, 'js', 'main.js'), 'utf8');
assert.match(mainPhaseSource, /openObservation\(\)/, 'an investigation opens on its observation phase');
assert.match(mainPhaseSource, /function openAnalysis\(/, 'analysis and reflection run before the explanation');
assert.match(mainPhaseSource, /function runStage\(/, 'the inquiry phases run as a full-screen slide sequence');
assert.match(mainPhaseSource, /chapterSlide\(t\('sl\.chapterOne'\), t\('sl\.chapterObserve'\)/, 'the cycle opens by naming the observation phase');
assert.match(mainPhaseSource, /chapterSlide\(t\('sl\.chapterTwo'\), t\('sl\.chapterHypothesis'\)/, 'the hypothesis phase is announced before it is asked');
assert.match(mainPhaseSource, /chapterSlide\(t\('sl\.chapterFour'\), t\('sl\.chapterAnalyse'\)/, 'analysis is announced before the evidence is shown');
assert.match(mainPhaseSource, /MEDIA_BASE = '\/science-lab\/media'/, 'observation clips load from the protected media route');
for (const slide of ['videoSlide', 'noticeSlide', 'wonderSlide', 'hypothesisSlide', 'analysisSlide', 'reflectionSlide']) {
  assert.ok(mainPhaseSource.includes(`function ${slide}(`), `the cycle has a dedicated ${slide}`);
}

// Bench name plates replace hover-only labels, which a tablet cannot produce.
const rendererPlates = await readFile(path.join(sourceRoot, 'js', 'render', 'LabRenderer.js'), 'utf8');
assert.match(rendererPlates, /#layOutNamePlates\(\)/, 'apparatus names stand on the bench rather than waiting for a hover');
assert.match(rendererPlates, /options\.connectable/, 'connection ports are excluded from bench plates');
assert.match(cssSource, /\.stage-chapter-title \{[^}]*font-size: clamp\(46px/, 'phase cards are readable across the room');
assert.match(cssSource, /\.stage-option \{[^}]*min-height: clamp\(64px/, 'choices are large enough for a child to tap');

const serverSource = await readFile(path.join(root, 'server.js'), 'utf8');
assert.match(serverSource, /app\.use\('\/science-lab\/media'/, 'server serves observation clips from source');
assert.match(serverSource, /app\.use\('\/science-lab\/assets'/, 'server exposes only hashed build assets');
assert.match(serverSource, /app\.get\(\['\/science-lab', '\/science-lab\/'\], requireSession/, 'student HTML route requires a platform session');
assert.doesNotMatch(serverSource, /app\.use\('\/science-lab',\s*express\.static\(scienceLabDist/, 'dist root is not publicly exposed');
assert.match(serverSource, /Content-Security-Policy/, 'student document receives a restrictive content security policy');
assert.match(serverSource, /wasm-unsafe-eval/, 'Rapier WASM is narrowly allowed by the student CSP');
assert.doesNotMatch(serverSource, /(?<!wasm-)unsafe-eval/, 'student CSP does not allow general script eval');
assert.match(serverSource, /X-Content-Type-Options/, 'science assets opt out of MIME sniffing');

const portalConfig = await readFile(path.join(root, 'src', 'config.js'), 'utf8');
assert.match(portalConfig, /id: 'science-lab'/, 'portal has a science module card');
assert.match(portalConfig, /url: '\/science-lab'/, 'portal card opens the protected module');

const respiratoryGeometry = await runRespiratoryInterpenetrationCheck({ log: () => {} });
assert.equal(respiratoryGeometry.ok, true,
  'respiratory anatomy remains free of interpenetration through all 101 tested breath phases');

console.log('Science Lab content, simulation, safety, accessibility, build budget and protected-route checks passed.');
