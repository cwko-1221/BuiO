import Phaser from 'phaser';
import { PetAvatar } from './PetAvatar';
import type { Bootstrap, FurnitureDefinition, PetDefinition, PetFacing, PetInstance, RoomPlacement } from '../types';

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

/**
 * The floor, in perspective.
 *
 * The room is drawn with side walls closing in toward the back, so the floor is a trapezoid: as
 * wide as the frame at the front, narrower where it meets the back wall. A rectangular grid laid
 * over that puts its corner cells on the wall, which is exactly what the first imported room did.
 *
 * So the grid is a trapezoid too. A cell at the back is narrower and shallower than the same cell
 * at the front, and anything standing on it is drawn smaller in the same proportion — which is
 * what makes the room read as a space rather than a picture of one.
 *
 * Everything below is expressed in the 1280x720 design surface.
 */
const GRID_COLUMNS = 14;
const GRID_ROWS = 10;

/** The design surface the room art is drawn onto. */
const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;
const FLOOR_CENTRE = STAGE_WIDTH / 2;

/**
 * The floor, one room at a time. Each room's four corners were pointed at by hand — the back
 * two where the skirting meets each side wall, the front two worked out from the side edges —
 * and the grid is laid on exactly those. A single grid shared by every room had to fit inside
 * the narrowest floor of the ten and so hung short of the skirting in the other nine.
 *
 * The trade is that a cell is not quite the same patch of floor in two different themes, so a
 * saved arrangement shifts a little when the theme changes. The ten floors agree to within a
 * few per cent, which is a smaller error than the gap it removes.
 */
const DEFAULT_FLOOR: [number, number][] = [[.2245, .389], [.7755, .389], [.988, 1], [.012, 1]];

/**
 * The map from the grid to the picture: the projective transform taking the unit square onto
 * those four corners. It is the whole of the perspective — rows bunch toward the back and a cell
 * narrows with distance because that is what projecting a rectangle does, with no curve to tune.
 */
/**
 * A room's painted floor usually runs off the bottom corners of its picture, so the corners that
 * were pointed at sit outside the frame. The grid is pulled back along the floor's own two side
 * edges until both are inside, which keeps every cell on painted floor and in view — the far
 * corners of a grid that overhung the frame could be neither seen nor tapped.
 */
function insideFrame(corners: [number, number][]): [number, number][] {
  const [backLeft, backRight, frontRight, frontLeft] = corners;
  const edge = 0.004;
  let far = 1;
  const limit = (from: number, to: number, bound: number) => {
    if ((to - from) === 0) return 1;
    const t = (bound - from) / (to - from);
    return t > 0 && t < 1 ? t : 1;
  };
  far = Math.min(far, limit(backLeft[0], frontLeft[0], edge));
  far = Math.min(far, limit(backRight[0], frontRight[0], 1 - edge));
  far = Math.min(far, limit(backLeft[1], frontLeft[1], 1 - edge));
  far = Math.min(far, limit(backRight[1], frontRight[1], 1 - edge));
  const along = (back: [number, number], front: [number, number]): [number, number] =>
    [back[0] + (front[0] - back[0]) * far, back[1] + (front[1] - back[1]) * far];
  return [backLeft, backRight, along(backRight, frontRight), along(backLeft, frontLeft)];
}
function floorMap(corners: [number, number][]) {
  const points = insideFrame(corners).map(([x, y]) => [x * STAGE_WIDTH, y * STAGE_HEIGHT] as const);
  const rows: number[][] = [], values: number[] = [];
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;
  for (let i = 0; i < 4; i += 1) {
    const [x, y] = square[i], [u, v] = points[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); values.push(u);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y]); values.push(v);
  }
  const m = rows.map((row, i) => [...row, values[i]]);
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 8; r += 1) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < 8; r += 1) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      for (let k = col; k <= 8; k += 1) m[r][k] -= factor * m[col][k];
    }
  }
  const h = m.map((row, i) => row[8] / row[i]);
  const forward = (x: number, y: number) => {
    const w = h[6] * x + h[7] * y + 1;
    return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
  };
  // Inverting a 3x3 whose last entry is 1, so the inverse is worth writing out rather than
  // iterating: a tap has to land on the same cell the piece under the finger was drawn on.
  const a = h[0], b = h[1], cc = h[2], d = h[3], e = h[4], ff = h[5], g = h[6], i2 = h[7];
  const inverse = (x: number, y: number) => {
    const A = e - ff * i2, B = cc * i2 - b, C = b * ff - cc * e;
    const D = ff * g - d, E = a - cc * g, F = cc * d - a * ff;
    const G = d * i2 - e * g, H = b * g - a * i2, I = a * e - b * d;
    const w = G * x + H * y + I;
    return { x: (A * x + B * y + C) / w, y: (D * x + E * y + F) / w };
  };
  return { forward, inverse };
}
/** The creature's size on the front row; every other row scales down from here. */
const PET_SCALE = .86;

/** How far the room's colour pulls the creature and its outfit. Subtle on purpose. */
const AMBIENT_STRENGTH = 0.12;

export class BedroomScene extends Phaser.Scene {
  model!: BedroomData;
  avatar?: PetAvatar;
  placements: RoomPlacement[] = [];
  furniture = new Map<string, Phaser.GameObjects.Container>();
  editing = false;
  roomScale = 1;
  grid?: Phaser.GameObjects.Graphics;
  ghost?: Phaser.GameObjects.Graphics;
  /** Floor cell the creature is standing on, and where it is heading. */
  /**
   * Where the creature stands, in fractional cells. The grid is for furniture — a piece has to
   * sit somewhere a child can find it again — but a creature walking cell to cell stair-steps
   * around the room like a chess piece. It walks the floor instead, and consults the grid only
   * to know which cells the furniture is standing on.
   */
  petSpot = { x: 0, y: 0 };

  /** This room's grid, built from the corners that were pointed at on its picture. */
  private floor = floorMap(DEFAULT_FLOOR);
  petLegs?: { x: number; y: number }[];
  petStep?: Phaser.Tweens.Tween;
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
    this.petLegs = undefined;
    this.petStep = undefined;
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
    PetAvatar.preloadWearables(this, this.model.activePet.equippedWearables, catalog.wearables);

    // Real furniture art, one texture per distinct item actually placed in the room.
    for (const itemId of new Set(this.placements.map((placement) => placement.itemId))) {
      const definition = catalog.furniture.find((item) => item.id === itemId);
      if (definition?.art && !this.textures.exists(itemId)) this.load.image(itemId, definition.art);
    }
  }
  create() {
    const themed = this.model.bootstrap.catalog.rooms.find((entry) => entry.id === this.model.bootstrap.room.themeId);
    this.floor = floorMap((themed?.floor as [number, number][]) || DEFAULT_FLOOR);
    this.cameras.main.setBackgroundColor('#efe2c8');
    if (this.roomTextureKey && this.textures.exists(this.roomTextureKey)) {
      const image = this.add.image(640, 360, this.roomTextureKey);
      image.setDisplaySize(1280, 720).setAlpha(.98);
    } else this.drawDollhouse();
    this.drawRoomFrame();
    this.placements.forEach((placement) => this.addFurniture(placement));
    // Stand the creature on a floor cell rather than a fixed point, so it sorts against the
    // furniture by the row it is on — the same rule every piece of furniture follows.
    this.petSpot = { x: GRID_COLUMNS / 2, y: GRID_ROWS * .68 };
    const home = this.petCentre(this.petSpot);
    this.avatar = new PetAvatar(this, home.x, home.y, this.model.petDefinition, this.model.activePet, {
      layout: this.model.bootstrap.catalog.animation,
      fallbackTexture: this.petTextureKey && this.textures.exists(this.petTextureKey) ? this.petTextureKey : undefined,
      scale: PET_SCALE * this.depthScale(this.petSpot.y),
      wearables: this.model.bootstrap.catalog.wearables,
      ambient: this.ambientLight(),
    });
    this.seatPet(this.petSpot);
    this.ghost = this.add.graphics().setDepth(15);
    // A tap that hits no furniture is a tap on the floor, which is where the child wants the pet.
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer, targets: Phaser.GameObjects.GameObject[]) => {
      if (this.editing || targets.length) return;
      if (pointer.getDistance() > 16) return;   // a drag across the room is not a destination
      this.walkTo(this.screenToCell(pointer.worldX, pointer.worldY));
    });
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
      //
      // To the front edge of the footprint, which is where the piece is anchored once it is put
      // down. Snapping to the middle of the footprint instead left it half its own depth above
      // where it would land, so every piece dropped lower than the cell it had been shown on.
      const centre = this.gridToScreen(cell.x + width / 2, cell.y + height);
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
  /**
   * Stand-in room for a theme whose art has not been generated yet: a back wall, a trapezoid
   * floor and the two wedges of side wall between them. Drawn from the same numbers the grid
   * uses, so the placeholder and the placement grid always agree even when the painting does not.
   */
  private drawDollhouse() {
    const room = this.model.bootstrap.catalog.rooms.find((entry) => entry.id === this.model.bootstrap.room.themeId)!;
    const wall = Phaser.Display.Color.HexStringToColor(room.primary).color;
    const floor = Phaser.Display.Color.HexStringToColor(room.accent).color;
    const graphics = this.add.graphics();

    graphics.fillStyle(wall, 1);
    graphics.fillRect(0, 0, 1280, 720);

    const backLeft = this.gridToScreen(0, 0);
    const backRight = this.gridToScreen(GRID_COLUMNS, 0);
    const frontLeft = this.gridToScreen(0, GRID_ROWS);
    const frontRight = this.gridToScreen(GRID_COLUMNS, GRID_ROWS);
    graphics.fillStyle(floor, 1);
    graphics.fillPoints([backLeft, backRight, frontRight, frontLeft].map((point) => new Phaser.Math.Vector2(point.x, point.y)), true);

    // Skirting along the join, and a shade over each side wall so the wedges read as upright.
    graphics.fillStyle(0x000000, .12);
    graphics.fillPoints([
      new Phaser.Math.Vector2(0, backLeft.y), new Phaser.Math.Vector2(backLeft.x, backLeft.y),
      new Phaser.Math.Vector2(frontLeft.x, frontLeft.y), new Phaser.Math.Vector2(0, frontLeft.y),
    ], true);
    graphics.fillPoints([
      new Phaser.Math.Vector2(backRight.x, backRight.y), new Phaser.Math.Vector2(1280, backRight.y),
      new Phaser.Math.Vector2(1280, frontRight.y), new Phaser.Math.Vector2(frontRight.x, frontRight.y),
    ], true);
    graphics.fillStyle(0xffffff, .18);
    graphics.fillRect(0, backLeft.y - 14, 1280, 14);
  }
  /** Placement grid. Only meaningful while decorating; otherwise it reads as debug overlay. */
  private drawRoomFrame() {
    const graphics = this.add.graphics().setDepth(12);
    graphics.lineStyle(2, 0xffffff, .22);
    for (let index = 0; index <= GRID_COLUMNS; index += 1) { const a = this.gridToScreen(index,0); const b = this.gridToScreen(index,GRID_ROWS); graphics.lineBetween(a.x,a.y,b.x,b.y); }
    for (let index = 0; index <= GRID_ROWS; index += 1) { const a = this.gridToScreen(0,index); const b = this.gridToScreen(GRID_COLUMNS,index); graphics.lineBetween(a.x,a.y,b.x,b.y); }
    graphics.setVisible(this.editing);
    this.grid = graphics;
  }
  /**
   * A lattice point on the floor. Depth is eased, and the width is interpolated by the same eased
   * value, which keeps the left and right edges of the floor straight lines on screen.
   */
  private gridToScreen(x: number, y: number) {
    return this.floor.forward(x / GRID_COLUMNS, y / GRID_ROWS);
  }

  /** How big something standing at a depth is drawn: the floor narrows, and so does it. */
  private depthScale(y: number) {
    const at = (v: number) => this.floor.forward(1, v).x - this.floor.forward(0, v).x;
    return at(Phaser.Math.Clamp(y / GRID_ROWS, 0, 1)) / at(1);
  }

  /** Inverse of gridToScreen, in fractional cells. */
  private screenToCell(x: number, y: number) {
    const at = this.floor.inverse(x, y);
    return { x: at.x * GRID_COLUMNS, y: at.y * GRID_ROWS };
  }
  private screenToGrid(x: number, y: number) {
    const cell = this.screenToCell(x, y);
    return {
      x: Phaser.Math.Clamp(Math.floor(cell.x), 0, GRID_COLUMNS - 1),
      y: Phaser.Math.Clamp(Math.floor(cell.y), 0, GRID_ROWS - 1),
    };
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
        // A cell is a trapezoid on screen, so its outline is four corners rather than a rect.
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

  /**
   * Where a piece stands: the middle of the front edge of its footprint, which is the point it
   * touches the floor. Anchoring at the centre of the footprint instead needs a correction for
   * half its depth, and that correction changes with perspective — this needs none.
   */
  private footprintCentre(placement: RoomPlacement) {
    const [width, height] = this.footprintOf(placement.itemId, placement.rotation);
    return this.gridToScreen(placement.x + width / 2, placement.y + height);
  }

  /** Middle of the footprint, for the things that lie flat rather than stand. */
  private footprintMiddle(placement: RoomPlacement) {
    const [width, height] = this.footprintOf(placement.itemId, placement.rotation);
    return this.gridToScreen(placement.x + width / 2, placement.y + height / 2);
  }

  /**
   * Inverse of footprintCentre: the origin cell for a footprint whose centre sits at a screen
   * point. Clamped so a large piece cannot be dragged partly outside the room.
   */
  private screenToFootprintOrigin(x: number, y: number, width: number, height: number) {
    const cell = this.screenToCell(x, y);
    return {
      x: Phaser.Math.Clamp(Math.round(cell.x - width / 2), 0, GRID_COLUMNS - width),
      y: Phaser.Math.Clamp(Math.round(cell.y - height), 0, GRID_ROWS - height),
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
    if (x < 0 || y < 0 || x + width > GRID_COLUMNS || y + height > GRID_ROWS) return false;
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
    const [, height] = this.footprintOf(placement.itemId, placement.rotation);
    // Seen straight on, only depth into the room decides what covers what — and a deep piece
    // is covered by anything in front of the row it reaches, not the row it starts on.
    const front = placement.y + height;
    if (placement.layer === 'rug') return 10 + front * .01;
    return 20 + front;
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
    // The footprint is a trapezoid on screen, and the container sits at the middle of its front
    // edge, so its corners are taken from the projection and shifted into container space.
    const anchor = this.footprintCentre(placement);
    const corner = (x: number, y: number) => {
      const point = this.gridToScreen(x, y);
      return new Phaser.Math.Vector2(point.x - anchor.x, point.y - anchor.y);
    };
    const footprint = [
      corner(placement.x, placement.y), corner(placement.x + width, placement.y),
      corner(placement.x + width, placement.y + height), corner(placement.x, placement.y + height),
    ];
    // The art lives in an inner container so rotation does not spin the footprint polygon;
    // describe its transform so the hit test can sample the texture under the finger.
    const art = container.list[0] as Phaser.GameObjects.Container | undefined;
    const image = art?.list?.find((child) => child instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image | undefined;
    return {
      tile: new Phaser.Geom.Polygon(footprint),
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
  /**
   * The room's light, as a tint every occupant shares.
   *
   * The creature and its outfit are drawn against ten different rooms, from a warm oak bedroom
   * to a blue-lit space pod, and art that ignores the room it stands in reads as pasted on top
   * of a background rather than standing inside it. A small pull towards the theme colour is
   * enough to seat everything in the same light without recolouring the art.
   */
  private ambientLight() {
    const room = this.model.bootstrap.catalog.rooms.find((entry) => entry.id === this.model.bootstrap.room.themeId);
    if (!room) return 0xffffff;
    const theme = Phaser.Display.Color.HexStringToColor(room.primary);
    const mix = (channel: number) => Math.round(255 + (channel - 255) * AMBIENT_STRENGTH);
    return Phaser.Display.Color.GetColor(mix(theme.red), mix(theme.green), mix(theme.blue));
  }

  private applyFacing(art: Phaser.GameObjects.Container, rotation: number) {
    // 90 and 270 are the turned states — the same ones whose footprint swaps — so a press
    // always changes both the facing and the cells occupied. Mapping the mirror to 180/270
    // instead meant 0 -> 90 looked identical and the button appeared to need two presses.
    const flipped = rotation === 90 || rotation === 270;
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
      // How wide it is drawn is not the same as how much floor it occupies: a clock, a lamp and
      // an armchair all take one tile and are nothing like the same size, so the drawn width comes
      // from how big the piece was drawn next to the others on its sheet. A cell is narrower at
      // the back, so it is measured where the piece actually stands rather than from a fixed tile.
      const across = definition.drawTiles || footprintX;
      const middle = placement.x + footprintX / 2;
      const front = this.gridToScreen(middle + across / 2, placement.y + footprintY);
      const back = this.gridToScreen(middle - across / 2, placement.y + footprintY);
      const targetWidth = Math.abs(front.x - back.x);
      image.setScale(targetWidth / Math.max(1, box.width * image.width));
      // Origin is expressed in canvas fractions: horizontally centred on the object, and
      // vertically at its base so it stands on the floor (rugs sit on their own centre).
      image.setOrigin(
        box.x + box.width / 2,
        placement.layer === 'rug' ? box.y + box.height / 2 : box.y + box.height,
      );
      // The container already sits on the front edge of the footprint, so a standing piece needs
      // no offset. A rug lies flat across the whole footprint, so it is lifted to its middle.
      if (placement.layer === 'rug') {
        const middle = this.footprintMiddle(placement);
        image.setY(middle.y - this.footprintCentre(placement).y);
      }
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
    if (value) this.haltWalk();
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
    // Cycle 0 and 90 only. With a single drawn view per piece, 180 and 270 are visually
    // identical to 0 and 90 — they would be presses that appear to do nothing. Modulo 180
    // also folds any legacy 180/270 value already saved back into the two live states.
    const rotation = (placement.rotation + 90) % 180;
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

  /** Screen point for a place on the floor, in fractional cells. */
  private petCentre(spot: { x: number; y: number }) {
    return this.gridToScreen(spot.x, spot.y);
  }

  /** The cell a creature standing here is on: the row it sorts against and collides with. */
  private cellUnder(spot: { x: number; y: number }) {
    return {
      x: Phaser.Math.Clamp(Math.floor(spot.x), 0, GRID_COLUMNS - 1),
      y: Phaser.Math.Clamp(Math.ceil(spot.y) - 1, 0, GRID_ROWS - 1),
    };
  }

  /** Sorted by the row it stands on, one step in front of the furniture sharing that row. */
  private petDepth() {
    return 20 + this.petSpot.y + .5;
  }

  /** Put the creature somewhere on the floor: position, depth, and size at that distance. */
  private seatPet(spot: { x: number; y: number }) {
    const avatar = this.avatar; if (!avatar) return;
    const point = this.petCentre(spot);
    avatar.setPosition(point.x, point.y);
    avatar.setDepth(this.petDepth());
    avatar.setScale(PET_SCALE * this.depthScale(spot.y));
  }

  /** Cells a creature will not walk onto. Rugs are walked over; everything else is furniture. */
  private blockedCells() {
    const blocked = new Set<string>();
    for (const placement of this.placements) {
      const definition = this.model.bootstrap.catalog.furniture.find((item) => item.id === placement.itemId);
      if (!definition || definition.layer !== 'furniture') continue;
      const [width, height] = this.footprintOf(placement.itemId, placement.rotation);
      for (let x = placement.x; x < placement.x + width; x += 1) {
        for (let y = placement.y; y < placement.y + height; y += 1) blocked.add(`${x}:${y}`);
      }
    }
    return blocked;
  }

  /** Keep a creature on the floor and off the skirting, in fractional cells. */
  private onFloor(spot: { x: number; y: number }) {
    return {
      x: Phaser.Math.Clamp(spot.x, .45, GRID_COLUMNS - .45),
      y: Phaser.Math.Clamp(spot.y, .7, GRID_ROWS),
    };
  }

  /** Whether a creature can walk straight from one place to another without meeting furniture. */
  private clearRun(from: { x: number; y: number }, to: { x: number; y: number }, blocked: Set<string>) {
    const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 4) || 1;
    for (let i = 1; i <= steps; i += 1) {
      const at = { x: from.x + (to.x - from.x) * (i / steps), y: from.y + (to.y - from.y) * (i / steps) };
      const cell = this.cellUnder(at);
      if (blocked.has(`${cell.x}:${cell.y}`)) return false;
    }
    return true;
  }

  /**
   * Send the creature to a point on the floor the child tapped.
   *
   * It used to choose its own destinations. Being able to point at the floor and have the pet
   * trot over is the whole difference between watching an aquarium and playing with a pet, and a
   * creature already walking somewhere of its own accord makes the tap feel ignored.
   */
  private walkTo(point: { x: number; y: number }) {
    if (this.editing || !this.avatar) return;
    const target = this.onFloor(point);
    const blocked = this.blockedCells();
    const cell = this.cellUnder(target);
    if (blocked.has(`${cell.x}:${cell.y}`)) return;

    // Straight there when the way is clear, otherwise round one corner, which is enough for
    // furniture standing against a wall. Nothing in one room is worth more pathfinding than that.
    const corners = [{ x: target.x, y: this.petSpot.y }, { x: this.petSpot.x, y: target.y }];
    let legs: { x: number; y: number }[] | undefined;
    if (this.clearRun(this.petSpot, target, blocked)) legs = [target];
    else for (const corner of corners) {
      if (this.clearRun(this.petSpot, corner, blocked) && this.clearRun(corner, target, blocked)) {
        legs = [corner, target];
        break;
      }
    }
    if (!legs) return;
    this.petStep?.stop();
    this.petLegs = legs;
    this.walkNextLeg();
  }

  private walkNextLeg() {
    const avatar = this.avatar;
    const next = this.petLegs?.shift();
    if (!avatar || this.editing || !next) {
      this.petLegs = undefined;
      this.petStep = undefined;
      avatar?.play('idle');
      return;
    }
    const from = this.petCentre(this.petSpot);
    const to = this.petCentre(next);
    const facing: PetFacing = Math.abs(to.x - from.x) >= Math.abs(to.y - from.y)
      ? (to.x >= from.x ? 'right' : 'left')
      : (to.y >= from.y ? 'front' : 'back');
    avatar.play('walk', facing);

    const began = { x: this.petSpot.x, y: this.petSpot.y };
    this.petStep = this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: Math.max(120, Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y) * 7),
      ease: 'Linear',
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 0;
        this.petSpot = { x: began.x + (next.x - began.x) * t, y: began.y + (next.y - began.y) * t };
        this.seatPet(this.petSpot);
      },
      onComplete: () => { this.petSpot = next; this.seatPet(next); this.walkNextLeg(); },
    });
  }
  /** Stop where it stands. Used while decorating, and while a one-shot reaction plays. */
  private haltWalk() {
    this.petStep?.stop();
    this.petStep = undefined;
    this.petLegs = undefined;
  }

  private petEmote(type: 'happy'|'eat'|'attack'|'hurt'|'sleep'|'evolve') {
    this.haltWalk();
    this.avatar?.emote(type);
  }
}
