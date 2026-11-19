'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

// Run the same privacy contract against JSON and PostgreSQL storage.
module.exports = async (repo, seed) => {
  const name = `老師專屬獎品-${randomUUID()}`;
  const fields = { name, description: '', price: 1, stock: null, active: true, imageId: null, revision: 0 };
  const firstId = randomUUID(), secondId = randomUUID();
  await repo.saveProduct('T001', firstId, fields, '黃老師');
  await repo.saveProduct('T002', secondId, fields, '李老師');
  const first = (await repo.purchase('S002', firstId, 1, `owner-${firstId}`)).voucher;
  const second = (await repo.purchase('S002', secondId, 1, `owner-${secondId}`)).voucher;
  const latest = (await repo.listProducts(true)).find(row => row.id === firstId);
  await repo.saveProduct('T002', firstId, { ...latest, listedBy: 'T002' }, '李老師');
  await repo.deleteProduct(firstId, latest.revision + 1);

  for (const [teacherId, own, foreign] of [['T001', first, second], ['T002', second, first]]) {
    const records = await repo.vouchers({ teacherId });
    assert.ok(records.vouchers.some(row => row.id === own.id));
    assert.ok(records.vouchers.every(row => row.listedBy === teacherId));
    assert.equal((await repo.vouchers({ teacherId, search: name })).vouchers.length, 1);
    assert.ok((await repo.vouchers({ teacherId, search: 's002' })).vouchers.every(row => row.listedBy === teacherId));
    assert.equal((await repo.vouchers({ teacherId, code: own.code })).vouchers[0].id, own.id);
    assert.deepEqual(await repo.vouchers({ teacherId, code: foreign.code }), { vouchers: [], nextCursor: null });
    assert.deepEqual(await repo.vouchers({ teacherId, before: foreign.id }), { vouchers: [], nextCursor: null });
    const before = (await repo.vouchers({ studentId: 'S002', code: foreign.code })).vouchers[0];
    await assert.rejects(repo.redeemVoucher(teacherId, foreign.id), { status: 404 });
    await assert.rejects(repo.redeem(teacherId, foreign.code), { status: 404 });
    assert.deepEqual((await repo.vouchers({ studentId: 'S002', code: foreign.code })).vouchers[0], before);
    assert.equal((await repo.redeemVoucher(teacherId, own.id)).alreadyRedeemed, false);
    assert.equal((await repo.redeemVoucher(teacherId, own.id)).alreadyRedeemed, true);
  }
  for (const [teacherId, foreign] of [['T001', second], ['T002', first]]) {
    await assert.rejects(repo.redeemVoucher(teacherId, foreign.id), { status: 404 });
    await assert.rejects(repo.redeem(teacherId, foreign.code), { status: 404 });
  }
  const student = (await repo.vouchers({ studentId: 'S002' })).vouchers;
  assert.ok([first, second].every(voucher => student.some(row => row.id === voucher.id)));
  await assert.rejects(repo.vouchers({ teacherId: '' }), { status: 403 });

  // More than one page, with foreign and ownerless legacy records interleaved.
  const rows = Array.from({ length: 405 }, (_, index) => ({
    ...first, id: randomUUID(), code: `RW-${index.toString(16).toUpperCase().padStart(16, '0').match(/.{4}/g).join('-')}`,
    purchaseKey: `page-${index}`, name: `分頁-${name}`, listedBy: index % 2 ? 'T002' : 'T001',
    purchasedAt: new Date(Date.UTC(2030, 0, 1, 0, 0, index)).toISOString(), redeemedAt: null, redeemedBy: null,
  }));
  const orphan = { ...rows[0], id: randomUUID(), code: 'RW-FFFF-FFFF-FFFF-FFFF', purchaseKey: 'ownerless', listedBy: undefined };
  await seed([...rows, orphan]);
  const page = await repo.vouchers({ teacherId: 'T001', search: `分頁-${name}` });
  assert.equal(page.vouchers.length, 200); assert.ok(page.nextCursor);
  const rest = await repo.vouchers({ teacherId: 'T001', search: `分頁-${name}`, before: page.nextCursor });
  assert.equal(rest.vouchers.length, 3); assert.equal(rest.nextCursor, null);
  const all = [...page.vouchers, ...rest.vouchers];
  assert.equal(new Set(all.map(row => row.id)).size, 203);
  assert.ok(all.every(row => row.listedBy === 'T001'));
  for (const teacherId of ['T001', 'T002']) {
    assert.equal((await repo.vouchers({ teacherId, code: orphan.code })).vouchers.length, 0);
    await assert.rejects(repo.redeemVoucher(teacherId, orphan.id), { status: 404 });
  }
};
