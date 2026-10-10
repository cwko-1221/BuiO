'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { PGlite } = require('@electric-sql/pglite');
const { createAsyncCache } = require('../shared/async-cache');
const root = path.resolve(__dirname, '..');

function load(file, dbModule, overrides = {}) {
  const filename = path.join(root, file), native = createRequire(filename), module = { exports: {} };
  const localRequire = id => {
    if (id in overrides) return overrides[id];
    if (id.endsWith('/config')) return { db: { mode: 'postgres' }, env: 'test' };
    if (id.endsWith('/db/database')) return dbModule;
    return native(id);
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { require: localRequire, module, exports: module.exports, __dirname: path.dirname(filename), console, Buffer, Date, process, setTimeout, clearTimeout, structuredClone, URL }, { filename });
  return module.exports;
}

async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE TABLE users(studentid varchar(20) PRIMARY KEY,name text,role text,passwordhash text,
    classname text,classno integer,chinesegroup text,englishgroup text,mathgroup text,language text);
    CREATE TABLE questionlogs(id serial PRIMARY KEY,studentid text,tag text,question text,correctanswer text,
    useranswer text,iscorrect boolean,timespent numeric,timestamp timestamptz DEFAULT now());
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint);
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    INSERT INTO users VALUES ('T1','Teacher','teacher','hash','',NULL,'','','','zh-HK'),('T2','Other','teacher','hash','',NULL,'','','','zh-HK'),
    ('S1','One','student','hash','P1',1,'A','A','A','zh-HK'),('S2','Two','student','hash','P2',2,'B','B','B','zh-HK');`);
  for (const language of ['chinese', 'english']) {
    const sql = fs.readFileSync(path.join(root, language + '-app/db/schema.sql'), 'utf8').replace(/create extension if not exists "pgcrypto";/gi, '');
    await db.exec(sql);
  }
  let queries = 0;
  function adapter(target) {
    return { async query(text, values = []) {
      queries++;
      const result = values.length ? await target.query(text, values) : (await target.exec(text)).at(-1);
      return { ...result, rowCount: result?.affectedRows ?? result?.rows?.length ?? 0 };
    } };
  }
  const pool = adapter(db), api = { getPool: () => pool, withTransaction: fn => db.transaction(tx => fn(adapter(tx))) };
  return { db, api, queryCount: () => queries };
}

test('bounded cache coalesces 60 requests, retries failure and discards invalidated work', async () => {
  let now = 0, calls = 0;
  const cache = createAsyncCache({ maxEntries: 2, maxBytes: 8, ttlMs: 10, now: () => now });
  await Promise.all(Array.from({ length: 60 }, () => cache.get('same', async () => { calls++; await new Promise(r => setTimeout(r, 5)); return Buffer.from('abcd'); })));
  assert.equal(calls, 1);
  await cache.get('other', () => Buffer.from('efgh')); await cache.get('third', () => Buffer.from('i'));
  assert.ok(cache.stats().bytes <= 8); assert.ok(cache.stats().entries <= 2);
  now = 20; await cache.get('same', () => { calls++; return Buffer.from('a'); }); assert.equal(calls, 2);
  await assert.rejects(cache.get('failure', () => Promise.reject(Error('network'))));
  assert.equal(await cache.get('failure', () => 7), 7);
  let release; const old = cache.get('old', () => new Promise(r => release = r));
  await Promise.resolve(); cache.clear(); release(Buffer.from('old')); await old;
  assert.equal(cache.stats().entries, 0);
});

test('class coin batches keep balances, replay response and complete rollback', async t => {
  const f = await fixture(t);
  const pets = load('pet-app/repositories/pet.repo.js', f.api, { './brawl-ranking.repo': { distribute: async () => {} } });
  await pets.ensureSchema();
  const before = f.queryCount();
  const first = await pets.grantCoins('T1', ['S2', 'S1', 'S2'], 10, { idempotencyKey: 'class-batch-1' });
  assert.equal(first.count, 2); assert.equal(first.total, 20);
  assert.ok(f.queryCount() - before <= 8, 'SQL count must stay bounded for a class grant');
  const replay = await pets.grantCoins('T1', ['S1', 'S2'], 10, { idempotencyKey: 'class-batch-1' });
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(replay)));
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM petcurrencyledger')).rows[0].n, 2);
  await assert.rejects(pets.grantCoins('T1', ['S1', 'S2'], -11, { idempotencyKey: 'bad-deduction' }));
  assert.equal((await f.db.query('SELECT sum(balance)::int AS n FROM petwallets')).rows[0].n, 20);
  const bootstrap = await pets.getBootstrap('S1');
  assert.equal(bootstrap.wallet.balance, 10); assert.equal(bootstrap.profile.studentId, 'S1');
  assert.ok(bootstrap.inventory.length > 0); assert.equal(bootstrap.coinPusherCollection.returnedCoins, 0);
});

test('Postgres queries preserve ordering, ownership, repeat creation and batch rollback', async t => {
  const f = await fixture(t), years = load('math-app/repositories/academic-years.repo.js', f.api);
  await years.ensureSchema();
  assert.equal((await years.findEnrollment('2025-26', 'S1')).className, 'P1');
  assert.equal(await years.findEnrollment('2025-26', 'missing'), null);
  const logs = load('math-app/repositories/logs.repo.js', f.api);
  await logs.insert({ studentId: 'S1', tag: 'test', questionText: '2+2', correctAnswer: '4', userAnswer: '4', isCorrect: true, timeSpent: 2 });
  assert.equal((await logs.history('S1', ['test']))[0].questiontext, '2+2');
  assert.equal(Number((await logs.todayOverview('S1', ['test'])).todayquestions), 1);
  assert.equal((await logs.history('S2', ['test'])).length, 0);
  for (const language of ['chinese', 'english']) {
    const assignments = load(language + '-app/repositories/assignments.repo.js', f.api), attempts = load(language + '-app/repositories/attempts.repo.js', f.api);
    const items = Array.from({ length: 5 }, (_, index) => ({ traditionalText: '題' + index, jyutping: 'tai4', englishMeaning: 'question', word: 'word' + index, hint: 'hint', orderIndex: 5 - index }));
    const before = f.queryCount();
    const created = await assignments.create({ teacherId: 'T1', targetClassname: 'P1', targetGroup: 'A', title: 'Class', status: 'published', items });
    assert.equal(f.queryCount() - before, 2, 'round trips must not grow with question count');
    const assignment = await assignments.getOne({ assignmentId: created.id });
    assert.equal(assignment.items.length, 5); assert.equal(assignment.items[0].orderIndex, 1);
    const first = await attempts.ensure({ assignmentId: created.id, studentId: 'S1' }), second = await attempts.ensure({ assignmentId: created.id, studentId: 'S1' });
    assert.equal(first.items.length, 5); assert.equal(first.id, second.id);
    assert.equal(JSON.stringify(first.items.map(i => i.assignmentItemId)), JSON.stringify(assignment.items.map(i => i.id)));
    const patch = language === 'chinese' ? { speechCorrect: true } : { correct: true };
    assert.equal(await attempts.updateItem({ attemptId: first.id, studentId: 'S2', assignmentItemId: first.items[0].assignmentItemId, patch }), false);
    assert.equal(await attempts.updateItem({ attemptId: first.id, studentId: 'S1', assignmentItemId: first.items[0].assignmentItemId, patch }), true);
    await assert.rejects(assignments.create({ teacherId: 'T1', targetClassname: 'P1', targetGroup: 'A', title: 'Invalid', status: 'published', items: [items[0], items[0]] }));
    assert.equal((await assignments.listForTeacher('T1')).length, 1);
    if (language === 'chinese') {
      const args = { assignmentId: created.id, itemId: first.items[0].assignmentItemId, studentId: 'S1' };
      for (const [viewerId, viewerRole, allowed] of [['S1', 'student', true], ['S2', 'student', false], ['T1', 'teacher', true], ['T2', 'teacher', false]]) {
        assert.equal(await assignments.canReadRecording({ ...args, viewerId, viewerRole }), allowed);
      }
    }
  }
});

test('migration closes anonymous tables while preserving backend and future defaults', async t => {
  const f = await fixture(t);
  await f.db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon,authenticated;');
  await f.db.transaction(tx => tx.exec(fs.readFileSync(path.join(root, 'db/migrations/20261010_server_only_data.sql'), 'utf8')));
  const result = await f.db.query("SELECT count(*)::int AS exposed FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND (NOT c.relrowsecurity OR has_table_privilege('anon',c.oid,'SELECT') OR has_table_privilege('authenticated',c.oid,'SELECT'))");
  assert.equal(result.rows[0].exposed, 0);
  await f.db.exec('SET ROLE anon'); await assert.rejects(f.db.query('SELECT * FROM users'), /permission denied/); await f.db.exec('RESET ROLE');
  assert.equal((await f.db.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 4);
  await f.db.exec('CREATE TABLE future_school_table(id int)');
  assert.equal((await f.db.query("SELECT has_table_privilege('anon','future_school_table','SELECT') AS access")).rows[0].access, false);
});

test('recording readers reject traversal and distinguish images from student audio', () => {
  const storage = require('../chinese-app/lib/storage');
  const object = 'S1/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002/practice.webm';
  const protectedUrl = storage.protectRecordingUrl('https://test.supabase.co/storage/v1/object/public/recordings/' + object);
  assert.match(protectedUrl, /^\/api\/chinese\/recordings\?path=/);
  assert.equal(storage.protectRecordingUrl(protectedUrl), protectedUrl);
  assert.equal(storage.recordingParts(object.replace('practice', 'done')).phase, 'done');
  assert.match(storage.protectRecordingUrl('https://test.supabase.co/storage/v1/object/public/recordings/' + object.replace('practice', 'done')), /^\/api\/chinese\/recordings/);
  assert.equal(storage.protectRecordingUrl('https://evil.example/voice.wav'), null);
  assert.equal(storage.recordingParts('../S1/' + object), null);
  assert.equal(storage.recordingParts(object.replace('practice', '../../bank')), null);
  assert.match(storage.protectImageUrl('https://test.supabase.co/storage/v1/object/public/recordings/bank/item-test.png'), /^\/api\/chinese\/legacy-image/);
  assert.equal(storage.isLegacyImagePath(object), false);
});

test('operation receipts commit once, reject key reuse, and roll back failed effects', async t => {
  const f = await fixture(t), receipts = load('shared/operation-receipts.js', f.api);
  const op = receipts.operation('S1', 'fixture-operation-1', 'math_submit', [{ index: 1, userAnswer: 4 }]);
  let calls = 0;
  const effects = client => { calls++; return client.query("INSERT INTO questionlogs(studentid,question) VALUES('S1','saved')").then(() => ({ success: true, answer: 4 })); };
  const first = await receipts.run(op, effects);
  const replay = await receipts.run(op, effects);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(replay))); assert.equal(calls, 1);
  await assert.rejects(receipts.read(receipts.operation('S1', op.key, op.kind, [{ index: 1, userAnswer: 5 }])), /識別碼/);
  const failed = receipts.operation('S1', 'fixture-operation-2', 'math_submit', []);
  await assert.rejects(receipts.run(failed, async client => { await client.query("INSERT INTO questionlogs(studentid,question) VALUES('S1','rollback')"); throw Error('connection lost before commit'); }));
  assert.equal(await receipts.read(failed), null);
  assert.equal((await f.db.query('SELECT count(*)::int AS n FROM questionlogs')).rows[0].n, 1);
});

test('SQL metrics count callback and promise queries without exposing parameter values', async () => {
  const { EventEmitter } = require('node:events');
  const { instrumentPool, requests, measurePhase } = require('../shared/request-metrics');
  const client = { query(...args) { const cb = typeof args.at(-1) === 'function' ? args.at(-1) : null; return cb ? setImmediate(() => cb(null, { rows: [] })) : Promise.resolve({ rows: [] }); } };
  const pool = new EventEmitter();
  pool.connect = callback => callback ? setImmediate(() => callback(null, client)) : Promise.resolve(client);
  instrumentPool(pool); pool.emit('connect', client); pool.emit('connect', client);
  const metrics = { sqlCount: 0, sqlMs: 0, poolWaitMs: 0, phases: {} };
  await requests.run(metrics, async () => {
    const acquired = await pool.connect(); await acquired.query('SELECT $1', ['private']);
    await new Promise((resolve, reject) => pool.connect((error, db) => error ? reject(error) : db.query('SELECT $1', ['private'], error => error ? reject(error) : resolve())));
    await measurePhase('tts', async () => 1);
  });
  assert.equal(metrics.sqlCount, 2); assert.ok(metrics.sqlMs >= 0); assert.ok(metrics.poolWaitMs >= 0); assert.ok(metrics.phases.tts >= 0);
  assert.doesNotMatch(JSON.stringify(metrics), /private/);
});

test('recording HTTP authorization signs only the owning student or assignment teacher', async t => {
  const f = await fixture(t), assignments = load('chinese-app/repositories/assignments.repo.js', f.api);
  const created = await assignments.create({ teacherId:'T1',targetClassname:'P1',targetGroup:'A',title:'Audio',status:'published',items:[{traditionalText:'字',jyutping:'zi6',englishMeaning:'word',orderIndex:1}] });
  const item = (await assignments.getOne({ assignmentId:created.id })).items[0];
  const attempts = load('chinese-app/repositories/attempts.repo.js',f.api);
  await attempts.ensure({ assignmentId:created.id,studentId:'S1' });
  const storage = require('../chinese-app/lib/storage'); let signed = 0;
  const media = load('chinese-app/routes/media.js',f.api, {
    '../repositories/assignments.repo':assignments,
    '../lib/storage':{...storage,isStorageConfigured:()=>true,signedObjectUrl:async()=>{signed++;return 'https://storage.example/signed';}},
    '../lib/google':{isGoogleConfigured:()=>false},'../lib/pronunciation':{isConfigured:()=>false},
  });
  const app = require('express')(); app.use(require('express').json());
  app.use((req,res,next)=>{ if(req.get('x-role')) req.session={role:req.get('x-role'),studentId:req.get('x-id')};next(); }); app.use('/api/chinese',media);
  const server = app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve)); t.after(()=>new Promise(resolve=>server.close(resolve)));
  const base='http://127.0.0.1:'+server.address().port;
  const object=`S1/${created.id}/${item.id}/practice.webm`;
  const url=base+'/api/chinese/recordings?path='+encodeURIComponent(object);
  assert.equal((await fetch(url,{redirect:'manual'})).status,401);
  for(const [role,id,status] of [['student','S1',302],['student','S2',404],['teacher','T1',302],['teacher','T2',404]]) {
    const response=await fetch(url,{headers:{'x-role':role,'x-id':id},redirect:'manual'}); assert.equal(response.status,status);
    assert.match(response.headers.get('cache-control'),/no-store/);
  }
  assert.equal(signed,2);
  assert.equal((await fetch(base+'/api/chinese/legacy-image?path=bank/test.png',{headers:{'x-role':'student','x-id':'S1'},redirect:'manual'})).status,302);
  assert.equal((await fetch(base+'/api/chinese/legacy-image?path='+encodeURIComponent(object),{headers:{'x-role':'student','x-id':'S1'},redirect:'manual'})).status,404);
  assert.equal(signed,3);
});

test('precompressed assets preserve bytes, cache policy, HEAD and range behavior', async t => {
  const os = require('node:os'), http = require('node:http'), zlib = require('node:zlib');
  const { assetStatic } = require('../shared/asset-static');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'buio-assets-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const bytes = Buffer.from('const school = "same bytes";\n'.repeat(1000));
  fs.writeFileSync(path.join(folder, 'app.js'), bytes);
  fs.writeFileSync(path.join(folder, 'app.js.br'), zlib.brotliCompressSync(bytes));
  fs.writeFileSync(path.join(folder, 'app.js.gz'), zlib.gzipSync(bytes));
  fs.mkdirSync(path.join(folder, '.private')); fs.writeFileSync(path.join(folder, '.private/data.json'), 'private');
  const app = require('express')(); app.use(assetStatic(folder, { setHeaders: res => res.set('Cache-Control', 'private, no-store') }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const get = (url, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const request = http.request({ hostname: '127.0.0.1', port: server.address().port, path: url, headers, method }, response => {
      const chunks = []; response.on('data', data => chunks.push(data)); response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    }); request.on('error', reject); request.end();
  });
  for (const encoding of ['br', 'gzip', 'identity']) {
    const response = await get('/app.js', { 'Accept-Encoding': encoding });
    assert.equal(response.status, 200); assert.match(response.headers.vary, /Accept-Encoding/);
    assert.equal(response.headers['cache-control'], 'private, no-store');
    assert.match(response.headers['content-type'], /javascript/);
    const decoded = encoding === 'br' ? zlib.brotliDecompressSync(response.body) : encoding === 'gzip' ? zlib.gunzipSync(response.body) : response.body;
    assert.deepEqual(decoded, bytes);
    const head = await get('/app.js', { 'Accept-Encoding': encoding }, 'HEAD');
    assert.equal(head.status, 200); assert.equal(head.body.length, 0); assert.equal(head.headers['content-length'], response.headers['content-length']);
  }
  const range = await get('/app.js', { 'Accept-Encoding': 'br', Range: 'bytes=0-10' });
  assert.equal(range.status, 206); assert.equal(range.headers['content-encoding'], undefined); assert.deepEqual(range.body, bytes.subarray(0, 11));
  assert.equal((await get('/.private/data.json', { 'Accept-Encoding': 'br' })).status, 404);
  assert.equal((await get('/%2e%2e/.private/data.json', { 'Accept-Encoding': 'br' })).status, 404);
});

test('admin unlock requires teacher, rejects old revisions and limits failed guesses', async t => {
  const config = { adminPassword: 'fixture-secret', session: { secret: 'fixture-session' }, db: { mode: 'json' } };
  const admin = load('shared/admin-auth.js', {}, { '../config': config });
  assert.equal(admin.matches('fixture-secret'), true); assert.equal(admin.matches('wrong'), false);
  assert.equal(admin.unlocked({ adminUnlocked: true }), false);
  const session = { studentId: 'T1', role: 'teacher', adminUnlocked: true, adminRevision: admin.revision() };
  config.adminPassword = 'new-fixture-secret'; assert.equal(admin.unlocked(session), false);
  const router = load('math-app/routes/auth.js', {}, { '../../config': config, '../../shared/admin-auth': admin });
  const app = require('express')(); app.use(require('express').json());
  app.use((req, res, next) => { req.session = req.get('x-student') ? { studentId: 'S1', role: 'student' } : session; next(); }); app.use(router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (password, headers = {}) => fetch(base + '/unlock-admin', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ password }) });
  assert.equal((await post('new-fixture-secret', { 'x-student': '1' })).status, 403);
  assert.equal((await post('new-fixture-secret')).status, 200); assert.equal(admin.unlocked(session), true);
  for (let n = 0; n < 5; n++) assert.equal((await post('wrong')).status, 401);
  const limited = await post('new-fixture-secret'); assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get('retry-after')) > 0);
  config.adminPassword = null; assert.equal((await post('new-fixture-secret')).status, 503);
});
