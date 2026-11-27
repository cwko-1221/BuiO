'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const configPath = require.resolve('../../config');
require.cache[configPath] = { id: configPath, filename: configPath, loaded: true, exports: { db: { mode: 'postgres' } } };
const db = new PGlite(); let active, interrupted = false, interruptedDelete = false;
const query = async (target, sql, params = []) => {
  if (interrupted && sql.startsWith('INSERT INTO PetCurrencyLedger')) throw new Error('transaction interrupted');
  if (interruptedDelete && sql.startsWith('DELETE FROM PetRealProducts')) throw new Error('delete interrupted');
  // PGlite has no competing processes; row locks still exercise the PostgreSQL SQL path.
  if (sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] };
  const result = params.length ? await target.query(sql, params) : await target.exec(sql);
  const value = Array.isArray(result) ? result[result.length - 1] : result;
  return { ...value, rows: value?.rows || [], rowCount: value?.affectedRows ?? value?.rows?.length ?? 0 };
};
const databasePath = require.resolve('../../math-app/db/database');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: {
  getPool: () => ({ query: (sql, params) => query(active || db, sql, params) }),
  withTransaction: fn => db.transaction(async tx => { active = tx; try { return await fn({ query: (sql, params) => query(tx, sql, params) }); } finally { active = null; } }),
} };
const repo = require('../repositories/real-shop.repo');
const pets = require('../repositories/pet.repo');
test('PostgreSQL commits wallet, stock, ledger and voucher together; retains snapshots and rolls back failure', async t => {
  t.after(() => db.close());
  await db.exec("CREATE TABLE Users(StudentID varchar(20) PRIMARY KEY,Name text); INSERT INTO Users VALUES('S001','陳小星'),('S002','李月兒')");
  await pets.grantUnlimitedMoney('S001', 500); await pets.grantUnlimitedMoney('S002', 500);
  const image = await repo.saveImage('T001', Buffer.from('persisted-image'));
  const security = await db.query("SELECT relrowsecurity FROM pg_class WHERE relname IN ('petrealimages','petrealproducts','petrealvouchers')");
  assert.equal(security.rows.length, 3); assert.ok(security.rows.every(row => row.relrowsecurity));
  assert.equal((await repo.readImage(image.imageId)).toString(), 'persisted-image');
  const id = randomUUID(), fields = { name: '獎品', description: '', price: 50, stock: 1, active: true, imageId: image.imageId, revision: 0 };
  await repo.saveProduct('T001', id, fields, '黃老師');
  interrupted = true; await assert.rejects(repo.purchase('S001', id, 50, 'first'), /transaction interrupted/); interrupted = false;
  assert.equal((await db.query('SELECT Balance FROM PetWallets WHERE StudentID=$1', ['S001'])).rows[0].balance, 500);
  assert.equal((await repo.vouchers()).vouchers.length, 0); assert.equal((await repo.listProducts())[0].stock, 1);
  const first = await repo.purchase('S001', id, 50, 'first');
  assert.equal(first.balance, 450); assert.equal(first.voucher.listedByName, '黃老師');
  const repeat = await repo.purchase('S001', id, 50, 'first'); assert.equal(repeat.voucher.id, first.voucher.id);
  await assert.rejects(repo.purchase('S002', id, 50, 'second'), /售罄/);
  await assert.rejects(repo.saveProduct('T002', id, fields, '李老師'), /已更新/);
  const product = (await repo.listProducts())[0];
  await repo.saveProduct('T002', id, { ...product, name: '新名稱', price: 90, active: false }, '李老師');
  const voucher = (await repo.vouchers({ code: first.voucher.code })).vouchers[0];
  assert.equal(voucher.name, '獎品'); assert.equal(voucher.price, 50); assert.equal(voucher.listedByName, '黃老師');
  assert.equal((await repo.vouchers({ studentId: 'S002' })).vouchers.length, 0);
  const latest = (await repo.listProducts(true))[0];
  await assert.rejects(repo.deleteProduct(id, latest.revision - 1), /已更新/);
  interruptedDelete = true; await assert.rejects(repo.deleteProduct(id, latest.revision), /delete interrupted/); interruptedDelete = false;
  assert.equal((await repo.listProducts(true)).length, 1);
  await repo.deleteProduct(id, latest.revision); await repo.deleteProduct(id, latest.revision);
  assert.equal((await repo.listProducts(true)).length, 0);
  for (const search of ['陳小星', 's001', '獎品']) assert.equal((await repo.vouchers({ search })).vouchers[0].id, voucher.id);
  assert.equal((await repo.vouchers({ search: '其他學生' })).vouchers.length, 0);
  await assert.rejects(repo.redeemVoucher('T002', voucher.id), { status: 404 });
  const redeemed = await repo.redeemVoucher('T001', voucher.id); assert.equal(redeemed.alreadyRedeemed, false);
  const again = await repo.redeemVoucher('T001', voucher.id); assert.equal(again.alreadyRedeemed, true); assert.equal(again.voucher.redeemedBy, 'T001');
  assert.equal((await repo.vouchers({ teacherId: 'T001', status: 'redeemed' })).vouchers.map(r => r.id).includes(voucher.id), true);
  assert.equal((await repo.vouchers({ teacherId: 'T001', status: 'unredeemed' })).vouchers.map(r => r.id).includes(voucher.id), false);
  assert.equal((await db.query('SELECT * FROM PetCurrencyLedger')).rows.length, 1);
  await require('./real-shop-teacher-scope.cjs')(repo, async rows => {
    await db.query(`INSERT INTO PetRealVouchers(VoucherID,StudentID,PurchaseKey,Code,Data,CreatedAt)
      SELECT (v->>'id')::uuid,v->>'studentId',v->>'purchaseKey',v->>'code',v,(v->>'purchasedAt')::timestamptz
      FROM jsonb_array_elements($1::jsonb) v`, [JSON.stringify(rows)]);
  });
  await db.exec(`
    ALTER TABLE Users ADD COLUMN Role text NOT NULL DEFAULT 'student', ADD COLUMN ClassName text NOT NULL DEFAULT '',
      ADD COLUMN ClassNo integer, ADD COLUMN ChineseGroup text NOT NULL DEFAULT '',
      ADD COLUMN EnglishGroup text NOT NULL DEFAULT '', ADD COLUMN MathGroup text NOT NULL DEFAULT '';
    UPDATE Users SET ClassName='5A', ClassNo=1 WHERE StudentID='S001';
    UPDATE Users SET ClassName='5B', ClassNo=2 WHERE StudentID='S002';
  `);
  const classProductId = randomUUID();
  await repo.saveProduct('T003', classProductId, { name: '分班獎品', description: '', price: 10, stock: 5, active: true, imageId: null, revision: 0 }, '陳老師');
  const v5a = (await repo.purchase('S001', classProductId, 10, 'pg-5a')).voucher;
  const v5b = (await repo.purchase('S002', classProductId, 10, 'pg-5b')).voucher;
  await repo.redeemVoucher('T003', v5a.id);
  assert.deepEqual((await repo.vouchers({ teacherId: 'T003', className: '5A' })).vouchers.map(r => r.id), [v5a.id]);
  assert.deepEqual((await repo.vouchers({ teacherId: 'T003', className: '5B' })).vouchers.map(r => r.id), [v5b.id]);
  assert.deepEqual((await repo.vouchers({ teacherId: 'T003', className: '5A', status: 'unredeemed' })).vouchers, []);
  assert.deepEqual((await repo.vouchers({ teacherId: 'T003', className: '5B', status: 'unredeemed' })).vouchers.map(r => r.id), [v5b.id]);
  assert.deepEqual((await repo.vouchers({ teacherId: 'T003', className: '5A', status: 'redeemed' })).vouchers.map(r => r.id), [v5a.id]);
  await assert.rejects(repo.vouchers({ teacherId: 'T003', status: 'invalid' }), { status: 400 });
  await db.exec("DELETE FROM Users WHERE StudentID='S001'");
  assert.equal((await repo.vouchers({ studentId: 'S001' })).vouchers.length, 0);
});
