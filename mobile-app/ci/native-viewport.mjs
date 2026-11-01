// Run the real WKWebView on iPhone/iPad simulators against an anonymous local
// layout fixture. No school accounts, Apple credentials or production writes.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';
import { FixtureNavigation } from './fixture-navigation.mjs';

if (process.platform !== 'darwin') throw Error('Native viewport checks require Xcode/macOS.');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'test-results/native-viewport');
await mkdir(output, { recursive: true });
const commandStreams = [];
const run = async (command, args, env = {}, timeout = 180000) => {
  console.log(`[native] ${command} ${args.join(' ')}`);
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  commandStreams.push(child.stdout, child.stderr);
  let result = '';
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeout);
  child.stdout.on('data', chunk => { result += chunk; });
  child.stderr.on('data', chunk => { result += chunk; });
  let code;
  // CoreSimulator helpers may inherit a pipe after simctl itself exits.
  // The exit event is the command result; pipe closure is not its lifetime.
  try { [code] = await once(child, 'exit'); } finally { clearTimeout(timer); }
  if (timedOut) throw Error(`${command} ${args.join(' ')} timed out after ${timeout / 1000}s: ${result.slice(-6000)}`);
  if (code !== 0) throw Error(`${command} ${args.join(' ')} failed (${code}): ${result.slice(-6000)}`);
  return result;
};
let received, attachmentCookieReceived = false;
const navigation = new FixtureNavigation();
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
html,body{height:100%;width:100%;margin:0;font:16px -apple-system,sans-serif;background:#edf5f1;color:#203c3b}
#viewport{height:100vh;width:100vw;box-sizing:border-box;border:4px solid #234c44;position:fixed;inset:0;pointer-events:none}
header,footer{position:fixed;left:env(safe-area-inset-left);right:env(safe-area-inset-right);padding:12px;background:#234c44;color:white;text-align:center}
header{top:env(safe-area-inset-top)}footer{bottom:env(safe-area-inset-bottom)}main{padding:90px 24px}h1{font-size:24px}input{font-size:12px;padding:12px;width:100%;box-sizing:border-box}
#safeProbe{position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
</style><script>window.helperAtHead=!!window.BuiOMobile;</script></head><body>
<div id="viewport"><header>杯澳 App · 可用範圍頂部</header><main><h1>原生螢幕適應檢查</h1>
<p>背景填滿螢幕；上下按鈕應避開系統安全範圍。</p><input placeholder="輸入文字不應觸發頁面自動放大">
<pre id="result"></pre></main><footer>底部按鈕 · 不應被 Home 橫條遮擋</footer></div>
<div id="safeProbe"></div>
<script>
let timer;
const reportLayout=()=>{
  const box=document.querySelector('#viewport').getBoundingClientRect();
  const bottom=document.querySelector('footer').getBoundingClientRect();
  const safe=getComputedStyle(document.querySelector('#safeProbe'));
  const shield=document.querySelector('[data-buio-status-shield]');
  const report={helperAtHead:window.helperAtHead,version:window.BuiOMobile?.version,
    statusShield:{height:shield?.getBoundingClientRect().height||0,background:shield?getComputedStyle(shield).backgroundColor:''},
    path:location.pathname+location.search,native:window.BuiONativeLayout,downloads:window.BuiODownloads||[],sharePresented:!!window.BuiOSharePresented,shareCount:window.BuiOShareCount||0,
    safe:{top:parseFloat(safe.paddingTop),right:parseFloat(safe.paddingRight),bottom:parseFloat(safe.paddingBottom),left:parseFloat(safe.paddingLeft)},
    width:innerWidth,height:innerHeight,screenWidth:screen.width,screenHeight:screen.height,
    cssWidth:box.width,cssHeight:box.height,footerBottom:bottom.bottom,scrollWidth:document.documentElement.scrollWidth,
    scale:visualViewport.scale,inputFont:parseFloat(getComputedStyle(document.querySelector('input')).fontSize),
    meta:document.querySelector('meta[name="viewport"]').content,
    dates:[...document.querySelectorAll('input[type="date"]')].map(input=>{
      const box=input.getBoundingClientRect(),field=input.closest('.field').getBoundingClientRect();
      return {value:input.value,width:box.width,left:box.left,right:box.right,fieldLeft:field.left,fieldRight:field.right,font:parseFloat(getComputedStyle(input).fontSize)};
    })};
  document.querySelector('#result').textContent=report.width+' × '+report.height+' pt\\n100vh: '+report.cssHeight+'\\nApp helper: '+report.version;
  fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
};
const schedule=()=>{clearTimeout(timer);timer=setTimeout(reportLayout,250)};
addEventListener('load',()=>{
  schedule();
  if(location.pathname==='/export-probe')setTimeout(()=>{
    const url=URL.createObjectURL(new Blob(['BuiO native export check'],{type:'text/plain'}));
    const anchor=document.createElement('a');anchor.href=url;anchor.download='buio-export-check.txt';anchor.click();URL.revokeObjectURL(url);
    setTimeout(()=>{const link=document.createElement('a');link.href='/attachment';link.click()},1000);
  },500);
});addEventListener('resize',schedule);addEventListener('buio:native-layout',schedule);
// UIKit and WebKit finish rotation on different frames. Keep measuring the
// actual CSS layout until it agrees with the native scene, then assert it.
setInterval(reportLayout,500);
let leaving=false;
const poll=async()=>{
  try {
    const next=await fetch('/next?from='+encodeURIComponent(location.pathname+location.search)).then(r=>r.json());
    if(next?.dismissExport)window.webkit.messageHandlers.buioLayout.postMessage({dismissFixtureExport:true});
    else if(next){leaving=true;location.assign(next)}
  } catch { /* The existing phase deadline still detects transport failures. */ }
  finally { if(!leaving)setTimeout(poll,250); }
};
setTimeout(poll,250);
</script></body></html>`;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/attachment') {
    attachmentCookieReceived = /(?:^|; )buio_fixture=ready(?:;|$)/.test(req.headers.cookie || '');
    if (!attachmentCookieReceived) { res.writeHead(401).end('Fixture cookie required'); return; }
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', 'attachment; filename="buio-http-export.txt"');
    res.end('BuiO native authenticated export check');
  } else if (req.url.startsWith('/next?')) {
    const from = new URL(req.url, 'http://fixture.local').searchParams.get('from');
    const next = navigation.read(from);
    if (next) console.log('[native] fixture command ' + JSON.stringify({ from, next }));
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(next));
  } else if (req.method === 'POST' && req.url === '/report') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 10000) { res.writeHead(413).end(); return; } }
    received = JSON.parse(body);
    navigation.acknowledge(received.path);
    res.writeHead(204).end();
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Set-Cookie', 'buio_fixture=ready; Path=/; HttpOnly; SameSite=Lax');
    let document = html;
    if (req.url === '/homework') document = html.replace('<pre id="result">',
      '<style>.filters{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;min-width:0;gap:6px}.field input{padding:10px 12px;border:1px solid #a8bcb4;border-radius:10px;background:white;color:#203c3b}</style><div class="filters"><div class="field"><label for="classAnalysisFrom">由</label><input lang="zh-HK" id="classAnalysisFrom" type="date" value="2026-09-01"></div><div class="field"><label for="classAnalysisTo">至</label><input lang="zh-HK" id="classAnalysisTo" type="date" value="2026-11-01"></div></div><pre id="result">');
    if (req.url.includes('battle=1')) document = html.replace('<body>', '<body><div class="pet-shell brawl-open brawl-active"></div>');
    if (req.url.startsWith('/pet/teacher')) document = html.replace('<body>', '<body><div class="teacher-shell"></div>');
    if (req.url.startsWith('/game/') || req.url.startsWith('/tower-defense/')) document = html.replace('<body>', '<body><canvas id="gameCanvas"></canvas>');
    res.end(document);
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const reports = [];
const failures = [];
try {
  await run(process.execPath, ['scripts/prepare.mjs', '--dev'], { BUIO_APP_URL: `http://127.0.0.1:${server.address().port}` });
  await run('npx', ['cap', 'sync', 'ios']);
  await run(process.execPath, ['scripts/ios-simulator.mjs'], {}, 600000);
  const inventory = JSON.parse(await run('xcrun', ['simctl', 'list', 'devices', 'available', '--json']));
  const devices = Object.entries(inventory.devices).filter(([runtime]) => runtime.includes('iOS')).reverse().flatMap(([, values]) => values);
  for (const type of ['iPhone', 'iPad']) {
    const device = devices.find(item => item.name.startsWith(type));
    assert.ok(device, `No available ${type} simulator`);
    try {
      if (device.state !== 'Booted') await run('xcrun', ['simctl', 'boot', device.udid]);
      await run('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], {}, 600000);
      await run('xcrun', ['simctl', 'install', device.udid, 'releases/ios-simulator/Build/Products/Debug-iphonesimulator/App.app']);
      if (type === 'iPad') {
        const log = await run('xcodebuild', ['-project', 'ci/DeviceModeTests/DeviceModeTests.xcodeproj',
          '-scheme', 'DeviceModeTests', '-destination', `platform=iOS Simulator,id=${device.udid}`,
          '-derivedDataPath', 'releases/device-mode-tests', '-parallel-testing-enabled', 'NO',
          '-resultBundlePath', path.join(output, 'iPad-device-mode.xcresult'), 'CODE_SIGNING_ALLOWED=NO', 'test'], {}, 600000);
        await writeFile(path.join(output, 'iPad-device-mode.log'), log);
      }
      received = undefined; navigation.clear(); attachmentCookieReceived = false;
      await run('xcrun', ['simctl', 'launch', device.udid, 'com.buiosch.learning.pilot'], {}, 600000);
      let originalPortrait;
      for (const route of ['/', '/homework', '/science-lab', '/pet', '/pet?battle=1', '/pet?home=1', '/pet/teacher', '/game/', '/tower-defense/', '/?return=1', '/export-probe']) {
        console.log(`[native] ${device.name}: ${route}`);
        if (route !== '/') { received = undefined; navigation.issue(reports.at(-1).path, route); }
        // A freshly booted simulator may spend over 45s starting WebKit.
        // Only the first navigation gets a cold-start allowance; orientation
        // and export phases retain their existing 45s readiness deadline.
        const deadline = Date.now() + (route === '/' ? 120000 : 45000);
        let dismissedFirstExport = false;
        const ready = () => received?.path === route && received.native &&
          Math.abs(received.footerBottom - (received.height - received.safe.bottom)) <= 1 &&
          Math.abs(received.cssWidth - received.width) <= 1 && Math.abs(received.cssHeight - received.height) <= 1 &&
          (!['/pet?battle=1','/science-lab', '/game/', '/tower-defense/'].includes(route) || received.width > received.height) &&
          (!['/pet','/pet?home=1','/pet/teacher'].includes(route) || received.height > received.width) &&
          (route !== '/export-probe' || (received.downloads?.length === 2 && received.shareCount === 2)) &&
          (!['/?return=1', '/export-probe'].includes(route) || (received.height > received.width) === originalPortrait);
        while (!ready() && Date.now() < deadline) {
          if (route === '/export-probe' && received?.downloads?.length === 2 && received.shareCount === 1 && !dismissedFirstExport) {
            navigation.issue(route, { dismissExport: true }); dismissedFirstExport = true;
          }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
        if (!ready()) {
          await writeFile(path.join(output, `${type}-failed.json`), JSON.stringify({ route, received }, null, 2));
          await run('xcrun', ['simctl', 'io', device.udid, 'screenshot', path.join(output, `${type}-failed.png`)], {}, 20000).catch(error => console.error(error.message));
          await run('xcrun', ['simctl', 'spawn', device.udid, 'log', 'show', '--last', '3m', '--style', 'compact', '--predicate', 'process == "App" OR process CONTAINS "WebKit"'], {}, 20000)
            .then(log => writeFile(path.join(output, `${type}-native.log`), log)).catch(error => console.error(error.message));
        }
        assert.ok(ready(), `${type} ${route}: missing native layout, automatic orientation or export: ${JSON.stringify(received)}`);
        const report = { device: device.name, windowMode: type === 'iPad' ? 'Full Screen Apps selected in Settings by XCUITest' : 'iPhone fullscreen', ...received };
        if (route === '/') originalPortrait = report.height > report.width;
        reports.push(report);
        if (route === '/export-probe') await new Promise(resolve => setTimeout(resolve, 500));
        await run('xcrun', ['simctl', 'io', device.udid, 'screenshot', path.join(output, `${type}-${route === '/' ? 'home' : route.slice(1).replace(/[/?=]/g, '-')}.png`)]);
        await writeFile(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
        assert.equal(report.helperAtHead, true, `${type}: helper missing before page code`);
        assert.equal(report.version, '0.2.0');
        assert.equal(report.scale, 1);
        for (const dimension of ['width', 'height']) {
          assert.ok(Math.abs(report[dimension] - report.native[dimension]) <= 1);
          assert.ok(Math.abs(report.native[dimension] - report.native['container' + dimension[0].toUpperCase() + dimension.slice(1)]) <= 1, 'No native letterboxing');
        }
        assert.equal(report.native.x, 0); assert.equal(report.native.y, 0);
        assert.ok(Math.abs(report.cssWidth - report.width) <= 1);
        assert.ok(Math.abs(report.cssHeight - report.height) <= 1);
        assert.deepEqual([report.width, report.height].sort((a, b) => a - b),
          [report.screenWidth, report.screenHeight].sort((a, b) => a - b), 'Fullscreen content must fill the device display');
        assert.ok(Math.abs(report.footerBottom - (report.height - report.safe.bottom)) <= 1);
        for (const edge of ['top', 'right', 'bottom', 'left']) assert.ok(Math.abs(report.safe[edge] - report.native[edge]) <= 1, `CSS safe area ${edge}`);
        assert.ok(report.scrollWidth <= report.width + 1);
        assert.ok(report.inputFont >= 16);
        assert.ok(Math.abs(report.statusShield.height - (['/', '/homework', '/?return=1', '/export-probe'].includes(route) ? report.native.top : 0)) <= 1);
        if (route === '/homework') {
          assert.equal(report.dates.length, 2);
          assert.deepEqual(report.dates.map(input => input.value), ['2026-09-01', '2026-11-01']);
          for (const input of report.dates) {
            assert.ok(input.left >= input.fieldLeft - 1 && input.right <= input.fieldRight + 1, 'Native date input must fit its field');
            assert.ok(input.font >= 16);
            if (report.width < 700) assert.ok(input.width >= report.width - 60, 'Phone date text receives a full-width row');
          }
        }
        assert.ok(!/maximum-scale|user-scalable/.test(report.meta));
        if (route === '/export-probe') {
          assert.equal(attachmentCookieReceived, true, 'HTTP export must retain the WebView cookie context');
          assert.deepEqual(report.downloads, [
            { name: 'buio-export-check.txt', bytes: Buffer.byteLength('BuiO native export check') },
            { name: 'buio-http-export.txt', bytes: Buffer.byteLength('BuiO native authenticated export check') }
          ]);
        }
        console.log(JSON.stringify(report));
      }
    } catch (error) {
      failures.push(`${type}: ${error.message}`);
      console.error(error);
    } finally { await run('xcrun', ['simctl', 'shutdown', device.udid], {}, 30000).catch(error => console.error(error.message)); }
  }
  assert.equal(failures.length, 0, failures.join('\n'));
} finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  for (const stream of commandStreams) stream.destroy();
}
