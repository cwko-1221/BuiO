import { api } from '../api';
import type { Locale } from '../types';

export class CoinPusherTeacherSettings {
  private busy = false;
  constructor(private root: HTMLElement, private locale: Locale) {}
  private get zh() { return this.locale === 'zh-HK'; }

  async init() {
    this.root.innerHTML = `<section class="grant-panel coin-pusher-settings-panel" aria-labelledby="coinPusherSettingsHeading">
      <div class="grant-head"><p class="eyebrow">SCHOOL ARCADE SETTINGS</p>
        <h1 id="coinPusherSettingsHeading">${this.zh ? '推銀仔獎勵設定' : 'Coin-pusher rewards'}</h1>
        <p>${this.zh ? '套用到全部學生。設定普通金幣跌入幣槽後，每枚可獲得多少金幣。' : 'Applies to all students. Choose the reward for each ordinary coin caught in the collection well.'}</p>
      </div>
      <form id="coinPusherSettingsForm">
        <label class="field" for="coinPusherRewardPerCoin"><span>${this.zh ? '每枚入槽獎勵（1–100 金幣）' : 'Reward per caught coin (1–100 coins)'}</span>
          <input id="coinPusherRewardPerCoin" name="rewardPerCoin" type="number" inputmode="numeric" min="1" max="100" step="1" required disabled aria-describedby="coinPusherSettingsHint">
        </label>
        <p id="coinPusherSettingsHint" class="caution">${this.zh
          ? '預設 +1；儲存後的新落幣使用新獎勵，已付落幣及待確認獎勵保留原倍率。落幣仍扣 1 金幣，紅寶石 +50 及兌換券不變。'
          : 'Default: +1. New paid drops use the saved rate; existing plays and pending rewards keep their original rate. Drops still cost 1. Ruby +50 and vouchers are unchanged.'}</p>
        <div class="coin-pusher-settings-example" id="coinPusherSettingsExample" aria-live="polite"></div>
        <button type="submit" class="primary" id="saveCoinPusherSettings" disabled>${this.zh ? '儲存全校設定' : 'Save school settings'}</button>
        <button type="button" class="text-button" id="retryCoinPusherSettings" hidden>${this.zh ? '重新載入' : 'Retry loading'}</button>
        <p id="coinPusherSettingsStatus" class="grant-message" role="status" aria-live="polite"></p>
      </form>
    </section>`;
    const form = this.root.querySelector<HTMLFormElement>('form')!;
    form.addEventListener('submit', event => { event.preventDefault(); void this.save(); });
    this.input.addEventListener('input', () => this.preview());
    this.root.querySelector('#retryCoinPusherSettings')!.addEventListener('click', () => void this.load());
    await this.load();
  }

  private get input() { return this.root.querySelector<HTMLInputElement>('#coinPusherRewardPerCoin')!; }
  private message(text: string, error = false) {
    const node = this.root.querySelector<HTMLElement>('#coinPusherSettingsStatus')!;
    node.textContent = text; node.classList.toggle('error', error);
  }
  private setBusy(busy: boolean) {
    this.busy = busy;
    this.root.setAttribute('aria-busy', String(busy));
    this.input.disabled = busy;
    this.root.querySelector<HTMLButtonElement>('#saveCoinPusherSettings')!.disabled = busy;
  }
  private preview() {
    const rate = this.input.valueAsNumber;
    this.root.querySelector('#coinPusherSettingsExample')!.textContent = this.input.validity.valid
      ? (this.zh ? `入槽 1 枚 → +${rate} 金幣；入槽 3 枚 → +${rate * 3} 金幣` : `1 catch → +${rate} coins; 3 catches → +${rate * 3} coins`)
      : (this.zh ? '請輸入 1–100 的整數。' : 'Enter a whole number from 1 to 100.');
  }
  private async load() {
    if (this.busy) return;
    this.setBusy(true);
    const retry = this.root.querySelector<HTMLButtonElement>('#retryCoinPusherSettings')!;
    retry.hidden = true;
    this.message(this.zh ? '正在載入全校設定…' : 'Loading school settings…');
    try {
      const settings = await api.coinPusherSettings();
      this.input.value = String(settings.rewardPerCoin);
      this.preview();
      this.message(this.zh ? `目前每枚入槽 +${settings.rewardPerCoin} 金幣。` : `Current reward: +${settings.rewardPerCoin} per caught coin.`);
      this.setBusy(false);
    } catch {
      this.busy = false; this.root.setAttribute('aria-busy', 'false');
      // Leave saving disabled: an unavailable setting must not look like a loaded default.
      retry.hidden = false;
      this.message(this.zh ? '未能載入設定，請重試。' : 'Could not load settings. Please retry.', true);
    }
  }
  private async save() {
    if (this.busy || !this.input.reportValidity()) return;
    const rate = this.input.valueAsNumber;
    this.setBusy(true);
    this.message(this.zh ? '正在儲存…' : 'Saving…');
    try {
      const settings = await api.saveCoinPusherSettings(rate);
      this.input.value = String(settings.rewardPerCoin); this.preview();
      this.message(this.zh ? `已儲存：全部學生的新落幣，每枚入槽 +${settings.rewardPerCoin} 金幣。` : `Saved for all students: new drops reward +${settings.rewardPerCoin} per caught coin.`);
    } catch {
      this.message(this.zh ? '未能確認儲存，請重試或重新載入核對。' : 'Could not confirm saving. Retry or reload to check.', true);
      this.root.querySelector<HTMLButtonElement>('#retryCoinPusherSettings')!.hidden = false;
    } finally { this.setBusy(false); }
  }
}
