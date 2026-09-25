import * as THREE from 'three';
import backboardArtworkUrl from './assets/coin-pusher-backboard-desktop-v2.webp';
import compactBackboardArtworkUrl from './assets/coin-pusher-backboard-mobile-v2.webp';
import brushedMetalTextureUrl from './assets/coin-pusher-brushed-metal-v1.webp';
import mintedCoinFaceTextureUrl from './assets/coin-pusher-minted-paw-desktop-v2.webp';
import compactMintedCoinFaceTextureUrl from './assets/coin-pusher-minted-paw-mobile-v2.webp';
import { coinPusherTravelProgress } from './CoinPusherFeedback';
import { createCoinPusherStarterLayout } from './CoinPusherLayout';
import type { CoinPusherDropBeat, CoinPusherModel, CoinPusherModelSnapshot } from './CoinPusherModel';
import {
  MAIN_DECK_BACK_Z,
  MAIN_DECK_FRONT_Z,
  PUSHER_FORWARD_Z,
  PUSHER_HOME_Z,
  PUSHER_HALF_DEPTH,
  PUSHER_LENGTH,
  PUSHER_LIP_LOCAL_Z,
  PUSHER_SLOT_BOTTOM_Y,
  PUSHER_SLOT_HALF_WIDTH,
  PUSHER_SLOT_TOP_Y,
  PUSHER_WIDTH,
  PAYOUT_TRAY_CATCHER_MARGIN,
  PAYOUT_TRAY_CENTER_Z,
  PAYOUT_TRAY_FLOOR_CENTER_Y,
  PAYOUT_TRAY_FLOOR_HALF_HEIGHT,
  PAYOUT_TRAY_FLOOR_HALF_DEPTH,
  PAYOUT_TRAY_FLOOR_TOP_Y,
  PAYOUT_TRAY_ENTRY_CATCH_OVERLAP,
  PAYOUT_TRAY_FRONT_WALL_CENTER_Z,
  PAYOUT_TRAY_WALL_HALF_DEPTH,
  PAYOUT_TRAY_WALL_TOP_Y,
  REAR_CASE_BACK_Z,
  REAR_CASE_BOTTOM_Y,
  REAR_CASE_CENTER_Z,
  REAR_CASE_DEPTH,
  REAR_CASE_FRONT_Z,
  REAR_CASE_TOP_Y,
  REAR_DECK_CENTER_Z,
  REAR_DECK_HALF_DEPTH,
} from './CoinPusherDimensions';

const MAX_COIN_INSTANCES = 512;
const MAX_DROP_X = 2.32;
const PUSHER_Y = .02;
const PUSHER_TOP_Y = .04;
const REDUCED_ARTWORK_VIEWPORT_WIDTH = 1280;
// Phones and tablets use compact shading as well as compact textures; transmission is not
// worth its extra render passes and shader variants at these viewport sizes.
const COMPACT_VIEWPORT_WIDTH = REDUCED_ARTWORK_VIEWPORT_WIDTH;
let nextModelSessionId = 1;
const modelSessionIds = new WeakMap<CoinPusherModel, number>();

function modelSessionId(model: CoinPusherModel) {
  let id = modelSessionIds.get(model);
  if (id === undefined) {
    id = nextModelSessionId++;
    modelSessionIds.set(model, id);
  }
  return id;
}

function isCompactViewport(root: HTMLElement) {
  return (root.getBoundingClientRect().width || window.innerWidth) <= COMPACT_VIEWPORT_WIDTH;
}

function usesReducedArtwork(root: HTMLElement) {
  return (root.getBoundingClientRect().width || window.innerWidth) <= REDUCED_ARTWORK_VIEWPORT_WIDTH;
}

type SwipeStart = { pointerId: number; x: number; y: number; worldX: number };
type CoinPusherRewardOrigin = { x: number; y: number };
type CoinPusherLandingFeedback = CoinPusherRewardOrigin & { pusherBeat: CoinPusherDropBeat };
type WebGLAvailabilityReason = 'context-lost' | 'restored';
type WebGLAvailabilityCallback = (available: boolean, reason?: WebGLAvailabilityReason) => void;
type CoinPayoutCallback = (count: number, origins: CoinPusherRewardOrigin[]) => void;
type CoinImpactCallback = (count: number, landings: CoinPusherLandingFeedback[]) => void;
type PusherStrokeCallback = (direction: 'forward' | 'return') => void;
type ImpactBurst = {
  points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  starts: Float32Array;
  velocities: Float32Array;
  startedAt: number;
  duration: number;
};

/** Transparent Three.js cabinet rendered over the student's selected room artwork. */
export class CoinPusherScene {
  static async create(
    root: HTMLElement,
    onSwipe: (worldX: number) => void,
    onCoinsFell: CoinPayoutCallback,
    onAvailability: WebGLAvailabilityCallback = () => undefined,
    onCoinImpact: CoinImpactCallback = () => undefined,
    onPusherStroke: PusherStrokeCallback = () => undefined,
    existingModel?: CoinPusherModel,
    onVisualPreviewReady: () => void = () => undefined,
    savedSnapshot?: CoinPusherModelSnapshot,
  ) {
    const notifyAvailability: WebGLAvailabilityCallback = (available, reason) => {
      try { onAvailability(available, reason); }
      catch (error) { console.warn('[coin-pusher] availability callback failed', error); }
    };
    const notifyCoinImpact: CoinImpactCallback = (count, landings) => {
      try { onCoinImpact(count, landings); }
      catch (error) { console.warn('[coin-pusher] coin impact callback failed', error); }
    };
    const notifyPusherStroke: PusherStrokeCallback = (direction) => {
      try { onPusherStroke(direction); }
      catch (error) { console.warn('[coin-pusher] pusher audio callback failed', error); }
    };
    const notifyVisualPreviewReady = () => {
      try { onVisualPreviewReady(); }
      catch (error) { console.warn('[coin-pusher] visual preview callback failed', error); }
    };
    let renderer: THREE.WebGLRenderer | undefined;
    let model: CoinPusherModel | undefined;
    let view: CoinPusherScene | undefined;
    let brushedMetalTexture: THREE.Texture | undefined;
    let backboardTexture: THREE.Texture | undefined;
    let mintedCoinFaceTexture: THREE.Texture | undefined;
    try {
      const compactViewport = isCompactViewport(root);
      const reducedArtwork = usesReducedArtwork(root);
      // Establish that WebGL is usable before initializing Rapier or allocating a physics
      // world. On browsers without a context, no native physics resources should be created.
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setSize(1, 1, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const isChinese = document.documentElement.lang.toLowerCase().startsWith('zh');
      renderer.domElement.setAttribute('aria-label', isChinese
        ? '3D 推銀仔機。請在想投幣的位置向下滑動。'
        : '3D coin pusher. Swipe down from your chosen spot to drop a coin.');
      renderer.domElement.setAttribute('role', 'img');
      renderer.domElement.className = 'coin-pusher-canvas';
      renderer.domElement.style.touchAction = 'none';

      // Start optional artwork and Rapier together only after WebGL is confirmed. These assets
      // are independent; serial awaits made mobile latency add up despite all requests being local.
      const textureLoader = new THREE.TextureLoader();
      const brushedMetalTask = textureLoader.loadAsync(brushedMetalTextureUrl).catch((error) => {
        console.warn('[coin-pusher] brushed steel texture unavailable; using material fallback', error);
        return undefined;
      });
      const backboardUrl = reducedArtwork ? compactBackboardArtworkUrl : backboardArtworkUrl;
      const mintedCoinFaceUrl = reducedArtwork ? compactMintedCoinFaceTextureUrl : mintedCoinFaceTextureUrl;
      const backboardTask = textureLoader.loadAsync(backboardUrl).catch((error) => {
        console.warn('[coin-pusher] backboard artwork unavailable; using dark enamel fallback', error);
        return undefined;
      });
      const mintedCoinTask = textureLoader.loadAsync(mintedCoinFaceUrl).catch((error) => {
        console.warn('[coin-pusher] minted coin artwork unavailable; using procedural face fallback', error);
        return undefined;
      });
      const modelTask = existingModel
        ? Promise.resolve(undefined)
        : import('./CoinPusherModel').then(
          (module) => ({ module }),
          (error: unknown) => ({ error }),
        );
      if (existingModel) model = existingModel;
      // Build a complete procedural cabinet immediately. Optional artwork keeps downloading in
      // parallel, so a slow image request cannot hold the first useful 3D preview behind a veil.
      view = new CoinPusherScene(root, compactViewport, onSwipe, onCoinsFell, notifyAvailability, notifyCoinImpact, notifyPusherStroke, renderer, model);
      if (!model) {
        // Start compiling and warming the static cabinet while Rapier's WASM is still loading.
        // Render the deterministic starter pile behind a compact loading badge as soon as the
        // visual scene is ready; the full-screen veil still blocks input until physics is live.
        const graphicsWarmup = view.prepareSceneGraphics().then((ready) => {
          if (ready) notifyVisualPreviewReady();
        });
        const [modelResult] = await Promise.all([modelTask, graphicsWarmup]);
        if (!modelResult || 'error' in modelResult) {
          throw modelResult?.error ?? new Error('Coin-pusher physics module did not load');
        }
        const { CoinPusherModel: CoinPusherModelRuntime } = modelResult.module;
        model = savedSnapshot
          ? CoinPusherModelRuntime.restoreSnapshot(savedSnapshot)
          : new CoinPusherModelRuntime();
        view.attachModel(model);
      }
      const textures = await Promise.all([brushedMetalTask, backboardTask, mintedCoinTask]);
      [brushedMetalTexture, backboardTexture, mintedCoinFaceTexture] = textures;
      if (brushedMetalTexture) {
        brushedMetalTexture.colorSpace = THREE.SRGBColorSpace;
        brushedMetalTexture.wrapS = THREE.RepeatWrapping;
        brushedMetalTexture.wrapT = THREE.RepeatWrapping;
        brushedMetalTexture.repeat.set(4, 4);
        brushedMetalTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      }
      if (backboardTexture) {
        backboardTexture.colorSpace = THREE.SRGBColorSpace;
        backboardTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      }
      if (mintedCoinFaceTexture) {
        mintedCoinFaceTexture.colorSpace = THREE.SRGBColorSpace;
        mintedCoinFaceTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      }
      view.applyArtwork(brushedMetalTexture, backboardTexture, mintedCoinFaceTexture);
      await view.prepareRenderer();
      return view;
    } catch (error) {
      // The constructor may fail part-way through scene creation; its local catch removes
      // listeners and scene assets, while this factory owns the native resources themselves.
      if (view) view.destroy(Boolean(existingModel));
      else {
        try { if (!existingModel) model?.destroy(); }
        catch (cleanupError) { console.warn('[coin-pusher] physics cleanup failed', cleanupError); }
        brushedMetalTexture?.dispose();
        backboardTexture?.dispose();
        mintedCoinFaceTexture?.dispose();
        try { renderer?.dispose(); }
        catch (cleanupError) { console.warn('[coin-pusher] renderer cleanup failed', cleanupError); }
        if (renderer && root.contains(renderer.domElement)) root.replaceChildren();
      }
      notifyAvailability(false);
      throw error;
    }
  }

  private simulation?: CoinPusherModel;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(42, 1, .1, 80);

  private readonly root: HTMLElement;
  private readonly compactMaterials: boolean;
  private readonly renderRoot = new THREE.Group();
  private readonly onSwipe: (worldX: number) => void;
  private readonly onCoinsFell: CoinPayoutCallback;
  private readonly onAvailability: WebGLAvailabilityCallback;
  private readonly onCoinImpact: CoinImpactCallback;
  private readonly onPusherStroke: PusherStrokeCallback;
  private resizeObserver?: ResizeObserver;
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly pusher = new THREE.Group();
  private readonly pusherGlowHomeColor = new THREE.Color(0x1a7168);
  private readonly pusherGlowFrontColor = new THREE.Color(0xa85b1b);
  private readonly pusherGlowColor = new THREE.Color();
  private pusherGlowMaterial?: THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial;
  private lastPusherGlowProgress = -1;
  private readonly coinBody: THREE.InstancedMesh;
  private readonly coinRings: THREE.InstancedMesh;
  private readonly coinInnerRings: THREE.InstancedMesh;
  private readonly coinStamps: THREE.InstancedMesh;
  private readonly coinPaws: THREE.InstancedMesh;
  private readonly previewCoinLayout = createCoinPusherStarterLayout();
  private environmentTexture?: THREE.CanvasTexture;
  private brushedMetalTexture?: THREE.Texture;
  private backboardTexture?: THREE.Texture;
  private mintedCoinFaceTexture?: THREE.Texture;
  private readonly brushedMetalMaterials: THREE.MeshStandardMaterial[] = [];
  private coinStampMaterial?: THREE.MeshStandardMaterial;
  private readonly instance = new THREE.Object3D();
  private readonly coinInstanceIds: number[] = [];
  private readonly coinTint = new THREE.Color();
  private readonly bodyRotation = new THREE.Quaternion();
  private readonly faceSpin = new THREE.Quaternion();
  private readonly faceSpinAxis = new THREE.Vector3(0, 1, 0);
  private readonly faceOffset = new THREE.Vector3();
  private readonly pointerNdc = new THREE.Vector2();
  private readonly pointerHit = new THREE.Vector3();
  private readonly impactBursts: ImpactBurst[] = [];
  private readonly previousVerticalVelocity = new Map<number, number>();
  private readonly impactSparked = new Set<number>();
  private readonly aimGuide = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  private readonly aimGuideLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  private readonly aimMarker = document.createElement('div');
  private readonly aimBeat = document.createElement('span');
  private swipeStart?: SwipeStart;
  private lastFrame = 0;
  private reducedMotion = false;
  private rendererPrepared = false;
  private destroyed = false;

  private readonly onVisibilityChange = () => {
    if (document.hidden) this.renderer.setAnimationLoop(null);
    else if (this.rendererPrepared) { this.lastFrame = 0; this.renderer.setAnimationLoop(this.animate); }
  };
  private readonly onContextLost = (event: Event) => {
    event.preventDefault();
    // A swipe interrupted by graphics loss is a cancelled gesture, never a delayed coin charge.
    this.swipeStart = undefined;
    this.hideAimMarker();
    this.renderer.setAnimationLoop(null); this.rendererPrepared = false; this.root.dataset.webgl = 'lost';
    this.onAvailability(false, 'context-lost');
  };
  private readonly onContextRestored = () => {
    delete this.root.dataset.webgl; this.resize();
    if (!this.simulation) return;
    void this.prepareRenderer('restored').catch((error) => {
      console.warn('[coin-pusher] shader warmup failed after context restoration', error);
      if (this.destroyed || this.root.dataset.webgl === 'lost') return;
      this.rendererPrepared = true;
      if (!document.hidden) { this.lastFrame = 0; this.renderer.setAnimationLoop(this.animate); }
      this.onAvailability(true, 'restored');
    });
  };
  private readonly onPointerDown = (event: PointerEvent) => {
    if (!this.simulation) return;
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    if ((event.pointerType === 'touch' && !event.isPrimary) || this.swipeStart) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const worldX = this.pointerXToWorld(event.clientX, rect);
    this.swipeStart = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, worldX };
    this.updateAimMarkerAtWorldX(worldX);
    try { this.renderer.domElement.setPointerCapture(event.pointerId); } catch { /* Safari may decline capture after a context change. */ }
  };
  private readonly onPointerMove = (event: PointerEvent) => {
    if (!this.simulation) return;
    if (this.swipeStart && this.swipeStart.pointerId !== event.pointerId) return;
    // A vertical swipe drops in its starting lane. Keep the preview locked to that lane even
    // when a thumb drifts sideways, so the visual promise matches the actual drop calculation.
    if (this.swipeStart) this.updateAimMarkerAtWorldX(this.swipeStart.worldX);
    else this.updateAimMarker(event.clientX);
  };
  private readonly onPointerUp = (event: PointerEvent) => {
    const start = this.swipeStart;
    if (!start || start.pointerId !== event.pointerId) return;
    this.swipeStart = undefined;
    try { if (this.renderer.domElement.hasPointerCapture(event.pointerId)) this.renderer.domElement.releasePointerCapture(event.pointerId); } catch { /* Pointer may already have been cancelled. */ }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    this.hideAimMarker();
    if (dy >= 44 && dy > Math.abs(dx) * 1.12) {
      this.onSwipe(start.worldX);
    }
  };
  private readonly onPointerCancel = (event: PointerEvent) => {
    if (this.swipeStart && this.swipeStart.pointerId !== event.pointerId) return;
    this.swipeStart = undefined;
    this.hideAimMarker();
  };
  private readonly onLostPointerCapture = (event: PointerEvent) => {
    if (!this.swipeStart || this.swipeStart.pointerId !== event.pointerId) return;
    this.swipeStart = undefined;
    this.hideAimMarker();
  };
  private readonly onPointerLeave = () => { if (!this.swipeStart) this.hideAimMarker(); };

  private constructor(
    root: HTMLElement,
    compactMaterials: boolean,
    onSwipe: (worldX: number) => void,
    onCoinsFell: CoinPayoutCallback,
    onAvailability: WebGLAvailabilityCallback,
    onCoinImpact: CoinImpactCallback,
    onPusherStroke: PusherStrokeCallback,
    renderer: THREE.WebGLRenderer,
    model: CoinPusherModel | undefined,
    brushedMetalTexture?: THREE.Texture,
    backboardTexture?: THREE.Texture,
    mintedCoinFaceTexture?: THREE.Texture,
  ) {
    this.root = root;
    this.root.dataset.artworkReady = 'false';
    this.compactMaterials = compactMaterials;
    this.onSwipe = onSwipe;
    this.onCoinsFell = onCoinsFell;
    this.onAvailability = onAvailability;
    this.onCoinImpact = onCoinImpact;
    this.onPusherStroke = onPusherStroke;
    this.simulation = model;
    if (model) root.dataset.physicsSession = String(modelSessionId(model));
    this.renderer = renderer;
    this.brushedMetalTexture = brushedMetalTexture;
    this.backboardTexture = backboardTexture;
    this.mintedCoinFaceTexture = mintedCoinFaceTexture;
    this.reducedMotion = this.isReducedMotionRequested();
    model?.setReducedMotion(this.reducedMotion);
    try {
    this.renderer.domElement.addEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.addEventListener('pointercancel', this.onPointerCancel);
    this.renderer.domElement.addEventListener('lostpointercapture', this.onLostPointerCapture);
    this.renderer.domElement.addEventListener('pointerleave', this.onPointerLeave);
    // Keep the loading veil above the canvas while GPU programs compile. It is removed only
    // after compileAsync completes, so the first visible frame cannot trigger a long shader stall.
    root.append(this.renderer.domElement);
    this.aimGuide.classList.add('coin-pusher-aim-guide');
    this.aimGuide.setAttribute('aria-hidden', 'true');
    this.aimGuide.setAttribute('preserveAspectRatio', 'none');
    this.aimGuideLine.setAttribute('class', 'coin-pusher-aim-guide-line');
    this.aimGuide.append(this.aimGuideLine);
    root.append(this.aimGuide);
    this.aimMarker.className = 'coin-pusher-aim-marker';
    this.aimMarker.setAttribute('aria-hidden', 'true');
    this.aimBeat.className = 'coin-pusher-aim-beat';
    this.aimMarker.append(this.aimBeat);
    root.append(this.aimMarker);
    this.scene.add(this.renderRoot);
    this.environmentTexture = this.studioEnvironment();
    this.scene.environment = this.environmentTexture;
    this.scene.environmentIntensity = .68;

    const coinFaceTexture = this.mintedCoinFaceTexture ?? this.coinPawTexture();
    this.coinBody = new THREE.InstancedMesh(
      this.trackGeometry(this.coinBodyGeometry()),
      [
        this.material(0xd7b25e, .94, .22, {
          clearcoat: .34, clearcoatRoughness: .2, envMapIntensity: 1.12,
        }, true),
        this.material(0x805d2b, .92, .27, {
          clearcoat: .18, clearcoatRoughness: .29, envMapIntensity: 1.05,
        }, true),
      ],
      MAX_COIN_INSTANCES,
    );
    this.coinRings = new THREE.InstancedMesh(
      this.trackGeometry(new THREE.TorusGeometry(.157, .006, 8, 64).rotateX(-Math.PI / 2)),
      this.material(0xf0d28b, .94, .18, {
        clearcoat: .32, clearcoatRoughness: .2, envMapIntensity: 1.18,
      }, true),
      MAX_COIN_INSTANCES,
    );
    this.coinInnerRings = new THREE.InstancedMesh(
      this.trackGeometry(new THREE.TorusGeometry(.116, .0025, 8, 48).rotateX(-Math.PI / 2)),
      this.material(0xa67835, .88, .28, {
        clearcoat: .18, clearcoatRoughness: .28, envMapIntensity: 1.02,
      }),
      MAX_COIN_INSTANCES,
    );
    this.coinStampMaterial = this.material(0xfff7e4, .46, .27, {
      map: coinFaceTexture, bumpMap: coinFaceTexture, bumpScale: .0018,
      side: THREE.DoubleSide, envMapIntensity: .96,
      clearcoat: .28, clearcoatRoughness: .22,
    });
    this.coinStamps = new THREE.InstancedMesh(
      this.trackGeometry(new THREE.CircleGeometry(.132, 40).rotateX(-Math.PI / 2)),
      this.coinStampMaterial,
      MAX_COIN_INSTANCES,
    );
    this.coinPaws = new THREE.InstancedMesh(
      this.trackGeometry(this.coinPawGeometry()),
      this.material(0xc49548, .82, .25, {
        clearcoat: .28, clearcoatRoughness: .22, envMapIntensity: 1.1,
      }),
      MAX_COIN_INSTANCES,
    );
    for (const mesh of [this.coinBody, this.coinRings, this.coinInnerRings, this.coinStamps, this.coinPaws]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.castShadow = mesh === this.coinBody;
      mesh.receiveShadow = false;
      this.renderRoot.add(mesh);
    }

    this.renderRoot.add(this.pusher);
    this.addLights();
    this.buildCabinet();
    this.buildPusher();
    this.pusher.position.z = this.simulation?.pusherZ ?? PUSHER_HOME_Z;
    this.syncPusherGlow(this.simulation?.pusherZ ?? PUSHER_HOME_Z);
    this.syncCoins();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(root);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resize();
    } catch (error) {
      this.cleanupPartialInitialization();
      throw error;
    }
  }

  /** Release resources/listeners created by a constructor that did not finish. */
  private cleanupPartialInitialization() {
    this.resizeObserver?.disconnect();
    this.renderer.setAnimationLoop(null);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.onPointerCancel);
    this.renderer.domElement.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
    if (this.root.contains(this.renderer.domElement)) this.root.replaceChildren();
    this.scene.environment = null;
    this.scene.clear();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.geometries.length = 0;
    this.materials.forEach((material) => this.disposeMaterial(material));
    this.materials.length = 0;
    this.brushedMetalTexture?.dispose();
    this.backboardTexture?.dispose();
    this.mintedCoinFaceTexture?.dispose();
    this.environmentTexture?.dispose();
    this.environmentTexture = undefined;
  }

  dropCoin(worldX: number) {
    return this.simulation?.dropCoin(worldX);
  }

  canDropCoin() {
    return !this.destroyed && Boolean(this.simulation?.canDropCoin());
  }

  aimAtWorldX(worldX: number) {
    if (!this.simulation || !Number.isFinite(worldX)) return;
    this.updateAimMarkerAtWorldX(THREE.MathUtils.clamp(worldX, -MAX_DROP_X, MAX_DROP_X));
  }

  get model() {
    if (!this.simulation) throw new Error('Coin-pusher physics is not ready');
    return this.simulation;
  }

  private attachModel(model: CoinPusherModel) {
    this.simulation = model;
    this.root.dataset.physicsSession = String(modelSessionId(model));
    model.setReducedMotion(this.reducedMotion);
    this.pusher.position.z = model.pusherZ;
    this.syncPusherGlow(model.pusherZ);
    this.syncCoins();
  }

  private applyArtwork(brushedMetalTexture?: THREE.Texture, backboardTexture?: THREE.Texture, mintedCoinFaceTexture?: THREE.Texture) {
    if (this.destroyed) {
      brushedMetalTexture?.dispose();
      backboardTexture?.dispose();
      mintedCoinFaceTexture?.dispose();
      return;
    }
    this.brushedMetalTexture = brushedMetalTexture;
    this.backboardTexture = backboardTexture;
    this.mintedCoinFaceTexture = mintedCoinFaceTexture;
    if (brushedMetalTexture) {
      for (const material of this.brushedMetalMaterials) {
        material.map = brushedMetalTexture;
        material.needsUpdate = true;
      }
    }
    if (mintedCoinFaceTexture && this.coinStampMaterial) {
      const proceduralFallback = this.coinStampMaterial.map;
      this.coinStampMaterial.map = mintedCoinFaceTexture;
      this.coinStampMaterial.bumpMap = mintedCoinFaceTexture;
      this.coinStampMaterial.needsUpdate = true;
      if (proceduralFallback && proceduralFallback !== mintedCoinFaceTexture) proceduralFallback.dispose();
    }
    this.addBackboardArtwork();
    this.root.dataset.artworkTextureCount = String([brushedMetalTexture, backboardTexture, mintedCoinFaceTexture].filter(Boolean).length);
    this.root.dataset.artworkReady = 'true';
  }

  /** Compile/render the cabinet and shared starter-pile preview while physics downloads. */
  private async prepareSceneGraphics() {
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.destroyed || this.root.dataset.webgl === 'lost') return false;
    await this.primeProgramBindingsAcrossFrames();
    if (this.destroyed || this.root.dataset.webgl === 'lost') return false;
    this.renderer.render(this.scene, this.camera);
    this.root.dataset.visualPreviewReady = 'true';
    this.root.dataset.visualPreviewAt = String(Math.round(performance.now()));
    return true;
  }

  private async prepareRenderer(reason?: WebGLAvailabilityReason) {
    await this.renderer.compileAsync(this.scene, this.camera);
    if (this.destroyed || this.root.dataset.webgl === 'lost') return;
    await this.primeProgramBindingsAcrossFrames();
    if (this.destroyed || this.root.dataset.webgl === 'lost') return;
    this.renderer.render(this.scene, this.camera);
    this.root.querySelector('.coin-pusher-loading')?.remove();
    delete this.root.dataset.loadingStage;
    this.rendererPrepared = true;
    if (!document.hidden) {
      this.lastFrame = 0;
      this.renderer.setAnimationLoop(this.animate);
    }
    this.onAvailability(true, reason);
  }

  /**
   * Three.js resolves active uniforms/attributes on a program's first use. Some mobile and
   * software WebGL drivers do that synchronously for every linked shader, so prime each cache
   * behind the loading veil and yield between slow queries instead of freezing one long frame.
   */
  private async primeProgramBindingsAcrossFrames() {
    const programs = this.renderer.info.programs ?? [];
    this.root.dataset.shaderWarmupPrograms = String(programs.length);
    let frameStartedAt = performance.now();
    let primedPrograms = 0;
    for (const program of programs) {
      if (this.destroyed || this.root.dataset.webgl === 'lost') return;
      const queryStartedAt = performance.now();
      program.getUniforms();
      primedPrograms += 1;
      const queryDuration = performance.now() - queryStartedAt;
      if (queryDuration >= 8 || performance.now() - frameStartedAt >= 8) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
        frameStartedAt = performance.now();
      }
    }
    this.root.dataset.shaderWarmupPrimed = String(primedPrograms);
  }

  private animate = (time: number) => {
    const model = this.simulation;
    if (this.destroyed || !model) return;
    const reduceMotion = this.isReducedMotionRequested();
    if (reduceMotion !== this.reducedMotion) {
      this.reducedMotion = reduceMotion;
      model.setReducedMotion(reduceMotion);
      if (reduceMotion) this.clearImpactBursts();
    }
    // Keep the 60Hz Rapier fixed-step simulation while avoiding a full-rate render loop for
    // children who explicitly requested less motion.
    if (this.reducedMotion && this.lastFrame && time - this.lastFrame < 1000 / 30) return;
    const delta = this.lastFrame ? Math.min(100, time - this.lastFrame) : 16;
    this.lastFrame = time;
    if (!document.hidden) {
      model.update(delta);
      this.pusher.position.z = model.pusherZ;
      this.syncPusherGlow(model.pusherZ);
      this.syncCoins();
      const trayImpacts = this.collectTrayImpacts();
      if (!this.reducedMotion && trayImpacts.length) this.sparkAtFront(trayImpacts, time);
      this.updateImpactBursts(time);
      if (this.aimMarker.classList.contains('is-visible')) {
        const laneX = Number(this.aimMarker.dataset.laneX);
        if (Number.isFinite(laneX)) this.updateAimMarkerAtWorldX(laneX);
      }
      const events = model.drainEvents();
      for (const event of events) {
        if (event.type === 'pusher-stroke') this.onPusherStroke(event.direction);
      }
      const coinLandings = events.filter((event) => event.type === 'coin-landed');
      if (coinLandings.length) {
        const impacts = coinLandings.map((event) =>
          new THREE.Vector3(event.position.x, event.position.y + .04, event.position.z));
        if (!this.reducedMotion) this.sparkAtFront(impacts, time);
        const landingFeedback = coinLandings.map((event) => ({
          ...this.projectPayoutOrigin(event.position),
          pusherBeat: event.pusherBeat,
        }));
        this.onCoinImpact(coinLandings.length, landingFeedback);
      }
      for (const event of events) {
        if (event.type !== 'coins-collected') continue;
        const origins = event.positions.map((position) => this.projectPayoutOrigin(position));
        this.onCoinsFell(event.count, origins.length ? origins : [this.projectPayoutOrigin()]);
      }
      this.renderer.render(this.scene, this.camera);
    }
  };

  private resize() {
    const { width, height } = this.root.getBoundingClientRect();
    if (width < 1 || height < 1) return;
    const aspect = width / height;
    // Keep the camera projection matched to the actual viewport. A virtual landscape aspect
    // on portrait phones compresses the picture and makes swipe-to-world-X disagree with the
    // pixel position the student touched.
    this.camera.aspect = aspect;
    this.renderRoot.scale.set(1, 1, 1);
    const broadLandscape = THREE.MathUtils.clamp((aspect - 1.1) / .7, 0, 1);
    const compactPortrait = aspect < .62;
    const fov = compactPortrait ? 49 : aspect < .82 ? 47 : aspect < 1.1 ? 45 : 39;
    const landscapePitch = 35 + 5 * broadLandscape;
    const pitch = THREE.MathUtils.degToRad(compactPortrait ? 58 : aspect < .82 ? 50 : aspect < 1.1 ? 43 : landscapePitch);
    this.camera.fov = fov;
    // The cabinet is wider than it is tall. Fit its near/front edge to the narrow axis first,
    // then also enforce a vertical fit so the sign and feet stay inside the viewport. Keeping
    // this calculation in world-space makes portrait phones and tablets predictable without
    // distorting the simulated playfield.
    // Portrait phones have far more height than the cabinet's landscape silhouette can use.
    // Spend a little of the cabinet's outer-rail margin to enlarge the playable deck, and tilt
    // down enough to make the coin rows legible without distorting swipe-to-world coordinates.
    const halfWidth = compactPortrait ? 2.78 : 3.23;
    const targetY = compactPortrait ? .43 : .22 + .26 * broadLandscape;
    const portrait = aspect < 1.1;
    // On landscape screens, center the framing between the rear coin bed and the front payout
    // well instead of letting the long depth project the tray below short phone viewports.
    // This also lets the working deck occupy more of the wide canvas without scaling the model.
    const targetZ = THREE.MathUtils.lerp(.12, PAYOUT_TRAY_CENTER_Z - 3.35, broadLandscape);
    // In landscape, prioritize the coin bed and pusher rather than using the hidden rear-shell
    // depth to zoom the whole machine down to a thumbnail. Portrait keeps the full enclosure in
    // view and lets its narrow horizontal FOV determine distance.
    const halfHeight = portrait ? 1.94 : 1.78;
    const halfDepth = portrait
      ? Math.max(Math.abs(REAR_CASE_BACK_Z - targetZ), Math.abs(PAYOUT_TRAY_CENTER_Z
        + PAYOUT_TRAY_FLOOR_HALF_DEPTH + PAYOUT_TRAY_CATCHER_MARGIN + .18 - targetZ))
      : Math.max(Math.abs(REAR_CASE_FRONT_Z - targetZ), Math.abs(PAYOUT_TRAY_CENTER_Z
        + PAYOUT_TRAY_FLOOR_HALF_DEPTH + PAYOUT_TRAY_CATCHER_MARGIN + .18 - targetZ));
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    const nearOffset = compactPortrait ? 1.2 : portrait ? 1.5 : .8;
    const horizontalMargin = compactPortrait ? .12 : portrait ? .22 : .14;
    const horizontalDistance = (halfWidth + horizontalMargin) / (tanHalfFov * aspect) + nearOffset;
    const projectedHalfHeight = halfHeight * Math.cos(pitch) + halfDepth * Math.sin(pitch);
    const verticalDistance = (projectedHalfHeight + .26) / tanHalfFov + nearOffset;
    const fitDistance = Math.max(horizontalDistance, verticalDistance);
    const distance = fitDistance * (1 - .085 * broadLandscape);
    this.camera.position.set(
      0,
      targetY + Math.sin(pitch) * distance,
      targetZ + Math.cos(pitch) * distance,
    );
    this.camera.lookAt(0, targetY, targetZ);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 620 ? 1.2 : 1.5));
  }

  private isReducedMotionRequested() {
    return document.documentElement.classList.contains('reduced-motion')
      || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  private pointerXToWorld(clientX: number, rect: DOMRect) {
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.camera.updateMatrixWorld();
    // Solve against the expected launch height and predicted landing depth. Only X is returned;
    // CoinPusherModel owns the drop position, height, depth, and all subsequent motion.
    this.pointerHit.set(0, 2.65, this.model.getDropTargetZ()).applyMatrix4(this.camera.matrixWorldInverse);
    const viewDepth = Math.max(.001, -this.pointerHit.z);
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const worldX = this.pointerNdc.x * viewDepth * Math.tan(halfFov) * this.camera.aspect;
    return THREE.MathUtils.clamp(worldX, -MAX_DROP_X, MAX_DROP_X);
  }

  /** Show the predicted landing lane while the student aims, without changing game state. */
  private updateAimMarker(clientX: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.updateAimMarkerAtWorldX(this.pointerXToWorld(clientX, rect));
  }

  private updateAimMarkerAtWorldX(worldX: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const dropZ = this.model.getDropTargetZ();
    const target = new THREE.Vector3(
      worldX,
      PUSHER_TOP_Y + .032,
      dropZ,
    );
    const launch = new THREE.Vector3(worldX, 2.65, dropZ);
    this.camera.updateMatrixWorld();
    target.project(this.camera);
    if (target.z < -1 || target.z > 1) { this.hideAimMarker(); return; }
    launch.project(this.camera);
    const toPixel = (point: THREE.Vector3) => ({
      x: (point.x * .5 + .5) * rect.width,
      y: (-point.y * .5 + .5) * rect.height,
    });
    const launchPixel = toPixel(launch);
    const targetPixel = toPixel(target);
    const viewBox = `0 0 ${rect.width} ${rect.height}`;
    if (this.aimGuide.getAttribute('viewBox') !== viewBox) this.aimGuide.setAttribute('viewBox', viewBox);
    this.aimGuideLine.setAttribute('x1', String(THREE.MathUtils.clamp(launchPixel.x, 0, rect.width)));
    this.aimGuideLine.setAttribute('y1', String(THREE.MathUtils.clamp(launchPixel.y, 6, rect.height - 6)));
    this.aimGuideLine.setAttribute('x2', String(THREE.MathUtils.clamp(targetPixel.x, 0, rect.width)));
    this.aimGuideLine.setAttribute('y2', String(THREE.MathUtils.clamp(targetPixel.y, 0, rect.height)));
    this.aimMarker.style.left = `${(target.x * .5 + .5) * rect.width}px`;
    this.aimMarker.style.top = `${(-target.y * .5 + .5) * rect.height}px`;
    this.aimMarker.dataset.laneX = worldX.toFixed(6);
    const beat = this.model.getPredictedDropBeat();
    const isChinese = document.documentElement.lang.toLowerCase().startsWith('zh');
    const labels = {
      'home-pause': isChinese ? 'Ⅱ 後停' : 'Ⅱ HOME HOLD',
      forward: isChinese ? '↑ 前推' : '↑ PUSH',
      'front-pause': isChinese ? 'Ⅱ 前停' : 'Ⅱ FRONT HOLD',
      return: isChinese ? '↓ 回程' : '↓ RETURN',
    } as const;
    this.aimMarker.dataset.beat = beat;
    this.aimBeat.textContent = labels[beat];
    this.aimBeat.title = isChinese ? '預計硬幣落到推板時的推板節拍' : 'Pusher motion when the coin is expected to land';
    this.aimGuide.classList.add('is-visible');
    this.aimMarker.classList.add('is-visible');
  }

  private hideAimMarker() {
    this.aimGuide.classList.remove('is-visible');
    this.aimMarker.classList.remove('is-visible');
  }

  private addLights() {
    this.renderRoot.add(new THREE.HemisphereLight(0xfff4e4, 0x283341, 1.32));
    const key = new THREE.DirectionalLight(0xfff4df, 3.05);
    key.position.set(-4.2, 8.2, 5.8);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -4.25;
    key.shadow.camera.right = 4.25;
    key.shadow.camera.top = 4.25;
    key.shadow.camera.bottom = -4.25;
    key.shadow.camera.near = .5;
    key.shadow.camera.far = 24;
    key.shadow.bias = -.00012;
    key.shadow.normalBias = .018;
    key.shadow.radius = 3;
    this.renderRoot.add(key);
    const rim = new THREE.PointLight(0xa6d8d7, 1.75, 11, 2);
    rim.position.set(-2.6, 2.8, -.1);
    this.renderRoot.add(rim);
    const gold = new THREE.PointLight(0xffd18a, 2.35, 10, 2);
    gold.position.set(2.7, 2.5, 1.25);
    this.renderRoot.add(gold);
    const marquee = new THREE.PointLight(0xc5b58c, .48, 5, 2);
    marquee.position.set(0, 1.7, -2.0);
    this.renderRoot.add(marquee);
  }

  /** Sweep the existing side rails and chute accent from teal to amber with the physical stroke. */
  private syncPusherGlow(pusherZ: number) {
    const material = this.pusherGlowMaterial;
    if (!material) return;
    const progress = coinPusherTravelProgress(pusherZ);
    if (Math.abs(progress - this.lastPusherGlowProgress) < .002) return;
    this.lastPusherGlowProgress = progress;
    this.pusherGlowColor.copy(this.pusherGlowHomeColor).lerp(this.pusherGlowFrontColor, progress);
    material.emissive.copy(this.pusherGlowColor);
    material.emissiveIntensity = .28 + progress * .1;
  }

  private buildCabinet() {
    const shell = this.material(0x29283d, .42, .29, { clearcoat: .78, clearcoatRoughness: .21 });
    const plum = this.material(0x514766, .38, .31, { clearcoat: .72, clearcoatRoughness: .24 });
    const dark = this.material(0x111a26, .58, .29, { clearcoat: .48, clearcoatRoughness: .24 });
    const tray = this.material(0x293847, .62, .29, { clearcoat: .72, clearcoatRoughness: .22 });
    const brass = this.material(0xd0a45c, .84, .24, { clearcoat: .58, clearcoatRoughness: .2 });
    const paleGold = this.material(0xe6cf96, .78, .22, { clearcoat: .66, clearcoatRoughness: .16 });
    const fascia = this.material(0x403951, .48, .29, { clearcoat: .76, clearcoatRoughness: .22 });
    const chrome = this.material(0xb7c7c9, .86, .22, { clearcoat: .82, clearcoatRoughness: .14 });
    const glass = this.material(0xa8c9c9, .08, .18, {
      transparent: true, opacity: .17, transmission: .04, thickness: .06,
      clearcoat: .9, clearcoatRoughness: .12, side: THREE.DoubleSide, depthWrite: false,
    });
    const glow = this.material(0x82cfc7, .18, .26, {
      emissive: 0x1a7168, emissiveIntensity: .28, clearcoat: .72,
    });
    this.pusherGlowMaterial = glow as THREE.MeshPhysicalMaterial | THREE.MeshStandardMaterial;

    // This alpha-only floor pass gives the otherwise transparent render a soft contact shadow
    // without replacing or flattening the student's room artwork behind the cabinet.
    const shadowGeometry = this.trackGeometry(new THREE.PlaneGeometry(8.2, 9).rotateX(-Math.PI / 2));
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: this.softShadowTexture(), color: 0x121722, transparent: true,
      opacity: .56, depthWrite: false, side: THREE.DoubleSide,
    });
    this.materials.push(shadowMaterial);
    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.position.set(0, -1.674, -.8); shadow.renderOrder = 0;
    this.renderRoot.add(shadow);

    // Rounded enamel shell and four brass-capped feet establish a single crafted cabinet form.
    const bodyBackZ = REAR_CASE_BACK_Z;
    const payoutFrontZ = PAYOUT_TRAY_CENTER_Z + PAYOUT_TRAY_FLOOR_HALF_DEPTH;
    const bodyFrontZ = payoutFrontZ + .16;
    // Keep the broad rear plinth, but split its forward section into side rails and a far
    // crossmember. The open middle is the visible prize well; a continuous shell here hid every
    // coin as soon as it fell below the playfield.
    const rearBodyDepth = MAIN_DECK_FRONT_Z - bodyBackZ;
    const rearBody = this.box(6.35, .5, rearBodyDepth, shell, .2);
    rearBody.position.set(0, -.38, (bodyBackZ + MAIN_DECK_FRONT_Z) / 2); this.renderRoot.add(rearBody);
    const bodyHalfWidth = 6.35 / 2;
    const wellHalfWidth = 2.7;
    const sideBodyWidth = bodyHalfWidth - wellHalfWidth;
    const sideBodyDepth = bodyFrontZ - MAIN_DECK_FRONT_Z;
    for (const side of [-1, 1]) {
      const sideBody = this.box(sideBodyWidth, .5, sideBodyDepth, shell, .15);
      sideBody.position.set(side * (wellHalfWidth + sideBodyWidth / 2), -.38,
        (MAIN_DECK_FRONT_Z + bodyFrontZ) / 2);
      this.renderRoot.add(sideBody);
    }
    const frontBody = this.box(6.35, .5, .16, shell, .12);
    frontBody.position.set(0, -.38, bodyFrontZ + .08); this.renderRoot.add(frontBody);
    for (const x of [-2.78, 2.78]) for (const z of [REAR_CASE_BACK_Z + .6, PAYOUT_TRAY_CENTER_Z - .39]) {
      const foot = this.box(.38, 1.18, .38, plum, .1);
      foot.position.set(x, -1.08, z); this.renderRoot.add(foot);
      const collar = this.box(.46, .13, .46, brass, .08);
      collar.position.set(x, -.5, z); this.renderRoot.add(collar);
      const toe = this.box(.4, .1, .4, chrome, .06);
      toe.position.set(x, -1.64, z); this.renderRoot.add(toe);
    }

    // The deck is a layered dark glass playfield. Preserve the front lip gap used by Rapier.
    const deckDepth = MAIN_DECK_FRONT_Z - MAIN_DECK_BACK_Z;
    const deckCenterZ = (MAIN_DECK_FRONT_Z + MAIN_DECK_BACK_Z) / 2;
    const deck = this.box(5.48, .154, deckDepth, tray, .12);
    deck.position.set(0, -.045, deckCenterZ); this.renderRoot.add(deck);
    const rearDeck = this.box(5.48, .154, REAR_DECK_HALF_DEPTH * 2, tray, .1);
    rearDeck.position.set(0, -.045, REAR_DECK_CENTER_Z); this.renderRoot.add(rearDeck);
    const deckInsetMaterial = this.material(0x526675, .72, .29, { map: this.brushedMetalTexture, clearcoat: .68, clearcoatRoughness: .2 });
    this.brushedMetalMaterials.push(deckInsetMaterial);
    const deckInset = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(5.14, deckDepth + .02).rotateX(-Math.PI / 2)),
      deckInsetMaterial,
    );
    deckInset.position.set(0, .0345, deckCenterZ); deckInset.receiveShadow = true; this.renderRoot.add(deckInset);
    const rearDeckInsetMaterial = this.material(0x526675, .72, .32, { map: this.brushedMetalTexture, clearcoat: .54, clearcoatRoughness: .24 });
    this.brushedMetalMaterials.push(rearDeckInsetMaterial);
    const rearDeckInset = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(5.14, REAR_DECK_HALF_DEPTH * 2 - .1).rotateX(-Math.PI / 2)),
      rearDeckInsetMaterial,
    );
    rearDeckInset.position.set(0, .0345, REAR_DECK_CENTER_Z); rearDeckInset.receiveShadow = true; this.renderRoot.add(rearDeckInset);

    // A thick opaque rear case receives the retracted half of the compact pusher deck. Its
    // narrow horizontal slot clears the slab and low-profile guide shoes but is thinner than a
    // flat coin; the fascia strips coins off as the slab retracts. The opaque shell hides the
    // rest of the rear case, and the slab's rear edge meets the slot at full extension.
    const rearUpper = this.box(5.76, REAR_CASE_TOP_Y - PUSHER_SLOT_TOP_Y, REAR_CASE_DEPTH, shell, .16);
    rearUpper.position.set(0, (REAR_CASE_TOP_Y + PUSHER_SLOT_TOP_Y) / 2, REAR_CASE_CENTER_Z); this.renderRoot.add(rearUpper);
    const rearLower = this.box(5.76, PUSHER_SLOT_BOTTOM_Y - REAR_CASE_BOTTOM_Y, REAR_CASE_DEPTH, shell, .12);
    rearLower.position.set(0, (PUSHER_SLOT_BOTTOM_Y + REAR_CASE_BOTTOM_Y) / 2, REAR_CASE_CENTER_Z); this.renderRoot.add(rearLower);
    for (const side of [-1, 1]) {
      const shoulderWidth = (5.76 - PUSHER_SLOT_HALF_WIDTH * 2) / 2;
      const shoulderX = PUSHER_SLOT_HALF_WIDTH + shoulderWidth / 2;
      const slotShoulder = this.box(shoulderWidth, PUSHER_SLOT_TOP_Y - PUSHER_SLOT_BOTTOM_Y, REAR_CASE_DEPTH, shell, .025);
      slotShoulder.position.set(side * shoulderX, (PUSHER_SLOT_TOP_Y + PUSHER_SLOT_BOTTOM_Y) / 2, REAR_CASE_CENTER_Z); this.renderRoot.add(slotShoulder);
    }
    const rearInset = this.box(5.42, 1.38, .04, dark, .12);
    rearInset.position.set(0, 1.02, REAR_CASE_FRONT_Z + .03); this.renderRoot.add(rearInset);
    this.addBackboardArtwork();
    const rearTopTrim = this.box(5.38, .045, .035, paleGold, .018);
    rearTopTrim.position.set(0, 1.72, REAR_CASE_FRONT_Z + .05); this.renderRoot.add(rearTopTrim);

    // Long raised spines run across the top of the cabinet depth. From the player's elevated
    // view they make the rear housing read as a deep box the deck can slide into, not a thin wall.
    for (const side of [-1, 1]) {
      const spineDepth = REAR_CASE_DEPTH - .12;
      const spine = this.box(.2, .09, spineDepth, plum, .04);
      spine.position.set(side * 2.72, REAR_CASE_TOP_Y + .025, REAR_CASE_CENTER_Z);
      spine.castShadow = true; spine.receiveShadow = true; this.renderRoot.add(spine);
      const spineInlay = this.box(.028, .012, spineDepth - .18, paleGold, .01);
      spineInlay.position.set(side * 2.72, REAR_CASE_TOP_Y + .076, REAR_CASE_CENTER_Z);
      this.renderRoot.add(spineInlay);
    }

    // Dark tunnel backing, fixed lower sill and slot jambs make the opening read as a real
    // recess; they hide the board's rear half without making the opaque cabinet transparent.
    const slotInterior = this.box(5.42, .12, .04, dark, .025);
    slotInterior.position.set(0, .018, REAR_CASE_BACK_Z + .04); this.renderRoot.add(slotInterior);
    for (const side of [-1, 1]) {
      const tunnelSide = this.box(.12, .12, REAR_CASE_DEPTH - .06, dark, .025);
      tunnelSide.position.set(side * (PUSHER_SLOT_HALF_WIDTH + .1), .02, REAR_CASE_CENTER_Z); this.renderRoot.add(tunnelSide);
      const slotJamb = this.box(.08, PUSHER_SLOT_TOP_Y - PUSHER_SLOT_BOTTOM_Y, .075, plum, .025);
      slotJamb.position.set(side * (PUSHER_SLOT_HALF_WIDTH + .04), (PUSHER_SLOT_TOP_Y + PUSHER_SLOT_BOTTOM_Y) / 2, REAR_CASE_FRONT_Z + .04); this.renderRoot.add(slotJamb);
    }
    const slotTrim = this.box(PUSHER_SLOT_HALF_WIDTH * 2 + .08, .035, .08, paleGold, .018);
    slotTrim.position.set(0, PUSHER_SLOT_TOP_Y + .018, REAR_CASE_FRONT_Z + .05); this.renderRoot.add(slotTrim);
    const slotSeal = this.box(PUSHER_SLOT_HALF_WIDTH * 2, .035, .07, dark, .016);
    slotSeal.position.set(0, PUSHER_SLOT_BOTTOM_Y - .0175, REAR_CASE_FRONT_Z + .05); this.renderRoot.add(slotSeal);
    const slotShadowMaterial = new THREE.MeshBasicMaterial({
      color: 0x050914, transparent: true, opacity: .58, depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.materials.push(slotShadowMaterial);
    const slotShadow = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(5.1, .17).rotateX(-Math.PI / 2)),
      slotShadowMaterial,
    );
    slotShadow.position.set(0, PUSHER_TOP_Y + .001, REAR_CASE_FRONT_Z + .06);
    slotShadow.renderOrder = 2;
    this.renderRoot.add(slotShadow);
    const slotLowerTrim = this.box(PUSHER_SLOT_HALF_WIDTH * 2 + .08, .03, .08, brass, .015);
    slotLowerTrim.position.set(0, PUSHER_SLOT_BOTTOM_Y - .065, REAR_CASE_FRONT_Z + .05); this.renderRoot.add(slotLowerTrim);

    // A solid front fascia makes the receiving cabinet read as a thick, opaque housing. Its
    // four pieces leave one narrow opening for the same continuous slab; when the slab retracts,
    // this face physically occludes its rear half instead of merely suggesting a dark tunnel.
    const fasciaWidth = 6.02;
    const fasciaDepth = .18;
    const fasciaFrontZ = REAR_CASE_FRONT_Z + .004;
    const fasciaCenterZ = fasciaFrontZ - fasciaDepth / 2;
    const fasciaTop = this.box(fasciaWidth, REAR_CASE_TOP_Y - PUSHER_SLOT_TOP_Y, fasciaDepth, fascia, .065);
    fasciaTop.position.set(0, (REAR_CASE_TOP_Y + PUSHER_SLOT_TOP_Y) / 2, fasciaCenterZ);
    fasciaTop.castShadow = true; this.renderRoot.add(fasciaTop);
    const fasciaBottom = this.box(fasciaWidth, PUSHER_SLOT_BOTTOM_Y - REAR_CASE_BOTTOM_Y, fasciaDepth, fascia, .055);
    fasciaBottom.position.set(0, (PUSHER_SLOT_BOTTOM_Y + REAR_CASE_BOTTOM_Y) / 2, fasciaCenterZ);
    fasciaBottom.castShadow = true; this.renderRoot.add(fasciaBottom);
    const fasciaSideWidth = (fasciaWidth - PUSHER_SLOT_HALF_WIDTH * 2) / 2;
    for (const side of [-1, 1]) {
      const fasciaSide = this.box(fasciaSideWidth, REAR_CASE_TOP_Y - REAR_CASE_BOTTOM_Y, fasciaDepth, fascia, .05);
      fasciaSide.position.set(side * (PUSHER_SLOT_HALF_WIDTH + fasciaSideWidth / 2),
        (REAR_CASE_TOP_Y + REAR_CASE_BOTTOM_Y) / 2, fasciaCenterZ);
      fasciaSide.castShadow = true; this.renderRoot.add(fasciaSide);

      // The deep cheek walls expose the cabinet's real front-to-back thickness in perspective.
      const cheek = this.box(.22, 1.72, REAR_CASE_DEPTH - .12, plum, .07);
      cheek.position.set(side * 2.83, .78, REAR_CASE_CENTER_Z);
      cheek.castShadow = true; cheek.receiveShadow = true; this.renderRoot.add(cheek);
      const cheekInlay = this.box(.018, .025, REAR_CASE_DEPTH - .34, paleGold, .009);
      cheekInlay.position.set(side * 2.83, 1.66, REAR_CASE_CENTER_Z);
      this.renderRoot.add(cheekInlay);
    }

    // Metallic reveal on the fascia's outer face clearly outlines the receiving slot.
    const fasciaReveal = this.box(PUSHER_SLOT_HALF_WIDTH * 2 + .1, .026, .035, paleGold, .012);
    fasciaReveal.position.set(0, PUSHER_SLOT_TOP_Y + .026, fasciaFrontZ + .012);
    this.renderRoot.add(fasciaReveal);
    for (const side of [-1, 1]) {
      const frontLip = this.box(.42, .18, .2, brass, .07);
      frontLip.position.set(side * 2.88, -.08, MAIN_DECK_FRONT_Z + .08); this.renderRoot.add(frontLip);
    }

    // Side-mounted slide rails stay beyond the coin footprint and guide the plate from inside
    // the rear shell all the way to its fully exposed forward limit.
    for (const side of [-1, 1]) {
      const railBackZ = PUSHER_HOME_Z - PUSHER_HALF_DEPTH - .12;
      const railFrontZ = PUSHER_FORWARD_Z + PUSHER_HALF_DEPTH + .12;
      const railDepth = railFrontZ - railBackZ;
      const railCenterZ = (railBackZ + railFrontZ) / 2;
      const railBed = this.box(.16, .04, railDepth, dark, .025);
      railBed.position.set(side * 2.57, .02, railCenterZ); this.renderRoot.add(railBed);
      const guideRail = this.box(.09, .025, railDepth, chrome, .012);
      guideRail.position.set(side * 2.57, .053, railCenterZ); this.renderRoot.add(guideRail);
    }

    // A visible payout well sits just below the physical front-edge gap.
    const payoutZ = PAYOUT_TRAY_CENTER_Z;
    const prizeTrayDepth = (PAYOUT_TRAY_FLOOR_HALF_DEPTH + PAYOUT_TRAY_CATCHER_MARGIN) * 2
      + PAYOUT_TRAY_ENTRY_CATCH_OVERLAP;
    const prizeTrayCenterZ = payoutZ - PAYOUT_TRAY_ENTRY_CATCH_OVERLAP / 2;
    const prizeTray = this.box(5.7, PAYOUT_TRAY_FLOOR_HALF_HEIGHT * 2, prizeTrayDepth, dark, .1);
    prizeTray.position.set(0, PAYOUT_TRAY_FLOOR_CENTER_Y, prizeTrayCenterZ); this.renderRoot.add(prizeTray);
    const prizeFloor = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(5.25, prizeTrayDepth).rotateX(-Math.PI / 2)),
      this.material(0x263649, .48, .25, {
        clearcoat: .9, clearcoatRoughness: .12, emissive: 0x152234, emissiveIntensity: .18,
      }),
    );
    prizeFloor.position.set(0, PAYOUT_TRAY_FLOOR_CENTER_Y + PAYOUT_TRAY_FLOOR_HALF_HEIGHT + .001, prizeTrayCenterZ);
    prizeFloor.receiveShadow = true; this.renderRoot.add(prizeFloor);
    // A low gold reveal outlines the recessed catcher without standing in the coin's fall path.
    const wellSideRim = this.box(.034, .028, prizeTrayDepth, paleGold, .012);
    for (const side of [-1, 1]) {
      const rim = wellSideRim.clone();
      rim.position.set(side * 2.78, PAYOUT_TRAY_FLOOR_TOP_Y + .014, prizeTrayCenterZ);
      this.renderRoot.add(rim);
    }
    const wellEntryRim = this.box(5.28, .028, .045, paleGold, .012);
    wellEntryRim.position.set(0, PAYOUT_TRAY_FLOOR_TOP_Y + .014, MAIN_DECK_FRONT_Z + .045);
    this.renderRoot.add(wellEntryRim);
    const trayWallHalfHeight = (PAYOUT_TRAY_WALL_TOP_Y - PAYOUT_TRAY_FLOOR_TOP_Y) / 2;
    const trayWallCenterY = (PAYOUT_TRAY_WALL_TOP_Y + PAYOUT_TRAY_FLOOR_TOP_Y) / 2;
    const prizeFace = this.box(5.7, trayWallHalfHeight * 2, PAYOUT_TRAY_WALL_HALF_DEPTH * 2, plum, .07);
    prizeFace.position.set(0, trayWallCenterY, PAYOUT_TRAY_FRONT_WALL_CENTER_Z); this.renderRoot.add(prizeFace);
    const wellSideWall = this.box(.1, trayWallHalfHeight * 2, prizeTrayDepth, dark, .035);
    for (const side of [-1, 1]) {
      const wall = wellSideWall.clone();
      wall.position.set(side * 2.78, trayWallCenterY, prizeTrayCenterZ);
      wall.castShadow = true; wall.receiveShadow = true; this.renderRoot.add(wall);
    }
    const prizeTrim = this.box(5.2, .045, .035, paleGold, .022);
    prizeTrim.position.set(0, PAYOUT_TRAY_WALL_TOP_Y + .022, PAYOUT_TRAY_FRONT_WALL_CENTER_Z); this.renderRoot.add(prizeTrim);
    const prizeGlow = this.box(4.9, .025, .02, glow, .012);
    prizeGlow.position.set(0, -.53, payoutFrontZ + .08); this.renderRoot.add(prizeGlow);

    // A short, machined service apron breaks up the otherwise blank lower cabinet face.
    // It sits below the payout face and behind the coin well, so it adds finish without
    // changing the deck, tray, or any physical collision surface.
    const serviceApron = this.box(5.48, .16, .08, fascia, .055);
    serviceApron.position.set(0, -.29, bodyFrontZ + .04); this.renderRoot.add(serviceApron);
    for (const y of [-.205, -.375]) {
      const pinstripe = this.box(5.14, .009, .012, paleGold, .004);
      pinstripe.position.set(0, y, bodyFrontZ + .087); this.renderRoot.add(pinstripe);
    }
    const apronBadge = this.box(.96, .118, .026, dark, .04);
    apronBadge.position.set(0, -.29, bodyFrontZ + .091); this.renderRoot.add(apronBadge);
    const pawBadge = new THREE.Mesh(
      this.trackGeometry(this.coinPawGeometry().rotateX(Math.PI / 2)),
      paleGold,
    );
    pawBadge.position.set(0, -.29, bodyFrontZ + .108);
    pawBadge.scale.setScalar(1.72);
    this.renderRoot.add(pawBadge);

    const ventGeometry = this.trackGeometry(new THREE.BoxGeometry(.09, .016, .012));
    const ventMaterial = this.material(0x111923, .32, .48);
    const vents = new THREE.InstancedMesh(ventGeometry, ventMaterial, 8);
    const detail = new THREE.Object3D();
    let ventIndex = 0;
    for (const side of [-1, 1]) for (let index = 0; index < 4; index += 1) {
      detail.position.set(side * (1.22 + index * .18), -.29, bodyFrontZ + .092);
      detail.updateMatrix(); vents.setMatrixAt(ventIndex++, detail.matrix);
    }
    vents.instanceMatrix.needsUpdate = true;
    vents.frustumCulled = false;
    this.renderRoot.add(vents);

    const screwGeometry = this.trackGeometry(new THREE.CylinderGeometry(.022, .022, .012, 16).rotateX(Math.PI / 2));
    const screws = new THREE.InstancedMesh(screwGeometry, paleGold, 4);
    let screwIndex = 0;
    for (const x of [-2.53, 2.53]) for (const y of [-.235, -.345]) {
      detail.position.set(x, y, bodyFrontZ + .091);
      detail.updateMatrix(); screws.setMatrixAt(screwIndex++, detail.matrix);
    }
    screws.instanceMatrix.needsUpdate = true;
    screws.frustumCulled = false;
    this.renderRoot.add(screws);

    // Side rails use tinted transparent panels with separate polished edges so the room still
    // reads through the cabinet glass instead of being hidden by an opaque wall.
    const railBaseBackZ = REAR_CASE_FRONT_Z + .26;
    const railBaseFrontZ = payoutZ - .15;
    const guardBackZ = REAR_CASE_FRONT_Z + .395;
    const guardFrontZ = payoutZ - .345;
    const handrailBackZ = railBaseBackZ;
    const handrailFrontZ = payoutZ - .21;
    const chromeEdgeBackZ = REAR_CASE_FRONT_Z + .55;
    const chromeEdgeFrontZ = payoutZ - .5;
    const stripeBackZ = REAR_CASE_FRONT_Z + .495;
    const stripeFrontZ = payoutZ - .445;
    for (const side of [-1, 1]) {
      const railBase = this.box(.25, .34, railBaseFrontZ - railBaseBackZ, plum, .1);
      railBase.position.set(side * 2.88, .13, (railBaseBackZ + railBaseFrontZ) / 2); this.renderRoot.add(railBase);
      const guard = this.box(.07, .78, guardFrontZ - guardBackZ, glass, .03);
      guard.position.set(side * 2.82, .62, (guardBackZ + guardFrontZ) / 2); this.renderRoot.add(guard);
      const handrail = this.box(.17, .13, handrailFrontZ - handrailBackZ, brass, .06);
      handrail.position.set(side * 2.83, 1.02, (handrailBackZ + handrailFrontZ) / 2); this.renderRoot.add(handrail);
      const chromeEdge = this.box(.035, .52, chromeEdgeFrontZ - chromeEdgeBackZ, chrome, .016);
      chromeEdge.position.set(side * 2.765, .61, (chromeEdgeBackZ + chromeEdgeFrontZ) / 2); this.renderRoot.add(chromeEdge);
      const stripe = this.box(.027, .028, stripeFrontZ - stripeBackZ, glow, .013);
      stripe.position.set(side * 2.72, .36, (stripeBackZ + stripeFrontZ) / 2); this.renderRoot.add(stripe);
    }

    // Rear marquee, bevelled enamel canopy and chrome chute make the machine legible at a glance.
    const canopy = this.box(5.84, .26, .5, plum, .12);
    canopy.position.set(0, 1.55, REAR_CASE_FRONT_Z + .13); canopy.rotation.x = -.12; this.renderRoot.add(canopy);
    const canopyGold = this.box(5.52, .055, .035, paleGold, .025);
    canopyGold.position.set(0, 1.69, REAR_CASE_FRONT_Z + .42); canopyGold.rotation.x = -.12; this.renderRoot.add(canopyGold);
    const sign = this.box(2.78, .6, .18, brass, .16);
    sign.position.set(0, 1.9, REAR_CASE_FRONT_Z + .07); this.renderRoot.add(sign);
    const signFace = new THREE.Mesh(this.trackGeometry(new THREE.PlaneGeometry(2.49, .4)), this.labelMaterial('PET ARCADE'));
    signFace.position.set(0, 1.9, REAR_CASE_FRONT_Z + .172); this.renderRoot.add(signFace);

    const chuteShell = this.box(1.08, .62, .2, dark, .13);
    chuteShell.position.set(0, .86, REAR_CASE_FRONT_Z + .05); this.renderRoot.add(chuteShell);
    const chuteLip = this.box(.84, .08, .08, chrome, .035);
    chuteLip.position.set(0, .63, REAR_CASE_FRONT_Z + .12); this.renderRoot.add(chuteLip);
    const chuteLight = this.box(.68, .055, .045, glow, .025);
    chuteLight.position.set(0, .91, REAR_CASE_FRONT_Z + .12); this.renderRoot.add(chuteLight);
    const chuteInner = this.box(.54, .17, .025, this.material(0x0b1628, .48, .22), .045);
    chuteInner.position.set(0, .78, REAR_CASE_FRONT_Z + .125); this.renderRoot.add(chuteInner);
    const chuteBadgeZ = REAR_CASE_FRONT_Z + .168;
    const chuteBadge = new THREE.Mesh(
      this.trackGeometry(new THREE.CylinderGeometry(.093, .093, .025, 32).rotateX(Math.PI / 2)),
      brass,
    );
    chuteBadge.position.set(0, 1.06, chuteBadgeZ); this.renderRoot.add(chuteBadge);
    const chuteBadgeInset = new THREE.Mesh(
      this.trackGeometry(new THREE.CircleGeometry(.075, 32)),
      dark,
    );
    chuteBadgeInset.position.set(0, 1.06, chuteBadgeZ + .014);
    this.renderRoot.add(chuteBadgeInset);
    const chuteBadgeRing = new THREE.Mesh(
      this.trackGeometry(new THREE.TorusGeometry(.071, .0035, 8, 40)),
      paleGold,
    );
    chuteBadgeRing.position.set(0, 1.06, chuteBadgeZ + .018);
    this.renderRoot.add(chuteBadgeRing);
    const chutePaw = new THREE.Mesh(
      this.trackGeometry(this.coinPawGeometry().rotateX(Math.PI / 2)),
      paleGold,
    );
    chutePaw.position.set(0, 1.06, chuteBadgeZ + .027);
    chutePaw.scale.setScalar(1.12);
    this.renderRoot.add(chutePaw);

    const jewelGeometry = this.trackGeometry(new THREE.SphereGeometry(.12, 24, 18));
    for (const side of [-1, 1]) {
      const jewel = new THREE.Mesh(jewelGeometry, this.material(0xffda78, .68, .16, { clearcoat: 1 }));
      jewel.position.set(side * 2.55, 1.26, REAR_CASE_FRONT_Z + .54); jewel.castShadow = true; this.renderRoot.add(jewel);
      const jewelRing = new THREE.Mesh(
        this.trackGeometry(new THREE.TorusGeometry(.145, .018, 8, 32)), paleGold,
      );
      jewelRing.position.copy(jewel.position); jewelRing.lookAt(jewel.position.x, jewel.position.y, jewel.position.z + 1);
      this.renderRoot.add(jewelRing);
      const jewelGlow = new THREE.PointLight(side < 0 ? 0xf3c77d : 0x9ed4cc, .82, 3.2);
      jewelGlow.position.copy(jewel.position); this.renderRoot.add(jewelGlow);
    }
  }

  private addBackboardArtwork() {
    const texture = this.backboardTexture;
    if (!texture) return;
    // Use the complete supplied medallion artwork as a printed enamel panel. The previous tiny
    // center crop read like a stray sticker and left most of the backboard blank.
    const source = texture.image as { width?: number; height?: number };
    const sourceWidth = source.width ?? 1536;
    const sourceHeight = source.height ?? 515;
    const artTexture = texture.clone();
    artTexture.repeat.set(1, 1);
    artTexture.offset.set(0, 0);
    artTexture.needsUpdate = true;
    const artHeight = 1.32;
    const artWidth = artHeight * sourceWidth / sourceHeight;
    const artMaterial = new THREE.MeshBasicMaterial({
      map: artTexture, side: THREE.DoubleSide, toneMapped: true,
    });
    this.materials.push(artMaterial);
    const backboardArt = new THREE.Mesh(
      this.trackGeometry(new THREE.PlaneGeometry(artWidth, artHeight)),
      artMaterial,
    );
    // The inset is 1.38 units high; preserve the source's aspect ratio and leave a narrow enamel margin.
    backboardArt.position.set(0, 1.02, REAR_CASE_FRONT_Z + .065);
    this.renderRoot.add(backboardArt);
  }

  private buildPusher() {
    // One continuous metal deck rests with its rear half inside the thick casing.
    // The forward stroke reveals the complete slab, whose leading edge reaches table midpoint.
    this.pusher.position.y = PUSHER_Y;
    const plate = this.box(PUSHER_WIDTH, .04, PUSHER_LENGTH, this.material(0xc4d5dc, .9, .19, {
      clearcoat: .98, clearcoatRoughness: .08, anisotropy: .58,
      emissive: 0x101c28, emissiveIntensity: .025,
    }), .035);
    plate.position.set(0, 0, 0); this.pusher.add(plate);

    // Long satin inlays and edge bevels make the whole plate legible as a manufactured board,
    // not a short metal strip appearing beneath the rear cabinet.
    const topInlayMaterial = this.material(0x9cabb1, .88, .26, {
      map: this.brushedMetalTexture, clearcoat: .94, clearcoatRoughness: .09, anisotropy: .68,
    });
    this.brushedMetalMaterials.push(topInlayMaterial);
    const topInlay = this.box(4.78, .003, PUSHER_LENGTH - .24, topInlayMaterial, .045);
    topInlay.position.set(0, .0215, 0); this.pusher.add(topInlay);
    const edgeMaterial = this.material(0xe0edf0, .92, .16, { clearcoat: 1, clearcoatRoughness: .06 });
    for (const side of [-1, 1]) {
      const edgeInlay = this.box(.018, .004, PUSHER_LENGTH - .2, edgeMaterial, .003);
      edgeInlay.position.set(side * 2.42, .019, -.01); this.pusher.add(edgeInlay);
    }

    // The front edge is a continuous bright impact lip across nearly the entire working width.
    // Its slight leading reveal is under 4 mm and visually keys it to the moving solid slab.
    const leadingLip = this.box(4.98, .1, .08, this.material(0x718b98, .92, .22, {
      clearcoat: .94, clearcoatRoughness: .08, anisotropy: .36,
    }), .045);
    leadingLip.position.set(0, .045, PUSHER_LIP_LOCAL_Z); this.pusher.add(leadingLip);
    const lipCap = this.box(4.9, .01, .018, this.material(0xe1eef0, .95, .14, {
      clearcoat: 1, clearcoatRoughness: .05,
    }), .008);
    lipCap.position.set(0, .092, PUSHER_HALF_DEPTH - .01); this.pusher.add(lipCap);

    // Fine engraved guide ribs on the plate's visible top surface.
    const ribMaterial = this.material(0x6c8794, .9, .17, { clearcoat: .98, clearcoatRoughness: .08 });
    const ribStart = -PUSHER_HALF_DEPTH + .14;
    const ribCount = Math.floor((PUSHER_LENGTH - .28) / .14) + 1;
    for (let index = 0; index < ribCount; index += 1) {
      const z = ribStart + index * .14;
      const rib = this.box(4.34, .002, .016, ribMaterial, .001);
      rib.position.set(0, .021, z); this.pusher.add(rib);
    }

    // Guide shoes are carried by the plate and ride the two fixed side rails. This keeps the
    // visible linkage continuous from the rear stop through the full forward stroke.
    for (const side of [-1, 1]) {
      const shoe = this.box(.14, .022, .28, this.material(0xf0b343, .78, .18, {
        clearcoat: .96, clearcoatRoughness: .1,
      }), .045);
      shoe.position.set(side * 2.57, .028, -.02); this.pusher.add(shoe);
      for (const z of [-.105, .065]) {
        const fastener = new THREE.Mesh(
          this.trackGeometry(new THREE.SphereGeometry(.009, 12, 8)),
          this.material(0xffe0a0, .72, .16, { clearcoat: 1 }),
        );
          fastener.position.set(side * 2.57, .041, z); fastener.castShadow = true; this.pusher.add(fastener);
      }
    }
  }

  private syncCoins() {
    const physicsCoins = this.simulation?.coins;
    const count = Math.min(physicsCoins?.length ?? this.previewCoinLayout.length, MAX_COIN_INSTANCES);
    this.root.dataset.coinCount = String(count);
    if (physicsCoins) delete this.root.dataset.previewCoinCount;
    else this.root.dataset.previewCoinCount = String(count);
    let coinTintsChanged = false;
    for (let index = 0; index < count; index += 1) {
      const coin = physicsCoins?.[index];
      const previewCoin = this.previewCoinLayout[index];
      const coinId = coin?.id ?? index + 1;
      if (this.coinInstanceIds[index] !== coinId) {
        // A restrained deterministic mint variation breaks the perfect copy-paste look without
        // adding color noise to the dense bed or changing any coin's physics.
        const tintSeed = (Math.imul(coinId, 1664525) + 1013904223) >>> 0;
        const variation = tintSeed / 0xffff_ffff;
        const brightness = .97 + variation * .06;
        this.coinTint.setRGB(
          brightness,
          brightness * (.985 + variation * .01),
          brightness * (.94 + variation * .035),
        );
        this.coinBody.setColorAt(index, this.coinTint);
        this.coinInstanceIds[index] = coinId;
        coinTintsChanged = true;
      }
      const position = coin ? coin.body.translation() : previewCoin;
      if (coin) {
        const rotation = coin.body.rotation();
        this.bodyRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
      } else {
        this.bodyRotation.identity();
      }
      const mintSeed = (Math.imul(coinId, 1103515245) + 12345) >>> 0;
      this.faceSpin.setFromAxisAngle(this.faceSpinAxis, (mintSeed / 0xffff_ffff) * Math.PI * 2);
      this.instance.position.set(position.x, position.y, position.z);
      this.instance.quaternion.copy(this.bodyRotation);
      this.instance.scale.setScalar(1);
      this.instance.updateMatrix();
      this.coinBody.setMatrixAt(index, this.instance.matrix);

      this.faceOffset.set(0, .033, 0).applyQuaternion(this.bodyRotation);
      this.instance.position.set(position.x + this.faceOffset.x, position.y + this.faceOffset.y, position.z + this.faceOffset.z);
      this.instance.updateMatrix();
      this.coinRings.setMatrixAt(index, this.instance.matrix);
      this.faceOffset.set(0, .0355, 0).applyQuaternion(this.bodyRotation);
      this.instance.position.set(position.x + this.faceOffset.x, position.y + this.faceOffset.y, position.z + this.faceOffset.z);
      this.instance.scale.setScalar(1);
      this.instance.updateMatrix();
      this.coinInnerRings.setMatrixAt(index, this.instance.matrix);

      this.faceOffset.set(0, .033, 0).applyQuaternion(this.bodyRotation);
      this.instance.position.set(position.x + this.faceOffset.x, position.y + this.faceOffset.y, position.z + this.faceOffset.z);
      this.instance.quaternion.copy(this.bodyRotation).multiply(this.faceSpin);
      this.instance.scale.setScalar(.86);
      this.instance.updateMatrix();
      this.coinStamps.setMatrixAt(index, this.instance.matrix);

      this.faceOffset.set(0, .0332, 0).applyQuaternion(this.bodyRotation);
      this.instance.position.set(position.x + this.faceOffset.x, position.y + this.faceOffset.y, position.z + this.faceOffset.z);
      this.instance.quaternion.copy(this.bodyRotation).multiply(this.faceSpin);
      this.instance.scale.setScalar(1.45);
      this.instance.updateMatrix();
      this.coinPaws.setMatrixAt(index, this.instance.matrix);
    }
    for (const mesh of [this.coinBody, this.coinRings, this.coinInnerRings, this.coinStamps, this.coinPaws]) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (coinTintsChanged && this.coinBody.instanceColor) this.coinBody.instanceColor.needsUpdate = true;
  }

  /** Only trigger the tray glint when Rapier reports a real downward-velocity reversal. */
  private collectTrayImpacts() {
    const positions: THREE.Vector3[] = [];
    const liveIds = new Set<number>();
    for (const coin of this.model.coins) {
      liveIds.add(coin.id);
      const position = coin.body.translation();
      const velocity = coin.body.linvel();
      const previousVy = this.previousVerticalVelocity.get(coin.id);
      const trayMinZ = PAYOUT_TRAY_CENTER_Z - PAYOUT_TRAY_FLOOR_HALF_DEPTH - PAYOUT_TRAY_CATCHER_MARGIN;
      const trayMaxZ = PAYOUT_TRAY_CENTER_Z + PAYOUT_TRAY_FLOOR_HALF_DEPTH + PAYOUT_TRAY_CATCHER_MARGIN;
      if (coin.falling && coin.fallAge > .12 && position.z > trayMinZ && position.z < trayMaxZ && position.y < .48
        && previousVy !== undefined && previousVy < -.55 && velocity.y > -.2 && !this.impactSparked.has(coin.id)) {
        positions.push(new THREE.Vector3(position.x, position.y + .04, position.z));
        this.impactSparked.add(coin.id);
      }
      this.previousVerticalVelocity.set(coin.id, velocity.y);
    }
    for (const id of this.previousVerticalVelocity.keys()) {
      if (!liveIds.has(id)) { this.previousVerticalVelocity.delete(id); this.impactSparked.delete(id); }
    }
    return positions;
  }

  /** Project each actual Rapier-settled coin so its payout flight starts where it landed. */
  private projectPayoutOrigin(position?: { x: number; y: number; z: number }): CoinPusherRewardOrigin {
    const rect = this.root.getBoundingClientRect();
    const point = position
      ? new THREE.Vector3(position.x, position.y, position.z)
      : new THREE.Vector3(0, PAYOUT_TRAY_FLOOR_CENTER_Y + PAYOUT_TRAY_FLOOR_HALF_HEIGHT + .035, PAYOUT_TRAY_CENTER_Z);
    this.camera.updateMatrixWorld();
    point.project(this.camera);
    return {
      x: (point.x * .5 + .5) * rect.width,
      y: (-point.y * .5 + .5) * rect.height,
    };
  }

  /** Short gold flecks radiate from real Rapier coin impacts; coin motion remains untouched. */
  private sparkAtFront(impacts: THREE.Vector3[], startedAt: number) {
    const amount = Math.min(24, impacts.length * 6);
    const starts = new Float32Array(amount * 3);
    const velocities = new Float32Array(amount * 3);
    const seeded = (seed: number) => {
      const value = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
      return value - Math.floor(value);
    };
    for (let index = 0; index < amount; index += 1) {
      const impactIndex = index % impacts.length;
      const impact = impacts[impactIndex];
      const ringIndex = Math.floor(index / impacts.length);
      const rings = Math.ceil(amount / impacts.length);
      const seed = (impact.x + impact.z * 1.7) * 17 + impactIndex * 13 + ringIndex * 5.3;
      const angle = (ringIndex / rings) * Math.PI * 2 + (seeded(seed + 1) - .5) * .24;
      const radius = .018 + seeded(seed + 2) * .045;
      const radialSpeed = .22 + seeded(seed + 3) * .24;
      const offset = index * 3;
      starts[offset] = impact.x + Math.cos(angle) * radius;
      starts[offset + 1] = impact.y + .025 + seeded(seed + 4) * .035;
      starts[offset + 2] = impact.z + Math.sin(angle) * radius;
      velocities[offset] = Math.cos(angle) * radialSpeed;
      velocities[offset + 1] = .2 + seeded(seed + 5) * .22;
      velocities[offset + 2] = Math.sin(angle) * radialSpeed * .55;
    }

    const geometry = this.trackGeometry(new THREE.BufferGeometry());
    const positions = new THREE.BufferAttribute(new Float32Array(amount * 3), 3);
    positions.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    const material = new THREE.PointsMaterial({
      color: 0xffe6a0, size: .09, sizeAttenuation: true, transparent: true,
      opacity: .88, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.materials.push(material);
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    points.renderOrder = 8;
    this.renderRoot.add(points);
    this.impactBursts.push({ points, geometry, material, starts, velocities, startedAt, duration: .31 });
  }

  private updateImpactBursts(time: number) {
    for (let index = this.impactBursts.length - 1; index >= 0; index -= 1) {
      const burst = this.impactBursts[index];
      const age = Math.max(0, (time - burst.startedAt) / 1000);
      const progress = Math.min(1, age / burst.duration);
      const positions = burst.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let point = 0; point < burst.starts.length / 3; point += 1) {
        const offset = point * 3;
        const travel = Math.min(age, burst.duration);
        positions.setXYZ(
          point,
          burst.starts[offset] + burst.velocities[offset] * travel,
          burst.starts[offset + 1] + burst.velocities[offset + 1] * travel - .62 * travel * travel,
          burst.starts[offset + 2] + burst.velocities[offset + 2] * travel,
        );
      }
      positions.needsUpdate = true;
      burst.material.opacity = .88 * (1 - progress) * (1 - progress * .16);
      burst.material.size = .09 * (1 - progress * .22);
      if (progress < 1) continue;

      this.renderRoot.remove(burst.points);
      this.forgetGeometry(burst.geometry); this.forgetMaterial(burst.material);
      burst.geometry.dispose(); this.disposeMaterial(burst.material);
      this.impactBursts.splice(index, 1);
    }
  }

  private clearImpactBursts() {
    for (const burst of this.impactBursts) {
      this.renderRoot.remove(burst.points);
      this.forgetGeometry(burst.geometry); this.forgetMaterial(burst.material);
      burst.geometry.dispose(); this.disposeMaterial(burst.material);
    }
    this.impactBursts.length = 0;
  }

  private studioEnvironment() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const context = canvas.getContext('2d')!;
    const ambience = context.createLinearGradient(0, 0, 0, canvas.height);
    ambience.addColorStop(0, '#182434');
    ambience.addColorStop(.24, '#aab1b1');
    ambience.addColorStop(.43, '#d4c6a9');
    ambience.addColorStop(.61, '#52616d');
    ambience.addColorStop(1, '#111923');
    context.fillStyle = ambience; context.fillRect(0, 0, canvas.width, canvas.height);

    const softbox = (x: number, y: number, width: number, height: number, tint: string, glow: number) => {
      context.save();
      context.shadowColor = tint; context.shadowBlur = glow;
      context.fillStyle = tint; context.fillRect(x, y, width, height);
      context.restore();
    };
    // Long rectangular studio cards create readable, directional metal catchlights without
    // using an external HDR or changing the selected room behind the transparent renderer.
    softbox(76, 104, 495, 18, '#fff5e2', 34);
    softbox(620, 132, 310, 15, '#e8f0ed', 28);
    softbox(904, 185, 28, 171, '#d4e5df', 24);
    softbox(104, 294, 235, 13, '#f1dfbf', 20);
    softbox(395, 355, 408, 10, '#e8efec', 22);
    // Thin dark separators preserve shape in the reflection instead of washing all metals out.
    context.fillStyle = 'rgba(10, 18, 30, .46)';
    context.fillRect(0, 124, 1024, 7);
    context.fillRect(0, 319, 1024, 6);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 4);
    return texture;
  }

  private labelMaterial(text: string) {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 240;
    const context = canvas.getContext('2d')!;
    const enamel = context.createLinearGradient(0, 0, 0, canvas.height);
    enamel.addColorStop(0, '#172333'); enamel.addColorStop(.48, '#263447'); enamel.addColorStop(1, '#141e2c');
    context.fillStyle = enamel; context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(219, 185, 119, .9)'; context.lineWidth = 5;
    context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
    context.strokeStyle = 'rgba(255, 245, 220, .3)'; context.lineWidth = 1.5;
    context.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);
    this.drawPawMark(context, 132, 121, 66, '#c79b52', '#f3dfad');
    context.font = '750 78px system-ui, sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillStyle = 'rgba(5, 10, 18, .62)'; context.shadowColor = 'rgba(0, 0, 0, .46)';
    context.shadowBlur = 7; context.shadowOffsetY = 3; context.fillText(text, 718, 93);
    context.shadowBlur = 0; context.shadowOffsetY = 0;
    context.fillStyle = '#f4ead3'; context.fillText(text, 718, 89);
    context.strokeStyle = 'rgba(220, 186, 119, .58)'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(382, 139); context.lineTo(1056, 139); context.stroke();
    context.font = '650 22px system-ui, sans-serif'; context.letterSpacing = '8px';
    context.fillStyle = '#d8c18e'; context.fillText('LUCKY PAWS  •  COIN PUSHER', 718, 177);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: true });
    this.materials.push(material);
    return material;
  }

  private coinPawTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const context = canvas.getContext('2d')!;
    const medallion = context.createRadialGradient(186, 168, 24, 256, 256, 284);
    medallion.addColorStop(0, '#f6d982');
    medallion.addColorStop(.52, '#dda342');
    medallion.addColorStop(.88, '#b87525');
    medallion.addColorStop(1, '#6b3a15');
    context.fillStyle = medallion; context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = 'rgba(255, 245, 204, .94)'; context.lineWidth = 10;
    context.beginPath(); context.arc(256, 256, 238, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = 'rgba(102, 54, 17, .84)'; context.lineWidth = 6;
    context.beginPath(); context.arc(256, 256, 210, 0, Math.PI * 2); context.stroke();
    context.strokeStyle = 'rgba(255, 234, 169, .74)'; context.lineWidth = 4;
    context.beginPath(); context.arc(256, 256, 196, 0, Math.PI * 2); context.stroke();

    // Fine radial die lines add a real minted-metal read without adding glow or busy color.
    context.save();
    context.translate(256, 256);
    for (let index = 0; index < 36; index += 1) {
      context.rotate(Math.PI / 18);
      context.beginPath(); context.moveTo(136, 0); context.lineTo(177, 0);
      context.strokeStyle = index % 2 === 0 ? 'rgba(255, 244, 202, .34)' : 'rgba(89, 47, 18, .2)';
      context.lineWidth = index % 6 === 0 ? 3 : 1.6;
      context.stroke();
    }
    context.restore();

    for (let index = 0; index < 24; index += 1) {
      const angle = index * Math.PI / 12;
      const x = 256 + Math.cos(angle) * 222;
      const y = 256 + Math.sin(angle) * 222;
      context.beginPath(); context.arc(x, y, 3.2, 0, Math.PI * 2);
      context.fillStyle = index % 2 === 0 ? '#fff3c2' : '#9c5f20'; context.fill();
    }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 4);
    return texture;
  }

  private coinBodyGeometry() {
    const outline = new THREE.Shape();
    outline.absarc(0, 0, .164, 0, Math.PI * 2, false);
    const geometry = new THREE.ExtrudeGeometry(outline, {
      depth: .058, steps: 1, bevelEnabled: true, bevelSegments: 3,
      bevelSize: .003, bevelThickness: .003, curveSegments: 64,
    });
    // The .003-unit bevel keeps the visual profile inside the existing .168 physics radius
    // and gives both minted faces a real highlight break without changing collision dimensions.
    geometry.center();
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  }

  private coinPawGeometry() {
    const pad = new THREE.Shape();
    pad.moveTo(-.035, .004);
    pad.bezierCurveTo(-.037, -.012, -.023, -.022, -.009, -.015);
    pad.bezierCurveTo(-.004, -.013, -.002, -.009, 0, -.008);
    pad.bezierCurveTo(.002, -.009, .004, -.013, .009, -.015);
    pad.bezierCurveTo(.023, -.022, .037, -.012, .035, .004);
    pad.bezierCurveTo(.033, .024, .021, .035, .006, .032);
    pad.bezierCurveTo(.002, .031, -.002, .031, -.006, .032);
    pad.bezierCurveTo(-.021, .035, -.033, .024, -.035, .004);
    const toes: THREE.Shape[] = [];
    for (const [x, y, rx, ry] of [
      [-.031, -.012, .0085, .012], [-.011, -.026, .008, .012],
      [.011, -.026, .008, .012], [.031, -.012, .0085, .012],
    ]) {
      const toe = new THREE.Shape();
      toe.absellipse(x, y, rx, ry, 0, Math.PI * 2, false, x < 0 ? -.12 : .12);
      toes.push(toe);
    }
    const geometry = new THREE.ExtrudeGeometry([pad, ...toes], {
      depth: .012, steps: 1, bevelEnabled: true, bevelSegments: 3,
      bevelSize: .002, bevelThickness: .002, curveSegments: 10,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    return geometry;
  }

  private softShadowTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const gradient = context.createRadialGradient(128, 128, 18, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(18, 12, 36, .62)');
    gradient.addColorStop(.38, 'rgba(18, 12, 36, .38)');
    gradient.addColorStop(.72, 'rgba(18, 12, 36, .12)');
    gradient.addColorStop(1, 'rgba(18, 12, 36, 0)');
    context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private drawPawMark(context: CanvasRenderingContext2D, centerX: number, centerY: number, size: number, fill: string, highlight: string) {
    const toeY = centerY - size * .25;
    context.save();
    context.shadowColor = 'rgba(103, 53, 10, .48)'; context.shadowBlur = Math.max(2, size * .05); context.shadowOffsetY = size * .025;
    context.fillStyle = fill;
    context.beginPath(); context.ellipse(centerX - size * .36, toeY, size * .13, size * .19, -.26, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.ellipse(centerX - size * .12, toeY - size * .16, size * .13, size * .18, -.08, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.ellipse(centerX + size * .14, toeY - size * .16, size * .13, size * .18, .08, 0, Math.PI * 2); context.fill();
    context.beginPath(); context.ellipse(centerX + size * .38, toeY, size * .13, size * .19, .26, 0, Math.PI * 2); context.fill();
    context.beginPath();
    context.moveTo(centerX - size * .37, centerY + size * .04);
    context.bezierCurveTo(centerX - size * .39, centerY - size * .2, centerX - size * .18, centerY - size * .18, centerX, centerY - size * .04);
    context.bezierCurveTo(centerX + size * .18, centerY - size * .18, centerX + size * .39, centerY - size * .2, centerX + size * .37, centerY + size * .04);
    context.bezierCurveTo(centerX + size * .34, centerY + size * .35, centerX + size * .16, centerY + size * .43, centerX, centerY + size * .34);
    context.bezierCurveTo(centerX - size * .16, centerY + size * .43, centerX - size * .34, centerY + size * .35, centerX - size * .37, centerY + size * .04);
    context.closePath(); context.fill();
    context.shadowColor = 'transparent'; context.shadowBlur = 0; context.shadowOffsetY = 0;
    context.strokeStyle = highlight; context.globalAlpha = .5; context.lineWidth = Math.max(1, size * .025);
    context.beginPath(); context.ellipse(centerX - size * .12, toeY - size * .16, size * .09, size * .13, -.08, Math.PI * 1.1, Math.PI * 1.8); context.stroke();
    context.beginPath(); context.ellipse(centerX + size * .14, toeY - size * .16, size * .09, size * .13, .08, Math.PI * 1.2, Math.PI * 1.9); context.stroke();
    context.beginPath(); context.ellipse(centerX, centerY + size * .08, size * .24, size * .18, 0, Math.PI * 1.05, Math.PI * 1.92); context.stroke();
    context.restore();
  }

  private material(
    color: THREE.ColorRepresentation,
    metalness: number,
    roughness: number,
    options: THREE.MeshPhysicalMaterialParameters = {},
    premiumCoin = false,
  ): THREE.MeshStandardMaterial {
    let material: THREE.MeshStandardMaterial;
    if (premiumCoin && !this.compactMaterials) {
      material = new THREE.MeshPhysicalMaterial({ color, metalness, roughness, ...options });
    } else {
      // Keep clearcoat on the hero coin faces on desktop. The cabinet and mobile/tablet scene use
      // standard PBR; thin low-opacity glazing still reads as tinted transparent enamel without
      // a transmission pass. Metalness, roughness, maps and bump detail remain on the playfield.
      const standardOptions = { ...options };
      delete standardOptions.anisotropy;
      delete standardOptions.clearcoat;
      delete standardOptions.clearcoatRoughness;
      delete standardOptions.transmission;
      delete standardOptions.thickness;
      material = new THREE.MeshStandardMaterial({ color, metalness, roughness, ...standardOptions });
    }
    this.materials.push(material); return material;
  }

  private box(width: number, height: number, depth: number, material: THREE.Material, radius = .09) {
    const bevel = Math.min(radius * .44, width * .12, height * .18, depth * .18);
    const shapeWidth = Math.max(.002, width - bevel * 2);
    const shapeHeight = Math.max(.002, height - bevel * 2);
    const corner = Math.max(.001, Math.min(radius - bevel * .25, shapeWidth / 2, shapeHeight / 2));
    const x = shapeWidth / 2; const y = shapeHeight / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-x + corner, -y);
    shape.lineTo(x - corner, -y); shape.quadraticCurveTo(x, -y, x, -y + corner);
    shape.lineTo(x, y - corner); shape.quadraticCurveTo(x, y, x - corner, y);
    shape.lineTo(-x + corner, y); shape.quadraticCurveTo(-x, y, -x, y - corner);
    shape.lineTo(-x, -y + corner); shape.quadraticCurveTo(-x, -y, -x + corner, -y);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(.002, depth - bevel * 2), steps: 1,
      bevelEnabled: bevel > .001, bevelSegments: 4,
      bevelSize: bevel, bevelThickness: bevel, curveSegments: 10,
    });
    geometry.center();
    const mesh = new THREE.Mesh(this.trackGeometry(geometry), material);
    mesh.castShadow = true; mesh.receiveShadow = true; return mesh;
  }

  private trackGeometry<T extends THREE.BufferGeometry>(geometry: T): T { this.geometries.push(geometry); return geometry; }

  private forgetGeometry(geometry: THREE.BufferGeometry) {
    const index = this.geometries.indexOf(geometry);
    if (index >= 0) this.geometries.splice(index, 1);
  }

  private forgetMaterial(material: THREE.Material) {
    const index = this.materials.indexOf(material);
    if (index >= 0) this.materials.splice(index, 1);
  }

  private disposeMaterial(material: THREE.Material) {
    const map = (material as THREE.Material & { map?: THREE.Texture }).map;
    map?.dispose(); material.dispose();
  }

  destroy(preserveModel = false) {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver?.disconnect(); this.renderer.setAnimationLoop(null);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.onContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.renderer.domElement.removeEventListener('pointercancel', this.onPointerCancel);
    this.renderer.domElement.removeEventListener('lostpointercapture', this.onLostPointerCapture);
    this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
    this.impactBursts.length = 0;
    this.root.replaceChildren();
    this.scene.environment = null;
    this.scene.clear();
    if (!preserveModel) this.simulation?.destroy();
    this.geometries.forEach((geometry) => geometry.dispose());
    this.materials.forEach((material) => this.disposeMaterial(material));
    this.brushedMetalTexture?.dispose();
    this.backboardTexture?.dispose();
    this.mintedCoinFaceTexture?.dispose();
    this.environmentTexture?.dispose();
    this.environmentTexture = undefined;
    this.renderer.dispose();
  }
}
