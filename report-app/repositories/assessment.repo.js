'use strict';

const crypto = require('crypto');
const config = require('../../config');
const store = require('../../db/jsonStore');
const { getPool } = require('../../math-app/db/database');

let schemaPromise;

async function ensureSchema() {
  if (config.db.mode !== 'postgres') return;
  if (!schemaPromise) {
    schemaPromise = getPool().query(`
      CREATE TABLE IF NOT EXISTS AssessmentImports (
        ID VARCHAR(36) PRIMARY KEY,
        Filename VARCHAR(255) NOT NULL,
        MimeType VARCHAR(120),
        FileSize BIGINT NOT NULL DEFAULT 0,
        FileData BYTEA,
        Records JSONB NOT NULL DEFAULT '[]'::jsonb,
        Source VARCHAR(30) NOT NULL DEFAULT 'upload',
        UploadedBy VARCHAR(20),
        UploadedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_assessment_imports_filename_ci
        ON AssessmentImports (LOWER(Filename));
      CREATE INDEX IF NOT EXISTS idx_assessment_imports_uploaded_at
        ON AssessmentImports (UploadedAt DESC);
    `).catch(error => {
      schemaPromise = null;
      throw error;
    });
  }
  await schemaPromise;
}

function jsonData() {
  const data = store.load();
  if (!Array.isArray(data.assessmentImports)) data.assessmentImports = [];
  return data;
}

function normalizeImport(row) {
  const records = Array.isArray(row.records) ? row.records : [];
  return {
    id: String(row.id),
    filename: String(row.filename),
    mimeType: String(row.mimeType || row.mimetype || ''),
    fileSize: Number(row.fileSize ?? row.filesize) || 0,
    source: String(row.source || 'upload'),
    uploadedBy: String(row.uploadedBy || row.uploadedby || ''),
    uploadedAt: new Date(row.uploadedAt || row.uploadedat || Date.now()).toISOString(),
    originalAvailable: Boolean(row.fileData || row.filedata || row.fileBase64),
    records,
  };
}

async function listImports() {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT ID AS id, Filename AS filename, MimeType AS "mimeType",
        FileSize AS "fileSize", Records AS records, Source AS source,
        UploadedBy AS "uploadedBy", UploadedAt AS "uploadedAt",
        (FileData IS NOT NULL) AS "originalAvailable"
      FROM AssessmentImports
      ORDER BY UploadedAt DESC, Filename ASC
    `);
    return rows.map(row => ({
      ...normalizeImport(row),
      originalAvailable: Boolean(row.originalAvailable),
    }));
  }
  return jsonData().assessmentImports
    .map(normalizeImport)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt) || a.filename.localeCompare(b.filename));
}

async function replaceImport({ filename, mimeType = '', fileBuffer = null, records, source = 'upload', uploadedBy = '' }) {
  await ensureSchema();
  const id = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const fileSize = fileBuffer ? fileBuffer.length : 0;

  if (config.db.mode === 'postgres') {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM AssessmentImports WHERE LOWER(Filename)=LOWER($1)', [filename]);
      await client.query(`
        INSERT INTO AssessmentImports
          (ID, Filename, MimeType, FileSize, FileData, Records, Source, UploadedBy, UploadedAt)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9)
      `, [id, filename, mimeType, fileSize, fileBuffer, JSON.stringify(records), source, uploadedBy, uploadedAt]);
      await client.query('COMMIT');
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch {}
      throw error;
    } finally {
      client.release();
    }
  } else {
    const data = jsonData();
    data.assessmentImports = data.assessmentImports.filter(
      row => String(row.filename).toLocaleLowerCase() !== String(filename).toLocaleLowerCase()
    );
    data.assessmentImports.push({
      id,
      filename,
      mimeType,
      fileSize,
      fileBase64: fileBuffer ? fileBuffer.toString('base64') : '',
      records,
      source,
      uploadedBy,
      uploadedAt,
    });
    store.save();
  }
  return (await listImports()).find(row => row.id === id);
}

async function getOriginal(id) {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    const { rows } = await getPool().query(`
      SELECT Filename AS filename, MimeType AS "mimeType", FileData AS "fileData"
      FROM AssessmentImports WHERE ID=$1
    `, [id]);
    if (!rows[0] || !rows[0].fileData) return null;
    return { filename: rows[0].filename, mimeType: rows[0].mimeType, buffer: rows[0].fileData };
  }
  const row = jsonData().assessmentImports.find(item => String(item.id) === String(id));
  if (!row?.fileBase64) return null;
  return {
    filename: row.filename,
    mimeType: row.mimeType || 'application/octet-stream',
    buffer: Buffer.from(row.fileBase64, 'base64'),
  };
}

async function clearAll() {
  await ensureSchema();
  if (config.db.mode === 'postgres') {
    await getPool().query('DELETE FROM AssessmentImports');
    return;
  }
  const data = jsonData();
  data.assessmentImports = [];
  store.save();
}

module.exports = { ensureSchema, listImports, replaceImport, getOriginal, clearAll };
