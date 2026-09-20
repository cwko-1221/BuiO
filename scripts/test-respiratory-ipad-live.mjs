#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const base = process.env.SCIENCE_LAB_URL || 'http://127.0.0.1:3000';
const outputDirectory = path.resolve('artifacts', 'science-lab-qa');
await mkdir(outputDirectory, { recursive: true });

async function advanceStageTo(page, slide) {
  for (let guard = 0; guard < 16; guard += 1) {
    const current = await page.locator('#stageScreen:not([hidden])').getAttribute('data-slide').catch(() => null);
    if (current === slide) return;
    if (current === null) throw new Error(`stage closed before reaching ${slide}`);
    const kind = await page.locator('#stageScreen').getAttribute('data-kind');
    if (kind === 'chapter') {
      // Chapter cards advance automatically; tapping their backdrop keeps
      // this test independent of the configured motion-reduction delay.
      await page.locator('#stageScreen').click({ position: { x: 20, y: 20 } });
      await page.waitForTimeout(450);
      continue;
    }
    const next = page.locator('#stageNext:not([hidden])');
    if (!(await next.isEnabled())) {
      // A chapter card disables the button during its automatic cross-fade.
      // Wait for the requested actionable slide rather than trying to click
      // through that transient disabled state.
      await page.waitForFunction(
        (wanted) => document.querySelector('#stageScreen:not([hidden])')?.dataset.slide === wanted,
        slide,
        { timeout: 5000 },
      );
      return;
    }
    await next.click();
    // Chapter cards animate into the following actionable slide. Waiting less
    // than that transition can catch the next button in its disabled frame.
    await page.waitForTimeout(700);
  }
  throw new Error(`stage never reached ${slide}`);
}

const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  const context = await browser.newContext({
    viewport: { width: 1180, height: 820 },
    deviceScaleFactor: 2,
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.clear());

  await page.goto(`${base}/science-lab/preview#respiratory-system`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'));
  await advanceStageTo(page, 'observe-notice');
  assert.equal(await page.locator('#stageScreen video').count(), 0,
    'the respiratory observation flow goes directly to observation prompts without a video page');
  assert.ok(await page.locator('#observeNotice li').count() >= 2,
    'the no-video observation page still provides useful things to notice');
  await advanceStageTo(page, 'hypothesis');
  await page.locator('[data-prediction="1"]').click();
  await page.locator('#stageNext').click();
  await page.locator('#stageScreen').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => window.__scienceLabTest?.getDebugStats()?.science?.model === 'blender');
  // Capture the stable teaching view after the three-second hypothesis toast
  // has gone; transient feedback must not be mistaken for persistent anatomy
  // obstruction in the visual audit.
  await page.waitForTimeout(3300);

  const report = await page.evaluate(() => {
    const canvas = document.querySelector('#labCanvas');
    const rect = canvas.getBoundingClientRect();
    const missionTitle = document.querySelector('#missionTitle');
    const debug = window.__scienceLabTest.getDebugStats();
    return {
      renderer: window.__scienceLabTest.rendererKind(),
      cssCanvas: { width: rect.width, height: rect.height },
      backingCanvas: { width: canvas.width, height: canvas.height },
      effectivePixelRatio: Number((canvas.width / rect.width).toFixed(2)),
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      missionFontSize: Number.parseFloat(getComputedStyle(missionTitle).fontSize),
      science: debug.science,
    };
  });

  assert.equal(report.renderer, 'webgl', 'iPad layout uses the full WebGL renderer');
  assert.equal(report.science.model, 'blender', 'the Blender-authored respiratory model loaded');
  assert.equal(report.science.lungLobes, 5, 'all five semantic lung lobes loaded');
  assert.ok(report.effectivePixelRatio >= 1.95,
    `Retina canvas must render at 2x instead of the old blurry 1x path: ${JSON.stringify(report)}`);
  assert.ok(report.missionFontSize >= 20, `mission text is too small: ${JSON.stringify(report)}`);
  assert.ok(report.documentOverflow <= 1, `iPad layout has horizontal overflow: ${JSON.stringify(report)}`);
  assert.deepEqual(errors.filter((item) => !item.startsWith('Failed to load resource:')), [],
    `browser errors: ${JSON.stringify(errors)}`);

  // Complete the first labelling action through the accessible equivalent so
  // the screenshot verifies the in-scene Chinese label textures, not only the
  // DOM buttons and empty drop zones.
  await page.locator('#missionPanelToggle').click();
  await page.locator('#accessibleActionButton').evaluate((button) => button.click());
  await page.waitForFunction(() => window.__scienceLabTest.getDebugStats()?.science?.labelled === true);
  if (await page.locator('#missionPanel:not(.collapsed)').count()) {
    await page.locator('#missionPanelToggle').click();
  }
  await page.waitForTimeout(3300);
  const labelledScience = await page.evaluate(() => window.__scienceLabTest.getDebugStats().science);
  assert.equal(labelledScience.placed, 6, 'all six in-scene organ nameplates are visible');

  const screenshot = path.join(outputDirectory, 'respiratory-ipad-retina.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  // A body silhouette that only works head-on is not acceptable.  Keep a
  // second contract image after a deliberate three-quarter rotation so the
  // head/jaw/neck/shoulder transitions are reviewed from depth as well. The
  // fixed anterior label slot itself must not follow the camera in world space
  // or swivel its card/text toward the new view.
  const anteriorLabelPose = await page.evaluate(() => window.__scienceLabTest.getTargetWorldPose('slot-nose'));
  await page.locator('#cameraRightButton').click();
  await page.locator('#cameraRightButton').click();
  await page.waitForTimeout(900);
  const rotatedLabelPose = await page.evaluate(() => window.__scienceLabTest.getTargetWorldPose('slot-nose'));
  assert.deepEqual(rotatedLabelPose, anteriorLabelPose,
    `anterior label slots stay fixed and front-facing when the camera rotates: ${JSON.stringify({ anteriorLabelPose, rotatedLabelPose })}`);
  const rotatedScreenshot = path.join(outputDirectory, 'respiratory-ipad-rotated.png');
  await page.screenshot({ path: rotatedScreenshot, fullPage: true });

  // The breathing lesson asks pupils to identify the paired lungs once; it
  // must not expose separate tap targets for individual lobes.
  await page.locator('#accessibleActionButton').evaluate((button) => button.click());
  await page.waitForFunction(() => window.__scienceLabTest.getDebugStats()?.science?.selectedLungs === true);
  const wholeLungSelection = await page.evaluate(() => window.__scienceLabTest.getDebugStats().science);
  assert.equal(wholeLungSelection.selectedLungs, true, 'either lung selects the paired organ as one target');
  const nextMission = await page.locator('#missionTitle').innerText();
  assert.doesNotMatch(nextMission, /肺葉|lobe/i, 'individual lung lobes are not separate pupil tasks');

  // Drive both endpoints through the real control so the exported Blender
  // shape keys, not only the progress UI, are exercised in WebGL.
  const slider = page.locator('#variableSlider');
  await page.waitForFunction(() => document.querySelector('#variableControl')?.hidden === false);
  const setBreath = async (value) => {
    await slider.evaluate((input, next) => {
      input.value = String(next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await page.waitForFunction(
      (direction) => {
        const breath = window.__scienceLabTest.getDebugStats()?.science?.breath || 0;
        return direction > 0 ? breath >= .95 : breath <= -.95;
      },
      Math.sign(value),
      { timeout: 6000 },
    );
    return page.evaluate(() => window.__scienceLabTest.getDebugStats().science);
  };
  const inhaledScience = await setBreath(100);
  const inhaleScreenshot = path.join(outputDirectory, 'respiratory-ipad-inhale.png');
  await page.screenshot({ path: inhaleScreenshot, fullPage: true });
  const exhaledScience = await setBreath(-100);
  const exhaleScreenshot = path.join(outputDirectory, 'respiratory-ipad-exhale.png');
  await page.screenshot({ path: exhaleScreenshot, fullPage: true });
  assert.ok(inhaledScience.breath > .90, `inhalation reaches its visible endpoint: ${JSON.stringify(inhaledScience)}`);
  assert.ok(exhaledScience.breath < -.90, `exhalation reaches its visible endpoint: ${JSON.stringify(exhaledScience)}`);
  assert.ok(inhaledScience.breath - exhaledScience.breath > 1.8,
    'the paired lung shape visibly travels between deep inspiration and expiration');

  // Verify the revised responsive camera keeps the cutaway readable after a
  // real portrait resize and explicit camera reset.
  await page.setViewportSize({ width: 501, height: 887 });
  await page.locator('#cameraResetButton').click();
  await page.waitForTimeout(650);
  const portraitReport = await page.evaluate(() => {
    const canvas = document.querySelector('#labCanvas');
    const rect = canvas.getBoundingClientRect();
    const observation = document.querySelector('#observationStrip');
    observation.hidden = false;
    const observationRect = observation.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      breathHandle: window.__scienceLabTest.getEntityScreenBounds('breath'),
      observationCardTop: observationRect.top,
    };
  });
  const portraitScreenshot = path.join(outputDirectory, 'respiratory-portrait-breathing.png');
  await page.screenshot({ path: portraitScreenshot, fullPage: true });
  assert.ok(portraitReport.overflow <= 1, `portrait view has no horizontal overflow: ${JSON.stringify(portraitReport)}`);
  assert.ok(portraitReport.width <= 501 && portraitReport.height > 0,
    `portrait canvas fits the narrow viewport: ${JSON.stringify(portraitReport)}`);
  assert.ok(portraitReport.breathHandle.bottom + 16 <= portraitReport.observationCardTop,
    `the breath timeline grip clears the foreground observation card: ${JSON.stringify(portraitReport)}`);

  assert.deepEqual(errors.filter((item) => !item.startsWith('Failed to load resource:')), [],
    `browser errors after camera rotation: ${JSON.stringify(errors)}`);
  console.log(JSON.stringify({ screenshot, rotatedScreenshot, inhaleScreenshot, exhaleScreenshot, portraitScreenshot, ...report, labelledScience, wholeLungSelection, inhaledScience, exhaledScience, portraitReport, nextMission }, null, 2));
  console.log('Respiratory iPad Retina visual contract passed.');
} finally {
  await browser.close();
}
