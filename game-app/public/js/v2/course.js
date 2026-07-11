import { CHUNKS, CHUNK_SIZE } from './chunks.js';
import { ASSET_BY_ID, ZONES, ZONE_NAMES } from './assets.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, rnd) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function tagCounts(chunks) {
  const counts = {};
  for (const chunk of chunks) for (const tag of chunk.tags) counts[tag] = (counts[tag] || 0) + 1;
  return counts;
}

function selectChunks(seed) {
  const rnd = mulberry32(seed ^ 0x5f3759df);
  let selected = [];
  for (let attempt = 0; attempt < 500; attempt++) {
    selected = ZONES.flatMap(zone => shuffled(CHUNKS.filter(c => c.zone === zone), rnd).slice(0, 4));
    const c = tagCounts(selected);
    if ((c.descent || 0) >= 5 && (c.traverse || 0) >= 5 && (c.dynamic || 0) >= 4 &&
        (c.bounce || 0) >= 4 && (c.branch || 0) >= 3 && ZONES.every(zone => selected.filter(x => x.zone === zone).some(x => x.tags.includes('recovery')))) {
      return selected;
    }
  }
  return selected;
}

function txX(x, mirror) { return mirror ? CHUNK_SIZE.w - x : x; }

export function buildCourse(seed) {
  const rnd = mulberry32(seed >>> 0);
  const selected = selectChunks(seed);
  const world = { width: 5000, height: selected.length * 550 + 1250 };
  const start = { x: 1050 + rnd() * 450, y: world.height - 520 };
  let anchor = { ...start };
  const instances = [];
  const objects = [];
  const sensors = [];
  const checkpoints = [];
  const usedAssets = new Set();

  selected.forEach((chunk, slot) => {
    let mirror;
    if (anchor.x < 1450) mirror = false;
    else if (anchor.x > 3550) mirror = true;
    else mirror = rnd() < .5;

    const entryX = txX(chunk.entry.x, mirror);
    const origin = { x: anchor.x - entryX, y: anchor.y - chunk.entry.y };
    const exit = chunk.exits[0];
    const exitWorld = { x: origin.x + txX(exit.x, mirror), y: origin.y + exit.y };
    if (exitWorld.x < 500 || exitWorld.x > world.width - 500) {
      mirror = !mirror;
      origin.x = anchor.x - txX(chunk.entry.x, mirror);
      exitWorld.x = origin.x + txX(exit.x, mirror);
    }

    const instance = {
      id: `${chunk.id}-${slot}`,
      chunkId: chunk.id, zone: chunk.zone, zoneName: ZONE_NAMES[chunk.zone], slot,
      origin, mirror, bounds: { x: origin.x, y: origin.y, w: chunk.size.w, h: chunk.size.h },
      recoveryY: origin.y + chunk.recoveryBounds.y
    };
    instances.push(instance);

    for (const obj of chunk.objects) {
      const asset = ASSET_BY_ID.get(obj.assetId);
      if (!asset) continue;
      usedAssets.add(obj.assetId);
      objects.push({
        ...obj,
        id: `${instance.id}-${objects.length}`,
        zone: chunk.zone,
        x: origin.x + txX(obj.x, mirror), y: origin.y + obj.y,
        angle: (obj.angle || 0) * (mirror ? -1 : 1),
        mirror,
        asset
      });
    }

    for (const sensor of chunk.progressSensors) sensors.push({
      id: `${instance.id}-p${sensor.progress}`,
      x: origin.x + txX(sensor.x, mirror), y: origin.y + sensor.y,
      progress: (slot + sensor.progress) / selected.length,
      slot
    });

    if (slot % 4 === 0) checkpoints.push({
      id: `${instance.id}-checkpoint`, x: anchor.x, y: anchor.y - 70,
      progress: slot / selected.length, zone: chunk.zone, zoneName: ZONE_NAMES[chunk.zone]
    });

    anchor = exitWorld;
  });

  const summit = { x: anchor.x, y: anchor.y - 90, progress: 1 };
  usedAssets.add('summit-flag');
  usedAssets.add('checkpoint-flag');

  return {
    seed, world, start, summit, instances, objects, sensors, checkpoints,
    usedAssets: [...usedAssets],
    tagCounts: tagCounts(selected),
    stageCount: ZONES.length,
    stages: ZONES.map(z => ZONE_NAMES[z]),
    startAltitudeY: start.y,
    courseHash: hashCourse(selected, objects)
  };
}

function hashCourse(chunks, objects) {
  let h = 2166136261;
  const s = chunks.map(c => c.id).join('|') + objects.map(o => `${o.assetId}:${Math.round(o.x)}:${Math.round(o.y)}:${o.angle}`).join('|');
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, '0');
}

export function validateCourse(course) {
  const errors = [];
  if (course.instances.length !== 24) errors.push(`expected 24 chunks, got ${course.instances.length}`);
  for (const zone of ZONES) if (course.instances.filter(i => i.zone === zone).length !== 4) errors.push(`${zone} does not have 4 chunks`);
  const required = { descent: 5, traverse: 5, dynamic: 4, bounce: 4, branch: 3 };
  for (const [tag, minimum] of Object.entries(required)) if ((course.tagCounts[tag] || 0) < minimum) errors.push(`${tag} below ${minimum}`);
  const plain = course.objects.filter(o => (o.bodyOverride?.type || o.asset.body.type) === 'rect' && !o.angle && o.behavior.type === 'static').length;
  const irregular = course.objects.length - plain;
  if (plain / course.objects.length > .25) errors.push(`plain rectangles ${(plain/course.objects.length*100).toFixed(1)}%`);
  if (irregular / course.objects.length < .65) errors.push(`irregular bodies ${(irregular/course.objects.length*100).toFixed(1)}%`);
  for (let i = 1; i < course.instances.length; i++) {
    const a = course.instances[i - 1], b = course.instances[i];
    if (Math.abs((a.origin.y - b.origin.y) - 550) > 2) errors.push(`chunk ${i} vertical socket mismatch`);
  }
  return { ok: errors.length === 0, errors, stats: {
    chunks: course.instances.length, objects: course.objects.length, assets: course.usedAssets.length,
    plainRectPct: Math.round(plain / course.objects.length * 100), irregularPct: Math.round(irregular / course.objects.length * 100),
    tags: course.tagCounts, hash: course.courseHash
  }};
}
