'use strict';

const express = require('express');
const session = require('cookie-session');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createServer } = require('http');
const { Server } = require('socket.io');
const compression = require('compression');
const { version: APP_VERSION } = require('./package.json');

const config = require('./config');
const serverI18n = require('./shared/server-i18n');
const db = require('./db');                  // JSON seed-on-boot side effect (json mode only)
const { queryWithRetry } = require('./math-app/db/database');

const app = express();
const PORT = config.port;

// ----------------------------------------------------------------
// Middleware
// ----------------------------------------------------------------
// Nothing was compressed on the way out. The game's own scripts are 979KB of text — 740KB of it
// one generated geometry table — and a class of twelve fetching that is nine megabytes of
// bandwidth for what gzip turns into 125KB. Already-compressed types (webp, audio) are skipped by
// the middleware's own list, so the images are left alone.
app.use(compression());
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

// Give every request a safe correlation id and record API latency. Request bodies,
// query strings and cookies are intentionally excluded because they may contain
// student identifiers or credentials. Slow login requests are always logged; other
// API requests are logged when slow or unsuccessful.
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  const started = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader('X-Request-ID', requestId);

  const isApiRequest = req.path.startsWith('/api/');
  const isLoginRequest = req.path === '/api/auth/login';
  const safePath = isLoginRequest
    ? req.path
    : req.path.split('/').slice(0, 4).join('/') || '/';
  req.logPath = safePath;

  res.on('finish', () => {
    if (!isApiRequest) return;
    const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    if (isLoginRequest || res.statusCode >= 500 || durationMs >= 1000) {
      console.log('[request]', JSON.stringify({
        requestId,
        method: req.method,
        path: safePath,
        status: res.statusCode,
        durationMs,
      }));
    }
  });

  res.on('close', () => {
    if (!isApiRequest || res.writableEnded) return;
    const durationMs = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    console.warn('[request]', JSON.stringify({
      event: 'aborted',
      requestId,
      method: req.method,
      path: safePath,
      durationMs,
    }));
  });

  next();
});

// Every route below answers in Chinese. When the reader has chosen English,
// swap the known message strings on the way out rather than at each call site.
app.use(require('./shared/server-i18n').middleware);

// ----------------------------------------------------------------
// API routes (math app)
// ----------------------------------------------------------------
app.use('/api/auth', require('./math-app/routes/auth'));
app.use('/api/quiz', require('./math-app/routes/quiz'));
app.use('/api/stats', require('./math-app/routes/stats'));

// Multiplication table check list (teacher-only)
app.use('/api/multiplication-checklist', require('./multiplication-app/routes/checklist'));

// Missing-homework module
app.use('/api/homework', require('./homework-app/routes/homework'));

// Assessment report data (teacher-only, server-persisted Excel imports)
app.use('/api/report', require('./report-app/routes/assessment'));

// Chinese module
app.use('/api/chinese/teacher', require('./chinese-app/routes/teacher'));
app.use('/api/chinese/student', require('./chinese-app/routes/student'));
app.use('/api/chinese', require('./chinese-app/routes/media'));

// English module
app.use('/api/english/teacher', require('./english-app/routes/teacher'));
app.use('/api/english/student', require('./english-app/routes/student'));
app.use('/api/english', require('./english-app/routes/media'));

// Phonics Express (built-in curriculum, Google Cloud British/American English TTS)
app.use('/api/phonics', require('./phonics-app/routes/phonics'));

// Game module (唔好望落嚟)
app.use('/api/game/teacher', require('./game-app/routes/teacher'));
app.use('/api/games', require('./game-hub-app/routes/hub'));

// Crystal Bastion tower-defense question economy
app.use('/api/tower-defense', require('./tower-defense-app/routes/questions'));

// Persistent pet raising, room decoration and teacher-issued currency
app.use('/api/pet', require('./pet-app/routes/pet'));

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
  // Socket.IO leaves this off by default, for servers holding thousands of connections where the
  // per-connection compression context would cost real memory. A classroom holds twenty-five, and
  // what they are sent is the same handful of JSON keys repeated once per climber, thirty times a
  // second — which is exactly what deflate is good at: about 80% off a single frame, and 91% off a
  // stream of them, since the context carries over between frames. The threshold leaves the small
  // control messages alone, where the header would cost more than the saving.
  perMessageDeflate: { threshold: 512 },
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
const healthHandler = async (req, res) => {
  const started = process.hrtime.bigint();
  try {
    let summary;
    if (config.db.mode === 'json') {
      summary = { connected: true, type: 'json-local', userCount: db._load().users.length };
    } else {
      const result = await queryWithRetry('SELECT 1 AS ok', [], { label: 'health' });
      summary = {
        connected: result.rows?.[0]?.ok === 1 || result.rows?.[0]?.ok === '1',
        type: 'postgres',
        latencyMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      };
      if (!summary.connected) throw new Error('Database health query returned an unexpected result');
    }
    res.json({
      status: 'ok',
      service: 'bui-o-learning-platform',
      version: APP_VERSION,
      environment: config.env,
      uptimeSeconds: Math.floor(process.uptime()),
      database: summary,
      requestId: req.requestId,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[health]', JSON.stringify({
      requestId: req.requestId,
      durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      code: e?.code || null,
      retryable: Boolean(e?.retryable),
      message: String(e?.message || e).split('\n')[0].slice(0, 240),
    }));
    res.status(e?.retryable ? 503 : 500).json({
      status: 'error',
      service: 'bui-o-learning-platform',
      version: APP_VERSION,
      database: { connected: false, type: config.db.mode === 'postgres' ? 'postgres' : 'json-local' },
      requestId: req.requestId,
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
// ---------------------------------------------------------------- static cache ---
// Only four of the twenty-six static mounts set any cache policy, so nearly every CSS file,
// script, image and BOTH copies of Phaser (1.3MB each, for /game and /tower-defense) were
// served with max-age=0 and revalidated on every page load. With a class opening a game at
// once on a small instance, that is the difference between one download and thirty.
//
// VENDOR  libraries pinned by package.json — the file only changes when the dependency does
// MEDIA   images, sprites and audio — replaced by editing the file, rarely and deliberately
// APP     our own css/js — already cache-busted with ?v= in markup, but kept short so a
//         forgotten version bump cannot strand a class on stale code for a month
const CACHE_VENDOR = { maxAge: '30d', immutable: true };
const CACHE_MEDIA  = { maxAge: '30d' };
const CACHE_APP    = { maxAge: '1h' };

// One i18n runtime and one dictionary per module, shared by every page on the
// platform so the hub's language switch reaches all of them.
app.use('/shared', express.static(path.join(__dirname, 'shared'), CACHE_APP));
app.use('/src', express.static(path.join(__dirname, 'src'), CACHE_APP));
app.use('/vendor', express.static(path.join(__dirname, 'node_modules', 'exceljs', 'dist'), CACHE_VENDOR));

app.use('/math-app/css', express.static(path.join(__dirname, 'math-app', 'public', 'css'), CACHE_APP));
app.use('/math-app/js', express.static(path.join(__dirname, 'math-app', 'public', 'js'), CACHE_APP));
app.use('/math-app/images', express.static(path.join(__dirname, 'math-app', 'public', 'images'), CACHE_MEDIA));

// Multiplication table check list static assets
app.use('/multiplication-checklist/css', express.static(path.join(__dirname, 'multiplication-app', 'public', 'css'), CACHE_APP));
app.use('/multiplication-checklist/js', express.static(path.join(__dirname, 'multiplication-app', 'public', 'js'), CACHE_APP));

// Chinese module static + page routes
app.use('/chinese/css', express.static(path.join(__dirname, 'chinese-app', 'public', 'css'), CACHE_APP));
app.use('/chinese/js', express.static(path.join(__dirname, 'chinese-app', 'public', 'js'), CACHE_APP));

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
app.use('/english/css', express.static(path.join(__dirname, 'english-app', 'public', 'css'), CACHE_APP));
app.use('/english/js', express.static(path.join(__dirname, 'english-app', 'public', 'js'), CACHE_APP));

function requireTeacherPageEn(req, res, next) {
  if (!req.session || !req.session.studentId) return res.redirect('/');
  if (req.session.role !== 'teacher') return res.redirect('/english/student');
  next();
}
app.get('/english', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'english-app', 'public', 'index.html')));
app.get('/english/teacher', requireTeacherPageEn, (req, res) => res.sendFile(path.join(__dirname, 'english-app', 'public', 'teacher.html')));
app.get('/english/student', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'english-app', 'public', 'student.html')));
app.get('/english/practice', requireSession, (req, res) => res.sendFile(path.join(__dirname, 'english-app', 'public', 'practice.html')));

// Phonics Express static assets + role-aware pages
app.use('/phonics/css', express.static(path.join(__dirname, 'phonics-app', 'public', 'css'), CACHE_APP));
app.use('/phonics/js', express.static(path.join(__dirname, 'phonics-app', 'public', 'js'), CACHE_APP));
app.get('/phonics', requireSession, (req, res) => {
  const page = req.session.role === 'teacher' ? 'teacher.html' : 'index.html';
  res.sendFile(path.join(__dirname, 'phonics-app', 'public', page));
});
app.get('/phonics/student', requireSession, (_req, res) => {
  res.sendFile(path.join(__dirname, 'phonics-app', 'public', 'index.html'));
});
app.get('/phonics/teacher', requireSession, (req, res) => {
  if (req.session.role !== 'teacher') return res.redirect('/phonics');
  res.sendFile(path.join(__dirname, 'phonics-app', 'public', 'teacher.html'));
});

// Game module static + page routes
app.use('/game/css', express.static(path.join(__dirname, 'game-app', 'public', 'css'), CACHE_APP));
app.use('/game/js', express.static(path.join(__dirname, 'game-app', 'public', 'js'), CACHE_APP));
app.use('/game/images', express.static(path.join(__dirname, 'game-app', 'public', 'images'), CACHE_MEDIA));
app.use('/game/vendor/phaser', express.static(path.join(__dirname, 'node_modules', 'phaser', 'dist'), CACHE_VENDOR));
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
app.use('/games/css', express.static(path.join(__dirname, 'game-hub-app', 'public', 'css'), CACHE_APP));
app.use('/games/js', express.static(path.join(__dirname, 'game-hub-app', 'public', 'js'), CACHE_APP));
app.get('/games/preview', (req, res, next) => {
  if (config.isProd) return next();
  res.sendFile(path.join(__dirname, 'game-hub-app', 'public', 'index.html'));
});
app.get('/games', requireSession, (_req, res) => {
  res.sendFile(path.join(__dirname, 'game-hub-app', 'public', 'index.html'));
});

// Tower defense module
app.use('/tower-defense/css', express.static(path.join(__dirname, 'tower-defense-app', 'public', 'css'), CACHE_APP));
app.use('/tower-defense/js', express.static(path.join(__dirname, 'tower-defense-app', 'public', 'js'), CACHE_APP));
app.use('/tower-defense/assets', express.static(path.join(__dirname, 'tower-defense-app', 'public', 'assets'), { maxAge: process.env.NODE_ENV === 'production' ? '30d' : 0 }));
app.use('/tower-defense/vendor/phaser', express.static(path.join(__dirname, 'node_modules', 'phaser', 'dist'), CACHE_VENDOR));
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

// Pet Paradise: hashed build assets are public; the application document is
// protected by the platform session and switches UI according to the role.
const petDist = path.join(__dirname, 'pet-app', 'dist');
const setPetHeaders = (res, { document = false } = {}) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (document) {
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; media-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
  }
};
app.use('/pet/assets', (req, res, next) => {
  const isHashedBuildFile = /-[A-Za-z0-9_-]{8,}\.(?:js|css|webp)$/i.test(req.path);
  if (!isHashedBuildFile) return res.status(404).end();
  next();
}, express.static(path.join(petDist, 'assets'), {
  maxAge: config.isProd ? '1y' : 0,
  immutable: config.isProd,
  setHeaders: (res) => setPetHeaders(res),
}));
app.get('/pet/preview', async (req, res, next) => {
  if (config.isProd) return next();
  if (!req.session?.studentId) {
    req.session.studentId = 'S001';
    req.session.studentName = '預覽學生';
    req.session.role = 'student';
  }
  try {
    const petRepo = require('./pet-app/repositories/pet.repo');
    await petRepo.grantUnlimitedMoney(req.session.studentId, 999999);
  } catch (err) {
    // Ignore error if schema not initialized
  }
  setPetHeaders(res, { document: true });
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(petDist, 'index.html'));
});
app.get(['/pet', '/pet/'], requireSession, (_req, res) => {
  setPetHeaders(res, { document: true });
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(petDist, 'index.html'));
});

// Wonder Lab: only versioned build assets are public. The HTML entry remains
// behind the existing login session so /science-lab/index.html cannot bypass it.
const scienceLabDist = path.join(__dirname, 'science-lab-app', 'dist');
const setScienceLabHeaders = (res, { document = false } = {}) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (document) {
    // Rapier compiles its bundled WebAssembly module locally. The narrowly
    // scoped wasm token permits that without enabling JavaScript eval.
    res.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; media-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'self'");
  }
};
app.use('/science-lab/assets', express.static(path.join(scienceLabDist, 'assets'), {
  maxAge: config.isProd ? '1y' : 0,
  immutable: config.isProd,
  setHeaders: (res) => setScienceLabHeaders(res),
}));
// The catalogue of clips is published so the student page never has to probe
// for a file that has not been supplied yet.
const scienceLabMedia = path.join(__dirname, 'science-lab-app', 'public', 'media');
app.get('/science-lab/media/index.json', (_req, res) => {
  setScienceLabHeaders(res);
  res.set('Cache-Control', 'no-store');
  let clips = [];
  try {
    clips = fs.readdirSync(scienceLabMedia).filter((name) => /\.(mp4|webm)$/i.test(name));
  } catch { clips = []; }
  res.json({ clips });
});
// Observation clips are served straight from source, not through the bundler:
// they are large, they change independently of the code, and keeping them out
// of dist means a rebuild never re-commits a binary.
app.use('/science-lab/media', express.static(scienceLabMedia, {
  maxAge: config.isProd ? '30d' : 0,
  setHeaders: (res) => setScienceLabHeaders(res),
}));
app.get('/science-lab/preview', (req, res, next) => {
  if (config.isProd) return next();
  setScienceLabHeaders(res, { document: true });
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(scienceLabDist, 'index.html'));
});
app.get(['/science-lab', '/science-lab/'], requireSession, (_req, res) => {
  setScienceLabHeaders(res, { document: true });
  res.set('Cache-Control', 'no-store');
  res.sendFile(path.join(scienceLabDist, 'index.html'));
});

app.get('/login.html',     (req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'login.html')));
app.get('/quiz.html',      (req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'quiz.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'dashboard.html')));
app.get('/teacher-topics.html', (req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'teacher-topics.html')));
app.get('/tag-picker.html',(req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'tag-picker.html')));
app.get('/math',           (req, res) => {
  // Students land on the hub with the daily-random gate; teachers go
  // straight to the dashboard.
  if (req.session?.role === 'teacher') {
    return res.sendFile(path.join(__dirname, 'math-app', 'public', 'dashboard.html'));
  }
  res.sendFile(path.join(__dirname, 'math-app', 'public', 'hub.html'));
});

// Multiplication table check list — teachers only.
app.get('/multiplication-checklist', requireSession, (req, res) => {
  if (req.session.role !== 'teacher') return res.redirect('/');
  res.sendFile(path.join(__dirname, 'multiplication-app', 'public', 'index.html'));
});

// Missing-homework module (teachers and appointed subject monitors only).
app.use('/homework/css', express.static(path.join(__dirname, 'homework-app', 'public', 'css'), CACHE_APP));
app.use('/homework/js', express.static(path.join(__dirname, 'homework-app', 'public', 'js'), CACHE_APP));
app.get('/homework', requireSession, async (req, res, next) => {
  try {
    if (req.session.role !== 'teacher') {
      const homework = require('./homework-app/repositories/homework.repo');
      const academicYears = require('./math-app/repositories/academic-years.repo');
      const academicYear = await academicYears.getCurrentAcademicYear();
      const assignments = await homework.listMonitors({ studentId: req.session.studentId, academicYear });
      if (!assignments.length) {
        const message = '你未獲委任為科長，無權進入欠交功課模組。';
        return res.status(403).send(serverI18n.resolveLang(req) === 'en-US' ? serverI18n.translate(message) : message);
      }
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
  const retryable = Boolean(err?.retryable);
  const status = retryable ? 503 : (Number.isInteger(err?.statusCode) ? err.statusCode : 500);
  console.error('[server]', JSON.stringify({
    requestId: req.requestId || null,
    method: req.method,
    path: req.logPath || req.path.split('/').slice(0, 4).join('/') || '/',
    status,
    retryable,
    code: err?.code || null,
    message: String(err?.message || err).split('\n')[0].slice(0, 240),
  }));
  if (err?.stack) console.error(err.stack);
  if (res.headersSent) return;
  res.status(status).json({
    success: false,
    message: retryable ? '服務暫時繁忙，請稍後再試' : 'Internal server error',
    requestId: req.requestId || null,
  });
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
  console.log('🚀  ├─ 音素列車:  /phonics');
  console.log('🚀  └─ API:       /api/*');
  console.log('🚀 =========================================');
  console.log('');
});

module.exports = app;
