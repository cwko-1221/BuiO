/**
 * Phase 1 驗證腳本 - 驗證資料庫 Schema 與初始化
 * 
 * 測試項目:
 * 1. 資料庫連線是否正常
 * 2. 三張資料表是否正確建立
 * 3. 資料表欄位是否正確
 * 4. 預設帳號是否已建立
 * 5. StudentStats 是否已初始化
 * 6. 索引是否已建立
 */

const db = require('../db/database');
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

console.log('');
console.log('🧪 ========================================');
console.log('🧪  Phase 1: 資料庫 Schema 驗證測試');
console.log('🧪 ========================================');
console.log('');

// ========================================
// 測試 1: 資料表是否存在
// ========================================
console.log('📋 測試 1: 資料表是否存在');

test('Users 表存在', () => {
    const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='Users'"
    ).get();
    assert(result, 'Users 表不存在');
});

test('QuestionLogs 表存在', () => {
    const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='QuestionLogs'"
    ).get();
    assert(result, 'QuestionLogs 表不存在');
});

test('StudentStats 表存在', () => {
    const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='StudentStats'"
    ).get();
    assert(result, 'StudentStats 表不存在');
});

console.log('');

// ========================================
// 測試 2: Users 表欄位結構
// ========================================
console.log('📋 測試 2: Users 表欄位結構');

test('Users 表有 StudentID 欄位 (PRIMARY KEY)', () => {
    const columns = db.prepare("PRAGMA table_info(Users)").all();
    const col = columns.find(c => c.name === 'StudentID');
    assert(col, 'StudentID 欄位不存在');
    assert(col.pk === 1, 'StudentID 應為 PRIMARY KEY');
    assert(col.type === 'TEXT', 'StudentID 型別應為 TEXT');
});

test('Users 表有 Name 欄位 (NOT NULL)', () => {
    const columns = db.prepare("PRAGMA table_info(Users)").all();
    const col = columns.find(c => c.name === 'Name');
    assert(col, 'Name 欄位不存在');
    assert(col.notnull === 1, 'Name 應為 NOT NULL');
});

test('Users 表有 PasswordHash 欄位 (NOT NULL)', () => {
    const columns = db.prepare("PRAGMA table_info(Users)").all();
    const col = columns.find(c => c.name === 'PasswordHash');
    assert(col, 'PasswordHash 欄位不存在');
    assert(col.notnull === 1, 'PasswordHash 應為 NOT NULL');
});

console.log('');

// ========================================
// 測試 3: QuestionLogs 表欄位結構
// ========================================
console.log('📋 測試 3: QuestionLogs 表欄位結構');

test('QuestionLogs 表有正確的欄位數量 (9欄)', () => {
    const columns = db.prepare("PRAGMA table_info(QuestionLogs)").all();
    assert(columns.length === 9, `應有 9 欄, 實際有 ${columns.length} 欄`);
});

const expectedLogColumns = [
    'LogID', 'StudentID', 'Tag', 'QuestionText',
    'CorrectAnswer', 'UserAnswer', 'IsCorrect', 'TimeTaken', 'Timestamp'
];

for (const colName of expectedLogColumns) {
    test(`QuestionLogs 表有 ${colName} 欄位`, () => {
        const columns = db.prepare("PRAGMA table_info(QuestionLogs)").all();
        const col = columns.find(c => c.name === colName);
        assert(col, `${colName} 欄位不存在`);
    });
}

console.log('');

// ========================================
// 測試 4: StudentStats 表欄位結構
// ========================================
console.log('📋 測試 4: StudentStats 表欄位結構');

test('StudentStats 表有正確的欄位數量 (5欄)', () => {
    const columns = db.prepare("PRAGMA table_info(StudentStats)").all();
    assert(columns.length === 5, `應有 5 欄, 實際有 ${columns.length} 欄`);
});

const expectedStatsColumns = [
    'StudentID', 'Tag', 'TotalAttempted', 'TotalCorrect', 'AccuracyRate'
];

for (const colName of expectedStatsColumns) {
    test(`StudentStats 表有 ${colName} 欄位`, () => {
        const columns = db.prepare("PRAGMA table_info(StudentStats)").all();
        const col = columns.find(c => c.name === colName);
        assert(col, `${colName} 欄位不存在`);
    });
}

console.log('');

// ========================================
// 測試 5: 預設帳號
// ========================================
console.log('📋 測試 5: 預設測試帳號');

test('有 5 個預設帳號', () => {
    const count = db.prepare('SELECT COUNT(*) as count FROM Users').get();
    assert(count.count === 5, `應有 5 個帳號, 實際有 ${count.count} 個`);
});

const expectedUsers = [
    { id: 'S001', name: '王小明' },
    { id: 'S002', name: '李小華' },
    { id: 'S003', name: '張小美' },
    { id: 'S004', name: '陳大偉' },
    { id: 'S005', name: '林小芬' },
];

for (const expected of expectedUsers) {
    test(`帳號 ${expected.id} (${expected.name}) 存在且密碼正確`, () => {
        const user = db.prepare('SELECT * FROM Users WHERE StudentID = ?').get(expected.id);
        assert(user, `帳號 ${expected.id} 不存在`);
        assert(user.Name === expected.name, `名稱應為 ${expected.name}, 實際為 ${user.Name}`);
        assert(bcrypt.compareSync('123456', user.PasswordHash), '密碼 hash 驗證失敗');
    });
}

console.log('');

// ========================================
// 測試 6: StudentStats 初始化
// ========================================
console.log('📋 測試 6: StudentStats 初始化');

const allTags = [
    'add_2d_nc', 'add_2d_c',
    'sub_2d_b', 'sub_3d_z_mid',
    'mul_2x2_nc_nc', 'mul_2x2_c_c',
    'div_3d_1d_z0_mid', 'div_3d_1d_z0_end'
];

test(`每個學生有 ${allTags.length} 條標籤記錄 (共 ${5 * allTags.length} 條)`, () => {
    const count = db.prepare('SELECT COUNT(*) as count FROM StudentStats').get();
    assert(count.count === 5 * allTags.length, 
        `應有 ${5 * allTags.length} 條, 實際有 ${count.count} 條`);
});

test('所有 StudentStats 初始值為 0', () => {
    const nonZero = db.prepare(
        'SELECT COUNT(*) as count FROM StudentStats WHERE TotalAttempted != 0 OR TotalCorrect != 0 OR AccuracyRate != 0'
    ).get();
    assert(nonZero.count === 0, `有 ${nonZero.count} 條記錄的初始值不為 0`);
});

for (const tag of allTags) {
    test(`標籤 "${tag}" 存在於 StudentStats 中`, () => {
        const result = db.prepare('SELECT COUNT(*) as count FROM StudentStats WHERE Tag = ?').get(tag);
        assert(result.count === 5, `標籤 "${tag}" 應有 5 條記錄, 實際有 ${result.count} 條`);
    });
}

console.log('');

// ========================================
// 測試 7: 索引
// ========================================
console.log('📋 測試 7: 索引');

test('idx_questionlogs_student 索引存在', () => {
    const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_questionlogs_student'"
    ).get();
    assert(result, '索引 idx_questionlogs_student 不存在');
});

test('idx_questionlogs_tag 索引存在', () => {
    const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_questionlogs_tag'"
    ).get();
    assert(result, '索引 idx_questionlogs_tag 不存在');
});

test('idx_questionlogs_timestamp 索引存在', () => {
    const result = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_questionlogs_timestamp'"
    ).get();
    assert(result, '索引 idx_questionlogs_timestamp 不存在');
});

console.log('');

// ========================================
// 測試 8: 外鍵約束
// ========================================
console.log('📋 測試 8: 外鍵約束');

test('QuestionLogs 有外鍵約束 (StudentID → Users)', () => {
    const fks = db.prepare("PRAGMA foreign_key_list(QuestionLogs)").all();
    const fk = fks.find(f => f.table === 'Users' && f.from === 'StudentID');
    assert(fk, 'QuestionLogs 缺少 StudentID 外鍵約束');
});

test('StudentStats 有外鍵約束 (StudentID → Users)', () => {
    const fks = db.prepare("PRAGMA foreign_key_list(StudentStats)").all();
    const fk = fks.find(f => f.table === 'Users' && f.from === 'StudentID');
    assert(fk, 'StudentStats 缺少 StudentID 外鍵約束');
});

// ========================================
// 測試結果摘要
// ========================================
console.log('');
console.log('📊 ========================================');
console.log(`📊  測試結果: ${passed} 通過, ${failed} 失敗`);
console.log('📊 ========================================');

if (failed === 0) {
    console.log('');
    console.log('🎉 Phase 1 驗證全部通過！資料庫 Schema 建立正確！');
    console.log('');
} else {
    console.log('');
    console.log('⚠️  部分測試失敗，請檢查上方錯誤訊息。');
    console.log('');
    process.exit(1);
}
