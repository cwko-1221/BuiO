'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const imported = import('../lib/park-walkmesh.mjs');
const point = (x, y) => ({ x, y });
const rectangle = (x, y, width, height, id) => ({ kind: 'rect', x, y, width, height, id });
const bounds = { x: 0, y: 0, width: 1000, height: 800 };
async function bridgeMesh(extra = {}) {
  const { createWalkmesh, rectPolygon } = await imported;
  return createWalkmesh({ bounds, actorRadius: 18,
    water: [rectangle(400, 0, 200, 800, 'creek')],
    bridges: [{ id: 'footbridge', deck: rectPolygon({ x: 340, y: 330, width: 320, height: 140 }) }],
    solids: [rectangle(340, 315, 320, 15, 'north-rail'), rectangle(340, 470, 320, 15, 'south-rail')], ...extra });
}

test('a finite bridge has open land approaches and rejects both rail edges, water and old rounded endcaps', async () => {
  const mesh = await bridgeMesh();
  assert.equal(mesh.clearSegment(point(280, 400), point(720, 400)), true);
  assert.deepEqual(mesh.classify(point(500, 400)), { walkable: true, reason: 'bridge', id: 'footbridge' });
  for (const y of [314, 320, 329, 330, 340, 347, 453, 460, 469, 470, 477, 485]) {
    assert.equal(mesh.contains(point(500, y)), false, `feet cannot stand on/hang over the rail at ${y}`);
  }
  for (const p of [point(399, 250), point(500, 250), point(601, 250), point(500, 530)]) assert.equal(mesh.contains(p), false);
  // A legacy capsule would admit these corner and endcap coordinates. A finite
  // convex deck cannot excuse the foot disc's contact with the adjacent water.
  const { createWalkmesh, rectPolygon } = await imported;
  const flooded = createWalkmesh({ bounds, actorRadius: 18, water: [rectangle(200, 200, 600, 400)], bridges: [{ id: 'island-deck', deck: rectPolygon({ x: 340, y: 330, width: 320, height: 140 }) }] });
  for (const p of [point(325, 400), point(675, 400), point(350, 345), point(650, 455)]) assert.equal(flooded.contains(p), false, JSON.stringify(p));
  assert.equal(flooded.contains(point(359, 349)), true);
});

test('bridge decks cannot override rail strips or other solids and clearance scales with the foot radius', async () => {
  const { rectPolygon } = await imported;
  // Deliberately oversized deck: explicit rails must remain impassable.
  const mesh = await bridgeMesh({ bridges: [{ id: 'oversized', deck: rectPolygon({ x: 300, y: 250, width: 400, height: 300 }) }] });
  assert.equal(mesh.classify(point(500, 322)).id, 'north-rail');
  assert.equal(mesh.clearSegment(point(500, 280), point(500, 400)), false);
  const normal = await bridgeMesh();
  assert.equal(normal.contains(point(500, 355), 18), true);
  assert.equal(normal.contains(point(500, 355), 30), false);
  assert.equal(normal.contains(point(500, 349), 18), true);
  assert.equal(normal.contains(point(500, 349), 20), false);
  assert.equal(normal.clearSegment(point(300, 400), point(700, 400), 72), false);
});

test('continuous sweeps catch thin fences and a narrow water gap between two legal endpoints', async () => {
  const { createWalkmesh } = await imported;
  const mesh = createWalkmesh({ bounds, actorRadius: 2, solids: [rectangle(500.3, 100, .1, 600, 'thin-fence')] });
  assert.equal(mesh.contains(point(400, 400)), true); assert.equal(mesh.contains(point(600, 400)), true);
  assert.equal(mesh.clearSegment(point(400, 400), point(600, 400)), false);
  const wet = createWalkmesh({ bounds, actorRadius: 2, water: [rectangle(500.3, 100, .1, 600)] });
  assert.equal(wet.clearSegment(point(400, 400), point(600, 400)), false);
  const jumped = mesh.move(point(400, 400), point(500, 0));
  assert.ok(jumped.x < 498.3); assert.ok(mesh.contains(jumped)); assert.ok(mesh.clearSegment(point(400, 400), jumped));
});

test('a crossing cannot leave the bridge sideways even when both ends are on legal dry land', async () => {
  const mesh = await bridgeMesh();
  assert.equal(mesh.clearSegment(point(300, 400), point(700, 400)), true);
  assert.equal(mesh.clearSegment(point(300, 280), point(700, 520)), false);
  assert.equal(mesh.clearSegment(point(300, 400), point(700, 200)), false);
  assert.equal(mesh.clearSegment(point(300, 520), point(700, 520)), false);
});

test('concave water, reverse winding, circles, ellipses and rotated bridge decks remain deterministic', async () => {
  const { createWalkmesh, rectPolygon, ellipsePolygon, pointInPolygon } = await imported;
  const points = [point(400, 100), point(700, 100), point(700, 300), point(550, 300), point(550, 600), point(400, 600)];
  const mesh = createWalkmesh({ bounds, actorRadius: 8, water: [{ kind: 'polygon', points }], solids: [{ kind: 'circle', x: 180, y: 180, radius: 40 }, { kind: 'ellipse', x: 200, y: 550, rx: 80, ry: 35 }] });
  assert.equal(mesh.contains(point(620, 450)), true); assert.equal(mesh.contains(point(520, 450)), false);
  assert.equal(mesh.clearSegment(point(350, 500), point(650, 500)), false);
  assert.equal(mesh.clearSegment(point(600, 350), point(650, 550)), true);
  assert.equal(mesh.clearSegment(point(100, 180), point(280, 180)), false);
  const ellipse = ellipsePolygon({ x: 200, y: 550, rx: 80, ry: 35 });
  for (let i = 0; i < 360; i++) { const angle = i * Math.PI / 180, p = point(200 + Math.cos(angle) * 80, 550 + Math.sin(angle) * 35); assert.ok(pointInPolygon(p, ellipse)); assert.equal(mesh.contains(p), false); }
  const deck = [point(300, 320), point(340, 240), point(700, 420), point(660, 500)];
  const a = createWalkmesh({ bounds, actorRadius: 12, water: [rectangle(400, 0, 200, 800)], bridges: [{ id: 'diagonal', deck }] });
  const b = createWalkmesh({ bounds, actorRadius: 12, water: [rectangle(400, 0, 200, 800)], bridges: [{ id: 'diagonal', deck: [...deck].reverse() }] });
  const route = [point(250, 255), point(320, 280), point(680, 460), point(750, 480)];
  for (let i = 1; i < route.length; i++) assert.equal(a.clearSegment(route[i - 1], route[i]), b.clearSegment(route[i - 1], route[i]));
  assert.equal(a.clearSegment(point(320, 280), point(680, 460)), true);
  assert.equal(a.clearSegment(point(320, 220), point(680, 400)), false);
  const plain = createWalkmesh({ bounds, bridges: [{ id: 'ccw', deck: rectPolygon({ x: 10, y: 10, width: 100, height: 100 }) }] });
  assert.ok(plain.contains(point(500, 500)));
});

test('swept movement slides along a wall but every published position has a safe straight interpolation', async () => {
  const { createWalkmesh } = await imported;
  const mesh = createWalkmesh({ bounds, actorRadius: 18, solids: [rectangle(400, 200, 100, 300)] });
  let p = point(350, 250);
  for (let i = 0; i < 30; i++) {
    const next = mesh.move(p, point(18, 10)); assert.ok(next); assert.ok(mesh.contains(next)); assert.ok(mesh.clearSegment(p, next)); p = next;
  }
  assert.ok(p.y > 480, 'diagonal input should still advance along the free wall axis');
  for (let i = 0; i < 40; i++) {
    const next = mesh.move(p, point(18, 10)); assert.ok(mesh.clearSegment(p, next)); p = next;
  }
  assert.ok(p.x > 600, 'following ticks can move around the corner');
  assert.equal(mesh.move(point(450, 250), point(10, 10)), null);
});

test('a legal foot disc at a rail corner can move away instead of sticking to a negative-time circle contact', async () => {
  const mesh = await bridgeMesh();
  const contact = point(332.500370533898, 346.363238114654);
  assert.ok(mesh.contains(contact));
  assert.equal(mesh.clearSegment(contact, contact), true, 'a safe stationary point must stay safe');
  for (const target of [point(250, 350), point(300, 400), point(330, 400)]) assert.equal(mesh.clearSegment(contact, target), true, 'moving away from the rounded solid corner is legal');
  assert.ok(mesh.move(contact, point(-20, 10)).x < contact.x - 19);
});

test('seeded adversarial sweeps and move results never tunnel through water, rails, planters or building corners', async () => {
  const mesh = await bridgeMesh({ solids: [rectangle(340, 315, 320, 15, 'north-rail'), rectangle(340, 470, 320, 15, 'south-rail'), rectangle(120, 140, 160, 120, 'house'), rectangle(735, 540, 110, 85, 'planter'), { kind: 'circle', x: 820, y: 180, radius: 42 }] });
  let seed = 906173;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  let clearCount = 0, moveCount = 0;
  for (let i = 0; i < 1400; i++) {
    const from = point(20 + random() * 960, 20 + random() * 760), to = point(20 + random() * 960, 20 + random() * 760);
    if (mesh.clearSegment(from, to)) {
      clearCount++;
      const samples = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
      for (let j = 0; j <= samples; j++) assert.ok(mesh.contains(point(from.x + (to.x - from.x) * j / samples, from.y + (to.y - from.y) * j / samples)), `illegal sweep at seed ${seed}`);
    }
    if (!mesh.contains(from)) continue;
    const result = mesh.move(from, point((random() - .5) * 900, (random() - .5) * 900));
    assert.ok(result); assert.ok(mesh.contains(result)); assert.ok(mesh.clearSegment(from, result)); moveCount++;
  }
  assert.ok(clearCount > 150); assert.ok(moveCount > 700);
});

test('invalid packets, malformed geometry and mutation of authoring data fail safely', async () => {
  const { createWalkmesh, rectPolygon } = await imported, mesh = await bridgeMesh();
  for (const p of [point(NaN, 400), point(Infinity, 400), point(-1, 200), point(500, -1), point(500, 900)]) { assert.equal(mesh.contains(p), false); assert.equal(mesh.clearSegment(point(100, 400), p), false); }
  for (const radius of [NaN, Infinity, -1]) assert.equal(mesh.contains(point(100, 100), radius), false);
  assert.equal(mesh.move(point(100, 400), point(Infinity, 0)), null);
  assert.throws(() => createWalkmesh({ bounds: { ...bounds, width: -1 } }), /rectangle/);
  assert.throws(() => createWalkmesh({ bounds, solids: [{ kind: 'circle', x: 100, y: 100, radius: -2 }] }), /circle/);
  assert.throws(() => createWalkmesh({ bounds, bridges: [{ id: 'bad', deck: [point(100, 100), point(300, 100), point(180, 150), point(300, 300), point(100, 300)] }] }), /convex/);
  assert.throws(() => createWalkmesh({ bounds, solids: [{ kind: 'polygon', points: [point(100, 100), point(300, 300), point(100, 300), point(300, 100)] }] }), /polygon/);
  const shape = rectangle(400, 200, 100, 100), deck = rectPolygon({ x: 340, y: 330, width: 320, height: 140 });
  const immutable = createWalkmesh({ bounds, solids: [shape], water: [rectangle(400, 0, 200, 800)], bridges: [{ id: 'bridge', deck }] });
  shape.x = 50; deck[0].x = -1000;
  assert.equal(immutable.contains(point(450, 250)), false); assert.equal(immutable.clearSegment(point(300, 400), point(700, 400)), true);
});
