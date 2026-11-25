import Phaser from 'phaser';
import { WORLD, OBJECTS, SCENERY, interactionPoint, zoneAt, safeVisualPosition, walkable, clearLine, type ParkObject } from '../../lib/park-world.mjs';
import { GARDEN_PLOTS } from '../../lib/park-layout-v4.mjs';
import {SCENE_PROJECTS} from '../../lib/park-projects.mjs';
import {SharedSceneArt} from './scene-project-art';
import type {ParkBag} from '../../lib/park-market.mjs';
import type { GardenState } from '../../lib/park-garden.mjs';
import { PetAvatar } from '../game/PetAvatar';
import { petForDisplay } from '../game/petDisplay';
import type { Bootstrap, Identity, PetAction, PetFacing } from '../types';
import type { ParkFrame, ParkPeer, ParkProgress } from './types';
import type { ParkClient } from './client';
import { preloadWorldArt, drawWorldTerrain, drawWorldScenery, drawWorldObject, addWorldAmbience } from './world-art';
interface Model {
  bootstrap: Bootstrap; identity: Identity; client: ParkClient; progress: ParkProgress;
  onObject(object: ParkObject): void; onNear(object?: ParkObject): void;
  onPeer(id: string): void;
  onPlot(id: string): void;
  onLitter(id:string):void;
  onZone(id: string): void; onError(message: string): void;
  onReady(): void;
  onFailed(message:string): void;
  trackedQuest?: string;
}
interface Actor { avatar: PetAvatar; label: Phaser.GameObjects.Text; bubble: Phaser.GameObjects.Text; signature: string; facing: PetFacing; moving: boolean; actionUntil?: number }
export class ParkScene extends Phaser.Scene {
  model!: Model;
  actors = new Map<string, Actor>();
  private loadingPeers = new Set<string>();
  private follow?: Phaser.GameObjects.Zone;
  private target?: { x: number; y: number };
  private pendingObject?: ParkObject;
  private pendingPlot?: string;
  private pendingGardenPoint?: { x:number; y:number };
  private plotViews = new Map<string, { crops: Phaser.GameObjects.Image[]; label: Phaser.GameObjects.Text; seed?: string; readyAt?: number }>();
  private sharedScene?:SharedSceneArt;
  private litter=new Map<string,Phaser.GameObjects.Image>();
  private pendingLitter?:{id:string;x:number;y:number};
  private fixedLabels: Phaser.GameObjects.Text[] = [];
  private failedAssets:string[] = [];
  private artworkFailed=false;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private lastInput = 0;
  private mask = 0;
  private lastZone = '';
  private nearest?: ParkObject;
  private lastRoster = '';
  private abort?: AbortController;
  private foreground: Phaser.GameObjects.Sprite[] = [];
  touchMask = 0;
  blocked = false;
  route: { x: number; y: number }[] = [];
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || localStorage.getItem('pet-reduced-motion') === '1';
  constructor() { super('Park'); }
  init(model: Model) { this.model = model; }
  private queueAssets(peer: ParkPeer) {
    const catalog = this.model.bootstrap.catalog, definition = catalog.pets.find(p => p.id === peer.pet.speciesId);
    if (!definition) return;
    const pet = petForDisplay(peer.pet), layout = catalog.animationByPet?.[definition.id] ?? catalog.animation;
    if (!PetAvatar.preload(this, definition, pet.stage, layout, pet.equippedWearables, catalog.outfitAtlases)) {
      const key = `park:pet:${definition.id}`; if (!this.textures.exists(key)) this.load.image(key, definition.art[pet.stage - 1]);
    }
    PetAvatar.preloadWearables(this, pet.equippedWearables, catalog.wearables);
    PetAvatar.preloadRedrawnWearables(this, definition, pet.stage, pet.equippedWearables, catalog.redrawnWearables);
  }
  preload() {
    (window as any).BuiLoading?.watchScene(this, { recoverOnError:false });
    preloadWorldArt(this);
    this.load.on('loaderror',(file:Phaser.Loader.File)=>this.failedAssets.push(file.key));
    for (const peer of this.model.client.peers) this.queueAssets(peer);
  }
  create() {
    if(this.failedAssets.length){this.artworkFailed=true;this.blocked=true;this.model.onFailed(this.model.identity.language==='en-US'?'Some park artwork could not load. Please retry.':'部分樂園圖片未能載入，請重試。');return;}
    this.cameras.main.setBackgroundColor('#8eab65');
    drawWorldTerrain(this);
    for (const object of OBJECTS) this.drawObject(object);
    for (const decoration of SCENERY) drawWorldScenery(this, decoration);
    addWorldAmbience(this, this.reducedMotion);
    this.sharedScene=new SharedSceneArt(this,this.model.identity.language==='en-US',id=>{if(!this.blocked&&this.model.client.ready)this.walkToGarden(id);});this.fixedLabels.push(...this.sharedScene.labels);
    for (const plot of GARDEN_PLOTS) {
      const crops = Array.from({length:9}, (_,i) => {
        const x = plot.x + 45 + (i % 3) * 85, y = plot.y + 43 + Math.floor(i / 3) * 51;
        return this.add.image(x, y, 'park:material:sprout').setOrigin(.5,1).setVisible(false).setDepth(y + 1);
      });
      const label = this.add.text(plot.x + plot.width / 2, plot.y - 72, this.model.identity.language === 'en-US' ? 'Plant together' : '一起種花', { fontFamily:'"Microsoft JhengHei",sans-serif',fontSize:'12px',color:'#496a4c',backgroundColor:'#fff9e9e8',padding:{x:8,y:4} }).setResolution(2).setOrigin(.5);
      label.setDepth(plot.y + plot.height + 200); this.fixedLabels.push(label); this.plotViews.set(plot.id, { crops, label });
      const target = this.add.zone(plot.x, plot.y, plot.width, plot.height).setOrigin(0).setDepth(plot.y + plot.height + 150).setInteractive({ useHandCursor:true });
      target.on('pointerup', (pointer: Phaser.Input.Pointer) => { if (!this.blocked && pointer.getDistance() < 18) this.walkToGarden(plot.id); });
    }
    const self = this.model.client.frames.get(this.model.client.selfId) || WORLD.spawn;
    this.follow = this.add.zone(self.x, self.y - this.cameraLead(), 1, 1);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.startFollow(this.follow, true, this.reducedMotion ? 1 : .14, this.reducedMotion ? 1 : .14);
    this.resize(); this.scale.on('resize', this.resize, this);
    this.keys = this.input.keyboard?.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard?.on('keydown-E', () => { if (!this.blocked && this.nearest && this.model.client.ready) this.walkToObject(this.nearest.id); });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer, targets: Phaser.GameObjects.GameObject[]) => {
      if (this.blocked || !this.model.client.ready || targets.length || pointer.getDistance() > 18) return;
      this.pendingLitter=undefined; this.pendingObject = undefined; this.pendingPlot = undefined; this.walk(pointer.worldX, pointer.worldY);
    });
    this.abort = new AbortController();
    this.model.client.addEventListener('roster', () => this.syncActors(), { signal: this.abort.signal });
    this.model.client.addEventListener('effect', event => this.effect((event as CustomEvent).detail.objectId), { signal: this.abort.signal });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.model.client.input(0); this.abort?.abort(); this.scale.off('resize', this.resize, this);
      this.actors.clear(); this.loadingPeers.clear(); this.foreground = [];
    });
    this.syncActors(); this.model.onZone(zoneAt(self).id);
    this.model.onReady();
  }
  private resize() {
    const zoom = Phaser.Math.Clamp(this.scale.width / 2250, .5, .68); this.cameras.main.setZoom(zoom);
    for (const label of this.fixedLabels) label.setScale(1 / zoom);
  }
  private cameraLead() { return Math.min(300, this.scale.height / Phaser.Math.Clamp(this.scale.width / 2250,.5,.68) * .22); }
  private drawObject(object: ParkObject) {
    const npc = object.kind === 'npc';
    const image = drawWorldObject(this, object);
    image.setInteractive({ useHandCursor: true, pixelPerfect: true, alphaTolerance: 30 });
    image.on('pointerup', (pointer: Phaser.Input.Pointer) => { if (!this.blocked && pointer.getDistance() < 18) this.walkToObject(object.id); });
    if (npc) {
      const locale = this.model.identity.language;
      const title = this.add.text(object.x, object.y - image.displayHeight - 39, object.name[locale], { fontFamily: '"Microsoft JhengHei",sans-serif', fontSize: '12px', color: '#304f47', backgroundColor: '#fff8e9f0', padding: { x: 8, y: 4 } }).setResolution(2).setOrigin(.5).setDepth(object.y + 1);
      const role = this.add.text(object.x, object.y - image.displayHeight - 2, object.role?.[locale] || '', { fontFamily:'"Microsoft JhengHei",sans-serif',fontSize:'11px',color:'#526f54',backgroundColor:'#fff8e9e8',padding:{x:5,y:2} }).setResolution(2).setOrigin(.5).setDepth(object.y + 1);
      this.fixedLabels.push(title, role);
      this.foreground.push(image);
    }
    if (object.kind === 'house') this.fixedLabels.push(this.add.text(object.x + 105, object.y - 38, this.model.identity.language === 'en-US' ? 'MY HOME' : '我的家', { fontFamily:'"Microsoft JhengHei",sans-serif',fontSize:'12px',color:'#496b56',backgroundColor:'#fff1d7',padding:{x:8,y:4} }).setResolution(2).setOrigin(.5).setDepth(object.y + 1));
    if (object.game || object.kind === 'pump') this.fixedLabels.push(this.add.text(object.x, object.y - image.displayHeight - 27, object.name[this.model.identity.language], { fontFamily:'"Microsoft JhengHei",sans-serif',fontSize:'12px',color:'#466950',backgroundColor:'#fff1d9',padding:{x:8,y:4} }).setResolution(2).setOrigin(.5).setDepth(object.y + 2));
  }
  private syncActors() {
    if (!this.sys.isActive()) return;
    const peers = this.model.client.peers, ids = new Set(peers.map(p => p.id));
    for (const [id, actor] of this.actors) if (!ids.has(id)) { actor.avatar.destroy(); actor.label.destroy(); actor.bubble.destroy(); this.actors.delete(id); }
    for (const peer of peers) {
      const signature = peer.pet.speciesId + ':' + peer.pet.equippedWearables.join('+');
      if (this.actors.get(peer.id)?.signature === signature || this.loadingPeers.has(peer.id)) continue;
      this.loadingPeers.add(peer.id); this.queueAssets(peer);
      const build = () => {
        this.loadingPeers.delete(peer.id);
        if (!this.sys.isActive() || !this.model.client.peers.some(p => p.id === peer.id)) return;
        const catalog = this.model.bootstrap.catalog, definition = catalog.pets.find(p => p.id === peer.pet.speciesId); if (!definition) return;
        const previous = this.actors.get(peer.id); previous?.avatar.destroy(); previous?.label.destroy(); previous?.bubble.destroy();
        const position = this.model.client.frames.get(peer.id) || WORLD.spawn;
        const avatar = new PetAvatar(this, position.x, position.y, definition, petForDisplay(peer.pet), {
          layout: catalog.animationByPet?.[definition.id] ?? catalog.animation, fallbackTexture: `park:pet:${definition.id}`,
          scale: .76, feetOnOrigin: true, wearables: catalog.wearables, outfitAtlases: catalog.outfitAtlases, redrawnWearables: catalog.redrawnWearables,
        });
        if (peer.id !== this.model.client.selfId) {
          avatar.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-75, -150, 150, 150), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
          avatar.on('pointerup', (pointer: Phaser.Input.Pointer) => { if (!this.blocked && this.model.client.ready && pointer.getDistance() < 18) this.model.onPeer(peer.id); });
        }
        const label = this.add.text(position.x, position.y - 160, peer.name, { fontFamily: '"Microsoft JhengHei",sans-serif',fontSize:'12px', color: peer.id === this.model.identity.id ? '#466c5a' : '#52666c', backgroundColor:'#fff9ebed',padding:{x:7,y:3} }).setResolution(2).setOrigin(.5);
        const bubble = this.add.text(position.x, position.y - 205, '', { fontFamily:'"Microsoft JhengHei",sans-serif',fontSize:'13px',color:'#496452',backgroundColor:'#fff6df',padding:{x:10,y:6} }).setResolution(2).setOrigin(.5).setVisible(false);
        this.actors.set(peer.id, { avatar, label, bubble, signature, facing: 'front', moving: false });
      };
      if (!this.load.isLoading() && this.load.list.size === 0) build();
      else { this.load.once(Phaser.Loader.Events.COMPLETE, build); if (!this.load.isLoading()) this.load.start(); }
    }
  }
  setBag(bag:ParkBag){
    const available=bag.eco.accepted&&!bag.eco.claimed&&bag.eco.picked.length<5?bag.eco.spots.filter(p=>!bag.eco.picked.includes(p.id)):[];
    const ids=new Set(available.map(p=>p.id));for(const[id,image]of this.litter)if(!ids.has(id)){image.destroy();this.litter.delete(id);}
    for(const p of available)if(!this.litter.has(p.id)){const image=this.add.image(p.x,p.y,'park:market:'+p.kind).setOrigin(.5,.8).setDepth(p.y+1).setData('litterId',p.id);image.setScale(70/image.width);const hitSize=100/image.scaleX;image.setInteractive({hitArea:new Phaser.Geom.Rectangle(image.width/2-hitSize/2,image.height*.8-hitSize/2,hitSize,hitSize),hitAreaCallback:Phaser.Geom.Rectangle.Contains,useHandCursor:true});image.on('pointerup',(pointer:Phaser.Input.Pointer)=>{if(!this.blocked&&pointer.getDistance()<18)this.walkToLitter(p.id,p);});this.litter.set(p.id,image);}
  }
  walkToLitter(id:string,point:{x:number;y:number}){this.pendingObject=undefined;this.pendingPlot=undefined;this.pendingLitter={id,...point};this.walk(point.x,point.y);}
  setProgress(progress: ParkProgress) { this.model.progress = progress; }
  setGardenState(state: GardenState) {
    this.sharedScene?.update(state,this.model.identity.language==='en-US');
    for (const plot of GARDEN_PLOTS) {
      const data = state.plots[plot.id], view = this.plotViews.get(plot.id); if (!data || !view) continue;
      view.seed = data.seed || undefined; view.readyAt = data.readyAt || undefined;
      const active = data.stage !== 'empty';
      for (const crop of view.crops) {
        crop.setVisible(active); if (!active) continue;
        const ripe = data.stage === 'ready', texture = ripe ? 'park:material:crop-' + (data.seed === 'sunflowers' ? 'sunflowers' : data.seed === 'daisies' ? 'daisies' : 'tulips') : 'park:material:sprout';
        crop.setTexture(texture); const width = ripe ? 76 : data.stage === 'growing' ? 49 : 31; crop.setScale(width / crop.width);
      }
      const english = this.model.identity.language === 'en-US';
      view.label.setText(data.stage === 'empty' ? english ? 'Plant together' : '一起種花' : data.stage === 'thirsty' ? english ? 'Needs water' : '小芽想喝水' : data.stage === 'ready' ? english ? 'Ready to pick' : '花朵盛開了' : english ? 'Growing…' : '正在長大…');
    }
  }
  walkToGarden(id: string) {
    if (this.blocked || !this.model.client.ready) return;
    const plot = GARDEN_PLOTS.find(p => p.id === id)||SCENE_PROJECTS.find(p=>p.id===id); if (!plot) return;
    this.pendingObject = undefined; this.pendingPlot = id;
    const self = this.model.client.frames.get(this.model.client.selfId);
    const others = [...this.model.client.frames.values()].filter(p => p.id !== this.model.client.selfId && p.active && Math.hypot(p.x-plot.at.x,p.y-plot.at.y)<320);
    const candidates = [[-78,0],[78,0],[-130,70],[130,70],[0,100]].map(([x,y])=>({x:plot.at.x+x,y:plot.at.y+y})).filter(p=>walkable(p.x,p.y)&&clearLine(p,plot.at));
    const space = (p:{x:number;y:number}) => Math.min(200,...others.map(o=>Math.hypot(o.x-p.x,o.y-p.y)));
    candidates.sort((a,b)=>space(b)-space(a)|| (self ? Math.hypot(self.x-a.x,self.y-a.y)-Math.hypot(self.x-b.x,self.y-b.y):0));
    const target = candidates[0] || plot.at; this.pendingGardenPoint = target;
    if (self && Math.hypot(self.x - target.x, self.y - target.y) < 38) { this.pendingPlot = undefined; this.pendingGardenPoint = undefined; this.model.onPlot(id); }
    else this.walk(target.x, target.y);
  }
  trackQuest(id?: string) { this.model.trackedQuest = id; }
  walkToObject(id: string) {
    if (this.blocked || !this.model.client.ready) return;
    const object = OBJECTS.find(o => o.id === id); if (!object) return;
    this.pendingObject = object;
    this.pendingPlot = undefined;
    const point = interactionPoint(object), self = this.model.client.frames.get(this.model.client.selfId);
    if (self && Math.hypot(self.x - point.x, self.y - point.y) < 120) { this.pendingObject = undefined; this.model.onObject(object); return; }
    this.walk(point.x, point.y);
  }
  walk(x: number, y: number) {
    this.target = { x, y };
    this.model.client.move(x, y).then(result => { if (!this.blocked && this.target?.x === x && this.target?.y === y) this.route = result.path; }).catch(error => { this.pendingObject = undefined; this.clearRoute(); this.model.onError(error.message); });
  }
  clearRoute() { this.route = []; this.target = undefined; }
  setBlocked(blocked: boolean) { this.blocked = blocked; this.touchMask = 0; this.mask = 0; if (!this.model || !this.sys.isActive()) return; if (blocked) this.model.client.stop(); else this.model.client.input(0); this.input.keyboard?.resetKeys(); if (blocked) { this.pendingLitter=undefined; this.pendingObject = undefined; this.pendingPlot = undefined; this.clearRoute(); } }
  playAction(action: PetAction) { this.actors.get(this.model.client.selfId)?.avatar.play(action); }
  socialEffect(members: { id: string; x: number; y: number }[]) {
    for (const member of members) { const actor = this.actors.get(member.id); if (actor) { actor.avatar.play('happy'); actor.actionUntil = this.time.now + 1100; } }
    if (this.reducedMotion || !members.length) return;
    const x = members.reduce((sum, p) => sum + p.x, 0) / members.length, y = members.reduce((sum, p) => sum + p.y, 0) / members.length - 100;
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7, spark = this.add.star(x, y, 5, 3, 8, i % 2 ? 0xe9bd64 : 0xfaf0c7, .95).setDepth(y + 400);
      this.tweens.add({ targets: spark, x: x + Math.cos(angle) * 75, y: y + Math.sin(angle) * 45 - 25, alpha: 0, scale: .4, duration: 750, onComplete: () => spark.destroy() });
    }
  }
  effect(id: string) {
    const object = OBJECTS.find(o => o.id === id); if (!object || this.reducedMotion) return;
    const color = object.kind === 'flowers' ? 0xa6c9dd : ['chime', 'bell', 'drum'].includes(object.kind) ? 0xe5c57b : 0xf7e8b9;
    const ring = this.add.ellipse(object.x, object.y - 25, 45, 20).setStrokeStyle(3, color, .9).setDepth(object.y + 5);
    this.tweens.add({ targets: ring, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 1000, onComplete: () => ring.destroy() });
    for (let i = 0; i < 5; i++) { const dot = this.add.circle(object.x - 35 + i * 17, object.y - 45, 3 + i % 2, color, .9).setDepth(object.y + 5); this.tweens.add({ targets: dot, y: dot.y - 45 - i * 6, x: dot.x + (i - 2) * 11, alpha: 0, duration: 800 + i * 60, onComplete: () => dot.destroy() }); }
  }
  update(time: number, delta: number) {
    if(this.artworkFailed)return;
    const client = this.model.client;
    let mask = this.touchMask;
    if (!this.blocked && client.ready && !document.hidden) {
      if (this.keys?.A.isDown || this.keys?.LEFT.isDown) mask |= 1;
      if (this.keys?.D.isDown || this.keys?.RIGHT.isDown) mask |= 2;
      if (this.keys?.W.isDown || this.keys?.UP.isDown) mask |= 4;
      if (this.keys?.S.isDown || this.keys?.DOWN.isDown) mask |= 8;
    } else mask = 0;
    if (mask !== this.mask || mask && time - this.lastInput > 100) {
      this.mask = mask; this.lastInput = time; client.input(mask, true);
      if (mask) { this.pendingObject = undefined; this.pendingPlot = undefined; this.clearRoute(); }
    }
    const roster = client.peers.map(p => p.id).join(':');
    if (roster !== this.lastRoster) { this.lastRoster = roster; this.syncActors(); }
    for (const [id, actor] of this.actors) {
      const frame = client.frames.get(id); actor.avatar.setVisible(!!frame); actor.label.setVisible(!!frame); if (!frame) { actor.bubble.setVisible(false); continue; }
      const blend = this.reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 100) / 65);
      const seat = frame.seated ? OBJECTS.find(o => o.id === frame.seated) : undefined;
      const position = seat ? { x: seat.x, y: seat.y - 36 } : safeVisualPosition(actor.avatar, frame, blend);
      actor.avatar.setPosition(position.x, position.y);
      actor.avatar.setDepth(actor.avatar.y + 5).setAlpha(frame.active ? 1 : .55);
      if (!actor.actionUntil || time >= actor.actionUntil) { const finishing = !!actor.actionUntil; actor.actionUntil = undefined; if (finishing || frame.facing !== actor.facing || frame.moving !== actor.moving) { actor.facing = frame.facing; actor.moving = frame.moving; actor.avatar.play(frame.moving ? 'walk' : 'idle', frame.facing); } }
      const zoom = this.cameras.main.zoom;
      actor.label.setScale(1 / zoom).setPosition(actor.avatar.x, actor.avatar.y - 163).setDepth(actor.avatar.y + 300);
      const text = frame.emote ? ({ hello: ['你好！', 'Hello!'], happy: ['一起玩！', 'Let’s play!'], thanks: ['謝謝你！', 'Thank you!'] })[frame.emote]?.[this.model.identity.language === 'en-US' ? 1 : 0] : frame.activity ? (frame.activity === 'duet' ? this.model.identity.language === 'en-US' ? 'Playing a duet' : '雙人合奏中' : this.model.identity.language === 'en-US' ? 'Playing a game' : '小遊戲中') : frame.interacting ? '···' : '';
      actor.bubble.setText(text || '').setVisible(!!text).setScale(1 / zoom).setPosition(actor.avatar.x, actor.avatar.y - 163 - 35 / zoom).setDepth(actor.avatar.y + 301);
    }
    const self = client.frames.get(client.selfId), actor = this.actors.get(client.selfId);
    if (self && this.follow) {
      this.follow.setPosition(actor?.avatar.x ?? self.x, (actor?.avatar.y ?? self.y) - this.cameraLead());
      const zone = zoneAt(self); if (zone.id !== this.lastZone) { this.lastZone = zone.id; this.model.onZone(zone.id); }
      let nearest: ParkObject | undefined, distance = 180;
      for (const object of OBJECTS) { const at = interactionPoint(object), d = Math.hypot(self.x - at.x, self.y - at.y); if (d < distance) { distance = d; nearest = object; } }
      if (this.nearest?.id !== nearest?.id) { this.nearest = nearest; this.model.onNear(nearest); }
      if (this.target && Math.hypot(self.x - this.target.x, self.y - this.target.y) < 20) this.clearRoute();
      else while (this.route.length > 1 && Math.hypot(self.x - this.route[0].x, self.y - this.route[0].y) < 75) this.route.shift();
      if (this.pendingObject && !self.moving && !this.blocked) {
        const point = interactionPoint(this.pendingObject);
        if (Math.hypot(self.x - point.x, self.y - point.y) < 135) { const object = this.pendingObject; this.pendingObject = undefined; this.model.onObject(object); }
      }
      if (this.pendingPlot && this.pendingGardenPoint && !self.moving && !this.blocked && Math.hypot(self.x-this.pendingGardenPoint.x,self.y-this.pendingGardenPoint.y)<38) { const id=this.pendingPlot; this.pendingPlot=undefined; this.pendingGardenPoint=undefined; this.model.onPlot(id); }
      if(this.pendingLitter&&!self.moving&&!this.blocked&&Math.hypot(self.x-this.pendingLitter.x,self.y-this.pendingLitter.y)<80){const id=this.pendingLitter.id;this.pendingLitter=undefined;this.model.onLitter(id);}
    }
  }
}
