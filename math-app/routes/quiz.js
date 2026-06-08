/**
 * 測驗路由 (Quiz Routes)
 * 
 * GET  /api/quiz/questions  - 取得一組題目 (10 題)
 * POST /api/quiz/submit     - 提交整組答案 (批量)
 * POST /api/quiz/answer     - 提交單題答案
 */

const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { generateQuestion, ALL_TAGS } = require('../engine/questionGenerator');
const { generateAdaptiveQuiz } = require('../engine/adaptiveEngine');

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

router.use(requireAuth);

// ========================================
// GET /api/quiz/questions
// 取得一組題目（10 題）— 使用適性派題機制
// Query: ?count=10 (選填，預設 10)
// ========================================
router.get('/questions', async (req, res) => {
    try {
        const count = parseInt(req.query.count) || 10;
        const studentId = req.session.studentId;

        // 使用適性派題引擎
        const { questions: fullQuestions, distribution } = await generateAdaptiveQuiz(studentId, count);

        // 儲存完整題目到 session（含答案，用於驗證）
        req.session.currentQuiz = fullQuestions.map((q, idx) => ({
            index: idx + 1,
            tag: q.tag,
            questionText: q.questionText,
            correctAnswer: q.answer,
        }));

        // 回傳給前端（不含答案）
        const clientQuestions = fullQuestions.map((q, idx) => ({
            index: idx + 1,
            tag: q.tag,
            category: q.category,
            tagName: q.tagName,
            questionText: q.questionText,
            symbol: q.symbol,
        }));

        res.json({
            success: true,
            count: clientQuestions.length,
            questions: clientQuestions,
            // 回傳出題分布資訊（供前端顯示）
            distribution: {
                weakTags: distribution.weakTags,
                strongTags: distribution.strongTags,
                weakCount: distribution.weakCount,
                strongCount: distribution.strongCount,
                tagCounts: distribution.tagCounts,
            }
        });

    } catch (error) {
        console.error('出題錯誤:', error);
        res.status(500).json({
            success: false,
            message: '出題失敗'
        });
    }
});

// ========================================
// POST /api/quiz/submit
// 批量提交整組答案
// Body: { answers: [{ index, userAnswer, timeTaken }] }
// ========================================
router.post('/submit', async (req, res) => {
    let client;
    try {
        const studentId = req.session.studentId;
        const { answers } = req.body;

        if (!answers || !Array.isArray(answers)) {
            return res.status(400).json({
                success: false,
                message: '請提供答案陣列'
            });
        }

        const quiz = req.session.currentQuiz;
        if (!quiz || quiz.length === 0) {
            return res.status(400).json({
                success: false,
                message: '沒有進行中的測驗，請先取得題目'
            });
        }

        const insertLogQuery = `
            INSERT INTO QuestionLogs (StudentID, Tag, Question, CorrectAnswer, UserAnswer, IsCorrect, TimeSpent)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `;

        const updateStatsQuery = `
            INSERT INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate)
            VALUES ($1, $2, 1, $3, $3 * 100)
            ON CONFLICT (StudentID, Tag) DO UPDATE
            SET TotalAttempted = StudentStats.TotalAttempted + 1,
                TotalCorrect = StudentStats.TotalCorrect + EXCLUDED.TotalCorrect,
                AccuracyRate = ROUND(
                    CAST(StudentStats.TotalCorrect + EXCLUDED.TotalCorrect AS NUMERIC) /
                    (StudentStats.TotalAttempted + 1) * 100,
                    2
                )
        `;

        const results = [];
        let correctCount = 0;
        let totalTime = 0;

        // 使用 transaction 批量處理
        if (process.env.DATABASE_URL) {
            client = await db.connect();
            await client.query('BEGIN');
        }

        for (const ans of answers) {
            const question = quiz.find(q => q.index === ans.index);
            if (!question) continue;

            const userAnswer = parseFloat(ans.userAnswer);
            const isCorrect = (userAnswer === question.correctAnswer) ? 1 : 0;
            const timeTaken = parseFloat(ans.timeTaken) || 0;

            if (isCorrect) correctCount++;
            totalTime += timeTaken;

            if (process.env.DATABASE_URL) {
                // 寫入 QuestionLogs
                await client.query(insertLogQuery, [
                    studentId,
                    question.tag,
                    question.questionText,
                    question.correctAnswer,
                    userAnswer,
                    isCorrect === 1,
                    timeTaken
                ]);

                // 更新 StudentStats
                await client.query(updateStatsQuery, [
                    studentId,
                    question.tag,
                    isCorrect
                ]);
            }

            results.push({
                index: question.index,
                questionText: question.questionText,
                correctAnswer: question.correctAnswer,
                userAnswer: userAnswer,
                isCorrect: !!isCorrect,
                timeTaken: timeTaken,
                tag: question.tag,
            });
        }

        if (process.env.DATABASE_URL) {
            await client.query('COMMIT');
        }

        // 清除 session 中的測驗資料
        req.session.currentQuiz = null;

        res.json({
            success: true,
            message: '答案已提交',
            summary: {
                totalQuestions: results.length,
                correctCount,
                incorrectCount: results.length - correctCount,
                accuracyRate: results.length > 0
                    ? Math.round(correctCount / results.length * 100)
                    : 0,
                totalTime: Math.round(totalTime * 10) / 10,
                avgTime: results.length > 0
                    ? Math.round(totalTime / results.length * 10) / 10
                    : 0,
            },
            results
        });

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('提交答案錯誤:', error);
        res.status(500).json({
            success: false,
            message: '提交失敗'
        });
    } finally {
        if (client) client.release();
    }
});

// ========================================
// POST /api/quiz/answer
// 提交單題答案（即時回饋）
// Body: { index, userAnswer, timeTaken }
// ========================================
router.post('/answer', async (req, res) => {
    try {
        const studentId = req.session.studentId;
        const { index, userAnswer, timeTaken } = req.body;

        const quiz = req.session.currentQuiz;
        if (!quiz || quiz.length === 0) {
            return res.status(400).json({
                success: false,
                message: '沒有進行中的測驗'
            });
        }

        const question = quiz.find(q => q.index === index);
        if (!question) {
            return res.status(400).json({
                success: false,
                message: `找不到第 ${index} 題`
            });
        }

        const parsedAnswer = parseFloat(userAnswer);
        const isCorrect = (parsedAnswer === question.correctAnswer) ? 1 : 0;
        const parsedTime = Math.round(parseFloat(timeTaken)) || 0;

        if (process.env.DATABASE_URL) {
            // 寫入 QuestionLogs (IsCorrect 需要是 boolean)
            await db.query(`
                INSERT INTO QuestionLogs (StudentID, Tag, Question, CorrectAnswer, UserAnswer, IsCorrect, TimeSpent)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [studentId, question.tag, question.questionText, question.correctAnswer, parsedAnswer, isCorrect === 1, parsedTime]);

            // 更新 StudentStats
            await db.query(`
                INSERT INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate)
                VALUES ($1, $2, 1, $3, $3 * 100)
                ON CONFLICT (StudentID, Tag) DO UPDATE
                SET TotalAttempted = StudentStats.TotalAttempted + 1,
                    TotalCorrect = StudentStats.TotalCorrect + EXCLUDED.TotalCorrect,
                    AccuracyRate = ROUND(
                        CAST(StudentStats.TotalCorrect + EXCLUDED.TotalCorrect AS NUMERIC) /
                        (StudentStats.TotalAttempted + 1) * 100,
                        2
                    )
            `, [studentId, question.tag, isCorrect]);
        }

        // 從 session 中移除已作答的題目
        req.session.currentQuiz = quiz.filter(q => q.index !== index);

        res.json({
            success: true,
            result: {
                index,
                questionText: question.questionText,
                correctAnswer: question.correctAnswer,
                userAnswer: parsedAnswer,
                isCorrect: !!isCorrect,
                timeTaken: parsedTime,
                tag: question.tag,
            },
            remaining: req.session.currentQuiz.length
        });

    } catch (error) {
        console.error('提交單題答案錯誤:', error);
        res.status(500).json({
            success: false,
            message: '提交失敗'
        });
    }
});

module.exports = router;
