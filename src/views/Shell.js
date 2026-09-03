import { t } from '../i18n.js';
import { state } from '../store.js';
import { renderIcon } from './Login.js';
import { renderDashboard } from './Dashboard.js';
import { renderModulesPage } from './Modules.js';
import { renderSettingsPage } from './Settings.js';
import { renderStudentManagement, renderAdminPage } from './Admin.js';

export function renderTopbar() {
  const user = state.currentUser;
  return `
    <header class="topbar">
      <div>
        <h1>${user.name}，${t('good_morning')}</h1>
        <p>${user.role === 'teacher' ? '' : (user.className ? user.className + ' · ' : '')}${new Date().toLocaleDateString(JSON.parse(localStorage.getItem('buiSettings') || '{}').language === 'en-US' ? 'en-US' : 'zh-HK', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>
      <div class="profile-chip">
        ${renderIcon('user')}
        <span>${user.id}</span>
      </div>
    </header>
  `;
}

export function renderShell() {
  const user = state.currentUser;
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-lockup compact">
          <img src="/math-app/images/logo.png" class="brand-mark" alt="校徽" />
          <div>
            <div class="school-name">杯澳公立學校</div>
            <div class="platform-name">Learning Hub</div>
          </div>
        </div>
        <nav class="side-nav" aria-label="主要功能">
          <button class="${state.activeView === 'dashboard' ? 'active' : ''}" data-view="dashboard">${renderIcon('math')} ${t('nav_home')}</button>
          ${user.role === 'teacher' ? `<button class="${state.activeView === 'students' ? 'active' : ''}" data-view="students">${renderIcon('user')} ${t('nav_students')}</button>` : ''}
          <button class="${state.activeView === 'modules' ? 'active' : ''}" data-view="modules">${renderIcon('board')} ${t('nav_modules')}</button>
          <button class="${state.activeView === 'settings' ? 'active' : ''}" data-view="settings">${renderIcon('settings')} ${t('nav_settings')}</button>
          ${user.role === 'teacher' ? `<button id="adminBtn" class="${state.activeView === 'admin' ? 'active' : ''}">${renderIcon('settings')} ${t('nav_admin')}</button>` : ''}
        </nav>
        <div class="sidebar-footer">
          <span>${user.role === 'teacher' ? t('teacher_mode') : t('student_mode')}</span>
          <button id="logoutBtn">${renderIcon('logout')} ${t('logout')}</button>
        </div>
      </aside>
      <main class="main-panel">
        ${renderTopbar()}
        ${state.activeView === 'dashboard' ? renderDashboard() : ''}
        ${state.activeView === 'students' && state.currentUser.role === 'teacher' ? renderStudentManagement() : ''}
        ${state.activeView === 'modules' ? renderModulesPage() : ''}
        ${state.activeView === 'settings' ? renderSettingsPage() : ''}
        ${state.activeView === 'admin' ? renderAdminPage() : ''}
      </main>
    </div>
  `;
}
