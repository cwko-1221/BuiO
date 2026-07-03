'use strict';

// Grade-level tag allow-lists. Tags accumulate — a P3 student can still be
// asked P1 or P2 questions, so higher grades widen the pool rather than
// replace it. Edit the per-grade `_ONLY` arrays to reshape the curriculum;
// the P1..P6 exports are built up automatically.

const { ALL_TAGS } = require('./questionGenerator');

// ---- P1 (P1 tags) ----
const P1_ONLY = [
  // 基本加減口算
  'add_wi18_nc', 'add_wi18_c', 'sub_wi18_nb',
  // 100以內筆算加減
  'add_2d_nc', 'add_2d_c_p1',
  'add_3n_2d_nc', 'add_3n_2d_c',
  'sub_2d_nc',
];

// ---- P2 (adds these to P1) ----
const P2_ONLY = [
  // 1000以內三位數加減
  'add_2n_3d_c', 'add_3n_3d_c',
  'sub_2n_3d_nb', 'sub_2n_3d_b',
  'mix_3n_3d_lr',
  // 基本表內乘除
  'mul_1x1_easy', 'mul_1x1_hard',
  'div_table_nr', 'div_table_r',
];

// ---- P3 (adds these to P1 + P2) ----
const P3_ONLY = [
  // 整數乘法進階
  'mul_2d_1d_nc', 'mul_2d_1d_c',
  'mul_3d_1d_nc', 'mul_3d_1d_c',
  'mul_3n',
  // 整數一位數除法
  'div_2d_1d', 'div_2d_1d_r',
  'div_3d_1d_nr', 'div_3d_1d_r',
  'div_3d_1d_z0_mid', 'div_3d_1d_z0_end',
  // 基本整數混合四則
  'mix_3n_no_paren', 'mix_3n_paren',
];

// ---- P4 (adds these to P1 + P2 + P3) ----
const P4_ONLY = [
  // 整數多位數乘除
  'mul_2d_2d_nc', 'mul_2d_2d_c',
  'mul_3d_2d_nc', 'mul_3d_2d_c',
  'div_2d_2d_b_nr', 'div_2d_2d_b_r',
  'div_3d_2d_b_nr', 'div_3d_2d_b_r',
  // 高級整數混合四則
  'mix_4n_paren', 'mix_4n_brackets',
];

// Build cumulative lists.
const P1_TAGS = [...P1_ONLY];
const P2_TAGS = [...P1_TAGS, ...P2_ONLY];
const P3_TAGS = [...P2_TAGS, ...P3_ONLY];
const P4_TAGS = [...P3_TAGS, ...P4_ONLY];
// P5 and P6 mirror P4 until the user provides new specs.
const CLASS_TAGS = {
  P1: P1_TAGS,
  P2: P2_TAGS,
  P3: P3_TAGS,
  P4: P4_TAGS,
  P5: P4_TAGS,
  P6: P4_TAGS,
};

function normalizeClassname(name) {
  const s = String(name || '').trim().toUpperCase();
  const m = s.match(/^P([1-6])/);
  return m ? `P${m[1]}` : null;
}

function tagsForClass(classname) {
  const grade = normalizeClassname(classname);
  if (grade && CLASS_TAGS[grade]) return CLASS_TAGS[grade];
  return ALL_TAGS;
}

module.exports = { CLASS_TAGS, tagsForClass, normalizeClassname };
