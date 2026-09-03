import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const [practiceHtml, commonJs] = await Promise.all([
  readFile(new URL('../chinese-app/public/practice.html', import.meta.url), 'utf8'),
  readFile(new URL('../chinese-app/public/js/common.js', import.meta.url), 'utf8'),
]);
assert.doesNotMatch(practiceHtml, /data\.status === 'inconclusive'/,
  'an inconclusive score must use the same short red retry feedback instead of a yellow warning');

const mocks = String.raw`
  window.__pronunciationRequests = 0;
  window.__recordingStarts = [];
  window.__recordingStops = [];
  window.__archiveUploads = [];
  window.__assessmentUploads = [];
  window.__hanziChars = [];
  const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  window.fetch = async (input, options = {}) => {
    const url = String(input);
    if (url === '/api/auth/me') return jsonResponse({ student: { id: 's1', name: 'Test', role: 'student' } });
    if (url.includes('/assignments/a1')) return jsonResponse({ assignment: {
      id: 'a1', title: 'Gesture test', items: [{
        id: 'i1', orderIndex: 0, traditionalText: '海豚', englishMeaning: 'dolphin', jyutping: 'hoi2 tyun4', imageUrl: '',
      }],
    } });
    if (url.includes('/attempts/ensure')) return jsonResponse({ attempt: {
      id: 'at1', status: 'in_progress', items: [{ assignmentItemId: 'i1' }],
    } });
    if (url === '/api/chinese/upload') {
      const file = options.body?.get?.('file');
      const entry = { type: file?.type || '', size: file?.size || 0, startedAt: performance.now(), completedAt: null };
      window.__archiveUploads.push(entry);
      await new Promise(resolve => setTimeout(resolve, 1000));
      entry.completedAt = performance.now();
      return jsonResponse({ publicUrl: 'https://storage.test/recording' });
    }
    if (url === '/api/chinese/pronunciation') {
      window.__pronunciationRequests += 1;
      const passed = window.__pronunciationRequests === 1;
      const file = options.body?.get?.('audio');
      window.__assessmentUploads.push({ type: file?.type || '', size: file?.size || 0, startedAt: performance.now() });
      return jsonResponse({
        transcript: passed ? '海豚' : '開豚',
        status: passed ? 'pass' : 'retry', correct: passed, score: passed ? 88 : 52,
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

  class FakeMediaRecorder {
    static isTypeSupported(type) { return type === 'audio/webm;codecs=opus'; }
    constructor(stream, options = {}) {
      this.stream = stream;
      this.mimeType = options.mimeType || 'audio/webm;codecs=opus';
      this.audioBitsPerSecond = options.audioBitsPerSecond;
      this.state = 'inactive';
      window.__archiveBitrate = this.audioBitsPerSecond;
    }
    start() { this.state = 'recording'; }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob([new Uint8Array(120)], { type: this.mimeType }) });
        this.onstop?.();
      });
    }
  }
  window.MediaRecorder = FakeMediaRecorder;

  window.HanziWriter = {
    create(container, character) {
      window.__hanziChars.push(character);
      container.innerHTML = '<svg aria-label="' + character + '"></svg>';
      return { quiz({ onComplete }) { window.__completeHanzi = onComplete; } };
    },
  };
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
  assert.equal(await page.locator('.message-card').textContent(), '✅ 發音標準度：88%',
    'passing feedback must be one short green message');
  assert.ok(await page.locator('.message-card').evaluate(element => element.classList.contains('success')),
    'passing feedback must use the green success style');
  const firstTransfer = await page.evaluate(() => ({
    archive: window.__archiveUploads[0],
    assessment: window.__assessmentUploads[0],
    bitrate: window.__archiveBitrate,
  }));
  assert.equal(firstTransfer.archive.type, 'audio/webm;codecs=opus');
  assert.equal(firstTransfer.bitrate, 24000);
  assert.ok(firstTransfer.archive.size < firstTransfer.assessment.size,
    'the archived recording must be smaller than the lossless Azure WAV');
  assert.equal(firstTransfer.assessment.type, 'audio/wav',
    'Azure assessment must retain the lossless WAV');
  assert.equal(firstTransfer.archive.completedAt, null,
    'the score must appear without waiting for the slower archive upload');

  await page.evaluate(() => window.__completeHanzi());
  await page.waitForFunction(() => window.__hanziChars.at(-1) === '豚');
  assert.deepEqual(await page.evaluate(() => window.__hanziChars.slice(0, 2)), ['海', '豚'],
    'handwriting must advance to the next character after recording re-renders the page');

  await page.locator('.record-btn').click();
  await page.waitForFunction(() => document.querySelector('.record-btn')?.getAttribute('aria-pressed') === 'true');
  await page.waitForFunction(() => window.__recordingStops.length === 2, null, { timeout: 6000 });
  const automaticDuration = await page.evaluate(() => window.__recordingStops[1] - window.__recordingStarts[1]);
  assert.ok(automaticDuration >= 4900 && automaticDuration <= 5300,
    `automatic recording duration must be about 5 seconds (was ${automaticDuration}ms)`);
  await page.waitForFunction(() => window.__pronunciationRequests === 2);
  await page.waitForFunction(() => document.querySelector('.message-card')?.textContent
    === '❌ 發音標準度：52%，請再試一次。');
  assert.ok(await page.locator('.message-card').evaluate(element => element.classList.contains('danger')),
    'failing feedback must use the red danger style');
  await page.waitForFunction(() => window.__archiveUploads.length === 2
    && window.__archiveUploads.every(upload => upload.completedAt !== null));

  console.log('✅ Cantonese recording, compression, feedback, and handwriting continuity tests passed.');
} finally {
  await browser.close();
}
