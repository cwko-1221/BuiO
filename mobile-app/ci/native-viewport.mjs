// Run the real WKWebView on iPhone/iPad simulators against an anonymous local
// layout fixture. No school accounts, Apple credentials or production writes.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import path from 'node:path';
import assert from 'node:assert/strict';

if (process.platform !== 'darwin') throw Error('Native viewport checks require Xcode/macOS.');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'test-results/native-viewport');
await mkdir(output, { recursive: true });
const run = async (command, args, env = {}) => {
  const child = spawn(command, args, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let result = '';
  child.stdout.on('data', chunk => { result += chunk; });
  child.stderr.on('data', chunk => { result += chunk; });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw Error(`${command} ${args.join(' ')} failed (${code}): ${result.slice(-6000)}`);
  return result;
};
let received, nextPath;
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
  const report={helperAtHead:window.helperAtHead,version:window.BuiOMobile?.version,
    path:location.pathname+location.search,native:window.BuiONativeLayout,
    safe:{top:parseFloat(safe.paddingTop),right:parseFloat(safe.paddingRight),bottom:parseFloat(safe.paddingBottom),left:parseFloat(safe.paddingLeft)},
    width:innerWidth,height:innerHeight,screenWidth:screen.width,screenHeight:screen.height,
    cssWidth:box.width,cssHeight:box.height,footerBottom:bottom.bottom,scrollWidth:document.documentElement.scrollWidth,
    scale:visualViewport.scale,inputFont:parseFloat(getComputedStyle(document.querySelector('input')).fontSize),
    meta:document.querySelector('meta[name="viewport"]').content};
  document.querySelector('#result').textContent=report.width+' × '+report.height+' pt\\n100vh: '+report.cssHeight+'\\nApp helper: '+report.version;
  fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
};
const schedule=()=>{clearTimeout(timer);timer=setTimeout(reportLayout,250)};
addEventListener('load',schedule);addEventListener('resize',schedule);addEventListener('buio:native-layout',schedule);
const poll=setInterval(async()=>{const next=await fetch('/next').then(r=>r.json());if(next){clearInterval(poll);location.assign(next)}},250);
</script></body></html>`;
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/next') {
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(nextPath || null)); nextPath = undefined;
  } else if (req.method === 'POST' && req.url === '/report') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 10000) { res.writeHead(413).end(); return; } }
    received = JSON.parse(body);
    res.writeHead(204).end();
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(req.url.includes('battle=1') ? html.replace('<body>', '<body><div class="pet-shell brawl-active"></div>') : html);
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const reports = [];
try {
  await run(process.execPath, ['scripts/prepare.mjs', '--dev'], { BUIO_APP_URL: `http://127.0.0.1:${server.address().port}` });
  await run('npx', ['cap', 'sync', 'ios']);
  await run(process.execPath, ['scripts/ios-simulator.mjs']);
  const inventory = JSON.parse(await run('xcrun', ['simctl', 'list', 'devices', 'available', '--json']));
  const devices = Object.entries(inventory.devices).filter(([runtime]) => runtime.includes('iOS')).reverse().flatMap(([, values]) => values);
  for (const type of ['iPhone', 'iPad']) {
    const device = devices.find(item => item.name.startsWith(type));
    assert.ok(device, `No available ${type} simulator`);
    try {
      if (device.state !== 'Booted') await run('xcrun', ['simctl', 'boot', device.udid]);
      await run('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
      await run('xcrun', ['simctl', 'install', device.udid, 'releases/ios-simulator/Build/Products/Debug-iphonesimulator/App.app']);
      received = undefined; nextPath = undefined;
      await run('xcrun', ['simctl', 'launch', device.udid, 'com.buiosch.learning.pilot']);
      let originalPortrait;
      for (const route of ['/', '/science-lab', '/pet', '/pet?battle=1', '/pet?home=1']) {
        if (route !== '/') { received = undefined; nextPath = route; }
        const deadline = Date.now() + 45000;
        const ready = () => received?.path === route && received.native &&
          (!['/science-lab', '/pet?battle=1'].includes(route) || received.width > received.height) &&
          (!['/pet', '/pet?home=1'].includes(route) || (received.height > received.width) === originalPortrait);
        while (!ready() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
        assert.ok(ready(), `${type} ${route}: missing native layout or automatic orientation: ${JSON.stringify(received)}`);
        const report = { device: device.name, ...received };
        if (route === '/') originalPortrait = report.height > report.width;
        reports.push(report);
        await run('xcrun', ['simctl', 'io', device.udid, 'screenshot', path.join(output, `${type}-${route === '/' ? 'home' : route.slice(1).replace(/[?=]/g, '-')}.png`)]);
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
        assert.ok(Math.abs(report.footerBottom - (report.height - report.safe.bottom)) <= 1);
        for (const edge of ['top', 'right', 'bottom', 'left']) assert.ok(Math.abs(report.safe[edge] - report.native[edge]) <= 1, `CSS safe area ${edge}`);
        assert.ok(report.scrollWidth <= report.width + 1);
        assert.ok(report.inputFont >= 16);
        assert.ok(!/maximum-scale|user-scalable/.test(report.meta));
        console.log(JSON.stringify(report));
      }
    } finally { await run('xcrun', ['simctl', 'shutdown', device.udid]); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
