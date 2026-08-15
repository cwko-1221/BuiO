import Phaser from 'phaser';
import type { MapDefinition, PetDefinition, PetInstance, SkillDefinition } from '../types';

interface AdventureData { map: MapDefinition; pet: PetInstance; petDefinition: PetDefinition; skills: SkillDefinition[]; runId: string; seed: number }
type Enemy = Phaser.Physics.Arcade.Image & { hp: number; maxHp: number; speed: number; boss?: boolean; nextHit?: number };

export class AdventureScene extends Phaser.Scene {
  model!: AdventureData;
  player!: Phaser.Physics.Arcade.Image;
  enemies!: Phaser.Physics.Arcade.Group;
  projectiles!: Phaser.Physics.Arcade.Group;
  cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  virtual = new Phaser.Math.Vector2();
  wave = 0; health = 5; nextAttack = 0; badgeFound = false; ended = false; selectedSkills: SkillDefinition[] = [];
  badge?: Phaser.Physics.Arcade.Image; statusText?: Phaser.GameObjects.Text; healthText?: Phaser.GameObjects.Text;
  private random!: Phaser.Math.RandomDataGenerator;

  constructor() { super('Adventure'); }
  init(data: AdventureData) { this.model = data; this.random = new Phaser.Math.RandomDataGenerator([String(data.seed)]); this.selectedSkills = data.skills; }
  preload() { this.load.image('adventure-map', this.model.map.art); this.load.image('adventure-pet', this.model.petDefinition.art[this.model.pet.stage - 1]); }
  create() {
    this.physics.world.setBounds(0,0,1600,1000); this.cameras.main.setBounds(0,0,1600,1000).setBackgroundColor(this.model.map.color);
    if (this.textures.exists('adventure-map')) this.add.image(800,500,'adventure-map').setDisplaySize(1600,1000).setAlpha(.94);
    else this.drawMap();
    this.makeTextures(); this.enemies = this.physics.add.group(); this.projectiles = this.physics.add.group();
    this.player = this.physics.add.image(180,500,this.textures.exists('adventure-pet')?'adventure-pet':'pet-fallback').setDepth(20);
    this.player.setDisplaySize(96,96).setCollideWorldBounds(true); (this.player.body as Phaser.Physics.Arcade.Body).setCircle(35,13,20);
    this.cameras.main.startFollow(this.player,true,.08,.08); this.cameras.main.setZoom(Math.min(1,innerWidth/1050));
    this.badge = this.physics.add.image(1100 + this.random.integerInRange(0,300),160 + this.random.integerInRange(0,620),'badge').setDepth(12);
    this.physics.add.overlap(this.player,this.badge,()=>{ if(!this.badge?.active)return; this.badgeFound=true; this.badge.destroy(); this.game.events.emit('adventure:badge'); });
    this.physics.add.overlap(this.player,this.enemies,(_player, enemyObject)=>this.enemyContact(enemyObject as Enemy));
    this.cursors = this.input.keyboard!.createCursorKeys(); this.keys = this.input.keyboard!.addKeys('W,A,S,D,Q,E') as Record<string, Phaser.Input.Keyboard.Key>;
    this.statusText=this.add.text(24,24,'',{fontFamily:'Arial',fontSize:'22px',fontStyle:'bold',color:'#ffffff',backgroundColor:'#20314acc',padding:{x:14,y:9}}).setScrollFactor(0).setDepth(100);
    this.healthText=this.add.text(24,76,'',{fontFamily:'Arial',fontSize:'22px',color:'#fff3b0',backgroundColor:'#20314acc',padding:{x:14,y:9}}).setScrollFactor(0).setDepth(100);
    this.game.events.on('adventure:joystick',this.setJoystick,this); this.game.events.on('adventure:skill',this.useSkill,this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{this.game.events.off('adventure:joystick',this.setJoystick,this);this.game.events.off('adventure:skill',this.useSkill,this);});
    this.startNextWave();
  }
  private drawMap(){const g=this.add.graphics();g.fillGradientStyle(Phaser.Display.Color.HexStringToColor(this.model.map.color).color,0x234557,0x173242,0x0f2735,1);g.fillRect(0,0,1600,1000);for(let i=0;i<85;i+=1){g.fillStyle(this.random.pick([0xffffff,0xffe98f,0x8fe8df]),this.random.realInRange(.08,.28));g.fillCircle(this.random.between(20,1580),this.random.between(20,980),this.random.between(4,18));}}
  private makeTextures(){
    if(!this.textures.exists('pet-fallback')){const g=this.add.graphics();g.fillStyle(Phaser.Display.Color.HexStringToColor(this.model.petDefinition.color).color);g.fillCircle(48,52,35);g.fillStyle(0xffffff);g.fillCircle(36,44,8);g.fillCircle(60,44,8);g.fillStyle(0x203047);g.fillCircle(38,46,4);g.fillCircle(62,46,4);g.generateTexture('pet-fallback',96,96);g.destroy();}
    const palette=[0x6a4c93,0x49a078,0xe56b6f,0x4d96ff,0xffca3a,0x806b4d,0x7a8ca4,0xbb6bd9,0x3cb6a0,0xe9824f,0x596275,0x84b65b];
    palette.forEach((color,index)=>{const key=`enemy-${index}`;if(this.textures.exists(key))return;const g=this.add.graphics();g.fillStyle(0x1b2330,.25);g.fillEllipse(42,68,62,20);g.fillStyle(color);g.fillCircle(42,42,28);g.fillTriangle(17,35,28,12,36,35);g.fillTriangle(48,35,57,12,68,35);g.fillStyle(0xffffff);g.fillCircle(33,39,7);g.fillCircle(51,39,7);g.fillStyle(0x172033);g.fillCircle(35,41,3);g.fillCircle(53,41,3);g.generateTexture(key,84,80);g.destroy();});
    if(!this.textures.exists('boss')){const g=this.add.graphics();g.fillStyle(0x1a2035,.25);g.fillEllipse(78,134,126,32);g.fillStyle(Phaser.Display.Color.HexStringToColor(this.model.map.color).color);g.fillCircle(78,73,60);g.lineStyle(8,0xffe37c,.85);g.strokeCircle(78,73,64);g.fillStyle(0xffffff);g.fillCircle(57,63,12);g.fillCircle(99,63,12);g.fillStyle(0x241b38);g.fillCircle(59,66,6);g.fillCircle(101,66,6);g.generateTexture('boss',156,150);g.destroy();}
    if(!this.textures.exists('shot')){const g=this.add.graphics();g.fillStyle(0xffef8f);g.fillCircle(12,12,10);g.generateTexture('shot',24,24);g.destroy();}
    if(!this.textures.exists('badge')){const g=this.add.graphics();g.fillStyle(0xffe36d);g.fillCircle(32,32,25);g.fillStyle(0xfff4ab);g.fillTriangle(32,7,39,27,25,27);g.fillTriangle(32,57,39,37,25,37);g.fillTriangle(7,32,27,25,27,39);g.fillTriangle(57,32,37,25,37,39);g.lineStyle(3,0xffffff,.8);g.strokeCircle(32,32,30);g.generateTexture('badge',64,64);g.destroy();}
  }
  private startNextWave(){
    this.wave+=1;if(this.wave>4){this.finish(true);return;}
    const boss=this.wave===4;const count=boss?1:4+this.wave*2;
    for(let i=0;i<count;i+=1){const angle=(Math.PI*2*i)/count;const x=1050+Math.cos(angle)*(220+this.wave*35);const y=500+Math.sin(angle)*(220+this.wave*35);const image=this.physics.add.image(x,y,boss?'boss':`enemy-${(this.model.map.order*3+i)%12}`) as Enemy;image.setDepth(15).setCollideWorldBounds(true);if(boss)image.setDisplaySize(150,150);image.hp=image.maxHp=boss?34+this.model.map.order*5:4+this.wave+Math.floor(this.model.map.order/2);image.speed=boss?54:62+this.wave*7;image.boss=boss;this.enemies.add(image);}
  }
  update(time:number){
    if(this.ended)return;const vector=new Phaser.Math.Vector2((this.cursors.left.isDown||this.keys.A.isDown?-1:0)+(this.cursors.right.isDown||this.keys.D.isDown?1:0)+this.virtual.x,(this.cursors.up.isDown||this.keys.W.isDown?-1:0)+(this.cursors.down.isDown||this.keys.S.isDown?1:0)+this.virtual.y).normalize();
    this.player.setVelocity(vector.x*230,vector.y*230);if(vector.lengthSq()>0){this.player.setFlipX(vector.x<0);this.player.setAngle(Math.sin(time/90)*2);}else this.player.setAngle(0);
    this.enemies.getChildren().forEach((object)=>{const enemy=object as Enemy;if(!enemy.active)return;const direction=new Phaser.Math.Vector2(this.player.x-enemy.x,this.player.y-enemy.y).normalize();enemy.setVelocity(direction.x*enemy.speed,direction.y*enemy.speed);});
    if(time>=this.nextAttack){const enemy=this.nearestEnemy(285);if(enemy){this.attack(enemy);this.nextAttack=time+520;}}
    if(Phaser.Input.Keyboard.JustDown(this.keys.Q))this.useSkill(0);if(Phaser.Input.Keyboard.JustDown(this.keys.E))this.useSkill(1);
    this.statusText?.setText(`${this.model.map.name['zh-HK']} · ${this.wave<4?`第 ${this.wave}/3 組`:`首領：${this.model.map.boss['zh-HK']}`}`);this.healthText?.setText(`生命 ${'♥'.repeat(Math.max(0,this.health))}${'♡'.repeat(Math.max(0,5-this.health))}`);
  }
  private nearestEnemy(range:number){let target:Enemy|undefined;let best=range;this.enemies.getChildren().forEach((object)=>{const enemy=object as Enemy;const distance=Phaser.Math.Distance.Between(this.player.x,this.player.y,enemy.x,enemy.y);if(enemy.active&&distance<best){target=enemy;best=distance;}});return target;}
  private attack(enemy:Enemy){const shot=this.physics.add.image(this.player.x,this.player.y,'shot');this.projectiles.add(shot);this.tweens.add({targets:shot,x:enemy.x,y:enemy.y,duration:180,onComplete:()=>{if(enemy.active)this.damage(enemy,1+Math.floor(this.model.pet.stage/2));shot.destroy();}});this.game.events.emit('adventure:sfx','attack');}
  private damage(enemy:Enemy,amount:number){enemy.hp-=amount;enemy.setAlpha(.4);this.time.delayedCall(70,()=>enemy.active&&enemy.setAlpha(1));if(enemy.hp<=0){const x=enemy.x,y=enemy.y;enemy.destroy();for(let i=0;i<8;i+=1){const p=this.add.circle(x,y,4,this.random.pick([0xffffff,0xffdc78,0x7ce0d3]));this.tweens.add({targets:p,x:x+this.random.between(-65,65),y:y+this.random.between(-65,65),alpha:0,duration:380,onComplete:()=>p.destroy()});}if(this.enemies.countActive(true)===0)this.time.delayedCall(700,()=>this.startNextWave());}}
  private enemyContact(enemy:Enemy){const now=this.time.now;if((enemy.nextHit||0)>now)return;enemy.nextHit=now+1100;this.health-=1;this.player.setAlpha(.45);this.time.delayedCall(140,()=>this.player.setAlpha(1));this.game.events.emit('adventure:sfx','hurt');if(this.health<=0)this.finish(false);}
  private setJoystick(vector:{x:number;y:number}){this.virtual.set(vector.x,vector.y);}
  private useSkill(slot:number){const skill=this.selectedSkills[slot];if(!skill||this.ended)return;this.game.events.emit('adventure:skill-used',{slot,skillId:skill.id,cooldown:skill.kind==='attack'?5:skill.kind==='support'?8:6});const radius=skill.kind==='attack'?260:190;const color=Phaser.Display.Color.HexStringToColor(this.model.petDefinition.color).color;const ring=this.add.circle(this.player.x,this.player.y,24,color,.18).setStrokeStyle(6,0xffffff,.8);this.tweens.add({targets:ring,scale:radius/24,alpha:0,duration:430,onComplete:()=>ring.destroy()});if(skill.kind==='support'){this.health=Math.min(5,this.health+1);this.enemies.getChildren().forEach((object)=>(object as Enemy).setVelocity(0,0));}else this.enemies.getChildren().forEach((object)=>{const enemy=object as Enemy;if(Phaser.Math.Distance.Between(this.player.x,this.player.y,enemy.x,enemy.y)<=radius)this.damage(enemy,skill.kind==='attack'?5:2);});this.game.events.emit('adventure:sfx','skill');}
  private finish(success:boolean){if(this.ended)return;this.ended=true;this.player.setVelocity(0,0);this.enemies.getChildren().forEach((enemy)=>{(enemy as Enemy).setVelocity(0,0);});this.game.events.emit('adventure:complete',{success,badgeFound:this.badgeFound});}
}
