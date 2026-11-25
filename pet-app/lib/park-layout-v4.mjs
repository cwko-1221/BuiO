// Authored scene geometry. Renderer, navigation and foot collision share this data.
// Units are world pixels; material textures are never a whole enlarged map.
export const PARK_WORLD = { width: 5120, height: 3584, cell: 64, speed: 290, spawn: { x: 1220, y: 2850 } };
export const FOOT_RADIUS = 18;
const p = list => list.map(([x, y]) => ({ x, y }));
export function curve(controls, spacing = 48) {
  const output = [];
  for (let i = 0; i < controls.length - 1; i++) {
    const a = controls[Math.max(0, i - 1)], b = controls[i], c = controls[i + 1], d = controls[Math.min(controls.length - 1, i + 2)];
    const steps = Math.max(2, Math.ceil(Math.hypot(c.x - b.x, c.y - b.y) / spacing));
    for (let j = 0; j < steps; j++) {
      const t = j / steps, t2 = t * t, t3 = t2 * t;
      const at = k => .5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2 + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3);
      output.push({ x: at('x'), y: at('y') });
    }
  }
  output.push({ ...controls.at(-1) }); return output;
}
export const MAIN_PATH_WIDTH = 214;
export const PARK_PATHS = [
  { id: 'home-plaza', width: MAIN_PATH_WIDTH, points: curve(p([[1350, 2730], [1820, 2710], [2100, 2660], [2220, 2660], [2840, 2660], [3210, 2740], [3540, 2740]])) },
  { id: 'forest-garden', width: MAIN_PATH_WIDTH, points: curve(p([[1570, 1120], [1960, 1120], [2220, 1120], [2840, 1120], [3220, 1130], [3570, 1200]])) },
  { id: 'woodland-lane', width: MAIN_PATH_WIDTH, points: curve(p([[1320, 2520], [1190, 2160], [1110, 1850], [1270, 1480], [1450, 1150]])) },
  { id: 'garden-lane', width: MAIN_PATH_WIDTH, points: curve(p([[3990, 2360], [4190, 2090], [4240, 1840], [4180, 1650], [4050, 1480]])) },
  { id: 'woodland-loop', width: 154, points: curve(p([[1450, 1100], [1090, 950], [1030, 650], [1420, 520], [1910, 650], [2010, 1110], [1840, 1530], [1370, 1580], [1100, 1390], [1160, 1190], [1450, 1100]])) },
  { id: 'garden-workwalk', width: 156, points: curve(p([[3200, 1130], [3220, 800], [3490, 760], [3820, 760], [4150, 760], [4440, 900], [4510, 1220], [4440, 1580], [4080, 1630]])) },
  { id: 'pond-walk', width: 146, points: curve(p([[4440, 900], [4480, 820]])) },
  { id: 'waterworks-walk', width: 140, points: curve(p([[4490, 1270], [4590, 1280], [4700, 1270]])) },
  { id: 'home-porch', width: 152, points: curve(p([[1230, 2720], [1110, 2680], [1000, 2655]])) },
];
export const PARK_COURTS = [
  { id: 'home', x: 1230, y: 2740, rx: 600, ry: 350, material: 'stone' },
  { id: 'plaza', x: 3850, y: 2760, rx: 900, ry: 590, material: 'stone' },
  { id: 'garden', x: 3880, y: 1200, rx: 690, ry: 430, material: 'stone' },
  { id: 'forest', x: 1450, y: 1090, rx: 470, ry: 265, material: 'soil' },
];
export const RIVER_CENTER = curve(p([[2500, -100], [2450, 400], [2520, 800], [2520, 1120], [2510, 1420], [2460, 1810], [2520, 2200], [2520, 2660], [2480, 3100], [2520, 3700]]));
export const RIVER_HALF_WIDTH = 135;
export function ribbon(points, halfWidth) {
  const a = [], b = [];
  for (let i = 0; i < points.length; i++) {
    const before = points[Math.max(0, i - 1)], after = points[Math.min(points.length - 1, i + 1)], length = Math.hypot(after.x - before.x, after.y - before.y) || 1;
    const nx = -(after.y - before.y) / length, ny = (after.x - before.x) / length;
    a.push({ x: points[i].x + nx * halfWidth, y: points[i].y + ny * halfWidth });
    b.push({ x: points[i].x - nx * halfWidth, y: points[i].y - ny * halfWidth });
  }
  return [...a, ...b.reverse()];
}
export const RIVER_POLYGON = ribbon(RIVER_CENTER, RIVER_HALF_WIDTH);
const deck = (id, y, material) => ({ id, x: 2200, y, width: 640, height: 240, material,
  deck: p([[2200, y], [2840, y], [2840, y + 240], [2200, y + 240]]),
  rails: [{ kind: 'rect', x: 2200, y, width: 640, height: 28 }, { kind: 'rect', x: 2200, y: y + 212, width: 640, height: 28 }],
});
export const PARK_BRIDGES = [deck('wood', 1000, 'wood'), deck('stone', 2540, 'stone')];
export const PARK_RIVER_ROCKS = [5,11,17,25,32,39,46,53,61,69,77].flatMap((index,i) => {
  const at=RIVER_CENTER[Math.min(index,RIVER_CENTER.length-1)];
  if(PARK_BRIDGES.some(b=>at.y>b.y-170&&at.y<b.y+b.height+170))return[];
  return [-1,1].map(side=>({id:`shore-${i}-${side}`,x:at.x+side*(RIVER_HALF_WIDTH+24+(i%3)*8),y:at.y+(side===1?43:0),width:138+(i%4)*14,flip:(i+side)%2===0,footprint:{rx:48+(i%4)*4,ry:25,dy:-8}}));
});
export const GARDEN_PLOTS = [
  { id: 'sun', x: 3360, y: 470, width: 260, height: 180, at: { x: 3490, y: 730 } },
  { id: 'moon', x: 3690, y: 470, width: 260, height: 180, at: { x: 3820, y: 730 } },
  { id: 'star', x: 4020, y: 470, width: 260, height: 180, at: { x: 4150, y: 730 } },
];
const footprint = (rx, ry, dy = 0) => ({ rx, ry, dy });
export const PARK_OBJECT_PLACEMENTS = {
  'home-door': { x: 850, y: 2450, at: { x: 1000, y: 2655 }, footprint: footprint(265, 116, -90) },
  post: { x: 1280, y: 2670, at: { x: 1230, y: 2860 } },
  mailbox: { x: 1580, y: 2610, at: { x: 1580, y: 2710 }, footprint: footprint(37, 28, -12) },
  'home-bench': { x: 1650, y: 2920, at: { x: 1650, y: 3025 }, footprint: footprint(110, 34, -20) },
  'home-sign': { x: 1360, y: 2280, at: { x: 1240, y: 2330 }, footprint: footprint(40, 26, -15) },
  merchant: { x:3610,y:2910,at:{x:3610,y:3060} },
  eco: { x:4070,y:3000,at:{x:4070,y:3160} },
  bear: { x: 3420, y: 2460, at: { x: 3420, y: 2650 } },
  board: { x: 3150, y: 2580, at: { x: 3150, y: 2680 }, footprint: footprint(80, 27, -14) },
  fountain: { x: 3810, y: 2720, at: { x: 3810, y: 2550 }, footprint: footprint(196, 82) },
  'plaza-bench': { x: 3830, y: 3080, at: { x: 3830, y: 3190 }, footprint: footprint(110, 34, -20) },
  chime: { x: 3830, y: 2310, at: { x: 3980, y: 2410 }, footprint: footprint(80, 30, -12) },
  drum: { x: 4310, y: 2600, at: { x: 4310, y: 2690 }, footprint: footprint(50, 26, -10) },
  bell: { x: 4470, y: 2800, at: { x: 4470, y: 2900 }, footprint: footprint(68, 27, -12) },
  'plaza-sign': { x: 2920, y: 2840, at: { x: 2970, y: 2740 }, footprint: footprint(40, 26, -15) },
  deer: { x: 3660, y: 1040, at: { x: 3660, y: 1230 } },
  'flowers-a': { x: 3440, y: 1330, at: { x: 3440, y: 1440 }, footprint: footprint(140, 49) },
  'flowers-b': { x: 3880, y: 1440, at: { x: 3880, y: 1550 }, footprint: footprint(140, 49) },
  'flowers-c': { x: 4240, y: 1220, at: { x: 4240, y: 1330 }, footprint: footprint(140, 49) },
  apple: { x: 3060, y: 620, at: { x: 3170, y: 810 }, solid: 66 },
  'garden-bench': { x: 4320, y: 1520, at: { x: 4320, y: 1630 }, footprint: footprint(110, 34, -20) },
  pond: { x: 4510, y: 600, at: { x: 4480, y: 820 }, footprint: footprint(220, 110) },
  'garden-sign': { x: 4140, y: 1740, at: { x: 4140, y: 1830 }, footprint: footprint(40, 26, -15) },
  squirrel: { x: 1430, y: 1010, at: { x: 1330, y: 1190 } },
  'acorn-a': { x: 1110, y: 930 }, 'acorn-b': { x: 1560, y: 570 }, 'acorn-c': { x: 1960, y: 1130 },
  'litter-a': { x: 1210, y: 1450 }, 'litter-b': { x: 1620, y: 1540 }, 'litter-c': { x: 1950, y: 1430 },
  'forest-sign': { x: 1290, y: 1790, at: { x: 1135, y: 1830 }, footprint: footprint(40, 26, -15) },
  hollow: { x: 890, y: 720, at: { x: 1050, y: 870 }, solid: 88 },
  log: { x: 1810, y: 1670, at: { x: 1810, y: 1775 }, footprint: footprint(110, 35, -20) },
  mushrooms: { x: 2180, y: 710, at: { x: 2030, y: 800 }, footprint: footprint(70, 27, -10) },
  sluice: { x: 4700, y: 1140, at: { x: 4700, y: 1270 }, footprint: footprint(110, 50, -23) },
  'banana-game': { x: 3340, y: 3110, at: { x: 3340, y: 3215 }, footprint: footprint(120, 54, -40) },
  'sky-game': { x: 4340, y: 3110, at: { x: 4340, y: 3215 }, footprint: footprint(83, 48, -35) },
  'plaza-cottage-a': { x: 3110, y: 2220, at: { x: 3110, y: 2425 }, footprint: footprint(265, 116, -90) },
  'plaza-cottage-b': { x: 4680, y: 2350, at: { x: 4680, y: 2555 }, footprint: footprint(265, 116, -90) },
};
export function pathDistanceSquared(point, paths = PARK_PATHS) {
  let result = Infinity;
  for (const path of paths) for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1], b = path.points[i], dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length)) : 0;
    result = Math.min(result, (point.x - a.x - dx * t) ** 2 + (point.y - a.y - dy * t) ** 2);
  }
  return result;
}
export function inCourt(point, padding = 0) { return PARK_COURTS.some(c => ((point.x - c.x) / (c.rx + padding)) ** 2 + ((point.y - c.y) / (c.ry + padding)) ** 2 < 1); }
function scenery() {
  const trees = [[270,350],[520,300],[760,285],[1160,300],[1620,285],[2030,330],[2100,570],[270,720],[440,1050],[680,1300],[370,1570],[620,1810],[850,1990],[440,2200],[310,2550],[370,2990],[700,3260],[1110,3320],[1590,3280],[2020,3250],[2160,3000],[2050,2350],[2040,1880],[1780,1940],[1920,865],[1660,815],[2820,330],[3060,300],[3440,280],[3850,250],[4260,260],[4750,300],[4880,690],[4890,1510],[4720,1850],[4470,1960],[4800,2830],[4780,3270],[4360,3370],[3920,3390],[3500,3370],[3010,3290],[2850,3030],[2910,1900],[3110,1840]];
  const bushes = [[390,450],[620,490],[840,320],[2050,450],[520,1450],[850,1540],[750,1830],[1750,1800],[2020,1570],[480,2350],[650,2870],[1010,3130],[1740,3150],[1940,2810],[1970,2180],[2020,1940],[2120,1350],[2160,800],[2890,760],[2940,1310],[3110,1530],[3310,1760],[3580,1740],[4710,1470],[4790,900],[2880,2400],[2910,2900],[3090,3160],[3650,3330],[4000,3350],[4580,3100],[4820,2650],[4570,2070],[3510,2020],[3740,2050],[2870,1580]];
  const result = [...trees.map(([x,y],i) => ({x,y,kind:'tree',variant:i%3,scale:.8+(i%4)*.07,solid:46})), ...bushes.map(([x,y],i)=>({x,y,kind:'bush',variant:i%3,scale:.82+(i%3)*.09,solid:0,footprint:footprint(78,32,-16)}))];
  return result.filter(s => !inCourt(s, 35) && pathDistanceSquared(s) > (s.kind === 'tree' ? 185 : 145) ** 2
    && !Object.values(PARK_OBJECT_PLACEMENTS).some(o => Math.hypot(s.x-o.x,s.y-o.y) < (s.kind === 'tree' ? 230 : 160)));
}
export const PARK_SCENERY = scenery();
export const LANDSCAPE_BEDS = [
  { id:'cottage-border', x:780,y:2180,rx:290,ry:130 },
  { id:'woods-island', x:1570,y:810,rx:215,ry:125 },
  { id:'garden-island', x:3880,y:1440,rx:160,ry:65 },
];
// Authored low flower borders frame the paths without turning the lawn into a
// repeating texture. Their visible root bands are the same collision ellipses.
export const PARK_PLANTINGS = [
  [1230,3170,480,0],[740,3050,400,1],[540,2790,360,0],[570,2540,320,0],[1570,2390,350,1],
  [3650,2110,420,0],[4090,2080,360,1],[3850,3420,540,0],[3050,3210,400,1],[4650,3230,380,0],[4860,2800,400,0],[2890,3000,360,1],
  [3500,350,340,0],[3900,350,340,1],[4300,350,340,0],[3040,1350,330,1],[4830,1360,340,0],[3790,1740,360,1],[3360,1630,340,0],
  [690,1100,380,0],[1550,1830,360,0],[2110,520,340,1],[1600,280,320,0],[2180,1860,300,0],[2820,1850,310,1],
].map(([x,y,width,variant],i) => ({ id:'border-'+i,x,y,width,asset:variant?'border-lavender':'border-flowers',flip:i%3===1,footprint:footprint(width*.41,30,-13) }))
  .filter(b => {
    const inside = q => ((q.x-b.x)/(b.footprint.rx+FOOT_RADIUS+4))**2 + ((q.y-b.y-b.footprint.dy)/(b.footprint.ry+FOOT_RADIUS+4))**2 < 1;
    return !PARK_PATHS.some(path=>path.points.some(inside)) && !Object.values(PARK_OBJECT_PLACEMENTS).some(o=>inside(o.at||{x:o.x,y:o.y+45}));
  });
