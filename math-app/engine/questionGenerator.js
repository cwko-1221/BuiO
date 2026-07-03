/**
 * 自動出題引擎 (Question Generator)
 * 
 * 根據微能力指標標籤 (Tags) 隨機生成數學題目，
 * 確保數字生成符合各標籤的嚴格條件。
 * 
 * 支援的標籤:
 * [加法] add_2d_nc, add_2d_c, add_3d_nc, add_3d_c
 * [減法] sub_2d_nc, sub_2d_b, sub_3d_b, sub_3d_z_mid
 * [乘法] mul_2x1, mul_3x1, mul_2x2_nc_nc, mul_2x2_c_c
 * [除法] div_2d_1d, div_3d_1d_z0_mid, div_3d_1d_z0_end, div_3d_2d
 */

// ========================================
// 工具函數
// ========================================

/** 隨機整數 [min, max] */
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

// ========================================
// 標籤定義：中文名稱與類別
// ========================================
const TAG_INFO = {
    // ----- P1 tags -----
    add_wi18_nc:     { name: '2個數加法 (18以內、無進位)', category: '加法', symbol: '+' },
    add_wi18_c:      { name: '2個數加法 (18以內、有進位)', category: '加法', symbol: '+' },
    sub_wi18_nb:     { name: '2個數減法 (18以內、無退位)', category: '減法', symbol: '-' },
    add_2d_c_p1:     { name: '2個數加法 (2位數、有進位、和<100)', category: '加法', symbol: '+' },
    add_3n_2d_nc:    { name: '3個數加法 (2位數、無進位、和<100)', category: '加法', symbol: '+' },
    add_3n_2d_c:     { name: '3個數加法 (2位數、有進位、和<100)', category: '加法', symbol: '+' },
    // ----- P2 tags -----
    add_2n_3d_c:     { name: '2個數加法 (3位數、有進位、和<1000)', category: '加法', symbol: '+' },
    add_3n_3d_c:     { name: '3個數加法 (3位數、有進位、和<1000)', category: '加法', symbol: '+' },
    sub_2n_3d_nb:    { name: '2個數減法 (3位數、無退位)', category: '減法', symbol: '-' },
    sub_2n_3d_b:     { name: '2個數減法 (3位數、有退位)', category: '減法', symbol: '-' },
    mix_3n_3d_lr:    { name: '3個數加減混合 (3位數、由左至右、結果<1000)', category: '混合', symbol: '±' },
    mul_1x1_easy:    { name: '個位乘個位 (2/3/4/5/10 乘法表)', category: '乘法', symbol: '×' },
    mul_1x1_hard:    { name: '個位乘個位 (6/7/8/9 乘法表)', category: '乘法', symbol: '×' },
    div_table_nr:    { name: '表內除法 (無餘數)', category: '除法', symbol: '÷' },
    div_table_r:     { name: '表內除法 (有餘數，只寫商)', category: '除法', symbol: '÷' },
    // ----- P3 tags -----
    mul_2d_1d_nc:    { name: '2位數乘1位數 (無進位)', category: '乘法', symbol: '×' },
    mul_2d_1d_c:     { name: '2位數乘1位數 (有進位)', category: '乘法', symbol: '×' },
    mul_3d_1d_nc:    { name: '3位數乘1位數 (無進位)', category: '乘法', symbol: '×' },
    mul_3d_1d_c:     { name: '3位數乘1位數 (有進位)', category: '乘法', symbol: '×' },
    mul_3n:          { name: '3個數連乘', category: '乘法', symbol: '×' },
    div_2d_1d_r:     { name: '2位數÷1位數 (有餘數，只寫商)', category: '除法', symbol: '÷' },
    div_3d_1d_nr:    { name: '3位數÷1位數 (無餘數)', category: '除法', symbol: '÷' },
    div_3d_1d_r:     { name: '3位數÷1位數 (有餘數，只寫商)', category: '除法', symbol: '÷' },
    mix_3n_no_paren: { name: '3個數四則混合 (先乘除後加減、無括號)', category: '混合', symbol: '?' },
    mix_3n_paren:    { name: '3個數四則混合 (有小括號)', category: '混合', symbol: '?' },
    // ----- P4 tags -----
    mul_2d_2d_nc:    { name: '2位數乘2位數 (無進位)', category: '乘法', symbol: '×' },
    mul_2d_2d_c:     { name: '2位數乘2位數 (有進位)', category: '乘法', symbol: '×' },
    mul_3d_2d_nc:    { name: '3位數乘2位數 (無進位)', category: '乘法', symbol: '×' },
    mul_3d_2d_c:     { name: '3位數乘2位數 (有進位)', category: '乘法', symbol: '×' },
    div_2d_2d_b_nr:  { name: '2位數÷2位數 (有退位、無餘數)', category: '除法', symbol: '÷' },
    div_2d_2d_b_r:   { name: '2位數÷2位數 (有退位、有餘數，只寫商)', category: '除法', symbol: '÷' },
    div_3d_2d_b_nr:  { name: '3位數÷2位數 (有退位、無餘數)', category: '除法', symbol: '÷' },
    div_3d_2d_b_r:   { name: '3位數÷2位數 (有退位、有餘數，只寫商)', category: '除法', symbol: '÷' },
    mix_4n_paren:    { name: '4個數四則混合 (含小括號)', category: '混合', symbol: '?' },
    mix_4n_brackets: { name: '4個數四則混合 (含中括號)', category: '混合', symbol: '?' },
    // ----- Existing tags -----
    add_2d_nc:       { name: '兩位數加法 (無進位)', category: '加法', symbol: '+' },
    add_2d_c:        { name: '兩位數加法 (有進位)', category: '加法', symbol: '+' },
    add_3d_nc:       { name: '三位數加法 (無進位)', category: '加法', symbol: '+' },
    add_3d_c:        { name: '三位數加法 (有進位)', category: '加法', symbol: '+' },
    sub_2d_nc:       { name: '兩位數減法 (無退位)', category: '減法', symbol: '-' },
    sub_2d_b:        { name: '兩位數減法 (有退位)', category: '減法', symbol: '-' },
    sub_3d_b:        { name: '三位數減法 (有退位)', category: '減法', symbol: '-' },
    sub_3d_z_mid:    { name: '三位數減法 (跨零退位)', category: '減法', symbol: '-' },
    mul_2x1:         { name: '兩位數乘一位數', category: '乘法', symbol: '×' },
    mul_3x1:         { name: '三位數乘一位數', category: '乘法', symbol: '×' },
    mul_2x2_nc_nc:   { name: '兩位乘兩位 (乘法無進位，相加無進位)', category: '乘法', symbol: '×' },
    mul_2x2_c_c:     { name: '兩位乘兩位 (乘法有進位，相加有進位)', category: '乘法', symbol: '×' },
    div_2d_1d:       { name: '兩位數÷一位數 (整除)', category: '除法', symbol: '÷' },
    div_3d_1d_z0_mid:{ name: '三位數÷一位數 (商中間有零)', category: '除法', symbol: '÷' },
    div_3d_1d_z0_end:{ name: '三位數÷一位數 (商尾數有零)', category: '除法', symbol: '÷' },
    div_3d_2d:       { name: '三位數÷兩位數 (整除)', category: '除法', symbol: '÷' },
};

const ALL_TAGS = Object.keys(TAG_INFO);

// ========================================
// P1 出題邏輯
// ========================================

/** 2個數加法 (18以內、無進位) — 兩個個位數，和不進位 (和 ≤ 9) */
function generate_add_wi18_nc() {
    const a = randInt(1, 8);
    const b = randInt(1, 9 - a);
    return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
}

/** 2個數加法 (18以內、有進位) — 兩個個位數，和進位 (10 ≤ 和 ≤ 18) */
function generate_add_wi18_c() {
    const a = randInt(2, 9);
    const b = randInt(Math.max(1, 10 - a), 9);
    return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
}

/** 2個數減法 (18以內、無退位) — 被減數 ≤ 18，個位不退位 */
function generate_sub_wi18_nb() {
    // Mix of pure single-digit and (10-18)−(1-digit no-borrow) subtractions.
    if (Math.random() < 0.4) {
        const a = randInt(2, 9);
        const b = randInt(1, a);
        return { a, b, answer: a - b, text: `${a} - ${b}`, symbol: '-' };
    }
    const a = randInt(11, 18);
    const ones = a % 10;
    const b = randInt(1, Math.max(1, ones));
    return { a, b, answer: a - b, text: `${a} - ${b}`, symbol: '-' };
}

/** 2個數加法 (2位數、有進位、和<100) */
function generate_add_2d_c_p1() {
    for (let i = 0; i < 100; i++) {
        const a = randInt(10, 89);
        const b = randInt(10, 89);
        const da = digits(a), db = digits(b);
        if (da.ones + db.ones >= 10 && da.tens + db.tens <= 8 && a + b < 100) {
            return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
        }
    }
    // Fallback: hand-build a valid pair.
    const tensA = randInt(1, 3), tensB = randInt(1, 8 - tensA);
    const onesA = randInt(5, 9);
    const onesB = randInt(10 - onesA, 9);
    const a = tensA * 10 + onesA;
    const b = tensB * 10 + onesB;
    return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
}

/** 3個數加法 (2位數、無進位、和<100) */
function generate_add_3n_2d_nc() {
    // Split "10 across ones" and "10 across tens" budgets among 3 addends.
    const tensA = randInt(1, 7);
    const tensB = randInt(1, Math.max(1, 8 - tensA));
    const tensC = randInt(1, Math.max(1, 9 - tensA - tensB));
    const onesA = randInt(0, 7);
    const onesB = randInt(0, Math.max(0, 8 - onesA));
    const onesC = randInt(0, Math.max(0, 9 - onesA - onesB));
    const a = tensA * 10 + onesA;
    const b = tensB * 10 + onesB;
    const c = tensC * 10 + onesC;
    return { a, b, c, answer: a + b + c, text: `${a} + ${b} + ${c}`, symbol: '+' };
}

/** 3個數加法 (2位數、有進位、和<100) */
function generate_add_3n_2d_c() {
    for (let i = 0; i < 200; i++) {
        const a = randInt(10, 79);
        const b = randInt(10, 79);
        const c = randInt(10, 79);
        const da = digits(a), db = digits(b), dc = digits(c);
        const sum = a + b + c;
        if (sum < 100 && (da.ones + db.ones + dc.ones) >= 10) {
            return { a, b, c, answer: sum, text: `${a} + ${b} + ${c}`, symbol: '+' };
        }
    }
    // Fallback: 15 + 26 + 37 = 78 (ones 5+6+7=18 carry)
    return { a: 15, b: 26, c: 37, answer: 78, text: '15 + 26 + 37', symbol: '+' };
}

// ========================================
// P2 出題邏輯
// ========================================

/** 2個數加法 (3位數、有進位、和<1000) */
function generate_add_2n_3d_c() {
    for (let i = 0; i < 200; i++) {
        const a = randInt(100, 899);
        const b = randInt(100, 899);
        const da = digits(a), db = digits(b);
        if ((da.ones + db.ones >= 10 || da.tens + db.tens >= 10) && a + b < 1000) {
            return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
        }
    }
    return { a: 156, b: 279, answer: 435, text: '156 + 279', symbol: '+' };
}

/** 3個數加法 (3位數、有進位、和<1000) */
function generate_add_3n_3d_c() {
    for (let i = 0; i < 300; i++) {
        const a = randInt(100, 499);
        const b = randInt(100, 499);
        const c = randInt(100, 499);
        const sum = a + b + c;
        if (sum >= 1000) continue;
        const da = digits(a), db = digits(b), dc = digits(c);
        if ((da.ones + db.ones + dc.ones) >= 10 || (da.tens + db.tens + dc.tens) >= 10) {
            return { a, b, c, answer: sum, text: `${a} + ${b} + ${c}`, symbol: '+' };
        }
    }
    return { a: 158, b: 276, c: 195, answer: 629, text: '158 + 276 + 195', symbol: '+' };
}

/** 2個數減法 (3位數、無退位) */
function generate_sub_2n_3d_nb() {
    for (let i = 0; i < 200; i++) {
        const a = randInt(100, 999);
        const b = randInt(100, a);
        if (a === b) continue;
        const da = digits(a), db = digits(b);
        if (da.ones >= db.ones && da.tens >= db.tens && da.hundreds >= db.hundreds) {
            return { a, b, answer: a - b, text: `${a} - ${b}`, symbol: '-' };
        }
    }
    return { a: 685, b: 342, answer: 343, text: '685 - 342', symbol: '-' };
}

/** 2個數減法 (3位數、有退位) */
function generate_sub_2n_3d_b() {
    for (let i = 0; i < 200; i++) {
        const a = randInt(200, 999);
        const b = randInt(100, a - 1);
        const da = digits(a), db = digits(b);
        if (da.ones < db.ones || da.tens < db.tens) {
            return { a, b, answer: a - b, text: `${a} - ${b}`, symbol: '-' };
        }
    }
    return { a: 523, b: 278, answer: 245, text: '523 - 278', symbol: '-' };
}

/** 3個數加減混合 (3位數、由左至右、結果<1000) */
function generate_mix_3n_3d_lr() {
    for (let i = 0; i < 300; i++) {
        const a = randInt(200, 800);
        const op1 = Math.random() < 0.5 ? '+' : '-';
        const b = randInt(100, 400);
        const step1 = op1 === '+' ? a + b : a - b;
        if (step1 < 100 || step1 >= 1000) continue;
        const op2 = Math.random() < 0.5 ? '+' : '-';
        const c = randInt(50, 300);
        const step2 = op2 === '+' ? step1 + c : step1 - c;
        if (step2 > 0 && step2 < 1000) {
            return { a, b, c, answer: step2, text: `${a} ${op1} ${b} ${op2} ${c}`, symbol: '±' };
        }
    }
    return { a: 500, b: 200, c: 150, answer: 550, text: '500 + 200 - 150', symbol: '±' };
}

/** 個位乘個位 (2/3/4/5/10 乘法表) */
function generate_mul_1x1_easy() {
    const factors = [2, 3, 4, 5, 10];
    const a = factors[randInt(0, factors.length - 1)];
    const b = randInt(1, 9);
    return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
}

/** 個位乘個位 (6/7/8/9 乘法表) */
function generate_mul_1x1_hard() {
    const factors = [6, 7, 8, 9];
    const a = factors[randInt(0, factors.length - 1)];
    const b = randInt(1, 9);
    return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
}

/** 表內除法 (無餘數) */
function generate_div_table_nr() {
    const b = randInt(2, 9);
    const quotient = randInt(1, 9);
    const a = b * quotient;
    return { a, b, answer: quotient, text: `${a} ÷ ${b}`, symbol: '÷' };
}

/** 表內除法 (有餘數，只寫商) */
function generate_div_table_r() {
    const b = randInt(3, 9);
    const quotient = randInt(1, 9);
    const remainder = randInt(1, b - 1);
    const a = b * quotient + remainder;
    return { a, b, answer: quotient, remainder,
             text: `${a} ÷ ${b} (只寫商)`, symbol: '÷' };
}

// ========================================
// P3 出題邏輯
// ========================================

/** 2位數乘1位數 (無進位) */
function generate_mul_2d_1d_nc() {
    for (let i = 0; i < 100; i++) {
        const b = randInt(2, 9);
        const tens = randInt(1, Math.floor(9 / b));
        const ones = randInt(0, Math.floor(9 / b));
        const a = tens * 10 + ones;
        if (a >= 10 && a * b < 100) {
            return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
        }
    }
    return { a: 12, b: 3, answer: 36, text: '12 × 3', symbol: '×' };
}

/** 2位數乘1位數 (有進位) */
function generate_mul_2d_1d_c() {
    for (let i = 0; i < 200; i++) {
        const a = randInt(10, 99);
        const b = randInt(2, 9);
        const da = digits(a);
        if (da.ones * b >= 10 || da.tens * b >= 10) {
            return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
        }
    }
    return { a: 48, b: 6, answer: 288, text: '48 × 6', symbol: '×' };
}

/** 3位數乘1位數 (無進位) */
function generate_mul_3d_1d_nc() {
    for (let i = 0; i < 100; i++) {
        const b = randInt(2, 9);
        const hundreds = randInt(1, Math.floor(9 / b));
        const tens = randInt(0, Math.floor(9 / b));
        const ones = randInt(0, Math.floor(9 / b));
        const a = hundreds * 100 + tens * 10 + ones;
        if (a >= 100) return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
    }
    return { a: 123, b: 3, answer: 369, text: '123 × 3', symbol: '×' };
}

/** 3位數乘1位數 (有進位) */
function generate_mul_3d_1d_c() {
    for (let i = 0; i < 200; i++) {
        const a = randInt(100, 999);
        const b = randInt(2, 9);
        const da = digits(a);
        if (da.ones * b >= 10 || da.tens * b >= 10 || da.hundreds * b >= 10) {
            return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
        }
    }
    return { a: 456, b: 7, answer: 3192, text: '456 × 7', symbol: '×' };
}

/** 3個數連乘 (結果不太大) */
function generate_mul_3n() {
    for (let i = 0; i < 100; i++) {
        const a = randInt(2, 9);
        const b = randInt(2, 9);
        const c = randInt(2, 9);
        if (a * b * c <= 500) {
            return { a, b, c, answer: a * b * c, text: `${a} × ${b} × ${c}`, symbol: '×' };
        }
    }
    return { a: 2, b: 3, c: 5, answer: 30, text: '2 × 3 × 5', symbol: '×' };
}

/** 2位數÷1位數 (有餘數，只寫商) */
function generate_div_2d_1d_r() {
    const b = randInt(2, 9);
    const quotient = randInt(2, Math.floor(99 / b));
    const remainder = randInt(1, b - 1);
    const a = b * quotient + remainder;
    return { a, b, answer: quotient, remainder,
             text: `${a} ÷ ${b} (只寫商)`, symbol: '÷' };
}

/** 3位數÷1位數 (無餘數) */
function generate_div_3d_1d_nr() {
    for (let i = 0; i < 100; i++) {
        const b = randInt(2, 9);
        const quotient = randInt(20, 199);
        const a = b * quotient;
        if (a >= 100 && a <= 999) {
            return { a, b, answer: quotient, text: `${a} ÷ ${b}`, symbol: '÷' };
        }
    }
    return { a: 246, b: 3, answer: 82, text: '246 ÷ 3', symbol: '÷' };
}

/** 3位數÷1位數 (有餘數，只寫商) */
function generate_div_3d_1d_r() {
    const b = randInt(2, 9);
    for (let i = 0; i < 50; i++) {
        const quotient = randInt(20, 199);
        const remainder = randInt(1, b - 1);
        const a = b * quotient + remainder;
        if (a >= 100 && a <= 999) {
            return { a, b, answer: quotient, remainder,
                     text: `${a} ÷ ${b} (只寫商)`, symbol: '÷' };
        }
    }
    return { a: 247, b: 3, answer: 82, remainder: 1,
             text: '247 ÷ 3 (只寫商)', symbol: '÷' };
}

/** 3個數四則混合 (先乘除後加減、無括號) */
function generate_mix_3n_no_paren() {
    // Structure: a + b * c or a - b * c or similar
    for (let i = 0; i < 100; i++) {
        const structure = randInt(0, 3);
        const a = randInt(5, 50);
        const b = randInt(2, 9);
        const c = randInt(2, 9);
        let text, answer;
        if (structure === 0) { text = `${a} + ${b} × ${c}`; answer = a + b * c; }
        else if (structure === 1) { text = `${a} - ${b} × ${c}`; answer = a - b * c; }
        else if (structure === 2) { text = `${b} × ${c} + ${a}`; answer = b * c + a; }
        else { text = `${b} × ${c} - ${a}`; answer = b * c - a; }
        if (answer > 0 && answer < 200) {
            return { a, b, c, answer, text, symbol: '?' };
        }
    }
    return { a: 5, b: 3, c: 4, answer: 17, text: '5 + 3 × 4', symbol: '?' };
}

/** 3個數四則混合 (有小括號) */
function generate_mix_3n_paren() {
    for (let i = 0; i < 100; i++) {
        const structure = randInt(0, 3);
        const a = randInt(2, 20);
        const b = randInt(2, 20);
        const c = randInt(2, 9);
        let text, answer;
        if (structure === 0) { text = `(${a} + ${b}) × ${c}`; answer = (a + b) * c; }
        else if (structure === 1) { text = `(${a} - ${b}) × ${c}`; answer = (a - b) * c; }
        else if (structure === 2) { text = `${c} × (${a} + ${b})`; answer = c * (a + b); }
        else { text = `${c} × (${a} - ${b})`; answer = c * (a - b); }
        if (answer > 0 && answer < 300) {
            return { a, b, c, answer, text, symbol: '?' };
        }
    }
    return { a: 5, b: 3, c: 4, answer: 32, text: '(5 + 3) × 4', symbol: '?' };
}

// ========================================
// P4 出題邏輯
// ========================================

/** 2位數乘2位數 (無進位) — 所有部分積 < 10, 相加不進位 */
function generate_mul_2d_2d_nc() {
    for (let i = 0; i < 300; i++) {
        const a = randInt(11, 99);
        const b = randInt(11, 99);
        const da = digits(a), db = digits(b);
        if (da.ones * db.ones < 10 &&
            da.ones * db.tens < 10 &&
            da.tens * db.ones < 10 &&
            da.tens * db.tens < 10) {
            return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
        }
    }
    return { a: 12, b: 13, answer: 156, text: '12 × 13', symbol: '×' };
}

/** 2位數乘2位數 (有進位) */
function generate_mul_2d_2d_c() {
    for (let i = 0; i < 100; i++) {
        const a = randInt(11, 99);
        const b = randInt(11, 99);
        const da = digits(a), db = digits(b);
        if (da.ones * db.ones >= 10 ||
            da.tens * db.ones >= 10 ||
            da.ones * db.tens >= 10) {
            return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
        }
    }
    return { a: 48, b: 25, answer: 1200, text: '48 × 25', symbol: '×' };
}

/** 3位數乘2位數 (無進位) */
function generate_mul_3d_2d_nc() {
    for (let i = 0; i < 300; i++) {
        const a = randInt(101, 999);
        const b = randInt(11, 99);
        const da = digits(a), db = digits(b);
        if (da.ones * db.ones < 10 && da.tens * db.ones < 10 && da.hundreds * db.ones < 10 &&
            da.ones * db.tens < 10 && da.tens * db.tens < 10 && da.hundreds * db.tens < 10) {
            return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
        }
    }
    return { a: 123, b: 12, answer: 1476, text: '123 × 12', symbol: '×' };
}

/** 3位數乘2位數 (有進位) */
function generate_mul_3d_2d_c() {
    for (let i = 0; i < 100; i++) {
        const a = randInt(101, 999);
        const b = randInt(11, 99);
        const da = digits(a), db = digits(b);
        if (da.ones * db.ones >= 10 || da.tens * db.ones >= 10 ||
            da.hundreds * db.ones >= 10 || da.ones * db.tens >= 10 ||
            da.tens * db.tens >= 10 || da.hundreds * db.tens >= 10) {
            return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
        }
    }
    return { a: 456, b: 78, answer: 35568, text: '456 × 78', symbol: '×' };
}

/** 2位數÷2位數 (有退位、無餘數) — 商 2..9 */
function generate_div_2d_2d_b_nr() {
    const b = randInt(11, 49);
    const quotient = randInt(2, Math.min(9, Math.floor(99 / b)));
    const a = b * quotient;
    return { a, b, answer: quotient, text: `${a} ÷ ${b}`, symbol: '÷' };
}

/** 2位數÷2位數 (有退位、有餘數，只寫商) */
function generate_div_2d_2d_b_r() {
    const b = randInt(11, 49);
    const quotient = randInt(2, Math.min(9, Math.floor(99 / b)));
    const remainder = randInt(1, b - 1);
    const a = b * quotient + remainder;
    if (a > 99) return { a: 87, b: 13, answer: 6, remainder: 9, text: '87 ÷ 13 (只寫商)', symbol: '÷' };
    return { a, b, answer: quotient, remainder, text: `${a} ÷ ${b} (只寫商)`, symbol: '÷' };
}

/** 3位數÷2位數 (有退位、無餘數) */
function generate_div_3d_2d_b_nr() {
    for (let i = 0; i < 100; i++) {
        const b = randInt(11, 99);
        const quotient = randInt(10, Math.floor(999 / b));
        const a = b * quotient;
        if (a >= 100 && a <= 999) {
            return { a, b, answer: quotient, text: `${a} ÷ ${b}`, symbol: '÷' };
        }
    }
    return { a: 552, b: 24, answer: 23, text: '552 ÷ 24', symbol: '÷' };
}

/** 3位數÷2位數 (有退位、有餘數，只寫商) */
function generate_div_3d_2d_b_r() {
    for (let i = 0; i < 100; i++) {
        const b = randInt(11, 99);
        const quotient = randInt(10, Math.floor(999 / b));
        const remainder = randInt(1, b - 1);
        const a = b * quotient + remainder;
        if (a >= 100 && a <= 999) {
            return { a, b, answer: quotient, remainder,
                     text: `${a} ÷ ${b} (只寫商)`, symbol: '÷' };
        }
    }
    return { a: 555, b: 24, answer: 23, remainder: 3, text: '555 ÷ 24 (只寫商)', symbol: '÷' };
}

/** 4個數四則混合 (含小括號) */
function generate_mix_4n_paren() {
    const templates = [
        // (a + b) × c - d
        () => { const a=randInt(3,20), b=randInt(3,20), c=randInt(2,9), d=randInt(5,50);
                return { text: `(${a} + ${b}) × ${c} - ${d}`, answer: (a+b)*c - d }; },
        // (a - b) × c + d
        () => { const b=randInt(2,10), a=b+randInt(2,15), c=randInt(2,9), d=randInt(5,30);
                return { text: `(${a} - ${b}) × ${c} + ${d}`, answer: (a-b)*c + d }; },
        // a × (b + c) - d
        () => { const a=randInt(2,9), b=randInt(3,15), c=randInt(3,15), d=randInt(5,30);
                return { text: `${a} × (${b} + ${c}) - ${d}`, answer: a*(b+c) - d }; },
        // (a + b) × (c - d)
        () => { const a=randInt(3,15), b=randInt(3,15), d=randInt(2,7), c=d+randInt(2,7);
                return { text: `(${a} + ${b}) × (${c} - ${d})`, answer: (a+b)*(c-d) }; },
        // a + b × (c + d)
        () => { const a=randInt(5,30), b=randInt(2,9), c=randInt(3,15), d=randInt(3,15);
                return { text: `${a} + ${b} × (${c} + ${d})`, answer: a + b*(c+d) }; },
    ];
    for (let i = 0; i < 30; i++) {
        const res = templates[randInt(0, templates.length - 1)]();
        if (res.answer > 0 && res.answer < 1000) return { ...res, symbol: '?' };
    }
    return { text: '(5 + 3) × 4 - 8', answer: 24, symbol: '?' };
}

/** 4個數四則混合 (含中括號) */
function generate_mix_4n_brackets() {
    const templates = [
        // [(a + b) × c] - d
        () => { const a=randInt(3,15), b=randInt(3,15), c=randInt(2,9), d=randInt(5,50);
                return { text: `[(${a} + ${b}) × ${c}] - ${d}`, answer: (a+b)*c - d }; },
        // [a × (b + c)] + d
        () => { const a=randInt(2,9), b=randInt(3,15), c=randInt(3,15), d=randInt(5,30);
                return { text: `[${a} × (${b} + ${c})] + ${d}`, answer: a*(b+c) + d }; },
        // [a + b × c] - d  (bracket wraps precedence)
        () => { const a=randInt(5,30), b=randInt(2,9), c=randInt(2,9), d=randInt(5,30);
                return { text: `[${a} + ${b} × ${c}] - ${d}`, answer: (a + b*c) - d }; },
        // [(a - b) × c] + d
        () => { const b=randInt(2,10), a=b+randInt(2,15), c=randInt(2,9), d=randInt(5,30);
                return { text: `[(${a} - ${b}) × ${c}] + ${d}`, answer: (a-b)*c + d }; },
    ];
    for (let i = 0; i < 30; i++) {
        const res = templates[randInt(0, templates.length - 1)]();
        if (res.answer > 0 && res.answer < 1000) return { ...res, symbol: '?' };
    }
    return { text: '[(5 + 3) × 4] - 8', answer: 24, symbol: '?' };
}

// ========================================
// 出題邏輯：加法
// ========================================

/**
 * add_2d_nc: 兩位數加法 (無進位)
 * 條件: 個位數相加 < 10，十位數相加 < 10
 */
function generate_add_2d_nc() {
    let a, b;
    const MAX_ATTEMPTS = 100;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        a = randInt(10, 99);
        b = randInt(10, 99);
        const da = digits(a);
        const db = digits(b);
        // 個位不進位 且 十位不進位
        if (da.ones + db.ones < 10 && da.tens + db.tens < 10) {
            return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
        }
    }
    // 保底：使用確保無進位的數字
    a = randInt(1, 4) * 10 + randInt(0, 4); // 10~44
    b = randInt(1, 4) * 10 + randInt(0, 4); // 10~44
    // 確保個位和不超過 9
    const da = digits(a);
    b = randInt(1, 9 - da.tens) * 10 + randInt(0, 9 - da.ones);
    if (b < 10) b = 10;
    return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
}

/**
 * add_2d_c: 兩位數加法 (有進位)
 * 條件: 個位數相加 >= 10（必須有進位）
 */
function generate_add_2d_c() {
    let a, b;
    const MAX_ATTEMPTS = 100;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        a = randInt(10, 99);
        b = randInt(10, 99);
        const da = digits(a);
        const db = digits(b);
        // 個位相加 >= 10（有進位）
        if (da.ones + db.ones >= 10) {
            return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
        }
    }
    // 保底
    a = randInt(1, 9) * 10 + randInt(5, 9);
    b = randInt(1, 9) * 10 + randInt(10 - (a % 10), 9);
    return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
}

/**
 * add_3d_nc: 三位數加法 (無進位)
 * 條件: 個位、十位、百位相加都 < 10
 */
function generate_add_3d_nc() {
    const hundredsA = randInt(1, 8);
    const hundredsB = randInt(1, 9 - hundredsA);
    const tensA = randInt(0, 9);
    const tensB = randInt(0, 9 - tensA);
    const onesA = randInt(0, 9);
    const onesB = randInt(0, 9 - onesA);
    const a = hundredsA * 100 + tensA * 10 + onesA;
    const b = hundredsB * 100 + tensB * 10 + onesB;
    return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
}

/**
 * add_3d_c: 三位數加法 (有進位)
 * 條件: 至少個位或十位有進位
 */
function generate_add_3d_c() {
    const MAX_ATTEMPTS = 100;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const a = randInt(100, 899);
        const b = randInt(100, 899);
        const da = digits(a);
        const db = digits(b);
        if (da.ones + db.ones >= 10 || da.tens + db.tens >= 10) {
            return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
        }
    }
    const a = randInt(100, 899);
    const b = Math.min(899, 100 + (10 - (a % 10)));
    return { a, b, answer: a + b, text: `${a} + ${b}`, symbol: '+' };
}

// ========================================
// 出題邏輯：減法
// ========================================

/**
 * sub_2d_nc: 兩位數減法 (無退位)
 * 條件: 被減數 > 減數，個位與十位都不用退位
 */
function generate_sub_2d_nc() {
    const tensA = randInt(2, 9);
    const tensB = randInt(1, tensA);
    const onesA = randInt(0, 9);
    const onesB = randInt(0, onesA);
    const a = tensA * 10 + onesA;
    let b = tensB * 10 + onesB;
    if (b >= a) b = (tensA - 1) * 10 + onesB;
    return { a, b, answer: a - b, text: `${a} - ${b}`, symbol: '-' };
}

/**
 * sub_2d_b: 兩位數減法 (有退位)
 * 條件: 被減數 > 減數 (結果為正)，個位需要退位 (被減數個位 < 減數個位)
 */
function generate_sub_2d_b() {
    let a, b;
    const MAX_ATTEMPTS = 100;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        a = randInt(20, 99); // 至少 20 才能退位後十位 >= 1
        b = randInt(10, 98);
        const da = digits(a);
        const db = digits(b);
        // a > b 且 個位需要退位
        if (a > b && da.ones < db.ones) {
            return { a, b, answer: a - b, text: `${a} - ${b}`, symbol: '-' };
        }
    }
    // 保底：手動構造有退位的情況
    const tensA = randInt(3, 9);
    const onesA = randInt(0, 3);
    a = tensA * 10 + onesA;
    const onesB = randInt(onesA + 1, 9);
    const tensB = randInt(1, tensA - 1); // 確保 a > b
    b = tensB * 10 + onesB;
    return { a, b, answer: a - b, text: `${a} - ${b}`, symbol: '-' };
}

/**
 * sub_3d_b: 三位數減法 (有退位)
 * 條件: 被減數 > 減數，至少個位或十位需要退位
 */
function generate_sub_3d_b() {
    const MAX_ATTEMPTS = 200;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const a = randInt(200, 999);
        const b = randInt(100, a - 1);
        const da = digits(a);
        const db = digits(b);
        if (da.ones < db.ones || da.tens < db.tens) {
            return { a, b, answer: a - b, text: `${a} - ${b}`, symbol: '-' };
        }
    }
    return { a: 532, b: 278, answer: 254, text: '532 - 278', symbol: '-' };
}

/**
 * sub_3d_z_mid: 三位數減法 (跨零退位)
 * 條件: 被減數十位為 0 (如 504, 302, 801)
 *       減數的十位或個位導致需要跨過十位的零來退位
 *       例如: 504 - 127 = 377
 */
function generate_sub_3d_z_mid() {
    let a, b;
    const MAX_ATTEMPTS = 200;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        // 被減數: 百位 1~9, 十位固定為 0, 個位 0~9
        const hundreds = randInt(1, 9);
        const ones = randInt(0, 9);
        a = hundreds * 100 + ones; // 十位為 0，如 504, 301, 802

        // 減數: 需要讓十位發生退位（跨零退位）
        // 減數的十位 > 0（這樣才會需要從十位借位，而十位是 0 需要再往百位借）
        const bHundreds = randInt(1, hundreds - 1 > 0 ? hundreds - 1 : 1);
        const bTens = randInt(1, 9); // 十位 > 0 才能觸發跨零退位
        const bOnes = randInt(0, 9);
        b = bHundreds * 100 + bTens * 10 + bOnes;

        // 確保 a > b 且結果為正
        if (a > b && b >= 100) {
            // 驗證確實需要跨零退位：
            // 被減數十位(0) < 減數十位(bTens)，需要從百位借位
            // 或被減數個位 < 減數個位 也需要借位，然後十位是 0 要再往百位借
            const needBorrowOnes = (ones < bOnes);
            const effectiveTens = needBorrowOnes ? -1 : 0; // 十位是0，如果個位借了就變 -1
            // 不管哪種情況，十位是 0 又需要被借，一定要跨零退位
            if (bTens > 0) { // 減數十位 > 0，一定跨零
                return { a, b, answer: a - b, text: `${a} - ${b}`, symbol: '-' };
            }
        }
    }
    // 保底
    a = 504;
    b = 127;
    return { a, b, answer: a - b, text: `${a} - ${b}`, symbol: '-' };
}

// ========================================
// 出題邏輯：乘法
// ========================================

/**
 * mul_2x1: 兩位數乘一位數
 */
function generate_mul_2x1() {
    const a = randInt(12, 99);
    const b = randInt(2, 9);
    return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
}

/**
 * mul_3x1: 三位數乘一位數
 */
function generate_mul_3x1() {
    const a = randInt(101, 999);
    const b = randInt(2, 9);
    return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
}

/**
 * mul_2x2_nc_nc: 兩位乘兩位 (乘法無進位，相加無進位)
 * 
 * 設 a = 10*a1 + a0, b = 10*b1 + b0
 * 乘法無進位條件: a0*b0 < 10, a0*b1 < 10, a1*b0 < 10, a1*b1 < 10
 * 相加無進位條件: a1*b0 + a0*b1 < 10 (十位的部分和不進位)
 */
function generate_mul_2x2_nc_nc() {
    // 預先計算所有合法的 (a, b) 組合，然後隨機抽取
    const valid = [];
    for (let a = 10; a <= 99; a++) {
        for (let b = 10; b <= 99; b++) {
            const a1 = Math.floor(a / 10), a0 = a % 10;
            const b1 = Math.floor(b / 10), b0 = b % 10;

            // 乘法無進位: 每個單位數乘積 < 10
            if (a0 * b0 >= 10) continue;
            if (a0 * b1 >= 10) continue;
            if (a1 * b0 >= 10) continue;
            if (a1 * b1 >= 10) continue;

            // 相加無進位: 十位的交叉乘積和 < 10
            if (a1 * b0 + a0 * b1 >= 10) continue;

            // 排除乘以整十數（太簡單）和任一數個位為0的情況
            if (a0 === 0 || b0 === 0) continue;

            valid.push({ a, b });
        }
    }

    if (valid.length === 0) {
        // 理論上不會發生，硬編碼一個
        return { a: 12, b: 13, answer: 156, text: '12 × 13', symbol: '×' };
    }

    const pick = valid[randInt(0, valid.length - 1)];
    return {
        a: pick.a,
        b: pick.b,
        answer: pick.a * pick.b,
        text: `${pick.a} × ${pick.b}`,
        symbol: '×'
    };
}

/**
 * mul_2x2_c_c: 兩位乘兩位 (乘法有進位，相加有進位)
 * 
 * 乘法有進位: 至少一個 a_i * b_j >= 10
 * 相加有進位: 十位的交叉乘積和 >= 10
 */
function generate_mul_2x2_c_c() {
    let a, b;
    const MAX_ATTEMPTS = 200;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        a = randInt(12, 99);
        b = randInt(12, 99);
        const a1 = Math.floor(a / 10), a0 = a % 10;
        const b1 = Math.floor(b / 10), b0 = b % 10;

        if (a0 === 0 || b0 === 0) continue;

        // 乘法有進位: 至少一組 digit * digit >= 10
        const products = [a0 * b0, a0 * b1, a1 * b0, a1 * b1];
        const hasMultiplyCarry = products.some(p => p >= 10);

        // 相加有進位: 計算直式乘法的進位
        // 第一列部分積: a * b0
        // 第二列部分積: a * b1 (左移一位)
        // 十位交叉和: a1*b0 + a0*b1 + (a0*b0 的進位)
        const carryFromOnes = Math.floor(a0 * b0 / 10);
        const tensSum = a1 * b0 + a0 * b1 + carryFromOnes;
        const hasAddCarry = tensSum >= 10;

        if (hasMultiplyCarry && hasAddCarry) {
            return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
        }
    }
    // 保底
    a = 56; b = 78;
    return { a, b, answer: a * b, text: `${a} × ${b}`, symbol: '×' };
}

// ========================================
// 出題邏輯：除法
// ========================================

/**
 * div_2d_1d: 兩位數除以一位數 (整除)
 * 策略: 反向生成。先決定除數和商，再算出被除數。
 */
function generate_div_2d_1d() {
    const MAX_ATTEMPTS = 100;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const divisor = randInt(2, 9);
        const quotient = randInt(2, 49);
        const dividend = divisor * quotient;
        if (dividend >= 10 && dividend <= 99) {
            return { a: dividend, b: divisor, answer: quotient, text: `${dividend} ÷ ${divisor}`, symbol: '÷' };
        }
    }
    return { a: 84, b: 7, answer: 12, text: '84 ÷ 7', symbol: '÷' };
}

/**
 * div_3d_1d_z0_mid: 三位數除以一位數 (商的中間有零)
 * 例如: 412 ÷ 4 = 103
 * 
 * 策略: 反向生成。先決定除數和商(中間有零)，再算出被除數。
 */
function generate_div_3d_1d_z0_mid() {
    const MAX_ATTEMPTS = 200;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const divisor = randInt(2, 9);

        // 商的十位為 0，形式: h * 100 + 0 * 10 + u = h * 100 + u
        const qHundreds = randInt(1, 9);
        const qOnes = randInt(1, 9);
        const quotient = qHundreds * 100 + qOnes;

        const dividend = divisor * quotient;

        // 確保被除數是三位數
        if (dividend >= 100 && dividend <= 999) {
            return {
                a: dividend,
                b: divisor,
                answer: quotient,
                text: `${dividend} ÷ ${divisor}`,
                symbol: '÷'
            };
        }
    }
    // 保底
    return { a: 412, b: 4, answer: 103, text: '412 ÷ 4', symbol: '÷' };
}

/**
 * div_3d_1d_z0_end: 三位數除以一位數 (商的尾數有零)
 * 例如: 640 ÷ 8 = 80
 * 
 * 策略: 反向生成。商的個位為 0。
 */
function generate_div_3d_1d_z0_end() {
    const MAX_ATTEMPTS = 200;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const divisor = randInt(2, 9);

        // 商的個位為 0，形式可以是兩位數或三位數末尾為 0
        // 兩位數: t * 10，如 80, 90
        // 三位數: h * 100 + t * 10，如 110, 120
        let quotient;
        if (Math.random() < 0.5) {
            // 兩位數商 (末尾0): 20, 30, ..., 90
            quotient = randInt(2, 9) * 10;
        } else {
            // 三位數商 (末尾0): 110, 120, ..., 990
            const qHundreds = randInt(1, 9);
            const qTens = randInt(1, 9);
            quotient = qHundreds * 100 + qTens * 10;
        }

        const dividend = divisor * quotient;

        // 確保被除數是三位數
        if (dividend >= 100 && dividend <= 999) {
            return {
                a: dividend,
                b: divisor,
                answer: quotient,
                text: `${dividend} ÷ ${divisor}`,
                symbol: '÷'
            };
        }
    }
    // 保底
    return { a: 640, b: 8, answer: 80, text: '640 ÷ 8', symbol: '÷' };
}

/**
 * div_3d_2d: 三位數除以兩位數 (整除)
 * 策略: 反向生成。商控制在 2~30，確保被除數為三位數。
 */
function generate_div_3d_2d() {
    const MAX_ATTEMPTS = 200;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        const divisor = randInt(10, 49);
        const quotient = randInt(2, 30);
        const dividend = divisor * quotient;
        if (dividend >= 100 && dividend <= 999) {
            return { a: dividend, b: divisor, answer: quotient, text: `${dividend} ÷ ${divisor}`, symbol: '÷' };
        }
    }
    return { a: 432, b: 24, answer: 18, text: '432 ÷ 24', symbol: '÷' };
}

// ========================================
// 主生成函數
// ========================================

const GENERATORS = {
    // P1
    add_wi18_nc: generate_add_wi18_nc,
    add_wi18_c: generate_add_wi18_c,
    sub_wi18_nb: generate_sub_wi18_nb,
    add_2d_c_p1: generate_add_2d_c_p1,
    add_3n_2d_nc: generate_add_3n_2d_nc,
    add_3n_2d_c: generate_add_3n_2d_c,
    // P2
    add_2n_3d_c: generate_add_2n_3d_c,
    add_3n_3d_c: generate_add_3n_3d_c,
    sub_2n_3d_nb: generate_sub_2n_3d_nb,
    sub_2n_3d_b: generate_sub_2n_3d_b,
    mix_3n_3d_lr: generate_mix_3n_3d_lr,
    mul_1x1_easy: generate_mul_1x1_easy,
    mul_1x1_hard: generate_mul_1x1_hard,
    div_table_nr: generate_div_table_nr,
    div_table_r: generate_div_table_r,
    // P3
    mul_2d_1d_nc: generate_mul_2d_1d_nc,
    mul_2d_1d_c: generate_mul_2d_1d_c,
    mul_3d_1d_nc: generate_mul_3d_1d_nc,
    mul_3d_1d_c: generate_mul_3d_1d_c,
    mul_3n: generate_mul_3n,
    div_2d_1d_r: generate_div_2d_1d_r,
    div_3d_1d_nr: generate_div_3d_1d_nr,
    div_3d_1d_r: generate_div_3d_1d_r,
    mix_3n_no_paren: generate_mix_3n_no_paren,
    mix_3n_paren: generate_mix_3n_paren,
    // P4
    mul_2d_2d_nc: generate_mul_2d_2d_nc,
    mul_2d_2d_c: generate_mul_2d_2d_c,
    mul_3d_2d_nc: generate_mul_3d_2d_nc,
    mul_3d_2d_c: generate_mul_3d_2d_c,
    div_2d_2d_b_nr: generate_div_2d_2d_b_nr,
    div_2d_2d_b_r: generate_div_2d_2d_b_r,
    div_3d_2d_b_nr: generate_div_3d_2d_b_nr,
    div_3d_2d_b_r: generate_div_3d_2d_b_r,
    mix_4n_paren: generate_mix_4n_paren,
    mix_4n_brackets: generate_mix_4n_brackets,
    // Existing
    add_2d_nc: generate_add_2d_nc,
    add_2d_c: generate_add_2d_c,
    add_3d_nc: generate_add_3d_nc,
    add_3d_c: generate_add_3d_c,
    sub_2d_nc: generate_sub_2d_nc,
    sub_2d_b: generate_sub_2d_b,
    sub_3d_b: generate_sub_3d_b,
    sub_3d_z_mid: generate_sub_3d_z_mid,
    mul_2x1: generate_mul_2x1,
    mul_3x1: generate_mul_3x1,
    mul_2x2_nc_nc: generate_mul_2x2_nc_nc,
    mul_2x2_c_c: generate_mul_2x2_c_c,
    div_2d_1d: generate_div_2d_1d,
    div_3d_1d_z0_mid: generate_div_3d_1d_z0_mid,
    div_3d_1d_z0_end: generate_div_3d_1d_z0_end,
    div_3d_2d: generate_div_3d_2d,
};

/**
 * 根據標籤生成一道題目
 * @param {string} tag - 微能力標籤
 * @returns {{ tag, category, tagName, a, b, answer, text, symbol }}
 */
function generateQuestion(tag) {
    if (!GENERATORS[tag]) {
        throw new Error(`未知的標籤: ${tag}`);
    }

    const result = GENERATORS[tag]();
    const info = TAG_INFO[tag];

    return {
        tag,
        category: info.category,
        tagName: info.name,
        a: result.a,
        b: result.b,
        answer: result.answer,
        questionText: result.text,
        symbol: result.symbol,
    };
}

/**
 * 批量生成指定數量的題目
 * @param {string} tag - 標籤
 * @param {number} count - 數量
 * @returns {Array} 題目陣列
 */
function generateQuestions(tag, count) {
    const questions = [];
    for (let i = 0; i < count; i++) {
        questions.push(generateQuestion(tag));
    }
    return questions;
}

/**
 * 從所有標籤中隨機生成題目
 * @param {number} count - 數量
 * @returns {Array} 題目陣列
 */
function generateRandomQuestions(count) {
    const questions = [];
    for (let i = 0; i < count; i++) {
        const tag = ALL_TAGS[randInt(0, ALL_TAGS.length - 1)];
        questions.push(generateQuestion(tag));
    }
    return questions;
}

// ========================================
// 匯出
// ========================================
module.exports = {
    generateQuestion,
    generateQuestions,
    generateRandomQuestions,
    ALL_TAGS,
    TAG_INFO,
    GENERATORS,
};
