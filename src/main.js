// =============================================
// 本地路徑（所有 App 整合在同一個伺服器）
// =============================================
const MATH_QUIZ_URL = '/quiz.html';
const MATH_DASHBOARD_URL = '/dashboard.html';
const WHITEBOARD_BASE = '/whiteboard';

// =============================================
// 模組定義
// =============================================
const MODULES = [
  {
    id: 'math',
    name: '數學練習',
    shortName: 'Math',
    description: '個人化四則運算練習，根據學生弱項自動出題。',
    accent: 'mint',
    icon: 'math',
    status: '已啟用',
    roleAccess: ['student', 'teacher']
  },
  {
    id: 'whiteboard',
    name: '互動白板',
    shortName: 'Board',
    description: '老師開啟課堂後，學生可即時加入書寫協作。',
    accent: 'coral',
    icon: 'board',
    metric: '課堂房間可即時建立',
    status: '等待老師開課',
    roleAccess: ['student', 'teacher']
  },
  {
    id: 'chinese',
    name: '中文學習',
    shortName: 'Chinese',
    description: '閱讀、詞語、寫作與朗讀練習預留模組。',
    accent: 'sky',
    icon: 'book',
    url: '',
    metric: '即將推出',
    status: '未啟用',
    disabled: true,
    roleAccess: ['student', 'teacher']
  },
  {
    id: 'english',
    name: '英文學習',
    shortName: 'English',
    description: '拼讀、聆聽、口說與閱讀任務預留模組。',
    accent: 'violet',
    icon: 'spark',
    url: '',
    metric: '即將推出',
    status: '未啟用',
    disabled: true,
    roleAccess: ['student', 'teacher']
  }
];

// =============================================
// SVG 圖示
// =============================================
const iconSvg = {
  math: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10M7 12h10M7 17h6"/><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></svg>`,
  board: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H4z"/><path d="M8 21h8M12 16v5"/><path d="m8 12 3-3 2 2 3-4"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 4v13a3 3 0 0 0 3 3"/></svg>`,
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

// =============================================
// 狀態管理
// =============================================
const state = {
  loggedIn: false,
  currentUser: null,
  activeView: 'dashboard',
  loginError: '',
  loginLoading: false,
  mathSsoStatus: '',
  studentsList: [],
  studentsLoaded: false,
};

// 嘗試從 Session 恢復登入狀態
async function checkSession() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.student) {
        state.currentUser = {
          id: data.student.id,
          name: data.student.name,
          role: data.student.role,
          className: 'P4A',
        };
        state.loggedIn = true;
        render();
      }
    }
  } catch { /* not logged in */ }
}

function clearSession() {
  fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => {});
}

// =============================================
// 白板課堂管理（改由伺服器狀態與輪詢）
// =============================================
let activeSessionsCache = [];

async function fetchActiveSessions() {
  try {
    const res = await fetch('/api/whiteboard/sessions');
    const data = await res.json();
    if (data.success) {
      const newStr = JSON.stringify(data.sessions);
      const oldStr = JSON.stringify(activeSessionsCache);
      if (newStr !== oldStr) {
        activeSessionsCache = data.sessions;
        if (state.loggedIn) render(); // 有更新時重新渲染畫面
      }
    }
  } catch (e) {}
}

function getActiveSessions() {
  return activeSessionsCache;
}

function saveTeacherSession(teacher) {
  fetchActiveSessions();
}

function endTeacherSession(roomId) {
  fetch('/api/whiteboard/sessions/end', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId })
  }).then(() => fetchActiveSessions());
}

// 每 3 秒輪詢一次目前進行中的課堂，確保學生畫面即時更新
setInterval(() => {
  if (state.loggedIn) fetchActiveSessions();
}, 3000);

// =============================================
// 開啟模組（深度整合版）
// =============================================
async function openModule(moduleId, mode) {
  const user = state.currentUser;
  const role = mode || user.role;

  if (moduleId === 'math') {
    // 同一個伺服器，Session 已共享，直接跳轉即可
    state.mathSsoStatus = 'ok';
    render();
    if (role === 'teacher') {
      window.open(MATH_DASHBOARD_URL, '_blank');
    } else {
      window.open(MATH_QUIZ_URL, '_blank');
    }
    setTimeout(() => { state.mathSsoStatus = ''; render(); }, 2000);

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

// =============================================
// 渲染：圖示
// =============================================
function renderIcon(name) {
  return iconSvg[name] || iconSvg.spark;
}

// =============================================
// 渲染：登入頁
// =============================================
function renderLogin() {
  return `
    <main class="login-shell">
      <section class="login-visual" aria-label="平台介紹">
        <div class="brand-lockup">
          <img src="/images/logo.png" class="brand-mark" alt="校徽" />
          <div>
            <div class="school-name">杯澳公立學校</div>
            <div class="platform-name">個人化學習平台</div>
          </div>
        </div>
        <div class="learning-map" aria-hidden="true">
          <div class="map-line"></div>
          <div class="map-node node-a">數學</div>
          <div class="map-node node-b">白板</div>
          <div class="map-node node-c">中文</div>
          <div class="map-node node-d">英文</div>
        </div>
        <h1>一個登入入口，連接學生每天需要的學習工具。</h1>
        <p>第一版先整合數學練習和互動白板，日後可以繼續加入更多模組。</p>
      </section>

      <section class="login-panel" aria-label="登入">
        <div class="panel-topline"></div>
        <h2>登入平台</h2>
        <p>輸入你的學號／教師號和密碼登入。</p>
        ${state.loginError ? `<div class="login-error">${renderIcon('lock')} ${state.loginError}</div>` : ''}
        <form id="loginForm" class="login-form">
          <label>
            學號 / 教師號
            <input id="userIdInput" placeholder="例如 S001 或 T001" autocomplete="username" required />
          </label>
          <label>
            密碼
            <input id="passwordInput" type="password" value="123456" placeholder="輸入密碼" autocomplete="current-password" required />
          </label>
          <button class="primary-action" type="submit" ${state.loginLoading ? 'disabled' : ''}>
            ${state.loginLoading ? renderIcon('loader') + ' 登入中…' : renderIcon('door') + ' 進入平台'}
          </button>
        </form>
        <p class="hint-text">學生帳號：S001–S005 ／ 密碼：123456<br>教師帳號：T001 ／ 密碼：123456</p>
      </section>
    </main>
  `;
}

// =============================================
// 渲染：頂部欄
// =============================================
function renderTopbar() {
  const user = state.currentUser;
  return `
    <header class="topbar">
      <div>
        <h1>${user.name}，早晨</h1>
        <p>${user.role === 'teacher' ? '' : (user.className ? user.className + ' · ' : '')}${new Date().toLocaleDateString('zh-HK', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      </div>
      <div class="profile-chip">
        ${renderIcon('user')}
        <span>${user.id}</span>
      </div>
    </header>
  `;
}

// =============================================
// 渲染：主殼層
// =============================================
function renderShell() {
  const user = state.currentUser;
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand-lockup compact">
          <img src="/images/logo.png" class="brand-mark" alt="校徽" />
          <div>
            <div class="school-name">杯澳公立學校</div>
            <div class="platform-name">Learning Hub</div>
          </div>
        </div>
        <nav class="side-nav" aria-label="主要功能">
          <button class="${state.activeView === 'dashboard' ? 'active' : ''}" data-view="dashboard">${renderIcon('math')} 首頁</button>
          ${user.role === 'teacher' ? `<button class="${state.activeView === 'students' ? 'active' : ''}" data-view="students">${renderIcon('user')} 學生管理</button>` : ''}
          <button class="${state.activeView === 'modules' ? 'active' : ''}" data-view="modules">${renderIcon('board')} 模組</button>
          <button class="${state.activeView === 'settings' ? 'active' : ''}" data-view="settings">${renderIcon('settings')} 設定</button>
          <button id="adminBtn" class="${state.activeView === 'admin' ? 'active' : ''}">${renderIcon('settings')} Admin</button>
        </nav>
        <div class="sidebar-footer">
          <span>${user.role === 'teacher' ? '老師模式' : '學生模式'}</span>
          <button id="logoutBtn">${renderIcon('logout')} 登出</button>
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

// =============================================
// 渲染：Dashboard
// =============================================
function renderDashboard() {
  return state.currentUser.role === 'teacher' ? renderTeacherDashboard() : renderStudentDashboard();
}

// =============================================
// 渲染：學生 Dashboard
// =============================================
function renderStudentDashboard() {
  const sessions = getActiveSessions();
  const mathStatusHtml = state.mathSsoStatus === 'ok'
    ? `<div class="sso-status ok">${renderIcon('check')} 數學練習已在新分頁開啟（同帳號免登入）</div>`
    : '';

  return `
    <section class="hero-board">
      <div class="hero-copy">
        <h2>今日學習建議</h2>
        <p>先完成數學練習，再查看老師是否開啟白板課堂。</p>
        ${mathStatusHtml}
        <div class="action-row">
          <button class="primary-action" id="openMathBtn">${renderIcon('math')} 開始數學練習</button>
        </div>
      </div>
    </section>

    <section class="section-head">
      <div>
        <h2>白板課堂</h2>
        <p>選擇老師的課堂加入，你的名字會自動帶入，毋需再輸入。</p>
      </div>
    </section>
    ${renderStudentSessionPanel(sessions)}

    <section class="section-head" style="margin-top:2rem">
      <div>
        <h2>我的學習模組</h2>
        <p>選擇要進入的 App。預設房間：${JSON.parse(localStorage.getItem('buiSettings') || '{}').roomCode || state.currentUser?.name || '無'}</p>
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
        <p>目前沒有老師正在開課<br><span>老師開啟白板後會自動顯示在這裡</span></p>
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

// =============================================
// 渲染：老師 Dashboard
// =============================================
function renderTeacherDashboard() {
  if (!state.studentsLoaded) {
    fetchStudentsList();
  }

  const user = state.currentUser;
  const sessions = getActiveSessions();
  const mySession = sessions.find(s => s.teacherName === user.name);

  return `
    <section class="hero-board teacher">
      <div class="hero-copy">
        <h2>班級學習總覽</h2>
        <p>快速查看學生狀態與開啟白板課堂。</p>
        <div class="action-row">
          ${mySession
            ? `<button class="danger-action" id="endSessionBtn">${renderIcon('door')} 結束白板課堂</button>
               <button class="secondary-action" id="rejoinBoardBtn">${renderIcon('board')} 重新進入白板</button>`
            : `<button class="primary-action" id="openBoardBtn">${renderIcon('board')} 開啟白板課堂</button>`
          }
        </div>
        ${mySession ? `
          <div class="active-session-badge">
            ${renderIcon('check')} 課堂進行中 · 房間：${mySession.roomCode} · ${formatTime(mySession.startTime)} 開始
          </div>
        ` : ''}
      </div>
      <div class="class-snapshot">
        <div><strong>${state.studentsList.filter(s => s.role !== 'teacher').length}</strong><span>學生</span></div>
      </div>
    </section>



    <section class="section-head" style="margin-top:2rem">
      <div>
        <h2>模組管理</h2>
        <p>第一版先保留數學和白板，之後可在同一位置加入更多學習 App。</p>
      </div>
    </section>
    <div class="module-grid compact-grid">
      ${MODULES.filter(m => m.roleAccess.includes('teacher')).map(renderModuleCard).join('')}
    </div>
  `;
}

// =============================================
// 渲染：模組頁
// =============================================
function renderModulesPage() {
  return `
    <section class="section-head">
      <div>
        <h2>全部學習模組</h2>
        <p>平台以模組方式擴充。新增 App 時只需要加入名稱、描述、連結和權限。</p>
      </div>
    </section>
    <div class="module-grid modules-page">
      ${MODULES.map(renderModuleCard).join('')}
    </div>
  `;
}

// =============================================
// 渲染：學生管理 (Teacher)
// =============================================
async function fetchStudentsList() {
  state.studentsLoaded = true;
  try {
    const res = await fetch('/api/stats/teacher/students', { credentials: 'include' });
    const data = await res.json();
    if (data.success) {
      state.studentsList = data.students || [];
      render();
    }
  } catch (e) {
    console.error('Fetch students error', e);
  }
}

function renderStudentManagement() {
  if (!state.studentsLoaded) {
    fetchStudentsList();
  }
  
  return `
    <section class="section-head" style="margin-top:2rem; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h2>學生管理</h2>
        <p>新增或刪除學生帳號，資料將與所有模組同步。</p>
      </div>
      <button id="upgradeStudentsBtn" class="primary-action" style="background:var(--violet); color:white;">${renderIcon('spark')} 一鍵升級</button>
    </section>
    
    <div class="glass-card" style="margin-bottom:2rem; padding:1.5rem;">
      <h3>新增學生</h3>
      <form id="addStudentForm" class="login-form" style="max-width: 400px; margin-top:1rem;">
        <label>學號<input id="newStudentId" required placeholder="" autocomplete="off"></label>
        <label>姓名<input id="newStudentName" required placeholder="" autocomplete="off"></label>
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px;">
          <label style="margin-bottom:0">班級<input id="newStudentClass" list="classOptions" placeholder="" autocomplete="off"></label>
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
        <label>密碼<input id="newStudentPw" required value="123456" autocomplete="off"></label>
        <button type="submit" class="primary-action" id="addStudentBtn">${renderIcon('plus')} 確認新增</button>
        <div id="addStudentError" style="color:var(--coral); margin-top:0.5rem; display:none;"></div>
      </form>
    </div>

    <section class="work-panel">
      <h2>學生列表</h2>
      <div class="student-table">
        ${state.studentsList.filter(s => s.role !== 'teacher').map(s => `
          <div class="student-row" style="grid-template-columns: 200px 1fr auto; align-items: center;">
            <div>
              <div style="display:flex; align-items:baseline; gap:8px;">
                <strong style="font-size:1.05em;">${s.name}</strong>
                <span style="color:var(--text-muted); font-size:0.9em;">${s.id}</span>
              </div>
              <div style="margin-top:6px;">
                <span style="background:var(--violet); color:white; padding:3px 8px; border-radius:12px; font-size:0.8em; display:inline-block;">學生</span>
              </div>
            </div>
            <div style="display:flex; gap:15px; align-items:center; flex-wrap:wrap; font-size:0.95em;">
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
              <button class="danger-action delete-student-btn" data-id="${s.id}">刪除</button>
            </div>
          </div>
        `).join('') || '<div style="padding:1rem; color:var(--text-muted)">無學生資料</div>'}
      </div>
    </section>
  `;
}

// =============================================
// 渲染：Admin 頁面 (教師管理)
// =============================================
function renderAdminPage() {
  if (!state.studentsLoaded) {
    fetchStudentsList();
  }
  
  return `
    <section class="section-head" style="margin-top:2rem; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <h2>Admin 控制台</h2>
        <p>管理教師帳號。</p>
      </div>
    </section>
    
    <div class="glass-card" style="margin-bottom:2rem; padding:1.5rem;">
      <h3>新增老師</h3>
      <form id="addTeacherForm" class="login-form" style="max-width: 400px; margin-top:1rem;">
        <label>教師編號<input id="newTeacherId" required placeholder="" autocomplete="off"></label>
        <label>姓名<input id="newTeacherName" required placeholder="" autocomplete="off"></label>
        <label>密碼<input id="newTeacherPw" required value="123456" autocomplete="off"></label>
        <button type="submit" class="primary-action" id="addTeacherBtn">${renderIcon('plus')} 確認新增</button>
        <div id="addTeacherError" style="color:var(--coral); margin-top:0.5rem; display:none;"></div>
      </form>
    </div>

    <section class="work-panel">
      <h2>老師列表</h2>
      <div class="student-table">
        ${state.studentsList.filter(s => s.role === 'teacher').map(s => `
          <div class="student-row" style="grid-template-columns: 1fr auto;">
            <div>
              <div style="display:flex; align-items:baseline; gap:8px;">
                <strong style="font-size:1.05em;">${s.name}</strong>
                <span style="color:var(--text-muted); font-size:0.9em;">${s.id}</span>
              </div>
              <div style="margin-top:6px;">
                <span style="background:var(--teal); color:white; padding:3px 8px; border-radius:12px; font-size:0.8em; display:inline-block;">老師</span>
              </div>
            </div>
            <div>
              <button class="danger-action delete-student-btn" data-id="${s.id}">刪除</button>
            </div>
          </div>
        `).join('') || '<div style="padding:1rem; color:var(--text-muted)">無老師資料</div>'}
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
        <h2>平台設定</h2>
        <p>深度整合模式：所有 App 運行在同一個伺服器。</p>
      </div>
    </section>
    <div class="settings-layout">
      <form id="settingsForm" class="settings-form">
        <label>
          數學 App 路徑 (math)
          <input name="math" value="${settings.math || MATH_QUIZ_URL}" />
        </label>
        <label>
          互動白板路徑 (whiteboard)
          <input name="whiteboard" value="${settings.whiteboard || WHITEBOARD_BASE}" />
        </label>
        <label>
          預設房間號 (roomCode)
          <input name="roomCode" value="${settings.roomCode || state.currentUser?.name || 'P4A-2026'}" />
        </label>
        <button class="primary-action" type="submit">
          ${renderIcon('check')} 儲存設定
        </button>
      </form>
      <div class="settings-intro">
        <h3>整合狀態</h3>
        <p>所有模組已整合至同一個伺服器，學生帳號統一管理，登入一次即可使用所有功能。</p>
        <div class="hint-box">
          <span><strong>帳號資料庫：</strong>data/db.json<br>
          <strong>新增學生：</strong>老師登入後可在數學面板新增<br>
          <strong>白板伺服器：</strong>Socket.io (Port ${location.port || 3000})</span>
        </div>
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
        <h3>${module.name}</h3>
        <p>${module.description}</p>
      </div>
      <div class="module-meta">
        <span>${module.metric}</span>
        <strong>${module.status}</strong>
      </div>
      <button class="module-action" ${disabled ? 'disabled' : ''} data-open-module="${module.id}">
        ${module.disabled ? '即將推出' : '進入模組'}
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

    state.loginError = '';
    state.loginLoading = true;
    render();

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ studentId: inputId, password: inputPw })
      });
      const data = await res.json();

      if (data.success) {
        state.currentUser = {
          id: data.student.id,
          name: data.student.name,
          role: data.student.role,
          className: 'P4A',
        };
        state.loggedIn = true;
        state.loginLoading = false;
        render();
      } else {
        state.loginError = data.message || '登入失敗';
        state.loginLoading = false;
        render();
      }
    } catch (err) {
      state.loginError = '連線失敗，請確認伺服器正在運行。';
      state.loginLoading = false;
      render();
    }
  });

  // 導航按鈕
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.activeView = btn.dataset.view;
      if (state.activeView === 'students') state.studentsLoaded = false; // 強制重新讀取
      render();
    });
  });

  // Admin 按鈕
  document.getElementById('adminBtn')?.addEventListener('click', () => {
    const pw = prompt('請輸入 Admin 密碼：');
    if (pw === 'Admin') {
      state.activeView = 'admin';
      if (state.activeView === 'admin') state.studentsLoaded = false;
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
          role: 'teacher'
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
        const res = await fetch(`/api/auth/delete-student/${sid}`, {
          method: 'DELETE',
          credentials: 'include'
        });
        const data = await res.json();
        if (data.success) {
          alert('✅ 學生已刪除');
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
  document.getElementById('settingsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const settings = {
      math: fd.get('math'),
      whiteboard: fd.get('whiteboard'),
      roomCode: fd.get('roomCode')
    };
    localStorage.setItem('buiSettings', JSON.stringify(settings));
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

// =============================================
// 主渲染函數
// =============================================
function render() {
  document.getElementById('app').innerHTML = state.loggedIn ? renderShell() : renderLogin();
  bindEvents();
}

// 啟動時先檢查 Session，再渲染
checkSession().then(() => {
  if (!state.loggedIn) render();
});
// 同時先渲染登入頁（Session 檢查完成後會自動更新）
render();
