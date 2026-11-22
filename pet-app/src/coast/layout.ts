// Coordinates are foot positions on the approved 1672 × 941 painting.
export interface Point { x: number; y: number }
export const frame = { width: 1672, height: 941 };
export const pitch = 33 * Math.PI / 180;
export const squash = Math.sin(pitch);
export const spawn: Point = { x: 858, y: 491 };
export const places = [
  { id: 'crescent', zh: '月灣廣場', en: 'Crescent Square', x: 844, y: 423, color: '#ce9c45' },
  { id: 'market', zh: '橘帆市集', en: 'Tangerine Market', x: 565, y: 194, color: '#dc8153' },
  { id: 'garden', zh: '風鈴花圃', en: 'Windbell Gardens', x: 287, y: 451, color: '#b779ae' },
  { id: 'lookout', zh: '翡翠觀星台', en: 'Jade Observatory', x: 1274, y: 147, color: '#639d88' },
  { id: 'marina', zh: '潮光碼頭', en: 'Tideglass Marina', x: 1541, y: 478, color: '#5795bd' },
  { id: 'village', zh: '松影村', en: 'Pineshade Village', x: 845, y: 666, color: '#8b9a5e' },
] as const;

type Vertex = [number, number, number?];
type Node = Point & { elevation: number; index: number; neighbours: number[] };
type Segment = { a: Node; b: Node; radius: number };
const nodes: Node[] = [], segments: Segment[] = [];
function trail(radius: number, vertices: Vertex[]) {
  let previous: Node | undefined;
  for (const [x, y, elevation = 0] of vertices) {
    let node = nodes.find(n => n.x === x && n.y === y);
    if (!node) {
      node = { x, y, elevation, index: nodes.length, neighbours: [] };
      nodes.push(node);
    }
    if (previous) {
      segments.push({ a: previous, b: node, radius });
      previous.neighbours.push(node.index);
      node.neighbours.push(previous.index);
    }
    previous = node;
  }
}

trail(20, [[515,323],[530,357],[527,389],[560,420],[613,445],[695,470],[779,492],[850,494],[950,500],[1041,479],[1100,455],[1110,414],[1118,365],[1135,326],[1168,288]]);
// Plaza terrace and its single front staircase. The fountain basin stays solid.
trail(24, [[850,494],[847,466],[844,445,1.9],[844,423,3.3]]);
trail(14, [[844,423,3.3],[910,420,3.3],[967,404,3.3],[998,382,3.3],[992,354,3.3],[954,331,3.3],[905,316,3.3],[847,310,3.3],[774,316,3.3],[714,333,3.3],[677,354,3.3],[670,375,3.3],[697,397,3.3],[751,413,3.3],[805,422,3.3],[844,423,3.3]]);
trail(17, [[515,323],[501,303],[512,285],[535,277],[558,273],[585,262],[614,238],[606,212],[565,194]]);
trail(20, [[565,194],[530,198],[489,202],[454,216]]);
trail(12, [[614,238],[685,214],[757,190],[797,173],[833,169],[875,162],[851,143]]);
// The two bridges cross separate inlets. Front parapets sit below each deck centerline.
trail(16, [[613,445],[568,464],[538,478],[512,492],[474,481,1.8],[442,476,2.6],[400,484,1.9],[359,505],[331,480],[314,455],[287,451],[267,448],[225,445],[195,435]]);
// The rotunda is reached by the narrow east path around the lavender border.
trail(7, [[314,455],[325,439],[342,427],[362,420],[383,410],[395,400],[378,397],[362,393],[350,392],[342,387]]);
trail(12, [[195,435],[159,434],[119,413],[84,387],[89,374]]);
trail(17, [[1100,455],[1128,462,1.3],[1175,462,2.7],[1205,471,2.5],[1240,487,1.3],[1279,517],[1321,534],[1383,565],[1419,601],[1438,649],[1424,687],[1382,721]]);
trail(10, [[1382,721],[1374,738],[1341,757],[1312,756],[1270,751]]);
trail(17, [[1270,751],[1193,745],[1081,749],[975,763],[860,805],[737,809],[636,816],[559,804],[501,771],[478,742],[507,709],[542,690]]);
trail(14, [[975,763],[964,731],[919,702],[873,680],[845,666]]);
trail(10, [[737,809],[706,782],[692,758]]);
trail(12, [[1081,749],[1075,727],[1060,708]]);
trail(12, [[1270,751],[1270,718],[1259,692],[1248,675]]);
// Switchback landings preserve the observable change in elevation up the cliff.
trail(12, [[1168,288],[1163,273,1],[1127,257,2.5],[1099,243,4.2],[1132,225,6.3],[1181,210,7.6],[1218,188,9.8],[1255,176,11.8],[1265,154,14],[1274,147,14]]);
trail(8, [[1274,147,14],[1293,148,14],[1351,149,14],[1419,140,14],[1451,129,14]]);
trail(15, [[1110,414],[1162,417],[1202,414],[1234,392],[1286,375],[1330,366],[1388,375],[1449,395],[1497,409],[1543,423],[1588,425]]);
trail(8, [[1588,425],[1623,447],[1625,456],[1609,471],[1583,480],[1564,478],[1541,478]]);

export function distance(a: Point, b: Point) { return Math.hypot(b.x - a.x, (b.y - a.y) / squash); }

function nearestOn(p: Point, s: Segment) {
  const dx = s.b.x - s.a.x, dy = (s.b.y - s.a.y) / squash;
  const t = Math.max(0, Math.min(1, ((p.x - s.a.x) * dx + (p.y - s.a.y) / squash * dy) / (dx * dx + dy * dy)));
  const x = s.a.x + t * dx, y = s.a.y + t * (s.b.y - s.a.y);
  return { x, y, t, distance: Math.hypot(p.x - x, (p.y - y) / squash) };
}
export function walkable(point: Point) {
  return segments.some(s => Math.abs(point.x - s.a.x) <= Math.abs(s.b.x - s.a.x) + s.radius &&
    Math.abs(point.y - s.a.y) <= Math.abs(s.b.y - s.a.y) + s.radius * squash && nearestOn(point, s).distance <= s.radius);
}
export function walkHeight(point: Point) {
  let nearest = Infinity, height = 0;
  for (const s of segments) {
    const hit = nearestOn(point, s);
    if (hit.distance < nearest) {
      nearest = hit.distance;
      height = s.a.elevation + hit.t * (s.b.elevation - s.a.elevation);
    }
  }
  return height;
}
export function clearWalk(a: Point, b: Point) {
  const steps = Math.max(1, Math.ceil(distance(a, b) / 3));
  for (let i = 1; i <= steps; i++) {
    if (!walkable({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps })) return false;
  }
  return true;
}

function attach(point: Point) {
  let best = segments[0], closest = nearestOn(point, best);
  for (const s of segments) {
    const hit = nearestOn(point, s);
    if (hit.distance < closest.distance) { best = s; closest = hit; }
  }
  return { closest, segment: best };
}
// Each endpoint attaches to its own paved segment, including taps between two waypoints.
export function findRoute(from: Point, to: Point): Point[] {
  if (!walkable(to)) return [];
  if (clearWalk(from, to)) return [to];
  const start = attach(from), end = attach(to);
  const previous = new Map<number, number>(), costs = nodes.map(() => Infinity);
  const open = new Set<number>();
  for (const n of [start.segment.a, start.segment.b]) {
    costs[n.index] = distance(start.closest, n);
    open.add(n.index);
  }
  while (open.size) {
    let id = -1;
    for (const i of open) if (id < 0 || costs[i] < costs[id]) id = i;
    open.delete(id);
    for (const next of nodes[id].neighbours) {
      const cost = costs[id] + distance(nodes[id], nodes[next]);
      if (cost >= costs[next]) continue;
      previous.set(next, id);
      costs[next] = cost;
      open.add(next);
    }
  }
  const finish = [end.segment.a, end.segment.b].sort((a, b) =>
    costs[a.index] + distance(a, end.closest) - costs[b.index] - distance(b, end.closest))[0];
  if (!Number.isFinite(costs[finish.index])) return [];
  const result: Point[] = [end.closest, to];
  for (let id: number | undefined = finish.index; id !== undefined; id = previous.get(id)) result.unshift(nodes[id]);
  result.unshift(start.closest);
  return result.filter((p, i) => distance(p, i ? result[i - 1] : from) > .01);
}
