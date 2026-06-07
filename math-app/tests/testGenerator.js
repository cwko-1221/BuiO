/**
 * Phase 2 驗證腳本 - 自動出題引擎測試
 * 
 * 對每種標籤生成多道題目，逐一驗證：
 * 1. 題目格式正確
 * 2. 數字範圍正確
 * 3. 答案計算正確
 * 4. 特殊條件成立（進位/退位/跨零等）
 */

const { generateQuestion, generateQuestions, ALL_TAGS, TAG_INFO } = require('../engine/questionGenerator');

let passed = 0;
let failed = 0;
const SAMPLE_SIZE = 50; // 每種標籤測試 50 道

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

/** 取得數字的各位數 */
function digits(n) {
    const abs = Math.abs(n);
    return {
        ones: abs % 10,
        tens: Math.floor(abs / 10) % 10,
        hundreds: Math.floor(abs / 100) % 10,
    };
}

console.log('');
console.log('🧪 ========================================');
console.log('🧪  Phase 2: 自動出題引擎驗證測試');
console.log(`🧪  每種標籤測試 ${SAMPLE_SIZE} 道題目`);
console.log('🧪 ========================================');

// ========================================
// 測試 1: add_2d_nc (兩位數加法，無進位)
// ========================================
console.log('');
console.log('📋 [add_2d_nc] 兩位數加法 (無進位)');

test(`生成 ${SAMPLE_SIZE} 道題目，所有數字為兩位數`, () => {
    const questions = generateQuestions('add_2d_nc', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a >= 10 && q.a <= 99, `a=${q.a} 不是兩位數`);
        assert(q.b >= 10 && q.b <= 99, `b=${q.b} 不是兩位數`);
    }
});

test(`所有題目答案正確 (a + b = answer)`, () => {
    const questions = generateQuestions('add_2d_nc', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.answer === q.a + q.b, `${q.a} + ${q.b} 應為 ${q.a + q.b}, 得到 ${q.answer}`);
    }
});

test(`所有題目無進位：個位和 < 10 且十位和 < 10`, () => {
    const questions = generateQuestions('add_2d_nc', SAMPLE_SIZE);
    for (const q of questions) {
        const da = digits(q.a), db = digits(q.b);
        assert(da.ones + db.ones < 10,
            `${q.a} + ${q.b}: 個位 ${da.ones}+${db.ones}=${da.ones + db.ones} >= 10，有進位！`);
        assert(da.tens + db.tens < 10,
            `${q.a} + ${q.b}: 十位 ${da.tens}+${db.tens}=${da.tens + db.tens} >= 10，有進位！`);
    }
});

// ========================================
// 測試 2: add_2d_c (兩位數加法，有進位)
// ========================================
console.log('');
console.log('📋 [add_2d_c] 兩位數加法 (有進位)');

test(`生成 ${SAMPLE_SIZE} 道題目，所有數字為兩位數`, () => {
    const questions = generateQuestions('add_2d_c', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a >= 10 && q.a <= 99, `a=${q.a} 不是兩位數`);
        assert(q.b >= 10 && q.b <= 99, `b=${q.b} 不是兩位數`);
    }
});

test(`所有題目答案正確`, () => {
    const questions = generateQuestions('add_2d_c', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.answer === q.a + q.b, `${q.a} + ${q.b} 應為 ${q.a + q.b}, 得到 ${q.answer}`);
    }
});

test(`所有題目有進位：個位和 >= 10`, () => {
    const questions = generateQuestions('add_2d_c', SAMPLE_SIZE);
    for (const q of questions) {
        const da = digits(q.a), db = digits(q.b);
        assert(da.ones + db.ones >= 10,
            `${q.a} + ${q.b}: 個位 ${da.ones}+${db.ones}=${da.ones + db.ones} < 10，無進位！`);
    }
});

// ========================================
// 測試 3: sub_2d_b (兩位數減法，有退位)
// ========================================
console.log('');
console.log('📋 [sub_2d_b] 兩位數減法 (有退位)');

test(`生成 ${SAMPLE_SIZE} 道題目，所有數字為兩位數`, () => {
    const questions = generateQuestions('sub_2d_b', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a >= 10 && q.a <= 99, `a=${q.a} 不是兩位數`);
        assert(q.b >= 10 && q.b <= 99, `b=${q.b} 不是兩位數`);
    }
});

test(`所有題目 a > b (結果為正)`, () => {
    const questions = generateQuestions('sub_2d_b', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a > q.b, `${q.a} <= ${q.b}`);
    }
});

test(`所有題目答案正確`, () => {
    const questions = generateQuestions('sub_2d_b', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.answer === q.a - q.b, `${q.a} - ${q.b} 應為 ${q.a - q.b}, 得到 ${q.answer}`);
    }
});

test(`所有題目有退位：被減數個位 < 減數個位`, () => {
    const questions = generateQuestions('sub_2d_b', SAMPLE_SIZE);
    for (const q of questions) {
        const da = digits(q.a), db = digits(q.b);
        assert(da.ones < db.ones,
            `${q.a} - ${q.b}: 個位 ${da.ones} >= ${db.ones}，無退位！`);
    }
});

// ========================================
// 測試 4: sub_3d_z_mid (三位數減法，跨零退位)
// ========================================
console.log('');
console.log('📋 [sub_3d_z_mid] 三位數減法 (跨零退位)');

test(`生成 ${SAMPLE_SIZE} 道題目，被減數為三位數且十位為 0`, () => {
    const questions = generateQuestions('sub_3d_z_mid', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a >= 100 && q.a <= 999, `a=${q.a} 不是三位數`);
        const da = digits(q.a);
        assert(da.tens === 0, `${q.a} 的十位 = ${da.tens}，不是 0`);
    }
});

test(`所有題目 a > b 且結果為正`, () => {
    const questions = generateQuestions('sub_3d_z_mid', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a > q.b, `${q.a} <= ${q.b}`);
        assert(q.answer > 0, `答案 ${q.answer} 不為正`);
    }
});

test(`所有題目答案正確`, () => {
    const questions = generateQuestions('sub_3d_z_mid', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.answer === q.a - q.b, `${q.a} - ${q.b} 應為 ${q.a - q.b}, 得到 ${q.answer}`);
    }
});

test(`減數的十位 > 0 (確保跨零退位)`, () => {
    const questions = generateQuestions('sub_3d_z_mid', SAMPLE_SIZE);
    for (const q of questions) {
        const db = digits(q.b);
        assert(db.tens > 0,
            `${q.a} - ${q.b}: 減數十位 = ${db.tens}，不需跨零退位`);
    }
});

// ========================================
// 測試 5: mul_2x2_nc_nc (兩位乘兩位，乘法無進位，相加無進位)
// ========================================
console.log('');
console.log('📋 [mul_2x2_nc_nc] 兩位乘兩位 (乘法無進位，相加無進位)');

test(`生成 ${SAMPLE_SIZE} 道題目，所有數字為兩位數`, () => {
    const questions = generateQuestions('mul_2x2_nc_nc', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a >= 10 && q.a <= 99, `a=${q.a} 不是兩位數`);
        assert(q.b >= 10 && q.b <= 99, `b=${q.b} 不是兩位數`);
    }
});

test(`所有題目答案正確`, () => {
    const questions = generateQuestions('mul_2x2_nc_nc', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.answer === q.a * q.b, `${q.a} × ${q.b} 應為 ${q.a * q.b}, 得到 ${q.answer}`);
    }
});

test(`乘法無進位: 所有 digit×digit < 10`, () => {
    const questions = generateQuestions('mul_2x2_nc_nc', SAMPLE_SIZE);
    for (const q of questions) {
        const a1 = Math.floor(q.a / 10), a0 = q.a % 10;
        const b1 = Math.floor(q.b / 10), b0 = q.b % 10;
        assert(a0 * b0 < 10, `${q.a}×${q.b}: a0*b0=${a0}*${b0}=${a0 * b0} >= 10`);
        assert(a0 * b1 < 10, `${q.a}×${q.b}: a0*b1=${a0}*${b1}=${a0 * b1} >= 10`);
        assert(a1 * b0 < 10, `${q.a}×${q.b}: a1*b0=${a1}*${b0}=${a1 * b0} >= 10`);
        assert(a1 * b1 < 10, `${q.a}×${q.b}: a1*b1=${a1}*${b1}=${a1 * b1} >= 10`);
    }
});

test(`相加無進位: 十位交叉乘積和 < 10`, () => {
    const questions = generateQuestions('mul_2x2_nc_nc', SAMPLE_SIZE);
    for (const q of questions) {
        const a1 = Math.floor(q.a / 10), a0 = q.a % 10;
        const b1 = Math.floor(q.b / 10), b0 = q.b % 10;
        const crossSum = a1 * b0 + a0 * b1;
        assert(crossSum < 10, `${q.a}×${q.b}: 交叉和 ${a1}*${b0}+${a0}*${b1}=${crossSum} >= 10`);
    }
});

// ========================================
// 測試 6: mul_2x2_c_c (兩位乘兩位，乘法有進位，相加有進位)
// ========================================
console.log('');
console.log('📋 [mul_2x2_c_c] 兩位乘兩位 (乘法有進位，相加有進位)');

test(`生成 ${SAMPLE_SIZE} 道題目，所有數字為兩位數`, () => {
    const questions = generateQuestions('mul_2x2_c_c', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a >= 10 && q.a <= 99, `a=${q.a} 不是兩位數`);
        assert(q.b >= 10 && q.b <= 99, `b=${q.b} 不是兩位數`);
    }
});

test(`所有題目答案正確`, () => {
    const questions = generateQuestions('mul_2x2_c_c', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.answer === q.a * q.b, `${q.a} × ${q.b} 應為 ${q.a * q.b}, 得到 ${q.answer}`);
    }
});

test(`乘法有進位: 至少一組 digit×digit >= 10`, () => {
    const questions = generateQuestions('mul_2x2_c_c', SAMPLE_SIZE);
    for (const q of questions) {
        const a1 = Math.floor(q.a / 10), a0 = q.a % 10;
        const b1 = Math.floor(q.b / 10), b0 = q.b % 10;
        const products = [a0 * b0, a0 * b1, a1 * b0, a1 * b1];
        const hasCarry = products.some(p => p >= 10);
        assert(hasCarry, `${q.a}×${q.b}: 所有乘積 [${products}] 都 < 10，無進位！`);
    }
});

test(`相加有進位: 十位部分和 >= 10`, () => {
    const questions = generateQuestions('mul_2x2_c_c', SAMPLE_SIZE);
    for (const q of questions) {
        const a1 = Math.floor(q.a / 10), a0 = q.a % 10;
        const b1 = Math.floor(q.b / 10), b0 = q.b % 10;
        const carryFromOnes = Math.floor(a0 * b0 / 10);
        const tensSum = a1 * b0 + a0 * b1 + carryFromOnes;
        assert(tensSum >= 10, `${q.a}×${q.b}: 十位和 = ${tensSum} < 10，無相加進位！`);
    }
});

// ========================================
// 測試 7: div_3d_1d_z0_mid (商中間有零)
// ========================================
console.log('');
console.log('📋 [div_3d_1d_z0_mid] 三位數÷一位數 (商中間有零)');

test(`生成 ${SAMPLE_SIZE} 道題目，被除數三位數、除數一位數`, () => {
    const questions = generateQuestions('div_3d_1d_z0_mid', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a >= 100 && q.a <= 999, `被除數 ${q.a} 不是三位數`);
        assert(q.b >= 2 && q.b <= 9, `除數 ${q.b} 不是 2~9`);
    }
});

test(`所有題目整除 (無餘數)`, () => {
    const questions = generateQuestions('div_3d_1d_z0_mid', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a % q.b === 0, `${q.a} ÷ ${q.b} 有餘數 ${q.a % q.b}`);
    }
});

test(`所有題目答案正確`, () => {
    const questions = generateQuestions('div_3d_1d_z0_mid', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.answer === q.a / q.b, `${q.a} ÷ ${q.b} 應為 ${q.a / q.b}, 得到 ${q.answer}`);
    }
});

test(`商的十位為 0 (中間有零)`, () => {
    const questions = generateQuestions('div_3d_1d_z0_mid', SAMPLE_SIZE);
    for (const q of questions) {
        const dq = digits(q.answer);
        assert(q.answer >= 100 && q.answer <= 999, `商 ${q.answer} 不是三位數`);
        assert(dq.tens === 0, `商 ${q.answer} 的十位 = ${dq.tens}，不是 0`);
    }
});

// ========================================
// 測試 8: div_3d_1d_z0_end (商尾數有零)
// ========================================
console.log('');
console.log('📋 [div_3d_1d_z0_end] 三位數÷一位數 (商尾數有零)');

test(`生成 ${SAMPLE_SIZE} 道題目，被除數三位數、除數一位數`, () => {
    const questions = generateQuestions('div_3d_1d_z0_end', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a >= 100 && q.a <= 999, `被除數 ${q.a} 不是三位數`);
        assert(q.b >= 2 && q.b <= 9, `除數 ${q.b} 不是 2~9`);
    }
});

test(`所有題目整除 (無餘數)`, () => {
    const questions = generateQuestions('div_3d_1d_z0_end', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.a % q.b === 0, `${q.a} ÷ ${q.b} 有餘數 ${q.a % q.b}`);
    }
});

test(`所有題目答案正確`, () => {
    const questions = generateQuestions('div_3d_1d_z0_end', SAMPLE_SIZE);
    for (const q of questions) {
        assert(q.answer === q.a / q.b, `${q.a} ÷ ${q.b} 應為 ${q.a / q.b}, 得到 ${q.answer}`);
    }
});

test(`商的個位為 0 (尾數有零)`, () => {
    const questions = generateQuestions('div_3d_1d_z0_end', SAMPLE_SIZE);
    for (const q of questions) {
        const dq = digits(q.answer);
        assert(dq.ones === 0, `商 ${q.answer} 的個位 = ${dq.ones}，不是 0`);
    }
});

// ========================================
// 測試 9: 綜合功能測試
// ========================================
console.log('');
console.log('📋 [綜合] 功能測試');

test(`所有 8 種標籤都能正確生成`, () => {
    for (const tag of ALL_TAGS) {
        const q = generateQuestion(tag);
        assert(q.tag === tag, `標籤不符: 預期 ${tag}, 得到 ${q.tag}`);
        assert(q.questionText, `questionText 為空`);
        assert(q.answer !== undefined, `answer 為 undefined`);
        assert(q.category, `category 為空`);
    }
});

test(`TAG_INFO 涵蓋所有 8 種標籤`, () => {
    assert(ALL_TAGS.length === 8, `應有 8 種標籤, 實際 ${ALL_TAGS.length}`);
    const expected = [
        'add_2d_nc', 'add_2d_c', 'sub_2d_b', 'sub_3d_z_mid',
        'mul_2x2_nc_nc', 'mul_2x2_c_c', 'div_3d_1d_z0_mid', 'div_3d_1d_z0_end'
    ];
    for (const t of expected) {
        assert(ALL_TAGS.includes(t), `缺少標籤 ${t}`);
    }
});

test(`每道題目都有完整的結構欄位`, () => {
    const requiredFields = ['tag', 'category', 'tagName', 'a', 'b', 'answer', 'questionText', 'symbol'];
    for (const tag of ALL_TAGS) {
        const q = generateQuestion(tag);
        for (const field of requiredFields) {
            assert(q[field] !== undefined, `標籤 ${tag} 缺少欄位 ${field}`);
        }
    }
});

// ========================================
// 測試 10: 範例輸出
// ========================================
console.log('');
console.log('📋 [範例] 每種標籤各一道題目');
console.log('');
console.log('  ┌──────────────────────┬──────────────────────┬────────┐');
console.log('  │ 標籤                 │ 題目                 │ 答案   │');
console.log('  ├──────────────────────┼──────────────────────┼────────┤');

for (const tag of ALL_TAGS) {
    const q = generateQuestion(tag);
    const tagStr = tag.padEnd(20);
    const textStr = q.questionText.padEnd(20);
    const ansStr = String(q.answer).padEnd(6);
    console.log(`  │ ${tagStr} │ ${textStr} │ ${ansStr} │`);
}

console.log('  └──────────────────────┴──────────────────────┴────────┘');

// ========================================
// 測試結果摘要
// ========================================
console.log('');
console.log('📊 ========================================');
console.log(`📊  測試結果: ${passed} 通過, ${failed} 失敗`);
console.log('📊 ========================================');

if (failed === 0) {
    console.log('');
    console.log('🎉 Phase 2 驗證全部通過！出題引擎運作正確！');
    console.log('');
} else {
    console.log('');
    console.log('⚠️  部分測試失敗，請檢查上方錯誤訊息。');
    console.log('');
    process.exit(1);
}
