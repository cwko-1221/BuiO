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
let received;
const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
html,body{height:100%;width:100%;margin:0;font:16px -apple-system,sans-serif;background:#edf5f1;color:#203c3b}
#viewport{height:100vh;width:100vw;box-sizing:border-box;border:4px solid #234c44;position:relative}
header,footer{position:fixed;left:0;right:0;padding:12px;background:#234c44;color:white;text-align:center}
header{top:0}footer{bottom:0}main{padding:90px 24px}h1{font-size:24px}input{font-size:12px;padding:12px;width:100%;box-sizing:border-box}
</style><script>window.helperAtHead=!!window.BuiOMobile;</script></head><body>
<div id="viewport"><header>杯澳 App · 可用範圍頂部</header><main><h1>原生螢幕適應檢查</h1>
<p>整個綠色邊框及底部橫列應位於系統安全範圍內。</p><input placeholder="輸入文字不應觸發頁面自動放大">
<pre id="result"></pre></main><footer>底部按鈕 · 不應被 Home 橫條遮擋</footer></div>
<script>
addEventListener('load',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const box=document.querySelector('#viewport').getBoundingClientRect();
  const bottom=document.querySelector('footer').getBoundingClientRect();
  const report={helperAtHead:window.helperAtHead,version:window.BuiOMobile?.version,
    width:innerWidth,height:innerHeight,screenWidth:screen.width,screenHeight:screen.height,
    cssWidth:box.width,cssHeight:box.height,footerBottom:bottom.bottom,scrollWidth:document.documentElement.scrollWidth,
    scale:visualViewport.scale,inputFont:parseFloat(getComputedStyle(document.querySelector('input')).fontSize),
    meta:document.querySelector('meta[name="viewport"]').content};
  document.querySelector('#result').textContent=report.width+' × '+report.height+' pt\\n100vh: '+report.cssHeight+'\\nApp helper: '+report.version;
  fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(report)});
})));
</script></body></html>`;
const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/report') {
    let body = '';
    for await (const chunk of req) { body += chunk; if (body.length > 10000) { res.writeHead(413).end(); return; } }
    received = JSON.parse(body);
    res.writeHead(204).end();
  } else { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
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
      received = undefined;
      await run('xcrun', ['simctl', 'launch', device.udid, 'com.buiosch.learning.pilot']);
      const deadline = Date.now() + 45000;
      while (!received && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 250));
      assert.ok(received, `${type}: WKWebView did not report its layout`);
      const report = { device: device.name, ...received };
      reports.push(report);
      await run('xcrun', ['simctl', 'io', device.udid, 'screenshot', path.join(output, `${type}.png`)]);
      await writeFile(path.join(output, 'report.json'), JSON.stringify(reports, null, 2));
      assert.equal(report.helperAtHead, true, `${type}: helper missing before page code`);
      assert.equal(report.version, '0.1.1');
      assert.equal(report.scale, 1);
      assert.ok(Math.abs(report.cssWidth - report.width) <= 1);
      assert.ok(Math.abs(report.cssHeight - report.height) <= 1);
      assert.ok(Math.abs(report.footerBottom - report.height) <= 1);
      assert.ok(report.scrollWidth <= report.width + 1);
      assert.ok(report.inputFont >= 16);
      assert.ok(report.height < report.screenHeight - 10, `${type}: viewport must exclude system safe areas`);
      assert.ok(report.height > report.screenHeight - 160, `${type}: unexpected excess inset`);
      assert.ok(!/maximum-scale|user-scalable/.test(report.meta));
      console.log(JSON.stringify(report));
    } finally { await run('xcrun', ['simctl', 'shutdown', device.udid]); }
  }
} finally { await new Promise(resolve => server.close(resolve)); }
