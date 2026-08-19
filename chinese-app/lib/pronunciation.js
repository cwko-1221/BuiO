'use strict';

const { getJyutpingCandidates } = require('to-jyutping');
const { analyzeTones } = require('./toneAnalysis');

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

function booleanEnv(name, fallback) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw);
}

function ratioEnv(name, fallback) {
  return Math.min(1, Math.max(0, numericEnv(name, fallback)));
}

function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

const SYLLABLE_PATTERN = /^[a-z]+[1-6]$/;

function jyutpingSyllables(value) {
  return String(value || '').toLowerCase().match(/[a-z]+[1-6]/g) || [];
}

// A "unit" is one scorable character plus every Jyutping reading the dictionary
// allows for it. Carrying all readings instead of one canonical reading is what
// stops 你 (nei5/lei5) or 好 (hou2/hou3) from being marked wrong just because
// the dictionary and the child picked different valid readings.
function jyutpingUnits(value) {
  try {
    return getJyutpingCandidates(normalizeText(value))
      .map(([character, readings]) => ({
        character,
        readings: (readings || [])
          .map(reading => String(reading).toLowerCase())
          .filter(reading => SYLLABLE_PATTERN.test(reading)),
      }))
      .filter(unit => unit.readings.length);
  } catch { return []; }
}

function unitsFromSyllables(syllables) {
  return syllables.map(syllable => ({ character: '', readings: [syllable] }));
}

function primaryReadings(units) {
  return units.map(unit => unit.readings[0]);
}

function unitsText(units) {
  return units.map(unit => unit.character).join('');
}

// The teacher's Jyutping stays authoritative, but the dictionary's other
// readings for the same character are accepted alongside it.
function expectedUnits(expectedText, expectedJyutping) {
  const given = jyutpingSyllables(expectedJyutping);
  const fromText = jyutpingUnits(expectedText);
  if (given.length && given.length === fromText.length) {
    return fromText.map((unit, index) => ({
      character: unit.character,
      readings: Array.from(new Set([given[index], ...unit.readings])),
    }));
  }
  if (given.length) return unitsFromSyllables(given);
  return fromText;
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
  new Set(['ng', '']), new Set(['w', 'm']),
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
  return SIMILAR_ONSETS.some(group => group.has(a) && group.has(b)) ? 0.5 : 0;
}

function toneSimilarity(a, b) {
  if (a === b) return 1;
  if ((a === '2' && b === '5') || (a === '5' && b === '2')) return 0.5;
  if ((a === '4' && b === '6') || (a === '6' && b === '4')) return 0.5;
  if (new Set([a, b]).size === 2 && ['1', '3', '6'].includes(a) && ['1', '3', '6'].includes(b)) return 0.25;
  return 0;
}

// Tone carries more of a syllable than either half of the sound it rides on,
// because in Cantonese it is the part that changes the word. The weights are
// normalised, so a teacher can raise the tone share without having to work out
// what the other two should become.
function syllableWeights() {
  const onset = Math.max(0, numericEnv('AZURE_PRONUNCIATION_ONSET_WEIGHT', 0.25));
  const rhyme = Math.max(0, numericEnv('AZURE_PRONUNCIATION_FINAL_WEIGHT', 0.35));
  const tone = Math.max(0, numericEnv('AZURE_PRONUNCIATION_TONE_WEIGHT', 0.4));
  const total = onset + rhyme + tone;
  if (!total) return { onset: 0.25, rhyme: 0.35, tone: 0.4 };
  return { onset: onset / total, rhyme: rhyme / total, tone: tone / total };
}

function syllableSimilarity(expected, heard) {
  const a = splitJyutpingSyllable(expected);
  const b = splitJyutpingSyllable(heard);
  if (!a || !b) return 0;
  const weights = syllableWeights();
  const segmentalWeight = weights.onset + weights.rhyme;
  const toneScore = toneSimilarity(a.tone, b.tone);
  if (!segmentalWeight) return toneScore;
  const segmental = (onsetSimilarity(a.onset, b.onset) * weights.onset
    + similarity(a.final, b.final) * weights.rhyme) / segmentalWeight;
  // Tone scales the sounds it rides on rather than being added beside them.
  // Cantonese has six tones and they collide constantly, so landing the tone of
  // a completely different word must earn nothing: 你好 and 企鵝 share both
  // tones, and adding tone alongside the sounds scored that pair 66 instead of
  // the 44 it deserves.
  return segmental * (1 - weights.tone + weights.tone * toneScore);
}

// Best pairing across every allowed reading of the expected and heard character.
function unitSimilarity(expectedReadings, heardReadings) {
  let best = { score: 0, expected: expectedReadings[0] || null, heard: heardReadings[0] || null };
  for (const expected of expectedReadings) {
    for (const heard of heardReadings) {
      const score = syllableSimilarity(expected, heard);
      if (score > best.score) best = { score, expected, heard };
      if (best.score === 1) return best;
    }
  }
  return best;
}

function alignUnits(expected, heard) {
  const rows = expected.length + 1;
  const columns = heard.length + 1;
  const pairs = expected.map(expectedUnit =>
    heard.map(heardUnit => unitSimilarity(expectedUnit.readings, heardUnit.readings)));
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
        { cost: costs[i - 1][j - 1] + 1 - pairs[i - 1][j - 1].score, path: 'match' },
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
      const pair = pairs[i - 1][j - 1];
      alignment.unshift({
        expected: pair.expected,
        heard: pair.heard,
        score: Math.round(pair.score * 1000) / 10,
      });
      i -= 1;
      j -= 1;
    } else if (path === 'delete') {
      alignment.unshift({ expected: expected[i - 1].readings[0], heard: null, score: 0 });
      i -= 1;
    } else {
      alignment.unshift({ expected: null, heard: heard[j - 1].readings[0], score: 0 });
      j -= 1;
    }
  }
  const length = Math.max(expected.length, heard.length, 1);
  const score = Math.max(0, (1 - costs[expected.length][heard.length] / length) * 100);
  return { score: Math.round(score * 10) / 10, alignment };
}

// Classroom recordings pick up neighbours, chairs, and the teacher. Instead of
// scoring the whole transcript, find the stretch of syllables that best matches
// the question and score only that, so 你好 heard inside 旱上料刷你好料刺尹料 is
// scored as 你好. A window shorter than the question is still normalised against
// the expected length, so leaving out a syllable stays a real deduction.
function extractBestWindow(expected, heard) {
  if (!expected.length || !heard.length) return null;
  const best = { ...alignUnits(expected, heard), start: 0, end: heard.length };
  if (heard.length <= expected.length) return best;
  const minimumLength = Math.max(1, expected.length - 1);
  const maximumLength = Math.min(heard.length, expected.length + 2);
  for (let length = minimumLength; length <= maximumLength; length += 1) {
    for (let start = 0; start + length <= heard.length; start += 1) {
      if (start === 0 && length === heard.length) continue;
      const window = alignUnits(expected, heard.slice(start, start + length));
      if (window.score > best.score) {
        best.score = window.score;
        best.alignment = window.alignment;
        best.start = start;
        best.end = start + length;
      }
    }
  }
  return best;
}

function scoreCantonesePronunciation(expectedJyutping, heardJyutping) {
  const expected = Array.isArray(expectedJyutping) ? expectedJyutping : jyutpingSyllables(expectedJyutping);
  const heard = Array.isArray(heardJyutping) ? heardJyutping : jyutpingSyllables(heardJyutping);
  if (!expected.length || !heard.length) return { score: null, expected, heard, alignment: [] };
  return { ...alignUnits(unitsFromSyllables(expected), unitsFromSyllables(heard)), expected, heard };
}

function classifyAccuracy(score) {
  const passScore = numericEnv('AZURE_PRONUNCIATION_PASS_SCORE', 70);
  const retryScore = Math.min(passScore, numericEnv('AZURE_PRONUNCIATION_RETRY_SCORE', 70));
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
      spoken: (phoneme.PronunciationAssessment?.NBestPhonemes || []).map(candidate => ({
        phoneme: candidate.Phoneme || '',
        score: finiteScore(candidate.Score),
      })),
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
  // The weakest third still pulls the score down so one bad sound stays visible,
  // but at a weight that no longer sinks an otherwise accurate reading.
  const lowerBandWeight = ratioEnv('AZURE_PRONUNCIATION_LOWER_BAND_WEIGHT', 0.15);
  const phonemeSimilarityScore = phonemeMeanScore === null || lowerBandScore === null
    ? null
    : phonemeMeanScore * (1 - lowerBandWeight) + lowerBandScore * lowerBandWeight;
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
      algorithm: 'azure-scripted-phoneme-evidence-v5',
      fullTextAccuracyScore: finiteScore(accuracyScore),
      completenessScore: finiteScore(completenessScore),
      weakestWordScore,
      lowerPhonemeScore,
      wordMeanScore,
      phonemeMeanScore,
      lowerBandScore,
      lowerBandWeight,
      phonemeSimilarityScore: finiteScore(phonemeSimilarityScore),
      phonemeScores,
      hasPhonemeEvidence: phonemeScores.length > 0,
      spokenPhonemes: words.flatMap(word => word.phonemes.map(phoneme => ({
        expected: phoneme.phoneme,
        heard: phoneme.spoken.map(candidate => `${candidate.phoneme}:${candidate.score}`).join(' '),
      }))).filter(entry => entry.heard),
    },
  };
}

function compareRecognizedContent(recognition, expectedText, expectedJyutping = '') {
  const expected = normalizeText(expectedText);
  const expectedList = expectedUnits(expectedText, expectedJyutping);
  const maximumHeardUnits = Math.max(8, numericEnv('AZURE_CONTENT_MAX_HEARD_UNITS', 48));
  const candidates = (Array.isArray(recognition?.candidates) && recognition.candidates.length
    ? recognition.candidates
    : [{ transcript: recognition?.transcript || '', confidence: recognition?.confidence }])
    .map(candidate => {
      const transcript = normalizeText(candidate.transcript);
      const heardUnits = jyutpingUnits(transcript).slice(0, maximumHeardUnits);
      const window = extractBestWindow(expectedList, heardUnits);
      const extracted = window ? heardUnits.slice(window.start, window.end) : [];
      const trimmed = !!window && (window.start > 0 || window.end < heardUnits.length);
      return {
        transcript,
        confidence: finiteScore(candidate.confidence),
        jyutping: primaryReadings(heardUnits).join(' '),
        containsExpected: !!expected && !!transcript && transcript.includes(expected),
        extractedText: unitsText(extracted),
        extractedJyutping: primaryReadings(extracted).join(' '),
        extractedFrom: trimmed
          ? { start: window.start, end: window.end, heardUnits: heardUnits.length }
          : null,
        pronunciationScore: window ? window.score : null,
        alignment: window ? window.alignment : [],
      };
    });
  const top = candidates[0];
  const diagnostics = {
    expected,
    transcript: top?.transcript || '',
    confidence: top?.confidence ?? null,
    expectedJyutping: primaryReadings(expectedList).join(' '),
    transcriptJyutping: top?.jyutping || '',
    extractedText: top?.extractedText || '',
    extractedJyutping: top?.extractedJyutping || '',
    extractedFrom: top?.extractedFrom || null,
    pronunciationScore: top?.pronunciationScore ?? null,
    alignment: top?.alignment || [],
    candidates,
  };

  if (!expectedList.length) {
    return { status: 'inconclusive', ...diagnostics, message: '題目的粵拼資料不完整，今次不評分。' };
  }
  if (!top?.transcript || !Number.isFinite(top.pronunciationScore)) {
    return { status: 'inconclusive', ...diagnostics, message: '未能清楚辨識讀音，請再錄一次。' };
  }
  // A transcript that literally contains the question is direct evidence the
  // child said the right words, whatever else the microphone picked up.
  if (top.containsExpected) {
    return {
      status: 'matched',
      ...diagnostics,
      message: top.extractedFrom ? `錄音夾雜其他聲音，系統只抽取「${expectedText}」評分。` : '',
    };
  }
  const closeEnoughScore = numericEnv('AZURE_CONTENT_CLOSE_ENOUGH_SCORE', 95);
  const incomplete = !!top.extractedText
    && top.extractedText.length < expected.length
    && expected.includes(top.extractedText);
  const minimumConfidence = ratioEnv('AZURE_CONTENT_MIN_SCORING_CONFIDENCE', 0.2);
  if (top.confidence !== null && top.confidence < minimumConfidence) {
    return { status: 'inconclusive', ...diagnostics, message: '辨識信心太低，今次不評分，請在較近咪高峰的位置再錄。' };
  }

  const confidenceThreshold = ratioEnv('AZURE_CONTENT_MIN_CONFIDENCE', 0.7);
  const wrongThreshold = numericEnv('AZURE_CONTENT_WRONG_SCORE', 65);
  if (top.confidence !== null && top.confidence >= confidenceThreshold
      && top.pronunciationScore < wrongThreshold) {
    return {
      status: 'wrong-content',
      ...diagnostics,
      message: incomplete
        ? `系統只聽到「${top.extractedText}」，未讀完「${expectedText}」，請完整再讀一次。`
        : `系統聽到「${top.extractedText || top.transcript}」，與當前題目「${expectedText}」的讀音不同。`,
    };
  }

  const heardLabel = top.extractedText || top.transcript;
  return {
    status: 'phonetic-near',
    ...diagnostics,
    message: incomplete
      ? `系統只聽到「${top.extractedText}」，未讀完「${expectedText}」，請完整再讀一次。`
      : top.pronunciationScore >= closeEnoughScore
        ? (top.extractedFrom ? `錄音夾雜其他聲音，系統只抽取「${heardLabel}」評分。` : '')
        : `系統從錄音抽取到「${heardLabel}」，已按它與「${expectedText}」的粵拼差異扣分。`,
  };
}

// A reading is only as good as its weakest evidence, but not hostage to it.
function weakestLedBlend(scores, lowerWeight) {
  const usable = scores.filter(Number.isFinite);
  if (!usable.length) return null;
  if (usable.length === 1) return usable[0];
  const lowest = Math.min(...usable);
  const rest = usable.filter((score, index) => index !== usable.indexOf(lowest));
  const restMean = rest.reduce((sum, score) => sum + score, 0) / rest.length;
  return lowest * lowerWeight + restMean * (1 - lowerWeight);
}

function combinePronunciationEvidence(assessmentScore, contentCheck, toneEvidence = null) {
  const acousticScore = finiteScore(assessmentScore);
  const recognizedPronunciationScore = finiteScore(contentCheck?.pronunciationScore);
  const toneScore = finiteScore(toneEvidence?.score);
  if (acousticScore === null || recognizedPronunciationScore === null) {
    if (toneScore === null) {
      return { score: null, acousticScore, recognizedPronunciationScore, toneScore, maximumScore: null };
    }
  }
  // zh-HK returns an accuracy score for each expected phoneme but never reveals
  // which phoneme was actually spoken, so the recognised Jyutping still has to
  // weigh in. Whichever of the two is lower carries the most weight, because a
  // reading is only as good as its weakest evidence. It is a majority rather
  // than the outright minimum the scorer used to take: the minimum let one
  // noisy signal fail an accurate reading, while an even blend let a confident
  // forced alignment hide a wrong word.
  const maximumScore = Math.min(100, Math.max(0, numericEnv('AZURE_PRONUNCIATION_MAX_SCORE', 98)));
  const lowerWeight = ratioEnv('AZURE_PRONUNCIATION_LOWER_SIGNAL_WEIGHT', 0.7);
  // Tone joins as a third signal, and it is the only one of the three measured
  // from the recording itself. Azure scored every phoneme of 海短 at 100 and
  // its recogniser rewrote the word back to 海豚, so without this a wrong tone
  // was invisible to both of the others.
  const blended = weakestLedBlend(
    [acousticScore, recognizedPronunciationScore, toneScore], lowerWeight);
  if (blended === null) {
    return { score: null, acousticScore, recognizedPronunciationScore, toneScore, maximumScore: null };
  }
  return {
    score: Math.round(Math.min(blended, maximumScore) * 10) / 10,
    acousticScore,
    recognizedPronunciationScore,
    toneScore,
    lowerScore: Math.min(...[acousticScore, recognizedPronunciationScore, toneScore]
      .filter(Number.isFinite)),
    lowerWeight,
    maximumScore,
  };
}

function azureConcurrency() {
  return Math.max(1, Math.floor(numericEnv('AZURE_SPEECH_MAX_CONCURRENT', 1)));
}

// A submission holds one slot per Azure request it is about to make, because
// the limit this counts against is Azure's own concurrent-request quota. An
// evaluation that runs its two calls together therefore holds two, and both are
// taken at once so two half-served submissions cannot wait on each other.
function evaluationSlots() {
  return Math.min(azureConcurrency(), azureConcurrency() >= 2 ? 2 : 1);
}

function acquireAzureSlots(slots) {
  if (activeAzureRequests + slots <= azureConcurrency()) {
    activeAzureRequests += slots;
    return Promise.resolve();
  }
  // Without this, a whole class queued behind one slot waits indefinitely and
  // every recording looks frozen. A clear "try again" beats an endless spinner.
  const queueTimeoutMs = Math.max(1000, numericEnv('AZURE_SPEECH_QUEUE_TIMEOUT_MS', 25000));
  return new Promise((resolve, reject) => {
    const waiter = { slots, resolve: null };
    const timer = setTimeout(() => {
      const index = azureWaiters.indexOf(waiter);
      if (index >= 0) azureWaiters.splice(index, 1);
      const error = new Error('同一時間評分的同學太多，請等幾秒再按錄音。');
      error.statusCode = 503;
      reject(error);
    }, queueTimeoutMs);
    waiter.resolve = () => { clearTimeout(timer); resolve(); };
    azureWaiters.push(waiter);
  });
}

function releaseAzureSlots(slots) {
  activeAzureRequests = Math.max(0, activeAzureRequests - slots);
  // Waiters are served in turn. A wide one at the head holds the queue rather
  // than being overtaken, so nobody is starved by a stream of narrow requests.
  while (azureWaiters.length
      && activeAzureRequests + azureWaiters[0].slots <= azureConcurrency()) {
    const next = azureWaiters.shift();
    activeAzureRequests += next.slots;
    next.resolve();
  }
}

async function withAzureSlot(task) {
  const slots = evaluationSlots();
  await acquireAzureSlots(slots);
  try { return await task(); }
  finally { releaseAzureSlots(slots); }
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

// Trailing silence is what usually keeps recognizeOnceAsync waiting after a
// child has stopped speaking, so the segmentation timeouts are shortened.
function applySpeechTuning(azure, speechConfig) {
  if (typeof speechConfig?.setProperty !== 'function') return;
  const ids = azure.PropertyId || {};
  const set = (id, value) => {
    if (id === undefined || id === null) return;
    try { speechConfig.setProperty(id, String(value)); } catch {}
  };
  set(ids.Speech_SegmentationSilenceTimeoutMs, numericEnv('AZURE_SPEECH_SEGMENTATION_SILENCE_MS', 350));
  set(ids.SpeechServiceConnection_EndSilenceTimeoutMs, numericEnv('AZURE_SPEECH_END_SILENCE_MS', 350));
  set(ids.SpeechServiceConnection_InitialSilenceTimeoutMs, numericEnv('AZURE_SPEECH_INITIAL_SILENCE_MS', 4000));
}

function openConnectionEarly(azure, recognizer) {
  try { azure.Connection?.fromRecognizer?.(recognizer)?.openConnection?.(); }
  catch {}
}

function buildRecognizer(azure, audio, referenceText) {
  const { key, region } = credentials();
  const speechConfig = azure.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = 'zh-HK';
  speechConfig.outputFormat = azure.OutputFormat.Detailed;
  applySpeechTuning(azure, speechConfig);
  const audioConfig = azure.AudioConfig.fromWavFileInput(audio, 'recording.wav');
  const recognizer = new azure.SpeechRecognizer(speechConfig, audioConfig);
  const reference = String(referenceText || '').trim();
  if (reference) {
    // Miscue detection penalises insertions, and in a classroom the insertions
    // are the neighbours, not the child. It stays off so the phoneme scores
    // describe how the target words were said. Skipped or extra syllables are
    // still caught by the Jyutping window, which normalises every window
    // against the full length of the question.
    const assessmentConfig = new azure.PronunciationAssessmentConfig(
      reference,
      azure.PronunciationAssessmentGradingSystem.HundredMark,
      azure.PronunciationAssessmentGranularity.Phoneme,
      booleanEnv('AZURE_PRONUNCIATION_ENABLE_MISCUE', false),
    );
    // The per-phoneme accuracy score says how well the expected phoneme was
    // matched and came back as 100 for every phoneme of a misread word. This
    // asks instead which phonemes were most likely spoken, which is the only
    // part of the response that can disagree with the reference text. Whether
    // zh-HK populates it is recorded in the diagnostics rather than assumed.
    try {
      assessmentConfig.nbestPhonemeCount = Math.max(0,
        numericEnv('AZURE_PRONUNCIATION_NBEST_PHONEMES', 5));
    } catch {}
    assessmentConfig.applyTo(recognizer);
  }
  openConnectionEarly(azure, recognizer);
  return recognizer;
}

const NO_MATCH_ASSESSMENT = {
  status: 'inconclusive', correct: false, score: null,
  transcript: '', provider: 'azure-scripted-phoneme-zh-HK-v5', words: [],
};

function assessmentFromResult(azure, result) {
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
    provider: 'azure-scripted-phoneme-zh-HK-v5',
    words: strict.words,
    diagnostics: strict.diagnostics,
  };
}

function requireAudioAndConfig(audio) {
  if (!audio?.length) {
    const error = new Error('錄音內容是空的，請重新錄音。');
    error.statusCode = 400;
    return error;
  }
  if (!isConfigured()) {
    const error = new Error('Azure 粵語語音辨識尚未設定。');
    error.statusCode = 501;
    return error;
  }
  return null;
}

function recognizeContent(audio, sdkOverride = null) {
  const invalid = requireAudioAndConfig(audio);
  if (invalid) return Promise.reject(invalid);
  const azure = sdkOverride || sdk();
  const recognizer = buildRecognizer(azure, audio, '');
  return recognizeOnce(recognizer, result => {
    if (result.reason === azure.ResultReason.NoMatch) return { transcript: '', confidence: null, candidates: [] };
    if (result.reason !== azure.ResultReason.RecognizedSpeech) {
      throw cancellationError(azure, result, 'Azure 內容辨識失敗。');
    }
    return detailedRecognition(azure, result);
  });
}

function assessPronunciation(audio, referenceText, sdkOverride = null) {
  const invalid = requireAudioAndConfig(audio);
  if (invalid) return Promise.reject(invalid);
  if (!String(referenceText || '').trim()) return Promise.reject(new Error('缺少發音評估參考文字。'));
  const azure = sdkOverride || sdk();
  const recognizer = buildRecognizer(azure, audio, referenceText);
  return recognizeOnce(recognizer, result => {
    if (result.reason === azure.ResultReason.NoMatch) return { ...NO_MATCH_ASSESSMENT };
    if (result.reason !== azure.ResultReason.RecognizedSpeech) {
      throw cancellationError(azure, result, 'Azure 發音評估失敗。');
    }
    return assessmentFromResult(azure, result);
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
    // Scripted assessment force-aligns the audio to the reference text, so the
    // text it reports back is the question, not what the child said. Reading
    // 開豚 for 海豚 came back as 海豚 and scored full marks. What was actually
    // spoken has to come from a recognition that has never seen the question.
    const recognitionStartedAt = Date.now();
    let recognition;
    let assessment = null;
    let azureRequests = 0;
    // Two Azure calls are needed, but they do not have to be consecutive. When
    // the tier allows more than one request at a time they run together and
    // cost one round trip of waiting. On F0 they stay sequential, which also
    // keeps the saving of skipping assessment for a clearly wrong answer.
    if (evaluationSlots() >= 2) {
      const [independent, scored] = await Promise.all([
        recognizeContent(audio, sdkOverride),
        assessPronunciation(audio, referenceText, sdkOverride),
      ]);
      recognition = independent;
      assessment = scored;
      azureRequests = 2;
    } else {
      recognition = await recognizeContent(audio, sdkOverride);
      azureRequests = 1;
    }
    const contentRecognitionMs = Date.now() - recognitionStartedAt;
    const contentCheck = compareRecognizedContent(recognition, referenceText, expectedJyutping);
    const provider = 'azure-current-item-cantonese-phonetic-v5';
    const reference = {
      assignmentId: referenceContext.assignmentId || null,
      itemId: referenceContext.itemId || null,
      text: String(referenceText || '').trim(),
      jyutping: contentCheck.expectedJyutping,
    };

    if (contentCheck.status === 'wrong-content' || contentCheck.status === 'inconclusive') {
      const wrong = contentCheck.status === 'wrong-content';
      const classification = wrong
        ? classifyAccuracy(contentCheck.pronunciationScore)
        : { status: 'inconclusive', correct: false };
      return {
        ...classification,
        score: wrong ? contentCheck.pronunciationScore : null,
        transcript: recognition.transcript, provider, contentCheck,
        diagnostics: {
          algorithm: 'current-item-phonetic-comparison-v5',
          reference,
          contentCheck,
          unusedAcousticScore: assessment?.score ?? null,
        },
        timing: { queueWaitMs, contentRecognitionMs, assessmentMs: 0, azureRequests },
        message: contentCheck.message,
      };
    }

    let assessmentMs = 0;
    if (!assessment) {
      const assessmentStartedAt = Date.now();
      assessment = await assessPronunciation(audio, referenceText, sdkOverride);
      assessmentMs = Date.now() - assessmentStartedAt;
      azureRequests += 1;
    }
    const toneEvidence = analyzeTones(audio, contentCheck.expectedJyutping);
    const combined = combinePronunciationEvidence(assessment.score, contentCheck, toneEvidence);
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
        algorithm: 'azure-current-item-cantonese-phonetic-v5',
        reference,
        contentCheck,
        combined,
        toneEvidence,
        assessmentTranscript: assessment.transcript,
      },
      timing: { queueWaitMs, contentRecognitionMs, assessmentMs, azureRequests },
      message: contentCheck.message || assessment.message,
    };
  });
}

module.exports = {
  isConfigured,
  classifyAccuracy,
  scoreCantonesePronunciation,
  extractBestWindow,
  expectedUnits,
  jyutpingUnits,
  strictScoreFromDetails,
  compareRecognizedContent,
  combinePronunciationEvidence,
  recognizeContent,
  assessPronunciation,
  evaluatePronunciation,
};
