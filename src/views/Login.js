import { t } from '../i18n.js';
import { state } from '../store.js';

import { iconSvg } from '../config.js';

export function renderIcon(name) {
  return iconSvg[name] || iconSvg.spark;
}

export function renderLogin() {
  return `
    <main class="login-shell">
      <section class="login-visual" aria-label="平台介紹">
        <!-- 背景裝飾圓圈 -->
        <div class="lv-blob lv-blob-1" aria-hidden="true"></div>
        <div class="lv-blob lv-blob-2" aria-hidden="true"></div>
        <div class="lv-blob lv-blob-3" aria-hidden="true"></div>

        <!-- 校徽品牌 -->
        <div class="brand-lockup">
          <img src="/math-app/images/logo.png" class="brand-mark" alt="校徽" />
          <div>
            <div class="school-name">杯澳公立學校</div>
            <div class="platform-name">個人化學習平台</div>
          </div>
        </div>

        <!-- 主要內容 -->
        <div class="lv-center-content">
          <div class="lv-subject-pills" aria-hidden="true">
            <span class="lv-pill pill-chi">📖 中文</span>
            <span class="lv-pill pill-eng">🔤 英文</span>
            <span class="lv-pill pill-math">📐 數學</span>
            <span class="lv-pill pill-board">🖊️ 白板</span>
          </div>
          <h1>一站式個人化學習平台</h1>
          <p class="lv-subtitle">連接學生每天需要的學習工具</p>
        </div>

        <!-- 底部裝飾 -->
        <div class="lv-footer-badge">
          <span class="lv-badge-dot"></span>
          平台運作中
        </div>
      </section>

      <section class="login-panel" aria-label="登入">
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
