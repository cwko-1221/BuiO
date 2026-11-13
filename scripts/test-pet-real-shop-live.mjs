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
  assert.equal((await student.request.post('/api/pet/real-shop/teacher/redeem', { data: { code: 'RW-0000-0000-0000-0000' } })).status(), 403);
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
  assert.equal((await (await student.request.get('/api/pet/bootstrap')).json()).wallet.balance, walletBefore - 120);
  assert.match(await view.locator('.real-voucher').innerText(), /黃老師/);
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
  assert.equal((await (await student.request.get('/api/pet/bootstrap')).json()).wallet.balance, walletBefore - 240);
  await view.setViewportSize({ width: 390, height: 844 });
  await view.screenshot({ path: path.join(artifacts, 'student-voucher-phone.png') });
  assert.ok(await view.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await view.locator('[data-section="products"]').click(); await view.locator('.real-product-card').waitFor();
  assert.equal(await view.locator('[data-product]').isDisabled(), true);
  await view.screenshot({ path: path.join(artifacts, 'student-shop-phone.png') });

  const other = await browser.newContext({ baseURL });
  await other.request.post('/api/auth/login', { data: { studentId: 'S002', password: 'student123' } });
  assert.equal((await (await other.request.get('/api/pet/real-shop/vouchers')).json()).vouchers.length, 0);
  assert.equal((await other.request.get(`/api/pet/real-shop/teacher/vouchers?code=${voucher.code}`)).status(), 403);
  await page.locator('[data-section="vouchers"]').click();
  await page.locator('.real-lookup [name="code"]').fill(voucher.code);
  await page.locator('.real-lookup .primary').click(); await page.locator('[data-redeem]').waitFor();
  assert.match(await page.locator('.real-voucher').innerText(), /陳小星/);
  await page.locator('[data-redeem]').click(); await page.locator('dialog [data-confirm]').click();
  await page.getByText('核銷成功，已記錄領取時間。', { exact: true }).waitFor();
  const again = await (await teacher.request.post('/api/pet/real-shop/teacher/redeem', { data: { code: voucher.code } })).json(); assert.equal(again.alreadyRedeemed, true);
  await page.screenshot({ path: path.join(artifacts, 'teacher-redeemed.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: path.join(artifacts, 'teacher-redeemed-phone.png'), fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await view.locator('[data-section="vouchers"]').click(); await view.locator('.real-voucher.redeemed').waitFor();
  const final = JSON.parse(await fs.readFile(databaseFile, 'utf8'));
  assert.equal(final.petRealVouchers.length, 2); assert.equal(final.petCurrencyLedger.filter(row => row.kind === 'real_shop_purchase').length, 2);
  assert.equal(final.petRealVouchers.filter(row => row.redeemedAt).length, 1);
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(artifacts, 'verification.json'), JSON.stringify({ passed: true, teacher: '黃老師', purchases: 2, redeemed: 1, duplicateCharges: 0, responseLossRecovered: true, screenshots: 7 }, null, 2));
  console.log('Real shop live passed: teacher upload/list, named teacher, student purchase/voucher, lost-response recovery, permissions, one-time redemption, tablet and phone.');
} catch (error) { console.error(logs.slice(-3000)); throw error; }
finally {
  await browser?.close(); server.kill();
  if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('buio-real-shop-live-')) await fs.rm(directory, { recursive: true, force: true });
}
