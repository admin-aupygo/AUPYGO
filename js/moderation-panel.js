/* ==========================================================================
 * AUPYGO — moderation-panel.js v3.0
 *
 * Charge automatiquement le nouvel espace Modérateur (moderation-space.js).
 * Aucune modification de index.html nécessaire.
 * L’ancien panneau « Sanctions » est remplacé proprement.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__aupygoModerationPanel) return;
  window.__aupygoModerationPanel = true;

  // Charge le nouvel espace dès que possible
  function loadModerationSpace() {
    if (window.__aupygoModerationSpace) return;
    var existing = document.querySelector('script[src*="moderation-space"]');
    if (existing) return;

    var s = document.createElement('script');
    s.src = 'js/moderation-space.js?v=20261118';
    s.async = true;
    s.onerror = function () {
      console.warn('[AUPYGO] Impossible de charger moderation-space.js');
    };
    document.head.appendChild(s);
  }

  // Essaye plusieurs fois au cas où le DOM n’est pas encore prêt
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadModerationSpace);
  } else {
    loadModerationSpace();
  }
  setTimeout(loadModerationSpace, 300);
  setTimeout(loadModerationSpace, 1200);

  console.log('[AUPYGO] moderation-panel.js v3.0 — charge moderation-space.js');
})();
