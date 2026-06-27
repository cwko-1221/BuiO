'use strict';

const express = require('express');
const router = express.Router();

const { requireAuth } = require('../../math-app/middleware/auth');
const google = require('../../chinese-app/lib/google');

router.use(requireAuth);

function handle(res, err) {
  const status = err.statusCode || 500;
  if (status >= 500) console.error('[english/media]', err);
  res.status(status).json({ success: false, message: err.message || 'Server error' });
}

router.post('/tts', express.json(), async (req, res) => {
  if (!google.isGoogleConfigured()) {
    return res.status(501).json({ success: false, message: 'Google TTS 尚未設定。' });
  }
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ success: false, message: '缺少 text' });
    const audio = await google.synthesize(text, {
      languageCode: 'en-US',
      ssmlGender: 'FEMALE',
      speakingRate: 0.85,
    });
    res.set('Content-Type', 'audio/mpeg').send(audio);
  } catch (e) { handle(res, e); }
});

module.exports = router;
