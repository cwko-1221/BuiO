'use strict';

const express = require('express');
const repo = require('../repositories/pet.repo');
const academicYears = require('../../math-app/repositories/academic-years.repo');
const users = require('../../math-app/repositories/users.repo');
const { requireAuth, requireTeacher } = require('../../math-app/middleware/auth');

const router = express.Router();
const mutationKey = (req) => String(req.get('Idempotency-Key') || req.body?.idempotencyKey || '').trim().slice(0, 120);
const asyncRoute = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };

function requireStudent(req, res, next) {
  if (!req.session?.studentId) return res.status(401).json({ success: false, message: '請先登入。' });
  if (req.session.role === 'teacher') return res.status(403).json({ success: false, message: '學生功能只供學生使用。' });
  next();
}

function sendResult(res, result, status = 200) { res.status(status).json({ success: true, ...result }); }

router.get('/bootstrap', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await repo.getBootstrap(req.session.studentId));
}));

router.post('/starter-egg/hatch', requireStudent, asyncRoute(async (req, res) => {
  const idempotencyKey = mutationKey(req);
  if (!idempotencyKey) return res.status(400).json({ success: false, message: '缺少防重複提交識別碼。' });
  sendResult(res, await repo.hatchStarter(req.session.studentId, { idempotencyKey }), 201);
}));

router.post('/eggs/purchase', requireStudent, asyncRoute(async (req, res) => {
  const kind = req.body?.kind === 'direct' ? 'direct' : 'random';
  const idempotencyKey = mutationKey(req);
  if (!idempotencyKey) return res.status(400).json({ success: false, message: '缺少防重複提交識別碼。' });
  sendResult(res, await repo.purchaseEgg(req.session.studentId, { kind, speciesId: String(req.body?.speciesId || ''), idempotencyKey }), 201);
}));

router.post('/pets/:petId/activate', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await repo.activatePet(req.session.studentId, req.params.petId));
}));

router.post('/pets/:petId/feed', requireStudent, asyncRoute(async (req, res) => {
  const idempotencyKey = mutationKey(req);
  if (!idempotencyKey) return res.status(400).json({ success: false, message: '請提供防止重複提交識別碼。' });
  sendResult(res, await repo.feedPet(req.session.studentId, req.params.petId, String(req.body?.foodId || ''), { idempotencyKey }));
}));

router.put('/pets/:petId/loadout', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await repo.setLoadout(req.session.studentId, req.params.petId, req.body?.skillIds || []));
}));

router.put('/pets/:petId/outfit', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await repo.setOutfit(req.session.studentId, req.params.petId, req.body?.wearableIds || []));
}));

router.post('/shop/purchase', requireStudent, asyncRoute(async (req, res) => {
  const idempotencyKey = mutationKey(req);
  if (!idempotencyKey) return res.status(400).json({ success: false, message: '缺少防重複提交識別碼。' });
  sendResult(res, await repo.purchaseItem(req.session.studentId, {
    itemId: String(req.body?.itemId || ''), quantity: req.body?.quantity ?? 1,
    petId: req.body?.petId ? String(req.body.petId) : null, idempotencyKey,
  }), 201);
}));

router.put('/room', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await repo.saveRoom(req.session.studentId, {
    themeId: String(req.body?.themeId || ''), visibility: String(req.body?.visibility || 'private'),
    placements: req.body?.placements || [],
  }));
}));

async function currentEnrollment(studentId) {
  const academicYear = await academicYears.getCurrentAcademicYear();
  return { academicYear, enrollment: await academicYears.findEnrollment(academicYear, studentId) };
}

async function assertCanVisit(viewerId, ownerId) {
  if (viewerId === ownerId) return repo.getRoomSnapshot(ownerId);
  const academicYear = await academicYears.getCurrentAcademicYear();
  const [viewer, owner, room] = await Promise.all([
    academicYears.findEnrollment(academicYear, viewerId),
    academicYears.findEnrollment(academicYear, ownerId),
    repo.getRoomSnapshot(ownerId),
  ]);
  if (!viewer || !owner || !viewer.className || viewer.className !== owner.className || room.visibility !== 'class') {
    throw Object.assign(new Error('This room is not available to visit'), { status: 403 });
  }
  return room;
}

router.get('/rooms/class', requireStudent, asyncRoute(async (req, res) => {
  const viewerId = req.session.studentId;
  const { academicYear, enrollment } = await currentEnrollment(viewerId);
  if (!enrollment?.className) return sendResult(res, { rooms: [], academicYear, className: '' });
  const classmates = (await academicYears.listEnrollments(academicYear)).filter((row) => row.studentId !== viewerId && row.className === enrollment.className && row.role !== 'teacher');
  const rooms = [];
  for (const classmate of classmates) {
    const room = await repo.getRoomSnapshot(classmate.studentId, { create: false });
    if (room?.visibility === 'class') rooms.push({ ...room, ownerName: classmate.name, classNo: classmate.classNo });
  }
  sendResult(res, { rooms, academicYear, className: enrollment.className });
}));

router.get('/rooms/:studentId', requireStudent, asyncRoute(async (req, res) => {
  const room = await assertCanVisit(req.session.studentId, req.params.studentId);
  const owner = await users.findByIdSummary(req.params.studentId);
  sendResult(res, { room: { ...room, ownerName: owner?.name || req.params.studentId } });
}));

router.post('/rooms/:studentId/reactions', requireStudent, asyncRoute(async (req, res) => {
  await assertCanVisit(req.session.studentId, req.params.studentId);
  sendResult(res, await repo.addReaction(req.params.studentId, req.session.studentId, String(req.body?.reaction || '')));
}));

router.post('/runs/start', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await repo.startRun(req.session.studentId, String(req.body?.mapId || '')), 201);
}));

router.post('/runs/complete', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await repo.completeRun(req.session.studentId, {
    runId: String(req.body?.runId || ''), success: Boolean(req.body?.success), badgeFound: Boolean(req.body?.badgeFound),
  }));
}));

async function teacherRoster() {
  const academicYear = await academicYears.getCurrentAcademicYear();
  const enrollments = (await academicYears.listEnrollments(academicYear)).filter((row) => row.role !== 'teacher');
  const balances = await repo.walletBalances(enrollments.map((row) => row.studentId));
  return {
    academicYear,
    classes: [...new Set(enrollments.map((row) => row.className).filter(Boolean))].sort(),
    students: enrollments.map((row) => ({ ...row, balance: balances.get(row.studentId) || 0 })),
  };
}

async function resolveGrant(body) {
  const roster = await teacherRoster();
  let recipients;
  if (body?.scope === 'class') recipients = roster.students.filter((row) => row.className === String(body.className || ''));
  else {
    const requested = new Set(Array.isArray(body?.studentIds) ? body.studentIds.map(String) : []);
    recipients = roster.students.filter((row) => requested.has(row.studentId));
  }
  if (!recipients.length) throw Object.assign(new Error('No eligible students selected'), { status: 400 });
  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > 10000) throw Object.assign(new Error('Grant amount must be an integer from 1 to 10000'), { status: 400 });
  return { roster, recipients, amount };
}

router.get('/teacher/roster', requireTeacher, asyncRoute(async (_req, res) => {
  sendResult(res, await teacherRoster());
}));

router.post('/teacher/grants/preview', requireTeacher, asyncRoute(async (req, res) => {
  const { roster, recipients, amount } = await resolveGrant(req.body);
  sendResult(res, { academicYear: roster.academicYear, amount, count: recipients.length, total: recipients.length * amount, recipients });
}));

router.post('/teacher/grants/commit', requireTeacher, asyncRoute(async (req, res) => {
  const idempotencyKey = mutationKey(req);
  if (!idempotencyKey) return res.status(400).json({ success: false, message: '缺少防重複提交識別碼。' });
  const { recipients, amount } = await resolveGrant(req.body);
  sendResult(res, await repo.grantCoins(req.session.studentId, recipients.map((row) => row.studentId), amount, { note: String(req.body?.note || ''), idempotencyKey }), 201);
}));

router.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('[pet]', error.stack || error.message);
  res.status(status).json({ success: false, message: status >= 500 ? '寵物樂園暫時未能完成操作。' : error.message });
});

module.exports = router;
