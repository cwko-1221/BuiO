'use strict';

const express = require('express');
const config = require('../../config');
const setsRepo = require('../../game-app/repositories/questionSets.repo');
const demoSet = require('../../game-app/lib/demoSet');
const crystalSet = require('../../tower-defense-app/lib/defaultQuestions');

const router = express.Router();

function isPreview(req) {
  return !config.isProd && req.get('x-buio-preview') === '1';
}

function requireTeacherOrPreview(req, res, next) {
  if (req.session?.studentId && req.session.role === 'teacher') return next();
  if (isPreview(req)) return next();
  return res.status(403).json({ success: false, message: '只有老師可以選擇課堂題庫。' });
}

function publicBuiltin(set) {
  return {
    id: set.id,
    title: set.title,
    questionCount: set.questions.length,
    builtin: true,
    games: ['climb', 'tower-defense'],
  };
}

router.get('/sets', requireTeacherOrPreview, async (req, res, next) => {
  try {
    const available = [publicBuiltin(demoSet), publicBuiltin(crystalSet)];
    if (req.session?.role === 'teacher' && setsRepo.pgAvailable()) {
      const rows = await setsRepo.listSets(req.session.studentId);
      const detailed = await Promise.all(rows.map(async row => {
        const set = await setsRepo.getSetWithQuestions(row.id);
        const supportsTowerDefense = !!set?.questions?.length
          && set.questions.every(question => question.choices.length === 4);
        return {
          ...row,
          builtin: false,
          games: supportsTowerDefense ? ['climb', 'tower-defense'] : ['climb'],
        };
      }));
      available.push(...detailed);
    }
    res.json({ success: true, sets: available, dbAvailable: setsRepo.pgAvailable() });
  } catch (error) { next(error); }
});

module.exports = router;
