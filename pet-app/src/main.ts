import Phaser from 'phaser';
import './styles/main.css';
import { api } from './api';
import { audio } from './audio';
import { BedroomScene } from './game/BedroomScene';
import { PetAvatar } from './game/PetAvatar';
import { placeWearable } from './game/wearableLayout';
import type { Bootstrap, Identity, InventoryStack, Locale, PetDefinition, PetInstance, RoomPlacement } from './types';
import { idempotencyKey } from './types';


// iOS has ignored user-scalable=no since iOS 10, and touch-action: manipulation still permits
// pinch — it only removes the double-tap zoom delay. Refusing the WebKit gesture events is the
// only reliable way to decline a pinch, and it matters beyond appearance: once iOS claims the
// touch stream for a zoom, a control holding a finger may never receive touchend, leaving it
// stuck down.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, event => event.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', event => {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false });

const app = document.querySelector<HTMLDivElement>('#app')!;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[character]!));
const icon = (name: string) => `<span class="icon icon-${name}" aria-hidden="true"></span>`;

// The reduced-motion preference is stored per device; apply it before first paint so no
// entrance animation ever runs for a child who has asked for stillness.
if (localStorage.getItem('pet-reduced-motion') === '1') document.documentElement.classList.add('reduced-motion');

const UI = {
  'zh-HK': {
    title:'寵物樂園', home:'我的房間', collection:'寵物圖鑑', shop:'魔法商店', visit:'同班參觀', settings:'設定',
    coins:'金幣', dust:'星塵', feed:'餵食', play:'一起玩', sleep:'休息', decorate:'佈置房間', save:'儲存佈置', private:'私人房間', class:'開放同班參觀',
    hatchTitle:'你的第一顆蛋正在等待！', hatchCopy:'蛋內藏着普通、稀有或史詩級原創寵物。首次孵化完全免費。', hatch:'開始孵化',
    owned:'已擁有', locked:'未擁有', active:'主寵', choose:'選為主寵', buy:'購買', visitRoom:'參觀房間', back:'返回房間',
    teacherTitle:'老師金幣中心', individual:'個別學生', wholeClass:'全班', preview:'預覽發放', confirm:'確認發放', amount:'每人金額', note:'備註（選填）',
    empty:'暫時沒有內容。', daily:'今日經驗', probability:'普通 55% · 稀有 35% · 史詩 10%', pity:'史詩保底', randomEgg:'隨機寵物蛋', directPet:'指定寵物',
  },
  'en-US': {
    title:'Pet Paradise', home:'My Room', collection:'Pet Collection', shop:'Magic Shop', visit:'Class Visits', settings:'Settings',
    coins:'Coins', dust:'Stardust', feed:'Feed', play:'Play', sleep:'Rest', decorate:'Decorate', save:'Save room', private:'Private room', class:'Open to class',
    hatchTitle:'Your first egg is waiting!', hatchCopy:'A common, rare or epic original pet is inside. Your first hatch is free.', hatch:'Hatch now',
    owned:'Owned', locked:'Not owned', active:'Active', choose:'Make active', buy:'Buy', visitRoom:'Visit room', back:'Back to room',
    teacherTitle:'Teacher Coin Centre', individual:'Students', wholeClass:'Whole class', preview:'Preview grant', confirm:'Confirm grant', amount:'Coins per student', note:'Note (optional)',
    empty:'Nothing here yet.', daily:'Daily XP', probability:'Common 55% · Rare 35% · Epic 10%', pity:'Epic pity', randomEgg:'Random pet egg', directPet:'Choose a pet',
  },
} as const;

/**
 * The equipment board, in the order a player expects to read it down a character sheet.
 *
 * Four of these have no artwork behind them yet — the collection covers head, face, neck, back
 * and aura only. They are still laid out, and marked as not yet open, because a board with holes
 * punched in it reads as a board that is coming rather than one that is broken.
 */
const OUTFIT_SLOTS: { key: string; zh: string; en: string; icon: string; side: 'left' | 'right' | 'foot' }[] = [
  { key:'head', zh:'頭飾', en:'Head',  icon:'👑', side:'left' },
  { key:'face', zh:'面飾', en:'Face',  icon:'👓', side:'left' },
  { key:'neck', zh:'頸部', en:'Neck',  icon:'🧣', side:'left' },
  { key:'body', zh:'衣服', en:'Body',  icon:'👕', side:'left' },
  { key:'back', zh:'背部', en:'Back',  icon:'🎒', side:'right' },
  { key:'hand', zh:'手飾', en:'Hands', icon:'🧤', side:'right' },
  { key:'legs', zh:'下身', en:'Legs',  icon:'👖', side:'right' },
  { key:'feet', zh:'鞋子', en:'Shoes', icon:'👟', side:'right' },
  { key:'aura', zh:'光環', en:'Aura',  icon:'✨', side:'foot' },
];

/** Server refusals a student can hit, in the language they read. */
const REFUSALS: Record<string, string> = {
  'Not enough coins': '金幣唔夠。',
  'Not enough stardust': '星塵唔夠。',
  'Item already owned': '你已經有呢件嘢喇。',
  'Shop item not found': '商店冇呢件貨品。',
  'Pet already owned': '你已經有呢隻寵物喇。',
  'Pet not found': '搵唔到呢隻寵物。',
  'This pet cannot be bought directly': '呢隻寵物要靠扭蛋先開到。',
  'Starter egg already claimed': '新手蛋已經領取咗。',
  'Daily XP limit would be exceeded': '今日經驗已經滿咗，聽日再嚟。',
  'Food not owned': '你冇呢款食物。',
  'Food not found': '搵唔到呢款食物。',
  'Wearable not owned': '你冇呢件飾物。',
  'Invalid outfit': '呢套裝備唔合規則。',
  'Outfit slots must be unique': '同一個部位只可以著一件。',
  'Room theme not owned': '你未擁有呢個房間主題。',
  'Furniture not owned': '你冇呢件家具。',
  'Furniture footprints overlap': '家具重疊咗，請移開少少。',
  'Furniture is outside the room grid': '家具超出咗房間範圍。',
  'Furniture footprint is outside the room grid': '家具超出咗房間範圍。',
  'Too many copies of furniture placed': '呢件家具擺得太多。',
  'Room may contain at most 80 items': '房間最多只可以擺 80 件嘢。',
  'This room is not available to visit': '呢個房間而家唔開放參觀。',
  'Invalid reaction': '呢個反應唔啱。',
};

class StudentApp {
  identity: Identity; state!: Bootstrap; locale: Locale; game?: Phaser.Game; tab = 'home'; selectedFurniture = ''; roomPlacements: RoomPlacement[] = [];
  visiting?: any;
  surfaceObserver?: ResizeObserver;
  constructor(identity: Identity) { this.identity = identity; this.locale = identity.language || 'zh-HK'; }
  t(key: keyof typeof UI['zh-HK']) { return UI[this.locale][key] || UI['zh-HK'][key]; }
  name(localized: Record<Locale,string>) { return localized[this.locale] || localized['zh-HK']; }
  petName(definition: PetDefinition, stage: number) { return definition.names[this.locale]?.[stage - 1] || definition.names['zh-HK'][stage - 1]; }
  inventory(itemId: string) { return this.state.inventory.find((item) => item.itemId === itemId)?.quantity || 0; }
  activePet() { return this.state.pets.find((pet) => pet.id === this.state.profile.activePetId) || this.state.pets[0]; }
  definition(pet?: PetInstance) { return this.state.catalog.pets.find((definition) => definition.id === pet?.speciesId); }

  async start() {
    this.state = await api.bootstrap(); this.roomPlacements = this.state.room.placements.map((item) => ({...item})); this.renderShell();
    if (!this.state.profile.starterEggClaimed) this.renderHatch(); else this.openHome();
  }
  renderShell() {
    app.innerHTML = `<div class="pet-shell">
      <header class="pet-topbar">
        <a class="brand" href="/" aria-label="BuiO"><span class="brand-mark">B</span><span><b>${this.t('title')}</b><small>${escapeHtml(this.identity.name)} · ${escapeHtml(this.identity.className || '')}</small></span></a>
        <div class="pet-status" id="petStatus"></div>
        <div class="wallet"><span>${icon('coin')}<b id="coinBalance">${this.state.wallet.balance.toLocaleString()}</b><small>${this.t('coins')}</small></span></div>
        <button class="round-button" data-action="audio" aria-label="Sound">${icon(audio.enabled?'sound':'mute')}</button>
      </header>
      <main class="pet-main" id="petMain" data-layout="room">
        <section class="room-stage">
          <div class="room-bar" id="roomBar"></div>
          <section class="play-surface" id="playSurface"><div id="game-root"></div><div id="gameHud" class="game-hud"></div><div id="celebrationLayer" class="celebration-layer" aria-hidden="true"></div></section>
        </section>
        <aside class="side-panel" id="sidePanel"></aside>
      </main>
      <nav class="pet-nav" aria-label="Pet Paradise">
        ${[['home','home'],['collection','collection'],['shop','shop'],['visit','visit'],['settings','settings']].map(([tab,glyph])=>`<button data-tab="${tab}" class="${tab===this.tab?'active':''}" aria-current="${tab===this.tab?'page':'false'}">${icon(glyph)}<span>${this.t(tab as keyof typeof UI['zh-HK'])}</span></button>`).join('')}
      </nav>
      <div class="toast-stack" id="toasts" aria-live="polite"></div>
      <div class="modal-root" id="modalRoot"></div>
    </div>`;
    app.addEventListener('click', this.handleClick);
    document.addEventListener('pointerdown',this.handlePointerDown);
    document.addEventListener('pointermove',this.handlePointerMove);
    document.addEventListener('pointerup',this.handlePointerUp);
    document.addEventListener('pointercancel',this.handlePointerUp); app.addEventListener('change', this.handleChange); app.addEventListener('input', this.handleInput);
  }
  private handleClick = async (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-tab]'); if (!button) return;
    this.acknowledge(button); // visible response inside 100ms, before any await
    try {
      await audio.unlock(); audio.sfx('tap');
      if (button.dataset.tab) return this.openTab(button.dataset.tab);
      const action = button.dataset.action!;
      if (action === 'audio') { audio.setEnabled(!audio.enabled); button.innerHTML = icon(audio.enabled?'sound':'mute'); return; }
      if (action === 'hatch') return await this.hatch(button as HTMLButtonElement);
      if (action === 'feed') return await this.feed(button.dataset.id!);
      if (action === 'play') { this.game?.events.emit('pet:emote','happy'); audio.sfx('happy',this.state.catalog.pets.findIndex((pet)=>pet.id===this.activePet()?.speciesId)); return; }
      if (action === 'sleep') { this.game?.events.emit('pet:emote','sleep'); return; }
      if (action === 'activate') return await this.activate(button.dataset.id!);
      if (action === 'buy-random-egg') return await this.buyEgg({kind:'random'},button as HTMLButtonElement);
      if (action === 'buy-direct-egg') return await this.buyEgg({kind:'direct',speciesId:button.dataset.id},button as HTMLButtonElement);
      if (action === 'buy-item') return await this.buyItem(button.dataset.id!,button as HTMLButtonElement);
      if (action === 'shop-category') return await this.renderShop(button.dataset.id!);
      if (action === 'decorate') return await this.renderDecorator();
      if (action === 'open-themes') return await this.renderThemePicker();
      if (action === 'set-theme') {
        this.state.room.themeId=button.dataset.id!;
        document.querySelector('#modalRoot')!.innerHTML='';
        this.startBedroom(); this.renderDecorator(); return;
      }
      if (action === 'set-visibility') return await this.setVisibility(button.dataset.id as 'private'|'class');
      if (action === 'open-feed') return await this.renderFeedPicker();
      if (action === 'open-outfit') return await this.renderOutfitPicker();
      if (action === 'close-modal') { document.querySelector('#modalRoot')!.innerHTML=''; return; }
      if (action === 'add-furniture') { this.game?.events.emit('room:add-item',button.dataset.id); return; }
      if (action === 'grow-item') { if(this.selectedFurniture)this.game?.events.emit('room:grow-selected',this.selectedFurniture); return; }
      if (action === 'shrink-item') { if(this.selectedFurniture)this.game?.events.emit('room:shrink-selected',this.selectedFurniture); return; }
      if (action === 'rotate-item') { if(this.selectedFurniture)this.game?.events.emit('room:rotate-selected',this.selectedFurniture); return; }
      if (action === 'remove-item') { if(this.selectedFurniture)this.game?.events.emit('room:remove-selected',this.selectedFurniture); return; }
      if (action === 'save-room') return await this.saveRoom();
      if (action === 'visit-room') return await this.visitRoom(button.dataset.id!);
      if (action === 'reaction') return await this.react(button.dataset.owner!,button.dataset.id!);
      if (action === 'back-home') return await this.openHome();
      if (action === 'equip-wearable') return await this.equipWearable(button.dataset.id!);
      if (action === 'unequip-slot') return await this.clearSlot(button.dataset.id!);
    } catch (error) { this.toast((error as Error).message,true); }
  };
  private handleChange = (event: Event) => { const target=event.target as HTMLInputElement|HTMLSelectElement;if(target.id==='roomVisibility')this.state.room.visibility=target.value as 'private'|'class';if(target.id==='roomTheme')this.state.room.themeId=target.value; };
  private handleInput = (event: Event) => { const target=event.target as HTMLInputElement;if(target.dataset.setting==='music'){audio.setLevels(Number(target.value),audio.sfxLevel);}if(target.dataset.setting==='sfx'){audio.setLevels(audio.musicLevel,Number(target.value));} };
  private acknowledge(element: HTMLElement) {
    element.classList.remove('is-pressed'); void element.offsetWidth; element.classList.add('is-pressed');
    window.setTimeout(()=>element.classList.remove('is-pressed'),200);
  }
  private openTab(tab: string) {
    this.tab=tab;document.querySelectorAll('[data-tab]').forEach((item)=>{const on=(item as HTMLElement).dataset.tab===tab;item.classList.toggle('active',on);item.setAttribute('aria-current',on?'page':'false');});
    if(tab==='home')this.openHome();else if(tab==='collection')this.renderCollection();else if(tab==='shop')this.renderShop('eggs');else if(tab==='visit')this.renderVisits();else this.renderSettings();
  }
  private ensureGame() {
    if (this.game) return;
    document.querySelector('#game-root')!.innerHTML=''; // clear the pre-hatch poster
    // Scale.FIT (contain) rather than ENVELOP (cover).
    //
    // Cover was chosen to kill the letterbox bars, and it did — by cropping the top and bottom of
    // the design surface whenever the play surface was wider than 16:9, which it is as soon as
    // the decorating strip appears. That was harmless when the room was a diamond floating in the
    // middle. It is not harmless now: the floor runs to the bottom of the frame, so cover cut off
    // the front rows of the placement grid and a child could not reach them at all.
    //
    // The bars come back, so the surface behind the canvas is painted with the room's own colour
    // and they read as the room continuing rather than as black edges.
    this.game = new Phaser.Game({
      type: Phaser.AUTO, parent:'game-root', transparent:true,
      render:{antialias:true,pixelArt:false},
      scale:{ mode:Phaser.Scale.FIT, autoCenter:Phaser.Scale.CENTER_BOTH, parent:'game-root', width:1280, height:720, expandParent:false },
      physics:{default:'arcade',arcade:{debug:false,gravity:{x:0,y:0}}}, audio:{noAudio:true},
    });
    // The play surface also changes size without a window resize (panel slides in,
    // class toggles, iPad rotation), so observe it directly and re-envelop.
    const surface = document.querySelector('#playSurface');
    if (surface && typeof ResizeObserver !== 'undefined') {
      this.surfaceObserver = new ResizeObserver(() => this.game?.scale.refresh());
      this.surfaceObserver.observe(surface);
    }
    // A handle on the running game. The room is the one part of this app that cannot be
    // inspected from the DOM — everything inside the canvas is invisible to a test — so the
    // browser checks reach the live scene through here to assert what is actually on screen.
    (window as unknown as { __petGame?: Phaser.Game }).__petGame = this.game;
    this.game.scene.add('Bedroom',BedroomScene,false);
    this.game.events.on('room:placements',(placements:RoomPlacement[])=>{this.roomPlacements=placements.map((item)=>({...item}));this.refreshDecorStrip();});
    this.game.events.on('room:selected',(id:string)=>{this.selectedFurniture=id;document.querySelector('#furnitureActions')?.classList.add('visible');});
  }
  /**
   * Re-measure the play surface and resize the canvas to it.
   *
   * Reading the parent synchronously right after un-hiding the stage still sees the old
   * zero-sized box, so Phaser scaled the canvas to 0x0 and the room rendered nothing even
   * though the scene was active and visible — the blank room after returning from another
   * tab. Measuring on the next frame, once layout has settled, and resizing explicitly
   * rather than relying on refresh() alone, fixes it for every entry path.
   */
  private refreshStage() {
    const scale = this.game?.scale; if (!scale) return;
    const apply = () => {
      const surface = document.querySelector('#playSurface') as HTMLElement | null;
      if (!surface) return;
      const { width, height } = surface.getBoundingClientRect();
      if (width < 1 || height < 1) return; // still hidden; the ResizeObserver will call back
      scale.setParentSize(width, height);
      scale.refresh();
    };
    apply();
    requestAnimationFrame(apply);
  }

  private startBedroom(roomOverride?: any, petOverride?: PetInstance) {
    this.ensureGame(); const pet=petOverride||this.activePet();if(!pet)return;const definition=this.definition(pet)!;
    const originalRoom=this.state.room;if(roomOverride)this.state.room={themeId:roomOverride.themeId,visibility:roomOverride.visibility,placements:roomOverride.placements};
    // Contain leaves bars above and below the room on a wide surface. Paint what is behind the
    // canvas with the room's own wall colour so they read as the room carrying on rather than as
    // the picture stopping.
    const theme=this.state.catalog.rooms.find((entry)=>entry.id===this.state.room.themeId);
    const surface=document.querySelector('#playSurface') as HTMLElement|null;
    if(surface&&theme)surface.style.background=theme.primary;
    this.game!.scene.stop('Bedroom');this.game!.scene.start('Bedroom',{bootstrap:this.state,activePet:pet,petDefinition:definition});
    // The canvas is sized from its container. If anything started the scene while the stage
    // was still hidden the canvas would be zero-sized, so re-measure once it is on screen.
    this.refreshStage();
    if(roomOverride)this.state.room=originalRoom;audio.setTheme('bedroom');
  }
  private openHome() {
    this.visiting=undefined;this.tab='home';
    this.game?.events.emit('room:set-editing',false);
    document.querySelector('#petMain')?.removeAttribute('data-mode');
    // Reveal the stage BEFORE booting the scene. Coming back from a browsing tab the layout
    // is still "full", which hides .room-stage entirely; a scene started into a display:none
    // container gets a zero-sized canvas and renders nothing until something forces a resize,
    // which is why the room came up blank until the tab was tapped a second time.
    this.setLayout('room');
    this.startBedroom();this.renderHomePanel();document.querySelector('#gameHud')!.innerHTML='';
  }
  private renderHatch() {
    // Before the first hatch there is no Phaser scene, so the play surface would otherwise be a
    // dead rectangle on the very first screen a child sees. Dress it with a CSS hero instead.
    document.querySelector('#game-root')!.innerHTML=`<div class="stage-poster"><div class="poster-egg"><span></span></div><div class="poster-sparks" aria-hidden="true">${Array.from({length:10},(_,index)=>`<i style="--i:${index}"></i>`).join('')}</div></div>`;
    // The poster lives in the play surface, so the copy sits in the bar above it — the side
    // panel is not rendered in room layout.
    this.setLayout('room');
    document.querySelector('#roomBar')!.innerHTML=`<div class="room-bar-identity hatch-bar"><div class="hatch-copy"><p class="eyebrow">FIRST FRIEND</p><h1>${this.t('hatchTitle')}</h1><p class="muted">${this.t('hatchCopy')}</p></div><div class="odds">${this.t('probability')}</div><button class="primary jumbo" data-action="hatch">${this.t('hatch')}</button></div>`;
  }
  private async hatch(button: HTMLButtonElement) {
    button.disabled=true;button.classList.add('loading');const result=await api.hatch(idempotencyKey());audio.sfx('hatch');this.celebrate(result.rarity==='epic'?'epic':'hatch');await this.reload();this.startBedroom();this.renderReveal(result.speciesId,result.rarity,result.duplicateCoins);
  }
  private renderReveal(speciesId:string,rarity:string,refund:number){const definition=this.state.catalog.pets.find((pet)=>pet.id===speciesId)!;const pet=this.state.pets.find((pet)=>pet.speciesId===speciesId);const stage=pet?.stage||1;this.modal(`<div class="reveal-card ${rarity}"><p class="eyebrow">${rarity.toUpperCase()}</p><img src="${definition.art[stage-1]}" alt=""><h2>${escapeHtml(this.petName(definition,stage))}</h2><p>${refund?`重複品種，退回 ${refund} 金幣`:`天賦：${escapeHtml(this.name(definition.talent))}`}</p><button class="primary" data-action="back-home">${this.t('back')}</button></div>`);}
  /**
   * 'room' gives the play surface the whole width with its controls stacked above it.
   * 'full' hides the room entirely and gives the panel the whole screen — the browsing tabs
   * (collection, shop, visits, settings) do not show the room at all.
   *
   * The side panel used to be a permanent grid column, which on an iPad surrendered ~340px
   * of room width on every screen including the one where the room is the whole point.
   */
  private setLayout(mode: 'room' | 'full') {
    document.querySelector('#petMain')?.setAttribute('data-layout', mode);
    if (mode === 'room') {
      document.querySelector('#sidePanel')!.innerHTML = '';
    } else {
      document.querySelector('#roomBar')!.innerHTML = '';
      document.querySelector('#petStatus')!.innerHTML = ''; // no pet context off the room tab
      // Nothing is visible, so stop rendering it: a hidden Phaser scene running at 60fps is
      // pure battery cost on a tablet.
      this.game?.scene.stop('Bedroom');
    }
    // The canvas is sized to its container, so it has to be told the container changed.
    this.refreshStage();
  }

  private renderHomePanel() {
    const pet=this.activePet();const definition=this.definition(pet);if(!pet||!definition){this.renderHatch();return;}const next=this.state.catalog.evolutionThresholds[pet.stage]||pet.xp;const previous=this.state.catalog.evolutionThresholds[pet.stage-1]||0;const progress=pet.stage===4?100:Math.round(((pet.xp-previous)/(next-previous))*100);
    this.setLayout('room');
    const dailyXp=pet.dailyXpDate===this.state.serverDay?pet.dailyXp:0;
    const actions: [string,string,string][] = [
      ['play','play',this.t('play')],
      ['sleep','moon',this.t('sleep')],
      ['decorate','decorate',this.t('decorate')],
      ['open-feed','food',this.t('feed')],
      ['open-outfit','spark',this.locale==='zh-HK'?'換裝':'Outfit'],
    ];
    // Identity rides in the top bar alongside the coin pill; the room bar carries only actions.
    document.querySelector('#petStatus')!.innerHTML=`<span class="rarity ${definition.rarity}">${definition.rarity}</span><b>${escapeHtml(this.petName(definition,pet.stage))}</b><span class="room-bar-stage">Stage ${pet.stage}/4</span><div class="progress" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><i style="width:${progress}%"></i></div><small>${pet.xp.toLocaleString()} XP · ${this.t('daily')} ${dailyXp}/${this.state.catalog.dailyXpCap}</small>`;
    document.querySelector('#roomBar')!.innerHTML=`<div class="room-bar-actions">${actions.map(([action,glyph,label])=>`<button data-action="${action}">${icon(glyph)}<span>${escapeHtml(label)}</span></button>`).join('')}</div>`;
  }

  /**
   * Feeding and dressing are list pickers. They open over the room rather than living in a
   * permanent side column, so the room keeps the full width of the screen while browsing.
   */
  private renderFeedPicker() {
    const foods=this.state.catalog.foods.filter((food)=>this.inventory(food.id)>0);
    const body=foods.length
      ? `<div class="food-row">${foods.map((food)=>`<button class="food-chip" data-action="feed" data-id="${food.id}"><span>${['🍎','🍪','🥕','🫐','🥪','🥗','🍞','🍙','🌙','🥧','🍲','✨'][this.state.catalog.foods.indexOf(food)]}</span><b>${escapeHtml(this.name(food.name))}</b><small>+${food.xp} XP · ×${this.inventory(food.id)}</small></button>`).join('')}</div>`
      : `<div class="empty-state">${this.t('empty')}<br><button data-tab="shop" class="text-button" data-action="close-modal">${this.t('shop')}</button></div>`;
    this.picker(this.t('feed'), body);
  }

  /**
   * The creature wearing what is in the slots.
   *
   * The landmarks are measured against the atlas cell, not the standalone portrait, so the
   * preview shows the atlas's resting frame — cropped out with a background offset — and lays
   * the pieces over it with the placement the room uses. Falling back to the portrait when a
   * pet has no atlas costs the overlays, which is the right trade: a creature with no clothes is
   * better than a creature wearing them in the wrong places.
   */
  private previewFigure(definition:PetDefinition,pet:PetInstance) {
    const layout=this.state.catalog.animation;
    const fullOutfit=PetAvatar.fullOutfitUrl(definition,pet.stage,pet.equippedWearables,this.state.catalog.outfitAtlases);
    const atlas=fullOutfit||definition.atlas?.[pet.stage-1];
    const anchors=definition.anchors?.[pet.stage-1];
    if(!layout||!atlas||!anchors) {
      return `<img src="${definition.art[pet.stage-1]}" alt="" draggable="false">`;
    }
    const grid=this.atlasGrid(layout);
    // A complete redrawn outfit is already fitted and occluded in every frame. The preview uses
    // it as one character sheet and intentionally does not add the old free-positioned pieces.
    const pieces=(fullOutfit||definition.animated?[]:pet.equippedWearables).map((id)=>{
      const item=this.state.catalog.wearables.find((entry)=>entry.id===id);
      if(!item?.art) return null;
      const place=placeWearable(anchors,item.slot,item.content||{x:0,y:0,width:1,height:1},1,'front',item.fit);
      if(!place) return null;
      const left=(place.x-place.size*place.originX)*100;
      const top=(place.y-place.size*place.originY)*100;
      return {place,html:`<img class="figure-piece" src="${item.art}" alt="" draggable="false"
        style="left:${left.toFixed(2)}%;top:${top.toFixed(2)}%;width:${(place.size*100).toFixed(2)}%">`};
    }).filter(Boolean) as {place:{behind:boolean};html:string}[];
    const behind=pieces.filter((piece)=>piece.place.behind).map((piece)=>piece.html).join('');
    const front=pieces.filter((piece)=>!piece.place.behind).map((piece)=>piece.html).join('');
    return `<div class="figure-stack">${behind}<i class="figure-body" style="background-image:url('${atlas}');background-size:${grid.x*100}% ${grid.y*100}%"></i>${front}</div>`;
  }
  /** Columns and rows of the atlas grid, so one cell can be cropped out with a background size. */
  private atlasGrid(layout:{framesPerDirection:number;columns?:number;rows?:number;actions:{start:number;length:number}[]}) {
    // Take the grid the sheet publishes. Inferring it from the longest action only held while
    // one action filled a row; on the pose sheet the longest is a four-frame walk on a sheet
    // five across, which cropped a four by one grid and showed the creature in strips.
    if(layout.columns&&layout.rows) return {x:layout.columns,y:layout.rows};
    const cells=layout.framesPerDirection;
    const columns=Math.max(...layout.actions.map((action)=>action.length));
    const rows=Math.max(1,Math.round(cells/Math.max(1,columns)));
    return {x:columns,y:rows};
  }

  /**
   * Frame a piece's thumbnail on the piece itself.
   *
   * Every item is drawn on the same 640px canvas and none of them fills it — a bell occupies a
   * fifth of its frame, sitting off to one side. Shown as-is they all read as specks adrift in a
   * large box, so each thumbnail is magnified to its measured content and shifted so that
   * content lands in the middle of the slot.
   */
  private thumbStyle(item:{content?:{x:number;y:number;width:number;height:number}|null}) {
    const box=item.content; if(!box) return '';
    const zoom=Math.min(3.2,Math.max(1,0.92/Math.max(box.width,box.height)));
    const shiftX=(0.5-(box.x+box.width/2))*100;
    const shiftY=(0.5-(box.y+box.height/2))*100;
    return `transform:scale(${zoom.toFixed(2)}) translate(${shiftX.toFixed(1)}%, ${shiftY.toFixed(1)}%)`;
  }

  /**
   * The equipment board: worn gear on the left around the creature, the wardrobe on the right.
   *
   * Items move by dragging one onto a slot, and by tapping — dragging is what the board asks
   * for, but a tap has to work too, because a drag that starts on a scrolling list is easy for
   * a child to lose halfway and there is nothing to fall back on if it does.
   */
  private renderOutfitPicker() {
    const pet=this.activePet(); if(!pet) return;
    const zh=this.locale==='zh-HK';
    const definition=this.state.catalog.pets.find((item)=>item.id===pet.speciesId)!;
    const byId=(id:string)=>this.state.catalog.wearables.find((item)=>item.id===id);
    const equipped=new Map(pet.equippedWearables.map((id)=>[byId(id)?.slot||'',id]));
    const owned=this.state.catalog.wearables.filter((item)=>this.inventory(item.id)>0);
    const stocked=new Set(this.state.catalog.wearables.map((item)=>item.slot));

    const cell=(slot:typeof OUTFIT_SLOTS[number])=>{
      const id=equipped.get(slot.key); const item=id?byId(id):undefined;
      const open=stocked.has(slot.key);
      return `<div class="gear-slot${item?' filled':''}${open?'':' sealed'}" data-slot="${slot.key}" data-drop="${slot.key}">
        <span class="gear-label">${zh?slot.zh:slot.en}</span>
        ${item
          ? `<span class="gear-thumb"><img src="${item.art}" alt="${escapeHtml(this.name(item.name))}" draggable="false" style="${this.thumbStyle(item)}"></span><button class="gear-clear" data-action="unequip-slot" data-id="${slot.key}" aria-label="${zh?'脫下':'Remove'}">✕</button>`
          : `<span class="gear-ghost">${open?slot.icon:'🔒'}</span>`}
      </div>`;
    };
    const column=(side:string)=>OUTFIT_SLOTS.filter((slot)=>slot.side===side).map(cell).join('');

    const wardrobe=owned.length
      ? `<div class="gear-tray">${owned.map((item)=>`<button class="gear-tile${pet.equippedWearables.includes(item.id)?' worn':''}" data-action="equip-wearable" data-id="${item.id}" data-slot="${item.slot}" draggable="false">
          <span class="gear-thumb"><img src="${item.art}" alt="" loading="lazy" draggable="false" style="${this.thumbStyle(item)}"></span>
          <b>${escapeHtml(this.name(item.name))}</b>
          <small>${OUTFIT_SLOTS.find((slot)=>slot.key===item.slot)?.[zh?'zh':'en']||item.slot}</small>
        </button>`).join('')}</div>`
      : `<p class="muted">${zh?'到商店收集頭飾、面飾、頸飾、背飾及光環。':'Collect head, face, neck, back and aura accessories in the shop.'}</p>`;

    const sealed=OUTFIT_SLOTS.filter((slot)=>!stocked.has(slot.key)).map((slot)=>zh?slot.zh:slot.en).join('、');

    this.picker(`${zh?'裝備':'Equipment'} · ${pet.equippedWearables.length}/${OUTFIT_SLOTS.filter((slot)=>stocked.has(slot.key)).length}`,
      `<div class="gear-board">
        <section class="gear-doll">
          <div class="gear-column">${column('left')}</div>
          <div class="gear-figure">${this.previewFigure(definition,pet)}</div>
          <div class="gear-column">${column('right')}</div>
          <div class="gear-foot">${column('foot')}</div>
        </section>
        <section class="gear-wardrobe">
          <p class="eyebrow">${zh?'背包':'Bag'} · ${owned.length}</p>
          ${wardrobe}
          ${sealed?`<p class="gear-note">🔒 ${sealed} ${zh?'尚未開放。':'not available yet.'}</p>`:''}
        </section>
      </div>`,'wide');
  }

  /**
   * Pointer-driven dragging, not the HTML5 drag events.
   *
   * This is an iPad app first, and native drag-and-drop never fires on iOS Safari, so the
   * gesture is built from pointer events: lift a copy of the tile under the finger, light up the
   * slot it is over, drop it there.
   *
   * Bound once to the document rather than to the board, because the board is rebuilt from
   * scratch every time something is equipped — a listener attached to it would be thrown away
   * with the first successful drop.
   */
  private dragged: HTMLElement|null=null; private dragGhost: HTMLElement|null=null;
  private dragTarget: HTMLElement|null=null; private dragging=false; private dragFrom={x:0,y:0};

  private endDrag() {
    this.dragGhost?.remove(); this.dragGhost=null;
    this.dragTarget?.classList.remove('over','reject'); this.dragTarget=null;
    this.dragged?.classList.remove('lifted'); this.dragged=null;
    this.dragging=false;
  }
  private slotUnder(x:number,y:number) {
    return (document.elementFromPoint(x,y) as HTMLElement|null)?.closest('[data-drop]') as HTMLElement|null;
  }
  private handlePointerDown = (event: PointerEvent) => {
    const tile=(event.target as HTMLElement)?.closest?.('.gear-tile') as HTMLElement|null;
    if(!tile) return;
    this.dragged=tile; this.dragFrom={x:event.clientX,y:event.clientY}; this.dragging=false;
  };
  private handlePointerMove = (event: PointerEvent) => {
    const tile=this.dragged; if(!tile) return;
    if(!this.dragging){
      // Only commit to a drag once the finger has clearly moved, so a tap stays a tap and the
      // wardrobe can still be scrolled with the same finger.
      if(Math.hypot(event.clientX-this.dragFrom.x,event.clientY-this.dragFrom.y)<10) return;
      this.dragging=true; tile.classList.add('lifted');
      const source=tile.querySelector('img') as HTMLImageElement|null;
      const ghost=document.createElement('div'); ghost.className='gear-ghost-drag';
      if(source)ghost.innerHTML='<img src="'+source.src+'" alt="">';
      document.body.appendChild(ghost); this.dragGhost=ghost;
    }
    this.dragGhost!.style.transform='translate('+event.clientX+'px, '+event.clientY+'px)';
    const over=this.slotUnder(event.clientX,event.clientY);
    if(over!==this.dragTarget){
      this.dragTarget?.classList.remove('over','reject');
      this.dragTarget=over;
      if(over)over.classList.add(over.dataset.drop===tile.dataset.slot?'over':'reject');
    }
  };
  private handlePointerUp = (event: PointerEvent) => {
    const tile=this.dragged; if(!tile){this.endDrag();return;}
    const dropped=this.dragging?this.slotUnder(event.clientX,event.clientY):null;
    const id=tile.dataset.id; const slot=tile.dataset.slot; const wasDragging=this.dragging;
    this.endDrag();
    if(!wasDragging||!dropped) return;   // a plain tap; the click handler equips it instead
    if(dropped.dataset.drop!==slot){this.toast(this.locale==='zh-HK'?'呢格唔啱著呢件。':'That piece does not go in this slot.',true);return;}
    void this.equipWearable(id!);
  };

  private picker(title: string, body: string, variant='') {
    this.modal(`<div class="picker ${variant}"><header class="picker-head"><h2>${escapeHtml(title)}</h2><button class="round-button" data-action="close-modal" aria-label="${this.locale==='zh-HK'?'關閉':'Close'}">✕</button></header><div class="picker-body">${body}</div></div>`,`framed ${variant}`.trim());
  }
  private async feed(foodId:string){const pet=this.activePet()!;const result=await api.feed(pet.id,foodId,idempotencyKey());audio.sfx('feed');this.game?.events.emit('pet:emote',result.evolved?'evolve':'eat');if(result.evolved){audio.sfx('evolve');this.celebrate('evolve');}await this.reload();this.startBedroom();this.renderHomePanel();this.renderFeedPicker();}
  private async activate(petId:string){await api.activatePet(petId);await this.reload();audio.sfx('happy');this.renderCollection();}
  private renderCollection() { this.setLayout('full');const owned=new Map(this.state.pets.map((pet)=>[pet.speciesId,pet]));document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll"><p class="eyebrow">20 SPECIES · 80 FORMS</p><h1>${this.t('collection')}</h1><div class="collection-grid">${this.state.catalog.pets.map((definition)=>{const pet=owned.get(definition.id);const stage=pet?.stage||1;return `<article class="pet-card ${definition.rarity} ${pet?'':'locked'}"><div class="pet-art"><img src="${definition.art[stage-1]}" alt="" loading="lazy"></div><span class="rarity ${definition.rarity}">${definition.rarity}</span><h3>${escapeHtml(this.petName(definition,stage))}</h3><p>${pet?`Stage ${stage} · ${pet.xp} XP`:this.t('locked')}</p>${pet?`<button data-action="activate" data-id="${pet.id}" ${pet.id===this.state.profile.activePetId?'disabled':''}>${pet.id===this.state.profile.activePetId?this.t('active'):this.t('choose')}</button>`:''}</article>`}).join('')}</div></div>`; }
  private renderShop(category='eggs') {
    this.setLayout('full');const categories=this.locale==='zh-HK'
      ?[['eggs','寵物蛋'],['food','食物'],['wearables','服飾'],['rooms','房間'],['furniture','家具']]
      :[['eggs','Eggs'],['food','Food'],['wearables','Outfits'],['rooms','Rooms'],['furniture','Furniture']];
    let cards='';const pet=this.activePet();
    if(category==='eggs')cards=`<article class="shop-feature"><div class="shop-egg"></div><div><span class="rarity epic">${this.t('pity')} ${this.state.profile.eggPity}/${this.state.catalog.egg.pityAt-1}</span><h3>${this.t('randomEgg')}</h3><p>${this.t('probability')}<br>${this.locale==='zh-HK'?'第十抽必定史詩，未擁有品種權重較高。':'The tenth draw is guaranteed epic; unseen species are favoured.'}</p><button class="primary" data-action="buy-random-egg">${this.t('buy')} · ${this.state.catalog.egg.randomPrice} ${this.t('coins')}</button></div></article><h2>${this.t('directPet')}</h2><div class="shop-grid">${this.state.catalog.pets.filter((item)=>item.rarity!=='epic').map((item)=>`<article class="shop-card"><img src="${item.art[0]}" alt="" loading="lazy"><span class="rarity ${item.rarity}">${item.rarity}</span><h3>${escapeHtml(this.petName(item,1))}</h3><button data-action="buy-direct-egg" data-id="${item.id}" ${this.state.pets.some((owned)=>owned.speciesId===item.id)?'disabled':''}>${this.state.pets.some((owned)=>owned.speciesId===item.id)?this.t('owned'):`${this.t('buy')} · ${item.rarity==='common'?1200:2200}`}</button></article>`).join('')}</div>`;
    const list = category==='food'?this.state.catalog.foods:category==='wearables'?this.state.catalog.wearables:category==='rooms'?this.state.catalog.rooms.filter((room)=>!room.pending||this.inventory(`room:${room.id}`)>0).map((item)=>({...item,id:`room:${item.id}`,category:'room_theme'})):category==='furniture'?this.state.catalog.furniture:[];
    if(category!=='eggs')cards=`<div class="shop-grid">${list.map((item:any)=>{const owned=this.inventory(item.id)>0;const art=item.art||'';return `<article class="shop-card ${owned?'owned':''}">${art?`<img src="${art}" alt="" loading="lazy">`:`<div class="item-glyph ${item.category}">${icon(item.category==='food'?'food':item.kind||'spark')}</div>`}<h3>${escapeHtml(this.name(item.name))}</h3><p>${item.xp?`+${item.xp} XP`:item.kind||item.category}</p><button data-action="buy-item" data-id="${item.id}" ${owned&&!['food','furniture'].includes(item.category)?'disabled':''}>${owned&&!['food','furniture'].includes(item.category)?this.t('owned'):`${this.t('buy')} · ${item.price} ${this.t('coins')}`}</button></article>`}).join('')}</div>`;
    document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll"><p class="eyebrow">MAGIC MARKET</p><h1>${this.t('shop')}</h1><div class="filter-row" role="tablist">${categories.map(([id,label])=>`<button data-action="shop-category" data-id="${id}" role="tab" aria-selected="${category===id}" class="${category===id?'active':''}">${label}</button>`).join('')}</div>${cards}</div>`;
  }
  private async buyEgg(body:any,button:HTMLButtonElement){button.disabled=true;let result;try{result=await api.buyEgg(body,idempotencyKey());}catch(error){button.disabled=false;throw error;}audio.sfx('hatch');this.celebrate(result.rarity==='epic'?'epic':'hatch');await this.reload();this.startBedroom();this.renderReveal(result.speciesId,result.rarity,result.duplicateCoins);}
  private async buyItem(itemId:string,button:HTMLButtonElement){button.disabled=true;try{await api.purchase({itemId,quantity:1},idempotencyKey());}catch(error){button.disabled=false;throw error;}audio.sfx('buy');await this.reload();this.updateWallet();this.renderShop(button.closest('.panel-scroll')?.querySelector('.filter-row .active')?.getAttribute('data-id')||'eggs');this.toast(this.locale==='zh-HK'?'購買成功！':'Purchase complete!');}
  private renderDecorator(){
    this.game?.events.emit('room:set-editing',true);
    const zh=this.locale==='zh-HK';
    const owned=this.state.catalog.furniture.filter((item)=>this.inventory(item.id)>0);
    const theme=this.state.catalog.rooms.find((room)=>room.id===this.state.room.themeId);
    const inventory=owned.length
      ?`<div class="decor-strip">${owned.map((item)=>{const left=this.remaining(item.id);return `<button data-action="add-furniture" data-id="${item.id}" ${left?'':'disabled'}><span>${escapeHtml(this.name(item.name).split(/[・·‧·]/).pop()!.trim())}</span><small>×${left}</small></button>`;}).join('')}</div>`
      :`<div class="decor-strip empty"><span>${zh?'還沒有家具。':'No furniture yet.'}</span><button data-tab="shop" class="secondary">${zh?'去商店選購家具':'Browse furniture'}</button></div>`;
    // Decorating happens in the room, so the controls stay a bar above it rather than a side
    // column — the child needs to see the whole floor while placing.
    this.setLayout('room');
    document.querySelector('#petMain')?.setAttribute('data-mode','editing');
    // No <select> anywhere: a native option list is rendered by the OS and cannot be styled,
    // so it breaks the illusion the moment it opens. Visibility is a two-state toggle and the
    // theme opens the same framed picker the rest of the app uses.
    // Visit privacy lives in Settings, not here — it is a standing account setting rather
    // than part of arranging a room, and it kept this bar from being about placing furniture.
    document.querySelector('#roomBar')!.innerHTML=`<div class="room-bar-identity decor-head"><h1>${this.t('decorate')}</h1><button class="chooser" data-action="open-themes"><small>${zh?'主題':'Theme'}</small><b>${escapeHtml(theme?this.name(theme.name):'—')}</b></button><div class="decor-tools" id="furnitureActions"><button data-action="grow-item">＋ ${zh?'放大':'Bigger'}</button><button data-action="shrink-item">－ ${zh?'縮小':'Smaller'}</button><button data-action="rotate-item">↻ ${zh?'旋轉':'Rotate'}</button><button data-action="remove-item">× ${zh?'收回':'Remove'}</button></div><button class="primary" data-action="save-room">${this.t('save')}</button><button class="secondary" data-action="back-home">${zh?'取消':'Cancel'}</button></div>${inventory}`;
  }

  /**
   * Update the counts in place as pieces are placed and removed. Patching the existing
   * buttons rather than re-rendering the strip keeps its horizontal scroll position, which
   * matters when there are ten pieces and the child is mid-scroll.
   */
  private refreshDecorStrip(){
    const strip=document.querySelector('.decor-strip'); if(!strip) return;
    strip.querySelectorAll<HTMLButtonElement>('[data-action="add-furniture"]').forEach((button)=>{
      const left=this.remaining(button.dataset.id!);
      const count=button.querySelector('small'); if(count) count.textContent=`×${left}`;
      button.disabled=left<=0;
    });
  }

  /**
   * Visit privacy is a standing account setting, so it persists the moment it changes rather
   * than waiting for a room save. The room endpoint takes the whole room, so the current
   * theme and placements ride along unchanged. Reflected optimistically, then confirmed.
   */
  private async setVisibility(visibility:'private'|'class'){
    if(this.state.room.visibility===visibility) return;
    const previous=this.state.room.visibility;
    this.state.room.visibility=visibility;
    this.renderSettings();
    try{
      this.state.room=await api.saveRoom({themeId:this.state.room.themeId,visibility,placements:this.roomPlacements});
      this.toast(this.locale==='zh-HK'?'已更新參觀權限。':'Visit setting updated.');
    }catch(error){
      this.state.room.visibility=previous; this.renderSettings(); throw error;
    }
  }

  /** Copies still free to place: owned minus whatever is already in the room right now. */
  private remaining(itemId:string){
    return this.inventory(itemId)-this.roomPlacements.filter((placement)=>placement.itemId===itemId).length;
  }

  private renderThemePicker(){
    const zh=this.locale==='zh-HK';
    const themes=this.state.catalog.rooms.filter((room)=>this.inventory(`room:${room.id}`)>0);
    const body=`<div class="theme-grid">${themes.map((room)=>`<button class="theme-card ${room.id===this.state.room.themeId?'on':''}" data-action="set-theme" data-id="${room.id}"><img src="${room.art}" alt="" loading="lazy"><b>${escapeHtml(this.name(room.name))}</b></button>`).join('')}</div>`;
    this.picker(zh?'房間主題':'Room theme',body);
  }
  private async saveRoom(){
    const button=document.querySelector<HTMLButtonElement>('[data-action="save-room"]');
    if(button){button.disabled=true;button.classList.add('loading');}
    try{
      const result=await api.saveRoom({themeId:this.state.room.themeId,visibility:this.state.room.visibility,placements:this.roomPlacements});
      this.state.room=result;
      this.roomPlacements=result.placements.map((item:RoomPlacement)=>({...item}));
      audio.sfx('decorate');
      // Saving a room touches no wallet, inventory or pet state, so there is nothing to
      // re-fetch; and the scene already shows this exact arrangement. The old path did a full
      // bootstrap round trip and then restarted the Phaser scene — re-running preload and
      // rebuilding every furniture object — for no visible change. That was the delay.
      this.game?.events.emit('room:set-editing',false);
      document.querySelector('#petMain')?.removeAttribute('data-mode');
      this.tab='home'; this.renderHomePanel();
      this.toast(this.locale==='zh-HK'?'房間已儲存。':'Room saved.');
    }catch(error){
      if(button){button.disabled=false;button.classList.remove('loading');}
      throw error;
    }
  }
  private async renderVisits(){this.setLayout('full');document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll"><p class="eyebrow">CLASS VISITS</p><h1>${this.t('visit')}</h1><div class="loading-card">${this.locale==='zh-HK'?'正在尋找開放房間…':'Finding open rooms…'}</div></div>`;const data=await api.classRooms();document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll"><p class="eyebrow">${escapeHtml(data.className||'CLASS')}</p><h1>${this.t('visit')}</h1><div class="visit-grid">${data.rooms.length?data.rooms.map((room:any)=>`<article class="visit-card"><div class="avatar-letter">${escapeHtml(room.ownerName).slice(0,1)}</div><div><h3>${escapeHtml(room.ownerName)}</h3><p>${room.activePet?escapeHtml(this.petName(this.state.catalog.pets.find((pet)=>pet.id===room.activePet.speciesId)!,room.activePet.stage)):this.locale==='zh-HK'?'尚未孵化':'No pet yet'}</p></div><button data-action="visit-room" data-id="${room.ownerStudentId}">${this.t('visitRoom')}</button></article>`).join(''):`<div class="empty-state">${this.locale==='zh-HK'?'暫時沒有同學開放房間。':'No classmates have opened their rooms yet.'}</div>`}</div></div>`;}
  private async visitRoom(studentId:string){const data=await api.room(studentId);this.visiting=data.room;this.setLayout('room');if(data.room.activePet)this.startBedroom(data.room,data.room.activePet);document.querySelector('#roomBar')!.innerHTML=`<div class="room-bar-identity visitor-panel"><p class="eyebrow">VISITING</p><h1>${escapeHtml(data.room.ownerName)}</h1><p>${this.locale==='zh-HK'?'只可觀看和送出每日一個表情；沒有留言或聊天。':'View the room and send one daily reaction. There are no messages or chat.'}</p><div class="reaction-row">${this.state.catalog.reactions.map((reaction,index)=>`<button data-action="reaction" data-owner="${studentId}" data-id="${reaction}"><span>${['♥','★','!','👏','✿','✦'][index]}</span><small>${data.room.reactions?.[reaction]||0}</small></button>`).join('')}</div><button class="secondary" data-action="back-home">${this.t('back')}</button></div>`;}
  private async react(owner:string,reaction:string){const result=await api.react(owner,reaction);audio.sfx('reaction');this.celebrate('reaction');document.querySelectorAll('[data-action="reaction"]').forEach((button)=>{const id=(button as HTMLElement).dataset.id!;button.querySelector('small')!.textContent=String(result.reactions[id]||0);});}
  /** Put a piece on. Anything already in that slot comes off, since a slot holds one thing. */
  private async equipWearable(wearableId:string){
    const pet=this.activePet()!; const definition=this.state.catalog.wearables.find((item)=>item.id===wearableId)!;
    const outfit=pet.equippedWearables.filter((id)=>this.state.catalog.wearables.find((item)=>item.id===id)?.slot!==definition.slot);
    if(!pet.equippedWearables.includes(wearableId))outfit.push(wearableId);
    await this.saveOutfit(pet.id,outfit);
  }
  /** Empty one slot. */
  private async clearSlot(slot:string){
    const pet=this.activePet()!;
    await this.saveOutfit(pet.id,pet.equippedWearables.filter((id)=>this.state.catalog.wearables.find((item)=>item.id===id)?.slot!==slot));
  }
  private async saveOutfit(petId:string,outfit:string[]){
    await api.setOutfit(petId,outfit); audio.sfx('happy');
    await this.reload(); this.startBedroom(); this.renderHomePanel(); this.renderOutfitPicker();
  }
  private renderSettings(){this.setLayout('full');const seg=(value:'private'|'class',label:string)=>`<button data-action="set-visibility" data-id="${value}" class="seg ${this.state.room.visibility===value?'on':''}">${escapeHtml(label)}</button>`;document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll settings-panel"><p class="eyebrow">COMFORT & ACCESS</p><h1>${this.t('settings')}</h1><div class="setting-row"><div><b>${this.locale==='zh-HK'?'房間參觀權限':'Room visits'}</b><small>${this.locale==='zh-HK'?'開放後，只有同班同學可以參觀你的房間。':'When opened, only classmates can visit your room.'}</small></div><div class="segmented-toggle">${seg('private',this.t('private'))}${seg('class',this.t('class'))}</div></div><label class="field"><span>${this.locale==='zh-HK'?'音樂音量':'Music volume'}</span><input type="range" min="0" max="1" step="0.05" value="${audio.musicLevel}" data-setting="music"></label><label class="field"><span>${this.locale==='zh-HK'?'音效音量':'Sound effects'}</span><input type="range" min="0" max="1" step="0.05" value="${audio.sfxLevel}" data-setting="sfx"></label><label class="toggle"><input type="checkbox" id="motionToggle" ${localStorage.getItem('pet-reduced-motion')==='1'?'checked':''}><span>${this.locale==='zh-HK'?'減少動畫':'Reduce motion'}</span></label><p class="privacy-note">${this.locale==='zh-HK'?'私隱：房間預設私人；公開後只有同班學生可參觀。系統沒有聊天、留言、交易或排行榜。':'Privacy: rooms are private by default. Only classmates can visit when opened. There is no chat, messaging, trading or leaderboard.'}</p></div>`;document.querySelector('#motionToggle')?.addEventListener('change',(event)=>{const on=(event.target as HTMLInputElement).checked;localStorage.setItem('pet-reduced-motion',on?'1':'0');document.documentElement.classList.toggle('reduced-motion',on);});}
  private async reload(){this.state=await api.bootstrap();this.roomPlacements=this.state.room.placements.map((item)=>({...item}));this.updateWallet();}
  private updateWallet(){this.setValue('#coinBalance',this.state.wallet.balance.toLocaleString());}
  private setValue(selector:string,value:string){const node=document.querySelector<HTMLElement>(selector);if(!node)return;if(node.textContent===value){node.textContent=value;return;}node.textContent=value;node.classList.remove('bump');void node.offsetWidth;node.classList.add('bump');window.setTimeout(()=>node.classList.remove('bump'),400);}
  private toast(message:string,error=false){
    if(error&&this.locale==='zh-HK')message=REFUSALS[message]||message;const element=document.createElement('div');element.className=`toast ${error?'error':''}`;element.setAttribute('role',error?'alert':'status');element.textContent=message;document.querySelector('#toasts')?.append(element);window.setTimeout(()=>{element.classList.add('leaving');window.setTimeout(()=>element.remove(),200);},3000);}
  private modal(content:string,variant=''){const root=document.querySelector('#modalRoot')!;root.innerHTML=`<div class="modal-backdrop"><div class="modal-card ${variant}">${content}</div></div>`;root.querySelector('[data-action="back-home"]')?.addEventListener('click',()=>{root.innerHTML='';this.openHome();});}
  private celebrate(type:string){const layer=document.querySelector('#celebrationLayer')!;layer.innerHTML=Array.from({length:type==='epic'?42:24},(_,index)=>`<i style="--x:${Math.random()*100}%;--d:${Math.random()*.9}s;--c:${index%5}"></i>`).join('');window.setTimeout(()=>layer.innerHTML='',2200);}
}

class TeacherApp {
  identity:Identity; locale:Locale; roster:any; selected=new Set<string>();scope:'students'|'class'='students';
  constructor(identity:Identity){this.identity=identity;this.locale=identity.language||'zh-HK';}
  t(key:keyof typeof UI['zh-HK']){return UI[this.locale][key]||UI['zh-HK'][key];}
  zh(){return this.locale==='zh-HK';}
  async start(){this.roster=await api.teacherRoster();this.render();}
  render(){
    const zh=this.zh();
    app.innerHTML=`<div class="teacher-shell">
      <header class="teacher-header">
        <a href="/" class="brand"><span class="brand-mark">B</span><span><b>${this.t('teacherTitle')}</b><small>${escapeHtml(this.identity.name)} · ${escapeHtml(this.roster.academicYear)}</small></span></a>
        <div class="teacher-summary"><span><b>${this.roster.students.length}</b><small>${zh?'名學生':'students'}</small></span><span><b>${this.roster.classes.length}</b><small>${zh?'個班別':'classes'}</small></span></div>
      </header>
      <main class="teacher-main">
        <section class="grant-panel" aria-labelledby="grantHeading">
          <div class="grant-head">
            <p class="eyebrow">TEACHER-ISSUED ONLY</p>
            <h1 id="grantHeading">${this.t('teacherTitle')}</h1>
            <p class="caution">${zh?'只有這裏能產生金幣，發放後不能撤回。確認前請核對「人數 × 每人金額 = 總額」。':'Coins exist only here and a grant cannot be undone. Check students × coins each = total before you confirm.'}</p>
          </div>
          <div class="segmented" role="group" aria-label="${zh?'發放對象':'Grant scope'}">
            <button type="button" data-scope="students" class="active" aria-pressed="true">${this.t('individual')}</button>
            <button type="button" data-scope="class" aria-pressed="false">${this.t('wholeClass')}</button>
          </div>
          <label class="field class-field" hidden><span>${zh?'班別':'Class'}</span><select id="classSelect">${this.roster.classes.map((name:string)=>`<option>${escapeHtml(name)}</option>`).join('')}</select></label>
          <label class="field"><span>${this.t('amount')}</span><input id="grantAmount" type="number" inputmode="numeric" min="1" max="10000" value="250"></label>
          <div class="preset-row">${[100,250,500,1000].map((value)=>`<button type="button" data-amount="${value}" class="${value===250?'active':''}">${value}</button>`).join('')}</div>
          <label class="field"><span>${this.t('note')}</span><input id="grantNote" maxlength="240" placeholder="${zh?'例如：課堂表現':'e.g. Great effort today'}"></label>
          <div class="grant-summary" id="grantSummary" aria-live="polite"><p><b id="grantSummaryLine">—</b><span id="grantSummaryHint"></span></p><strong id="grantSummaryTotal">—</strong></div>
          <button class="primary jumbo" id="previewGrant">${this.t('preview')}</button>
          <p class="grant-message" id="grantMessage" role="status"></p>
        </section>
        <section class="roster-panel" aria-labelledby="rosterHeading">
          <div class="roster-head">
            <div><p class="eyebrow">${escapeHtml(this.roster.academicYear)}</p><h2 id="rosterHeading">${zh?'學生錢包':'Student wallets'}</h2></div>
            <div class="roster-tools">
              <button type="button" class="text-button" id="selectAllStudents">${zh?'全選':'Select all'}</button>
              <button type="button" class="text-button" id="clearStudents">${zh?'清除':'Clear'}</button>
              <select id="rosterClassFilter" aria-label="${zh?'篩選班別':'Filter class'}"><option value="">${zh?'所有班別':'All classes'}</option>${this.roster.classes.map((name:string)=>`<option>${escapeHtml(name)}</option>`).join('')}</select>
            </div>
          </div>
          <div class="student-roster" id="studentRoster">${this.studentRows()}</div>
        </section>
      </main>
      <div class="modal-root" id="modalRoot"></div>
    </div>`;
    this.bind();this.updateSummary();
  }
  studentRows(filter=''){this.filter=filter;return this.roster.students.filter((student:any)=>!filter||student.className===filter).map((student:any)=>`<label class="student-wallet"><input type="checkbox" data-student="${student.studentId}" ${this.selected.has(student.studentId)?'checked':''}><span class="avatar-letter" aria-hidden="true">${escapeHtml(student.name).slice(0,1)}</span><span><b>${escapeHtml(student.name)}</b><small>${escapeHtml(student.className)} · ${student.classNo||'—'} · ${escapeHtml(student.studentId)}</small></span><strong>${Number(student.balance).toLocaleString()} 🪙</strong></label>`).join('');}
  filter='';
  amount(){return Number((document.querySelector('#grantAmount') as HTMLInputElement)?.value||0);}
  recipientCount(){
    if(this.scope==='class'){const name=(document.querySelector('#classSelect') as HTMLSelectElement)?.value||'';return this.roster.students.filter((student:any)=>student.className===name).length;}
    return this.selected.size;
  }
  updateSummary(){
    const zh=this.zh();const amount=this.amount();const count=this.recipientCount();
    const summary=document.querySelector('#grantSummary');const line=document.querySelector('#grantSummaryLine');
    const hint=document.querySelector('#grantSummaryHint');const total=document.querySelector('#grantSummaryTotal');
    const preview=document.querySelector<HTMLButtonElement>('#previewGrant');
    if(!summary||!line||!hint||!total||!preview)return;
    const validAmount=Number.isFinite(amount)&&amount>=1&&amount<=10000;
    const ok=validAmount&&count>0;
    summary.classList.toggle('blocked',!ok);
    if(!count){line.textContent=zh?'未選擇學生':'No students selected';hint.textContent=zh?(this.scope==='class'?'請選擇班別。':'請在右邊剔選學生。'):(this.scope==='class'?'Pick a class.':'Tick students on the right.');total.textContent=zh?'請先選擇':'Select first';}
    else if(!validAmount){line.textContent=zh?'金額必須在 1 至 10,000 之間':'Amount must be 1–10,000';hint.textContent='';total.textContent=zh?'金額無效':'Invalid';}
    else{line.textContent=zh?`${count} 名學生 × 每人 ${amount.toLocaleString()} 金幣`:`${count} students × ${amount.toLocaleString()} coins each`;hint.textContent=zh?'按「預覽發放」核對名單。':'Preview to check the name list.';total.textContent=`${(count*amount).toLocaleString()} 🪙`;}
    preview.disabled=!ok;
  }
  bind(){
    document.querySelectorAll<HTMLElement>('[data-scope]').forEach((button)=>button.addEventListener('click',()=>{this.scope=button.dataset.scope as any;document.querySelectorAll('[data-scope]').forEach((item)=>{const on=item===button;item.classList.toggle('active',on);item.setAttribute('aria-pressed',String(on));});(document.querySelector('.class-field') as HTMLElement).hidden=this.scope!=='class';this.updateSummary();}));
    document.querySelectorAll<HTMLElement>('[data-amount]').forEach((button)=>button.addEventListener('click',()=>{(document.querySelector('#grantAmount') as HTMLInputElement).value=button.dataset.amount!;document.querySelectorAll('[data-amount]').forEach((item)=>item.classList.toggle('active',item===button));this.updateSummary();}));
    document.querySelector('#grantAmount')?.addEventListener('input',()=>{const value=(document.querySelector('#grantAmount') as HTMLInputElement).value;document.querySelectorAll<HTMLElement>('[data-amount]').forEach((item)=>item.classList.toggle('active',item.dataset.amount===value));this.updateSummary();});
    document.querySelector('#classSelect')?.addEventListener('change',()=>this.updateSummary());
    document.querySelector('#studentRoster')?.addEventListener('change',(event)=>{const input=event.target as HTMLInputElement;if(input.dataset.student){if(input.checked)this.selected.add(input.dataset.student);else this.selected.delete(input.dataset.student);this.updateSummary();}});
    document.querySelector('#rosterClassFilter')?.addEventListener('change',(event)=>{document.querySelector('#studentRoster')!.innerHTML=this.studentRows((event.target as HTMLSelectElement).value);this.updateSummary();});
    document.querySelector('#selectAllStudents')?.addEventListener('click',()=>{this.roster.students.filter((student:any)=>!this.filter||student.className===this.filter).forEach((student:any)=>this.selected.add(student.studentId));document.querySelector('#studentRoster')!.innerHTML=this.studentRows(this.filter);this.updateSummary();});
    document.querySelector('#clearStudents')?.addEventListener('click',()=>{this.selected.clear();document.querySelector('#studentRoster')!.innerHTML=this.studentRows(this.filter);this.updateSummary();});
    document.querySelector('#previewGrant')?.addEventListener('click',()=>this.preview());
  }
  body(){return {scope:this.scope,studentIds:[...this.selected],className:(document.querySelector('#classSelect') as HTMLSelectElement)?.value||'',amount:this.amount(),note:(document.querySelector('#grantNote') as HTMLInputElement).value};}
  async preview(){
    const button=document.querySelector<HTMLButtonElement>('#previewGrant')!;button.disabled=true;
    const zh=this.zh();
    try{
      const body=this.body();const result=await api.grantPreview(body);
      const shown=result.recipients.slice(0,10).map((item:any)=>escapeHtml(item.name)).join(zh?'、':', ');
      const overflow=result.recipients.length>10?(zh?` 及其餘 ${result.recipients.length-10} 人`:` and ${result.recipients.length-10} more`):'';
      const heavy=result.total>=5000;
      document.querySelector('#modalRoot')!.innerHTML=`<div class="modal-backdrop"><div class="modal-card grant-confirm" role="dialog" aria-modal="true" aria-labelledby="grantConfirmTitle">
        <span class="big-coin" aria-hidden="true">🪙</span>
        <h2 id="grantConfirmTitle">${zh?'確認發放金幣':'Confirm coin grant'}</h2>
        <div class="equation">
          <span class="term"><b>${result.count}</b><small>${zh?'名學生':result.count===1?'student':'students'}</small></span>
          <span class="op" aria-hidden="true">×</span>
          <span class="term"><b>${result.amount.toLocaleString()}</b><small>${zh?'每人金幣':'coins each'}</small></span>
        </div>
        <div class="total"><small>${zh?'總共發放':'Total issued'}</small><strong>${result.total.toLocaleString()} 🪙</strong></div>
        <p class="recipients">${zh?'收取名單':'Recipients'}：${shown}${overflow}</p>
        ${heavy?`<p class="caution">${zh?`這是一次較大的發放，總共 ${result.total.toLocaleString()} 金幣。請再核對一次。`:`This is a large grant of ${result.total.toLocaleString()} coins. Please double-check.`}</p>`:''}
        <button class="primary" id="commitGrant">${this.t('confirm')} · ${result.total.toLocaleString()} 🪙</button>
        <button class="text-button" id="cancelGrant">${zh?'取消':'Cancel'}</button>
      </div></div>`;
      document.querySelector('#cancelGrant')?.addEventListener('click',()=>{document.querySelector('#modalRoot')!.innerHTML='';this.updateSummary();});
      document.querySelector('#commitGrant')?.addEventListener('click',()=>this.commit(body));
    }catch(error){const message=document.querySelector('#grantMessage') as HTMLElement;message.classList.add('error');message.textContent=(error as Error).message;}
    finally{this.updateSummary();}
  }
  async commit(body:any){
    const button=document.querySelector<HTMLButtonElement>('#commitGrant')!;button.disabled=true;
    try{
      const result=await api.grantCommit(body,idempotencyKey());audio.sfx('coin');
      document.querySelector('#modalRoot')!.innerHTML='';
      this.roster=await api.teacherRoster();this.selected.clear();
      document.querySelector('#studentRoster')!.innerHTML=this.studentRows(this.filter);
      const message=document.querySelector('#grantMessage') as HTMLElement;message.classList.remove('error');
      message.textContent=this.zh()?`已向 ${result.count} 名學生各發放 ${result.amount} 金幣，合共 ${(result.count*result.amount).toLocaleString()} 金幣。`:`Granted ${result.amount} coins to ${result.count} students — ${(result.count*result.amount).toLocaleString()} in total.`;
      this.updateSummary();
    }catch(error){button.disabled=false;button.textContent=(error as Error).message;}
  }
}

async function boot() {
  try {
    const identity = await api.identity();
    if (identity.role === 'teacher') await new TeacherApp(identity).start(); else await new StudentApp(identity).start();
  } catch (error) {
    app.innerHTML = `<main class="fatal-screen"><span>🥚</span><h1>寵物樂園暫時未能開啟</h1><p>${escapeHtml((error as Error).message)}</p><a href="/">返回平台首頁</a></main>`;
  }
}
boot();
