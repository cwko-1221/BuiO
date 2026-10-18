const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), net = require('node:net');
const { spawn } = require('node:child_process'), { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs'), { chromium } = require('playwright'), { WebSocket, WebSocketServer } = require('ws');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, 'tmp/pet-latency');
fs.mkdirSync(out, { recursive: true });
const dbFile = path.join(out, 'fixture.json');
process.env.SUPABASE_DB_URL = '';
process.env.BUIO_JSON_DB_FILE = dbFile;
process.env.NODE_ENV = 'development';
process.env.PET_APP_DIST_DIR ||= path.join(root, 'pet-app/dist');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const port = () => new Promise(r => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const report = { comparisonBase: '1106e7ea4662b2cdada3e4b20a07766cc02abf52', environment: 'Local synthetic proxy; not production or a physical iPad', createdAt: new Date().toISOString(), errors: [], navigation: [], movement: [] };
let child, browser, proxy, wss, delay = 0, blockWs = false, dropFrames = false, syncRequests = 0;
async function network(page) { const cdp = await page.context().newCDPSession(page), rows = new Map(); await cdp.send('Network.enable'); cdp.on('Network.responseReceived', e => rows.set(e.requestId, { url: e.response.url, type: e.type, mime: e.response.mimeType, protocol: e.response.protocol, cached: e.response.fromDiskCache, headers: e.response.headers, status: e.response.status })); cdp.on('Network.loadingFinished', e => { const row = rows.get(e.requestId); if (row)
    row.bytes = e.encodedDataLength; }); return { cdp, rows }; }
async function resources(page, net, name) { await sleep(100); const timings = await page.evaluate(() => performance.getEntriesByType('resource').map(e => ({ url: e.name, ms: Math.round(e.duration), transfer: e.transferSize, decoded: e.decodedBodySize }))); report.navigation.push({ name, rows: [...net.rows.values()].map(r => ({ ...r, url: new URL(r.url).pathname })), timings: timings.map(t => ({ ...t, url: new URL(t.url).pathname })) }); }
async function textureInfo(page, key) { return page.evaluate(key => { const game = window[key]; if (!game)
    return null; const textures = Object.entries(game.textures.list).flatMap(([key, t]) => t.source.map(s => ({ key, width: s.width, height: s.height, rgbaBytes: s.width * s.height * 4 }))); const gl = game.renderer.gl, ext = gl?.getExtension('WEBGL_debug_renderer_info'); return { textures, rgbaBytes: textures.reduce((s, x) => s + x.rgbaBytes, 0), gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '', canvas: { width: game.canvas.width, height: game.canvas.height } }; }, key); }
async function frameSample(page, key) { return page.evaluate(async (key) => { const game = window[key], s = game.scene.getScene(key === '__petGame' ? 'Brawl' : 'GameScene'), frame = [], draw = [], update = []; const wraps = []; for (const [o, k, a] of [[game.renderer, 'render', draw], [s.sys, 'sceneUpdate', update]]) {
    const f = o[k];
    o[k] = function (...args) { const t = performance.now(); const v = f.apply(this, args); a.push(performance.now() - t); return v; };
    wraps.push(() => o[k] = f);
} await new Promise(r => { let last = performance.now(), until = last + 4000; function tick(t) { frame.push(t - last); last = t; if (t < until)
    requestAnimationFrame(tick);
else
    r(); } requestAnimationFrame(tick); }); wraps.forEach(f => f()); const summary = a => { a.sort((a, b) => a - b); return { n: a.length, meanMs: a.reduce((s, x) => s + x, 0) / a.length, p95Ms: a[Math.floor(a.length * .95)], maxMs: a.at(-1), over100: a.filter(x => x > 100).length }; }; return { frame: summary(frame), draw: summary(draw), update: summary(update), status: s.runtime?.state.status }; }, key); }
async function movement(page, key) { await page.evaluate(() => { window.__auditMove = new Promise(resolve => { window.addEventListener('keydown', () => { const s = window.__petGame.scene.getScene('Brawl'), x = s.runtime.state.actors[0].x, t = performance.now(); let done = false; const timer = setTimeout(() => { if (!done) {
    done = true;
    resolve({ timeout: true });
} }, 3000); function tick() { if (done)
    return; if (s.runtime.state.actors[0].x !== x) {
    done = true;
    clearTimeout(timer);
    resolve({ milliseconds: performance.now() - t, delta: s.runtime.state.actors[0].x - x });
}
else
    requestAnimationFrame(tick); } requestAnimationFrame(tick); }, { once: true }); }); }); await page.keyboard.down(key); const value = await page.evaluate(() => window.__auditMove); await page.keyboard.up(key); await sleep(delay * 2 + 250); return value; }
async function main() {
    fs.writeFileSync(dbFile, JSON.stringify({ users: ['S001', 'S002', 'S003'].map((id, i) => ({ studentid: id, name: `測試${i + 1}`, passwordhash: bcrypt.hashSync('audit', 4), role: 'student', classname: '5A', language: 'zh-HK' })), studentStats: [], questionLogs: [], _logId: 0 }));
    const repo = require(path.join(root, 'pet-app/repositories/pet.repo')), store = require(path.join(root, 'db/jsonStore'));
    for (const id of ['S001', 'S002', 'S003'])
        await repo.ensureStudent(id);
    const data = store.load();
    for (const [i, id] of ['S001', 'S002', 'S003'].entries()) {
        const petId = randomUUID();
        data.petInstances.push({ petId, studentId: id, speciesId: i === 1 ? 'pudding-pig' : 'starpatch-cat', xp: 0, stage: 1, dailyXp: 0, dailyXpDate: '', equippedSkills: [], equippedWearables: [] });
        Object.assign(data.petProfiles.find(p => p.studentId === id), { activePetId: petId, starterEggClaimed: true });
        data.petWallets.find(w => w.studentId === id).balance = 5000;
    }
    store.save();
    const backendPort = await port();
    child = spawn(process.execPath, ['server.js'], { cwd: root, env: { ...process.env, PORT: String(backendPort), MOCK_AUTH: '0' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let logs = '';
    child.stdout.on('data', d => logs += d);
    child.stderr.on('data', d => logs += d);
    const deadline = Date.now() + 25000;
    while (true) {
        try {
            if ((await fetch(`http://127.0.0.1:${backendPort}/health`)).ok)
                break;
        }
        catch { }
        if (Date.now() > deadline)
            throw new Error('Startup: ' + logs.slice(-2500));
        await sleep(100);
    }
    proxy = http.createServer((req, res) => { const request = http.request({ hostname: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers: req.headers }, reply => { res.writeHead(reply.statusCode, reply.headers); reply.pipe(res); }); request.on('error', () => { res.statusCode = 502; res.end(); }); req.pipe(request); });
    wss = new WebSocketServer({ noServer: true });
    proxy.on('upgrade', (req, socket, head) => { if (blockWs) {
        socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n');
        return;
    } const backend = new WebSocket(`ws://127.0.0.1:${backendPort}${req.url}`, { headers: req.headers }); backend.on('error', () => socket.destroy()); backend.on('open', () => wss.handleUpgrade(req, socket, head, front => { front.on('message', (d, b) => { if (d.toString().includes('"duel:sync"'))
        syncRequests++; setTimeout(() => { if (backend.readyState === WebSocket.OPEN)
        backend.send(d, { binary: b }); }, delay); }); backend.on('message', (d, b) => { if (dropFrames && d.toString().includes('"duel:frame"'))
        return; setTimeout(() => { if (front.readyState === WebSocket.OPEN)
        front.send(d, { binary: b }); }, delay); }); front.on('close', () => backend.close()); backend.on('close', () => front.close()); front.on('error', () => backend.close()); })); });
    await new Promise(r => proxy.listen(0, '127.0.0.1', r));
    const baseURL = `http://127.0.0.1:${proxy.address().port}`;
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    const pages = [], nets = [], contexts = [];
    report.frames = {};
    for (const id of ['S001', 'S002']) {
        const context = await browser.newContext({ baseURL, viewport: { width: 1024, height: 768 }, hasTouch: true, deviceScaleFactor: 2 });
        contexts.push(context);
        await context.addInitScript(() => { let current; window.__auditSockets = []; Object.defineProperty(window, 'io', { configurable: true, get: () => current, set: fn => { current = Object.assign(function (...args) { const s = fn(...args); window.__auditSockets.push(s); return s; }, fn); } }); });
        const login = await context.request.post('/api/auth/login', { data: { studentId: id, password: 'audit' } });
        if (login.status() !== 200)
            throw new Error('Fixture login failed');
        const p = await context.newPage();
        p.on('pageerror', e => report.errors.push(e.message));
        const n = await network(p);
        nets.push(n);
        await p.goto('/pet');
        await p.locator('[data-tab="brawl"]').waitFor({ timeout: 30000 });
        await p.waitForFunction(() => window.__petGame?.scene.getScene('Bedroom')?.sys.isActive()).catch(() => { });
        pages.push(p);
        await resources(p, n, 'pet-initial-' + id);
    }
    const [a, b] = pages;
    for (const p of pages) {
        await p.locator('[data-tab="brawl"]').click();
        await p.locator('[data-brawl="mode"][data-id="pvp"]').click();
    }
    await a.locator('[data-brawl="fighter"][data-id="starpatch-cat"]').click();
    await a.locator('[data-brawl="invite"][data-target="S002"]:enabled').click({ timeout: 15000 });
    await b.locator('[data-duel-action="accept"]').click();
    for (const p of pages) {
        await p.waitForFunction(() => { const s = window.__petGame?.scene.getScene('Brawl'); return s?.fx && !document.querySelector('.brawl-loading') && !document.querySelector('.pvp-wait'); }, {}, { timeout: 30000 });
        await p.locator('[data-brawl="continue"]').click({ timeout: 300 }).catch(() => { });
    }
    await a.screenshot({ path: path.join(out, 'pvp-ipad.png') });
    report.petTextures = await textureInfo(a, '__petGame');
    await resources(a, nets[0], 'pet-pvp-loaded');
    report.transport = await a.evaluate(() => window.__auditSockets.map(s => ({ connected: s.connected, namespace: s.nsp, transport: s.io.engine.transport.name })));
    report.frames.baseline = await frameSample(a, '__petGame');
    for (const artificial of [0, 75, 150]) {
        delay = artificial;
        await sleep(artificial * 3 + 200);
        const values = [];
        for (let i = 0; i < 4; i++)
            values.push(await movement(a, i % 2 ? 'KeyA' : 'KeyD'));
        report.movement.push({ oneWayDelayMs: artificial, samples: values });
        console.log('Movement delay ' + artificial + ': ' + JSON.stringify(values));
    }
    delay = 0;
    await sleep(500);
    await nets[0].cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    report.frames.cpu4 = await frameSample(a, '__petGame');
    await nets[0].cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    dropFrames = true;
    await sleep(120);
    const confirmed = await a.evaluate(() => { const s = window.__petGame.scene.getScene('Brawl'); return { tick: s.runtime.state.tick, actors: s.runtime.state.actors.map(a => ({ id: a.id, x: a.x, spriteX: s.views.get(a.id).sprite.x })) }; });
    await a.keyboard.down('KeyD');
    await sleep(300);
    const withheld = await a.evaluate(() => { const s = window.__petGame.scene.getScene('Brawl'); return { tick: s.runtime.state.tick, actors: s.runtime.state.actors.map(a => ({ id: a.id, x: a.x, spriteX: s.views.get(a.id).sprite.x })) }; });
    await a.keyboard.up('KeyD');
    assert.deepEqual(withheld, confirmed, 'no state or fighter sprite prediction while authoritative frames are withheld');
    report.noPrediction = { confirmed, withheld };
    await sleep(3500);
    report.staleFrames = await a.evaluate(() => ({ socketConnected: window.__auditSockets[0]?.connected, waitingOverlay: !!document.querySelector('.pvp-wait'), tick: window.__petGame.scene.getScene('Brawl').runtime.state.tick }));
    dropFrames = false;
    report.staleFrames.syncRequests = syncRequests;
    assert.ok(syncRequests >= 2, 'missing frames trigger authoritative sync');
    assert.ok(report.staleFrames.tick > withheld.tick, 'read-only sync restores current server state');
    for (const context of contexts)
        await context.close();
    blockWs = true;
    const fallback = await browser.newContext({ baseURL, viewport: { width: 1024, height: 768 } });
    await fallback.addInitScript(() => { let current; window.__auditSockets = []; Object.defineProperty(window, 'io', { configurable: true, get: () => current, set: fn => { current = Object.assign(function (...args) { const s = fn(...args); window.__auditSockets.push(s); return s; }, fn); } }); });
    await fallback.request.post('/api/auth/login', { data: { studentId: 'S003', password: 'audit' } });
    const f = await fallback.newPage();
    await f.goto('/pet');
    await f.locator('[data-tab="brawl"]').waitFor();
    await sleep(6500);
    report.blockedWebSocket = { pet: await f.evaluate(() => window.__auditSockets.map(s => ({ namespace: s.nsp, connected: s.connected, transport: s.io.engine?.transport?.name, tryAllTransports: s.io.opts.tryAllTransports || false }))) };
    await f.goto('/game');
    await sleep(2500);
    report.blockedWebSocket.game = await f.evaluate(() => window.__auditSockets.map(s => ({ namespace: s.nsp, connected: s.connected, transport: s.io.engine?.transport?.name })));
    assert.ok(report.blockedWebSocket.pet.some(s => s.connected && s.transport === 'polling' && s.tryAllTransports), 'blocked WebSocket falls back to polling');
    await fallback.close();
    blockWs = false;
    const gameContext = await browser.newContext({ baseURL, viewport: { width: 1024, height: 768 }, hasTouch: true, deviceScaleFactor: 2 }), game = await gameContext.newPage(), gn = await network(game);
    game.on('pageerror', e => report.errors.push(e.message));
    await gn.cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 80, downloadThroughput: 625000, uploadThroughput: 625000 });
    const t = Date.now();
    await game.goto('/game/preview?preview&infiniteEnergy=1&altitude=500', { waitUntil: 'domcontentloaded' });
    await game.waitForFunction(() => window.__game?.scene.getScene('GameScene')?.player?.anims.currentAnim, {}, { timeout: 90000 });
    report.gameReadyMs = Date.now() - t;
    await resources(game, gn, 'game-cold-5Mbps-80ms');
    await sleep(1000);
    await game.screenshot({ path: path.join(out, 'game-ipad.png') });
    report.gameTextures = await textureInfo(game, '__game');
    report.frames.game = await frameSample(game, '__game');
    await gn.cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    report.frames.gameCpu4 = await frameSample(game, '__game');
    report.gameObjects = await game.evaluate(() => { const s = window.__game.scene.getScene('GameScene'); return { children: s.children.length, rendered: s.cameras.main.renderList.length, bodies: Phaser.Physics.Matter.Matter.Composite.allBodies(s.matter.world.localWorld).length }; });
    await gameContext.close();
    assert.deepEqual(report.errors, []);
    fs.writeFileSync(path.join(out, 'browser.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ movement: report.movement, frames: report.frames, blockedWebSocket: report.blockedWebSocket, staleFrames: report.staleFrames, gameReadyMs: report.gameReadyMs, petTextureMB: report.petTextures.rgbaBytes / 1048576, gameTextureMB: report.gameTextures.rgbaBytes / 1048576, gameObjects: report.gameObjects, errors: report.errors }, null, 2));
}
main().catch(e => { report.failure = e.stack; console.error(e); process.exitCode = 1; }).finally(async () => { fs.writeFileSync(path.join(out, 'browser-partial.json'), JSON.stringify(report, null, 2)); await browser?.close(); wss?.clients.forEach(s => s.terminate()); wss?.close(); proxy?.close(); child?.kill(); });
