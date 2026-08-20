'use strict';

const crypto = require('crypto');
const fs = require('node:fs');
const path = require('node:path');
const furnitureSets = require('./furniture-sets');
const CATALOG_VERSION = '2026.08.13-1';

/**
 * Sprite atlas layout, read from the generated manifest so the build pipeline stays the single
 * source of truth for frame counts. The client cannot fetch the manifest itself — /pet/assets
 * only serves hashed .js/.css/.webp — so the layout rides along with the catalog in /bootstrap.
 *
 * The manifest's `columns` is a per-frame action label, so consecutive runs collapse into
 * {name, start, length} ranges that map directly onto Phaser animation frame ranges.
 */
function loadAnimationLayout() {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'art', 'sprites', 'manifest.json'), 'utf8'));
    if (!manifest.actions || !Array.isArray(manifest.rows)) return null;
    // The sheet is a grid, one action per row, so an action's frames are contiguous from its
    // start index in reading order. Take the ranges the generator published rather than
    // re-deriving them from per-cell labels, which now include nulls where a short action is
    // padded out to the grid width.
    const actions = Object.entries(manifest.actions).map(([name, action]) => ({
      name, start: action.start, length: action.count,
    }));
    return {
      frameWidth: manifest.frameWidth,
      frameHeight: manifest.frameHeight,
      // Cells occupied by one direction, used to offset into the right block if the sheet
      // ever carries more than one again.
      framesPerDirection: (manifest.gridColumns || manifest.columns.length) * (manifest.gridRows || 1),
      fps: manifest.fps || 24,
      directions: manifest.rows,
      actions,
    };
  } catch {
    return null; // No atlases generated yet; the runtime falls back to the static form art.
  }
}
const artPath = (folder, id) => {
  const hash = crypto.createHash('sha256').update(`${CATALOG_VERSION}:${folder}:${id}`).digest('hex').slice(0, 10);
  return `/pet/assets/art/${folder}/${id}-${hash}.webp`;
};

/**
 * Where each creature is actually drawn inside its atlas cell, as 0..1 fractions of the cell.
 * Cells are square and no creature fills one, so accessories anchored to the cell float above a
 * short form and sink into a tall one. Generated alongside the collectible metrics.
 */
const readSpriteMetrics = (name) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'art', 'sprites', name), 'utf8'));
  } catch {
    return {};
  }
};

const BODY_METRICS = readSpriteMetrics('body-metrics.json');

/**
 * Per-frame movement of those landmarks, base64 signed bytes, four per atlas cell. Without it a
 * worn item holds still while the creature breathes out from under it.
 */
const FRAME_MOTION = readSpriteMetrics('frame-motion.json');

const PETS = [
  ['starpatch-cat','common','light',['星斑幼貓','月影貓','星鬃獵貓','天穹星獅'],['Starpatch Kitten','Moonshadow Cat','Star-Mane Hunter','Skybound Star Lion'],'幸運飛撲','Lucky Pounce','#f4c45e','cat'],
  ['cloud-ear-dog','common','wind',['雲耳幼犬','追風犬','霧嶺牧犬','蒼穹守望犬'],['Cloud-ear Pup','Windchaser','Mist Ridge Sheepdog','Skywatch Hound'],'順風奔跑','Tailwind Run','#82cde7','dog'],
  ['pudding-pig','common','earth',['布丁小豬','焦糖豬','岩甲野豬','豐穰巨豬'],['Pudding Piglet','Caramel Pig','Rockplate Boar','Harvest Grandboar'],'松露衝撞','Truffle Charge','#efa6a1','pig'],
  ['crescent-rabbit','common','light',['月芽兔','銀弦兔','月輪迅兔','星月聖兔'],['Crescent Bunny','Silversong Rabbit','Moonwheel Runner','Starlit Moon Hare'],'月光跳躍','Moonlight Hop','#d7c7f2','rabbit'],
  ['bubble-otter','common','water',['泡泡水獺','溪流水獺','潮汐水獺','海冠獺王'],['Bubble Otter','Stream Otter','Tide Otter','Sea-crown Otter King'],'泡泡護盾','Bubble Guard','#5bc4df','otter'],
  ['mossback-turtle','common','nature',['苔背小龜','花園龜','古木甲龜','世界樹龜'],['Mossback Hatchling','Garden Turtle','Ancient Bark Turtle','World-tree Tortoise'],'堅殼守護','Shell Ward','#78b96d','turtle'],
  ['spark-hamster','common','fire',['火花鼠','炭丸鼠','爆焰跑鼠','太陽輪鼠'],['Spark Hamster','Coalball Hamster','Blazewheel Runner','Sunwheel Hamster'],'火花連射','Spark Volley','#f49a52','hamster'],
  ['leaftail-fox','common','nature',['葉尾幼狐','藤影狐','森語靈狐','翠冠靈狐'],['Leaftail Kit','Vine-shadow Fox','Forestwhisper Fox','Emerald-crown Spirit Fox'],'藤蔓纏繞','Vine Snare','#6fbd79','fox'],
  ['snowfeather-penguin','rare','ice',['雪羽幼企鵝','冰帆企鵝','極光企鵝','冰海皇企鵝'],['Snowfeather Chick','Ice-sail Penguin','Aurora Penguin','Ice-sea Emperor Penguin'],'冰霜啄擊','Frost Peck','#8bd5ed','penguin'],
  ['thunderhorn-goat','rare','electric',['雷角小羊','電蹄山羊','風暴岩羊','天雷戰羊'],['Thunderhorn Kid','Sparkhoof Goat','Storm Ibex','Sky-thunder Ram'],'連鎖雷蹄','Chain Hoof','#e1bd43','goat'],
  ['coral-seal','rare','water',['珊瑚幼豹','礁光海豹','深藍海豹','珊瑚海王豹'],['Coral Pup','Reefglow Seal','Deepblue Seal','Coral Sea King'],'潮汐拍擊','Tidal Clap','#58b9cf','seal'],
  ['bamboo-panda','rare','nature',['竹糰熊貓','青竹武者','翠甲熊貓','千竹守護者'],['Bamboo Cub','Green Bamboo Adept','Jade-armour Panda','Guardian of a Thousand Bamboos'],'竹葉旋風','Bamboo Spin','#6aae65','panda'],
  ['nightwing-bat','rare','shadow',['夜翼小蝠','暮影蝠','月蝕蝠','永夜翼王'],['Nightwing Pup','Twilight Bat','Eclipse Bat','Evernight Wing King'],'夜影吸收','Night Siphon','#8067ad','bat'],
  ['crystal-deer','rare','ice-light',['晶芽小鹿','稜光鹿','冰晶角鹿','曙光晶鹿'],['Crystal Fawn','Prism Deer','Ice-crystal Stag','Dawn Crystal Hart'],'晶光治療','Crystal Heal','#a5d9df','deer'],
  ['ink-raccoon','rare','shadow',['墨點小狸','影步狸','幻墨狸','萬象墨靈'],['Inkspot Kit','Shadowstep Raccoon','Phantom-ink Raccoon','Living Ink Spirit'],'墨影分身','Ink Decoy','#596279','raccoon'],
  ['emberwing-dragon','epic','fire',['熾殼龍仔','焰翼幼龍','火山翼龍','日冕熾龍'],['Embershell Whelp','Flamewing Drake','Volcanic Wing Dragon','Corona Ember Dragon'],'烈焰吐息','Flame Breath','#e36b42','dragon'],
  ['nebula-slime','epic','cosmic',['星滴膠','星雲膠獸','星核怪','宇宙吞光獸'],['Stardrop Slime','Nebula Slime','Starcore Monster','Cosmic Lighteater'],'星體分裂','Star Split','#8f76d9','slime'],
  ['abyss-lantern-squid','epic','water-shadow',['燈豆魷','幽潮魷','深淵巨魷','海溝燈神'],['Lantern Squidlet','Ghost-tide Squid','Abyss Giant Squid','Trench Lantern Spirit'],'深海牽引','Abyss Pull','#4378a8','squid'],
  ['storm-kirin','epic','electric-light',['雷芽麟','雲電麟','霆角麒麟','九霄雷皇'],['Spark Kirin','Cloudbolt Kirin','Thunderhorn Kirin','Nine-sky Thunder Sovereign'],'雷霆領域','Thunder Field','#e6c44b','kirin'],
  ['grove-colossus','epic','nature-cosmic',['苗靈獸','藤角獸','古森巨獸','萬木守護神'],['Sprout Spirit','Vinehorn Beast','Ancient Grove Colossus','Guardian of All Trees'],'巨木降臨','Root Colossus','#4f9b65','monster'],
].map(([id, rarity, element, namesZh, namesEn, talentZh, talentEn, color, body]) => ({
  id, rarity, element, names: { 'zh-HK': namesZh, 'en-US': namesEn },
  talent: { 'zh-HK': talentZh, 'en-US': talentEn }, color, body,
  art: Array.from({ length: 4 }, (_, index) => artPath('pets', `${id}-${index + 1}`)),
  atlas: Array.from({ length: 4 }, (_, index) => artPath('sprites', `${id}-${index + 1}-atlas`)),
  anchors: Array.from({ length: 4 }, (_, index) => BODY_METRICS[`${id}-${index + 1}`] || null),
  motion: Array.from({ length: 4 }, (_, index) => FRAME_MOTION[`${id}-${index + 1}`] || null),
}));

/**
 * The rooms whose artwork has been checked against the grid, which is every room the importer has
 * accepted. The rest are drawn to an older shape the grid would sit on the walls of, so they are
 * kept out of the shop until their pictures are regenerated — a student who already owns one can
 * still use it, because taking a room back off somebody is worse than a grid that does not line
 * up. Importing a room adds it here, so nothing has to be remembered.
 */
const FITTED = new Set(Object.keys(require('../../scripts/room-floors.json')));

const ROOMS = [
  ['sunny-oak','橡木暖陽房','Sunny Oak Bedroom',0,'#e6b572','#89b89a'],
  ['cloud-loft','雲端閣樓','Cloud Loft',700,'#9bcbea','#ede6d5'],
  ['ocean-cabin','海洋船艙','Ocean Cabin',800,'#4b9fb9','#dfb574'],
  ['forest-treehouse','森林樹屋','Forest Treehouse',900,'#6ca66b','#bf8a55'],
  ['space-pod','星際睡艙','Starlight Pod',1000,'#46517e','#85d5d0'],
  ['candy-workshop','糖果工房','Candy Workshop',1100,'#eaa2bd','#a7d7c4'],
  ['lava-den','熔岩龍窩','Ember Dragon Den',1200,'#9d4938','#eaa458'],
  ['aurora-observatory','極光觀測房','Aurora Observatory',1300,'#5d7eae','#b9e4df'],
  ['bamboo-room','竹林和室','Bamboo Haven',1500,'#7e9f66','#d7c99b'],
  ['moon-magic-attic','月影魔法閣樓','Moonlit Magic Attic',1700,'#655789','#d1a8d2'],
].map(([id, zh, en, price, primary, accent]) => ({
  id, name: { 'zh-HK': zh, 'en-US': en }, price, primary, accent,
  art: artPath('rooms', id), pending: !FITTED.has(id),
}));

const FOOD_GROUPS = [
  ['apple-slice','蘋果星片','Apple Stars'],['pet-biscuit','寵物餅乾','Pet Biscuits'],
  ['carrot-star','甘筍星星','Carrot Stars'],['berry-jelly','莓果啫喱','Berry Jelly'],
  ['fish-sandwich','魚香三文治','Fish Sandwich'],['veggie-bowl','彩虹菜碗','Rainbow Veggie Bowl'],
  ['honey-toast','蜜糖多士','Honey Toast'],['seaweed-roll','海苔飯卷','Seaweed Roll'],
  ['moon-cake','月亮糕','Moon Cake'],['dragonfruit-tart','火龍果撻','Dragonfruit Tart'],
  ['rainbow-stew','彩虹燉鍋','Rainbow Stew'],['star-feast','星光盛宴','Starlight Feast'],
];
const FOODS = FOOD_GROUPS.map(([id, zh, en], index) => {
  const tier = Math.floor(index / 4);
  return { id, name: { 'zh-HK': zh, 'en-US': en }, category: 'food', tier: tier + 1, price: [25, 60, 140][tier], xp: [15, 40, 100][tier] };
});


/**
 * Alpha bounding boxes for placeable art, as 0..1 fractions of the source canvas. Props are
 * drawn on a fixed canvas but neither fill nor centre it, so the runtime needs the real bounds
 * to size a piece against its grid footprint and stand it on the floor. Generated by
 * scripts/pet-art/metrics.mjs; absent entries simply fall back to whole-canvas fitting.
 */
const CONTENT_METRICS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'art', 'collectibles', 'metrics.json'), 'utf8'));
  } catch {
    return {};
  }
})();

const WEARABLE_GROUPS = [
  ['head',20,['小皇冠','探險帽','花環','星星髮夾','廚師帽','雲朵帽','海員帽','巫師帽','竹葉帽','雪帽','火焰頭環','月亮冠','齒輪禮帽','蝴蝶結','王者頭冠','睡帽','貓耳帽','護目鏡','珊瑚冠','宇宙頭盔']],
  ['face',12,['圓框眼鏡','星形眼鏡','小鬍子','愛心眼鏡','探險鏡','單片眼鏡','雪花貼','彩虹面彩','月影面罩','泡泡面罩','機械眼罩','派對鼻']],
  ['neck',16,['紅領巾','藍領巾','金鈴鐺','珍珠頸鏈','葉片項圈','星光領結','探險徽章','水晶吊墜','雲朵圍巾','彩虹圍巾','火焰披肩','冰雪披肩','竹結領帶','月牙吊墜','齒輪項鏈','花朵領圈']],
  ['back',16,['小書包','蝴蝶翅膀','龍翼背包','雲朵披風','海洋背囊','竹簍','星星斗篷','探險工具箱','月光披風','火箭背包','雪人背包','花園背包','機械發條','糖果背包','水晶小翼','迷你帳篷']],
  ['aura',16,['星光足跡','泡泡足跡','葉片足跡','火花足跡','雪花足跡','彩虹足跡','月影光環','日光光環','水晶光環','雷電光環','花瓣旋風','音符旋風','小雲跟隨','星球環繞','螢火蟲群','齒輪光環']],
];
const WEARABLES = [];
for (const [slot, count, names] of WEARABLE_GROUPS) {
  for (let index = 0; index < count; index += 1) {
    // The rarest four of each slot used to be priced in stardust. Stardust was taken out of the
    // interface, which left those twenty pieces showing a price in a currency a child can
    // neither see nor spend: the shop offered them and the server refused every purchase.
    const rarity = index >= count - 4 ? 'legend' : index >= Math.floor(count * .55) ? 'fancy' : index >= Math.floor(count * .25) ? 'rare' : 'common';
    const price = ({ common: 120, rare: 300, fancy: 450, legend: 600 })[rarity];
    const id = `${slot}-${String(index + 1).padStart(2, '0')}`;
    WEARABLES.push({ id, name: { 'zh-HK': names[index], 'en-US': `${slot[0].toUpperCase()}${slot.slice(1)} ${index + 1}` }, category: 'wearable', slot, rarity, price, currency: 'coins', art: artPath('collectibles/wearables', id), content: CONTENT_METRICS[id] || null });
  }
}

// Each room furnishes itself. The slots keep their footprints, layers and prices by index,
// because a saved arrangement refers to a piece by index; only what the piece is has changed.
const FURNITURE = ROOMS.flatMap((room) => furnitureSets.SETS[room.id].map(([zh, en], index) => ({
  id: `${room.id}-furniture-${index + 1}`,
  name: { 'zh-HK': zh, 'en-US': en },
  category: 'furniture', roomId: room.id, price: [120,120,120,300,120,300,300,120,450,450][index],
  art: artPath('collectibles/furniture', `${room.id}-furniture-${index + 1}`),
  content: CONTENT_METRICS[`${room.id}-furniture-${index + 1}`] || null,
  footprint: furnitureSets.SLOTS[index].footprint,
  layer: furnitureSets.SLOTS[index].layer,
})));

const EVOLUTION_THRESHOLDS = [0, 400, 1100, 2100];
// A duplicate species pays back coins. It used to pay stardust, which nothing on sale accepts
// any more, so drawing a species you already had was worth nothing at all.
const EGG = Object.freeze({ randomPrice: 800, directCommonPrice: 1200, directRarePrice: 2200, odds: { common: .55, rare: .35, epic: .10 }, pityAt: 10, duplicateCoins: { common: 10, rare: 25, epic: 60 } });

const catalog = Object.freeze({
  version: CATALOG_VERSION,
  pets: PETS,
  rooms: ROOMS,
  foods: FOODS,
  wearables: WEARABLES,
  furniture: FURNITURE,
  evolutionThresholds: EVOLUTION_THRESHOLDS,
  animation: loadAnimationLayout(),
  dailyXpCap: 100,
  egg: EGG,
  reactions: ['heart','star','wow','clap','flower','sparkle'],
});

const byId = (items) => new Map(items.map((item) => [item.id, item]));
const indexes = Object.freeze({ pets: byId(PETS), rooms: byId(ROOMS), foods: byId(FOODS), wearables: byId(WEARABLES), furniture: byId(FURNITURE) });

module.exports = { catalog, indexes };
