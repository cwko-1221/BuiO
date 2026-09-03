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

// The inquiry phases run as full-screen slides. Step through them until the
// wanted slide is on screen.
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

async function passObservation(page) {
  await page.locator('#stageScreen:not([hidden])').waitFor();
  await advanceStageTo(page, 'hypothesis');
}

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'buio-science-lab-'));
const databaseFile = path.join(temporaryDirectory, 'fixture.json');
const port = Number(process.env.SCIENCE_LAB_PORT || 3161);
const base = `http://127.0.0.1:${port}`;
const qaDirectory = path.resolve('tmp', 'science-lab-qa');
await mkdir(qaDirectory, { recursive: true });

await writeFile(databaseFile, JSON.stringify({
  users: [{
    studentid: 'S001', name: '科學測試生', role: 'student', passwordhash: bcrypt.hashSync('123456', 4),
    classname: 'P4', classno: 1, chinesegroup: '', englishgroup: '', mathgroup: '', language: 'zh-HK',
  }],
  studentStats: [], questionLogs: [], _logId: 0,
}, null, 2));

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve('.'),
  env: {
    ...process.env,
    PORT: String(port), BUIO_JSON_DB_FILE: databaseFile, SUPABASE_DB_URL: '', NODE_ENV: 'development',
    GOOGLE_API_KEY: '', GOOGLE_CREDENTIALS_JSON: '', GOOGLE_APPLICATION_CREDENTIALS: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk) => { serverOutput += chunk; });
server.stderr.on('data', (chunk) => { serverOutput += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Science Lab fixture server did not start:\n${serverOutput}`);
}

async function openExperiment(page, definition) {
  await page.goto(`${base}/science-lab/preview#${definition.id}`, { waitUntil: 'networkidle' });
  await passObservation(page);
  await page.locator(`[data-prediction="${definition.prediction.answer}"]`).click();
  await page.locator('#stageNext').click();
  await page.locator('#stageScreen').waitFor({ state: 'hidden' });
  await page.waitForFunction((id) => window.__scienceLabTest?.getState()?.experimentId === id, definition.id);
  await page.waitForTimeout(120);
  assert.equal(await page.locator('#missionPanel.collapsed').count(), 1,
    `${definition.id}: the full task card starts collapsed so it does not cover the apparatus`);
  assert.equal(await page.locator('#missionPanelToggle').getAttribute('aria-expanded'), 'false',
    `${definition.id}: the compact task tab reports its collapsed state`);
}

const expectedDragLabels = new Map([
  ['honey', '蜂蜜'],
  ['coil', '漆包線圈'],
  ['battery-positive', '電池正極'],
  ['switch-out', '開關輸出端'],
]);

async function pickableEntityPoint(page, subject) {
  const centre = await page.evaluate((id) => window.__scienceLabTest.getEntityPoint(id), subject);
  assert.ok(centre, `missing screen point for ${subject}`);
  const candidates = [centre];
  for (const radius of [10, 18, 28, 40, 54, 72]) {
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 2;
      candidates.push({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius });
    }
  }
  const expectedLabel = expectedDragLabels.get(subject);
  for (const candidate of candidates) {
    await page.mouse.move(candidate.x, candidate.y);
    await page.waitForTimeout(3);
    const hover = await page.locator('#interactionLabel').evaluate((element) => ({
      visible: !element.hidden && getComputedStyle(element).display !== 'none',
      text: element.textContent?.trim() || '',
    }));
    if (hover.visible && (!expectedLabel || hover.text === expectedLabel)) return candidate;
  }
  throw new Error(`${subject}: no visible, pickable mesh was found near its projected centre`);
}

async function dragBetween(page, subject, target) {
  const points = {
    from: await pickableEntityPoint(page, subject),
    to: await page.evaluate((targetId) => window.__scienceLabTest.getTargetPoint(targetId), target),
  };
  assert.ok(points.from && points.to, `missing screen points for ${subject} -> ${target}`);
  await page.mouse.move(points.from.x, points.from.y);
  await page.mouse.down();
  await page.mouse.move(points.to.x, points.to.y, { steps: 20 });
  await page.mouse.up();
  return points;
}

async function tapEntity(page, subject) {
  const point = await page.evaluate((id) => window.__scienceLabTest.getEntityPoint(id), subject);
  assert.ok(point, `missing screen point for ${subject}`);
  await page.mouse.click(point.x, point.y);
}

async function revealCompletion(page, { lingerMs = 0 } = {}) {
  await page.locator('#phenomenonStage').waitFor({ state: 'visible', timeout: 5000 });
  assert.equal(await page.locator('#resultDialog[open]').count(), 0,
    'the final apparatus remains visible before the explanation dialog opens');
  if (lingerMs > 0) {
    await page.waitForTimeout(lingerMs);
    assert.equal(await page.locator('#phenomenonStage').isVisible(), true,
      'the observation stage remains visible long enough to inspect the result');
    assert.equal(await page.locator('#resultDialog[open]').count(), 0,
      'the explanation does not cover the result during the observation interval');
  }
  await page.locator('#phenomenonExplainButton').click();
  await passAnalysis(page);
  await page.locator('#resultDialog[open]').waitFor({ timeout: 5000 });
}

// Analysis and reflection sit between the observed result and the explanation:
// the explanation is not reachable until a reflection answer is given.
async function passAnalysis(page) {
  await page.locator('#stageScreen:not([hidden])').waitFor({ timeout: 6000 });
  await advanceStageTo(page, 'reflection');
  assert.equal(await page.locator('#stageNext').isDisabled(), true,
    'the explanation stays locked until the student answers the reflection');
  await page.locator('[data-reflection="0"]').click();
  await page.locator('#stageNext').click();
}

async function clickAccessibleAction(page) {
  const before = await page.evaluate(() => window.__scienceLabTest.getState()?.currentStep);
  for (let attempt = 0; attempt < 35; attempt += 1) {
    if (await page.locator('#missionPanel.collapsed').count()) {
      await page.locator('#missionPanelToggle').click();
    }
    await page.locator('#accessibleActionButton').click();
    await page.waitForTimeout(75);
    const state = await page.evaluate(() => window.__scienceLabTest.getState());
    if (state?.complete || state?.currentStep > before) return;
  }
  throw new Error('accessible action did not advance after the apparatus return interval');
}

async function completeWithAccessibleControls(page, options = {}) {
  while (!(await page.evaluate(() => window.__scienceLabTest.getState()?.complete))) {
    const before = await page.evaluate(() => window.__scienceLabTest.getState()?.currentStep);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await clickAccessibleAction(page);
      await page.waitForTimeout(80);
      if (await page.evaluate((previous) => window.__scienceLabTest.getState()?.currentStep > previous, before)) break;
    }
    await page.waitForFunction((previous) => window.__scienceLabTest.getState()?.currentStep > previous, before, { timeout: 5000 });
  }
  await revealCompletion(page, options);
}

let browser;
try {
  await waitForServer();

  const unauthenticated = await fetch(`${base}/science-lab`, { redirect: 'manual' });
  assert.equal(unauthenticated.status, 302, 'student HTML is protected by the platform session');
  assert.equal(unauthenticated.headers.get('location'), '/', 'unauthenticated students return to the portal');
  const installedBrowser = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ].filter(Boolean).find(existsSync);
  browser = await chromium.launch({ headless: true, ...(installedBrowser ? { executablePath: installedBrowser } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const browserErrors = [];
  const failedHttp = [];
  const externalRequests = [];
  page.on('console', (message) => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('response', (response) => { if (response.status() >= 400) failedHttp.push(`${response.status()} ${response.url()}`); });
  page.on('request', (request) => {
    const url = new URL(request.url());
    // Textures packed inside the local GLB are decoded through inherited-origin
    // blob URLs by ImageBitmapLoader; they remain first-party assets.
    const sourceUrl = url.protocol === 'blob:' ? new URL(url.pathname) : url;
    if (!['127.0.0.1', 'localhost'].includes(sourceUrl.hostname)) externalRequests.push(request.url());
  });

  const loginResponse = await page.request.post(`${base}/api/auth/login`, {
    data: { studentId: 'S001', password: '123456' },
  });
  assert.equal(loginResponse.status(), 200, 'fixture student can sign in');
  assert.equal((await loginResponse.json()).success, true, 'login endpoint accepts the fixture student');
  const protectedPage = await page.request.get(`${base}/science-lab`);
  assert.equal(protectedPage.status(), 200, 'signed-in student receives the protected lab');
  assert.match(protectedPage.headers()['cache-control'] || '', /no-store/, 'student HTML is never cached across accounts');
  assert.match(protectedPage.headers()['content-security-policy'] || '', /default-src 'self'/, 'student HTML carries the module content security policy');
  assert.equal(protectedPage.headers()['x-content-type-options'], 'nosniff', 'student HTML disables MIME sniffing');

  await page.goto(base, { waitUntil: 'networkidle' });
  await page.locator('[data-open-module="science-lab"]').waitFor();
  await Promise.all([
    page.waitForURL(`${base}/science-lab`),
    page.locator('[data-open-module="science-lab"]').click(),
  ]);
  await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'));
  assert.equal(await page.locator('#catalogScreen').isVisible(), true, 'portal card opens the signed-in student catalog');

  await page.goto(`${base}/science-lab/preview`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'));
  assert.equal(await page.locator('[data-experiment]').count(), 6, 'catalog exposes exactly the six selected investigations');
  assert.equal(await page.locator('#catalogScreen').isVisible(), true, 'catalog is visible after boot');
  const desktopLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    canvases: document.querySelectorAll('canvas').length,
  }));
  assert.ok(desktopLayout.scrollWidth <= desktopLayout.clientWidth, `desktop overflow: ${JSON.stringify(desktopLayout)}`);
  assert.equal(desktopLayout.canvases, 1, 'one shared WebGL canvas renders the catalog and labs');

  // Pour / place: complete the entire density experiment, beginning with an
  // actual pointer drag into the projected receiving cylinder.
  const density = experiments.find((item) => item.id === 'density-column');
  await openExperiment(page, density);
  const densityPointer = await dragBetween(page, 'honey', 'column');
  await page.waitForTimeout(350);
  const densityAfterDrag = await page.evaluate(() => window.__scienceLabTest.getState());
  const densityHitDebug = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return { tag: element?.tagName, id: element?.id, classes: element?.className, canvasRect: document.querySelector('#labCanvas')?.getBoundingClientRect().toJSON() };
  }, densityPointer.from);
  const densityRendererDebug = await page.evaluate(() => window.__scienceLabTest.getDebugStats());
  assert.equal(densityAfterDrag.currentStep, 1, `real pour gesture was not accepted: ${JSON.stringify({ history: densityAfterDrag.actionHistory, densityPointer, densityHitDebug, densityRendererDebug })}`);
  const interactionLabelSize = await page.locator('#interactionLabel').evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
  assert.ok(interactionLabelSize >= 16, `apparatus labels must be readable (actual ${interactionLabelSize}px)`);
  await completeWithAccessibleControls(page, { lingerMs: 1200 });
  assert.equal((await page.locator('#resultStars').textContent()).trim(), '★★★', 'independent completion receives three stars');
  await page.screenshot({ path: path.join(qaDirectory, 'density-result-live.png'), fullPage: true });

  // Place and connect: verify that the coil is physically mounted before the
  // circuit can be completed, then exercise both newly modelled coil ports.
  const electric = experiments.find((item) => item.id === 'electric-crane');
  await openExperiment(page, electric);
  await dragBetween(page, 'coil', 'iron-core');
  await page.waitForFunction(() => window.__scienceLabTest.getState().currentStep === 1);
  await dragBetween(page, 'battery-positive', 'switch-in');
  await page.waitForFunction(() => window.__scienceLabTest.getState().currentStep === 2);
  await dragBetween(page, 'switch-out', 'coil-in');
  await page.waitForFunction(() => window.__scienceLabTest.getState().currentStep === 3);
  await completeWithAccessibleControls(page);

  // Load and finish every other scene; this catches missing apparatus IDs,
  // builder exceptions, malformed results and broken persistence together.
  const alreadyCompleted = new Set(['density-column', 'electric-crane']);
  for (const definition of experiments.filter((item) => !alreadyCompleted.has(item.id))) {
    await openExperiment(page, definition);
    await completeWithAccessibleControls(page);
    if (definition.result.comparison) {
      assert.equal(await page.locator('#resultComparison').isVisible(), true,
        `${definition.id}: the explanation page exposes its controlled comparison`);
      assert.equal((await page.locator('#comparisonLeftValue').textContent()).trim(), definition.result.comparison.leftValue,
        `${definition.id}: left comparison result is shown`);
      assert.equal((await page.locator('#comparisonRightValue').textContent()).trim(), definition.result.comparison.rightValue,
        `${definition.id}: right comparison result is shown`);
    }
  }

  await page.locator('#nextExperimentButton').click();
  await passObservation(page);
  assert.equal(await page.locator('#stageNext').isDisabled(), true,
    'the experiment cannot start before a hypothesis is chosen');
  const nextDefinition = experiments[(experiments.length > 0 ? 0 : -1)];
  await page.locator(`[data-prediction="${nextDefinition.prediction.answer}"]`).click();
  await page.locator('#stageNext').click();
  await page.locator('#stageScreen').waitFor({ state: 'hidden' });
  await page.locator('#homeButton').click();
  await page.locator('#catalogScreen').waitFor({ state: 'visible' });
  assert.match((await page.locator('#progressCount').textContent()).trim(), /^6 \/ 6$/, 'catalog shows all selected investigations completed');
  assert.equal(await page.locator('.experiment-card.completed').count(), 6, 'all selected catalog cards retain completion state');

  await page.locator('#notebookButton').click();
  await page.locator('#notebookDialog[open]').waitFor();
  assert.equal(await page.locator('[data-notebook-id]').count(), 6, 'science notebook contains every selected investigation');
  assert.equal(await page.locator('.notebook-entry.locked').count(), 0, 'completed entries are all unlocked');
  await page.keyboard.press('Escape');

  await page.locator('#settingsButton').click();
  await page.locator('#settingsDialog[open]').waitFor();
  await page.locator('#motionToggle').check();
  await page.locator('#contrastToggle').check();
  await page.locator('#qualitySelect').selectOption('low');
  await page.keyboard.press('Escape');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'));
  assert.equal(await page.locator('#motionToggle').isChecked(), true, 'reduced-motion setting persists');
  assert.equal(await page.locator('#contrastToggle').isChecked(), true, 'high-contrast setting persists');
  assert.equal(await page.locator('#qualitySelect').inputValue(), 'low', 'quality setting persists');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'));
  const mobileLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    minimumCardHeight: Math.min(...[...document.querySelectorAll('.experiment-card')].map((card) => card.getBoundingClientRect().height)),
  }));
  assert.ok(mobileLayout.scrollWidth <= mobileLayout.clientWidth, `mobile overflow: ${JSON.stringify(mobileLayout)}`);
  assert.ok(mobileLayout.minimumCardHeight >= 180, `mobile cards are too compressed: ${JSON.stringify(mobileLayout)}`);
  await page.screenshot({ path: path.join(qaDirectory, 'catalog-mobile-live.png'), fullPage: true });

  // Portrait phones must expose the actual 3D apparatus, not merely the
  // keyboard-equivalent control beneath an off-screen scene.
  await openExperiment(page, electric);
  const portraitPoints = await page.evaluate(() => {
    const canvas = document.querySelector('#labCanvas');
    const inspect = (point) => ({
      ...point,
      topElement: point ? document.elementFromPoint(point.x, point.y)?.id || document.elementFromPoint(point.x, point.y)?.tagName : null,
    });
    return {
      canvas: canvas.getBoundingClientRect().toJSON(),
      subject: inspect(window.__scienceLabTest.getEntityPoint('coil')),
      target: inspect(window.__scienceLabTest.getTargetPoint('iron-core')),
    };
  });
  for (const [name, point] of Object.entries({ subject: portraitPoints.subject, target: portraitPoints.target })) {
    assert.ok(point.x >= portraitPoints.canvas.left && point.x <= portraitPoints.canvas.right, `${name} is outside the portrait canvas: ${JSON.stringify(portraitPoints)}`);
    assert.ok(point.y >= portraitPoints.canvas.top && point.y <= portraitPoints.canvas.bottom, `${name} is outside the portrait canvas: ${JSON.stringify(portraitPoints)}`);
    assert.equal(point.topElement, 'labCanvas', `${name} is covered by the portrait HUD: ${JSON.stringify(portraitPoints)}`);
  }
  await dragBetween(page, 'coil', 'iron-core');
  try {
    await page.waitForFunction(() => window.__scienceLabTest.getState().currentStep === 1, null, { timeout: 8000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      state: window.__scienceLabTest.getState(),
      debug: window.__scienceLabTest.getDebugStats(),
       coilPose: window.__scienceLabTest.getPhysicsPose('coil'),
       coil: window.__scienceLabTest.getEntityPoint('coil'),
       core: window.__scienceLabTest.getTargetPoint('iron-core'),
    }));
    throw new Error(`portrait physical drag failed: ${JSON.stringify(diagnostic)}\n${error.message}`);
  }
  await page.screenshot({ path: path.join(qaDirectory, 'lab-portrait-live.png'), fullPage: true });

  // Short landscape phones retain a usable playfield and non-overlapping HUD.
  await page.setViewportSize({ width: 667, height: 375 });
  await page.waitForTimeout(250);
  const landscapeLayout = await page.evaluate(() => {
    const mission = document.querySelector('#missionPanel').getBoundingClientRect();
    const title = document.querySelector('#labTitle').getBoundingClientRect();
    const views = document.querySelector('.view-controls').getBoundingClientRect();
    const subject = window.__scienceLabTest.getEntityPoint('battery-positive');
    const target = window.__scienceLabTest.getTargetPoint('switch-in');
    const pointInfo = (point) => ({ ...point, topElement: document.elementFromPoint(point.x, point.y)?.id || document.elementFromPoint(point.x, point.y)?.tagName });
    return { mission: mission.toJSON(), title: title.toJSON(), views: views.toJSON(), subject: pointInfo(subject), target: pointInfo(target) };
  });
  assert.ok(landscapeLayout.mission.height <= 155, `landscape mission panel obscures the playfield: ${JSON.stringify(landscapeLayout)}`);
  const overlaps = !(
    landscapeLayout.views.right <= landscapeLayout.title.left
    || landscapeLayout.views.left >= landscapeLayout.title.right
    || landscapeLayout.views.bottom <= landscapeLayout.title.top
    || landscapeLayout.views.top >= landscapeLayout.title.bottom
  );
  assert.equal(overlaps, false, `landscape camera controls overlap the experiment title: ${JSON.stringify(landscapeLayout)}`);
  assert.equal(landscapeLayout.subject.topElement, 'labCanvas', `landscape apparatus is covered: ${JSON.stringify(landscapeLayout)}`);
  assert.equal(landscapeLayout.target.topElement, 'labCanvas', `landscape target is covered: ${JSON.stringify(landscapeLayout)}`);
  await dragBetween(page, 'battery-positive', 'switch-in');
  try {
    await page.waitForFunction(() => window.__scienceLabTest.getState().currentStep === 2, null, { timeout: 8000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      state: window.__scienceLabTest.getState(),
      debug: window.__scienceLabTest.getDebugStats(),
       pose: window.__scienceLabTest.getPhysicsPose('battery-positive'),
       physical: window.__scienceLabTest.getPhysicsDebug('battery-positive', 'switch-in'),
    }));
    throw new Error(`landscape physical drag failed: ${JSON.stringify(diagnostic)}\n${error.message}`);
  }
  await page.screenshot({ path: path.join(qaDirectory, 'lab-landscape-live.png'), fullPage: true });

  // Repeated entry must keep the disposable world and shared environment stable.
  await page.setViewportSize({ width: 1440, height: 900 });
  await openExperiment(page, density);
  const firstSceneStats = await page.evaluate(() => window.__scienceLabTest.getDebugStats());
  await page.locator('#homeButton').click();
  await page.locator('#catalogScreen').waitFor({ state: 'visible' });
  const catalogStats = await page.evaluate(() => window.__scienceLabTest.getDebugStats());
  await openExperiment(page, density);
  const secondSceneStats = await page.evaluate(() => window.__scienceLabTest.getDebugStats());
  assert.equal(secondSceneStats.worldChildren, firstSceneStats.worldChildren, 'scene effects do not accumulate across visits');
  assert.equal(secondSceneStats.environmentChildren, firstSceneStats.environmentChildren, 'shared environment remains stable across visits');
  assert.equal(catalogStats.background, '#0b5260', 'catalog restores its background after a lab scene');
  await completeWithAccessibleControls(page);
  await page.evaluate(() => document.querySelector('#resultDialog')?.close());
  await page.screenshot({ path: path.join(qaDirectory, 'density-repeat-live.png'), fullPage: true });

  // Devices with WebGL disabled still receive a generated cartoon scene and
  // can finish the same scientific sequence with the explicit action control.
  const fallbackContext = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const fallbackPage = await fallbackContext.newPage();
  await fallbackPage.addInitScript(() => {
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function getContext(type, ...args) {
      if (String(type).startsWith('webgl')) return null;
      return nativeGetContext.call(this, type, ...args);
    };
  });
  const fallbackDefinition = experiments.find((item) => item.id === 'water-filter');
  await fallbackPage.goto(`${base}/science-lab/preview#${fallbackDefinition.id}`, { waitUntil: 'networkidle' });
  await fallbackPage.waitForFunction(() => document.body.classList.contains('no-webgl'));
  await passObservation(fallbackPage);
  await fallbackPage.locator(`[data-prediction="${fallbackDefinition.prediction.answer}"]`).click();
  await fallbackPage.locator('#stageNext').click();
  await fallbackPage.locator('#stageScreen').waitFor({ state: 'hidden' });
  for (let index = 0; index < fallbackDefinition.steps.length; index += 1) {
    await clickAccessibleAction(fallbackPage);
  }
  await revealCompletion(fallbackPage);
  assert.equal(await fallbackPage.locator('.fallback-stage').count(), 1, 'non-WebGL fallback keeps the investigation usable');
  await fallbackContext.close();

  const unexpectedHttp = failedHttp.filter((item) => !(
    item.includes('401') && item.endsWith('/api/auth/me')
  ));
  assert.deepEqual(unexpectedHttp, [], `unexpected HTTP failures: ${JSON.stringify(unexpectedHttp)}`);
  assert.deepEqual(browserErrors.filter((message) => !message.startsWith('Failed to load resource:')), [], `browser errors: ${JSON.stringify(browserErrors)}`);
  assert.deepEqual(externalRequests, [], 'the module does not depend on third-party network assets');

  console.log('Science Lab live drag, connect, tap, adjust, persistence, auth and responsive tests passed.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  await rm(temporaryDirectory, { recursive: true, force: true });
}
