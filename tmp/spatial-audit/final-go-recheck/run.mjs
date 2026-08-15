import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const outputDirectory = path.resolve('tmp/spatial-audit/final-go-recheck');
await fs.mkdir(outputDirectory, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 667, height: 375 },
];

const cases = [
  { id: 'root-viewer', subject: 'magnifier', answer: 0 },
  { id: 'eco-house', subject: 'thermometer', answer: 1 },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  args: ['--disable-gpu-sandbox'],
});

const results = [];
const errors = [];

const vectorDistance = (a, b) => {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
};

const speed = (pose) => pose?.velocity
  ? Math.hypot(pose.velocity.x, pose.velocity.y, pose.velocity.z)
  : null;

const intersects = (a, b) => Boolean(a && b
  && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top);

for (const viewport of viewports) {
  for (const testCase of cases) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`${viewport.name}/${testCase.id}: console: ${message.text()}`);
    });
    page.on('pageerror', (error) => errors.push(`${viewport.name}/${testCase.id}: pageerror: ${error.message}`));
    await page.goto(`http://127.0.0.1:3000/science-lab/preview?independent-spatial=${Date.now()}-${viewport.name}-${testCase.id}#${testCase.id}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'), null, { timeout: 30000 });
    await page.waitForFunction(() => window.__scienceLabTest?.rendererKind?.() === 'webgl', null, { timeout: 30000 });
    await page.locator(`[data-prediction="${testCase.answer}"]`).click();
    await page.locator('#predictionSubmit').click();
    await page.waitForFunction((subject) => Boolean(window.__scienceLabTest?.getEntityScreenBounds?.(subject)), testCase.subject, { timeout: 30000 });
    await page.waitForTimeout(450);

    const collect = async () => page.evaluate((subject) => {
      const toRect = (element) => {
        if (!element) return null;
        const r = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          left: r.left, top: r.top, right: r.right, bottom: r.bottom,
          width: r.width, height: r.height,
          display: style.display, visibility: style.visibility, opacity: style.opacity,
          pointerEvents: style.pointerEvents,
        };
      };
      const point = window.__scienceLabTest.getEntityPoint(subject);
      const topElement = point && point.x >= 0 && point.x < innerWidth && point.y >= 0 && point.y < innerHeight
        ? document.elementFromPoint(point.x, point.y)
        : null;
      const topIdentity = topElement ? {
        tag: topElement.tagName,
        id: topElement.id,
        className: typeof topElement.className === 'string' ? topElement.className : '',
        entityId: topElement.userData?.entityId || null,
      } : null;
      const mission = document.querySelector('#missionPanel');
      return {
        viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
        canvas: toRect(document.querySelector('#labCanvas')),
        bounds: window.__scienceLabTest.getEntityScreenBounds(subject),
        point,
        topIdentity,
        home: window.__scienceLabTest.getEntityHomePose(subject),
        physics: window.__scienceLabTest.getPhysicsDebug(subject),
        renderer: window.__scienceLabTest.rendererKind(),
        stats: window.__scienceLabTest.getDebugStats(),
        state: window.__scienceLabTest.getState(),
        mission: {
          className: mission?.className || '',
          panel: toRect(mission),
          body: toRect(document.querySelector('#missionPanelBody')),
          toggle: toRect(document.querySelector('#missionPanelToggle')),
        },
        overlays: {
          topbar: toRect(document.querySelector('#topbar')),
          labHeader: toRect(document.querySelector('.lab-header')),
          viewControls: toRect(document.querySelector('.view-controls')),
          variableControl: toRect(document.querySelector('#variableControl')),
          observation: toRect(document.querySelector('#observationStrip')),
          prediction: toRect(document.querySelector('#predictionDialog')),
          result: toRect(document.querySelector('#resultDialog')),
          phenomenon: toRect(document.querySelector('#phenomenonStage')),
        },
      };
    }, testCase.subject);

    const early = await collect();
    await page.screenshot({ path: path.join(outputDirectory, `${viewport.name}-${testCase.id}.png`), fullPage: false });
    await page.waitForTimeout(2200);
    const settled = await collect();

    const canvas = settled.canvas;
    const bounds = settled.bounds;
    const finiteBounds = bounds && ['left', 'right', 'top', 'bottom', 'width', 'height']
      .every((key) => Number.isFinite(bounds[key]));
    const boundsInsideCanvas = Boolean(finiteBounds
      && bounds.left >= canvas.left - 1
      && bounds.right <= canvas.right + 1
      && bounds.top >= canvas.top - 1
      && bounds.bottom <= canvas.bottom + 1);
    const boundsInsideViewport = Boolean(finiteBounds
      && bounds.left >= -1 && bounds.right <= viewport.width + 1
      && bounds.top >= -1 && bounds.bottom <= viewport.height + 1);
    const overlayIntersections = Object.fromEntries(Object.entries(settled.overlays).map(([name, rect]) => [name,
      Boolean(rect && rect.display !== 'none' && rect.visibility !== 'hidden' && Number(rect.opacity) > 0 && rect.width > 1 && rect.height > 1 && intersects(bounds, rect)),
    ]));
    const record = {
      viewport,
      experiment: testCase.id,
      subject: testCase.subject,
      early,
      settled,
      checks: {
        finiteBounds,
        boundsInsideCanvas,
        boundsInsideViewport,
        pointInsideViewport: Boolean(settled.point && settled.point.x >= 0 && settled.point.x <= viewport.width && settled.point.y >= 0 && settled.point.y <= viewport.height),
        missionCollapsed: settled.mission.className.split(/\s+/).includes('collapsed'),
        missionPanelPassThrough: settled.mission.panel?.pointerEvents === 'none',
        missionBodyPassThrough: settled.mission.body?.pointerEvents === 'none',
        missionToggleIntersection: intersects(bounds, settled.mission.toggle),
        overlayIntersections,
        driftFromHome: vectorDistance(settled.physics?.pose?.position, settled.home?.position),
        settleMovement: vectorDistance(settled.physics?.pose?.position, early.physics?.pose?.position),
        earlySpeed: speed(early.physics?.pose),
        settledSpeed: speed(settled.physics?.pose),
        dynamic: settled.physics?.pose?.dynamic ?? null,
        sleeping: settled.physics?.pose?.sleeping ?? null,
        contacts: settled.physics?.contacts || [],
        assets: settled.stats?.assets || null,
      },
    };
    results.push(record);
    await context.close();
  }
}

await browser.close();
const report = {
  build: { js: 'index-DSabTYcd.js', css: 'index-C6r9cTjP.css' },
  generatedAt: new Date().toISOString(),
  errors,
  results,
};
await fs.writeFile(path.join(outputDirectory, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
