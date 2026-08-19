import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

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
assert.equal(toneMistake.score, 87.5,
  '海豚 read as 開豚 must be close, but must never receive 100');
assert.deepEqual(toneMistake.alignment, [
  { expected: 'hoi2', heard: 'hoi1', score: 75 },
  { expected: 'tyun4', heard: 'tyun4', score: 100 },
]);
assert.equal(combinePronunciationEvidence(100, { pronunciationScore: 87.5 }).score, 95,
  'the two signals are blended, so one weak signal deducts marks without failing the reading');
assert.ok(combinePronunciationEvidence(100, { pronunciationScore: 87.5 }).score < 98,
  'a Jyutping mismatch must still cost marks against a perfect forced alignment');
assert.equal(combinePronunciationEvidence(100, { pronunciationScore: 100 }).score, 98,
  'zh-HK cannot expose spoken phoneme identities, so one automatic sample cannot claim perfect certainty');

const wrongPhrase = compareRecognizedContent(
  { transcript: '你好', confidence: 0.96 },
  '企鵝',
  'kei5 ngo2',
);
assert.equal(wrongPhrase.status, 'wrong-content');
assert.equal(wrongPhrase.pronunciationScore, 58.7);
const nearTonePhrase = compareRecognizedContent(
  { transcript: '開豚', confidence: 0.96 },
  '海豚',
  'hoi2 tyun4',
);
assert.equal(nearTonePhrase.status, 'phonetic-near');
assert.equal(nearTonePhrase.pronunciationScore, 87.5);
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
const strictAssessed = await assessPronunciation(wav(clearSpeech), '好', fakeSdk);
assert.equal(strictAssessed.score, 80.1);
assert.ok(strictAssessed.score < 85,
  'a single mispronounced sound must still show up as a deduction');

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
azureRequests = 0;
currentRecognition = { transcript: '你好', confidence: 0.96 };
const gatedWrongPhrase = await evaluatePronunciation(
  wav(clearSpeech), '企鵝', 'kei5 ngo2', fakeSdk);
assert.equal(gatedWrongPhrase.status, 'retry');
assert.equal(gatedWrongPhrase.score, 58.7);
assert.equal(gatedWrongPhrase.transcript, '你好');
assert.equal(azureRequests, 1, 'a submission must cost exactly one Azure round trip');
assert.equal(gatedWrongPhrase.timing.azureRequests, 1);

azureRequests = 0;
currentRecognition = { transcript: '不清楚', confidence: 0.1 };
const uncertainPhrase = await evaluatePronunciation(
  wav(clearSpeech), '企鵝', 'kei5 ngo2', fakeSdk);
assert.equal(uncertainPhrase.status, 'inconclusive');
assert.equal(uncertainPhrase.score, null);
assert.equal(azureRequests, 1, 'uncertain content must not cost a second Azure round trip');

assessmentCalls = 0;
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
  wav(clearSpeech), '海豚', 'hoi2 tyun4', fakeSdk, { assignmentId: 'assignment-1', itemId: 'item-sea' });
assert.equal(currentItemToneMistake.score, 95,
  '海豚 read as 開豚 must remain below 100 even when scripted Azure returns all 100');
assert.equal(currentItemToneMistake.diagnostics.reference.text, '海豚');
assert.equal(currentItemToneMistake.diagnostics.reference.itemId, 'item-sea');
assert.equal(currentItemToneMistake.diagnostics.combined.acousticScore, 100);
assert.equal(currentItemToneMistake.diagnostics.combined.recognizedPronunciationScore, 87.5);
assert.equal(currentItemToneMistake.contentCheck.candidates.length, 2,
  'the detailed Azure NBest response must be preserved for auditing');
assert.equal(currentItemToneMistake.timing.azureRequests, 1);

assessmentCalls = 0;
azureRequests = 0;
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
  wav(clearSpeech), '企鵝', 'kei5 ngo2', fakeSdk);
assert.equal(gatedCorrectPhrase.status, 'pass');
assert.equal(gatedCorrectPhrase.score, 93.9);
assert.equal(gatedCorrectPhrase.contentCheck.status, 'matched');
assert.equal(gatedCorrectPhrase.timing.azureRequests, 1);
assert.equal(assessmentCalls, 1, 'the single round trip must carry the assessment config');
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
assert.match(halfRead.message, /未讀完/,
  'an unfinished answer must be reported as unfinished, not as the wrong word');

// 你 is nei5 or lei5 in the dictionary; both are valid and neither is an error.
const lazyOnset = compareRecognizedContent(
  { transcript: '李好', confidence: 0.9 }, '你好', 'nei5 hou2');
assert.equal(lazyOnset.pronunciationScore, 100,
  'a second valid reading of the same character must not be scored as a mistake');

const window = extractBestWindow(
  expectedUnits('你好', 'nei5 hou2'),
  jyutpingUnits('旱上料刷你好料刺尹料'),
);
assert.equal(window.score, 100);
assert.deepEqual([window.start, window.end], [4, 6]);

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
  evaluatePronunciation(wav(clearSpeech), '企鵝', 'kei5 ngo2', slowSdk),
  evaluatePronunciation(wav(clearSpeech), '企鵝', 'kei5 ngo2', slowSdk),
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
