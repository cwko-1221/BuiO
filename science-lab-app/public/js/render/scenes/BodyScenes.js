import * as THREE from 'three';
import { palette, mat, roundedBox, torus, dynamicDisplay } from '../SceneKit.js';

// A standing cutaway model of the respiratory system. The head and abdomen are
// solid; the front of the thorax is opened so the airway, lungs, rib cage and
// diaphragm can be seen as real volumes inside it.
//
// Everything inside the chest is derived from one shape function, `cageInner`.
// The ribs are laid on it and the lungs are clamped inside it, so a lung cannot
// pass through a rib by construction rather than by being eyeballed into place;
// `getState().clearance` reports the tightest remaining gap so a test can hold
// that guarantee.

const LABEL_GROUP = 'organ-labels';
const ORGANS = ['nose', 'throat', 'trachea', 'bronchi', 'lungs', 'diaphragm'];
const ORGAN_TEXT = {
  nose: '鼻', throat: '喉', trachea: '氣管',
  bronchi: '支氣管', lungs: '肺', diaphragm: '橫膈膜',
};
const CALLOUTS = {
  nose: { box: [-2.75, 4.88, .8], anchor: [.02, 4.8, .78] },
  throat: { box: [-2.75, 4.18, .8], anchor: [0, 4.28, .22] },
  trachea: { box: [-2.75, 3.48, .8], anchor: [0, 3.44, .2] },
  bronchi: { box: [2.75, 3.3, .8], anchor: [.42, 2.86, .16] },
  lungs: { box: [2.75, 2.6, .8], anchor: [.86, 2.5, .3] },
  diaphragm: { box: [2.75, 1.9, .8], anchor: [.56, 1.86, .4] },
};
const BOX_W = 1.24;
const BOX_H = .5;

// The thorax, in model space.
const CAGE_TOP = 3.42;
const CAGE_BOTTOM = 1.62;
const RIB_COUNT = 8;
const CARINA_Y = 2.96;

const translate = (text) => window.BuiI18n?.sceneLabel?.(text) ?? text;

/**
 * The inside of the rib cage at a given height: a half-width across and a
 * half-depth front to back. Narrow at the first rib, widest low in the thorax,
 * drawing in again at the floor — the single source of truth for everything
 * that has to fit inside the chest.
 */
function cageInner(y) {
  const t = THREE.MathUtils.clamp((y - CAGE_BOTTOM) / (CAGE_TOP - CAGE_BOTTOM), 0, 1);
  const width = .82 - .42 * Math.pow(t, 1.6) + .05 * Math.sin(Math.PI * t);
  return { rx: width, rz: width * .72 };
}

const DIAPHRAGM_BASE = 1.72;
const DOME_RISE = { right: .54, left: .46 };

/** The height of the top of the diaphragm under a given point in the chest. */
function diaphragmHeight(x, z) {
  const { rx, rz } = cageInner(DIAPHRAGM_BASE + .25);
  const side = x >= 0 ? 1 : -1;
  const centre = side * rx * .44;
  const across = Math.hypot((x - centre) / (rx * .62), z / (rz * .84));
  const rise = side > 0 ? DOME_RISE.right : DOME_RISE.left;
  return DIAPHRAGM_BASE + rise * Math.sqrt(Math.max(1 - across * across, 0));
}

/** How far outside the cage a point lies: negative is safely inside. */
function cageEscape(x, y, z) {
  const { rx, rz } = cageInner(y);
  return Math.hypot(x / rx, z / rz) - 1;
}

/**
 * A flat card of text. The shared label plane is sized for bench name plates
 * and drawn without depth testing, which would let every card float in front of
 * the model instead of sitting inside its box.
 */
function makeTextPlane(text, {
  width = 1.15, height = .46, color = '#123b45', background = '#fffdf7',
  border = null, radius = .12, weight = 800, pad = .18,
} = {}) {
  const pixels = 256;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * pixels);
  canvas.height = Math.round(height * pixels);
  const context = canvas.getContext('2d');
  context.beginPath();
  context.roundRect(2, 2, canvas.width - 4, canvas.height - 4, radius * pixels);
  if (background !== 'none') { context.fillStyle = background; context.fill(); }
  if (border) { context.strokeStyle = border; context.lineWidth = Math.max(3, pixels * .022); context.stroke(); }

  const label = translate(text);
  const limit = canvas.width * (1 - pad);
  let size = canvas.height * .56;
  context.font = `${weight} ${size}px "Microsoft JhengHei", sans-serif`;
  while (size > 8 && context.measureText(label).width > limit) {
    size -= 2;
    context.font = `${weight} ${size}px "Microsoft JhengHei", sans-serif`;
  }
  context.fillStyle = color;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, canvas.width / 2, canvas.height / 2 + canvas.height * .02);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true }),
  );
  plane.userData.canvasTexture = texture;
  return plane;
}

/** A solid of revolution squashed front to back. */
function turned(profile, colour, options = {}, { depth = 1, segments = 44, open = 0 } = {}) {
  const points = profile.map(([radius, height]) => new THREE.Vector2(Math.max(radius, 0), height));
  // A lathe starts its sweep at +z, the face turned to the viewer, so an
  // opening of that many turns is centred on the front by starting half of it
  // round and stopping half of it short.
  const gap = Math.PI * 2 * open;
  const mesh = new THREE.Mesh(
    new THREE.LatheGeometry(points, segments, gap / 2, Math.PI * 2 - gap),
    mat(colour, options),
  );
  mesh.geometry.computeVertexNormals();
  mesh.scale.z = depth;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}

/** A smooth tube through a list of points. */
function tube(points, radius, material, { segments = 48, radial = 10 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, radial, false), material);
  mesh.castShadow = false;
  return mesh;
}

const MATERIALS = () => ({
  bone: mat(0xf6ecdc, { roughness: .46, metalness: .02, clearcoat: .18 }),
  cartilage: mat(0xe6f0ee, { roughness: .32, metalness: 0, clearcoat: .5, transparent: true, opacity: .95 }),
  airway: mat(0xdca3b4, { roughness: .44, clearcoat: .3 }),
  airwayDeep: mat(0xcf8fa4, { roughness: .46 }),
  lung: mat(0xdd7086, { roughness: .5, metalness: 0, clearcoat: .45, clearcoatRoughness: .38 }),
  muscle: mat(0xc9604f, { roughness: .58 }),
  tendon: mat(0xe8d8c6, { roughness: .5 }),
});

/**
 * One rib: it leaves the vertebra behind and below the head of the rib, runs
 * out and back, turns at the angle of the rib and sweeps forward and downward.
 * A rib is not a hoop in a horizontal plane — the drop from spine to sternum is
 * most of what makes a chest look like a chest.
 */
function ribCurve(level, side) {
  const y = THREE.MathUtils.lerp(CAGE_TOP, CAGE_BOTTOM, level);
  const { rx, rz } = cageInner(y);
  // Lower ribs slope more steeply towards the front.
  const drop = .12 + level * .46;
  const spine = -rz - .12;
  return [
    [side * .06, y, spine],
    [side * rx * .42, y - drop * .12, spine * .92],
    [side * rx * .86, y - drop * .3, -rz * .34],
    [side * rx * 1.0, y - drop * .52, rz * .28],
    [side * rx * .78, y - drop * .78, rz * .78],
    [side * rx * .46, y - drop, rz * .98],
  ];
}

// The fissures, as planes through the chest. Each is a unit normal and the
// distance to it, taken off an anatomy plate: the oblique runs from about the
// third thoracic vertebra behind to the sixth costal cartilage in front.
const OBLIQUE = { n: new THREE.Vector3(0, .819, .573), c: 1.994 };
const HORIZONTAL = { n: new THREE.Vector3(0, 1, 0), c: 2.62 };
const FISSURE_GAP = .018;

/**
 * A lung lobe, cut from the whole-lung hull. The hull is a deformed ellipsoid —
 * tapered to a rounded apex, flattened on the face towards the mediastinum,
 * scooped underneath. It is then sliced by the fissure planes that belong to
 * this lobe, and every vertex is pulled inside the rib cage, so a lobe can
 * neither cross a rib nor drift away from its neighbours.
 */
function makeLobe(side, material, {
  top, bottom, innerCut = .55, frontBias = 0, notch = 0, margin = .05, clips = [],
} = {}) {
  const geometry = new THREE.SphereGeometry(1, 40, 30);
  const position = geometry.attributes.position;
  const vertex = new THREE.Vector3();
  const midY = (top + bottom) / 2;
  const halfY = (top - bottom) / 2;

  for (let index = 0; index < position.count; index += 1) {
    vertex.fromBufferAttribute(position, index);
    const up = (vertex.y + 1) / 2;

    // Place the vertex in model space, then shape it there.
    let y = midY + vertex.y * halfY;
    const taper = .5 + .5 * Math.pow(1 - Math.abs(vertex.y) * .55, .8);
    let x = vertex.x * taper;
    let z = vertex.z * taper + frontBias;

    // Flatten the mediastinal surface, the flat face turned to the midline.
    const inner = side > 0 ? Math.min(x, 0) : Math.max(x, 0);
    x -= inner * innerCut;

    // The cardiac notch: the left lung is scooped out at the front for the heart.
    if (notch > 0) {
      const nearHeart = THREE.MathUtils.smoothstep(z, .1, .9) * THREE.MathUtils.smoothstep(up, .1, .55);
      x -= side * nearHeart * notch;
    }

    // Slice by this lobe's fissures. A vertex on the wrong side is dropped
    // onto the plane, which is what gives the lobe its flat fissure face.
    for (const { n, c, keep } of clips) {
      const distance = n.x * x + n.y * y + n.z * z - (c + keep * FISSURE_GAP);
      if (keep * distance < 0) {
        x -= n.x * distance;
        y -= n.y * distance;
        z -= n.z * distance;
      }
    }

    // Scale into the cage, then clamp hard inside it. Both use the same shape
    // function the ribs are laid on, so containment is exact, not eyeballed.
    const { rx, rz } = cageInner(y);
    const usable = 1 - margin;
    x = side * Math.abs(x) * rx * usable * .98;
    z *= rz * usable * .96;
    const escape = Math.hypot(x / (rx * usable), z / (rz * usable));
    if (escape > 1) { x /= escape; z /= escape; }
    // Lift the base of the lobe onto the diaphragm. This is the concave
    // inferior surface a lung actually has, and it guarantees that no part of
    // a lobe can end up inside a dome.
    y = Math.max(y, diaphragmHeight(x, z) + .03);
    y = THREE.MathUtils.clamp(y, DIAPHRAGM_BASE, CAGE_TOP + .12);
    position.setXYZ(index, x, y, z);
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = false;
  return mesh;
}

/** The bronchial tree below one main bronchus, branching by generations. */
function growBronchi(group, material, start, direction, radius, generation) {
  if (generation > 3 || radius < .018) return;
  const length = radius * (generation === 0 ? 7.5 : 5.4);
  const end = start.clone().addScaledVector(direction, length);
  // Airways run inside the lung, so a branch that would leave the cage is
  // drawn back inside it rather than allowed to grow through a rib.
  const { rx, rz } = cageInner(end.y);
  const reach = Math.hypot(end.x / (rx * .8), end.z / (rz * .8));
  if (reach > 1) { end.x /= reach; end.z /= reach; }
  const segment = tube(
    [start.toArray(), start.clone().addScaledVector(direction, length * .5).toArray(), end.toArray()],
    radius, material, { segments: 10, radial: 8 },
  );
  group.add(segment);
  const spread = .58 - generation * .08;
  for (const turn of [-1, 1]) {
    const next = direction.clone()
      .applyAxisAngle(new THREE.Vector3(0, 0, 1), turn * spread)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), turn * spread * .45)
      .normalize();
    growBronchi(group, material, end, next, radius * .68, generation + 1);
  }
}

/** A leader from a callout box to the point on the model that it names. */
function makeLeader(from, to, colour = 0x4f8ba0) {
  const group = new THREE.Group();
  const start = new THREE.Vector3(...from);
  const end = new THREE.Vector3(...to);
  const span = new THREE.Vector3().subVectors(end, start);
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(.014, .014, span.length(), 6),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: .95 }),
  );
  rod.position.copy(start).addScaledVector(span, .5);
  rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize());
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(.06, 12, 10),
    new THREE.MeshBasicMaterial({ color: colour }),
  );
  dot.position.copy(end);
  group.add(rod, dot);
  return group;
}

/** A grip on a moving part, sitting clear of everything else in the model. */
function makeHandle(colour) {
  const group = new THREE.Group();
  const grip = roundedBox(.34, .24, .2, colour, .07, 3, { roughness: .4, metalness: .05, castShadow: false });
  const collar = torus(.16, .035, 0xfffaf2, { roughness: .5 });
  collar.rotation.y = Math.PI / 2;
  collar.position.x = -.16;
  group.add(grip, collar);
  return group;
}

/** A 3D arrow: airflow along the airway, or the travel of ribs and diaphragm. */
function makeArrow(length, colour, { radius = .05 } = {}) {
  const group = new THREE.Group();
  const material = mat(colour, { roughness: .4, emissive: colour, emissiveIntensity: .4 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(length - .2, .05), 10), material);
  shaft.position.y = (length - .2) / 2;
  const head = new THREE.Mesh(new THREE.ConeGeometry(radius * 2.3, .22, 12), material);
  head.position.y = length - .1;
  group.add(shaft, head);
  group.userData.material = material;
  return group;
}

/**
 * The respiratory system: name the parts on the model, then work the ribs,
 * diaphragm and chest to drive a breath in and out.
 */
export function buildRespiratory(api) {
  const M = MATERIALS();
  const stage = new THREE.Group();
  api.root.add(stage);

  const plinth = turned([
    [0, 0], [.92, 0], [.97, .07], [.88, .15], [.46, .19], [.43, .3], [0, .32],
  ], 0xdfd4c4, { roughness: .6, metalness: .05 }, { depth: .86 });
  stage.add(plinth);

  const model = new THREE.Group();
  model.position.y = .34;
  stage.add(model);

  const organs = new THREE.Group();
  model.add(organs);

  // ------------------------------------------------------------- the airway
  const airway = turned([
    [0, 4.62], [.15, 4.56], [.18, 4.26], [.18, 4.08], [.16, 3.96], [0, 3.92],
  ], 0xdca3b4, { roughness: .44 }, { depth: .9 });
  organs.add(airway);

  // The larynx: the thyroid cartilage sits over the cricoid ring.
  const thyroid = turned([
    [0, 4.06], [.19, 4.02], [.21, 3.86], [.17, 3.74], [0, 3.72],
  ], 0xe6f0ee, { roughness: .32, clearcoat: .5 }, { depth: .88 });
  organs.add(thyroid);
  const cricoid = torus(.16, .035, 0xe6f0ee, { roughness: .32 });
  cricoid.rotation.x = Math.PI / 2;
  cricoid.scale.z = .9;
  cricoid.position.y = 3.68;
  organs.add(cricoid);

  const trachea = turned([
    [0, 3.72], [.145, 3.7], [.145, CARINA_Y + .04], [0, CARINA_Y],
  ], 0xcf8fa4, { roughness: .46 }, { depth: .92 });
  organs.add(trachea);
  // Tracheal cartilage is a stack of C-shaped rings, open at the back where the
  // oesophagus runs — drawing closed rings is the usual giveaway of a model
  // that was never checked against an anatomy plate.
  const ringCount = 8;
  for (let index = 0; index < ringCount; index += 1) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.158, .026, 8, 30, Math.PI * 1.42),
      M.cartilage,
    );
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = -Math.PI * .71;
    ring.scale.z = .92;
    ring.position.y = 3.64 - index * .085;
    organs.add(ring);
  }

  // ---------------------------------------------------------- bronchial tree
  const bronchi = new THREE.Group();
  organs.add(bronchi);
  const carina = new THREE.Vector3(0, CARINA_Y, 0);
  for (const side of [-1, 1]) {
    // The right main bronchus is wider, shorter and more vertical than the
    // left, which is why inhaled objects tend to go down the right side.
    const right = side > 0;
    const hilum = new THREE.Vector3(side * .3, CARINA_Y - (right ? .2 : .26), .02);
    const main = tube([carina.toArray(), hilum.toArray()], right ? .085 : .072, M.airwayDeep, { segments: 8 });
    bronchi.add(main);
    const direction = new THREE.Vector3(side * (right ? .74 : .86), right ? -.66 : -.5, .08).normalize();
    growBronchi(bronchi, M.airwayDeep, hilum, direction, right ? .066 : .058, 0);
  }

  // ------------------------------------------------------------- the lungs
  // Right lung: three lobes. Left: two, with the cardiac notch at the front.
  const lobes = [];
  const LOBE_PIVOT = CAGE_TOP + .12;
  const addLobe = (side, options) => {
    const lobe = makeLobe(side, M.lung.clone(), options);
    lobe.geometry.translate(0, -LOBE_PIVOT, 0);
    lobe.position.y = LOBE_PIVOT;
    organs.add(lobe);
    lobes.push({ lobe, side });
    return lobe;
  };
  const rightHull = { top: 3.34, bottom: 1.76, innerCut: .56, frontBias: .02 };
  const leftHull = { top: 3.34, bottom: 1.76, innerCut: .56, frontBias: .02, notch: .3 };
  const above = (plane) => ({ ...plane, keep: 1 });
  const below = (plane) => ({ ...plane, keep: -1 });
  // Right lung: superior, middle and inferior.
  addLobe(1, { ...rightHull, clips: [above(OBLIQUE), above(HORIZONTAL)] });
  addLobe(1, { ...rightHull, clips: [above(OBLIQUE), below(HORIZONTAL)] });
  addLobe(1, { ...rightHull, clips: [below(OBLIQUE)] });
  // Left lung: superior and inferior only, and it carries the cardiac notch.
  addLobe(-1, { ...leftHull, clips: [above(OBLIQUE)] });
  addLobe(-1, { ...leftHull, clips: [below(OBLIQUE)] });

  // --------------------------------------------------------- the diaphragm
  const diaphragmPivot = new THREE.Group();
  diaphragmPivot.position.y = DIAPHRAGM_BASE;
  model.add(diaphragmPivot);
  const diaphragmDomes = new THREE.Group();
  diaphragmPivot.add(diaphragmDomes);
  for (const side of [-1, 1]) {
    // The right dome sits higher, pushed up by the liver beneath it.
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1, 32, 18, 0, Math.PI * 2, 0, Math.PI * .5),
      M.muscle,
    );
    const { rx, rz } = cageInner(DIAPHRAGM_BASE + .25);
    dome.scale.set(rx * .62, side > 0 ? DOME_RISE.right : DOME_RISE.left, rz * .84);
    dome.position.set(side * rx * .44, 0, 0);
    diaphragmDomes.add(dome);
  }
  const centralTendon = new THREE.Mesh(
    new THREE.SphereGeometry(.3, 22, 12, 0, Math.PI * 2, 0, Math.PI * .5),
    M.tendon,
  );
  centralTendon.scale.set(.92, .46, .8);
  centralTendon.position.y = .3;
  diaphragmDomes.add(centralTendon);
  const rim = cageInner(DIAPHRAGM_BASE).rx * .96;
  const diaphragmSkirt = turned([
    [.34, .18], [rim * .74, .08], [rim, -.04], [rim, -.16], [.34, .04],
  ], 0xc9604f, { roughness: .58, side: THREE.DoubleSide }, { depth: .72 });
  diaphragmDomes.add(diaphragmSkirt);

  const diaphragmHandle = makeHandle(0x9b7fd4);
  diaphragmHandle.position.set(0, .04, 1.02);
  diaphragmHandle.rotation.z = Math.PI / 2;
  diaphragmPivot.add(diaphragmHandle);
  api.entity('diaphragm', '橫膈膜', diaphragmHandle, {
    adjustable: true, adjustAxis: 'vertical', namePlate: false, physics: false,
  });

  // ------------------------------------------------------------ the skeleton
  const ribCage = new THREE.Group();
  model.add(ribCage);
  const ribShell = new THREE.Group();
  ribCage.add(ribShell);

  const sternumTop = THREE.MathUtils.lerp(CAGE_TOP, CAGE_BOTTOM, .05) - .16;
  for (let index = 0; index < RIB_COUNT; index += 1) {
    const level = index / (RIB_COUNT - 1);
    for (const side of [-1, 1]) {
      const bone = tube(ribCurve(level, side), .024 + (1 - level) * .004, M.bone, { segments: 40, radial: 8 });
      ribShell.add(bone);

      // True ribs reach the breastbone through costal cartilage; the lower
      // ones join the arch above instead, and the last pair ends free.
      if (index >= RIB_COUNT - 1) continue;
      const tip = ribCurve(level, side).at(-1);
      const meetsSternum = index < 6;
      const target = meetsSternum
        ? [side * .09, sternumTop - index * .19, cageInner(tip[1]).rz * .92]
        : [side * .3, tip[1] + .2, cageInner(tip[1]).rz * .95];
      ribShell.add(tube([
        tip,
        [(tip[0] + target[0]) / 2, (tip[1] + target[1]) / 2 - .06, (tip[2] + target[2]) / 2 + .06],
        target,
      ], .024, M.cartilage, { segments: 14, radial: 8 }));
    }
  }

  const sternum = new THREE.Group();
  const manubrium = roundedBox(.3, .3, .09, 0xf6ecdc, .05, 3, { roughness: .46, castShadow: false });
  manubrium.position.y = sternumTop + .06;
  const body = roundedBox(.24, .84, .085, 0xf6ecdc, .04, 3, { roughness: .46, castShadow: false });
  body.position.y = sternumTop - .4;
  const xiphoid = roundedBox(.13, .2, .07, 0xf0e2d0, .04, 3, { roughness: .46, castShadow: false });
  xiphoid.position.y = sternumTop - .92;
  sternum.add(manubrium, body, xiphoid);
  sternum.position.z = cageInner(sternumTop - .4).rz * .94;
  ribShell.add(sternum);

  // The vertebral column, one body per rib pair.
  const spine = new THREE.Group();
  for (let index = 0; index <= RIB_COUNT; index += 1) {
    const y = THREE.MathUtils.lerp(CAGE_TOP + .12, CAGE_BOTTOM - .18, index / RIB_COUNT);
    const vertebra = new THREE.Mesh(new THREE.CylinderGeometry(.115, .12, .12, 14), M.bone);
    vertebra.position.set(0, y, -cageInner(y).rz - .14);
    spine.add(vertebra);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, .04, 14), M.cartilage);
    disc.position.set(0, y - .085, -cageInner(y).rz - .14);
    spine.add(disc);
    const spinous = roundedBox(.07, .1, .22, 0xf0e2d0, .03, 2, { roughness: .46, castShadow: false });
    spinous.position.set(0, y - .04, -cageInner(y).rz - .3);
    spine.add(spinous);
  }
  ribCage.add(spine);

  const ribHandle = makeHandle(0x9b7fd4);
  ribHandle.position.set(1.26, 3.0, .28);
  ribShell.add(ribHandle);
  api.entity('ribs', '肋骨', ribHandle, { adjustable: true, namePlate: false, physics: false });

  // --------------------------------------------------------------- the body
  const skinTone = 0xf0cdb2;
  const skin = { roughness: .56, metalness: .02, side: THREE.DoubleSide };
  const abdomen = turned([
    [0, .5], [.62, .52], [.74, .82], [.82, 1.34], [.85, 1.6], [0, 1.62],
  ], skinTone, { roughness: .56 }, { depth: .7 });
  model.add(abdomen);

  const torso = turned([
    [.85, 1.62], [.9, 2.05], [.98, 2.7], [1.02, 3.2], [.99, 3.5],
    [.8, 3.76], [.5, 3.94], [.3, 4.06], [.27, 4.24], [0, 4.26],
  ], skinTone, skin, { depth: .7, open: .44 });
  model.add(torso);
  const chestHandle = makeHandle(0x9b7fd4);
  chestHandle.position.set(-1.26, 2.44, .28);
  chestHandle.rotation.z = Math.PI;
  model.add(chestHandle);
  api.entity('chest', '胸腔', chestHandle, { adjustable: true, namePlate: false, physics: false });

  const neck = turned([
    [0, 4.18], [.27, 4.2], [.29, 4.46], [0, 4.48],
  ], skinTone, skin, { depth: .9, open: .26 });
  model.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(.54, 36, 26), mat(skinTone, { roughness: .56 }));
  head.scale.set(1, 1.14, 1.04);
  head.position.y = 4.94;
  model.add(head);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.17, .34, 16), mat(skinTone, { roughness: .56 }));
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 4.82, .56);
  model.add(nose);
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(.32, 22, 18), mat(skinTone, { roughness: .56 }));
    shoulder.scale.set(.78, .62, .66);
    shoulder.position.set(side * .8, 3.5, -.04);
    model.add(shoulder);
  }

  // ---------------------------------------------------- callouts and cards
  ORGANS.forEach((organ) => {
    const { box, anchor } = CALLOUTS[organ];
    const boxPosition = new THREE.Vector3(...box);
    stage.add(makeLeader(
      [boxPosition.x - Math.sign(boxPosition.x) * (BOX_W / 2), boxPosition.y, boxPosition.z],
      anchor,
    ));
    const well = roundedBox(BOX_W, BOX_H, .06, 0xf4ece2, .08, 3, { roughness: .66, castShadow: false });
    well.position.copy(boxPosition);
    stage.add(well);

    const ring = new THREE.Group();
    const outline = makeTextPlane('', {
      width: BOX_W + .06, height: BOX_H + .06, background: 'none', border: '#2f9c86', radius: .1,
    });
    outline.material.transparent = true;
    outline.material.opacity = .75;
    ring.add(outline);
    ring.userData.ring = outline;
    ring.position.copy(boxPosition);
    ring.position.z += .05;
    stage.add(ring);
    api.target(`slot-${organ}`, `${ORGAN_TEXT[organ]}的框`, ring, { radius: 1, labelSlot: true, physics: false });
  });

  const rack = new THREE.Group();
  rack.position.set(0, .28, 1.8);
  rack.rotation.x = -.44;
  stage.add(rack);
  const rackBoard = roundedBox(6.7, .94, .12, 0xe9ddcb, .1, 3, { roughness: .68, castShadow: false });
  rackBoard.position.z = -.09;
  rack.add(rackBoard);
  const rackOrder = ['lungs', 'trachea', 'diaphragm', 'nose', 'bronchi', 'throat'];
  rackOrder.forEach((organ, index) => {
    const chip = new THREE.Group();
    const cardBody = roundedBox(1, .42, .08, 0xffffff, .08, 3, { roughness: .5, castShadow: false });
    const face = makeTextPlane(ORGAN_TEXT[organ], { width: 1, height: .42, background: '#ffffff', border: '#2f9c86', radius: .08 });
    face.position.z = .045;
    chip.add(cardBody, face);
    chip.position.set(-2.68 + index * 1.07, 0, .08);
    rack.add(chip);
    api.entity(`chip-${organ}`, ORGAN_TEXT[organ], chip, { draggable: true, namePlate: false, physics: false });
  });

  // ------------------------------------------------------------- the arrows
  const airMarks = [];
  for (const spot of [[0, 5.4, .62], [0, 4.02, .24], [0, 3.3, .24], [.7, 2.84, .16]]) {
    const arrow = makeArrow(.44, 0x4aa8e0);
    arrow.position.set(...spot);
    model.add(arrow);
    airMarks.push(arrow);
  }
  const moveMarks = [];
  for (const side of [-1, 1]) {
    const arrow = makeArrow(.52, 0x9b7fd4);
    arrow.position.set(side * 1.5, side > 0 ? 3.0 : 2.44, .28);
    arrow.userData.outward = side;
    arrow.userData.axis = 'x';
    model.add(arrow);
    moveMarks.push(arrow);
  }
  const downArrow = makeArrow(.52, 0x9b7fd4);
  downArrow.position.set(0, DIAPHRAGM_BASE - .3, 1.06);
  downArrow.userData.axis = 'y';
  model.add(downArrow);
  moveMarks.push(downArrow);

  const readout = dynamicDisplay('把六個器官名牌放進正確的框', { scale: [2.9, .62] });
  readout.position.set(0, 5.18, .5);
  stage.add(readout);

  // -------------------------------------------------------- the breath model
  const placed = new Set();
  const values = { ribs: 0, diaphragm: 0, chest: 0 };
  const shown = { ribs: 0, diaphragm: 0, chest: 0 };
  let labelled = false;

  function breath() {
    return (shown.ribs + shown.diaphragm + shown.chest) / 300;
  }

  function phaseText() {
    if (!labelled) return ['把六個器官名牌放進正確的框', '#8fb7c4'];
    const value = breath();
    if (value > .45) return ['吸氣：肋骨向外、橫膈膜向下、胸腔擴大', '#8fd4e6'];
    if (value < -.45) return ['呼氣：肋骨向內、橫膈膜向上、胸腔縮小', '#f0a37a'];
    return ['拖動肋骨、橫膈膜和胸腔，做出一次呼吸', '#8fb7c4'];
  }

  /**
   * The tightest gap between any lung vertex and the inside of the rib cage,
   * in model units. Negative would mean a lobe is crossing a rib.
   */
  function clearance() {
    let worst = Infinity;
    const vertex = new THREE.Vector3();
    for (const { lobe } of lobes) {
      const position = lobe.geometry.attributes.position;
      const scale = lobe.scale;
      for (let index = 0; index < position.count; index += 6) {
        vertex.fromBufferAttribute(position, index);
        const x = vertex.x * scale.x;
        const y = vertex.y * scale.y + lobe.position.y;
        const z = vertex.z * scale.z;
        const { rx, rz } = cageInner(y);
        const escape = Math.hypot(x / rx, z / rz);
        worst = Math.min(worst, (1 - escape) * Math.min(rx, rz));
      }
    }
    return worst;
  }

  function refresh() {
    const value = breath();
    const spread = shown.ribs / 100;
    ribShell.scale.set(1 + spread * .1, 1, 1 + spread * .08);
    ribShell.position.y = spread * .12;

    const widen = shown.chest / 100;
    torso.scale.set(1 + widen * .1, 1, .7 * (1 + widen * .12));
    chestHandle.position.x = -1.26 - widen * .12;

    const drop = shown.diaphragm / 100;
    diaphragmPivot.position.y = DIAPHRAGM_BASE - drop * .26;
    diaphragmDomes.scale.y = 1 - drop * .42;

    // The lungs follow the cavity: they cannot grow past the cage that holds
    // them, so the fill is applied as a gentle swell well inside the clamp.
    const fill = THREE.MathUtils.clamp((value + 1) / 2, 0, 1);
    for (const { lobe } of lobes) {
      const grow = .97 + fill * .05;
      // Hung from the apex, so growth runs down into the space the diaphragm
      // has just left rather than pushing up through the first rib.
      lobe.scale.set(grow, 1 + drop * .1 + fill * .03, grow);
      lobe.material.color.lerpColors(new THREE.Color(0xc8607a), new THREE.Color(0xee8aa0), fill);
    }

    const flowing = Math.abs(value) > .2;
    for (const arrow of airMarks) {
      arrow.visible = labelled && flowing;
      arrow.rotation.set(value >= 0 ? Math.PI : 0, 0, 0);
    }
    for (const arrow of moveMarks) {
      arrow.visible = labelled;
      if (arrow.userData.axis === 'x') {
        const outward = arrow.userData.outward;
        arrow.rotation.set(0, 0, value >= 0 ? -outward * Math.PI / 2 : outward * Math.PI / 2);
      } else {
        arrow.rotation.set(value >= 0 ? Math.PI : 0, 0, 0);
      }
    }

    const [text, accent] = phaseText();
    readout.userData.setText(translate(text), accent);
  }

  api.onPreview = (subject, value) => {
    if (!(subject in values)) return;
    values[subject] = THREE.MathUtils.clamp(value, -100, 100);
  };

  api.onAction = (action) => {
    if (action.subject === LABEL_GROUP && (action.type === 'label-progress' || action.type === 'label')) {
      for (const organ of ORGANS) if (action.pairs?.[`chip-${organ}`]) placed.add(organ);
      labelled = placed.size >= ORGANS.length;
      if (labelled) api.sparkle(stage.localToWorld(new THREE.Vector3(0, 2.9, 1)), palette.mint, 14);
      refresh();
      return;
    }
    if (action.subject in values) {
      values[action.subject] = THREE.MathUtils.clamp(Number(action.value) || 0, -100, 100);
      refresh();
    }
  };

  refresh();

  return {
    update(time, dt = 1 / 60) {
      let moved = false;
      for (const key of Object.keys(values)) {
        const next = THREE.MathUtils.damp(shown[key], values[key], 9, dt);
        if (Math.abs(next - shown[key]) > .01) moved = true;
        shown[key] = next;
      }
      if (moved) refresh();
    },
    getState() {
      const value = breath();
      return {
        experiment: 'respiratory-system',
        labelled,
        placed: placed.size,
        ribs: Math.round(shown.ribs),
        diaphragm: Math.round(shown.diaphragm),
        chest: Math.round(shown.chest),
        breath: Number(value.toFixed(2)),
        inhaling: value > .45,
        exhaling: value < -.45,
        lobes: lobes.length,
        clearance: Number(clearance().toFixed(4)),
      };
    },
    dispose() {},
  };
}
