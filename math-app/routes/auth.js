/**
 * 認證路由 (Auth Routes)
 * 
 * POST /api/auth/login   - 學生登入
 * POST /api/auth/logout  - 學生登出
 * GET  /api/auth/me      - 取得目前登入的學生資訊
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../db/database');

/**
 * POST /api/auth/login
 * Body: { studentId, password }
 */
router.post('/login', async (req, res) => {
    try {
        const { studentId, password } = req.body;

        // 驗證輸入
        if (!studentId || !password) {
            return res.status(400).json({
                success: false,
                message: '請輸入學號和密碼'
            });
        }

        // 查詢學生
        const { rows } = await db.query('SELECT * FROM Users WHERE StudentID = $1', [studentId]);
        const user = rows.length > 0 ? rows[0] : null;

        if (!user) {
            return res.status(401).json({
                success: false,
                message: '學號不存在'
            });
        }

        // 驗證密碼
        const isMatch = bcrypt.compareSync(password, user.passwordhash);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: '密碼錯誤'
            });
        }

        // 設定 session
        req.session.studentId = user.studentid;
        req.session.studentName = user.name;
        req.session.role = user.role || 'student';

        res.json({
            success: true,
            message: '登入成功',
            student: {
                id: user.studentid,
                name: user.name,
                role: req.session.role
            }
        });

    } catch (error) {
        console.error('登入錯誤:', error);
        res.status(500).json({
            success: false,
            message: '伺服器錯誤'
        });
    }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (req, res) => {
    req.session = null;
    res.json({
        success: true,
        message: '已登出'
    });
});

/**
 * GET /api/auth/me
 * 取得目前登入的學生資訊
 */
router.get('/me', async (req, res) => {
    // [Local Testing Mock] 如果沒有資料庫，強制提供一個測試帳號
    if (!process.env.DATABASE_URL && !req.session.studentId) {
        req.session.studentId = 'S001';
        req.session.studentName = '測試學生';
        req.session.role = 'student';
    }

    if (!req.session.studentId) {
        return res.status(401).json({
            success: false,
            message: '未登入'
        });
    }

    try {
        // 從資料庫取得最新名稱與角色狀態，避免 Cookie 暫存舊名字
        const { rows } = await db.query('SELECT Name, Role FROM Users WHERE StudentID = $1', [req.session.studentId]);
        
        let currentName = req.session.studentName;
        let currentRole = req.session.role || 'student';

        if (rows.length > 0) {
            currentName = rows[0].name;
            currentRole = rows[0].role;
            
            // 順便更新 Session
            req.session.studentName = currentName;
            req.session.role = currentRole;
        }

        res.json({
            success: true,
            student: {
                id: req.session.studentId,
                name: currentName,
                role: currentRole
            }
        });
    } catch (e) {
        console.error('取得使用者狀態錯誤:', e);
        // 若發生錯誤，退回使用 Session 緩存
        res.json({
            success: true,
            student: {
                id: req.session.studentId,
                name: req.session.studentName,
                role: req.session.role || 'student'
            }
        });
    }
});

/**
 * POST /api/auth/register-student
 * 教師專用：新增學生
 * Body: { studentId, name, password }
 */
router.post('/register-student', async (req, res) => {
    try {
        // 權限驗證
        if (req.session.role !== 'teacher') {
            return res.status(403).json({ success: false, message: '權限不足，僅限教師操作' });
        }

        const { studentId, name, password, role, className, chineseGroup, englishGroup, mathGroup } = req.body;
        const targetRole = role === 'teacher' ? 'teacher' : 'student';

        if (!studentId || !name || !password) {
            return res.status(400).json({ success: false, message: '請填寫完整資訊 (學號/教師編號、姓名、密碼)' });
        }

        // 檢查學號是否已存在
        const { rows: existing } = await db.query('SELECT StudentID FROM Users WHERE StudentID = $1', [studentId]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: '此帳號已經存在' });
        }

        // 加密密碼與寫入
        const hash = bcrypt.hashSync(password, 10);
        await db.query(`
            INSERT INTO Users (StudentID, Name, PasswordHash, Role, ClassName, ChineseGroup, EnglishGroup, MathGroup)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [studentId, name, hash, targetRole, className || '', chineseGroup || '', englishGroup || '', mathGroup || '']);

        // 若為學生，初始化學生統計
        if (targetRole === 'student') {
            const allTags = [
                'add_2d_nc', 'add_2d_c', 'sub_2d_b', 'sub_3d_z_mid',
                'mul_2x2_nc_nc', 'mul_2x2_c_c', 'div_3d_1d_z0_mid', 'div_3d_1d_z0_end',
                'add_3d_c', 'sub_3d_b', 'mul_3x2_nc', 'mul_3x2_c', 'div_2d_1d_z0', 'div_4d_1d_z0'
            ];
            
            for (const tag of allTags) {
                await db.query(`
                    INSERT INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate)
                    VALUES ($1, $2, 0, 0, 0.0)
                    ON CONFLICT (StudentID, Tag) DO NOTHING
                `, [studentId, tag]);
            }
        }

        res.json({ success: true, message: '帳號建立成功' });

    } catch (error) {
        console.error('新增學生錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

/**
 * DELETE /api/auth/delete-student/:studentId
 * 教師專用：刪除學生
 */
router.delete('/delete-student/:studentId', async (req, res) => {
    try {
        // 權限驗證
        if (req.session.role !== 'teacher') {
            return res.status(403).json({ success: false, message: '權限不足，僅限教師操作' });
        }

        const { studentId } = req.params;
        if (!studentId) {
            return res.status(400).json({ success: false, message: '無效的學生 ID' });
        }

        // 安全檢查：不允許刪除老師帳號
        const { rows: userCheck } = await db.query("SELECT Role FROM Users WHERE StudentID = $1", [studentId]);
        if (userCheck.length === 0) {
            return res.status(404).json({ success: false, message: '找不到該學生帳號' });
        }
        if (userCheck[0].role === 'teacher') {
            return res.status(403).json({ success: false, message: '無法刪除教師帳號' });
        }

        // 依序刪除 (FK 依賴：先刪除 Logs 與 Stats，再刪除 User)
        await db.query("DELETE FROM QuestionLogs WHERE StudentID = $1", [studentId]);
        await db.query("DELETE FROM StudentStats WHERE StudentID = $1", [studentId]);
        await db.query("DELETE FROM Users WHERE StudentID = $1", [studentId]);

        res.json({ success: true, message: '學生已成功刪除' });

    } catch (error) {
        console.error('刪除學生錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

/**
 * POST /api/auth/update-student
 * 教師專用：更新學生資料 (班級、分組)
 */
router.post('/update-student', async (req, res) => {
    try {
        if (req.session.role !== 'teacher') {
            return res.status(403).json({ success: false, message: '權限不足' });
        }

        const { studentId, field, value } = req.body;
        if (!studentId || !field) {
            return res.status(400).json({ success: false, message: '參數不完整' });
        }

        const allowedFields = {
            className: 'ClassName',
            chineseGroup: 'ChineseGroup',
            englishGroup: 'EnglishGroup',
            mathGroup: 'MathGroup'
        };

        const dbField = allowedFields[field];
        if (!dbField) {
            return res.status(400).json({ success: false, message: '不允許更新此欄位' });
        }

        await db.query(`UPDATE Users SET ${dbField} = $1 WHERE StudentID = $2`, [value || '', studentId]);
        res.json({ success: true, message: '更新成功' });

    } catch (error) {
        console.error('更新學生錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

/**
 * POST /api/auth/upgrade-students
 * 教師專用：一鍵升級所有學生班級
 */
router.post('/upgrade-students', async (req, res) => {
    try {
        if (req.session.role !== 'teacher') {
            return res.status(403).json({ success: false, message: '權限不足' });
        }

        await db.query(`
            UPDATE Users
            SET ClassName = 
              CASE 
                WHEN ClassName LIKE 'P6%' THEN 'Graduated'
                WHEN ClassName LIKE 'P5%' THEN REPLACE(ClassName, 'P5', 'P6')
                WHEN ClassName LIKE 'P4%' THEN REPLACE(ClassName, 'P4', 'P5')
                WHEN ClassName LIKE 'P3%' THEN REPLACE(ClassName, 'P3', 'P4')
                WHEN ClassName LIKE 'P2%' THEN REPLACE(ClassName, 'P2', 'P3')
                WHEN ClassName LIKE 'P1%' THEN REPLACE(ClassName, 'P1', 'P2')
                ELSE ClassName
              END
            WHERE Role = 'student' AND ClassName IS NOT NULL AND ClassName != ''
        `);

        res.json({ success: true, message: '學生班級已成功升級' });

    } catch (error) {
        console.error('升級學生錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

module.exports = router;

