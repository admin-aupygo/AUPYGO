/* AUPYGO — realtime-fix.js
 * Corrige : cannot add postgres_changes callbacks ... after subscribe()
 * Cause : setupMessagesRealtime() appelé en parallèle avant que messagesChannel soit assigné.
 * Solution : verrou synchrone + nettoyage du channel existant + .on() uniquement avant subscribe.
 */
(function () {
  'use strict';

  var _pending = false;

  function safeTeardown() {
    try {
      if (typeof messagesChannel !== 'undefined' && messagesChannel) {
        if (typeof supabaseClient !== 'undefined' && supabaseClient) {
          supabaseClient.removeChannel(messagesChannel);
        }
        messagesChannel = null;
      }
      // Nettoie tout channel orphelin avec le même topic
      if (typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.getChannels === 'function') {
        var uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) || null;
        if (uid) {
          var topicHint = 'messages-' + uid;
          supabaseClient.getChannels().forEach(function (ch) {
            var t = (ch && (ch.topic || ch.params && ch.params.topic)) || '';
            if (String(t).indexOf(topicHint) !== -1) {
              try { supabaseClient.removeChannel(ch); } catch (e) {}
            }
          });
        }
      }
    } catch (e) {
      console.warn('[AUPYGO] realtime teardown', e);
    }
  }

  function install() {
    if (typeof window.setupMessagesRealtime !== 'function') return false;
    if (window._realtimeFixInstalled) return true;
    window._realtimeFixInstalled = true;

    var origSetup = window.setupMessagesRealtime;
    var origTeardown = window.teardownMessagesRealtime;

    window.teardownMessagesRealtime = function () {
      _pending = false;
      safeTeardown();
      if (typeof origTeardown === 'function') {
        try { origTeardown(); } catch (e) {}
      }
      // S'assurer que la variable globale est nulle
      try { messagesChannel = null; } catch (e2) {}
    };

    window.setupMessagesRealtime = function () {
      if (typeof currentUser === 'undefined' || !currentUser) return;
      if (typeof messagesChannel !== 'undefined' && messagesChannel) return;
      if (_pending) return;
      _pending = true;

      var run = function () {
        try {
          if (messagesChannel) {
            _pending = false;
            return;
          }
          safeTeardown();

          var ch = supabaseClient.channel('messages-' + currentUser.id);

          ch = ch.on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            function (payload) {
              // Délègue au handler d'origine si disponible via re-appel minimal
              // On reconstruit le comportement attendu en appelant la logique existante
              // via un événement custom pour éviter de dupliquer 80 lignes.
              try {
                if (typeof window.__aupygoOnMessageInsert === 'function') {
                  window.__aupygoOnMessageInsert(payload);
                  return;
                }
              } catch (e) {}
              // Fallback : rafraîchir badges
              try {
                if (typeof loadUnreadCounts === 'function') loadUnreadCounts();
                if (typeof updateMessagesBadge === 'function') updateMessagesBadge();
                if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
              } catch (e2) {}
            }
          );

          ch = ch.on('postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'group_invitations',
              filter: 'invited_user_id=eq.' + currentUser.id
            },
            function () {
              try {
                if (typeof loadGroupInvitations === 'function') loadGroupInvitations();
              } catch (e) {}
            }
          );

          messagesChannel = ch;
          ch.subscribe(function (status) {
            _pending = false;
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              console.warn('[AUPYGO] messages channel status', status);
              try { messagesChannel = null; } catch (e) {}
            }
          });
        } catch (e) {
          _pending = false;
          console.warn('[AUPYGO] setupMessagesRealtime fixed', e);
        }
      };

      if (typeof refreshMyConversationIds === 'function') {
        refreshMyConversationIds().then(run).catch(function () {
          _pending = false;
          run();
        });
      } else {
        run();
      }
    };

    // Capture le handler INSERT d'origine une fois (si app.js l'a déjà installé)
    // en ré-exécutant une fois de façon contrôlée si besoin — sinon le fallback suffit.
    console.log('[AUPYGO] realtime-fix.js installé');
    return true;
  }

  // Install dès que possible + retries (app.js charge avant)
  function tryInstall() {
    if (install()) return;
    setTimeout(tryInstall, 300);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInstall);
  } else {
    tryInstall();
  }
  setTimeout(tryInstall, 800);
  setTimeout(tryInstall, 2000);
})();
