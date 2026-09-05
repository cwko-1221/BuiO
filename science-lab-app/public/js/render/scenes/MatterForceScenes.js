import * as THREE from 'three';
import {
  palette, mat, roundedBox, cylinder, sphere, torus, makeBottle, makeBeaker,
  makeButton, makeTargetRing, makeLabelSprite, dynamicDisplay,
} from '../SceneKit.js';

const UP = new THREE.Vector3(0, 1, 0);
const IDENTITY = new THREE.Quaternion();

function addEntity(api, id, label, object, position, options = {}) {
  object.position.set(...position);
  api.root.add(object);
  api.entity(id, label, object, options);
  return object;
}

function worldPoint(api, point) {
  api.root.updateWorldMatrix(true, false);
  return api.root.localToWorld(point.clone());
}

function worldQuaternion(api, quaternion = IDENTITY) {
  api.root.updateWorldMatrix(true, false);
  return api.root.getWorldQuaternion(new THREE.Quaternion()).multiply(quaternion);
}

function addSocket(api, id, label, position, radius, color, rotation = null, physics = {}) {
  const socket = makeTargetRing(color, radius);
  socket.position.copy(position);
  if (rotation) socket.quaternion.copy(rotation);
  api.root.add(socket);
  api.target(id, label, socket, {
    radius: radius + .16,
    ...(physics.pourOffset ? { pourOffset: physics.pourOffset } : {}),
    ...(physics.snapOffset ? { snapOffset: physics.snapOffset } : {}),
    physics: {
      shape: 'cuboid',
      halfExtents: [radius, physics.halfHeight ?? .25, radius],
      padding: physics.padding ?? .05,
      ...physics,
    },
  });
  return socket;
}

function addStaticBox(api, id, center, halfExtents, quaternion = IDENTITY, options = {}) {
  if (api.addStaticBox) {
    return api.addStaticBox(
      id,
      worldPoint(api, center),
      halfExtents.clone(),
      { ...options, quaternion: worldQuaternion(api, quaternion) },
    );
  }
  // Compatibility path for renderers without the explicit cuboid helper.
  const proxy = new THREE.Mesh(
    new THREE.BoxGeometry(halfExtents.x * 2, halfExtents.y * 2, halfExtents.z * 2),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
  );
  proxy.position.copy(center);
  proxy.quaternion.copy(quaternion);
  proxy.castShadow = false;
  proxy.receiveShadow = false;
  proxy.name = `COL_${id}`;
  api.root.add(proxy);
  return api.addStaticCollider?.(id, proxy, options);
}

function damp(current, target, speed, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-speed * Math.max(0, dt)));
}

function seeded(seed = 1) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function glassMaterial(color = 0xdaf8fb, opacity = .28) {
  return mat(color, {
    transparent: true,
    opacity,
    roughness: .06,
    transmission: .72,
    thickness: .13,
    ior: 1.46,
    attenuationColor: color,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

function makePourDrops(color, count = 18) {
  const group = new THREE.Group();
  const material = mat(color, {
    transparent: true, opacity: .82, roughness: .06, transmission: .08,
    emissive: color, emissiveIntensity: .08, depthWrite: false,
  });
  const drops = [];
  for (let index = 0; index < count; index += 1) {
    const drop = new THREE.Mesh(new THREE.SphereGeometry(.045 + index % 3 * .008, 10, 7), material);
    drop.scale.y = 1.8;
    drop.visible = false;
    drop.castShadow = false;
    group.add(drop);
    drops.push(drop);
  }
  return { group, drops };
}

function makePhysicalGauge(color = palette.mint) {
  const gauge = new THREE.Group();
  const caseMesh = roundedBox(1.18, .78, .28, 0xe9eee8, .16, 5, { roughness: .62 });
  caseMesh.position.y = .42;
  const face = cylinder(.37, .035, 0xfffdf4, { roughness: .72 });
  face.rotation.x = Math.PI / 2;
  face.position.set(.2, .46, .16);
  const bezel = torus(.37, .035, palette.deep, { roughness: .5 });
  bezel.position.copy(face.position);
  const needlePivot = new THREE.Group();
  needlePivot.position.set(.2, .46, .195);
  const needle = roundedBox(.045, .29, .025, color, .015, 2, { emissive: color, emissiveIntensity: .2 });
  needle.position.y = .135;
  needlePivot.add(needle);
  gauge.add(caseMesh, face, bezel, needlePivot);
  for (let index = 0; index <= 5; index += 1) {
    const tick = roundedBox(.025, .075, .025, palette.deep, .006, 1, { castShadow: false });
    const angle = THREE.MathUtils.lerp(-2.15, .95, index / 5);
    tick.position.set(.2 + Math.cos(angle) * .29, .46 + Math.sin(angle) * .29, .205);
    tick.rotation.z = angle - Math.PI / 2;
    gauge.add(tick);
  }
  gauge.userData.needlePivot = needlePivot;
  return gauge;
}

function makeCart() {
  const cart = new THREE.Group();
  const chassis = roundedBox(1.22, .34, .82, palette.blue, .13, 5, {
    roughness: .32, metalness: .08,
  });
  chassis.position.y = .43;
  const tray = roundedBox(.92, .2, .65, 0x8bc5ff, .09, 4, { roughness: .38 });
  tray.position.y = .65;
  const bumper = roundedBox(.13, .25, .9, palette.deep, .05, 3, { roughness: .6 });
  bumper.position.set(.66, .35, 0);
  cart.add(chassis, tray, bumper);
  const wheels = [];
  for (const x of [-.42, .42]) {
    for (const z of [-.43, .43]) {
      const axle = new THREE.Group();
      axle.position.set(x, .2, z);
      const tyre = cylinder(.19, .13, 0x193b43, { segments: 24, roughness: .88 });
      tyre.rotation.x = Math.PI / 2;
      const hub = cylinder(.07, .15, palette.metal, { segments: 18, metalness: .7, roughness: .22 });
      hub.rotation.x = Math.PI / 2;
      const spoke = roundedBox(.31, .035, .145, 0xdce8e8, .012, 2, { metalness: .55, roughness: .25 });
      axle.add(tyre, hub, spoke);
      cart.add(axle);
      wheels.push(axle);
    }
  }
  const frontHook = torus(.17, .035, palette.metal, { arc: Math.PI * 1.55, metalness: .68, roughness: .25 });
  frontHook.rotation.y = Math.PI / 2;
  frontHook.rotation.z = -.25;
  frontHook.position.set(.74, .42, 0);
  cart.add(frontHook);
  cart.userData.wheels = wheels;
  return cart;
}

/** A true rigid-body density column with layer-specific buoyancy and drag. */
export function buildDensity(api) {
  const center = new THREE.Vector3(1.45, 0, .1);
  const baseY = .28;
  const mouthY = 3.68;
  const innerRadius = .76;

  const column = new THREE.Group();
  const foot = cylinder(1.08, .16, palette.deep, { roughness: .42, metalness: .12 });
  foot.position.y = .08;
  const bottomGlass = cylinder(.88, .08, 0xdaf8fb, {
    transparent: true, opacity: .58, roughness: .08, transmission: .45, depthWrite: false,
  });
  bottomGlass.position.y = .22;
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(.88, .88, 3.45, 48, 1, true),
    glassMaterial(),
  );
  wall.position.y = 1.95;
  wall.castShadow = true;
  wall.renderOrder = 5;
  const rim = torus(.88, .055, 0xe8ffff, {
    transparent: true, opacity: .88, roughness: .06, metalness: .05,
  });
  rim.rotation.x = Math.PI / 2;
  rim.position.y = mouthY;
  column.add(foot, bottomGlass, wall, rim);
  for (let index = 1; index <= 12; index += 1) {
    const long = index % 2 === 0;
    const tick = roundedBox(long ? .34 : .22, .024, .024, 0x2e8290, .008, 1, { castShadow: false });
    tick.position.set(-.63, baseY + index * .245, .64);
    column.add(tick);
  }
  addEntity(api, 'column', '密度柱', column, [center.x, 0, center.z], {
    targetOnly: true,
    namePlateMode: 'paired-fixed',
    namePlateFrontOffset: 1.18,
  });

  // Bottom plus eight tangential wall colliders keep released objects inside.
  addStaticBox(api, 'density-column-bottom', new THREE.Vector3(center.x, .23, center.z), new THREE.Vector3(.78, .055, .78), IDENTITY, { friction: .35, restitution: .12 });
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
    const radial = .81;
    const position = new THREE.Vector3(
      center.x + Math.sin(angle) * radial,
      (baseY + mouthY) / 2,
      center.z + Math.cos(angle) * radial,
    );
    const rotation = new THREE.Quaternion().setFromAxisAngle(UP, angle);
    addStaticBox(api, `density-column-wall-${index + 1}`, position, new THREE.Vector3(.32, (mouthY - baseY) / 2, .045), rotation, { friction: .12, restitution: .08 });
  }

  // The lip sits over the opening while the bottle body leans clear of the
  // rim; the carry aims at the same pose the pour animation lands on.
  addSocket(api, 'column', '量筒口', new THREE.Vector3(center.x, mouthY + .03, center.z), .57, palette.mint, null, { halfHeight: .32, pourOffset: [-.18, .45, 0] });

  const layerSpecs = [
    { id: 'honey', color: 0xb86d17, base: baseY, height: .82, density: 1.42, drag: 6.8 },
    { id: 'water', color: 0x43a9dc, base: baseY + .82, height: .94, density: 1.0, drag: 3.8 },
    { id: 'oil', color: 0xf2d25a, base: baseY + 1.76, height: .82, density: .83, drag: 2.3 },
  ];
  const layers = new Map();
  for (const [index, spec] of layerSpecs.entries()) {
    const liquid = cylinder(innerRadius, spec.height, spec.color, {
      transparent: true, opacity: .78, roughness: .12, depthWrite: false,
      transmission: .08,
    });
    liquid.scale.y = .001;
    liquid.position.set(center.x, spec.base, center.z);
    liquid.renderOrder = 1 + index;
    const surface = cylinder(innerRadius * .99, .026, spec.color, {
      transparent: true, opacity: .94, roughness: .05, transmission: .06, depthWrite: false,
    });
    surface.position.set(center.x, spec.base, center.z);
    surface.scale.setScalar(.001);
    surface.renderOrder = 2 + index;
    api.root.add(liquid, surface);
    layers.set(spec.id, { ...spec, liquid, surface, fill: 0, target: 0 });
  }

  const bottles = {
    honey: addEntity(api, 'honey', '蜂蜜', makeBottle(0xb97524, '蜂蜜', 1, { open: true }), [-4.9, 0, -1.25], {
      draggable: true, namePlateMode: 'paired-fixed', namePlateFrontOffset: .82,
      physics: { shape: 'cylinder', radius: .464, halfHeight: .841, center: [0, .856, 0], density: 1.3, friction: .55, restitution: .04 },
    }),
    water: addEntity(api, 'water', '水', makeBottle(palette.blue, '水', 1, { open: true }), [-3.25, 0, -1.25], {
      draggable: true, namePlateMode: 'paired-fixed', namePlateFrontOffset: .82,
      physics: { shape: 'cylinder', radius: .464, halfHeight: .841, center: [0, .856, 0], density: 1.0, friction: .5, restitution: .05 },
    }),
    oil: addEntity(api, 'oil', '食用油', makeBottle(0xf1d253, '油', 1, { open: true }), [-1.6, 0, -1.25], {
      draggable: true, namePlateMode: 'paired-fixed', namePlateFrontOffset: .82,
      physics: { shape: 'cylinder', radius: .464, halfHeight: .841, center: [0, .856, 0], density: .82, friction: .48, restitution: .06 },
    }),
  };
  for (const [id, object] of Object.entries(bottles)) {
    api.setPhysicsPose?.(
      id,
      object.getWorldPosition(new THREE.Vector3()),
      object.getWorldQuaternion(new THREE.Quaternion()),
      { dynamic: false, velocity: { x: 0, y: 0, z: 0 } },
    );
  }

  const corkModel = new THREE.Group();
  const corkBody = cylinder(.29, .48, 0xb87943, { segments: 30, roughness: .94 });
  const corkTop = cylinder(.275, .012, 0xd39a60, { segments: 30, roughness: 1 });
  corkTop.position.y = .247;
  corkModel.add(corkBody, corkTop);
  const poreRandom = seeded(17);
  for (let index = 0; index < 9; index += 1) {
    const pore = sphere(.018 + poreRandom() * .012, 0x754827, { roughness: 1, castShadow: false });
    const a = poreRandom() * Math.PI * 2;
    const r = .05 + poreRandom() * .18;
    pore.position.set(Math.cos(a) * r, .258, Math.sin(a) * r);
    pore.scale.y = .22;
    corkModel.add(pore);
  }
  const cork = addEntity(api, 'cork', '軟木塞', corkModel, [-4.15, .26, 1.65], {
    draggable: true,
    namePlateMode: 'paired-fixed',
    namePlateFrontOffset: .62,
    physics: { shape: 'cylinder', density: .24, height: .48, friction: .38, restitution: .16, linearDamping: .16, angularDamping: .32, allowRotation: true },
  });

  const beadModel = new THREE.Group();
  const beadGlass = sphere(.27, 0x90dbf0, {
    transparent: true, opacity: .72, roughness: .035, transmission: .55,
    thickness: .16, ior: 1.5, attenuationColor: 0x8ad9ed, depthWrite: false,
  });
  const beadCore = sphere(.095, 0xe8fbff, { transparent: true, opacity: .64, roughness: .03, emissive: 0xa9edff, emissiveIntensity: .2, depthWrite: false });
  beadCore.position.set(-.06, .065, .09);
  beadModel.add(beadGlass, beadCore);
  const bead = addEntity(api, 'bead', '玻璃珠', beadModel, [-2.45, .3, 1.65], {
    draggable: true,
    namePlateMode: 'paired-fixed',
    namePlateFrontOffset: .62,
    physics: { shape: 'ball', radius: .27, density: 2.5, friction: .28, restitution: .22, linearDamping: .08, angularDamping: .18, allowRotation: true },
  });

  const streams = {};
  for (const spec of layerSpecs) {
    streams[spec.id] = makePourDrops(spec.color, 20);
    api.root.add(streams[spec.id].group);
  }
  let activePour = null;
  const released = new Set();

  function installSolid(id) {
    const dropWorld = worldPoint(api, new THREE.Vector3(center.x, mouthY + .32, center.z));
    const current = api.getPhysicsPose?.(id);
    // The student's release already put the real body at the opening. Only
    // correct an out-of-aperture pose (for example a restored save or a very
    // fast touch flick); do not teleport a valid body that is already falling.
    if (!current || Math.hypot(current.position.x - dropWorld.x, current.position.z - dropWorld.z) > innerRadius * .7) {
      api.setPhysicsPose?.(id, dropWorld, worldQuaternion(api), { dynamic: true, velocity: { x: 0, y: -.12, z: 0 } });
    } else {
      api.makePhysicsDynamic?.(id, id === 'cork'
        ? { x: 0, y: Math.min(-.12, current.velocity?.y || 0), z: 0 }
        : { x: current.velocity?.x || 0, y: Math.min(-.08, current.velocity?.y || 0), z: current.velocity?.z || 0 });
    }
    api.setPhysicsMaterial?.(id, { friction: id === 'cork' ? .3 : .24, restitution: id === 'cork' ? .13 : .2 });
    if (id === 'bead') api.applyPhysicsImpulse?.(id, { x: .006, y: -.018, z: .003 });
    released.add(id);
  }

  api.onAction = (action) => {
    const layer = layers.get(action.subject);
    if (layer) {
      layer.target = 1;
      activePour = action.subject;
      api.tiltPour(bottles[action.subject], null, layer.color, { target: 'column' });
    }
    if (action.subject === 'cork' || action.subject === 'bead') {
      installSolid(action.subject);
    }
  };

  function applyLayerForces(id, objectDensity, volume, dt) {
    if (!released.has(id)) return;
    const pose = api.getPhysicsPose?.(id);
    if (!pose) return;
    const localY = worldPoint(api, new THREE.Vector3(0, 0, 0)).y;
    const y = pose.position.y - localY;
    const layer = [...layerSpecs].reverse().find((spec) => {
      const state = layers.get(spec.id);
      return state.fill > .9 && y >= spec.base - .08 && y <= spec.base + spec.height * state.fill + .1;
    });
    if (!layer) return;
    const surfaceY = worldPoint(api, new THREE.Vector3(center.x, layer.base + layer.height * layers.get(layer.id).fill, center.z)).y;
    if (api.applyPhysicsBuoyancy) {
      api.applyPhysicsBuoyancy(id, {
        surfaceY,
        liquidDensity: layer.density,
        objectDensity,
        drag: layer.drag,
        volume,
      });
    } else {
      const velocity = pose.velocity;
      const net = Math.max(-2.8, 9.81 * volume * (layer.density - objectDensity));
      api.applyPhysicsImpulse?.(id, {
        x: -velocity.x * layer.drag * dt * .02,
        y: net * dt,
        z: -velocity.z * layer.drag * dt * .02,
      });
    }
  }

  return {
    update(time, dt = 1 / 60) {
      let anyFilling = false;
      for (const layer of layers.values()) {
        const previous = layer.fill;
        layer.fill = damp(layer.fill, layer.target, 2.35, dt);
        if (layer.target > .5 && layer.fill < .992) anyFilling = true;
        const shown = Math.max(.001, layer.fill);
        layer.liquid.scale.y = shown;
        layer.liquid.position.y = layer.base + layer.height * shown / 2;
        layer.surface.position.y = layer.base + layer.height * shown;
        layer.surface.scale.setScalar(layer.fill > .012 ? 1 : .001);
        if (Math.abs(layer.fill - previous) > .0002) layer.surface.scale.y = .75 + Math.sin(time * 7) * .08;
      }
      for (const [id, stream] of Object.entries(streams)) {
        const state = layers.get(id);
        const visible = activePour === id && state.fill < .992;
        const surfaceY = state.base + state.height * state.fill;
        stream.drops.forEach((drop, index) => {
          drop.visible = visible;
          if (!visible) return;
          const phase = (time * 1.65 + index / stream.drops.length) % 1;
          drop.position.set(
            center.x - .12 + Math.sin(index * 2.3) * .035 * phase,
            THREE.MathUtils.lerp(mouthY + .56, surfaceY + .06, phase),
            center.z + Math.cos(index * 1.7) * .035,
          );
          drop.scale.y = 1.2 + phase * 2.1;
        });
      }
      if (!anyFilling) activePour = null;
      applyLayerForces('cork', .24, .105, dt);
      applyLayerForces('bead', 2.5, .082, dt);

      // The oil buoyancy determines the analytical float height. A small
      // critically damped centring force removes pointer-release variance
      // while Rapier still integrates the fall, immersion and wall contacts.
      const corkPose = api.getPhysicsPose?.('cork');
      if (released.has('cork') && corkPose) {
        const oil = layers.get('oil');
        const surfaceY = worldPoint(api, new THREE.Vector3(center.x, oil.base + oil.height * oil.fill, center.z)).y;
        const target = worldPoint(api, new THREE.Vector3(center.x, oil.base + oil.height * oil.fill + .105, center.z));
        if (oil.fill > .94 && corkPose.position.y < surfaceY + .34) {
          const velocity = corkPose.velocity || { x: 0, y: 0, z: 0 };
          const stabilisingForce = {
            x: THREE.MathUtils.clamp((target.x - corkPose.position.x) * .16 - velocity.x * .075, -.16, .16),
            y: THREE.MathUtils.clamp((target.y - corkPose.position.y) * .42 - velocity.y * .18, -.34, .34),
            z: THREE.MathUtils.clamp((target.z - corkPose.position.z) * .16 - velocity.z * .075, -.16, .16),
          };
          if (api.applyPhysicsForce) api.applyPhysicsForce('cork', stabilisingForce);
          else api.setPhysicsVelocity?.('cork', {
            x: velocity.x * .78,
            y: THREE.MathUtils.lerp(velocity.y, (target.y - corkPose.position.y) * 2.4, .2),
            z: velocity.z * .78,
          });
        }
      }
      if (released.has('cork') && corkPose?.position.y > worldPoint(api, new THREE.Vector3(center.x, mouthY + .42, center.z)).y) {
        api.setPhysicsPose?.('cork', worldPoint(api, new THREE.Vector3(center.x, mouthY + .18, center.z)), worldQuaternion(api), {
          dynamic: true,
          velocity: { x: (corkPose.velocity?.x || 0) * .18, y: Math.min(0, corkPose.velocity?.y || 0), z: (corkPose.velocity?.z || 0) * .18 },
        });
      }

      // Subtle liquid meniscus motion without moving the solid bodies by hand.
      for (const layer of layers.values()) {
        if (layer.fill > .98) layer.surface.position.y += Math.sin(time * 2.1 + layer.base) * .003;
      }
    },
    dispose() {},
  };
}

/** A correctly oriented, clamped gravity filter with continuous turbidity change. */
export function buildFilter(api) {
  const center = new THREE.Vector3(1.35, 0, .05);
  const funnelTop = 3.28;
  const funnelBottom = 1.23;
  const collectionHeight = 1.32;

  const stand = new THREE.Group();
  const base = roundedBox(2.25, .17, 1.55, palette.deep, .13, 5, { roughness: .58, metalness: .12 });
  base.position.set(-.72, .085, 0);
  const pole = cylinder(.105, 3.35, palette.metal, { metalness: .68, roughness: .24 });
  pole.position.set(-1.42, 1.75, 0);
  const arm = roundedBox(2.35, .11, .12, palette.metal, .045, 3, { metalness: .7, roughness: .22 });
  arm.position.set(-.25, 2.58, 0);
  const clampRing = torus(.91, .055, palette.metal, { metalness: .72, roughness: .2 });
  clampRing.rotation.x = Math.PI / 2;
  clampRing.position.set(0, 2.58, 0);
  const clampScrew = cylinder(.085, .35, palette.deep, { metalness: .35, roughness: .45 });
  clampScrew.rotation.z = Math.PI / 2;
  clampScrew.position.set(.93, 2.58, 0);
  stand.add(base, pole, arm, clampRing, clampScrew);
  stand.position.set(center.x, 0, center.z);
  api.root.add(stand);
  addStaticBox(api, 'filter-stand-base', new THREE.Vector3(center.x - .72, .09, center.z), new THREE.Vector3(1.125, .085, .775), IDENTITY, { friction: .78 });
  addStaticBox(api, 'filter-stand-pole', new THREE.Vector3(center.x - 1.42, 1.75, center.z), new THREE.Vector3(.11, 1.68, .11), IDENTITY, { friction: .55 });
  addStaticBox(api, 'filter-stand-arm', new THREE.Vector3(center.x - .25, 2.58, center.z), new THREE.Vector3(1.18, .06, .07), IDENTITY, { friction: .45 });

  const funnel = new THREE.Group();
  // CylinderGeometry's first radius is the top radius: this is deliberately
  // wide at +Y and narrow at -Y, unlike the previous inverted funnel.
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(.88, .17, 1.5, 48, 1, true),
    glassMaterial(0xcaf3f5, .26),
  );
  cone.position.y = 2.48;
  cone.renderOrder = 6;
  const coneRim = torus(.88, .045, 0xe6ffff, { transparent: true, opacity: .85, roughness: .05 });
  coneRim.rotation.x = Math.PI / 2;
  coneRim.position.y = funnelTop;
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(.17, .12, .82, 32, 1, true),
    glassMaterial(0xcaf3f5, .3),
  );
  neck.position.y = 1.34;
  const lip = torus(.125, .028, 0xe6ffff, { transparent: true, opacity: .8, roughness: .05 });
  lip.rotation.x = Math.PI / 2;
  lip.position.y = .92;
  funnel.add(cone, coneRim, neck, lip);
  addEntity(api, 'filter', '濾斗', funnel, [center.x, 0, center.z], { targetOnly: true });
  addSocket(api, 'filter', '濾斗口', new THREE.Vector3(center.x, funnelTop + .04, center.z), .65, palette.mint, null, { halfHeight: .32, pourOffset: [-.15, .35, 0] });

  // Funnel neck and eight sloped wall approximations prevent equipment from
  // passing through the fixed apparatus during physical dragging.
  addStaticBox(api, 'filter-neck', new THREE.Vector3(center.x, 1.36, center.z), new THREE.Vector3(.16, .42, .16), IDENTITY, { friction: .35 });
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
    const radial = .57;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, THREE.MathUtils.degToRad(-21)));
    addStaticBox(
      api,
      `filter-wall-${index + 1}`,
      new THREE.Vector3(center.x + Math.sin(angle) * radial, 2.48, center.z + Math.cos(angle) * radial),
      new THREE.Vector3(.3, .78, .038),
      q,
      { friction: .26, restitution: .04 },
    );
  }

  const collection = makeBeaker({ radius: .68, height: collectionHeight });
  collection.position.set(center.x, 0, center.z);
  api.root.add(collection);
  const collected = cylinder(.61, .83, 0xaad8d1, {
    transparent: true, opacity: .72, roughness: .13, depthWrite: false, transmission: .06,
  });
  collected.scale.y = .001;
  collected.position.set(center.x, .08, center.z);
  const collectedSurface = cylinder(.605, .024, 0xbce8df, {
    transparent: true, opacity: .9, roughness: .06, depthWrite: false,
  });
  collectedSurface.position.set(center.x, .08, center.z);
  collectedSurface.scale.setScalar(.001);
  api.root.add(collected, collectedSurface);
  addStaticBox(api, 'filter-collection-bottom', new THREE.Vector3(center.x, .05, center.z), new THREE.Vector3(.62, .045, .62), IDENTITY, { friction: .42 });

  const waterTargetY = .82;
  addSocket(api, 'filtered-water', '濾過水水面', new THREE.Vector3(center.x + .32, waterTargetY, center.z), .44, palette.blue, null, { halfHeight: .24 });

  const cotton = new THREE.Group();
  const cottonRandom = seeded(31);
  for (let index = 0; index < 12; index += 1) {
    const tuft = sphere(.15 + cottonRandom() * .09, 0xf5f4e9, { roughness: 1 });
    const a = cottonRandom() * Math.PI * 2;
    const r = cottonRandom() * .3;
    tuft.position.set(Math.cos(a) * r, cottonRandom() * .08, Math.sin(a) * r);
    tuft.scale.y = .55 + cottonRandom() * .25;
    cotton.add(tuft);
  }
  const cottonEntity = addEntity(api, 'cotton', '棉花', cotton, [-4.45, .16, -1.42], {
    draggable: true, physics: { density: .16, friction: .88, restitution: .04, allowRotation: true },
  });
  const sandCup = addEntity(api, 'sand', '細沙', makeBeaker({ radius: .43, height: .78, liquidColor: 0xe4bf76, liquidLevel: .82 }), [-3.25, 0, -1.42], {
    draggable: true, physics: { shape: 'cylinder', radius: .392, halfHeight: .37, center: [0, .394, 0], density: 1.55, friction: .7, restitution: .03 },
  });
  const gravelCup = addEntity(api, 'gravel', '碎石', makeBeaker({ radius: .43, height: .78, liquidColor: 0x81776b, liquidLevel: .82 }), [-2.08, 0, -1.42], {
    draggable: true, physics: { shape: 'cylinder', radius: .392, halfHeight: .37, center: [0, .394, 0], density: 1.8, friction: .72, restitution: .05 },
  });
  const muddy = addEntity(api, 'muddy-water', '泥水', makeBeaker({ radius: .56, height: 1.28, liquidColor: 0x705537, liquidLevel: .78 }), [-3.85, 0, 1.48], {
    draggable: true, physics: { shape: 'cylinder', radius: .51, halfHeight: .606, center: [0, .647, 0], density: 1.12, friction: .52, restitution: .04 },
  });
  for (const [id, object] of [['sand', sandCup], ['gravel', gravelCup], ['muddy-water', muddy]]) {
    api.setPhysicsPose?.(
      id,
      object.getWorldPosition(new THREE.Vector3()),
      object.getWorldQuaternion(new THREE.Quaternion()),
      { dynamic: false, velocity: { x: 0, y: 0, z: 0 } },
    );
  }

  // Short enough to stand in the collection beaker under the funnel. A taller
  // probe has no path to the water: its head fouls the funnel wall on the way
  // down and the carried body wedges in the neck.
  const sensor = new THREE.Group();
  const probe = cylinder(.065, .56, palette.metal, { metalness: .72, roughness: .21 });
  probe.position.y = .29;
  const probeTip = sphere(.105, palette.blue, { metalness: .15, roughness: .2, emissive: palette.blue, emissiveIntensity: .16 });
  probeTip.position.y = .06;
  const sensorHead = roundedBox(.62, .38, .3, 0x2c8bc6, .12, 5, { roughness: .35 });
  sensorHead.position.y = .72;
  const screen = roundedBox(.38, .16, .025, 0x153f49, .04, 2, { emissive: 0x60e0bb, emissiveIntensity: .22 });
  screen.position.set(0, .74, .165);
  sensor.add(probe, probeTip, sensorHead, screen);
  const sensorEntity = addEntity(api, 'sensor', '濁度探頭', sensor, [-2.25, .04, 1.52], {
    draggable: true, physics: { shape: 'capsule', density: 1.05, friction: .44, restitution: .06, allowRotation: true },
  });

  const filterLayers = {
    cotton: new THREE.Group(),
    sand: new THREE.Group(),
    gravel: new THREE.Group(),
  };
  // Cotton sits directly above the outlet, sand is compact in the middle,
  // and coarse gravel occupies the widest upper section.
  for (let index = 0; index < 11; index += 1) {
    const tuft = sphere(.105 + cottonRandom() * .055, 0xf6f4ea, { roughness: 1 });
    const a = cottonRandom() * Math.PI * 2;
    const r = cottonRandom() * .23;
    tuft.position.set(Math.cos(a) * r, (cottonRandom() - .5) * .08, Math.sin(a) * r);
    tuft.scale.y = .58;
    filterLayers.cotton.add(tuft);
  }
  const sandBed = cylinder(.39, .36, 0xe4bf76, { segments: 40, roughness: .98 });
  filterLayers.sand.add(sandBed);
  const gravelRandom = seeded(47);
  for (let index = 0; index < 30; index += 1) {
    const pebble = sphere(.075 + gravelRandom() * .065, index % 3 === 0 ? 0xa69884 : 0x746b60, { roughness: .95, widthSegments: 12, heightSegments: 8 });
    const a = gravelRandom() * Math.PI * 2;
    const r = Math.sqrt(gravelRandom()) * .5;
    pebble.position.set(Math.cos(a) * r, (gravelRandom() - .5) * .24, Math.sin(a) * r);
    pebble.scale.set(1.1, .72 + gravelRandom() * .35, .9);
    filterLayers.gravel.add(pebble);
  }
  filterLayers.cotton.position.set(center.x, 1.76, center.z);
  filterLayers.sand.position.set(center.x, 2.02, center.z);
  filterLayers.gravel.position.set(center.x, 2.42, center.z);
  Object.values(filterLayers).forEach((group) => {
    group.visible = false;
    group.scale.setScalar(.001);
    api.root.add(group);
  });

  const retained = new THREE.Group();
  const mudRandom = seeded(71);
  const retainedParticles = [];
  for (let index = 0; index < 48; index += 1) {
    const particle = sphere(.024 + mudRandom() * .035, index % 4 === 0 ? 0x4e3828 : 0x765336, { roughness: 1, widthSegments: 9, heightSegments: 6 });
    const a = mudRandom() * Math.PI * 2;
    const r = Math.sqrt(mudRandom()) * .5;
    particle.position.set(Math.cos(a) * r, (index % 3) * -.27, Math.sin(a) * r);
    particle.visible = false;
    retained.add(particle);
    retainedParticles.push(particle);
  }
  retained.position.set(center.x, 2.66, center.z);
  api.root.add(retained);

  const dirtyDrops = makePourDrops(0x6d5033, 24);
  const clearDrops = makePourDrops(0xa8d9cf, 28);
  api.root.add(dirtyDrops.group, clearDrops.group);

  const meterStand = new THREE.Group();
  const meter = makePhysicalGauge(palette.mint);
  // The needle rests at the top of the scale until a probe is in the water;
  // an unmeasured meter must not claim a value.
  meter.userData.needlePivot.rotation.z = .62;
  // A dial the size of a bottle cap is unreadable across a classroom; the
  // instrument is scaled up as a whole so the needle and its scale stay legible.
  meter.scale.setScalar(1.75);
  meter.position.set(0, 0, 0);
  meterStand.add(meter);
  meterStand.position.set(3.05, .1, .62);
  meterStand.rotation.y = -.16;
  api.root.add(meterStand);
  addEntity(api, 'turbidity-meter', '濁度計', meterStand, [3.05, .1, .62], { targetOnly: true });
  // The panel states the reading in words and the bench plate names the
  // instrument, so separate scale captions would only crowd the dial.
  const turbidityDisplay = dynamicDisplay('濁度：未量度', { scale: [3.1, .88] });
  turbidityDisplay.position.set(3.2, 1.9, .62);
  api.root.add(turbidityDisplay);
  const warningLamp = sphere(.16, palette.yellow, { emissive: palette.yellow, emissiveIntensity: .25, roughness: .25 });
  warningLamp.position.set(4.35, .3, 2.24);
  api.root.add(warningLamp);
  const warningCaption = makeLabelSprite('微生物／溶解物：未知', { color: '#7a3b16', background: '#fff3df', scale: .4 });
  warningCaption.position.set(4.35, .8, 2.24);
  api.root.add(warningCaption);

  let filtering = false;
  let filterProgress = 0;
  let collectedLevel = 0;
  let sensorInserted = false;

  function installLayer(id) {
    const layer = filterLayers[id];
    if (!layer) return;
    layer.visible = true;
    api.animateScale(layer, new THREE.Vector3(1, 1, 1), .42);
    if (id === 'cotton') {
      api.moveObject(cottonEntity, new THREE.Vector3(center.x, 1.76, center.z), { duration: .45, scale: .55 });
    } else {
      const source = id === 'sand' ? sandCup : gravelCup;
      api.tiltPour(source, null, id === 'sand' ? 0xe4bf76 : 0x81776b, { target: 'filter' });
    }
  }

  api.onAction = (action) => {
    if (filterLayers[action.subject]) installLayer(action.subject);
    if (action.subject === 'muddy-water') {
      filtering = true;
      filterProgress = 0;
      api.tiltPour(muddy, null, 0x705537, { target: 'filter' });
    }
    if (action.subject === 'sensor') {
      sensorInserted = true;
      const sensorRootPosition = worldPoint(api, new THREE.Vector3(center.x + .32, waterTargetY - .06, center.z));
      api.setPhysicsPose?.('sensor', sensorRootPosition, worldQuaternion(api), { dynamic: false });
      warningLamp.material.emissiveIntensity = 1.45;
      warningLamp.material.color.setHex(palette.coral);
      warningLamp.material.emissive.setHex(palette.coral);
      api.sparkle(new THREE.Vector3(center.x + .32, waterTargetY, center.z), palette.blue, 10);
    }
  };

  return {
    update(time, dt = 1 / 60) {
      if (filtering) {
        filterProgress = Math.min(1, filterProgress + dt / 4.8);
        const flowGate = THREE.MathUtils.smoothstep(filterProgress, .05, .93);
        collectedLevel = damp(collectedLevel, flowGate * .82, 1.35, dt);
        const fill = Math.max(.001, collectedLevel / .83);
        collected.scale.y = fill;
        collected.position.y = .08 + collectedLevel / 2;
        collectedSurface.position.y = .08 + collectedLevel;
        collectedSurface.scale.setScalar(collectedLevel > .015 ? 1 : .001);
        collected.material.color.lerp(new THREE.Color(0xb7dfd8), dt * .5);
        retainedParticles.forEach((particle, index) => {
          particle.visible = index / retainedParticles.length < filterProgress * 1.15;
        });
        if (filterProgress >= 1) filtering = false;
      }

      dirtyDrops.drops.forEach((drop, index) => {
        const phase = (time * 1.4 + index / dirtyDrops.drops.length) % 1;
        const visible = filtering && filterProgress < .62;
        drop.visible = visible;
        if (!visible) return;
        drop.position.set(
          center.x + Math.sin(index * 2.1) * .045,
          THREE.MathUtils.lerp(funnelTop + .45, 2.7, phase),
          center.z + Math.cos(index * 1.8) * .04,
        );
        drop.scale.y = 1.2 + phase * 2;
      });
      clearDrops.drops.forEach((drop, index) => {
        const phase = (time * 1.9 + index / clearDrops.drops.length) % 1;
        const visible = filtering && filterProgress > .12;
        drop.visible = visible;
        if (!visible) return;
        drop.position.set(
          center.x + Math.sin(index * 2.4) * .018,
          THREE.MathUtils.lerp(funnelBottom, .12 + collectedLevel, phase),
          center.z + Math.cos(index * 1.7) * .018,
        );
        drop.scale.y = 1.5 + phase * 2.2;
      });
      if (collectedLevel > .02) collectedSurface.position.y += Math.sin(time * 3.1) * .003;
      if (sensorInserted) {
        screen.material.emissiveIntensity = .45 + Math.sin(time * 4) * .08;
        // The needle settles from the top of the scale onto the reading, so the
        // fall in turbidity is something the student watches happen.
        meter.userData.needlePivot.rotation.z = damp(meter.userData.needlePivot.rotation.z, -.72, 1.9, dt);
      }
      // Read the panel off the needle so the words and the dial never disagree.
      const needle = meter.userData.needlePivot.rotation.z;
      const turbidity = THREE.MathUtils.clamp((.62 - needle) / 1.34, 0, 1);
      if (!sensorInserted) {
        turbidityDisplay.userData.setText('濁度：未量度', '#8fb7c4');
      } else if (turbidity < .45) {
        turbidityDisplay.userData.setText(`濁度：高 ${Math.round(90 - turbidity * 60)} NTU`, '#f0a37a');
      } else if (turbidity < .8) {
        turbidityDisplay.userData.setText(`濁度：中 ${Math.round(90 - turbidity * 60)} NTU`, '#f2d25a');
      } else {
        turbidityDisplay.userData.setText(`濁度：低 ${Math.round(90 - turbidity * 60)} NTU`, '#60e0bb');
      }
    },
    dispose() {},
  };
}

/** A hinged ramp with contact-material friction and a student-driven spring pull. */
export function buildForces(api) {
  const angleDeg = 25;
  const angleRad = THREE.MathUtils.degToRad(angleDeg);
  // With a .18 m deck, y=.14 makes the rotated top face meet the .22 m
  // horizontal track without a floating lip or a hidden step.
  const hinge = new THREE.Vector3(-.15, .14, -.72);
  const rampLength = 4.72;
  const rampWidth = 1.34;
  const trackTopY = .24;

  const rampPivot = new THREE.Group();
  rampPivot.position.copy(hinge);
  rampPivot.rotation.z = -angleRad;
  api.root.add(rampPivot);
  const ramp = roundedBox(rampLength, .18, rampWidth, 0xd09a5c, .08, 4, {
    roughness: .66,
  });
  ramp.position.set(-rampLength / 2, 0, 0);
  rampPivot.add(ramp);
  const edgeMaterial = mat(palette.deep, { roughness: .55, metalness: .14 });
  for (const z of [-rampWidth / 2, rampWidth / 2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(rampLength, .22, .065), edgeMaterial);
    rail.position.set(-rampLength / 2, .17, z);
    rail.castShadow = true;
    rampPivot.add(rail);
  }
  const hingeAxle = cylinder(.19, 1.72, palette.metal, { metalness: .72, roughness: .2 });
  hingeAxle.rotation.x = Math.PI / 2;
  hingeAxle.position.copy(hinge);
  api.root.add(hingeAxle);
  const hingeCapA = cylinder(.27, .08, palette.deep, { roughness: .58 });
  hingeCapA.rotation.x = Math.PI / 2;
  hingeCapA.position.set(hinge.x, hinge.y, hinge.z - .89);
  const hingeCapB = hingeCapA.clone();
  hingeCapB.position.z = hinge.z + .89;
  api.root.add(hingeCapA, hingeCapB);

  const rampQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -angleRad);
  const rampColliderCenter = new THREE.Vector3(-rampLength / 2, -.01, 0).applyQuaternion(rampQuaternion).add(hinge);
  addStaticBox(api, 'force-ramp-surface', rampColliderCenter, new THREE.Vector3(rampLength / 2, .1, rampWidth / 2), rampQuaternion, { friction: .24, restitution: .03 });
  for (const [index, z] of [-rampWidth / 2, rampWidth / 2].entries()) {
    const local = new THREE.Vector3(-rampLength / 2, .19, z).applyQuaternion(rampQuaternion).add(hinge);
    addStaticBox(api, `force-ramp-rail-${index + 1}`, local, new THREE.Vector3(rampLength / 2, .2, .045), rampQuaternion, { friction: .32 });
  }

  const runLength = 5.25;
  // Tuned so the cart still travels a clear, readable distance on the rough
  // surface rather than stopping the moment it arrives.
  const roughFriction = .44;
  const runCenterX = hinge.x + runLength / 2 - .04;
  const runout = roundedBox(runLength, .16, 1.48, 0xe9d4aa, .08, 4, { roughness: .62 });
  runout.position.set(runCenterX, .14, hinge.z);
  api.root.add(runout);
  addStaticBox(api, 'force-runout-surface', new THREE.Vector3(runCenterX, .14, hinge.z), new THREE.Vector3(runLength / 2, .08, .74), IDENTITY, { friction: .14, restitution: .025 });
  for (const [index, z] of [hinge.z - .74, hinge.z + .74].entries()) {
    const rail = roundedBox(runLength, .2, .065, palette.deep, .025, 2, { roughness: .58 });
    rail.position.set(runCenterX, .28, z);
    api.root.add(rail);
    addStaticBox(api, `force-runout-rail-${index + 1}`, new THREE.Vector3(runCenterX, .28, z), new THREE.Vector3(runLength / 2, .18, .045), IDENTITY, { friction: .4 });
  }
  // Distances are read from the foot of the ramp, where the horizontal run
  // begins, so 0 m is the moment the cart stops descending.
  const rulerZ = hinge.z + 1.02;
  const rulerStrip = roundedBox(runLength, .03, .3, 0xfdf6e3, .012, 2, { roughness: .8, castShadow: false });
  rulerStrip.position.set(hinge.x + runLength / 2, .16, rulerZ);
  api.root.add(rulerStrip);
  for (let metre = 0; metre <= 5; metre += 1) {
    const major = roundedBox(.035, .04, .2, palette.deep, .01, 1, { castShadow: false });
    major.position.set(hinge.x + metre, .19, rulerZ);
    api.root.add(major);
    const mark = makeLabelSprite(`${metre} m`, { color: '#123b45', background: '#fdf6e3', scale: .42 });
    mark.position.set(hinge.x + metre, .36, rulerZ + .34);
    api.root.add(mark);
    if (metre < 5) {
      const half = roundedBox(.025, .03, .11, 0x6f8f96, .008, 1, { castShadow: false });
      half.position.set(hinge.x + metre + .5, .185, rulerZ);
      api.root.add(half);
    }
  }
  api.root.add(makeLabelSprite('距離尺 · 由斜台底計起', { color: '#123b45', background: '#fdf6e3', scale: .5 })
    .translateX(hinge.x + runLength / 2)
    .translateY(.82)
    .translateZ(rulerZ + .34));

  const endBumper = roundedBox(.16, .56, 1.52, palette.coral, .055, 3, { roughness: .48 });
  endBumper.position.set(hinge.x + runLength - .02, .36, hinge.z);
  api.root.add(endBumper);
  addStaticBox(api, 'force-end-bumper', endBumper.position.clone(), new THREE.Vector3(.09, .3, .76), IDENTITY, { friction: .45, restitution: .18 });

  const rampHandle = addEntity(api, 'ramp-angle', '角度把手', makeButton(palette.yellow), [-4.78, .05, -2.1], { adjustable: true });
  const angleGauge = new THREE.Group();
  angleGauge.position.set(hinge.x, .35, hinge.z + .86);
  api.root.add(angleGauge);
  const arcPoints = [];
  for (let index = 0; index <= 24; index += 1) {
    const a = THREE.MathUtils.lerp(Math.PI, Math.PI * 1.42, index / 24);
    arcPoints.push(new THREE.Vector3(Math.cos(a) * .66, Math.sin(a) * .66, 0));
  }
  const arc = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arcPoints), 28, .025, 6, false),
    mat(palette.metal, { metalness: .5, roughness: .28 }),
  );
  const angleNeedle = roundedBox(.54, .045, .045, palette.coral, .014, 2, { emissive: palette.coral, emissiveIntensity: .22 });
  angleNeedle.position.x = -.25;
  angleNeedle.rotation.z = -angleRad;
  angleGauge.add(arc, angleNeedle);

  // The socket sits one wheel clearance above the real ramp surface, not at
  // bench height or at a camera-facing approximation.
  const startLocal = new THREE.Vector3(-rampLength + .56, .13, 0);
  const startPosition = startLocal.clone().applyQuaternion(rampQuaternion).add(hinge);
  const startSocket = makeTargetRing(palette.yellow, .49);
  startSocket.position.copy(startLocal);
  rampPivot.add(startSocket);
  api.target('ramp-start', '斜台起點', startSocket, {
    radius: .62,
    physics: { shape: 'cuboid', halfExtents: [.58, .28, .58], padding: .04 },
  });

  const runTarget = makeTargetRing(palette.mint, 1.62);
  runTarget.position.set(runCenterX, .24, hinge.z);
  api.root.add(runTarget);
  api.target('runout', '水平軌道', runTarget, {
    radius: 2.12,
    physics: { shape: 'cuboid', halfExtents: [2.38, .3, .66], padding: .04 },
  });

  const cart = makeCart();
  addEntity(api, 'cart', '小車', cart, [-4.2, .2, 1.55], {
    draggable: true,
    physics: { density: .82, friction: .16, restitution: .045, linearDamping: .07, angularDamping: .22, rotationAxes: [false, false, true] },
  });

  const release = addEntity(api, 'release', '釋放掣', makeButton(palette.mint), [-4.82, .05, -.58], { tappable: true });

  const roughGroup = new THREE.Group();
  // Narrower than the 1.39 gap between the run-out rails, so the board has
  // real clearance to be lowered between them instead of jamming.
  const roughBoard = roundedBox(4.55, .13, 1.24, 0x8b6547, .045, 3, { roughness: 1 });
  roughBoard.position.y = .08;
  roughGroup.add(roughBoard);
  const roughRandom = seeded(99);
  for (let index = 0; index < 80; index += 1) {
    const grit = sphere(.018 + roughRandom() * .025, index % 3 ? 0x6f4c35 : 0xab8060, { roughness: 1, widthSegments: 7, heightSegments: 5, castShadow: false });
    grit.position.set((roughRandom() - .5) * 4.25, .15 + roughRandom() * .02, (roughRandom() - .5) * 1.04);
    roughGroup.add(grit);
  }
  const rough = addEntity(api, 'rough-track', '粗糙表面', roughGroup, [2.25, .13, 1.62], {
    draggable: true,
    physics: { friction: .58, density: 1.1, restitution: .015, linearDamping: 3.5, angularDamping: 6 },
  });

  const frictionLamp = roundedBox(.22, .22, .08, palette.coral, .05, 3, { emissive: palette.coral, emissiveIntensity: .08 });
  frictionLamp.position.set(4.35, .58, 1.88);
  api.root.add(frictionLamp);

  function makeStopMarker(text, color, zOffset) {
    const marker = new THREE.Group();
    const pole = cylinder(.028, .74, color, { metalness: .2, roughness: .38 });
    pole.position.y = .37;
    const foot = cylinder(.12, .035, color, { roughness: .5 });
    const readout = dynamicDisplay(`${text} —`, { scale: [2.05, .58] });
    readout.position.y = .95;
    marker.add(pole, foot, readout);
    marker.userData.readout = readout;
    marker.userData.text = text;
    marker.position.set(hinge.x, trackTopY + .02, hinge.z + zOffset);
    marker.visible = false;
    api.root.add(marker);
    return marker;
  }

  const smoothStopMarker = makeStopMarker('光滑面停點', palette.blue, .42);
  const roughStopMarker = makeStopMarker('粗糙面停點', palette.coral, -.42);

  let currentAngle = angleDeg;
  let cartPlaced = false;
  let runs = 0;
  let roughInstalled = false;
  let running = false;
  let lastCartSpeed = 0;
  let wheelAngle = 0;
  let previousCartX = cart.position.x;
  let runStartX = null;
  let runPeakDistance = 0;
  const trialDistances = { smooth: null, rough: null };
  const trialMetres = { smooth: null, rough: null };
  let comparisonReady = false;

  function finishRun(localCart) {
    if (!running || !localCart || !Number.isFinite(runStartX)) return;
    const trial = roughInstalled ? 'rough' : 'smooth';
    const measuredDistance = Math.max(runPeakDistance, localCart.x - runStartX, 0);
    trialDistances[trial] = measuredDistance;
    const marker = trial === 'rough' ? roughStopMarker : smoothStopMarker;
    marker.position.x = THREE.MathUtils.clamp(localCart.x, hinge.x + .12, hinge.x + runLength - .22);
    // Read off the same scale the student reads: metres from the foot of the ramp.
    const metres = Math.max(0, marker.position.x - hinge.x);
    trialMetres[trial] = Number(metres.toFixed(1));
    marker.userData.readout.userData.setText(
      `${marker.userData.text} ${metres.toFixed(1)} m`,
      trial === 'rough' ? '#f0a37a' : '#60e0bb',
    );
    marker.visible = true;
    comparisonReady = Number.isFinite(trialDistances.smooth) && Number.isFinite(trialDistances.rough);
    running = false;
    // The labelled stop marker keeps the evidence, so the cart returns to the
    // start: the run-out is left clear for the rough board, and the next trial
    // begins from the same height.
    poseOnRamp();
  }

  function clearCartForces() {
    api.setPhysicsForce?.('cart', { x: 0, y: 0, z: 0 });
  }

  function updateRampCollision(degrees) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -THREE.MathUtils.degToRad(degrees));
    const centerLocal = new THREE.Vector3(-rampLength / 2, -.01, 0).applyQuaternion(q).add(hinge);
    api.updateStaticPose?.('force-ramp-surface', worldPoint(api, centerLocal), worldQuaternion(api, q));
    for (const [index, z] of [-rampWidth / 2, rampWidth / 2].entries()) {
      const railLocal = new THREE.Vector3(-rampLength / 2, .19, z).applyQuaternion(q).add(hinge);
      api.updateStaticPose?.(`force-ramp-rail-${index + 1}`, worldPoint(api, railLocal), worldQuaternion(api, q));
    }
  }

  function poseOnRamp() {
    clearCartForces();
    const world = worldPoint(api, startPosition);
    api.setPhysicsPose?.('cart', world, worldQuaternion(api, rampQuaternion), { dynamic: false, velocity: { x: 0, y: 0, z: 0 } });
    api.setPhysicsMaterial?.('cart', { friction: .16, restitution: .035 });
    cartPlaced = true;
    running = false;
  }

  api.onPreview = (subject, value) => {
    if (subject !== 'ramp-angle') return;
    currentAngle = THREE.MathUtils.clamp(value, 5, 40);
    rampPivot.rotation.z = -THREE.MathUtils.degToRad(currentAngle);
    angleNeedle.rotation.z = -THREE.MathUtils.degToRad(currentAngle);
    updateRampCollision(currentAngle);
    startSocket.updateWorldMatrix(true, false);
    api.updateTargetPose?.('ramp-start', startSocket.getWorldPosition(new THREE.Vector3()), startSocket.getWorldQuaternion(new THREE.Quaternion()));
  };

  api.onAction = (action) => {
    if (action.subject === 'ramp-angle') {
      currentAngle = angleDeg;
      rampPivot.rotation.z = -angleRad;
      angleNeedle.rotation.z = -angleRad;
      updateRampCollision(angleDeg);
      api.pressButton(rampHandle);
      startSocket.updateWorldMatrix(true, false);
      api.updateTargetPose?.('ramp-start', startSocket.getWorldPosition(new THREE.Vector3()), startSocket.getWorldQuaternion(new THREE.Quaternion()));
    }
    if (action.subject === 'cart') poseOnRamp();
    if (action.subject === 'rough-track') {
      const currentPose = api.getPhysicsPose?.('cart');
      if (running && currentPose) {
        finishRun(api.root.worldToLocal(new THREE.Vector3(currentPose.position.x, currentPose.position.y, currentPose.position.z)));
      }
      roughInstalled = true;
      // The board is the visible surface; the track it covers is what the cart
      // actually rolls on, so the roughness is applied to the track's contact
      // material. Leaving the board's own collider in play made it a kerb.
      const destination = new THREE.Vector3(hinge.x + 2.48, .1, hinge.z);
      api.setPhysicsPose?.('rough-track', worldPoint(api, destination), worldQuaternion(api), { dynamic: false });
      api.setPhysicsEnabled?.('rough-track', false);
      api.setPhysicsMaterial?.('force-runout-surface', { friction: roughFriction, restitution: .02 });
    }
    if (action.subject === 'release') {
      runs += 1;
      api.pressButton(release);
      if (!cartPlaced || runs > 1) poseOnRamp();
      clearCartForces();
      // The cart must descend under gravity. Once it reaches the horizontal
      // section, the installed collider's actual contact material supplies
      // the rough/smooth difference; no scripted rolling impulse is applied.
      // The cart is the control. Changing its own friction would also slow it
      // on the ramp, which is not the variable under test.
      api.setPhysicsMaterial?.('cart', { friction: .12, restitution: .035 });
      api.makePhysicsDynamic?.('cart', { x: 0, y: 0, z: 0 });
      runStartX = startPosition.x;
      runPeakDistance = 0;
      running = true;
    }
  };

  return {
    update(time, dt = 1 / 60) {
      const pose = api.getPhysicsPose?.('cart');
      let localCart = null;
      if (pose) {
        localCart = api.root.worldToLocal(new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z));
        const dx = localCart.x - previousCartX;
        previousCartX = localCart.x;
        wheelAngle -= dx / .19;
        cart.userData.wheels.forEach((wheel) => { wheel.rotation.z = wheelAngle; });
        const speed = Math.hypot(pose.velocity.x, pose.velocity.y, pose.velocity.z);
        lastCartSpeed = speed;
        if (running && Number.isFinite(runStartX)) runPeakDistance = Math.max(runPeakDistance, localCart.x - runStartX);
        if (running && localCart.x > hinge.x + .05) {
          const heat = THREE.MathUtils.clamp(speed / 1.4, 0, 1);
          frictionLamp.material.emissiveIntensity = roughInstalled ? .22 + heat * (.7 + Math.sin(time * 9) * .12) : .1;
        }
        if (running && (speed < .035 && runPeakDistance > .45 || localCart.x > hinge.x + 4.82)) finishRun(localCart);
      }

    },
    getState() {
      return {
        experiment: 'force-coaster',
        angleDeg: currentAngle,
        roughInstalled,
        running,
        cartSpeed: Number(lastCartSpeed.toFixed(3)),
        comparisonReady,
        comparison: {
          controlledVariables: ['cart', 'rampAngle', 'startPosition'],
          independentVariable: 'surfaceRoughness',
          smoothMetres: trialMetres.smooth,
          roughMetres: trialMetres.rough,
          smoothTravelWorldUnits: Number.isFinite(trialDistances.smooth) ? Number(trialDistances.smooth.toFixed(3)) : null,
          roughTravelWorldUnits: Number.isFinite(trialDistances.rough) ? Number(trialDistances.rough.toFixed(3)) : null,
          roughStopsSooner: comparisonReady ? trialDistances.rough < trialDistances.smooth : null,
        },
      };
    },
    dispose() {
      clearCartForces();
    },
  };
}

/** A surface of revolution from a [radius, height] profile — bottles, basins, balloons. */
function lathe(profile, color, options = {}, segments = 56) {
  const points = profile.map(([radius, height]) => new THREE.Vector2(Math.max(radius, 0), height));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points, segments), mat(color, options));
  mesh.geometry.computeVertexNormals();
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

/** A soft round puff, used for steam and cold mist. Drawn, never fetched. */
let puffTexture = null;
function puffMap() {
  if (puffTexture) return puffTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(.38, 'rgba(255,255,255,.78)');
  gradient.addColorStop(.72, 'rgba(255,255,255,.26)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  puffTexture = new THREE.CanvasTexture(canvas);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
}

/**
 * Soft light streaks for a water surface. Still water in a pale bowl is
 * invisible from above; the moving glints are what say "liquid".
 */
let glintTexture = null;
function glintMap() {
  if (glintTexture) return glintTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 256, 256);
  // Deterministic placement: the same bench must screenshot the same way.
  for (let index = 0; index < 30; index += 1) {
    const angle = index * 2.399;
    const radius = 22 + ((index * 37) % 100);
    const x = 128 + Math.cos(angle) * radius;
    const y = 128 + Math.sin(angle) * radius;
    const long = 9 + ((index * 13) % 22);
    context.save();
    context.translate(x, y);
    context.rotate(angle * 1.7);
    context.scale(long / 7, 1);
    const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 7);
    gradient.addColorStop(0, 'rgba(255,255,255,.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(0, 0, 7, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  glintTexture = new THREE.CanvasTexture(canvas);
  glintTexture.colorSpace = THREE.SRGBColorSpace;
  return glintTexture;
}

/**
 * A drifting column of puffs. Hot water sends steam up; ice water spills a
 * heavier mist that sinks over the rim, so the two baths read differently at a
 * glance even in a still screenshot.
 */
function makeVapour(count, { colour = 0xffffff, rise = .9, spread = .5, size = .7, sink = false, inner = .18 } = {}) {
  const group = new THREE.Group();
  const puffs = [];
  for (let index = 0; index < count; index += 1) {
    const material = new THREE.SpriteMaterial({
      map: puffMap(), color: colour, transparent: true, opacity: 0, depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(size);
    group.add(sprite);
    puffs.push({
      sprite,
      phase: index / count,
      angle: index * 2.399,
      drift: .5 + (index % 3) * .28,
    });
  }
  group.userData.update = (time, strength) => {
    group.visible = strength > .01;
    if (!group.visible) return;
    for (const puff of puffs) {
      const t = (time * .34 + puff.phase) % 1;
      const swirl = puff.angle + t * puff.drift * (sink ? -1 : 1);
      const radius = spread * (sink ? .35 + t * .95 : inner + t * .72);
      puff.sprite.position.set(
        Math.cos(swirl) * radius,
        sink ? .12 - t * rise : t * rise,
        Math.sin(swirl) * radius,
      );
      puff.sprite.scale.setScalar(size * (.42 + t * (sink ? .8 : 1.25)));
      // Fade in off the water and out at the top so nothing pops.
      puff.sprite.material.opacity = strength * Math.sin(Math.PI * t) * (sink ? .5 : .88);
    }
  };
  return group;
}

/**
 * A rigid PET bottle. The whole point of the experiment is that the bottle does
 * not change shape, so it is drawn with the things that say "rigid": a moulded
 * foot, waist flutes, a shoulder curve, a threaded neck and a lip flange.
 */
function makeRigidBottle() {
  const group = new THREE.Group();
  const wall = {
    transparent: true, roughness: .06, metalness: 0,
    transmission: .98, thickness: .1, ior: 1.5,
    attenuationColor: 0xf2fcfd, attenuationDistance: 9,
    clearcoat: .7, clearcoatRoughness: .06,
    side: THREE.DoubleSide,
  };
  const shell = lathe([
    [0, .015], [.26, .012], [.40, .028], [.485, .085], [.515, .17],
    [.52, .34], [.487, .43], [.52, .52],
    [.52, .74], [.487, .83], [.52, .92],
    [.52, 1.2], [.518, 1.33], [.505, 1.44],
    [.462, 1.58], [.392, 1.71], [.302, 1.83], [.221, 1.92], [.184, 1.99],
    [.178, 2.05], [.178, 2.13],
  ], 0xffffff, wall);
  group.add(shell);

  // A moulded base ring: a real bottle stands on a raised foot, not a flat disc.
  const foot = torus(.475, .045, 0xd8eff3, {
    transparent: true, opacity: .55, roughness: .12, clearcoat: .6,
  });
  foot.rotation.x = Math.PI / 2;
  foot.position.y = .045;
  group.add(foot);

  // Neck threads.
  for (let index = 0; index < 3; index += 1) {
    const thread = torus(.192, .017, 0xdaf1f5, {
      transparent: true, opacity: .62, roughness: .16, clearcoat: .5,
    });
    thread.rotation.x = Math.PI / 2;
    thread.rotation.z = index * .5;
    thread.position.y = 2.02 + index * .038;
    group.add(thread);
  }

  // The lip flange the balloon grips.
  const lip = torus(.196, .028, 0xcfeaf0, {
    transparent: true, opacity: .74, roughness: .1, clearcoat: .7,
  });
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 2.145;
  group.add(lip);

  const mouth = new THREE.Object3D();
  mouth.name = 'SOCKET_BOTTLE_MOUTH';
  mouth.position.y = 2.16;
  group.add(mouth);
  group.userData.mouth = mouth;
  return group;
}

/**
 * The balloon is rebuilt from a profile rather than scaled, because a stretched
 * sphere never looks like latex: an inflating balloon grows a pear belly and
 * keeps a tight collar, and a cooling one is sucked into a dimple.
 */
const BALLOON_SEGMENTS = 48;
const BALLOON_SKIRT_POINTS = 5;
const BALLOON_BODY_POINTS = 10;
const BALLOON_CROWN_POINTS = 13;
const BALLOON_POINTS = BALLOON_SKIRT_POINTS + BALLOON_BODY_POINTS + BALLOON_CROWN_POINTS;

/**
 * One continuous outline for every state of the balloon, from sucked into the
 * neck (swell -1) to fully stretched (swell 1.4). It is written as a single
 * family on purpose: swapping between an "inflated" and a "collapsed" profile
 * made the shape jump as it crossed zero, and the two had different point
 * counts, so the geometry could not be morphed in place either.
 *
 * The crown is a quarter-ellipse whose rise simply goes negative as the air
 * leaves, which turns the dome into a caved-in dish without any special case.
 */
function balloonProfile(swell) {
  const collar = .232;
  const k = THREE.MathUtils.clamp(-swell, 0, 1);
  const grown = Math.max(swell, 0);
  const wall = collar * (1 + .12 * k);
  const belly = .2325 + grown * .3;
  const height = .25 + grown * .64 - .13 * k;
  const drop = .05 + .17 * k;
  const cave = (height + .07) * k;
  const edgeRadius = THREE.MathUtils.lerp(belly, wall * .87, k);
  const edgeHeight = height * (.55 + .45 * k);
  const crownRise = height * .45 * (1 - k) - cave * k;

  const points = [];
  // The skirt: rubber narrowing onto the neck below the lip.
  for (let index = 0; index < BALLOON_SKIRT_POINTS; index += 1) {
    const u = index / (BALLOON_SKIRT_POINTS - 1);
    points.push([wall * (.66 + .34 * Math.sin(u * Math.PI / 2)), -drop * (1 - u)]);
  }
  // The wall, bulging slightly into a slack fold as the air goes out.
  for (let index = 1; index <= BALLOON_BODY_POINTS; index += 1) {
    const u = index / BALLOON_BODY_POINTS;
    const shape = Math.sin(u * Math.PI / 2) ** .85;
    const fold = 1 + .05 * k * Math.sin(u * Math.PI);
    points.push([(wall + (edgeRadius - wall) * shape) * fold, edgeHeight * u]);
  }
  // The crown: a dome while there is air in it, a dish once there is not.
  for (let index = 1; index <= BALLOON_CROWN_POINTS; index += 1) {
    const w = index / BALLOON_CROWN_POINTS;
    points.push([
      edgeRadius * Math.cos(w * Math.PI / 2),
      edgeHeight + crownRise * Math.sin(w * Math.PI / 2),
    ]);
  }
  return points;
}

/** Rewrite a lathe's vertices from a profile of the same length, allocation-free. */
function writeLathe(geometry, points, segments) {
  const position = geometry.attributes.position;
  const count = points.length;
  for (let column = 0; column <= segments; column += 1) {
    const phi = column / segments * Math.PI * 2;
    const sin = Math.sin(phi);
    const cos = Math.cos(phi);
    for (let index = 0; index < count; index += 1) {
      const point = points[index];
      position.setXYZ(column * count + index, point[0] * sin, point[1], point[0] * cos);
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}

/**
 * A spent balloon on the bench: one continuous profile from the rolled lip,
 * along a short slim neck, into the pear. Built as two meshes it showed a seam
 * at the join, and a long gradual taper read as a decanter rather than latex —
 * the neck has to be short and thin against the belly to say "balloon".
 */
function limpBalloonProfile() {
  return [
    [0, 0], [.055, .006], [.086, .022], [.09, .042], [.062, .064],
    [.056, .12], [.055, .185], [.058, .228],
    [.076, .259], [.117, .297], [.191, .347],
    [.253, .416], [.288, .5], [.294, .566],
    [.276, .646], [.235, .711], [.166, .756], [.09, .778], [0, .785],
  ];
}

function makeBalloon() {
  const group = new THREE.Group();
  const skin = {
    roughness: .34, metalness: 0, clearcoat: .62, clearcoatRoughness: .22,
    side: THREE.DoubleSide,
  };
  const bulb = lathe(balloonProfile(0), 0xef6152, skin, BALLOON_SEGMENTS);
  group.add(bulb);
  // The rolled bead of latex that grips the bottle lip.
  const bead = torus(.239, .028, 0xd4503f, { roughness: .38, clearcoat: .5 });
  bead.rotation.x = Math.PI / 2;
  bead.position.y = .055;
  group.add(bead);

  let drawn = 0;
  let morphable = true;

  group.userData.bead = bead;
  group.userData.setSwell = (swell) => {
    if (morphable && Math.abs(swell - drawn) < .0025) return;
    drawn = swell;
    const k = THREE.MathUtils.clamp(-swell, 0, 1);
    // The bead shrinks into the skirt rather than switching off, so there is no
    // pop partway through the collapse.
    const shrink = 1 - .86 * k;
    bead.scale.setScalar(Math.max(shrink, .02));
    bead.position.y = .055 - k * .2;
    if (!morphable) {
      bulb.geometry.dispose();
      bulb.geometry = new THREE.LatheGeometry(
        balloonProfile(swell).map(([radius, height]) => new THREE.Vector2(radius, height)),
        BALLOON_SEGMENTS,
      );
      morphable = true;
      return;
    }
    writeLathe(bulb.geometry, balloonProfile(swell), BALLOON_SEGMENTS);
  };
  group.userData.setLimp = () => {
    drawn = Number.NaN;
    morphable = false;
    bulb.geometry.dispose();
    bulb.geometry = new THREE.LatheGeometry(
      limpBalloonProfile().map(([radius, height]) => new THREE.Vector2(radius, height)),
      BALLOON_SEGMENTS,
    );
    // Lying on its side, lip to the left, belly resting on the tray.
    bulb.rotation.set(0, 0, -Math.PI * .5);
    bulb.position.set(-.37, .13, 0);
    bulb.scale.set(.46, 1, 1.06);
    bead.visible = false;
  };
  group.userData.setUpright = () => {
    group.scale.setScalar(1);
    group.rotation.set(0, 0, 0);
    bulb.rotation.set(0, 0, 0);
    bulb.position.set(0, 0, 0);
    bulb.scale.set(1, 1, 1);
    bead.visible = true;
    bead.rotation.set(Math.PI / 2, 0, 0);
    bead.position.set(0, .055, 0);
    bead.scale.setScalar(1);
    drawn = Number.NaN;
    morphable = false;
  };
  group.userData.setLimp();
  group.scale.setScalar(1.12);
  group.rotation.y = .38;
  return group;
}

/**
 * A basin with a real wall thickness, so the rim catches light and the water
 * sits inside it rather than floating on a disc.
 */
function makeBath(waterColor, rimColor, { vapour = null } = {}) {
  const group = new THREE.Group();
  const bowl = lathe([
    [0, 0], [.52, 0], [.86, .06], [1.08, .22], [1.19, .44], [1.22, .62],
    [1.225, .68], [1.19, .715], [1.15, .70],
    [1.13, .62], [1.10, .43], [.99, .23], [.76, .09], [.44, .045], [0, .045],
  ], 0xf3f8f9, {
    roughness: .18, metalness: .04, clearcoat: .5, clearcoatRoughness: .18,
    side: THREE.DoubleSide,
  });
  group.add(bowl);

  const rim = torus(1.205, .045, rimColor, { roughness: .28, metalness: .14, clearcoat: .4 });
  rim.rotation.x = Math.PI / 2;
  rim.position.y = .695;
  group.add(rim);

  const level = .5;
  const water = lathe([
    [0, .05], [1.02, .05], [1.115, .3], [1.145, level - .015], [1.13, level], [0, level],
  ], waterColor, {
    transparent: true, opacity: .68, roughness: .03, metalness: .02,
    transmission: .68, thickness: .6, ior: 1.333,
    attenuationColor: waterColor, attenuationDistance: .75,
    side: THREE.DoubleSide, depthWrite: false,
  }, 48);
  water.castShadow = false;
  group.add(water);

  // The surface is its own near-mirror disc. Without it the basin reads empty:
  // clear water seen from above is only visible by what it reflects.
  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(1.132, 56),
    mat(waterColor, {
      transparent: true, opacity: .58, roughness: .03, metalness: .45,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = level + .002;
  surface.castShadow = false;
  surface.receiveShadow = false;
  group.add(surface);

  const glints = new THREE.Mesh(
    new THREE.CircleGeometry(1.118, 48),
    new THREE.MeshBasicMaterial({
      map: glintMap(), transparent: true, opacity: .24,
      depthWrite: false, blending: THREE.AdditiveBlending,
    }),
  );
  glints.rotation.x = -Math.PI / 2;
  glints.position.y = level + .008;
  group.add(glints);

  // The meniscus: water climbs the wall a little, and that thin bright line is
  // most of what makes a surface read as liquid.
  const meniscus = torus(1.112, .019, rimColor, {
    transparent: true, opacity: .46, roughness: .06, clearcoat: .9,
  });
  meniscus.rotation.x = Math.PI / 2;
  meniscus.position.y = level;
  meniscus.castShadow = false;
  group.add(meniscus);

  const mist = vapour ? makeVapour(vapour.count, vapour) : null;
  if (mist) {
    mist.position.y = level + .04;
    group.add(mist);
  }

  group.userData.water = water;
  group.userData.surface = surface;
  group.userData.glints = glints;
  group.userData.meniscus = meniscus;
  group.userData.level = level;
  group.userData.mist = mist;
  return group;
}

/** Ice that floats: most of the cube is under the surface, a corner above it. */
function makeIceCube(size) {
  const cube = roundedBox(size, size * .86, size * .94, 0xf4fcff, size * .17, 3, {
    transparent: true, opacity: .92, roughness: .1, metalness: .02,
    transmission: .34, thickness: .16, ior: 1.31,
    attenuationColor: 0xcdeefb, attenuationDistance: .7,
    clearcoat: .85, clearcoatRoughness: .08,
  });
  cube.castShadow = false;
  return cube;
}

/** A low bench riser, so short apparatus clears its own name plate. */
function makeRiser(radius, height, colour) {
  const group = new THREE.Group();
  const body = lathe([
    [0, 0], [radius * .96, 0], [radius, height * .16],
    [radius * .94, height - .04], [radius * .99, height - .01], [radius, height],
    [radius * .9, height], [0, height],
  ], colour, { roughness: .52, metalness: .04, clearcoat: .25 }, 40);
  const shadowLine = torus(radius * .93, .018, 0xd7ddd6, { roughness: .7 });
  shadowLine.rotation.x = Math.PI / 2;
  shadowLine.position.y = height - .002;
  group.add(body, shadowLine);
  return group;
}

/** A dial with a printed scale, so the set temperature is legible on the bench. */
function makeTemperatureDial(min, max) {
  const group = new THREE.Group();
  const base = cylinder(.52, .13, 0x0d3b46, { roughness: .58, metalness: .12 });
  base.position.y = .065;
  const face = cylinder(.5, .06, 0xf6fbfa, { roughness: .34, metalness: .04 });
  face.position.y = .16;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const dialTop = new THREE.Mesh(
    new THREE.CircleGeometry(.5, 48),
    new THREE.MeshStandardMaterial({ map: texture, roughness: .34, metalness: .02 }),
  );
  dialTop.rotation.x = -Math.PI / 2;
  dialTop.position.y = .191;

  const knob = cylinder(.17, .13, 0x14424e, { roughness: .42, metalness: .22 });
  knob.position.y = .25;
  const cap = cylinder(.115, .035, 0xef8b62, { roughness: .32, metalness: .1 });
  cap.position.y = .085;
  knob.add(cap);
  const pointer = roundedBox(.05, .035, .34, 0xef6a43, .016, 2, { roughness: .28 });
  pointer.position.set(0, .35, -.23);
  const pointerPivot = new THREE.Group();
  pointerPivot.position.y = 0;
  pointerPivot.add(pointer);

  // Knurling: the ridges are what make a dial look grippable rather than moulded.
  for (let index = 0; index < 18; index += 1) {
    const angle = index / 18 * Math.PI * 2;
    const ridge = roundedBox(.026, .12, .045, 0xdcecef, .01, 2, { roughness: .4 });
    ridge.position.set(Math.cos(angle) * .17, 0, Math.sin(angle) * .17);
    ridge.rotation.y = -angle;
    knob.add(ridge);
  }

  group.add(base, face, dialTop, knob, pointerPivot);
  group.userData.buttonTop = knob;
  group.userData.setTemperature = (celsius) => {
    const span = (celsius - min) / (max - min);
    pointerPivot.rotation.y = THREE.MathUtils.lerp(-Math.PI * .72, Math.PI * .72, span);
    context.clearRect(0, 0, 256, 256);
    context.fillStyle = '#f7fbfa';
    context.beginPath();
    context.arc(128, 128, 126, 0, Math.PI * 2);
    context.fill();
    for (let index = 0; index <= 11; index += 1) {
      const t = index / 11;
      const angle = THREE.MathUtils.lerp(Math.PI * .78, Math.PI * 2.22, t);
      const major = index % 2 === 0;
      context.strokeStyle = t < span ? '#e2724a' : '#9db9c1';
      context.lineWidth = major ? 6 : 3;
      context.beginPath();
      context.moveTo(128 + Math.cos(angle) * 108, 128 + Math.sin(angle) * 108);
      context.lineTo(128 + Math.cos(angle) * (major ? 84 : 92), 128 + Math.sin(angle) * (major ? 84 : 92));
      context.stroke();
    }
    context.fillStyle = '#0e3b46';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '700 58px "Microsoft JhengHei", sans-serif';
    context.fillText(`${Math.round(celsius)}`, 128, 116);
    context.font = '600 30px "Microsoft JhengHei", sans-serif';
    context.fillStyle = '#5c8592';
    context.fillText('°C', 128, 160);
    texture.needsUpdate = true;
  };
  group.userData.setTemperature((min + max) / 2);
  return group;
}

/** Air expands when warmed and contracts when cooled — read off a balloon. */
export function buildAirExpansion(api) {
  const hotCentre = new THREE.Vector3(-1.95, 0, -.55);
  const iceCentre = new THREE.Vector3(1.95, 0, -.55);
  const roomTemperature = 22;
  const iceTemperature = 2;
  const bottleAirMl = 500;
  const bathFloor = .05;
  const kelvin = (celsius) => celsius + 273.15;

  const hotBath = makeBath(0xe4f0ef, 0xd9705a, {
    vapour: { count: 12, colour: 0xfffaf6, rise: 1.6, spread: .86, size: .74, inner: .78 },
  });
  hotBath.position.copy(hotCentre);
  api.root.add(hotBath);
  api.entity('hot-bath-bowl', '熱水盆', hotBath, { targetOnly: true });
  addStaticBox(api, 'air-hot-bowl', new THREE.Vector3(hotCentre.x, .1, hotCentre.z), new THREE.Vector3(1.05, .1, 1.05), IDENTITY, { friction: .6 });

  const iceBath = makeBath(0xb6dff5, 0x5aa8d9, {
    vapour: { count: 9, colour: 0xf2fcff, rise: .6, spread: 1.05, size: .95, sink: true },
  });
  iceBath.position.copy(iceCentre);
  api.root.add(iceBath);
  api.entity('ice-bath-bowl', '冰水盆', iceBath, { targetOnly: true });
  addStaticBox(api, 'air-ice-bowl', new THREE.Vector3(iceCentre.x, .1, iceCentre.z), new THREE.Vector3(1.05, .1, 1.05), IDENTITY, { friction: .6 });

  // Ice floats in a ring around where the bottle will stand, so it stays visible
  // once the bottle is in the basin.
  const iceCubes = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = index * 2.399;
    const radius = .6 + (index % 3) * .17;
    const size = .27 + (index % 4) * .05;
    const cube = makeIceCube(size);
    cube.position.set(
      iceCentre.x + Math.cos(angle) * radius,
      iceBath.userData.level - size * .12,
      iceCentre.z + Math.sin(angle) * radius,
    );
    cube.rotation.set(index * .5, index * 1.1, index * .28);
    api.root.add(cube);
    iceCubes.push({ cube, phase: index / 8, base: cube.position.y });
  }

  addSocket(api, 'hot-bath', '熱水盆中', new THREE.Vector3(hotCentre.x, .95, hotCentre.z), .92, palette.coral, null, { halfHeight: .5, snapOffset: [0, .5, 0] });
  addSocket(api, 'ice-bath', '冰水盆中', new THREE.Vector3(iceCentre.x, .95, iceCentre.z), .92, palette.blue, null, { halfHeight: .5, snapOffset: [0, .5, 0] });

  const bottle = addEntity(api, 'bottle', '硬身膠樽', makeRigidBottle(), [0, .04, 1.5], {
    draggable: true,
    physics: { shape: 'cylinder', radius: .56, halfHeight: 1.1, center: [0, 1.06, 0], density: .35, friction: .5, restitution: .04 },
  });

  // The mouth ring travels with the bottle, so the balloon is always dropped
  // onto the opening wherever the bottle happens to be standing.
  const mouthRing = makeTargetRing(palette.mint, .25);
  mouthRing.position.y = 2.22;
  bottle.add(mouthRing);
  api.target('bottle-mouth', '樽口', mouthRing, {
    radius: .5,
    physics: { shape: 'cuboid', halfExtents: [.34, .26, .34], padding: .04 },
  });

  // Small apparatus sits on a riser: a name plate stands 0.55 high just in
  // front of whatever it names, and anything flat on the bench hides behind it.
  const balloonTray = makeRiser(.62, .34, 0xf6f1e4);
  balloonTray.position.set(-3.45, 0, 1.5);
  api.root.add(balloonTray);
  addStaticBox(api, 'air-balloon-riser', new THREE.Vector3(-3.45, .17, 1.5), new THREE.Vector3(.6, .17, .6), IDENTITY, { friction: .8 });

  const dialPlinth = makeRiser(.66, .3, 0xeef3f2);
  dialPlinth.position.set(3.45, 0, 1.5);
  api.root.add(dialPlinth);
  addStaticBox(api, 'air-dial-riser', new THREE.Vector3(3.45, .15, 1.5), new THREE.Vector3(.64, .15, .64), IDENTITY, { friction: .8 });

  const balloon = addEntity(api, 'balloon', '氣球', makeBalloon(), [-3.45, .27, 1.5], {
    draggable: true,
    physics: { shape: 'cuboid', density: .2, friction: .66, restitution: .06 },
  });

  const dial = makeTemperatureDial(30, 85);
  const knob = addEntity(api, 'water-temperature', '熱水溫度掣', dial, [3.45, .32, 1.5], { adjustable: true });

  // Rising bubbles say "this water is hot" without a caption.
  const bubbles = [];
  const bubbleGroup = new THREE.Group();
  bubbleGroup.position.copy(hotCentre);
  api.root.add(bubbleGroup);
  for (let index = 0; index < 14; index += 1) {
    const bubble = sphere(.026 + (index % 3) * .012, 0xffffff, {
      transparent: true, opacity: .5, roughness: .04, metalness: 0,
      clearcoat: 1, depthWrite: false, widthSegments: 10, heightSegments: 8,
    });
    bubble.castShadow = false;
    bubbleGroup.add(bubble);
    bubbles.push({ bubble, phase: index / 14, angle: index * 2.399, radius: .3 + (index % 5) * .13 });
  }

  const readout = dynamicDisplay('氣球未套上樽口', { scale: [3.1, .84] });
  readout.position.set(0, 3.05, -2.6);
  api.root.add(readout);

  let attached = false;
  let bath = null;
  let hotTemperature = 60;
  let shownVolume = 0;

  function bathTemperature() {
    if (bath === 'hot') return hotTemperature;
    if (bath === 'ice') return iceTemperature;
    return roomTemperature;
  }

  /** Charles's law: a sealed, rigid bottle pushes its extra volume into the balloon. */
  function balloonVolumeMl() {
    if (!attached) return 0;
    return bottleAirMl * (kelvin(bathTemperature()) / kelvin(roomTemperature) - 1);
  }

  function updateBalloonShape(volume) {
    if (!attached) return;
    // The real change is only about a sixth of the bottle's air, so the drawn
    // balloon is exaggerated; the millilitre reading stays honest.
    const gain = 90 - 42 * (1 - Math.exp(-Math.max(-volume, 0) / 25));
    balloon.userData.setSwell(THREE.MathUtils.clamp(volume / gain, -1, 1.4));
  }

  function updateReadout() {
    if (!attached) { readout.userData.setText('氣球未套上樽口', '#8fb7c4'); return; }
    const volume = balloonVolumeMl();
    if (bath === null) {
      readout.userData.setText(`室溫 ${roomTemperature} °C · 氣球 0 mL`, '#8fb7c4');
      return;
    }
    const sign = volume >= 0 ? '+' : '−';
    const accent = bath === 'hot' ? '#f0a37a' : '#8fd4e6';
    readout.userData.setText(
      `水溫 ${Math.round(bathTemperature())} °C · 氣球 ${sign}${Math.abs(Math.round(volume))} mL`,
      accent,
    );
  }

  function seatBottle(where) {
    const centre = where === 'hot' ? hotCentre : iceCentre;
    // Standing on the floor of the basin, not hovering over it.
    const seat = new THREE.Vector3(centre.x, bathFloor, centre.z);
    bottle.position.copy(seat);
    bottle.rotation.set(0, 0, 0);
    api.setPhysicsPose?.('bottle', worldPoint(api, seat), worldQuaternion(api), { dynamic: false });
    api.setPhysicsEnabled?.('bottle', false);
    bath = where;
  }

  function attachBalloon() {
    if (attached) return;
    api.setPhysicsEnabled?.('balloon', false);
    api.reparent?.(balloon, bottle);
    balloon.position.set(0, 2.09, 0);
    balloon.rotation.set(0, 0, 0);
    balloon.userData.setUpright();
    attached = true;
    balloon.userData.setSwell(0);
  }

  updateReadout();
  tintHotWater();
  dial.userData.setTemperature(hotTemperature);

  /** Warm water only blushes; it is the steam and bubbles that say "hot". */
  function tintHotWater() {
    const heat = THREE.MathUtils.clamp((hotTemperature - 30) / 55, 0, 1);
    const water = hotBath.userData.water.material;
    water.color.lerpColors(new THREE.Color(0xe6f2f1), new THREE.Color(0xf1dcce), heat);
    water.attenuationColor.copy(water.color);
    hotBath.userData.surface.material.color.copy(water.color);
  }

  api.onPreview = (subject, value) => {
    if (subject !== 'water-temperature') return;
    hotTemperature = THREE.MathUtils.clamp(value, 30, 85);
    tintHotWater();
    dial.userData.setTemperature(hotTemperature);
    updateReadout();
  };

  api.onAction = (action) => {
    if (action.subject === 'balloon' && action.target === 'bottle-mouth') {
      attachBalloon();
      api.sparkle(worldPoint(api, new THREE.Vector3(bottle.position.x, 2.5, bottle.position.z)), palette.mint, 8);
    }
    if (action.subject === 'bottle' && action.target === 'hot-bath') seatBottle('hot');
    if (action.subject === 'bottle' && action.target === 'ice-bath') seatBottle('ice');
    if (action.subject === 'water-temperature') {
      api.pressButton(knob);
      hotTemperature = THREE.MathUtils.clamp(Number(action.value) || hotTemperature, 30, 85);
      tintHotWater();
      dial.userData.setTemperature(hotTemperature);
    }
    updateReadout();
  };

  return {
    update(time, dt = 1 / 60) {
      // Air does not jump to its new volume; it eases there as the bottle warms.
      // Plain exponential damping spends most of a big change in the first half
      // second and then crawls, which reads as a snap rather than as cooling, so
      // the rate is also capped: long changes travel at a steady pace and only
      // the last few millilitres ease in.
      const eased = damp(shownVolume, balloonVolumeMl(), 1.8, dt);
      const step = THREE.MathUtils.clamp(eased - shownVolume, -52 * dt, 52 * dt);
      shownVolume += step;
      updateBalloonShape(shownVolume);

      const heat = THREE.MathUtils.clamp((hotTemperature - 34) / 46, 0, 1);
      const steaming = bath === 'hot' ? .45 + heat * .55 : .22 + heat * .28;
      hotBath.userData.mist?.userData.update(time, steaming);
      iceBath.userData.mist?.userData.update(time, bath === 'ice' ? 1 : .55);

      const boiling = .2 + heat * .5 + (bath === 'hot' ? .3 : 0);
      bubbleGroup.visible = boiling > .02;
      if (bubbleGroup.visible) {
        for (const item of bubbles) {
          const t = (time * (.55 + boiling * .7) + item.phase) % 1;
          item.bubble.position.set(
            Math.cos(item.angle + t * .8) * item.radius,
            bathFloor + .04 + t * (hotBath.userData.level - bathFloor - .04),
            Math.sin(item.angle + t * .8) * item.radius,
          );
          item.bubble.material.opacity = boiling * .55 * Math.sin(Math.PI * Math.min(t * 1.35, 1));
        }
      }

      // A slow turn on the glints is the whole trick: the surface never sits
      // still, so the eye reads it as liquid instead of enamel.
      hotBath.userData.glints.rotation.z += dt * .07;
      iceBath.userData.glints.rotation.z -= dt * .05;
      hotBath.userData.glints.material.opacity = .19 + Math.sin(time * .9) * .05;
      iceBath.userData.glints.material.opacity = .16 + Math.sin(time * .7 + 1.6) * .04;

      // Ice bobs; still ice in still water looks like plastic.
      for (const item of iceCubes) {
        item.cube.position.y = item.base + Math.sin(time * 1.1 + item.phase * 6.28) * .014;
        item.cube.rotation.y += dt * .12;
      }

      if (bath) {
        const water = (bath === 'hot' ? hotBath : iceBath).userData.water;
        water.material.opacity = .82 + Math.sin(time * 2.4) * .02;
      }
      updateReadout();
    },
    getState() {
      const volume = balloonVolumeMl();
      return {
        experiment: 'air-expansion',
        attached,
        bath,
        waterTemperature: Math.round(bathTemperature()),
        balloonVolumeMl: Number(volume.toFixed(1)),
        shownVolumeMl: Number(shownVolume.toFixed(1)),
        expanded: volume > 5,
        contracted: volume < -5,
      };
    },
    dispose() {},
  };
}
