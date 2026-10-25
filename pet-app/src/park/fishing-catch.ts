import type {GameState} from '../../lib/park-games.mjs';
import {FISH,FISHING_SPOTS} from '../../lib/park-leisure.mjs';
import {FISH_SALE_PRICES} from '../../lib/park-economy.mjs';
import {fishingAsset} from './fishing-view';
import './fishing-catch.css';

// A portal keeps the reveal outside the letterboxed canvas and game HUD.
export class FishingCatchScreen{
  private root=document.createElement('section');
  private previousFocus?:HTMLElement;private previousInert=false;
  private abort=new AbortController();
  constructor(private gameRoot:HTMLElement,private english:boolean,private next:()=>void,private finish:()=>void){
    this.root.className='fishing-catch-screen';this.root.dataset.fishingCatch='';this.root.hidden=true;this.root.tabIndex=-1;
    this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-labelledby','fishingCatchName');document.body.append(this.root);
    this.root.addEventListener('click',e=>{e.stopPropagation();const button=(e.target as HTMLElement).closest<HTMLButtonElement>('[data-leisure]');if(!button||button.disabled)return;if(button.dataset.leisure==='catch-next')this.next();if(button.dataset.leisure==='catch-return')this.finish();},{signal:this.abort.signal});
    this.root.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();this.next();return;}if(e.key!=='Tab')return;const nodes=[...this.root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],i=nodes.indexOf(document.activeElement as HTMLButtonElement);if(!nodes.length){e.preventDefault();return;}if(e.shiftKey?i<=0:i<0||i===nodes.length-1){e.preventDefault();nodes[e.shiftKey?nodes.length-1:0].focus();}},{signal:this.abort.signal});
  }
  private t(zh:string,en:string){return this.english?en:zh;}
  show(state:GameState,fresh:boolean){
    const l=state.leisure!,fish=FISH[l.fish],locale=this.english?'en-US':'zh-HK';this.previousFocus=document.activeElement as HTMLElement;this.previousInert=this.gameRoot.inert;this.gameRoot.inert=true;
    this.root.dataset.rarity=fish.rarity;
    const rarity={common:this.t('常見','COMMON'),uncommon:this.t('少見','UNCOMMON'),rare:this.t('珍稀','RARE'),epic:this.t('傳說','LEGENDARY')}[fish.rarity];
    this.root.innerHTML=`<div class="fishing-catch-content"><small class="fishing-catch-eyebrow">${fresh?this.t('新發現！','NEW DISCOVERY!'):this.t('釣到了！','A LOVELY CATCH!')}</small><div class="fishing-catch-hero"><img src="${fishingAsset('fish-'+fish.id)}" alt="${fish.name[locale]}"></div><h2 id="fishingCatchName">${fish.name[locale]}</h2><div class="fishing-catch-measure"><strong>${l.length.toFixed(1)}</strong><span>cm</span><b>${rarity}</b></div><p class="fishing-catch-place">${FISHING_SPOTS[l.spot].name[locale]} · +${fish.points}${this.t(' 分',' PTS')}</p><p class="fishing-catch-value">${this.t('商人收購價','TRADER VALUE')} <strong>${FISH_SALE_PRICES[fish.rarity]}</strong> ${this.t('金幣','COINS')}</p><div class="fishing-catch-actions"><button class="primary" data-leisure="catch-next">${state.status==='ended'?this.t('查看本次成果','View this round'):this.t('繼續釣魚','Keep fishing')} →</button><button data-leisure="catch-return">${this.t('收竿回樂園','Pack up & return')}</button></div><p class="fishing-catch-note">${this.t('欣賞魚兒時，遊戲計時會暫停。','Take your time. The game clock is paused.')}</p><p class="fishing-catch-error" role="status" hidden></p></div>`;
    this.root.hidden=false;this.setBusy(true);this.root.focus({preventScroll:true});
  }
  setBusy(busy:boolean){for(const button of this.root.querySelectorAll<HTMLButtonElement>('button'))button.disabled=busy;this.root.setAttribute('aria-busy',String(busy));if(!busy&&document.activeElement===this.root)this.root.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true});}
  error(message:string){const node=this.root.querySelector<HTMLElement>('.fishing-catch-error');if(node){node.textContent=message;node.hidden=!message;}}
  hide(){if(this.root.hidden)return;this.root.hidden=true;this.gameRoot.inert=this.previousInert;if(this.previousFocus?.isConnected)this.previousFocus.focus({preventScroll:true});}
  destroy(){this.hide();this.abort.abort();this.root.remove();}
}
