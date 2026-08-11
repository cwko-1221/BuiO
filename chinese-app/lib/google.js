'use strict';

let textToSpeech;
let _ttsClient = null;

function lazyLoad() {
  if (!textToSpeech) {
    textToSpeech = require('@google-cloud/text-to-speech');
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

async function synthesizeSsml(ssml, opts = {}) {
  const languageCode = opts.languageCode || 'en-GB';
  const ssmlGender = opts.ssmlGender || 'FEMALE';
  const speakingRate = opts.speakingRate || 0.9;
  const [response] = await ttsClient().synthesizeSpeech({
    input: { ssml },
    voice: { languageCode, ssmlGender },
    audioConfig: { audioEncoding: 'MP3', speakingRate },
  });
  if (!response.audioContent) throw new Error('Google TTS did not return audio.');
  return Buffer.from(response.audioContent);
}

async function synthesizeCantonese(text) {
  return synthesize(text, { languageCode: 'yue-HK', ssmlGender: 'FEMALE', speakingRate: 0.9 });
}

// Pay the full first-call cost at server boot — not just the lazy require()
// and client construction, but also the first DNS + TLS + HTTP/2 handshake
// against texttospeech.googleapis.com and whatever discovery metadata the
// client fetches on its first request. We discard the audio.
// Single tiny request per boot ≈ a fraction of a cent.
async function warmup() {
  if (!isGoogleConfigured()) return;
  try {
    lazyLoad();
    ttsClient();
    await synthesize('a', { languageCode: 'en-US', speakingRate: 1 });
    console.log('[chinese] Google TTS pre-warmed (connection pool live)');
  } catch (e) {
    console.warn('[chinese] Google warmup failed:', e.message);
  }
}

module.exports = { isGoogleConfigured, synthesize, synthesizeSsml, synthesizeCantonese, warmup };
