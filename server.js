'use strict';

const express = require('express');
const session = require('cookie-session');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { version: APP_VERSION } = require('./package.json');

const config = require('./config');
const db = require('./db');                  // JSON seed-on-boot side effect (json mode only)

const app = express();
const PORT = config.port;

// ----------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);                     // same-origin / curl
    if (!config.isProd) return cb(null, true);              // dev: anything
    if (config.cors.origins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.set('trust proxy', 1);

app.use(session({
  name: 'session',
  keys: [config.session.secret],
  maxAge: config.session.maxAge,
  secure: config.session.secure,
  httpOnly: true,
  sameSite: 'lax',
}));

// ----------------------------------------------------------------
// API routes (math app)
// ----------------------------------------------------------------
app.use('/api/auth', require('./math-app/routes/auth'));
app.use('/api/quiz', require('./math-app/routes/quiz'));
app.use('/api/stats', require('./math-app/routes/stats'));

// Missing-homework module
app.use('/api/homework', require('./homework-app/routes/homework'));

// Chinese module
app.use('/api/chinese/teacher', require('./chinese-app/routes/teacher'));
app.use('/api/chinese/student', require('./chinese-app/routes/student'));
app.use('/api/chinese', require('./chinese-app/routes/media'));

// English module
app.use('/api/english/teacher', require('./english-app/routes/teacher'));
app.use('/api/english/student', require('./english-app/routes/student'));
app.use('/api/english', require('./english-app/routes/media'));

// Game module (唔好望落嚟)
app.use('/api/game/teacher', require('./game-app/routes/teacher'));
app.use('/api/games', require('./game-hub-app/routes/hub'));

// Crystal Bastion tower-defense question economy
app.use('/api/tower-defense', require('./tower-defense-app/routes/questions'));

// Whiteboard — HTTP + Socket.io. Build httpServer/io now so the whiteboard
// module can register its /api/whiteboard/* routes BEFORE the catch-all
// /api 404 handler at the bottom of this file matches them first.
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);                     // same-origin / curl
      if (!config.isProd) return cb(null, true);              // dev: anything
      if (config.cors.origins.includes(origin)) return cb(null, true);
      cb(new Error(`Socket.IO CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: 10 * 1024 * 1024,
  // Fast disconnect detection: ping every 4s, declare dead after 6s of silence.
  // Matters when the teacher closes the tab without an explicit "end class"
  // click — default 20s pingTimeout left students stuck for too long.
  pingInterval: 4000,
  pingTimeout: 6000,
});
require('./whiteboard-app/server/socket')(io, app);
require('./game-app/server/socket')(io, app);   // namespace /game
require('./tower-defense-app/server/socket')(io, app); // namespace /tower-defense

// ----------------------------------------------------------------
// Health / debug
// ----------------------------------------------------------------
const healthHandler = (req, res) => {
  try {
    const summary = config.db.mode === 'json'
      ? { connected: true, type: 'json-local', userCount: db._load().users.length }
      : { connected: true, type: 'postgres' };
    res.json({
      status: 'ok',
      service: 'bui-o-learning-platform',
      version: APP_VERSION,
      environment: config.env,
      uptimeSeconds: Math.floor(process.uptime()),
      database: summary,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    res.status(500).json({
      status: 'error',
      service: 'bui-o-learning-platform',
      version: APP_VERSION,
      timestamp: new Date().toISOString(),
    });
  }
};

app.get(['/health', '/api/health'], healthHandler);

if (!config.isProd) {
  app.get('/api/db-status', (req, res) => {
    if (config.db.mode !== 'json') {
      return res.json({ mode: 'postgres', message: 'not exposed in postgres mode' });
    }
    const data = db._load();
    res.json({
      users: data.users.map(u => ({ StudentID: u.studentid, Name: u.name })),
      statsCount: data.studentStats.length,
      statsSample: data.studentStats.slice(0, 10),
      questionLogCount: data.questionLogs.length,
    });
  });
}

// Network IP for iPad QR codes
app.get('/api/network/ip', (req, res) => {
  const interfaces = os.networkInterfaces();
  let localIp = '127.0.0.1';
  for (const list of Object.values(interfaces)) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) { localIp = iface.address; break; }
    }
    if (localIp !== '127.0.0.1') break;
  }
  res.json({ ip: localIp, port: PORT });
});

// ----------------------------------------------------------------
// Static
// ----------------------------------------------------------------
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'exceljs', 'dist')));

app.use('/math-app/css', express.static(path.join(__dirname, 'math-app', 'public', 'css')));
app.use('/math-app/js', express.static(path.join(__dirname, 'math-app', 'public', 'js')));
app.use('/math-app/images', express.static(path.join(__dirname, 'math-app', 'public', 'images')));

// Chinese module static + page routes
app.use('/chinese/css', express.static(path.join(__dirname, 'chinese-app', 'public', 'css')));
app.use('/chinese/js', express.static(path.join(__dirname, 'chinese-app', 'public', 'js')));

function requireSession(req, res, next) {
  if (!req.session || !req.session.studentId) return res.redirect('/');
  next();
}
function requireTeacherPage(req, res, next) {
  if (!req.session || !req.session.studentId) return res.redirect('/');
  if (req.session.role !== 'teacher') return res.redirect('/chinese/student');
  next();
}
app.get('/chinese', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'chinese-app', 'public', 'index.html')));
app.get('/chinese/teacher', requireTeacherPage, (req, res) => res.sendFile(path.join(__dirname, 'chinese-app', 'public', 'teacher.html')));
app.get('/chinese/student', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'chinese-app', 'public', 'student.html')));
app.get('/chinese/practice', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'chinese-app', 'public', 'practice.html')));

// English module static + page routes
app.use('/english/css', express.static(path.join(__dirname, 'english-app', 'public', 'css')));
app.use('/english/js', express.static(path.join(__dirname, 'english-app', 'public', 'js')));

function requireTeacherPageEn(req, res, next) {
  if (!req.session || !req.session.studentId) return res.redirect('/');
  if (req.session.role !== 'teacher') return res.redirect('/english/student');
  next();
}
app.get('/english', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'english-app', 'public', 'index.html')));
app.get('/english/teacher', requireTeacherPageEn, (req, res) => res.sendFile(path.join(__dirname, 'english-app', 'public', 'teacher.html')));
app.get('/english/student', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'english-app', 'public', 'student.html')));
app.get('/english/practice', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'english-app', 'public', 'practice.html')));

// Game module static + page routes
app.use('/game/css', express.static(path.join(__dirname, 'game-app', 'public', 'css')));
app.use('/game/js', express.static(path.join(__dirname, 'game-app', 'public', 'js')));
app.use('/game/images', express.static(path.join(__dirname, 'game-app', 'public', 'images')));
app.use('/game/vendor/phaser', express.static(path.join(__dirname, 'node_modules', 'phaser', 'dist')));
app.get('/game/preview', (req, res, next) => {
  if (config.isProd) return next();
  res.sendFile(path.join(__dirname, 'game-app', 'public', 'play.html'));
});
app.get('/game', requireSession, (req, res) => {
  if (req.session.role === 'teacher') {
    return res.sendFile(path.join(__dirname, 'game-app', 'public', 'host.html'));
  }
  res.sendFile(path.join(__dirname, 'game-app', 'public', 'play.html'));
});
app.get('/game/host', requireSession, (req, res) => {
  if (req.session.role !== 'teacher') return res.redirect('/game');
  res.sendFile(path.join(__dirname, 'game-app', 'public', 'host.html'));
});
app.get('/game/host/preview', (req, res, next) => {
  if (config.isProd) return next();
  res.sendFile(path.join(__dirname, 'game-app', 'public', 'host.html'));
});

// Unified quiz-game lobby
app.use('/games/css', express.static(path.join(__dirname, 'game-hub-app', 'public', 'css')));
app.use('/games/js', express.static(path.join(__dirname, 'game-hub-app', 'public', 'js')));
app.get('/games/preview', (req, res, next) => {
  if (config.isProd) return next();
  res.sendFile(path.join(__dirname, 'game-hub-app', 'public', 'index.html'));
});
app.get('/games', requireSession, (_req, res) => {
  res.sendFile(path.join(__dirname, 'game-hub-app', 'public', 'index.html'));
});

// Tower defense module
app.use('/tower-defense/css', express.static(path.join(__dirname, 'tower-defense-app', 'public', 'css')));
app.use('/tower-defense/js', express.static(path.join(__dirname, 'tower-defense-app', 'public', 'js')));
app.use('/tower-defense/assets', express.static(path.join(__dirname, 'tower-defense-app', 'public', 'assets'), { maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0 }));
app.use('/tower-defense/vendor/phaser', express.static(path.join(__dirname, 'node_modules', 'phaser', 'dist')));
app.get('/tower-defense/preview', (req, res, next) => {
  if (config.isProd) return next();
  res.sendFile(path.join(__dirname, 'tower-defense-app', 'public', 'index.html'));
});
app.get('/tower-defense/teacher/preview', (req, res, next) => {
  if (config.isProd) return next();
  res.sendFile(path.join(__dirname, 'tower-defense-app', 'public', 'teacher.html'));
});
app.get('/tower-defense', requireSession, (req, res) => {
  if (req.session.role === 'teacher') {
    return res.sendFile(path.join(__dirname, 'tower-defense-app', 'public', 'teacher.html'));
  }
  res.sendFile(path.join(__dirname, 'tower-defense-app', 'public', 'index.html'));
});
app.get('/tower-defense/teacher', requireSession, (req, res) => {
  if (req.session.role !== 'teacher') return res.redirect('/tower-defense');
  res.sendFile(path.join(__dirname, 'tower-defense-app', 'public', 'teacher.html'));
});

app.get('/login.html',     (req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'login.html')));
app.get('/quiz.html',      (req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'quiz.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'dashboard.html')));
app.get('/tag-picker.html',(req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'tag-picker.html')));
app.get('/math',           (req, res) => {
  // Students land on the hub with the daily-random gate; teachers go
  // straight to the dashboard.
  if (req.session?.role === 'teacher') {
    return res.sendFile(path.join(__dirname, 'math-app', 'public', 'dashboard.html'));
  }
  res.sendFile(path.join(__dirname, 'math-app', 'public', 'hub.html'));
});

// Missing-homework module (teachers and appointed subject monitors only).
app.use('/homework/css', express.static(path.join(__dirname, 'homework-app', 'public', 'css')));
app.use('/homework/js', express.static(path.join(__dirname, 'homework-app', 'public', 'js')));
app.get('/homework', requireSession, async (req, res, next) => {
  try {
    if (req.session.role !== 'teacher') {
      const homework = require('./homework-app/repositories/homework.repo');
      const assignments = await homework.listMonitors({ studentId: req.session.studentId });
      if (!assignments.length) return res.status(403).send('你未獲委任為科長，無權進入欠交功課模組。');
    }
    res.sendFile(path.join(__dirname, 'homework-app', 'public', 'index.html'));
  } catch (error) { next(error); }
});

// Report (teacher only)
app.use('/report-app', express.static(path.join(__dirname, 'report-app')));
app.get('/report.html', (req, res) => {
  if (!req.session || !req.session.studentId) return res.redirect('/');
  if (req.session.role !== 'teacher') return res.redirect('/quiz.html');
  res.sendFile(path.join(__dirname, 'report-app', 'report.html'));
});

// Whiteboard SPA — only fall back to index.html for HTML navigation requests
const whiteboardDist = path.join(__dirname, 'whiteboard-app', 'client', 'dist');
app.use('/whiteboard', express.static(whiteboardDist));
app.use('/whiteboard', (req, res, next) => {
  if (req.method === 'GET' && req.accepts('html')) {
    return res.sendFile(path.join(whiteboardDist, 'index.html'));
  }
  next();
});

// Portal entry
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ----------------------------------------------------------------
// 404 + global error handler
// ----------------------------------------------------------------
app.use('/api', (req, res) => res.status(404).json({ success: false, message: 'Not found' }));

app.use((err, req, res, _next) => {
  console.error('[server]', err.stack || err.message || err);
  if (res.headersSent) return;
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ----------------------------------------------------------------
// Start server
// ----------------------------------------------------------------
// Warm Google TTS/STT clients so the first user-facing 朗讀 isn't a 5-10 s
// cold load of the @google-cloud/* libraries + REST client.
setImmediate(() => { try { require('./chinese-app/lib/google').warmup(); } catch {} });

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 =========================================');
  console.log(`🚀  杯澳個人化學習平台 (${config.env} • db=${config.db.mode})`);
  console.log(`🚀  http://127.0.0.1:${PORT}`);
  console.log('🚀  ├─ Portal:    /');
  console.log('🚀  ├─ 數學練習:  /quiz.html');
  console.log('🚀  ├─ 教師面板:  /dashboard.html');
  console.log('🚀  ├─ 考評報告:  /report.html  (老師限定)');
  console.log('🚀  ├─ 互動白板:  /whiteboard/');
  console.log('🚀  ├─ 粵語學習:  /chinese');
  console.log('🚀  ├─ 英文拼字:  /english');
  console.log('🚀  └─ API:       /api/*');
  console.log('🚀 =========================================');
  console.log('');
});

module.exports = app;
