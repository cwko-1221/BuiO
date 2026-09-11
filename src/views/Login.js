import { t } from '../i18n.js';
import { state } from '../store.js';

import { iconSvg } from '../config.js';

export function renderIcon(name) {
  return iconSvg[name] || iconSvg.spark;
}

export function renderLogin() {
  return `
    <main class="login-shell">
      <section class="login-visual" aria-label="${t('login_visual_label')}">
        <!-- 背景裝飾圓圈 -->
        <div class="lv-blob lv-blob-1" aria-hidden="true"></div>
        <div class="lv-blob lv-blob-2" aria-hidden="true"></div>
        <div class="lv-blob lv-blob-3" aria-hidden="true"></div>

        <!-- 校徽品牌 -->
        <div class="brand-lockup">
          <img src="/math-app/images/logo.png" class="brand-mark" alt="${t('school_logo_alt')}" />
          <div>
            <div class="school-name">${t('school_name')}</div>
            <div class="platform-name">${t('platform_name')}</div>
          </div>
        </div>

        <!-- 主要內容 -->
        <div class="lv-center-content">
          <div class="lv-subject-pills" aria-hidden="true">
            <span class="lv-pill pill-chi">${t('pill_chi')}</span>
            <span class="lv-pill pill-eng">${t('pill_eng')}</span>
            <span class="lv-pill pill-math">${t('pill_math')}</span>
            <span class="lv-pill pill-board">${t('pill_board')}</span>
          </div>
          <h1>${t('login_headline')}</h1>
          <p class="lv-subtitle">${t('login_tagline')}</p>
        </div>

        <!-- 底部裝飾 -->
        <div class="lv-footer-badge">
          <span class="lv-badge-dot"></span>
          ${t('platform_online')}
        </div>
      </section>

      <section class="login-panel" aria-label="${t('login_panel_label')}">
        <div class="panel-topline"></div>
        <h2>${t('login_title')}</h2>
        <p>${t('login_subtitle')}</p>
        ${state.loginError ? `<div class="login-error">${renderIcon('lock')} ${state.loginError}</div>` : ''}
        <form id="loginForm" class="login-form">
          <label>
            ${t('login_id_label')}
            <input id="userIdInput" placeholder="" autocomplete="username" required />
          </label>
          <label>
            ${t('login_pwd_label')}
            <input id="passwordInput" type="password" placeholder="" autocomplete="current-password" required />
          </label>
          <button class="primary-action" type="submit" ${state.loginLoading ? 'disabled' : ''}>
            ${state.loginLoading ? renderIcon('loader') + ' ' + t('login_btn_loading') : renderIcon('door') + ' ' + t('login_btn')}
          </button>
        </form>
      </section>
    </main>
  `;
}
