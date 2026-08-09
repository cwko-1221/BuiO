#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const bcrypt = require('bcryptjs');
const temp = await mkdtemp(path.join(tmpdir(), 'buio-phonics-browser-'));
const dbFile = path.join(temp, 'fixture.json');
const port = 3157;
const base = `http://127.0.0.1:${port}`;
const passwordhash = bcrypt.hashSync('123456', 4);
const user = (studentid, name, role, classname = '', classno = null) => ({
  studentid, name, role, passwordhash, classname, classno,
  chinesegroup: '', englishgroup: '', mathgroup: '', language: 'zh-HK',
});

await writeFile(dbFile, JSON.stringify({
  users: [
    user('T001', '瀏覽器老師', 'teacher'),
    user('S001', '瀏覽器學生', 'student', 'P1', 1),
    user('S002', '未開始學生', 'student', 'P1', 2),
  ], studentStats: [], questionLogs: [], _logId: 0,
}, null, 2));

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.resolve('.'),
  env: {
    ...process.env,
    PORT: String(port), BUIO_JSON_DB_FILE: dbFile, SUPABASE_DB_URL: '', NODE_ENV: 'development',
    GOOGLE_API_KEY: '', GOOGLE_CREDENTIALS_JSON: '', GOOGLE_APPLICATION_CREDENTIALS: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk; });
server.stderr.on('data', chunk => { serverOutput += chunk; });

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Browser fixture server did not start:\n${serverOutput}`);
}

let browser;
try {
  await waitForServer();
  const installedBrowser = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  ].find(existsSync);
  browser = await chromium.launch({
    headless: true,
    ...(installedBrowser ? { executablePath: installedBrowser } : {}),
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const browserErrors = [];
  const failedHttp = [];
  page.on('console', message => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) failedHttp.push({ status: response.status(), url: response.url() });
  });

  await page.goto(base);
  await page.getByLabel('學號 / 教師號').fill('S001');
  await page.getByLabel('密碼').fill('123456');
  await page.getByRole('button', { name: '進入平台' }).click();
  const phonicsCard = page.locator('article').filter({ hasText: '音素列車' });
  await assert.doesNotReject(() => phonicsCard.getByRole('button', { name: '進入模組' }).click());
  await page.getByRole('heading', { name: '逐節聽音，開動拼讀列車！' }).waitFor();
  await page.locator('.level-card').first().waitFor();
  assert.equal(await page.locator('.level-card').count(), 8, 'student sees eight journeys');

  await page.getByRole('button', { name: /First Sounds/ }).click();
  assert.equal(await page.locator('.mini-sound').count(), 0, 'unreliable synthesized isolated-sound controls are not shown');
  const track = page.locator('#trackZone');
  await page.locator('.carriage[data-segment="0"]').dragTo(track);
  await page.waitForFunction(() => document.querySelector('#blendReadout strong')?.textContent !== '—');
  assert.equal((await page.locator('#joinedTrain .joined-carriage').count()), 1, 'dragging attaches the first carriage');

  await page.locator('.carriage[data-segment="1"]').click();
  await page.locator('.carriage[data-segment="2"]').click();
  await page.getByText(/第一組音：s a t p i n · 2\/6/).waitFor({ timeout: 8000 });

  // A child can tap faster than the audio duration; all three taps must still
  // be accepted and advance the journey.
  await page.locator('.carriage[data-segment="0"]').click({ force: true });
  await page.locator('.carriage[data-segment="1"]').click({ force: true });
  await page.locator('.carriage[data-segment="2"]').click({ force: true });
  await page.getByText(/第一組音：s a t p i n · 3\/6/).waitFor({ timeout: 8000 });

  const progressResponse = await page.request.get(`${base}/api/phonics/progress`);
  assert.equal(progressResponse.status(), 200);
  assert.equal((await progressResponse.json()).progress.attempts, 2, 'browser completions are saved');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('.level-card').first().waitFor();
  await page.getByRole('button', { name: /Syllable Express/ }).click();
  const mobileSize = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  assert.ok(mobileSize.scrollWidth <= mobileSize.clientWidth, `mobile page overflow: ${JSON.stringify(mobileSize)}`);
  assert.equal(await page.getByText('SYLLABLE TRAIN · 音節列車').isVisible(), true);

  await context.clearCookies();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(base);
  await page.getByLabel('學號 / 教師號').fill('T001');
  await page.getByLabel('密碼').fill('123456');
  await page.getByRole('button', { name: '進入平台' }).click();
  await page.goto(`${base}/phonics`);
  await page.getByRole('heading', { name: '全班拼讀進度' }).waitFor();
  const americanPreviewHref = await page.getByRole('link', { name: '預覽美式' }).getAttribute('href');
  assert.equal(americanPreviewHref, '/phonics/student?accent=en-us');
  await page.goto(`${base}${americanPreviewHref}`);
  await page.locator('.level-card').first().waitFor();
  assert.equal(await page.getByRole('region', { name: '口音比較' }).isVisible(), false, 'preview stays hidden when Google TTS is not configured');
  await page.goto(`${base}/phonics`);
  await page.getByRole('heading', { name: '全班拼讀進度' }).waitFor();
  assert.equal(await page.locator('#studentRows tr').count(), 2, 'teacher sees active and inactive students');
  assert.match(await page.locator('#studentRows').innerText(), /瀏覽器學生/);
  assert.match(await page.locator('#studentRows').innerText(), /未開始學生/);
  await page.locator('#className').selectOption('P1');
  await page.locator('#classAccent').selectOption('en-us');
  await page.getByRole('button', { name: '儲存口音設定' }).click();
  await page.getByText('P1 已設定為美式英語').waitFor();
  assert.match(await page.locator('#accentHelp').innerText(), /美式英語發音/);

  await context.clearCookies();
  await page.goto(base);
  await page.getByLabel('學號 / 教師號').fill('S001');
  await page.getByLabel('密碼').fill('123456');
  await page.getByRole('button', { name: '進入平台' }).click();
  await page.goto(`${base}/phonics/student`);
  await page.locator('.level-card').first().waitFor();
  assert.match(await page.locator('#audioStatus').innerText(), /Google TTS 尚未設定/);
  const catalogResponse = await page.request.get(`${base}/api/phonics/catalog`);
  assert.equal((await catalogResponse.json()).accent, 'en-us', 'student browser receives the teacher-selected accent');
  const unexpectedHttp = failedHttp.filter(item => !(
    (item.status === 401 && item.url.endsWith('/api/auth/me'))
    || (item.status === 404 && item.url.endsWith('/favicon.ico'))
  ));
  assert.deepEqual(unexpectedHttp, [], 'no unexpected HTTP failures');
  assert.deepEqual(
    browserErrors.filter(message => !message.startsWith('Failed to load resource:')),
    [],
    'no unexpected browser script errors',
  );

  console.log('✅ Phonics drag, rapid-tap, mobile and teacher browser tests passed.');
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
  await new Promise(resolve => server.once('exit', resolve));
  await rm(temp, { recursive: true, force: true });
}
