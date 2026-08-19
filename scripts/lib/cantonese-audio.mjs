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
