'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const config = require('../config');
const store = require('../db/jsonStore');
const pet = require('../pet-app/repositories/pet.repo');
const { getPool, withTransaction } = require('../math-app/db/database');
const APPROVAL_REWARD = 1000;
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
let schema;
let queue = Promise.resolve();

async function ensureSchema() {
  if (config.db.mode !== 'postgres') {
    const data = store.load();
    data.scienceInquiryVideos ||= [];
    data.scienceInquiryLikes ||= [];
    data.scienceInquiryComments ||= [];
    return;
  }
  if (!schema) schema = getPool().query(['20261026_science_inquiry.sql','20261027_science_inquiry_rewards.sql','20261027_science_inquiry_comments.sql']
    .map(file => fs.readFileSync(path.join(__dirname, '../db/migrations', file), 'utf8')).join('\n'))
    .catch(error => { schema = null; throw error; });
  await schema;
}

const fields = `ID AS id, AuthorID AS "authorId", AuthorName AS "authorName", Title AS title,
  Description AS description, Kind AS kind, StorageKey AS "storageKey", PosterKey AS "posterKey",
  Duration AS duration, OriginalBytes AS "originalBytes", VideoBytes AS "videoBytes", Width AS width, Height AS height,
  Status AS status, ReviewNote AS "reviewNote", Revision AS revision, CreatedAt AS "createdAt", PublishedAt AS "publishedAt", RewardedAt AS "rewardedAt"`;
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
    comments: row.comments || [],
    videoUrl: `/api/science-inquiry/videos/${row.id}/media`, posterUrl: `/api/science-inquiry/videos/${row.id}/poster`,
    ...((own || user.role === 'teacher') ? { reviewNote: row.reviewNote,
      rewardedAt: row.rewardedAt || null, rewardAmount: row.rewardedAt ? APPROVAL_REWARD : 0 } : {}),
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

async function withComments(rows,runner) {
  if(!rows.length)return rows;
  let comments;
  if(config.db.mode==='postgres'){
    const result=await (runner||getPool()).query(`SELECT ID AS id,VideoID AS "videoId",TeacherName AS "teacherName",Message AS message,CreatedAt AS "createdAt"
      FROM ScienceInquiryComments WHERE VideoID=ANY($1::uuid[]) ORDER BY CreatedAt ASC,ID ASC`,[rows.map(row=>row.id)]);
    comments=result.rows;
  }else comments=store.load().scienceInquiryComments;
  const grouped=new Map(rows.map(row=>[row.id,[]]));
  for(const comment of comments){const list=grouped.get(comment.videoId);if(list)list.push({id:comment.id,teacherName:comment.teacherName,message:comment.message,createdAt:comment.createdAt});}
  return rows.map(row=>({...row,comments:grouped.get(row.id)}));
}

function prepareComment(id,user,message,commentId){
  if(message!=null&&typeof message!=='string')fail('請輸入有效的老師回應。');
  const content=String(message||'').trim();
  if(content.length>2000)fail('老師回應最多 2000 字。');
  if(!content)return null;
  if(commentId!=null&&!uuid(commentId))fail('回應編號無效，請重新載入。');
  return {id:commentId||randomUUID(),videoId:id,teacherId:user.studentId,teacherName:String(user.studentName||'老師').slice(0,120),message:content,createdAt:new Date().toISOString()};
}

function appendJsonComment(data,comment){
  const existing=data.scienceInquiryComments.find(row=>row.id===comment.id);
  if(existing){if(existing.videoId!==comment.videoId||existing.teacherId!==comment.teacherId||existing.message!==comment.message)fail('這個回應編號已用於其他內容，請重新載入。',409);return existing;}
  data.scienceInquiryComments.push(comment);return comment;
}

async function appendPostgresComment(client,comment){
  const inserted=await client.query(`INSERT INTO ScienceInquiryComments(ID,VideoID,TeacherID,TeacherName,Message,CreatedAt)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING ID`,[comment.id,comment.videoId,comment.teacherId,comment.teacherName,comment.message,comment.createdAt]);
  if(!inserted.rows.length){
    const existing=await client.query('SELECT VideoID AS "videoId",TeacherID AS "teacherId",Message AS message FROM ScienceInquiryComments WHERE ID=$1',[comment.id]);const row=existing.rows[0];
    if(!row||row.videoId!==comment.videoId||row.teacherId!==comment.teacherId||row.message!==comment.message)fail('這個回應編號已用於其他內容，請重新載入。',409);
  }
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
  const row = { ...input, ...metadata(input), authorId: user.studentId, status: 'pending', reviewNote: '', revision: 0, rewardedAt: null,
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
    const enriched = await withComments(rows.slice(0,12));
    return { items: enriched.map(row => view(row, user, row.likeCount, row.liked)), hasMore: rows.length > 12, page };
  }
  const data = store.load();
  const rows = data.scienceInquiryVideos.filter(row => scope === 'mine' ? row.authorId === user.studentId
    : row.status === (scope === 'review' ? status : 'published'))
    .sort((a,b) => String(scope === 'published' ? b.publishedAt : b.createdAt).localeCompare(String(scope === 'published' ? a.publishedAt : a.createdAt)) || b.id.localeCompare(a.id));
  return { items: (await withComments(rows.slice(offset,offset+12))).map(row => {
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
  const comment = prepareComment(id,user,body.publicComment,body.commentId);
  // Finish shared schema work before borrowing the transaction connection.
  if (body.status === 'published') await pet.ensureSchema();
  return locked(id, async (row, client) => {
    if (!row) fail('找不到這段影片。', 404);
    if (row.revision !== body.revision) fail('這段影片已由老師更新，請重新載入。', 409);
    const now = new Date().toISOString();
    const updated = { ...row, status: body.status, reviewNote: note, revision: row.revision+1,
      reviewedBy: user.studentId, reviewedAt: now, publishedAt: body.status === 'published' ? now : null };
    const eligible = body.status === 'published' && !row.rewardedAt;
    let rewardGranted = 0;
    const ledger = eligible ? { transactionId: randomUUID(), studentId: row.authorId, actorId: user.studentId,
      delta: APPROVAL_REWARD, kind: 'teacher_grant', idempotencyKey: `science-inquiry:${id}`,
      note: '科學探究閣 · 影片審核通過', metadata: { scienceInquiryVideoId: id, source: 'science_inquiry' }, createdAt: now } : null;
    if (eligible) await pet.ensureStudent(row.authorId, client);
    if (client) {
      if (eligible) {
        const inserted = await client.query(`INSERT INTO PetCurrencyLedger
          (TransactionID,StudentID,ActorID,Delta,Kind,IdempotencyKey,Note,Metadata)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT DO NOTHING RETURNING TransactionID`,
        [ledger.transactionId,ledger.studentId,ledger.actorId,ledger.delta,ledger.kind,ledger.idempotencyKey,ledger.note,JSON.stringify(ledger.metadata)]);
        if (inserted.rows.length) {
          const credited = await client.query('UPDATE PetWallets SET Balance=Balance+$2,UpdatedAt=$3 WHERE StudentID=$1 RETURNING Balance',
            [row.authorId,APPROVAL_REWARD,now]);
          if (credited.rows.length !== 1) fail('未能發放獎勵，影片尚未發佈，請稍後再試。',503);
          rewardGranted = APPROVAL_REWARD;
        }
        updated.rewardedAt = now;
      }
      if (comment) await appendPostgresComment(client,comment);
      await client.query(`UPDATE ScienceInquiryVideos SET Status=$2,ReviewNote=$3,Revision=Revision+1,
        ReviewedBy=$4,ReviewedAt=$5,PublishedAt=$6,RewardedAt=$7 WHERE ID=$1`,
      [id,body.status,note,user.studentId,now,updated.publishedAt,updated.rewardedAt || null]);
    } else {
      const data = store.load();
      const wallet = eligible ? data.petWallets.find(item => item.studentId === row.authorId) : null;
      if (eligible && !wallet) fail('未能發放獎勵，影片尚未發佈，請稍後再試。',503);
      const previousRow = { ...row }, previousWallet = wallet ? { ...wallet } : null;
      const ledgerLength = data.petCurrencyLedger?.length || 0;
      const commentLength = data.scienceInquiryComments.length;
      // No awaits here: persist the publication, balance and ledger in one atomic JSON save.
      try {
        if (comment) appendJsonComment(data,comment);
        if (eligible) {
          if (!data.petCurrencyLedger.some(item => item.studentId === row.authorId && item.idempotencyKey === ledger.idempotencyKey)) {
            wallet.balance += APPROVAL_REWARD; wallet.updatedAt = now;
            data.petCurrencyLedger.push(ledger); rewardGranted = APPROVAL_REWARD;
          }
          updated.rewardedAt = now;
        }
        Object.assign(row,updated); store.save();
      } catch (error) {
        for (const key of Object.keys(row)) if (!Object.hasOwn(previousRow,key)) delete row[key];
        Object.assign(row,previousRow);
        if (previousWallet) Object.assign(wallet,previousWallet);
        if (eligible) data.petCurrencyLedger.splice(ledgerLength);
        data.scienceInquiryComments.splice(commentLength);
        throw error;
      }
    }
    const [enriched] = await withComments([updated],client);
    return { ...view(enriched,user), rewardGranted };
  });
}

async function addComment(id,user,body){
  if(user.role!=='teacher')fail('只有老師可以新增回應。',403);
  if(!uuid(body.commentId))fail('回應編號無效，請重新載入。');
  const comment=prepareComment(id,user,body.message,body.commentId);
  if(!comment)fail('請先輸入老師回應。');
  return locked(id,async(row,client)=>{
    if(!row)fail('找不到這段影片。',404);
    if(client)await appendPostgresComment(client,comment);
    else{const data=store.load(),length=data.scienceInquiryComments.length;try{appendJsonComment(data,comment);store.save();}catch(error){data.scienceInquiryComments.splice(length);throw error;}}
    const [enriched]=await withComments([row],client);return view(enriched,user);
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

module.exports = { APPROVAL_REWARD, ensureSchema, metadata, create, list, accessible, review, addComment, like, fail };
