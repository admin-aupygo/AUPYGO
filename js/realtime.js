/* AUPYGO — realtime-fix.js
 * Corrige : cannot add postgres_changes callbacks after subscribe()
 * Race : setupMessagesRealtime() appelé 2× avant assignation de messagesChannel.
 */
(function () {
  'use strict';

  var _pending = false;

  function removeStaleChannels(uid) {
    if (!uid || typeof supabaseClient === 'undefined' || !supabaseClient) return;
    try {
      if (typeof supabaseClient.getChannels === 'function') {
        var hint = 'messages-' + uid;
        supabaseClient.getChannels().slice().forEach(function (ch) {
          var t = String((ch && ch.topic) || '');
          if (t.indexOf(hint) !== -1) {
            try { supabaseClient.removeChannel(ch); } catch (e) {}
          }
        });
      }
    } catch (e) {}
  }

  function safeTeardown() {
    _pending = false;
    try {
      if (typeof messagesChannel !== 'undefined' && messagesChannel) {
        try { supabaseClient.removeChannel(messagesChannel); } catch (e) {}
        messagesChannel = null;
      }
      var uid = (typeof currentUser !== 'undefined' && currentUser && currentUser.id) || null;
      removeStaleChannels(uid);
    } catch (e) {
      console.warn('[AUPYGO] realtime teardown', e);
    }
  }

  function buildChannel() {
    var uid = currentUser.id;

    var ch = supabaseClient.channel('messages-' + uid);

    ch = ch.on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      function (payload) {
        try {
          var msg = payload.new;
          if (!msg || msg.sender_id === currentUser.id) return;

          if (typeof myConversationIds !== 'undefined' && myConversationIds && !myConversationIds.has(msg.conversation_id)) {
            if (typeof refreshMyConversationIds === 'function') {
              refreshMyConversationIds().then(function () {
                if (myConversationIds.has(msg.conversation_id)) {
                  if (typeof loadUnreadCounts === 'function') loadUnreadCounts();
                  if (typeof loadMyGroups === 'function') {
                    loadMyGroups().then(function () {
                      if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
                    });
                  }
                }
              });
            }
            return;
          }

          var isConversationOpen = typeof activeConversation !== 'undefined' && activeConversation
            && (activeConversation.type === 'dm' || activeConversation.type === 'group')
            && activeConversation.conversationId === msg.conversation_id
            && typeof getActivePage === 'function' && getActivePage() === 'messages';

          if (isConversationOpen) {
            if (typeof appendBubble === 'function') appendBubble(msg.content, false, msg.created_at);
            if (typeof markConversationRead === 'function') {
              markConversationRead(msg.conversation_id, activeConversation.type === 'dm' ? activeConversation.id : null);
            }
            return;
          }

          var isGroup = false;
          try {
            if (typeof myGroups !== 'undefined' && Array.isArray(myGroups)) {
              isGroup = myGroups.some(function (g) { return g && g.id === msg.conversation_id; });
            }
          } catch (e) {}

          var friendId = null;
          try {
            if (!isGroup && typeof friendIdByConversation !== 'undefined') {
              friendId = friendIdByConversation[msg.conversation_id];
            }
          } catch (e2) {}

          try {
            if (typeof unreadByConversation !== 'undefined') {
              unreadByConversation[msg.conversation_id] = (unreadByConversation[msg.conversation_id] || 0) + 1;
            }
            if (friendId && typeof unreadByFriend !== 'undefined') {
              unreadByFriend[friendId] = (unreadByFriend[friendId] || 0) + 1;
            } else if (!isGroup && typeof loadUnreadCounts === 'function') {
              loadUnreadCounts();
            }
          } catch (e3) {}

          if (typeof updateMessagesBadge === 'function') updateMessagesBadge();
          if (typeof renderConversationSidebar === 'function') renderConversationSidebar();
          if (typeof showToast === 'function') {
            var label = (typeof t === 'function') ? t('messages.new_message_toast') : 'Nouveau message';
            showToast('💬 ' + label, 'success');
          }
        } catch (err) {
          console.warn('[AUPYGO] on message insert', err);
        }
      }
    );

    ch = ch.on('postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'group_invitations',
        filter: 'invited_user_id=eq.' + uid
      },
      function () {
        try {
          if (typeof loadGroupInvitations === 'function') loadGroupInvitations();
        } catch (e) {}
      }
    );

    return ch;
  }

  function install() {
    if (typeof window.setupMessagesRealtime !== 'function') return false;
    if (window._realtimeFixInstalled) return true;
    window._realtimeFixInstalled = true;

    var origTeardown = window.teardownMessagesRealtime;

    window.teardownMessagesRealtime = function () {
      safeTeardown();
      if (typeof origTeardown === 'function') {
        try { origTeardown(); } catch (e) {}
      }
      try { messagesChannel = null; } catch (e2) {}
    };

    window.setupMessagesRealtime = function () {
      if (typeof currentUser === 'undefined' || !currentUser) return;
      if (typeof messagesChannel !== 'undefined' && messagesChannel) return;
      if (_pending) return;
      _pending = true;

      var finish = function () {
        try {
          if (messagesChannel) {
            _pending = false;
            return;
          }
          removeStaleChannels(currentUser.id);
          var ch = buildChannel();
          messagesChannel = ch;
          ch.subscribe(function (status) {
            _pending = false;
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              console.warn('[AUPYGO] messages channel', status);
              try { messagesChannel = null; } catch (e) {}
            }
          });
        } catch (e) {
          _pending = false;
          console.warn('[AUPYGO] setupMessagesRealtime', e);
        }
      };

      if (typeof refreshMyConversationIds === 'function') {
        refreshMyConversationIds().then(finish).catch(function () {
          _pending = false;
          finish();
        });
      } else {
        finish();
      }
    };

    console.log('[AUPYGO] realtime-fix.js v2 installé');
    return true;
  }

  function tryInstall() {
    if (install()) return;
    setTimeout(tryInstall, 250);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInstall);
  } else {
    tryInstall();
  }
  setTimeout(tryInstall, 600);
  setTimeout(tryInstall, 1500);
  setTimeout(tryInstall, 3000);
})();
