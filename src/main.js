import { MATH_QUIZ_URL, MATH_DASHBOARD_URL, WHITEBOARD_BASE, MODULES, iconSvg } from './config.js';
import { state, updateState } from './store.js';
import { t, I18N } from './i18n.js';
import { checkSession, clearSession, fetchActiveSessions, getActiveSessions, endTeacherSession, fetchStudentsList, loginApi } from './services.js';
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
  if (!rows.length) throw new Error('檔案沒有資料');

  const headers = rows[0].map(getStudentField);
  if (!headers.includes('studentId') || !headers.includes('name')) {
    throw new Error('找不到「學號」和「姓名」欄位，請使用下載範本');
  }

  return rows.slice(1)
    .map((row, index) => {
      const student = { rowNumber: index + 2 };
      headers.forEach((field, columnIndex) => {
        if (field) student[field] = String(row[columnIndex] ?? '').trim();
      });
      student.studentId = String(student.studentId || '').trim().toUpperCase();
      student.password = String(student.password || '123456').trim() || '123456';
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
    throw new Error('只支援 .xlsx 或 .csv；請把舊式 .xls 另存為 .xlsx');
  }
  if (!window.ExcelJS) {
    throw new Error('Excel 解析工具未能載入，請重新整理頁面');
  }

  const workbook = new window.ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('Excel 沒有工作表');

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
        <tr><th>列</th><th>學號</th><th>姓名</th><th>班級</th><th>班號</th><th>中文</th><th>英文</th><th>數學</th></tr>
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
  if (!window.ExcelJS) {
    alert('Excel 工具未能載入，請重新整理頁面。');
    return;
  }
  const workbook = new window.ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('學生名單');
  worksheet.addRow(['學號', '姓名', '密碼', '班級', '班號', '中文分組', '英文分組', '數學分組']);
  worksheet.addRow(['S007', '陳小文', '123456', 'P4', '7', 'A組', 'B組', 'A組']);
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
  link.download = '學生批量匯入範本.xlsx';
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
      window.open(MATH_DASHBOARD_URL, '_blank');
    } else {
      window.open(MATH_QUIZ_URL, '_blank');
    }
    setTimeout(() => { updateState({ mathSsoStatus: '' }); render(); }, 2000);

  } else if (moduleId === 'report') {
    // 考評報告模組（老師專用）
    window.open('/report.html', '_blank');

  } else if (moduleId === 'chinese') {
    window.open('/chinese', '_blank');

  } else if (moduleId === 'english') {
    window.open('/english', '_blank');

  } else if (moduleId === 'whiteboard') {
    if (role === 'teacher') {
      const url = `${WHITEBOARD_BASE}/class-teacher?room=${encodeURIComponent(user.name)}`;
      window.open(url, '_blank');
      render();
      // The whiteboard tab takes a moment to connect via WebSocket and register
      // the session server-side. Probe a few times so the dashboard button flips
      // to "結束白板課堂" without waiting for the 3s polling tick.
      [600, 1500, 3000].forEach(ms => setTimeout(() => {
        if (!state.loggedIn) return;
        fetchActiveSessions(() => { if (state.loggedIn) render(); });
      }, ms));
    } else {
      const sessions = getActiveSessions();
      if (sessions.length === 0) {
        alert('目前沒有老師正在開課，請稍後再試。');
      } else {
        const s = sessions[0];
        const url = `${WHITEBOARD_BASE}/class-student?room=${encodeURIComponent(s.roomCode)}&name=${encodeURIComponent(user.name)}`;
        window.open(url, '_blank');
      }
    }
  }
}

function joinTeacherSession(session) {
  const user = state.currentUser;
  const url = `${WHITEBOARD_BASE}/class-student?room=${encodeURIComponent(session.roomCode)}&name=${encodeURIComponent(user.name)}`;
  window.open(url, '_blank');
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
          loginLoading: false
        });
        render();
      } else {
        updateState({ loginError: data.message || '登入失敗', loginLoading: false });
        render();
      }
    } catch (err) {
      updateState({ loginError: '連線失敗，請確認伺服器正在運行。', loginLoading: false });
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

  // Admin tab — backend already enforces teacher role on every admin endpoint
  document.getElementById('adminBtn')?.addEventListener('click', () => {
    state.activeView = 'admin';
    state.studentsLoaded = false;
    render();
  });

  // 學生升級
  document.getElementById('upgradeStudentsBtn')?.addEventListener('click', async () => {
    if (!confirm('⚠️ 確定要一鍵升級所有學生班級嗎？(例如 P4 會升級為 P5，P6 會變成 Graduated)。此動作無法復原！')) return;
    
    const btn = document.getElementById('upgradeStudentsBtn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `${renderIcon('loader')} 升級中...`;
    
    try {
      const res = await fetch('/api/auth/upgrade-students', { 
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 ' + data.message);
        await fetchStudentsList();
        render();
      } else {
        alert('❌ 升級失敗：' + data.message);
      }
    } catch (err) {
      alert('❌ 連線錯誤');
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
        alert('🎉 學生新增成功！');
        await fetchStudentsList();
        render();
      } else {
        err.textContent = data.message || '新增失敗';
        err.style.display = 'block';
        btn.disabled = false;
      }
    } catch (error) {
      err.textContent = '連線錯誤';
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

    showBatchMessage(`正在讀取 ${file.name}...`);
    try {
      pendingBatchStudents = await parseStudentFile(file);
      if (!pendingBatchStudents.length) {
        throw new Error('檔案內沒有可匯入的學生資料');
      }
      renderBatchPreview(pendingBatchStudents);
      showBatchMessage(`已讀取 ${pendingBatchStudents.length} 筆資料，請確認預覽後按「匯入學生」。`);
    } catch (error) {
      showBatchMessage(error.message || '無法讀取檔案', true);
    }
  });

  document.getElementById('importStudentsBtn')?.addEventListener('click', async () => {
    if (!pendingBatchStudents.length) return;
    const button = document.getElementById('importStudentsBtn');
    button.disabled = true;
    showBatchMessage(`正在匯入 ${pendingBatchStudents.length} 名學生...`);

    try {
      const response = await fetch('/api/auth/register-students-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ students: pendingBatchStudents })
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || '匯入失敗');
      }

      const skippedSummary = data.skipped?.length
        ? `；略過 ${data.skipped.length} 筆：${data.skipped.slice(0, 3).map(item => `第 ${item.rowNumber} 列 ${item.reason}`).join('、')}`
        : '';
      alert(`${data.message}${skippedSummary}`);
      pendingBatchStudents = [];
      await fetchStudentsList();
      render();
    } catch (error) {
      showBatchMessage(error.message || '匯入失敗', true);
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
        alert('🎉 教師新增成功！');
        await fetchStudentsList();
        render();
      } else {
        err.textContent = data.message || '新增失敗';
        err.style.display = 'block';
        btn.disabled = false;
      }
    } catch (error) {
      err.textContent = '連線錯誤';
      err.style.display = 'block';
      btn.disabled = false;
    }
  });

  // 學生管理：刪除
  document.querySelectorAll('.delete-student-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sid = btn.dataset.id;
      if (!confirm(`確定要永久刪除學生 ${sid} 嗎？此動作無法復原！`)) return;
      
      btn.disabled = true;
      try {
        const res = await fetch(`/api/auth/delete-student/${sid}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ 帳號已刪除');
          await fetchStudentsList();
        render();
        } else {
          alert('刪除失敗: ' + (data.message || '未知錯誤'));
          btn.disabled = false;
        }
      } catch (err) {
        alert('連線錯誤');
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
          alert('更新失敗: ' + (data.message || '未知錯誤'));
          e.target.value = originalValue; // 回復原本的值
        }
      } catch (err) {
        alert('連線錯誤');
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
    window.open(url, '_blank');
  });

  // 老師：結束課堂
  document.getElementById('endSessionBtn')?.addEventListener('click', () => {
    if (confirm('確定要結束白板課堂嗎？學生將無法再加入。')) {
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

// 啟動時先檢查 Session，再渲染
checkSession().then((loggedIn) => {
  if (!loggedIn) render();
});
// 同時先渲染登入頁（Session 檢查完成後會自動更新）
render();
