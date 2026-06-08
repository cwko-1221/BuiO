import { t } from '../i18n.js';
import { state } from '../store.js';

export function renderIcon(name) {
  const iconSvg = {
    math: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10M7 12h10M7 17h6"/><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></svg>`,
    board: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H4z"/><path d="M8 21h8M12 16v5"/><path d="m8 12 3-3 2 2 3-4"/></svg>`,
    book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 4v13a3 3 0 0 0 3 3"/></svg>`,
    report: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>`,
    spark: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 9.8 8.8 4 11l5.8 2.2L12 19l2.2-5.8L20 11l-5.8-2.2z"/><path d="M19 3v4M21 5h-4"/></svg>`,
    user: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>`,
    door: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M10 12h11m-4-4 4 4-4 4"/></svg>`,
    settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7A2 2 0 1 1 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1a2 2 0 0 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"/></svg>`,
    lock: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`,
    loader: `<svg viewBox="0 0 24 24" aria-hidden="true" class="spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`,
    logout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/></svg>`,
    board2: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
    clock: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
    plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`
  };
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
