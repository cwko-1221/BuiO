import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
await page.goto(`http://127.0.0.1:3000/science-lab/preview?pump-closeup=${Date.now()}#transmission`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'));
await page.locator('[data-prediction="1"]').click();
await page.locator('#predictionSubmit').click();
await page.waitForTimeout(500);
const bounds = await page.evaluate(() => window.__scienceLabTest.getEntityScreenBounds('tracer'));
const clip = {
  x: Math.max(0, bounds.left - 35),
  y: Math.max(0, bounds.top - 25),
  width: Math.min(1440, bounds.right + 35) - Math.max(0, bounds.left - 35),
  height: Math.min(900, bounds.bottom + 25) - Math.max(0, bounds.top - 25),
};
await page.screenshot({ path: 'tmp/spatial-audit/pump-closeup-3x.png', clip });
console.log(JSON.stringify({ bounds, clip, resources: await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => /\/assets\/(index-|science-lab-kit-)/.test(name))) }, null, 2));
await browser.close();
