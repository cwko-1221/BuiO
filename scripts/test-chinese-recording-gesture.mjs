import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [practiceHtml, commonJs] = await Promise.all([
  readFile(new URL('../chinese-app/public/practice.html', import.meta.url), 'utf8'),
  readFile(new URL('../chinese-app/public/js/common.js', import.meta.url), 'utf8'),
]);

const mocks = String.raw`
  window.__pronunciationRequests = 0;
  window.__recordingStarts = [];
  window.__recordingStops = [];
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
    if (url === '/api/chinese/pronunciation') {
      window.__pronunciationRequests += 1;
      return jsonResponse({
        transcript: '好', status: 'pass', correct: true, score: 88,
        provider: 'azure-pronunciation-zh-HK', quality: { ok: true, metrics: { snrDb: 18 } },
      });
    }
    return jsonResponse({});
  };

  const fakeTrack = { stop() {} };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => ({ getTracks: () => [fakeTrack] }) },
  });
  class FakeAudioContext {
    constructor() {
      this.sampleRate = 48000;
      this.state = 'running';
      this.destination = {};
    }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() {
      const processor = {
        onaudioprocess: null,
        timer: null,
        connect() {
          window.__recordingStarts.push(performance.now());
          this.timer = setInterval(() => {
            const samples = new Float32Array(4096);
            for (let i = 0; i < samples.length; i++) samples[i] = Math.sin(i / 8) * 0.2;
            this.onaudioprocess?.({
              inputBuffer: { getChannelData: () => samples },
              outputBuffer: { getChannelData: () => new Float32Array(4096) },
            });
          }, 30);
        },
        disconnect() {
          clearInterval(this.timer);
          window.__recordingStops.push(performance.now());
        },
      };
      return processor;
    }
    close() {}
  }
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;
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
  assert.match(await button.textContent(), /開始錄音/, 'idle button must offer to start recording');

  await button.click();
  await page.waitForFunction(() => document.querySelector('.record-btn')?.getAttribute('aria-pressed') === 'true');
  assert.match(await button.textContent(), /正在錄音/, 'active button must show the recording state');
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(() => window.__pronunciationRequests), 0, 'the first tap must not submit audio');

  await button.click();
  await page.waitForFunction(() => window.__pronunciationRequests === 1);
  await page.waitForFunction(() => {
    const current = document.querySelector('.record-btn');
    return current && !current.disabled && current.getAttribute('aria-pressed') === 'false';
  });

  await page.locator('.record-btn').click();
  await page.waitForFunction(() => document.querySelector('.record-btn')?.getAttribute('aria-pressed') === 'true');
  await page.waitForFunction(() => window.__recordingStops.length === 2, null, { timeout: 6000 });
  const automaticDuration = await page.evaluate(() => window.__recordingStops[1] - window.__recordingStarts[1]);
  assert.ok(automaticDuration >= 4900 && automaticDuration <= 5300,
    `automatic recording duration must be about 5 seconds (was ${automaticDuration}ms)`);
  await page.waitForFunction(() => window.__pronunciationRequests === 2);

  console.log('✅ Cantonese tap-to-record and five-second auto-send test passed.');
} finally {
  await browser.close();
}
