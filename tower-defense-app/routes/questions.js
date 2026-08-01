'use strict';

const crypto = require('crypto');
const express = require('express');
const config = require('../../config');
const setsRepo = require('../../game-app/repositories/questionSets.repo');
const defaultSet = require('../lib/defaultQuestions');

const router = express.Router();
const sessions = new Map();
const QUESTION_TTL_MS = 20_000;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

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

function publicSet(set) {
  return { id: set.id, title: set.title, questionCount: set.questions.length, builtin: set.id === defaultSet.id };
}

function shuffledQuestion(question) {
  const entries = question.choices.map((choice, index) => ({ choice, correct: index === question.correctIndex }));
  for (let index = entries.length - 1; index > 0; index--) {
    const swap = crypto.randomInt(index + 1);
    [entries[index], entries[swap]] = [entries[swap], entries[index]];
  }
  return {
    prompt: question.question,
    choices: entries.map(entry => entry.choice),
    correctIndex: entries.findIndex(entry => entry.correct),
  };
}

async function loadSet(req, setId) {
  if (!setId || setId === defaultSet.id) return defaultSet;
  if (req.session?.role !== 'teacher' || !setsRepo.pgAvailable()) {
    const error = new Error('只有教師可以選用自訂題庫。');
    error.statusCode = 403;
    throw error;
  }
  const set = await setsRepo.getSetWithQuestions(setId);
  if (!set || set.createdBy !== req.session.studentId) {
    const error = new Error('找不到這個題庫。');
    error.statusCode = 404;
    throw error;
  }
  if (set.questions.some(question => question.choices.length !== 4)) {
    const error = new Error('塔防題庫的每條題目必須有四個選項。');
    error.statusCode = 400;
    throw error;
  }
  return set;
}

function getSession(req, res) {
  const gameSession = sessions.get(String(req.body?.sessionId || ''));
  if (!gameSession || gameSession.owner !== ownerOf(req)) {
    res.status(404).json({ success: false, message: '遊戲答題連線已失效，請重新開始。' });
    return null;
  }
  gameSession.touchedAt = Date.now();
  return gameSession;
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

router.post('/session', async (req, res, next) => {
  try {
    const set = await loadSet(req, String(req.body?.setId || defaultSet.id));
    const id = crypto.randomUUID();
    const order = set.questions.map((_, index) => index);
    for (let index = order.length - 1; index > 0; index--) {
      const swap = crypto.randomInt(index + 1);
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    sessions.set(id, {
      id,
      owner: ownerOf(req),
      set,
      order,
      cursor: 0,
      streak: 0,
      correct: 0,
      answered: 0,
      active: null,
      touchedAt: Date.now(),
    });
    res.status(201).json({ success: true, sessionId: id, set: publicSet(set) });
  } catch (error) { next(error); }
});

router.post('/question', (req, res) => {
  const gameSession = getSession(req, res);
  if (!gameSession) return;
  const now = Date.now();
  if (gameSession.active && !gameSession.active.used && gameSession.active.expiresAt > now) {
    const { token, prompt, choices, expiresAt, baseReward } = gameSession.active;
    return res.json({ success: true, question: { token, prompt, choices, expiresAt, baseReward } });
  }
  if (gameSession.cursor >= gameSession.order.length) {
    gameSession.cursor = 0;
    gameSession.order.reverse();
  }
  const raw = gameSession.set.questions[gameSession.order[gameSession.cursor++]];
  const question = shuffledQuestion(raw);
  gameSession.active = {
    ...question,
    token: crypto.randomUUID(),
    baseReward: 45,
    expiresAt: now + QUESTION_TTL_MS,
    used: false,
  };
  const { token, prompt, choices, expiresAt, baseReward } = gameSession.active;
  res.json({ success: true, question: { token, prompt, choices, expiresAt, baseReward } });
});

router.post('/answer', (req, res) => {
  const gameSession = getSession(req, res);
  if (!gameSession) return;
  const active = gameSession.active;
  const answerIndex = Number(req.body?.answerIndex);
  if (!active || active.token !== req.body?.token || active.used) {
    return res.status(409).json({ success: false, message: '這條題目已經失效。' });
  }
  active.used = true;
  gameSession.answered += 1;
  const timedOut = Date.now() > active.expiresAt;
  const correct = !timedOut && Number.isInteger(answerIndex) && answerIndex === active.correctIndex;
  if (correct) {
    gameSession.streak += 1;
    gameSession.correct += 1;
  } else {
    gameSession.streak = 0;
  }
  const reward = correct ? active.baseReward + Math.min(40, (gameSession.streak - 1) * 5) : 0;
  res.json({
    success: true,
    correct,
    timedOut,
    correctIndex: active.correctIndex,
    reward,
    streak: gameSession.streak,
    accuracy: gameSession.answered ? gameSession.correct / gameSession.answered : 0,
  });
});

setInterval(() => {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) if (session.touchedAt < cutoff) sessions.delete(id);
}, 10 * 60 * 1000).unref();

module.exports = router;
