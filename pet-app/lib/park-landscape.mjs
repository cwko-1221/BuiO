// Compatibility helpers derive solely from the authored v4 layout.
// No coordinates are measured from or scaled against a generated bitmap.
import { PARK_PATHS, PARK_COURTS, RIVER_CENTER, RIVER_HALF_WIDTH, RIVER_POLYGON, PARK_BRIDGES, MAIN_PATH_WIDTH, curve, inCourt } from './park-layout-v4.mjs';
import { createWalkmesh } from './park-walkmesh.mjs';
export const gardenCurve = curve;
export const GARDEN_ROAD_WIDTH = MAIN_PATH_WIDTH;
export const GARDEN_ROADS = PARK_PATHS.filter(path => path.width >= MAIN_PATH_WIDTH).map(path => path.points);
export const GARDEN_TRAILS = PARK_PATHS.filter(path => path.width < MAIN_PATH_WIDTH).map(path => path.points);
export const GARDEN_COURTS = PARK_COURTS;
export const CREEK_WIDTH = RIVER_HALF_WIDTH * 2;
export const CREEK = RIVER_CENTER;
export const GARDEN_BRIDGES = PARK_BRIDGES.map(bridge => ({ ...bridge, a: { x: bridge.x, y: bridge.y + bridge.height / 2 }, b: { x: bridge.x + bridge.width, y: bridge.y + bridge.height / 2 }, halfWidth: bridge.height / 2 }));
const terrain = createWalkmesh({ bounds: { x: -1000, y: -1000, width: 8000, height: 8000 }, actorRadius: 0,
  water: [{ kind: 'polygon', points: RIVER_POLYGON }], bridges: PARK_BRIDGES, solids: PARK_BRIDGES.flatMap(bridge => bridge.rails) });
export function segmentDistanceSquared(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
  return (point.x - a.x - dx * t) ** 2 + (point.y - a.y - dy * t) ** 2;
}
export function nearGardenPath(point, paths, distance) {
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    if (point.x < Math.min(a.x, b.x) - distance || point.x > Math.max(a.x, b.x) + distance || point.y < Math.min(a.y, b.y) - distance || point.y > Math.max(a.y, b.y) + distance) continue;
    if (segmentDistanceSquared(point, a, b) < distance ** 2) return true;
  }
  return false;
}
export const inGardenCourt = inCourt;
export function onGardenBridge(point) { return terrain.classify(point).reason === 'bridge'; }
export function inCreek(point) { return terrain.classify(point).reason === 'water'; }
