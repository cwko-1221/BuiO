'use strict';

const crypto = require('crypto');
const CATALOG_VERSION = '2026.08.13-1';
const artPath = (folder, id) => {
  const hash = crypto.createHash('sha256').update(`${CATALOG_VERSION}:${folder}:${id}`).digest('hex').slice(0, 10);
  return `/pet/assets/art/${folder}/${id}-${hash}.webp`;
};

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
}));

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
].map(([id, zh, en, price, primary, accent]) => ({ id, name: { 'zh-HK': zh, 'en-US': en }, price, primary, accent, art: artPath('rooms', id) }));

const MAPS = [
  ['clover-meadow','四葉草原','Clover Meadow',0,'荊棘野豬','Bramble Boar','nature','#72bd68'],
  ['whisper-forest','低語森林','Whisper Forest',600,'樹根巨像','Root Colossus','nature','#3f805c'],
  ['coral-cove','珊瑚海灣','Coral Cove',700,'礁石蟹王','Reef Crab King','water','#41a8bf'],
  ['crystal-cavern','水晶洞窟','Crystal Cavern',800,'稜鏡巨蝠','Prism Greatbat','ice-light','#7567b5'],
  ['cloudpeak-trail','雲峰山道','Cloudpeak Trail',900,'風暴巨鳥','Storm Roc','wind','#77bcd1'],
  ['aurora-tundra','極光雪原','Aurora Tundra',1000,'冰牙海象','Ice-tusk Walrus','ice','#9bd6e4'],
  ['ember-volcano','熾焰火山','Ember Volcano',1100,'熔岩巨人','Magma Giant','fire','#b94e3f'],
  ['moonlit-marsh','月光沼澤','Moonlit Marsh',1200,'燈影水蛇','Lantern Serpent','shadow','#56548c'],
  ['gearwork-city','齒輪城市','Gearwork City',1400,'發條泰坦','Clockwork Titan','electric','#9b815a'],
  ['starfall-ruins','星墜遺跡','Starfall Ruins',1600,'虛空彗獸','Void Comet Beast','cosmic','#4d4f88'],
].map(([id, zh, en, price, bossZh, bossEn, element, color], index) => ({
  id, name: { 'zh-HK': zh, 'en-US': en }, price,
  boss: { 'zh-HK': bossZh, 'en-US': bossEn }, element, color,
  badgeId: `badge-${id}`, art: artPath('maps', id), order: index,
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

const SKILLS = [
  ['ember-bolt','火焰彈','Ember Bolt','attack','fire',450],['tide-burst','水泡爆破','Tide Burst','attack','water',450],
  ['vine-whip','藤蔓鞭','Vine Whip','attack','nature',450],['thunder-arc','連鎖電弧','Thunder Arc','attack','electric',450],
  ['frost-nova','冰霜新星','Frost Nova','attack','ice',450],['star-beam','星光束','Star Beam','attack','cosmic',450],
  ['shadow-orb','暗影球','Shadow Orb','attack','shadow',450],['wind-dash','疾風衝刺','Wind Dash','explore','wind',350],
  ['rock-smash','岩石重擊','Rock Smash','explore','earth',350],['glide-current','滑翔翼流','Glide Current','explore','wind',350],
  ['dive-bubble','潛水泡','Dive Bubble','explore','water',350],['treasure-scent','尋寶嗅覺','Treasure Scent','explore','cosmic',350],
  ['guardian-bubble','守護泡泡','Guardian Bubble','support','water',400],['healing-pollen','治療花粉','Healing Pollen','support','nature',400],
  ['haste-cheer','加速鼓舞','Haste Cheer','support','light',400],['decoy-toy','誘餌玩具','Decoy Toy','support','shadow',400],
].map(([id, zh, en, kind, element, price]) => ({ id, name: { 'zh-HK': zh, 'en-US': en }, category: 'skill', kind, element, price }));

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
    const rarity = index >= count - 4 ? 'stardust' : index >= Math.floor(count * .55) ? 'fancy' : index >= Math.floor(count * .25) ? 'rare' : 'common';
    const price = rarity === 'stardust' ? [30, 60, 100][index % 3] : ({ common: 120, rare: 300, fancy: 450 })[rarity];
    const id = `${slot}-${String(index + 1).padStart(2, '0')}`;
    WEARABLES.push({ id, name: { 'zh-HK': names[index], 'en-US': `${slot[0].toUpperCase()}${slot.slice(1)} ${index + 1}` }, category: 'wearable', slot, rarity, price, currency: rarity === 'stardust' ? 'stardust' : 'coins', art: artPath('collectibles/wearables', id) });
  }
}

const FURNITURE_NAMES = ['寵物床','柔軟地毯','小圓桌','休閒椅','夜燈','收納櫃','牆上畫','盆栽','互動玩具','主題擺設'];
const FURNITURE_EN = ['Pet Bed','Soft Rug','Round Table','Lounge Chair','Night Light','Storage','Wall Art','Planter','Interactive Toy','Theme Ornament'];
const FURNITURE = ROOMS.flatMap((room) => FURNITURE_NAMES.map((name, index) => ({
  id: `${room.id}-furniture-${index + 1}`,
  name: { 'zh-HK': `${room.name['zh-HK']}・${name}`, 'en-US': `${room.name['en-US']} ${FURNITURE_EN[index]}` },
  category: 'furniture', roomId: room.id, price: [120,120,120,300,120,300,300,120,450,450][index],
  art: artPath('collectibles/furniture', `${room.id}-furniture-${index + 1}`),
  footprint: index === 0 ? [3,2] : index === 1 ? [4,3] : index === 5 ? [2,2] : [1,1],
  layer: index === 1 ? 'rug' : index === 6 ? 'wall' : 'furniture',
})));

const EVOLUTION_THRESHOLDS = [0, 400, 1100, 2100];
const EGG = Object.freeze({ randomPrice: 800, directCommonPrice: 1200, directRarePrice: 2200, odds: { common: .55, rare: .35, epic: .10 }, pityAt: 10, duplicateDust: { common: 10, rare: 25, epic: 60 } });

const catalog = Object.freeze({
  version: CATALOG_VERSION,
  pets: PETS,
  rooms: ROOMS,
  maps: MAPS,
  foods: FOODS,
  skills: SKILLS,
  wearables: WEARABLES,
  furniture: FURNITURE,
  evolutionThresholds: EVOLUTION_THRESHOLDS,
  dailyXpCap: 100,
  egg: EGG,
  reactions: ['heart','star','wow','clap','flower','sparkle'],
});

const byId = (items) => new Map(items.map((item) => [item.id, item]));
const indexes = Object.freeze({ pets: byId(PETS), rooms: byId(ROOMS), maps: byId(MAPS), foods: byId(FOODS), skills: byId(SKILLS), wearables: byId(WEARABLES), furniture: byId(FURNITURE) });

module.exports = { catalog, indexes };
