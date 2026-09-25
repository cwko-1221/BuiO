import Phaser from 'phaser';
import './styles/main.css';
import { api } from './api';
import { audio } from './audio';
import { BedroomScene } from './game/BedroomScene';
import type { CoinPusherScene } from './game/CoinPusherScene';
import { PetAvatar } from './game/PetAvatar';
import { advanceCoinPusherCascade, advanceCoinPusherTimingStreak, coinPusherCabinetFinish, coinPusherCascadeLabel, coinPusherImpactPan, coinPusherRewardFlightLabels, coinPusherStampProgress, coinPusherTimingGuidanceLabel, coinPusherTimingRecordLabel, coinPusherTimingStreakLabel, planCoinPusherRewardFlightDelays, COIN_PUSHER_STAMP_THRESHOLDS } from './game/CoinPusherFeedback';
import type { CoinPusherTimingStreakState } from './game/CoinPusherFeedback';
import type { CoinPusherDropBeat } from './game/CoinPusherModel';
import {
  loadCoinPusherSession as readCoinPusherSession,
  saveCoinPusherSession as writeCoinPusherSession,
} from './game/CoinPusherSessionStore';
import type {
  CoinPusherSession,
  StoredCoinPusherDrop,
  StoredCoinPusherPayout,
} from './game/CoinPusherSessionStore';
import { placeWearable } from './game/wearableLayout';
import type { Bootstrap, Identity, InventoryStack, Locale, PetDefinition, PetInstance, RoomPlacement, TeacherGrantNotification } from './types';
import { idempotencyKey } from './types';
import rapierWasmUrl from '@dimforge/rapier3d/rapier_wasm3d_bg.wasm?url';


// Native browser zoom and multi-touch behavior stays enabled throughout the application.
// Only the coin-pusher canvas scopes gestures with touch-action: none.

const app = document.querySelector<HTMLDivElement>('#app')!;
const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[character]!));
const icon = (name: string) => `<span class="icon icon-${name}" aria-hidden="true"></span>`;
const MYSTERY_PET_IDS = new Set([
  'nezuko-kamado', 'dragon-ball-goku', 'crayon-shin-chan',
  'doraemon', 'hello-kitty',
]);
const COIN_PUSHER_DROP_COST = 1;
type CoinPusherRewardOrigin = { x: number; y: number };
type CoinPusherLandingFeedback = CoinPusherRewardOrigin & { pusherBeat: CoinPusherDropBeat };
const COIN_PUSHER_STAMPS = [
  { threshold: COIN_PUSHER_STAMP_THRESHOLDS[0], tier: 'bronze', rank: 'I', name: { 'zh-HK': '小爪新手', 'en-US': 'First Paw' }, title: { 'zh-HK': '第一枚入槽', 'en-US': 'First Catch' } },
  { threshold: COIN_PUSHER_STAMP_THRESHOLDS[1], tier: 'silver', rank: 'II', name: { 'zh-HK': '銀仔高手', 'en-US': 'Coin Spotter' }, title: { 'zh-HK': '銀仔收藏家', 'en-US': 'Coin Collector' } },
  { threshold: COIN_PUSHER_STAMP_THRESHOLDS[2], tier: 'gold', rank: 'III', name: { 'zh-HK': '推板大師', 'en-US': 'Pusher Master' }, title: { 'zh-HK': '百枚入帳', 'en-US': 'Century Catch' } },
  { threshold: COIN_PUSHER_STAMP_THRESHOLDS[3], tier: 'crystal', rank: 'IV', name: { 'zh-HK': '水晶爪印', 'en-US': 'Crystal Paw' }, title: { 'zh-HK': '三百枚入帳', 'en-US': '300 Returned' } },
  { threshold: COIN_PUSHER_STAMP_THRESHOLDS[4], tier: 'aurora', rank: 'V', name: { 'zh-HK': '傳奇推手', 'en-US': 'Arcade Legend' }, title: { 'zh-HK': '千枚傳奇', 'en-US': '1,000 Returned' } },
];
const COIN_PUSHER_CABINET_FINISH_NAMES = [
  { 'zh-HK': '經典紫金', 'en-US': 'Classic Brass' },
  { 'zh-HK': '暖銅新飾', 'en-US': 'Warm Bronze' },
  { 'zh-HK': '冰晶銀白', 'en-US': 'Glacier Silver' },
  { 'zh-HK': '耀目金光', 'en-US': 'Radiant Gold' },
  { 'zh-HK': '藍晶光澤', 'en-US': 'Crystal Blue' },
  { 'zh-HK': '極光青綠', 'en-US': 'Aurora Teal' },
] as const;

// The reduced-motion preference is stored per device; apply it before first paint so no
// entrance animation ever runs for a child who has asked for stillness.
if (localStorage.getItem('pet-reduced-motion') === '1') document.documentElement.classList.add('reduced-motion');

const UI = {
  'zh-HK': {
    title:'寵物樂園', home:'我的房間', collection:'寵物圖鑑', shop:'魔法商店', coinPusher:'推銀仔', visit:'同班參觀', settings:'設定',
    coins:'金幣', dust:'星塵', feed:'餵食', play:'一起玩', sleep:'休息', decorate:'佈置房間', save:'儲存佈置', private:'私人房間', class:'開放同班參觀',
    hatchTitle:'你的第一顆蛋正在等待！', hatchCopy:'蛋內藏着三隻完成版寵物之一。首次孵化完全免費。', hatch:'開始孵化',
    owned:'已擁有', locked:'未擁有', active:'主寵', choose:'選為主寵', buy:'購買', visitRoom:'參觀房間', back:'返回房間',
    teacherTitle:'老師金幣中心', individual:'個別學生', wholeClass:'全班', preview:'預覽發放', confirm:'確認發放', amount:'每人金額', note:'派發原因（選填）',
    empty:'暫時沒有內容。', daily:'今日經驗', probability:'目前開放 12 隻完成版寵物', pity:'保底', randomEgg:'隨機寵物蛋', directPet:'指定寵物',
  },
  'en-US': {
    title:'Pet Paradise', home:'My Room', collection:'Pet Collection', shop:'Magic Shop', coinPusher:'Coin Pusher', visit:'Class Visits', settings:'Settings',
    coins:'Coins', dust:'Stardust', feed:'Feed', play:'Play', sleep:'Rest', decorate:'Decorate', save:'Save room', private:'Private room', class:'Open to class',
    hatchTitle:'Your first egg is waiting!', hatchCopy:'One of the three completed pets is inside. Your first hatch is free.', hatch:'Hatch now',
    owned:'Owned', locked:'Not owned', active:'Active', choose:'Make active', buy:'Buy', visitRoom:'Visit room', back:'Back to room',
    teacherTitle:'Teacher Coin Centre', individual:'Students', wholeClass:'Whole class', preview:'Preview grant', confirm:'Confirm grant', amount:'Coins per student', note:'Reason (optional)',
    empty:'Nothing here yet.', daily:'Daily XP', probability:'12 completed pets currently available', pity:'Pity', randomEgg:'Random pet egg', directPet:'Choose a pet',
  },
} as const;

/**
 * The equipment board, in the order a player expects to read it down a character sheet.
 *
 * Four of these have no artwork behind them yet — the collection covers head, face, neck, back
 * and aura only. They are still laid out, and marked as not yet open, because a board with holes
 * punched in it reads as a board that is coming rather than one that is broken.
 */
/** Mirrors lib/catalog.js WEARABLE_PET_IDS; used only when the server omits the list. */
const WEARABLE_PET_IDS = ['starpatch-cat', 'cloud-ear-dog', 'pudding-pig', 'crescent-rabbit', 'spark-hamster', 'mossback-turtle', 'leaftail-fox', 'thunderhorn-goat', 'bubble-otter', 'snowfeather-penguin', 'coral-seal', 'golden-retriever-dog'];
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
  pendingGrantIds: string[] = [];
  coinPusherView?: CoinPusherScene;
  private coinPusherModel?: CoinPusherScene['model'];
  private coinPusherInitPending = false;
  private coinPusherGeneration = 0;
  private coinPusherBusy = false;
  private coinPusherReady = false;
  private coinPusherWebglLost = false;
  private coinPusherInitFailed = false;
  private coinPusherPaymentInFlight = false;
  private coinPusherStatusRevision = 0;
  private coinPusherKeyboardLaneX = 0;
  private coinPusherSceneModule?: Promise<typeof import('./game/CoinPusherScene')>;
  private coinPusherModelModule?: Promise<typeof import('./game/CoinPusherModel')>;
  private coinPusherWasmPreload?: HTMLLinkElement;
  private coinPusherPreloadTimer?: number;
  private coinPusherCascade = { count: 0, lastAt: 0 };
  private coinPusherCascadeCue?: HTMLSpanElement;
  private coinPusherCascadeTimer?: number;
  private coinPusherTimingStreak: CoinPusherTimingStreakState = { count: 0, best: 0 };
  private coinPusherCooldown?: number;
  private coinPusherReturnFocus?: HTMLElement;
  private coinPusherPayoutSequence = 0;
  private coinPusherPayoutQueue: Promise<void> = Promise.resolve();
  private coinPusherPayoutsQueued = new Set<string>();
  private coinPusherPayoutRetryTimer?: number;
  private coinPusherTrayCatchUntil = 0;
  private coinPusherTrayCatchCue?: HTMLSpanElement;
  private coinPusherTrayCatchTimer?: number;
  private coinPusherTrayCatchCount = 0;
  private coinPusherTrayCatchOriginX = 0;
  private coinPusherTrayCatchOriginY = 0;
  private coinPusherTrayCatchOriginCount = 0;
  private coinPusherRewardVisualNextAt = 0;
  private coinPusherPlays: { playId: string; remaining: number; reserved: number; generation: number }[] = [];
  private coinPusherPendingDrop?: StoredCoinPusherDrop;
  private coinPusherPendingPayouts: StoredCoinPusherPayout[] = [];
  private coinPusherAutosaveTimer?: number;
  private coinPusherSession?: CoinPusherSession;
  private coinPusherSessionLoading?: Promise<CoinPusherSession | undefined>;
  private coinPusherSessionSaveQueue: Promise<void> = Promise.resolve();
  private coinPusherPersistenceFailed = false;
  private coinPusherSessionRestored = false;
  visiting?: any;
  surfaceObserver?: ResizeObserver;
  constructor(identity: Identity) { this.identity = identity; this.locale = identity.language || 'zh-HK'; }
  t(key: keyof typeof UI['zh-HK']) { return UI[this.locale][key] || UI['zh-HK'][key]; }
  name(localized: Record<Locale,string>) { return localized[this.locale] || localized['zh-HK']; }
  petName(definition: PetDefinition, stage: number) { return definition.names[this.locale]?.[stage - 1] || definition.names['zh-HK'][stage - 1]; }
  inventory(itemId: string) { return this.state.inventory.find((item) => item.itemId === itemId)?.quantity || 0; }
  activePet() { return this.state.pets.find((pet) => pet.id === this.state.profile.activePetId) || this.state.pets[0]; }
  definition(pet?: PetInstance) { return this.state.catalog.pets.find((definition) => definition.id === pet?.speciesId); }
  /**
   * Accessories are redraws of one specific animal, so a species can only be dressed once its own
   * sheets exist. The rest keep the outfit UI hidden rather than offering items that have no
   * artwork for them.
   */
  private canDress(pet?: PetInstance) {
    // A server older than this build sends no list. Fall back to the same default the catalogue
    // ships rather than sealing the wardrobe for every pet, which is the worse failure.
    const open=this.state.catalog.wearablePetIds?.length?this.state.catalog.wearablePetIds:WEARABLE_PET_IDS;
    return !!pet && open.includes(pet.speciesId);
  }

  async start() {
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (viewport && !viewport.content.includes('viewport-fit=cover')) {
      viewport.content = `${viewport.content}, viewport-fit=cover`;
    }
    this.state = await api.bootstrap();
    document.addEventListener('visibilitychange', this.handleCoinPusherVisibility);
    window.addEventListener('pagehide', this.handleCoinPusherPageHide);
    window.addEventListener('online', this.retryPendingCoinPusherPayouts);
    const grantNotifications = api.grantNotifications().catch((error) => {
      console.warn('[pet] Could not load grant notifications', error); return { success: true as const, grants: [] as TeacherGrantNotification[] };
    });
    this.roomPlacements = this.state.room.placements.map((item) => ({...item})); this.renderShell();
    if (!this.state.profile.starterEggClaimed) this.renderHatch(); else {
      this.openHome();
      // A failed WASM/module evaluation is cached by the browser. An explicit retry therefore
      // reloads the app once, preserving the student's session and returning directly to the
      // arcade instead of repeating the same failed module evaluation in-place.
      if (sessionStorage.getItem('pet-coin-pusher-retry') === '1') {
        sessionStorage.removeItem('pet-coin-pusher-retry');
        this.openTab('coinPusher');
      }
    }
    const { grants } = await grantNotifications;
    if (grants.length) this.renderGrantNotifications(grants);
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
          <section class="play-surface" id="playSurface"><div id="game-root"></div><div id="coin-pusher-root"></div><div id="gameHud" class="game-hud"></div><div id="celebrationLayer" class="celebration-layer" aria-hidden="true"></div></section>
        </section>
        <aside class="side-panel" id="sidePanel"></aside>
      </main>
      <nav class="pet-nav" aria-label="Pet Paradise">
        ${[['home','home'],['collection','collection'],['shop','shop'],['coinPusher','coin-pusher'],['visit','visit'],['settings','settings']].map(([tab,glyph])=>`<button data-tab="${tab}" class="${tab===this.tab?'active':''}" aria-current="${tab===this.tab?'page':'false'}">${icon(glyph)}<span>${this.t(tab as keyof typeof UI['zh-HK'])}</span></button>`).join('')}
      </nav>
      <div class="toast-stack" id="toasts" aria-live="polite"></div>
      <div class="modal-root" id="modalRoot"></div>
    </div>`;
    app.addEventListener('click', this.handleClick);
    app.addEventListener('keydown', this.handleKeydown);
    document.addEventListener('pointerdown',this.handlePointerDown);
    document.addEventListener('pointermove',this.handlePointerMove);
    document.addEventListener('pointerup',this.handlePointerUp);
    document.addEventListener('pointercancel',this.handlePointerUp); app.addEventListener('change', this.handleChange); app.addEventListener('input', this.handleInput);
    const coinPusherTab=app.querySelector<HTMLButtonElement>('[data-tab="coinPusher"]');
    coinPusherTab?.addEventListener('pointerenter',this.scheduleCoinPusherPreload);
    coinPusherTab?.addEventListener('pointerdown',this.primeCoinPusherOnPress);
    coinPusherTab?.addEventListener('pointerleave',this.cancelCoinPusherPreload);
    coinPusherTab?.addEventListener('focus',this.scheduleCoinPusherPreload);
    coinPusherTab?.addEventListener('blur',this.cancelCoinPusherPreload);
  }
  private loadCoinPusherSceneModule() {
    return this.coinPusherSceneModule ??= import('./game/CoinPusherScene');
  }
  private loadCoinPusherModelModule() {
    return this.coinPusherModelModule ??= import('./game/CoinPusherModel');
  }
  private loadCoinPusherStoredSession() {
    return this.coinPusherSessionLoading ??= readCoinPusherSession(this.identity.id).then((session) => {
      this.coinPusherSession = session;
      return session;
    });
  }
  private handleCoinPusherVisibility = () => {
    if (document.visibilityState === 'hidden') void this.persistCoinPusherSession();
    else void this.persistCoinPusherSession().then((saved)=>{if(saved)this.retryPendingCoinPusherPayouts();});
  };
  private handleCoinPusherPageHide = () => { void this.persistCoinPusherSession(); };
  private async persistCoinPusherSession(): Promise<boolean> {
    const model = this.coinPusherView?.model ?? this.coinPusherModel;
    if (!model) return true;
    const task = this.coinPusherSessionSaveQueue.catch(() => undefined).then(async () => {
      const session: CoinPusherSession = {
        version: 1,
        studentId: this.identity.id,
        updatedAt: Date.now(),
        model: model.createSnapshot(),
        plays: this.coinPusherPlays.map(({ playId, remaining }) => ({ playId, remaining })),
        payoutSequence: this.coinPusherPayoutSequence,
        pendingPayouts: this.coinPusherPendingPayouts.map((payout) => ({ ...payout })),
        bestTimingStreak: this.coinPusherTimingStreak.best,
        ...(this.coinPusherPendingDrop ? { pendingDrop: { ...this.coinPusherPendingDrop,
          ...(this.coinPusherPendingDrop.result ? { result: { ...this.coinPusherPendingDrop.result } } : {}) } } : {}),
      };
      await writeCoinPusherSession(session);
      this.coinPusherSession = session;
      this.coinPusherPersistenceFailed = false;
      this.syncCoinPusherControls();
    });
    this.coinPusherSessionSaveQueue = task;
    try {
      await task;
      return true;
    } catch (error) {
      this.coinPusherPersistenceFailed = true;
      console.warn('[pet] Could not persist coin-pusher session', error);
      this.syncCoinPusherControls();
      return false;
    }
  }
  private startCoinPusherAutosave(generation: number) {
    if (this.coinPusherAutosaveTimer !== undefined) window.clearInterval(this.coinPusherAutosaveTimer);
    this.coinPusherAutosaveTimer = window.setInterval(() => {
      if (generation === this.coinPusherGeneration) {
        void this.persistCoinPusherSession().then((saved)=>{
          if(!saved)return;
          this.retryPendingCoinPusherPayouts();
          if(this.tab==='coinPusher'&&!this.coinPusherBusy&&this.coinPusherPendingDrop&&!this.coinPusherPendingDrop.applied){
            void this.dropCoinPusher(this.coinPusherPendingDrop.worldX,true);
          }
        });
      }
    }, 5000);
  }
  private startCoinPusherPreload() {
    if(this.coinPusherSceneModule||document.visibilityState==='hidden')return;
    // Rapier's glue module is only about 40KB; its 700KB+ compressed WASM normally starts after
    // that module downloads. A user-intent-only fetch link lets the browser overlap both requests.
    if(!this.coinPusherWasmPreload){
      const preload=document.createElement('link');
      preload.rel='preload';
      preload.as='fetch';
      preload.type='application/wasm';
      preload.crossOrigin='anonymous';
      preload.href=rapierWasmUrl;
      preload.addEventListener('error',()=>{
        if(this.coinPusherWasmPreload!==preload)return;
        preload.remove();
        this.coinPusherWasmPreload=undefined;
      },{once:true});
      this.coinPusherWasmPreload=preload;
      document.head.append(preload);
    }
    void Promise.all([this.loadCoinPusherSceneModule(),this.loadCoinPusherModelModule()]).catch(()=>{
      this.coinPusherSceneModule=undefined;
      this.coinPusherModelModule=undefined;
      this.coinPusherWasmPreload?.remove();
      this.coinPusherWasmPreload=undefined;
    });
  }
  private scheduleCoinPusherPreload = () => {
    if(this.coinPusherPreloadTimer!==undefined||this.coinPusherSceneModule||document.visibilityState==='hidden')return;
    // A brief hover/focus pause signals real intent; moving across the nav does not download
    // the renderer and physics WASM for a feature the student never opens.
    this.coinPusherPreloadTimer=window.setTimeout(()=>{
      this.coinPusherPreloadTimer=undefined;
      this.startCoinPusherPreload();
    },260);
  };
  private primeCoinPusherOnPress = (event:PointerEvent) => {
    if(event.button!==0||event.isPrimary===false)return;
    this.cancelCoinPusherPreload();
    this.startCoinPusherPreload();
  };
  private cancelCoinPusherPreload = () => {
    if(this.coinPusherPreloadTimer===undefined)return;
    window.clearTimeout(this.coinPusherPreloadTimer);
    this.coinPusherPreloadTimer=undefined;
  };
  private handleClick = async (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-tab]'); if (!button) return;
    this.acknowledge(button); // visible response inside 100ms, before any await
    try {
      await audio.unlock(); audio.sfx('tap');
      if (button.dataset.tab) {
        if (this.tab==='coinPusher' && (this.coinPusherPaymentInFlight||this.coinPusherBusy)) {
          this.setCoinPusherStatus(this.coinPusherExitWaitMessage());
          return;
        }
        return this.openTab(button.dataset.tab);
      }
      const action = button.dataset.action!;
      if (action === 'coin-pusher-exit' && this.coinPusherBusy) { this.setCoinPusherStatus(this.coinPusherExitWaitMessage()); return; }
      if (action === 'audio') { audio.setEnabled(!audio.enabled); button.innerHTML = icon(audio.enabled?'sound':'mute'); button.setAttribute('aria-pressed',String(audio.enabled)); return; }
      if (action === 'coin-pusher-exit') {
        if (this.coinPusherPaymentInFlight) { this.toast(this.locale==='zh-HK'?'正在確認落幣，請稍候。':'Confirming your coin drop. Please wait.'); return; }
        return this.openHome();
      }
      if (action === 'coin-pusher-drop') return this.dropCoinPusher(0);
      if (action === 'coin-pusher-collection') return this.openCoinPusherCollection();
      if (action === 'coin-pusher-init-retry') return this.retryCoinPusherInitialization();
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
      if (action === 'ack-grants') return await this.acknowledgeGrantNotifications(button as HTMLButtonElement);
      if (action === 'close-modal') { document.querySelector('#modalRoot')!.innerHTML=''; if(this.tab==='coinPusher'){const collectionButton=document.querySelector<HTMLButtonElement>('.coin-pusher-collection');collectionButton?.setAttribute('aria-expanded','false');collectionButton?.focus({preventScroll:true});} return; }
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
  private handleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && document.querySelector('#modalRoot .coin-pusher-collection-panel')) {
      event.preventDefault();
      document.querySelector('#modalRoot')!.innerHTML = '';
      const collectionButton = document.querySelector<HTMLButtonElement>('.coin-pusher-collection');
      collectionButton?.setAttribute('aria-expanded', 'false');
      collectionButton?.focus({ preventScroll: true });
      return;
    }
    if (this.tab !== 'coinPusher') return;
    if (event.key === 'Escape') {
      event.preventDefault();
      if (this.coinPusherPaymentInFlight || this.coinPusherBusy) {
        this.setCoinPusherStatus(this.coinPusherExitWaitMessage());
        return;
      }
      this.openHome();
      return;
    }
    if (event.target !== this.coinPusherView?.renderer.domElement) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const direction = event.key === 'ArrowLeft' ? -1 : 1;
      this.coinPusherKeyboardLaneX = Math.max(-2.32, Math.min(2.32,
        Number((this.coinPusherKeyboardLaneX + direction * .58).toFixed(2))));
      this.coinPusherView?.aimAtWorldX(this.coinPusherKeyboardLaneX);
      return;
    }
    // Keyboard alternative for players who cannot perform a touch swipe; the visible Drop
    // button provides the same centre drop without requiring this canvas focus. Arrow keys
    // select a lane first, so keyboard play has the same control over placement as a swipe.
    if (!event.repeat && (event.key === 'ArrowDown' || event.key === ' ' || event.key === 'Enter')) {
      event.preventDefault();
      this.dropCoinPusher(this.coinPusherKeyboardLaneX);
    }
  };
  private handleChange = (event: Event) => { const target=event.target as HTMLInputElement|HTMLSelectElement;if(target.id==='roomVisibility')this.state.room.visibility=target.value as 'private'|'class';if(target.id==='roomTheme')this.state.room.themeId=target.value; };
  private handleInput = (event: Event) => { const target=event.target as HTMLInputElement;if(target.dataset.setting==='music'){audio.setLevels(Number(target.value),audio.sfxLevel);}if(target.dataset.setting==='sfx'){audio.setLevels(audio.musicLevel,Number(target.value));} };
  private acknowledge(element: HTMLElement) {
    element.classList.remove('is-pressed'); void element.offsetWidth; element.classList.add('is-pressed');
    window.setTimeout(()=>element.classList.remove('is-pressed'),200);
  }
  private openTab(tab: string) {
    if(tab!=='coinPusher')this.cancelCoinPusherPreload();
    this.tab=tab;document.querySelectorAll('[data-tab]').forEach((item)=>{const on=(item as HTMLElement).dataset.tab===tab;item.classList.toggle('active',on);item.setAttribute('aria-current',on?'page':'false');});
    if(tab==='home')this.openHome();else if(tab==='collection')this.renderCollection();else if(tab==='shop')this.renderShop('eggs');else if(tab==='coinPusher')this.renderCoinPusher();else if(tab==='visit')this.renderVisits();else this.renderSettings();
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
    this.destroyCoinPusher(true);
    this.ensureGame(); const pet=petOverride||this.activePet();if(!pet)return;const definition=this.definition(pet)!;
    document.querySelector<HTMLElement>('#game-root')!.style.display='block';
    document.querySelector<HTMLElement>('#coin-pusher-root')!.style.display='none';
    const originalRoom=this.state.room;if(roomOverride)this.state.room={themeId:roomOverride.themeId,visibility:roomOverride.visibility,placements:roomOverride.placements};
    // Contain leaves bars above and below the room on a wide surface. Paint what is behind the
    // canvas with the room's own wall colour so they read as the room carrying on rather than as
    // the picture stopping.
    const theme=this.state.catalog.rooms.find((entry)=>entry.id===this.state.room.themeId);
    const surface=document.querySelector('#playSurface') as HTMLElement|null;
    if(surface&&theme){
      surface.style.backgroundColor=theme.primary;
      surface.style.backgroundImage=`url('${theme.backdrop}')`;
      surface.style.backgroundSize='cover';
      surface.style.backgroundPosition='center';
      surface.style.backgroundRepeat='no-repeat';
    }
    this.game!.scene.stop('Bedroom');this.game!.scene.start('Bedroom',{bootstrap:this.state,activePet:pet,petDefinition:definition});
    // The canvas is sized from its container. If anything started the scene while the stage
    // was still hidden the canvas would be zero-sized, so re-measure once it is on screen.
    this.refreshStage();
    if(roomOverride)this.state.room=originalRoom;audio.setTheme('bedroom');
  }
  private openHome() {
    if(!this.state.profile.starterEggClaimed&&!this.state.pets.length){this.tab='home';this.destroyCoinPusher();this.renderHatch();return;}
    this.visiting=undefined;this.tab='home';
    this.game?.events.emit('room:set-editing',false);
    document.querySelector('#petMain')?.removeAttribute('data-mode');
    // Reveal the stage BEFORE booting the scene. Coming back from a browsing tab the layout
    // is still "full", which hides .room-stage entirely; a scene started into a display:none
    // container gets a zero-sized canvas and renders nothing until something forces a resize,
    // which is why the room came up blank until the tab was tapped a second time.
    this.setLayout('room');
    this.startBedroom();this.renderHomePanel();document.querySelector('#gameHud')!.innerHTML='';
    const returnFocus=this.coinPusherReturnFocus;
    this.coinPusherReturnFocus=undefined;
    if(returnFocus?.isConnected) requestAnimationFrame(()=>returnFocus.focus({preventScroll:true}));
  }
  private renderHatch() {
    // Before the first hatch there is no Phaser scene, so the play surface would otherwise be a
    // dead rectangle on the very first screen a child sees. Dress it with a CSS hero instead.
    document.querySelector('#game-root')!.innerHTML=`<div class="stage-poster"><div class="poster-egg"><span></span></div><div class="poster-sparks" aria-hidden="true">${Array.from({length:10},(_,index)=>`<i style="--i:${index}"></i>`).join('')}</div></div>`;
    document.querySelector<HTMLElement>('#game-root')!.style.display='block';
    document.querySelector<HTMLElement>('#coin-pusher-root')!.style.display='none';
    // The poster lives in the play surface, so the copy sits in the bar above it — the side
    // panel is not rendered in room layout.
    this.setLayout('room');
    document.querySelector('#roomBar')!.innerHTML=`<div class="room-bar-identity hatch-bar"><div class="hatch-copy"><p class="eyebrow">FIRST FRIEND</p><h1>${this.t('hatchTitle')}</h1><p class="muted">${this.t('hatchCopy')}</p></div><div class="odds">${this.t('probability')}</div><button class="primary jumbo" data-action="hatch">${this.t('hatch')}</button></div>`;
  }
  private async hatch(button: HTMLButtonElement) {
    button.disabled=true;button.classList.add('loading');const result=await api.hatch(idempotencyKey());audio.sfx('hatch');this.celebrate(result.rarity==='epic'?'epic':'hatch');await this.reload();this.startBedroom();this.renderReveal(result.speciesId,result.rarity,result.duplicateCoins);
  }
  private renderReveal(speciesId:string,rarity:string,refund:number){const definition=this.state.catalog.pets.find((pet)=>pet.id===speciesId)!;const pet=this.state.pets.find((pet)=>pet.speciesId===speciesId);const stage=pet?.stage||1;this.modal(`<div class="reveal-card ${rarity}"><p class="eyebrow">${rarity.toUpperCase()}</p><img src="${definition.art[stage-1]}" alt=""><h2>${escapeHtml(this.petName(definition,stage))}</h2><p>${refund?`重複品種，退回 ${refund} 金幣`:`天賦：${escapeHtml(this.name(definition.talent))}`}</p><button class="primary" data-action="back-home">${this.t('back')}</button></div>`);}
  private renderGrantNotifications(grants: TeacherGrantNotification[]) {
    const zh=this.locale==='zh-HK';this.pendingGrantIds=grants.map((grant)=>grant.transactionId);
    const total=grants.reduce((sum,grant)=>sum+grant.amount,0);
    const rows=grants.map((grant)=>`<article class="grant-receipt">
      <div class="grant-receipt-head"><span aria-hidden="true">🪙</span><div><b>${escapeHtml(grant.teacherName)}</b><small>${zh?'發給你':'sent you'}</small></div><strong>+${grant.amount.toLocaleString()}</strong></div>
      <p><span>${zh?'原因':'Reason'}</span>${escapeHtml(grant.reason || (zh?'未有填寫原因':'No reason provided'))}</p>
    </article>`).join('');
    this.modal(`<div class="grant-notice" role="dialog" aria-modal="true" aria-labelledby="grantNoticeTitle"><span class="grant-notice-coin" aria-hidden="true">🪙</span><p class="eyebrow">${zh?'老師獎勵':'TEACHER REWARD'}</p><h2 id="grantNoticeTitle">${zh?'收到金幣！':'Coins received!'}</h2>${grants.length>1?`<p class="grant-total">${zh?`共 ${grants.length} 筆，合計`:`${grants.length} grants totalling`} <b>${total.toLocaleString()} 🪙</b></p>`:''}<div class="grant-receipt-list">${rows}</div><button class="primary" data-action="ack-grants">${zh?'知道了':'Got it'}</button></div>`,`grant-notice-modal`);
  }
  private async acknowledgeGrantNotifications(button: HTMLButtonElement) {
    button.disabled=true;button.classList.add('loading');
    try {
      await api.acknowledgeGrantNotifications(this.pendingGrantIds);
      this.pendingGrantIds=[];document.querySelector('#modalRoot')!.innerHTML='';
    } catch (error) {
      button.disabled=false;button.classList.remove('loading');throw error;
    }
  }
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
    document.querySelector('#petMain')?.removeAttribute('data-mode');
    document.querySelector('.pet-shell')?.removeAttribute('data-screen');
    if (mode === 'room') {
      document.querySelector('#sidePanel')!.innerHTML = '';
    } else {
      document.querySelector('#roomBar')!.innerHTML = '';
      document.querySelector('#petStatus')!.innerHTML = ''; // no pet context off the room tab
      // Nothing is visible, so stop rendering it: a hidden Phaser scene running at 60fps is
      // pure battery cost on a tablet.
      this.game?.scene.stop('Bedroom');
      this.destroyCoinPusher(true);
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
      // The button stays for every pet; species without finished wearable art get the
      // "not open yet" notice inside the picker rather than a missing action.
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
    const layout=this.state.catalog.animationByPet?.[definition.id] ?? this.state.catalog.animation;
    const fullOutfit=PetAvatar.fullOutfitUrl(definition,pet.stage,pet.equippedWearables,this.state.catalog.outfitAtlases);
    const atlas=fullOutfit||definition.atlas?.[pet.stage-1];
    const anchors=definition.anchors?.[pet.stage-1];
    if(!layout||!atlas||!anchors) {
      return `<img src="${definition.art[pet.stage-1]}" alt="" draggable="false">`;
    }
    const registered=pet.equippedWearables.flatMap((id)=>{
      const entry=this.state.catalog.redrawnWearables[`${definition.id}:${pet.stage}:${id}`];
      return entry?[{id,entry}]:[];
    });
    const hiddenSlots=new Set(registered.flatMap(({entry})=>entry.occludes||[]));
    // The equipped array is an API payload, not a layer order. Match the Phaser compositor's
    // canonical rear -> body -> patch -> front ordering so the preview cannot disagree with the
    // room when a child equips the same pieces in a different sequence.
    const redraws=registered
      .filter(({entry})=>!hiddenSlots.has(entry.slot))
      .sort((a,b)=>PetAvatar.redrawnSlotOrder(a.entry.slot)-PetAvatar.redrawnSlotOrder(b.entry.slot)||a.id.localeCompare(b.id));
    // A complete outfit already contains every physical item. A modular redraw replaces only its
    // registered piece; unfinished slots and auras continue through the established placement.
    const legacyIds=fullOutfit
      ? PetAvatar.legacyWearableIds(
        definition,pet.stage,pet.equippedWearables.filter((id)=>id.startsWith('aura-')),
        this.state.catalog.wearables,this.state.catalog.redrawnWearables,
      )
      : PetAvatar.legacyWearableIds(
        definition,pet.stage,pet.equippedWearables,this.state.catalog.wearables,
        this.state.catalog.redrawnWearables,
      );
    const pieces=legacyIds.map((id)=>{
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
    // The room uses canvas destination-out for erase/frontErase. Reusing that operation here is
    // important: CSS layers can show a hat correctly in isolation but cannot remove the base ear
    // or face pixels that the complete redraw intentionally replaces.
    const modularRedraws=fullOutfit
      ? redraws.filter(({id})=>id.startsWith('aura-'))
      : redraws;
    const layerData=modularRedraws.map(({entry}) => ({
      // Keep the slot in the diagnostic payload as well as the URLs. It makes a preview's layer
      // order inspectable in browser QA without changing the compositor's pixel inputs.
      slot: entry.slot,
      rear: entry.rear || '', erase: entry.erase || '', patch: entry.patch || '',
      frontErase: entry.frontErase || '', front: entry.front || '',
    }));
    const encodedBase=escapeHtml(encodeURIComponent(atlas));
    const encodedLayers=escapeHtml(encodeURIComponent(JSON.stringify(layerData)));
    const canvas=`<canvas class="figure-preview-canvas" width="${layout.frameWidth}" height="${layout.frameHeight}"
      data-base="${encodedBase}" data-layers="${encodedLayers}" aria-label=""></canvas>`;
    return `<div class="figure-stack">${behind}${canvas}${front}</div>`;
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
    if(!this.canDress(pet)) return this.picker(zh?'裝備':'Equipment',
      `<div class="empty-state">${zh?'呢隻寵物嘅飾物系統暫未開放。<br>暫時只有星斑幼貓、雲耳幼犬同布丁小豬可以換裝。':'The outfit system is not open for this pet yet.<br>Only the Starpatch Kitten, the Cloud-ear Puppy and the Pudding Piglet can dress up for now.'}</div>`);
    const definition=this.state.catalog.pets.find((item)=>item.id===pet.speciesId)!;
    const byId=(id:string)=>this.state.catalog.wearables.find((item)=>item.id===id);
    const equipped=new Map(pet.equippedWearables.map((id)=>[byId(id)?.slot||'',id]));
    // A species is dressed in redraws of itself, and not every item has been redrawn for every
    // one of them — three of the dog's neck pieces are white on its white chest and could not be
    // lifted off it. Offering those would let a child put on something that then does not appear.
    // Auras are not redraws at all, so they are always on offer.
    const drawnForThisPet=new Set(Object.keys(this.state.catalog.redrawnWearables)
      .filter((key)=>key.startsWith(`${pet.speciesId}:`)).map((key)=>key.split(':')[2]));
    const owned=this.state.catalog.wearables.filter((item)=>this.inventory(item.id)>0
      && (item.slot==='aura' || drawnForThisPet.has(item.id)));
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
    this.hydratePreviewCanvases();
  }
  /** Draw the one preview cell with the same rear/base/erase/patch/frontErase/front order as Phaser. */
  private hydratePreviewCanvases() {
    document.querySelectorAll<HTMLCanvasElement>('.figure-preview-canvas').forEach((canvas) => {
      const base=canvas.dataset.base ? decodeURIComponent(canvas.dataset.base) : '';
      let layers:{slot?:string;rear:string;erase:string;patch:string;frontErase:string;front:string}[]=[];
      try { layers=canvas.dataset.layers ? JSON.parse(decodeURIComponent(canvas.dataset.layers)) : []; } catch { layers=[]; }
      const ctx=canvas.getContext('2d'); if(!ctx||!base)return;
      const load=(url:string)=>new Promise<HTMLImageElement>((resolve,reject)=>{
        const image=new Image(); image.onload=()=>resolve(image); image.onerror=reject; image.src=url;
      });
      const loadLayer=(url:string)=>url?load(url):Promise.resolve(null);
      Promise.all([
        load(base),
        ...layers.flatMap((entry)=>[entry.rear,entry.erase,entry.patch,entry.frontErase,entry.front]).map(loadLayer),
      ]).then((images) => {
        const [baseImage,...rest]=images;
        const sourceWidth=Number(canvas.width)||160; const sourceHeight=Number(canvas.height)||160;
        const draw=(image:HTMLImageElement|null, mode:GlobalCompositeOperation='source-over')=>{
          if(!image)return;
          ctx.globalCompositeOperation=mode;
          ctx.drawImage(image,0,0,sourceWidth,sourceHeight,0,0,canvas.width,canvas.height);
        };
        ctx.clearRect(0,0,canvas.width,canvas.height);
        const drawPass=(offset:number,mode:GlobalCompositeOperation='source-over')=>{
          for(let layerIndex=0;layerIndex<layers.length;layerIndex+=1){
            draw(rest[layerIndex*5+offset] as HTMLImageElement|null,mode);
          }
        };
        drawPass(0);
        draw(baseImage as HTMLImageElement);
        drawPass(1,'destination-out');
        drawPass(2);
        drawPass(3,'destination-out');
        drawPass(4);
        ctx.globalCompositeOperation='source-over'; canvas.dataset.ready='true';
      }).catch(()=>{ canvas.dataset.ready='error'; });
    });
  }
  private async feed(foodId:string){const pet=this.activePet()!;const result=await api.feed(pet.id,foodId,idempotencyKey());audio.sfx('feed');this.game?.events.emit('pet:emote',result.evolved?'evolve':'eat');if(result.evolved){audio.sfx('evolve');this.celebrate('evolve');}await this.reload();this.startBedroom();this.renderHomePanel();this.renderFeedPicker();}
  private async activate(petId:string){await api.activatePet(petId);await this.reload();audio.sfx('happy');this.renderCollection();}
  private renderCollection() { this.setLayout('full');const owned=new Map(this.state.pets.map((pet)=>[pet.speciesId,pet]));const forms=this.state.catalog.pets.length*4;document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll"><p class="eyebrow">${this.state.catalog.pets.length} SPECIES · ${forms} FORMS</p><h1>${this.t('collection')}</h1><div class="collection-grid">${this.state.catalog.pets.map((definition)=>{const pet=owned.get(definition.id);const stage=pet?.stage||1;const mystery=MYSTERY_PET_IDS.has(definition.id);return `<article class="pet-card ${definition.rarity} ${pet?'':'locked'} ${mystery?'mystery-pet':''}" data-species-id="${definition.id}"><div class="pet-art"><img src="${definition.art[stage-1]}" alt="" loading="lazy"></div><span class="rarity ${definition.rarity}">${definition.rarity}</span><h3>${mystery?'???':escapeHtml(this.petName(definition,stage))}</h3><p>${pet?`Stage ${stage} · ${pet.xp} XP`:this.t('locked')}</p>${pet?`<button data-action="activate" data-id="${pet.id}" ${pet.id===this.state.profile.activePetId?'disabled':''}>${pet.id===this.state.profile.activePetId?this.t('active'):this.t('choose')}</button>`:''}</article>`}).join('')}</div></div>`; }
  private renderShop(category='eggs') {
    this.setLayout('full');const categories=this.locale==='zh-HK'
      ?[['eggs','寵物蛋'],['food','食物'],['wearables','服飾'],['rooms','房間'],['furniture','家具']]
      :[['eggs','Eggs'],['food','Food'],['wearables','Outfits'],['rooms','Rooms'],['furniture','Furniture']];
    let cards='';const pet=this.activePet();
    if(category==='eggs')cards=`<article class="shop-feature"><div class="shop-egg"></div><div><span class="rarity common">${this.t('probability')}</span><h3>${this.t('randomEgg')}</h3><p>${this.locale==='zh-HK'?'隨機獲得已開放寵物之一；未擁有品種優先。':'Receive one of the released pets; unseen species are favoured.'}</p><button class="primary" data-action="buy-random-egg">${this.t('buy')} · ${this.state.catalog.egg.randomPrice} ${this.t('coins')}</button></div></article><h2>${this.t('directPet')}</h2><div class="shop-grid">${this.state.catalog.pets.map((item)=>{const owned=this.state.pets.some((pet)=>pet.speciesId===item.id);const mystery=MYSTERY_PET_IDS.has(item.id);return `<article class="shop-card ${mystery?'mystery-pet':''}"><img src="${item.art[0]}" alt="" loading="lazy"><span class="rarity ${item.rarity}">${item.rarity}</span><h3>${mystery?'???':escapeHtml(this.petName(item,1))}</h3><button data-action="buy-direct-egg" data-id="${item.id}" ${owned?'disabled':''}>${owned?this.t('owned'):`${this.t('buy')} · ${item.directPrice ?? (item.rarity==='common'?1200:2200)}`}</button></article>`;}).join('')}</div>`;
    const list = category==='food'?this.state.catalog.foods:category==='wearables'?this.state.catalog.wearables:category==='rooms'?this.state.catalog.rooms.filter((room)=>!room.pending||this.inventory(`room:${room.id}`)>0).map((item)=>({...item,id:`room:${item.id}`,category:'room_theme'})):category==='furniture'?this.state.catalog.furniture:[];
    if(category!=='eggs')cards=`<div class="shop-grid">${list.map((item:any)=>{const owned=this.inventory(item.id)>0;const art=item.art||'';return `<article class="shop-card ${owned?'owned':''}">${art?`<img src="${art}" alt="" loading="lazy">`:`<div class="item-glyph ${item.category}">${icon(item.category==='food'?'food':item.kind||'spark')}</div>`}<h3>${escapeHtml(this.name(item.name))}</h3><p>${item.xp?`+${item.xp} XP`:item.kind||item.category}</p><button data-action="buy-item" data-id="${item.id}" ${owned&&!['food','furniture'].includes(item.category)?'disabled':''}>${owned&&!['food','furniture'].includes(item.category)?this.t('owned'):`${this.t('buy')} · ${item.price} ${this.t('coins')}`}</button></article>`}).join('')}</div>`;
    document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll"><p class="eyebrow">MAGIC MARKET</p><h1>${this.t('shop')}</h1><div class="filter-row" role="tablist">${categories.map(([id,label])=>`<button data-action="shop-category" data-id="${id}" role="tab" aria-selected="${category===id}" class="${category===id?'active':''}">${label}</button>`).join('')}</div>${cards}</div>`;
  }
  private renderCoinPusher() {
    const zh=this.locale==='zh-HK';
    this.coinPusherKeyboardLaneX=0;
    const activeElement=document.activeElement;
    if(activeElement instanceof HTMLElement && activeElement !== document.body && !activeElement.closest('.coin-pusher-hud')) {
      this.coinPusherReturnFocus=activeElement;
    }
    this.destroyCoinPusher(true);
    this.setLayout('room');
    // The pusher uses the selected room's clean room art, not the editable bedroom scene:
    // furniture placements and the pet stay in the actual room and are never drawn here.
    if(this.game?.scene.isActive('Bedroom'))this.game.scene.sleep('Bedroom');
    const bedroomCanvas=document.querySelector<HTMLElement>('#game-root');
    if(bedroomCanvas)bedroomCanvas.style.display='none';
    const theme=this.state.catalog.rooms.find((entry)=>entry.id===this.state.room.themeId);
    const surface=document.querySelector<HTMLElement>('#playSurface');
    if(surface&&theme){
      // Keep the room centred and let the selected theme's starfield show at either side.
      surface.style.backgroundColor=theme.primary;
      surface.style.backgroundImage=`url("${theme.backdrop}")`;
      surface.style.backgroundSize='cover';surface.style.backgroundPosition='center';surface.style.backgroundRepeat='no-repeat';
      const roomBackdrop=document.createElement('div');
      roomBackdrop.id='coin-pusher-room-backdrop';
      roomBackdrop.setAttribute('aria-hidden','true');
      const roomArt=document.createElement('img');
      roomArt.className='coin-pusher-room-art';
      roomArt.src=theme.art;
      roomArt.alt='';
      roomArt.draggable=false;
      roomBackdrop.append(roomArt);
      const coinRoot=document.querySelector<HTMLElement>('#coin-pusher-root');
      if(coinRoot)surface.insertBefore(roomBackdrop,coinRoot);
    }
    document.querySelector('#petMain')?.setAttribute('data-mode','coin-pusher');
    document.querySelector<HTMLElement>('.pet-shell')?.setAttribute('data-screen','coin-pusher');
    const coinRoot=document.querySelector<HTMLElement>('#coin-pusher-root')!;
    coinRoot.style.display='block';
    coinRoot.innerHTML=`<div class="coin-pusher-loading" data-stage="assets" role="status" aria-live="polite"><div><span class="coin-pusher-spinner" aria-hidden="true"></span><b class="coin-pusher-loading-title">${zh?'正在載入 3D 推銀機…':'Loading the 3D coin pusher…'}</b><small class="coin-pusher-loading-detail">${zh?'準備機台和金幣物理效果':'Preparing the cabinet and coin physics'}</small></div></div>`;
    coinRoot.setAttribute('aria-busy','true');
    const audioIcon=icon(audio.enabled?'sound':'mute');
    const stampProgress=this.coinPusherStampProgress();
    const stampCount=stampProgress.unlockedCount;
    const stampProgressCopy=stampProgress.nextThreshold
      ? (zh?`下一枚紀念章：本階段 ${stampProgress.stepProgress}/${stampProgress.stepSize} 枚`:`Next keepsake: ${stampProgress.stepProgress}/${stampProgress.stepSize} this tier`)
      : (zh?`已解鎖全部紀念章`:`All keepsakes unlocked`);
    const statusCopy=zh?'正在載入推銀機…':'Loading the coin pusher…';
    document.querySelector('#roomBar')!.innerHTML=`<div class="coin-pusher-hud">
      <button class="coin-pusher-back" data-action="coin-pusher-exit" aria-label="${zh?'返回房間':'Back to room'}"><span aria-hidden="true">←</span><small>${zh?'房間':'Room'}</small></button>
      <div class="coin-pusher-brand"><div class="coin-pusher-brand-heading"><small>PET ARCADE</small><strong>${this.t('coinPusher')}</strong></div><div class="coin-pusher-brand-status"><span id="coinPusherSystemStatus" role="status" aria-live="polite">${statusCopy}</span><small class="coin-pusher-keyboard-hint">${zh?'←／→ 揀位 · Space／↓ 落幣':'← / → aim · Space / ↓ drop'}</small></div></div>
      <div class="coin-pusher-wallet" aria-label="${zh?'學生金幣餘額；每次落幣需要 1 枚；推出金幣會回到錢包':'Student coin balance; each drop costs 1 coin; payout coins return to the wallet'}">${icon('coin')}<span><small>${zh?'餘額':'BAL'}</small><b id="coinBalanceHud">${this.state.wallet.balance.toLocaleString()}</b></span></div>
      <button type="button" class="coin-pusher-drop" data-action="coin-pusher-drop" aria-describedby="coinPusherSystemStatus" disabled>${icon('coin')}<small><span>${zh?'落幣':'Drop'}</span><b>−1</b></small></button>
      <button type="button" class="coin-pusher-collection" data-action="coin-pusher-collection" data-progress-percent="${stampProgress.percent}" style="--stamp-progress:${stampProgress.percent}%" title="${stampProgressCopy}" aria-haspopup="dialog" aria-controls="modalRoot" aria-label="${zh?`爪印收藏，已解鎖 ${stampCount}/${COIN_PUSHER_STAMPS.length} 個；${stampProgressCopy}`: `Paw-stamp collection, ${stampCount}/${COIN_PUSHER_STAMPS.length} unlocked; ${stampProgressCopy}`}"><span class="coin-pusher-collection-ring" aria-hidden="true"><svg viewBox="0 0 64 64"><circle cx="18" cy="23" r="6"/><circle cx="31" cy="16" r="6"/><circle cx="44" cy="21" r="6"/><circle cx="51" cy="32" r="5"/><path d="M31.5 29c-9.1 0-18.5 10.2-18.5 18.1 0 5.8 4.8 8.8 10.6 6.5 4.7-1.8 8.7-1.8 13.4 0 5.8 2.3 10.6-.7 10.6-6.5C47.6 39.2 40.8 29 31.5 29Z"/></svg></span><small id="coinPusherCollectionCount">${stampCount}/${COIN_PUSHER_STAMPS.length}</small></button>
      <button class="round-button coin-pusher-sound" data-action="audio" aria-label="${zh?'遊戲音效':'Game sound'}" aria-pressed="${audio.enabled}">${audioIcon}</button>
    </div>`;
    this.syncCoinPusherCollectionBadge();
    // The navigation tab that opened the game is hidden in this view. Move focus to a visible
    // control immediately, and only focus the canvas after loading if focus has not moved.
    const backButton=document.querySelector<HTMLButtonElement>('.coin-pusher-back');
    backButton?.focus({preventScroll:true});
    this.syncCoinPusherControls();
    const generation=this.coinPusherGeneration;
    if(this.coinPusherInitPending){audio.setTheme('arcade');return;}
    this.coinPusherInitPending=true;
    this.cancelCoinPusherPreload();
    const inMemoryModel=this.coinPusherModel;
    const authoritativeStateRefresh=this.reload().catch((error)=>{
      console.warn('[pet] Could not refresh the student wallet before coin-pusher entry',error);
    });
    void Promise.all([this.loadCoinPusherStoredSession(),authoritativeStateRefresh]).then(([savedSession])=>{
      if(generation!==this.coinPusherGeneration||this.tab!=='coinPusher')return undefined;
      this.syncCoinPusherCollectionBadge();
      const restoreSession=inMemoryModel?undefined:savedSession;
      if(restoreSession){
        const storedBest=restoreSession.bestTimingStreak;
        this.coinPusherTimingStreak={count:0,best:Number.isSafeInteger(storedBest)&&storedBest!>=0?storedBest!:0};
        this.coinPusherPlays=restoreSession.plays.map((play)=>({
          ...play,reserved:0,generation,
        }));
        this.coinPusherPendingPayouts=restoreSession.pendingPayouts.map((payout)=>({...payout}));
        for(const payout of this.coinPusherPendingPayouts){
          let play=this.coinPusherPlays.find((entry)=>entry.playId===payout.playId);
          if(!play){
            play={playId:payout.playId,remaining:100,reserved:0,generation};
            this.coinPusherPlays.push(play);
          }
          play.reserved+=payout.amount;
        }
        this.coinPusherPendingDrop=restoreSession.pendingDrop?{
          ...restoreSession.pendingDrop,
          ...(restoreSession.pendingDrop.result?{result:{...restoreSession.pendingDrop.result}}:{}),
        }:undefined;
        this.coinPusherPayoutSequence=restoreSession.payoutSequence;
      }
      this.coinPusherSessionRestored=!!restoreSession;
      coinRoot.dataset.sessionRestored=String(!!restoreSession);
      coinRoot.dataset.bestTimingStreak=String(this.coinPusherTimingStreak.best);
      return this.loadCoinPusherSceneModule().then(({CoinPusherScene})=>CoinPusherScene.create(
      coinRoot,
      (worldX) => {
        if(generation!==this.coinPusherGeneration||this.coinPusherBusy)return;
        this.dropCoinPusher(worldX);
      },
      (count, origins) => {
        if(generation!==this.coinPusherGeneration)return;
        audio.sfx('coin');
        const caughtCount=this.animateCoinTrayCatch(count, origins);
        this.setCoinPusherStatus(this.locale==='zh-HK'
          ? `銀仔已跌入坑槽 ×${caughtCount} · 正在確認獎勵…`
          : `${caughtCount} coin${caughtCount===1?'':'s'} in the collection well · confirming payout…`);
        void this.creditCoinPayout(count, generation, origins);
      },
      (available,reason) => {
        if(generation!==this.coinPusherGeneration)return;
        // Do not enable Drop until the asynchronous scene factory has returned its handle.
        this.coinPusherReady=available&&!!this.coinPusherView;
        this.coinPusherWebglLost=!available&&reason==='context-lost';
        if(available)this.coinPusherInitFailed=false;
        if(this.coinPusherWebglLost){
          this.setCoinPusherStatus(zh?'3D 畫面暫停；圖像恢復前不能投幣。':'3D rendering paused. You cannot play until graphics are restored.');
        } else if(available&&reason==='restored'){
          this.setCoinPusherStatus(zh?'3D 畫面已恢復。':'3D rendering has been restored.');
          const restoredRevision=this.coinPusherStatusRevision;
          window.setTimeout(()=>{
            if(generation!==this.coinPusherGeneration||this.coinPusherStatusRevision!==restoredRevision
              ||!this.coinPusherReady||this.coinPusherWebglLost)return;
            this.setCoinPusherStatus(this.coinPusherReadyMessage());
          },1400);
        }
        this.syncCoinPusherControls();
      },
      (count, landings) => {
        const pan=this.coinPusherStereoPan(landings);
        audio.sfx('arcadeLand', count, pan);
        this.animateCoinPusherTimingCue(landings);
        if(landings.some((landing)=>landing.pusherBeat==='forward'))
          audio.sfx('arcadeTiming',Math.max(1,this.coinPusherTimingStreak.count),pan);
      },
      (direction, durationSeconds) => audio.sfx('arcadeStroke', direction === 'forward' ? 0 : 4, 0, durationSeconds),
      this.coinPusherModel,
      () => {
        if(generation!==this.coinPusherGeneration||this.tab!=='coinPusher')return;
        const loading=coinRoot.querySelector<HTMLElement>('.coin-pusher-loading');
        if(!loading)return;
        loading.classList.add('is-preview-ready');
        loading.dataset.stage='physics';
        const loadingTitle=loading.querySelector<HTMLElement>('.coin-pusher-loading-title');
        const loadingDetail=loading.querySelector<HTMLElement>('.coin-pusher-loading-detail');
        if(loadingTitle)loadingTitle.textContent=zh?'機台畫面已準備好':'Cabinet preview ready';
        if(loadingDetail)loadingDetail.textContent=zh?'正在啟動物理，片刻即可落幣':'Starting physics · drops unlock in a moment';
        coinRoot.dataset.loadingStage='physics';
        this.setCoinPusherStatus(zh?'機台已準備，正在啟動物理…':'Cabinet ready · starting physics…');
      },
      restoreSession?.model,
      this.coinPusherStampCount(),
      (count, origin) => audio.sfx('arcadeRattle', count, this.coinPusherStereoPan([origin])),
    ));
    }).then((view)=>{
      if(!view)return;
      if(generation!==this.coinPusherGeneration){view.destroy();return;}
      this.coinPusherInitPending=false;
      this.coinPusherModel=view.model;
      if(this.tab!=='coinPusher'){view.destroy(true);return;}
      this.coinPusherView=view;
      view.renderer.domElement.setAttribute('aria-label',zh
        ?'互動式 3D 推銀仔機。在機台任意位置向下滑動，銀仔會從該水平位置落到推板上；亦可按向左／向右鍵揀位，再按向下鍵、空白鍵或 Enter 落幣。按 Escape 返回房間。'
        :'Interactive 3D coin pusher. Swipe down anywhere to drop at that horizontal position, or use Left/Right to aim and Down, Space or Enter to drop. Press Escape to return to the room.');
      view.renderer.domElement.setAttribute('role','application');
      view.renderer.domElement.setAttribute('tabindex','0');
      if(document.activeElement===backButton)view.renderer.domElement.focus({preventScroll:true});
      if(!this.coinPusherWebglLost)this.coinPusherReady=true;
      this.coinPusherInitFailed=false;coinRoot.setAttribute('aria-busy','false');
      coinRoot.insertAdjacentHTML('beforeend',`<div class="coin-pusher-webgl-overlay" role="status" aria-live="polite" hidden><div><b>${zh?'3D 畫面暫停':'3D rendering paused'}</b><span>${zh?'圖像恢復後才可以落幣。':'Dropping is disabled until graphics return.'}</span></div></div>`);
      if(!this.coinPusherWebglLost)this.setCoinPusherStatus(this.coinPusherReadyMessage());
      this.syncCoinPusherControls();
      this.startCoinPusherAutosave(generation);
      if(!this.coinPusherSessionRestored){
        void this.persistCoinPusherSession();
      }
      for(const payout of this.coinPusherPendingPayouts)this.queueCoinPusherPayout(payout,generation,true);
      if(this.coinPusherPendingDrop&&!this.coinPusherPendingDrop.applied){
        void this.dropCoinPusher(this.coinPusherPendingDrop.worldX,true);
      }
    }).catch((error)=>{
      this.coinPusherSceneModule=undefined;
      this.coinPusherModelModule=undefined;
      if(generation!==this.coinPusherGeneration)return;
      this.coinPusherInitPending=false;
      if(this.tab!=='coinPusher')return;
      console.warn('[pet] 3D coin pusher could not start',error);
      this.coinPusherReady=false;this.coinPusherWebglLost=false;this.coinPusherInitFailed=true;
      this.setCoinPusherStatus(zh?'3D 推銀機未能啟動':'3D coin pusher could not start');
      coinRoot.setAttribute('aria-busy','false');
      coinRoot.innerHTML=`<div class="coin-pusher-fallback" role="alert"><b>${zh?'3D 推幣機暫時未能啟動':'3D coin pusher could not start'}</b><span>${zh?'請檢查瀏覽器的 WebGL 支援，或重試。':'Check browser WebGL support, or retry.'}</span><button type="button" class="coin-pusher-retry" data-action="coin-pusher-init-retry">${zh?'重試載入':'Retry loading'}</button></div>`;
      this.syncCoinPusherControls();
    });
    audio.setTheme('arcade');
  }
  private async authorizeCoinPusherDrop(generation:number,requestKey:string,recovered=false) {
    this.coinPusherPaymentInFlight=true;
    try {
      const result=await api.playCoinPusher(requestKey);
      if(generation!==this.coinPusherGeneration)return undefined;
      if(recovered)await this.reload();
      else{
        this.state.wallet.balance=Number(result.balance);
        this.updateWallet();
      }
      return result;
    } catch(error) {
      this.handleCoinPusherTransactionError(error as Error);
      return undefined;
    } finally {
      this.coinPusherPaymentInFlight=false;
      this.syncCoinPusherControls();
    }
  }
  private async dropCoinPusher(worldX=0,recovered=false) {
    const zh=this.locale==='zh-HK';
    if(this.coinPusherBusy)return;
    if(!this.coinPusherReady||this.coinPusherWebglLost||this.coinPusherInitFailed){this.syncCoinPusherControls();return;}
    const existingPending=this.coinPusherPendingDrop&&!this.coinPusherPendingDrop.applied
      ?this.coinPusherPendingDrop:undefined;
    if(!existingPending&&Number(this.state.wallet.balance) < COIN_PUSHER_DROP_COST){
      this.setCoinPusherStatus(this.coinPusherInsufficientMessage());
      this.toast(zh?'金幣唔夠；每次落幣需要 1 枚。':'Not enough coins. Each drop costs 1 coin.',true);
      this.syncCoinPusherControls();
      return;
    }
    const scene=this.coinPusherView;
    if(!scene)return;
    if(!scene.canDropCoin()){
      // Capacity feedback is contextual, not a persistent machine status.
      // Keep the HUD's balance/ready message clear while briefly explaining the rejected drop.
      this.setCoinPusherStatus(this.coinPusherReadyMessage());
      this.toast(zh?'機台暫時很擠，等一些銀仔落槽後再掃。':'The machine is crowded. Wait for a few coins to clear, then swipe again.');
      return;
    }
    // A valid swipe or keyboard drop is also a fresh user gesture. Resume audio here because
    // browsers may suspend Web Audio while the student backgrounds the app or locks the tablet.
    void audio.unlock().catch(()=>undefined);
    const generation=this.coinPusherGeneration;
    this.coinPusherBusy=true;
    this.setCoinPusherStatus(existingPending
      ?(zh?'正在安全確認已付落幣…':'Safely confirming your paid drop…')
      :(zh?'正在安全保存機台…':'Saving the arcade before your drop…'));
    const dropStatusRevision=this.coinPusherStatusRevision;
    this.syncCoinPusherControls();
    let pending=existingPending;
    if(!pending){
      pending={requestKey:idempotencyKey(),worldX,applied:false};
      this.coinPusherPendingDrop=pending;
      if(!await this.persistCoinPusherSession()){
        this.coinPusherPendingDrop=undefined;
        this.coinPusherBusy=false;
        this.setCoinPusherStatus(zh?'機台未能安全暫存，今次沒有扣幣。':'Could not safely save the arcade; no coin was charged.');
        this.toast(zh?'暫存空間未能使用，請稍後再試。':'Arcade storage is unavailable. Please try again.',true);
        this.syncCoinPusherControls();
        return;
      }
    }
    let playResult=pending.result;
    if(!playResult)playResult=await this.authorizeCoinPusherDrop(generation,pending.requestKey,recovered||!!existingPending);
    if(!playResult){
      this.coinPusherBusy=false;
      if(this.coinPusherStatusRevision===dropStatusRevision)this.setCoinPusherStatus(zh
        ?'落幣結果未確認；重試會安全核對，不會重複扣幣。'
        :'Drop not confirmed. Retry to safely check it; you will not be charged twice.');
      this.syncCoinPusherControls();
      return;
    }
    pending.result={playId:String(playResult.playId),payoutCap:Number(playResult.payoutCap)||100};
    if(generation!==this.coinPusherGeneration||scene!==this.coinPusherView){
      this.coinPusherBusy=false;
      void this.persistCoinPusherSession();
      return;
    }
    const dropId=scene.dropCoin(pending.worldX);
    if(dropId===undefined){
      this.coinPusherBusy=false;
      this.setCoinPusherStatus(zh?'落幣已確認，機台可接收時會放回盤面。':'Drop confirmed; it will enter the board when a slot is available.');
      void this.persistCoinPusherSession();
      this.syncCoinPusherControls();
      return;
    }
    this.coinPusherPlays.push({playId:pending.result.playId,remaining:pending.result.payoutCap,reserved:0,generation});
    pending.applied=true;
    const persisted=await this.persistCoinPusherSession();
    audio.sfx('arcadeDrop');
    if(this.coinPusherCooldown!==undefined)window.clearTimeout(this.coinPusherCooldown);
    this.coinPusherCooldown=window.setTimeout(()=>{
      this.coinPusherCooldown=undefined;
      if(generation!==this.coinPusherGeneration)return;
      this.coinPusherBusy=false;
      if(!persisted)this.setCoinPusherStatus(zh
        ?'銀仔已落盤；正在重試保存局面，保存完成前暫停落幣。'
        :'Coin is on the board. Saving will retry; drops pause until the board is safely stored.');
      else if(this.coinPusherStatusRevision===dropStatusRevision)this.setCoinPusherStatus(this.coinPusherReadyMessage());
      this.syncCoinPusherControls();
    },220);
  }
  private retryCoinPusherInitialization() {
    if(this.tab!=='coinPusher'||!this.coinPusherInitFailed)return;
    sessionStorage.setItem('pet-coin-pusher-retry','1');
    window.location.reload();
  }
  private setCoinPusherStatus(message:string) {
    this.coinPusherStatusRevision+=1;
    const status=document.querySelector<HTMLElement>('#coinPusherSystemStatus');
    if(status)status.textContent=message;
  }
  private handleCoinPusherTransactionError(error:Error) {
    const zh=this.locale==='zh-HK';
    const insufficient=error.message==='Not enough coins';
    this.setCoinPusherStatus(insufficient?this.coinPusherInsufficientMessage():(zh
      ?'落幣結果未確認；重試會安全核對，不會重複扣幣。'
      :'Drop not confirmed. Retry to safely check it; you will not be charged twice.'));
    this.toast(insufficient?(zh?'金幣唔夠；每次落幣需要 1 枚。':'Not enough coins. Each drop costs 1 coin.'):(zh
      ?'網絡未能確認落幣；可安全重試。'
      :'The drop could not be confirmed; it is safe to retry.'),true);
  }
  private handleCoinPusherPayoutError(error:Error) {
    const zh=this.locale==='zh-HK';
    this.setCoinPusherStatus(zh?'推出獎勵已安全暫存，網絡恢復後會重試。':'Your payout is safely saved and will retry when the connection returns.');
    this.toast(zh?'獎勵暫存中，請保持連線或稍後返回機台。':'Payout saved. Stay online or return to the arcade later.',true);
  }
  private coinPusherReadyMessage() {
    const zh=this.locale==='zh-HK';
    if(this.coinPusherPendingDrop&&!this.coinPusherPendingDrop.applied)return zh
      ?'有一枚已付落幣待確認 · 重試不會重複扣幣'
      :'One paid drop needs confirmation · retry will not charge twice';
    if(Number(this.state.wallet.balance) < COIN_PUSHER_DROP_COST)return this.coinPusherInsufficientMessage();
    const keyboardHintVisible=typeof window.matchMedia==='function'
      && window.matchMedia('(hover: hover) and (pointer: fine) and (min-width: 760px)').matches;
    if(keyboardHintVisible)return zh?'落幣 −1 · 入槽 +1':'Drop −1 · tray +1';
    return zh?'揀位後向下滑落幣 · 入槽 +1':'Choose a lane · swipe down to drop';
  }
  private coinPusherInsufficientMessage() {
    return this.locale==='zh-HK'?'金幣不足 · 每次落幣需要 1 枚':'Not enough coins · each drop costs 1';
  }
  private coinPusherPayoutMessage(count:number) {
    return this.locale==='zh-HK'
      ? `跌入坑槽 ×${count} · 獎勵會回到錢包`
      : `${count} coin${count===1?'':'s'} in tray · returning to wallet`;
  }
  private coinPusherReturnedCoins() {
    return Math.max(0, Math.floor(Number(this.state.coinPusherCollection?.returnedCoins) || 0));
  }
  private coinPusherStampCount(total = this.coinPusherReturnedCoins()) {
    return this.coinPusherStampProgress(total).unlockedCount;
  }
  private coinPusherStampProgress(total = this.coinPusherReturnedCoins()) {
    return coinPusherStampProgress(total);
  }
  private coinPusherTimingBestCopy() {
    const best = Math.max(0, Math.floor(this.coinPusherTimingStreak.best || 0));
    return best > 0 ? `×${best}` : (this.locale === 'zh-HK' ? '尚未建立' : 'No record yet');
  }
  private syncCoinPusherCollectionBadge() {
    const button = document.querySelector<HTMLButtonElement>('.coin-pusher-collection');
    if (!button) return;
    const zh = this.locale === 'zh-HK';
    const progress = this.coinPusherStampProgress();
    const unlocked = progress.unlockedCount;
    const progressCopy = progress.nextThreshold
      ? (zh?`下一枚紀念章：本階段 ${progress.stepProgress}/${progress.stepSize} 枚`:`Next keepsake: ${progress.stepProgress}/${progress.stepSize} this tier`)
      : (zh?`已解鎖全部紀念章`:`All keepsakes unlocked`);
    const count = button.querySelector<HTMLElement>('#coinPusherCollectionCount');
    if (count) count.textContent = `${unlocked}/${COIN_PUSHER_STAMPS.length}`;
    button.dataset.progressPercent = String(progress.percent);
    button.style.setProperty('--stamp-progress', `${progress.percent}%`);
    button.title = progressCopy;
    button.setAttribute('aria-label', zh
      ? `爪印收藏，已解鎖 ${unlocked}/${COIN_PUSHER_STAMPS.length} 個；${progressCopy}`
      : `Paw-stamp collection, ${unlocked}/${COIN_PUSHER_STAMPS.length} unlocked; ${progressCopy}`);
    const returned = document.querySelector<HTMLElement>('#coinPusherCollectionReturned');
    if (returned) returned.textContent = progress.total.toLocaleString();
    const panelProgress = document.querySelector<HTMLElement>('.coin-pusher-progress-track');
    if (panelProgress) {
      panelProgress.setAttribute('aria-valuenow', String(progress.percent));
      const fill = panelProgress.firstElementChild as HTMLElement | null;
      if (fill) fill.style.width = `${progress.percent}%`;
    }
    const panelNext = document.querySelector<HTMLElement>('.coin-pusher-collection-progress > small');
    if (panelNext) panelNext.textContent = progress.nextThreshold
      ? (zh ? `下一枚本階段 ${progress.stepProgress} / ${progress.stepSize}` : `Next stamp ${progress.stepProgress} / ${progress.stepSize} this tier`)
      : (zh ? '已收集全部紀念章' : 'All keepsakes collected');
    const finish = coinPusherCabinetFinish(unlocked);
    const finishPanel = document.querySelector<HTMLElement>('.coin-pusher-finish-current');
    if (finishPanel) {
      finishPanel.dataset.finishTier = String(unlocked);
      finishPanel.style.setProperty('--finish-brass', `#${finish.brass.toString(16).padStart(6,'0')}`);
      finishPanel.style.setProperty('--finish-pale', `#${finish.paleGold.toString(16).padStart(6,'0')}`);
      finishPanel.style.setProperty('--finish-glow', `#${finish.glow.toString(16).padStart(6,'0')}`);
      const finishName = finishPanel.querySelector<HTMLElement>('.coin-pusher-finish-current-copy > b');
      if (finishName) finishName.textContent = COIN_PUSHER_CABINET_FINISH_NAMES[unlocked][this.locale];
    }
    document.querySelectorAll<HTMLElement>('.coin-pusher-stamp').forEach((card, index) => {
      const stamp = COIN_PUSHER_STAMPS[index];
      if (!stamp) return;
      const isUnlocked = progress.total >= stamp.threshold;
      card.classList.toggle('is-unlocked', isUnlocked);
      card.classList.toggle('is-locked', !isUnlocked);
      card.setAttribute('aria-label', `${stamp.name[this.locale]} · ${stamp.threshold} · ${isUnlocked ? (zh ? '已解鎖' : 'Unlocked') : (zh ? '未解鎖' : 'Locked')}`);
      const state = card.querySelector<HTMLElement>('em');
      if (state) state.textContent = isUnlocked ? (zh ? '已解鎖' : 'Unlocked') : `${stamp.threshold} ${zh ? '枚' : 'coins'}`;
    });
  }
  private openCoinPusherCollection() {
    const zh = this.locale === 'zh-HK';
    const total = this.coinPusherReturnedCoins();
    const nextIndex = COIN_PUSHER_STAMPS.findIndex((stamp) => total < stamp.threshold);
    const next = nextIndex >= 0 ? COIN_PUSHER_STAMPS[nextIndex] : undefined;
    const progressState = this.coinPusherStampProgress(total);
    const progress = progressState.percent;
    const finish = coinPusherCabinetFinish(progressState.unlockedCount);
    const finishName = COIN_PUSHER_CABINET_FINISH_NAMES[progressState.unlockedCount][this.locale];
    const timingBest = this.coinPusherTimingBestCopy();
    const finishStyle = `--finish-brass:#${finish.brass.toString(16).padStart(6,'0')};--finish-pale:#${finish.paleGold.toString(16).padStart(6,'0')};--finish-glow:#${finish.glow.toString(16).padStart(6,'0')}`;
    const nextLabel = next ? `${progressState.stepProgress} / ${progressState.stepSize}` : undefined;
    const stamps = COIN_PUSHER_STAMPS.map((stamp) => {
      const unlocked = total >= stamp.threshold;
      return `<article class="coin-pusher-stamp coin-pusher-stamp--${stamp.tier} ${unlocked ? 'is-unlocked' : 'is-locked'}" data-tier="${stamp.tier}" aria-label="${stamp.name[this.locale]} · ${stamp.threshold}">
        <span class="coin-pusher-stamp-medallion" aria-hidden="true"><svg class="coin-pusher-stamp-paw" viewBox="0 0 64 64"><circle cx="18" cy="23" r="6"/><circle cx="31" cy="16" r="6"/><circle cx="44" cy="21" r="6"/><circle cx="51" cy="32" r="5"/><path d="M31.5 29c-9.1 0-18.5 10.2-18.5 18.1 0 5.8 4.8 8.8 10.6 6.5 4.7-1.8 8.7-1.8 13.4 0 5.8 2.3 10.6-.7 10.6-6.5C47.6 39.2 40.8 29 31.5 29Z"/></svg><small class="coin-pusher-stamp-rank">${stamp.rank}</small></span>
        <b>${stamp.name[this.locale]}</b><small>${stamp.title[this.locale]}</small>
        <em>${unlocked ? (zh ? '已解鎖' : 'Unlocked') : `${stamp.threshold} ${zh ? '枚' : 'coins'}`}</em>
      </article>`;
    }).join('');
    this.modal(`<section class="coin-pusher-collection-panel" role="dialog" aria-modal="true" aria-labelledby="coinPusherCollectionTitle">
      <header class="coin-pusher-collection-heading"><span aria-hidden="true">🐾</span><div><small>${zh ? '機台紀念章' : 'ARCADE KEEPSAKES'}</small><h2 id="coinPusherCollectionTitle">${zh ? '爪印收藏冊' : 'Paw-stamp collection'}</h2></div></header>
      <p class="coin-pusher-collection-copy">${zh ? '只計算已確認並回到錢包的推出銀仔。每枚爪印會解鎖機台配色，只改外觀，不會額外增加或扣除金幣。' : 'Only confirmed wallet payouts count. Each paw stamp unlocks a cabinet finish; it changes looks only and never adds or spends coins.'}</p>
      <div class="coin-pusher-collection-progress"><div><b>${zh ? '已入帳銀仔' : 'Payout coins returned'}</b><strong id="coinPusherCollectionReturned">${total.toLocaleString()}</strong></div><small>${next ? (zh ? `下一枚本階段 ${nextLabel}` : `Next stamp ${nextLabel} this tier`) : (zh ? '已收集全部紀念章' : 'All keepsakes collected')}</small><div class="coin-pusher-progress-track" role="progressbar" aria-label="${zh ? '下一枚紀念章進度' : 'Progress to next keepsake'}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progress)}"><span style="width:${progress}%"></span></div></div>
      <div class="coin-pusher-collection-highlights">
        <div class="coin-pusher-personal-best" role="group" aria-label="${zh ? '個人推送技巧紀錄' : 'Personal timing record'}"><span aria-hidden="true">✦</span><div><small>${zh ? '最佳準確推送連中' : 'PERSONAL TIMING BEST'}</small><b id="coinPusherTimingBest" aria-live="polite">${timingBest}</b></div></div>
        <div class="coin-pusher-finish-current" data-finish-tier="${progressState.unlockedCount}" style="${finishStyle}"><span class="coin-pusher-finish-swatch" aria-hidden="true"><i></i><i></i><i></i></span><span class="coin-pusher-finish-current-copy"><small>${zh ? '目前機台配色' : 'CURRENT CABINET FINISH'}</small><b>${finishName}</b></span></div>
      </div>
      <div class="coin-pusher-stamp-grid">${stamps}</div>
      <button type="button" class="primary coin-pusher-collection-close" data-action="close-modal">${zh ? '繼續玩' : 'Keep playing'}</button>
    </section>`, 'coin-pusher-collection-modal');
    const button = document.querySelector<HTMLButtonElement>('.coin-pusher-collection');
    button?.setAttribute('aria-expanded', 'true');
    document.querySelector<HTMLButtonElement>('#modalRoot .coin-pusher-collection-close')?.focus({ preventScroll: true });
  }
  private coinPusherExitWaitMessage() { return this.locale==='zh-HK'?'正在處理落幣，請稍候再返回房間':'Your drop is still processing. Please wait before leaving.'; }
  private creditCoinPayout(count:number, generation:number, origins?:CoinPusherRewardOrigin[]) {
    const play=this.coinPusherPlays.find((item)=>item.generation===generation&&item.remaining-item.reserved>0);
    if(!play)return;
    const available=Math.max(0,play.remaining-play.reserved);
    const amount=Math.min(Math.max(0,Math.floor(count)),available,20);
    if(amount<=0)return;
    const eventId=`${play.playId}:${++this.coinPusherPayoutSequence}`;
    const requestKey=idempotencyKey();
    play.reserved+=amount;
    const payout:StoredCoinPusherPayout={playId:play.playId,amount,eventId,requestKey};
    this.coinPusherPendingPayouts.push(payout);
    const payoutOrigins=origins?.slice(0,amount);
    void this.persistCoinPusherSession().then((saved)=>{
      if(!saved){
        if(generation===this.coinPusherGeneration&&this.tab==='coinPusher')this.handleCoinPusherPayoutError(new Error('storage'));
        return;
      }
      this.queueCoinPusherPayout(payout,generation,false,payoutOrigins);
    });
  }
  private queueCoinPusherPayout(payout:StoredCoinPusherPayout,generation:number,recovered=false,origins?:CoinPusherRewardOrigin[]) {
    if(this.coinPusherPayoutsQueued.has(payout.eventId))return;
    let play=this.coinPusherPlays.find((entry)=>entry.playId===payout.playId);
    if(!play){
      play={playId:payout.playId,remaining:100,reserved:payout.amount,generation};
      this.coinPusherPlays.push(play);
    }
    this.coinPusherPayoutsQueued.add(payout.eventId);
    const job=async()=>{
      const succeeded=await this.submitCoinPusherPayout(play!,payout,generation,origins,0,recovered);
      this.coinPusherPayoutsQueued.delete(payout.eventId);
      if(!succeeded)this.scheduleCoinPusherPayoutRetry();
    };
    this.coinPusherPayoutQueue=this.coinPusherPayoutQueue.catch(()=>undefined).then(job);
  }
  private retryPendingCoinPusherPayouts = () => {
    if(!this.coinPusherPendingPayouts.length||document.visibilityState==='hidden')return;
    if(this.coinPusherPayoutRetryTimer!==undefined){
      window.clearTimeout(this.coinPusherPayoutRetryTimer);
      this.coinPusherPayoutRetryTimer=undefined;
    }
    const generation=this.coinPusherGeneration;
    for(const payout of this.coinPusherPendingPayouts)this.queueCoinPusherPayout(payout,generation,true);
  };
  private scheduleCoinPusherPayoutRetry() {
    if(this.coinPusherPayoutRetryTimer!==undefined||!this.coinPusherPendingPayouts.length)return;
    this.coinPusherPayoutRetryTimer=window.setTimeout(()=>{
      this.coinPusherPayoutRetryTimer=undefined;
      this.retryPendingCoinPusherPayouts();
    },5000);
  }
  private async submitCoinPusherPayout(play:{playId:string;remaining:number;reserved:number}, payout:StoredCoinPusherPayout, generation:number, origins?:CoinPusherRewardOrigin[], attempt=0, recovered=false):Promise<boolean> {
    const {amount,eventId,requestKey}=payout;
    try {
      const result=await api.payoutCoinPusher({playId:play.playId,eventId,amount},requestKey);
      const previousStamps=this.coinPusherStampCount();
      this.state.wallet.balance=Number(result.balance); this.updateWallet();
      if(result.collection)this.state.coinPusherCollection={returnedCoins:Math.max(this.coinPusherReturnedCoins(),Number(result.collection.returnedCoins)||0)};
      this.syncCoinPusherCollectionBadge();
      this.coinPusherView?.setKeepsakeTier(this.coinPusherStampCount());
      play.reserved=Math.max(0,play.reserved-amount);
      play.remaining=Number(result.remainingPayout);
      this.coinPusherPendingPayouts=this.coinPusherPendingPayouts.filter((entry)=>entry.eventId!==eventId);
      if(play.remaining<=0&&play.reserved<=0)this.coinPusherPlays=this.coinPusherPlays.filter((entry)=>entry!==play);
      if(recovered)await this.reload();
      await this.persistCoinPusherSession();
      const catchAnimationRemaining=Math.max(0,this.coinPusherTrayCatchUntil-performance.now());
      if(catchAnimationRemaining>0)await new Promise((resolve)=>window.setTimeout(resolve,catchAnimationRemaining));
      if(generation===this.coinPusherGeneration&&this.tab==='coinPusher'){
        const unlockedStamps=this.coinPusherStampCount()>previousStamps
          ?COIN_PUSHER_STAMPS.slice(previousStamps,this.coinPusherStampCount())
          :[];
        audio.sfx(unlockedStamps.length?'arcadeKeepsake':'arcadePayout', amount, this.coinPusherStereoPan(origins));
        this.animateCoinPayout(amount,origins);
        this.setCoinPusherStatus(this.locale==='zh-HK'?`坑槽 +${amount} · 已回到錢包`:`Tray +${amount} · added to wallet`);
        if(unlockedStamps.length){
          const names=unlockedStamps.map((stamp)=>stamp.name[this.locale]);
          const message=this.locale==='zh-HK'
            ?names.length===1?`新爪印・機台配色已解鎖：${names[0]}！`:`連解鎖 ${names.length} 款爪印與機台配色：${names.join('、')}`
            :names.length===1?`New cabinet finish unlocked: ${names[0]}!`:`${names.length} new paw-stamps and cabinet finishes: ${names.join(', ')}`;
          this.toast(message);
        }
      }
      return true;
    } catch(error) {
      if(attempt<1){
        await new Promise((resolve)=>window.setTimeout(resolve,350));
        return this.submitCoinPusherPayout(play,payout,generation,origins,attempt+1,recovered);
      }
      if(generation===this.coinPusherGeneration&&this.tab==='coinPusher')this.handleCoinPusherPayoutError(error as Error);
      return false;
    }
  }
  private coinPusherStereoPan(origins?:readonly CoinPusherRewardOrigin[]) {
    const root=document.querySelector<HTMLElement>('#coin-pusher-root');
    const width=root?.clientWidth??0;
    return origins?coinPusherImpactPan(origins,width):0;
  }
  private animateCoinPayout(amount:number, origins?:CoinPusherRewardOrigin[]) {
    const root=document.querySelector<HTMLElement>('#coin-pusher-root');
    const wallet=document.querySelector<HTMLElement>('.coin-pusher-wallet');
    if(!root||!wallet)return;
    wallet.classList.remove('is-rewarded');
    void wallet.offsetWidth;
    wallet.classList.add('is-rewarded');
    window.setTimeout(()=>wallet.classList.remove('is-rewarded'),850);
    const reducedMotion=document.documentElement.classList.contains('reduced-motion')
      || (typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const rootRect=root.getBoundingClientRect();
    const walletRect=wallet.getBoundingClientRect();
    const targetX=walletRect.left+walletRect.width/2-rootRect.left;
    const targetY=walletRect.top+walletRect.height/2-rootRect.top;
    const validOrigins=origins?.filter((origin)=>Number.isFinite(origin.x)&&Number.isFinite(origin.y))??[];
    const payoutAt=performance.now();
    const collectionCenter=validOrigins.length
      ?validOrigins.reduce((sum,origin)=>({x:sum.x+origin.x/validOrigins.length,y:sum.y+origin.y/validOrigins.length}),{x:0,y:0})
      :{x:rootRect.width*.5,y:rootRect.height*.72};
    const flightPlan=reducedMotion
      ?undefined
      :planCoinPusherRewardFlightDelays(amount,payoutAt,this.coinPusherRewardVisualNextAt);
    if(flightPlan)this.coinPusherRewardVisualNextAt=flightPlan.nextAvailableAt;
    this.coinPusherCascade=advanceCoinPusherCascade(this.coinPusherCascade,amount,payoutAt);
    const cascadeLabel=coinPusherCascadeLabel(this.coinPusherCascade.count,this.locale);
    if(cascadeLabel){
      let cascade=this.coinPusherCascadeCue;
      const reusingCue=!!cascade&&cascade.isConnected&&cascade.parentElement===root;
      if(!reusingCue){
        cascade=document.createElement('span');
        cascade.className='coin-pusher-cascade';
        cascade.setAttribute('aria-hidden','true');
        this.coinPusherCascadeCue=cascade;
        root.append(cascade);
      }
      cascade!.classList.toggle('is-static',reducedMotion);
      cascade!.textContent=cascadeLabel;
      const hud=document.querySelector<HTMLElement>('.coin-pusher-hud')?.getBoundingClientRect();
      const hudBottom=hud?hud.bottom-rootRect.top:Math.min(78,rootRect.height*.12);
      const cueY=Math.min(rootRect.height-34,Math.max(hudBottom+46,rootRect.height*.16));
      cascade!.style.left=`${rootRect.width*.5}px`;
      cascade!.style.top=`${cueY}px`;
      if(reusingCue&&!reducedMotion){
        cascade!.style.animation='none';
        void cascade!.offsetWidth;
        cascade!.style.animation='';
      }
      if(this.coinPusherCascadeTimer!==undefined)window.clearTimeout(this.coinPusherCascadeTimer);
      const cue=cascade!;
      this.coinPusherCascadeTimer=window.setTimeout(()=>{
        if(this.coinPusherCascadeCue!==cue)return;
        cue.remove();
        this.coinPusherCascadeCue=undefined;
        this.coinPusherCascadeTimer=undefined;
      },reducedMotion?1800:1700);
    }
    const rewardLabels=coinPusherRewardFlightLabels(amount,reducedMotion);
    for(let index=0;index<rewardLabels.length;index+=1){
      const origin=reducedMotion?collectionCenter:origins?.[index];
      const start=origin&&Number.isFinite(origin.x)&&Number.isFinite(origin.y)
        ? origin
        : {x:rootRect.width*.5,y:rootRect.height*.72};
      const flyer=document.createElement('span');
      flyer.className=`coin-pusher-reward-fly${reducedMotion?' is-static':''}`;
      flyer.setAttribute('aria-hidden','true');
      const label=rewardLabels[index];
      flyer.innerHTML=`<i class="icon icon-coin"></i><b>${label}</b>`;
      flyer.style.left=`${start.x}px`;
      flyer.style.top=`${start.y}px`;
      const delayMs=flightPlan?.delaysMs[index]??0;
      if(!reducedMotion){
        flyer.style.setProperty('--coin-flight-x',`${targetX-start.x}px`);
        flyer.style.setProperty('--coin-flight-y',`${targetY-start.y}px`);
        flyer.style.animationDelay=`${delayMs}ms`;
      }
      root.append(flyer);
      flyer.addEventListener('animationend',()=>flyer.remove(),{once:true});
      window.setTimeout(()=>flyer.remove(),reducedMotion?1800:1450+delayMs);
    }
  }
  private animateCoinTrayCatch(count:number, origins?:CoinPusherRewardOrigin[]):number {
    const root=document.querySelector<HTMLElement>('#coin-pusher-root');
    if(!root)return Math.max(0,Math.floor(Number(count)||0));
    const reducedMotion=document.documentElement.classList.contains('reduced-motion')
      || (typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const validOrigins=origins?.filter((origin)=>Number.isFinite(origin.x)&&Number.isFinite(origin.y))??[];
    let catchLabel=this.coinPusherTrayCatchCue;
    const reusingCue=!!catchLabel&&catchLabel.isConnected&&catchLabel.parentElement===root;
    if(!reusingCue){
      if(this.coinPusherTrayCatchTimer!==undefined)window.clearTimeout(this.coinPusherTrayCatchTimer);
      this.coinPusherTrayCatchCount=0;
      this.coinPusherTrayCatchOriginX=0;
      this.coinPusherTrayCatchOriginY=0;
      this.coinPusherTrayCatchOriginCount=0;
      catchLabel=document.createElement('span');
      this.coinPusherTrayCatchCue=catchLabel;
      catchLabel.className='coin-pusher-tray-catch';
      catchLabel.setAttribute('aria-hidden','true');
    }
    this.coinPusherTrayCatchCount+=Math.max(0,Math.floor(Number(count)||0));
    for(const origin of validOrigins){
      this.coinPusherTrayCatchOriginX+=origin.x;
      this.coinPusherTrayCatchOriginY+=origin.y;
      this.coinPusherTrayCatchOriginCount+=1;
    }
    const center=this.coinPusherTrayCatchOriginCount
      ? {x:this.coinPusherTrayCatchOriginX/this.coinPusherTrayCatchOriginCount,
        y:this.coinPusherTrayCatchOriginY/this.coinPusherTrayCatchOriginCount}
      : {x:root.clientWidth*.5,y:root.clientHeight*.76};
    catchLabel!.classList.toggle('is-static',reducedMotion);
    catchLabel!.classList.toggle('is-cascade',this.coinPusherTrayCatchCount>1);
    catchLabel!.textContent=this.locale==='zh-HK'
      ? `跌入坑槽 ×${this.coinPusherTrayCatchCount}`
      : `IN THE PIT ×${this.coinPusherTrayCatchCount}`;
    catchLabel!.style.left=`${center.x}px`;
    // Lift the catch callout clear of the physical coin so both the tray landing and reward cue
    // remain readable in the same moment.
    const labelLift=Math.min(38,Math.max(20,root.clientHeight*.06));
    catchLabel!.style.top=`${Math.max(72,center.y-labelLift)}px`;
    if(reusingCue&&!reducedMotion){
      catchLabel!.style.animation='none';
      void catchLabel!.offsetWidth;
      catchLabel!.style.animation='';
    }
    if(!reusingCue)root.append(catchLabel!);
    if(this.coinPusherTrayCatchTimer!==undefined)window.clearTimeout(this.coinPusherTrayCatchTimer);
    const cue=catchLabel!;
    this.coinPusherTrayCatchTimer=window.setTimeout(()=>{
      if(this.coinPusherTrayCatchCue!==cue)return;
      cue.remove();
      this.coinPusherTrayCatchCue=undefined;
      this.coinPusherTrayCatchTimer=undefined;
      this.coinPusherTrayCatchCount=0;
      this.coinPusherTrayCatchOriginX=0;
      this.coinPusherTrayCatchOriginY=0;
      this.coinPusherTrayCatchOriginCount=0;
    },reducedMotion?900:980);
    if(!reducedMotion)this.coinPusherTrayCatchUntil=Math.max(this.coinPusherTrayCatchUntil,performance.now()+760);
    return this.coinPusherTrayCatchCount;
  }
  private animateCoinPusherTimingCue(landings:CoinPusherLandingFeedback[]) {
    const previousBest=this.coinPusherTimingStreak.best;
    this.coinPusherTimingStreak=advanceCoinPusherTimingStreak(
      this.coinPusherTimingStreak,landings.map((landing)=>landing.pusherBeat));
    if(this.coinPusherTimingStreak.best>previousBest)void this.persistCoinPusherSession();
    const bestNode=document.querySelector<HTMLElement>('#coinPusherTimingBest');
    if(bestNode)bestNode.textContent=this.coinPusherTimingBestCopy();
    const validLandings=landings.filter((landing)=>Number.isFinite(landing.x)&&Number.isFinite(landing.y));
    if(!validLandings.length)return;
    const forwardLandings=validLandings.filter((landing)=>landing.pusherBeat==='forward');
    const cueLandings=forwardLandings.length?forwardLandings:validLandings;
    const cueBeat=forwardLandings.length?'forward':cueLandings[cueLandings.length-1].pusherBeat;
    const root=document.querySelector<HTMLElement>('#coin-pusher-root');
    if(!root)return;
    const center=cueLandings.reduce((sum,landing)=>({x:sum.x+landing.x/cueLandings.length,
      y:sum.y+landing.y/cueLandings.length}),{x:0,y:0});
    const safeMargin=Math.min(104,root.clientWidth*.32);
    const cue=document.createElement('span');
    const streakLabel=coinPusherTimingStreakLabel(this.coinPusherTimingStreak.count,this.locale);
    const recordLabel=coinPusherTimingRecordLabel(this.coinPusherTimingStreak.count,previousBest,this.locale);
    const guidanceLabel=coinPusherTimingGuidanceLabel(cueBeat,this.locale);
    const reducedMotion=document.documentElement.classList.contains('reduced-motion')
      || (typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    cue.className=`coin-pusher-timing-cue${streakLabel?' is-streaking':''}${recordLabel?' is-new-best':''}${guidanceLabel?' is-guidance':''}${reducedMotion?' is-static':''}`;
    cue.dataset.beat=cueBeat;
    cue.dataset.streak=String(this.coinPusherTimingStreak.count);
    cue.dataset.bestStreak=String(this.coinPusherTimingStreak.best);
    cue.dataset.newBest=String(!!recordLabel);
    root.dataset.bestTimingStreak=String(this.coinPusherTimingStreak.best);
    cue.setAttribute('aria-hidden','true');
    cue.textContent=guidanceLabel??recordLabel??streakLabel??(this.locale==='zh-HK'
      ? `順勢接住${forwardLandings.length>1?` ×${forwardLandings.length}`:'！'}`
      : `NICE TIMING${forwardLandings.length>1?` ×${forwardLandings.length}`:''}`);
    cue.style.left=`${Math.max(safeMargin,Math.min(root.clientWidth-safeMargin,center.x))}px`;
    cue.style.top=`${Math.max(104,Math.min(root.clientHeight-54,center.y-34))}px`;
    root.querySelector('.coin-pusher-timing-cue')?.remove();
    root.append(cue);
    cue.addEventListener('animationend',()=>cue.remove(),{once:true});
    window.setTimeout(()=>cue.remove(),1000);
  }
  private syncCoinPusherControls() {
    const ready=this.coinPusherReady&&!this.coinPusherWebglLost&&!this.coinPusherInitFailed;
    const root=document.querySelector<HTMLElement>('#coin-pusher-root');
    if(root)root.setAttribute('aria-busy',String(!ready&&!this.coinPusherInitFailed));
    const overlay=root?.querySelector<HTMLElement>('.coin-pusher-webgl-overlay');
    if(overlay)overlay.hidden=!this.coinPusherWebglLost;
    const dropButton=document.querySelector<HTMLButtonElement>('.coin-pusher-drop');
    if(dropButton){
      const pending=!!this.coinPusherPendingDrop&&!this.coinPusherPendingDrop.applied;
      const canAfford=Number(this.state.wallet.balance) >= COIN_PUSHER_DROP_COST;
      const disabled=!ready||this.coinPusherBusy||this.coinPusherPersistenceFailed||(!pending&&!canAfford);
      dropButton.disabled=disabled;
      dropButton.classList.toggle('is-insufficient',ready&&!this.coinPusherBusy&&!pending&&!canAfford);
      dropButton.setAttribute('aria-disabled',String(disabled));
      const label=dropButton.querySelector<HTMLElement>('small span');
      const cost=dropButton.querySelector<HTMLElement>('small b');
      if(label)label.textContent=pending?(this.locale==='zh-HK'?'確認':'Resume'):(this.locale==='zh-HK'?'落幣':'Drop');
      if(cost)cost.textContent=pending?'↻':'−1';
      dropButton.setAttribute('aria-label',pending
        ?(this.locale==='zh-HK'?'安全確認已付落幣；不會再次扣金幣':'Safely resume paid drop; no second charge')
        :!canAfford
        ? (this.locale==='zh-HK'?'金幣不足；每次落幣需要 1 枚':'Not enough coins; each drop costs 1 coin')
        : (this.locale==='zh-HK'?'落幣，扣 1 金幣':'Drop a coin; costs 1 coin'));
      dropButton.title=pending
        ?(this.locale==='zh-HK'?'確認已付落幣，不會重複扣幣':'Resume the paid drop without charging twice')
        :!canAfford
        ? (this.locale==='zh-HK'?'金幣不足':'Not enough coins')
        : (this.locale==='zh-HK'?'落幣 −1；推出金幣回到錢包':'Drop −1; payout coins return to wallet');
    }
    const backButton=document.querySelector<HTMLButtonElement>('.coin-pusher-back');
    if(backButton){
      const blocked=this.coinPusherPaymentInFlight||this.coinPusherBusy;
      backButton.disabled=blocked;
      backButton.setAttribute('aria-disabled',String(blocked));
      backButton.title=blocked?this.coinPusherExitWaitMessage():(this.locale==='zh-HK'?'返回房間':'Back to room');
    }
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
    const pet=this.activePet()!; if(!this.canDress(pet)) return; const definition=this.state.catalog.wearables.find((item)=>item.id===wearableId)!;
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
  private destroyCoinPusher(preserveModel=false){
    if(preserveModel)void this.persistCoinPusherSession();
    if(this.coinPusherAutosaveTimer!==undefined)window.clearInterval(this.coinPusherAutosaveTimer);
    this.coinPusherAutosaveTimer=undefined;
    if(!preserveModel)this.coinPusherGeneration+=1;
    if(this.coinPusherCooldown!==undefined)window.clearTimeout(this.coinPusherCooldown);
    this.coinPusherCooldown=undefined;
    this.coinPusherBusy=false;
    this.coinPusherCascade={count:0,lastAt:0};
    if(this.coinPusherCascadeTimer!==undefined)window.clearTimeout(this.coinPusherCascadeTimer);
    this.coinPusherCascadeTimer=undefined;
    this.coinPusherCascadeCue?.remove();
    this.coinPusherCascadeCue=undefined;
    this.coinPusherTimingStreak={count:0,best:this.coinPusherTimingStreak.best};
    if(this.coinPusherTrayCatchTimer!==undefined)window.clearTimeout(this.coinPusherTrayCatchTimer);
    this.coinPusherTrayCatchTimer=undefined;
    this.coinPusherTrayCatchCue?.remove();
    this.coinPusherTrayCatchCue=undefined;
    this.coinPusherTrayCatchCount=0;
    this.coinPusherTrayCatchOriginX=0;
    this.coinPusherTrayCatchOriginY=0;
    this.coinPusherTrayCatchOriginCount=0;
    this.coinPusherTrayCatchUntil=0;
    this.coinPusherRewardVisualNextAt=0;
    if(this.coinPusherView){
      if(preserveModel)this.coinPusherModel=this.coinPusherView.model;
      this.coinPusherView.destroy(preserveModel);
      this.coinPusherView=undefined;
      this.coinPusherInitPending=false;
    }else if(!preserveModel){
      this.coinPusherModel?.destroy();
      this.coinPusherModel=undefined;
      this.coinPusherInitPending=false;
    }
    if(!preserveModel)this.coinPusherPlays=[];
    this.coinPusherReady=false;
    this.coinPusherWebglLost=false;
    this.coinPusherInitFailed=false;
    document.querySelector('#coin-pusher-room-backdrop')?.remove();
    const root=document.querySelector<HTMLElement>('#coin-pusher-root');
    if(root)root.style.display='none';
  }
  private updateWallet(){const balance=this.state.wallet.balance.toLocaleString();this.setValue('#coinBalance',balance);this.setValue('#coinBalanceHud',balance);this.syncCoinPusherControls();}
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
            <p class="eyebrow">TEACHER COIN CENTRE</p>
            <h1 id="grantHeading">${this.t('teacherTitle')}</h1>
            <p class="caution">${zh?'老師可在這裏發放金幣；推銀仔每次落幣扣 1 枚，推出的金幣會回到學生錢包。發放後不能撤回，確認前請核對「人數 × 每人金額 = 總額」。':'Teachers issue coins here; each coin-pusher drop costs 1 coin, and payout coins return to the student wallet. Grants cannot be undone, so check students × coins each = total.'}</p>
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
    const say = (key: string) => (window as any).BuiI18n.t(key) as string;
    app.innerHTML = `<main class="fatal-screen"><span>🥚</span><h1>${escapeHtml(say('pet.fatalTitle'))}</h1><p>${escapeHtml((error as Error).message)}</p><a href="/">${escapeHtml(say('pet.backHome'))}</a></main>`;
  }
}
boot();
