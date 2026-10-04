'use strict';

const express = require('express');
const config = require('../../config');
const repo = require('../repositories/pet.repo');
const prizes = require('../repositories/arcade-prizes.repo');
const quietRooms = require('../repositories/quiet-room.repo');
const accessLocks = require('../repositories/access-lock.repo');
const { catalog } = require('../lib/catalog');
const academicYears = require('../../math-app/repositories/academic-years.repo');
const users = require('../../math-app/repositories/users.repo');
const { requireAuth, requireTeacher } = require('../../math-app/middleware/auth');

const router = express.Router();
const mutationKey = (req) => String(req.get('Idempotency-Key') || req.body?.idempotencyKey || '').trim().slice(0, 120);
const coinPusherMutationKey = (req) => {
  const key = String(req.get('Idempotency-Key') || req.body?.idempotencyKey || '').trim();
  return key && key.length <= 120 ? key : '';
};
const asyncRoute = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };

function requireStudent(req, res, next) {
  if (!req.session?.studentId) return res.status(401).json({ success: false, message: '請先登入。' });
  if (req.session.role !== 'student') return res.status(403).json({ success: false, message: '學生功能只供學生使用。' });
  next();
}

function sendResult(res, result, status = 200) { res.status(status).json({ success: true, ...result }); }

router.get('/access', requireStudent, asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  sendResult(res, { access: await accessLocks.studentStatus(req.session.studentId) });
}));
router.get('/teacher/access', requireTeacher, asyncRoute(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  sendResult(res, await accessLocks.teacherSettings());
}));
router.post('/teacher/access', requireTeacher, asyncRoute(async (req, res) => {
  sendResult(res, await accessLocks.update(req.session.studentId, req.body));
}));
router.post('/teacher/access/:id/cancel', requireTeacher, asyncRoute(async (req, res) => {
  sendResult(res, await accessLocks.cancel(req.params.id));
}));

// Gate every student surface, including future routes and the brawl sub-router. Previously
// paid coin receipts can still settle; this exception cannot buy or start another play.
router.use(async (req, res, next) => {
  if (req.session?.role !== 'student' || req.path.startsWith('/teacher/') || (req.method === 'POST' && req.path === '/coin-pusher/payout')) return next();
  try {
    await accessLocks.assertAllowed(req.session.studentId);
    next();
  } catch (error) {
    if (error.code === 'PET_APP_LOCKED') return res.status(423).set('Cache-Control', 'no-store').json({ success: false, code: error.code, message: error.message, access: error.access });
    next(error);
  }
});
router.use('/brawl', require('./brawl'));

router.get('/bootstrap', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await repo.getBootstrap(req.session.studentId));
}));

router.post('/coin-pusher/prizes', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await prizes.stock(req.session.studentId));
}));
router.post('/coin-pusher/prizes/:prizeId/claim', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await prizes.claim(req.session.studentId, req.params.prizeId));
}));
router.post('/coin-pusher/prizes/:prizeId/redeem', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await prizes.redeem(req.session.studentId, req.params.prizeId, String(req.body?.itemId || '')));
}));

if (config.isExplicitDevelopment) {
  router.post('/dev/unlimited-money', requireStudent, asyncRoute(async (req, res) => {
    sendResult(res, await repo.grantUnlimitedMoney(req.session.studentId, 999999));
  }));
}

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

router.post('/coin-pusher/play', requireStudent, asyncRoute(async (req, res) => {
  const idempotencyKey = coinPusherMutationKey(req);
  if (!idempotencyKey) return res.status(400).json({ success: false, message: '缺少有效的防重複提交識別碼。' });
  sendResult(res, await repo.playCoinPusher(req.session.studentId, { idempotencyKey }));
}));

router.post('/coin-pusher/payout', requireStudent, asyncRoute(async (req, res) => {
  const idempotencyKey = coinPusherMutationKey(req);
  if (!idempotencyKey) return res.status(400).json({ success: false, message: '缺少有效的防重複提交識別碼。' });
  sendResult(res, await repo.payoutCoinPusher(req.session.studentId, {
    playId: req.body?.playId, eventId: req.body?.eventId || req.body?.payoutEventId,
    amount: req.body?.amount,
    idempotencyKey,
  }));
}));

router.post('/pets/:petId/activate', requireStudent, asyncRoute(async (req, res) => {
  sendResult(res, await repo.activatePet(req.session.studentId, req.params.petId));
}));

router.post('/pets/:petId/feed', requireStudent, asyncRoute(async (req, res) => {
  const idempotencyKey = mutationKey(req);
  if (!idempotencyKey) return res.status(400).json({ success: false, message: '請提供防止重複提交識別碼。' });
  sendResult(res, await repo.feedPet(req.session.studentId, req.params.petId, String(req.body?.foodId || ''), { idempotencyKey }));
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
  const byStudentId = new Map(classmates.map((row) => [row.studentId, row]));
  const visible = await repo.listVisitableRooms([...byStudentId.keys()]);
  const rooms = visible.map((room) => ({ ...room, ownerName: byStudentId.get(room.ownerStudentId)?.name || room.ownerStudentId, classNo: byStudentId.get(room.ownerStudentId)?.classNo }));
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

router.get('/grant-notifications', requireStudent, asyncRoute(async (req, res) => {
  const grants = await repo.listUnseenTeacherGrants(req.session.studentId);
  const actorIds = [...new Set(grants.map((grant) => grant.actorId).filter(Boolean))];
  const summaries = await Promise.all(actorIds.map(async (actorId) => [actorId, await users.findByIdSummary(actorId)]));
  const teachers = new Map(summaries);
  sendResult(res, {
    grants: grants.map((grant) => ({
      ...grant,
      teacherName: teachers.get(grant.actorId)?.name || '老師',
    })),
  });
}));

router.post('/grant-notifications/acknowledge', requireStudent, asyncRoute(async (req, res) => {
  if (!Array.isArray(req.body?.transactionIds)) {
    return res.status(400).json({ success: false, message: '缺少金幣通知識別碼。' });
  }
  sendResult(res, await repo.acknowledgeTeacherGrants(req.session.studentId, req.body.transactionIds));
}));

const GRANT_GROUP_FIELDS = Object.freeze({
  chineseGroup: '中文組',
  englishGroup: '英文組',
  mathGroup: '數學組',
});

const uniqueValues = (rows, field) => [...new Set(rows.map((row) => String(row[field] || '').trim()).filter(Boolean))].sort();

async function teacherRoster() {
  const academicYear = await academicYears.getCurrentAcademicYear();
  const enrollments = (await academicYears.listEnrollments(academicYear)).filter((row) => row.role !== 'teacher');
  const balances = await repo.walletBalances(enrollments.map((row) => row.studentId));
  return {
    academicYear,
    classes: [...new Set(enrollments.map((row) => row.className).filter(Boolean))].sort(),
    groups: Object.fromEntries(Object.keys(GRANT_GROUP_FIELDS).map((field) => [field, uniqueValues(enrollments, field)])),
    students: enrollments.map((row) => ({ ...row, balance: balances.get(row.studentId) || 0 })),
    quietPets: catalog.pets.filter(row => ['starpatch-cat', 'cloud-ear-dog', 'crescent-rabbit'].includes(row.id)).map(row => {
      const layout = catalog.animationByPet?.[row.id] || catalog.animation;
      const idle = layout.actions.find(action => action.name === 'idle' && action.facing === 'front')
        || layout.actions.find(action => action.name === 'idle' && !action.facing);
      const frames = idle?.frames?.length ? idle.frames
        : Array.from({ length: idle?.length || 1 }, (_, index) => (idle?.start || 0) + index);
      const frame = frames[0];
      return { name: row.names, atlas: row.atlas[0], columns: layout.columns, rows: layout.rows, frame, focusFrame: frame,
        idleClip: { frames, durations: idle?.durations, fps: layout.fps } };
    }),
  };
}

async function resolveGrant(body) {
  const roster = await teacherRoster();
  let recipients;
  if (body?.scope === 'class') recipients = roster.students.filter((row) => row.className === String(body.className || ''));
  else if (body?.scope === 'group') {
    const groupField = String(body.groupField || '');
    const groupName = String(body.groupName || '').trim();
    if (!Object.hasOwn(GRANT_GROUP_FIELDS, groupField) || !groupName) {
      throw Object.assign(new Error('請選擇中文組、英文組或數學組。'), { status: 400 });
    }
    recipients = roster.students.filter((row) => String(row[groupField] || '').trim() === groupName);
  }
  else {
    const requested = new Set(Array.isArray(body?.studentIds) ? body.studentIds.map(String) : []);
    recipients = roster.students.filter((row) => requested.has(row.studentId));
  }
  if (!recipients.length) throw Object.assign(new Error('No eligible students selected'), { status: 400 });
  const amount = Number(body?.amount);
  if (!Number.isInteger(amount) || amount === 0 || amount < -10000 || amount > 10000) throw Object.assign(new Error('每人金額必須是 -10,000 至 10,000 之間的非零整數。'), { status: 400 });
  recipients = recipients.map((row) => ({
    ...row,
    nextBalance: Number(row.balance) + amount,
    insufficient: Number(row.balance) + amount < 0,
  }));
  return { roster, recipients, amount, insufficient: recipients.filter((row) => row.insufficient) };
}

router.get('/teacher/roster', requireTeacher, asyncRoute(async (_req, res) => {
  sendResult(res, await teacherRoster());
}));

router.get('/teacher/coin-pusher/settings', requireTeacher, asyncRoute(async (_req, res) => {
  sendResult(res, await repo.getCoinPusherSettings());
}));

router.put('/teacher/coin-pusher/settings', requireTeacher, asyncRoute(async (req, res) => {
  sendResult(res, await repo.updateCoinPusherSettings(req.session.studentId, { rewardPerCoin: req.body?.rewardPerCoin }));
}));

router.get('/teacher/quiet-room', requireTeacher, asyncRoute(async (req, res) => {
  sendResult(res, { session: await quietRooms.current(req.session.studentId) });
}));

router.post('/teacher/quiet-room', requireTeacher, asyncRoute(async (req, res) => {
  const body = req.body;
  if (!['class', 'group'].includes(body?.scope)) throw Object.assign(new Error('請選擇全班或組別。'), { status: 400 });
  const roster = await teacherRoster();
  let recipients = roster.students.filter(row => row.className === body.className);
  let label = String(body.className || '');
  if (body.scope === 'group') {
    const subjects = { chineseGroup: '中文', englishGroup: '英文', mathGroup: '數學' };
    if (!Object.hasOwn(subjects, body.groupField) || typeof body.groupName !== 'string' || !body.groupName) {
      throw Object.assign(new Error('請選擇科目及組別。'), { status: 400 });
    }
    recipients = recipients.filter(row => row[body.groupField] === body.groupName);
    label += ` · ${subjects[body.groupField]} ${body.groupName}`;
  }
  sendResult(res, { session: await quietRooms.start(req.session.studentId, body, recipients.map(row => row.studentId), mutationKey(req), label) }, 201);
}));

router.post('/teacher/quiet-room/:id', requireTeacher, asyncRoute(async (req, res) => {
  sendResult(res, { session: await quietRooms.update(req.session.studentId, req.params.id, req.body?.action, req.body?.eventId) });
}));

router.post('/teacher/grants/preview', requireTeacher, asyncRoute(async (req, res) => {
  const { roster, recipients, amount, insufficient } = await resolveGrant(req.body);
  sendResult(res, {
    academicYear: roster.academicYear,
    amount,
    action: amount < 0 ? 'deduction' : 'grant',
    count: recipients.length,
    total: recipients.length * amount,
    canCommit: insufficient.length === 0,
    insufficient,
    recipients,
  });
}));

router.post('/teacher/grants/commit', requireTeacher, asyncRoute(async (req, res) => {
  const idempotencyKey = mutationKey(req);
  if (!idempotencyKey) return res.status(400).json({ success: false, message: '缺少防重複提交識別碼。' });
  const { recipients, amount, insufficient } = await resolveGrant(req.body);
  if (insufficient.length) throw Object.assign(new Error('部分學生的金幣餘額不足，未有扣除任何金幣。'), { status: 409 });
  sendResult(res, await repo.grantCoins(req.session.studentId, recipients.map((row) => row.studentId), amount, { note: String(req.body?.note || ''), idempotencyKey }), 201);
}));

router.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('[pet]', error.stack || error.message);
  if(req.path.startsWith('/coin-pusher/')&&status>=400)console.warn('[pet] Arcade request rejected',JSON.stringify({requestId:req.requestId,status,reason:String(error.message).slice(0,160)}));
  res.status(status).json({ success: false, message: status >= 500 ? '寵物樂園暫時未能完成操作。' : error.message,requestId:req.requestId });
});

module.exports = router;
