'use strict';

const express = require('express');
const config = require('../../config');
const setsRepo = require('../../game-app/repositories/questionSets.repo');
const defaultSet = require('../lib/defaultQuestions');
const { publicSet, startSession, issueQuestion, gradeAnswer } = require('../lib/questionSessions');

const router = express.Router();




function isPreview(req) {
  return !config.isProd && req.get('x-buio-preview') === '1';
}

function requireAccess(req, res, next) {
  if (req.session?.studentId || isPreview(req)) return next();
  return res.status(401).json({ success: false, message: '請先登入平台。' });
}

function ownerOf(req) {
  return req.session?.studentId || 'preview-player';
}


router.use(requireAccess);

router.get('/sets', async (req, res, next) => {
  try {
    const available = [publicSet(defaultSet)];
    if (req.session?.role === 'teacher' && setsRepo.pgAvailable()) {
      available.push(...await setsRepo.listSets(req.session.studentId));
    }
    res.json({ success: true, sets: available });
  } catch (error) { next(error); }
});

router.post('/session', (req, res, next) => {
  try {
    const result = startSession(ownerOf(req), req.body, { preview: isPreview(req), prepare: true });
    const traceId = req.get('X-BuiO-Trace');
    if (typeof traceId === 'string' && /^[\w-]{16,80}$/.test(traceId)) console.log('[tower-start]', JSON.stringify({ stage: 'http-session', traceId, requestId: req.requestId, success: true }));
    res.status(201).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
});

for (const [path, action] of [['/question', issueQuestion], ['/answer', gradeAnswer]]) {
  router.post(path, (req, res, next) => {
    try { res.json(action(ownerOf(req), req.body)); }
    catch (error) {
      if (error.status) return res.status(error.status).json({ success: false, message: error.message });
      next(error);
    }
  });
}

module.exports = router;
