import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [practiceHtml, commonJs] = await Promise.all([
  readFile(new URL('../chinese-app/public/practice.html', import.meta.url), 'utf8'),
  readFile(new URL('../chinese-app/public/js/common.js', import.meta.url), 'utf8'),
]);

const mocks = String.raw`
  window.__sttRequests = 0;
  const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  window.fetch = async input => {
    const url = String(input);
    if (url === '/api/auth/me') return jsonResponse({ student: { id: 's1', name: 'Test', role: 'student' } });
    if (url.includes('/assignments/a1')) return jsonResponse({ assignment: {
      id: 'a1', title: 'Gesture test', items: [{
        id: 'i1', orderIndex: 0, traditionalText: '好', englishMeaning: 'good', jyutping: 'hou2', imageUrl: '',
      }],
    } });
    if (url.includes('/attempts/ensure')) return jsonResponse({ attempt: {
      id: 'at1', status: 'in_progress', items: [{ assignmentItemId: 'i1' }],
    } });
    if (url === '/api/chinese/upload') return jsonResponse({ message: 'Storage disabled' }, 501);
    if (url === '/api/chinese/stt') {
      window.__sttRequests += 1;
      return jsonResponse({ transcript: '好', correct: true, score: 100 });
    }
    return jsonResponse({});
  };

  const fakeTrack = { stop() {} };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [fakeTrack] }) },
  });
  class FakeMediaRecorder {
    static isTypeSupported() { return true; }
    constructor(stream, options = {}) {
      this.stream = stream;
      this.mimeType = options.mimeType || 'audio/webm';
      this.state = 'inactive';
    }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({ data: new Blob([new Uint8Array(100)], { type: this.mimeType }) });
      this.onstop?.();
    }
  }
  window.MediaRecorder = FakeMediaRecorder;
`;

const testHtml = practiceHtml
  .replace(/<link rel="stylesheet"[^>]*>/, '')
  .replace(/<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/hanzi-writer[^>]*><\/script>/, '')
  .replace(
    '<script src="/chinese/js/common.js"></script>',
    `<script>${commonJs}<\/script><script>${mocks}<\/script>`,
  );

const installedBrowser = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find(existsSync);
const browser = await chromium.launch({
  headless: true,
  ...(installedBrowser ? { executablePath: installedBrowser } : {}),
});
try {
  const page = await browser.newPage({ hasTouch: true, isMobile: true });
  const testUrl = 'http://chinese-recording.test/chinese/practice?assignmentId=a1';
  await page.route(testUrl, route => route.fulfill({ contentType: 'text/html', body: testHtml }));
  await page.goto(testUrl, { waitUntil: 'domcontentloaded' });
  const button = page.locator('.record-btn');
  await button.waitFor();

  const pointer = { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0 };
  await button.dispatchEvent('pointerdown', pointer);
  await assert.doesNotReject(() => button.waitFor({ state: 'attached', timeout: 500 }));
  await page.waitForFunction(() => document.querySelector('.record-btn')?.getAttribute('aria-pressed') === 'true');

  await button.dispatchEvent('pointerleave', pointer);
  await page.waitForTimeout(100);
  assert.equal(await button.getAttribute('aria-pressed'), 'true', 'moving outside must keep recording active');
  assert.equal(await page.evaluate(() => window.__sttRequests), 0, 'moving outside must not submit audio');

  await button.dispatchEvent('pointerup', pointer);
  await page.waitForFunction(() => window.__sttRequests === 1);

  const nextButton = page.locator('.record-btn');
  const cancelledPointer = { pointerId: 8, pointerType: 'touch', isPrimary: true, button: 0 };
  await nextButton.dispatchEvent('pointerdown', cancelledPointer);
  await page.waitForFunction(() => document.querySelector('.record-btn')?.getAttribute('aria-pressed') === 'true');
  await nextButton.dispatchEvent('pointercancel', cancelledPointer);
  await page.waitForTimeout(650);
  assert.equal(await page.evaluate(() => window.__sttRequests), 1, 'cancelled gestures must discard audio');

  console.log('✅ Cantonese recording hold gesture test passed.');
} finally {
  await browser.close();
}
