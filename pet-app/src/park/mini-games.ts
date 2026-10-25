import Phaser from 'phaser';
import {GAME_RULES,FLIGHT_CRAFT,gameResult,type CraftId,type GameKind,type GameState} from '../../lib/park-games.mjs';
import {MiniGameScene,skyUrl} from './mini-game-scene';
import {petForDisplay} from '../game/petDisplay';
import type {Bootstrap,PetInstance} from '../types';
import type {ParkProgress,ParkResult} from './types';
import type {ParkClient} from './client';
import adventure from './adventure-art-assets.json';
import {audio} from '../audio';
import './mini-games.css';
const bananaArt='/pet/assets/art/park/adventure-v2/'+adventure.assets.banana.file;
interface Options {game:Phaser.Game;bootstrap:Bootstrap;pet:PetInstance;client:ParkClient;progress:ParkProgress;english:boolean;onResult(r:ParkResult):void;onClose():void}
export class ParkMiniGame {
  scene:MiniGameScene;
  craft:CraftId='swift';
  get soundCount(){return audio.skySoundsPlayed;}
  private root:HTMLDivElement;
  private abort=new AbortController();
  private closed=false;
  private phase:'intro'|'playing'|'result'='intro';
  private state?:GameState;
  private session='';
  private working=false;
  private assetsReady=false;
  private assetFailed=false;
  private previousTheme:string;
  constructor(host:HTMLElement,private kind:GameKind,private options:Options){
    this.root=document.createElement('div');this.root.className='park-mini-root';this.root.dataset.kind=kind;host.append(this.root);host.classList.add('park-in-minigame');
    this.root.style.setProperty('--park-mini-landscape','url("'+skyUrl(kind==='flight'?'valley':'grove')+'")');
    const saved=localStorage.getItem('pet-flight-craft');if(saved&&Object.hasOwn(FLIGHT_CRAFT,saved))this.craft=saved as CraftId;
    this.previousTheme=audio.getTheme();audio.setMusicPaused(false);audio.setTheme(kind==='flight'?'flight':'banana');
    options.game.scene.sleep('Park');options.game.scene.getScene('Park').scene.setVisible(false);
    this.scene=new MiniGameScene(this,options,kind);this.render();options.game.scene.add('ParkMiniGame',this.scene,true);
    const signal=this.abort.signal;
    this.root.addEventListener('click',e=>{e.stopPropagation();void this.click(e);},{signal});
    options.client.addEventListener('game:frame',event=>{
      const data=(event as CustomEvent<{session:string;state:GameState}>).detail;if(data.session!==this.session||this.closed)return;
      this.state=data.state;this.scene.setState(data.state);this.hud();
      if(data.state.status==='ended'&&this.phase==='playing'){this.phase='result';audio.setMusicPaused(true);if(!data.state.bossDefeated)audio.sky(gameResult(data.state).qualified?'victory':'defeat',0,.8);this.renderPanel();}
    },{signal});
    options.client.addEventListener('game:cancelled',event=>{
      this.failed((event as CustomEvent).detail.message);this.session='';this.scene.session='';this.state=undefined;this.scene.resetRun();this.scene.clearControls();this.phase='intro';audio.stopSkySounds();audio.setMusicPaused(false);this.renderPanel();
    },{signal});
    window.addEventListener('blur',()=>void this.pause(),{signal});document.addEventListener('visibilitychange',()=>{if(document.hidden)void this.pause();},{signal});
    window.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();if(this.phase==='playing')void this.pause();else void this.exit();}
      if(event.key.toLowerCase()==='p'&&this.phase==='playing'){event.preventDefault();void this.pause();}
      if(event.key==='Tab'){const buttons=[...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')].filter(b=>b.offsetParent!==null),index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(buttons.length&&(event.shiftKey?index<=0:index<0||index===buttons.length-1)){event.preventDefault();buttons[event.shiftKey?buttons.length-1:0]?.focus();}}
    },{signal});
  }
  private t(zh:string,en:string){return this.options.english?en:zh;}
  private get locale(){return this.options.english?'en-US' as const:'zh-HK' as const;}
  layout(width:number,height:number,top:number){this.root.style.setProperty('--park-play-width',width+'px');this.root.style.setProperty('--park-play-height',height+'px');this.root.style.setProperty('--park-play-top',top+'px');}
  artReady(){this.assetsReady=true;this.assetFailed=false;this.renderPanel();}
  failed(message:string){if(this.closed)return;if(!this.assetsReady)this.assetFailed=true;const node=this.root.querySelector<HTMLElement>('.park-mini-error');if(node){node.textContent=message;node.hidden=false;}if(this.assetFailed)this.renderPanel();}
  private pilot(){
    const pet=petForDisplay(this.options.pet),definition=this.options.bootstrap.catalog.pets.find(p=>p.id===pet.speciesId)!;
    return '<img src="'+definition.art[pet.stage-1]+'" alt="'+this.t('你的寵物駕駛員','Your pet pilot')+'">';
  }
  private render(){
    this.root.innerHTML='<header class="park-mini-bar"><button data-mini="exit" aria-label="'+this.t('返回樂園','Return to park')+'">← <span>'+this.t('返回樂園','Park')+'</span></button><b>'+GAME_RULES[this.kind].name[this.locale]+'</b><div class="park-mini-stats"><span data-mini-score>0</span><small>'+this.t('分','PTS')+'</small><span data-mini-time>'+GAME_RULES[this.kind].duration+'</span><small>s</small><span data-mini-lives>'+(this.kind==='flight'?'♥♥♥♥♥':'♥♥♥')+'</span></div><button data-mini="sound" aria-label="'+this.t('切換遊戲聲音','Toggle game audio')+'" aria-pressed="'+audio.enabled+'">'+(audio.enabled?'♪':'♩')+'</button><button data-mini="pause" aria-label="'+this.t('暫停','Pause')+'">Ⅱ</button></header><div class="park-mini-panel"></div><div class="park-mini-footer"><span>'+this.t(this.kind==='flight'?'手指拖曳閃避・自動射擊':'左右拖曳・接住香蕉',this.kind==='flight'?'DRAG TO DODGE · AUTO FIRE':'DRAG TO CATCH')+'</span>'+(this.kind==='flight'?'<button data-mini="shield">◈ '+this.t('護盾','Shield')+' <b data-mini-shields>3</b><kbd>SPACE</kbd></button><button data-mini="special" class="park-special"><i data-mini-energy></i><span>✦ '+this.t('蓄能攻擊','Burst')+' <b data-mini-power>40%</b></span><kbd>X</kbd></button>':'<span class="park-mini-target">'+this.t('目標：8 顆香蕉','GOAL: 8 BANANAS')+'</span>')+'</div><p class="park-mini-error" role="status" hidden></p>';
    for(const action of ['shield','special']as const)this.root.querySelector<HTMLButtonElement>('[data-mini="'+action+'"]')?.addEventListener('pointerdown',event=>{event.preventDefault();if(action==='shield')this.scene.shield=true;else this.scene.special=true;},{signal:this.abort.signal});
    this.renderPanel();
  }
  private renderPanel(){
    if(this.closed)return;this.root.dataset.phase=this.phase;
    const target=this.root.querySelector<HTMLElement>('.park-mini-panel');if(!target)return;
    target.innerHTML='';target.classList.toggle('shown',this.phase!=='playing'||!!this.state?.paused);
    const best=this.options.progress.games?.[this.kind]?.best||0,ready=this.assetsReady&&!this.assetFailed;
    const start='<button class="park-activity-primary" data-mini="start" '+(ready?'':'disabled')+'>'+this.t(ready?'準備出發':'正在準備圖片…',ready?'START MISSION':'PREPARING ARTWORK…')+' <span>'+GAME_RULES[this.kind].duration+'s →</span></button>'+(this.assetFailed?'<button data-mini="retry-art" class="park-mini-again">'+this.t('↻ 重新載入圖片','↻ Retry artwork')+'</button>':'');
    if(this.phase==='intro'&&this.kind==='flight'){
      const selected=FLIGHT_CRAFT[this.craft];
      target.innerHTML='<section class="park-mini-card park-hangar" role="dialog" aria-modal="true" aria-labelledby="parkMiniTitle"><div class="park-hangar-heading"><div><small>SKY PATROL / HANGAR</small><h2 id="parkMiniTitle">'+this.t('下一站，飛向天空','Your next sky adventure')+'</h2></div><div class="park-pilot">'+this.pilot()+'<span>'+this.t('你的寵物駕駛員','YOUR PET PILOT')+'</span></div></div><div class="park-hangar-feature"><div class="park-craft-showcase"><span class="park-craft-orbit"></span><img src="'+skyUrl(this.craft)+'" alt="'+selected.name[this.locale]+'"></div><div class="park-craft-description"><small>'+this.t('已選飛行器','SELECTED AIRCRAFT')+'</small><h3>'+selected.name[this.locale]+'</h3><b>'+selected.weapon[this.locale]+'</b><p>'+this.t(this.craft==='swift'?'輕巧靈活，雙炮直射。適合精準追擊與快速閃避。':this.craft==='petal'?'寬翼穩定，花瓣散射。一次照顧整排敵機。':'重裝貫穿炮配追蹤導彈。穿過前排，直擊後方。',this.craft==='swift'?'Agile twin pulses. Chase targets and weave through fire.':this.craft==='petal'?'Wide petal volleys cover enemy formations.':'Piercing lances and homing missiles break heavy formations.')+'</p><span class="park-special-label">✦ '+selected.special[this.locale]+'</span></div></div><div class="park-craft-selection" role="group" aria-label="'+this.t('選擇飛行器','Choose aircraft')+'">'+(Object.keys(FLIGHT_CRAFT)as CraftId[]).map(id=>'<button data-mini="craft" data-craft="'+id+'" aria-pressed="'+(id===this.craft)+'"><img src="'+skyUrl(id)+'" alt=""><b>'+FLIGHT_CRAFT[id].name[this.locale]+'</b><small>'+FLIGHT_CRAFT[id].weapon[this.locale]+'</small></button>').join('')+'</div><p class="park-hangar-brief">'+this.t('三波機群 → 暴風方舟・收集 P 升級・蓄滿能量按 X','THREE WAVES → STORM ARK · COLLECT P TO UPGRADE · CHARGE X')+'</p>'+start+'<small class="park-mini-record">'+this.t(`擊破 6 架達標・每日首次 +${GAME_RULES[this.kind].reward} 金幣・與任務共用上限`,`6 targets: daily +${GAME_RULES[this.kind].reward} coins · Shared daily limit`)+'<span>'+this.t('今日紀錄 ','BEST ')+best+'</span></small></section>';
    }else if(this.phase==='intro'){
      target.innerHTML='<section class="park-mini-card park-picnic-intro" role="dialog" aria-modal="true" aria-labelledby="parkMiniTitle"><small>PICNIC / BANANA GROVE</small><div class="park-mini-hero">'+this.pilot()+'<img class="banana" src="'+bananaArt+'" alt=""></div><h2 id="parkMiniTitle">'+this.t('野餐前，接滿一籃','A basket for the picnic')+'</h2><p>'+this.t('接住香蕉、留意金香蕉，躲開橡果。連接 5 顆再加分！','Catch bananas and golden fruit. Dodge acorns. Catch five in a row for a bonus!')+'</p><div class="park-mini-reward">'+this.t(`接住 8 顆・每日首次達標 +${GAME_RULES[this.kind].reward} 金幣`,`Catch 8 · First daily goal: +${GAME_RULES[this.kind].reward} coins`)+'</div>'+start+'<small class="park-mini-record">'+this.t('今日紀錄 ','BEST ')+best+' · '+this.t('與任務共用每日金幣上限','Shared daily coin limit')+'</small></section>';
    }else if(this.phase==='result'&&this.state){
      const result=gameResult(this.state),record=this.options.progress.games?.[this.kind];
      target.innerHTML='<section class="park-mini-card result" role="dialog" aria-modal="true" aria-labelledby="parkMiniTitle"><small>'+this.t(this.kind==='flight'?'本次飛行紀錄':'本次野餐紀錄','MISSION REPORT')+'</small><div class="park-mini-stars">'+(result.victory?'✦ ✦ ✦':result.qualified?'✦ ✦':'✦')+'</div><h2 id="parkMiniTitle">'+(result.victory?this.t('漂亮完成！','MISSION CLEARED'):result.qualified?this.t('委託目標達成！','GOAL COMPLETE'):this.t('下一次，再飛遠一點','ONE MORE ADVENTURE'))+'</h2><b class="park-mini-final-score">'+result.score+'<small>PTS</small></b><div class="park-mini-result-details">'+(this.kind==='flight'?FLIGHT_CRAFT[this.craft].name[this.locale]+' · '+this.t('擊破 '+result.kills+' 架',''+result.kills+' TARGETS')+'<br>'+this.t(result.victory?'暴風方舟已擊退':'再練習走位，挑戰暴風方舟',result.victory?'STORM ARK DEFEATED':'KEEP PRACTISING YOUR DODGES'):this.t('接住 '+result.caught+' 顆・最長連接 '+result.combo+' 顆',result.caught+' CAUGHT · BEST COMBO '+result.combo))+'<br>'+this.t('今日紀錄：','BEST: ')+Math.max(best,result.score)+'</div><p>'+this.t(result.qualified?record?.rewardedAt?'今日遊戲獎勵已領取，仍可刷新紀錄及推進委託。':`達標獎勵 ${GAME_RULES[this.kind].reward} 金幣，受今日剩餘上限限制。`:'這局會留下練習紀錄，下次再挑戰！',result.qualified?record?.rewardedAt?'Daily reward collected. You can still improve your record and requests.':`Goal reward: ${GAME_RULES[this.kind].reward} coins, within your remaining daily limit.`:'Save this practice run and try again!')+'</p><button class="park-activity-primary" data-mini="finish">'+this.t('結算並返回樂園','FINISH & RETURN')+' →</button><button class="park-mini-again" data-mini="again">↻ '+this.t('結算，再玩一局','FINISH & PLAY AGAIN')+'</button></section>';
    }else if(this.state?.paused)target.innerHTML='<section class="park-mini-card paused" role="dialog" aria-modal="true" aria-labelledby="parkMiniTitle"><small>TAKE A BREATHER</small><h2 id="parkMiniTitle">'+this.t('已暫停，等你回來','PAUSED FOR YOU')+'</h2><p>'+this.t('敵機、香蕉和時間都已停下。','The stage, fruit and timer are waiting.')+'</p><button class="park-activity-primary" data-mini="resume">▶ '+this.t('繼續遊戲','RESUME')+'</button><button class="park-mini-again" data-mini="exit">'+this.t('結束這局，返回樂園','END RUN & RETURN')+'</button></section>';
    if(this.phase!=='playing'||this.state?.paused)target.querySelector<HTMLButtonElement>('.park-activity-primary:not(:disabled)')?.focus();
  }
  private hud(){
    const state=this.state;if(!state)return;
    const text=(node:Element|null,value:string)=>{if(node&&node.textContent!==value)node.textContent=value;};
    text(this.root.querySelector('[data-mini-score]'),String(state.score));
    text(this.root.querySelector('[data-mini-time]'),String(Math.max(0,Math.ceil(GAME_RULES[this.kind].duration-state.t))));
    text(this.root.querySelector('[data-mini-lives]'),'♥'.repeat(Math.max(0,state.lives))+'♡'.repeat(Math.max(0,(this.kind==='flight'?5:3)-state.lives)));
    text(this.root.querySelector('[data-mini-shields]'),String(state.shields));
    const energy=this.root.querySelector<HTMLElement>('[data-mini-energy]'),width=Math.floor(state.energy)+'%';if(energy&&energy.style.width!==width)energy.style.width=width;
    text(this.root.querySelector('[data-mini-power]'),state.energy>=100?this.t('就緒','READY'):width);
    const special=this.root.querySelector<HTMLButtonElement>('[data-mini="special"]');if(special){special.disabled=state.energy<100||state.paused;special.classList.toggle('ready',state.energy>=100);}
    let streak=this.root.querySelector<HTMLElement>('.park-mini-streak');if(!streak){streak=document.createElement('div');streak.className='park-mini-streak';this.root.append(streak);}
    streak.hidden=this.phase!=='playing'||state.paused||(this.kind==='banana'?state.combo<3:state.t<2);
    text(streak,this.kind==='banana'?this.t('連接 × '+state.combo,'COMBO × '+state.combo):this.t(state.bossSpawned?'暴風方舟 · 最終戰':'第 '+state.wave+' 波 · 武器 Lv.'+state.power,state.bossSpawned?'STORM ARK · FINAL':'WAVE '+state.wave+' · WEAPON Lv.'+state.power));
    const boss=state.enemies.find(e=>e.boss);let bar=this.root.querySelector<HTMLElement>('.park-mini-boss');
    if(boss&&!bar){bar=document.createElement('div');bar.className='park-mini-boss';bar.innerHTML='<span>'+this.t('暴風方舟','STORM ARK')+'</span><i><b></b></i>';this.root.append(bar);}
    if(bar){bar.hidden=!boss;if(boss){bar.querySelector<HTMLElement>('b')!.style.width=100*boss.hp!/boss.maxHp!+'%';bar.querySelector('span')!.textContent=this.t('暴風方舟 · 第 '+boss.stage+' 階段','STORM ARK · PHASE '+boss.stage);}}
    if(this.phase==='playing'&&this.root.querySelector('.park-mini-panel')!.classList.contains('shown')!==state.paused)this.renderPanel();
  }
  private async start(){
    if(this.working||this.closed||!this.assetsReady||this.assetFailed)return;this.working=true;
    const button=this.root.querySelector<HTMLButtonElement>('[data-mini="start"]');if(button)button.disabled=true;
    try{
      await audio.unlock();await audio.prepareSkySounds();audio.stopSkySounds();audio.setMusicPaused(false);
      const result=await this.options.client.request<{session:string;state:GameState}>('park:game:start',{kind:this.kind,craft:this.craft});
      if(this.closed){void this.options.client.request('park:game:control',{session:result.session,action:'cancel'}).catch(()=>{});return;}
      this.session=result.session;this.scene.resetRun();this.scene.session=result.session;this.state=result.state;this.scene.setState(result.state);this.phase='playing';audio.sky('launch',0,.6);this.renderPanel();this.hud();
    }catch(error){this.failed((error as Error).message);if(button)button.disabled=false;}finally{this.working=false;}
  }
  async pause(){
    if(this.closed||this.phase!=='playing'||!this.session||this.state?.paused)return;
    this.scene.clearControls();audio.stopSkySounds();audio.setMusicPaused(true);
    if(this.state){this.state.paused=true;this.scene.setState(this.state);this.renderPanel();}
    try{await this.options.client.request('park:game:control',{session:this.session,action:'pause'});}catch(error){this.failed((error as Error).message);}
  }
  private async settle(again:boolean){
    if(this.working||!this.session)return;this.working=true;this.root.querySelectorAll<HTMLButtonElement>('[data-mini="finish"],[data-mini="again"]').forEach(b=>b.disabled=true);
    try{const result=await this.options.client.request('park:game:finish',{session:this.session});if(this.closed)return;this.options.progress=result.state;this.options.onResult(result);this.session='';this.scene.session='';audio.stopSkySounds();audio.setMusicPaused(false);
      if(again){this.phase='intro';this.state=undefined;this.scene.resetRun();this.renderPanel();}else this.close();
    }catch(error){this.failed((error as Error).message);this.root.querySelectorAll<HTMLButtonElement>('[data-mini="finish"],[data-mini="again"]').forEach(b=>b.disabled=false);}finally{this.working=false;}
  }
  private async click(event:Event){
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-mini]');if(!button||button.disabled)return;const action=button.dataset.mini;
    if(action==='sound'){audio.setEnabled(!audio.enabled);button.textContent=audio.enabled?'♪':'♩';button.setAttribute('aria-pressed',String(audio.enabled));if(audio.enabled)await audio.unlock();return;}
    if(action==='craft'&&this.phase==='intro'){const craft=button.dataset.craft;if(craft&&Object.hasOwn(FLIGHT_CRAFT,craft)){this.craft=craft as CraftId;localStorage.setItem('pet-flight-craft',craft);if(this.assetsReady)this.scene.selectCraft(this.craft);this.renderPanel();this.root.querySelector<HTMLButtonElement>('[data-craft="'+craft+'"]')?.focus();}return;}
    if(action==='retry-art'){this.assetsReady=false;this.assetFailed=false;this.root.querySelector<HTMLElement>('.park-mini-error')!.hidden=true;this.options.game.scene.remove('ParkMiniGame');this.scene=new MiniGameScene(this,this.options,this.kind);this.renderPanel();this.options.game.scene.add('ParkMiniGame',this.scene,true);return;}
    if(action==='exit')return this.exit();if(action==='start')return this.start();if(action==='pause')return this.pause();
    if(action==='resume'&&this.session){try{await audio.unlock();const result=await this.options.client.request<{state:GameState}>('park:game:control',{session:this.session,action:'resume'});this.state=result.state;this.scene.setState(result.state);audio.setMusicPaused(false);this.renderPanel();}catch(error){this.failed((error as Error).message);}}
    if(action==='finish')return this.settle(false);if(action==='again')return this.settle(true);
  }
  private async exit(){
    if(this.working)return;if(this.phase==='result'&&this.session)return this.settle(false);
    if(this.session){this.working=true;try{await this.options.client.request('park:game:control',{session:this.session,action:'cancel'});}catch{/* Disconnects discard unfinished runs. */}this.working=false;}this.close();
  }
  private close(){if(this.closed)return;this.destroy();this.options.onClose();}
  destroy(){if(this.closed)return;this.closed=true;this.abort.abort();audio.stopSkySounds();audio.setMusicPaused(false);audio.setTheme(this.previousTheme);this.options.game.scene.remove('ParkMiniGame');this.options.game.scene.getScene('Park').scene.setVisible(true);this.options.game.scene.wake('Park');this.root.parentElement?.classList.remove('park-in-minigame');this.root.remove();}
}
