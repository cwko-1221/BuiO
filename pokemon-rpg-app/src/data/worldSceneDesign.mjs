// Calibrated physical display envelopes (in visible game pixels relative to a
// 112px adult trainer) for both the 150 regional props (THEME_ATLAS, 0..24)
// and the 150 regional architectural & landmark setpieces (LANDMARK_ATLAS, 0..24).
const metric = (w, h, depth = 0.35, solid = true) => ({ w, h, depth, solid });
const sizes = (rows) => rows.map(([w, h, d, s]) => metric(w, h, d, s));

// Helper to reference a LANDMARK_ATLAS index (0..24) in a scene's prop list:
export const L = (idx) => 100 + idx;
export const isLandmarkVariant = (v) => v >= 100;
export const unwrapLandmarkVariant = (v) => v - 100;

export const SCENE_PROP_METRICS = {
  dawnleaf: sizes([
    [100, 90],              // 0: berry shrub in stone border
    [100, 56],              // 1: medicinal herb wooden planter
    [128, 146],             // 2: town wooden community noticeboard
    [255, 224],             // 3: cozy rest pavilion bench with canvas sunshade
    [72, 90],               // 4: civic survey stone with leaf relief
    [48, 38],               // 5: postal parcel & leather satchel
    [54, 62],               // 6: flowering ceramic garden planter
    [136, 126],             // 7: wooden park bench with iron feet
    [66, 174],              // 8: brass and wood street lamp
    [158, 110],             // 9: low stone garden wall corner
    [142, 108],             // 10: white picket fence corner
    [166, 118],             // 11: low flower-lined wooden gate
    [68, 90],               // 12: stone birdbath with shallow water
    [92, 84],               // 13: stack of wooden produce crates
    [130, 114],             // 14: handcart carrying rolled blankets
    [72, 106],              // 15: modest public water pump
    [60, 82],               // 16: round wooden rain barrel
    [118, 80],              // 17: vegetable planter box
    [148, 110],             // 18: low hedge corner with pink blossoms
    [76, 112],              // 19: wooden directional street sign
    [88, 54, 0.08, false],  // 20: narrow stone drain grate (ground)
    [96, 66, 0.08, false],  // 21: cobblestone stepping-stone group (ground)
    [104, 94],              // 22: gardening wheelbarrow with tools
    [176, 196],             // 23: market stall table with folded cloth & awning
    [62, 76],               // 24: carved stone town milestone
  ]),
  meadow: sizes([
    [100, 90],              // 0: wild berry shrub
    [86, 48],               // 1: low medicinal herb clump
    [126, 142],             // 2: wind-weathered trail noticeboard
    [248, 208],             // 3: green canvas traveler tent
    [74, 96],               // 4: standing field survey stone
    [50, 45],               // 5: traveler's leather backpack & map
    [64, 44, 0.10, false],  // 6: clump of yellow & white meadow flowers (ground)
    [84, 58, 0.10, false],  // 7: low bank of long grass with seed heads (ground)
    [104, 88],              // 8: wild rose bush with pink flowers
    [105, 162],             // 9: small young sapling
    [152, 98],              // 10: low dry-stone boundary wall corner
    [114, 108],             // 11: rustic wooden stile
    [160, 102],             // 12: wooden split-rail fence section
    [186, 240],             // 13: unpainted wooden windmill on stone foot
    [98, 68],               // 14: pile of rounded sunlit field stones
    [94, 84],               // 15: weathered hollow tree stump
    [148, 90],              // 16: fallen log with moss and flowers
    [62, 46, 0.10, false],  // 17: small bird nest in low bush (ground)
    [50, 46],               // 18: woven harvest basket with berries
    [100, 64, 0.08, false], // 19: flat meadow stepping stones (ground)
    [74, 104],              // 20: narrow stone wayside shrine
    [154, 138],             // 21: handcart with bundled hay
    [150, 92],              // 22: low wooden water trough
    [78, 114],              // 23: wooden trail direction sign
    [110, 64, 0.08, false], // 24: patch of exposed earth with grass tufts (ground)
  ]),
  mosswood: sizes([
    [105, 88],              // 0: woodland berry bush
    [86, 48],               // 1: medicinal forest ferns
    [134, 145],             // 2: rustic ranger noticeboard
    [252, 208],             // 3: moss-green canvas ranger tent
    [78, 105],              // 4: ancient forest survey stone
    [48, 40],               // 5: worn leather research satchel
    [74, 48, 0.10, false],  // 6: cluster of low rich green ferns (ground)
    [42, 34, 0.08, false],  // 7: family of woodland mushrooms (ground)
    [104, 92],              // 8: moss-covered hollow tree stump
    [168, 108],             // 9: fallen birch log with shelf fungi
    [124, 88],              // 10: twisted exposed root cluster
    [114, 94],              // 11: tangle of old woodland vines
    [98, 84],               // 12: low bramble bush
    [124, 108],             // 13: mossy boulder with fern
    [94, 68],               // 14: damp smooth stream stones
    [64, 46, 0.10, false],  // 15: short fallen branch with dry leaves (ground)
    [48, 40, 0.10, false],  // 16: abandoned nest between roots (ground)
    [162, 98],              // 17: split timber footbridge approach beam
    [84, 94],               // 18: partially buried carved forest tablet
    [46, 36],               // 19: wooden forest offering bowl with berries
    [110, 150],             // 20: broken low ruin pillar with moss & ivy
    [138, 92, 0.10, false], // 21: natural stone step group with fern edges (ground)
    [64, 64, 0.10, false],  // 22: small reed clump with damp roots (ground)
    [78, 114],              // 23: old wooden direction sign with lichen
    [104, 58, 0.08, false], // 24: woodland leaf litter with acorns (ground)
  ]),
  coast: sizes([
    [110, 85],              // 0: coastal berry shrub
    [80, 45],               // 1: coastal medicinal herbs
    [130, 145],             // 2: weathered harbor noticeboard
    [252, 220],             // 3: sand-colored beach rescue tent
    [76, 96],               // 4: tide-height survey stone
    [44, 40],               // 5: corked drift bottle & logbook
    [46, 34, 0.08, false],  // 6: seashells and smooth pebbles (ground)
    [78, 62, 0.10, false],  // 7: dune grass with seed heads (ground)
    [142, 92],              // 8: driftwood log with shells
    [142, 142],             // 9: fishing net draped over timber post
    [68, 58],               // 10: mooring rope beside wooden bollard
    [114, 114],             // 11: stack of fishery crates with blue cloth
    [198, 178],             // 12: broken wooden boat rib section
    [94, 90],               // 13: weathered anchor resting on its side
    [122, 92],              // 14: rounded tide-worn rock with seaweed
    [52, 90],               // 15: white-and-blue harbor lantern on stand
    [206, 142, 0.12, false],// 16: wooden pier planks with two short posts (ground)
    [62, 56],               // 17: wooden fishery bucket and hand net
    [76, 114],              // 18: seaside direction sign
    [134, 114],             // 19: stack of lobster pots
    [72, 102],              // 20: old brass ship bell on timber bracket
    [84, 64],               // 21: coastal succulents with pale flowers
    [118, 112],             // 22: weathered wooden oar and paddle
    [104, 78, 0.08, false], // 23: sandy stepping-stone group with shells (ground)
    [70, 85],               // 24: stone coastal milestone with wave carving
  ]),
  canyon: sizes([
    [95, 80],               // 0: hardy canyon berry shrub
    [80, 45],               // 1: silver medicinal desert herbs
    [130, 145],             // 2: expedition noticeboard with red canvas top
    [252, 212],             // 3: rust-red canvas expedition shelter
    [85, 88],               // 4: squat basalt survey stone
    [50, 43],               // 5: rugged leather field pack & geology notebook
    [128, 102],             // 6: angular terracotta canyon rocks
    [110, 158],             // 7: dark basalt column fragment
    [88, 58],               // 8: pile of black volcanic pumice stones
    [152, 118],             // 9: red sandstone slab with exposed strata
    [94, 88],               // 10: short charred tree stump with shoots
    [74, 48, 0.10, false],  // 11: dry ash-colored grasses (ground)
    [84, 78],               // 12: hardy thorn bush with pale flowers
    [62, 56],               // 13: metal mining bucket with coil of rope
    [208, 226],             // 14: timber mine support corner
    [150, 140],             // 15: wooden ore cart with mineral rocks
    [148, 132, 0.12, false],// 16: rough red stone steps (ground)
    [72, 86],               // 17: worn stone cairn trail marker
    [58, 44],               // 18: folded canvas water bag & clay canteen
    [114, 94],              // 19: outcrop of copper-colored mineral crystals
    [94, 74],               // 20: cracked stone fire-bowl with cold ash
    [80, 114],              // 21: dark weathered direction sign
    [152, 122],             // 22: volcanic boulder with orange mineral vein
    [84, 62, 0.10, false],  // 23: short dry fallen branch beside pebbles (ground)
    [114, 68, 0.08, false], // 24: patch of cooled charcoal earth (ground)
  ]),
  twilight: sizes([
    [100, 80],              // 0: moonlit berry shrub
    [85, 45],               // 1: silver-green medicinal moon herbs
    [126, 145],             // 2: shrine research noticeboard
    [252, 220],             // 3: violet-grey canvas survey shelter
    [85, 125],              // 4: ancient survey stele with star-and-crescent
    [48, 38],               // 5: closed parchment folio & leather pouch
    [92, 102],              // 6: pale violet mineral crystals
    [110, 164],             // 7: broken fluted temple column
    [182, 132],             // 8: moss-covered fallen column segment
    [138, 122],             // 9: fragment of carved stone cornice
    [62, 65],               // 10: stone offering bowl with pale flowers
    [56, 110],              // 11: unlit metal lantern on carved stone stand
    [176, 142, 0.12, false],// 12: ancient stone steps with moss seams (ground)
    [216, 176, 0.08, false],// 13: circular paving medallion with star relief (ground)
    [104, 94],              // 14: compact silver-leaf shrub
    [78, 58, 0.10, false],  // 15: night-blooming white flowers (ground)
    [192, 152],             // 16: ruined stone balustrade section
    [66, 86],               // 17: worn stone urn with ivy stems
    [132, 98],              // 18: angular grey-blue boulder with moss
    [76, 114],              // 19: ancient marker post with directional plaque
    [64, 64, 0.10, false],  // 20: dark reeds for reflecting pool bank (ground)
    [88, 128],              // 21: stone pedestal with broken cap
    [118, 92, 0.08, false], // 22: pale stepping stones with moss edges (ground)
    [124, 98],              // 23: half-buried stone tablet with wave lines
    [118, 72, 0.08, false], // 24: moss and old paving fragments (ground)
  ]),
};

export const LANDMARK_PROP_METRICS = {
  dawnleaf: sizes([
    [290, 270, 0.85, true],  // L(0): red-roof flower cottage house
    [280, 265, 0.85, true],  // L(1): blue-shuttered timber cottage house
    [300, 280, 0.85, true],  // L(2): glass botanical greenhouse conservatory
    [220, 240, 0.65, true],  // L(3): copper-dome classical stone gazebo
    [176, 210, 0.40, true],  // L(4): climbing pink rose trellis archway
    [148, 265, 0.50, true],  // L(5): cream stone clock & bell tower
    [188, 198, 0.50, true],  // L(6): red-and-white fruit market stall
    [178, 192, 0.50, true],  // L(7): flower shop tiered market stall
    [188, 192, 0.50, true],  // L(8): bakery patio counter stall
    [152, 178, 0.45, true],  // L(9): shingled stone wishing well
    [176, 176, 0.50, true],  // L(10): tiered leaf stone fountain basin
    [168, 118, 0.30, true],  // L(11): brick-bordered tulip flowerbed
    [176, 138, 0.38, true],  // L(12): L-shaped boxwood hedge with azaleas
    [114, 196, 0.25, true],  // L(13): double wrought-iron boulevard streetlamp
    [152, 162, 0.42, true],  // L(14): stepped stone sundial monument
    [168, 168, 0.42, true],  // L(15): outdoor cafe parasol table set
    [198, 198, 0.55, true],  // L(16): wooden slatted rest pergola
    [112, 188, 0.32, true],  // L(17): red-roofed wooden dovecote tower
    [212, 156, 0.45, true],  // L(18): arched stone bridge culvert
    [196, 196, 0.60, true],  // L(19): gardener's timber tool shed
    [198, 148, 0.42, true],  // L(20): semi-circular stone amphitheater bench
    [212, 168, 0.38, true],  // L(21): twin stone gate pillars & iron fence
    [164, 158, 0.38, true],  // L(22): tiered plant nursery display rack
    [215, 148, 0.08, false], // L(23): cobblestone compass star roundel (ground)
    [268, 258, 0.70, true],  // L(24): grand town oak with stone tree-bench
  ]),
  meadow: sizes([
    [300, 280, 0.85, true],  // L(0): rustic country wooden barn
    [230, 290, 0.65, true],  // L(1): tall wooden windmill tower
    [224, 210, 0.42, true],  // L(2): timber ranch entrance gate archway
    [235, 210, 0.65, true],  // L(3): covered wooden hay barn shelter
    [198, 210, 0.55, true],  // L(4): wayside wooden Shinto shrine pavilion
    [218, 198, 0.60, true],  // L(5): beekeeper's honey shed & 3 hives
    [188, 238, 0.55, true],  // L(6): elevated timber meadow lookout tower
    [192, 188, 0.50, true],  // L(7): rustic wooden waterwheel & stone trough
    [168, 178, 0.35, true],  // L(8): wooden ema prayer-tablet rack
    [218, 198, 0.55, true],  // L(9): covered country canvas wagon
    [198, 188, 0.50, true],  // L(10): pastoral picnic table under canvas shade
    [215, 152, 0.55, true],  // L(11): circular stone-lined lily pond
    [208, 152, 0.42, true],  // L(12): L-shaped split-rail corral corner
    [192, 132, 0.35, true],  // L(13): dry-stone field wall with wild roses
    [168, 198, 0.38, true],  // L(14): sunflower & daisy wooden archway
    [212, 198, 0.60, true],  // L(15): shepherd's wooden hut on wheels
    [198, 168, 0.50, true],  // L(16): pair of golden haystacks with pitchfork
    [188, 178, 0.48, true],  // L(17): standing stone monolith circle
    [212, 156, 0.42, true],  // L(18): wooden footbridge with side rails
    [188, 178, 0.50, true],  // L(19): outdoor wooden berry-pressing station
    [188, 148, 0.38, true],  // L(20): twin stone toro lanterns & mossy step
    [188, 148, 0.38, true],  // L(21): sunflower & lavender raised bed
    [224, 178, 0.50, true],  // L(22): traveler's campfire ring, logs & tent
    [128, 182, 0.32, true],  // L(23): carved wooden wind-chime bell stand
    [238, 238, 0.60, true],  // L(24): sunlit fruit orchard tree with ladder
  ]),
  mosswood: sizes([
    [280, 260, 0.85, true],  // L(0): forest ranger's log cabin outpost
    [240, 240, 0.70, true],  // L(1): giant hollow stump glowing mushroom shrine
    [198, 212, 0.42, true],  // L(2): moss-draped ancient stone archway
    [218, 198, 0.60, true],  // L(3): elevated tree-stump observation deck
    [168, 208, 0.48, true],  // L(4): ancient mossy stone guardian statue
    [218, 198, 0.60, true],  // L(5): tiered mossy rock cascade spring pool
    [198, 188, 0.50, true],  // L(6): covered wooden herb-drying pavilion
    [218, 168, 0.50, true],  // L(7): massive fallen trunk arch with shelf fungi
    [188, 208, 0.42, true],  // L(8): pair of ivy-wrapped fluted ruin columns
    [218, 158, 0.42, true],  // L(9): woodland suspension footbridge section
    [168, 178, 0.42, true],  // L(10): giant luminescent teal mushroom cluster
    [198, 188, 0.50, true],  // L(11): ranger's covered tarp field desk
    [178, 152, 0.48, true],  // L(12): mossy circular stone sundial altar
    [198, 178, 0.50, true],  // L(13): mossy stone stairway with balustrades
    [188, 168, 0.48, true],  // L(14): hollow log sanctuary with mossy roof
    [188, 158, 0.38, true],  // L(15): twin mossy stone lanterns & threshold
    [208, 148, 0.45, true],  // L(16): enclosed woodland campfire & log benches
    [208, 148, 0.42, true],  // L(17): streamside wooden dock with reeds
    [198, 198, 0.42, true],  // L(18): ancient tangled root archway
    [168, 142, 0.42, true],  // L(19): ruined mossy stone well with ferns
    [208, 198, 0.55, true],  // L(20): wooden ranger firewood & supply shed
    [198, 168, 0.50, true],  // L(21): mossy boulder dolmen shelter
    [198, 188, 0.50, true],  // L(22): thatch-roofed mushroom log rack
    [138, 188, 0.32, true],  // L(23): carved owl totem signpost with lantern
    [248, 248, 0.65, true],  // L(24): sacred spore willow tree
  ]),
  coast: sizes([
    [275, 260, 0.80, true],  // L(0): whitewashed harbor master cottage
    [196, 238, 0.55, true],  // L(1): wooden beach lifeguard & tide-watch tower
    [218, 236, 0.60, true],  // L(2): blue-and-white seaside gazebo
    [216, 158, 0.45, true],  // L(3): wooden harbor pier jetty platform
    [216, 182, 0.55, true],  // L(4): salvage boat rib & anchor dock
    [196, 196, 0.50, true],  // L(5): seaside fish & shell market stall
    [176, 178, 0.45, true],  // L(6): monumental ship anchor on plinth
    [176, 250, 0.50, true],  // L(7): coastal tide-gauge clock & bell tower
    [225, 178, 0.55, true],  // L(8): shipwrecked prow & coral reef outcrop
    [196, 192, 0.50, true],  // L(9): beach cabana counter hut
    [235, 248, 0.60, true],  // L(10): twin coconut palm oasis grove
    [198, 192, 0.50, true],  // L(11): drying fishing net & lobster trap rack
    [198, 208, 0.42, true],  // L(12): sandstone sea-wall arch gate
    [212, 156, 0.50, true],  // L(13): natural coastal rock tidepool basin
    [188, 178, 0.45, true],  // L(14): beachside parasol picnic deck
    [218, 196, 0.55, true],  // L(15): harbor cargo wagon & crate depot
    [204, 158, 0.45, true],  // L(16): lighthouse keeper's stone watch alcove
    [218, 152, 0.08, false], // L(17): sandstone compass-rose roundel (ground)
    [212, 156, 0.42, true],  // L(18): timber footbridge boardwalk crossing
    [220, 176, 0.50, true],  // L(19): driftwood beach shelter & campfire
    [156, 184, 0.35, true],  // L(20): maritime signal bell stand
    [196, 182, 0.50, true],  // L(21): harbor barrel & lobster trap depot
    [196, 204, 0.55, true],  // L(22): sea-wave shrine pavilion
    [198, 196, 0.52, true],  // L(23): coastal pergola rest shelter
    [235, 238, 0.60, true],  // L(24): palm & sea-rock headland outcrop
  ]),
  canyon: sizes([
    [212, 238, 0.60, true],  // L(0): heavy timber mine-shaft headframe tower
    [224, 208, 0.42, true],  // L(1): crimson martial arts dojo gate archway
    [208, 196, 0.55, true],  // L(2): blacksmith forge & smelter shed
    [228, 204, 0.60, true],  // L(3): expedition command shelter pavilion
    [208, 212, 0.45, true],  // L(4): natural red-sandstone arch formation
    [216, 198, 0.55, true],  // L(5): double ore-cart & timber bumper station
    [216, 196, 0.55, true],  // L(6): canyon cliffside watchtower deck
    [198, 176, 0.45, true],  // L(7): twin basalt brazier pillars
    [216, 196, 0.58, true],  // L(8): geothermal mineral hot-spring rock pool
    [196, 188, 0.45, true],  // L(9): martial arts wooden training post & rack
    [206, 186, 0.50, true],  // L(10): basalt column & magma-vein monoliths
    [204, 190, 0.52, true],  // L(11): geology assay pavilion & specimen desk
    [204, 182, 0.50, true],  // L(12): stepped red-stone dojo forecourt dais
    [216, 162, 0.45, true],  // L(13): canyon suspension bridgehead
    [188, 168, 0.48, true],  // L(14): volcanic obelisk & sundial plinth
    [196, 204, 0.52, true],  // L(15): dojo fire shrine pavilion
    [198, 186, 0.50, true],  // L(16): heavy ore-crusher & winch station
    [204, 174, 0.52, true],  // L(17): red-rock dolmen cavern shelter
    [212, 158, 0.48, true],  // L(18): expedition bonfire hearth & log circle
    [208, 162, 0.45, true],  // L(19): timber corral & ore-wagon depot
    [204, 182, 0.50, true],  // L(20): giant amber & copper fire-crystal outcrop
    [186, 182, 0.48, true],  // L(21): canyon water-cistern & stone well
    [182, 208, 0.48, true],  // L(22): guardian stone statue on red plinth
    [196, 206, 0.45, true],  // L(23): ruined canyon stone colonnade
    [225, 205, 0.58, true],  // L(24): canyon juniper & volcanic red-rock outcrop
  ]),
  twilight: sizes([
    [204, 214, 0.45, true],  // L(0): grand astral stone temple archway
    [218, 238, 0.60, true],  // L(1): octagonal moonlit temple gazebo
    [182, 178, 0.45, true],  // L(2): celestial sundial & astrolabe plinth
    [204, 196, 0.52, true],  // L(3): towering starlight amethyst crystal cluster
    [245, 215, 0.65, true],  // L(4): ruined temple fluted colonnade
    [186, 182, 0.50, true],  // L(5): sacred starry reflecting font
    [196, 176, 0.48, true],  // L(6): elevated stone observatory altar
    [198, 176, 0.42, true],  // L(7): twin temple lantern pillars & threshold
    [192, 208, 0.45, true],  // L(8): ancient stone archive colonnade
    [212, 162, 0.45, true],  // L(9): ornate arched stone footbridge
    [218, 154, 0.08, false], // L(10): stepped astral seal dais (ground)
    [202, 192, 0.50, true],  // L(11): scholar's sanctuary pavilion
    [182, 212, 0.48, true],  // L(12): celestial guardian statue on marble pedestal
    [204, 156, 0.42, true],  // L(13): crescent stone amphitheater bench
    [204, 186, 0.48, true],  // L(14): twin crystal obelisk pylons
    [204, 182, 0.50, true],  // L(15): grand temple staircase flight
    [214, 194, 0.55, true],  // L(16): moonlit cascading spring basin
    [212, 172, 0.40, true],  // L(17): sanctuary stone gate pillars & balustrade
    [228, 236, 0.60, true],  // L(18): sacred silver-leaf moon tree
    [164, 188, 0.38, true],  // L(19): sanctuary bell & chime frame
    [204, 172, 0.50, true],  // L(20): stone offering altar & urn court
    [184, 152, 0.45, true],  // L(21): ruined stone wishing well
    [196, 206, 0.52, true],  // L(22): canopied starlight shrine pavilion
    [196, 162, 0.40, true],  // L(23): twin toro lanterns & mossy steps
    [255, 248, 0.68, true],  // L(24): ancient moon-tree & stone seat sanctuary
  ]),
};

export function getScenePropMetric(zone, variant) {
  if (isLandmarkVariant(variant)) {
    const idx = unwrapLandmarkVariant(variant);
    return LANDMARK_PROP_METRICS[zone]?.[idx] || LANDMARK_PROP_METRICS.dawnleaf[0];
  }
  return SCENE_PROP_METRICS[zone]?.[variant] || SCENE_PROP_METRICS.dawnleaf[0];
}

export function fitSceneProp(zone, variant, art) {
  const box = getScenePropMetric(zone, variant);
  const ratio = Math.min(box.w / art.width, box.h / art.height);
  return { w: art.width * ratio, h: art.height * ratio };
}

const scene = (id, nameZh, x, z, rx, rz, material, props, options = {}) => ({
  id,
  nameZh,
  x,
  z,
  rx,
  rz,
  material,
  props,
  ...options,
});

// Master-Planned Level Design across all 6 zones:
// - Every zone combines hero architectural setpieces (L(0)..L(24)) with all 19
//   regional props (6..24).
// - Every Camp, Noticeboard, Building Forecourt, and Survey Site sits cleanly
//   off the road centerline in a structured plaza/court/camp bay connected to
//   the road network by a paved or compacted-earth spur path (`paths`).
export const WORLD_SCENES = {
  dawnleaf: [
    // 1. Central Fountain Plaza: keep 100% open & serene around the Fountain and 5 NPCs!
    // Only 2 symmetrical tulip flowerbeds between the northern buildings and 2 streetlamps at the north corners.
    scene('town-central-plaza', '晨曦中央噴泉廣場', 0, 1.5, 6.2, 4.2, 'stone', [
      [L(11), -4.3, -6.0],
      [L(11), 4.3, -6.0],
      [L(13), -4.3, -3.2],
      [L(13), 4.3, -3.2],
    ], {
      shape: 'plaza',
      paths: [
        [-8.5, -3.2, -8.5, 0, 3.0, 'stone'],
        [0, -4.2, 0, 0, 3.4, 'stone'],
        [8.5, -3.2, 8.5, 0, 3.0, 'stone'],
      ],
    }),

    // 2. Noticeboard Civic Corner (west of South Avenue, well south of Mia at -5,5)
    scene('town-commons', '晨曦鎮委託欄廣場', -4.2, 10.2, 3.6, 2.6, 'stone', [
      [L(5), -4.2, -0.6],
      [7, -4.2, 2.2],
      [8, 2.2, -0.6],
    ], {
      shape: 'court',
      paths: [[0, 10.2, -4.2, 10.2, 2.2, 'stone']],
    }),

    // 3. East Avenue Market Row (aligned in a single horizontal street-front row at z = -3.8)
    scene('town-market', '星輝東街市集', 18.0, -3.8, 5.8, 2.6, 'stone', [
      [L(6), -3.8, 0.0],
      [L(7), 0.0, 0.0],
      [L(8), 3.8, 0.0],
      [13, -6.2, 0.4],
      [16, 6.2, 0.4],
    ], {
      shape: 'court',
    }),

    // 4. Northwest Botanical Conservatory & Herb Garden (`dawnleaf_herb_3` at -22.0, -14.0)
    scene('town-herbs', '植物溫室與藥草圃', -22.0, -14.0, 4.6, 3.2, 'earth', [
      [L(2), 0.0, -3.8],
      [17, -3.8, -0.4],
      [17, 3.8, -0.4],
      [11, 0.0, 2.6],
    ], {
      shape: 'garden',
    }),

    // 5. South Courtyard Rest Sanctuary (`dawnleaf_camp_1` at -22.5, 14.5)
    scene('town-rest', '南庭休憩花園驛站', -22.5, 14.5, 5.4, 4.0, 'stone', [
      [L(0), -4.8, -3.6],
      [L(3), 4.8, -2.4],
      [L(4), -4.6, 1.8],
      [12, 4.4, 1.8],
      [6, 0.0, 2.8],
    ], {
      shape: 'plaza',
      paths: [[-28.2, 14.5, -26.2, 14.5, 2.4, 'stone']],
    }),

    // 6. Southeast Residential Cottage & Berry Orchard (`dawnleaf_berry_2` at 14.0, 12.5)
    scene('town-orchard', '東苑紅瓦民居與果園', 14.0, 12.5, 4.8, 3.4, 'earth', [
      [L(1), 4.4, -3.2],
      [L(9), -4.2, -2.4],
      [L(23), 0.0, 2.2],
      [9, -4.0, 2.0],
      [22, 4.0, 1.8],
    ], {
      shape: 'garden',
    }),

    // 7. North Climate Observatory & Sundial Terrace (`dawnleaf_survey_4` at -16.0, -28.0)
    scene('town-weather', '北苑星風觀測石臺', -16.0, -28.0, 4.4, 3.0, 'stone', [
      [L(14), -3.8, -1.4],
      [L(20), 3.8, -1.4],
      [24, -3.4, 1.8],
      [19, 3.4, 1.8],
    ], {
      shape: 'court',
      paths: [[-16.0, -31.5, -16.0, -28.5, 2.2, 'stone']],
    }),

    // 8. Southwest Postal Pergola Waystation (`dawnleaf_satchel_5` at -24.0, 24.5)
    scene('town-post', '南庭郵政花廊驛點', -24.0, 24.5, 3.8, 2.8, 'stone', [
      [L(16), 3.6, -1.4],
      [14, -3.6, -1.0],
      [20, 0.0, 2.0],
    ], {
      shape: 'court',
    }),

    // 9. South Water Quality & Fountain Court (`dawnleaf_survey_6` at 4.5, 29.0)
    scene('town-water', '南庭水質噴泉觀測站', 4.5, 29.0, 4.2, 3.0, 'stone', [
      [L(10), -3.8, -1.2],
      [15, 3.6, -1.0],
      [10, 3.6, 1.8],
      [21, -0.4, 2.0],
    ], {
      shape: 'court',
    }),

    // 10. Northeast Ancient Oak & Gate Sanctuary (scenic landmark)
    scene('town-northeast-grove', '北苑古樹花壇廣場', 15.5, -24.0, 4.8, 3.4, 'stone', [
      [L(24), 0.0, -2.4],
      [L(21), 0.0, 2.6],
      [18, -4.2, 0.0],
      [23, 4.4, 0.0],
    ], {
      shape: 'court',
    }),
  ],

  meadow: [
    // 1. West Trailhead Ranch Gate & Noticeboard (`meadow_board_0` at -17.0, 4.2)
    scene('meadow-trailhead', '西口牧場牌樓與佈告欄', -17.0, 4.2, 4.2, 3.0, 'earth', [
      [L(2), -3.8, -1.6],
      [L(8), 3.6, -1.4],
      [23, -3.2, 1.8],
      [14, 3.4, 1.8],
    ], {
      shape: 'court',
      paths: [[-17.0, 0.5, -17.0, 3.2, 2.2, 'earth']],
    }),

    // 2. Verdant Shrine Sacred Forecourt (`翠葉神祠` at 18.5, -2.5)
    scene('meadow-shrine-court', '翠葉神祠祈願前庭', 18.5, 1.2, 5.0, 3.4, 'stone', [
      [L(4), -4.6, -0.8],
      [L(23), 4.4, -0.8],
      [L(14), 0.0, 3.8],
      [8, -4.0, 2.2],
    ], {
      shape: 'plaza',
    }),

    // 3. Southwind Pastoral Ranch & Camp (`meadow_camp_1` at 10.5, 18.5)
    scene('meadow-camp', '南風牧場旅人營地', 10.5, 18.5, 5.6, 4.2, 'earth', [
      [L(3), -4.6, -2.8],
      [L(9), 4.6, -2.4],
      [L(10), -4.2, 2.2],
      [L(12), 4.4, 2.0],
      [19, -0.8, 2.4],
    ], {
      shape: 'camp',
      paths: [[5.5, 19.0, 7.8, 18.6, 2.2, 'earth']],
    }),

    // 4. North Windmill & Monolith Observatory (`meadow_survey_4` at 21.0, -31.0)
    scene('meadow-windmill', '北風大風車與生態觀測坡', 21.0, -31.0, 5.0, 3.6, 'earth', [
      [L(1), -4.2, -2.0],
      [L(17), 4.2, -1.6],
      [13, 4.0, 2.0],
      [10, -3.8, 1.8],
      [11, 0.0, 2.4],
    ], {
      shape: 'court',
    }),

    // 5. North Slope Shepherd & Herb Dell (`meadow_herb_3` at 15.0, -25.0)
    scene('meadow-herbs', '北坡牧羊木屋與藥草窪', 15.0, -25.0, 4.2, 3.0, 'earth', [
      [L(15), -3.8, -1.6],
      [L(21), 3.6, -1.4],
      [9, 3.6, 1.8],
      [17, -3.2, 1.6],
    ], {
      shape: 'garden',
    }),

    // 6. South Apiary, Barn & Berry Orchard (`meadow_berry_2` at 23.0, 24.0)
    scene('meadow-orchard', '南風養蜂莊園與樹果園', 23.0, 24.0, 5.0, 3.6, 'earth', [
      [L(0), 4.4, -3.0],
      [L(5), -4.2, -2.2],
      [L(19), -4.0, 1.8],
      [18, 2.4, 1.4],
      [12, 4.2, 2.0],
    ], {
      shape: 'garden',
    }),

    // 7. East Meadow Lookout & Traveler Rest (`meadow_satchel_5` at 44.5, 11.5)
    scene('meadow-east', '東境瞭望木塔與歇腳處', 44.5, 11.5, 4.6, 3.2, 'earth', [
      [L(6), 3.8, -1.8],
      [L(16), -3.8, -1.6],
      [16, -3.4, 1.8],
      [15, 3.4, 1.8],
      [21, 0.0, -2.4],
      [24, 0.0, 2.0],
    ], {
      shape: 'camp',
    }),

    // 8. Southeast Waterwheel & Flowerbank Survey (`meadow_survey_6` at 34.0, 22.0)
    scene('meadow-flowerbank', '花野水車與生態觀測臺', 34.0, 22.0, 4.6, 3.2, 'earth', [
      [L(7), -3.8, -1.6],
      [L(13), 3.8, -1.6],
      [20, 3.4, 1.6],
      [22, -3.4, 1.8],
      [6, -0.8, 2.0],
      [7, 1.6, 2.2],
    ], {
      shape: 'court',
    }),
  ],

  mosswood: [
    // 1. West Forest Ranger Cabin & Noticeboard (`mosswood_board_0` at -29.0, 3.5)
    scene('forest-trailhead', '西側巡林木屋與委託欄', -29.0, 3.5, 4.4, 3.2, 'earth', [
      [L(0), -4.0, -2.4],
      [L(23), 3.6, -1.6],
      [8, 3.4, 1.8],
      [23, -3.2, 2.0],
    ], {
      shape: 'camp',
    }),

    // 2. Spore-Light Sanctuary Survey Camp (`mosswood_camp_1` at -15.5, 25.0)
    scene('forest-camp', '蕈光古樹祠與調查營地', -15.5, 25.0, 5.6, 4.2, 'moss', [
      [L(1), -4.6, -2.6],
      [L(11), 4.6, -2.2],
      [L(16), 4.0, 2.2],
      [L(10), -4.4, 2.0],
      [7, -2.0, 2.4],
      [15, 2.0, 2.6],
    ], {
      shape: 'camp',
      paths: [[-15.5, 30.8, -15.5, 28.2, 2.2, 'earth']],
    }),

    // 3. Spore-Light Berry & Mushroom Log Rack (`mosswood_berry_2` at -22.0, 19.5)
    scene('forest-forage', '蕈光栽培棚與樹果林緣', -22.0, 19.5, 4.2, 3.0, 'moss', [
      [L(22), -3.8, -1.6],
      [L(14), 3.8, -1.6],
      [12, 3.4, 1.8],
      [16, -2.8, 1.8],
    ], {
      shape: 'garden',
    }),

    // 4. Northwest Cascade Spring & Fern Hollow (`mosswood_herb_3` at -20.0, -14.0)
    scene('forest-ferns', '清泉飛瀑與蕨葉藥草窪', -20.0, -14.0, 4.4, 3.2, 'moss', [
      [L(5), -3.8, -1.8],
      [L(6), 3.8, -1.6],
      [9, -3.4, 1.8],
      [10, 3.4, 1.8],
    ], {
      shape: 'garden',
    }),

    // 5. Ancient Tree Ruin Sanctuary (`mosswood_survey_4` at 24.0, -32.5)
    scene('forest-ruins', '古樹石拱遺跡祭庭', 24.0, -32.5, 5.0, 3.4, 'stone', [
      [L(2), -4.2, -1.8],
      [L(4), 4.2, -1.8],
      [L(12), -3.8, 1.8],
      [20, 3.8, 1.6],
    ], {
      shape: 'court',
    }),

    // 6. West Brook Bridge Approach & Study Site (`mosswood_satchel_5` at -8.5, 10.5)
    scene('forest-notebook', '清溪木橋西岸調查站', -8.5, 10.5, 4.0, 3.0, 'earth', [
      [L(18), -3.6, -1.6],
      [L(19), 3.6, -1.6],
      [17, 3.2, 1.8],
      [6, -3.0, 1.6],
      [24, 0.0, 2.0],
    ], {
      shape: 'court',
    }),

    // 7. East Brook Streamside Dock & Survey (`mosswood_survey_6` at 12.5, 7.5)
    scene('forest-brook', '清溪東岸木棧觀測點', 12.5, 7.5, 4.4, 3.0, 'moss', [
      [L(17), -3.8, -1.4],
      [L(24), 4.0, -1.8],
      [14, -3.2, 1.8],
      [13, 3.4, 1.6],
      [22, 0.0, 2.0],
    ], {
      shape: 'court',
    }),

    // 8. South Canopy Observation Deck & Ruin (`mosswood_survey_7` at 24.0, 29.5)
    scene('forest-lookout', '南境觀林高台與石階遺構', 24.0, 29.5, 4.8, 3.4, 'stone', [
      [L(3), -4.0, -1.8],
      [L(13), 4.0, -1.6],
      [11, -3.6, 1.8],
      [18, 3.6, 1.8],
      [19, -1.8, -2.0],
      [21, 0.0, 2.0],
    ], {
      shape: 'court',
    }),
  ],

  coast: [
    // 1. North Beach Arrival & Rescue Noticeboard (`coast_board_0` at -5.5, -14.0)
    scene('coast-arrival', '海岸救援哨塔與告示廣場', -5.5, -14.0, 4.4, 3.2, 'stone', [
      [L(1), -3.8, -1.8],
      [L(12), 3.8, -1.6],
      [18, -3.4, 1.8],
      [15, 3.4, 1.6],
    ], {
      shape: 'court',
    }),

    // 2. Saltwind Harbor Supply Camp (`coast_camp_1` at -21.5, -15.5)
    scene('coast-camp', '鹽風海濱補給營地', -21.5, -15.5, 5.6, 4.2, 'earth', [
      [L(0), -4.6, -2.8],
      [L(2), 4.6, -2.4],
      [L(14), -4.2, 2.2],
      [L(3), 4.6, 2.0],
      [11, 2.8, -1.0],
      [17, 2.6, 1.6],
    ], {
      shape: 'camp',
      paths: [[-28.2, -15.5, -25.2, -15.5, 2.2, 'earth']],
    }),

    // 3. Tidal Lighthouse Forecourt & Tide Station (`coast_survey_4` at 10.0, 11.0 & `潮汐燈塔` at 12.5, 12.5)
    scene('coast-tides', '潮汐燈塔羅盤廣場與觀測站', 10.0, 11.0, 5.0, 3.6, 'stone', [
      [L(7), -4.2, -1.8],
      [L(6), -4.0, 2.0],
      [L(17), 0.8, 1.8],
      [20, 3.6, -1.2],
      [14, 3.8, 2.0],
      [23, -1.4, 2.2],
    ], {
      shape: 'plaza',
    }),

    // 4. West Bay Fishery Wharf & Salvage Yard (`coast_satchel_5` at -20.0, 4.5)
    scene('coast-fishery', '西灣漁港市集與修船棧橋', -20.0, 4.5, 5.2, 3.8, 'earth', [
      [L(5), -4.2, -2.0],
      [L(11), 4.2, -2.0],
      [12, -4.0, 1.8],
      [19, 4.0, 1.8],
      [16, 0.0, 2.4],
      [9, 0.0, -2.4],
      [13, -2.2, 2.2],
      [22, 2.2, 2.2],
    ], {
      shape: 'camp',
    }),

    // 5. West Bay Tidepool & Herb Dune (`coast_herb_3` at -32.5, -11.0)
    scene('coast-herbs', '西灣潮池與海風藥草灘', -32.5, -11.0, 4.4, 3.0, 'sand', [
      [L(13), -3.8, -1.6],
      [L(10), 3.8, -1.6],
      [21, 3.4, 1.8],
      [8, -3.4, 1.8],
    ], {
      shape: 'garden',
    }),

    // 6. North Dune Cabana & Berry Oasis (`coast_berry_2` at -17.0, -27.5)
    scene('coast-orchard', '鹽風椰林果園與海濱亭', -17.0, -27.5, 4.4, 3.0, 'sand', [
      [L(9), -3.8, -1.6],
      [L(23), 3.8, -1.6],
      [7, -3.2, 1.8],
      [10, 3.2, 1.8],
    ], {
      shape: 'garden',
    }),

    // 7. North Saltwind Sea-Shrine & Milestone (`coast_survey_6` at -12.0, -33.0)
    scene('coast-wind', '鹽風海神祠與潮汐界碑', -12.0, -33.0, 4.4, 3.0, 'stone', [
      [L(22), -3.8, -1.6],
      [L(20), 3.8, -1.6],
      [24, -3.2, 1.8],
      [6, 3.0, 1.8],
    ], {
      shape: 'court',
    }),
  ],

  canyon: [
    // 1. East Canyon Expedition Gate & Noticeboard (`canyon_board_0` at 18.5, 4.2)
    scene('canyon-arrival', '赤岩遠征哨塔與佈告欄', 18.5, 4.2, 4.4, 3.2, 'earth', [
      [L(6), -3.8, -1.8],
      [L(4), 3.8, -1.6],
      [21, -3.4, 1.8],
      [17, 3.4, 1.8],
    ], {
      shape: 'court',
    }),

    // 2. Blaze Dojo Grand Martial Forecourt (`烈焰武館` at -14.5, 0.0)
    scene('canyon-dojo-court', '烈焰武館演武前庭', -14.5, 3.8, 5.4, 3.6, 'stone', [
      [L(1), 0.0, 3.2],
      [L(7), -4.4, -0.4],
      [L(7), 4.4, -0.4],
      [L(9), -4.4, 2.4],
      [L(15), 4.4, 2.4],
      [16, 0.0, 1.4],
    ], {
      shape: 'plaza',
    }),

    // 3. West Crimson Rock Shelter Camp (`canyon_camp_1` at -28.5, 0.5)
    scene('canyon-camp', '赤岩避風遠征大本營', -28.5, 0.5, 5.6, 4.2, 'earth', [
      [L(0), -4.8, -2.8],
      [L(2), 4.8, -2.6],
      [L(18), -4.4, 2.2],
      [L(8), 4.4, 2.2],
      [15, 0.0, -3.2],
    ], {
      shape: 'camp',
      paths: [[-28.5, 7.2, -28.5, 3.8, 2.2, 'earth']],
    }),

    // 4. East Quarry Mine Headframe & Assay Depot (`canyon_satchel_5` at 34.5, -2.5)
    scene('canyon-quarry', '東境古礦坑作業總站', 34.5, -2.5, 5.0, 3.6, 'earth', [
      [L(11), -4.0, -2.0],
      [L(16), 4.0, -1.8],
      [14, -3.8, 1.8],
      [19, 3.8, 1.8],
      [13, 0.0, -2.2],
    ], {
      shape: 'camp',
    }),

    // 5. Northwest Earth-Vein Monolith Ridge (`canyon_survey_4` at -35.0, -12.5)
    scene('canyon-watch', '赤岩地脈黑曜石觀測脊', -35.0, -12.5, 4.4, 3.0, 'stone', [
      [L(10), -3.8, -1.4],
      [L(22), 3.8, -1.4],
      [7, -3.4, 1.8],
      [9, 3.4, 1.8],
      [8, 0.0, 2.0],
    ], {
      shape: 'court',
    }),

    // 6. Southwest Ash Garden & Dolmen (`canyon_berry_2` at -34.0, 6.0)
    scene('canyon-forage', '灰燼石棚與耐旱樹果地', -34.0, 6.0, 4.4, 3.0, 'earth', [
      [L(17), -3.8, -1.6],
      [L(24), 3.8, -1.6],
      [10, -3.4, 1.8],
      [12, 3.4, 1.8],
      [24, 0.0, 2.0],
    ], {
      shape: 'garden',
    }),

    // 7. Southeast Crystal Outcrop & Herb Crag (`canyon_herb_3` at 28.0, 7.0)
    scene('canyon-herbs', '赤晶礦脈與耐熱藥草隙', 28.0, 7.0, 4.4, 3.0, 'earth', [
      [L(20), -3.8, -1.6],
      [L(21), 3.8, -1.6],
      [6, -3.4, 1.8],
      [11, 3.2, 1.8],
      [23, 0.0, 2.0],
    ], {
      shape: 'garden',
    }),

    // 8. East Lava Temperature Sundial Platform (`canyon_survey_6` at 31.5, 1.5)
    scene('canyon-temperature', '熔岩地熱日晷觀測臺', 31.5, 1.5, 4.4, 3.0, 'stone', [
      [L(14), -3.8, -1.4],
      [L(23), 3.8, -1.4],
      [22, -3.4, 1.8],
      [18, 0.0, 2.0],
      [20, 3.4, 1.8],
    ], {
      shape: 'court',
    }),
  ],

  twilight: [
    // 1. East Sanctuary Arrival Gate & Noticeboard (`twilight_board_0` at 5.2, 18.0)
    scene('temple-gate', '神殿星門與調查佈告迴廊', 5.2, 18.0, 4.6, 3.2, 'stone', [
      [L(0), 3.6, -1.8],
      [L(7), -3.4, -1.6],
      [11, -3.2, 1.8],
      [19, 3.4, 1.8],
    ], {
      shape: 'plaza',
    }),

    // 2. West Star Court Sanctuary Camp (`twilight_camp_1` at -9.5, 16.0)
    scene('temple-camp', '星庭八角涼亭與調查休息站', -9.5, 16.0, 5.6, 4.2, 'stone', [
      [L(1), -4.6, -2.4],
      [L(11), 4.6, -2.2],
      [L(13), -4.2, 2.2],
      [L(10), 0.6, 2.2],
      [16, -1.8, -3.2],
      [21, 3.6, 1.4],
    ], {
      shape: 'plaza',
      paths: [[0.0, 16.0, -4.6, 16.0, 2.4, 'stone']],
    }),

    // 3. Starlight Altar High Sanctuary Forecourt (`星輝祭壇` at 0.0, -14.5)
    scene('temple-altar-court', '星輝祭壇聖域前庭', 0.0, -10.5, 5.8, 3.8, 'stone', [
      [L(14), -4.6, -1.8],
      [L(14), 4.6, -1.8],
      [L(12), -4.6, 1.8],
      [L(12), 4.6, 1.8],
      [13, 0.0, 0.6],
    ], {
      shape: 'plaza',
    }),

    // 4. Astral Seal Observatory Court (`twilight_survey_4` at -5.0, -19.5)
    scene('temple-seal', '星輝封印天球觀測祭庭', -5.0, -19.5, 4.8, 3.4, 'stone', [
      [L(2), -3.8, -1.6],
      [L(3), 3.8, -1.6],
      [10, -3.2, 1.8],
      [6, 3.4, 1.8],
      [12, 0.0, 2.2],
    ], {
      shape: 'plaza',
    }),

    // 5. North Ruined Archive Colonnade (`twilight_satchel_5` at 6.0, -29.0)
    scene('temple-archive', '北側古神殿石卷書庫', 6.0, -29.0, 4.6, 3.2, 'stone', [
      [L(4), -3.8, -1.8],
      [L(8), 3.8, -1.6],
      [8, -3.4, 1.8],
      [9, 3.4, 1.8],
      [23, -1.6, 2.2],
      [24, 1.6, 2.2],
    ], {
      shape: 'court',
    }),

    // 6. West Reflecting Font & Moon Herb Garden (`twilight_herb_2` at -8.5, 2.0)
    scene('temple-moonherbs', '西庭星泉池與月光藥圃', -8.5, 2.0, 4.4, 3.2, 'moss', [
      [L(5), -3.8, -1.6],
      [L(16), 3.8, -1.6],
      [20, -3.2, 1.8],
      [15, 3.2, 1.8],
    ], {
      shape: 'garden',
    }),

    // 7. East Sacred Moon-Tree & Berry Sanctuary (`twilight_berry_3` at 9.5, 11.5)
    scene('temple-berries', '東庭銀葉月樹與星果苑', 9.5, 11.5, 4.4, 3.2, 'moss', [
      [L(18), 3.8, -1.8],
      [L(22), -3.8, -1.6],
      [14, -3.4, 1.8],
      [18, 3.4, 1.8],
      [17, 0.0, 2.2],
    ], {
      shape: 'garden',
    }),

    // 8. East Moonwalk Colonnade & Stele (`twilight_survey_6` at 5.0, 4.5)
    scene('temple-moonwalk', '月影迴廊鐘亭與刻痕石庭', 5.0, 4.5, 4.4, 3.0, 'stone', [
      [L(19), 3.8, -1.4],
      [L(23), -3.6, -1.4],
      [7, 3.4, 1.8],
      [22, -0.4, 2.0],
    ], {
      shape: 'court',
    }),
  ],
};
