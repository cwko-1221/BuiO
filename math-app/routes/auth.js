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

        const normalizedStudentId = String(studentId).trim().toUpperCase();

        // 查詢學生
        const { rows } = await db.query('SELECT * FROM Users WHERE StudentID = $1', [normalizedStudentId]);
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
                role: req.session.role,
                className: user.classname || '',
                classNo: user.classno || null,
                language: user.language || 'zh-HK'
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
        // 從資料庫取得最新名稱、角色、班級與語言
        const { rows } = await db.query('SELECT Name, Role, ClassName, ClassNo, Language FROM Users WHERE StudentID = $1', [req.session.studentId]);
        
        let currentName = req.session.studentName;
        let currentRole = req.session.role || 'student';
        let currentClassName = '';
        let currentClassNo = null;
        let currentLanguage = 'zh-HK';

        if (rows.length > 0) {
            currentName = rows[0].name;
            currentRole = rows[0].role;
            currentClassName = rows[0].classname || '';
            currentClassNo = rows[0].classno || null;
            currentLanguage = rows[0].language || 'zh-HK';
            
            // 順便更新 Session
            req.session.studentName = currentName;
            req.session.role = currentRole;
        }

        res.json({
            success: true,
            student: {
                id: req.session.studentId,
                name: currentName,
                role: currentRole,
                className: currentClassName,
                classNo: currentClassNo,
                language: currentLanguage
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
 * PUT /api/auth/language
 * 更新目前使用者的語言偏好
 */
router.put('/language', async (req, res) => {
    if (!req.session.studentId) {
        return res.status(401).json({ success: false, message: '未登入' });
    }
    
    const { language } = req.body;
    if (!['zh-HK', 'en-US'].includes(language)) {
        return res.status(400).json({ success: false, message: '不支援的語言' });
    }

    try {
        await db.query('UPDATE Users SET Language = $1 WHERE StudentID = $2', [language, req.session.studentId]);
        res.json({ success: true, message: '語言設定已更新', language });
    } catch (error) {
        console.error('更新語言失敗:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

/**
 * POST /api/auth/register-student
 * 教師專用：新增學生
 * Body: { studentId, name, password }
 */
router.post('/register-student', async (req, res) => {
    try {
        // 權限驗證：是老師或提供安全 Admin 密碼
        const isTeacher = req.session.role === 'teacher';
        const isAdmin = req.body.adminPassword === 'Admin';
        if (!isTeacher && !isAdmin) {
            return res.status(403).json({ success: false, message: '權限不足，僅限教師操作' });
        }

        const { studentId, name, password, role, className, classNo, chineseGroup, englishGroup, mathGroup } = req.body;
        const targetRole = role === 'teacher' ? 'teacher' : 'student';

        if (!studentId || !name || !password) {
            return res.status(400).json({ success: false, message: '請填寫完整資訊 (學號/教師編號、姓名、密碼)' });
        }

        const normalizedStudentId = String(studentId).trim().toUpperCase();

        // 檢查學號是否已存在
        const { rows: existing } = await db.query('SELECT StudentID FROM Users WHERE StudentID = $1', [normalizedStudentId]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: '此帳號已經存在' });
        }

        // 加密密碼與寫入
        const hash = bcrypt.hashSync(password, 10);
        const normalizedClassNo = classNo === '' || classNo == null ? null : Number(classNo);
        if (normalizedClassNo !== null && (!Number.isInteger(normalizedClassNo) || normalizedClassNo < 1 || normalizedClassNo > 99)) {
            return res.status(400).json({ success: false, message: '班號必須是 1 至 99 的整數' });
        }

        await db.query(`
            INSERT INTO Users (StudentID, Name, PasswordHash, Role, ClassName, ClassNo, ChineseGroup, EnglishGroup, MathGroup)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [normalizedStudentId, name, hash, targetRole, className || '', normalizedClassNo, chineseGroup || '', englishGroup || '', mathGroup || '']);

        // 若為學生，初始化學生統計
        if (targetRole === 'student') {
            const { ALL_TAGS } = require('../engine/questionGenerator');
            
            for (const tag of ALL_TAGS) {
                await db.query(`
                    INSERT INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate)
                    VALUES ($1, $2, 0, 0, 0.0)
                    ON CONFLICT (StudentID, Tag) DO NOTHING
                `, [normalizedStudentId, tag]);
            }
        }

        res.json({ success: true, message: '帳號建立成功' });

    } catch (error) {
        console.error('新增學生錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

/**
 * POST /api/auth/register-students-batch
 * 教師專用：批量新增學生
 * Body: { students: [{ studentId, name, password, className, classNo, chineseGroup, englishGroup, mathGroup }] }
 */
router.post('/register-students-batch', async (req, res) => {
    let client;
    try {
        if (req.session.role !== 'teacher') {
            return res.status(403).json({ success: false, message: '權限不足，僅限教師操作' });
        }

        const { students } = req.body;
        if (!Array.isArray(students) || students.length === 0) {
            return res.status(400).json({ success: false, message: '請提供學生資料' });
        }
        if (students.length > 200) {
            return res.status(400).json({ success: false, message: '每次最多匯入 200 名學生' });
        }

        const validStudents = [];
        const skipped = [];
        const seenIds = new Set();

        for (let index = 0; index < students.length; index++) {
            const row = students[index] || {};
            const rowNumber = Number(row.rowNumber) || index + 2;
            const studentId = String(row.studentId || '').trim().toUpperCase();
            const name = String(row.name || '').trim();
            const password = String(row.password || '123456').trim();
            const classNo = row.classNo === '' || row.classNo == null ? null : Number(row.classNo);

            if (!studentId || !name) {
                skipped.push({ rowNumber, studentId, reason: '缺少學號或姓名' });
                continue;
            }
            if (!/^[A-Z0-9_-]{1,20}$/.test(studentId)) {
                skipped.push({ rowNumber, studentId, reason: '學號格式不正確' });
                continue;
            }
            if (password.length < 6) {
                skipped.push({ rowNumber, studentId, reason: '密碼最少需要 6 個字元' });
                continue;
            }
            if (classNo !== null && (!Number.isInteger(classNo) || classNo < 1 || classNo > 99)) {
                skipped.push({ rowNumber, studentId, reason: '班號必須是 1 至 99 的整數' });
                continue;
            }
            if (seenIds.has(studentId)) {
                skipped.push({ rowNumber, studentId, reason: 'Excel 內有重複學號' });
                continue;
            }

            seenIds.add(studentId);
            validStudents.push({
                rowNumber,
                studentId,
                name,
                password,
                className: String(row.className || '').trim(),
                classNo,
                chineseGroup: String(row.chineseGroup || '').trim(),
                englishGroup: String(row.englishGroup || '').trim(),
                mathGroup: String(row.mathGroup || '').trim(),
            });
        }

        const newStudents = [];
        for (const student of validStudents) {
            const { rows } = await db.query('SELECT StudentID FROM Users WHERE StudentID = $1', [student.studentId]);
            if (rows.length > 0) {
                skipped.push({
                    rowNumber: student.rowNumber,
                    studentId: student.studentId,
                    reason: '學號已存在'
                });
            } else {
                newStudents.push(student);
            }
        }

        if (newStudents.length > 0) {
            const { ALL_TAGS } = require('../engine/questionGenerator');
            client = await db.connect();
            await client.query('BEGIN');

            for (const student of newStudents) {
                const hash = await bcrypt.hash(student.password, 10);
                await client.query(`
                    INSERT INTO Users (StudentID, Name, PasswordHash, Role, ClassName, ClassNo, ChineseGroup, EnglishGroup, MathGroup)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                `, [
                    student.studentId,
                    student.name,
                    hash,
                    'student',
                    student.className,
                    student.classNo,
                    student.chineseGroup,
                    student.englishGroup,
                    student.mathGroup
                ]);

                for (const tag of ALL_TAGS) {
                    await client.query(`
                        INSERT INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate)
                        VALUES ($1, $2, 0, 0, 0.0)
                        ON CONFLICT (StudentID, Tag) DO NOTHING
                    `, [student.studentId, tag]);
                }
            }

            await client.query('COMMIT');
        }

        res.json({
            success: true,
            message: `成功新增 ${newStudents.length} 名學生`,
            created: newStudents.map(student => ({
                studentId: student.studentId,
                name: student.name
            })),
            skipped
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('批量新增學生錯誤:', error);
        res.status(500).json({ success: false, message: '批量匯入失敗，未能完成新增' });
    } finally {
        if (client) client.release();
    }
});

/**
 * DELETE /api/auth/delete-student/:studentId
 * 教師專用：刪除學生
 */
router.delete('/delete-student/:studentId', async (req, res) => {
    try {
        // 權限驗證：是老師或提供安全 Admin 密碼
        const isTeacher = req.session.role === 'teacher';
        const isAdmin = req.query.adminPassword === 'Admin';
        if (!isTeacher && !isAdmin) {
            return res.status(403).json({ success: false, message: '權限不足，僅限教師操作' });
        }

        const { studentId } = req.params;
        if (!studentId) {
            return res.status(400).json({ success: false, message: '無效的學生 ID' });
        }

        // 安全檢查：防止刪除自己
        const { rows: userCheck } = await db.query("SELECT Role FROM Users WHERE StudentID = $1", [studentId]);
        if (userCheck.length === 0) {
            return res.status(404).json({ success: false, message: '找不到該帳號' });
        }
        if (req.session.studentId === studentId) {
            return res.status(403).json({ success: false, message: '無法刪除自己目前登入的帳號' });
        }

        // 依序刪除 (FK 依賴：先刪除 Logs 與 Stats，再刪除 User)
        await db.query("DELETE FROM QuestionLogs WHERE StudentID = $1", [studentId]);
        await db.query("DELETE FROM StudentStats WHERE StudentID = $1", [studentId]);
        await db.query("DELETE FROM Users WHERE StudentID = $1", [studentId]);

        res.json({ success: true, message: '帳號已成功刪除' });

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
            classNo: 'ClassNo',
            chineseGroup: 'ChineseGroup',
            englishGroup: 'EnglishGroup',
            mathGroup: 'MathGroup'
        };

        const dbField = allowedFields[field];
        if (!dbField) {
            return res.status(400).json({ success: false, message: '不允許更新此欄位' });
        }

        let normalizedValue = value || '';
        if (field === 'classNo') {
            normalizedValue = value === '' || value == null ? null : Number(value);
            if (normalizedValue !== null && (!Number.isInteger(normalizedValue) || normalizedValue < 1 || normalizedValue > 99)) {
                return res.status(400).json({ success: false, message: '班號必須是 1 至 99 的整數' });
            }
        }

        await db.query(`UPDATE Users SET ${dbField} = $1 WHERE StudentID = $2`, [normalizedValue, studentId]);
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

