// Shared i18n runtime for every BuiO module page.
//
// The hub's language switch is the single source of truth. It writes the choice
// to the user record, and the server echoes it back as a plain `buiLang` cookie
// so any module page can read it synchronously — no fetch, no flash of the
// wrong language before the first paint.
//
// Load order in <head>, both blocking:
//   <script src="/shared/i18n.js"></script>
//   <script src="/shared/i18n/<module>.js"></script>
// then call BuiI18n.t(key) for dynamic strings; static markup is handled by
// data-i18n attributes, applied automatically once the DOM is parsed.
(function () {
  'use strict';

  var DEFAULT = 'zh-HK';
  var SUPPORTED = ['zh-HK', 'en-US'];

  function fromCookie() {
    var m = /(?:^|;\s*)buiLang=([^;]+)/.exec(document.cookie || '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  function fromStorage() {
    try {
      var raw = localStorage.getItem('buiSettings');
      if (!raw) return null;
      return JSON.parse(raw).language || null;
    } catch (e) { return null; }
  }

  function fromQuery() {
    var m = /[?&]lang=([^&]+)/.exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function normalize(value) {
    if (!value) return null;
    if (SUPPORTED.indexOf(value) >= 0) return value;
    // Tolerate bare tags so a link can say ?lang=en without knowing the region.
    var lower = String(value).toLowerCase();
    if (lower.indexOf('en') === 0) return 'en-US';
    if (lower.indexOf('zh') === 0) return 'zh-HK';
    return null;
  }

  var lang = normalize(fromQuery()) || normalize(fromCookie()) || normalize(fromStorage()) || DEFAULT;
  var dict = {};

  // The markup ships in Chinese, so a Chinese reader needs no rewrite at all and
  // never sees the veil. Only the translated path pays for it, and only until
  // the DOM is ready.
  var veiled = false;
  function veil() {
    if (veiled || lang === DEFAULT || !document.documentElement) return;
    veiled = true;
    document.documentElement.style.visibility = 'hidden';
  }
  function unveil() {
    if (!veiled) return;
    veiled = false;
    document.documentElement.style.visibility = '';
  }
  veil();
  // Never let a scripting error leave the page invisible.
  setTimeout(unveil, 2000);

  function register(entries) {
    if (!entries) return;
    for (var key in entries) {
      if (Object.prototype.hasOwnProperty.call(entries, key)) dict[key] = entries[key];
    }
  }

  function lookup(key) {
    var row = dict[key];
    if (!row) return null;
    if (typeof row === 'string') return row;
    return row[lang] != null ? row[lang] : (row[DEFAULT] != null ? row[DEFAULT] : null);
  }

  // t('key') returns the key itself when nothing is registered, which keeps a
  // missing translation visible in testing instead of blanking the UI.
  function t(key, vars) {
    var out = lookup(key);
    if (out == null) return key;
    if (vars) {
      out = out.replace(/\{(\w+)\}/g, function (whole, name) {
        return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
      });
    }
    return out;
  }

  // Pick between two literals without inventing a dictionary key. Useful inside
  // module code for one-off strings that are not worth naming.
  function pick(zh, en) {
    return lang === 'en-US' ? en : zh;
  }

  // Some data files carry their Chinese inline rather than behind a key,
  // because the build scripts and tests import them under Node where no
  // dictionary exists and the authored text has to stand on its own. Those
  // files call a translator keyed on the Chinese original instead.
  function translator(prefix) {
    var map = null;
    return function (text, vars) {
      if (lang === DEFAULT || typeof text !== 'string') return text;
      if (!map) {
        map = {};
        for (var key in dict) {
          if (prefix && key.indexOf(prefix) !== 0) continue;
          var row = dict[key];
          if (row && row[DEFAULT] != null && row[lang] != null) map[row[DEFAULT]] = row[lang];
        }
      }
      var hit = map[text];
      var out = hit == null ? text : hit;
      if (vars) {
        out = out.replace(/\{(\w+)\}/g, function (whole, name) {
          return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole;
        });
      }
      return out;
    };
  }

  // A message the server wrote in Chinese. HTTP replies are translated by the
  // response middleware, but socket acknowledgements arrive raw, so pages that
  // show one run it through the same table (loaded via /shared/server-i18n.js).
  function server(text) {
    if (lang === DEFAULT || !text || !window.BuiServerI18n) return text;
    return window.BuiServerI18n.translate(text);
  }

  function applyAttrs(node) {
    var spec = node.getAttribute('data-i18n-attr');
    if (!spec) return;
    spec.split(';').forEach(function (pair) {
      var bits = pair.split(':');
      if (bits.length !== 2) return;
      var attr = bits[0].trim();
      var key = bits[1].trim();
      if (!attr || !key) return;
      var value = lookup(key);
      if (value != null) node.setAttribute(attr, value);
    });
  }

  function apply(root) {
    var scope = root || document;
    var nodes = scope.querySelectorAll('[data-i18n],[data-i18n-html],[data-i18n-attr]');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var htmlKey = node.getAttribute('data-i18n-html');
      if (htmlKey) {
        var html = lookup(htmlKey);
        if (html != null) node.innerHTML = html;
      } else {
        var textKey = node.getAttribute('data-i18n');
        if (textKey) {
          var text = lookup(textKey);
          if (text != null) node.textContent = text;
        }
      }
      applyAttrs(node);
    }
    if (scope === document) {
      document.documentElement.setAttribute('lang', lang);
    }
  }

  function ready() {
    apply(document);
    unveil();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }

  window.BuiI18n = {
    lang: lang,
    isEnglish: lang === 'en-US',
    default: DEFAULT,
    register: register,
    t: t,
    pick: pick,
    server: server,
    translator: translator,
    apply: apply,
    // Locale tag for Intl / toLocaleString callers.
    locale: lang === 'en-US' ? 'en-US' : 'zh-HK'
  };
  // Module code reads `t(...)` constantly; a bare global keeps call sites short.
  window.t = t;
})();
