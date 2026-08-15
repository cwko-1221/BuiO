import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

import { experiments } from '../science-lab-app/public/js/data/experiments.js';

const base = process.env.SCIENCE_LAB_BASE || 'http://127.0.0.1:3000';
const evidenceDirectory = path.resolve('tmp', 'spatial-audit', 'final-pour-lifecycle');
const browserCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const installedBrowser = browserCandidates.find(existsSync);
const relevantIds = new Set(['transmission', 'root-viewer', 'density-column', 'water-filter']);
const definitions = experiments.filter((experiment) => relevantIds.has(experiment.id));
const entityLabels = new Map([
  ['tracer', '安全示蹤乳液'], ['soap', '梘液泵'], ['hands', '雙手模型'],
  ['water-cup', '量杯'], ['time-dial', '72 小時控制器'],
  ['honey', '蜂蜜'], ['water', '水'], ['oil', '食用油'], ['cork', '軟木塞'],
  ['sand', '細沙'], ['gravel', '碎石'], ['muddy-water', '泥水'], ['sensor', '濁度探頭'],
]);

await rm(evidenceDirectory, { recursive: true, force: true });
await mkdir(evidenceDirectory, { recursive: true });

for (let attempt = 0; attempt < 40; attempt += 1) {
  try {
    if ((await fetch(`${base}/health`)).ok) break;
  } catch {}
  if (attempt === 39) throw new Error(`Science Lab is not available at ${base}`);
  await new Promise((resolve) => setTimeout(resolve, 100));
}

const browser = await chromium.launch({
  headless: true,
  ...(installedBrowser ? { executablePath: installedBrowser } : {}),
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const records = [];
let navigationSerial = 0;

function finitePoint(point) {
  return point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function overlapArea(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
}

async function projectedPoint(id, target = false) {
  const point = await page.evaluate(({ entityId, isTarget }) => (
    isTarget
      ? window.__scienceLabTest?.getTargetPoint(entityId)
      : window.__scienceLabTest?.getEntityPoint(entityId)
  ), { entityId: id, isTarget: target });
  assert.ok(finitePoint(point), `Missing projected ${target ? 'target' : 'entity'} point: ${id}`);
  return point;
}

async function sourcePoint(id) {
  const centre = await projectedPoint(id, false);
  const candidates = [centre];
  for (const radius of [10, 18, 28, 40, 54, 72, 94, 118]) {
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 2;
      candidates.push({ x: centre.x + Math.cos(angle) * radius, y: centre.y + Math.sin(angle) * radius });
    }
  }
  for (const candidate of candidates) {
    await page.mouse.move(candidate.x, candidate.y);
    await page.waitForTimeout(3);
    const hovered = await page.evaluate(() => window.__scienceLabTest?.getDebugStats?.()?.hoveredEntity || null);
    if (hovered === id) return candidate;
  }
  for (const candidate of candidates) {
    await page.mouse.move(candidate.x, candidate.y);
    await page.waitForTimeout(3);
    const hover = await page.evaluate(() => {
      const label = document.querySelector('#interactionLabel');
      return label && !label.hidden ? label.textContent.trim() : '';
    });
    if (hover === entityLabels.get(id)) return candidate;
  }
  throw new Error(`${id}: no pickable mesh near ${JSON.stringify(centre)}`);
}

async function movePointer(from, to, steps = 28) {
  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const eased = t * t * (3 - 2 * t);
    await page.mouse.move(
      from.x + (to.x - from.x) * eased,
      from.y + (to.y - from.y) * eased,
    );
    await page.waitForTimeout(7);
  }
}

async function snapshot(subject, target, nextSubject = null) {
  return page.evaluate(({ subjectId, targetId, nextId }) => {
    const test = window.__scienceLabTest;
    const nextPoint = nextId ? test?.getEntityPoint?.(nextId) || null : null;
    return {
      timestamp: performance.now(),
      state: test?.getState?.() || null,
      screenPoint: test?.getEntityPoint?.(subjectId) || null,
      screenBounds: test?.getEntityScreenBounds?.(subjectId) || null,
      homePose: test?.getEntityHomePose?.(subjectId) || null,
      physicsPose: test?.getPhysicsPose?.(subjectId) || null,
      physicsDebug: test?.getPhysicsDebug?.(subjectId, targetId) || null,
      pourDebug: test?.getPourDebug?.(subjectId) || null,
      targetPoint: test?.getTargetPoint?.(targetId) || null,
      nextSubject: nextId ? {
        id: nextId,
        point: nextPoint,
        bounds: test?.getEntityScreenBounds?.(nextId) || null,
        pourDebug: test?.getPourDebug?.(nextId) || null,
        physicsPose: test?.getPhysicsPose?.(nextId) || null,
      } : null,
      interactionLabel: (() => {
        const label = document.querySelector('#interactionLabel');
        const rect = label?.getBoundingClientRect?.();
        return label ? {
          hidden: label.hidden,
          text: label.textContent.trim(),
          rect: rect ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom } : null,
        } : null;
      })(),
      science: test?.getDebugStats?.()?.science || null,
      assets: test?.getDebugStats?.()?.assets || null,
      lastInteraction: test?.getDebugStats?.()?.lastInteraction || null,
    };
  }, { subjectId: subject, targetId: target, nextId: nextSubject });
}

async function openExperiment(definition) {
  navigationSerial += 1;
  await page.goto(`${base}/science-lab/preview?pourBaseline=${navigationSerial}#${definition.id}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'));
  await page.waitForFunction(() => window.__scienceLabTest?.rendererKind?.() === 'webgl');
  await page.locator('#predictionDialog[open]').waitFor();
  await page.locator(`[data-prediction="${definition.prediction.answer}"]`).click();
  await page.locator('#predictionSubmit').click();
  await page.waitForFunction((id) => window.__scienceLabTest?.getState?.()?.experimentId === id, definition.id);
}

async function accessiblePrerequisite() {
  const before = await page.evaluate(() => window.__scienceLabTest.getState().currentStep);
  if (await page.locator('#missionPanel.collapsed').count()) await page.locator('#missionPanelToggle').click();
  await page.locator('#accessibleActionButton').click();
  await page.waitForFunction((step) => window.__scienceLabTest.getState().currentStep > step, before);
}

async function probePickable(id) {
  if (!id) return null;
  try {
    const point = await sourcePoint(id);
    return { pickable: true, point };
  } catch (error) {
    return { pickable: false, error: error.message };
  }
}

async function performPour(definition, stepIndex) {
  const step = definition.steps[stepIndex];
  const action = step.action;
  const nextSubject = definition.steps[stepIndex + 1]?.action?.subject || null;
  if (!(await page.locator('#missionPanel.collapsed').count())) await page.locator('#missionPanelToggle').click();
  const before = await snapshot(action.subject, action.target, nextSubject);
  const from = await sourcePoint(action.subject);
  const to = await projectedPoint(action.target, true);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await movePointer(from, to, 28);
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForFunction((previous) => window.__scienceLabTest.getState().currentStep > previous, stepIndex);

  // 0.72 s: the scripted vessel has reached its destination, is at full tilt,
  // and both the generic drops and any scene-specific stream are visible.
  await page.waitForTimeout(720);
  const during = await snapshot(action.subject, action.target, nextSubject);
  const duringFile = path.join(evidenceDirectory,
    `${definition.id}-step-${stepIndex + 1}-${action.subject}-during.png`);
  await page.screenshot({ path: duringFile, fullPage: false });

  // 2.30 s after release: the 1.1 s return delay plus rotation/move durations
  // have elapsed, so this samples the stable post-pour layout.
  await page.waitForTimeout(1580);
  const after = await snapshot(action.subject, action.target, nextSubject);
  const afterFile = path.join(evidenceDirectory,
    `${definition.id}-step-${stepIndex + 1}-${action.subject}-after.png`);
  await page.screenshot({ path: afterFile, fullPage: false });
  // Hold the scene for another 1.2 s after the stable return sample. This
  // catches bodies that are visually correct for one frame but sag or wake
  // once the next physics steps run.
  await page.waitForTimeout(1200);
  const late = await snapshot(action.subject, action.target, nextSubject);
  const nextPickability = await probePickable(nextSubject);

  const returnDistancePx = before.screenPoint && after.screenPoint
    ? Math.hypot(after.screenPoint.x - before.screenPoint.x, after.screenPoint.y - before.screenPoint.y)
    : null;
  const beforeArea = before.screenBounds ? before.screenBounds.width * before.screenBounds.height : 0;
  const afterArea = after.screenBounds ? after.screenBounds.width * after.screenBounds.height : 0;
  const nextOverlap = overlapArea(after.screenBounds, after.nextSubject?.bounds);
  const nextArea = after.nextSubject?.bounds
    ? after.nextSubject.bounds.width * after.nextSubject.bounds.height
    : 0;
  const positionError = after.physicsPose && after.homePose
    ? Math.hypot(
      after.physicsPose.position.x - after.homePose.position.x,
      after.physicsPose.position.y - after.homePose.position.y,
      after.physicsPose.position.z - after.homePose.position.z,
    ) : null;
  const qa = after.physicsPose?.rotation;
  const qh = after.homePose?.rotation;
  const quaternionDot = qa && qh
    ? Math.min(1, Math.abs(qa.x * qh.x + qa.y * qh.y + qa.z * qh.z + qa.w * qh.w))
    : null;
  const rotationErrorDeg = quaternionDot == null ? null : 2 * Math.acos(quaternionDot) * 180 / Math.PI;
  const nextBefore = before.nextSubject?.pourDebug?.position;
  const nextAfter = after.nextSubject?.pourDebug?.position;
  const nextSubjectWorldDrift = nextBefore && nextAfter
    ? Math.hypot(nextAfter.x - nextBefore.x, nextAfter.y - nextBefore.y, nextAfter.z - nextBefore.z)
    : null;
  const latePosition = late.physicsPose?.position;
  const lateHome = late.homePose?.position;
  const latePositionError = latePosition && lateHome
    ? Math.hypot(latePosition.x - lateHome.x, latePosition.y - lateHome.y, latePosition.z - lateHome.z)
    : null;
  const nextLate = late.nextSubject?.pourDebug?.position;
  const nextLateDrift = nextAfter && nextLate
    ? Math.hypot(nextLate.x - nextAfter.x, nextLate.y - nextAfter.y, nextLate.z - nextAfter.z)
    : null;
  records.push({
    experiment: definition.id,
    experimentTitle: definition.title,
    step: stepIndex + 1,
    stepTitle: step.title,
    subject: action.subject,
    target: action.target,
    nextSubject,
    realPointerGesture: true,
    accepted: after.state?.actionHistory?.at(-1)?.accepted === true,
    stepAdvanced: after.state?.currentStep === stepIndex + 1,
    before,
    during,
    after,
    late,
    metrics: {
      returnDistancePx: returnDistancePx == null ? null : Number(returnDistancePx.toFixed(2)),
      screenAreaRatioAfterVsBefore: beforeArea > 0 ? Number((afterArea / beforeArea).toFixed(4)) : null,
      overlapWithNextSubjectPx2: Number(nextOverlap.toFixed(2)),
      overlapShareOfNextSubject: nextArea > 0 ? Number((nextOverlap / nextArea).toFixed(4)) : null,
      nextSubjectPickability: nextPickability,
      positionErrorToHome: positionError == null ? null : Number(positionError.toFixed(6)),
      rotationErrorToHomeDeg: rotationErrorDeg == null ? null : Number(rotationErrorDeg.toFixed(6)),
      nextSubjectWorldDrift: nextSubjectWorldDrift == null ? null : Number(nextSubjectWorldDrift.toFixed(6)),
      latePositionErrorToHome: latePositionError == null ? null : Number(latePositionError.toFixed(6)),
      nextSubjectLateDrift: nextLateDrift == null ? null : Number(nextLateDrift.toFixed(6)),
    },
    evidence: { during: duringFile, after: afterFile },
  });
}

try {
  for (const definition of definitions) {
    await openExperiment(definition);
    for (let index = 0; index < definition.steps.length; index += 1) {
      const step = definition.steps[index];
      if (step.action.type === 'pour') await performPour(definition, index);
      else if (definition.steps.slice(index + 1).some((candidate) => candidate.action.type === 'pour')) {
        await accessiblePrerequisite();
      } else {
        break;
      }
    }
  }
  assert.equal(records.length, 9, 'all nine pour steps were sampled');
  assert.ok(records.every((record) => record.accepted && record.stepAdvanced), 'all real pour gestures were accepted');
  const reportFile = path.join(evidenceDirectory, 'report.json');
  await writeFile(reportFile, JSON.stringify({
    generatedAt: new Date().toISOString(),
    base,
    viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    timing: { duringMsAfterRelease: 720, afterMsAfterRelease: 2300, lateMsAfterRelease: 3500 },
    servedAssets: await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /\/assets\/(index-|science-lab-kit-)/.test(name))),
    records,
  }, null, 2));
  console.log(JSON.stringify({ reportFile, records: records.map((record) => ({
    experiment: record.experiment,
    step: record.step,
    subject: record.subject,
    returnPx: record.metrics.returnDistancePx,
    boundsRatio: record.metrics.screenAreaRatioAfterVsBefore,
    nextOverlapShare: record.metrics.overlapShareOfNextSubject,
    nextPickable: record.metrics.nextSubjectPickability?.pickable ?? null,
    homePositionError: record.metrics.positionErrorToHome,
    homeRotationErrorDeg: record.metrics.rotationErrorToHomeDeg,
    nextSubjectWorldDrift: record.metrics.nextSubjectWorldDrift,
    lateHomePositionError: record.metrics.latePositionErrorToHome,
    nextSubjectLateDrift: record.metrics.nextSubjectLateDrift,
  })) }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
