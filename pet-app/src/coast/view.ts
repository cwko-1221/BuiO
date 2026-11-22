import * as T from 'three';
import type { Locale, PetDefinition } from '../types';
import { clearWalk, distance, findRoute, frame, places, spawn, squash, type Point } from './layout';
import { contactShadow, disposeGroup, groundAt, paintedIsland, placeCamera } from './scenery';
import { loadWalker } from './pet-model';
import './coast.css';

const keys: Record<string, [number, number]> = {
  KeyW: [0,-1], ArrowUp: [0,-1], KeyS: [0,1], ArrowDown: [0,1],
  KeyA: [-1,0], ArrowLeft: [-1,0], KeyD: [1,0], ArrowRight: [1,0],
};
const directions = [
  ['ArrowUp','↑','向上','Up'], ['ArrowLeft','←','向左','Left'],
  ['ArrowDown','↓','向下','Down'], ['ArrowRight','→','向右','Right'],
];
const midpoint = { x: frame.width / 2, y: frame.height / 2 };
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const SPEED = 77; // Horizontal source pixels per second.

export class CoastView {
  private renderer?: T.WebGLRenderer;
  private readonly scene = new T.Scene();
  private readonly camera = new T.OrthographicCamera(-1,1,1,-1,.1,900);
  private readonly controller = new AbortController();
  private readonly held = new Set<string>();
  private readonly shadow = contactShadow();
  private readonly marker = new T.Mesh(new T.RingGeometry(.6,.77,32).rotateX(-Math.PI / 2),
    new T.MeshBasicMaterial({ color: 0xfff7d7, depthWrite: false }));
  private readonly ground = new T.Vector3();
  private walker?: Awaited<ReturnType<typeof loadWalker>>;
  private observer?: ResizeObserver;
  private location = { ...spawn };
  private center = { ...spawn };
  private viewWidth = 1;
  private viewHeight = 1;
  private route: Point[] = [];
  private destination = '';
  private heading = -.3;
  private last = 0;
  private raf = 0;
  private overview = false;
  private locked = false;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private readonly root: HTMLElement, private readonly options: { locale: Locale; definition: PetDefinition; close: () => void }) {
    root.className = 'moonbay';
    root.innerHTML = `
      <div class="moonbay-world"></div>
      <div class="moonbay-hud">
        <div class="moonbay-area" aria-live="polite"><strong></strong><small hidden></small></div>
        <div class="moonbay-actions">
          <button type="button" data-coast="map" aria-pressed="false">${this.t('全島地圖','Island map')}</button>
          <button type="button" data-coast="home">${this.t('回房間','My room')}</button>
        </div>
      </div>
      <div class="moonbay-map" aria-label="${this.t('選擇目的地','Choose a destination')}" hidden>
        ${places.map(p => `<button type="button" data-coast-place="${p.id}"><i style="--pin:${p.color}"></i>${this.t(p.zh,p.en)}</button>`).join('')}
      </div>
      <div class="moonbay-move" aria-label="${this.t('方向鍵','Movement controls')}">
        ${directions.map(([key,arrow,zh,en]) => `<button type="button" data-coast-move="${key}" aria-label="${this.t(zh,en)}">${arrow}</button>`).join('')}
      </div>
      <p class="moonbay-hint">${this.t('點選步道或用方向鍵移動','Click a path or use the arrow keys')}</p>
      <div class="moonbay-status" role="status">${this.t('正在準備海岸小鎮…','Loading the coast…')}</div>`;
    this.bindInput();
  }
  private t(zh: string, en: string) { return this.options.locale === 'zh-HK' ? zh : en; }
  private get status() { return this.root.querySelector<HTMLElement>('.moonbay-status')!; }

  async open() {
    const { signal } = this.controller;
    try {
      const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
      this.renderer = renderer;
      renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.setClearColor(0x174451);
      this.root.querySelector('.moonbay-world')!.append(renderer.domElement);
      renderer.domElement.setAttribute('aria-label', this.t('月灣海岸場景','Moonbay Coast scene'));
      renderer.domElement.addEventListener('pointerup', this.pick, { signal });
      renderer.domElement.addEventListener('webglcontextlost', event => {
        event.preventDefault(); cancelAnimationFrame(this.raf); this.showError();
      }, { signal });
      const results = await Promise.allSettled([paintedIsland(), loadWalker(this.options.definition.id)] as const);
      const [island, character] = results;
      if (signal.aborted || island.status === 'rejected' || character.status === 'rejected') {
        if (island.status === 'fulfilled') disposeGroup(island.value);
        if (character.status === 'fulfilled') character.value.release();
        if (!signal.aborted) throw (island.status === 'rejected' ? island.reason : character.status === 'rejected' && character.reason);
        return;
      }
      this.walker = character.value;
      this.scene.add(island.value, this.walker.pivot, this.shadow, this.marker);
      this.marker.visible = false;
      const sun = new T.DirectionalLight(0xffedce, 2.25);
      sun.position.set(-8,13,7);
      this.scene.add(new T.HemisphereLight(0xfff5de,0xc9b599,1.65), sun);
      if (this.walker.companion) {
        const label = this.root.querySelector<HTMLElement>('.moonbay-area small')!;
        label.hidden = false;
        label.textContent = this.t('同行嚮導・金毛幼犬','Trail guide · Golden Pup');
      }
      this.root.dataset.model = this.walker.id;
      this.root.dataset.joints = String(this.walker.joints);
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(this.root);
      this.resize();
      this.root.dataset.ready = 'true';
      this.status.hidden = true;
      this.draw(performance.now());
    } catch (error) {
      if (!signal.aborted) { console.error('[moonbay]', error); this.showError(); }
    }
  }
  private showError() {
    this.status.hidden = false;
    this.status.textContent = this.t('海岸小鎮未能載入，返回房間後可再試。','The coast could not load. Return to your room to try again.');
  }
  setLocked(value: boolean) {
    this.locked = value;
    this.held.clear();
    if (value) this.cancelRoute();
  }
  private bindInput() {
    const { signal } = this.controller;
    window.addEventListener('keydown', event => {
      if (event.defaultPrevented || this.locked) return;
      if (event.code === 'Escape') {
        if (this.overview) this.toggleMap(); else this.options.close();
      } else if (!this.overview && keys[event.code]) {
        event.preventDefault(); this.cancelRoute(); this.held.add(event.code);
      }
    }, { signal });
    window.addEventListener('keyup', e => { this.held.delete(e.code); }, { signal });
    window.addEventListener('blur', () => this.held.clear(), { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.held.clear(); this.last = 0; }
    }, { signal });
    this.root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!button || this.locked) return;
      if (button.dataset.coast === 'home') { this.options.close(); return; }
      if (!this.walker) return;
      if (button.dataset.coast === 'map') this.toggleMap();
      const place = places.find(p => p.id === button.dataset.coastPlace);
      if (place && this.overview) { this.toggleMap(); this.walkTo(place, place.id); }
    }, { signal });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-coast-move]')) {
      const key = button.dataset.coastMove!;
      button.addEventListener('pointerdown', event => {
        if (this.locked || this.overview || !this.walker) return;
        event.preventDefault(); button.setPointerCapture(event.pointerId);
        this.cancelRoute(); this.manual(keys[key][0] * 2, keys[key][1] * 2 * squash); this.held.add(key);
      }, { signal });
      for (const type of ['pointerup','pointercancel','lostpointercapture']) button.addEventListener(type, () => this.held.delete(key), { signal });
      button.addEventListener('click', event => {
        if (event.detail === 0 && !this.locked && !this.overview) {
          this.cancelRoute(); this.manual(keys[key][0] * 4, keys[key][1] * 4 * squash);
        }
      }, { signal });
    }
  }
  private resize() {
    const { clientWidth: w, clientHeight: h } = this.root;
    if (!w || !h) return;
    this.renderer?.setSize(w,h,false);
    const aspect = w / h;
    this.root.dataset.compact = String(aspect < 1.15);
    if (this.overview) {
      this.viewWidth = Math.max(frame.width, frame.height * aspect);
    } else {
      const zoom = Math.max(w / frame.width, h / frame.height,
        Math.min(w / (aspect < 1.15 ? 265 : 580), h / 270));
      this.viewWidth = w / zoom;
    }
    this.viewHeight = this.viewWidth / aspect;
    this.updateCamera(1);
    for (const [i, label] of [...this.root.querySelectorAll<HTMLButtonElement>('[data-coast-place]')].entries()) {
      const p = places[i];
      label.style.left = (50 + (p.x - this.center.x) / this.viewWidth * 100) + '%';
      label.style.top = (50 + (p.y - this.center.y) / this.viewHeight * 100) + '%';
    }
  }
  private updateCamera(blend: number) {
    if (this.overview) this.center = { ...midpoint };
    else {
      const x = clamp(this.location.x, this.viewWidth / 2, frame.width - this.viewWidth / 2);
      const y = clamp(this.location.y - this.viewHeight * .18, this.viewHeight / 2, frame.height - this.viewHeight / 2);
      this.center.x += (x - this.center.x) * blend;
      this.center.y += (y - this.center.y) * blend;
    }
    placeCamera(this.camera, this.center, this.viewWidth, this.viewHeight);
  }
  private toggleMap() {
    this.overview = !this.overview;
    this.camera.layers.set(this.overview ? 1 : 0);
    this.held.clear();
    this.root.dataset.overview = String(this.overview);
    this.root.querySelector('[data-coast="map"]')!.setAttribute('aria-pressed', String(this.overview));
    this.root.querySelector<HTMLElement>('.moonbay-map')!.hidden = !this.overview;
    this.resize();
    this.renderer?.render(this.scene,this.camera);
  }
  private pick = (event: PointerEvent) => {
    if (!this.walker || this.overview || this.locked || event.button !== 0 || !event.isPrimary) return;
    const box = this.renderer!.domElement.getBoundingClientRect();
    this.walkTo({
      x: this.center.x + ((event.clientX - box.left) / box.width - .5) * this.viewWidth,
      y: this.center.y + ((event.clientY - box.top) / box.height - .5) * this.viewHeight,
    });
  };
  private cancelRoute() {
    this.route = []; this.destination = ''; this.marker.visible = false;
    delete this.root.dataset.arrived;
  }
  private walkTo(point: Point, district = '') {
    const route = findRoute(this.location, point);
    if (!route.length) return;
    this.cancelRoute(); this.route = route; this.destination = district;
    groundAt(point,this.marker.position); this.marker.position.y += .04; this.marker.visible = true;
  }
  private moveTo(next: Point) {
    const dx = next.x - this.location.x, dy = next.y - this.location.y;
    if (Math.abs(dx) + Math.abs(dy) < .00001) return false;
    this.heading = Math.atan2(dx, dy / squash);
    this.location = { x: next.x, y: next.y };
    return true;
  }
  private manual(dx: number, dy: number) {
    const p = this.location;
    for (const candidate of [{ x:p.x+dx, y:p.y+dy }, { x:p.x+dx, y:p.y }, { x:p.x, y:p.y+dy }]) {
      if (clearWalk(p,candidate) && this.moveTo(candidate)) return true;
    }
    return false;
  }
  private advance(limit: number) {
    let dx = 0, dy = 0;
    for (const key of this.held) { dx += keys[key][0]; dy += keys[key][1]; }
    if (dx || dy) {
      const stride = limit / Math.hypot(dx,dy);
      return this.manual(dx * stride, dy * stride * squash);
    }
    let moved = false;
    while (limit > 0 && this.route.length) {
      const target = this.route[0], d = distance(this.location,target);
      if (d <= limit) { moved = this.moveTo(target) || moved; this.route.shift(); limit -= d; }
      else {
        const fraction = limit / d;
        moved = this.moveTo({ x: this.location.x + (target.x-this.location.x)*fraction,
          y: this.location.y + (target.y-this.location.y)*fraction }) || moved;
        break;
      }
    }
    if (!this.route.length && this.marker.visible) {
      this.marker.visible = false;
      if (this.destination) this.root.dataset.arrived = this.destination;
    }
    return moved;
  }
  private draw = (time: number) => {
    const dt = this.last ? Math.min(.12,(time-this.last)/1000) : 0;
    this.last = time;
    const moving = !this.locked && !this.overview && !document.hidden && this.advance(SPEED * dt);
    const p = this.location;
    groundAt(p,this.ground);
    this.walker!.pivot.position.copy(this.ground);
    const apparentScale = .79 + .42 * p.y / frame.height;
    this.walker!.pivot.scale.setScalar(apparentScale);
    this.shadow.scale.setScalar(apparentScale);
    this.walker!.update(dt,moving,this.heading);
    this.shadow.position.copy(this.ground);
    this.shadow.position.y += .015;
    this.updateCamera(this.reducedMotion ? 1 : 1-Math.exp(-dt*8));
    const district = places.reduce((best, place) => distance(p,place) < distance(p,best) ? place : best);
    if (district.id !== this.root.dataset.district) {
      this.root.dataset.district = district.id;
      this.root.querySelector('.moonbay-area strong')!.textContent = this.t(district.zh,district.en);
    }
    this.root.dataset.x = p.x.toFixed(1);
    this.root.dataset.y = p.y.toFixed(1);
    this.root.dataset.gait = moving ? 'Walk' : 'Idle';
    if (!document.hidden) this.renderer!.render(this.scene,this.camera);
    this.raf = requestAnimationFrame(this.draw);
  };
  destroy() {
    this.controller.abort(); this.observer?.disconnect(); cancelAnimationFrame(this.raf);
    if (this.walker) { this.scene.remove(this.walker.pivot); this.walker.release(); }
    // The shadow and marker are allocated before asynchronous loading finishes.
    this.scene.add(this.shadow,this.marker);
    disposeGroup(this.scene); this.scene.clear(); this.renderer?.dispose();
    this.root.replaceChildren();
    for (const key of ['ready','overview','compact','arrived','district','model','joints','x','y','gait']) delete this.root.dataset[key];
  }
}
