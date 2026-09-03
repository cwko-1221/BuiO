'use strict';

const express = require('express');
const router = express.Router();
const { requireAuth, requireTeacher } = require('../../math-app/middleware/auth');
const academicYears = require('../../math-app/repositories/academic-years.repo');
const progress = require('../repositories/progress.repo');
const accentSettings = require('../repositories/accent-settings.repo');
const { getWord, publicCatalog } = require('../data/curriculum');
const google = require('../../chinese-app/lib/google');
const { buildAudioSpec } = require('../lib/audio-spec');

const ttsCache = new Map();
const MAX_TTS_CACHE_ENTRIES = 1024;

router.use(requireAuth);

router.get('/meta', async (req, res, next) => {
  try {
    res.json({
      success: true,
      currentAcademicYear: await academicYears.getCurrentAcademicYear(),
      academicYears: await academicYears.listAcademicYears(),
      role: req.session.role,
    });
  } catch (error) { next(error); }
});

router.get('/catalog', async (req, res, next) => {
  try {
    const academicYear = await academicYears.getCurrentAcademicYear();
    let className = '';
    let previewAccent = '';
    if (req.session.role !== 'teacher') {
      className = (await academicYears.findEnrollment(academicYear, req.session.studentId))?.className || '';
    } else {
      if (req.query.className) className = String(req.query.className).trim();
      const requestedAccent = String(req.query.accent || '').toLowerCase();
      if (Object.hasOwn(accentSettings.ACCENTS, requestedAccent)) previewAccent = requestedAccent;
    }
    const accent = previewAccent || (className
      ? await accentSettings.getClassAccent(academicYear, className)
      : accentSettings.DEFAULT_ACCENT);
    res.json({
      success: true,
      academicYear,
      className,
      accent,
      accentLabel: accentSettings.ACCENTS[accent],
      audioApproved: true,
      audioProvider: 'google-cloud-tts',
      ttsAvailable: google.isGoogleConfigured(),
      isTeacherPreview: Boolean(previewAccent),
      levels: publicCatalog(accent),
    });
  } catch (error) { next(error); }
});

router.post('/tts', async (req, res, next) => {
  if (!google.isGoogleConfigured()) {
    return res.status(501).json({ success: false, message: 'Google TTS 尚未設定。' });
  }
  try {
    const academicYear = await academicYears.getCurrentAcademicYear();
    const isPreview = req.body?.preview === true;
    let accent;
    let audioSpec;
    let cacheId;

    if (isPreview) {
      if (req.session.role !== 'teacher') {
        return res.status(403).json({ success: false, message: '只有老師可以預覽口音。' });
      }
      const requestedAccent = String(req.body?.accent || '').toLowerCase();
      accent = Object.hasOwn(accentSettings.ACCENTS, requestedAccent)
        ? requestedAccent
        : accentSettings.DEFAULT_ACCENT;
      audioSpec = { text: 'Rain falls on a red car by the hot water.', speakingRate: 0.9, audioType: 'preview' };
      cacheId = 'teacher-preview';
    } else {
      const entry = getWord(req.body?.wordId);
      if (!entry) {
        return res.status(400).json({ success: false, message: '無效的 Phonics 單字。' });
      }
      if (req.session.role === 'teacher') {
        const requestedAccent = String(req.body?.accent || '').toLowerCase();
        accent = Object.hasOwn(accentSettings.ACCENTS, requestedAccent)
          ? requestedAccent
          : accentSettings.DEFAULT_ACCENT;
      } else {
        const enrollment = await academicYears.findEnrollment(academicYear, req.session.studentId);
        accent = enrollment?.className
          ? await accentSettings.getClassAccent(academicYear, enrollment.className)
          : accentSettings.DEFAULT_ACCENT;
      }
      try {
        audioSpec = buildAudioSpec(entry, accent, req.body);
      } catch (error) {
        if (error.statusCode === 400) return res.status(400).json({ success: false, message: error.message });
        throw error;
      }
      cacheId = audioSpec.cacheId;
    }

    const cacheKey = `${accent}:${cacheId}`;
    let audio = ttsCache.get(cacheKey);
    if (!audio) {
      const options = {
        languageCode: accent === 'en-us' ? 'en-US' : 'en-GB',
        ssmlGender: 'FEMALE',
        speakingRate: audioSpec.speakingRate,
      };
      audio = audioSpec.ssml
        ? google.synthesizeSsml(audioSpec.ssml, options)
        : google.synthesize(audioSpec.text, options);
      ttsCache.set(cacheKey, audio);
      if (ttsCache.size > MAX_TTS_CACHE_ENTRIES) ttsCache.delete(ttsCache.keys().next().value);
    }
    try {
      audio = await audio;
      ttsCache.set(cacheKey, audio);
    } catch (error) {
      ttsCache.delete(cacheKey);
      throw error;
    }
    res.set({
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'private, max-age=86400',
      'X-Phonics-Accent': accent,
      'X-Phonics-Audio-Type': audioSpec.audioType,
    }).send(audio);
  } catch (error) { next(error); }
});

router.get('/progress', async (req, res, next) => {
  try {
    const academicYear = await academicYears.getCurrentAcademicYear();
    res.json({
      success: true, academicYear,
      progress: await progress.studentProgress({ academicYear, studentId: req.session.studentId }),
    });
  } catch (error) { next(error); }
});

router.post('/attempts', async (req, res, next) => {
  if (req.session.role === 'teacher') {
    return res.status(403).json({ success: false, message: '教師預覽不會寫入學生進度' });
  }
  try {
    const entry = getWord(req.body?.wordId);
    if (!entry) return res.status(400).json({ success: false, message: '找不到這個 Phonics 單字' });
    const assembled = Array.isArray(req.body?.assembled) ? req.body.assembled.map(String) : [];
    const expected = entry.segments.map(item => item.text);
    const correct = assembled.length === expected.length && expected.every((item, index) => item === assembled[index]);
    const academicYear = await academicYears.getCurrentAcademicYear();
    const attempt = await progress.recordAttempt({
      academicYear, studentId: req.session.studentId, wordId: entry.id, correct,
      mistakes: req.body?.mistakes, elapsedMs: req.body?.elapsedMs,
    });
    res.status(201).json({ success: true, correct, attempt });
  } catch (error) { next(error); }
});

router.get('/teacher/summary', requireTeacher, async (req, res, next) => {
  try {
    const years = await academicYears.listAcademicYears();
    const academicYear = String(req.query.academicYear || await academicYears.getCurrentAcademicYear());
    if (!years.includes(academicYear)) return res.status(400).json({ success: false, message: '學年不存在' });
    const className = String(req.query.className || '').trim();
    const students = await progress.teacherSummary({ academicYear, className });
    const classes = [...new Set((await academicYears.listEnrollments(academicYear))
      .filter(row => row.role !== 'teacher' && row.className)
      .map(row => row.className))].sort();
    const settings = await accentSettings.listClassAccents(academicYear);
    const classAccents = Object.fromEntries(classes.map(item => [
      item,
      settings.find(setting => setting.className === item)?.accent || accentSettings.DEFAULT_ACCENT,
    ]));
    res.json({
      success: true, academicYear, academicYears: years, classes, students,
      accents: accentSettings.ACCENTS,
      defaultAccent: accentSettings.DEFAULT_ACCENT,
      classAccents,
    });
  } catch (error) { next(error); }
});

router.put('/teacher/accent', requireTeacher, async (req, res, next) => {
  try {
    const academicYear = String(req.body?.academicYear || '').trim();
    const className = String(req.body?.className || '').trim();
    const accent = String(req.body?.accent || '').toLowerCase();
    const years = await academicYears.listAcademicYears();
    if (!years.includes(academicYear)) {
      return res.status(400).json({ success: false, message: '學年無效' });
    }
    const classes = new Set((await academicYears.listEnrollments(academicYear))
      .filter(row => row.role !== 'teacher' && row.className)
      .map(row => row.className));
    if (!classes.has(className)) {
      return res.status(400).json({ success: false, message: '班級無效' });
    }
    if (!Object.hasOwn(accentSettings.ACCENTS, accent)) {
      return res.status(400).json({ success: false, message: '只可選擇英式或美式英語' });
    }
    const setting = await accentSettings.setClassAccent({
      academicYear, className, accent, updatedBy: req.session.studentId,
    });
    res.json({ success: true, setting, accentLabel: accentSettings.ACCENTS[setting.accent] });
  } catch (error) { next(error); }
});

module.exports = router;
