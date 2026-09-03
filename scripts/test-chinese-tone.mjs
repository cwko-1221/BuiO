import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { speakTones, speakJyutping, resetVoiceNoise } from './lib/cantonese-audio.mjs';

const require = createRequire(import.meta.url);
const { analyzeTones, expectedTones, TONE_TARGETS } =
  require('../chinese-app/lib/toneAnalysis.js');

// Audio is built from the Chao tone letters themselves, so a reading is correct
// by construction and the analyser has to recover the tone it was given.
const RATE = 16000;
const BASE_HZ = 190;
const SPAN_SEMITONES = 8;
const hzAt = level => BASE_HZ * Math.pow(2, ((level - 1) / 4) * SPAN_SEMITONES / 12);

function syllable(tone, ms = 320) {
  const target = TONE_TARGETS[String(tone)];
  const from = hzAt(target.start);
  const to = hzAt(target.end);
  const count = Math.round(ms / 1000 * RATE);
  const out = new Float32Array(count);
  let phase = 0;
  for (let i = 0; i < count; i += 1) {
    const hz = from + (to - from) * (i / count);
    phase += 2 * Math.PI * hz / RATE;
    let value = 0;
    for (let harmonic = 1; harmonic <= 6; harmonic += 1) {
      value += Math.sin(phase * harmonic) / harmonic;
    }
    out[i] = value * 0.25 * Math.min(1, Math.min(i, count - i) / (0.08 * count));
  }
  return out;
}

const gap = ms => new Float32Array(Math.round(ms / 1000 * RATE));

function wav(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const part of parts) { samples.set(part, offset); offset += part.length; }
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(RATE, 24); buffer.writeUInt32LE(RATE * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767), 44 + index * 2);
  });
  return buffer;
}

const read = (...tones) => wav(tones.flatMap((tone, index) =>
  index ? [gap(90), syllable(tone)] : [syllable(tone)]));

assert.deepEqual(expectedTones('hoi2 tyun4'), ['2', '4']);
assert.deepEqual(expectedTones(''), []);
assert.equal(analyzeTones(read(2, 4), ''), null, 'no expected tones means no tone score');
assert.equal(analyzeTones(Buffer.alloc(10), 'hoi2 tyun4'), null,
  'audio that cannot be decoded must report no evidence rather than a bad score');

// 海豚 hoi2 tyun4, read correctly.
const correct = analyzeTones(read(2, 4), 'hoi2 tyun4');
assert.ok(correct.score >= 90, `a correct reading must score high, got ${correct.score}`);
assert.equal(correct.measuredSyllables, 2);

// The three readings the teacher reported passing at 98%. Azure scored every
// phoneme 100 for all of them and its recogniser rewrote each one back to 海豚,
// because zh-HK has no tone assessment at all: prosody is en-US only.
const wrongSecondTone = analyzeTones(read(2, 2), 'hoi2 tyun4');   // 海短
const wrongFirstTone = analyzeTones(read(1, 4), 'hoi2 tyun4');    // 開豚
assert.ok(wrongSecondTone.score < 70,
  `海短 read for 海豚 must not pass, got ${wrongSecondTone.score}`);
assert.ok(wrongFirstTone.score < 70,
  `開豚 read for 海豚 must not pass, got ${wrongFirstTone.score}`);
assert.ok(correct.score - wrongSecondTone.score > 30,
  'a wrong tone must be clearly separated from a right one');

// Tones 4 and 6 differ only by a slight fall, and 3 and 5 only by a slight
// rise. Both cost marks without being treated as a different word.
const nearMiss = analyzeTones(read(2, 6), 'hoi2 tyun4');          // 海斷
assert.ok(nearMiss.score < correct.score,
  'a near-neighbour tone must still cost marks');
assert.ok(nearMiss.score > wrongSecondTone.score,
  'a near-neighbour tone must cost less than an opposite contour');

// A word whose tones only span part of the range must not be stretched across
// all five levels: 工作坊 is 1, 3, 1 and never goes below level 3.
const threeSyllables = analyzeTones(read(1, 3, 1), 'gung1 zok3 fong1');
assert.equal(threeSyllables.measuredSyllables, 3);
assert.ok(threeSyllables.score >= 90,
  `a correct three-syllable reading must score high, got ${threeSyllables.score}`);
assert.ok(analyzeTones(read(1, 5, 1), 'gung1 zok3 fong1').score < threeSyllables.score,
  'a wrong middle tone must cost marks');

// A single syllable gives nothing to judge pitch height against, so only the
// contour is scored and a high reading of a low level tone is not punished.
const soloCorrect = analyzeTones(read(1), 'jing1');
assert.ok(soloCorrect.score >= 85, `a solo level tone must score high, got ${soloCorrect.score}`);
assert.ok(analyzeTones(read(2), 'jing1').score < soloCorrect.score,
  'a rising contour read for a level tone must cost marks even alone');

// ----- a real voice, not a pure tone ----------------------------------------
// Every test above passed while the pitch tracker was slipping octaves on real
// speech: a correctly read 海豚 came back spanning 102 Hz to 410 Hz with both
// contours inverted, and scored 47%. Pure tones never exercised that, so the
// voice below is a glottal pulse train through formant resonators, with jitter
// and breath noise, at three different vocal ranges.
const VOICES = [
  ['a child around 250 Hz', 1],
  ['an adult around 125 Hz', 0.5],
  ['a low voice around 100 Hz', 0.4],
];

for (const [who, pitchScale] of VOICES) {
  resetVoiceNoise();
  const spoken = analyzeTones(speakJyutping('hoi2 tyun4', { pitchScale }), 'hoi2 tyun4');
  assert.ok(spoken, `${who} reading 海豚 correctly must be measurable`);
  assert.ok(spoken.score >= 85,
    `${who} reading 海豚 correctly must not be failed, got ${spoken.score}`);
  // The octave error showed up here first: two octaves of range on one word.
  assert.ok(spoken.speakerRange.spanSemitones <= 12,
    `${who} cannot span ${spoken.speakerRange.spanSemitones} semitones on one word`);
  assert.equal(spoken.measuredSyllables, 2);
  assert.ok(spoken.syllables[0].contour.slope > 0,
    `a rising tone must be measured as rising for ${who}`);
  assert.ok(spoken.syllables[1].contour.slope < 0,
    `a falling tone must be measured as falling for ${who}`);

  resetVoiceNoise();
  const wrongSecond = analyzeTones(speakTones([2, 2], { pitchScale }), 'hoi2 tyun4');
  assert.ok(wrongSecond.score < 70,
    `${who} reading 海短 must not pass, got ${wrongSecond.score}`);
  resetVoiceNoise();
  const wrongFirst = analyzeTones(speakTones([1, 4], { pitchScale }), 'hoi2 tyun4');
  assert.ok(wrongFirst.score < 70,
    `${who} reading 開豚 must not pass, got ${wrongFirst.score}`);
  assert.ok(spoken.score - wrongSecond.score > 30,
    `right and wrong must stay far apart for ${who}`);
}

// A three-syllable word on a real voice, where the tones only span part of the
// range and nothing may be stretched to fill it.
resetVoiceNoise();
const spokenThree = analyzeTones(speakJyutping('gung1 zok3 fong1'), 'gung1 zok3 fong1');
assert.ok(spokenThree.score >= 85,
  `工作坊 read correctly on a real voice must not be failed, got ${spokenThree.score}`);
assert.equal(spokenThree.measuredSyllables, 3);

// Noise carries no pitch, so it must report no evidence rather than a bad
// score. A tone score is only allowed to cost marks when it was measured.
let hiss = 1234567;
const noise = new Float32Array(16000).map(() => {
  hiss = (hiss * 16807) % 2147483647;
  return (hiss / 2147483647 * 2 - 1) * 0.2;
});
const fromNoise = analyzeTones(wav([noise]), 'hoi2 tyun4');
assert.ok(fromNoise === null || fromNoise.score === null,
  'an unpitched recording must report no tone evidence, not a low score');

console.log('✅ Cantonese tone analysis tests passed.');
