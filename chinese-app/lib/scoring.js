'use strict';

const { getJyutpingText } = require('to-jyutping');

function normalize(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[，。！？、,.!?'"`\s]/g, '');
}

function levenshtein(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      matrix[i][j] = a[i - 1] === b[j - 1]
        ? matrix[i - 1][j - 1]
        : Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
    }
  }
  return matrix[a.length][b.length];
}

function speechScore(transcript, expected) {
  const a = normalize(transcript);
  const b = normalize(expected);
  if (!a || !b) return { correct: false, confidence: 0, score: 0 };
  if (a.includes(b) || b.includes(a)) return { correct: true, confidence: 0.95, score: 100 };

  const aJp = getJyutpingText(a);
  const bJp = getJyutpingText(b);

  const charScore = Math.max(0, 1 - levenshtein(a, b) / Math.max(a.length, b.length)) * 100;
  const jpScore = Math.max(0, 1 - levenshtein(aJp, bJp) / Math.max(aJp.length, bJp.length)) * 100;
  const aJpNoTone = aJp.replace(/\d/g, '');
  const bJpNoTone = bJp.replace(/\d/g, '');
  const jpNoToneScore = Math.max(0, 1 - levenshtein(aJpNoTone, bJpNoTone)
    / Math.max(aJpNoTone.length, bJpNoTone.length)) * 100 * 0.9;

  const finalScore = Math.max(charScore, jpScore, jpNoToneScore);
  return {
    correct: finalScore >= 75,
    confidence: finalScore / 100,
    score: Math.round(finalScore),
  };
}

module.exports = { speechScore };
