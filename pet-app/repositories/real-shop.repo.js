'use strict';

const { randomUUID, randomBytes } = require('node:crypto');
const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool, withTransaction } = require('../../math-app/db/database');
const pets = require('./pet.repo');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const imageUrl = id => id ? `/api/pet/real-shop/images/${id}` : '';
const productView = row => ({ ...row, imageUrl: imageUrl(row.imageId) });
const voucherView = row => ({ ...row, imageUrl: imageUrl(row.imageId) });
let schema;

async function ensure() {
  await pets.ensureSchema();
  if (config.db.mode !== 'postgres') {
    const data = store.load();
    for (const key of ['petRealProducts', 'petRealVouchers', 'petRealImages']) data[key] ??= [];
    return;
  }
  schema ??= getPool().query(`
    CREATE TABLE IF NOT EXISTS PetRealImages (
      ImageID UUID PRIMARY KEY, Content BYTEA NOT NULL, CreatedBy VARCHAR(20) NOT NULL,
      CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS PetRealProducts (
      ProductID UUID PRIMARY KEY, Data JSONB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS PetRealVouchers (
      VoucherID UUID PRIMARY KEY, StudentID VARCHAR(20) NOT NULL REFERENCES Users(StudentID) ON DELETE CASCADE,
      PurchaseKey VARCHAR(120) NOT NULL, Code VARCHAR(30) NOT NULL UNIQUE,
      Data JSONB NOT NULL, CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(StudentID, PurchaseKey)
    );
    CREATE INDEX IF NOT EXISTS idx_pet_real_vouchers_student ON PetRealVouchers(StudentID, CreatedAt DESC);
    CREATE INDEX IF NOT EXISTS idx_pet_real_vouchers_created ON PetRealVouchers(CreatedAt DESC);
    ALTER TABLE PetRealImages ENABLE ROW LEVEL SECURITY;
    ALTER TABLE PetRealProducts ENABLE ROW LEVEL SECURITY;
    ALTER TABLE PetRealVouchers ENABLE ROW LEVEL SECURITY;
  `).catch(error => { schema = null; throw error; });
  await schema;
}

// JSON mutations are synchronous from snapshot through save: another wallet operation cannot
// interleave. Restore every touched collection if the atomic file replacement fails.
function jsonTransaction(change) {
  const data = store.load();
  const keys = ['petRealProducts', 'petRealVouchers', 'petRealImages', 'petWallets', 'petCurrencyLedger'];
  const before = Object.fromEntries(keys.map(key => [key, structuredClone(data[key])]));
  try { const result = change(data); store.save(); return structuredClone(result); }
  catch (error) { for (const key of keys) data[key] = before[key]; throw error; }
}

async function saveImage(actorId, buffer) {
  await ensure();
  const imageId = randomUUID();
  if (config.db.mode === 'postgres') await getPool().query('INSERT INTO PetRealImages(ImageID,Content,CreatedBy) VALUES($1,$2,$3)', [imageId, buffer, actorId]);
  else jsonTransaction(data => data.petRealImages.push({ imageId, content: buffer.toString('base64'), actorId }));
  return { imageId, imageUrl: imageUrl(imageId) };
}

async function readImage(id) {
  if (!uuid(id)) fail('找不到商品圖片。', 404);
  await ensure();
  const content = config.db.mode === 'postgres'
    ? (await getPool().query('SELECT Content AS content FROM PetRealImages WHERE ImageID=$1', [id])).rows[0]?.content
    : store.load().petRealImages.find(row => row.imageId === id)?.content;
  if (!content) fail('找不到商品圖片。', 404);
  return Buffer.isBuffer(content) ? content : Buffer.from(content, 'base64');
}

async function listProducts(teacher = false) {
  await ensure();
  const rows = config.db.mode === 'postgres'
    ? (await getPool().query(`SELECT Data AS data FROM PetRealProducts ${teacher ? '' : "WHERE Data->>'active'='true'"} ORDER BY Data->>'createdAt' DESC`)).rows.map(row => row.data)
    : store.load().petRealProducts.filter(row => teacher || row.active).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows.map(productView);
}

function validateProduct(body) {
  if (typeof body?.name !== 'string' || !body.name.trim() || body.name.trim().length > 80) fail('商品名稱須為 1 至 80 個字。');
  if (typeof body.description !== 'string' || body.description.length > 600) fail('商品說明最多 600 個字。');
  if (!Number.isSafeInteger(body.price) || body.price < 1 || body.price > 1000000) fail('價錢須為 1 至 1,000,000 枚金幣的整數。');
  if (body.stock !== null && (!Number.isSafeInteger(body.stock) || body.stock < 0 || body.stock > 1000000)) fail('庫存須為 0 至 1,000,000 的整數，或留空表示不限量。');
  if (typeof body.active !== 'boolean') fail('請指定商品是否上架。');
  if (body.imageId !== null && !uuid(body.imageId)) fail('請重新上傳商品圖片。');
  return { name: body.name.trim(), description: body.description.trim(), price: body.price, stock: body.stock, active: body.active, imageId: body.imageId };
}

async function saveProduct(actorId, id, body, actorName = actorId) {
  const fields = validateProduct(body);
  if (!uuid(id)) fail('商品編號無效。');
  await ensure();
  const apply = previous => {
    if (previous && body.revision !== previous.revision) fail('商品或庫存已更新，請重新載入後再修改。', 409);
    if (!previous && body.revision !== 0) fail('找不到商品。', 404);
    return { ...previous, ...fields, id, listedBy: previous?.listedBy || actorId, listedByName: previous?.listedByName || actorName, createdAt: previous?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: actorId, revision: (previous?.revision || 0) + 1 };
  };
  if (config.db.mode === 'postgres') return withTransaction(async client => {
    // Serialize creation retries as well as updates for this product ID.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`real-product:${id}`]);
    const previous = (await client.query('SELECT Data AS data FROM PetRealProducts WHERE ProductID=$1 FOR UPDATE', [id])).rows[0]?.data;
    if (fields.imageId && !(await client.query('SELECT 1 FROM PetRealImages WHERE ImageID=$1', [fields.imageId])).rows.length) fail('找不到商品圖片，請重新上傳。');
    const product = apply(previous);
    await client.query('INSERT INTO PetRealProducts(ProductID,Data) VALUES($1,$2::jsonb) ON CONFLICT(ProductID) DO UPDATE SET Data=$2::jsonb', [id, JSON.stringify(product)]);
    return productView(product);
  });
  return jsonTransaction(data => {
    if (fields.imageId && !data.petRealImages.some(row => row.imageId === fields.imageId)) fail('找不到商品圖片，請重新上傳。');
    const index = data.petRealProducts.findIndex(row => row.id === id), product = apply(data.petRealProducts[index]);
    if (index < 0) data.petRealProducts.push(product); else data.petRealProducts[index] = product;
    return productView(product);
  });
}

async function purchase(studentId, productId, expectedPrice, key) {
  if (!uuid(productId)) fail('商品編號無效。');
  if (typeof key !== 'string' || !key.trim() || key.length > 120) fail('缺少有效的防重複提交識別碼。');
  await ensure(); await pets.ensureStudent(studentId);
  const replay = voucher => {
    if (voucher.productId !== productId) fail('此購買識別碼已用於其他商品。', 409);
    return voucherView(voucher);
  };
  const apply = (product, balance) => {
    if (!product?.active) fail('商品已下架，未有扣除金幣。', 409);
    if (product.price !== expectedPrice) fail('商品價錢已更新，請重新載入後再購買。', 409);
    if (product.stock !== null && product.stock < 1) fail('商品已售罄，未有扣除金幣。', 409);
    if (balance < product.price) fail('金幣不足，未有扣除金幣。', 409);
    const code = 'RW-' + randomBytes(8).toString('hex').toUpperCase().match(/.{4}/g).join('-');
    const voucher = { id: randomUUID(), code, studentId, productId, name: product.name, price: product.price, imageId: product.imageId, listedBy: product.listedBy, listedByName: product.listedByName, purchasedAt: new Date().toISOString(), redeemedAt: null, redeemedBy: null, purchaseKey: key };
    const nextProduct = { ...product, stock: product.stock === null ? null : product.stock - 1, revision: product.revision + 1 };
    return { voucher, nextProduct, balance: balance - product.price };
  };
  if (config.db.mode === 'postgres') return withTransaction(async client => {
    const wallet = (await client.query('SELECT Balance AS balance FROM PetWallets WHERE StudentID=$1 FOR UPDATE', [studentId])).rows[0];
    const previous = (await client.query('SELECT Data AS data FROM PetRealVouchers WHERE StudentID=$1 AND PurchaseKey=$2', [studentId, key])).rows[0]?.data;
    if (previous) return { voucher: replay(previous), balance: Number(wallet.balance), replayed: true };
    const product = (await client.query('SELECT Data AS data FROM PetRealProducts WHERE ProductID=$1 FOR UPDATE', [productId])).rows[0]?.data;
    const value = apply(product, Number(wallet.balance));
    await client.query('UPDATE PetWallets SET Balance=$2,UpdatedAt=NOW() WHERE StudentID=$1', [studentId, value.balance]);
    await client.query('UPDATE PetRealProducts SET Data=$2::jsonb WHERE ProductID=$1', [productId, JSON.stringify(value.nextProduct)]);
    await client.query('INSERT INTO PetRealVouchers(VoucherID,StudentID,PurchaseKey,Code,Data) VALUES($1,$2,$3,$4,$5::jsonb)', [value.voucher.id, studentId, key, value.voucher.code, JSON.stringify(value.voucher)]);
    await client.query(`INSERT INTO PetCurrencyLedger(TransactionID,StudentID,ActorID,Delta,Kind,IdempotencyKey,Metadata)
      VALUES($1,$2,$2,$3,'real_shop_purchase',$4,$5::jsonb)`, [randomUUID(), studentId, -product.price, `real:${value.voucher.id}`, JSON.stringify({ productId, voucherId: value.voucher.id, price: product.price })]);
    return { voucher: voucherView(value.voucher), balance: value.balance };
  });
  return jsonTransaction(data => {
    const wallet = data.petWallets.find(row => row.studentId === studentId);
    const previous = data.petRealVouchers.find(row => row.studentId === studentId && row.purchaseKey === key);
    if (previous) return { voucher: replay(previous), balance: wallet.balance, replayed: true };
    const index = data.petRealProducts.findIndex(row => row.id === productId), value = apply(data.petRealProducts[index], wallet.balance);
    wallet.balance = value.balance; data.petRealProducts[index] = value.nextProduct; data.petRealVouchers.push(value.voucher);
    data.petCurrencyLedger.push({ transactionId: randomUUID(), studentId, actorId: studentId, delta: -value.voucher.price, kind: 'real_shop_purchase', idempotencyKey: `real:${value.voucher.id}`, metadata: { productId, voucherId: value.voucher.id, price: value.voucher.price }, createdAt: value.voucher.purchasedAt });
    return { voucher: voucherView(value.voucher), balance: value.balance };
  });
}

function normalizeCode(code) {
  const value = String(code || '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!/^RW[0-9A-F]{16}$/.test(value)) fail('請輸入完整的換領碼。');
  return 'RW-' + value.slice(2).match(/.{4}/g).join('-');
}

async function vouchers({ studentId, code, before } = {}) {
  await ensure();
  if (code !== undefined) code = normalizeCode(code);
  if (before !== undefined && (typeof before !== 'string' || !uuid(before))) fail('分頁識別碼無效。');
  let rows;
  if (config.db.mode === 'postgres') {
    const params = [], clauses = [], add = (sql, value) => { params.push(value); clauses.push(sql.replace('?', `$${params.length}`)); };
    if (studentId) add('StudentID=?', studentId);
    if (code) add('Code=?', code);
    if (before) add('(CreatedAt,VoucherID) < (SELECT CreatedAt,VoucherID FROM PetRealVouchers WHERE VoucherID=?::uuid)', before);
    rows = (await getPool().query(`SELECT Data AS data FROM PetRealVouchers ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY CreatedAt DESC,VoucherID DESC LIMIT 201`, params)).rows.map(row => row.data);
  } else {
    rows = store.load().petRealVouchers.filter(row => (!studentId || row.studentId === studentId) && (!code || row.code === code)).slice().sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt) || b.id.localeCompare(a.id));
    if (before) { const index = rows.findIndex(row => row.id === before); rows = index < 0 ? [] : rows.slice(index + 1); }
  }
  return { vouchers: rows.slice(0, 200).map(voucherView), nextCursor: rows.length > 200 ? rows[199].id : null };
}

async function redeem(actorId, code) {
  code = normalizeCode(code); await ensure();
  const apply = voucher => {
    if (!voucher) fail('找不到這張換領券。', 404);
    if (voucher.redeemedAt) return { voucher: voucherView(voucher), alreadyRedeemed: true };
    return { voucher: voucherView({ ...voucher, redeemedAt: new Date().toISOString(), redeemedBy: actorId }), alreadyRedeemed: false };
  };
  if (config.db.mode === 'postgres') return withTransaction(async client => {
    const previous = (await client.query('SELECT Data AS data FROM PetRealVouchers WHERE Code=$1 FOR UPDATE', [code])).rows[0]?.data;
    const result = apply(previous);
    if (!result.alreadyRedeemed) { const { imageUrl: unused, ...data } = result.voucher; await client.query('UPDATE PetRealVouchers SET Data=$2::jsonb WHERE Code=$1', [code, JSON.stringify(data)]); }
    return result;
  });
  return jsonTransaction(data => {
    const index = data.petRealVouchers.findIndex(row => row.code === code), result = apply(data.petRealVouchers[index]);
    if (!result.alreadyRedeemed) { const { imageUrl: unused, ...voucher } = result.voucher; data.petRealVouchers[index] = voucher; }
    return result;
  });
}

module.exports = { ensure, saveImage, readImage, listProducts, saveProduct, purchase, vouchers, redeem };
