#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.SCIENCE_LAB_BASE || 'http://127.0.0.1:3000';
const expectedHash = process.env.SCIENCE_LAB_HASH;
assert.ok(expectedHash, 'SCIENCE_LAB_HASH is required');

const active = ['transmission', 'density-column', 'water-filter', 'electric-crane', 'force-coaster'];
const removed = ['lab-safety', 'root-viewer', 'food-web', 'eco-house', 'light-lab', 'sound-vacuum', 'earth-moon-sun'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 667, height: 375 },
];
const outputDirectory = path.resolve('tmp', 'spatial-audit', 'final-five-release');
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
});

const report = {
  generatedAt: new Date().toISOString(),
  base,
  expectedHash,
  active,
  removed,
  responsive: [],
  activeRoutes: [],
  removedRoutes: [],
  cycle: [],
  legacy: null,
  errors: [],
};

function observe(page, label) {
  page.on('pageerror', (error) => report.errors.push({ label, type: 'pageerror', message: error.message }));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      report.errors.push({ label, type: 'console', message: message.text() });
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) report.errors.push({ label, type: 'http', status: response.status(), url: response.url() });
  });
}

async function waitForBoot(page) {
  await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'), null, { timeout: 20000 });
  await page.waitForTimeout(700);
}

async function servedResources(page) {
  return page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name));
}

function assertFinalHash(resources, label) {
  const appScripts = resources.filter((url) => /\/science-lab\/assets\/index-[^/]+\.js(?:\?|$)/.test(url));
  assert.equal(appScripts.length, 1, `${label}: expected one application bundle, got ${JSON.stringify(appScripts)}`);
  assert.ok(appScripts[0].endsWith(`/science-lab/assets/${expectedHash}`), `${label}: wrong build ${appScripts[0]}`);
}

async function inspectCatalog(page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-experiment]')];
    const bounds = cards.map((card) => ({ id: card.dataset.experiment, ...card.getBoundingClientRect().toJSON() }));
    return {
      cards: cards.map((card) => card.dataset.experiment),
      progress: document.querySelector('#progressCount')?.textContent?.trim(),
      catalogVisible: !document.querySelector('#catalogScreen')?.hidden,
      labHidden: document.querySelector('#labScreen')?.hidden,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      bounds,
    };
  });
}

for (const viewport of viewports) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  observe(page, `responsive:${viewport.name}`);
  await page.goto(`${base}/science-lab/preview?five-release=${Date.now()}-${viewport.name}`, { waitUntil: 'networkidle' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForBoot(page);
  const catalog = await inspectCatalog(page);
  assert.deepEqual(catalog.cards, active, `${viewport.name}: exact five-card order`);
  assert.equal(catalog.progress, '0 / 5', `${viewport.name}: fresh progress`);
  assert.equal(catalog.catalogVisible, true, `${viewport.name}: catalog visible`);
  assert.equal(catalog.labHidden, true, `${viewport.name}: lab hidden`);
  assert.ok(catalog.scrollWidth <= catalog.clientWidth, `${viewport.name}: horizontal overflow ${JSON.stringify(catalog)}`);
  for (const bounds of catalog.bounds) {
    assert.ok(bounds.left >= -.5 && bounds.right <= viewport.width + .5,
      `${viewport.name}:${bounds.id} outside viewport: ${JSON.stringify(bounds)}`);
    assert.ok(bounds.width > 0 && bounds.height > 0, `${viewport.name}:${bounds.id} has no rendered area`);
  }
  const resources = await servedResources(page);
  assertFinalHash(resources, `responsive:${viewport.name}`);
  await page.screenshot({ path: path.join(outputDirectory, `catalog-${viewport.name}.png`), fullPage: true });
  report.responsive.push({ viewport, catalog, appBundle: resources.find((url) => url.includes(`/assets/${expectedHash}`)) });
  await context.close();
}

{
  const context = await browser.newContext({ viewport: viewports[0] });
  const page = await context.newPage();
  observe(page, 'routes');
  for (let index = 0; index < active.length; index += 1) {
    const id = active[index];
    await page.goto(`${base}/science-lab/preview?active-route=${Date.now()}#${id}`, { waitUntil: 'networkidle' });
    await waitForBoot(page);
    await page.locator('#predictionDialog[open]').waitFor({ timeout: 5000 });
    const state = await page.evaluate(() => window.__scienceLabTest?.getState());
    const routeState = await page.evaluate(() => ({
      hash: location.hash,
      catalogHidden: document.querySelector('#catalogScreen')?.hidden,
      labVisible: !document.querySelector('#labScreen')?.hidden,
      number: document.querySelector('#labNumber')?.textContent?.trim(),
      title: document.querySelector('#labTitle')?.textContent?.trim(),
    }));
    assert.equal(state?.experimentId, id, `${id}: state id`);
    assert.equal(routeState.hash, `#${id}`, `${id}: canonical hash`);
    assert.equal(routeState.catalogHidden, true, `${id}: catalog hidden`);
    assert.equal(routeState.labVisible, true, `${id}: lab visible`);
    assert.equal(routeState.number, String(index + 1).padStart(2, '0'), `${id}: release number`);
    assert.ok(routeState.title, `${id}: title rendered`);
    const resources = await servedResources(page);
    assertFinalHash(resources, `active-route:${id}`);
    report.activeRoutes.push({ id, ...routeState, stateId: state.experimentId });
  }

  for (const id of removed) {
    await page.goto(`${base}/science-lab/preview?removed-route=${Date.now()}#${id}`, { waitUntil: 'networkidle' });
    await waitForBoot(page);
    await page.waitForFunction(() => location.hash === '' && !document.querySelector('#catalogScreen')?.hidden);
    const routeState = await page.evaluate(() => ({
      hash: location.hash,
      catalogVisible: !document.querySelector('#catalogScreen')?.hidden,
      labHidden: document.querySelector('#labScreen')?.hidden,
      openDialogs: document.querySelectorAll('dialog[open]').length,
      testState: window.__scienceLabTest?.getState(),
      cards: [...document.querySelectorAll('[data-experiment]')].map((card) => card.dataset.experiment),
    }));
    assert.equal(routeState.hash, '', `${id}: removed hash cleared`);
    assert.equal(routeState.catalogVisible, true, `${id}: safely returned to catalog`);
    assert.equal(routeState.labHidden, true, `${id}: lab cannot be entered`);
    assert.equal(routeState.openDialogs, 0, `${id}: no stale modal`);
    assert.equal(routeState.testState, null, `${id}: no simulation created`);
    assert.deepEqual(routeState.cards, active, `${id}: catalog remains exact five`);
    report.removedRoutes.push({ id, ...routeState });
  }
  await context.close();
}

async function submitPrediction(page) {
  await page.locator('#predictionDialog[open]').waitFor({ timeout: 6000 });
  await page.locator('[data-prediction="0"]').click();
  await page.locator('#predictionSubmit').click();
  await page.locator('#predictionDialog').waitFor({ state: 'hidden' });
}

async function completeCurrent(page) {
  while (!(await page.evaluate(() => window.__scienceLabTest?.getState()?.complete))) {
    const before = await page.evaluate(() => window.__scienceLabTest?.getState()?.currentStep);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await page.locator('#missionPanel.collapsed').count()) await page.locator('#missionPanelToggle').click();
      await page.locator('#accessibleActionButton').click();
      await page.waitForTimeout(90);
      const state = await page.evaluate(() => window.__scienceLabTest?.getState());
      if (state?.complete || state?.currentStep > before) break;
    }
    await page.waitForFunction((previous) => {
      const state = window.__scienceLabTest?.getState();
      return state?.complete || state?.currentStep > previous;
    }, before, { timeout: 7000 });
  }
  await page.locator('#phenomenonStage').waitFor({ state: 'visible', timeout: 6000 });
  await page.locator('#phenomenonExplainButton').click();
  await page.locator('#resultDialog[open]').waitFor({ timeout: 6000 });
}

{
  const context = await browser.newContext({ viewport: viewports[0] });
  const page = await context.newPage();
  observe(page, 'next-cycle');
  await page.goto(`${base}/science-lab/preview?next-cycle=${Date.now()}#${active[0]}`, { waitUntil: 'networkidle' });
  await waitForBoot(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForBoot(page);
  await submitPrediction(page);
  for (let index = 0; index < active.length; index += 1) {
    const current = active[index];
    const stateBefore = await page.evaluate(() => window.__scienceLabTest?.getState());
    assert.equal(stateBefore?.experimentId, current, `cycle ${index}: current experiment`);
    await completeCurrent(page);
    const expectedNext = active[(index + 1) % active.length];
    await page.locator('#nextExperimentButton').click();
    await page.waitForFunction((id) => window.__scienceLabTest?.getState()?.experimentId === id, expectedNext, { timeout: 7000 });
    await page.locator('#predictionDialog[open]').waitFor({ timeout: 5000 });
    const actualNext = await page.evaluate(() => window.__scienceLabTest?.getState()?.experimentId);
    assert.equal(actualNext, expectedNext, `${current}: next station remains in release set`);
    report.cycle.push({ from: current, to: actualNext });
    if (index < active.length - 1) await submitPrediction(page);
  }
  const resources = await servedResources(page);
  assertFinalHash(resources, 'next-cycle');
  await context.close();
}

{
  const context = await browser.newContext({ viewport: viewports[0] });
  const page = await context.newPage();
  observe(page, 'legacy-progress');
  await page.goto(`${base}/science-lab/preview?legacy=${Date.now()}`, { waitUntil: 'networkidle' });
  await waitForBoot(page);
  await page.evaluate((removedIds) => {
    const experiments = Object.fromEntries(removedIds.map((id, index) => [id, {
      completed: true,
      bestScore: 3,
      completedAt: Date.now() - 1000,
      lastPlayedAt: Date.now() + index,
      session: { version: 1, experimentId: id, currentStep: 1, complete: false },
    }]));
    localStorage.setItem('buio-science-lab:v1:local-preview', JSON.stringify({ version: 1, experiments, updatedAt: Date.now() }));
  }, removed);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForBoot(page);
  const catalog = await inspectCatalog(page);
  assert.equal(catalog.progress, '0 / 5', 'removed completion records do not inflate release progress');
  await page.locator('#notebookButton').click();
  await page.locator('#notebookDialog[open]').waitFor();
  const notebook = await page.evaluate(() => ({
    count: document.querySelectorAll('[data-notebook-id]').length,
    completedSummary: document.querySelector('#notebookSummary .summary-tile b')?.textContent?.trim(),
    ids: [...document.querySelectorAll('[data-notebook-id]')].map((item) => item.dataset.notebookId),
  }));
  assert.equal(notebook.count, 5, 'notebook only lists active experiments');
  assert.equal(notebook.completedSummary, '0', 'notebook ignores removed completion records');
  assert.deepEqual(notebook.ids, active, 'notebook exact active set');
  await page.keyboard.press('Escape');
  await page.locator('#continueButton').click();
  await page.locator('#predictionDialog[open]').waitFor();
  const continued = await page.evaluate(() => window.__scienceLabTest?.getState()?.experimentId);
  assert.equal(continued, active[0], 'removed lastPlayed record cannot break continue');
  report.legacy = { catalog, notebook, continued };
  await context.close();
}

assert.deepEqual(report.errors, [], `browser/runtime errors: ${JSON.stringify(report.errors)}`);
await writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
console.log(JSON.stringify(report, null, 2));
