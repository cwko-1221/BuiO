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

export function renderStudentManagement() {
  if (!state.studentsLoaded) {
    fetchStudentsListWrapper();
  }
  
  return `
    <section class="section-head" style="margin-top:2rem; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h2>${t('student_mgmt_title')}</h2>
        <p>${t('student_mgmt_desc')}</p>
      </div>
      <button id="upgradeStudentsBtn" class="primary-action" style="background:var(--violet); color:white;">${renderIcon('spark')} 一鍵升級</button>
    </section>
    
    <div class="glass-card" style="margin-bottom:2rem; padding:1.5rem;">
      <h3>${t('add_student_title')}</h3>
      <form id="addStudentForm" class="login-form" style="max-width: 400px; margin-top:1rem;">
        <label>${t('login_id_label')}<input id="newStudentId" required placeholder="" autocomplete="off"></label>
        <label>${t('form_name_label')}<input id="newStudentName" required placeholder="" autocomplete="off"></label>
        <div class="student-fields-grid">
          <label style="margin-bottom:0">${t('form_class_label')}<input id="newStudentClass" list="classOptions" placeholder="" autocomplete="off"></label>
          <label style="margin-bottom:0">中文分組<input id="newStudentChi" list="groupOptions" placeholder="" autocomplete="off"></label>
          <label style="margin-bottom:0">英文分組<input id="newStudentEng" list="groupOptions" placeholder="" autocomplete="off"></label>
          <label style="margin-bottom:0">數學分組<input id="newStudentMath" list="groupOptions" placeholder="" autocomplete="off"></label>
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
          <option value="A組">
          <option value="B組">
        </datalist>
        <label>${t('form_pwd_label')}<input id="newStudentPw" required value="123456" autocomplete="off"></label>
        <button type="submit" class="primary-action" id="addStudentBtn">${renderIcon('plus')} ${t('form_add_btn')}</button>
        <div id="addStudentError" style="color:var(--coral); margin-top:0.5rem; display:none;"></div>
      </form>
    </div>

    <div class="glass-card batch-import-card">
      <div class="batch-import-head">
        <div>
          <h3>Excel 批量新增學生</h3>
          <p>支援 .xlsx 及 .csv。學號和姓名為必填；空白密碼會使用 123456。</p>
        </div>
        <button type="button" id="downloadStudentTemplateBtn" class="secondary-action">下載 Excel 範本</button>
      </div>
      <div class="batch-import-controls">
        <label class="file-picker">
          <span>選擇學生名單</span>
          <input type="file" id="studentExcelInput" accept=".xlsx,.csv" />
        </label>
        <button type="button" id="importStudentsBtn" class="primary-action" disabled>
          ${renderIcon('plus')} 匯入學生
        </button>
      </div>
      <div id="batchImportMessage" class="batch-import-message" hidden></div>
      <div id="batchImportPreview" class="batch-import-preview" hidden></div>
    </div>

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
                班級 
                <select class="inline-edit" data-id="${s.id}" data-field="className" style="padding:6px; border:1px solid var(--line); border-radius:6px; min-width:80px; background:var(--surface);">
                  ${['', 'P1','P2','P3','P4','P5','P6','Graduated'].map(o => `<option value="${o}" ${s.className === o ? 'selected' : ''}>${o || '未設定'}</option>`).join('')}
                </select>
              </label>
              <label style="margin:0; display:flex; align-items:center; gap:6px; color:var(--muted);">
                中文 
                <select class="inline-edit" data-id="${s.id}" data-field="chineseGroup" style="padding:6px; border:1px solid var(--line); border-radius:6px; min-width:80px; background:var(--surface);">
                  ${['', 'A組','B組'].map(o => `<option value="${o}" ${s.chineseGroup === o ? 'selected' : ''}>${o || '未設定'}</option>`).join('')}
                </select>
              </label>
              <label style="margin:0; display:flex; align-items:center; gap:6px; color:var(--muted);">
                英文 
                <select class="inline-edit" data-id="${s.id}" data-field="englishGroup" style="padding:6px; border:1px solid var(--line); border-radius:6px; min-width:80px; background:var(--surface);">
                  ${['', 'A組','B組'].map(o => `<option value="${o}" ${s.englishGroup === o ? 'selected' : ''}>${o || '未設定'}</option>`).join('')}
                </select>
              </label>
              <label style="margin:0; display:flex; align-items:center; gap:6px; color:var(--muted);">
                數學 
                <select class="inline-edit" data-id="${s.id}" data-field="mathGroup" style="padding:6px; border:1px solid var(--line); border-radius:6px; min-width:80px; background:var(--surface);">
                  ${['', 'A組','B組'].map(o => `<option value="${o}" ${s.mathGroup === o ? 'selected' : ''}>${o || '未設定'}</option>`).join('')}
                </select>
              </label>
            </div>
            <div>
              <button class="danger-action delete-student-btn" data-id="${s.id}">${t('delete_btn')}</button>
            </div>
          </div>
        `).join('') || `<div style="padding:1rem; color:var(--text-muted)">${t('no_students')}</div>`}
      </div>
    </section>
  `;
}

export function renderAdminPage() {
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
