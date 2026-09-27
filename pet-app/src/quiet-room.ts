import { api } from './api';
import { idempotencyKey, type Locale } from './types';
import { microphoneLevel, NoiseGate } from './quiet-room-meter';
import type { QuietSession, QuietSettings } from './quiet-room-types';
import './styles/quiet-room.css';
import gardenBackdrop from './assets/quiet-focus-garden-v1.webp';

const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const quietIcon = (name: 'leaf' | 'coin' | 'sound' | 'alert' | 'arrow') => {
  const paths = {
    leaf: '<path d="M19 4c-8-1-14 2-14 8a6 6 0 0 0 6 6c6 0 9-6 8-14Z"/><path d="m5 20 9-9M10 15v-4m0 4h4"/>',
    coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><path d="m12 8 2 4-2 4-2-4 2-4Z"/>',
    sound: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M6 11a6 6 0 0 0 12 0m-6 6v4m-3 0h6"/>',
    alert: '<path d="m12 3 10 17H2L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  };
  return `<svg class="quiet-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
};

export class QuietRoom {
  private session: QuietSession | null = null;
  private stream?: MediaStream;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private samples = new Float32Array(2048);
  private gate = new NoiseGate();
  private interval = 0;
  private frame = 0;
  private anchor = 0;
  private busy = false;
  private monitoring = false;
  private disposed = false;
  private requestQueue: Promise<void> = Promise.resolve();
  private heartbeatPending = false;
  private feedbackUntil = 0;
  private pendingStart?: { key: string; settings: QuietSettings };
  private onVisibility = () => { if (document.hidden && this.monitoring) void this.pause(); };
  private onPageHide = () => {
    this.stopMicrophone();
    if (this.session?.status === 'running') void fetch(`/api/pet/teacher/quiet-room/${encodeURIComponent(this.session.id)}`, {
      method: 'POST', credentials: 'include', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pause' }),
    });
  };
  private onBeforeUnload = (event: BeforeUnloadEvent) => {
    if (this.session && ['running', 'paused'].includes(this.session.status)) { event.preventDefault(); event.returnValue = ''; }
  };

  constructor(private root: HTMLElement, private roster: any, private locale: Locale, private refreshWallets: () => Promise<void>) {}
  private t(zh: string, en: string) { return this.locale === 'zh-HK' ? zh : en; }
  private element<T extends HTMLElement = HTMLElement>(selector: string) { return this.root.querySelector<T>(selector)!; }

  async init() {
    this.render();
    this.element<HTMLButtonElement>('#quietStart').disabled = true;
    try {
      const { session } = await api.quietCurrent();
      if (this.disposed) return;
      this.session = session;
      // Reloading never resumes a timer before the microphone has been authorised again.
      if (session?.status === 'running') this.session = (await api.quietUpdate(session.id, 'pause')).session;
      if (this.disposed) return;
      this.render();
    } catch (error) { this.message((error as Error).message, true); this.element<HTMLButtonElement>('#quietStart').disabled = false; }
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('beforeunload', this.onBeforeUnload);
    this.interval = window.setInterval(() => {
      this.paint();
      if (!this.monitoring || this.busy || this.heartbeatPending || !this.session) return;
      this.heartbeatPending = true;
      void this.sync('heartbeat').finally(() => { this.heartbeatPending = false; });
    }, 2000);
    this.animate();
  }

  private pets() {
    return (this.roster.quietPets || []).map((pet: any, index: number) => {
      // Older running servers may still publish a sleeping frame; always use an awake pose.
      const frame = pet.focusFrame ?? 0;
      const x = frame % pet.columns;
      const y = Math.floor(frame / pet.columns);
      const name = pet.name[this.locale][0];
      return `<div class="quiet-companion" style="--pet-delay:${index * .7}s"><div class="quiet-companion-art"><span class="quiet-pet" role="img" aria-label="${escape(this.t('專注夥伴：', 'Focus companion: ') + name)}" style="background-image:url('${escape(pet.atlas)}');background-size:${pet.columns * 100}% ${pet.rows * 100}%;background-position:${x / (pet.columns - 1) * 100}% ${y / (pet.rows - 1) * 100}%"></span><span class="quiet-pet-shadow" aria-hidden="true"></span></div><span class="quiet-companion-name">${escape(name)}</span></div>`;
    }).join('');
  }

  private render() {
    const active = this.session && ['running', 'paused'].includes(this.session.status);
    this.root.innerHTML = `<div class="quiet-layout">
      <section class="quiet-settings" aria-labelledby="quietHeading">
        <div class="quiet-settings-heading"><span class="quiet-heading-mark">${quietIcon('leaf')}</span><p class="eyebrow">${this.t('課室工具 · 專注練習', 'CLASSROOM · FOCUS TIME')}</p></div>
        <h1 id="quietHeading">${this.t('安靜房間', 'Quiet Room')}</h1>
        <p class="quiet-intro">${this.t('和寵物夥伴一起，累積每一刻的專注。', 'A little focus, a little growth. Together.')}</p>
        <form id="quietForm" ${this.session ? 'hidden' : ''}>
          <fieldset><legend><span>1</span> ${this.t('選擇參加對象', 'Choose who joins')}</legend>
            <div class="segmented"><button type="button" data-quiet-scope="class" class="active" aria-pressed="true">${this.t('全班', 'Whole class')}</button><button type="button" data-quiet-scope="group" aria-pressed="false">${this.t('班內單一組別', 'One class group')}</button></div>
            <label class="field"><span>${this.t('班別', 'Class')}</span><select id="quietClass" required>${this.roster.classes.map((name: string) => `<option value="${escape(name)}">${escape(name)}</option>`).join('')}</select></label>
            <div id="quietGroupFields" hidden><label class="field"><span>${this.t('科目', 'Subject')}</span><select id="quietSubject"><option value="chineseGroup">${this.t('中文', 'Chinese')}</option><option value="englishGroup">${this.t('英文', 'English')}</option><option value="mathGroup">${this.t('數學', 'Maths')}</option></select></label><label class="field"><span>${this.t('組別', 'Group')}</span><select id="quietGroup"></select></label></div>
            <p id="quietRecipients" class="quiet-hint"></p>
          </fieldset>
          <fieldset><legend><span>2</span> ${this.t('選擇倒數時間', 'Set the timer')}</legend>
            <div class="quiet-presets">${[3, 5, 10, 15].map(n => `<button type="button" data-quiet-minutes="${n}" class="${n === 5 ? 'active' : ''}">${n} ${this.t('分鐘', 'min')}</button>`).join('')}</div>
            <div class="quiet-pair"><label class="field"><span>${this.t('分鐘', 'Minutes')}</span><input id="quietMinutes" type="number" min="0" max="120" step="1" value="5" required></label><label class="field"><span>${this.t('秒', 'Seconds')}</span><input id="quietSeconds" type="number" min="0" max="59" step="1" value="0" required></label></div>
          </fieldset>
          <fieldset><legend><span>3</span> ${this.t('最高容許音量', 'Maximum sound level')}</legend>
            <label class="quiet-range"><span>${this.t('輕聲', 'Soft')}</span><input id="quietThreshold" type="range" min="1" max="100" value="45" aria-label="${this.t('最高容許音量', 'Maximum sound level')}"><output id="quietThresholdValue">45 / 100</output></label>
            <button type="button" id="quietMicTest" class="text-button">🎙 ${this.t('先測試課室音量', 'Test classroom sound')}</button>
            <p class="quiet-hint">${this.t('這是麥克風相對指數（非分貝）。可先測試，再調整門檻。', 'A relative microphone index, not dB. Test the room, then adjust the limit.')}</p>
          </fieldset>
          <fieldset><legend><span>4</span> ${this.t('設定獎勵與懲罰', 'Choose reward & penalty')}</legend>
            <div class="quiet-pair"><label class="field"><span>${quietIcon('coin')} ${this.t('每人獎勵', 'Reward per student')}</span><input id="quietReward" type="number" min="1" max="10000" step="1" value="100" required></label><label class="field"><span>${quietIcon('alert')} ${this.t('每次超標扣減', 'Penalty per burst')}</span><input id="quietPenalty" type="number" min="1" max="10000" step="1" value="10" required></label></div>
            <p class="quiet-hint">${this.t('只扣本次獎勵，最低為 0；持續超標算一次，安靜 1 秒後可再觸發。', 'Deduct from this reward only, down to 0. One penalty per burst; 1 quiet second rearms detection.')}</p>
          </fieldset>
          <button type="submit" id="quietStart" class="primary jumbo">${this.t('開始專注挑戰', 'Start focus time')} ${quietIcon('arrow')}</button>
        </form>
        <div id="quietSessionInfo" ${this.session ? '' : 'hidden'}>
          <p class="quiet-target">${escape(this.session?.targetLabel)}</p>
          <p>${this.session?.count || 0} ${this.t('名學生一起參加', 'students taking part')}</p>
          <div class="quiet-rules"><span>${this.t('音量上限', 'Sound limit')} <b>${this.session?.threshold || 0} / 100</b></span><span>${this.t('起始獎勵', 'Starting reward')} <b>${this.session?.reward || 0} 🪙</b></span><span>${this.t('每次超標', 'Each burst')} <b>−${this.session?.penalty || 0} 🪙</b></span></div>
          <p class="quiet-hint">${this.t('暫停時，倒數與扣分都會停止。', 'Pausing stops both the timer and penalties.')}</p>
          <div class="quiet-controls"><button id="quietPause" class="primary jumbo" ${active ? '' : 'hidden'}>${this.session?.status === 'paused' ? this.t('▶ 繼續挑戰', '▶ Resume') : this.t('Ⅱ 暫停', 'Ⅱ Pause')}</button><button id="quietCancel" class="text-button" ${active ? '' : 'hidden'}>${this.t('結束本次挑戰（不發獎勵）', 'End challenge without rewards')}</button><button id="quietNew" class="primary jumbo" ${active ? 'hidden' : ''}>${this.t('再開一個安靜房間', 'Start another quiet room')}</button></div>
          <div id="quietCancelConfirm" hidden><p>${this.t('確定結束？本次剩餘獎勵不會發放。', 'End this challenge? Remaining rewards will not be issued.')}</p><button type="button" id="quietConfirmCancel" class="secondary">${this.t('確定結束', 'End challenge')}</button><button type="button" id="quietKeep" class="text-button">${this.t('保留挑戰', 'Keep challenge')}</button></div>
        </div>
        <p id="quietMessage" class="quiet-message" role="status" aria-live="polite"></p>
      </section>
      <section class="quiet-room-stage" aria-label="${this.t('寵物專注花園', 'Pet focus garden')}">
        <div class="quiet-stage-top"><div class="quiet-room-badge"><span class="quiet-garden-mark">${quietIcon('leaf')}</span><div><small>FOCUS GARDEN</small><b>${this.t('寵物專注花園', 'Pet Focus Garden')}</b></div></div><span id="quietStatus" class="quiet-status"></span></div>
        <div class="quiet-focus-hero"><div class="quiet-focus-copy"><span class="quiet-focus-kicker">${this.t('一起安靜 · 一起成長', 'LESS NOISE · MORE FOCUS')}</span><h2 id="quietEncouragement" class="quiet-encouragement"></h2><p>${this.t('把注意力留給眼前的任務，讓努力一點一點累積。', 'Make space for the task in front of you. Every focused moment counts.')}</p><button type="button" id="quietQuickPause" class="secondary quiet-quick-pause" ${active ? '' : 'hidden'}>${this.t('Ⅱ 暫停', 'Ⅱ Pause')}</button></div>
          <div class="quiet-clock"><div class="quiet-clock-face"><small>${this.t('挑戰剩餘時間', 'TIME REMAINING')}</small><strong id="quietTime">05:00</strong><span class="quiet-clock-caption">${this.t('每一刻，都是進步', 'ONE MOMENT AT A TIME')}</span></div><progress id="quietProgress" max="300" value="300" aria-label="${this.t('剩餘時間', 'Time left')}"></progress></div>
        </div>
        <div class="quiet-garden-scene" style="background-image:url('${gardenBackdrop}')"><div class="quiet-scene-label">${quietIcon('leaf')} ${this.t('你的專注夥伴', 'YOUR FOCUS COMPANIONS')}</div><div class="quiet-pets">${this.pets()}</div></div>
        <div class="quiet-dashboard"><div class="quiet-score"><div class="quiet-reward-card"><span class="quiet-stat-icon">${quietIcon('coin')}</span><span>${this.t('每人剩餘獎勵', 'COINS PER STUDENT')}</span><div class="quiet-stat-value"><strong id="quietRewardLeft">100</strong><small>${this.t('金幣', 'coins')}</small></div></div><div class="quiet-burst-card"><span class="quiet-stat-icon">${quietIcon('alert')}</span><span>${this.t('超標次數', 'NOISE BURSTS')}</span><div class="quiet-stat-value"><strong id="quietBreaches">0</strong><small>${this.t('次', 'bursts')}</small></div></div></div>
          <div class="quiet-meter"><div class="quiet-meter-title"><b>${quietIcon('sound')} ${this.t('即時音量', 'Live sound')}</b><span id="quietLevelText">— / 100</span></div><div class="quiet-meter-track" role="meter" aria-label="${this.t('即時麥克風音量', 'Live microphone level')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="quietMeterFill"></div><i id="quietLimitLine"><span>${this.t('上限', 'LIMIT')}</span></i></div><div class="quiet-waves" aria-hidden="true">${Array.from({ length: 28 }, () => '<i></i>').join('')}</div><p id="quietMicStatus" class="quiet-hint">${this.t('按開始或測試，啟用麥克風', 'Start or test to enable the microphone')}</p></div>
        </div>
        <div id="quietResult" class="quiet-result" role="status" hidden></div>
      </section>
    </div>`;
    this.bind();
    this.updateSelection();
    this.paint();
    this.root.scrollTop = 0;
  }

  private bind() {
    this.element('#quietForm').addEventListener('submit', event => { event.preventDefault(); void this.start(); });
    this.root.querySelectorAll<HTMLButtonElement>('[data-quiet-scope]').forEach(button => button.addEventListener('click', () => {
      this.root.querySelectorAll('[data-quiet-scope]').forEach(el => { el.classList.toggle('active', el === button); el.setAttribute('aria-pressed', String(el === button)); });
      this.element('#quietGroupFields').hidden = button.dataset.quietScope !== 'group'; this.updateSelection();
    }));
    for (const id of ['#quietClass', '#quietSubject']) this.element(id).addEventListener('change', () => this.updateSelection());
    this.element('#quietGroup').addEventListener('change', () => this.updateRecipients());
    this.element('#quietThreshold').addEventListener('input', () => this.paint());
    for (const id of ['#quietMinutes', '#quietSeconds', '#quietReward']) this.element(id).addEventListener('input', () => this.paint());
    this.root.querySelectorAll<HTMLButtonElement>('[data-quiet-minutes]').forEach(button => button.addEventListener('click', () => {
      this.element<HTMLInputElement>('#quietMinutes').value = button.dataset.quietMinutes!;
      this.element<HTMLInputElement>('#quietSeconds').value = '0'; this.paint();
    }));
    this.element('#quietMicTest').addEventListener('click', () => void this.testMicrophone());
    this.element('#quietPause').addEventListener('click', () => { if (this.monitoring) void this.pause(); else void this.resume(); });
    this.element('#quietQuickPause').addEventListener('click', () => { if (this.monitoring) void this.pause(); else void this.resume(); });
    this.element('#quietCancel').addEventListener('click', () => { this.element('#quietCancelConfirm').hidden = false; });
    this.element('#quietKeep').addEventListener('click', () => { this.element('#quietCancelConfirm').hidden = true; });
    this.element('#quietConfirmCancel').addEventListener('click', () => void this.cancel());
    this.element('#quietNew').addEventListener('click', () => { this.session = null; this.pendingStart = undefined; this.render(); });
  }

  private settings(): QuietSettings {
    const value = (id: string) => this.element<HTMLInputElement | HTMLSelectElement>(id).value;
    return { scope: this.element('#quietGroupFields').hidden ? 'class' : 'group', className: value('#quietClass'),
      groupField: value('#quietSubject'), groupName: value('#quietGroup'),
      durationSeconds: Number(value('#quietMinutes')) * 60 + Number(value('#quietSeconds')),
      threshold: Number(value('#quietThreshold')), reward: Number(value('#quietReward')), penalty: Number(value('#quietPenalty')) };
  }
  private updateSelection() {
    const body = this.settings();
    const groups = [...new Set<string>(this.roster.students.filter((row: any) => row.className === body.className).map((row: any) => row[body.groupField]).filter(Boolean))].sort();
    this.element<HTMLSelectElement>('#quietGroup').innerHTML = groups.length ? groups.map(name => `<option value="${escape(name)}">${escape(name)}</option>`).join('') : `<option value="">${this.t('此班尚未設定組別', 'No groups in this class')}</option>`;
    this.updateRecipients();
  }
  private updateRecipients() {
    const body = this.settings();
    const rows = this.roster.students.filter((row: any) => row.className === body.className && (body.scope === 'class' || row[body.groupField] === body.groupName && body.groupName));
    this.element('#quietRecipients').textContent = this.t(`共 ${rows.length} 人 · `, `${rows.length} students · `) + rows.map((row: any) => row.name).join(this.t('、', ', '));
    this.element<HTMLButtonElement>('#quietStart').disabled = !rows.length || this.busy;
  }

  private async microphone() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(this.t('請用 HTTPS 或 localhost 開啟，才能使用麥克風。', 'Use HTTPS or localhost to enable the microphone.'));
    try {
      this.context = new AudioContext();
      await this.context.resume();
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      if (this.disposed || document.hidden) throw new Error(this.t('請返回此頁再啟用麥克風。', 'Return to this page to enable the microphone.'));
      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser(); this.analyser.fftSize = 2048;
      this.source.connect(this.analyser); // No speakers or recording: analyse locally only.
      this.stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => { if (this.monitoring) void this.pause(this.t('麥克風已中斷，挑戰已暫停。', 'Microphone disconnected. Challenge paused.')); else this.stopMicrophone(); }));
      this.context.addEventListener('statechange', () => { if (this.monitoring && this.context?.state !== 'running') void this.pause(this.t('音量偵測已中斷，挑戰已暫停。', 'Sound detection interrupted. Challenge paused.')); });
    } catch (error) {
      this.stopMicrophone();
      const name = (error as DOMException).name;
      if (['NotAllowedError', 'PermissionDeniedError'].includes(name)) throw new Error(this.t('未能使用麥克風。請在瀏覽器允許麥克風後重試。', 'Allow microphone access in your browser, then retry.'));
      if (name === 'NotFoundError') throw new Error(this.t('找不到麥克風，請連接後重試。', 'No microphone found. Connect one and retry.'));
      throw error;
    }
  }
  private stopMicrophone() {
    if (this.monitoring && this.session?.status === 'running') {
      this.session.remainingMs = Math.max(0, this.session.remainingMs - (performance.now() - this.anchor));
      this.anchor = performance.now();
    }
    this.monitoring = false;
    this.stream?.getTracks().forEach(track => track.stop()); this.stream = undefined;
    this.source?.disconnect(); this.source = undefined; this.analyser = undefined;
    const context = this.context; this.context = undefined; void context?.close().catch(() => {});
    this.gate.reset();
  }
  private async testMicrophone() {
    if (this.busy) return;
    if (this.stream) this.stopMicrophone();
    else { this.setBusy(true); try { await this.microphone(); this.message(this.t('試試保持安靜，再說話；按實際音量調整上限。', 'Try silence and speech, then adjust the limit.')); } catch (error) { this.message((error as Error).message, true); } finally { this.setBusy(false); } }
    this.paint();
  }

  private async start() {
    if (this.busy || this.session) return;
    const settings = this.pendingStart?.settings || this.settings();
    if (settings.durationSeconds < 10 || settings.durationSeconds > 7200) { this.message(this.t('倒數時間須為 10 秒至 120 分鐘。', 'Choose 10 seconds to 120 minutes.'), true); return; }
    this.setBusy(true); this.message('');
    try {
      await this.microphone();
      this.pendingStart ??= { key: idempotencyKey(), settings };
      const { session } = await api.quietStart(this.pendingStart.settings, this.pendingStart.key);
      this.session = session; this.anchor = performance.now(); this.monitoring = session.status === 'running'; this.gate.reset();
      this.pendingStart = undefined;
      if (!this.monitoring) this.stopMicrophone();
      this.render();
    } catch (error) {
      this.stopMicrophone();
      const pending = this.pendingStart;
      if (pending) {
        // If a start response was lost, recover the server session before allowing another setup.
        try {
          const { session } = await api.quietCurrent();
          if (session && ['running', 'paused'].includes(session.status)) {
            this.session = (await api.quietUpdate(session.id, 'pause')).session;
            this.pendingStart = undefined;
            this.render();
          }
        } catch { /* The same start key and settings remain available for a safe retry. */ }
      }
      const message = (error as Error).message + (this.pendingStart ? this.t(' 再按開始會重試原設定。', ' Press Start to retry the same settings.') : '');
      this.message(message, true);
    }
    finally { this.setBusy(false); this.paint(); }
  }

  private sync(action: string, eventId?: string): Promise<boolean> {
    const id = this.session?.id;
    if (!id) return Promise.resolve(false);
    const operation = this.requestQueue.then(async () => {
      if (this.disposed) return;
      const previous = this.session;
      const { session } = await api.quietUpdate(id, action, eventId);
      if (this.disposed) return;
      this.session = session; this.anchor = performance.now();
      if (action === 'noise' && previous?.id === session.id && session.breaches > previous.breaches) {
        const deduction = previous.remainingReward - session.remainingReward;
        this.message(this.t(`音量超過上限，請一起回到專注。本次獎勵減少 ${deduction} 金幣。`, `Sound crossed the limit. Let's refocus. Reward reduced by ${deduction} coins.`));
        this.playPenaltySound();
      }
      if (session.status !== 'running') this.stopMicrophone();
      if (session.status === 'completed') { this.render(); await this.refreshWallets().catch(() => {}); }
      this.paint();
    });
    const handled = operation.then(() => true).catch(() => {
      this.stopMicrophone();
      this.message(this.t('連線中斷，已停止偵測。重新連線後按「繼續挑戰」同步進度。', 'Connection interrupted. Resume after reconnecting to sync progress.'), true);
      this.paint();
      return false;
    });
    this.requestQueue = handled.then(() => {});
    return handled;
  }

  private async pause(reason = '') {
    if (!this.session || this.busy) return;
    this.setBusy(true); this.stopMicrophone();
    await this.sync('pause'); this.setBusy(false); if (reason) this.message(reason, true); this.paint();
  }
  private async resume() {
    if (!this.session || this.busy) return;
    this.setBusy(true); this.message('');
    try {
      await this.microphone();
      // Ensure a failed pause/reload cannot consume an unmonitored gap when resumed.
      if (!await this.sync('pause')) return;
      if (this.session.status === 'completed') return;
      await this.microphone(); // pause acknowledgement releases the previous stream
      const resumed = await this.sync('resume');
      this.monitoring = resumed && !!this.stream && this.session.status === 'running'; this.gate.reset();
    } catch (error) { this.stopMicrophone(); this.message((error as Error).message, true); }
    finally { this.setBusy(false); this.paint(); }
  }
  private async cancel() {
    if (this.busy) return;
    this.setBusy(true); this.stopMicrophone(); await this.sync('cancel'); this.setBusy(false);
    if (this.session?.status === 'cancelled' || this.session?.status === 'completed') this.render();
  }
  private setBusy(value: boolean) {
    this.busy = value;
    this.root.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = value; });
    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('#quietForm input, #quietForm select').forEach(input => { input.disabled = value || !!this.pendingStart; });
    if (this.pendingStart) this.root.querySelectorAll<HTMLButtonElement>('#quietForm button:not(#quietStart):not(#quietMicTest)').forEach(button => { button.disabled = true; });
    if (!value) this.updateRecipients();
  }
  private message(value: string, error = false) { this.element('#quietMessage').textContent = value; this.element('#quietMessage').classList.toggle('error', error); }

  private playPenaltySound() {
    const context = this.context;
    if (!this.monitoring || !context || context.state !== 'running' || document.hidden) return;
    // Let the short cue and its room echo pass without rearming the noise gate.
    this.feedbackUntil = performance.now() + 600;
    try {
      [660, 440, 330].forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * .1;
        oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(.09, start + .012);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .14);
        oscillator.connect(gain); gain.connect(context.destination);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start); oscillator.stop(start + .15);
      });
    } catch { /* Audio playback must never interrupt monitoring or settlement. */ }
  }

  private animate = () => {
    if (this.disposed) return;
    if (this.analyser) {
      this.analyser.getFloatTimeDomainData(this.samples);
      const level = microphoneLevel(this.samples);
      const threshold = this.session?.threshold ?? this.settings().threshold;
      this.element('#quietLevelText').textContent = `${level} / 100`;
      this.element('#quietMeterFill').style.width = `${level}%`;
      this.element('.quiet-meter-track').setAttribute('aria-valuenow', String(level));
      this.element('.quiet-room-stage').classList.toggle('is-loud', level > threshold);
      this.root.querySelectorAll<HTMLElement>('.quiet-waves i').forEach((bar, index) => {
        bar.style.height = `${4 + level * .32 * (.3 + .7 * Math.abs(Math.sin(index * .9 + performance.now() / 180)))}px`;
      });
      if (this.monitoring && !this.busy && this.session && performance.now() >= this.feedbackUntil && this.gate.sample(level, threshold, performance.now())) {
        void this.sync('noise', idempotencyKey());
      }
    }
    this.paintClock();
    this.frame = requestAnimationFrame(this.animate);
  };

  private paintClock() {
    const settings = this.settings();
    const elapsed = this.monitoring && this.session?.status === 'running' ? performance.now() - this.anchor : 0;
    const remaining = this.session ? Math.max(0, this.session.remainingMs - elapsed) / 1000 : settings.durationSeconds;
    const seconds = Math.ceil(remaining);
    this.element('#quietTime').textContent = `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
    const progress = this.element<HTMLProgressElement>('#quietProgress'); progress.max = this.session?.durationSeconds || settings.durationSeconds || 1; progress.value = remaining;
    this.element('.quiet-clock').style.setProperty('--quiet-progress', `${Math.max(0, Math.min(1, remaining / progress.max)) * 100}%`);
    // Stop listening immediately at zero; settlement remains authoritative on the server.
    if (remaining <= 0 && this.monitoring) { this.stopMicrophone(); void this.sync('heartbeat'); }
  }

  private paint() {
    if (this.disposed || !this.root.querySelector('#quietForm')) return;
    const settings = this.settings();
    const threshold = this.session?.threshold ?? settings.threshold;
    this.element('#quietThresholdValue').textContent = `${settings.threshold} / 100`;
    this.element('#quietLimitLine').style.left = `${threshold}%`;
    this.element('#quietRewardLeft').textContent = (this.session?.remainingReward ?? settings.reward).toLocaleString();
    this.element('#quietBreaches').textContent = String(this.session?.breaches || 0);
    const status = this.session?.status;
    this.element('#quietStatus').textContent = status === 'completed' ? this.t('挑戰完成', 'Complete') : status === 'cancelled' ? this.t('已結束', 'Ended') : this.monitoring ? this.t('專注中', 'Focus in progress') : status ? this.t('Ⅱ 已暫停', 'Ⅱ Paused') : this.t('準備開始', 'Ready to begin');
    this.element('#quietEncouragement').textContent = status === 'completed' ? this.t('每一份專注，\n都值得獎勵。', 'Your focus\ndeserves a reward.') : status === 'cancelled' ? this.t('下次，再一起\n累積專注。', 'Another chance\nto grow together.') : this.monitoring ? this.t('保持安靜，\n讓專注成長。', 'Keep it quiet.\nLet focus grow.') : status ? this.t('暫停一下，\n再一起出發。', 'Take a moment.\nThen keep going.') : this.t('讓專注，\n一點一點成長。', 'A little focus.\nA little growth.');
    this.element('#quietMicTest').innerHTML = quietIcon('sound') + ' ' + (this.stream ? this.t('停止音量測試', 'Stop sound test') : this.t('先測試課室音量', 'Test classroom sound'));
    this.element('#quietMicStatus').textContent = this.stream ? this.t('麥克風偵測中 · 不錄音、不上傳聲音', 'Microphone active · no recording or audio upload') : this.t('麥克風已關閉', 'Microphone off');
    if (!this.stream) {
      this.element('#quietMeterFill').style.width = '0%'; this.element('#quietLevelText').textContent = '— / 100';
      this.element('.quiet-meter-track').setAttribute('aria-valuenow', '0');
      this.element('.quiet-room-stage').classList.remove('is-loud');
      this.root.querySelectorAll<HTMLElement>('.quiet-waves i').forEach(bar => { bar.style.height = '4px'; });
    }
    this.element('#quietPause').textContent = this.monitoring ? this.t('Ⅱ 暫停', 'Ⅱ Pause') : this.t('▶ 繼續挑戰', '▶ Resume');
    this.element('#quietQuickPause').textContent = this.element('#quietPause').textContent;
    this.root.querySelectorAll<HTMLElement>('[data-quiet-minutes]').forEach(button => button.classList.toggle('active', settings.durationSeconds === Number(button.dataset.quietMinutes) * 60));
    this.element('.quiet-room-stage').classList.toggle('is-paused', !this.monitoring);
    if (this.session?.payout) {
      const payout = this.session.payout;
      const result = this.element('#quietResult'); result.hidden = false;
      result.innerHTML = `<b>✦ ${this.t('挑戰完成！', 'Challenge complete!')}</b><span>${payout.amount ? this.t(`已發放給 ${payout.count} 人，每人 ${payout.amount} 金幣`, `Issued ${payout.amount} coins each to ${payout.count} students`) : this.t('剩餘獎勵為 0，本次沒有發放金幣', 'No coins issued: remaining reward is 0')}</span>`;
    }
    this.paintClock();
  }

  dispose() {
    this.disposed = true; this.stopMicrophone(); clearInterval(this.interval); cancelAnimationFrame(this.frame);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('beforeunload', this.onBeforeUnload);
  }

  hide() {
    if (this.monitoring) void this.pause();
    else this.stopMicrophone();
  }
}
