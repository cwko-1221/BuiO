import * as THREE from 'three';
import { palette, mat, roundedBox, torus, dynamicDisplay } from '../SceneKit.js';
import { cloneAnatomy } from '../AssetLibrary.js';

// A standing clinical cutaway of the respiratory system. The head, neck and
// posterior/lateral thorax are a translucent Blender-authored orientation
// shell; the anterior thorax is truly open so the airway, lungs, rib cage and
// diaphragm can be inspected from multiple angles.
//
// The anatomy itself is modelled in Blender and loaded as one glb — see
// art-source/respiratory. Inside that model the lungs are carved out of the
// chest cavity and off the diaphragm domes.  Blender also owns the inhalation
// and exhalation shape keys: the browser only blends those validated anatomical
// endpoints.  It never scales an organ as if it were a rubber toy.
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
  nose: { box: [-2.75, 5.16, .8], aim: [0, 4.80, .48] },
  throat: { box: [-2.75, 4.34, .8], aim: [0, 4.18, -.08] },
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
    // Anatomical landmarks obey scene depth.  A dot hidden by a rib should not
    // float over it and teach the wrong spatial relationship.
    new THREE.MeshBasicMaterial({ color: colour, depthTest: true, depthWrite: false, transparent: true }),
  );
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

/** Blend the two Blender-authored breathing endpoints without stacking them. */
function setBreathMorph(root, value) {
  if (!root) return;
  const inhale = Math.max(value, 0);
  const exhale = Math.max(-value, 0);
  root.traverse((child) => {
    const dictionary = child.morphTargetDictionary;
    const influences = child.morphTargetInfluences;
    if (!dictionary || !influences) return;
    if (dictionary.Inhale !== undefined) influences[dictionary.Inhale] = inhale;
    if (dictionary.Exhale !== undefined) influences[dictionary.Exhale] = exhale;
  });
}

/**
 * The respiratory system: name the parts on the model, then work the ribs,
 * diaphragm and chest to drive a breath in and out.
 */
export function buildRespiratory(api) {
  const stage = new THREE.Group();
  api.root.add(stage);
  // Rotate complete label assemblies (card, outline and text) toward the
  // camera. Rotating only the text plane makes it shear through its 3D card as
  // soon as the learner leaves the anterior view.
  const billboards = [];
  const orientationMarkers = [];
  const labelSlots = new Map();
  const labelChips = new Map();

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
    lungs: { clearcoat: .26, clearcoatRoughness: .34, roughness: .56, env: .72 },
    airway: { clearcoat: .16, clearcoatRoughness: .42, roughness: .52, env: .62 },
    diaphragm: { clearcoat: .1, clearcoatRoughness: .52, roughness: .64, env: .42 },
    ribcage: { clearcoat: .04, clearcoatRoughness: .6, roughness: .62, env: .3 },
    spine: { clearcoat: .04, clearcoatRoughness: .6, roughness: .62, env: .3 },
    body: { clearcoat: .06, clearcoatRoughness: .64, roughness: .62, env: .34 },
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
      const sources = Array.isArray(child.material) ? child.material : [child.material];
      const upgraded = sources.map((source) => {
        const physical = new THREE.MeshPhysicalMaterial();
        THREE.MeshStandardMaterial.prototype.copy.call(physical, source);
        physical.vertexColors = source.vertexColors;
        physical.roughness = recipe.roughness;
        physical.clearcoat = recipe.clearcoat;
        physical.clearcoatRoughness = recipe.clearcoatRoughness;
        physical.envMapIntensity = recipe.env;
        source.dispose();
        return physical;
      });
      child.material = Array.isArray(child.material) ? upgraded : upgraded[0];
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
  const airway = part('airway');
  const bodyShell = part('body');
  const spine = part('spine');
  const ribShell = part('ribcage') || new THREE.Group();
  if (!ribShell.parent) organs.add(ribShell);

  // Keep the patient's right lung close to natural opacity while the left is
  // an explicit dissection window.  That preserves a realistic pleural
  // surface and still exposes the intrapulmonary tree and cardiac notch.
  if (lungs) {
    lungs.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        const dissected = material.name?.includes('lung_L');
        material.vertexColors = true;
        material.transparent = true;
        material.opacity = dissected ? .38 : .90;
        material.depthWrite = !dissected;
        material.side = THREE.DoubleSide;
        material.roughness = .54;
        material.clearcoat = .22;
      }
    });
  }

  if (bodyShell) {
    bodyShell.renderOrder = -4;
    bodyShell.traverse((child) => {
      if (!child.isMesh) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        material.transparent = true;
        material.opacity = .28;
        material.depthWrite = false;
        material.side = THREE.DoubleSide;
      }
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
  const diaphragmSheet = part('diaphragm');
  if (diaphragmSheet) {
    organs.remove(diaphragmSheet);
    diaphragmPivot.add(diaphragmSheet);
  }

  // One breath, one control. Earlier revisions exposed three handles that all
  // wrote the same value; that implied the ribs, diaphragm and chest could be
  // driven independently. This single timeline is deliberately coupled.
  const breathHandle = makeHandle(HANDLE_COLOUR);
  breathHandle.position.set(0, .04, 1.02);
  breathHandle.rotation.z = Math.PI / 2;
  diaphragmPivot.add(breathHandle);
  api.entity('breath', '呼吸時間軸', breathHandle, {
    adjustable: true, adjustAxis: 'vertical', namePlate: false, physics: false,
  });

  // Standard anterior-view orientation: the patient's right is on the
  // learner's left.  Never leave this implicit in an anatomy lesson.
  for (const [x, text] of [[-1.48, 'R｜病人右'], [1.48, 'L｜病人左']]) {
    const marker = makeTextPlane(text, {
      width: .9, height: .32, color: '#f8ffff', background: '#123b45',
      border: '#8fd4e6', radius: .08, weight: 900, pad: .12,
    });
    marker.position.set(x, 4.02, .92);
    stage.add(marker);
    billboards.push(marker);
    orientationMarkers.push({ marker, screenX: x });
  }

  // ---------------------------------------------------- callouts and cards
  // Which mesh each callout is naming, so its leader can be landed on the
  // surface of that mesh rather than at a typed-in coordinate.
  const organMesh = {
    nose: airway, throat: airway, trachea: airway, bronchi: airway,
    lungs, diaphragm: diaphragmSheet,
  };
  const raycaster = new THREE.Raycaster();
  stage.updateWorldMatrix(true, true);
  const leaders = [];

  function nearestSurfaceVertex(mesh, aimWorld) {
    let best = null;
    let bestDistance = Infinity;
    const local = new THREE.Vector3();
    const world = new THREE.Vector3();
    mesh.updateWorldMatrix(true, true);
    mesh.traverse((child) => {
      if (!child.isMesh) return;
      const position = child.geometry?.getAttribute('position');
      if (!position) return;
      child.updateWorldMatrix(true, false);
      for (let index = 0; index < position.count; index += 1) {
        local.fromBufferAttribute(position, index);
        world.copy(local);
        child.localToWorld(world);
        const distance = world.distanceToSquared(aimWorld);
        if (distance >= bestDistance) continue;
        bestDistance = distance;
        best = { host: child, local: local.clone(), distance: Math.sqrt(distance) };
      }
    });
    return best;
  }

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
      // Aiming through an open fissure can legitimately miss a thin branching
      // structure. Land on the nearest actual vertex instead of silently
      // falling back to an arbitrary point in empty space.
      const nearest = nearestSurfaceVertex(mesh, aimWorld);
      if (nearest) return nearest;
      console.warn('respiratory: the ' + organ + ' leader has no renderable organ surface');
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
    leaders.push({ leader, edge, pin, slot: null, side: Math.sign(boxPosition.x) });
    const slotBillboard = new THREE.Group();
    slotBillboard.position.copy(boxPosition);
    stage.add(slotBillboard);
    const well = roundedBox(BOX_W, BOX_H, .06, 0xf4ece2, .08, 3, { roughness: .66, castShadow: false });
    slotBillboard.add(well);

    const ring = new THREE.Group();
    const outline = makeTextPlane('', {
      width: BOX_W + .06, height: BOX_H + .06, background: 'none', border: '#2f9c86', radius: .1,
    });
    outline.material.transparent = true;
    outline.material.opacity = .75;
    ring.add(outline);
    ring.userData.ring = outline;
    ring.position.z = .05;
    slotBillboard.add(ring);
    billboards.push(slotBillboard);
    slotBillboard.userData.screenLayout = { x: boxPosition.x, y: boxPosition.y, depth: boxPosition.z };
    labelSlots.set(organ, slotBillboard);
    leaders[leaders.length - 1].slot = slotBillboard;
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
    billboards.push(chip);
    labelChips.set(organ, chip);
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

  const readout = dynamicDisplay('把六個器官名牌放進正確的框', { scale: [5.6, .64] });
  readout.position.set(0, 5.72, 1.18);
  stage.add(readout);

  // -------------------------------------------------------- the breath model
  const placed = new Set();
  // The thorax moves as one coupled system: -100 end-expiration, +100
  // end-inspiration. Legacy subjects are accepted only while replaying an old
  // saved experiment; the live scene exposes the single `breath` controller.
  const HANDLES = new Set(['breath', 'ribs', 'diaphragm', 'chest']);
  let wanted = 0;
  let held = 0;
  let airflow = 0;
  let labelled = false;

  function breath() {
    return held / 100;
  }

  function phaseText() {
    if (!labelled) return ['把六個器官名牌放進正確的框', '#8fb7c4'];
    const value = breath();
    const volume = Math.round(100 + value * 12);
    if (Math.abs(airflow) <= .12) {
      return [`暫停｜相對胸腔容積 ${volume}%｜肺泡壓＝大氣壓｜氣流 0`, '#8fb7c4'];
    }
    if (airflow > 0) {
      return [`吸氣｜相對胸腔容積 ${volume}%｜肺泡壓＜大氣壓｜氣流 → 肺`, '#8fd4e6'];
    }
    return [`呼氣｜相對胸腔容積 ${volume}%｜肺泡壓＞大氣壓｜氣流 → 外`, '#f0a37a'];
  }

  function refresh() {
    const value = breath();
    // Blender owns the deformation.  In the rib target the posterior joints
    // remain almost fixed while lateral/anterior portions lift (bucket- and
    // pump-handle components); in the diaphragm target the attached rim stays
    // fixed while both domes contract and flatten.  Lung bases and distal
    // bronchi share that deformation field.
    setBreathMorph(ribShell, value);
    setBreathMorph(lungs, value);
    setBreathMorph(airway, value);
    setBreathMorph(diaphragmSheet, value);
    setBreathMorph(bodyShell, value);

    // Airflow is proportional to volume change, not lung volume.  At either
    // endpoint the model may be fully inflated/deflated but the arrows must
    // disappear once motion stops (a brief end-inspiratory/expiratory pause).
    const flowing = Math.abs(airflow) > .12;
    for (const arrow of airMarks) {
      arrow.visible = labelled && flowing;
      arrow.rotation.set(airflow > 0 ? Math.PI : 0, 0, 0);
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

  const cameraWorld = new THREE.Quaternion();
  const parentWorld = new THREE.Quaternion();
  const stageWorld = new THREE.Quaternion();
  const inverseStageWorld = new THREE.Quaternion();
  const rightLocal = new THREE.Vector3();
  const towardWorld = new THREE.Vector3();
  const towardLocal = new THREE.Vector3();
  const labelWorld = new THREE.Vector3();
  const labelLocal = new THREE.Vector3();

  /**
   * Keep the annotation board in a camera-facing plane around the anatomy.
   * Fixed world-space callouts collapse into a vertical pile in lateral view;
   * this preserves the authored left/right rows while the anatomy itself is
   * free to rotate through the full clinical atlas view.
   */
  function updateCameraLabels() {
    if (!api.camera) return;
    stage.updateWorldMatrix(true, true);
    api.camera.getWorldQuaternion(cameraWorld);
    stage.getWorldQuaternion(stageWorld);
    inverseStageWorld.copy(stageWorld).invert();

    rightLocal.set(1, 0, 0).applyQuaternion(cameraWorld).applyQuaternion(inverseStageWorld);
    rightLocal.y = 0;
    rightLocal.normalize();
    api.camera.getWorldDirection(towardWorld).negate();
    towardWorld.y = 0;
    towardWorld.normalize();
    towardLocal.copy(towardWorld).applyQuaternion(inverseStageWorld);
    towardLocal.y = 0;
    towardLocal.normalize();

    for (const slot of labelSlots.values()) {
      const layout = slot.userData.screenLayout;
      slot.position.copy(rightLocal).multiplyScalar(layout.x).addScaledVector(towardLocal, layout.depth);
      slot.position.y = layout.y;
    }

    // Right/left is useful in anterior and posterior views, but dishonest in a
    // true lateral view where the two sides project onto one another.
    const showLaterality = Math.abs(towardLocal.z) >= .5;
    const posterior = towardLocal.z < 0;
    for (const { marker, screenX } of orientationMarkers) {
      marker.visible = showLaterality;
      const x = posterior ? -screenX : screenX;
      marker.position.copy(rightLocal).multiplyScalar(x).addScaledVector(towardLocal, .92);
      marker.position.y = 4.02;
    }

    readout.position.copy(towardLocal).multiplyScalar(1.18).addScaledVector(rightLocal, -.28);
    readout.position.y = 5.72;
    stage.updateWorldMatrix(true, true);

    // A seated card follows its moving callout slot. Unseated cards remain on
    // the physical rack so the first task still behaves like a drag puzzle.
    for (const organ of placed) {
      const slot = labelSlots.get(organ);
      const chip = labelChips.get(organ);
      if (!slot || !chip) continue;
      slot.getWorldPosition(labelWorld).addScaledVector(towardWorld, .065);
      labelLocal.copy(labelWorld);
      rack.worldToLocal(labelLocal);
      chip.position.copy(labelLocal);
    }

    for (const { edge, slot, side } of leaders) {
      edge.copy(slot.position).addScaledVector(rightLocal, -side * BOX_W / 2);
    }

    for (const billboard of billboards) {
      billboard.parent?.getWorldQuaternion(parentWorld);
      billboard.quaternion.copy(parentWorld.invert().multiply(cameraWorld));
    }
  }

  return {
    update(time, dt = 1 / 60) {
      // A slow deep breath takes seconds, not a single UI frame.
      const next = THREE.MathUtils.damp(held, wanted, 2.4, dt);
      updateCameraLabels();
      for (const { leader, edge, pin } of leaders) {
        pin.host.updateWorldMatrix(true, false);
        leader.userData.aimAt(edge, leader.userData.dot.getWorldPosition(labelWorld));
      }
      if (Math.abs(next - held) < .01) {
        if (airflow !== 0) {
          airflow = 0;
          refresh();
        }
        return;
      }
      airflow = (next - held) / Math.max(dt, 1 / 240);
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
        breathControl: Math.round(held),
        breath: Number(value.toFixed(2)),
        ribMorph: Number(Math.abs(value).toFixed(4)),
        lungMorph: Number(Math.abs(value).toFixed(4)),
        inhaling: value > .45,
        exhaling: value < -.45,
        airflow: Number(airflow.toFixed(2)),
        model: lungs ? 'blender' : 'missing',
      };
    },
    dispose() {},
  };
}
