'use strict';
const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const shop = require('../repositories/real-shop.repo');
const { requireAuth, requireTeacher } = require('../../math-app/middleware/auth');
const users = require('../../math-app/repositories/users.repo');
const router = express.Router();
const route = fn => async (req, res, next) => { try { await fn(req, res); } catch (error) { next(error); } };
const ok = (res, value) => res.json({ success: true, ...value });
const student = (req, res, next) => req.session?.role === 'student' && req.session.studentId ? next() : res.status(403).json({ success: false, message: '請以學生帳戶登入。' });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 } }).single('image');
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/products', student, route(async (_req, res) => ok(res, { products: await shop.listProducts() })));
router.get('/vouchers', student, route(async (req, res) => ok(res, await shop.vouchers({ studentId: req.session.studentId, before: req.query.before }))));
router.post('/purchase', student, route(async (req, res) => ok(res, await shop.purchase(req.session.studentId, req.body?.productId, req.body?.expectedPrice, req.get('Idempotency-Key')))));
router.get('/images/:id', requireAuth, route(async (req, res) => {
  const content = await shop.readImage(req.params.id);
  res.type('webp').set('X-Content-Type-Options', 'nosniff').send(content);
}));
router.get('/teacher/products', requireTeacher, route(async (_req, res) => ok(res, { products: await shop.listProducts(true) })));
router.put('/teacher/products/:id', requireTeacher, route(async (req, res) => {
  const teacher = await users.findByIdSummary(req.session.studentId);
  ok(res, { product: await shop.saveProduct(req.session.studentId, req.params.id, req.body, teacher?.name || req.session.studentId) });
}));
router.delete('/teacher/products/:id', requireTeacher, route(async (req, res) => ok(res, await shop.deleteProduct(req.params.id, req.body?.revision))));
router.post('/teacher/images', requireTeacher, (req, res, next) => upload(req, res, error => {
  if (error) return next(Object.assign(new Error(error.code === 'LIMIT_FILE_SIZE' ? '圖片不能超過 8 MB。' : '請上傳一張商品圖片。'), { status: 400 }));
  next();
}), route(async (req, res) => {
  if (!req.file) throw Object.assign(new Error('請選擇商品圖片。'), { status: 400 });
  let content;
  try {
    const input = sharp(req.file.buffer, { limitInputPixels: 25000000, animated: false });
    const metadata = await input.metadata();
    if (!['jpeg', 'png', 'webp', 'heif'].includes(metadata.format)) throw new Error('format');
    content = await input.rotate().resize(1000, 1000, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
  } catch { throw Object.assign(new Error('圖片無法讀取，請使用 JPG、PNG 或 WebP 圖片（最多 2500 萬像素）。'), { status: 400 }); }
  ok(res, await shop.saveImage(req.session.studentId, content));
}));
router.get('/teacher/vouchers', requireTeacher, route(async (req, res) => ok(res, await shop.vouchers({ code: req.query.code, before: req.query.before, search: req.query.search }))));
router.post('/teacher/vouchers/:id/redeem', requireTeacher, route(async (req, res) => ok(res, await shop.redeemVoucher(req.session.studentId, req.params.id))));
router.post('/teacher/redeem', requireTeacher, route(async (req, res) => ok(res, await shop.redeem(req.session.studentId, req.body?.code))));
module.exports = router;
