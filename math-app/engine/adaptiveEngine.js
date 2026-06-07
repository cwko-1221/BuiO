/**
 * 適性派題引擎 (Adaptive Engine)
 * 
 * 核心邏輯：
 * 1. 讀取學生的 StudentStats，計算各標籤正確率
 * 2. 若某標籤正確率 < 70%，標記為「弱點標籤」
 * 3. 出題權重分配：
 *    - 60% 題目從弱點標籤中抽取
 *    - 40% 題目從其他標籤中隨機抽取
 * 4. 若無弱點標籤，則均勻分配
 * 5. 若全部都是弱點標籤，則全部從弱點中抽取
 * 6. 每次練習出 10 題
 */

const db = require('../db/database');
const { generateQuestion, ALL_TAGS } = require('./questionGenerator');

const WEAKNESS_THRESHOLD = 70;  // 正確率低於此值視為弱點
const WEAK_RATIO = 0.6;         // 弱點標籤佔比 60%
const STRONG_RATIO = 0.4;       // 其他標籤佔比 40%
const DEFAULT_QUIZ_SIZE = 5;    // 每次練習題數

/**
 * 取得學生各標籤的統計資料
 * @param {string} studentId
 * @returns {Array} 各標籤統計
 */
async function getStudentStats(studentId) {
    if (!process.env.DATABASE_URL) {
        return []; // [Local Testing Mock] 如果沒有資料庫，假設完全沒有作答紀錄（全隨機分配）
    }

    const { rows } = await db.query(`
        SELECT Tag as tag, TotalAttempted as totalattempted, 
               TotalCorrect as totalcorrect, AccuracyRate as accuracyrate
        FROM StudentStats
        WHERE StudentID = $1
    `, [studentId]);
    return rows.map(r => ({
        tag: r.tag,
        totalAttempted: parseInt(r.totalattempted) || 0,
        totalCorrect: parseInt(r.totalcorrect) || 0,
        accuracyRate: parseFloat(r.accuracyrate) || 0
    }));
}

/**
 * 分析弱點標籤
 * @param {string} studentId
 * @returns {{ weakTags: string[], strongTags: string[], stats: Object }}
 */
async function analyzeWeaknesses(studentId) {
    const stats = await getStudentStats(studentId);

    const weakTags = [];
    const strongTags = [];
    const statsMap = {};

    for (const s of stats) {
        statsMap[s.tag] = s;

        // 只有做過題目的標籤才能判斷弱點
        if (s.totalAttempted > 0 && s.accuracyRate < WEAKNESS_THRESHOLD) {
            weakTags.push(s.tag);
        } else {
            strongTags.push(s.tag);
        }
    }

    // 如果學生還沒做過任何題目，所有標籤都視為「其他」
    // 確保未作答的標籤也包含在內
    for (const tag of ALL_TAGS) {
        if (!statsMap[tag]) {
            strongTags.push(tag);
            statsMap[tag] = { tag, totalAttempted: 0, totalCorrect: 0, accuracyRate: 0 };
        }
    }

    return { weakTags, strongTags, stats: statsMap };
}

/**
 * 從標籤陣列中隨機選取一個
 * @param {string[]} tags
 * @returns {string}
 */
function randomPick(tags) {
    return tags[Math.floor(Math.random() * tags.length)];
}

/**
 * 根據正確率進行加權隨機選取（正確率越低，被選中機率越高）
 * @param {string[]} tags
 * @param {Object} statsMap
 * @returns {string}
 */
function weightedPick(tags, statsMap) {
    if (tags.length === 0) return null;
    if (tags.length === 1) return tags[0];

    // 計算權重：正確率越低，權重越高
    // 權重 = (100 - accuracyRate) + 1 (避免為零)
    const weights = tags.map(tag => {
        const accuracy = statsMap[tag]?.accuracyRate || 0;
        return (100 - accuracy) + 1;
    });

    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < tags.length; i++) {
        random -= weights[i];
        if (random <= 0) return tags[i];
    }

    return tags[tags.length - 1];
}

/**
 * 適性派題：生成一組題目
 * 
 * @param {string} studentId - 學生 ID
 * @param {number} count - 題目數量 (預設 10)
 * @returns {{ questions: Array, distribution: Object }}
 */
async function generateAdaptiveQuiz(studentId, count = DEFAULT_QUIZ_SIZE) {
    const { weakTags, strongTags, stats } = await analyzeWeaknesses(studentId);

    const questions = [];
    const distribution = {
        weakTags,
        strongTags,
        weakCount: 0,
        strongCount: 0,
        tagCounts: {},
    };

    // 決定各類型的題數
    let weakCount, strongCount;

    if (weakTags.length === 0) {
        // 無弱點：均勻分配所有標籤
        weakCount = 0;
        strongCount = count;
    } else if (strongTags.length === 0) {
        // 全部都是弱點：全部從弱點中抽取
        weakCount = count;
        strongCount = 0;
    } else {
        // 正常情況：60% 弱點，40% 其他
        weakCount = Math.round(count * WEAK_RATIO);
        strongCount = count - weakCount;
    }

    // 生成弱點標籤題目（使用加權選取，正確率越低越常出現）
    for (let i = 0; i < weakCount; i++) {
        const tag = weightedPick(weakTags, stats);
        const q = generateQuestion(tag);
        questions.push(q);
        distribution.tagCounts[tag] = (distribution.tagCounts[tag] || 0) + 1;
    }

    // 生成其他標籤題目（隨機選取）
    for (let i = 0; i < strongCount; i++) {
        const pool = weakTags.length === 0 ? ALL_TAGS : strongTags;
        const tag = randomPick(pool);
        const q = generateQuestion(tag);
        questions.push(q);
        distribution.tagCounts[tag] = (distribution.tagCounts[tag] || 0) + 1;
    }

    distribution.weakCount = weakCount;
    distribution.strongCount = strongCount;

    // 洗牌 (Fisher-Yates)
    for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    return { questions, distribution };
}

module.exports = {
    generateAdaptiveQuiz,
    analyzeWeaknesses,
    getStudentStats,
    WEAKNESS_THRESHOLD,
    WEAK_RATIO,
    STRONG_RATIO,
    DEFAULT_QUIZ_SIZE,
};
