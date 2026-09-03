import { chromium } from 'playwright';
import ExcelJS from 'exceljs';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const demoSet = require('../game-app/lib/demoSet');
const base = process.env.GAME_BASE_URL || 'http://127.0.0.1:3000';
const executablePath = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean).find(existsSync);
const hostHtml = readFileSync(new URL('../game-app/public/host.html', import.meta.url), 'utf8');
const playHtml = readFileSync(new URL('../game-app/public/play.html', import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const hostContext = await browser.newContext({ viewport: { width: 1440, height: 980 }, acceptDownloads: true });
const host = await hostContext.newPage();
let activeCode = null;

function json(route, body) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

try {
  await hostContext.route(`${base}/game/host`, route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: hostHtml,
  }));
  await hostContext.route('**/api/auth/me', route => json(route, {
    success: true,
    student: { id: 'teacher-ui-qa', name: '介面測試', role: 'teacher' },
  }));
  await hostContext.route('**/api/game/teacher/sets**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/demo')) return json(route, { success: true, set: demoSet });
    return json(route, {
      success: true,
      dbAvailable: true,
      sets: [{ id: 'demo', title: demoSet.title, questionCount: demoSet.questions.length, builtin: true }],
    });
  });

  await host.goto(`${base}/game/host`);
  await host.waitForSelector('.set-row');
  await host.locator('[data-expand="demo"]').click();
  await host.waitForSelector('.set-preview-question');
  const expandedCount = await host.locator('.set-preview-question').count();
  if (expandedCount !== demoSet.questions.length) {
    throw new Error(`Question expansion rendered ${expandedCount}/${demoSet.questions.length} questions`);
  }
  const expandedScreenshot = join(tmpdir(), 'buio-question-bank-expanded.png');
  await host.screenshot({ path: expandedScreenshot, fullPage: true });

  await host.locator('#newSetBtn').click();
  await host.waitForSelector('#editorScreen.active');
  const downloadPromise = host.waitForEvent('download');
  await host.locator('#excelTemplateBtn').click();
  const download = await downloadPromise;
  const templatePath = join(tmpdir(), 'BuiO-question-bank-template.xlsx');
  await download.saveAs(templatePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const header = workbook.worksheets[0].getRow(1).values.slice(1);
  const expectedHeader = ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'correctAnswer'];
  if (JSON.stringify(header) !== JSON.stringify(expectedHeader)) {
    throw new Error(`Excel template header mismatch: ${JSON.stringify(header)}`);
  }
  await host.locator('#excelImportInput').setInputFiles(templatePath);
  await host.waitForFunction(() => document.querySelector('#excelImportStatus')?.textContent?.includes('已匯入'));
  if (await host.locator('.editor-q').count() !== 1) throw new Error('Excel template did not import its sample question');
  if (await host.locator('.q-question').inputValue() !== '7 × 8 等於多少？') {
    throw new Error('Imported question text does not match the template');
  }

  await host.locator('#editorBackBtn').click();
  await host.waitForSelector('#setupScreen.active');
  await host.locator('.set-row').click();
  await host.locator('#maxEnergyInput').fill('180');
  await host.locator('#energyPerCorrectInput').fill('40');
  await host.locator('.toggle-row').click();
  if (!await host.locator('#energyPerCorrectInput').isDisabled()) {
    throw new Error('Infinite energy did not disable per-question energy control');
  }
  await host.waitForTimeout(250);
  const toggleVisual = await host.evaluate(() => {
    const input = document.querySelector('#infiniteEnergyToggle');
    const track = document.querySelector('.toggle-track');
    return {
      checked: input.checked,
      background: getComputedStyle(track).backgroundColor,
      knobTransform: getComputedStyle(track, '::after').transform,
    };
  });
  if (toggleVisual.background !== 'rgb(34, 192, 142)' || toggleVisual.knobTransform === 'none') {
    throw new Error(`Infinite energy toggle did not show its checked state: ${JSON.stringify(toggleVisual)}`);
  }
  const setupScreenshot = join(tmpdir(), 'buio-host-game-settings.png');
  await host.screenshot({ path: setupScreenshot, fullPage: true });
  await host.locator('#createRoomBtn').click();
  await host.waitForSelector('#lobbyScreen.active');
  if (!await host.locator('#lobbyInfo').textContent().then(text => text.includes('無限能量'))) {
    throw new Error('Lobby summary did not include infinite energy');
  }
  await host.locator('#cancelRoomBtn').click();
  await host.waitForSelector('#setupScreen.active');

  activeCode = await host.evaluate(() => new Promise((resolve, reject) => {
    const socket = window.__hostUiQaSocket = window.io('/game');
    socket.on('connect', () => socket.emit('host:create', {
      setId: 'demo',
      durationSec: 300,
      hostName: '造型測試',
      settings: { maxEnergy: 180, energyPerCorrect: 40, infiniteEnergy: true },
    }, response => response?.ok ? resolve(response.code) : reject(new Error(response?.message || 'create failed'))));
  }));

  const studentContext = await browser.newContext({ viewport: { width: 820, height: 920 } });
  await studentContext.route(`${base}/game`, route => route.fulfill({
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: playHtml,
  }));
  await studentContext.route('**/api/auth/me', route => json(route, {
    success: true,
    student: { id: 'student-ui-qa', name: '學生測試', role: 'student' },
  }));
  const student = await studentContext.newPage();
  await student.goto(`${base}/game`);
  await student.waitForSelector('.room-row');
  await student.locator('.room-row').filter({ hasText: '造型測試老師' }).click();
  await student.waitForSelector('#lobbyScreen.active');
  await student.locator('[data-character="violet"]').click();
  await student.locator('[data-accessory="crown"]').click();
  await student.waitForFunction(() => (
    document.querySelector('#avatarPreviewImage')?.classList.contains('character-violet')
    && document.querySelector('#avatarPreviewAccessory')?.textContent === '👑'
  ));
  const avatarScreenshot = join(tmpdir(), 'buio-student-avatar-picker.png');
  await student.screenshot({ path: avatarScreenshot, fullPage: true });

  const started = await host.evaluate(() => new Promise(resolve => window.__hostUiQaSocket.emit('host:start', resolve)));
  if (!started?.ok) throw new Error('Avatar room could not start');
  await student.waitForSelector('#gameScreen.active canvas', { timeout: 10000 });
  await student.waitForFunction(() => window.__game?.scene?.getScene('GameScene')?.player);
  const gameState = await student.evaluate(() => {
    const scene = window.__game.scene.getScene('GameScene');
    return {
      maxEnergy: scene.maxEnergy,
      energy: scene.energy,
      infiniteEnergy: scene.hooks.infiniteEnergy,
      avatar: scene.avatar,
      accessory: scene.playerAccessory.text,
    };
  });
  if (
    gameState.maxEnergy !== 180
    || gameState.energy !== 180
    || !gameState.infiniteEnergy
    || gameState.avatar.character !== 'violet'
    || gameState.accessory !== '👑'
  ) {
    throw new Error(`Student game settings/avatar mismatch: ${JSON.stringify(gameState)}`);
  }

  console.log(JSON.stringify({
    expandedQuestions: expandedCount,
    excelHeader: header,
    importedQuestions: 1,
    toggleVisual,
    gameState,
    screenshots: { setupScreenshot, expandedScreenshot, avatarScreenshot },
  }, null, 2));
  await studentContext.close();
} finally {
  if (activeCode) await host.evaluate(() => window.__hostUiQaSocket?.emit('host:close')).catch(() => {});
  await hostContext.close();
  await browser.close();
}
