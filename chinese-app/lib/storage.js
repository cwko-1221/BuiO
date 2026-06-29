'use strict';

let _client = null;

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}
function supabaseSecret() {
  return process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
}

function isStorageConfigured() {
  return !!(supabaseUrl() && supabaseSecret());
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

async function uploadRecording({ studentId, assignmentId, itemId, phase, buffer, contentType }) {
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

async function uploadBankImage({ bankItemId, buffer, contentType, originalName }) {
  const ext = (originalName && (originalName.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    || (contentType && contentType.split('/')[1]) || 'jpg';
  // Cache-bust filename per upload so the public URL changes on overwrite.
  const stamp = Date.now().toString(36);
  const path = `bank/${bankItemId}-${stamp}.${ext}`;
  const c = client();
  const { error } = await c.storage.from('recordings')
    .upload(path, buffer, { contentType: contentType || 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data } = c.storage.from('recordings').getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

async function uploadItemImage({ teacherId, buffer, contentType, originalName }) {
  const ext = (originalName && (originalName.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    || (contentType && contentType.split('/')[1]) || 'jpg';
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const path = `items/${teacherId}/${stamp}.${ext}`;
  const c = client();
  // Re-use the public `recordings` bucket so we don't need a second one.
  const { error } = await c.storage.from('recordings')
    .upload(path, buffer, { contentType: contentType || 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data } = c.storage.from('recordings').getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

module.exports = { isStorageConfigured, uploadRecording, uploadItemImage, uploadBankImage };
