import * as THREE from 'three';
import {
  palette, mat, roundedBox, cylinder, sphere, torus, makeBottle, makeBeaker,
  makeButton, makeGoggles, makeScientist, makeLamp, makeTargetRing, makeLabelSprite,
} from '../SceneKit.js';

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const IDENTITY = new THREE.Quaternion();

function addEntity(api, id, label, object, position, options = {}) {
  object.position.set(...position);
  api.root.add(object);
  api.entity(id, label, object, options);
  return object;
}

function localToWorld(api, position) {
  api.root.updateWorldMatrix(true, false);
  return api.root.localToWorld(position.clone());
}

function rootQuaternion(api, localQuaternion = IDENTITY) {
  api.root.updateWorldMatrix(true, false);
  return api.root.getWorldQuaternion(new THREE.Quaternion()).multiply(localQuaternion);
}

function addStaticBox(api, id, center, halfExtents, quaternion = IDENTITY, options = {}) {
  return api.addStaticBox?.(
    id,
    localToWorld(api, center),
    halfExtents.clone(),
    { ...options, quaternion: rootQuaternion(api, quaternion) },
  );
}

function addStaticObject(api, id, object, options = {}) {
  return api.addStaticCollider?.(id, object, options);
}

function addSocket(api, id, label, position, radius = .55, color = palette.mint, options = {}) {
  const socket = makeTargetRing(color, radius);
  socket.position.copy(position);
  if (options.vertical) socket.rotation.x = Math.PI / 2;
  if (options.rotation) socket.rotation.set(...options.rotation);
  api.root.add(socket);
  api.target(id, label, socket, {
    radius,
    physics: {
      shape: options.shape || 'cuboid',
      halfExtents: options.halfExtents || [radius, options.halfHeight ?? .34, radius],
      padding: options.padding ?? .04,
    },
  });
  return socket;
}

function label(text, position, scale = .45, options = {}) {
  const { portraitMultiplier = 1, ...style } = options;
  const sprite = makeLabelSprite(text, { scale: scale * 1.24, ...style });
  sprite.userData.portraitMultiplier = portraitMultiplier;
  sprite.position.set(...position);
  return sprite;
}

function tubeBetween(start, end, radius, color, options = {}) {
  const direction = end.clone().sub(start);
  const mesh = cylinder(radius, direction.length(), color, options);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  return mesh;
}

function curvedTube(points, radius, color, options = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const mesh = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(24, points.length * 12), radius, 8, false),
    mat(color, options),
  );
  mesh.castShadow = options.castShadow ?? true;
  return { curve, mesh };
}

function setMaterialOpacity(object, opacity) {
  object.traverse((child) => {
    if (!child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.transparent = true;
      material.opacity = opacity;
    });
  });
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function makeHazardTag(color, glyph) {
  const tag = new THREE.Group();
  const plate = roundedBox(.72, .86, .105, color, .1, 4, { roughness: .58 });
  plate.position.y = .43;
  const badge = cylinder(.19, .025, palette.white, { roughness: .65 });
  badge.rotation.x = Math.PI / 2;
  badge.position.set(0, .47, .068);
  const mark = label(glyph, [0, .47, .092], .18, { background: 'rgba(255,255,255,0)' });
  const hole = torus(.07, .018, palette.deep, { roughness: .7 });
  hole.position.set(0, .76, .066);
  tag.add(plate, badge, mark, hole);
  tag.userData.physics = { shape: 'cuboid', halfExtents: [.37, .44, .07] };
  return tag;
}

function makeStorageCabinet() {
  const cabinet = new THREE.Group();
  const back = roundedBox(2.0, 2.25, .16, 0x285969, .12, 4, { roughness: .72 });
  back.position.set(0, 1.13, -.34);
  const left = roundedBox(.16, 2.25, .78, 0x3e7480, .08, 3, { roughness: .68 });
  left.position.set(-.92, 1.13, 0);
  const right = left.clone();
  right.position.x = .92;
  const top = roundedBox(2.0, .16, .78, 0x3e7480, .08, 3, { roughness: .68 });
  top.position.set(0, 2.18, 0);
  const shelf = roundedBox(1.84, .14, .75, 0xc6e8e1, .06, 3, { roughness: .66 });
  shelf.position.set(0, .16, 0);
  const header = roundedBox(1.72, .48, .06, palette.mint, .1, 3, { roughness: .56 });
  header.position.set(0, 1.82, .43);
  cabinet.add(back, left, right, top, shelf, header);
  return cabinet;
}

function makeBag() {
  const bag = new THREE.Group();
  const body = roundedBox(1.22, .82, .68, 0xdf695e, .2, 5, { roughness: .78 });
  body.position.y = .42;
  const pocket = roundedBox(.72, .4, .08, 0xf59b78, .1, 3, { roughness: .75 });
  pocket.position.set(0, .37, .37);
  const handle = torus(.32, .055, palette.deep, { arc: Math.PI, roughness: .82 });
  handle.rotation.z = Math.PI;
  handle.position.y = .85;
  const zip = roundedBox(.72, .025, .025, 0xffdb70, .01, 1, { metalness: .25 });
  zip.position.set(0, .69, .36);
  bag.add(body, pocket, handle, zip);
  return bag;
}

function makeEyewash() {
  const group = new THREE.Group();
  const base = cylinder(.48, .12, 0x567983, { metalness: .28, roughness: .42 });
  base.position.y = .06;
  const stand = cylinder(.105, 1.34, palette.metal, { metalness: .58, roughness: .22 });
  stand.position.y = .73;
  const bowl = new THREE.Mesh(
    new THREE.CylinderGeometry(.62, .34, .25, 32, 1, true),
    mat(0xbde9eb, { metalness: .24, roughness: .22, side: THREE.DoubleSide }),
  );
  bowl.position.y = 1.41;
  const drain = cylinder(.1, .035, 0x34545c, { metalness: .65 });
  drain.position.y = 1.3;
  const nozzles = [];
  for (const x of [-.21, .21]) {
    const stem = cylinder(.052, .25, palette.metal, { metalness: .62, roughness: .2 });
    stem.position.set(x, 1.57, 0);
    const cap = sphere(.095, 0x62b7c8, { roughness: .3 });
    cap.position.set(x, 1.71, 0);
    group.add(stem, cap);
    nozzles.push(cap);
  }
  const pedalArm = roundedBox(.17, .1, .78, 0x6f878d, .04, 2, { metalness: .35, roughness: .4 });
  pedalArm.position.set(0, .13, .44);
  const pedal = roundedBox(.66, .11, .38, palette.yellow, .07, 3, { roughness: .52 });
  pedal.position.set(0, .18, .82);
  group.add(base, stand, bowl, drain, pedalArm, pedal);
  group.userData.pedal = pedal;
  group.userData.nozzles = nozzles;
  return group;
}

function makeFireBlanketStation() {
  const group = new THREE.Group();
  const caseMesh = roundedBox(1.18, 1.52, .34, 0xdd4e45, .16, 5, { roughness: .58 });
  caseMesh.position.y = .82;
  const front = roundedBox(.92, 1.18, .04, 0xf06657, .11, 4, { roughness: .5 });
  front.position.set(0, .86, .19);
  const fabric = roundedBox(.92, .86, .06, 0xf5ead4, .07, 3, { roughness: .96 });
  fabric.position.set(0, .47, .2);
  fabric.scale.y = .04;
  fabric.visible = false;
  const tabs = [];
  for (const x of [-.27, .27]) {
    const tab = roundedBox(.16, .52, .075, palette.yellow, .04, 2, { roughness: .68 });
    tab.position.set(x, .2, .22);
    tabs.push(tab);
    group.add(tab);
  }
  group.add(caseMesh, front, fabric);
  group.userData.tabs = tabs;
  group.userData.fabric = fabric;
  return group;
}

export function buildSafety(api) {
  let alive = true;
  let eyewashTimer = 0;
  let blanketProgress = 0;

  const lane = roundedBox(5.8, .026, 1.08, 0x77d6bf, .08, 2, {
    transparent: true, opacity: .28, roughness: .75, castShadow: false,
  });
  lane.position.set(.1, .025, 2.15);
  api.root.add(lane);
  for (let x = -2.35; x <= 2.35; x += .78) {
    const chevron = new THREE.Mesh(
      new THREE.ConeGeometry(.16, .34, 3),
      mat(0xd7fff5, { transparent: true, opacity: .55, emissive: 0x70d8bd, emissiveIntensity: .18 }),
    );
    chevron.rotation.z = -Math.PI / 2;
    chevron.position.set(x, .055, 2.15);
    api.root.add(chevron);
  }
  const exitFrame = roundedBox(1.55, 2.55, .18, 0x2c6975, .12, 4, { roughness: .75 });
  exitFrame.position.set(4.95, 1.28, 2.17);
  api.root.add(exitFrame, label('出口', [4.95, 1.35, 2.29], .4, {
    background: '#d9fff2', portraitMultiplier: .68,
  }));
  addStaticObject(api, 'safety-exit-frame', exitFrame, { friction: .72 });

  const cabinet = makeStorageCabinet();
  cabinet.position.set(-4.25, 0, 1.5);
  api.root.add(cabinet, label('個人物品收納', [-3.95, 2.62, 1.5], .38, { portraitMultiplier: .68 }));
  addStaticBox(api, 'storage-back', new THREE.Vector3(-4.25, 1.13, 1.16), new THREE.Vector3(1, 1.12, .08));
  addStaticBox(api, 'storage-left', new THREE.Vector3(-5.17, 1.13, 1.5), new THREE.Vector3(.08, 1.12, .39));
  addStaticBox(api, 'storage-right', new THREE.Vector3(-3.33, 1.13, 1.5), new THREE.Vector3(.08, 1.12, .39));
  addStaticBox(api, 'storage-shelf', new THREE.Vector3(-4.25, .16, 1.5), new THREE.Vector3(.92, .07, .38));
  // Accept at the open front lip, then slide the fitted bag onto the shelf.
  // This keeps the direct visible approach clear of the cabinet side wall.
  addSocket(api, 'storage', '書包收納格', new THREE.Vector3(-4.25, .58, 2.65), .62, palette.mint, {
    vertical: true, halfExtents: [.72, .56, .44],
  });

  const scientist = addEntity(api, 'scientist', '小科學家', makeScientist(), [2.72, .56, .6], { targetOnly: true });
  scientist.scale.setScalar(.94);
  const faceSocket = addSocket(api, 'scientist', '眼睛護具位置', new THREE.Vector3(2.72, 2.82, 1.1), .48, palette.yellow, {
    vertical: true, halfExtents: [.58, .58, .35],
  });
  faceSocket.userData.socketType = 'face-protection';
  addStaticBox(api, 'scientist-feet', new THREE.Vector3(2.72, .48, .6), new THREE.Vector3(.72, .52, .5));

  const rack = new THREE.Group();
  const rackPole = cylinder(.07, 2.1, palette.metal, { metalness: .55, roughness: .24 });
  rackPole.position.y = 1.08;
  const tray = roundedBox(1.25, .12, .52, 0xbadfe1, .06, 3, { metalness: .12, roughness: .42 });
  tray.position.set(0, 2.02, .05);
  const sign = roundedBox(1.08, .38, .06, palette.yellow, .08, 3, { roughness: .6 });
  sign.position.set(0, 2.38, -.17);
  rack.add(rackPole, tray, sign);
  rack.position.set(-2.65, 0, .25);
  api.root.add(rack, label('護眼設備', [-2.72, 2.48, .34], .3, {
    background: '#fff1aa', portraitMultiplier: .68,
  }));
  addStaticBox(api, 'goggle-rack-tray', new THREE.Vector3(-2.65, 2.02, .3), new THREE.Vector3(.63, .06, .27));
  const goggles = addEntity(api, 'goggles', '安全眼鏡', makeGoggles(), [-2.65, 2.19, .34], {
    draggable: true,
    physics: { shape: 'cuboid', density: .42, friction: .52, restitution: .08, linearDamping: 4.2 },
  });
  goggles.rotation.y = -.08;

  const bag = addEntity(api, 'bag', '阻塞通道的書包', makeBag(), [-.2, .05, 2.15], {
    draggable: true,
    physics: { shape: 'cuboid', density: .48, friction: .9, restitution: .04 },
  });

  const eyewash = makeEyewash();
  eyewash.position.set(-1.25, 0, -1.55);
  addEntity(api, 'eyewash', '緊急洗眼器', eyewash, [-1.25, 0, -1.55], { targetOnly: true });
  addStaticBox(api, 'eyewash-base', new THREE.Vector3(-1.25, .72, -1.55), new THREE.Vector3(.46, .72, .42));
  const eyewashTarget = addSocket(api, 'eyewash', '洗眼器腳踏啟動器', new THREE.Vector3(-1.25, .2, -.72), .42, palette.blue, {
    halfExtents: [.52, .9, .45],
  });
  eyewashTarget.userData.socketType = 'foot-pedal';
  api.root.add(label('踏下並持續沖洗', [-1.08, 2.12, -1.55], .35, { portraitMultiplier: .68 }));

  const jets = [];
  for (const x of [-.21, .21]) {
    const jet = cylinder(.035, .76, 0x8cddff, {
      transparent: true, opacity: .76, roughness: .04, emissive: 0x49bff1, emissiveIntensity: .25,
      castShadow: false, depthWrite: false,
    });
    jet.position.set(-1.25 + x, 2.03, -1.55);
    jet.scale.y = .001;
    api.root.add(jet);
    jets.push(jet);
  }

  const blanket = makeFireBlanketStation();
  addEntity(api, 'fire-blanket', '防火氈箱', blanket, [1.03, .16, -2.15], { targetOnly: true });
  addStaticBox(api, 'blanket-case', new THREE.Vector3(1.03, .98, -2.15), new THREE.Vector3(.6, .78, .2));
  const fireTarget = addSocket(api, 'fire-blanket', '防火氈拉帶', new THREE.Vector3(1.03, .42, -1.9), .4, palette.coral, {
    vertical: true, halfExtents: [.52, .82, .38],
  });
  fireTarget.userData.socketType = 'pull-tabs';
  api.root.add(label('拉下兩條黃色拉帶', [1.03, 2.18, -2.15], .32, { portraitMultiplier: .68 }));

  const cardShelf = roundedBox(2.15, .14, .58, 0x386774, .06, 3, { roughness: .68 });
  cardShelf.position.set(-3.72, .08, -1.75);
  api.root.add(cardShelf);
  addStaticBox(api, 'hazard-card-shelf', cardShelf.position.clone(), new THREE.Vector3(1.08, .07, .3));
  const splashCard = addEntity(api, 'splash-card', '眼睛濺液情境牌', makeHazardTag(palette.blue, '眼'), [-4.15, .16, -1.7], {
    draggable: true,
    physics: { shape: 'cuboid', density: .35, friction: .72, restitution: .05 },
  });
  const fireCard = addEntity(api, 'fire-card', '小型衣物起火情境牌', makeHazardTag(palette.coral, '火'), [-3.25, .16, -1.7], {
    draggable: true,
    physics: { shape: 'cuboid', density: .35, friction: .72, restitution: .05 },
  });

  const consoleGroup = new THREE.Group();
  const consoleBase = roundedBox(1.3, .72, .95, 0x2a6570, .18, 5, { roughness: .63 });
  consoleBase.position.y = .36;
  const button = makeButton(palette.mint);
  button.position.set(0, .75, .08);
  consoleGroup.add(consoleBase, button);
  addEntity(api, 'safety-button', '安全檢查完成按鈕', consoleGroup, [4.25, 0, -1.75], { tappable: true });
  addStaticObject(api, 'safety-console', consoleBase, { friction: .74 });
  api.root.add(label('完成安全檢查', [4.25, 1.48, -1.75], .34, { portraitMultiplier: .68 }));

  const statusLights = [0, 1, 2, 3].map((index) => {
    const light = sphere(.085, 0x7a4a43, { emissive: 0x541d18, emissiveIntensity: .25, roughness: .24 });
    light.position.set(3.95 + index * .2, 1.18, -1.28);
    api.root.add(light);
    return light;
  });
  let checks = 0;
  const completeCheck = () => {
    const light = statusLights[Math.min(checks, statusLights.length - 1)];
    light.material.color.setHex(palette.mint);
    light.material.emissive.setHex(palette.mint);
    light.material.emissiveIntensity = 1.2;
    checks += 1;
  };

  api.onAction = (action) => {
    if (action.subject === 'goggles') {
      api.moveObject(goggles, new THREE.Vector3(2.72, 2.82, 1.1), { duration: .62, scale: .88 });
      api.sparkle(new THREE.Vector3(2.72, 2.82, 1.12), palette.yellow, 12);
      completeCheck();
    }
    if (action.subject === 'bag') {
      api.moveObject(bag, new THREE.Vector3(-4.25, .24, 1.72), { duration: .58, scale: .9 });
      completeCheck();
    }
    if (action.subject === 'splash-card') {
      api.moveObject(splashCard, new THREE.Vector3(-1.25, .26, -.73), { duration: .44, scale: .56 });
      eyewashTimer = 3.2;
      api.pressButton(eyewash.userData.pedal);
      api.playSound('splash');
      completeCheck();
    }
    if (action.subject === 'fire-card') {
      api.moveObject(fireCard, new THREE.Vector3(1.03, .48, -1.89), { duration: .44, scale: .56 });
      blanket.userData.tabs.forEach((tab) => { tab.position.y = -.12; });
      blanket.userData.fabric.visible = true;
      blanketProgress = 1;
      api.playSound('whoosh');
      completeCheck();
    }
    if (action.subject === 'safety-button') {
      api.pressButton(button);
      statusLights.forEach((light) => {
        light.material.color.setHex(palette.mint);
        light.material.emissive.setHex(palette.mint);
        light.material.emissiveIntensity = 1.4;
      });
    }
  };

  return {
    update(time, dt = .016) {
      if (!alive) return;
      scientist.position.y = .56 + Math.sin(time * 1.45) * .012;
      if (eyewashTimer > 0) {
        eyewashTimer -= dt;
        jets.forEach((jet, index) => {
          jet.visible = true;
          jet.scale.y = .86 + Math.sin(time * 19 + index) * .12;
          jet.rotation.z = (index ? -.13 : .13);
        });
      } else jets.forEach((jet) => { jet.scale.y = .001; jet.visible = false; });
      if (blanketProgress > 0) {
        blanketProgress = Math.max(0, blanketProgress - dt * .75);
        blanket.userData.fabric.scale.y = Math.min(1, blanket.userData.fabric.scale.y + dt * 2.4);
        blanket.userData.fabric.position.y = .47 - blanket.userData.fabric.scale.y * .35;
      }
    },
    getState() {
      return {
        experiment: 'lab-safety',
        completedChecks: checks,
        gogglesEquipped: !goggles.parent || goggles.position.x > 1.5,
        passageClear: bag.position.x < -3,
        eyewashActive: eyewashTimer > 0,
        fireBlanketDeployed: blanket.userData.fabric.visible,
      };
    },
    dispose() { alive = false; },
  };
}

function makeHands() {
  const group = new THREE.Group();
  const skin = 0xeeb58f;
  const overlays = [];
  for (const [handIndex, x] of [-.66, .66].entries()) {
    const palm = roundedBox(.88, .22, 1.2, skin, .22, 5, { roughness: .72 });
    palm.position.set(x, .15, .1);
    palm.rotation.y = handIndex ? -.07 : .07;
    group.add(palm);
    const thumb = roundedBox(.28, .18, .7, skin, .12, 4, { roughness: .72 });
    thumb.position.set(x + (handIndex ? .52 : -.52), .13, .2);
    thumb.rotation.y = handIndex ? -.62 : .62;
    group.add(thumb);
    for (let finger = 0; finger < 4; finger += 1) {
      const length = [.79, .9, .87, .73][finger];
      const digit = roundedBox(.16, .18, length, skin, .075, 3, { roughness: .72 });
      digit.position.set(x + (finger - 1.5) * .18, .14, -.88 - (length - .75) * .42);
      group.add(digit);
      const nail = roundedBox(.105, .025, .18, 0xf8d6c6, .035, 2, { roughness: .56 });
      nail.position.set(digit.position.x, .245, digit.position.z - length * .34);
      group.add(nail);
    }
    const patch = roundedBox(.66, .018, .75, palette.mint, .13, 3, {
      transparent: true, opacity: .06, emissive: palette.mint, emissiveIntensity: .24,
      castShadow: false, depthWrite: false,
    });
    patch.position.set(x, .274, .12);
    group.add(patch);
    overlays.push(patch);
  }
  group.userData.coverage = overlays;
  return group;
}

function makePumpBottle(color, labelText) {
  // Keep the pump assembly in scene units. The Blender bottle carries its own
  // scale, so parenting pump parts directly beneath it would scale them a
  // second time and leave a visible gap above the neck.
  const group = new THREE.Group();
  const bottle = makeBottle(color, labelText, .92, { open: true });
  group.add(bottle);
  const pumpStem = cylinder(.075, .34, 0xf0f5ec, { roughness: .4 });
  pumpStem.position.y = 1.72;
  const pumpHead = roundedBox(.5, .12, .18, palette.deep, .04, 2, { roughness: .5 });
  pumpHead.name = 'PUMP_HEAD';
  pumpHead.position.set(.15, 1.91, 0);
  const nozzle = cylinder(.045, .36, palette.deep, { roughness: .5 });
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(.4, 1.86, 0);
  const nozzleSocket = new THREE.Object3D();
  nozzleSocket.name = 'SOCKET_PUMP_NOZZLE';
  nozzleSocket.position.set(.59, 1.86, 0);
  group.add(pumpStem, pumpHead, nozzle, nozzleSocket);
  group.userData.pourSocket = nozzleSocket;
  group.userData.pumpHead = pumpHead;
  group.userData.gripPivot = bottle.userData.gripPivot;
  return group;
}

function makeFaucet() {
  const group = new THREE.Group();
  const base = cylinder(.32, .16, 0xb8cbd0, { metalness: .72, roughness: .17 });
  base.position.y = .08;
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, .08, 0), new THREE.Vector3(0, .88, 0),
    new THREE.Vector3(-.05, 1.42, 0), new THREE.Vector3(-.52, 1.65, 0),
    new THREE.Vector3(-.82, 1.48, 0),
  ]);
  const pipe = new THREE.Mesh(new THREE.TubeGeometry(path, 36, .11, 12, false), mat(0xb7cbd0, { metalness: .78, roughness: .16 }));
  const aerator = cylinder(.14, .22, 0x8daab1, { metalness: .7, roughness: .2 });
  aerator.position.set(-.82, 1.36, 0);
  const lever = roundedBox(.12, .12, .72, 0xb8cbd0, .04, 3, { metalness: .72, roughness: .18 });
  lever.position.set(.2, .72, 0);
  lever.rotation.z = -.35;
  group.add(base, pipe, aerator, lever);
  group.userData.outlet = new THREE.Vector3(-.82, 1.23, 0);
  return group;
}

function makeSegmentProgress(count = 18) {
  const group = new THREE.Group();
  const segments = [];
  for (let index = 0; index < count; index += 1) {
    const angle = index / count * Math.PI * 2;
    const segment = roundedBox(.16, .055, .055, 0x51747c, .02, 2, {
      roughness: .55, emissive: 0x000000, emissiveIntensity: 0,
    });
    segment.position.set(Math.cos(angle) * .55, Math.sin(angle) * .55, 0);
    segment.rotation.z = angle;
    group.add(segment);
    segments.push(segment);
  }
  group.userData.segments = segments;
  return group;
}

export function buildTransmission(api) {
  let alive = true;
  let rinseTimer = 0;
  let tracerFlow = 0;
  let soapFlow = 0;
  let rubCoverage = 0;
  let lastHandsRotation = 0;

  const counter = roundedBox(3.45, .28, 2.35, 0xe4efea, .16, 5, { roughness: .45 });
  counter.position.set(3.45, .03, -.25);
  api.root.add(counter);
  addStaticBox(api, 'wash-counter', counter.position.clone(), new THREE.Vector3(1.73, .14, 1.18), IDENTITY, { friction: .68 });

  const basinBottom = roundedBox(2.45, .16, 1.48, 0x8fc4ce, .2, 5, { metalness: .2, roughness: .25 });
  basinBottom.position.set(3.35, .22, -.24);
  const basinWater = roundedBox(2.16, .055, 1.19, 0x69c5e4, .18, 4, {
    transparent: true, opacity: .48, roughness: .1, emissive: 0x2ba3d5, emissiveIntensity: .08,
    castShadow: false, depthWrite: false,
  });
  basinWater.position.set(3.35, .33, -.24);
  api.root.add(basinBottom, basinWater);

  const faucet = makeFaucet();
  faucet.position.set(4.18, .28, -1.0);
  faucet.rotation.y = 0;
  api.root.add(faucet);
  addStaticBox(api, 'faucet-pedestal', new THREE.Vector3(4.18, .82, -1), new THREE.Vector3(.35, .82, .3));
  const outlet = faucet.position.clone().add(faucet.userData.outlet);
  const waterStream = cylinder(.055, 1.04, 0x8cddff, {
    transparent: true, opacity: .72, roughness: .03, emissive: 0x45bfe9, emissiveIntensity: .18,
    castShadow: false, depthWrite: false,
  });
  waterStream.position.set(outlet.x, outlet.y - .52, outlet.z);
  waterStream.scale.y = .001;
  waterStream.visible = false;
  api.root.add(waterStream);
  addSocket(api, 'water', '流動清水位置', new THREE.Vector3(outlet.x, .53, outlet.z), .55, palette.blue, {
    halfExtents: [.65, .72, .58],
  });

  const hands = makeHands();
  addEntity(api, 'hands', '雙手模型', hands, [.55, .04, .05], {
    draggable: true,
    stirrable: true,
    physics: { shape: 'cuboid', density: .8, friction: .86, restitution: .03, allowRotation: false },
  });
  addSocket(api, 'hands', '雙手表面', new THREE.Vector3(.55, .36, .06), 1.02, palette.mint, {
    halfExtents: [1.28, .7, .92],
  });

  const tracer = addEntity(api, 'tracer', '安全示蹤乳液', makePumpBottle(palette.violet, '示蹤'), [-4.22, .02, -.95], {
    draggable: true,
    physics: { shape: 'cylinder', radius: .427, halfHeight: .774, center: [0, .787, 0], density: 1.05, friction: .65, restitution: .04 },
  });
  const soap = addEntity(api, 'soap', '梘液泵', makePumpBottle(palette.mint, '梘液'), [-2.92, .02, -.95], {
    draggable: true,
    physics: { shape: 'cylinder', radius: .427, halfHeight: .774, center: [0, .787, 0], density: 1.05, friction: .65, restitution: .04 },
  });
  for (const [id, object] of [['tracer', tracer], ['soap', soap]]) {
    api.setPhysicsPose?.(
      id,
      object.getWorldPosition(new THREE.Vector3()),
      object.getWorldQuaternion(new THREE.Quaternion()),
      { dynamic: false, velocity: { x: 0, y: 0, z: 0 } },
    );
  }

  const droplets = [];
  for (let index = 0; index < 20; index += 1) {
    const drop = sphere(.035 + index % 3 * .01, index < 10 ? palette.violet : palette.mint, {
      transparent: true, opacity: .82, roughness: .06,
      emissive: index < 10 ? palette.violet : palette.mint, emissiveIntensity: .18,
      castShadow: false, depthWrite: false,
    });
    drop.visible = false;
    api.root.add(drop);
    droplets.push(drop);
  }

  const tracerSpots = [];
  const random = seeded(8241);
  for (let index = 0; index < 34; index += 1) {
    const spot = sphere(.035 + random() * .035, palette.violet, {
      transparent: true, opacity: .9, roughness: .14,
      emissive: palette.violet, emissiveIntensity: 1.6, castShadow: false, depthWrite: false,
    });
    const handX = index % 2 ? .66 : -.66;
    spot.position.set(handX + (random() - .5) * .72, .292, -.85 + random() * 1.65);
    // Ordinary light reveals only a faint cream tracer film; fluorescence is
    // introduced by the UV lamp later. Keeping these dots off here avoids
    // teaching that the UV tracer visibly glows before inspection.
    spot.visible = false;
    hands.add(spot);
    tracerSpots.push(spot);
  }

  const bubbles = [];
  for (let index = 0; index < 30; index += 1) {
    const bubble = sphere(.035 + random() * .055, 0xffffff, {
      transparent: true, opacity: .7, roughness: .04, castShadow: false, depthWrite: false,
    });
    bubble.position.set((random() - .5) * 2.15, .3, -.75 + random() * 1.55);
    bubble.visible = false;
    hands.add(bubble);
    bubbles.push(bubble);
  }

  const progress = makeSegmentProgress(18);
  progress.position.set(.55, 1.55, 1.05);
  api.root.add(progress, label('搓洗覆蓋', [.55, 2.28, 1.05], .31));

  const uv = addEntity(api, 'uv-lamp', '紫外光檢查燈', makeLamp(palette.violet), [-1.62, .02, 1.62], { tappable: true });
  uv.scale.setScalar(.85);
  uv.rotation.y = -.2;
  const uvOrigin = new THREE.Vector3(-1.03, 1.28, 1.62);
  const uvEnd = new THREE.Vector3(3.34, .35, -.24);
  const uvVector = uvEnd.clone().sub(uvOrigin);
  const uvCone = new THREE.Mesh(
    new THREE.ConeGeometry(1.48, uvVector.length(), 28, 1, true),
    mat(palette.violet, {
      transparent: true, opacity: .13, roughness: .05, emissive: palette.violet,
      emissiveIntensity: .2, side: THREE.DoubleSide, depthWrite: false, castShadow: false,
    }),
  );
  uvCone.position.copy(uvOrigin).add(uvEnd).multiplyScalar(.5);
  uvCone.quaternion.setFromUnitVectors(UP, uvVector.clone().normalize());
  uvCone.visible = false;
  api.root.add(uvCone);
  const inspectionLabel = label('UV 檢查範圍', [2.05, 1.42, .32], .31, { background: '#ece2ff' });
  inspectionLabel.visible = false;
  api.root.add(inspectionLabel);

  const hygieneSteps = new THREE.Group();
  ['掌心', '手背', '指縫', '拇指', '指尖'].forEach((text, index) => {
    const item = label(text, [-1.55 + index * .77, .73, 2.08], .32, { background: '#e9fff8' });
    hygieneSteps.add(item);
  });
  api.root.add(hygieneSteps);

  const updateCoverage = (value) => {
    rubCoverage = THREE.MathUtils.clamp(value, 0, 1);
    progress.userData.segments.forEach((segment, index) => {
      const active = index / progress.userData.segments.length < rubCoverage;
      segment.material.color.setHex(active ? palette.mint : 0x51747c);
      segment.material.emissive.setHex(active ? palette.mint : 0x000000);
      segment.material.emissiveIntensity = active ? .72 : 0;
    });
    hands.userData.coverage.forEach((patch) => { patch.material.opacity = .06 + rubCoverage * .5; });
  };

  api.onAction = (action) => {
    if (action.subject === 'tracer') {
      tracerFlow = 1;
      api.tiltPour(tracer, new THREE.Vector3(.55, 1.55, .05), palette.violet, { mode: 'pump' });
    }
    if (action.subject === 'soap') {
      bubbles.forEach((bubble) => { bubble.visible = true; });
      soapFlow = 1;
      api.tiltPour(soap, new THREE.Vector3(.55, 1.55, .05), palette.mint, { mode: 'pump' });
    }
    if (action.type === 'stir') {
      updateCoverage(1);
      api.sparkle(new THREE.Vector3(.55, .48, .05), 0xffffff, 14);
    }
    if (action.target === 'water') {
      api.moveObject(hands, new THREE.Vector3(outlet.x, .37, outlet.z), { duration: .58 });
      rinseTimer = 3.1;
      bubbles.forEach((bubble) => { bubble.visible = false; });
      tracerSpots.forEach((spot) => { spot.visible = false; });
      api.splash(new THREE.Vector3(outlet.x, .45, outlet.z), palette.blue);
    }
    if (action.subject === 'uv-lamp') {
      api.pressButton(uv);
      uvCone.visible = true;
      inspectionLabel.visible = true;
      tracerSpots.forEach((spot, index) => { spot.visible = index < 3; });
      api.sparkle(uvEnd.clone(), palette.violet, 10);
    }
  };

  return {
    update(time, dt = .016) {
      if (!alive) return;
      const rotationDelta = Math.abs(hands.rotation.y - lastHandsRotation);
      lastHandsRotation = hands.rotation.y;
      if (rotationDelta > .0001 && rubCoverage < .97) updateCoverage(rubCoverage + rotationDelta * .22);
      if (rinseTimer > 0) {
        rinseTimer -= dt;
        waterStream.visible = true;
        waterStream.scale.y = .94 + Math.sin(time * 24) * .05;
      } else {
        waterStream.visible = false;
        waterStream.scale.y = .001;
      }
      if (tracerFlow > 0 || soapFlow > 0) {
        tracerFlow = Math.max(0, tracerFlow - dt * .65);
        soapFlow = Math.max(0, soapFlow - dt * .65);
        droplets.forEach((drop, index) => {
          const isTracer = index < 10;
          const active = isTracer ? tracerFlow : soapFlow;
          drop.visible = active > 0;
          if (!drop.visible) return;
          const phase = (time * 1.9 + (index % 10) * .097) % 1;
          drop.position.set(.48 + (index % 3 - 1) * .045, 1.58 - phase * 1.15, .05);
        });
      }
      bubbles.forEach((bubble, index) => {
        if (bubble.visible) bubble.position.y = .31 + Math.sin(time * 4.2 + index) * .035;
      });
      tracerSpots.forEach((spot, index) => {
        if (spot.visible) spot.material.emissiveIntensity = 1.25 + Math.sin(time * 5 + index) * .3;
      });
    },
    getState() {
      return {
        experiment: 'transmission',
        rubCoverage,
        rinseActive: rinseTimer > 0,
        visibleTracerSpots: tracerSpots.reduce((count, spot) => count + Number(spot.visible), 0),
        uvInspectionActive: uvCone.visible,
      };
    },
    dispose() { alive = false; },
  };
}

function makeSeedling() {
  const group = new THREE.Group();
  const stem = cylinder(.055, .86, 0x4e9c50, { roughness: .82 });
  stem.position.y = .43;
  const rootStub = cylinder(.045, .36, 0xe8d6a9, { roughness: .88 });
  rootStub.position.y = -.18;
  const leafMaterial = mat(0x71bf55, { roughness: .78 });
  for (const [x, y, rotation] of [[-.24, .58, .42], [.25, .73, -.5], [-.17, .88, .62]]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(.22, 18, 12), leafMaterial.clone());
    leaf.scale.set(1.55, .25, .68);
    leaf.position.set(x, y, 0);
    leaf.rotation.z = rotation;
    group.add(leaf);
  }
  const cotyledon = sphere(.1, 0x9c7240, { roughness: .95 });
  cotyledon.scale.set(1.3, .55, .8);
  cotyledon.position.y = .12;
  group.add(stem, rootStub, cotyledon);
  return group;
}

function makeMagnifier() {
  const group = new THREE.Group();
  const lens = cylinder(.52, .055, 0xbcefff, {
    transparent: true, opacity: .35, roughness: .03, transmission: .72,
    thickness: .1, depthWrite: false, side: THREE.DoubleSide,
  });
  lens.rotation.x = Math.PI / 2;
  const rim = torus(.53, .055, palette.deep, { roughness: .48, metalness: .12 });
  const handle = roundedBox(.16, .86, .13, palette.deep, .06, 3, { roughness: .62 });
  handle.position.set(.55, -.58, 0);
  handle.rotation.z = -.68;
  const focusMarker = new THREE.Object3D();
  focusMarker.name = 'SOCKET_FOCUS_AXIS';
  focusMarker.position.set(0, 0, -.48);
  group.add(lens, rim, handle, focusMarker);
  group.userData.focusDistance = .48;
  return group;
}

function makeRootCurve(points, radius = .032) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const material = mat(0xecd9ae, { transparent: true, opacity: 0, roughness: .88 });
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, radius, 7, false), material);
  mesh.castShadow = true;
  mesh.userData.curve = curve;
  return mesh;
}

export function buildRoots(api) {
  let alive = true;
  let growth = 0;
  let targetGrowth = 0;
  let watered = 0;

  const boxCenterX = .55;
  const frameColor = 0x38656b;
  const soilBack = roundedBox(3.72, 2.55, .42, 0x9e7650, .08, 4, { roughness: .96 });
  soilBack.position.set(boxCenterX, 1.35, .02);
  api.root.add(soilBack);

  const moistureColumns = [];
  const columnCount = 18;
  for (let index = 0; index < columnCount; index += 1) {
    const ratio = index / (columnCount - 1);
    const color = new THREE.Color(0x5b493d).lerp(new THREE.Color(0xb38a5e), ratio);
    const column = roundedBox(.195, 2.38, .055, color.getHex(), .025, 2, {
      transparent: true, opacity: .26, roughness: .98, castShadow: false,
    });
    column.position.set(boxCenterX - 1.66 + index * .195, 1.35, .265);
    api.root.add(column);
    moistureColumns.push(column);
  }

  const glass = roundedBox(3.94, 2.78, .08, 0xc8f3f4, .12, 5, {
    transparent: true, opacity: .19, roughness: .04, transmission: .78,
    thickness: .1, depthWrite: false, castShadow: false,
  });
  glass.position.set(boxCenterX, 1.38, .43);
  api.root.add(glass);
  const framePieces = [
    [boxCenterX - 1.98, 1.39, .47, .11, 2.8, .12],
    [boxCenterX + 1.98, 1.39, .47, .11, 2.8, .12],
    [boxCenterX, .04, .47, 4.02, .11, .12],
    [boxCenterX, 2.74, .47, 4.02, .11, .12],
  ].map(([x, y, z, w, h, d]) => {
    const piece = roundedBox(w, h, d, frameColor, .04, 2, { roughness: .58, metalness: .08 });
    piece.position.set(x, y, z);
    api.root.add(piece);
    return piece;
  });
  addStaticBox(api, 'root-frame-left', new THREE.Vector3(boxCenterX - 1.98, 1.39, .47), new THREE.Vector3(.055, 1.4, .06));
  addStaticBox(api, 'root-frame-right', new THREE.Vector3(boxCenterX + 1.98, 1.39, .47), new THREE.Vector3(.055, 1.4, .06));
  addStaticBox(api, 'root-frame-bottom', new THREE.Vector3(boxCenterX, .055, .47), new THREE.Vector3(2.01, .055, .06));
  framePieces.forEach((piece) => { piece.receiveShadow = true; });

  const depthScale = new THREE.Group();
  for (let index = 0; index <= 6; index += 1) {
    const tick = roundedBox(index % 2 ? .22 : .34, .025, .02, 0xf7fff9, .008, 1, { castShadow: false });
    tick.position.set(2.18, .3 + index * .35, .53);
    depthScale.add(tick);
  }
  api.root.add(depthScale, label('透明根觀察箱', [boxCenterX, 3.17, .2], .42));

  const slot = new THREE.Group();
  const collar = torus(.3, .055, 0x4c7276, { roughness: .58 });
  collar.rotation.x = Math.PI / 2;
  slot.add(collar);
  slot.position.set(boxCenterX, 2.08, .44);
  api.root.add(slot);
  addSocket(api, 'root-box', '幼苗種植凹位', slot.position.clone(), .38, palette.mint, {
    halfExtents: [.46, .56, .42],
  });

  const wateringPort = new THREE.Group();
  const funnel = new THREE.Mesh(
    new THREE.CylinderGeometry(.11, .34, .4, 24, 1, true),
    mat(0xa9e4e8, { transparent: true, opacity: .45, roughness: .08, side: THREE.DoubleSide }),
  );
  funnel.position.y = .18;
  wateringPort.add(funnel);
  wateringPort.position.set(-.95, 2.53, .43);
  api.root.add(wateringPort);
  addSocket(api, 'wet-zone', '左側加水口', new THREE.Vector3(-.95, 2.68, .43), .42, palette.blue, {
    halfExtents: [.52, 1.18, .48],
  });

  const nurseryShelf = roundedBox(1.32, .12, .72, 0x4f747b, .06, 3, { roughness: .7 });
  nurseryShelf.position.set(-4.12, 1.12, -.35);
  api.root.add(nurseryShelf);
  addStaticBox(api, 'seedling-nursery', nurseryShelf.position.clone(), new THREE.Vector3(.66, .06, .36));
  const seedling = addEntity(api, 'seedling', '幼苗', makeSeedling(), [-4.12, 1.22, -.35], {
    draggable: true,
    physics: { shape: 'capsule', density: .35, friction: .62, restitution: .04, linearDamping: 5 },
  });

  const cupShelf = roundedBox(1.15, .12, .72, 0x4f747b, .06, 3, { roughness: .7 });
  cupShelf.position.set(-3.03, 1.06, 1.34);
  api.root.add(cupShelf);
  addStaticBox(api, 'water-cup-shelf', cupShelf.position.clone(), new THREE.Vector3(.58, .06, .36));
  const waterCup = addEntity(api, 'water-cup', '量杯', makeBeaker({
    radius: .45, height: 1.02, liquidColor: palette.blue, liquidLevel: .72,
  }), [-3.03, 1.13, 1.34], {
    draggable: true,
    physics: { shape: 'cylinder', radius: .41, halfHeight: .483, center: [0, .515, 0], density: 1.1, friction: .62, restitution: .03, allowRotation: true },
  });
  // Keep the full cup exactly seated on its shelf until the learner picks it
  // up. grab() switches it back to a dynamic body, so the carried motion and
  // collisions remain physical while avoiding load-time settling drift.
  api.setPhysicsPose?.(
    'water-cup',
    waterCup.getWorldPosition(new THREE.Vector3()),
    waterCup.getWorldQuaternion(new THREE.Quaternion()),
    { dynamic: false, velocity: { x: 0, y: 0, z: 0 } },
  );

  const rootMeshes = [
    makeRootCurve([
      new THREE.Vector3(.55, 2.08, .37), new THREE.Vector3(.52, 1.72, .39),
      new THREE.Vector3(.45, 1.25, .4), new THREE.Vector3(.36, .78, .4),
      new THREE.Vector3(.28, .28, .41),
    ], .05),
    makeRootCurve([
      new THREE.Vector3(.5, 1.7, .4), new THREE.Vector3(.12, 1.57, .41),
      new THREE.Vector3(-.35, 1.42, .42), new THREE.Vector3(-.82, 1.25, .43),
    ], .035),
    makeRootCurve([
      new THREE.Vector3(.45, 1.36, .4), new THREE.Vector3(.08, 1.24, .42),
      new THREE.Vector3(-.43, 1.05, .43), new THREE.Vector3(-1.03, .96, .44),
    ], .031),
    makeRootCurve([
      new THREE.Vector3(.38, .95, .4), new THREE.Vector3(.03, .83, .42),
      new THREE.Vector3(-.48, .66, .43), new THREE.Vector3(-.88, .52, .44),
    ], .027),
    makeRootCurve([
      new THREE.Vector3(.53, 1.55, .39), new THREE.Vector3(.82, 1.41, .4),
      new THREE.Vector3(1.08, 1.25, .41),
    ], .026),
    makeRootCurve([
      new THREE.Vector3(.43, 1.18, .4), new THREE.Vector3(.73, 1.02, .41),
      new THREE.Vector3(.93, .78, .42),
    ], .024),
  ];
  rootMeshes.forEach((mesh) => api.root.add(mesh));

  const rootHairs = [];
  const hairRandom = seeded(441);
  for (let index = 0; index < 26; index += 1) {
    const base = new THREE.Vector3(-.55 - hairRandom() * .45, .95 + hairRandom() * .18, .45);
    const direction = index % 2 ? -1 : 1;
    const curve = new THREE.QuadraticBezierCurve3(
      base,
      base.clone().add(new THREE.Vector3(direction * (.07 + hairRandom() * .08), (hairRandom() - .5) * .08, .02)),
      base.clone().add(new THREE.Vector3(direction * (.12 + hairRandom() * .12), (hairRandom() - .5) * .12, .025)),
    );
    const hair = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, .009, 5, false), mat(0xf4e6c8, {
      transparent: true, opacity: 0, roughness: .92, castShadow: false,
    }));
    api.root.add(hair);
    rootHairs.push(hair);
  }

  addSocket(api, 'root-tip', '新生側根根毛區', new THREE.Vector3(-1.04, .98, .93), .42, palette.yellow, {
    vertical: true, halfExtents: [.52, .52, .56],
  });
  // The magnifier has its own front-left tray, clear of the neighbouring
  // measuring cup and both shelf colliders, so neither tool drifts on load.
  const magnifierRack = roundedBox(1.25, .1, .5, 0x4f747b, .05, 3, { roughness: .7 });
  magnifierRack.position.set(-3.55, 1.13, 2.5);
  api.root.add(magnifierRack);
  addStaticBox(api, 'magnifier-rack', magnifierRack.position.clone(), new THREE.Vector3(.63, .05, .25));
  const magnifierHome = new THREE.Vector3(-3.55, 2.16, 2.5);
  const magnifier = addEntity(api, 'magnifier', '放大鏡', makeMagnifier(), magnifierHome.toArray(), {
    draggable: true,
    physics: { shape: 'cuboid', density: .72, friction: .66, restitution: .05, allowRotation: false },
  });
  // Its long angled handle makes the visual bounds much taller than the lens.
  // Park it exactly on its dedicated rack until first pickup; grab() restores
  // a dynamic body so carrying, collisions and placement remain physical.
  api.setPhysicsPose?.(
    'magnifier',
    localToWorld(api, magnifierHome),
    rootQuaternion(api),
    { dynamic: false, velocity: { x: 0, y: 0, z: 0 } },
  );

  const dial = new THREE.Group();
  const dialBody = roundedBox(1.32, .85, .48, 0x315e69, .16, 5, { roughness: .62 });
  dialBody.position.y = .43;
  const face = cylinder(.36, .055, 0xfff6d7, { roughness: .72 });
  face.rotation.x = Math.PI / 2;
  face.position.set(0, .49, .27);
  const knob = cylinder(.12, .12, palette.yellow, { roughness: .48 });
  knob.rotation.x = Math.PI / 2;
  knob.position.set(0, .49, .34);
  const needle = roundedBox(.045, .3, .03, palette.coral, .015, 1, { emissive: palette.coral, emissiveIntensity: .2 });
  needle.position.set(0, .62, .42);
  dial.add(dialBody, face, knob, needle);
  addEntity(api, 'time-dial', '72 小時控制器', dial, [4.12, .02, 1.12], { adjustable: true });
  addStaticBox(api, 'root-time-console', new THREE.Vector3(4.12, .45, 1.12), new THREE.Vector3(.67, .43, .25));
  api.root.add(label('0 — 72 小時', [4.12, 1.36, 1.12], .32));

  const inset = new THREE.Group();
  const insetLens = cylinder(.98, .06, 0xc9f3f3, {
    transparent: true, opacity: .24, roughness: .04, transmission: .7, depthWrite: false,
  });
  insetLens.rotation.x = Math.PI / 2;
  const insetRim = torus(.98, .06, palette.yellow, { emissive: palette.yellow, emissiveIntensity: .35 });
  inset.add(insetLens, insetRim);
  for (let index = 0; index < 16; index += 1) {
    const angle = -1.0 + index / 15 * 2.0;
    const hair = tubeBetween(
      new THREE.Vector3(0, -.65 + index * .085, .04),
      new THREE.Vector3(Math.cos(angle) * .6, -.65 + index * .085 + Math.sin(angle) * .16, .08),
      .012,
      0xf5e8c9,
      { roughness: .9 },
    );
    inset.add(hair);
  }
  const rootCore = roundedBox(.28, 1.42, .1, 0xead5a8, .12, 4, { roughness: .9 });
  inset.add(rootCore);
  inset.position.set(3.38, 1.8, .66);
  inset.visible = false;
  api.root.add(inset, label('左濕　→　右乾', [boxCenterX, .28, .66], .31, { background: '#e9f8ef' }));

  const setGrowth = (fraction) => {
    targetGrowth = THREE.MathUtils.clamp(fraction, 0, 1);
    needle.rotation.z = -Math.PI * .72 + targetGrowth * Math.PI * 1.44;
  };

  api.onPreview = (subject, value) => {
    if (subject === 'time-dial') setGrowth(value / 72);
  };
  api.onAction = (action) => {
    if (action.subject === 'seedling') {
      // The full canopy remains below the observation frame after insertion;
      // the root collar aligns with the root curve rather than floating above it.
      api.moveObject(seedling, new THREE.Vector3(boxCenterX, 2.08, .45), { duration: .58, scale: .7 });
    }
    if (action.subject === 'water-cup') {
      api.tiltPour(waterCup, new THREE.Vector3(-.95, 3.18, .43), palette.blue);
      watered = 1;
    }
    if (action.subject === 'time-dial') setGrowth(1);
    if (action.subject === 'magnifier') {
      api.moveObject(magnifier, new THREE.Vector3(-1.04, .98, .93), { duration: .48 });
      inset.visible = true;
      rootHairs.forEach((hair) => { hair.material.opacity = .95; });
      api.sparkle(new THREE.Vector3(-1.04, .98, .93), palette.yellow, 10);
    }
  };

  return {
    update(time, dt = .016) {
      if (!alive) return;
      growth = THREE.MathUtils.lerp(growth, targetGrowth, 1 - Math.exp(-dt * 3.2));
      rootMeshes.forEach((mesh, index) => {
        const start = index === 0 ? .05 : .24 + index * .095;
        mesh.material.opacity = THREE.MathUtils.smoothstep(growth, start, Math.min(1, start + .24));
      });
      const moistureStrength = .25 + watered * .68;
      moistureColumns.forEach((column, index) => {
        const leftness = 1 - index / (moistureColumns.length - 1);
        column.material.opacity = .2 + moistureStrength * leftness * .72;
      });
      rootHairs.forEach((hair, index) => {
        if (hair.material.opacity > 0) hair.material.opacity = .76 + Math.sin(time * 3 + index) * .12;
      });
      inset.rotation.z = Math.sin(time * .8) * .006;
    },
    getState() {
      return {
        experiment: 'root-viewer',
        growthFraction: growth,
        targetGrowthFraction: targetGrowth,
        watered: watered > 0,
        magnified: inset.visible,
        focusDistance: magnifier.userData.focusDistance,
      };
    },
    dispose() { alive = false; },
  };
}

function makePondPlant() {
  const group = new THREE.Group();
  for (let index = 0; index < 11; index += 1) {
    const height = .48 + (index % 4) * .12;
    const blade = roundedBox(.11, height, .055, index % 3 ? 0x4fa65a : 0x76bf52, .05, 3, { roughness: .88 });
    blade.position.set((index - 5) * .105, height / 2, (index % 3 - 1) * .13);
    blade.rotation.z = (index - 5) * .035;
    group.add(blade);
  }
  return group;
}

function makeSnail() {
  const group = new THREE.Group();
  const foot = roundedBox(.78, .16, .32, 0xd7a96c, .08, 4, { roughness: .9 });
  foot.position.y = .08;
  const head = sphere(.18, 0xd7a96c, { roughness: .9 });
  head.position.set(.4, .21, 0);
  const shell = sphere(.34, 0xc97b43, { roughness: .82 });
  shell.scale.z = .68;
  shell.position.set(-.08, .38, 0);
  const spiral = torus(.17, .025, 0x70432d, { arc: Math.PI * 1.8, roughness: .9 });
  spiral.position.set(-.08, .39, .24);
  const feelers = [];
  for (const z of [-.1, .1]) {
    const feeler = tubeBetween(new THREE.Vector3(.48, .28, z), new THREE.Vector3(.65, .52, z), .014, 0x8a633e, { roughness: .9 });
    const eye = sphere(.026, palette.ink, { roughness: .4 });
    eye.position.set(.65, .52, z);
    feelers.push(feeler, eye);
  }
  group.add(foot, head, shell, spiral, ...feelers);
  return group;
}

function makeFishShoal(count = 9) {
  const group = new THREE.Group();
  const bodyGeometry = new THREE.SphereGeometry(.28, 18, 12);
  const tailGeometry = new THREE.ConeGeometry(.2, .34, 3);
  tailGeometry.rotateZ(-Math.PI / 2);
  const bodyMaterial = mat(palette.blue, { roughness: .48, metalness: .04 });
  const tailMaterial = mat(0x438bd7, { roughness: .55 });
  const bodies = new THREE.InstancedMesh(bodyGeometry, bodyMaterial, count);
  const tails = new THREE.InstancedMesh(tailGeometry, tailMaterial, count);
  bodies.castShadow = true;
  tails.castShadow = true;
  const offsets = [];
  const random = seeded(7349);
  for (let index = 0; index < count; index += 1) {
    offsets.push(new THREE.Vector3(
      (random() - .5) * 1.42,
      (random() - .5) * .42,
      (random() - .5) * .78,
    ));
  }
  const eye = sphere(.045, palette.ink, { roughness: .35 });
  eye.position.set(.3, .1, .2);
  group.add(bodies, tails, eye);
  group.userData.bodies = bodies;
  group.userData.tails = tails;
  group.userData.offsets = offsets;
  group.userData.count = count;
  group.userData.population = 1;
  return group;
}

function updateFishShoal(group, time) {
  const dummy = new THREE.Object3D();
  const { bodies, tails, offsets, count } = group.userData;
  const visibleCount = Math.max(1, Math.round(count * group.userData.population));
  for (let index = 0; index < count; index += 1) {
    const active = index < visibleCount;
    const offset = offsets[index];
    const sway = Math.sin(time * 1.35 + index * 1.4);
    dummy.position.set(offset.x + sway * .11, offset.y + Math.sin(time * 1.7 + index) * .055, offset.z);
    dummy.rotation.set(0, sway * .17, 0);
    dummy.scale.set(active ? 1.25 : 0, active ? .62 : 0, active ? .52 : 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(index, dummy.matrix);
    dummy.position.x -= .35;
    dummy.scale.set(active ? .8 : 0, active ? .8 : 0, active ? .8 : 0);
    dummy.updateMatrix();
    tails.setMatrixAt(index, dummy.matrix);
  }
  bodies.instanceMatrix.needsUpdate = true;
  tails.instanceMatrix.needsUpdate = true;
}

function makeHeron() {
  const group = new THREE.Group();
  const body = sphere(.5, 0xdfe9e7, { roughness: .82 });
  body.scale.set(.78, 1.12, .62);
  body.position.y = 1.18;
  const wing = sphere(.42, 0x9fb5ba, { roughness: .86 });
  wing.scale.set(.55, 1.08, .34);
  wing.position.set(-.16, 1.18, .34);
  wing.rotation.z = -.18;
  const neckPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(.18, 1.45, 0), new THREE.Vector3(.36, 1.78, 0),
    new THREE.Vector3(.22, 2.1, 0), new THREE.Vector3(.38, 2.36, 0),
  ]);
  const neck = new THREE.Mesh(new THREE.TubeGeometry(neckPath, 24, .105, 9, false), mat(0xe8f0ed, { roughness: .82 }));
  const head = sphere(.2, 0xe8f0ed, { roughness: .82 });
  head.position.set(.43, 2.38, 0);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.095, .72, 4), mat(0xe8aa45, { roughness: .62 }));
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(.8, 2.36, 0);
  const legs = [];
  for (const x of [-.14, .14]) {
    const leg = cylinder(.035, .95, 0xc58f48, { roughness: .72 });
    leg.position.set(x, .48, 0);
    const foot = roundedBox(.34, .035, .045, 0xc58f48, .015, 1, { roughness: .72 });
    foot.position.set(x + .1, .02, .12);
    legs.push(leg, foot);
  }
  group.add(body, wing, neck, head, beak, ...legs);
  return group;
}

function makeLandingNet() {
  const group = new THREE.Group();
  const handle = cylinder(.065, 1.65, 0x8b603e, { roughness: .82 });
  handle.rotation.z = Math.PI / 2;
  handle.position.x = -.5;
  const rim = torus(.48, .045, palette.metal, { metalness: .48, roughness: .32 });
  rim.position.x = .56;
  const netMaterial = new THREE.LineBasicMaterial({ color: 0xdcebea, transparent: true, opacity: .72 });
  for (let index = -3; index <= 3; index += 1) {
    const x = index * .115;
    const height = Math.sqrt(Math.max(0, .45 * .45 - x * x));
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(.56 + x, -height, .01), new THREE.Vector3(.56 + x, height, .01),
    ]);
    group.add(new THREE.Line(geometry, netMaterial));
  }
  for (let index = -3; index <= 3; index += 1) {
    const y = index * .115;
    const width = Math.sqrt(Math.max(0, .45 * .45 - y * y));
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(.56 - width, y, .01), new THREE.Vector3(.56 + width, y, .01),
    ]);
    group.add(new THREE.Line(geometry, netMaterial));
  }
  group.add(handle, rim);
  return group;
}

function createEnergyFlow(api, source, target, color) {
  const start = source.clone();
  const end = target.clone();
  const midpoint = start.clone().lerp(end, .5);
  midpoint.y += .48 + start.distanceTo(end) * .08;
  const curve = new THREE.CatmullRomCurve3([start, midpoint, end], false, 'centripetal');
  const group = new THREE.Group();
  const tube = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 32, .026, 7, false),
    mat(color, { transparent: true, opacity: .75, emissive: color, emissiveIntensity: .45, castShadow: false }),
  );
  const tangent = curve.getTangentAt(.88).normalize();
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(.12, .34, 12), mat(color, {
    emissive: color, emissiveIntensity: .72, roughness: .35,
  }));
  arrow.position.copy(curve.getPointAt(.88));
  arrow.quaternion.setFromUnitVectors(UP, tangent);
  const particles = [];
  for (let index = 0; index < 6; index += 1) {
    const particle = sphere(.052, color, { emissive: color, emissiveIntensity: 1.3, roughness: .18, castShadow: false });
    particle.userData.phase = index / 6;
    group.add(particle);
    particles.push(particle);
  }
  group.add(tube, arrow);
  group.visible = false;
  api.root.add(group);
  return { group, curve, particles };
}

export function buildFoodWeb(api) {
  let alive = true;
  let fishPopulationTarget = 1;
  let netScoopTimer = 0;

  const bank = torus(3.18, .28, 0x8aaf66, { roughness: .9, segments: 18, tubularSegments: 54 });
  bank.rotation.x = Math.PI / 2;
  bank.position.y = .16;
  bank.scale.z = .76;
  const water = cylinder(3.04, .16, 0x4ba8c5, {
    transparent: true, opacity: .68, roughness: .12, emissive: 0x1c819f, emissiveIntensity: .08,
    castShadow: false, depthWrite: false,
  });
  water.scale.z = .76;
  water.position.y = .1;
  const pondBed = cylinder(3.08, .08, 0x668c69, { roughness: .94 });
  pondBed.scale.z = .76;
  pondBed.position.y = .02;
  api.root.add(pondBed, water, bank);
  addStaticBox(api, 'pond-bed', new THREE.Vector3(0, .035, 0), new THREE.Vector3(3.02, .035, 2.28), IDENTITY, { friction: .56 });
  addSocket(api, 'pond', '池塘捕撈區', new THREE.Vector3(.92, .26, .45), 1.08, palette.coral, {
    halfExtents: [1.28, .72, 1.02],
  });

  const sun = addEntity(api, 'sun', '太陽能量來源', sphere(.58, palette.yellow, {
    emissive: palette.yellow, emissiveIntensity: 1.45, roughness: .28,
  }), [-4.28, 2.7, -1.35], { connectable: true });
  const sunRays = [];
  for (let index = 0; index < 10; index += 1) {
    const ray = roundedBox(.08, .34, .07, palette.yellow, .025, 2, {
      emissive: palette.yellow, emissiveIntensity: .8, castShadow: false,
    });
    const angle = index / 10 * Math.PI * 2;
    ray.position.set(-4.28 + Math.cos(angle) * .85, 2.7 + Math.sin(angle) * .85, -1.35);
    ray.rotation.z = -angle;
    api.root.add(ray);
    sunRays.push(ray);
  }

  const plant = addEntity(api, 'plant', '池塘水草', makePondPlant(), [-2.12, .18, .42], { connectable: true });
  const snail = addEntity(api, 'snail', '淡水螺', makeSnail(), [-.62, .22, .86], { connectable: true });
  const fish = addEntity(api, 'fish', '小魚群', makeFishShoal(9), [1.02, .64, .08], { connectable: true });
  updateFishShoal(fish, 0);
  const perch = roundedBox(1.55, .18, .92, 0xb5a078, .12, 4, { roughness: .92 });
  perch.position.set(3.48, .1, -.65);
  api.root.add(perch);
  addStaticBox(api, 'heron-perch', perch.position.clone(), new THREE.Vector3(.78, .09, .46));
  const heron = addEntity(api, 'heron', '鷺鳥', makeHeron(), [3.45, .21, -.72], { connectable: true });

  addSocket(api, 'plant', '水草能量接收點', new THREE.Vector3(-2.12, .86, .58), .42, palette.yellow, {
    vertical: true, halfExtents: [.5, .58, .44],
  });
  addSocket(api, 'snail', '淡水螺能量接收點', new THREE.Vector3(-.62, .64, 1.08), .4, palette.yellow, {
    vertical: true, halfExtents: [.5, .5, .44],
  });
  addSocket(api, 'fish', '小魚群能量接收點', new THREE.Vector3(1.02, .82, .58), .48, palette.yellow, {
    vertical: true, halfExtents: [.68, .58, .62],
  });
  addSocket(api, 'heron', '鷺鳥能量接收點', new THREE.Vector3(3.75, 2.18, -.4), .45, palette.yellow, {
    vertical: true, halfExtents: [.58, .68, .5],
  });

  const netRack = roundedBox(2.1, .1, .58, 0x466b70, .05, 3, { roughness: .72 });
  netRack.position.set(-3.92, .07, 1.85);
  api.root.add(netRack);
  addStaticBox(api, 'landing-net-rack', netRack.position.clone(), new THREE.Vector3(1.05, .05, .29));
  const net = addEntity(api, 'remove-fish', '池塘捕撈網', makeLandingNet(), [-3.92, .58, 1.88], {
    draggable: true,
    physics: { shape: 'cuboid', density: .68, friction: .58, restitution: .06, allowRotation: false },
  });
  api.root.add(label('族群取樣網', [-3.92, 1.25, 1.88], .31));

  const populationPanel = roundedBox(2.25, 1.18, .18, 0xeff5e7, .18, 5, { roughness: .7 });
  populationPanel.position.set(4.02, 1.0, 1.65);
  api.root.add(populationPanel);
  addStaticBox(api, 'population-panel', populationPanel.position.clone(), new THREE.Vector3(1.13, .59, .1));
  const fishBar = roundedBox(1.55, .13, .08, palette.blue, .05, 3, { emissive: palette.blue, emissiveIntensity: .2 });
  fishBar.position.set(3.76, 1.18, 1.77);
  const snailBar = roundedBox(.82, .13, .08, palette.mint, .05, 3, { emissive: palette.mint, emissiveIntensity: .2 });
  snailBar.position.set(3.4, .8, 1.77);
  const heronBar = roundedBox(.92, .13, .08, palette.coral, .05, 3, { emissive: palette.coral, emissiveIntensity: .2 });
  heronBar.position.set(3.45, .43, 1.77);
  api.root.add(fishBar, snailBar, heronBar);
  const panelLabels = [
    label('小魚', [4.65, 1.18, 1.79], .32),
    label('螺', [4.65, .8, 1.79], .32),
    label('鷺鳥', [4.65, .43, 1.79], .32),
  ];
  panelLabels.forEach((item) => api.root.add(item));

  const positions = {
    sun: new THREE.Vector3(-4.28, 2.7, -1.35),
    plant: new THREE.Vector3(-2.12, .78, .42),
    snail: new THREE.Vector3(-.62, .62, .86),
    fish: new THREE.Vector3(1.02, .78, .08),
    heron: new THREE.Vector3(3.55, 2.08, -.72),
  };
  const flows = new Map([
    ['sun:plant', createEnergyFlow(api, positions.sun, positions.plant, palette.yellow)],
    ['plant:snail', createEnergyFlow(api, positions.plant, positions.snail, 0x9fe66f)],
    ['snail:fish', createEnergyFlow(api, positions.snail, positions.fish, palette.mint)],
    ['fish:heron', createEnergyFlow(api, positions.fish, positions.heron, palette.coral)],
  ]);
  const activatedFlows = [];
  const activateFlow = (source, target) => {
    const flow = flows.get(`${source}:${target}`);
    if (!flow || flow.group.visible) return;
    flow.group.visible = true;
    activatedFlows.push(flow);
    api.sparkle(flow.curve.getPointAt(.9), flow.group.children[0].material?.color?.getHex?.() || palette.yellow, 9);
  };

  const heronHint = label('食物減少：可能下降', [3.45, 2.95, -.72], .32, { background: '#ffe6dd' });
  const snailHint = label('捕食減少：可能增加', [-.62, 1.45, .86], .31, { background: '#e3fff2' });
  heronHint.visible = false;
  snailHint.visible = false;
  api.root.add(heronHint, snailHint);

  api.onAction = (action) => {
    if (action.type === 'connect') activateFlow(action.subject, action.target);
    if (action.subject === 'remove-fish') {
      api.moveObject(net, new THREE.Vector3(.82, .62, .5), { duration: .68, arc: .65, scale: .94 });
      fishPopulationTarget = .34;
      netScoopTimer = 1.5;
      heronHint.visible = true;
      snailHint.visible = true;
      api.pulseObject(heron, palette.coral);
      api.pulseObject(snail, palette.mint);
      api.splash(new THREE.Vector3(.82, .3, .5), palette.blue);
    }
  };

  return {
    update(time, dt = .016) {
      if (!alive) return;
      fish.userData.population = THREE.MathUtils.lerp(
        fish.userData.population,
        fishPopulationTarget,
        1 - Math.exp(-dt * 2.4),
      );
      updateFishShoal(fish, time);
      activatedFlows.forEach((flow) => {
        flow.particles.forEach((particle) => {
          const t = (time * .22 + particle.userData.phase) % 1;
          particle.position.copy(flow.curve.getPointAt(t));
          particle.scale.setScalar(.82 + Math.sin(time * 6 + particle.userData.phase * 12) * .18);
        });
      });
      sun.scale.setScalar(1 + Math.sin(time * 2.1) * .025);
      sunRays.forEach((ray, index) => { ray.material.emissiveIntensity = .58 + Math.sin(time * 3 + index) * .18; });
      plant.children.forEach((blade, index) => { blade.rotation.z += Math.sin(time * 1.5 + index) * .0005; });
      snail.position.x = -.62 + Math.sin(time * .35) * .035;
      if (netScoopTimer > 0) {
        netScoopTimer -= dt;
        net.rotation.x = Math.sin(time * 7) * .08;
      }
      const reduction = 1 - fish.userData.population;
      fishBar.scale.x = Math.max(.34, fish.userData.population);
      fishBar.position.x = 3.0 + .76 * fishBar.scale.x;
      snailBar.scale.x = 1 + reduction * .62;
      heronBar.scale.x = 1 - reduction * .52;
    },
    getState() {
      return {
        experiment: 'food-web',
        activeLinks: activatedFlows.length,
        fishPopulation: fish.userData.population,
        fishInstances: fish.userData.count,
        samplingInProgress: netScoopTimer > 0,
      };
    },
    dispose() { alive = false; },
  };
}
