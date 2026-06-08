import { t } from '../i18n.js';
import { state } from '../store.js';
import { renderIcon } from './Login.js';

export function renderSettingsPage() {
  const settings = JSON.parse(localStorage.getItem('buiSettings') || '{}');
  return `
    <section class="section-head">
      <div>
        <h2>${t('settings_title')}</h2>
        <p>${t('settings_desc')}</p>
      </div>
    </section>
    <div class="settings-layout">
      <form id="settingsForm" class="settings-form">
        <label>
          ${t('ui_language')}
          <select name="language" style="padding:10px; border:1px solid var(--line); border-radius:8px; font:inherit; background:var(--surface); width:100%; margin-top:8px;">
            <option value="zh-HK" ${(!state.currentUser?.language && !settings.language || (state.currentUser?.language || settings.language) === 'zh-HK') ? 'selected' : ''}>${t('lang_zh')}</option>
            <option value="en-US" ${(state.currentUser?.language || settings.language) === 'en-US' ? 'selected' : ''}>${t('lang_en')}</option>
          </select>
        </label>
        <button class="primary-action" type="submit">
          ${renderIcon('check')} ${t('save_settings')}
        </button>
      </form>
      <div class="settings-intro">
        <h3>${t('integration_status')}</h3>
        <p>${t('integration_status_desc')}</p>
      </div>
    </div>
  `;
}
