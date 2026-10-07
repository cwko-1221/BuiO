import { api } from '../api';
import type { Locale } from '../types';
import type { PetAccessSettings, PetAccessUpdate } from '../access-types';
import { escapeAccessHtml as esc, accessLockIcon, lessonPeriods, hkTime, hkInputTime, hkInputIso } from '../access-ui';

export class PetAccessTeacherSettings {
  private settings?: PetAccessSettings;
  private selected = new Set<string>();
  private selectedPeriods = new Set<number>(lessonPeriods.map(period => period.number));
  private busy = false;
  private loading = false;
  private timer?: number;
  private abort = new AbortController();
  private clockOffset = 0;
  private revision = 0;
  constructor(private root: HTMLElement, private locale: Locale) {}
  private t(zh: string, en: string) { return this.locale === 'zh-HK' ? zh : en; }
  private label(name: string) { return name || this.t('未編班', 'Unassigned'); }
  async init() {
    this.root.innerHTML = `<section class="pet-access-heading"><span>${accessLockIcon}</span><div><p class="eyebrow">PET PARADISE · CLASSROOM HOURS</p><h1>${this.t('樂園鎖定', 'Paradise access')}</h1><p>${this.t('上課時讓樂園休息一下。按班級控制整個寵物樂園，已開啟的遊戲也會暫停。', 'Give the paradise a break during lessons. Control all Pet Paradise activities by class, including games already open.')}</p></div></section>
      <div class="pet-access-layout">
        <section class="pet-access-panel"><div class="pet-access-section-head"><h2>${this.t('1. 選擇班級', '1. Choose classes')}</h2><div><button type="button" data-access="all">${this.t('全選', 'Select all')}</button><button type="button" data-access="clear">${this.t('清除', 'Clear')}</button></div></div>
          <p class="pet-access-year"></p><div class="pet-access-classes" aria-label="${this.t('班級選擇', 'Class selection')}"></div>
          <p class="pet-access-selection" aria-live="polite"></p></section>
        <section class="pet-access-panel"><h2>${this.t('2. 設定鎖定時間', '2. Set locking time')}</h2>
          <form id="petAccessForm"><div class="pet-access-modes"><label><input type="radio" name="accessMode" value="lock" checked>${this.t('立即鎖定', 'Lock now')}</label><label><input type="radio" name="accessMode" value="lesson">${this.t('上課時間', 'Class time')}</label><label><input type="radio" name="accessMode" value="schedule">${this.t('預約時段', 'Schedule')}</label></div>
            <div id="petAccessNow"><label class="field"><span>${this.t('鎖定多久', 'Lock duration')}</span><select id="petAccessDuration"><option value="15">${this.t('15 分鐘', '15 minutes')}</option><option value="30" selected>${this.t('30 分鐘', '30 minutes')}</option><option value="60">${this.t('1 小時', '1 hour')}</option><option value="120">${this.t('2 小時', '2 hours')}</option><option value="custom">${this.t('指定解鎖時間', 'Choose unlock time')}</option><option value="manual">${this.t('直到老師解鎖', 'Until a teacher unlocks')}</option></select></label>
              <label class="field" id="petAccessCustom" hidden><span>${this.t('解鎖時間', 'Unlock time')}</span><input type="datetime-local" id="petAccessUnlockAt"></label></div>
            <div id="petAccessLesson" hidden>
              <div class="pet-access-period-head"><span>${this.t('選擇課節（可多選）', 'Choose class periods')}</span><div><button type="button" data-access="period-all">${this.t('全選', 'Select all')}</button><button type="button" data-access="period-clear">${this.t('清除', 'Clear')}</button></div></div>
              <div class="pet-access-periods" role="group" aria-label="${this.t('上課節數', 'Class periods')}">${lessonPeriods.map(period => `<label class="pet-access-period selected"><input type="checkbox" data-access-period value="${period.number}" checked><span><b>${this.t(`第${period.number}節`, `Period ${period.number}`)}</b><small>${period.start} – ${period.end}</small></span></label>`).join('')}</div>
              <p class="pet-access-lesson-help">${this.t('星期一至星期五會在所選課節自動鎖定，其他時間自動開放；老師可隨時解鎖並移除這個循環排程。', 'The selected periods lock automatically Monday to Friday and reopen outside lesson time. A teacher can unlock and remove this recurring schedule at any time.')}</p>
            </div>
            <div id="petAccessSchedule" hidden class="pet-access-time-grid"><label class="field"><span>${this.t('開始鎖定', 'Lock starts')}</span><input type="datetime-local" id="petAccessStartsAt"></label><label class="field"><span>${this.t('自動解鎖', 'Automatically unlock')}</span><input type="datetime-local" id="petAccessEndsAt"></label></div>
            <p class="pet-access-timezone">${this.t('所有時間均為香港時間（UTC+8）。重設立即鎖定會取代當前鎖定；若有重疊預約，會在全部時段結束後開放。', 'All times use Hong Kong time (UTC+8). Lock now replaces the current lock. Overlapping reservations reopen after all their intervals end.')}</p>
            <label class="field"><span>${this.t('給學生的提示（選填）', 'Message to students (optional)')}</span><input id="petAccessNote" maxlength="240" placeholder="${this.t('例如：現在是上課時間，稍後再回來玩。', 'For example: Lesson time. Come back after class.')}"/></label>
            <div class="pet-access-preview" aria-live="polite"></div><button type="submit" class="primary pet-access-submit" disabled>${accessLockIcon}<span>${this.t('鎖定所選班級', 'Lock selected classes')}</span></button>
            <button type="button" class="secondary pet-access-unlock" data-access="unlock" disabled>${this.t('立即解鎖所選班級', 'Unlock selected classes now')}</button>
            <p class="pet-access-unlock-help">${this.t('立即解鎖會一併取消所選班級的未來預約；其他班級不受影響。', 'Unlocking also cancels upcoming reservations for the selected classes. Other classes are unaffected.')}</p>
          </form></section>
      </div><p class="pet-access-message" role="status" aria-live="polite"></p><button type="button" class="secondary pet-access-retry" data-access="refresh">${this.t('重新載入狀態', 'Refresh status')}</button>
      <section class="pet-access-panel pet-access-reservations"><div class="pet-access-section-head"><h2>${this.t('鎖定及預約記錄', 'Locks and reservations')}</h2><small>${this.t('取消某筆記錄只會移除該時段。', 'Cancel removes only that reservation.')}</small></div><div class="pet-access-rules"></div></section>`;
    const signal = this.abort.signal;
    const starts = this.input('petAccessStartsAt'), ends = this.input('petAccessEndsAt');
    starts.value = hkInputTime(Date.now() + 15 * 60000); ends.value = hkInputTime(Date.now() + 45 * 60000);
    this.input('petAccessUnlockAt').value = hkInputTime(Date.now() + 30 * 60000);
    this.root.addEventListener('change', event => {
      const input = event.target as HTMLInputElement;
      if (input.matches('[data-access-class]')) { if (input.checked) this.selected.add(input.value); else this.selected.delete(input.value); input.closest('label')?.classList.toggle('selected',input.checked); }
      if (input.matches('[data-access-period]')) { const period = Number(input.value); if (input.checked) this.selectedPeriods.add(period); else this.selectedPeriods.delete(period); input.closest('label')?.classList.toggle('selected', input.checked); }
      this.preview();
    }, { signal });
    this.root.addEventListener('input', () => this.preview(), { signal });
    this.root.querySelector('form')!.addEventListener('submit', event => { event.preventDefault(); void this.save(); }, { signal });
    this.root.addEventListener('click', event => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-access]');
      if (!button || this.busy) return;
      if (button.dataset.access === 'all') { this.settings?.classes.forEach(c => this.selected.add(c.name)); this.updateClasses(); this.preview(); }
      else if (button.dataset.access === 'clear') { this.selected.clear(); this.updateClasses(); this.preview(); }
      else if (button.dataset.access === 'period-all') { this.selectedPeriods = new Set(lessonPeriods.map(period => period.number)); this.updatePeriods(); this.preview(); }
      else if (button.dataset.access === 'period-clear') { this.selectedPeriods.clear(); this.updatePeriods(); this.preview(); }
      else if (button.dataset.access === 'unlock') void this.save('unlock');
      else if (button.dataset.access === 'cancel') void this.cancel(button.dataset.id!);
      else if (button.dataset.access === 'refresh') void this.load();
    }, { signal });
    await this.load();
    this.timer = window.setInterval(() => { if (!this.root.hidden && !document.hidden) void this.load(true); }, 5000);
  }
  private input(id: string) { return this.root.querySelector<HTMLInputElement>(`#${id}`)!; }
  private now() { return Date.now() + this.clockOffset; }
  private message(text: string, error = false) { const node = this.root.querySelector<HTMLElement>('.pet-access-message')!; node.textContent = text; node.classList.toggle('error', error); }
  private update(settings: PetAccessSettings) {
    this.settings = settings; this.clockOffset = settings.serverNow - Date.now();
    this.selected = new Set([...this.selected].filter(c => settings.classes.some(r => r.name === c)));
    this.root.querySelector('.pet-access-year')!.textContent = `${settings.academicYear} · ${this.t('本學年學生', 'Current academic year')}`;
    this.updateClasses(); this.updateRules(); this.preview();
  }
  private updateClasses() {
    const container = this.root.querySelector<HTMLElement>('.pet-access-classes')!;
    const classes = this.settings?.classes || [];
    if (container.dataset.classes !== JSON.stringify(classes.map(c => c.name))) {
      container.dataset.classes = JSON.stringify(classes.map(c => c.name));
      container.innerHTML = classes.map(c => `<label class="pet-access-class"><input type="checkbox" data-access-class value="${esc(c.name)}"><span><b>${esc(this.label(c.name))}</b><small class="pet-access-class-count"></small><small class="pet-access-class-status"></small></span><i aria-hidden="true"></i></label>`).join('') || `<p>${this.t('目前沒有班級。請先在平台編配學生班級。', 'No classes yet. Assign students to classes in the platform first.')}</p>`;
    }
    [...container.querySelectorAll<HTMLInputElement>('input')].forEach((input, index) => {
      const c = classes[index], row = input.closest<HTMLElement>('label')!;
      input.checked = this.selected.has(c.name); input.disabled = this.busy;
      row.dataset.locked = String(c.locked); row.classList.toggle('selected', input.checked);
      row.querySelector('.pet-access-class-count')!.textContent = this.t(`${c.count} 名學生`, `${c.count} students`);
      row.querySelector('.pet-access-class-status')!.textContent = c.locked ? this.t('鎖定中', 'Locked') + (c.endsAt ? ` · ${hkTime(c.endsAt, this.locale)} ${this.t('解鎖', 'unlocks')}` : ` · ${this.t('待老師解鎖', 'until teacher unlocks')}`) : this.t('開放中', 'Open');
    });
  }
  private updatePeriods() {
    this.root.querySelectorAll<HTMLInputElement>('[data-access-period]').forEach(input => {
      const selected = this.selectedPeriods.has(Number(input.value));
      input.checked = selected; input.closest('label')?.classList.toggle('selected', selected); input.disabled = this.busy;
    });
  }
  private updateRules() {
    const node = this.root.querySelector<HTMLElement>('.pet-access-rules')!;
    const rules = this.settings?.rules || [], now = this.now();
    const signature = JSON.stringify(rules.map(r => ({ ...r, active: Date.parse(r.startsAt) <= now })));
    if (node.dataset.rules === signature) return;
    node.dataset.rules = signature;
    node.innerHTML = rules.map(r => {
      const active = Date.parse(r.startsAt) <= now;
      const recurring = r.kind === 'lesson';
      const periods = recurring ? lessonPeriods.filter(period => r.periods?.includes(period.number)).map(period => `${this.t(`第${period.number}節`, `Period ${period.number}`)} ${period.start}–${period.end}`).join('、') : '';
      const badge = recurring ? this.t('每日循環', 'Daily') : active ? this.t('鎖定中', 'Active') : this.t('已預約', 'Scheduled');
      const description = recurring ? this.t('星期一至星期五 · 每日自動鎖定，其他時間自動開放', 'Monday to Friday · locks automatically each day and reopens outside lesson time') : `${hkTime(r.startsAt, this.locale)} → ${r.endsAt ? hkTime(r.endsAt, this.locale) : this.t('直到老師解鎖', 'Until a teacher unlocks')}`;
      return `<article class="pet-access-rule"><div><span class="pet-access-badge ${recurring ? 'lesson' : active ? 'locked' : ''}">${badge}</span><h3>${esc(r.classes.map(c => this.label(c)).join('、'))}</h3><p>${esc(description)}</p>${recurring && periods ? `<small>${esc(periods)}</small>` : ''}${r.note ? `<small>${esc(r.note)}</small>` : ''}</div><button type="button" class="secondary" data-access="cancel" data-id="${esc(r.id)}" ${this.busy ? 'disabled' : ''}>${this.t('取消此鎖定', 'Cancel this lock')}</button></article>`;
    }).join('') || `<p class="pet-access-empty">${this.t('目前沒有鎖定或預約。', 'No active locks or reservations.')}</p>`;
  }
  private preview() {
    const mode = this.root.querySelector<HTMLInputElement>('[name="accessMode"]:checked')!.value;
    const duration = this.root.querySelector<HTMLSelectElement>('#petAccessDuration')!.value;
    const lesson = mode === 'lesson';
    this.root.querySelector<HTMLElement>('#petAccessNow')!.hidden = mode !== 'lock';
    this.root.querySelector<HTMLElement>('#petAccessLesson')!.hidden = !lesson;
    this.root.querySelector<HTMLElement>('#petAccessSchedule')!.hidden = mode !== 'schedule';
    this.root.querySelector<HTMLElement>('#petAccessCustom')!.hidden = duration !== 'custom';
    this.input('petAccessStartsAt').required = mode === 'schedule'; this.input('petAccessEndsAt').required = mode === 'schedule';
    this.input('petAccessUnlockAt').required = mode === 'lock' && duration === 'custom';
    const count = this.settings?.classes.filter(c => this.selected.has(c.name)).reduce((sum, c) => sum + c.count, 0) || 0;
    const summary = this.t(`已選 ${this.selected.size} 個班級 · ${count} 名學生`, `${this.selected.size} classes selected · ${count} students`);
    this.root.querySelector('.pet-access-selection')!.textContent = summary;
    const action = lesson ? this.t('上課時間鎖定', 'Class-time lock') : mode === 'schedule' ? this.t('預約鎖定', 'Schedule lock') : this.t('立即鎖定', 'Lock now');
    let period = duration === 'manual' ? this.t('直到老師解鎖', 'Until a teacher unlocks') : duration === 'custom' ? this.input('petAccessUnlockAt').value.replace('T', ' ') : this.t(`${duration} 分鐘後自動解鎖`, `Automatically unlock after ${duration} minutes`);
    if (lesson) {
      const selected = lessonPeriods.filter(item => this.selectedPeriods.has(item.number));
      period = selected.length ? selected.map(item => `${this.t(`第${item.number}節`, `Period ${item.number}`)} ${item.start}–${item.end}`).join('、') : this.t('請先選擇課節', 'Choose at least one period');
    }
    if (mode === 'schedule') period = `${this.input('petAccessStartsAt').value.replace('T', ' ')} → ${this.input('petAccessEndsAt').value.replace('T', ' ')}`;
    const preview = this.root.querySelector('.pet-access-preview')!;
    preview.textContent = this.selected.size ? `${action} · ${summary} · ${period}` : this.t('請先選擇一個或多個班級。', 'Choose one or more classes first.');
    this.root.querySelector('.pet-access-submit span')!.textContent = lesson ? this.t('鎖定上課時間', 'Lock class time') : mode === 'schedule' ? this.t('儲存鎖定預約', 'Save reservation') : this.t('鎖定所選班級', 'Lock selected classes');
    this.root.querySelector<HTMLButtonElement>('.pet-access-submit')!.disabled = this.busy || !this.settings || !this.selected.size || (lesson && !this.selectedPeriods.size);
    this.root.querySelector<HTMLButtonElement>('.pet-access-unlock')!.disabled = this.busy || !this.settings || !this.selected.size;
  }
  private setBusy(busy: boolean) {
    this.busy = busy; this.root.setAttribute('aria-busy', String(busy));
    this.root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach(n => n.disabled = busy || !this.settings);
    this.root.querySelector<HTMLButtonElement>('[data-access="refresh"]')!.disabled = busy;
    this.preview();
  }
  private async load(quiet = false) {
    if (this.busy || this.loading) return;
    this.loading = true;
    const revision = this.revision;
    if (!quiet) { this.setBusy(true); this.message(this.t('正在載入班級狀態…', 'Loading class access…')); }
    try { const settings = await api.teacherAccess(); if (this.abort.signal.aborted || revision !== this.revision) return; this.update(settings); if (!quiet) this.message(this.t('已載入最新狀態。', 'Current status loaded.')); }
    catch { if (!this.abort.signal.aborted) this.message(this.t('未能更新狀態，請重新載入核對。', 'Could not refresh status. Please retry.'), true); }
    finally { this.loading = false; if (!this.abort.signal.aborted && !quiet) this.setBusy(false); }
  }
  private async save(action?: 'unlock') {
    if (this.busy || !this.selected.size || !this.settings) return;
    if (!action && !this.root.querySelector<HTMLFormElement>('form')!.reportValidity()) return;
    const selectedMode = this.root.querySelector<HTMLInputElement>('[name="accessMode"]:checked')!.value as 'lock' | 'lesson' | 'schedule';
    const body: PetAccessUpdate = { action: action || selectedMode, classes: [...this.selected], note: this.input('petAccessNote').value };
    try {
      if (!action) {
        if (body.action === 'lesson') body.periods = [...this.selectedPeriods];
        else {
          const duration = this.root.querySelector<HTMLSelectElement>('#petAccessDuration')!.value;
          body.endsAt = body.action === 'schedule' ? hkInputIso(this.input('petAccessEndsAt').value) : duration === 'manual' ? null : duration === 'custom' ? hkInputIso(this.input('petAccessUnlockAt').value) : new Date(this.now() + Number(duration) * 60000).toISOString();
          if (body.action === 'schedule') body.startsAt = hkInputIso(this.input('petAccessStartsAt').value);
        }
      }
      this.revision++;this.setBusy(true); this.message(this.t('正在套用…', 'Applying…'));
      const result = await api.updatePetAccess(body);
      if (this.abort.signal.aborted) return;
      this.update(result);
      this.message(body.action === 'unlock' ? this.t('所選班級已解鎖，相關循環排程及預約已取消。', 'Selected classes unlocked; recurring schedules and reservations cancelled.') : body.action === 'lesson' ? this.t('已設定每日上課時間鎖定。星期一至星期五的所選課節會自動鎖定，其他時間自動開放。', 'Daily class-time locking is set. Selected periods lock Monday to Friday and reopen outside lesson time.') : body.action === 'schedule' ? this.t('預約已儲存，屆時會自動鎖定及解鎖。', 'Reservation saved. It will lock and unlock automatically.') : this.t('所選班級已鎖定。已開啟的樂園會收到通知並暫停。', 'Selected classes locked. Open paradise sessions will be notified and paused.'));
    } catch (error) { this.message((error as Error).message, true); }
    finally { if (!this.abort.signal.aborted) this.setBusy(false); }
  }
  private async cancel(id: string) {
    this.revision++;
    this.setBusy(true);
    try { const result = await api.cancelPetAccess(id); if (this.abort.signal.aborted) return; this.update(result); this.message(this.t('已取消此鎖定／預約。', 'Lock / reservation cancelled.')); }
    catch (error) { this.message((error as Error).message, true); }
    finally { if (!this.abort.signal.aborted) this.setBusy(false); }
  }
  dispose() { this.abort.abort(); clearInterval(this.timer); }
}
