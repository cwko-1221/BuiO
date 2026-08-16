import Phaser from 'phaser';
import { PetAvatar } from './PetAvatar';
import type { Bootstrap, FurnitureDefinition, PetDefinition, PetInstance, RoomPlacement } from '../types';

interface BedroomData { bootstrap: Bootstrap; activePet: PetInstance; petDefinition: PetDefinition; editing?: boolean }

/** 2:1 isometric tile. Half-extents, so a tile spans 2*TILE_WIDTH by 2*TILE_HEIGHT on screen. */
const TILE_WIDTH = 38;
const TILE_HEIGHT = 19;
const ORIGIN_X = 640;
const ORIGIN_Y = 330;

export class BedroomScene extends Phaser.Scene {
  model!: BedroomData;
  avatar?: PetAvatar;
  placements: RoomPlacement[] = [];
  furniture = new Map<string, Phaser.GameObjects.Container>();
  editing = false;
  roomScale = 1;
  grid?: Phaser.GameObjects.Graphics;
  ghost?: Phaser.GameObjects.Graphics;

  constructor() { super('Bedroom'); }
  init(data: BedroomData) {
    this.model = data;
    this.placements = data.bootstrap.room.placements.map((item) => ({ ...item }));
    this.editing = !!data.editing;
    // Phaser reuses the scene instance across stop/start, so these fields survive a restart.
    // Leaving destroyed containers in the map made setEditing() touch objects whose .input
    // had already been torn down ("Cannot set properties of undefined (setting 'draggable')"),
    // which threw during create() and left the room blank.
    this.furniture.clear();
    this.grid = undefined;
    this.ghost = undefined;
    this.avatar = undefined;
  }
  preload() {
    const catalog = this.model.bootstrap.catalog;
    const room = catalog.rooms.find((entry) => entry.id === this.model.bootstrap.room.themeId);
    if (room) this.load.image('active-room', room.art);

    // Prefer the animated atlas; fall back to the static form art only if it is unavailable.
    const stage = this.model.activePet.stage;
    if (!PetAvatar.preload(this, this.model.petDefinition, stage, catalog.animation)) {
      this.load.image('active-pet', this.model.petDefinition.art[stage - 1]);
    }

    // Real furniture art, one texture per distinct item actually placed in the room.
    for (const itemId of new Set(this.placements.map((placement) => placement.itemId))) {
      const definition = catalog.furniture.find((item) => item.id === itemId);
      if (definition?.art && !this.textures.exists(itemId)) this.load.image(itemId, definition.art);
    }
  }
  create() {
    this.cameras.main.setBackgroundColor('#efe2c8');
    if (this.textures.exists('active-room')) {
      const image = this.add.image(640, 360, 'active-room');
      image.setDisplaySize(1280, 720).setAlpha(.98);
    } else this.drawDollhouse();
    this.drawRoomFrame();
    this.placements.forEach((placement) => this.addFurniture(placement));
    this.avatar = new PetAvatar(this, 640, 475, this.model.petDefinition, this.model.activePet, {
      layout: this.model.bootstrap.catalog.animation,
      fallbackTexture: this.textures.exists('active-pet') ? 'active-pet' : undefined,
      scale: .86,
    });
    this.avatar.setDepth(60);
    this.ghost = this.add.graphics().setDepth(15);
    this.input.on('drag', (_pointer: Phaser.Input.Pointer, target: Phaser.GameObjects.Container, dragX: number, dragY: number) => {
      if (!this.editing || !target.getData('placementId')) return;
      target.x = dragX; target.y = dragY;
      const placement = this.placements.find((item) => item.id === target.getData('placementId'));
      if (placement) this.drawFootprint(placement, this.screenToGrid(dragX, dragY));
    });
    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, target: Phaser.GameObjects.Container) => {
      if (!this.editing) return;
      const placement = this.placements.find((item) => item.id === target.getData('placementId')); if (!placement) return;
      const grid = this.screenToGrid(target.x, target.y);
      // Snap back to the last valid square rather than accepting a drop the server will reject.
      if (this.fits(placement.itemId, grid.x, grid.y, placement.rotation, placement.id)) {
        placement.x = grid.x; placement.y = grid.y;
      }
      const screen = this.gridToScreen(placement.x, placement.y); target.setPosition(screen.x, screen.y);
      target.setDepth(this.depthFor(placement)); // re-sort: moving a piece changes what it occludes
      this.clearFootprint();
      this.game.events.emit('room:placements', this.placements.map((item) => ({ ...item })));
    });
    this.game.events.on('room:set-editing', this.setEditing, this);
    this.game.events.on('room:add-item', this.placeNewItem, this);
    this.game.events.on('room:rotate-selected', this.rotateSelected, this);
    this.game.events.on('room:remove-selected', this.removeSelected, this);
    this.game.events.on('pet:emote', this.petEmote, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off('room:set-editing', this.setEditing, this); this.game.events.off('room:add-item', this.placeNewItem, this);
      this.game.events.off('room:rotate-selected', this.rotateSelected, this); this.game.events.off('room:remove-selected', this.removeSelected, this); this.game.events.off('pet:emote', this.petEmote, this);
    });
  }
  private drawDollhouse() {
    const room = this.model.bootstrap.catalog.rooms.find((entry) => entry.id === this.model.bootstrap.room.themeId)!;
    const graphics = this.add.graphics();
    graphics.fillGradientStyle(Phaser.Display.Color.HexStringToColor(room.primary).color, Phaser.Display.Color.HexStringToColor(room.accent).color, 0xf8e9cb, 0xe1c79e, 1);
    graphics.fillRect(0,0,1280,720); graphics.fillStyle(0xffffff,.36); graphics.fillTriangle(100,90,640,330,640,610); graphics.fillTriangle(1180,90,640,330,640,610);
    graphics.fillStyle(0xf5dfb7,.82); graphics.fillPoints([new Phaser.Math.Vector2(175,430),new Phaser.Math.Vector2(640,228),new Phaser.Math.Vector2(1105,430),new Phaser.Math.Vector2(640,665)],true);
  }
  /** Placement grid. Only meaningful while decorating; otherwise it reads as debug overlay. */
  private drawRoomFrame() {
    const graphics = this.add.graphics().setDepth(12);
    graphics.lineStyle(2, 0xffffff, .22);
    for (let index = 0; index <= 12; index += 1) { const a = this.gridToScreen(index,0); const b = this.gridToScreen(index,10); graphics.lineBetween(a.x,a.y,b.x,b.y); }
    for (let index = 0; index <= 10; index += 1) { const a = this.gridToScreen(0,index); const b = this.gridToScreen(12,index); graphics.lineBetween(a.x,a.y,b.x,b.y); }
    graphics.setVisible(this.editing);
    this.grid = graphics;
  }
  private gridToScreen(x: number, y: number) { return { x: ORIGIN_X + (x - y) * TILE_WIDTH, y: ORIGIN_Y + (x + y) * TILE_HEIGHT }; }
  private screenToGrid(x: number, y: number) {
    const dx = (x - ORIGIN_X) / TILE_WIDTH; const dy = (y - ORIGIN_Y) / TILE_HEIGHT;
    return { x: Phaser.Math.Clamp(Math.round((dx + dy) / 2), 0, 11), y: Phaser.Math.Clamp(Math.round((dy - dx) / 2), 0, 9) };
  }
  /**
   * Footprint preview under a dragged piece: one isometric tile per grid cell it would
   * occupy, green where the drop is legal and red where it is not. Without this a child
   * only discovers an illegal placement when the piece snaps back, with no explanation of
   * how much floor the piece actually needs.
   */
  private drawFootprint(placement: RoomPlacement, cell: { x: number; y: number }) {
    const ghost = this.ghost; if (!ghost) return;
    ghost.clear();
    const [width, height] = this.footprintOf(placement.itemId, placement.rotation);
    const legal = this.fits(placement.itemId, cell.x, cell.y, placement.rotation, placement.id);
    ghost.fillStyle(legal ? 0x53d987 : 0xf2685c, .38);
    ghost.lineStyle(3, legal ? 0x1f9d57 : 0xc2352a, .95);
    for (let x = cell.x; x < cell.x + width; x += 1) {
      for (let y = cell.y; y < cell.y + height; y += 1) {
        // Grid coordinates are lattice points, so a cell spans (x,y) to (x+1,y+1).
        const corners = [
          this.gridToScreen(x, y), this.gridToScreen(x + 1, y),
          this.gridToScreen(x + 1, y + 1), this.gridToScreen(x, y + 1),
        ].map((point) => new Phaser.Math.Vector2(point.x, point.y));
        ghost.fillPoints(corners, true);
        ghost.strokePoints(corners, true, true);
      }
    }
  }

  private clearFootprint() { this.ghost?.clear(); }

  /** Grid footprint after rotation. 90/270 swap the axes, matching the server. */
  private footprintOf(itemId: string, rotation: number): [number, number] {
    const definition = this.model.bootstrap.catalog.furniture.find((item) => item.id === itemId);
    const [width, height] = definition?.footprint || [1, 1];
    return rotation === 90 || rotation === 270 ? [height, width] : [width, height];
  }

  /**
   * Mirrors the server's validatePlacements() rules: inside the 12x10 grid, and no footprint
   * overlap within a layer. Without this the client happily lets a child drop a 3x2 bed across
   * a table and only surfaces "Furniture footprints overlap" when they press save, discarding
   * the whole arrangement.
   */
  private fits(itemId: string, x: number, y: number, rotation: number, ignorePlacementId?: string) {
    const catalog = this.model.bootstrap.catalog;
    const definition = catalog.furniture.find((item) => item.id === itemId);
    if (!definition) return false;
    const [width, height] = this.footprintOf(itemId, rotation);
    if (x < 0 || y < 0 || x + width > 12 || y + height > 10) return false;
    if (definition.layer === 'wall') return true; // wall pieces are not occupancy-checked

    const occupied = new Set<string>();
    for (const placement of this.placements) {
      if (placement.id === ignorePlacementId) continue;
      const other = catalog.furniture.find((item) => item.id === placement.itemId);
      if (!other || other.layer !== definition.layer) continue;
      const [otherWidth, otherHeight] = this.footprintOf(placement.itemId, placement.rotation);
      for (let px = placement.x; px < placement.x + otherWidth; px += 1) {
        for (let py = placement.y; py < placement.y + otherHeight; py += 1) occupied.add(`${px}:${py}`);
      }
    }
    for (let px = x; px < x + width; px += 1) {
      for (let py = y; py < y + height; py += 1) if (occupied.has(`${px}:${py}`)) return false;
    }
    return true;
  }

  /**
   * Depth in an isometric room is distance along the view axis, which is (x + y) — sorting by
   * y alone lets a chair at (0,4) incorrectly overlap a table at (4,0). Rugs lie on the floor
   * plane and wall pieces sit behind everything, so those layers get their own bands.
   */
  private depthFor(placement: RoomPlacement) {
    if (placement.layer === 'wall') return 5;
    if (placement.layer === 'rug') return 10 + (placement.x + placement.y) * .01;
    return 20 + (placement.x + placement.y);
  }

  private addFurniture(placement: RoomPlacement) {
    const definition = this.model.bootstrap.catalog.furniture.find((item) => item.id === placement.itemId); if (!definition) return;
    const point = this.gridToScreen(placement.x, placement.y);
    const container = this.add.container(point.x, point.y).setDepth(this.depthFor(placement));
    const art = this.furnitureArt(definition, placement); container.add(art);
    container.setAngle(placement.rotation);
    const [footprintX, footprintY] = definition.footprint || [1, 1];
    container.setSize(Math.max(64, footprintX * TILE_WIDTH), Math.max(56, footprintY * TILE_HEIGHT * 2)).setInteractive({ draggable: true, useHandCursor: true });
    container.setData('placementId', placement.id); this.input.setDraggable(container, this.editing);
    container.on('pointerdown', () => { this.furniture.forEach((item) => item.setAlpha(1)); container.setAlpha(.7); this.game.events.emit('room:selected', placement.id); });
    this.furniture.set(placement.id, container);
  }

  private furnitureArt(definition: FurnitureDefinition, placement: RoomPlacement) {
    const container = this.add.container();
    if (this.textures.exists(definition.id)) {
      const [footprintX, footprintY] = definition.footprint || [1, 1];
      const image = this.add.image(0, 0, definition.id);
      // Props do not fill or centre their canvas, so fit and anchor against the measured
      // content box. Using the canvas instead renders a 1x1 piece at roughly a third of its
      // intended size and offset from where it was placed.
      const box = definition.content ?? { x: 0, y: 0, width: 1, height: 1 };
      // An fx-by-fy footprint spans (fx + fy) half-tiles horizontally in 2:1 isometric.
      const targetWidth = (footprintX + footprintY) * TILE_WIDTH;
      image.setScale(targetWidth / Math.max(1, box.width * image.width));
      // Origin is expressed in canvas fractions: horizontally centred on the object, and
      // vertically at its base so it stands on the floor (rugs sit on their own centre).
      image.setOrigin(
        box.x + box.width / 2,
        placement.layer === 'rug' ? box.y + box.height / 2 : box.y + box.height,
      );
      container.add(image);
      return container;
    }
    // Fallback while the prop pipeline has not produced this item: a neutral shaded block.
    // Never label it with its index — a number printed on a box is not furniture.
    const color = Phaser.Display.Color.HexStringToColor(this.model.bootstrap.catalog.rooms.find((room) => room.id === definition.roomId)?.accent || '#d8a46c').color;
    container.add([
      this.add.ellipse(0, 14, 84, 34, 0x22303f, .22),
      this.add.ellipse(0, 0, 78, 52, color).setStrokeStyle(3, 0xffffff, .35),
    ]);
    return container;
  }
  private setEditing(value: boolean) {
    this.editing = value;
    this.grid?.setVisible(value);
    if (!value) this.clearFootprint();
    this.furniture.forEach((item, id) => {
      // A container destroyed by a scene restart keeps its map entry but loses its input;
      // drop it rather than trusting it. The non-null assertion here used to throw.
      if (!item.active || !item.input) { this.furniture.delete(id); return; }
      this.input.setDraggable(item, value);
      item.input.draggable = value;
    });
  }
  private placeNewItem(itemId: string) {
    if (!this.editing || this.placements.length >= 80) return;
    const definition = this.model.bootstrap.catalog.furniture.find((item) => item.id === itemId); if (!definition) return;
    // Scan for a square where the whole footprint actually fits, not merely a free single cell.
    let spot: { x: number; y: number } | null = null;
    outer: for (let y = 0; y < 10; y += 1) for (let x = 0; x < 12; x += 1) {
      if (this.fits(itemId, x, y, 0)) { spot = { x, y }; break outer; }
    }
    if (!spot) { this.game.events.emit('room:full', itemId); return; }
    const placement = { id: crypto.randomUUID(), itemId, x: spot.x, y: spot.y, rotation: 0, layer: definition.layer };
    this.placements.push(placement);
    // Items placed mid-session were never in preload(), so fetch the texture on demand and
    // draw once it lands; otherwise the piece would render as the fallback block forever.
    if (definition.art && !this.textures.exists(itemId)) {
      this.load.image(itemId, definition.art);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => { if (this.scene.isActive()) this.addFurniture(placement); });
      this.load.start();
    } else this.addFurniture(placement);
    this.game.events.emit('room:placements', this.placements.map((item) => ({...item})));
  }
  private rotateSelected(id: string) {
    const placement = this.placements.find((item) => item.id === id); const object = this.furniture.get(id);
    if (!placement || !object) return;
    const rotation = (placement.rotation + 90) % 360;
    // A non-square footprint can stop fitting once turned; refuse rather than save an invalid room.
    if (!this.fits(placement.itemId, placement.x, placement.y, rotation, placement.id)) {
      this.game.events.emit('room:blocked', placement.id);
      return;
    }
    placement.rotation = rotation; object.setAngle(rotation);
    this.game.events.emit('room:placements', this.placements.map((item) => ({ ...item })));
  }
  private removeSelected(id: string) { const index = this.placements.findIndex((item) => item.id === id); if (index < 0) return; this.placements.splice(index,1); this.furniture.get(id)?.destroy(); this.furniture.delete(id); this.game.events.emit('room:placements', this.placements); }
  private petEmote(type: 'happy'|'eat'|'attack'|'hurt'|'sleep'|'evolve') { this.avatar?.emote(type); }
}
