'use strict';

/**
 * What furnishes each room.
 *
 * Every theme used to hold the same ten things — bed, rug, table, chair, lamp, cabinet, picture,
 * plant, toy, ornament — recoloured ten ways. A hundred items that are really ten items makes a
 * shop nobody wants to scroll, so each room now has its own ten, chosen to say what that room is.
 *
 * The slots themselves cannot move: their footprints, layers and prices are fixed by index, and
 * rooms saved by students refer to a piece by index. So each theme fills the same shaped set —
 * one large floor piece, one rug, one two-by-two, one wall piece and six small things — with
 * whatever belongs in that room.
 *
 * Each entry is [Chinese name, English name, what to draw]. The last is only read by the prompt
 * builder; it never reaches the client.
 */

/** Footprint and layer per slot, stated once so a set can be checked against it. */
const SLOTS = [
  { footprint: [3, 2], layer: 'furniture', size: 'three tiles wide and two deep' },
  { footprint: [4, 3], layer: 'rug', size: 'four tiles wide and three deep, lying flat on the floor' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
  { footprint: [2, 2], layer: 'furniture', size: 'two tiles wide and two deep' },
  { footprint: [1, 1], layer: 'wall', size: 'hanging flat on the wall, no depth' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
];

const SETS = {
  'sunny-oak': [
    ['橡木寵物床', 'Oak Pet Bed', 'a low oak pet bed with a quilted cream mattress'],
    ['編織圓地毯', 'Braided Rug', 'a braided oval rag rug in warm cream and sage'],
    ['橡木小圓桌', 'Oak Side Table', 'a small round oak side table on turned legs'],
    ['閱讀翼背椅', 'Reading Chair', 'a small wingback reading chair in sage green fabric'],
    ['銅座檯燈', 'Brass Lamp', 'a slim brass floor lamp with a warm cream shade'],
    ['橡木抽屜櫃', 'Oak Dresser', 'an oak chest of drawers with small brass knobs'],
    ['田園風景畫', 'Meadow Painting', 'a framed painting of a green meadow'],
    ['蕨葉盆栽', 'Potted Fern', 'a leafy fern in a cream ceramic pot'],
    ['玩具藤籃', 'Toy Basket', 'a wicker basket spilling over with soft toys'],
    ['木搖搖馬', 'Rocking Horse', 'a small carved wooden rocking horse'],
  ],
  'cloud-loft': [
    ['雲朵坐墊床', 'Cloud Bed', 'a cloud-shaped floor cushion bed in soft white'],
    ['蓬鬆雲地毯', 'Cloud Rug', 'a fluffy white rug shaped like a drifting cloud'],
    ['樺木玻璃几', 'Birch Table', 'a small birch table with a pale glass top'],
    ['吊蛋椅', 'Hanging Egg Chair', 'a woven hanging egg chair on a slim white stand'],
    ['紙燈籠立燈', 'Paper Lantern', 'a tall paper lantern floor lamp glowing softly'],
    ['白色百葉櫃', 'Louvred Cabinet', 'a white cabinet with louvred doors'],
    ['圓框鏡', 'Porthole Mirror', 'a round mirror in a white frame like a porthole'],
    ['吊掛綠植', 'Hanging Plant', 'a trailing plant in a macrame hanger on a stand'],
    ['紙飛機吊飾', 'Paper Plane Mobile', 'a mobile of small paper aeroplanes on a stand'],
    ['黃銅風向儀', 'Weather Vane', 'a small brass weather vane ornament'],
  ],
  'ocean-cabin': [
    ['水手吊床', 'Sailor Hammock', 'a low slung canvas hammock between two teak posts'],
    ['麻繩編織墊', 'Rope Mat', 'a mat woven from thick pale rope'],
    ['木桶邊几', 'Barrel Table', 'a small barrel used as a side table'],
    ['船長轉椅', 'Captain Chair', 'a teak swivel chair with a teal cushion'],
    ['銅環吊燈座', 'Gimbal Lamp', 'a brass gimbal lamp on a stand'],
    ['鐵箍航海箱', 'Sea Chest', 'a teak sea chest bound with iron bands'],
    ['船舵掛飾', 'Ship Wheel', 'a wooden ship wheel hung on the wall'],
    ['玻璃罐珊瑚', 'Coral Jar', 'a piece of pale coral in a glass jar'],
    ['玩具帆船', 'Toy Sailboat', 'a small wooden toy sailboat with a cloth sail'],
    ['銅潛水盔', 'Diving Helmet', 'a brass diving helmet resting on a stand'],
  ],
  'forest-treehouse': [
    ['苔蘚樹枝窩', 'Mossy Nest', 'a woven twig nest bed lined with moss'],
    ['葉編地墊', 'Leaf Mat', 'a mat woven from broad green leaves'],
    ['樹樁茶几', 'Stump Table', 'a tree stump used as a side table'],
    ['藤編扶手椅', 'Wicker Armchair', 'a wicker armchair with moss green cushions'],
    ['樹枝提燈架', 'Branch Lantern', 'a lantern hanging from a forked branch stand'],
    ['中空原木櫃', 'Hollow Log Chest', 'a hollow log laid on its side as a storage chest'],
    ['押花掛畫', 'Pressed Flowers', 'a frame of pressed wildflowers hung on the wall'],
    ['樹皮盆蕨', 'Bark Planter', 'a fern growing from a pot made of curled bark'],
    ['橡實玩具', 'Acorn Toy', 'a chunky wooden toy carved as an acorn'],
    ['松鼠木雕', 'Squirrel Carving', 'a carved wooden squirrel holding a nut'],
  ],
  'space-pod': [
    ['休眠艙床', 'Sleep Capsule', 'a padded sleep capsule with a curved open shell'],
    ['星圖地墊', 'Starfield Mat', 'a dark floor mat printed with a starfield'],
    ['鍍鉻圓几', 'Chrome Pedestal', 'a chrome pedestal table with a dark top'],
    ['駕駛躺椅', 'Pilot Seat', 'a reclining padded pilot seat in indigo'],
    ['電漿立燈', 'Plasma Lamp', 'a floor lamp holding a glowing plasma sphere'],
    ['補給儲物櫃', 'Supply Locker', 'a grey metal supply locker with a handle'],
    ['行星觀景屏', 'Planet Screen', 'a wall screen showing a distant planet'],
    ['玻璃罩植物', 'Domed Plant', 'a small plant growing under a glass dome'],
    ['玩具人造衛星', 'Toy Satellite', 'a toy satellite with small solar panels'],
    ['懸浮陀螺儀', 'Gyroscope', 'a brass gyroscope turning above its base'],
  ],
  'candy-workshop': [
    ['棉花糖床', 'Marshmallow Bed', 'a bed shaped from two fat pink marshmallows'],
    ['糖霜格地毯', 'Icing Mat', 'a chequered mint and cream icing mat'],
    ['馬卡龍矮凳', 'Macaron Stool', 'a stool made from a stacked pink macaron'],
    ['杯子蛋糕椅', 'Cupcake Chair', 'an armchair shaped like a frosted cupcake'],
    ['糖果棒立燈', 'Candy Cane Lamp', 'a floor lamp with a candy cane stem'],
    ['糖霜收納櫃', 'Icing Cabinet', 'a pastel cabinet trimmed with piped icing'],
    ['蛋糕掛畫', 'Cake Picture', 'a framed picture of a tiered cake'],
    ['茶杯薄荷盆', 'Teacup Planter', 'a mint plant growing from an oversized teacup'],
    ['薑餅人玩偶', 'Gingerbread Toy', 'a smiling gingerbread figure toy'],
    ['拉絲糖雕', 'Sugar Sculpture', 'a swirl of spun sugar set on a small base'],
  ],
  'lava-den': [
    ['金幣寶座巢', 'Hoard Nest', 'a low nest hollowed out of a pile of gold coins'],
    ['焦痕獸皮毯', 'Scorched Hide', 'a dark hide rug with scorched edges'],
    ['黑曜石方几', 'Obsidian Block', 'a squat block of polished obsidian as a table'],
    ['石座王椅', 'Stone Throne', 'a small carved stone throne seat'],
    ['餘燼火盆', 'Ember Brazier', 'an iron brazier holding glowing embers'],
    ['鐵箍寶箱', 'Treasure Chest', 'a heavy chest bound in blackened iron'],
    ['龍鱗旗幟', 'Scale Banner', 'a banner of overlapping dragon scales hung on the wall'],
    ['火花盆花', 'Fire Flower', 'a flower with ember-orange petals in a stone pot'],
    ['裂紋龍蛋', 'Cracked Egg', 'a cracked dragon egg glowing from within'],
    ['鐵砧與劍', 'Anvil and Sword', 'a small anvil with a glowing sword resting on it'],
  ],
  'aurora-observatory': [
    ['星幕臥榻', 'Star Daybed', 'a daybed under a small canopy printed with stars'],
    ['星座地毯', 'Constellation Rug', 'a deep blue rug embroidered with constellations'],
    ['黃銅三腳几', 'Tripod Table', 'a small brass tripod table'],
    ['觀星軟椅', 'Observation Chair', 'a padded chair tilted back for looking upward'],
    ['星象投影燈', 'Star Projector', 'a standing projector casting points of light'],
    ['星圖抽屜櫃', 'Map Cabinet', 'a cabinet of wide shallow drawers for star charts'],
    ['星圖掛畫', 'Star Chart', 'a framed star chart hung on the wall'],
    ['發光苔玻璃', 'Glowing Terrarium', 'a glass terrarium of faintly glowing moss'],
    ['玩具天體儀', 'Toy Orrery', 'a small orrery with planets on brass arms'],
    ['黃銅望遠鏡', 'Brass Telescope', 'a brass telescope on a wooden tripod'],
  ],
  'bamboo-room': [
    ['榻榻米被褥', 'Futon', 'a folded futon laid out on the floor'],
    ['稻草編織蓆', 'Straw Mat', 'a woven straw mat with a bound edge'],
    ['漆器矮茶几', 'Tea Table', 'a low lacquered tea table'],
    ['和式坐墊', 'Floor Cushion', 'a flat floor cushion with a low armrest'],
    ['和紙行燈', 'Andon Lamp', 'a square paper andon lamp on a wooden frame'],
    ['階梯箪笥', 'Step Tansu', 'a stepped tansu chest of small drawers'],
    ['掛軸', 'Hanging Scroll', 'a painted hanging scroll on the wall'],
    ['盆栽松', 'Bonsai Pine', 'a small pine bonsai in a shallow dish'],
    ['劍玉', 'Kendama', 'a wooden kendama toy'],
    ['石水缽', 'Water Basin', 'a round stone water basin with a bamboo spout'],
  ],
  'moon-magic-attic': [
    ['星帳四柱床', 'Canopy Bed', 'a small four poster bed with star-printed drapes'],
    ['月相地毯', 'Moon Phase Rug', 'a round rug woven with the phases of the moon'],
    ['三腳坩堝几', 'Cauldron Stand', 'a three legged iron stand holding a small cauldron'],
    ['絨面高背椅', 'Velvet Chair', 'a high backed chair in deep plum velvet'],
    ['燭台立燈', 'Candelabra', 'a tall iron candelabra with lit candles'],
    ['藥劑抽屜櫃', 'Potion Cabinet', 'a cabinet of many small drawers holding bottles'],
    ['月框掛鏡', 'Moon Mirror', 'a mirror in a crescent moon frame'],
    ['發光菇盆', 'Glowing Mushroom', 'a glowing mushroom growing in a small pot'],
    ['黑貓玩偶', 'Black Cat Plush', 'a plush black cat toy with green eyes'],
    ['水晶球座', 'Crystal Ball', 'a crystal ball resting on a clawed stand'],
  ],
};

module.exports = { SLOTS, SETS };
