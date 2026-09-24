/* AUPYGO staff-realtime-fix.js
 * Empêche le double setupMessagesRealtime (erreur supabase
 * "cannot add postgres_changes callbacks after subscribe").
 * Chargé après app.js — sans dépendre de isStaff.
 */
(function () {
  'use strict';

  if (typeof window.setupMessagesRealtime !== 'function') return;
  if (window._staffRtFixApplied) return;
  window._staffRtFixApplied = true;

  var _orig = window.setupMessagesRealtime;
  window.setupMessagesRealtime = function () {
    // Verrou synchrone : évite 2 appels pendant le .then() async d'origine
    if (window._messagesRealtimeLock) return;
    window._messagesRealtimeLock = true;
    try {
      return _orig.apply(this, arguments);
    } catch (e) {
      window._messagesRealtimeLock = false;
      console.warn('[AUPYGO] setupMessagesRealtime', e);
    }
  };

  // Si teardown existe, libérer le verrou
  if (typeof window.teardownMessagesRealtime === 'function') {
    var _tear = window.teardownMessagesRealtime;
    window.teardownMessagesRealtime = function () {
      var r = _tear.apply(this, arguments);
      window._messagesRealtimeLock = false;
      return r;
    };
  }

  console.log('[AUPYGO] staff-realtime-fix.js chargé');
})();
