'use strict';

// Storage routing:
//   - Recordings always go to Supabase (audio blobs, too big for Git).
//   - Images go to GitHub when GITHUB_IMAGE_REPO + GITHUB_TOKEN are set,
//     otherwise fall back to Supabase Storage.

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
    : 'webm';
  const path = `${studentId}/${assignmentId}/${itemId}/${phase}.${ext}`;
  const c = client();
  const { error } = await c.storage.from('recordings')
    .upload(path, buffer, { contentType: contentType || 'audio/webm', upsert: true });
  if (error) throw error;
  const { data } = c.storage.from('recordings').getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
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
  const { error } = await c.storage.from('recordings')
    .upload(path, buffer, { contentType, upsert: false });
  if (error) throw error;
  const { data } = c.storage.from('recordings').getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

module.exports = { isStorageConfigured, uploadRecording, uploadItemImage, uploadBankImage };
