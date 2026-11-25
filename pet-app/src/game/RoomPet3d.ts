import type Phaser from 'phaser';
import * as T from 'three';
import { hasWalker, loadWalker } from '../coast/pet-model';
import type { PetAction } from '../types';

const SIZE = 256;
const DISPLAY_SIZE = 257;
const FRAME_HEIGHT = 1.5;
const LOOK_AT_Y = .52;
const CAMERA_ELEVATION = Math.PI / 6;
const GROUND_PROJECTION = Math.sin(CAMERA_ELEVATION);
type Walker = Awaited<ReturnType<typeof loadWalker>>;

/** Render the model as a transparent room layer so it participates in Phaser's furniture sorting. */
export class RoomPet3d {
  readonly image: Phaser.GameObjects.Image;
  private readonly scene = new T.Scene();
  private readonly camera = new T.OrthographicCamera(-FRAME_HEIGHT / 2, FRAME_HEIGHT / 2, FRAME_HEIGHT / 2, -FRAME_HEIGHT / 2, .1, 12);
  private readonly pose = new T.Group();
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    || localStorage.getItem('pet-reduced-motion') === '1';
  private action: PetAction = 'idle';
  private actionTime = 0;
  private elapsed = 0;
  private heading = 0;

  get walkSpeed() {
    // Short-stride rigs cover less ground per second without needing to race through the clip.
    return T.MathUtils.clamp(this.walker.strideSpeed * 1.95, 1, 1.6);
  }

  static async create(host: Phaser.Scene, species: string, ambient: number, signal: AbortSignal, fallback: () => void) {
    if (!hasWalker(species) || !window.WebGL2RenderingContext) return undefined;
    const walker = await loadWalker(species, 1);
    if (signal.aborted) {
      walker.release();
      return undefined;
    }
    let renderer: T.WebGLRenderer | undefined;
    let texture: Phaser.Textures.CanvasTexture | null = null;
    let view: RoomPet3d | undefined;
    try {
      renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      renderer.setSize(SIZE, SIZE, false);
      const key = 'room-pet-3d';
      texture = host.textures.createCanvas(key, SIZE, SIZE);
      if (!texture) throw new Error('Could not create the room pet texture');
      view = new RoomPet3d(host, walker, renderer, texture, ambient, fallback);
      view.render();
      return view;
    } catch (error) {
      if (view) view.destroy();
      else {
        if (texture) host.textures.remove(texture);
        renderer?.dispose();
        renderer?.forceContextLoss();
        walker.release();
      }
      throw error;
    }
  }

  private constructor(
    private readonly host: Phaser.Scene,
    private readonly walker: Walker,
    private readonly renderer: T.WebGLRenderer,
    private readonly texture: Phaser.Textures.CanvasTexture,
    ambient: number,
    private readonly fallback: () => void,
  ) {
    this.renderer.setClearColor(0, 0);
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    const floorColour = new T.Color(ambient).lerp(new T.Color(0x8c7a70), .47);
    this.scene.add(new T.HemisphereLight(0xfff5eb, floorColour, 2.1));
    const key = new T.DirectionalLight(0xffe6d1, 2.35);
    key.position.set(-3, 5, 4);
    const rim = new T.DirectionalLight(0xe6f1ff, .82);
    rim.position.set(3, 3, -2);
    this.pose.add(walker.pivot);
    this.scene.add(this.pose, key, rim);
    this.camera.position.set(0, LOOK_AT_Y + 4 * Math.tan(CAMERA_ELEVATION), 4);
    this.camera.lookAt(0, LOOK_AT_Y, 0);
    const footOrigin = .5 + LOOK_AT_Y * Math.cos(CAMERA_ELEVATION) / FRAME_HEIGHT;
    this.image = host.add.image(0, 30, texture.key).setOrigin(.5, footOrigin).setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE);
    renderer.domElement.addEventListener('webglcontextlost', this.fallback);
  }

  update(delta: number, action: PetAction, dx: number, dy: number, displayScale: number) {
    const changed = action !== this.action;
    const dt = delta / 1000;
    this.actionTime = changed ? 0 : this.actionTime + dt;
    this.action = action;
    // Undo the orthographic camera's foreshortening before matching the rig to floor travel.
    const dz = dy / GROUND_PROJECTION;
    const moving = action === 'walk' && dt > 0 && (dx !== 0 || dz !== 0);
    let walkRate = 1;
    if (moving) {
      this.heading = Math.atan2(dx, dz);
      const modelUnits = Math.hypot(dx, dz) * FRAME_HEIGHT / (DISPLAY_SIZE * displayScale);
      walkRate = modelUnits / (dt * this.walker.strideSpeed);
    }
    this.walker.update(dt, moving, this.heading, walkRate);
    this.elapsed += delta;
    const frameInterval = 1000 / (moving ? 30 : 24);
    if (this.elapsed < frameInterval && !changed) return;
    this.elapsed %= frameInterval;
    this.animateReaction();
    this.render();
  }

  private animateReaction() {
    const strength = this.reducedMotion ? .28 : 1;
    const t = this.actionTime;
    this.pose.position.y = 0;
    this.pose.rotation.set(0, 0, 0);
    this.pose.scale.setScalar(1);
    switch (this.action) {
      case 'eat':
        this.pose.rotation.x = .19 * strength * Math.abs(Math.sin(t * 13));
        break;
      case 'sleep':
        this.pose.scale.y = .88 + .012 * strength * Math.sin(t * 3);
        break;
      case 'happy': case 'play': case 'evolve':
        this.pose.position.y = .16 * strength * Math.sin(Math.PI * Math.min(1, t / .5));
        break;
      case 'hit':
        this.pose.rotation.z = -.17 * strength * Math.sin(Math.PI * Math.min(1, t / .3));
        break;
      case 'auto-attack': case 'active-skill':
        this.pose.rotation.x = .18 * strength * Math.sin(Math.PI * Math.min(1, t / .4));
        break;
    }
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
    const context = this.texture.getContext();
    context.clearRect(0, 0, SIZE, SIZE);
    context.drawImage(this.renderer.domElement, 0, 0);
    this.texture.refresh();
  }

  destroy() {
    this.renderer.domElement.removeEventListener('webglcontextlost', this.fallback);
    this.image.destroy();
    this.host.textures.remove(this.texture);
    this.walker.release();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
