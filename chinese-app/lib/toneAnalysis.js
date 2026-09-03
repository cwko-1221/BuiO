'use strict';

// Cantonese tone is pitch, and Azure does not measure it for zh-HK: prosody
// assessment is en-US only. Both of the signals the scorer had were blind to it.
// Scripted assessment force-aligns to the reference and returned 100 across
// every phoneme for 海短 read against 海豚, and the reference-free recogniser
// corrected the non-word 海短 back to the real word 海豚. Pitch is therefore
// measured here, straight from the recording, where no language model can
// tidy it away.

const { decodePcm16Wav } = require('./audioQuality');

// Chao tone letters: pitch height at the start and the end of the syllable on a
// five-point scale, where 5 is the top of this speaker's own range.
const TONE_TARGETS = {
  1: { start: 5, end: 5 },
  2: { start: 2, end: 5 },
  3: { start: 3, end: 3 },
  4: { start: 2, end: 1 },
  5: { start: 2, end: 3 },
  6: { start: 2, end: 2 },
};

function numericEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function percentileOf(sorted, ratio) {
  if (!sorted.length) return 0;
  const index = Math.min(sorted.length - 1,
    Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return sorted[index];
}

// Pitch is found with YIN rather than plain autocorrelation. Autocorrelation
// picks the lag with the strongest correlation, and for a voice that is often
// twice or half the real period: a correctly read 海豚 came back with a
// two-octave range, 102 Hz to 410 Hz, and both syllable contours inverted.
// YIN takes the *first* period whose normalised difference drops below a
// threshold, which is what keeps it on the fundamental.
function framePitch(samples, start, length, sampleRate, minHz, maxHz) {
  const end = Math.min(samples.length, start + length);
  const size = end - start;
  if (size < 64) return 0;

  let mean = 0;
  for (let i = start; i < end; i += 1) mean += samples[i];
  mean /= size;
  const frame = new Float32Array(size);
  for (let i = 0; i < size; i += 1) frame[i] = samples[start + i] - mean;

  let energy = 0;
  for (let i = 0; i < size; i += 1) energy += frame[i] * frame[i];
  if (energy < 1e-7) return 0;

  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(Math.floor(size / 2), Math.floor(sampleRate / minHz));
  if (maxLag <= minLag) return 0;

  // Squared difference, then normalised by its own running mean so that the
  // value at each lag says how much better that lag is than the lags before it.
  const difference = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag += 1) {
    let total = 0;
    for (let i = 0; i + lag < size; i += 1) {
      const delta = frame[i] - frame[i + lag];
      total += delta * delta;
    }
    difference[lag] = total;
  }
  const normalised = new Float32Array(maxLag + 1);
  normalised[0] = 1;
  let runningSum = 0;
  for (let lag = 1; lag <= maxLag; lag += 1) {
    runningSum += difference[lag];
    normalised[lag] = runningSum > 0 ? difference[lag] * lag / runningSum : 1;
  }

  const threshold = numericEnv('CHINESE_TONE_YIN_THRESHOLD', 0.15);
  let chosen = -1;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    if (normalised[lag] >= threshold) continue;
    // Walk to the bottom of this dip rather than stopping at its edge.
    while (lag + 1 <= maxLag && normalised[lag + 1] < normalised[lag]) lag += 1;
    chosen = lag;
    break;
  }
  if (chosen < 0) {
    let best = minLag;
    for (let lag = minLag; lag <= maxLag; lag += 1) {
      if (normalised[lag] < normalised[best]) best = lag;
    }
    if (normalised[best] > numericEnv('CHINESE_TONE_YIN_FALLBACK', 0.4)) return 0;
    chosen = best;
  }

  // Parabolic interpolation around the dip, so the contour is not quantised to
  // whole samples of lag.
  const previous = normalised[Math.max(minLag, chosen - 1)];
  const next = normalised[Math.min(maxLag, chosen + 1)];
  const divisor = previous + next - 2 * normalised[chosen];
  const shift = Math.abs(divisor) < 1e-9 ? 0 : (previous - next) / (2 * divisor);
  return sampleRate / (chosen + Math.max(-1, Math.min(1, shift)));
}

function pitchTrack(samples, sampleRate) {
  const frameLength = Math.round(sampleRate * 0.04);
  const hop = Math.round(sampleRate * 0.01);
  const minHz = numericEnv('CHINESE_TONE_MIN_HZ', 70);
  const maxHz = numericEnv('CHINESE_TONE_MAX_HZ', 600);
  const frames = [];
  for (let start = 0; start + frameLength <= samples.length; start += hop) {
    let squares = 0;
    for (let i = start; i < start + frameLength; i += 1) squares += samples[i] * samples[i];
    frames.push({
      timeMs: (start / sampleRate) * 1000,
      rms: Math.sqrt(squares / frameLength),
      hz: framePitch(samples, start, frameLength, sampleRate, minHz, maxHz),
    });
  }
  return frames;
}

// Even YIN slips an octave on a creaky or breathy frame. Anything sitting close
// to double or half the utterance's own median is folded back, and a short
// median filter removes what is left. The guard is set wide enough that a real
// speaking range, which rarely exceeds an octave on one word, is never folded.
function repairOctaves(frames) {
  const voiced = frames.filter(frame => frame.hz > 0).map(frame => frame.hz);
  if (voiced.length < 3) return frames;
  const sorted = [...voiced].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const guard = Math.max(1.4, numericEnv('CHINESE_TONE_OCTAVE_GUARD', 1.7));

  const corrected = frames.map(frame => {
    if (!frame.hz) return frame;
    let hz = frame.hz;
    while (hz > median * guard) hz /= 2;
    while (hz < median / guard) hz *= 2;
    return { ...frame, hz };
  });

  const width = 2;
  return corrected.map((frame, index) => {
    if (!frame.hz) return frame;
    const window = [];
    for (let i = index - width; i <= index + width; i += 1) {
      if (corrected[i] && corrected[i].hz > 0) window.push(corrected[i].hz);
    }
    if (window.length < 3) return frame;
    window.sort((a, b) => a - b);
    return { ...frame, hz: window[Math.floor(window.length / 2)] };
  });
}

// A syllable is a run of frames that are both voiced and loud enough to be the
// speaker rather than the room. Short gaps inside a run are bridged, because a
// stop consonant in the middle of a syllable silences it briefly.
function voicedRuns(frames) {
  const loud = frames.map(frame => frame.rms).filter(rms => rms > 0).sort((a, b) => a - b);
  const floor = percentileOf(loud, 0.5) * numericEnv('CHINESE_TONE_VOICED_RATIO', 0.35);
  const bridgeFrames = Math.max(1, Math.round(numericEnv('CHINESE_TONE_BRIDGE_MS', 60) / 10));
  const runs = [];
  let current = null;
  let silence = 0;
  frames.forEach((frame, index) => {
    const voiced = frame.hz > 0 && frame.rms >= floor;
    if (voiced) {
      silence = 0;
      if (!current) {
        current = { from: index, to: index };
        runs.push(current);
      } else current.to = index;
      return;
    }
    if (!current) return;
    silence += 1;
    if (silence > bridgeFrames) current = null;
  });
  return runs.filter(run => run.to - run.from >= 2);
}

// The expected syllable count is known from the question, so the longest runs
// are taken and put back in time order. A run long enough to hold two syllables
// is split at its quietest interior frame rather than being thrown away.
function selectSyllables(frames, runs, expectedCount) {
  let pool = runs.slice();
  while (pool.length < expectedCount && pool.length) {
    const widest = pool.reduce((longest, run) =>
      run.to - run.from > longest.to - longest.from ? run : longest, pool[0]);
    if (widest.to - widest.from < 8) break;
    const from = widest.from + 3;
    const to = widest.to - 3;
    let quietest = from;
    for (let index = from; index <= to; index += 1) {
      if (frames[index].rms < frames[quietest].rms) quietest = index;
    }
    pool = pool.filter(run => run !== widest).concat(
      { from: widest.from, to: quietest },
      { from: quietest + 1, to: widest.to },
    );
  }
  return pool
    .sort((a, b) => (b.to - b.from) - (a.to - a.from))
    .slice(0, expectedCount)
    .sort((a, b) => a.from - b.from);
}

function semitones(hz, reference) {
  return 12 * Math.log2(hz / reference);
}

// Pitch is read relative to the speaker rather than in absolute hertz, so a
// child and an adult reading the same word score the same.
//
// The scale is a fixed number of semitones per Chao level. Stretching whatever
// range the recording happened to contain across the full five levels was wrong:
// 工作坊 is tones 1, 3, 1, which only ever spans levels 3 to 5, and stretching
// that to 1-5 pushed a correctly read tone 3 down to level 1 and scored it 75.
//
// The scale is then anchored so the recording's average height matches the
// average height the question calls for. How high this speaker pitches their
// voice is unknowable from one short word, so it is cancelled out, leaving the
// differences within the recording — which is where a tone error actually
// shows up.
function speakerRange(frames, tones = []) {
  const voiced = frames.filter(frame => frame.hz > 0).map(frame => frame.hz);
  if (voiced.length < 3) return null;
  const sorted = [...voiced].sort((a, b) => a - b);
  const centreHz = Math.pow(2,
    voiced.reduce((sum, hz) => sum + Math.log2(hz), 0) / voiced.length);
  const levels = tones.flatMap(tone => {
    const target = TONE_TARGETS[String(tone)];
    return target ? [target.start, target.end] : [];
  });
  const centreLevel = levels.length
    ? levels.reduce((sum, level) => sum + level, 0) / levels.length
    : 3;
  return {
    centreHz,
    centreLevel,
    semitonesPerLevel: Math.max(0.5, numericEnv('CHINESE_TONE_SEMITONES_PER_LEVEL', 2)),
    low: percentileOf(sorted, 0.1),
    high: percentileOf(sorted, 0.9),
    median: percentileOf(sorted, 0.5),
    span: semitones(percentileOf(sorted, 0.9), percentileOf(sorted, 0.1)),
  };
}

function toChaoScale(hz, range) {
  if (!hz || !range) return null;
  const level = range.centreLevel + semitones(hz, range.centreHz) / range.semitonesPerLevel;
  return Math.min(6, Math.max(0, level));
}

function framesBetween(frames, startMs, endMs) {
  let from = -1;
  let to = -1;
  frames.forEach((frame, index) => {
    if (frame.timeMs < startMs || frame.timeMs > endMs) return;
    if (from < 0) from = index;
    to = index;
  });
  return from < 0 || to - from < 2 ? null : { from, to };
}

function syllableContour(frames, run, range) {
  const values = [];
  for (let index = run.from; index <= run.to; index += 1) {
    const level = toChaoScale(frames[index].hz, range);
    if (level !== null) values.push(level);
  }
  if (values.length < 2) return null;
  // The contour is fitted rather than read off the two ends. Averaging the
  // first and last third of a rising tone returns two thirds of the rise it
  // actually has, which flattened every contour towards level and scored a
  // correctly read rising tone at 83.
  const count = values.length;
  let sumT = 0;
  let sumV = 0;
  let sumTT = 0;
  let sumTV = 0;
  values.forEach((value, index) => {
    const t = count === 1 ? 0 : index / (count - 1);
    sumT += t;
    sumV += value;
    sumTT += t * t;
    sumTV += t * value;
  });
  const denominator = count * sumTT - sumT * sumT;
  const gradient = Math.abs(denominator) < 1e-9 ? 0 : (count * sumTV - sumT * sumV) / denominator;
  const intercept = (sumV - gradient * sumT) / count;
  const at = t => intercept + gradient * t;
  // The fit already discounts edge noise, so the contour is read end to end.
  // Sampling a tenth in from each side returned four fifths of the real slope
  // and made a flat tone look like a falling one.
  const start = at(0);
  const end = at(1);
  return {
    start: Math.round(start * 100) / 100,
    end: Math.round(end * 100) / 100,
    slope: Math.round((end - start) * 100) / 100,
    frames: values.length,
    startMs: Math.round(frames[run.from].timeMs),
    endMs: Math.round(frames[run.to].timeMs),
  };
}

// Level and direction are scored apart. A contour that runs the wrong way is a
// different tone; one that sits at the wrong height on the right shape is a
// milder error, and on a one-syllable answer there is no range to judge height
// against at all, so direction carries it.
function scoreContour(contour, tone, soloSyllable) {
  const target = TONE_TARGETS[String(tone)];
  if (!target || !contour) return null;
  const producedMean = (contour.start + contour.end) / 2;
  const targetMean = (target.start + target.end) / 2;
  const targetSlope = target.end - target.start;
  const levelError = Math.min(1, Math.abs(producedMean - targetMean) / 4);
  const slopeError = Math.min(1, Math.abs(contour.slope - targetSlope)
    / numericEnv('CHINESE_TONE_SLOPE_TOLERANCE', 3));
  const levelWeight = soloSyllable
    ? numericEnv('CHINESE_TONE_SOLO_LEVEL_WEIGHT', 0.2)
    : numericEnv('CHINESE_TONE_LEVEL_WEIGHT', 0.5);
  const score = 1 - (levelError * levelWeight + slopeError * (1 - levelWeight));
  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 10;
}

const CODAS = ['ng', 'p', 't', 'k', 'm', 'n'];
const VOICED_CODAS = ['ng', 'm', 'n'];
const CHECKED_CODAS = ['p', 't', 'k'];

// A Cantonese syllable is an optional onset, a nucleus, and an optional coda,
// which is exactly how many phonemes Azure reports for it: hoi2 is h + oi, and
// tyun4 is t + yu + n. Across thirteen archived recordings the count predicted
// from the Jyutping matched Azure's every time, which is what makes it safe to
// read the syllable boundaries out of Azure's phoneme timings.
function syllableStructure(syllable) {
  const match = String(syllable).match(/^([a-z]+)([1-6])$/);
  if (!match) return null;
  const body = match[1];
  const onset = JYUTPING_ONSETS_FOR_STRUCTURE
    .find(candidate => body.startsWith(candidate) && body.length > candidate.length) || '';
  const rime = body.slice(onset.length);
  const coda = CODAS.find(candidate => rime.endsWith(candidate) && rime.length > candidate.length) || '';
  return {
    onset, coda, tone: match[2],
    checked: CHECKED_CODAS.includes(coda),
    phonemeCount: (onset ? 1 : 0) + 1 + (coda ? 1 : 0),
  };
}

const JYUTPING_ONSETS_FOR_STRUCTURE = [
  'gw', 'kw', 'ng', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l',
  'g', 'k', 'h', 'w', 'z', 'c', 's', 'j',
];

// Guessing where a syllable starts from loudness alone drags the consonant and
// the silence around it into the contour. Azure hands back an offset and a
// duration for every phoneme, so the pitch can be read from the vowel alone.
// Measured that way, level and rising tones stopped overlapping: their average
// slopes moved from -0.42 against +0.80 to -0.28 against +2.80.
function vowelWindows(expectedJyutping, phonemes) {
  const syllables = (String(expectedJyutping || '').toLowerCase().match(/[a-z]+[1-6]/g) || [])
    .map(syllableStructure);
  if (!syllables.length || syllables.some(syllable => !syllable)) return null;
  const expected = syllables.reduce((sum, syllable) => sum + syllable.phonemeCount, 0);
  if (!Array.isArray(phonemes) || phonemes.length !== expected) return null;
  let index = 0;
  return syllables.map(syllable => {
    if (syllable.onset) index += 1;
    const nucleus = phonemes[index];
    let endMs = nucleus.endMs;
    index += 1;
    if (syllable.coda) {
      if (VOICED_CODAS.includes(syllable.coda)) endMs = phonemes[index].endMs;
      index += 1;
    }
    return {
      tone: syllable.tone,
      checked: syllable.checked,
      startMs: nucleus.startMs,
      endMs,
    };
  });
}

function phonemeTimings(words) {
  const timings = (words || []).flatMap(word => (word.phonemes || [])
    .filter(phoneme => Number.isFinite(phoneme.startMs) && Number.isFinite(phoneme.endMs))
    .map(phoneme => ({ startMs: phoneme.startMs, endMs: phoneme.endMs })));
  return timings.length ? timings : null;
}

function expectedTones(expectedJyutping) {
  return (String(expectedJyutping || '').toLowerCase().match(/[a-z]+[1-6]/g) || [])
    .map(syllable => syllable.slice(-1));
}

// Returns a 0-100 tone score for the recording, or null when the recording does
// not carry enough voiced pitch to judge. Null means "no evidence", never "bad":
// a tone score is only allowed to cost marks when it was actually measured.
function analyzeTones(buffer, expectedJyutping, phonemes = null) {
  const tones = expectedTones(expectedJyutping);
  if (!tones.length) return null;
  const windows = phonemes ? vowelWindows(expectedJyutping, phonemes) : null;

  let decoded;
  try { decoded = decodePcm16Wav(buffer); }
  catch { return null; }

  const frames = repairOctaves(pitchTrack(decoded.samples, decoded.sampleRate));
  const range = speakerRange(frames, tones);
  if (!range) return null;
  // A range this wide is a broken pitch track, not a speaker. Reporting no
  // evidence is right here: a wrong tone score fails a child who read correctly,
  // which is worse than not scoring the tone at all.
  const widestSpan = numericEnv('CHINESE_TONE_MAX_SPAN_ST', 15);
  if (!Number.isFinite(range.span) || range.span > widestSpan) return null;
  const voicedFrames = frames.filter(frame => frame.hz > 0).length;
  if (voicedFrames < Math.max(8, tones.length * 8)) return null;
  const runs = windows
    ? windows.map(window => framesBetween(frames, window.startMs, window.endMs))
    : selectSyllables(frames, voicedRuns(frames), tones.length);
  if (!runs.length) return null;

  const soloSyllable = tones.length === 1;
  const syllables = tones.map((tone, index) => {
    // A checked syllable is far too short to read a contour from, and it only
    // ever carries a level tone anyway, so it is measured and not scored.
    const checked = !!windows?.[index]?.checked;
    const contour = runs[index] ? syllableContour(frames, runs[index], range) : null;
    return {
      tone,
      target: TONE_TARGETS[String(tone)] || null,
      checked,
      contour,
      score: contour && !checked ? scoreContour(contour, tone, soloSyllable) : null,
    };
  });

  const measured = syllables.filter(syllable => syllable.score !== null);
  if (!measured.length) return null;
  // A single wrong tone is the whole error on a short word, so the weakest
  // syllable carries more than its share rather than being averaged away.
  const scores = measured.map(syllable => syllable.score);
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const weakest = Math.min(...scores);
  const weakestWeight = Math.min(1, Math.max(0,
    numericEnv('CHINESE_TONE_WEAKEST_WEIGHT', 0.5)));
  const score = mean * (1 - weakestWeight) + weakest * weakestWeight;

  return {
    score: Math.round(score * 10) / 10,
    syllables,
    measuredSyllables: measured.length,
    segmentedBy: windows ? 'azure-phoneme-offsets' : 'energy',
    expectedSyllables: tones.length,
    speakerRange: {
      lowHz: Math.round(range.low),
      highHz: Math.round(range.high),
      medianHz: Math.round(range.median),
      spanSemitones: Math.round(range.span * 10) / 10,
    },
  };
}

module.exports = {
  TONE_TARGETS,
  vowelWindows,
  phonemeTimings,
  syllableStructure,
  repairOctaves,
  analyzeTones,
  expectedTones,
  pitchTrack,
  voicedRuns,
  selectSyllables,
  syllableContour,
  scoreContour,
  speakerRange,
};
