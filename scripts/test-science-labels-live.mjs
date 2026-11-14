import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { experiments } from '../science-lab-app/public/js/data/experiments.zh.js';

const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'buio-screen-labels-'));
const fixture = path.join(temporaryDirectory, 'fixture.json');
await writeFile(fixture, JSON.stringify({ users: [], studentStats: [], questionLogs: [], _logId: 0 }));
const base = 'http://127.0.0.1:3164';
const evidence = path.resolve('tmp/science-labels-qa');
await mkdir(evidence, { recursive: true });
const server = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: '3164', NODE_ENV: 'development', BUIO_JSON_DB_FILE: fixture,
    SUPABASE_DB_URL: '', GOOGLE_API_KEY: '', GOOGLE_CREDENTIALS_JSON: '', GOOGLE_APPLICATION_CREDENTIALS: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', data => { serverOutput += data; });
server.stderr.on('data', data => { serverOutput += data; });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(`${base}/health`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, serverOutput);
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => { Object.defineProperty(navigator, 'deviceMemory', { get: () => 1 }); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const results = [];
  const scenarios = experiments.map(definition => ({ definition, language: 'zh-HK' }));
  scenarios.push({ definition: experiments.find(item => item.id === 'respiratory-system'), language: 'en-US' });
  for (const { definition: { id, prediction }, language } of scenarios) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${base}/science-lab/preview?lang=${language}#${id}`);
    await page.waitForFunction(expected => window.__scienceLabTest?.getState()?.experimentId === expected, id, { timeout: 60000 });
    await page.locator('#stageScreen').waitFor({ state: 'visible' });
    for (let guard = 0; guard < 35; guard++) {
      if (await page.locator('#stageScreen').getAttribute('data-slide') === 'hypothesis') break;
      const next = page.locator('#stageNext');
      if (await next.isVisible() && await next.isEnabled()) await next.click();
      await page.waitForTimeout(200);
    }
    await page.locator(`[data-prediction="${prediction.answer}"]`).click();
    await page.locator('#stageNext').click();
    await page.locator('#stageScreen').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => window.__scienceLabTest.getDebugStats().labels?.visible);
    for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 900 }]]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(500);
      const labels = await page.locator('.science-apparatus-label').evaluateAll(nodes => nodes.map(node => ({
        text: node.textContent, font: parseFloat(getComputedStyle(node).fontSize),
        pointer: getComputedStyle(node).pointerEvents, box: node.getBoundingClientRect().toJSON(),
      })));
      assert.ok(labels.length > 0, `${id}: labels are present`);
      assert.ok(labels.every(label => label.text && label.font >= 14 && label.pointer === 'none'), `${id}: sharp text does not intercept gestures`);
      assert.ok(labels.every(label => label.box.left >= 0 && label.box.right <= viewport.width + 1), `${id}: labels stay in the embed`);
      if (id === 'respiratory-system') assert.equal(labels.length, 6, 'All six draggable organ cards have HTML captions');
      if (language === 'en-US') assert.ok(labels.every(label => /[A-Za-z]/.test(label.text)), 'Organ cards use the platform language');
      await page.screenshot({ path: path.join(evidence, `${id}${language === 'en-US' ? '-en' : ''}-${name}.png`) });
      results.push({ experiment: id, language, viewport: name, labels: labels.length });
    }
    await page.locator('#cameraRightButton').click();
    await page.waitForTimeout(450);
    assert.equal(await page.locator('.science-apparatus-label-layer').count(), 1, 'Only one label layer exists');
    console.log(`✓ ${id} (${language}): desktop / phone labels`);
  }
  assert.deepEqual(errors, []);
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ passed: true, results }, null, 2));
  console.log('All eight experiments have readable, nonblocking HTML labels on desktop and phone.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await Promise.race([new Promise(resolve => server.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 3000))]);
  await rm(temporaryDirectory, { recursive: true, force: true });
}
