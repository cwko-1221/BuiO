'use strict';

const crypto = require('crypto');
const express = require('express');
const config = require('../../config');
const setsRepo = require('../../game-app/repositories/questionSets.repo');
const defaultSet = require('../lib/defaultQuestions');
const { rooms } = require('../lib/classrooms');
const { sessions, publicSet, startSession } = require('../lib/questionSessions');

const router = express.Router();


const QUESTION_TTL_MS = 20_000;


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


function shuffledQuestion(question) {
  const entries = question.choices.map((choice, index) => ({ choice, correct: index === question.correctIndex }));
  for (let index = entries.length - 1; index > 0; index--) {
    const swap = crypto.randomInt(index + 1);
    [entries[index], entries[swap]] = [entries[swap], entries[index]];
  }
  return {
    prompt: question.question,
    image: question.image || null,
    choices: entries.map(entry => entry.choice),
    correctIndex: entries.findIndex(entry => entry.correct),
  };
}

function getSession(req, res) {
  const gameSession = sessions.get(String(req.body?.sessionId || ''));
  if (!gameSession || gameSession.owner !== ownerOf(req)) {
    res.status(404).json({ success: false, message: '遊戲答題連線已失效，請重新開始。' });
    return null;
  }
  if (gameSession.roomCode) {
    const room = rooms.get(gameSession.roomCode);
    if (!room || room.phase !== 'playing') {
      res.status(410).json({ success: false, message: '老師已結束這個課堂。' });
      return null;
    }
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

router.post('/question', (req, res) => {
  const gameSession = getSession(req, res);
  if (!gameSession) return;
  const now = Date.now();
  if (gameSession.active && !gameSession.active.used && gameSession.active.expiresAt > now) {
    const { token, prompt, image, choices, expiresAt, baseReward } = gameSession.active;
    return res.json({ success: true, question: { token, prompt, image, choices, expiresAt, baseReward } });
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
  const { token, prompt, image, choices, expiresAt, baseReward } = gameSession.active;
  res.json({ success: true, question: { token, prompt, image, choices, expiresAt, baseReward } });
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



module.exports = router;
