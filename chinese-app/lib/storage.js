'use strict';

let _client = null;

function isStorageConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
      || !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function client() {
  if (_client) return _client;
  const { createClient } = require('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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
