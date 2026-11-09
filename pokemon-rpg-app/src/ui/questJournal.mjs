import {QUESTS,QUEST_CATEGORIES} from '../data/quests.mjs';
import {ensureAdventure,questProgress} from '../engine/questEngine.mjs';
import {getMap} from '../data/world.mjs';
import {ITEMS} from '../data/items.mjs';
export function renderQuestJournal(modal,save,esc){
  const a=ensureAdventure(save),tab=modal.tab||'main',zone=modal.zoneFilter;
  const quests=QUESTS.filter(q=>q.category===tab&&(!zone||q.zone===zone));
  return `<div class="modal-backdrop" data-testid="quest-journal"><section class="modal-window wide quest-journal-window" role="dialog" aria-modal="true" aria-label="旅程日誌"><header class="modal-header"><div><span class="title-kicker">STARLIGHT · JOURNEY JOURNAL</span><h2 class="modal-title">旅程日誌</h2></div><button type="button" class="modal-close-btn" data-action="close-modal" data-testid="close-modal-btn">關閉 ✕</button></header>
    <div class="journey-summary"><span>已完成 <strong>${a.completed.length} / ${QUESTS.length}</strong></span><span>主線 <strong>${a.completed.filter(id=>id.startsWith('m')).length} / 13</strong></span><span>樹果 ${a.resources.berry||0} · 藥草 ${a.resources.herb||0}</span><span>觀測 ${a.inspected.length} · 足跡 ${a.visited.length} / 6</span></div>
    <nav class="modal-tabs journey-tabs" aria-label="任務分類">${Object.entries(QUEST_CATEGORIES).map(([key,name])=>`<button type="button" class="tab-btn ${tab===key?'active':''}" data-action="journal-tab" data-tab="${key}">${name}<small>${QUESTS.filter(q=>q.category===key&&a.completed.includes(q.id)).length}/${QUESTS.filter(q=>q.category===key).length}</small></button>`).join('')}</nav>
    <div class="journey-filter"><button type="button" data-action="journal-zone" data-zone-filter="">全部地區</button><button type="button" data-action="journal-zone" data-zone-filter="${save.position.zone}">只看${esc(getMap(save.position.zone).nameZh)}</button><span>${zone?esc(getMap(zone).nameZh):'六個地區的故事與委託'} · J 開啟日誌</span></div>
    <div class="modal-body journey-body">${quests.length?quests.map(q=>{
      const p=questProgress(save,q),accepted=Boolean(a.accepted[q.id]),locked=!q.requires.every(id=>a.completed.includes(id));
      const status=p.done?'已完成':locked?'尚未開放':p.ready?'可領獎':accepted?'進行中':'可接取';
      return `<article class="journey-card ${p.done?'is-done':''}" data-testid="quest-${q.id}"><div class="journey-card-heading"><span>${esc(getMap(q.zone).nameZh)}</span><span class="journey-status ${p.ready?'is-ready':''}">${status}</span></div><h3>${esc(q.titleZh)}</h3><p class="journey-story">${locked?'完成前一章後，這段故事將在旅途中揭開。':esc(q.story)}</p>
        ${!locked?`<ul class="journey-objectives">${p.objectives.map(o=>`<li class="${o.value>=o.count?'is-complete':''}"><span>${o.value>=o.count?'✓':'○'} ${esc(o.label)}</span><strong>${o.value}/${o.count}</strong></li>`).join('')}</ul>`:''}
        <div class="journey-rewards">獎勵：${q.reward.gold||0} 金幣${Object.entries(q.reward.items||{}).map(([id,n])=>' · '+esc(ITEMS[id]?.nameZh||id)+' ×'+n).join('')}${q.reward.worldFlag?' · 地區故事變化':''}</div>
        <div class="journey-actions">${!locked&&!p.done&&!accepted?`<button type="button" class="cta-primary" data-action="accept-quest" data-quest-id="${q.id}">接取委託</button>`:''}${accepted&&!p.done?`<button type="button" class="cta-secondary" data-action="track-quest" data-quest-id="${q.id}">${a.tracked===q.id?'正在追蹤':'追蹤任務'}</button>`:''}${p.ready&&!p.done?`<button type="button" class="cta-primary" data-action="claim-quest" data-quest-id="${q.id}">領取獎勵</button>`:''}${!locked?`<button type="button" class="cta-secondary" data-action="quest-map" data-zone-id="${q.zone}">查看地區</button>`:''}</div></article>`;
    }).join(''):'<p class="journey-empty">此分類在本區沒有委託，可切換至全部地區。</p>'}</div>
  </section></div>`;
}
