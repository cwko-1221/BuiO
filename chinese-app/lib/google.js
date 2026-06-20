'use strict';

const { speechScore } = require('./scoring');

let textToSpeech, speech, audioEncoding;
let _ttsClient = null;
let _sttClient = null;

function lazyLoad() {
  if (!textToSpeech) {
    textToSpeech = require('@google-cloud/text-to-speech');
    speech = require('@google-cloud/speech');
    audioEncoding = speech.protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding;
  }
}

function isGoogleConfigured() {
  return !!(process.env.GOOGLE_CREDENTIALS_JSON || process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

function googleClientOptions() {
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    return { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON) };
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return {};
  }
  throw new Error('Google Cloud credentials are not configured.');
}

function ttsClient() {
  lazyLoad();
  if (!_ttsClient) _ttsClient = new textToSpeech.TextToSpeechClient({ ...googleClientOptions(), fallback: true });
  return _ttsClient;
}

function sttClient() {
  lazyLoad();
  if (!_sttClient) _sttClient = new speech.SpeechClient({ ...googleClientOptions(), fallback: true });
  return _sttClient;
}

async function synthesizeCantonese(text) {
  const [response] = await ttsClient().synthesizeSpeech({
    input: { text },
    voice: { languageCode: 'yue-HK', ssmlGender: 'FEMALE' },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
  });
  if (!response.audioContent) throw new Error('Google TTS did not return audio.');
  return Buffer.from(response.audioContent);
}

function recognitionConfig({ mimeType, sampleRateHertz }) {
  lazyLoad();
  const m = String(mimeType || '').toLowerCase();
  const rate = sampleRateHertz > 0 ? sampleRateHertz : 48000;
  const base = { sampleRateHertz: rate, languageCode: 'yue-HK', enableAutomaticPunctuation: false, model: 'default' };
  if (m.includes('webm')) return { ...base, encoding: audioEncoding.WEBM_OPUS };
  if (m.includes('ogg')) return { ...base, encoding: audioEncoding.OGG_OPUS };
  if (m.includes('wav') || m.includes('wave')) return { ...base, encoding: audioEncoding.LINEAR16 };
  throw new Error('此瀏覽器的錄音格式未支援，請改用 Safari/Chrome 最新版本或使用自我評估。');
}

async function transcribeCantonese(audio, expectedText, metadata) {
  if (!audio || audio.length === 0) throw new Error('錄音內容是空的，請重新錄音。');
  const [response] = await sttClient().recognize({
    audio: { content: audio },
    config: recognitionConfig(metadata),
  });
  const best = response.results?.[0]?.alternatives?.[0];
  const transcript = best?.transcript ?? '';
  const score = speechScore(transcript, expectedText);
  return { ...score, transcript, confidence: best?.confidence ?? score.confidence };
}

module.exports = { isGoogleConfigured, synthesizeCantonese, transcribeCantonese };
