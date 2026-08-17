import Phaser from 'phaser';
import { PetAvatar } from './PetAvatar';
import type { Bootstrap, FurnitureDefinition, PetDefinition, PetInstance, RoomPlacement } from '../types';

interface BedroomData { bootstrap: Bootstrap; activePet: PetInstance; petDefinition: PetDefinition; editing?: boolean }

type FurnitureHitArea = {
  tile: Phaser.Geom.Polygon;
  scene: Phaser.Scene;
  /** Everything needed to map a container-local point back into texture pixels. */
  art?: { key: string; offsetY: number; angle: number; scale: number; originX: number; originY: number; flipped: boolean };
};

/**
 * Hit the drawn pixels, or the tiles the piece stands on.
 *
 * A bounding rectangle is the wrong shape for isometric furniture: a lamp on a post is mostly
 * empty space inside its own box, and neighbouring boxes overlap heavily. Phaser then picks
 * whichever overlapping object sits highest, so tapping the post of one piece would grab the
 * table beside it, and tapping the piece itself did nothing. Sampling the texture's alpha means
 * a tap lands on whatever is actually drawn under the finger.
 *
 * The footprint tiles stay as a second region so flat rugs, and the empty floor a piece stands
 * on, remain grabbable.
 */
const hitTest = (area: FurnitureHitArea, x: number, y: number) => {
  const art = area.art;
  if (art) {
    // Undo the container-local transform: shift by the art's offset, unrotate, unscale, then
    // move from origin-relative to top-left texture coordinates.
    let localX = x;
    let localY = y - art.offsetY;
    if (art.angle) {
      const radians = -art.angle * Math.PI / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      [localX, localY] = [localX * cos - localY * sin, localX * sin + localY * cos];
    }
    const source = area.scene.textures.get(art.key)?.getSourceImage() as { width: number; height: number } | undefined;
    if (source) {
      const textureX = Math.round(localX / art.scale + art.originX * source.width);
      const textureY = Math.round(localY / art.scale + art.originY * source.height);
      const sampleX = art.flipped ? source.width - 1 - textureX : textureX;
      if (sampleX >= 0 && textureY >= 0 && sampleX < source.width && textureY < source.height) {
        const pixel = area.scene.textures.getPixelAlpha(sampleX, textureY, art.key);
        if (pixel !== null && pixel > 8) return true;
      }
    }
  }
  return Phaser.Geom.Polygon.Contains(area.tile, x, y);
};

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
  roomTextureKey = '';
  petTextureKey = '';

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
    // Key textures by identity, never by role. Phaser skips any load whose key is already in
    // the texture cache, so a fixed 'active-room' key meant the first theme loaded won for the
    // whole session: switching themes silently kept the old art until a page reload cleared
    // the cache. The same trap applies to the pet's fallback art when the active pet changes.
    this.roomTextureKey = room ? `room:${room.id}` : '';
    if (room && !this.textures.exists(this.roomTextureKey)) this.load.image(this.roomTextureKey, room.art);

    // Prefer the animated atlas; fall back to the static form art only if it is unavailable.
    const stage = this.model.activePet.stage;
    if (!PetAvatar.preload(this, this.model.petDefinition, stage, catalog.animation)) {
      this.petTextureKey = `pet:${this.model.petDefinition.id}:${stage}`;
      if (!this.textures.exists(this.petTextureKey)) this.load.image(this.petTextureKey, this.model.petDefinition.art[stage - 1]);
    } else this.petTextureKey = '';

    // Real furniture art, one texture per distinct item actually placed in the room.
    for (const itemId of new Set(this.placements.map((placement) => placement.itemId))) {
      const definition = catalog.furniture.find((item) => item.id === itemId);
      if (definition?.art && !this.textures.exists(itemId)) this.load.image(itemId, definition.art);
    }
  }
  create() {
    this.cameras.main.setBackgroundColor('#efe2c8');
    if (this.roomTextureKey && this.textures.exists(this.roomTextureKey)) {
      const image = this.add.image(640, 360, this.roomTextureKey);
      image.setDisplaySize(1280, 720).setAlpha(.98);
    } else this.drawDollhouse();
    this.drawRoomFrame();
    this.placements.forEach((placement) => this.addFurniture(placement));
    this.avatar = new PetAvatar(this, 640, 475, this.model.petDefinition, this.model.activePet, {
      layout: this.model.bootstrap.catalog.animation,
      fallbackTexture: this.petTextureKey && this.textures.exists(this.petTextureKey) ? this.petTextureKey : undefined,
      scale: .86,
    });
    this.avatar.setDepth(60);
    this.ghost = this.add.graphics().setDepth(15);
    this.input.on('drag', (_pointer: Phaser.Input.Pointer, target: Phaser.GameObjects.Container, dragX: number, dragY: number) => {
      if (!this.editing || !target.getData('placementId')) return;
      const placement = this.placements.find((item) => item.id === target.getData('placementId'));
      if (!placement) { target.x = dragX; target.y = dragY; return; }
      const [width, height] = this.footprintOf(placement.itemId, placement.rotation);
      const cell = this.screenToFootprintOrigin(dragX, dragY, width, height);
      this.drawFootprint(placement, cell);
      // Snap the piece to the target cell instead of letting it trail the finger. Following
      // the pointer freely meant the piece and its own preview were never in the same place
      // while dragging, which reads as the furniture being misaligned with the grid.
      const centre = this.gridToScreen(cell.x + width / 2, cell.y + height / 2);
      target.setPosition(centre.x, centre.y);
      target.setDepth(this.depthFor({ ...placement, x: cell.x, y: cell.y }));
    });
    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, target: Phaser.GameObjects.Container) => {
      if (!this.editing) return;
      const placement = this.placements.find((item) => item.id === target.getData('placementId')); if (!placement) return;
      const [width, height] = this.footprintOf(placement.itemId, placement.rotation);
      const grid = this.screenToFootprintOrigin(target.x, target.y, width, height);
      // Snap back to the last valid square rather than accepting a drop the server will reject.
      if (this.fits(placement.itemId, grid.x, grid.y, placement.rotation, placement.id)) {
        placement.x = grid.x; placement.y = grid.y;
      }
      const screen = this.footprintCentre(placement); target.setPosition(screen.x, screen.y);
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

  /** Screen position of the centre of a placement's footprint. */
  private footprintCentre(placement: RoomPlacement) {
    const [width, height] = this.footprintOf(placement.itemId, placement.rotation);
    return this.gridToScreen(placement.x + width / 2, placement.y + height / 2);
  }

  /**
   * Inverse of footprintCentre: the origin cell for a footprint whose centre sits at a screen
   * point. Clamped so a large piece cannot be dragged partly outside the room.
   */
  private screenToFootprintOrigin(x: number, y: number, width: number, height: number) {
    const dx = (x - ORIGIN_X) / TILE_WIDTH;
    const dy = (y - ORIGIN_Y) / TILE_HEIGHT;
    return {
      x: Phaser.Math.Clamp(Math.round((dx + dy) / 2 - width / 2), 0, 12 - width),
      y: Phaser.Math.Clamp(Math.round((dy - dx) / 2 - height / 2), 0, 10 - height),
    };
  }

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

  /**
   * A piece is grabbable by the tiles it stands on, plus its own drawn shape.
   *
   * The tile diamond is the predictable target — it is exactly the area the drag preview
   * highlights, so "tap the square the thing is on" always works. The sprite rectangle is
   * kept as well so a tall piece can also be grabbed by its body rather than only its feet.
   * Coordinates are local to the container, which is why the art is rotated instead of it.
   */
  private hitAreaFor(placement: RoomPlacement, container: Phaser.GameObjects.Container) {
    const [width, height] = this.footprintOf(placement.itemId, placement.rotation);
    const halfW = ((width + height) / 2) * TILE_WIDTH;
    const halfH = ((width + height) / 2) * TILE_HEIGHT;
    const skewX = ((width - height) / 2) * TILE_WIDTH;
    const skewY = ((width - height) / 2) * TILE_HEIGHT;
    // The art lives in an inner container so rotation does not spin the footprint polygon;
    // describe its transform so the hit test can sample the texture under the finger.
    const art = container.list[0] as Phaser.GameObjects.Container | undefined;
    const image = art?.list?.find((child) => child instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image | undefined;
    return {
      tile: new Phaser.Geom.Polygon([-skewX, -halfH, halfW, skewY, skewX, halfH, -halfW, -skewY]),
      scene: this,
      art: image && image.texture?.key !== '__MISSING' ? {
        key: image.texture.key,
        offsetY: image.y,
        angle: 0,
        scale: image.scaleX || 1,
        originX: image.originX,
        originY: image.originY,
        flipped: Boolean(art?.getData('flipped')),
      } : undefined,
    };
  }

  /**
   * Show which way a piece faces.
   *
   * Rotation used to spin the sprite on screen with setAngle. In an isometric view that is
   * wrong: turning a piece means turning it in the world, not rotating its picture, and a
   * 90-degree screen rotation of an isometric drawing makes the object appear to lie flat.
   * Each piece has exactly one drawn view, so a true quarter turn is not available; mirroring
   * gives the two facings the art can honestly express, and the piece always stays upright.
   * The footprint still swaps on 90/270, so rotation continues to change the cells occupied.
   */
  private applyFacing(art: Phaser.GameObjects.Container, rotation: number) {
    const flipped = rotation === 180 || rotation === 270;
    art.setAngle(0);
    for (const child of art.list) {
      if (child instanceof Phaser.GameObjects.Image) child.setFlipX(flipped);
    }
    art.setData('flipped', flipped);
  }

  private addFurniture(placement: RoomPlacement) {
    const definition = this.model.bootstrap.catalog.furniture.find((item) => item.id === placement.itemId); if (!definition) return;
    // Anchor on the CENTRE of the footprint, not its top lattice corner. Anchoring at the
    // corner made a multi-cell piece sit visibly off the tiles it actually occupies — the
    // "floating" look, and it disagreed with the footprint preview.
    const point = this.footprintCentre(placement);
    const container = this.add.container(point.x, point.y).setDepth(this.depthFor(placement));
    const art = this.furnitureArt(definition, placement);
    this.applyFacing(art, placement.rotation);
    container.add(art);
    // Explicit config form: passing a plain object as the first argument makes Phaser read it
    // as an InputConfiguration rather than as a hit area, leaving hitAreaCallback undefined.
    container.setInteractive({ hitArea: this.hitAreaFor(placement, container), hitAreaCallback: hitTest, useHandCursor: true });
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
      // The container sits at the CENTRE of the footprint diamond, but a standing piece rests
      // on the whole diamond, so its base has to reach the front corner — half the diamond's
      // height (w+h)*TILE_HEIGHT/2 further down. Without this the art floats a half-footprint
      // above the tiles it occupies, which is the displacement seen against the drag preview.
      // Rugs lie flat and are already centred on the diamond, so they stay put.
      if (placement.layer !== 'rug') image.setY(((footprintX + footprintY) * TILE_HEIGHT) / 2);
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
    placement.rotation = rotation;
    const art = object.list[0] as Phaser.GameObjects.Container | undefined;
    if (art) this.applyFacing(art, rotation);
    // A rotated non-square footprint occupies different cells, so its centre and the tiles
    // you can grab it by both change.
    const centre = this.footprintCentre(placement); object.setPosition(centre.x, centre.y);
    if (object.input) object.input.hitArea = this.hitAreaFor(placement, object);
    this.game.events.emit('room:placements', this.placements.map((item) => ({ ...item })));
  }
  private removeSelected(id: string) { const index = this.placements.findIndex((item) => item.id === id); if (index < 0) return; this.placements.splice(index,1); this.furniture.get(id)?.destroy(); this.furniture.delete(id); this.game.events.emit('room:placements', this.placements); }
  private petEmote(type: 'happy'|'eat'|'attack'|'hurt'|'sleep'|'evolve') { this.avatar?.emote(type); }
}
