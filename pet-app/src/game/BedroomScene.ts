import Phaser from 'phaser';
import { PetAvatar } from './PetAvatar';
import type { Bootstrap, FurnitureDefinition, PetDefinition, PetInstance, RoomPlacement } from '../types';

interface BedroomData { bootstrap: Bootstrap; activePet: PetInstance; petDefinition: PetDefinition; editing?: boolean }

export class BedroomScene extends Phaser.Scene {
  model!: BedroomData;
  avatar?: PetAvatar;
  placements: RoomPlacement[] = [];
  furniture = new Map<string, Phaser.GameObjects.Container>();
  editing = false;
  roomScale = 1;

  constructor() { super('Bedroom'); }
  init(data: BedroomData) { this.model = data; this.placements = data.bootstrap.room.placements.map((item) => ({ ...item })); this.editing = !!data.editing; }
  preload() {
    const room = this.model.bootstrap.catalog.rooms.find((entry) => entry.id === this.model.bootstrap.room.themeId);
    const petArt = this.model.petDefinition.art[this.model.activePet.stage - 1];
    if (room) this.load.image('active-room', room.art);
    this.load.image('active-pet', petArt);
  }
  create() {
    this.cameras.main.setBackgroundColor('#efe2c8');
    if (this.textures.exists('active-room')) {
      const image = this.add.image(640, 360, 'active-room');
      image.setDisplaySize(1280, 720).setAlpha(.98);
    } else this.drawDollhouse();
    this.drawRoomFrame();
    this.placements.forEach((placement) => this.addFurniture(placement));
    this.avatar = new PetAvatar(this, 640, 475, this.model.petDefinition, this.model.activePet, this.textures.exists('active-pet') ? 'active-pet' : undefined, .86);
    this.avatar.setDepth(60);
    this.input.on('drag', (_pointer: Phaser.Input.Pointer, target: Phaser.GameObjects.Container, dragX: number, dragY: number) => {
      if (!this.editing || !target.getData('placementId')) return; target.x = dragX; target.y = dragY;
    });
    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, target: Phaser.GameObjects.Container) => {
      if (!this.editing) return;
      const placement = this.placements.find((item) => item.id === target.getData('placementId')); if (!placement) return;
      const grid = this.screenToGrid(target.x, target.y); placement.x = grid.x; placement.y = grid.y;
      const screen = this.gridToScreen(grid.x, grid.y); target.setPosition(screen.x, screen.y);
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
  private drawRoomFrame() {
    const graphics = this.add.graphics().setDepth(10); graphics.lineStyle(3,0xffffff,.28);
    for (let index = 0; index <= 12; index += 1) { const a = this.gridToScreen(index,0); const b = this.gridToScreen(index,10); graphics.lineBetween(a.x,a.y,b.x,b.y); }
    for (let index = 0; index <= 10; index += 1) { const a = this.gridToScreen(0,index); const b = this.gridToScreen(12,index); graphics.lineBetween(a.x,a.y,b.x,b.y); }
  }
  private gridToScreen(x: number, y: number) { return { x: 640 + (x - y) * 38, y: 330 + (x + y) * 19 }; }
  private screenToGrid(x: number, y: number) {
    const dx = (x - 640) / 38; const dy = (y - 330) / 19;
    return { x: Phaser.Math.Clamp(Math.round((dx + dy) / 2), 0, 11), y: Phaser.Math.Clamp(Math.round((dy - dx) / 2), 0, 9) };
  }
  private addFurniture(placement: RoomPlacement) {
    const definition = this.model.bootstrap.catalog.furniture.find((item) => item.id === placement.itemId); if (!definition) return;
    const point = this.gridToScreen(placement.x, placement.y); const container = this.add.container(point.x, point.y).setDepth(20 + placement.y + placement.x * .01);
    const color = Phaser.Display.Color.HexStringToColor(this.model.bootstrap.catalog.rooms.find((room) => room.id === definition.roomId)?.accent || '#d8a46c').color;
    const art = this.furnitureArt(definition, color); container.add(art); container.setAngle(placement.rotation); container.setSize(82,70).setInteractive({ draggable: true, useHandCursor: true });
    container.setData('placementId', placement.id); this.input.setDraggable(container, this.editing);
    container.on('pointerdown', () => { this.furniture.forEach((item) => item.setAlpha(1)); container.setAlpha(.7); this.game.events.emit('room:selected', placement.id); });
    this.furniture.set(placement.id, container);
  }
  private furnitureArt(definition: FurnitureDefinition, color: number) {
    const container = this.add.container(); const index = Number(definition.id.split('-').at(-1)) || 1;
    if (index === 1) container.add([this.add.ellipse(0,0,112,64,color),this.add.ellipse(0,-15,100,42,0xffffff,.45)]);
    else if (index === 2) container.add(this.add.ellipse(0,0,130,58,color,.72).setStrokeStyle(4,0xffffff,.55));
    else if (index === 5) container.add([this.add.rectangle(0,5,14,50,0x705447),this.add.circle(0,-22,28,color,.9)]);
    else if (index === 7) container.add(this.add.rectangle(0,0,78,56,color,.9).setStrokeStyle(5,0xffffff,.7));
    else if (index === 8) container.add([this.add.rectangle(0,8,40,28,0x9a6c45),this.add.circle(0,-15,28,color)]);
    else container.add([this.add.ellipse(0,12,82,38,0x3a3345,.25),this.add.rectangle(0,-8,70,56,color,.9).setStrokeStyle(3,0xffffff,.55)]);
    container.add(this.add.text(0,-7,String(index),{fontFamily:'Arial',fontSize:'18px',fontStyle:'bold',color:'#ffffff'}).setOrigin(.5)); return container;
  }
  private setEditing(value: boolean) { this.editing = value; this.furniture.forEach((item) => { this.input.setDraggable(item, value); item.input!.draggable = value; }); }
  private placeNewItem(itemId: string) {
    if (!this.editing || this.placements.length >= 80) return;
    const occupied = new Set(this.placements.map((item) => `${item.x}:${item.y}`)); let spot = {x:0,y:0};
    outer: for (let y=1;y<9;y+=1) for (let x=1;x<11;x+=1) if (!occupied.has(`${x}:${y}`)) { spot={x,y}; break outer; }
    const definition = this.model.bootstrap.catalog.furniture.find((item) => item.id === itemId); if (!definition) return;
    const placement = { id: crypto.randomUUID(), itemId, x: spot.x, y: spot.y, rotation: 0, layer: definition.layer }; this.placements.push(placement); this.addFurniture(placement); this.game.events.emit('room:placements', this.placements.map((item) => ({...item})));
  }
  private rotateSelected(id: string) { const placement = this.placements.find((item) => item.id === id); const object = this.furniture.get(id); if (!placement || !object) return; placement.rotation = (placement.rotation + 90) % 360; object.setAngle(placement.rotation); this.game.events.emit('room:placements', this.placements); }
  private removeSelected(id: string) { const index = this.placements.findIndex((item) => item.id === id); if (index < 0) return; this.placements.splice(index,1); this.furniture.get(id)?.destroy(); this.furniture.delete(id); this.game.events.emit('room:placements', this.placements); }
  private petEmote(type: 'happy'|'eat'|'attack'|'hurt'|'sleep'|'evolve') { this.avatar?.emote(type); }
}
