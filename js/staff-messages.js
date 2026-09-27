/* AUPYGO staff-messages.js v6.4-loader — restaure le module complet depuis commit stable */
(function () {
  'use strict';
  if (window._staffMessagesLoading) return;
  window._staffMessagesLoading = true;

  var URLS = [
    'https://cdn.jsdelivr.net/gh/admin-aupygo/AUPYGO@5994e2c5002e76dc28d35179ff2ea16dfc355867/js/staff-messages.js',
    'https://raw.githack.com/admin-aupygo/AUPYGO/5994e2c5002e76dc28d35179ff2ea16dfc355867/js/staff-messages.js',
    'https://raw.githubusercontent.com/admin-aupygo/AUPYGO/5994e2c5002e76dc28d35179ff2ea16dfc355867/js/staff-messages.js'
  ];

  function applyPostPatches() {
    // 1) Amis → Équipe
    try {
      document.querySelectorAll('#messages .conv-section-label, #messages h2, #messages h3, #messages h4, #messages .section-title').forEach(function (el) {
        var t = (el.textContent || '').trim();
        if (/^amis$/i.test(t) || /^staff$/i.test(t)) el.textContent = 'Équipe';
      });
    } catch (e) {}

    // 2) Qui parle : forcer le label expéditeur sur les bulles existantes
    try {
      document.querySelectorAll('#chatMessages .staff-msg-wrap, #chatMessages .bubble').forEach(function (node) {
        // déjà géré par appendNamedBubble du module restauré
      });
    } catch (e2) {}
  }

  function patchRoleQuery() {
    // Patch loadStaffMembers si présent pour inclure tous les grades
    // (le module original charge admin_general/host ; hierarchy normalise)
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.async = false;
      s.onload = function () { resolve(url); };
      s.onerror = function () { reject(new Error('fail ' + url)); };
      document.head.appendChild(s);
    });
  }

  async function boot() {
    var ok = false;
    for (var i = 0; i < URLS.length; i++) {
      try {
        await loadScript(URLS[i] + '?v=restore64');
        ok = true;
        console.log('[AUPYGO] staff-messages restauré depuis', URLS[i]);
        break;
      } catch (e) {
        console.warn('[AUPYGO] fallback staff-messages', e);
      }
    }
    if (!ok) {
      console.error('[AUPYGO] Impossible de restaurer staff-messages.js');
      return;
    }

    // Patch labels Amis → Équipe en continu
    setInterval(function () {
      try {
        document.querySelectorAll('#messages .conv-section-label, #messages h2, #messages h3, #messages h4, #messages .section-title, #messages .conv-section-title').forEach(function (el) {
          var t = (el.textContent || '').trim();
          if (/^amis$/i.test(t) || /^staff$/i.test(t)) el.textContent = 'Équipe';
        });
      } catch (e) {}
    }, 1500);

    // Re-applique l UI messages staff si dispo
    setTimeout(function () {
      if (typeof window.applyStaffMessagesUI === 'function') {
        try { window.applyStaffMessagesUI(); } catch (e) {}
      }
      applyPostPatches();
    }, 800);
    setTimeout(function () {
      if (typeof window.applyStaffMessagesUI === 'function') {
        try { window.applyStaffMessagesUI(); } catch (e) {}
      }
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
