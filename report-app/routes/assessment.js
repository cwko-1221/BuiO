'use strict';

const express = require('express');
const multer = require('multer');
const repo = require('../repositories/assessment.repo');

const router = express.Router();
const MAX_FILE_SIZE = 15 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, fieldSize: 25 * 1024 * 1024, files: 1, fields: 2 },
});

function requireTeacher(req, res, next) {
  if (!req.session?.studentId) return res.status(401).json({ success: false, message: '請先登入' });
  if (req.session.role !== 'teacher') return res.status(403).json({ success: false, message: '只限老師使用' });
  next();
}

router.use(requireTeacher);
router.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

function normalizeFilename(value) {
  const raw = String(value || '').replace(/^.*[\\/]/, '').slice(0, 255);
  if ([...raw].some(char => char.codePointAt(0) > 255)) return raw;
  const decoded = Buffer.from(raw, 'latin1').toString('utf8');
  return decoded.includes('\uFFFD') ? raw : decoded;
}

function publicPayload(imports) {
  return {
    success: true,
    imports: imports.map(({ records, ...item }) => item),
    records: imports.flatMap(item => item.records),
  };
}

function validateRecords(value, filename) {
  let records;
  try {
    records = typeof value === 'string' ? JSON.parse(value) : value;
  } catch {
    throw Object.assign(new Error('無法讀取已解析的考評資料'), { status: 400 });
  }
  if (!Array.isArray(records) || records.length === 0 || records.length > 500) {
    throw Object.assign(new Error('Excel 內沒有可用的考評工作表'), { status: 400 });
  }
  return records.map((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw Object.assign(new Error(`第 ${index + 1} 個工作表資料格式不正確`), { status: 400 });
    }
    if (!Array.isArray(record.students) || record.students.length === 0 || record.students.length > 500) {
      throw Object.assign(new Error(`第 ${index + 1} 個工作表沒有有效學生資料`), { status: 400 });
    }
    if (!Array.isArray(record.subjects) || record.subjects.length === 0 || record.subjects.length > 100) {
      throw Object.assign(new Error(`第 ${index + 1} 個工作表沒有有效科目資料`), { status: 400 });
    }
    for (const key of ['schoolYear', 'termCode', 'grade', 'className']) {
      if (typeof record[key] !== 'string' || record[key].length > 100) {
        throw Object.assign(new Error(`第 ${index + 1} 個工作表缺少 ${key}`), { status: 400 });
      }
    }
    return { ...record, filename };
  });
}

function isRecognizedExcel(file) {
  const name = String(file?.originalname || '').toLowerCase();
  const bytes = file?.buffer || Buffer.alloc(0);
  if (name.endsWith('.xlsx')) {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  }
  if (name.endsWith('.xls')) {
    const signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    return bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);
  }
  return false;
}

router.get('/data', async (_req, res, next) => {
  try {
    res.json(publicPayload(await repo.listImports()));
  } catch (error) { next(error); }
});

router.post('/imports', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: '請選擇 Excel 檔案' });
    const filename = normalizeFilename(req.file.originalname);
    const normalizedFile = { ...req.file, originalname: filename };
    if (!filename || !isRecognizedExcel(normalizedFile)) {
      return res.status(400).json({ success: false, message: '檔案不是有效的 .xls 或 .xlsx Excel 檔案' });
    }
    const records = validateRecords(req.body.records, filename);
    await repo.replaceImport({
      filename,
      mimeType: req.file.mimetype || 'application/octet-stream',
      fileBuffer: req.file.buffer,
      records,
      uploadedBy: req.session.studentId,
    });
    res.status(201).json(publicPayload(await repo.listImports()));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
});

router.post('/migrate-browser-data', express.json({ limit: '20mb' }), async (req, res, next) => {
  try {
    const current = await repo.listImports();
    if (current.length > 0) return res.json(publicPayload(current));
    const files = Array.isArray(req.body?.files) ? req.body.files : [];
    if (files.length === 0 || files.length > 50) {
      return res.status(400).json({ success: false, message: '沒有可遷移的考評資料' });
    }
    for (const file of files) {
      const filename = String(file?.filename || '').trim().slice(0, 255);
      if (!filename) return res.status(400).json({ success: false, message: '遷移資料缺少檔名' });
      const records = validateRecords(file.records, filename);
      await repo.replaceImport({
        filename,
        records,
        source: 'browser-migration',
        uploadedBy: req.session.studentId,
      });
    }
    res.status(201).json(publicPayload(await repo.listImports()));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, message: error.message });
    next(error);
  }
});

router.get('/imports/:id/file', async (req, res, next) => {
  try {
    const original = await repo.getOriginal(req.params.id);
    if (!original) return res.status(404).json({ success: false, message: '此項目沒有原始 Excel 檔案' });
    const safeAscii = original.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Type', original.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', original.buffer.length);
    res.setHeader('Content-Disposition', `attachment; filename="${safeAscii}"; filename*=UTF-8''${encodeURIComponent(original.filename)}`);
    res.send(original.buffer);
  } catch (error) { next(error); }
});

router.delete('/data', async (_req, res, next) => {
  try {
    await repo.clearAll();
    res.json({ success: true, imports: [], records: [] });
  } catch (error) { next(error); }
});

router.use((error, _req, res, next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Excel 檔案不可大於 15MB'
      : 'Excel 上傳資料過大或格式不正確';
    return res.status(400).json({ success: false, message });
  }
  next(error);
});

module.exports = router;
