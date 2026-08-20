// Write out every image-generation prompt, one complete block per sheet.
//
// Two art directions live side by side on purpose. The room and its furniture are the world the
// pet stands in and read best soft and cosy; the creature is the thing a child collects and
// wants to look striking. Anything worn follows the creature rather than the room, because it
// spends its life sitting on the creature and a different line weight there is obvious.
//
// Item names, counts and order all come from the catalogue, so a prompt can never drift out of
// step with what the importer expects to find in a cell.
//
// Usage:  node scripts/build-art-prompts.mjs

import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { catalog } = require('../pet-app/lib/catalog.js');
const { SLOTS, SETS, BATCHES } = require('../pet-app/lib/furniture-sets.js');

/** The room and everything built into it. */
const WORLD_STYLE = `Cozy stylised video-game art in the spirit of Animal Crossing: soft rounded forms, smooth matte shading with gentle gradients and no harsh highlights, a warm muted pastel palette, clean readable silhouettes, no black outlines, a subtle hand-painted texture, and soft even lighting from the upper left. Friendly, premium, toy-like. Identical rendering style, line weight, palette and lighting across every item on the sheet.`;

/** The creature and anything it wears. */
const PET_STYLE = `Japanese anime creature art: crisp clean linework, cel shading with clear hard-edged separation between light and shadow, a vivid saturated palette built around one strong accent colour, expressive oversized eyes with layered iris gradients and bright catchlights, and a cool rim light along the top edge. Cute and cool at the same time - soft rounded proportions carrying sharp confident detailing: crisp fur tufts, defined markings, small crests and fangs. Appealing enough to be a plush toy and striking enough to be a trading card. This is character art rendered with cel shading and clean linework - not sticker art, not a die-cut sticker with a white keyline around it, and not flat vector shapes. Identical rendering style, line weight, palette and lighting across every cell of the sheet.`;

const sheet = (cols, rows) => `Lay the items out as a strict grid, ${cols} columns by ${rows} rows, one item per cell, each item centred in its own cell with clear even margins, never touching a cell edge or a neighbour. Uniform scale relative to the cell. The background must be genuinely transparent - a real alpha channel. Not white, not a light grey, not a drawn checkerboard pattern, not any backdrop at all. Save as PNG with alpha. Nothing whatsoever is drawn behind or between the subjects: no ground shadow, no cast shadow, no reflection, no glow pad, no scenery, no text, no caption, no number, no label, no watermark, no frame, no border, and no white outline or sticker die-cut edge around anything. Square canvas 4096 x 4096.`;

const ROOMS = [
  ['sunny-oak', '橡木暖陽房', `a warm oak bedroom: a warm honey-toned wooden floor in staggered planks with soft grain, cream painted wall panelling with a white chair rail, a tall arched window on the back wall filled with soft morning light and a hint of green garden beyond`],
  ['cloud-loft', '雲端閣樓', `an airy attic above the clouds: a pale bleached birch floor in staggered planks, the joins barely visible, soft sky-blue plaster walls with a white picture rail, a large round porthole window on the back wall full of drifting white cloud`],
  ['ocean-cabin', '海洋船艙', `a ship's cabin: a dark polished teak floor in staggered planks with rich grain, painted teal wainscot below a varnished timber rail, a brass porthole on the back wall showing calm blue water, thick rope trim along the skirting`],
  ['forest-treehouse', '森林樹屋', `a treehouse interior: a warm timber floor of staggered rough-sawn planks, bark-textured plank walls with ivy creeping in at the corners, a large leaf-framed opening on the back wall looking out into green canopy`],
  ['space-pod', '星際睡艙', `a sleeping pod aboard a starship: a pale grey seamless composite floor with a soft sheen and no joins at all, deep indigo padded wall panels with soft glowing seams, a wide viewport on the back wall full of stars and a distant nebula`],
  ['candy-workshop', '糖果工房', `a confectioner's workshop: a smooth mint-cream floor with a soft candy sheen and no joins at all, glossy pink sugar-glazed walls with a scalloped border, a rounded pastry-shop window on the back wall with a striped awning inside`],
  ['lava-den', '熔岩龍窩', `a dragon's den: a dark basalt floor with a faint ember glow bleeding up through fine irregular cracks, rough volcanic rock walls, a glowing lava seam running across the back wall behind a low stone arch`],
  ['aurora-observatory', '極光觀測房', `an observatory at night: a deep blue polished stone floor with a soft sheen and no joins at all, midnight indigo walls with faint constellation etchings, a wide arched window on the back wall filled with green and violet aurora ribbons`],
  ['bamboo-room', '竹林和室', `a Japanese room: a pale tatami floor with a fine woven grain running in alternating directions, a paper shoji screen wall softly backlit, dark timber posts and beams, a low tokonoma alcove in the back wall`],
  ['moon-magic-attic', '月影魔法閣樓', `a witch's attic: a worn violet-stained parquet floor of staggered blocks with soft grain, deep plum walls with faint hand-painted gold stars, a crescent-shaped window on the back wall showing a night sky`],
];

const WEARABLES = [
  ['head', '頭飾', 5, 4, `a small jewelled crown, an explorer's wide-brim hat, a woven flower wreath, a star-shaped hairclip, a chef's toque, a fluffy cloud cap, a sailor cap, a pointed wizard hat, a conical bamboo leaf hat, a knitted snow hat with a pompom, a circlet of flame, a crescent moon crown, a brass gear top hat, a large ribbon bow, an ornate king's crown, a soft nightcap, a cat-ear headband, a pair of aviator goggles worn on the head, a branching coral crown, a domed cosmic helmet`,
    `Each accessory is drawn on its own, from the front, exactly as it would look while worn - but with no creature, no head, no mannequin and no stand underneath it. Left-to-right symmetrical wherever the object itself is symmetrical. Drawn large enough to fill most of its cell, since it will be scaled to the creature later.`],
  ['face', '面飾', 4, 3, `round wire spectacles, star-shaped sunglasses, a curled gentleman's moustache, heart-shaped sunglasses, tinted explorer goggles, a single monocle on a fine chain, a snowflake face sticker, rainbow face paint stripes, a crescent moon eye mask, a bubble-dome face visor, a mechanical eyepatch with brass rivets, a red party nose`,
    `Each item is drawn on its own, from the front, exactly as it would sit on a face - but with no creature, no head and no mannequin. Eyewear is drawn as a matching pair with the space between the lenses left empty so a face can show through. Drawn large enough to fill most of its cell, since it will be scaled to the creature later.`],
  ['neck', '頸部', 4, 4, `a red neckerchief, a blue neckerchief, a gold bell on a collar, a pearl necklace, a collar of woven leaves, a starlight bow tie, an explorer's badge on a strap, a crystal pendant, a fluffy cloud scarf, a rainbow striped scarf, a flame-edged shoulder cape, a snow-white fur shoulder cape, a bamboo knot necktie, a crescent moon pendant, a brass gear necklace, a collar of small flowers`,
    `Each item is drawn on its own, from the front, exactly as it would sit around a neck - but with no creature and no mannequin. Drawn as a closed ring or an open U shape seen from the front, never as a single straight strand. Drawn large enough to fill most of its cell, since it will be scaled to the creature later.`],
  ['back', '背部', 4, 4, `a small school satchel, a pair of butterfly wings, a pair of leathery dragon wings, a fluffy cloud cape, an ocean-blue rucksack, a woven bamboo basket, a starry cloak, an explorer's tool case, a moonlight cape, a rocket pack, a snowman-shaped backpack, a garden backpack with small plants growing out of it, a wind-up clockwork key and gear, a candy-striped backpack, a pair of small crystal wings, a rolled mini tent`,
    `Each item is drawn on its own, from the front, exactly as it would look worn on a back - but with no creature and no mannequin. Wings and capes are perfectly left-to-right symmetrical and fully spread open. Backpacks are seen from the front as they would look peeking out from behind a body. Drawn large enough to fill most of its cell, since it will be scaled to the creature later.`],
  ['aura', '光環', 4, 4, `a trail of glowing stars, a trail of soap bubbles, a trail of drifting leaves, a trail of orange sparks, a trail of snowflakes, a rainbow shimmer trail, a ring of moon shadow, a ring of warm sunlight, a ring of floating crystals, a ring of crackling lightning, a swirl of flower petals, a swirl of music notes, a small cloud following along, a ring of tiny orbiting planets, a swarm of fireflies, a ring of slowly turning brass gears`,
    `Each effect is drawn on its own as a flat ground effect: a wide shallow ellipse lying on the floor, seen at the same angle as the room floor, twice as wide as it is tall. There is no creature and no mannequin in the cell, and the middle is left empty. Glowing, semi-transparent, light and airy. Drawn large enough to fill most of its cell, since it will be scaled to the creature later.`],
];

const SPECIES = [
  ['starpatch-cat', '星斑貓',
    `a cat with cream and honey fur, a soft velvety coat, oversized round amber eyes, a single five-pointed star patch on its forehead, small rounded ears and a stubby upturned tail`,
    ['a plump kitten cub, head about one third of its full height, very short stubby legs, everything soft and round',
     'a growing cat, slightly longer in the body and tail, faint silver moon markings appearing along its flanks',
     'a lean hunting cat, longer legs, a short mane of star-flecked fur starting at the neck, alert posture',
     'a small celestial lion, a full mane of pale gold fur with tiny lights caught in it, broad chest, regal and calm']],
  ['cloud-ear-dog', '雲耳犬',
    `a dog with soft pale blue-grey fur, fluffy cloud-shaped ears, a white blaze down its chest, warm dark eyes and a loosely curled tail`,
    ['a round puppy, head about one third of its full height, paws too big for its legs',
     'a lively young dog, leaner in the body, a faint breeze always lifting the fur at its ears',
     'a tall herding dog, a thick ruff around the neck, longer legs built for running',
     'a noble sky hound, a flowing mantle of cloud-white fur across its shoulders, calm and watchful']],
  ['pudding-pig', '布丁豬',
    `a pig with warm caramel-pink skin, a glossy rounded body like set pudding, a distinct head above a soft neck crease, a small upturned snout, tiny folded ears and a curled tail`,
    ['a tiny piglet, head about one third of its full height, wobbly and soft all over',
     'a caramel-glazed pig, deeper amber tone, a faint sugary sheen along its back',
     'a stout boar with rough stone-grey plates along its shoulders and small blunt tusks',
     'a huge harvest boar, thick armoured plates, golden wheat and fruit motifs worked into its hide, immense and gentle']],
  ['crescent-rabbit', '月芽兔',
    `a rabbit with pale lavender fur, very long upright ears with soft pink inner lining, large violet eyes, a round cotton tail and a small crescent moon mark on its brow`,
    ['a small bunny kit, head about one third of its full height, ears still short and floppy',
     'a slender rabbit, ears fully grown and upright, a faint silver shimmer along its back',
     'a swift runner, long powerful hind legs, a ring of pale moonlight around its brow',
     'a sacred moon hare, tall and graceful, a crescent halo above its head, robes of starlight fur']],
  ['bubble-otter', '泡泡水獺',
    `an otter with sleek teal-blue fur, a paler cream belly, round dark eyes, small ears, webbed paws and a thick flat tail`,
    ['a chubby otter pup, head about one third of its full height, always holding a bubble in its paws',
     'a stream otter, longer and sleeker, water beading along its coat',
     'a tide otter, broad shoulders, a mantle of foam-white fur across its back',
     'a sea-crown otter king, a coral and pearl crown grown into its brow, long flowing whiskers, majestic']],
  ['mossback-turtle', '苔背龜',
    `a turtle whose mossy green shell sits low on its back leaving clear shoulder space above it, a rounded pale-green head held well clear of the shell on a short visible neck, gentle dark eyes and short sturdy legs`,
    ['a hatchling, head about one third of its full height, shell still small and smooth',
     'a garden turtle, small flowers and ferns now growing on the shell',
     'an ancient bark turtle, the shell hardened into woody plates with a small tree taking root',
     'a world-tree tortoise, a full canopy growing from its back, roots along its legs, immense and serene']],
  ['spark-hamster', '火花鼠',
    `a hamster with warm orange-brown fur, very round cheeks, a cream belly, tiny round ears, bright black eyes and small pink paws`,
    ['a tiny hamster pup, head about one third of its full height, cheeks stuffed round',
     'a coal-ball hamster, deeper ember tone, faint glowing flecks in its fur',
     'a blaze runner, lean and quick, a trail of flame along its back and tail',
     'a sun-wheel hamster, a burning ring of fire turning behind it, coat like molten gold']],
  ['leaftail-fox', '葉尾狐',
    `a fox with fresh green and cream fur, a bushy tail that ends in a large leaf shape, bright golden eyes, tall pointed ears and slender legs`,
    ['a fox kit, head about one third of its full height, tail leaf still small and curled',
     'a vine-shadow fox, darker green, thin vines twining along its legs',
     'a forest spirit fox, longer body, several leaf-tipped tails, faint glow at its paws',
     'an emerald crown spirit fox, a crown of living leaves, many flowing tails, luminous and calm']],
  ['snowfeather-penguin', '雪羽企鵝',
    `a penguin with soft white and pale blue feathers, a rounded body, a small orange beak, round dark eyes and short flippers`,
    ['a downy chick, head about one third of its full height, fluffy and unsteady',
     'an ice-sail penguin, sleeker feathers, a small crest of ice along its head',
     'an aurora penguin, feathers shot through with faint green and violet light',
     'an ice-sea emperor penguin, tall and stately, a mantle of frost and a crown of clear ice']],
  ['thunderhorn-goat', '雷角羊',
    `a goat with pale cream wool, small curved horns crackling with faint blue light, amber slit eyes, dark hooves and a short tail`,
    ['a kid, head about one third of its full height, horns just budding',
     'a spark-hoof goat, horns curving properly now, small arcs of electricity at its hooves',
     'a storm ibex, long swept-back horns, a thick storm-grey mane',
     'a sky-thunder ram, massive spiralled horns wreathed in lightning, a mane like thunderclouds']],
  ['coral-seal', '珊瑚海豹',
    `a seal with smooth coral-pink and cream hide, a rounded head set above a soft but visible neck fold, sloped shoulders behind it, huge glossy dark eyes, small flippers and delicate whiskers`,
    ['a seal pup, head about one third of its full height, soft and rounded all over',
     'a reef-glow seal, faint bioluminescent spots along its flanks',
     'a deep blue seal, darker hide, longer body built for depth',
     'a coral sea king, a crown of living coral along its spine, pearls set into its hide, regal']],
  ['bamboo-panda', '竹熊貓',
    `a panda with soft green and cream fur instead of black and white, round dark eye patches, small round ears, a stout body and a bamboo leaf tucked behind one ear`,
    ['a panda cub, head about one third of its full height, sitting round like a dumpling',
     'a green bamboo adept, standing upright, a simple cloth belt, a bamboo stave',
     'a jade-armour panda, plates of polished green bamboo across its shoulders',
     'a guardian of a thousand bamboos, a full suit of bamboo armour, a serene stance, wind in the leaves around it']],
  ['nightwing-bat', '夜翼蝠',
    `a bat with deep violet fur, large rounded ears, wide membranous wings, big luminous pale eyes and a small upturned nose`,
    ['a bat pup, head about one third of its full height, wings still small and folded',
     'a twilight bat, wings fully grown, a faint purple glow along the wing bones',
     'an eclipse bat, a dark ring marking on its chest, wings edged in silver',
     'an evernight wing king, enormous spread wings full of stars, a crown of dark crystal']],
  ['crystal-deer', '晶鹿',
    `a deer with pale ice-blue fur, translucent crystal antlers, a white dappled back, large gentle dark eyes and slender legs`,
    ['a fawn, head about one third of its full height, antlers just two small crystal buds',
     'a prism deer, small branching crystal antlers that catch the light',
     'an ice-crystal stag, tall branching antlers, a mantle of frost across its shoulders',
     'a dawn crystal hart, great antlers glowing with sunrise colours, luminous and stately']],
  ['ink-raccoon', '墨狸',
    `a raccoon with slate-grey fur, a dark ink-blot mask across its eyes, a ringed bushy tail, small clever paws and bright curious eyes`,
    ['a raccoon kit, head about one third of its full height, mask still faint',
     'a shadow-step raccoon, darker coat, its paws trailing faint wisps of ink',
     'a phantom-ink raccoon, parts of its body fading into drifting ink',
     'a living ink spirit, a body of flowing brush strokes holding a raccoon shape, elegant and calm']],
  ['emberwing-dragon', '熾焰龍',
    `a dragon with deep ember-red scales, a warm gold underbelly, broad membranous wings, a crest of soft spines along its neck, large gentle golden eyes and glowing amber cracks along its shoulders`,
    ['a whelp still half in its cracked ember shell, head about one third of its full height, wings tiny',
     'a flame-wing drake, wings now large enough to lift it, small curved horns',
     'a volcanic wing dragon, powerful build, molten light between the scales of its chest',
     'a corona ember dragon, a ring of solar fire behind its wings, crowned horns, immense and noble']],
  ['nebula-slime', '星雲膠獸',
    `a slime creature whose translucent violet body, full of drifting stars, rises into a distinct rounded head above a clear narrowed neck, with sloped shoulders below it, two small stubby arms, huge bright eyes set in the upper half of the head, and a soft flattened base`,
    ['a stardrop slime, small and soft, the head barely lifted above the shoulders but still its own shape',
     'a nebula slime, larger, swirling clouds of pink and blue inside its body',
     'a starcore monster, a bright burning core visible at its centre, small orbiting fragments',
     'a cosmic light-eater, a body like a window into deep space, a ring of swallowed light around it']],
  ['abyss-lantern-squid', '深淵燈魷',
    `a squid with deep blue-black skin, a domed mantle that reads as a head with a glowing pale lantern bulb on top, a clear collar line of frills where the mantle meets narrow shoulders, large luminous eyes set high, and short curling tentacles it stands on`,
    ['a lantern squidlet, head about one third of its full height, one small glowing bulb',
     'a ghost-tide squid, longer tentacles, faint trailing light',
     'an abyss giant squid, a broad mantle, many bright lantern nodes along its arms',
     'a trench lantern spirit, a great glowing crown of light, long flowing arms, mysterious and calm']],
  ['storm-kirin', '雷麒麟',
    `a kirin with golden scaled hide, a flowing white mane, a single branching antler, hooved feet, a long tufted tail and clear amber eyes`,
    ['a spark kirin fawn, head about one third of its full height, antler just a small stub',
     'a cloudbolt kirin, mane lengthening, small arcs of light along its back',
     'a thunderhorn kirin, a tall branching antler crackling with light, powerful legs',
     'a nine-sky thunder sovereign, a radiant halo of lightning, a mane of white fire, divine and serene']],
  ['grove-colossus', '森林巨獸',
    `a beast built of living wood and moss, a broad rounded body, glowing green eyes set deep in a mossy face, thick root-like legs and small ferns growing along its back`,
    ['a sprout spirit, small and round-bodied with a clear little head on top, a single seedling growing from it',
     'a vinehorn beast, curling vine horns, thicker limbs, flowers opening along its shoulders',
     'an ancient grove colossus, huge and slow, whole saplings rooted in its back',
     'a guardian of all trees, a towering figure crowned with a full canopy, glowing sap running through its bark']],
];

/**
 * The five places an accessory has to land.
 *
 * The outfit system puts a hat on the skull, glasses on the eye line, a collar under the chin,
 * wings behind the shoulders and a ring of light at the feet, and it finds those places by
 * measuring the art. A creature drawn as a featureless blob has none of them: the first sheet
 * generated came back as a lovely slime that could wear a hat and nothing else. So the anatomy
 * is now part of the brief rather than something each design happens to have or not.
 */
const ANATOMY = `This creature is dressed up by the player, so five landmarks must read clearly
on its body, from every angle, even if the creature is round or blob-like:

  HEAD   a distinct head shape at the top - a dome, a skull, a bulge - separate
         enough from the body to have a top a hat could sit flat on.
  FACE   eyes set in the upper half of the head, level with each other, with
         clear space across the bridge between them where glasses would rest.
  NECK   a visible narrowing, collar line or ruff where the head meets the body,
         wide enough to wear a collar or a scarf.
  BACK   an upright shoulder area behind and below the head, broad and flat
         enough that wings or a pack worn there would be seen on both sides.
  FEET   feet or a base planted on the ground, with open floor around them.

Do not draw the creature as a single undivided ball. Head, neck and shoulders must
be readable even on the roundest design.`;

const PET_ROWS = `Row 1, seen from the FRONT, facing the viewer:
  cell 1  standing idle
  cell 2  walking, left foot forward
  cell 3  walking, passing pose with both feet together
  cell 4  walking, right foot forward
  cell 5  standing idle with the eyes closed
Row 2, seen from the SIDE, facing to the right: the same five poses in the same order
Row 3, seen from BEHIND, facing away from the viewer: the same five poses in the same order
Row 4, seen from the FRONT only:
  cell 16  eating, head lowered
  cell 17  a happy hop with both feet off the ground
  cell 18  asleep, curled up
  cell 19  sitting down
  cell 20  surprised, ears and eyes wide

The side and back rows are the same creature turned, not the creature redrawn. Across all four rows keep the same overall height, the same body width, the same head-to-body ratio and the same limb length. Check the size of the head against the body in every single cell.

Every feature named in the description above is present in all 20 cells - from behind, lying down, and in every walk pose. If part of the design is something the creature sits in, wears or carries, it is there in every cell too, not only in the first one.

Row 2 is a true side profile facing to the right in all five of its cells, at the same angle each time. Row 4 faces the viewer at the same front angle as row 1.

In every cell the creature stands on the same baseline, occupies the same height, and is shown in full with nothing cropped or cut off by the cell edge.

Exactly 20 cells in 4 rows of 5. Do not add a fifth row, do not add extra poses, and do not leave a cell empty.`;


/**
 * What each kind of prompt must and must not say.
 *
 * These are the clauses the first generated sheets proved were needed: a sheet that did not
 * insist on alpha came back on white, one that did not state its cell count came back with a
 * fifth row, one that described a room got the room painted behind every chair. Checking them
 * here means an edit that quietly drops one fails the build instead of being discovered in a
 * batch of a hundred generated images.
 *
 * Rooms are the deliberate exception: a room is a background, so it must demand the opposite of
 * transparency, and must not mention alpha at all.
 */
const MUST_SAY = {
  room: [
    'fully opaque', 'no transparency anywhere',
    'The floor is the subject of the picture', 'about a quarter of the image height',
    'SIDE WALLS', 'THE WHOLE FLOOR MUST BE IN THE PICTURE',
    'never touches the left or right edge', 'about a tenth of the image wide',
    'clearly shorter than the picture is wide',
    'looking down into an open shoebox',
    'must not read as a grid', 'one and a half times the size of the same plank at the back',
    'Nothing stands on the floor', 'no characters',
    '16:9 landscape',
  ],
  sheet: [
    'genuinely transparent', 'real alpha channel', 'Save as PNG with alpha', 'Not white',
    'no white outline or sticker die-cut edge', 'no text', 'no watermark',
  ],
  furniture: [
    'Do not draw a room, a setting or a scene', 'writing, lettering, numbers or a logo',
    'one and a half times as wide as it is deep', 'Exactly 20 cells in 4 rows of 5', 'do not repeat an item',
  ],
  wearable: [
    'Each cell contains ONE cut-out object', 'no creature', 'do not repeat an item',
  ],
  pet: [
    'five landmarks must read clearly', 'Do not draw the creature as a single undivided ball',
    'The same individual creature appears in all 20 cells', 'present in all 20 cells',
    'turned, not the creature redrawn', 'true side profile facing to the right',
    'Row 4 faces the viewer', 'stands on the same baseline',
    'Exactly 20 cells in 4 rows of 5', 'Do not add a fifth row', 'not a die-cut sticker',
  ],
};
const MUST_NOT_SAY = {
  room: ['transparent background', 'real alpha channel'],
  sheet: ['fully opaque'],
};

const problems = [];
function check(kind, label, body) {
  const groups = kind === 'room' ? ['room'] : ['sheet', kind];
  for (const group of groups) {
    for (const phrase of MUST_SAY[group] || []) {
      if (!body.toLowerCase().includes(phrase.toLowerCase())) problems.push(`${label} — missing "${phrase}"`);
    }
    for (const phrase of MUST_NOT_SAY[group] || []) {
      if (body.toLowerCase().includes(phrase.toLowerCase())) problems.push(`${label} — must not say "${phrase}"`);
    }
  }
}

const out = [];
let n = 0;
const block = (kind, label, note, body) => {
  n += 1;
  check(kind, label, body);
  out.push(`\n\n${'='.repeat(78)}\n[${String(n).padStart(3, '0')}/100]  ${label}\n${note}\n${'='.repeat(78)}\n\n${body}\n`);
};

for (const [id, zh, theme] of ROOMS) {
  block('room', `房間 · ${zh}`, `檔名：room-${id}.png　輸出：1600 x 900　不透明　風格：動森`,
`${WORLD_STYLE}

One completely empty room, seen straight on from high above, the way a doll's house is photographed with its front wall taken off. The floor is the subject of the picture; the walls are a shallow band behind it and a wedge down each side.

  BACK WALL   a strip across the top, about a quarter of the image height. Flat and
              parallel to the picture. Do not make it taller than that.
  FLOOR       a trapezoid below it, narrower where it meets the back wall than it is
              at the front, with straight side edges.
  SIDE WALLS  a wedge on each side, between the floor and the edge of the picture,
              widening as it comes forward. At the very bottom of the picture each
              one is still about a tenth of the image wide.

THE WHOLE FLOOR MUST BE IN THE PICTURE. Its near edge is a straight line along the bottom of the picture, clearly shorter than the picture is wide, with side wall to the left of it and side wall to the right of it. The floor never touches the left or right edge of the image at any height. Think of it as looking down into an open shoebox that sits inside the picture with room around it: all four corners of its floor are in view. If the floor runs off the side, the box has been drawn wider than the picture - draw it smaller until both near corners are inside.

Symmetrical left to right, no tilt and no roll.

The floor must not read as a grid - the game draws its own grid on top while a child arranges the furniture, and a second one painted into the floor fights it. So no large square tiles, and no joins that run the full width and the full depth at once. Staggered planks, parquet, brick bond, a fine grain or plain stone all work. Keep the joins low in contrast and the planks small.

The floor recedes with the room: a plank at the front is about one and a half times the size of the same plank at the back, changing evenly between them. That is a change of scale, not a set of lines, so do not draw perspective lines converging on a point. Darken the floor gently toward the back wall.

Nothing stands on the floor: no furniture, no rugs, no plants, no props, no characters. Only the built surfaces are decorated - wallpaper, panelling, skirting, and a window or door set into the wall.

Theme: ${theme}

A 16:9 landscape image, at least 1536 pixels wide, fully opaque and filled edge to edge - this one is a background, so no transparency anywhere. No border, no frame, no vignette, no text, no watermark, and no characters or creatures.`);
}

for (let i = 0; i < BATCHES.length; i += 2) {
  const [idA, labelA] = BATCHES[i];
  const [idB, labelB] = BATCHES[i + 1];
  const list = (id, offset) => SETS[id]
    .map(([, , detail], k) => `  cell ${offset + k + 1}  ${detail} - ${SLOTS[k].size}`).join('\n');
  block('furniture', `家具 · ${labelA} + ${labelB}`, `檔名：furniture-${idA}-${idB}.png　20 格（5 x 4）　風格：動森`,
`${WORLD_STYLE}

A sprite sheet of 20 separate pieces of furniture for a child's pet bedroom game. Every cell holds a different object; no two cells repeat.

Each cell contains ONE cut-out object and nothing else. Do not draw a room, a setting or a scene in any cell: no floor, no floorboards, no wall, no wall panelling, no skirting, no window, no background of any kind behind or beneath the object. Each piece floats alone on transparency.

Every piece is drawn from the same straight-on front view, from slightly above, as if standing in the middle of the room looking straight at the camera. Any horizontal top surface - a table top, a seat, a shelf - is drawn as an ellipse or a rectangle about one and a half times as wide as it is deep, which is what this camera does to a square on the floor. Vertical faces are flat and square to the viewer, never angled off to one side, and no piece is drawn in three-quarter view or from a corner. The game shrinks a piece as it is placed further back, so draw each one at a single, neutral size. The base of each piece touches the bottom edge of its own cell. Nothing is tilted, rotated or seen from a corner. Nothing carries writing, lettering, numbers or a logo.

The size given after each item is how much floor it takes up in the game, so draw wide pieces wide and small pieces small relative to one another.

${list(idA, 0)}
${list(idB, 10)}

Exactly 20 cells in 4 rows of 5. Do not add a fifth row, do not repeat an item, and do not leave a cell empty.

${sheet(5, 4)}`);
}

for (const [slot, zh, cols, rows, items, extra] of WEARABLES) {
  block('wearable', `飾物 · ${zh}`, `檔名：wearable-${slot}.png　${cols * rows} 格（${cols} x ${rows}）　風格：日系動漫（跟寵物）`,
`${PET_STYLE}

A sprite sheet of ${cols * rows} ${slot} accessories worn by small anime creature companions.

Each cell contains ONE cut-out object and nothing else - no room, no setting, no floor, no wall, no background of any kind. Exactly ${cols * rows} cells in ${rows} rows of ${cols}. Do not add a row, do not repeat an item, and do not leave a cell empty.

${extra}

Items, in this exact order, one per cell reading left to right and top to bottom:
${items}

${sheet(cols, rows)}`);
}

for (const [id, zh, base, stages] of SPECIES) {
  stages.forEach((growth, index) => {
    block('pet', `寵物 · ${zh} 第 ${index + 1} 階段`, `檔名：pet-${id}-${index + 1}.png　20 格（5 x 4）　風格：日系動漫`,
`${PET_STYLE}

A character sprite sheet for ONE creature: ${base}. At this stage it is ${growth}.

${ANATOMY}

The same individual creature appears in all 20 cells - identical colours, markings, proportions and features. This is one character seen from different angles and in different poses, not a set of design variations.

${PET_ROWS}

${sheet(5, 4)}`);
  });
}

const header = `# BuiO 寵物模組 · 美術生成 prompt

合共 ${n} 段。每段由 ${'='.repeat(6)} 之間嘅內容整段複製，貼落圖像生成 AI。

兩種風格：
  房間、家具            動物森友會風 —— 柔和、無描邊、暖調
  寵物、飾物            日系動漫風 —— 清晰描線、賽璐璐上色、可愛又帥

房間輸出 1600 x 900 不透明；其餘全部 4096 x 4096 透明 PNG。
檔名同格內次序唔好改 —— 匯入程式靠佢對應返 catalog 入面嘅 id。

由 scripts/build-art-prompts.mjs 生成，唔好手改；改咗個 script 再跑過。
`;

if (problems.length) {
  console.error(`\n${problems.length} prompt(s) failed the clause check:`);
  for (const problem of [...new Set(problems.map((p) => p.slice(p.indexOf('—'))))]) console.error('  ' + problem);
  process.exit(1);
}

fs.writeFileSync('docs/art-prompts.md', header + out.join(''));
console.log(`docs/art-prompts.md · ${n} 段 · ${(header + out.join('')).length.toLocaleString()} 字`);
console.log('  房間 10（動森）· 家具 5（動森）· 飾物 5（動漫）· 寵物 80（動漫）');
console.log('  逐段條款檢查：全部通過');
