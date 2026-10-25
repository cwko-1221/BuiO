import Phaser from 'phaser';
import './park.css';
import { WORLD, ZONES, OBJECTS, QUESTS, CLUES, activityModes, dailyQuests, interactionPoint, zoneAt, walkable, clearLine, type ParkObject, type ParkQuest } from '../../lib/park-world.mjs';
import type { Bootstrap, Identity } from '../types';
import type { ParkJoin, ParkProgress, ParkResult } from './types';
import { ParkClient } from './client';
import { ParkScene } from './scene';
import { npcArtKey, drawWorldMiniMap } from './world-art';
import { audio } from '../audio';
import { lockGameBrowserInteractions } from '../game/GameBrowserInteractions';
import { ParkActivity } from './activities';
import { ParkMiniGame } from './mini-games';
import {ParkLeisureGame} from './leisure-games';
import {ParkVenue} from './venue';
import {GAME_RULES} from '../../lib/park-games.mjs';
import {LEISURE_RULES,type LeisureKind} from '../../lib/park-leisure.mjs';
import {SCENE_PROJECTS} from '../../lib/park-projects.mjs';
import { ParkSocial } from './social';
import { ParkGarden } from './garden';
import { petForDisplay } from '../game/petDisplay';
import './release.css';
import {PARK_ECONOMY} from '../../lib/park-economy.mjs';
import {ParkMarket} from './market';
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
interface Options { home(): void; retry(): void; wallet(balance: number): void; online(): { id: string; name: string; className: string }[] }
export class ParkController {
  client = new ParkClient();
  game?: Phaser.Game;
  scene?: ParkScene;
  progress?: ParkProgress;
  dailyCap = PARK_ECONOMY.defaultDailyCap;
  locked = false;
  activity?: ParkActivity;
  miniGame?: ParkMiniGame|ParkLeisureGame;
  private venue?:ParkVenue;
  social?: ParkSocial;
  garden?: ParkGarden;
  market?:ParkMarket;
  private abort = new AbortController();
  private observer?: ResizeObserver;
  private mapTimer?: number;
  private actionTimer?: number;
  private actionResolve?: () => void;
  private closed = false;
  private busy = false;
  private sceneReady = false;
  private loadFailed = false;
  private near?: ParkObject;
  private currentNpc?: ParkObject;
  private drawer = '';
  private joystickPointer?: number;
  private releaseBrowser?: () => void;
  private lastFocus?: HTMLElement;
  private liveTimer?: number;
  private trackedQuest?: string;
  constructor(private host: HTMLElement, private bootstrap: Bootstrap, private identity: Identity, private options: Options) {}
  private t(zh: string, en: string) { return this.identity.language === 'en-US' ? en : zh; }
  private name(value: { 'zh-HK': string; 'en-US': string }) { return value[this.identity.language] || value['zh-HK']; }
  async open() {
    this.host.className = 'park-root';
    this.host.innerHTML = `<div class="park-canvas" data-park-canvas></div>
      <div class="park-hud">
        <div class="park-heading"><span class="park-eyebrow">PET TOWN · BUIO</span><strong data-park-zone>${this.t('家園小徑', 'Home Lane')}</strong><span class="park-live" data-park-live>${this.t('正在進入樂園', 'Entering the park')}</span></div>
        <div class="park-overview"><button class="park-map-button" data-park="map" aria-label="${this.t('開啟樂園地圖', 'Open park map')}"><canvas data-park-map width="220" height="154"></canvas><span>${this.t('樂園地圖', 'Park map')} ↗</span></button><button class="park-peer-button" data-park="peers"><span class="park-online-dot"></span><span data-park-count>${this.t('同學', 'Classmates')}</span></button></div>
        <button class="park-objective" data-park="quests"><span class="park-objective-icon">✦</span><span><small>${this.t('今日的小冒險', 'TODAY’S LITTLE ADVENTURE')}</small><b data-park-objective>${this.t('找 NPC 聊聊，開始探索', 'Meet an NPC and start exploring')}</b></span><span class="park-objective-count" data-park-progress>0/3</span></button>
        <div class="park-bottom-tools"><button data-park="home" aria-label="${this.t('回到我的房間', 'Go home')}">⌂ <span>${this.t('回家', 'Home')}</span></button><button data-park="quests">☷ <span>${this.t('委託', 'Requests')}</span></button><button data-park="games">✦ <span>${this.t('遊戲', 'Games')}</span></button><button data-park="community">❀ <span>${this.t('共建', 'Together')}</span></button><button data-park="bag">♧ <span>${this.t('背包','Bag')}</span></button><button data-park="emotes">☺ <span>${this.t('表情', 'Emotes')}</span></button></div>
        <p class="park-hint" data-park-hint>${this.t('點地面走動 · 點人物或物件互動 · 方向鍵 / WASD', 'Tap to walk · Tap a character or object · Arrows / WASD')}</p>
        <div class="park-joystick" data-park-stick role="group" aria-label="${this.t('拖曳控制方向', 'Drag to move')}"><span class="park-stick-arrows">＋</span><i></i></div>
        <button class="park-interact" data-park="interact" hidden><span>✧</span><b data-park-interact-label></b><kbd>E</kbd></button>
        <div class="park-action-progress" hidden><span></span><b>${this.t('正在互動…', 'Interacting…')}</b></div>
      </div>
      <div class="park-loading" data-park-loading><div class="park-loading-leaf">✦</div><h2>${this.t('門外有個大世界', 'A big world outside your door')}</h2><p data-park-loading-message>${this.t('正在準備你和同學的樂園…', 'Preparing your shared park…')}</p><div><button data-park="retry" class="primary" hidden>${this.t('重新進入', 'Try again')}</button><button data-park="home" class="secondary">${this.t('回房間', 'Go home')}</button></div></div>
      <div class="park-drawer-root"></div><div class="park-dialog-root"></div><p class="park-notice" role="status" aria-live="polite" hidden></p>`;
    this.social = new ParkSocial({ host: this.host, client: this.client, language: this.identity.language,
      onBusy: busy => { if (busy) { this.garden?.close(); this.closePanels(false); this.venue?.destroy(); this.venue=undefined; this.activity?.destroy(); this.activity = undefined; this.miniGame?.destroy(); this.miniGame = undefined; this.releaseStick(); } this.updateInputBlock(); },
      onNotice: message => this.notice(message), onEffect: effect => this.scene?.socialEffect(effect.members),
      onWalkToPeer: id => this.walkToPeer(id),
      portrait: id => { const peer = this.client.peers.find(p => p.id === id), definition = peer && this.bootstrap.catalog.pets.find(p => p.id === peer.pet.speciesId); return peer && definition ? definition.art[petForDisplay(peer.pet).stage - 1] : undefined; },
    });
    this.garden = new ParkGarden({ host: this.host, client: this.client, language: this.identity.language,
      onBusy: busy => { if (busy) { this.closePanels(false); this.social?.closeNearby(); this.venue?.destroy(); this.venue=undefined; this.activity?.destroy(); this.activity = undefined; this.miniGame?.destroy(); this.miniGame = undefined; this.releaseStick(); } this.updateInputBlock(); },
      onNotice: message => this.notice(message), onState: state => this.scene?.setGardenState(state),
      onWalkToPlot: id => this.scene?.walkToGarden(id),
    });
    this.market=new ParkMarket({host:this.host,client:this.client,english:this.identity.language==='en-US',onBusy:()=>{if(this.market?.isOpen){this.closePanels(false);this.garden?.close();this.social?.closeNearby();this.releaseStick();}this.updateInputBlock();},onNotice:m=>this.notice(m),onResult:r=>this.result(r),onBag:b=>{if(this.sceneReady)this.scene?.setBag(b)},onWalk:id=>this.scene?.walkToObject(id),onLitter:(id,p)=>this.scene?.walkToLitter(id,p)});
    this.releaseBrowser = lockGameBrowserInteractions('pet-park-playing');
    const signal = this.abort.signal;
    this.host.addEventListener('click', event => this.click(event), { signal });
    window.addEventListener('keydown', event => this.keydown(event), { signal });
    window.addEventListener('blur', () => this.releaseStick(), { signal });
    document.addEventListener('visibilitychange', () => { this.releaseStick(); if (document.hidden) this.scene?.setBlocked(true); else if (!this.drawer && !this.currentNpc && !this.busy && !this.activity && !this.miniGame && !this.locked && this.client.ready) this.updateInputBlock(); }, { signal });
    this.bindStick();
    this.client.addEventListener('join', event => this.joined((event as CustomEvent<ParkJoin>).detail), { signal });
    this.client.addEventListener('connection', () => this.connection(), { signal });
    this.client.addEventListener('roster', () => { this.updateCount(); if (this.drawer === 'peers') this.showPeers(); }, { signal });
    this.client.addEventListener('error', event => { this.notice((event as CustomEvent<string>).detail); if (!this.client.ready) this.connection(); }, { signal });
    this.client.addEventListener('day', event => {
      if (this.progress && (event as CustomEvent<string>).detail !== this.progress.day) void this.client.request('park:state', {}).then(result => this.result(result)).catch(error => this.notice(error.message));
    }, { signal });
    this.mapTimer = window.setInterval(() => this.drawMap(), 250);
    await this.client.start().catch(error => { this.notice(error.message); this.connection(); });
    (window as any).__petPark = this;
  }
  private joined(result: ParkJoin) {
    if (this.closed) return; this.result(result);
    if (result.garden) this.garden?.setState(result.garden);
    if (this.game) { this.updateInputBlock(); this.connection(); return; }
    const root = this.host.querySelector<HTMLElement>('[data-park-canvas]')!;
    this.game = new Phaser.Game({
      type: Phaser.AUTO, parent: root, backgroundColor: '#c6d8a9', audio: { noAudio: true }, render: { antialias: true, pixelArt: false },
      scale: { mode: Phaser.Scale.RESIZE, width: root.clientWidth, height: root.clientHeight, autoCenter: Phaser.Scale.CENTER_BOTH },
      fps: { target: 60 },
    });
    const start = () => {
      if (this.closed) return;
      const scene = new ParkScene(); this.scene = scene;
      this.game!.scene.add('Park', scene, true, {
        bootstrap: this.bootstrap, identity: this.identity, client: this.client, progress: result.state,
        onObject: (object: ParkObject) => void this.interact(object),
        onPeer: (id: string) => { if (!this.social?.isOpen && !this.garden?.isOpen && !this.busy && !this.activity && !this.miniGame) { this.closePanels(false); this.social?.openNearby(id); } },
        onLitter:(id:string)=>void this.market?.pick(id),
        onPlot: (id: string) => { if (!this.social?.isOpen && !this.garden?.isOpen && !this.busy && !this.activity && !this.miniGame) this.garden?.open(id); },
        onNear: (object?: ParkObject) => this.setNear(object),
        onZone: (id: string) => { const zone = ZONES.find(z => z.id === id); this.host.querySelector('[data-park-zone]')!.textContent = zone ? this.name(zone.name) : ''; },
        onError: (message: string) => this.notice(message),
        onFailed: (message:string) => { this.loadFailed=true; this.sceneReady=false; this.host.querySelector<HTMLElement>('[data-park-loading]')!.hidden=false; this.host.querySelector<HTMLElement>('[data-park-loading-message]')!.textContent=message; this.host.querySelector<HTMLButtonElement>('[data-park="retry"]')!.hidden=false; },
        onReady: () => { this.sceneReady = true; if(this.market?.state)scene.setBag(this.market.state); if (this.garden?.state) scene.setGardenState(this.garden.state); this.connection(); },
        trackedQuest: this.trackedQuest,
      });
    };
    if (this.game.isBooted) start(); else this.game.events.once(Phaser.Core.Events.READY, start);
    this.observer = new ResizeObserver(() => { if (root.clientWidth && root.clientHeight && !this.closed) this.game?.scale.resize(root.clientWidth, root.clientHeight); });
    this.observer.observe(root); this.updateCount();
  }
  private connection() {
    if (this.closed) return;
    const ready = this.client.ready && this.sceneReady && !this.locked;
    this.host.querySelector<HTMLElement>('[data-park-loading]')!.hidden = ready;
    this.host.querySelector<HTMLElement>('[data-park-live]')!.textContent = ready ? this.t('與同學一起探索', 'Explore with your classmates') : this.t('正在連接樂園…', 'Connecting to the park…');
    this.host.querySelector<HTMLButtonElement>('[data-park="retry"]')!.hidden = this.client.ready && !this.loadFailed;
    if (!ready) { this.market?.close(); this.garden?.close(); this.venue?.destroy(); this.venue=undefined; this.activity?.destroy(); this.activity = undefined; this.miniGame?.destroy(); this.miniGame = undefined; this.scene?.setBlocked(true); this.releaseStick(); }
    else if (!this.drawer && !this.currentNpc && !this.busy && !this.activity && !this.miniGame) this.updateInputBlock();
    if (!this.client.connected) this.host.querySelector('[data-park-loading-message]')!.textContent = this.t('連線中斷，已儲存的任務進度會保留。', 'Connection lost. Your saved request progress is safe.');
  }
  private result(result: ParkResult) {
    if(result.bag)this.market?.update(result.bag);
    if (this.closed || this.progress && result.state.day < this.progress.day) return;
    this.progress = result.state; this.dailyCap = result.dailyCap;
    if (result.balance !== undefined) this.options.wallet(result.balance);
    this.scene?.setProgress(result.state);
    const daily = dailyQuests(result.state.day), completed = daily.filter(q => result.state.quests[q.id]?.completedAt).length;
    this.host.querySelector('[data-park-progress]')!.textContent = `${completed}/3`;
    const tracked = sessionStorage.getItem(`park-quest:${this.identity.id}:${result.state.day}`);
    const active = QUESTS.find(q => q.id === tracked && result.state.quests[q.id] && !result.state.quests[q.id].completedAt) || QUESTS.find(q => result.state.quests[q.id] && !result.state.quests[q.id].completedAt);
    this.trackedQuest = active?.id; this.scene?.trackQuest(active?.id);
    this.host.querySelector('[data-park-objective]')!.textContent = active ? this.name(active.name) : completed === 3 ? this.t('精選已完成！還有更多委託與遊戲', 'Featured requests done! More adventures await') : this.t(`${QUESTS.length} 個委託 · 找 NPC 開始冒險`, `${QUESTS.length} requests · Meet an NPC to begin`);
    if (result.earned) this.notice(this.t(`獲得 ${result.earned} 枚金幣！${result.bonus ? '已包含今日完成獎勵。' : ''}`, `You earned ${result.earned} coins!${result.bonus ? ' Daily bonus included.' : ''}`));
    else if (result.advanced?.length) this.notice(this.t('委託進度更新了！', 'Request progress updated!'));
    if (this.drawer === 'quests') this.showQuests();
  }
  private setNear(object?: ParkObject) {
    this.near = object;
    const button = this.host.querySelector<HTMLButtonElement>('[data-park="interact"]')!;
    button.hidden = !object; this.host.querySelector('[data-park-interact-label]')!.textContent = object ? this.name(object.name) : '';
  }
  private async interact(object: ParkObject,choice?:string) {
    if (this.busy || this.closed || this.locked || !this.client.ready || this.activity || this.miniGame || this.venue || this.social?.isOpen || this.garden?.isOpen) return;
    if(object.id==='merchant'||object.id==='eco'){this.market?.open(object.id);return;}
    if(object.id==='apple'||object.kind==='flowers'){if(!choice){this.scene?.setBlocked(true);this.releaseStick();this.venue=new ParkVenue(this.host,this.name(object.name),[{id:'gather',label:this.t(object.id==='apple'?'採收蘋果，放進背包':'採收鮮花，放進背包','Gather into your bag')},{id:'original',label:this.t(object.id==='apple'?'調查果樹與原有活動':'替花圃澆水與原有活動','Original activities & clues')}],this.identity.language==='en-US',id=>void this.interact(object,id),()=>{this.venue=undefined;this.updateInputBlock();});return;}if(choice==='gather'){this.market?.open(object.id);return;}if(choice==='original')choice=undefined;}
    if (object.kind === 'house') return this.options.home();
    if (object.kind === 'board') return this.showQuests();
    if(object.games?.length&&this.game&&this.progress){
      const modes=activityModes(object,this.progress),choices=[...object.games.map(id=>({id,label:LEISURE_RULES[id].name[this.identity.language]})),...modes.map(id=>({id,label:this.t('尋找藏起的包裹','Search for the hidden parcel')}))];
      if(CLUES[object.id]||object.kind==='bench')choices.push({id:'visit',label:this.t(CLUES[object.id]?'查看線索與調查水源':'坐下休息，看看四周',CLUES[object.id]?'Read the clues and inspect the water':'Rest here and look around')});
      if(!choice&&choices.length>1){this.closePanels(false);this.scene?.setBlocked(true);this.releaseStick();this.venue=new ParkVenue(this.host,this.name(object.name),choices,this.identity.language==='en-US',id=>void this.interact(object,id),()=>{this.venue=undefined;this.updateInputBlock();});return;}
      const kind=(choice||object.games[0])as LeisureKind;
      if(object.games.includes(kind)){this.closePanels(false);this.scene?.setBlocked(true);this.releaseStick();const pet=this.client.peers.find(p=>p.id===this.client.selfId)?.pet;if(!pet)return;
        this.miniGame=new ParkLeisureGame(this.host,kind,{game:this.game,bootstrap:this.bootstrap,pet,client:this.client,progress:this.progress,english:this.identity.language==='en-US',objectId:object.id,journal:this.market?.state?.journal,onResult:r=>this.result(r),onClose:()=>{this.miniGame=undefined;this.updateInputBlock();}});return;}
    }
    if (object.game && this.game && this.progress) {
      this.closePanels(false); this.scene?.setBlocked(true); this.releaseStick();
      const pet = this.client.peers.find(p => p.id === this.client.selfId)?.pet; if (!pet) return;
      this.miniGame = new ParkMiniGame(this.host, object.game, { game: this.game, bootstrap: this.bootstrap, pet, client: this.client, progress: this.progress, english: this.identity.language === 'en-US', onResult: result => this.result(result), onClose: () => { this.miniGame = undefined; if (!this.locked && this.client.ready) this.updateInputBlock(); } }); return;
    }
    if (choice!=='visit'&&this.progress && activityModes(object, this.progress).length) {
      this.closePanels(false); this.scene?.setBlocked(true); this.releaseStick();
      this.activity = new ParkActivity(this.host, this.client, object, this.progress, this.identity.language === 'en-US', result => this.result(result), () => { this.activity = undefined; if (!this.locked && this.client.ready) this.updateInputBlock(); },choice); return;
    }
    this.busy = true; this.scene?.setBlocked(true); this.releaseStick();
    const progress = this.host.querySelector<HTMLElement>('.park-action-progress')!;
    try {
      const { ticket } = await this.client.request<{ ticket: { id: string; dueAt: number } }>('park:begin', { objectId: object.id });
      if (this.closed) return;
      progress.hidden = false; progress.classList.remove('running'); void progress.offsetWidth; progress.classList.add('running');
      this.scene?.playAction(object.kind === 'flowers' ? 'play' : 'happy');
      await new Promise<void>(resolve => { this.actionResolve = resolve; this.actionTimer = window.setTimeout(resolve, 1100); });
      this.actionResolve = undefined;
      if (this.closed || this.locked) return;
      const result = await this.client.request('park:finish', { ticketId: ticket.id });
      this.result(result); audio.sfx('tap');
      if (object.kind === 'npc') this.showNpc(object);
      else if (!result.advanced?.length && !result.claimed?.length) this.notice(this.objectMessage(object));
    } catch (error) { this.notice((error as Error).message); }
    finally { this.busy = false; progress.hidden = true; if (!this.closed && !this.drawer && !this.currentNpc && !this.locked) this.updateInputBlock(); }
  }
  private objectMessage(object: ParkObject) {
    if (CLUES[object.id]) return this.name(CLUES[object.id]);
    const messages: Record<string, [string, string]> = {
      bench: ['坐下來，看看樂園裏的新朋友。', 'Take a seat and watch the park go by.'], flowers: ['花兒喝飽水，精神起來了！', 'The flowers look happy after a drink!'],
      fountain: ['小小的願望，隨水花閃閃發亮。', 'A little wish sparkles in the fountain.'], apple: ['聞到清甜的蘋果香了！', 'The apples smell sweet!'],
      pond: ['睡蓮旁有小魚游過。', 'A little fish swims past the lilies.'], mushrooms: ['蘑菇在葉影下閃着微光。', 'The mushrooms glimmer beneath the leaves.'],
      hollow: ['你好——樹洞也回了一聲你好！', 'Hello! The tree echoes your greeting.'], sign: ['記住這個路標，下次就認得路了。', 'Remember this marker for your next visit.'],
      chime: ['叮鈴——風也加入了小樂隊。', 'Ting! The breeze joins the little band.'], drum: ['咚咚！附近的同學也聽到你的節奏。', 'Boom! Your classmates can see your beat.'],
      bell: ['清脆的鐘聲，送給今天的好朋友。', 'A bright bell for your friends today.'], mailbox: ['信箱裏裝滿等待出發的好消息。', 'The mailbox is full of good news.'],
      acorn: ['找到一顆漂亮的橡果。栗栗一定會喜歡。', 'A lovely acorn! Pip would love it.'], litter: ['步道又乾淨了一點，謝謝你！', 'The trail looks a little tidier. Thank you!'],
    };
    const message = messages[object.kind]; return message ? this.t(...message) : this.t('發現了樂園的小驚喜。', 'A little park discovery.');
  }
  private openDrawer(title: string, body: string, type: string) {
    this.drawer = type; this.currentNpc = undefined; this.host.querySelector('.park-dialog-root')!.innerHTML = '';
    this.scene?.setBlocked(true); this.releaseStick();
    if (!this.lastFocus) this.lastFocus = document.activeElement as HTMLElement;
    this.host.querySelector('.park-drawer-root')!.innerHTML = `<div class="park-drawer-backdrop" data-park="close"><section class="park-drawer" role="dialog" aria-modal="true" aria-labelledby="parkDrawerTitle"><header><div><small>PET TOWN</small><h2 id="parkDrawerTitle">${title}</h2></div><button data-park="close" aria-label="${this.t('關閉', 'Close')}">×</button></header>${body}</section></div>`;
    this.host.querySelector<HTMLButtonElement>('.park-drawer header button')?.focus();
  }
  private showQuests() {
    if (!this.progress) return;
    const state = this.progress;
    const featured = dailyQuests(state.day), others = QUESTS.filter(q => !featured.some(f => f.id === q.id));
    this.openDrawer(this.t('樂園冒險手帳', 'Park adventure journal'), `<p class="park-drawer-intro">${this.t('14 個委託、尋物、解謎與多款小遊戲。先到 NPC 身旁接受，再完成活動。', '14 requests, searches, puzzles and mini-games. Meet an NPC to accept, then complete the activities.')}<br><b>${this.t(`今日已獲 ${state.earned} / ${this.dailyCap} 枚金幣`, `${state.earned} / ${this.dailyCap} coins earned today`)}</b></p><div class="park-journal-tools"><button data-park="notebook">⌕ ${this.t('線索筆記', 'Clue notebook')}</button><button data-park="games">✦ ${this.t('小遊戲', 'Mini-games')}</button></div><h3 class="park-journal-heading">${this.t(`今日精選 · 完成三個額外 +${PARK_ECONOMY.featuredBonus}`, `Featured today · Finish three for +${PARK_ECONOMY.featuredBonus}`)}</h3><div class="park-quest-list">${featured.map(q => this.questCard(q, state)).join('')}</div><details class="park-more-quests" ${others.some(q => state.quests[q.id] && !state.quests[q.id].completedAt) ? 'open' : ''}><summary>${this.t(`更多冒險 · ${others.length} 個委託`, `More adventures · ${others.length} requests`)}</summary><div class="park-quest-list">${others.map(q => this.questCard(q, state)).join('')}</div></details><p class="park-drawer-foot">${this.t('全部委託隨時可接。精選完成獎勵、委託與遊戲金幣合計不超過老師設定的每日上限。每天香港時間午夜更新。', 'Every request is available. Featured bonuses, requests and games share the daily limit set by your teacher. Resets at midnight Hong Kong time.')}</p>`, 'quests');
  }
  private questCard(quest: ParkQuest, state: ParkProgress) {
    const progress = state.quests[quest.id], complete = !!progress?.completedAt;
    const next = !progress ? quest.npc : quest.steps.find(id => !progress.steps.includes(id)) || quest.npc;
    const npc = OBJECTS.find(o => o.id === quest.npc)!;
    return `<article class="park-quest-card ${complete ? 'complete' : ''}"><div class="park-quest-meta"><span>${esc(this.name(npc.name))}</span><b>${complete ? '✓' : '+' + quest.reward + ' 🪙'}</b></div><h3>${esc(this.name(quest.name))}</h3><p>${esc(this.name(quest.description))}</p><div class="park-step-list">${quest.steps.map(id => { const object = OBJECTS.find(o => o.id === id)!; return `<span class="${progress?.steps.includes(id) ? 'done' : ''}">${progress?.steps.includes(id) ? '✓' : '○'} ${esc(this.name(object.name))}</span>`; }).join('')}</div><button data-park="guide" data-quest="${quest.id}" data-object="${next}" ${complete ? 'disabled' : ''}>${complete ? this.t(`已完成 · ${progress.earned} 金幣`, `Completed · ${progress.earned} coins`) : !progress ? this.t('去找 NPC 接委託', 'Meet the NPC') : next === quest.npc ? this.t('回去交付委託', 'Return to your friend') : this.t('追蹤委託，帶我去下一站', 'Track and walk to the next stop')} <span>→</span></button></article>`;
  }
  private showNpc(object: ParkObject) {
    this.closePanels(false); this.currentNpc = object; this.scene?.setBlocked(true);
    const quests = this.progress ? QUESTS.filter(q => q.npc === object.id) : [];
    this.host.querySelector('.park-dialog-root')!.innerHTML = `<div class="park-dialog-backdrop"><section class="park-dialog" role="dialog" aria-modal="true" aria-labelledby="parkNpcTitle"><button class="park-dialog-close" data-park="close" aria-label="${this.t('關閉', 'Close')}">×</button><span class="park-npc-portrait ${object.species}"></span><div class="park-npc-copy"><small>${object.role ? esc(this.name(object.role)) : ''}</small><h2 id="parkNpcTitle">${esc(this.name(object.name))}</h2><p>${object.line ? esc(this.name(object.line)) : ''}</p>${quests.map(q => {
      const p = this.progress!.quests[q.id];
      return `<div class="park-npc-request"><b>${esc(this.name(q.name))}</b><p>${esc(this.name(q.description))}</p>${!p ? `<button class="primary" data-park="accept" data-quest="${q.id}">${this.t('接受委託', 'Accept request')} · ${q.reward} 🪙</button>` : p.completedAt ? `<span class="park-complete">✓ ${this.t('謝謝你的幫忙！', 'Thank you for helping!')}</span>` : `<button class="primary" data-park="guide" data-quest="${q.id}" data-object="${q.steps.find(id => !p.steps.includes(id)) || q.npc}">${this.t('繼續委託', 'Continue request')} · ${p.steps.length}/${q.steps.length}</button>`}</div>`;
    }).join('')}<button class="park-text-button" data-park="close">${this.t('待會見，繼續逛逛', 'See you! Keep exploring')} →</button></div></section></div>`;
    const source = this.scene?.textures.get(npcArtKey(object.species!)).getSourceImage();
    if (source instanceof HTMLCanvasElement || source instanceof HTMLImageElement) {
      const portrait = this.host.querySelector<HTMLElement>('.park-npc-portrait')!, canvas = document.createElement('canvas');
      const size = Math.min(source.width, source.height);
      canvas.width = canvas.height = 128; canvas.getContext('2d')?.drawImage(source, 0, 0, size, size, 0, 0, 128, 128);
      portrait.classList.add('has-art'); portrait.append(canvas);
    }
    this.host.querySelector<HTMLButtonElement>('.park-dialog .primary, .park-dialog-close')?.focus();
  }
  private showPeers() {
    this.closePanels(false); this.social?.openNearby();
  }
  private walkToPeer(id: string) {
    const peer = this.client.frames.get(id); if (!peer) return;
    const target = [[-140, 0], [140, 0], [0, 150], [0, -150], [-100, 100], [100, 100]].map(([x, y]) => ({ x: peer.x + x, y: peer.y + y })).find(p => walkable(p.x, p.y) && clearLine(peer, p)) || peer;
    this.scene?.walk(target.x, target.y);
  }
  private updateInputBlock() {
    this.scene?.setBlocked(this.closed || this.locked || document.hidden || !this.client.ready || !!this.drawer || !!this.currentNpc || this.busy || !!this.activity || !!this.miniGame || !!this.venue || !!this.social?.isOpen || !!this.garden?.isOpen || !!this.market?.isOpen);
  }
  private showMap() {
    this.openDrawer(this.t('溪畔樂園地圖', 'The riverside park'), `<p class="park-drawer-intro">${this.t('溪流兩岸各有不同風景。北面的木橋連接森林與花園，南面的石橋通往家園與噴泉廣場。選一區即可沿步道前往，也可用方向鍵自由探索。', 'Two bridges join the riverbanks: the northern wooden bridge connects the woods and garden; the southern stone bridge connects home and the fountain plaza. Choose a district to walk there, or explore with the arrow keys.')}</p><canvas class="park-big-map" data-park-map width="440" height="308"></canvas><p class="park-map-legend">● ${this.t('你', 'You')}　<span>●</span> ${this.t('同學', 'Classmates')}　✦ ${this.t('小遊戲', 'Mini-games')}</p><div class="park-zone-list">${ZONES.map(zone => `<button data-park="zone" data-zone="${zone.id}"><span>${({ home: '⌂', plaza: '✦', garden: '❀', forest: '♧' })[zone.id]}</span><b>${esc(this.name(zone.name))}</b><small>${this.t('沿主路前往', 'Follow the main path')} →</small></button>`).join('')}</div>`, 'map'); this.drawMap();
  }
  private showNotebook() {
    if (!this.progress) return;
    this.openDrawer(this.t('我的線索筆記', 'My clue notebook'), `<p class="park-drawer-intro">${this.t('親自調查過的線索會留在這裡。找齊三枚符號，再到樹洞試試。', 'Clues you investigate are kept here. Collect three symbols, then visit the echo tree.')}</p><div class="park-notebook">${Object.entries(CLUES).map(([id, clue]) => `<article><b>${esc(this.name(OBJECTS.find(o => o.id === id)!.name))}</b><p>${this.progress!.discoveries?.includes(id) ? esc(this.name(clue)) : this.t('尚未調查 · 到現場看看', 'Not investigated · Visit this place')}</p><button data-park="guide" data-object="${id}">${this.t('帶我前往', 'Take me there')} →</button></article>`).join('')}</div>`, 'notebook');
  }
  private showGames() {
    const descriptions:Record<string,[string,string]>={fishing:['60 秒 · 拋竿、看咬鉤、控制張力，發現六種小魚','60s · Cast, hook and balance the line; discover six fish'],rhythm:['30 秒 · 四軌節奏，跟着音符敲鼓','30s · Four visible note lanes; drum to the beat'],lantern:['三組點燈邏輯謎題，讓九盞燈全部亮起','Three logic boards; switch all nine lanterns on'],golf:['三個不同球洞 · 拖曳蓄力、反彈過木欄','Three holes · Drag to aim and bounce around bumpers'],banana:['45 秒 · 接住香蕉，躲開橡果','45s · Catch bananas and avoid acorns'],flight:['60 秒 · 三款飛行器、補給與三階段頭目','60s · Three aircraft, supplies and a three-stage boss']};
    const cards=Object.entries(GAME_RULES).map(([kind,rule])=>{const object=OBJECTS.find(o=>o.game===kind||o.games?.includes(kind as LeisureKind))!;return '<article class="park-quest-card"><small>'+kind.toUpperCase()+'</small><h3>'+this.name(rule.name)+'</h3><p>'+this.t(...descriptions[kind])+'</p><b>'+this.t('今日最高 ','TODAY’S BEST ')+(this.progress?.games[kind]?.best||0)+'</b><button data-park="guide" data-object="'+object.id+'">'+this.t('帶我去玩','Walk to play')+' →</button></article>';}).join('');
    this.openDrawer(this.t('樂園遊戲手冊','Park Game Journal'),'<p class="park-drawer-intro">'+this.t('六款獨立遊戲，各有不同操作。另有風鈴記憶、森林迷宮、找物、接水道與日常照顧。每款遊戲每日首次達標 +8 金幣，與委託共用每日上限。','Six standalone games with different controls, plus chime memory, a woodland maze, hidden objects and waterworks. First daily goals earn 8 coins within the shared daily limit.')+'</p><div class="park-quest-list">'+cards+'<article class="park-quest-card"><small>EXPLORE / MAZE</small><h3>'+this.t('森林郵差迷宮','Woodland Courier Maze')+'</h3><p>'+this.t('老樹洞裏，帶小郵差走過樹籬把信送到出口。','Guide the little courier through the echo-tree hedges.')+'</p><button data-park="guide" data-object="hollow">'+this.t('前往樹洞','Visit the echo tree')+' →</button></article></div>','games');
  }
  private showCommunity(){
    const state=this.garden?.state;this.openDrawer(this.t('全班共建樂園','Build Our Park Together'),`<p class="park-drawer-intro">${this.t('種花之外，還能一起改變木橋、睡蓮池和願望鐘的景色。每次幫忙都會放上真實裝飾，全班同步看見。每天香港時間午夜重新開始。','Beyond growing flowers, change the bridge, pond and wishing bell together. Every contribution places a real shared decoration. Projects refresh at midnight Hong Kong time.')}</p><div class="park-quest-list">${SCENE_PROJECTS.map(p=>`<article class="park-quest-card"><small>${this.t('同班共享 · 每人最多三次','SHARED CLASS PROJECT · THREE EACH')}</small><h3>${this.name(p.name)}</h3><p>${this.name(p.description)}</p><b>${state?.projects?.[p.id]?.count||0} / 9 ${this.t('份心意','contributions')}</b><button data-park="community-walk" data-project="${p.id}">${this.t('前往一起幫忙','Walk over and help')} →</button></article>`).join('')}</div>`,'community');
  }
  private showEmotes() {
    this.openDrawer(this.t('跟朋友打招呼', 'Say hello'), `<div class="park-emote-list">${[['hello', '你好！', 'Hello!', '☀'], ['happy', '一起玩！', 'Let’s play!', '☺'], ['thanks', '謝謝你！', 'Thank you!', '♡']].map(([id, zh, en, glyph]) => `<button data-park="emote" data-emote="${id}"><span>${glyph}</span>${this.t(zh, en)}</button>`).join('')}</div>`, 'emotes');
  }
  private closePanels(restore = true) {
    this.drawer = ''; this.currentNpc = undefined;
    this.host.querySelector('.park-drawer-root')!.innerHTML = ''; this.host.querySelector('.park-dialog-root')!.innerHTML = '';
    if (!this.busy && !this.locked && this.client.ready && !this.activity && !this.miniGame) this.updateInputBlock();
    if (restore && this.lastFocus?.isConnected) this.lastFocus.focus({ preventScroll: true }); this.lastFocus = undefined;
  }
  private click(event: Event) {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-park]'); if (!button || button instanceof HTMLButtonElement && button.disabled) return;
    if (button.classList.contains('park-drawer-backdrop') && event.target !== button) return;
    const action = button.dataset.park;
    if (action === 'bag')return this.market?.open('bag');
    if (action === 'home') return this.options.home();
    if (action === 'retry') return this.options.retry();
    if (action === 'close') return this.closePanels();
    if (this.busy || this.locked || !this.client.ready || this.activity || this.miniGame || this.social?.isOpen || this.garden?.isOpen) return;
    if (action === 'quests') return this.showQuests();
    if (action === 'map') return this.showMap();
    if (action === 'peers') return this.showPeers();
    if (action === 'emotes') return this.showEmotes();
    if (action === 'notebook') return this.showNotebook();
    if (action === 'games') return this.showGames();
    if(action==='community')return this.showCommunity();
    if(action==='community-walk'){this.closePanels();return this.scene?.walkToGarden(button.dataset.project!);}
    if (action === 'interact' && this.near) return this.scene?.walkToObject(this.near.id);
    if (action === 'guide') { if (button.dataset.quest && this.progress) { sessionStorage.setItem(`park-quest:${this.identity.id}:${this.progress.day}`, button.dataset.quest); this.trackedQuest = button.dataset.quest; this.scene?.trackQuest(this.trackedQuest); const quest = QUESTS.find(q => q.id === this.trackedQuest); if (quest) this.host.querySelector('[data-park-objective]')!.textContent = this.name(quest.name); } this.closePanels(); return this.scene?.walkToObject(button.dataset.object!); }
    if (action === 'zone') { const zone = ZONES.find(z => z.id === button.dataset.zone); this.closePanels(); if (zone) this.scene?.walk(zone.center.x, zone.center.y); return; }
    if (action === 'find-peer') { const peer = this.client.frames.get(button.dataset.peer!); this.closePanels(); if (peer) this.scene?.walk(peer.x + 70, peer.y + 70); return; }
    if (action === 'emote') { this.closePanels(); void this.client.request('park:emote', { emote: button.dataset.emote }).catch(error => this.notice(error.message)); return; }
    if (action === 'accept') {
      const npc = this.currentNpc; button.setAttribute('disabled', '');
      void this.client.request('park:quest', { questId: button.dataset.quest }).then(result => { if (this.closed) return; sessionStorage.setItem(`park-quest:${this.identity.id}:${result.state.day}`, button.dataset.quest!); this.result(result); if (npc) this.showNpc(npc); }).catch(error => { this.notice(error.message); button.removeAttribute('disabled'); });
    }
  }
  private keydown(event: KeyboardEvent) {
    if (this.social?.isOpen || this.garden?.isOpen || this.market?.isOpen) return;
    if (event.key === 'Escape' && (this.drawer || this.currentNpc)) { event.preventDefault(); this.closePanels(); }
    if (event.key !== 'Tab' || !this.drawer && !this.currentNpc) return;
    const dialog = this.host.querySelector('.park-dialog, .park-drawer'), buttons = [...dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || []];
    if (!buttons.length) return;
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey ? index <= 0 : index < 0 || index === buttons.length - 1) { event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0].focus(); }
  }
  private bindStick() {
    const stick = this.host.querySelector<HTMLElement>('[data-park-stick]')!, signal = this.abort.signal;
    const move = (event: PointerEvent) => {
      if (this.joystickPointer !== event.pointerId || !this.scene) return;
      const rect = stick.getBoundingClientRect(), dx = (event.clientX - rect.x - rect.width / 2) / (rect.width / 2), dy = (event.clientY - rect.y - rect.height / 2) / (rect.height / 2);
      this.scene.touchMask = (dx < -.22 ? 1 : 0) | (dx > .22 ? 2 : 0) | (dy < -.22 ? 4 : 0) | (dy > .22 ? 8 : 0);
      stick.querySelector<HTMLElement>('i')!.style.transform = `translate(${Math.max(-1, Math.min(1, dx)) * 22}px,${Math.max(-1, Math.min(1, dy)) * 22}px)`;
    };
    stick.addEventListener('pointerdown', event => { if (this.busy || this.drawer || this.currentNpc || this.social?.isOpen || this.garden?.isOpen || !this.client.ready) return; event.preventDefault(); this.joystickPointer = event.pointerId; stick.setPointerCapture(event.pointerId); move(event); }, { signal });
    stick.addEventListener('pointermove', move, { signal });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) stick.addEventListener(type, () => this.releaseStick(), { signal });
  }
  private releaseStick() {
    this.joystickPointer = undefined; if (this.scene) this.scene.touchMask = 0; this.client.input(0);
    const thumb = this.host.querySelector<HTMLElement>('[data-park-stick] i'); if (thumb) thumb.style.transform = '';
  }
  private updateCount() {
    const count = this.client.peers.filter(p => p.id !== this.identity.id).length;
    this.host.querySelector('[data-park-count]')!.textContent = this.t(`同學 ${count}`, `Classmates ${count}`);
  }
  private drawMap() {
    if (this.closed) return;
    for (const canvas of this.host.querySelectorAll<HTMLCanvasElement>('[data-park-map]')) {
      const c = canvas.getContext('2d'); if (!c) continue;
      const sx = canvas.width / WORLD.width, sy = canvas.height / WORLD.height;
      c.clearRect(0, 0, canvas.width, canvas.height);
      for (const zone of ZONES) { c.fillStyle = zone.color; c.fillRect(zone.x * sx, zone.y * sy, zone.width * sx, zone.height * sy); }
      if (this.scene?.sys.isActive()) drawWorldMiniMap(c, this.scene, canvas.width, canvas.height);
      if (canvas.width > 300) { c.font = 'bold 16px sans-serif'; c.fillStyle = '#aa7235'; for (const object of OBJECTS.filter(o => o.game)) c.fillText('✦', object.x * sx - 5, object.y * sy); }
      for (const object of OBJECTS.filter(o => o.kind === 'npc')) { c.fillStyle = '#9d805c'; c.beginPath(); c.arc(object.x * sx, object.y * sy, canvas.width / 75, 0, Math.PI * 2); c.fill(); }
      for (const frame of this.client.frames.values()) { c.fillStyle = frame.id === this.identity.id ? '#416d60' : '#e0a777'; c.strokeStyle = '#fff9e8'; c.lineWidth = 2; c.beginPath(); c.arc(frame.x * sx, frame.y * sy, frame.id === this.identity.id ? canvas.width / 42 : canvas.width / 66, 0, Math.PI * 2); c.fill(); c.stroke(); }
      if (canvas.width > 300) { c.font = 'bold 15px "Microsoft JhengHei", sans-serif'; c.fillStyle = '#405f4e'; for (const zone of ZONES) c.fillText(this.name(zone.name), zone.center.x * sx - 30, zone.center.y * sy - 25); }
    }
  }
  private notice(message: string) {
    if (this.closed) return; const node = this.host.querySelector<HTMLElement>('.park-notice')!;
    node.textContent = message; node.hidden = false; clearTimeout(this.liveTimer);
    this.liveTimer = window.setTimeout(() => node.hidden = true, 5000);
  }
  setAccessLocked(locked: boolean) {
    const wasLocked = this.locked; this.locked = locked; void this.client.setLocked(locked); this.updateInputBlock();
    if (locked) { this.market?.close(); this.garden?.close(); this.venue?.destroy(); this.venue=undefined; this.activity?.destroy(); this.activity = undefined; this.miniGame?.destroy(); this.miniGame = undefined; this.releaseStick(); this.scene?.setBlocked(true); this.game?.loop.sleep(); }
    else if (wasLocked) this.options.retry();
  }
  destroy() {
    if (this.closed) return; this.closed = true; this.releaseStick(); this.abort.abort();
    clearInterval(this.mapTimer); clearTimeout(this.actionTimer); clearTimeout(this.liveTimer); this.actionResolve?.();
    this.venue?.destroy(); this.venue=undefined; this.activity?.destroy(); this.miniGame?.destroy(); this.social?.destroy(); this.market?.destroy(); this.garden?.destroy(); this.client.destroy(); this.observer?.disconnect(); this.game?.destroy(true); this.releaseBrowser?.();
    this.host.innerHTML = ''; delete (window as any).__petPark;
  }
}
