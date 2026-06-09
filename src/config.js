// =============================================
// 本地路徑（所有 App 整合在同一個伺服器）
// =============================================
export const MATH_QUIZ_URL = '/quiz.html';
export const MATH_DASHBOARD_URL = '/dashboard.html';
export const WHITEBOARD_BASE = '/whiteboard';

// =============================================
// 模組定義
// =============================================
export const MODULES = [
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
    id: 'report',
    name: 'module_report_name',
    shortName: 'Report',
    description: 'module_report_desc',
    accent: 'sky',
    icon: 'report',
    status: 'module_report_status',
    roleAccess: ['teacher']
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
    metric: 'module_english_metric',
    status: 'module_english_status',
    disabled: true,
    roleAccess: ['student', 'teacher']
  }
];

// =============================================
// SVG 圖示
// =============================================
export const iconSvg = {
  math: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10M7 12h10M7 17h6"/><path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/></svg>`,
  board: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H4z"/><path d="M8 21h8M12 16v5"/><path d="m8 12 3-3 2 2 3-4"/></svg>`,
  book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 4v13a3 3 0 0 0 3 3"/></svg>`,
  report: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>`,
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
