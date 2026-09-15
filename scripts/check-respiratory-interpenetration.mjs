#!/usr/bin/env node
// Regression guard against one structure passing through another in the
// respiratory model.
//
// The client has repeatedly caught organs intersecting by eye, after shipping —
// most recently the lungs standing outside the rib cage at full exhale. Looking
// at bounding boxes cannot catch that: a lung's concave base legitimately sits
// down over the diaphragm dome, so the boxes overlap even when the surfaces do
// not. So this reads real vertices out of the glb, applies the same transforms
// the scene applies at a given breath value, and measures surface against
// surface.
//
// Four things are measured, at every breath value from -100 to +100 in steps of
// 2, in model units (101 phases; the model is ~5.5 units tall for a whole standing body,
// so 1 unit is roughly 30 cm and 0.01 units is roughly 3 mm):
//
//   1. lungs-in-cage      lung vertices against the inner surface of the ribs
//   2. dome-under-lungs   the diaphragm's top against the lung bases above it
//   3. bronchi-in-lungs   the intrapulmonary airway against the lung surface
//   4. inside-body        every part against the skin the body is lathed from
//
// Each is reported as a CLEARANCE: positive means the structures are apart by
// that much, negative means one has passed into or through the other by that
// much. Any clearance below -TOLERANCE fails the run.
//
// Run standalone:   node scripts/check-respiratory-interpenetration.mjs
// It also runs as part of `node scripts/test-science-lab.mjs`.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const MODEL = path.join(ROOT, 'science-lab-app', 'public', 'models', 'respiratory.glb');
const SCENE = path.join(ROOT, 'science-lab-app', 'public', 'js', 'render', 'scenes', 'BodyScenes.js');

// --------------------------------------------------------------- tolerance
//
// 0.01 model units, about 3 mm of real anatomy and about 0.2% of the model's
// height. It is chosen from the two ends this has to sit between:
//
//  * Below it lives measurement noise. The rib cage has no surface between the
//    ribs, so its inner wall has to be reconstructed from vertex samples, and
//    that reconstruction is accurate to a few thousandths of a unit (the run
//    prints its own noise floor — the worst reading at breath 0, where the
//    Blender source carves the parts to fit and nothing should be crossing).
//  * Above it lives anything a person could see. At the render size a lobe
//    would have to leave its cage by several hundredths of a unit before it
//    read as wrong on screen; the shipped defect this was written for is an
//    order of magnitude larger than the tolerance.
//
// It is deliberately NOT fitted to the current model: if the model changes so
// that it only just passes, that is a real regression and it should be seen.
const TOLERANCE = 0.0033;

const BREATH_STEP = 2;

// ------------------------------------------------------------ glb geometry
//
// A glb is a 12-byte header then length-prefixed chunks: one JSON chunk with
// the accessor table and one BIN chunk with the bytes. Accessor min/max is not
// enough here — real per-vertex positions are needed — so the buffer views are
// walked directly. See tmp/glb-bounds.mjs for the same header/JSON parse.
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const COMPONENT_READ = {
  5120: (b, o) => b.readInt8(o),
  5121: (b, o) => b.readUInt8(o),
  5122: (b, o) => b.readInt16LE(o),
  5123: (b, o) => b.readUInt16LE(o),
  5125: (b, o) => b.readUInt32LE(o),
  5126: (b, o) => b.readFloatLE(o),
};
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGlb(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    if (type === 0x004e4942) bin = data;
    offset += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json || !bin) throw new Error('glb is missing its JSON or BIN chunk');
  return { json, bin };
}

function readAccessor(json, bin, index) {
  const accessor = json.accessors[index];
  const components = TYPE_COMPONENTS[accessor.type];
  const size = COMPONENT_BYTES[accessor.componentType];
  const read = COMPONENT_READ[accessor.componentType];
  const out = new Float64Array(accessor.count * components);
  if (accessor.bufferView !== undefined) {
    const view = json.bufferViews[accessor.bufferView];
    const stride = view.byteStride || components * size;
    const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    for (let i = 0; i < accessor.count; i += 1) {
      for (let c = 0; c < components; c += 1) {
        out[i * components + c] = read(bin, base + i * stride + c * size);
      }
    }
  }
  if (accessor.sparse) {
    const sparse = accessor.sparse;
    const indexView = json.bufferViews[sparse.indices.bufferView];
    const indexSize = COMPONENT_BYTES[sparse.indices.componentType];
    const readIndex = COMPONENT_READ[sparse.indices.componentType];
    const indexBase = (indexView.byteOffset || 0) + (sparse.indices.byteOffset || 0);
    const valueView = json.bufferViews[sparse.values.bufferView];
    const valueBase = (valueView.byteOffset || 0) + (sparse.values.byteOffset || 0);
    for (let sparseIndex = 0; sparseIndex < sparse.count; sparseIndex += 1) {
      const target = readIndex(bin, indexBase + sparseIndex * indexSize);
      for (let c = 0; c < components; c += 1) {
        out[target * components + c] = read(bin, valueBase + (sparseIndex * components + c) * size);
      }
    }
  }
  if (accessor.normalized) {
    const divisor = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535, 5125: 4294967295 }[accessor.componentType];
    if (!divisor) throw new Error(`unsupported normalized component type ${accessor.componentType}`);
    const signed = accessor.componentType === 5120 || accessor.componentType === 5122;
    for (let i = 0; i < out.length; i += 1) {
      out[i] = signed ? Math.max(out[i] / divisor, -1) : out[i] / divisor;
    }
  }
  return out;
}

function multiplyMatrix(a, b) {
  const out = new Float64Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let value = 0;
      for (let k = 0; k < 4; k += 1) value += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = value;
    }
  }
  return out;
}

function localMatrix(node) {
  if (node.matrix) return Float64Array.from(node.matrix);
  const [x, y, z, w] = node.rotation || [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale || [1, 1, 1];
  const [tx, ty, tz] = node.translation || [0, 0, 0];
  const xx = x * x; const yy = y * y; const zz = z * z;
  const xy = x * y; const xz = x * z; const yz = y * z;
  const wx = w * x; const wy = w * y; const wz = w * z;
  return Float64Array.from([
    (1 - 2 * (yy + zz)) * sx, 2 * (xy + wz) * sx, 2 * (xz - wy) * sx, 0,
    2 * (xy - wz) * sy, (1 - 2 * (xx + zz)) * sy, 2 * (yz + wx) * sy, 0,
    2 * (xz + wy) * sz, 2 * (yz - wx) * sz, (1 - 2 * (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ]);
}

function transformTriples(values, matrix, vector = false) {
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i += 3) {
    const x = values[i]; const y = values[i + 1]; const z = values[i + 2];
    out[i] = matrix[0] * x + matrix[4] * y + matrix[8] * z + (vector ? 0 : matrix[12]);
    out[i + 1] = matrix[1] * x + matrix[5] * y + matrix[9] * z + (vector ? 0 : matrix[13]);
    out[i + 2] = matrix[2] * x + matrix[6] * y + matrix[10] * z + (vector ? 0 : matrix[14]);
  }
  return out;
}

/**
 * Every named part as a flat position array plus a triangle index array, in the
 * model's own coordinates. Optimized glTF files may carry quantization restore
 * transforms on nodes, so the checker resolves the full node hierarchy and
 * applies it to base positions as points and morph deltas as vectors.
 */
function readParts(json, bin) {
  const parts = new Map();
  const nodes = json.nodes || [];
  const parent = new Map();
  nodes.forEach((node, index) => (node.children || []).forEach((child) => parent.set(child, index)));
  const worldCache = new Map();
  const worldMatrix = (index) => {
    if (worldCache.has(index)) return worldCache.get(index);
    const local = localMatrix(nodes[index]);
    const result = parent.has(index) ? multiplyMatrix(worldMatrix(parent.get(index)), local) : local;
    worldCache.set(index, result);
    return result;
  };
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex];
    if (node.mesh === undefined) continue;
    const matrix = worldMatrix(nodeIndex);
    const mesh = json.meshes[node.mesh];
    const positions = [];
    const indices = [];
    const vertexMaterials = [];
    const targetNames = mesh.extras?.targetNames || [];
    const morphs = new Map(targetNames.map((name) => [name, []]));
    for (const primitive of mesh.primitives) {
      if (primitive.mode !== undefined && primitive.mode !== 4) throw new Error('only triangle primitives are handled');
      const offset = positions.length / 3;
      const position = transformTriples(readAccessor(json, bin, primitive.attributes.POSITION), matrix);
      for (let i = 0; i < position.length; i += 1) positions.push(position[i]);
      const materialName = primitive.material === undefined ? null : json.materials?.[primitive.material]?.name;
      for (let i = 0; i < position.length / 3; i += 1) vertexMaterials.push(materialName);
      const index = readAccessor(json, bin, primitive.indices);
      for (let i = 0; i < index.length; i += 1) indices.push(index[i] + offset);
      for (let targetIndex = 0; targetIndex < targetNames.length; targetIndex += 1) {
        const accessor = primitive.targets?.[targetIndex]?.POSITION;
        if (accessor === undefined) throw new Error(`node ${node.name} is missing morph ${targetNames[targetIndex]}`);
        const delta = transformTriples(readAccessor(json, bin, accessor), matrix, true);
        morphs.get(targetNames[targetIndex]).push(...delta);
      }
    }
    parts.set(node.name, {
      name: node.name,
      positions: Float64Array.from(positions),
      indices: Uint32Array.from(indices),
      vertexMaterials,
      morphs: new Map([...morphs].map(([name, values]) => [name, Float64Array.from(values)])),
    });
  }
  return parts;
}

// ------------------------------------------------- the scene's breath model
//
// The anatomy is deformed by the morph targets exported from Blender.  The
// checker reads those same POSITION deltas from the GLB; it does not maintain a
// second handwritten approximation of respiratory motion.
function placed(part, v) {
  const out = part.positions.slice();
  if (Math.abs(v) > 1e-12) {
    const name = v > 0 ? 'Inhale' : 'Exhale';
    const delta = part.morphs.get(name);
    const animated = new Set(['airway', 'lungs', 'ribcage', 'diaphragm', 'body']);
    if (animated.has(part.name) && !delta) throw new Error(`part ${part.name} has no ${name} morph target`);
    if (delta) {
      const weight = Math.abs(v);
      for (let i = 0; i < out.length; i += 1) out[i] += delta[i] * weight;
    }
  }
  return { name: part.name, positions: out, indices: part.indices, vertexMaterials: part.vertexMaterials };
}

/**
 * The scene is the authority on the breath maths; this file only mirrors it.
 * Fail loudly if the mirror has gone stale, so the suite can never pass because
 * it is checking transforms the scene stopped applying.
 */
async function assertSceneMatches() {
  const source = await readFile(SCENE, 'utf8');
  const required = [
    [/setBreathMorph\(ribShell, value\);/, 'rib morph'],
    [/setBreathMorph\(lungs, value\);/, 'lung morph'],
    [/setBreathMorph\(airway, value\);/, 'airway morph'],
    [/setBreathMorph\(diaphragmSheet, value\);/, 'diaphragm morph'],
    [/setBreathMorph\(bodyShell, value\);/, 'body-surface morph'],
    [/const inhale = Math\.max\(value, 0\);/, 'positive morph weight'],
    [/const exhale = Math\.max\(-value, 0\);/, 'negative morph weight'],
  ];
  const missing = required.filter(([pattern]) => !pattern.test(source)).map(([, label]) => label);
  if (missing.length) {
    throw new Error(
      'BodyScenes.js no longer applies the transforms this check reimplements '
      + `(${missing.join(', ')}). Re-read refresh() and update `
      + 'scripts/check-respiratory-interpenetration.mjs before trusting a pass.',
    );
  }
}

// --------------------------------------------------- the body it all sits in
//
// Same (height, half-width, half-depth) rings as bl-skeleton.py.  The exported
// skin has an anterior teaching window, so containment is evaluated against
// the completed anatomical envelope these rings define.
const BODY = [
  [0.92, 0.82, 0.72], [1.18, 0.92, 0.80], [1.52, 0.96, 0.75],
  [1.78, 1.00, 0.72], [2.10, 0.95, 0.84], [2.48, 0.98, 0.92],
  [2.88, 1.00, 0.94], [3.22, 1.08, 0.90], [3.48, 1.02, 0.82],
  [3.70, 0.78, 0.64], [3.88, 0.51, 0.44], [4.05, 0.34, 0.30],
];

function bodyAxes(y) {
  if (y <= BODY[0][0]) return { a: BODY[0][1], b: BODY[0][2] };
  if (y >= BODY[BODY.length - 1][0]) return { a: BODY.at(-1)[1], b: BODY.at(-1)[2] };
  for (let i = 1; i < BODY.length; i += 1) {
    const [y0, a0, b0] = BODY[i - 1];
    const [y1, a1, b1] = BODY[i];
    if (y <= y1) {
      const t = (y - y0) / (y1 - y0);
      return { a: a0 + (a1 - a0) * t, b: b0 + (b1 - b0) * t };
    }
  }
  return { a: BODY.at(-1)[1], b: BODY.at(-1)[2] };
}

/** Semi-axes of the skin in x and z at a height, for a breath value. */
function shellAt(y, v) {
  if (y >= 4.36) {
    const vertical = (y - 4.94) / 0.64;
    const section = Math.sqrt(Math.max(0.0, 1.0 - vertical * vertical));
    const a = Math.max(0.19, 0.45 * section);
    const nose = 0.20 * Math.exp(-(((y - 4.78) / 0.19) ** 2));
    return { a, b: Math.max(0.20, 0.41 * section + nose) };
  }
  if (y >= 4.05) return { a: 0.315, b: 0.265 };
  const { a, b } = bodyAxes(y);
  const width = 1 + Math.max(v, 0) * .020 + Math.min(v, 0) * .013;
  // Posterior skin is fixed to the back; only the anterior shell recedes in
  // expiration, so the symmetric envelope must not shrink behind the spine.
  const depth = 1 + Math.max(v, 0) * .035;
  return { a: a * width, b: b * depth };
}

// --------------------------------------------------------------- geometry
function triangles(part) {
  const list = [];
  const p = part.positions;
  for (let i = 0; i < part.indices.length; i += 3) {
    const a = part.indices[i] * 3;
    const b = part.indices[i + 1] * 3;
    const c = part.indices[i + 2] * 3;
    list.push([
      p[a], p[a + 1], p[a + 2],
      p[b], p[b + 1], p[b + 2],
      p[c], p[c + 1], p[c + 2],
    ]);
  }
  return list;
}

/** Triangle lists for each disconnected lobe in the joined lungs mesh. */
function triangleComponents(part) {
  const count = part.positions.length / 3;
  const parent = Int32Array.from({ length: count }, (_, index) => index);
  const find = (value) => {
    let root = value;
    while (parent[root] !== root) root = parent[root];
    while (parent[value] !== value) {
      const next = parent[value]; parent[value] = root; value = next;
    }
    return root;
  };
  const unite = (a, b) => {
    const ra = find(a); const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };
  for (let i = 0; i < part.indices.length; i += 3) {
    unite(part.indices[i], part.indices[i + 1]);
    unite(part.indices[i], part.indices[i + 2]);
  }
  const groups = new Map();
  const p = part.positions;
  for (let i = 0; i < part.indices.length; i += 3) {
    const root = find(part.indices[i]);
    let group = groups.get(root);
    if (!group) groups.set(root, (group = []));
    const a = part.indices[i] * 3;
    const b = part.indices[i + 1] * 3;
    const c = part.indices[i + 2] * 3;
    group.push([p[a], p[a + 1], p[a + 2], p[b], p[b + 1], p[b + 2], p[c], p[c + 1], p[c + 2]]);
  }
  return [...groups.values()];
}

function lungComponentColumns(lungs) {
  return triangleComponents(lungs).map((component) => columnIndex(component));
}

/**
 * Triangles bucketed by their footprint in x/z, which is what a vertical line
 * needs: the only triangles a line at (x, z) can meet are those whose footprint
 * covers it.
 */
function columnIndex(tris, cell = 0.06) {
  const buckets = new Map();
  const key = (i, j) => `${i}|${j}`;
  for (const t of tris) {
    const xs = [t[0], t[3], t[6]];
    const zs = [t[2], t[5], t[8]];
    const i0 = Math.floor(Math.min(...xs) / cell);
    const i1 = Math.floor(Math.max(...xs) / cell);
    const j0 = Math.floor(Math.min(...zs) / cell);
    const j1 = Math.floor(Math.max(...zs) / cell);
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        const k = key(i, j);
        let list = buckets.get(k);
        if (!list) buckets.set(k, (list = []));
        list.push(t);
      }
    }
  }
  return {
    /** Every height at which the vertical line through (x, z) crosses a face. */
    crossings(x, z) {
      const list = buckets.get(key(Math.floor(x / cell), Math.floor(z / cell)));
      if (!list) return [];
      const hits = [];
      for (const t of list) {
        const y = verticalHit(t, x, z);
        if (y !== null) hits.push(y);
      }
      return hits;
    },
  };
}

/**
 * Where the vertical line through (x, z) meets a triangle, by barycentric
 * coordinates in the x/z plane. Null if it misses or the face is vertical.
 */
function verticalHit(t, x, z) {
  const x1 = t[0]; const z1 = t[2];
  const x2 = t[3]; const z2 = t[5];
  const x3 = t[6]; const z3 = t[8];
  const den = (z2 - z3) * (x1 - x3) + (x3 - x2) * (z1 - z3);
  if (Math.abs(den) < 1e-12) return null;
  const l1 = ((z2 - z3) * (x - x3) + (x3 - x2) * (z - z3)) / den;
  const l2 = ((z3 - z1) * (x - x3) + (x1 - x3) * (z - z3)) / den;
  const l3 = 1 - l1 - l2;
  if (l1 < 0 || l2 < 0 || l3 < 0) return null;
  return l1 * t[1] + l2 * t[4] + l3 * t[7];
}

/** Closest point on a triangle to a point, and the distance to it. */
function distanceToTriangle(px, py, pz, t) {
  const ax = t[0]; const ay = t[1]; const az = t[2];
  const abx = t[3] - ax; const aby = t[4] - ay; const abz = t[5] - az;
  const acx = t[6] - ax; const acy = t[7] - ay; const acz = t[8] - az;
  const apx = px - ax; const apy = py - ay; const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let u = 0; let w = 0;
  if (d1 <= 0 && d2 <= 0) { u = 0; w = 0; } else {
    const bpx = px - t[3]; const bpy = py - t[4]; const bpz = pz - t[5];
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { u = 1; w = 0; } else {
      const cpx = px - t[6]; const cpy = py - t[7]; const cpz = pz - t[8];
      const d5 = abx * cpx + aby * cpy + abz * cpz;
      const d6 = acx * cpx + acy * cpy + acz * cpz;
      if (d6 >= 0 && d5 <= d6) { u = 0; w = 1; } else {
        const vc = d1 * d4 - d3 * d2;
        const vb = d5 * d2 - d1 * d6;
        const va = d3 * d6 - d5 * d4;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { u = d1 / (d1 - d3); w = 0; } else if (vb <= 0 && d2 >= 0 && d6 <= 0) { u = 0; w = d2 / (d2 - d6); } else if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
          const s = (d4 - d3) / ((d4 - d3) + (d5 - d6));
          u = 1 - s; w = s;
        } else {
          const den = va + vb + vc;
          u = vb / den; w = vc / den;
        }
      }
    }
  }
  const qx = ax + abx * u + acx * w;
  const qy = ay + aby * u + acy * w;
  const qz = az + abz * u + acz * w;
  return Math.hypot(px - qx, py - qy, pz - qz);
}

/** Triangles in a uniform 3D grid, for nearest-surface queries. */
function distanceIndex(tris, cell = 0.08) {
  const buckets = new Map();
  const key = (i, j, k) => `${i}|${j}|${k}`;
  for (const t of tris) {
    const i0 = Math.floor(Math.min(t[0], t[3], t[6]) / cell);
    const i1 = Math.floor(Math.max(t[0], t[3], t[6]) / cell);
    const j0 = Math.floor(Math.min(t[1], t[4], t[7]) / cell);
    const j1 = Math.floor(Math.max(t[1], t[4], t[7]) / cell);
    const k0 = Math.floor(Math.min(t[2], t[5], t[8]) / cell);
    const k1 = Math.floor(Math.max(t[2], t[5], t[8]) / cell);
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        for (let k = k0; k <= k1; k += 1) {
          const kk = key(i, j, k);
          let list = buckets.get(kk);
          if (!list) buckets.set(kk, (list = []));
          list.push(t);
        }
      }
    }
  }
  return {
    nearest(px, py, pz) {
      const ci = Math.floor(px / cell);
      const cj = Math.floor(py / cell);
      const ck = Math.floor(pz / cell);
      let best = Infinity;
      for (let ring = 0; ring < 64; ring += 1) {
        for (let i = ci - ring; i <= ci + ring; i += 1) {
          for (let j = cj - ring; j <= cj + ring; j += 1) {
            for (let k = ck - ring; k <= ck + ring; k += 1) {
              // only the new shell each time round
              if (ring > 0 && Math.abs(i - ci) !== ring && Math.abs(j - cj) !== ring && Math.abs(k - ck) !== ring) continue;
              const list = buckets.get(key(i, j, k));
              if (!list) continue;
              for (const t of list) {
                const d = distanceToTriangle(px, py, pz, t);
                if (d < best) best = d;
              }
            }
          }
        }
        // Everything outside this ring is at least this far away.
        if (best <= ring * cell) return best;
      }
      return best;
    },
  };
}

// ------------------------------------------------------------- check 1
//
// The inner wall of the rib cage. A cage is not a surface: there is nothing
// between one rib and the next, so measuring a lung vertex's distance to the
// nearest rib would call a lobe bulging out through an intercostal gap "clear"
// — which is exactly the defect that shipped. Instead the cage's inner wall is
// reconstructed as a radial envelope: for each (angle, height) cell, the
// smallest radius any rib vertex reaches; cells that fall in a gap between ribs
// are filled by interpolating up the column, because the thorax contour varies
// smoothly with height even where the bone does not.
const THETA_BINS = 72;
const CAGE_Y_CELL = 0.03;

function cageEnvelope(rib) {
  const p = rib.positions;
  let yMin = Infinity; let yMax = -Infinity;
  for (let i = 1; i < p.length; i += 3) {
    if (p[i] < yMin) yMin = p[i];
    if (p[i] > yMax) yMax = p[i];
  }
  const rows = Math.max(2, Math.ceil((yMax - yMin) / CAGE_Y_CELL) + 1);
  const grid = new Float64Array(THETA_BINS * rows).fill(Infinity);
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]; const y = p[i + 1]; const z = p[i + 2];
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    let theta = Math.atan2(z, x);
    if (theta < 0) theta += Math.PI * 2;
    const ti = Math.min(THETA_BINS - 1, Math.floor((theta / (Math.PI * 2)) * THETA_BINS));
    const yi = Math.min(rows - 1, Math.max(0, Math.round((y - yMin) / CAGE_Y_CELL)));
    const at = ti * rows + yi;
    if (r < grid[at]) grid[at] = r;
  }
  // Fill the intercostal gaps by interpolating up each angular column.
  for (let ti = 0; ti < THETA_BINS; ti += 1) {
    const base = ti * rows;
    let previous = -1;
    for (let yi = 0; yi < rows; yi += 1) {
      if (!Number.isFinite(grid[base + yi])) continue;
      if (previous >= 0 && yi - previous > 1) {
        const r0 = grid[base + previous];
        const r1 = grid[base + yi];
        for (let k = previous + 1; k < yi; k += 1) {
          grid[base + k] = r0 + (r1 - r0) * ((k - previous) / (yi - previous));
        }
      }
      previous = yi;
    }
  }
  return {
    yMin,
    yMax,
    /** The cage's inner radius at an angle and height, or null outside it. */
    radiusAt(x, y, z) {
      if (y < yMin || y > yMax) return null;
      let theta = Math.atan2(z, x);
      if (theta < 0) theta += Math.PI * 2;
      const tf = (theta / (Math.PI * 2)) * THETA_BINS;
      const yf = (y - yMin) / CAGE_Y_CELL;
      const t0 = Math.floor(tf) % THETA_BINS;
      const t1 = (t0 + 1) % THETA_BINS;
      const y0 = Math.min(rows - 1, Math.max(0, Math.floor(yf)));
      const y1 = Math.min(rows - 1, y0 + 1);
      const tw = tf - Math.floor(tf);
      const yw = Math.min(1, Math.max(0, yf - y0));
      const corners = [
        grid[t0 * rows + y0], grid[t1 * rows + y0],
        grid[t0 * rows + y1], grid[t1 * rows + y1],
      ];
      if (corners.some((c) => !Number.isFinite(c))) {
        const finite = corners.filter(Number.isFinite);
        return finite.length ? Math.min(...finite) : null;
      }
      const a = corners[0] * (1 - tw) + corners[1] * tw;
      const b = corners[2] * (1 - tw) + corners[3] * tw;
      return a * (1 - yw) + b * yw;
    },
  };
}

function checkLungsInCage(lungs, rib) {
  const envelope = cageEnvelope(rib);
  const p = lungs.positions;
  let worst = Infinity;
  let at = null;
  let outside = 0;
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i]; const y = p[i + 1]; const z = p[i + 2];
    const wall = envelope.radiusAt(x, y, z);
    // A lung apex above the top rib or a base below the lowest is not the
    // cage's business; only the span the cage actually encloses is judged.
    if (wall === null) continue;
    const r = Math.hypot(x, z);
    const clearance = wall - r;
    if (clearance < 0) outside += 1;
    if (clearance < worst) { worst = clearance; at = [x, y, z]; }
  }
  return { worst: Number.isFinite(worst) ? worst : null, at, outside };
}

// ------------------------------------------------------------- check 2
//
// The dome must stay under the lung bases it carries. Bounding boxes are
// useless here — the lung's concave base is meant to sit down over the dome —
// so this works column by column: down a vertical line, the highest point of
// the diaphragm against the lowest point of the lung above it. Columns are
// taken from the exact surfaces by casting the line through the triangles, so
// there is no binning error on the steep flanks of the dome.
const COLUMN_STEP = 0.02;

function checkDomeUnderLungs(lungs, diaphragm) {
  const lungColumns = columnIndex(triangles(lungs));
  const domeColumns = columnIndex(triangles(diaphragm));
  const p = diaphragm.positions;
  let xMin = Infinity; let xMax = -Infinity; let zMin = Infinity; let zMax = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    xMin = Math.min(xMin, p[i]); xMax = Math.max(xMax, p[i]);
    zMin = Math.min(zMin, p[i + 2]); zMax = Math.max(zMax, p[i + 2]);
  }
  let worst = Infinity;
  let at = null;
  let columns = 0;
  for (let x = xMin; x <= xMax; x += COLUMN_STEP) {
    for (let z = zMin; z <= zMax; z += COLUMN_STEP) {
      const dome = domeColumns.crossings(x, z);
      if (!dome.length) continue;
      const lung = lungColumns.crossings(x, z);
      if (!lung.length) continue;
      const domeTop = Math.max(...dome);
      const lungFloor = Math.min(...lung);
      columns += 1;
      const clearance = lungFloor - domeTop;
      if (clearance < worst) { worst = clearance; at = [x, lungFloor, z]; }
    }
  }
  return { worst: Number.isFinite(worst) ? worst : null, at, columns };
}

// ------------------------------------------------------------- check 3
//
// The bronchial tree must stay inside the lungs. Blender assigns every lobar
// and segmental branch the dedicated `bronchus` material before joining the
// airway mesh.  Therefore the set is independent of whether a vertex happened
// to start inside the lung: an already-wrong branch can no longer disappear
// from the test simply because the rest-pose point-in-mesh query rejected it.
function insideLungs(columns, x, y, z) {
  const components = Array.isArray(columns) ? columns : [columns];
  return components.some((index) => {
    const hits = index.crossings(x, z);
    let above = 0;
    for (const h of hits) if (h > y) above += 1;
    return above % 2 === 1;
  });
}

function bronchialSet(airway) {
  const p = airway.positions;
  const members = [];
  for (let i = 0; i < p.length; i += 3) {
    if (airway.vertexMaterials?.[i / 3] === 'bronchus') members.push(i / 3);
  }
  return members;
}

function checkBronchiInLungs(airway, lungs, members) {
  const tris = triangles(lungs);
  const columns = lungComponentColumns(lungs);
  const near = distanceIndex(tris);
  const p = airway.positions;
  let worst = Infinity;
  let at = null;
  let escaped = 0;
  for (const vertex of members) {
    const i = vertex * 3;
    const x = p[i]; const y = p[i + 1]; const z = p[i + 2];
    const within = insideLungs(columns, x, y, z);
    const distance = near.nearest(x, y, z);
    const clearance = within ? distance : -distance;
    if (!within) escaped += 1;
    if (clearance < worst) { worst = clearance; at = [x, y, z]; }
  }
  return { worst: Number.isFinite(worst) ? worst : null, at, escaped };
}

// ------------------------------------------------------------- check 4
function checkInsideBody(parts, v) {
  let worst = Infinity;
  let at = null;
  let part = null;
  let outside = 0;
  for (const piece of parts) {
    const p = piece.positions;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i]; const y = p[i + 1]; const z = p[i + 2];
      const rho = Math.hypot(x, z);
      if (rho < 1e-9) continue;
      const { a, b } = shellAt(y, v);
      // How far out the skin is along this vertex's own direction.
      const cos = x / rho; const sin = z / rho;
      const reach = 1 / Math.sqrt((cos / a) ** 2 + (sin / b) ** 2);
      const clearance = reach - rho;
      if (clearance < 0) outside += 1;
      if (clearance < worst) { worst = clearance; at = [x, y, z]; part = piece.name; }
    }
  }
  return { worst: Number.isFinite(worst) ? worst : null, at, part, outside };
}

// ------------------------------------------------------------------- run
const f = (value) => (value === null ? '     —' : (value >= 0 ? ' ' : '') + value.toFixed(4));
const point = (p) => (p ? `(${p.map((n) => n.toFixed(3)).join(', ')})` : '—');

export async function runRespiratoryInterpenetrationCheck({ log = console.log } = {}) {
  await assertSceneMatches();
  const { json, bin } = readGlb(await readFile(MODEL));
  const parts = readParts(json, bin);
  for (const name of ['airway', 'spine', 'lungs', 'ribcage', 'diaphragm', 'body', 'mediastinum']) {
    if (!parts.has(name)) throw new Error(`the model is missing its ${name}`);
  }

  // The intrapulmonary airway, fixed once from the resting pose so the set
  // being judged cannot shrink as the lungs move off it.
  const members = bronchialSet(placed(parts.get('airway'), 0));

  const rows = [];
  for (let breath = -100; breath <= 100; breath += BREATH_STEP) {
    const v = breath / 100;
    const lungs = placed(parts.get('lungs'), v);
    const ribcage = placed(parts.get('ribcage'), v);
    const diaphragm = placed(parts.get('diaphragm'), v);
    const airway = placed(parts.get('airway'), v);
    const spine = placed(parts.get('spine'), v);
    const mediastinum = placed(parts.get('mediastinum'), v);
    rows.push({
      breath,
      cage: checkLungsInCage(lungs, ribcage),
      dome: checkDomeUnderLungs(lungs, diaphragm),
      bronchi: checkBronchiInLungs(airway, lungs, members),
      body: checkInsideBody([lungs, ribcage, diaphragm, airway, spine, mediastinum], v),
    });
  }

  log('');
  log('Respiratory interpenetration check — clearance in model units (1 unit ~ 30 cm of body).');
  log(`Negative means one structure has entered another. Tolerance ${TOLERANCE}. `
    + `${members.length} Blender-tagged lobar/segmental bronchus vertices are tested.`);
  log('');
  log('breath   lungs-in-cage  dome-under-lungs  bronchi-in-lungs   inside-body   worst part');
  for (const row of rows) {
    log(
      String(row.breath).padStart(4),
      '  ', f(row.cage.worst).padStart(12),
      '  ', f(row.dome.worst).padStart(14),
      '  ', f(row.bronchi.worst).padStart(14),
      '  ', f(row.body.worst).padStart(12),
      '  ', row.body.part ?? '—',
    );
  }

  const checks = [
    ['lungs-in-cage', 'cage', 'lung vertices outside the cage wall', (r) => r.cage.outside],
    ['dome-under-lungs', 'dome', 'columns where the dome is above the lung base', () => null],
    ['bronchi-in-lungs', 'bronchi', 'bronchial vertices outside the lungs', (r) => r.bronchi.escaped],
    ['inside-body', 'body', 'vertices outside the skin', (r) => r.body.outside],
  ];

  log('');
  const failures = [];
  for (const [label, key, countLabel, count] of checks) {
    let worstRow = null;
    for (const row of rows) {
      if (row[key].worst === null) continue;
      if (!worstRow || row[key].worst < worstRow[key].worst) worstRow = row;
    }
    if (!worstRow) { log(`${label.padEnd(18)} nothing to measure`); continue; }
    const result = worstRow[key];
    const rest = rows.find((row) => row.breath === 0)[key];
    const counted = count(worstRow);
    const detail = counted === null ? '' : `, ${counted} ${countLabel}`;
    const line = `${label.padEnd(18)} worst ${f(result.worst)} at breath ${String(worstRow.breath).padStart(4)}`
      + ` near ${point(result.at)}${result.part ? ` on ${result.part}` : ''}${detail}`
      + `  [at rest ${f(rest.worst)}]`;
    if (result.worst < -TOLERANCE) {
      failures.push({ label, worst: result.worst, breath: worstRow.breath, at: result.at, part: result.part });
      log(`FAIL  ${line}`);
    } else {
      log(`ok    ${line}`);
    }
  }

  log('');
  if (failures.length) {
    log(`${failures.length} of 4 checks found a structure passing through another.`);
  } else {
    log('No structure passes through another anywhere in the breath range.');
  }
  return { ok: failures.length === 0, failures, rows, tolerance: TOLERANCE, bronchialVertices: members.length };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const started = Date.now();
  const result = await runRespiratoryInterpenetrationCheck();
  console.log(`(${((Date.now() - started) / 1000).toFixed(1)}s)`);
  process.exit(result.ok ? 0 : 1);
}
