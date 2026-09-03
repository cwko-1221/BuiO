'use strict';

function numericEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function booleanEnv(name, fallback) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return !['0', 'false', 'no', 'off'].includes(raw);
}

function percentile(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

function decodePcm16Wav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44
      || buffer.toString('ascii', 0, 4) !== 'RIFF'
      || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('錄音必須是 WAV 格式。');
  }

  let offset = 12;
  let format = null;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) throw new Error('WAV 錄音資料不完整。');
    if (id === 'fmt ' && size >= 16) {
      format = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === 'data') {
      dataOffset = start;
      dataLength = size;
    }
    offset = start + size + (size % 2);
  }

  if (!format || dataOffset < 0) throw new Error('WAV 錄音缺少音訊資料。');
  if (format.audioFormat !== 1 || format.bitsPerSample !== 16 || format.channels !== 1) {
    throw new Error('錄音必須是單聲道 16-bit PCM WAV。');
  }
  const count = Math.floor(dataLength / 2);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) samples[i] = buffer.readInt16LE(dataOffset + i * 2) / 32768;
  return { ...format, samples };
}

function analyzeWavQuality(buffer) {
  const { samples, sampleRate } = decodePcm16Wav(buffer);
  const durationMs = samples.length / sampleRate * 1000;
  const frameSize = Math.max(1, Math.round(sampleRate * 0.02));
  const frameRms = [];
  let sumSquares = 0;
  let peak = 0;
  let clipped = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.abs(samples[i]);
    sumSquares += value * value;
    peak = Math.max(peak, value);
    if (value >= 0.995) clipped += 1;
  }
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(samples.length, start + frameSize);
    let frameSquares = 0;
    for (let i = start; i < end; i += 1) frameSquares += samples[i] * samples[i];
    frameRms.push(Math.sqrt(frameSquares / Math.max(1, end - start)));
  }

  const sortedFrames = [...frameRms].sort((a, b) => a - b);
  const noiseRms = percentile(sortedFrames, 0.1);
  const voiceRms = percentile(sortedFrames, 0.9);
  const rms = Math.sqrt(sumSquares / Math.max(1, samples.length));
  const snrDb = 20 * Math.log10((voiceRms + 1e-6) / (noiseRms + 1e-6));
  const clippedRatio = clipped / Math.max(1, samples.length);

  const metrics = {
    durationMs: Math.round(durationMs),
    sampleRate,
    rms: Number(rms.toFixed(4)),
    peak: Number(peak.toFixed(4)),
    noiseRms: Number(noiseRms.toFixed(4)),
    voiceRms: Number(voiceRms.toFixed(4)),
    snrDb: Number(snrDb.toFixed(1)),
    clippedRatio: Number(clippedRatio.toFixed(4)),
  };

  const noisy = durationMs >= 800 && noiseRms > numericEnv('CHINESE_AUDIO_NOISE_RMS', 0.025)
    && snrDb < numericEnv('CHINESE_AUDIO_MIN_SNR_DB', 5);

  if (durationMs < numericEnv('CHINESE_AUDIO_MIN_MS', 300)) {
    return { ok: false, reason: 'too-short', message: '錄音太短，請按下錄音後完整讀出答案。', metrics };
  }
  if (voiceRms < numericEnv('CHINESE_AUDIO_MIN_VOICE_RMS', 0.006)) {
    return { ok: false, reason: 'too-quiet', message: '收音太小聲，請把 iPad 或咪高峰移近一點再試。', metrics };
  }
  if (clippedRatio > numericEnv('CHINESE_AUDIO_MAX_CLIPPED_RATIO', 0.05)) {
    return { ok: false, reason: 'clipping', message: '聲音過大而失真，請稍為遠離咪高峰再試。', metrics };
  }
  // Classroom noise no longer blocks scoring. The scorer now extracts the
  // stretch of syllables that matches the question, so a noisy recording that
  // still contains the answer can be marked. The metric is reported so a
  // teacher can see why a score was low, and the old hard gate is available
  // through CHINESE_AUDIO_NOISE_GATE for a quiet room.
  if (noisy && booleanEnv('CHINESE_AUDIO_NOISE_GATE', false)) {
    return { ok: false, reason: 'too-noisy', message: '環境聲音太嘈，未能公平評分；請靠近咪高峰再試。', metrics };
  }
  return { ok: true, reason: 'ok', warning: noisy ? 'noisy' : '', message: '', metrics };
}

module.exports = { decodePcm16Wav, analyzeWavQuality };
