import { chromium } from 'playwright';

const scenes = [
  { id: 'transmission', answer: 1, subjects: ['tracer', 'soap'] },
  { id: 'root-viewer', answer: 0, subjects: ['water-cup'] },
  { id: 'density-column', answer: 0, subjects: ['honey', 'water', 'oil'] },
  { id: 'water-filter', answer: 1, subjects: ['sand', 'gravel', 'muddy-water'] },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
});
const results = [];
for (const scene of scenes) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:3000/science-lab/preview?container-audit=${Date.now()}#${scene.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'));
  await page.locator(`[data-prediction="${scene.answer}"]`).click();
  await page.locator('#predictionSubmit').click();
  await page.waitForFunction(() => window.__scienceLabTest?.rendererKind?.() === 'webgl');
  await page.waitForTimeout(500);
  if (scene.id === 'transmission') await page.screenshot({ path: 'tmp/spatial-audit/pump-current.png' });
  const data = await page.evaluate((subjects) => ({
    stats: window.__scienceLabTest.getDebugStats(),
    items: subjects.map((subject) => ({ subject, debug: window.__scienceLabTest.getPourDebug(subject) })),
  }), scene.subjects);
  for (const item of data.items) {
    const { debug } = item;
    const offset = (value) => value ? {
      x: value.x - debug.position.x,
      y: value.y - debug.position.y,
      z: value.z - debug.position.z,
    } : null;
    results.push({
      experiment: scene.id,
      subject: item.subject,
      root: debug.position,
      socket: debug.socket,
      socketOffset: offset(debug.socket),
      grip: debug.grip,
      gripOffset: offset(debug.grip),
      home: debug.home,
      assets: data.stats.assets,
    });
  }
  await context.close();
}
await browser.close();
console.log(JSON.stringify(results, null, 2));
