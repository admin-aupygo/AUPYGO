/* ==========================================================================
 * AUPYGO — moderation-panel.js v2.2
 *
 * ANCIEN panneau « Sanctions ».
 * Désactivé volontairement : l’espace complet est maintenant dans
 * js/moderation-space.js (bouton « Modération »).
 *
 * On laisse le fichier en place pour ne pas casser d’éventuels caches
 * ou références, mais il ne crée plus de bouton ni d’UI.
 * ========================================================================== */
(function () {
  'use strict';
  if (window.__aupygoModerationPanel) return;
  window.__aupygoModerationPanel = true;

  // Plus de bouton / plus d’UI. Tout est géré par moderation-space.js
  console.log('[AUPYGO] moderation-panel.js v2.2 — désactivé (remplacé par moderation-space.js)');
})();
