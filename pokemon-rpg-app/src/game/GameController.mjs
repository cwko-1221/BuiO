import { AudioEngine } from '../audio/AudioEngine.mjs';
import { CURRENT_TRAINER_DRAFTS, getLocalWalkTrial, getLocalWorldTrial, getLocalPokemonTrial, isLocalArtPreview, isLocalSkillTrial } from '../data/artTrials.mjs';
import { WALK_ATLASES } from '../data/walkAtlases.mjs';
import {ensureAdventure,recordQuestEvent,acceptQuest,claimQuest,getTrackedQuest} from '../engine/questEngine.mjs';
import {QUEST_BY_ID} from '../data/quests.mjs';
import {getActiveWorldNpc} from '../data/worldAdventure.mjs';
import {getThemedFieldArt} from '../data/themeAtlas.mjs';
import { getTravelFacing } from '../engine/locomotion.mjs';
import { World25DRenderer } from '../engine/World25DRenderer.mjs';
import { Fallback25DRenderer } from '../engine/Fallback25DRenderer.mjs';
import {
  POKEMON_SPECIES,
  createPokemonInstance,
  grantExpAndLevelUp,
} from '../data/pokemon.mjs';
import {
  ITEMS,
  canUseMedicineOnPokemon,
  applyMedicineToPokemon,
} from '../data/items.mjs';
import { TRAINER_AVATARS, QUEST_STAGES, NPCS } from '../data/trainers.mjs';
import {
  ZONES,
  getMap,
  getZoneAt,
  getPortalAt,
  getTallGrassAt,
  isPositionWalkable,
  findNearestWalkablePosition,
  rollWildEncounter,
} from '../data/world.mjs';
import {
  getEffectiveSpeed,
  computeCaptureChance,
  rollCaptureAttempt,
  executeSkillAction,
  applyEndOfTurnStatus,
  chooseEnemySkill,
  computeHospitalCost,
  computeBlackoutPenalty,
  executeCampRecovery,
} from '../engine/battleMath.mjs';
import {
  monDisplayName,
  renderTitleScreen,
  renderCreationScreen,
  renderOverworldHud,
  renderDialogueOverlay,
  renderBattleHud,
  renderModal,
  drawWorldOverviewCanvas,
  drawLocalMinimap,
} from '../ui/templates.mjs';

const DEX_MILESTONES = [
  { count: 3, flag: 'dex_m3', gold: 320, itemId: 'greatball', qty: 2, title: '初階圖鑑學者 (3種)' },
  { count: 6, flag: 'dex_m6', gold: 600, itemId: 'ultraball', qty: 2, title: '進階生態調查員 (6種)' },
  { count: 10, flag: 'dex_m10', gold: 1000, itemId: 'elixir', qty: 2, title: '星輝圖鑑專家 (10種)' },
  { count: 15, flag: 'dex_m15', gold: 1600, itemId: 'ultraball', qty: 4, title: '資深寶可夢博士助手 (15種)' },
  { count: 20, flag: 'dex_m20', gold: 2800, itemId: 'masterball', qty: 1, title: '星輝大師收藏家 (20種)' },
  { count: 24, flag: 'dex_m24', gold: 5000, itemId: 'masterball', qty: 2, title: '星輝全圖鑑傳說王者 (24/24)' },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class GameController {
  constructor(rootEl) {
    this.rootEl = rootEl;
    this.audio = new AudioEngine();
    this.renderer = null;
    this.artTrial = getLocalWalkTrial();
    this.currentArtPreview = isLocalArtPreview();
    this.worldArtTrial = getLocalWorldTrial();
    this.pokemonArtTrial = getLocalPokemonTrial();
    this.completedReview = Boolean(globalThis.location && ['127.0.0.1','localhost'].includes(location.hostname)
      && location.pathname.endsWith('/preview') && new URLSearchParams(location.search).get('review-party')==='completed');
    this.allPokemonReview = Boolean(globalThis.location && ['127.0.0.1','localhost'].includes(location.hostname)
      && location.pathname.endsWith('/preview') && new URLSearchParams(location.search).get('review-party')==='all');
    this.skillArtTrial = isLocalSkillTrial();

    this.user = { id: 'S001', name: '訓練員', role: 'student' };
    this.save = null;
    this.screen = 'title'; // 'title' | 'creation' | 'world' | 'battle'

    this.creationDraft = {
      name: '小智',
      avatarId: 'blaze',
      starterId: 'charmander',
    };

    this.keys = new Set();
    this.dpadDir = null;
    this.clickTarget = null;
    this.isMoving = false;
    this.grassStepAccum = 0;
    this.footstepSfxAccum = 0;
    this.encounterGraceDist = 0;
    this.playTimeAccum = 0;
    this.autoSaveAccum = 0;

    this.dialogue = null;
    this.modal = null;
    this.battle = null;
    this.pendingEvolutions = [];
    this.afterEvolutionCallback = null;
    this.lastLightCampRestAt = 0;

    this._lastHudSignature = '';
    this._rafId = null;
    this._lastFrameTime = performance.now();
  }

  async init() {
    this.buildDomSkeleton();
    if(this.artTrial || this.skillArtTrial || this.currentArtPreview || this.worldArtTrial || this.pokemonArtTrial || this.completedReview || this.allPokemonReview) {
      const notice=document.createElement('aside');notice.dataset.artTrial=this.artTrial?.id || (this.currentArtPreview?'current':'water-v1');
      notice.className='art-trial-notice';
      const label=this.artTrial?`${this.artTrial.avatarId} ${this.artTrial.label}步態`:'水系技能';
      notice.innerHTML=this.allPokemonReview ? '全部寶可夢測試 · 不儲存進度' : this.pokemonArtTrial ? `${POKEMON_SPECIES[this.pokemonArtTrial.speciesId].nameZh}${this.pokemonArtTrial.motionLabel || '步行'}${this.pokemonArtTrial.reviewLabel ? ` · ${this.pokemonArtTrial.reviewLabel}` : '試作 · 未驗收／不儲存'}` : this.worldArtTrial ? (this.worldArtTrial.formalMap ? `${this.worldArtTrial.label} · 地圖預覽／不儲存` : `${this.worldArtTrial.label || '東門場景'}試作 · 未驗收／不儲存`) : this.skillArtTrial ? '技能動畫試作 · 未驗收／不儲存' : this.currentArtPreview
        ? '新版角色預覽 · 步行修正中／不儲存'
        : this.artTrial?.userApprovedMotion ? `${label} · 動作已確認／不儲存 <a href="/pokemon-rpg/preview">新版預覽</a>`
        : `${label}試看 · 未驗收／不儲存 <a href="/pokemon-rpg/preview">新版預覽</a>`;
      this.rootEl.append(notice);
    }
    this.initRenderer();
    this.bindEvents();
    await this.loadServerState();
    this.audio.setMusicTrack('title');
    this.renderUI(true);
    this._lastFrameTime = performance.now();
    this.loop();
  }

  buildDomSkeleton() {
    this.rootEl.innerHTML = `
      <div class="viewport-canvas" id="rpg-canvas-mount"></div>
      <div id="rpg-hud-mount"></div>
      <div id="rpg-dialogue-mount"></div>
      <div id="rpg-modal-mount"></div>
      <div class="encounter-flash" id="rpg-flash-mount"></div>
      <div class="toast-stack" id="rpg-toast-mount"></div>
    `;
    this.canvasMount = this.rootEl.querySelector('#rpg-canvas-mount');
    this.hudMount = this.rootEl.querySelector('#rpg-hud-mount');
    this.dialogueMount = this.rootEl.querySelector('#rpg-dialogue-mount');
    this.modalMount = this.rootEl.querySelector('#rpg-modal-mount');
    this.flashMount = this.rootEl.querySelector('#rpg-flash-mount');
    this.toastMount = this.rootEl.querySelector('#rpg-toast-mount');
  }

  initRenderer() {
    try {
      this.renderer = new World25DRenderer(this.canvasMount);
    } catch (err) {
      console.warn('[PokemonRPG] WebGL unavailable, using Canvas2D 2.5D fallback:', err?.message);
      this.renderer = new Fallback25DRenderer(this.canvasMount);
    }
  }

  isPreviewMode() {
    return (
      window.location.pathname.includes('/preview') ||
      window.location.search.includes('preview=1')
    );
  }

  async apiFetch(path, opts = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(this.isPreviewMode() ? { 'x-buio-preview': '1' } : {}),
      ...(opts.headers || {}),
    };
    const res = await fetch(`/api/pokemon-rpg${path}`, {
      credentials: 'same-origin',
      ...opts,
      headers,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  async loadServerState() {
    try {
      const { ok, status, data } = await this.apiFetch('/state', { method: 'GET' });
      if (ok && data.success) {
        if (data.user) {
          this.user = data.user;
          this.creationDraft.name = data.user.name || '訓練員';
        }
        if (data.save) {
          this.save = data.save;
          this.syncRendererWithSave(true);
        }
        return;
      }
      if (status === 401) {
        this.toast('請先登入 BuiO 平台以同步雲端存檔。');
      }
    } catch (err) {
      console.warn('[PokemonRPG] Failed to load server state, checking local backup:', err);
      const localRaw = localStorage.getItem('buio_pokerpg_backup');
      if (localRaw) {
        try {
          this.save = JSON.parse(localRaw);
          this.syncRendererWithSave(true);
        } catch {}
      }
    }
  }

  async persistSave(silent = true) {
    if(this.artTrial || this.skillArtTrial || this.currentArtPreview || this.worldArtTrial || this.pokemonArtTrial || this.completedReview || this.allPokemonReview) {
      if(!silent)this.toast('美術預覽不會儲存進度。');
      return;
    }
    if (!this.save) return;
    if (!this.save.position.zone) {
      this.save.position.zone = 'dawnleaf';
    }
    try {
      localStorage.setItem('buio_pokerpg_backup', JSON.stringify(this.save));
    } catch {}

    try {
      const { ok, data } = await this.apiFetch('/save', {
        method: 'POST',
        body: JSON.stringify({ save: this.save }),
      });
      if (ok && data.save) {
        if (!silent) this.toast('💾 冒險進度已成功儲存！');
      } else if (!silent) {
        this.toast('💾 已儲存至本機備份');
      }
    } catch {
      if (!silent) this.toast('💾 已儲存至本機暫存');
    }
  }

  syncRendererWithSave(resetTrail = false) {
    if (!this.save || !this.renderer) return;
    ensureAdventure(this.save);this.renderer.worldSave=this.save;
    const reviewParty = this.completedReview || this.allPokemonReview;
    if(reviewParty && !this._completedReviewPartyPrepared) {
      // An isolated, non-saving review roster keeps accepted motions easy to find.
      const previous=[...this.save.party,...this.save.box];
      const ids=this.allPokemonReview ? Object.keys(POKEMON_SPECIES) : ['squirtle','charmander','eevee','bulbasaur','growlithe','riolu','gengar'];
      const reviewed=ids.map(speciesId=>
        previous.find(mon=>mon.speciesId===speciesId) || createPokemonInstance(speciesId,7,{caughtZone:this.save.position.zone}));
      this.save.party=reviewed.slice(0,6);
      this.save.box=reviewed.slice(6);
      this.save.followers=this.save.party.slice(0,3).map(mon=>mon.uid);
      this._completedReviewPartyPrepared=true;
      this._pokemonTrialPrepared=true;
      resetTrail=true;
    }
    if(this.pokemonArtTrial && !this._pokemonTrialPrepared) {
      let mon=[...this.save.party,...this.save.box].find(m=>m.speciesId===this.pokemonArtTrial.speciesId);
      if(!mon) {
        mon=createPokemonInstance(this.pokemonArtTrial.speciesId,7,{caughtZone:this.save.position.zone});
        (this.save.party.length<6 ? this.save.party : this.save.box).push(mon);
      }
      this.save.followers=[mon.uid];this._pokemonTrialPrepared=true;resetTrail=true;
    }
    if(this.worldArtTrial && !this._worldTrialPositioned) {
      this.save.position={...this.worldArtTrial.spawn};
      this._worldTrialPositioned=true;resetTrail=true;
    }
    if(this.artTrial)this.save.trainer.avatarId=this.artTrial.avatarId;
    const position=this.save.position;
    if (!isPositionWalkable(position.x,position.z,position.zone || 'dawnleaf')) {
      Object.assign(position,findNearestWalkablePosition(position.x,position.z,position.zone || 'dawnleaf'));
      resetTrail=true;
      this.clickTarget=null;
    }
    this.renderer.setTrainerAvatar(this.save.trainer.avatarId);
    if (this.save.position?.zone) {
      this.renderer.setActiveZone(this.save.position.zone);
    }
    if (resetTrail) {
      this.footstepSfxAccum=0;
      this.renderer.resetTrailAt(this.save.position.x, this.save.position.z,this.save.position.facing);
    }
    const allOwned = [...this.save.party, ...this.save.box];
    const followerMons = this.save.followers
      .map((uid) => allOwned.find((m) => m.uid === uid))
      .filter(Boolean)
      .slice(0, 3);
    this.renderer.syncFollowers(followerMons);
  }

  toast(message) {
    clearTimeout(this._feedbackTimer);
    this.feedback = { message, context: this.modal ? `modal:${this.modal.type}` : this.screen };
    this.renderFeedback();
    this._feedbackTimer = setTimeout(() => this.clearFeedback(), 2800);
  }

  clearFeedback() {
    clearTimeout(this._feedbackTimer);
    this.feedback = null;
    this.rootEl.querySelectorAll('[data-feedback]').forEach((el) => el.remove());
  }

  renderFeedback() {
    this.rootEl.querySelectorAll('[data-feedback]').forEach((el) => el.remove());
    const context = this.modal ? `modal:${this.modal.type}` : this.screen;
    if (!this.feedback || this.feedback.context !== context) return;
    const el = document.createElement('div');
    el.dataset.feedback = context;
    el.setAttribute('role', 'status');
    el.textContent = this.feedback.message;
    if (this.modal) {
      el.className = 'modal-feedback';
      const header = this.modalMount.querySelector('.modal-header');
      if (header) header.after(el);
      else this.modalMount.querySelector('.modal-window')?.prepend(el);
    } else if (this.screen === 'battle') {
      el.className = 'battle-feedback';
      this.hudMount.querySelector('.battle-context-tag')?.append(el);
    } else {
      el.className = 'toast-item';
      this.toastMount.appendChild(el);
    }
  }

  triggerFlash() {
    this.flashMount.classList.remove('active');
    void this.flashMount.offsetWidth;
    this.flashMount.classList.add('active');
    setTimeout(() => this.flashMount.classList.remove('active'), 700);
  }

  bindEvents() {
    // Unlock WebAudio on first user gesture
    const unlockOnce = () => {
      this.audio.unlock();
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });
    window.addEventListener('keydown', unlockOnce, { passive: true });

    // Delegated UI button clicks
    this.rootEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.action;
      this.handleAction(action, btn);
    });

    // Trainer name live input in Creation Screen
    this.rootEl.addEventListener('input', (e) => {
      if (e.target.id === 'trainer-name-input') {
        this.creationDraft.name = e.target.value;
      }
    });

    // Touch / Mouse D-Pad hold
    this.rootEl.addEventListener('pointerdown', (e) => {
      const dpad = e.target.closest('[data-dpad]');
      if (dpad) {
        e.preventDefault();
        this.dpadDir = dpad.dataset.dpad;
        this.clickTarget = null;
        dpad.classList.add('pressed');
      }
    });
    const clearDpad = () => {
      this.dpadDir = null;
      this.rootEl.querySelectorAll('.dpad-btn.pressed').forEach((b) => b.classList.remove('pressed'));
    };
    window.addEventListener('pointerup', clearDpad);
    window.addEventListener('pointercancel', clearDpad);

    // Click-to-Walk on 2.5D Canvas when in overworld
    this.canvasMount.addEventListener('pointerdown', (e) => {
      if (this.screen !== 'world' || this.dialogue || this.modal || !this.save) return;
      const rect = this.canvasMount.getBoundingClientRect();
      const lx = e.clientX - rect.left;
      const ly = e.clientY - rect.top;
      if (this.renderer && typeof this.renderer.screenToWorld === 'function') {
        this.clickTarget = this.renderer.screenToWorld(lx, ly);
      } else {
        const nx = (lx / Math.max(1, rect.width) - 0.5) * 2;
        const ny = (ly / Math.max(1, rect.height) - 0.5) * 2;
        this.clickTarget = {
          x: this.save.position.x + nx * 9.5,
          z: this.save.position.z + ny * 9.0,
        };
      }
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const key = e.key.toLowerCase();
      this.keys.add(key);

      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
        if (this.screen === 'world' || this.screen === 'battle') e.preventDefault();
      }

      if (this.dialogue) {
        if (key === ' ' || key === 'enter' || key === 'e') {
          const isLast = this.dialogue.index >= this.dialogue.lines.length - 1;
          if (!isLast || !this.dialogue.choices?.length) {
            this.advanceDialogue();
          }
        }
        return;
      }

      if (key === 'escape' && this.modal && this.modal.type !== 'battle_switch' && this.modal.type !== 'evolution') {
        this.closeModal();
        return;
      }

      if (this.screen === 'world' && !this.modal) {
        if (key === 'escape') {
          this.openModal({ type: 'expedition_menu' });
        } else if (key === 'e' || key === ' ' || key === 'enter') {
          this.interactWithNearby();
        } else if (key === 'b') {
          this.openModal({ type: 'bag', tab: 'medicine' });
        } else if (key === 'p') {
          this.openModal({ type: 'team', tab: 'party' });
        } else if (key === 'm') {
          this.openModal({ type: 'map' });
        } else if (key === 'x') {
          this.openModal({ type: 'pokedex' });
        } else if(key==='j'){
          this.openModal({type:'journal',tab:'main'});
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    window.addEventListener('resize', () => {
      if (this.screen === 'battle') this.syncBattleViewport();
    });
  }

  async handleAction(action, btn) {
    this.audio.unlock();

    switch (action) {
      case 'open-journal': {this.openModal({type:'journal',tab:'main'});break;}
      case 'journal-tab': {if(this.modal?.type==='journal'){this.modal.tab=btn.dataset.tab;this.renderModalUI()}break;}
      case 'journal-zone': {if(this.modal?.type==='journal'){this.modal.zoneFilter=btn.dataset.zoneFilter||null;this.renderModalUI()}break;}
      case 'accept-quest': {ensureAdventure(this.save);if(acceptQuest(this.save,btn.dataset.questId)){this.toast('已接取：'+QUEST_BY_ID[btn.dataset.questId].titleZh);this.persistSave(true)}this.renderModalUI();break;}
      case 'track-quest': {const id=btn.dataset.questId;if(this.save.adventure?.accepted[id]&&!this.save.adventure.completed.includes(id)){this.save.adventure.tracked=id;this.persistSave(true)}this.renderModalUI();this.renderUI(true);break;}
      case 'claim-quest': {const result=claimQuest(this.save,btn.dataset.questId);if(result.ok){this.audio.playSfx('level_up');this.toast('完成：'+result.quest.titleZh);this.persistSave(true)}this.renderModalUI();this.renderUI(true);break;}
      case 'quest-map': {this.openModal({type:'map',view:'regional',zoneId:btn.dataset.zoneId});break;}
      case 'camp-rest': {this.useCamp(btn.dataset.objectId,'rest');break;}
      case 'camp-rest-light': {this.useCamp(btn.dataset.objectId,'rest_light');break;}
      case 'camp-craft': {this.useCamp(btn.dataset.objectId,btn.dataset.recipe);break;}
      case 'open-expedition-menu': {
        this.openModal({ type: 'expedition_menu' });
        break;
      }
      case 'toggle-mute': {
        this.audio.toggleMute();
        this.renderUI(true);
        break;
      }
      case 'start-new-creation': {
        this.audio.playSfx('ui_confirm');
        this.creationDraft = {
          name: this.save?.trainer?.name || this.user?.name || '星輝訓練員',
          avatarId: this.save?.trainer?.avatarId || 'blaze',
          starterId: 'charmander',
        };
        this.screen = 'creation';
        this.renderUI(true);
        break;
      }
      case 'back-to-title': {
        this.audio.playSfx('ui_cancel');
        this.screen = 'title';
        this.renderUI(true);
        break;
      }
      case 'pick-avatar': {
        this.audio.playSfx('ui_click');
        this.creationDraft.avatarId = btn.dataset.avatarId;
        this.renderUI(true);
        break;
      }
      case 'pick-starter': {
        this.audio.playSfx('ui_click');
        this.creationDraft.starterId = btn.dataset.starterId;
        this.renderUI(true);
        break;
      }
      case 'confirm-creation': {
        await this.startNewGameFromDraft();
        break;
      }
      case 'continue-game': {
        if (!this.save) return;
        this.audio.playSfx('ui_confirm');
        this.enterOverworld();
        break;
      }
      case 'toggle-quest-details': {
        this.questDetailsExpanded=!this.questDetailsExpanded;
        this.renderUI(true);
        break;
      }
      case 'open-team': {
        this.audio.playSfx('ui_click');
        this.openModal({ type: 'team', tab: 'party' });
        break;
      }
      case 'open-bag': {
        this.audio.playSfx('ui_click');
        this.openModal({ type: 'bag', tab: 'medicine' });
        break;
      }
      case 'open-pokedex': {
        this.audio.playSfx('ui_click');
        this.openModal({ type: 'pokedex' });
        break;
      }
      case 'open-map': {
        this.audio.playSfx('ui_click');
        this.openModal({ type: 'map' });
        break;
      }
      case 'select-map-zone': {
        if(this.modal?.type!=='map' || !ZONES[btn.dataset.zoneId])return;
        this.modal.zoneId=btn.dataset.zoneId;
        this.modal.view='regional';
        this.modal.mapZoom=1;
        this.renderModalUI();
        break;
      }
      case 'map-view': {
        if(this.modal?.type!=='map')return;
        this.modal.view=btn.dataset.mapView==='regional'?'regional':'world';
        this.renderModalUI();
        break;
      }
      case 'map-zoom': {
        if(this.modal?.type!=='map')return;
        this.modal.mapZoom=Math.max(1,Math.min(2,(this.modal.mapZoom||1)+Number(btn.dataset.mapZoom)*.5));
        this.renderModalUI();
        break;
      }
      case 'manual-save': {
        this.audio.playSfx('ui_confirm');
        await this.persistSave(false);
        break;
      }
      case 'interact-nearby': {
        this.interactWithNearby();
        break;
      }
      case 'search-wild-now': {
        if (this.screen === 'world' && !this.dialogue && !this.modal) {
          this.triggerRandomEncounterInCurrentZone();
        }
        break;
      }
      case 'dialogue-next': {
        this.advanceDialogue();
        break;
      }
      case 'dialogue-choice': {
        const idx = Number(btn.dataset.choiceIdx);
        const choice = this.dialogue?.choices?.[idx];
        this.dialogue = null;
        this.renderDialogue();
        if (choice?.onSelect) {
          choice.onSelect();
        }
        break;
      }
      case 'close-modal': {
        this.audio.playSfx('ui_cancel');
        this.closeModal();
        break;
      }
      case 'close-evolution': {
        this.audio.playSfx('ui_confirm');
        this.showNextEvolutionOrFinish();
        break;
      }
      case 'set-modal-tab': {
        if (!this.modal) return;
        this.audio.playSfx('ui_click');
        this.modal.tab = btn.dataset.tab;
        this.renderModalUI();
        break;
      }
      case 'buy-item': {
        this.buyShopItem(btn.dataset.itemId, Number(btn.dataset.qty || 1));
        break;
      }
      case 'hospital-heal': {
        this.performHospitalHeal(false);
        break;
      }
      case 'hospital-emergency-heal': {
        this.performHospitalHeal(true);
        break;
      }
      case 'select-bag-item': {
        if (!this.modal) return;
        this.audio.playSfx('ui_click');
        this.modal.selectedItemId = btn.dataset.itemId;
        this.renderModalUI();
        break;
      }
      case 'use-medicine-on-mon': {
        await this.useMedicineItem(btn.dataset.itemId, btn.dataset.uid);
        break;
      }
      case 'interact-follower': {
        this.interactWithFollower(Number(btn.dataset.followerIdx ?? 0));
        break;
      }
      case 'select-team-mon': {
        if (!this.modal || this.modal.type !== 'team') return;
        this.audio.playSfx('ui_click');
        this.modal.selectedUid = btn.dataset.uid;
        this.renderModalUI();
        break;
      }
      case 'select-pokedex-mon': {
        if (!this.modal || this.modal.type !== 'pokedex') return;
        this.audio.playSfx('ui_click');
        this.modal.selectedDexId = btn.dataset.dexId;
        this.renderModalUI();
        break;
      }
      case 'toggle-follower': {
        this.toggleFollower(btn.dataset.uid);
        break;
      }
      case 'set-party-lead': {
        this.setPartyLead(btn.dataset.uid);
        break;
      }
      case 'move-to-box': {
        this.movePartyToBox(btn.dataset.uid);
        break;
      }
      case 'move-to-party': {
        this.moveBoxToParty(btn.dataset.uid);
        break;
      }
      // --- Battle Commands ---
      case 'battle-submenu': {
        if (!this.battle || this.battle.busy) return;
        this.audio.playSfx('ui_click');
        this.battle.subMenu = btn.dataset.menu === 'root' ? null : btn.dataset.menu;
        this.renderUI(true);
        break;
      }
      case 'battle-normal-attack': {
        await this.executePlayerBattleMove('normal_attack');
        break;
      }
      case 'battle-use-skill': {
        await this.executePlayerBattleMove(btn.dataset.skillId);
        break;
      }
      case 'battle-throw-ball': {
        await this.executeCaptureAttempt(btn.dataset.ballId);
        break;
      }
      case 'open-battle-switch': {
        if (!this.battle || this.battle.busy) return;
        this.audio.playSfx('ui_click');
        this.openModal({ type: 'battle_switch', forced: false });
        break;
      }
      case 'confirm-battle-switch': {
        await this.executeBattleSwitch(Number(btn.dataset.partyIdx));
        break;
      }
      case 'battle-escape': {
        await this.executeBattleEscape();
        break;
      }
      default:
        break;
    }
  }

  async startNewGameFromDraft() {
    const cleanName = (this.creationDraft.name || '').trim().slice(0, 18) || '星輝訓練員';
    const avatarId = TRAINER_AVATARS.some((a) => a.id === this.creationDraft.avatarId)
      ? this.creationDraft.avatarId
      : 'blaze';
    const starterId = POKEMON_SPECIES[this.creationDraft.starterId]
      ? this.creationDraft.starterId
      : 'charmander';

    const starterMon = createPokemonInstance(starterId, 5, {
      isStarter: true,
      caughtBall: 'pokeball',
      caughtZone: 'dawnleaf',
    });

    this.save = {
      version: 1,
      trainer: {
        name: cleanName,
        avatarId,
        starterId,
      },
      position: {
        x: -2.2,
        z: 3.4,
        facing: 'up',
        zone: 'dawnleaf',
      },
      gold: 600,
      inventory: {
        pokeball: 6,
        greatball: 1,
        potion: 3,
        ether: 2,
      },
      party: [starterMon],
      box: [],
      followers: [starterMon.uid],
      pokedex: {
        seen: [starterId],
        caught: [starterId],
      },
      questStage: 0,
      badges: [],
      defeatedNpcs: [],
      storyFlags: {},
      stats: {
        battlesWon: 0,
        pokemonCaught: 1,
        hospitalVisits: 0,
        playSeconds: 0,
      },
    };

    this.audio.playSfx('level_up');
    await this.persistSave(true);
    this.enterOverworld();

    const starterSp = POKEMON_SPECIES[starterId];
    this.openDialogue({
      speaker: '木槿博士',
      role: '星輝寶可夢研究所',
      sprite: '/pokemon-rpg/assets/npcs/professor.webp',
      lines: [
        `歡迎來到晨曦鎮，${cleanName}！「${starterSp.nameZh}」已經開心地跟在你身後了！`,
        '你可以隨時使用 WASD／方向鍵／點擊地面行走，最多可讓 3 隻寶可夢同時跟隨在後面。',
        '準備好之後，請走過來研究所門前與我對話（按 E 或點擊互動按鈕），了解星輝結晶的主線任務吧！',
      ],
    });
  }

  enterOverworld() {
    this.clearFeedback();
    this.screen = 'world';
    this.battle = null;
    this.modal = null;
    this.renderer.exitBattleStage();
    this.syncRendererWithSave(true);
    this.updateZoneMusic();
    this.renderUI(true);
  }

  updateZoneMusic() {
    if (this.screen !== 'world' || !this.save) return;
    const curZone = this.save.position.zone || 'dawnleaf';
    const map = getMap(curZone);
    this.audio.setMusicTrack(map?.music || 'town');
  }

  openModal(modalObj) {
    this.clearFeedback();
    this.modal = modalObj;
    this.clickTarget = null;
    this.renderModalUI();
  }

  closeModal() {
    this.clearFeedback();
    this.modal = null;
    this.renderModalUI();
    this.renderUI(true);
  }

  renderModalUI() {
    this.modalMount.innerHTML = renderModal({
      modal: this.modal,
      save: this.save,
      battle: this.battle,
      lastLightCampRestAt: this.lastLightCampRestAt,
    });
    this.renderFeedback();
    if (this.modal?.type === 'map' && this.save) {
      const fullMapCanvas = this.modalMount.querySelector('#rpg-fullmap-canvas');
      const quest = (getTrackedQuest(this.save,getMap)||QUEST_STAGES[Math.min(QUEST_STAGES.length - 1, this.save.questStage || 0)]);
      drawWorldOverviewCanvas(fullMapCanvas, this.save, quest, this.modal.zoneId);
    }
  }

  openDialogue({ speaker, role = '', sprite, lines = [], choices = null, onFinish = null }) {
    this.clickTarget = null;
    this.dialogue = {
      speaker,
      role,
      sprite,
      lines,
      index: 0,
      choices,
      onFinish,
    };
    this.audio.playSfx('dialogue_blip');
    this.renderDialogue();
  }

  advanceDialogue() {
    if (!this.dialogue) return;
    if (this.dialogue.index < this.dialogue.lines.length - 1) {
      this.dialogue.index += 1;
      this.audio.playSfx('dialogue_blip');
      this.renderDialogue();
    } else {
      const done = this.dialogue.onFinish;
      this.dialogue = null;
      this.renderDialogue();
      if (done) done();
    }
  }

  renderDialogue() {
    this.dialogueMount.innerHTML = renderDialogueOverlay(this.dialogue);
  }

  // =========================================================================
  // OVERWORLD INTERACTION, SHOP, HOSPITAL, BACKPACK & 3-POKEMON FOLLOWERS
  // =========================================================================
  getNearbyInteraction() {
    if (!this.save) return null;
    const { x, z } = this.save.position;
    const curZone = this.save.position.zone || 'dawnleaf';
    const map = getMap(curZone);
    const a=ensureAdventure(this.save);
    const field=(map.fieldObjects||[]).filter(p=>!(p.once&&a.collected.includes(p.id))).map(p=>({p,d:Math.hypot(p.x-x,p.z-z)})).filter(e=>e.d<2.5).sort((a,b)=>a.d-b.d)[0];
    if(field){const verbs={board:'查看委託',camp:'休息 / 調製',berry:'採集',herb:'採集',satchel:'拾取',survey:'調查'};return{kind:'field',object:field.p,label:`${verbs[field.p.kind]} · ${field.p.nameZh}`};}

    // 1. Check if standing at/near a Portal Gate
    if (map?.portals) {
      for (const p of map.portals) {
        const d = Math.hypot(x - p.x, z - p.z);
        if (d < (p.radius || 2.2) + 0.8) {
          return {
            kind: 'portal',
            portal: p,
            label: `沿路前往【${getMap(p.targetZone).nameZh}】`,
          };
        }
      }
    }

    // 2. Check nearby NPCs in the current active zone
    let closestNpc = null;
    let minDist = 2.95;
    for (const original of NPCS) {
      const npc=getActiveWorldNpc(original,this.save);
      if ((npc.zone || 'dawnleaf') !== curZone) continue;
      if (npc.kind === 'wild_boss' && this.save.defeatedNpcs.includes(npc.id)) continue;
      const d = Math.hypot(npc.x - x, npc.z - z);
      if (d < minDist) {
        minDist = d;
        closestNpc = npc;
      }
    }

    if (closestNpc) {
      const actionVerb =
        closestNpc.kind === 'shop' ? '開啟精靈商城' :
        closestNpc.kind === 'hospital' ? '進入精靈醫院治療' :
        closestNpc.kind === 'boss_trainer' ? '對話 / 挑戰' :
        closestNpc.kind === 'wild_boss' || closestNpc.kind === 'legendary_boss' ? '迎戰頭目' : '對話';
      return {
        kind: 'npc',
        npc: closestNpc,
        label: `與「${closestNpc.nameZh}」${actionVerb}`,
      };
    }

    // 3. Hospital / Shop entrance shortcuts in Dawnleaf Town
    if (curZone === 'dawnleaf') {
      if (Math.hypot(x - 0, z - -2.6) < 2.4) {
        return {
          kind: 'building_hospital',
          label: '🏥 進入晨曦鎮精靈醫院（回復 HP & MP）',
        };
      }
      if (Math.hypot(x - 7.8, z - -2.2) < 2.3) {
        return {
          kind: 'building_shop',
          label: '🏪 進入星輝精靈商城（購買精靈球與藥劑）',
        };
      }
    }

    return null;
  }

  interactWithNearby() {
    if (this.screen !== 'world' || this.dialogue || this.modal || !this.save) return;
    const target = this.getNearbyInteraction();
    if (!target) return;

    this.audio.playSfx('ui_confirm');
    if(target.kind==='field'){this.interactWithFieldObject(target.object.id);return;}
    if (target.kind === 'portal') {
      this.triggerZoneTransition(target.portal);
      return;
    }
    if (target.kind === 'building_hospital') {
      this.openModal({ type: 'hospital' });
      return;
    }
    if (target.kind === 'building_shop') {
      this.openModal({ type: 'shop', tab: 'all' });
      return;
    }
    if (target.kind === 'npc') {
      this.handleNpcInteraction(target.npc);
    }
  }

  interactWithFieldObject(id){
    if(this.screen!=='world'||!this.save||this.dialogue||this.modal)return false;
    const p=getMap(this.save.position.zone).fieldObjects?.find(p=>p.id===id);
    if(!p||Math.hypot(p.x-this.save.position.x,p.z-this.save.position.z)>2.8)return false;
    const a=ensureAdventure(this.save);if(p.once&&a.collected.includes(id))return false;
    if(p.kind==='board'){this.openModal({type:'journal',tab:'side',zoneFilter:p.zone});return true;}
    if(p.kind==='camp'){this.openModal({type:'field_camp',objectId:id});return true;}
    const lore={dawnleaf:'觀測紀錄：南庭的水位平穩，星輝讀數卻有細微偏移。博士需要其他地區的資料作比較。',meadow:'觀測紀錄：風向和花粉的分布不再一致。異常的節奏似乎沿溪流傳向東方森林。',mosswood:this.save.storyFlags.forest_restored?'溪流的波動已恢復平穩，林間歌聲再度出現。研究員森已返回蕈光營地。':'刻痕記錄：清溪、古樹和觀林臺反覆出現相同的星輝波形。手帳指出，須把三份資料一同交給巡林員。',coast:'潮汐記錄：燈塔的信標與實際潮位不同步。漂流手記保留了失準前的讀數。',canyon:'地脈記錄：岩層中的星輝正向北流動，並非單純的火山活動。安全線需要重新標記。',twilight:'古老刻痕：「以信任回應力量，以共鳴守護棲地。」封印連接著人與寶可夢共同留下的約定。'};
    if(p.once)a.collected.push(id);
    if(p.kind==='berry'||p.kind==='herb'){const gain=p.kind==='herb'?4:2;a.resources[p.kind]=Math.min(999,(a.resources[p.kind]||0)+gain);this.toast(`${p.nameZh} +${gain} · 可在營地療養或調製藥品`);}
    else {
      if(p.kind==='survey'&&!a.inspected.includes(id))a.inspected.push(id);
      const text=p.kind==='satchel'?`你收好「${p.nameZh}」。其中的紀錄已存入旅程日誌，可用於相關主線或居民委託。`:lore[p.zone];
      this.openDialogue({speaker:p.nameZh,role:p.kind==='survey'?'實地調查':'探索發現',sprite:getThemedFieldArt(p.zone,p.kind).src,lines:[text]});
    }
    this.persistSave(true);this.renderUI(true);return true;
  }

  useCamp(id,recipe){
    const p=getMap(this.save.position.zone).fieldObjects?.find(p=>p.id===id&&p.kind==='camp');
    if(!p||Math.hypot(p.x-this.save.position.x,p.z-this.save.position.z)>2.8)return false;
    const a=ensureAdventure(this.save);
    if(recipe==='rest'||recipe==='rest_light'){
      const res=executeCampRecovery({
        party:this.save.party,
        resources:a.resources,
        forceLight:recipe==='rest_light',
        nowMs:Date.now(),
        lastLightRestAt:this.lastLightCampRestAt,
      });
      if(!res.ok){
        this.audio.playSfx('ui_cancel');
        this.toast(res.messageZh);
        this.renderModalUI();
        return false;
      }
      this.lastLightCampRestAt=res.lastLightRestAt;
      if(!a.rested.includes(p.zone))a.rested.push(p.zone);
      this.audio.playSfx('heal_potion');
      this.toast(res.messageZh);
    }else{
      const cost=recipe==='potion'?{berry:1,herb:1}:recipe==='ether'?{berry:1,herb:2}:null;
      if(!cost||Object.entries(cost).some(([k,v])=>(a.resources[k]||0)<v)){this.toast('材料不足，先採集樹果與藥草。');return false;}
      for(const [k,v]of Object.entries(cost))a.resources[k]-=v;
      this.save.inventory[recipe]=Math.min(999,(this.save.inventory[recipe]||0)+1);recordQuestEvent(this.save,'craft:'+recipe);this.toast('調製完成：'+ITEMS[recipe].nameZh+' ×1');
    }
    this.persistSave(true);this.renderModalUI();this.renderUI(true);return true;
  }

  triggerZoneTransition(portal) {
    if (!portal || this.portalCooldown) return;
    this.portalCooldown = true;
    setTimeout(() => {
      this.portalCooldown = false;
    }, 1200);

    this.audio.playSfx('ui_confirm');
    const targetZone = portal.targetZone;
    const targetMap = getMap(targetZone);

    this.save.position.zone = targetZone;
    this.save.position.x = portal.targetSpawn.x;
    this.save.position.z = portal.targetSpawn.z;
    this.save.position.facing = portal.targetSpawn.facing || 'down';
    this.clickTarget = null;
    this.isMoving = false;

    if (this.renderer) {
      this.renderer.resetTrailAt(portal.targetSpawn.x, portal.targetSpawn.z,portal.targetSpawn.facing);
      this.renderer.setActiveZone(targetZone);
    }
    this.updateZoneMusic();
    this.toast(`已抵達【${targetMap.nameZh}】`);
    this.renderUI(true);
    this.persistSave(true);
  }

  handleNpcInteraction(npc) {
    const s = this.save;
    recordQuestEvent(s,`talk:${npc.id}`);this.persistSave(true);
    if(npc.kind==='quest_giver'){
      this.openDialogue({speaker:npc.nameZh,role:npc.roleZh,sprite:npc.sprite,lines:npc.dialogueZh,onFinish:()=>this.openModal({type:'journal',tab:'side',zoneFilter:npc.zone})});return;
    }

    if (npc.kind === 'hospital') {
      this.openModal({ type: 'hospital' });
      return;
    }

    if (npc.kind === 'shop') {
      this.openModal({ type: 'shop', tab: 'all' });
      return;
    }

    if (npc.kind === 'story_professor') {
      if (s.questStage === 0) {
        s.questStage = 1;
        let giftMsg = '調查任務已寫進「旅程日誌」。先拜訪喬伊護士與商人亞當，再讀取南庭觀測點。準備好之後，我們從東方草原開始追尋異變。';
        if (!s.storyFlags.profStarterKit) {
          s.storyFlags.profStarterKit = true;
          s.inventory.pokeball = (s.inventory.pokeball || 0) + 3;
          s.inventory.potion = (s.inventory.potion || 0) + 2;
          giftMsg = '出發前，這份調查補給（精靈球 x3、傷藥 x2）送給你！往東前往「翡翠微風草原」收服野生寶可夢並挑戰「守護者莉莉」吧！';
        }
        this.persistSave(true);
        this.renderUI(true);
        this.openDialogue({
          speaker: npc.nameZh,
          role: npc.roleZh,
          sprite: npc.sprite,
          lines: [
            `${s.trainer.name}，你來得正好！最近北方星輝神殿頂端的「星輝結晶」突然碎裂，導致各地寶可夢躁動不安。`,
            '據說傳說中的超能力寶可夢「超夢」正在星輝祭壇甦醒，唯有集齊四大區域的守護徽章才能解開神殿封印！',
            giftMsg,
          ],
        });
      } else {
        const curQuest = (getTrackedQuest(s,getMap)||QUEST_STAGES[Math.min(QUEST_STAGES.length - 1, s.questStage)]);
        this.openDialogue({
          speaker: npc.nameZh,
          role: npc.roleZh,
          sprite: npc.sprite,
          lines: [
            `目前你已收服了 ${s.pokedex.caught.length} / 24 種寶可夢，並獲得了 ${s.badges.length} 枚徽章，做得太棒了！`,
            `當前主線指引：${curQuest.objectiveZh}`,
            '記得善用屬性相剋（火剋草與冰、水剋火、草與電剋水），受傷時隨時回晨曦鎮精靈醫院找喬伊護士治療喔！',
          ],
        });
      }
      return;
    }

    if (npc.kind === 'pokedex_reward') {
      const caughtCount = s.pokedex.caught.length;
      const newlyClaimed = [];
      for (const m of DEX_MILESTONES) {
        if (caughtCount >= m.count && !s.storyFlags[m.flag]) {
          s.storyFlags[m.flag] = true;
          s.gold += m.gold;
          s.inventory[m.itemId] = (s.inventory[m.itemId] || 0) + m.qty;
          newlyClaimed.push(`${m.title}：+${m.gold} 金幣、${ITEMS[m.itemId].nameZh} x${m.qty}`);
        }
      }
      if (newlyClaimed.length > 0) {
        this.audio.playSfx('level_up');
        this.persistSave(true);
        this.renderUI(true);
        this.openDialogue({
          speaker: npc.nameZh,
          role: npc.roleZh,
          sprite: npc.sprite,
          lines: [
            `太驚人了！你目前已經收服了 ${caughtCount} 種寶可夢！`,
            `這是研究所頒發給你的圖鑑里程碑獎勵：${newlyClaimed.join('；')}！`,
            '繼續探索六個地區與進化形態，朝全 24 種寶可夢圖鑑邁進吧！',
          ],
        });
      } else {
        const nextM = DEX_MILESTONES.find((m) => !s.storyFlags[m.flag]);
        this.openDialogue({
          speaker: npc.nameZh,
          role: npc.roleZh,
          sprite: npc.sprite,
          lines: [
            `你好，${s.trainer.name}！我是負責審核星輝圖鑑進度的研究員米雅。`,
            nextM
              ? `你目前已收服 ${caughtCount} 種寶可夢。再收服達 ${nextM.count} 種即可領取「${nextM.gold} 金幣 ＋ ${ITEMS[nextM.itemId].nameZh} x${nextM.qty}」！`
              : '恭喜你已經領取完所有 24 種全圖鑑最高榮譽獎賞！你就是真正的寶可夢圖鑑大師！',
          ],
        });
      }
      return;
    }

    if (npc.kind === 'mentor') {
      const lines = [
        '嗨！看到跟在你身後的寶可夢了嗎？打開右上角「🐾 隊伍/跟隨」，最多可以同時讓 3 隻寶可夢並肩跟隨你走遍世界！',
        '戰鬥小秘訣：施展屬性技能需要消耗 MP，而使用「⚔️ 普攻」不僅 0 MP 消耗，命中後還會回復 +5 MP！',
        '想捕捉稀有寶可夢時，記得先把敵方血量削弱到黃血或紅血，並去精靈商城購買「超級球」或「高級球」，捕獲率會大幅飆升！',
      ];
      if (!s.storyFlags.leoGift) {
        s.storyFlags.leoGift = true;
        s.inventory.ether = (s.inventory.ether || 0) + 2;
        lines.push('這 2 瓶回復 MP 的「魔力露」送給你，可在地圖背包或對戰中隨時使用！');
        this.persistSave(true);
        this.renderUI(true);
      }
      this.openDialogue({
        speaker: npc.nameZh,
        role: npc.roleZh,
        sprite: npc.sprite,
        lines,
      });
      return;
    }

    if (npc.kind === 'talk') {
      this.openDialogue({
        speaker: npc.nameZh,
        role: npc.roleZh,
        sprite: npc.sprite,
        lines: npc.dialogueZh || ['祝你旅途愉快！'],
      });
      return;
    }

    if (npc.kind === 'wild_boss') {
      this.openDialogue({
        speaker: npc.nameZh,
        role: npc.roleZh,
        sprite: npc.sprite,
        lines: [
          '卡比——呼嚕嚕……！（一隻體型巨大的野生卡比獸正躺在草地上熟睡，散發著驚人的氣勢！）',
          '這隻野生頭目可以被精靈球捕獲！要先削減牠的血量再嘗試收服嗎？',
        ],
        choices: [
          {
            id: 'fight',
            label: `⚔️ 挑戰野生頭目 ${npc.nameZh} (Lv.${npc.level})`,
            primary: true,
            onSelect: () => {
              this.startBattle({
                isTrainer: false,
                wildBossNpcId: npc.id,
                enemyTeam: [createPokemonInstance(npc.speciesId, npc.level)],
                isBossMusic: true,
              });
            },
          },
          { id: 'leave', label: '先去準備補給', primary: false },
        ],
      });
      return;
    }

    if (npc.kind === 'legendary_boss') {
      if (s.questStage < 5 && !s.badges.includes('astral_badge')) {
        this.openDialogue({
          speaker: '星輝祭壇結界',
          role: '古代封印',
          sprite: npc.sprite,
          lines: [
            '強大的星輝超能力結界籠罩著祭壇……超夢正處於封印深處。',
            '請先獲得三大區域徽章，並擊敗南側神殿步道的「幻影賢者瑟琳」以解除祭壇封印！',
          ],
        });
        return;
      }
      this.openDialogue({
        speaker: npc.nameZh,
        role: npc.roleZh,
        sprite: npc.sprite,
        lines: [
          '「……人類的訓練員啊，你竟能跨越星輝四方試煉來到吾之面前。」',
          '「展現你與寶可夢的全部羈絆吧——看你能否平息或收服吾之星輝之力！」',
        ],
        choices: [
          {
            id: 'fight_mewtwo',
            label: '🌟 決戰傳說寶可夢・超夢 (Lv.22 可捕獲！)',
            primary: true,
            onSelect: () => {
              this.startBattle({
                isTrainer: false,
                legendaryNpcId: npc.id,
                enemyTeam: [createPokemonInstance(npc.speciesId, npc.level)],
                isBossMusic: true,
              });
            },
          },
          { id: 'prepare', label: '稍作整備再戰', primary: false },
        ],
      });
      return;
    }

    if (npc.kind === 'boss_trainer') {
      const alreadyDefeated = s.defeatedNpcs.includes(npc.id);
      this.openDialogue({
        speaker: npc.nameZh,
        role: npc.roleZh,
        sprite: npc.sprite,
        lines: alreadyDefeated
          ? [`不愧是獲得「${npc.badgeNameZh}」的出色訓練員！想再來一場全力以赴的切磋對戰嗎？`]
          : npc.introZh,
        choices: [
          {
            id: 'challenge',
            label: alreadyDefeated ? `⚔️ 與 ${npc.nameZh} 再次切磋` : `🔥 接受 ${npc.nameZh} 的挑戰！`,
            primary: true,
            onSelect: () => {
              const team = npc.team.map((entry) => createPokemonInstance(entry.speciesId, entry.level));
              this.startBattle({
                isTrainer: true,
                trainerNpc: npc,
                trainerName: `${npc.roleZh} ${npc.nameZh}`,
                enemyTeam: team,
                isBossMusic: true,
              });
            },
          },
          { id: 'cancel', label: '稍後再來', primary: false },
        ],
      });
    }
  }

  buyShopItem(itemId, qty = 1) {
    const item = ITEMS[itemId];
    if (!item || !this.save) return;
    const totalCost = item.price * qty;
    if (this.save.gold < totalCost) {
      this.audio.playSfx('ui_cancel');
      this.toast('金幣不足！');
      return;
    }
    this.save.gold -= totalCost;
    this.save.inventory[itemId] = (this.save.inventory[itemId] || 0) + qty;
    this.audio.playSfx('buy_coin');
    this.toast(`🪙 已購買 ${item.nameZh} x${qty}（花費 ${totalCost} 金幣）`);
    this.renderModalUI();
    this.renderUI(true);
    this.persistSave(true);
  }

  performHospitalHeal() {
    if (!this.save) return;
    const info = computeHospitalCost(this.save.party);
    if (!info.needsHeal) return;

    for (const mon of this.save.party) {
      mon.hp = mon.maxHp;
      mon.mp = mon.maxMp;
      mon.status = null;
    }
    this.save.stats.hospitalVisits = (this.save.stats.hospitalVisits || 0) + 1;

    this.audio.playSfx('hospital_jingle');
    this.toast('💖 治療完成！喬伊護士已免費為全隊寶可夢恢復滿 HP、MP 並解除瀕死與異常狀態！');
    if (this.modal) this.modal.emergencyMessage = null;
    this.renderModalUI();
    this.renderUI(true);
    this.persistSave(true);
  }

  async useMedicineItem(itemId, uid) {
    if (!this.save) return;
    const item = ITEMS[itemId];
    const qty = this.save.inventory[itemId] || 0;
    const mon = this.save.party.find((m) => m.uid === uid);
    if (!item || qty <= 0 || !mon) return;

    if (!canUseMedicineOnPokemon(itemId, mon)) {
      this.audio.playSfx('ui_cancel');
      this.toast('該寶可夢目前無需使用此道具！');
      return;
    }

    const res = applyMedicineToPokemon(itemId, mon);
    if (!res.applied) return;

    this.save.inventory[itemId] -= 1;
    if (this.save.inventory[itemId] <= 0) {
      delete this.save.inventory[itemId];
    }

    this.audio.playSfx('heal_potion');
    const parts = [];
    if (res.revived) parts.push('成功復活');
    if (res.hpRestored > 0) parts.push(`+${res.hpRestored} HP`);
    if (res.mpRestored > 0) parts.push(`+${res.mpRestored} MP`);
    const summary = `對「${monDisplayName(mon)}」使用了${item.nameZh}（${parts.join('、') || '解除異常'}）！`;
    this.toast(`💊 ${summary}`);

    if (this.screen === 'battle' && this.battle) {
      // Using an item in battle consumes the player's turn
      this.closeModal();
      this.battle.busy = true;
      this.battle.subMenu = null;
      this.battle.logs.push(summary);
      this.renderer.triggerBattleSkillVfx({ fromSide: 'player', vfx: 'heal_green', skillType: 'grass' });
      this.renderUI(true);
      await this.renderer.waitForBattleVisuals();
      await this.runEnemyTurnInBattle();
      this.battle && (this.battle.busy = false);
      this.renderUI(true);
      await this.persistSave(true);
    } else {
      // Overworld Backpack instant heal!
      this.renderModalUI();
      this.renderUI(true);
      await this.persistSave(true);
    }
  }

  toggleFollower(uid) {
    if (!this.save) return;
    const allOwned = [...this.save.party, ...this.save.box];
    const mon = allOwned.find((m) => m.uid === uid);
    if (!mon) return;

    const idx = this.save.followers.indexOf(uid);
    if (idx !== -1) {
      if (this.save.followers.length <= 1) {
        this.audio.playSfx('ui_cancel');
        this.toast('至少保留 1 隻寶可夢跟隨同行！可直接點擊其他寶可夢替換。');
        return;
      }
      this.save.followers.splice(idx, 1);
      this.audio.playSfx('ui_click');
      this.toast(`已取消「${monDisplayName(mon)}」的地圖跟隨。`);
    } else {
      if (this.save.followers.length >= 3) {
        // Smooth 1-click swap of slot #3 when 3 followers are already active
        this.save.followers[2] = uid;
        this.toast(`🐾 已更換跟隨隊列：「${monDisplayName(mon)}」加入第 3 跟隨位！`);
      } else {
        this.save.followers.push(uid);
        this.toast(`🐾 「${monDisplayName(mon)}」開始跟隨在訓練員身後！（${this.save.followers.length}/3）`);
      }
      this.audio.playSfx('ui_confirm');
    }

    this.syncRendererWithSave(false);
    this.renderModalUI();
    this.renderUI(true);
    this.persistSave(true);
  }

  setPartyLead(uid) {
    if (!this.save) return;
    const idx = this.save.party.findIndex((m) => m.uid === uid);
    if (idx <= 0) return;
    const [mon] = this.save.party.splice(idx, 1);
    this.save.party.unshift(mon);
    this.audio.playSfx('ui_confirm');
    this.toast(`👑 已將「${monDisplayName(mon)}」設為首發出戰寶可夢！`);
    this.renderModalUI();
    this.renderUI(true);
    this.persistSave(true);
  }

  movePartyToBox(uid) {
    if (!this.save || this.save.party.length <= 1) return;
    const idx = this.save.party.findIndex((m) => m.uid === uid);
    if (idx === -1) return;
    const remainingHealthy = this.save.party.filter((m, i) => i !== idx && m.hp > 0);
    if (remainingHealthy.length === 0) {
      this.audio.playSfx('ui_cancel');
      this.toast('出戰隊伍至少需要保留 1 隻有戰鬥能力的寶可夢！');
      return;
    }
    const [mon] = this.save.party.splice(idx, 1);
    this.save.box.push(mon);
    this.audio.playSfx('ui_click');
    this.toast(`📦 「${monDisplayName(mon)}」已存入保管箱。`);
    this.renderModalUI();
    this.renderUI(true);
    this.persistSave(true);
  }

  moveBoxToParty(uid) {
    if (!this.save || this.save.party.length >= 6) return;
    const idx = this.save.box.findIndex((m) => m.uid === uid);
    if (idx === -1) return;
    const [mon] = this.save.box.splice(idx, 1);
    this.save.party.push(mon);
    this.audio.playSfx('ui_confirm');
    this.toast(`⚔️ 「${monDisplayName(mon)}」已加入出戰隊伍！`);
    this.renderModalUI();
    this.renderUI(true);
    this.persistSave(true);
  }

  interactWithFollower(idx) {
    if (!this.save || this.dialogue || this.modal) return;
    const allMons = [...this.save.party, ...this.save.box];
    const uid = this.save.followers[idx];
    const mon = allMons.find((m) => m.uid === uid);
    if (!mon) return;

    const sp = POKEMON_SPECIES[mon.speciesId];
    this.audio.playSfx('mon_cry');

    const name = monDisplayName(mon);
    let moodText = '';
    if (mon.hp <= 0) {
      moodText = `「${name}」目前處於瀕死無力狀態，需要使用復活之星或前往晨曦鎮精靈醫院！`;
    } else if (mon.hp < mon.maxHp * 0.3) {
      moodText = `（${name} 呼吸有些急促，似乎在剛才的冒險中消耗了不少體力… 需要使用傷藥進行治療。）`;
    } else if (mon.hp >= mon.maxHp * 0.85) {
      moodText = `（${name} 開心地搖著尾巴圍著你歡快轉圈，親暱地蹭了蹭你的手背！❤️ 羈絆充沛！）`;
    } else {
      moodText = `（${name} 精神抖擻地看著四周，擺出隨時並肩作戰的架勢！⭐）`;
    }

    this.openDialogue({
      speaker: name,
      role: `✨ 跟隨夥伴 #${idx + 1} ｜ Lv.${mon.level} ${sp?.nameZh || ''}`,
      sprite: `/pokemon-rpg/assets/pokemon/${mon.speciesId}.webp`,
      lines: [moodText],
      choices: [
        {
          id: 'pet',
          label: '❤️ 輕撫互動（增加羈絆）',
          primary: true,
          onSelect: () => {
            this.audio.playSfx('mon_cry');
            this.toast(`❤️ 你溫柔地撫摸了「${name}」，它的眼神充滿了依戀與信任！`);
          },
        },
        {
          id: 'team_settings',
          label: '🐾 查看詳細能力與立繪',
          primary: false,
          onSelect: () => {
            this.openModal({ type: 'team', tab: 'party', selectedUid: mon.uid });
          },
        },
        {
          id: 'feed_item',
          label: '🎒 打開背包餵食藥劑',
          primary: false,
          onSelect: () => {
            this.openModal({ type: 'bag', tab: 'medicine', selectedItemId: 'potion' });
          },
        },
        {
          id: 'close',
          label: '繼續並肩探索！',
          primary: false,
        },
      ],
    });
  }

  // =========================================================================
  // TURN-BASED BATTLE, CAPTURE, LEVEL-UP & EVOLUTION ENGINE
  // =========================================================================
  triggerRandomEncounterInCurrentZone() {
    if (!this.save) return;
    const zoneId = this.save.position.zone || 'dawnleaf';
    const rolled = rollWildEncounter(zoneId);
    if (!rolled) return;
    const wildMon = createPokemonInstance(rolled.speciesId, rolled.level, {
      caughtZone: zoneId,
    });
    this.startBattle({
      isTrainer: false,
      enemyTeam: [wildMon],
      isBossMusic: false,
    });
  }

  startBattle({
    isTrainer = false,
    trainerNpc = null,
    trainerName = '',
    wildBossNpcId = null,
    legendaryNpcId = null,
    enemyTeam = [],
    isBossMusic = false,
  }) {
    if (!this.save || enemyTeam.length === 0) return;
    this.clearFeedback();

    let leadMon = this.save.party.find((m) => m.hp > 0);
    if (!leadMon) {
      this.handlePartyBlackout();
      return;
    }

    this.clickTarget = null;
    this.isMoving = false;
    this.dialogue = null;
    this.modal = null;
    this.renderDialogue();
    this.renderModalUI();

    const zoneId = this.save.position.zone || 'dawnleaf';
    const zone = getMap(zoneId);
    const enemyMon = enemyTeam[0];
    const enemySp = POKEMON_SPECIES[enemyMon.speciesId];

    if (!this.save.pokedex.seen.includes(enemyMon.speciesId)) {
      this.save.pokedex.seen.push(enemyMon.speciesId);
    }

    this.triggerFlash();
    this.audio.playSfx('encounter_alert');
    this.audio.setMusicTrack(isBossMusic || isTrainer ? 'boss_battle' : 'wild_battle');

    this.battle = {
      isTrainer,
      trainerNpc,
      trainerName,
      wildBossNpcId,
      legendaryNpcId,
      backdrop: zone.battleBackdrop || 'meadow',
      playerMon: leadMon,
      enemyTeam,
      enemyIndex: 0,
      enemyMon,
      playerStages: { atk: 0, def: 0, spd: 0 },
      enemyStages: { atk: 0, def: 0, spd: 0 },
      subMenu: null,
      busy: false,
      logs: [
        isTrainer
          ? `${trainerName} 派出了「${enemySp.nameZh}」(Lv.${enemyMon.level})！`
          : `野生的「${enemySp.nameZh}」(Lv.${enemyMon.level}) 跳了出來！`,
        `去吧，「${monDisplayName(leadMon)}」！請選擇戰鬥指令。`,
      ],
    };

    this.screen = 'battle';
    this.renderer.enterBattleStage({
      backdrop: this.battle.backdrop,
      playerMon: leadMon,
      enemyMon,
    });
    this.renderUI(true);
  }

  playCombatSfx(actionResult) {
    if (!actionResult.acted || actionResult.missed) {
      this.audio.playSfx('ui_cancel');
      return;
    }
    if (actionResult.healed > 0 && actionResult.damage === 0) {
      this.audio.playSfx('heal_potion');
      return;
    }
    const fxKey = `fx_${actionResult.skillType}`;
    this.audio.playSfx(fxKey);
  }

  playCombatHitSfx(actionResult) {
    if(actionResult.damage<=0) return;
    if (actionResult.crit) this.audio.playSfx('hit_crit');
    else if (actionResult.effectivenessTone === 'super') this.audio.playSfx('hit_super');
    else if (actionResult.effectivenessTone === 'weak') this.audio.playSfx('hit_weak');
    else this.audio.playSfx('hit_normal');
  }

  async executePlayerBattleMove(skillId) {
    if (!this.battle || this.battle.busy) return;
    const b = this.battle;
    b.busy = true;
    b.subMenu = null;
    this.renderUI(true);

    const playerSpeed = getEffectiveSpeed(b.playerMon, b.playerStages);
    const enemySpeed = getEffectiveSpeed(b.enemyMon, b.enemyStages);
    const playerFirst = playerSpeed >= enemySpeed;

    if (playerFirst) {
      await this.performSingleCombatStep('player', skillId);
      if (!this.battle) return;
      if (b.enemyMon.hp <= 0) {
        await this.handleEnemyFainted();
        return;
      }
      await this.runEnemyTurnInBattle();
    } else {
      await this.runEnemyTurnInBattle();
      if (!this.battle) return;
      if (b.playerMon.hp > 0) {
        await this.performSingleCombatStep('player', skillId);
        if (!this.battle) return;
        if (b.enemyMon.hp <= 0) {
          await this.handleEnemyFainted();
          return;
        }
      }
    }

    if (this.battle) {
      await this.processEndOfRoundStatuses();
      if (this.battle) {
        this.battle.busy = false;
        this.renderUI(true);
      }
    }
  }

  async performSingleCombatStep(side, chosenSkillId) {
    if (!this.battle) return;
    const b = this.battle;
    const isPlayer = side === 'player';
    const attacker = isPlayer ? b.playerMon : b.enemyMon;
    const defender = isPlayer ? b.enemyMon : b.playerMon;
    const attackerStages = isPlayer ? b.playerStages : b.enemyStages;
    const defenderStages = isPlayer ? b.enemyStages : b.playerStages;
    const beforeHit = {
      playerMon: { ...b.playerMon }, enemyMon: { ...b.enemyMon },
      enemyTeam: b.enemyTeam.map(mon => ({ ...mon })), logs: [...b.logs],
    };

    const res = executeSkillAction({
      attacker,
      defender,
      attackerStages,
      defenderStages,
      skillId: chosenSkillId,
    });

    b.uiAction={side,name:monDisplayName(attacker),move:res.skillNameZh || '行動'};

    if (res.bonusGold > 0 && isPlayer && this.save) {
      this.save.gold += res.bonusGold;
    }

    for (const line of res.logs) {
      b.logs.push(line);
    }
    if (res.mpGained > 0 && isPlayer) {
      b.logs.push(`${monDisplayName(attacker)} 透過普攻凝聚氣息，回復了 +${res.mpGained} MP！`);
    }

    let visualFinished = null;
    if (res.acted && !res.missed) {
      b.presentation = beforeHit;
      this.renderer.triggerBattleSkillVfx({
        fromSide: side,
        vfx: res.vfx,
        skillId: res.skillId,
        skillType: res.skillType,
        damage: res.damage,
        crit: res.crit,
        typeMult: res.typeMult,
        effectivenessTone: res.effectivenessTone,
        skillNameZh: res.skillNameZh,
        healed: res.healed,
        onImpact: () => {
          if (this.battle !== b) return;
          b.presentation = null;
          this.playCombatHitSfx(res);
          this.renderUI(true);
        },
      });
      visualFinished = this.renderer.waitForBattleVisuals();
    }
    this.playCombatSfx(res);
    this.renderUI(true);
    if(visualFinished) await visualFinished;
    else await wait(680);
    if (this.battle === b && b.presentation) {
      b.presentation = null;
      this.renderUI(true);
    }
    if(this.battle===b){b.uiAction=null;this.renderUI(true);}
  }

  async runEnemyTurnInBattle() {
    if (!this.battle || this.battle.enemyMon.hp <= 0) return;
    const b = this.battle;
    const enemySkillId = chooseEnemySkill(b.enemyMon, b.playerMon);
    await this.performSingleCombatStep('enemy', enemySkillId);
    if (!this.battle) return;

    if (b.playerMon.hp <= 0) {
      await this.handlePlayerActiveFainted();
    }
  }

  async processEndOfRoundStatuses() {
    if (!this.battle) return;
    const b = this.battle;

    const pTick = applyEndOfTurnStatus(b.playerMon);
    if (pTick) {
      b.logs.push(pTick.log);
      this.renderUI(true);
      await wait(420);
      if (b.playerMon.hp <= 0) {
        await this.handlePlayerActiveFainted();
        if (!this.battle) return;
      }
    }

    const eTick = applyEndOfTurnStatus(b.enemyMon);
    if (eTick) {
      b.logs.push(eTick.log);
      this.renderUI(true);
      await wait(420);
      if (b.enemyMon.hp <= 0) {
        await this.handleEnemyFainted();
      }
    }
  }

  async executeCaptureAttempt(ballId) {
    if (!this.battle || this.battle.busy || !this.save) return;
    const b = this.battle;
    const item = ITEMS[ballId];
    const qty = this.save.inventory[ballId] || 0;
    if (!item || item.category !== 'ball' || qty <= 0 || b.isTrainer) return;

    b.busy = true;
    b.subMenu = null;
    this.save.inventory[ballId] -= 1;
    if (this.save.inventory[ballId] <= 0) delete this.save.inventory[ballId];

    const capInfo = computeCaptureChance({
      enemyMon: b.enemyMon,
      playerLevel: b.playerMon.level,
      ballId,
      isTrainerBattle: b.isTrainer,
    });
    const roll = rollCaptureAttempt(capInfo);
    const enemySp = POKEMON_SPECIES[b.enemyMon.speciesId];

    b.logs.push(`${this.save.trainer.name} 投擲了「${item.nameZh}」（預估成功率 ${capInfo.percent}%）！`);
    this.renderUI(true);

    this.audio.playSfx('ball_throw');
    setTimeout(() => this.audio.playSfx('ball_open'), 450);
    for (let s = 0; s < roll.shakes; s++) {
      setTimeout(() => {
        if (this.screen === 'battle') this.audio.playSfx('ball_shake');
      }, 960 + s * 620);
    }

    await this.renderer.playCaptureSequence3D({
      ballId,
      shakes: roll.shakes,
      caught: roll.caught,
    });

    if (roll.caught) {
      this.audio.playSfx('catch_success');
      b.logs.push(`✨ 喀嚓！成功收服了「${enemySp.nameZh}」(Lv.${b.enemyMon.level})！`);
      this.renderUI(true);
      await wait(750);

      // Register caught Pokémon
      const zoneId = this.save.position.zone || 'dawnleaf';
      const caughtInstance = createPokemonInstance(b.enemyMon.speciesId, b.enemyMon.level, {
        caughtBall: ballId,
        caughtZone: zoneId,
      });

      if (!this.save.pokedex.caught.includes(caughtInstance.speciesId)) {
        this.save.pokedex.caught.push(caughtInstance.speciesId);
      }
      if (!this.save.pokedex.seen.includes(caughtInstance.speciesId)) {
        this.save.pokedex.seen.push(caughtInstance.speciesId);
      }
      this.save.stats.pokemonCaught = (this.save.stats.pokemonCaught || 0) + 1;

      const notes = [];
      if (this.save.party.length < 6) {
        this.save.party.push(caughtInstance);
        notes.push('已加入出戰隊伍');
      } else {
        this.save.box.push(caughtInstance);
        notes.push('出戰隊伍已滿 6 隻，已傳送至寶可夢保管箱');
      }

      if (this.save.followers.length < 3) {
        this.save.followers.push(caughtInstance.uid);
        notes.push(`並已自動排入第 ${this.save.followers.length} 跟隨位陪你同行！`);
      } else {
        notes.push('可隨時在「隊伍/跟隨」切換為地圖跟隨夥伴！');
      }

      // Grant capture EXP & Gold
      const expGain = Math.round(enemySp.expYield * (0.72 + b.enemyMon.level * 0.14));
      const goldGain = Math.round(enemySp.goldYield * 0.9);
      this.save.gold += goldGain;
      this.awardPartyExperience(expGain, b.playerMon.uid);

      // Handle wild boss or Legendary Mewtwo story completion on capture!
      if (b.wildBossNpcId && !this.save.defeatedNpcs.includes(b.wildBossNpcId)) {
        this.save.defeatedNpcs.push(b.wildBossNpcId);
        this.save.gold += 300;
      }
      const caughtMewtwo = Boolean(b.legendaryNpcId);
      if (caughtMewtwo) {
        this.save.storyFlags.mewtwoCaught = true;
        if (!this.save.defeatedNpcs.includes(b.legendaryNpcId)) {
          this.save.defeatedNpcs.push(b.legendaryNpcId);
        }
        if (!this.save.badges.includes('starlight_crown')) {
          this.save.badges.push('starlight_crown');
        }
        this.save.questStage = Math.max(this.save.questStage, 6);
        this.save.gold += 2000;
      }

      this.encounterGraceDist = 3.6;
      this.enterOverworld();
      await this.persistSave(true);

      this.afterEvolutionCallback = () => {
        this.openModal({
          type: 'caught_showcase',
          mon: caughtInstance,
          placementNote: `${notes.join('，')}（獲得 +${expGain} EXP、+${goldGain} 金幣）`,
        });
        if (caughtMewtwo) {
          this.toast('👑 恭喜收服傳說超夢！你已成為星輝大陸總冠軍！');
        }
      };
      this.showNextEvolutionOrFinish();
    } else {
      this.audio.playSfx('catch_break');
      b.logs.push(
        roll.shakes >= 3
          ? `哎呀！就差一點點，「${enemySp.nameZh}」掙脫精靈球跳了出來！`
          : `「${enemySp.nameZh}」掙脫了精靈球！（${capInfo.hintZh || '削弱血量再試一次吧！'}）`
      );
      this.renderUI(true);
      await wait(650);

      await this.runEnemyTurnInBattle();
      if (this.battle) {
        await this.processEndOfRoundStatuses();
        if (this.battle) {
          this.battle.busy = false;
          this.renderUI(true);
        }
      }
      await this.persistSave(true);
    }
  }

  awardPartyExperience(baseExp, activeUid) {
    if (!this.save) return;
    for (const mon of this.save.party) {
      if (mon.hp <= 0) continue;
      const share = mon.uid === activeUid ? baseExp : Math.max(4, Math.round(baseExp * 0.45));
      const events = grantExpAndLevelUp(mon, share);
      for (const ev of events) {
        if (ev.type === 'level_up') {
          const sp = POKEMON_SPECIES[ev.speciesId];
          this.audio.playSfx('level_up');
          const skillNote = ev.newSkills.length ? ` 習得新技能：${ev.newSkills.join('、')}！` : '';
          this.toast(`🆙 ${sp.nameZh} 升到了 Lv.${ev.level}！${skillNote}`);
          if (this.battle) {
            this.battle.logs.push(`🆙 ${sp.nameZh} 升到了 Lv.${ev.level}！${skillNote}`);
          }
        } else if (ev.type === 'evolve') {
          if (!this.save.pokedex.seen.includes(ev.toId)) this.save.pokedex.seen.push(ev.toId);
          if (!this.save.pokedex.caught.includes(ev.toId)) this.save.pokedex.caught.push(ev.toId);
          this.pendingEvolutions.push(ev);
        }
      }
    }
  }

  showNextEvolutionOrFinish() {
    if (this.pendingEvolutions.length > 0) {
      const ev = this.pendingEvolutions.shift();
      this.audio.playSfx('evolve_fanfare');
      this.syncRendererWithSave(false);
      this.openModal({
        type: 'evolution',
        ...ev,
      });
      return;
    }
    this.closeModal();
    if (this.afterEvolutionCallback) {
      const cb = this.afterEvolutionCallback;
      this.afterEvolutionCallback = null;
      cb();
    }
  }

  async handleEnemyFainted() {
    if (!this.battle || !this.save) return;
    const b = this.battle;
    const enemySp = POKEMON_SPECIES[b.enemyMon.speciesId];
    this.audio.playSfx('faint');

    const mult = b.isTrainer ? 1.4 : 1.0;
    const expGain = Math.round(enemySp.expYield * (0.78 + b.enemyMon.level * 0.16) * mult);
    const goldGain = Math.round(enemySp.goldYield * (0.85 + b.enemyMon.level * 0.14) * mult);

    this.save.gold += goldGain;
    b.logs.push(`敵方「${enemySp.nameZh}」倒下了！獲得 +${expGain} EXP 與 +${goldGain} 金幣！`);
    this.awardPartyExperience(expGain, b.playerMon.uid);
    // Refresh active sprite in case active Pokémon evolved mid-battle!
    this.renderer.setBattlePokemon('player', b.playerMon);
    this.renderUI(true);
    await wait(850);

    // Check if Trainer has more Pokémon
    if (b.isTrainer && b.enemyIndex + 1 < b.enemyTeam.length) {
      b.enemyIndex += 1;
      b.enemyMon = b.enemyTeam[b.enemyIndex];
      b.enemyStages = { atk: 0, def: 0, spd: 0 };
      const nextSp = POKEMON_SPECIES[b.enemyMon.speciesId];
      if (!this.save.pokedex.seen.includes(b.enemyMon.speciesId)) {
        this.save.pokedex.seen.push(b.enemyMon.speciesId);
      }
      this.renderer.setBattlePokemon('enemy', b.enemyMon);
      b.logs.push(`${b.trainerName} 接著派出了「${nextSp.nameZh}」(Lv.${b.enemyMon.level})！`);
      b.busy = false;
      this.renderUI(true);
      return;
    }

    // Complete Battle Victory!
    this.audio.playSfx('victory_fanfare');
    this.save.stats.battlesWon = (this.save.stats.battlesWon || 0) + 1;

    let postVictoryDialogue = null;

    if (b.isTrainer && b.trainerNpc) {
      const npc = b.trainerNpc;
      const firstWin = !this.save.defeatedNpcs.includes(npc.id);
      if (firstWin) {
        this.save.defeatedNpcs.push(npc.id);
        if (npc.badgeId && !this.save.badges.includes(npc.badgeId)) {
          this.save.badges.push(npc.badgeId);
        }
        if (npc.rewardGold) {
          this.save.gold += npc.rewardGold;
        }
        const itemLabels = [];
        if (npc.rewardItems) {
          for (const [iid, q] of Object.entries(npc.rewardItems)) {
            this.save.inventory[iid] = (this.save.inventory[iid] || 0) + q;
            if (ITEMS[iid]) itemLabels.push(`${ITEMS[iid].nameZh} x${q}`);
          }
        }
        if (npc.nextQuestStage) {
          this.save.questStage = Math.max(this.save.questStage, npc.nextQuestStage);
        }
        const rewardLine = `🏆 獲得「${npc.badgeNameZh || '勝利之證'}」、賞金 +${npc.rewardGold || 0} 金幣${itemLabels.length ? `、${itemLabels.join('、')}` : ''}！`;
        postVictoryDialogue = {
          speaker: npc.nameZh,
          role: npc.roleZh,
          sprite: npc.sprite,
          lines: [...(npc.victoryZh || ['精彩絕倫的對決！']), rewardLine],
        };
      } else {
        this.save.gold += 180;
        this.toast(`🏆 切磋獲勝！額外獲得 +180 金幣！`);
      }
    }

    if (b.wildBossNpcId && !this.save.defeatedNpcs.includes(b.wildBossNpcId)) {
      this.save.defeatedNpcs.push(b.wildBossNpcId);
      this.save.gold += 300;
      this.toast('🏆 擊敗草原頭目卡比獸，獲得 +300 獎金！');
    }

    if (b.legendaryNpcId) {
      if (!this.save.badges.includes('starlight_crown')) {
        this.save.badges.push('starlight_crown');
      }
      this.save.questStage = Math.max(this.save.questStage, 6);
      this.save.gold += 1500;
      postVictoryDialogue = {
        speaker: '超夢',
        role: '星輝之巔傳說王者',
        sprite: '/pokemon-rpg/assets/pokemon/mewtwo.webp',
        lines: [
          '「令人讚嘆的羈絆……吾之暴走星輝已完全平息。」',
          '🏆 恭喜通關主線終章，成為「星輝冠軍」（獲得 +1500 金幣）！超夢仍會留在祭壇上，隨時可再帶大師球或高級球來收服牠完成全圖鑑！',
        ],
      };
    }

    await wait(650);
    this.encounterGraceDist = 3.6;
    this.enterOverworld();
    await this.persistSave(true);

    this.afterEvolutionCallback = () => {
      if (postVictoryDialogue) {
        this.openDialogue(postVictoryDialogue);
      }
    };
    this.showNextEvolutionOrFinish();
  }

  async handlePlayerActiveFainted() {
    if (!this.battle || !this.save) return;
    const b = this.battle;
    this.audio.playSfx('faint');
    b.logs.push(`「${monDisplayName(b.playerMon)}」體力耗盡倒下了！`);
    this.renderUI(true);
    await wait(650);

    const alive = this.save.party.filter((m) => m.hp > 0);
    if (alive.length > 0) {
      b.busy = false;
      this.openModal({ type: 'battle_switch', forced: true });
      return;
    }

    // Whole party fainted -> Canonical Pokémon Black Out (20% gold loss) & rescue to Dawnleaf Hospital!
    b.logs.push(`「${this.save.trainer.name}」手上沒有可以戰鬥的寶可夢了！眼前一片漆黑……`);
    this.renderUI(true);
    await wait(650);
    this.handlePartyBlackout();
  }

  handlePartyBlackout() {
    if (!this.save) return;
    const penalty = computeBlackoutPenalty(this.save.gold);
    this.save.gold = Math.max(0, this.save.gold - penalty);
    for (const mon of this.save.party) {
      mon.hp = mon.maxHp;
      mon.mp = mon.maxMp;
      mon.status = null;
    }
    this.save.position.x = 0;
    this.save.position.z = -1.8;
    this.save.position.facing = 'up';
    this.save.position.zone = 'dawnleaf';
    this.encounterGraceDist = 4.0;

    this.enterOverworld();
    this.audio.playSfx('hospital_jingle');
    this.openModal({
      type: 'hospital',
      emergencyMessage: `「${this.save.trainer.name} 手上沒有可以戰鬥的寶可夢了，眼前一片漆黑！」你在慌亂中抱著力竭的寶可夢趕回晨曦鎮精靈醫院${penalty > 0 ? `（途中遺失了 20% 金幣：-${penalty} 金幣）` : ''}。喬伊護士已免費為全隊完成緊急治療與復活！`,
    });
    this.persistSave(true);
  }

  async executeBattleSwitch(partyIdx) {
    if (!this.battle || !this.save) return;
    const nextMon = this.save.party[partyIdx];
    if (!nextMon || nextMon.hp <= 0 || nextMon.uid === this.battle.playerMon.uid) return;

    const wasForced = Boolean(this.modal?.forced);
    this.closeModal();

    const b = this.battle;
    b.busy = true;
    b.subMenu = null;
    b.playerMon = nextMon;
    b.playerStages = { atk: 0, def: 0, spd: 0 };
    this.renderer.setBattlePokemon('player', nextMon);
    this.audio.playSfx('ball_open');
    b.logs.push(`換上了「${monDisplayName(nextMon)}」(Lv.${nextMon.level}) 出戰！`);
    this.renderUI(true);
    await wait(550);

    if (!wasForced) {
      await this.runEnemyTurnInBattle();
      if (this.battle) {
        await this.processEndOfRoundStatuses();
      }
    }

    if (this.battle) {
      this.battle.busy = false;
      this.renderUI(true);
    }
  }

  async executeBattleEscape() {
    if (!this.battle || this.battle.busy || this.battle.isTrainer) return;
    const b = this.battle;
    b.busy = true;
    b.subMenu = null;

    const speedRatio = b.playerMon.spd / Math.max(1, b.enemyMon.spd);
    const escapeChance = b.playerMon.level >= b.enemyMon.level ? 0.96 : Math.min(0.94, 0.65 + speedRatio * 0.2);

    if (Math.random() < escapeChance) {
      this.audio.playSfx('ui_confirm');
      b.logs.push('成功脫離了野生寶可夢戰鬥！');
      this.renderUI(true);
      await wait(420);
      this.encounterGraceDist = 3.6;
      this.enterOverworld();
      await this.persistSave(true);
    } else {
      this.audio.playSfx('ui_cancel');
      b.logs.push('被對手繞到了前方，沒能逃走！');
      this.renderUI(true);
      await wait(550);
      await this.runEnemyTurnInBattle();
      if (this.battle) {
        await this.processEndOfRoundStatuses();
        if (this.battle) {
          this.battle.busy = false;
          this.renderUI(true);
        }
      }
    }
  }

  // =========================================================================
  // 60FPS GAME LOOP & SMART HUD DIFFING
  // =========================================================================
  syncBattleViewport() {
    const rect = (selector) => this.hudMount.querySelector(selector)?.getBoundingClientRect();
    const enemy = rect('.combatant-plate.enemy'), context = rect('.battle-context-tag');
    const player = rect('.combatant-plate.player'), commands = rect('.battle-command-panel');
    if (!enemy || !player || !commands) return;
    const canvas = this.canvasMount.getBoundingClientRect();
    const top = Math.max(enemy.bottom,context?.bottom || 0)-canvas.top+12;
    const bottom = Math.min(player.top,commands.top)-canvas.top-12;
    this.renderer.setBattleViewport({ left: 14, right: canvas.width-14, top, bottom });
  }

  renderUI(force = false) {
    if (this.screen === 'title') {
      const sig = `title|${Boolean(this.save)}|${this.audio.muted}|${this.save?.gold}`;
      if (!force && sig === this._lastHudSignature) return;
      this._lastHudSignature = sig;
      this.hudMount.innerHTML = renderTitleScreen({
        save: this.save,
        userName: this.user?.name,
        muted: this.audio.muted,
      });
      return;
    }

    if (this.screen === 'creation') {
      this._lastHudSignature = 'creation';
      this.hudMount.innerHTML = renderCreationScreen({
        draft: this.creationDraft,
        hasExistingSave: Boolean(this.save),
      });
      return;
    }

    if (this.screen === 'battle' && this.battle) {
      this._lastHudSignature = 'battle';
      this.hudMount.innerHTML = renderBattleHud({
        battle: this.battle.presentation ? { ...this.battle, ...this.battle.presentation } : this.battle,
        save: this.save,
      });
      const logEl = this.hudMount.querySelector('#battle-log-scroll');
      if (logEl) logEl.scrollTop = logEl.scrollHeight;
      this.renderFeedback();
      this.syncBattleViewport();
      return;
    }

    if (this.screen === 'world' && this.save) {
      const zoneId = this.save.position.zone || 'dawnleaf';
      const currentZone = getMap(zoneId);
      const quest = (getTrackedQuest(this.save,getMap)||QUEST_STAGES[Math.min(QUEST_STAGES.length - 1, this.save.questStage || 0)]);
      const questInSameZone = !quest.targetZone || quest.targetZone === zoneId;
      const questDist = questInSameZone
        ? Math.hypot(
            quest.targetPos.x - this.save.position.x,
            quest.targetPos.z - this.save.position.z
          )
        : null;
      const nearbyPrompt = this.getNearbyInteraction();
      const inTallGrass = Boolean(getTallGrassAt(this.save.position.x, this.save.position.z, zoneId));

      const sig = [
        'world',
        zoneId,
        this.save.gold,
        this.save.questStage,quest.id||'',quest.objectiveZh,
        Math.round(questDist),
        nearbyPrompt?.label || '',
        inTallGrass ? '1' : '0',
        this.audio.muted ? '1' : '0',
        this.save.followers.join(','),
        this.save.party.map((m) => `${m.uid}:${m.hp}:${m.mp}:${m.level}`).join(','),
      ].join('|');

      if (force || sig !== this._lastHudSignature) {
        this._lastHudSignature = sig;
        this.hudMount.innerHTML = renderOverworldHud({
          save: this.save,
          currentZone,
          quest,
          questDist,
          nearbyPrompt,
          inTallGrass,
          muted: this.audio.muted,
          questExpanded:Boolean(this.questDetailsExpanded),
        });
      }

      const miniCanvas = this.hudMount.querySelector('#rpg-minimap-canvas');
      if (miniCanvas) {
        drawLocalMinimap(miniCanvas, this.save, quest);
      }
    }
  }

  updateOverworldMovement(dt) {
    if (this.screen !== 'world' || !this.save || this.dialogue || this.modal) {
      this.isMoving = false;
      return;
    }

    let vx = 0;
    let vz = 0;

    if (this.keys.has('w') || this.keys.has('arrowup') || this.dpadDir === 'up') vz -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown') || this.dpadDir === 'down') vz += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft') || this.dpadDir === 'left') vx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright') || this.dpadDir === 'right') vx += 1;

    if (vx !== 0 || vz !== 0) {
      this.clickTarget = null;
    } else if (this.clickTarget) {
      const dx = this.clickTarget.x - this.save.position.x;
      const dz = this.clickTarget.z - this.save.position.z;
      if (Math.hypot(dx, dz) < 0.25) {
        this.clickTarget = null;
      } else {
        vx = dx;
        vz = dz;
      }
    }

    const len = Math.hypot(vx, vz);
    if (len < 0.001) {
      this.isMoving = false;
      return;
    }

    vx /= len;
    vz /= len;

    const sprinting = this.keys.has('shift');
    // At the rendered human scale this is a grounded brisk walk. The old
    // 6.2-unit pace crossed several body lengths per cycle and caused sliding.
    const speed = sprinting ? 3.6 : 1.8;
    const stepX = vx * speed * dt;
    const stepZ = vz * speed * dt;

    const curZone = this.save.position.zone || 'dawnleaf';
    const curX = this.save.position.x;
    const curZ = this.save.position.z;
    let nextX = curX;
    let nextZ = curZ;

    if (isPositionWalkable(curX + stepX, curZ + stepZ, curZone)) {
      nextX = curX + stepX;
      nextZ = curZ + stepZ;
    } else if (isPositionWalkable(curX + stepX, curZ, curZone)) {
      nextX = curX + stepX;
    } else if (isPositionWalkable(curX, curZ + stepZ, curZone)) {
      nextZ = curZ + stepZ;
    } else {
      this.clickTarget = null;
      this.isMoving = false;
      return;
    }

    const distMoved = Math.hypot(nextX - curX, nextZ - curZ);
    this.isMoving = distMoved > 0.0005;
    if (!this.isMoving) return;

    this.save.position.x = Number(nextX.toFixed(3));
    this.save.position.z = Number(nextZ.toFixed(3));

    this.save.position.facing = getTravelFacing(nextX-curX,nextZ-curZ,this.save.position.facing);

    // Portal Gate trigger check!
    const portal = getPortalAt(nextX, nextZ, curZone);
    if (portal && !this.portalCooldown) {
      this.triggerZoneTransition(portal);
      return;
    }

    if (this.encounterGraceDist > 0) {
      this.encounterGraceDist = Math.max(0, this.encounterGraceDist - distMoved);
    }

    const grassPatch = getTallGrassAt(nextX, nextZ, curZone);
    this.footstepSfxAccum += distMoved;
    const walkAtlas=this.artTrial && (!this.artTrial.direction || this.artTrial.direction===this.save.position.facing) ? this.artTrial : this.currentArtPreview ? CURRENT_TRAINER_DRAFTS[this.save.trainer.avatarId] : WALK_ATLASES.trainers[this.save.trainer.avatarId];
    const contactDistance=(walkAtlas?.strideWorld || 1.4)*.5;
    if (this.footstepSfxAccum >= contactDistance) {
      this.footstepSfxAccum %= contactDistance;
      this.audio.playSfx(grassPatch ? 'step_grass' : 'step_stone');
    }

    // Random wild encounter check in tall grass!
    if (grassPatch && this.encounterGraceDist <= 0) {
      this.grassStepAccum += distMoved;
      if (this.grassStepAccum >= 0.85) {
        this.grassStepAccum = 0;
        if (Math.random() < 0.26) {
          this.triggerRandomEncounterInCurrentZone();
        }
      }
    } else if (!grassPatch) {
      this.grassStepAccum = 0;
    }
  }

  loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this._lastFrameTime) / 1000);
    this._lastFrameTime = now;

    if (this.save && (this.screen === 'world' || this.screen === 'battle')) {
      this.playTimeAccum += dt;
      if (this.playTimeAccum >= 1) {
        const secs = Math.floor(this.playTimeAccum);
        this.playTimeAccum -= secs;
        this.save.stats.playSeconds = (this.save.stats.playSeconds || 0) + secs;
      }

      if (this.screen === 'world') {
        this.autoSaveAccum += dt;
        if (this.autoSaveAccum >= 25) {
          this.autoSaveAccum = 0;
          this.persistSave(true);
        }
      }
    }

    if (this.screen === 'world' && this.save) {
      this.updateOverworldMovement(dt);
      const quest = (getTrackedQuest(this.save,getMap)||QUEST_STAGES[Math.min(QUEST_STAGES.length - 1, this.save.questStage || 0)]);
      this.renderer.worldSave=this.save;
      ensureAdventure(this.save);
      this.renderer.updateWorld({
        playerPos: this.save.position,
        isMoving: this.isMoving,
        facing: this.save.position.facing,
        questTarget: quest ? { ...quest.targetPos, zone: quest.targetZone } : null,
        defeatedNpcs: this.save.defeatedNpcs,
        dialogueOpen: Boolean(this.dialogue),
      });
      this.renderUI(false);
    } else if (this.screen === 'battle' && this.battle) {
      this.renderer.updateBattle();
    } else if (this.renderer && this.screen !== 'battle') {
      // Render serene background town panorama behind title/creation if visible
      const previewPos = this.save?.position || { x: 0, z: 4.5, facing: 'down' };
      this.renderer.updateWorld({
        playerPos: previewPos,
        isMoving: false,
        facing: 'down',
        questTarget: null,
        defeatedNpcs: this.save?.defeatedNpcs || [],
        dialogueOpen: false,
      });
    }

    this._rafId = requestAnimationFrame(() => this.loop());
  }
}
