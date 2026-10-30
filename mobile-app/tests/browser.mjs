import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const { chromium, webkit } = require('playwright');
const bcrypt = require('bcryptjs');
const output = path.join(root, 'mobile-app/test-results');
await mkdir(output, { recursive: true });
const fixture = path.join(output, 'fixture.json');
const users = [
  { studentid: 'MOBILESTUDENT', name: '試用學生', role: 'student', classname: 'P4', classno: 1 },
  { studentid: 'MOBILETEACHER', name: '試用老師', role: 'teacher', classname: '' }
].map(user => ({ ...user, passwordhash: bcrypt.hashSync('pilot-fixture-only', 4), language: 'zh-HK' }));
await writeFile(fixture, JSON.stringify({ users, studentStats: [], questionLogs: [], _logId: 0,
  platformSettings: { currentAcademicYear: '2025-26' },
  homeworkMonitors: [{ id: 1, academicYear: '2025-26', className: 'P4', subject: 'chinese-a', studentId: 'MOBILESTUDENT', createdBy: 'MOBILETEACHER' }]
}));
const reservation = createServer();
reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const backend = `http://127.0.0.1:${port}`;
let logs = '';
const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), NODE_ENV: 'development',
    BUIO_JSON_DB_FILE: fixture, SCIENCE_INQUIRY_MEDIA_DIR: path.join(output, 'media'),
    SUPABASE_DB_URL: '', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '',
    MOCK_AUTH: '0', REQUEST_METRICS_SAMPLE_RATE: '0' },
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stdout.on('data', data => { logs += data; });
child.stderr.on('data', data => { logs += data; });
const modules = JSON.parse(await readFile(new URL('../modules.json', import.meta.url)));
let staticServer;
const report = { environment: 'Windows desktop browser engines with mobile viewports; not WKWebView or physical iOS', checks: [] };
try {
  let ready = false;
  for (let i = 0; i < 160; i++) {
    try { if ((await fetch(backend + '/health/live')).ok) { ready = true; break; } } catch {}
    if (child.exitCode !== null) throw new Error('Fixture server exited: ' + logs.slice(-2000));
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'Fixture server did not start: ' + logs.slice(-2000));
  const webRoot = fileURLToPath(new URL('../www/', import.meta.url));
  staticServer = createServer(async (req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'offline.html';
    if (!['offline.html', 'offline.css', 'offline.js', 'runtime.js', 'settings.js'].includes(name)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html');
    if (name === 'settings.js') res.end(`window.BuiOAppSettings={backendUrl:${JSON.stringify(backend)},version:'test'};`);
    else res.end(await readFile(path.join(webRoot, name)));
  });
  staticServer.listen(0, '127.0.0.1'); await once(staticServer, 'listening');
  const fallback = `http://127.0.0.1:${staticServer.address().port}/offline.html`;

  for (const [engine, browserType, viewport] of [
    ['chromium-iphone', chromium, { width: 390, height: 750 }],
    ['webkit-iphone', webkit, { width: 390, height: 750 }],
    ['webkit-iphone-landscape', webkit, { width: 750, height: 369 }],
    ['webkit-ipad', webkit, { width: 1024, height: 720 }],
    ['webkit-ipad-portrait', webkit, { width: 768, height: 976 }]
  ]) {
    const browser = await browserType.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport, hasTouch: true });
      await context.addInitScript({ path: path.join(webRoot, 'runtime.js') });
      const page = await context.newPage();
      const assertFits = async label => {
        const geometry = await page.evaluate(() => ({
          width: innerWidth,
          scrollWidth: document.documentElement.scrollWidth,
          textAdjust: getComputedStyle(document.documentElement).webkitTextSizeAdjust,
          app: window.BuiOMobile?.version,
          overflow: [...document.querySelectorAll('body *')].filter(element => {
            const box = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return box.width > 0 && box.right > innerWidth + 1 && style.position !== 'absolute' && style.position !== 'fixed';
          }).slice(0, 5).map(element => element.className)
        }));
        assert.equal(geometry.app, '0.1.1', `${engine} ${label}: document-start helper`);
        assert.ok(geometry.scrollWidth <= geometry.width + 1, `${engine} ${label}: ${JSON.stringify(geometry)}`);
      };
      await page.goto(fallback);
      await page.getByRole('heading', { name: '暫時未能連接平台' }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(output, `${engine}-offline.png`), fullPage: true });
      await Promise.all([page.waitForURL(backend + '/'), page.getByRole('button', { name: /重新連接/ }).click()]);
      await page.locator('#loginForm').waitFor();
      await assertFits('login');
      const loginGeometry = await page.locator('#loginForm button[type=submit]').boundingBox();
      if (viewport.height >= 600 && viewport.width <= 500) {
        assert.ok(loginGeometry.y + loginGeometry.height <= viewport.height, `${engine}: login action must be on the initial phone screen`);
      }
      await page.screenshot({ path: path.join(output, `${engine}-login.png`), fullPage: true });
      await page.locator('#userIdInput').fill('MOBILESTUDENT');
      await page.locator('#passwordInput').fill('pilot-fixture-only');
      await page.locator('#loginForm button[type=submit]').click();
      await page.waitForFunction(() => !document.querySelector('#loginForm'), { timeout: 15000 });
      const me = await page.evaluate(() => fetch('/api/auth/me', { credentials: 'include' }).then(response => response.json()));
      assert.equal(me.student.id, 'MOBILESTUDENT');
      await assertFits('student home');
      await page.screenshot({ path: path.join(output, `${engine}-student.png`), fullPage: true });
      await page.locator('[data-view="modules"]').click();
      await page.locator('.modules-page').waitFor();
      await assertFits('module menu');
      await page.screenshot({ path: path.join(output, `${engine}-modules.png`), fullPage: true });
      for (const module of modules.filter(module => module.roles.includes('student'))) {
        const response = await context.request.get(backend + module.path);
        assert.equal(response.status(), 200, `${engine} student ${module.path}`);
        assert.match(response.headers()['content-type'], /text\/html/);
      }
      // Actual client navigation, not just HTML availability.
      await page.goto(backend + '/pet');
      await page.waitForFunction(() => document.body.innerText.includes('寵物'), { timeout: 20000 });
      assert.ok(!page.url().endsWith('/'));
      await page.screenshot({ path: path.join(output, `${engine}-pet.png`), fullPage: true });
      await assertFits('pet entry');
      const studentReport = await context.request.get(backend + '/report.html', { maxRedirects: 0 });
      assert.equal(studentReport.status(), 302, 'Teacher report remains protected');
      await context.request.post(backend + '/api/auth/logout');
      const afterLogout = await context.request.get(backend + '/api/auth/me');
      assert.equal(afterLogout.status(), 401);
      const login = await context.request.post(backend + '/api/auth/login', { data: { studentId: 'MOBILETEACHER', password: 'pilot-fixture-only' } });
      assert.equal(login.status(), 200);
      for (const module of modules) {
        const response = await context.request.get(backend + module.path);
        assert.equal(response.status(), 200, `${engine} teacher ${module.path}`);
        assert.match(response.headers()['content-type'], /text\/html/);
      }
      // The native injected code receives browser events without altering a match.
      await page.goto(backend + '/');
      await page.addScriptTag({ path: path.join(webRoot, 'runtime.js') });
      await context.setOffline(true);
      await page.getByText('網絡已中斷，正在等待重新連線').waitFor();
      await context.setOffline(false);
      await page.getByText('網絡已中斷，正在等待重新連線').waitFor({ state: 'detached' });
      await context.close();
      report.checks.push({ engine, login: 'passed', modules: modules.length, permissions: 'role checks passed', fallback: 'passed', reconnectNotice: 'passed' });
    } finally { await browser.close(); }
  }
  await writeFile(path.join(output, 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (staticServer) await new Promise(resolve => staticServer.close(resolve));
  child.kill('SIGTERM');
  if (child.exitCode === null) await once(child, 'exit');
  await writeFile(path.join(output, 'fixture-server.log'), logs);
}
