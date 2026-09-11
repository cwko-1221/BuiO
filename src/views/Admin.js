import { t } from '../i18n.js';
import { state, updateState } from '../store.js';
import { renderIcon } from './Login.js';
import { fetchStudentsList } from '../services.js';
import { triggerRender } from '../main.js';

export async function fetchStudentsListWrapper() {
  updateState({ studentsLoaded: true });
  const success = await fetchStudentsList();
  if (success) {
    triggerRender();
  }
}

// The A/B group codes are database values, so the option keeps the stored
// code and only its label follows the reader's language.
function groupLabel(code) {
  if (!code) return t('group_unset');
  return code === 'A組' ? t('group_a') : code === 'B組' ? t('group_b') : code;
}

export function renderStudentManagement() {
  if (!state.studentsLoaded) {
    fetchStudentsListWrapper();
  }
  
  const selectedYear = state.studentManagementYear || state.currentAcademicYear;
  const isCurrentYear = selectedYear === state.currentAcademicYear;

  return `
    <section class="section-head" style="margin-top:2rem; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h2>${t('student_mgmt_title')}</h2>
        <p>${t('student_mgmt_desc')} · ${t('current_year_label')}<strong>${state.currentAcademicYear}</strong></p>
      </div>
      <label style="display:grid; gap:6px; color:var(--muted); font-weight:700;">
        ${t('view_year')}
        <select id="studentAcademicYear" style="min-width:150px; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--surface);">
          ${state.academicYears.map(year => `<option value="${year}" ${year === selectedYear ? 'selected' : ''}>${year}${year === state.currentAcademicYear ? t('year_current_suffix') : ''}</option>`).join('')}
        </select>
      </label>
    </section>

    ${!isCurrentYear ? `<div class="glass-card" style="margin-bottom:1.25rem; padding:1rem 1.25rem; color:var(--muted);">${t('viewing_history', { year: selectedYear })}</div>` : ''}

    ${isCurrentYear ? `
    <div class="glass-card" style="margin-bottom:2rem; padding:1.5rem;">
      <h3>${t('add_student_title')}</h3>
      <form id="addStudentForm" class="login-form" style="max-width: 400px; margin-top:1rem;">
        <label>${t('login_id_label')}<input id="newStudentId" required placeholder="" autocomplete="off"></label>
        <label>${t('form_name_label')}<input id="newStudentName" required placeholder="" autocomplete="off"></label>
        <div class="student-fields-grid">
          <label style="margin-bottom:0">${t('form_class_label')}<input id="newStudentClass" list="classOptions" placeholder="" autocomplete="off"></label>
          <label style="margin-bottom:0">${t('form_classno_label')}<input id="newStudentClassNo" type="number" min="1" max="99" inputmode="numeric" placeholder="" autocomplete="off"></label>
          <label style="margin-bottom:0">${t('form_chi_group')}<input id="newStudentChi" list="groupOptions" placeholder="" autocomplete="off"></label>
          <label style="margin-bottom:0">${t('form_eng_group')}<input id="newStudentEng" list="groupOptions" placeholder="" autocomplete="off"></label>
          <label style="margin-bottom:0">${t('form_math_group')}<input id="newStudentMath" list="groupOptions" placeholder="" autocomplete="off"></label>
        </div>
        <datalist id="classOptions">
          <option value="P1">
          <option value="P2">
          <option value="P3">
          <option value="P4">
          <option value="P5">
          <option value="P6">
        </datalist>
        <datalist id="groupOptions">
          <option value="A組" label="${t('group_a')}">
          <option value="B組" label="${t('group_b')}">
        </datalist>
        <label>${t('form_pwd_label')}<input id="newStudentPw" required value="123456" autocomplete="off"></label>
        <button type="submit" class="primary-action" id="addStudentBtn">${renderIcon('plus')} ${t('form_add_btn')}</button>
        <div id="addStudentError" style="color:var(--coral); margin-top:0.5rem; display:none;"></div>
      </form>
    </div>

    <div class="glass-card batch-import-card">
      <div class="batch-import-head">
        <div>
          <h3>${t('batch_title')}</h3>
          <p>${t('batch_desc')}</p>
        </div>
        <button type="button" id="downloadStudentTemplateBtn" class="secondary-action">${t('batch_template_btn')}</button>
      </div>
      <div class="batch-import-controls">
        <label class="file-picker">
          <span>${t('batch_pick_file')}</span>
          <input type="file" id="studentExcelInput" accept=".xlsx,.csv" />
        </label>
        <button type="button" id="importStudentsBtn" class="primary-action" disabled>
          ${renderIcon('plus')} ${t('batch_import_btn')}
        </button>
      </div>
      <div id="batchImportMessage" class="batch-import-message" hidden></div>
      <div id="batchImportPreview" class="batch-import-preview" hidden></div>
    </div>
    ` : ''}

    <section class="work-panel">
      <h2>${t('students_list_title')}</h2>
      <div class="student-table">
        ${state.studentsList.filter(s => s.role !== 'teacher').map(s => `
          <div class="student-row management-student-row">
            <div>
              <div style="display:flex; align-items:baseline; gap:8px;">
                <strong style="font-size:1.05em;">${s.name}</strong>
                <span style="color:var(--text-muted); font-size:0.9em;">${s.id}</span>
              </div>
              <div style="margin-top:6px;">
                <span style="background:var(--violet); color:white; padding:3px 8px; border-radius:12px; font-size:0.8em; display:inline-block;">${t('role_student')}</span>
              </div>
            </div>
            <div class="student-edit-fields">
              <label style="margin:0; display:flex; align-items:center; gap:6px; color:var(--muted);">
                ${t('form_class_label')}
                <select class="inline-edit" data-id="${s.id}" data-field="className" ${isCurrentYear ? '' : 'disabled'} style="padding:6px; border:1px solid var(--line); border-radius:6px; min-width:80px; background:var(--surface);">
                  ${['', 'P1','P2','P3','P4','P5','P6','Graduated'].map(o => `<option value="${o}" ${s.className === o ? 'selected' : ''}>${o || t('group_unset')}</option>`).join('')}
                </select>
              </label>
              <label style="margin:0; display:flex; align-items:center; gap:6px; color:var(--muted);">
                ${t('form_classno_label')}
                <input class="inline-edit class-number-input" data-id="${s.id}" data-field="classNo" type="number" min="1" max="99" inputmode="numeric" value="${s.classNo || ''}" placeholder="--" ${isCurrentYear ? '' : 'disabled'}>
              </label>
              <label style="margin:0; display:flex; align-items:center; gap:6px; color:var(--muted);">
                ${t('col_chi')}
                <select class="inline-edit" data-id="${s.id}" data-field="chineseGroup" ${isCurrentYear ? '' : 'disabled'} style="padding:6px; border:1px solid var(--line); border-radius:6px; min-width:80px; background:var(--surface);">
                  ${['', 'A組','B組'].map(o => `<option value="${o}" ${s.chineseGroup === o ? 'selected' : ''}>${groupLabel(o)}</option>`).join('')}
                </select>
              </label>
              <label style="margin:0; display:flex; align-items:center; gap:6px; color:var(--muted);">
                ${t('col_eng')}
                <select class="inline-edit" data-id="${s.id}" data-field="englishGroup" ${isCurrentYear ? '' : 'disabled'} style="padding:6px; border:1px solid var(--line); border-radius:6px; min-width:80px; background:var(--surface);">
                  ${['', 'A組','B組'].map(o => `<option value="${o}" ${s.englishGroup === o ? 'selected' : ''}>${groupLabel(o)}</option>`).join('')}
                </select>
              </label>
              <label style="margin:0; display:flex; align-items:center; gap:6px; color:var(--muted);">
                ${t('col_math')}
                <select class="inline-edit" data-id="${s.id}" data-field="mathGroup" ${isCurrentYear ? '' : 'disabled'} style="padding:6px; border:1px solid var(--line); border-radius:6px; min-width:80px; background:var(--surface);">
                  ${['', 'A組','B組'].map(o => `<option value="${o}" ${s.mathGroup === o ? 'selected' : ''}>${groupLabel(o)}</option>`).join('')}
                </select>
              </label>
            </div>
            <div>${isCurrentYear ? `<button class="danger-action delete-student-btn" data-id="${s.id}">${t('delete_btn')}</button>` : ''}</div>
          </div>
        `).join('') || `<div style="padding:1rem; color:var(--text-muted)">${t('no_students')}</div>`}
      </div>
    </section>
  `;
}

export function renderAdminPage() {
  if (!state.adminUnlocked) {
    return `
      <section class="section-head" style="margin-top:2rem;">
        <div><h2>${t('admin_title')}</h2><p>${t('admin_locked_desc')}</p></div>
      </section>
      <div class="glass-card" style="max-width:460px; padding:1.75rem;">
        <form id="adminUnlockForm" class="login-form">
          <label>${t('admin_pwd_label')}<input id="adminPassword" type="password" inputmode="numeric" maxlength="6" required autocomplete="current-password"></label>
          <button type="submit" id="adminUnlockBtn" class="primary-action">${t('admin_unlock_btn')}</button>
          <div id="adminUnlockError" style="color:var(--coral); margin-top:0.5rem; display:none;"></div>
        </form>
      </div>`;
  }

  if (!state.studentsLoaded) {
    fetchStudentsListWrapper();
  }
  
  return `
    <section class="section-head" style="margin-top:2rem; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h2>${t('admin_title')}</h2>
        <p>${t('admin_desc')}</p>
      </div>
    </section>

    <div class="glass-card" style="margin-bottom:2rem; padding:1.5rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
      <div>
        <h3 style="margin:0 0 0.35rem;">${t('year_rollover_title')}</h3>
        <p style="margin:0; color:var(--muted);">${t('year_rollover_desc', { year: state.currentAcademicYear })}</p>
      </div>
      <button id="upgradeStudentsBtn" class="primary-action" style="background:var(--violet); color:white;">${renderIcon('spark')} ${t('year_rollover_btn')}</button>
    </div>
    
    <div class="glass-card" style="margin-bottom:2rem; padding:1.5rem;">
      <h3>${t('add_teacher_title')}</h3>
      <form id="addTeacherForm" class="login-form" style="max-width: 400px; margin-top:1rem;">
        <label>${t('login_id_label')}<input id="newTeacherId" required placeholder="" autocomplete="off"></label>
        <label>${t('form_name_label')}<input id="newTeacherName" required placeholder="" autocomplete="off"></label>
        <label>${t('form_pwd_label')}<input id="newTeacherPw" required value="123456" autocomplete="off"></label>
        <button type="submit" class="primary-action" id="addTeacherBtn">${renderIcon('plus')} ${t('form_add_btn')}</button>
        <div id="addTeacherError" style="color:var(--coral); margin-top:0.5rem; display:none;"></div>
      </form>
    </div>

    <section class="work-panel">
      <h2>${t('students_list_title')}</h2>
      <div class="student-table">
        ${state.studentsList.filter(s => s.role === 'teacher').map(s => `
          <div class="student-row" style="grid-template-columns: 1fr auto;">
            <div>
              <div style="display:flex; align-items:baseline; gap:8px;">
                <strong style="font-size:1.05em;">${s.name}</strong>
                <span style="color:var(--text-muted); font-size:0.9em;">${s.id}</span>
              </div>
              <div style="margin-top:6px;">
                <span style="background:var(--teal); color:white; padding:3px 8px; border-radius:12px; font-size:0.8em; display:inline-block;">${t('role_teacher')}</span>
              </div>
            </div>
            <div>
              <button class="danger-action delete-student-btn" data-id="${s.id}">${t('delete_btn')}</button>
            </div>
          </div>
        `).join('') || `<div style="padding:1rem; color:var(--text-muted)">${t('no_teachers')}</div>`}
      </div>
    </section>
  `;
}
