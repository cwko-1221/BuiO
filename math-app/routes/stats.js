/**
 * 統計資料路由 (Stats Routes)
 */

const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { ALL_TAGS, TAG_INFO } = require('../engine/questionGenerator');

// ========================================
// 認證中介軟體
// ========================================
function requireAuth(req, res, next) {
    if (!req.session.studentId) {
        return res.status(401).json({
            success: false,
            message: '請先登入'
        });
    }
    next();
}

function requireTeacher(req, res, next) {
    if (req.session.role !== 'teacher') {
        return res.status(403).json({
            success: false,
            message: '權限不足，僅限教師存取'
        });
    }
    next();
}

// 輔助函數：決定要查詢哪個學生 (若是老師可輸入 query 參數，否則只能查自己)
function getTargetStudentId(req) {
    if (req.session.role === 'teacher' && req.query.studentId) {
        return req.query.studentId;
    }
    return req.session.studentId;
}

router.use(requireAuth);

const tagFilterSql = 'AND Tag = ANY($2::text[])';

// ========================================
// GET /api/stats/overview
// 學生整體統計概覽
// ========================================
router.get('/overview', async (req, res) => {
    try {
        const studentId = getTargetStudentId(req);

        // 整體統計
        const { rows: overallRows } = await db.query(`
            SELECT 
                COALESCE(SUM(TotalAttempted), 0) as totalquestions,
                COALESCE(SUM(TotalCorrect), 0) as totalcorrect,
                CASE 
                    WHEN SUM(TotalAttempted) > 0 
                    THEN ROUND(CAST(SUM(TotalCorrect) AS NUMERIC) / SUM(TotalAttempted) * 100, 1)
                    ELSE 0 
                END as overallaccuracy
            FROM StudentStats
            WHERE StudentID = $1 ${tagFilterSql}
        `, [studentId, ALL_TAGS]);

        const overall = overallRows[0] || {};
        const totalQuestions = parseInt(overall.totalquestions) || 0;
        const totalCorrect = parseInt(overall.totalcorrect) || 0;
        const overallAccuracy = parseFloat(overall.overallaccuracy) || 0;

        // 今日統計
        const { rows: todayRows } = await db.query(`
            SELECT 
                COUNT(*) as todayquestions,
                COALESCE(SUM(IsCorrect), 0) as todaycorrect,
                CASE 
                    WHEN COUNT(*) > 0 
                    THEN ROUND(CAST(SUM(IsCorrect) AS NUMERIC) / COUNT(*) * 100, 1)
                    ELSE 0 
                END as todayaccuracy,
                COALESCE(ROUND(CAST(AVG(TimeTaken) AS NUMERIC), 1), 0) as avgtime
            FROM QuestionLogs
            WHERE StudentID = $1 AND CAST(Timestamp AS DATE) = CURRENT_DATE ${tagFilterSql}
        `, [studentId, ALL_TAGS]);

        const today = todayRows[0] || {};
        const todayQuestions = parseInt(today.todayquestions) || 0;
        const todayCorrect = parseInt(today.todaycorrect) || 0;
        const todayAccuracy = parseFloat(today.todayaccuracy) || 0;
        const avgTime = parseFloat(today.avgtime) || 0;

        // 練習次數（以每組 10 題計算）
        const totalSessions = Math.floor(totalQuestions / 10);

        res.json({
            success: true,
            overview: {
                totalQuestions,
                totalCorrect,
                overallAccuracy,
                totalSessions,
                today: {
                    questions: todayQuestions,
                    correct: todayCorrect,
                    accuracy: todayAccuracy,
                    avgTime,
                }
            }
        });

    } catch (error) {
        console.error('取得概覽錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// ========================================
// GET /api/stats/tags
// 各標籤正確率
// ========================================
router.get('/tags', async (req, res) => {
    try {
        const studentId = getTargetStudentId(req);

        const { rows: stats } = await db.query(`
            SELECT 
                Tag as tag,
                TotalAttempted as totalattempted,
                TotalCorrect as totalcorrect,
                AccuracyRate as accuracyrate
            FROM StudentStats
            WHERE StudentID = $1 ${tagFilterSql}
            ORDER BY Tag
        `, [studentId, ALL_TAGS]);

        const statsByTag = new Map(stats.map(s => [s.tag, s]));

        // Always return every known tag so the teacher dashboard shows the full model
        const enriched = ALL_TAGS.map(tag => {
            const s = statsByTag.get(tag);
            return {
                tag,
                totalAttempted: parseInt(s?.totalattempted) || 0,
                totalCorrect: parseInt(s?.totalcorrect) || 0,
                accuracyRate: parseFloat(s?.accuracyrate) || 0,
                tagName: TAG_INFO[tag]?.name || tag,
                category: TAG_INFO[tag]?.category || '未知',
            };
        });

        res.json({
            success: true,
            stats: enriched
        });

    } catch (error) {
        console.error('取得標籤統計錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// ========================================
// GET /api/stats/history
// 作答歷史紀錄
// ========================================
router.get('/history', async (req, res) => {
    try {
        const studentId = getTargetStudentId(req);
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;
        const tag = req.query.tag || null;

        let query = `
            SELECT 
                LogID as logid,
                Tag as tag,
                QuestionText as questiontext,
                CorrectAnswer as correctanswer,
                UserAnswer as useranswer,
                IsCorrect as iscorrect,
                TimeTaken as timetaken,
                Timestamp as timestamp
            FROM QuestionLogs
            WHERE StudentID = $1 ${tagFilterSql}
        `;
        const params = [studentId, ALL_TAGS];

        if (tag) {
            params.push(tag);
            query += ' AND Tag = $' + params.length;
        }

        query += ' ORDER BY Timestamp DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);

        const { rows: logs } = await db.query(query, params);

        // 總數
        let countQuery = `SELECT COUNT(*) as count FROM QuestionLogs WHERE StudentID = $1 ${tagFilterSql}`;
        const countParams = [studentId, ALL_TAGS];
        if (tag) {
            countParams.push(tag);
            countQuery += ' AND Tag = $' + countParams.length;
        }
        const { rows: countRows } = await db.query(countQuery, countParams);
        const totalCount = parseInt(countRows[0].count) || 0;

        res.json({
            success: true,
            total: totalCount,
            limit,
            offset,
            history: logs.map(l => ({
                logId: l.logid,
                tag: l.tag,
                questionText: l.questiontext,
                correctAnswer: l.correctanswer,
                userAnswer: l.useranswer,
                isCorrect: l.iscorrect === 1 || l.iscorrect === true,
                timeTaken: parseFloat(l.timetaken) || 0,
                timestamp: l.timestamp
            }))
        });

    } catch (error) {
        console.error('取得歷史記錄錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// ========================================
// GET /api/stats/weaknesses
// 弱點分析 (正確率低於 70% 的標籤)
// ========================================
router.get('/weaknesses', async (req, res) => {
    try {
        const studentId = getTargetStudentId(req);

        const { rows: weaknesses } = await db.query(`
            SELECT 
                Tag as tag,
                TotalAttempted as totalattempted,
                TotalCorrect as totalcorrect,
                AccuracyRate as accuracyrate
            FROM StudentStats
            WHERE StudentID = $1 AND TotalAttempted > 0 AND AccuracyRate < 70 ${tagFilterSql}
            ORDER BY AccuracyRate ASC
        `, [studentId, ALL_TAGS]);

        const enriched = weaknesses.map(w => {
            const acc = parseFloat(w.accuracyrate) || 0;
            return {
                tag: w.tag,
                totalAttempted: parseInt(w.totalattempted) || 0,
                totalCorrect: parseInt(w.totalcorrect) || 0,
                accuracyRate: acc,
                tagName: TAG_INFO[w.tag]?.name || w.tag,
                category: TAG_INFO[w.tag]?.category || '未知',
                suggestion: getSuggestion(acc),
            };
        });

        res.json({
            success: true,
            weaknesses: enriched,
            count: enriched.length
        });

    } catch (error) {
        console.error('弱點分析錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// ========================================
// GET /api/stats/time-analysis
// 作答時間分析 (各標籤平均作答時間)
// ========================================
router.get('/time-analysis', async (req, res) => {
    try {
        const studentId = getTargetStudentId(req);

        const { rows: timeData } = await db.query(`
            SELECT 
                Tag as tag,
                COUNT(*) as count,
                ROUND(CAST(AVG(TimeTaken) AS NUMERIC), 1) as avgtime,
                ROUND(CAST(MIN(TimeTaken) AS NUMERIC), 1) as mintime,
                ROUND(CAST(MAX(TimeTaken) AS NUMERIC), 1) as maxtime
            FROM QuestionLogs
            WHERE StudentID = $1 AND TimeTaken > 0 ${tagFilterSql}
            GROUP BY Tag
            ORDER BY avgtime DESC
        `, [studentId, ALL_TAGS]);

        const enriched = timeData.map(t => ({
            tag: t.tag,
            count: parseInt(t.count) || 0,
            avgTime: parseFloat(t.avgtime) || 0,
            minTime: parseFloat(t.mintime) || 0,
            maxTime: parseFloat(t.maxtime) || 0,
            tagName: TAG_INFO[t.tag]?.name || t.tag,
            category: TAG_INFO[t.tag]?.category || '未知',
        }));

        res.json({
            success: true,
            timeAnalysis: enriched
        });

    } catch (error) {
        console.error('時間分析錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

// ========================================
// 輔助函數
// ========================================

function getSuggestion(accuracyRate) {
    if (accuracyRate < 30) return '需要大量練習，建議從基礎概念重新學習';
    if (accuracyRate < 50) return '需要加強練習，注意計算步驟';
    if (accuracyRate < 70) return '接近達標，再多練習幾次即可掌握';
    return '表現良好，繼續保持';
}

// ========================================
// GET /api/stats/teacher/students
// 取得所有學生列表與基礎統計 (僅限教師)
// ========================================
router.get('/teacher/students', requireTeacher, async (req, res) => {
    try {
        const { rows: students } = await db.query(`
            SELECT 
                u.StudentID as id,
                u.Name as name,
                u.Role as role,
                COALESCE(SUM(s.TotalAttempted), 0) as totalquestions,
                CASE 
                    WHEN SUM(s.TotalAttempted) > 0 
                    THEN ROUND(CAST(SUM(s.TotalCorrect) AS NUMERIC) / SUM(s.TotalAttempted) * 100, 1)
                    ELSE 0 
                END as overallaccuracy
            FROM Users u
            LEFT JOIN StudentStats s ON u.StudentID = s.StudentID AND s.Tag = ANY($1::text[])
            GROUP BY u.StudentID, u.Role
            ORDER BY u.Role ASC, u.StudentID ASC
        `, [ALL_TAGS]);

        res.json({
            success: true,
            students: students.map(s => ({
                id: s.id,
                name: s.name,
                role: s.role,
                totalQuestions: parseInt(s.totalquestions) || 0,
                overallAccuracy: parseFloat(s.overallaccuracy) || 0
            }))
        });
    } catch (error) {
        console.error('取得學生列表錯誤:', error);
        res.status(500).json({ success: false, message: '伺服器錯誤' });
    }
});

module.exports = router;
