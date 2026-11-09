export const ELEMENT_TYPES = {
  fire: { id: 'fire', nameZh: '火', nameEn: 'Fire', color: '#ff6438', bg: '#3d1710', icon: '🔥' },
  water: { id: 'water', nameZh: '水', nameEn: 'Water', color: '#3b9eff', bg: '#102845', icon: '💧' },
  grass: { id: 'grass', nameZh: '草', nameEn: 'Grass', color: '#39c96b', bg: '#10361f', icon: '🍃' },
  electric: { id: 'electric', nameZh: '電', nameEn: 'Electric', color: '#f7c927', bg: '#3b3008', icon: '⚡' },
  ice: { id: 'ice', nameZh: '冰', nameEn: 'Ice', color: '#5ce1f2', bg: '#10353d', icon: '❄️' },
  fighting: { id: 'fighting', nameZh: '格鬥', nameEn: 'Fighting', color: '#e35646', bg: '#3b1512', icon: '🥊' },
  psychic: { id: 'psychic', nameZh: '超能力', nameEn: 'Psychic', color: '#f564ad', bg: '#3b122a', icon: '🔮' },
  ghost: { id: 'ghost', nameZh: '幽靈', nameEn: 'Ghost', color: '#9470ff', bg: '#221642', icon: '👻' },
  dragon: { id: 'dragon', nameZh: '龍', nameEn: 'Dragon', color: '#6477ff', bg: '#161b47', icon: '🐉' },
  normal: { id: 'normal', nameZh: '一般', nameEn: 'Normal', color: '#a6b1c2', bg: '#262b33', icon: '⭐' },
};

const TYPE_CHART = {
  fire: { grass: 2.0, ice: 2.0, fire: 0.5, water: 0.5, dragon: 0.5 },
  water: { fire: 2.0, water: 0.5, grass: 0.5, dragon: 0.5 },
  grass: { water: 2.0, fire: 0.5, grass: 0.5, dragon: 0.5 },
  electric: { water: 2.0, electric: 0.5, grass: 0.5, dragon: 0.5 },
  ice: { grass: 2.0, dragon: 2.0, fire: 0.5, water: 0.5, ice: 0.5 },
  fighting: { normal: 2.0, ice: 2.0, psychic: 0.5, ghost: 0.5 },
  psychic: { fighting: 2.0, ghost: 2.0, psychic: 0.5 },
  ghost: { psychic: 2.0, ghost: 2.0, normal: 0.5 },
  dragon: { dragon: 2.0, ice: 0.5 },
  normal: { ghost: 0.5 },
};

export function getTypeMultiplier(attackType, defendType) {
  const row = TYPE_CHART[attackType];
  if (!row) return 1.0;
  return row[defendType] ?? 1.0;
}

export function getEffectivenessText(mult) {
  if (mult >= 1.8) return { textZh: '效果絕佳！', textEn: 'Super Effective!', tone: 'super' };
  if (mult <= 0.6) return { textZh: '效果不太好…', textEn: 'Not Very Effective...', tone: 'weak' };
  return { textZh: '', textEn: '', tone: 'normal' };
}

export const RARITY_TIERS = {
  common: {
    id: 'common',
    nameZh: '普通',
    nameEn: 'Common',
    color: '#7cd992',
    border: '#3fa85b',
    stars: 1,
  },
  rare: {
    id: 'rare',
    nameZh: '稀有',
    nameEn: 'Rare',
    color: '#57b8ff',
    border: '#2582d4',
    stars: 2,
  },
  epic: {
    id: 'epic',
    nameZh: '史詩',
    nameEn: 'Epic',
    color: '#c77dff',
    border: '#8f3fe0',
    stars: 3,
  },
  legendary: {
    id: 'legendary',
    nameZh: '傳說',
    nameEn: 'Legendary',
    color: '#ffd166',
    border: '#f77f00',
    stars: 4,
  },
};
