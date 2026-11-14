// Runs before the original laboratory bundle. No platform service is needed.
(() => {
  const dictionary = Object.create(null);
  let initialLanguage = 'zh-HK';
  try { if (localStorage.getItem('air-lab:language') === 'en-US') initialLanguage = 'en-US'; } catch {}
  window.BuiI18n = {
    lang: initialLanguage, locale: initialLanguage, isEnglish: initialLanguage === 'en-US',
    register(entries) { Object.assign(dictionary, entries); },
    t(key, values = {}) {
      const row = dictionary[key];
      const text = typeof row === 'string' ? row : row?.[window.BuiI18n.lang] ?? row?.['zh-HK'] ?? key;
      return text.replace(/\{(\w+)\}/g, (match, name) => Object.hasOwn(values, name) ? String(values[name]) : match);
    },
    sceneLabel(text) { return text; },
    pick(zh, en) { return this.lang === 'en-US' ? en : zh; },
    setLanguage(language) {
      this.lang = language === 'en-US' ? 'en-US' : 'zh-HK';
      this.locale = this.lang;
      this.isEnglish = this.lang === 'en-US';
      window.BuioStandaloneStorage.setItem('air-lab:language', this.lang);
      this.apply();
    },
    apply() {
      document.documentElement.lang = this.lang;
      for (const node of document.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-attr]')) {
        if (node.dataset.i18nHtml) node.innerHTML = this.t(node.dataset.i18nHtml);
        else if (node.dataset.i18n) node.textContent = this.t(node.dataset.i18n);
        for (const pair of (node.dataset.i18nAttr || '').split(';')) {
          const [attribute, key] = pair.split(':');
          if (attribute && key) node.setAttribute(attribute.trim(), this.t(key.trim()));
        }
      }
    },
  };

  // Sandboxed embed blocks can deny localStorage. The experiment still runs;
  // in that case its notebook lasts only until this embed is reloaded.
  const memory = new Map();
  window.BuioStandaloneStorage = {
    getItem(key) {
      try { return localStorage.getItem(key) ?? memory.get(key) ?? null; }
      catch { return memory.get(key) ?? null; }
    },
    setItem(key, value) {
      memory.set(key, value);
      try { localStorage.setItem(key, value); } catch { /* Session memory is sufficient. */ }
    },
  };

  window.BuiLoading = {
    recover(error, retry, host = document.querySelector('#bootScreen')) {
      console.error('Standalone experiment could not start.', error);
      host.classList.remove('done');
      host.replaceChildren();
      const message = document.createElement('p');
      message.textContent = '實驗未能啟動，請重新載入或使用支援 WebGL 的瀏覽器。';
      const button = document.createElement('button');
      button.className = 'primary-button';
      button.textContent = '重新嘗試';
      button.onclick = retry || (() => location.reload());
      host.append(message, button);
    },
  };
})();
