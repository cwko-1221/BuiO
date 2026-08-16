import Phaser from 'phaser';
import './styles/main.css';
import { api } from './api';
import { audio } from './audio';
import { BedroomScene } from './game/BedroomScene';
import type { Bootstrap, Identity, InventoryStack, Locale, PetDefinition, PetInstance, RoomPlacement } from './types';
import { idempotencyKey } from './types';

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
        <div class="wallet"><span>${icon('coin')}<b id="coinBalance">${this.state.wallet.balance.toLocaleString()}</b><small>${this.t('coins')}</small></span><span>${icon('spark')}<b id="dustBalance">${this.state.profile.stardust}</b><small>${this.t('dust')}</small></span></div>
        <button class="round-button" data-action="audio" aria-label="Sound">${icon(audio.enabled?'sound':'mute')}</button>
      </header>
      <main class="pet-main">
        <section class="play-surface" id="playSurface"><div id="game-root"></div><div id="gameHud" class="game-hud"></div><div id="celebrationLayer" class="celebration-layer" aria-hidden="true"></div></section>
        <aside class="side-panel" id="sidePanel"></aside>
      </main>
      <nav class="pet-nav" aria-label="Pet Paradise">
        ${[['home','home'],['collection','collection'],['shop','shop'],['visit','visit'],['settings','settings']].map(([tab,glyph])=>`<button data-tab="${tab}" class="${tab===this.tab?'active':''}" aria-current="${tab===this.tab?'page':'false'}">${icon(glyph)}<span>${this.t(tab as keyof typeof UI['zh-HK'])}</span></button>`).join('')}
      </nav>
      <div class="toast-stack" id="toasts" aria-live="polite"></div>
      <div class="modal-root" id="modalRoot"></div>
    </div>`;
    app.addEventListener('click', this.handleClick); app.addEventListener('change', this.handleChange); app.addEventListener('input', this.handleInput);
  }
  private handleClick = async (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-tab]'); if (!button) return;
    this.acknowledge(button); // visible response inside 100ms, before any await
    try {
      await audio.unlock(); audio.sfx('tap');
      if (button.dataset.tab) return this.openTab(button.dataset.tab);
      const action = button.dataset.action!;
      if (action === 'audio') { audio.setEnabled(!audio.enabled); button.innerHTML = icon(audio.enabled?'sound':'mute'); return; }
      if (action === 'hatch') return this.hatch(button as HTMLButtonElement);
      if (action === 'feed') return this.feed(button.dataset.id!);
      if (action === 'play') { this.game?.events.emit('pet:emote','happy'); audio.sfx('happy',this.state.catalog.pets.findIndex((pet)=>pet.id===this.activePet()?.speciesId)); return; }
      if (action === 'sleep') { this.game?.events.emit('pet:emote','sleep'); return; }
      if (action === 'activate') return this.activate(button.dataset.id!);
      if (action === 'buy-random-egg') return this.buyEgg({kind:'random'},button as HTMLButtonElement);
      if (action === 'buy-direct-egg') return this.buyEgg({kind:'direct',speciesId:button.dataset.id},button as HTMLButtonElement);
      if (action === 'buy-item') return this.buyItem(button.dataset.id!,button as HTMLButtonElement);
      if (action === 'shop-category') return this.renderShop(button.dataset.id!);
      if (action === 'decorate') return this.renderDecorator();
      if (action === 'add-furniture') { this.game?.events.emit('room:add-item',button.dataset.id); return; }
      if (action === 'rotate-item') { if(this.selectedFurniture)this.game?.events.emit('room:rotate-selected',this.selectedFurniture); return; }
      if (action === 'remove-item') { if(this.selectedFurniture)this.game?.events.emit('room:remove-selected',this.selectedFurniture); return; }
      if (action === 'save-room') return this.saveRoom();
      if (action === 'visit-room') return this.visitRoom(button.dataset.id!);
      if (action === 'reaction') return this.react(button.dataset.owner!,button.dataset.id!);
      if (action === 'back-home') return this.openHome();
      if (action === 'equip-wearable') return this.toggleWearable(button.dataset.id!);
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
    // Scale.ENVELOP (cover) instead of FIT (contain): the 1280x720 design surface is scaled by
    // max(parentW/1280, parentH/720) so it always fills #game-root and the overflow is clipped
    // by the parent. FIT was the source of the grey letterbox bars — see art bible §4.
    this.game = new Phaser.Game({
      type: Phaser.AUTO, parent:'game-root', transparent:true,
      render:{antialias:true,pixelArt:false},
      scale:{ mode:Phaser.Scale.ENVELOP, autoCenter:Phaser.Scale.CENTER_BOTH, parent:'game-root', width:1280, height:720, expandParent:false },
      physics:{default:'arcade',arcade:{debug:false,gravity:{x:0,y:0}}}, audio:{noAudio:true},
    });
    // The play surface also changes size without a window resize (panel slides in,
    // class toggles, iPad rotation), so observe it directly and re-envelop.
    const surface = document.querySelector('#playSurface');
    if (surface && typeof ResizeObserver !== 'undefined') {
      this.surfaceObserver = new ResizeObserver(() => this.game?.scale.refresh());
      this.surfaceObserver.observe(surface);
    }
    this.game.scene.add('Bedroom',BedroomScene,false);
    this.game.events.on('room:placements',(placements:RoomPlacement[])=>{this.roomPlacements=placements.map((item)=>({...item}));});
    this.game.events.on('room:selected',(id:string)=>{this.selectedFurniture=id;document.querySelector('#furnitureActions')?.classList.add('visible');});
  }
  private startBedroom(roomOverride?: any, petOverride?: PetInstance) {
    this.ensureGame(); const pet=petOverride||this.activePet();if(!pet)return;const definition=this.definition(pet)!;
    const originalRoom=this.state.room;if(roomOverride)this.state.room={themeId:roomOverride.themeId,visibility:roomOverride.visibility,placements:roomOverride.placements};
    this.game!.scene.stop('Bedroom');this.game!.scene.start('Bedroom',{bootstrap:this.state,activePet:pet,petDefinition:definition});
    if(roomOverride)this.state.room=originalRoom;audio.setTheme('bedroom');
  }
  private openHome() {
    this.visiting=undefined;this.tab='home';this.startBedroom();this.renderHomePanel();document.querySelector('#gameHud')!.innerHTML='';
  }
  private renderHatch() {
    // Before the first hatch there is no Phaser scene, so the play surface would otherwise be a
    // dead rectangle on the very first screen a child sees. Dress it with a CSS hero instead.
    document.querySelector('#game-root')!.innerHTML=`<div class="stage-poster"><div class="poster-egg"><span></span></div><div class="poster-sparks" aria-hidden="true">${Array.from({length:10},(_,index)=>`<i style="--i:${index}"></i>`).join('')}</div></div>`;
    const panel=document.querySelector('#sidePanel')!;
    panel.innerHTML=`<div class="panel-scroll hatch-panel"><p class="eyebrow">FIRST FRIEND</p><h1>${this.t('hatchTitle')}</h1><p>${this.t('hatchCopy')}</p><div class="odds">${this.t('probability')}</div><button class="primary jumbo" data-action="hatch">${this.t('hatch')}</button></div>`;
  }
  private async hatch(button: HTMLButtonElement) {
    button.disabled=true;button.classList.add('loading');const result=await api.hatch(idempotencyKey());audio.sfx('hatch');this.celebrate(result.rarity==='epic'?'epic':'hatch');await this.reload();this.startBedroom();this.renderReveal(result.speciesId,result.rarity,result.duplicateDust);
  }
  private renderReveal(speciesId:string,rarity:string,dust:number){const definition=this.state.catalog.pets.find((pet)=>pet.id===speciesId)!;const pet=this.state.pets.find((pet)=>pet.speciesId===speciesId);const stage=pet?.stage||1;this.modal(`<div class="reveal-card ${rarity}"><p class="eyebrow">${rarity.toUpperCase()}</p><img src="${definition.art[stage-1]}" alt=""><h2>${escapeHtml(this.petName(definition,stage))}</h2><p>${dust?`重複品種轉成 ${dust} 星塵`:`天賦：${escapeHtml(this.name(definition.talent))}`}</p><button class="primary" data-action="back-home">${this.t('back')}</button></div>`);}
  private renderHomePanel() {
    const pet=this.activePet();const definition=this.definition(pet);if(!pet||!definition){this.renderHatch();return;}const next=this.state.catalog.evolutionThresholds[pet.stage]||pet.xp;const previous=this.state.catalog.evolutionThresholds[pet.stage-1]||0;const progress=pet.stage===4?100:Math.round(((pet.xp-previous)/(next-previous))*100);
    const foods=this.state.catalog.foods.filter((food)=>this.inventory(food.id)>0);
    const wearables=this.state.catalog.wearables.filter((item)=>this.inventory(item.id)>0);
    document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll home-panel"><div class="pet-title"><span class="rarity ${definition.rarity}">${definition.rarity}</span><h1>${escapeHtml(this.petName(definition,pet.stage))}</h1><p>${escapeHtml(this.name(definition.talent))}</p></div><div class="xp-card"><div><b>Stage ${pet.stage}/4</b><span>${pet.xp.toLocaleString()} XP</span></div><div class="progress"><i style="width:${progress}%"></i></div><small>${this.t('daily')} ${pet.dailyXpDate===this.state.serverDay?pet.dailyXp:0}/${this.state.catalog.dailyXpCap}</small></div><div class="quick-actions"><button data-action="play">${icon('play')}<span>${this.t('play')}</span></button><button data-action="sleep">${icon('moon')}<span>${this.t('sleep')}</span></button><button data-action="decorate">${icon('decorate')}<span>${this.t('decorate')}</span></button></div><section><div class="section-title"><h2>${this.t('feed')}</h2><small>${foods.length}</small></div><div class="food-row">${foods.length?foods.map((food)=>`<button class="food-chip" data-action="feed" data-id="${food.id}"><span>${['🍎','🍪','🥕','🫐','🥪','🥗','🍞','🍙','🌙','🥧','🍲','✨'][this.state.catalog.foods.indexOf(food)]}</span><b>${escapeHtml(this.name(food.name))}</b><small>+${food.xp} XP · ×${this.inventory(food.id)}</small></button>`).join(''):`<div class="empty-state">${this.t('empty')}<br><button data-tab="shop" class="text-button">${this.t('shop')}</button></div>`}</div></section><section><div class="section-title"><h2>${this.locale==='zh-HK'?'寵物換裝':'Pet outfit'}</h2><small>${pet.equippedWearables.length}/5</small></div><div class="mini-list">${wearables.length?wearables.map((item)=>`<button class="mini-item ${pet.equippedWearables.includes(item.id)?'selected':''}" data-action="equip-wearable" data-id="${item.id}"><b>${escapeHtml(this.name(item.name))}</b><small>${item.slot}</small></button>`).join(''):`<p class="muted">${this.locale==='zh-HK'?'到商店收集頭飾、面飾、頸飾、背飾及光環。':'Collect head, face, neck, back and aura accessories in the shop.'}</p>`}</div></section></div>`;
  }
  private async feed(foodId:string){const pet=this.activePet()!;const result=await api.feed(pet.id,foodId,idempotencyKey());audio.sfx('feed');this.game?.events.emit('pet:emote',result.evolved?'evolve':'eat');if(result.evolved){audio.sfx('evolve');this.celebrate('evolve');}await this.reload();this.startBedroom();this.renderHomePanel();}
  private async activate(petId:string){await api.activatePet(petId);await this.reload();audio.sfx('happy');this.startBedroom();this.renderCollection();}
  private renderCollection() { this.startBedroom();const owned=new Map(this.state.pets.map((pet)=>[pet.speciesId,pet]));document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll"><p class="eyebrow">20 SPECIES · 80 FORMS</p><h1>${this.t('collection')}</h1><div class="collection-grid">${this.state.catalog.pets.map((definition)=>{const pet=owned.get(definition.id);const stage=pet?.stage||1;return `<article class="pet-card ${definition.rarity} ${pet?'':'locked'}"><div class="pet-art"><img src="${definition.art[stage-1]}" alt="" loading="lazy"></div><span class="rarity ${definition.rarity}">${definition.rarity}</span><h3>${escapeHtml(this.petName(definition,stage))}</h3><p>${pet?`Stage ${stage} · ${pet.xp} XP`:this.t('locked')}</p>${pet?`<button data-action="activate" data-id="${pet.id}" ${pet.id===this.state.profile.activePetId?'disabled':''}>${pet.id===this.state.profile.activePetId?this.t('active'):this.t('choose')}</button>`:''}</article>`}).join('')}</div></div>`; }
  private renderShop(category='eggs') {
    this.startBedroom();const categories=this.locale==='zh-HK'
      ?[['eggs','寵物蛋'],['food','食物'],['wearables','服飾'],['rooms','房間'],['furniture','家具']]
      :[['eggs','Eggs'],['food','Food'],['wearables','Outfits'],['rooms','Rooms'],['furniture','Furniture']];
    let cards='';const pet=this.activePet();
    if(category==='eggs')cards=`<article class="shop-feature"><div class="shop-egg"></div><div><span class="rarity epic">${this.t('pity')} ${this.state.profile.eggPity}/${this.state.catalog.egg.pityAt-1}</span><h3>${this.t('randomEgg')}</h3><p>${this.t('probability')}<br>${this.locale==='zh-HK'?'第十抽必定史詩，未擁有品種權重較高。':'The tenth draw is guaranteed epic; unseen species are favoured.'}</p><button class="primary" data-action="buy-random-egg">${this.t('buy')} · ${this.state.catalog.egg.randomPrice} ${this.t('coins')}</button></div></article><h2>${this.t('directPet')}</h2><div class="shop-grid">${this.state.catalog.pets.filter((item)=>item.rarity!=='epic').map((item)=>`<article class="shop-card"><img src="${item.art[0]}" alt="" loading="lazy"><span class="rarity ${item.rarity}">${item.rarity}</span><h3>${escapeHtml(this.petName(item,1))}</h3><button data-action="buy-direct-egg" data-id="${item.id}" ${this.state.pets.some((owned)=>owned.speciesId===item.id)?'disabled':''}>${this.state.pets.some((owned)=>owned.speciesId===item.id)?this.t('owned'):`${this.t('buy')} · ${item.rarity==='common'?1200:2200}`}</button></article>`).join('')}</div>`;
    const list = category==='food'?this.state.catalog.foods:category==='wearables'?this.state.catalog.wearables:category==='rooms'?this.state.catalog.rooms.map((item)=>({...item,id:`room:${item.id}`,category:'room_theme'})):category==='furniture'?this.state.catalog.furniture:[];
    if(category!=='eggs')cards=`<div class="shop-grid">${list.map((item:any)=>{const owned=this.inventory(item.id)>0;const art=item.art||'';return `<article class="shop-card ${owned?'owned':''}">${art?`<img src="${art}" alt="" loading="lazy">`:`<div class="item-glyph ${item.category}">${icon(item.category==='food'?'food':item.kind||'spark')}</div>`}<h3>${escapeHtml(this.name(item.name))}</h3><p>${item.xp?`+${item.xp} XP`:item.kind||item.category}</p><button data-action="buy-item" data-id="${item.id}" ${owned&&!['food','furniture'].includes(item.category)?'disabled':''}>${owned&&!['food','furniture'].includes(item.category)?this.t('owned'):`${this.t('buy')} · ${item.price} ${item.currency==='stardust'?this.t('dust'):this.t('coins')}`}</button></article>`}).join('')}</div>`;
    document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll"><p class="eyebrow">MAGIC MARKET</p><h1>${this.t('shop')}</h1><div class="filter-row" role="tablist">${categories.map(([id,label])=>`<button data-action="shop-category" data-id="${id}" role="tab" aria-selected="${category===id}" class="${category===id?'active':''}">${label}</button>`).join('')}</div>${cards}</div>`;
  }
  private async buyEgg(body:any,button:HTMLButtonElement){button.disabled=true;const result=await api.buyEgg(body,idempotencyKey());audio.sfx('hatch');this.celebrate(result.rarity==='epic'?'epic':'hatch');await this.reload();this.startBedroom();this.renderReveal(result.speciesId,result.rarity,result.duplicateDust);}
  private async buyItem(itemId:string,button:HTMLButtonElement){button.disabled=true;await api.purchase({itemId,quantity:1},idempotencyKey());audio.sfx('buy');await this.reload();this.updateWallet();this.renderShop(button.closest('.panel-scroll')?.querySelector('.filter-row .active')?.getAttribute('data-id')||'eggs');this.toast(this.locale==='zh-HK'?'購買成功！':'Purchase complete!');}
  private renderDecorator(){
    this.game?.events.emit('room:set-editing',true);
    const zh=this.locale==='zh-HK';
    const owned=this.state.catalog.furniture.filter((item)=>this.inventory(item.id)>0);
    const themes=this.state.catalog.rooms.filter((room)=>this.inventory(`room:${room.id}`)>0);
    const inventory=owned.length
      ?`<div class="inventory-grid">${owned.map((item)=>`<button data-action="add-furniture" data-id="${item.id}"><span>${escapeHtml(this.name(item.name).split(/[・·‧·]/).pop()!.trim())}</span><small>×${this.inventory(item.id)}</small></button>`).join('')}</div>`
      :`<div class="empty-state"><span>${zh?'還沒有家具。':'No furniture yet.'}</span><button data-tab="shop" class="secondary">${zh?'去商店選購家具':'Browse furniture'}</button></div>`;
    document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll"><p class="eyebrow">12 × 10 GRID</p><h1>${this.t('decorate')}</h1><p class="lead">${zh?'點選家具放入房間，再拖動到喜歡的位置。':'Tap a piece to place it, then drag it where you like.'}</p><label class="field"><span>${zh?'房間主題':'Room theme'}</span><select id="roomTheme">${themes.map((room)=>`<option value="${room.id}" ${room.id===this.state.room.themeId?'selected':''}>${escapeHtml(this.name(room.name))}</option>`).join('')}</select></label><label class="field"><span>${zh?'參觀權限':'Visit privacy'}</span><select id="roomVisibility"><option value="private" ${this.state.room.visibility==='private'?'selected':''}>${this.t('private')}</option><option value="class" ${this.state.room.visibility==='class'?'selected':''}>${this.t('class')}</option></select></label><div class="decor-tools" id="furnitureActions"><button data-action="rotate-item">↻ ${zh?'旋轉':'Rotate'}</button><button data-action="remove-item">× ${zh?'收回':'Remove'}</button></div><div class="section-title"><h2>${zh?'我的家具':'My furniture'}</h2><small>${owned.length}</small></div>${inventory}<button class="primary sticky-action" data-action="save-room">${this.t('save')}</button></div>`;
  }
  private async saveRoom(){const result=await api.saveRoom({themeId:this.state.room.themeId,visibility:this.state.room.visibility,placements:this.roomPlacements});this.state.room=result;audio.sfx('decorate');await this.reload();this.game?.events.emit('room:set-editing',false);this.openHome();this.toast(this.locale==='zh-HK'?'房間已儲存。':'Room saved.');}
  private async renderVisits(){this.startBedroom();document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll"><p class="eyebrow">CLASS VISITS</p><h1>${this.t('visit')}</h1><div class="loading-card">${this.locale==='zh-HK'?'正在尋找開放房間…':'Finding open rooms…'}</div></div>`;const data=await api.classRooms();document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll"><p class="eyebrow">${escapeHtml(data.className||'CLASS')}</p><h1>${this.t('visit')}</h1><div class="visit-grid">${data.rooms.length?data.rooms.map((room:any)=>`<article class="visit-card"><div class="avatar-letter">${escapeHtml(room.ownerName).slice(0,1)}</div><div><h3>${escapeHtml(room.ownerName)}</h3><p>${room.activePet?escapeHtml(this.petName(this.state.catalog.pets.find((pet)=>pet.id===room.activePet.speciesId)!,room.activePet.stage)):this.locale==='zh-HK'?'尚未孵化':'No pet yet'}</p></div><button data-action="visit-room" data-id="${room.ownerStudentId}">${this.t('visitRoom')}</button></article>`).join(''):`<div class="empty-state">${this.locale==='zh-HK'?'暫時沒有同學開放房間。':'No classmates have opened their rooms yet.'}</div>`}</div></div>`;}
  private async visitRoom(studentId:string){const data=await api.room(studentId);this.visiting=data.room;if(data.room.activePet)this.startBedroom(data.room,data.room.activePet);document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll visitor-panel"><p class="eyebrow">VISITING</p><h1>${escapeHtml(data.room.ownerName)}</h1><p>${this.locale==='zh-HK'?'只可觀看和送出每日一個表情；沒有留言或聊天。':'View the room and send one daily reaction. There are no messages or chat.'}</p><div class="reaction-row">${this.state.catalog.reactions.map((reaction,index)=>`<button data-action="reaction" data-owner="${studentId}" data-id="${reaction}"><span>${['♥','★','!','👏','✿','✦'][index]}</span><small>${data.room.reactions?.[reaction]||0}</small></button>`).join('')}</div><button class="secondary" data-action="back-home">${this.t('back')}</button></div>`;}
  private async react(owner:string,reaction:string){const result=await api.react(owner,reaction);audio.sfx('reaction');this.celebrate('reaction');document.querySelectorAll('[data-action="reaction"]').forEach((button)=>{const id=(button as HTMLElement).dataset.id!;button.querySelector('small')!.textContent=String(result.reactions[id]||0);});}
  private async toggleWearable(wearableId:string){const pet=this.activePet()!;const definition=this.state.catalog.wearables.find((item)=>item.id===wearableId)!;let outfit=pet.equippedWearables.filter((id)=>this.state.catalog.wearables.find((item)=>item.id===id)?.slot!==definition.slot);if(!pet.equippedWearables.includes(wearableId))outfit.push(wearableId);await api.setOutfit(pet.id,outfit);await this.reload();this.startBedroom();}
  private renderSettings(){this.startBedroom();document.querySelector('#sidePanel')!.innerHTML=`<div class="panel-scroll settings-panel"><p class="eyebrow">COMFORT & ACCESS</p><h1>${this.t('settings')}</h1><label class="field"><span>${this.locale==='zh-HK'?'音樂音量':'Music volume'}</span><input type="range" min="0" max="1" step="0.05" value="${audio.musicLevel}" data-setting="music"></label><label class="field"><span>${this.locale==='zh-HK'?'音效音量':'Sound effects'}</span><input type="range" min="0" max="1" step="0.05" value="${audio.sfxLevel}" data-setting="sfx"></label><label class="toggle"><input type="checkbox" id="motionToggle" ${localStorage.getItem('pet-reduced-motion')==='1'?'checked':''}><span>${this.locale==='zh-HK'?'減少動畫':'Reduce motion'}</span></label><p class="privacy-note">${this.locale==='zh-HK'?'私隱：房間預設私人；公開後只有同班學生可參觀。系統沒有聊天、留言、交易或排行榜。':'Privacy: rooms are private by default. Only classmates can visit when opened. There is no chat, messaging, trading or leaderboard.'}</p></div>`;document.querySelector('#motionToggle')?.addEventListener('change',(event)=>{const on=(event.target as HTMLInputElement).checked;localStorage.setItem('pet-reduced-motion',on?'1':'0');document.documentElement.classList.toggle('reduced-motion',on);});}
  private async reload(){this.state=await api.bootstrap();this.roomPlacements=this.state.room.placements.map((item)=>({...item}));this.updateWallet();}
  private updateWallet(){this.setValue('#coinBalance',this.state.wallet.balance.toLocaleString());this.setValue('#dustBalance',String(this.state.profile.stardust));}
  private setValue(selector:string,value:string){const node=document.querySelector<HTMLElement>(selector);if(!node)return;if(node.textContent===value){node.textContent=value;return;}node.textContent=value;node.classList.remove('bump');void node.offsetWidth;node.classList.add('bump');window.setTimeout(()=>node.classList.remove('bump'),400);}
  private toast(message:string,error=false){const element=document.createElement('div');element.className=`toast ${error?'error':''}`;element.setAttribute('role',error?'alert':'status');element.textContent=message;document.querySelector('#toasts')?.append(element);window.setTimeout(()=>{element.classList.add('leaving');window.setTimeout(()=>element.remove(),200);},3000);}
  private modal(content:string){const root=document.querySelector('#modalRoot')!;root.innerHTML=`<div class="modal-backdrop"><div class="modal-card">${content}</div></div>`;root.querySelector('[data-action="back-home"]')?.addEventListener('click',()=>{root.innerHTML='';this.openHome();});}
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
