/* AUPYGO staff-msg-unlock.js
 * - Force envoi messages Staff/Admin
 * - Masque notices PREMIUM / STANDARD inutiles
 */
(function () {
  'use strict';
  if (typeof isStaff !== 'function') return;

  function forcePremium() {
    try { currentPlan = 'PREMIUM'; } catch (e) {}
    try { window.currentPlan = 'PREMIUM'; } catch (e2) {}
    try { localStorage.setItem('aupygo_plan', 'PREMIUM'); } catch (e3) {}
  }

  function hideStandardUpsells() {
    if (!isStaff()) return;

    // IDs connus
    ['agendaNotice', 'messagesNotice', 'personalAgendaNotice'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) {
        el.style.display = 'none';
        el.setAttribute('hidden', 'true');
        el.innerHTML = '';
      }
    });

    // Tout bandeau notice dans Messages / Agenda contenant PREMIUM, STANDARD, quota, amis
    document.querySelectorAll(
      '#messages .notice, #messagesNotice, #messages p.notice, #messages .hint, ' +
      '#agenda .notice, #agendaNotice, #events .notice, .messages-notice'
    ).forEach(function (el) {
      var t = (el.textContent || '');
      if (/messagerie illimitée|PREMIUM|STANDARD|forfait|quota|avec tes amis|détails complets|10 messages/i.test(t)) {
        el.style.display = 'none';
        el.setAttribute('hidden', 'true');
      }
    });

    // Scan large page messages
    var msgPage = document.getElementById('messages');
    if (msgPage) {
      msgPage.querySelectorAll('div, p, span').forEach(function (el) {
        if (el.children && el.children.length > 3) return;
        var t = (el.textContent || '').trim();
        if (/^✅?\s*Messagerie illimitée/i.test(t) || /Messagerie illimitée \(PREMIUM\)/i.test(t)) {
          el.style.display = 'none';
          el.setAttribute('hidden', 'true');
        }
      });
    }

    document.querySelectorAll('.event-upgrade, .btn-locked').forEach(function (btn) {
      if (/STANDARD|plans/i.test((btn.textContent || '') + (btn.getAttribute('onclick') || ''))) {
        btn.style.display = 'none';
      }
    });

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
    }
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('disabled');
    }
    var box = document.getElementById('messagesBox') || document.getElementById('messages');
    if (box) box.classList.remove('locked');
  }

  var _origSend = window.sendMessage;
  if (typeof _origSend === 'function' && !window._staffSendPatched) {
    window._staffSendPatched = true;
    window.sendMessage = async function () {
      if (!isStaff()) return _origSend.apply(this, arguments);
      forcePremium();
      if (!window.currentUser) { showToast('Connecte-toi', 'error'); return; }
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

  var _origQuota = window.refreshMessagesQuotaUI;
  if (typeof _origQuota === 'function' && !window._staffQuotaPatched) {
    window._staffQuotaPatched = true;
    window.refreshMessagesQuotaUI = async function () {
      if (isStaff()) {
        forcePremium();
        hideStandardUpsells();
        return { allowed: true, remaining: 999, used: 0, limit: 999 };
      }
      return _origQuota.apply(this, arguments);
    };
  }

  // Empêcher updateUI de réafficher la notice PREMIUM
  var _origUpdateUI = window.updateUI;
  if (typeof _origUpdateUI === 'function' && !window._staffUpdateUiPatched) {
    window._staffUpdateUiPatched = true;
    window.updateUI = function () {
      var r = _origUpdateUI.apply(this, arguments);
      if (isStaff()) {
        forcePremium();
        hideStandardUpsells();
      }
      return r;
    };
  }

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
      hideStandardUpsells();
    };
  }

  var _origHist = window.loadConversationHistory;
  if (typeof _origHist === 'function' && !window._staffHistUnlock) {
    window._staffHistUnlock = true;
    window.loadConversationHistory = async function () {
      var r = await _origHist.apply(this, arguments);
      if (isStaff()) { forcePremium(); enableChatInput(); hideStandardUpsells(); }
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
        setTimeout(function () { enableChatInput(); hideStandardUpsells(); }, 200);
        setTimeout(hideStandardUpsells, 800);
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
    if (typeof getActivePage === 'function' && getActivePage() === 'messages') enableChatInput();
  }, 1500);

  setTimeout(function () {
    if (isStaff()) { forcePremium(); hideStandardUpsells(); enableChatInput(); }
  }, 600);

  console.log('[AUPYGO] staff-msg-unlock.js v2');
})();
