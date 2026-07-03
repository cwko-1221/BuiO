'use strict';

// Maps a student's classname (P1–P6) to the math tags that are appropriate
// for their grade level. The adaptive engine restricts the question pool
// to these tags for a given student. Tweak here to reshape the curriculum
// without touching engine code.
//
// Tags come from math-app/engine/questionGenerator.js.

// Mapping is based on the HK primary math curriculum:
//   P1 — 加減法 (18以內)   [口算為主，我們的 2-digit 標籤已算超前]
//   P2 — 加減法擴展至三位數 (含進退位) + 基本乘除法
//   P3 — 乘法(一)、除法(一)、四則運算(一)；三位數乘一位數；三位數÷一位數
//   P4 — 乘法(二)、除法(二)：兩位×兩位、三位×兩位，除數擴至兩位數
//   P5 — 分數/小數為主；整數運算保持完整
//   P6 — 深化小數運算；整數運算保持完整
//
// NOTE: 現有題型只涵蓋兩位起的整數，未有單位數口算、分數、小數的題型。
// 想加這些題型的話，需要在 questionGenerator.js 新增對應的 tag / 產生器。
const CLASS_TAGS = {
  P1: [
    // 基本加減口算
    'add_wi18_nc',      // 2個數加法 (18以內、無進位)
    'add_wi18_c',       // 2個數加法 (18以內、有進位)
    'sub_wi18_nb',      // 2個數減法 (18以內、無退位)
    // 100以內筆算加減
    'add_2d_nc',        // 2個數加法 (2位數、無進位)
    'add_2d_c_p1',      // 2個數加法 (2位數、有進位、和<100)
    'add_3n_2d_nc',     // 3個數加法 (2位數、無進位、和<100)
    'add_3n_2d_c',      // 3個數加法 (2位數、有進位、和<100)
    'sub_2d_nc',        // 2個數減法 (2位數、無退位)
  ],
  P2: [
    // Full +/- including 3-digit with carry/borrow, plus 基本 × ÷.
    'add_2d_nc', 'add_2d_c', 'add_3d_nc', 'add_3d_c',
    'sub_2d_nc', 'sub_2d_b', 'sub_3d_b',
    'mul_2x1',
    'div_2d_1d',
  ],
  P3: [
    // Adds mul_3x1 (三位×一位) and three-digit ÷ one-digit variants.
    'add_2d_nc', 'add_2d_c', 'add_3d_nc', 'add_3d_c',
    'sub_2d_nc', 'sub_2d_b', 'sub_3d_b', 'sub_3d_z_mid',
    'mul_2x1', 'mul_3x1',
    'div_2d_1d', 'div_3d_1d_z0_mid', 'div_3d_1d_z0_end',
  ],
  P4: [
    // 乘法(二) + 除法(二): 2×2, 3-digit ÷ 2-digit — every integer tag now.
    'add_2d_nc', 'add_2d_c', 'add_3d_nc', 'add_3d_c',
    'sub_2d_nc', 'sub_2d_b', 'sub_3d_b', 'sub_3d_z_mid',
    'mul_2x1', 'mul_3x1', 'mul_2x2_nc_nc', 'mul_2x2_c_c',
    'div_2d_1d', 'div_3d_1d_z0_mid', 'div_3d_1d_z0_end', 'div_3d_2d',
  ],
  P5: [
    // Curriculum focus shifts to fractions & decimals (not yet in generator).
    // Keep all integer tags active for revision.
    'add_2d_nc', 'add_2d_c', 'add_3d_nc', 'add_3d_c',
    'sub_2d_nc', 'sub_2d_b', 'sub_3d_b', 'sub_3d_z_mid',
    'mul_2x1', 'mul_3x1', 'mul_2x2_nc_nc', 'mul_2x2_c_c',
    'div_2d_1d', 'div_3d_1d_z0_mid', 'div_3d_1d_z0_end', 'div_3d_2d',
  ],
  P6: [
    // Same as P5 for now — decimals will land here once tags exist.
    'add_2d_nc', 'add_2d_c', 'add_3d_nc', 'add_3d_c',
    'sub_2d_nc', 'sub_2d_b', 'sub_3d_b', 'sub_3d_z_mid',
    'mul_2x1', 'mul_3x1', 'mul_2x2_nc_nc', 'mul_2x2_c_c',
    'div_2d_1d', 'div_3d_1d_z0_mid', 'div_3d_1d_z0_end', 'div_3d_2d',
  ],
};

const { ALL_TAGS } = require('./questionGenerator');

function normalizeClassname(name) {
  const s = String(name || '').trim().toUpperCase();
  // Accept 'P1', 'P1A', 'P2B' etc — grade is determined by the first two chars.
  const m = s.match(/^P([1-6])/);
  return m ? `P${m[1]}` : null;
}

// Return the allow-list for a given classname. Unknown / graduated / staff →
// fall back to ALL_TAGS so nothing breaks.
function tagsForClass(classname) {
  const grade = normalizeClassname(classname);
  if (grade && CLASS_TAGS[grade]) return CLASS_TAGS[grade];
  return ALL_TAGS;
}

module.exports = { CLASS_TAGS, tagsForClass, normalizeClassname };
