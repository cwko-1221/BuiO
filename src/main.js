import { MATH_QUIZ_URL, MATH_DASHBOARD_URL, WHITEBOARD_BASE, MODULES, iconSvg } from './config.js';
import { state, updateState } from './store.js';
import { t, I18N } from './i18n.js';
import { checkSession, clearSession, fetchActiveSessions, endTeacherSession, fetchStudentsList, loginApi, addStudentApi, deleteStudentApi } from './services.js';

let activeSessionsCache = [];

function getActiveSessions() {
  return activeSessionsCache;
}

function saveTeacherSession(teacher) {
  fetchActiveSessions(sessions => {
    const newStr = JSON.stringify(sessions);
    const oldStr = JSON.stringify(activeSessionsCache);
    if (newStr !== oldStr) {
      activeSessionsCache = sessions;
      if (state.loggedIn) render(); // 有更新時重新渲染畫面
    }
  });
}

// 每 3 秒輪詢一次目前進行中的課堂，確保學生畫面即時更新
setInterval(() => {
  if (state.loggedIn) {
    fetchActiveSessions(sessions => {
      const newStr = JSON.stringify(sessions);
      const oldStr = JSON.stringify(activeSessionsCache);
      if (newStr !== oldStr) {
        activeSessionsCache = sessions;
        if (state.loggedIn) render();
      }
    });
  }
}, 3000);

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

  } else if (moduleId === 'whiteboard') {
    if (role === 'teacher') {
      saveTeacherSession(user);
      const url = `${WHITEBOARD_BASE}/teacher?room=${encodeURIComponent(user.name)}`;
      window.open(url, '_blank');
      render();
    } else {
      const sessions = getActiveSessions();
      if (sessions.length === 0) {
        alert('目前沒有老師正在開課，請稍後再試。');
      } else {
        const s = sessions[0];
        const url = `${WHITEBOARD_BASE}/student?room=${encodeURIComponent(s.roomCode)}&name=${encodeURIComponent(user.name)}`;
        window.open(url, '_blank');
      }
    }
  }
}

function joinTeacherSession(session) {
  const user = state.currentUser;
  const url = `${WHITEBOARD_BASE}/student?room=${encodeURIComponent(session.roomCode)}&name=${encodeURIComponent(user.name)}`;
  window.open(url, '_blank');
}

import { renderTopbar, renderShell } from './views/Shell.js';
import { renderDashboard } from './views/Dashboard.js';
import { renderModulesPage } from './views/Modules.js';
import { renderStudentManagement, renderAdminPage } from './views/Admin.js';

// =============================================
// 渲染：設定頁
// =============================================
function renderSettingsPage() {
  const settings = JSON.parse(localStorage.getItem('buiSettings') || '{}');
  return `
    <section class="section-head">
      <div>
        <h2>${t('settings_title')}</h2>
        <p>${t('settings_desc')}</p>
      </div>
    </section>
    <div class="settings-layout">
      <form id="settingsForm" class="settings-form">
        <label>
          ${t('ui_language')}
          <select name="language" style="padding:10px; border:1px solid var(--line); border-radius:8px; font:inherit; background:var(--surface); width:100%; margin-top:8px;">
            <option value="zh-HK" ${(!state.currentUser?.language && !settings.language || (state.currentUser?.language || settings.language) === 'zh-HK') ? 'selected' : ''}>${t('lang_zh')}</option>
            <option value="en-US" ${(state.currentUser?.language || settings.language) === 'en-US' ? 'selected' : ''}>${t('lang_en')}</option>
          </select>
        </label>
        <button class="primary-action" type="submit">
          ${renderIcon('check')} ${t('save_settings')}
        </button>
      </form>
      <div class="settings-intro">
        <h3>${t('integration_status')}</h3>
        <p>${t('integration_status_desc')}</p>
      </div>
    </div>
  `;
}le="background:var(--teal); color:white; padding:3px 8px; border-radius:12px; font-size:0.8em; display:inline-block;">${t('role_teacher')}</span>
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

// =============================================
// 渲染：設定頁
// =============================================
function renderSettingsPage() {
  const settings = JSON.parse(localStorage.getItem('buiSettings') || '{}');
  return `
    <section class="section-head">
      <div>
        <h2>${t('settings_title')}</h2>
        <p>${t('settings_desc')}</p>
      </div>
    </section>
    <div class="settings-layout">
      <form id="settingsForm" class="settings-form">
        <label>
          ${t('ui_language')}
          <select name="language" style="padding:10px; border:1px solid var(--line); border-radius:8px; font:inherit; background:var(--surface); width:100%; margin-top:8px;">
            <option value="zh-HK" ${(!state.currentUser?.language && !settings.language || (state.currentUser?.language || settings.language) === 'zh-HK') ? 'selected' : ''}>${t('lang_zh')}</option>
            <option value="en-US" ${(state.currentUser?.language || settings.language) === 'en-US' ? 'selected' : ''}>${t('lang_en')}</option>
          </select>
        </label>
        <button class="primary-action" type="submit">
          ${renderIcon('check')} ${t('save_settings')}
        </button>
      </form>
      <div class="settings-intro">
        <h3>${t('integration_status')}</h3>
        <p>${t('integration_status_desc')}</p>
      </div>
    </div>
  `;
}

// =============================================
// 渲染：模組卡片
// =============================================
function renderModuleCard(module) {
  const user = state.currentUser;
  const disabled = module.disabled || !module.roleAccess.includes(user.role);
  return `
    <article class="module-card ${module.accent} ${disabled ? 'disabled' : ''}">
      <div class="module-icon">${renderIcon(module.icon)}</div>
      <div class="module-copy">
        <div class="module-kicker">${module.shortName}</div>
        <h3>${t(module.name)}</h3>
        <p>${t(module.description)}</p>
      </div>
      <div class="module-meta">
        ${module.metric ? `<span>${t(module.metric)}</span>` : ''}
        <strong>${t(module.status)}</strong>
      </div>
      <button class="module-action" ${disabled ? 'disabled' : ''} data-open-module="${module.id}">
        ${module.disabled ? t('module_chinese_metric') : '進入模組'}
      </button>
    </article>
  `;
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

  // Admin 按鈕
  document.getElementById('adminBtn')?.addEventListener('click', () => {
    const pw = prompt('請輸入 Admin 密碼：');
    if (pw === 'Admin') {
      state.activeView = 'admin';
      state.adminUnlocked = true;
      state.studentsLoaded = false;
      render();
    } else if (pw !== null) {
      alert('密碼錯誤！');
    }
  });

  // 學生升級
  document.getElementById('upgradeStudentsBtn')?.addEventListener('click', async () => {
    if (!confirm('⚠️ 確定要一鍵升級所有學生班級嗎？(例如 P4 會升級為 P5，P6 會變成 Graduated)。此動作無法復原！')) return;
    
    const btn = document.getElementById('upgradeStudentsBtn');
    btn.disabled = true;
    const originalText = btn.innerHTML;
    btn.innerHTML = `${renderIcon('loader')} 升級中...`;
    
    try {
      const res = await fetch('/api/auth/upgrade-students', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert('🎉 ' + data.message);
        fetchStudentsList();
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
          chineseGroup: document.getElementById('newStudentChi')?.value.trim() || '',
          englishGroup: document.getElementById('newStudentEng')?.value.trim() || '',
          mathGroup: document.getElementById('newStudentMath')?.value.trim() || '',
          role: 'student'
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 學生新增成功！');
        fetchStudentsList();
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
          role: 'teacher',
          adminPassword: state.adminUnlocked ? 'Admin' : undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 教師新增成功！');
        fetchStudentsList();
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
        const url = state.adminUnlocked
          ? `/api/auth/delete-student/${sid}?adminPassword=Admin`
          : `/api/auth/delete-student/${sid}`;
        const res = await fetch(url, {
          method: 'DELETE',
          credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ 帳號已刪除');
          fetchStudentsList();
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
    const url = `${WHITEBOARD_BASE}/teacher?room=${encodeURIComponent(user.name)}`;
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
