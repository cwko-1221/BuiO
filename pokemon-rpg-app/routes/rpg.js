'use strict';

const express = require('express');
const config = require('../../config');
const rpgRepo = require('../repositories/rpg.repo');

const router = express.Router();

function resolveActor(req) {
  if (req.session?.studentId) {
    return {
      id: req.session.studentId,
      name: req.session.studentName || req.session.name || req.session.studentId,
      role: req.session.role || 'student',
    };
  }
  if (!config.isProd && req.get('x-buio-preview') === '1') {
    return {
      id: 'S001',
      name: '王小明',
      role: 'student',
    };
  }
  return null;
}

router.get('/state', async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    if (!actor) {
      return res.status(401).json({ success: false, message: '請先登入平台。' });
    }
    const save = await rpgRepo.getSave(actor.id);
    res.json({
      success: true,
      user: actor,
      save,
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/save', async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    if (!actor) {
      return res.status(401).json({ success: false, message: '請先登入平台。' });
    }
    const saved = await rpgRepo.upsertSave(actor.id, req.body?.save || req.body);
    res.json({
      success: true,
      save: saved,
      savedAt: saved.updatedAt,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset', async (req, res, next) => {
  try {
    const actor = resolveActor(req);
    if (!actor) {
      return res.status(401).json({ success: false, message: '請先登入平台。' });
    }
    await rpgRepo.deleteSave(actor.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
