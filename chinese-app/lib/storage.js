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

module.exports = { isStorageConfigured, uploadRecording };
