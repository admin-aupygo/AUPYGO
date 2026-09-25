/* AUPYGO staff-msg-unlock.js
 * - Force envoi messages Staff/Admin (quota, input, conversationId)
 * - Masque « détails STANDARD » dans l'agenda
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  function forcePremium() {
    try { currentPlan = 'PREMIUM'; } catch (e) {}
    try { window.currentPlan = 'PREMIUM'; } catch (e2) {}
    try { localStorage.setItem('aupygo_plan', 'PREMIUM'); } catch (e3) {}
  }

  /** Masquer notices STANDARD / locked dans agenda & messages */
  function hideStandardUpsells() {
    if (!isStaff()) return;

    ['agendaNotice', 'messagesNotice', 'personalAgendaNotice'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        el.setAttribute('hidden', 'true');
      }
    });

    // Texte « détails complets … STANDARD »
    document.querySelectorAll('#agenda .notice, #agenda p, #agenda .hint, #events .notice, .event-locked-hint').forEach(function (el) {
      var t = (el.textContent || '');
      if (/détails complets|forfait STANDARD|à partir du forfait|STANDARD/i.test(t) && /détail|forfait|standard/i.test(t)) {
        el.style.display = 'none';
      }
    });

    // Boutons upgrade STANDARD sur cartes (staff n'en a pas besoin)
    document.querySelectorAll('.event-upgrade, .btn-locked').forEach(function (btn) {
      if (/STANDARD|plans/i.test((btn.textContent || '') + (btn.getAttribute('onclick') || ''))) {
        btn.style.display = 'none';
      }
    });

    // data-locked overlays
    document.querySelectorAll('[data-locked]').forEach(function (el) {
      el.style.display = 'none';
    });
  }

  function enableChatInput() {
    var input = document.getElementById('messageInput');
    var btn = document.getElementById('sendMsgBtn');
    if (input) {
      input.disabled = false;
      input.removeAttribute('disabled');
      input.readOnly = false;
      input.placeholder = input.placeholder || 'Écrire un message…';
    }
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('disabled');
    }
    // Déverrouiller zone messages
    var box = document.getElementById('messagesBox') || document.getElementById('messages');
    if (box) box.classList.remove('locked');
  }

  // Patch sendMessage : staff bypass quota + force premium
  var _origSend = window.sendMessage;
  if (typeof _origSend === 'function' && !window._staffSendPatched) {
    window._staffSendPatched = true;
    window.sendMessage = async function () {
      if (!isStaff()) return _origSend.apply(this, arguments);

      forcePremium();

      if (!window.currentUser) {
        showToast('Connecte-toi', 'error');
        return;
      }
      if (!window.activeConversation || !window.activeConversation.conversationId) {
        showToast('Ouvre d\'abord une conversation (Admin ou Équipe AUPYGO).', 'error');
        return;
      }

      var input = document.getElementById('messageInput');
      if (!input || !input.value.trim()) return;
      var body = input.value.trim();

      try {
        var { error } = await supabaseClient.from('messages').insert({
          conversation_id: window.activeConversation.conversationId,
          sender_id: window.currentUser.id,
          content: body
        });
        if (error) {
          console.error('[Staff] sendMessage', error);
          showToast('Erreur envoi : ' + (error.message || error), 'error');
          return;
        }
        if (typeof appendBubble === 'function') appendBubble(body, true, new Date());
        input.value = '';
        showToast('Message envoyé', 'success');
      } catch (e) {
        console.error(e);
        showToast('Erreur envoi message', 'error');
      }
    };
  }

  // Patch refreshMessagesQuotaUI pour staff = toujours allowed
  var _origQuota = window.refreshMessagesQuotaUI;
  if (typeof _origQuota === 'function' && !window._staffQuotaPatched) {
    window._staffQuotaPatched = true;
    window.refreshMessagesQuotaUI = async function () {
      if (isStaff()) {
        forcePremium();
        return { allowed: true, remaining: 999, used: 0, limit: 999 };
      }
      return _origQuota.apply(this, arguments);
    };
  }

  // Améliorer openStaffGroup / openAdminChannel si déjà définis
  var _openGroup = window.openStaffGroup;
  if (typeof _openGroup === 'function') {
    window.openStaffGroup = async function () {
      forcePremium();
      await _openGroup.apply(this, arguments);
      enableChatInput();
      hideStandardUpsells();
    };
  }

  var _openAdmin = window.openAdminChannel;
  if (typeof _openAdmin === 'function') {
    window.openAdminChannel = async function () {
      forcePremium();
      await _openAdmin.apply(this, arguments);
      enableChatInput();
    };
  }

  // Après loadConversationHistory
  var _origHist = window.loadConversationHistory;
  if (typeof _origHist === 'function' && !window._staffHistUnlock) {
    window._staffHistUnlock = true;
    window.loadConversationHistory = async function () {
      var r = await _origHist.apply(this, arguments);
      if (isStaff()) {
        forcePremium();
        enableChatInput();
      }
      return r;
    };
  }

  var prevGo = window.go;
  if (typeof prevGo === 'function' && !window._staffMsgUnlockGo) {
    window._staffMsgUnlockGo = true;
    window.go = function (page) {
      prevGo(page);
      if (!isStaff()) return;
      forcePremium();
      if (page === 'messages') {
        setTimeout(enableChatInput, 300);
        setTimeout(enableChatInput, 1000);
        setTimeout(hideStandardUpsells, 200);
      }
      if (page === 'agenda' || page === 'events') {
        setTimeout(hideStandardUpsells, 200);
        setTimeout(hideStandardUpsells, 800);
      }
    };
  }

  setInterval(function () {
    if (!isStaff()) return;
    forcePremium();
    hideStandardUpsells();
    if (typeof getActivePage === 'function' && getActivePage() === 'messages') {
      enableChatInput();
    }
  }, 2000);

  setTimeout(function () {
    if (isStaff()) {
      forcePremium();
      hideStandardUpsells();
      enableChatInput();
    }
  }, 800);

  console.log('[AUPYGO] staff-msg-unlock.js chargé');
})();
