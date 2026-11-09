// Bounded built-in ImageGen materials and registered true-alpha bridge layers.
export const CEL_FOREST_MATERIALS={
  "grass": {
    "src": "/pokemon-rpg/assets/overhaul/world/cel-forest-grass-material-v2.webp",
    "logicalPeriodWidth": 512,
    "sourceWidth": 1384,
    "sourceHeight": 1136
  },
  "dirt": {
    "src": "/pokemon-rpg/assets/overhaul/world/cel-forest-dirt-material-v2.webp",
    "logicalPeriodWidth": 512,
    "sourceWidth": 1388,
    "sourceHeight": 1133
  }
};
export const CEL_FOREST_BRIDGE_ART={
  "deck": {
    "src": "/pokemon-rpg/assets/overhaul/world/cel-forest-bridge-deck-v2.webp",
    "sourceWidth": 480,
    "sourceHeight": 266,
    "left": 16,
    "top": 20,
    "width": 448,
    "height": 190
  },
  "back": {
    "src": "/pokemon-rpg/assets/overhaul/world/cel-forest-bridge-back-v2.webp",
    "sourceWidth": 512,
    "sourceHeight": 140,
    "left": 32,
    "right": 480,
    "footY": 115
  },
  "front": {
    "src": "/pokemon-rpg/assets/overhaul/world/cel-forest-bridge-front-v2.webp",
    "sourceWidth": 512,
    "sourceHeight": 140,
    "left": 32,
    "right": 480,
    "footY": 115
  }
};
export const CEL_FOREST_MATERIAL_URLS=[...Object.values(CEL_FOREST_MATERIALS),...Object.values(CEL_FOREST_BRIDGE_ART)].map(s=>s.src);
