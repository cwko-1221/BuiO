// App-only teacher regressions, using a separate synthetic JSON database.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
const require = createRequire(path.join(root, 'package.json'));
const { webkit } = require('playwright');
const bcrypt = require('bcryptjs');
const out = path.join(root, 'mobile-app/test-results/teacher-build9');
await mkdir(out, { recursive: true });
const users = [
  { studentid: 'MOBILETEACHER', name: '版面測試老師', role: 'teacher' },
  ...Array.from({ length: 12 }, (_, i) => ({ studentid: 'MOBILE' + String(i).padStart(3, '0'),
    name: i === 1 ? '版面測試 Basilio Ofelia Eiko Vallez' : '測試學生 ' + (i + 1),
    role: 'student', classname: i < 6 ? 'P4' : 'P5', classno: i + 1,
    chinesegroup: 'A組', englishgroup: 'B組', mathgroup: 'A組' }))
].map(user => ({ ...user, passwordhash: bcrypt.hashSync('pilot-fixture-only', 4), language: 'zh-HK' }));
const fixture = path.join(out, 'fixture.json');
await writeFile(fixture, JSON.stringify({ users, studentStats: [], questionLogs: [], _logId: 0,
  platformSettings: { currentAcademicYear: '2025-26' } }));
const reservation = createServer().listen(0, '127.0.0.1'); await once(reservation, 'listening');
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const backend = 'http://127.0.0.1:' + port;
let logs = '', browser;
const child = spawn(process.execPath, ['server.js'], { cwd: root,
  env: { ...process.env, PORT: String(port), NODE_ENV: 'development', BUIO_JSON_DB_FILE: fixture,
    SUPABASE_DB_URL: '', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', SUPABASE_SERVICE_ROLE_KEY: '', MOCK_AUTH: '0', REQUEST_METRICS_SAMPLE_RATE: '0' },
  stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', data => { logs += data; }); child.stderr.on('data', data => { logs += data; });
const reports = [];
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(backend + '/health/live')).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, logs.slice(-1500)); browser = await webkit.launch({ headless: true });
  for (const viewport of [{ width: 375, height: 667 }, { width: 402, height: 874 }, { width: 768, height: 1024 }, { width: 1376, height: 1032 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true });
    await context.addInitScript({ path: path.join(root, 'mobile-app/www/runtime.js') });
    await context.addInitScript(({ tablet }) => {
      document.addEventListener('DOMContentLoaded', () => window.BuiOApplyInsets({ top: tablet ? 24 : 62, bottom: tablet ? 20 : 34, left: 0, right: 0 }));
    }, { tablet: viewport.width > 600 });
    const login = await context.request.post(backend + '/api/auth/login', { data: { studentId: 'MOBILETEACHER', password: 'pilot-fixture-only' } });
    assert.equal(login.status(), 200);
    // Every page-level API interaction in this review must be read-only.
    const writes = [];
    context.on('request', request => { if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(request.method() + ' ' + request.url()); });
    const page = await context.newPage(); await page.goto(backend + '/');
    await page.locator('[data-buio-workbench] .buio-teacher-stat strong').filter({ hasText: '12' }).waitFor();
    assert.equal(await page.locator('.buio-quick-tools > .module-card').count(), 4);
    assert.equal(await page.locator('#openBuzzerBtn,#openBoardBtn,#rejoinBoardBtn,#endSessionBtn').count(), 0);
    const fit = async () => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await fit(); await page.screenshot({ path: path.join(out, 'home-' + viewport.width + '.png'), fullPage: true });
    await page.locator('.buio-text-action').click();
    await page.locator('.module-grid.modules-page').waitFor();
    const moduleIds = await page.locator('[data-open-module]').evaluateAll(nodes => nodes.map(node => node.dataset.openModule));
    for (const id of ['buzzer', 'whiteboard', 'science-lab', 'chinese', 'game', 'english', 'phonics']) assert.ok(!moduleIds.includes(id), id);
    for (const id of ['math', 'homework', 'multiplication-checklist', 'pet', 'report']) assert.ok(moduleIds.includes(id), id);
    await page.locator('.side-nav [data-view=dashboard]').click();
    await page.locator('.buio-student-tool button').click();
    await page.locator('[data-buio-students] .management-student-row').first().waitFor();
    assert.equal(await page.locator('.management-student-row').count(), 12);
    assert.equal(await page.locator('#addStudentForm').isVisible(), false);
    await page.screenshot({ path: path.join(out, 'students-' + viewport.width + '.png'), fullPage: true });
    const first = page.locator('.management-student-row').first(); await first.locator('summary').click();
    assert.equal(await first.locator('.inline-edit:visible').count(), 5);
    const layout = await first.locator('.student-edit-fields').evaluate(fields => {
      const box = fields.getBoundingClientRect();
      return [...fields.querySelectorAll('label')].map(label => {
        const input = label.querySelector('input,select'); const bounds = input.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(label.firstChild);
        return { labelLines: range.getClientRects().length, inputWidth: bounds.width, height: bounds.height,
          fits: bounds.left >= box.left - 1 && bounds.right <= box.right + 1 };
      });
    });
    assert.ok(layout.every(item => item.labelLines === 1 && item.height >= 44 && item.fits), JSON.stringify(layout));
    await fit(); await page.screenshot({ path: path.join(out, 'student-edit-' + viewport.width + '.png'), fullPage: true });
    const search = page.locator('.buio-directory-controls input'); await search.fill('Vallez');
    assert.equal(await page.locator('.management-student-row:visible').count(), 1);
    await search.fill(''); await page.locator('.buio-directory-controls select').selectOption('P5');
    assert.equal(await page.locator('.management-student-row:visible').count(), 6);
    await page.goto(backend + '/multiplication-checklist');
    await page.locator('.hero h1').waitFor(); await page.waitForTimeout(300);
    const heading = await page.locator('.hero h1').boundingBox(); const header = await page.locator('.topbar').boundingBox();
    assert.ok(heading.y >= header.y + header.height, JSON.stringify({ heading, header }));
    await fit(); await page.screenshot({ path: path.join(out, 'checklist-' + viewport.width + '.png') });
    await page.evaluate(() => scrollTo(0, 300));
    const sticky = await page.locator('.topbar').boundingBox(); assert.ok(sticky.y >= (viewport.width > 600 ? 24 : 62) - 1);
    assert.deepEqual(writes, [], 'The layout review must not change school data');
    reports.push({ viewport, quickTools: 4, hiddenTeacherModules: 7, directory: 'search, class filter, edit disclosure, five fitting fields passed', checklist: 'title clear of sticky header', writes: 0 });
    await context.close();
  }
  // The plain website and student App retain their existing module catalog.
  const website = await browser.newContext(); await website.request.post(backend + '/api/auth/login', { data: { studentId: 'MOBILETEACHER', password: 'pilot-fixture-only' } });
  const webPage = await website.newPage(); await webPage.goto(backend + '/'); await webPage.locator('#openBuzzerBtn').waitFor();
  assert.ok(await webPage.locator('[data-open-module="science-lab"]').count()); await website.close();
  const student = await browser.newContext(); await student.addInitScript({ path: path.join(root, 'mobile-app/www/runtime.js') });
  await student.request.post(backend + '/api/auth/login', { data: { studentId: 'MOBILE000', password: 'pilot-fixture-only' } });
  const studentPage = await student.newPage(); await studentPage.goto(backend + '/'); await studentPage.locator('.side-nav [data-view=modules]').click();
  for (const id of ['science-lab', 'chinese', 'game', 'english', 'phonics']) await studentPage.locator('[data-open-module="' + id + '"]').waitFor();
  assert.equal(await studentPage.locator('html[data-buio-teacher]').count(), 0); await student.close();
  await writeFile(path.join(out, 'report.json'), JSON.stringify({ reports, website: 'unchanged', studentCatalog: 'retained' }, null, 2));
  console.log(JSON.stringify(reports));
} catch (error) { process.exitCode = 1; throw error; }
finally {
  setTimeout(() => process.exit(process.exitCode ?? 0), 15000).unref();
  if (browser) await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
  child.kill('SIGTERM'); await writeFile(path.join(out, 'server.log'), logs);
}
