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

function apiKeyFromEnv() {
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY.trim();
  // Tolerate users pasting an API key into GOOGLE_CREDENTIALS_JSON by mistake.
  const raw = (process.env.GOOGLE_CREDENTIALS_JSON || '').trim();
  if (raw && !raw.startsWith('{') && /^AIza[\w-]{20,}$/.test(raw)) return raw;
  return null;
}

function isGoogleConfigured() {
  return !!apiKeyFromEnv()
      || !!process.env.GOOGLE_CREDENTIALS_JSON
      || !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
}

function googleClientOptions() {
  const apiKey = apiKeyFromEnv();
  if (apiKey) return { apiKey };
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    try {
      return { credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON) };
    } catch (e) {
      throw new Error('GOOGLE_CREDENTIALS_JSON is not valid JSON. If you pasted an API key (starting with "AIza..."), set it in GOOGLE_API_KEY instead.');
    }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return {};
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

async function synthesize(text, opts = {}) {
  const languageCode = opts.languageCode || 'yue-HK';
  const ssmlGender = opts.ssmlGender || 'FEMALE';
  const speakingRate = opts.speakingRate || 0.9;
  const [response] = await ttsClient().synthesizeSpeech({
    input: { text },
    voice: { languageCode, ssmlGender },
    audioConfig: { audioEncoding: 'MP3', speakingRate },
  });
  if (!response.audioContent) throw new Error('Google TTS did not return audio.');
  return Buffer.from(response.audioContent);
}

async function synthesizeCantonese(text) {
  return synthesize(text, { languageCode: 'yue-HK', ssmlGender: 'FEMALE', speakingRate: 0.9 });
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

module.exports = { isGoogleConfigured, synthesize, synthesizeCantonese, transcribeCantonese };
