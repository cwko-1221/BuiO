import * as THREE from 'three';
import { palette, mat, roundedBox, torus, dynamicDisplay } from '../SceneKit.js';
import { cloneAnatomy } from '../AssetLibrary.js';

// A standing cutaway model of the respiratory system. The head and abdomen are
// solid; the front of the thorax is opened so the airway, lungs, rib cage and
// diaphragm can be seen as real volumes inside it.
//
// The anatomy itself is modelled in Blender and loaded as one glb — see
// art-source/respiratory. Inside that model the lungs are carved out of the
// chest cavity and off the diaphragm domes, so a lobe cannot cross a rib or
// sink into a dome by construction. The few numbers repeated here are measured
// off the exported file, and the breath maths keeps the lung bases and the dome
// summit moving by exactly the same distance so that carved fit survives the
// animation.
//
// Colour and material live entirely in the Blender source. Nothing in this file
// should hold a second palette.

const LABEL_GROUP = 'organ-labels';
const ORGANS = ['nose', 'throat', 'trachea', 'bronchi', 'lungs', 'diaphragm'];
const ORGAN_TEXT = {
  nose: '鼻', throat: '喉', trachea: '氣管',
  bronchi: '支氣管', lungs: '肺', diaphragm: '橫膈膜',
};
const CALLOUTS = {
  // box is in stage space; aim is a point in MODEL space on or just outside the
  // organ, chosen so a ray in from the box lands on a face a student can see.
  nose: { box: [-2.75, 5.16, .8], aim: [0, 4.82, .56] },
  throat: { box: [-2.75, 4.34, .8], aim: [0, 3.85, 0] },
  trachea: { box: [-2.75, 3.52, .8], aim: [0, 3.5, 0] },
  bronchi: { box: [2.75, 3.34, .8], aim: [.4, 2.8, .04] },
  lungs: { box: [2.75, 2.74, .8], aim: [.75, 2.62, .05] },
  diaphragm: { box: [2.75, 2.14, .8], aim: [.55, 2.1, .34] },
};
// Muted against the anatomy: these mark what you may pull and where the air
// goes, and should not out-read the organs.
const HANDLE_COLOUR = 0x8d86a6;
const MOVE_COLOUR = 0x8d86a6;
const AIR_COLOUR = 0x5f93ad;
const BOX_W = 1.24;
const BOX_H = .5;

const translate = (text) => window.BuiI18n?.sceneLabel?.(text) ?? text;

const DIAPHRAGM_BASE = 1.72;
// Taken from the model: the dome spans 1.720..2.260 and the lungs 2.034..3.440.
const DOME_APEX = 2.26;
const LUNG_APEX = 3.44;
const LUNG_BASE = 2.034;
// How far the floor of the chest travels over one breath.
const FLOOR_TRAVEL = .26;
// Scaling the dome by this much moves its summit exactly FLOOR_TRAVEL while
// the rim stays pinned to its attachment.
const DOME_SQUASH = FLOOR_TRAVEL / (DOME_APEX - DIAPHRAGM_BASE);
// Shrinking the lungs about their apex by this much raises their base by
// exactly FLOOR_TRAVEL, which is what keeps them sitting on the dome.
const LUNG_SQUEEZE = FLOOR_TRAVEL / (LUNG_APEX - LUNG_BASE);

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

/** A leader from a callout box to the point on the model that it names. */
function makeLeader(from, to, colour = 0x4f8ba0) {
  const group = new THREE.Group();
  // Unit-length rod along +y, so it can be re-aimed every frame by transform
  // alone rather than by rebuilding geometry.
  const rod = new THREE.Mesh(
    new THREE.CylinderGeometry(.014, .014, 1, 6),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: .95 }),
  );
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(.055, 14, 12),
    // Anchors sit inside the thorax, behind the sternum and the lungs, so a
    // depth-tested marker is simply invisible where it matters most.
    new THREE.MeshBasicMaterial({ color: colour, depthTest: false, transparent: true }),
  );
  dot.renderOrder = 30;
  group.add(rod);
  group.userData.rod = rod;
  group.userData.dot = dot;
  group.userData.aimAt = (startLocal, endWorld) => {
    const endLocal = group.worldToLocal(endWorld.clone());
    const span = endLocal.clone().sub(startLocal);
    const length = span.length();
    if (length < 1e-4) return;
    rod.position.copy(startLocal).addScaledVector(span, .5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), span.clone().normalize());
    rod.scale.set(1, length, 1);
  };
  group.userData.aimAt(new THREE.Vector3(...from), new THREE.Vector3(...to));
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
  // These are affordances, not the subject. Emissive arrows were reading as the
  // brightest thing in frame.
  const material = mat(colour, { roughness: .45, emissive: colour, emissiveIntensity: .1 });
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
  const stage = new THREE.Group();
  api.root.add(stage);

  const plinth = turned([
    [0, 0], [.92, 0], [.97, .07], [.88, .15], [.46, .19], [.43, .3], [0, .32],
  ], 0xdfd4c4, { roughness: .6, metalness: .05 }, { depth: .86 });
  stage.add(plinth);

  const model = new THREE.Group();
  model.position.y = .34;
  stage.add(model);

  // The anatomy itself is modelled in Blender and loaded as one glb: the lungs
  // are carved out of the chest cavity and the diaphragm domes there, so the
  // lobes cannot cross a rib and their bases sit on the domes by construction.
  // tmp/bl-lungs.py, tmp/bl-skeleton.py and tmp/bl-export.py rebuild it.
  const organs = new THREE.Group();
  model.add(organs);

  // Substance, per part. envMapIntensity decides how much of the room each
  // one picks up: bone is dry and takes little, serous membrane is wet and
  // takes a lot.
  const FINISH = {
    lungs: { clearcoat: .62, clearcoatRoughness: .24, roughness: .48, env: .9 },
    airway: { clearcoat: .45, clearcoatRoughness: .3, roughness: .5, env: .8 },
    diaphragm: { clearcoat: .3, clearcoatRoughness: .42, roughness: .62, env: .5 },
    ribcage: { clearcoat: .12, clearcoatRoughness: .5, roughness: .58, env: .35 },
    spine: { clearcoat: .12, clearcoatRoughness: .5, roughness: .58, env: .35 },
  };

  /**
   * Re-finish a part loaded from the glb. The exporter gives every mesh a
   * MeshStandardMaterial, which cannot hold a clearcoat, so wet surfaces have
   * to be promoted to MeshPhysicalMaterial here or they stay matte.
   */
  const finish = (mesh, name) => {
    const recipe = FINISH[name];
    if (!recipe) return;
    mesh.traverse((child) => {
      if (!child.isMesh || !child.material) return;
      const source = child.material;
      const upgraded = new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(upgraded, source);
      upgraded.vertexColors = source.vertexColors;
      upgraded.roughness = recipe.roughness;
      upgraded.clearcoat = recipe.clearcoat;
      upgraded.clearcoatRoughness = recipe.clearcoatRoughness;
      upgraded.envMapIntensity = recipe.env;
      child.material = upgraded;
      source.dispose();
      // Contact is what tells the eye one thing rests on another.
      child.castShadow = true;
      child.receiveShadow = true;
    });
  };

  const part = (name) => {
    const mesh = cloneAnatomy(name);
    if (!mesh) return null;
    finish(mesh, name);
    organs.add(mesh);
    return mesh;
  };

  const lungs = part('lungs');
  if (lungs) {
    // Hung from the apex: the apex is anchored under the first rib and it is
    // the base that rides up and down on the diaphragm.
    lungs.geometry = lungs.geometry.clone();
    lungs.geometry.translate(0, -LUNG_APEX, 0);
    lungs.position.y = LUNG_APEX;
  }
  const airway = part('airway');
  const spine = part('spine');
  const ribShell = part('ribcage') || new THREE.Group();
  if (!ribShell.parent) organs.add(ribShell);

  // One lung shown through, so the bronchial tree inside it can be seen: the
  // convention an atlas uses, and the only way the 支氣管 callout has anything
  // to point at.
  if (lungs) {
    lungs.traverse((child) => {
      if (!child.isMesh) return;
      child.material.vertexColors = true;
      child.material.transparent = true;
      child.material.opacity = .86;
      child.material.depthWrite = true;
      child.material.roughness = .5;
      child.material.clearcoat = .35;
    });
  }

  // The rib cage is its own group so the breath can swing it outwards.
  const ribCage = new THREE.Group();
  model.add(ribCage);
  organs.remove(ribShell);
  ribCage.add(ribShell);
  if (spine) {
    organs.remove(spine);
    ribCage.add(spine);
  }

  const diaphragmPivot = new THREE.Group();
  model.add(diaphragmPivot);
  const diaphragmSheet = cloneAnatomy('diaphragm');
  if (diaphragmSheet) {
    // Put the mesh's origin on the rim it hinges about, so scaling domes the
    // sheet instead of moving it.
    diaphragmSheet.geometry = diaphragmSheet.geometry.clone();
    diaphragmSheet.geometry.translate(0, -DIAPHRAGM_BASE, 0);
    diaphragmSheet.position.y = 0;
    diaphragmPivot.position.y = DIAPHRAGM_BASE;
    diaphragmPivot.add(diaphragmSheet);
  }

  const diaphragmHandle = makeHandle(HANDLE_COLOUR);
  diaphragmHandle.position.set(0, .04, 1.02);
  diaphragmHandle.rotation.z = Math.PI / 2;
  diaphragmPivot.add(diaphragmHandle);
  api.entity('diaphragm', '橫膈膜', diaphragmHandle, {
    adjustable: true, adjustAxis: 'vertical', namePlate: false, physics: false,
  });

  const ribHandle = makeHandle(HANDLE_COLOUR);
  ribHandle.position.set(1.26, 3.0, .28);
  ribShell.add(ribHandle);
  api.entity('ribs', '肋骨', ribHandle, { adjustable: true, namePlate: false, physics: false });

  // --------------------------------------------------------------- the body
  const skinTone = 0xd8b59c;
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
  const chestHandle = makeHandle(HANDLE_COLOUR);
  chestHandle.position.set(-1.26, 2.44, .28);
  chestHandle.rotation.z = Math.PI;
  model.add(chestHandle);
  api.entity('chest', '胸腔', chestHandle, { adjustable: true, namePlate: false, physics: false });

  const neck = turned([
    [0, 4.18], [.27, 4.2], [.29, 4.46], [0, 4.48],
  ], skinTone, skin, { depth: .9, open: .26 });
  model.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(.54, 36, 26), mat(skinTone, { roughness: .56 }));
  head.scale.set(.78, 1.14, .96);
  head.position.y = 4.94;
  model.add(head);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(.17, .34, 16), mat(skinTone, { roughness: .56 }));
  // A cone points along +y; +PI/2 about x sends that to +z, towards the
  // viewer. -PI/2 sent it to -z, burying the tip inside the skull and turning
  // the flat base towards the camera.
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 4.82, .56);
  model.add(nose);
  // Pharynx: from the top of the larynx up behind the nasal cavity. It leans
  // back as it climbs, which is why the throat is behind the mouth.
  const pharynx = tube([
    [0, 3.94, .02], [0, 4.2, -.02], [0, 4.46, -.04], [0, 4.7, .04], [0, 4.86, .18],
  ], .15, mat(0xdca3b4, { roughness: .46, clearcoat: .35 }), { segments: 18, radial: 14 });
  organs.add(pharynx);

  const boneTone = mat(0xf0e2d0, { roughness: .5, clearcoat: .14 });
  for (const side of [-1, 1]) {
    // The clavicle: the landmark a lung apex is measured against, and the only
    // strut holding the shoulder off the chest. Its S-curve runs forward at the
    // sternal end and back at the acromial end.
    organs.add(tube([
      [side * .1, 3.36, .44],
      [side * .34, 3.4, .42],
      [side * .58, 3.38, .28],
      [side * .74, 3.32, .08],
      [side * .82, 3.28, -.04],
    ], .045, boneTone, { segments: 24, radial: 10 }));
  }

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(.32, 22, 18), mat(skinTone, { roughness: .56 }));
    shoulder.scale.set(.74, .58, .64);
    shoulder.position.set(side * .84, 3.28, -.04);
    model.add(shoulder);
  }

  // ---------------------------------------------------- callouts and cards
  // Which mesh each callout is naming, so its leader can be landed on the
  // surface of that mesh rather than at a typed-in coordinate.
  const organMesh = {
    nose, throat: airway, trachea: airway, bronchi: airway,
    lungs, diaphragm: diaphragmSheet,
  };
  const raycaster = new THREE.Raycaster();
  stage.updateWorldMatrix(true, true);
  const leaders = [];

  /**
   * Pin the end of a leader to the organ it names. The dot becomes a child of
   * the organ's own mesh, so when the chest moves the label keeps pointing at
   * the same piece of anatomy instead of sliding onto its neighbour — the lung
   * marker used to end up on the diaphragm by full exhale.
   */
  function pinToOrgan(organ, edgeStage, aimModel) {
    const mesh = organMesh[organ];
    const aimWorld = model.localToWorld(aimModel.clone());
    if (!mesh) return { host: stage, local: stage.worldToLocal(aimWorld.clone()) };
    const start = stage.localToWorld(edgeStage.clone());
    const direction = aimWorld.clone().sub(start).normalize();
    raycaster.set(start, direction);
    // Far enough to pass through the organ and out the other side.
    raycaster.far = start.distanceTo(aimWorld) * 2.4;
    const hit = raycaster.intersectObject(mesh, true)[0];
    if (!hit) {
      // Silence here is how five wrong leaders shipped: the fallback looks
      // plausible on screen while pointing at nothing.
      console.warn('respiratory: the ' + organ + ' leader missed its organ and fell back to its aim point');
      return { host: stage, local: stage.worldToLocal(aimWorld.clone()) };
    }
    const host = hit.object;
    host.updateWorldMatrix(true, false);
    return { host, local: host.worldToLocal(hit.point.clone()) };
  }

  ORGANS.forEach((organ) => {
    const { box, aim } = CALLOUTS[organ];
    const boxPosition = new THREE.Vector3(...box);
    const edge = new THREE.Vector3(
      boxPosition.x - Math.sign(boxPosition.x) * (BOX_W / 2),
      boxPosition.y,
      boxPosition.z,
    );
    const pin = pinToOrgan(organ, edge, new THREE.Vector3(...aim));
    const leader = makeLeader(edge.toArray(), edge.toArray());
    stage.add(leader);
    pin.host.add(leader.userData.dot);
    leader.userData.dot.position.copy(pin.local);
    leaders.push({ leader, edge, pin });
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
    const arrow = makeArrow(.44, AIR_COLOUR);
    arrow.position.set(...spot);
    model.add(arrow);
    airMarks.push(arrow);
  }
  const moveMarks = [];
  for (const side of [-1, 1]) {
    const arrow = makeArrow(.52, MOVE_COLOUR);
    arrow.position.set(side * 1.5, side > 0 ? 3.0 : 2.44, .28);
    arrow.userData.outward = side;
    arrow.userData.axis = 'x';
    model.add(arrow);
    moveMarks.push(arrow);
  }
  const downArrow = makeArrow(.52, MOVE_COLOUR);
  downArrow.position.set(0, DIAPHRAGM_BASE - .3, 1.06);
  downArrow.userData.axis = 'y';
  model.add(downArrow);
  moveMarks.push(downArrow);

  const readout = dynamicDisplay('把六個器官名牌放進正確的框', { scale: [2.7, .58] });
  readout.position.set(0, 1.05, 1.35);
  stage.add(readout);

  // -------------------------------------------------------- the breath model
  const placed = new Set();
  // The thorax moves as one piece, so there is one number for the whole of it:
  // -100 fully out, +100 fully in. Every handle writes to this, and every part
  // reads from it.
  const HANDLES = new Set(['ribs', 'diaphragm', 'chest']);
  let wanted = 0;
  let held = 0;
  let labelled = false;

  function breath() {
    return held / 100;
  }

  function phaseText() {
    if (!labelled) return ['把六個器官名牌放進正確的框', '#8fb7c4'];
    const value = breath();
    if (value > .45) return ['吸氣：肋骨向外、橫膈膜向下、胸腔擴大', '#8fd4e6'];
    if (value < -.45) return ['呼氣：肋骨向內、橫膈膜向上、胸腔縮小', '#f0a37a'];
    return ['拖動肋骨、橫膈膜和胸腔，做出一次呼吸', '#8fb7c4'];
  }

  function refresh() {
    const value = breath();
    // Bucket-handle movement of the ribs.
    ribShell.scale.set(1 + value * .1, 1, 1 + value * .08);
    ribShell.position.y = value * .12;
    ribHandle.position.x = 1.26 + value * .1;

    // The chest wall rides out with the ribs it is built on.
    torso.scale.set(1 + value * .1, 1, .7 * (1 + value * .12));
    chestHandle.position.x = -1.26 - value * .12;

    // The rim stays put; the summit travels FLOOR_TRAVEL, matching the lung
    // bases resting on it.
    const drop = value;
    if (diaphragmSheet) diaphragmSheet.scale.y = 1 - drop * DOME_SQUASH;

    // The lungs follow the cavity: they cannot grow past the cage that holds
    // them, so the fill is applied as a gentle swell well inside the clamp.
    const fill = THREE.MathUtils.clamp((value + 1) / 2, 0, 1);
    // The lungs fill the space the ribs and diaphragm have opened. They are
    // carved to the resting cavity, so the swell stays small and cannot push a
    // lobe back out through a rib.
    if (lungs) {
      // Across, the lungs follow the rib cage. Down, they follow the floor of
      // the chest exactly, so their base stays in contact with the dome
      // instead of passing through it.
      const grow = .98 + fill * .04;
      lungs.scale.set(grow, 1 + drop * LUNG_SQUEEZE, grow);
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

    for (const { leader, edge, pin } of leaders) {
      pin.host.updateWorldMatrix(true, false);
      leader.userData.aimAt(edge, leader.userData.dot.getWorldPosition(new THREE.Vector3()));
    }

    const [text, accent] = phaseText();
    readout.userData.setText(translate(text), accent);
  }

  api.onPreview = (subject, value) => {
    if (!HANDLES.has(subject)) return;
    wanted = THREE.MathUtils.clamp(value, -100, 100);
  };

  api.onAction = (action) => {
    if (action.subject === LABEL_GROUP && (action.type === 'label-progress' || action.type === 'label')) {
      for (const organ of ORGANS) if (action.pairs?.[`chip-${organ}`]) placed.add(organ);
      labelled = placed.size >= ORGANS.length;
      if (labelled) api.sparkle(stage.localToWorld(new THREE.Vector3(0, 2.9, 1)), palette.mint, 14);
      refresh();
      return;
    }
    if (HANDLES.has(action.subject)) {
      wanted = THREE.MathUtils.clamp(Number(action.value) || 0, -100, 100);
      refresh();
    }
  };

  refresh();

  return {
    update(time, dt = 1 / 60) {
      const next = THREE.MathUtils.damp(held, wanted, 9, dt);
      if (Math.abs(next - held) < .01) return;
      held = next;
      refresh();
    },
    getState() {
      const value = breath();
      return {
        experiment: 'respiratory-system',
        labelled,
        placed: placed.size,
        // One mechanism, so the three report the same travel.
        ribs: Math.round(held),
        diaphragm: Math.round(held),
        chest: Math.round(held),
        breath: Number(value.toFixed(2)),
        inhaling: value > .45,
        exhaling: value < -.45,
        model: lungs ? 'blender' : 'missing',
      };
    },
    dispose() {},
  };
}
