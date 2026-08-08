import { t } from '../i18n.js';
import { state } from '../store.js';
import { MODULES } from '../config.js';
import { renderIcon } from './Login.js';

export function renderModulesPage() {
  return `
    <section class="section-head">
      <div>
        <h2>${t('all_modules_title')}</h2>
        <p>${t('all_modules_desc')}</p>
      </div>
    </section>
    <div class="module-grid modules-page">
      ${MODULES.map(renderModuleCard).join('')}
    </div>
  `;
}

export function renderModuleCard(module) {
  const user = state.currentUser;
  if (!module.roleAccess.includes(user.role)) return '';
  if (module.id === 'homework' && user.role === 'student' && !state.homeworkAccess) return '';
  const disabled = module.disabled;
  return `
    <article class="module-card ${module.accent} ${disabled ? 'disabled' : ''}">
      <div class="module-icon">${renderIcon(module.icon)}</div>
      <div class="module-copy">
        <div class="module-kicker">${module.shortName}</div>
        <h3>${module.id === 'homework' ? module.name : t(module.name)}</h3>
        <p>${module.id === 'homework' ? module.description : t(module.description)}</p>
      </div>
      <div class="module-meta">
        ${module.metric ? `<span>${t(module.metric)}</span>` : ''}
        <strong>${module.id === 'homework' ? module.status : t(module.status)}</strong>
      </div>
      <button class="module-action" ${disabled ? 'disabled' : ''} data-open-module="${module.id}">
        ${module.disabled ? t('module_chinese_metric') : '進入模組'}
      </button>
    </article>
  `;
}
