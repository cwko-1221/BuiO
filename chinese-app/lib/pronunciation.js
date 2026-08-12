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

function jyutpingSyllables(value) {
  return String(value || '').toLowerCase().match(/[a-z]+[1-6]/g) || [];
}

function jyutpingForText(value) {
  try { return jyutpingSyllables(getJyutpingText(normalizeText(value))); }
  catch { return []; }
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

const JYUTPING_ONSETS = [
  'gw', 'kw', 'ng', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
  'g', 'k', 'h', 'w', 'z', 'c', 's', 'j',
];

const SIMILAR_ONSETS = [
  new Set(['b', 'p']), new Set(['d', 't']), new Set(['g', 'k']),
  new Set(['gw', 'kw']), new Set(['z', 'c', 's']), new Set(['n', 'l']),
];

function splitJyutpingSyllable(value) {
  const match = String(value || '').toLowerCase().match(/^([a-z]+)([1-6])$/);
  if (!match) return null;
  const body = match[1];
  const onset = JYUTPING_ONSETS.find(candidate => body.startsWith(candidate)) || '';
  return { syllable: match[0], onset, final: body.slice(onset.length), tone: match[2] };
}

function onsetSimilarity(a, b) {
  if (a === b) return 1;
  if (!a || !b) return 0;
  return SIMILAR_ONSETS.some(group => group.has(a) && group.has(b)) ? 0.5 : 0;
}

function toneSimilarity(a, b) {
  if (a === b) return 1;
  if ((a === '2' && b === '5') || (a === '5' && b === '2')) return 0.5;
  if ((a === '4' && b === '6') || (a === '6' && b === '4')) return 0.5;
  if (new Set([a, b]).size === 2 && ['1', '3', '6'].includes(a) && ['1', '3', '6'].includes(b)) return 0.25;
  return 0;
}

function syllableSimilarity(expected, heard) {
  const a = splitJyutpingSyllable(expected);
  const b = splitJyutpingSyllable(heard);
  if (!a || !b) return 0;
  const finalSimilarity = similarity(a.final, b.final);
  return onsetSimilarity(a.onset, b.onset) * 0.3
    + finalSimilarity * 0.45
    + toneSimilarity(a.tone, b.tone) * 0.25;
}

function alignJyutping(expected, heard) {
  const rows = expected.length + 1;
  const columns = heard.length + 1;
  const costs = Array.from({ length: rows }, () => Array(columns).fill(0));
  const paths = Array.from({ length: rows }, () => Array(columns).fill(null));
  for (let i = 1; i < rows; i += 1) {
    costs[i][0] = i;
    paths[i][0] = 'delete';
  }
  for (let j = 1; j < columns; j += 1) {
    costs[0][j] = j;
    paths[0][j] = 'insert';
  }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const choices = [
        { cost: costs[i - 1][j - 1] + 1 - syllableSimilarity(expected[i - 1], heard[j - 1]), path: 'match' },
        { cost: costs[i - 1][j] + 1, path: 'delete' },
        { cost: costs[i][j - 1] + 1, path: 'insert' },
      ].sort((left, right) => left.cost - right.cost);
      costs[i][j] = choices[0].cost;
      paths[i][j] = choices[0].path;
    }
  }

  const alignment = [];
  let i = expected.length;
  let j = heard.length;
  while (i > 0 || j > 0) {
    const path = paths[i][j];
    if (path === 'match') {
      const score = syllableSimilarity(expected[i - 1], heard[j - 1]);
      alignment.unshift({ expected: expected[i - 1], heard: heard[j - 1], score: Math.round(score * 1000) / 10 });
      i -= 1;
      j -= 1;
    } else if (path === 'delete') {
      alignment.unshift({ expected: expected[i - 1], heard: null, score: 0 });
      i -= 1;
    } else {
      alignment.unshift({ expected: null, heard: heard[j - 1], score: 0 });
      j -= 1;
    }
  }
  const length = Math.max(expected.length, heard.length, 1);
  const score = Math.max(0, (1 - costs[expected.length][heard.length] / length) * 100);
  return { score: Math.round(score * 10) / 10, alignment };
}

function scoreCantonesePronunciation(expectedJyutping, heardJyutping) {
  const expected = Array.isArray(expectedJyutping) ? expectedJyutping : jyutpingSyllables(expectedJyutping);
  const heard = Array.isArray(heardJyutping) ? heardJyutping : jyutpingSyllables(heardJyutping);
  if (!expected.length || !heard.length) return { score: null, expected, heard, alignment: [] };
  return { ...alignJyutping(expected, heard), expected, heard };
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
      algorithm: 'azure-scripted-phoneme-evidence-v4',
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
  const expectedPronunciation = jyutpingSyllables(expectedJyutping);
  const expectedSyllables = expectedPronunciation.length ? expectedPronunciation : jyutpingForText(expected);
  const candidates = (Array.isArray(recognition?.candidates) && recognition.candidates.length
    ? recognition.candidates
    : [{ transcript: recognition?.transcript || '', confidence: recognition?.confidence }])
    .map(candidate => {
      const transcript = normalizeText(candidate.transcript);
      const heardSyllables = jyutpingForText(transcript);
      const comparison = scoreCantonesePronunciation(expectedSyllables, heardSyllables);
      return {
        transcript,
        confidence: finiteScore(candidate.confidence),
        jyutping: heardSyllables.join(' '),
        pronunciationScore: comparison.score,
        alignment: comparison.alignment,
      };
    });
  const top = candidates[0];
  const diagnostics = {
    expected,
    transcript: top?.transcript || '',
    confidence: top?.confidence ?? null,
    expectedJyutping: expectedSyllables.join(' '),
    transcriptJyutping: top?.jyutping || '',
    pronunciationScore: top?.pronunciationScore ?? null,
    alignment: top?.alignment || [],
    candidates,
  };

  if (!expectedSyllables.length) {
    return { status: 'inconclusive', ...diagnostics, message: '題目的粵拼資料不完整，今次不評分。' };
  }
  if (!top?.transcript || !Number.isFinite(top.pronunciationScore)) {
    return { status: 'inconclusive', ...diagnostics, message: '未能清楚辨識讀音，請再錄一次。' };
  }
  const minimumConfidence = numericEnv('AZURE_CONTENT_MIN_SCORING_CONFIDENCE', 0.35);
  if (top.confidence !== null && top.confidence < minimumConfidence) {
    return { status: 'inconclusive', ...diagnostics, message: '辨識信心太低，今次不評分，請在較近咪高峰的位置再錄。' };
  }
  if (top.transcript === expected) return { status: 'matched', ...diagnostics };

  const confidenceThreshold = numericEnv('AZURE_CONTENT_MIN_CONFIDENCE', 0.55);
  const wrongThreshold = numericEnv('AZURE_CONTENT_WRONG_SCORE', 65);
  if (top.confidence !== null && top.confidence >= confidenceThreshold
      && top.pronunciationScore < wrongThreshold) {
    return {
      status: 'wrong-content',
      ...diagnostics,
      message: `系統聽到「${top.transcript}」，與當前題目「${expectedText}」的讀音不同。`,
    };
  }

  return {
    status: 'phonetic-near',
    ...diagnostics,
    message: `系統聽到「${top.transcript}」，已按它與「${expectedText}」的粵拼差異扣分。`,
  };
}

function combinePronunciationEvidence(assessmentScore, contentCheck) {
  const acousticScore = finiteScore(assessmentScore);
  const recognizedPronunciationScore = finiteScore(contentCheck?.pronunciationScore);
  if (acousticScore === null || recognizedPronunciationScore === null) {
    return { score: null, acousticScore, recognizedPronunciationScore, maximumScore: null };
  }
  // zh-HK returns an accuracy score for each expected phoneme, but it does not
  // expose which phoneme was actually spoken. Independent reference-free STT
  // supplies that missing evidence. The result may never exceed either signal.
  const maximumScore = Math.min(100, Math.max(0, numericEnv('AZURE_PRONUNCIATION_MAX_SCORE', 98)));
  const score = Math.min(acousticScore, recognizedPronunciationScore, maximumScore);
  return {
    score: Math.round(score * 10) / 10,
    acousticScore,
    recognizedPronunciationScore,
    maximumScore,
  };
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

function detailedRecognition(azure, result) {
  const fallback = {
    transcript: result?.text || '',
    confidence: finiteScore(result?.confidence),
  };
  try {
    const property = azure.PropertyId?.SpeechServiceResponse_JsonResult;
    const raw = property && result.properties?.getProperty?.(property);
    const parsed = raw ? JSON.parse(raw) : null;
    const candidates = (parsed?.NBest || []).map(candidate => ({
      transcript: candidate.Display || candidate.Lexical || candidate.ITN || '',
      confidence: finiteScore(candidate.Confidence),
    })).filter(candidate => candidate.transcript);
    if (candidates.length) return { ...candidates[0], candidates };
  } catch {}
  return { ...fallback, candidates: fallback.transcript ? [fallback] : [] };
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
    if (result.reason === azure.ResultReason.NoMatch) return { transcript: '', confidence: null, candidates: [] };
    if (result.reason !== azure.ResultReason.RecognizedSpeech) {
      throw cancellationError(azure, result, 'Azure 內容辨識失敗。');
    }
    return detailedRecognition(azure, result);
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
        transcript: '', provider: 'azure-scripted-phoneme-zh-HK-v4', words: [],
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
      provider: 'azure-scripted-phoneme-zh-HK-v4',
      words: strict.words,
      diagnostics: strict.diagnostics,
    };
  });
}

async function evaluatePronunciation(
  audio,
  referenceText,
  expectedJyutping = '',
  sdkOverride = null,
  referenceContext = {},
) {
  const queuedAt = Date.now();
  return withAzureSlot(async () => {
    const queueWaitMs = Date.now() - queuedAt;
    const contentStartedAt = Date.now();
    const recognition = await recognizeContent(audio, sdkOverride);
    const contentRecognitionMs = Date.now() - contentStartedAt;
    const contentCheck = compareRecognizedContent(recognition, referenceText, expectedJyutping);
    const provider = 'azure-current-item-cantonese-phonetic-v4';
    const reference = {
      assignmentId: referenceContext.assignmentId || null,
      itemId: referenceContext.itemId || null,
      text: String(referenceText || '').trim(),
      jyutping: contentCheck.expectedJyutping,
    };

    if (contentCheck.status === 'wrong-content') {
      const classification = classifyAccuracy(contentCheck.pronunciationScore);
      return {
        ...classification,
        score: contentCheck.pronunciationScore,
        transcript: recognition.transcript, provider, contentCheck,
        diagnostics: { algorithm: 'current-item-phonetic-comparison-v4', reference, contentCheck },
        timing: { queueWaitMs, contentRecognitionMs, assessmentMs: 0 },
        message: contentCheck.message,
      };
    }
    if (contentCheck.status === 'inconclusive') {
      return {
        status: 'inconclusive', correct: false, score: null,
        transcript: recognition.transcript, provider, contentCheck,
        diagnostics: { algorithm: 'current-item-phonetic-comparison-v4', reference, contentCheck },
        timing: { queueWaitMs, contentRecognitionMs, assessmentMs: 0 },
        message: contentCheck.message,
      };
    }

    const assessmentStartedAt = Date.now();
    const assessment = await assessPronunciation(audio, referenceText, sdkOverride);
    const assessmentMs = Date.now() - assessmentStartedAt;
    const combined = combinePronunciationEvidence(assessment.score, contentCheck);
    const classification = classifyAccuracy(combined.score);
    return {
      ...assessment,
      ...classification,
      score: combined.score,
      transcript: recognition.transcript,
      provider,
      contentCheck,
      diagnostics: {
        ...assessment.diagnostics,
        algorithm: 'azure-current-item-cantonese-phonetic-v4',
        reference,
        contentCheck,
        combined,
        assessmentTranscript: assessment.transcript,
      },
      timing: { queueWaitMs, contentRecognitionMs, assessmentMs },
      message: contentCheck.status === 'phonetic-near' ? contentCheck.message : assessment.message,
    };
  });
}

module.exports = {
  isConfigured,
  classifyAccuracy,
  scoreCantonesePronunciation,
  strictScoreFromDetails,
  compareRecognizedContent,
  combinePronunciationEvidence,
  recognizeContent,
  assessPronunciation,
  evaluatePronunciation,
};
