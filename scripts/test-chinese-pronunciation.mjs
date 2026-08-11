import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { analyzeWavQuality } = require('../chinese-app/lib/audioQuality');
const {
  classifyAccuracy,
  strictScoreFromDetails,
  compareRecognizedContent,
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
const noisy = analyzeWavQuality(wav(samples(1, () => {
  seed = (seed * 16807) % 2147483647;
  return (seed / 2147483647 * 2 - 1) * 0.14;
})));
assert.equal(noisy.reason, 'too-noisy');

assert.equal(analyzeWavQuality(wav(samples(0.2, () => 0.2))).reason, 'too-short');
assert.equal(classifyAccuracy(88).status, 'pass');
assert.equal(classifyAccuracy(62).status, 'retry');
assert.equal(classifyAccuracy(75).status, 'inconclusive');
assert.equal(classifyAccuracy(Number.NaN).status, 'inconclusive');

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
assert.equal(strictSingleCharacter.score, 75.5,
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

const wrongPhrase = compareRecognizedContent(
  { transcript: '你好', confidence: 0.96 },
  '企鵝',
  'kei5 ngo2',
);
assert.equal(wrongPhrase.status, 'wrong-content');
assert.equal(wrongPhrase.pronunciationSimilarity, 0.5);
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
    if (this.isAssessment) {
      assessmentCalls += 1;
      resolve({ reason: 1, text: currentAssessmentTranscript });
      return;
    }
    resolve({ reason: 1, text: currentRecognition.transcript, confidence: currentRecognition.confidence });
  }
  close() {}
}
let selectedGranularity;
class FakeAssessmentConfig {
  constructor(reference, grading, granularity) { selectedGranularity = granularity; }
  applyTo(recognizer) { recognizer.isAssessment = true; }
}
let assessmentCalls = 0;
let currentAssessmentTranscript = '好';
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
const assessed = await assessPronunciation(wav(clearSpeech), '好', fakeSdk);
assert.equal(assessed.status, 'pass');
assert.equal(assessed.score, 89.3);
assert.equal(assessed.transcript, '好');
assert.equal(selectedGranularity, fakeSdk.PronunciationAssessmentGranularity.Phoneme);
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
const strictAssessed = await assessPronunciation(wav(clearSpeech), '好', fakeSdk);
assert.equal(strictAssessed.score, 75.5);
assert.equal(strictAssessed.status, 'inconclusive');
assert.equal(strictAssessed.correct, false);

currentAssessment = {
  ...currentAssessment,
  detailResult: {
    Words: [{ Word: '好', PronunciationAssessment: { AccuracyScore: 100, ErrorType: 'None' } }],
  },
};
const unsupportedGranularity = await assessPronunciation(wav(clearSpeech), '好', fakeSdk);
assert.equal(unsupportedGranularity.status, 'inconclusive',
  'an aggregate 100 without phoneme evidence must never pass');
assert.equal(unsupportedGranularity.correct, false);

assessmentCalls = 0;
currentRecognition = { transcript: '你好', confidence: 0.96 };
const gatedWrongPhrase = await evaluatePronunciation(
  wav(clearSpeech), '企鵝', 'kei5 ngo2', fakeSdk);
assert.equal(gatedWrongPhrase.status, 'retry');
assert.equal(gatedWrongPhrase.score, 0);
assert.equal(gatedWrongPhrase.transcript, '你好');
assert.equal(assessmentCalls, 0, 'clearly wrong content must not receive a pronunciation score');

currentRecognition = { transcript: '不清楚', confidence: 0.2 };
const uncertainPhrase = await evaluatePronunciation(
  wav(clearSpeech), '企鵝', 'kei5 ngo2', fakeSdk);
assert.equal(uncertainPhrase.status, 'inconclusive');
assert.equal(uncertainPhrase.score, null);
assert.equal(assessmentCalls, 0, 'uncertain content must not receive a random score');

currentRecognition = { transcript: '企鵝', confidence: 0.94 };
currentAssessmentTranscript = '企鵝';
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
  wav(clearSpeech), '企鵝', 'kei5 ngo2', fakeSdk);
assert.equal(gatedCorrectPhrase.status, 'pass');
assert.equal(gatedCorrectPhrase.score, 89.3);
assert.equal(gatedCorrectPhrase.contentCheck.status, 'matched');
assert.equal(assessmentCalls, 1);
if (originalKey == null) delete process.env.AZURE_SPEECH_KEY;
else process.env.AZURE_SPEECH_KEY = originalKey;
if (originalRegion == null) delete process.env.AZURE_SPEECH_REGION;
else process.env.AZURE_SPEECH_REGION = originalRegion;

console.log('✅ Cantonese pronunciation scoring and audio quality tests passed.');
