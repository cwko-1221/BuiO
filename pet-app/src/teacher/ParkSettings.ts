import { api } from '../api';
import type { Locale } from '../types';
export class ParkTeacherSettings {
  constructor(private root: HTMLElement, private locale: Locale) {}
  async init() {
    const zh = this.locale === 'zh-HK';
    this.root.innerHTML = `<section class="grant-panel coin-pusher-settings-panel"><div class="grant-head"><p class="eyebrow">PET TOWN</p><h1>${zh ? '戶外樂園任務獎勵' : 'Outdoor park request rewards'}</h1><p>${zh ? '全校學生每天可完成三個 NPC 委託。設定每人每日可取得的任務金幣總額。' : 'Students can finish three NPC requests each day. Set the daily request coin limit per student.'}</p></div><form><label class="field"><span>${zh ? '每日上限（0–50 金幣）' : 'Daily limit (0–50 coins)'}</span><input name="dailyCap" type="number" min="0" max="50" step="1" required disabled></label><p class="caution">${zh ? '預設 50 枚，包含完成三個委託的 5 枚額外獎勵。設為 0 時仍可探索及完成委託。已發放金幣會保留；新完成的委託按儲存後的上限計算。每天午夜按香港時間重設。' : 'Default: 50, including the 5-coin daily bonus. A zero limit still allows exploration and requests. Coins already awarded are kept. Newly completed requests use the saved limit. Resets at midnight Hong Kong time.'}</p><button class="primary" type="submit" disabled>${zh ? '儲存全校設定' : 'Save school settings'}</button><button class="text-button" type="button" data-retry hidden>${zh ? '重新載入' : 'Retry'}</button><p class="grant-message" role="status" aria-live="polite"></p></form></section>`;
    const form = this.root.querySelector('form')!, input = this.root.querySelector<HTMLInputElement>('input')!, save = this.root.querySelector<HTMLButtonElement>('[type="submit"]')!, retry = this.root.querySelector<HTMLButtonElement>('[data-retry]')!, status = this.root.querySelector<HTMLElement>('[role="status"]')!;
    const load = async () => {
      input.disabled = save.disabled = true; retry.hidden = true;
      try { const settings = await api.parkSettings(); input.value = String(settings.dailyCap); input.disabled = save.disabled = false; status.textContent = zh ? `目前每日上限：${settings.dailyCap} 枚金幣。` : `Current daily limit: ${settings.dailyCap} coins.`; }
      catch (error) { status.textContent = (error as Error).message; retry.hidden = false; }
    };
    retry.addEventListener('click', () => void load());
    form.addEventListener('submit', event => {
      event.preventDefault(); if (!form.reportValidity()) return; input.disabled = save.disabled = true;
      void api.saveParkSettings(Number(input.value)).then(settings => { status.textContent = zh ? `已儲存：每人每日最多 ${settings.dailyCap} 枚金幣。` : `Saved: up to ${settings.dailyCap} coins per student each day.`; }).catch(error => status.textContent = error.message).finally(() => input.disabled = save.disabled = false);
    });
    await load();
  }
}
