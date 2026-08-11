'use strict';

let speechSdk;

function sdk() {
  if (!speechSdk) speechSdk = require('microsoft-cognitiveservices-speech-sdk');
  return speechSdk;
}

function credentials() {
  return {
    key: String(process.env.AZURE_SPEECH_KEY || '').trim(),
    region: String(process.env.AZURE_SPEECH_REGION || '').trim(),
  };
}

function isConfigured() {
  const { key, region } = credentials();
  return !!(key && region);
}

function numericEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function classifyAccuracy(score) {
  const passScore = numericEnv('AZURE_PRONUNCIATION_PASS_SCORE', 75);
  const retryScore = Math.min(passScore, numericEnv('AZURE_PRONUNCIATION_RETRY_SCORE', 55));
  if (!Number.isFinite(score)) return { status: 'inconclusive', correct: false, passScore, retryScore };
  if (score >= passScore) return { status: 'pass', correct: true, passScore, retryScore };
  if (score < retryScore) return { status: 'retry', correct: false, passScore, retryScore };
  return { status: 'inconclusive', correct: false, passScore, retryScore };
}

function assessPronunciation(audio, referenceText, sdkOverride = null) {
  if (!audio?.length) return Promise.reject(new Error('錄音內容是空的，請重新錄音。'));
  if (!String(referenceText || '').trim()) return Promise.reject(new Error('缺少發音評估參考文字。'));
  if (!isConfigured()) {
    const error = new Error('Azure 粵語發音評估尚未設定。');
    error.statusCode = 501;
    return Promise.reject(error);
  }

  const azure = sdkOverride || sdk();
  const { key, region } = credentials();
  const speechConfig = azure.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = 'zh-HK';
  speechConfig.outputFormat = azure.OutputFormat.Detailed;
  const audioConfig = azure.AudioConfig.fromWavFileInput(audio, 'recording.wav');
  const recognizer = new azure.SpeechRecognizer(speechConfig, audioConfig);
  const assessmentConfig = new azure.PronunciationAssessmentConfig(
    String(referenceText).trim(),
    azure.PronunciationAssessmentGradingSystem.HundredMark,
    azure.PronunciationAssessmentGranularity.Word,
    true,
  );
  assessmentConfig.applyTo(recognizer);

  return new Promise((resolve, reject) => {
    const close = () => { try { recognizer.close(); } catch {} };
    recognizer.recognizeOnceAsync(result => {
      try {
        if (result.reason === azure.ResultReason.NoMatch) {
          resolve({
            status: 'inconclusive', correct: false, score: null,
            transcript: '', provider: 'azure-pronunciation-zh-HK', words: [],
          });
          return;
        }
        if (result.reason !== azure.ResultReason.RecognizedSpeech) {
          const details = azure.CancellationDetails.fromResult(result);
          const error = new Error(details.errorDetails || 'Azure 發音評估失敗。');
          error.statusCode = 502;
          reject(error);
          return;
        }

        const assessment = azure.PronunciationAssessmentResult.fromResult(result);
        const accuracyScore = Number(assessment.accuracyScore);
        const classification = classifyAccuracy(accuracyScore);
        const details = assessment.detailResult || {};
        const words = (details.Words || []).map(word => ({
          word: word.Word || '',
          accuracyScore: Number(word.PronunciationAssessment?.AccuracyScore) || 0,
          errorType: word.PronunciationAssessment?.ErrorType || 'None',
        }));
        resolve({
          ...classification,
          score: Math.round(accuracyScore),
          accuracyScore,
          pronunciationScore: Number(assessment.pronunciationScore),
          completenessScore: Number(assessment.completenessScore),
          fluencyScore: Number(assessment.fluencyScore),
          transcript: result.text || '',
          provider: 'azure-pronunciation-zh-HK',
          words,
        });
      } catch (error) {
        error.statusCode ||= 502;
        reject(error);
      } finally {
        close();
      }
    }, message => {
      close();
      const error = new Error(message || 'Azure 發音評估連線失敗。');
      error.statusCode = 502;
      reject(error);
    });
  });
}

module.exports = { isConfigured, classifyAccuracy, assessPronunciation };
