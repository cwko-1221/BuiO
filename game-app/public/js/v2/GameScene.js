import { ASSET_BY_ID, ZONE_NAMES } from './assets.js?v=20260725-checkpoint-themes-2';
import { AVAILABLE_ASSETS } from './available-assets.js?v=20260725-checkpoint-themes-2';
import { ATLAS_INDEX, ATLAS_PAGES } from './atlas-index.js?v=20260725-checkpoint-themes-2';
import { alphaBounds, bindBodyToSprite, createAlphaBody, fittedSize, visualSize } from './colliders.js?v=20260725-checkpoint-themes-2';
import { createPlayerCompound, wakePlayer, PLAYER_SPRITE_DY } from './playerPhysics.js';
import { sampleSky } from './background.js';
import { RapidFallTracker } from './recovery.js';
import { CAT_WORLD, CAT_PLAYER, collideWithPlayer } from './collisionFilters.js';
import { checkpointPayload, resolveCheckpoint } from './checkpoint-state.js?v=20260719-flag-checkpoints';
import { RouteAutoplay } from './RouteAutoplay.js?v=20260717-switchback-playtest';
import { beginCrumbleFall, CrumblePlatformState } from './CrumblePlatform.js?v=20260725-crumble-wake';
import { RemoteGhostState, SURFACE_TOLERANCE } from './RemoteGhostState.js?v=20260718-network-4';
import { timedHazardState } from './timed-hazards.js?v=20260719-power20-lasers';
import { accessoryGlyph, avatarTint, normaliseAvatar } from './avatar.js?v=20260906-pet-climber-3';
import { definePetAnims, destroyLayers, makeLayers, petAnim, petKeys, petOf, queuePet, syncLayers }
  from './petAvatar.js?v=20260906-pet-climber-3';

export class GameScene extends Phaser.Scene {
  constructor(course, hooks = {}) {
    super({ key: 'GameScene' });
    this.course = course;
    this.hooks = hooks;
    this.actions = { left:false, right:false, down:false, jumpQueued:0 };
    this.maxEnergy = Math.max(1, Number(hooks.maxEnergy) || 100);
    this.energy = Phaser.Math.Clamp(hooks.energy ?? Math.min(40, this.maxEnergy), 0, this.maxEnergy);
    this.avatar = normaliseAvatar(hooks.avatar);
    this.progress = hooks.progress ?? 0;
    this.checkpoint = resolveCheckpoint(course.checkpoints, {checkpoint:hooks.checkpoint});
    this.airJump = 1;
    this.coyote = 0;
    this.grounded = false;
    this.dropUntil = 0;
    this.lastNet = 0;
    this.dynamicObjects = [];
    this.crumbleObjects = new Map();
    this.launcherCooldowns = new Map();
    this.ghosts = new Map();
    this.groundContacts = new Map();
    this.leftContacts = new Map();
    this.rightContacts = new Map();
    this.stuckMs = 0;
    this.stuckAnchor = null;
    this.stuckNudged = false;
    this.lastSafePose = { x:course.start.x, y:course.start.y-38, progress:this.progress };
    this.lastSafeAt = 0;
    this.invulnerableUntil = 0;
    this.rapidFallTracker = new RapidFallTracker();
    this.rapidFallTracker.reset(0,0);
    this.peakFallSpeed = 0;
    this.nextStepAt = 0;
    this.finished = false;
    this.routeAutoplay = hooks.autoplay ? new RouteAutoplay(course, hooks.onAutoplay) : null;
  }

  preload() {
    const assetVersion = encodeURIComponent(this.course.mapVersion);
    const versioned = url => `${url}${url.includes('?')?'&':'?'}v=${assetVersion}`;
    this.load.image('sky-v2', '/game/images/game/sky-panorama.webp');
    this.load.image('player-v2', '/game/images/v2/characters/player-idle.webp');
    // The climber's own pet, if they have one. Other climbers' pets are fetched as they appear,
    // since who else is on the mountain is not known until they are.
    this.myPet = petOf(this.avatar);
    if (this.myPet) queuePet(this, this.myPet);
    for (const cp of this.course.checkpoints) {
      if (cp.background) this.load.image(cp.background.key,versioned(cp.background.file));
    }
    // Atlas filenames are stable so existing rooms can reconnect cleanly. The
    // fixed map version is therefore appended to force browsers to fetch the
    // matching atlas after an art/map deployment instead of showing retired
    // blue slab frames from an older cache.
    for (const page of ATLAS_PAGES) this.load.atlas(page.key,versioned(page.image),versioned(page.json));
    const strips = { idle:['idle-strip-4',4], run:['run-strip-8',8], air:['air-strip-6',6], land:['fall-land-strip-4',4], celebrate:['celebrate-strip-4',4] };
    for (const [name,[dir,count]] of Object.entries(strips)) {
      for (let i=1;i<=count;i++) this.load.image(`player-${name}-${i}`,`/game/images/v2/characters/frames/${dir}/${String(i).padStart(2,'0')}.png`);
    }
    for (const id of this.course.usedAssets) {
      if (AVAILABLE_ASSETS.includes(id) && !ATLAS_INDEX[id]) this.load.image(id, ASSET_BY_ID.get(id).file);
    }
  }

  create() {
    this.matter.world.setBounds(0, 0, this.course.world.width, this.course.world.height + 500, 120, true, true, true, false);
    this.matter.world.engine.positionIterations = 8;
    this.matter.world.engine.velocityIterations = 6;

    this.sky = this.add.image(0, 0, 'sky-v2').setOrigin(.5).setScrollFactor(0).setDepth(-1000);
    this.skyWash = this.add.rectangle(0,0,10,10,0x8edcff,.08).setOrigin(.5).setScrollFactor(0).setDepth(-999);
    this.horizonGlow = this.add.rectangle(0,0,10,10,0xe9fbff,.13).setOrigin(.5).setScrollFactor(0).setDepth(-998);
    this.resizeSky();
    this.scale.on('resize', () => this.resizeSky());

    for (const id of this.course.usedAssets) if (!ATLAS_INDEX[id] && !this.textures.exists(id)) this.makeFallbackTexture(ASSET_BY_ID.get(id));
    this.makePlayerTexture();
    this.createPlayerAnimations();

    this.objectSprites = this.course.objects.map(obj => this.createCourseObject(obj));
    this.createAnnotations();
    this.createProgressSensors();
    this.createHazards();
    this.createCheckpoints();
    this.createSummit();
    this.createPlayer();
    this.bindInputs();
    this.bindCollisions();

    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.course.world.width, this.course.world.height);
    camera.startFollow(this.player, true, .08, .08, 0, 80);
    camera.setDeadzone(Math.min(260, camera.width * .28), Math.min(190, camera.height * .26));
    // Wider framing, matched to DLD footage: character ≈ 8% of screen height
    // with generous sky around the route.
    camera.setZoom(Math.max(.68, Math.min(1, camera.height / 900)));
    this.resizeSky();
    camera.fadeIn(280, 255, 255, 255);
    this.hooks.onReady?.(this);
    this.routeAutoplay?.start(this.time.now);
  }

  resizeSky() {
    if (!this.sky) return;
    const w = this.scale.width, h = this.scale.height;
    const zoom = this.cameras.main?.zoom || 1;
    const vw = w / zoom + 120, vh = h / zoom + 120;
    const cover = Math.max(vw / this.sky.texture.getSourceImage().width, vh / this.sky.texture.getSourceImage().height);
    this.sky.setScale(cover).setPosition(w / (2 * zoom), h / (2 * zoom));
    this.skyWash?.setPosition(w/(2*zoom),h/(2*zoom)).setDisplaySize(vw,vh);
    this.horizonGlow?.setPosition(w/(2*zoom),h*.78/zoom).setDisplaySize(vw,vh*.44);
  }

  updateBackground() {
    const totalRise = Math.max(1,this.course.startAltitudeY-this.course.summit.y);
    const ratio = Phaser.Math.Clamp((this.course.startAltitudeY-this.player.y)/totalRise,0,1);
    if (Math.abs(ratio-(this.lastSkyRatio ?? -1)) < .002) return;
    this.lastSkyRatio = ratio;
    const sky = sampleSky(ratio);
    this.sky.setTint(sky.tint);
    this.skyWash.setFillStyle(sky.wash,.08+.08*ratio);
    this.horizonGlow.setFillStyle(sky.horizon,.13+.07*ratio);
  }

  makeFallbackTexture(asset) {
    const w = Math.max(96, Math.round(asset.renderSize.w));
    const h = Math.max(64, Math.round(asset.renderSize.h));
    const g = this.make.graphics({ x:0, y:0, add:false });
    const [base, dark, light] = asset.palette;
    g.lineStyle(7, 0x293149, 1);
    g.fillStyle(Phaser.Display.Color.HexStringToColor(base).color, 1);
    const type = asset.body.type;
    if (type === 'circle') {
      g.fillCircle(w/2, h/2, Math.min(w,h)*.42); g.strokeCircle(w/2,h/2,Math.min(w,h)*.42);
    } else if (type === 'trapezoid') {
      const p = [new Phaser.Math.Vector2(w*.08,h*.78),new Phaser.Math.Vector2(w*.2,h*.12),new Phaser.Math.Vector2(w*.78,h*.08),new Phaser.Math.Vector2(w*.94,h*.75)];
      g.fillPoints(p,true); g.strokePoints(p,true);
    } else if (type === 'polygon' || type === 'compound') {
      const p = [new Phaser.Math.Vector2(w*.06,h*.72),new Phaser.Math.Vector2(w*.12,h*.28),new Phaser.Math.Vector2(w*.36,h*.06),new Phaser.Math.Vector2(w*.75,h*.13),new Phaser.Math.Vector2(w*.94,h*.52),new Phaser.Math.Vector2(w*.82,h*.82)];
      g.fillPoints(p,true); g.strokePoints(p,true);
    } else {
      g.fillRoundedRect(4,8,w-8,h-14,Math.min(16,h*.2)); g.strokeRoundedRect(4,8,w-8,h-14,Math.min(16,h*.2));
    }
    g.fillStyle(Phaser.Display.Color.HexStringToColor(light).color,.75);
    g.fillRoundedRect(w*.18,h*.18,w*.42,Math.max(6,h*.1),4);
    g.lineStyle(3, Phaser.Display.Color.HexStringToColor(dark).color,.8);
    g.lineBetween(w*.22,h*.66,w*.78,h*.34);
    g.generateTexture(asset.id,w,h); g.destroy();
  }

  makePlayerTexture() {
    if (this.textures.exists('player-v2')) return;
    const g = this.make.graphics({ add:false });
    g.lineStyle(6,0x232c4b,1); g.fillStyle(0x386ff5,1);
    g.fillCircle(34,34,27); g.strokeCircle(34,34,27);
    g.fillStyle(0xffffff,1); g.fillCircle(25,29,6); g.fillCircle(43,29,6);
    g.fillStyle(0x15213b,1); g.fillCircle(26,30,3); g.fillCircle(42,30,3);
    g.fillRoundedRect(24,45,20,5,2); g.generateTexture('player-v2',68,70); g.destroy();
  }

  createPlayerAnimations() {
    const create = (key, prefix, count, frameRate, repeat = -1) => {
      if (this.anims.exists(key)) return;
      this.anims.create({ key, frames:Array.from({length:count},(_,i)=>({key:`player-${prefix}-${i+1}`})), frameRate, repeat });
    };
    create('idle','idle',4,4); create('run','run',8,12); create('jump','air',2,10,0);
    if (!this.anims.exists('doubleJump')) this.anims.create({key:'doubleJump',frames:[{key:'player-air-3'},{key:'player-air-4'}],frameRate:12,repeat:0});
    if (!this.anims.exists('fall')) this.anims.create({key:'fall',frames:[{key:'player-air-5'},{key:'player-air-6'}],frameRate:5,repeat:-1});
    create('land','land',4,12,0); create('celebrate','celebrate',4,8,-1);
  }

  createCourseObject(obj) {
    // The collider keeps the original route footprint. The themed artwork
    // may have a different aspect ratio, so align its visible top to the
    // original standing surface while keeping the authored object position.
    const texture = ATLAS_INDEX[obj.assetId];
    const colliderSize = fittedSize(obj);
    const size = visualSize(obj);
    const sourceBounds = alphaBounds(obj.themeSourceAssetId || obj.assetId,colliderSize);
    const visualBounds = alphaBounds(obj.assetId,size);
    const spriteY = obj.y + sourceBounds.minY - visualBounds.minY;
    const depth = obj.role === 'decor' ? 14 : obj.role === 'support' ? 10 : 12;
    const sprite = this.add.image(obj.x, spriteY, texture?.key || obj.assetId, texture?.frame || null)
      .setDisplaySize(size.w, size.h).setDepth(depth).setRotation(obj.angle || 0);
    // Stacked props are pure scenery — no body, so they never block the route.
    if (obj.role === 'decor') {
      sprite.courseObject = obj;
      return sprite;
    }
    const Matter = Phaser.Physics.Matter.Matter;
    const body = createAlphaBody(Matter, obj, colliderSize);
    // The cradle must detect the player without its fork/elastic geometry
    // cancelling the upward impulse on the very next Matter step.
    if (obj.behavior?.type === 'launcher') {
      body.isSensor=true;
      for (const part of body.parts) part.isSensor=true;
    }
    collideWithPlayer(body);
    bindBodyToSprite(body, sprite, obj);
    Matter.Composite.add(this.matter.world.localWorld, body);
    if (obj.behavior?.type === 'crumble') {
      this.crumbleObjects.set(obj.id,{
        sprite,body,obj,
        state:new CrumblePlatformState(obj.behavior),
        startX:obj.x,startY:obj.y,baseAngle:obj.angle||0,
        startBodyPosition:{x:body.position.x,y:body.position.y},
        centerOff:{x:body.position.x-obj.x,y:body.position.y-obj.y},
        removed:false
      });
    } else if (obj.behavior?.type === 'move' || obj.behavior?.type === 'rotate') {
      this.dynamicObjects.push({
        sprite, body, obj,
        startX: obj.x, startY: obj.y, baseAngle: obj.angle || 0,
        // where the centre of mass sits relative to the image centre
        centerOff: { x: body.position.x - obj.x, y: body.position.y - obj.y },
        phase: (obj.x + obj.y) % 6.28
      });
    }
    return sprite;
  }

  createProgressSensors() {
    this.sensorBodies = this.course.sensors.map(sensor => {
      const body = collideWithPlayer(this.matter.add.rectangle(sensor.x,sensor.y,150,180,{isStatic:true,isSensor:true,label:'progress'}));
      body.progressSensor = sensor; return body;
    });
  }

  createAnnotations() {
    for (const note of this.course.annotations || []) {
      const summit = note.type === 'summit';
      const turn = note.type === 'turn';
      const color = summit ? '#50e879' : turn ? '#ffffff' : '#ffd743';
      const size = summit ? '13px' : turn ? '11px' : '12px';
      if (note.assetId) {
        const texture=ATLAS_INDEX[note.assetId];
        this.add.image(note.x,note.y,texture?.key||note.assetId,texture?.frame||null)
          .setDisplaySize(note.renderSize?.w||220,note.renderSize?.h||110)
          .setFlipX(!!note.flipX).setAngle(note.angle||0).setDepth(60);
      }
      if (note.showText!==false) {
        this.add.text(note.x,note.y+(note.assetId?(note.renderSize?.h||110)*.58:0),note.text,{
          fontFamily:'Arial, Microsoft JhengHei',fontSize:size,fontStyle:'bold',
          color,stroke:'#18243d',strokeThickness:summit?4:3,
          align:'center',wordWrap:{width:180}
        }).setOrigin(.5).setDepth(61).setAngle(turn?-4:0);
      }
      if (!note.arrow) continue;
      const x2=note.x+note.arrow.dx, y2=note.y+note.arrow.dy;
      const angle=Math.atan2(note.arrow.dy,note.arrow.dx);
      const g=this.add.graphics().setDepth(59);
      g.lineStyle(10,summit?0x50e879:0x41c85a,1).beginPath().moveTo(note.x,note.y+34).lineTo(x2,y2).strokePath();
      g.fillStyle(summit?0x50e879:0x41c85a,1);
      g.fillTriangle(x2,y2,x2-24*Math.cos(angle-.55),y2-24*Math.sin(angle-.55),x2-24*Math.cos(angle+.55),y2-24*Math.sin(angle+.55));
    }
  }

  createHazards() {
    this.hazardBodies = this.course.hazards.map(hazard => {
      const glow=this.add.rectangle(hazard.x,hazard.y,hazard.w+18,hazard.h,0xff294f,.2).setDepth(17);
      const beam=this.add.rectangle(hazard.x,hazard.y,hazard.w,hazard.h,0xff2448,.92).setDepth(18);
      const core=this.add.rectangle(hazard.x,hazard.y,Math.max(3,hazard.w*.28),hazard.h,0xffe7ec,.98).setDepth(19);
      const capWidth=62,capHeight=18;
      const topEmitter=this.add.rectangle(hazard.x,hazard.y-hazard.h/2,capWidth,capHeight,0xa51231,1)
        .setStrokeStyle(4,0x301329).setDepth(20);
      const bottomEmitter=this.add.rectangle(hazard.x,hazard.y+hazard.h/2,capWidth,capHeight,0xa51231,1)
        .setStrokeStyle(4,0x301329).setDepth(20);
      const body=collideWithPlayer(this.matter.add.rectangle(hazard.x,hazard.y,hazard.w,hazard.h+10,{isStatic:true,isSensor:true,label:'hazard'}));
      body.hazard=hazard;
      const runtime={hazard,body,glow,beam,core,emitters:[topEmitter,bottomEmitter],active:null};
      body.hazardRuntime=runtime;
      return runtime;
    });
    this.updateHazards(0);
  }

  updateHazards(time) {
    for (const item of this.hazardBodies||[]) {
      const state=timedHazardState(item.hazard,time);
      if (state.active!==item.active) {
        item.active=state.active;
        item.body.collisionFilter.mask=state.active?CAT_PLAYER:0;
        item.beam.setVisible(state.active);
        item.core.setVisible(state.active);
        item.glow.setVisible(state.active);
        for (const emitter of item.emitters) emitter.setFillStyle(state.active?0xd91f42:0x546174,1);
      }
      if (state.active) {
        const pulse=.72+.22*Math.sin(time*.018);
        item.beam.setAlpha(pulse);
        item.glow.setAlpha(.16+.1*Math.sin(time*.014));
      }
    }
  }

  createCheckpoints() {
    this.checkpointBodies=[];
    this.checkpointBackgrounds=[];
    for (const cp of this.course.checkpoints) {
      const flagSide=cp.flagSide===-1?-1:1;
      const flagX=cp.x+22*flagSide;
      const flagY=cp.y-58;
      if (cp.background&&this.textures.exists(cp.background.key)) {
        const source=this.textures.get(cp.background.key).getSourceImage();
        const scale=Math.min(680/source.width,430/source.height);
        const backgroundW=Math.round(source.width*scale);
        const backgroundH=Math.round(source.height*scale);
        const image=this.add.image(flagX,flagY,cp.background.key)
          .setDisplaySize(backgroundW,backgroundH).setDepth(5).setAlpha(.82);
        this.checkpointBackgrounds.push({checkpointId:cp.id,image});
      }
      const pole = this.add.rectangle(cp.x,cp.y-35,7,70,0x4e5870).setDepth(9);
      const tex=ATLAS_INDEX['checkpoint-flag'];
      const flag = this.add.image(flagX,flagY,tex?.key||'checkpoint-flag',tex?.frame||null).setDisplaySize(54,54).setDepth(9);
      this.add.text(cp.x,cp.y+14,cp.name||cp.zoneName,{fontFamily:'Microsoft JhengHei',fontSize:'16px',fontStyle:'bold',color:'#ffffff',stroke:'#20263a',strokeThickness:5}).setOrigin(.5).setDepth(20);
      pole.setAlpha(.9); flag.setAlpha(.95);
      // Match the painted flag and pole instead of using a generous invisible
      // area. Players must physically touch this visible marker to unlock it.
      const trigger=collideWithPlayer(this.matter.add.rectangle(cp.x+20*flagSide,cp.y-43,64,90,{isStatic:true,isSensor:true,label:'checkpoint-flag'}));
      trigger.checkpointTrigger=cp;
      this.checkpointBodies.push(trigger);
    }
  }

  createSummit() {
    const s = this.course.summit;
    this.summitBody = collideWithPlayer(this.matter.add.rectangle(s.x,s.y,220,220,{isStatic:true,isSensor:true,label:'summit'}));
    const tex=ATLAS_INDEX['ref-summit-flag'];
    this.add.image(s.x,s.y-90,tex?.key||'ref-summit-flag',tex?.frame||null).setDisplaySize(174,280).setDepth(9);
  }

  createPlayer() {
    // Like course objects, the player sprite is detached from the physics
    // body and synced manually with a fixed offset, so the feet pixels sit
    // exactly on the collider bottom.
    const Matter = Phaser.Physics.Matter.Matter;
    const playerPhysics = createPlayerCompound(Matter);
    this.playerBody = playerPhysics.body;
    this.playerParts = playerPhysics.parts;
    this.playerBody.collisionFilter.category = CAT_PLAYER;
    this.playerBody.collisionFilter.mask = CAT_WORLD;
    Matter.Body.setPosition(this.playerBody,{x:this.course.start.x,y:this.course.start.y-38});
    Matter.Composite.add(this.matter.world.localWorld,this.playerBody);
    const pet = this.myPet && this.textures.exists(petKeys(this.myPet).atlas) ? this.myPet : null;
    if (pet) {
      // A pet already carries whatever it is wearing, drawn onto it. The emoji trinket belongs to
      // the plain climber and would sit on top of a creature that is dressed already.
      const atlasKey = petKeys(pet).atlas;
      definePetAnims(this, atlasKey);
      this.playerAnimPrefix = atlasKey;
      this.player = this.add.sprite(0,0,atlasKey,0).setDisplaySize(88,88).setDepth(100);
      this.playerLayers = makeLayers(this, pet, 100);
      for (const layer of this.playerLayers) layer.setDisplaySize(88,88);
    } else {
      this.player = this.add.sprite(0,0,'player-idle-1').setDisplaySize(68,70).setDepth(100);
      const tint=avatarTint(this.avatar);
      if (tint!==0xffffff) this.player.setTint(tint);
      this.playerAccessory = this.add.text(0,0,accessoryGlyph(this.avatar),{
        fontFamily:'"Segoe UI Emoji","Apple Color Emoji",sans-serif',
        fontSize:'24px',
        stroke:'#20263a',
        strokeThickness:3,
      }).setOrigin(.5).setDepth(105);
    }
    this.syncPlayerSprite();
    this.playerName = this.add.text(this.player.x,this.player.y+42,this.hooks.name || '玩家',{fontFamily:'Microsoft JhengHei',fontSize:'17px',fontStyle:'bold',color:'#fff',stroke:'#222a42',strokeThickness:6}).setOrigin(.5).setDepth(110);
  }

  /**
   * The animation name to play on the climber.
   *
   * A pet's movements are named per creature, because two children on the same mountain may be a
   * cat and a pig and "run" is a different set of pictures for each. Everywhere that asks for a
   * movement asks by the plain name and is answered with the right one.
   */
  playerAnimName(name) {
    return this.playerAnimPrefix ? petAnim(this.playerAnimPrefix, name) : name;
  }

  syncPlayerSprite() {
    this.player.setPosition(this.playerBody.position.x,this.playerBody.position.y+PLAYER_SPRITE_DY);
    this.playerAccessory?.setPosition(this.player.x,this.player.y-39);
    syncLayers(this.playerLayers,this.player);
  }

  setPlayerPosition(x,y) {
    const Body = Phaser.Physics.Matter.Matter.Body;
    Body.setPosition(this.playerBody,{x,y});
    Body.setVelocity(this.playerBody,{x:0,y:0});
    this.wakePlayer();
    this.syncPlayerSprite();
    const altitude=Math.max(0,(this.course.startAltitudeY-(y+PLAYER_SPRITE_DY))/5);
    this.rapidFallTracker.reset(this.time?.now||0,altitude);
  }

  setPlayerVelocity(x,y) {
    const v = this.playerBody.velocity;
    Phaser.Physics.Matter.Matter.Body.setVelocity(this.playerBody,{x:x ?? v.x,y:y ?? v.y});
  }

  bindInputs() {
    this.keys = this.input.keyboard.addKeys({left:'LEFT',right:'RIGHT',a:'A',d:'D',jump:'SPACE',up:'UP',w:'W',down:'DOWN',s:'S'});
    this.input.keyboard.on('keydown-SPACE', () => this.queueJump());
    this.input.keyboard.on('keydown-UP', () => this.queueJump());
    this.input.keyboard.on('keydown-W', () => this.queueJump());
  }

  bindCollisions() {
    const trackContacts = (event, active) => {
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA,pair.bodyB];
        const track = (sensor, contacts) => {
          const index = bodies.indexOf(sensor);
          if (index < 0) return;
          const other = bodies[1 - index];
          if (other.isSensor || other.parent === this.playerBody) return;
          if (active) contacts.set(other.id, other); else contacts.delete(other.id);
        };
        track(this.playerParts.foot, this.groundContacts);
        track(this.playerParts.left, this.leftContacts);
        track(this.playerParts.right, this.rightContacts);
      }
    };
    this.matter.world.on('collisionstart', event => {
      trackContacts(event, true);
      for (const pair of event.pairs) {
        const bodies = [pair.bodyA,pair.bodyB];
        const involvesPlayer = bodies.some(b => b === this.playerBody || b.parent === this.playerBody);
        const footContact = bodies.includes(this.playerParts.foot);
        if (bodies.includes(this.summitBody) && involvesPlayer) this.finish();
        for (const body of bodies) {
          if (body.progressSensor && involvesPlayer) this.reachProgress(body.progressSensor);
          if (body.checkpointTrigger && involvesPlayer) this.unlockCheckpoint(body.checkpointTrigger);
          if (body.hazard && involvesPlayer) this.hitHazard(body.hazard,body.hazardRuntime);
          const obj = body.courseObject;
          if (footContact && obj?.behavior?.type === 'crumble') this.triggerCrumble(obj.id,true);
          const landsOnLauncher=involvesPlayer&&obj?.behavior?.type==='launcher'
            &&this.playerBody.velocity.y>=-1.5&&this.playerBody.position.y<obj.y-4;
          if (landsOnLauncher) {
            const readyAt=this.launcherCooldowns.get(obj.id)||0;
            if (this.time.now>=readyAt) {
              this.launcherCooldowns.set(obj.id,this.time.now+500);
              // The slingshot contributes vertical force only. Horizontal
              // momentum and all in-air steering remain player-controlled.
              this.setPlayerVelocity(null,-obj.behavior.power);
              this.airJump=0; this.coyote=0;
              this.launcherBoostUntil=this.time.now+(obj.behavior.flightMs||1600);
              const sprite=body.gameObject;
              if (sprite) {
                const baseScaleY=sprite.scaleY;
                this.tweens.add({targets:sprite,scaleY:baseScaleY*.78,duration:65,yoyo:true,ease:'Quad.easeOut'});
              }
              this.hooks.onEffect?.('bounce',this.player.x,this.player.y);
              this.hooks.onSound?.('bounce');
            }
          }
          if (obj?.behavior?.type === 'bounce' && involvesPlayer) {
            this.setPlayerVelocity(null,-obj.behavior.power); this.airJump = 1; this.hooks.onEffect?.('bounce',this.player.x,this.player.y);
            this.hooks.onSound?.('bounce');
          }
        }
      }
    });
    this.matter.world.on('collisionend', event => trackContacts(event, false));
  }

  wakePlayer() { wakePlayer(Phaser.Physics.Matter.Matter, this.playerBody); }
  resumeControl() {
    this.actions.left = false; this.actions.right = false; this.actions.down = false; this.actions.jumpQueued = 0;
    this.stuckAnchor = null; this.stuckMs = 0; this.stuckNudged = false;
    this.wakePlayer();
  }
  queueJump() { this.wakePlayer(); this.actions.jumpQueued = 130; }
  setAction(action, value) {
    if (value) this.wakePlayer();
    if (action === 'jump' && value) this.queueJump(); else this.actions[action] = value;
  }
  setEnergy(value) { this.energy = Phaser.Math.Clamp(value,0,this.maxEnergy); }

  triggerCrumble(id,broadcast=true) {
    const item=this.crumbleObjects.get(id);
    if (!item||!item.state.trigger(this.time.now)) return false;
    item.sprite.setTint(0xffd36a);
    if (broadcast) this.hooks.onCrumble?.(id);
    return true;
  }

  clearCrumbleContacts(objectId) {
    for (const contacts of [this.groundContacts,this.leftContacts,this.rightContacts]) {
      for (const [id,body] of contacts) if (body.courseObject?.id===objectId) contacts.delete(id);
    }
  }

  restoreCrumbleBody(item) {
    const Matter=Phaser.Physics.Matter.Matter;
    const {Body,Composite}=Matter;
    Body.setVelocity(item.body,{x:0,y:0});
    Body.setAngularVelocity(item.body,0);
    Body.setPosition(item.body,item.startBodyPosition);
    Body.setAngle(item.body,item.baseAngle);
    Body.setStatic(item.body,true);
    if (item.removed) {
      Composite.add(this.matter.world.localWorld,item.body);
      item.removed=false;
    }
    item.sprite.setPosition(item.startX,item.startY).setRotation(item.baseAngle).setVisible(true).clearTint();
  }

  updateCrumblePlatforms(time) {
    const Matter=Phaser.Physics.Matter.Matter;
    const {Composite}=Matter;
    for (const item of this.crumbleObjects.values()) {
      const result=item.state.update(time);
      if (result.changed&&result.phase==='falling') {
        item.sprite.setPosition(item.startX,item.startY).clearTint();
        beginCrumbleFall(Matter,item.body,(item.obj.x%2?1:-1)*.015);
      } else if (result.changed&&result.phase==='hidden') {
        this.clearCrumbleContacts(item.obj.id);
        Composite.remove(this.matter.world.localWorld,item.body,true);
        item.removed=true;
        item.sprite.setVisible(false);
      } else if (result.changed&&result.phase==='ready') {
        this.restoreCrumbleBody(item);
      }
      if (result.phase==='warning') {
        item.sprite.setX(item.startX+Math.sin(time*.095)*2.4);
      } else if (result.phase==='falling') {
        item.sprite.setPosition(item.body.position.x-item.centerOff.x,item.body.position.y-item.centerOff.y)
          .setRotation(item.body.angle);
      }
    }
  }

  update(time, deltaMs) {
    this.updateHazards(time);
    if (!this.player || this.finished || this.hooks.isFrozen?.()) return;
    const dt = Math.min(deltaMs,34)/1000;
    const leftHeld = this.actions.left || this.keys.left.isDown || this.keys.a.isDown;
    const rightHeld = this.actions.right || this.keys.right.isDown || this.keys.d.isDown;
    const downHeld = this.actions.down || this.keys.down.isDown || this.keys.s.isDown;
    this.actions.jumpQueued = Math.max(0,this.actions.jumpQueued-deltaMs);

    const vy = this.playerBody.velocity.y;
    const wasGrounded = this.grounded;
    const under = [...this.groundContacts.values()].filter(body => !body.isSensor);
    this.grounded = under.length > 0 && vy >= -1.5;
    if (this.grounded && time<(this.launcherBoostUntil||0)) this.launcherBoostUntil=0;
    if (!this.grounded) this.peakFallSpeed=Math.max(this.peakFallSpeed,vy);
    if (this.grounded&&!wasGrounded) {
      if (this.peakFallSpeed>2.8) this.hooks.onSound?.('land');
      this.peakFallSpeed=0;
    }
    this.coyote = this.grounded ? .11 : Math.max(0,this.coyote-dt);
    if (this.grounded) this.airJump = 1;

    this.routeAutoplay?.update(this, time);

    const dir = (rightHeld?1:0)-(leftHeld?1:0);
    // A launch changes vertical velocity only. Horizontal speed and air
    // steering use the exact same values as an ordinary jump.
    const launcherFlight=!this.grounded&&time<(this.launcherBoostUntil||0);
    const target = dir * 5.6;
    const nextVx = Phaser.Math.Linear(this.playerBody.velocity.x,target,this.grounded?.2:.085);
    this.setPlayerVelocity(nextVx,null);
    const conveyorBody = under.find(b => b.courseObject?.behavior?.type === 'conveyor');
    if (conveyorBody && this.grounded) this.setPlayerVelocity(nextVx + conveyorBody.courseObject.behavior.speed,null);
    if (this.hooks.infiniteEnergy) this.energy=this.maxEnergy;
    else if (dir && this.energy > 0) this.energy = Math.max(0,this.energy-4.3*dt);
    this.player.setFlipX(dir < 0);
    if (this.grounded&&dir&&Math.abs(nextVx)>1.25&&time>=this.nextStepAt) {
      this.nextStepAt=time+Phaser.Math.Clamp(285-Math.abs(nextVx)*14,185,255);
      this.hooks.onSound?.('step');
    }

    // Stable ground continuously refreshes the manual/automatic recovery pose.
    if (this.grounded && Math.abs(vy)<.7 && Math.abs(this.playerBody.velocity.x)<1.2 && time-this.lastSafeAt>260) {
      this.lastSafePose={x:this.playerBody.position.x,y:this.playerBody.position.y,progress:this.progress,checkpointId:this.checkpoint?.id};
      this.lastSafeAt=time;
    }
    // Direction held without meaningful travel: nudge at 1.6s, restore at 3s.
    if (dir) {
      if (!this.stuckAnchor) this.stuckAnchor={x:this.playerBody.position.x,y:this.playerBody.position.y};
      const travelled=Math.hypot(this.playerBody.position.x-this.stuckAnchor.x,this.playerBody.position.y-this.stuckAnchor.y);
      if (travelled>=12) {
        this.stuckAnchor={x:this.playerBody.position.x,y:this.playerBody.position.y}; this.stuckMs=0; this.stuckNudged=false;
      } else this.stuckMs+=deltaMs;
      if (this.stuckMs>=1600 && !this.stuckNudged) {
        Phaser.Physics.Matter.Matter.Body.translate(this.playerBody,{x:dir*12,y:-10});
        this.setPlayerVelocity(dir*3,-1.2); this.stuckNudged=true;
      }
      if (this.stuckMs>=3000) this.resetToSafePose('stuck');
    } else { this.stuckAnchor=null; this.stuckMs=0; this.stuckNudged=false; }

    // The authored launcher arc is deliberately capped below the following
    // route platform. Consuming jump input during that short flight prevents
    // a late second jump from adding height and bypassing several platforms.
    if (launcherFlight && this.actions.jumpQueued > 0) {
      this.actions.jumpQueued=0;
    } else if (this.actions.jumpQueued > 0 && this.energy >= 8) {
      if (downHeld && this.grounded) {
        this.dropUntil = time + 240; this.playerParts.main.isSensor = true; this.groundContacts.clear(); this.setPlayerVelocity(null,2.2); this.actions.jumpQueued = 0;
      } else if (this.coyote > 0 || this.airJump > 0) {
        const air = this.coyote <= 0;
        // A second-jump input must never cancel a stronger slingshot launch.
        this.setPlayerVelocity(null,Math.min(vy,air ? -10.8 : -12.2));
        if (air) this.airJump--;
        if (!this.hooks.infiniteEnergy) this.energy -= 8;
        this.actions.jumpQueued = 0; this.coyote = 0;
        this.player.play(this.playerAnimName(air ? 'doubleJump' : 'jump'),true);
        this.hooks.onEffect?.(air?'doubleJump':'jump',this.player.x,this.player.y);
        this.hooks.onSound?.(air?'doubleJump':'jump');
      }
    }
    if (this.playerParts.main.isSensor && time > this.dropUntil) this.playerParts.main.isSensor = false;

    this.updateCrumblePlatforms(time);

    for (const item of this.dynamicObjects) {
      const { sprite,body,obj,startX,startY,baseAngle,centerOff,phase } = item;
      const Body = Phaser.Physics.Matter.Matter.Body;
      if (obj.behavior.type === 'move') {
        const wave = Math.sin(time*.001*obj.behavior.speed*Math.PI*2+phase);
        const cx = startX+obj.behavior.dx*wave, cy = startY+obj.behavior.dy*wave;
        Body.setPosition(body,{x:cx+centerOff.x,y:cy+centerOff.y},true);
        sprite.setPosition(cx,cy);
      } else {
        // Spin about the image centre: rotate the centre-of-mass offset along
        // with the angle so the artwork pivots around its visual middle.
        const angle = baseAngle + time*.001*obj.behavior.speed;
        const spin = angle - baseAngle;
        const cos = Math.cos(spin), sin = Math.sin(spin);
        Body.setPosition(body,{
          x: startX + centerOff.x*cos - centerOff.y*sin,
          y: startY + centerOff.x*sin + centerOff.y*cos
        });
        Body.setAngle(body, angle);
        sprite.setRotation(angle);
      }
    }

    this.updateBackground();

    this.syncPlayerSprite();
    this.playerName.setPosition(this.player.x,this.player.y+44);
    const motion = vy < -1 ? 'jump' : vy > 2 ? 'fall' : Math.abs(nextVx)>1 ? 'run' : 'idle';
    const playing=this.player.anims.currentAnim?.key||'';
    const midJump=playing.endsWith('jump')||playing.endsWith('doubleJump');
    if (!midJump || !this.player.anims.isPlaying) this.player.play(this.playerAnimName(motion),true);
    for (const ghost of this.ghosts.values()) {
      const pose=ghost.state.sample(time,deltaMs,this.ghostFloorY(ghost.state));
      ghost.sprite.setPosition(pose.x,pose.y);
      ghost.accessory?.setPosition(pose.x,pose.y-39);
      ghost.label.setPosition(pose.x,pose.y+40);
      syncLayers(ghost.layers,ghost.sprite);
    }

    if (this.player.y > this.course.world.height + 180 || this.player.x < -100 || this.player.x > this.course.world.width+100) this.respawn();
    const altitude = Math.max(0,(this.course.startAltitudeY-this.player.y)/5);
    // A launcher deliberately creates a >100m descent from its high arc.
    // Keep refreshing the fall baseline during that authored flight so it is
    // not mistaken for falling off the course. Ordinary falls still use the
    // same 100m / 2.4s recovery rule as soon as the boost ends or lands.
    if (time<(this.launcherBoostUntil||0)) {
      this.rapidFallTracker.reset(time,altitude);
    } else if (this.rapidFallTracker.update(time,altitude)) {
      this.resetToCheckpoint('rapidFall');
      return;
    }
    const limits=[210,274,448,573,704,Infinity];
    const zoneIndex=Math.max(0,limits.findIndex(limit=>altitude<=limit));
    this.hooks.onFrame?.({
      x:this.player.x,y:this.player.y,velocityX:this.playerBody.velocity.x,velocityY:this.playerBody.velocity.y,
      energy:this.energy,progress:this.progress,altitude,animation:motion,
      avatar:this.avatar,
      facing:this.player.flipX?-1:1,zoneIndex,zoneName:Object.values(ZONE_NAMES)[zoneIndex],
      checkpoint:checkpointPayload(this.checkpoint)
    });
  }

  reachProgress(sensor) {
    if (sensor.progress <= this.progress) return;
    this.progress = sensor.progress;
    this.hooks.onProgress?.(this.progress,this.checkpoint);
  }

  unlockCheckpoint(checkpoint) {
    if (!checkpoint||checkpoint.altitude<=(this.checkpoint?.altitude??-1)) return false;
    this.checkpoint=checkpoint;
    this.progress=Math.max(this.progress,checkpoint.progress);
    this.lastSafePose=this.checkpointPose(checkpoint);
    this.hooks.onCheckpoint?.(checkpoint);
    this.hooks.onSound?.('checkpoint');
    return true;
  }

  checkpointPose(checkpoint=this.checkpoint||this.course.checkpoints[0]) {
    return {x:checkpoint.x,y:checkpoint.y-20,progress:this.progress,checkpointId:checkpoint.id};
  }

  respawn() {
    this.resetToCheckpoint('respawn');
  }

  clearContacts() {
    this.groundContacts.clear(); this.leftContacts.clear(); this.rightContacts.clear();
    this.stuckMs=0; this.stuckAnchor=null; this.stuckNudged=false;
  }

  resetToSafePose(reason='manual') {
    if (reason==='manual'||reason==='rapidFall'||reason==='respawn'||reason==='laser') {
      this.resetToCheckpoint(reason);
      return;
    }
    const cp=this.checkpoint||this.course.checkpoints[0];
    const pose=this.lastSafePose||{x:cp.x,y:cp.y-80};
    this.clearContacts(); this.setPlayerPosition(pose.x,pose.y);
    this.energy=Math.max(Math.min(25,this.maxEnergy),this.energy); this.invulnerableUntil=this.time.now+1200;
    this.player.setAlpha(.55); this.time.delayedCall(1200,()=>this.player?.setAlpha(1));
    this.cameras.main.flash(150,180,240,255); this.hooks.onEffect?.(reason,pose.x,pose.y);
  }

  resetToCheckpoint(reason='manual') {
    const cp=this.checkpoint||this.course.checkpoints[0];
    this.routeAutoplay?.noteReset(cp);
    const pose=this.checkpointPose(cp);
    this.clearContacts();
    this.setPlayerPosition(pose.x,pose.y);
    this.lastSafePose=pose;
    this.energy=Math.max(Math.min(25,this.maxEnergy),this.energy);
    this.invulnerableUntil=this.time.now+1200;
    this.player.setAlpha(.55);
    this.time.delayedCall(1200,()=>this.player?.setAlpha(1));
    this.cameras.main.flash(180,180,240,255);
    this.hooks.onEffect?.(reason,pose.x,pose.y);
    this.hooks.onSound?.(reason);
    this.hooks.onRecovery?.(reason,cp);
  }

  hitHazard(hazard, runtime) {
    if (runtime&&!runtime.active) return;
    if (this.time.now<this.invulnerableUntil) return;
    this.resetToCheckpoint('laser');
  }

  finish() {
    if (this.finished) return;
    this.finished = true;
    this.progress = 1;
    this.routeAutoplay?.finish(this.time.now);
    this.hooks.onSound?.('finish');
    this.hooks.onFinish?.();
  }

  // Highest standable surface under a ghost, as a sprite-centre y limit.
  // The player compound's collider bottom sits 41px below the sprite centre
  // at rest (centre-of-mass offset + contact slop, measured empirically).
  // Downward prediction is clamped against the real course geometry, so a
  // falling ghost lands on the platform it is actually heading for instead
  // of trailing the fall or sinking into artwork, and a sender's
  // landing-penetration frames are lifted back to the surface. Crumbled
  // platforms turn dynamic while falling and drop out of the static filter
  // automatically.
  ghostFloorY(state) {
    const feetY=state.snapY+41;
    let floor=Infinity;
    for (const body of Phaser.Physics.Matter.Matter.Composite.allBodies(this.matter.world.localWorld)) {
      if (!body.isStatic||body.isSensor) continue;
      const b=body.bounds;
      if (state.snapX<b.min.x-2||state.snapX>b.max.x+2) continue;
      if (b.min.y<feetY-SURFACE_TOLERANCE||b.min.y>=floor) continue;   // tops above the feet are walls beside the ghost
      floor=b.min.y;
    }
    return floor-41;
  }

  updateGhosts(list, myId) {
    const seen = new Set();
    for (const row of list) {
      if (row.id === myId) continue;
      seen.add(row.id);
      this.updateGhost(row,myId);
    }
    for (const [id,ghost] of this.ghosts) if (!seen.has(id)) {
      ghost.sprite.destroy();
      ghost.accessory?.destroy();
      destroyLayers(ghost.layers);
      ghost.label.destroy();
      this.ghosts.delete(id);
    }
  }

  /**
   * Fetch another climber's pet.
   *
   * Who else is on the mountain is not known until they appear, so their creature cannot be loaded
   * up front with everything else. It is asked for on sight and the climber wears the plain outfit
   * until it lands, which is a second at most and never blocks the game.
   */
  ensurePet(pet) {
    if (!pet) return false;
    const { atlas } = petKeys(pet);
    if (this.textures.exists(atlas)) return true;
    this.petsPending ??= new Set();
    if (this.petsPending.has(atlas)) return false;
    this.petsPending.add(atlas);
    if (!queuePet(this,pet)) { this.petsPending.delete(atlas); return this.textures.exists(atlas); }
    this.load.once('complete',()=>{
      this.petsPending.delete(atlas);
      // Anyone still wearing the plain outfit who now has a creature to wear puts it on.
      for (const ghost of this.ghosts.values()) {
        if (!ghost.animPrefix && petOf(ghost.avatar)) this.dressGhost(ghost,ghost.avatar,ghost.sprite.x,ghost.sprite.y);
      }
    });
    this.load.start();
    return false;
  }

  /** Build (or rebuild) how one other climber looks, keeping where they are and how they move. */
  dressGhost(ghost,avatar,x,y) {
    ghost.sprite?.destroy();
    ghost.accessory?.destroy();
    destroyLayers(ghost.layers);
    ghost.accessory=null;
    ghost.layers=[];
    const pet=petOf(avatar);
    if (pet && this.ensurePet(pet)) {
      const atlasKey=petKeys(pet).atlas;
      definePetAnims(this,atlasKey);
      ghost.animPrefix=atlasKey;
      ghost.sprite=this.add.sprite(x,y,atlasKey,0).setDisplaySize(88,88).setAlpha(.55).setDepth(80);
      ghost.layers=makeLayers(this,pet,80);
      for (const layer of ghost.layers) layer.setDisplaySize(88,88).setAlpha(.55);
    } else {
      ghost.animPrefix=null;
      ghost.sprite=this.add.sprite(x,y,'player-idle-1').setDisplaySize(68,70).setAlpha(.55).setDepth(80);
      ghost.sprite.setTint(avatarTint(avatar));
      ghost.accessory=this.add.text(x,y-39,accessoryGlyph(avatar),{
        fontFamily:'"Segoe UI Emoji","Apple Color Emoji",sans-serif',
        fontSize:'22px',
        stroke:'#24314d',
        strokeThickness:3,
      }).setOrigin(.5).setAlpha(.72).setDepth(85);
    }
    ghost.avatar=avatar;
  }

  updateGhost(row,myId) {
    if (!row||row.id===myId) return;
    let ghost=this.ghosts.get(row.id);
    let accepted=true;
    if (!ghost) {
      const avatar=normaliseAvatar(row.avatar);
      const label=this.add.text(row.x,row.y+40,row.name,{fontFamily:'Microsoft JhengHei',fontSize:'14px',fontStyle:'bold',color:'#dff8ff',stroke:'#24314d',strokeThickness:4}).setOrigin(.5).setDepth(90);
      ghost={label,layers:[],state:new RemoteGhostState(row,this.time.now),avatar};
      this.dressGhost(ghost,avatar,row.x,row.y);
      this.ghosts.set(row.id,ghost);
    } else accepted=ghost.state.push(row,this.time.now);
    if (!accepted) return;
    const avatar=normaliseAvatar(row.avatar);
    const changed=avatar.character!==ghost.avatar.character
      || avatar.accessory!==ghost.avatar.accessory
      || avatar.pet?.atlas!==ghost.avatar.pet?.atlas
      || (avatar.pet?.layers||[]).join()!==(ghost.avatar.pet?.layers||[]).join();
    if (changed) this.dressGhost(ghost,avatar,ghost.sprite.x,ghost.sprite.y);
    ghost.sprite.setFlipX(row.facing<0);
    const motion=row.animation||'idle';
    const key=ghost.animPrefix?petAnim(ghost.animPrefix,motion):motion;
    if (this.anims.exists(key)) ghost.sprite.play(key,true);
  }
}
