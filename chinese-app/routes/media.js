'use strict';

const express = require('express');
const multer = require('multer');
const router = express.Router();

const { requireAuth } = require('../../math-app/middleware/auth');
const google = require('../lib/google');
const pronunciation = require('../lib/pronunciation');
const { analyzeWavQuality } = require('../lib/audioQuality');
const storage = require('../lib/storage');
const assignments = require('../repositories/assignments.repo');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.use(requireAuth);

function handle(res, err, fallbackStatus = 500) {
  const status = err.statusCode || fallbackStatus;
  if (status >= 500) console.error('[chinese/media]', err);
  res.status(status).json({ success: false, message: err.message || 'Server error' });
}

router.post('/tts', async (req, res) => {
  if (!google.isGoogleConfigured()) {
    return res.status(501).json({ success: false, message: 'Google TTS 尚未設定。' });
  }
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ success: false, message: '缺少 text' });
    const audio = await google.synthesizeCantonese(text);
    res.set('Content-Type', 'audio/mpeg').send(audio);
  } catch (e) { handle(res, e); }
});

async function assessPronunciation(req, res) {
  if (!pronunciation.isConfigured()) {
    return res.status(501).json({ success: false, message: 'Azure 粵語發音評估尚未設定。' });
  }
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '缺少音檔' });
    const assignmentId = String(req.body?.assignmentId || '');
    const itemId = String(req.body?.itemId || '');
    if (!assignmentId || !itemId) return res.status(400).json({ success: false, message: '缺少作業或題目資料' });
    if (!await assignments.studentHasAccess({ assignmentId, studentId: req.session.studentId })) {
      return res.status(404).json({ success: false, message: '找不到作業' });
    }
    const assignment = await assignments.getOne({ assignmentId });
    const item = assignment?.items?.find(candidate => String(candidate.id) === itemId);
    if (!item) return res.status(404).json({ success: false, message: '找不到題目' });
    const expected = String(item.traditionalText || '').trim();

    const quality = analyzeWavQuality(req.file.buffer);
    if (!quality.ok) {
      return res.json({
        success: true,
        status: 'inconclusive',
        correct: false,
        score: null,
        transcript: '',
        provider: 'audio-quality-gate',
        quality,
        message: quality.message,
      });
    }

    const out = await pronunciation.assessPronunciation(req.file.buffer, expected);
    res.json({ success: true, ...out, quality });
  } catch (e) { handle(res, e, 400); }
}

router.post('/pronunciation', upload.single('audio'), assessPronunciation);

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!storage.isStorageConfigured()) {
      return res.status(501).json({ success: false, message: 'Supabase Storage 尚未設定。' });
    }
    if (!req.file) return res.status(400).json({ success: false, message: '缺少 file' });
    const assignmentId = String(req.body?.assignmentId || '');
    const itemId = String(req.body?.itemId || '');
    const phase = String(req.body?.phase || 'practice');
    if (!assignmentId || !itemId) {
      return res.status(400).json({ success: false, message: '缺少 assignmentId 或 itemId' });
    }
    const out = await storage.uploadRecording({
      studentId: req.session.studentId,
      assignmentId, itemId, phase,
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
    });
    res.json({ success: true, ...out });
  } catch (e) { handle(res, e, 400); }
});

module.exports = router;
