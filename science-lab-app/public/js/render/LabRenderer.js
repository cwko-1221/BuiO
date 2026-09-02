import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  palette, mat, roundedBox, cylinder, sphere, torus, makeBench, makeBeaker,
  makeBottle, makeTargetRing, makeWire, replaceWireGeometry, disposeObject, worldPosition,
  makeLabelPlane, setLabelAnisotropy,
} from './SceneKit.js';
import { buildExperimentScene } from './ExperimentScenes.js';
import { PhysicsWorld } from '../physics/PhysicsWorld.js';
import { loadScienceLabKit, getAssetLibraryStats } from './AssetLibrary.js';

const DEFAULT_CAMERA = new THREE.Vector3(0, 7.6, 11.2);
const DEFAULT_TARGET = new THREE.Vector3(0, .9, 0);
const CAMERA_PRESETS = {
  'density-column': { position: [-.15, 7.55, 11.8], target: [.2, 1.2, .05] },
  'water-filter': { position: [-.1, 7.55, 11.9], target: [.35, 1.3, .05] },
  'electric-crane': { position: [-.3, 7.35, 12.2], target: [.25, 1.25, 0] },
  'light-reflection': { position: [-.1, 7.15, 11.4], target: [.35, 1.7, .05] },
  'heat-conduction': { position: [.1, 6.05, 9.9], target: [.5, 2.2, .05] },
  'force-coaster': { position: [-.2, 7.85, 12.8], target: [.2, 1.0, -.15] },
};

export class LabRenderer {
  namePlateQueue = [];

  namePlates = new Map();

  constructor(canvas, { settings, audio, onAction, onPreview, onHover, onContextIssue } = {}) {
    this.canvas = canvas;
    this.settings = settings;
    this.audio = audio;
    this.actionHandler = onAction;
    this.previewHandler = onPreview;
    this.hoverHandler = onHover;
    this.contextIssueHandler = onContextIssue;
    this.entities = new Map();
    this.targets = new Map();
    this.pickables = [];
    this.animations = [];
    this.particles = [];
    this.connections = [];
    this.currentStep = null;
    this.sceneController = null;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.dragPoint = new THREE.Vector3();
    this.dragState = null;
    this.inputLockedUntil = 0;
    this.instant = false;
    this.elapsed = 0;
    this.lastFrame = performance.now();
    this.frameAccumulator = 0;
    this.destroyed = false;
    this.resizeHandler = () => this.resize();
    this.visibilityHandler = () => { this.paused = document.hidden; };
  }

  async init() {
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: this.#quality() !== 'low', powerPreference: 'high-performance' });
    } catch (error) {
      this.contextIssueHandler?.('這部裝置未能啟動 WebGL，請更新瀏覽器或改用另一部裝置。');
      throw error;
    }
    // Canvas-backed labels are viewed at a glancing angle across the bench,
    // where anisotropic filtering is what keeps the characters legible.
    setLabelAnisotropy(this.renderer.capabilities.getMaxAnisotropy());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.#quality() !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x0b5260, 1);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b5360);
    this.scene.fog = new THREE.FogExp2(0x0b5360, .025);
    this.camera = new THREE.PerspectiveCamera(39, 1, .1, 120);
    this.camera.position.copy(DEFAULT_CAMERA);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.target.copy(DEFAULT_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .065;
    // Panning is how a tablet user brings a far corner of the bench into
    // reach. One finger still drags apparatus; two fingers move the view.
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;
    this.controls.panSpeed = .9;
    this.controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    // With a mouse, pressing the wheel pans; rolling it still zooms.
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.controls.minDistance = 8.6;
    this.controls.maxDistance = 15.5;
    this.controls.minPolarAngle = .75;
    this.controls.maxPolarAngle = 1.18;
    this.controls.minAzimuthAngle = -.52;
    this.controls.maxAzimuthAngle = .52;
    this.controls.update();
    // A long press over the bench raises iOS's selection callout and the
    // desktop context menu. Both interrupt a drag, and neither is wanted.
    this.canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    this.environment = new THREE.Group();
    this.world = new THREE.Group();
    this.scene.add(this.environment, this.world);
    this.physics = new PhysicsWorld({
      root: this.world,
      onImpact: (strength) => this.audio?.play('impact', { level: .025 + strength * .08 }),
    });
    await this.physics.init();
    this.assetKit = await loadScienceLabKit();
    this.#buildEnvironment();
    this.#bindInput();
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.contextIssueHandler?.('3D 畫面暫停了，正在恢復圖像…');
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextIssueHandler?.('3D 畫面已恢復。');
      this.renderer.shadowMap.enabled = this.#quality() !== 'low';
    });
    window.addEventListener('resize', this.resizeHandler);
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.resize();
    this.loadCatalog();
    this.renderer.setAnimationLoop((time) => this.#frame(time));
  }

  #quality() {
    if (this.settings.quality === 'high' || this.settings.quality === 'low') return this.settings.quality;
    const memory = navigator.deviceMemory || 4;
    return memory <= 4 || matchMedia('(max-width: 720px)').matches ? 'low' : 'high';
  }

  #buildEnvironment() {
    this.environment.clear();
    const hemi = new THREE.HemisphereLight(0xb9fff3, 0x184b53, 2.2);
    const key = new THREE.DirectionalLight(0xfff5d7, this.#quality() === 'low' ? 2.2 : 3.1);
    key.position.set(-4, 10, 7);
    key.castShadow = this.#quality() !== 'low';
    key.shadow.mapSize.set(this.#quality() === 'low' ? 512 : 1024, this.#quality() === 'low' ? 512 : 1024);
    key.shadow.camera.left = -9; key.shadow.camera.right = 9; key.shadow.camera.top = 8; key.shadow.camera.bottom = -7;
    const rim = new THREE.DirectionalLight(0x69b6ff, 1.3);
    rim.position.set(8, 5, -7);
    this.environment.add(hemi, key, rim);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(25, 72), mat(0x85c9bd, { roughness: .94, receiveShadow: true }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -3.48;
    floor.receiveShadow = true;
    this.environment.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(9.8, 10.15, 72), mat(0xa8e6d7, { emissive: 0x5bc7b5, emissiveIntensity: .15, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -3.45;
    this.environment.add(ring);
    this.#addBackgroundBubbles();
  }

  #addBackgroundBubbles() {
    const bubbleMaterial = mat(0xbff7ef, { transparent: true, opacity: .12, roughness: .1, depthWrite: false });
    for (let i = 0; i < 16; i += 1) {
      const bubble = new THREE.Mesh(new THREE.SphereGeometry(.25 + (i % 4) * .12, 12, 8), bubbleMaterial.clone());
      const angle = (i / 16) * Math.PI * 2;
      bubble.position.set(Math.cos(angle) * (8 + (i % 3)), -1 + (i % 5) * 1.5, Math.sin(angle) * (7 + (i % 4)));
      bubble.userData.floatOffset = i;
      this.environment.add(bubble);
    }
  }

  loadCatalog() {
    this.mode = 'catalog';
    this.#clearWorld();
    this.scene.background.set(0x0b5260);
    this.scene.fog.color.set(0x0b5260);
    this.controls.enabled = false;
    this.camera.position.set(1.1, 6.4, 12.7);
    this.controls.target.set(1.2, 1.25, 0);
    this.controls.update();
    const island = new THREE.Group();
    island.position.set(3.35, .2, 0);
    const base = cylinder(3.15, .78, 0x4bb39f, { radiusTop: 3.15, radiusBottom: 2.35, segments: 48, roughness: .8 });
    base.position.y = -.5;
    const top = cylinder(3.18, .24, 0xf2d9a9, { segments: 48, roughness: .76 });
    top.position.y = 0;
    island.add(base, top);

    const beaker = makeBeaker({ radius: .72, height: 1.9, liquidColor: palette.violet, liquidLevel: .58 });
    beaker.position.set(-.9,.1,.35); beaker.rotation.z=-.05; island.add(beaker);
    const bottle = makeBottle(palette.coral, ''); bottle.position.set(-2,.1,-.55); bottle.scale.setScalar(.82); bottle.rotation.z=.08; island.add(bottle);
    const prism = new THREE.Mesh(new THREE.CylinderGeometry(.65,.65,1.5,3),mat(0xa5e7ee,{transparent:true,opacity:.43,roughness:.05,depthWrite:false}));prism.rotation.z=Math.PI/2;prism.position.set(.95,.8,.25);island.add(prism);
    const atom = new THREE.Group();const nucleus=sphere(.42,palette.yellow,{emissive:palette.yellow,emissiveIntensity:.7});atom.add(nucleus);for(let i=0;i<3;i+=1){const orbit=torus(1.15,.025,i===0?palette.mint:i===1?palette.blue:palette.coral,{transparent:true,opacity:.72,emissive:i===0?palette.mint:i===1?palette.blue:palette.coral,emissiveIntensity:.35,castShadow:false});orbit.rotation.set(i*Math.PI/3,i*Math.PI/2.5,0);atom.add(orbit);const electron=sphere(.11,i===0?palette.mint:i===1?palette.blue:palette.coral,{emissive:i===0?palette.mint:i===1?palette.blue:palette.coral,emissiveIntensity:1});electron.position.x=1.15;orbit.add(electron);}atom.position.set(.7,2.65,-.5);island.add(atom);
    const robot = this.#makeMascot();robot.position.set(2.0,.2,-.3);island.add(robot);
    this.world.add(island);
    this.catalogObjects = { island, atom, robot, beaker };
  }

  #makeMascot() {
    const group = new THREE.Group();
    const body = roundedBox(1.15,1.25,.88,palette.white,.3,5,{roughness:.55});body.position.y=.78;
    const screen = roundedBox(.8,.58,.05,palette.deep,.15,4,{emissive:0x0b5f68,emissiveIntensity:.35});screen.position.set(0,.88,.47);
    const eyeMaterial=mat(palette.mint,{emissive:palette.mint,emissiveIntensity:1.2,roughness:.2});[-.22,.22].forEach(x=>{const eye=sphere(.07,palette.mint,{emissive:palette.mint,emissiveIntensity:1.2});eye.position.set(x,.92,.52);group.add(eye);});
    const antenna=cylinder(.04,.5,palette.metal,{metalness:.5});antenna.position.y=1.68;const tip=sphere(.1,palette.coral,{emissive:palette.coral,emissiveIntensity:.8});tip.position.y=1.96;
    for(const x of[-.46,.46]){const foot=roundedBox(.34,.22,.62,palette.yellow,.1,3);foot.position.set(x,.1,.05);group.add(foot);}
    group.add(body,screen,antenna,tip);group.userData.tip=tip;return group;
  }

  loadExperiment(definition, actionHistory = []) {
    this.mode = 'lab';
    this.#clearWorld();
    this.scene.background.set(0x0d6070);
    this.scene.fog.color.set(0x0d6070);
    this.controls.enabled = true;
    this.cameraPreset = CAMERA_PRESETS[definition.id] || null;
    this.resetCamera(false);
    const bench = makeBench();
    bench.position.y = 0;
    this.world.add(bench);
    this.experimentRoot = new THREE.Group();
    this.experimentRoot.position.y = .05;
    this.world.add(this.experimentRoot);
    const api = this.#createSceneApi();
    this.namePlateQueue = [];
    this.namePlates = new Map();
    this.sceneController = buildExperimentScene(definition, api);
    this.#layOutNamePlates();
    this.#updateLabelScale();
    if (actionHistory?.length) {
      this.instant = true;
      actionHistory.filter((item) => item.accepted).forEach((item) => this.applyAcceptedAction(item.action));
      this.instant = false;
    }
  }

  #createSceneApi() {
    const api = {
      root: this.experimentRoot,
      entity: (id, label, object, options = {}) => this.#registerEntity(id, label, object, options),
      target: (id, label, object, options = {}) => this.#registerTarget(id, label, object, options),
      moveObject: (object, destination, options) => this.moveObject(object, destination, options),
      animateScale: (object, scale, duration) => this.animateScale(object, scale, duration),
      tiltPour: (object, destination, color, options) => this.tiltPour(object, destination, color, options),
      pressButton: (object) => this.pressButton(object),
      sparkle: (position, color, count) => this.sparkle(position, color, count),
      splash: (position, color) => this.splash(position, color),
      drip: (position, color) => this.drip(position, color),
      addConnection: (source, target, color) => this.addConnection(source, target, color),
      pulseObject: (object, color) => this.pulseObject(object, color),
      fadeObject: (object, opacity, duration) => this.fadeObject(object, opacity, duration),
      reparent: (object, parent) => this.reparent(object, parent),
      playSound: (name, options) => this.audio?.play(name, options),
      setEnvironment: (name) => this.setEnvironment(name),
      addStaticCollider: (id, object, options) => this.physics?.addStaticObject(id, object, options),
      addStaticBox: (id, center, halfExtents, options) => this.physics?.addStaticBox(id, center, halfExtents, options),
      updateStaticPose: (id, position, quaternion) => this.physics?.updateStaticPose(id, position, quaternion),
      updateTargetPose: (id, position, quaternion) => this.physics?.updateTargetPose(id, position, quaternion),
      setPhysicsPose: (id, position, quaternion, options) => this.physics?.setPose(id, position, quaternion, options),
      setPhysicsEnabled: (id, enabled) => this.physics?.setEnabled(id, enabled),
      makePhysicsDynamic: (id, velocity) => this.physics?.makeDynamic(id, velocity),
      setPhysicsMaterial: (id, options) => this.physics?.setMaterial(id, options),
      applyPhysicsImpulse: (id, impulse, torque) => this.physics?.applyImpulse(id, impulse, torque),
      applyPhysicsForce: (id, force, torque) => this.physics?.applyForce(id, force, torque),
      setPhysicsForce: (id, force, torque) => this.physics?.setForce(id, force, torque),
      setPhysicsVelocity: (id, velocity, angularVelocity) => this.physics?.setVelocity(id, velocity, angularVelocity),
      applyPhysicsBuoyancy: (id, options) => this.physics?.applyBuoyancy(id, options),
      getPhysicsPose: (id) => this.physics?.getPose(id),
      getPhysicsMass: (id) => this.physics?.getMass(id),
      getSocketMetrics: (subject, target) => this.physics?.getSocketMetrics(subject, target),
      onAction: null,
      onPreview: null,
    };
    Object.defineProperty(api, 'onAction', { set: (handler) => { this.customAction = handler; }, get: () => this.customAction });
    Object.defineProperty(api, 'onPreview', { set: (handler) => { this.customPreview = handler; }, get: () => this.customPreview });
    return api;
  }

  #registerEntity(id, label, object, options) {
    object.updateWorldMatrix(true, true);
    const home = {
      position: object.position.clone(),
      rotation: object.rotation.clone(),
      scale: object.scale.clone(),
      parent: object.parent,
      worldPosition: object.getWorldPosition(new THREE.Vector3()),
      worldQuaternion: object.getWorldQuaternion(new THREE.Quaternion()),
    };
    const entity = { id, label, object, options, home };
    this.entities.set(id, entity);
    // Connection ports are named by the step instruction and sit too close
    // together to plate; parts that are not pickable are scenery.
    if (label && options.namePlate !== false && !options.connectable && options.pickable !== false) this.namePlateQueue.push(entity);
    this.physics?.registerEntity(id, object, options);
    object.traverse((child) => {
      if (!child.isMesh) return;
      child.userData.entityId = id;
      if (!options.targetOnly && options.pickable !== false) this.pickables.push(child);
    });
  }

  /**
   * Build one plate per named piece of apparatus and stand them along the front
   * of the bench. Plates are laid out together rather than one at a time so
   * neighbouring apparatus cannot end up with overlapping names.
   */
  #layOutNamePlates() {
    // Plate the nearest apparatus first. The bench is seen at an angle, so two
    // plates a short distance apart in depth still read as one stacked blur;
    // a crowded plate therefore steps backwards, which keeps the plates in the
    // same front-to-back order as the apparatus they name.
    const queued = this.namePlateQueue
      .map((entity) => ({ entity, bounds: new THREE.Box3().setFromObject(entity.object) }))
      .filter(({ bounds }) => !bounds.isEmpty() && Number.isFinite(bounds.min.x))
      .sort((a, b) => b.bounds.max.z - a.bounds.max.z);
    const placed = [];
    for (const { entity, bounds } of queued) {
      const centre = bounds.getCenter(new THREE.Vector3());
      const plate = this.#makeNamePlate(entity.label);
      const paired = entity.options.namePlateMode === 'paired-fixed';
      const local = paired
        ? this.experimentRoot.worldToLocal(centre.clone())
        : this.experimentRoot.worldToLocal(new THREE.Vector3(centre.x, 0, bounds.max.z + .34));
      local.y = .02;
      if (paired) local.z += entity.options.namePlateFrontOffset ?? .68;
      local.x = THREE.MathUtils.clamp(local.x, -5, 5);
      local.z = THREE.MathUtils.clamp(local.z, -2.5, 2.62);
      if (!paired) {
        for (let guard = 0; guard < 10; guard += 1) {
          const clash = placed.find((other) => Math.abs(other.x - local.x) < 1.56 && Math.abs(other.z - local.z) < .88);
          if (!clash) break;
          local.z = clash.z - .92;
          if (local.z < -2.5) {
            // No room behind: stand it beside the plate that is already there.
            local.z = clash.z;
            local.x += local.x < 0 ? -1.6 : 1.6;
            local.x = THREE.MathUtils.clamp(local.x, -5, 5);
          }
        }
      }
      placed.push({ x: local.x, z: local.z });
      plate.position.copy(local);
      this.experimentRoot.add(plate);
      this.namePlates.set(entity.id, plate);
    }
    this.namePlateQueue = [];
    this.#highlightNamePlates();
  }

  #makeNamePlate(text) {
    const plate = new THREE.Group();
    const base = roundedBox(1.5, .06, .36, 0xf3efe2, .026, 2, { roughness: .78 });
    base.position.y = .03;
    const face = new THREE.Group();
    const easel = roundedBox(1.4, .5, .05, 0xfffdf7, .06, 3, { roughness: .7 });
    easel.position.set(0, .29, 0);
    easel.renderOrder = 5;
    const caption = makeLabelPlane(text, { scale: .48 });
    caption.position.set(0, .29, .04);
    caption.renderOrder = 6;
    face.add(easel, caption);
    plate.add(base, face);
    plate.userData.face = face;
    plate.userData.caption = caption;
    plate.userData.easel = easel;
    plate.userData.authoredScale = caption.scale.clone();
    return plate;
  }

  /** The apparatus this step needs reads larger than the rest of the bench. */
  #highlightNamePlates() {
    const action = this.currentStep?.action;
    const active = new Set([action?.subject, action?.target].filter(Boolean));
    for (const [id, plate] of this.namePlates) {
      const on = active.has(id);
      const authored = plate.userData.authoredScale;
      plate.userData.caption.scale.set(
        authored.x * (on ? 1.24 : 1),
        authored.y * (on ? 1.24 : 1),
        1,
      );
      plate.userData.easel.material.color.set(on ? 0xfff3cd : 0xfffdf7);
    }
  }

  #registerTarget(id, label, object, options) {
    const target = { id, label, object, radius: options.radius || 1.2, indicator: object.userData.ring ? object : null, options };
    if (target.indicator) target.indicator.visible = false;
    this.targets.set(id, target);
    this.physics?.registerTarget(id, object, target.radius, options.physics || {});
  }

  setStep(step) {
    this.currentStep = step;
    const variableSubject = step?.action?.type === 'adjust' ? step.action.subject : null;
    if (this.currentVariableSubject !== variableSubject) this.currentVariable = null;
    this.currentVariableSubject = variableSubject;
    for (const target of this.targets.values()) if (target.indicator) target.indicator.visible = false;
    if (step?.action.target) {
      const target = this.targets.get(step.action.target);
      if (target?.indicator) target.indicator.visible = true;
    }
    this.#updateSelectionHelper();
    this.#highlightNamePlates();
  }

  #updateSelectionHelper() {
    if (this.selectionHelper) {
      this.world.remove(this.selectionHelper);
      this.selectionHelper.geometry?.dispose?.();
      this.selectionHelper.material?.dispose?.();
      this.selectionHelper = null;
    }
    const entity = this.entities.get(this.currentStep?.action.subject);
    if (!entity || entity.options.targetOnly) return;
    const box = new THREE.Box3().setFromObject(entity.object);
    this.selectionHelper = new THREE.Box3Helper(box, this.settings.highContrast ? 0xffd84f : 0x66f0c6);
    this.selectionHelper.material.transparent = true;
    this.selectionHelper.material.opacity = .8;
    this.selectionHelper.material.depthTest = false;
    this.world.add(this.selectionHelper);
  }

  applyAcceptedAction(action) {
    this.customAction?.(action);
    const sound = action.type === 'connect' ? 'connect' : action.type === 'pour' ? 'pour' : action.type === 'strike' ? 'impact' : action.type === 'tap' ? 'switch' : action.type === 'stir' ? 'stir' : action.type === 'adjust' ? 'measure' : 'drop';
    if (!this.instant) this.audio?.play(sound);
  }

  previewVariable(subject, value) {
    this.currentVariableSubject = subject;
    this.currentVariable = Number(value);
    this.customPreview?.(subject, Number(value));
    this.previewHandler?.({ subject, value: Number(value) });
  }

  commitVariable(subject, value) {
    const action = { type: 'adjust', subject, value: Number(value) };
    return this.#requestAction(action);
  }

  performAccessibleAction() {
    if (performance.now() < this.inputLockedUntil) return false;
    const expected = this.currentStep?.action;
    if (!expected) return false;
    const action = { type: expected.type, subject: expected.subject, target: expected.target };
    if (expected.type === 'adjust') {
      action.value = (expected.min + expected.max) / 2;
      this.previewVariable(expected.subject, action.value);
    }
    if (expected.type === 'stir') action.amount = expected.amount;
    if (expected.type === 'record') action.value = expected.answer;
    if (expected.evidence && expected.target) {
      const target = this.targets.get(expected.target)?.object;
      const targetPosition = target?.getWorldPosition(new THREE.Vector3());
      if (targetPosition && this.physics?.grab(expected.subject)) {
        this.physics.finishGrab(expected.subject, targetPosition, 20);
        this.physics.release(expected.subject);
        action.evidence = this.physics.getSocketMetrics(expected.subject, expected.target) || undefined;
        if (action.evidence && expected.type === 'strike') {
          const impact = this.physics.getLastImpact(expected.subject);
          action.evidence.impulse = impact?.impulse || 0;
        }
      }
    }
    return this.#requestAction(action).accepted;
  }

  #requestAction(action) {
    const result = this.actionHandler?.(action) || { accepted: false };
    if (result.accepted) {
      this.applyAcceptedAction(action);
    } else {
      this.audio?.play('wrong');
      const entity = this.entities.get(action.subject);
      if (entity && !['adjust','tap','stir','connect'].includes(action.type)) this.#returnHome(entity);
    }
    return result;
  }

  #bindInput() {
    this.canvas.tabIndex = 0;
    this.canvas.addEventListener('pointerdown', (event) => this.#pointerDown(event));
    this.canvas.addEventListener('pointermove', (event) => this.#pointerMove(event));
    this.canvas.addEventListener('pointerup', (event) => this.#pointerUp(event));
    this.canvas.addEventListener('pointercancel', (event) => this.#pointerUp(event));
    this.canvas.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); this.performAccessibleAction(); }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        const expected = this.currentStep?.action;
        if (expected?.type === 'adjust') {
          event.preventDefault();
          const range = expected.range || [0, 100];
          const current = this.currentVariable ?? range[0];
          const next = current + (event.key === 'ArrowRight' ? 1 : -1) * Math.max(1, Math.abs(range[1] - range[0]) / 20);
          this.previewVariable(expected.subject, next);
          this.currentVariable = next;
        }
      }
    });
  }

  #pointerDown(event) {
    if (this.mode !== 'lab' || !this.currentStep) return;
    if (performance.now() < this.inputLockedUntil) {
      this.contextIssueHandler?.('請稍候，器具正在回到原位。');
      return;
    }
    this.audio?.unlock();
    const hit = this.#pick(event);
    const expected = this.currentStep.action;
    const id = hit?.object.userData.entityId;
    this.lastInteraction = { phase: 'pointerdown', expected: expected.subject, hit: id || null, at: performance.now() };
    if (!id) return;
    this.canvas.setPointerCapture(event.pointerId);
    this.controls.enabled = false;
    const entity = this.entities.get(id);
    const startValue = this.#variableStart(expected);
    const startWorldPosition = entity.object.getWorldPosition(new THREE.Vector3());
    const expectedTarget = expected.target ? this.targets.get(expected.target) : null;
    let startTargetScreenDistance = null;
    if (expectedTarget) {
      const rect = this.canvas.getBoundingClientRect();
      const projected = expectedTarget.object.getWorldPosition(new THREE.Vector3()).project(this.camera);
      const targetX = rect.left + (projected.x + 1) * .5 * rect.width;
      const targetY = rect.top + (-projected.y + 1) * .5 * rect.height;
      startTargetScreenDistance = Math.max(1, Math.hypot(event.clientX - targetX, event.clientY - targetY));
    }
    this.dragState = {
      pointerId: event.pointerId,
      entity,
      id,
      startX: event.clientX,
      startY: event.clientY,
      startPosition: entity.object.position.clone(),
      startWorldPosition,
      startRotation: entity.object.rotation.clone(),
      startValue,
      amount: 0,
      lastAngle: null,
      moved: false,
      wrong: id !== expected.subject,
      physics: false,
      startTargetScreenDistance,
    };
    if (id === expected.subject && ['place','pour','strike'].includes(expected.type)) {
      const pickupHeight = Math.max(.32, startWorldPosition.y + .38);
      this.dragPlane.constant = -pickupHeight;
      entity.object.scale.multiplyScalar(1.06);
      this.dragState.physics = Boolean(this.physics?.grab(id, startWorldPosition));
      this.audio?.play('pickup');
    }
    if (id === expected.subject && expected.type === 'pour') {
      // Measure the lip after the pickup scale, or the carried vessel aims a
      // lip that is 6% short of where its rim actually is.
      const socket = entity.object.userData.pourSocket || entity.object.userData.spout || entity.object.userData.mouth;
      if (socket) {
        entity.object.updateWorldMatrix(true, true);
        const worldScale = entity.object.getWorldScale(new THREE.Vector3());
        this.dragState.pourSocketLocal = entity.object
          .worldToLocal(socket.getWorldPosition(new THREE.Vector3()))
          .multiply(worldScale);
      }
      // A pump dispenser is worked upright; only a lipped vessel is tipped, and
      // the carry must use the same angle the pour animation ends at.
      this.dragState.pourTiltDegrees = entity.object.userData.pumpHead ? 0 : 64;
    }
    if (id === expected.subject && expected.type === 'connect') {
      const position = worldPosition(entity.object);
      this.tempWire = makeWire(position, position.clone().add(new THREE.Vector3(.1,.1,.1)), palette.yellow, .035);
      this.world.add(this.tempWire);
    }
  }

  #pointerMove(event) {
    if (this.dragState && event.pointerId === this.dragState.pointerId) {
      const state = this.dragState;
      const expected = this.currentStep.action;
      const dx = event.clientX - state.startX;
      const dy = event.clientY - state.startY;
      state.moved ||= Math.hypot(dx, dy) > 5;
      if (state.wrong) return;
      if (['place','pour','strike'].includes(expected.type)) {
        this.#rayToPlane(event, this.dragPlane, this.dragPoint);
        this.dragPoint.x = THREE.MathUtils.clamp(this.dragPoint.x, -5.2, 5.2);
        this.dragPoint.z = THREE.MathUtils.clamp(this.dragPoint.z, -2.6, 2.7);
        const targetRecord = expected.target ? this.targets.get(expected.target) : null;
        if (targetRecord) {
          const rect = this.canvas.getBoundingClientRect();
          const targetWorld = targetRecord.object.getWorldPosition(new THREE.Vector3());
          const projected = targetWorld.clone().project(this.camera);
          const targetX = rect.left + (projected.x + 1) * .5 * rect.width;
          const targetY = rect.top + (-projected.y + 1) * .5 * rect.height;
          const screenDistance = Math.hypot(event.clientX - targetX, event.clientY - targetY);
          // Bring the piece within reach of the socket and it aligns itself.
          // Inside the lock radius the fit is exact so a child does not have to
          // hold a pixel-perfect position; between lock and capture the pull
          // eases in, so the alignment is felt rather than sprung on them.
          const captureRadius = THREE.MathUtils.clamp(rect.width * .055, 52, 92);
          const lockRadius = captureRadius * .6;
          const capture = screenDistance <= lockRadius
            ? 1
            : 1 - THREE.MathUtils.smoothstep(screenDistance, lockRadius, captureRadius);
          const journey = 1 - THREE.MathUtils.clamp(screenDistance / (state.startTargetScreenDistance || screenDistance || 1), 0, 1);
          // Carry the apparatus to the same place the accepted action will put
          // it. Approaching one pose and then snapping to another is what makes
          // a released object appear to jump, and it also drives objects into
          // colliders (rails, vessel walls) that the settled pose clears.
          const approach = targetWorld.clone().add(this.#targetApproachOffset(targetRecord, expected.type));
          this.dragPoint.y = THREE.MathUtils.lerp(
            state.startWorldPosition.y + .38,
            approach.y,
            THREE.MathUtils.smoothstep(journey, 0, 1),
          );
          if (capture > 0) this.dragPoint.lerp(approach, capture);
          state.socketCapture = capture;
          state.approachPoint = approach;
          // Orientation is part of the fit: a cart meets the ramp at the ramp's
          // own angle, not the angle it was lifted from the bench at.
          state.targetQuaternion = targetRecord.object.getWorldQuaternion(new THREE.Quaternion());
          state.approachQuaternion = state.entity.home.worldQuaternion.clone()
            .slerp(state.targetQuaternion, capture);
          this.#showSocketLock(targetRecord, capture);
        }
        if (state.physics) {
          let physicsTarget = this.dragPoint;
          let pourQuaternion = null;
          if (expected.type === 'pour' && expected.target && state.pourSocketLocal) {
            // Tip towards the pouring pose, not towards the ring itself: the
            // lip belongs over the opening while the body stays clear of the
            // vessel wall, which is exactly where the pour animation ends.
            const targetPosition = state.approachPoint?.clone() || null;
            if (targetPosition) {
              const proximity = 1 - THREE.MathUtils.clamp(this.dragPoint.distanceTo(targetPosition) / 2.2, 0, 1);
              const tilt = -THREE.MathUtils.degToRad((state.pourTiltDegrees ?? 64) * proximity);
              pourQuaternion = state.entity.home.worldQuaternion.clone()
                .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
              const lipAlignedRoot = this.dragPoint.clone().sub(state.pourSocketLocal.clone().applyQuaternion(pourQuaternion));
              physicsTarget = this.dragPoint.clone().lerp(lipAlignedRoot, THREE.MathUtils.smoothstep(proximity, .15, 1));
              state.pourTiltDeg = Math.abs(THREE.MathUtils.radToDeg(tilt));
            }
          }
          // Advance the rigid body in short fixed physics steps while the
          // pointer moves. This preserves the full swept collision path even
          // for low-rate touch events instead of teleporting on release.
          // Remember the fully seated pose while the socket has any hold on the
          // piece, so letting go anywhere in the capture zone finishes the fit
          // instead of leaving it half pulled.
          if (state.socketCapture > 0 && state.approachPoint) {
            if (expected.type === 'pour' && state.pourSocketLocal) {
              const settled = state.entity.home.worldQuaternion.clone().multiply(
                new THREE.Quaternion().setFromAxisAngle(
                  new THREE.Vector3(0, 0, 1),
                  -THREE.MathUtils.degToRad(state.pourTiltDegrees ?? 64),
                ),
              );
              state.lockedQuaternion = settled;
              state.lockedTarget = state.approachPoint.clone()
                .sub(state.pourSocketLocal.clone().applyQuaternion(settled));
            } else {
              state.lockedQuaternion = state.targetQuaternion?.clone() || null;
              state.lockedTarget = state.approachPoint.clone();
            }
          } else {
            state.lockedTarget = null;
            state.lockedQuaternion = null;
          }
          this.physics.advanceGrab(state.id, physicsTarget);
          // A carried piece holds the angle it was picked up at and turns to
          // meet the socket as it locks on. Writing the rotation is safe while
          // carried because the collider is a sensor and cannot be forced
          // through anything.
          this.physics.setGrabRotation(
            state.id,
            pourQuaternion || state.approachQuaternion || state.entity.home.worldQuaternion,
          );
          state.physicsTarget = physicsTarget.clone();
        } else {
          state.entity.object.position.x = this.dragPoint.x;
          state.entity.object.position.z = this.dragPoint.z;
          state.entity.object.position.y = Math.max(.18, state.startPosition.y + .38);
        }
      } else if (expected.type === 'connect' && this.tempWire) {
        this.#rayToPlane(event, new THREE.Plane(new THREE.Vector3(0,1,0), -0.35), this.dragPoint);
        replaceWireGeometry(this.tempWire, worldPosition(state.entity.object), this.dragPoint, .035);
      } else if (expected.type === 'adjust') {
        const range = expected.range || [0, 100];
        const low = Math.min(...range), high = Math.max(...range);
        const direction = expected.invert ? -1 : 1;
        const travel = state.entity.options.adjustAxis === 'vertical' ? -dy : dx;
        const value = THREE.MathUtils.clamp(state.startValue + direction * travel / 320 * (high - low), low, high);
        this.currentVariable = value;
        this.previewVariable(expected.subject, value);
      } else if (expected.type === 'stir') {
        const rect = this.canvas.getBoundingClientRect();
        const position = worldPosition(state.entity.object).project(this.camera);
        const cx = rect.left + (position.x + 1) * .5 * rect.width;
        const cy = rect.top + (-position.y + 1) * .5 * rect.height;
        const angle = Math.atan2(event.clientY - cy, event.clientX - cx);
        if (state.lastAngle != null) {
          let delta = angle - state.lastAngle;
          if (delta > Math.PI) delta -= Math.PI * 2;
          if (delta < -Math.PI) delta += Math.PI * 2;
          state.amount += Math.abs(delta);
        }
        state.lastAngle = angle;
        state.entity.object.rotation.y += dx * .0025;
      }
      return;
    }
    const hit = this.#pick(event);
    const id = hit?.object.userData.entityId;
    const entity = id ? this.entities.get(id) : null;
    this.canvas.style.cursor = entity ? 'pointer' : 'grab';
    this.hoverHandler?.(entity ? { label: entity.label, clientX: event.clientX, clientY: event.clientY } : null);
  }

  #pointerUp(event) {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) return;
    const state = this.dragState;
    const expected = this.currentStep.action;
    this.dragState = null;
    this.controls.enabled = this.mode === 'lab';
    this.#clearSocketLock();
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    if (this.tempWire) { this.world.remove(this.tempWire); disposeObject(this.tempWire); this.tempWire = null; }
    if (state.physics) {
      // Letting go inside the capture zone completes the fit rather than
      // freezing the piece wherever the pointer happened to stop.
      if (state.lockedQuaternion) this.physics?.setGrabRotation(state.id, state.lockedQuaternion);
      this.physics?.finishGrab(state.id, state.lockedTarget || state.physicsTarget || this.dragPoint, 14);
      this.physics?.release(state.id);
    }

    if (state.wrong) {
      this.#requestAction({ type: expected.type, subject: state.id, target: null });
      return;
    }
    const action = { type: expected.type, subject: expected.subject };
    const locked = (state.socketCapture || 0) > 0;
    if (expected.target) {
      action.target = locked || this.#nearTarget(state.entity.object, expected.target, event) ? expected.target : null;
    }
    if (expected.target && state.physics) {
      action.evidence = this.physics?.getSocketMetrics(state.id, expected.target) || undefined;
      if (action.evidence && Number.isFinite(state.pourTiltDeg)) action.evidence.tiltDeg = state.pourTiltDeg;
      if (action.evidence && expected.type === 'strike') {
        const impact = this.physics?.getLastImpact(state.id);
        action.evidence.impulse = impact?.impulse || 0;
      }
    }
    if (expected.type === 'adjust') action.value = this.currentVariable ?? state.startValue;
    if (expected.type === 'stir') action.amount = state.amount;
    if (expected.type === 'tap' && state.moved) return;
    if (['place','pour','strike'].includes(expected.type)) state.entity.object.scale.copy(state.entity.home.scale);
    const result = this.#requestAction(action);
    this.lastInteraction = { phase: 'pointerup', expected: expected.subject, hit: state.id, action, result, at: performance.now() };
  }

  #pick(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(this.pickables, false)[0] || null;
  }

  #rayToPlane(event, plane, target) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.ray.intersectPlane(plane, target);
  }

  /**
   * Show how firmly the carried piece has taken the socket: the ring tightens
   * and brightens as the fit closes, so alignment is visible before release.
   */
  #showSocketLock(targetRecord, capture) {
    const ring = targetRecord?.indicator;
    if (!ring) return;
    this.lockedTargetRing = capture > 0 ? ring : null;
    const eased = THREE.MathUtils.smoothstep(capture, 0, 1);
    ring.scale.setScalar(1 + eased * .12);
    const mesh = ring.userData.ring;
    if (mesh?.material) {
      mesh.material.opacity = .75 + eased * .25;
      mesh.material.emissiveIntensity = .7 + eased * 1.3;
    }
  }

  #clearSocketLock() {
    const ring = this.lockedTargetRing;
    this.lockedTargetRing = null;
    if (!ring) return;
    ring.scale.setScalar(1);
    const mesh = ring.userData.ring;
    if (mesh?.material) {
      mesh.material.opacity = .75;
      mesh.material.emissiveIntensity = .7;
    }
  }

  /**
   * Where a carried object is aimed for a given verb: the ring itself unless
   * the scene authored an offset. `pourOffset` is the settled pouring pose and
   * is shared by the carry and the release animation so the two agree.
   */
  #targetApproachOffset(targetRecord, verb) {
    const options = targetRecord?.options || {};
    const authored = (verb === 'pour' && options.pourOffset) || options.snapOffset;
    if (authored) return new THREE.Vector3(...authored);
    return new THREE.Vector3(0, verb === 'pour' ? .42 : .08, 0);
  }

  #nearTarget(object, targetId, pointerEvent = null) {
    const target = this.targets.get(targetId);
    if (!target) return false;
    const subjectId = [...this.entities.values()].find((entity) => entity.object === object)?.id;
    if (subjectId && this.physics?.hasBody(subjectId) && this.physics.isOverlapping(subjectId, targetId)) return true;
    const a = worldPosition(object); const b = worldPosition(target.object);
    if (a.distanceTo(b) <= target.radius + .18) return true;

    // A receiving ring can sit lower or higher than the draggable object. A
    // child should not be penalised by perspective: dropping directly over the
    // visible ring is accepted even when the ray/drag plane makes the object's
    // world-space centre land a little behind it.
    if (pointerEvent) {
      const rect = this.canvas.getBoundingClientRect();
      const projected = worldPosition(target.object).project(this.camera);
      const targetX = rect.left + (projected.x + 1) * .5 * rect.width;
      const targetY = rect.top + (-projected.y + 1) * .5 * rect.height;
      const touchFriendlyRadius = Math.max(44, Math.min(68, rect.width * .055));
      return Math.hypot(pointerEvent.clientX - targetX, pointerEvent.clientY - targetY) <= touchFriendlyRadius;
    }
    return false;
  }

  #variableStart(expected) {
    const range = expected.range || [0, 100];
    const value = this.currentVariableSubject === expected.subject ? this.currentVariable : null;
    return Number.isFinite(value) ? value : Number(expected.start ?? range[0]);
  }

  #returnHome(entity) {
    // Apparatus whose pose the scene controls — a torch on a swinging arm, a
    // dial — must not be yanked back to the pose it happened to be registered
    // in when a student prods it during another step.
    if (entity.options.keepPose) return;
    if (this.physics?.returnHome(entity.id, entity.home.worldPosition, entity.home.worldQuaternion)) {
      this.animateScale(entity.object, entity.home.scale.clone(), .25);
      return;
    }
    this.moveObject(entity.object, entity.home.position.clone(), { duration: .35 });
    this.#animate(entity.object.rotation, { x: entity.home.rotation.x, y: entity.home.rotation.y, z: entity.home.rotation.z }, .35);
    this.animateScale(entity.object, entity.home.scale.clone(), .25);
  }

  moveObject(object, destination, options = {}) {
    if (!options.keepPhysics) this.physics?.complete(object);
    if (options.relativeTo) {
      this.reparent(object, options.relativeTo);
    }
    if (this.instant) {
      object.position.copy(destination);
      if (options.scale) object.scale.setScalar(options.scale);
      return;
    }
    const start = object.position.clone();
    const duration = options.duration || .5;
    const arc = options.arc || 0;
    this.animations.push({
      elapsed: 0, duration,
      update: (t) => {
        const eased = easeInOut(t);
        object.position.lerpVectors(start, destination, eased);
        if (arc) object.position.y += Math.sin(Math.PI * t) * arc;
        if (options.scale) object.scale.setScalar(THREE.MathUtils.lerp(object.scale.x, options.scale, eased));
      },
    });
  }

  animateScale(object, scale, duration = .4) {
    if (this.instant) { object.scale.copy(scale); return; }
    const start = object.scale.clone();
    this.animations.push({ elapsed: 0, duration, update: (t) => object.scale.lerpVectors(start, scale, easeOutBack(t)) });
  }

  tiltPour(object, destination, color, options = {}) {
    if (!object) return;
    const entity = [...this.entities.values()].find((item) => item.object === object);
    if (!entity) return;

    // Pour where the student released, not at an independently authored point.
    // The receiving socket plus its authored pourOffset is the single pose the
    // carry aims at and the animation lands on, so releasing tips the vessel
    // instead of teleporting it.
    const receiver = options.target ? this.targets.get(options.target) : null;
    if (receiver) {
      destination = receiver.object.getWorldPosition(new THREE.Vector3())
        .add(this.#targetApproachOffset(receiver, 'pour'));
    }
    if (!destination) return;

    // The visible stream must originate at the authored lip/socket, never at
    // the container root (which is normally on the base). The endpoint pose is
    // solved from that lip and the authored grip marker, so the cup turns like
    // a student's wrist while its rim stays over the receiver.
    const socket = object.userData.pourSocket || object.userData.spout || object.userData.mouth || object;
    const grip = object.userData.gripPivot || object;
    object.updateWorldMatrix(true, true);
    const startWorldPosition = object.getWorldPosition(new THREE.Vector3());
    const startWorldQuaternion = object.getWorldQuaternion(new THREE.Quaternion());
    const homeWorldPosition = entity.home.worldPosition.clone();
    const homeWorldQuaternion = entity.home.worldQuaternion.clone();
    const worldScale = object.getWorldScale(new THREE.Vector3());
    const socketLocal = object.worldToLocal(socket.getWorldPosition(new THREE.Vector3())).multiply(worldScale);
    const gripLocal = object.worldToLocal(grip.getWorldPosition(new THREE.Vector3())).multiply(worldScale);
    const tiltAngle = options.mode === 'pump' ? 0 : (options.tiltAngle ?? -1.12);
    const tiltQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tiltAngle);
    const endWorldQuaternion = homeWorldQuaternion.clone().multiply(tiltQuaternion);
    const endWorldPosition = destination.clone().sub(socketLocal.clone().applyQuaternion(endWorldQuaternion));
    // Calculate the wrist path as well as the root path. This makes the grip
    // pivot authoritative without introducing a temporary scene parent.
    const startGripWorld = startWorldPosition.clone().add(gripLocal.clone().applyQuaternion(startWorldQuaternion));
    const endGripWorld = endWorldPosition.clone().add(gripLocal.clone().applyQuaternion(endWorldQuaternion));
    const travelDuration = options.travelDuration ?? .44;
    const returnDelay = options.returnDelay ?? 1.15;
    const returnDuration = options.returnDuration ?? .48;
    this.inputLockedUntil = Math.max(this.inputLockedUntil, performance.now() + (returnDelay + returnDuration) * 1000);

    const setWorldPose = (position, quaternion) => {
      this.physics?.setPose(entity.id, position, quaternion, { dynamic: false });
      const parent = object.parent;
      if (parent) {
        parent.updateWorldMatrix(true, false);
        object.position.copy(parent.worldToLocal(position.clone()));
        const parentQuaternion = parent.getWorldQuaternion(new THREE.Quaternion());
        object.quaternion.copy(parentQuaternion.invert().multiply(quaternion));
      } else {
        object.position.copy(position);
        object.quaternion.copy(quaternion);
      }
      object.updateWorldMatrix(true, true);
    };

    const contentParts = [];
    object.traverse((child) => {
      if (child.name === 'liquid' || child.name === 'liquid-surface') {
        contentParts.push({ object: child, scale: child.scale.clone(), opacity: child.material?.opacity ?? 1 });
      }
    });
    const emptyContainer = (fraction = 1) => {
      for (const part of contentParts) {
        if (part.object.name === 'liquid') part.object.scale.y = THREE.MathUtils.lerp(part.scale.y, part.scale.y * .035, fraction);
        if (part.object.material) part.object.material.opacity = THREE.MathUtils.lerp(part.opacity, .055, fraction);
        if (part.object.name === 'liquid-surface') part.object.visible = fraction < .96;
      }
    };

    if (this.instant) {
      emptyContainer(1);
      setWorldPose(homeWorldPosition, homeWorldQuaternion);
      return;
    }

    // The student's manual carry remains fully collidable. Once accepted, the
    // short result animation is controlled and non-colliding so its return arc
    // cannot shove a waiting cup or bottle away from its rack.
    this.physics?.setEnabled(entity.id, false);

    const liveContent = this.#makePourStream(color, options.mode === 'pump' ? 7 : 13);
    let streamProgress = 0;
    this.world.add(liveContent.group);

    this.animations.push({
      elapsed: 0,
      duration: travelDuration,
      update: (t) => {
        const eased = easeInOut(t);
        const quaternion = startWorldQuaternion.clone().slerp(endWorldQuaternion, eased);
        const gripPosition = startGripWorld.clone().lerp(endGripWorld, eased);
        gripPosition.y += Math.sin(Math.PI * t) * .28;
        const rootPosition = gripPosition.sub(gripLocal.clone().applyQuaternion(quaternion));
        setWorldPose(rootPosition, quaternion);
        liveContent.group.visible = false;
      },
    });
    this.#schedule(travelDuration + .08, () => {
      if (options.mode === 'pump') this.pressButton(object.userData.pumpHead);
      liveContent.group.visible = true;
      this.animations.push({
        elapsed: 0,
        duration: .48,
        update: (t) => {
          streamProgress = easeInOut(t);
          emptyContainer(streamProgress);
          const lip = socket.getWorldPosition(new THREE.Vector3());
          liveContent.drops.forEach((drop, index) => {
            const phase = (streamProgress * 1.8 + index / liveContent.drops.length) % 1;
            drop.position.set(lip.x, THREE.MathUtils.lerp(lip.y - .08, destination.y + .03, phase), lip.z);
            drop.scale.setScalar(.7 + Math.sin(phase * Math.PI) * .35);
          });
        },
        complete: () => {
          this.world.remove(liveContent.group);
          disposeObject(liveContent.group);
        },
      });
    });
    this.#schedule(returnDelay, () => {
      const returnStart = object.getWorldPosition(new THREE.Vector3());
      const returnQuaternion = object.getWorldQuaternion(new THREE.Quaternion());
      const returnGripStart = returnStart.clone().add(gripLocal.clone().applyQuaternion(returnQuaternion));
      const homeGripWorld = homeWorldPosition.clone().add(gripLocal.clone().applyQuaternion(homeWorldQuaternion));
      this.animations.push({
        elapsed: 0,
        duration: returnDuration,
        update: (t) => {
          const eased = easeInOut(t);
          const quaternion = returnQuaternion.clone().slerp(homeWorldQuaternion, eased);
          const gripPosition = returnGripStart.clone().lerp(homeGripWorld, eased);
          gripPosition.y += Math.sin(Math.PI * t) * .2;
          const rootPosition = gripPosition.sub(gripLocal.clone().applyQuaternion(quaternion));
          setWorldPose(rootPosition, quaternion);
        },
        complete: () => {
          setWorldPose(homeWorldPosition, homeWorldQuaternion);
          object.scale.copy(entity.home.scale);
          this.physics?.setEnabled(entity.id, true);
          this.inputLockedUntil = 0;
        },
      });
    });
  }

  #makePourStream(color, count = 12) {
    const group = new THREE.Group();
    const drops = [];
    for (let index = 0; index < count; index += 1) {
      const drop = sphere(.045 + index % 3 * .009, color, {
        transparent: true, opacity: .86, roughness: .08,
        emissive: color, emissiveIntensity: .12, castShadow: false, depthWrite: false,
      });
      group.add(drop);
      drops.push(drop);
    }
    group.visible = false;
    return { group, drops };
  }

  pressButton(object) {
    if (this.instant || !object) return;
    const start = object.scale.clone();
    this.animateScale(object, start.clone().multiplyScalar(.92), .1);
    this.#schedule(.13, () => this.animateScale(object, start, .18));
  }

  addConnection(sourceId, targetId, color = palette.coral) {
    if (this.connections.some((wire) => wire.userData.key === `${sourceId}:${targetId}`)) return;
    const source = this.entities.get(sourceId)?.object;
    const target = this.entities.get(targetId)?.object;
    if (!source || !target) return;
    const wire = makeWire(worldPosition(source), worldPosition(target), color);
    wire.userData.key = `${sourceId}:${targetId}`;
    this.world.add(wire);
    this.connections.push(wire);
  }

  sparkle(position, color = palette.yellow, count = 12) {
    if (this.settings.reduceMotion) return;
    this.#spawnParticles(position, color, count, (index) => new THREE.Vector3((Math.random()-.5)*2.4, .9+Math.random()*1.8, (Math.random()-.5)*2.4));
  }

  splash(position, color = palette.blue) {
    if (this.settings.reduceMotion) return;
    this.#spawnParticles(position, color, 16, () => new THREE.Vector3((Math.random()-.5)*1.5, 1.7+Math.random()*1.5, (Math.random()-.5)*1.5));
  }

  drip(position, color) {
    if (this.settings.reduceMotion) return;
    this.#spawnParticles(position, color, 16, () => new THREE.Vector3((Math.random()-.5)*.35, -1.4-Math.random(), (Math.random()-.5)*.35), .8);
  }

  #spawnParticles(position, color, count, velocityFactory, life = 1.1) {
    const amount = this.#quality() === 'low' ? Math.ceil(count * .55) : count;
    for (let i = 0; i < amount; i += 1) {
      const mesh = sphere(.045 + Math.random()*.045, color, { emissive: color, emissiveIntensity: .8, castShadow: false, roughness: .2 });
      mesh.position.copy(position);
      this.world.add(mesh);
      this.particles.push({ mesh, velocity: velocityFactory(i), age: 0, life, gravity: 2.2 });
    }
  }

  pulseObject(object, color) {
    if (!object) return;
    const material = this.#firstMaterial(object);
    if (!material) return;
    const original = material.emissive?.clone?.() || new THREE.Color(0);
    material.emissive?.setHex(color);
    material.emissiveIntensity = .9;
    this.#schedule(.65, () => { material.emissive?.copy(original); material.emissiveIntensity = 0; });
  }

  fadeObject(object, opacity, duration = .5) {
    object.traverse((child) => {
      if (!child.material) return;
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        material.transparent = true;
        const start = material.opacity;
        this.#animate(material, { opacity }, duration, 0, start);
      });
    });
  }

  reparent(object, parent) {
    if (!object || !parent || object.parent === parent) return;
    object.updateWorldMatrix(true, false);
    parent.updateWorldMatrix(true, false);
    parent.attach(object);
  }

  setEnvironment(name) {
    if (name !== 'space') return;
    this.scene.background.set(0x071522);
    this.scene.fog.color.set(0x071522);
    for (let i=0;i<80;i+=1) {
      const star=sphere(.012+(i%3)*.008,0xffffff,{emissive:0xffffff,emissiveIntensity:1.2,castShadow:false});
      const angle=Math.random()*Math.PI*2;const radius=8+Math.random()*18;star.position.set(Math.cos(angle)*radius,Math.random()*13-2,Math.sin(angle)*radius-5);this.world.add(star);
    }
  }

  #firstMaterial(object) {
    let material = null;
    object.traverse((child) => { if (!material && child.material) material = Array.isArray(child.material) ? child.material[0] : child.material; });
    return material;
  }

  #animate(object, target, duration, delay = 0, opacityStart = null) {
    if (this.instant) { Object.assign(object, target); return; }
    const start = {};
    Object.keys(target).forEach((key) => { start[key] = opacityStart ?? object[key]; });
    this.animations.push({ elapsed: -delay, duration, update: (t) => { const e=easeInOut(t);Object.keys(target).forEach((key)=>{object[key]=THREE.MathUtils.lerp(start[key],target[key],e);}); } });
  }

  #schedule(delay, callback) {
    if (this.instant) { callback(); return; }
    this.animations.push({ elapsed: -delay, duration: .001, update: () => {}, complete: callback });
  }

  setSettings(settings) {
    this.settings = settings;
    document.documentElement.classList.toggle('reduce-motion', settings.reduceMotion);
    document.documentElement.classList.toggle('high-contrast', settings.highContrast);
    if (this.renderer) {
      const quality = this.#quality();
      this.renderer.shadowMap.enabled = quality !== 'low';
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'low' ? 1 : 1.75));
      this.resize();
    }
    this.#updateSelectionHelper();
  }

  rotateCamera(direction) {
    if (!this.controls.enabled) return;
    const angle = direction * .18;
    const offset = this.camera.position.clone().sub(this.controls.target).applyAxisAngle(new THREE.Vector3(0,1,0), angle);
    const target = this.controls.target.clone().add(offset);
    this.moveCamera(target, this.controls.target.clone(), .35);
  }

  resetCamera(animate = true) {
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const scale = this.mode === 'lab' && aspect < .9 ? Math.min(2.65, 1.1 / Math.max(.38, aspect)) : 1;
    const target = this.cameraPreset ? new THREE.Vector3(...this.cameraPreset.target) : DEFAULT_TARGET.clone();
    const authoredPosition = this.cameraPreset ? new THREE.Vector3(...this.cameraPreset.position) : DEFAULT_CAMERA.clone();
    const position = target.clone().add(authoredPosition.sub(target).multiplyScalar(scale));
    this.controls.maxDistance = scale > 1 ? 38 : 15.5;
    if (animate && !this.settings.reduceMotion) this.moveCamera(position, target, .45);
    else { this.camera.position.copy(position); this.controls.target.copy(target); this.controls.update(); }
  }

  moveCamera(position, target, duration = .45) {
    const startPosition=this.camera.position.clone();const startTarget=this.controls.target.clone();
    this.animations.push({elapsed:0,duration,update:(t)=>{const e=easeInOut(t);this.camera.position.lerpVectors(startPosition,position,e);this.controls.target.lerpVectors(startTarget,target,e);}});
  }

  resize() {
    if (!this.renderer) return;
    const width = this.canvas.clientWidth || innerWidth;
    const height = this.canvas.clientHeight || innerHeight;
    const quality = this.#quality();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality === 'low' ? 1 : 1.75));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    const aspectBucket = this.camera.aspect < .9 ? 'portrait' : 'wide';
    if (this.mode === 'lab' && this.aspectBucket && this.aspectBucket !== aspectBucket) this.resetCamera(false);
    this.aspectBucket = aspectBucket;
    this.#updateLabelScale();
  }

  #updateLabelScale() {
    if (!this.experimentRoot) return;
    const aspect = this.camera.aspect || 1;
    // Portrait framing pulls the camera back to preserve the whole bench.
    // Counter-scale only educational sprites so Chinese captions retain a
    // readable screen height; apparatus and collision geometry stay unchanged.
    const isPortrait = aspect < .9;
    const multiplier = isPortrait ? THREE.MathUtils.clamp(.9 / aspect, 1.18, 1.72) : 1;
    this.experimentRoot.traverse((object) => {
      if (!object.userData.educationalLabel || !object.userData.authoredScale) return;
      const sceneDensityFactor = isPortrait ? (object.userData.portraitMultiplier ?? 1) : 1;
      object.scale.copy(object.userData.authoredScale).multiplyScalar(multiplier * sceneDensityFactor);
    });
  }

  getScreenPoint(id, { target = false } = {}) {
    const record = target ? this.targets.get(id) : this.entities.get(id);
    if (!record?.object) return null;
    const rect = this.canvas.getBoundingClientRect();
    let anchor = worldPosition(record.object);
    if (!target) {
      const bounds = new THREE.Box3().setFromObject(record.object);
      if (!bounds.isEmpty()) anchor = bounds.getCenter(new THREE.Vector3());
      // Object origins and even aggregate bounds can fall in empty space (the
      // bridge between goggle lenses, a tuning-fork gap, a torus, ...). Return
      // a comfortably interior anchor that is proven to ray-hit this entity,
      // so automated and switch-access input exercise the same visible surface
      // as a student rather than a hollow group's mathematical centre.
      const hits = [];
      // The Blender goggles have a wide hollow bridge; other apparatus keeps
      // its authored triangle anchor so drag paths remain unchanged.
      if (id === 'goggles' && !bounds.isEmpty()) {
        const ndcCorners = [];
        for (const x of [bounds.min.x, bounds.max.x]) {
          for (const y of [bounds.min.y, bounds.max.y]) {
            for (const z of [bounds.min.z, bounds.max.z]) {
              ndcCorners.push(new THREE.Vector3(x, y, z).project(this.camera));
            }
          }
        }
        const minX = Math.max(-1, Math.min(...ndcCorners.map((point) => point.x)));
        const maxX = Math.min(1, Math.max(...ndcCorners.map((point) => point.x)));
        const minY = Math.max(-1, Math.min(...ndcCorners.map((point) => point.y)));
        const maxY = Math.min(1, Math.max(...ndcCorners.map((point) => point.y)));
        const grid = 17;
        for (let row = 0; row < grid; row += 1) {
          for (let column = 0; column < grid; column += 1) {
            const x = THREE.MathUtils.lerp(minX, maxX, (column + .5) / grid);
            const y = THREE.MathUtils.lerp(minY, maxY, (row + .5) / grid);
            this.pointer.set(x, y);
            this.raycaster.setFromCamera(this.pointer, this.camera);
            const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
            if (hit?.object?.userData?.entityId === id) hits.push({ row, column, point: hit.point.clone() });
          }
        }
      }
      if (hits.length) {
        // Select the sample with the most same-entity neighbours. This stays
        // clear of thin silhouettes and remains reliable after small physics
        // settling movements between projection and pointerdown.
        hits.sort((a, b) => {
          const neighbours = (sample) => hits.reduce((count, other) => count + (
            Math.abs(sample.row - other.row) <= 1 && Math.abs(sample.column - other.column) <= 1 ? 1 : 0
          ), 0);
          return neighbours(b) - neighbours(a);
        });
        anchor = hits[0].point;
      } else {
        const candidates = [anchor];
      record.object.updateWorldMatrix(true, true);
      record.object.traverse((child) => {
        if (!child.isMesh || !child.visible || !child.geometry?.attributes?.position) return;
        const position = child.geometry.attributes.position;
        const index = child.geometry.index;
        const triangleCount = Math.min(8, Math.floor((index?.count || position.count) / 3));
        for (let triangle = 0; triangle < triangleCount; triangle += 1) {
          const point = new THREE.Vector3();
          for (let corner = 0; corner < 3; corner += 1) {
            const vertex = index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;
            point.x += position.getX(vertex);
            point.y += position.getY(vertex);
            point.z += position.getZ(vertex);
          }
          candidates.push(child.localToWorld(point.multiplyScalar(1 / 3)));
        }
      });
      for (const candidate of candidates) {
        const projectedCandidate = candidate.clone().project(this.camera);
        if (Math.abs(projectedCandidate.x) > 1 || Math.abs(projectedCandidate.y) > 1) continue;
        this.pointer.set(projectedCandidate.x, projectedCandidate.y);
        this.raycaster.setFromCamera(this.pointer, this.camera);
        const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
        if (hit?.object?.userData?.entityId === id) {
          anchor = candidate;
          break;
        }
      }
      }
    }
    const projected = anchor.project(this.camera);
    return {
      x: rect.left + (projected.x + 1) * .5 * rect.width,
      y: rect.top + (-projected.y + 1) * .5 * rect.height,
    };
  }

  getScreenBounds(id) {
    const object = this.entities.get(id)?.object;
    if (!object) return null;
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) return null;
    const rect = this.canvas.getBoundingClientRect();
    const points = [];
    for (const x of [bounds.min.x, bounds.max.x]) {
      for (const y of [bounds.min.y, bounds.max.y]) {
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(this.camera);
          points.push({
            x: rect.left + (projected.x + 1) * .5 * rect.width,
            y: rect.top + (-projected.y + 1) * .5 * rect.height,
          });
        }
      }
    }
    const left = Math.min(...points.map((point) => point.x));
    const right = Math.max(...points.map((point) => point.x));
    const top = Math.min(...points.map((point) => point.y));
    const bottom = Math.max(...points.map((point) => point.y));
    return { left, right, top, bottom, width: right - left, height: bottom - top };
  }

  getDebugStats() {
    return {
      mode: this.mode,
      worldChildren: this.world.children.length,
      environmentChildren: this.environment.children.length,
      background: `#${this.scene.background.getHexString()}`,
      physics: this.physics?.getStats?.() || null,
      assets: getAssetLibraryStats(),
      science: this.sceneController?.getState?.() || null,
      lastInteraction: this.lastInteraction || null,
    };
  }

  getPhysicsPose(id) {
    return this.physics?.getPose(id) || null;
  }

  getEntityHomePose(id) {
    const home = this.entities.get(id)?.home;
    if (!home) return null;
    return {
      position: { x: home.worldPosition.x, y: home.worldPosition.y, z: home.worldPosition.z },
      rotation: {
        x: home.worldQuaternion.x,
        y: home.worldQuaternion.y,
        z: home.worldQuaternion.z,
        w: home.worldQuaternion.w,
      },
    };
  }

  getTargetWorldPose(id) {
    const object = this.targets.get(id)?.object;
    if (!object) return null;
    const position = object.getWorldPosition(new THREE.Vector3());
    const quaternion = object.getWorldQuaternion(new THREE.Quaternion());
    return {
      position: { x: position.x, y: position.y, z: position.z },
      rotation: { x: quaternion.x, y: quaternion.y, z: quaternion.z, w: quaternion.w },
    };
  }

  getPourDebug(id) {
    const entity = this.entities.get(id);
    if (!entity) return null;
    const object = entity.object;
    const socket = object.userData.pourSocket || object.userData.spout || object.userData.mouth;
    const grip = object.userData.gripPivot || null;
    const pose = {
      position: object.getWorldPosition(new THREE.Vector3()),
      quaternion: object.getWorldQuaternion(new THREE.Quaternion()),
    };
    return {
      entity: id,
      position: { x: pose.position.x, y: pose.position.y, z: pose.position.z },
      quaternion: { x: pose.quaternion.x, y: pose.quaternion.y, z: pose.quaternion.z, w: pose.quaternion.w },
      socket: socket ? (() => {
        const value = socket.getWorldPosition(new THREE.Vector3());
        return { x: value.x, y: value.y, z: value.z };
      })() : null,
      grip: grip ? (() => {
        const value = grip.getWorldPosition(new THREE.Vector3());
        return { x: value.x, y: value.y, z: value.z };
      })() : null,
      parent: object.parent?.uuid || null,
      home: this.getEntityHomePose(id),
    };
  }

  getPhysicsDebug(id, targetId = null) {
    return {
      pose: this.physics?.getPose(id) || null,
      contacts: this.physics?.getContacts(id) || [],
      socket: targetId ? this.physics?.getSocketMetrics(id, targetId) || null : null,
    };
  }

  /** Panning stays within arm's reach of the bench, never past it. */
  #clampPan() {
    const home = this.cameraPreset?.target || [DEFAULT_TARGET.x, DEFAULT_TARGET.y, DEFAULT_TARGET.z];
    const target = this.controls.target;
    const before = target.clone();
    target.x = THREE.MathUtils.clamp(target.x, home[0] - 3.4, home[0] + 3.4);
    target.y = THREE.MathUtils.clamp(target.y, home[1] - 1.4, home[1] + 2.4);
    target.z = THREE.MathUtils.clamp(target.z, home[2] - 2.6, home[2] + 2.6);
    if (!before.equals(target)) this.camera.position.add(target.clone().sub(before));
  }

  #frame(timeMs) {
    if (this.destroyed || this.paused) return;
    const dt = Math.min(.05, (timeMs - this.lastFrame) / 1000 || .016);
    this.lastFrame = timeMs;
    if (this.#quality() === 'low') {
      this.frameAccumulator += dt;
      if (this.frameAccumulator < 1/30) return;
      this.frameAccumulator = 0;
    }
    this.elapsed += dt;
    this.controls.update();
    this.#clampPan();
    if (this.mode === 'lab') this.physics?.step(dt);
    this.#updateAnimations(dt);
    this.#updateParticles(dt);
    if (this.selectionHelper) {
      const entity=this.entities.get(this.currentStep?.action.subject);
      if(entity){this.selectionHelper.box.setFromObject(entity.object);this.selectionHelper.material.opacity=.55+Math.sin(this.elapsed*4)*.28;}
    }
    if (!this.settings.reduceMotion && this.mode === 'catalog' && this.catalogObjects) {
      const { island, atom, robot } = this.catalogObjects;
      island.position.y = .2 + Math.sin(this.elapsed*.8)*.08;
      atom.rotation.y = this.elapsed*.38;
      robot.rotation.y = Math.sin(this.elapsed*.6)*.09;
      robot.userData.tip.material.emissiveIntensity = .7 + Math.sin(this.elapsed*2)*.35;
    }
    if (!this.settings.reduceMotion) this.environment.children.forEach((child) => { if (child.userData.floatOffset != null) child.position.y += Math.sin(this.elapsed*.55+child.userData.floatOffset)*.0008; });
    this.sceneController?.update?.(this.elapsed, dt);
    this.renderer.render(this.scene, this.camera);
  }

  #updateAnimations(dt) {
    // A completion callback may enqueue its next animation (for example the
    // return stroke after pouring). Iterating a detached batch prevents that
    // newly queued work from being overwritten by Array#filter's assignment.
    const active = this.animations;
    this.animations = [];
    active.forEach((animation) => {
      animation.elapsed += dt;
      if (animation.elapsed < 0) {
        this.animations.push(animation);
        return;
      }
      const t = Math.min(1, animation.elapsed / animation.duration);
      animation.update(t);
      if (t >= 1) animation.complete?.();
      else this.animations.push(animation);
    });
  }

  #updateParticles(dt) {
    this.particles = this.particles.filter((particle) => {
      particle.age += dt;
      particle.velocity.y -= particle.gravity * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      const left = 1 - particle.age / particle.life;
      particle.mesh.scale.setScalar(Math.max(.01, left));
      if (particle.age >= particle.life) { this.world.remove(particle.mesh); disposeObject(particle.mesh); return false; }
      return true;
    });
  }

  #clearWorld() {
    this.customAction = null;
    this.customPreview = null;
    this.sceneController = null;
    this.currentStep = null;
    this.currentVariable = null;
    this.currentVariableSubject = null;
    this.dragState = null;
    this.inputLockedUntil = 0;
    this.animations = [];
    this.particles = [];
    this.physics?.reset();
    this.entities.clear(); this.targets.clear(); this.pickables = []; this.connections = [];
    while (this.world.children.length) {
      const child = this.world.children[this.world.children.length - 1];
      this.world.remove(child);
      disposeObject(child);
    }
    if (this.selectionHelper) { this.scene.remove(this.selectionHelper); this.selectionHelper = null; }
    this.scene.background.set(0x0b5360);
    this.scene.fog.color.set(0x0b5360);
  }

  dispose() {
    this.destroyed = true;
    window.removeEventListener('resize', this.resizeHandler);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.renderer?.setAnimationLoop(null);
    this.controls?.dispose();
    this.#clearWorld();
    disposeObject(this.environment);
    this.physics?.dispose();
    this.renderer?.dispose();
  }
}

function easeInOut(t) { return t < .5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2; }
function easeOutBack(t) { const c1=1.35,c3=c1+1;return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }
