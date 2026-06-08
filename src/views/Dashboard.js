import { t } from '../i18n.js';
import { state, updateState } from '../store.js';
import { MODULES } from '../config.js';
import { renderIcon } from './Login.js';
import { renderModuleCard } from './Modules.js';
import { getActiveSessions } from '../services.js'; // We need to export this from main.js or services.js

export function renderDashboard() {
  return state.currentUser.role === 'teacher' ? renderTeacherDashboard() : renderStudentDashboard();
}

function renderStudentDashboard() {
  const sessions = getActiveSessions(); // Fix: Export from services.js or store.js
  const mathStatusHtml = state.mathSsoStatus === 'ok'
    ? `<div class="sso-status ok">${renderIcon('check')} 數學練習已在新分頁開啟（同帳號免登入）</div>`
    : '';

  return `
    <section class="hero-board">
      <div class="hero-copy">
        <h2>${t('today_advice')}</h2>
        <p>${t('student_advice_desc')}</p>
        ${mathStatusHtml}
        <div class="action-row">
          <button class="primary-action" id="openMathBtn">${renderIcon('math')} ${t('start_math')}</button>
        </div>
      </div>
    </section>

    <section class="section-head">
      <div>
        <h2>${t('board_class')}</h2>
        <p>${t('board_class_desc')}</p>
      </div>
    </section>
    ${renderStudentSessionPanel(sessions)}

    <section class="section-head" style="margin-top:2rem">
      <div>
        <h2>${t('my_modules')}</h2>
        <p>${t('my_modules_desc')}${JSON.parse(localStorage.getItem('buiSettings') || '{}').roomCode || state.currentUser?.name || t('no_room')}</p>
      </div>
    </section>
    <div class="module-grid">
      ${MODULES.map(renderModuleCard).join('')}
    </div>
  `;
}

function renderStudentSessionPanel(sessions) {
  if (sessions.length === 0) {
    return `
      <div class="session-empty">
        ${renderIcon('clock')}
        <p>${t('no_teacher_live')}<br><span>${t('teacher_board_desc')}</span></p>
      </div>
    `;
  }
  return `
    <div class="session-list">
      ${sessions.map(s => `
        <div class="session-card">
          <div class="session-info">
            <div class="session-teacher">${renderIcon('user')} ${s.teacherName}</div>
            <div class="session-meta">房間：${s.roomCode} · ${formatTime(s.startTime)} 開課</div>
          </div>
          <button class="primary-action session-join-btn" data-session-id="${s.teacherId}">
            ${renderIcon('board')} 加入課堂
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('zh-HK', { hour: '2-digit', minute: '2-digit' });
}

function renderTeacherDashboard() {
  if (!state.studentsLoaded) {
    import('./Admin.js').then(module => module.fetchStudentsListWrapper());
  }

  const user = state.currentUser;
  const sessions = getActiveSessions();
  const mySession = sessions.find(s => s.teacherName === user.name);

  return `
    <section class="hero-board teacher">
      <div class="hero-copy">
        <h2>${t('teacher_welcome_title')}</h2>
        <p>${t('teacher_welcome_desc')}</p>
        <div class="action-row">
          ${mySession
            ? `<button class="danger-action" id="endSessionBtn">${renderIcon('door')} 結束白板課堂</button>
               <button class="secondary-action" id="rejoinBoardBtn">${renderIcon('board')} 重新進入白板</button>`
            : `<button class="primary-action" id="openBoardBtn">${renderIcon('board')} 開啟白板課堂</button>`
          }
        </div>
        ${mySession ? `
          <div class="active-session-badge">
            ${renderIcon('check')} 課堂進行中 · ${t('room')}${mySession.roomCode} · ${formatTime(mySession.startTime)} ${t('open_class')}
          </div>
        ` : ''}
      </div>
      <div class="class-snapshot">
        <div><strong>${state.studentsList.filter(s => s.role !== 'teacher').length}</strong><span>${t('students_count_span')}</span></div>
      </div>
    </section>

    <section class="section-head" style="margin-top:2rem">
      <div>
        <h2>${t('module_management')}</h2>
      </div>
    </section>
    <div class="module-grid compact-grid">
      ${MODULES.filter(m => m.roleAccess.includes('teacher')).map(renderModuleCard).join('')}
    </div>
  `;
}
