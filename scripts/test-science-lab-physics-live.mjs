#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

import { experiments } from '../science-lab-app/public/js/data/experiments.js';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const root = path.resolve('.');
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'buio-science-physics-'));
const databaseFile = path.join(temporaryDirectory, 'fixture.json');
const port = Number(process.env.SCIENCE_LAB_PHYSICS_PORT || 3162);
const base = `http://127.0.0.1:${port}`;
const evidenceDirectory = path.resolve(
  'tmp',
  'science-lab-physics-live',
  process.env.SCIENCE_LAB_EVIDENCE_ID || `run-${process.pid}`,
);
const gesturePauseMs = Number(process.env.SCIENCE_LAB_GESTURE_DELAY || 7);
const onlyExperiments = new Set(String(process.env.SCIENCE_LAB_ONLY || '').split(',').map((item) => item.trim()).filter(Boolean));
const expectedHoverLabels = new Map();
let navigationSerial = 0;

await rm(evidenceDirectory, { recursive: true, force: true });
await mkdir(evidenceDirectory, { recursive: true });
await writeFile(databaseFile, JSON.stringify({
  users: [{
    studentid: 'P001', name: '物理測試生', role: 'student', passwordhash: bcrypt.hashSync('123456', 4),
    classname: 'P4', classno: 1, chinesegroup: '', englishgroup: '', mathgroup: '', language: 'zh-HK',
  }],
  studentStats: [], questionLogs: [], _logId: 0,
}, null, 2));

function spawnAndCollect(command, args, options = {}) {
  const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout?.on('data', (chunk) => { output += chunk; });
  child.stderr?.on('data', (chunk) => { output += chunk; });
  return { child, output: () => output };
}

async function waitForExit(processRecord, label) {
  const code = await new Promise((resolve, reject) => {
    processRecord.child.once('error', reject);
    processRecord.child.once('exit', resolve);
  });
  assert.equal(code, 0, `${label} failed:\n${processRecord.output()}`);
}

async function buildLatestLab() {
  if (process.env.SCIENCE_LAB_SKIP_BUILD === '1') return;
  const viteCli = path.resolve('science-lab-app', 'node_modules', 'vite', 'bin', 'vite.js');
  assert.ok(existsSync(viteCli), 'science-lab-app dependencies are installed');
  await waitForExit(spawnAndCollect(process.execPath, [viteCli, 'build'], {
    cwd: path.resolve('science-lab-app'),
    env: process.env,
  }), 'Science Lab production build');
}

await buildLatestLab();

const serverRecord = spawnAndCollect(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    BUIO_JSON_DB_FILE: databaseFile,
    SUPABASE_DB_URL: '',
    NODE_ENV: 'development',
    GOOGLE_API_KEY: '',
    GOOGLE_CREDENTIALS_JSON: '',
    GOOGLE_APPLICATION_CREDENTIALS: '',
  },
});

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${base}/health`)).ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Science Lab fixture server did not start:\n${serverRecord.output()}`);
}

function midpoint(action) {
  if (!Number.isFinite(action.min) || !Number.isFinite(action.max)) return null;
  return (action.min + action.max) / 2;
}

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

async function projectedPoint(page, id, target = false) {
  const point = await page.evaluate(({ entityId, isTarget }) => (
    isTarget
      ? window.__scienceLabTest?.getTargetPoint(entityId)
      : window.__scienceLabTest?.getEntityPoint(entityId)
  ), { entityId: id, isTarget: target });
  assert.ok(finitePoint(point), `missing projected ${target ? 'target' : 'entity'} point: ${id}`);
  return point;
}

async function sourcePoint(page, id) {
  const point = await projectedPoint(page, id, false);
  const visibility = await page.evaluate(({ x, y }) => {
    const canvas = document.querySelector('#labCanvas');
    const rect = canvas?.getBoundingClientRect();
    const top = document.elementFromPoint(x, y);
    return {
      rect: rect?.toJSON?.() || null,
      top: top?.id || top?.tagName || null,
      inside: Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom),
    };
  }, point);
  assert.equal(visibility.inside, true, `${id} projects outside the canvas: ${JSON.stringify({ point, visibility })}`);
  assert.equal(visibility.top, 'labCanvas', `${id} is covered or not pickable at its projected centre: ${JSON.stringify({ point, visibility })}`);
  // Group bounds can project to empty space (for example, the gap between two
  // goggle lenses). Probe a tight spiral with genuine pointer movement and use
  // the renderer's hover label as the same hit feedback a student receives.
  const candidates = [point];
  for (const radius of [10, 18, 28, 40, 54, 72, 94, 118]) {
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 2;
      candidates.push({ x: point.x + Math.cos(angle) * radius, y: point.y + Math.sin(angle) * radius });
    }
  }
  for (const candidate of candidates) {
    await page.mouse.move(candidate.x, candidate.y);
    await page.waitForTimeout(3);
    const hovered = await page.evaluate((subjectId) => {
      const debug = window.__scienceLabTest?.getDebugStats?.();
      return debug?.hoveredEntity === subjectId;
    }, id);
    if (hovered) return candidate;
  }
  // Older renderer diagnostics do not expose hoveredEntity. A short no-button
  // pointer pass leaves the interaction label visible only over real meshes.
  for (const candidate of candidates) {
    await page.mouse.move(candidate.x, candidate.y);
    await page.waitForTimeout(3);
    const hover = await page.evaluate(() => {
      const label = document.querySelector('#interactionLabel');
      return {
        visible: Boolean(label && !label.hidden && getComputedStyle(label).display !== 'none'),
        text: label?.textContent?.trim() || '',
      };
    });
    const expectedLabel = expectedHoverLabels.get(id);
    if (hover.visible && (!expectedLabel || hover.text === expectedLabel)) return candidate;
  }
  throw new Error(`${id}: no pickable mesh found near projected group centre ${JSON.stringify(point)}`);
}

// The inquiry phases are full-screen slides; walk them until the wanted slide
// is on screen.
async function advanceStageTo(page, slide) {
  for (let guard = 0; guard < 16; guard += 1) {
    const current = await page.locator('#stageScreen:not([hidden])').getAttribute('data-slide').catch(() => null);
    if (current === slide) return;
    if (current === null) throw new Error(`stage closed before reaching ${slide}`);
    if (await page.locator('#stageNext:not([hidden]):not([disabled])').count()) {
      await page.locator('#stageNext').click();
    }
    await page.waitForTimeout(650);
  }
  throw new Error(`stage never reached ${slide}`);
}

// A recording step is answered on its own panel: click the reading the
// instrument is actually showing.
async function recordGesture(page, action) {
  await page.locator('#recordPanel:not([hidden])').waitFor();
  await page.locator(`[data-record="${action.answer}"]`).click();
  return { verb: 'record', chose: action.options[action.answer] };
}

async function movePointer(page, from, to, steps = 24, pauseMs = gesturePauseMs) {
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const eased = t * t * (3 - 2 * t);
    await page.mouse.move(
      from.x + (to.x - from.x) * eased,
      from.y + (to.y - from.y) * eased,
    );
    if (pauseMs > 0) await page.waitForTimeout(pauseMs);
  }
}

async function seekPhysicalContact(page, subject, target, centre) {
  const contact = async () => page.evaluate(({ subjectId, targetId }) => (
    window.__scienceLabTest?.getPhysicsDebug?.(subjectId, targetId)?.socket?.contact === true
  ), { subjectId: subject, targetId: target });
  if (await contact()) return { found: true, point: centre, probes: 0 };
  let probes = 0;
  for (const radius of [12, 24, 38, 54, 72, 94]) {
    for (let index = 0; index < 12; index += 1) {
      const angle = index / 12 * Math.PI * 2;
      const point = { x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius };
      await page.mouse.move(point.x, point.y);
      await page.waitForTimeout(5);
      probes += 1;
      if (await contact()) return { found: true, point, probes };
    }
  }
  await page.mouse.move(centre.x, centre.y);
  return { found: false, point: centre, probes };
}

async function dragGesture(page, subject, target, { strike = false, physicalContact = false } = {}) {
  // Resolve the stationary receiver first. Animated entities (notably the
  // pond fish) are then picked immediately before pointerdown so their screen
  // position cannot go stale while the target is queried.
  const to = await projectedPoint(page, target, true);
  const from = await sourcePoint(page, subject);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (strike) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const windup = { x: from.x - dx / length * 58, y: from.y - dy / length * 58 };
    await movePointer(page, from, windup, 7, 5);
    await movePointer(page, windup, to, 5, 1);
    // Release at the impact instant. Waiting for a cosmetic follow-through
    // lets the elastic bodies separate, which no longer satisfies the scene's
    // intentionally strict contact-at-release evidence rule.
  } else {
    // The storage cabinet is open at the front but has a physical side wall.
    // Carry the bag in front of the opening before pushing it inward, just as
    // a student must; a diagonal centre-to-centre path correctly collides.
    if (subject === 'bag' && target === 'storage') {
      const liftClear = { x: from.x, y: Math.min(from.y + 92, 1005) };
      const frontOfOpening = { x: to.x, y: liftClear.y };
      await movePointer(page, from, liftClear, 8);
      await movePointer(page, liftClear, frontOfOpening, 22);
      await movePointer(page, frontOfOpening, to, 14);
    } else if (subject === 'thermometer' && target === 'house') {
      const clearOfPanelRack = { x: from.x, y: Math.min(Math.max(from.y, to.y) + 155, 1000) };
      const inFrontOfHouse = { x: to.x, y: clearOfPanelRack.y };
      await movePointer(page, from, clearOfPanelRack, 12);
      await movePointer(page, clearOfPanelRack, inFrontOfHouse, 24);
      await movePointer(page, inFrontOfHouse, to, 14);
    } else if ((subject === 'metal-panel' || subject === 'foam-panel') && target === 'wall') {
      const clearFront = { x: from.x, y: Math.min(Math.max(from.y, to.y) + 205, 1010) };
      const alignedWithSlot = { x: to.x, y: clearFront.y };
      await movePointer(page, from, clearFront, 14);
      await movePointer(page, clearFront, alignedWithSlot, 26);
      await movePointer(page, alignedWithSlot, to, 16);
    } else if (subject === 'spring-scale' && target === 'cart-hook') {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const length = Math.max(1, Math.hypot(dx, dy));
      const hookEngagement = { x: to.x + dx / length * 52, y: to.y + dy / length * 52 };
      await movePointer(page, from, hookEngagement, 32);
    } else if (subject === 'spring-scale' && target === 'pull-end') {
      // Pull deliberately rather than flicking: the cart must respond to the
      // measured spring extension throughout this real pointer trajectory.
      await movePointer(page, from, to, 84, Math.max(10, gesturePauseMs));
    } else {
      await movePointer(page, from, to, 28);
    }
  }
  const contact = physicalContact ? await seekPhysicalContact(page, subject, target, to) : null;
  if (!strike) await page.waitForTimeout(90);
  await page.mouse.up();
  return { from, to, contact };
}

async function tapGesture(page, subject) {
  const point = await sourcePoint(page, subject);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(55);
  await page.mouse.up();
  return { point };
}

async function stirGesture(page, subject, amount) {
  const center = await projectedPoint(page, subject, false);
  const pickup = await sourcePoint(page, subject);
  const radius = 48;
  const revolutions = Math.max(1, Math.ceil((Number(amount) + .7) / (Math.PI * 2)));
  const samples = revolutions * 30;
  const start = { x: center.x + radius, y: center.y };
  await page.mouse.move(pickup.x, pickup.y);
  await page.mouse.down();
  await movePointer(page, pickup, start, 5, 3);
  for (let index = 1; index <= samples; index += 1) {
    const angle = index / samples * Math.PI * 2 * revolutions;
    await page.mouse.move(center.x + Math.cos(angle) * radius, center.y + Math.sin(angle) * radius);
    if (gesturePauseMs > 0) await page.waitForTimeout(Math.max(2, gesturePauseMs - 2));
  }
  await page.mouse.up();
  return { center, pickup, radius, revolutions };
}

async function adjustGesture(page, action, state) {
  const from = await sourcePoint(page, action.subject);
  const range = action.range || [0, 100];
  const low = Math.min(...range);
  const high = Math.max(...range);
  const start = Number.isFinite(state.variables?.[action.subject])
    ? Number(state.variables[action.subject])
    : Number(range[0]);
  const target = midpoint(action);
  assert.ok(Number.isFinite(target) && high > low, `invalid adjust range for ${action.subject}`);
  const direction = action.invert ? -1 : 1;
  const travel = (target - start) / (direction * (high - low)) * 320;
  const vertical = action.subject === 'orbit-tilt';
  const to = vertical
    ? { x: from.x, y: from.y - travel }
    : { x: from.x + travel, y: from.y };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await movePointer(page, from, to, Math.max(18, Math.ceil(Math.abs(travel) / 10)));
  await page.waitForTimeout(45);
  await page.mouse.up();
  return { from, to, start, target, travel, vertical };
}

async function waitForProgress(page, definition, stepIndex, action, gestureEvidence) {
  try {
    await page.waitForFunction(({ previous, stepCount }) => {
      const state = window.__scienceLabTest?.getState();
      return state && (state.currentStep > previous || (previous === stepCount - 1 && state.complete));
    }, { previous: stepIndex, stepCount: definition.steps.length }, { timeout: 6500 });
  } catch (error) {
    const diagnostics = await page.evaluate(({ subject, target }) => ({
      state: window.__scienceLabTest?.getState?.(),
      debug: window.__scienceLabTest?.getDebugStats?.(),
      physics: window.__scienceLabTest?.getPhysicsDebug?.(subject, target),
      kind: window.__scienceLabTest?.rendererKind?.(),
    }), { subject: action.subject, target: action.target || null });
    const failurePath = path.join(evidenceDirectory, `${String(definition.number).padStart(2, '0')}-${definition.id}-step-${stepIndex + 1}-failure.png`);
    await page.screenshot({ path: failurePath, fullPage: true });
    throw new Error(`${definition.id} step ${stepIndex + 1} did not advance after a real ${action.type} gesture.\n${JSON.stringify({ action, gestureEvidence, diagnostics, failurePath }, null, 2)}`, { cause: error });
  }
  const state = await page.evaluate(() => window.__scienceLabTest.getState());
  assert.equal(state.currentStep, stepIndex + 1, `${definition.id}: exactly one step advances per gesture`);
  const last = state.actionHistory.at(-1);
  assert.equal(last?.accepted, true, `${definition.id}: the physical gesture is accepted`);
  assert.equal(last?.action?.type, action.type, `${definition.id}: recorded verb matches the real gesture`);
  assert.equal(last?.action?.subject, action.subject, `${definition.id}: recorded subject matches the manipulated object`);
  return state;
}

async function performStep(page, definition, stepIndex, gestureCounts) {
  const step = definition.steps[stepIndex];
  const action = step.action;
  const before = await page.evaluate(() => window.__scienceLabTest.getState());
  assert.equal(before.currentStep, stepIndex, `${definition.id}: runner and simulation step stay in sync`);
  const attemptsBefore = before.attempts;
  const pourHome = action.type === 'pour'
    ? await page.evaluate((id) => window.__scienceLabTest.getPourDebug(id), action.subject)
    : null;
  if (pourHome) {
    const prePourHomeDistance = Math.hypot(
      pourHome.position.x - pourHome.home.position.x,
      pourHome.position.y - pourHome.home.position.y,
      pourHome.position.z - pourHome.home.position.z,
    );
    assert.ok(prePourHomeDistance < .02,
      `${definition.id}: ${action.subject} waits upright at its authored home (${prePourHomeDistance.toFixed(4)} m drift)`);
  }
  let gestureEvidence;
  if (action.type === 'place' || action.type === 'pour' || action.type === 'connect') {
    gestureEvidence = await dragGesture(page, action.subject, action.target, { physicalContact: action.type !== 'connect' });
  } else if (action.type === 'strike') {
    gestureEvidence = await dragGesture(page, action.subject, action.target, { strike: true, physicalContact: true });
  } else if (action.type === 'tap') {
    gestureEvidence = await tapGesture(page, action.subject);
  } else if (action.type === 'record') {
    gestureEvidence = await recordGesture(page, action);
  } else if (action.type === 'stir') {
    gestureEvidence = await stirGesture(page, action.subject, action.amount);
  } else if (action.type === 'adjust') {
    gestureEvidence = await adjustGesture(page, action, before);
  } else {
    throw new Error(`${definition.id}: unsupported physical action type ${action.type}`);
  }
  gestureCounts[action.type] = (gestureCounts[action.type] || 0) + 1;
  const after = await waitForProgress(page, definition, stepIndex, action, gestureEvidence);
  assert.equal(after.attempts, attemptsBefore, `${definition.id}: golden physical gesture has no rejected attempt`);
  if (action.type === 'pour') {
    assert.ok(pourHome?.socket && pourHome?.grip,
      `${definition.id}: ${action.subject} exposes an authored pouring lip and grip pivot`);
    // Inspect the visible pour before the return stroke begins. The lip must be
    // the part nearest the receiver, proving that material is not emitted from
    // the cup bottom/root.
    await page.waitForTimeout(520);
    const pouring = await page.evaluate((id) => window.__scienceLabTest.getPourDebug(id), action.subject);
    const target = await page.evaluate((id) => window.__scienceLabTest.getTargetWorldPose(id), action.target);
    assert.ok(pouring?.socket && pouring?.position && target, `${definition.id}: live pour diagnostics are available`);
    const lipDistance = Math.hypot(
      pouring.socket.x - target.position.x,
      pouring.socket.y - target.position.y,
      pouring.socket.z - target.position.z,
    );
    const lipHorizontalDistance = Math.hypot(
      pouring.socket.x - target.position.x,
      pouring.socket.z - target.position.z,
    );
    const baseDistance = Math.hypot(
      pouring.position.x - target.position.x,
      pouring.position.y - target.position.y,
      pouring.position.z - target.position.z,
    );
    // An upright pump dispenser cannot dip its nozzle towards the hands the
    // way a tipped bottle can: its whole body would pass through them, so its
    // lip legitimately sits a full bottle height above the receiver.
    const lipCeiling = ['tracer', 'soap'].includes(action.subject) ? 2.2 : 1.5;
    assert.ok(lipHorizontalDistance < .26 && pouring.socket.y > target.position.y + .04 && pouring.socket.y < target.position.y + lipCeiling,
      `${definition.id}: ${action.subject} lip is above the receiver (${lipDistance.toFixed(3)} m total, ${lipHorizontalDistance.toFixed(3)} m horizontal)`);
    if (!['tracer', 'soap'].includes(action.subject)) {
      assert.ok(baseDistance > lipDistance + .3,
        `${definition.id}: ${action.subject} base stays away from the liquid stream (base=${baseDistance.toFixed(3)}, lip=${lipDistance.toFixed(3)})`);
    }
    await page.screenshot({
      path: path.join(
        evidenceDirectory,
        `${String(definition.number).padStart(2, '0')}-${definition.id}-step-${stepIndex + 1}-${action.subject}-pour.png`,
      ),
      fullPage: true,
    });
    await page.waitForTimeout(1250);
    const returned = await page.evaluate((id) => window.__scienceLabTest.getPourDebug(id), action.subject);
    const homeDistance = Math.hypot(
      returned.position.x - pourHome.home.position.x,
      returned.position.y - pourHome.home.position.y,
      returned.position.z - pourHome.home.position.z,
    );
    const quaternionDot = Math.abs(
      returned.quaternion.x * pourHome.home.rotation.x
      + returned.quaternion.y * pourHome.home.rotation.y
      + returned.quaternion.z * pourHome.home.rotation.z
      + returned.quaternion.w * pourHome.home.rotation.w
    );
    assert.ok(homeDistance < .012, `${definition.id}: ${action.subject} returns home after pouring (${homeDistance.toFixed(4)} m)`);
    assert.ok(1 - quaternionDot < .002, `${definition.id}: ${action.subject} returns to its upright authored rotation`);
  }
  await page.waitForTimeout(100);
  return after;
}

async function sceneState(page, expectedExperiment) {
  const science = await page.evaluate(() => window.__scienceLabTest?.getDebugStats?.()?.science || null);
  assert.ok(science, `${expectedExperiment}: scene must expose semantic getState() diagnostics`);
  if (science.experiment != null) {
    assert.equal(science.experiment, expectedExperiment, `${expectedExperiment}: semantic scene state belongs to the active experiment`);
  }
  return science;
}

async function openExperiment(page, definition) {
  navigationSerial += 1;
  await page.goto(`${base}/science-lab/preview?physicsRun=${navigationSerial}#${definition.id}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'));
  await page.waitForFunction(() => window.__scienceLabTest?.rendererKind?.() === 'webgl');
  await page.locator('#stageScreen:not([hidden])').waitFor();
  await advanceStageTo(page, 'hypothesis');
  await page.locator(`[data-prediction="${definition.prediction.answer}"]`).click();
  await page.locator('#stageNext').click();
  await page.locator('#stageScreen').waitFor({ state: 'hidden' });
  await page.waitForFunction((id) => {
    const state = window.__scienceLabTest?.getState?.();
    return state?.experimentId === id && state.prediction != null && state.currentStep === 0;
  }, definition.id);
  assert.equal(await page.locator('#missionPanel.collapsed').count(), 1, 'the instruction card defaults to a compact playfield-safe tab');
  assert.equal(await page.locator('#missionPanelToggle').isVisible(), true, 'the compact task tab remains available');
  await page.locator('#missionPanelToggle').click();
  assert.equal(await page.locator('#accessibleActionButton').isVisible(), true, 'alternate action remains available inside the expanded task card');
  await page.locator('#missionPanelToggle').click();
  assert.equal(await page.evaluate(() => window.__scienceLabAccessibleClicks || 0), 0, 'no alternate-action click occurred during boot');

  const stabilityIds = {
    'root-viewer': ['magnifier'],
    'eco-house': ['thermometer'],
  }[definition.id] || [];
  if (stabilityIds.length) {
    const authored = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, window.__scienceLabTest.getEntityHomePose(id)])), stabilityIds);
    await page.waitForTimeout(700);
    const settled = await page.evaluate((ids) => Object.fromEntries(ids.map((id) => [id, window.__scienceLabTest.getPhysicsPose(id)])), stabilityIds);
    for (const id of stabilityIds) {
      assert.ok(authored[id] && settled[id], `${definition.id}: ${id} exposes authored and physical poses`);
      const drift = Math.hypot(
        settled[id].position.x - authored[id].position.x,
        settled[id].position.y - authored[id].position.y,
        settled[id].position.z - authored[id].position.z,
      );
      assert.ok(drift <= .03, `${definition.id}: ${id} does not drift from its authored rack position (${drift.toFixed(4)} m)`);
      assert.ok(Math.hypot(settled[id].velocity.x, settled[id].velocity.y, settled[id].velocity.z) <= .05,
        `${definition.id}: ${id} is stable before pickup: ${JSON.stringify(settled[id])}`);
    }
  }

  const fullyVisibleIds = {
    'root-viewer': ['magnifier'],
    'eco-house': ['thermometer'],
  }[definition.id] || [];
  for (const id of fullyVisibleIds) {
    const visibility = await page.evaluate((entityId) => {
      const bounds = window.__scienceLabTest.getEntityScreenBounds(entityId);
      const canvas = document.querySelector('#labCanvas')?.getBoundingClientRect();
      return { bounds, canvas: canvas?.toJSON?.() || null };
    }, id);
    assert.ok(visibility.bounds && visibility.canvas, `${definition.id}: ${id} exposes projected visual bounds`);
    assert.ok(visibility.bounds.left >= visibility.canvas.left && visibility.bounds.right <= visibility.canvas.right
      && visibility.bounds.top >= visibility.canvas.top && visibility.bounds.bottom <= visibility.canvas.bottom,
    `${definition.id}: the complete ${id} silhouette stays inside the canvas: ${JSON.stringify(visibility)}`);
  }

  if (fullyVisibleIds.length) {
    const originalViewport = page.viewportSize();
    for (const viewport of [{ width: 390, height: 844 }, { width: 667, height: 375 }]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(280);
      for (const id of fullyVisibleIds) {
        const visibility = await page.evaluate((entityId) => {
          const bounds = window.__scienceLabTest.getEntityScreenBounds(entityId);
          const canvas = document.querySelector('#labCanvas')?.getBoundingClientRect();
          return { bounds, canvas: canvas?.toJSON?.() || null };
        }, id);
        assert.ok(visibility.bounds && visibility.canvas, `${definition.id}: ${id} exposes ${viewport.width}×${viewport.height} bounds`);
        assert.ok(visibility.bounds.left >= visibility.canvas.left && visibility.bounds.right <= visibility.canvas.right
          && visibility.bounds.top >= visibility.canvas.top && visibility.bounds.bottom <= visibility.canvas.bottom,
        `${definition.id}: the complete ${id} silhouette stays inside ${viewport.width}×${viewport.height}: ${JSON.stringify(visibility)}`);
      }
    }
    await page.setViewportSize(originalViewport);
    await page.waitForTimeout(280);
  }

  const forbiddenInitialContacts = {
    'root-viewer': [['water-cup', 'magnifier']],
    'light-lab': [['mirror', 'prism']],
  }[definition.id] || [];
  if (forbiddenInitialContacts.length) {
    await page.waitForTimeout(350);
    for (const [left, right] of forbiddenInitialContacts) {
      const contacts = await page.evaluate((id) => window.__scienceLabTest.getPhysicsDebug(id)?.contacts || [], left);
      assert.equal(contacts.includes(right), false,
        `${definition.id}: ${left} and ${right} start in separate apparatus positions: ${JSON.stringify(contacts)}`);
    }
  }
}

async function runSoundPlacementCausalityRegression(page, definition) {
  await openExperiment(page, definition);
  const regressionGestures = {};
  await performStep(page, definition, 0, regressionGestures);
  const struck = await sceneState(page, 'sound-vacuum');
  assert.equal(struck.vibrating, true, `sound causality: a physical strike starts fork vibration: ${JSON.stringify(struck)}`);
  assert.equal(struck.strikeCount, 1, 'sound causality: exactly one excitation follows the first physical strike');
  assert.equal(struck.toneEmissionCount, 1, 'sound causality: exactly one tuning-fork tone follows the first physical strike');
  assert.ok(struck.vibrationDurationMs >= 6000 && struck.vibrationDurationMs <= 12000,
    `sound causality: observation window is long enough for a pupil but remains finite: ${JSON.stringify(struck)}`);

  await page.waitForTimeout(struck.vibrationDurationMs + 250);
  const stopped = await sceneState(page, 'sound-vacuum');
  assert.equal(stopped.vibrating, false, `sound causality: the prior strike genuinely decays before placement: ${JSON.stringify(stopped)}`);
  assert.equal(stopped.waterWaveCount, 0, 'sound causality: no water wave exists before water contact');

  await performStep(page, definition, 1, regressionGestures);
  const placedStoppedFork = await sceneState(page, 'sound-vacuum');
  assert.equal(placedStoppedFork.lastWaterContactWasVibrating, false,
    `sound causality: the scene records that the placed fork had stopped: ${JSON.stringify(placedStoppedFork)}`);
  assert.equal(placedStoppedFork.vibrating, false, 'sound causality: putting a stopped fork in water does not restart vibration');
  assert.equal(placedStoppedFork.strikeCount, 1, 'sound causality: water placement does not count as a new strike');
  assert.equal(placedStoppedFork.toneEmissionCount, 1, 'sound causality: water placement emits no new tuning-fork tone');
  assert.equal(placedStoppedFork.waterWaveCount, 0, 'sound causality: a stopped fork creates no water waves');
  assert.equal(placedStoppedFork.waterWaveActive, false, 'sound causality: no ripple animation is active for a stopped fork');
  const screenshotPath = path.join(evidenceDirectory, '09-sound-vacuum-stopped-fork-water.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  return { struck, stopped, placedStoppedFork, screenshotPath };
}

function assertClipsLifted(electric) {
  assert.equal(electric.magneticModel, 'current-scaled-distance-force',
    'electric: the crane uses a current- and distance-dependent force model');
  assert.equal(electric.attachedClipCount, 6,
    `electric: all six dynamic clips reach the powered core through magnetic force: ${JSON.stringify(electric)}`);
  assert.ok(electric.clips.every((clip) => clip.pose?.dynamic === true),
    `electric: attracted clips remain dynamic rigid bodies: ${JSON.stringify(electric.clips)}`);
  assert.ok(Object.values(electric.magneticForceNewtons).every((force) => Number(force) > 0),
    `electric: every lifted clip has a solved magnetic force: ${JSON.stringify(electric.magneticForceNewtons)}`);
}

// Index of the nth step of a given verb, so inserting a recording step never
// silently moves a check onto the wrong action.
function stepAt(definition, type, occurrence = 0) {
  let seen = 0;
  for (const [index, step] of definition.steps.entries()) {
    if (step.action.type !== type) continue;
    if (seen === occurrence) return index;
    seen += 1;
  }
  return -1;
}

async function runSemanticChecks(page, definition, stepIndex, samples) {
  if (definition.id === 'density-column' && stepIndex === stepAt(definition, 'place', 0)) {
    await page.waitForTimeout(2600);
    samples.cork = await page.evaluate(() => window.__scienceLabTest.getPhysicsPose('cork'));
    assert.ok(samples.cork, 'density: cork remains a live rigid body after release');
    assert.ok(samples.cork.position.y >= 2.55 && samples.cork.position.y <= 3.35,
      `density: cork settles at the oil surface rather than hanging at the rim: ${JSON.stringify(samples.cork)}`);
    assert.ok(Math.abs(samples.cork.velocity.y) < .45,
      `density: cork is close to buoyant equilibrium before the observation is accepted: ${JSON.stringify(samples.cork)}`);
  }
  if (definition.id === 'density-column' && stepIndex === stepAt(definition, 'place', 1)) {
    await page.waitForTimeout(2300);
    samples.bead = await page.evaluate(() => window.__scienceLabTest.getPhysicsPose('bead'));
    samples.cork = await page.evaluate(() => window.__scienceLabTest.getPhysicsPose('cork'));
    assert.ok(samples.bead && samples.cork, 'density: both test solids expose physical poses');
    assert.ok(samples.cork.position.y > samples.bead.position.y + 1.2, `density: cork floats well above the sinking bead: ${JSON.stringify(samples)}`);
    assert.ok(samples.bead.position.y < 1.05, `density: glass bead reaches the column bottom: ${JSON.stringify(samples.bead)}`);
  }

  if (definition.id === 'eco-house' && stepIndex === 2) {
    const foam = await page.evaluate(() => window.__scienceLabTest.getPhysicsPose('foam-panel'));
    assert.ok(foam, 'eco-house: the spare foam panel remains registered on its rack');
    assert.equal(foam.dynamic, false, `eco-house: the spare panel stays parked until the pupil grabs it: ${JSON.stringify(foam)}`);
    assert.ok(foam.position.y > .5 && foam.position.y < 1.8,
      `eco-house: the spare panel cannot be ejected by an overlapping house collider: ${JSON.stringify(foam)}`);
  }
  if (definition.id === 'eco-house' && stepIndex === 4) {
    await page.waitForTimeout(5200);
    const eco = await sceneState(page, 'eco-house');
    assert.equal(eco.comparisonReady, true, `eco-house: both controlled material trials remain available together: ${JSON.stringify(eco)}`);
    assert.ok(Math.abs(eco.comparison.metalTemperatureC - 15) < .25,
      `eco-house: metal endpoint comes from the thermal model: ${JSON.stringify(eco.comparison)}`);
    assert.ok(Math.abs(eco.comparison.foamTemperatureC - 21) < .25,
      `eco-house: foam endpoint comes from the thermal model: ${JSON.stringify(eco.comparison)}`);
    assert.ok(eco.comparison.differenceC > 5.5,
      `eco-house: equal-duration comparison clearly separates the materials: ${JSON.stringify(eco.comparison)}`);
  }

  if (definition.id === 'heat-conduction' && stepIndex === stepAt(definition, 'tap', 0)) {
    await page.waitForTimeout(1400);
    const heat = await sceneState(page, 'heat-conduction');
    assert.equal(heat.heating, true, 'heat: the hot plate is on');
    assert.deepEqual(heat.inWater.sort(), ['spoon-copper', 'spoon-plastic', 'spoon-wood'],
      `heat: all three spoons share the same water: ${JSON.stringify(heat)}`);
    assert.ok(heat.waterTemperature > 24 && heat.waterTemperature < 29,
      `heat: water warms visibly instead of jumping to 82 °C: ${JSON.stringify(heat)}`);
    assert.equal(heat.firstToFall, null,
      `heat: butter remains visible during the gradual warm-up: ${JSON.stringify(heat)}`);
    assert.ok(heat.temperatures['spoon-copper'] > heat.temperatures['spoon-wood'] + .25,
      `heat: the metal handle starts warming fastest: ${JSON.stringify(heat.temperatures)}`);
  }
  if (definition.id === 'heat-conduction' && stepIndex === stepAt(definition, 'record', 0)) {
    await page.waitForFunction(() => {
      const state = window.__scienceLabTest?.getDebugStats?.()?.science;
      return state?.experiment === 'heat-conduction'
        && state.butterSlideProgress?.['spoon-copper'] >= .2
        && state.firstToFall == null;
    }, undefined, { timeout: 18000 });
    const softening = await sceneState(page, 'heat-conduction');
    assert.ok(softening.waterTemperature < 82,
      `heat: copper butter starts sliding while the displayed water temperature is still rising: ${JSON.stringify(softening)}`);
    await page.screenshot({ path: path.join(evidenceDirectory, '05-heat-conduction-butter-sliding.png'), fullPage: true });
    await page.waitForFunction(() => (
      window.__scienceLabTest?.getDebugStats?.()?.science?.firstToFall === 'spoon-copper'
    ), undefined, { timeout: 10000 });
    await page.waitForTimeout(180);
    await page.screenshot({ path: path.join(evidenceDirectory, '05-heat-conduction-butter-falling.png'), fullPage: true });
    const heat = await sceneState(page, 'heat-conduction');
    assert.equal(heat.firstToFall, 'spoon-copper',
      `heat: the copper spoon drops its butter first: ${JSON.stringify(heat)}`);
    assert.equal(heat.butterFallen.includes('spoon-wood'), false,
      `heat: the insulating handles keep their butter: ${JSON.stringify(heat)}`);
    // The whole point of the fair test: only the material differs, so the
    // insulators must still be near room temperature while copper is hot.
    assert.ok(heat.temperatures['spoon-copper'] > heat.temperatures['spoon-plastic'] + 18,
      `heat: conductor and insulator separate clearly: ${JSON.stringify(heat.temperatures)}`);
  }
  if (definition.id === 'light-reflection' && stepIndex === stepAt(definition, 'tap', 0)) {
    const light = await sceneState(page, 'light-reflection');
    assert.equal(light.torchOn, true, 'light: the torch tap turns the beam on');
    assert.equal(light.surface, 'mirror', 'light: the mirror is the surface under test');
    assert.equal(light.visibleReflectedRays, 1, `light: a mirror returns a single ray: ${JSON.stringify(light)}`);
    assert.equal(light.reflectionDeg, light.incidenceDeg,
      `light: the reflected angle equals the incident angle: ${JSON.stringify(light)}`);
  }
  if (definition.id === 'light-reflection' && stepIndex === stepAt(definition, 'adjust', 0)) {
    const light = await sceneState(page, 'light-reflection');
    assert.ok(light.incidenceDeg >= 52 && light.incidenceDeg <= 58,
      `light: the incident angle follows the student's adjustment: ${JSON.stringify(light)}`);
    assert.equal(light.reflectionDeg, light.incidenceDeg,
      'light: the two angles stay equal at every incidence');
  }
  if (definition.id === 'light-reflection' && stepIndex === stepAt(definition, 'place', 1)) {
    const light = await sceneState(page, 'light-reflection');
    assert.equal(light.scattered, true, `light: a crumpled surface scatters: ${JSON.stringify(light)}`);
    assert.equal(light.reflectionDeg, null, 'light: a scattering surface has no single reflected angle');
    assert.ok(light.visibleReflectedRays > 5,
      `light: scattering shows many rays, not one: ${JSON.stringify(light)}`);
    assert.ok(light.incidenceDeg >= 52 && light.incidenceDeg <= 58,
      'light: only the surface changed, the torch angle is held');
  }
  if (definition.id === 'force-coaster' && stepIndex === stepAt(definition, 'place', 0)) {
    samples.cartStart = await page.evaluate(() => window.__scienceLabTest.getPhysicsPose('cart'));
    assert.ok(samples.cartStart, 'forces: cart is a live rigid body at the ramp socket');
  }
  if (definition.id === 'force-coaster' && stepIndex === stepAt(definition, 'tap', 0)) {
    // A finished run returns the cart to the ramp and leaves the labelled stop
    // marker as the evidence, so the recorded travel — not the resting cart —
    // is what the trial is read from.
    await page.waitForTimeout(4200);
    const force = await sceneState(page, 'force-coaster');
    samples.smoothTravel = force.comparison.smoothTravelWorldUnits;
    assert.ok(samples.smoothTravel > 1.2, `forces: gravity moves the cart down the smooth run: ${JSON.stringify(force)}`);
  }
  if (definition.id === 'force-coaster' && stepIndex === stepAt(definition, 'place', 1)) {
    await page.waitForTimeout(700);
    const force = await sceneState(page, 'force-coaster');
    assert.equal(force.roughInstalled, true, `forces: the rough board is installed on the run-out: ${JSON.stringify(force)}`);
    const board = await page.evaluate(() => window.__scienceLabTest.getPhysicsPose('rough-track'));
    const ring = await page.evaluate(() => window.__scienceLabTest.getTargetWorldPose('runout'));
    // The board must actually reach the track the student aimed at rather than
    // stalling against a guard rail on the way in.
    assert.ok(Math.hypot(board.position.x - ring.position.x, board.position.z - ring.position.z) < .3,
      `forces: the released board is seated on the run-out: ${JSON.stringify({ board, ring })}`);
    samples.roughBoard = board;
  }
  if (definition.id === 'force-coaster' && stepIndex === stepAt(definition, 'tap', 1)) {
    await page.waitForTimeout(4200);
    const force = await sceneState(page, 'force-coaster');
    const roughTravel = force.comparison.roughTravelWorldUnits;
    samples.roughTravel = roughTravel;
    assert.ok(roughTravel > .45, `forces: rough run still moves under gravity: ${JSON.stringify(force.comparison)}`);
    assert.ok(roughTravel < samples.smoothTravel - .3,
      `forces: rough surface stops the cart sooner: ${JSON.stringify(force.comparison)}`);
    assert.equal(force.comparisonReady, true, `forces: both surface trials remain recorded after trial B: ${JSON.stringify(force)}`);
    assert.equal(force.comparison.roughStopsSooner, true,
      `forces: comparison is derived from the two rigid-body travel distances: ${JSON.stringify(force.comparison)}`);
  }

  if (definition.id === 'sound-vacuum') {
    const sound = await sceneState(page, 'sound-vacuum');
    assert.equal(sound.frequencyHz, 440, 'sound: the same tuning fork keeps its frequency');
    if (stepIndex === 0) {
      assert.equal(sound.strikeCount, 1, `sound: first collider strike is the only excitation: ${JSON.stringify(sound)}`);
      assert.equal(sound.manualStrikeCount, 1, 'sound: first excitation comes from the real mallet');
      assert.equal(sound.toneEmissionCount, 1, 'sound: first strike emits one tuning-fork tone');
      assert.equal(sound.vibrating, true, 'sound: first strike leaves the fork vibrating');
    }
    if (stepIndex === 1) {
      assert.equal(sound.lastWaterContactWasVibrating, true,
        `sound: golden path touches the water within the finite vibration window: ${JSON.stringify(sound)}`);
      assert.equal(sound.strikeCount, 1, 'sound: moving the fork to water is not a second excitation');
      assert.equal(sound.toneEmissionCount, 1, 'sound: moving the fork to water emits no new tuning-fork tone');
      assert.equal(sound.waterWaveCount, 1, 'sound: the still-vibrating fork transfers energy to water once');
      assert.equal(sound.waterWaveActive, true, 'sound: water ripples are visible after vibrating contact');
    }
    if (stepIndex === 2) {
      assert.equal(sound.strikeCount, 2, `sound: a second real mallet collision re-excites the fork in water: ${JSON.stringify(sound)}`);
      assert.equal(sound.manualStrikeCount, 2, 'sound: both open-air excitations come from the mallet');
      assert.equal(sound.waterWaveCount, 2, 'sound: the second physical strike creates a fresh water wave');
    }
    if (stepIndex === 3) {
      assert.equal(sound.jarSealed, true, 'sound: the fork is physically parked inside the bell jar');
      assert.equal(sound.strikeCount, 2, 'sound: placing the fork in the jar does not excite it');
      assert.equal(sound.toneEmissionCount, 2, 'sound: jar placement emits no new tuning-fork tone');
    }
    if (stepIndex === 4) {
      assert.ok(sound.pressureKPa >= 8 && sound.pressureKPa <= 12, `sound: pump gesture reaches low pressure: ${JSON.stringify(sound)}`);
      assert.ok(sound.soundDb < 32, `sound: model sound level falls at low pressure: ${JSON.stringify(sound)}`);
      assert.equal(sound.jarSealed, true, 'sound: low-pressure comparison occurs inside the sealed jar');
      assert.equal(sound.strikeCount, 2, 'sound: pumping the jar does not re-excite the fork');
    }
    if (stepIndex === 5) {
      assert.equal(sound.strikeCount, 3, `sound: sealed feed-through produces one controlled comparison strike: ${JSON.stringify(sound)}`);
      assert.equal(sound.sealedStrikeCount, 1, 'sound: final excitation comes from the sealed striker');
      assert.equal(sound.lastExcitationSource, 'sealed-striker', 'sound: semantic state identifies the sealed excitation source');
      assert.equal(sound.vibrating, true, 'sound: fork visibly vibrates after the sealed comparison strike');
      assert.ok(sound.soundDb < 32, 'sound: low-pressure sound level remains low after sealed excitation');
      assert.equal(sound.comparisonReady, true, `sound: open-air and low-pressure readings are retained together: ${JSON.stringify(sound)}`);
      assert.equal(sound.comparison.openAir.soundDb, 58, `sound: baseline comes from the pressure/sound model: ${JSON.stringify(sound.comparison)}`);
      assert.ok(sound.comparison.lowPressure.soundDb <= 20,
        `sound: low-pressure comparison comes from the same pressure/sound model: ${JSON.stringify(sound.comparison)}`);
      assert.equal(sound.comparison.differenceDb, 40,
        `sound: result preserves the modelled 40 dB contrast: ${JSON.stringify(sound.comparison)}`);
    }
  }

  if (definition.id === 'electric-crane' && stepIndex === stepAt(definition, 'connect', 3)) {
    const electric = await sceneState(page, 'electric-crane');
    assert.equal(electric.connectedEdges.length, 4, `electric: four student leads form the intended path: ${JSON.stringify(electric)}`);
    assert.equal(electric.powered, false, 'electric: an open switch keeps an otherwise continuous circuit unpowered');
    assert.equal(electric.circuit?.switches?.find((entry) => entry.id === 'main-switch')?.closed, false,
      'electric: circuit solver serialises the open switch in the otherwise wired path');
  }
  if (definition.id === 'electric-crane' && stepIndex === stepAt(definition, 'tap', 0)) {
    const electric = await sceneState(page, 'electric-crane');
    assert.equal(electric.switchClosed, true, 'electric: real switch tap closes the knife switch');
    assert.equal(electric.powered, true, `electric: closed, fully wired path is powered: ${JSON.stringify(electric)}`);
    assert.ok(electric.currentAmps > 0, `electric: continuous circuit carries current: ${JSON.stringify(electric)}`);
    // Current through the coil is the whole cause: closing the circuit lifts
    // the clips with no separate crane command.
    await page.waitForTimeout(1800);
    const lifted = await sceneState(page, 'electric-crane');
    assertClipsLifted(lifted);
  }
  if (definition.id === 'electric-crane' && stepIndex === stepAt(definition, 'tap', 1)) {
    await page.waitForTimeout(1100);
    const electric = await sceneState(page, 'electric-crane');
    assert.equal(electric.powered, false, 'electric: final real switch tap breaks continuity again');
    assert.equal(electric.attachedClipCount, 0, 'electric: breaking the circuit releases every magnetic attachment');
    assert.ok(electric.clips.every((clip) => clip.pose?.dynamic === true),
      `electric: released clips fall under rigid-body gravity: ${JSON.stringify(electric.clips)}`);
  }
  if (definition.id === 'light-lab' && stepIndex === 2) {
    const light = await sceneState(page, 'light-lab');
    assert.equal(light.torchOn, true, 'light: torch remains on');
    assert.equal(light.mirrorInstalled, true, 'light: mirror is mounted in its physical yoke');
    assert.ok(light.mirrorAngle >= 32 && light.mirrorAngle <= 38, `light: pointer adjustment reaches the evidence angle: ${JSON.stringify(light)}`);
    assert.equal(light.reflectionHitsScreen, true, `light: raycast reflection reaches the fixed screen: ${JSON.stringify(light)}`);
  }
  if (definition.id === 'light-lab' && stepIndex === 4) {
    const light = await sceneState(page, 'light-lab');
    assert.equal(light.prismInstalled, true, 'light: prism is seated in the beam zone');
    assert.equal(light.spectrumVisible, true, 'light: adjusted prism exposes the spectrum');
    assert.ok(light.spectrumHitCount >= 3, `light: several wavelength rays hit the screen: ${JSON.stringify(light)}`);
  }

  if (definition.id === 'earth-moon-sun' && stepIndex === 1) {
    const space = await sceneState(page, 'earth-moon-sun');
    const state = await page.evaluate(() => window.__scienceLabTest.getState());
    assert.ok(state.variables['earth-rotation'] >= 170 && state.variables['earth-rotation'] <= 190,
      `space: pointer rotation turns Earth about half a turn: ${JSON.stringify({ state, space })}`);
  }
  if (definition.id === 'earth-moon-sun' && stepIndex === 2) {
    const space = await sceneState(page, 'earth-moon-sun');
    assert.ok(space.orbitAngle >= 85 && space.orbitAngle <= 95, `space: Moon reaches quadrature: ${JSON.stringify(space)}`);
    assert.ok(space.phaseFraction > .4 && space.phaseFraction < .6, `space: quadrature produces a half-lit phase: ${JSON.stringify(space)}`);
  }
  if (definition.id === 'earth-moon-sun' && stepIndex === 4) {
    const space = await sceneState(page, 'earth-moon-sun');
    assert.ok(space.orbitAngle >= 175 && space.orbitAngle <= 185, `space: Moon remains near the full-moon position: ${JSON.stringify(space)}`);
    assert.ok(space.orbitTilt >= 0 && space.orbitTilt <= 1, `space: orbit tilt reaches the node: ${JSON.stringify(space)}`);
    assert.equal(space.eclipse, true, `space: aligned Sun-Earth-Moon state produces eclipse shading: ${JSON.stringify(space)}`);
  }
}

let browser;
try {
  await waitForServer();
  const installedBrowser = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean).find(existsSync);
  browser = await chromium.launch({ headless: true, ...(installedBrowser ? { executablePath: installedBrowser } : {}) });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const browserErrors = [];
  const failedHttp = [];
  const externalRequests = [];
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) failedHttp.push(`${response.status()} ${response.url()}`); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    // ImageBitmapLoader exposes images embedded in our same-origin GLB as
    // blob:http://127.0.0.1/... requests. Resolve the inherited blob origin
    // before deciding whether the asset is third-party.
    const sourceUrl = url.protocol === 'blob:' ? new URL(url.pathname) : url;
    if (!['127.0.0.1', 'localhost'].includes(sourceUrl.hostname)) externalRequests.push(request.url());
  });
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch {}
    window.__scienceLabAccessibleClicks = 0;
    document.addEventListener('click', (event) => {
      if (event.target?.closest?.('#accessibleActionButton')) window.__scienceLabAccessibleClicks += 1;
    }, true);
  });

  const login = await page.request.post(`${base}/api/auth/login`, { data: { studentId: 'P001', password: '123456' } });
  assert.equal(login.status(), 200, 'physics fixture student can sign in');
  assert.equal((await login.json()).success, true, 'physics fixture credentials are accepted');

  const gestureCounts = {};
  const semanticSamples = {};
  const experimentFailures = [];
  const definitionsToRun = onlyExperiments.size
    ? experiments.filter((definition) => onlyExperiments.has(definition.id))
    : experiments;
  assert.ok(definitionsToRun.length > 0, `SCIENCE_LAB_ONLY did not match an experiment: ${[...onlyExperiments].join(',')}`);
  for (const definition of definitionsToRun) {
    try {
      await openExperiment(page, definition);
      if (process.env.SCIENCE_LAB_CAPTURE_INITIAL === '1') {
        const initialScreenshotPath = path.join(
          evidenceDirectory,
          `${String(definition.number).padStart(2, '0')}-${definition.id}-initial.png`,
        );
        await page.screenshot({ path: initialScreenshotPath, fullPage: true });
      }
      if (process.env.SCIENCE_LAB_CAPTURE_ORBIT === '1'
        && ['density-column', 'heat-conduction'].includes(definition.id)) {
        const originalViewport = page.viewportSize();
        await page.setViewportSize({ width: 980, height: 769 });
        await page.waitForTimeout(450);
        await page.screenshot({
          path: path.join(evidenceDirectory, `${String(definition.number).padStart(2, '0')}-${definition.id}-nameplates-980x769.png`),
          fullPage: true,
        });
        const canvas = await page.locator('#labCanvas').boundingBox();
        assert.ok(canvas, 'heat-conduction canvas is visible for orbit-label review');
        const start = { x: canvas.x + canvas.width * .84, y: canvas.y + canvas.height * .56 };
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x - canvas.width * .22, start.y, { steps: 24 });
        await page.mouse.up();
        await page.waitForTimeout(450);
        await page.screenshot({
          path: path.join(evidenceDirectory, `${String(definition.number).padStart(2, '0')}-${definition.id}-nameplates-orbited.png`),
          fullPage: true,
        });
        await page.locator('#cameraResetButton').click();
        await page.setViewportSize(originalViewport);
        await page.waitForTimeout(450);
      }
      const samples = {};
      for (let stepIndex = 0; stepIndex < definition.steps.length; stepIndex += 1) {
        await performStep(page, definition, stepIndex, gestureCounts);
        await runSemanticChecks(page, definition, stepIndex, samples);
      }
      await page.locator('#stageScreen:not([hidden])').waitFor({ timeout: 8500 });
      await advanceStageTo(page, 'analysis');
      const recordedRows = await page.locator('#analysisTableBody tr').count();
      const expectedRows = definition.steps.filter((step) => step.action.type === 'record').length;
      assert.equal(recordedRows, expectedRows,
        `${definition.id}: every recorded reading reaches the analysis table`);
      await advanceStageTo(page, 'reflection');
      await page.locator(`[data-reflection="${definition.analysis.reflection.answer}"]`).click();
      await page.locator('#stageNext').click();
      await page.locator('#resultDialog[open]').waitFor({ timeout: 8500 });
      assert.equal(await page.evaluate(() => window.__scienceLabAccessibleClicks || 0), 0,
        `${definition.id}: all steps were completed through real gestures, not the alternate action`);
      const state = await page.evaluate(() => window.__scienceLabTest.getState());
      assert.equal(state.complete, true, `${definition.id}: all physical steps complete`);
      assert.equal(state.currentStep, definition.steps.length, `${definition.id}: every step was traversed`);
      assert.equal(state.actionHistory.filter((entry) => entry.accepted).length, definition.steps.length,
        `${definition.id}: one accepted physical gesture exists for every step`);
      assert.equal(state.actionHistory.some((entry) => !entry.accepted), false,
        `${definition.id}: physical golden path contains no rejected shortcut attempts`);
      const screenshotPath = path.join(evidenceDirectory, `${String(definition.number).padStart(2, '0')}-${definition.id}-complete.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      semanticSamples[definition.id] = samples;
      console.log(`✓ ${definition.id}: ${definition.steps.length} real gestures`);
    } catch (error) {
      const screenshotPath = path.join(evidenceDirectory, `${String(definition.number).padStart(2, '0')}-${definition.id}-failed.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
      experimentFailures.push(new Error(`${definition.id}: ${error.message}\nEvidence: ${screenshotPath}`, { cause: error }));
      console.error(`✗ ${definition.id}: ${error.message.split('\n')[0]}`);
    }
  }

  if (!onlyExperiments.size) {
    for (const verb of ['place', 'pour', 'connect', 'tap', 'adjust', 'record']) {
      assert.ok(gestureCounts[verb] > 0, `live runner exercises a real ${verb} gesture`);
    }
  }
  assert.deepEqual(externalRequests, [], 'physics playtest uses no third-party runtime assets');
  assert.deepEqual(failedHttp, [], `physics playtest has no HTTP failures: ${JSON.stringify(failedHttp)}`);
  assert.deepEqual(browserErrors.filter((message) => !message.startsWith('Failed to load resource:')), [],
    `physics playtest has no browser errors: ${JSON.stringify(browserErrors)}`);

  if (experimentFailures.length) {
    throw new AggregateError(experimentFailures,
      `Science Lab physics live test found ${experimentFailures.length} failing experiment(s). See ${evidenceDirectory}.`);
  }

  console.log(`Science Lab physics live test passed: ${definitionsToRun.length} experiments, ${Object.values(gestureCounts).reduce((sum, count) => sum + count, 0)} real gestures.`);
  console.log(`Gesture coverage: ${JSON.stringify(gestureCounts)}`);
  console.log(`Visual evidence: ${evidenceDirectory}`);
  console.log(`Physics samples: ${JSON.stringify(semanticSamples)}`);
} finally {
  if (browser) await browser.close();
  serverRecord.child.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => serverRecord.child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  await rm(temporaryDirectory, { recursive: true, force: true });
}
