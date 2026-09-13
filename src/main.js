
// ExcelJS is ~926KB and only teachers importing or exporting a spreadsheet ever need it, yet
// it was loaded eagerly on the portal for every student on every visit. Fetch it on demand.
let excelJsPromise = null;
function loadExcelJs() {
  if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
  if (!excelJsPromise) {
    excelJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/exceljs.min.js';
      script.onload = () => resolve(window.ExcelJS);
      script.onerror = () => { excelJsPromise = null; reject(new Error(t('excel_load_failed'))); };
      document.head.appendChild(script);
    });
  }
  return excelJsPromise;
}
import { MATH_QUIZ_URL, MATH_DASHBOARD_URL, WHITEBOARD_BASE, MODULES, iconSvg } from './config.js';
import { state, updateState } from './store.js';
import { t, I18N, currentLanguage } from './i18n.js';
import { checkSession, clearSession, fetchActiveSessions, getActiveSessions, endTeacherSession, fetchStudentsList, fetchSubjectTeacherSettings, loginApi, fetchHomeworkInfo } from './services.js';
import { renderTopbar, renderShell } from './views/Shell.js';
import { renderDashboard } from './views/Dashboard.js';
import { renderModulesPage } from './views/Modules.js';
import { renderStudentManagement, renderAdminPage } from './views/Admin.js';
import { renderLogin, renderIcon } from './views/Login.js';

let pendingBatchStudents = [];

const STUDENT_COLUMN_ALIASES = {
  studentId: ['學號', '學生編號', '帳號', 'studentid', 'student id', 'id'],
  name: ['姓名', '學生姓名', 'name', 'student name'],
  password: ['密碼', '預設密碼', 'password'],
  className: ['班級', '班別', 'class', 'classname', 'class name'],
  classNo: ['班號', '座號', 'classno', 'class no', 'class number'],
  chineseGroup: ['中文分組', '中文組別', 'chinesegroup', 'chinese group'],
  englishGroup: ['英文分組', '英文組別', 'englishgroup', 'english group'],
  mathGroup: ['數學分組', '數學組別', 'mathgroup', 'math group'],
};

function normalizeHeader(value) {
  return String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[_-]+/g, ' ');
}

function getStudentField(header) {
  const normalized = normalizeHeader(header);
  return Object.entries(STUDENT_COLUMN_ALIASES)
    .find(([, aliases]) => aliases.some(alias => normalizeHeader(alias) === normalized))?.[0];
}

function rowsToStudents(rows) {
  if (!rows.length) throw new Error(t('file_no_data'));

  const headers = rows[0].map(getStudentField);
  if (!headers.includes('studentId') || !headers.includes('name')) {
    throw new Error(t('file_missing_columns'));
  }

  return rows.slice(1)
    .map((row, index) => {
      const student = { rowNumber: index + 2 };
      headers.forEach((field, columnIndex) => {
        if (field) student[field] = String(row[columnIndex] ?? '').trim();
      });
      student.studentId = String(student.studentId || '').trim().toUpperCase();
      student.password = String(student.password || '').trim();
      student.passwordProvided = Boolean(student.password);
      return student;
    })
    .filter(student => [
      student.studentId,
      student.name,
      student.className,
      student.classNo,
      student.chineseGroup,
      student.englishGroup,
      student.mathGroup
    ].some(value => String(value || '').trim()));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index++;
      row.push(cell);
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

async function parseStudentFile(file) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') {
    return rowsToStudents(parseCsv(await file.text()));
  }
  if (extension !== 'xlsx') {
    throw new Error(t('file_unsupported'));
  }
  await loadExcelJs();

  const workbook = new window.ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error(t('excel_no_sheet'));

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, row => {
    const values = [];
    for (let column = 1; column <= row.cellCount; column++) {
      const value = row.getCell(column).value;
      values.push(value && typeof value === 'object' && 'text' in value ? value.text : value ?? '');
    }
    rows.push(values);
  });
  return rowsToStudents(rows);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function showBatchMessage(message, isError = false) {
  const element = document.getElementById('batchImportMessage');
  if (!element) return;
  element.hidden = false;
  element.classList.toggle('error', isError);
  element.textContent = message;
}

function renderBatchPreview(students) {
  const preview = document.getElementById('batchImportPreview');
  const importButton = document.getElementById('importStudentsBtn');
  if (!preview || !importButton) return;

  preview.hidden = students.length === 0;
  importButton.disabled = students.length === 0;
  if (!students.length) {
    preview.innerHTML = '';
    return;
  }

  preview.innerHTML = `
    <table>
      <thead>
        <tr><th>${t('preview_col_row')}</th><th>${t('login_id_label')}</th><th>${t('form_name_label')}</th><th>${t('form_class_label')}</th><th>${t('form_classno_label')}</th><th>${t('col_chi')}</th><th>${t('col_eng')}</th><th>${t('col_math')}</th></tr>
      </thead>
      <tbody>
        ${students.slice(0, 50).map(student => `
          <tr>
            <td>${student.rowNumber}</td>
            <td>${escapeHtml(student.studentId)}</td>
            <td>${escapeHtml(student.name)}</td>
            <td>${escapeHtml(student.className)}</td>
            <td>${escapeHtml(student.classNo)}</td>
            <td>${escapeHtml(student.chineseGroup)}</td>
            <td>${escapeHtml(student.englishGroup)}</td>
            <td>${escapeHtml(student.mathGroup)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function downloadStudentTemplate() {
  await loadExcelJs();
  const workbook = new window.ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(t('template_sheet_name'));
  const english = currentLanguage() === 'en-US';
  worksheet.addRow(english
    ? ['studentId', 'name', 'password', 'class', 'classNo', 'chineseGroup', 'englishGroup', 'mathGroup']
    : ['學號', '姓名', '密碼', '班級', '班號', '中文分組', '英文分組', '數學分組']);
  worksheet.addRow(['S007', english ? 'Chan Siu Man' : '陳小文', '123456', 'P4', '7', 'A組', 'B組', 'A組']);
  worksheet.getRow(1).font = { bold: true };
  worksheet.columns = [
    { width: 14 }, { width: 16 }, { width: 14 }, { width: 10 },
    { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 }
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }));
  const link = document.createElement('a');
  link.href = url;
  link.download = t('template_file_name');
  link.click();
  URL.revokeObjectURL(url);
}

function saveTeacherSession(teacher) {
  fetchActiveSessions(sessions => {
    if (state.loggedIn) render(); // 有更新時重新渲染畫面
  });
}

// Poll active whiteboard sessions only on views that show them, and only when tab visible.
setInterval(() => {
  if (!state.loggedIn) return;
  if (document.visibilityState !== 'visible') return;
  if (state.activeView !== 'dashboard' && state.activeView !== 'modules') return;
  fetchActiveSessions(() => {
    if (state.loggedIn) render();
  });
}, 3000);

// When the portal tab regains focus (e.g. after opening the whiteboard in a
// new tab), fetch immediately so the teacher's "開啟白板課堂" button flips to
// "結束白板課堂" without waiting for the next 3s tick.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (!state.loggedIn) return;
  if (state.activeView !== 'dashboard' && state.activeView !== 'modules') return;
  fetchActiveSessions(() => { if (state.loggedIn) render(); });
});

// =============================================
// 開啟模組（深度整合版）
// =============================================
async function openModule(moduleId, mode) {
  const user = state.currentUser;
  const role = mode || user.role;

  if (moduleId === 'math') {
    updateState({ mathSsoStatus: 'ok' });
    render();
    if (role === 'teacher') {
      window.location.href = MATH_DASHBOARD_URL;
    } else {
      window.location.href = MATH_QUIZ_URL;
    }
    setTimeout(() => { updateState({ mathSsoStatus: '' }); render(); }, 2000);

  } else if (moduleId === 'homework') {
    window.location.href = '/homework';

  } else if (moduleId === 'report') {
    // 考評報告模組（老師專用）
    window.location.href = '/report.html';

  } else if (moduleId === 'chinese') {
    window.location.href = '/chinese';

  } else if (moduleId === 'english') {
    window.location.href = '/english';

  } else if (moduleId === 'phonics') {
    window.location.href = '/phonics';

  } else if (moduleId === 'science-lab') {
    window.location.href = '/science-lab';

  } else if (moduleId === 'pet') {
    window.location.href = '/pet';

  } else if (moduleId === 'game') {
    window.location.href = '/games';

  } else if (moduleId === 'whiteboard') {
    if (role === 'teacher') {
      const url = `${WHITEBOARD_BASE}/class-teacher?room=${encodeURIComponent(user.name)}`;
      // Same-tab nav — teachers leave the portal until they close the class.
      window.location.href = url;
    } else {
      const sessions = getActiveSessions();
      if (sessions.length === 0) {
        alert(t('no_live_class_alert'));
      } else {
        const s = sessions[0];
        const url = `${WHITEBOARD_BASE}/class-student?room=${encodeURIComponent(s.roomCode)}&name=${encodeURIComponent(user.name)}`;
        window.location.href = url;
      }
    }
  }
}

function joinTeacherSession(session) {
  const user = state.currentUser;
  const url = `${WHITEBOARD_BASE}/class-student?room=${encodeURIComponent(session.roomCode)}&name=${encodeURIComponent(user.name)}`;
  window.location.href = url;
}

// =============================================
// 綁定事件
// =============================================
function bindEvents() {
  // 登入表單 — 呼叫統一的 /api/auth/login
  document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // 必須在 render() 之前讀取數值，否則 DOM 會被重置而讀到空值或預設值
    const inputId = document.getElementById('userIdInput').value.trim().toUpperCase();
    const inputPw = document.getElementById('passwordInput').value;

    updateState({ loginError: '', loginLoading: true });
    render();

    try {
      const data = await loginApi(inputId, inputPw);

      if (data.success) {
        updateState({
          currentUser: {
            id: data.student.id,
            name: data.student.name,
            role: data.student.role,
            className: data.student.className || '',
            classNo: data.student.classNo || null,
            language: data.student.language || 'zh-HK',
          },
          loggedIn: true,
          loginLoading: false,
          adminUnlocked: false
        });
        await fetchHomeworkInfo();
        render();
      } else {
        updateState({ loginError: data.message || t('login_failed'), loginLoading: false });
        render();
      }
    } catch (err) {
      updateState({ loginError: t('connect_failed'), loginLoading: false });
      render();
    }
  });

  // 導航按鈕
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      updateState({ activeView: btn.dataset.view });
      if (state.activeView === 'students') updateState({ studentsLoaded: false }); // 強制重新讀取
      render();
    });
  });

  document.getElementById('adminBtn')?.addEventListener('click', async () => {
    state.activeView = 'admin';
    state.studentsLoaded = false;
    state.subjectTeachersLoaded = false;
    state.subjectTeachersLoading = false;
    render();
    try {
      const response = await fetch('/api/auth/admin-status', { credentials: 'include' });
      const data = await response.json();
      updateState({ adminUnlocked: Boolean(response.ok && data.unlocked) });
      render();
    } catch {
      updateState({ adminUnlocked: false });
      render();
    }
  });

  document.getElementById('adminUnlockForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.getElementById('adminUnlockBtn');
    const error = document.getElementById('adminUnlockError');
    button.disabled = true;
    error.style.display = 'none';
    try {
      const response = await fetch('/api/auth/unlock-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: document.getElementById('adminPassword').value }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || t('admin_pwd_wrong'));
      updateState({ adminUnlocked: true, studentsLoaded: false, subjectTeachersLoaded: false, subjectTeachersLoading: false });
      render();
    } catch (unlockError) {
      error.textContent = unlockError.message || t('admin_unlock_failed');
      error.style.display = 'block';
      button.disabled = false;
    }
  });

  document.getElementById('subjectTeacherYear')?.addEventListener('change', event => {
    updateState({ subjectTeacherYear: event.target.value, subjectTeachersLoaded: false, subjectTeachersLoading: false });
    render();
  });

  document.getElementById('subjectTeacherClass')?.addEventListener('change', event => {
    updateState({ subjectTeacherClass: event.target.value, subjectTeachersLoaded: false, subjectTeachersLoading: false });
    render();
  });

  document.querySelectorAll('.subject-teacher-save-one').forEach(button => {
    button.addEventListener('click', async event => {
      const saveButton = event.currentTarget;
      const select = [...document.querySelectorAll('.subject-teacher-select')]
        .find(item => item.dataset.subject === saveButton.dataset.subject);
      if (!select) return;

      const academicYear = state.subjectTeacherYear || state.currentAcademicYear;
      const className = state.subjectTeacherClass || 'P1';
      saveButton.disabled = true;
      saveButton.textContent = t('subject_teacher_saving');
      try {
        const response = await fetch('/api/homework/subject-teachers', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            academicYear,
            className,
            subject: saveButton.dataset.subject,
            teacherId: select.value,
          }),
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || t('subject_teacher_save_failed'));
        await fetchSubjectTeacherSettings(academicYear, className);
        alert(t('subject_teacher_saved'));
        render();
      } catch (error) {
        alert(error.message || t('subject_teacher_save_failed'));
        saveButton.disabled = false;
        saveButton.textContent = t('subject_teacher_save_one');
      }
    });
  });

  document.getElementById('saveSubjectTeachers')?.addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await fetch('/api/homework/subject-teachers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          academicYear: state.subjectTeacherYear || state.currentAcademicYear,
          className: state.subjectTeacherClass || 'P1',
          assignments: [...document.querySelectorAll('.subject-teacher-select')].map(select => ({
            subject: select.dataset.subject,
            teacherId: select.value,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || t('subject_teacher_save_failed'));
      await fetchSubjectTeacherSettings(state.subjectTeacherYear, state.subjectTeacherClass);
      alert(t('subject_teacher_saved'));
      render();
    } catch (error) {
      alert(error.message || t('subject_teacher_save_failed'));
      button.disabled = false;
    }
  });

  document.getElementById('studentAcademicYear')?.addEventListener('change', event => {
    updateState({ studentManagementYear: event.target.value, studentsLoaded: false });
    render();
  });

  // 學生升級
  document.getElementById('upgradeStudentsBtn')?.addEventListener('click', async () => {
    if (!confirm(t('confirm_upgrade'))) return;
    
    const btn = document.getElementById('upgradeStudentsBtn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `${renderIcon('loader')} ${t('upgrading')}`;
    
    try {
      const res = await fetch('/api/auth/upgrade-students', { 
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 ' + data.message);
        updateState({
          currentAcademicYear: data.currentAcademicYear,
          studentManagementYear: data.currentAcademicYear,
          studentsLoaded: false,
          subjectTeacherYear: data.currentAcademicYear,
          subjectTeachersLoaded: false,
          subjectTeachersLoading: false,
        });
        await fetchStudentsList(data.currentAcademicYear);
        render();
      } else {
        alert(t('upgrade_failed') + data.message);
      }
    } catch (err) {
      alert('❌ ' + t('connect_error'));
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  // 學生管理：新增學生
  document.getElementById('addStudentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('addStudentBtn');
    const err = document.getElementById('addStudentError');
    btn.disabled = true;
    err.style.display = 'none';

    try {
      const res = await fetch('/api/auth/register-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          studentId: document.getElementById('newStudentId').value.trim(),
          name: document.getElementById('newStudentName').value.trim(),
          password: document.getElementById('newStudentPw').value,
          className: document.getElementById('newStudentClass')?.value.trim() || '',
          classNo: document.getElementById('newStudentClassNo')?.value.trim() || '',
          chineseGroup: document.getElementById('newStudentChi')?.value.trim() || '',
          englishGroup: document.getElementById('newStudentEng')?.value.trim() || '',
          mathGroup: document.getElementById('newStudentMath')?.value.trim() || '',
          role: 'student'
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(t('student_added'));
        await fetchStudentsList();
        render();
      } else {
        err.textContent = data.message || t('add_failed');
        err.style.display = 'block';
        btn.disabled = false;
      }
    } catch (error) {
      err.textContent = t('connect_error');
      err.style.display = 'block';
      btn.disabled = false;
    }
  });

  document.getElementById('downloadStudentTemplateBtn')?.addEventListener('click', downloadStudentTemplate);

  document.getElementById('studentExcelInput')?.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    pendingBatchStudents = [];
    renderBatchPreview([]);
    if (!file) return;

    showBatchMessage(t('reading_file', { name: file.name }));
    try {
      pendingBatchStudents = await parseStudentFile(file);
      if (!pendingBatchStudents.length) {
        throw new Error(t('file_no_students'));
      }
      renderBatchPreview(pendingBatchStudents);
      showBatchMessage(t('read_ok_preview', { count: pendingBatchStudents.length }));
    } catch (error) {
      showBatchMessage(error.message || t('read_failed'), true);
    }
  });

  document.getElementById('importStudentsBtn')?.addEventListener('click', async () => {
    if (!pendingBatchStudents.length) return;
    const button = document.getElementById('importStudentsBtn');
    button.disabled = true;
    showBatchMessage(t('importing_students', { count: pendingBatchStudents.length }));

    try {
      const response = await fetch('/api/auth/register-students-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ students: pendingBatchStudents })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || t('import_failed'));
      }

      const skippedSummary = data.skipped?.length
        ? t('import_skipped', {
            count: data.skipped.length,
            rows: data.skipped.slice(0, 3)
              .map(item => t('import_skipped_row', { row: item.rowNumber, reason: item.reason }))
              .join(t('import_skipped_join')),
          })
        : '';
      alert(`${data.message}${skippedSummary}`);
      pendingBatchStudents = [];
      await fetchStudentsList();
      render();
    } catch (error) {
      showBatchMessage(error.message || t('import_failed'), true);
      button.disabled = false;
    }
  });

  // Admin 管理：新增老師
  document.getElementById('addTeacherForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('addTeacherBtn');
    const err = document.getElementById('addTeacherError');
    btn.disabled = true;
    err.style.display = 'none';

    try {
      const res = await fetch('/api/auth/register-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          studentId: document.getElementById('newTeacherId').value.trim(),
          name: document.getElementById('newTeacherName').value.trim(),
          password: document.getElementById('newTeacherPw').value,
          role: 'teacher'
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(t('teacher_added'));
        updateState({ subjectTeachersLoaded: false, subjectTeachersLoading: false });
        await fetchStudentsList();
        render();
      } else {
        err.textContent = data.message || t('add_failed');
        err.style.display = 'block';
        btn.disabled = false;
      }
    } catch (error) {
      err.textContent = t('connect_error');
      err.style.display = 'block';
      btn.disabled = false;
    }
  });

  // 學生管理：刪除
  document.querySelectorAll('.delete-student-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.id;
      if (!confirm(t('confirm_delete_student', { id: sid }))) return;
      
      btn.disabled = true;
      try {
        const res = await fetch(`/api/auth/delete-student/${sid}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
          alert(t('account_deleted'));
          updateState({ subjectTeachersLoaded: false, subjectTeachersLoading: false });
          await fetchStudentsList();
        render();
        } else {
          alert(t('delete_failed') + (data.message || t('unknown_error')));
          btn.disabled = false;
        }
      } catch (err) {
        alert(t('connect_error'));
        btn.disabled = false;
      }
    });
  });
  // 學生資料行內編輯
  document.querySelectorAll('.inline-edit').forEach(select => {
    select.addEventListener('change', async (e) => {
      const studentId = e.target.dataset.id;
      const field = e.target.dataset.field;
      const value = e.target.value;
      const originalValue = e.target.getAttribute('data-original-value') || '';
      
      e.target.disabled = true;
      try {
        const res = await fetch('/api/auth/update-student', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ studentId, field, value })
        });
        const data = await res.json();
        if (data.success) {
          // 更新本地狀態
          const student = state.studentsList.find(s => s.id === studentId);
          if (student) student[field] = value;
          e.target.setAttribute('data-original-value', value);
          if (field === 'className' || field === 'classNo') {
            await fetchStudentsList();
            render();
            return;
          }
        } else {
          alert(t('update_failed') + (data.message || t('unknown_error')));
          e.target.value = originalValue; // 回復原本的值
        }
      } catch (err) {
        alert(t('connect_error'));
        e.target.value = originalValue; // 回復原本的值
      } finally {
        e.target.disabled = false;
      }
    });
    // 儲存原始值以便失敗時回復
    select.setAttribute('data-original-value', select.value);
  });

  // 儲存設定
  document.getElementById('settingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const settings = {
      language: fd.get('language')
    };
    
    // 儲存到本地
    localStorage.setItem('buiSettings', JSON.stringify(settings));

    // 同步語言設定到資料庫
    if (state.loggedIn) {
      try {
        await fetch('/api/auth/language', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: settings.language })
        });
        state.currentUser.language = settings.language;
      } catch (err) {
        console.error('Failed to sync language to server', err);
      }
    }

    state.activeView = 'dashboard';
    render();
  });

  // 登出
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    state.loggedIn = false;
    state.currentUser = null;
    state.activeView = 'dashboard';
    state.mathSsoStatus = '';
    state.homeworkAccess = false;
    state.homeworkPending = [];
    state.homeworkPendingLoaded = false;
    state.adminUnlocked = false;
    state.studentsLoaded = false;
    clearSession();
    render();
  });

  // 開啟數學
  document.getElementById('openMathBtn')?.addEventListener('click', () => openModule('math'));

  // 老師：開啟白板
  document.getElementById('openBoardBtn')?.addEventListener('click', () => openModule('whiteboard', 'teacher'));

  // 老師：重新進入白板
  document.getElementById('rejoinBoardBtn')?.addEventListener('click', () => {
    const user = state.currentUser;
    const url = `${WHITEBOARD_BASE}/class-teacher?room=${encodeURIComponent(user.name)}`;
    window.location.href = url;
  });

  // 老師：結束課堂
  document.getElementById('endSessionBtn')?.addEventListener('click', () => {
    if (confirm(t('confirm_end_board'))) {
      endTeacherSession(state.currentUser.name);
      // 不需手動 render()，因為 endTeacherSession 完成後會 fetchActiveSessions 自動重繪
    }
  });

  // 學生：加入老師課堂
  document.querySelectorAll('[data-session-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sessions = getActiveSessions();
      const session = sessions.find(s => s.teacherId === btn.dataset.sessionId);
      if (session) joinTeacherSession(session);
    });
  });

  // 模組卡片按鈕
  document.querySelectorAll('[data-open-module]').forEach(btn => {
    btn.addEventListener('click', () => {
      const role = state.currentUser?.role || 'student';
      openModule(btn.dataset.openModule, role);
    });
  });
}

// 供其他模組呼叫用以觸發重新渲染
export function triggerRender() {
  render();
}

// =============================================
// 主渲染函數
// =============================================
function render() {
  document.getElementById('app').innerHTML = state.loggedIn ? renderShell() : renderLogin();
  bindEvents();
}

// index.html 已預先顯示 boot splash；等 checkSession 回來才 render，
// 避免已登入的學生先看到閃過的登入頁再切換到首頁。
checkSession().finally(() => render());
