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

    // The pose sheet: a row per direction the creature is drawn facing, five poses across, and
    // a list of clips saying which of those cells each action plays. An action is no longer a
    // contiguous run — walk is contact, pass, contact, pass — so the frames travel as a list.
    if (Array.isArray(manifest.clips)) {
      const actions = [];
      for (const clip of manifest.clips) {
        actions.push({ name: clip.name, facing: clip.facing, frames: clip.frames, start: clip.frames[0], length: clip.frames.length });
      }
      return {
        frameWidth: manifest.frameWidth,
        frameHeight: manifest.frameHeight,
        framesPerDirection: manifest.columns,
        // The grid the atlas is actually laid out on. It used to be inferred from the longest
        // action, which on the pose sheet is a four-frame walk on a five-wide sheet — so the
        // preview cropped a four by one grid out of a five by four atlas and showed strips.
        columns: manifest.columns,
        rows: manifest.rows,
        fps: manifest.fps || 8,
        directions: manifest.directions,
        actions,
      };
    }

    // The older sheet: one action per row, contiguous from its start index in reading order.
    if (!manifest.actions || !Array.isArray(manifest.rows)) return null;
    const actions = Object.entries(manifest.actions).map(([name, action]) => ({
      name, start: action.start, length: action.count,
    }));
    return {
      frameWidth: manifest.frameWidth,
      frameHeight: manifest.frameHeight,
      framesPerDirection: (manifest.gridColumns || manifest.columns.length) * (manifest.gridRows || 1),
      columns: manifest.gridColumns || manifest.columns.length,
      rows: (manifest.gridRows || 1) * manifest.rows.length,
      fps: manifest.fps || 24,
      directions: manifest.rows,
      actions,
    };
  } catch {
    return null; // No atlases generated yet; the runtime falls back to the static form art.
  }
}

/**
 * Complete dressed-pet atlases. Each key is one exact pet, stage and sorted outfit. These are
 * holistic redraws, not accessory overlays, so the client swaps the character sheet as a unit.
 */
function loadOutfitAtlases() {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(
      __dirname, '..', 'public', 'assets', 'art', 'outfit-atlases', 'manifest.json',
    ), 'utf8'));
    return manifest.atlases && typeof manifest.atlases === 'object' ? manifest.atlases : {};
  } catch {
    return {};
  }
}

/**
 * Per-item replacement layers sampled from complete pet + equipment redraws. Unlike the old
 * freely positioned art, every layer is already registered to the pet's exact 5 x 4 atlas.
 */
function loadRedrawnWearables() {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(
      __dirname, '..', 'public', 'assets', 'art', 'outfit-atlases', 'manifest.json',
    ), 'utf8'));
    return manifest.modular && typeof manifest.modular === 'object' ? manifest.modular : {};
  } catch {
    return {};
  }
}
/**
 * Art is served for a year and marked immutable, which is only honest if the address changes when
 * the picture does. The file's name cannot carry that: the name is derived from the id so the
 * pipeline can work out where to write, and replacing a room's artwork left the address identical.
 * Browsers that had the old picture kept it and never asked again. So the address carries a stamp
 * of the file's contents alongside, and a redrawn picture is simply a different address.
 */
const ART_ROOTS = [
  path.join(__dirname, '..', 'dist', 'assets', 'art'),     // what the server actually serves
  path.join(__dirname, '..', 'public', 'assets', 'art'),   // before a build has copied it across
];
const contentStamp = (folder, name) => {
  for (const root of ART_ROOTS) {
    try {
      return crypto.createHash('sha256').update(fs.readFileSync(path.join(root, folder, name)))
        .digest('hex').slice(0, 8);
    } catch { /* not generated yet, or this root is the wrong one */ }
  }
  return null;
};
/**
 * Creatures drawn to the pose sheet, all four stages of them. One manifest describes the
 * layout of every atlas, so a creature still on the old placeholder art would be cut into
 * frames in the wrong places; it is published without an atlas instead and the runtime falls
 * back to its still art. Recorded by the importer, so this keeps itself.
 */
const POSE_SHEETS = (() => {
  try {
    const seen = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'art', 'sprites', 'imported.json'), 'utf8'));
    return new Set(Object.entries(seen)
      .filter(([, stages]) => [1, 2, 3, 4].every((stage) => stages[stage]))
      .map(([id]) => id));
  } catch {
    return new Set();
  }
})();

const artPath = (folder, id) => {
  const hash = crypto.createHash('sha256').update(`${CATALOG_VERSION}:${folder}:${id}`).digest('hex').slice(0, 10);
  const name = `${id}-${hash}.webp`;
  const stamp = contentStamp(folder, name);
  return `/pet/assets/art/${folder}/${name}${stamp ? `?v=${stamp}` : ''}`;
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
  // The atlas path is always here so the pipeline knows where to write; whether it may be played
  // is a separate question, because one manifest describes the layout of every atlas and a
  // creature still on placeholder art would be cut into frames in the wrong places.
  animated: POSE_SHEETS.has(id),
  anchors: Array.from({ length: 4 }, (_, index) => BODY_METRICS[`${id}-${index + 1}`] || null),
  // The same landmarks measured on each facing, so a hat sits on the head from the side too.
  facingAnchors: Array.from({ length: 4 }, (_, index) => {
    const stage = index + 1;
    const byFacing = {};
    for (const facing of ['right', 'back']) {
      const found = BODY_METRICS[`${id}-${stage}-${facing}`];
      if (found) byFacing[facing] = found;
    }
    return Object.keys(byFacing).length ? byFacing : null;
  }),
  motion: Array.from({ length: 4 }, (_, index) => FRAME_MOTION[`${id}-${index + 1}`] || null),
}));

/**
 * The rooms whose artwork has been checked against the grid, which is every room the importer has
 * accepted. The rest are drawn to an older shape the grid would sit on the walls of, so they are
 * kept out of the shop until their pictures are regenerated — a student who already owns one can
 * still use it, because taking a room back off somebody is worse than a grid that does not line
 * up. Importing a room adds it here, so nothing has to be remembered.
 */
const MARKED_FLOORS = require('../../scripts/room-floors.json');
const FITTED = new Set(Object.keys(MARKED_FLOORS));

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
  floor: MARKED_FLOORS[id] || null,
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
/**
 * How wide each piece is drawn, in floor tiles. Recorded at import from the sheet it came off,
 * because a footprint is coarser than a size: a clock, a lamp and an armchair all occupy one
 * tile and are nothing like the same size. Absent entries fall back to the footprint.
 */
const DRAW_TILES = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'art', 'collectibles', 'draw-tiles.json'), 'utf8'));
  } catch {
    return {};
  }
})();
const CONTENT_METRICS = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'art', 'collectibles', 'metrics.json'), 'utf8'));
  } catch {
    return {};
  }
})();

/**
 * A crown sits on top of a head; a helmet goes over it. Both are worn on the head and the two
 * belong in completely different places — a helmet perched above the skull like a crown reads
 * as a hat floating over the creature rather than one it is wearing.
 */
const HATS = new Set(['探險帽', '廚師帽', '雲朵帽', '海員帽', '巫師帽', '竹葉帽', '雪帽',
  '齒輪禮帽', '睡帽']);
// A clip or a bow is pinned to the side of a head and hangs from its own top, where a crown
// rests on the skull from its own base. Anchored like a crown, a hairclip's ribbons pushed the
// star up off the head entirely.
const CLIPPED_ON = new Set(['星星髮夾', '蝴蝶結']);
const HEAD_FIT = (name) => (CLIPPED_ON.has(name) ? 'clip'
  : name === '貓耳帽' ? 'headset'
    : name === '護目鏡' ? 'goggles'
      : name === '宇宙頭盔' ? 'helmet'
        : HATS.has(name) ? 'hat' : 'crown');

// The first side-view sheets still drew wings upright. These corrected profiles are authored
// low along a four-legged creature's back; left mirrors the same art at runtime.
const FLAT_SIDE_BACKS = new Set(['back-02', 'back-03', 'back-15']);

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
    WEARABLES.push({ id, name: { 'zh-HK': names[index], 'en-US': `${slot[0].toUpperCase()}${slot.slice(1)} ${index + 1}` }, category: 'wearable', slot, rarity, price, currency: 'coins', art: artPath('collectibles/wearables', id), content: CONTENT_METRICS[id] || null,
      fit: slot === 'head' ? HEAD_FIT(names[index]) : undefined,
      // A creature that walks turns away, so an accessory is drawn from the front, from its
      // right and from behind. The front keeps the plain id, so a set that only has the one
      // drawing still resolves; a view with no art of its own falls back to it at runtime.
      views: {
        right: artPath('collectibles/wearables', FLAT_SIDE_BACKS.has(id) ? `${id}-right-flat` : `${id}-right`),
        back: artPath('collectibles/wearables', `${id}-back`),
      },
      sourceViews: FLAT_SIDE_BACKS.has(id)
        ? { right: artPath('collectibles/wearables', `${id}-right`) }
        : undefined,
      sideBehind: FLAT_SIDE_BACKS.has(id) || undefined,
      profileSizing: FLAT_SIDE_BACKS.has(id) ? 'canvas' : undefined,
      profileOffset: FLAT_SIDE_BACKS.has(id) ? { y: -0.11 } : undefined,
      // Butterfly wings pass behind the body, while their leather straps cross in front. Keeping
      // those as separate layers stops the whole wing painting from being pasted over the pet.
      overlays: id === 'back-02'
        ? { back: artPath('collectibles/wearables', 'back-02-back-front') }
        : undefined,
      viewContent: {
        right: CONTENT_METRICS[`${id}-right`] || null,
        back: CONTENT_METRICS[`${id}-back`] || null,
      } });
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
  drawTiles: DRAW_TILES[`${room.id}-furniture-${index + 1}`] || null,
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
  outfitAtlases: loadOutfitAtlases(),
  redrawnWearables: loadRedrawnWearables(),
  dailyXpCap: 100,
  egg: EGG,
  reactions: ['heart','star','wow','clap','flower','sparkle'],
});

const byId = (items) => new Map(items.map((item) => [item.id, item]));
const indexes = Object.freeze({ pets: byId(PETS), rooms: byId(ROOMS), foods: byId(FOODS), wearables: byId(WEARABLES), furniture: byId(FURNITURE) });

module.exports = { catalog, indexes };
