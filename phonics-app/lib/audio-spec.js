'use strict';

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function ipaFor(segment, accent) {
  return accent === 'en-us' ? segment.ipaUs : segment.ipaGb;
}

function positiveInteger(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw Object.assign(new Error(`${field} 無效`), { statusCode: 400 });
  return parsed;
}

function nonNegativeInteger(value, field) {
  if (value === undefined || value === null || value === '') {
    throw Object.assign(new Error(`${field} 無效`), { statusCode: 400 });
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw Object.assign(new Error(`${field} 無效`), { statusCode: 400 });
  return parsed;
}

function buildAudioSpec(entry, accent, options = {}) {
  if (!entry) throw Object.assign(new Error('無效的 Phonics 單字。'), { statusCode: 400 });
  const audioType = String(options.audioType || 'word').toLowerCase();
  if (audioType === 'word') {
    return {
      audioType,
      cacheId: `${entry.id}:word`,
      text: entry.spelling,
      speakingRate: 0.9,
    };
  }

  let ipa;
  let cacheId;
  if (audioType === 'segment') {
    const segmentIndex = nonNegativeInteger(options.segmentIndex, 'segmentIndex');
    if (segmentIndex >= entry.segments.length) throw Object.assign(new Error('segmentIndex 無效'), { statusCode: 400 });
    ipa = ipaFor(entry.segments[segmentIndex], accent);
    cacheId = `${entry.id}:segment:${segmentIndex}`;
  } else if (audioType === 'blend') {
    const blendLength = positiveInteger(options.blendLength, 'blendLength');
    if (blendLength > entry.segments.length) throw Object.assign(new Error('blendLength 無效'), { statusCode: 400 });
    ipa = entry.segments.slice(0, blendLength).map(segment => ipaFor(segment, accent)).join('');
    cacheId = `${entry.id}:blend:${blendLength}`;
  } else {
    throw Object.assign(new Error('audioType 只可為 word、segment 或 blend'), { statusCode: 400 });
  }

  return {
    audioType,
    cacheId,
    ipa,
    ssml: `<speak><phoneme alphabet="ipa" ph="${escapeXml(ipa)}">${escapeXml(entry.spelling)}</phoneme></speak>`,
    speakingRate: audioType === 'segment' ? 0.78 : 0.84,
  };
}

module.exports = { buildAudioSpec };
