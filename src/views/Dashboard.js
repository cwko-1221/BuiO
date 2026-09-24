import { t, currentLanguage } from '../i18n.js';
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
    ? `<div class="sso-status ok">${renderIcon('check')} ${t('math_sso_ok')}</div>`
    : '';

  return `
    <section class="hero-board">
      <div class="hero-copy">
        <h2>${t('today_advice')}</h2>
        <p>${t('student_advice_desc')}</p>
        ${renderHomeworkReminder()}
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

function renderHomeworkReminder() {
  const pending = state.homeworkPending || [];
  const history = state.homeworkHistory || [];
  if (!pending.length && !history.length) {
    return `<div class="homework-reminder clear">${renderIcon('check')} ${t('homework_clear')}</div>`;
  }
  return `<div class="homework-reminders">
    ${pending.length ? `<div class="homework-reminder pending">
      <strong>${t('homework_pending', { count: pending.length })}</strong>
      ${renderHomeworkReminderList(pending, 'homework_pending_more')}
    </div>` : ''}
    ${history.length ? `<div class="homework-reminder history">
      <strong>${t('homework_history', { count: history.length })}</strong>
      ${renderHomeworkReminderList(history, 'homework_history_more')}
    </div>` : ''}
  </div>`;
}

function renderHomeworkReminderList(items, moreKey) {
  const renderItems = rows => `<ul>${rows.map(item => `<li>${escapeReminder(item.date)} · ${escapeReminder(item.subjectName || item.subject)} · ${escapeReminder(item.homework)}</li>`).join('')}</ul>`;
  const visible = items.slice(0, 5);
  const remaining = items.slice(5);
  return `${renderItems(visible)}${remaining.length ? `<details class="homework-reminder-more"><summary>${t(moreKey, { count: remaining.length })}</summary>${renderItems(remaining)}</details>` : ''}`;
}

function escapeReminder(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
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
            <div class="session-meta">${t('session_meta', { room: s.roomCode, time: formatTime(s.startTime) })}</div>
          </div>
          <button class="primary-action session-join-btn" data-session-id="${s.teacherId}">
            ${renderIcon('board')} ${t('join_class')}
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(currentLanguage(), { hour: '2-digit', minute: '2-digit' });
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
            ? `<button class="danger-action" id="endSessionBtn">${renderIcon('door')} ${t('end_board')}</button>
               <button class="secondary-action" id="rejoinBoardBtn">${renderIcon('board')} ${t('rejoin_board')}</button>`
            : `<button class="primary-action" id="openBoardBtn">${renderIcon('board')} ${t('open_board')}</button>`
          }
        </div>
        ${mySession ? `
          <div class="active-session-badge">
            ${renderIcon('check')} ${t('class_live')} · ${t('room')}${mySession.roomCode} · ${formatTime(mySession.startTime)} ${t('open_class')}
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
