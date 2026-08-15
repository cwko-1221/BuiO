import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
for (const [id, answer] of [['density-column', 0], ['root-viewer', 0], ['water-filter', 1]]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:3000/science-lab/preview?final-container=${Date.now()}#${id}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#bootScreen')?.classList.contains('done'));
  await page.locator(`[data-prediction="${answer}"]`).click();
  await page.locator('#predictionSubmit').click();
  await page.waitForFunction(() => window.__scienceLabTest?.rendererKind?.() === 'webgl');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `tmp/spatial-audit/final-${id}-rest.png` });
  await page.close();
}
await browser.close();
