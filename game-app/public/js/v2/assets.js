const catalog = {
  reference: [
    ['ref-go-pennant','Reference GO pennant'],
    ['ref-jump-arrow','Reference jump arrow'],
    ['ref-run-jump-sign','Reference running-jump sign'],
    ['ref-double-jump-sign','Reference double-jump sign'],
    ['ref-zone-title','Reference zone title'],
    ['ref-market-stall-red','Reference red market stall'],
    ['ref-produce-crate','Reference produce crate'],
    ['ref-oven-front','Reference front bakery oven'],
    ['ref-barrel-front','Reference front wooden barrel'],
    ['ref-shield-rack','Reference heraldic shield rack'],
    ['ref-lamp-post','Reference wooden lamp post'],
    ['ref-stone-ramp-front','Reference flat stone ramp'],
    ['ref-barrel-cart','Reference front barrel cart'],
    ['ref-stone-pillar-front','Reference front stone pillar'],
    ['ref-chair-front','Reference front wooden chair'],
    ['ref-feast-table','Reference flat feast table'],
    ['ref-stone-column-front','Reference plain front stone column'],
    ['ref-bed-front','Reference flat blue bed'],
    ['ref-hanging-lantern','Reference front hanging lantern'],
    ['ref-catapult-front','Reference flat medieval catapult'],
    ['ref-log-step','Reference paired firewood step'],
    ['ref-bellows-front','Reference flat forge bellows'],
    ['ref-cookpot','Reference small iron cooking pot'],
    ['ref-castle-banner-blue','Reference blue castle banner'],
    ['ref-castle-banner-red','Reference red castle banner'],
    ['ref-knight-stand','Reference front armour stand'],
    ['ref-book-step','Reference paired spellbook step'],
    ['ref-scroll-step','Reference paired parchment step'],
    ['ref-sand-ledge','Reference front sand ledge'],
    ['ref-fishing-boat','Reference white fishing boat'],
    ['ref-round-table-front','Reference broad round wooden table'],
    ['ref-bowl-front','Reference small ceramic bowl step'],
    ['ref-monitor-front','Reference front display monitor'],
    ['ref-potted-plant','Reference compact potted plant step']
  ],
  global: [
    ['crate','木箱'],['barrel','木桶'],['plank','木板'],['stone-slab','石板'],['ladder','梯'],['rope-bridge','繩橋'],
    ['hanging-ring','吊環'],['trampoline','彈床'],['spring-pad','彈簧墊'],['conveyor','輸送帶'],['seesaw','蹺蹺板'],
    ['rotating-beam','旋轉樑'],['moving-lift','移動升降台'],['cloud-pad','雲墊'],['basketball','籃球'],
    ['beach-ball','沙灘球'],['balloons','氣球'],['fan','風扇'],['arrow-sign','方向牌'],['checkpoint-flag','檢查點旗'],
    ['summit-flag','山頂旗'],['bench','長椅'],['chair','椅'],['sofa','梳化'],['bed','床'],['table','桌'],['book-stack','書堆'],
    ['street-lamp','路燈'],['stone-arch','石拱門'],['jump-ramp','跳台']
  ],
  castle: [
    ['flat-brick-a','Front brick A'],['flat-brick-b','Front brick B'],['flat-brick-c','Front brick C'],
    ['flat-brick-strip-2','Front brick strip 2'],['flat-brick-strip-4','Front brick strip 4'],
    ['flat-brick-wall-2','Front brick wall 2'],['flat-brick-pillar-4','Front brick pillar 4'],['flat-brick-wall-4','Front brick wall 4'],
    ['battlement','城垛'],['castle-tower','城塔'],['castle-arch','城堡拱門'],['drawbridge','吊橋'],['shield','盾牌'],['sword','劍'],
    ['helmet','頭盔'],['giant-key','巨匙'],['treasure-chest','寶箱'],['throne','王座'],['castle-banner','旗幟'],['chandelier','吊燈'],
    ['cannon','大炮'],['catapult','投石器'],['armor-stand','盔甲架'],['gargoyle','石像'],['column','石柱'],['broken-column','破裂石柱'],
    ['scroll','卷軸'],['potion-cauldron','藥鍋'],['bookcase','書架'],['round-table','圓桌'],['castle-vase','陶瓶'],['grand-clock','大鐘'],
    ['castle-brick-long','城堡長磚台'],['castle-brick-medium','城堡中磚台'],['castle-brick-step','城堡石階'],
    ['castle-brick-thick','城堡厚牆'],['castle-brick-corner','城堡轉角台']
  ],
  market: [
    ['market-stall','市集攤檔'],['apple-crate','蘋果箱'],['orange-crate','橙箱'],['lemon-crate','檸檬箱'],['grape-crate','提子箱'],
    ['cabbage-crate','椰菜箱'],['potato-crate','薯仔箱'],['bread-cart','麵包車'],['cheese-wheel','芝士輪'],['market-basket','籃'],
    ['market-scale','磅'],['cash-chest','錢箱'],['market-awning','遮篷'],['market-wagon','貨車'],['market-signboard','招牌'],
    ['lantern-string','燈串'],['picnic-table','野餐桌'],['barrel-stack','桶堆'],['sack-pile','麻袋'],['giant-watermelon','巨型西瓜'],
    ['giant-baguette','巨型法包'],['giant-donut','巨型甜甜圈'],['market-teapot','茶壺'],['carpet-rack','地毯架']
  ],
  forest: [
    ['grass-ledge','草地平台'],['stone-ledge','石台'],
    ['tree-stump','樹樁'],['forest-log','原木'],['log-bridge','木橋'],['red-mushroom','紅蘑菇'],['blue-mushroom','藍蘑菇'],
    ['giant-leaf','巨葉'],['vine-arch','藤拱'],['hollow-tree','樹洞'],['tree-branch','樹枝'],['forest-boulder','巨石'],
    ['moss-boulder','青苔巨石'],['fallen-tree','倒樹'],['beehive','蜂巢'],['wood-lookout','瞭望台'],['canoe','獨木舟'],
    ['lily-pad','荷葉'],['treehouse','樹屋'],['root-ramp','樹根斜坡'],['forest-bush','灌木'],['pine-tree','松樹'],
    ['oak-canopy','橡樹冠'],['butterflies','蝴蝶群'],['giant-acorn','橡果'],['flower-patch','花叢']
  ],
  farm: [
    ['wood-deck','木平台'],['hay-block','乾草磚'],
    ['hay-bale','草捆'],['hay-cart','草車'],['tractor','拖拉機'],['barn-roof','穀倉屋頂'],['barn-loft','穀倉閣樓'],
    ['farm-fence','圍欄'],['chicken-coop','雞舍'],['water-trough','水槽'],['giant-pumpkin','南瓜'],['giant-corn','巨型粟米'],
    ['vegetable-crate','蔬菜箱'],['milk-can','奶罐'],['wheelbarrow','手推車'],['scarecrow','稻草人'],['windmill-blade','風車葉'],
    ['silo-pipe','筒倉管'],['grain-sacks','穀袋'],['wood-pallet','卡板'],['farm-ladder','農場梯'],['feed-bin','飼料箱'],
    ['wagon-wheel','車輪'],['stable-door','馬房門'],['watering-can','澆水壺'],['farm-shed','木棚']
  ],
  snow: [
    ['ice-slab','冰台'],['snow-ledge','雪台'],
    ['ice-crystal','冰晶'],['ice-bridge','冰橋'],['snow-mound','雪丘'],['snowman','雪人'],['sled','雪橇'],['ski-ramp','滑雪坡'],
    ['cable-car','纜車'],['snow-pine','雪松'],['igloo','冰屋'],['frozen-barrel','冰桶'],['ice-arch','冰拱'],['giant-snowflake','巨型雪花'],
    ['hockey-puck','冰球'],['hockey-stick','球棍'],['curling-stone','冰壺石'],['gift-stack','禮物堆'],['chimney','煙囪'],
    ['cabin-roof','木屋頂'],['frozen-log','冰原木'],['ice-column','冰柱'],['snowball','雪球'],['giant-boot','巨靴'],
    ['aurora-crystal','極光水晶'],['snow-lantern','雪燈']
  ],
  factory: [
    ['metal-deck','鋼平台'],['metal-bracket','鋼托架'],
    ['giant-gear','巨齒輪'],['gear-pair','齒輪組'],['straight-pipe','直管'],['elbow-pipe','彎管'],['boiler','鍋爐'],['piston','活塞'],
    ['factory-conveyor','工業輸送帶'],['steel-beam','鋼樑'],['crane-arm','吊臂'],['factory-toolbox','工具箱'],['filing-cabinet','文件櫃'],
    ['factory-monitor','螢幕'],['cable-spool','線纜卷'],['oil-drum','油桶'],['rail-cart','礦車'],['forklift','叉車'],
    ['vent-fan','抽氣扇'],['coil-spring','彈簧'],['magnet','磁鐵'],['valve-wheel','閥門'],['platform-lift','升降台'],
    ['generator','發電機'],['battery','電池'],['robot-arm','機械臂']
  ]
};

const zoneColors = {
  reference: ['#d84a3d','#17233f','#fff7c7'],
  global: ['#c88a43','#80502d','#ffe0a0'], castle: ['#8293ad','#46536d','#dbe5f4'],
  market: ['#e96358','#9b3b43','#ffe09a'], forest: ['#54b879','#236646','#c6f3ad'],
  farm: ['#e5ad43','#8d5f2e','#fff0a8'], snow: ['#94d9f4','#4777a5','#f4fdff'],
  factory: ['#718093','#343d52','#e7b94d']
};

function hash(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function bodyFor(id, index) {
  const n = hash(id) % 5;
  if (n === 0) return { type: 'circle', radius: .46, oneWay: false, material: 'rubber' };
  if (n === 1) return { type: 'trapezoid', vertices: [[-.5,.4],[-.38,-.42],[.32,-.5],[.5,.35]], oneWay: false, material: 'solid' };
  if (n === 2) return { type: 'polygon', vertices: [[-.5,.35],[-.45,-.2],[-.15,-.5],[.28,-.42],[.5,.05],[.38,.42]], oneWay: false, material: 'solid' };
  if (n === 3) return { type: 'compound', parts: [[-.3,0,.62,.72],[.26,.13,.45,.45]], oneWay: false, material: 'solid' };
  return { type: 'rect', oneWay: index % 3 === 0, material: 'solid' };
}

export const ASSETS = Object.entries(catalog).flatMap(([zone, list]) => list.map(([id, label], index) => ({
  id, label, zone,
  file: `/game/images/v2/props/${id}.webp`,
  anchor: { x: .5, y: .82 },
  renderSize: { w: 110 + (hash(id) % 90), h: 64 + (hash(id + 'h') % 76) },
  body: bodyFor(id, index),
  palette: zoneColors[zone],
  tags: [zone, bodyFor(id, index).type]
})));

export const ASSET_BY_ID = new Map(ASSETS.map(asset => [asset.id, asset]));
export const ZONE_ASSET_IDS = Object.fromEntries(Object.keys(catalog).map(zone => [zone, catalog[zone].map(([id]) => id)]));

// These legacy masters show a top/side face. They are archive assets only:
// the playable course uses an orthographic, front-facing brick kit.
export const SIDE_VIEW_BLOCK_IDS = new Set([
  'castle-brick-long','castle-brick-medium','castle-brick-step',
  'castle-brick-thick','castle-brick-corner'
]);

// Flat prototype silhouettes rejected during visual review. Keep the files
// only so old atlases remain readable; authored maps must use finished art.
export const REJECTED_STYLE_ASSET_IDS = new Set([
  'forest-boulder','hay-bale','ice-crystal','metal-deck',
  'forest-log','root-ramp','giant-leaf','tree-stump','fallen-tree','canoe','log-bridge','stone-ledge','frozen-log',
  'red-mushroom','blue-mushroom','wood-pallet','hay-cart','water-trough','farm-ladder',
  'wheelbarrow','feed-bin','farm-shed','milk-can',
  'metal-bracket','gear-pair','straight-pipe','elbow-pipe','boiler','piston','factory-conveyor','steel-beam',
  'crane-arm','factory-toolbox','filing-cabinet','factory-monitor','cable-spool','oil-drum','rail-cart','forklift',
  'vent-fan','coil-spring','magnet','valve-wheel','platform-lift','generator','battery','robot-arm'
]);

// Curated per-zone prop pools containing only finished illustrations —
// a large part of the catalog still ships flat placeholder polygons, and
// those must never appear on a course. Zones short on themed art borrow
// furniture/food/mechanism props, which is exactly Gimkit DLD's absurdist
// style (desks and sofas floating at 400m).
export const ZONE_PROP_IDS = {
  castle: ['treasure-chest','castle-banner','catapult','shield','armor-stand','cannon','gargoyle','castle-vase','sword','helmet','throne','chandelier','scroll','potion-cauldron','broken-column','giant-key','round-table','street-lamp'],
  market: ['market-basket','market-scale','market-signboard','cash-chest','cheese-wheel','giant-baguette','giant-watermelon','giant-donut','apple-crate','orange-crate','lemon-crate','grape-crate','cabbage-crate','balloons','lantern-string','barrel'],
  forest: ['bench','ladder','hanging-ring','moss-boulder','beach-ball','street-lamp','giant-key','scroll'],
  farm: ['sack-pile','potato-crate','cabbage-crate','cheese-wheel','barrel','bread-cart','apple-crate','market-basket'],
  snow: ['book-stack','chair','street-lamp','cash-chest','giant-key','bench'],
  factory: ['fan','giant-gear','crate','cash-chest','book-stack','cannon'],
};
export const ZONES = ['castle','market','forest','farm','snow','factory'];
export const ZONE_NAMES = { castle:'城堡', market:'市集', forest:'森林', farm:'農場', snow:'雪山', factory:'工廠' };

export function assetLedger() {
  return { version: 2, count: ASSETS.length, generatedAt: '2026-07-13', assets: ASSETS };
}
