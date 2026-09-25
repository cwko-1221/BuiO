import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import bcrypt from 'bcryptjs';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const projectRoot = path.resolve('.');
const profileMode = process.env.PET_COIN_PUSHER_PROFILE ?? 'full';
const profileStartup = profileMode !== '0';
const reservePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port;
    server.close(() => resolve(port));
  });
});
const readResponseHeaders = (url, acceptEncoding) => new Promise((resolve, reject) => {
  const request = http.get(url, { headers: { 'Accept-Encoding': acceptEncoding } }, (response) => {
    const headers = response.headers;
    response.resume();
    response.once('end', () => resolve({ status: response.statusCode, headers }));
  });
  request.once('error', reject);
});
const waitFor = async (predicate, message, timeoutMs = 15000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(message);
};
const dispatchTouchPointer = async (page, type, xRatio, yRatio, pointerId = 41, isPrimary = true) => page.evaluate(({ type, xRatio, yRatio, pointerId, isPrimary }) => {
  const canvas = document.querySelector('#coin-pusher-root canvas');
  const rect = canvas.getBoundingClientRect();
  canvas.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId, pointerType: 'touch', isPrimary,
    clientX: rect.left + rect.width * xRatio, clientY: rect.top + rect.height * yRatio,
    button: 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
  }));
}, { type, xRatio, yRatio, pointerId, isPrimary });

const port = await reservePort();
const baseURL = `http://127.0.0.1:${port}`;
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-pet-coin-pusher-live-'));
const databaseFile = path.join(tempDir, 'db.json');
const artifactDir = path.resolve(process.env.PET_PLAYTEST_DIR || 'artifacts/pet-playtest');
await fs.mkdir(artifactDir, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({
  users: [{
    studentid: 'S001', name: '陳小星', passwordhash: bcrypt.hashSync('student123', 4),
    role: 'student', classname: '5A', classno: 1, language: 'zh-HK',
  }],
  studentStats: [], questionLogs: [], _logId: 0,
}, null, 2));

const server = spawn(process.execPath, ['server.js'], {
  cwd: projectRoot,
  env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: databaseFile, MOCK_AUTH: '1', NODE_ENV: 'development', SUPABASE_DB_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLogs = '';
server.stdout.on('data', (chunk) => { serverLogs += chunk; });
server.stderr.on('data', (chunk) => { serverLogs += chunk; });
const stopServer = () => { if (!server.killed) server.kill(); };
process.once('exit', stopServer);

const errors = [];
const requests = [];
const playRequestKeys = [];
const payoutRequestEvents = [];
let expectedLostTransactionReply = false;
let lostPayoutEventId;
const coinPusherModuleRequests = [];
const coinPusherWasmResponseHeaders = [];
let payoutTotal = 0;
let payoutCollectionTotal = 0;
const payoutAmounts = [];
const payoutTimes = [];
let browser;
try {
  await waitFor(async () => {
    try { return (await fetch(`${baseURL}/health`)).ok; }
    catch { return false; }
  }, `server did not start\n${serverLogs}`);
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 3 });
  const page = await context.newPage();
  await page.route('**/api/pet/coin-pusher/payout', async (route) => {
    const credited = await route.fetch();
    assert.equal(credited.status(), 200, 'payout fault injection must happen after the server commits the reward');
    lostPayoutEventId = route.request().postDataJSON().eventId;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'simulated lost payout reply' }) });
  }, { times: 1 });
  expectedLostTransactionReply = true;
  const capturingVisualStages = new Set();
  const capturedVisualStages = new Set();
  await page.exposeFunction('__capturePusherVisualStage', async (stage) => {
    if (capturedVisualStages.has(stage) || capturingVisualStages.has(stage)) return;
    const fileName = stage === 'tray'
      ? 'coin-pusher-tray-catch-desktop.png'
      : stage === 'wallet'
        ? 'coin-pusher-payout-reward-desktop.png'
        : stage === 'cascade'
          ? 'coin-pusher-cascade-desktop.png'
        : stage === 'timing'
          ? 'coin-pusher-good-timing-desktop.png'
          : stage === 'timing-streak'
            ? 'coin-pusher-timing-streak-desktop.png'
            : undefined;
    if (!fileName) return;
    capturingVisualStages.add(stage);
    if (stage === 'tray') await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(artifactDir, fileName), animations: 'allow', scale: 'css' });
    capturingVisualStages.delete(stage);
    capturedVisualStages.add(stage);
  });
  await page.addInitScript((profileWebGL) => {
    const audioSweepTargets = window.__coinPusherAudioSweepTargets = [];
    if (window.AudioContext) {
      const createOscillator = AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator = function (...args) {
        const oscillator = createOscillator.apply(this, args);
        const frequency = oscillator.frequency;
        const exponentialRamp = frequency.exponentialRampToValueAtTime.bind(frequency);
        frequency.exponentialRampToValueAtTime = function (value, time) {
          audioSweepTargets.push(value);
          return exponentialRamp(value, time);
        };
        return oscillator;
      };
    }
    if (!profileWebGL) return;
    const counters = window.__coinPusherWebglCalls = {};
    const slowProgramParameters = window.__coinPusherSlowProgramParameters = [];
    const programCosts = window.__coinPusherShaderPrograms = {};
    const prototype = WebGL2RenderingContext?.prototype;
    const shaderSources = new WeakMap();
    const programShaders = new WeakMap();
    const programNames = new WeakMap();
    if (prototype) {
      const shaderSource = prototype.shaderSource;
      prototype.shaderSource = function (shader, source) {
        shaderSources.set(shader, source);
        return shaderSource.call(this, shader, source);
      };
      const attachShader = prototype.attachShader;
      prototype.attachShader = function (program, shader) {
        const attached = programShaders.get(program) ?? [];
        attached.push(shader);
        programShaders.set(program, attached);
        return attachShader.call(this, program, shader);
      };
      const linkProgram = prototype.linkProgram;
      prototype.linkProgram = function (program) {
        const names = (programShaders.get(program) ?? []).map((shader) => {
          const source = shaderSources.get(shader) ?? '';
          return source.match(/#define SHADER_NAME ([^\r\n]+)/)?.[1]
            || source.match(/#define SHADER_TYPE ([^\r\n]+)/)?.[1]
            || 'unknown shader';
        });
        programNames.set(program, [...new Set(names)].join(' + ') || 'unknown program');
        return linkProgram.call(this, program);
      };
      const getProgramInfoLog = prototype.getProgramInfoLog;
      prototype.getProgramInfoLog = function (program) {
        const startedAt = performance.now();
        try { return getProgramInfoLog.call(this, program); }
        finally {
          const name = programNames.get(program) ?? 'unknown program';
          const cost = programCosts[name] ??= { calls: 0, milliseconds: 0, maxMilliseconds: 0 };
          const elapsed = performance.now() - startedAt;
          cost.firstAt ??= Math.round(startedAt);
          cost.lastAt = Math.round(startedAt + elapsed);
          cost.calls += 1;
          cost.milliseconds += elapsed;
          cost.maxMilliseconds = Math.max(cost.maxMilliseconds, elapsed);
        }
      };
    }
    for (const name of ['getProgramInfoLog', 'getShaderInfoLog', 'getProgramParameter', 'getActiveUniform', 'getUniformLocation', 'getActiveAttrib']) {
      const original = prototype?.[name];
      if (typeof original !== 'function') continue;
      prototype[name] = function (...args) {
        const startedAt = performance.now();
        try { return original.apply(this, args); }
        finally {
          const counter = counters[name] ??= { calls: 0, milliseconds: 0 };
          counter.calls += 1;
          const elapsed = performance.now() - startedAt;
          counter.milliseconds += elapsed;
          counter.maxMilliseconds = Math.max(counter.maxMilliseconds || 0, elapsed);
          if (name === 'getProgramParameter' && elapsed >= 20) {
            slowProgramParameters.push({ pname: args[1], milliseconds: Math.round(elapsed), at: Math.round(startedAt) });
          }
        }
      };
    }
  }, profileStartup);
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (expectedLostTransactionReply && /503 \(Service Unavailable\)/i.test(message.text())) return;
    errors.push(`console: ${message.text()}`);
  });
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/CoinPusherScene|CoinPusherModel|rapier_wasm3d_bg/i.test(pathname)) {
      coinPusherModuleRequests.push({ name: pathname.split('/').pop(), requestedAt: Date.now() });
    }
    if (request.url().includes('/api/pet/coin-pusher/')) {
      requests.push(request.url());
      const headers = request.headers();
      if (request.url().endsWith('/coin-pusher/play')) playRequestKeys.push(headers['idempotency-key']);
      if (request.url().endsWith('/coin-pusher/payout')) {
        try {
          const body = JSON.parse(request.postData() || '{}');
          payoutRequestEvents.push({ eventId: body.eventId, amount: Number(body.amount) || 0, requestKey: headers['idempotency-key'] });
        } catch {}
      }
    }
  });
  page.on('response', (response) => {
    if (/rapier_wasm3d_bg.*\.wasm$/i.test(new URL(response.url()).pathname)) {
      coinPusherWasmResponseHeaders.push(response.allHeaders());
    }
    if (!response.url().endsWith('/coin-pusher/payout')) return;
    void response.json().then((body) => {
      if (body?.success) {
        const earned = Number(body.earned) || 0;
        payoutAmounts.push(earned);
        payoutTimes.push(Date.now());
        payoutTotal += earned;
        payoutCollectionTotal = Math.max(payoutCollectionTotal, Number(body.collection?.returnedCoins) || 0);
      }
    }).catch(() => {});
  });
  await context.request.get('/api/auth/me');
  const grant = await context.request.post('/api/pet/dev/unlimited-money');
  assert.equal(grant.status(), 200, 'development fixture must seed wallet coins for the paid-flow test');
  await page.goto('/pet', { waitUntil: 'networkidle' });
  await page.locator('[data-action="hatch"]').click();
  await page.locator('.reveal-card').waitFor();
  await page.locator('#modalRoot [data-action="back-home"]').click();
  const startViewport = process.env.PET_COIN_PUSHER_START_VIEWPORT === 'ipad'
    ? { name: 'ipad-landscape', width: 1180, height: 820 }
    : process.env.PET_COIN_PUSHER_START_VIEWPORT === 'desktop'
      ? { name: 'desktop', width: 1440, height: 900 }
      : { name: 'phone', width: 390, height: 844 };
  await page.setViewportSize(startViewport);
  const pusherNetwork = await context.newCDPSession(page);
  await pusherNetwork.send('Network.enable');
  await pusherNetwork.send('Network.emulateNetworkConditions', {
    offline: false, latency: 80, downloadThroughput: 250000, uploadThroughput: 100000, connectionType: 'cellular3g',
  });
  if (profileMode === 'full') {
    await pusherNetwork.send('Profiler.enable');
    await pusherNetwork.send('Profiler.start');
  }
  await page.evaluate(() => {
    window.__coinPusherLongTasks = [];
    window.__coinPusherSceneVisibleAt = null;
    if (PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      window.__coinPusherLongTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__coinPusherLongTasks.push({ startTime: Math.round(entry.startTime), duration: Math.round(entry.duration) });
        }
      });
      window.__coinPusherLongTaskObserver.observe({ type: 'longtask', buffered: true });
    }
    const root = document.querySelector('#coin-pusher-root');
    if (root) {
      const observer = new MutationObserver((records) => {
        if (records.some((record) => [...record.removedNodes].some((node) =>
          node instanceof Element && node.matches('.coin-pusher-loading')))) {
          window.__coinPusherSceneVisibleAt = performance.now();
          observer.disconnect();
        }
      });
      observer.observe(root, { childList: true });
    }
  });
  const coinPusherTab = page.locator('[data-tab="coinPusher"]');
  await coinPusherTab.hover();
  await page.waitForTimeout(120);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(320);
  assert.equal(coinPusherModuleRequests.length, 0,
    'a brief pointer pass over the arcade tab must not download the large 3D runtime');
  await coinPusherTab.hover();
  await waitFor(() => coinPusherModuleRequests.some(({ name }) => /CoinPusherScene/i.test(name))
    && coinPusherModuleRequests.some(({ name }) => /CoinPusherModel/i.test(name))
    && coinPusherModuleRequests.some(({ name }) => /rapier_wasm3d_bg/i.test(name)),
  'sustained intent should begin loading the scene, physics model and Rapier WASM before the arcade is opened');
  await waitFor(() => page.evaluate(() => performance.getEntriesByType('resource')
    .some((entry) => /CoinPusherModel/i.test(entry.name))),
  'the physics model module should be ready before the student commits to opening the arcade');
  assert.equal(await page.locator('#coin-pusher-root canvas').count(), 0,
    'warming modules must not create a WebGL canvas or consume a graphics context before entry');
  assert.equal(requests.some((url) => url.endsWith('/coin-pusher/play')), false,
    'warming the game must never spend a student coin');
  await page.evaluate(() => { window.__coinPusherLoadStartedAt = performance.now(); });
  const modulesReadyBeforeClick = coinPusherModuleRequests.map(({ name }) => name);
  await coinPusherTab.click();
  await page.locator('#coin-pusher-root canvas').waitFor();
  await page.locator('.coin-pusher-drop').waitFor({ state: 'attached' });
  const loadingPreview = page.locator('.coin-pusher-loading.is-preview-ready');
  if (profileMode === 'full') {
    await loadingPreview.waitFor({ state: 'attached', timeout: 12000 });
  }
  let pusherLoadingPreview;
  if (await loadingPreview.count()) {
    pusherLoadingPreview = await page.evaluate(() => {
      const root = document.querySelector('#coin-pusher-root');
      return {
        visualReady: root.dataset.visualPreviewReady,
        previewAt: Number(root.dataset.visualPreviewAt),
        previewCoinCount: Number(root.dataset.previewCoinCount),
        artworkReady: root.dataset.artworkReady,
        busy: root.getAttribute('aria-busy'),
        dropDisabled: document.querySelector('.coin-pusher-drop').disabled,
      };
    });
    assert.equal(pusherLoadingPreview.visualReady, 'true', 'the loading preview must only reveal after the cabinet has rendered');
    assert.equal(pusherLoadingPreview.artworkReady, 'false',
      'the first useful cabinet preview should not wait for optional high-resolution artwork');
    assert.ok(pusherLoadingPreview.previewCoinCount >= 150,
      `the physics-free preview must show the complete collision-safe starter pile (${JSON.stringify(pusherLoadingPreview)})`);
    assert.equal(pusherLoadingPreview.busy, 'true', 'the app must remain busy until Rapier and gameplay are ready');
    assert.equal(pusherLoadingPreview.dropDisabled, true, 'the preview must never allow a drop before physics is ready');
    assert.equal(requests.some((url) => url.endsWith('/coin-pusher/play')), false,
      'showing the starter-pile preview must never charge a student coin');
    await page.screenshot({
      path: path.join(artifactDir, `coin-pusher-loading-preview-${startViewport.name}.png`),
      animations: 'allow',
    });
  }
  await waitFor(async () => !(await page.locator('#coin-pusher-root').getAttribute('aria-busy') === 'true'), 'coin pusher stayed busy during initialization');
  const loadedArtwork = await page.locator('#coin-pusher-root').evaluate((root) => ({
    ready: root.dataset.artworkReady,
    textureCount: Number(root.dataset.artworkTextureCount || 0),
  }));
  assert.equal(loadedArtwork.ready, 'true', 'optional art must be applied before the cabinet becomes interactive');
  assert.equal(loadedArtwork.textureCount, 3, 'the desktop cabinet should finish with all three authored textures');
  const pusherSceneVisibleAt = await page.evaluate(() => {
    return window.__coinPusherSceneVisibleAt ?? performance.now();
  });
  const pusherLoadMetrics = await page.evaluate(() => {
    const startedAt = window.__coinPusherLoadStartedAt;
    const root = document.querySelector('#coin-pusher-root');
    const phaseOffset = (key) => {
      const timestamp = Number(root.dataset[key]);
      return Number.isFinite(timestamp) ? Math.round(timestamp - startedAt) : null;
    };
    const resources = performance.getEntriesByType('resource')
      .filter((entry) => /CoinPusherScene|CoinPusherModel|rapier|coin-pusher-(?:brushed-metal|backboard|minted-paw)/i.test(entry.name))
      .map((entry) => ({
        name: new URL(entry.name).pathname.split('/').pop(),
        startOffsetMs: Math.round(entry.startTime - startedAt),
        completeOffsetMs: Math.round(entry.startTime + entry.duration - startedAt),
        transferBytes: entry.transferSize,
        encodedBodyBytes: entry.encodedBodySize,
        decodedBodyBytes: entry.decodedBodySize,
      }));
    const previewAt = Number(document.querySelector('#coin-pusher-root').dataset.visualPreviewAt);
    return {
      totalMs: Math.round(performance.now() - startedAt),
      visualPreviewOffsetMs: Math.round(previewAt - startedAt),
      artworkAppliedOffsetMs: phaseOffset('artworkAppliedAt'),
      rendererWarmupReadyOffsetMs: phaseOffset('rendererWarmupReadyAt'),
      physicsModuleReadyOffsetMs: phaseOffset('physicsModuleReadyAt'),
      physicsReadyOffsetMs: phaseOffset('physicsReadyAt'),
      rendererReadyOffsetMs: phaseOffset('rendererReadyAt'),
      resources,
    };
  });
  const lastArtworkReadyMs = Math.max(...pusherLoadMetrics.resources
    .filter((entry) => /coin-pusher-(?:brushed-metal|backboard|minted-paw)/i.test(entry.name))
    .map((entry) => entry.completeOffsetMs));
  assert.ok(pusherLoadMetrics.visualPreviewOffsetMs + 150 < lastArtworkReadyMs,
    `the static 3D preview should precede the slowest optional artwork response (${JSON.stringify({
      previewMs: pusherLoadMetrics.visualPreviewOffsetMs,
      lastArtworkReadyMs,
      resources: pusherLoadMetrics.resources,
    })})`);
  const prewarmedPhysics = pusherLoadMetrics.resources.find((entry) => /CoinPusherModel/i.test(entry.name));
  const prewarmedWasm = pusherLoadMetrics.resources.find((entry) => /rapier_wasm3d_bg/i.test(entry.name));
  const wasmResourceEntries = pusherLoadMetrics.resources.filter((entry) => /rapier_wasm3d_bg/i.test(entry.name));
  const wasmPreloadLinks = await page.evaluate(() => Array.from(document.querySelectorAll('link[rel="preload"][as="fetch"]'))
    .map((link) => ({ href: link.href, type: link.type, crossOrigin: link.crossOrigin })));
  assert.ok(prewarmedPhysics && prewarmedPhysics.startOffsetMs < 0,
    `the physics model should begin transferring before the click (${JSON.stringify(pusherLoadMetrics.resources)})`);
  assert.ok(prewarmedWasm && prewarmedWasm.startOffsetMs < 0,
    `Rapier WASM should begin transferring before the click (${JSON.stringify(pusherLoadMetrics.resources)})`);
  assert.ok(prewarmedPhysics && prewarmedWasm
    && prewarmedWasm.startOffsetMs - prewarmedPhysics.startOffsetMs <= 100,
  'Rapier WASM should overlap the model chunk rather than wait for its download waterfall: '
    + JSON.stringify({ resources: pusherLoadMetrics.resources, requests: coinPusherModuleRequests, wasmPreloadLinks }));
  assert.equal(wasmResourceEntries.length, 1,
    'the explicit WASM preload must be reused by Rapier rather than downloaded twice');
  assert.equal(coinPusherModuleRequests.filter(({ name }) => /rapier_wasm3d_bg/i.test(name)).length, 1,
    'the browser must issue exactly one Rapier WASM request for preload plus module initialization');
  assert.equal(coinPusherWasmResponseHeaders.length, 1,
    'Rapier WASM should be served once for preload plus module initialization');
  const wasmHeaders = await coinPusherWasmResponseHeaders[0];
  assert.equal(wasmHeaders['content-encoding'], 'br',
    `mobile-capable browsers should receive the precompressed WASM (${JSON.stringify(wasmHeaders)})`);
  assert.match(wasmHeaders['content-type'] || '', /application\/wasm/i,
    'compressed physics must retain the WebAssembly MIME type');
  assert.match(wasmHeaders.vary || '', /accept-encoding/i,
    'shared caches must distinguish Brotli and fallback physics responses');
  assert.ok(prewarmedWasm.encodedBodyBytes > 0
    && prewarmedWasm.encodedBodyBytes < prewarmedWasm.decodedBodyBytes * .4,
  `Brotli should transfer less than 40% of the WASM bytes (${JSON.stringify(prewarmedWasm)})`);
  const wasmAssetPath = `/pet/assets/${prewarmedWasm.name}`;
  const gzipFallback = await readResponseHeaders(`${baseURL}${wasmAssetPath}`, 'gzip');
  assert.equal(gzipFallback.status, 200, 'browsers without Brotli must still receive the original Rapier WASM');
  assert.equal(gzipFallback.headers['content-encoding'], 'gzip',
    `non-Brotli clients should use the existing gzip middleware (${JSON.stringify(gzipFallback.headers)})`);
  assert.match(gzipFallback.headers['content-type'] || '', /application\/wasm/i,
    'the gzip fallback must retain the WebAssembly MIME type');
  await page.waitForTimeout(750);
  const { pusherLoadingLongTasks, pusherFirstFrameLongTasks } = await page.evaluate((visibleAt) => {
    const tasks = window.__coinPusherLongTasks;
    return {
      pusherLoadingLongTasks: tasks.filter((task) => task.startTime < visibleAt),
      pusherFirstFrameLongTasks: tasks.filter((task) => task.startTime >= visibleAt && task.startTime <= visibleAt + 1000),
    };
  }, pusherSceneVisibleAt);
  assert.ok(pusherLoadingLongTasks.every((task) => task.duration < 600),
    `coin-pusher loading must not block the main thread for 600ms (${JSON.stringify(pusherLoadingLongTasks)})`);
  assert.ok(pusherFirstFrameLongTasks.every((task) => task.duration < 600),
    `the first interactive second must not contain a shader-startup stall (${JSON.stringify(pusherFirstFrameLongTasks)})`);
  const compactArtworkResources = pusherLoadMetrics.resources.filter((entry) =>
    /coin-pusher-(?:backboard|minted-paw)-mobile-v2/i.test(entry.name));
  const compactArtworkBytes = compactArtworkResources.reduce((total, entry) => total + entry.transferBytes, 0);
  const expectedCompactArtworkRequests = startViewport.width <= 1280 ? 2 : 0;
  assert.equal(compactArtworkResources.length, expectedCompactArtworkRequests,
    'the cold load must choose artwork detail appropriate to its startup viewport');
  assert.ok(compactArtworkBytes <= 65000,
    `compact coin and backboard art must remain under 65KB total (${compactArtworkBytes} bytes)`);
  const shaderWarmup = await page.locator('#coin-pusher-root').evaluate((root) => ({
    programs: Number(root.dataset.shaderWarmupPrograms),
    primed: Number(root.dataset.shaderWarmupPrimed),
  }));
  assert.ok(shaderWarmup.programs > 0 && shaderWarmup.primed === shaderWarmup.programs,
    `every compiled program should be warmed before the first playable frame (${JSON.stringify(shaderWarmup)})`);
  const pusherWebglCalls = await page.evaluate(() => window.__coinPusherWebglCalls ?? {});
  const pusherSlowProgramParameters = await page.evaluate(() => window.__coinPusherSlowProgramParameters ?? []);
  const pusherShaderPrograms = await page.evaluate(() => window.__coinPusherShaderPrograms ?? {});
  const pusherWebglCapabilities = await page.evaluate(() => {
    const context = document.querySelector('#coin-pusher-root canvas')?.getContext('webgl2');
    return {
      webgl2: context instanceof WebGL2RenderingContext,
      parallelShaderCompile: Boolean(context?.getExtension('KHR_parallel_shader_compile')),
    };
  });
  let pusherCpuHotspots = [];
  if (profileMode === 'full') {
    const { profile: pusherCpuProfile } = await pusherNetwork.send('Profiler.stop');
    await pusherNetwork.send('Profiler.disable');
    const profileNodes = new Map(pusherCpuProfile.nodes.map((node) => [node.id, node]));
    const functionTime = new Map();
    for (const [index, nodeId] of pusherCpuProfile.samples.entries()) {
      const callFrame = profileNodes.get(nodeId)?.callFrame;
      if (!callFrame) continue;
      const resource = callFrame.url ? new URL(callFrame.url).pathname.split('/').pop() : 'runtime';
      const label = `${callFrame.functionName || '(anonymous)'} · ${resource}:${callFrame.lineNumber + 1}`;
      functionTime.set(label, (functionTime.get(label) || 0) + (pusherCpuProfile.timeDeltas[index] || 0));
    }
    pusherCpuHotspots = [...functionTime.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 8)
      .map(([frame, microseconds]) => ({ frame, cpuMs: Math.round(microseconds / 1000) }));
  }
  await pusherNetwork.send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1, connectionType: 'none',
  });
  await pusherNetwork.detach();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => {
    window.__coinRewardDebug = [];
    window.__coinStatusDebug = [];
    window.__coinToastDebug = [];
    const captureToast = (node) => {
      if (!(node instanceof HTMLElement)) return;
      const toasts = node.matches('.toast') ? [node] : Array.from(node.querySelectorAll('.toast'));
      for (const toast of toasts) window.__coinToastDebug.push({ at: performance.now(), role: toast.getAttribute('role'), text: toast.textContent?.trim() });
    };
    const toastRoot = document.querySelector('#toasts');
    toastRoot?.querySelectorAll('.toast').forEach(captureToast);
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) captureToast(node);
    }).observe(toastRoot || document, { childList: true, subtree: true });
    const root = document.querySelector('#coin-pusher-root');
    const status = document.querySelector('#coinPusherSystemStatus');
    const captureStatus = () => window.__coinStatusDebug.push({ at: performance.now(), text: status?.textContent?.trim() });
    if (status) new MutationObserver(captureStatus).observe(status, { childList: true, characterData: true, subtree: true });
    captureStatus();
    const observer = new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches('.coin-pusher-timing-cue')) {
          const captureTimingCue = () => {
            if (!node.isConnected) return;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            if (Number(style.opacity) > .25 && rect.width > 50 && rect.height > 20) {
              window.__coinRewardDebug.push({
                type: 'timing-visible', at: performance.now(), text: node.innerText,
                beat: node.dataset.beat, streak: Number(node.dataset.streak || 0),
                bestStreak: Number(node.dataset.bestStreak || 0),
                isStreaking: node.classList.contains('is-streaking'), width: rect.width, height: rect.height,
              });
              const stage = Number(node.dataset.streak) >= 2 ? 'timing-streak' : 'timing';
              void window.__capturePusherVisualStage?.(stage)?.catch(() => {});
            } else if (style.animationName !== 'none') requestAnimationFrame(captureTimingCue);
          };
          requestAnimationFrame(captureTimingCue);
          continue;
        }
        if (node.matches('.coin-pusher-cascade')) {
          const cascadeLayout = () => {
            const rect = node.getBoundingClientRect();
            const rootRect = root.getBoundingClientRect();
            const hud = document.querySelector('.coin-pusher-hud')?.getBoundingClientRect();
            return {
              activeCount: root.querySelectorAll('.coin-pusher-cascade').length,
              top: rect.top - rootRect.top,
              bottom: rect.bottom - rootRect.top,
              hudGap: hud ? rect.top - hud.bottom : undefined,
            };
          };
          window.__coinRewardDebug.push({ type: 'cascade-inserted', at: performance.now(), text: node.innerText, ...cascadeLayout() });
          new MutationObserver(() => window.__coinRewardDebug.push({
            type: 'cascade-updated', at: performance.now(), text: node.innerText, ...cascadeLayout(),
          })).observe(node, { attributes: true, childList: true, characterData: true, subtree: true });
          const captureCascade = () => {
            if (!node.isConnected) return;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            if (Number(style.opacity) >= .82 && rect.width > 50 && rect.height > 20) {
              window.__coinRewardDebug.push({
                type: 'cascade-visible', at: performance.now(), text: node.innerText,
                opacity: Number(style.opacity), width: rect.width, height: rect.height, ...cascadeLayout(),
              });
              void window.__capturePusherVisualStage?.('cascade')?.catch(() => {});
            } else if (style.animationName !== 'none') requestAnimationFrame(captureCascade);
          };
          requestAnimationFrame(captureCascade);
          continue;
        }
        if (node.matches('.coin-pusher-tray-catch')) {
          const nodeBounds = node.getBoundingClientRect();
          window.__coinRewardDebug.push({
            type: 'tray-catch-inserted', at: performance.now(), text: node.innerText,
            width: nodeBounds.width, height: nodeBounds.height,
          });
          window.__coinRewardDebug.push({
            type: 'tray-catch-active', at: performance.now(), count: root.querySelectorAll('.coin-pusher-tray-catch').length,
          });
          new MutationObserver(() => window.__coinRewardDebug.push({
            type: 'tray-catch-updated', at: performance.now(), text: node.innerText,
          })).observe(node, { childList: true, characterData: true, subtree: true });
          let trayCatchCaptured = false;
          const captureTrayCatch = () => {
            if (!node.isConnected || trayCatchCaptured) return;
            const style = getComputedStyle(node);
            const rect = node.getBoundingClientRect();
            if (Number(style.opacity) > .25 && rect.width > 45 && rect.height > 18) {
              trayCatchCaptured = true;
              const rootRect = root.getBoundingClientRect();
              window.__coinRewardDebug.push({
                type: 'tray-catch-visible', at: performance.now(), text: node.innerText,
                width: rect.width, height: rect.height,
                top: rect.top - rootRect.top, bottom: rect.bottom - rootRect.top,
              });
              void window.__capturePusherVisualStage?.('tray')?.catch(() => {});
            } else if (style.animationName !== 'none') requestAnimationFrame(captureTrayCatch);
          };
          requestAnimationFrame(captureTrayCatch);
          continue;
        }
        if (!node.matches('.coin-pusher-reward-fly')) continue;
        const nodeBounds = node.getBoundingClientRect();
        const rootBounds = root.getBoundingClientRect();
        const entry = {
          type: 'inserted', at: performance.now(), text: node.innerText,
          startX: nodeBounds.left + nodeBounds.width / 2 - rootBounds.left,
          startY: nodeBounds.top + nodeBounds.height / 2 - rootBounds.top,
          animationDelayMs: Number.parseFloat(node.style.animationDelay || '0') || 0,
        };
        window.__coinRewardDebug.push(entry);
        let visibleCaptured = false;
        const captureVisible = () => {
          if (!node.isConnected || visibleCaptured) return;
          const style = getComputedStyle(node);
          const rect = node.getBoundingClientRect();
          if (Number(style.opacity) > .25 && rect.width > 30 && rect.height > 20) {
            visibleCaptured = true;
            window.__coinRewardDebug.push({
              type: 'visible', at: performance.now(), text: node.innerText, opacity: style.opacity,
              width: rect.width, height: rect.height, startX: entry.startX, startY: entry.startY,
            });
            void window.__capturePusherVisualStage?.('wallet')?.catch(() => {});
          } else if (style.animationName !== 'none') requestAnimationFrame(captureVisible);
        };
        node.addEventListener('animationstart', () => {
          window.__coinRewardDebug.push({ type: 'start', at: performance.now() });
          requestAnimationFrame(captureVisible);
        });
        node.addEventListener('animationend', () => window.__coinRewardDebug.push({ type: 'end', at: performance.now() }));
        // Observe on the next frame even if the CSS animationstart event fired before this
        // mutation observer attached its listener (possible when style is flushed eagerly).
        requestAnimationFrame(captureVisible);
      }
    });
    observer.observe(root, { childList: true });
  });

  const canvas = page.locator('#coin-pusher-root canvas');
  const drop = page.locator('.coin-pusher-drop');
  const sound = page.locator('.coin-pusher-sound');
  assert.equal(await page.locator('.coin-pusher-economy').count(), 0,
    'the HUD must not repeat wallet rules already present in the live status');
  assert.equal(await page.locator('.coin-pusher-keyboard-hint').isVisible(), true,
    'desktop players must be able to discover the keyboard drop shortcut');
  assert.match(await page.locator('.coin-pusher-keyboard-hint').innerText(), /←.*→.*揀位.*Space.*↓/,
    'the desktop hint must teach lane aiming as well as keyboard dropping');
  const initialBalance = Number((await page.locator('#coinBalanceHud').innerText()).replace(/,/g, ''));
  assert.equal(initialBalance, 999999, 'fixture must provide a known student wallet balance');
  assert.equal(await drop.isDisabled(), false, 'paid play must be enabled while the student has coins');
  assert.equal(await page.locator('#coin-pusher-root').getAttribute('data-keepsake-tier'), '0',
    'a new student must start with the default cabinet finish');
  assert.equal(await page.locator('#coin-pusher-root').getAttribute('data-keepsake-finish'), 'classic',
    'the initial scene palette must match the classic finish');
  assert.match(await drop.getAttribute('aria-label'), /1|−1|coin|金幣/i);
  assert.match(await page.locator('#coinPusherSystemStatus').innerText(), /下滑揀位|Swipe to aim/,
    'the ready status must teach the primary swipe-to-aim control');
  const collectionButton = page.locator('.coin-pusher-collection');
  assert.equal(await collectionButton.isVisible(), true, 'paw-stamp collection must be discoverable from the HUD');
  assert.match(await collectionButton.getAttribute('aria-label'), /0\/5/,
    'the collection badge must report all five cosmetic unlocks');
  const initialStampRing = await collectionButton.evaluate((button) => {
    const ring = button.querySelector(':scope > span');
    const bounds = ring?.getBoundingClientRect();
    return { progress: button.getAttribute('data-progress-percent'), ringSize: bounds ? Math.min(bounds.width, bounds.height) : 0 };
  });
  assert.deepEqual(initialStampRing, { progress: '0', ringSize: 25 },
    'the compact collection HUD must show a visible next-stamp progress ring');
  await collectionButton.click();
  const collectionPanel = page.locator('.coin-pusher-collection-panel');
  assert.equal(await collectionPanel.isVisible(), true, 'collection opens without leaving the game');
  assert.match(await collectionPanel.innerText(), /不會額外增加或扣除金幣/,
    'cosmetic keepsakes must explain that they never add or spend coins');
  assert.match(await collectionPanel.innerText(), /配色|finish/i,
    'the collection book must explain the visible cabinet-finish reward');
  assert.equal(await page.locator('.coin-pusher-finish-current').getAttribute('data-finish-tier'), '0',
    'the collection book must preview the currently applied classic finish');
  const stampPresentation = await page.locator('.coin-pusher-stamp').evaluateAll((cards) => cards.map((card) => {
    const medallion = card.querySelector('.coin-pusher-stamp-medallion');
    const bounds = medallion?.getBoundingClientRect();
    return {
      tier: card.dataset.tier,
      rank: card.querySelector('.coin-pusher-stamp-rank')?.textContent?.trim(),
      medal: medallion instanceof HTMLElement,
      medalSize: bounds ? Math.min(bounds.width, bounds.height) : 0,
      metal: medallion ? getComputedStyle(medallion).backgroundImage : '',
    };
  }));
  assert.deepEqual(stampPresentation.map((stamp) => stamp.tier), ['bronze', 'silver', 'gold', 'crystal', 'aurora'],
    'keepsakes must progress from bronze through silver, gold, crystal, and aurora');
  assert.deepEqual(stampPresentation.map((stamp) => stamp.rank), ['I', 'II', 'III', 'IV', 'V'],
    'each of the five cosmetic tiers must have a distinct, visible rank');
  assert.ok(stampPresentation.every((stamp) => stamp.medal && stamp.medalSize >= 44),
    'each stamp must render a full-size medal instead of an emoji placeholder');
  assert.equal(new Set(stampPresentation.map((stamp) => stamp.metal)).size, 5,
    'all five keepsakes must have distinct metallic treatments');
  assert.equal(await page.locator('#coinPusherCollectionReturned').innerText(), '0',
    'collection progress must start from server-confirmed payouts, not wallet grants');
  await page.locator('.coin-pusher-collection-close').click();
  assert.equal(await page.locator('.coin-pusher-collection-panel').count(), 0, 'collection close returns to play');
  assert.equal(requests.length, 0, 'opening the cosmetic collection must not spend or award coins');
  const audioBefore = await sound.getAttribute('aria-pressed');
  await sound.click();
  assert.equal(await sound.getAttribute('aria-pressed'), 'false', 'audio control must mute the arcade');
  await page.waitForTimeout(100);
  const mutedAudioSweepCount = await page.evaluate(() => window.__coinPusherAudioSweepTargets.length);
  await page.waitForTimeout(3400);
  assert.equal(await page.evaluate(() => window.__coinPusherAudioSweepTargets.length), mutedAudioSweepCount,
    'the synchronized pusher motor must remain silent while the arcade is muted');
  assert.equal(requests.length, 0, 'an idle machine must not spend or award coins while a student waits');
  await sound.click();
  assert.equal(await sound.getAttribute('aria-pressed'), audioBefore, 'audio control must restore the arcade sound');
  await canvas.focus();

  const playsBeforeKeyboardAim = requests.filter((url) => url.endsWith('/coin-pusher/play')).length;
  await page.keyboard.press('ArrowRight');
  const keyboardAimLane = await page.locator('.coin-pusher-aim-marker').getAttribute('data-lane-x');
  assert.equal(keyboardAimLane, '0.580000', 'Right Arrow must move the visible aim guide one lane to the right');
  const aimGuide = page.locator('.coin-pusher-aim-guide');
  const keyboardGuideLine = aimGuide.locator('line');
  assert.equal(await aimGuide.getAttribute('class'), 'coin-pusher-aim-guide is-visible',
    'keyboard aiming should show the same landing-lane guide as pointer aiming');
  const keyboardGuide = await keyboardGuideLine.evaluate((line) => ({
    x1: Number(line.getAttribute('x1')), x2: Number(line.getAttribute('x2')),
    y1: Number(line.getAttribute('y1')), y2: Number(line.getAttribute('y2')),
  }));
  const keyboardGuideLength = Math.hypot(keyboardGuide.x1 - keyboardGuide.x2, keyboardGuide.y1 - keyboardGuide.y2);
  assert.ok(keyboardGuideLength > 24
    && Math.abs(keyboardGuide.x1 - keyboardGuide.x2) / keyboardGuideLength < .18,
  `the perspective-projected drop guide should connect slot to target without drifting lanes (${JSON.stringify(keyboardGuide)})`);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.coin-pusher-aim-marker').getAttribute('data-lane-x'), '0.000000',
    'Left Arrow must return the aim guide to the centre lane');
  await page.keyboard.press('ArrowRight');
  assert.equal(requests.filter((url) => url.endsWith('/coin-pusher/play')).length, playsBeforeKeyboardAim,
    'keyboard aiming must not charge until a drop key is pressed');
  await page.keyboard.press('Space');
  await waitFor(async () => requests.filter((url) => url.endsWith('/coin-pusher/play')).length >= 1, 'drop did not charge the wallet');
  await page.waitForTimeout(300);
  const box = await canvas.boundingBox();
  assert.ok(box, 'coin-pusher canvas must have a visible hit area');
  await page.mouse.move(box.x + box.width * .28, box.y + box.height * .3);
  const aimMarker = page.locator('.coin-pusher-aim-marker');
  await waitFor(async () => aimMarker.evaluate((node) => node.classList.contains('is-visible')
    && Number(getComputedStyle(node).opacity) > .5), 'pointer aim must preview the predicted coin landing lane');
  await waitFor(async () => aimGuide.evaluate((node) => node.classList.contains('is-visible')
    && Number(getComputedStyle(node).opacity) > .5), 'pointer aim must show a visible drop path');
  const aimBeat = aimMarker.locator('.coin-pusher-aim-beat');
  await waitFor(async () => aimMarker.evaluate((node) =>
    ['home-pause', 'forward', 'front-pause', 'return'].includes(node.dataset.beat)
      && Boolean(node.querySelector('.coin-pusher-aim-beat')?.textContent?.trim())),
  'the landing preview must label the pusher beat expected at impact');
  const observedBeats = await aimMarker.evaluate(async (node) => {
    const beats = new Set([node.dataset.beat].filter(Boolean));
    await new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (node.dataset.beat) beats.add(node.dataset.beat);
        if (beats.size === 4) {
          window.clearTimeout(deadline);
          observer.disconnect();
          resolve(undefined);
        }
      });
      const deadline = window.setTimeout(() => {
        observer.disconnect();
        resolve(undefined);
      }, 10000);
      observer.observe(node, { attributes: true, attributeFilter: ['data-beat'] });
    });
    return [...beats].sort();
  });
  assert.deepEqual(observedBeats, ['forward', 'front-pause', 'home-pause', 'return'],
    'the visible landing cue must update through the pusher cycle while the pointer stays aimed');
  const audibleStrokeTargets = await page.evaluate(() => window.__coinPusherAudioSweepTargets);
  assert.ok(audibleStrokeTargets.some((frequency) => frequency > 55 && frequency < 58),
    'the forward pusher stroke must generate its low mechanical pitch sweep');
  assert.ok(audibleStrokeTargets.some((frequency) => frequency > 69 && frequency < 73),
    'the return pusher stroke must generate its distinct low mechanical pitch sweep');
  assert.ok(await aimBeat.isVisible(), 'the pusher timing label must stay readable beside the landing reticle');
  const aimStartBox = await aimMarker.boundingBox();
  assert.ok(aimStartBox && aimStartBox.width >= 40 && aimStartBox.height >= 40,
    'the aim marker must remain large enough to read over the playfield');
  await page.screenshot({ path: path.join(artifactDir, 'coin-pusher-aim-preview-desktop.png') });
  await page.mouse.down();
  const aimStartLane = await aimMarker.getAttribute('data-lane-x');
  await page.mouse.move(box.x + box.width * .31, box.y + box.height * .72, { steps: 4 });
  const aimEndLane = await aimMarker.getAttribute('data-lane-x');
  assert.equal(aimEndLane, aimStartLane,
    'the world-space drop lane must stay locked to the swipe start while the thumb moves');
  await page.mouse.up();
  assert.equal(await aimMarker.getAttribute('class'), 'coin-pusher-aim-marker',
    'the landing preview must clear as soon as the paid drop is committed');
  assert.equal(await aimGuide.getAttribute('class'), 'coin-pusher-aim-guide',
    'the trajectory guide must clear with the landing preview after release');
  await waitFor(() => page.evaluate(() => window.__coinRewardDebug.some((entry) => entry.type === 'timing-visible')),
    'a coin landing during the forward push should show the non-monetary timing cue');
  const timingCue = await page.evaluate(() => window.__coinRewardDebug.find((entry) => entry.type === 'timing-visible'));
  assert.equal(timingCue.beat, 'forward', 'the timing cue must only follow a real coin landing during the forward stroke');
  assert.match(timingCue.text, /順勢接住|NICE TIMING/, 'the timing feedback should be localized and readable');
  assert.ok(timingCue.streak >= 1 && timingCue.bestStreak >= timingCue.streak,
    'the live timing cue must report the actual session streak without granting currency');
  await waitFor(() => capturedVisualStages.has('timing'), 'the forward-timing visual screenshot was not captured while visible');
  await waitFor(() => page.evaluate(() => window.__coinRewardDebug.some((entry) =>
    entry.type === 'timing-visible' && entry.streak >= 2)),
  'two consecutive physical forward-beat landings must visibly upgrade to a golden timing streak');
  const timingStreakCue = await page.evaluate(() => window.__coinRewardDebug.find((entry) =>
    entry.type === 'timing-visible' && entry.streak >= 2));
  assert.equal(timingStreakCue.isStreaking, true, 'a live two-hit streak must receive the upgraded visual treatment');
  await waitFor(() => capturedVisualStages.has('timing-streak'),
    'the upgraded timing streak screenshot was not captured while visible');
  for (let index = 0; index < 3; index += 1) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(700);
  const chargedDrops = requests.filter((url) => url.endsWith('/coin-pusher/play')).length;
  assert.ok(chargedDrops >= 1 && chargedDrops <= 5,
    `the single keyboard drop, one swipe and three follow-up keys can authorize at most five paid drops (${chargedDrops})`);
  await waitFor(() => capturedVisualStages.has('tray'),
    'the landed coin must visibly enter the collection well before its wallet payout');
  await waitFor(() => payoutTotal > 0, 'a collected coin must be returned to the student wallet');
  const catchCueEntries = await page.evaluate(() => window.__coinRewardDebug.filter((entry) =>
    ['tray-catch-active', 'tray-catch-updated'].includes(entry.type)));
  assert.ok(catchCueEntries.filter((entry) => entry.type === 'tray-catch-active')
    .every((entry) => entry.count === 1),
  `a multi-coin catch must reuse one visible label instead of stacking duplicate bubbles (${JSON.stringify(catchCueEntries)})`);
  const closePayoutPair = payoutTimes.some((time, index) => index > 0 && time - payoutTimes[index - 1] <= 760);
  if (closePayoutPair) {
    await waitFor(() => page.evaluate(() => window.__coinRewardDebug.some((entry) =>
      entry.type === 'tray-catch-updated' && /×\s*2/.test(entry.text || ''))),
    'closely spaced catches should combine into one readable ×2 tray cue');
    await waitFor(() => page.evaluate(() => {
      const flights = window.__coinRewardDebug
        .filter((entry) => entry.type === 'inserted')
        .map((entry) => entry.at + (entry.animationDelayMs || 0))
        .sort((a, b) => a - b);
      return flights.length >= 2 && flights.slice(1).every((time, index) => time - flights[index] >= 150);
    }), 'closely spaced payout animations must be queued so their +1 coins do not launch on top of each other');
  }
  await waitFor(() => !!lostPayoutEventId
    && payoutRequestEvents.filter(({ eventId }) => eventId === lostPayoutEventId).length === 2,
  'a payout with a lost reply must be retried using the durable event');
  expectedLostTransactionReply = false;
  const lostPayoutAttempts = payoutRequestEvents.filter(({ eventId }) => eventId === lostPayoutEventId);
  assert.equal(lostPayoutAttempts[0].requestKey, lostPayoutAttempts[1].requestKey,
    'a committed payout retried after a lost response must reuse its original idempotency key');
  const databaseAfterLostPayout = JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  const lostPayoutCredits = databaseAfterLostPayout.petCurrencyLedger.filter((row) =>
    row.studentId === 'S001' && row.kind === 'coin_pusher_payout' && row.idempotencyKey === lostPayoutAttempts[0].requestKey);
  assert.equal(lostPayoutCredits.length, 1, 'a lost payout response and retry must credit the wallet exactly once');
  assert.equal(lostPayoutCredits[0].delta, lostPayoutAttempts[0].amount,
    'the one wallet credit must match the server-confirmed physical collection amount');
  try {
    await waitFor(async () => page.evaluate(() => window.__coinStatusDebug.some(({ text }) => /已回到錢包|added to wallet/i.test(text || ''))),
      'the confirmed payout must update the student wallet status');
  } catch (error) {
    const statusDebug = await page.evaluate(() => ({
      current: document.querySelector('#coinPusherSystemStatus')?.textContent?.trim(),
      history: window.__coinStatusDebug,
    }));
    throw new Error(`${error.message}; status debug: ${JSON.stringify(statusDebug)}`);
  }
  try {
    await waitFor(() => page.evaluate(() => window.__coinRewardDebug.some((entry) => entry.type === 'visible')),
    'the confirmed payout animation never became visibly active');
  } catch (error) {
    const debug = await page.evaluate(() => ({
      rewards: window.__coinRewardDebug,
      prefersReducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      documentClasses: document.documentElement.className,
      status: document.querySelector('#coinPusherSystemStatus')?.textContent,
      root: document.querySelector('#coin-pusher-root')?.getBoundingClientRect().toJSON(),
      wallet: document.querySelector('.coin-pusher-wallet')?.getBoundingClientRect().toJSON(),
      flyers: Array.from(document.querySelectorAll('.coin-pusher-reward-fly')).map((node) => ({
        text: node.textContent,
        opacity: getComputedStyle(node).opacity,
        animation: getComputedStyle(node).animation,
        rect: node.getBoundingClientRect().toJSON(),
      })),
    }));
    throw new Error(`${error.message}; reward debug: ${JSON.stringify(debug)}`);
  }
  await waitFor(() => capturedVisualStages.has('wallet'), 'the wallet reward animation screenshot was not captured while visible');
  const payoutFlyBox = await page.evaluate(() => {
    const reward = window.__coinRewardDebug.find((entry) => entry.type === 'visible');
    const root = document.querySelector('#coin-pusher-root').getBoundingClientRect();
    return reward ? { ...reward, rootWidth: root.width, rootHeight: root.height } : undefined;
  });
  assert.ok(payoutFlyBox && payoutFlyBox.width > 30 && payoutFlyBox.height > 20,
    'confirmed wallet payouts must animate a visible +1 coin from the collection well');
  assert.match(payoutFlyBox.text, /\+\d+/, 'the coin flying from the tray must visibly carry its credited +1 amount');
  assert.ok(payoutFlyBox.startX >= 0 && payoutFlyBox.startX <= payoutFlyBox.rootWidth
    && payoutFlyBox.startY >= payoutFlyBox.rootHeight * .4 && payoutFlyBox.startY <= payoutFlyBox.rootHeight,
  `the +1 flight must begin visibly inside the lower payout-well area (${JSON.stringify(payoutFlyBox)})`);
  const visibleTrayCatch = await page.evaluate(() => window.__coinRewardDebug.find((entry) => entry.type === 'tray-catch-visible'));
  assert.ok(visibleTrayCatch && visibleTrayCatch.bottom < payoutFlyBox.startY - 8,
    `the combined catch cue must sit above the falling coin and leave its pit-to-wallet flight visible (${JSON.stringify({ catch: visibleTrayCatch, reward: payoutFlyBox })})`);
  const payoutSequence = await page.evaluate(() => {
    const events = window.__coinRewardDebug;
    return {
      tray: events.find((entry) => entry.type === 'tray-catch-visible'),
      reward: events.find((entry) => entry.type === 'inserted'),
    };
  });
  assert.ok(payoutSequence.tray, 'the physically collected coin must visibly confirm its arrival in the collection well');
  assert.match(payoutSequence.tray.text, /入槽|入坑槽|IN TRAY|IN THE PIT/i,
    'the first reward beat must say the coin entered the tray without prematurely promising wallet credit');
  assert.ok(payoutSequence.reward.at >= payoutSequence.tray.at,
    'the server-confirmed +1 coin flight must follow the visible tray catch beat');
  await waitFor(() => payoutCollectionTotal > 0, 'the payout response must include server-confirmed collection progress');
  if (payoutCollectionTotal >= 5) {
    try {
      await waitFor(() => page.evaluate(() => window.__coinToastDebug.some(({ text }) => /小爪新手/.test(text || ''))),
        'crossing the first confirmed payout milestone must name the specific keepsake that was unlocked');
    } catch (error) {
      const toastDebug = await page.evaluate(() => window.__coinToastDebug);
      throw new Error(`${error.message}; confirmed collection=${payoutCollectionTotal}; toasts=${JSON.stringify(toastDebug)}`);
    }
  }
  const expectedStampProgress = await page.evaluate((total) => {
    const thresholds = [5, 25, 100, 300, 1000];
    const unlocked = thresholds.filter((threshold) => total >= threshold).length;
    const nextThreshold = thresholds[unlocked];
    if (nextThreshold === undefined) return 100;
    const previousThreshold = unlocked ? thresholds[unlocked - 1] : 0;
    return Math.floor((total - previousThreshold) / (nextThreshold - previousThreshold) * 100);
  }, payoutCollectionTotal);
  await waitFor(async () => await collectionButton.getAttribute('data-progress-percent') === String(expectedStampProgress),
    'the HUD progress ring must follow confirmed payout totals');
  await collectionButton.click();
  await waitFor(async () => page.locator('.coin-pusher-collection-panel').isVisible(), 'collection panel did not reopen after payout');
  await waitFor(async () => Number(await page.locator('#coinPusherCollectionReturned').innerText()) === payoutCollectionTotal,
    'the collection total must match confirmed server payout coins');
  const finishIds = ['classic', 'bronze', 'silver', 'gold', 'crystal', 'aurora'];
  const expectedFinishTier = Math.min(5, [5, 25, 100, 300, 1000]
    .filter((threshold) => payoutCollectionTotal >= threshold).length);
  await waitFor(async () => await page.locator('#coin-pusher-root').getAttribute('data-keepsake-tier') === String(expectedFinishTier),
    'the live cabinet finish must follow server-confirmed payout milestones');
  assert.equal(await page.locator('#coin-pusher-root').getAttribute('data-keepsake-finish'), finishIds[expectedFinishTier],
    'the live material palette must match the earned stamp tier');
  assert.equal(await page.locator('.coin-pusher-finish-current').getAttribute('data-finish-tier'), String(expectedFinishTier),
    'the collection modal must preview the same finish that is applied to the 3D cabinet');
  const finishSwatchColors = await page.locator('.coin-pusher-finish-swatch > i').evaluateAll((swatches) =>
    swatches.map((swatch) => getComputedStyle(swatch).backgroundColor));
  assert.equal(new Set(finishSwatchColors).size, 3,
    'the collection preview must show three distinct metal and glow colors');
  assert.equal(await page.locator('.coin-pusher-progress-track').getAttribute('aria-valuenow'), String(expectedStampProgress),
    'the collection-book bar must agree with the HUD ring and total/next-threshold label');
  await page.locator('.coin-pusher-collection-close').click();
  const hadCascadeWindow = payoutAmounts.some((amount) => amount >= 2)
    || payoutTimes.some((time, index) => index > 0 && time - payoutTimes[index - 1] <= 2500);
  if (hadCascadeWindow) {
    await waitFor(() => page.evaluate(() => window.__coinRewardDebug.some((entry) => entry.type === 'cascade-visible')),
      'a short chain of confirmed payouts must show a visible cosmetic cascade label');
    await waitFor(() => capturedVisualStages.has('cascade'), 'the cascade callout screenshot was not captured while visible');
    const cascadeAudit = await page.evaluate(() => {
      const entries = window.__coinRewardDebug.filter((entry) =>
        ['cascade-visible', 'cascade-updated'].includes(entry.type));
      return {
        maxActiveCount: Math.max(0, ...entries.map((entry) => Number(entry.activeCount) || 0)),
        maxOpacity: Math.max(0, ...entries.map((entry) => Number(entry.opacity) || 0)),
        minHudGap: Math.min(...entries.map((entry) => Number(entry.hudGap)).filter(Number.isFinite)),
        labels: entries.map((entry) => entry.text),
      };
    });
    assert.equal(cascadeAudit.maxActiveCount, 1,
      `a payout chain must update one callout instead of stacking duplicates (${JSON.stringify(cascadeAudit)})`);
    assert.ok(cascadeAudit.minHudGap >= 20,
      `the cascade callout must sit clear of the responsive HUD (${JSON.stringify(cascadeAudit)})`);
    assert.ok(cascadeAudit.maxOpacity >= .82,
      `the cascade callout must be captured at a clearly visible point in its animation (${JSON.stringify(cascadeAudit)})`);
    assert.ok(cascadeAudit.labels.some((label) => /×\d+/.test(label)),
      `the reused cascade callout must retain its counted chain label (${JSON.stringify(cascadeAudit)})`);
  }
  assert.equal(Number((await page.locator('#coinBalanceHud').innerText()).replace(/,/g, '')),
    initialBalance - chargedDrops + payoutTotal,
    'the HUD wallet must equal starting coins minus drops plus payout coins');

  const aimBeforeGraphicsLoss = page.locator('.coin-pusher-aim-marker');
  const chargesBeforeGraphicsLoss = requests.filter((url) => url.endsWith('/coin-pusher/play')).length;
  await dispatchTouchPointer(page, 'pointerdown', .5, .3, 89);
  await waitFor(async () => aimBeforeGraphicsLoss.evaluate((node) => node.classList.contains('is-visible')),
    'an in-progress gesture must show its aim preview before WebGL loss');
  assert.equal(await page.locator('.coin-pusher-aim-guide').getAttribute('class'), 'coin-pusher-aim-guide is-visible',
    'the slot-to-lane guide must be visible before context loss');
  await page.evaluate(() => document.querySelector('#coin-pusher-root canvas').dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await waitFor(async () => !(await aimBeforeGraphicsLoss.getAttribute('class')).includes('is-visible'),
    'WebGL loss must clear an interrupted swipe preview');
  assert.equal(await page.locator('.coin-pusher-aim-guide').getAttribute('class'), 'coin-pusher-aim-guide',
    'WebGL loss must clear the slot-to-lane guide as well');
  await dispatchTouchPointer(page, 'pointerup', .5, .8, 89);
  assert.equal(requests.filter((url) => url.endsWith('/coin-pusher/play')).length, chargesBeforeGraphicsLoss,
    'a swipe interrupted by WebGL loss must never charge the student wallet');
  await waitFor(async () => await drop.isDisabled(), 'drop control stayed enabled after WebGL loss');
  assert.match(await page.locator('#coinPusherSystemStatus').innerText(), /暫停|paused/i);
  await page.evaluate(() => document.querySelector('#coin-pusher-root canvas').dispatchEvent(new Event('webglcontextrestored')));
  await waitFor(async () => !(await drop.isDisabled()), 'drop control did not recover after WebGL restore');
  await waitFor(async () => /下滑揀位|Swipe to aim/.test(await page.locator('#coinPusherSystemStatus').innerText()),
    'the temporary WebGL recovery message must return to the playable control hint');

  const viewports = [
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'ipad-landscape', width: 1180, height: 820 },
    { name: 'phone-landscape', width: 844, height: 390 },
    { name: 'phone', width: 390, height: 844 },
    { name: 'phone-narrow', width: 360, height: 780 },
    { name: 'phone-mini', width: 320, height: 700 },
  ];
  const framePacingByViewport = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const emulatedDpr = 3;
    await page.waitForTimeout(150);
    const hud = await page.locator('.coin-pusher-hud').boundingBox();
    const viewportSize = page.viewportSize();
    assert.ok(hud && viewportSize && hud.x >= 0 && hud.y >= 0 && hud.x + hud.width <= viewportSize.width + 1 && hud.y + hud.height <= viewportSize.height + 1,
      `${viewport.name}: HUD must stay inside the viewport`);
    const hudControlRects = await page.locator(
      '.coin-pusher-back, .coin-pusher-brand-heading, .coin-pusher-brand-status, .coin-pusher-wallet, .coin-pusher-drop, .coin-pusher-collection, .coin-pusher-sound',
    ).evaluateAll((elements) => elements.map((element) => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { label: element.className, x, y, right: x + width, bottom: y + height, width, height };
    }));
    for (let first = 0; first < hudControlRects.length; first += 1) {
      for (let second = first + 1; second < hudControlRects.length; second += 1) {
        const a = hudControlRects[first];
        const b = hudControlRects[second];
        const overlapX = Math.min(a.right, b.right) - Math.max(a.x, b.x);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
        assert.ok(overlapX <= 1 || overlapY <= 1,
          `${viewport.name}: HUD controls and brand copy must not overlap (${JSON.stringify({ a, b })})`);
      }
    }
    if (viewport.name.startsWith('phone')) {
      if (viewport.width > 340) assert.ok(hud && hud.height <= 96,
        `${viewport.name}: compact controls and live status must leave most of the playfield unobstructed (${JSON.stringify(hud)})`);
      if (viewport.width <= 380) assert.ok(hud && hud.height <= 116,
        `${viewport.name}: the two-row compact HUD must leave most of the playfield unobstructed (${JSON.stringify(hud)})`);
      const touchTargets = await page.locator('.coin-pusher-back, .coin-pusher-drop, .coin-pusher-collection, .coin-pusher-sound')
        .evaluateAll((buttons) => buttons.map((button) => ({
          label: button.className,
          width: button.getBoundingClientRect().width,
          height: button.getBoundingClientRect().height,
        })));
      assert.ok(touchTargets.every(({ width, height }) => width >= 44 && height >= 44),
        `${viewport.name}: visible HUD controls must keep >=44px touch targets (${JSON.stringify(touchTargets)})`);
    }
    if (viewport.name === 'phone') {
      await page.screenshot({ path: path.join(artifactDir, 'coin-pusher-phone-portrait-playtest.png'), animations: 'allow' });
    }
    const brandLayout = await page.locator('.coin-pusher-brand').evaluate((brand) => {
      const heading = brand.querySelector('.coin-pusher-brand-heading')?.getBoundingClientRect();
      const status = brand.querySelector('.coin-pusher-brand-status')?.getBoundingClientRect();
      const statusText = brand.querySelector('.coin-pusher-brand-status > span')?.getBoundingClientRect();
      const title = brand.querySelector('.coin-pusher-brand-heading > strong');
      const hint = brand.querySelector('.coin-pusher-keyboard-hint');
      const hintRect = hint?.getBoundingClientRect();
      return {
        headingHeight: heading?.height ?? 0,
        headingBottom: heading?.bottom ?? 0,
        titleClientWidth: title?.clientWidth ?? 0,
        titleScrollWidth: title?.scrollWidth ?? 0,
        statusTop: status?.top ?? 0,
        statusRight: statusText?.right ?? 0,
        statusTextWidth: statusText?.width ?? 0,
        hintLeft: getComputedStyle(hint).display === 'none' ? Number.POSITIVE_INFINITY : hintRect?.left ?? 0,
      };
    });
    assert.ok(brandLayout.statusTop >= brandLayout.headingBottom - 1,
      `${viewport.name}: live status must sit below the brand heading, not collide with it`);
    if (viewport.name.startsWith('phone')) assert.ok(brandLayout.titleScrollWidth <= brandLayout.titleClientWidth + 1,
      `${viewport.name}: the game title must not be ellipsized (${JSON.stringify(brandLayout)})`);
    if (viewport.width <= 340) assert.ok(brandLayout.statusTextWidth >= 80,
      `${viewport.name}: the narrow-phone title and live status need a readable text column (${JSON.stringify(brandLayout)})`);
    assert.ok(brandLayout.statusRight <= brandLayout.hintLeft + 1,
      `${viewport.name}: the live status must not overlap the keyboard hint`);
    if (viewport.name.startsWith('phone')) assert.ok(brandLayout.headingHeight < 30,
      `${viewport.name}: the game title must stay on one line in the compact HUD`);
    if (viewport.name.startsWith('phone')) {
      const walletAmount = await page.locator('#coinBalanceHud').evaluate((amount) => {
        const text = document.createRange();
        text.selectNodeContents(amount);
        const rects = Array.from(text.getClientRects());
        const wallet = amount.closest('.coin-pusher-wallet').getBoundingClientRect();
        return {
          lines: rects.length,
          textRight: rects.length ? rects[rects.length - 1].right : 0,
          walletRight: wallet.right,
        };
      });
      assert.equal(walletAmount.lines, 1,
        `${viewport.name}: the complete wallet balance must stay on one line`);
      assert.ok(walletAmount.textRight <= walletAmount.walletRight - 4,
        `${viewport.name}: the wallet balance must not clip against its border (${JSON.stringify(walletAmount)})`);
    }
    const framePacing = await page.evaluate(async () => {
      const timestamps = [];
      await new Promise((resolve) => {
        const sample = (time) => {
          timestamps.push(time);
          if (time - timestamps[0] >= 900) resolve(undefined);
          else requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index]).sort((a, b) => a - b);
      const percentile = (ratio) => intervals.length
        ? Number(intervals[Math.min(intervals.length - 1, Math.ceil(intervals.length * ratio) - 1)].toFixed(1))
        : 0;
      const canvas = document.querySelector('#coin-pusher-root canvas');
      const durationMs = timestamps.length > 1 ? timestamps.at(-1) - timestamps[0] : 0;
      return {
        frames: timestamps.length,
        averageFps: durationMs > 0 ? Number(((timestamps.length - 1) * 1000 / durationMs).toFixed(1)) : 0,
        medianFrameMs: percentile(.5),
        p95FrameMs: percentile(.95),
        framesOver33Ms: intervals.filter((interval) => interval > 33.3).length,
        devicePixelRatio: window.devicePixelRatio,
        drawingBufferScale: canvas?.clientWidth ? Number((canvas.width / canvas.clientWidth).toFixed(2)) : 0,
      };
    });
    framePacingByViewport.push({ viewport: viewport.name, ...framePacing });
    const expectedDrawingBufferScale = Math.min(emulatedDpr, viewport.width < 620 ? 1.2 : 1.5);
    assert.equal(framePacing.devicePixelRatio, emulatedDpr,
      `${viewport.name}: browser must exercise a high-DPI display (${JSON.stringify(framePacing)})`);
    assert.ok(Math.abs(framePacing.drawingBufferScale - expectedDrawingBufferScale) <= .02,
      `${viewport.name}: renderer must cap the drawing buffer for high-DPI performance (${JSON.stringify({ framePacing, expectedDrawingBufferScale })})`);
    assert.ok(await drop.isVisible(), `${viewport.name}: paid-drop control must remain visible`);
    assert.ok(await collectionButton.isVisible(), `${viewport.name}: collection control must remain visible`);
    if (viewport.name.startsWith('phone')) {
      await collectionButton.click();
      const panelBox = await page.locator('.modal-card.coin-pusher-collection-modal').boundingBox();
      assert.ok(panelBox && panelBox.x >= 0 && panelBox.y >= 0
        && panelBox.x + panelBox.width <= viewport.width + 1
        && panelBox.y + panelBox.height <= viewport.height + 1,
      `${viewport.name}: collection panel must fit the viewport (${JSON.stringify({ panelBox, viewport })})`);
      if (viewport.name === 'phone-landscape') {
        const closeBox = await page.locator('.coin-pusher-collection-close').boundingBox();
        const panelOverflow = await page.locator('.modal-card.coin-pusher-collection-modal')
          .evaluate((panel) => ({
            clientHeight: panel.clientHeight,
            scrollHeight: panel.scrollHeight,
            overflowY: getComputedStyle(panel).overflowY,
            compactStyles: getComputedStyle(panel.querySelector('.coin-pusher-collection-panel')).gap,
            stampHeight: panel.querySelector('.coin-pusher-stamp').getBoundingClientRect().height,
            orientationMatches: matchMedia('(max-height:480px) and (orientation:landscape)').matches,
          }));
        assert.ok(closeBox && closeBox.y >= panelBox.y - 1
          && closeBox.y + closeBox.height <= panelBox.y + panelBox.height + 1,
        `phone-landscape: the Continue button must stay visible without scrolling (${JSON.stringify({ closeBox, panelBox, panelOverflow })})`);
        assert.ok(panelOverflow.scrollHeight <= panelOverflow.clientHeight + 1,
          `phone-landscape: the full keepsake collection should fit without internal scrolling (${JSON.stringify(panelOverflow)})`);
      }
      if (viewport.width <= 380 && viewport.height <= 760) {
        const closeBox = await page.locator('.coin-pusher-collection-close').boundingBox();
        const panelOverflow = await page.locator('.modal-card.coin-pusher-collection-modal')
          .evaluate((panel) => ({ clientHeight: panel.clientHeight, scrollHeight: panel.scrollHeight }));
        assert.ok(closeBox && closeBox.y >= panelBox.y - 1
          && closeBox.y + closeBox.height <= panelBox.y + panelBox.height + 1,
        `${viewport.name}: the Continue button must be fully visible when the keepsake panel opens (${JSON.stringify({ closeBox, panelBox })})`);
        assert.ok(panelOverflow.scrollHeight <= panelOverflow.clientHeight + 1,
          `${viewport.name}: the full keepsake panel should fit without requiring a guessed scroll (${JSON.stringify(panelOverflow)})`);
      }
      const stampBoxes = await page.locator('.coin-pusher-stamp').evaluateAll((cards) => cards.map((card) => {
        const cardBox = card.getBoundingClientRect();
        const medalBox = card.querySelector('.coin-pusher-stamp-medallion').getBoundingClientRect();
        return { x: cardBox.x, right: cardBox.right, medalX: medalBox.x, medalRight: medalBox.right };
      }));
      assert.equal(stampBoxes.length, 5, `${viewport.name}: all five keepsakes must remain visible`);
      assert.ok(stampBoxes.every((stamp) => stamp.medalX >= stamp.x && stamp.medalRight <= stamp.right),
        `${viewport.name}: medal artwork must stay inside each responsive card (${JSON.stringify(stampBoxes)})`);
      await page.screenshot({ path: path.join(artifactDir, `coin-pusher-collection-${viewport.name}.png`) });
      await page.locator('.coin-pusher-collection-close').click();
    }
    await page.screenshot({ path: path.join(artifactDir, `coin-pusher-acceptance-${viewport.name}.png`) });
  }

  const tabletAssetPage = await context.newPage();
  tabletAssetPage.setViewportSize({ width: 1180, height: 820 });
  tabletAssetPage.on('pageerror', (error) => errors.push(`tablet pageerror: ${error.message}`));
  tabletAssetPage.on('console', (message) => {
    if (message.type() === 'error') errors.push(`tablet console: ${message.text()}`);
  });
  await tabletAssetPage.goto('/pet', { waitUntil: 'networkidle' });
  await tabletAssetPage.locator('[data-tab="coinPusher"]').click();
  await tabletAssetPage.locator('#coin-pusher-root canvas').waitFor();
  await waitFor(async () => !(await tabletAssetPage.locator('#coin-pusher-root').getAttribute('aria-busy') === 'true'),
    'the iPad landscape coin pusher did not finish loading');
  const tabletHud = await tabletAssetPage.locator('.coin-pusher-hud').boundingBox();
  assert.ok(tabletHud && tabletHud.x >= 0 && tabletHud.y >= 0
    && tabletHud.x + tabletHud.width <= 1181 && tabletHud.y + tabletHud.height <= 821,
  `the iPad cold-load HUD must be visible and fit inside its landscape viewport (${JSON.stringify(tabletHud)})`);
  const tabletHudStyle = await tabletAssetPage.locator('.coin-pusher-hud').evaluate((node) => {
    const style = getComputedStyle(node);
    const roomBar = node.parentElement;
    const root = document.querySelector('#coin-pusher-root');
    return {
      display: style.display, visibility: style.visibility, opacity: style.opacity, zIndex: style.zIndex,
      roomBarZIndex: roomBar ? getComputedStyle(roomBar).zIndex : 'missing',
      rootZIndex: root ? getComputedStyle(root).zIndex : 'missing',
    };
  });
  assert.ok(tabletHudStyle.display !== 'none' && tabletHudStyle.visibility === 'visible'
    && Number(tabletHudStyle.opacity) > .5,
  `the iPad cold-load HUD must be visibly painted (${JSON.stringify(tabletHudStyle)})`);
  const tabletArtwork = await tabletAssetPage.evaluate(() => ({
    viewportWidth: window.innerWidth,
    rootWidth: document.querySelector('#coin-pusher-root').getBoundingClientRect().width,
    resources: performance.getEntriesByType('resource')
      .filter((entry) => /coin-pusher-(?:backboard|minted-paw)-(?:mobile-v2|v1)/i.test(entry.name))
      .map((entry) => ({ name: new URL(entry.name).pathname.split('/').pop(), bytes: entry.transferSize })),
  }));
  assert.ok(tabletArtwork.viewportWidth > 620 && tabletArtwork.viewportWidth <= 1280,
    `tablet cold-load fixture must use a landscape tablet width (${JSON.stringify(tabletArtwork)})`);
  assert.equal(tabletArtwork.resources.length, 2,
    `the iPad should load exactly its two compact illustrations (${JSON.stringify(tabletArtwork)})`);
  assert.ok(tabletArtwork.resources.every((entry) => /mobile-v2/i.test(entry.name)),
    `the iPad must select compact v2 artwork (${JSON.stringify(tabletArtwork)})`);
  assert.ok(tabletArtwork.resources.reduce((total, entry) => total + entry.bytes, 0) <= 65000,
    `the iPad artwork transfer must stay under 65KB (${JSON.stringify(tabletArtwork)})`);
  await tabletAssetPage.screenshot({ path: path.join(artifactDir, 'coin-pusher-tablet-artwork-cold-load.png') });
  await tabletAssetPage.locator('.coin-pusher-hud').screenshot({ path: path.join(artifactDir, 'coin-pusher-tablet-hud-cold-load.png') });
  await tabletAssetPage.close();

  const touchContext = await browser.newContext({
    baseURL, viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  });
  await touchContext.addCookies(await context.cookies());
  const touchPage = await touchContext.newPage();
  touchPage.on('pageerror', (error) => errors.push(`touch pageerror: ${error.message}`));
  touchPage.on('console', (message) => { if (message.type() === 'error') errors.push(`touch console: ${message.text()}`); });
  const touchRequests = [];
  const touchModuleRequests = [];
  const touchPayoutAmounts = [];
  touchPage.on('request', (request) => {
    if (request.url().includes('/api/pet/coin-pusher/')) touchRequests.push(request.url());
    const pathname = new URL(request.url()).pathname;
    if (/CoinPusherScene|CoinPusherModel|rapier_wasm3d_bg/i.test(pathname)) {
      touchModuleRequests.push({ name: pathname.split('/').pop(), requestedAt: Date.now() });
    }
  });
  touchPage.on('response', (response) => {
    if (!response.url().endsWith('/coin-pusher/payout')) return;
    void response.json().then((body) => {
      if (body?.success) touchPayoutAmounts.push(Number(body.earned) || 0);
    }).catch(() => {});
  });
  await touchPage.addInitScript(() => {
    window.__coinPusherNavPointerDownAt = undefined;
    window.__coinPusherNavClickAt = undefined;
    window.__coinRewardDebug = [];
    new MutationObserver((records) => {
      for (const record of records) for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const flyer = node.matches('.coin-pusher-reward-fly') ? node : node.querySelector('.coin-pusher-reward-fly');
        if (!flyer) continue;
        const root = document.querySelector('#coin-pusher-root');
        const rect = root?.getBoundingClientRect();
        window.__coinRewardDebug.push({
          text: flyer.textContent.trim(),
          x: Number.parseFloat(flyer.style.left),
          y: Number.parseFloat(flyer.style.top),
          rootWidth: rect?.width ?? 0,
          rootHeight: rect?.height ?? 0,
          at: performance.now(),
        });
      }
    }).observe(document, { childList: true, subtree: true });
    document.addEventListener('pointerdown', (event) => {
      if (event.target instanceof Element && event.target.closest('[data-tab="coinPusher"]')) {
        window.__coinPusherNavPointerDownAt = Date.now();
      }
    }, true);
    document.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('[data-tab="coinPusher"]')) {
        window.__coinPusherNavClickAt = Date.now();
      }
    }, true);
  });
  await touchPage.goto('/pet', { waitUntil: 'networkidle' });
  assert.equal(touchModuleRequests.length, 0,
    'the student home must not download coin-pusher physics without intent');
  const touchTab = touchPage.locator('[data-tab="coinPusher"]');
  const touchTabBox = await touchTab.boundingBox();
  assert.ok(touchTabBox, 'the touch arcade tab must be visible before the student presses it');
  const touchInput = await touchContext.newCDPSession(touchPage);
  await touchInput.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: touchTabBox.x + touchTabBox.width / 2, y: touchTabBox.y + touchTabBox.height / 2, id: 41, force: 1 }],
  });
  await waitFor(() => touchModuleRequests.some(({ name }) => /CoinPusherScene/i.test(name))
    && touchModuleRequests.some(({ name }) => /CoinPusherModel/i.test(name))
    && touchModuleRequests.some(({ name }) => /rapier_wasm3d_bg/i.test(name)),
  'a touch press on the arcade tab must start the scene and physics downloads');
  const touchPreClick = await touchPage.evaluate(() => ({
    pointerDownAt: window.__coinPusherNavPointerDownAt,
    clickAt: window.__coinPusherNavClickAt,
    canvasCount: document.querySelectorAll('#coin-pusher-root canvas').length,
  }));
  assert.ok(touchPreClick.pointerDownAt && touchPreClick.clickAt === undefined && touchPreClick.canvasCount === 0,
    'pointer-down preloading must remain invisible until the student commits the click');
  assert.ok(touchModuleRequests.every(({ requestedAt }) => requestedAt >= touchPreClick.pointerDownAt),
    'touch module downloads must begin only after the explicit pointer-down intent');
  assert.equal(touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length, 0,
    'warming physics on pointer-down must never spend a student coin');
  await touchInput.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await waitFor(async () => Boolean(await touchPage.evaluate(() => window.__coinPusherNavClickAt)),
    'a real touch release should commit navigation only after the pre-click preload check');
  const touchClickAt = await touchPage.evaluate(() => window.__coinPusherNavClickAt);
  await touchInput.detach();
  const touchPreloadSummary = {
    pointerDownToClickMs: touchClickAt - touchPreClick.pointerDownAt,
    requestsStartedBeforeClick: touchModuleRequests.length,
  };
  await touchPage.locator('#coin-pusher-root canvas').waitFor();
  await waitFor(async () => !(await touchPage.locator('#coin-pusher-root').getAttribute('aria-busy') === 'true'),
    'touch client stayed busy during initialization');
  const touchPhoneHud = await touchPage.locator('.coin-pusher-hud').boundingBox();
  assert.ok(touchPhoneHud && touchPhoneHud.x >= 0 && touchPhoneHud.y >= 0
    && touchPhoneHud.x + touchPhoneHud.width <= 391 && touchPhoneHud.y + touchPhoneHud.height <= 845,
  'touch-enabled phone HUD must stay inside the viewport');
  assert.equal(await touchPage.locator('.coin-pusher-keyboard-hint').isVisible(), false,
    'touch-first phone HUD must not reserve space for keyboard instructions');
  const touchHint = await touchPage.locator('#coinPusherSystemStatus').evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    const lineTops = new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top)));
    return { text: node.textContent.trim(), lines: lineTops.size };
  });
  assert.match(touchHint.text, /下滑揀位|Swipe to aim/,
    'touch players must see a direct swipe-to-aim instruction');
  assert.ok(touchHint.lines <= 2,
    `the compact mobile control hint must fit the two-line status slot (${JSON.stringify(touchHint)})`);
  const touchAim = touchPage.locator('.coin-pusher-aim-marker');
  const touchGuide = touchPage.locator('.coin-pusher-aim-guide');
  await dispatchTouchPointer(touchPage, 'pointerdown', .52, .28, 39);
  await waitFor(async () => touchAim.evaluate((node) => node.classList.contains('is-visible')),
    'pointer-cancel test must first show the aim preview');
  await dispatchTouchPointer(touchPage, 'pointercancel', .52, .28, 39);
  await waitFor(async () => !(await touchAim.getAttribute('class')).includes('is-visible'),
    'the aim preview must clear when the operating system cancels touch');
  assert.equal(await touchPage.locator('.coin-pusher-aim-guide').getAttribute('class'), 'coin-pusher-aim-guide',
    'a cancelled touch must clear the slot-to-lane guide too');
  assert.equal(touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length, 0,
    'an operating-system-cancelled swipe must not charge a coin');
  await dispatchTouchPointer(touchPage, 'pointerdown', .52, .28, 39);
  await waitFor(async () => touchAim.evaluate((node) => node.classList.contains('is-visible')),
    'lost-capture test must first show the aim preview');
  await dispatchTouchPointer(touchPage, 'lostpointercapture', .52, .28, 39);
  await waitFor(async () => !(await touchAim.getAttribute('class')).includes('is-visible'),
    'the aim preview must clear if touch capture is lost');
  assert.equal(touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length, 0,
    'a lost touch capture must not charge a coin');
  await dispatchTouchPointer(touchPage, 'pointerdown', .48, .28, 50);
  await waitFor(async () => touchAim.evaluate((node) => node.classList.contains('is-visible')),
    'the primary finger must establish the aiming lane before a second finger touches');
  const primaryAimLane = await touchAim.getAttribute('data-lane-x');
  await dispatchTouchPointer(touchPage, 'pointerdown', .76, .27, 51, false);
  await dispatchTouchPointer(touchPage, 'pointermove', .76, .74, 51, false);
  await dispatchTouchPointer(touchPage, 'pointerup', .76, .74, 51, false);
  await dispatchTouchPointer(touchPage, 'pointercancel', .76, .74, 51, false);
  assert.equal(await touchAim.getAttribute('data-lane-x'), primaryAimLane,
    'a secondary finger must not replace the primary finger\'s aimed lane');
  assert.equal(await touchAim.evaluate((node) => node.classList.contains('is-visible')), true,
    'a secondary pointerup or cancel must not clear the primary finger\'s aim');
  await touchPage.waitForTimeout(250);
  assert.equal(touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length, 0,
    'a second finger swiping and cancelling must never charge a coin');
  await dispatchTouchPointer(touchPage, 'pointerup', .48, .3, 50);
  await waitFor(async () => !(await touchAim.getAttribute('class')).includes('is-visible'),
    'the primary finger must remain able to end its own gesture');
  assert.equal(touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length, 0,
    'ending the primary gesture with a short tap must remain free');
  await dispatchTouchPointer(touchPage, 'pointerdown', .45, .3, 40);
  await dispatchTouchPointer(touchPage, 'pointerup', .45, .31, 40);
  await waitFor(async () => !(await touchAim.getAttribute('class')).includes('is-visible'),
    'a short tap must clear the aiming preview');
  assert.equal(touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length, 0,
    'a touch tap without a valid downward swipe must not charge a coin');
  await dispatchTouchPointer(touchPage, 'pointerdown', .28, .3);
  await waitFor(async () => touchAim.evaluate((node) => node.classList.contains('is-visible')),
    'touch start must show the landing-lane preview');
  await waitFor(async () => touchGuide.evaluate((node) => node.classList.contains('is-visible')
    && Number(getComputedStyle(node).opacity) > .5), 'touch aiming must show the slot-to-lane guide');
  const touchGuideCoordinates = await touchGuide.locator('line').evaluate((line) => ({
    x1: Number(line.getAttribute('x1')), x2: Number(line.getAttribute('x2')),
    y1: Number(line.getAttribute('y1')), y2: Number(line.getAttribute('y2')),
  }));
  const touchGuideLength = Math.hypot(
    touchGuideCoordinates.x1 - touchGuideCoordinates.x2,
    touchGuideCoordinates.y1 - touchGuideCoordinates.y2,
  );
  assert.ok(touchGuideLength > 24
    && Math.abs(touchGuideCoordinates.x1 - touchGuideCoordinates.x2) / touchGuideLength < .18,
  `phone touch guidance must retain a clear perspective-projected drop lane (${JSON.stringify(touchGuideCoordinates)})`);
  const touchAimStart = await touchAim.boundingBox();
  assert.ok(touchAimStart, 'touch aim marker must have a visible location');
  const touchAimStartLane = await touchAim.getAttribute('data-lane-x');
  await dispatchTouchPointer(touchPage, 'pointermove', .31, .72);
  assert.equal(await touchAim.getAttribute('data-lane-x'), touchAimStartLane,
    'touch drop lane must stay locked to the finger-down position');
  assert.equal(touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length, 0,
    'touch aiming and dragging must not charge before the swipe is released');
  await touchPage.screenshot({ path: path.join(artifactDir, 'coin-pusher-aim-preview-phone.png') });
  await touchPage.evaluate(() => document.documentElement.classList.add('reduced-motion'));
  await dispatchTouchPointer(touchPage, 'pointerup', .31, .72);
  assert.equal(await touchGuide.getAttribute('class'), 'coin-pusher-aim-guide',
    'a completed phone swipe must clear the trajectory guide after charging once');
  await waitFor(() => touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length === 1,
    'a valid phone touch swipe must charge exactly one coin after release');
  const touchTimingCue = touchPage.locator('.coin-pusher-timing-cue');
  await waitFor(async () => touchTimingCue.evaluate((node) => node.dataset.beat === 'forward'
    && node.classList.contains('is-static') && getComputedStyle(node).opacity > .8),
  'the phone should receive the forward-timing cue without motion when reduced-motion is requested');
  const touchTimingLayout = await touchTimingCue.evaluate((node) => {
    const cue = node.getBoundingClientRect();
    const root = document.querySelector('#coin-pusher-root').getBoundingClientRect();
    return {
      x: cue.x, y: cue.y, right: cue.right, bottom: cue.bottom,
      rootRight: root.right, rootBottom: root.bottom, animationName: getComputedStyle(node).animationName,
    };
  });
  assert.ok(touchTimingLayout.x >= 0 && touchTimingLayout.y >= 0
    && touchTimingLayout.right <= 391 && touchTimingLayout.bottom <= 845,
  `reduced-motion timing feedback must remain inside the phone screen (${JSON.stringify(touchTimingLayout)})`);
  assert.equal(touchTimingLayout.animationName, 'none', 'the timing cue must not animate for reduced-motion users');
  await touchPage.screenshot({ path: path.join(artifactDir, 'coin-pusher-good-timing-phone-static.png') });
  await touchPage.evaluate(() => document.documentElement.classList.remove('reduced-motion'));

  await touchPage.setViewportSize({ width: 844, height: 390 });
  await touchPage.waitForTimeout(180);
  const touchLandscapeHud = await touchPage.locator('.coin-pusher-hud').boundingBox();
  assert.ok(touchLandscapeHud && touchLandscapeHud.x >= 0 && touchLandscapeHud.y >= 0
    && touchLandscapeHud.x + touchLandscapeHud.width <= 845 && touchLandscapeHud.y + touchLandscapeHud.height <= 391,
  `touch-enabled phone landscape HUD must stay inside the viewport (${JSON.stringify(touchLandscapeHud)})`);
  assert.ok(touchLandscapeHud.height <= 80,
    `landscape phone HUD must leave the short playfield clear (${JSON.stringify(touchLandscapeHud)})`);
  assert.equal(await touchPage.locator('.coin-pusher-keyboard-hint').isVisible(), false,
    'touch-first landscape phones must not show keyboard-only instructions');
  const landscapeTouchTargets = await touchPage.locator('.coin-pusher-back, .coin-pusher-drop, .coin-pusher-collection, .coin-pusher-sound')
    .evaluateAll((buttons) => buttons.map((button) => ({
      label: button.className,
      width: button.getBoundingClientRect().width,
      height: button.getBoundingClientRect().height,
    })));
  assert.ok(landscapeTouchTargets.every(({ width, height }) => width >= 44 && height >= 44),
    `landscape touch controls must remain easy to hit (${JSON.stringify(landscapeTouchTargets)})`);
  await touchPage.screenshot({ path: path.join(artifactDir, 'coin-pusher-touch-phone-landscape.png') });
  await waitFor(async () => !(await touchPage.locator('.coin-pusher-drop').isDisabled()),
    'landscape touch test started before the portrait phone drop finished');
  await dispatchTouchPointer(touchPage, 'pointerdown', .63, .3, 43);
  await dispatchTouchPointer(touchPage, 'pointermove', .66, .76, 43);
  assert.equal(touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length, 1,
    'landscape phone aiming must not charge before swipe release');
  await dispatchTouchPointer(touchPage, 'pointerup', .66, .76, 43);
  await waitFor(() => touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length === 2,
    'a valid landscape phone swipe must charge exactly one coin after release');

  await touchPage.setViewportSize({ width: 1180, height: 820 });
  await touchPage.waitForTimeout(150);
  const touchTabletHud = await touchPage.locator('.coin-pusher-hud').boundingBox();
  assert.ok(touchTabletHud && touchTabletHud.x >= 0 && touchTabletHud.y >= 0
    && touchTabletHud.x + touchTabletHud.width <= 1181 && touchTabletHud.y + touchTabletHud.height <= 821,
  'touch-enabled iPad landscape HUD must stay inside the viewport');
  await waitFor(async () => !(await touchPage.locator('.coin-pusher-drop').isDisabled()),
    'touch controls did not re-enable after the landscape phone drop');
  await dispatchTouchPointer(touchPage, 'pointerdown', .68, .3, 42);
  await dispatchTouchPointer(touchPage, 'pointermove', .70, .72, 42);
  assert.equal(touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length, 2,
    'iPad touch aiming must not charge before release');
  await dispatchTouchPointer(touchPage, 'pointerup', .70, .72, 42);
  await waitFor(() => touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length === 3,
    'a valid iPad landscape touch swipe must charge exactly one coin after release');
  await touchPage.setViewportSize({ width: 844, height: 390 });
  await touchPage.waitForTimeout(180);
  const landscapePayoutBaseline = touchPayoutAmounts.length;
  const landscapeFlyerBaseline = await touchPage.evaluate(() => window.__coinRewardDebug.length);
  const landscapeDropLanes = [.24, .38, .52, .66, .8, .9];
  for (let extraDrop = 0; extraDrop < 12 && touchPayoutAmounts.length === landscapePayoutBaseline; extraDrop += 1) {
    await waitFor(async () => !(await touchPage.locator('.coin-pusher-drop').isDisabled()),
      'landscape payout test could not resume the touch drop control');
    const playCountBefore = touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length;
    const pointerId = 60 + extraDrop;
    const lane = landscapeDropLanes[extraDrop % landscapeDropLanes.length];
    await dispatchTouchPointer(touchPage, 'pointerdown', lane, .3, pointerId);
    await dispatchTouchPointer(touchPage, 'pointermove', lane + .02, .74, pointerId);
    await dispatchTouchPointer(touchPage, 'pointerup', lane + .02, .74, pointerId);
    await waitFor(() => touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length === playCountBefore + 1,
      'a continued phone-landscape swipe must authorize one drop');
    await page.waitForTimeout(360);
  }
  await waitFor(() => touchPayoutAmounts.length > landscapePayoutBaseline,
    `the phone-landscape playfield must confirm a real collection-well payout after drops across the playfield (drops=${touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length}, payouts=${touchPayoutAmounts.length})`, 45000);
  await waitFor(async () => touchPage.evaluate((baseline) => window.__coinRewardDebug.length > baseline,
    landscapeFlyerBaseline),
  `a confirmed phone-landscape payout must animate a coin to the wallet (${JSON.stringify({
    payoutResponses: touchPayoutAmounts.slice(landscapePayoutBaseline),
    status: await touchPage.locator('#coinPusherSystemStatus').innerText(),
  })})`, 5000);
  const landscapePayoutOrigin = await touchPage.evaluate(() => window.__coinRewardDebug.at(-1));
  assert.match(landscapePayoutOrigin.text, /\+\d+/, 'the phone payout flight must show its credited amount');
  assert.ok(landscapePayoutOrigin.x >= 0 && landscapePayoutOrigin.x <= landscapePayoutOrigin.rootWidth
    && landscapePayoutOrigin.y >= landscapePayoutOrigin.rootHeight * .4 && landscapePayoutOrigin.y <= landscapePayoutOrigin.rootHeight,
  `phone-landscape payout origin must stay visible in the lower collection well (${JSON.stringify(landscapePayoutOrigin)})`);
  await touchPage.screenshot({ path: path.join(artifactDir, 'coin-pusher-payout-reward-phone-landscape.png'), animations: 'allow' });
  await waitFor(async () => !(await touchPage.locator('.coin-pusher-drop').isDisabled()),
    'touch exit test started before the iPad drop finished');
  await touchPage.locator('[data-action="coin-pusher-exit"]').tap();
  await waitFor(async () => await touchPage.locator('#game-root canvas').isVisible(),
    'touch exit did not return from the pusher to the bedroom');
  await touchContext.close();

  await page.locator('[data-action="coin-pusher-exit"]').click();
  await waitFor(async () => await page.locator('#game-root canvas').isVisible(), 'exit did not return to the bedroom');
  const bedroomCanvas = await page.locator('#game-root canvas').boundingBox();
  assert.ok(bedroomCanvas && bedroomCanvas.width >= 300
    && bedroomCanvas.height >= Math.min(200, bedroomCanvas.width * 9 / 16) - 1,
  'bedroom canvas must be restored at its expected aspect-ratio size after exit');
  const physicsSessionBeforeReentry = await page.locator('#coin-pusher-root').getAttribute('data-physics-session');
  const paidDropsBeforeReentry = requests.filter((url) => url.endsWith('/coin-pusher/play')).length;
  const collectionBeforeReentryResponse = await context.request.get('/api/pet/bootstrap');
  assert.equal(collectionBeforeReentryResponse.status(), 200, 'the re-entry check must read the current server wallet snapshot');
  const collectionBeforeReentry = Number((await collectionBeforeReentryResponse.json()).coinPusherCollection?.returnedCoins) || 0;
  const finishTierBeforeReentry = Math.min(5, [5, 25, 100, 300, 1000]
    .filter((threshold) => collectionBeforeReentry >= threshold).length);
  assert.ok(physicsSessionBeforeReentry, 'the active board must expose a stable simulation-session diagnostic');
  await page.locator('[data-tab="coinPusher"]').click();
  await page.locator('#coin-pusher-root canvas').waitFor();
  await waitFor(async () => !(await page.locator('#coin-pusher-root').getAttribute('aria-busy') === 'true'),
    'the saved coin-pusher session did not render after returning from the bedroom');
  await waitFor(async () => !(await page.locator('.coin-pusher-drop').isDisabled()),
    'the re-entered coin-pusher session did not become playable');
  assert.equal(await page.locator('#coin-pusher-root').getAttribute('data-physics-session'), physicsSessionBeforeReentry,
    'leaving and re-entering must reconnect to the same Rapier world rather than reset the board');
  const reentryCollectionState = await page.evaluate(() => ({
    boardTier: document.querySelector('#coin-pusher-root')?.getAttribute('data-keepsake-tier'),
    boardFinish: document.querySelector('#coin-pusher-root')?.getAttribute('data-keepsake-finish'),
    hudCount: document.querySelector('#coinPusherCollectionCount')?.textContent?.trim(),
    wallet: document.querySelector('#coinBalanceHud')?.textContent?.trim(),
  }));
  assert.equal(reentryCollectionState.hudCount, `${finishTierBeforeReentry}/5`,
    `the re-entered HUD must refresh the latest server collection (${JSON.stringify({ ...reentryCollectionState, finishTierBeforeReentry, collectionBeforeReentry })})`);
  assert.equal(reentryCollectionState.boardTier, String(finishTierBeforeReentry),
    're-entering the bedroom must keep the server-confirmed cabinet finish');
  assert.equal(reentryCollectionState.boardFinish, finishIds[finishTierBeforeReentry],
    'the cabinet material after re-entry must match the latest server-confirmed finish');
  assert.equal(requests.filter((url) => url.endsWith('/coin-pusher/play')).length, paidDropsBeforeReentry,
    're-entering the saved board must not charge another coin');

  const coinsBeforeReload = await page.locator('#coin-pusher-root').getAttribute('data-coin-count');
  const walletBeforeReloadResponse = await context.request.get('/api/pet/bootstrap');
  const walletBeforeReload = Number((await walletBeforeReloadResponse.json()).wallet.balance);
  const paidDropsBeforeReload = playRequestKeys.length;
  assert.ok(Number(coinsBeforeReload) > 0, 'the live board must expose its current physical coin count');
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-tab="coinPusher"]').click();
  await page.locator('#coin-pusher-root canvas').waitFor();
  await waitFor(async () => await page.locator('#coin-pusher-root').getAttribute('data-session-restored') === 'true',
    "a page reload must reopen the student's saved Rapier session");
  await waitFor(async () => !(await page.locator('#coin-pusher-root').getAttribute('aria-busy') === 'true'),
    'the restored board did not finish rendering');
  await waitFor(async () => !(await page.locator('.coin-pusher-drop').isDisabled()),
    'the restored board did not become playable');
  assert.equal(await page.locator('#coin-pusher-root').getAttribute('data-coin-count'), coinsBeforeReload,
    'a reload must restore the same coins instead of rebuilding the starting pile');
  assert.equal(playRequestKeys.length, paidDropsBeforeReload,
    'reopening the saved session must not silently charge another coin');
  const walletAfterReloadResponse = await context.request.get('/api/pet/bootstrap');
  const bootstrapAfterReload = await walletAfterReloadResponse.json();
  assert.equal(Number(bootstrapAfterReload.wallet.balance), walletBeforeReload,
    'reopening the saved session must preserve the authoritative student wallet balance');
  const returnedCoinsAfterReload = Number(bootstrapAfterReload.coinPusherCollection?.returnedCoins) || 0;
  const finishTierAfterReload = Math.min(5, [5, 25, 100, 300, 1000]
    .filter((threshold) => returnedCoinsAfterReload >= threshold).length);
  assert.equal(await page.locator('#coin-pusher-root').getAttribute('data-keepsake-tier'), String(finishTierAfterReload),
    `a reload must apply the cabinet finish from the latest server-confirmed stamp total (${returnedCoinsAfterReload})`);
  assert.equal(await page.locator('#coin-pusher-root').getAttribute('data-keepsake-finish'), finishIds[finishTierAfterReload],
    'the material finish after reload must match the authoritative collection milestone');
  const payoutKeysByEvent = new Map();
  for (const { eventId, requestKey } of payoutRequestEvents) {
    if (payoutKeysByEvent.has(eventId)) assert.equal(requestKey, payoutKeysByEvent.get(eventId),
      'a replayed payout event must keep its original idempotency key');
    else payoutKeysByEvent.set(eventId, requestKey);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.deepEqual(page.viewportSize(), { width: 1440, height: 900 },
    'desktop reload evidence must be captured at the named desktop viewport');
  await page.screenshot({ path: path.join(artifactDir, 'coin-pusher-restored-after-reload-desktop.png'), animations: 'allow' });

  const lostReplyPlayRoute = '**/api/pet/coin-pusher/play';
  const playCountBeforeLostReply = playRequestKeys.length;
  const coinCountBeforeLostReply = Number(await page.locator('#coin-pusher-root').getAttribute('data-coin-count'));
  await page.route(lostReplyPlayRoute, async (route) => {
    const charged = await route.fetch();
    assert.equal(charged.status(), 200, 'fault injection must happen after the server committed the play');
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, message: 'simulated lost reply' }) });
  }, { times: 1 });
  expectedLostTransactionReply = true;
  await page.locator('.coin-pusher-drop').click();
  await waitFor(async () => /結果未確認|Drop not confirmed/i.test(await page.locator('#coinPusherSystemStatus').textContent() || ''),
    'a lost play response must leave a safe, retryable confirmation state');
  await page.unroute(lostReplyPlayRoute);
  expectedLostTransactionReply = false;
  assert.equal(playRequestKeys.length, playCountBeforeLostReply + 1,
    'the server must receive the first paid-drop attempt before the simulated reply loss');
  const retriedDropKey = playRequestKeys.at(-1);
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('[data-tab="coinPusher"]').click();
  await page.locator('#coin-pusher-root canvas').waitFor();
  await waitFor(async () => await page.locator('#coin-pusher-root').getAttribute('data-session-restored') === 'true',
    'the uncertain paid drop must survive a page reload in the saved student session');
  await waitFor(() => playRequestKeys.length === playCountBeforeLostReply + 2,
    'the restored session must automatically retry an uncertain paid drop');
  await waitFor(async () => !(await page.locator('.coin-pusher-drop').isDisabled()),
    'the retried paid drop did not complete');
  assert.equal(playRequestKeys.at(-1), retriedDropKey,
    'recovery after a reload must reuse the original idempotency key');
  const databaseAfterLostReply = JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  const lostReplyCharges = databaseAfterLostReply.petCurrencyLedger.filter((row) =>
    row.studentId === 'S001' && row.kind === 'coin_pusher_play' && row.idempotencyKey === retriedDropKey);
  assert.equal(lostReplyCharges.length, 1, 'a lost response and retry must debit exactly once');
  assert.equal(lostReplyCharges[0].delta, -1, 'a recovered play must still cost exactly one student coin');
  assert.ok(Number(await page.locator('#coin-pusher-root').getAttribute('data-coin-count')) >= coinCountBeforeLostReply,
    'the confirmed paid drop must remain on the restored physical board');

  // Force the real WASM failure path once. The retry intentionally reloads the document because
  // browsers cache a failed dynamic module evaluation; an in-place import would repeat the same
  // failure instead of giving the student a genuine second attempt. Use a fresh browser context
  // so the first scene's already-cached Rapier module cannot bypass the forced network failure.
  const failureContext = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await failureContext.addCookies(await context.cookies());
  const failurePage = await failureContext.newPage();
  failurePage.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  // The deliberately aborted WASM request emits a browser-level ERR_FAILED console line. It is
  // the expected fault injection, so keep application page errors while excluding that transport
  // diagnostic from the clean-flow assertion below.
  await failurePage.route('**/*.wasm', (route) => route.abort());
  await failurePage.goto('/pet', { waitUntil: 'networkidle' });
  await failurePage.locator('[data-tab="coinPusher"]').click();
  await failurePage.locator('.coin-pusher-fallback').waitFor({ timeout: 15000 });
  assert.equal(await failurePage.locator('.coin-pusher-retry').isVisible(), true, 'WASM failure must offer a retry');
  await failurePage.unroute('**/*.wasm');
  await failurePage.locator('.coin-pusher-retry').click();
  await failurePage.locator('#coin-pusher-root canvas').waitFor({ timeout: 15000 });
  await waitFor(async () => !(await failurePage.locator('#coin-pusher-root').getAttribute('aria-busy') === 'true'), 'retry stayed busy after reload');
  assert.equal(await failurePage.locator('.coin-pusher-fallback').count(), 0, 'successful retry must remove the fallback');
  await failureContext.close();

  assert.ok(requests.every((url) => /\/coin-pusher\/(play|payout)$/.test(url)), 'coin pusher may only call its play/payout endpoints');
  assert.deepEqual(errors, [], `browser errors during coin-pusher flow: ${errors.join('; ')}`);
  console.log(JSON.stringify({ pass: true, profileMode, pusherLoad: pusherLoadMetrics, pusherLoadingPreview, prewarmRequestsBeforeClick: modulesReadyBeforeClick, touchPreload: touchPreloadSummary, pusherLoadingLongTasks, pusherFirstFrameLongTasks, shaderWarmup, pusherCpuHotspots, pusherWebglCalls, pusherSlowProgramParameters, pusherShaderPrograms, pusherWebglCapabilities, framePacingByViewport, requests: requests.length, payouts: payoutAmounts, payoutGapsMs: payoutTimes.slice(1).map((time, index) => time - payoutTimes[index]), touchDrops: touchRequests.filter((url) => url.endsWith('/coin-pusher/play')).length, errors, viewports: viewports.map(({ name }) => name), bedroomCanvas }));
} catch (error) {
  console.error(JSON.stringify({ pass: false, message: error.message, errors, requests, serverLogs: serverLogs.slice(-4000) }));
  process.exitCode = 1;
} finally {
  await browser?.close();
  stopServer();
}
