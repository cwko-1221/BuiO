// Geometry shared by the authoritative simulation and the map renderer.
// A pet occupies a disc at its feet. Bridge decks are finite polygons, never
// capsules, and a deck never overrides a rail or another solid object.
const EPSILON = 1e-7;
const finitePoint = p => !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
const validRadius = r => Number.isFinite(r) && r >= 0;
const cross = (ax, ay, bx, by) => ax * by - ay * bx;
const interpolate = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

export function pointSegmentDistanceSquared(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}

export function rectPolygon(rect) {
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) throw new TypeError('A rectangle needs finite coordinates and positive dimensions');
  return [{ x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height }];
}

// A circumscribed approximation is conservative for solid ellipses: no point
// inside the visible ellipse becomes walkable between the polygon vertices.
export function ellipsePolygon(ellipse, segments = 64) {
  const { x, y, rx, ry } = ellipse;
  if (![x, y, rx, ry].every(Number.isFinite) || rx <= 0 || ry <= 0 || !Number.isInteger(segments) || segments < 12 || segments > 256) throw new TypeError('An ellipse needs positive finite radii and 12–256 segments');
  const multiplier = 1 / Math.cos(Math.PI / segments);
  return Array.from({ length: segments }, (_, i) => {
    const angle = (i + .5) * Math.PI * 2 / segments;
    return { x: x + Math.cos(angle) * rx * multiplier, y: y + Math.sin(angle) * ry * multiplier };
  });
}

export function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i];
    if (pointSegmentDistanceSquared(point, a, b) <= EPSILON ** 2) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function polygonArea(polygon) {
  return polygon.reduce((sum, point, i) => { const next = polygon[(i + 1) % polygon.length]; return sum + point.x * next.y - next.x * point.y; }, 0) / 2;
}

function intersectingEdges(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const denominator = cross(rx, ry, sx, sy), qx = c.x - a.x, qy = c.y - a.y;
  if (Math.abs(denominator) < EPSILON) {
    if (Math.abs(cross(qx, qy, rx, ry)) > EPSILON) return false;
    return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x)) + EPSILON
      && Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y)) + EPSILON;
  }
  const t = cross(qx, qy, sx, sy) / denominator, u = cross(qx, qy, rx, ry) / denominator;
  return t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON;
}

function validatePolygon(input, convex = false) {
  if (!Array.isArray(input) || input.length < 3 || !input.every(finitePoint)) throw new TypeError('A polygon needs at least three finite vertices');
  const polygon = input.map(p => ({ x: p.x, y: p.y }));
  const area = polygonArea(polygon);
  if (Math.abs(area) < EPSILON) throw new TypeError('A polygon must enclose a nonzero area');
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 < EPSILON ** 2) throw new TypeError('A polygon cannot contain an empty edge');
    for (let j = i + 1; j < polygon.length; j++) {
      if (j === i + 1 || i === 0 && j === polygon.length - 1) continue;
      if (intersectingEdges(a, b, polygon[j], polygon[(j + 1) % polygon.length])) throw new TypeError('A polygon must not self-intersect');
    }
    if (convex) {
      const c = polygon[(i + 2) % polygon.length];
      if (cross(b.x - a.x, b.y - a.y, c.x - b.x, c.y - b.y) * Math.sign(area) < -EPSILON) throw new TypeError('A bridge deck must be a finite convex polygon');
    }
  }
  return polygon;
}

function polygonBounds(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  return { minX, minY, maxX, maxY };
}

function compileShape(shape, index, kind) {
  if (!shape || typeof shape !== 'object') throw new TypeError(`${kind} ${index} is not a shape`);
  const id = typeof shape.id === 'string' ? shape.id : `${kind}-${index}`;
  if (shape.kind === 'circle') {
    if (!finitePoint(shape) || !Number.isFinite(shape.radius) || shape.radius <= 0) throw new TypeError('A circle needs a positive finite radius');
    return { id, kind: 'circle', x: shape.x, y: shape.y, radius: shape.radius, bounds: { minX: shape.x - shape.radius, minY: shape.y - shape.radius, maxX: shape.x + shape.radius, maxY: shape.y + shape.radius } };
  }
  const points = shape.kind === 'rect' ? rectPolygon(shape) : shape.kind === 'ellipse' ? ellipsePolygon(shape) : shape.kind === 'polygon' ? validatePolygon(shape.points) : null;
  if (!points) throw new TypeError(`Unknown walkmesh shape kind: ${shape.kind}`);
  return { id, kind: 'polygon', points, bounds: polygonBounds(points) };
}

function shapeTouchesDisc(shape, point, radius) {
  const b = shape.bounds;
  if (point.x + radius < b.minX || point.x - radius > b.maxX || point.y + radius < b.minY || point.y - radius > b.maxY) return false;
  if (shape.kind === 'circle') return (point.x - shape.x) ** 2 + (point.y - shape.y) ** 2 <= (radius + shape.radius + EPSILON) ** 2;
  if (pointInPolygon(point, shape.points)) return true;
  for (let i = 0; i < shape.points.length; i++) {
    if (pointSegmentDistanceSquared(point, shape.points[i], shape.points[(i + 1) % shape.points.length]) <= (radius + EPSILON) ** 2) return true;
  }
  return false;
}

function bridgeContainsDisc(bridge, point, radius) {
  for (let i = 0; i < bridge.points.length; i++) {
    const a = bridge.points[i], b = bridge.points[(i + 1) % bridge.points.length], dx = b.x - a.x, dy = b.y - a.y;
    if (cross(dx, dy, point.x - a.x, point.y - a.y) * bridge.orientation < (radius + EPSILON) * Math.hypot(dx, dy)) return false;
  }
  return true;
}

function mergeIntervals(input) {
  if (!input.length) return [];
  const intervals = input.sort((a, b) => a[0] - b[0] || a[1] - b[1]), merged = [[...intervals[0]]];
  for (let i = 1; i < intervals.length; i++) {
    const previous = merged[merged.length - 1], current = intervals[i];
    if (current[0] <= previous[1] + EPSILON) previous[1] = Math.max(previous[1], current[1]);
    else merged.push([...current]);
  }
  return merged;
}

function circleInterval(from, to, center, radius) {
  const dx = to.x - from.x, dy = to.y - from.y, ox = from.x - center.x, oy = from.y - center.y;
  const a = dx * dx + dy * dy, b = 2 * (ox * dx + oy * dy), c = ox * ox + oy * oy - radius * radius;
  if (a < EPSILON ** 2) return c <= 0 ? [0, 1] : null;
  // Once safely outside a circle and moving away, squared distance only grows.
  // Do not turn a tiny negative root behind t=0 into a contact at the start.
  if (c > 0 && b >= 0) return null;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) return null;
  const root = Math.sqrt(Math.max(0, discriminant));
  const first = (-b - root) / (2 * a), last = (-b + root) / (2 * a);
  if (last < 0 || first > 1) return null;
  const start = Math.max(0, first), end = Math.min(1, last);
  return start <= end ? [start, end] : null;
}

function polygonInsideIntervals(from, to, points) {
  const dx = to.x - from.x, dy = to.y - from.y, cuts = [0, 1];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], sx = b.x - a.x, sy = b.y - a.y;
    const denominator = cross(dx, dy, sx, sy);
    if (Math.abs(denominator) < EPSILON) continue;
    const t = cross(a.x - from.x, a.y - from.y, sx, sy) / denominator;
    const u = cross(a.x - from.x, a.y - from.y, dx, dy) / denominator;
    if (t >= -EPSILON && t <= 1 + EPSILON && u >= -EPSILON && u <= 1 + EPSILON) cuts.push(Math.max(0, Math.min(1, t)));
  }
  cuts.sort((a, b) => a - b);
  const result = [];
  for (let i = 1; i < cuts.length; i++) {
    if (cuts[i] - cuts[i - 1] < EPSILON) continue;
    if (pointInPolygon(interpolate(from, to, (cuts[i] + cuts[i - 1]) / 2), points)) result.push([cuts[i - 1], cuts[i]]);
  }
  return result;
}

function convexInsideInterval(from, to, points, orientation, radius = 0) {
  const dx = to.x - from.x, dy = to.y - from.y;
  let start = 0, end = 1;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], ex = b.x - a.x, ey = b.y - a.y;
    const initial = cross(ex, ey, from.x - a.x, from.y - a.y) * orientation - radius * Math.hypot(ex, ey);
    const slope = cross(ex, ey, dx, dy) * orientation;
    if (Math.abs(slope) < EPSILON) { if (initial < 0) return null; continue; }
    const t = -initial / slope;
    if (slope > 0) start = Math.max(start, t); else end = Math.min(end, t);
    if (start > end + EPSILON) return null;
  }
  return end >= 0 && start <= 1 ? [Math.max(0, start), Math.min(1, end)] : null;
}

function edgeCapsuleIntervals(from, to, a, b, radius) {
  const length = Math.hypot(b.x - a.x, b.y - a.y), nx = -(b.y - a.y) / length * radius, ny = (b.x - a.x) / length * radius;
  const intervals = [];
  if (radius > EPSILON) {
    const box = [{ x: a.x + nx, y: a.y + ny }, { x: a.x - nx, y: a.y - ny }, { x: b.x - nx, y: b.y - ny }, { x: b.x + nx, y: b.y + ny }];
    const rectangle = convexInsideInterval(from, to, box, 1);
    if (rectangle) intervals.push(rectangle);
  }
  for (const p of [a, b]) { const interval = circleInterval(from, to, p, radius); if (interval) intervals.push(interval); }
  return intervals;
}

function shapeCollisionIntervals(shape, from, to, radius) {
  const b = shape.bounds;
  if (Math.max(from.x, to.x) + radius < b.minX || Math.min(from.x, to.x) - radius > b.maxX || Math.max(from.y, to.y) + radius < b.minY || Math.min(from.y, to.y) - radius > b.maxY) return [];
  if (shape.kind === 'circle') { const interval = circleInterval(from, to, shape, shape.radius + radius + EPSILON); return interval ? [interval] : []; }
  const intervals = polygonInsideIntervals(from, to, shape.points);
  for (let i = 0; i < shape.points.length; i++) intervals.push(...edgeCapsuleIntervals(from, to, shape.points[i], shape.points[(i + 1) % shape.points.length], radius + EPSILON));
  return mergeIntervals(intervals);
}

function covered(interval, covers) {
  let cursor = interval[0];
  for (const cover of covers) {
    if (cover[1] < cursor - EPSILON) continue;
    if (cover[0] > cursor + EPSILON) return false;
    cursor = Math.max(cursor, cover[1]);
    if (cursor >= interval[1] - EPSILON) return true;
  }
  return false;
}

/**
 * Compile a static, geometry-first walkmesh. Only horizontal foot position is
 * simulated; sprite height and canopy overlap must not change this geometry.
 *
 * Bridge decks must extend onto dry bank by at least twice actorRadius. Their
 * rails are ordinary solids, so they cannot be overridden by a deck polygon.
 */
export function createWalkmesh(specification) {
  if (!specification || typeof specification !== 'object') throw new TypeError('Walkmesh specification is required');
  const bounds = { ...specification.bounds }; rectPolygon(bounds);
  const actorRadius = specification.actorRadius ?? 18;
  if (!validRadius(actorRadius)) throw new TypeError('Actor foot radius must be finite and nonnegative');
  const solids = (specification.solids || []).map((shape, i) => compileShape(shape, i, 'solid'));
  const water = (specification.water || []).map((shape, i) => compileShape(shape, i, 'water'));
  const bridges = (specification.bridges || []).map((bridge, i) => {
    const points = validatePolygon(bridge.deck, true);
    return { id: bridge.id || `bridge-${i}`, points, orientation: Math.sign(polygonArea(points)), bounds: polygonBounds(points) };
  });

  function classify(point, radius = actorRadius) {
    if (!finitePoint(point) || !validRadius(radius)) return { walkable: false, reason: 'invalid' };
    if (point.x - radius < bounds.x || point.y - radius < bounds.y || point.x + radius > bounds.x + bounds.width || point.y + radius > bounds.y + bounds.height) return { walkable: false, reason: 'bounds' };
    for (const solid of solids) if (shapeTouchesDisc(solid, point, radius)) return { walkable: false, reason: 'solid', id: solid.id };
    if (!water.some(shape => shapeTouchesDisc(shape, point, radius))) return { walkable: true, reason: 'land' };
    const bridge = bridges.find(deck => bridgeContainsDisc(deck, point, radius));
    return bridge ? { walkable: true, reason: 'bridge', id: bridge.id } : { walkable: false, reason: 'water' };
  }

  const contains = (point, radius = actorRadius) => classify(point, radius).walkable;

  function clearSegment(from, to, radius = actorRadius) {
    if (!contains(from, radius) || !contains(to, radius)) return false;
    if (solids.some(shape => shapeCollisionIntervals(shape, from, to, radius).length)) return false;
    const wetIntervals = mergeIntervals(water.flatMap(shape => shapeCollisionIntervals(shape, from, to, radius)));
    if (!wetIntervals.length) return true;
    const decks = mergeIntervals(bridges.map(bridge => convexInsideInterval(from, to, bridge.points, bridge.orientation, radius + EPSILON)).filter(Boolean));
    return wetIntervals.every(interval => covered(interval, decks));
  }

  function advance(from, target, radius) {
    if (clearSegment(from, target, radius)) return { ...target };
    let low = 0, high = 1;
    for (let i = 0; i < 32; i++) { const middle = (low + high) / 2; if (clearSegment(from, interpolate(from, target, middle), radius)) low = middle; else high = middle; }
    return interpolate(from, target, low);
  }

  function move(from, delta, radius = actorRadius) {
    if (!finitePoint(delta) || !contains(from, radius)) return null;
    const target = { x: from.x + delta.x, y: from.y + delta.y };
    if (!finitePoint(target)) return null;
    if (clearSegment(from, target, radius)) return target;
    const contact = advance(from, target, radius);
    // Sliding is two additional swept segments, not an unchecked coordinate
    // assignment. Choose the axis that makes most progress toward the input.
    const horizontal = advance(contact, { x: target.x, y: contact.y }, radius);
    const vertical = advance(contact, { x: contact.x, y: target.y }, radius);
    const distance = p => (p.x - target.x) ** 2 + (p.y - target.y) ** 2;
    const first = distance(horizontal) < distance(vertical) ? horizontal : vertical;
    const result = first === horizontal ? advance(first, { x: first.x, y: target.y }, radius) : advance(first, { x: target.x, y: first.y }, radius);
    // Network frames interpolate between reported positions. Do not return an
    // L-shaped shortcut whose endpoints are safe but whose rendered diagonal
    // crosses the corner; continue around that corner on a following tick.
    return [result, first, horizontal, vertical, contact].filter(p => contains(p, radius) && clearSegment(from, p, radius)).sort((a, b) => distance(a) - distance(b))[0] || { ...from };
  }

  return Object.freeze({ actorRadius, contains, classify, clearSegment, move });
}
