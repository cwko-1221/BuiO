// Installed at document start by the native iOS host. This does not modify
// requests, authentication, gameplay, input timing or authoritative results.
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
    if (document.documentElement.getAttribute('data-buio-module') === 'pet') {
      const attach = () => {
        const shell = document.querySelector('.pet-shell');
        if (shell) {
          new MutationObserver(updatePresentation).observe(shell, { attributes: true, attributeFilter: ['data-screen', 'class'] });
          setupPetNavigation(shell);
          setupPetBrawl(shell);
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
            const rows = Math.max(1, Math.min(4, Math.floor((height + 6) / (short ? 68 : 106))));
            const cardWidth = (width - 6 * (columns - 1)) / columns;
            roster.style.gridAutoColumns = cardWidth + 'px';
            roster.style.gridTemplateRows = `repeat(${rows},minmax(0,1fr))`;
            roster.style.setProperty('--buio-fighter-art', Math.max(30, Math.min(72, (height - 6 * (rows - 1)) / rows - 32)) + 'px');
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
    const landscape = module === 'pet' || module === 'science-lab' || battle || gameCanvas;
    const message = { immersive, landscape, background, lightStatus: ['math', 'games', 'game', 'tower-defense', 'science-lab'].includes(module) };
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
