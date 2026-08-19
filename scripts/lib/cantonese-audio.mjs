// Test audio built from the Chao tone letters themselves, so a reading is
// correct by construction and a scorer has to recover the tone it was given.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { TONE_TARGETS } = require('../../chinese-app/lib/toneAnalysis.js');

export const RATE = 16000;
const BASE_HZ = 190;
const SPAN_SEMITONES = 8;

export const hzAt = level => BASE_HZ * Math.pow(2, ((level - 1) / 4) * SPAN_SEMITONES / 12);

export function syllable(tone, ms = 320) {
  const target = TONE_TARGETS[String(tone)] || TONE_TARGETS['3'];
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

export const gap = ms => new Float32Array(Math.round(ms / 1000 * RATE));

export function wav(parts, sampleRate = RATE) {
  const list = Array.isArray(parts) ? parts : [parts];
  const total = list.reduce((sum, part) => sum + part.length, 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const part of list) { samples.set(part, offset); offset += part.length; }
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36); buffer.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767), 44 + index * 2);
  });
  return buffer;
}

// A recording of the given tones, in order.
export const readTones = (...tones) => wav(tones.flatMap((tone, index) =>
  index ? [gap(90), syllable(tone)] : [syllable(tone)]));

// A recording that reads the tones written in a Jyutping string correctly.
export const readJyutping = jyutping => readTones(
  ...(String(jyutping).toLowerCase().match(/[a-z]+[1-6]/g) || []).map(s => s.slice(-1)));

// ---------------------------------------------------------------------------
// A pure tone is not a fair test of a pitch tracker. The failure that reached
// production was an octave error on a real voice — a correctly read 海豚 came
// back spanning 102 Hz to 410 Hz with both contours inverted — and every pure
// tone test passed straight through it. What follows is a source-filter voice:
// a glottal pulse train shaped by formant resonators, with jitter and breath
// noise, which is where octave errors actually come from.
// ---------------------------------------------------------------------------

function resonator(input, freq, bandwidth, rate) {
  const r = Math.exp(-Math.PI * bandwidth / rate);
  const theta = 2 * Math.PI * freq / rate;
  const a1 = 2 * r * Math.cos(theta);
  const a2 = -(r * r);
  const gain = (1 - r) * Math.sqrt(1 - 2 * r * Math.cos(2 * theta) + r * r);
  const out = new Float32Array(input.length);
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < input.length; i += 1) {
    const y = gain * input[i] + a1 * y1 + a2 * y2;
    out[i] = y;
    y2 = y1;
    y1 = y;
  }
  return out;
}

let noiseSeed = 987654321;
function nextNoise() {
  noiseSeed = (noiseSeed * 16807) % 2147483647;
  return noiseSeed / 2147483647 * 2 - 1;
}

export function resetVoiceNoise(seed = 987654321) { noiseSeed = seed; }

// `pitchScale` moves the whole voice: 1 is a child around 250 Hz, 0.5 an adult.
export function voicedSyllable(tone, {
  ms = 320,
  pitchScale = 1,
  jitter = 0.02,
  breath = 0.02,
  formants = [730, 1090, 2440],
} = {}) {
  const target = TONE_TARGETS[String(tone)] || TONE_TARGETS['3'];
  const from = hzAt(target.start) * pitchScale;
  const to = hzAt(target.end) * pitchScale;
  const count = Math.round(ms / 1000 * RATE);

  const source = new Float32Array(count);
  let nextPulse = 0;
  for (let i = 0; i < count; i += 1) {
    if (i >= nextPulse) {
      source[i] = 1;
      const hz = from + (to - from) * (i / count);
      const period = RATE / (hz * (1 + jitter * nextNoise()));
      nextPulse = i + Math.max(2, period);
    }
    source[i] += breath * nextNoise();
  }

  let voiced = new Float32Array(count);
  formants.forEach((freq, index) => {
    const filtered = resonator(source, freq, 60 + index * 40, RATE);
    const weight = 1 / (index + 1);
    for (let i = 0; i < count; i += 1) voiced[i] += filtered[i] * weight;
  });

  let peak = 0;
  for (let i = 0; i < count; i += 1) peak = Math.max(peak, Math.abs(voiced[i]));
  const scale = peak > 0 ? 0.55 / peak : 0;
  for (let i = 0; i < count; i += 1) {
    const envelope = Math.min(1, Math.min(i, count - i) / (0.12 * count));
    voiced[i] *= scale * envelope;
  }
  return voiced;
}

export const speakTones = (tones, options = {}) => wav(tones.flatMap((tone, index) =>
  index ? [gap(80), voicedSyllable(tone, options)] : [voicedSyllable(tone, options)]));

export const speakJyutping = (jyutping, options = {}) => speakTones(
  (String(jyutping).toLowerCase().match(/[a-z]+[1-6]/g) || []).map(s => s.slice(-1)), options);
