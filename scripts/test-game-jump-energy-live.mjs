import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const base = process.env.GAME_BASE_URL || 'http://127.0.0.1:3000';
const output = resolve('artifacts/game-jump-energy-20261007');
mkdirSync(output, { recursive: true });
const executablePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find(existsSync);
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
const context = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const energy = () => page.evaluate(() => window.__game.scene.getScene('GameScene').energy);
const grounded = () => page.waitForFunction(() => window.__game?.scene.getScene('GameScene')?.grounded);
const pressJump = async () => { await page.keyboard.down('Space'); await page.keyboard.up('Space'); };

try {
  await page.goto(`${base}/game/preview?preview&altitude=0`);
  await page.bringToFront();
  await grounded();
  assert.equal(await energy(), 40);
  await pressJump();
  await page.waitForFunction(() => window.__game.scene.getScene('GameScene').energy === 35);
  await page.waitForFunction(() => !window.__game.scene.getScene('GameScene').grounded);
  await pressJump();
  await page.waitForFunction(() => window.__game.scene.getScene('GameScene').energy === 30);
  await pressJump();
  await page.waitForTimeout(180);
  assert.equal(await energy(), 30, 'an unavailable third jump does not spend energy');
  await page.screenshot({ path: resolve(output, 'ipad-double-jump.png') });

  await grounded();
  await page.evaluate(() => window.__game.scene.getScene('GameScene').setEnergy(5));
  await page.locator('#btnJump').tap();
  await page.waitForFunction(() => window.__game.scene.getScene('GameScene').energy === 0);
  await page.waitForFunction(() => !window.__game.scene.getScene('GameScene').grounded);
  await grounded();
  await page.evaluate(() => window.__game.scene.getScene('GameScene').setEnergy(4));
  await page.locator('#btnJump').tap();
  await page.waitForTimeout(180);
  assert.equal(await energy(), 4, 'less than five energy cannot jump or incur a charge');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('GameScene').grounded), true);

  await page.goto(`${base}/game/preview?preview&infiniteEnergy=1&altitude=0`);
  await grounded();
  const maxEnergy = await energy();
  await pressJump();
  await page.waitForFunction(() => !window.__game.scene.getScene('GameScene').grounded);
  await pressJump();
  await page.waitForFunction(() => window.__game.scene.getScene('GameScene').airJump === 0);
  assert.equal(await energy(), maxEnergy, 'unlimited energy remains unchanged after both jumps');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ finite: '40 -> 35 -> 30', touch: '5 -> 0, 4 remains 4', infinite: maxEnergy, output }, null, 2));
} finally {
  await browser.close();
}
