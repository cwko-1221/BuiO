'use strict';

// This is an original, cumulative SSP-style supplementary sequence. It does
// not claim to reproduce or replace a school's chosen validated programme.
// Each carriage is one grapheme representing one phoneme. Adjacent consonants
// such as s+t are deliberately kept in separate carriages.
const segment = (text, ipaGb, ipaUs = ipaGb) => ({ text, ipaGb, ipaUs });
const word = (id, spelling, emoji, zh, segments, mode = 'phoneme') => ({
  id, spelling, emoji, zh, segments, mode,
});

const LEVELS = [
  {
    id: 'first-sounds', order: 1, title: 'First Sounds', subtitle: '第一組音：s a t p i n', badge: 's·a',
    description: '先學少量常用音，再由左至右拼成簡單單字。',
    words: [
      word('sat', 'sat', '🪑', '坐', [segment('s', 's'), segment('a', 'æ'), segment('t', 't')]),
      word('pin', 'pin', '📌', '大頭針', [segment('p', 'p'), segment('i', 'ɪ'), segment('n', 'n')]),
      word('tap', 'tap', '🚰', '水龍頭', [segment('t', 't'), segment('a', 'æ'), segment('p', 'p')]),
      word('sit', 'sit', '🪑', '坐下', [segment('s', 's'), segment('i', 'ɪ'), segment('t', 't')]),
      word('pat', 'pat', '✋', '輕拍', [segment('p', 'p'), segment('a', 'æ'), segment('t', 't')]),
      word('nap', 'nap', '😴', '小睡', [segment('n', 'n'), segment('a', 'æ'), segment('p', 'p')]),
    ],
  },
  {
    id: 'more-sounds', order: 2, title: 'More Sounds', subtitle: '加入 m d g o c k ck e u r', badge: 'c·k',
    description: '重用已學音素，逐步加入新的字母與短元音。',
    words: [
      word('mat', 'mat', '🧘', '墊', [segment('m', 'm'), segment('a', 'æ'), segment('t', 't')]),
      word('dog', 'dog', '🐶', '狗', [segment('d', 'd'), segment('o', 'ɒ', 'ɑ'), segment('g', 'ɡ')]),
      word('cat', 'cat', '🐱', '貓', [segment('c', 'k'), segment('a', 'æ'), segment('t', 't')]),
      word('cup', 'cup', '🥤', '杯', [segment('c', 'k'), segment('u', 'ʌ'), segment('p', 'p')]),
      word('red', 'red', '🔴', '紅色', [segment('r', 'ɹ'), segment('e', 'ɛ'), segment('d', 'd')]),
      word('duck', 'duck', '🦆', '鴨', [segment('d', 'd'), segment('u', 'ʌ'), segment('ck', 'k')]),
    ],
  },
  {
    id: 'complete-basic-code', order: 3, title: 'Basic Code', subtitle: '加入 f l j v w y b h', badge: 'f·l',
    description: '繼續以三音單字練習純音與連續拼合。',
    words: [
      word('fin', 'fin', '🐟', '魚鰭', [segment('f', 'f'), segment('i', 'ɪ'), segment('n', 'n')]),
      word('lip', 'lip', '👄', '嘴唇', [segment('l', 'l'), segment('i', 'ɪ'), segment('p', 'p')]),
      word('jam', 'jam', '🍓', '果醬', [segment('j', 'dʒ'), segment('a', 'æ'), segment('m', 'm')]),
      word('van', 'van', '🚐', '客貨車', [segment('v', 'v'), segment('a', 'æ'), segment('n', 'n')]),
      word('web', 'web', '🕸️', '蜘蛛網', [segment('w', 'w'), segment('e', 'ɛ'), segment('b', 'b')]),
      word('yes', 'yes', '✅', '是', [segment('y', 'j'), segment('e', 'ɛ'), segment('s', 's')]),
    ],
  },
  {
    id: 'digraphs', order: 4, title: 'Digraphs', subtitle: '二合字母：sh ch th ng', badge: 'sh',
    description: '兩個字母可共用一節車廂，代表一個音素。',
    words: [
      word('ship', 'ship', '🚢', '船', [segment('sh', 'ʃ'), segment('i', 'ɪ'), segment('p', 'p')]),
      word('chat', 'chat', '💬', '聊天', [segment('ch', 'tʃ'), segment('a', 'æ'), segment('t', 't')]),
      word('thin', 'thin', '📏', '薄', [segment('th', 'θ'), segment('i', 'ɪ'), segment('n', 'n')]),
      word('ring', 'ring', '💍', '戒指', [segment('r', 'ɹ'), segment('i', 'ɪ'), segment('ng', 'ŋ')]),
      word('fish', 'fish', '🐟', '魚', [segment('f', 'f'), segment('i', 'ɪ'), segment('sh', 'ʃ')]),
      word('much', 'much', '📦', '很多', [segment('m', 'm'), segment('u', 'ʌ'), segment('ch', 'tʃ')]),
    ],
  },
  {
    id: 'adjacent-consonants', order: 5, title: 'Adjacent Consonants', subtitle: '相鄰輔音逐個拼', badge: 's·t',
    description: '每個相鄰輔音仍是獨立音素，例如 stop 是 /s/ /t/ /ɒ/ /p/。',
    words: [
      word('stop', 'stop', '🛑', '停止', [segment('s', 's'), segment('t', 't'), segment('o', 'ɒ', 'ɑ'), segment('p', 'p')]),
      word('frog', 'frog', '🐸', '青蛙', [segment('f', 'f'), segment('r', 'ɹ'), segment('o', 'ɒ', 'ɑ'), segment('g', 'ɡ')]),
      word('clap', 'clap', '👏', '拍手', [segment('c', 'k'), segment('l', 'l'), segment('a', 'æ'), segment('p', 'p')]),
      word('drum', 'drum', '🥁', '鼓', [segment('d', 'd'), segment('r', 'ɹ'), segment('u', 'ʌ'), segment('m', 'm')]),
      word('flag', 'flag', '🚩', '旗', [segment('f', 'f'), segment('l', 'l'), segment('a', 'æ'), segment('g', 'ɡ')]),
      word('step', 'step', '👣', '步', [segment('s', 's'), segment('t', 't'), segment('e', 'ɛ'), segment('p', 'p')]),
    ],
  },
  {
    id: 'split-digraphs', order: 6, title: 'Split Digraphs', subtitle: '分隔二合字母', badge: 'a·e',
    description: 'a_e、i_e、o_e、u_e 的兩個字母共同表示一個元音。',
    words: [
      word('name', 'name', '🏷️', '名字', [segment('n', 'n'), segment('a_e', 'eɪ'), segment('m', 'm')]),
      word('cake', 'cake', '🍰', '蛋糕', [segment('c', 'k'), segment('a_e', 'eɪ'), segment('k', 'k')]),
      word('five', 'five', '5️⃣', '五', [segment('f', 'f'), segment('i_e', 'aɪ'), segment('v', 'v')]),
      word('bike', 'bike', '🚲', '單車', [segment('b', 'b'), segment('i_e', 'aɪ'), segment('k', 'k')]),
      word('home', 'home', '🏠', '家', [segment('h', 'h'), segment('o_e', 'əʊ', 'oʊ'), segment('m', 'm')]),
      word('cute', 'cute', '😊', '可愛', [segment('c', 'k'), segment('u_e', 'juː'), segment('t', 't')]),
    ],
  },
  {
    id: 'vowel-teams', order: 7, title: 'Vowel Teams', subtitle: '元音字母組合', badge: 'ai',
    description: '比較 ai、ee、oa、oo、oi 的常見讀音。',
    words: [
      word('rain', 'rain', '🌧️', '雨', [segment('r', 'ɹ'), segment('ai', 'eɪ'), segment('n', 'n')]),
      word('feet', 'feet', '🦶', '腳', [segment('f', 'f'), segment('ee', 'iː'), segment('t', 't')]),
      word('boat', 'boat', '⛵', '小船', [segment('b', 'b'), segment('oa', 'əʊ', 'oʊ'), segment('t', 't')]),
      word('moon', 'moon', '🌙', '月亮', [segment('m', 'm'), segment('oo', 'uː'), segment('n', 'n')]),
      word('book', 'book', '📖', '書', [segment('b', 'b'), segment('oo', 'ʊ'), segment('k', 'k')]),
      word('coin', 'coin', '🪙', '硬幣', [segment('c', 'k'), segment('oi', 'ɔɪ'), segment('n', 'n')]),
    ],
  },
  {
    id: 'syllable-express', order: 8, title: 'Syllable Express', subtitle: '雙音節拼讀延伸', badge: '2',
    description: '先把每個已學字形拼成音節，再合成較長單字。',
    words: [
      word('sunset', 'sunset', '🌇', '日落', [segment('sun', 'sʌn'), segment('set', 'sɛt')], 'syllable'),
      word('picnic', 'picnic', '🧺', '野餐', [segment('pic', 'pɪk'), segment('nic', 'nɪk')], 'syllable'),
      word('rabbit', 'rabbit', '🐰', '兔子', [segment('rab', 'ɹæb'), segment('bit', 'ɪt')], 'syllable'),
      word('napkin', 'napkin', '🧻', '餐巾', [segment('nap', 'næp'), segment('kin', 'kɪn')], 'syllable'),
      word('lunchbox', 'lunchbox', '🍱', '午餐盒', [segment('lunch', 'lʌntʃ'), segment('box', 'bɒks', 'bɑks')], 'syllable'),
      word('cupcake', 'cupcake', '🧁', '紙杯蛋糕', [segment('cup', 'kʌp'), segment('cake', 'keɪk')], 'syllable'),
    ],
  },
];

const WORDS = new Map();
for (const level of LEVELS) {
  for (const entry of level.words) {
    if (WORDS.has(entry.id)) throw new Error(`Duplicate phonics word id: ${entry.id}`);
    WORDS.set(entry.id, { ...entry, levelId: level.id, levelOrder: level.order });
  }
}

function getWord(wordId) { return WORDS.get(String(wordId || '')) || null; }

function publicCatalog(accent = 'en-gb') {
  return LEVELS.map(level => ({
    ...level,
    words: level.words.map(entry => ({
      id: entry.id,
      spelling: entry.spelling,
      emoji: entry.emoji,
      zh: entry.zh,
      mode: entry.mode,
      segments: entry.segments.map(item => ({
        text: item.text,
        ipa: accent === 'en-us' ? item.ipaUs : item.ipaGb,
      })),
    })),
  }));
}

module.exports = { LEVELS, getWord, publicCatalog };
