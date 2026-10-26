'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { requireAuth, requireTeacher } = require('../math-app/middleware/auth');
const users = require('../math-app/repositories/users.repo');
const repo = require('./repository');
const video = require('./video');
const storage = require('./storage');
const router = express.Router();
let uploading = false;
const parser = multer({storage:multer.diskStorage({destination:(req,_file,cb)=>cb(null,req.uploadDirectory),filename:(_req,_file,cb)=>cb(null,'source')}),
  limits:{fileSize:video.MAX_BYTES,files:1,fields:3,fieldSize:8000,parts:4},
  fileFilter:(_req,file,cb)=>cb(null,['video/mp4','video/quicktime','video/webm','video/x-m4v'].includes(file.mimetype))}).single('video');
router.use(requireAuth);
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store'); next();});
router.get('/meta',(req,res)=>res.json({success:true,role:req.session.role,studentId:req.session.studentId,
  maxBytes:video.MAX_BYTES,maxDuration:video.MAX_DURATION}));
router.get('/videos',async(req,res)=>res.json({success:true,...await repo.list(req.session,req.query)}));

router.post('/videos',async(req,res)=>{
  if (req.session.role !== 'student') repo.fail('只有學生可以上傳影片。',403);
  if (uploading) { res.set('Retry-After','15'); repo.fail('正在處理其他影片，請保留影片並稍後再試。',429); }
  uploading = true;
  let directory;
  let stored = [];
  let committed = false;
  try {
    await storage.ensure();
    directory = await fs.mkdtemp(path.join(os.tmpdir(),'buio-inquiry-'));
    req.uploadDirectory = directory;
    await new Promise((resolve,reject)=>parser(req,res,error=>error ? reject(error) : resolve()));
    if (!req.file) repo.fail('請選擇 MP4、MOV 或 WebM 影片。');
    const metadata = repo.metadata(req.body);
    const processed = await video.processVideo(req.file.path,directory);
    const author = await users.findByIdSummary(req.session.studentId);
    if (!author || author.role !== 'student') repo.fail('學生帳戶已變更，請重新登入。',403);
    const id = randomUUID();
    const storageKey = `${id}/video.mp4`, posterKey = `${id}/poster.jpg`;
    stored = [storageKey,posterKey];
    await storage.put(storageKey,processed.output,'video/mp4');
    await storage.put(posterKey,processed.poster,'image/jpeg');
    const { duration,width,height,originalBytes,videoBytes } = processed;
    const item = await repo.create(req.session,{...metadata,duration,width,height,originalBytes,videoBytes,id,storageKey,posterKey,authorName:author.name});
    committed = true;
    res.status(201).json({success:true,item});
  } finally {
    if (!committed && stored.length) await storage.remove(stored).catch(error=>console.error('[science-inquiry/cleanup]',error.code || 'FAILED'));
    if (directory) await fs.rm(directory,{recursive:true,force:true}).catch(()=>{});
    uploading = false;
  }
});
router.put('/videos/:id/like',async(req,res)=>res.json({success:true,...await repo.like(req.params.id,req.session,req.body?.liked)}));
router.post('/videos/:id/review',requireTeacher,async(req,res)=>res.json({success:true,item:await repo.review(req.params.id,req.session,req.body || {})}));

async function media(req,res,poster) {
  const row = await repo.accessible(req.params.id,req.session);
  const key = poster ? row.posterKey : row.storageKey;
  res.set({'X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin','Content-Type':poster?'image/jpeg':'video/mp4'});
  if (storage.local()) return res.sendFile(storage.localPath(key),{cacheControl:false},error=>{
    if (error && !res.headersSent) res.status(error.statusCode || 404).end();
  });
  const controller = new AbortController();
  res.on('close',()=>controller.abort());
  try {
    const response = await storage.upstream(key,req.headers.range,controller.signal);
    if (![200,206,416].includes(response.status)) { await response.body?.cancel(); repo.fail('影片暫時無法播放，請稍後再試。',502); }
    res.status(response.status);
    for (const header of ['content-length','content-range','accept-ranges']) if (response.headers.has(header)) res.set(header,response.headers.get(header));
    if (req.method === 'HEAD') { await response.body?.cancel(); return res.end(); }
    if (response.body) await pipeline(Readable.fromWeb(response.body),res); else res.end();
  } catch (error) { if (!controller.signal.aborted) throw error; }
}
router.get('/videos/:id/media',(req,res)=>media(req,res,false));
router.get('/videos/:id/poster',(req,res)=>media(req,res,true));
router.use((error,_req,res,_next)=>{
  if (res.headersSent) return res.destroy();
  const status = error instanceof multer.MulterError ? 400 : error.status || 500;
  if (status >= 500) console.error('[science-inquiry]',error.code || error.message);
  res.status(status).json({success:false,message:error instanceof multer.MulterError
    ? (error.code === 'LIMIT_FILE_SIZE' ? '影片不可超過 250 MB。' : '上傳資料不完整或超出限制，請重新選擇影片。')
    : status >= 500 ? '影片服務暫時未能完成操作，請稍後再試。' : error.message});
});
module.exports = router;
