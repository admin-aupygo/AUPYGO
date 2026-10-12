/* AUPYGO — thème clair / sombre
 * Applique data-theme, mémorise le choix, affiche le bouton slide.
 * Les couleurs viennent UNIQUEMENT de dark-theme.css (pas de CSS injecté ici).
 */
(function () {
  'use strict';
  var KEY = 'aupygo_theme';
  var root = document.documentElement;

  function readSaved() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function save(v) {
    try { localStorage.setItem(KEY, v); } catch (e) {}
  }
  function systemTheme() {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) { return 'light'; }
  }
  function current() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m && document.head) {
      m = document.createElement('meta');
      m.name = 'theme-color';
      document.head.appendChild(m);
    }
    if (m) m.setAttribute('content', theme === 'dark' ? '#14121b' : '#ffffff');
    syncSwitch();
  }

  /* Bouton slide uniquement (styles minimaux) */
  var SWITCH_CSS =
    '.theme-toggle-row{display:flex;align-items:center;justify-content:center;gap:10px;margin:12px auto 6px;font-size:13px;font-weight:600;color:var(--muted,#777)}' +
    '.theme-switch{position:relative;width:48px;height:26px;padding:0;border-radius:999px;cursor:pointer;flex:none;' +
    'border:1px solid rgba(124,58,237,.25);background:linear-gradient(135deg,#fde68a,#fbbf24);transition:background .35s,border-color .35s}' +
    '.theme-switch:focus-visible{outline:2px solid #a78bfa;outline-offset:3px}' +
    '.theme-switch .ts-knob{position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;' +
    'display:flex;align-items:center;justify-content:center;font-size:12px;transition:transform .3s;box-shadow:0 1px 4px rgba(0,0,0,.2)}' +
    'html[data-theme="dark"] .theme-switch{background:linear-gradient(135deg,#4c1d95,#7c3aed);border-color:rgba(167,139,250,.4)}' +
    'html[data-theme="dark"] .theme-switch .ts-knob{transform:translateX(22px);background:#1f1b30}';

  function injectSwitchCss() {
    if (document.getElementById('aupygo-theme-switch-css')) return;
    var s = document.createElement('style');
    s.id = 'aupygo-theme-switch-css';
    s.textContent = SWITCH_CSS;
    document.head.appendChild(s);
  }

  function syncSwitch() {
    var sw = document.getElementById('themeSwitch');
    if (!sw) return;
    var isDark = current() === 'dark';
    sw.setAttribute('aria-checked', isDark ? 'true' : 'false');
    var knob = sw.querySelector('.ts-knob');
    if (knob) knob.textContent = isDark ? '🌙' : '☀️';
  }

  function ensureSwitch() {
    if (document.getElementById('themeSwitch')) {
      syncSwitch();
      return;
    }
    injectSwitchCss();

    var row = document.createElement('div');
    row.className = 'theme-toggle-row';
    row.innerHTML =
      '<span>Clair</span>' +
      '<button type="button" id="themeSwitch" class="theme-switch" role="switch" aria-checked="false" aria-label="Basculer clair/sombre">' +
      '<span class="ts-knob">☀️</span></button>' +
      '<span>Sombre</span>';

    var host =
      document.getElementById('profile') ||
      document.querySelector('.profile-form-card') ||
      document.querySelector('#aupygo-plan-panel') ||
      document.querySelector('main');
    if (host) {
      if (host.firstChild) host.insertBefore(row, host.firstChild);
      else host.appendChild(row);
    }

    var sw = document.getElementById('themeSwitch');
    if (sw) {
      sw.addEventListener('click', function () {
        var next = current() === 'dark' ? 'light' : 'dark';
        save(next);
        apply(next);
      });
    }
    syncSwitch();
  }

  // Appliquer le thème le plus tôt possible
  var saved = readSaved();
  var initial = (saved === 'dark' || saved === 'light') ? saved : systemTheme();
  apply(initial);

  // Bouton quand le DOM est prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureSwitch);
  } else {
    ensureSwitch();
  }
  // Au cas où la page profil se charge plus tard
  setTimeout(ensureSwitch, 800);
  setTimeout(ensureSwitch, 2000);

  window.aupygoSetTheme = function (t) {
    if (t !== 'dark' && t !== 'light') return;
    save(t);
    apply(t);
  };

  console.log('[AUPYGO] theme-toggle — soft mode (CSS via dark-theme.css)');
})();
