'use strict';

// This is an original, cumulative SSP-style supplementary sequence. It does
// not claim to reproduce or replace a school's chosen validated programme.
// Each carriage is one grapheme representing one phoneme. Adjacent consonants
// such as s+t are deliberately kept in separate carriages.
const segment = (text, ipaGb, ipaUs = ipaGb) => ({ text, ipaGb, ipaUs });
// zh and en are the clue the child reads; the spelling is what they blend,
// so the clue never contains it.
const word = (id, spelling, emoji, zh, en, segments, mode = 'phoneme') => ({
  id, spelling, emoji, zh, en, segments, mode,
});

const LEVELS = [
  {
    id: 'first-sounds', order: 1, title: 'First Sounds', subtitle: '第一組音：s a t p i n', subtitleEn: 'First sounds: s a t p i n', badge: 's·a',
    description: '先學少量常用音，再由左至右拼成簡單單字。', descriptionEn: 'Start with a few common sounds, then blend left to right into simple words.',
    words: [
      word('sat', 'sat', '🪑', '坐', 'sat down', [segment('s', 's'), segment('a', 'æ'), segment('t', 't')]),
      word('pin', 'pin', '📌', '大頭針', 'a sharp pin', [segment('p', 'p'), segment('i', 'ɪ'), segment('n', 'n')]),
      word('tap', 'tap', '🚰', '水龍頭', 'a water tap', [segment('t', 't'), segment('a', 'æ'), segment('p', 'p')]),
      word('sit', 'sit', '🪑', '坐下', 'to sit down', [segment('s', 's'), segment('i', 'ɪ'), segment('t', 't')]),
      word('pat', 'pat', '✋', '輕拍', 'a gentle pat', [segment('p', 'p'), segment('a', 'æ'), segment('t', 't')]),
      word('nap', 'nap', '😴', '小睡', 'a short sleep', [segment('n', 'n'), segment('a', 'æ'), segment('p', 'p')]),
    ],
  },
  {
    id: 'more-sounds', order: 2, title: 'More Sounds', subtitle: '加入 m d g o c k ck e u r', subtitleEn: 'Adding m d g o c k ck e u r', badge: 'c·k',
    description: '重用已學音素，逐步加入新的字母與短元音。', descriptionEn: 'Reuse the sounds you know, adding new letters and short vowels.',
    words: [
      word('mat', 'mat', '🧘', '墊', 'a floor mat', [segment('m', 'm'), segment('a', 'æ'), segment('t', 't')]),
      word('dog', 'dog', '🐶', '狗', 'a pet that barks', [segment('d', 'd'), segment('o', 'ɒ', 'ɑ'), segment('g', 'ɡ')]),
      word('cat', 'cat', '🐱', '貓', 'a pet that miaows', [segment('c', 'k'), segment('a', 'æ'), segment('t', 't')]),
      word('cup', 'cup', '🥤', '杯', 'you drink from it', [segment('c', 'k'), segment('u', 'ʌ'), segment('p', 'p')]),
      word('red', 'red', '🔴', '紅色', 'the colour of a tomato', [segment('r', 'ɹ'), segment('e', 'ɛ'), segment('d', 'd')]),
      word('duck', 'duck', '🦆', '鴨', 'a bird on a pond', [segment('d', 'd'), segment('u', 'ʌ'), segment('ck', 'k')]),
    ],
  },
  {
    id: 'complete-basic-code', order: 3, title: 'Basic Code', subtitle: '加入 f l j v w y b h', subtitleEn: 'Adding f l j v w y b h', badge: 'f·l',
    description: '繼續以三音單字練習純音與連續拼合。', descriptionEn: 'Keep practising pure sounds and smooth blending with three-sound words.',
    words: [
      word('fin', 'fin', '🐟', '魚鰭', 'a fish uses it to swim', [segment('f', 'f'), segment('i', 'ɪ'), segment('n', 'n')]),
      word('lip', 'lip', '👄', '嘴唇', 'part of your mouth', [segment('l', 'l'), segment('i', 'ɪ'), segment('p', 'p')]),
      word('jam', 'jam', '🍓', '果醬', 'fruit spread for toast', [segment('j', 'dʒ'), segment('a', 'æ'), segment('m', 'm')]),
      word('van', 'van', '🚐', '客貨車', 'a small truck', [segment('v', 'v'), segment('a', 'æ'), segment('n', 'n')]),
      word('web', 'web', '🕸️', '蜘蛛網', 'a spider spins it', [segment('w', 'w'), segment('e', 'ɛ'), segment('b', 'b')]),
      word('yes', 'yes', '✅', '是', 'the opposite of no', [segment('y', 'j'), segment('e', 'ɛ'), segment('s', 's')]),
    ],
  },
  {
    id: 'digraphs', order: 4, title: 'Digraphs', subtitle: '二合字母：sh ch th ng', subtitleEn: 'Digraphs: sh ch th ng', badge: 'sh',
    description: '兩個字母可共用一節車廂，代表一個音素。', descriptionEn: 'Two letters can share one carriage and stand for a single sound.',
    words: [
      word('ship', 'ship', '🚢', '船', 'a very big boat', [segment('sh', 'ʃ'), segment('i', 'ɪ'), segment('p', 'p')]),
      word('chat', 'chat', '💬', '聊天', 'to talk with a friend', [segment('ch', 'tʃ'), segment('a', 'æ'), segment('t', 't')]),
      word('thin', 'thin', '📏', '薄', 'the opposite of thick', [segment('th', 'θ'), segment('i', 'ɪ'), segment('n', 'n')]),
      word('ring', 'ring', '💍', '戒指', 'you wear it on a finger', [segment('r', 'ɹ'), segment('i', 'ɪ'), segment('ng', 'ŋ')]),
      word('fish', 'fish', '🐟', '魚', 'it swims in the sea', [segment('f', 'f'), segment('i', 'ɪ'), segment('sh', 'ʃ')]),
      word('much', 'much', '📦', '很多', 'a large amount', [segment('m', 'm'), segment('u', 'ʌ'), segment('ch', 'tʃ')]),
    ],
  },
  {
    id: 'adjacent-consonants', order: 5, title: 'Adjacent Consonants', subtitle: '相鄰輔音逐個拼', subtitleEn: 'Blend adjacent consonants one at a time', badge: 's·t',
    description: '每個相鄰輔音仍是獨立音素，例如 stop 是 /s/ /t/ /ɒ/ /p/。', descriptionEn: 'Each adjacent consonant is still its own sound — stop is /s/ /t/ /ɒ/ /p/.',
    words: [
      word('stop', 'stop', '🛑', '停止', 'the opposite of go', [segment('s', 's'), segment('t', 't'), segment('o', 'ɒ', 'ɑ'), segment('p', 'p')]),
      word('frog', 'frog', '🐸', '青蛙', 'a green animal that hops', [segment('f', 'f'), segment('r', 'ɹ'), segment('o', 'ɒ', 'ɑ'), segment('g', 'ɡ')]),
      word('clap', 'clap', '👏', '拍手', 'you do it with two hands', [segment('c', 'k'), segment('l', 'l'), segment('a', 'æ'), segment('p', 'p')]),
      word('drum', 'drum', '🥁', '鼓', 'you beat it to make a sound', [segment('d', 'd'), segment('r', 'ɹ'), segment('u', 'ʌ'), segment('m', 'm')]),
      word('flag', 'flag', '🚩', '旗', 'it waves on a pole', [segment('f', 'f'), segment('l', 'l'), segment('a', 'æ'), segment('g', 'ɡ')]),
      word('step', 'step', '👣', '步', 'one footstep', [segment('s', 's'), segment('t', 't'), segment('e', 'ɛ'), segment('p', 'p')]),
    ],
  },
  {
    id: 'split-digraphs', order: 6, title: 'Split Digraphs', subtitle: '分隔二合字母', subtitleEn: 'Split digraphs', badge: 'a·e',
    description: 'a_e、i_e、o_e、u_e 的兩個字母共同表示一個元音。', descriptionEn: 'In a_e, i_e, o_e and u_e the two letters together make one vowel sound.',
    words: [
      word('name', 'name', '🏷️', '名字', 'what people call you', [segment('n', 'n'), segment('a_e', 'eɪ'), segment('m', 'm')]),
      word('cake', 'cake', '🍰', '蛋糕', 'a treat with candles on it', [segment('c', 'k'), segment('a_e', 'eɪ'), segment('k', 'k')]),
      word('five', 'five', '5️⃣', '五', 'the number after four', [segment('f', 'f'), segment('i_e', 'aɪ'), segment('v', 'v')]),
      word('bike', 'bike', '🚲', '單車', 'two wheels you can ride', [segment('b', 'b'), segment('i_e', 'aɪ'), segment('k', 'k')]),
      word('home', 'home', '🏠', '家', 'the place where you live', [segment('h', 'h'), segment('o_e', 'əʊ', 'oʊ'), segment('m', 'm')]),
      word('cute', 'cute', '😊', '可愛', 'sweet and lovely', [segment('c', 'k'), segment('u_e', 'juː'), segment('t', 't')]),
    ],
  },
  {
    id: 'vowel-teams', order: 7, title: 'Vowel Teams', subtitle: '元音字母組合', subtitleEn: 'Vowel teams', badge: 'ai',
    description: '比較 ai、ee、oa、oo、oi 的常見讀音。', descriptionEn: 'Compare the usual sounds of ai, ee, oa, oo and oi.',
    words: [
      word('rain', 'rain', '🌧️', '雨', 'water falling from clouds', [segment('r', 'ɹ'), segment('ai', 'eɪ'), segment('n', 'n')]),
      word('feet', 'feet', '🦶', '腳', 'you stand on them', [segment('f', 'f'), segment('ee', 'iː'), segment('t', 't')]),
      word('boat', 'boat', '⛵', '小船', 'it floats on water', [segment('b', 'b'), segment('oa', 'əʊ', 'oʊ'), segment('t', 't')]),
      word('moon', 'moon', '🌙', '月亮', 'it shines in the night sky', [segment('m', 'm'), segment('oo', 'uː'), segment('n', 'n')]),
      word('book', 'book', '📖', '書', 'you read it', [segment('b', 'b'), segment('oo', 'ʊ'), segment('k', 'k')]),
      word('coin', 'coin', '🪙', '硬幣', 'round metal money', [segment('c', 'k'), segment('oi', 'ɔɪ'), segment('n', 'n')]),
    ],
  },
  {
    id: 'syllable-express', order: 8, title: 'Syllable Express', subtitle: '雙音節拼讀延伸', subtitleEn: 'Two-syllable blending', badge: '2',
    description: '先把每個已學字形拼成音節，再合成較長單字。', descriptionEn: 'Blend each familiar spelling into a syllable, then join them into a longer word.',
    words: [
      word('sunset', 'sunset', '🌇', '日落', 'when the sun goes down', [segment('sun', 'sʌn'), segment('set', 'sɛt')], 'syllable'),
      word('picnic', 'picnic', '🧺', '野餐', 'a meal eaten outdoors', [segment('pic', 'pɪk'), segment('nic', 'nɪk')], 'syllable'),
      word('rabbit', 'rabbit', '🐰', '兔子', 'long ears, and it hops', [segment('rab', 'ɹæb'), segment('bit', 'ɪt')], 'syllable'),
      word('napkin', 'napkin', '🧻', '餐巾', 'you wipe your mouth with it', [segment('nap', 'næp'), segment('kin', 'kɪn')], 'syllable'),
      word('lunchbox', 'lunchbox', '🍱', '午餐盒', 'it carries your lunch', [segment('lunch', 'lʌntʃ'), segment('box', 'bɒks', 'bɑks')], 'syllable'),
      word('cupcake', 'cupcake', '🧁', '紙杯蛋糕', 'a small cake with icing', [segment('cup', 'kʌp'), segment('cake', 'keɪk')], 'syllable'),
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
      en: entry.en,
      mode: entry.mode,
      segments: entry.segments.map(item => ({
        text: item.text,
        ipa: accent === 'en-us' ? item.ipaUs : item.ipaGb,
      })),
    })),
  }));
}

module.exports = { LEVELS, getWord, publicCatalog };
