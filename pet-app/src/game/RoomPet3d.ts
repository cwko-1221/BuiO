import type Phaser from 'phaser';
import * as T from 'three';
import { hasWalker, loadWalker } from '../coast/pet-model';
import type { PetAction, PetFacing } from '../types';

const SIZE = 256;
const FRAME_INTERVAL = 1000 / 24;
const HEADING: Record<PetFacing, number> = { front: 0, right: Math.PI / 2, back: Math.PI, left: -Math.PI / 2 };
type Walker = Awaited<ReturnType<typeof loadWalker>>;

/** Render the model as a transparent room layer so it participates in Phaser's furniture sorting. */
export class RoomPet3d {
  readonly image: Phaser.GameObjects.Image;
  private readonly scene = new T.Scene();
  private readonly camera = new T.OrthographicCamera(-.75, .75, .75, -.75, .1, 12);
  private readonly pose = new T.Group();
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
    || localStorage.getItem('pet-reduced-motion') === '1';
  private action: PetAction = 'idle';
  private actionTime = 0;
  private elapsed = 0;

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
    this.camera.position.set(0, 1.74, 4);
    this.camera.lookAt(0, .52, 0);
    this.image = host.add.image(0, 30, texture.key).setOrigin(.5, .83).setDisplaySize(257, 257);
    renderer.domElement.addEventListener('webglcontextlost', this.fallback);
  }

  update(delta: number, action: PetAction, facing: PetFacing) {
    const changed = action !== this.action;
    const dt = Math.min(delta / 1000, .1);
    this.actionTime = changed ? 0 : this.actionTime + dt;
    this.action = action;
    this.walker.update(dt, action === 'walk', HEADING[facing]);
    this.elapsed += delta;
    if (this.elapsed < FRAME_INTERVAL && !changed) return;
    this.elapsed %= FRAME_INTERVAL;
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
