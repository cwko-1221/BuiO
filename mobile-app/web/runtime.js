// Installed at document start by the native iOS host. App layout and joystick
// hit regions reuse the original controls, requests and authoritative rules.
(function () {
  'use strict';
  if (window.BuiOMobile) return;
  Object.defineProperty(window, 'BuiOMobile', { value: Object.freeze({
    platform: 'ios', mode: 'online-compatibility-pilot', version: '0.2.0',
    viewport: 'edge-to-edge'
  }), writable: false });
  const mobileCSS = /* BUIO_MOBILE_CSS */ '';
  let nativeInsets;
  const applyInsets = insets => {
    nativeInsets = insets;
    if (!document.documentElement) return;
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      const value = Number(insets[edge]);
      if (Number.isFinite(value) && value >= 0) document.documentElement.style.setProperty('--buio-safe-' + edge, value + 'px');
    }
  };
  Object.defineProperty(window, 'BuiOApplyInsets', { value: applyInsets });
  const setupLayout = () => {
    if (!document.documentElement || !document.head) return false;
    const root = document.documentElement;
    root.setAttribute('data-buio-app', 'ios');
    if (nativeInsets) applyInsets(nativeInsets);
    root.setAttribute('data-buio-page', /^\/(?:index\.html)?$/.test(location.pathname) ? 'hub' : 'module');
    const section = location.pathname.split('/')[1].replace(/\.html$/, '');
    root.setAttribute('data-buio-module', ['math', 'login', 'quiz', 'dashboard', 'teacher-topics', 'tag-picker'].includes(section) ? 'math' : section);
    // Keep text zoom available; remove old scale caps on learning pages.
    // Backgrounds cover the glass; controls use the CSS system-safe insets.
    let viewports = [...document.querySelectorAll('meta[name="viewport"]')];
    if (!viewports.length) {
      const viewport = document.createElement('meta');
      viewport.name = 'viewport';
      document.head.append(viewport);
      viewports = [viewport];
    }
    const content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    for (const viewport of viewports) if (viewport.content !== content) viewport.content = content;
    if (!document.getElementById('buio-mobile-layout')) {
      const style = document.createElement('style');
      style.id = 'buio-mobile-layout';
      style.textContent = mobileCSS;
      document.head.append(style);
    }
    return true;
  };
  // At document start <head> may not exist yet. Watch only the initial parse;
  // do not observe the changing game DOM for the lifetime of a match.
  const layoutObserver = new MutationObserver(setupLayout);
  layoutObserver.observe(document, { childList: true, subtree: true });
  setupLayout();
  const formSelector = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),select,textarea';
  const processedSheets = new WeakSet();
  const rewriteSafeAreas = sheet => {
    if (!sheet || processedSheets.has(sheet)) return;
    try {
      const visit = rules => {
        for (const rule of rules) {
          if (rule.cssRules) visit(rule.cssRules);
          if (!rule.style) continue;
          const value = rule.style.cssText;
          if (!value.includes('env(safe-area-inset-')) continue;
          // Pending-substitution shorthands can return empty longhand values
          // in WebKit. Rewrite the declaration block, preserving our own env
          // defaults so they never become self-referencing CSS variables.
          const defaults = ['top', 'right', 'bottom', 'left'].map(edge => {
            const property = '--buio-safe-' + edge;
            return [property, rule.style.getPropertyValue(property), rule.style.getPropertyPriority(property)];
          });
          rule.style.cssText = value.replace(/env\(\s*safe-area-inset-(top|right|bottom|left)\s*(?:,\s*([^)]*))?\)/g,
            (_, edge, fallback) => 'var(--buio-safe-' + edge + ',' + (fallback || '0px') + ')');
          for (const [property, original, priority] of defaults) if (original) rule.style.setProperty(property, original, priority);
        }
      };
      visit(sheet.cssRules); processedSheets.add(sheet);
    } catch { /* Cross-origin sheets keep their normal browser behavior. */ }
  };
  const fitFormField = field => {
    if (field?.matches(formSelector) &&
        parseFloat(getComputedStyle(field).fontSize) < 16) {
      field.style.setProperty('font-size', '16px', 'important');
    }
  };
  const finishLayout = () => {
    setupLayout();
    const statusShield = document.createElement('div');
    statusShield.setAttribute('data-buio-status-shield', '');
    statusShield.setAttribute('aria-hidden', 'true');
    document.body.append(statusShield);
    const style = document.getElementById('buio-mobile-layout');
    // Preserve each module's authored spacing while adding system safe areas.
    // Read once after its stylesheets load, before enabling document insets.
    [...document.styleSheets].forEach(rewriteSafeAreas);
    const insetValues = {};
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      insetValues[edge] = document.documentElement.style.getPropertyValue('--buio-safe-' + edge);
      document.documentElement.style.setProperty('--buio-safe-' + edge, '0px');
    }
    style.disabled = true;
    const bodyStyle = getComputedStyle(document.body);
    for (const edge of ['Top', 'Right', 'Bottom', 'Left']) {
      document.documentElement.style.setProperty('--buio-body-pad-' + edge.toLowerCase(), bodyStyle['padding' + edge]);
    }
    style.disabled = false;
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      if (insetValues[edge]) document.documentElement.style.setProperty('--buio-safe-' + edge, insetValues[edge]);
      else document.documentElement.style.removeProperty('--buio-safe-' + edge);
    }
    document.querySelectorAll(formSelector).forEach(fitFormField);
    layoutObserver.disconnect();
    new MutationObserver(records => {
      for (const record of records) {
        const nodes = [record.target, ...record.addedNodes];
        for (const node of nodes) {
          if (node.tagName === 'STYLE') { processedSheets.delete(node.sheet); rewriteSafeAreas(node.sheet); }
          if (node.tagName === 'LINK' && node.rel === 'stylesheet') {
            rewriteSafeAreas(node.sheet);
            node.addEventListener('load', () => { processedSheets.delete(node.sheet); rewriteSafeAreas(node.sheet); }, { once: true });
          }
        }
      }
    }).observe(document.head, { childList: true, subtree: true });
    updatePresentation();
    if (document.documentElement.getAttribute('data-buio-page') === 'hub') setupTeacherHub();
    if (document.documentElement.getAttribute('data-buio-module') === 'homework') setupHomework();
    if (document.documentElement.getAttribute('data-buio-module') === 'pet') {
      const attach = () => {
        const shell = document.querySelector('.pet-shell');
        if (shell) {
          new MutationObserver(updatePresentation).observe(shell, { attributes: true, attributeFilter: ['data-screen', 'class'] });
          setupPetNavigation(shell);
          setupPetBrawl(shell);
          setupFloatingSticks(shell);
          updatePresentation();
        }
        return Boolean(shell || document.querySelector('.teacher-shell'));
      };
      if (!attach()) {
        const bootObserver = new MutationObserver(() => { if (attach()) bootObserver.disconnect(); });
        bootObserver.observe(document.body, { childList: true, subtree: true });
      }
    }
  };
  function setupFloatingSticks(shell) {
    let active;
    const ignoredPointers = new Set();
    const reset = (release = false) => {
      if (!active) return;
      const { stick, id, transform, transition } = active; active = undefined;
      for (const [name, saved] of [['transform', transform], ['transition', transition]]) {
        if (saved.value) stick.style.setProperty(name, saved.value, saved.priority);
        else stick.style.removeProperty(name);
      }
      stick.removeAttribute('data-buio-floating-stick');
      if (release && stick.hasPointerCapture(id)) stick.releasePointerCapture(id);
    };
    // A transparent pseudo-element belongs to the real stick. Therefore the
    // original controller receives a real, capturable pointer, not a synthetic
    // event or a second input implementation. Recenter before its handler runs.
    document.addEventListener('pointerdown', event => {
      ignoredPointers.delete(event.pointerId);
      const stick = event.target.closest?.('[data-park-stick],[data-stick]');
      if (!stick || !shell.contains(stick) || event.button !== 0) return;
      if (active) {
        if (active.id !== event.pointerId) { ignoredPointers.add(event.pointerId); event.preventDefault(); event.stopImmediatePropagation(); }
        return;
      }
      const rect = stick.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const saved = name => ({ value: stick.style.getPropertyValue(name), priority: stick.style.getPropertyPriority(name) });
      active = { stick, id: event.pointerId, transform: saved('transform'), transition: saved('transition') };
      const base = getComputedStyle(stick).transform;
      stick.style.setProperty('transition', 'none', 'important');
      stick.style.setProperty('transform', 'translate(' + (event.clientX - rect.left - rect.width / 2) + 'px,' +
        (event.clientY - rect.top - rect.height / 2) + 'px)' + (base === 'none' ? '' : ' ' + base), 'important');
      stick.setAttribute('data-buio-floating-stick', '');
    }, true);
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      document.addEventListener(type, event => {
        if (ignoredPointers.has(event.pointerId)) {
          // Touch pointers have implicit capture even when their down handler
          // is suppressed. Ignore both up and the following lost-capture event.
          if (type === 'lostpointercapture') ignoredPointers.delete(event.pointerId);
          event.preventDefault(); event.stopImmediatePropagation(); return;
        }
        if (active?.id === event.pointerId) reset();
      }, true);
    }
    addEventListener('blur', () => reset(true));
    addEventListener('resize', () => reset(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(true); });
    new MutationObserver(records => {
      if (!active) return;
      if (!active.stick.isConnected || records.some(record => [...record.addedNodes].some(node => node.nodeType === Node.ELEMENT_NODE &&
          (node.matches('.brawl-modal,.brawl-story-overlay,.park-drawer-backdrop,.park-dialog-backdrop,.park-garden-backdrop,.park-social-backdrop') ||
           node.querySelector('.brawl-modal,.brawl-story-overlay,.park-drawer-backdrop,.park-dialog-backdrop,.park-garden-backdrop,.park-social-backdrop'))))) reset(true);
    }).observe(shell, { childList: true, subtree: true });
  }
  function setupHomework() {
    const host = document.getElementById('app'); if (!host) return;
    let filter = 'all';
    const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
    const enhance = () => {
      const english = document.documentElement.lang.startsWith('en');
      const text = (zh, en) => english ? en : zh;
      const back = host.querySelector('.shell:not(.student-shell) .side .back');
      if (back) {
        if (!back.hasAttribute('aria-label')) back.setAttribute('aria-label', back.textContent);
        setText(back, text('← 返回首頁', '← Home'));
      }
      for (const row of host.querySelectorAll('.missing-record-row:not(.missing-record-heading)')) {
        if (!row.hasAttribute('data-buio-compact-record')) {
          row.setAttribute('data-buio-compact-record', '');
          const number = row.children[1]?.querySelector('small');
          if (number && row.children[0]) {
            const separator = document.createElement('span'); separator.textContent = ' · '; separator.setAttribute('aria-hidden', 'true');
            row.children[0].append(separator, number);
          }
          const label = row.querySelector('.caught-up-check');
          if (label) {
            for (const node of [...label.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.remove();
            const caption = document.createElement('span'); caption.setAttribute('data-buio-made-up-caption', ''); label.append(caption);
          }
        }
        const input = row.querySelector('.teacher-class-made-up'); const caption = row.querySelector('[data-buio-made-up-caption]');
        if (input && caption) setText(caption, input.checked ? text('已補做', 'Made up') : text('待補交', 'Pending'));
      }
      const panel = host.querySelector('.teacher-classes-panel');
      if (panel) {
        let filters = panel.querySelector('[data-buio-homework-filters]');
        if (!filters) {
          filters = document.createElement('div'); filters.setAttribute('data-buio-homework-filters', '');
          filters.setAttribute('role', 'group'); filters.setAttribute('aria-label', text('篩選補交狀態', 'Filter submission status'));
          for (const value of ['all', 'pending', 'done']) {
            const button = document.createElement('button'); button.type = 'button'; button.dataset.buioHomeworkFilter = value;
            button.addEventListener('click', () => { filter = value; enhance(); }); filters.append(button);
          }
          panel.prepend(filters);
        }
        const rows = [...panel.querySelectorAll('.missing-record-row:not(.missing-record-heading)')];
        const done = rows.filter(row => row.querySelector('.teacher-class-made-up')?.checked).length;
        const counts = { all: rows.length, pending: rows.length - done, done };
        const labels = { all: text('全部', 'All'), pending: text('待補交', 'Pending'), done: text('已補做', 'Made up') };
        for (const button of filters.querySelectorAll('button')) {
          const key = button.dataset.buioHomeworkFilter; setText(button, labels[key] + ' ' + counts[key]);
          button.setAttribute('aria-pressed', String(key === filter));
        }
        for (const row of rows) {
          const madeUp = Boolean(row.querySelector('.teacher-class-made-up')?.checked);
          row.hidden = filter === 'pending' ? madeUp : filter === 'done' ? !madeUp : false;
        }
        for (const card of panel.querySelectorAll('.teacher-class-card')) {
          const list = card.querySelector('.missing-record-list'); if (!list) continue;
          let empty = card.querySelector('[data-buio-homework-empty]');
          if (!empty) { empty = document.createElement('p'); empty.setAttribute('data-buio-homework-empty', ''); list.after(empty); }
          setText(empty, text('此分類沒有紀錄', 'No records in this category'));
          empty.hidden = [...list.querySelectorAll('.missing-record-row:not(.missing-record-heading)')].some(row => !row.hidden);
        }
      }
      const analysis = host.querySelector('.panel:has(#classAnalysisFrom)');
      const hint = analysis?.querySelector('.panel-head .hint');
      if (hint && !hint.closest('[data-buio-analysis-note]')) {
        const note = document.createElement('details'); note.setAttribute('data-buio-analysis-note', '');
        const summary = document.createElement('summary'); summary.textContent = text('統計說明', 'About these statistics');
        hint.before(note); note.append(summary, hint);
      }
    };
    host.addEventListener('change', event => { if (event.target.matches('.teacher-class-made-up')) enhance(); });
    new MutationObserver(enhance).observe(host, { childList: true, subtree: true });
    enhance();
  }
  function setupTeacherHub() {
    const root = document.documentElement;
    const excluded = new Set(['buzzer', 'whiteboard', 'science-lab', 'chinese', 'game', 'english', 'phonics']);
    const enhance = () => {
      const teacher = Boolean(document.querySelector('.side-nav [data-view="students"]'));
      root.toggleAttribute('data-buio-teacher', teacher);
      if (!teacher) return;
      const english = root.lang.startsWith('en');
      const text = (zh, en) => english ? en : zh;
      for (const action of document.querySelectorAll('[data-open-module]')) {
        if (excluded.has(action.dataset.openModule)) action.closest('.module-card')?.remove();
      }
      const hero = document.querySelector('.hero-board.teacher:not([data-buio-workbench])');
      if (hero) {
        const count = hero.querySelector('.class-snapshot strong');
        const snapshot = document.createElement('div'); snapshot.className = 'buio-teacher-stat';
        if (count) snapshot.append(count);
        const unit = document.createElement('span'); unit.textContent = text('位學生', 'students'); snapshot.append(unit);
        const copy = document.createElement('div');
        const heading = document.createElement('h2'); heading.textContent = text('教學工作台', 'Teaching workspace');
        const description = document.createElement('p'); description.textContent = text('管理學生，跟進學習進度。', 'Manage students and follow their progress.');
        copy.append(heading, description); hero.replaceChildren(copy, snapshot); hero.setAttribute('data-buio-workbench', '');
        const grid = hero.parentElement.querySelector('.module-grid');
        if (grid) {
          grid.classList.add('buio-quick-tools');
          const student = document.createElement('article'); student.className = 'module-card mint buio-student-tool';
          const icon = document.createElement('div'); icon.className = 'module-icon';
          const sourceNav = document.querySelector('.side-nav [data-view="students"]');
          const sourceIcon = sourceNav?.querySelector('svg'); if (sourceIcon) icon.append(sourceIcon.cloneNode(true));
          const title = document.createElement('h3'); title.textContent = text('學生管理', 'Students');
          const detail = document.createElement('p'); detail.textContent = text('名單、班級與學習分組', 'Accounts, classes and learning groups');
          const action = document.createElement('button'); action.type = 'button'; action.className = 'module-action';
          action.textContent = text('管理學生', 'Manage students'); action.addEventListener('click', () => sourceNav?.click());
          const content = document.createElement('div'); content.className = 'module-copy'; content.append(title, detail);
          student.append(icon, content, action);
          const preferred = ['homework', 'multiplication-checklist', 'pet'].map(id => grid.querySelector('[data-open-module="' + id + '"]')?.closest('.module-card')).filter(Boolean);
          for (const card of preferred) {
            const action = card.querySelector('.module-action'); const title = card.querySelector('h3');
            action?.setAttribute('aria-label', title?.textContent || '');
            const id = action?.dataset.openModule;
            if (id === 'multiplication-checklist' && title) title.textContent = text('乘數表', 'Times tables');
            const description = card.querySelector('.module-copy p');
            const descriptions = { homework: text('跟進欠交紀錄與補交進度', 'Track missing work and submissions'),
              'multiplication-checklist': text('抽籤背誦，記錄學習成果', 'Draw students and record progress'), pet: text('管理金幣、獎勵與寵物', 'Manage coins, rewards and pets') };
            if (description && descriptions[id]) description.textContent = descriptions[id];
          }
          grid.replaceChildren(student, ...preferred);
          const section = grid.previousElementSibling;
          if (section?.matches('.section-head')) {
            const label = document.createElement('h2'); label.textContent = text('常用工具', 'Quick access');
            const all = document.createElement('button'); all.type = 'button'; all.className = 'buio-text-action'; all.textContent = text('全部工具 →', 'All tools →');
            all.addEventListener('click', () => document.querySelector('.side-nav [data-view="modules"]')?.click());
            section.replaceChildren(label, all); section.classList.add('buio-tools-heading');
          }
        }
      }
      const table = document.querySelector('.student-table:has(.management-student-row)');
      if (table && !table.hasAttribute('data-buio-students')) {
        table.setAttribute('data-buio-students', '');
        const rows = [...table.querySelectorAll('.management-student-row')];
        const controls = document.createElement('div'); controls.className = 'buio-directory-controls';
        const search = document.createElement('input'); search.type = 'search'; search.placeholder = text('搜尋姓名或學號', 'Search name or student ID'); search.setAttribute('aria-label', search.placeholder);
        const filter = document.createElement('select'); filter.setAttribute('aria-label', text('篩選班級', 'Filter class'));
        const classes = [...new Set(rows.map(row => row.querySelector('[data-field="className"]')?.value).filter(Boolean))].sort();
        for (const value of ['', ...classes]) { const option = document.createElement('option'); option.value = value; option.textContent = value || text('所有班級', 'All classes'); filter.append(option); }
        const result = document.createElement('span'); result.className = 'buio-directory-count'; result.setAttribute('role', 'status');
        const applyFilter = () => {
          let visible = 0; const term = search.value.trim().toLocaleLowerCase();
          for (const row of rows) {
            const matches = (!term || row.firstElementChild.textContent.toLocaleLowerCase().includes(term)) && (!filter.value || row.querySelector('[data-field="className"]')?.value === filter.value);
            row.hidden = !matches; if (matches) visible++;
          }
          result.textContent = text(visible + ' 位學生', visible + ' students');
        };
        search.addEventListener('input', applyFilter); filter.addEventListener('change', applyFilter); table.addEventListener('change', applyFilter);
        controls.append(search, filter, result); table.before(controls);
        for (const row of rows) {
          const profile = row.firstElementChild; const fields = row.querySelector('.student-edit-fields'); const actions = row.lastElementChild;
          const badge = document.createElement('span'); badge.className = 'buio-student-class';
          const updateBadge = () => { badge.textContent = [row.querySelector('[data-field="className"]')?.value, row.querySelector('[data-field="classNo"]')?.value].filter(Boolean).join(' · '); };
          updateBadge(); row.addEventListener('change', updateBadge); profile.append(badge);
          const editor = document.createElement('details'); editor.className = 'buio-student-editor';
          const summary = document.createElement('summary'); summary.textContent = text('編輯資料', 'Edit details');
          editor.append(summary, fields, actions); row.append(editor);
        }
        applyFilter();
        // Creation and import remain available without pushing the directory
        // below several screens of seldom-used forms. Keep the real form nodes.
        for (const form of document.querySelectorAll('#addStudentForm, .batch-import-card')) {
          const card = form.matches('form') ? form.parentElement : form;
          if (card.parentElement?.matches('[data-buio-student-task]')) continue;
          const task = document.createElement('details'); task.setAttribute('data-buio-student-task', '');
          const summary = document.createElement('summary'); summary.textContent = card.querySelector('h3')?.textContent || text('匯入名單', 'Import students');
          card.before(task); task.append(summary, card);
        }
      }
    };
    // The hub replaces #app on navigation and after its directory GET finishes.
    // Observe structure only; our edits are idempotent and never change data.
    const host = document.getElementById('app');
    if (host) new MutationObserver(enhance).observe(host, { childList: true, subtree: true });
    enhance();
  }
  function setupPetNavigation(shell) {
    const nav = shell.querySelector('.pet-nav');
    if (!nav || nav.querySelector('[data-buio-more]')) return;
    const secondary = [...nav.querySelectorAll('[data-tab]')].filter(button => !['home', 'park', 'collection', 'brawl'].includes(button.dataset.tab));
    for (const button of secondary) button.setAttribute('data-buio-secondary', '');
    const more = document.createElement('button');
    more.type = 'button'; more.setAttribute('data-buio-more', '');
    more.setAttribute('aria-haspopup', 'dialog');
    const english = nav.querySelector('[data-tab="settings"]')?.textContent.trim() === 'Settings' || document.documentElement.lang.startsWith('en');
    more.innerHTML = '<span aria-hidden="true" class="buio-more-icon">•••</span><span>' + (english ? 'More' : '更多') + '</span>';
    nav.append(more);
    const sheet = document.createElement('dialog');
    sheet.setAttribute('data-buio-sheet', '');
    sheet.setAttribute('aria-label', english ? 'More pet activities' : '更多寵物活動');
    shell.append(sheet);
    const backdrop = document.createElement('div');
    backdrop.className = 'buio-sheet-backdrop'; backdrop.hidden = true; shell.append(backdrop);
    const close = () => {
      if (sheet.close) sheet.close(); else sheet.removeAttribute('open');
      backdrop.hidden = true; more.focus();
    };
    backdrop.addEventListener('click', close);
    more.addEventListener('click', event => {
      event.stopPropagation();
      sheet.replaceChildren();
      const heading = document.createElement('h2'); heading.textContent = english ? 'More activities' : '更多活動'; sheet.append(heading);
      const closeButton = document.createElement('button');
      closeButton.type = 'button'; closeButton.className = 'buio-sheet-close'; closeButton.textContent = '×';
      closeButton.setAttribute('aria-label', english ? 'Close' : '關閉'); closeButton.addEventListener('click', close); sheet.append(closeButton);
      const items = document.createElement('div'); items.className = 'buio-sheet-items';
      for (const button of secondary) { const item = button.cloneNode(true); item.removeAttribute('data-buio-secondary'); items.append(item); }
      sheet.append(items);
      if (sheet.showModal) sheet.showModal(); else { sheet.setAttribute('open', ''); backdrop.hidden = false; }
    });
    sheet.addEventListener('click', event => {
      if (event.target.closest('[data-tab]')) { if (sheet.close) sheet.close(); else sheet.removeAttribute('open'); backdrop.hidden = true; }
      if (event.target === sheet) {
        const box = sheet.getBoundingClientRect();
        if (event.clientY < box.top || event.clientX < box.left || event.clientX > box.right) close();
      }
    });
  }
  function setupPetBrawl(shell) {
    const surface = shell.querySelector('#playSurface');
    if (!surface) return;
    let current;
    const watch = () => {
      const root = surface.querySelector('#brawl-root');
      if (current?.root === root) return;
      current?.state.resize?.disconnect(); current?.observer.disconnect(); current = null;
      if (!root) return;
      const state = { scroll: 0, selected: '', stage: '', details: new Map(), resize: null };
      root.addEventListener('click', event => {
        const fighter = event.target.closest('[data-brawl="fighter"]');
        if (fighter) { state.scroll = root.querySelector('.brawl-fighters')?.scrollLeft || 0; state.selected = fighter.dataset.id; }
        if (event.target.closest('[data-brawl="filter"]')) state.scroll = 0;
      }, true);
      const enhance = () => {
        state.resize?.disconnect();
        const content = root.querySelector('.brawl-lobby-content');
        if (!content || content.hasAttribute('data-buio-brawl-menu')) return;
        content.setAttribute('data-buio-brawl-menu', '');
        const english = content.querySelector('[data-brawl="mode"][data-id="campaign"]')?.textContent.trim() === 'Adventure' || document.documentElement.lang.startsWith('en');
        content.lang = english ? 'en' : 'zh-HK';
        const text = (zh, en) => english ? en : zh;
        const button = (label, className) => {
          const item = document.createElement('button'); item.type = 'button'; item.textContent = label;
          if (className) item.className = className;
          return item;
        };
        const original = [...content.children];
        const metadata = document.createElement('div'); metadata.hidden = true;
        const modes = content.querySelector('.brawl-mode-tabs');
        if (!modes) return;
        const toolbar = document.createElement('div'); toolbar.className = 'buio-brawl-toolbar';
        const help = button(text('說明', 'Info'), 'buio-brawl-info');
        toolbar.append(modes, help);
        const workspace = document.createElement('div'); workspace.className = 'buio-brawl-workspace';
        const roster = content.querySelector('.brawl-fighters');
        const rosterHead = content.querySelector('.brawl-roster-head');
        const preparation = document.createElement('section'); preparation.className = 'buio-brawl-preparation';
        preparation.setAttribute('aria-label', text('戰前準備', 'Battle preparation'));
        const dialog = document.createElement('dialog'); dialog.className = 'buio-brawl-dialog';
        const closeDialog = () => dialog.close();
        const openDialog = (title, nodes) => {
          dialog.replaceChildren();
          const heading = document.createElement('header'); const h2 = document.createElement('h2'); h2.textContent = title;
          const close = button('×', 'buio-brawl-dialog-close'); close.setAttribute('aria-label', text('關閉', 'Close'));
          close.addEventListener('click', closeDialog); heading.append(h2, close); dialog.append(heading);
          for (const node of nodes.filter(Boolean)) dialog.append(node.cloneNode(true));
          dialog.showModal();
        };
        dialog.addEventListener('click', event => {
          if (event.target.closest('[data-brawl]')) closeDialog();
          if (event.target === dialog) {
            const box = dialog.getBoundingClientRect();
            if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeDialog();
          }
        });
        help.addEventListener('click', () => openDialog(text('玩法與獎勵', 'Rules and rewards'),
          original.filter(node => node.matches('.brawl-heading,.brawl-adventure-intro,.brawl-kit-note,.brawl-note,.brawl-resume'))));
        const resume = original.find(node => node.matches('.brawl-resume'));
        if (resume) {
          const progress = button(text('進度', 'Saved run'), 'buio-brawl-info');
          progress.addEventListener('click', () => openDialog(text('上次冒險', 'Saved adventure'), [resume]));
          toolbar.insertBefore(progress, help);
        }
        if (roster && rosterHead) {
          state.selected = roster.querySelector('.brawl-fighter.selected')?.dataset.id || state.selected;
          const rosterPanel = document.createElement('section'); rosterPanel.className = 'buio-brawl-roster';
          rosterPanel.setAttribute('aria-label', text('選擇出戰角色', 'Choose your fighter'));
          const ability = button(text('能力', 'Skills'), 'buio-brawl-ability');
          ability.addEventListener('click', () => {
            const selected = roster.querySelector('.brawl-fighter.selected');
            const card = state.details.get(selected?.dataset.id || state.selected);
            if (!card) return;
            const detail = document.createElement('article'); detail.className = 'buio-brawl-fighter-detail';
            for (const child of card.children) detail.append(child.cloneNode(true));
            openDialog(text('角色能力', 'Fighter skills'), [detail, original.find(node => node.matches('.brawl-kit-note'))]);
          });
          for (const card of roster.querySelectorAll('.brawl-fighter')) state.details.set(card.dataset.id, card.cloneNode(true));
          const paging = document.createElement('div'); paging.className = 'buio-brawl-pages';
          const previous = button('‹'); previous.setAttribute('aria-label', text('上一頁角色', 'Previous fighters'));
          const next = button('›'); next.setAttribute('aria-label', text('下一頁角色', 'Next fighters'));
          const pageNumber = document.createElement('span'); pageNumber.setAttribute('aria-live', 'polite');
          paging.append(previous, pageNumber, next);
          rosterHead.append(ability, paging);
          rosterPanel.append(rosterHead, roster); workspace.append(rosterPanel);
          const fitRoster = () => {
            const width = roster.clientWidth, height = roster.clientHeight;
            if (!width || !height) return;
            const short = innerHeight < 600;
            const columns = Math.max(2, Math.floor((width + 6) / (short ? 82 : 96)));
            const rows = Math.max(1, Math.min(4, Math.floor((height + 6) / (short ? (english ? 76 : 68) : 106))));
            const cardWidth = (width - 6 * (columns - 1)) / columns;
            roster.style.gridAutoColumns = cardWidth + 'px';
            roster.style.gridTemplateRows = `repeat(${rows},minmax(0,1fr))`;
            roster.style.setProperty('--buio-fighter-art', Math.max(30, Math.min(72, (height - 6 * (rows - 1)) / rows - (english ? 48 : 32))) + 'px');
            const count = roster.querySelectorAll('.brawl-fighter').length;
            [...roster.querySelectorAll('.brawl-fighter')].forEach((card, index) => {
              const page = Math.floor(index / (columns * rows));
              const within = index % (columns * rows);
              card.style.gridColumn = String(page * columns + within % columns + 1);
              card.style.gridRow = String(Math.floor(within / columns) + 1);
            });
            const pages = Math.ceil(count / (columns * rows)) || 1;
            const atEnd = roster.scrollLeft >= roster.scrollWidth - width - 2;
            const page = atEnd ? pages : Math.min(pages, Math.round(roster.scrollLeft / (width + 6)) + 1);
            pageNumber.textContent = page + ' / ' + pages;
            previous.disabled = roster.scrollLeft <= 1; next.disabled = atEnd;
          };
          previous.addEventListener('click', () => roster.scrollBy({ left: -roster.clientWidth - 6, behavior: 'smooth' }));
          next.addEventListener('click', () => roster.scrollBy({ left: roster.clientWidth + 6, behavior: 'smooth' }));
          roster.addEventListener('scroll', () => { state.scroll = roster.scrollLeft; fitRoster(); }, { passive: true });
          state.resize = new ResizeObserver(fitRoster); state.resize.observe(roster);
          const restoreScroll = state.scroll;
          requestAnimationFrame(() => { fitRoster(); roster.scrollLeft = restoreScroll; fitRoster(); });
        } else workspace.setAttribute('data-buio-single-panel', '');
        const stageHead = content.querySelector('.brawl-stage-head');
        const stages = content.querySelector('.brawl-stage-grid');
        if (stageHead && stages) {
          const acts = content.querySelector('.brawl-act-tabs');
          if (acts) {
            const label = document.createElement('label'); label.className = 'buio-brawl-act-select';
            label.append(document.createTextNode(text('篇章', 'Act')));
            const select = document.createElement('select'); select.setAttribute('aria-label', text('選擇篇章', 'Choose an act'));
            for (const act of acts.querySelectorAll('button')) {
              const option = document.createElement('option'); option.value = act.dataset.id;
              option.textContent = act.textContent; option.selected = act.classList.contains('selected'); select.append(option);
            }
            select.addEventListener('change', () => [...acts.querySelectorAll('button')].find(act => act.dataset.id === select.value)?.click());
            label.append(select); stageHead.append(label); metadata.append(acts);
          }
          // Keep the controller's selects as the source of truth, but present
          // game choices with full option names in a touch-friendly panel.
          for (const select of stageHead.querySelectorAll('select')) {
            const label = select.closest('label'); if (!label) continue;
            const caption = [...label.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent.trim()).join(' ') || select.getAttribute('aria-label') || '';
            select.hidden = true;
            const choice = button('', 'buio-game-choice');
            const title = document.createElement('span'); title.className = 'buio-choice-caption'; title.textContent = caption;
            const value = document.createElement('strong');
            choice.append(title, value); choice.setAttribute('aria-haspopup', 'dialog');
            const updateChoice = () => {
              const selected = select.selectedOptions[0];
              value.textContent = select.closest('.buio-brawl-act-select') ? (english ? 'Act ' + (select.selectedIndex + 1) : (selected?.textContent || '').replace(/^\s*\d+\s*/, '').split(/[·：:]/)[0].trim()) : selected?.textContent || '';
              choice.setAttribute('aria-label', caption + '：' + (selected?.textContent || ''));
            };
            select.addEventListener('change', updateChoice); updateChoice();
            choice.addEventListener('click', () => {
              openDialog(caption, []);
              const choices = document.createElement('div'); choices.className = 'buio-game-choices';
              for (const option of select.options) {
                const pick = button(option.textContent, 'buio-game-option'); pick.disabled = option.disabled;
                pick.setAttribute('aria-pressed', String(option.selected));
                pick.addEventListener('click', () => { closeDialog(); select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); });
                choices.append(pick);
              }
              dialog.append(choices);
            });
            label.append(choice); label.classList.add('buio-game-choice-label');
          }
          const footer = document.createElement('footer'); footer.className = 'buio-brawl-launch';
          const detail = button(text('詳情', 'Details'), 'buio-brawl-stage-info');
          let selectedCard;
          const picks = [...stages.querySelectorAll('.brawl-stage-card')];
          const chooseStage = card => {
            if (!card) return;
            selectedCard = card;
            const source = card.querySelector('[data-brawl="start"]'); if (!source) return;
            state.stage = source.dataset.stage;
            for (const other of picks) {
              const selected = other === card; other.toggleAttribute('data-buio-stage-selected', selected);
              other.querySelector('.buio-brawl-stage-pick')?.setAttribute('aria-pressed', String(selected));
            }
            const launch = source.cloneNode(true); launch.setAttribute('data-buio-brawl-start', '');
            launch.className = 'buio-brawl-start';
            footer.replaceChildren(detail, launch);
          };
          detail.addEventListener('click', () => {
            if (!selectedCard) return;
            const copy = selectedCard.cloneNode(true); copy.className = 'buio-brawl-stage-detail';
            copy.querySelector('.buio-brawl-stage-pick')?.remove(); copy.querySelector('[data-brawl="start"]')?.remove();
            openDialog(text('關卡詳情', 'Stage details'), [copy]);
          });
          for (const card of picks) {
            const pick = button('', 'buio-brawl-stage-pick');
            pick.setAttribute('aria-label', (card.querySelector('h3')?.textContent || '') + ' · ' + (card.querySelector('[data-brawl="start"]')?.textContent || ''));
            pick.addEventListener('click', () => chooseStage(card)); card.append(pick);
          }
          chooseStage(picks.find(card => card.querySelector('[data-brawl="start"]')?.dataset.stage === state.stage) ||
            picks.find(card => !card.querySelector('[data-brawl="start"]')?.disabled) || picks[0]);
          preparation.append(stageHead, stages, footer);
        }
        for (const child of original) {
          if (child.parentElement !== content) continue;
          if (child.matches('.pvp-panel,.rank-summary,.rank-leaderboard,.ranked-leaderboard,.brawl-notice')) preparation.append(child);
          else metadata.append(child);
        }
        // Unknown future lobby panels stay reachable in the preparation pane.
        for (const child of [...metadata.children]) {
          if (!child.matches('.brawl-heading,.brawl-adventure-intro,.brawl-kit-note,.brawl-note,.brawl-act-tabs,.brawl-resume')) preparation.append(child);
        }
        if (preparation.querySelector('.pvp-panel')) preparation.setAttribute('data-buio-online', '');
        workspace.append(preparation);
        content.append(toolbar, workspace, metadata, dialog);
      };
      const observer = new MutationObserver(enhance);
      observer.observe(root, { childList: true }); current = { root, state, observer };
      enhance();
    };
    new MutationObserver(watch).observe(surface, { childList: true }); watch();
  }
  let lastPresentation = '';
  function updatePresentation() {
    if (!document.body) return;
    const root = document.documentElement;
    const module = root.getAttribute('data-buio-module');
    const petScreen = document.querySelector('.pet-shell')?.getAttribute('data-screen') || '';
    const fullscreen = ['pet', 'science-lab', 'whiteboard'].includes(module) ||
      Boolean(document.querySelector('#gameCanvas, #game-container, #gameContainer'));
    root.setAttribute('data-buio-layout', fullscreen ? 'fullscreen' : 'document');
    const palette = {
      pet: '#f3e7d6', 'science-lab': '#082f3d', math: '#0b0e1a',
      games: '#0d1023', game: '#111827', 'tower-defense': '#101b30'
    };
    const background = palette[module] || '#f6f8fb';
    root.style.setProperty('--buio-chrome-background', background);
    const battle = Boolean(document.querySelector('.pet-shell.brawl-active'));
    const gameCanvas = Boolean(document.querySelector('#rotateNotice, #gameCanvas'));
    const immersive = module === 'science-lab' || gameCanvas || battle || (module === 'pet' && ['park', 'coin-pusher'].includes(petScreen));
    root.setAttribute('data-buio-immersive', String(immersive));
    const petRoom = module === 'pet' && !document.querySelector('.pet-shell.brawl-open') &&
      (Boolean(document.querySelector('.teacher-shell')) || ['', 'home', 'decorate'].includes(petScreen));
    const portrait = petRoom;
    const landscape = (module === 'pet' && !portrait) || module === 'science-lab' || battle || gameCanvas;
    const message = { immersive, landscape, portrait, background, lightStatus: ['math', 'games', 'game', 'tower-defense', 'science-lab'].includes(module) };
    const serialized = JSON.stringify(message);
    if (serialized !== lastPresentation) {
      window.webkit?.messageHandlers?.buioLayout?.postMessage(message);
      lastPresentation = serialized;
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', finishLayout, { once: true });
  else finishLayout();
  // Dynamic forms need the same minimum before iOS focuses the field. Larger
  // authored text (for example the maths answer box) keeps its original size.
  document.addEventListener('pointerdown', event => fitFormField(event.target.closest?.(formSelector)), true);
  document.addEventListener('focusin', event => fitFormField(event.target), true);
  const editableTarget = target => {
    const element = target instanceof Element ? target : target?.parentElement;
    return Boolean(element?.closest('input,textarea') || element?.isContentEditable);
  };
  for (const type of ['contextmenu', 'selectstart']) {
    document.addEventListener(type, event => { if (!editableTarget(event.target)) event.preventDefault(); }, true);
  }
  addEventListener('pageshow', updatePresentation);
  addEventListener('popstate', updatePresentation);
  let notice;
  const refresh = () => {
    if (!document.body) return;
    if (navigator.onLine !== false) { notice?.remove(); notice = undefined; return; }
    if (notice) return;
    notice = document.createElement('div');
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.textContent = '網絡已中斷，正在等待重新連線';
    // A transient network notice, not a fixed app toolbar over game controls.
    notice.style.cssText = 'position:fixed;left:12px;right:12px;top:max(12px,env(safe-area-inset-top));z-index:2147483647;padding:12px 16px;border-radius:10px;background:#273f3c;color:white;font:14px -apple-system,sans-serif;text-align:center;pointer-events:none;box-shadow:0 3px 16px #0002';
    document.body.append(notice);
  };
  addEventListener('online', refresh);
  addEventListener('offline', refresh);
  document.addEventListener('DOMContentLoaded', refresh, { once: true });
})();
