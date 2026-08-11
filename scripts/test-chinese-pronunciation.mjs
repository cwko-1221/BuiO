import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { analyzeWavQuality } = require('../chinese-app/lib/audioQuality');
const { classifyAccuracy, assessPronunciation } = require('../chinese-app/lib/pronunciation');

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
assert.equal(classifyAccuracy(82).status, 'pass');
assert.equal(classifyAccuracy(42).status, 'retry');
assert.equal(classifyAccuracy(65).status, 'inconclusive');
assert.equal(classifyAccuracy(Number.NaN).status, 'inconclusive');

const originalKey = process.env.AZURE_SPEECH_KEY;
const originalRegion = process.env.AZURE_SPEECH_REGION;
process.env.AZURE_SPEECH_KEY = 'test-key';
process.env.AZURE_SPEECH_REGION = 'test-region';
class FakeRecognizer {
  recognizeOnceAsync(resolve) { resolve({ reason: 1, text: '好' }); }
  close() {}
}
class FakeAssessmentConfig { applyTo() {} }
const fakeSdk = {
  SpeechConfig: { fromSubscription: () => ({}) },
  AudioConfig: { fromWavFileInput: () => ({}) },
  SpeechRecognizer: FakeRecognizer,
  PronunciationAssessmentConfig: FakeAssessmentConfig,
  PronunciationAssessmentGradingSystem: { HundredMark: 1 },
  PronunciationAssessmentGranularity: { Word: 2 },
  OutputFormat: { Detailed: 1 },
  ResultReason: { RecognizedSpeech: 1, NoMatch: 0 },
  CancellationDetails: { fromResult: () => ({ errorDetails: '' }) },
  PronunciationAssessmentResult: { fromResult: () => ({
    accuracyScore: 81.4,
    pronunciationScore: 79,
    completenessScore: 100,
    fluencyScore: 77,
    detailResult: {
      Words: [{ Word: '好', PronunciationAssessment: { AccuracyScore: 81.4, ErrorType: 'None' } }],
    },
  }) },
};
const assessed = await assessPronunciation(wav(clearSpeech), '好', fakeSdk);
assert.equal(assessed.status, 'pass');
assert.equal(assessed.score, 81);
assert.equal(assessed.transcript, '好');
assert.deepEqual(assessed.words, [{ word: '好', accuracyScore: 81.4, errorType: 'None' }]);
if (originalKey == null) delete process.env.AZURE_SPEECH_KEY;
else process.env.AZURE_SPEECH_KEY = originalKey;
if (originalRegion == null) delete process.env.AZURE_SPEECH_REGION;
else process.env.AZURE_SPEECH_REGION = originalRegion;

console.log('✅ Cantonese pronunciation scoring and audio quality tests passed.');
