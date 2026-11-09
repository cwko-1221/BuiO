import {
  MAP_ZONES,
  ZONES,
  getMap,
  getZoneAt,
  getGroundElevation,
  getPortalAt,
  getTallGrassAt,
  isPositionWalkable,
} from '../data/world.mjs';
import { NPCS, TRAINER_AVATARS } from '../data/trainers.mjs';
import { POKEMON_SPECIES } from '../data/pokemon.mjs';
import { ELEMENT_TYPES } from '../data/types.mjs';
import { WALK_ATLASES, getWalkFrameAtDistance, getPokemonGroundOffset } from '../data/walkAtlases.mjs';
import { CURRENT_TRAINER_DRAFTS, getLocalWalkTrial, getLocalWorldTrial, getLocalPokemonTrial, isLocalArtPreview } from '../data/artTrials.mjs';
import { getSkillArt, getEnabledSkillArt } from '../data/skillArt.mjs';
import { drawAtlasSkillEffect,getChargePresentation } from './atlasSkillEffects.mjs';
import { isCelForestMap,paintCelForestTerrain,getCelForestDrawables } from './worldCelTerrain.mjs';
import { CEL_FOREST_ASSET_URLS } from '../data/worldCelArt.mjs';
import { isPremiumCrossingMap,paintPremiumCrossingTerrain,paintPremiumWaterMotion,getPremiumCrossingDrawables } from './worldPremiumTerrain.mjs';
const reducedMotionQuery=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
import { PREMIUM_ASSET_URLS } from '../data/worldPremiumArt.mjs';
import { BATTLE_SPRITE_GEOMETRY } from '../data/battleSpriteGeometry.mjs';
import {getNpcDrawGeometry} from './actorGeometry.mjs';
import {appendCelTrailMask} from './worldCelTerrain.mjs';
import {getWorldMaterialPattern} from './worldMaterial.mjs';
import {TRAIL_SIGN_ART} from '../data/worldExits.mjs';
import {FIELD_ART,FIELD_MATERIALS,getActiveWorldNpc} from '../data/worldAdventure.mjs';
import {THEME_ATLAS} from '../data/themeAtlas.mjs';
import {LANDMARK_ATLAS} from '../data/landmarkAtlas.mjs';
import {paintFieldSurfaces,getFieldDrawables} from './worldFieldArt.mjs';

const TYPE_INFO = ELEMENT_TYPES;

const DIR_POKEMON_SPECIES = new Set(Object.keys(POKEMON_SPECIES));
const DIR_TRAINER_AVATARS = new Set(['blaze', 'azure', 'emerald', 'violet']);
const AI_WALK_ATLAS_TRAINERS = new Set(['blaze', 'azure', 'emerald', 'violet']);
const AI_WALK_ATLAS_POKEMON = new Set([]);
const WALK_DIR_ROW = { down: 0, up: 1, left: 2, right: 3 };
const WALK_ATLAS_FRAMES = 4;
const FOLLOWER_START_DISTANCE = 2.65;
const FOLLOWER_SPACING = 1.8;
function followerBodyScale(speciesId) {
  const height=POKEMON_SPECIES[speciesId]?.heightScale || 1;
  return clamp(height*(height>=1.3 ? 1.15 : 1)*(speciesId==='venusaur' ? 1.24 : 1),.82,2.15);
}

const UNIT_X = 58;
const UNIT_Z = 48;
const CHUNK_SIZE = 512;
const TERRAIN_CACHE_BYTES = 128 * 1024 * 1024;

// Critic accepted this material for in-engine trials. Map approval is separate.
const TERRAIN_ART = {
  terrain_grass_draft_v5: {src:'/pokemon-rpg/assets/overhaul/world/meadow-grass-v5-candidate.webp',repeat:1200,color:'#8da06c',patchSize:500},
  terrain_forest_mosswood: {src:'/pokemon-rpg/assets/overhaul/world/forest-floor-v4.webp',repeat:520,color:'#849b58',patchSize:700},
  terrain_forest_trail: {src:'/pokemon-rpg/assets/overhaul/world/mosswood-trail-material-v1.webp',repeat:450,color:'#bbaa7d',patchSize:220},
  terrain_grass_meadow: { src: '/pokemon-rpg/assets/overhaul/world/meadow-turf-v4.webp', repeat: 460, color:'#849b58', patchSize:700 },
  terrain_grass_floral: { src: '/pokemon-rpg/assets/overhaul/world/meadow-turf-v4.webp', repeat: 460, color:'#849b58', patchSize:700 },
  terrain_stone_plaza: { src: '/pokemon-rpg/assets/overhaul/world/paving-v1.webp', repeat: 140, color:'#bcb29b' },
  terrain_dirt_path: { src: '/pokemon-rpg/assets/overhaul/world/dirt-v1.webp', repeat: 240, color:'#b7a182' },
  terrain_sand_coast: { src: '/pokemon-rpg/assets/overhaul/world/coast-sand-v2.webp', repeat: 620, color:'#eed1a4', patchSize:1200, rotate:false },
  terrain_water_ocean: { src: '/pokemon-rpg/assets/overhaul/world/ocean-v1.webp', repeat: 620, color:'#259eac' },
  terrain_water_coast: { src: '/pokemon-rpg/assets/overhaul/world/coast-water-v2.webp', repeat: 620, color:'#169fa9', patchSize:1280, rotate:false },
  terrain_rock_canyon: { src: '/pokemon-rpg/assets/overhaul/world/canyon-ground-v1.webp', repeat: 620, color:'#925739', patchSize:280 },
  terrain_stone_twilight: { src: '/pokemon-rpg/assets/overhaul/world/twilight-ground-v1.webp', repeat: 620, color:'#4f5f70', patchSize:320 },
  terrain_lava: { src: '/pokemon-rpg/assets/overhaul/world/lava-v1.webp', repeat: 620, color:'#703b25' },
  terrain_astral_water: { src: '/pokemon-rpg/assets/overhaul/world/astral-water-v1.webp', repeat: 620, color:'#1d355b' },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashNoise(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function worldToPx(wx, wz) {
  return {
    x: wx * UNIT_X,
    y: wz * UNIT_Z,
  };
}

function drawContactShadow(ctx, x, y, rx, ry, opacity = .22) {
  ctx.save();ctx.translate(x,y);ctx.scale(1,ry/rx);
  const shade=ctx.createRadialGradient(0,0,rx*.1,0,0,rx);
  shade.addColorStop(0,`rgba(20,29,27,${opacity})`);
  shade.addColorStop(.55,`rgba(20,29,27,${opacity*.6})`);
  shade.addColorStop(1,'rgba(20,29,27,0)');
  ctx.fillStyle=shade;ctx.fillRect(-rx,-rx,rx*2,rx*2);ctx.restore();
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const lenSq = vx * vx + vz * vz;
  if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / lenSq, 0, 1);
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

// 100% uncut 2.5D landmark buildings with intact entrance doors and foundations
const BUILDING_ASSET_MAP = {
  lab: {
    src: '/pokemon-rpg/assets/overhaul/world/lab-v1.webp',
    drawW: 420,
    drawH: 280,
    anchorY: 0.95,
  },
  hospital: {
    src: '/pokemon-rpg/assets/overhaul/world/hospital-v1.webp',
    drawW: 560,
    drawH: 560*1024/1536,
    anchorY: 0.95,
  },
  shop: {
    src: '/pokemon-rpg/assets/overhaul/world/shop-v1.webp',
    drawW: 450,
    drawH: 450*1145/1374,
    anchorY: 0.94,
  },
  fountain: {
    src: '/pokemon-rpg/assets/overhaul/world/fountain-v1.webp',
    drawW: 250,
    drawH: 250*1024/1536,
    anchorY: 0.72,
  },
  verdant_shrine: {
    src: '/pokemon-rpg/assets/overhaul/world/shrine-v1.webp',
    drawW: 370,
    drawH: 370*1190/1322,
    anchorY: 0.96,
  },
  shrine_grass: {
    src: '/pokemon-rpg/assets/overhaul/world/shrine-v1.webp',
    drawW: 370,
    drawH: 370*1190/1322,
    anchorY: 0.96,
  },
  tidal_lighthouse: {
    src: '/pokemon-rpg/assets/overhaul/world/lighthouse-v1-padded.webp',
    drawW: 420,
    drawH: 420*1263/1376,
    anchorX: .387, anchorY: 0.942,
  },
  lighthouse: {
    src: '/pokemon-rpg/assets/overhaul/world/lighthouse-v1-padded.webp',
    drawW: 420,
    drawH: 420*1263/1376,
    anchorX: .387, anchorY: 0.942,
  },
  blaze_dojo: {
    src: '/pokemon-rpg/assets/overhaul/world/dojo-v1.webp',
    drawW: 480,
    drawH: 320,
    anchorY: 0.93,
  },
  dojo_fire: {
    src: '/pokemon-rpg/assets/overhaul/world/dojo-v1.webp',
    drawW: 480,
    drawH: 320,
    anchorY: 0.93,
  },
  starlight_altar: {
    src: '/pokemon-rpg/assets/overhaul/world/altar-v1.webp',
    drawW: 450,
    drawH: 450*1110/1417,
    anchorY: 0.98,
  },
  altar: {
    src: '/pokemon-rpg/assets/overhaul/world/altar-v1.webp',
    drawW: 450,
    drawH: 450*1110/1417,
    anchorY: 0.98,
  },
};

const PROP_SPECS = {
  trail_sign:{src:TRAIL_SIGN_ART,w:53,h:92,anchorY:1,shadowRx:.15,shadowRy:.03,sway:0},
  mosswood_log:{src:'/pokemon-rpg/assets/overhaul/world/mosswood-log-v1-candidate.webp',w:200,h:200*1169/1772,anchorY:.94,shadowRx:.35,shadowRy:.05,sway:0},
  canyon_cliff: {src:'/pokemon-rpg/assets/overhaul/world/canyon-cliff-v1.webp',w:680,h:340,anchorY:.985,sortOffsetZ:-1.9,shadowRx:.42,shadowRy:.035,sway:0},
  shore_rocks: {src:'/pokemon-rpg/assets/overhaul/world/shore-rocks-v1.webp',w:220,h:220*1024/1536,anchorY:.94,shadowRx:.36,shadowRy:.045,sway:0},
  woodland_shrubs: {src:'/pokemon-rpg/assets/overhaul/world/woodland-shrubs-v1.webp',w:160,h:160*1024/1536,anchorY:.9,shadowRx:.25,shadowRy:.025,sway:.004},
  woodland_ruin: {src:'/pokemon-rpg/assets/overhaul/world/woodland-ruin-v1.webp',w:360,h:360*1199/1312,anchorX:.52,anchorY:.94,shadowRx:.31,shadowRy:.035,sway:0},
  tree_oak: { src: '/pokemon-rpg/assets/overhaul/world/oak-v1.webp', w: 270, h: 235, anchorY: 0.93, sway: 0.006 },
  tree_pine: { src: '/pokemon-rpg/assets/overhaul/world/juniper-v1.webp', w: 235*1349/1166, h: 235, anchorX:.54, anchorY: .90, shadowRx:.26, shadowRy:.07, sway: .006 },
  tree_palm: { src: '/pokemon-rpg/assets/overhaul/world/palm-v1.webp', w: 310*1024/1536, h: 310, anchorX:.70, anchorY: .90, shadowRx:.18, shadowRy:.045, sway: .009 },
  flower_bed: { src: '/pokemon-rpg/assets/world/prop_flower_bed.webp', w: 120, h: 86, anchorY: 0.85, sway: 0.02 },
  rock_canyon: { src: '/pokemon-rpg/assets/world/prop_rock_canyon.webp', w: 145, h: 125, anchorY: 0.86, sway: 0 },
  crystal_twilight: { src: '/pokemon-rpg/assets/overhaul/world/crystal-v1.webp', w: 180*1312/1199, h: 180, anchorY: .90, shadowRx:.28, shadowRy:.08, sway: 0 },
  lamppost: { src: '/pokemon-rpg/assets/world/prop_lamppost.webp', w: 96, h: 168, anchorY: 0.92, sway: 0 },
  tall_grass: { src: '/pokemon-rpg/assets/overhaul/world/tall-grass-v1.webp', w: 112, h: 75, anchorY: 0.87, sway: 0.035 },
  tall_grass_canyon: { src: '/pokemon-rpg/assets/overhaul/world/ash-grass-v1.webp', w: 112, h: 75, anchorY: .90, sway: .028 },
  tall_grass_twilight: { src: '/pokemon-rpg/assets/overhaul/world/moon-reeds-v1.webp', w: 112, h: 75, anchorY: .90, sway: .028 },
  tall_grass_exotic: { src: '/pokemon-rpg/assets/world/prop_tall_grass_exotic.webp', w: 84, h: 76, anchorY: 0.86, sway: 0.06 },
};

function drawRoundedPill(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function drawLightningBolt(ctx, x1, y1, x2, y2, displace, depth = 5) {
  if (depth <= 0) {
    ctx.lineTo(x2, y2);
    return;
  }
  const midX = (x1 + x2) * 0.5 + (Math.random() - 0.5) * displace;
  const midY = (y1 + y2) * 0.5 + (Math.random() - 0.5) * displace;
  drawLightningBolt(ctx, x1, y1, midX, midY, displace * 0.52, depth - 1);
  drawLightningBolt(ctx, midX, midY, x2, y2, displace * 0.52, depth - 1);
}

function drawEmoteBubble(ctx, x, y, symbol, alpha = 1) {
  if (alpha <= 0.05) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x - 3, y + 10);
  ctx.lineTo(x - 6, y + 15);
  ctx.lineTo(x + 2, y + 11);
  ctx.closePath();
  ctx.fill();

  ctx.font = '13px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, x, y + 0.5);
  ctx.restore();
}

/**
 * Precompute swaying tall grass tufts for each zone's patches.
 */
function buildZoneGrassTufts(zoneId) {
  const map = getMap(zoneId);
  if (!map || !map.tallGrass) return [];
  const tufts = [];
  const kind=zoneId==='canyon' ? 'tall_grass_canyon' : zoneId==='twilight' ? 'tall_grass_twilight' : 'tall_grass';
  const zoneSeed=[...zoneId].reduce((n,c)=>n+c.charCodeAt(0)*97,7777);
  map.tallGrass.forEach((patch, pIdx) => {
    const rng = mulberry32(zoneSeed + pIdx * 211);
    const area = patch.rx * patch.rz;
    const count = clamp(Math.round(area * .95), 9, 18);
    for (let k = 0; k < count; k++) {
      const r = Math.sqrt((k + 0.35 + rng() * 0.55) / count) * 0.92;
      const theta = k * 2.39996 + rng() * 0.45;
      const gx = patch.x + Math.cos(theta) * patch.rx * r;
      const gz = patch.z + Math.sin(theta) * patch.rz * r;
      if(!getTallGrassAt(gx,gz,zoneId)) continue;
      tufts.push({
        kind,
        x: gx,
        z: gz,
        scale: .62 + rng() * .50,
        seed: pIdx * 17 + k * 2.3,
        flip: k % 2 === 0,
      });
    }
  });
  return tufts;
}

/**
 * Studio 2.5D Cross Gate Style Discrete Multi-Zone Open World & Wide Panoramic Battle Renderer.
 * Built exclusively around genuine bespoke generated terrain textures, uncut landmark buildings,
 * 2.5D foliage/scenery props, 4-directional character & Pokémon sprites, and bespoke skill battle sprites.
 */
export class World25DRenderer {
  constructor(container) {
    this.container = container;
    this.mode = 'world';
    this.disposed = false;

    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.ctx = this.canvas.getContext('2d', { alpha: false });

    container.innerHTML = '';
    container.appendChild(this.canvas);

    const isTouch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
    this.dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.35 : 1.5);
    this.viewW = 1280;
    this.viewH = 720;
    this.zoom = 1;
    this._dirtyMetrics = true;
    this._cachedVig = null;
    this._vigKey = null;

    this.images = new Map();
    this.terrainPatternTiles = new Map();
    this.activeZoneId = 'dawnleaf';
    this.terrainVersion = 0;
    this.bakedTerrainVersion = -1;
    this.terrainChunks = new Map();
    this.terrainChunkBytes = 0;
    this.zoneGrassCache = new Map();

    // Camera state in world pixels
    this.camPx = { x: 0, y: 4.5 * UNIT_Z };
    this.camInitialized = false;

    // Trainer & Followers state
    this.avatarId = 'blaze';
    this.followers = [];
    this.trail = [];
    this.walkPhase = 0;
    this.walkDistance = 0;
    this.artWalkTrial = getLocalWalkTrial();
    this.currentArtPreview = isLocalArtPreview();
    this.worldArtTrial = getLocalWorldTrial();
    this.artPokemonTrial = getLocalPokemonTrial();
    this.lastPlayerPos = null;
    this.lastTime = performance.now();

    // Zone announcement banner & transition fade
    this.zoneBanner = null;
    this.zoneFadeAlpha = 0;

    // Battle state & VFX
    this.battleState = {
      backdrop: 'meadow',
      playerMon: null,
      enemyMon: null,
      enemyCaptureScale: 1,
      playerLunge: 0,
      enemyLunge: 0,
      playerHitFlash: 0,
      enemyHitFlash: 0,
      screenShake: 0,
      vfxList: [],
      damageNumbers: [],
      skillBanner: null,
      screenFlash: null,
      hitFreeze: 0,
      ambientMotes: [],
      captureAnim: null,
      presentationEvents: [],
      fainting: {},
      visualWaiters: [],
    };

    this._preloadCoreArt();

    this._onResize = () => {
      this._dirtyMetrics = true;
      this.resize();
      setTimeout(() => { this._dirtyMetrics = true; this.resize(); }, 60);
      setTimeout(() => { this._dirtyMetrics = true; this.resize(); }, 220);
    };
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    window.addEventListener('load', this._onResize);
    window.visualViewport?.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        this._dirtyMetrics = true;
        this.resize();
      });
      this._resizeObserver.observe(this.container);
    }
    this.resize();

    this.triggerZoneBanner('dawnleaf');
  }

  _preloadCoreArt() {
    for(const src of [...Object.values(FIELD_ART).map(a=>a.src),...Object.values(FIELD_MATERIALS)])this.getImg(src,true);
    for(const list of [...Object.values(THEME_ATLAS),...Object.values(LANDMARK_ATLAS)])for(const item of list)if(item?.src)this.getImg(item.src);
    for (const art of Object.values(getEnabledSkillArt())) this.getImg(art.src);
    for(const map of Object.values(MAP_ZONES)) {
      for(const patch of map.groundPaintings || [])this.getImg(patch.src,true);
      for(const region of map.terrainRegions || [])if(region.floorPatch)this.getImg(region.floorPatch.src,true);
    }
    this.getImg(TRAIL_SIGN_ART);
    for(const map of Object.values(MAP_ZONES))if(isPremiumCrossingMap(map))for(const src of PREMIUM_ASSET_URLS)this.getImg(src,true);
    if(this.worldArtTrial) {
      this.getImg(this.worldArtTrial.portalSrc);
      this.getImg(this.worldArtTrial.floor?.src,true);
      if(this.worldArtTrial.id==='cel-forest-v1')for(const src of CEL_FOREST_ASSET_URLS)this.getImg(src,true);
      if(this.worldArtTrial.id==='premium-crossing-v1')for(const src of PREMIUM_ASSET_URLS)this.getImg(src,true);
    }
    const terrainKeys = [
      'grass_meadow',
      'grass_floral',
      'stone_plaza',
      'dirt_path',
      'sand_coast',
      'water_ocean',
      'water_coast',
      'rock_canyon',
      'stone_twilight',
    ];
    for (const k of terrainKeys) {
      this.getImg(TERRAIN_ART[`terrain_${k}`]?.src || `/pokemon-rpg/assets/world/terrain_${k}.webp`, true);
    }
    this.getImg(BUILDING_ASSET_MAP.fountain.src);
    for (const b of Object.values(BUILDING_ASSET_MAP)) {
      this.getImg(b.src);
    }
    for (const p of Object.values(PROP_SPECS)) {
      this.getImg(p.src);
    }
    for (const av of TRAINER_AVATARS) {
      this.getImg(av.sprite);
    }
    for (const npc of NPCS) {
      this.getImg(npc.sprite);
    }
    // 4-Directional Sprites (& AI Walk Atlases when ready) for all 4 trainer avatars
    for (const av of ['blaze', 'azure', 'emerald', 'violet']) {
      const draft=this.currentArtPreview ? CURRENT_TRAINER_DRAFTS[av] : this.artWalkTrial?.avatarId===av ? this.artWalkTrial : null;
      if(draft) {
        this.getImg(draft.src);
        if(draft.idleSrc)this.getImg(draft.idleSrc);
        continue;
      }
      if (WALK_ATLASES.trainers[av]) {
        const accepted=WALK_ATLASES.trainers[av];
        this.getImg(accepted.src);
        if(accepted.idleSrc)this.getImg(accepted.idleSrc);
        continue;
      }
      if (AI_WALK_ATLAS_TRAINERS.has(av)) {
        this.getImg(`/pokemon-rpg/assets/sprites/trainers/${av}_walk.webp`);
      }
      for (const d of ['down', 'up', 'left', 'right']) {
        this.getImg(`/pokemon-rpg/assets/sprites/trainers/${av}_${d}.webp`);
      }
    }
    // 4-Directional Sprites (& AI Walk Atlases when ready) for starter Pokémon
    for (const p of ['pikachu', 'charmander', 'eevee', 'bulbasaur', 'squirtle']) {
      if(this.artPokemonTrial?.speciesId===p) {this.getImg(this.artPokemonTrial.src);continue;}
      if (WALK_ATLASES.pokemon[p]) this.getImg(WALK_ATLASES.pokemon[p].src);
      if (AI_WALK_ATLAS_POKEMON.has(p)) {
        this.getImg(`/pokemon-rpg/assets/sprites/pokemon/${p}_walk.webp`);
      }
      for (const d of ['down', 'up', 'left', 'right']) {
        this.getImg(`/pokemon-rpg/assets/sprites/pokemon/${p}_${d}.webp`);
      }
    }
    // Bespoke Battle Skill Sprites
    for (const sk of [
      'skill_fireball',
      'skill_fire_burst',
      'skill_water_pulse',
      'skill_water_vortex',
      'skill_leaf_cutter',
      'skill_thunderbolt',
      'skill_crescent_slash',
      'skill_shadow_sphere',
    ]) {
      this.getImg(`/pokemon-rpg/assets/skills/${sk}.webp`);
    }
    // Arena backdrops
    for (const bg of ['meadow', 'coast', 'canyon', 'twilight']) {
      this.getImg(`/pokemon-rpg/assets/backdrops/${bg}.webp`);
    }
  }

  getImg(url, invalidatesTerrain = false) {
    if (!url) return null;
    if (this.images.has(url)) return this.images.get(url);
    const entry = { img: new Image(), ready: false, failed: false };
    entry.img.decoding = 'async';
    entry.img.onload = () => {
      entry.ready = entry.img.naturalWidth > 0;
      if (invalidatesTerrain) {
        this.terrainVersion += 1;
      }
    };
    entry.img.onerror = () => {
      entry.failed = true;
    };
    entry.img.src = url;
    this.images.set(url, entry);
    return entry;
  }

  setActiveZone(zoneId) {
    if (!zoneId || this.activeZoneId === zoneId) return;
    this.activeZoneId = zoneId;
    this.terrainChunks.clear();
    this.terrainChunkBytes = 0;
    this.triggerZoneBanner(zoneId);
  }

  triggerZoneBanner(zoneId) {
    const map = getMap(zoneId);
    if (!map) return;
    this.zoneBanner = {
      nameZh: map.nameZh,
      nameEn: map.nameEn,
      subtitleZh: map.subtitleZh,
      levelRange: map.levelRange,
      color: map.skyColor || '#38bdf8',
      elapsed: 0,
      duration: 3.2,
    };
  }

  _measureViewport() {
    const vv = window.visualViewport;
    const cw = this.container?.clientWidth || 0;
    const ch = this.container?.clientHeight || 0;
    const winW = vv?.width || window.innerWidth || 1280;
    const winH = vv?.height || window.innerHeight || 720;
    // Guard against unstyled container before CSS loads (where canvas intrinsic height is 150px)
    const rawW = cw >= 200 ? cw : winW;
    const rawH = ch >= 220 && ch >= winH * 0.5 ? ch : winH;
    const isTouch = typeof navigator !== 'undefined' && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
    const maxDpr = isTouch ? 1.35 : 1.5;
    return {
      w: Math.max(320, Math.round(rawW)),
      h: Math.max(240, Math.round(rawH)),
      dpr: Math.min(window.devicePixelRatio || 1, maxDpr),
    };
  }

  _syncCanvasMetrics() {
    if (this.disposed) return false;
    // High-performance fast path: skip measuring when geometry is unchanged
    const cw = this.container?.clientWidth;
    const ch = this.container?.clientHeight;
    if (!this._dirtyMetrics && cw === this.viewW && ch === this.viewH) {
      return false;
    }
    this._dirtyMetrics = false;
    const { w, h, dpr } = this._measureViewport();
    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);
    if (
      this.viewW !== w ||
      this.viewH !== h ||
      this.dpr !== dpr ||
      this.canvas.width !== targetW ||
      this.canvas.height !== targetH
    ) {
      this.resize();
      return true;
    }
    return false;
  }

  resize() {
    if (this.disposed) return;
    this._dirtyMetrics = false;
    const { w, h, dpr } = this._measureViewport();
    this.dpr = dpr;
    this.viewW = w;
    this.viewH = h;
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    this.canvas.style.width = `${this.viewW}px`;
    this.canvas.style.height = `${this.viewH}px`;
    const minZoom = this.worldArtTrial?.id === 'premium-crossing-v1' ? .95 : .78;
    this.zoom = clamp(Math.max(this.viewW, this.viewH) / 1360, minZoom, 1.08);
    this._cachedVig = null;
    this._vigKey = null;
  }

  screenToWorld(localX, localY) {
    const map = getMap(this.activeZoneId);
    const b = map.bounds;
    const worldPxX = this.camPx.x + (localX - this.viewW * 0.5) / this.zoom;
    const worldPxY = this.camPx.y + (localY - this.viewH * 0.54) / this.zoom;
    return {
      x: clamp(worldPxX / UNIT_X, b.minX + 1.2, b.maxX - 1.2),
      z: clamp(worldPxY / UNIT_Z, b.minZ + 1.2, b.maxZ - 1.2),
    };
  }

  setTrainerAvatar(avatarId) {
    this.avatarId = avatarId || 'blaze';
    const draft=this.currentArtPreview ? CURRENT_TRAINER_DRAFTS[this.avatarId] : this.artWalkTrial?.avatarId===this.avatarId ? this.artWalkTrial : null;
    if(draft) {
      this.getImg(draft.src);
      if(draft.idleSrc)this.getImg(draft.idleSrc);
      return;
    }
    this.getImg(`/pokemon-rpg/assets/trainers/${this.avatarId}.webp`);
    if (AI_WALK_ATLAS_TRAINERS.has(this.avatarId)) {
      this.getImg(`/pokemon-rpg/assets/sprites/trainers/${this.avatarId}_walk.webp`);
    }
    for (const d of ['down', 'up', 'left', 'right']) {
      this.getImg(`/pokemon-rpg/assets/sprites/trainers/${this.avatarId}_${d}.webp`);
    }
  }

  syncFollowers(followerMons = []) {
    this.followers = followerMons.slice(0, 3);
    for (const mon of this.followers) {
      if (mon?.speciesId) {
        if(this.artPokemonTrial?.speciesId===mon.speciesId) {this.getImg(this.artPokemonTrial.src);continue;}
        this.getImg(`/pokemon-rpg/assets/pokemon/${mon.speciesId}.webp`);
        if (WALK_ATLASES.pokemon[mon.speciesId]) {
          this.getImg(WALK_ATLASES.pokemon[mon.speciesId].src);
        }
        if (AI_WALK_ATLAS_POKEMON.has(mon.speciesId)) {
          this.getImg(`/pokemon-rpg/assets/sprites/pokemon/${mon.speciesId}_walk.webp`);
        }
        if (DIR_POKEMON_SPECIES.has(mon.speciesId)) {
          for (const d of ['down', 'up', 'left', 'right']) {
            this.getImg(`/pokemon-rpg/assets/sprites/pokemon/${mon.speciesId}_${d}.webp`);
          }
        }
      }
    }
  }

  resetTrailAt(x, z, facing='down') {
    this.walkDistance = 0;
    this.trail = [];
    const forward={down:[0,1],up:[0,-1],left:[-1,0],right:[1,0]}[facing] || [0,1];
    let backward={x:-forward[0],z:-forward[1]};
    // A newly loaded party has no travelled history. On a diagonal bridge,
    // seed that history along the deck rather than through a rail or river.
    for(const bridge of getMap(this.activeZoneId).bridges || []) {
      if(!bridge.centerline || !bridge.outline)continue;
      let inside=false;
      const points=bridge.outline;
      for(let i=0,j=points.length-1;i<points.length;j=i++){
        const a=points[i],b=points[j];
        if((a.z>z)!==(b.z>z) && x<(b.x-a.x)*(z-a.z)/(b.z-a.z)+a.x)inside=!inside;
      }
      if(!inside)continue;
      const [a,b]=bridge.centerline,dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      if(len>0){const sign=dx*backward.x+dz*backward.z>=0?1:-1;backward={x:dx/len*sign,z:dz/len*sign};}
      break;
    }
    let tail={x,z};
    for (let i = 0; i <= 90; i++) {
      if(i){const next={x:tail.x+backward.x*.14,z:tail.z+backward.z*.14};if(isPositionWalkable(next.x,next.z,this.activeZoneId))tail=next;}
      this.trail.push({...tail,facing});
    }
    const px = worldToPx(x, z);
    this.camPx.x = px.x;
    this.camPx.y = px.y - 26;
    this.camInitialized = true;
    this.lastPlayerPos = { x, z };
  }

  _sampleTrailAtDistance(targetDist, fallbackPos) {
    if (!this.trail.length) return { ...fallbackPos, facing: 'down' };
    let acc = 0;
    // The newest breadcrumb is only recorded after a minimum movement. Include
    // the current player position as a temporary head, so the distance along
    // the trail advances smoothly between breadcrumb insertions.
    for (let i = 0; i < this.trail.length; i++) {
      const a = i === 0 ? fallbackPos : this.trail[i - 1];
      const b = this.trail[i];
      const seg = Math.hypot(a.x - b.x, a.z - b.z);
      if (acc + seg >= targetDist && seg > 1e-4) {
        const t = (targetDist - acc) / seg;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        const facing = Math.abs(dx) > Math.abs(dz) * 0.55 ? (dx < 0 ? 'left' : 'right') : dz < 0 ? 'up' : 'down';
        // A short chord around a corner must not place a follower in a solid
        // rail even when both recorded endpoints were valid walking positions.
        return isPositionWalkable(x,z,this.activeZoneId) ? {x,z,facing} : {x:a.x,z:a.z,facing};
      }
      acc += seg;
    }
    const tail = this.trail[this.trail.length - 1];
    return { x: tail.x, z: tail.z, facing: tail.facing || 'down' };
  }

  _followerTrailDistance(index) {
    let distance=FOLLOWER_START_DISTANCE;
    for(let i=1;i<=index;i++) {
      const previous=followerBodyScale(this.followers[i-1]?.speciesId);
      const current=followerBodyScale(this.followers[i]?.speciesId);
      distance+=FOLLOWER_SPACING+Math.max(0,Math.max(previous,current)-1)*1.1;
    }
    return distance;
  }

  _createPattern(c, texName, repeatWorldPx = 420, fallbackColor = '#5b9e54') {
    const art = TERRAIN_ART[texName];
    const src = art?.src || `/pokemon-rpg/assets/world/${texName}.webp`;
    const entry = this.getImg(src, true);
    if (entry && entry.ready) {
      let tile = entry.img;
      if (art) {
        // Periodic feathered patches preserve continuity without reflected
        // stone shapes or kaleidoscope axes. Source artwork stays untouched.
        if (!this.terrainPatternTiles.has(src)) {
          const surface = document.createElement('canvas');
          const period=1536,spacing=256,size=768;
          surface.width = period; surface.height = period;
          const tc = surface.getContext('2d');
          tc.fillStyle=art.color;tc.fillRect(0,0,period,period);
          const patches=this._getMaterialPatches(src);
          for(let row=0;row<6;row++) for(let col=0;col<6;col++) {
            const variant=Math.floor(hashNoise(col*41.7+row*193.4)*4);
            const rotation=Math.floor(hashNoise(col*72.3-row*61.9)*4)*Math.PI/2;
            for(const dx of [-period,0,period]) for(const dy of [-period,0,period]) {
              const x=col*spacing+dx,y=row*spacing+dy;
              if(x+size/2<0 || x-size/2>period || y+size/2<0 || y-size/2>period) continue;
              tc.save();tc.translate(x,y);tc.rotate(rotation);
              tc.drawImage(patches[variant],-size/2,-size/2,size,size);tc.restore();
            }
          }
          this.terrainPatternTiles.set(src, surface);
        }
        tile = this.terrainPatternTiles.get(src);
      }
      const pat = c.createPattern(tile, 'repeat');
      if (pat && typeof DOMMatrix !== 'undefined') {
        const scale = art ? art.repeat / 512 : repeatWorldPx / entry.img.naturalWidth;
        pat.setTransform(new DOMMatrix().scale(scale));
      }
      return pat || fallbackColor;
    }
    return fallbackColor;
  }

  _getTerrainChunk(cx, cy, zoneId) {
    if (this.bakedTerrainVersion !== this.terrainVersion) {
      this.terrainChunks.clear();
      this.terrainChunkBytes = 0;
      this.bakedTerrainVersion = this.terrainVersion;
    }
    // Bake at display density, then draw into the same logical footprint.
    // A CSS-sized cache throws away detail before the main DPR canvas sees it.
    // Resolution is part of the key so resize/monitor changes cannot reuse a
    // low-density chunk. It does not recover missing detail in source artwork.
    const backingSize = Math.ceil(CHUNK_SIZE * Math.max(1, this.dpr * this.zoom));
    const key = `${zoneId}:${cx}:${cy}:${backingSize}`;
    if (!this.terrainChunks.size) this.terrainChunkBytes = 0;
    if (this.terrainChunks.has(key)) {
      const cached = this.terrainChunks.get(key);
      this.terrainChunks.delete(key);
      this.terrainChunks.set(key, cached);
      return cached;
    }

    const map = getMap(zoneId);
    const chunkX = cx * CHUNK_SIZE;
    const chunkY = cy * CHUNK_SIZE;
    const off = document.createElement('canvas');
    off.width = backingSize;
    off.height = backingSize;
    const c = off.getContext('2d');
    c.scale(backingSize / CHUNK_SIZE, backingSize / CHUNK_SIZE);

    // 1. Base terrain material for this discrete zone
    c.save();
    c.translate(-chunkX, -chunkY);
    if(isPremiumCrossingMap(map)) {
      paintPremiumCrossingTerrain(c,{map,chunkX,chunkY,unitX:UNIT_X,unitZ:UNIT_Z,getImage:src=>this.getImg(src,true)});
    } else if(isCelForestMap(map)) {
      paintCelForestTerrain(c,{map,chunkX,chunkY,unitX:UNIT_X,unitZ:UNIT_Z,getImage:src=>this.getImg(src,true)});
    } else {
    const baseTex = (this.worldArtTrial?.zone===zoneId && this.worldArtTrial.baseMaterial) || map.terrainBase || 'terrain_grass_meadow';
    if (TERRAIN_ART[baseTex]) {
      this._paintGroundMaterial(c, chunkX, chunkY,TERRAIN_ART[baseTex]);
    } else {
      c.fillStyle = this._createPattern(c, baseTex, 440, '#5ea152');
      c.fillRect(chunkX, chunkY, CHUNK_SIZE, CHUNK_SIZE);
    }

    for (const region of map.terrainRegions || []) {
      const art=TERRAIN_ART[region.material];
      if (!art) continue;
      const points=region.outline.map(p=>worldToPx(p.x,p.z));
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
      if(Math.max(...xs)+52<chunkX || Math.min(...xs)-52>chunkX+CHUNK_SIZE ||
        Math.max(...ys)+52<chunkY || Math.min(...ys)-52>chunkY+CHUNK_SIZE) continue;
      c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();
      c.save();c.clip();this._paintGroundMaterial(c,chunkX,chunkY,art);c.restore();
      this._paintShoreline(c,points,zoneId,chunkX,chunkY);
    }

    // Authored ground paintings use their imported physical shore. Objects,
    // paths, encounters and portals remain independent interactive layers.
    for(const region of map.terrainRegions || [])if(region.floorPatch) {
      this._paintFloorPatch(c,region.floorPatch,chunkX,chunkY);
    }

    // 2. Plaza paving (if present in this map, e.g. Dawnleaf Town central plaza)
    if (map.plazaBase) {
      const plazaPat = this._createPattern(c, map.plazaBase, 340, '#d8caa8');
      const cp = worldToPx(0, 1.5);
      c.beginPath();
      c.ellipse(cp.x, cp.y, 7 * UNIT_X, 4.4 * UNIT_Z, 0, 0, Math.PI * 2);
      c.fillStyle = plazaPat;
      c.fill();
    }

    paintFieldSurfaces(c,{map,chunkX,chunkY,getImage:src=>this.getImg(src,true),layer:'under'});
    // 3. Roads / Trails for this zone
    if(map.modularTerrain)this._paintModularTrails(c,map,chunkX,chunkY);
    if(!map.modularTerrain && !map.authoredFloor && zoneId==='mosswood')this._paintForestTrails(c,map,chunkX,chunkY);
    if (!map.modularTerrain && !map.authoredFloor && zoneId!=='mosswood' && map.roads && map.roads.length > 0) {
      c.lineCap = 'round';
      c.lineJoin = 'round';
      const stonePat = this._createPattern(c, 'terrain_stone_plaza', 320, '#d8caa8');
      const dirtPat = this._createPattern(c, 'terrain_dirt_path', 360, '#c6a574');

      // Soft road shoulders
      for (const road of map.roads) {
        c.beginPath();
        road.points.forEach((pt, idx) => {
          const p = worldToPx(pt.x, pt.z);
          if (idx === 0) c.moveTo(p.x, p.y);
          else c.lineTo(p.x, p.y);
        });
        c.save();
        c.filter = 'blur(5px)';
        c.strokeStyle = zoneId==='coast'?'rgba(90, 70, 40, 0.035)':'rgba(70, 60, 42, 0.12)';
        c.lineWidth = road.width * UNIT_X + 18;
        c.stroke();
        c.restore();
      }

      // Road fills
      for (const road of map.roads) {
        c.save();
        if(zoneId==='coast')c.globalAlpha=.24;
        c.beginPath();
        road.points.forEach((pt, idx) => {
          const p = worldToPx(pt.x, pt.z);
          if (idx === 0) c.moveTo(p.x, p.y);
          else c.lineTo(p.x, p.y);
        });
        c.strokeStyle = road.material === 'stone' ? stonePat : dirtPat;
        c.save();
        c.filter = 'blur(3px)';
        c.lineWidth = road.width * UNIT_X + 6;
        c.stroke();
        c.restore();
        c.lineWidth = road.width * UNIT_X - 6;
        c.stroke();
        c.restore();
      }
    }
    paintFieldSurfaces(c,{map,chunkX,chunkY,getImage:src=>this.getImg(src,true),layer:'over'});

    // 4. Soft shaded wild tall-grass ground beds
    if (map.tallGrass && map.tallGrass.length > 0) {
      for (const patch of map.tallGrass) {
        const pp = worldToPx(patch.x, patch.z);
        const rx = patch.rx * UNIT_X;
        const rz = patch.rz * UNIT_Z;
        const grad = c.createRadialGradient(pp.x, pp.y, rx * 0.15, pp.x, pp.y, Math.max(rx, rz));
        const color = zoneId==='canyon'?'#695638':zoneId==='twilight'?'#445671':'#405e3d';
        grad.addColorStop(0, `${color}20`);
        grad.addColorStop(1, `${color}00`);
        c.fillStyle = grad;
        c.beginPath();
        c.ellipse(pp.x, pp.y, rx * 1.05, rz * 1.05, 0, 0, Math.PI * 2);
        c.fill();
        if(zoneId==='meadow') {
          const bed=this._getWildGrassBed();
          if(bed) {c.save();c.globalAlpha=.4;c.drawImage(bed,pp.x-rx,pp.y-rz,rx*2,rz*2);c.restore();}
        }
      }
    }

    // 5. Special realm floor engravings (e.g. Twilight Starlight Altar floor emblem)
    if (zoneId === 'twilight') {
      const altarFloor = worldToPx(0, -14.5);
      c.strokeStyle = 'rgba(216, 180, 254, 0.38)';
      c.lineWidth = 2.5;
      c.beginPath();
      c.ellipse(altarFloor.x, altarFloor.y, 160, 100, 0, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.ellipse(altarFloor.x, altarFloor.y, 110, 70, 0, 0, Math.PI * 2);
      c.stroke();
    }

    if(this.worldArtTrial?.zone===zoneId) {
      this._paintFloorPatch(c,this.worldArtTrial.floor,chunkX,chunkY);
    }
    for(const patch of map.groundPaintings || [])this._paintFloorPatch(c,patch,chunkX,chunkY);
    }
    c.restore();

    const bytes = off.width * off.height * 4;
    while (this.terrainChunkBytes + bytes > TERRAIN_CACHE_BYTES && this.terrainChunks.size) {
      const oldest = this.terrainChunks.keys().next().value;
      const evicted = this.terrainChunks.get(oldest);
      this.terrainChunkBytes -= evicted.width * evicted.height * 4;
      this.terrainChunks.delete(oldest);
    }
    this.terrainChunks.set(key, off);
    this.terrainChunkBytes += bytes;
    return off;
  }

  _paintModularTrails(c,map,chunkX,chunkY){
    const bounds={minX:chunkX/UNIT_X,maxX:(chunkX+CHUNK_SIZE)/UNIT_X,minZ:chunkY/UNIT_Z,maxZ:(chunkY+CHUNK_SIZE)/UNIT_Z};
    c.save();
    // Land-only mask keeps paths out of ponds, sea and lava. The same outlines
    // drive walking collision, including bridge holes where present.
    c.beginPath();c.rect(chunkX-1,chunkY-1,CHUNK_SIZE+2,CHUNK_SIZE+2);
    for(const region of map.terrainRegions||[])if(region.blocked){
      for(const outline of [region.outline,...(region.holes||[])]){
        outline.forEach((p,i)=>i?c.lineTo(p.x*UNIT_X,p.z*UNIT_Z):c.moveTo(p.x*UNIT_X,p.z*UNIT_Z));c.closePath();
      }
    }
    c.clip('evenodd');
    for(const material of ['dirt','stone']){
      const roads=(map.roads||[]).filter(r=>(r.material||'dirt')===material);
      if(!roads.length)continue;
      const art=TERRAIN_ART[material==='stone'?'terrain_stone_plaza':'terrain_dirt_path'];
      const entry=this.getImg(art.src,true);
      c.fillStyle=entry?.ready?getWorldMaterialPattern(c,entry.img,material==='stone'?280:600):art.color;
      for(const [margin,alpha]of [[.10,.20],[.025,.5],[-.035,1]]){
        c.beginPath();appendCelTrailMask(c,{roads},bounds,UNIT_X,UNIT_Z,margin);c.globalAlpha=alpha;c.fill();
      }
    }
    c.restore();
  }

  _paintForestTrails(c,map,chunkX,chunkY) {
    // The same route centre lines drive encounter exclusion. Only the soft
    // material fringe varies, by less than its .4-world-unit exclusion margin.
    const layer=document.createElement('canvas'),mask=document.createElement('canvas');
    layer.width=mask.width=CHUNK_SIZE;layer.height=mask.height=CHUNK_SIZE;
    const paint=layer.getContext('2d'),cut=mask.getContext('2d');
    paint.translate(-chunkX,-chunkY);cut.translate(-chunkX,-chunkY);
    this._paintGroundMaterial(paint,chunkX,chunkY,TERRAIN_ART.terrain_forest_trail);
    cut.fillStyle='#fff';cut.filter='blur(15px)';
    for(const road of map.roads || [])for(let segment=1;segment<road.points.length;segment++) {
      const a=worldToPx(road.points[segment-1].x,road.points[segment-1].z);
      const b=worldToPx(road.points[segment].x,road.points[segment].z);
      const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy),nx=-dy/length,ny=dx/length;
      if(!length)continue;
      const steps=Math.ceil(length/12),sides=[[],[]];
      for(let i=0;i<=steps;i++) {
        const t=i/steps,x=a.x+dx*t,y=a.y+dy*t;
        for(const [side,sign]of [-1,1].entries()) {
          const width=road.width*UNIT_X*.45 + 6*Math.sin(x*.037+y*.023+side*2.1) + 3*Math.sin(x*.091-y*.067);
          sides[side].push({x:x+nx*width*sign,y:y+ny*width*sign});
        }
      }
      const edge=[...sides[0],...sides[1].reverse()];
      cut.beginPath();edge.forEach((p,i)=>i?cut.lineTo(p.x,p.y):cut.moveTo(p.x,p.y));cut.closePath();cut.fill();
    }
    paint.setTransform(1,0,0,1,0,0);paint.globalCompositeOperation='destination-in';paint.drawImage(mask,0,0);
    c.save();c.globalAlpha=.55;c.drawImage(layer,chunkX,chunkY);c.restore();
  }

  _paintFloorPatch(c,patch,chunkX,chunkY) {
    const b=patch.bounds,x=b.minX*UNIT_X,y=b.minZ*UNIT_Z;
    const width=(b.maxX-b.minX)*UNIT_X,height=(b.maxZ-b.minZ)*UNIT_Z;
    if(x>chunkX+CHUNK_SIZE || x+width<chunkX || y>chunkY+CHUNK_SIZE || y+height<chunkY)return;
    const entry=this.getImg(patch.src,true);if(!entry?.ready)return;
    const key=`floor:${patch.src}`;
    if(!this.terrainPatternTiles.has(key)) {
      const surface=document.createElement('canvas');surface.width=entry.img.naturalWidth;surface.height=entry.img.naturalHeight;
      const ctx=surface.getContext('2d'),w=surface.width,h=surface.height;
      ctx.drawImage(entry.img,0,0);ctx.globalCompositeOperation='destination-in';
      for(const horizontal of [true,false]) {
        const gradient=ctx.createLinearGradient(0,0,horizontal?w:0,horizontal?0:h);
        const feather=patch.feather || .04;
        gradient.addColorStop(0,'#0000');gradient.addColorStop(feather,'#000');
        gradient.addColorStop(1-feather,'#000');gradient.addColorStop(1,'#0000');
        ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
      }
      this.terrainPatternTiles.set(key,surface);
    }
    c.drawImage(this.terrainPatternTiles.get(key),x,y,width,height);
  }

  _paintShoreline(c, points, zoneId, chunkX, chunkY) {
    const volcanic=zoneId==='canyon',coastal=zoneId==='coast';
    const trace=()=>{c.beginPath();points.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();};
    c.save();trace();c.clip();c.lineJoin='round';c.lineCap='round';
    trace();c.strokeStyle=volcanic?'#ec9c42':'#244e48';c.globalAlpha=volcanic?.24:.13;c.lineWidth=coastal?18:14;c.stroke();
    trace();c.strokeStyle=volcanic?'#f7c976':'#e0edd0';c.globalAlpha=.3;c.lineWidth=1.7;c.setLineDash([17,32,6,41]);c.stroke();c.restore();
  }

  _getWildGrassBed() {
    // The original dense meadow painting is used locally in untamed beds;
    // quiet short grass remains the ordinary traversal surface.
    const key='wild-grass-bed-v1';
    if(this.terrainPatternTiles.has(key))return this.terrainPatternTiles.get(key);
    const source=this.getImg('/pokemon-rpg/assets/overhaul/world/meadow-ground-v1.webp',true);
    if(!source?.ready)return null;
    const surface=document.createElement('canvas');surface.width=512;surface.height=512;
    const c=surface.getContext('2d');c.drawImage(source.img,0,0,512,512);
    c.globalCompositeOperation='destination-in';
    const mask=c.createRadialGradient(256,256,100,256,256,256);
    mask.addColorStop(0,'#fff');mask.addColorStop(.4,'#ffffffcc');mask.addColorStop(1,'#ffffff00');
    c.fillStyle=mask;c.fillRect(0,0,512,512);
    this.terrainPatternTiles.set(key,surface);return surface;
  }

  _getMaterialPatches(src) {
    const entry = this.getImg(src, true);
    if (!entry?.ready) return null;
    const cacheKey = `${src}:feathered-patches`;
    if (!this.terrainPatternTiles.has(cacheKey)) {
      const variants = [];
      const sourceW = entry.img.naturalWidth, sourceH = entry.img.naturalHeight;
      const crop = Math.min(sourceW,sourceH)*.64;
      for (let i = 0; i < 4; i++) {
        const patch = document.createElement('canvas');patch.width=512;patch.height=512;
        const pc = patch.getContext('2d');
        const sx = (i%2)*(sourceW-crop),sy = Math.floor(i/2)*(sourceH-crop);
        pc.drawImage(entry.img,sx,sy,crop,crop,0,0,512,512);
        pc.globalCompositeOperation='destination-in';
        const mask=pc.createRadialGradient(256,256,110,256,256,256);
        mask.addColorStop(0,'#fff');mask.addColorStop(.45,'#ffffffd9');mask.addColorStop(1,'#ffffff00');
        pc.fillStyle=mask;pc.fillRect(0,0,512,512);variants.push(patch);
      }
      this.terrainPatternTiles.set(cacheKey,variants);
    }
    return this.terrainPatternTiles.get(cacheKey);
  }

  _paintGroundMaterial(c, chunkX, chunkY, art) {
    const source=this.getImg(art.src,true);
    if(source?.ready){
      c.fillStyle=getWorldMaterialPattern(c,source.img,art.repeat||768);
      c.fillRect(chunkX,chunkY,CHUNK_SIZE,CHUNK_SIZE);return;
    }
    c.fillStyle=art.color;
    c.fillRect(chunkX,chunkY,CHUNK_SIZE,CHUNK_SIZE);
    const patches=this._getMaterialPatches(art.src);
    if(!patches) return;
    // Overlapping, feathered source patches avoid both hard repetition seams
    // and mirror-axis chevrons. Global coordinates make cached chunks agree.
    const size=art.patchSize || 840,spacing=size*330/840;
    const left=Math.floor((chunkX-size/2)/spacing),right=Math.ceil((chunkX+CHUNK_SIZE+size/2)/spacing);
    const top=Math.floor((chunkY-size/2)/spacing),bottom=Math.ceil((chunkY+CHUNK_SIZE+size/2)/spacing);
    for(let row=top;row<=bottom;row++) for(let col=left;col<=right;col++) {
      const seed=hashNoise(col*41.7+row*193.4),variant=Math.floor(seed*4);
      c.save();c.translate(col*spacing,row*spacing);
      if(art.rotate!==false)c.rotate(Math.floor(hashNoise(col*72.3-row*61.9)*4)*Math.PI/2);
      c.drawImage(patches[variant],-size/2,-size/2,size,size);c.restore();
    }
  }

  _drawNameTag(ctx, x, y, title, subtitle = '', accent = '#38bdf8', highlight = false) {
    ctx.save();
    ctx.font = '700 13px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    const titleW = ctx.measureText(title).width;
    let subW = 0;
    if (subtitle) {
      ctx.font = '600 10.5px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
      subW = ctx.measureText(subtitle).width;
    }
    const padX = 12;
    const boxW = Math.max(titleW, subW) + padX * 2;
    const boxH = subtitle ? 36 : 24;
    const bx = x - boxW * 0.5;
    const by = y - boxH;

    ctx.fillStyle = highlight ? 'rgba(28, 25, 23, 0.90)' : 'rgba(15, 23, 42, 0.82)';
    ctx.strokeStyle = highlight ? '#facc15' : accent;
    ctx.lineWidth = highlight ? 2 : 1.4;
    drawRoundedPill(ctx, bx, by, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 13px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    ctx.fillText(title, x, subtitle ? by + 13 : by + boxH * 0.5);

    if (subtitle) {
      ctx.fillStyle = highlight ? '#fde047' : '#cbd5e1';
      ctx.font = '600 10.5px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
      ctx.fillText(subtitle, x, by + 27);
    }
    ctx.restore();
  }

  _getTrainerOverworldSprite(avatarId, facing, isMoving = false) {
    const trial=this.artWalkTrial || (this.currentArtPreview ? CURRENT_TRAINER_DRAFTS[avatarId] : null);
    const atlas=trial?.avatarId===avatarId && (!trial.direction || trial.direction===facing || (trial.mirrorLeft && facing==='left' && trial.direction==='right')) ? trial : WALK_ATLASES.trainers[avatarId];
    const flipX=Boolean(atlas?.mirrorLeft && facing==='left');
    const sourceFacing=flipX ? 'right' : facing;
    const idle=!isMoving && atlas?.idleSrc ? this.getImg(atlas.idleSrc) : null;
    if(idle?.ready)return {img:idle.img,sx:0,sy:(WALK_DIR_ROW[sourceFacing] || 0)*256,sw:256,sh:256,
      flipX,isAtlas:true,overhaul:true,drawHeight:atlas.drawHeight,idleCalibration:atlas.idleCalibration?.[sourceFacing]};
    const replacement = atlas && this.getImg(atlas.src);
    if (replacement?.ready) {
      return { img: replacement.img,
        ...getWalkFrameAtDistance(atlas,sourceFacing,this.walkDistance,isMoving),
        flipX, isAtlas: true, overhaul: true, drawHeight:atlas.drawHeight };
    }
    // A pending working-art load must not flash the obsolete chibi artwork.
    if(atlas===trial && trial)return null;
    const walkEntry = AI_WALK_ATLAS_TRAINERS.has(avatarId)
      ? this.getImg(`/pokemon-rpg/assets/sprites/trainers/${avatarId}_walk.webp`)
      : null;
    if (walkEntry && walkEntry.ready) {
      const cols = WALK_ATLAS_FRAMES;
      const rows = 4;
      const cellW = walkEntry.img.naturalWidth / cols;
      const cellH = walkEntry.img.naturalHeight / rows;
      const rowIdx = WALK_DIR_ROW[facing] ?? 0;
      const colIdx = getWalkFrameAtDistance({columns:cols,cellWidth:cellW,cellHeight:cellH,
        fps:10,strideWorld:1.4,idleFrame:1},facing,this.walkDistance,isMoving).sx/cellW;
      return {
        img: walkEntry.img,
        sx: colIdx * cellW,
        sy: rowIdx * cellH,
        sw: cellW,
        sh: cellH,
        flipX: false,
        isAtlas: true,
      };
    }
    const dirEntry = this.getImg(`/pokemon-rpg/assets/sprites/trainers/${avatarId}_${facing}.webp`);
    if (dirEntry && dirEntry.ready) {
      return {
        img: dirEntry.img,
        flipX: false,
        isAtlas: false,
      };
    }
    const entry = this.getImg(`/pokemon-rpg/assets/trainers/${avatarId}.webp`);
    if (entry && entry.ready) {
      return {
        img: entry.img,
        flipX: facing === 'right',
        isAtlas: false,
      };
    }
    return null;
  }

  _getFollowerOverworldSprite(mon,facing,isMoving,followerIdx=0) {
    const hasDir = DIR_POKEMON_SPECIES.has(mon.speciesId);
    const atlas = this.artPokemonTrial?.speciesId===mon.speciesId ? this.artPokemonTrial : WALK_ATLASES.pokemon[mon.speciesId];
    const walkEntry = atlas ? this.getImg(atlas.src) : AI_WALK_ATLAS_POKEMON.has(mon.speciesId)
      ? this.getImg(`/pokemon-rpg/assets/sprites/pokemon/${mon.speciesId}_walk.webp`)
      : null;
    if(atlas) {
      if(!walkEntry?.ready)return null;
      return {img:walkEntry.img,...getWalkFrameAtDistance({...atlas,strideWorld:atlas.strideWorld || 1.8},facing,
        this.walkDistance-this._followerTrailDistance(followerIdx),isMoving),isAtlas:true,overhaul:true,
        groundOffset:atlas===WALK_ATLASES.pokemon[mon.speciesId] ? getPokemonGroundOffset(mon.speciesId,facing) : 0};
    }
    const dirEntry = hasDir ? this.getImg(`/pokemon-rpg/assets/sprites/pokemon/${mon.speciesId}_${facing}.webp`) : null;
    const baseEntry = this.getImg(`/pokemon-rpg/assets/pokemon/${mon.speciesId}.webp`);
    if(walkEntry?.ready) {
      const width=walkEntry.img.naturalWidth/WALK_ATLAS_FRAMES,height=walkEntry.img.naturalHeight/4;
      const phase=this.walkPhase-(followerIdx+1)*.95;
      const col=isMoving?((Math.floor(phase*1.65)%WALK_ATLAS_FRAMES)+WALK_ATLAS_FRAMES)%WALK_ATLAS_FRAMES:0;
      return {img:walkEntry.img,sx:col*width,sy:(WALK_DIR_ROW[facing] || 0)*height,sw:width,sh:height,isAtlas:true,flipX:false};
    }
    const active=dirEntry?.ready ? dirEntry : baseEntry;
    return active?.ready ? {img:active.img,isAtlas:false,flipX:active===baseEntry && facing==='right'} : null;
  }

  _drawFollowerPokemon(ctx, mon, followPos, isMoving, tSec, followerIdx) {
    // Reviewed sheets have different amounts of transparent padding. Venusaur's
    // wide, low silhouette needs extra compensation to read as a large Pokémon.
    const baseSz=78*followerBodyScale(mon.speciesId),drawSz=baseSz*1.18;
    const sprite=this._getFollowerOverworldSprite(mon,followPos.facing || 'down',isMoving,followerIdx);
    if(!sprite)return;
    const fp=worldToPx(followPos.x,followPos.z);
    drawContactShadow(ctx,fp.x,fp.y+3,drawSz*.26,6,.25);
    ctx.save();ctx.translate(fp.x,fp.y);
    if(sprite.flipX)ctx.scale(-1,1);
    // Preserve the previous lower edge while enlarging around the ground contact.
    const top=-drawSz+baseSz*.10+drawSz*(sprite.groundOffset || 0)/256;
    if(sprite.isAtlas)ctx.drawImage(sprite.img,sprite.sx,sprite.sy,sprite.sw,sprite.sh,-drawSz*.5,top,drawSz,drawSz);
    else ctx.drawImage(sprite.img,-drawSz*.5,top,drawSz,drawSz);
    ctx.restore();
  }

  _drawPortalGate(ctx, portal, tSec) {
    const sign=portal.sign||{x:portal.x,z:portal.z-2.1},pp=worldToPx(sign.x,sign.z),entry=this.getImg(TRAIL_SIGN_ART);
    if(!entry?.ready)return;
    const h=84,w=h*entry.img.naturalWidth/entry.img.naturalHeight;
    ctx.save();drawContactShadow(ctx,pp.x,pp.y+2,12,4,.2);
    ctx.drawImage(entry.img,pp.x-w/2,pp.y-h,w,h);
    const distance=this.lastPlayerPos?Math.hypot(this.lastPlayerPos.x-portal.x,this.lastPlayerPos.z-portal.z):Infinity;
    if(distance<7){
      const arrow={east:'→',west:'←',north:'↑',south:'↓'}[portal.direction]||'→';
      const name=arrow+' '+getMap(portal.targetZone).nameZh;
      ctx.font='500 12px "Microsoft JhengHei",sans-serif';ctx.textAlign='center';
      const width=ctx.measureText(name).width+20;
      ctx.fillStyle='#ede2c5ed';ctx.strokeStyle='#8b7653';ctx.lineWidth=1;
      drawRoundedPill(ctx,pp.x-width/2,pp.y+9,width,23,3);ctx.fill();ctx.stroke();
      ctx.fillStyle='#3e5141';ctx.fillText(name,pp.x,pp.y+25);
    }
    ctx.restore();
  }

  _drawZoneBanner(ctx, dt, w) {
    if (!this.zoneBanner) return;
    const zb = this.zoneBanner;
    zb.elapsed += dt;
    if (zb.elapsed >= zb.duration) {
      this.zoneBanner = null;
      return;
    }
    if (w <= 1000) return;
    const p = zb.elapsed / zb.duration;
    const alpha = p < 0.15 ? p / 0.15 : p > 0.82 ? (1 - p) / 0.18 : 1.0;
    const slideY = 118;

    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.translate(w * 0.5, slideY);

    const bw = 220;
    const bh = 30;
    const bgGrad = ctx.createLinearGradient(-bw * 0.5, 0, bw * 0.5, 0);
    bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0)');
    bgGrad.addColorStop(0.18, 'rgba(15, 23, 42, 0.94)');
    bgGrad.addColorStop(0.82, 'rgba(15, 23, 42, 0.94)');
    bgGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-bw * 0.5, -bh * 0.5, bw, bh);

    ctx.strokeStyle = zb.color || '#38bdf8';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-bw * 0.42, bh * 0.5);
    ctx.lineTo(bw * 0.42, bh * 0.5);
    ctx.stroke();

    ctx.font = '900 11px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = zb.color || '#38bdf8';
    ctx.textAlign = 'center';
    ctx.fillText(`${zb.nameZh} · ${zb.levelRange}`, 0, 4);
    ctx.restore();
  }

  updateWorld({ playerPos, isMoving, facing = 'down', questTarget, defeatedNpcs = [] }) {
    if (this.disposed || this.mode !== 'world') return;
    this._syncCanvasMetrics();

    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const tSec = now * 0.001;

    // Detect zone change from player state
    if (playerPos.zone && playerPos.zone !== this.activeZoneId) {
      this.setActiveZone(playerPos.zone);
    }
    const currentMap = getMap(this.activeZoneId);
    const bounds = currentMap.bounds;

    // Update breadcrumb trail & walk cycle
    if (!this.camInitialized) {
      this.resetTrailAt(playerPos.x, playerPos.z,facing);
    }
    if (isMoving) {
      const distance=this.lastPlayerPos ? Math.hypot(playerPos.x-this.lastPlayerPos.x,playerPos.z-this.lastPlayerPos.z) : 0;
      // Travel, not elapsed wall time, advances planted feet. Colliding with a
      // wall or pausing the renderer cannot keep walking in place.
      this.walkDistance += Math.min(distance, .7);
      this.walkPhase += Math.min(distance, .7)*11.5/3;
      const head = this.trail[0];
      if (!head || Math.hypot(playerPos.x - head.x, playerPos.z - head.z) >= 0.08) {
        this.trail.unshift({ x: playerPos.x, z: playerPos.z, facing });
        if (this.trail.length > 140) this.trail.pop();
      }
    } else {
      this.walkPhase = 0;
    }
    this.lastPlayerPos = {x:playerPos.x,z:playerPos.z};

    // Camera follow clamped strictly to active map bounds
    const targetPx = worldToPx(playerPos.x, playerPos.z);
    const minCamX = bounds.minX * UNIT_X + 220;
    const maxCamX = bounds.maxX * UNIT_X - 220;
    const minCamY = bounds.minZ * UNIT_Z + 180;
    const maxCamY = bounds.maxZ * UNIT_Z - 180;

    // Stable root framing: changing facing alone must not shift the camera by
    // half a character height and make a planted-foot turn appear to slide.
    const desiredCamX = clamp(targetPx.x, minCamX, maxCamX);
    const desiredCamY = clamp(targetPx.y - 26, minCamY, maxCamY);
    const lerp = 1 - Math.exp(-dt * 9.5);
    this.camPx.x += (desiredCamX - this.camPx.x) * lerp;
    this.camPx.y += (desiredCamY - this.camPx.y) * lerp;

    const { ctx } = this;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    // Camera transform: world pixels -> CSS viewport pixels
    const halfW = (this.viewW * 0.5) / this.zoom;
    const topSpan = (this.viewH * 0.54) / this.zoom;
    const botSpan = (this.viewH * 0.46) / this.zoom;
    const visLeft = this.camPx.x - halfW - 200;
    const visRight = this.camPx.x + halfW + 200;
    const visTop = this.camPx.y - topSpan - 280;
    const visBottom = this.camPx.y + botSpan + 280;

    ctx.save();
    ctx.translate(this.viewW * 0.5, this.viewH * 0.54);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.camPx.x, -this.camPx.y);

    // 1. Draw visible cached hand-painted terrain chunks for active zone
    const startCx = Math.floor(visLeft / CHUNK_SIZE);
    const endCx = Math.floor(visRight / CHUNK_SIZE);
    const startCy = Math.floor(visTop / CHUNK_SIZE);
    const endCy = Math.floor(visBottom / CHUNK_SIZE);

    for (let cy = startCy; cy <= endCy; cy++) {
      for (let cx = startCx; cx <= endCx; cx++) {
        const chunk = this._getTerrainChunk(cx, cy, this.activeZoneId);
        ctx.drawImage(chunk, cx * CHUNK_SIZE, cy * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE);
      }
    }

    paintPremiumWaterMotion(ctx,{map:currentMap,time:tSec,unitX:UNIT_X,unitZ:UNIT_Z,
      reducedMotion:reducedMotionQuery?.matches});

    // Subtle quest target ground beacon
    if (questTarget && (!questTarget.zone || questTarget.zone === this.activeZoneId)) {
      const qp = worldToPx(questTarget.x, questTarget.z);
      const pulse = 1 + 0.12 * Math.sin(tSec * 3.6);
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.72)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(qp.x, qp.y, 34 * pulse, 22 * pulse, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Collect all 2.5D Y-sorted renderables (Buildings, Props, Grass Tufts, NPCs, Followers, Trainer)
    const drawList = [];
    for(const item of getFieldDrawables(currentMap,{getImage:src=>this.getImg(src),save:this.worldSave,playerPos,bounds:{left:visLeft,right:visRight,top:visTop,bottom:visBottom}}))drawList.push({sortY:item.sortY,draw:()=>item.draw(ctx)});
    for(const item of getPremiumCrossingDrawables(currentMap,{getImage:src=>this.getImg(src),playerPos,bounds:{left:visLeft,right:visRight,top:visTop,bottom:visBottom},unitX:UNIT_X,unitZ:UNIT_Z})) {
      drawList.push({sortY:item.sortY,draw:()=>item.draw(ctx)});
    }
    for(const item of getCelForestDrawables(currentMap,{getImage:src=>this.getImg(src),playerPos,unitX:UNIT_X,unitZ:UNIT_Z})) {
      drawList.push({sortY:item.sortY,draw:()=>item.draw(ctx)});
    }
    const playerPx = worldToPx(playerPos.x, playerPos.z);
    for (const portal of currentMap.portals || []) {
      drawList.push({ sortY: worldToPx(portal.sign?.x??portal.x,portal.sign?.z??portal.z).y,
        draw: () => this._drawPortalGate(ctx,portal,tSec) });
    }

    // Town Fountain (if in dawnleaf)
    if (this.activeZoneId === 'dawnleaf') {
      const fountainPos = worldToPx(0, 1.5);
      drawList.push({
        sortY: fountainPos.y + 42,
        draw: () => {
          const spec=BUILDING_ASSET_MAP.fountain;
          const entry = this.getImg(spec.src);
          drawContactShadow(ctx,fountainPos.x,fountainPos.y+12,87,12,.22);
          if (entry && entry.ready) {
            ctx.drawImage(entry.img,fountainPos.x-spec.drawW/2,fountainPos.y-spec.drawH*spec.anchorY,spec.drawW,spec.drawH);
          }
        },
      });
    }

    // Landmark Buildings in this zone (100% intact, zero clipping!)
    if (currentMap.buildings) {
      for (const b of currentMap.buildings) {
        if (b.kind === 'fountain') continue;
        const bp = worldToPx(b.x, b.z);
        const spec = BUILDING_ASSET_MAP[b.kind] || BUILDING_ASSET_MAP[b.id];
        if (!spec) continue;
        if (bp.x < visLeft - 320 || bp.x > visRight + 320 || bp.y < visTop - 320 || bp.y > visBottom + 320) {
          continue;
        }
        const footY = bp.y + (b.d || 4.8) * UNIT_Z * 0.44;
        drawList.push({
          sortY: footY,
          draw: () => {
            const entry = this.getImg(spec.src);
            drawContactShadow(ctx,bp.x,footY-3,spec.drawW*.34,Math.min(22,spec.drawH*.055),.24);

            if (entry && entry.ready) {
              const playerBehindRoof =
                playerPx.y < footY - 6 &&
                playerPx.y > footY - spec.drawH * 0.65 &&
                Math.abs(playerPx.x - bp.x) < spec.drawW * 0.36;
              ctx.save();
              if (playerBehindRoof) ctx.globalAlpha = 0.82;
              ctx.drawImage(
                entry.img,
                bp.x - spec.drawW * (spec.anchorX ?? .5),
                footY - spec.drawH * spec.anchorY,
                spec.drawW,
                spec.drawH
              );
              ctx.restore();
            }
          },
        });
      }
    }

    // Scenery Props in this zone
    if (currentMap.props) {
      for (const prop of currentMap.props) {
        const pp = worldToPx(prop.x, prop.z);
        const spec = PROP_SPECS[prop.kind];
        if (!spec) continue;
        const w = spec.w * (prop.scale || 1);
        const h = spec.h * (prop.scale || 1);
        const left=pp.x-w*(spec.anchorX ?? .5),top=pp.y-h*spec.anchorY;
        if(left+w<visLeft || left>visRight || top+h<visTop || top>visBottom)continue;
        drawList.push({
          sortY: pp.y+(spec.sortOffsetZ || 0)*UNIT_Z*(prop.scale || 1),
          draw: () => {
            const entry = this.getImg(spec.src);
            if (!entry || !entry.ready) return;
            drawContactShadow(ctx,pp.x,pp.y+3,w*(spec.shadowRx || .25),Math.max(6,h*(spec.shadowRy || .035)),.2);

            const swayAngle = spec.sway ? Math.sin(tSec * 1.9 + (prop.x * 3)) * spec.sway : 0;
            const playerBehindTree =
              h > 180 &&
              playerPx.y < pp.y - 4 &&
              playerPx.y > pp.y - h * 0.72 &&
              playerPx.x>pp.x-w*(spec.anchorX ?? .5) && playerPx.x<pp.x+w*(1-(spec.anchorX ?? .5));

            ctx.save();
            ctx.translate(pp.x, pp.y);
            if (swayAngle) ctx.rotate(swayAngle);
            if (playerBehindTree) ctx.globalAlpha = 0.55;
            ctx.drawImage(entry.img, -w*(spec.anchorX ?? .5), -h*spec.anchorY, w, h);
            ctx.restore();
          },
        });
      }
    }

    // Wild Tall Grass Tufts (rustle dynamically!)
    if (!this.zoneGrassCache.has(this.activeZoneId)) {
      this.zoneGrassCache.set(this.activeZoneId, buildZoneGrassTufts(this.activeZoneId));
    }
    const grassTufts = this.zoneGrassCache.get(this.activeZoneId) || [];
    const activeWalkers = [
      playerPos,
      ...this.followers.map((_, idx) => this._sampleTrailAtDistance(this._followerTrailDistance(idx), playerPos)),
    ];
    for (const tuft of grassTufts) {
      const tp = worldToPx(tuft.x, tuft.z);
      if (tp.x < visLeft - 80 || tp.x > visRight + 80 || tp.y < visTop - 80 || tp.y > visBottom + 80) {
        continue;
      }
      const spec = PROP_SPECS[tuft.kind];
      const w = spec.w * tuft.scale;
      const h = spec.h * tuft.scale;
      let rustle = 0;
      for (const actor of activeWalkers) {
        const d = Math.hypot(actor.x - tuft.x, actor.z - tuft.z);
        if (d < 1.15) {
          rustle = Math.max(rustle, (1.15 - d) * 0.28);
        }
      }
      drawList.push({
        sortY: tp.y,
        draw: () => {
          const entry = this.getImg(spec.src);
          if (!entry || !entry.ready) return;
          const angle = Math.sin(tSec * (2.4 + rustle * 22) + tuft.seed) * (spec.sway + rustle);
          ctx.save();
          ctx.translate(tp.x, tp.y);
          ctx.rotate(angle);
          if (tuft.flip) ctx.scale(-1, 1);
          ctx.drawImage(entry.img, -w * 0.5, -h * spec.anchorY, w, h);
          ctx.restore();
        },
      });
    }

    // NPCs (strictly filtered to active zone!)
    for (const original of NPCS) {
      const npc=getActiveWorldNpc(original,this.worldSave);
      const npcZone = npc.zone || 'dawnleaf';
      if (npcZone !== this.activeZoneId) continue;
      if ((npc.kind === 'wild_boss' || npc.kind === 'legendary_boss') && defeatedNpcs.includes(npc.id)) {
        continue;
      }
      const np = worldToPx(npc.x, npc.z);
      if (np.x < visLeft - 140 || np.x > visRight + 140 || np.y < visTop - 180 || np.y > visBottom + 140) {
        continue;
      }
      const isQuestNpc = questTarget?.zone===this.activeZoneId && Math.hypot(npc.x - questTarget.x, npc.z - questTarget.z) < 2.2;
      const isBossCreature = npc.kind === 'wild_boss' || npc.kind === 'legendary_boss';
      const npcEntry=this.getImg(npc.sprite);
      const actor=npcEntry?.ready?getNpcDrawGeometry(npc,npcEntry.img,isBossCreature?145:110):null;
      const spriteW = actor?.w || 48;
      const spriteH = actor?.h || 110;

      drawList.push({
        sortY: np.y,
        draw: () => {
          const entry = this.getImg(npc.sprite);
          drawContactShadow(ctx,np.x,np.y+3,spriteW*.27,6,.25);

          if (entry && entry.ready) {
            ctx.save();
            ctx.translate(np.x, np.y);
            const s=actor.source;
            ctx.drawImage(entry.img,s.x,s.y,s.w,s.h,-spriteW*.5,-spriteH+3,spriteW,spriteH);
            ctx.restore();
          }

          if(Math.hypot(playerPos.x-npc.x,playerPos.z-npc.z)<(isQuestNpc?8:5))this._drawNameTag(
            ctx,
            np.x,
            np.y - spriteH * 0.94 - 6,
            isQuestNpc ? `★ ${npc.nameZh}` : npc.nameZh,
            npc.roleZh || '',
            npc.accentColor || '#38bdf8',
            Boolean(isQuestNpc)
          );
        },
      });
    }

    // Up to 3 Following Pokémon with 4-Directional Sprites
    for (let i = 0; i < this.followers.length; i++) {
      const mon = this.followers[i];
      if (!mon) continue;
      const followPos = this._sampleTrailAtDistance(this._followerTrailDistance(i), playerPos);
      const fp = worldToPx(followPos.x, followPos.z);

      drawList.push({
        sortY: fp.y,
        draw: () => {
          this._drawFollowerPokemon(ctx, mon, followPos, isMoving, tSec, i);
        },
      });
    }

    // Registered replacement atlas when available; otherwise the legacy demo.
    drawList.push({
      sortY: playerPx.y,
      draw: () => {
        const spriteInfo = this._getTrainerOverworldSprite(this.avatarId, facing, isMoving);
        const bob = 0;
        const lean = 0;
        const h = spriteInfo?.overhaul ? (spriteInfo.drawHeight || 115) : 115;
        const w = spriteInfo?.overhaul ? h : 92;

        drawContactShadow(ctx,playerPx.x,playerPx.y+3,22,6,.28);

        if (spriteInfo) {
          ctx.save();
          ctx.translate(playerPx.x, playerPx.y - bob);
          ctx.rotate(lean);
          if (spriteInfo.flipX) ctx.scale(-1, 1);
          if (spriteInfo.idleCalibration) {
            const {scale=1,y=0}=spriteInfo.idleCalibration;
            // Calibration values are in the original 256px frame coordinates.
            ctx.translate(0,y*h/256);
            ctx.scale(scale,scale);
          }
          if (spriteInfo.isAtlas) {
            ctx.drawImage(
              spriteInfo.img,
              spriteInfo.sx,
              spriteInfo.sy,
              spriteInfo.sw,
              spriteInfo.sh,
              -w * 0.5,
              -h * 0.92,
              w,
              h
            );
          } else {
            ctx.drawImage(spriteInfo.img, -w * 0.5, -h * 0.92, w, h);
          }
          ctx.restore();
        }
      },
    });

    // Sort back-to-front by foot Y
    drawList.sort((a, b) => a.sortY - b.sortY);
    for (const item of drawList) {
      item.draw();
    }


    ctx.restore(); // camera transform

    // Ambient biome lighting vignette (cached to avoid recreating gradient object every frame)
    const vigKey = `${this.viewW}_${this.viewH}_${this.activeZoneId}`;
    if (this._vigKey !== vigKey || !this._cachedVig) {
      this._vigKey = vigKey;
      const vig = ctx.createRadialGradient(
        this.viewW * 0.5,
        this.viewH * 0.48,
        this.viewW * 0.32,
        this.viewW * 0.5,
        this.viewH * 0.5,
        this.viewW * 0.78
      );
      if (this.activeZoneId === 'twilight') {
        vig.addColorStop(0, 'rgba(76, 29, 149, 0)');
        vig.addColorStop(1, 'rgba(30, 11, 64, 0.34)');
      } else if (this.activeZoneId === 'canyon') {
        vig.addColorStop(0, 'rgba(251, 146, 60, 0)');
        vig.addColorStop(1, 'rgba(124, 45, 18, 0.24)');
      } else {
        vig.addColorStop(0, 'rgba(255, 251, 235, 0.03)');
        vig.addColorStop(1, 'rgba(15, 23, 42, 0.16)');
      }
      this._cachedVig = vig;
    }
    ctx.fillStyle = this._cachedVig;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // Cross Gate Grand Zone Announcement Banner
    this._drawZoneBanner(ctx, dt, this.viewW);

    ctx.restore(); // dpr
  }

  enterBattleStage({ backdrop = 'meadow', playerMon, enemyMon }) {
    this._resolveBattleVisualWaiters();
    this.mode = 'battle';
    const resolvedBackdrop = backdrop === 'town' ? 'meadow' : backdrop || 'meadow';
    this.getImg(`/pokemon-rpg/assets/backdrops/${resolvedBackdrop}.webp`);
    if (playerMon?.speciesId) this.getImg(`/pokemon-rpg/assets/pokemon/${playerMon.speciesId}.webp`);
    if (enemyMon?.speciesId) this.getImg(`/pokemon-rpg/assets/pokemon/${enemyMon.speciesId}.webp`);

    const ambientMotes = Array.from({ length: 28 }, (_, idx) => ({
      x: Math.random(),
      y: Math.random(),
      vx: (Math.random() - 0.5) * 0.04,
      vy: resolvedBackdrop === 'canyon' || resolvedBackdrop === 'twilight' ? -0.03 - Math.random() * 0.04 : 0.015 + Math.random() * 0.025,
      size: 2.2 + Math.random() * 3.8,
      phase: idx * 0.7,
    }));

    this.battleState = {
      backdrop: resolvedBackdrop,
      playerMon,
      enemyMon,
      enemyCaptureScale: 1,
      playerLunge: 0,
      enemyLunge: 0,
      playerHitFlash: 0,
      enemyHitFlash: 0,
      screenShake: 0,
      vfxList: [],
      damageNumbers: [],
      skillBanner: null,
      screenFlash: null,
      hitFreeze: 0,
      ambientMotes,
      captureAnim: null,
      presentationEvents: [],
      fainting: {},
      visualWaiters: [],
    };
  }

  setBattlePokemon(side, mon) {
    delete this.battleState.fainting[side];
    if (side === 'player') {
      this.battleState.playerMon = mon;
    } else {
      this.battleState.enemyMon = mon;
      this.battleState.enemyCaptureScale = 1;
    }
    if (mon?.speciesId) {
      this.getImg(`/pokemon-rpg/assets/pokemon/${mon.speciesId}.webp`);
    }
  }

  exitBattleStage() {
    this._resolveBattleVisualWaiters();
    this.mode = 'world';
    this.battleState.vfxList = [];
    this.battleState.damageNumbers = [];
    this.battleState.skillBanner = null;
    this.battleState.screenFlash = null;
    this.battleState.hitFreeze = 0;
    this.battleState.captureAnim = null;
    this.battleState.presentationEvents = [];
    this.battleState.fainting = {};
  }

  _scheduleBattlePresentation(battle, at, run) {
    battle.presentationEvents.push({ at, elapsed: 0, run });
  }

  waitForBattleVisuals() {
    const b=this.battleState;
    if(this.mode!=='battle' || (!b.vfxList.length && !b.presentationEvents.length)) return Promise.resolve();
    return new Promise(resolve=>b.visualWaiters.push(resolve));
  }

  _resolveBattleVisualWaiters() {
    for(const resolve of this.battleState?.visualWaiters?.splice(0) || []) resolve();
  }

  _getFaintOpacity(side) {
    const b = this.battleState;
    if (b[`${side}Mon`]?.hp > 0) return 1;
    const faint = b.fainting[side];
    if (!faint) return 0;
    return 1-clamp((faint.elapsed-faint.impactAt-.08)/.32,0,1);
  }

  triggerBattleSkillVfx({
    fromSide = 'player',
    vfx = 'impact',
    skillId = null,
    skillType = 'normal',
    damage = 0,
    crit = false,
    effectivenessTone = 'normal',
    skillNameZh = '',
    healed = 0,
    onImpact = null,
  } = {}) {
    const b = this.battleState;
    const isHealOrBuff = vfx === 'heal_green' || vfx === 'buff_gold' || vfx === 'shield_blue' || healed > 0;
    const color = TYPE_INFO[skillType]?.color || (vfx === 'heal_green' ? '#4ade80' : '#fbbf24');
    const art=getSkillArt(vfx,skillId);
    const impactAt = art?.impact || .18;
    const targetSide = fromSide === 'player' ? 'enemy' : 'player';
    if (damage > 0 && b[`${targetSide}Mon`]?.hp <= 0) {
      b.fainting[targetSide] = { elapsed: 0, impactAt };
    }

    if (skillNameZh) {
      b.skillBanner = {
        nameZh: skillNameZh,
        skillType,
        color,
        duration: 1.15,
        elapsed: 0,
      };
    }

    if (!isHealOrBuff) {
      if (fromSide === 'player') {
        b.playerLunge = 1.0;
        this._scheduleBattlePresentation(b,impactAt,() => {
          b.enemyHitFlash = 1.0;
          b.screenShake = crit ? 22 : effectivenessTone === 'super' ? 16 : 9;
          b.hitFreeze = crit ? 0.065 : 0.04;
          if (skillType === 'fire') {
            b.screenFlash = { color: 'rgba(255, 90, 40, 0.35)', alpha: 0.9, decay: 4.2 };
          } else if (skillType === 'electric') {
            b.screenFlash = { color: 'rgba(247, 201, 39, 0.45)', alpha: 1.0, decay: 5.5 };
          } else if (skillType === 'water' || skillType === 'ice') {
            b.screenFlash = { color: 'rgba(56, 189, 248, 0.35)', alpha: 0.9, decay: 4.2 };
          } else if (crit) {
            b.screenFlash = { color: 'rgba(255, 255, 255, 0.65)', alpha: 1.0, decay: 6.0 };
          }
        });
      } else {
        b.enemyLunge = 1.0;
        this._scheduleBattlePresentation(b,impactAt,() => {
          b.playerHitFlash = 1.0;
          b.screenShake = crit ? 22 : effectivenessTone === 'super' ? 16 : 9;
          b.hitFreeze = crit ? 0.065 : 0.04;
          if (crit) {
            b.screenFlash = { color: 'rgba(255, 255, 255, 0.65)', alpha: 1.0, decay: 6.0 };
          }
        });
      }
    }

    const layout = this._getBattleLayout();
    const targetX = fromSide === 'player' ? layout.enemyX : layout.playerX;
    const targetY = (fromSide === 'player' ? layout.enemyY : layout.playerY) - 65;

    this._scheduleBattlePresentation(b,impactAt,() => {
      if (healed > 0) {
        const hX = fromSide === 'player' ? layout.playerX : layout.enemyX;
        const hY = (fromSide === 'player' ? layout.playerY : layout.enemyY) - 55;
        b.damageNumbers.push({
          x: hX + (Math.random() - 0.5) * 30,
          y: hY,
          groundY: hY + 12,
          vx: (Math.random() - 0.5) * 45,
          vy: -170,
          text: `+${healed}`,
          color: '#4ade80',
          glowColor: '#22c55e',
          bannerText: '💖 RECOVER',
          bannerColor: '#86efac',
          isCrit: false,
          isSuper: false,
          duration: 1.15,
          elapsed: 0,
        });
      } else if (damage > 0) {
        let bannerText = '';
        let bannerColor = '';
        if (crit) {
          bannerText = '★ 會心一擊！ CRITICAL ★';
          bannerColor = '#fde047';
        } else if (effectivenessTone === 'super') {
          bannerText = '🔥 2.0x 效果絕佳！';
          bannerColor = '#fb923c';
        } else if (effectivenessTone === 'weak') {
          bannerText = '❄️ 0.5x 效果減半';
          bannerColor = '#93c5fd';
        }

        b.damageNumbers.push({
          x: targetX + (Math.random() - 0.5) * 40,
          y: targetY,
          groundY: targetY + 16,
          vx: (Math.random() - 0.5) * 60,
          vy: -195 - (crit ? 50 : 0),
          text: `-${damage}`,
          color: crit ? '#fde047' : effectivenessTone === 'super' ? '#fb923c' : '#f8fafc',
          glowColor: crit ? '#eab308' : effectivenessTone === 'super' ? '#ea580c' : '#38bdf8',
          bannerText,
          bannerColor,
          isCrit: crit,
          isSuper: effectivenessTone === 'super',
          duration: 1.25,
          elapsed: 0,
        });
      }
    });

    const duration = art?.duration || (isHealOrBuff ? .75 : .68);
    if (onImpact) this._scheduleBattlePresentation(b,impactAt,onImpact);
    b.vfxList.push({
      fromSide,
      isSelf: isHealOrBuff,
      vfx,
      skillId,
      skillType,
      color,
      crit,
      effectivenessTone,
      elapsed: 0,
      duration,
      sparks: Array.from({ length: 36 }, (_, i) => ({
        angle: (i / 36) * Math.PI * 2 + (Math.random() - 0.5) * 0.35,
        speed: 85 + Math.random() * 165,
        size: 4 + Math.random() * 7,
      })),
    });
    return duration;
  }

  playCaptureSequence3D({ ballId = 'pokeball', shakes = 2, caught = false } = {}) {
    const ballUrl = `/pokemon-rpg/assets/items/${ballId}.webp`;
    this.getImg(ballUrl);
    const totalDuration = 1.05 + shakes * 0.62 + 0.55;

    return new Promise((resolve) => {
      this.battleState.captureAnim = {
        ballUrl,
        shakes,
        caught,
        elapsed: 0,
        totalDuration,
        onComplete: resolve,
      };
    });
  }

  setBattleViewport(rect) {
    this.battleViewport = rect;
  }

  _getBattleLayout() {
    const w = this.viewW, h = this.viewH;
    const portrait = (w <= 720 || h > w * 1.05) && h > 500;
    const stage = this.battleViewport || { left: 12, top: 100, right: w-12, bottom: h*.65 };
    const room = Math.max(60, stage.bottom-stage.top);
    const playerScale = clamp(POKEMON_SPECIES[this.battleState.playerMon?.speciesId]?.heightScale || 1, .86, 1.36);
    const enemyScale = clamp(POKEMON_SPECIES[this.battleState.enemyMon?.speciesId]?.heightScale || 1, .85, 1.35);
    const playerSize = Math.min(Math.min(w,h)*(portrait ? .38 : .30)*playerScale,Math.max(32,room-44));
    const enemySize = Math.min(Math.min(w,h)*(portrait ? .33 : .27)*enemyScale,Math.max(32,room-36));
    return {
      stage,
      playerX: clamp(w*.29,stage.left+playerSize/2,stage.right-playerSize/2),
      enemyX: clamp(w*.71,stage.left+enemySize/2,stage.right-enemySize/2),
      playerY: stage.bottom-12,
      enemyY: clamp(h*(portrait ? .35 : .53),stage.top+enemySize+10,stage.bottom-18),
      playerSize, enemySize,
    };
  }

  updateBattle() {
    if (this.disposed || this.mode !== 'battle') return;
    this._syncCanvasMetrics();

    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;
    const tSec = now * 0.001;

    const b = this.battleState;
    b.playerLunge = Math.max(0, b.playerLunge - dt * 3.4);
    b.enemyLunge = Math.max(0, b.enemyLunge - dt * 3.4);
    b.playerHitFlash = Math.max(0, b.playerHitFlash - dt * 3.8);
    b.enemyHitFlash = Math.max(0, b.enemyHitFlash - dt * 3.8);
    b.screenShake = Math.max(0, b.screenShake - dt * 28);
    for (const faint of Object.values(b.fainting)) faint.elapsed += dt;
    for (let i=b.presentationEvents.length-1;i>=0;i--) {
      const event=b.presentationEvents[i];
      event.elapsed += dt;
      if (event.elapsed >= event.at) {
        b.presentationEvents.splice(i,1);
        event.run();
      }
    }

    const { ctx } = this;
    const w = this.viewW;
    const h = this.viewH;

    ctx.save();
    ctx.scale(this.dpr, this.dpr);

    if (b.screenShake > 0.2) {
      ctx.translate((Math.random() - 0.5) * b.screenShake, (Math.random() - 0.5) * b.screenShake);
    }

    // 1. Full-screen 16:9 Battle Arena Panorama
    const bgEntry = this.getImg(`/pokemon-rpg/assets/backdrops/${b.backdrop}.webp`);
    if (bgEntry && bgEntry.ready) {
      const imgW = bgEntry.img.naturalWidth;
      const imgH = bgEntry.img.naturalHeight;
      const isPortrait = (w <= 720 || h > w * 1.05) && h > 500;
      const cropY = isPortrait ? imgH*.38 : h <= 500 && w <= 1000 ? imgH*.2 : 0;
      const sourceH = imgH-cropY;
      const scale = Math.max(w / imgW, h / sourceH) * 1.03;
      const drawW = imgW * scale;
      const drawH = sourceH * scale;
      const driftX = Math.sin(tSec * 0.35) * 8;
      const driftY = Math.cos(tSec * 0.28) * 4;
      ctx.drawImage(bgEntry.img,0,cropY,imgW,sourceH,(w-drawW)*.5+driftX,(h-drawH)*.5+driftY,drawW,drawH);
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#38bdf8');
      grad.addColorStop(0.55, '#bae6fd');
      grad.addColorStop(0.56, '#4d9c52');
      grad.addColorStop(1, '#2f6e39');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // 2. Ambient biome particles
    const moteColor =
      b.backdrop === 'canyon'
        ? 'rgba(251, 146, 60, 0.72)'
        : b.backdrop === 'twilight'
          ? 'rgba(216, 180, 254, 0.70)'
          : b.backdrop === 'coast'
            ? 'rgba(224, 242, 254, 0.68)'
            : 'rgba(254, 249, 195, 0.65)';
    for (const m of b.ambientMotes) {
      m.x = (m.x + m.vx * dt + 1) % 1;
      m.y = (m.y + m.vy * dt + 1) % 1;
      const alpha = 0.35 + 0.45 * Math.sin(tSec * 2.2 + m.phase);
      ctx.fillStyle = moteColor;
      ctx.globalAlpha = Math.max(0.08, alpha);
      ctx.beginPath();
      ctx.arc(m.x * w, m.y * h, m.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Grounded arena stage coordinates
    const layout=this._getBattleLayout();
    const charge={};
    for(const fx of b.vfxList) {
      const art=getSkillArt(fx.vfx,fx.skillId);
      if(art?.actorMotion!=='charge')continue;
      const player=fx.fromSide==='player';
      fx.deliveryPosition=getChargePresentation({elapsed:fx.elapsed+dt,art,
        sourceX:player?layout.playerX:layout.enemyX,sourceY:player?layout.playerY:layout.enemyY,
        targetX:player?layout.enemyX:layout.playerX,targetY:player?layout.enemyY:layout.playerY,
        sourceSize:player?layout.playerSize:layout.enemySize,targetSize:player?layout.enemySize:layout.playerSize,
        sourceGeometry:BATTLE_SPRITE_GEOMETRY[b[fx.fromSide+'Mon']?.speciesId],
        targetGeometry:BATTLE_SPRITE_GEOMETRY[b[(player?'enemy':'player')+'Mon']?.speciesId]});
      charge[fx.fromSide]=fx.deliveryPosition;
    }
    const playerBaseX = charge.player?.actorX ?? layout.playerX + Math.sin(b.playerLunge * Math.PI) * 58 - (b.playerHitFlash > 0 ? Math.sin(tSec * 55) * 10 : 0);
    const playerBaseY = charge.player?.actorY ?? layout.playerY - Math.sin(b.playerLunge * Math.PI) * 18;
    const enemyBaseX = charge.enemy?.actorX ?? layout.enemyX - Math.sin(b.enemyLunge * Math.PI) * 58 + (b.enemyHitFlash > 0 ? Math.sin(tSec * 55) * 10 : 0);
    const enemyBaseY = charge.enemy?.actorY ?? layout.enemyY + Math.sin(b.enemyLunge * Math.PI) * 16;

    // Capture sequence update
    let capBallDraw = null;
    if (b.captureAnim) {
      const ca = b.captureAnim;
      ca.elapsed += dt;
      const t = ca.elapsed;

      if (t < 0.46) {
        const p = t / 0.46;
        const bx = w * 0.20 + (w * 0.71 - w * 0.20) * p;
        const by = layout.playerY + (enemyBaseY - 68 - layout.playerY) * p - Math.sin(p * Math.PI) * Math.min(135,h*.18);
        b.enemyCaptureScale = 1;
        capBallDraw = { x: bx, y: by, rot: p * Math.PI * 5, scale: 1.0, glow: 0 };
      } else if (t < 0.82) {
        const p = (t - 0.46) / 0.36;
        b.enemyCaptureScale = Math.max(0, 1 - p * 1.15);
        capBallDraw = {
          x: w * 0.71,
          y: enemyBaseY - 68,
          rot: 0,
          scale: 1.16 - p * 0.12,
          glow: Math.sin(p * Math.PI),
        };
      } else if (t < 1.05) {
        const p = (t - 0.82) / 0.23;
        b.enemyCaptureScale = 0;
        const bounce = Math.abs(Math.sin(p * Math.PI * 1.5)) * (1 - p) * 34;
        capBallDraw = {
          x: w * 0.71,
          y: enemyBaseY - 22 - bounce,
          rot: 0,
          scale: 1.0,
          glow: 0,
        };
      } else {
        const shakeEnd = 1.05 + ca.shakes * 0.62;
        if (t < shakeEnd) {
          b.enemyCaptureScale = 0;
          const shakeIdx = Math.floor((t - 1.05) / 0.62);
          const localP = ((t - 1.05) % 0.62) / 0.62;
          const tilt = localP < 0.48 ? Math.sin((localP / 0.48) * Math.PI * 2) * 0.42 : 0;
          capBallDraw = {
            x: w * 0.71 + tilt * 14,
            y: enemyBaseY - 22,
            rot: tilt,
            scale: 1.0,
            glow: localP < 0.35 ? 0.5 : 0,
            ringProgress: localP,
            shakeIdx,
          };
        } else {
          const endP = clamp((t - shakeEnd) / 0.55, 0, 1);
          if (ca.caught) {
            b.enemyCaptureScale = 0;
            capBallDraw = {
              x: w * 0.71,
              y: enemyBaseY - 22,
              rot: 0,
              scale: 1.0,
              glow: 0.7 * (1 - endP),
              starBurst: endP,
            };
          } else {
            b.enemyCaptureScale = endP;
            capBallDraw = endP < 0.35 ? { x: w * 0.71, y: enemyBaseY - 22, rot: 0, scale: 1 - endP * 2, glow: 1 } : null;
          }
        }
      }

      if (ca.elapsed >= ca.totalDuration) {
        const done = ca.onComplete;
        b.captureAnim = null;
        if (!ca.caught) b.enemyCaptureScale = 1;
        if (done) done();
      }
    }

    // 3. Enemy Pokémon
    const enemyOpacity = this._getFaintOpacity('enemy');
    if (b.enemyMon && b.enemyCaptureScale > 0.01 && enemyOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = enemyOpacity;
      const sp = POKEMON_SPECIES[b.enemyMon.speciesId];
      const entry = this.getImg(`/pokemon-rpg/assets/pokemon/${b.enemyMon.speciesId}.webp`);
      const baseSz = layout.enemySize;
      const sz = baseSz * b.enemyCaptureScale;
      const bob = Math.sin(tSec * 2.8 + 1.1) * 5;

      ctx.fillStyle = 'rgba(10, 15, 28, 0.34)';
      ctx.beginPath();
      ctx.ellipse(enemyBaseX, enemyBaseY + 8, sz * 0.40, sz * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();

      if (entry && entry.ready) {
        ctx.save();
        ctx.translate(enemyBaseX, enemyBaseY - bob);
        if (b.enemyHitFlash > 0) {
          ctx.filter = `brightness(${1 + b.enemyHitFlash * 1.4})`;
        }
        ctx.drawImage(entry.img, -sz * 0.5, -sz * 0.90, sz, sz);
        ctx.restore();
      }
      ctx.restore();
    }

    // 4. Player Pokémon
    const playerOpacity = this._getFaintOpacity('player');
    if (b.playerMon && playerOpacity > 0) {
      ctx.save();
      ctx.globalAlpha = playerOpacity;
      const sp = POKEMON_SPECIES[b.playerMon.speciesId];
      const entry = this.getImg(`/pokemon-rpg/assets/pokemon/${b.playerMon.speciesId}.webp`);
      const sz = layout.playerSize;
      const bob = Math.sin(tSec * 2.6) * 5.5;

      ctx.fillStyle = 'rgba(10, 15, 28, 0.38)';
      ctx.beginPath();
      ctx.ellipse(playerBaseX, playerBaseY + 10, sz * 0.42, sz * 0.13, 0, 0, Math.PI * 2);
      ctx.fill();

      if (entry && entry.ready) {
        ctx.save();
        ctx.translate(playerBaseX, playerBaseY - bob);
        ctx.scale(-1, 1); // Face right toward enemy
        if (b.playerHitFlash > 0) {
          ctx.filter = `brightness(${1 + b.playerHitFlash * 1.4})`;
        }
        ctx.drawImage(entry.img, -sz * 0.5, -sz * 0.90, sz, sz);
        ctx.restore();
      }
      ctx.restore();
    }

    // Registered animation sheets take precedence over the legacy effects.
    for (let i = b.vfxList.length - 1; i >= 0; i--) {
      const fx = b.vfxList[i];
      fx.elapsed += dt;
      if (fx.elapsed >= fx.duration) {
        b.vfxList.splice(i, 1);
        continue;
      }
      const p = fx.elapsed / fx.duration;
      const sx = fx.fromSide === 'player' ? playerBaseX : enemyBaseX;
      const sy = (fx.fromSide === 'player' ? playerBaseY : enemyBaseY) - 70;
      const tx = fx.isSelf ? sx : fx.fromSide === 'player' ? enemyBaseX : playerBaseX;
      const ty = fx.isSelf ? sy : (fx.fromSide === 'player' ? enemyBaseY : playerBaseY) - 65;

      this._drawElementalSkillVfx(ctx, fx, p, sx, sy, tx, ty, tSec);
    }

    if(!b.vfxList.length && !b.presentationEvents.length) this._resolveBattleVisualWaiters();

    // 6. Capture Poké Ball
    if (capBallDraw && b.captureAnim) {
      const ballEntry = this.getImg(b.captureAnim.ballUrl);
      const sz = 54 * (capBallDraw.scale || 1);

      ctx.fillStyle = 'rgba(10, 15, 28, 0.30)';
      ctx.beginPath();
      ctx.ellipse(capBallDraw.x, enemyBaseY + 4, 22, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      if (capBallDraw.ringProgress !== undefined && capBallDraw.ringProgress < 0.7) {
        const rp = capBallDraw.ringProgress / 0.7;
        ctx.save();
        ctx.strokeStyle = '#fde047';
        ctx.globalAlpha = 1 - rp;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(capBallDraw.x, capBallDraw.y, 24 + rp * 54, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (capBallDraw.glow > 0.05) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(capBallDraw.x, capBallDraw.y, 4, capBallDraw.x, capBallDraw.y, 75);
        g.addColorStop(0, `rgba(255, 255, 255, ${capBallDraw.glow})`);
        g.addColorStop(0.45, `rgba(250, 204, 21, ${capBallDraw.glow * 0.8})`);
        g.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(capBallDraw.x, capBallDraw.y, 75, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (ballEntry && ballEntry.ready) {
        ctx.save();
        ctx.translate(capBallDraw.x, capBallDraw.y);
        ctx.rotate(capBallDraw.rot || 0);
        ctx.drawImage(ballEntry.img, -sz * 0.5, -sz * 0.5, sz, sz);
        ctx.restore();
      }

      if (capBallDraw.starBurst !== undefined) {
        const sb = capBallDraw.starBurst;
        ctx.save();
        for (let k = 0; k < 10; k++) {
          const ang = (k / 10) * Math.PI * 2 - Math.PI * 0.5;
          const dist = 18 + sb * 88;
          const sx = capBallDraw.x + Math.cos(ang) * dist;
          const sy = capBallDraw.y + Math.sin(ang) * dist;
          ctx.fillStyle = k % 2 === 0 ? '#fde047' : '#38bdf8';
          ctx.globalAlpha = 1 - sb;
          ctx.beginPath();
          ctx.arc(sx, sy, 6 * (1 - sb * 0.4), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // 7. Damage numbers, skill banner, screen flash
    this._drawDamageNumbers(ctx, b, dt);
    this._drawSkillBanner(ctx, b, dt, w);
    this._drawScreenFlash(ctx, b, dt, w, h);

    ctx.restore(); // dpr
  }

  _drawDamageNumbers(ctx, b, dt) {
    for (let i = b.damageNumbers.length - 1; i >= 0; i--) {
      const d = b.damageNumbers[i];
      d.elapsed += dt;
      if (d.elapsed >= d.duration) {
        b.damageNumbers.splice(i, 1);
        continue;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 430 * dt;
      if (d.y > d.groundY && d.vy > 0) {
        d.y = d.groundY;
        d.vy = -d.vy * 0.42;
      }

      const p = d.elapsed / d.duration;
      const alpha = p > 0.72 ? (1 - p) / 0.28 : 1.0;
      const scale = (d.isCrit ? 1.4 : d.isSuper ? 1.22 : 1.0) * (p < 0.15 ? 1 + (1 - p / 0.15) * 0.45 : 1.0);

      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.translate(d.x, d.y);
      ctx.scale(scale, scale);

      if (d.bannerText) {
        ctx.font = '900 12px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = d.bannerColor || '#fbbf24';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 6;
        ctx.fillText(d.bannerText, 0, -22);
      }

      ctx.font = '900 32px "Trebuchet MS", "Impact", sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#020617';
      ctx.strokeText(d.text, 0, 0);

      ctx.fillStyle = d.color;
      ctx.shadowColor = d.glowColor || d.color;
      ctx.shadowBlur = 10;
      ctx.fillText(d.text, 0, 0);
      ctx.restore();
    }
  }

  _drawSkillBanner(ctx, b, dt, w) {
    if (!b.skillBanner) return;
    const sb = b.skillBanner;
    sb.elapsed += dt;
    if (sb.elapsed >= sb.duration) {
      b.skillBanner = null;
      return;
    }
    const p = sb.elapsed / sb.duration;
    const alpha = p < 0.15 ? p / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1.0;
    const slideY = p < 0.15 ? 26 - (p / 0.15) * 12 : 14;

    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.translate(w * 0.5, slideY);

    const bw = 390;
    const bh = 44;
    const bgGrad = ctx.createLinearGradient(-bw * 0.5, 0, bw * 0.5, 0);
    bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0)');
    bgGrad.addColorStop(0.2, 'rgba(15, 23, 42, 0.94)');
    bgGrad.addColorStop(0.8, 'rgba(15, 23, 42, 0.94)');
    bgGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-bw * 0.5, -bh * 0.5, bw, bh);

    ctx.strokeStyle = sb.color;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-bw * 0.4, bh * 0.5);
    ctx.lineTo(bw * 0.4, bh * 0.5);
    ctx.stroke();

    ctx.font = '900 18px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = sb.color;
    ctx.shadowBlur = 12;
    ctx.fillText(`【${sb.nameZh}】`, 0, 0);
    ctx.restore();
  }

  _drawScreenFlash(ctx, b, dt, w, h) {
    if (!b.screenFlash) return;
    const sf = b.screenFlash;
    sf.alpha -= dt * sf.decay;
    if (sf.alpha <= 0) {
      b.screenFlash = null;
      return;
    }
    ctx.save();
    ctx.globalAlpha = clamp(sf.alpha, 0, 1);
    ctx.fillStyle = sf.color;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /**
   * Bespoke Battle Skill Sprites Animation:
   * Uses genuine sprites (skill_fireball, skill_water_pulse, skill_leaf_cutter, skill_thunderbolt, skill_crescent_slash, skill_shadow_sphere)
   */
  _drawElementalSkillVfx(ctx, fx, p, sx, sy, tx, ty, tSec) {
    const art = getSkillArt(fx.vfx,fx.skillId);
    const entry = art && this.getImg(art.src);
    if (entry?.ready) {
      if(art.delivery) {
        drawAtlasSkillEffect(ctx,{fx,art,image:entry.img,sx,sy,tx,ty,viewW:this.viewW,viewH:this.viewH});
        return;
      }
      const travelling = fx.elapsed < art.anticipation;
      const frame = travelling ? 0 : Math.min(art.frames-1,Math.floor((fx.elapsed-art.anticipation)*art.fps));
      const size = travelling ? 95 : clamp(Math.min(this.viewW,this.viewH)*.27,125,240);
      const travel = clamp(fx.elapsed/art.anticipation,0,1);
      const x = travelling ? sx+(tx-sx)*travel : tx;
      const y = travelling ? sy+(ty-sy)*travel-Math.sin(travel*Math.PI)*20 : ty+32;
      ctx.save();
      ctx.drawImage(entry.img,(frame%art.columns)*art.cellSize,Math.floor(frame/art.columns)*art.cellSize,
        art.cellSize,art.cellSize,x-size*art.anchor[0],y-size*art.anchor[1],size,size);
      ctx.restore();
      return;
    }
    const isSelf = fx.isSelf;
    const skillType = fx.skillType;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    if (isSelf) {
      // Healing & buff concentric vitality rings & crosses
      for (let r = 0; r < 3; r++) {
        const rp = (p + r * 0.28) % 1;
        ctx.strokeStyle = fx.color;
        ctx.globalAlpha = (1 - rp) * 0.88;
        ctx.lineWidth = 4 * (1 - rp * 0.5);
        ctx.beginPath();
        ctx.ellipse(sx, sy + 52 - rp * 105, 72 * (0.8 + rp * 0.4), 26, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let k = 0; k < 6; k++) {
        const kp = (p + k * 0.16) % 1;
        const cx = sx + Math.sin(k * 2.2 + p * 3) * 44;
        const cy = sy + 40 - kp * 95;
        ctx.fillStyle = '#4ade80';
        ctx.globalAlpha = (1 - kp) * 0.95;
        ctx.fillRect(cx - 3, cy - 8, 6, 16);
        ctx.fillRect(cx - 8, cy - 3, 16, 6);
      }
    } else if (skillType === 'fire') {
      const travelP = clamp(p / 0.45, 0, 1);
      const cx = sx + (tx - sx) * travelP;
      const cy = sy + (ty - sy) * travelP - Math.sin(travelP * Math.PI) * 38;

      // Projectile: Flying Fireball Sprite
      if (p < 0.50) {
        const fbEntry = this.getImg('/pokemon-rpg/assets/skills/skill_fireball.webp');
        const fbSz = 86;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(travelP * Math.PI * 6);
        if (fbEntry && fbEntry.ready) {
          ctx.drawImage(fbEntry.img, -fbSz * 0.5, -fbSz * 0.5, fbSz, fbSz);
        } else {
          const fGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 48);
          fGrad.addColorStop(0, '#ffffff');
          fGrad.addColorStop(0.3, '#fde047');
          fGrad.addColorStop(0.7, '#ea580c');
          fGrad.addColorStop(1, 'rgba(234, 88, 12, 0)');
          ctx.fillStyle = fGrad;
          ctx.beginPath();
          ctx.arc(0, 0, 48, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Impact: Fire Burst Sprite Explosion
      if (p >= 0.35) {
        const impP = (p - 0.35) / 0.65;
        const burstEntry = this.getImg('/pokemon-rpg/assets/skills/skill_fire_burst.webp');
        const burstSz = 175 * (0.6 + impP * 0.6);
        ctx.save();
        ctx.translate(tx, ty);
        ctx.globalAlpha = (1 - impP) * 0.95;
        if (burstEntry && burstEntry.ready) {
          ctx.drawImage(burstEntry.img, -burstSz * 0.5, -burstSz * 0.5, burstSz, burstSz);
        } else {
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 6 * (1 - impP * 0.5);
          ctx.beginPath();
          ctx.arc(0, 0, 20 + impP * 125, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        for (const spk of fx.sparks) {
          const dist = spk.speed * impP * 1.1;
          const px = tx + Math.cos(spk.angle) * dist;
          const py = ty + Math.sin(spk.angle) * dist - impP * 55;
          ctx.fillStyle = '#f97316';
          ctx.globalAlpha = (1 - impP) * 0.95;
          ctx.beginPath();
          ctx.arc(px, py, spk.size * (1 - impP * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (skillType === 'water') {
      const travelP = clamp(p / 0.45, 0, 1);
      const cx = sx + (tx - sx) * travelP;
      const cy = sy + (ty - sy) * travelP - Math.sin(travelP * Math.PI) * 24;

      // Projectile: Spinning Water Pulse Sprite
      if (p < 0.50) {
        const wpEntry = this.getImg('/pokemon-rpg/assets/skills/skill_water_pulse.webp');
        const wpSz = 88;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(travelP * Math.PI * 5);
        if (wpEntry && wpEntry.ready) {
          ctx.drawImage(wpEntry.img, -wpSz * 0.5, -wpSz * 0.5, wpSz, wpSz);
        } else {
          const wGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 45);
          wGrad.addColorStop(0, '#ffffff');
          wGrad.addColorStop(0.4, '#38bdf8');
          wGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
          ctx.fillStyle = wGrad;
          ctx.beginPath();
          ctx.arc(0, 0, 45, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Impact: Water Vortex Splash Sprite
      if (p >= 0.35) {
        const impP = (p - 0.35) / 0.65;
        const vortexEntry = this.getImg('/pokemon-rpg/assets/skills/skill_water_vortex.webp');
        const vortexSz = 180 * (0.6 + impP * 0.6);
        ctx.save();
        ctx.translate(tx, ty);
        ctx.globalAlpha = (1 - impP) * 0.95;
        if (vortexEntry && vortexEntry.ready) {
          ctx.rotate(impP * Math.PI * 3);
          ctx.drawImage(vortexEntry.img, -vortexSz * 0.5, -vortexSz * 0.5, vortexSz, vortexSz);
        } else {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 5 * (1 - impP * 0.5);
          ctx.beginPath();
          ctx.ellipse(0, 50, 30 + impP * 115, 14 + impP * 45, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();

        for (const spk of fx.sparks) {
          const dist = spk.speed * impP;
          const px = tx + Math.cos(spk.angle) * dist;
          const py = ty + Math.sin(spk.angle) * dist * 0.8 + impP * impP * 48;
          ctx.fillStyle = '#38bdf8';
          ctx.globalAlpha = (1 - impP) * 0.95;
          ctx.beginPath();
          ctx.arc(px, py, spk.size * (1 - impP * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (skillType === 'grass') {
      const leafEntry = this.getImg('/pokemon-rpg/assets/skills/skill_leaf_cutter.webp');
      const leafSz = 68;

      // Projectile: Spinning Leaf Cutters
      for (let l = 0; l < 8; l++) {
        const lp = clamp((p * 1.6 - l * 0.05) / 0.7, 0, 1);
        if (lp > 0 && lp < 1) {
          const lx = sx + (tx - sx) * lp + Math.sin(lp * Math.PI * 3 + l) * 36;
          const ly = sy + (ty - sy) * lp - Math.sin(lp * Math.PI) * 28 + Math.cos(l * 1.7) * 26;
          ctx.save();
          ctx.translate(lx, ly);
          ctx.rotate(lp * Math.PI * 8 + l);
          if (leafEntry && leafEntry.ready) {
            ctx.drawImage(leafEntry.img, -leafSz * 0.5, -leafSz * 0.5, leafSz, leafSz);
          } else {
            ctx.fillStyle = l % 2 === 0 ? '#4ade80' : '#22c55e';
            ctx.beginPath();
            ctx.ellipse(0, 0, 16, 7, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      if (p >= 0.35) {
        const impP = (p - 0.35) / 0.65;
        ctx.strokeStyle = '#4ade80';
        ctx.globalAlpha = (1 - impP) * 0.92;
        ctx.lineWidth = 5 * (1 - impP * 0.5);
        ctx.beginPath();
        ctx.arc(tx, ty, 20 + impP * 110, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (skillType === 'electric') {
      if (p >= 0.15) {
        const impP = (p - 0.15) / 0.85;
        const boltCount = fx.crit ? 4 : 2;
        for (let bIdx = 0; bIdx < boltCount; bIdx++) {
          const skyX = tx + (bIdx - (boltCount - 1) * 0.5) * 55 + (Math.random() - 0.5) * 40;
          ctx.beginPath();
          ctx.moveTo(skyX, 0);
          drawLightningBolt(ctx, skyX, 0, tx + (Math.random() - 0.5) * 20, ty, 38, 5);

          ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
          ctx.lineWidth = 8;
          ctx.stroke();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Thunderbolt Burst Sprite
        const tbEntry = this.getImg('/pokemon-rpg/assets/skills/skill_thunderbolt.webp');
        const tbSz = 160 * (0.8 + impP * 0.4);
        ctx.save();
        ctx.translate(tx, ty);
        ctx.globalAlpha = (1 - impP) * 0.95;
        if (tbEntry && tbEntry.ready) {
          ctx.drawImage(tbEntry.img, -tbSz * 0.5, -tbSz * 0.5, tbSz, tbSz);
        } else {
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 4 * (1 - impP * 0.5);
          ctx.beginPath();
          ctx.arc(0, 0, 15 + impP * 120, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else if (skillType === 'psychic' || skillType === 'ghost') {
      const travelP = clamp(p / 0.45, 0, 1);
      const cx = sx + (tx - sx) * travelP;
      const cy = sy + (ty - sy) * travelP;

      // Projectile: Pulsing Shadow Sphere Sprite
      const ssEntry = this.getImg('/pokemon-rpg/assets/skills/skill_shadow_sphere.webp');
      const ssSz = 92;
      if (p < 0.50) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(travelP * Math.PI * 4);
        if (ssEntry && ssEntry.ready) {
          ctx.drawImage(ssEntry.img, -ssSz * 0.5, -ssSz * 0.5, ssSz, ssSz);
        } else {
          const vGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 46);
          vGrad.addColorStop(0, '#090d16');
          vGrad.addColorStop(0.45, '#7c3aed');
          vGrad.addColorStop(1, 'rgba(236, 72, 153, 0)');
          ctx.fillStyle = vGrad;
          ctx.beginPath();
          ctx.arc(0, 0, 46, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (p >= 0.35) {
        const impP = (p - 0.35) / 0.65;
        const burstSz = 175 * (0.6 + impP * 0.6);
        ctx.save();
        ctx.translate(tx, ty);
        ctx.globalAlpha = (1 - impP) * 0.95;
        if (ssEntry && ssEntry.ready) {
          ctx.drawImage(ssEntry.img, -burstSz * 0.5, -burstSz * 0.5, burstSz, burstSz);
        }
        ctx.restore();
      }
    } else {
      // Normal / Physical: Crescent Slash Sprite
      if (p >= 0.22) {
        const impP = (p - 0.22) / 0.78;
        const slashEntry = this.getImg('/pokemon-rpg/assets/skills/skill_crescent_slash.webp');
        const slashSz = 150 * (0.7 + impP * 0.5);
        ctx.save();
        ctx.translate(tx, ty);
        ctx.globalAlpha = (1 - impP) * 0.95;
        if (slashEntry && slashEntry.ready) {
          ctx.rotate(impP * 0.8 - 0.4);
          ctx.drawImage(slashEntry.img, -slashSz * 0.5, -slashSz * 0.5, slashSz, slashSz);
        } else {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 6 * (1 - impP * 0.6);
          ctx.beginPath();
          ctx.arc(0, 0, 68, -0.6 * Math.PI, 0.4 * Math.PI);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (p >= 0.35) {
        const impP = (p - 0.35) / 0.65;
        for (const spk of fx.sparks) {
          const px = tx + Math.cos(spk.angle) * spk.speed * impP;
          const py = ty + Math.sin(spk.angle) * spk.speed * impP;
          ctx.fillStyle = fx.color || '#ffffff';
          ctx.globalAlpha = (1 - impP) * 0.92;
          ctx.beginPath();
          ctx.arc(px, py, spk.size * (1 - impP * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    window.removeEventListener('load', this._onResize);
    window.visualViewport?.removeEventListener('resize', this._onResize);
    this._resizeObserver?.disconnect();
    this.terrainChunks.clear();
    this.terrainChunkBytes = 0;
  }
}
