import { ELEMENT_TYPES, RARITY_TIERS, getTypeMultiplier, getEffectivenessText } from '../data/types.mjs';
import { ITEMS, SHOP_ITEM_ORDER, canUseMedicineOnPokemon } from '../data/items.mjs';
import {
  POKEMON_SPECIES,
  POKEMON_LIST,
  STARTER_IDS,
  expForNextLevel,
  computeStatsForLevel,
  getUnlockedSkills,
} from '../data/pokemon.mjs';
import { TRAINER_AVATARS, QUEST_STAGES, NPCS } from '../data/trainers.mjs';
import { MAP_ZONES, ZONES, getMap } from '../data/world.mjs';
import { computeCaptureChance, computeHospitalCost, CAMP_HERB_COST, CAMP_LIGHT_COOLDOWN_MS } from '../engine/battleMath.mjs';
import {NAVIGATION_ART,ATLAS_LANDMARKS} from '../data/navigationArt.mjs';
import {drawIllustratedMinimap} from './worldMapCanvas.mjs';
import {renderQuestJournal} from './questJournal.mjs';
import {getTrackedQuest} from '../engine/questEngine.mjs';
import {getThemedFieldArt} from '../data/themeAtlas.mjs';

export function esc(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function gameIcon(name) {
  const paths = {
    team: '<circle cx="8" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M2 21v-4a6 6 0 0 1 12 0v4m2-7a5 5 0 0 1 6 5v2"/>',
    bag: '<path d="M5 9h14l2 12H3L5 9Zm3 0V6a4 4 0 0 1 8 0v3M8 15h8"/>',
    dex: '<path d="M4 3h16v18H4zM8 3v18m4-13h4m-4 4h4m-4 4h2"/>',
    map: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4 4-2ZM12 1v3m0 16v3M1 12h3m16 0h3"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    home: '<path d="m2 11 10-9 10 9M5 9v13h14V9m-10 13v-8h6v8"/>',
    save: '<path d="M3 3h15l3 3v15H3zM7 3v6h10V3M7 21v-8h10v8"/>',
  };
  return `<svg class="game-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.menu}</svg>`;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function renderTypeBadge(typeId) {
  const t = ELEMENT_TYPES[typeId] || ELEMENT_TYPES.normal;
  return `<span class="type-badge" style="background:${t.bg};color:${t.color};border:1px solid ${t.color}66">${t.icon} ${esc(t.nameZh)}</span>`;
}

export function renderRarityBadge(rarityId) {
  const r = RARITY_TIERS[rarityId] || RARITY_TIERS.common;
  const stars = '★'.repeat(r.stars);
  return `<span class="rarity-badge" data-rarity="${esc(r.id)}" style="background:${r.border}33;color:${r.color};border:1px solid ${r.border}">${stars} ${esc(r.nameZh)}</span>`;
}

export function renderStatusBadge(mon) {
  if (!mon) return '';
  if (mon.hp <= 0) return `<span class="status-badge faint">瀕死</span>`;
  if (mon.status === 'burn') return `<span class="status-badge burn">🔥 灼傷</span>`;
  if (mon.status === 'paralyze') return `<span class="status-badge paralyze">⚡ 麻痺</span>`;
  if (mon.status === 'sleep') return `<span class="status-badge sleep">💤 睡眠</span>`;
  return '';
}

export function hpColor(ratio) {
  if (ratio > 0.5) return 'var(--hp-high)';
  if (ratio > 0.22) return 'var(--hp-mid)';
  return 'var(--hp-low)';
}

export function monDisplayName(mon) {
  if (!mon) return '寶可夢';
  const sp = POKEMON_SPECIES[mon.speciesId];
  return mon.nickname ? mon.nickname : sp?.nameZh || mon.speciesId;
}

export function renderTitleScreen({ save, userName, muted }) {
  const avatar = save ? (TRAINER_AVATARS.find((a) => a.id === save.trainer.avatarId) || TRAINER_AVATARS[0]) : null;
  const zone = save ? (ZONES[save.position?.zone] || ZONES.dawnleaf) : null;

  return `
    <div class="full-overlay title-screen" style="background-image:url('/pokemon-rpg/assets/overhaul/ui/title-vista-v1.webp')" data-testid="title-screen">
      <div class="title-top-bar">
        <a href="/" class="pill-btn" data-testid="back-to-buio">← 返回 BuiO 平台</a>
        <button type="button" class="pill-btn" data-action="toggle-mute" data-testid="mute-btn">
          ${muted ? '🔇 音樂已靜音' : '🔊 原創交響配樂開啟'}
        </button>
      </div>

      <div class="title-hero-center">
        <span class="title-kicker">A STARLIGHT ADVENTURE</span>
        <h1 class="title-logo-main">星輝寶可夢物語</h1>
        <p class="title-subtitle">
          <span>穿越星輝大陸，與夥伴並肩同行。</span>
          <span>培育、對戰、相遇，寫下屬於你的冒險物語。</span>
        </p>

        ${save ? `
          <div class="save-summary-card" data-testid="existing-save-card">
            <div class="save-summary-left">
              <img src="${esc(avatar.sprite)}" alt="${esc(save.trainer.name)}" class="save-avatar-thumb" />
              <div>
                <div style="font-weight:900;font-size:1.05rem;color:#fff">
                  ${esc(save.trainer.name)}
                  <span class="gold-pill" style="margin-left:6px">🪙 ${save.gold}</span>
                </div>
                <div style="font-size:0.82rem;color:var(--text-sub);margin-top:2px">
                  📍 ${esc(zone.nameZh)} ｜ 🏅 徽章 ${save.badges.length} ｜ 📖 圖鑑 ${save.pokedex.caught.length}/24
                </div>
              </div>
            </div>
            <div class="save-party-minis">
              ${save.party.map((m) => `<img src="/pokemon-rpg/assets/pokemon/${esc(m.speciesId)}.webp" alt="${esc(m.speciesId)}" title="Lv.${m.level}" />`).join('')}
            </div>
          </div>
          <div class="title-cta-row">
            <button type="button" class="cta-primary" data-action="continue-game" data-testid="continue-game-btn">
              ▶ 繼續星輝冒險
            </button>
            <button type="button" class="cta-secondary" data-action="start-new-creation" data-testid="new-game-btn">
              開啟新的冒險
            </button>
          </div>
        ` : `
          <div class="title-cta-row">
            <button type="button" class="cta-primary" data-action="start-new-creation" data-testid="start-adventure-btn">
              ✨ 創建訓練員・踏上旅程（${esc(userName || '訓練員')}）
            </button>
          </div>
        `}
      </div>
    </div>
  `;
}

export function renderCreationScreen({ draft, hasExistingSave }) {
  const selectedAvatar = TRAINER_AVATARS.find((a) => a.id === draft.avatarId) || TRAINER_AVATARS[0];
  const selectedStarter = POKEMON_SPECIES[draft.starterId] || POKEMON_SPECIES.charmander;
  const lv5Stats = computeStatsForLevel(selectedStarter.id, 5);
  const startSkills = getUnlockedSkills(selectedStarter.id, 5);
  const evoTarget = selectedStarter.evolvesTo ? POKEMON_SPECIES[selectedStarter.evolvesTo.speciesId] : null;

  return `
    <div class="full-overlay creation-screen" data-testid="creation-screen">
      <div class="creation-container">
        <div class="creation-header">
          <div>
            <span class="menu-eyebrow">THE FIRST CHAPTER</span>
            <h1>每段傳說，始於一次相遇。</h1>
            <div class="creation-intro">選擇你的模樣，與第一位夥伴踏上星輝大陸。</div>
          </div>
          <button type="button" class="pill-btn" data-action="back-to-title">← 返回標題畫面</button>
        </div>

        <div class="creation-cast-stage" aria-label="已選擇的訓練員與夥伴">
          <span class="cast-stage-number">01 / 啟程</span>
          <div class="cast-stage-art">
            <div class="cast-stage-halo"></div>
            <img class="cast-stage-trainer" src="${esc(selectedAvatar.sprite)}" alt="${esc(selectedAvatar.nameZh)}" />
            <img class="cast-stage-partner" src="/pokemon-rpg/assets/pokemon/${esc(selectedStarter.id)}.webp" alt="${esc(selectedStarter.nameZh)}" />
          </div>
          <div class="cast-stage-caption"><span>${esc(selectedAvatar.titleZh)}</span><h2>${esc(selectedAvatar.nameZh)}</h2><p>與 ${esc(selectedStarter.nameZh)}，一起出發。</p></div>
        </div>
        <div class="creation-grid">
          <!-- Step 1: Trainer Appearance & Name -->
          <div class="creation-panel">
            <div class="panel-step-title">
              <span class="step-badge">1</span>
              你的旅人
            </div>

            <div class="name-input-row">
              <label for="trainer-name-input">訓練員名稱</label>
              <input
                id="trainer-name-input"
                data-testid="trainer-name-input"
                type="text"
                maxlength="18"
                class="rpg-input"
                value="${esc(draft.name)}"
                placeholder="請輸入訓練員名稱…"
              />
            </div>

            <div class="avatar-select-grid">
              ${TRAINER_AVATARS.map((av) => `
                <button
                  type="button"
                  class="avatar-option-card ${av.id === selectedAvatar.id ? 'selected' : ''}"
                  data-action="pick-avatar"
                  data-avatar-id="${esc(av.id)}"
                  data-testid="avatar-option-${esc(av.id)}"
                >
                  <img src="${esc(av.sprite)}" alt="${esc(av.nameZh)}" />
                  <span class="avatar-name">${esc(av.nameZh)}</span>
                  <span class="avatar-role">${esc(av.titleZh)}</span>
                </button>
              `).join('')}
            </div>

            <div class="selected-desc-box">
              <strong style="color:var(--gold-bright)">${esc(selectedAvatar.nameZh)}（${esc(selectedAvatar.titleZh)}）：</strong>
              ${esc(selectedAvatar.descZh)}
            </div>
          </div>

          <!-- Step 2: Starter Pokémon Selection -->
          <div class="creation-panel">
            <div class="panel-step-title">
              <span class="step-badge">2</span>
              第一位夥伴
            </div>

            <div class="starter-select-grid">
              ${STARTER_IDS.map((sid) => {
                const sp = POKEMON_SPECIES[sid];
                return `
                  <button
                    type="button"
                    class="starter-card ${sid === selectedStarter.id ? 'selected' : ''}"
                    data-action="pick-starter"
                    data-starter-id="${esc(sid)}"
                    data-testid="starter-option-${esc(sid)}"
                  >
                    <img src="/pokemon-rpg/assets/pokemon/${esc(sid)}.webp" alt="${esc(sp.nameZh)}" />
                    <div>
                      <div style="font-weight:900;font-size:1.02rem;margin-bottom:4px">${esc(sp.nameZh)}</div>
                      <div style="display:flex;gap:4px;flex-wrap:wrap">
                        ${renderTypeBadge(sp.type)}
                        ${renderRarityBadge(sp.rarity)}
                      </div>
                    </div>
                  </button>
                `;
              }).join('')}
            </div>

            <div class="starter-detail-box" data-testid="starter-preview-panel">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
                <div style="display:flex;align-items:center;gap:8px">
                  <strong style="font-size:1.12rem;color:var(--gold-bright)">${esc(selectedStarter.nameZh)} (${esc(selectedStarter.nameEn)})</strong>
                  ${renderTypeBadge(selectedStarter.type)}
                  ${renderRarityBadge(selectedStarter.rarity)}
                </div>
                <span style="font-size:0.8rem;color:var(--emerald);font-weight:800">
                  ${evoTarget ? `✨ Lv.${selectedStarter.evolvesTo.level} 可進化為「${esc(evoTarget.nameZh)}」` : '⚡ 高速高爆發人氣夥伴'}
                </span>
              </div>

              <div style="font-size:0.86rem;color:var(--text-sub);line-height:1.45">
                ${esc(selectedStarter.loreZh)}
              </div>

              <div class="stat-mini-grid">
                <div class="stat-mini-cell"><span>HP</span><strong>${lv5Stats.maxHp}</strong></div>
                <div class="stat-mini-cell"><span>MP</span><strong>${lv5Stats.maxMp}</strong></div>
                <div class="stat-mini-cell"><span>攻擊</span><strong>${lv5Stats.atk}</strong></div>
                <div class="stat-mini-cell"><span>防禦</span><strong>${lv5Stats.def}</strong></div>
                <div class="stat-mini-cell"><span>速度</span><strong>${lv5Stats.spd}</strong></div>
              </div>

              <div style="font-size:0.82rem;color:var(--cyan)">
                <strong>初始習得技能：</strong>
                ${startSkills.map((sk) => `「${esc(sk.nameZh)}」(MP ${sk.mpCost})`).join('、')} ＋ 普攻（0 MP・回魔）
              </div>
            </div>

            <div class="creation-footer">
              ${hasExistingSave ? `<span style="font-size:0.8rem;color:var(--rose)">※ 確認出發將會覆蓋原有冒險進度</span>` : ''}
              <button type="button" class="cta-primary" data-action="confirm-creation" data-testid="confirm-creation-btn">
                開啟我們的旅程 →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderOverworldHud({
  save,
  currentZone,
  quest,
  questDist,
  nearbyPrompt,
  inTallGrass,
  muted,
  questExpanded=false,
}) {
  const avatar = TRAINER_AVATARS.find((a) => a.id === save.trainer.avatarId) || TRAINER_AVATARS[0];
  const allMons = [...save.party, ...save.box];
  const followerMons = save.followers
    .map((uid) => allMons.find((m) => m.uid === uid))
    .filter(Boolean)
    .slice(0, 3);

  return `
    <div class="world-hud" data-testid="overworld-hud">
      <div class="hud-top-row">
        <!-- Left: Trainer Card & Main Story Quest Tracker -->
        <div class="hud-left-stack interactive">
          <div class="trainer-hud-card">
            <img src="${esc(avatar.sprite)}" alt="${esc(save.trainer.name)}" class="trainer-hud-avatar" />
            <div class="trainer-hud-meta">
              <div class="trainer-hud-name">
                <span data-testid="hud-trainer-name">${esc(save.trainer.name)}</span>
                <span class="gold-pill" data-testid="hud-gold">🪙 ${save.gold}</span>
              </div>
              <div class="badge-count-pill">
                🏅 徽章 ${save.badges.length}/5 ｜ 📖 圖鑑 ${save.pokedex.caught.length}/24 ｜ 出戰 ${save.party.length}/6
              </div>
            </div>
          </div>

          <div class="quest-hud-card" data-testid="quest-tracker">
            <button type="button" class="quest-hud-toggle" data-action="toggle-quest-details" data-testid="quest-toggle" aria-expanded="${questExpanded}" aria-controls="quest-objective" aria-label="${questExpanded?'收起':'展開'}任務詳情">
            <span class="quest-hud-title">
              <span>${esc(quest.titleZh)}</span>
              <span style="color:var(--cyan)">${questDist === null ? `前往 ${esc(getMap(quest.targetZone).nameZh)}` : `距離 ${Math.round(questDist)}m`}</span>
            </span><span class="quest-toggle-mark" aria-hidden="true">${questExpanded?'−':'＋'}</span></button>
            <div class="quest-hud-desc" id="quest-objective" ${questExpanded?'':'hidden'}>${esc(quest.objectiveZh)}</div>
            <button type="button" class="journey-hud-link" data-action="open-journal" data-testid="open-journal-btn">${quest.ready?'✓ 目標完成 · 領取獎勵':'旅程日誌 · 主線與委託'} <kbd>J</kbd></button>
          </div>
        </div>

        <!-- Right: Action Buttons & Minimap -->
        <div class="hud-right-stack interactive">
          <div class="hud-menu-bar">
            <button type="button" class="hud-btn accent" data-action="open-team" data-testid="open-team-btn">
              ${gameIcon('team')}<span>夥伴</span><kbd>P</kbd>
            </button>
            <button type="button" class="hud-btn" data-action="open-bag" data-testid="open-bag-btn">
              ${gameIcon('bag')}<span>背包</span><kbd>B</kbd>
            </button>
            <button type="button" class="hud-btn" data-action="open-pokedex" data-testid="open-pokedex-btn">
              ${gameIcon('dex')}<span>圖鑑</span><kbd>X</kbd>
            </button>
            <button type="button" class="hud-btn" data-action="open-expedition-menu" data-testid="open-expedition-menu-btn" title="冒險選單 · Esc">
              ${gameIcon('menu')}<span>選單</span><kbd>Esc</kbd>
            </button>
          </div>

          <button type="button" class="minimap-box" data-action="open-map" data-testid="open-map-btn" aria-label="開啟${esc(currentZone.nameZh)}地圖" title="世界地圖 · M">
            <canvas id="rpg-minimap-canvas" width="320" height="320"></canvas>
            <img class="minimap-bezel" src="${NAVIGATION_ART.compass}" alt="" aria-hidden="true" />
            <span class="minimap-caption">${gameIcon('map')}<span data-testid="hud-zone-name">${esc(currentZone.nameZh)}</span><kbd>M</kbd></span>
          </button>
        </div>
      </div>

      <!-- Bottom-Left: Active Following Pokémon Strip (Up to 3) -->
      <div class="hud-bottom-left interactive">
        <div class="followers-strip-card" data-testid="followers-strip">
          <div class="followers-label" data-action="open-team" style="cursor:pointer" title="點擊開啟隊伍與跟隨設定">
            <strong>旅途夥伴</strong>
            <span>${followerMons.length} / 3 同行</span>
          </div>
          <div class="follower-slots">
            ${[0, 1, 2].map((idx) => {
              const mon = followerMons[idx];
              if (!mon) {
                return `
                  <button type="button" class="follower-slot empty" data-action="open-team" title="點擊新增跟隨寶可夢">
                    ＋
                  </button>
                `;
              }
              const hpPct = Math.max(0, Math.min(100, Math.round((mon.hp / Math.max(1, mon.maxHp)) * 100)));
              return `
                <button
                  type="button"
                  class="follower-slot"
                  data-action="interact-follower"
                  data-follower-idx="${idx}"
                  data-testid="follower-slot-${idx}"
                  title="點擊與「${esc(monDisplayName(mon))}」對話互動（Lv.${mon.level} HP ${mon.hp}/${mon.maxHp}）"
                >
                  <span class="follower-rank-tag">${idx + 1}</span>
                  <img src="/pokemon-rpg/assets/pokemon/${esc(mon.speciesId)}.webp" alt="${esc(mon.speciesId)}" />
                  <span class="follower-slot-hp"><i style="width:${hpPct}%;background:${hpColor(hpPct / 100)}"></i></span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Bottom-Center: Nearby NPC / Building / Tall Grass Prompt -->
      <div class="interact-prompt-wrap interactive">
        ${nearbyPrompt ? `
          <button
            type="button"
            class="interact-prompt-btn"
            data-action="interact-nearby"
            data-testid="interact-nearby-btn"
          >
            <span class="key-hint">E / 空白鍵</span>
            <span>${esc(nearbyPrompt.label)}</span>
          </button>
        ` : ''}
        ${inTallGrass ? `
          <button
            type="button"
            class="pill-btn"
            style="border-color:#4ade80;background:rgba(20,83,45,0.88)"
            data-action="search-wild-now"
            data-testid="search-wild-btn"
          >
            🌿 草叢沙沙作響… 點擊立即搜尋野生寶可夢
          </button>
        ` : ''}
      </div>

          </div>
  `;
}

export function renderDialogueOverlay(dialogue) {
  if (!dialogue) return '';
  const line = dialogue.lines[dialogue.index] || '';
  const isLast = dialogue.index >= dialogue.lines.length - 1;

  return `
    <div class="dialogue-overlay" data-testid="dialogue-overlay">
      <div class="dialogue-box">
        <img src="${esc(dialogue.sprite)}" alt="${esc(dialogue.speaker)}" class="dialogue-portrait" />
        <div class="dialogue-body">
          <div class="dialogue-speaker-row">
            <span class="dialogue-speaker">${esc(dialogue.speaker)}</span>
            ${dialogue.role ? `<span class="dialogue-role">${esc(dialogue.role)}</span>` : ''}
          </div>
          <div class="dialogue-text">${esc(line)}</div>
          <div class="dialogue-actions">
            ${isLast && Array.isArray(dialogue.choices) && dialogue.choices.length > 0
              ? dialogue.choices.map((ch, idx) => `
                  <button
                    type="button"
                    class="${ch.primary ? 'cta-primary' : 'cta-secondary'}"
                    style="padding:9px 20px;font-size:0.92rem"
                    data-action="dialogue-choice"
                    data-choice-idx="${idx}"
                    data-testid="dialogue-choice-${esc(ch.id || idx)}"
                  >
                    ${esc(ch.label)}
                  </button>
                `).join('')
              : `
                <button
                  type="button"
                  class="cta-primary"
                  style="padding:9px 22px;font-size:0.94rem"
                  data-action="dialogue-next"
                  data-testid="dialogue-next-btn"
                >
                  ${isLast ? '結束對話 ✓' : '繼續 ▶'}
                </button>
              `}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderBattleHud({ battle, save }) {
  const playerMon = battle.playerMon;
  const enemyMon = battle.enemyMon;
  const playerSp = POKEMON_SPECIES[playerMon.speciesId];
  const enemySp = POKEMON_SPECIES[enemyMon.speciesId];

  const pHpRatio = Math.max(0, Math.min(1, playerMon.hp / Math.max(1, playerMon.maxHp)));
  const pMpRatio = Math.max(0, Math.min(1, playerMon.mp / Math.max(1, playerMon.maxMp)));
  const pExpNeed = expForNextLevel(playerMon.level);
  const pExpRatio = Math.max(0, Math.min(1, (playerMon.exp || 0) / Math.max(1, pExpNeed)));

  const eHpRatio = Math.max(0, Math.min(1, enemyMon.hp / Math.max(1, enemyMon.maxHp)));
  const alreadyCaught = save.pokedex.caught.includes(enemyMon.speciesId);

  const unlockedSkills = getUnlockedSkills(playerMon.speciesId, playerMon.level);
  const ballIds = ['pokeball', 'greatball', 'ultraball', 'masterball'];

  return `
    <div class="battle-hud" data-testid="battle-hud">
      <!-- Top Row: Battle Type Info & Enemy Status Plate -->
      <div class="battle-top-area">
        <div class="battle-context-tag">
          <span>${battle.isTrainer ? `⚔️ 訓練員對決：${esc(battle.trainerName)}` : `🌿 野生寶可夢遭遇戰`}</span>
          ${battle.isTrainer ? `
            <span class="trainer-balls-row">
              ${battle.enemyTeam.map((m) => `<i class="trainer-ball-dot ${m.hp <= 0 ? 'down' : ''}"></i>`).join('')}
            </span>
          ` : alreadyCaught ? `<span style="color:var(--emerald)">🔴 已登錄圖鑑</span>` : `<span style="color:var(--cyan)">✨ 未收服新物種</span>`}
        </div>

        <div class="combatant-plate enemy ${battle.uiAction?.side==='enemy'?'is-acting':''}" data-testid="enemy-battle-plate">
          <div class="plate-mon-portrait-wrap">
            <img src="/pokemon-rpg/assets/pokemon/${esc(enemyMon.speciesId)}.webp" alt="${esc(enemySp.nameZh)}" class="plate-mon-portrait" />
          </div>
          <div class="plate-content-col">
            <div class="plate-header">
              <div class="plate-name-group">
                <span class="plate-name">${esc(enemySp.nameZh)}</span>
                ${renderTypeBadge(enemySp.type)}
                ${renderRarityBadge(enemySp.rarity)}
                ${renderStatusBadge(enemyMon)}
              </div>
              <span class="plate-lv">Lv.${enemyMon.level}</span>
            </div>
            <div class="bar-row">
              <span class="bar-label">HP</span>
              <div class="bar-track">
                <div class="bar-fill" style="width:${Math.round(eHpRatio * 100)}%;background:${hpColor(eHpRatio)}"></div>
              </div>
              <span class="bar-val" data-testid="enemy-hp-text">${enemyMon.hp} / ${enemyMon.maxHp}</span>
            </div>
            ${!battle.isTrainer && enemyMon.level - playerMon.level >= 4 ? `
              <div style="font-size:0.74rem;color:var(--rose);font-weight:800">
                ⚠ 敵方等級高出 ${enemyMon.level - playerMon.level} 級，直接捕獲難度極高！
              </div>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- Bottom Area: Player Active Pokémon Plate + Battle Log + Command Deck -->
      <div class="battle-bottom-area interactive">
        <div class="battle-player-row">
          <div class="combatant-plate player ${battle.uiAction?.side==='player'?'is-acting':''}" data-testid="player-battle-plate">
            <div class="plate-mon-portrait-wrap">
              <img src="/pokemon-rpg/assets/pokemon/${esc(playerMon.speciesId)}.webp" alt="${esc(playerSp.nameZh)}" class="plate-mon-portrait" />
            </div>
            <div class="plate-content-col">
              <div class="plate-header">
                <div class="plate-name-group">
                  <span class="plate-name">${esc(monDisplayName(playerMon))}</span>
                  ${renderTypeBadge(playerSp.type)}
                  ${renderStatusBadge(playerMon)}
                </div>
                <span class="plate-lv">Lv.${playerMon.level}</span>
              </div>
              <div class="bar-row">
                <span class="bar-label">HP</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${Math.round(pHpRatio * 100)}%;background:${hpColor(pHpRatio)}"></div>
                </div>
                <span class="bar-val" data-testid="player-hp-text">${playerMon.hp} / ${playerMon.maxHp}</span>
              </div>
              <div class="bar-row">
                <span class="bar-label">MP</span>
                <div class="bar-track">
                  <div class="bar-fill" style="width:${Math.round(pMpRatio * 100)}%;background:var(--mp-bar)"></div>
                </div>
                <span class="bar-val" data-testid="player-mp-text">${playerMon.mp} / ${playerMon.maxMp}</span>
              </div>
              <div class="bar-row">
                <span class="bar-label">EXP</span>
                <div class="bar-track thin">
                  <div class="bar-fill" style="width:${Math.round(pExpRatio * 100)}%;background:var(--exp-bar)"></div>
                </div>
                <span class="bar-val" style="font-size:0.7rem;color:var(--text-muted)">${playerMon.exp}/${pExpNeed}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="battle-deck">
          <!-- Battle Combat Log -->
          <div class="battle-log-panel" id="battle-log-scroll" data-testid="battle-log">
            ${battle.logs.slice(-5).map((line) => `<div class="battle-log-line">${esc(line)}</div>`).join('')}
          </div>

          <!-- Command Panel / Sub-drawers -->
          <div class="battle-command-panel" aria-busy="${Boolean(battle.busy)}">
            <div class="battle-action-state ${battle.busy?'is-busy':'is-ready'}" role="status" data-testid="battle-action-state"><span class="battle-action-dot" aria-hidden="true"></span>${battle.uiAction ? `${battle.uiAction.side==='player'?'我方':'對方'} ${esc(battle.uiAction.name)} · ${esc(battle.uiAction.move)}` : battle.busy ? '回合進行中' : '等待你的指令'}</div>
            ${battle.subMenu === 'skills' ? `
              <div class="subdrawer-header">
                <span class="subdrawer-title">選擇招式 <small class="skill-drawer-hint">消耗 MP</small></span>
                <button type="button" class="mini-btn" data-action="battle-submenu" data-menu="root">← 返回指令</button>
              </div>
              <div class="subdrawer-grid">
                ${unlockedSkills.map((sk) => {
                  const mult = sk.power > 0 ? getTypeMultiplier(sk.type, enemySp.type) : 1.0;
                  const eff = sk.power > 0 ? getEffectivenessText(mult) : { textZh: '', tone: 'normal' };
                  const canAfford = playerMon.mp >= (sk.mpCost || 0);
                  return `
                    <button
                      type="button"
                      class="skill-choice-btn"
                      data-action="battle-use-skill"
                      data-skill-id="${esc(sk.id)}"
                      data-testid="battle-skill-${esc(sk.id)}"
                      ${!canAfford || battle.busy ? 'disabled' : ''}
                    >
                      <span class="skill-choice-top"><strong class="skill-choice-name">${esc(sk.nameZh)}</strong><span class="skill-choice-cost ${canAfford ? '' : 'insufficient'}">MP ${sk.mpCost}</span></span>
                      <span class="skill-choice-meta">${renderTypeBadge(sk.type)}<span>${sk.power > 0 ? `威力 ${sk.power}` : esc(sk.descZh)}</span></span>
                      ${!canAfford ? '<span class="skill-choice-feedback insufficient">MP 不足</span>' : eff.tone === 'super' ? `<span class="skill-choice-feedback super">${mult}× 效果絕佳</span>` : eff.tone === 'weak' ? `<span class="skill-choice-feedback weak">${mult}× 效果減半</span>` : ''}
                    </button>
                  `;
                }).join('')}
              </div>
            ` : battle.subMenu === 'capture' ? `
              <div class="subdrawer-header">
                <span class="subdrawer-title">🔴 選擇精靈球（血量越低・球越高級越易捕獲）</span>
                <button type="button" class="mini-btn" data-action="battle-submenu" data-menu="root">← 返回指令</button>
              </div>
              <div class="subdrawer-grid">
                ${ballIds.map((bid) => {
                  const item = ITEMS[bid];
                  const qty = save.inventory[bid] || 0;
                  const cap = computeCaptureChance({
                    enemyMon,
                    playerLevel: playerMon.level,
                    ballId: bid,
                    isTrainerBattle: battle.isTrainer,
                  });
                  return `
                    <button
                      type="button"
                      class="ball-choice-btn"
                      data-action="battle-throw-ball"
                      data-ball-id="${esc(bid)}"
                      data-testid="battle-ball-${esc(bid)}"
                      ${qty <= 0 || !cap.canCapture || battle.busy ? 'disabled' : ''}
                    >
                      <div style="display:flex;align-items:center;gap:8px">
                        <img src="${esc(item.icon)}" alt="${esc(item.nameZh)}" style="width:34px;height:34px;object-fit:contain" />
                        <div>
                          <div style="font-weight:900;font-size:0.88rem">${esc(item.nameZh)} <span style="color:var(--text-sub)">x${qty}</span></div>
                          <div style="font-size:0.7rem;color:var(--text-muted)">${item.guaranteed ? '100% 必中' : `倍率 ${item.catchMult}x`}</div>
                        </div>
                      </div>
                      <span class="catch-rate-pill" data-testid="catch-rate-${esc(bid)}">${cap.percent}%</span>
                    </button>
                  `;
                }).join('')}
              </div>
            ` : `
              <div class="cmd-grid-6">
                <button
                  type="button"
                  class="cmd-btn skill"
                  data-action="battle-submenu"
                  data-menu="skills"
                  data-testid="cmd-skills"
                  ${battle.busy ? 'disabled' : ''}
                >
                  <strong>${gameIcon('dex')} 技能</strong>
                  <span>屬性招式 (耗 MP)</span>
                </button>

                <button
                  type="button"
                  class="cmd-btn attack"
                  data-action="battle-normal-attack"
                  data-testid="cmd-normal-attack"
                  ${battle.busy ? 'disabled' : ''}
                >
                  <strong>${gameIcon('team')} 普攻</strong>
                  <span>0 MP・回復 +5 MP</span>
                </button>

                <button
                  type="button"
                  class="cmd-btn capture"
                  data-action="battle-submenu"
                  data-menu="capture"
                  data-testid="cmd-capture"
                  ${battle.busy || battle.isTrainer ? 'disabled' : ''}
                >
                  <strong><svg class="game-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M3 12h6m6 0h6"/></svg> 捕獲</strong>
                  <span>${battle.isTrainer ? '訓練員戰不可用' : '投擲精靈球收服'}</span>
                </button>

                <button
                  type="button"
                  class="cmd-btn item"
                  data-action="open-bag"
                  data-testid="cmd-items"
                  ${battle.busy ? 'disabled' : ''}
                >
                  <strong>${gameIcon('bag')} 道具</strong>
                  <span>回血 / 回 MP / 復活</span>
                </button>

                <button
                  type="button"
                  class="cmd-btn switch"
                  data-action="open-battle-switch"
                  data-testid="cmd-switch"
                  ${battle.busy ? 'disabled' : ''}
                >
                  <strong>${gameIcon('team')} 換寵</strong>
                  <span>切換出戰寶可夢</span>
                </button>

                <button
                  type="button"
                  class="cmd-btn"
                  data-action="battle-escape"
                  data-testid="cmd-escape"
                  ${battle.busy || battle.isTrainer ? 'disabled' : ''}
                >
                  <strong><svg class="game-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M10 3H3v18h7m4-15 6 6-6 6m-7-6h13"/></svg> 逃走</strong>
                  <span>${battle.isTrainer ? '正面對決不可逃走' : '脫離野生戰鬥'}</span>
                </button>
              </div>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function renderModal({ modal, save, battle, lastLightCampRestAt = 0 }) {
  if (!modal) return '';
  if(modal.type==='journal')return renderQuestJournal(modal,save,esc);
  if(modal.type==='field_camp'){
    const p=getMap(save.position.zone).fieldObjects.find(p=>p.id===modal.objectId),a=save.adventure;if(!p)return '';
    const herbCount=a.resources.herb||0;
    const hasHerbFull=herbCount>=CAMP_HERB_COST;
    const elapsed=Date.now()-(Number(lastLightCampRestAt)||0);
    const remainSec=lastLightCampRestAt>0&&elapsed<CAMP_LIGHT_COOLDOWN_MS?Math.max(1,Math.ceil((CAMP_LIGHT_COOLDOWN_MS-elapsed)/1000)):0;
    const faintedCount=(save.party||[]).filter(m=>m.hp<=0).length;
    const restLabel=hasHerbFull
      ? `🌿 藥草療養（消耗 ${CAMP_HERB_COST} 株藥草）· 全員 100% 恢復 HP / MP`
      : remainSec>0
        ? `⏳ 簡易休息冷卻中（剩餘 ${remainSec} 秒）· 需 ${CAMP_HERB_COST} 株藥草全員恢復`
        : '⛺ 簡易休息（無藥草）· 恢復 30% HP / MP（限時 180 秒 1 次）';
    return `<div class="modal-backdrop" data-testid="field-camp-modal"><section class="modal-window narrow"><header class="modal-header"><h2 class="modal-title">${esc(p.nameZh)}</h2><button type="button" class="modal-close-btn" data-action="close-modal" data-testid="close-modal-btn">關閉 ✕</button></header><div class="modal-body field-camp-body"><img src="${getThemedFieldArt(p.zone,'camp').src}" alt="${esc(p.nameZh)}" /><p>野外露營療養：消耗 ${CAMP_HERB_COST} 株藥草可讓未瀕死夥伴 100% 恢復；無藥草僅能恢復 30%（限時 180 秒 1 次）。<strong>野外營地無法復活瀕死寶可夢</strong>。</p>${faintedCount>0?`<div style="font-size:0.82rem;color:var(--rose);font-weight:800">⚠️ 隊伍中有 ${faintedCount} 隻瀕死寶可夢，請使用「活力碎片」或回晨曦精靈醫院免費復活。</div>`:''}<strong>樹果 ${a.resources.berry||0} · 藥草 ${herbCount}</strong><button type="button" class="cta-primary" data-action="camp-rest" data-object-id="${p.id}" data-testid="camp-rest-btn" ${!hasHerbFull&&remainSec>0?'disabled':''}>${restLabel}</button>${hasHerbFull?`<button type="button" class="cta-secondary" data-action="camp-rest-light" data-object-id="${p.id}" data-testid="camp-rest-light-btn" ${remainSec>0?'disabled':''}>${remainSec>0?`⏳ 簡易喘息冷卻中（${remainSec} 秒）`:'⛺ 簡易喘息（不耗藥草 · 恢復 30% HP/MP · 限時 1 次）'}</button>`:''}<button type="button" class="cta-secondary" data-action="camp-craft" data-object-id="${p.id}" data-recipe="potion" ${a.resources.berry<1||herbCount<1?'disabled':''}>調製傷藥 · 樹果 1 ＋ 藥草 1</button><button type="button" class="cta-secondary" data-action="camp-craft" data-object-id="${p.id}" data-recipe="ether" ${a.resources.berry<1||herbCount<2?'disabled':''}>調製魔力露 · 樹果 1 ＋ 藥草 2</button><small>每處休憩站第一次使用時，會記入探索日誌。</small></div></section></div>`;
  }

  if (modal.type === 'expedition_menu') {
    return `<div class="modal-backdrop expedition-backdrop" data-testid="expedition-menu">
      <section class="modal-window expedition-menu" role="dialog" aria-modal="true" aria-label="冒險選單">
        <header class="modal-header"><div><span class="menu-eyebrow">YOUR JOURNEY</span><h2 class="modal-title">冒險手帳</h2></div>
          <button type="button" class="modal-close-btn" data-action="close-modal" data-testid="close-modal-btn" aria-label="返回冒險">✕</button></header>
        <div class="expedition-stats"><span><strong>${save.badges.length}</strong> / 5 徽章</span><span><strong>${save.pokedex.caught.length}</strong> / 24 圖鑑</span><span><strong>${save.gold}</strong> 金幣</span></div>
        <div class="journal-scroll-hint">6 項旅途工具 <span>向下捲動查看 ↓</span></div>
        <nav class="expedition-links">
          ${[['dex','open-journal','旅程日誌','主線、委託、研究與探索'],['team','open-team','夥伴隊伍','出戰、培育與同行'],['bag','open-bag','旅行背包','補給與精靈球'],['dex','open-pokedex','寶可夢圖鑑','記錄每一次相遇'],['map','open-map','星輝大陸','規劃下一段旅程'],['save','manual-save','保存旅程','記下現在的足跡']].map(([icon,action,title,sub]) => `<button type="button" data-action="${action}" ${action === 'manual-save' ? 'data-testid="manual-save-btn"' : ''}>${gameIcon(icon)}<span><strong>${title}</strong><small>${sub}</small></span><span class="menu-arrow">›</span></button>`).join('')}
        </nav>
        <footer class="expedition-footer"><button type="button" class="pill-btn" data-action="toggle-mute">切換音樂</button><a class="pill-btn" href="/">返回 BuiO ↗</a></footer>
      </section></div>`;
  }

  if (modal.type === 'shop') {
    const tab = modal.tab || 'all';
    const items = SHOP_ITEM_ORDER.map((id) => ITEMS[id]).filter((it) => {
      if (tab === 'ball') return it.category === 'ball';
      if (tab === 'medicine') return it.category === 'medicine';
      return true;
    });

    return `
      <div class="modal-backdrop" data-testid="shop-modal">
        <div class="modal-window">
          <div class="modal-header">
            <div class="modal-title">
              ${gameIcon('bag')} 星輝補給商店
              <span class="gold-pill" data-testid="shop-gold">🪙 持有金幣：${save.gold}</span>
            </div>
            <button type="button" class="modal-close-btn" data-action="close-modal" data-testid="close-modal-btn">關閉 ✕</button>
          </div>
          <div class="modal-tabs">
            <button type="button" class="tab-btn ${tab === 'all' ? 'active' : ''}" data-action="set-modal-tab" data-tab="all">全部商品</button>
            <button type="button" class="tab-btn ${tab === 'ball' ? 'active' : ''}" data-action="set-modal-tab" data-tab="ball">🔴 精靈球（捕獲專用）</button>
            <button type="button" class="tab-btn ${tab === 'medicine' ? 'active' : ''}" data-action="set-modal-tab" data-tab="medicine">💊 醫療與回魔藥劑</button>
          </div>
          <div class="modal-body">
            <div class="card-grid-2">
              ${items.map((it) => {
                const owned = save.inventory[it.id] || 0;
                const can1 = save.gold >= it.price;
                const can5 = save.gold >= it.price * 5;
                return `
                  <div class="item-row-card" data-testid="shop-item-${esc(it.id)}">
                    <img src="${esc(it.icon)}" alt="${esc(it.nameZh)}" class="item-icon-img" />
                    <div class="item-info-col">
                      <div style="display:flex;justify-content:space-between;align-items:center">
                        <strong style="font-size:0.98rem">${esc(it.nameZh)}</strong>
                        <span style="color:var(--gold-bright);font-weight:900;font-size:0.9rem">🪙 ${it.price}</span>
                      </div>
                      <div style="font-size:0.78rem;color:var(--text-sub)">${esc(it.descZh)}</div>
                      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
                        <span style="font-size:0.78rem;color:var(--cyan)" data-testid="shop-owned-${esc(it.id)}">背包持有：${owned}</span>
                        <div class="action-btn-group">
                          <button
                            type="button"
                            class="mini-btn gold"
                            data-action="buy-item"
                            data-item-id="${esc(it.id)}"
                            data-qty="1"
                            data-testid="buy-1-${esc(it.id)}"
                            ${!can1 ? 'disabled' : ''}
                          >購買 x1</button>
                          <button
                            type="button"
                            class="mini-btn"
                            data-action="buy-item"
                            data-item-id="${esc(it.id)}"
                            data-qty="5"
                            data-testid="buy-5-${esc(it.id)}"
                            ${!can5 ? 'disabled' : ''}
                          >x5</button>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (modal.type === 'hospital') {
    const info = computeHospitalCost(save.party);

    return `
      <div class="modal-backdrop" data-testid="hospital-modal">
        <div class="modal-window narrow">
          <div class="modal-header">
            <div class="modal-title">
              晨曦精靈醫院
              <span class="gold-pill" data-testid="hospital-gold">🪙 ${save.gold}</span>
            </div>
            <button type="button" class="modal-close-btn" data-action="close-modal" data-testid="close-modal-btn">離開醫院 ✕</button>
          </div>
          <div class="modal-body">
            <div style="display:flex;align-items:center;gap:16px;padding:12px;border-radius:16px;background:rgba(244,114,182,0.12);border:1px solid rgba(244,114,182,0.35)">
              <img src="/pokemon-rpg/assets/npcs/nurse.webp" alt="喬伊護士" style="width:84px;height:84px;object-fit:contain" />
              <div style="font-size:0.92rem;line-height:1.55;color:var(--text-main)">
                <strong style="color:var(--rose);font-size:1.02rem">喬伊護士：</strong><br/>
                ${modal.emergencyMessage
                  ? esc(modal.emergencyMessage)
                  : info.needsHeal
                    ? `歡迎光臨晨曦精靈醫院！目前隊伍中有 ${info.injuredCount} 隻寶可夢需要照護，精靈醫院提供免費治療，馬上為全隊恢復滿 HP、MP 並復活瀕死夥伴吧！`
                    : '你的所有出戰寶可夢目前都精力充沛（HP 與 MP 皆為全滿），隨時可以繼續冒險喔！'}
              </div>
            </div>

            <div class="card-grid-2">
              ${save.party.map((mon) => {
                const sp = POKEMON_SPECIES[mon.speciesId];
                return `
                  <div class="item-row-card">
                    <img src="/pokemon-rpg/assets/pokemon/${esc(mon.speciesId)}.webp" alt="${esc(sp.nameZh)}" style="width:52px;height:52px;object-fit:contain" />
                    <div class="item-info-col">
                      <div style="font-weight:900;font-size:0.9rem">${esc(monDisplayName(mon))} <span style="color:var(--gold)">Lv.${mon.level}</span> ${renderStatusBadge(mon)}</div>
                      <div style="font-size:0.78rem;color:var(--emerald)">HP：${mon.hp} / ${mon.maxHp}</div>
                      <div style="font-size:0.78rem;color:var(--cyan)">MP：${mon.mp} / ${mon.maxMp}</div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:4px">
              ${info.needsHeal ? `
                <button
                  type="button"
                  class="cta-primary"
                  data-action="hospital-heal"
                  data-testid="hospital-heal-btn"
                >
                  💖 免費治療・全隊回復滿 HP / MP 與復活瀕死
                </button>
              ` : `
                <button type="button" class="cta-secondary" data-action="close-modal">全隊狀態完美 ✓</button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (modal.type === 'bag') {
    const tab = modal.tab || 'medicine';
    const medicineItems = SHOP_ITEM_ORDER
      .map((id) => ITEMS[id])
      .filter((it) => it.category === 'medicine' && (save.inventory[it.id] || 0) > 0);
    const ballItems = SHOP_ITEM_ORDER
      .map((id) => ITEMS[id])
      .filter((it) => it.category === 'ball' && (save.inventory[it.id] || 0) > 0);

    const selectedItemId = modal.selectedItemId && (save.inventory[modal.selectedItemId] || 0) > 0
      ? modal.selectedItemId
      : medicineItems[0]?.id || null;
    const selectedItem = selectedItemId ? ITEMS[selectedItemId] : null;

    return `
      <div class="modal-backdrop" data-testid="bag-modal">
        <div class="modal-window">
          <div class="modal-header">
            <div class="modal-title">
              ${gameIcon('bag')} 旅途背包 <span class="journal-header-meta">${battle ? '使用道具消耗一回合' : '隨時補充 HP / MP'}</span>
            </div>
            <button type="button" class="modal-close-btn" data-action="close-modal" data-testid="close-modal-btn">關閉 ✕</button>
          </div>
          ${!battle ? `
            <div class="modal-tabs">
              <button type="button" class="tab-btn ${tab === 'medicine' ? 'active' : ''}" data-action="set-modal-tab" data-tab="medicine">💊 恢復藥劑（回血 / 回 MP / 復活）</button>
              <button type="button" class="tab-btn ${tab === 'balls' ? 'active' : ''}" data-action="set-modal-tab" data-tab="balls">🔴 精靈球庫存</button>
            </div>
          ` : ''}
          <div class="modal-body">
            ${tab === 'balls' && !battle ? `
              ${ballItems.length === 0
                ? `<div style="padding:20px;text-align:center;color:var(--text-sub)">目前沒有任何精靈球，請前往晨曦鎮「星輝精靈商城」購買！</div>`
                : `<div class="card-grid-2">
                    ${ballItems.map((it) => `
                      <div class="item-row-card">
                        <img src="${esc(it.icon)}" alt="${esc(it.nameZh)}" class="item-icon-img" />
                        <div class="item-info-col">
                          <div style="font-weight:900">${esc(it.nameZh)} <span style="color:var(--gold)">x${save.inventory[it.id]}</span></div>
                          <div style="font-size:0.8rem;color:var(--text-sub)">${esc(it.descZh)}</div>
                        </div>
                      </div>
                    `).join('')}
                  </div>`
              }
            ` : `
              ${medicineItems.length === 0 ? `
                <div style="padding:22px;text-align:center;color:var(--text-sub)">
                  目前背包內沒有恢復藥劑！可前往「精靈商城」購買傷藥與魔力露。
                </div>
              ` : `
                <div style="font-size:0.86rem;color:var(--gold-bright);font-weight:800">
                  步驟 1：點選要使用的醫療或回魔道具
                </div>
                <div class="card-grid-3">
                  ${medicineItems.map((it) => `
                    <button
                      type="button"
                      class="item-row-card ${it.id === selectedItemId ? 'selected' : ''}"
                      style="cursor:pointer;text-align:left;color:var(--text-main)"
                      data-action="select-bag-item"
                      data-item-id="${esc(it.id)}"
                      data-testid="bag-item-${esc(it.id)}"
                    >
                      <img src="${esc(it.icon)}" alt="${esc(it.nameZh)}" style="width:42px;height:42px;object-fit:contain" />
                      <div class="item-info-col">
                        <div style="font-weight:900;font-size:0.9rem">${esc(it.nameZh)} <span style="color:var(--gold)">x${save.inventory[it.id]}</span></div>
                        <div style="font-size:0.74rem;color:var(--text-sub)">${esc(it.descZh)}</div>
                      </div>
                    </button>
                  `).join('')}
                </div>

                ${selectedItem ? `
                  <div style="font-size:0.86rem;color:var(--cyan);font-weight:800;margin-top:6px">
                    步驟 2：選擇要使用「${esc(selectedItem.nameZh)}」的寶可夢
                  </div>
                  <div class="card-grid-2">
                    ${save.party.map((mon) => {
                      const usable = canUseMedicineOnPokemon(selectedItem.id, mon);
                      return `
                        <div class="mon-manage-card" data-testid="bag-target-${esc(mon.uid)}">
                          <img src="/pokemon-rpg/assets/pokemon/${esc(mon.speciesId)}.webp" alt="${esc(mon.speciesId)}" class="mon-thumb-img" />
                          <div class="mon-info-col">
                            <div style="font-weight:900">${esc(monDisplayName(mon))} <span style="color:var(--gold)">Lv.${mon.level}</span> ${renderStatusBadge(mon)}</div>
                            <div style="font-size:0.8rem;color:var(--emerald)">HP：${mon.hp} / ${mon.maxHp}</div>
                            <div style="font-size:0.8rem;color:var(--cyan)">MP：${mon.mp} / ${mon.maxMp}</div>
                          </div>
                          <button
                            type="button"
                            class="mini-btn emerald"
                            data-action="use-medicine-on-mon"
                            data-item-id="${esc(selectedItem.id)}"
                            data-uid="${esc(mon.uid)}"
                            data-testid="apply-item-${esc(mon.uid)}"
                            ${!usable ? 'disabled' : ''}
                          >
                            ${usable ? `使用` : '無需使用'}
                          </button>
                        </div>
                      `;
                    }).join('')}
                  </div>
                ` : ''}
              `}
            `}
          </div>
        </div>
      </div>
    `;
  }

  if (modal.type === 'battle_switch') {
    const forced = Boolean(modal.forced);
    const enemySp = POKEMON_SPECIES[battle.enemyMon.speciesId];

    return `
      <div class="modal-backdrop" data-testid="battle-switch-modal">
        <div class="modal-window narrow">
          <div class="modal-header">
            <div class="modal-title">
              🔄 ${forced ? '出戰寶可夢已倒下！請選擇下一隻出戰夥伴' : '切換出戰寶可夢'}
            </div>
            ${!forced ? `<button type="button" class="modal-close-btn" data-action="close-modal">取消 ✕</button>` : ''}
          </div>
          <div class="modal-body">
            <div class="card-grid-2">
              ${save.party.map((mon, idx) => {
                const sp = POKEMON_SPECIES[mon.speciesId];
                const isCurrent = mon.uid === battle.playerMon.uid;
                const mult = getTypeMultiplier(sp.type, enemySp.type);
                const canSend = !isCurrent && mon.hp > 0;
                return `
                  <div class="mon-manage-card">
                    <img src="/pokemon-rpg/assets/pokemon/${esc(mon.speciesId)}.webp" alt="${esc(sp.nameZh)}" class="mon-thumb-img" />
                    <div class="mon-info-col">
                      <div style="font-weight:900;font-size:0.92rem">
                        ${esc(monDisplayName(mon))} <span style="color:var(--gold)">Lv.${mon.level}</span>
                      </div>
                      <div>${renderTypeBadge(sp.type)} ${renderStatusBadge(mon)}</div>
                      <div style="font-size:0.78rem;color:var(--emerald)">HP ${mon.hp}/${mon.maxHp} ｜ MP ${mon.mp}/${mon.maxMp}</div>
                      ${mult >= 1.8 ? `<div style="font-size:0.72rem;color:#86efac;font-weight:800">★ 屬性剋制當前對手</div>` : ''}
                      <button
                        type="button"
                        class="mini-btn primary"
                        style="margin-top:4px"
                        data-action="confirm-battle-switch"
                        data-party-idx="${idx}"
                        data-testid="switch-to-${idx}"
                        ${!canSend ? 'disabled' : ''}
                      >
                        ${isCurrent ? '目前出戰中' : mon.hp <= 0 ? '瀕死無法出戰' : '派出上場！'}
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (modal.type === 'team') {
    const tab = modal.tab || 'party';
    const allMons = [...save.party, ...save.box];
    const currentSelectedUid = modal.selectedUid || save.party[0]?.uid || save.box[0]?.uid;
    const selectedMon = allMons.find((m) => m.uid === currentSelectedUid) || save.party[0];
    const selSp = selectedMon ? POKEMON_SPECIES[selectedMon.speciesId] : null;
    const selSkills = selectedMon ? getUnlockedSkills(selectedMon.speciesId, selectedMon.level) : [];
    const selExpNeed = selectedMon ? expForNextLevel(selectedMon.level) : 100;
    const selFollowIdx = selectedMon ? save.followers.indexOf(selectedMon.uid) : -1;
    const selIsFollowing = selFollowIdx !== -1;
    const selInParty = selectedMon ? save.party.some((m) => m.uid === selectedMon.uid) : false;
    const selPartyIdx = selectedMon ? save.party.findIndex((m) => m.uid === selectedMon.uid) : -1;
    const selEvoTarget = selSp?.evolvesTo ? POKEMON_SPECIES[selSp.evolvesTo.speciesId || selSp.evolvesTo.targetId] : null;

    const renderMonCard = (mon, idx, location) => {
      const sp = POKEMON_SPECIES[mon.speciesId];
      const followIdx = save.followers.indexOf(mon.uid);
      const isFollowing = followIdx !== -1;
      const skills = getUnlockedSkills(mon.speciesId, mon.level);
      const isSelected = mon.uid === selectedMon?.uid;

      return `
        <div
          class="mon-manage-card ${isSelected ? 'selected' : ''}"
          style="align-items:flex-start;cursor:pointer"
          data-action="select-team-mon"
          data-uid="${esc(mon.uid)}"
          data-testid="team-card-${esc(mon.uid)}"
          title="點擊查看「${esc(monDisplayName(mon))}」完整立繪與能力數值"
        >
          <img src="/pokemon-rpg/assets/pokemon/${esc(mon.speciesId)}.webp" alt="${esc(sp.nameZh)}" class="mon-thumb-img" />
          <div class="mon-info-col">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
              <strong style="font-size:0.96rem;color:${isSelected ? 'var(--gold-bright)' : 'var(--text-main)'}">
                ${location === 'party' && idx === 0 ? '👑 ' : ''}${esc(monDisplayName(mon))}
                <span style="color:var(--gold-bright)">Lv.${mon.level}</span>
              </strong>
              <div style="display:flex;gap:4px">
                ${renderTypeBadge(sp.type)}
                ${renderRarityBadge(sp.rarity)}
              </div>
            </div>

            <div style="font-size:0.78rem;color:var(--text-sub)">
              HP <strong style="color:var(--emerald)">${mon.hp}/${mon.maxHp}</strong> ｜
              MP <strong style="color:var(--cyan)">${mon.mp}/${mon.maxMp}</strong> ｜
              攻 ${mon.atk} / 防 ${mon.def} / 速 ${mon.spd}
            </div>

            <div style="font-size:0.74rem;color:var(--text-muted)">
              招式：${skills.slice(0, 3).map((s) => s.nameZh).join('、')}
            </div>

            <div class="action-btn-group" style="margin-top:6px">
              <button
                type="button"
                class="mini-btn ${isFollowing ? 'gold' : 'primary'}"
                data-action="toggle-follower"
                data-uid="${esc(mon.uid)}"
                data-testid="toggle-follower-${esc(mon.uid)}"
              >
                ${isFollowing ? `🐾 跟隨中 (#${followIdx + 1})` : save.followers.length >= 3 ? '🐾 替換跟隨' : '🐾 設為跟隨'}
              </button>

              ${location === 'party' && idx > 0 ? `
                <button
                  type="button"
                  class="mini-btn"
                  data-action="set-party-lead"
                  data-uid="${esc(mon.uid)}"
                  data-testid="set-lead-${esc(mon.uid)}"
                >👑 首發</button>
              ` : ''}

              ${location === 'party' && save.party.length > 1 ? `
                <button
                  type="button"
                  class="mini-btn"
                  data-action="move-to-box"
                  data-uid="${esc(mon.uid)}"
                >📦 存箱</button>
              ` : ''}

              ${location === 'box' && save.party.length < 6 ? `
                <button
                  type="button"
                  class="mini-btn emerald"
                  data-action="move-to-party"
                  data-uid="${esc(mon.uid)}"
                >⚔️ 出戰</button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    };

    return `
      <div class="modal-backdrop" data-testid="team-modal">
        <div class="modal-window wide" style="max-width:1120px">
          <div class="modal-header">
            <div class="modal-title">
              ${gameIcon('team')} 旅途夥伴
            </div>
            <button type="button" class="modal-close-btn" data-action="close-modal" data-testid="close-modal-btn">關閉 ✕</button>
          </div>
          <div class="modal-tabs">
            <button type="button" class="tab-btn ${tab === 'party' ? 'active' : ''}" data-action="set-modal-tab" data-tab="party">
              ⚔️ 出戰隊伍 (${save.party.length}/6)
            </button>
            <button type="button" class="tab-btn ${tab === 'box' ? 'active' : ''}" data-action="set-modal-tab" data-tab="box">
              📦 寶可夢保管箱 (${save.box.length})
            </button>
            <span style="margin-left:auto;align-self:center;font-size:0.82rem;color:var(--cyan);font-weight:800">
              🐾 當前地圖跟隨夥伴：${save.followers.length} / 3 隻
            </span>
          </div>
          <div class="modal-body" style="padding:14px 18px">
            <div class="team-showcase-split-layout">
              <!-- Left Column: Grand Full-Body Artwork Stage (立繪展示舞台) -->
              <div class="team-artwork-stage" data-testid="team-mon-showcase">
                ${selectedMon && selSp ? `
                  <div class="stage-header-row">
                    <div>
                      <div class="stage-mon-title">
                        ${selInParty && selPartyIdx === 0 ? '👑 ' : ''}${esc(monDisplayName(selectedMon))}
                        <span class="stage-mon-lv">Lv.${selectedMon.level}</span>
                      </div>
                      <div style="display:flex;gap:6px;align-items:center;margin-top:3px">
                        ${renderTypeBadge(selSp.type)}
                        ${renderRarityBadge(selSp.rarity)}
                        ${renderStatusBadge(selectedMon)}
                        ${selIsFollowing ? `<span class="gold-pill">🐾 跟隨中 #${selFollowIdx + 1}</span>` : ''}
                      </div>
                    </div>
                  </div>

                  <!-- Full-Body High-Res Portrait Frame -->
                  <div class="stage-portrait-frame">
                    <div class="stage-portrait-glow type-${selSp.type}"></div>
                    <img
                      src="/pokemon-rpg/assets/pokemon/${esc(selectedMon.speciesId)}.webp"
                      alt="${esc(selSp.nameZh)}"
                      class="stage-portrait-img"
                    />
                  </div>

                  <!-- Friendship & Affinity -->
                  <div class="stage-friendship-row">
                    <span style="font-size:0.82rem;color:var(--text-sub);font-weight:800">❤️ 訓練員羈絆度：</span>
                    <span style="color:#f43f5e;font-size:1.05rem;letter-spacing:2px">❤️❤️❤️❤️❤️</span>
                    <span style="font-size:0.75rem;color:var(--emerald);font-weight:800">親密無間・暴擊率+10%</span>
                  </div>

                  <!-- Stat Progression Bars -->
                  <div class="stage-stats-block">
                    <div class="stage-stat-row">
                      <span class="stat-lbl">HP</span>
                      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((selectedMon.hp / Math.max(1, selectedMon.maxHp)) * 100)}%;background:${hpColor(selectedMon.hp / selectedMon.maxHp)}"></div></div>
                      <span class="stat-num">${selectedMon.hp}/${selectedMon.maxHp}</span>
                    </div>
                    <div class="stage-stat-row">
                      <span class="stat-lbl">MP</span>
                      <div class="bar-track"><div class="bar-fill" style="width:${Math.round((selectedMon.mp / Math.max(1, selectedMon.maxMp)) * 100)}%;background:var(--mp-bar)"></div></div>
                      <span class="stat-num">${selectedMon.mp}/${selectedMon.maxMp}</span>
                    </div>
                    <div class="stage-stat-row">
                      <span class="stat-lbl">EXP</span>
                      <div class="bar-track thin"><div class="bar-fill" style="width:${Math.round((selectedMon.exp / Math.max(1, selExpNeed)) * 100)}%;background:var(--exp-bar)"></div></div>
                      <span class="stat-num">${selectedMon.exp}/${selExpNeed}</span>
                    </div>
                    <div class="stage-combat-stats-row">
                      <div class="stat-badge"><span>⚔️ 攻擊</span><strong>${selectedMon.atk}</strong></div>
                      <div class="stat-badge"><span>🛡️ 防禦</span><strong>${selectedMon.def}</strong></div>
                      <div class="stat-badge"><span>⚡ 速度</span><strong>${selectedMon.spd}</strong></div>
                    </div>
                  </div>

                  <!-- Unlocked Skills -->
                  <div class="stage-skills-box">
                    <div style="font-size:0.8rem;color:var(--gold-bright);font-weight:900;margin-bottom:6px">
                      ✨ 已掌握技能招式（戰鬥可消耗 MP 施放）：
                    </div>
                    <div class="stage-skills-grid">
                      ${selSkills.map((sk) => `
                        <div class="stage-skill-pill">
                          <span class="skill-pill-name">${esc(sk.nameZh)}</span>
                          <span class="skill-pill-meta">${renderTypeBadge(sk.type)} ${sk.power > 0 ? `威 ${sk.power}` : '輔助'} ｜ MP ${sk.mpCost}</span>
                        </div>
                      `).join('')}
                    </div>
                  </div>

                  <!-- Evolution Info -->
                  ${selEvoTarget ? `
                    <div class="stage-evo-note">
                      ✨ 進化情報：達 Lv.${selSp.evolvesTo.level} 可進化為「<strong>${esc(selEvoTarget.nameZh)}</strong>」
                    </div>
                  ` : ''}

                  <!-- Stage Action Toolbar -->
                  <div class="stage-actions-bar">
                    <button
                      type="button"
                      class="mini-btn ${selIsFollowing ? 'gold' : 'primary'}"
                      style="padding:8px 14px;font-size:0.86rem"
                      data-action="toggle-follower"
                      data-uid="${esc(selectedMon.uid)}"
                    >
                      ${selIsFollowing ? `🐾 取消地圖跟隨 (#${selFollowIdx + 1})` : save.followers.length >= 3 ? '🐾 替換為跟隨伴侶' : '🐾 設為跟隨伴侶 (最多3隻)'}
                    </button>

                    ${selInParty && selPartyIdx > 0 ? `
                      <button
                        type="button"
                        class="mini-btn"
                        style="padding:8px 14px;font-size:0.86rem"
                        data-action="set-party-lead"
                        data-uid="${esc(selectedMon.uid)}"
                      >👑 設為首發隊長</button>
                    ` : ''}

                    ${selInParty && save.party.length > 1 ? `
                      <button
                        type="button"
                        class="mini-btn"
                        style="padding:8px 14px;font-size:0.86rem"
                        data-action="move-to-box"
                        data-uid="${esc(selectedMon.uid)}"
                      >📦 存入保管箱</button>
                    ` : ''}

                    ${!selInParty && save.party.length < 6 ? `
                      <button
                        type="button"
                        class="mini-btn emerald"
                        style="padding:8px 14px;font-size:0.86rem"
                        data-action="move-to-party"
                        data-uid="${esc(selectedMon.uid)}"
                      >⚔️ 加入出戰隊伍</button>
                    ` : ''}
                  </div>
                ` : `
                  <div style="padding:40px 20px;text-align:center;color:var(--text-sub)">請在右側選擇寶可夢</div>
                `}
              </div>

              <!-- Right Column: Party / Box Pokémon Cards Grid -->
              <div class="team-list-panel">
                <div style="font-size:0.82rem;color:var(--gold-bright);font-weight:800;margin-bottom:8px">
                  ${tab === 'party' ? '⚔️ 點擊任意寶可夢切換左側立繪與能力檢視：' : '📦 保管箱成員列表（點擊檢視或加入出戰）：'}
                </div>
                ${tab === 'party' ? `
                  <div class="card-grid-1">
                    ${save.party.map((m, i) => renderMonCard(m, i, 'party')).join('')}
                  </div>
                ` : save.box.length === 0 ? `
                  <div style="padding:28px;text-align:center;color:var(--text-sub)">
                    保管箱目前沒有寶可夢。當出戰隊伍滿 6 隻時，新收服的寶可夢會自動傳送至保管箱，且同樣可設為地圖跟隨夥伴！
                  </div>
                ` : `
                  <div class="card-grid-1">
                    ${save.box.map((m, i) => renderMonCard(m, i, 'box')).join('')}
                  </div>
                `}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (modal.type === 'pokedex') {
    const caughtSet = new Set(save.pokedex.caught);
    const seenSet = new Set([...save.pokedex.seen, ...save.pokedex.caught]);
    const selectedDexId = modal.selectedDexId || save.pokedex.caught[0] || POKEMON_LIST[0].id;
    const featuredSp = POKEMON_SPECIES[selectedDexId] || POKEMON_LIST[0];
    const isFeaturedCaught = caughtSet.has(featuredSp.id);
    const isFeaturedSeen = seenSet.has(featuredSp.id);
    const featuredEvo = featuredSp.evolvesTo ? POKEMON_SPECIES[featuredSp.evolvesTo.speciesId || featuredSp.evolvesTo.targetId] : null;

    return `
      <div class="modal-backdrop" data-testid="pokedex-modal">
        <div class="modal-window wide" style="max-width:1120px">
          <div class="modal-header">
            <div class="modal-title">
              ${gameIcon('dex')} 星輝生態圖鑑 <span class="journal-header-meta">收服 ${caughtSet.size}/24 · 發現 ${seenSet.size}/24</span>
            </div>
            <button type="button" class="modal-close-btn" data-action="close-modal" data-testid="close-modal-btn">關閉 ✕</button>
          </div>
          <div class="modal-body" style="padding:14px 18px">
            <div style="font-size:0.84rem;color:var(--gold-bright);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
              <span>💡 提示：收服達 3、6、10、15、20、24 種寶可夢，可回晨曦鎮找「研究員米雅」領取豐厚金幣與大師球！</span>
              <span style="color:var(--cyan);font-weight:800">點選卡片，翻閱寶可夢的生態檔案</span>
            </div>

            <div class="pokedex-split-layout">
              <!-- Left Pane: 24 Pokémon Grid -->
              <div class="pokedex-scroll-pane">
                <div class="pokedex-grid-dense">
                  ${POKEMON_LIST.map((sp) => {
                    const isCaught = caughtSet.has(sp.id);
                    const isSeen = seenSet.has(sp.id);
                    const isSelected = sp.id === featuredSp.id;
                    return `
                      <button
                        type="button"
                        class="dex-card-compact ${!isSeen ? 'unseen' : ''} ${isSelected ? 'selected' : ''}"
                        data-action="select-pokedex-mon"
                        data-dex-id="${esc(sp.id)}"
                        data-testid="dex-card-${esc(sp.id)}"
                        title="${isSeen ? `${sp.nameZh} (#${sp.dexNo})` : '未知寶可夢'}"
                      >
                        <span class="dex-num-pill">#${String(sp.dexNo).padStart(3, '0')}</span>
                        <img src="/pokemon-rpg/assets/pokemon/${esc(sp.id)}.webp" alt="${esc(sp.nameZh)}" />
                        <span class="dex-name-compact">${isSeen ? esc(sp.nameZh) : '？？？'}</span>
                        <div class="dex-badges-compact">
                          ${isSeen ? renderTypeBadge(sp.type) : ''}
                          ${isCaught ? `<span class="caught-dot" title="已收服">🔴</span>` : ''}
                        </div>
                      </button>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Right Pane: Featured Dex Illustration Showcase Stage (星輝圖鑑立繪展台) -->
              <div class="pokedex-showcase-pane" data-testid="dex-showcase-panel">
                ${isFeaturedSeen ? `
                  <div class="stage-header-row">
                    <div>
                      <div class="stage-mon-title">
                        ${esc(featuredSp.nameZh)}
                        <span class="stage-mon-sub">${esc(featuredSp.nameEn)}</span>
                        <span class="stage-mon-lv">#${String(featuredSp.dexNo).padStart(3, '0')}</span>
                      </div>
                      <div style="display:flex;gap:6px;align-items:center;margin-top:4px">
                        ${renderTypeBadge(featuredSp.type)}
                        ${renderRarityBadge(featuredSp.rarity)}
                        <span class="gold-pill">${isFeaturedCaught ? '🔴 已收服登錄' : '👁 遭遇目擊未收服'}</span>
                      </div>
                    </div>
                  </div>

                  <!-- High-Res Illustration Display -->
                  <div class="stage-portrait-frame">
                    <div class="stage-portrait-glow type-${featuredSp.type}"></div>
                    <img
                      src="/pokemon-rpg/assets/pokemon/${esc(featuredSp.id)}.webp"
                      alt="${esc(featuredSp.nameZh)}"
                      class="stage-portrait-img"
                    />
                  </div>

                  <!-- Lore & Habitat -->
                  <div class="dex-meta-box">
                    <div style="font-size:0.86rem;color:var(--gold-bright);font-weight:900">
                      📍 棲息生態：${esc(featuredSp.habitatZh)}
                    </div>
                    <div style="font-size:0.84rem;color:var(--text-sub);line-height:1.55;margin-top:4px">
                      ${esc(featuredSp.loreZh)}
                    </div>
                  </div>

                  <!-- Base Stats Rating -->
                  <div class="dex-base-stats-grid">
                    <div class="stat-badge"><span>HP 基礎</span><strong>${featuredSp.baseStats.hp}</strong></div>
                    <div class="stat-badge"><span>MP 基礎</span><strong>${featuredSp.baseStats.mp}</strong></div>
                    <div class="stat-badge"><span>物攻 基礎</span><strong>${featuredSp.baseStats.atk}</strong></div>
                    <div class="stat-badge"><span>物防 基礎</span><strong>${featuredSp.baseStats.def}</strong></div>
                    <div class="stat-badge"><span>速度 基礎</span><strong>${featuredSp.baseStats.spd}</strong></div>
                  </div>

                  <!-- Evolution Branch -->
                  <div class="stage-evo-note">
                    ${featuredEvo
                      ? `✨ 進化途徑：達 Lv.${featuredSp.evolvesTo.level} 可進化為「<strong>${esc(featuredEvo.nameZh)}</strong>」`
                      : '⚡ 形態特徵：星輝大陸最終形態或稀有傳說寶可夢'}
                  </div>
                ` : `
                  <div class="unseen-mystery-card">
                    <div class="stage-portrait-frame">
                      <img
                        src="/pokemon-rpg/assets/pokemon/${esc(featuredSp.id)}.webp"
                        alt="未知寶可夢"
                        class="stage-portrait-img unseen-silhouette"
                      />
                    </div>
                    <h3 style="margin:12px 0 6px;color:var(--text-muted)">#${String(featuredSp.dexNo).padStart(3, '0')} ？？？ 未知生態寶可夢</h3>
                    <p style="margin:0;font-size:0.88rem;color:var(--text-sub);line-height:1.5;max-width:320px;text-align:center">
                      尚未在星輝大陸目擊此物種。<br/>
                      生態提示：出沒於「<strong>${esc(featuredSp.habitatZh)}</strong>」，快前往探索與遭遇吧！
                    </p>
                  </div>
                `}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (modal.type === 'map') {
    const selected=getMap(modal.zoneId || save.position.zone);
    const regional=modal.view==='regional';
    const surveyHeight=Math.round(900*Math.min(1.4,Math.max(.72,(selected.bounds.maxZ-selected.bounds.minZ)/(selected.bounds.maxX-selected.bounds.minX))));
    const surveyZoom=modal.mapZoom||1;
    const quest=getTrackedQuest(save,getMap)||QUEST_STAGES[Math.min(QUEST_STAGES.length-1,save.questStage||0)];
    return `
      <div class="modal-backdrop" data-testid="map-modal">
        <div class="modal-window wide atlas-window">
          <div class="modal-header">
            <div class="modal-title">${gameIcon('map')} 旅人地圖冊</div>
            <button type="button" class="modal-close-btn" data-action="close-modal" data-testid="close-modal-btn">關閉 ✕</button>
          </div>
          <div class="modal-body atlas-body">
            <div class="atlas-region-picker">
              <div class="atlas-region-hint">${Object.keys(MAP_ZONES).length} 個地區 <span>左右滑動選擇 →</span></div>
              <nav class="atlas-regions" aria-label="選擇地區">
              ${Object.values(MAP_ZONES).map(zone=>`<button type="button" data-action="select-map-zone" data-zone-id="${esc(zone.id)}" aria-pressed="${zone.id===selected.id}"><strong>${esc(zone.nameZh)}</strong><span>${esc(zone.levelRange)}</span></button>`).join('')}
              </nav>
            </div>
            <div class="atlas-survey">
              <div class="atlas-heading"><div><span class="title-kicker">STARLIGHT · EXPLORER'S ATLAS</span><h2>${regional?esc(selected.nameZh):'星輝大陸'}</h2></div><div class="atlas-view-switch" aria-label="地圖檢視"><button type="button" data-action="map-view" data-map-view="world" aria-pressed="${!regional}">世界全圖</button><button type="button" data-action="map-view" data-map-view="regional" aria-pressed="${regional}">區域路線</button></div></div>
            ${regional?`<div class="atlas-survey-tools"><span>精確路線與即時位置 · 放大後可滑動查看</span><div><button type="button" data-action="map-zoom" data-map-zoom="-1" aria-label="縮小區域地圖" ${surveyZoom===1?'disabled':''}>−</button><span>${Math.round(surveyZoom*100)}%</span><button type="button" data-action="map-zoom" data-map-zoom="1" aria-label="放大區域地圖" ${surveyZoom===2?'disabled':''}>＋</button></div></div><div class="atlas-sheet" style="--survey-ratio:${900/surveyHeight};--map-zoom:${surveyZoom}" tabindex="0" aria-label="區域地圖，可放大及滑動查看"><canvas
              id="rpg-fullmap-canvas"
              width="900"
              height="${surveyHeight}"
              aria-label="${esc(selected.nameZh)}的道路、水域、地標與地區出口"
            ></canvas></div>`:`<div class="atlas-illustration" data-testid="illustrated-world-atlas"><img src="${NAVIGATION_ART.atlas}" alt="星輝大陸手繪地圖：中央晨曦鎮、東方草原與森林、西方峽谷、北方神殿、南方海岸" />${Object.values(MAP_ZONES).map(zone=>{const pin=ATLAS_LANDMARKS[zone.id];if(!pin)return '';return `<button type="button" class="atlas-pin ${zone.id===save.position.zone?'is-current':''}" style="left:${pin.x}%;top:${pin.y}%" data-action="select-map-zone" data-zone-id="${esc(zone.id)}" aria-label="查看${esc(zone.nameZh)}區域路線"><span class="atlas-pin-gem">${quest?.targetZone===zone.id?'★':zone.id===save.position.zone?'●':'◆'}</span><strong>${esc(zone.nameZh.replace('・木橋林徑',''))}</strong>${zone.id===save.position.zone?'<small>目前地區</small>':''}</button>`;}).join('')}</div>`}
              <div class="atlas-legend"><span>● ${regional?'目前位置':'目前地區'}</span><span>★ 旅程目標</span><span>${regional?'◆ 地區出口':'點選地標查看區域路線'}</span><span>${regional?'深綠植被：野生棲地':'插畫總覽 · 詳圖提供精確位置'}</span></div>
              <div class="atlas-route-card"><div><strong>${esc(selected.nameZh)}</strong><span>${esc(selected.subtitleZh)} · ${esc(selected.levelRange)}</span></div><div class="atlas-connections">${(selected.portals||[]).map(p=>`<button type="button" data-action="select-map-zone" data-zone-id="${esc(p.targetZone)}">往 ${esc(getMap(p.targetZone).nameZh)} ↗</button>`).join('')}</div></div>
              ${quest?.targetZone===selected.id?`<p class="atlas-quest-note">★ ${esc(quest.objectiveZh)}</p>`:''}
              <div class="atlas-districts">${(selected.districts||[]).map(d=>`<span>${esc(d.nameZh)}</span>`).join('<i>·</i>')}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  if (modal.type === 'caught_showcase') {
    const mon = modal.mon;
    const sp = POKEMON_SPECIES[mon.speciesId];
    return `
      <div class="modal-backdrop" data-testid="caught-showcase-modal">
        <div class="modal-window narrow">
          <div class="celebration-box">
            <span class="title-kicker">🎉 CAPTURE SUCCESS!</span>
            <h2 style="margin:0;font-size:1.65rem;color:var(--gold-bright)">成功收服「${esc(sp.nameZh)}」！</h2>
            <img src="/pokemon-rpg/assets/pokemon/${esc(sp.id)}.webp" alt="${esc(sp.nameZh)}" class="celebration-sprite" />
            <div style="display:flex;gap:8px;justify-content:center">
              ${renderTypeBadge(sp.type)}
              ${renderRarityBadge(sp.rarity)}
              <span class="gold-pill">Lv.${mon.level}</span>
            </div>
            <p style="margin:0;max-width:460px;font-size:0.9rem;color:var(--text-sub);line-height:1.5">
              ${esc(sp.loreZh)}
            </p>
            <div style="font-size:0.86rem;color:var(--cyan);font-weight:800">
              ${esc(modal.placementNote)}
            </div>
            <button type="button" class="cta-primary" data-action="close-modal" data-testid="caught-confirm-btn">
              太棒了！繼續冒險 ✓
            </button>
          </div>
        </div>
      </div>
    `;
  }

  if (modal.type === 'evolution') {
    return `
      <div class="modal-backdrop" data-testid="evolution-modal">
        <div class="modal-window narrow">
          <div class="celebration-box">
            <span class="title-kicker">✨ EVOLUTION AWAKENING ✨</span>
            <h2 style="margin:0;font-size:1.65rem;color:var(--gold-bright)">
              恭喜！「${esc(modal.fromNameZh)}」進化成了「${esc(modal.toNameZh)}」！
            </h2>
            <div style="display:flex;align-items:center;justify-content:center;gap:18px">
              <img src="/pokemon-rpg/assets/pokemon/${esc(modal.fromId)}.webp" alt="${esc(modal.fromNameZh)}" style="width:82px;height:82px;opacity:0.55;object-fit:contain" />
              <span style="font-size:1.8rem;color:var(--gold-bright)">➔</span>
              <img src="/pokemon-rpg/assets/pokemon/${esc(modal.toId)}.webp" alt="${esc(modal.toNameZh)}" class="celebration-sprite" />
            </div>
            <div style="font-size:0.92rem;color:var(--emerald);font-weight:800">
              Lv.${modal.level} 能力值大幅突破，並已自動登錄至星輝圖鑑！
            </div>
            <button type="button" class="cta-primary" data-action="close-evolution" data-testid="evolution-confirm-btn">
              迎接全新姿態！
            </button>
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

export function drawLocalMinimap(canvas, save, quest) {
  return drawIllustratedMinimap(canvas,save,quest);
}

export { drawRegionalAtlasCanvas as drawWorldOverviewCanvas } from './worldMapCanvas.mjs';
