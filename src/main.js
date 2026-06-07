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
    name: 'module_math_name',
    shortName: 'Math',
    description: 'module_math_desc',
    accent: 'mint',
    icon: 'math',
    status: 'module_math_status',
    roleAccess: ['student', 'teacher']
  },
  {
    id: 'whiteboard',
    name: 'module_wb_name',
    shortName: 'Board',
    description: 'module_wb_desc',
    accent: 'coral',
    icon: 'board',
    metric: 'module_wb_metric',
    status: 'module_wb_status',
    roleAccess: ['student', 'teacher']
  },
  {
    id: 'chinese',
    name: 'module_chinese_name',
    shortName: 'Chinese',
    description: 'module_chinese_desc',
    accent: 'sky',
    icon: 'book',
    url: '',
    metric: 'module_chinese_metric',
    status: 'module_chinese_status',
    disabled: true,
    roleAccess: ['student', 'teacher']
  },
  {
    id: 'english',
    name: 'module_english_name',
    shortName: 'English',
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
// 語言與翻譯 (i18n)
// =============================================
const I18N = {
  'zh-HK': {
    'good_morning': '早晨',
    'student_mode': '學生模式',
    'teacher_mode': '老師模式',
    'nav_home': '首頁',
    'nav_students': '學生管理',
    'nav_modules': '模組',
    'nav_settings': '設定',
    'nav_admin': 'Admin',
    'logout': '登出',
    'today_advice': '今日學習建議',
    'student_advice_desc': '先完成數學練習，再查看老師是否開啟白板課堂。',
    'start_math': '開始數學練習',
    'math_sso_ok': '數學練習已在新分頁開啟（同帳號免登入）',
    'board_class': '白板課堂',
    'board_class_desc': '選擇老師的課堂加入，你的名字會自動帶入，毋需再輸入。',
    'my_modules': '我的學習模組',
    'my_modules_desc': '選擇要進入的 App。預設房間：',
    'no_room': '無',
    'no_teacher_live': '目前沒有老師正在開課',
    'teacher_board_desc': '老師開啟白板後會自動顯示在這裡',
    'join_class': '加入課堂',
    'room': '房間：',
    'open_class': '開課',
    'login_title': '登入平台',
    'login_subtitle': '輸入你的學號／教師號和密碼登入。',
    'login_id_label': '學號 / 教師號',
    'login_pwd_label': '密碼',
    'login_btn_loading': '登入中…',
    'login_btn': '進入平台',
    'teacher_welcome_title': '歡迎回來，老師',
    'teacher_welcome_desc': '請從左側導覽列選擇您要進行的管理項目，或進入模組查看您的教學工具。',
    'teacher_live_module': '即時教學模組',
    'students_count_span': '學生',
    'module_management': '模組管理',
    'student_mgmt_title': '學生帳號管理',
    'student_mgmt_desc': '新增、修改或刪除學生與教師帳號。',
    'add_student_title': '新增學生',
    'add_teacher_title': '新增老師',
    'form_name_label': '姓名',
    'form_class_label': '班級',
    'form_pwd_label': '預設密碼',
    'form_add_btn': '新增',
    'students_list_title': '現有帳號清單',
    'role_student': '學生',
    'role_teacher': '老師',
    'delete_btn': '刪除',
    'no_students': '無學生資料',
    'no_teachers': '無老師資料',
    'all_modules_title': '全部學習模組',
    'all_modules_desc': '平台以模組方式擴充。新增 App 時只需要加入名稱、描述、連結和權限。',
    'settings_title': '平台設定',
    'settings_desc': '深度整合模式：所有 App 運行在同一個伺服器。',
    'math_app_path': '數學 App 路徑 (math)',
    'whiteboard_path': '互動白板路徑 (whiteboard)',
    'default_roomCode': '預設房間號 (roomCode)',
    'ui_language': '介面語言 (Language)',
    'lang_zh': '繁體中文',
    'lang_en': 'English',
    'save_settings': '儲存設定',
    'integration_status': '整合狀態',
    'integration_status_desc': '所有模組已整合至同一個伺服器，學生帳號統一管理，登入一次即可使用所有功能。',
    'admin_title': '系統管理',
    'admin_desc': '只有教師或管理員可見的進階設定。',
    'sync_status': '同步狀態',
    'sync_desc': '查看與各模組的連線狀態與健康度。',
    'school_name': '杯澳公立學校',
    'module_math_name': '數學練習',
    'module_math_desc': '個人化四則運算練習，根據學生弱項自動出題。',
    'module_math_status': '已啟用',
    'module_wb_name': '互動白板',
    'module_wb_desc': '老師開啟課堂後，學生可即時加入書寫協作。',
    'module_wb_metric': '課堂房間可即時建立',
    'module_wb_status': '等待老師開課',
    'module_chinese_name': '中文學習',
    'module_chinese_desc': '閱讀、詞語、寫作與朗讀練習預留模組。',
    'module_chinese_metric': '即將推出',
    'module_chinese_status': '未啟用',
    'module_english_name': '英文學習',
    'module_english_desc': '拼讀、聆聽、口說與閱讀任務預留模組。',
    'module_english_metric': '開發中',
    'module_english_status': '未啟用'
  },
  'en-US': {
    'good_morning': 'Good Morning',
    'student_mode': 'Student Mode',
    'teacher_mode': 'Teacher Mode',
    'nav_home': 'Home',
    'nav_students': 'Students',
    'nav_modules': 'Modules',
    'nav_settings': 'Settings',
    'nav_admin': 'Admin',
    'logout': 'Logout',
    'today_advice': 'Today\'s Learning Plan',
    'student_advice_desc': 'Complete math practice first, then check for active whiteboard sessions.',
    'start_math': 'Start Math Practice',
    'math_sso_ok': 'Math practice opened in a new tab (Auto-login applied)',
    'board_class': 'Whiteboard Sessions',
    'board_class_desc': 'Join a teacher\'s session. Your name will be filled in automatically.',
    'my_modules': 'My Learning Modules',
    'my_modules_desc': 'Select an App to launch. Default Room: ',
    'no_room': 'None',
    'no_teacher_live': 'No active teacher sessions',
    'teacher_board_desc': 'Sessions will appear here once a teacher opens a whiteboard',
    'join_class': 'Join Class',
    'room': 'Room: ',
    'open_class': ' Started',
    'login_title': 'Login to Platform',
    'login_subtitle': 'Enter your Student/Teacher ID and password to login.',
    'login_id_label': 'Student / Teacher ID',
    'login_pwd_label': 'Password',
    'login_btn_loading': 'Logging in...',
    'login_btn': 'Enter Platform',
    'teacher_welcome_title': 'Welcome back, Teacher',
    'teacher_welcome_desc': 'Select a management item from the sidebar, or enter modules to view your teaching tools.',
    'teacher_live_module': 'Live Teaching Modules',
    'students_count_span': 'Students',
    'module_management': 'Module Management',
    'student_mgmt_title': 'Student Account Management',
    'student_mgmt_desc': 'Add, modify, or delete student and teacher accounts.',
    'add_student_title': 'Add Student',
    'add_teacher_title': 'Add Teacher',
    'form_name_label': 'Name',
    'form_class_label': 'Class',
    'form_pwd_label': 'Default Password',
    'form_add_btn': 'Add',
    'students_list_title': 'Existing Accounts',
    'role_student': 'Student',
    'role_teacher': 'Teacher',
    'delete_btn': 'Delete',
    'no_students': 'No student data',
    'no_teachers': 'No teacher data',
    'all_modules_title': 'All Learning Modules',
    'all_modules_desc': 'The platform expands through modules. To add an App, provide its name, description, link, and permissions.',
    'settings_title': 'Platform Settings',
    'settings_desc': 'Deep integration mode: All apps run on the same server.',
    'math_app_path': 'Math App Path (math)',
    'whiteboard_path': 'Whiteboard Path (whiteboard)',
    'default_roomCode': 'Default Room Code',
    'ui_language': 'Interface Language',
    'lang_zh': 'Traditional Chinese',
    'lang_en': 'English',
    'save_settings': 'Save Settings',
    'integration_status': 'Integration Status',
    'integration_status_desc': 'All modules are integrated on the same server. Unified account management allows access to all features with a single login.',
    'admin_title': 'System Admin',
    'admin_desc': 'Advanced settings visible only to teachers or admins.',
    'sync_status': 'Sync Status',
    'sync_desc': 'View connection status and health with each module.',
    'school_name': 'Pui O Public School',
    'module_math_name': 'Math Practice',
    'module_math_desc': 'Personalized arithmetic practice, automatically generating questions based on student weaknesses.',
    'module_math_status': 'Enabled',
    'module_wb_name': 'Whiteboard',
    'module_wb_desc': 'After the teacher opens a session, students can join instantly to collaborate.',
    'module_wb_metric': 'Sessions can be created instantly',
    'module_wb_status': 'Waiting for teacher',
    'module_chinese_name': 'Chinese Learning',
    'module_chinese_desc': 'Reserved module for reading, vocabulary, writing, and speaking practice.',
    'module_chinese_metric': 'Coming soon',
    'module_chinese_status': 'Disabled',
    'module_english_name': 'English Learning',
    'module_english_desc': 'Reserved module for phonics, listening, speaking, and reading tasks.',
    'module_english_metric': 'In development',
    'module_english_status': 'Disabled'
  }
};

function t(key) {
  // Use state.currentUser.language if available, otherwise fallback to local setting or zh-HK
  const lang = state.currentUser?.language || JSON.parse(localStorage.getItem('buiSettings') || '{}').language || 'zh-HK';
  return I18N[lang]?.[key] || I18N['zh-HK'][key] || key;
}

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
  adminUnlocked: false,
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
          className: data.student.className || '',
          language: data.student.language || 'zh-HK',
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
        <!-- 背景裝飾圓圈 -->
        <div class="lv-blob lv-blob-1" aria-hidden="true"></div>
        <div class="lv-blob lv-blob-2" aria-hidden="true"></div>
        <div class="lv-blob lv-blob-3" aria-hidden="true"></div>

        <!-- 校徽品牌 -->
        <div class="brand-lockup">
          <img src="/images/logo.png" class="brand-mark" alt="校徽" />
          <div>
            <div class="school-name">杯澳公立學校</div>
            <div class="platform-name">個人化學習平台</div>
          </div>
        </div>

        <!-- 主要內容 -->
        <div class="lv-center-content">
          <div class="lv-subject-pills" aria-hidden="true">
            <span class="lv-pill pill-chi">📖 中文</span>
            <span class="lv-pill pill-eng">🔤 英文</span>
            <span class="lv-pill pill-math">📐 數學</span>
            <span class="lv-pill pill-board">🖊️ 白板</span>
          </div>
          <h1>一站式個人化學習平台</h1>
          <p class="lv-subtitle">連接學生每天需要的學習工具</p>
        </div>

        <!-- 底部裝飾 -->
        <div class="lv-footer-badge">
          <span class="lv-badge-dot"></span>
          平台運作中
        </div>
      </section>

      <section class="login-panel" aria-label="登入">
        <div class="panel-topline"></div>
        <h2>${t('login_title')}</h2>
        <p>${t('login_subtitle')}</p>
        ${state.loginError ? `<div class="login-error">${renderIcon('lock')} ${state.loginError}</div>` : ''}
        <form id="loginForm" class="login-form">
          <label>
            ${t('login_id_label')}
            <input id="userIdInput" placeholder="" autocomplete="username" required />
          </label>
          <label>
            ${t('login_pwd_label')}
            <input id="passwordInput" type="password" placeholder="" autocomplete="current-password" required />
          </label>
          <button class="primary-action" type="submit" ${state.loginLoading ? 'disabled' : ''}>
            ${state.loginLoading ? renderIcon('loader') + ' ' + t('login_btn_loading') : renderIcon('door') + ' ' + t('login_btn')}
          </button>
        </form>
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
          <button class="${state.activeView === 'dashboard' ? 'active' : ''}" data-view="dashboard">${renderIcon('math')} ${t('nav_home')}</button>
          ${user.role === 'teacher' ? `<button class="${state.activeView === 'students' ? 'active' : ''}" data-view="students">${renderIcon('user')} ${t('nav_students')}</button>` : ''}
          <button class="${state.activeView === 'modules' ? 'active' : ''}" data-view="modules">${renderIcon('board')} ${t('nav_modules')}</button>
          <button class="${state.activeView === 'settings' ? 'active' : ''}" data-view="settings">${renderIcon('settings')} ${t('nav_settings')}</button>
          <button id="adminBtn" class="${state.activeView === 'admin' ? 'active' : ''}">${renderIcon('settings')} ${t('nav_admin')}</button>
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

// =============================================
// 渲染：模組頁
// =============================================
function renderModulesPage() {
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
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px;">
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

    <section class="work-panel">
      <h2>${t('students_list_title')}</h2>
      <div class="student-table">
        ${state.studentsList.filter(s => s.role !== 'teacher').map(s => `
          <div class="student-row" style="grid-template-columns: 200px 1fr auto; align-items: center;">
            <div>
              <div style="display:flex; align-items:baseline; gap:8px;">
                <strong style="font-size:1.05em;">${s.name}</strong>
                <span style="color:var(--text-muted); font-size:0.9em;">${s.id}</span>
              </div>
              <div style="margin-top:6px;">
                <span style="background:var(--violet); color:white; padding:3px 8px; border-radius:12px; font-size:0.8em; display:inline-block;">${t('role_student')}</span>
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
              <button class="danger-action delete-student-btn" data-id="${s.id}">${t('delete_btn')}</button>
            </div>
          </div>
        `).join('') || `<div style="padding:1rem; color:var(--text-muted)">${t('no_students')}</div>`}
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
          className: data.student.className || '',
          language: data.student.language || 'zh-HK',
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
