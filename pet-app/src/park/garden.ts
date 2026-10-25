import './garden.css';
import { GARDEN, GARDEN_SEEDS, type GardenCommand, type GardenPlotState, type GardenState } from '../../lib/park-garden.mjs';
import { GARDEN_PLOTS } from '../../lib/park-layout-v4.mjs';
import {SCENE_PROJECTS,PROJECT_RULES} from '../../lib/park-projects.mjs';
import communityArt from './community-art-assets.json';
import type { ParkClient } from './client';
const esc = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
interface Options { host:HTMLElement; client:ParkClient; language:string; onBusy(value:boolean):void; onNotice(message:string):void; onState(state:GardenState):void; onWalkToPlot?(id:string):void }
export class ParkGarden {
  state?: GardenState;
  private root:HTMLDivElement;
  private abort = new AbortController();
  private plotId?:string;
  private seed = 'sunflowers';
  private pending = false;
  private offset = 0;
  private timer:number;
  private lastFocus?:HTMLElement;
  private closed = false;
  constructor(private options:Options) {
    this.root = document.createElement('div'); this.root.className = 'park-garden-root'; options.host.append(this.root);
    const signal = this.abort.signal;
    this.root.addEventListener('click', event => this.click(event), { signal });
    window.addEventListener('keydown', event => { if (!this.plotId) return; if (event.key === 'Escape') { event.preventDefault(); this.close(); } else if (event.key === 'Tab') this.trapFocus(event); }, { signal });
    options.client.addEventListener('garden', event => this.receive((event as CustomEvent).detail?.state), { signal });
    options.client.addEventListener('connection', () => { if (!options.client.ready) { this.close(); this.pending = false; } else void this.refresh(); }, { signal });
    this.timer = window.setInterval(() => this.animate(), 250);
    if (options.client.ready) void this.refresh();
  }
  get isOpen() { return !!this.plotId; }
  setState(state:GardenState) { this.receive(state); }
  private t(zh:string,en:string) { return this.options.language === 'en-US' ? en : zh; }
  async refresh() {
    try { const result = await this.options.client.request<{state:GardenState}>('park:garden:state', {}); this.receive(result.state); }
    catch (error) { if (this.plotId) this.options.onNotice((error as Error).message); }
  }
  private receive(state?:GardenState) {
    if (!state || typeof state.day !== 'string' || !state.plots || this.closed) return;
    if (this.state && this.state.scope === state.scope && (state.day < this.state.day || state.day === this.state.day && (state.revision < this.state.revision || state.revision === this.state.revision && state.at < this.state.at))) return;
    this.state = state; this.offset = state.at - Date.now(); this.options.onState(state); if (this.plotId) this.render();
  }
  open(id:string) {
    if ((!GARDEN_PLOTS.some(p => p.id === id)&&!SCENE_PROJECTS.some(p=>p.id===id)) || this.closed) return;
    const project=SCENE_PROJECTS.find(p=>p.id===id);if(project&&!project.choices.some(c=>c.id===this.seed))this.seed=project.choices[0].id;
    this.lastFocus = document.activeElement as HTMLElement; this.plotId = id; this.options.onBusy(true); this.render(); void this.refresh();
  }
  close() {
    if (!this.plotId) return; this.plotId = undefined; this.root.innerHTML = ''; this.options.onBusy(false); this.lastFocus?.isConnected && this.lastFocus.focus({ preventScroll:true }); this.lastFocus = undefined;
  }
  private near() {
    const self = this.options.client.frames.get(this.options.client.selfId), plot = GARDEN_PLOTS.find(p => p.id === this.plotId)||SCENE_PROJECTS.find(p=>p.id===this.plotId);
    return !!self && !!plot && Math.hypot(self.x-plot.at.x,self.y-plot.at.y) <= 170;
  }
  private renderProject(){
    const spec=SCENE_PROJECTS.find(p=>p.id===this.plotId);if(!spec)return;const data=this.state?.projects?.[spec.id],near=this.near(),locale=this.options.language==='en-US'?'en-US':'zh-HK';
    const image=communityArt.assets[spec.kind].file,count=data?.count||0,mine=data?.contributions.filter(c=>c.actorId===this.options.client.selfId)||[],people=new Map<string,{name:string;count:number}>();
    for(const item of data?.contributions||[]){const value=people.get(item.actorId)||{name:item.name,count:0};value.count++;people.set(item.actorId,value);}
    this.root.innerHTML=`<div class="park-garden-backdrop"><section class="park-garden-panel park-project-panel" role="dialog" aria-modal="true" aria-labelledby="parkGardenTitle"><header><div><small>${this.t('同班共享 · 一起改變場景','OUR CLASS · SHARED SCENERY')}</small><h2 id="parkGardenTitle">${spec.name[locale]}</h2></div><button data-garden="close" aria-label="${this.t('關閉','Close')}">×</button></header><div class="park-project-hero"><img src="/pet/assets/art/park/community-v1/${image}" alt=""><span>${count}<small> / ${PROJECT_RULES.goal}</small></span></div><p class="park-garden-intro">${spec.description[locale]}<br>${this.t('每次幫忙，場景都會真的多一份裝飾。同班同學即時看見相同變化。','Every contribution places a real decoration in the world, visible to your classmates.')}</p><div class="park-project-meter" aria-label="${this.t('共建進度','Shared progress')}"><i style="width:${count/PROJECT_RULES.goal*100}%"></i></div><p class="park-project-stage">${this.t(['等你們加入','第一份小風景','風景越來越豐富','今天的共同作品完成了'][Math.floor(count/3)],['Ready for your class','A little shared scene','Growing more colourful','Today’s class creation is complete'][Math.floor(count/3)])}</p>${!data?`<p>${this.t('正在查看共同計畫…','Checking the shared project…')}</p>`:`<div class="park-garden-seeds">${spec.choices.map(c=>`<button data-garden="seed" data-seed="${c.id}" class="${this.seed===c.id?'selected':''}" aria-pressed="${this.seed===c.id}"><span style="color:#${c.tint.toString(16)}">✦</span>${this.options.language==='en-US'?c.en:c.zh}</button>`).join('')}</div><button class="park-garden-action" data-garden="${near?'contribute':'walk'}" ${this.pending?'disabled':''}></button><p class="park-project-rule">${this.t(`你今天已幫忙 ${mine.length} / 3 次。每人最多 3 次，9 份心意完成計畫。每天香港時間午夜開始新的共建場景。`,`Your contributions: ${mine.length} / 3 today. Up to three per student; nine complete the project. A fresh shared scene begins at midnight Hong Kong time.`)}</p>${people.size?`<div class="park-garden-contributors"><small>${this.t('一起改變樂園的同學','CLASSMATES WHO HELPED')}</small><p>${[...people.values()].map(p=>esc(p.name)+' × '+p.count).join(' · ')}</p></div>`:''}`}</section></div>`;
    this.animateProject();this.root.querySelector<HTMLButtonElement>('[data-garden="close"]')?.focus({preventScroll:true});
  }
  private animateProject(){
    const spec=SCENE_PROJECTS.find(p=>p.id===this.plotId),data=spec&&this.state?.projects?.[spec.id],button=this.root.querySelector<HTMLButtonElement>('[data-garden="contribute"],[data-garden="walk"]');if(!spec||!data||!button)return;
    if(button.dataset.garden==='walk'){button.textContent=this.t('到現場一起幫忙','Walk over and help');return;}
    const mine=data.contributions.filter(c=>c.actorId===this.options.client.selfId),remaining=mine.length?Math.max(0,Math.ceil((mine.at(-1)!.at+PROJECT_RULES.cooldownMs-Date.now()-this.offset)/1000)):0,done=data.count>=PROJECT_RULES.goal,limit=mine.length>=PROJECT_RULES.perStudent;
    button.disabled=this.pending||done||limit||remaining>0;button.textContent=this.pending?this.t('正在佈置…','Placing it…'):done?this.t('全班完成了，一起欣賞吧','Completed together!'):limit?this.t('已幫忙三次，等同學接力吧','Three done — invite your classmates'):remaining?this.t(`${remaining} 秒後可再幫忙`,`Help again in ${remaining}s`):this.t(spec.kind==='garland'?'掛上這份花飾':spec.kind==='lily'?'種下一片睡蓮':'掛一盞願望燈',spec.kind==='garland'?'Hang these flowers':spec.kind==='lily'?'Add a water lily':'Hang a wish lantern');
  }
  private render() {
    if(SCENE_PROJECTS.some(p=>p.id===this.plotId)){this.renderProject();return;}
    const plot = this.plotId ? this.state?.plots[this.plotId] : undefined; if (!this.plotId) return;
    const focusAction = (document.activeElement as HTMLElement)?.dataset.garden;
    const seed = GARDEN_SEEDS.find(s => s.id === plot?.seed), seedName = seed ? this.options.language === 'en-US' ? seed.en : seed.zh : '';
    const stage:GardenPlotState['stage'] = plot?.stage || 'empty', near = this.near();
    const labels = { empty: this.t('一片等待種子的泥土', 'A little soil waiting for seeds'), thirsty: this.t('小芽需要兩次輕輕澆水', 'Two gentle waterings for a new sprout'), growing: this.t('花朵正在慢慢長大', 'Your flowers are growing'), ready: this.t('花開了，採一束分享吧', 'In bloom! Pick a bouquet to share') };
    const action = stage === 'empty' ? 'plant' : stage === 'thirsty' ? 'water' : 'harvest';
    this.root.innerHTML = `<div class="park-garden-backdrop"><section class="park-garden-panel" role="dialog" aria-modal="true" aria-labelledby="parkGardenTitle"><header><div><small>${this.t('全班一起照顧', 'GROWN TOGETHER')}</small><h2 id="parkGardenTitle">${this.t('我們的花圃', 'Our little garden')}</h2></div><button data-garden="close" aria-label="${this.t('關閉', 'Close')}">×</button></header><p class="park-garden-intro">${this.t('種下種子，和同學澆水，讓樂園多開一束花。每天香港時間午夜開始新花圃。', 'Plant a seed, water with your classmates, and bring more blooms to the park. A fresh garden starts at midnight Hong Kong time.')}</p><div class="park-garden-today"><span>❀</span><div><b>${this.state?.bouquets || 0}</b><small>${this.t('今日全班採收的花束', 'class bouquets today')}</small></div></div>${!plot ? `<p class="park-garden-loading">${this.t('正在查看花圃…', 'Checking the garden…')}</p>` : `<div class="park-garden-progress" aria-label="${this.t('生長進度', 'Growing progress')}">${['empty','thirsty','growing','ready'].map((value,i)=>`<span class="${['empty','thirsty','growing','ready'].indexOf(stage)>=i?'done':''}">${['•','♧','☀','❀'][i]}<small>${[this.t('種子','Seed'),this.t('澆水','Water'),this.t('長大','Grow'),this.t('盛開','Bloom')][i]}</small></span>`).join('')}</div><h3>${seedName ? esc(seedName)+' · ' : ''}${labels[stage]}</h3>${stage === 'empty' ? `<div class="park-garden-seeds">${GARDEN_SEEDS.map(s=>`<button data-garden="seed" data-seed="${s.id}" class="${s.id===this.seed?'selected':''}" aria-pressed="${s.id===this.seed}"><span style="color:${s.color}">❀</span>${this.options.language==='en-US'?s.en:s.zh}</button>`).join('')}</div>` : `<p class="park-garden-status">${stage==='thirsty'?this.t(`已澆水 ${plot.waterCount} / ${GARDEN.watersNeeded} 次。同學可以立即幫忙；自己再次澆水要等 4 秒。`,`${plot.waterCount} / ${GARDEN.watersNeeded} waterings. A classmate can help now; your next watering needs a 4-second pause.`):stage==='growing'?`<b data-garden-time></b> ${this.t('秒後盛開', 'seconds until bloom')}`:this.t('花束屬於全班的共同成果，不會消耗或發放金幣。','A bouquet is a shared class achievement. No coins are spent or awarded.')}</p>`}<button class="park-garden-action primary" data-garden="${near?action:'walk'}" ${this.pending||near&&stage==='growing'?'disabled':''}>${this.pending?this.t('照顧中…','Taking care…'):!near?this.t('先走到花圃前','Walk to this bed'):stage==='empty'?this.t('種下這包種子','Plant these seeds'):stage==='thirsty'?this.t('輕輕澆水','Water the sprout'):stage==='growing'?this.t('讓花朵曬曬太陽','Let the sunshine help'):this.t('採收一束花','Pick a bouquet')}</button>${plot.contributors.length?`<div class="park-garden-contributors"><small>${this.t('這次一起照顧的同學','Helping this bloom')}</small><p>${plot.contributors.map(p=>esc(p.name)).join(' · ')}</p></div>`:''}${plot.lastHarvest&&stage==='empty'?`<p class="park-garden-last">${this.t(`${esc(plot.lastHarvest.name)} 剛為全班採了一束花。`,`${esc(plot.lastHarvest.name)} picked the last class bouquet.`)}</p>`:''}`}</section></div>`;
    this.animate();
    (focusAction ? this.root.querySelector<HTMLButtonElement>(`[data-garden="${focusAction}"]:not(:disabled)`) : null)?.focus({preventScroll:true});
    if (!this.root.contains(document.activeElement)) this.root.querySelector<HTMLButtonElement>('[data-garden="close"]')?.focus({preventScroll:true});
  }
  private animate() {
    if(SCENE_PROJECTS.some(p=>p.id===this.plotId)){this.animateProject();return;}
    const plot = this.plotId ? this.state?.plots[this.plotId] : undefined, node = this.root.querySelector('[data-garden-time]');
    if (node && plot?.readyAt) node.textContent = String(Math.max(0, Math.ceil((plot.readyAt - Date.now() - this.offset) / 1000)));
    const water = this.root.querySelector<HTMLButtonElement>('[data-garden="water"]');
    if (water && plot?.stage === 'thirsty') {
      const remaining = plot.lastWatererId === this.options.client.selfId && plot.lastWaterAt !== null ? Math.max(0, Math.ceil((plot.lastWaterAt + GARDEN.waterCooldownMs - Date.now() - this.offset) / 1000)) : 0;
      water.disabled = this.pending || remaining > 0;
      water.textContent = this.pending ? this.t('照顧中…', 'Taking care…') : remaining ? this.t(`${remaining} 秒後可再澆水`, `Water again in ${remaining}s`) : this.t('輕輕澆水', 'Water the sprout');
    }
  }
  private async act(action:'plant'|'water'|'harvest'|'contribute') {
    const plot=this.plotId&&(action==='contribute'?this.state?.projects?.[this.plotId]:this.state?.plots[this.plotId]); if(!plot||!this.state||this.pending)return;
    this.pending=true; this.render();
    const body:GardenCommand={plotId:plot.id,action,requestId:crypto.randomUUID(),revision:plot.revision,day:this.state.day,...(action==='plant'||action==='contribute'?{seed:this.seed}:{})};
    try { const result=await this.options.client.request<{state:GardenState}>('park:garden:act',body); this.receive(result.state); this.options.onNotice(this.t(action==='contribute'?'場景已更新！同班同學都看得到你的心意。':action==='plant'?'種子已住進花圃。':action==='water'?'小芽喝到水了，謝謝你的照顧！':'全班又多了一束花！',action==='contribute'?'The shared scenery has changed for your class!':action==='plant'?'Your seed is planted.':action==='water'?'A little water. Thank you for helping!':'One more bouquet for the class!')); }
    catch(error){this.options.onNotice((error as Error).message);await this.refresh();}
    finally{this.pending=false;if(this.plotId)this.render();}
  }
  private click(event:Event) {
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-garden]');if(!button||button.disabled)return;
    const action=button.dataset.garden;if(action==='close')return this.close();
    if(action==='seed'){this.seed=button.dataset.seed!;return this.render();}
    if(action==='walk'){const id=this.plotId!;this.close();return this.options.onWalkToPlot?.(id);}
    if(action==='plant'||action==='water'||action==='harvest'||action==='contribute')void this.act(action);
  }
  private trapFocus(event:KeyboardEvent){const buttons=[...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];if(!buttons.length)return;const i=buttons.indexOf(document.activeElement as HTMLButtonElement);if(event.shiftKey?i<=0:i<0||i===buttons.length-1){event.preventDefault();buttons[event.shiftKey?buttons.length-1:0].focus();}}
  destroy(){if(this.closed)return;this.close();this.closed=true;this.abort.abort();clearInterval(this.timer);this.root.remove();}
}
