import './social.css';
import { DUET, SOCIAL_PADS, type DuetFrame } from '../../lib/park-social.mjs';
import type { ParkClient } from './client';
import { audio } from '../audio';
type Invitation = { id: string; kind: 'duet' | 'highfive'; direction: 'incoming' | 'outgoing'; peer: { id: string; name: string }; expiresAt: number };
type Session = { id: string; role: number; members: { id: string; name: string }[]; game: DuetFrame };
type SocialEffect = { kind: 'highfive'; members: { id: string; name: string; x: number; y: number }[] };
type Options = { host: HTMLElement; client: ParkClient; language: string; onBusy(busy: boolean): void; onNotice(message: string): void; onEffect?(effect: SocialEffect): void; onWalkToPeer?(id: string): void; portrait?(id: string): string | undefined };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export class ParkSocial {
  invitation?: Invitation;
  session?: Session;
  private root: HTMLDivElement;
  private abort = new AbortController();
  private timer = 0;
  private offset = 0;
  private nearby = false;
  private focusedPeer?: string;
  private busy = false;
  private submitted = false;
  private previousSignature = '';
  private lastFocus?: HTMLElement;
  private lastCue = '';
  private audio?: AudioContext;
  private pendingRequest = false;
  constructor(private options: Options) {
    this.root = document.createElement('div'); this.root.className = 'park-social-root'; this.options.host.append(this.root);
    const signal = this.abort.signal;
    this.root.addEventListener('click', event => this.click(event), { signal });
    window.addEventListener('keydown', event => this.key(event), { signal });
    options.client.addEventListener('social', event => this.receive((event as CustomEvent).detail), { signal });
    options.client.addEventListener('roster', () => { if (this.nearby) this.render(); }, { signal });
    options.client.addEventListener('connection', () => {
      if (!options.client.ready) { this.invitation = undefined; this.session = undefined; this.nearby = false; this.render(); }
      else void options.client.request<{ invitation?: Invitation; session?: Session }>('park:social:state', {}).then(result => { this.invitation = result.invitation; this.session = result.session; this.render(); }).catch(() => {});
    }, { signal });
    this.timer = window.setInterval(() => this.animate(), 50);
  }
  get isOpen() { return this.nearby || !!this.session; }
  private t(zh: string, en: string) { return this.options.language === 'en-US' ? en : zh; }
  private padName(id: number) { const pad = SOCIAL_PADS[id]; return this.options.language === 'en-US' ? pad.en : pad.zh; }
  openNearby(peerId?: string) { if (this.session) return; this.focusedPeer = peerId; this.nearby = true; this.render(); }
  closeNearby() { this.nearby = false; this.render(); }
  async invite(peerId: string, kind: 'duet' | 'highfive' = 'duet') {
    if (this.pendingRequest) return; this.pendingRequest = true;
    if (kind === 'duet') { try { this.audio ??= new AudioContext(); void this.audio.resume(); } catch {} }
    try { const result = await this.options.client.request<{ invitation: Invitation }>('park:social:invite', { peerId, kind }); this.nearby = false; this.invitation = result.invitation; this.render(); }
    catch (error) { this.options.onNotice((error as Error).message); }
    finally { this.pendingRequest = false; }
  }
  async wave(peerId: string) {
    const peer = this.options.client.peers.find(p => p.id === peerId); if (!peer) return;
    try { await this.options.client.request('park:emote', { emote: 'hello' }); this.options.onNotice(this.t(`你向 ${peer.name} 揮手了。`, `You waved to ${peer.name}.`)); }
    catch (error) { this.options.onNotice((error as Error).message); }
  }
  private receive(event: any) {
    if (!event || typeof event !== 'object') return;
    if (Number.isFinite(event.at)) this.offset = event.at - Date.now();
    if (event.type === 'invitation') { this.invitation = event.invitation; this.render(); }
    if (event.type === 'invitation-ended' && this.invitation?.id === event.invitationId) {
      this.invitation = undefined; this.render();
      const messages: Record<string, [string, string]> = { expired: ['邀請時間已過，稍後再一起玩吧。', 'The invitation expired. Try again later.'], declined: ['同學這次未能一起玩，稍後再邀請吧。', 'Your classmate cannot join this time. Try again later.'], unavailable: ['同學已離開附近，邀請已結束。', 'Your classmate moved away. The invitation ended.'] };
      if (messages[event.reason]) this.options.onNotice(this.t(...messages[event.reason]));
    }
    if (event.type === 'session') {
      const old = this.session; this.session = event.session; this.nearby = false; this.invitation = undefined;
      if (old?.id !== this.session?.id || old?.game.round !== this.session?.game.round) this.submitted = false;
      const game = this.session?.game, signature = game ? `${this.session!.id}:${game.phase}:${game.round}:${game.attempts.join(',')}:${game.score}` : '';
      if (signature !== this.previousSignature) { this.previousSignature = signature; this.render(); }
    }
    if (event.type === 'ended' && this.session && this.session.id === event.sessionId) {
      const finished = this.session.game.phase === 'result'; this.session = undefined; this.render();
      if (!finished && event.reason !== 'left') this.options.onNotice(this.t('合奏已中斷；同學離開或樂園暫停開放。', 'The duet ended because a player left or park access changed.'));
      else if (!finished && event.actorId !== this.options.client.selfId) this.options.onNotice(this.t('同學已離開合奏，隨時可以再邀請。', 'Your classmate left the duet. You can invite again.'));
    }
    if (event.type === 'effect' && event.kind === 'highfive') {
      this.options.onEffect?.(event);
      if (event.members.some((p: { id: string }) => p.id === this.options.client.selfId)) this.options.onNotice(this.t('擊掌！和朋友分享好心情。', 'High five! A little moment with your friend.'));
    }
  }
  private avatar(id: string, name: string) {
    const portrait = this.options.portrait?.(id);
    return portrait ? `<img class="park-social-pet" src="${esc(portrait)}" alt="">` : `<span class="park-social-initial">${esc(name.slice(0, 1))}</span>`;
  }
  private render() {
    const focus = document.activeElement as HTMLElement | null, action = focus?.dataset.social, pad = focus?.dataset.pad;
    const blocked = this.nearby || !!this.session;
    if (blocked && !this.busy) this.lastFocus = focus || undefined;
    if (blocked !== this.busy) { this.busy = blocked; this.options.onBusy(blocked); }
    let html = '';
    if (this.nearby) {
      const client = this.options.client, self = client.frames.get(client.selfId), peers = client.peers.filter(p => p.id !== client.selfId).map(p => ({ ...p, frame: client.frames.get(p.id), distance: self && client.frames.get(p.id) ? Math.hypot(self.x - client.frames.get(p.id)!.x, self.y - client.frames.get(p.id)!.y) : Infinity })).sort((a, b) => a.id === this.focusedPeer ? -1 : b.id === this.focusedPeer ? 1 : a.distance - b.distance);
      html = `<div class="park-social-backdrop"><section class="park-social-nearby" role="dialog" aria-modal="true" aria-labelledby="parkSocialNearby"><header><div><small>${this.t('一起玩才有的樂趣', 'BETTER TOGETHER')}</small><h2 id="parkSocialNearby">${this.t('附近的同學', 'Meet your classmates')}</h2></div><button data-social="close-nearby" aria-label="${this.t('關閉', 'Close')}">×</button></header><p>${this.t('走到同學附近，邀請擊掌或來一場雙人星光合奏。接受後才會開始。', 'Meet a classmate nearby, then invite a high five or a Starlight Duet. Both players choose to join.')}</p><div class="park-social-peer-list">${peers.map(p => { const near = p.distance <= 360, available = near && p.frame?.active && !p.frame.activity; return `<article>${this.avatar(p.id, p.name)}<div><b>${esc(p.name)}</b><small>${!near ? this.t('正在樂園另一處', 'Exploring elsewhere') : available ? this.t('在你附近', 'Nearby') : this.t('正在其他活動', 'In another activity')}</small></div><div class="park-social-peer-actions">${available ? `<button data-social="invite-highfive" data-peer="${esc(p.id)}">${this.t('擊掌', 'High five')}</button><button class="primary" data-social="invite-duet" data-peer="${esc(p.id)}">${this.t('一起合奏', 'Play a duet')}</button>` : !near ? `<button data-social="find" data-peer="${esc(p.id)}">${this.t('去找同學', 'Meet them')} →</button>` : `<button data-social="wave" data-peer="${esc(p.id)}">${this.t('揮手', 'Wave')}</button>`}</div></article>`; }).join('') || `<div class="park-social-empty"><span>❧</span><p>${this.t('還未有同學出門。可以先探索樂園，等朋友來到再一起玩。', 'Your classmates are not outside yet. Explore the park and meet them later.')}</p></div>`}</div></section></div>`;
    }
    if (this.session) html = this.gameHtml(this.session);
    if (this.invitation) {
      const i = this.invitation, incoming = i.direction === 'incoming';
      html += `<section class="park-social-invitation" role="status" aria-live="polite"><span class="park-social-invite-icon">${i.kind === 'duet' ? '♫' : '✦'}</span><div><b>${esc(i.peer.name)}</b><p>${incoming ? i.kind === 'duet' ? this.t('邀請你一起玩星光合奏', 'Invites you to a Starlight Duet') : this.t('想和你的寵物擊掌', 'Would like to high five your pet') : this.t('正在等候回覆…', 'Waiting for a reply…')} <small data-social-invite-time></small></p></div><div>${incoming ? `<button data-social="decline">${this.t('稍後', 'Not now')}</button><button class="primary" data-social="accept">${this.t('一起玩', 'Join')}</button>` : `<button data-social="cancel-invite">${this.t('取消', 'Cancel')}</button>`}</div></section>`;
    }
    this.root.innerHTML = html;
    if (blocked) {
      const restore = action ? this.root.querySelector<HTMLButtonElement>(`[data-social="${action}"]${pad ? `[data-pad="${pad}"]` : ''}`) : undefined;
      (restore && !restore.disabled ? restore : this.root.querySelector<HTMLButtonElement>('.park-social-backdrop button'))?.focus({ preventScroll: true });
    } else if (this.lastFocus?.isConnected) { this.lastFocus.focus({ preventScroll: true }); this.lastFocus = undefined; }
    this.animate();
  }
  private gameHtml(session: Session) {
    const g = session.game, role = session.role, result = g.phase === 'result';
    const words: Record<string, [string, string]> = { perfect: ['完美時機！', 'Perfect timing!'], good: ['接住了！', 'Got it!'], wrong: ['下次看看圖案', 'Check the symbol next time'], early: ['太早了，等等光點', 'A little early; follow the light'], late: ['慢了一點，再試一拍', 'A little late; try the next beat'] };
    const attempt = g.attempts[role], feedback = attempt ? this.t(...words[attempt]) : this.t('等光點進入亮色區，按下自己的圖案', 'Press your symbol as the light enters the bright zone');
    return `<div class="park-social-backdrop"><section class="park-social-game" role="dialog" aria-modal="true" aria-labelledby="parkDuetTitle"><header><div><small>${this.t('雙人合作 · 免費同樂', 'TWO PLAYERS · FREE PLAY')}</small><h2 id="parkDuetTitle">${this.t('星光合奏', 'Starlight Duet')}</h2></div><button data-social="leave" aria-label="${this.t('離開合奏', 'Leave duet')}">×</button></header>${result ? `<div class="park-social-result"><div class="park-social-stars" aria-label="${g.stars} ${this.t('顆星', 'stars')}">${[0, 1, 2].map(i => `<span class="${g.stars > i ? 'earned' : ''}">★</span>`).join('')}</div><h3>${g.qualified ? this.t('這是你們的合奏！', 'A melody you made together!') : this.t('下一次會更有默契', 'Keep finding your rhythm')}</h3><strong>${g.score}<small>${this.t('共同得分', 'shared score')}</small></strong><p>${this.t(`一起接住 ${g.duets} / ${g.totalRounds} 拍 · 最長連擊 ${g.maxCombo}`, `${g.duets} / ${g.totalRounds} duets · best combo ${g.maxCombo}`)}</p><div class="park-social-duet-pets">${session.members.map(p => `<div>${this.avatar(p.id, p.name)}<b>${esc(p.name)}</b></div>`).join('<span>♫</span>')}</div><p class="park-social-free-note">${g.stars === 3 ? this.t('已獲三星，一起再創紀錄！', 'Three stars! Make another memory together.') : this.t('記住這次默契，下一局再挑戰三顆星。', 'Try another duet and aim for three stars together.')}</p><div class="park-social-result-actions"><button data-social="leave">${this.t('回到樂園', 'Back to the park')}</button><button class="primary" data-social="replay">${this.t('再邀請一局', 'Invite another round')}</button></div></div>` : `<div class="park-social-game-top"><span data-social-countdown>${g.phase === 'countdown' ? this.t('準備一起開始', 'Get ready together') : this.t(`第 ${g.round + 1} / ${g.totalRounds} 拍`, `Beat ${g.round + 1} / ${g.totalRounds}`)}</span><b>${g.score} <small>${this.t('分', 'pts')}</small></b></div><div class="park-social-partners">${session.members.map((p, i) => `<div class="${i === role ? 'self' : ''}">${this.avatar(p.id, p.name)}<b>${esc(p.name)}${i === role ? ` · ${this.t('你', 'you')}` : ''}</b><span>${SOCIAL_PADS[g.pads[i]].glyph} ${esc(this.padName(g.pads[i]))}</span><small>${g.attempts[i] === 'perfect' || g.attempts[i] === 'good' ? this.t('✓ 已接住', '✓ Played') : g.attempts[i] ? this.t('再接下一拍', 'Try the next beat') : this.t('等候這一拍', 'Ready for this beat')}</small></div>`).join('')}</div><div class="park-social-timing" aria-hidden="true"><div class="park-social-target"></div><span class="park-social-note">✦</span><i data-social-beat></i></div><p class="park-social-feedback ${attempt === 'perfect' || attempt === 'good' ? 'success' : ''}" data-social-feedback>${feedback}</p><div class="park-social-pads">${SOCIAL_PADS.map(pad => `<button data-social="pad" data-pad="${pad.id}" style="--pad-color:${pad.color}" ${attempt || g.phase === 'countdown' ? 'disabled' : ''} aria-label="${esc(this.padName(pad.id))}"><span>${pad.glyph}</span><b>${esc(this.padName(pad.id))}</b><kbd>${pad.id + 1}</kbd></button>`).join('')}</div><div class="park-social-history" aria-label="${this.t('合奏進度', 'Duet progress')}">${g.history.map((success, i) => `<span class="${success === true ? 'won' : success === false ? 'missed' : i === g.round ? 'current' : ''}">${success === true ? '♪' : i + 1}</span>`).join('')}</div><p class="park-social-rules">${this.t('兩人都按對圖案和時機，這一拍才算合奏成功。每拍只按一次。', 'Both players need the right symbol and timing. Press once per beat.')}</p><button class="park-social-leave" data-social="leave">${this.t('離開合奏', 'Leave duet')}</button>`}</section></div>`;
  }
  private animate() {
    const time = Date.now() + this.offset;
    const invitationTime = this.root.querySelector('[data-social-invite-time]'); if (invitationTime && this.invitation) invitationTime.textContent = `${Math.max(0, Math.ceil((this.invitation.expiresAt - time) / 1000))}s`;
    const g = this.session?.game; if (!g || g.phase === 'result') return;
    const dot = this.root.querySelector<HTMLElement>('[data-social-beat]');
    if (dot) dot.style.left = `${Math.max(0, Math.min(100, (time - g.startedAt - g.round * DUET.roundMs) / DUET.roundMs * 100))}%`;
    const countdown = this.root.querySelector('[data-social-countdown]');
    if (countdown && g.phase === 'countdown') countdown.textContent = this.t(`一起準備 · ${Math.max(1, Math.ceil((g.startedAt - time) / 1000))}`, `Get ready · ${Math.max(1, Math.ceil((g.startedAt - time) / 1000))}`);
    if (g.phase === 'playing' && time >= g.targetAt && time < g.targetAt + 200 && this.lastCue !== `${this.session!.id}:${g.round}`) { this.lastCue = `${this.session!.id}:${g.round}`; this.tone(g.pads[this.session!.role]); }
  }
  private tone(pad: number) {
    if (!this.audio || this.audio.state !== 'running' || !audio.enabled || audio.sfxLevel <= 0 || document.hidden) return;
    const oscillator = this.audio.createOscillator(), gain = this.audio.createGain(); oscillator.type = 'sine'; oscillator.frequency.value = [523, 659, 784, 1047][pad]; gain.gain.setValueAtTime(.075 * audio.sfxLevel, this.audio.currentTime); gain.gain.exponentialRampToValueAtTime(.001, this.audio.currentTime + .15); oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); }; oscillator.start(); oscillator.stop(this.audio.currentTime + .16);
  }
  private async answer(action: 'accept' | 'decline' | 'cancel') {
    const invitation = this.invitation; if (!invitation || this.pendingRequest) return; this.pendingRequest = true;
    if (action === 'accept' && invitation.kind === 'duet') { try { this.audio ??= new AudioContext(); void this.audio.resume(); } catch {} }
    try { await this.options.client.request('park:social:reply', { invitationId: invitation.id, action }); }
    catch (error) { this.options.onNotice((error as Error).message); }
    finally { this.pendingRequest = false; }
  }
  private async press(pad: number) {
    const session = this.session; if (!session || session.game.phase !== 'playing' || session.game.attempts[session.role] || this.submitted) return;
    this.submitted = true;
    try { await this.options.client.request('park:social:input', { sessionId: session.id, round: session.game.round, pad }); }
    catch (error) { this.submitted = false; this.options.onNotice((error as Error).message); }
  }
  async leave() {
    const session = this.session; if (!session) return;
    try { await this.options.client.request('park:social:control', { sessionId: session.id, action: 'leave' }); }
    catch (error) { this.options.onNotice((error as Error).message); }
    finally { if (this.session?.id === session.id) { this.session = undefined; this.render(); } }
  }
  private click(event: Event) {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-social]'); if (!button || button.disabled) return;
    const action = button.dataset.social, peer = button.dataset.peer;
    if (action === 'close-nearby') this.closeNearby();
    if (action === 'invite-duet' && peer) void this.invite(peer, 'duet');
    if (action === 'invite-highfive' && peer) void this.invite(peer, 'highfive');
    if (action === 'wave' && peer) void this.wave(peer);
    if (action === 'find' && peer) { this.closeNearby(); this.options.onWalkToPeer?.(peer); }
    if (action === 'accept') void this.answer('accept');
    if (action === 'decline') void this.answer('decline');
    if (action === 'cancel-invite') void this.answer('cancel');
    if (action === 'pad') void this.press(Number(button.dataset.pad));
    if (action === 'leave') void this.leave();
    if (action === 'replay' && this.session) { const peerId = this.session.members[1 - this.session.role].id; void this.leave().then(() => this.invite(peerId)); }
  }
  private key(event: KeyboardEvent) {
    if (!this.isOpen || event.defaultPrevented) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (this.session) void this.leave(); else this.closeNearby(); return; }
    if (this.session && !event.repeat && /^[1-4]$/.test(event.key)) { event.preventDefault(); event.stopImmediatePropagation(); void this.press(Number(event.key) - 1); }
    if (event.key === 'Tab') {
      const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('.park-social-backdrop button:not(:disabled)')]; if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey ? index <= 0 : index < 0 || index === buttons.length - 1) { event.preventDefault(); buttons[event.shiftKey ? buttons.length - 1 : 0].focus(); }
    }
  }
  destroy() { clearInterval(this.timer); this.abort.abort(); void this.audio?.close(); this.root.remove(); if (this.busy) this.options.onBusy(false); }
}
