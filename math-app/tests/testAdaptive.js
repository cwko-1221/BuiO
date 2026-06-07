/**
 * Phase 4 驗證腳本 - 適性派題機制測試
 * 
 * 驗證項目:
 * 1. 新學生（無紀錄）→ 均勻分配
 * 2. 設定弱點後 → 60/40 分配
 * 3. 全部弱點 → 100% 弱點
 * 4. 弱點標籤加權（正確率越低越常出現）
 * 5. 整合 API 測試（模擬多輪作答後觀察出題變化）
 */

const db = require('../db/database');
const { generateAdaptiveQuiz, analyzeWeaknesses, WEAKNESS_THRESHOLD } = require('../engine/adaptiveEngine');
const { ALL_TAGS } = require('../engine/questionGenerator');
const bcrypt = require('bcryptjs');

let passed = 0;
let failed = 0;

function test(description, fn) {
    try {
        fn();
        console.log(`  ✅ ${description}`);
        passed++;
    } catch (error) {
        console.log(`  ❌ ${description}`);
        console.log(`     → ${error.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

// ========================================
// 建立測試用學生帳號
// ========================================
function setupTestStudent(studentId, name) {
    const hash = bcrypt.hashSync('test123', 10);
    db.prepare('INSERT OR REPLACE INTO Users (StudentID, Name, PasswordHash) VALUES (?, ?, ?)').run(studentId, name, hash);

    // 初始化 StudentStats
    for (const tag of ALL_TAGS) {
        db.prepare('INSERT OR REPLACE INTO StudentStats (StudentID, Tag, TotalAttempted, TotalCorrect, AccuracyRate) VALUES (?, ?, 0, 0, 0.0)')
            .run(studentId, tag);
    }
}

function setStudentStats(studentId, tag, attempted, correct) {
    const accuracy = attempted > 0 ? Math.round(correct / attempted * 100 * 100) / 100 : 0;
    db.prepare('UPDATE StudentStats SET TotalAttempted = ?, TotalCorrect = ?, AccuracyRate = ? WHERE StudentID = ? AND Tag = ?')
        .run(attempted, correct, accuracy, studentId, tag);
}

function cleanupTestStudent(studentId) {
    db.prepare('DELETE FROM QuestionLogs WHERE StudentID = ?').run(studentId);
    db.prepare('DELETE FROM StudentStats WHERE StudentID = ?').run(studentId);
    db.prepare('DELETE FROM Users WHERE StudentID = ?').run(studentId);
}

console.log('');
console.log('🧪 ========================================');
console.log('🧪  Phase 4: 適性派題機制驗證測試');
console.log('🧪 ========================================');

// ========================================
// 測試 1: 新學生 (無任何紀錄)
// ========================================
console.log('');
console.log('📋 測試 1: 新學生 (無紀錄) → 均勻分配');

setupTestStudent('TEST_A', '測試生A');

test('新學生沒有弱點標籤', () => {
    const { weakTags, strongTags } = analyzeWeaknesses('TEST_A');
    assert(weakTags.length === 0, `應無弱點, 但有 ${weakTags.length} 個`);
    assert(strongTags.length === 8, `應有 8 個非弱點, 但有 ${strongTags.length} 個`);
});

test('新學生出題涵蓋所有標籤', () => {
    // 多次生成以確保覆蓋
    const tagSet = new Set();
    for (let i = 0; i < 10; i++) {
        const { questions } = generateAdaptiveQuiz('TEST_A', 10);
        questions.forEach(q => tagSet.add(q.tag));
    }
    assert(tagSet.size === 8, `應涵蓋 8 種標籤, 實際涵蓋 ${tagSet.size} 種`);
});

test('新學生出題 distribution 顯示 weakCount=0', () => {
    const { distribution } = generateAdaptiveQuiz('TEST_A', 10);
    assert(distribution.weakCount === 0, `weakCount 應為 0, 得到 ${distribution.weakCount}`);
    assert(distribution.strongCount === 10, `strongCount 應為 10, 得到 ${distribution.strongCount}`);
});

// ========================================
// 測試 2: 有弱點的學生 → 60/40 分配
// ========================================
console.log('');
console.log('📋 測試 2: 有弱點的學生 → 60/40 分配');

setupTestStudent('TEST_B', '測試生B');

// 設定 2 個弱點標籤 (正確率 < 70%)
setStudentStats('TEST_B', 'add_2d_nc', 20, 10);  // 50% → 弱點
setStudentStats('TEST_B', 'sub_2d_b', 20, 8);    // 40% → 弱點
// 設定 2 個強項
setStudentStats('TEST_B', 'add_2d_c', 20, 16);   // 80% → 強項
setStudentStats('TEST_B', 'mul_2x2_nc_nc', 20, 18); // 90% → 強項

test('正確識別 2 個弱點標籤', () => {
    const { weakTags } = analyzeWeaknesses('TEST_B');
    assert(weakTags.includes('add_2d_nc'), '應包含 add_2d_nc');
    assert(weakTags.includes('sub_2d_b'), '應包含 sub_2d_b');
    assert(weakTags.length === 2, `應有 2 個弱點, 實際 ${weakTags.length}`);
});

test('出題分布: 60% 弱點 (6題), 40% 其他 (4題)', () => {
    const { distribution } = generateAdaptiveQuiz('TEST_B', 10);
    assert(distribution.weakCount === 6, `弱點題數應為 6, 得到 ${distribution.weakCount}`);
    assert(distribution.strongCount === 4, `其他題數應為 4, 得到 ${distribution.strongCount}`);
});

test('弱點標籤的題目確實佔多數 (統計 100 組)', () => {
    let weakTotal = 0;
    let total = 0;
    for (let i = 0; i < 100; i++) {
        const { questions } = generateAdaptiveQuiz('TEST_B', 10);
        for (const q of questions) {
            total++;
            if (q.tag === 'add_2d_nc' || q.tag === 'sub_2d_b') {
                weakTotal++;
            }
        }
    }
    const weakRatio = weakTotal / total;
    // 應該在 55%~65% 之間（60% ± 5% 容差）
    assert(weakRatio >= 0.55 && weakRatio <= 0.65,
        `弱點比例 ${(weakRatio * 100).toFixed(1)}% 不在 55%~65% 範圍內`);
});

// ========================================
// 測試 3: 全部都是弱點 → 100% 弱點
// ========================================
console.log('');
console.log('📋 測試 3: 全部標籤都是弱點 → 全部從弱點抽取');

setupTestStudent('TEST_C', '測試生C');

// 所有標籤正確率都低於 70%
for (const tag of ALL_TAGS) {
    setStudentStats('TEST_C', tag, 10, 5); // 50%
}

test('識別 8 個弱點標籤', () => {
    const { weakTags, strongTags } = analyzeWeaknesses('TEST_C');
    assert(weakTags.length === 8, `應有 8 個弱點, 實際 ${weakTags.length}`);
    assert(strongTags.length === 0, `應有 0 個強項, 實際 ${strongTags.length}`);
});

test('distribution 顯示 weakCount=10, strongCount=0', () => {
    const { distribution } = generateAdaptiveQuiz('TEST_C', 10);
    assert(distribution.weakCount === 10, `weakCount 應為 10, 得到 ${distribution.weakCount}`);
    assert(distribution.strongCount === 0, `strongCount 應為 0, 得到 ${distribution.strongCount}`);
});

// ========================================
// 測試 4: 弱點加權 (正確率越低越常出現)
// ========================================
console.log('');
console.log('📋 測試 4: 弱點加權 (正確率越低 → 出現越多)');

setupTestStudent('TEST_D', '測試生D');

// 設定不同程度的弱點
setStudentStats('TEST_D', 'add_2d_nc', 20, 2);    // 10% → 極弱
setStudentStats('TEST_D', 'sub_2d_b', 20, 12);    // 60% → 稍弱
// 其他標籤保持未作答 (會歸類為 strongTags)

test('弱點加權: 10% 的標籤出現頻率 > 60% 的標籤 (統計 200 組)', () => {
    let countVeryWeak = 0;  // add_2d_nc (10%)
    let countSlightlyWeak = 0;  // sub_2d_b (60%)

    for (let i = 0; i < 200; i++) {
        const { questions } = generateAdaptiveQuiz('TEST_D', 10);
        for (const q of questions) {
            if (q.tag === 'add_2d_nc') countVeryWeak++;
            if (q.tag === 'sub_2d_b') countSlightlyWeak++;
        }
    }

    assert(countVeryWeak > countSlightlyWeak,
        `極弱標籤出現 ${countVeryWeak} 次應 > 稍弱標籤 ${countSlightlyWeak} 次`);
});

// ========================================
// 測試 5: 邊界條件 - 正確率正好 70%
// ========================================
console.log('');
console.log('📋 測試 5: 邊界條件');

setupTestStudent('TEST_E', '測試生E');
setStudentStats('TEST_E', 'add_2d_nc', 10, 7);  // 正好 70% → 不算弱點

test('正確率 70% 不算弱點', () => {
    const { weakTags } = analyzeWeaknesses('TEST_E');
    assert(!weakTags.includes('add_2d_nc'), '70% 不應算弱點');
});

setStudentStats('TEST_E', 'sub_2d_b', 100, 69);  // 69% → 弱點

test('正確率 69% 算弱點', () => {
    const { weakTags } = analyzeWeaknesses('TEST_E');
    assert(weakTags.includes('sub_2d_b'), '69% 應算弱點');
});

// ========================================
// 測試 6: 題目數量正確
// ========================================
console.log('');
console.log('📋 測試 6: 題目數量');

test('預設生成 10 題', () => {
    const { questions } = generateAdaptiveQuiz('TEST_A', 10);
    assert(questions.length === 10, `應生成 10 題, 實際 ${questions.length}`);
});

test('可自定義題目數量 (15題)', () => {
    const { questions } = generateAdaptiveQuiz('TEST_A', 15);
    assert(questions.length === 15, `應生成 15 題, 實際 ${questions.length}`);
});

test('可自定義題目數量 (5題)', () => {
    const { questions } = generateAdaptiveQuiz('TEST_A', 5);
    assert(questions.length === 5, `應生成 5 題, 實際 ${questions.length}`);
});

// ========================================
// 測試 7: distribution 資訊完整
// ========================================
console.log('');
console.log('📋 測試 7: distribution 資訊完整性');

test('distribution 包含所有必要欄位', () => {
    const { distribution } = generateAdaptiveQuiz('TEST_B', 10);
    assert(Array.isArray(distribution.weakTags), '應包含 weakTags');
    assert(Array.isArray(distribution.strongTags), '應包含 strongTags');
    assert(typeof distribution.weakCount === 'number', '應包含 weakCount');
    assert(typeof distribution.strongCount === 'number', '應包含 strongCount');
    assert(typeof distribution.tagCounts === 'object', '應包含 tagCounts');
});

test('tagCounts 的總和等於題目數量', () => {
    const { distribution } = generateAdaptiveQuiz('TEST_B', 10);
    const totalFromCounts = Object.values(distribution.tagCounts).reduce((sum, c) => sum + c, 0);
    assert(totalFromCounts === 10, `tagCounts 總和 ${totalFromCounts} 應等於 10`);
});

// ========================================
// 清理測試資料
// ========================================
cleanupTestStudent('TEST_A');
cleanupTestStudent('TEST_B');
cleanupTestStudent('TEST_C');
cleanupTestStudent('TEST_D');
cleanupTestStudent('TEST_E');

// ========================================
// 測試結果摘要
// ========================================
console.log('');
console.log('📊 ========================================');
console.log(`📊  測試結果: ${passed} 通過, ${failed} 失敗`);
console.log('📊 ========================================');

if (failed === 0) {
    console.log('');
    console.log('🎉 Phase 4 驗證全部通過！適性派題機制運作正確！');
    console.log('');
} else {
    console.log('');
    console.log('⚠️  部分測試失敗，請檢查上方錯誤訊息。');
    console.log('');
    process.exit(1);
}
