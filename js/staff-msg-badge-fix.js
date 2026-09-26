/* AUPYGO — staff-msg-badge-fix.js
 * - Stoppe le clignotement de l'avatar / boutons messages une fois lus
 * - Empêche le header-plan (haut droite) de clignoter
 * - Marque last_read_at en DB à l'ouverture d'une conversation Staff
 */
(function () {
  'use strict';

  // CSS anti-clignotement header + plan avatar
  if (!document.getElementById('staffMsgBadgeFixStyle')) {
    var st = document.createElement('style');
    st.id = 'staffMsgBadgeFixStyle';
    st.textContent =
      /* Jamais de pulse sur l'avatar forfait / Staff en haut à droite */
      '.header-plan-btn, .header-plan-btn * { animation: none !important; }' +
      '.header-plan-btn.nav-blink, .header-plan-btn.has-unread-messages,' +
      '.header-plan-btn.has-requests { animation: none !important; box-shadow: none !important; }' +
      /* Header messages : badge OK, pas de pulse permanent si 0 */
      '#headerMessagesBtn:not(.has-unread) { animation: none !important; }' +
      /* Quand total non-lus = 0, forcer arrêt partout */
      'body.aupygo-no-unread nav button.has-unread-messages,' +
      'body.aupygo-no-unread nav button.nav-blink,' +
      'body.aupygo-no-unread .home-btn.nav-blink,' +
      'body.aupygo-no-unread #headerMessagesBtn {' +
      '  animation: none !important;' +
      '  box-shadow: none !important;' +
      '}' +
      'body.aupygo-no-unread .messages-badge,' +
      'body.aupygo-no-unread #messagesBadge,' +
      'body.aupygo-no-unread #headerMessagesBadge {' +
      '  display: none !important;' +
      '}';
    document.head.appendChild(st);
  }

  function totalUnread() {
    try {
      if (typeof getTotalUnreadCount === 'function') return getTotalUnreadCount() || 0;
      if (typeof unreadByConversation !== 'undefined' && unreadByConversation) {
        return Object.values(unreadByConversation).reduce(function (a, b) { return a + (b || 0); }, 0);
      }
    } catch (e) {}
    return 0;
  }

  function stripBlink(el) {
    if (!el) return;
    el.classList.remove(
      'has-unread-messages', 'nav-blink', 'blink', 'pulse', 'unread',
      'has-requests', 'has-unread'
    );
    el.style.animation = 'none';
  }

  function hideBadge(el) {
    if (!el) return;
    el.textContent = '0';
    el.classList.remove('show');
    el.style.display = 'none';
  }

  function clearAllBlinkUI() {
    document.body.classList.add('aupygo-no-unread');

    // Header plan (avatar haut droite) — jamais de blink
    stripBlink(document.getElementById('headerPlanBtn'));
    var planBtn = document.querySelector('.header-plan-btn');
    stripBlink(planBtn);

    // Nav / bottom / home / header messages
    [
      'navMessages', 'bottomNavMessages', 'homeBtnMessages', 'headerMessagesBtn',
      'headerPlanBtn', 'staffHeaderBtn'
    ].forEach(function (id) {
      stripBlink(document.getElementById(id));
    });
    document.querySelectorAll('[data-nav="messages"], nav button.has-unread-messages, nav button.nav-blink, .home-btn.nav-blink').forEach(stripBlink);

    [
      'messagesBadge', 'messagesBadgeBottom', 'bottomMessagesBadge',
      'headerMessagesBadge'
    ].forEach(function (id) {
      hideBadge(document.getElementById(id));
    });
    document.querySelectorAll('.messages-badge, .home-btn-badge').forEach(hideBadge);
  }

  function syncBlinkState() {
    // Toujours protéger l'avatar plan
    stripBlink(document.getElementById('headerPlanBtn'));
    stripBlink(document.querySelector('.header-plan-btn'));

    var n = totalUnread();
    if (n <= 0) {
      clearAllBlinkUI();
    } else {
      document.body.classList.remove('aupygo-no-unread');
      // Header messages badge
      var hb = document.getElementById('headerMessagesBadge');
      if (hb) {
        hb.style.display = 'block';
        hb.textContent = n > 99 ? '99+' : String(n);
      }
      var hbtn = document.getElementById('headerMessagesBtn');
      if (hbtn) hbtn.classList.add('has-unread');
    }
  }

  /** Marque une conversation comme lue (mémoire + DB) */
  async function markStaffConvRead(conversationId) {
    if (!conversationId || !window.currentUser) return;

    try {
      if (typeof unreadByConversation !== 'undefined' && unreadByConversation) {
        delete unreadByConversation[conversationId];
        unreadByConversation[conversationId] = 0;
      }
    } catch (e) {}

    try {
      if (typeof markConversationRead === 'function') {
        markConversationRead(conversationId, null);
      }
    } catch (e2) {}

    // Écriture DB last_read_at (si colonne présente)
    try {
      await supabaseClient
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', currentUser.id);
    } catch (e3) {}

    try {
      if (typeof updateMessagesBadge === 'function') updateMessagesBadge();
    } catch (e4) {}

    syncBlinkState();
  }

  window.markStaffConvRead = markStaffConvRead;

  // Patch updateMessagesBadge
  if (typeof window.updateMessagesBadge === 'function' && !window._staffBadgeFixPatched) {
    window._staffBadgeFixPatched = true;
    var _orig = window.updateMessagesBadge;
    window.updateMessagesBadge = function () {
      _orig.apply(this, arguments);
      // Retirer blink sur header plan toujours
      stripBlink(document.getElementById('headerPlanBtn'));
      stripBlink(document.querySelector('.header-plan-btn'));
      syncBlinkState();
    };
  }

  // À l'ouverture d'une conversation active → marquer lu
  function watchActiveConversation() {
    try {
      var ac = window.activeConversation;
      if (ac && ac.conversationId) {
        markStaffConvRead(ac.conversationId);
      }
    } catch (e) {}
  }

  // Patch go → messages
  if (typeof window.go === 'function' && !window._staffBadgeGoPatched) {
    window._staffBadgeGoPatched = true;
    var prevGo = window.go;
    window.go = function (page) {
      prevGo(page);
      if (page === 'messages') {
        setTimeout(watchActiveConversation, 300);
        setTimeout(syncBlinkState, 400);
        setTimeout(syncBlinkState, 1200);
      }
      // Toujours sécuriser le header plan
      setTimeout(function () {
        stripBlink(document.getElementById('headerPlanBtn'));
        stripBlink(document.querySelector('.header-plan-btn'));
      }, 100);
    };
  }

  // Clic sur une conversation de la liste → marquer lu
  if (!window._staffBadgeClickPatched) {
    window._staffBadgeClickPatched = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var conv = t.closest('.conversation, [data-conversation-id]');
      if (!conv) return;
      setTimeout(function () {
        var ac = window.activeConversation;
        if (ac && ac.conversationId) markStaffConvRead(ac.conversationId);
        else syncBlinkState();
      }, 400);
    }, true);
  }

  // openStaffGroup / openStaffAnyGroup / openStaffMemberDm
  ['openStaffGroup', 'openStaffAnyGroup', 'openStaffMemberDm'].forEach(function (fn) {
    if (typeof window[fn] === 'function' && !window['_' + fn + 'BadgePatched']) {
      window['_' + fn + 'BadgePatched'] = true;
      var orig = window[fn];
      window[fn] = async function () {
        var r = await orig.apply(this, arguments);
        setTimeout(function () {
          var ac = window.activeConversation;
          if (ac && ac.conversationId) markStaffConvRead(ac.conversationId);
          syncBlinkState();
        }, 300);
        return r;
      };
    }
  });

  // Tick de sécurité
  setInterval(function () {
    stripBlink(document.getElementById('headerPlanBtn'));
    stripBlink(document.querySelector('.header-plan-btn'));
    syncBlinkState();
  }, 2000);

  setTimeout(syncBlinkState, 600);
  setTimeout(syncBlinkState, 2000);

  console.log('[AUPYGO] staff-msg-badge-fix.js chargé');
})();
