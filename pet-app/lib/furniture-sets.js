'use strict';

/**
 * The hundred pieces of furniture.
 *
 * They were once ten pieces recoloured ten ways, one palette per room, which made a shop that
 * scrolls for a hundred items and shows the same chair each time. They are now a hundred
 * different things: mostly ordinary furniture a child would recognise and can put in any room,
 * with two batches kept deliberately themed so the fantasy rooms have something of their own.
 *
 * Nothing here is tied to a room. A piece can be placed anywhere; the batching below only
 * decides which pieces are drawn on the same sheet and which id each one takes.
 *
 * The slots cannot move. Footprint, layer and price are fixed by position, and a saved
 * arrangement refers to a piece by its position — so every batch fills the same shape: one large
 * floor piece, one rug, one two-by-two, one wall piece, and six small things.
 *
 * Each entry is [Chinese name, English name, what to draw]. The last is read only by the prompt
 * builder and never reaches the client.
 */

/** Footprint, layer and the size to state in a prompt, per position in a batch. */
/**
 * How much floor a piece takes after a child has grown or shrunk it. A step adds a tile to
 * each side, so a bedside chest at one tile becomes four, which is what "bigger" looks like
 * on a grid — a multiplier would jump a rug from twenty-four tiles to fifty-four.
 */
const SIZE_STEPS = { min: -1, max: 3 };
function sizedFootprint([width, height], step = 0) {
  const by = Math.max(SIZE_STEPS.min, Math.min(SIZE_STEPS.max, Math.round(Number(step) || 0)));
  return [Math.max(1, width + by), Math.max(1, height + by)];
}
const SLOTS = [
  { footprint: [3, 2], layer: 'furniture', size: 'three tiles wide and two deep' },
  { footprint: [4, 3], layer: 'rug', size: 'four tiles wide and three deep, lying flat on the floor' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
  { footprint: [2, 2], layer: 'furniture', size: 'two tiles wide and two deep' },
  { footprint: [1, 1], layer: 'wall', size: 'hanging flat on the wall, seen straight on, no depth' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
  { footprint: [1, 1], layer: 'furniture', size: 'one tile' },
];

/** Batches, in the order their ids run. The label is only used to title a prompt. */
const BATCHES = [
  ['sunny-oak', '睡眠'],
  ['cloud-loft', '客廳'],
  ['ocean-cabin', '書房'],
  ['forest-treehouse', '遊玩'],
  ['space-pod', '收納'],
  ['candy-workshop', '綠意'],
  ['lava-den', '燈光'],
  ['aurora-observatory', '飲食'],
  ['bamboo-room', '奇幻'],
  ['moon-magic-attic', '自然'],
];

const SETS = {
  'sunny-oak': [
    ['雙人寵物床', 'Double Pet Bed', 'a soft double pet bed with a padded rim and a folded blanket'],
    ['素色地毯', 'Plain Rug', 'a plain woven rug in soft warm grey'],
    ['床頭小櫃', 'Bedside Table', 'a small bedside table with one drawer'],
    ['腳踏軟凳', 'Footstool', 'a small round padded footstool'],
    ['床頭燈', 'Bedside Lamp', 'a bedside lamp with a fabric shade, softly lit'],
    ['矮抽屜櫃', 'Low Dresser', 'a low chest of four drawers'],
    ['圓掛鐘', 'Wall Clock', 'a round wall clock with simple hands'],
    ['摺疊毛毯堆', 'Folded Blankets', 'a neat stack of folded blankets'],
    ['枕頭套裝', 'Pillow Set', 'a pair of plump pillows resting against each other'],
    ['小鬧鐘', 'Alarm Clock', 'a small twin-bell alarm clock'],
  ],
  'cloud-loft': [
    ['雙人梳化', 'Two-seat Sofa', 'a two-seat sofa with soft cushions'],
    ['條紋大地毯', 'Striped Rug', 'a large area rug with broad soft stripes'],
    ['圓茶几', 'Coffee Table', 'a round low coffee table on three legs'],
    ['扶手軟椅', 'Armchair', 'a padded armchair with rolled arms'],
    ['落地立燈', 'Floor Lamp', 'a tall floor lamp with a drum shade, softly lit'],
    ['電視矮櫃', 'Media Cabinet', 'a long low media cabinet with sliding doors'],
    ['抽象掛畫', 'Abstract Painting', 'a framed abstract painting in calm colours'],
    ['藤面邊凳', 'Woven Stool', 'a small stool with a woven top'],
    ['雜誌架', 'Magazine Rack', 'a slim rack holding a few magazines'],
    ['地板坐墊', 'Floor Cushion', 'a large flat floor cushion'],
  ],
  'ocean-cabin': [
    ['書桌連椅', 'Writing Desk', 'a writing desk with a chair tucked under it'],
    ['深綠書房毯', 'Study Rug', 'a rectangular rug in deep green with a border'],
    ['旋轉書椅', 'Desk Chair', 'a small swivel desk chair on castors'],
    ['書本疊', 'Book Stack', 'a leaning stack of hardback books'],
    ['綠罩檯燈', 'Banker Lamp', 'a green glass banker lamp, lit'],
    ['高書櫃', 'Bookshelf', 'a tall bookshelf filled with books'],
    ['備忘板', 'Pinboard', 'a cork pinboard with a few blank notes pinned to it'],
    ['地球儀', 'Globe', 'a globe on a wooden stand'],
    ['筆筒', 'Pencil Pot', 'a pot holding pencils and brushes'],
    ['文件收納盒', 'File Box', 'a small lidded box for papers'],
  ],
  'forest-treehouse': [
    ['遊戲軟墊池', 'Play Mat', 'a padded play mat with a soft raised rim'],
    ['道路遊戲毯', 'Road Rug', 'a play rug printed with little roads and crossings'],
    ['小搖搖馬', 'Rocking Horse', 'a small carved wooden rocking horse'],
    ['豆袋椅', 'Beanbag', 'a slouchy beanbag chair'],
    ['套圈遊戲架', 'Ring Toss', 'a standing ring toss game with hoops'],
    ['玩具箱', 'Toy Chest', 'a toy chest with a hinged lid, toys peeking out'],
    ['牆上籃球框', 'Hoop', 'a small basketball hoop mounted on a backboard'],
    ['積木堆', 'Building Blocks', 'a stack of coloured building blocks'],
    ['泰迪熊', 'Teddy Bear', 'a plush teddy bear sitting upright'],
    ['陀螺台', 'Spinning Top', 'a wooden spinning top on a small base'],
  ],
  'space-pod': [
    ['長餐邊櫃', 'Sideboard', 'a long low sideboard with three doors'],
    ['麻編地墊', 'Jute Mat', 'a flat woven jute mat with a plain border'],
    ['藤編收納籃', 'Storage Basket', 'a round wicker storage basket with handles'],
    ['摺梯凳', 'Step Stool', 'a small two-step wooden stool'],
    ['掛衣架', 'Coat Stand', 'a slim coat stand with a scarf hung on it'],
    ['方格層架', 'Cube Shelving', 'a cube shelving unit with boxes in some cubes'],
    ['牆掛勾排', 'Wall Hooks', 'a row of wall hooks on a wooden rail'],
    ['收納木箱堆', 'Crates', 'two stacked wooden storage crates'],
    ['洗衣籃', 'Laundry Hamper', 'a lidded laundry hamper'],
    ['鞋架', 'Shoe Rack', 'a low two-tier shoe rack'],
  ],
  'candy-workshop': [
    ['長花槽長椅', 'Planter Bench', 'a long bench with planters built into each end'],
    ['葉紋地毯', 'Leaf Rug', 'a rug printed with a scattered leaf pattern'],
    ['多肉小盆', 'Succulent', 'a small potted succulent in a clay pot'],
    ['棕櫚盆栽', 'Potted Palm', 'a tall potted palm in a woven basket'],
    ['澆水壺架', 'Watering Can', 'a metal watering can on a small stand'],
    ['植物層架', 'Plant Shelf', 'a shelving unit holding several potted plants'],
    ['垂吊藤蔓', 'Hanging Vine', 'a trailing vine in a hanging planter'],
    ['玻璃生態瓶', 'Terrarium', 'a sealed glass terrarium with moss inside'],
    ['盆景樹', 'Bonsai', 'a small bonsai tree in a shallow dish'],
    ['園藝工具袋', 'Garden Tools', 'a bag of soil with a trowel leaning against it'],
  ],
  'lava-den': [
    ['展示長凳', 'Display Bench', 'a low bench with two small lamps standing on it'],
    ['放射紋圓毯', 'Sunburst Rug', 'a round rug with a sunburst pattern'],
    ['地板紙燈籠', 'Floor Lantern', 'a paper lantern standing on the floor, lit'],
    ['燭台托盤', 'Candle Tray', 'a tray holding a cluster of lit candles'],
    ['向上立燈', 'Torchiere', 'a tall uplighter floor lamp'],
    ['玻璃陳列櫃', 'Display Cabinet', 'a cabinet with glass doors and lit shelves'],
    ['串燈', 'Fairy Lights', 'a looped string of small warm fairy lights'],
    ['小檯燈', 'Table Lamp', 'a small table lamp with a round shade'],
    ['熔岩燈', 'Lava Lamp', 'a lava lamp with slow rising blobs'],
    ['鏡球座', 'Mirror Ball', 'a small mirror ball on a stand'],
  ],
  'aurora-observatory': [
    ['餐桌連凳', 'Dining Set', 'a small dining table with two stools tucked under it'],
    ['格仔廚房墊', 'Kitchen Mat', 'a chequered kitchen floor mat'],
    ['圓座高凳', 'Round Stool', 'a stool with a round padded seat'],
    ['茶點推車', 'Tea Trolley', 'a two-tier tea trolley on castors'],
    ['飲水機', 'Water Dispenser', 'a standing water dispenser with a bottle on top'],
    ['廚房吊櫃', 'Kitchen Cupboard', 'a cupboard with panelled doors and a worktop'],
    ['調味瓶掛架', 'Jar Shelf', 'a wall shelf lined with labelled-looking jars'],
    ['水果盤架', 'Fruit Bowl', 'a bowl of fruit on a short stand'],
    ['寵物食碗', 'Food Bowls', 'a pair of pet bowls on a mat'],
    ['小爐水壺', 'Kettle', 'a kettle sitting on a small burner'],
  ],
  'bamboo-room': [
    ['金幣寶座巢', 'Hoard Nest', 'a low nest hollowed out of a pile of gold coins'],
    ['月相圓毯', 'Moon Phase Rug', 'a round rug woven with the phases of the moon'],
    ['三腳坩堝', 'Cauldron Stand', 'a three legged iron stand holding a small cauldron'],
    ['絨面高背椅', 'Velvet Chair', 'a high backed chair in deep plum velvet'],
    ['鐵燭台', 'Candelabra', 'a tall iron candelabra with lit candles'],
    ['藥劑抽屜櫃', 'Potion Cabinet', 'a cabinet of many small drawers holding glass bottles'],
    ['月框掛鏡', 'Moon Mirror', 'a mirror set in a crescent moon frame'],
    ['發光菇盆', 'Glowing Mushroom', 'a softly glowing mushroom growing in a pot'],
    ['裂紋龍蛋', 'Cracked Dragon Egg', 'a cracked dragon egg glowing from within'],
    ['水晶球座', 'Crystal Ball', 'a crystal ball resting on a clawed stand'],
  ],
  'moon-magic-attic': [
    ['苔蘚樹枝窩', 'Mossy Nest', 'a woven twig nest bed lined with moss'],
    ['粗繩編織墊', 'Rope Mat', 'a mat woven from thick pale rope'],
    ['樹樁茶几', 'Stump Table', 'a tree stump used as a side table'],
    ['藤編扶手椅', 'Wicker Armchair', 'a wicker armchair with a linen cushion'],
    ['樹枝提燈', 'Branch Lantern', 'a lantern hanging from a forked branch stand'],
    ['中空原木櫃', 'Hollow Log Chest', 'a hollow log laid on its side as a storage chest'],
    ['船舵掛飾', 'Ship Wheel', 'a wooden ship wheel hung on the wall'],
    ['樹皮盆蕨', 'Bark Planter', 'a fern growing from a pot made of curled bark'],
    ['玩具帆船', 'Toy Sailboat', 'a small wooden toy sailboat with a cloth sail'],
    ['銅潛水盔', 'Diving Helmet', 'a brass diving helmet resting on a stand'],
  ],
};

module.exports = { sizedFootprint, SIZE_STEPS, SLOTS, SETS, BATCHES };
