'use strict';

// Grade-level tag allow-lists. Tags accumulate — a P3 student can still be
// asked P1 or P2 questions, so higher grades widen the pool rather than
// replace it. Edit the per-grade `_ONLY` arrays to reshape the curriculum;
// the P1..P6 exports are built up automatically.

const { ALL_TAGS, TAG_INFO } = require('./questionGenerator');

const QUESTION_TYPE_ORDER = [
  { id: 'add', name: '加法' },
  { id: 'sub', name: '減法' },
  { id: 'mul', name: '乘法' },
  { id: 'div', name: '除法' },
  { id: 'mix', name: '混合' },
  { id: 'algebra', name: '代數' },
  { id: 'integer', name: '整數' },
  { id: 'fraction', name: '分數' },
  { id: 'decimal', name: '小數' },
];
const QUESTION_TYPE_IDS = QUESTION_TYPE_ORDER.map(t => t.id);
const QUESTION_TYPE_BY_CATEGORY = new Map([
  ['加法', 'add'],
  ['減法', 'sub'],
  ['乘法', 'mul'],
  ['除法', 'div'],
  ['混合', 'mix'],
  ['代數', 'algebra'],
]);
// Domain filters supplement operation filters. Decimal↔fraction conversion
// belongs to both domains, so turning either one off excludes that exercise.
const DECIMAL_TAGS = new Set([
  'add_up_to_3n', 'sub_up_to_3n', 'mix_3n_4d',
  'mul_by_powers10', 'mul_by_decimal_scales', 'mul_decimal_or_integer',
  'div_by_powers10', 'div_by_decimal_scales', 'div_decimal_general',
  'mix_decimal_or_integer_up_to_4', 'convert_decimal_fraction',
  'convert_decimal_percent',
]);
const FRACTION_TAGS = new Set([
  ...ALL_TAGS.filter(tag => tag.startsWith('frac_')),
  'convert_decimal_fraction', 'convert_percent_fraction',
]);

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
  // 同分母分數
  'frac_2_add', 'frac_2_sub', 'frac_3_add', 'frac_3_sub',
];

// ---- P4 (adds these to P1 + P2 + P3) ----
const P4_ONLY = [
  // 分數概念與進階運算
  'frac_convert', 'frac_expand', 'frac_reduce',
  'frac_up_to_3_add', 'frac_up_to_3_sub', 'frac_3_mix',
  'add_up_to_3n', 'sub_up_to_3n', 'mix_3n_4d',
  // 整數多位數乘除
  'mul_2d_2d_nc', 'mul_2d_2d_c',
  'mul_3d_2d_nc', 'mul_3d_2d_c',
  'div_2d_2d_b_nr', 'div_2d_2d_b_r',
  'div_3d_2d_b_nr', 'div_3d_2d_b_r',
  // 高級整數混合四則
  'mix_4n_paren', 'mix_4n_brackets',
];

// ---- P5 (adds unlike fractions, decimals, and fraction operations) ----
const P5_ONLY = [
  'frac_unlike_up_to_3_add', 'frac_unlike_up_to_3_sub', 'frac_unlike_3_mix',
  'frac_mul_up_to_3', 'mul_by_powers10', 'mul_by_decimal_scales',
  'mul_decimal_or_integer', 'frac_div_up_to_3', 'frac_3_mix_4ops',
  'linear_equation_easy_1',
];

// ---- P6 (adds decimal division, mixed operations, and number conversions) ----
const P6_ONLY = [
  'div_by_powers10', 'div_by_decimal_scales', 'div_decimal_general',
  'mix_decimal_or_integer_up_to_4', 'convert_decimal_fraction',
  'convert_decimal_percent', 'convert_percent_fraction', 'linear_equation_easy_2',
];

// Build cumulative lists.
const P1_TAGS = [...P1_ONLY];
const P2_TAGS = [...P1_TAGS, ...P2_ONLY];
const P3_TAGS = [...P2_TAGS, ...P3_ONLY];
const P4_TAGS = [...P3_TAGS, ...P4_ONLY];
const P5_TAGS = [...P4_TAGS, ...P5_ONLY];
const P6_TAGS = [...P5_TAGS, ...P6_ONLY];
const CLASS_TAGS = {
  P1: P1_TAGS,
  P2: P2_TAGS,
  P3: P3_TAGS,
  P4: P4_TAGS,
  P5: P5_TAGS,
  P6: P6_TAGS,
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

// Tier metadata for grouping stats on the dashboard.
// Bronze = P1, Silver = P2, Gold = P3, Diamond = P4, Fire = P5, Sun = P6.
// Higher grades inherit lower tiers.
const TIERS = [
  { id: 'bronze',  name: '銅',   tags: new Set(P1_ONLY) },
  { id: 'silver',  name: '銀',   tags: new Set(P2_ONLY) },
  { id: 'gold',    name: '金',   tags: new Set(P3_ONLY) },
  { id: 'diamond', name: '鑽',   tags: new Set(P4_ONLY) },
  { id: 'fire',    name: '火焰', tags: new Set(P5_ONLY) },
  { id: 'sun',     name: '太陽', tags: new Set(P6_ONLY) },
];

function tierForTag(tag) {
  for (const t of TIERS) if (t.tags.has(tag)) return t.id;
  return null;
}

const TIER_ORDER = TIERS.map(t => ({ id: t.id, name: t.name }));
const TIER_IDS = TIER_ORDER.map(t => t.id);

// Which tiers a grade actually reaches. A P2 class has no 金 or 鑽 tags, so the
// teacher screen must not offer switches for them.
function tiersForClass(classname) {
  const reached = new Set(tagsForClass(classname).map(tierForTag));
  return TIER_ORDER.filter(t => reached.has(t.id));
}

function questionTypeForTag(tag) {
  return QUESTION_TYPE_BY_CATEGORY.get(TAG_INFO[tag]?.category) || null;
}

function questionTypesForTag(tag) {
  const types = [];
  const operation = questionTypeForTag(tag);
  if (operation) types.push(operation);
  if (operation && operation !== 'algebra' && !FRACTION_TAGS.has(tag) && !DECIMAL_TAGS.has(tag)) {
    types.push('integer');
  }
  if (FRACTION_TAGS.has(tag)) types.push('fraction');
  if (DECIMAL_TAGS.has(tag)) types.push('decimal');
  return types;
}

function questionTypesForClass(classname) {
  const reached = new Set(tagsForClass(classname).flatMap(questionTypesForTag));
  return QUESTION_TYPE_ORDER.filter(type => reached.has(type.id));
}

// The grade curriculum minus whatever tiers or question types a teacher
// switched off for this class/group. Falls back to the unfiltered list when a
// policy would leave a student nothing to practise: the API refuses to save
// one, but a stale row must never lock a child out of the app.
function filterTagsForScope(classname, disabledTiers, disabledQuestionTypes) {
  const tags = tagsForClass(classname);
  const offTiers = new Set(disabledTiers || []);
  const offQuestionTypes = new Set(disabledQuestionTypes || []);
  if (!offTiers.size && !offQuestionTypes.size) return tags;
  return tags.filter(tag => {
    const tier = tierForTag(tag);
    const questionTypes = questionTypesForTag(tag);
    return !offTiers.has(tier) && !questionTypes.some(type => offQuestionTypes.has(type));
  });
}

function tagsForScope(classname, disabledTiers, disabledQuestionTypes) {
  const tags = tagsForClass(classname);
  const kept = filterTagsForScope(classname, disabledTiers, disabledQuestionTypes);
  return kept.length ? kept : tags;
}

module.exports = {
  CLASS_TAGS, tagsForClass, normalizeClassname, tierForTag,
  TIER_ORDER, TIER_IDS, tiersForClass,
  QUESTION_TYPE_ORDER, QUESTION_TYPE_IDS, questionTypeForTag, questionTypesForTag, questionTypesForClass,
  filterTagsForScope, tagsForScope,
};
