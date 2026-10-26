'use strict';

const fs = require('fs');
const path = require('path');
const config = require('../config');
const store = require('../db/jsonStore');
const { getPool, withTransaction } = require('../math-app/db/database');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
let schema;
let queue = Promise.resolve();

async function ensureSchema() {
  if (config.db.mode !== 'postgres') {
    const data = store.load();
    data.scienceInquiryVideos ||= [];
    data.scienceInquiryLikes ||= [];
    return;
  }
  if (!schema) schema = getPool().query(fs.readFileSync(path.join(__dirname, '../db/migrations/20261026_science_inquiry.sql'), 'utf8'))
    .catch(error => { schema = null; throw error; });
  await schema;
}

const fields = `ID AS id, AuthorID AS "authorId", AuthorName AS "authorName", Title AS title,
  Description AS description, Kind AS kind, StorageKey AS "storageKey", PosterKey AS "posterKey",
  Duration AS duration, OriginalBytes AS "originalBytes", VideoBytes AS "videoBytes", Width AS width, Height AS height,
  Status AS status, ReviewNote AS "reviewNote", Revision AS revision, CreatedAt AS "createdAt", PublishedAt AS "publishedAt"`;
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
function validateID(id) { if (!uuid(id)) fail('找不到這段影片。', 404); }
function visible(row, user) { return row && (row.status === 'published' || row.authorId === user.studentId || user.role === 'teacher'); }

function view(row, user, likeCount = 0, liked = false) {
  const own = row.authorId === user.studentId;
  return {
    id: row.id, authorName: row.authorName, title: row.title, description: row.description, kind: row.kind,
    status: row.status, duration: row.duration, width: row.width, height: row.height,
    originalBytes: Number(row.originalBytes), videoBytes: Number(row.videoBytes),
    createdAt: row.createdAt, publishedAt: row.publishedAt, own, revision: row.revision,
    likeCount: Number(likeCount), liked,
    videoUrl: `/api/science-inquiry/videos/${row.id}/media`, posterUrl: `/api/science-inquiry/videos/${row.id}/poster`,
    ...((own || user.role === 'teacher') ? { reviewNote: row.reviewNote } : {}),
  };
}

async function raw(id) {
  validateID(id);
  await ensureSchema();
  if (config.db.mode === 'postgres') return (await getPool().query(`SELECT ${fields} FROM ScienceInquiryVideos WHERE ID=$1`, [id])).rows[0];
  return structuredClone(store.load().scienceInquiryVideos.find(row => row.id === id));
}

async function accessible(id, user) {
  const row = await raw(id);
  if (!visible(row, user)) fail('找不到這段影片。', 404);
  return row;
}

function text(value, max, message) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.trim().length > max) fail(message);
  return value.trim();
}
function metadata(body) {
  if (!['observation', 'question'].includes(body.kind)) fail('請選擇科學發現或科學疑問。');
  return { title: text(body.title, 100, '標題最多 100 字。'),
    description: text(body.description, 2000, '觀察或疑問最多 2000 字。'), kind: body.kind };
}

async function create(user, input) {
  if (user.role !== 'student') fail('只有學生可以上傳影片。', 403);
  await ensureSchema();
  const row = { ...input, ...metadata(input), authorId: user.studentId, status: 'pending', reviewNote: '', revision: 0,
    createdAt: new Date().toISOString(), publishedAt: null };
  if (config.db.mode === 'postgres') {
    await getPool().query(`INSERT INTO ScienceInquiryVideos
      (ID,AuthorID,AuthorName,Title,Description,Kind,StorageKey,PosterKey,Duration,OriginalBytes,VideoBytes,Width,Height)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [row.id,row.authorId,row.authorName,row.title,row.description,row.kind,row.storageKey,row.posterKey,
      row.duration,row.originalBytes,row.videoBytes,row.width,row.height]);
  } else { store.load().scienceInquiryVideos.push(row); store.save(); }
  return view(row, user);
}

async function list(user, options = {}) {
  await ensureSchema();
  const scope = options.scope || 'published';
  if (!['published', 'mine', 'review'].includes(scope)) fail('無效的影片分類。');
  if (scope === 'review' && user.role !== 'teacher') fail('只有老師可以審核影片。', 403);
  const status = options.status || 'pending';
  if (scope === 'review' && !['pending', 'published', 'rejected'].includes(status)) fail('無效的審核狀態。');
  const page = Number(options.page || 1);
  if (!Number.isInteger(page) || page < 1 || page > 10000) fail('無效的頁數。');
  const offset = (page - 1) * 12;
  if (config.db.mode === 'postgres') {
    const where = scope === 'mine' ? 'AuthorID=$2' : 'Status=$2';
    const filter = scope === 'mine' ? user.studentId : scope === 'review' ? status : 'published';
    const { rows } = await getPool().query(`SELECT ${fields},
      (SELECT COUNT(*)::int FROM ScienceInquiryLikes l WHERE l.VideoID=v.ID) AS "likeCount",
      EXISTS(SELECT 1 FROM ScienceInquiryLikes l WHERE l.VideoID=v.ID AND l.StudentID=$1) AS liked
      FROM ScienceInquiryVideos v WHERE ${where}
      ORDER BY ${scope === 'published' ? 'PublishedAt' : 'CreatedAt'} DESC, ID DESC LIMIT 13 OFFSET $3`, [user.studentId, filter, offset]);
    return { items: rows.slice(0,12).map(row => view(row, user, row.likeCount, row.liked)), hasMore: rows.length > 12, page };
  }
  const data = store.load();
  const rows = data.scienceInquiryVideos.filter(row => scope === 'mine' ? row.authorId === user.studentId
    : row.status === (scope === 'review' ? status : 'published'))
    .sort((a,b) => String(scope === 'published' ? b.publishedAt : b.createdAt).localeCompare(String(scope === 'published' ? a.publishedAt : a.createdAt)) || b.id.localeCompare(a.id));
  return { items: rows.slice(offset,offset+12).map(row => {
    const likes = data.scienceInquiryLikes.filter(like => like.videoId === row.id);
    return view(row,user,likes.length,likes.some(like => like.studentId === user.studentId));
  }), hasMore: rows.length > offset+12, page };
}

async function locked(id, fn) {
  validateID(id);
  await ensureSchema();
  if (config.db.mode === 'postgres') return withTransaction(async client => {
    const row = (await client.query(`SELECT ${fields} FROM ScienceInquiryVideos WHERE ID=$1 FOR UPDATE`, [id])).rows[0];
    return fn(row, client);
  });
  const work = queue.then(() => fn(store.load().scienceInquiryVideos.find(row => row.id === id), null));
  queue = work.catch(() => {});
  return work;
}

async function review(id, user, body) {
  if (user.role !== 'teacher') fail('只有老師可以審核影片。', 403);
  if (!['published', 'rejected', 'pending'].includes(body.status)) fail('無效的審核結果。');
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (note.length > 500 || (body.status === 'rejected' && !note)) fail('退回影片時請填寫原因，最多 500 字。');
  if (!Number.isInteger(body.revision)) fail('請重新載入影片後再審核。', 409);
  return locked(id, async (row, client) => {
    if (!row) fail('找不到這段影片。', 404);
    if (row.revision !== body.revision) fail('這段影片已由老師更新，請重新載入。', 409);
    const now = new Date().toISOString();
    const updated = { ...row, status: body.status, reviewNote: note, revision: row.revision+1,
      reviewedBy: user.studentId, reviewedAt: now, publishedAt: body.status === 'published' ? now : null };
    if (client) await client.query(`UPDATE ScienceInquiryVideos SET Status=$2,ReviewNote=$3,Revision=Revision+1,
      ReviewedBy=$4,ReviewedAt=$5,PublishedAt=$6 WHERE ID=$1`, [id,body.status,note,user.studentId,now,updated.publishedAt]);
    else { Object.assign(row,updated); store.save(); }
    return view(updated,user);
  });
}

async function like(id, user, liked) {
  if (user.role !== 'student') fail('只有學生可以點讚。', 403);
  if (typeof liked !== 'boolean') fail('無效的點讚操作。');
  return locked(id, async (row, client) => {
    if (!row || row.status !== 'published') fail('找不到已發佈的影片。', 404);
    let count;
    if (client) {
      if (liked) await client.query('INSERT INTO ScienceInquiryLikes(VideoID,StudentID) VALUES($1,$2) ON CONFLICT DO NOTHING',[id,user.studentId]);
      else await client.query('DELETE FROM ScienceInquiryLikes WHERE VideoID=$1 AND StudentID=$2',[id,user.studentId]);
      count = (await client.query('SELECT COUNT(*)::int AS count FROM ScienceInquiryLikes WHERE VideoID=$1',[id])).rows[0].count;
    } else {
      const data = store.load();
      data.scienceInquiryLikes = data.scienceInquiryLikes.filter(item => item.videoId !== id || item.studentId !== user.studentId);
      if (liked) data.scienceInquiryLikes.push({ videoId:id, studentId:user.studentId });
      count = data.scienceInquiryLikes.filter(item => item.videoId === id).length;
      store.save();
    }
    return { likeCount:count, liked };
  });
}

module.exports = { ensureSchema, metadata, create, list, accessible, review, like, fail };
