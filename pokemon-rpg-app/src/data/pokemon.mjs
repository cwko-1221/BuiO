import { SKILLS } from './skills.mjs';

export const POKEMON_SPECIES = {
  bulbasaur: {
    id: 'bulbasaur',
    dexNo: 1,
    nameZh: '妙蛙種子',
    nameEn: 'Bulbasaur',
    type: 'grass',
    rarity: 'rare',
    isStarterOption: true,
    catchRate: 0.45,
    expYield: 48,
    goldYield: 36,
    heightScale: 0.92,
    baseStats: { hp: 56, mp: 38, atk: 16, def: 16, spd: 14 },
    evolvesTo: { speciesId: 'venusaur', level: 16 },
    learnset: [
      { level: 1, skillId: 'vine_whip' },
      { level: 4, skillId: 'razor_leaf' },
      { level: 9, skillId: 'leech_seed' },
      { level: 13, skillId: 'synthesis' },
    ],
    habitatZh: '晨曦研究所 / 翡翠微風草原深處',
    loreZh: '背上的植物種子會吸收陽光漸漸長大，性格溫和且生命力頑強，是攻守兼備的草系夥伴。',
  },
  venusaur: {
    id: 'venusaur',
    dexNo: 2,
    nameZh: '妙蛙花',
    nameEn: 'Venusaur',
    type: 'grass',
    rarity: 'epic',
    catchRate: 0.2,
    expYield: 145,
    goldYield: 110,
    heightScale: 1.48,
    baseStats: { hp: 92, mp: 62, atk: 27, def: 28, spd: 22 },
    learnset: [
      { level: 1, skillId: 'razor_leaf' },
      { level: 1, skillId: 'leech_seed' },
      { level: 16, skillId: 'petal_blizzard' },
      { level: 20, skillId: 'solar_beam' },
    ],
    habitatZh: '星輝神殿森林 / 妙蛙種子進化',
    loreZh: '背上盛開的大花能將充沛陽光轉化為毀天滅地的日光束，散發安撫人心的芬芳。',
  },
  charmander: {
    id: 'charmander',
    dexNo: 3,
    nameZh: '小火龍',
    nameEn: 'Charmander',
    type: 'fire',
    rarity: 'rare',
    isStarterOption: true,
    catchRate: 0.45,
    expYield: 48,
    goldYield: 38,
    heightScale: 0.95,
    baseStats: { hp: 50, mp: 40, atk: 19, def: 13, spd: 18 },
    evolvesTo: { speciesId: 'charizard', level: 16 },
    learnset: [
      { level: 1, skillId: 'ember' },
      { level: 4, skillId: 'slash' },
      { level: 9, skillId: 'flame_wheel' },
      { level: 13, skillId: 'flamethrower' },
    ],
    habitatZh: '晨曦研究所 / 赤焰熔岩峽谷',
    loreZh: '尾巴上的火焰代表牠的生命力與鬥志，擁有極高的火系爆發力與敏捷身手。',
  },
  charizard: {
    id: 'charizard',
    dexNo: 4,
    nameZh: '噴火龍',
    nameEn: 'Charizard',
    type: 'fire',
    rarity: 'epic',
    catchRate: 0.2,
    expYield: 150,
    goldYield: 118,
    heightScale: 1.56,
    baseStats: { hp: 86, mp: 66, atk: 32, def: 23, spd: 29 },
    learnset: [
      { level: 1, skillId: 'flamethrower' },
      { level: 1, skillId: 'dragon_claw' },
      { level: 16, skillId: 'flare_blitz' },
      { level: 21, skillId: 'inferno_blast' },
    ],
    habitatZh: '赤焰峽谷深處 / 小火龍進化',
    loreZh: '展開雙翼翱翔天際的烈焰霸主，能吐出足以熔化巨岩的熾熱火柱。',
  },
  squirtle: {
    id: 'squirtle',
    dexNo: 5,
    nameZh: '傑尼龜',
    nameEn: 'Squirtle',
    type: 'water',
    rarity: 'rare',
    isStarterOption: true,
    catchRate: 0.45,
    expYield: 48,
    goldYield: 36,
    heightScale: 0.92,
    baseStats: { hp: 55, mp: 38, atk: 15, def: 19, spd: 14 },
    evolvesTo: { speciesId: 'blastoise', level: 16 },
    learnset: [
      { level: 1, skillId: 'water_gun' },
      { level: 4, skillId: 'tackle_plus' },
      { level: 9, skillId: 'bubble_beam' },
      { level: 13, skillId: 'aqua_tail' },
    ],
    habitatZh: '晨曦研究所 / 蔚藍潮汐海岸',
    loreZh: '堅硬的圓殼不僅能抵擋猛烈攻擊，還能減少水阻並噴射強勁水柱。',
  },
  blastoise: {
    id: 'blastoise',
    dexNo: 6,
    nameZh: '水箭龜',
    nameEn: 'Blastoise',
    type: 'water',
    rarity: 'epic',
    catchRate: 0.2,
    expYield: 148,
    goldYield: 114,
    heightScale: 1.5,
    baseStats: { hp: 90, mp: 64, atk: 26, def: 31, spd: 22 },
    learnset: [
      { level: 1, skillId: 'bubble_beam' },
      { level: 1, skillId: 'ice_beam' },
      { level: 16, skillId: 'surf' },
      { level: 20, skillId: 'hydro_pump' },
    ],
    habitatZh: '潮汐外海 / 傑尼龜進化',
    loreZh: '甲殼上的兩座重型噴射水炮精準無比，能以激流洞穿厚重鋼板。',
  },
  pikachu: {
    id: 'pikachu',
    dexNo: 7,
    nameZh: '皮卡丘',
    nameEn: 'Pikachu',
    type: 'electric',
    rarity: 'rare',
    isStarterOption: true,
    catchRate: 0.44,
    expYield: 56,
    goldYield: 44,
    heightScale: 0.88,
    baseStats: { hp: 52, mp: 46, atk: 20, def: 14, spd: 23 },
    learnset: [
      { level: 1, skillId: 'thunder_shock' },
      { level: 3, skillId: 'quick_attack' },
      { level: 8, skillId: 'electro_ball' },
      { level: 13, skillId: 'thunderbolt' },
      { level: 18, skillId: 'volt_tackle' },
    ],
    habitatZh: '晨曦研究所 / 翡翠微風草原',
    loreZh: '雙頰的電力囊儲存著滿滿電能，以閃電般的速度與十萬伏特聞名全大陸。',
  },
  eevee: {
    id: 'eevee',
    dexNo: 8,
    nameZh: '伊布',
    nameEn: 'Eevee',
    type: 'normal',
    rarity: 'common',
    catchRate: 0.68,
    expYield: 38,
    goldYield: 28,
    heightScale: 0.86,
    baseStats: { hp: 48, mp: 36, atk: 15, def: 14, spd: 16 },
    evolvesTo: { speciesId: 'sylveon', level: 14 },
    learnset: [
      { level: 1, skillId: 'tackle_plus' },
      { level: 3, skillId: 'quick_attack' },
      { level: 7, skillId: 'swift_star' },
      { level: 11, skillId: 'crunch' },
    ],
    habitatZh: '翡翠微風草原',
    loreZh: '擁有充滿無限可能性的基因結構，蓬鬆可愛且十分親近訓練員。',
  },
  sylveon: {
    id: 'sylveon',
    dexNo: 9,
    nameZh: '仙子伊布',
    nameEn: 'Sylveon',
    type: 'psychic',
    rarity: 'rare',
    catchRate: 0.36,
    expYield: 98,
    goldYield: 74,
    heightScale: 1.08,
    baseStats: { hp: 78, mp: 62, atk: 24, def: 24, spd: 21 },
    learnset: [
      { level: 1, skillId: 'swift_star' },
      { level: 1, skillId: 'draining_kiss' },
      { level: 14, skillId: 'calm_mind' },
      { level: 17, skillId: 'moonblast' },
    ],
    habitatZh: '蔚藍潮汐花海 / 伊布進化',
    loreZh: '搖曳著蝴蝶結般的觸角釋放柔和星輝，能平息戰意並施展華麗的月亮之力。',
  },
  jigglypuff: {
    id: 'jigglypuff',
    dexNo: 10,
    nameZh: '胖丁',
    nameEn: 'Jigglypuff',
    type: 'normal',
    rarity: 'common',
    catchRate: 0.72,
    expYield: 35,
    goldYield: 26,
    heightScale: 0.85,
    baseStats: { hp: 66, mp: 42, atk: 13, def: 12, spd: 11 },
    learnset: [
      { level: 1, skillId: 'tackle_plus' },
      { level: 2, skillId: 'sing_lullaby' },
      { level: 8, skillId: 'body_slam' },
      { level: 12, skillId: 'rest_heal' },
    ],
    habitatZh: '翡翠微風草原',
    loreZh: '圓滾滾的大眼睛輕輕轉動並唱起搖籃曲，能讓野生寶可夢昏睡，是捕獲好幫手！',
  },
  meowth: {
    id: 'meowth',
    dexNo: 11,
    nameZh: '喵喵',
    nameEn: 'Meowth',
    type: 'normal',
    rarity: 'common',
    catchRate: 0.7,
    expYield: 36,
    goldYield: 48,
    heightScale: 0.88,
    baseStats: { hp: 46, mp: 36, atk: 16, def: 12, spd: 20 },
    learnset: [
      { level: 1, skillId: 'quick_attack' },
      { level: 3, skillId: 'pay_day' },
      { level: 8, skillId: 'slash' },
      { level: 13, skillId: 'crunch' },
    ],
    habitatZh: '翡翠微風草原',
    loreZh: '最喜歡閃閃發光的金幣，招牌技能「聚寶功」能在對戰中為訓練員賺取額外金幣！',
  },
  magikarp: {
    id: 'magikarp',
    dexNo: 12,
    nameZh: '鯉魚王',
    nameEn: 'Magikarp',
    type: 'water',
    rarity: 'common',
    catchRate: 0.78,
    expYield: 26,
    goldYield: 22,
    heightScale: 0.86,
    baseStats: { hp: 42, mp: 28, atk: 11, def: 15, spd: 17 },
    evolvesTo: { speciesId: 'gyarados', level: 15 },
    learnset: [
      { level: 1, skillId: 'tackle_plus' },
      { level: 5, skillId: 'water_gun' },
      { level: 10, skillId: 'aqua_tail' },
    ],
    habitatZh: '蔚藍潮汐海岸淺灘',
    loreZh: '平時只會拼命跳躍，但只要耐心培育至 Lv.15，便會躍過龍門蛻變為威震四海的暴鯉龍！',
  },
  gyarados: {
    id: 'gyarados',
    dexNo: 13,
    nameZh: '暴鯉龍',
    nameEn: 'Gyarados',
    type: 'water',
    rarity: 'epic',
    catchRate: 0.22,
    expYield: 146,
    goldYield: 112,
    heightScale: 1.62,
    baseStats: { hp: 94, mp: 58, atk: 33, def: 24, spd: 25 },
    learnset: [
      { level: 1, skillId: 'aqua_tail' },
      { level: 1, skillId: 'crunch' },
      { level: 15, skillId: 'dragon_dance' },
      { level: 19, skillId: 'hydro_pump' },
    ],
    habitatZh: '蔚藍潮汐深海 / 鯉魚王進化',
    loreZh: '一旦發怒便會掀起滔天巨浪的深海霸者，龍之舞後的水系猛攻勢不可擋。',
  },
  lapras: {
    id: 'lapras',
    dexNo: 14,
    nameZh: '拉普拉斯',
    nameEn: 'Lapras',
    type: 'ice',
    rarity: 'epic',
    catchRate: 0.26,
    expYield: 125,
    goldYield: 95,
    heightScale: 1.44,
    baseStats: { hp: 98, mp: 64, atk: 24, def: 27, spd: 19 },
    learnset: [
      { level: 1, skillId: 'icy_wind' },
      { level: 1, skillId: 'sing_lullaby' },
      { level: 10, skillId: 'surf' },
      { level: 14, skillId: 'ice_beam' },
      { level: 19, skillId: 'blizzard' },
    ],
    habitatZh: '蔚藍潮汐海岸外灣',
    loreZh: '心地善良且聰慧的海之靈獸，能吟唱優美歌聲並駕馭極寒冰凍光束。',
  },
  growlithe: {
    id: 'growlithe',
    dexNo: 15,
    nameZh: '卡蒂狗',
    nameEn: 'Growlithe',
    type: 'fire',
    rarity: 'common',
    catchRate: 0.64,
    expYield: 44,
    goldYield: 34,
    heightScale: 0.9,
    baseStats: { hp: 52, mp: 36, atk: 18, def: 14, spd: 17 },
    evolvesTo: { speciesId: 'arcanine', level: 15 },
    learnset: [
      { level: 1, skillId: 'ember' },
      { level: 5, skillId: 'crunch' },
      { level: 9, skillId: 'flame_wheel' },
      { level: 13, skillId: 'flamethrower' },
    ],
    habitatZh: '赤焰熔岩峽谷',
    loreZh: '忠誠勇敢的小犬寶可夢，面對再強大的對手也絕不退縮半步。',
  },
  arcanine: {
    id: 'arcanine',
    dexNo: 16,
    nameZh: '風速狗',
    nameEn: 'Arcanine',
    type: 'fire',
    rarity: 'epic',
    catchRate: 0.24,
    expYield: 138,
    goldYield: 105,
    heightScale: 1.46,
    baseStats: { hp: 88, mp: 60, atk: 30, def: 24, spd: 28 },
    learnset: [
      { level: 1, skillId: 'flame_wheel' },
      { level: 1, skillId: 'crunch' },
      { level: 15, skillId: 'flamethrower' },
      { level: 18, skillId: 'flare_blitz' },
    ],
    habitatZh: '赤焰熔岩峽谷高地 / 卡蒂狗進化',
    loreZh: '威風凜凜的傳說疾風靈犬，奔跑姿態宛如貼地飛馳的烈焰疾風。',
  },
  riolu: {
    id: 'riolu',
    dexNo: 17,
    nameZh: '利歐路',
    nameEn: 'Riolu',
    type: 'fighting',
    rarity: 'rare',
    catchRate: 0.42,
    expYield: 52,
    goldYield: 42,
    heightScale: 0.88,
    baseStats: { hp: 49, mp: 40, atk: 19, def: 13, spd: 19 },
    evolvesTo: { speciesId: 'lucario', level: 15 },
    learnset: [
      { level: 1, skillId: 'quick_attack' },
      { level: 4, skillId: 'rock_smash' },
      { level: 9, skillId: 'force_palm' },
      { level: 13, skillId: 'swords_dance' },
    ],
    habitatZh: '赤焰熔岩峽谷修行岩場',
    loreZh: '擁有感知波導的天賦，日夜不懈鍛鍊身心的小格鬥家。',
  },
  lucario: {
    id: 'lucario',
    dexNo: 18,
    nameZh: '路卡利歐',
    nameEn: 'Lucario',
    type: 'fighting',
    rarity: 'epic',
    catchRate: 0.23,
    expYield: 142,
    goldYield: 108,
    heightScale: 1.32,
    baseStats: { hp: 82, mp: 66, atk: 32, def: 22, spd: 29 },
    learnset: [
      { level: 1, skillId: 'force_palm' },
      { level: 1, skillId: 'swords_dance' },
      { level: 15, skillId: 'aura_sphere' },
      { level: 19, skillId: 'close_combat' },
    ],
    habitatZh: '赤焰熔岩峽谷秘境 / 利歐路進化',
    loreZh: '操縱萬物波導的蒼藍武者，百發百中的波導彈與近身戰令強敵聞風喪膽。',
  },
  haunter: {
    id: 'haunter',
    dexNo: 19,
    nameZh: '鬼斯通',
    nameEn: 'Haunter',
    type: 'ghost',
    rarity: 'rare',
    catchRate: 0.4,
    expYield: 66,
    goldYield: 50,
    heightScale: 1.12,
    baseStats: { hp: 54, mp: 52, atk: 24, def: 15, spd: 25 },
    evolvesTo: { speciesId: 'gengar', level: 17 },
    learnset: [
      { level: 1, skillId: 'lick_shadow' },
      { level: 6, skillId: 'hypnosis' },
      { level: 11, skillId: 'shadow_ball' },
      { level: 15, skillId: 'dream_eater' },
    ],
    habitatZh: '幽影暮光森林',
    loreZh: '漂浮在夜霧中的雙手幽靈，擅長以催眠術與暗影球捉弄旅人。',
  },
  gengar: {
    id: 'gengar',
    dexNo: 20,
    nameZh: '耿鬼',
    nameEn: 'Gengar',
    type: 'ghost',
    rarity: 'epic',
    catchRate: 0.22,
    expYield: 146,
    goldYield: 112,
    heightScale: 1.32,
    baseStats: { hp: 78, mp: 72, atk: 33, def: 21, spd: 31 },
    learnset: [
      { level: 1, skillId: 'lick_shadow' },
      { level: 1, skillId: 'hypnosis' },
      { level: 14, skillId: 'shadow_ball' },
      { level: 17, skillId: 'dream_eater' },
    ],
    habitatZh: '幽影暮光森林深處 / 鬼斯通進化',
    loreZh: '潛伏在萬物影中的紫影魔王，露出一抹壞笑時四周溫度都會瞬間驟降。',
  },
  snorlax: {
    id: 'snorlax',
    dexNo: 21,
    nameZh: '卡比獸',
    nameEn: 'Snorlax',
    type: 'normal',
    rarity: 'epic',
    catchRate: 0.25,
    expYield: 136,
    goldYield: 102,
    heightScale: 1.58,
    baseStats: { hp: 118, mp: 52, atk: 28, def: 26, spd: 12 },
    learnset: [
      { level: 1, skillId: 'tackle_plus' },
      { level: 6, skillId: 'crunch' },
      { level: 10, skillId: 'body_slam' },
      { level: 13, skillId: 'rest_heal' },
      { level: 18, skillId: 'hyper_beam' },
    ],
    habitatZh: '翡翠微風草原大橋 / 幽影林地',
    loreZh: '擁有銅牆鐵壁般驚人體魄的貪睡巨獸，睡飽後的泰山壓頂威力驚人！',
  },
  gardevoir: {
    id: 'gardevoir',
    dexNo: 22,
    nameZh: '沙奈朵',
    nameEn: 'Gardevoir',
    type: 'psychic',
    rarity: 'epic',
    catchRate: 0.23,
    expYield: 144,
    goldYield: 110,
    heightScale: 1.36,
    baseStats: { hp: 80, mp: 76, atk: 32, def: 25, spd: 26 },
    learnset: [
      { level: 1, skillId: 'swift_star' },
      { level: 1, skillId: 'calm_mind' },
      { level: 13, skillId: 'psychic_wave' },
      { level: 17, skillId: 'moonblast' },
    ],
    habitatZh: '幽影暮光水晶林',
    loreZh: '優雅高貴的超能力守護者，為保護信任的訓練員能釋放扭曲空間的精神能量。',
  },
  dragonite: {
    id: 'dragonite',
    dexNo: 23,
    nameZh: '快龍',
    nameEn: 'Dragonite',
    type: 'dragon',
    rarity: 'epic',
    catchRate: 0.18,
    expYield: 168,
    goldYield: 135,
    heightScale: 1.56,
    baseStats: { hp: 96, mp: 68, atk: 34, def: 28, spd: 27 },
    learnset: [
      { level: 1, skillId: 'twister' },
      { level: 1, skillId: 'thunderbolt' },
      { level: 15, skillId: 'dragon_claw' },
      { level: 17, skillId: 'dragon_dance' },
      { level: 20, skillId: 'outrage' },
    ],
    habitatZh: '星輝神殿山巔',
    loreZh: '能以音速環繞星輝大陸飛行的幻之龍族，溫厚的外表下蘊藏著無匹龍威。',
  },
  mewtwo: {
    id: 'mewtwo',
    dexNo: 24,
    nameZh: '超夢',
    nameEn: 'Mewtwo',
    type: 'psychic',
    rarity: 'legendary',
    catchRate: 0.11,
    expYield: 260,
    goldYield: 350,
    heightScale: 1.54,
    baseStats: { hp: 112, mp: 90, atk: 39, def: 30, spd: 35 },
    learnset: [
      { level: 1, skillId: 'aura_sphere' },
      { level: 1, skillId: 'shadow_ball' },
      { level: 1, skillId: 'recover' },
      { level: 18, skillId: 'psystrike' },
    ],
    habitatZh: '星輝神殿之巔・星界祭壇',
    loreZh: '矗立於星輝神殿頂峰的傳說超能力王者，擁有凌駕萬物的精神擊破神技。',
  },
};

export const POKEMON_LIST = Object.values(POKEMON_SPECIES).sort((a, b) => a.dexNo - b.dexNo);
export const STARTER_IDS = ['charmander', 'squirtle', 'bulbasaur', 'pikachu'];

export function expForNextLevel(level) {
  const lv = Math.max(1, Math.round(level));
  return Math.round(28 + lv * lv * 7.5 + lv * 14);
}

export function computeStatsForLevel(speciesId, level) {
  const sp = POKEMON_SPECIES[speciesId];
  if (!sp) throw new Error(`Unknown species: ${speciesId}`);
  const lv = Math.max(1, Math.round(level));
  const growth = 1 + (lv - 1) * 0.115;
  return {
    maxHp: Math.round(sp.baseStats.hp * growth + (lv - 1) * 3.2),
    maxMp: Math.round(sp.baseStats.mp * (1 + (lv - 1) * 0.075) + (lv - 1) * 1.4),
    atk: Math.round(sp.baseStats.atk * growth + (lv - 1) * 0.8),
    def: Math.round(sp.baseStats.def * growth + (lv - 1) * 0.75),
    spd: Math.round(sp.baseStats.spd * growth + (lv - 1) * 0.75),
  };
}

export function getUnlockedSkills(speciesId, level) {
  const sp = POKEMON_SPECIES[speciesId];
  if (!sp) return [];
  const unlocked = sp.learnset
    .filter((entry) => entry.level <= level && SKILLS[entry.skillId])
    .map((entry) => SKILLS[entry.skillId]);
  if (unlocked.length === 0 && sp.learnset[0] && SKILLS[sp.learnset[0].skillId]) {
    unlocked.push(SKILLS[sp.learnset[0].skillId]);
  }
  return unlocked.slice(-4);
}

let localUidCounter = 0;
export function createPokemonInstance(speciesId, level = 5, opts = {}) {
  const sp = POKEMON_SPECIES[speciesId];
  if (!sp) throw new Error(`Unknown species: ${speciesId}`);
  const stats = computeStatsForLevel(speciesId, level);
  localUidCounter += 1;
  const uid = opts.uid || `mon_${Date.now().toString(36)}_${localUidCounter}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    uid,
    speciesId,
    nickname: opts.nickname || '',
    level,
    exp: 0,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    mp: stats.maxMp,
    maxMp: stats.maxMp,
    atk: stats.atk,
    def: stats.def,
    spd: stats.spd,
    status: null,
    caughtBall: opts.caughtBall || 'pokeball',
    caughtZone: opts.caughtZone || 'dawnleaf',
    isStarter: Boolean(opts.isStarter),
  };
}

export function grantExpAndLevelUp(mon, amount) {
  const events = [];
  if (!mon || amount <= 0) return events;
  mon.exp = (mon.exp || 0) + Math.round(amount);

  while (mon.level < 99) {
    const needed = expForNextLevel(mon.level);
    if (mon.exp < needed) break;
    mon.exp -= needed;
    const prevLevel = mon.level;
    const prevSkills = new Set(getUnlockedSkills(mon.speciesId, prevLevel).map((s) => s.id));
    mon.level += 1;

    const oldMaxHp = mon.maxHp;
    const oldMaxMp = mon.maxMp;
    const nextStats = computeStatsForLevel(mon.speciesId, mon.level);
    mon.maxHp = nextStats.maxHp;
    mon.maxMp = nextStats.maxMp;
    mon.atk = nextStats.atk;
    mon.def = nextStats.def;
    mon.spd = nextStats.spd;

    if (mon.hp > 0) {
      mon.hp = Math.min(mon.maxHp, mon.hp + Math.max(4, mon.maxHp - oldMaxHp));
    }
    mon.mp = Math.min(mon.maxMp, mon.mp + Math.max(3, mon.maxMp - oldMaxMp));

    const newSkills = getUnlockedSkills(mon.speciesId, mon.level)
      .filter((s) => !prevSkills.has(s.id));

    events.push({
      type: 'level_up',
      uid: mon.uid,
      speciesId: mon.speciesId,
      level: mon.level,
      newSkills: newSkills.map((s) => s.nameZh),
    });

    const sp = POKEMON_SPECIES[mon.speciesId];
    if (sp?.evolvesTo && mon.level >= sp.evolvesTo.level) {
      const fromSpecies = sp;
      const toSpecies = POKEMON_SPECIES[sp.evolvesTo.speciesId];
      if (toSpecies) {
        const hpRatio = mon.maxHp > 0 ? mon.hp / mon.maxHp : 1;
        const mpRatio = mon.maxMp > 0 ? mon.mp / mon.maxMp : 1;
        mon.speciesId = toSpecies.id;
        const evoStats = computeStatsForLevel(toSpecies.id, mon.level);
        mon.maxHp = evoStats.maxHp;
        mon.maxMp = evoStats.maxMp;
        mon.atk = evoStats.atk;
        mon.def = evoStats.def;
        mon.spd = evoStats.spd;
        mon.hp = mon.hp > 0 ? Math.max(1, Math.round(evoStats.maxHp * Math.max(0.65, hpRatio))) : 0;
        mon.mp = Math.max(1, Math.round(evoStats.maxMp * Math.max(0.65, mpRatio)));
        events.push({
          type: 'evolve',
          uid: mon.uid,
          fromId: fromSpecies.id,
          fromNameZh: fromSpecies.nameZh,
          toId: toSpecies.id,
          toNameZh: toSpecies.nameZh,
          level: mon.level,
        });
      }
    }
  }
  return events;
}
