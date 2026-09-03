/**
 * Adaptive Math Learning System - 主伺服器
 * 國小四則運算適性學習系統
 */

const express = require('express');
const session = require('cookie-session');
const cors = require('cors');
const path = require('path');
const os = require('os');

// 初始化資料庫（會自動建立資料表與預設帳號）
const db = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// 中介軟體 (Middleware)
// ========================================

// 解析 JSON 請求
app.use(express.json());

// 解析 URL-encoded 請求
app.use(express.urlencoded({ extended: true }));

// CORS 設定
app.use(cors({
    origin: true,
    credentials: true
}));

// Trust Proxy: Vercel 等雲端平台的代理伺服器必備，才能正確傳遞 HTTPS Cookie
app.set('trust proxy', 1);

// Session 設定
app.use(session({
    name: 'session',
    keys: ['adaptive-math-secret-key-2024'],
    maxAge: 24 * 60 * 60 * 1000, // 24 小時
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true
}));

// 靜態檔案服務
app.use(express.static(path.join(__dirname, 'public')));

// ========================================
// 路由 (Routes)
// ========================================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/quiz', require('./routes/quiz'));
app.use('/api/stats', require('./routes/stats'));

// ========================================
// 健康檢查端點
// ========================================
app.get('/api/health', async (req, res) => {
    try {
        // 驗證資料庫連線
        const { rows: userRows } = await db.query('SELECT COUNT(*) as count FROM Users');
        const userCount = parseInt(userRows[0].count) || 0;
        
        const { rows: tableInfo } = await db.query(`
            SELECT table_name as name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);

        res.json({
            status: 'ok',
            database: {
                connected: true,
                tables: tableInfo.map(t => t.name),
                userCount: userCount
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ========================================
// 資料庫狀態端點（開發用）
// ========================================
app.get('/api/db-status', async (req, res) => {
    try {
        const { rows: users } = await db.query('SELECT StudentID, Name FROM Users');
        const { rows: stats } = await db.query('SELECT * FROM StudentStats');
        const { rows: logRows } = await db.query('SELECT COUNT(*) as count FROM QuestionLogs');
        const logCount = parseInt(logRows[0].count) || 0;

        res.json({
            users: users.map(u => ({ StudentID: u.studentid, Name: u.name })),
            statsCount: stats.length,
            statsSample: stats.slice(0, 10),
            questionLogCount: logCount
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========================================
// 讀取內網 IP，以便產生給 iPad 掃描用的 QR code
// ========================================
app.get('/api/network/ip', (req, res) => {
    const interfaces = os.networkInterfaces();
    let localIp = '127.0.0.1';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            // Find an IPv4 address that is not internal
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
// 啟動伺服器
// ========================================
app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('🚀 ===========================================');
    console.log(`🚀  適性學習系統伺服器已啟動！`);
    console.log(`🚀  http://0.0.0.0:${PORT}`);
    console.log('🚀 ===========================================');
    console.log('');
});

module.exports = app;
