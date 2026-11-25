import {QUEST_REWARDS} from './park-economy.mjs';
export {PARK_ECONOMY} from './park-economy.mjs';
// Shared, deterministic world rules. The authored layout is the only spatial source.
import { PARK_WORLD, FOOT_RADIUS, MAIN_PATH_WIDTH, PARK_PATHS, PARK_COURTS, RIVER_POLYGON, PARK_BRIDGES, PARK_OBJECT_PLACEMENTS, PARK_SCENERY, GARDEN_PLOTS, LANDSCAPE_BEDS, PARK_PLANTINGS, PARK_RIVER_ROCKS, inCourt } from './park-layout-v4.mjs';
import { createWalkmesh } from './park-walkmesh.mjs';
import { nearGardenPath } from './park-landscape.mjs';
export const WORLD = PARK_WORLD;
export const ROAD_WIDTH = MAIN_PATH_WIDTH;
export const ROADS = PARK_PATHS.filter(path => path.width >= MAIN_PATH_WIDTH).map(path => path.points);
export const BRANCHES = PARK_PATHS.filter(path => path.width < MAIN_PATH_WIDTH).map(path => path.points);
export const SCENERY = PARK_SCENERY;
const name = (zh, en) => ({ 'zh-HK': zh, 'en-US': en });
const approach = id => ({ ...PARK_OBJECT_PLACEMENTS[id].at });
export const ZONES = [
  { id: 'home', name: name('家園小徑', 'Home Lane'), x: 0, y: 1950, width: 2560, height: 1634, color: '#c6d8a9', center: approach('post') },
  { id: 'plaza', name: name('星願廣場', 'Wish Plaza'), x: 2560, y: 1950, width: 2560, height: 1634, color: '#d9dfb5', center: approach('bear') },
  { id: 'garden', name: name('四季花園', 'Season Garden'), x: 2560, y: 0, width: 2560, height: 1950, color: '#c6d9b4', center: approach('deer') },
  { id: 'forest', name: name('微光森林', 'Glimmer Woods'), x: 0, y: 0, width: 2560, height: 1950, color: '#aac8ad', center: approach('squirrel') },
];
// Compatibility for the archived wish-plaza renderer; no raster survey survives.
const plazaCourt = PARK_COURTS.find(court => court.id === 'plaza');
export const PLAZA_ART = { x: plazaCourt.x - plazaCourt.rx, y: plazaCourt.y - plazaCourt.ry, width: plazaCourt.rx * 2, height: plazaCourt.ry * 2, scale: 1 };
export const ART_REGIONS = [];
export const PLAZA_TREES = [];
export function inPlazaArt(point) { return point.x >= PLAZA_ART.x && point.x <= PLAZA_ART.x + PLAZA_ART.width && point.y >= PLAZA_ART.y && point.y <= PLAZA_ART.y + PLAZA_ART.height; }
export const HUBS = ZONES.map(zone => ({ id: zone.id, ...zone.center, name: zone.name, next: name('沿步道探索', 'Explore the paths') }));
const object = (id, kind, zh, en, metadata = {}) => {
  const placement = PARK_OBJECT_PLACEMENTS[id];
  if (!placement) throw new Error('Missing authored park placement: ' + id);
  return { id, kind, name: name(zh, en), ...metadata, ...placement,
    ...(placement.at ? { at: { ...placement.at } } : {}),
    ...(placement.footprint ? { footprint: { ...placement.footprint } } : {}) };
};
export const OBJECTS = [
  object('merchant','npc','水獺商人阿陶','Tao the Otter Trader',{species:'merchant',role:name('魚、蘋果與花的收購商','Fish, fruit & flower trader'),line:name('你的收穫都是寶貝！我會按標價收購，金幣直接存進錢包。','Bring your catches and harvests. Coins go straight into your wallet.')}),
  object('eco','npc','環保員栗栗','Hazel the Eco Ranger',{species:'eco',role:name('樂園環保巡查','Park clean-up patrol'),line:name('一起找出樂園裏的垃圾吧。撿好五件，再回來領取獎勵！','Pick up five pieces of litter, then return for your reward!')}),
  object('home-door', 'house', '我的家', 'My home'),
  object('post', 'npc', '郵差兔可可', 'Coco the Post Bunny', { species: 'rabbit', role: name('郵差', 'Post keeper'), line: name('今天也有好消息要送出去！幫我把信送到朋友手上吧。', 'There is good news to deliver! Help me reach our friends.') }),
  object('mailbox', 'mailbox', '紅色信箱', 'Red mailbox'),
  object('home-bench', 'bench', '小徑長椅', 'Lane bench'),
  object('home-sign', 'sign', '家園路牌', 'Home trail marker'),
  object('bear', 'npc', '熊園長波波', 'Bo the Park Keeper', { species: 'bear', role: name('樂園園長', 'Park keeper'), line: name('歡迎來到我們的樂園！沿着步道走，每個轉角都有新朋友。', 'Welcome! Follow the paths: new friends are around every corner.') }),
  object('board', 'board', '每日委託板', 'Daily requests'),
  object('fountain', 'fountain', '星願噴水池', 'Wish fountain'),
  object('plaza-bench', 'bench', '噴泉長椅', 'Fountain bench'),
  object('chime', 'chime', '風鈴琴', 'Wind chimes'),
  object('drum', 'drum', '森林小鼓', 'Forest drum', { games: ['rhythm'] }),
  object('bell', 'bell', '願望鐘', 'Wishing bell', { games: ['lantern'] }),
  object('plaza-sign', 'sign', '廣場路牌', 'Plaza trail marker'),
  object('deer', 'npc', '鹿園丁小葉', 'Fern the Gardener', { species: 'deer', role: name('花園園丁', 'Gardener'), line: name('小小的照顧，也會開出漂亮的花。來看看哪一片花圃需要你。', 'A little care makes lovely flowers. See which beds need your help.') }),
  object('flowers-a', 'flowers', '向日葵花圃', 'Sunflower bed'),
  object('flowers-b', 'flowers', '鬱金香花圃', 'Tulip bed'),
  object('flowers-c', 'flowers', '雛菊花圃', 'Daisy bed'),
  object('apple', 'apple', '蘋果樹', 'Apple tree'),
  object('garden-bench', 'bench', '草地球會', 'Meadow Golf Club', { games: ['golf'] }),
  object('pond', 'pond', '睡蓮池', 'Lily pond', { games: ['fishing'] }),
  object('garden-sign', 'sign', '花園路牌', 'Garden trail marker'),
  object('squirrel', 'npc', '松鼠栗栗', 'Pip the Explorer', { species: 'squirrel', role: name('森林探險員', 'Woodland explorer'), line: name('我把森林的小秘密都記在筆記裏。一起找橡果，或幫步道打掃吧！', 'My notebook is full of woodland secrets. Find acorns or help tidy the trail!') }),
  object('acorn-a', 'acorn', '金色橡果', 'Golden acorn'),
  object('acorn-b', 'acorn', '圓圓橡果', 'Round acorn'),
  object('acorn-c', 'acorn', '葉下橡果', 'Leafy acorn'),
  object('litter-a', 'litter', '步道紙袋', 'Trail paper bag'),
  object('litter-b', 'litter', '草邊回收袋', 'Meadow recycling bag'),
  object('litter-c', 'litter', '橋邊果皮袋', 'Bridge compost bag'),
  object('forest-sign', 'sign', '森林路牌', 'Forest trail marker'),
  object('hollow', 'hollow', '會回聲的樹洞', 'Echo tree'),
  object('log', 'bench', '森林木椅', 'Woodland log'),
  object('mushrooms', 'mushrooms', '發光蘑菇', 'Glimmer mushrooms'),
  object('sluice', 'pump', '花園水道機關', 'Garden waterworks'),
  object('banana-game', 'arcade', '香蕉接接樂', 'Banana Basket', { game: 'banana' }),
  object('sky-game', 'arcade', '寵物天空巡遊', 'Pet Sky Patrol', { game: 'flight' }),
  object('plaza-cottage-a', 'cottage', '樂園小屋', 'Park cottage'),
  object('plaza-cottage-b', 'cottage', '星願小屋', 'Wish cottage'),
];
export const QUESTS = [
  { id: 'letters', npc: 'post', name: name('把好消息送出去', 'Deliver some good news'), description: name('把兩封信送給鹿園丁和松鼠，再回來找郵差兔。', 'Deliver letters to Fern and Pip, then return to Coco.'), reward: QUEST_REWARDS.letters, steps: ['deer', 'squirrel'] },
  { id: 'watering', npc: 'deer', name: name('花園今天很口渴', 'A thirsty garden'), description: name('替三片花圃澆水，再向鹿園丁報告。', 'Water all three flower beds, then report to Fern.'), reward: QUEST_REWARDS.watering, steps: ['flowers-a', 'flowers-b', 'flowers-c'] },
  { id: 'acorns', npc: 'squirrel', name: name('栗栗的橡果收藏', 'Pip’s acorn collection'), description: name('找到三顆橡果，再帶回給松鼠。', 'Find three acorns and bring them back to Pip.'), reward: QUEST_REWARDS.acorns, steps: ['acorn-a', 'acorn-b', 'acorn-c'] },
  { id: 'trail', npc: 'bear', name: name('樂園探路小隊', 'Park trail explorers'), description: name('閱讀家園、花園和森林的路牌，再回到廣場。', 'Read the Home, Garden and Forest markers, then return to Bo.'), reward: QUEST_REWARDS.trail, steps: ['home-sign', 'garden-sign', 'forest-sign'] },
  { id: 'music', npc: 'bear', name: name('廣場的小小樂隊', 'A little plaza band'), description: name('到風鈴重奏旋律、在森林小鼓跟拍，再解開願望鐘的點燈機關。三站三種玩法！', 'Repeat the chimes, drum to the beat, then solve the bell’s lantern puzzle. Three stops, three different games!'), reward: QUEST_REWARDS.music, steps: ['chime', 'drum', 'bell'], requirements: { chime: 'melody', drum: 'rhythm', bell: 'lantern' } },
  { id: 'cleanup', npc: 'squirrel', name: name('讓森林亮起來', 'A brighter woodland'), description: name('收集步道上的三件垃圾，再向松鼠報告。', 'Collect three pieces of trail litter, then report to Pip.'), reward: QUEST_REWARDS.cleanup, steps: ['litter-a', 'litter-b', 'litter-c'] },
  { id: 'parcel', npc: 'post', name: name('失蹤包裹追蹤記', 'The missing parcel'), description: name('先讀信箱內的便條，搜索家園長椅旁的落葉，再去樹洞找回包裹。', 'Read the mailbox note, search the leaves by the home bench, then find the parcel at the echo tree.'), reward: QUEST_REWARDS.parcel, steps: ['mailbox', 'home-bench', 'hollow'], ordered: true, requirements: { 'home-bench': 'search', hollow: 'search' } },
  { id: 'echo', npc: 'squirrel', name: name('森林迷路小郵差', 'The woodland maze'), description: name('調查發光蘑菇，再到老樹洞帶小郵差走過迷宮，把信送到出口。', 'Investigate the mushrooms, then guide a little courier through the echo-tree maze.'), reward: QUEST_REWARDS.echo, steps: ['mushrooms', 'hollow'], ordered: true, requirements: { hollow: 'maze' } },
  { id: 'pipes', npc: 'deer', name: name('救救花園的水道', 'Bring back the water'), description: name('到睡蓮池調查水源，旋轉水道機關的管道，讓水流從左邊入口流到右邊出口。', 'Check the pond, then rotate the pipe tiles to connect the left inlet to the right outlet.'), reward: QUEST_REWARDS.pipes, steps: ['pond', 'sluice'], ordered: true, requirements: { sluice: 'pipes' } },
  { id: 'treasure', npc: 'bear', name: name('三枚符號的寶藏', 'The three-symbol treasure'), description: name('在蘑菇、睡蓮池和森林路牌找出數字，依「蘑菇→睡蓮→樹葉」解開樹洞的密碼。', 'Find numbers at the mushrooms, pond and forest marker. Unlock the echo tree in mushroom–lily–leaf order.'), reward: QUEST_REWARDS.treasure, steps: ['mushrooms', 'pond', 'forest-sign', 'hollow'], requirements: { hollow: 'code' } },
  { id: 'banana', npc: 'post', name: name('為野餐接住香蕉', 'Bananas for the picnic'), description: name('到廣場南邊的香蕉攤玩接接樂，接住至少 8 顆香蕉，避開橡果，再回來報告。', 'Play Banana Basket at the south plaza. Catch at least 8 bananas, avoid acorns, then report back.'), reward: QUEST_REWARDS.banana, steps: ['banana-game'], requirements: { 'banana-game': 'banana' } },
  { id: 'fishing', npc: 'deer', name: name('睡蓮池的新朋友', 'Friends of the lily pond'), description: name('到睡蓮池釣起至少 2 條魚，留意咬鉤時機並控制收線張力，再向鹿園丁分享發現。', 'Catch at least two fish at the pond, watch the bobber and balance the line, then report to Fern.'), reward: QUEST_REWARDS.fishing, steps: ['pond'], requirements: { pond: 'fishing' } },
  { id: 'golf', npc: 'bear', name: name('草地球會初體驗', 'A day at the golf club'), description: name('到花蔭長椅旁的草地球會，拖曳瞄準，完成至少 2 個不同球洞。', 'Visit the Meadow Golf Club, drag to aim and complete at least two different holes.'), reward: QUEST_REWARDS.golf, steps: ['garden-bench'], requirements: { 'garden-bench': 'golf' } },
  { id: 'sky', npc: 'bear', name: name('天空巡遊實習生', 'A trainee sky patroller'), description: name('進入廣場的天空巡遊，用自己的寵物躲避彈幕，擊破至少 6 架敵機，挑戰暴風方舟！', 'Fly your own pet in Sky Patrol. Dodge enemy fire, defeat at least 6 aircraft and face the Storm Ark!'), reward: QUEST_REWARDS.sky, steps: ['sky-game'], requirements: { 'sky-game': 'flight' } },
];
export const CLUES = {
  mushrooms: name('發光蘑菇底下刻着：蘑菇 = 2。', 'Under the glowing mushrooms: mushroom = 2.'),
  pond: name('睡蓮石邊刻着：睡蓮 = 4。', 'On the pond stone: lily = 4.'),
  'forest-sign': name('路牌背面刻着：樹葉 = 3。', 'Behind the forest marker: leaf = 3.'),
  mailbox: name('包裹便條：先找家園長椅的落葉，再到會回聲的老樹。', 'Parcel note: search the leaves by the home bench, then the old echo tree.'),
};
export function activityModes(object, state) {
  if (object.kind === 'flowers') return ['water'];
  if (object.kind === 'acorn') return ['search'];
  if (object.kind === 'litter') return ['sort'];
  if (object.kind === 'chime') return ['melody'];
  if (object.kind === 'pump') return ['pipes'];
  if (object.id === 'home-bench' && state?.quests?.parcel && !state.quests.parcel.completedAt) return ['search'];
  if (object.id === 'hollow') return ['maze', ...(state?.quests?.parcel ? ['search'] : []), ...(state?.quests?.treasure ? ['code'] : [])];
  return [];
}
export const EMOTES = ['hello', 'happy', 'thanks'];
export const INTERACTION_MS = 1000;
const footprintShape = (item, id, scale = 1) => item.footprint ? { kind: 'ellipse', id, x: item.x, y: item.y + (item.footprint.dy || 0) * scale, rx: item.footprint.rx * scale, ry: item.footprint.ry * scale }
  : item.solid ? { kind: 'circle', id, x: item.x, y: item.y, radius: item.solid * scale } : null;
// No padding here: FOOT_RADIUS is applied exactly once by the walkmesh.
export const WORLD_SOLIDS = [
  ...PARK_BRIDGES.flatMap(bridge => bridge.rails.map((rail, i) => ({ ...rail, id: bridge.id + ':rail:' + i }))),
  ...GARDEN_PLOTS.map(plot => ({ kind: 'rect', id: 'plot:' + plot.id, x: plot.x, y: plot.y, width: plot.width, height: plot.height })),
  ...LANDSCAPE_BEDS.map(bed => ({ kind: 'ellipse', id: 'bed:' + bed.id, x: bed.x, y: bed.y, rx: bed.rx, ry: bed.ry })),
  ...PARK_PLANTINGS.map(item => footprintShape(item, item.id)),
  ...PARK_RIVER_ROCKS.map(item => footprintShape(item, item.id)),
  ...OBJECTS.map(item => footprintShape(item, 'object:' + item.id)).filter(Boolean),
  ...SCENERY.map((item, i) => footprintShape(item, 'scenery:' + i, item.scale)).filter(Boolean),
];
export const WORLD_WATER = [{ kind: 'polygon', id: 'river', points: RIVER_POLYGON }];
export const COLLISION_GEOMETRY = { bounds: { x: 100, y: 100, width: WORLD.width - 200, height: WORLD.height - 200 }, actorRadius: FOOT_RADIUS,
  water: WORLD_WATER, solids: WORLD_SOLIDS, bridges: PARK_BRIDGES };
export const WALKMESH = createWalkmesh(COLLISION_GEOMETRY);
export function dailyQuests(day) {
  let seed = 0; for (const char of day) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
  const pool = [...QUESTS];
  for (let i = pool.length - 1; i > 0; i--) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; const j = seed % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, 3);
}
export function zoneAt(point) { return ZONES.find(z => point.x >= z.x && point.x < z.x + z.width && point.y >= z.y && point.y < z.y + z.height) || ZONES[0]; }
export function interactionPoint(object) { return object.at || { x: object.x, y: object.y + (object.kind === 'npc' ? 170 : 45) }; }

export function spawnPoint(others = []) {
  for (let index = 0; index < 150; index++) {
    const angle = index * 2.399963, radius = Math.sqrt(index) * 72;
    const point = { x: Math.round(WORLD.spawn.x + Math.cos(angle) * radius), y: Math.round(WORLD.spawn.y + Math.sin(angle) * radius) };
    if (walkable(point.x, point.y) && others.every(other => Math.hypot(other.x - point.x, other.y - point.y) >= 95)) return point;
  }
  return { ...WORLD.spawn };
}
export function walkable(x, y) { return WALKMESH.contains({ x, y }); }
export function clearLine(from, to) { return WALKMESH.clearSegment(from, to); }
export function safeVisualPosition(current, authoritative, blend = 1) {
  if (!walkable(authoritative?.x, authoritative?.y)) return walkable(current?.x, current?.y) ? { x: current.x, y: current.y } : { ...WORLD.spawn };
  if (!walkable(current?.x, current?.y)) return { x: authoritative.x, y: authoritative.y };
  const amount = Number.isFinite(blend) ? Math.min(1, Math.max(0, blend)) : 1;
  const desired = { x: current.x + (authoritative.x - current.x) * amount, y: current.y + (authoritative.y - current.y) * amount };
  return clearLine(current, desired) ? desired : { x: authoritative.x, y: authoritative.y };
}
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}
export function roadDistance(point, roads = ROADS) {
  let distance = Infinity;
  for (const road of roads) for (let i = 1; i < road.length; i++) distance = Math.min(distance, segmentDistance(point, road[i - 1], road[i]));
  return distance;
}
export function navigationCost(point) {
  if (inCourt(point, -20)) return 1.05;
  if (nearGardenPath(point, ROADS, ROAD_WIDTH / 2)) return 1;
  return nearGardenPath(point, BRANCHES, 76) ? 1.15 : 5;
}
const navCells = new Map(), navEdges = new Map();
const cell = WORLD.cell, columns = WORLD.width / cell, rows = WORLD.height / cell;
const cellKey = (x, y) => y * columns + x;
function nodeInfo(x, y) {
  if (x < 0 || y < 0 || x >= columns || y >= rows) return { walkable: false };
  const id = cellKey(x, y); let info = navCells.get(id);
  if (!info) { const point = { x: (x + .5) * cell, y: (y + .5) * cell }; info = { ...point, walkable: walkable(point.x, point.y), cost: navigationCost(point) }; navCells.set(id, info); }
  return info;
}
function edgeClear(a, b) {
  const first = cellKey(a.x, a.y), second = cellKey(b.x, b.y), id = first < second ? first * (columns * rows) + second : second * (columns * rows) + first;
  let clear = navEdges.get(id);
  if (clear === undefined) { clear = clearLine(nodeInfo(a.x, a.y), nodeInfo(b.x, b.y)); navEdges.set(id, clear); }
  return clear;
}
function lineCost(a, b) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y), count = Math.max(1, Math.ceil(distance / 48));
  let cost = 0;
  for (let i = 1; i <= count; i++) cost += navigationCost({ x: a.x + (b.x - a.x) * i / count, y: a.y + (b.y - a.y) * i / count });
  return distance * cost / count;
}
function push(heap, value) {
  let index = heap.length; heap.push(value);
  while (index) { const parent = (index - 1) >> 1; if (heap[parent].score <= value.score) break; heap[index] = heap[parent]; index = parent; }
  heap[index] = value;
}
function pop(heap) {
  const value = heap[0], tail = heap.pop();
  if (heap.length) { let index = 0;
    while (index * 2 + 1 < heap.length) { let child = index * 2 + 1; if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
      if (tail.score <= heap[child].score) break; heap[index] = heap[child]; index = child; }
    heap[index] = tail;
  }
  return value;
}
export function findPath(from, target) {
  if (!walkable(from?.x, from?.y) || !walkable(target?.x, target?.y)) return [];
  // Preserve safe floats: rounding a near-rail target can push it into a solid.
  const to = { x: target.x, y: target.y };
  if (Math.hypot(from.x - to.x, from.y - to.y) < 180 && clearLine(from, to)) return [to];
  const nodeAt = point => {
    let result, distance = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = Math.floor(point.x / cell) + dx, y = Math.floor(point.y / cell) + dy, info = nodeInfo(x, y);
      const d = Math.hypot(point.x - info.x, point.y - info.y);
      if (d < distance && info.walkable && clearLine(point, info)) { result = { x, y }; distance = d; }
    }
    return result;
  };
  const start = nodeAt(from), goal = nodeAt(to); if (!start || !goal) return [];
  const open = [], best = new Map([[cellKey(start.x, start.y), 0]]); push(open, { ...start, g: 0, score: 0, prev: null });
  let end;
  for (let count = 0; open.length && count < 16000; count++) {
    const current = pop(open);
    if (current.g > best.get(cellKey(current.x, current.y))) continue;
    if (current.x === goal.x && current.y === goal.y) { end = current; break; }
    for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const x = current.x + dx, y = current.y + dy, info = nodeInfo(x, y);
      if (!info.walkable || !edgeClear(current, { x, y })) continue;
      const id = cellKey(x, y), g = current.g + (dx && dy ? Math.SQRT2 : 1) * info.cost;
      if (g >= (best.get(id) ?? Infinity)) continue;
      best.set(id, g); push(open, { x, y, g, score: g + Math.hypot(goal.x - x, goal.y - y), prev: current });
    }
  }
  if (!end) return [];
  const path = [to]; for (let node = end; node; node = node.prev) { const info = nodeInfo(node.x, node.y); path.unshift({ x: info.x, y: info.y }); }
  const smooth = []; let previous = from;
  while (path.length) {
    let cost = 0, selected = 0, prior = previous;
    const limit = Math.min(path.length, 25);
    for (let i = 0; i < limit; i++) {
      cost += lineCost(prior, path[i]); prior = path[i];
      if (lineCost(previous, path[i]) <= cost * 1.04 && clearLine(previous, path[i])) selected = i;
    }
    previous = path[selected]; smooth.push(previous); path.splice(0, selected + 1);
  }
  return smooth;
}
export function stepPlayer(player, seconds) {
  if (!walkable(player.x, player.y)) { Object.assign(player, WORLD.spawn, { path: [], mask: 0 }); return; }
  let distance = WORLD.speed * (Number.isFinite(seconds) ? Math.min(.15, Math.max(0, seconds)) : 0);
  const initial = { x: player.x, y: player.y };
  if (player.mask) {
    const dx = ((player.mask & 2) ? 1 : 0) - ((player.mask & 1) ? 1 : 0), dy = ((player.mask & 8) ? 1 : 0) - ((player.mask & 4) ? 1 : 0);
    const length = Math.hypot(dx, dy); player.path = [];
    if (length) {
      const next = WALKMESH.move(player, { x: dx / length * distance, y: dy / length * distance });
      if (next) { player.x = next.x; player.y = next.y; }
      player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'front' : 'back');
    }
    return;
  }
  while (distance > 0 && player.path?.length) {
    const next = player.path[0];
    if (!walkable(next?.x, next?.y)) { player.path = []; break; }
    const dx = next.x - player.x, dy = next.y - player.y, length = Math.hypot(dx, dy);
    const travel = Math.min(length, distance), target = length ? { x: player.x + dx / length * travel, y: player.y + dy / length * travel } : { x: player.x, y: player.y };
    if (!clearLine(player, target)) { player.path = []; break; }
    if (!clearLine(initial, target)) break; // Preserve safe interpolation of one network tick.
    player.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'front' : 'back');
    player.x = target.x; player.y = target.y; distance -= travel;
    if (length <= travel + 1e-7) player.path.shift(); else break;
  }
}
