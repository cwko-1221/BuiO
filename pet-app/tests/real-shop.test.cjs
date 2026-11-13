'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buio-real-shop-'));
process.env.BUIO_JSON_DB_FILE = path.join(directory, 'db.json'); process.env.SUPABASE_DB_URL = '';
fs.writeFileSync(process.env.BUIO_JSON_DB_FILE, JSON.stringify({ users: [{ studentid: 'S001', role: 'student' }, { studentid: 'S002', role: 'student' }] }));
const repo = require('../repositories/real-shop.repo');
const pets = require('../repositories/pet.repo');
const store = require('../../db/jsonStore');
after(() => { if (path.dirname(directory) === path.resolve(os.tmpdir()) && path.basename(directory).startsWith('buio-real-shop-')) fs.rmSync(directory, { recursive: true, force: true }); });
const fields = { name: '彩色鉛筆', description: '找黃老師領取', price: 120, stock: 1, active: true, imageId: null, revision: 0 };

test('real rewards atomically spend the shared wallet, issue one voucher and preserve the listing teacher', async () => {
  await pets.grantUnlimitedMoney('S001', 500); await pets.grantUnlimitedMoney('S002', 500);
  const id = randomUUID();
  let product = await repo.saveProduct('T001', id, { ...fields, listedByName: '偽造老師' }, '黃老師');
  assert.equal(product.listedByName, '黃老師');
  const results = await Promise.allSettled([repo.purchase('S001', id, 120, 'one'), repo.purchase('S002', id, 120, 'two')]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const purchase = results.find(r => r.status === 'fulfilled').value;
  assert.equal(purchase.balance, 380); assert.equal(purchase.voucher.listedByName, '黃老師');
  assert.equal(store.load().petCurrencyLedger.filter(r => r.kind === 'real_shop_purchase').length, 1);
  const repeated = await repo.purchase(purchase.voucher.studentId, id, 120, purchase.voucher.purchaseKey);
  assert.equal(repeated.voucher.id, purchase.voucher.id); assert.equal(repeated.balance, 380);
  const otherId = randomUUID(); await repo.saveProduct('T001', otherId, fields, '黃老師');
  await assert.rejects(repo.purchase(purchase.voucher.studentId, otherId, 120, purchase.voucher.purchaseKey), /其他商品/);
  product = (await repo.listProducts(true)).find(p => p.id === id);
  await assert.rejects(repo.saveProduct('T002', id, { ...product, stock: 99, revision: 1 }, '李老師'), /已更新/);
  await repo.saveProduct('T002', id, { ...product, name: '改名商品', price: 300, active: false }, '李老師');
  const voucher = (await repo.vouchers({ studentId: purchase.voucher.studentId })).vouchers[0];
  assert.equal(voucher.name, fields.name); assert.equal(voucher.price, 120); assert.equal(voucher.listedByName, '黃老師');
  assert.equal((await repo.listProducts()).some(p => p.id === id), false);
  assert.equal((await repo.vouchers({ studentId: purchase.voucher.studentId === 'S001' ? 'S002' : 'S001' })).vouchers.length, 0);
  const redemptions = await Promise.all([repo.redeem('T001', voucher.code.toLowerCase()), repo.redeem('T002', voucher.code)]);
  assert.equal(redemptions.filter(r => !r.alreadyRedeemed).length, 1);
  assert.equal(redemptions[0].voucher.redeemedBy, redemptions[1].voucher.redeemedBy);
  assert.ok(redemptions[0].voucher.redeemedAt);
  assert.equal(store.load().petCurrencyLedger.length, 1, 'redemption must not charge coins again');
});

test('rejects price changes, insufficient coins and invalid fields without spending; rolls back interrupted saves', async () => {
  const id = randomUUID(), product = await repo.saveProduct('T001', id, { ...fields, stock: null, price: 9999 }, '黃老師');
  await assert.rejects(repo.purchase('S001', id, 9999, 'poor'), /金幣不足/);
  await assert.rejects(repo.purchase('S001', id, 120, 'price'), /價錢已更新/);
  for (const patch of [{ price: 0 }, { price: 1.5 }, { stock: -1 }, { name: '' }, { imageId: randomUUID() }]) await assert.rejects(repo.saveProduct('T001', id, { ...product, ...patch }));
  await repo.saveProduct('T001', id, { ...product, price: 10, stock: 3 }, '黃老師');
  const before = structuredClone(store.load()), save = store.save;
  store.save = () => { throw new Error('disk interrupted'); };
  try { await assert.rejects(repo.purchase('S001', id, 10, 'rollback'), /disk interrupted/); }
  finally { store.save = save; }
  assert.deepEqual(store.load(), before);
  const buys = await Promise.all([repo.purchase('S001', id, 10, 'same-key'), repo.purchase('S001', id, 10, 'same-key')]);
  assert.equal(buys[0].voucher.id, buys[1].voucher.id);
  assert.equal((await repo.listProducts(true)).find(p => p.id === id).stock, 2);
  const voucherBefore = structuredClone(store.load().petRealVouchers);
  store.save = () => { throw new Error('disk interrupted'); };
  try { await assert.rejects(repo.redeem('T001', buys[0].voucher.code), /disk interrupted/); }
  finally { store.save = save; }
  assert.deepEqual(store.load().petRealVouchers, voucherBefore);
  await assert.rejects(repo.redeem('T001', 'RW-0000-0000-0000-0000'), /找不到/);
  pets.purgeJsonStudent('S001'); assert.equal((await repo.vouchers({ studentId: 'S001' })).vouchers.length, 0);
});
