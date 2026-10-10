import { api } from './api';
import type { PetAccessStatus } from './access-types';
import type { Locale } from './types';
import { accessLockIcon, escapeAccessHtml as esc, hkTime } from './access-ui';

// This guard owns a separate DOM root so a late game/modal render cannot replace its screen.
export class PetAccessGate {
  private root = document.createElement('section');
  private access?: PetAccessStatus;
  private blocked = true;
  private started = false;
  private starting = false;
  private checking = false;
  private revision = 0;
  private timer?: number;
  private abort = new AbortController();
  private signature = '';
  private failures = 0;
  constructor(private app: HTMLElement, private locale: Locale, private startApp: () => Promise<void>, private setLocked: (locked: boolean) => void) {
    this.root.className = 'pet-access-overlay'; this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true'); this.root.setAttribute('aria-labelledby', 'petAccessTitle');
    document.body.append(this.root);
    this.setBlocked(true);
    this.setLocked(true);
    const signal = this.abort.signal;
    const preventGameInput = (event: Event) => {
      if (!this.blocked) return;
      const inside = event.target instanceof Node && this.root.contains(event.target);
      if (event.type === 'keydown' || event.type === 'keyup' || !inside) event.stopImmediatePropagation();
      if (!inside) event.preventDefault();
      if (event instanceof KeyboardEvent && event.key === 'Tab') {
        const nodes = [...this.root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]')];
        if (!nodes.length) return;
        const index = nodes.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey ? index <= 0 : index === nodes.length - 1 || index < 0) {
          event.preventDefault(); nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
        }
      }
    };
    ['keydown', 'keyup', 'pointerdown', 'pointerup', 'pointermove', 'click', 'touchstart', 'touchmove'].forEach(type => window.addEventListener(type, preventGameInput, { signal, capture: true, passive: false }));
    window.addEventListener('pet:access', event => { this.revision++; void this.apply((event as CustomEvent<PetAccessStatus>).detail); }, { signal });
    window.addEventListener('online', () => void this.check(), { signal });
    window.addEventListener('pageshow', () => void this.check(), { signal });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearTimeout(this.timer);
      else { this.setBlocked(true); void this.check(); }
    }, { signal });
    this.root.addEventListener('click', event => { if ((event.target as HTMLElement).closest('[data-access-check]')) void this.check(); }, { signal });
    window.addEventListener('pagehide', event => { if (!event.persisted) this.dispose(); }, { signal });
    this.render('checking');
  }
  private t(zh: string, en: string) { return this.locale === 'zh-HK' ? zh : en; }
  async init() { await this.check(); }
  private setBlocked(blocked: boolean) {
    const changed = this.blocked !== blocked;
    this.blocked = blocked; this.app.inert = blocked;
    const notifications = document.querySelector<HTMLElement>('#pvp-notifications');
    if (notifications) notifications.inert = blocked;
    document.body.classList.toggle('pet-access-blocked', blocked);
    this.root.hidden = !blocked;
    if (changed) this.setLocked(blocked);
  }
  private render(kind: 'checking' | 'locked' | 'error', error?: string) {
    const signature = JSON.stringify({ kind, access: kind === 'locked' ? this.access && { className: this.access.className, note: this.access.note, endsAt: this.access.endsAt } : null, error });
    if (signature === this.signature) return;
    this.signature = signature;
    const title = kind === 'locked' ? this.t('樂園休息中', 'Paradise is taking a break') : kind === 'error' ? this.t('暫未能確認樂園狀態', 'Checking paradise access') : this.t('正在確認樂園開放時間…', 'Checking paradise hours…');
    const description = kind === 'locked' ? this.access?.note || this.t('老師已暫時鎖定寵物樂園。請先專心上課，開放後再回來找夥伴吧。', 'Your teacher has temporarily locked Pet Paradise. Focus on your lesson and come back when it reopens.') : kind === 'error' ? error || this.t('連線未完成，請稍後再試。', 'Could not confirm access. Please retry.') : this.t('請稍候，正在準備你的樂園。', 'Please wait while we prepare your paradise.');
    this.root.innerHTML = `<div class="pet-access-lock-card"><div class="pet-access-lock-art">${accessLockIcon}<i>✦</i><i>✧</i></div><p class="eyebrow">PET PARADISE</p><h1 id="petAccessTitle">${esc(title)}</h1><p class="pet-access-lock-note">${esc(description)}</p>${kind === 'locked' ? `<div class="pet-access-lock-time"><b>${esc(this.access?.className || this.t('你的班級', 'Your class'))}</b><span>${this.access?.endsAt ? this.t(`預計 ${hkTime(this.access.endsAt, this.locale)} 自動開放`, `Automatically reopens ${hkTime(this.access.endsAt, this.locale)}`) : this.t('等待老師解鎖', 'Waiting for your teacher to unlock')}</span><small>${this.t('時間以香港時間為準 · 開放後本頁會自動更新', 'Hong Kong time · This page updates automatically')}</small></div>` : ''}<div class="pet-access-lock-actions"><a class="primary" href="/">${this.t('返回學習平台', 'Back to learning')}</a><button type="button" class="secondary" data-access-check>${this.t('檢查開放狀態', 'Check access')}</button></div><p class="pet-access-lock-status" role="status" aria-live="polite"></p></div>`;
    this.root.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
  private async apply(access: PetAccessStatus) {
    if (this.abort.signal.aborted) return;
    this.access = access;
    if (access.locked) { this.setBlocked(true); this.render('locked'); return; }
    if (!this.started) {
      if (this.starting) return;
      this.starting = true; this.setBlocked(true); this.render('checking');
      try {
        await this.startApp(); this.started = true;
        if (this.access?.locked) { this.setBlocked(true); this.render('locked'); }
        else this.setBlocked(false);
      } catch (error) {
        // A bootstrap rejected mid-start publishes the authoritative lock through api.ts.
        if (this.access?.locked) this.render('locked'); else this.render('error', (error as Error).message);
      } finally { this.starting = false; }
    } else this.setBlocked(false);
  }
  private async check() {
    if (this.checking || this.abort.signal.aborted || document.hidden) return;
    this.checking = true; clearTimeout(this.timer);
    const revision = this.revision;
    try {
      const { access } = await api.petAccess();
      this.failures = 0;
      if (revision === this.revision) await this.apply(access);
      const status = this.root.querySelector('.pet-access-lock-status');
      if (status) status.textContent = access.locked ? this.t('已檢查：仍在鎖定中。', 'Checked: still locked.') : '';
    } catch {
      this.failures++;
      if (this.access?.locked) {
        const status = this.root.querySelector('.pet-access-lock-status');
        if (status) status.textContent = this.t('正在重新連線，請稍候。', 'Reconnecting. Please wait.');
      } else { this.setBlocked(true); this.render('error'); }
    } finally {
      this.checking = false;
      if (!this.abort.signal.aborted && !document.hidden) this.timer = window.setTimeout(() => void this.check(),
        Math.min(30000, 2000 * 2 ** Math.min(this.failures, 4)) + Math.random() * 500);
    }
  }
  private dispose() { this.abort.abort(); clearTimeout(this.timer); }
}
