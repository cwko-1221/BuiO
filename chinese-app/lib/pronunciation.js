'use strict';

const { getJyutpingText } = require('to-jyutping');

let speechSdk;
let activeAzureRequests = 0;
const azureWaiters = [];

function sdk() {
  if (!speechSdk) speechSdk = require('microsoft-cognitiveservices-speech-sdk');
  return speechSdk;
}

function credentials() {
  return {
    key: String(process.env.AZURE_SPEECH_KEY || '').trim(),
    region: String(process.env.AZURE_SPEECH_REGION || '').trim(),
  };
}

function isConfigured() {
  const { key, region } = credentials();
  return !!(key && region);
}

function numericEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

function normalizeJyutping(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function jyutpingFor(value) {
  try { return normalizeJyutping(getJyutpingText(normalizeText(value))); }
  catch { return ''; }
}

function levenshtein(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1]
        ? previous[j - 1]
        : Math.min(previous[j - 1], previous[j], current[j - 1]) + 1;
    }
    for (let j = 0; j < current.length; j += 1) previous[j] = current[j];
  }
  return previous[b.length];
}

function similarity(a, b) {
  if (!a || !b) return 0;
  return Math.max(0, 1 - levenshtein(a, b) / Math.max(a.length, b.length));
}

function classifyAccuracy(score) {
  const passScore = numericEnv('AZURE_PRONUNCIATION_PASS_SCORE', 85);
  const retryScore = Math.min(passScore, numericEnv('AZURE_PRONUNCIATION_RETRY_SCORE', 65));
  if (!Number.isFinite(score)) return { status: 'inconclusive', correct: false, passScore, retryScore };
  if (score >= passScore) return { status: 'pass', correct: true, passScore, retryScore };
  if (score < retryScore) return { status: 'retry', correct: false, passScore, retryScore };
  return { status: 'inconclusive', correct: false, passScore, retryScore };
}

function finiteScore(value) {
  if (value === null || value === undefined || value === '') return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function lowerQuantile(values, ratio = 0.2) {
  const scores = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!scores.length) return null;
  return scores[Math.floor((scores.length - 1) * ratio)];
}

function strictScoreFromDetails({ accuracyScore, completenessScore, details }) {
  const words = (details?.Words || []).map(word => {
    const phonemes = (word.Phonemes || []).map(phoneme => ({
      phoneme: phoneme.Phoneme || '',
      accuracyScore: finiteScore(phoneme.PronunciationAssessment?.AccuracyScore),
    })).filter(phoneme => phoneme.accuracyScore !== null);
    return {
      word: word.Word || '',
      accuracyScore: finiteScore(word.PronunciationAssessment?.AccuracyScore),
      errorType: word.PronunciationAssessment?.ErrorType || 'None',
      phonemes,
    };
  });
  const wordScores = words.map(word => word.accuracyScore).filter(Number.isFinite);
  const phonemeScores = words.flatMap(word => word.phonemes.map(phoneme => phoneme.accuracyScore));
  const weakestWordScore = wordScores.length ? Math.min(...wordScores) : null;
  const lowerPhonemeScore = lowerQuantile(phonemeScores);
  const phonemeMeanScore = phonemeScores.length
    ? phonemeScores.reduce((sum, score) => sum + score, 0) / phonemeScores.length
    : null;
  const sortedPhonemeScores = [...phonemeScores].sort((a, b) => a - b);
  const lowerBandCount = Math.max(1, Math.ceil(sortedPhonemeScores.length / 3));
  const lowerBandScore = sortedPhonemeScores.length
    ? sortedPhonemeScores.slice(0, lowerBandCount).reduce((sum, score) => sum + score, 0) / lowerBandCount
    : null;
  const phonemeSimilarityScore = phonemeMeanScore === null || lowerBandScore === null
    ? null
    : phonemeMeanScore * 0.7 + lowerBandScore * 0.3;
  const wordMeanScore = wordScores.length
    ? wordScores.reduce((sum, score) => sum + score, 0) / wordScores.length
    : null;
  // Only the phoneme scores determine the displayed percentage. Full-text,
  // word, and completeness scores are retained for diagnostics because they
  // are aggregate signals and can swing between 0 and 100 on very short text.
  const strictScore = phonemeSimilarityScore;
  return {
    score: strictScore === null ? null : Math.round(strictScore * 10) / 10,
    words,
    diagnostics: {
      algorithm: 'content-gated-phoneme-similarity-v3',
      fullTextAccuracyScore: finiteScore(accuracyScore),
      completenessScore: finiteScore(completenessScore),
      weakestWordScore,
      lowerPhonemeScore,
      wordMeanScore,
      phonemeMeanScore,
      lowerBandScore,
      phonemeSimilarityScore: finiteScore(phonemeSimilarityScore),
      phonemeScores,
      hasPhonemeEvidence: phonemeScores.length > 0,
    },
  };
}

function compareRecognizedContent(recognition, expectedText, expectedJyutping = '') {
  const expected = normalizeText(expectedText);
  const transcript = normalizeText(recognition?.transcript);
  const confidence = finiteScore(recognition?.confidence);
  const expectedPronunciation = normalizeJyutping(expectedJyutping) || jyutpingFor(expected);
  const heardPronunciation = jyutpingFor(transcript);
  const pronunciationSimilarity = similarity(expectedPronunciation, heardPronunciation);
  const diagnostics = {
    expected,
    transcript,
    confidence,
    expectedJyutping: expectedPronunciation,
    transcriptJyutping: heardPronunciation,
    pronunciationSimilarity: Math.round(pronunciationSimilarity * 1000) / 1000,
  };

  if (!transcript) {
    return { status: 'inconclusive', ...diagnostics, message: '未能清楚辨識讀音，請再錄一次。' };
  }
  if (transcript === expected) return { status: 'matched', ...diagnostics };

  const nearThreshold = numericEnv('AZURE_CONTENT_NEAR_SIMILARITY', 0.7);
  if (pronunciationSimilarity >= nearThreshold) {
    return { status: 'phonetic-near', ...diagnostics };
  }

  const confidenceThreshold = numericEnv('AZURE_CONTENT_MIN_CONFIDENCE', 0.55);
  const wrongThreshold = numericEnv('AZURE_CONTENT_WRONG_SIMILARITY', 0.6);
  if (confidence !== null && confidence >= confidenceThreshold
      && pronunciationSimilarity <= wrongThreshold) {
    return {
      status: 'wrong-content',
      ...diagnostics,
      message: `系統聽到「${recognition.transcript}」，與題目「${expectedText}」的讀音不同。`,
    };
  }

  return { status: 'inconclusive', ...diagnostics, message: '辨識結果不穩定，今次不評分，請再錄一次。' };
}

function azureConcurrency() {
  return Math.max(1, Math.floor(numericEnv('AZURE_SPEECH_MAX_CONCURRENT', 1)));
}

function acquireAzureSlot() {
  if (activeAzureRequests < azureConcurrency()) {
    activeAzureRequests += 1;
    return Promise.resolve();
  }
  return new Promise(resolve => azureWaiters.push(resolve));
}

function releaseAzureSlot() {
  const next = azureWaiters.shift();
  if (next) next();
  else activeAzureRequests = Math.max(0, activeAzureRequests - 1);
}

async function withAzureSlot(task) {
  await acquireAzureSlot();
  try { return await task(); }
  finally { releaseAzureSlot(); }
}

function recognizeOnce(recognizer, transform) {
  const timeoutMs = Math.max(3000, numericEnv('AZURE_SPEECH_TIMEOUT_MS', 12000));
  return new Promise((resolve, reject) => {
    let settled = false;
    const close = () => { try { recognizer.close(); } catch {} };
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      close();
      callback(value);
    };
    const timer = setTimeout(() => {
      const error = new Error('Azure 語音服務等候逾時，請再試一次。');
      error.statusCode = 504;
      finish(reject, error);
    }, timeoutMs);
    recognizer.recognizeOnceAsync(result => {
      try { finish(resolve, transform(result)); }
      catch (error) {
        error.statusCode ||= 502;
        finish(reject, error);
      }
    }, message => {
      const error = new Error(message || 'Azure 語音服務連線失敗。');
      error.statusCode = 502;
      finish(reject, error);
    });
  });
}

function cancellationError(azure, result, fallback) {
  const details = azure.CancellationDetails.fromResult(result);
  const error = new Error(details.errorDetails || fallback);
  error.statusCode = 502;
  return error;
}

function detailedConfidence(azure, result) {
  const direct = finiteScore(result?.confidence);
  if (direct !== null) return direct;
  try {
    const property = azure.PropertyId?.SpeechServiceResponse_JsonResult;
    const raw = property && result.properties?.getProperty?.(property);
    const parsed = raw ? JSON.parse(raw) : null;
    return finiteScore(parsed?.NBest?.[0]?.Confidence);
  } catch { return null; }
}

function recognizeContent(audio, sdkOverride = null) {
  if (!audio?.length) return Promise.reject(new Error('錄音內容是空的，請重新錄音。'));
  if (!isConfigured()) {
    const error = new Error('Azure 粵語語音辨識尚未設定。');
    error.statusCode = 501;
    return Promise.reject(error);
  }
  const azure = sdkOverride || sdk();
  const { key, region } = credentials();
  const speechConfig = azure.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = 'zh-HK';
  speechConfig.outputFormat = azure.OutputFormat.Detailed;
  const audioConfig = azure.AudioConfig.fromWavFileInput(audio, 'recording.wav');
  const recognizer = new azure.SpeechRecognizer(speechConfig, audioConfig);
  return recognizeOnce(recognizer, result => {
    if (result.reason === azure.ResultReason.NoMatch) return { transcript: '', confidence: null };
    if (result.reason !== azure.ResultReason.RecognizedSpeech) {
      throw cancellationError(azure, result, 'Azure 內容辨識失敗。');
    }
    return { transcript: result.text || '', confidence: detailedConfidence(azure, result) };
  });
}

function assessPronunciation(audio, referenceText, sdkOverride = null) {
  if (!audio?.length) return Promise.reject(new Error('錄音內容是空的，請重新錄音。'));
  if (!String(referenceText || '').trim()) return Promise.reject(new Error('缺少發音評估參考文字。'));
  if (!isConfigured()) {
    const error = new Error('Azure 粵語發音評估尚未設定。');
    error.statusCode = 501;
    return Promise.reject(error);
  }

  const azure = sdkOverride || sdk();
  const { key, region } = credentials();
  const speechConfig = azure.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = 'zh-HK';
  speechConfig.outputFormat = azure.OutputFormat.Detailed;
  const audioConfig = azure.AudioConfig.fromWavFileInput(audio, 'recording.wav');
  const recognizer = new azure.SpeechRecognizer(speechConfig, audioConfig);
  const assessmentConfig = new azure.PronunciationAssessmentConfig(
    String(referenceText).trim(),
    azure.PronunciationAssessmentGradingSystem.HundredMark,
    azure.PronunciationAssessmentGranularity.Phoneme,
    true,
  );
  assessmentConfig.applyTo(recognizer);

  return recognizeOnce(recognizer, result => {
    if (result.reason === azure.ResultReason.NoMatch) {
      return {
        status: 'inconclusive', correct: false, score: null,
        transcript: '', provider: 'azure-phoneme-similarity-zh-HK-v3', words: [],
      };
    }
    if (result.reason !== azure.ResultReason.RecognizedSpeech) {
      throw cancellationError(azure, result, 'Azure 發音評估失敗。');
    }

    const assessment = azure.PronunciationAssessmentResult.fromResult(result);
    const accuracyScore = finiteScore(assessment.accuracyScore);
    const completenessScore = finiteScore(assessment.completenessScore);
    const details = assessment.detailResult || {};
    const strict = strictScoreFromDetails({ accuracyScore, completenessScore, details });
    const classification = strict.diagnostics.hasPhonemeEvidence
      ? classifyAccuracy(strict.score)
      : { ...classifyAccuracy(Number.NaN), message: '未取得音素層級分數，今次結果不會當作通過。' };
    return {
      ...classification,
      score: strict.score,
      accuracyScore,
      pronunciationScore: finiteScore(assessment.pronunciationScore),
      completenessScore,
      fluencyScore: finiteScore(assessment.fluencyScore),
      transcript: result.text || '',
      provider: 'azure-phoneme-similarity-zh-HK-v3',
      words: strict.words,
      diagnostics: strict.diagnostics,
    };
  });
}

async function evaluatePronunciation(audio, referenceText, expectedJyutping = '', sdkOverride = null) {
  const queuedAt = Date.now();
  return withAzureSlot(async () => {
    const queueWaitMs = Date.now() - queuedAt;
    const contentStartedAt = Date.now();
    const recognition = await recognizeContent(audio, sdkOverride);
    const contentRecognitionMs = Date.now() - contentStartedAt;
    const contentCheck = compareRecognizedContent(recognition, referenceText, expectedJyutping);
    const provider = 'azure-content-gated-phoneme-similarity-zh-HK-v3';

    if (contentCheck.status === 'wrong-content') {
      return {
        status: 'retry', correct: false, score: 0,
        transcript: recognition.transcript, provider, contentCheck,
        diagnostics: { algorithm: 'content-gate-v3', contentCheck },
        timing: { queueWaitMs, contentRecognitionMs, assessmentMs: 0 },
        message: contentCheck.message,
      };
    }
    if (contentCheck.status === 'inconclusive') {
      return {
        status: 'inconclusive', correct: false, score: null,
        transcript: recognition.transcript, provider, contentCheck,
        diagnostics: { algorithm: 'content-gate-v3', contentCheck },
        timing: { queueWaitMs, contentRecognitionMs, assessmentMs: 0 },
        message: contentCheck.message,
      };
    }

    const assessmentStartedAt = Date.now();
    const assessment = await assessPronunciation(audio, referenceText, sdkOverride);
    const assessmentMs = Date.now() - assessmentStartedAt;
    return {
      ...assessment,
      transcript: recognition.transcript,
      provider,
      contentCheck,
      diagnostics: {
        ...assessment.diagnostics,
        contentCheck,
        assessmentTranscript: assessment.transcript,
      },
      timing: { queueWaitMs, contentRecognitionMs, assessmentMs },
    };
  });
}

module.exports = {
  isConfigured,
  classifyAccuracy,
  strictScoreFromDetails,
  compareRecognizedContent,
  recognizeContent,
  assessPronunciation,
  evaluatePronunciation,
};
