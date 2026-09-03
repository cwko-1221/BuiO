import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

await import('../server.js');
await new Promise((resolve) => setTimeout(resolve, 500));

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const browserCandidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
];
const executablePath = browserCandidates.find((path) => existsSync(path));

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {})
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];

page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
    errors.push(msg.text());
  }
});
page.on('pageerror', (err) => errors.push(err.message));

await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.screenshot({ path: 'portal-login-desktop.png', fullPage: true });
await page.click('button:has-text("進入平台")');
await page.waitForSelector('text=我的學習模組');
await page.screenshot({ path: 'portal-student-desktop.png', fullPage: true });
await page.click('button:has-text("設定")');
await page.fill('input[name="math"]', 'https://example.com/math');
await page.fill('input[name="whiteboard"]', 'https://example.com/whiteboard');
await page.fill('input[name="roomCode"]', 'P4A-TEST');
await page.click('button:has-text("儲存設定")');
await page.waitForSelector('text=P4A-TEST');
await page.setViewportSize({ width: 390, height: 860 });
await page.screenshot({ path: 'portal-student-mobile.png', fullPage: true });

await browser.close();

if (errors.length > 0) {
  throw new Error(`Browser errors: ${errors.join('\\n')}`);
}

console.log('Browser verification passed.');
process.exit(0);
