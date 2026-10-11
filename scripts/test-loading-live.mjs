import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'tmp', 'loading-qa');
await fs.mkdir(output, { recursive: true });
const counts = new Map();
const html = `<!doctype html><html lang="zh-HK"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/shared/loading.css"><script src="/shared/loading.js"></script><script type="module" src="/slow-bootstrap.js"></script><style>body{margin:0;background:#f3f7fc;color:#254b61;font:16px system-ui}main{max-width:720px;margin:90px auto;padding:26px}h1{font-size:26px}.card{background:white;padding:32px;border-radius:22px;box-shadow:0 8px 30px #254b6112}input{padding:12px;border:1px solid #aac5d3;border-radius:10px;width:200px}</style></head><body><main><h1>BuiO 載入流程驗證</h1><div class="card" id="content"><p class="loading-card">正在準備內容…</p><label>保留中的輸入 <input id="draft" value="尚未儲存的內容"></label></div></main></body></html>`;
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const count = (counts.get(url.pathname) || 0) + 1; counts.set(url.pathname, count);
  if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
  if (url.pathname.startsWith('/shared/')) {
    const file = path.join(root, 'shared', path.basename(url.pathname));
    res.setHeader('Content-Type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript'); res.end(await fs.readFile(file)); return;
  }
  if (url.pathname === '/slow-bootstrap.js') {
    res.setHeader('Content-Type', 'text/javascript'); setTimeout(() => res.end('window.bootFinished=true;'), 1700); return;
  }
  res.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/api/body') {
    res.write('{"value":'); setTimeout(() => res.end('42}'), 1300); return;
  }
  if (url.pathname === '/api/retry' && count === 1) { res.statusCode = 503; res.end('{"success":false}'); return; }
  if (url.pathname === '/api/write' || url.pathname === '/api/abort') { res.statusCode = 503; res.end('{"success":false}'); return; }
  if (url.pathname === '/api/unauthorized') { res.statusCode = 401; res.end('{}'); return; }
  if (url.pathname === '/api/missing') { res.statusCode = 404; res.end('{}'); return; }
  if (url.pathname === '/api/slow') { setTimeout(() => res.end('{"value":42}'), 1200); return; }
  res.end('{"value":42}');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1100, height: 760 } });
const page = await context.newPage();
const status = page.locator('#buio-loading-status');
let passed = 0;
const pass = name => { passed++; console.log('PASS', name); };
try {
  await page.goto(base, { waitUntil: 'commit' });
  await status.waitFor({ state: 'visible' });
  assert.equal(await page.evaluate(() => Boolean(window.bootFinished)), false);
  await page.screenshot({ path: path.join(output, 'initial-loading.png') });
  await page.waitForFunction(() => window.bootFinished);
  await status.waitFor({ state: 'hidden' });
  pass('animation is visible before a deferred module finishes');

  for (let cycle = 0; cycle < 2; cycle++) {
    const task = page.evaluate(() => fetch('/api/slow').then(r => r.json()));
    await status.waitFor({ state: 'visible' }); assert.equal((await task).value, 42);
    await status.waitFor({ state: 'hidden' });
  }
  pass('subsequent slow requests show and clear their animation');

  const body = page.evaluate(() => fetch('/api/body').then(r => r.json()));
  await status.waitFor({ state: 'visible' }); assert.equal((await body).value, 42);
  await status.waitFor({ state: 'hidden' }); pass('slow response bodies remain visibly loading');

  const retry = page.evaluate(() => fetch('/api/retry').then(r => r.json()));
  await status.waitFor({ state: 'visible' }); assert.equal((await retry).value, 42);
  assert.equal(counts.get('/api/retry'), 2); await status.waitFor({ state: 'hidden' }); pass('temporary read failures retry and recover');

  assert.equal(await page.evaluate(() => fetch('/api/write', { method: 'POST', body: '{}' }).then(r => r.status)), 503);
  assert.equal(counts.get('/api/write'), 1); pass('writes are never automatically repeated');

  const cancelled = await page.evaluate(async () => {
    const controller = new AbortController(); setTimeout(() => controller.abort(), 100);
    try { await fetch('/api/abort', { signal: controller.signal }); return 'unexpected'; } catch (error) { return error.name; }
  });
  assert.equal(cancelled, 'AbortError'); assert.equal(counts.get('/api/abort'), 1);
  await status.waitFor({ state: 'hidden' }); pass('cancellation stops retries and releases loading state');

  for (const [url, code] of [['/api/unauthorized', 401], ['/api/missing', 404]]) {
    assert.equal(await page.evaluate(url => fetch(url).then(r => r.status), url), code);
    assert.equal(counts.get(url), 1);
  }
  pass('authorization and missing-data responses are not retried');

  const parallel = page.evaluate(() => Promise.all([fetch('/api/slow').then(r => r.json()), fetch('/api/value').then(r => r.json())]));
  await status.waitFor({ state: 'visible' }); assert.equal((await parallel).length, 2);
  await status.waitFor({ state: 'hidden' }); pass('parallel requests keep feedback until the last finishes');

  await context.setOffline(true);
  const offline = page.evaluate(() => fetch('/api/online').then(r => r.json()));
  await status.waitFor({ state: 'visible' });
  assert.equal(counts.get('/api/online') || 0, 0);
  assert.equal(await page.locator('#draft').inputValue(), '尚未儲存的內容');
  await context.setOffline(false); assert.equal((await offline).value, 42);
  await status.waitFor({ state: 'hidden' }); pass('offline reads wait and resume without losing the form');

  await page.evaluate(() => window.BuiLoading.recover(Object.assign(new Error('raw private server details'), { status: 404 }), () => fetch('/api/value').then(r => r.json())));
  const panel = page.locator('.buio-loading-panel'); await panel.waitFor({ state: 'visible' });
  assert.equal((await panel.textContent()).includes('raw private'), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'retry-mobile.png') });
  const box = await panel.boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 390);
  await panel.getByRole('button', { name: '再試一次' }).click(); await panel.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('#draft').inputValue(), '尚未儲存的內容');
  pass('recovery is actionable, fits mobile and preserves unsaved input');

  assert.equal(await page.evaluate(() => window.BuiLoading.notify('請填寫題目標題')), false);
  assert.equal(await page.evaluate(() => window.BuiLoading.notify('Failed to fetch')), true);
  assert.equal(await page.locator('[data-buio-network-notice]').getAttribute('role'), 'status');
  await page.locator('[data-buio-network-notice] button').click(); pass('technical notices use animation; validation stays actionable');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const motion = page.evaluate(() => window.BuiLoading.run(new Promise(r => setTimeout(r, 1000))));
  await status.waitFor({ state: 'visible' });
  assert.equal(await status.locator('.buio-spinner').evaluate(el => getComputedStyle(el).animationName), 'none');
  await motion; await status.waitFor({ state: 'hidden' }); pass('reduced-motion preference is respected');

  await page.evaluate(() => {
    const element = document.createElement('div'); element.id = 'editorError'; element.className = 'error'; element.textContent = 'Load failed: private server details'; document.querySelector('#content').append(element);
  });
  await page.waitForFunction(() => document.querySelector('#editorError')?.textContent.startsWith('正在等候'));
  assert.equal(await page.locator('#editorError').getAttribute('role'), 'status');
  assert.equal((await page.locator('#editorError').textContent()).includes('private'), false);
  await page.evaluate(() => { document.querySelector('#editorError').textContent = '請填寫標題'; });
  await page.waitForFunction(() => !document.querySelector('#editorError').classList.contains('buio-loading-inline'));
  assert.equal(await page.locator('#editorError').textContent(), '請填寫標題');
  await page.evaluate(() => {
    const element = document.createElement('p'); element.id = 'scopedNotice'; element.className = 'ClassTeacher_buzzerSetupError_a1b2c'; element.textContent = 'Failed to fetch'; document.querySelector('#content').append(element);
  });
  await page.waitForFunction(() => document.querySelector('#scopedNotice')?.textContent.startsWith('正在等候'));
  assert.equal(await page.locator('#scopedNotice').getAttribute('role'), 'status');
  pass('legacy technical error fields become waiting animations without masking validation');

  const sceneReady = page.evaluate(() => new Promise(resolve => {
    const emitter = () => {
      const handlers = new Map();
      return { on(name, fn) { const rows = handlers.get(name) || []; rows.push(fn); handlers.set(name, rows); }, once(name, fn) { this.on(name, fn); }, off(name, fn) { handlers.set(name, (handlers.get(name) || []).filter(row => row !== fn)); }, emit(name) { for (const fn of [...(handlers.get(name) || [])]) fn(); } };
    };
    const scene = { load: emitter(), events: emitter() };
    window.BuiLoading.watchScene(scene);
    // Cached scenes can enter create without a loader COMPLETE event.
    setTimeout(() => { scene.events.emit('create'); resolve(true); }, 1000);
  }));
  await status.waitFor({ state: 'visible' }); assert.equal(await sceneReady, true);
  await status.waitFor({ state: 'hidden' }); pass('cached game scenes end loading even without a download event');

  await page.evaluate(() => { window.manualRetries = 0; window.BuiLoading.recover(Object.assign(new Error('TTS unavailable'), { status: 500 }), () => { window.manualRetries++; }, undefined, { automatic: false }); });
  await page.waitForTimeout(2200); assert.equal(await page.evaluate(() => window.manualRetries), 0);
  await page.locator('.buio-loading-panel').getByRole('button', { name: '再試一次' }).click();
  assert.equal(await page.evaluate(() => window.manualRetries), 1); pass('manual-only service retries wait for a user action');
  await page.evaluate(() => { window.manualRetries = 0; window.BuiLoading.recover(new Error('Failed to fetch'), () => { window.manualRetries++; }); });
  await page.waitForTimeout(2200); assert.equal(await page.evaluate(() => window.manualRetries), 0, 'an exhausted read must not restart an unlimited polling loop');
  await page.locator('.buio-loading-panel').getByRole('button', { name: '再試一次' }).click();
  assert.equal(await page.evaluate(() => window.manualRetries), 1);
  console.log(JSON.stringify({ passed, artifacts: output }));
} finally {
  await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
