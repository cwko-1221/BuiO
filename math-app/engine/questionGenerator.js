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
 * [分數] frac_2_add, frac_2_sub, frac_3_add, frac_3_sub,
 *         frac_convert, frac_expand, frac_reduce,
 *         frac_up_to_3_add, frac_up_to_3_sub, frac_3_mix,
 * [小數] add_up_to_3n, sub_up_to_3n, mix_3n_4d,
 *         frac_unlike_up_to_3_add, frac_unlike_up_to_3_sub,
 *         frac_unlike_3_mix, frac_mul_up_to_3, frac_div_up_to_3,
 *         mul_by_powers10, mul_by_decimal_scales, mul_decimal_or_integer,
 *         frac_3_mix_4ops, linear_equation_easy_1,
 *         div_by_powers10, div_by_decimal_scales, div_decimal_general,
 *         mix_decimal_or_integer_up_to_4, convert_decimal_fraction,
 *         convert_decimal_percent, convert_percent_fraction,
 *         linear_equation_easy_2
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
    frac_2_add:      { name: '2個同分母分數加法', category: '加法', symbol: '+' },
    frac_2_sub:      { name: '2個同分母分數減法', category: '減法', symbol: '-' },
    frac_3_add:      { name: '3個同分母分數加法', category: '加法', symbol: '+' },
    frac_3_sub:      { name: '3個同分母分數減法', category: '減法', symbol: '-' },
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
    frac_convert:   { name: '假分數與帶分數互化', category: '混合', symbol: '↔' },
    frac_expand:    { name: '分數擴分', category: '混合', symbol: '↔' },
    frac_reduce:    { name: '分數約分', category: '混合', symbol: '↔' },
    frac_up_to_3_add: { name: '最多3個同分母分數加法', category: '混合', symbol: '+' },
    frac_up_to_3_sub: { name: '最多3個同分母分數減法', category: '混合', symbol: '-' },
    frac_3_mix:     { name: '3個同分母分數加減混合', category: '混合', symbol: '±' },
    add_up_to_3n:  { name: '不超過三個數的小數加法', category: '加法', symbol: '+' },
    sub_up_to_3n:  { name: '不超過三個數的小數減法', category: '減法', symbol: '-' },
    mix_3n_4d:     { name: '三個數（小數和整數）的加減混合運算', category: '混合', symbol: '±' },
    frac_unlike_up_to_3_add: { name: '不超過3個異分母分數的加法', category: '加法', symbol: '+' },
    frac_unlike_up_to_3_sub: { name: '不超過3個異分母分數的減法', category: '減法', symbol: '-' },
    frac_unlike_3_mix: { name: '3個異分母分數的加減混合運算', category: '混合', symbol: '±' },
    frac_mul_up_to_3: { name: '不超過3個分數的乘法運算', category: '乘法', symbol: '×' },
    mul_by_powers10: { name: '一個數（小數或整數）乘以10、100、1000', category: '乘法', symbol: '×' },
    mul_by_decimal_scales: { name: '一個數（小數或整數）乘以0.1、0.01、0.001', category: '乘法', symbol: '×' },
    mul_decimal_or_integer: { name: '兩個數（小數或整數）的乘法運算', category: '乘法', symbol: '×' },
    div_by_powers10: { name: '一個數（小數或整數）除以10、100、1000', category: '除法', symbol: '÷' },
    div_by_decimal_scales: { name: '一個數（小數或整數）除以0.1、0.01、0.001', category: '除法', symbol: '÷' },
    div_decimal_general: { name: '涉及小數的除法運算', category: '除法', symbol: '÷' },
    mix_decimal_or_integer_up_to_4: { name: '不超過四個數（小數或整數）的四則混合運算', category: '混合', symbol: '±' },
    convert_decimal_fraction: { name: '小數與分數互化', category: '混合', symbol: '↔' },
    convert_decimal_percent: { name: '百分數與小數互化', category: '混合', symbol: '↔' },
    convert_percent_fraction: { name: '百分數與分數互化', category: '混合', symbol: '↔' },
    linear_equation_easy_2: { name: '簡易方程二', category: '代數', symbol: '=' },
    frac_div_up_to_3: { name: '不超過3個數（分數或整數）的分數除法運算', category: '除法', symbol: '÷' },
    frac_3_mix_4ops: { name: '3個數（分數或整數）的分數四則混合運算', category: '混合', symbol: '±' },
    linear_equation_easy_1: { name: '簡易方程一', category: '代數', symbol: '=' },
    // ----- Legacy tags still referenced by grade lists -----
    add_2d_nc:       { name: '兩位數加法 (無進位)', category: '加法', symbol: '+' },
    sub_2d_nc:       { name: '兩位數減法 (無退位)', category: '減法', symbol: '-' },
    div_2d_1d:       { name: '兩位數÷一位數 (整除)', category: '除法', symbol: '÷' },
    div_3d_1d_z0_mid:{ name: '三位數÷一位數 (商中間有零)', category: '除法', symbol: '÷' },
    div_3d_1d_z0_end:{ name: '三位數÷一位數 (商尾數有零)', category: '除法', symbol: '÷' },
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

/** 將正整數 total 隨機拆成指定數量的正整數部分。 */
function randomPositiveParts(total, count) {
    const parts = [];
    let remaining = total;
    for (let i = 0; i < count - 1; i++) {
        const value = randInt(1, remaining - (count - i - 1));
        parts.push(value);
        remaining -= value;
    }
    parts.push(remaining);
    return parts;
}

/** 2個同分母分數加法，答案保留為分子供數字鍵盤輸入。 */
function generate_frac_2_add() {
    const denominator = randInt(3, 9);
    const numeratorTotal = randInt(2, denominator - 1);
    const [a, b] = randomPositiveParts(numeratorTotal, 2);
    return {
        a, b, denominator, answer: numeratorTotal,
        text: `${a}/${denominator} + ${b}/${denominator}`,
        symbol: '+'
    };
}

/** 2個同分母分數減法，答案保留為分子供數字鍵盤輸入。 */
function generate_frac_2_sub() {
    const denominator = randInt(3, 9);
    const a = randInt(2, denominator - 1);
    const b = randInt(1, a - 1);
    return {
        a, b, denominator, answer: a - b,
        text: `${a}/${denominator} - ${b}/${denominator}`,
        symbol: '-'
    };
}

/** 3個同分母分數加法，答案保留為分子供數字鍵盤輸入。 */
function generate_frac_3_add() {
    const denominator = randInt(4, 9);
    const numeratorTotal = randInt(3, denominator - 1);
    const [a, b, c] = randomPositiveParts(numeratorTotal, 3);
    return {
        a, b, c, denominator, answer: numeratorTotal,
        text: `${a}/${denominator} + ${b}/${denominator} + ${c}/${denominator}`,
        symbol: '+'
    };
}

/** 3個同分母分數減法，答案保留為分子供數字鍵盤輸入。 */
function generate_frac_3_sub() {
    const denominator = randInt(5, 9);
    const numeratorTotal = randInt(4, denominator - 1);
    const [answer, b, c] = randomPositiveParts(numeratorTotal, 3);
    const a = answer + b + c;
    return {
        a, b, c, denominator, answer,
        text: `${a}/${denominator} - ${b}/${denominator} - ${c}/${denominator}`,
        symbol: '-'
    };
}

function gcd(a, b) {
    while (b) [a, b] = [b, a % b];
    return Math.abs(a);
}

function lcm(a, b) {
    return Math.abs(a * b) / gcd(a, b);
}

function fractionExpression(numbers, operators, denominator) {
    return numbers.map((number, index) => {
        if (index === 0) return `${number}/${denominator}`;
        return `${operators[index - 1]} ${number}/${denominator}`;
    }).join(' ');
}

/** 假分數與帶分數互化；答案格式可能是分數或帶分數。 */
function generate_frac_convert() {
    const denominator = randInt(3, 9);
    if (Math.random() < 0.5) {
        const whole = randInt(1, 3);
        const numerator = randInt(1, denominator - 1);
        const improperNumerator = whole * denominator + numerator;
        return {
            answer: whole + numerator / denominator,
            answerType: 'mixed',
            answerWhole: whole,
            answerNumerator: numerator,
            answerDenominator: denominator,
            denominator,
            text: `${improperNumerator}/${denominator} = ? ?/${denominator}`,
            symbol: '↔'
        };
    }

    const whole = 1;
    const numerator = randInt(1, denominator - 1);
    return {
        answer: whole + numerator / denominator,
        answerType: 'fraction',
        answerNumerator: whole * denominator + numerator,
        answerDenominator: denominator,
        denominator,
        text: `${whole} ${numerator}/${denominator} = ?/?`,
        symbol: '↔'
    };
}

function randomReducedFraction() {
    let numerator, denominator;
    do {
        denominator = randInt(3, 6);
        numerator = randInt(1, denominator - 1);
    } while (gcd(numerator, denominator) !== 1);
    return { numerator, denominator };
}

/** 擴分；答案要求輸入分子和分母。 */
function generate_frac_expand() {
    const { numerator, denominator } = randomReducedFraction();
    const multiplier = randInt(2, 3);
    return {
        answer: numerator * multiplier / (denominator * multiplier),
        answerType: 'fraction',
        answerNumerator: numerator * multiplier,
        answerDenominator: denominator * multiplier,
        denominator: denominator * multiplier,
        text: `${numerator}/${denominator} = ?/${denominator * multiplier}`,
        symbol: '↔'
    };
}

/** 約分；答案要求輸入分子和分母。 */
function generate_frac_reduce() {
    const { numerator, denominator } = randomReducedFraction();
    const multiplier = randInt(2, 3);
    return {
        answer: numerator / denominator,
        answerType: 'fraction',
        answerNumerator: numerator,
        answerDenominator: denominator,
        denominator,
        text: `${numerator * multiplier}/${denominator * multiplier} = ?/?`,
        symbol: '↔'
    };
}

function generate_frac_up_to_3_operation(operator) {
    for (let attempt = 0; attempt < 200; attempt++) {
        const denominator = randInt(4, 9);
        const count = randInt(2, 3);
        const numbers = Array.from({ length: count }, () => randInt(1, denominator - 1));
        const operators = Array.from({ length: count - 1 }, () => operator);
        const answer = numbers.slice(1).reduce((total, number, index) =>
            operator === '+' ? total + number : total - number, numbers[0]);
        if (answer > 0 && answer < denominator) {
            return {
                answer,
                answerType: 'fraction',
                answerNumerator: answer,
                answerDenominator: denominator,
                denominator,
                text: fractionExpression(numbers, operators, denominator),
                symbol: '±'
            };
        }
    }
    return {
        answer: operator === '+' ? 3 : 1,
        answerType: 'fraction',
        answerNumerator: operator === '+' ? 3 : 1,
        answerDenominator: 5,
        denominator: 5,
        text: operator === '+' ? '1/5 + 1/5 + 1/5' : '3/5 - 1/5 - 1/5',
        symbol: operator
    };
}

/** 最多三個同分母分數加法。 */
function generate_frac_up_to_3_add() {
    return generate_frac_up_to_3_operation('+');
}

/** 最多三個同分母分數減法。 */
function generate_frac_up_to_3_sub() {
    return generate_frac_up_to_3_operation('-');
}

/** 三個同分母分數，固定包含加法和減法的混合運算。 */
function generate_frac_3_mix() {
    for (let attempt = 0; attempt < 200; attempt++) {
        const denominator = randInt(5, 9);
        const numbers = Array.from({ length: 3 }, () => randInt(1, denominator - 1));
        const operators = Math.random() < 0.5 ? ['+', '-'] : ['-', '+'];
        const firstStep = numbers[0] + (operators[0] === '+' ? numbers[1] : -numbers[1]);
        const answer = firstStep
            + (operators[1] === '+' ? numbers[2] : -numbers[2]);
        if (firstStep > 0 && answer > 0 && answer < denominator) {
            return {
                answer,
                answerType: 'fraction',
                answerNumerator: answer,
                answerDenominator: denominator,
                denominator,
                text: fractionExpression(numbers, operators, denominator),
                symbol: '±'
            };
        }
    }
    return {
        answer: 4,
        answerType: 'fraction',
        answerNumerator: 4,
        answerDenominator: 7,
        denominator: 7,
        text: '3/7 + 2/7 - 1/7',
        symbol: '±'
    };
}

// P5 異分母分數出題邏輯
function randomUnlikeFractions(count) {
    const denominators = [2, 3, 4, 5, 6, 7, 8, 9]
        .sort(() => Math.random() - 0.5)
        .slice(0, count);
    return denominators.map(denominator => ({
        numerator: randInt(1, denominator - 1),
        denominator,
    }));
}

function unlikeFractionExpression(terms, operators) {
    return terms.map((term, index) => {
        const part = `${term.numerator}/${term.denominator}`;
        return index === 0 ? part : `${operators[index - 1]} ${part}`;
    }).join(' ');
}

function unlikeFractionAnswer(terms, operators) {
    const commonDenominator = terms.reduce((common, term) => lcm(common, term.denominator), 1);
    let numerator = terms[0].numerator * (commonDenominator / terms[0].denominator);
    for (let i = 1; i < terms.length; i++) {
        const value = terms[i].numerator * (commonDenominator / terms[i].denominator);
        numerator = operators[i - 1] === '+' ? numerator + value : numerator - value;
    }
    return { numerator, denominator: commonDenominator };
}

function generate_frac_unlike_operation(operator) {
    for (let attempt = 0; attempt < 1000; attempt++) {
        const count = randInt(2, 3);
        const terms = randomUnlikeFractions(count);
        const operators = Array(count - 1).fill(operator);
        const answer = unlikeFractionAnswer(terms, operators);
        if (answer.numerator > 0 && answer.numerator < answer.denominator) {
            return {
                answer: answer.numerator / answer.denominator,
                answerType: 'fraction',
                answerNumerator: answer.numerator,
                answerDenominator: answer.denominator,
                denominator: answer.denominator,
                text: unlikeFractionExpression(terms, operators),
                symbol: operator,
            };
        }
    }
    const terms = operator === '+'
        ? [{ numerator: 1, denominator: 4 }, { numerator: 1, denominator: 6 }]
        : [{ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 3 }];
    const operators = [operator];
    const answer = unlikeFractionAnswer(terms, operators);
    return {
        answer: answer.numerator / answer.denominator,
        answerType: 'fraction',
        answerNumerator: answer.numerator,
        answerDenominator: answer.denominator,
        denominator: answer.denominator,
        text: unlikeFractionExpression(terms, operators),
        symbol: operator,
    };
}

function generate_frac_unlike_up_to_3_add() {
    return generate_frac_unlike_operation('+');
}

function generate_frac_unlike_up_to_3_sub() {
    return generate_frac_unlike_operation('-');
}

function generate_frac_unlike_3_mix() {
    for (let attempt = 0; attempt < 1000; attempt++) {
        const terms = randomUnlikeFractions(3);
        const operators = Math.random() < 0.5 ? ['+', '-'] : ['-', '+'];
        const commonDenominator = terms.reduce((common, term) => lcm(common, term.denominator), 1);
        const firstNumerator = terms[0].numerator * (commonDenominator / terms[0].denominator);
        const secondNumerator = terms[1].numerator * (commonDenominator / terms[1].denominator);
        const thirdNumerator = terms[2].numerator * (commonDenominator / terms[2].denominator);
        const intermediate = operators[0] === '+'
            ? firstNumerator + secondNumerator
            : firstNumerator - secondNumerator;
        const numerator = operators[1] === '+'
            ? intermediate + thirdNumerator
            : intermediate - thirdNumerator;
        if (intermediate > 0 && numerator > 0 && numerator < commonDenominator) {
            return {
                answer: numerator / commonDenominator,
                answerType: 'fraction',
                answerNumerator: numerator,
                answerDenominator: commonDenominator,
                denominator: commonDenominator,
                text: unlikeFractionExpression(terms, operators),
                symbol: '±',
            };
        }
    }
    const terms = [
        { numerator: 1, denominator: 2 },
        { numerator: 1, denominator: 3 },
        { numerator: 1, denominator: 6 },
    ];
    const operators = ['+', '-'];
    const answer = unlikeFractionAnswer(terms, operators);
    return {
        answer: answer.numerator / answer.denominator,
        answerType: 'fraction',
        answerNumerator: answer.numerator,
        answerDenominator: answer.denominator,
        denominator: answer.denominator,
        text: unlikeFractionExpression(terms, operators),
        symbol: '±',
    };
}

function formatMilli(milli) {
    const whole = Math.floor(milli / 1000);
    const decimal = String(milli % 1000).padStart(3, '0').replace(/0+$/, '');
    return decimal ? `${whole}.${decimal}` : String(whole);
}

function randomDecimalOrIntegerOperand() {
    if (Math.random() < 0.5) {
        const integer = randInt(1, 99);
        return { milli: integer * 1000, text: String(integer) };
    }
    let milli = randInt(1, 99999);
    while (milli % 1000 === 0) milli = randInt(1, 99999);
    return { milli, text: formatMilli(milli) };
}

function generate_mul_by_powers10() {
    const value = randomDecimalOrIntegerOperand();
    const factor = [10, 100, 1000][randInt(0, 2)];
    return { answer: value.milli * factor / 1000, text: `${value.text} × ${factor}`, symbol: '×' };
}

function generate_mul_by_decimal_scales() {
    const value = randomDecimalOrIntegerOperand();
    const factor = [
        { milli: 100, text: '0.1' },
        { milli: 10, text: '0.01' },
        { milli: 1, text: '0.001' },
    ][randInt(0, 2)];
    return {
        answer: value.milli * factor.milli / 1000000,
        text: `${value.text} × ${factor.text}`,
        symbol: '×',
    };
}

function generate_mul_decimal_or_integer() {
    const left = randomDecimalOrIntegerOperand();
    const right = randomDecimalOrIntegerOperand();
    return {
        answer: left.milli * right.milli / 1000000,
        text: `${left.text} × ${right.text}`,
        symbol: '×',
    };
}

function randomDecimalOperand() {
    let milli = randInt(1, 99999);
    while (milli % 1000 === 0) milli = randInt(1, 99999);
    return { milli, text: formatMilli(milli) };
}

function randomIntegerOperand() {
    const integer = randInt(1, 99);
    return { milli: integer * 1000, text: String(integer) };
}

function generate_div_by_powers10() {
    const value = randomDecimalOrIntegerOperand();
    const divisor = [10, 100, 1000][randInt(0, 2)];
    const answerMicro = value.milli * 1000 / divisor;
    return {
        answer: answerMicro / 1000000,
        text: `${value.text} ÷ ${divisor}`,
        symbol: '÷',
    };
}

function generate_div_by_decimal_scales() {
    const value = randomDecimalOrIntegerOperand();
    const divisor = [
        { milli: 100, text: '0.1' },
        { milli: 10, text: '0.01' },
        { milli: 1, text: '0.001' },
    ][randInt(0, 2)];
    const answerMicro = value.milli * 1000000 / divisor.milli;
    return {
        answer: answerMicro / 1000000,
        text: `${value.text} ÷ ${divisor.text}`,
        symbol: '÷',
    };
}

function generate_div_decimal_general() {
    const pattern = randInt(0, 2);
    let dividend;
    let divisor;
    if (pattern === 0) {
        dividend = randomDecimalOperand();
        // Every divisor divides 1000, so the quotient is exact to at most
        // six decimal places for any thousandth-precision dividend.
        divisor = { milli: [2, 4, 5, 8, 10, 20, 25, 40, 50, 100, 125, 200, 250, 500, 1000][randInt(0, 14)] * 1000 };
        divisor.text = String(divisor.milli / 1000);
    } else if (pattern === 1) {
        dividend = randomIntegerOperand();
        // Keep the divisor non-integer in this branch so each generated
        // exercise really involves a decimal operand.
        divisor = [100, 200, 250, 400, 500, 800, 1250, 2500, 12500]
            .map(milli => ({ milli, text: formatMilli(milli) }))[randInt(0, 8)];
    } else {
        dividend = randomDecimalOperand();
        divisor = [125, 250, 400, 500, 800, 1000, 1250, 2500, 4000, 5000, 8000, 10000, 12500, 20000, 25000, 40000, 50000]
            .map(milli => ({ milli, text: formatMilli(milli) }))[randInt(0, 16)];
    }
    const answerMicro = dividend.milli * 1000000 / divisor.milli;
    return {
        answer: answerMicro / 1000000,
        text: `${dividend.text} ÷ ${divisor.text}`,
        symbol: '÷',
    };
}

function gcdBigInt(a, b) {
    a = a < 0n ? -a : a;
    b = b < 0n ? -b : b;
    while (b) [a, b] = [b, a % b];
    return a || 1n;
}

function normalizeDecimalRational(numerator, denominator) {
    if (denominator < 0n) {
        numerator = -numerator;
        denominator = -denominator;
    }
    const divisor = gcdBigInt(numerator, denominator);
    return { numerator: numerator / divisor, denominator: denominator / divisor };
}

function decimalRationalOperation(left, right, operator) {
    if (operator === '+') {
        return normalizeDecimalRational(
            left.numerator * right.denominator + right.numerator * left.denominator,
            left.denominator * right.denominator,
        );
    }
    if (operator === '-') {
        return normalizeDecimalRational(
            left.numerator * right.denominator - right.numerator * left.denominator,
            left.denominator * right.denominator,
        );
    }
    if (operator === '×') {
        return normalizeDecimalRational(left.numerator * right.numerator, left.denominator * right.denominator);
    }
    if (right.numerator === 0n) return null;
    return normalizeDecimalRational(left.numerator * right.denominator, left.denominator * right.numerator);
}

function hasAtMostSixDecimalPlaces(value) {
    return (value.numerator * 1000000n) % value.denominator === 0n;
}

function evaluateDecimalMixedExpression(operands, operators) {
    const terms = operands.map(value => normalizeDecimalRational(BigInt(value.milli), 1000n));
    const remainingOperators = [...operators];
    for (let i = 0; i < remainingOperators.length;) {
        const operator = remainingOperators[i];
        if (operator !== '×' && operator !== '÷') {
            i++;
            continue;
        }
        const value = decimalRationalOperation(terms[i], terms[i + 1], operator);
        if (!value || (operator === '÷' && !hasAtMostSixDecimalPlaces(value))) return null;
        terms.splice(i, 2, value);
        remainingOperators.splice(i, 1);
    }

    let result = terms[0];
    for (let i = 0; i < remainingOperators.length; i++) {
        result = decimalRationalOperation(result, terms[i + 1], remainingOperators[i]);
        if (result.numerator <= 0n) return null;
    }
    if (!hasAtMostSixDecimalPlaces(result)) return null;
    const answerMicro = result.numerator * 1000000n / result.denominator;
    if (answerMicro > 999999999999n) return null;
    return Number(answerMicro) / 1000000;
}

function generate_mix_decimal_or_integer_up_to_4() {
    for (let attempt = 0; attempt < 400; attempt++) {
        const operandCount = randInt(3, 4);
        const operands = [randomDecimalOperand(), randomIntegerOperand()];
        while (operands.length < operandCount) {
            operands.push(randomDecimalOrIntegerOperand());
        }
        for (let i = operands.length - 1; i > 0; i--) {
            const j = randInt(0, i);
            [operands[i], operands[j]] = [operands[j], operands[i]];
        }

        const operators = [Math.random() < 0.5 ? '+' : '-', Math.random() < 0.5 ? '×' : '÷'];
        if (operandCount === 4) operators.push(['+', '-', '×', '÷'][randInt(0, 3)]);
        for (let i = operators.length - 1; i > 0; i--) {
            const j = randInt(0, i);
            [operators[i], operators[j]] = [operators[j], operators[i]];
        }

        const answer = evaluateDecimalMixedExpression(operands, operators);
        if (answer === null) continue;
        return {
            answer,
            text: operands.reduce((text, operand, index) => (
                index === 0 ? operand.text : `${text} ${operators[index - 1]} ${operand.text}`
            ), ''),
            symbol: '±',
        };
    }
    return { answer: 21, text: '20.5 - 2 ÷ 4 + 1', symbol: '±' };
}

function simplifiedFractionAnswer(numerator, denominator, text) {
    const divisor = gcd(numerator, denominator);
    const answerNumerator = numerator / divisor;
    const answerDenominator = denominator / divisor;
    return {
        answer: answerNumerator / answerDenominator,
        answerType: 'fraction',
        answerNumerator,
        answerDenominator,
        denominator: answerDenominator,
        text,
        symbol: '↔',
    };
}

function formatTenths(value) {
    const whole = Math.floor(value / 10);
    const decimal = value % 10;
    return decimal ? `${whole}.${decimal}` : String(whole);
}

function generate_convert_decimal_fraction() {
    if (Math.random() < 0.5) {
        let milli = randInt(1, 2999);
        while (milli % 1000 === 0) milli = randInt(1, 2999);
        return simplifiedFractionAnswer(
            milli,
            1000,
            `${formatMilli(milli)} = ?（最簡分數）`,
        );
    }

    const denominator = [2, 4, 5, 8, 10, 16, 20, 25, 40, 50, 80, 100, 125, 200, 250, 500, 1000][randInt(0, 16)];
    let numerator = randInt(1, denominator * 2 - 1);
    while (gcd(numerator, denominator) !== 1) numerator = randInt(1, denominator * 2 - 1);
    return {
        answer: numerator / denominator,
        answerType: 'decimal',
        text: `${numerator}/${denominator} = ?`,
        symbol: '↔',
    };
}

function generate_convert_decimal_percent() {
    if (Math.random() < 0.5) {
        const milli = randInt(1, 999);
        return {
            answer: milli / 10,
            answerType: 'decimal',
            text: `${formatMilli(milli)} = ?%`,
            symbol: '↔',
        };
    }

    const percentTenths = randInt(1, 999);
    return {
        answer: percentTenths / 1000,
        answerType: 'decimal',
        text: `${formatTenths(percentTenths)}% = ?`,
        symbol: '↔',
    };
}

function generate_convert_percent_fraction() {
    const percentTenths = randInt(1, 999);
    const divisor = gcd(percentTenths, 1000);
    const numerator = percentTenths / divisor;
    const denominator = 1000 / divisor;
    if (Math.random() < 0.5) {
        return simplifiedFractionAnswer(
            percentTenths,
            1000,
            `${formatTenths(percentTenths)}% = ?（最簡分數）`,
        );
    }
    return {
        answer: percentTenths / 10,
        answerType: 'decimal',
        text: `${numerator}/${denominator} = ?%`,
        symbol: '↔',
    };
}

function simplifyEquationRational(value) {
    const normalized = normalizeRational(value.numerator, value.denominator);
    const divisor = gcd(normalized.numerator, normalized.denominator);
    return {
        numerator: normalized.numerator / divisor,
        denominator: normalized.denominator / divisor,
    };
}

function addEquationRational(left, right) {
    return simplifyEquationRational(addRational(left, right));
}

function subtractEquationRational(left, right) {
    return simplifyEquationRational(subtractRational(left, right));
}

function multiplyEquationRational(left, right) {
    return simplifyEquationRational(multiplyRational(left, right));
}

function randomEquationCoefficient() {
    const type = randInt(0, 3);
    if (type === 0) {
        const value = randInt(1, 12);
        return { value: { numerator: value, denominator: 1 }, text: String(value) };
    }
    if (type === 1) {
        const denominator = randInt(2, 12);
        let numerator = randInt(1, denominator - 1);
        while (gcd(numerator, denominator) !== 1) numerator = randInt(1, denominator - 1);
        return {
            value: { numerator, denominator },
            text: `${numerator}/${denominator}`,
        };
    }
    if (type === 2) {
        let milli = randInt(1, 9999);
        while (milli % 1000 === 0) milli = randInt(1, 9999);
        return { value: { numerator: milli, denominator: 1000 }, text: formatMilli(milli) };
    }
    const percentTenths = randInt(1, 999);
    return {
        value: { numerator: percentTenths, denominator: 1000 },
        text: `${formatTenths(percentTenths)}%`,
    };
}

function randomEquationSolution() {
    const type = randInt(0, 2);
    if (type === 0) {
        return { numerator: randInt(1, 12), denominator: 1 };
    }
    if (type === 1) {
        let milli = randInt(1, 9999);
        while (milli % 1000 === 0) milli = randInt(1, 9999);
        return simplifyEquationRational({ numerator: milli, denominator: 1000 });
    }
    const denominator = randInt(2, 12);
    let numerator = randInt(1, denominator * 2 - 1);
    while (gcd(numerator, denominator) !== 1) numerator = randInt(1, denominator * 2 - 1);
    return { numerator, denominator };
}

function formatEquationRational(value) {
    const simplified = simplifyEquationRational(value);
    const choices = [];
    if (simplified.numerator % simplified.denominator === 0) {
        choices.push(String(simplified.numerator / simplified.denominator));
    }
    if ((simplified.numerator * 1000) % simplified.denominator === 0) {
        const milli = simplified.numerator * 1000 / simplified.denominator;
        choices.push(formatMilli(milli));
        choices.push(`${formatTenths(milli)}%`);
    }
    choices.push(`${simplified.numerator}/${simplified.denominator}`);
    return choices[randInt(0, choices.length - 1)];
}

function equationAnswer(solution) {
    const x = simplifyEquationRational(solution);
    if (x.denominator === 1) {
        return { answer: x.numerator, answerType: 'number' };
    }
    const decimalIsExact = (x.numerator * 1000000) % x.denominator === 0;
    if (decimalIsExact && Math.random() < 0.5) {
        return { answer: x.numerator / x.denominator, answerType: 'decimal' };
    }
    return {
        answer: x.numerator / x.denominator,
        answerType: 'fraction',
        answerNumerator: x.numerator,
        answerDenominator: x.denominator,
        denominator: x.denominator,
    };
}

function generate_linear_equation_easy_2() {
    for (let attempt = 0; attempt < 1000; attempt++) {
        const form = randInt(1, 6);
        const x = randomEquationSolution();
        let c;
        let text;

        if (form <= 4) {
            const a = randomEquationCoefficient();
            const b = randomEquationCoefficient();
            if (form === 1) {
                c = addEquationRational(multiplyEquationRational(a.value, x), b.value);
                text = `${a.text}x + ${b.text} = ${formatEquationRational(c)}`;
            } else if (form === 2) {
                c = subtractEquationRational(multiplyEquationRational(a.value, x), b.value);
                if (c.numerator <= 0) continue;
                text = `${a.text}x - ${b.text} = ${formatEquationRational(c)}`;
            } else if (form === 3) {
                c = multiplyEquationRational(a.value, addEquationRational(x, b.value));
                text = `${a.text}(x + ${b.text}) = ${formatEquationRational(c)}`;
            } else {
                const difference = subtractEquationRational(x, b.value);
                if (difference.numerator <= 0) continue;
                c = multiplyEquationRational(a.value, difference);
                text = `${a.text}(x - ${b.text}) = ${formatEquationRational(c)}`;
            }
        } else {
            const d = randInt(2, 9);
            const e = randInt(1, d - 1);
            const coefficient = form === 5 ? d + e : d - e;
            c = multiplyEquationRational({ numerator: coefficient, denominator: 1 }, x);
            text = form === 5
                ? `${d}x + ${e}x = ${formatEquationRational(c)}`
                : `${d}x - ${e}x = ${formatEquationRational(c)}`;
        }

        const answer = equationAnswer(x);
        return { ...answer, text, symbol: '=' };
    }
    return { answer: 3, answerType: 'number', text: '2(x + 1) = 8', symbol: '=' };
}

function normalizeRational(numerator, denominator) {
    if (denominator < 0) {
        numerator = -numerator;
        denominator = -denominator;
    }
    return { numerator, denominator };
}

function addRational(left, right) {
    return normalizeRational(
        left.numerator * right.denominator + right.numerator * left.denominator,
        left.denominator * right.denominator,
    );
}

function subtractRational(left, right) {
    return normalizeRational(
        left.numerator * right.denominator - right.numerator * left.denominator,
        left.denominator * right.denominator,
    );
}

function multiplyRational(left, right) {
    return normalizeRational(
        left.numerator * right.numerator,
        left.denominator * right.denominator,
    );
}

function divideRational(left, right) {
    return normalizeRational(
        left.numerator * right.denominator,
        left.denominator * right.numerator,
    );
}

function randomRationalOperand(allowInteger = true) {
    if (allowInteger && Math.random() < 0.4) {
        const value = randInt(1, 9);
        return { value: { numerator: value, denominator: 1 }, text: String(value) };
    }
    let denominator = randInt(2, 9);
    let numerator = randInt(1, denominator - 1);
    while (gcd(numerator, denominator) !== 1) {
        denominator = randInt(2, 9);
        numerator = randInt(1, denominator - 1);
    }
    return { value: { numerator, denominator }, text: `${numerator}/${denominator}` };
}

function randomIntegerRationalOperand() {
    const value = randInt(1, 9);
    return { value: { numerator: value, denominator: 1 }, text: String(value) };
}

function ensureFractionAndIntegerOperands(terms) {
    if (terms.every(term => term.value.denominator === 1)) {
        terms[randInt(0, terms.length - 1)] = randomRationalOperand(false);
    } else if (terms.every(term => term.value.denominator !== 1)) {
        terms[randInt(0, terms.length - 1)] = randomIntegerRationalOperand();
    }
    return terms;
}

function rationalQuestionResult(value, text, symbol) {
    return {
        answer: value.numerator / value.denominator,
        answerType: 'fraction',
        answerNumerator: value.numerator,
        answerDenominator: value.denominator,
        denominator: value.denominator,
        text,
        symbol,
    };
}

function generate_frac_mul_up_to_3() {
    const count = randInt(2, 3);
    const terms = Array.from({ length: count }, () => randomRationalOperand(false));
    const answer = terms.reduce((product, term) => multiplyRational(product, term.value), {
        numerator: 1,
        denominator: 1,
    });
    return rationalQuestionResult(answer, terms.map(term => term.text).join(' × '), '×');
}

function generate_frac_div_up_to_3() {
    for (let attempt = 0; attempt < 200; attempt++) {
        const count = randInt(2, 3);
        const terms = ensureFractionAndIntegerOperands(
            Array.from({ length: count }, () => randomRationalOperand(true)),
        );
        const answer = terms.slice(1).reduce((quotient, term) =>
            divideRational(quotient, term.value), terms[0].value);
        if (answer.numerator > 0) {
            return rationalQuestionResult(answer, terms.map(term => term.text).join(' ÷ '), '÷');
        }
    }
    const left = { numerator: 1, denominator: 2 };
    const right = { numerator: 2, denominator: 1 };
    return rationalQuestionResult(divideRational(left, right), '1/2 ÷ 2', '÷');
}

function evaluateRationalExpression(terms, operators) {
    const additiveTerms = [];
    const additiveOperators = [];
    let current = terms[0].value;
    for (let i = 0; i < operators.length; i++) {
        const operator = operators[i];
        const next = terms[i + 1].value;
        if (operator === '×') current = multiplyRational(current, next);
        else if (operator === '÷') current = divideRational(current, next);
        else {
            additiveTerms.push(current);
            additiveOperators.push(operator);
            current = next;
        }
    }
    additiveTerms.push(current);
    return additiveTerms.slice(1).reduce((result, term, index) =>
        additiveOperators[index] === '+'
            ? addRational(result, term)
            : subtractRational(result, term), additiveTerms[0]);
}

function generate_frac_3_mix_4ops() {
    const additive = Math.random() < 0.5 ? '+' : '-';
    const multiplicative = Math.random() < 0.5 ? '×' : '÷';
    const operators = Math.random() < 0.5
        ? [additive, multiplicative]
        : [multiplicative, additive];
    for (let attempt = 0; attempt < 300; attempt++) {
        const terms = ensureFractionAndIntegerOperands(
            Array.from({ length: 3 }, () => randomRationalOperand(true)),
        );
        const answer = evaluateRationalExpression(terms, operators);
        if (answer.numerator > 0 && answer.numerator <= 99999 && answer.denominator <= 99999) {
            return rationalQuestionResult(answer,
                `${terms[0].text} ${operators[0]} ${terms[1].text} ${operators[1]} ${terms[2].text}`,
                '±');
        }
    }
    const terms = [
        { value: { numerator: 1, denominator: 2 }, text: '1/2' },
        { value: { numerator: 3, denominator: 4 }, text: '3/4' },
        { value: { numerator: 2, denominator: 1 }, text: '2' },
    ];
    const fallbackOps = ['×', '+'];
    return rationalQuestionResult(evaluateRationalExpression(terms, fallbackOps),
        '1/2 × 3/4 + 2', '±');
}

function generate_linear_equation_easy_1() {
    const form = randInt(1, 8);
    let a, b, c, x, text;
    switch (form) {
        case 1: // x + b = c
            x = randInt(1, 30);
            b = randInt(1, 30);
            c = x + b;
            text = `x + ${b} = ${c}`;
            break;
        case 2: // x - b = c
            b = randInt(1, 30);
            c = randInt(1, 30);
            x = b + c;
            text = `x - ${b} = ${c}`;
            break;
        case 3: // ax = b
            a = randInt(2, 9);
            x = randInt(1, 12);
            b = a * x;
            text = `${a}x = ${b}`;
            break;
        case 4: // x / a = b
            a = randInt(2, 9);
            b = randInt(1, 12);
            x = a * b;
            text = `x / ${a} = ${b}`;
            break;
        case 5: // ax + b = c
            a = randInt(2, 9);
            x = randInt(1, 12);
            b = randInt(1, 30);
            c = a * x + b;
            text = `${a}x + ${b} = ${c}`;
            break;
        case 6: // ax - b = c
            a = randInt(2, 9);
            x = randInt(2, 12);
            b = randInt(1, a * x - 1);
            c = a * x - b;
            text = `${a}x - ${b} = ${c}`;
            break;
        case 7: // x / a + b = c
            a = randInt(2, 9);
            x = a * randInt(1, 12);
            b = randInt(1, 30);
            c = x / a + b;
            text = `x / ${a} + ${b} = ${c}`;
            break;
        case 8: // x / a - b = c
            a = randInt(2, 9);
            b = randInt(1, 30);
            c = randInt(1, 30);
            x = a * (b + c);
            text = `x / ${a} - ${b} = ${c}`;
            break;
    }
    return { answer: x, text, symbol: '=' };
}

// ========================================
// P4 出題邏輯
// ========================================

function randomDecimalCents() {
    return randInt(0, 99) * 100 + randInt(1, 99);
}

function formatDecimalCents(cents) {
    const whole = Math.floor(cents / 100);
    const decimal = String(cents % 100).padStart(2, '0').replace(/0$/, '');
    return `${whole}.${decimal}`;
}

/** 不超過三個數的小數加法，題目含兩個或三個小數（最多兩位小數）。 */
function generate_add_up_to_3n() {
    const count = randInt(2, 3);
    const cents = Array.from({ length: count }, randomDecimalCents);
    const answerCents = cents.reduce((total, value) => total + value, 0);
    const numbers = cents.map(formatDecimalCents);
    return {
        answer: answerCents / 100,
        text: numbers.join(' + '),
        symbol: '+',
    };
}

/** 不超過三個數的小數減法，由大至小排列以保持結果為正數。 */
function generate_sub_up_to_3n() {
    for (let attempt = 0; attempt < 200; attempt++) {
        const count = randInt(2, 3);
        const cents = Array.from({ length: count }, randomDecimalCents).sort((a, b) => b - a);
        const answerCents = cents.slice(1).reduce((total, value) => total - value, cents[0]);
        if (answerCents > 0) {
            const numbers = cents.map(formatDecimalCents);
            return {
                answer: answerCents / 100,
                text: numbers.join(' - '),
                symbol: '-',
            };
        }
    }
    return { answer: 6.25, text: '9.75 - 2.25 - 1.25', symbol: '-' };
}

/** 三個數（至少一個整數及一個小數）的加減混合運算。 */
function generate_mix_3n_4d() {
    for (let attempt = 0; attempt < 300; attempt++) {
        const cents = [randInt(1, 99) * 100, randomDecimalCents(), randomDecimalCents()];
        for (let i = cents.length - 1; i > 0; i--) {
            const j = randInt(0, i);
            [cents[i], cents[j]] = [cents[j], cents[i]];
        }
        const operators = Math.random() < 0.5 ? ['+', '-'] : ['-', '+'];
        const [op1, op2] = operators;
        const step1 = op1 === '+' ? cents[0] + cents[1] : cents[0] - cents[1];
        if (step1 <= 0) continue;
        const answerCents = op2 === '+' ? step1 + cents[2] : step1 - cents[2];
        if (answerCents > 0) {
            const numbers = cents.map((value) => value % 100 === 0
                ? String(value / 100)
                : formatDecimalCents(value));
            return {
                answer: answerCents / 100,
                text: `${numbers[0]} ${op1} ${numbers[1]} ${op2} ${numbers[2]}`,
                symbol: '±',
            };
        }
    }
    return { answer: 26.25, text: '25 + 3.75 - 2.5', symbol: '±' };
}

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

// ========================================
// 出題邏輯：乘法
// ========================================

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
    frac_2_add: generate_frac_2_add,
    frac_2_sub: generate_frac_2_sub,
    frac_3_add: generate_frac_3_add,
    frac_3_sub: generate_frac_3_sub,
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
    frac_convert: generate_frac_convert,
    frac_expand: generate_frac_expand,
    frac_reduce: generate_frac_reduce,
    frac_up_to_3_add: generate_frac_up_to_3_add,
    frac_up_to_3_sub: generate_frac_up_to_3_sub,
    frac_3_mix: generate_frac_3_mix,
    add_up_to_3n: generate_add_up_to_3n,
    sub_up_to_3n: generate_sub_up_to_3n,
    mix_3n_4d: generate_mix_3n_4d,
    frac_unlike_up_to_3_add: generate_frac_unlike_up_to_3_add,
    frac_unlike_up_to_3_sub: generate_frac_unlike_up_to_3_sub,
    frac_unlike_3_mix: generate_frac_unlike_3_mix,
    frac_mul_up_to_3: generate_frac_mul_up_to_3,
    mul_by_powers10: generate_mul_by_powers10,
    mul_by_decimal_scales: generate_mul_by_decimal_scales,
    mul_decimal_or_integer: generate_mul_decimal_or_integer,
    div_by_powers10: generate_div_by_powers10,
    div_by_decimal_scales: generate_div_by_decimal_scales,
    div_decimal_general: generate_div_decimal_general,
    mix_decimal_or_integer_up_to_4: generate_mix_decimal_or_integer_up_to_4,
    convert_decimal_fraction: generate_convert_decimal_fraction,
    convert_decimal_percent: generate_convert_decimal_percent,
    convert_percent_fraction: generate_convert_percent_fraction,
    linear_equation_easy_2: generate_linear_equation_easy_2,
    frac_div_up_to_3: generate_frac_div_up_to_3,
    frac_3_mix_4ops: generate_frac_3_mix_4ops,
    linear_equation_easy_1: generate_linear_equation_easy_1,
    // Legacy tags still referenced by grade lists
    add_2d_nc: generate_add_2d_nc,
    sub_2d_nc: generate_sub_2d_nc,
    div_2d_1d: generate_div_2d_1d,
    div_3d_1d_z0_mid: generate_div_3d_1d_z0_mid,
    div_3d_1d_z0_end: generate_div_3d_1d_z0_end,
};

/**
 * 根據標籤生成一道題目
 * @param {string} tag - 微能力標籤
 * @returns {{ tag, category, tagName, a, b, c, denominator, answer, text, symbol }}
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
        c: result.c,
        denominator: result.denominator,
        answer: result.answer,
        answerType: result.answerType || (tag.startsWith('frac_') ? 'fraction' : null),
        answerWhole: result.answerWhole,
        answerNumerator: result.answerNumerator ?? (tag.startsWith('frac_') ? result.answer : undefined),
        answerDenominator: result.answerDenominator ?? result.denominator,
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
