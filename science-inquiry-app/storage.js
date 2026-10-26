'use strict';

const fs = require('fs/promises');
const path = require('path');
const config = require('../config');
const { fail } = require('./repository');
const { MAX_OUTPUT_BYTES } = require('./video');
const BUCKET = 'science-inquiry';
const local = () => config.db.mode === 'json';
const root = () => path.resolve(process.env.SCIENCE_INQUIRY_MEDIA_DIR || path.join(__dirname,'../data/science-inquiry-media'));
let client;
let ready;
function supabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !secret) fail('影片儲存服務尚未設定，請聯絡老師。',503);
    client = require('@supabase/supabase-js').createClient(url,secret,{auth:{persistSession:false}});
  }
  return client;
}
async function ensure() {
  if (local()) { await fs.mkdir(root(),{recursive:true}); return; }
  if (!ready) ready = (async () => {
    const api = supabase().storage;
    let result = await api.getBucket(BUCKET);
    if (result.error && String(result.error.statusCode) !== '404' && !/not found/i.test(result.error.message)) throw result.error;
    const options = { public:false, fileSizeLimit:MAX_OUTPUT_BYTES, allowedMimeTypes:['video/mp4','image/jpeg'] };
    if (!result.data) {
      result = await api.createBucket(BUCKET,options);
      if (result.error && !/already exists|duplicate/i.test(result.error.message)) throw result.error;
    }
    result = await api.updateBucket(BUCKET,options);
    if (result.error) throw result.error;
  })().catch(error => { ready = null; throw error; });
  await ready;
}
function localPath(key) {
  if (!/^[a-f0-9-]{36}\/(video\.mp4|poster\.jpg)$/.test(key)) fail('找不到影片檔案。',404);
  return path.join(root(),key);
}
async function put(key,file,type) {
  await ensure();
  if (local()) { const target = localPath(key); await fs.mkdir(path.dirname(target),{recursive:true}); await fs.copyFile(file,target); return; }
  const { error } = await supabase().storage.from(BUCKET).upload(key,await fs.readFile(file),{contentType:type,upsert:false});
  if (error) throw error;
}
async function remove(keys) {
  if (local()) { await Promise.all(keys.map(key => fs.rm(localPath(key),{force:true}))); return; }
  const { error } = await supabase().storage.from(BUCKET).remove(keys);
  if (error) throw error;
}
async function upstream(key,range,signal) {
  const { data,error } = await supabase().storage.from(BUCKET).createSignedUrl(key,60);
  if (error) throw error;
  // Keep the signed URL server-side: every browser range request checks moderation again.
  return fetch(data.signedUrl,{headers:range ? {Range:range} : {},signal});
}
module.exports = { ensure, put, remove, local, localPath, upstream };
