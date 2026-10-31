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
const deep = process.argv.includes('--deep');
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
    if (!['offline.html', 'offline.css', 'offline.js', 'runtime.js', 'settings.js', 'inset-probe.html', 'inset-late.css'].includes(name)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', name.endsWith('.css') ? 'text/css' : name.endsWith('.js') ? 'text/javascript' : 'text/html');
    if (name === 'inset-probe.html') res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>.probe{padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}</style><div class="probe">safe area shorthand</div>');
    else if (name === 'inset-late.css') res.end('.late-probe{padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}');
    else if (name === 'settings.js') res.end(`window.BuiOAppSettings={backendUrl:${JSON.stringify(backend)},version:'test'};`);
    else res.end(await readFile(path.join(webRoot, name)));
  });
  staticServer.listen(0, '127.0.0.1'); await once(staticServer, 'listening');
  const fallback = `http://127.0.0.1:${staticServer.address().port}/offline.html`;

  for (const [engine, browserType, viewport] of [
    ['chromium-iphone', chromium, { width: 390, height: 844 }],
    ['webkit-iphone', webkit, { width: 402, height: 874 }],
    ['webkit-iphone-landscape', webkit, { width: 874, height: 402 }],
    ['webkit-ipad', webkit, { width: 1024, height: 768 }],
    ['webkit-ipad-portrait', webkit, { width: 768, height: 1024 }],
    ['webkit-iphone-small', webkit, { width: 375, height: 667 }],
    ['webkit-ipad-split', webkit, { width: 600, height: 900 }]
  ]) {
    if (deep && !['chromium-iphone', 'webkit-ipad'].includes(engine)) continue;
    const browser = await browserType.launch({ headless: true });
    try {
      const context = await browser.newContext({ viewport, hasTouch: true });
      const originalViewports = new WeakMap();
      await context.exposeBinding('__buioNativePresentation', async ({ page }, message) => {
        if (message.landscape) {
          if (!originalViewports.has(page)) originalViewports.set(page, page.viewportSize());
          const size = page.viewportSize();
          if (size.height > size.width) await page.setViewportSize({ width: size.height, height: size.width });
        } else if (originalViewports.has(page)) {
          const size = originalViewports.get(page); originalViewports.delete(page); await page.setViewportSize(size);
        }
      });
      await context.addInitScript(() => {
        window.webkit = { messageHandlers: { buioLayout: { postMessage: message => { void window.__buioNativePresentation(message).catch(() => {}); } } } };
      });
      await context.addInitScript({ path: path.join(webRoot, 'runtime.js') });
      await context.addInitScript(({ tablet, small }) => {
        const updateInsets = () => {
          const landscape = innerWidth > innerHeight;
          const insets = tablet ? [24, 0, 20, 0] : small ? [20, 0, 0, 0] : landscape ? [0, 62, 21, 62] : [62, 0, 34, 0];
          ['top', 'right', 'bottom', 'left'].forEach((edge, index) => document.documentElement.style.setProperty('--buio-safe-' + edge, insets[index] + 'px'));
        };
        document.addEventListener('DOMContentLoaded', updateInsets);
        addEventListener('resize', updateInsets);
      }, { tablet: engine.includes('ipad'), small: engine.includes('small') });
      const page = await context.newPage();
      const insetPage = await context.newPage();
      await insetPage.goto(fallback.replace('offline.html', 'inset-probe.html'));
      const probe = await insetPage.evaluate(() => {
        window.BuiOApplyInsets({ top: 9, right: 8, bottom: 7, left: 6 });
        const css = getComputedStyle(document.querySelector('.probe'));
        return [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft];
      });
      assert.deepEqual(probe, ['9px', '8px', '7px', '6px'], 'Native safe-area updates must reach CSS shorthands');
      const lateProbe = await insetPage.evaluate(async () => {
        const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'inset-late.css';
        const loaded = new Promise(resolve => { link.onload = resolve; });
        document.head.append(link); await loaded;
        const element = document.createElement('div'); element.className = 'late-probe'; document.body.append(element);
        await new Promise(requestAnimationFrame);
        const style = getComputedStyle(element);
        return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft];
      });
      assert.deepEqual(lateProbe, ['9px', '8px', '7px', '6px'], 'Late-loaded module CSS must receive native safe areas');
      await insetPage.close();
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
        assert.equal(geometry.app, '0.2.0', `${engine} ${label}: document-start helper`);
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
      await page.screenshot({ path: path.join(output, `${engine}-home-screen.png`) });
      if (viewport.width < 900) {
        const tabBar = await page.locator('.side-nav').boundingBox();
        assert.ok(Math.abs(tabBar.y + tabBar.height - viewport.height) <= 1, 'Phone tabs stay at the window bottom');
        await page.evaluate(() => scrollTo(0, document.scrollingElement.scrollHeight));
        const scrolledTabBar = await page.locator('.side-nav').boundingBox();
        assert.ok(Math.abs(scrolledTabBar.y + scrolledTabBar.height - viewport.height) <= 1, 'Phone tabs remain reachable after scrolling');
      }
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
      await page.locator('.pet-nav').waitFor();
      if (viewport.width < 900) {
        await page.locator('[data-buio-more]').waitFor();
        assert.equal(await page.locator('.pet-nav > button:visible').count(), 5);
        const navSize = await page.locator('.pet-nav').evaluate(nav => ({ client: nav.clientWidth, scroll: nav.scrollWidth }));
        assert.ok(navSize.scroll <= navSize.client + 1, 'Pet navigation fits five phone destinations');
        await page.locator('[data-buio-more]').click();
        await page.locator('[data-buio-sheet][open]').waitFor();
        assert.equal(await page.locator('[data-buio-sheet] [data-tab]').count(), 4, 'All secondary pet modules remain available');
        await page.screenshot({ path: path.join(output, `${engine}-pet-more.png`) });
        await page.locator('[data-buio-sheet] [data-tab="settings"]').click();
        await page.locator('.pet-nav [data-tab="settings"].active').waitFor({ state: 'attached' });
        await page.locator('.pet-nav [data-tab="home"]').click();
      }
      assert.ok(!page.url().endsWith('/'));
      await page.screenshot({ path: path.join(output, `${engine}-pet.png`), fullPage: true });
      await assertFits('pet entry');
      if (deep) {
        const petTab = async tab => {
          const direct = page.locator(`.pet-nav > [data-tab="${tab}"]`);
          if (page.viewportSize().width < 900 && ['shop', 'coinPusher', 'visit', 'settings'].includes(tab)) {
            await page.locator('[data-buio-more]').click();
            await page.locator(`[data-buio-sheet] [data-tab="${tab}"]`).click();
          } else await direct.click();
        };
        if (await page.locator('[data-action="hatch"]').count()) {
          await page.locator('[data-action="hatch"]').click();
          await page.locator('.reveal-card').waitFor();
          await page.locator('.modal-card [data-action="back-home"]').click();
        }
        await page.locator('#game-root canvas').waitFor();
        await petTab('collection'); await page.locator('.pet-card').first().waitFor();
        await page.screenshot({ path: path.join(output, `${engine}-pet-collection.png`) });
        await petTab('shop'); await page.locator('.shop-feature').waitFor();
        await page.screenshot({ path: path.join(output, `${engine}-pet-shop.png`) });
        await petTab('park'); await page.locator('.park-root').waitFor();
        await page.locator('[data-park-loading]').waitFor({ state: 'hidden', timeout: 45000 });
        for (const size of [viewport, { width: viewport.height, height: viewport.width }]) {
          await page.setViewportSize(size);
          await page.screenshot({ path: path.join(output, `${engine}-pet-park-${size.width}.png`), animations: 'disabled' });
          const geometry = await page.locator('.pet-shell').evaluate(shell => ({
            height: shell.getBoundingClientRect().height, viewport: innerHeight,
            navigationBottom: document.querySelector('.pet-nav').getBoundingClientRect().bottom
          }));
          assert.ok(geometry.height <= size.height + 1 && geometry.navigationBottom <= size.height + 1,
            `Park layout must fit after rotation: ${JSON.stringify(geometry)}`);
          const safeControls = await page.locator('.park-hud button:visible').evaluateAll(buttons => {
            const style = getComputedStyle(document.documentElement);
            const safe = edge => parseFloat(style.getPropertyValue('--buio-safe-' + edge)) || 0;
            return buttons.every(button => {
              const box = button.getBoundingClientRect();
              return box.left >= safe('left') && box.right <= innerWidth - safe('right') + 1 &&
                box.top >= safe('top') && box.bottom <= innerHeight - safe('bottom') + 1;
            });
          });
          assert.ok(safeControls, 'Park floating controls must avoid the camera and home indicator');
        }
        await page.setViewportSize(viewport);
        await page.locator('.park-hud [data-park="home"]').click();
        await page.locator('.pet-nav [data-tab="home"].active').waitFor({ state: 'attached' });
        await petTab('brawl'); await page.locator('[data-brawl="mode"][data-id="practice"]').click();
        await page.locator('[data-brawl="start"]:enabled').first().click();
        await page.waitForFunction(() => window.__petGame?.scene.isActive('Brawl') && !document.querySelector('.brawl-loading'), { timeout: 45000 });
        await page.screenshot({ path: path.join(output, `${engine}-pet-battle.png`) });
        await assertFits('pet battle');
        const controls = await page.locator('.brawl-controls').boundingBox();
        assert.ok(controls && controls.y + controls.height <= page.viewportSize().height, 'Battle touch controls stay on screen');
        const hud = await page.locator('.brawl-hud').boundingBox();
        const safeLeft = await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--buio-safe-left')));
        assert.ok(hud && hud.x >= safeLeft, 'Battle health and pause controls avoid the camera housing');
        await page.keyboard.press('Escape');
        await page.locator('[data-brawl="lobby"]').click();
        await page.waitForFunction(() => !document.querySelector('.pet-shell.brawl-active'));
        await petTab('home');
        await page.waitForFunction(() => window.__petGame?.scene.isActive('Bedroom'));
        console.log(`${engine}: hatch, collection, shop, practice battle and return passed`);

        const { experiments } = await import('../../science-lab-app/public/js/data/experiments.js');
        if (viewport.height > viewport.width) await page.setViewportSize({ width: viewport.height, height: viewport.width });
        await page.goto(backend + '/science-lab#' + experiments[0].id);
        await page.locator('#stageScreen:not([hidden])').waitFor();
        for (let step = 0; step < 16; step++) {
          if (await page.locator('#stageScreen').getAttribute('data-slide') === 'hypothesis') break;
          if (await page.locator('#stageNext:not([hidden]):not([disabled])').count()) await page.locator('#stageNext').click();
          await page.waitForTimeout(650);
        }
        await page.locator('[data-prediction]').first().waitFor();
        await page.screenshot({ path: path.join(output, `${engine}-science-prediction.png`) });
        await page.locator('[data-prediction]').first().click();
        await page.locator('#stageNext').click();
        await page.locator('#stageScreen').waitFor({ state: 'hidden' });
        await page.locator('#missionPanel.collapsed').waitFor();
        await page.screenshot({ path: path.join(output, `${engine}-science-apparatus.png`) });
        await page.locator('#missionPanelToggle').click();
        await page.screenshot({ path: path.join(output, `${engine}-science-task.png`) });
        await assertFits('science experiment');
        await page.locator('#settingsButton').click();
        const settings = await page.locator('#settingsDialog').boundingBox();
        const current = page.viewportSize();
        assert.ok(settings && settings.y >= 0 && settings.y + settings.height <= current.height, 'Science settings stay on screen');
        await page.screenshot({ path: path.join(output, `${engine}-science-settings.png`) });
        await page.keyboard.press('Escape');
        await page.locator('.portal-link').click(); await page.waitForURL(backend + '/');
        await page.setViewportSize(viewport);
        console.log(`${engine}: science prediction, apparatus, task, settings and exit passed`);
      }
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
      const layoutIssues = [];
      if (!deep && ['webkit-iphone', 'webkit-iphone-landscape', 'webkit-ipad'].includes(engine)) {
        for (const module of modules) {
          console.log(`${engine}: layout ${module.id}`);
          const modulePage = await context.newPage();
          if (['chinese', 'english'].includes(module.id)) {
            // These read models require Postgres. Supply isolated UI data,
            // while authentication and the real page remain unmocked.
            await modulePage.route(url => url.origin === backend &&
              /^\/api\/(chinese|english)\/teacher\/(groups|assignments|bank\/categories)$/.test(url.pathname), route => {
              assert.equal(route.request().method(), 'GET');
              return route.fulfill({ json: { success: true,
                groups: [{ classname: 'P4', group: 'A', label: 'P4 A', count: 1 }],
                assignments: [], categories: [{ category: '手機版面測試', count: 5 }] } });
            });
          }
          await modulePage.goto(backend + module.path, { waitUntil: 'load' });
          if (module.id === 'science-lab' && viewport.height > viewport.width) {
            // The native simulator separately proves automatic scene rotation.
            await modulePage.setViewportSize({ width: viewport.height, height: viewport.width });
          }
          if (['chinese', 'english'].includes(module.id)) {
            await modulePage.waitForURL(/\/teacher$/);
            await modulePage.locator('#root .container .card').first().waitFor();
            await modulePage.locator('#root .page-head h1').waitFor();
          }
          await modulePage.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
          await modulePage.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
          const geometry = await modulePage.evaluate(() => ({
            width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
            title: document.title,
            wideElements: [...document.querySelectorAll('body *')].filter(element => {
              const box = element.getBoundingClientRect();
              return box.width > innerWidth + 1 && getComputedStyle(element).position !== 'absolute';
            }).slice(0, 5).map(element => ({ tag: element.tagName, id: element.id, className: String(element.className) }))
          }));
          await modulePage.screenshot({ path: path.join(output, `${engine}-module-${module.id}.png`) });
          if (geometry.scrollWidth > geometry.width + 1) layoutIssues.push({ engine, module: module.id, ...geometry });
          await modulePage.close();
        }
      }
      if (layoutIssues.length) {
        await writeFile(path.join(output, `${engine}-layout-issues.json`), JSON.stringify(layoutIssues, null, 2));
        assert.fail(JSON.stringify(layoutIssues, null, 2));
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
    } finally { await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 10000))]); }
  }
  await writeFile(path.join(output, deep ? 'deep-report.json' : 'browser-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (staticServer) {
    staticServer.closeAllConnections();
    await new Promise(resolve => staticServer.close(resolve));
  }
  child.kill('SIGTERM');
  if (child.exitCode === null) {
    await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 3000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  await writeFile(path.join(output, 'fixture-server.log'), logs);
}
