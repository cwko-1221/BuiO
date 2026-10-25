import { pipeFlow, rotatePipe, type Challenge } from '../../lib/park-activities.mjs';
import { CLUES, activityModes, type ParkObject } from '../../lib/park-world.mjs';
import type { ParkProgress, ParkResult } from './types';
import type { ParkClient } from './client';
import art from './world-art-assets.json';
import { audio } from '../audio';
const asset = (key: keyof typeof art.assets) => `/pet/assets/art/park/full-park-v1/${art.assets[key].file}`;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export class ParkActivity {
  private abort = new AbortController();
  private timers: number[] = [];
  private frame = 0;
  private closed = false;
  private challenge?: Challenge;
  private ticket?: { id: string; dueAt: number };
  private submitted = false;
  private starting = false;
  private lastAttemptWrong = false;
  private water: number[] = [];
  private gauge = 0;
  private gaugeAt = 0;
  private notes: number[] = [];
  private tiles: number[] = [];
  private listening = false;
  private mazePath:number[]=[0];
  private root: HTMLDivElement;
  private audioContext?: AudioContext;
  constructor(host: HTMLElement, private client: ParkClient, private object: ParkObject, private progress: ParkProgress, private english: boolean, private onResult: (r: ParkResult) => void, private onClose: () => void,initialMode?:string) {
    this.root = document.createElement('div'); this.root.className = 'park-activity-root'; host.append(this.root);
    this.root.addEventListener('click', e => { e.stopPropagation(); void this.click(e); }, { signal: this.abort.signal });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      if(this.challenge?.mode==='maze'&&['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)){e.preventDefault();this.mazeMove(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].indexOf(e.key));}
      if (e.key === 'Tab') this.trapFocus(e);
      if (this.challenge?.mode === 'melody' && /^[1-4]$/.test(e.key) && !this.listening && !this.submitted) { e.preventDefault(); this.note(Number(e.key) - 1); }
      if (e.code === 'Space' && this.challenge?.mode === 'water' && !this.submitted && e.target === document.body) { e.preventDefault(); void this.pour(); }
    }, { signal: this.abort.signal });
    const modes = activityModes(object, progress);
    if(initialMode&&modes.includes(initialMode))void this.start(initialMode);else if (modes.length === 1) void this.start(modes[0]); else this.choose(modes);
  }
  private t(zh: string, en: string) { return this.english ? en : zh; }
  private label(mode: string) { return ({ maze:this.t('森林郵差迷宮','Woodland Courier Maze'), water: this.t('剛剛好的澆水', 'Just enough water'), search: this.t('仔細找一找', 'Search the hiding spots'), sort: this.t('森林分類小幫手', 'Woodland sorting'), melody: this.t('回音記憶挑戰', 'Echo memory'), code: this.t('三枚符號密碼', 'Three-symbol code'), pipes: this.t('接通花園水道', 'Connect the waterworks') })[mode] || mode; }
  private shell(title: string, body: string) {
    this.root.innerHTML = `<section class="park-activity" role="dialog" aria-modal="true" aria-labelledby="parkActivityTitle"><header><div><small>${escape(this.object.name[this.english ? 'en-US' : 'zh-HK'])}</small><h2 id="parkActivityTitle">${title}</h2></div><button data-act="close" aria-label="${this.t('返回樂園', 'Return to park')}">×</button></header><div class="park-activity-body">${body}</div><p class="park-activity-feedback" role="status" aria-live="polite"></p><footer><button data-act="restart">↻ ${this.t('重新開始', 'Start again')}</button><span>${this.t('完成活動可推進已接受的委託', 'Activities advance accepted requests')}</span></footer></section>`;
    this.root.querySelector<HTMLButtonElement>('header button')?.focus();
  }
  private choose(modes: string[]) {
    this.shell(this.t('老樹洞的不同冒險', 'Adventures of the old tree'), `<p>${this.t('選擇想探索的秘密。先接受相應委託，就能記錄進度。', 'Choose a secret. Accept its request first to record your progress.')}</p><div class="park-mode-choices">${modes.map(mode => `<button data-act="mode" data-mode="${mode}"><span>${mode === 'code' ? '⌘' : mode === 'maze' ? '✉' : mode === 'melody' ? '♫' : '⌕'}</span><b>${this.label(mode)}</b><small>${mode === 'maze' ? this.t('帶小郵差走過樹籬迷宮', 'Guide the courier through the hedge maze') : mode === 'code' ? this.t('帶着三條線索打開寶藏', 'Use three clues to unlock the treasure') : mode === 'search' ? this.t('追蹤失蹤的包裹', 'Track the missing parcel') : this.t('記住亮起的音符，再重奏', 'Watch the notes, then repeat')}</small></button>`).join('')}</div>`);
  }
  private clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; cancelAnimationFrame(this.frame); }
  private async start(mode: string) {
    if (this.starting || this.closed) return; this.starting = true;
    this.clearTimers(); this.submitted = false; this.water = []; this.notes = []; this.listening = false;
    this.shell(this.label(mode), `<p>${this.t('正在準備活動…', 'Preparing your activity…')}</p>`);
    try {
      const result = await this.client.request<{ ticket: { id: string; dueAt: number }; challenge: Challenge }>('park:challenge', { objectId: this.object.id, mode });
      if (this.closed) return; this.ticket = result.ticket; this.challenge = result.challenge; this.render();
    } catch (e) { if (!this.closed) { this.feedback((e as Error).message); this.root.querySelector('footer')!.insertAdjacentHTML('afterbegin', `<button data-act="close">${this.t('返回尋找線索', 'Return to find clues')}</button>`); } }
    finally { this.starting = false; }
  }
  private render() {
    const c = this.challenge!;
    if(c.mode==='maze'){
      this.mazePath=[0];this.shell(this.label(c.mode),`<p class="park-activity-lead">${this.t('帶小郵差把信送到右下角。點相鄰格子，或使用方向鍵，避開樹籬牆。','Guide the courier to the bottom-right mailbox. Tap a neighbouring tile or use the arrow keys.')}</p><div class="park-maze" data-maze></div><div class="park-maze-pad">${['↑','→','↓','←'].map((n,i)=>`<button data-act="maze-dir" data-dir="${i}" aria-label="${n}">${n}</button>`).join('')}</div><p data-maze-steps></p>`);this.drawMaze();
    } else if (c.mode === 'search') {
      const hints = ['Top left: the leaves are moving.', 'Top middle: a little glimmer.', 'Top right: a corner is showing.', 'Bottom left: a little mound.', 'Bottom middle: fresh footprints.', 'Bottom right: a golden leaf.'];
      const zhHints = ['左上方的葉子有動靜', '上排中央透出一點光', '右上方露出了一角', '左下方的葉堆鼓起來', '下排中央有新腳印', '右下方有一片金色的葉'];
      this.shell(this.label(c.mode), `<p class="park-activity-lead">${this.t('輕輕撥開葉子，找出藏起來的東西。', 'Move the leaves and find what is hiding.')}<br><b>${escape(this.english ? hints[zhHints.indexOf(c.hint!)] : c.hint!)}</b></p><div class="park-search-grid">${Array.from({ length: 6 }, (_, i) => `<button data-act="spot" data-index="${i}" aria-label="${this.t('搜索位置', 'Search spot')} ${i + 1}"><img src="${asset('bush')}" alt=""><span>${i + 1}</span></button>`).join('')}</div>`);
    } else if (c.mode === 'water') {
      this.shell(this.label(c.mode), `<p class="park-activity-lead">${this.t('水滴移進綠色範圍時，按下澆水。完成三次，別灌太多！', 'Press Water when the droplet enters the green zone. Fill three pots without overwatering!')}</p><div class="park-water-flowers">${(['sunflowers', 'tulips', 'daisies'] as const).map((key, i) => `<div data-pot="${i}"><img src="${asset(key)}" alt=""><b>${i + 1}</b></div>`).join('')}</div><div class="park-water-gauge"><i data-water-zone></i><b data-water-drop>●</b></div><button class="park-activity-primary" data-act="pour">♧ ${this.t('澆水', 'Water')}</button><p data-water-round>${this.t('第 1 / 3 次', 'Pot 1 / 3')}</p>`);
      this.gaugeAt = performance.now(); this.animateGauge();
    } else if (c.mode === 'sort') {
      const item = c.objectId === 'litter-a' ? this.t('一個乾淨的紙袋', 'A clean paper bag') : c.objectId === 'litter-b' ? this.t('一個空鋁罐', 'An empty aluminium can') : this.t('吃剩的蘋果果核', 'An apple core');
      this.shell(this.label(c.mode), `<p class="park-activity-lead">${this.t('看看手上的物品，放進合適的分類箱。', 'Look at your item and choose the right bin.')}</p><div class="park-sort-item"><span>${c.objectId === 'litter-a' ? '▤' : c.objectId === 'litter-b' ? '▥' : '❧'}</span><b>${item}</b></div><div class="park-sort-bins">${[['paper', '▤', this.t('廢紙', 'Paper')], ['recycle', '♻', this.t('金屬／塑膠', 'Recycling')], ['compost', '❧', this.t('廚餘堆肥', 'Compost')]].map(([id, icon, text]) => `<button class="${id}" data-act="bin" data-bin="${id}"><span>${icon}</span>${text}</button>`).join('')}</div>`);
    } else if (c.mode === 'melody') {
      this.shell(this.label(c.mode), `<p class="park-activity-lead">${this.t(`看清楚 ${c.notes!.length} 個亮起的音符，再按相同次序重奏。`, `Watch ${c.notes!.length} glowing notes, then repeat their order.`)}</p><div class="park-note-progress" data-note-progress></div><div class="park-note-keys">${['Do', 'Re', 'Mi', 'Sol'].map((note, i) => `<button data-act="note" data-note="${i}" class="note-${i}"><span>${['●', '◆', '▲', '★'][i]}</span><b>${note}</b><kbd>${i + 1}</kbd></button>`).join('')}</div><button class="park-relisten" data-act="listen">♫ ${this.t('再聽一次', 'Play again')}</button>`);
      this.demo();
    } else if (c.mode === 'code') {
      this.shell(this.label(c.mode), `<p class="park-activity-lead">${this.t('鎖上的符號順序是「蘑菇 → 睡蓮 → 樹葉」。翻查找到的線索，輸入三位密碼。', 'The lock reads mushroom → lily → leaf. Check your clues and enter three digits.')}</p><div class="park-clue-notes">${['pond', 'forest-sign', 'mushrooms'].map(id => `<div>${escape(CLUES[id][this.english ? 'en-US' : 'zh-HK'])}</div>`).join('')}</div><label class="park-code-input">${this.t('三位密碼', 'Three-digit code')}<input inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" aria-label="${this.t('三位密碼', 'Three-digit code')}"></label><button class="park-activity-primary" data-act="unlock">${this.t('轉動機關，打開寶藏', 'Unlock the treasure')} →</button>`);
      this.root.querySelector('input')?.focus();
    } else if (c.mode === 'pipes') {
      this.tiles = [...c.tiles!];
      this.shell(this.label(c.mode), `<p class="park-activity-lead">${this.t('點一下管道就會旋轉。把左邊藍色入口，接到右邊金色出口！', 'Tap a pipe to rotate it. Connect the blue inlet on the left to the golden outlet on the right!')}</p><div class="park-pipe-wrap"><span class="park-pipe-in">→</span><div class="park-pipe-grid" data-pipes></div><span class="park-pipe-out">→</span></div><button class="park-activity-primary" data-act="flow">${this.t('打開水閘', 'Open the water gate')} ≈</button>`); this.drawPipes();
    }
  }
  private drawMaze(){const cells=this.challenge!.cells!,at=this.mazePath.at(-1)!;this.root.querySelector('[data-maze]')!.innerHTML=cells.map((mask,i)=>`<button data-act="maze-cell" data-index="${i}" aria-label="${this.t('迷宮格子','Maze tile')} ${i+1}" class="${i===at?'current':''} ${this.mazePath.includes(i)?'visited':''}" style="border-width:${mask&1?'1px':'4px'} ${mask&2?'1px':'4px'} ${mask&4?'1px':'4px'} ${mask&8?'1px':'4px'}">${i===at?'✉':i===24?'⚑':i===0?'⌂':''}</button>`).join('');this.root.querySelector('[data-maze-steps]')!.textContent=this.t(`已走 ${this.mazePath.length-1} 步 · 出口在右下角`,`${this.mazePath.length-1} steps · Exit at bottom right`);}
  private mazeMove(dir:number){if(this.submitted||this.closed)return;const at=this.mazePath.at(-1)!,bit=1<<dir;if(!(this.challenge!.cells![at]&bit)){this.feedback(this.t('這邊有樹籬，試試另一條路。','A hedge blocks this way. Try another path.'));return;}this.mazePath.push(at+[-5,1,5,-1][dir]);this.drawMaze();audio.sfx('tap');if(this.mazePath.at(-1)===24)void this.submit(this.mazePath);}
  private animateGauge = () => {
    if (this.closed || this.challenge?.mode !== 'water' || this.submitted) return;
    this.gauge = ((performance.now() - this.gaugeAt) / 1900 % 2); this.gauge = (this.gauge > 1 ? 2 - this.gauge : this.gauge) * 100;
    const drop = this.root.querySelector<HTMLElement>('[data-water-drop]'), zone = this.root.querySelector<HTMLElement>('[data-water-zone]');
    if (drop && zone) { drop.style.left = `${this.gauge}%`; zone.style.left = `${this.challenge.targets![this.water.length] - 13}%`; }
    this.frame = requestAnimationFrame(this.animateGauge);
  };
  private async pour() {
    if (this.submitted) return;
    if (Math.abs(this.gauge - this.challenge!.targets![this.water.length]) > 13) { this.feedback(this.t('水量還未剛好，看着綠色區再按一次。', 'Wait for the droplet to reach the green zone.')); return; }
    this.water.push(Math.round(this.gauge)); this.root.querySelector(`[data-pot="${this.water.length - 1}"]`)?.classList.add('done'); audio.sfx('tap');
    this.feedback(this.t('這盆花喝飽水了！', 'This pot has enough water!'));
    if (this.water.length === 3) { cancelAnimationFrame(this.frame); await this.submit(this.water); }
    else { this.gaugeAt = performance.now(); this.root.querySelector('[data-water-round]')!.textContent = this.t(`第 ${this.water.length + 1} / 3 次`, `Pot ${this.water.length + 1} / 3`); }
  }
  private tone(note: number) {
    audio.sfx('tap');
    // Distinct pitches are also shown as shapes and numbers for silent play.
    if (!audio.enabled || audio.sfxLevel <= 0 || document.hidden) return;
    try {
      this.audioContext ||= new AudioContext(); void this.audioContext.resume();
      const oscillator = this.audioContext.createOscillator(), gain = this.audioContext.createGain(), time = this.audioContext.currentTime;
      oscillator.frequency.value = [392, 440, 523.25, 659.25][note]; oscillator.type = 'sine';
      gain.gain.setValueAtTime(.035 * audio.sfxLevel, time); gain.gain.exponentialRampToValueAtTime(.001, time + .3);
      oscillator.connect(gain).connect(this.audioContext.destination); oscillator.start(time); oscillator.stop(time + .32);
    } catch { /* Visual notes remain fully playable without audio. */ }
  }
  private demo() {
    if (this.listening || this.closed || this.submitted) return; this.notes = []; this.listening = true;
    this.feedback(this.t('先看亮起的音符…', 'Watch the glowing notes…'));
    this.root.querySelectorAll<HTMLButtonElement>('[data-act="note"], [data-act="listen"]').forEach(b => b.disabled = true);
    this.challenge!.notes!.forEach((note, i) => {
      this.timers.push(window.setTimeout(() => { const button = this.root.querySelector(`[data-note="${note}"]`); button?.classList.add('lit'); this.tone(note); this.timers.push(window.setTimeout(() => button?.classList.remove('lit'), 430)); }, i * 650 + 300));
    });
    this.timers.push(window.setTimeout(() => { this.listening = false; this.root.querySelectorAll<HTMLButtonElement>('[data-act="note"], [data-act="listen"]').forEach(b => b.disabled = false); this.feedback(this.t('輪到你！也可按鍵盤 1、2、3、4。', 'Your turn! You can also use keys 1, 2, 3, 4.')); }, this.challenge!.notes!.length * 650 + 400));
  }
  private note(note: number) {
    if (this.listening || this.submitted) return;
    this.tone(note); this.notes.push(note);
    this.root.querySelector('[data-note-progress]')!.textContent = this.notes.map(n => ['●', '◆', '▲', '★'][n]).join('  ');
    if (this.notes.length === this.challenge!.notes!.length) void this.submit([...this.notes]);
  }
  private drawPipes() {
    const wet = pipeFlow(this.tiles);
    this.root.querySelector('[data-pipes]')!.innerHTML = this.tiles.map((mask, i) => `<button data-act="pipe" data-index="${i}" aria-label="${this.t('旋轉管道', 'Rotate pipe')} ${i + 1}" class="${wet.includes(i) ? 'wet' : ''}"><svg viewBox="0 0 100 100" aria-hidden="true">${[[1, 50, 0], [2, 100, 50], [4, 50, 100], [8, 0, 50]].filter(([bit]) => mask & bit).map(([, x, y]) => `<path d="M50 50 L${x} ${y}"/>`).join('')}<circle cx="50" cy="50" r="10"/></svg></button>`).join('');
  }
  private feedback(message: string, ok = false) { const node = this.root.querySelector<HTMLElement>('.park-activity-feedback'); if (node) { node.textContent = message; node.classList.toggle('success', ok); } }
  private async submit(answer: unknown) {
    if (this.submitted || !this.ticket) return; this.submitted = true; this.lastAttemptWrong = false;
    try {
      const delay = Math.max(0, this.challenge!.minimumMs - (Date.now() - (this.ticket.dueAt - this.challenge!.minimumMs)) + 100);
      if (delay) await new Promise<void>(resolve => this.timers.push(window.setTimeout(resolve, delay)));
      if (this.closed) return;
      const result = await this.client.request('park:solve', { ticketId: this.ticket.id, answer });
      if (this.closed) return; this.onResult(result); this.clearTimers(); audio.sfx('tap');
      this.shell(this.t('做到了！', 'You did it!'), `<div class="park-activity-success"><span>✦</span><h3>${this.label(this.challenge!.mode)}</h3><p>${this.t('小小的觀察和操作，讓樂園又多了一份驚喜。', 'Your observation and skill made a little park discovery.')}</p><b>${result.advanced?.length ? this.t('委託進度已記錄 · 記得回去找 NPC', 'Request progress saved · Return to your NPC') : this.t('活動完成！也可以向 NPC 接受相關委託。', 'Activity complete! Ask an NPC for its request.')}</b><button class="park-activity-primary" data-act="close">${this.t('繼續探索樂園', 'Keep exploring')} →</button></div>`);
    } catch (e) {
      if (this.closed) return; this.submitted = false; this.lastAttemptWrong = (e as Error & { status?: number }).status === 422; this.feedback((e as Error).message);
      if (this.challenge?.mode === 'melody') { this.notes = []; this.root.querySelector('[data-note-progress]')!.textContent = ''; }
      if (this.challenge?.mode === 'water') { this.water = []; this.gaugeAt = performance.now(); this.animateGauge(); }
    }
  }
  private async click(e: Event) {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-act]'); if (!button || button.disabled) return;
    const action = button.dataset.act;
    if (action === 'close') return this.close();
    if (action === 'mode') return this.start(button.dataset.mode!);
    if (action === 'restart') return this.challenge ? this.start(this.challenge.mode) : this.choose(activityModes(this.object, this.progress));
    if (this.submitted) return;
    if(action==='maze-dir')return this.mazeMove(Number(button.dataset.dir));
    if(action==='maze-cell'){const at=this.mazePath.at(-1)!,n=Number(button.dataset.index),dx=n%5-at%5,dy=Math.floor(n/5)-Math.floor(at/5),dir=dx===0&&dy===-1?0:dx===1&&dy===0?1:dx===0&&dy===1?2:dx===-1&&dy===0?3:-1;if(dir>=0)this.mazeMove(dir);return;}
    if (action === 'spot') { const answer = Number(button.dataset.index); await this.submit(answer); if (!this.closed && this.lastAttemptWrong) { button.classList.add('searched'); button.disabled = true; } }
    if (action === 'pour') await this.pour();
    if (action === 'bin') await this.submit(button.dataset.bin);
    if (action === 'note') this.note(Number(button.dataset.note));
    if (action === 'listen') this.demo();
    if (action === 'unlock') await this.submit(this.root.querySelector<HTMLInputElement>('input')!.value);
    if (action === 'pipe') { const i = Number(button.dataset.index); this.tiles[i] = rotatePipe(this.tiles[i]); this.drawPipes(); this.root.querySelector<HTMLButtonElement>(`[data-act="pipe"][data-index="${i}"]`)?.focus(); audio.sfx('tap'); }
    if (action === 'flow') await this.submit(this.tiles);
  }
  private trapFocus(e: KeyboardEvent) {
    const items = [...this.root.querySelectorAll<HTMLElement>('button:not(:disabled),input')], index = items.indexOf(document.activeElement as HTMLElement);
    if (e.shiftKey ? index <= 0 : index < 0 || index === items.length - 1) { e.preventDefault(); items[e.shiftKey ? items.length - 1 : 0]?.focus(); }
  }
  close() { if (this.closed) return; this.destroy(); void this.client.request('park:cancel', {}).catch(() => {}); this.onClose(); }
  destroy() { this.closed = true; this.clearTimers(); this.abort.abort(); void this.audioContext?.close().catch(() => {}); this.root.remove(); }
}
