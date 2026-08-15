import { chromium } from 'playwright';

const cases = [
  { experiment: 'transmission', answer: 1, subject: 'tracer', expectedRestY: -.043, autoVisualRestY: -.1234 },
  { experiment: 'density-column', answer: 0, subject: 'honey', expectedRestY: -.045, autoVisualRestY: -.1315 },
  { experiment: 'water-filter', answer: 1, subject: 'sand', prereqs: 1, expectedRestY: -.054, autoVisualRestY: -.0649 },
];

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const results = [];
for (const item of cases) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(`http://127.0.0.1:3000/science-lab/preview?collider=${Date.now()}#${item.experiment}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'));
  await page.locator(`[data-prediction="${item.answer}"]`).click();
  await page.locator('#predictionSubmit').click();
  for (let index = 0; index < (item.prereqs || 0); index += 1) {
    if (await page.locator('#missionPanel.collapsed').count()) await page.locator('#missionPanelToggle').click();
    const step = await page.evaluate(() => window.__scienceLabTest.getState().currentStep);
    await page.locator('#accessibleActionButton').click();
    await page.waitForFunction((before) => window.__scienceLabTest.getState().currentStep > before, step);
  }
  if (!(await page.locator('#missionPanel.collapsed').count())) await page.locator('#missionPanelToggle').click();
  await page.waitForTimeout(350);
  const before = await page.evaluate((id) => ({
    pose: window.__scienceLabTest.getPhysicsPose(id),
    debug: window.__scienceLabTest.getPourDebug(id),
    point: window.__scienceLabTest.getEntityPoint(id),
  }), item.subject);
  const from = before.point;
  const to = { x: Math.max(90, from.x - 46), y: Math.min(650, from.y + 58) };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.waitForTimeout(80);
  const held = await page.evaluate((id) => window.__scienceLabTest.getPhysicsPose(id), item.subject);
  await page.mouse.up();
  await page.waitForTimeout(3200);
  const after = await page.evaluate((id) => ({
    state: window.__scienceLabTest.getState(),
    pose: window.__scienceLabTest.getPhysicsPose(id),
    physics: window.__scienceLabTest.getPhysicsDebug(id),
    debug: window.__scienceLabTest.getPourDebug(id),
    resources: performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /\/assets\/(index-|science-lab-kit-)/.test(name)),
  }), item.subject);
  results.push({
    ...item,
    before,
    held,
    after,
    errorToExplicit: Math.abs(after.pose.position.y - item.expectedRestY),
    errorToAutoVisual: Math.abs(after.pose.position.y - item.autoVisualRestY),
  });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
