/**
 * 杯澳個人化學習平台 — 統一伺服器
 * 整合 Portal + Math App + Whiteboard App
 * 
 * 所有功能運行在同一個 Port，共享 Session Cookie。
 */

'use strict';

// 設定 DATABASE_URL 使 Math App 路由中的 if (process.env.DATABASE_URL) 能正常執行
process.env.DATABASE_URL = 'json-local';

const express = require('express');
const session = require('cookie-session');
const cors = require('cors');
const path = require('path');
const os = require('os');
const { createServer } = require('http');
const { Server } = require('socket.io');

// 初始化 JSON 資料庫
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// 中介軟體
// ========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));
app.set('trust proxy', 1);

app.use(session({
  name: 'session',
  keys: ['bui-o-learning-platform-2026'],
  maxAge: 24 * 60 * 60 * 1000,
  secure: false,
  httpOnly: true,
}));

// ========================================
// API 路由 (Math App)
// ========================================
app.use('/api/auth', require('./math-app/routes/auth'));
app.use('/api/quiz', require('./math-app/routes/quiz'));
app.use('/api/stats', require('./math-app/routes/stats'));

// ========================================
// 健康檢查
// ========================================
app.get('/api/health', async (req, res) => {
  try {
    const data = db._load();
    res.json({
      status: 'ok',
      database: {
        connected: true,
        type: 'json-local',
        tables: ['users', 'studentstats', 'questionlogs'],
        userCount: data.users.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// ========================================
// 資料庫狀態（開發用）
// ========================================
app.get('/api/db-status', async (req, res) => {
  try {
    const data = db._load();
    res.json({
      users: data.users.map(u => ({ StudentID: u.studentid, Name: u.name })),
      statsCount: data.studentStats.length,
      statsSample: data.studentStats.slice(0, 10),
      questionLogCount: data.questionLogs.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// 網路 IP (iPad QR Code 用)
// ========================================
app.get('/api/network/ip', (req, res) => {
  const interfaces = os.networkInterfaces();
  let localIp = '127.0.0.1';
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        localIp = iface.address;
        break;
      }
    }
    if (localIp !== '127.0.0.1') break;
  }
  res.json({ ip: localIp, port: PORT });
});

// ========================================
// 靜態檔案路由
// ========================================

// Portal 前端 (src/main.js, src/styles.css)
app.use('/src', express.static(path.join(__dirname, 'src')));

// Math App 靜態資源 (css, js, images, HTML pages)
app.use('/math-app/css', express.static(path.join(__dirname, 'math-app', 'public', 'css')));
app.use('/math-app/js', express.static(path.join(__dirname, 'math-app', 'public', 'js')));
app.use('/math-app/images', express.static(path.join(__dirname, 'math-app', 'public', 'images')));

// Math App HTML 頁面
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'login.html')));
app.get('/quiz.html', (req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'quiz.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'dashboard.html')));

// Math App 首頁 (QR Code 頁) — 掛在 /math
app.get('/math', (req, res) => res.sendFile(path.join(__dirname, 'math-app', 'public', 'index.html')));

// ========================================
// 考評報告模組（僅限老師）
// ========================================

// 靜態資源（CSS、JS 等）
app.use('/report-app', express.static(path.join(__dirname, 'report-app')));

// 老師專屬頁面保護
app.get('/report.html', (req, res) => {
  // 未登入
  if (!req.session || !req.session.studentId) {
    return res.redirect('/');
  }
  // 非老師
  if (req.session.role !== 'teacher') {
    return res.redirect('/quiz.html');
  }
  // 老師 → 提供頁面
  res.sendFile(path.join(__dirname, 'report-app', 'report.html'));
});

// Whiteboard 前端 (已編譯的 React 靜態檔案)
const whiteboardDist = path.join(__dirname, 'whiteboard-app', 'client', 'dist');
app.use('/whiteboard', express.static(whiteboardDist));
// SPA fallback for whiteboard routes (/whiteboard/teacher, /whiteboard/student, etc.)
app.use('/whiteboard', (req, res) => res.sendFile(path.join(whiteboardDist, 'index.html')));

// Portal 首頁
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// ========================================
// 建立 HTTP + Socket.io 伺服器
// ========================================
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize: 10 * 1024 * 1024, // 10 MB for whiteboard images
});

// ========================================
// Whiteboard Socket.io 事件處理
// ========================================
require('./whiteboard-app/server/socket')(io, app);

// ========================================
// 啟動伺服器
// ========================================
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 =========================================');
  console.log(`🚀  杯澳個人化學習平台 已啟動！`);
  console.log(`🚀  http://127.0.0.1:${PORT}`);
  console.log('🚀  ├─ Portal:    /');
  console.log('🚀  ├─ 數學練習:  /quiz.html');
  console.log('🚀  ├─ 教師面板:  /dashboard.html');
  console.log('🚀  ├─ 考評報告:  /report.html  (老師限定)');
  console.log('🚀  ├─ 互動白板:  /whiteboard/');
  console.log('🚀  └─ API:       /api/*');
  console.log('🚀 =========================================');
  console.log('');
});

module.exports = app;
