import { WORLD_ART_REGIONS, insideTerrainRegion } from './worldArtLayouts.mjs';
import { applyWorldExpansions } from './worldExpansions.mjs';
import { addAuthoredWorldRegions } from './worldRegions.mjs';
import { applyCelForestPrototype } from './worldCelPrototype.mjs';
import { applyPremiumCrossingPrototype } from './worldPremiumPrototype.mjs';
import { applyWorldPolish } from './worldPolish.mjs';
import {installMosswoodForest} from './worldMosswood.mjs';
import {installTrailExits} from './worldExits.mjs';
import {installWorldAdventure} from './worldAdventure.mjs';

export const MAP_ZONES = {
  dawnleaf: {
    id: 'dawnleaf',
    nameZh: '晨曦鎮',
    nameEn: 'Dawnleaf Town',
    subtitleZh: '和平的冒險之都・研究所 / 精靈醫院 / 精靈商城',
    levelRange: '安全城鎮',
    music: 'town',
    battleBackdrop: 'meadow',
    skyColor: '#87cefa',
    fogColor: '#bfe6ff',
    ambientColor: '#fff6e5',
    bounds: { minX: -25, maxX: 25, minZ: -25, maxZ: 25 },
    terrainBase: 'terrain_grass_floral',
    plazaBase: 'terrain_stone_plaza',
    encounters: [],
    portals: [
      {
        id: 'gate_dawnleaf_to_meadow',
        nameZh: '東門 ➔ 翡翠微風大草原',
        targetZone: 'meadow',
        x: 23.5,
        z: 0.0,
        radius: 2.2,
        targetSpawn: { x: -21.5, z: 0.0, facing: 'right' },
        color: '#22c55e',
      },
      {
        id: 'gate_dawnleaf_to_coast',
        nameZh: '南門 ➔ 蔚藍潮汐海岸',
        targetZone: 'coast',
        x: 0.0,
        z: 23.5,
        radius: 2.2,
        targetSpawn: { x: 0.0, z: -21.5, facing: 'down' },
        color: '#0284c7',
      },
      {
        id: 'gate_dawnleaf_to_canyon',
        nameZh: '西門 ➔ 赤焰熔岩峽谷',
        targetZone: 'canyon',
        x: -23.5,
        z: 0.0,
        radius: 2.2,
        targetSpawn: { x: 21.5, z: 0.0, facing: 'left' },
        color: '#ea580c',
      },
      {
        id: 'gate_dawnleaf_to_twilight',
        nameZh: '北門 ➔ 幽影星輝神殿',
        targetZone: 'twilight',
        x: 0.0,
        z: -23.5,
        radius: 2.2,
        targetSpawn: { x: 0.0, z: 21.5, facing: 'up' },
        color: '#a855f7',
      },
    ],
    buildings: [
      {
        id: 'lab',
        nameZh: '木槿博士研究所',
        kind: 'lab',
        x: -8.5,
        z: -6.5,
        w: 5.8,
        d: 4.8,
        h: 4.2,
        signZh: 'RESEARCH LAB',
      },
      {
        id: 'hospital',
        nameZh: '精靈醫院',
        kind: 'hospital',
        x: 0.0,
        z: -7.5,
        w: 6.8,
        d: 5.2,
        h: 4.5,
        signZh: 'POKÉ HOSPITAL +',
      },
      {
        id: 'shop',
        nameZh: '星輝精靈商城',
        kind: 'shop',
        x: 8.5,
        z: -6.5,
        w: 5.8,
        d: 4.8,
        h: 4.2,
        signZh: 'POKÉ MART',
      },
      {
        id: 'fountain',
        nameZh: '晨曦中央噴泉',
        kind: 'fountain',
        x: 0.0,
        z: 1.5,
        w: 3.6,
        d: 2.0,
        h: 3.8,
      },
    ],
    props: [
      // Town avenue trees and lamps
      { kind: 'tree_oak', x: -15.5, z: -8.5, scale: 1.1 },
      { kind: 'tree_oak', x: -15.5, z: 5.5, scale: 1.05 },
      { kind: 'tree_oak', x: 15.5, z: -8.5, scale: 1.1 },
      { kind: 'tree_oak', x: 15.5, z: 5.5, scale: 1.05 },
      { kind: 'tree_oak', x: -9.5, z: 12.5, scale: 1.0 },
      { kind: 'tree_oak', x: 9.5, z: 12.5, scale: 1.0 },
    ],
    tallGrass: [],
    roads: [
      // Main plaza cross-roads
      {
        material: 'stone',
        width: 3.6,
        points: [
          { x: -22.5, z: 0.0 },
          { x: 22.5, z: 0.0 },
        ],
      },
      {
        material: 'stone',
        width: 3.6,
        points: [
          { x: 0.0, z: -22.5 },
          { x: 0.0, z: 22.5 },
        ],
      },
      // Central square circular paving
      {
        material: 'stone',
        width: 5.2,
        points: [
          { x: -6.0, z: 1.5 },
          { x: 0.0, z: -2.5 },
          { x: 6.0, z: 1.5 },
          { x: 0.0, z: 5.5 },
          { x: -6.0, z: 1.5 },
        ],
      },
    ],
  },

  meadow: {
    id: 'meadow',
    nameZh: '翡翠微風草原',
    nameEn: 'Emerald Breeze Meadow',
    subtitleZh: '綠意盎然的原野・推薦 Lv. 2–7',
    levelRange: 'Lv. 2–7',
    music: 'field',
    battleBackdrop: 'meadow',
    skyColor: '#7dd3fc',
    fogColor: '#bae6fd',
    ambientColor: '#f0fdf4',
    bounds: { minX: -26, maxX: 26, minZ: -26, maxZ: 26 },
    terrainBase: 'terrain_grass_meadow',
    portals: [
      {
        id: 'gate_meadow_to_dawnleaf',
        nameZh: '西門 ➔ 返回 晨曦鎮',
        targetZone: 'dawnleaf',
        x: -24.5,
        z: 0.0,
        radius: 2.2,
        targetSpawn: { x: 20.5, z: 0.0, facing: 'left' },
        color: '#fbbf24',
      },
    ],
    buildings: [
      {
        id: 'verdant_shrine',
        nameZh: '翠葉神祠',
        kind: 'shrine_grass',
        x: 18.5,
        z: -2.5,
        w: 5.6,
        d: 4.8,
        h: 4.5,
        signZh: 'VERDANT SHRINE',
      },
    ],
    props: [
      { kind: 'tree_oak', x: -14.0, z: -12.0, scale: 1.15 },
      { kind: 'tree_oak', x: -8.0, z: -16.0, scale: 1.05 },
      { kind: 'tree_oak', x: 4.0, z: -14.0, scale: 1.2 },
      { kind: 'tree_oak', x: 12.0, z: -15.0, scale: 1.1 },
      { kind: 'tree_oak', x: -10.0, z: 14.0, scale: 1.1 },
      { kind: 'tree_oak', x: 2.0, z: 16.0, scale: 1.25 },
      { kind: 'tree_oak', x: 14.0, z: 12.0, scale: 1.15 },
      { kind: 'tree_oak', x: 22.0, z: -10.0, scale: 1.2 },
    ],
    tallGrass: [
      { id: 'mg1', x: -12.5, z: -4.5, rx: 4.2, rz: 3.6, color: '#16a34a' },
      { id: 'mg2', x: -4.0, z: 7.5, rx: 4.5, rz: 3.8, color: '#15803d' },
      { id: 'mg3', x: 6.5, z: -6.5, rx: 4.4, rz: 3.6, color: '#16a34a' },
      { id: 'mg4', x: 10.5, z: 6.5, rx: 4.8, rz: 4.0, color: '#15803d' },
      { id: 'mg5', x: 18.0, z: 8.5, rx: 3.8, rz: 3.2, color: '#22c55e' },
      { id: 'mg6', x: -2.0, z: -10.5, rx: 4.2, rz: 3.4, color: '#16a34a' },
    ],
    encounters: [
      { speciesId: 'eevee', weight: 30, minLv: 2, maxLv: 5 },
      { speciesId: 'jigglypuff', weight: 25, minLv: 2, maxLv: 5 },
      { speciesId: 'meowth', weight: 23, minLv: 3, maxLv: 6 },
      { speciesId: 'pikachu', weight: 12, minLv: 3, maxLv: 6 },
      { speciesId: 'bulbasaur', weight: 10, minLv: 4, maxLv: 6 },
    ],
    roads: [
      {
        material: 'dirt',
        width: 3.0,
        points: [
          { x: -24.5, z: 0.0 },
          { x: -10.0, z: 0.5 },
          { x: 0.0, z: -1.0 },
          { x: 10.0, z: 1.0 },
          { x: 17.0, z: 0.0 },
        ],
      },
    ],
  },

  coast: {
    id: 'coast',
    nameZh: '蔚藍潮汐海岸',
    nameEn: 'Azure Tide Coast',
    subtitleZh: '碧海金沙的港灣・推薦 Lv. 6–11',
    levelRange: 'Lv. 6–11',
    music: 'field',
    battleBackdrop: 'coast',
    skyColor: '#38bdf8',
    fogColor: '#a5f3fc',
    ambientColor: '#ecfeff',
    bounds: { minX: -26, maxX: 26, minZ: -26, maxZ: 26 },
    terrainBase: 'terrain_sand_coast',
    portals: [
      {
        id: 'gate_coast_to_dawnleaf',
        nameZh: '北門 ➔ 返回 晨曦鎮',
        targetZone: 'dawnleaf',
        x: 0.0,
        z: -24.5,
        radius: 2.2,
        targetSpawn: { x: 0.0, z: 20.5, facing: 'up' },
        color: '#fbbf24',
      },
    ],
    buildings: [
      {
        id: 'tidal_lighthouse',
        nameZh: '潮汐燈塔',
        kind: 'lighthouse',
        x: 12.5,
        z: 12.5,
        w: 4.8,
        d: 4.8,
        h: 8.5,
        signZh: 'TIDAL TOWER',
      },
    ],
    props: [
      { kind: 'tree_palm', x: -16.0, z: -10.0, scale: 1.1 },
      { kind: 'tree_palm', x: -10.0, z: -6.0, scale: 1.15 },
      { kind: 'tree_palm', x: 8.0, z: -12.0, scale: 1.2 },
      { kind: 'tree_palm', x: 16.0, z: -8.0, scale: 1.05 },
      { kind: 'tree_palm', x: -14.0, z: 10.0, scale: 1.2 },
      { kind: 'tree_palm', x: 4.0, z: 15.0, scale: 1.15 },
    ],
    tallGrass: [
      { id: 'cg1', x: -10.5, z: -4.5, rx: 4.4, rz: 3.4, color: '#0d9488' },
      { id: 'cg2', x: 6.5, z: -2.5, rx: 4.2, rz: 3.4, color: '#14b8a6' },
      { id: 'cg3', x: -12.5, z: 12.5, rx: 4.5, rz: 3.6, color: '#0f766e' },
      { id: 'cg4', x: -2.0, z: 8.5, rx: 4.0, rz: 3.2, color: '#0d9488' },
      { id: 'cg5', x: 10.5, z: 2.5, rx: 4.2, rz: 3.6, color: '#14b8a6' },
    ],
    encounters: [
      { speciesId: 'magikarp', weight: 28, minLv: 5, maxLv: 10 },
      { speciesId: 'squirtle', weight: 24, minLv: 6, maxLv: 9 },
      { speciesId: 'sylveon', weight: 22, minLv: 7, maxLv: 10 },
      { speciesId: 'lapras', weight: 16, minLv: 8, maxLv: 11 },
      { speciesId: 'gyarados', weight: 10, minLv: 11, maxLv: 13 },
    ],
    roads: [
      {
        material: 'dirt',
        width: 3.0,
        points: [
          { x: 0.0, z: -24.5 },
          { x: 0.0, z: -10.0 },
          { x: 4.0, z: 0.0 },
          { x: 8.0, z: 8.0 },
          { x: 12.0, z: 11.0 },
        ],
      },
    ],
  },

  canyon: {
    id: 'canyon',
    nameZh: '赤焰熔岩峽谷',
    nameEn: 'Ember Crag Canyon',
    subtitleZh: '炙熱紅岩與武道修行場・推薦 Lv. 10–16',
    levelRange: 'Lv. 10–16',
    music: 'field',
    battleBackdrop: 'canyon',
    skyColor: '#fb923c',
    fogColor: '#fed7aa',
    ambientColor: '#fff1e6',
    bounds: { minX: -26, maxX: 26, minZ: -26, maxZ: 26 },
    terrainBase: 'terrain_rock_canyon',
    portals: [
      {
        id: 'gate_canyon_to_dawnleaf',
        nameZh: '東門 ➔ 返回 晨曦鎮',
        targetZone: 'dawnleaf',
        x: 24.5,
        z: 0.0,
        radius: 2.2,
        targetSpawn: { x: -20.5, z: 0.0, facing: 'right' },
        color: '#fbbf24',
      },
    ],
    buildings: [
      {
        id: 'blaze_dojo',
        nameZh: '烈焰武館',
        kind: 'dojo_fire',
        x: -14.5,
        z: 0.0,
        w: 6.2,
        d: 5.6,
        h: 4.8,
        signZh: 'BLAZE DOJO',
      },
    ],
    props: [
      { kind: 'tree_pine', x: 14.0, z: -14.0, scale: 1.1 },
      { kind: 'tree_pine', x: 6.0, z: -16.0, scale: 1.2 },
      { kind: 'tree_pine', x: -6.0, z: -14.0, scale: 1.15 },
      { kind: 'tree_pine', x: 12.0, z: 14.0, scale: 1.1 },
      { kind: 'tree_pine', x: 2.0, z: 15.0, scale: 1.25 },
      { kind: 'tree_pine', x: -10.0, z: 12.0, scale: 1.1 },
    ],
    tallGrass: [
      { id: 'eg1', x: 12.5, z: -4.5, rx: 4.2, rz: 3.4, color: '#c2410c' },
      { id: 'eg2', x: 4.0, z: 6.5, rx: 4.5, rz: 3.6, color: '#ea580c' },
      { id: 'eg3', x: -4.5, z: -7.5, rx: 4.2, rz: 3.4, color: '#b45309' },
      { id: 'eg4', x: -6.5, z: 8.5, rx: 4.4, rz: 3.6, color: '#c2410c' },
      { id: 'eg5', x: 2.5, z: -2.0, rx: 3.6, rz: 2.8, color: '#ea580c' },
    ],
    encounters: [
      { speciesId: 'growlithe', weight: 30, minLv: 9, maxLv: 13 },
      { speciesId: 'charmander', weight: 24, minLv: 10, maxLv: 14 },
      { speciesId: 'riolu', weight: 24, minLv: 10, maxLv: 14 },
      { speciesId: 'arcanine', weight: 12, minLv: 13, maxLv: 15 },
      { speciesId: 'lucario', weight: 10, minLv: 14, maxLv: 16 },
    ],
    roads: [
      {
        material: 'dirt',
        width: 3.0,
        points: [
          { x: 24.5, z: 0.0 },
          { x: 8.0, z: -1.0 },
          { x: -2.0, z: 1.0 },
          { x: -12.0, z: 0.0 },
        ],
      },
    ],
  },

  twilight: {
    id: 'twilight',
    nameZh: '幽影星輝神殿',
    nameEn: 'Twilight Starlight Sanctuary',
    subtitleZh: '水晶秘林與星輝祭壇・推薦 Lv. 15–22',
    levelRange: 'Lv. 15–22',
    music: 'twilight',
    battleBackdrop: 'twilight',
    skyColor: '#4c1d95',
    fogColor: '#6d28d9',
    ambientColor: '#ede9fe',
    bounds: { minX: -26, maxX: 26, minZ: -26, maxZ: 26 },
    terrainBase: 'terrain_stone_twilight',
    portals: [
      {
        id: 'gate_twilight_to_dawnleaf',
        nameZh: '南門 ➔ 返回 晨曦鎮',
        targetZone: 'dawnleaf',
        x: 0.0,
        z: 24.5,
        radius: 2.2,
        targetSpawn: { x: 0.0, z: -20.5, facing: 'down' },
        color: '#fbbf24',
      },
    ],
    buildings: [
      {
        id: 'starlight_altar',
        nameZh: '星輝祭壇',
        kind: 'altar',
        x: 0.0,
        z: -14.5,
        w: 6.8,
        d: 5.2,
        h: 4.8,
        signZh: 'STARLIGHT ALTAR',
      },
    ],
    props: [
      { kind: 'crystal_twilight', x: -14.0, z: -10.0, scale: 1.1 },
      { kind: 'crystal_twilight', x: 14.0, z: -10.0, scale: 1.1 },
      { kind: 'crystal_twilight', x: -8.0, z: -16.0, scale: 1.2 },
      { kind: 'crystal_twilight', x: 8.0, z: -16.0, scale: 1.2 },
      { kind: 'crystal_twilight', x: -12.0, z: 10.0, scale: 1.15 },
      { kind: 'crystal_twilight', x: 12.0, z: 10.0, scale: 1.15 },
    ],
    tallGrass: [
      { id: 'tg1', x: -10.5, z: -4.5, rx: 4.4, rz: 3.4, color: '#7e22ce' },
      { id: 'tg2', x: 10.5, z: -4.5, rx: 4.4, rz: 3.4, color: '#6b21a8' },
      { id: 'tg3', x: -8.5, z: 8.5, rx: 4.2, rz: 3.4, color: '#7e22ce' },
      { id: 'tg4', x: 8.5, z: 8.5, rx: 4.2, rz: 3.4, color: '#6b21a8' },
      { id: 'tg5', x: 0.0, z: 2.5, rx: 4.0, rz: 3.0, color: '#9333ea' },
    ],
    encounters: [
      { speciesId: 'haunter', weight: 28, minLv: 14, maxLv: 17 },
      { speciesId: 'gardevoir', weight: 22, minLv: 15, maxLv: 18 },
      { speciesId: 'gengar', weight: 18, minLv: 16, maxLv: 19 },
      { speciesId: 'venusaur', weight: 8, minLv: 16, maxLv: 19 },
      { speciesId: 'charizard', weight: 8, minLv: 16, maxLv: 19 },
      { speciesId: 'blastoise', weight: 8, minLv: 16, maxLv: 19 },
      { speciesId: 'dragonite', weight: 8, minLv: 18, maxLv: 21 },
    ],
    roads: [
      {
        material: 'stone',
        width: 3.6,
        points: [
          { x: 0.0, z: 24.5 },
          { x: 0.0, z: 10.0 },
          { x: 0.0, z: -12.0 },
        ],
      },
    ],
  },
};

applyWorldExpansions(MAP_ZONES);
addAuthoredWorldRegions(MAP_ZONES);
for (const [zone,regions] of Object.entries(WORLD_ART_REGIONS)) MAP_ZONES[zone].terrainRegions=regions;
installMosswoodForest(MAP_ZONES);
installTrailExits(MAP_ZONES);
applyWorldPolish(MAP_ZONES);
installWorldAdventure(MAP_ZONES,findNearestWalkablePosition);
applyCelForestPrototype(MAP_ZONES);
applyPremiumCrossingPrototype(MAP_ZONES);

export const ZONES = MAP_ZONES;

export function getMap(zoneId) {
  return MAP_ZONES[zoneId] || MAP_ZONES.dawnleaf;
}

export function getZoneAt(x, z, activeZoneId) {
  if (activeZoneId) return activeZoneId;
  if (z < -14) return 'twilight';
  if (z > 14) return 'coast';
  if (x < -14) return 'canyon';
  if (x > 14) return 'meadow';
  return 'dawnleaf';
}

export function getGroundElevation(x, z, zoneId = 'dawnleaf') {
  if (zoneId === 'twilight' && z < -10) return 0.85;
  if (zoneId === 'canyon' && x < -10) return 0.65;
  if (zoneId === 'coast' && z > 8) return -0.35;
  return 0;
}

export function getPortalAt(x, z, zoneId = 'dawnleaf') {
  const map = getMap(zoneId);
  if (!map || !map.portals) return null;
  for (const p of map.portals) {
    const dist = Math.hypot(x - p.x, z - p.z);
    if (dist <= Math.min(p.radius, 1.35)) {
      return p;
    }
  }
  return null;
}

export function getTallGrassAt(x, z, zoneId = 'dawnleaf') {
  const map = getMap(zoneId);
  if (!map || !map.tallGrass) return null;
  for(const road of map.roads || []) {
    for(let i=1;i<road.points.length;i++) {
      const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz || 1)));
      if(Math.hypot(x-a.x-t*dx,z-a.z-t*dz)<road.width/2+.4) return null;
    }
  }
  for (const patch of map.tallGrass) {
    const dx = (x - patch.x) / patch.rx;
    const dz = (z - patch.z) / patch.rz;
    if (dx * dx + dz * dz <= 1.0) {
      return patch;
    }
  }
  return null;
}

export function isPositionWalkable(x, z, zoneId = 'dawnleaf') {
  const map = getMap(zoneId);
  if (!map) return false;

  const b = map.bounds;
  if (x < b.minX + 1.2 || x > b.maxX - 1.2) return false;
  if (z < b.minZ + 1.2 || z > b.maxZ - 1.2) return false;
  if ((map.terrainRegions || []).some(region=>region.blocked && insideTerrainRegion(x,z,region))) return false;

  // Town fountain collision in dawnleaf
  if (zoneId === 'dawnleaf') {
    const fdx = x - 0;
    const fdz = z - 1.5;
    if ((fdx/1.8)**2 + (fdz/1.0)**2 < 1) return false;
  }

  // Building collision footprints
  // Painted trunks have narrow solid roots; broad canopies remain passable.
  for (const prop of map.props || []) {
    const scale=prop.scale || 1,lx=(x-prop.x)/scale,lz=(z-prop.z)/scale;
    if(prop.footprint && insideTerrainRegion(lx,lz,prop.footprint))return false;
    for(const shape of prop.colliders || []) {
      if(((lx-shape.dx)/shape.rx)**2+((lz-shape.dz)/shape.rz)**2<1)return false;
    }
    const radius=prop.kind==='crystal_twilight' ? .7 : ['tree_oak','tree_pine','tree_palm'].includes(prop.kind) ? .48 : 0;
    if (radius && Math.hypot(x-prop.x,z-prop.z) < radius*(prop.scale || 1)) return false;
  }
  // Physical road signs sit beside the route, leaving its centre traversable.
  for (const portal of map.portals || []) {
    if(portal.appearance==='trail'){
      if(Math.hypot(x-portal.sign.x,z-portal.sign.z)<.2)return false;
      continue;
    }
    for (const side of [-1,1]) {
      if (Math.hypot(x-(portal.x+side*1.45),z-(portal.z-.65)) < .38) return false;
    }
  }

  // Building collision footprints
  if (map.buildings) {
    for (const bld of map.buildings) {
      if (bld.kind === 'fountain') continue;
      const halfW = bld.w * 0.5 + 0.45;
      const halfD = bld.d * 0.5 + 0.45;
      if (Math.abs(x - bld.x) < halfW && Math.abs(z - bld.z) < halfD) {
        return false;
      }
    }
  }

  return true;
}

export function findNearestWalkablePosition(x,z,zoneId='dawnleaf') {
  if (isPositionWalkable(x,z,zoneId)) return {x,z};
  for (let radius=.5;radius<=12;radius+=.5) {
    const samples=Math.ceil(2*Math.PI*radius/.5);
    for(let i=0;i<samples;i++) {
      const angle=i/samples*Math.PI*2;
      const nx=x+Math.cos(angle)*radius,nz=z+Math.sin(angle)*radius;
      if(isPositionWalkable(nx,nz,zoneId)) return {x:Number(nx.toFixed(3)),z:Number(nz.toFixed(3))};
    }
  }
  return {x:0,z:6};
}

export function rollWildEncounter(zoneId, rng = Math.random) {
  const map = getMap(zoneId);
  if (!map || !map.encounters || map.encounters.length === 0) return null;
  const totalWeight = map.encounters.reduce((acc, e) => acc + e.weight, 0);
  let pick = rng() * totalWeight;
  let chosen = map.encounters[0];
  for (const entry of map.encounters) {
    pick -= entry.weight;
    if (pick <= 0) {
      chosen = entry;
      break;
    }
  }
  const level = chosen.minLv + Math.floor(rng() * (chosen.maxLv - chosen.minLv + 1));
  return {
    speciesId: chosen.speciesId,
    level,
  };
}

export const BUILDINGS = MAP_ZONES.dawnleaf.buildings;
export const TALL_GRASS_PATCHES = Object.values(MAP_ZONES).flatMap((m) => m.tallGrass || []);
export const WORLD_BOUNDS = MAP_ZONES.dawnleaf.bounds;
