'use strict';

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { ALL_TAGS } = require('./math-app/engine/questionGenerator');

// ================================================================
// JSON File Database — pg.Pool-compatible query interface
// Data lives in data/db.json, no external DB needed.
// ================================================================

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let _data = null;

// ----------------------------------------------------------------
// Data I/O
// ----------------------------------------------------------------
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

// ----------------------------------------------------------------
// Seed default accounts on first run
// ----------------------------------------------------------------
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
      d.users.push({ ...u, passwordhash: hash });
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

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function norm(sql) { return sql.replace(/\s+/g, ' ').trim(); }
function lo(sql) { return norm(sql).toLowerCase(); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function round(v, d) { const f = Math.pow(10, d); return Math.round(v * f) / f; }

// ----------------------------------------------------------------
// Users query handler
// ----------------------------------------------------------------
function handleUsers(sql, params) {
  const d = load();
  const s = lo(sql);

  // DELETE FROM Users WHERE StudentID = $1
  if (s.startsWith('delete')) {
    d.users = d.users.filter(u => u.studentid !== params[0]);
    save();
    return { rows: [] };
  }

  // UPDATE Users SET Name = '老師' WHERE StudentID = 'T001' AND Name = '孔子老師'
  if (s.startsWith('update')) {
    // Generic update: parse SET field = value WHERE conditions
    // Handle the specific known update from database.js init
    const u = d.users.find(x => x.studentid === 'T001' && x.name === '孔子老師');
    if (u) { u.name = '老師'; save(); }
    return { rows: [] };
  }

  // INSERT INTO Users
  if (s.startsWith('insert')) {
    const id = params[0];
    const existing = d.users.find(u => u.studentid === id);
    if (s.includes('on conflict') && existing) return { rows: [] };
    if (existing) return { rows: [] }; // treat all inserts as upsert-safe
    const role = s.includes("'student'") ? 'student' : (params[3] || 'student');
    d.users.push({ studentid: params[0], name: params[1], passwordhash: params[2], role });
    save();
    return { rows: [] };
  }

  // SELECT COUNT(*) as count FROM Users
  if (s.includes('count(*)') && !s.includes('where')) {
    return { rows: [{ count: d.users.length }] };
  }

  // SELECT StudentID, Name FROM Users  (no WHERE)
  if (s.includes('select') && s.includes('studentid') && s.includes('name') && !s.includes('where')) {
    return { rows: d.users.map(u => ({ studentid: u.studentid, name: u.name })) };
  }

  // SELECT StudentID FROM Users WHERE Role = 'student'
  if (s.includes("role = 'student'") || s.includes('role = $')) {
    const role = params && params[0] ? params[0] : 'student';
    return { rows: d.users.filter(u => u.role === role).map(u => ({ studentid: u.studentid })) };
  }

  // SELECT * / specific columns FROM Users WHERE StudentID = $1
  if (s.includes('where studentid')) {
    const u = d.users.find(x => x.studentid === params[0]);
    return { rows: u ? [{ ...u }] : [] };
  }

  return { rows: [] };
}

// ----------------------------------------------------------------
// StudentStats query handler
// ----------------------------------------------------------------
function handleStats(sql, params) {
  const d = load();
  const s = lo(sql);

  // DELETE FROM StudentStats WHERE StudentID = $1
  if (s.startsWith('delete')) {
    d.studentStats = d.studentStats.filter(r => r.studentid !== params[0]);
    save();
    return { rows: [] };
  }

  // UPSERT: INSERT INTO StudentStats ... ON CONFLICT DO UPDATE
  // params: [studentId, tag, isCorrect]
  if (s.startsWith('insert') && s.includes('on conflict') && s.includes('do update')) {
    const studentId = params[0];
    const tag = params[1];
    const isCorrect = parseInt(params[2]) || 0;
    
    let row = d.studentStats.find(r => r.studentid === studentId && r.tag === tag);
    if (!row) {
      row = { studentid: studentId, tag, totalattempted: 0, totalcorrect: 0, accuracyrate: 0 };
      d.studentStats.push(row);
    }
    
    row.totalattempted += 1;
    row.totalcorrect += isCorrect;
    row.accuracyrate = row.totalattempted > 0 ? round(row.totalcorrect / row.totalattempted * 100, 2) : 0;
    save();
    return { rows: [] };
  }

  // Original INSERT INTO StudentStats ... ON CONFLICT DO NOTHING
  if (s.startsWith('insert')) {
    const id = params[0], tag = params[1];
    if (!d.studentStats.find(r => r.studentid === id && r.tag === tag)) {
      d.studentStats.push({ studentid: id, tag, totalattempted: 0, totalcorrect: 0, accuracyrate: 0 });
      save();
    }
    return { rows: [] };
  }

  // Original UPDATE (Legacy fallback)
  if (s.startsWith('update')) {
    const isCorrect = parseInt(params[0]) || 0;
    const studentId = params[2];
    const tag = params[3];
    const row = d.studentStats.find(r => r.studentid === studentId && r.tag === tag);
    if (row) {
      row.totalattempted += 1;
      row.totalcorrect += isCorrect;
      row.accuracyrate = row.totalattempted > 0 ? round(row.totalcorrect / row.totalattempted * 100, 2) : 0;
      save();
    }
    return { rows: [] };
  }

  // SELECT * FROM StudentStats  (no WHERE — db-status endpoint)
  if (s.includes('select') && !s.includes('where') && !s.includes('join')) {
    return { rows: d.studentStats.map(r => ({ ...r })) };
  }

  // --- Complex aggregate queries from stats.js ---

  const studentId = params ? params[0] : null;
  const tagArray = params && params[1] ? params[1] : null;
  let filtered = d.studentStats;
  if (studentId) filtered = filtered.filter(r => r.studentid === studentId);
  if (tagArray && Array.isArray(tagArray)) filtered = filtered.filter(r => tagArray.includes(r.tag));

  // Overview: SUM(TotalAttempted), SUM(TotalCorrect), overall accuracy
  if (s.includes('overallaccuracy') || (s.includes('sum(totalattempted)') && s.includes('from studentstats'))) {
    const totalq = filtered.reduce((a, r) => a + r.totalattempted, 0);
    const totalc = filtered.reduce((a, r) => a + r.totalcorrect, 0);
    const acc = totalq > 0 ? round(totalc / totalq * 100, 1) : 0;
    return { rows: [{ totalquestions: totalq, totalcorrect: totalc, overallaccuracy: acc }] };
  }

  // Weaknesses: AccuracyRate < 70
  if (s.includes('accuracyrate < 70')) {
    const weak = filtered.filter(r => r.totalattempted > 0 && r.accuracyrate < 70)
      .sort((a, b) => a.accuracyrate - b.accuracyrate);
    return { rows: weak.map(r => ({ tag: r.tag, totalattempted: r.totalattempted, totalcorrect: r.totalcorrect, accuracyrate: r.accuracyrate })) };
  }

  // Tags list: simple select with tag filter
  if (s.includes('order by tag') || (s.includes('from studentstats') && s.includes('where') && !s.includes('sum'))) {
    const sorted = filtered.sort((a, b) => a.tag.localeCompare(b.tag));
    return { rows: sorted.map(r => ({ tag: r.tag, totalattempted: r.totalattempted, totalcorrect: r.totalcorrect, accuracyrate: r.accuracyrate })) };
  }

  // Teacher students: LEFT JOIN Users with StudentStats
  // This is handled separately in handleJoin

  // Fallback: return filtered stats (for adaptiveEngine)
  return { rows: filtered.map(r => ({ tag: r.tag, totalattempted: r.totalattempted, totalcorrect: r.totalcorrect, accuracyrate: r.accuracyrate })) };
}

// ----------------------------------------------------------------
// QuestionLogs query handler
// ----------------------------------------------------------------
function handleLogs(sql, params) {
  const d = load();
  const s = lo(sql);

  // DELETE FROM QuestionLogs WHERE StudentID = $1
  if (s.startsWith('delete')) {
    d.questionLogs = d.questionLogs.filter(r => r.studentid !== params[0]);
    save();
    return { rows: [] };
  }

  // INSERT INTO QuestionLogs
  if (s.startsWith('insert')) {
    d._logId = (d._logId || 0) + 1;
    d.questionLogs.push({
      logid: d._logId,
      studentid: params[0],
      tag: params[1],
      questiontext: params[2],
      correctanswer: parseFloat(params[3]),
      useranswer: parseFloat(params[4]),
      iscorrect: parseInt(params[5]) || 0,
      timetaken: parseFloat(params[6]) || 0,
      timestamp: new Date().toISOString()
    });
    save();
    return { rows: [] };
  }

  // SELECT COUNT(*) as count FROM QuestionLogs  (no WHERE — db-status)
  if (s.includes('count(*)') && !s.includes('where')) {
    return { rows: [{ count: d.questionLogs.length }] };
  }

  // --- Complex queries from stats.js ---

  const studentId = params ? params[0] : null;
  const tagArray = params && params[1] ? params[1] : null;
  let filtered = d.questionLogs;
  if (studentId) filtered = filtered.filter(r => r.studentid === studentId);
  if (tagArray && Array.isArray(tagArray)) filtered = filtered.filter(r => tagArray.includes(r.tag));

  // Today stats: CURRENT_DATE
  if (s.includes('current_date')) {
    const today = todayStr();
    filtered = filtered.filter(r => r.timestamp && r.timestamp.slice(0, 10) === today);
    const cnt = filtered.length;
    const correct = filtered.reduce((a, r) => a + (r.iscorrect || 0), 0);
    const acc = cnt > 0 ? round(correct / cnt * 100, 1) : 0;
    const times = filtered.map(r => r.timetaken || 0);
    const avg = times.length > 0 ? round(times.reduce((a, t) => a + t, 0) / times.length, 1) : 0;
    return { rows: [{ todayquestions: cnt, todaycorrect: correct, todayaccuracy: acc, avgtime: avg }] };
  }

  // History count: SELECT COUNT(*)... WHERE StudentID AND Tag filter
  if (s.includes('count(*)') && s.includes('where')) {
    // Check for extra tag filter (params may have a 3rd element)
    if (params.length > 2 && params[2] && !Array.isArray(params[2])) {
      filtered = filtered.filter(r => r.tag === params[2]);
    }
    return { rows: [{ count: filtered.length }] };
  }

  // Time analysis: AVG(TimeTaken) GROUP BY Tag
  if (s.includes('avg(timetaken)') && s.includes('group by tag')) {
    filtered = filtered.filter(r => r.timetaken > 0);
    const groups = {};
    for (const r of filtered) {
      if (!groups[r.tag]) groups[r.tag] = [];
      groups[r.tag].push(r.timetaken);
    }
    const rows = Object.entries(groups).map(([tag, times]) => ({
      tag,
      count: times.length,
      avgtime: round(times.reduce((a, t) => a + t, 0) / times.length, 1),
      mintime: round(Math.min(...times), 1),
      maxtime: round(Math.max(...times), 1),
    })).sort((a, b) => b.avgtime - a.avgtime);
    return { rows };
  }

  // History list: ORDER BY Timestamp DESC LIMIT ... OFFSET ...
  if (s.includes('order by timestamp') || s.includes('order by') && s.includes('limit')) {
    // Extra tag filter
    if (params.length > 2 && typeof params[2] === 'string' && params[2].length > 0 && !Array.isArray(params[2])) {
      // Check if this param looks like a tag (not a number)
      if (isNaN(params[2])) {
        filtered = filtered.filter(r => r.tag === params[2]);
      }
    }
    filtered = filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    // Find limit and offset in params (last two numeric params)
    const numParams = params.filter(p => typeof p === 'number' || (typeof p === 'string' && !isNaN(p) && p.length < 6));
    const limit = parseInt(numParams[numParams.length - 2]) || 50;
    const offset = parseInt(numParams[numParams.length - 1]) || 0;
    filtered = filtered.slice(offset, offset + limit);
    return {
      rows: filtered.map(r => ({
        logid: r.logid,
        tag: r.tag,
        questiontext: r.questiontext,
        correctanswer: r.correctanswer,
        useranswer: r.useranswer,
        iscorrect: r.iscorrect,
        timetaken: r.timetaken,
        timestamp: r.timestamp
      }))
    };
  }

  return { rows: [] };
}

// ----------------------------------------------------------------
// JOIN handler (teacher students overview)
// ----------------------------------------------------------------
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
  return {
    query: async (sql, params) => query(sql, params),
    release: () => {},
  };
}

// ----------------------------------------------------------------
// Initialize on load
// ----------------------------------------------------------------
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
