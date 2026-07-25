import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);
const demoSet = require('../game-app/lib/demoSet');
const base = process.env.GAME_BASE_URL || 'http://127.0.0.1:3000';
const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean).find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const host = await context.newPage();
const player = await context.newPage();

async function connect(page, globalName) {
  return page.evaluate(name => new Promise((resolve, reject) => {
    const socket = window[name] = window.io('/game');
    socket.on('connect', () => resolve(socket.id));
    socket.on('connect_error', error => reject(new Error(error.message)));
  }), globalName);
}

async function emit(page, globalName, eventName, payload) {
  return page.evaluate(({ globalName, eventName, payload }) => new Promise(resolve => {
    if (payload === undefined) window[globalName].emit(eventName, resolve);
    else window[globalName].emit(eventName, payload, resolve);
  }), { globalName, eventName, payload });
}

function correctChoice(questionPayload) {
  const source = demoSet.questions.find(item => item.question === questionPayload.question);
  if (!source) throw new Error(`Unknown demo question: ${questionPayload.question}`);
  const correctText = source.choices[source.correctIndex];
  const index = questionPayload.choices.indexOf(correctText);
  if (index < 0) throw new Error(`Correct choice missing for: ${questionPayload.question}`);
  return index;
}

let activeCode = null;
try {
  await Promise.all([
    host.goto(`${base}/game/preview?settingsQa=host`),
    player.goto(`${base}/game/preview?settingsQa=player`),
  ]);
  console.log('[settings-live] pages ready');
  await connect(host, '__settingsHost');
  await connect(player, '__settingsPlayer');
  console.log('[settings-live] sockets connected');

  const created = await emit(host, '__settingsHost', 'host:create', {
    setId: 'demo',
    durationSec: 300,
    hostName: 'SettingsQA',
    settings: { maxEnergy: 150, energyPerCorrect: 30, infiniteEnergy: false },
  });
  if (!created?.ok) throw new Error(`Finite room create failed: ${created?.message}`);
  console.log('[settings-live] finite room created');
  activeCode = created.code;
  if (JSON.stringify(created.settings) !== JSON.stringify({ maxEnergy: 150, energyPerCorrect: 30, infiniteEnergy: false })) {
    throw new Error(`Finite settings changed during create: ${JSON.stringify(created.settings)}`);
  }

  const joined = await emit(player, '__settingsPlayer', 'player:join', {
    code: activeCode,
    name: 'AvatarQA',
    studentId: 'settings-qa',
    avatar: { character: 'coral', accessory: 'crown' },
  });
  if (!joined?.ok || joined.settings.maxEnergy !== 150) throw new Error(`Finite join failed: ${JSON.stringify(joined)}`);
  console.log('[settings-live] finite player joined');
  if (joined.avatar?.character !== 'coral' || joined.avatar?.accessory !== 'crown') {
    throw new Error(`Avatar changed during join: ${JSON.stringify(joined.avatar)}`);
  }

  await player.evaluate(() => {
    window.__settingsStart = null;
    window.__settingsPlayer.once('game:start', payload => { window.__settingsStart = payload; });
  });
  const started = await emit(host, '__settingsHost', 'host:start');
  if (!started?.ok) throw new Error('Finite room start failed');
  console.log('[settings-live] finite room started');
  await player.waitForFunction(() => window.__settingsStart);
  const startPayload = await player.evaluate(() => window.__settingsStart);
  if (startPayload.settings?.energyPerCorrect !== 30) {
    throw new Error(`Settings missing from game:start: ${JSON.stringify(startPayload)}`);
  }

  const question = await emit(player, '__settingsPlayer', 'player:question');
  const answer = await emit(player, '__settingsPlayer', 'player:answer', { choice: correctChoice(question) });
  if (!answer.correct || answer.gain !== 30 || answer.energy !== 70 || answer.maxEnergy !== 150) {
    throw new Error(`Finite answer mismatch: ${JSON.stringify(answer)}`);
  }
  console.log('[settings-live] finite answer verified');

  await player.evaluate(() => window.__settingsPlayer.emit('player:state', {
    x: 100,
    y: 8000,
    energy: 999,
    progress: 0,
    altitude: 0,
    animation: 'idle',
    facing: 1,
  }));
  await player.waitForTimeout(80);
  await player.evaluate(() => window.__settingsPlayer.disconnect());
  await connect(player, '__settingsReconnect');
  const rejoined = await emit(player, '__settingsReconnect', 'player:join', {
    code: activeCode,
    name: 'AvatarQA',
    studentId: 'settings-qa',
    avatar: { character: 'coral', accessory: 'crown' },
  });
  if (rejoined.resume?.energy !== 150) {
    throw new Error(`Finite max energy was not enforced: ${JSON.stringify(rejoined.resume)}`);
  }
  console.log('[settings-live] finite reconnect verified');
  await host.evaluate(() => window.__settingsHost.emit('host:close'));
  activeCode = null;

  const infinite = await emit(host, '__settingsHost', 'host:create', {
    setId: 'demo',
    durationSec: 300,
    hostName: 'SettingsQA',
    settings: { maxEnergy: 180, energyPerCorrect: 40, infiniteEnergy: true },
  });
  if (!infinite?.ok) throw new Error(`Infinite room create failed: ${infinite?.message}`);
  console.log('[settings-live] infinite room created');
  activeCode = infinite.code;
  const infiniteJoin = await emit(player, '__settingsReconnect', 'player:join', {
    code: activeCode,
    name: 'InfiniteQA',
    studentId: 'infinite-qa',
    avatar: { character: 'violet', accessory: 'star' },
  });
  if (infiniteJoin.settings?.infiniteEnergy !== true) {
    throw new Error(`Infinite settings missing from join: ${JSON.stringify(infiniteJoin)}`);
  }
  console.log('[settings-live] infinite player joined');
  await player.evaluate(() => {
    window.__settingsInfiniteStart = null;
    window.__settingsReconnect.once('game:start', payload => { window.__settingsInfiniteStart = payload; });
  });
  await emit(host, '__settingsHost', 'host:start');
  await player.waitForFunction(() => window.__settingsInfiniteStart);
  console.log('[settings-live] infinite room started');
  const infiniteQuestion = await emit(player, '__settingsReconnect', 'player:question');
  const infiniteAnswer = await emit(player, '__settingsReconnect', 'player:answer', {
    choice: correctChoice(infiniteQuestion),
  });
  if (!infiniteAnswer.correct || infiniteAnswer.gain !== 0 || infiniteAnswer.energy !== 180 || !infiniteAnswer.infiniteEnergy) {
    throw new Error(`Infinite answer mismatch: ${JSON.stringify(infiniteAnswer)}`);
  }

  console.log(JSON.stringify({
    finite: { settings: created.settings, gain: answer.gain, cappedReconnectEnergy: rejoined.resume.energy },
    avatar: joined.avatar,
    infinite: { settings: infinite.settings, gain: infiniteAnswer.gain, energy: infiniteAnswer.energy },
  }, null, 2));
} finally {
  if (activeCode) await host.evaluate(() => window.__settingsHost?.emit('host:close')).catch(() => {});
  await browser.close();
}
