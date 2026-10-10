'use strict';

// Storage routing:
//   - Recordings always go to Supabase (audio blobs, too big for Git).
//   - Images go to GitHub when GITHUB_IMAGE_REPO + GITHUB_TOKEN are set,
//     otherwise fall back to the public question-images bucket.

const github = require('./githubStorage');

let _client = null;

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}
function supabaseSecret() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function isStorageConfigured() {
  return !!(supabaseUrl() && supabaseSecret()) || github.isConfigured();
}

function client() {
  if (_client) return _client;
  const { createClient } = require('@supabase/supabase-js');
  const url = supabaseUrl();
  const key = supabaseSecret();
  if (!url || !key) throw new Error('Supabase Storage credentials are not configured.');
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

function pickExt(originalName, contentType, fallback) {
  return (originalName && (originalName.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    || (contentType && contentType.split('/')[1])
    || fallback;
}

// ----- Recordings (always Supabase) -----
async function uploadRecording({ studentId, assignmentId, itemId, phase, buffer, contentType }) {
  if (!supabaseUrl() || !supabaseSecret()) {
    throw new Error('Supabase Storage credentials are not configured.');
  }
  const ext = contentType && contentType.includes('wav') ? 'wav'
    : contentType && contentType.includes('ogg') ? 'ogg'
    : contentType && (contentType.includes('mp4') || contentType.includes('m4a')) ? 'mp4'
    : 'webm';
  const path = `${studentId}/${assignmentId}/${itemId}/${phase}.${ext}`;
  const c = client();
  const { error } = await c.storage.from('recordings')
    .upload(path, buffer, { contentType: contentType || 'audio/webm', upsert: true });
  if (error) throw error;
  return { path, publicUrl: protectRecordingUrl(path) };
}

// ----- Images (GitHub preferred, Supabase fallback) -----
async function uploadBankImage({ bankItemId, buffer, contentType, originalName }) {
  const ext = pickExt(originalName, contentType, 'jpg');
  const stamp = Date.now().toString(36);
  const path = `bank/${bankItemId}-${stamp}.${ext}`;
  if (github.isConfigured()) {
    return github.uploadImage({ path, buffer, contentType,
      message: `bank: upload ${bankItemId}` });
  }
  return uploadToSupabase(path, buffer, contentType || 'image/jpeg');
}

async function uploadItemImage({ teacherId, buffer, contentType, originalName }) {
  const ext = pickExt(originalName, contentType, 'jpg');
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const path = `items/${teacherId}/${stamp}.${ext}`;
  if (github.isConfigured()) {
    return github.uploadImage({ path, buffer, contentType,
      message: `item: upload by ${teacherId}` });
  }
  return uploadToSupabase(path, buffer, contentType || 'image/jpeg');
}

async function uploadToSupabase(path, buffer, contentType) {
  if (!supabaseUrl() || !supabaseSecret()) {
    throw new Error('Image storage not configured (set GITHUB_IMAGE_REPO + GITHUB_TOKEN or Supabase env vars).');
  }
  const c = client();
  const { error } = await c.storage.from('question-images')
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw error;
  const { data } = c.storage.from('question-images').getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

function recordingParts(path) {
  // "done" exists in an older saved attempt. It is read-only compatibility;
  // the upload route continues to accept only practice and assessment.
  const match = /^([A-Za-z0-9_-]{1,20})\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\/(practice|assessment|done)\.(webm|wav|ogg|mp4)$/i.exec(String(path || ''));
  return match ? { studentId: match[1], assignmentId: match[2], itemId: match[3], phase: match[4] } : null;
}

function objectPath(value) {
  if (!value) return null;
  const raw = String(value);
  if (recordingParts(raw)) return raw;
  try {
    const url = new URL(raw, 'https://buio.invalid');
    if (url.origin === 'https://buio.invalid' && url.pathname === '/api/chinese/recordings') return url.searchParams.get('path');
    if (supabaseUrl() && url.origin !== new URL(supabaseUrl()).origin) return null;
    const prefix = '/storage/v1/object/public/recordings/';
    return url.pathname.startsWith(prefix) ? decodeURIComponent(url.pathname.slice(prefix.length)) : null;
  } catch { return null; }
}

function protectRecordingUrl(value) {
  const path = objectPath(value);
  return recordingParts(path) ? `/api/chinese/recordings?path=${encodeURIComponent(path)}` : null;
}

function isLegacyImagePath(path) {
  return /^(?:bank\/[A-Za-z0-9_-]+|items\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+)\.(?:jpe?g|png|webp|gif|avif|svg|bmp|heic|heif)$/i.test(String(path || ''));
}

function protectImageUrl(value) {
  const path = objectPath(value);
  return isLegacyImagePath(path) ? `/api/chinese/legacy-image?path=${encodeURIComponent(path)}` : value || null;
}

async function signedObjectUrl(path) {
  const { data, error } = await client().storage.from('recordings').createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}

module.exports = { isStorageConfigured, uploadRecording, uploadItemImage, uploadBankImage, protectRecordingUrl, protectImageUrl, recordingParts, isLegacyImagePath, signedObjectUrl };
