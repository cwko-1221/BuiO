// Imported from ONE built-in ImageGen cel style-kit. Fixed isotropic framing.
import { CEL_FOREST_MATERIAL_URLS } from './worldCelMaterials.mjs';
export const CEL_FOREST_PROP_SPECS={
  "cel_oak_a": {
    "src": "/pokemon-rpg/assets/overhaul/world/cel-forest-cel_oak_a-v1.webp",
    "w": 321.328125,
    "h": 315,
    "anchorX": 0.5010940919037199,
    "anchorY": 0.9508928571428571
  },
  "cel_oak_b": {
    "src": "/pokemon-rpg/assets/overhaul/world/cel-forest-cel_oak_b-v1.webp",
    "w": 300.5882352941176,
    "h": 315,
    "anchorX": 0.4817351598173516,
    "anchorY": 0.9564270152505446
  },
  "cel_sign": {
    "src": "/pokemon-rpg/assets/overhaul/world/cel-forest-cel_sign-v1.webp",
    "w": 92.12885154061625,
    "h": 110,
    "anchorX": 0.4882943143812709,
    "anchorY": 0.9523809523809523
  },
  "cel_stones": {
    "src": "/pokemon-rpg/assets/overhaul/world/cel-forest-cel_stones-v1.webp",
    "w": 63.02439024390244,
    "h": 40,
    "anchorX": 0.4953560371517028,
    "anchorY": 0.9219512195121952
  },
  "short_grass": {
    "src": "/pokemon-rpg/assets/overhaul/world/cel-forest-short_grass-v1.webp",
    "w": 35.630434782608695,
    "h": 22,
    "anchorX": 0.5,
    "anchorY": 0.9456521739130435
  },
  "tiny_flower": {
    "src": "/pokemon-rpg/assets/overhaul/world/cel-forest-tiny_flower-v1.webp",
    "w": 20.087719298245613,
    "h": 20,
    "anchorX": 0.5283842794759825,
    "anchorY": 0.9429824561403509
  }
};
export const CEL_FOREST_ASSET_URLS=[...Object.values(CEL_FOREST_PROP_SPECS).map(s=>s.src),...CEL_FOREST_MATERIAL_URLS];
