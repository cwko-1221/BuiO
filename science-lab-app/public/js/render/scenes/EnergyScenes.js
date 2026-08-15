import * as THREE from 'three';
import {
  palette,
  mat,
  roundedBox,
  cylinder,
  sphere,
  torus,
  makeButton,
  makeTargetRing,
  makeLabelSprite,
  makeWire,
  replaceWireGeometry,
  worldPosition,
} from '../SceneKit.js';
import { CircuitSystem, OpticalSystem, ThermalSystem } from '../../simulation/ScienceSystems.js';

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const EPSILON = 1e-4;

function addEntity(api, id, label, object, position, options = {}) {
  object.position.set(...position);
  api.root.add(object);
  api.entity(id, label, object, options);
  return object;
}

function addTarget(api, id, label, position, radius = .65, color = palette.mint, options = {}) {
  const target = makeTargetRing(color, radius);
  target.position.set(...position);
  if (options.rotation) target.rotation.set(...options.rotation);
  api.root.add(target);
  api.target(id, label, target, {
    radius,
    physics: options.physics || { shape: 'ball', padding: .04 },
  });
  return target;
}

function addStatic(api, id, object, options = {}) {
  api.addStaticCollider?.(id, object, options);
  return object;
}

function label(text, position, scale = .55, options = {}) {
  const sprite = makeLabelSprite(text, { scale: scale * 1.24, ...options });
  sprite.position.set(...position);
  return sprite;
}

function setWorldLine(mesh, start, end, radius = .025) {
  const delta = end.clone().sub(start);
  const length = Math.max(.001, delta.length());
  mesh.geometry.dispose();
  mesh.geometry = new THREE.CylinderGeometry(radius, radius, length, 10, 1, true);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, delta.normalize());
}

function setBeamFromWorld(mesh, root, start, end, radius = .025) {
  root.updateWorldMatrix(true, false);
  setWorldLine(mesh, root.worldToLocal(start.clone()), root.worldToLocal(end.clone()), radius);
}

function createBeam(color = 0xfff2ad, radius = .026, opacity = .88) {
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 1, 10, 1, true),
    mat(color, {
      transparent: true,
      opacity,
      emissive: color,
      emissiveIntensity: 2.2,
      roughness: .08,
      depthWrite: false,
      castShadow: false,
      receiveShadow: false,
    }),
  );
  beam.visible = false;
  beam.renderOrder = 6;
  return beam;
}

function dynamicDisplay(initialText, { width = 512, height = 192, scale = [2.2, .82] } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(scale[0], scale[1], 1);
  sprite.userData.canvasTexture = texture;
  sprite.userData.text = '';
  sprite.userData.setText = (text, accent = '#60e0bb') => {
    if (sprite.userData.text === `${text}|${accent}`) return;
    sprite.userData.text = `${text}|${accent}`;
    context.clearRect(0, 0, width, height);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#082f39');
    gradient.addColorStop(1, '#0c4c58');
    context.fillStyle = gradient;
    context.beginPath();
    context.roundRect(5, 5, width - 10, height - 10, 30);
    context.fill();
    context.strokeStyle = accent;
    context.lineWidth = 7;
    context.stroke();
    context.fillStyle = '#dffdf5';
    context.font = `700 ${Math.round(height * .43)}px "Microsoft JhengHei", sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, width / 2, height / 2 + 3, width - 44);
    texture.needsUpdate = true;
  };
  sprite.userData.setText(initialText);
  return sprite;
}

function makeThermometer() {
  const group = new THREE.Group();
  const backing = roundedBox(.34, 1.72, .15, 0xf1f0e7, .1, 4, { roughness: .7 });
  backing.position.y = .94;
  const glass = cylinder(.085, 1.42, 0xd8f5f7, {
    transparent: true,
    opacity: .58,
    roughness: .06,
    depthWrite: false,
  });
  glass.position.set(0, .92, .1);
  const mercury = cylinder(.033, .93, palette.coral, {
    emissive: palette.coral,
    emissiveIntensity: .48,
    roughness: .18,
  });
  mercury.position.set(0, .58, .13);
  const bulb = sphere(.17, palette.coral, {
    emissive: palette.coral,
    emissiveIntensity: .48,
    roughness: .18,
  });
  bulb.position.set(0, .17, .13);
  for (let index = 0; index < 7; index += 1) {
    const tick = roundedBox(index % 2 ? .1 : .16, .018, .025, palette.ink, .005, 1, { castShadow: false });
    tick.position.set(.13, .42 + index * .19, .14);
    group.add(tick);
  }
  group.add(backing, glass, mercury, bulb);
  group.userData.mercury = mercury;
  group.userData.bulb = bulb;
  return group;
}

function addCurve(graph, samples, color, { z = .025, width = 2.25, height = 1.05 } = {}) {
  const temperatures = samples.map((point) => point.temperature);
  const minimum = 8;
  const maximum = 24;
  const points = samples.map((point, index) => new THREE.Vector3(
    -width / 2 + width * index / (samples.length - 1),
    -height / 2 + height * (point.temperature - minimum) / (maximum - minimum),
    z,
  ));
  const curve = new THREE.CatmullRomCurve3(points);
  const line = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 48, .024, 7, false),
    mat(color, { emissive: color, emissiveIntensity: 1.05, roughness: .2 }),
  );
  graph.add(line);
  return { line, min: Math.min(...temperatures), max: Math.max(...temperatures) };
}

export function buildEcoHouse(api) {
  const HOUSE_X = .95;
  const WALL_Z = -1.28;
  const SLOT = new THREE.Vector3(1.58, 1.25, WALL_Z + .115);
  const METAL_RACK = new THREE.Vector3(-2.85, .88, -.85);
  // Keep the spare foam panel clear of the house floor collider; the previous
  // edge-touching pose could occasionally be expelled by the solver.
  const FOAM_RACK = new THREE.Vector3(-1.2, .88, 1.82);

  const house = new THREE.Group();
  house.position.set(HOUSE_X, 0, .05);
  api.root.add(house);
  api.entity('house', '節能屋', house, { targetOnly: true });

  const floor = roundedBox(3.65, .18, 2.85, 0xc99662, .13, 4, { roughness: .76 });
  floor.position.set(0, .02, 0);
  house.add(floor);
  addStatic(api, 'eco-floor', floor, { friction: .82 });

  const backMaterial = 0xf2dfbf;
  const slotLocalX = SLOT.x - HOUSE_X;
  const backPieces = [
    roundedBox(1.45, 2.48, .18, backMaterial, .08, 3),
    roundedBox(.52, 2.48, .18, backMaterial, .08, 3),
    roundedBox(1.42, .42, .18, backMaterial, .07, 3),
    roundedBox(1.42, .42, .18, backMaterial, .07, 3),
  ];
  backPieces[0].position.set(-1.05, 1.28, -1.34);
  backPieces[1].position.set(1.57, 1.28, -1.34);
  backPieces[2].position.set(slotLocalX, 2.30, -1.34);
  backPieces[3].position.set(slotLocalX, .21, -1.34);
  backPieces.forEach((piece, index) => {
    house.add(piece);
    addStatic(api, `eco-back-${index}`, piece, { friction: .72 });
  });

  const cavity = roundedBox(1.48, 1.68, .12, 0x31535a, .06, 3, { roughness: .92 });
  cavity.position.set(slotLocalX, 1.25, -1.405);
  house.add(cavity);
  const cavityLip = roundedBox(1.68, 1.88, .055, palette.metal, .08, 3, { metalness: .55, roughness: .28 });
  cavityLip.position.set(slotLocalX, 1.25, -1.29);
  house.add(cavityLip);
  const cavityOpening = roundedBox(1.48, 1.68, .065, 0x24464f, .055, 3, { roughness: .86 });
  cavityOpening.position.set(slotLocalX, 1.25, -1.245);
  house.add(cavityOpening);

  const sideWall = roundedBox(.18, 2.5, 2.72, 0xecd4aa, .09, 3, { roughness: .74 });
  sideWall.position.set(-1.73, 1.28, 0);
  house.add(sideWall);
  addStatic(api, 'eco-side-wall', sideWall, { friction: .72 });

  // Keep the roof recognisable without letting its front overhang occlude the
  // wall-material slot and thermometer mount from the working camera.
  const roofLeft = roundedBox(2.2, .2, 2.25, 0xd86758, .09, 3, { roughness: .62 });
  roofLeft.position.set(-.88, 2.66, -.28);
  roofLeft.rotation.z = .53;
  const roofRight = roofLeft.clone();
  roofRight.position.x = .88;
  roofRight.rotation.z = -.53;
  house.add(roofLeft, roofRight);

  const interiorMat = roundedBox(2.45, .035, 1.75, 0xf1ca87, .025, 2, { roughness: .86 });
  interiorMat.position.set(-.05, .14, .12);
  house.add(interiorMat);
  const windowFrame = roundedBox(.84, 1.0, .09, 0x5b8892, .07, 3, { roughness: .44 });
  windowFrame.position.set(-.65, 1.48, -1.235);
  const windowGlass = roundedBox(.66, .82, .045, 0x9fe5ef, .04, 2, {
    transparent: true,
    opacity: .48,
    roughness: .08,
    depthWrite: false,
  });
  windowGlass.position.z = .06;
  windowFrame.add(windowGlass);
  house.add(windowFrame);

  const thermometerClip = new THREE.Group();
  thermometerClip.position.set(-.34, .22, .33);
  house.add(thermometerClip);
  const clipBack = roundedBox(.58, .16, .46, palette.deep, .07, 3, { roughness: .7 });
  clipBack.position.y = .02;
  thermometerClip.add(clipBack);
  const houseTarget = makeTargetRing(palette.mint, .36);
  houseTarget.position.y = .08;
  thermometerClip.add(houseTarget);
  api.target('house', '屋內溫度計座', houseTarget, {
    radius: .42,
    physics: { shape: 'cuboid', halfExtents: [.38, .32, .38], padding: .02 },
  });

  const wallTarget = makeTargetRing(palette.yellow, .59);
  wallTarget.position.copy(SLOT);
  wallTarget.rotation.x = Math.PI / 2;
  api.root.add(wallTarget);
  api.target('wall', '牆身材料槽', wallTarget, {
    radius: .66,
    physics: { shape: 'cuboid', halfExtents: [.75, .86, .24], padding: .02 },
  });

  // Keep the first tool completely outside the foreground graph silhouette.
  // It now reads as a distinct instrument rather than a selection outline
  // hidden behind the chart board.
  const thermometerHome = new THREE.Vector3(-4.1, .1, 3.0);
  const thermometer = addEntity(api, 'thermometer', '溫度計', makeThermometer(), thermometerHome.toArray(), {
    draggable: true,
    physics: { shape: 'cuboid', density: .55, friction: .58, restitution: .06 },
  });
  api.setPhysicsPose?.(
    'thermometer',
    thermometer.getWorldPosition(new THREE.Vector3()),
    thermometer.getWorldQuaternion(new THREE.Quaternion()),
    { dynamic: false, velocity: { x: 0, y: 0, z: 0 } },
  );
  const metalPanel = addEntity(
    api,
    'metal-panel',
    '金屬板',
    roundedBox(1.38, 1.58, .13, palette.metal, .06, 4, { metalness: .78, roughness: .18 }),
    METAL_RACK.toArray(),
    { draggable: true, physics: { shape: 'box', density: 2.6, friction: .42, restitution: .05 } },
  );
  const foamPanel = addEntity(
    api,
    'foam-panel',
    '泡棉板',
    roundedBox(1.38, 1.58, .14, 0xa9e5df, .1, 5, { roughness: .98 }),
    FOAM_RACK.toArray(),
    { draggable: true, physics: { shape: 'box', density: .25, friction: .86, restitution: .04 } },
  );
  for (let index = 0; index < 18; index += 1) {
    const pore = sphere(.035 + (index % 3) * .012, 0x73c8c2, { roughness: 1, castShadow: false });
    pore.position.set((index % 5 - 2) * .22, (Math.floor(index / 5) - 1.5) * .28, .078);
    foamPanel.add(pore);
  }
  api.root.updateWorldMatrix(true, true);
  for (const [id, panel] of [['metal-panel', metalPanel], ['foam-panel', foamPanel]]) {
    api.setPhysicsPose?.(
      id,
      panel.getWorldPosition(new THREE.Vector3()),
      panel.getWorldQuaternion(new THREE.Quaternion()),
      { dynamic: false, velocity: { x: 0, y: 0, z: 0 } },
    );
  }

  const timer = new THREE.Group();
  const timerBase = cylinder(.62, .17, palette.deep, { roughness: .58 });
  const timerFace = cylinder(.48, .11, 0xffe59b, { roughness: .4 });
  timerFace.position.y = .14;
  const timerNeedle = roundedBox(.07, .07, .38, palette.coral, .025, 2);
  timerNeedle.position.set(0, .225, -.14);
  timer.add(timerBase, timerFace, timerNeedle);
  addEntity(api, 'house-timer', '10 分鐘計時器', timer, [4.38, .08, 1.45], { adjustable: true });
  const runButton = addEntity(api, 'house-run', '開始保溫測試', makeButton(palette.coral), [4.38, .06, -.9], { tappable: true });
  api.root.add(label('開始保溫測試', [4.38, .92, -.9], .43));

  const displayHousing = roundedBox(2.25, 1.05, .18, 0x173f49, .14, 4, { roughness: .38 });
  displayHousing.position.set(3.72, 1.42, .38);
  api.root.add(displayHousing);
  const temperatureDisplay = dynamicDisplay('24.0 °C', { scale: [1.85, .66] });
  temperatureDisplay.position.set(3.72, 1.46, .49);
  api.root.add(temperatureDisplay);

  const graph = new THREE.Group();
  graph.position.set(-3.37, 1.55, 1.22);
  const graphBoard = roundedBox(2.75, 1.72, .12, 0xf7f5e9, .11, 4, { roughness: .78 });
  graph.add(graphBoard);
  const horizontalAxis = roundedBox(2.34, .025, .035, palette.ink, .008, 1, { castShadow: false });
  horizontalAxis.position.set(0, -.56, .09);
  const verticalAxis = roundedBox(.025, 1.18, .035, palette.ink, .008, 1, { castShadow: false });
  verticalAxis.position.set(-1.16, 0, .09);
  graph.add(horizontalAxis, verticalAxis);
  const thermalSystem = new ThermalSystem({
    bodies: [
      { id: 'metal', temperature: 24, ambientTemperature: 8, heatCapacity: 510, conductance: .702 },
      { id: 'foam', temperature: 24, ambientTemperature: 8, heatCapacity: 930, conductance: .322 },
    ],
  });
  const metalCurve = addCurve(graph, thermalSystem.coolingCurve('metal', { duration: 600, samples: 31 }), palette.coral, { z: .12 });
  const foamCurve = addCurve(graph, thermalSystem.coolingCurve('foam', { duration: 600, samples: 31 }), palette.teal, { z: .15 });
  metalCurve.line.visible = false;
  foamCurve.line.visible = false;
  const graphTitle = label('溫度—時間（10 分鐘）', [0, .7, .12], .32);
  graph.add(graphTitle);
  api.root.add(graph);

  const heatParticles = [];
  for (let index = 0; index < 24; index += 1) {
    const particle = sphere(.045, index % 2 ? palette.coral : palette.yellow, {
      emissive: index % 2 ? palette.coral : palette.yellow,
      emissiveIntensity: 1.35,
      roughness: .15,
      castShadow: false,
    });
    particle.position.set(
      SLOT.x + (index % 4 - 1.5) * .28,
      .62 + Math.floor(index / 4) * .25,
      WALL_Z + .32,
    );
    particle.visible = false;
    api.root.add(particle);
    heatParticles.push(particle);
  }

  let installedPanel = null;
  let thermometerInstalled = false;
  let timerMinutes = 0;
  let running = false;
  let runSeconds = 0;
  let reading = 24;
  const trialResults = { metal: null, foam: null };
  let comparisonReady = false;

  function refreshComparisonDisplay() {
    comparisonReady = Number.isFinite(trialResults.metal) && Number.isFinite(trialResults.foam);
    metalCurve.line.visible = installedPanel === 'metal' || Number.isFinite(trialResults.metal) || comparisonReady;
    foamCurve.line.visible = installedPanel === 'foam' || Number.isFinite(trialResults.foam) || comparisonReady;
    if (comparisonReady) {
      temperatureDisplay.userData.setText(
        `${trialResults.metal.toFixed(1)} ↔ ${trialResults.foam.toFixed(1)} °C`,
        '#ffd660',
      );
    }
  }

  function setThermalVisual(materialId, seconds = timerMinutes * 60) {
    const clamped = THREE.MathUtils.clamp(seconds, 0, 600);
    reading = thermalSystem.temperatureAt(materialId, clamped);
    temperatureDisplay.userData.setText(`${reading.toFixed(1)} °C`, materialId === 'metal' ? '#ff8268' : '#60e0bb');
    metalCurve.line.visible = materialId === 'metal' || Number.isFinite(trialResults.metal);
    foamCurve.line.visible = materialId === 'foam' || Number.isFinite(trialResults.foam);
    const escapeRatio = materialId === 'metal' ? .95 : .28;
    heatParticles.forEach((particle, index) => {
      particle.visible = index / heatParticles.length < escapeRatio;
    });
    const mercury = thermometer.userData.mercury;
    mercury.scale.y = THREE.MathUtils.clamp(.55 + (reading - 8) / 25, .38, 1.15);
  }

  function installPanel(kind) {
    const next = kind === 'metal' ? metalPanel : foamPanel;
    const previous = installedPanel === 'metal' ? metalPanel : installedPanel === 'foam' ? foamPanel : null;
    if (previous && previous !== next) {
      api.moveObject(previous, installedPanel === 'metal' ? METAL_RACK : FOAM_RACK, { duration: .42 });
    }
    api.moveObject(next, SLOT, { duration: .5 });
    next.rotation.set(0, 0, 0);
    installedPanel = kind;
    running = false;
    runSeconds = 0;
    setThermalVisual(kind, 0);
  }

  api.onPreview = (subject, value) => {
    if (subject !== 'house-timer') return;
    timerMinutes = THREE.MathUtils.clamp(value, 0, 10);
    timerNeedle.rotation.y = THREE.MathUtils.degToRad(-135 + timerMinutes / 10 * 270);
    if (installedPanel) setThermalVisual(installedPanel, timerMinutes * 60);
  };

  api.onAction = (action) => {
    if (action.subject === 'thermometer') {
      const mount = new THREE.Vector3(HOUSE_X - .34, .08, .38);
      api.moveObject(thermometer, mount, { duration: .5 });
      thermometerInstalled = true;
      api.sparkle(mount.clone().add(new THREE.Vector3(0, 1.05, .15)), palette.mint, 10);
    }
    if (action.subject === 'metal-panel') installPanel('metal');
    if (action.subject === 'foam-panel') installPanel('foam');
    if (action.subject === 'house-timer' && installedPanel) {
      timerMinutes = Number.isFinite(action.value) ? action.value : 10;
      setThermalVisual(installedPanel, timerMinutes * 60);
      // The first trial uses the exact same analytical temperature model as
      // the live run.  Store its 10-minute endpoint so it remains visible
      // while the pupil changes only the wall material for trial B.
      if (timerMinutes >= 9.9) {
        trialResults[installedPanel] = thermalSystem.temperatureAt(installedPanel, 600);
        refreshComparisonDisplay();
      }
    }
    if (action.subject === 'house-run') {
      api.pressButton(runButton);
      installedPanel ||= 'foam';
      running = true;
      runSeconds = 0;
      trialResults[installedPanel] = null;
      setThermalVisual(installedPanel, 0);
    }
  };

  return {
    update: (time, dt = 1 / 60) => {
      if (running && installedPanel) {
        runSeconds = Math.min(600, runSeconds + dt * 120);
        setThermalVisual(installedPanel, runSeconds);
        if (runSeconds >= 600) {
          running = false;
          trialResults[installedPanel] = thermalSystem.temperatureAt(installedPanel, 600);
          refreshComparisonDisplay();
        }
      }
      heatParticles.forEach((particle, index) => {
        if (!particle.visible) return;
        const fast = installedPanel === 'metal' ? 2.4 : .8;
        particle.position.z = WALL_Z + .32 - ((time * fast + index * .19) % .85);
        particle.material.emissiveIntensity = .8 + Math.sin(time * 4 + index) * .35;
      });
    },
    getState: () => ({
      experiment: 'eco-house',
      installedPanel,
      thermometerInstalled,
      timerMinutes,
      runSeconds,
      temperatureC: reading,
      comparisonReady,
      comparison: {
        controlledVariables: ['initialTemperature', 'ambientTemperature', 'duration', 'panelSize'],
        independentVariable: 'wallMaterial',
        metalTemperatureC: trialResults.metal,
        foamTemperatureC: trialResults.foam,
        differenceC: comparisonReady ? trialResults.foam - trialResults.metal : null,
      },
      thermal: thermalSystem.serialize(),
    }),
    dispose: () => {},
  };
}

function makeTorch() {
  const group = new THREE.Group();
  const grip = cylinder(.3, 1.55, palette.deep, { roughness: .5 });
  grip.rotation.z = Math.PI / 2;
  const rubber = cylinder(.315, .52, 0x145763, { roughness: .9 });
  rubber.rotation.z = Math.PI / 2;
  rubber.position.x = -.25;
  const reflector = cylinder(.53, .54, palette.yellow, {
    radiusTop: .3,
    radiusBottom: .53,
    metalness: .22,
    roughness: .28,
  });
  reflector.rotation.z = Math.PI / 2;
  reflector.position.x = .96;
  const lens = cylinder(.38, .035, 0xffffe5, {
    transparent: true,
    opacity: .75,
    emissive: 0xffefaa,
    emissiveIntensity: 1.5,
    roughness: .05,
    depthWrite: false,
  });
  lens.rotation.z = Math.PI / 2;
  lens.position.x = 1.24;
  const toggle = roundedBox(.34, .13, .23, palette.coral, .045, 2);
  toggle.position.set(-.18, .34, 0);
  const spout = new THREE.Object3D();
  spout.name = 'SOCKET_LIGHT_ORIGIN';
  spout.position.set(1.29, 0, 0);
  group.add(grip, rubber, reflector, lens, toggle, spout);
  group.userData.spout = spout;
  group.userData.lens = lens;
  return group;
}

function makeMirror() {
  const group = new THREE.Group();
  const frame = roundedBox(1.64, 1.44, .16, 0x466d76, .1, 4, { metalness: .35, roughness: .25 });
  const face = roundedBox(1.45, 1.25, .035, 0xdaf5f7, .065, 3, {
    metalness: .92,
    roughness: .035,
  });
  face.position.z = .1;
  const rearKnob = cylinder(.13, .32, palette.metal, { metalness: .72, roughness: .22 });
  rearKnob.rotation.x = Math.PI / 2;
  rearKnob.position.z = -.2;
  group.add(frame, face, rearKnob);
  group.userData.reflectiveFace = face;
  return group;
}

function makePrism() {
  const group = new THREE.Group();
  const prism = new THREE.Mesh(
    new THREE.CylinderGeometry(.7, .7, 1.35, 3),
    mat(0xb8eff4, {
      transparent: true,
      opacity: .42,
      roughness: .035,
      metalness: .04,
      transmission: .55,
      thickness: .45,
      ior: 1.52,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  prism.rotation.y = Math.PI / 6;
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(prism.geometry, 22),
    new THREE.LineBasicMaterial({ color: 0xe8ffff, transparent: true, opacity: .8 }),
  );
  edge.rotation.copy(prism.rotation);
  group.add(prism, edge);
  return group;
}

export function buildLight(api) {
  const MIRROR_POINT = new THREE.Vector3(-.25, 1.48, .15);
  const SCREEN_POINT = new THREE.Vector3(4.45, 1.48, -1.6);
  const SCREEN_NORMAL = new THREE.Vector3(-1, 0, 0);

  const torch = addEntity(api, 'torch', '光線箱', makeTorch(), [-4.42, 1.46, .72], { tappable: true, pickable: true });
  const torchCradle = new THREE.Group();
  const cradleBase = roundedBox(2.15, .14, 1.0, palette.deep, .12, 4, { roughness: .66 });
  cradleBase.position.set(-3.75, .07, .72);
  const cradleStem = cylinder(.09, 1.12, palette.metal, { metalness: .64, roughness: .25 });
  cradleStem.position.set(-3.75, .62, .72);
  const cradleRing = torus(.37, .065, palette.metal, { metalness: .65, roughness: .22 });
  cradleRing.rotation.y = Math.PI / 2;
  cradleRing.position.set(-3.75, 1.45, .72);
  torchCradle.add(cradleBase, cradleStem, cradleRing);
  api.root.add(torchCradle);
  addStatic(api, 'light-cradle-base', cradleBase);

  const stand = new THREE.Group();
  const standBase = cylinder(.72, .13, palette.deep, { roughness: .6 });
  const standPole = cylinder(.09, 1.56, palette.metal, { metalness: .68, roughness: .23 });
  standPole.position.y = .78;
  const yoke = roundedBox(.92, .12, .16, palette.metal, .045, 2, { metalness: .65, roughness: .22 });
  yoke.position.y = 1.45;
  stand.add(standBase, standPole, yoke);
  stand.position.set(MIRROR_POINT.x, 0, MIRROR_POINT.z);
  api.root.add(stand);
  addStatic(api, 'mirror-stand-base', standBase);
  addStatic(api, 'mirror-stand-pole', standPole);

  const mirrorPivot = new THREE.Group();
  mirrorPivot.position.copy(MIRROR_POINT);
  api.root.add(mirrorPivot);
  api.root.updateWorldMatrix(true, true);
  const mirrorWorldAtRest = api.root.localToWorld(MIRROR_POINT.clone());
  const screenWorld = api.root.localToWorld(SCREEN_POINT.clone());
  const torchOriginAtRest = torch.userData.spout.getWorldPosition(new THREE.Vector3());
  const incomingAtRest = mirrorWorldAtRest.clone().sub(torchOriginAtRest).normalize();
  const desiredOutgoing = screenWorld.clone().sub(mirrorWorldAtRest).normalize();
  const baseMirrorNormal = incomingAtRest.clone().sub(desiredOutgoing).normalize();
  const rootWorldQuaternion = api.root.getWorldQuaternion(new THREE.Quaternion());
  const baseMirrorNormalLocal = baseMirrorNormal.clone().applyQuaternion(rootWorldQuaternion.clone().invert());
  const baseMirrorQuaternion = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, baseMirrorNormalLocal);
  mirrorPivot.quaternion.copy(baseMirrorQuaternion);

  // Keep loose optical instruments on separate tray lanes. Their broad
  // compound proxies must not overlap at rest, otherwise Rapier resolves the
  // contact by visibly pushing both models away from the authored positions.
  const mirror = addEntity(api, 'mirror', '平面鏡', makeMirror(), [-2.92, .75, -1.62], {
    draggable: true,
    adjustable: true,
    physics: { shape: 'box', density: 1.6, friction: .42, restitution: .05 },
  });
  addTarget(api, 'mirror-stand', '鏡架夾位', MIRROR_POINT.toArray(), .64, palette.mint, {
    rotation: [Math.PI / 2, 0, 0],
    physics: { shape: 'cuboid', halfExtents: [.82, .74, .3], padding: .02 },
  });

  const normalBeam = createBeam(0xe8ffff, .012, .64);
  normalBeam.position.set(0, 0, 0);
  mirrorPivot.add(normalBeam);
  setWorldLine(normalBeam, new THREE.Vector3(0, 0, -.9), new THREE.Vector3(0, 0, .9), .012);
  normalBeam.position.set(0, 0, 0);
  normalBeam.visible = false;

  const beamIncoming = createBeam(0xfff4b0, .035, .9);
  const beamReflected = createBeam(0xfff4b0, .03, .86);
  api.root.add(beamIncoming, beamReflected);

  const prismPivot = new THREE.Group();
  const PRISM_POINT = MIRROR_POINT.clone().lerp(SCREEN_POINT, .57);
  prismPivot.position.copy(PRISM_POINT);
  api.root.add(prismPivot);
  // Park the prism on the rear equipment shelf, outside the torch-to-mirror
  // ray. It enters the reflected beam only in the later installation step.
  const prism = addEntity(api, 'prism', '三稜鏡', makePrism(), [-1.42, .72, -1.78], {
    draggable: true,
    adjustable: true,
    physics: { shape: 'box', density: 1.35, friction: .38, restitution: .04 },
  });
  addTarget(api, 'beam-zone', '光束中央', PRISM_POINT.toArray(), .62, palette.yellow, {
    physics: { shape: 'cuboid', halfExtents: [.65, .78, .65], padding: .02 },
  });

  const screen = new THREE.Group();
  const screenPlate = roundedBox(.16, 2.05, 2.5, 0xe7edf0, .11, 4, { roughness: .78 });
  screenPlate.position.y = 1.48;
  const screenInset = roundedBox(.09, 1.76, 2.17, 0xfafbf7, .07, 3, { roughness: .92 });
  screenInset.position.set(-.09, 1.48, 0);
  const screenFoot = roundedBox(.95, .12, 1.3, palette.deep, .08, 3);
  screenFoot.position.set(0, .06, 0);
  screen.add(screenPlate, screenInset, screenFoot);
  screen.position.set(SCREEN_POINT.x, 0, SCREEN_POINT.z);
  api.root.add(screen);
  addStatic(api, 'optical-screen', screenPlate, { friction: .7 });
  api.root.add(label('固定光屏／藍色感應器', [SCREEN_POINT.x - .08, 2.82, SCREEN_POINT.z], .38));
  const sensorHousing = roundedBox(.11, .48, .48, palette.blue, .1, 4, {
    roughness: .32, emissive: 0x174d70, emissiveIntensity: .15,
  });
  sensorHousing.position.set(-.15, 1.48, 0);
  const sensorLens = sphere(.12, 0x7be4ff, {
    emissive: 0x216b86, emissiveIntensity: .12, roughness: .12, castShadow: false,
  });
  sensorLens.position.set(-.23, 1.48, 0);
  screen.add(sensorHousing, sensorLens);

  const spectrumColors = [0xff3344, 0xff8a22, 0xffdc33, 0x43d17b, 0x32cfe0, 0x3e6dff, 0x9b55ff];
  const spectrumBeams = spectrumColors.map((color) => {
    const beam = createBeam(color, .018, .88);
    api.root.add(beam);
    return beam;
  });
  const impactDots = spectrumColors.map((color) => {
    const dot = sphere(.075, color, { emissive: color, emissiveIntensity: 2.2, roughness: .1, castShadow: false });
    dot.visible = false;
    dot.position.copy(SCREEN_POINT);
    api.root.add(dot);
    return dot;
  });

  const optics = new OpticalSystem({
    sensors: [{
      id: 'fixed-screen',
      point: screenWorld.toArray(),
      normal: SCREEN_NORMAL.clone().applyQuaternion(rootWorldQuaternion).toArray(),
      uAxis: [0, 0, 1],
      width: 2.1,
      height: 1.68,
    }],
  });

  let torchOn = false;
  let mirrorInstalled = false;
  let prismInstalled = false;
  let spectrumVisible = false;
  let mirrorAngle = 0;
  let prismAngle = 24;
  let lastSignature = '';
  let reflectionHitsScreen = false;
  let spectrumHitCount = 0;

  function setMirrorAngle(value) {
    mirrorAngle = value;
    const offset = THREE.MathUtils.degToRad(value - 35);
    const delta = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, offset);
    mirrorPivot.quaternion.copy(delta.multiply(baseMirrorQuaternion));
  }

  function setPrismAngle(value) {
    prismAngle = value;
    prismPivot.rotation.y = THREE.MathUtils.degToRad(value - 24);
  }

  function renderOptics(force = false) {
    const origin = torch.userData.spout.getWorldPosition(new THREE.Vector3());
    const mirrorPoint = mirrorPivot.getWorldPosition(new THREE.Vector3());
    const mirrorNormal = Z_AXIS.clone().applyQuaternion(mirrorPivot.getWorldQuaternion(new THREE.Quaternion())).normalize();
    const signature = [
      torchOn,
      mirrorInstalled,
      prismInstalled,
      spectrumVisible,
      ...origin.toArray(),
      ...mirrorPoint.toArray(),
      ...mirrorNormal.toArray(),
      prismAngle,
    ].map((value) => typeof value === 'number' ? value.toFixed(4) : value).join('|');
    if (!force && signature === lastSignature) return;
    lastSignature = signature;

    beamIncoming.visible = torchOn;
    if (!torchOn) {
      beamReflected.visible = false;
      reflectionHitsScreen = false;
      spectrumHitCount = 0;
      spectrumBeams.forEach((beam) => { beam.visible = false; });
      impactDots.forEach((dot) => { dot.visible = false; });
      return;
    }
    setBeamFromWorld(beamIncoming, api.root, origin, mirrorPoint, .035);
    if (!mirrorInstalled) return;

    optics.addMirror({ id: 'world-mirror', point: mirrorPoint.toArray(), normal: mirrorNormal.toArray(), maxDistance: 12 }, false);
    const reflected = optics.reflect({ origin, direction: mirrorPoint.clone().sub(origin), maxDistance: 12 }, 'world-mirror');
    if (!reflected) return;

    const screenHit = optics.hitSensor({
      origin: reflected.point.clone().addScaledVector(reflected.direction, .002),
      direction: reflected.direction,
      maxDistance: 12,
    }, 'fixed-screen');
    const reflectedEnd = screenHit?.point || reflected.point.clone().addScaledVector(reflected.direction, 8);
    reflectionHitsScreen = Boolean(screenHit);
    sensorHousing.material.emissive.setHex(reflectionHitsScreen ? palette.blue : 0x174d70);
    sensorHousing.material.emissiveIntensity = reflectionHitsScreen ? 1.5 : .15;
    sensorLens.material.emissive.setHex(reflectionHitsScreen ? 0x7be4ff : 0x216b86);
    sensorLens.material.emissiveIntensity = reflectionHitsScreen ? 3.2 : .12;
    beamReflected.visible = true;

    const prismWorld = prismPivot.getWorldPosition(new THREE.Vector3());
    const beforePrism = prismInstalled ? prismWorld : reflectedEnd;
    setBeamFromWorld(beamReflected, api.root, reflected.point, beforePrism, .03);
    spectrumBeams.forEach((beam) => { beam.visible = false; });
    impactDots.forEach((dot) => { dot.visible = false; });
    spectrumHitCount = 0;
    if (!prismInstalled || !spectrumVisible) return;

    const entryPoint = prismWorld.clone().addScaledVector(reflected.direction, -.33);
    const exitPoint = prismWorld.clone().addScaledVector(reflected.direction, .33);
    const exitNormal = reflected.direction.clone()
      .applyAxisAngle(Y_AXIS, THREE.MathUtils.degToRad(18 + (prismAngle - 24) * .35));
    optics.addPrism({
      id: 'cauchy-prism',
      entry: { point: entryPoint.toArray(), normal: reflected.direction.clone().negate().toArray() },
      exit: { point: exitPoint.toArray(), normal: exitNormal.toArray() },
      environmentIndex: 1.0003,
      cauchyA: 1.5046,
      cauchyB: .0042,
      maxDistance: 12,
    }, false);
    const dispersed = optics.disperse({
      origin: reflected.point.clone().addScaledVector(reflected.direction, .002),
      direction: reflected.direction,
      maxDistance: 12,
    }, 'cauchy-prism');
    dispersed.rays.forEach((ray, index) => {
      const beam = spectrumBeams[index];
      const dot = impactDots[index];
      if (!beam || !dot) return;
      const hit = optics.hitSensor({ origin: ray.exitPoint.clone().addScaledVector(ray.direction, .002), direction: ray.direction, maxDistance: 12 }, 'fixed-screen');
      const end = hit?.point || ray.exitPoint.clone().addScaledVector(ray.direction, 5.2);
      setBeamFromWorld(beam, api.root, ray.exitPoint, end, .018);
      beam.visible = true;
      dot.position.copy(api.root.worldToLocal(end.clone().addScaledVector(SCREEN_NORMAL, .11)));
      dot.visible = Boolean(hit);
      if (hit) spectrumHitCount += 1;
    });
  }

  setMirrorAngle(0);
  setPrismAngle(24);
  renderOptics(true);

  api.onPreview = (subject, value) => {
    if (subject === 'mirror') {
      setMirrorAngle(value);
      renderOptics(true);
    }
    if (subject === 'prism') {
      setPrismAngle(value);
      renderOptics(true);
    }
  };

  api.onAction = (action) => {
    if (action.subject === 'torch') {
      torchOn = true;
      torch.userData.lens.material.emissiveIntensity = 3.2;
      api.pressButton(torch);
      renderOptics(true);
    }
    if (action.subject === 'mirror' && action.type === 'place') {
      mirrorInstalled = true;
      api.moveObject(mirror, new THREE.Vector3(), { duration: .52, relativeTo: mirrorPivot });
      mirror.quaternion.identity();
      normalBeam.visible = true;
      renderOptics(true);
    }
    if (action.subject === 'mirror' && action.type === 'adjust') {
      setMirrorAngle(Number.isFinite(action.value) ? action.value : 35);
      api.sparkle(screenWorld.clone(), palette.blue, 10);
      renderOptics(true);
    }
    if (action.subject === 'prism' && action.type === 'place') {
      prismInstalled = true;
      api.moveObject(prism, new THREE.Vector3(), { duration: .52, relativeTo: prismPivot });
      prism.quaternion.identity();
      renderOptics(true);
    }
    if (action.subject === 'prism' && action.type === 'adjust') {
      spectrumVisible = true;
      setPrismAngle(Number.isFinite(action.value) ? action.value : 24);
      api.sparkle(screenWorld.clone().add(new THREE.Vector3(-.2, 0, 0)), palette.yellow, 18);
      renderOptics(true);
    }
  };

  return {
    update: (time) => {
      renderOptics();
      [beamIncoming, beamReflected, ...spectrumBeams].forEach((beam, index) => {
        if (beam.visible) beam.material.opacity = .72 + Math.sin(time * 6 + index) * .1;
      });
      impactDots.forEach((dot, index) => {
        if (dot.visible) dot.scale.setScalar(.9 + Math.sin(time * 4.5 + index) * .12);
      });
    },
    getState: () => ({
      experiment: 'light-lab',
      torchOn,
      mirrorInstalled,
      mirrorAngle,
      prismInstalled,
      prismAngle,
      spectrumVisible,
      reflectionHitsScreen,
      spectrumHitCount,
      fixedScreen: SCREEN_POINT.toArray(),
      optics: optics.serialize(),
    }),
    dispose: () => {},
  };
}

function makeTuningFork() {
  const group = new THREE.Group();
  const metalOptions = { metalness: .83, roughness: .17 };
  const handle = cylinder(.105, 1.18, palette.metal, metalOptions);
  handle.position.y = .59;
  const shoulder = torus(.31, .082, palette.metal, { ...metalOptions, arc: Math.PI });
  shoulder.rotation.z = Math.PI;
  shoulder.position.y = 1.21;
  const leftTine = roundedBox(.14, 1.42, .17, palette.metal, .055, 4, metalOptions);
  leftTine.position.set(-.28, 1.87, 0);
  const rightTine = leftTine.clone();
  rightTine.position.x = .28;
  const grip = roundedBox(.28, .28, .22, 0x526e75, .08, 3, { roughness: .62 });
  grip.position.y = .06;
  group.add(handle, shoulder, leftTine, rightTine, grip);
  group.userData.tines = [leftTine, rightTine];
  return group;
}

function makeMallet() {
  const group = new THREE.Group();
  const handle = cylinder(.075, 1.35, 0x945d38, { roughness: .82 });
  handle.rotation.z = Math.PI / 2;
  const ferrule = cylinder(.12, .22, palette.metal, { metalness: .64, roughness: .25 });
  ferrule.rotation.z = Math.PI / 2;
  ferrule.position.x = .66;
  const head = cylinder(.27, .5, 0xd95e55, { radiusTop: .25, radiusBottom: .25, roughness: .92 });
  head.rotation.z = Math.PI / 2;
  head.position.x = .86;
  group.add(handle, ferrule, head);
  group.userData.head = head;
  return group;
}

function makePaperRipples(api, centre) {
  const waves = [];
  for (let index = 0; index < 5; index += 1) {
    const ring = torus(.24, .018, 0xcaf8ff, {
      transparent: true,
      opacity: 0,
      emissive: 0x7eeaff,
      emissiveIntensity: 1.2,
      castShadow: false,
      receiveShadow: false,
    });
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(centre);
    ring.visible = false;
    api.root.add(ring);
    waves.push({ ring, phase: index * .14 });
  }
  return waves;
}

function makeHose(start, end) {
  const midpointA = start.clone().lerp(end, .34).add(new THREE.Vector3(0, -.32, .2));
  const midpointB = start.clone().lerp(end, .7).add(new THREE.Vector3(0, -.2, -.18));
  const curve = new THREE.CatmullRomCurve3([start, midpointA, midpointB, end]);
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 42, .075, 10, false),
    mat(0x31565e, { roughness: .82 }),
  );
}

export function buildSound(api) {
  const VIBRATION_DURATION_MS = 9000;
  const fork = addEntity(api, 'fork', '440 Hz 音叉', makeTuningFork(), [-2.35, .04, -1.45], {
    draggable: true,
    physics: { shape: 'box', density: 2.4, friction: .42, restitution: .12, allowRotation: true },
  });
  const mallet = addEntity(api, 'mallet', '軟頭木槌', makeMallet(), [-4.25, .42, -.28], {
    draggable: true,
    tappable: true,
    physics: { shape: 'box', density: 1.25, friction: .62, restitution: .18, allowRotation: true },
  });

  const strikeTarget = makeTargetRing(palette.yellow, .26);
  strikeTarget.rotation.z = -Math.PI / 2;
  strikeTarget.position.set(.28, 2.05, 0);
  fork.add(strikeTarget);
  api.target('fork-strike', '音叉叉臂敲擊區', strikeTarget, {
    radius: .3,
    physics: { shape: 'cuboid', halfExtents: [.24, .42, .25], padding: .015 },
  });

  const tray = new THREE.Group();
  const trayBowl = cylinder(1.02, .34, 0xc3e8eb, {
    radiusTop: 1.02,
    radiusBottom: .88,
    metalness: .18,
    roughness: .24,
  });
  trayBowl.position.y = .17;
  const water = cylinder(.9, .045, palette.blue, {
    transparent: true,
    opacity: .72,
    roughness: .08,
    depthWrite: false,
  });
  water.position.y = .37;
  const trayRim = torus(1.01, .045, 0xe7fbff, { metalness: .3, roughness: .18 });
  trayRim.rotation.x = Math.PI / 2;
  trayRim.position.y = .35;
  tray.add(trayBowl, water, trayRim);
  addEntity(api, 'water-tray', '水盤', tray, [-3.65, 0, 1.72], { targetOnly: true });
  addStatic(api, 'sound-water-tray', trayBowl, { friction: .42, restitution: .02 });
  addTarget(api, 'water-tray', '水面接觸區', [-3.65, .4, 1.72], .88, palette.blue, {
    physics: { shape: 'cuboid', halfExtents: [.9, .2, .9], padding: .02 },
  });
  const ripples = makePaperRipples(api, new THREE.Vector3(-3.2, .405, 1.48));

  const jar = new THREE.Group();
  jar.position.set(.95, 0, .1);
  const jarBase = cylinder(1.38, .2, palette.deep, { roughness: .54 });
  const gasket = torus(1.18, .07, 0x5c7b80, { roughness: .86 });
  gasket.rotation.x = Math.PI / 2;
  gasket.position.y = .15;
  const dome = sphere(1.22, 0xc8f1f3, {
    transparent: true,
    opacity: .2,
    roughness: .035,
    transmission: .55,
    thickness: .08,
    ior: 1.46,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  dome.scale.set(1, 1.35, 1);
  dome.position.y = 1.38;
  const neck = cylinder(.28, .28, 0xc8f1f3, {
    transparent: true,
    opacity: .28,
    roughness: .04,
    transmission: .45,
    depthWrite: false,
  });
  neck.position.y = 2.93;
  const stopper = cylinder(.32, .15, 0x45656c, { roughness: .88 });
  stopper.position.y = 3.08;
  jar.add(jarBase, gasket, dome, neck, stopper);
  for (let index = 0; index < 3; index += 1) {
    const clamp = roundedBox(.18, .34, .22, palette.metal, .05, 3, { metalness: .58, roughness: .26 });
    const angle = index / 3 * Math.PI * 2;
    clamp.position.set(Math.cos(angle) * 1.2, .23, Math.sin(angle) * 1.2);
    clamp.rotation.y = -angle;
    jar.add(clamp);
  }
  const jarPort = new THREE.Object3D();
  jarPort.position.set(1.23, .45, 0);
  jar.add(jarPort);
  api.root.add(jar);
  api.entity('bell-jar', '密封鐘罩', jar, { targetOnly: true });
  addStatic(api, 'bell-jar-base', jarBase, { friction: .68 });
  addTarget(api, 'bell-jar', '鐘罩內音叉座', [.95, .16, .1], 1.0, palette.mint, {
    physics: { shape: 'cuboid', halfExtents: [.92, 1.25, .92], padding: .02 },
  });

  const pump = new THREE.Group();
  const pumpBody = roundedBox(1.52, .92, 1.05, palette.blue, .2, 5, { roughness: .42 });
  pumpBody.position.y = .46;
  const pumpFoot = roundedBox(1.8, .12, 1.25, palette.deep, .08, 3, { roughness: .7 });
  pumpFoot.position.y = .06;
  const pumpCylinder = cylinder(.26, 1.26, 0xd3e3e4, { metalness: .55, roughness: .22 });
  pumpCylinder.position.set(0, 1.38, 0);
  const pumpHandle = new THREE.Group();
  const shaft = cylinder(.09, 1.25, palette.metal, { metalness: .65, roughness: .23 });
  shaft.position.y = .62;
  const grip = roundedBox(.95, .15, .19, palette.deep, .06, 3, { roughness: .82 });
  grip.position.y = 1.25;
  pumpHandle.add(shaft, grip);
  pumpHandle.position.set(0, 1.26, 0);
  const inlet = cylinder(.13, .32, palette.metal, { metalness: .65, roughness: .22 });
  inlet.rotation.z = Math.PI / 2;
  inlet.position.set(-.9, .48, 0);
  pump.add(pumpFoot, pumpBody, pumpCylinder, pumpHandle, inlet);
  addEntity(api, 'vacuum-pump', '真空泵', pump, [3.48, 0, -1.35], { adjustable: true });
  addStatic(api, 'vacuum-pump-body', pumpBody, { friction: .76 });

  api.root.updateWorldMatrix(true, true);
  const hoseStartWorld = jarPort.getWorldPosition(new THREE.Vector3());
  const hoseEndWorld = inlet.getWorldPosition(new THREE.Vector3());
  const hoseStart = api.root.worldToLocal(hoseStartWorld.clone());
  const hoseEnd = api.root.worldToLocal(hoseEndWorld.clone());
  const hose = makeHose(hoseStart, hoseEnd);
  api.root.add(hose);
  const hoseBands = [hoseStart, hoseEnd].map((point) => {
    const band = torus(.14, .035, palette.metal, { metalness: .58, roughness: .25 });
    band.position.copy(point);
    band.rotation.y = Math.PI / 2;
    api.root.add(band);
    return band;
  });

  const gauge = new THREE.Group();
  const gaugeCase = cylinder(.61, .16, 0xf4f3eb, { roughness: .45 });
  gaugeCase.rotation.x = Math.PI / 2;
  const gaugeRim = torus(.61, .055, palette.metal, { metalness: .65, roughness: .2 });
  const gaugeNeedle = roundedBox(.055, .42, .035, palette.coral, .018, 2, { castShadow: false });
  gaugeNeedle.position.y = .19;
  gaugeNeedle.rotation.z = -1.12;
  gauge.add(gaugeCase, gaugeRim, gaugeNeedle);
  gauge.position.set(4.38, 1.4, .82);
  api.root.add(gauge);
  const soundDisplay = dynamicDisplay('100 kPa · 58 dB', { scale: [2.25, .68] });
  soundDisplay.position.set(3.58, 2.35, -.15);
  api.root.add(soundDisplay);

  // A sealed mechanical feed-through lets the student excite the fork after
  // the bell jar has been closed.  The mallet must never pass through glass.
  const sealedStriker = addEntity(api, 'sealed-striker', '密封敲擊掣', makeButton(palette.coral), [-.48, .06, 1.56], {
    tappable: true,
  });
  api.root.add(label('密封敲擊掣', [-.48, .93, 1.56], .36));
  const strikerCable = makeWire(
    new THREE.Vector3(-.48, .28, 1.56),
    new THREE.Vector3(.95, 3.08, .1),
    palette.coral,
    .034,
  );
  api.root.add(strikerCable);
  const internalStriker = new THREE.Group();
  internalStriker.position.set(.64, 2.25, .1);
  internalStriker.rotation.z = .42;
  const strikerArm = roundedBox(.62, .065, .085, palette.metal, .025, 2, { metalness: .62, roughness: .24 });
  strikerArm.position.x = .31;
  const strikerHead = sphere(.115, palette.coral, { roughness: .84 });
  strikerHead.position.x = .64;
  internalStriker.add(strikerArm, strikerHead);
  api.root.add(internalStriker);

  let pressureKPa = 100;
  let forkLocation = 'bench';
  let vibrationUntil = 0;
  let rippleClock = Infinity;
  let jarSealed = false;
  let strikeCount = 0;
  let manualStrikeCount = 0;
  let sealedStrikeCount = 0;
  let toneEmissionCount = 0;
  let waterWaveCount = 0;
  let lastWaterContactWasVibrating = false;
  let lastJarPlacementWasVibrating = false;
  let lastExcitationSource = null;
  let strikerKickUntil = 0;
  let malletResetAt = Infinity;
  let openAirDb = null;
  let lowPressureDb = null;
  let comparisonReady = false;

  function soundLevelDb(pressure) {
    const airFraction = THREE.MathUtils.clamp((pressure - 10) / 90, 0, 1);
    return Math.round(18 + 40 * Math.pow(airFraction, .88));
  }

  function updatePressure(value) {
    pressureKPa = THREE.MathUtils.clamp(value, 5, 100);
    const travel = (100 - pressureKPa) / 95;
    pumpHandle.position.y = 1.26 - travel * .78;
    gaugeNeedle.rotation.z = THREE.MathUtils.lerp(-1.12, 1.12, travel);
    const db = soundLevelDb(pressureKPa);
    soundDisplay.userData.setText(`${Math.round(pressureKPa)} kPa · ${db} dB`, pressureKPa < 25 ? '#60e0bb' : '#ffd660');
  }

  function isForkVibrating(now = performance.now()) {
    return now < vibrationUntil;
  }

  function startWaterWaves() {
    rippleClock = 0;
    waterWaveCount += 1;
    api.splash(new THREE.Vector3(-3.65, .43, 1.72), palette.blue);
  }

  function exciteFork({ source = 'mallet', waterWave = forkLocation === 'water' } = {}) {
    strikeCount += 1;
    if (source === 'sealed-striker') sealedStrikeCount += 1;
    else manualStrikeCount += 1;
    lastExcitationSource = source;
    vibrationUntil = performance.now() + VIBRATION_DURATION_MS;
    const measuredDb = soundLevelDb(pressureKPa);
    if (source === 'sealed-striker') lowPressureDb = measuredDb;
    else if (pressureKPa >= 90) openAirDb = measuredDb;
    comparisonReady = Number.isFinite(openAirDb) && Number.isFinite(lowPressureDb);
    if (waterWave) startWaterWaves();
    const airFraction = THREE.MathUtils.clamp((pressureKPa - 10) / 90, 0, 1);
    const gain = .018 + .112 * Math.pow(airFraction, .88);
    toneEmissionCount += 1;
    api.playSound('tuningFork', { frequency: 440, duration: 4.8, level: gain });
    const tinePoint = fork.userData.tines[1].getWorldPosition(new THREE.Vector3());
    api.sparkle(tinePoint, palette.yellow, 9);
    if (comparisonReady) {
      // Keep the two readings together after trial B rather than immediately
      // replacing the baseline.  Both values come from soundLevelDb() under
      // the measured pressure, while the same fork remains at 440 Hz.
      soundDisplay.userData.setText(`${openAirDb} dB ↔ ${lowPressureDb} dB`, '#ffd660');
    }
  }

  function parkFork(localPosition, localEuler = new THREE.Euler()) {
    api.root.updateWorldMatrix(true, false);
    const position = api.root.localToWorld(localPosition.clone());
    const quaternion = api.root.getWorldQuaternion(new THREE.Quaternion())
      .multiply(new THREE.Quaternion().setFromEuler(localEuler));
    api.setPhysicsPose?.('fork', position, quaternion, { dynamic: false });
  }

  function returnMalletToTray() {
    api.root.updateWorldMatrix(true, false);
    const position = api.root.localToWorld(new THREE.Vector3(-4.25, .42, -.28));
    const quaternion = api.root.getWorldQuaternion(new THREE.Quaternion());
    api.setPhysicsPose?.('mallet', position, quaternion, { dynamic: false, velocity: { x: 0, y: 0, z: 0 } });
    malletResetAt = Infinity;
  }

  updatePressure(100);

  api.onPreview = (subject, value) => {
    if (subject === 'vacuum-pump') updatePressure(value);
  };

  api.onAction = (action) => {
    if (action.subject === 'mallet') {
      exciteFork();
      // Preserve the visible collision, then place the reusable tool back on
      // its tray so the later water-contact strike remains reachable.
      malletResetAt = performance.now() + 420;
      if (action.type === 'tap') api.pressButton(mallet);
    }
    if (action.subject === 'fork' && action.target === 'water-tray') {
      lastWaterContactWasVibrating = isForkVibrating();
      forkLocation = 'water';
      parkFork(new THREE.Vector3(-3.65, 2.52, 1.72), new THREE.Euler(0, 0, Math.PI));
      if (lastWaterContactWasVibrating) startWaterWaves();
    }
    if (action.subject === 'fork' && action.target === 'bell-jar') {
      lastJarPlacementWasVibrating = isForkVibrating();
      forkLocation = 'jar';
      parkFork(new THREE.Vector3(.95, .2, .1));
      jarSealed = true;
      gasket.material.emissive = new THREE.Color(palette.mint);
      gasket.material.emissiveIntensity = .55;
      api.sparkle(new THREE.Vector3(.95, .35, .1), palette.mint, 10);
    }
    if (action.subject === 'sealed-striker') {
      strikerKickUntil = performance.now() + 360;
      exciteFork({ source: 'sealed-striker', waterWave: false });
      api.pressButton(sealedStriker);
    }
    if (action.subject === 'vacuum-pump') {
      updatePressure(Number.isFinite(action.value) ? action.value : pressureKPa);
      api.pulseObject(pump, palette.blue);
    }
  };

  return {
    update: (time, dt = 1 / 60) => {
      const now = performance.now();
      if (now >= malletResetAt) returnMalletToTray();
      const active = isForkVibrating(now);
      fork.userData.tines.forEach((tine, index) => {
        tine.position.x = (index ? .28 : -.28) + (active ? Math.sin(time * 175 + index * Math.PI) * .026 : 0);
      });
      const kickRemaining = strikerKickUntil - now;
      const kickProgress = THREE.MathUtils.clamp(1 - kickRemaining / 360, 0, 1);
      internalStriker.rotation.z = kickRemaining > 0
        ? .42 - Math.sin(Math.PI * kickProgress) * .42
        : .42;
      rippleClock += dt;
      const rippleAge = rippleClock;
      ripples.forEach(({ ring, phase }, index) => {
        const age = rippleAge - phase;
        ring.visible = age >= 0 && age <= 1.55;
        if (!ring.visible) return;
        const progress = age / 1.55;
        ring.scale.setScalar(.45 + progress * (2.7 + index * .08));
        ring.material.opacity = Math.sin(Math.PI * progress) * .66;
      });
      const targetPosition = strikeTarget.getWorldPosition(new THREE.Vector3());
      const targetQuaternion = strikeTarget.getWorldQuaternion(new THREE.Quaternion());
      api.updateTargetPose?.('fork-strike', targetPosition, targetQuaternion);
      gasket.material.emissiveIntensity = jarSealed ? .42 + Math.sin(time * 3) * .1 : 0;
    },
    getState: () => ({
      experiment: 'sound-vacuum',
      pressureKPa,
      soundDb: soundLevelDb(pressureKPa),
      frequencyHz: 440,
      forkLocation,
      jarSealed,
      hoseConnected: Boolean(hose && hoseBands.length === 2),
      strikeCount,
      manualStrikeCount,
      sealedStrikeCount,
      toneEmissionCount,
      vibrating: isForkVibrating(),
      vibrationRemainingMs: Math.max(0, vibrationUntil - performance.now()),
      vibrationDurationMs: VIBRATION_DURATION_MS,
      waterWaveActive: Number.isFinite(rippleClock) && rippleClock <= 2.2,
      waterWaveCount,
      lastWaterContactWasVibrating,
      lastJarPlacementWasVibrating,
      lastExcitationSource,
      comparisonReady,
      comparison: {
        controlledVariables: ['tuningFork', 'frequencyHz', 'sealedJar'],
        independentVariable: 'airPressureKPa',
        openAir: Number.isFinite(openAirDb) ? { pressureKPa: 100, soundDb: openAirDb } : null,
        lowPressure: Number.isFinite(lowPressureDb) ? { pressureKPa, soundDb: lowPressureDb } : null,
        differenceDb: comparisonReady ? openAirDb - lowPressureDb : null,
      },
    }),
    dispose: () => {},
  };
}

function makeCircuitPort(api, parent, id, text, localPosition, color, registry) {
  const socket = new THREE.Group();
  socket.position.copy(localPosition);
  const collar = cylinder(.18, .13, palette.deep, { roughness: .62 });
  collar.rotation.x = Math.PI / 2;
  const terminal = sphere(.115, color, { emissive: color, emissiveIntensity: .52, metalness: .28, roughness: .22 });
  terminal.position.z = .1;
  const halo = makeTargetRing(color, .2);
  halo.rotation.x = Math.PI / 2;
  halo.position.z = .13;
  socket.add(collar, terminal, halo);
  parent.add(socket);
  api.entity(id, text, socket, { connectable: true });
  api.target(id, text, halo, { radius: .24, physics: { shape: 'ball', padding: .015 } });
  registry.set(id, { socket, halo, terminal });
  return socket;
}

function makeSolenoid() {
  const group = new THREE.Group();
  const former = cylinder(.48, 1.2, 0x654230, {
    transparent: true,
    opacity: .35,
    roughness: .45,
    depthWrite: false,
  });
  for (let index = 0; index < 16; index += 1) {
    const winding = torus(.49, .038, 0xe5753f, { metalness: .38, roughness: .27 });
    winding.rotation.x = Math.PI / 2;
    winding.position.y = -.55 + index * (1.1 / 15);
    group.add(winding);
  }
  group.add(former);
  return group;
}

function makeBattery() {
  const group = new THREE.Group();
  const caseBody = roundedBox(1.58, .9, .9, 0x304650, .17, 5, { roughness: .5 });
  caseBody.position.y = .45;
  const positiveShell = roundedBox(.72, .84, .92, palette.coral, .15, 5, { roughness: .52 });
  positiveShell.position.set(.41, .48, 0);
  const top = roundedBox(1.42, .1, .8, 0x263b43, .05, 2, { roughness: .64 });
  top.position.y = .92;
  group.add(caseBody, positiveShell, top);
  group.userData.caseBody = caseBody;
  return group;
}

function makeKnifeSwitch() {
  const group = new THREE.Group();
  const base = roundedBox(1.55, .2, .8, 0xe7ddc7, .11, 4, { roughness: .78 });
  base.position.y = .1;
  const leftPost = cylinder(.1, .33, palette.metal, { metalness: .75, roughness: .2 });
  leftPost.position.set(-.48, .3, 0);
  const rightPost = leftPost.clone();
  rightPost.position.x = .48;
  const leverPivot = new THREE.Group();
  leverPivot.position.set(-.48, .49, 0);
  const lever = roundedBox(1.0, .1, .16, 0xd09b43, .035, 2, { metalness: .55, roughness: .24 });
  lever.position.x = .5;
  leverPivot.rotation.z = .38;
  leverPivot.add(lever);
  group.add(base, leftPost, rightPost, leverPivot);
  group.userData.leverPivot = leverPivot;
  group.userData.base = base;
  return group;
}

function makeCircuitBulb() {
  const group = new THREE.Group();
  const pedestal = roundedBox(1.5, .18, .86, 0xe7ddc7, .11, 4, { roughness: .78 });
  pedestal.position.y = .09;
  const base = cylinder(.31, .5, palette.metal, { metalness: .68, roughness: .24 });
  base.position.y = .42;
  const glass = sphere(.57, 0xffffdf, {
    transparent: true,
    opacity: .58,
    roughness: .055,
    emissive: palette.yellow,
    emissiveIntensity: .04,
    depthWrite: false,
  });
  glass.position.y = 1.15;
  const filament = new THREE.Mesh(
    new THREE.TorusKnotGeometry(.12, .025, 42, 7, 2, 3),
    mat(0xffa93d, { emissive: 0xffa93d, emissiveIntensity: .08, roughness: .2 }),
  );
  filament.scale.set(.58, .82, .58);
  filament.position.y = 1.15;
  group.add(pedestal, base, glass, filament);
  group.userData.glass = glass;
  group.userData.filament = filament;
  group.userData.pedestal = pedestal;
  return group;
}

function makeCraneFrame() {
  const group = new THREE.Group();
  const base = roundedBox(3.7, .2, 2.0, 0x395f69, .12, 4, { roughness: .68 });
  base.position.set(0, .1, 0);
  const leftFoot = roundedBox(.52, .16, 2.35, 0x244851, .09, 3, { roughness: .72 });
  leftFoot.position.set(-1.6, .18, 0);
  const rightFoot = leftFoot.clone();
  rightFoot.position.x = 1.6;
  const leftPost = roundedBox(.27, 3.0, .3, palette.metal, .07, 3, { metalness: .5, roughness: .3 });
  leftPost.position.set(-1.52, 1.58, -.38);
  const rightPost = leftPost.clone();
  rightPost.position.x = 1.52;
  const gantry = roundedBox(3.42, .3, .38, palette.metal, .075, 3, { metalness: .52, roughness: .28 });
  gantry.position.set(0, 3.0, -.38);
  const trolley = roundedBox(.72, .38, .66, palette.blue, .1, 4, { roughness: .42 });
  trolley.position.set(0, 2.75, -.38);
  const cable = cylinder(.045, .42, 0x273f46, { roughness: .82 });
  cable.position.set(0, 2.46, -.38);
  const hanger = torus(.17, .045, palette.metal, { arc: Math.PI, metalness: .68, roughness: .24 });
  hanger.rotation.z = Math.PI;
  hanger.position.set(0, 2.66, -.38);
  group.add(base, leftFoot, rightFoot, leftPost, rightPost, gantry, trolley, cable, hanger);
  group.userData.colliders = { base, leftFoot, rightFoot, leftPost, rightPost, gantry };
  return group;
}

function makePaperClip() {
  const group = new THREE.Group();
  const outer = torus(.2, .027, palette.metal, {
    arc: Math.PI * 1.67,
    metalness: .82,
    roughness: .18,
    radialSegments: 8,
    tubularSegments: 28,
  });
  outer.scale.y = 1.55;
  outer.rotation.z = -.35;
  const inner = torus(.11, .022, palette.metal, {
    arc: Math.PI * 1.58,
    metalness: .82,
    roughness: .18,
    radialSegments: 8,
    tubularSegments: 24,
  });
  inner.scale.y = 1.45;
  inner.rotation.z = -.35;
  inner.position.set(.04, -.03, .012);
  group.add(outer, inner);
  return group;
}

export function buildElectric(api) {
  const portRegistry = new Map();
  const liveWires = new Map();
  const clipIds = [];
  const connectionColors = {
    'battery-positive:switch-in': palette.coral,
    'switch-out:coil-in': 0xf39a48,
    'coil-out:bulb-in': palette.blue,
    'bulb-out:battery-negative': 0x427fd1,
  };

  const battery = makeBattery();
  battery.position.set(-4.18, 0, 1.42);
  api.root.add(battery);
  addStatic(api, 'circuit-battery', battery.userData.caseBody, { friction: .75 });
  makeCircuitPort(api, battery, 'battery-positive', '電池正極', new THREE.Vector3(.43, 1.02, .05), palette.coral, portRegistry);
  makeCircuitPort(api, battery, 'battery-negative', '電池負極', new THREE.Vector3(-.43, 1.02, .05), palette.blue, portRegistry);

  const switchUnit = makeKnifeSwitch();
  switchUnit.position.set(-1.55, 0, 1.48);
  api.root.add(switchUnit);
  api.entity('switch', '閘刀開關', switchUnit, { tappable: true });
  addStatic(api, 'circuit-switch-base', switchUnit.userData.base, { friction: .72 });
  makeCircuitPort(api, switchUnit, 'switch-in', '開關輸入端', new THREE.Vector3(-.61, .3, .31), palette.coral, portRegistry);
  makeCircuitPort(api, switchUnit, 'switch-out', '開關輸出端', new THREE.Vector3(.61, .3, .31), palette.blue, portRegistry);

  const bulb = makeCircuitBulb();
  bulb.position.set(1.25, 0, 1.58);
  api.root.add(bulb);
  addStatic(api, 'circuit-bulb-base', bulb.userData.pedestal, { friction: .72 });
  makeCircuitPort(api, bulb, 'bulb-in', '燈泡輸入端', new THREE.Vector3(-.58, .29, .32), palette.coral, portRegistry);
  makeCircuitPort(api, bulb, 'bulb-out', '燈泡輸出端', new THREE.Vector3(.58, .29, .32), palette.blue, portRegistry);

  const crane = makeCraneFrame();
  crane.position.set(1.72, 0, -1.08);
  api.root.add(crane);
  for (const [name, object] of Object.entries(crane.userData.colliders)) {
    addStatic(api, `crane-${name}`, object, { friction: .78, restitution: .03 });
  }

  const CORE_WORLD = new THREE.Vector3(1.72, 1.95, -1.46);
  const core = cylinder(.225, 1.5, palette.metal, { metalness: .82, roughness: .2 });
  core.position.copy(CORE_WORLD);
  api.root.add(core);
  api.entity('iron-core', '軟鐵芯', core, { targetOnly: true });
  const coreSocket = addTarget(api, 'iron-core', '鐵芯線圈座', CORE_WORLD.toArray(), .55, palette.yellow, {
    physics: { shape: 'cuboid', halfExtents: [.58, .72, .58], padding: .015 },
  });

  const coil = makeSolenoid();
  const fieldRings = [];
  for (let index = 0; index < 5; index += 1) {
    const field = torus(.68 + index * .14, .014, palette.blue, {
      transparent: true,
      opacity: 0,
      emissive: palette.blue,
      emissiveIntensity: 1.7,
      castShadow: false,
      receiveShadow: false,
    });
    field.rotation.x = Math.PI / 2;
    field.position.y = (index - 2) * .21;
    field.visible = false;
    coil.add(field);
    fieldRings.push(field);
  }
  addEntity(api, 'coil', '漆包線圈', coil, [-3.05, .72, -1.26], {
    draggable: true,
    physics: { shape: 'cylinder', density: 1.2, friction: .48, restitution: .06 },
  });
  makeCircuitPort(api, coil, 'coil-in', '線圈輸入端', new THREE.Vector3(.58, .43, .02), palette.coral, portRegistry);
  makeCircuitPort(api, coil, 'coil-out', '線圈輸出端', new THREE.Vector3(.58, -.43, .02), palette.blue, portRegistry);

  const clipsRoot = new THREE.Group();
  clipsRoot.position.set(1.72, 0, -1.03);
  api.root.add(clipsRoot);
  api.entity('clips', '六個萬字夾', clipsRoot, { targetOnly: true });
  const clipTarget = makeTargetRing(palette.mint, .86);
  clipTarget.position.set(1.72, .03, -1.03);
  api.root.add(clipTarget);
  api.target('clips', '萬字夾堆', clipTarget, {
    radius: .9,
    physics: { shape: 'cuboid', halfExtents: [.92, .28, .75], padding: .02 },
  });
  const clipLayout = [
    [-.75, .25, -.46, .12],
    [0, .24, -.5, -.18],
    [.75, .25, -.46, .22],
    [-.75, .25, .46, -.28],
    [0, .24, .5, .32],
    [.75, .25, .46, -.08],
  ];
  clipLayout.forEach(([x, y, z, rotation], index) => {
    const clip = makePaperClip();
    clip.position.set(x, y, z);
    clip.rotation.set(Math.PI / 2, rotation, .15 * (index % 2 ? 1 : -1));
    clipsRoot.add(clip);
    const id = `clip-${index + 1}`;
    api.entity(id, `萬字夾 ${index + 1}`, clip, {
      dynamic: true,
      pickable: false,
      physics: {
        shape: 'box',
        density: 2.35,
        friction: .54,
        restitution: .18,
        linearDamping: 1.1,
        angularDamping: 1.4,
        allowRotation: true,
      },
    });
    clipIds.push(id);
  });

  const liftButton = addEntity(api, 'crane-lift', '啟動電磁起重', makeButton(palette.blue), [4.42, .06, -1.82], { tappable: true });
  api.root.add(label('電磁起重', [4.42, .93, -1.82], .43));
  const circuitDisplay = dynamicDisplay('OPEN · 24 °C', { scale: [2.3, .68] });
  circuitDisplay.position.set(3.55, 2.45, .83);
  api.root.add(circuitDisplay);

  const circuit = new CircuitSystem({
    ports: [
      'battery-positive', 'battery-negative', 'switch-in', 'switch-out',
      'coil-in', 'coil-out', 'bulb-in', 'bulb-out',
    ],
    switches: [{ id: 'main-switch', closed: false }],
    edges: [
      { id: 'switch-internal', from: 'switch-in', to: 'switch-out', resistance: .08, switchId: 'main-switch' },
      { id: 'bulb-internal', from: 'bulb-in', to: 'bulb-out', resistance: 12 },
    ],
    sources: [{ id: 'battery', positive: 'battery-positive', negative: 'battery-negative', voltage: 6, internalResistance: .45 }],
    loads: [{ id: 'electromagnet', a: 'coil-in', b: 'coil-out', resistance: 4.2, minimumCurrent: .05 }],
  });

  let coilInstalled = false;
  let coreColliderAdded = false;
  let switchClosed = false;
  let powered = false;
  let liftCommanded = false;
  let currentAmps = 0;
  let coilTemperature = 24;
  const attachedClips = new Set();
  const magneticForceNewtons = new Map();
  const clipAnchorOffsets = [
    new THREE.Vector3(-.46, -1.08, -.28),
    new THREE.Vector3(0, -1.08, -.28),
    new THREE.Vector3(.46, -1.08, -.28),
    new THREE.Vector3(-.46, -1.08, .28),
    new THREE.Vector3(0, -1.08, .28),
    new THREE.Vector3(.46, -1.08, .28),
  ];

  function ensureLiveWire(from, to) {
    const key = `${from}:${to}`;
    if (liveWires.has(key)) return;
    api.root.updateWorldMatrix(true, false);
    const start = api.root.worldToLocal(worldPosition(portRegistry.get(from).socket));
    const end = api.root.worldToLocal(worldPosition(portRegistry.get(to).socket));
    const wire = makeWire(start, end, connectionColors[key] || palette.coral, .045);
    wire.userData.lastStart = start.clone();
    wire.userData.lastEnd = end.clone();
    wire.userData.from = from;
    wire.userData.to = to;
    api.root.add(wire);
    liveWires.set(key, wire);
  }

  function connectCircuit(from, to) {
    const edgeId = `student:${from}:${to}`;
    if (!circuit.edges.has(edgeId)) circuit.connect(from, to, { id: edgeId, resistance: .12 });
    ensureLiveWire(from, to);
  }

  function refreshCircuit(dt = 0) {
    const result = dt > 0 ? circuit.step(dt).electromagnet : circuit.calculate('electromagnet');
    powered = Boolean(result?.powered && switchClosed && coilInstalled);
    currentAmps = powered ? result.current : 0;
    coilTemperature = 24 + Math.min(7, (result?.heatJoules || 0) * .72);
    bulb.userData.glass.material.emissiveIntensity = powered ? 2.8 : .04;
    bulb.userData.filament.material.emissiveIntensity = powered ? 3.4 : .08;
    const status = powered ? `${currentAmps.toFixed(2)} A · ${coilTemperature.toFixed(1)} °C` : 'OPEN · 24 °C';
    circuitDisplay.userData.setText(status, powered ? '#ffd660' : '#60e0bb');
    fieldRings.forEach((field) => { field.visible = powered; });
    if (!powered) liftCommanded = false;
    return result;
  }

  function updatePortSensors() {
    for (const [id, port] of portRegistry) {
      const position = port.halo.getWorldPosition(new THREE.Vector3());
      const quaternion = port.halo.getWorldQuaternion(new THREE.Quaternion());
      api.updateTargetPose?.(id, position, quaternion);
    }
  }

  function updateLiveWires() {
    for (const wire of liveWires.values()) {
      api.root.updateWorldMatrix(true, false);
      const start = api.root.worldToLocal(worldPosition(portRegistry.get(wire.userData.from).socket));
      const end = api.root.worldToLocal(worldPosition(portRegistry.get(wire.userData.to).socket));
      if (start.distanceToSquared(wire.userData.lastStart) < EPSILON && end.distanceToSquared(wire.userData.lastEnd) < EPSILON) continue;
      replaceWireGeometry(wire, start, end, .045);
      wire.userData.lastStart.copy(start);
      wire.userData.lastEnd.copy(end);
    }
  }

  refreshCircuit();

  api.onAction = (action) => {
    if (action.subject === 'coil' && action.target === 'iron-core') {
      coilInstalled = true;
      coil.rotation.set(0, 0, 0);
      api.moveObject(coil, CORE_WORLD.clone(), { duration: .55 });
      if (!coreColliderAdded) {
        addStatic(api, 'electromagnet-core', core, { friction: .52, restitution: .04 });
        coreColliderAdded = true;
      }
      api.sparkle(CORE_WORLD.clone(), palette.yellow, 10);
      refreshCircuit();
    }
    if (action.type === 'connect' && action.subject && action.target) {
      connectCircuit(action.subject, action.target);
      refreshCircuit();
    }
    if (action.subject === 'switch') {
      switchClosed = !switchClosed;
      circuit.setSwitch('main-switch', switchClosed);
      switchUnit.userData.leverPivot.rotation.z = switchClosed ? 0 : .38;
      api.pressButton(switchUnit);
      refreshCircuit();
      if (!switchClosed) {
        liftCommanded = false;
        clipIds.forEach((id, index) => api.makePhysicsDynamic?.(id, {
          x: (index % 3 - 1) * .055,
          y: 0,
          z: (index < 3 ? -.035 : .035),
        }));
        attachedClips.clear();
        magneticForceNewtons.clear();
      }
    }
    if (action.subject === 'crane-lift') {
      refreshCircuit();
      api.pressButton(liftButton);
      if (powered) {
        liftCommanded = true;
        clipIds.forEach((id) => api.makePhysicsDynamic?.(id));
        api.sparkle(new THREE.Vector3(CORE_WORLD.x, .78, CORE_WORLD.z), palette.blue, 18);
      }
    }
  };

  return {
    update: (time, dt = 1 / 60) => {
      updatePortSensors();
      updateLiveWires();
      refreshCircuit(dt);
      fieldRings.forEach((field, index) => {
        if (!field.visible) return;
        const pulse = 1 + Math.sin(time * 5.2 - index * .55) * .055;
        field.scale.setScalar(pulse);
        field.material.opacity = .34 + Math.sin(time * 4.3 - index * .4) * .14;
      });
      if (powered) bulb.userData.glass.scale.setScalar(1 + Math.sin(time * 7) * .015);
      else bulb.userData.glass.scale.setScalar(1);

      if (powered && liftCommanded) {
        const coreWorld = core.getWorldPosition(new THREE.Vector3());
        const currentScale = THREE.MathUtils.clamp(currentAmps / .32, 0, 1.4);
        attachedClips.clear();
        clipIds.forEach((id, index) => {
          const pose = api.getPhysicsPose?.(id);
          const mass = api.getPhysicsMass?.(id);
          if (!pose || !Number.isFinite(mass)) return;
          const position = new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z);
          const velocity = new THREE.Vector3(pose.velocity.x, pose.velocity.y, pose.velocity.z);
          const anchor = coreWorld.clone().add(clipAnchorOffsets[index]);
          const delta = anchor.sub(position);
          const distance = Math.max(.001, delta.length());
          let acceleration;
          if (distance < .34) {
            // A compliant magnetic attachment: the field balances gravity and
            // damps oscillation while the rigid body remains fully dynamic.
            acceleration = delta.multiplyScalar(72)
              .addScaledVector(velocity, -11)
              .add(new THREE.Vector3(0, 9.81, 0));
            if (distance < .2 && velocity.length() < 1.1) attachedClips.add(id);
          } else {
            // The pull weakens with distance and scales with solved circuit
            // current. Gravity and all scene colliders continue to act.
            const proximity = THREE.MathUtils.clamp(1 - distance / 2.15, 0, 1);
            const fieldAcceleration = (10.5 + 44 * Math.pow(proximity, 1.65)) * currentScale;
            acceleration = delta.normalize().multiplyScalar(fieldAcceleration)
              .addScaledVector(velocity, -2.1);
          }
          const force = acceleration.multiplyScalar(mass);
          magneticForceNewtons.set(id, force.length());
          api.setPhysicsForce?.(id, force);
        });
      }
    },
    getState: () => ({
      experiment: 'electric-crane',
      coilInstalled,
      switchClosed,
      powered,
      liftCommanded,
      attachedClipCount: attachedClips.size,
      currentAmps,
      coilTemperature,
      connectedEdges: [...circuit.edges.keys()].filter((id) => id.startsWith('student:')),
      magneticModel: 'current-scaled-distance-force',
      magneticForceNewtons: Object.fromEntries(magneticForceNewtons),
      clips: clipIds.map((id) => ({ id, pose: api.getPhysicsPose?.(id) || null })),
      circuit: circuit.serialize(),
    }),
    dispose: () => {},
  };
}
