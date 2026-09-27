/* AUPYGO staff-profile-layout-fix.js — empêche le profil de "balader" en bas */
(function () {
  'use strict';
  if (!document.getElementById('staffProfileLayoutFix')) {
    var st = document.createElement('style');
    st.id = 'staffProfileLayoutFix';
    st.textContent =
      '#profile .profile-layout { align-items: start; }' +
      '#profile .profile-card { position: relative !important; top: auto !important; }' +
      '#profile.page.active { padding-bottom: 40px; }' +
      '#profile .profile-form-card { order: 0; }' +
      '@media (max-width: 768px) {' +
      '  #profile .profile-layout { display: flex; flex-direction: column; }' +
      '  #profile .profile-card { position: relative !important; order: -1; margin-bottom: 16px; }' +
      '}';
    document.head.appendChild(st);
  }
  console.log('[AUPYGO] staff-profile-layout-fix');
})();
