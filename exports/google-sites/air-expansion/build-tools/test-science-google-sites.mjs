#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { experiments as englishExperiments } from '../science-lab-app/public/js/data/experiments.en.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'exports/google-sites/air-expansion');
const evidence = path.join(output, 'verification');
await mkdir(evidence, { recursive: true });
const html = await readFile(path.join(output, 'air-expansion.html'), 'utf8');
assert.equal(html, await readFile(path.join(output, 'air-expansion-embed.txt'), 'utf8'));
// Serve the exact file as the frame document, as Sites does for an embed block.
// Keeping megabytes out of the srcdoc attribute also avoids automation protocol
// overhead when Playwright inspects the frame owner for each pointer action.
const wrapper = '<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><meta charset="utf-8"><style>html,body{margin:0}iframe{border:0;width:100%;height:100vh;display:block}</style><iframe title="Google Sites sandbox test" sandbox="allow-scripts" src="/experiment"></iframe>';
const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(request.url.startsWith('/sandbox') ? wrapper : html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const checks = [];
const englishDefinition = englishExperiments.find(item => item.id === 'air-expansion');

async function click(locator) {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  });
  // Every test frame fills the top-level viewport, so frame/local coordinates
  // coincide. Send real input without browser-version-specific OOPIF hit tests.
  if (locator.page().viewportSize().width < 500) await locator.page().touchscreen.tap(box.x, box.y);
  else await locator.page().mouse.click(box.x, box.y);
}

async function advanceTo(frame, slide) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const current = await frame.locator('#stageScreen').getAttribute('data-slide');
    if (current === slide) return;
    if (current?.startsWith('chapter-')) { await frame.page().waitForTimeout(200); continue; }
    const next = frame.locator('#stageNext');
    if (await next.isVisible() && await next.isEnabled()) await click(next);
    else await frame.page().waitForTimeout(220);
  }
  throw new Error(`Stage did not reach ${slide}`);
}

async function open(context, url, sandbox, initialLanguage = 'zh-HK') {
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const errors = [];
  const unexpectedRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') console.error('Browser:', message.text()); });
  // A fresh context and a network block prove that assets are not merely cached.
  await context.route('**/*', route => {
    if (route.request().isNavigationRequest() && [url, `${base}/experiment`].includes(route.request().url())) return route.continue();
    if (/^(data|blob|file):/.test(route.request().url())) return route.continue();
    unexpectedRequests.push(route.request().url());
    return route.abort();
  });
  await context.addInitScript(() => { window.__BUIO_EXPORT_QA__ = true; });
  await context.addInitScript(() => { Object.defineProperty(navigator, 'deviceMemory', { get: () => 1 }); });
  await page.goto(url, { waitUntil: 'load' });
  console.log('Loaded', sandbox ? 'sandbox' : 'local file');
  const frame = sandbox ? page.frames().find(item => item !== page.mainFrame()) : page.mainFrame();
  await frame.waitForFunction(() => window.__scienceLabTest?.getState()?.experimentId === 'air-expansion', null, { timeout: 30000 });
  console.log('Experiment initialized');
  if (initialLanguage === 'en-US') {
    await language(frame, 'en-US');
    await advanceTo(frame, 'observe-notice');
    assert.ok((await frame.locator('#stageBody').innerText()).includes(englishDefinition.observe.title));
    await frame.waitForFunction(() => { const img = document.querySelector('.observation-figure img'); return img?.complete && img.naturalWidth > 0; });
    assert.match(await frame.locator('.observation-figure img').getAttribute('src'), /^data:image\/webp;base64,/);
    await frame.waitForFunction(() => Number(getComputedStyle(document.querySelector('#stageBody')).opacity) >= .99);
    await page.screenshot({ path: path.join(evidence, '09-english-introduction.png') });
  }
  if (initialLanguage === 'zh-HK' && sandbox && page.viewportSize().width > 1000) {
    await advanceTo(frame, 'observe-notice');
    await frame.waitForFunction(() => { const img = document.querySelector('.observation-figure img'); return img?.complete && img.naturalWidth > 0; });
    await frame.waitForFunction(() => Number(getComputedStyle(document.querySelector('#stageBody')).opacity) >= .99);
    await page.screenshot({ path: path.join(evidence, '00-introduction.png') });
  }
  await advanceTo(frame, 'hypothesis');
  assert.deepEqual(await frame.locator('#predictionOptions .stage-option > span').allTextContents(), initialLanguage === 'en-US' ? ['It expands', 'It contracts', 'No change'] : ['膨脹', '收縮', '沒有變化']);
  await click(frame.locator('[data-prediction="0"]'));
  await click(frame.locator('#stageNext'));
  await frame.locator('#stageScreen').waitFor({ state: 'hidden' });
  await frame.waitForFunction(() => !document.querySelector('.air-label-layer').hidden);
  assert.equal(await frame.locator('#catalogScreen, #backToCatalogButton, #homeButton, #labNumber, #labMeta, #notebookButton, #notebookDialog').count(), 0);
  assert.equal(await frame.locator('button.brand-button').count(), 0, 'Brand is no longer a map navigation button');
  await click(frame.locator('.brand-button'));
  assert.equal(await frame.locator('#labScreen').isVisible(), true, 'Clicking the brand keeps the experiment open');
  assert.equal(await frame.locator('#soundButton').isVisible(), true);
  assert.equal(await frame.locator('#settingsButton').isVisible(), true);
  assert.equal(await frame.locator('.brand-button b').innerText(), initialLanguage === 'en-US' ? 'Air Lab' : '空氣研究所');
  assert.equal(await frame.locator('[data-reading="temperature-label"]').innerText(), initialLanguage === 'en-US' ? 'Room temp.' : '室溫');
  assert.equal(await frame.locator('.air-label').count(), 5);
  const labels = await frame.locator('.air-label').evaluateAll(nodes => nodes.map(node => ({
    text: node.textContent, fontSize: parseFloat(getComputedStyle(node).fontSize),
    rectangle: node.getBoundingClientRect().toJSON(),
  })));
  assert.ok(labels.every(label => label.fontSize >= 14 && label.rectangle.left >= 0 && label.rectangle.right <= page.viewportSize().width), 'Labels stay sharp and within the embed');
  if (page.viewportSize().width < 500) {
    const rectangles = await frame.evaluate(() => ['.air-readout', '#missionPanelToggle', '.view-controls'].map(selector => document.querySelector(selector).getBoundingClientRect().toJSON()));
    assert.ok(rectangles[1].top > rectangles[0].bottom, 'Phone task tab stays below the scientific readout');
    assert.ok(rectangles[2].right <= rectangles[1].left, 'Phone camera controls and task tab remain separate');
  }
  console.log('Hypothesis entered');
  return { page, frame, errors, unexpectedRequests };
}

async function waitStep(frame, expected) {
  await frame.waitForFunction(step => window.__scienceLabTest.getState().currentStep === step, expected);
  console.log('Step', expected);
}

async function language(frame, language) {
  await click(frame.locator('#settingsButton'));
  await frame.locator('#settingsDialog[open]').waitFor();
  await frame.waitForFunction(() => {
    const style = getComputedStyle(document.querySelector('#settingsDialog'));
    return Number(style.opacity) >= .99 && style.transform === 'none';
  });
  await frame.locator('#languageSelect').selectOption(language);
  await frame.waitForFunction(expected => document.documentElement.lang === expected, language);
  await click(frame.locator('#settingsDialog .dialog-close'));
  await frame.waitForFunction(() => !document.querySelector('#settingsDialog').open);
  if (await frame.locator('#stageScreen').isHidden()) await frame.waitForFunction(() => !document.querySelector('.air-label-layer').hidden);
}

async function drag(page, frame, subject, target) {
  const center = await frame.evaluate(id => window.__scienceLabTest.getEntityPoint(id), subject);
  const destination = await frame.evaluate(id => window.__scienceLabTest.getTargetPoint(id), target);
  assert.ok(center && destination);
  let pick;
  for (const radius of [0, 12, 25, 40]) {
    for (let i = 0; i < (radius ? 12 : 1); i++) {
      const point = { x: center.x + Math.cos(i / 12 * Math.PI * 2) * radius, y: center.y + Math.sin(i / 12 * Math.PI * 2) * radius };
      await page.mouse.move(point.x, point.y);
      const hover = await frame.locator('#interactionLabel').evaluate(element => !element.hidden && getComputedStyle(element).display !== 'none' ? element.textContent : '');
      if (hover === (subject === 'balloon' ? '氣球' : '硬身膠樽')) { pick = point; break; }
    }
    if (pick) break;
  }
  assert.ok(pick, `Could not pick ${subject}`);
  await page.mouse.move(pick.x, pick.y);
  await page.mouse.down();
  await page.mouse.move(destination.x, destination.y, { steps: 28 });
  await page.waitForTimeout(120);
  await page.mouse.up();
}

async function record(frame, index) {
  await click(frame.locator('#recordOptions button').nth(index));
}

async function finish(page, frame, screenshot) {
  await frame.locator('#phenomenonStage').waitFor({ state: 'visible' });
  await click(frame.locator('#phenomenonExplainButton'));
  await advanceTo(frame, 'analysis');
  assert.equal(await frame.locator('#analysisTableBody tr').count(), 2);
  await advanceTo(frame, 'reflection');
  assert.equal(await frame.locator('#stageNext').isEnabled(), false);
  await click(frame.locator('[data-reflection="1"]'));
  await click(frame.locator('#stageNext'));
  await frame.locator('#resultDialog[open]').waitFor();
  assert.match(await frame.locator('#resultExplanation').innerText(), /空氣受熱會膨脹/);
  const state = await frame.evaluate(() => window.__scienceLabTest.getState());
  assert.equal(state.complete, true);
  assert.equal(state.currentStep, 6);
  assert.equal(state.records.length, 2);
  assert.equal(state.actionHistory.filter(item => item.accepted).length, 6);
  await frame.waitForFunction(() => Number(getComputedStyle(document.querySelector('#resultDialog')).opacity) >= .95);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(evidence, screenshot) });
  return state;
}

try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const run = await open(desktop, `${base}/sandbox`, true);
  assert.equal(await run.frame.evaluate(() => window.__scienceLabTest.rendererKind()), 'webgl');
  assert.equal(await run.frame.evaluate(() => { try { localStorage.getItem('probe'); return false; } catch { return true; } }), true, 'Storage-denied sandbox is exercised');
  // No same-origin privilege and no subsequent network connection are required.
  await desktop.setOffline(true);
  await run.page.screenshot({ path: path.join(evidence, '01-desktop-experiment.png') });
  const initialLabelPosition = await run.frame.locator('[data-apparatus="hot-bath-bowl"]').getAttribute('style');
  await click(run.frame.locator('#cameraRightButton'));
  await run.page.waitForTimeout(600);
  assert.notEqual(await run.frame.locator('[data-apparatus="hot-bath-bowl"]').getAttribute('style'), initialLabelPosition, 'Sharp labels follow camera rotation');
  await click(run.frame.locator('#cameraResetButton'));
  await run.page.waitForTimeout(600);
  await drag(run.page, run.frame, 'balloon', 'bottle-mouth');
  await waitStep(run.frame, 1);
  await run.page.waitForTimeout(850);
  await drag(run.page, run.frame, 'bottle', 'hot-bath');
  await waitStep(run.frame, 2);
  await run.frame.locator('#variableSlider').fill('75');
  await run.frame.locator('#variableSlider').dispatchEvent('input');
  await run.frame.locator('#variableSlider').dispatchEvent('change');
  await waitStep(run.frame, 3);
  await record(run.frame, 0);
  await waitStep(run.frame, 4);
  await run.frame.waitForFunction(() => window.__scienceLabTest.getDebugStats().science.shownVolumeMl > 85);
  assert.equal(await run.frame.evaluate(() => window.__scienceLabTest.getDebugStats().science.balloonVolumeMl), 89.8);
  assert.match(await run.frame.locator('[data-reading="volume"]').innerText(), /\+90/);
  assert.equal(await run.frame.locator('[data-reading="temperature-label"]').innerText(), '水溫');
  await run.page.screenshot({ path: path.join(evidence, '02-hot-water.png') });
  const beforeLanguage = await run.frame.evaluate(() => window.__scienceLabTest.getState());
  await language(run.frame, 'en-US');
  assert.equal(await run.frame.locator('#labTitle').innerText(), englishDefinition.title);
  assert.equal(await run.frame.locator('[data-apparatus="balloon"]').innerText(), 'Balloon');
  assert.equal(await run.frame.locator('#missionTitle').innerText(), englishDefinition.steps[4].title);
  const inEnglish = await run.frame.evaluate(() => window.__scienceLabTest.getState());
  assert.equal(inEnglish.currentStep, beforeLanguage.currentStep);
  assert.equal(inEnglish.prediction, beforeLanguage.prediction);
  assert.equal(inEnglish.records[0].value, englishDefinition.steps[3].action.options[0]);
  assert.equal(inEnglish.actionHistory.length, beforeLanguage.actionHistory.length);
  assert.equal(await run.frame.evaluate(() => window.__scienceLabTest.getDebugStats().science.waterTemperature), 75);
  assert.ok(await run.frame.evaluate(() => window.__scienceLabTest.getDebugStats().science.shownVolumeMl >= 85), 'Language switching keeps the expanded balloon, without replaying its growth');
  await run.page.screenshot({ path: path.join(evidence, '07-english-desktop.png') });
  await language(run.frame, 'zh-HK');
  assert.equal(await run.frame.locator('[data-apparatus="balloon"]').innerText(), '氣球');
  assert.equal(await run.frame.evaluate(() => window.__scienceLabTest.getState().records[0].value), '脹大');
  await drag(run.page, run.frame, 'bottle', 'ice-bath');
  await waitStep(run.frame, 5);
  await run.frame.waitForFunction(() => window.__scienceLabTest.getDebugStats().science.shownVolumeMl < -30);
  assert.equal(await run.frame.evaluate(() => window.__scienceLabTest.getDebugStats().science.balloonVolumeMl), -33.9);
  assert.match(await run.frame.locator('[data-reading="volume"]').innerText(), /−34/);
  await run.page.screenshot({ path: path.join(evidence, '03-ice-water.png') });
  await record(run.frame, 1);
  await finish(run.page, run.frame, '04-desktop-complete.png');
  assert.deepEqual(run.errors, []);
  assert.deepEqual(run.unexpectedRequests, []);
  checks.push('Desktop: opaque sandbox, denied storage, offline, WebGL, real balloon/bottle drags, six steps, two records, reflection, conclusion');
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const phone = await open(mobile, `${base}/sandbox?mobile=1`, true);
  await phone.page.screenshot({ path: path.join(evidence, '05-mobile-experiment.png') });
  assert.equal(await phone.frame.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal overflow');
  await language(phone.frame, 'en-US');
  assert.equal(await phone.frame.locator('#labTitle').innerText(), englishDefinition.title);
  await phone.page.screenshot({ path: path.join(evidence, '08-english-mobile.png') });
  for (let step = 0; step < 6; step++) {
    if (step === 5) await language(phone.frame, 'zh-HK');
    if ([3, 5].includes(step)) await record(phone.frame, step === 3 ? 0 : 1);
    else {
      if (await phone.frame.locator('#missionPanel.collapsed').count()) await click(phone.frame.locator('#missionPanelToggle'));
      await click(phone.frame.locator('#accessibleActionButton'));
    }
    await waitStep(phone.frame, step + 1);
    await phone.page.waitForTimeout(400);
  }
  await finish(phone.page, phone.frame, '06-mobile-complete.png');
  assert.deepEqual(phone.errors, []);
  assert.deepEqual(phone.unexpectedRequests, []);
  checks.push('Mobile: 390×900, sandbox, no horizontal overflow, alternate controls complete the inquiry');
  checks.push('Air Lab: independent branding, 16px/14px DOM apparatus labels, camera tracking, live model readings, phone task/readout/control separation');
  checks.push('Chinese/English: desktop and phone, translated apparatus/instructions/data, round-trip language changes preserve progress, prediction, readings and action history');
  await mobile.close();

  const local = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  const file = await open(local, pathToFileURL(path.join(output, 'air-expansion.html')).href, false);
  assert.deepEqual(file.errors, []);
  assert.deepEqual(file.unexpectedRequests, []);
  checks.push('Local file: opens directly without a server or separate asset files');
  await local.close();
  const englishIntroContext = await browser.newContext({ viewport: { width: 1100, height: 850 } });
  const englishIntro = await open(englishIntroContext, `${base}/sandbox?english-intro=1`, true, 'en-US');
  assert.equal(await englishIntro.frame.locator('#labTitle').innerText(), englishDefinition.title);
  assert.deepEqual(englishIntro.errors, []);
  checks.push('Language settings are accessible on the introductory slides, so visitors can start in English');
  await englishIntroContext.close();
  const report = { passed: true, htmlSha256: createHash('sha256').update(html).digest('hex'), checks, googleSitesPasteVerified: false, note: 'Actual Google Sites editor requires Google sign-in; sandbox tests do not establish editor paste/publish compatibility.' };
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: path.join(evidence, 'failure.png') }).catch(() => {});
    console.error(await page.locator('body').innerText().catch(() => ''));
  }
  throw error;
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
