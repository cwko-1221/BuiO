import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

import { readJyutping, readTones } from './lib/cantonese-audio.mjs';

const require = createRequire(import.meta.url);
const { analyzeWavQuality } = require('../chinese-app/lib/audioQuality');
const {
  classifyAccuracy,
  scoreCantonesePronunciation,
  strictScoreFromDetails,
  compareRecognizedContent,
  combinePronunciationEvidence,
  extractBestWindow,
  expectedUnits,
  jyutpingUnits,
  assessPronunciation,
  evaluatePronunciation,
} = require('../chinese-app/lib/pronunciation');

function wav(samples, sampleRate = 16000) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => {
    const value = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.round(value < 0 ? value * 32768 : value * 32767), 44 + index * 2);
  });
  return buffer;
}

function samples(seconds, create, sampleRate = 16000) {
  return Array.from({ length: Math.round(seconds * sampleRate) }, (_, index) => create(index, sampleRate));
}

const clearSpeech = samples(1, (index, rate) => {
  if (index < rate * 0.2) return Math.sin(index / 5) * 0.003;
  return Math.sin(index * 2 * Math.PI * 220 / rate) * 0.18;
});
assert.equal(analyzeWavQuality(wav(clearSpeech)).ok, true, 'clear speech should pass the quality gate');

const quiet = analyzeWavQuality(wav(samples(1, index => Math.sin(index / 8) * 0.003)));
assert.equal(quiet.reason, 'too-quiet');

const clipped = analyzeWavQuality(wav(samples(1, index => index % 2 ? 1 : -1)));
assert.equal(clipped.reason, 'clipping');

let seed = 123456;
const noisySamples = samples(1, () => {
  seed = (seed * 16807) % 2147483647;
  return (seed / 2147483647 * 2 - 1) * 0.14;
});
const noisy = analyzeWavQuality(wav(noisySamples));
assert.equal(noisy.ok, true, 'classroom noise must no longer block scoring');
assert.equal(noisy.warning, 'noisy', 'a noisy recording is still flagged for the teacher');
process.env.CHINESE_AUDIO_NOISE_GATE = '1';
assert.equal(analyzeWavQuality(wav(noisySamples)).reason, 'too-noisy',
  'the old hard gate stays available for a quiet room');
delete process.env.CHINESE_AUDIO_NOISE_GATE;

assert.equal(analyzeWavQuality(wav(samples(0.2, () => 0.2))).reason, 'too-short');
assert.equal(classifyAccuracy(88).status, 'pass');
assert.equal(classifyAccuracy(62).status, 'retry');
assert.equal(classifyAccuracy(70).status, 'pass', '70% is the pass mark');
assert.equal(classifyAccuracy(69.9).status, 'retry',
  'below the pass mark is a retry, never an unexplained limbo status');
assert.equal(classifyAccuracy(Number.NaN).status, 'inconclusive');

const mediaRouteSource = readFileSync(new URL('../chinese-app/routes/media.js', import.meta.url), 'utf8');
const assignmentRepositorySource = readFileSync(
  new URL('../chinese-app/repositories/assignments.repo.js', import.meta.url), 'utf8');
assert.match(mediaRouteSource, /assignments\.getAccessibleItem\(/,
  'pronunciation assessment must fetch the current item directly');
assert.doesNotMatch(mediaRouteSource, /assignment\?\.items\?\.find/,
  'pronunciation assessment must not search or score against the full assignment item list');
assert.match(assignmentRepositorySource, /AND i\.id = \$3/,
  'the current assignment item id must be part of the database lookup');

const strictSingleCharacter = strictScoreFromDetails({
  accuracyScore: 100,
  completenessScore: 100,
  details: {
    Words: [{
      Word: '好',
      PronunciationAssessment: { AccuracyScore: 100, ErrorType: 'None' },
      Phonemes: [
        { PronunciationAssessment: { AccuracyScore: 100 } },
        { PronunciationAssessment: { AccuracyScore: 54 } },
        { PronunciationAssessment: { AccuracyScore: 100 } },
      ],
    }],
  },
});
assert.equal(strictSingleCharacter.score, 80.1,
  'one inaccurate sound still costs marks, but no longer sinks the reading');
assert.ok(strictSingleCharacter.score < 85,
  'one inaccurate sound must not be hidden by an aggregate score of 100');
assert.equal(strictSingleCharacter.diagnostics.hasPhonemeEvidence, true);
assert.equal(strictSingleCharacter.diagnostics.phonemeMeanScore.toFixed(1), '84.7');

const unstableAggregates = strictScoreFromDetails({
  accuracyScore: 0,
  completenessScore: 0,
  details: {
    Words: [{
      Word: '企鵝',
      PronunciationAssessment: { AccuracyScore: 0, ErrorType: 'None' },
      Phonemes: [
        { PronunciationAssessment: { AccuracyScore: 80 } },
        { PronunciationAssessment: { AccuracyScore: 80 } },
        { PronunciationAssessment: { AccuracyScore: 80 } },
      ],
    }],
  },
});
assert.equal(unstableAggregates.score, 80,
  'unstable aggregate scores must not override direct phoneme similarity');

const toneMistake = scoreCantonesePronunciation('hoi2 tyun4', 'hoi1 tyun4');
assert.equal(toneMistake.score, 68,
  '海豚 read as 開豚 must be close, but must never receive 100');
assert.deepEqual(toneMistake.alignment, [
  { expected: 'hoi2', heard: 'hoi1', score: 60 },
  { expected: 'tyun4', heard: 'tyun4', score: 100 },
]);
// Tone is 40% of a syllable, but only of a syllable that was otherwise said
// correctly. 你好 and 企鵝 share both tones and share nothing else.
assert.equal(scoreCantonesePronunciation('kei5 ngo2', 'nei5 hou2').score, 35,
  'landing the tones of a completely different word must earn nothing');
assert.equal(scoreCantonesePronunciation('hoi2 tyun4', 'hoi5 tyun4').score, 84,
  'a tone confused with its close neighbour costs less than a plain wrong tone');
assert.equal(combinePronunciationEvidence(100, { pronunciationScore: 87.5 }).score, 87.5,
  'the weaker signal carries most of the weight without outright failing the reading');
assert.equal(combinePronunciationEvidence(87.5, { pronunciationScore: 100 }).score, 87.5,
  'it is the lower score that dominates, whichever signal it came from');
assert.ok(combinePronunciationEvidence(100, { pronunciationScore: 50 }).score < 70,
  'a confident forced alignment must not carry a reading the recogniser did not hear');
assert.equal(combinePronunciationEvidence(100, { pronunciationScore: 100 }).score, 98,
  'zh-HK cannot expose spoken phoneme identities, so one automatic sample cannot claim perfect certainty');

const wrongPhrase = compareRecognizedContent(
  { transcript: '你好', confidence: 0.96 },
  '企鵝',
  'kei5 ngo2',
);
assert.equal(wrongPhrase.status, 'wrong-content');
assert.equal(wrongPhrase.pronunciationScore, 35);
const nearTonePhrase = compareRecognizedContent(
  { transcript: '開豚', confidence: 0.96 },
  '海豚',
  'hoi2 tyun4',
);
assert.equal(nearTonePhrase.status, 'phonetic-near');
assert.equal(nearTonePhrase.pronunciationScore, 68);
assert.equal(compareRecognizedContent(
  { transcript: '企鵝', confidence: 0.5 }, '企鵝', 'kei5 ngo2').status, 'matched');
assert.equal(compareRecognizedContent(
  { transcript: '可', confidence: 0.9 }, '好', 'hou2').status, 'phonetic-near',
'a plausible single-character recognition must proceed to acoustic assessment');
assert.equal(compareRecognizedContent(
  { transcript: '', confidence: null }, '企鵝', 'kei5 ngo2').status, 'inconclusive');

const originalKey = process.env.AZURE_SPEECH_KEY;
const originalRegion = process.env.AZURE_SPEECH_REGION;
process.env.AZURE_SPEECH_KEY = 'test-key';
process.env.AZURE_SPEECH_REGION = 'test-region';
class FakeRecognizer {
  constructor() { this.isAssessment = false; }
  recognizeOnceAsync(resolve) {
    azureRequests += 1;
    if (this.isAssessment) assessmentCalls += 1;
    else plainRecognitions += 1;
    const result = { reason: 1, text: currentRecognition.transcript, confidence: currentRecognition.confidence };
    const candidates = currentRecognition.candidates
      || [{ transcript: currentRecognition.transcript, confidence: currentRecognition.confidence }];
    result.properties = { getProperty: () => JSON.stringify({
      NBest: candidates.map(candidate => ({
        Display: candidate.transcript,
        Confidence: candidate.confidence,
      })),
    }) };
    resolve(result);
  }
  close() {}
}
let selectedGranularity;
let selectedMiscue;
class FakeAssessmentConfig {
  constructor(reference, grading, granularity, enableMiscue) {
    selectedGranularity = granularity;
    selectedMiscue = enableMiscue;
  }
  applyTo(recognizer) { recognizer.isAssessment = true; }
}
let assessmentCalls = 0;
let azureRequests = 0;
let plainRecognitions = 0;
let currentRecognition = { transcript: '好', confidence: 0.96 };
let currentAssessment = {
  accuracyScore: 96,
  pronunciationScore: 92,
  completenessScore: 100,
  fluencyScore: 90,
  detailResult: {
    Words: [{
      Word: '好',
      PronunciationAssessment: { AccuracyScore: 91, ErrorType: 'None' },
      Phonemes: [
        { Phoneme: '', PronunciationAssessment: { AccuracyScore: 90 } },
        { Phoneme: '', PronunciationAssessment: { AccuracyScore: 87 } },
        { Phoneme: '', PronunciationAssessment: { AccuracyScore: 94 } },
      ],
    }],
  },
};
const fakeSdk = {
  SpeechConfig: { fromSubscription: () => ({}) },
  AudioConfig: { fromWavFileInput: () => ({}) },
  SpeechRecognizer: FakeRecognizer,
  PronunciationAssessmentConfig: FakeAssessmentConfig,
  PronunciationAssessmentGradingSystem: { HundredMark: 1 },
  PronunciationAssessmentGranularity: { Phoneme: 1, Word: 2 },
  OutputFormat: { Detailed: 1 },
  PropertyId: { SpeechServiceResponse_JsonResult: 1 },
  ResultReason: { RecognizedSpeech: 1, NoMatch: 0 },
  CancellationDetails: { fromResult: () => ({ errorDetails: '' }) },
  PronunciationAssessmentResult: { fromResult: () => currentAssessment },
};
const goodTone = readJyutping('hou2');
const assessed = await assessPronunciation(goodTone, '好', fakeSdk);
assert.equal(assessed.status, 'pass');
assert.equal(assessed.score, 89.8);
assert.equal(assessed.transcript, '好');
assert.equal(selectedGranularity, fakeSdk.PronunciationAssessmentGranularity.Phoneme);
assert.equal(selectedMiscue, false,
  'miscue detection must stay off so classroom noise is not scored as an insertion');
assert.equal(assessed.diagnostics.lowerPhonemeScore, 87);
assert.equal(assessed.words[0].phonemes.length, 3);

currentAssessment = {
  ...currentAssessment,
  accuracyScore: 100,
  detailResult: {
    Words: [{
      Word: '好',
      PronunciationAssessment: { AccuracyScore: 100, ErrorType: 'None' },
      Phonemes: [
        { PronunciationAssessment: { AccuracyScore: 100 } },
        { PronunciationAssessment: { AccuracyScore: 54 } },
        { PronunciationAssessment: { AccuracyScore: 100 } },
      ],
    }],
  },
};
const strictAssessed = await assessPronunciation(goodTone, '好', fakeSdk);
assert.equal(strictAssessed.score, 80.1);
assert.ok(strictAssessed.score < 85,
  'a single mispronounced sound must still show up as a deduction');

currentAssessment = {
  ...currentAssessment,
  detailResult: {
    Words: [{ Word: '好', PronunciationAssessment: { AccuracyScore: 100, ErrorType: 'None' } }],
  },
};
const unsupportedGranularity = await assessPronunciation(goodTone, '好', fakeSdk);
assert.equal(unsupportedGranularity.status, 'inconclusive',
  'an aggregate 100 without phoneme evidence must never pass');
assert.equal(unsupportedGranularity.correct, false);

assessmentCalls = 0;
azureRequests = 0;
currentRecognition = { transcript: '你好', confidence: 0.96 };
const gatedWrongPhrase = await evaluatePronunciation(
  readJyutping('kei5 ngo2'), '企鵝', 'kei5 ngo2', fakeSdk);
assert.equal(gatedWrongPhrase.status, 'retry');
assert.equal(gatedWrongPhrase.score, 35);
assert.equal(gatedWrongPhrase.transcript, '你好');
assert.equal(azureRequests, 1,
  'a clearly wrong answer must not also pay for a pronunciation assessment');
assert.equal(gatedWrongPhrase.timing.azureRequests, 1);

azureRequests = 0;
currentRecognition = { transcript: '不清楚', confidence: 0.1 };
const uncertainPhrase = await evaluatePronunciation(
  readJyutping('kei5 ngo2'), '企鵝', 'kei5 ngo2', fakeSdk);
assert.equal(uncertainPhrase.status, 'inconclusive');
assert.equal(uncertainPhrase.score, null);
assert.equal(azureRequests, 1, 'uncertain content must not cost a second Azure round trip');

assessmentCalls = 0;
azureRequests = 0;
plainRecognitions = 0;
currentRecognition = {
  transcript: '開豚',
  confidence: 0.96,
  candidates: [
    { transcript: '開豚', confidence: 0.96 },
    { transcript: '海豚', confidence: 0.31 },
  ],
};
currentAssessment = {
  accuracyScore: 100,
  pronunciationScore: 100,
  completenessScore: 100,
  fluencyScore: 100,
  detailResult: {
    Words: [{
      Word: '海豚',
      PronunciationAssessment: { AccuracyScore: 100, ErrorType: 'None' },
      Phonemes: [
        { PronunciationAssessment: { AccuracyScore: 100 } },
        { PronunciationAssessment: { AccuracyScore: 100 } },
        { PronunciationAssessment: { AccuracyScore: 100 } },
      ],
    }],
  },
};
const currentItemToneMistake = await evaluatePronunciation(
  readJyutping('hoi2 tyun4'), '海豚', 'hoi2 tyun4', fakeSdk,
  { assignmentId: 'assignment-1', itemId: 'item-sea' });
assert.equal(currentItemToneMistake.score, 68,
  '海豚 read as 開豚 must remain below 100 even when scripted Azure returns all 100');
assert.equal(currentItemToneMistake.diagnostics.reference.text, '海豚');
assert.equal(currentItemToneMistake.diagnostics.reference.itemId, 'item-sea');
assert.equal(currentItemToneMistake.diagnostics.combined.acousticScore, 100);
assert.equal(currentItemToneMistake.diagnostics.combined.recognizedPronunciationScore, 68);
assert.equal(currentItemToneMistake.contentCheck.candidates.length, 2,
  'the detailed Azure NBest response must be preserved for auditing');
assert.equal(currentItemToneMistake.timing.azureRequests, 2);
assert.ok(plainRecognitions >= 1,
  'scripted assessment reports the reference text back, so what was actually said '
  + 'must come from a recognition that never saw the question');

assessmentCalls = 0;
azureRequests = 0;
plainRecognitions = 0;
currentRecognition = { transcript: '企鵝', confidence: 0.94 };
currentAssessment = {
  accuracyScore: 96,
  pronunciationScore: 92,
  completenessScore: 100,
  fluencyScore: 90,
  detailResult: {
    Words: [{
      Word: '企鵝',
      PronunciationAssessment: { AccuracyScore: 91, ErrorType: 'None' },
      Phonemes: [
        { PronunciationAssessment: { AccuracyScore: 90 } },
        { PronunciationAssessment: { AccuracyScore: 87 } },
        { PronunciationAssessment: { AccuracyScore: 94 } },
      ],
    }],
  },
};
const gatedCorrectPhrase = await evaluatePronunciation(
  readJyutping('kei5 ngo2'), '企鵝', 'kei5 ngo2', fakeSdk);
assert.equal(gatedCorrectPhrase.status, 'pass');
assert.equal(gatedCorrectPhrase.score, 89.8);
assert.equal(gatedCorrectPhrase.contentCheck.status, 'matched');
assert.equal(gatedCorrectPhrase.timing.azureRequests, 2);
assert.equal(assessmentCalls, 1);
assert.equal(plainRecognitions, 1,
  'the content evidence must come from a reference-free recognition');
// ----- classroom noise: score the matching stretch, not the whole transcript --
const buriedInNoise = compareRecognizedContent(
  { transcript: '旱上料刷你好料刺尹料', confidence: 0.55 },
  '你好',
  'nei5 hou2',
);
assert.equal(buriedInNoise.status, 'matched',
  '你好 spoken inside classroom noise must be recognised as the answer');
assert.equal(buriedInNoise.pronunciationScore, 100);
assert.equal(buriedInNoise.extractedText, '你好',
  'only the stretch matching the question may be scored');
assert.equal(buriedInNoise.extractedFrom.start, 4);
assert.equal(buriedInNoise.extractedFrom.end, 6);
assert.match(buriedInNoise.message, /只抽取/);

const noiseWithoutAnswer = compareRecognizedContent(
  { transcript: '旱上料刷料刺尹料', confidence: 0.9 },
  '企鵝',
  'kei5 ngo2',
);
assert.notEqual(noiseWithoutAnswer.status, 'matched',
  'extraction must not invent an answer that was never spoken');
assert.ok(noiseWithoutAnswer.pronunciationScore < 65);

const halfRead = compareRecognizedContent(
  { transcript: '你', confidence: 0.9 }, '你好', 'nei5 hou2');
assert.ok(halfRead.pronunciationScore <= 50,
  'a window shorter than the question stays normalised against the full question');
assert.ok(halfRead.pronunciationScore < 30,
  'a syllable left out is the weakest part of the reading, not an absent one');
assert.match(halfRead.message, /未讀完/,
  'an unfinished answer must be reported as unfinished, not as the wrong word');

// 你 read as lei5 rather than nei5 is the common lazy onset. n and l are near
// enough that it costs marks without failing, which is where it belongs: the
// child said the right word a little loosely. Accepting every reading of a
// character outright, as this once did, made a single character unmarkable —
// 虎 is listed as fu2 and fu1, so reading it on the wrong tone scored 100, and
// 父 and 滸 both list fu2 among their readings and so both stood in for it.
const lazyOnset = compareRecognizedContent(
  { transcript: '李好', confidence: 0.9 }, '你好', 'nei5 hou2');
assert.equal(lazyOnset.pronunciationScore, 83.4);
assert.equal(classifyAccuracy(lazyOnset.pronunciationScore).status, 'pass',
  'a lazy onset must cost marks without failing the reading');
assert.equal(compareRecognizedContent(
  { transcript: '呼', confidence: 0.9 }, '虎', 'fu2').pronunciationScore, 60,
  '虎 on the wrong tone must not be matched to its own alternate reading');
assert.equal(compareRecognizedContent(
  { transcript: '滸', confidence: 0.9 }, '虎', 'fu2').pronunciationScore, 58.3,
  'a heard character must be read as the sound it usually spells');

const window = extractBestWindow(
  expectedUnits('你好', 'nei5 hou2'),
  jyutpingUnits('旱上料刷你好料刺尹料'),
);
assert.equal(window.score, 100);
assert.deepEqual([window.start, window.end], [4, 6]);

// ----- a tier that allows concurrency pays one round trip of waiting ---------
process.env.AZURE_SPEECH_MAX_CONCURRENT = '4';
assessmentCalls = 0;
azureRequests = 0;
plainRecognitions = 0;
currentRecognition = { transcript: '企鵝', confidence: 0.94 };
const parallelPhrase = await evaluatePronunciation(
  readJyutping('kei5 ngo2'), '企鵝', 'kei5 ngo2', fakeSdk);
assert.equal(parallelPhrase.score, 89.8,
  'running the two calls together must not change the score');
assert.equal(parallelPhrase.timing.azureRequests, 2);
assert.equal(plainRecognitions, 1,
  'the reference-free recognition still supplies what was actually said');
assert.equal(assessmentCalls, 1);
delete process.env.AZURE_SPEECH_MAX_CONCURRENT;

// ----- tone is measured on every submission but does not count by default ----
// Checked against 12 archived readings that Azure and a teacher both accepted,
// the current tone thresholds failed 10: real speech drifts downwards across an
// utterance and drops at the end, so 攤位 read correctly measures as falling
// where the tone letters say high level. Until that is calibrated against real
// recordings of wrong readings as well as right ones, the measurement is
// recorded and not scored, because failing a child who read correctly is worse
// than passing one who did not.
assessmentCalls = 0;
azureRequests = 0;
currentRecognition = { transcript: '海豚', confidence: 0.65 };
currentAssessment = {
  accuracyScore: 100,
  pronunciationScore: 100,
  completenessScore: 100,
  fluencyScore: 100,
  detailResult: {
    Words: [{
      Word: '海豚',
      PronunciationAssessment: { AccuracyScore: 100, ErrorType: 'None' },
      Phonemes: Array.from({ length: 5 }, () => ({
        PronunciationAssessment: { AccuracyScore: 100 },
      })),
    }],
  },
};
const toneOffWrongTone = await evaluatePronunciation(
  readTones(2, 2), '海豚', 'hoi2 tyun4', fakeSdk);
assert.equal(toneOffWrongTone.diagnostics.toneScoring, false,
  'tone must not count towards the score until it is calibrated');
assert.ok(toneOffWrongTone.diagnostics.toneEvidence,
  'tone must still be measured and recorded, which is what makes calibration possible');
assert.equal(toneOffWrongTone.diagnostics.combined.toneScore, null,
  'an uncalibrated measurement must not reach the score');

// ----- a wrong tone must cost marks even when Azure sees nothing wrong -------
// Everything below runs with tone scoring switched on, which is what the
// calibration work is aiming at.
process.env.CHINESE_TONE_SCORING = '1';
// This is the reported failure. 海短 read for 海豚 came back at 98%: Azure
// scored all five phonemes 100 because scripted assessment force-aligns to the
// reference, and its recogniser rewrote the non-word 海短 back to the real word
// 海豚, so the Jyutping comparison saw a perfect match too. zh-HK has no tone
// assessment at all — prosody is en-US only — so the pitch is measured locally.
assessmentCalls = 0;
azureRequests = 0;
currentRecognition = { transcript: '海豚', confidence: 0.65 };
currentAssessment = {
  accuracyScore: 100,
  pronunciationScore: 100,
  completenessScore: 100,
  fluencyScore: 100,
  detailResult: {
    Words: [{
      Word: '海豚',
      PronunciationAssessment: { AccuracyScore: 100, ErrorType: 'None' },
      Phonemes: Array.from({ length: 5 }, () => ({
        PronunciationAssessment: { AccuracyScore: 100 },
      })),
    }],
  },
};
const readCorrectly = await evaluatePronunciation(
  readJyutping('hoi2 tyun4'), '海豚', 'hoi2 tyun4', fakeSdk);
assert.equal(readCorrectly.status, 'pass');
assert.ok(readCorrectly.score >= 90,
  `a correct reading must still pass, got ${readCorrectly.score}`);

// 海短: the second syllable read on tone 2 instead of tone 4.
const wrongTone = await evaluatePronunciation(
  readTones(2, 2), '海豚', 'hoi2 tyun4', fakeSdk);
assert.equal(wrongTone.diagnostics.combined.acousticScore, 100,
  'Azure must still be reporting a perfect phoneme score for this to be a regression test');
assert.equal(wrongTone.diagnostics.combined.recognizedPronunciationScore, 100,
  'the recogniser must still be reporting the corrected word for this to be a regression test');
assert.ok(wrongTone.diagnostics.combined.toneScore < 70,
  `the tone must be measured as wrong, got ${wrongTone.diagnostics.combined.toneScore}`);
assert.equal(wrongTone.correct, false,
  `海短 read for 海豚 must not pass, got ${wrongTone.score}`);
assert.ok(readCorrectly.score - wrongTone.score > 20,
  'a wrong tone must be clearly separated from a right one');

// 開豚: the first syllable read on tone 1 instead of tone 2.
const wrongFirstTone = await evaluatePronunciation(
  readTones(1, 4), '海豚', 'hoi2 tyun4', fakeSdk);
assert.equal(wrongFirstTone.correct, false,
  `開豚 read for 海豚 must not pass, got ${wrongFirstTone.score}`);

delete process.env.CHINESE_TONE_SCORING;

// ----- the limit counts Azure requests, not submissions ----------------------
// Each submission makes two calls, so a limit of 4 must admit two submissions
// at a time rather than four. Counting submissions would have put 20 requests
// in flight against a quota of 10.
process.env.AZURE_SPEECH_MAX_CONCURRENT = '4';
let inFlight = 0;
let peakInFlight = 0;
class CountingRecognizer {
  recognizeOnceAsync(resolve) {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    setTimeout(() => {
      inFlight -= 1;
      resolve({
        reason: 1, text: '企鵝', confidence: 0.94,
        properties: { getProperty: () => JSON.stringify({
          NBest: [{ Display: '企鵝', Confidence: 0.94 }] }) },
      });
    }, 20);
  }
  close() {}
}
const countingSdk = { ...fakeSdk, SpeechRecognizer: CountingRecognizer };
const crowd = await Promise.all(Array.from({ length: 6 }, () =>
  evaluatePronunciation(readJyutping('kei5 ngo2'), '企鵝', 'kei5 ngo2', countingSdk)));
assert.equal(crowd.length, 6, 'every queued submission must still be scored');
assert.ok(peakInFlight <= 4,
  `no more Azure requests may be in flight than the limit allows, saw ${peakInFlight}`);
assert.ok(peakInFlight >= 3,
  `the allowance must actually be used, saw only ${peakInFlight}`);
assert.equal(inFlight, 0, 'every slot must be given back');
delete process.env.AZURE_SPEECH_MAX_CONCURRENT;

// ----- a full scoring queue must fail fast instead of hanging -----------------
process.env.AZURE_SPEECH_MAX_CONCURRENT = '1';
process.env.AZURE_SPEECH_QUEUE_TIMEOUT_MS = '1000';
class SlowRecognizer {
  recognizeOnceAsync(resolve) {
    setTimeout(() => resolve({ reason: 1, text: '企鵝', confidence: 0.9 }), 1500);
  }
  close() {}
}
const slowSdk = { ...fakeSdk, SpeechRecognizer: SlowRecognizer };
const [first, second] = await Promise.allSettled([
  evaluatePronunciation(readJyutping('kei5 ngo2'), '企鵝', 'kei5 ngo2', slowSdk),
  evaluatePronunciation(readJyutping('kei5 ngo2'), '企鵝', 'kei5 ngo2', slowSdk),
]);
assert.equal(second.status, 'rejected', 'a queued request must not wait forever');
assert.equal(second.reason.statusCode, 503);
assert.match(second.reason.message, /太多/);
assert.equal(first.status, 'fulfilled');
delete process.env.AZURE_SPEECH_MAX_CONCURRENT;
delete process.env.AZURE_SPEECH_QUEUE_TIMEOUT_MS;

if (originalKey == null) delete process.env.AZURE_SPEECH_KEY;
else process.env.AZURE_SPEECH_KEY = originalKey;
if (originalRegion == null) delete process.env.AZURE_SPEECH_REGION;
else process.env.AZURE_SPEECH_REGION = originalRegion;

console.log('✅ Cantonese pronunciation scoring and audio quality tests passed.');
