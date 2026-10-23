/* AUPYGO — admin-amiral-ui.js
 * Dark mode + lisibilité page Amiral (stats, table, panneaux)
 */
(function () {
  'use strict';

  var STYLE_ID = 'aupygo-admin-amiral-ui';

  function injectCss() {
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement('style');
    st.id = STYLE_ID;
    st.textContent = [
      '.admin-stat-card{',
      '  background:linear-gradient(145deg,#faf8ff,#f3edff)!important;',
      '  border:1px solid #e9e0ff!important;',
      '  border-radius:16px!important;',
      '  padding:18px 14px!important;',
      '  text-align:center!important;',
      '  box-shadow:0 4px 16px rgba(124,58,237,.08)!important;',
      '}',
      '.admin-stat-value{font-size:28px;font-weight:800;color:#7c3aed!important}',
      '.admin-stat-label{font-size:12px;color:#64748b!important;margin-top:4px;font-weight:600}',

      'html[data-theme="dark"] .admin-stat-card{',
      '  background:linear-gradient(145deg,#1e1b2e,#2a2540)!important;',
      '  border:1px solid #3a3452!important;',
      '  box-shadow:0 4px 20px rgba(0,0,0,.35)!important;',
      '}',
      'html[data-theme="dark"] .admin-stat-value{color:#c4b0ff!important}',
      'html[data-theme="dark"] .admin-stat-label{color:#94a3b8!important}',

      'html[data-theme="dark"] #admin{color:#e2e8f0!important}',
      'html[data-theme="dark"] #admin .section-title h2,',
      'html[data-theme="dark"] #admin h2{color:#e9e5ff!important}',
      'html[data-theme="dark"] #admin .section-title p,',
      'html[data-theme="dark"] #admin p{color:#94a3b8!important}',

      'html[data-theme="dark"] #admin [style*="background:#fff"],',
      'html[data-theme="dark"] #admin [style*="background: #fff"],',
      'html[data-theme="dark"] #admin [style*="background:#ffffff"],',
      'html[data-theme="dark"] #admin [style*="background:#f8fafc"],',
      'html[data-theme="dark"] #admin [style*="background: #f8fafc"]{',
      '  background:var(--d-surface,#1e1b2e)!important;',
      '  border-color:var(--d-border,#3a3452)!important;',
      '  color:var(--d-text,#e2e8f0)!important;',
      '  box-shadow:0 4px 20px rgba(0,0,0,.3)!important;',
      '}',

      'html[data-theme="dark"] #admin input,',
      'html[data-theme="dark"] #admin select,',
      'html[data-theme="dark"] #admin textarea{',
      '  background:#2a2540!important;',
      '  color:#e2e8f0!important;',
      '  border-color:#3a3452!important;',
      '}',
      'html[data-theme="dark"] #admin input::placeholder{color:#64748b!important}',

      'html[data-theme="dark"] #admin table{background:transparent!important;color:#e2e8f0!important}',
      'html[data-theme="dark"] #admin thead tr,',
      'html[data-theme="dark"] #admin th{',
      '  background:#2a2540!important;',
      '  color:#94a3b8!important;',
      '  border-color:#3a3452!important;',
      '}',
      'html[data-theme="dark"] #admin td{',
      '  color:#e2e8f0!important;',
      '  border-color:#3a3452!important;',
      '}',
      'html[data-theme="dark"] #admin tbody tr:hover{background:#2a2540!important}',

      'html[data-theme="dark"] #admin .btn-secondary,',
      'html[data-theme="dark"] #admin button.btn-secondary{',
      '  background:#2a2540!important;',
      '  color:#c4b0ff!important;',
      '  border-color:#3a3452!important;',
      '}',
      'html[data-theme="dark"] #admin .btn-primary{',
      '  background:#6d4aff!important;',
      '  color:#fff!important;',
      '  border-color:#6d4aff!important;',
      '}',

      'html[data-theme="dark"] #aupygo-plan-panel,',
      'html[data-theme="dark"] #planUserList,',
      'html[data-theme="dark"] #promoList{',
      '  background:#1e1b2e!important;',
      '  color:#e2e8f0!important;',
      '  border-color:#3a3452!important;',
      '}',
      'html[data-theme="dark"] #aupygo-plan-panel input,',
      'html[data-theme="dark"] #aupygo-plan-panel select{',
      '  background:#2a2540!important;',
      '  color:#e2e8f0!important;',
      '  border-color:#3a3452!important;',
      '}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function paintAdminSurfaces() {
    var admin = document.getElementById('admin');
    if (!admin) return;
    var isDark = (document.documentElement.getAttribute('data-theme') === 'dark');
    if (!isDark) return;

    admin.querySelectorAll('[style]').forEach(function (el) {
      var s = el.getAttribute('style') || '';
      if (/background\s*:\s*#fff/i.test(s) || /background\s*:\s*#ffffff/i.test(s) ||
          /background\s*:\s*#f8fafc/i.test(s) || /background\s*:\s*white/i.test(s)) {
        el.style.setProperty('background', '#1e1b2e', 'important');
        el.style.setProperty('border-color', '#3a3452', 'important');
        el.style.setProperty('color', '#e2e8f0', 'important');
      }
      if (/color\s*:\s*#64748b/i.test(s) || /color\s*:\s*#475569/i.test(s)) {
        el.style.setProperty('color', '#94a3b8', 'important');
      }
    });

    admin.querySelectorAll('.admin-stat-card').forEach(function (c) {
      c.style.setProperty('background', 'linear-gradient(145deg,#1e1b2e,#2a2540)', 'important');
      c.style.setProperty('border-color', '#3a3452', 'important');
    });
    admin.querySelectorAll('.admin-stat-value').forEach(function (c) {
      c.style.setProperty('color', '#c4b0ff', 'important');
    });
    admin.querySelectorAll('.admin-stat-label').forEach(function (c) {
      c.style.setProperty('color', '#94a3b8', 'important');
    });
  }

  function tick() {
    injectCss();
    paintAdminSurfaces();
  }

  tick();
  setTimeout(tick, 500);
  setTimeout(tick, 1500);
  setTimeout(tick, 3000);
  setInterval(function () {
    if (document.getElementById('admin')) tick();
  }, 2500);

  try {
    var obs = new MutationObserver(function () {
      if (document.getElementById('admin')) tick();
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  } catch (e) {}

  console.log('[AUPYGO] admin-amiral-ui.js — dark + lisibilité Amiral');
})();
