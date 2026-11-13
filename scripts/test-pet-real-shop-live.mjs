import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { chromium } from 'playwright';

const port = await new Promise(resolve => { const socket = net.createServer(); socket.listen(0, '127.0.0.1', () => { const port = socket.address().port; socket.close(() => resolve(port)); }); });
const baseURL = `http://127.0.0.1:${port}`;
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'buio-real-shop-live-'));
const databaseFile = path.join(directory, 'db.json'), artifacts = path.resolve('artifacts/pet-real-shop');
await fs.mkdir(artifacts, { recursive: true });
await fs.writeFile(databaseFile, JSON.stringify({ users: [
  { studentid: 'S001', name: '陳小星', role: 'student', classname: '5A', classno: 1, language: 'zh-HK', passwordhash: bcrypt.hashSync('student123', 4) },
  { studentid: 'S002', name: '李月兒', role: 'student', classname: '5A', classno: 2, language: 'zh-HK', passwordhash: bcrypt.hashSync('student123', 4) },
  { studentid: 'T001', name: '黃老師', role: 'teacher', language: 'zh-HK', passwordhash: bcrypt.hashSync('teacher123', 4) },
] }));
const server = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env: { ...process.env, PORT: String(port), BUIO_JSON_DB_FILE: databaseFile, MOCK_AUTH: '0', NODE_ENV: 'development', SUPABASE_DB_URL: '' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '', browser;
server.stdout.on('data', chunk => logs += chunk); server.stderr.on('data', chunk => logs += chunk);
const errors = [];
const scrollChecks = [];
async function verifyTeacherFormScroll(page) {
  const root = page.locator('#teacherRealShopMain');
  const save = page.locator('.real-product-form [type="submit"]');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    const layout = await root.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { bottom: rect.bottom, height: rect.height, client: element.clientHeight, content: element.scrollHeight, overflow: getComputedStyle(element).overflowY };
    });
    assert.ok(layout.height > 0 && layout.bottom <= viewport.height + 1, `teacher shop must fit the viewport at ${viewport.width}x${viewport.height}`);
    assert.equal(layout.overflow, 'auto');
    assert.ok(layout.content > layout.client, 'the form must overflow to exercise real scrolling');
    await root.evaluate(element => element.scrollTop = 0);
    const box = await root.boundingBox();
    await page.mouse.move(box.x + Math.min(40, box.width / 2), box.y + Math.min(80, box.height / 2));
    await page.mouse.wheel(0, 10000);
    await page.waitForFunction(() => { const root = document.querySelector('#teacherRealShopMain'); return root.scrollTop > 0 && root.scrollTop + root.clientHeight >= root.scrollHeight - 2; });
    // Other content follows the form. Use a real reverse wheel gesture if scrolling to the
    // end takes Save above a short landscape viewport; do not let Playwright reveal it for us.
    const saveBox = await save.boundingBox();
    await page.mouse.wheel(0, saveBox.y + saveBox.height / 2 - (box.y + box.height / 2));
    await page.waitForFunction(() => {
      const button = document.querySelector('.real-product-form [type="submit"]'), rect = button.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return rect.top >= 0 && rect.bottom <= innerHeight && (hit === button || button.contains(hit));
    }, null, { timeout: 3000 }).catch(async error => {
      console.error('Scroll failure', viewport, await root.evaluate(element => ({ top: element.getBoundingClientRect().top, scroll: element.scrollTop, client: element.clientHeight, content: element.scrollHeight })), await save.boundingBox());
      await page.screenshot({ path: path.join(artifacts, `teacher-scroll-failure-${viewport.width}x${viewport.height}.png`) });
      throw error;
    });
    const buttonState = await save.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      const root = document.querySelector('#teacherRealShopMain').getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, rootTop: root.top, hit: hit === element || element.contains(hit) };
    });
    assert.ok(buttonState.top >= 0 && buttonState.bottom <= viewport.height && buttonState.hit, `Save must be visible and receive clicks after wheel scrolling at ${viewport.width}x${viewport.height}: ${JSON.stringify(buttonState)}`);
    scrollChecks.push(`${viewport.width}x${viewport.height}`);
    await page.screenshot({ path: path.join(artifacts, `teacher-form-bottom-${viewport.width}x${viewport.height}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}
try {
  for (let n = 0; n < 100; n++) { try { if ((await fetch(`${baseURL}/health`)).ok) break; } catch {} if (n === 99) throw Error(logs); await new Promise(resolve => setTimeout(resolve, 150)); }
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const teacher = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
  assert.equal((await teacher.request.post('/api/auth/login', { data: { studentId: 'T001', password: 'teacher123' } })).status(), 200);
  const page = await teacher.newPage(); page.on('pageerror', e => errors.push(e.message));
  await page.goto('/pet'); await page.locator('[data-teacher-tool="realShop"]').click();
  await page.locator('[data-new]').click();
  await page.locator('.real-product-form [name="name"]').fill('彩色鉛筆禮盒');
  await page.locator('.real-product-form [name="description"]').fill('下課後帶換領券找黃老師領取，每張券換一盒。');
  await page.locator('.real-product-form [name="price"]').fill('120');
  await page.locator('.real-product-form [name="stock"]').fill('2');
  const image = await sharp({ create: { width: 500, height: 400, channels: 4, background: '#f8dca7' } }).composite([{ input: Buffer.from('<svg width="500" height="400"><rect x="90" y="70" width="320" height="260" rx="22" fill="#668e58"/><path d="M160 280V120M205 280V120M250 280V120M295 280V120M340 280V120" stroke="#ffdc87" stroke-width="22"/></svg>') }]).png().toBuffer();
  await page.locator('[name="image"]').setInputFiles({ name: 'reward.png', mimeType: 'image/png', buffer: image });
  await page.getByText('圖片已上傳。', { exact: true }).waitFor();
  await verifyTeacherFormScroll(page);
  await page.locator('.real-product-form [type="submit"]').click();
  await page.getByText('商品已儲存。', { exact: true }).waitFor();
  assert.match(await page.locator('.real-product-card').innerText(), /黃老師/);
  await page.screenshot({ path: path.join(artifacts, 'teacher-products.png'), fullPage: true });
  const products = (await (await teacher.request.get('/api/pet/real-shop/teacher/products')).json()).products;
  assert.equal(products[0].listedByName, '黃老師'); const productId = products[0].id;

  const student = await browser.newContext({ baseURL, viewport: { width: 1024, height: 768 } });
  assert.equal((await student.request.post('/api/auth/login', { data: { studentId: 'S001', password: 'student123' } })).status(), 200);
  assert.equal((await student.request.post('/api/pet/dev/unlimited-money')).status(), 200);
  const hatch = await student.request.post('/api/pet/starter-egg/hatch', { headers: { 'Idempotency-Key': 'hatch-real-shop' }, data: {} }); assert.equal(hatch.status(), 201);
  assert.equal((await student.request.put(`/api/pet/real-shop/teacher/products/${productId}`, { data: products[0] })).status(), 403);
  assert.equal((await student.request.delete(`/api/pet/real-shop/teacher/products/${productId}`, { data: { revision: 1 } })).status(), 403);
  const view = await student.newPage(); view.on('pageerror', e => errors.push(e.message));
  await view.goto('/pet'); await view.locator('[data-tab="realShop"]').click();
  await view.locator('.real-product-card').waitFor();
  assert.match(await view.locator('.real-product-card').innerText(), /領取老師: 黃老師/);
  assert.equal(await view.locator('.real-product-image').evaluate(image => image.complete && image.naturalWidth > 0), true);
  await view.screenshot({ path: path.join(artifacts, 'student-shop-ipad.png') });
  const walletBefore = (await (await student.request.get('/api/pet/bootstrap')).json()).wallet.balance;
  await view.locator('[data-product]').click(); await view.locator('dialog [data-confirm]').click();
  await view.getByText('購買成功！請向老師出示換領券。', { exact: true }).waitFor();
  const voucher = (await (await student.request.get('/api/pet/real-shop/vouchers')).json()).vouchers[0];
  assert.equal(voucher.listedByName, '黃老師');
  assert.equal((await student.request.post(`/api/pet/real-shop/teacher/vouchers/${voucher.id}/redeem`, { data: {} })).status(), 403);
  assert.equal((await (await student.request.get('/api/pet/bootstrap')).json()).wallet.balance, walletBefore - 120);
  assert.match(await view.locator('.real-voucher').innerText(), /黃老師/);
  assert.equal(await view.locator('.real-voucher code').count(), 0, 'students should not see a redemption code');
  assert.ok(!(await view.locator('.real-voucher').innerText()).includes(voucher.code));
  await view.screenshot({ path: path.join(artifacts, 'student-voucher-ipad.png') });

  // Simulate a committed purchase whose response is lost. Reload must recover the same voucher.
  await view.locator('[data-section="products"]').click(); await view.locator('[data-product]').click();
  let committed = false;
  await view.route('**/api/pet/real-shop/purchase', async route => { const response = await route.fetch(); assert.equal(response.status(), 200); committed = true; await route.abort('failed'); });
  await view.locator('dialog [data-confirm]').click();
  await view.waitForFunction(() => document.querySelector('dialog [role="status"]')?.textContent.length > 0);
  assert.equal(committed, true);
  await view.unroute('**/api/pet/real-shop/purchase');
  await view.reload(); await view.locator('[data-tab="realShop"]').click();
  await view.locator('[data-recover]').click(); await view.locator('dialog [data-confirm]').click();
  await view.getByText('購買成功！請向老師出示換領券。', { exact: true }).waitFor();
  assert.equal((await (await student.request.get('/api/pet/real-shop/vouchers')).json()).vouchers.length, 2);
  assert.equal(await view.locator('.real-voucher code').count(), 0);
  assert.equal((await (await student.request.get('/api/pet/bootstrap')).json()).wallet.balance, walletBefore - 240);
  await view.setViewportSize({ width: 390, height: 844 });
  await view.screenshot({ path: path.join(artifacts, 'student-voucher-phone.png') });
  assert.ok(await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await view.locator('[data-section="products"]').click(); await view.locator('.real-product-card').waitFor();
  assert.equal(await view.locator('[data-product]').isDisabled(), true);
  await view.screenshot({ path: path.join(artifacts, 'student-shop-phone.png') });

  // Delete through the teacher UI after purchases. The student's vouchers must survive.
  await page.locator('[data-refresh]').click(); await page.locator('[data-delete-product]').waitFor();
  const deleteButton = page.locator('[data-delete-product]');
  const editBox = await page.locator('[data-product]').boundingBox(), deleteBox = await deleteButton.boundingBox();
  assert.ok(deleteBox.y >= editBox.y + editBox.height, 'Delete must appear below Edit');
  await deleteButton.click(); await page.locator('dialog [data-cancel]').click();
  assert.equal(await page.locator('.real-product-card').count(), 1, 'cancelling keeps the product');
  await deleteButton.click(); await page.locator('dialog [data-confirm]').click();
  await page.getByText('商品已刪除，已購換領券仍然有效。', { exact: true }).waitFor();
  assert.equal(await page.locator('.real-product-card').count(), 0);
  await view.locator('[data-refresh]').click(); await view.getByText('暫時沒有上架商品。', { exact: true }).waitFor();
  await view.locator('[data-section="vouchers"]').click(); await view.locator('.real-voucher').first().waitFor();
  assert.equal(await view.locator('.real-voucher').count(), 2);

  const other = await browser.newContext({ baseURL });
  await other.request.post('/api/auth/login', { data: { studentId: 'S002', password: 'student123' } });
  assert.equal((await (await other.request.get('/api/pet/real-shop/vouchers')).json()).vouchers.length, 0);
  assert.equal((await other.request.get(`/api/pet/real-shop/teacher/vouchers?code=${voucher.code}`)).status(), 403);
  await page.locator('[data-section="vouchers"]').click();
  await page.locator('.real-lookup [name="search"]').fill('陳小星');
  await page.locator('.real-lookup .primary').click(); await page.locator(`[data-redeem="${voucher.id}"]`).waitFor();
  assert.equal(await page.locator('.real-voucher code').count(), 0, 'teachers do not need redemption codes');
  assert.equal(await page.locator('.real-lookup [name="code"]').count(), 0);
  assert.match(await page.locator('.real-voucher').first().innerText(), /陳小星/);
  await page.locator(`[data-redeem="${voucher.id}"]`).click();
  assert.equal(await page.locator('dialog code').count(), 0);
  await page.locator('dialog [data-confirm]').click();
  await page.getByText('核銷成功，已記錄領取時間。', { exact: true }).waitFor();
  const again = await (await teacher.request.post(`/api/pet/real-shop/teacher/vouchers/${voucher.id}/redeem`, { data: {} })).json(); assert.equal(again.alreadyRedeemed, true);
  await page.screenshot({ path: path.join(artifacts, 'teacher-redeemed.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(artifacts, 'teacher-redeemed-phone.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await view.locator('[data-section="vouchers"]').click(); await view.locator('.real-voucher.redeemed').waitFor();
  assert.equal(await view.locator('.real-voucher code').count(), 0, 'redeemed student vouchers also hide the code');
  const final = JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  assert.equal(final.petRealVouchers.length, 2); assert.equal(final.petCurrencyLedger.filter(row => row.kind === 'real_shop_purchase').length, 2);
  assert.equal(final.petRealVouchers.filter(row => row.redeemedAt).length, 1);
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ passed: true, teacher: '黃老師', purchases: 2, redeemed: 1, duplicateCharges: 0, responseLossRecovered: true, codesHidden: true, directTeacherRedemption: true, deletedProductVouchersKept: true, teacherFormWheelScroll: scrollChecks, screenshots: 11 }, null, 2));
  console.log('Real shop live passed: codes hidden, teacher form scrolls across four viewports, confirmed product deletion preserves vouchers, student search and direct redemption work.');
} catch (error) { console.error(logs.slice(-3000)); throw error; }
finally {
  await browser?.close(); server.kill();
  if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('buio-real-shop-live-')) await fs.rm(directory, { recursive: true, force: true });
}
