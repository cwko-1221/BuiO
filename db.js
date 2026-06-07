'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { ALL_TAGS } = require('./math-app/engine/questionGenerator');
const { Pool } = require('pg');

// ================================================================
// Dual Database Engine: Supabase Postgres OR Local JSON
// ================================================================

let pool = null;

if (process.env.SUPABASE_DB_URL) {
  // Use Supabase PostgreSQL
  pool = new Pool({
    connectionString: process.env.SUPABASE_DB_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  console.log('⚠️ 未偵測到 SUPABASE_DB_URL，將使用本地端 JSON 資料庫模式 (data/db.json)');
}

// ================================================================
// Postgres Mode
// ================================================================

async function initPostgres() {
  if (!pool) return;
  console.log('🔄 初始化 Supabase 資料表...');
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS Users (
        StudentID VARCHAR(20) PRIMARY KEY,
        Name VARCHAR(100),
        Role VARCHAR(20),
        PasswordHash VARCHAR(255),
        ClassName VARCHAR(20),
        ChineseGroup VARCHAR(20),
        EnglishGroup VARCHAR(20),
        MathGroup VARCHAR(20),
        Language VARCHAR(20) DEFAULT 'zh-HK'
      );
      ALTER TABLE Users ADD COLUMN IF NOT EXISTS ClassName VARCHAR(20);
      ALTER TABLE Users ADD COLUMN IF NOT EXISTS ChineseGroup VARCHAR(20);
      ALTER TABLE Users ADD COLUMN IF NOT EXISTS EnglishGroup VARCHAR(20);
      ALTER TABLE Users ADD COLUMN IF NOT EXISTS MathGroup VARCHAR(20);
      ALTER TABLE Users ADD COLUMN IF NOT EXISTS Language VARCHAR(20) DEFAULT 'zh-HK';

      CREATE TABLE IF NOT EXISTS StudentStats (
        id SERIAL PRIMARY KEY,
        StudentID VARCHAR(20),
        Tag VARCHAR(50),
        TotalAttempted INT DEFAULT 0,
        TotalCorrect INT DEFAULT 0,
        AccuracyRate FLOAT DEFAULT 0,
        UNIQUE(StudentID, Tag)
      );

      CREATE TABLE IF NOT EXISTS QuestionLogs (
        id SERIAL PRIMARY KEY,
        StudentID VARCHAR(20),
        Tag VARCHAR(50),
        Question VARCHAR(255),
        CorrectAnswer VARCHAR(50),
        UserAnswer VARCHAR(50),
        IsCorrect BOOLEAN,
        TimeSpent INT,
        Timestamp TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE QuestionLogs ADD COLUMN IF NOT EXISTS CorrectAnswer VARCHAR(50);
    `);
    
    // Seed defaults if empty
    const { rows } = await client.query('SELECT COUNT(*) FROM Users');
    if (parseInt(rows[0].count) === 0) {
      console.log('🌱 寫入預設帳號...');
      const hash = bcrypt.hashSync('123456', 10);
      const defaults = [
        ['S001', '王小明', 'student', hash],
        ['S002', '李小華', 'student', hash],
        ['S003', '張小美', 'student', hash],
        ['S004', '陳大偉', 'student', hash],
        ['S005', '林小芬', 'student', hash],
        ['T001', '陳老師', 'teacher', hash]
      ];
      for (const u of defaults) {
        await client.query('INSERT INTO Users (StudentID, Name, Role, PasswordHash) VALUES ($1, $2, $3, $4)', u);
      }
      
      const students = defaults.filter(d => d[2] === 'student');
      for (const s of students) {
        for (const tag of ALL_TAGS) {
          await client.query(
            'INSERT INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate) VALUES ($1, $2, 0, 0, 0)',
            [s[0], tag]
          );
        }
      }
    }
    console.log('✅ Supabase 資料庫準備就緒！');
  } catch (e) {
    console.error('❌ 初始化 Supabase 錯誤:', e);
  } finally {
    client.release();
  }
}

if (pool) {
  initPostgres();
}

// ================================================================
// Local JSON Mode (Fallback)
// ================================================================

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
let _data = null;

function load() {
  if (_data) return _data;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    _data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } else {
    _data = { users: [], studentStats: [], questionLogs: [], _logId: 0 };
  }
  return _data;
}

function save() {
  fs.writeFileSync(DB_FILE, JSON.stringify(load(), null, 2), 'utf8');
}

function seedDefaults() {
  const d = load();
  const defaults = [
    { studentid: 'S001', name: '王小明', role: 'student' },
    { studentid: 'S002', name: '李小華', role: 'student' },
    { studentid: 'S003', name: '張小美', role: 'student' },
    { studentid: 'S004', name: '陳大偉', role: 'student' },
    { studentid: 'S005', name: '林小芬', role: 'student' },
    { studentid: 'T001', name: '陳老師', role: 'teacher' },
  ];
  const hash = bcrypt.hashSync('123456', 10);
  for (const u of defaults) {
    if (!d.users.find(x => x.studentid === u.studentid)) {
      d.users.push({ ...u, passwordhash: hash, language: 'zh-HK' });
    }
  }
  const tags = ALL_TAGS;
  for (const u of d.users.filter(x => x.role === 'student')) {
    for (const tag of tags) {
      if (!d.studentStats.find(s => s.studentid === u.studentid && s.tag === tag)) {
        d.studentStats.push({ studentid: u.studentid, tag, totalattempted: 0, totalcorrect: 0, accuracyrate: 0 });
      }
    }
  }
  save();
}

// Helpers
function norm(sql) { return sql.replace(/\s+/g, ' ').trim(); }
function lo(sql) { return norm(sql).toLowerCase(); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function round(v, d) { const f = Math.pow(10, d); return Math.round(v * f) / f; }

// Users query handler
function handleUsers(sql, params) {
  const d = load();
  const s = lo(sql);

  if (s.startsWith('delete')) {
    d.users = d.users.filter(u => u.studentid !== params[0]);
    save();
    return { rows: [] };
  }

  if (s.startsWith('update')) {
    // UPDATE Users SET Field = $1 WHERE StudentID = $2
    const setMatch = s.match(/set\s+([a-z0-9_]+)\s*=\s*\$1/i);
    const whereMatch = s.match(/where\s+studentid\s*=\s*\$2/i);
    if (setMatch && whereMatch && params.length >= 2) {
      const field = setMatch[1].toLowerCase();
      const value = params[0];
      const studentId = params[1];
      const u = d.users.find(x => x.studentid === studentId);
      if (u) {
        u[field] = value;
        save();
      }
    } else {
      // Legacy hardcoded update just in case
      const u = d.users.find(x => x.studentid === 'T001' && x.name === '孔子老師');
      if (u) { u.name = '老師'; save(); }
    }
    return { rows: [] };
  }

  if (s.startsWith('insert')) {
    const id = params[0];
    const existing = d.users.find(u => u.studentid === id);
    if (existing) throw new Error('duplicate key value violates unique constraint');
    d.users.push({ studentid: id, name: params[1], role: params[2], passwordhash: params[3] });
    save();
    return { rows: [] };
  }

  if (s.startsWith('select count(*)')) {
    return { rows: [{ count: d.users.length }] };
  }

  if (s.startsWith('select * from users where studentid = $1')) {
    const u = d.users.find(u => u.studentid === params[0]);
    return { rows: u ? [u] : [] };
  }

  // Handle generic SELECT ... FROM users WHERE studentid = $1
  if (s.startsWith('select ') && s.includes('from users where studentid = $1')) {
    const u = d.users.find(u => u.studentid === params[0]);
    if (!u) return { rows: [] };
    
    // If it's a specific select (not *), we return the full user anyway since it's just JS objects.
    // The caller will only pick the fields they need.
    return { rows: [u] };
  }

  if (s.startsWith('select studentid, name from users')) {
    return { rows: d.users.map(u => ({ studentid: u.studentid, name: u.name })) };
  }

  return { rows: [] };
}

// Stats query handler
function handleStats(sql, params) {
  const d = load();
  const s = lo(sql);

  if (s.startsWith('delete')) {
    d.studentStats = d.studentStats.filter(st => st.studentid !== params[0]);
    save();
    return { rows: [] };
  }

  if (s.startsWith('insert into studentstats') && s.includes('on conflict')) {
    const [sid, tag, incA, incC, acc] = params;
    let st = d.studentStats.find(x => x.studentid === sid && x.tag === tag);
    if (!st) {
      st = { studentid: sid, tag, totalattempted: 0, totalcorrect: 0, accuracyrate: 0 };
      d.studentStats.push(st);
    }
    st.totalattempted += incA;
    st.totalcorrect += incC;
    st.accuracyrate = st.totalattempted > 0 ? round(st.totalcorrect / st.totalattempted * 100, 1) : 0;
    save();
    return { rows: [] };
  }

  if (s.startsWith('select * from studentstats')) {
    return { rows: d.studentStats.filter(st => st.studentid === params[0]) };
  }

  if (s.startsWith('select tag, accuracyrate from studentstats')) {
    return { rows: d.studentStats.filter(st => st.studentid === params[0]).map(x => ({ tag: x.tag, accuracyrate: x.accuracyrate })) };
  }

  if (s.startsWith('select coalesce(sum(totalattempted), 0) as totalquestions')) {
    let stats = d.studentStats;
    if (params && params[0]) {
      const p1 = params[0];
      if (Array.isArray(p1)) {
        stats = stats.filter(st => p1.includes(st.tag));
      } else {
        stats = stats.filter(st => st.studentid === p1);
      }
    }
    const tq = stats.reduce((a, b) => a + b.totalattempted, 0);
    const tc = stats.reduce((a, b) => a + b.totalcorrect, 0);
    const acc = tq > 0 ? round(tc / tq * 100, 1) : 0;
    return { rows: [{ totalquestions: tq, totalcorrect: tc, overallaccuracy: acc }] };
  }

  return { rows: [] };
}

// Logs query handler
function handleLogs(sql, params) {
  const d = load();
  const s = lo(sql);

  if (s.startsWith('delete')) {
    d.questionLogs = d.questionLogs.filter(l => l.studentid !== params[0]);
    save();
    return { rows: [] };
  }

  if (s.startsWith('insert')) {
    d._logId++;
    const [sid, tag, q, ans, isC, ts] = params;
    d.questionLogs.push({
      id: d._logId,
      studentid: sid,
      tag,
      question: q,
      useranswer: ans,
      iscorrect: isC,
      timespent: ts,
      timestamp: new Date().toISOString()
    });
    save();
    return { rows: [] };
  }

  if (s.startsWith('select count(*) as count from questionlogs')) {
    return { rows: [{ count: d.questionLogs.length }] };
  }

  if (s.startsWith('select count(*) as todayquestions')) {
    const today = todayStr();
    let logs = d.questionLogs.filter(l => l.timestamp.startsWith(today));
    if (params && params.length > 0) {
      if (Array.isArray(params[0])) {
        logs = logs.filter(l => params[0].includes(l.tag));
      } else {
        logs = logs.filter(l => l.studentid === params[0]);
        if (params[1]) logs = logs.filter(l => params[1].includes(l.tag));
      }
    }
    const tq = logs.length;
    const tc = logs.filter(l => l.iscorrect).length;
    const acc = tq > 0 ? round(tc / tq * 100, 1) : 0;
    return { rows: [{ todayquestions: tq, todaycorrect: tc, todayaccuracy: acc }] };
  }

  if (s.startsWith('select count(*) as incorrectcount')) {
    let logs = d.questionLogs.filter(l => l.studentid === params[0] && !l.iscorrect);
    if (params[1]) logs = logs.filter(l => params[1].includes(l.tag));
    
    const countMap = {};
    for (const l of logs) {
      countMap[l.tag] = (countMap[l.tag] || 0) + 1;
    }
    const sorted = Object.entries(countMap)
      .map(([tag, count]) => ({ tag, incorrectcount: count }))
      .sort((a, b) => b.incorrectcount - a.incorrectcount)
      .slice(0, 3);
    return { rows: sorted };
  }

  if (s.startsWith('select tag, avg(timespent) as avgtime')) {
    let logs = d.questionLogs;
    if (params && params[0]) {
      if (Array.isArray(params[0])) {
        logs = logs.filter(l => params[0].includes(l.tag));
      } else {
        logs = logs.filter(l => l.studentid === params[0]);
        if (params[1]) logs = logs.filter(l => params[1].includes(l.tag));
      }
    }
    
    const tagMap = {};
    for (const l of logs) {
      if (!tagMap[l.tag]) tagMap[l.tag] = { sum: 0, count: 0 };
      tagMap[l.tag].sum += l.timespent;
      tagMap[l.tag].count += 1;
    }
    
    const res = Object.entries(tagMap).map(([tag, data]) => ({
      tag,
      avgtime: round(data.sum / data.count, 1)
    }));
    return { rows: res };
  }

  if (s.startsWith('select q.timestamp')) {
    let logs = d.questionLogs;
    if (params && params[0] && !Array.isArray(params[0])) {
      logs = logs.filter(l => l.studentid === params[0]);
      if (params[1]) logs = logs.filter(l => params[1].includes(l.tag));
    } else if (params && Array.isArray(params[0])) {
      logs = logs.filter(l => params[0].includes(l.tag));
    }
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    logs = logs.slice(0, 10);
    return { rows: logs.map(l => ({ ...l, iscorrect: l.iscorrect })) };
  }

  return { rows: [] };
}

// JOIN handler (teacher students overview)
function handleJoin(sql, params) {
  const d = load();
  const tagArray = params && params[0] ? params[0] : null;
  const students = d.users.filter(u => u.role === 'student');
  const rows = students.map(u => {
    let stats = d.studentStats.filter(s => s.studentid === u.studentid);
    if (tagArray && Array.isArray(tagArray)) stats = stats.filter(s => tagArray.includes(s.tag));
    const totalq = stats.reduce((a, s) => a + s.totalattempted, 0);
    const totalc = stats.reduce((a, s) => a + s.totalcorrect, 0);
    const acc = totalq > 0 ? round(totalc / totalq * 100, 1) : 0;
    return { id: u.studentid, name: u.name, totalquestions: totalq, overallaccuracy: acc };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return { rows };
}

// ----------------------------------------------------------------
// Main query dispatcher
// ----------------------------------------------------------------
async function query(sql, params) {
  if (pool) {
    try {
      return await pool.query(sql, params);
    } catch (e) {
      console.error('Supabase Query Error:', e.message, sql);
      throw e;
    }
  }

  const s = lo(sql);

  // DDL — no-ops
  if (s.startsWith('create table') || s.startsWith('alter table') || s.startsWith('create index')) {
    return { rows: [] };
  }

  // Transactions — no-ops (single-threaded JSON file)
  if (s === 'begin' || s === 'commit' || s === 'rollback') {
    return { rows: [] };
  }

  // information_schema
  if (s.includes('information_schema')) {
    return { rows: [{ name: 'users' }, { name: 'questionlogs' }, { name: 'studentstats' }] };
  }

  // JOIN queries (teacher students)
  if (s.includes('left join studentstats') || s.includes('join studentstats')) {
    return handleJoin(sql, params);
  }

  // Route to table-specific handlers
  if (s.includes('users') && !s.includes('studentstats') && !s.includes('questionlogs')) {
    return handleUsers(sql, params);
  }
  if (s.includes('studentstats')) {
    return handleStats(sql, params);
  }
  if (s.includes('questionlogs')) {
    return handleLogs(sql, params);
  }

  console.warn('[db.js] Unhandled query:', norm(sql));
  return { rows: [] };
}

// ----------------------------------------------------------------
// pg.Pool-compatible connect() for transactions
// ----------------------------------------------------------------
async function connect() {
  if (pool) {
    return await pool.connect();
  }
  return {
    query: async (sql, params) => query(sql, params),
    release: () => {},
  };
}

// ----------------------------------------------------------------
// Initialize on load
// ----------------------------------------------------------------
if (!pool) {
  load();
  if (load().users.length === 0) {
    seedDefaults();
  }
  // Ensure T001 name is consistent
  const t001 = load().users.find(u => u.studentid === 'T001');
  if (t001 && t001.name === '孔子老師') {
    t001.name = '陳老師';
    save();
  }
  console.log(`✅ JSON 資料庫就緒 (${load().users.length} 位用戶, ${load().questionLogs.length} 筆作答紀錄)`);
}

// ----------------------------------------------------------------
// Export pg.Pool-compatible interface
// ----------------------------------------------------------------
module.exports = {
  query,
  connect,
  on: () => {},          // no-op (pg error handler)
  end: () => {},         // no-op
  // Convenience accessors
  _load: load,
  _save: save,
  _seedDefaults: seedDefaults,
};
