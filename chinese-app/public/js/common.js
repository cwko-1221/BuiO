// Shared helpers across all Chinese-module pages. Wrapped in an IIFE so only
// window.ChineseApp leaks into the global scope — pages destructure freely
// without colliding with these declarations.
(function () {
  'use strict';

  const API = '/api/chinese';

  async function api(path, opts = {}) {
    const isForm = opts.body instanceof FormData;
    const headers = { Accept: 'application/json', ...(opts.headers || {}) };
    if (opts.body && !isForm) headers['Content-Type'] = 'application/json';
    const res = await fetch(path, {
      credentials: 'same-origin',
      method: opts.method || 'GET',
      body: opts.body && !isForm ? JSON.stringify(opts.body) : opts.body,
      headers,
    });
    if (!res.ok) {
      let msg;
      try { msg = (await res.json()).message; } catch { msg = res.statusText; }
      const err = new Error(msg || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    if (res.headers.get('content-type')?.includes('application/json')) return res.json();
    return res;
  }

  async function getMe() {
    try { return (await api('/api/auth/me')).student; }
    catch { return null; }
  }

  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    window.location.href = '/login.html';
  }

  function toast(message, type = '') {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.classList.remove('show'); }, 2400);
  }

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'style') Object.assign(node.style, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return node;
  }

  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function renderTopbar({ title, user, backUrl = '/' }) {
    return el('header', { class: 'topbar' },
      el('button', { class: 'btn-back', onclick: () => location.href = backUrl }, '← 返回'),
      el('h1', {}, title),
      user ? el('span', { class: 'user' }, `${user.name}（${user.role === 'teacher' ? '教師' : '學生'}）`) : null,
      el('button', { class: 'btn-back', onclick: logout, style: { marginLeft: '8px' } }, '登出')
    );
  }

  async function ensureAuth(requireRole) {
    const me = await getMe();
    if (!me) { window.location.href = '/login.html'; return null; }
    if (requireRole && me.role !== requireRole) {
      if (me.role === 'teacher') window.location.href = '/chinese/teacher';
      else window.location.href = '/chinese/student';
      return null;
    }
    return me;
  }

  window.ChineseApp = { api, API, getMe, logout, toast, el, fmtDate, renderTopbar, ensureAuth };
})();
