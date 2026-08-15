#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { experiments, experimentById, getNextExperiment } from '../science-lab-app/public/js/data/experiments.js';
import { LabSimulation } from '../science-lab-app/public/js/simulation/LabSimulation.js';

const root = path.resolve('.');
const sourceRoot = path.join(root, 'science-lab-app', 'public');
const distRoot = path.join(root, 'science-lab-app', 'dist');

assert.deepEqual(
  experiments.map((item) => item.id),
  ['transmission', 'density-column', 'water-filter', 'electric-crane', 'force-coaster'],
  'the focused release exposes exactly the five selected investigations in order',
);
assert.deepEqual(experiments.map((item) => item.number), [1, 2, 3, 4, 5], 'visible experiment numbers are contiguous');
for (const removedId of ['lab-safety', 'root-viewer', 'food-web', 'eco-house', 'light-lab', 'sound-vacuum', 'earth-moon-sun']) {
  assert.equal(experimentById.has(removedId), false, `${removedId}: removed investigation has no route entry`);
}
assert.equal(getNextExperiment('force-coaster')?.id, 'transmission', 'next-station flow cycles only through the selected five');
assert.equal(getNextExperiment('sound-vacuum'), null, 'unknown legacy route cannot silently enter another experiment');
assert.equal(new Set(experiments.map((item) => item.id)).size, experiments.length, 'experiment ids are unique');
assert.deepEqual(
  new Set(experiments.map((item) => item.topic)),
  new Set(['生命與健康', '環境', '物質', '能量', '力與運動']),
  'all five retained science areas are represented',
);

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
  const restored = new LabSimulation(experiment, simulation.serialize());
  assert.deepEqual(restored.serialize(), simulation.serialize(), `${experiment.id}: save/restore round trip`);
}

assert.deepEqual(comparisonExperiments.sort(), ['force-coaster'],
  'only investigations with a fair single-variable A/B setup receive comparison cards');

for (const verb of ['place', 'connect', 'pour', 'stir', 'adjust', 'tap']) {
  assert.ok(actionTypes.has(verb), `interaction grammar includes ${verb}`);
}

const allText = JSON.stringify(experiments);
for (const term of ['不可飲用', '教學疊加圖', '公平比較', '閉合電路']) {
  assert.ok(allText.includes(term), `critical science/safety language includes ${term}`);
}

const indexSource = await readFile(path.join(sourceRoot, 'index.html'), 'utf8');
for (const id of ['labCanvas', 'accessibleActionButton', 'soundToggle', 'motionToggle', 'contrastToggle', 'variableSlider', 'toastRegion', 'phenomenonStage', 'phenomenonExplainButton', 'resultComparison']) {
  assert.match(indexSource, new RegExp(`id="${id}"`), `accessible UI includes #${id}`);
}
assert.doesNotMatch(indexSource, /(?:src|href)=["']https?:\/\//, 'student shell has no third-party runtime assets');
assert.match(indexSource, /id="progressCount">0 \/ 5</, 'pre-boot progress count matches the focused release');
assert.doesNotMatch(indexSource, /地球與太空/, 'catalog has no empty filter for a removed science area');
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
  path.join(sourceRoot, 'js', 'render', 'scenes', 'BiologyScenes.js'),
  path.join(sourceRoot, 'js', 'render', 'scenes', 'MatterForceScenes.js'),
  path.join(sourceRoot, 'js', 'render', 'scenes', 'EnergyScenes.js'),
];
const sceneSource = (await Promise.all(sceneFiles.map((file) => readFile(file, 'utf8')))).join('\n');
for (const experiment of experiments) {
  assert.ok(sceneSource.includes(`'${experiment.id}'`) || sceneSource.includes(`${experiment.id}:`), `${experiment.id}: has a dedicated 3D scene builder`);
  for (const step of experiment.steps) {
    assert.ok(sceneSource.includes(`'${step.action.subject}'`), `${experiment.id}: scene registers ${step.action.subject}`);
    if (step.action.target) assert.ok(sceneSource.includes(`'${step.action.target}'`), `${experiment.id}: scene registers ${step.action.target}`);
  }
}
assert.doesNotMatch(sceneSource, /action\.subject === 'tracer'[\s\S]{0,180}tracerSpots\.forEach\(\(spot\) => \{ spot\.visible = true;/, 'UV tracer is hidden under ordinary light');
assert.match(sceneSource, /action\.subject === 'uv-lamp'[\s\S]{0,320}tracerSpots\.forEach/, 'UV tracer fluorescence appears only during inspection');
assert.match(sceneSource, /tiltPour\(tracer[\s\S]{0,120}mode: 'pump'/,
  'dispensers remain upright and deliver tracer through their pump nozzle');
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
for (const removedId of ['lab-safety', 'root-viewer', 'food-web', 'eco-house', 'light-lab', 'sound-vacuum', 'earth-moon-sun']) {
  assert.equal(productionJs.includes(removedId), false, `${removedId}: removed scene is absent from the production bundle`);
}
const glbAssets = (await readdir(path.join(distRoot, 'assets'))).filter((file) => file.endsWith('.glb'));
assert.equal(glbAssets.length, 1, 'production includes one focused Blender equipment kit');
assert.ok((await stat(path.join(distRoot, 'assets', glbAssets[0]))).size < 300_000,
  'focused Blender kit contains only apparatus used by the selected investigations');
const totalGzip = jsAssets.reduce(async (sumPromise, file) => {
  const sum = await sumPromise;
  const contents = await readFile(path.join(distRoot, 'assets', file));
  return sum + gzipSync(contents).length;
}, Promise.resolve(0));
assert.ok(await totalGzip < 1400 * 1024, `compressed JS including local Rapier WASM stays below 1.4 MiB (actual ${await totalGzip} bytes)`);

const serverSource = await readFile(path.join(root, 'server.js'), 'utf8');
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

console.log('Science Lab content, simulation, safety, accessibility, build budget and protected-route checks passed.');
