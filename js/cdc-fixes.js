/* ==========================================================================
 * AUPYGO — cdc-fixes.js
 * Cahier des charges développeur — 7 points prioritaires
 * Chargé EN DERNIER pour gagner sur les autres patches.
 * ========================================================================== */
(function () {
  'use strict';

  var NON_REFUND =
    'Clause de non-remboursement : une fois l\'invitation acceptée et le paiement validé, ' +
    'aucun remboursement ne sera accordé, sauf obligation légale impérative. ' +
    'En cochant la case ci-dessous, vous reconnaissez avoir lu et accepté cette condition.';

  /* ---------- helpers ---------- */
  function plan() {
    try {
      return String(window.currentPlan || (typeof currentPlan !== 'undefined' ? currentPlan : 'FREE') || 'FREE').toUpperCase();
    } catch (e) { return 'FREE'; }
  }
  function uid() {
    return (window.currentUser && window.currentUser.id) || null;
  }
  function getEv(id) {
    return (window.cachedEvents || []).find(function (e) { return e && e.id === id; }) || null;
  }
  function isPaid(ev) {
    return !!(ev && ev.is_paid && Number(ev.price) > 0);
  }
  function priceLabel(ev) {
    if (!isPaid(ev)) return '';
    return Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €';
  }
  function isStaffCreator(ev) {
    if (!ev) return false;
    if (ev.is_special_aupygo === true) return true;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return true;
    var c = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
    if (!c) return false;
    if (c.is_admin === true) return true;
    var r = String(c.role || '').toLowerCase();
    return ['amiral','admin_general','admin','host','moderator','major_staff','sergent_staff','major_moderateur','sergent_moderateur'].indexOf(r) !== -1;
  }
  function staffPaid(ev) {
    return isStaffCreator(ev) && isPaid(ev);
  }
  function esc(s) {
    return String(s || '').replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').replace(/"/g,'"');
  }
  function fmtTime(ts) {
    try {
      var d = ts ? new Date(ts) : new Date();
      if (isNaN(d.getTime())) d = new Date();
      return String(d.getDate()).padStart(2,'0') + '/' +
        String(d.getMonth()+1).padStart(2,'0') + ' · ' +
        String(d.getHours()).padStart(2,'0') + ':' +
        String(d.getMinutes()).padStart(2,'0');
    } catch (e) { return ''; }
  }
  function nameOf(senderId, isMe) {
    if (isMe) {
      var me = window.currentUserProfile || (window.profiles || []).find(function (p) {
        return p && uid() && p.id === uid();
      });
      return (me && me.display_name) || 'Moi';
    }
    var p = (window.profiles || []).find(function (x) { return x && x.id === senderId; });
    return (p && p.display_name) || 'Membre';
  }

  /* ========================================================================
   * 1 + 6 — Events payants staff visibles + modal Gratuit/Payant + non-remboursement
   * ======================================================================== */
  function ensurePaidModal() {
    if (document.getElementById('cdcPaidOverlay')) return;
    var ov = document.createElement('div');
    ov.id = 'cdcPaidOverlay';
    ov.style.cssText = 'display:none;position:fixed;inset:0;z-index:10060;background:rgba(15,23,42,.55);align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = '<div id="cdcPaidCard" style="background:#fff;border-radius:16px;max-width:420px;width:100%;padding:20px;max-height:90vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.25)"></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) closePaidModal(); });
    document.body.appendChild(ov);
  }
  function closePaidModal() {
    var ov = document.getElementById('cdcPaidOverlay');
    if (ov) ov.style.display = 'none';
  }
  window.cdcClosePaidModal = closePaidModal;

  function openPaidModal(ev) {
    ensurePaidModal();
    var card = document.getElementById('cdcPaidCard');
    if (!card || !ev) return;
    var paid = isPaid(ev);
    var pl = priceLabel(ev);
    var dateStr = (typeof formatEventDate === 'function') ? formatEventDate(ev.event_date) : String(ev.event_date || '');
    card.innerHTML =
      '<button type="button" onclick="cdcClosePaidModal()" style="float:right;border:0;background:0;font-size:22px;cursor:pointer">×</button>' +
      '<div style="font-size:28px">' + esc(ev.emoji || '🎉') + '</div>' +
      '<h3 style="margin:8px 0">' + esc(ev.title || 'Événement') + '</h3>' +
      '<p style="margin:4px 0;color:#64748b;font-size:13px">📍 ' + esc(ev.address || '') + '</p>' +
      '<p style="margin:4px 0;color:#64748b;font-size:13px">🕐 ' + esc(dateStr) + '</p>' +
      '<div style="margin:14px 0;padding:12px;border-radius:12px;background:' + (paid ? '#faf5ff;border:1px solid #e9d5ff' : '#f0fdf4;border:1px solid #bbf7d0') + '">' +
      '<strong style="color:' + (paid ? '#7c3aed' : '#15803d') + '">' +
      (paid ? ('💶 Événement payant — ' + pl) : '✅ Événement gratuit') +
      '</strong></div>' +
      (paid
        ? '<label style="display:flex;gap:10px;align-items:flex-start;margin:12px 0;font-size:12px;color:#334155;cursor:pointer">' +
          '<input type="checkbox" id="cdcNonRefund" style="margin-top:3px">' +
          '<span>' + NON_REFUND + '</span></label>'
        : '') +
      '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-primary" id="cdcAcceptBtn" style="flex:1">' +
      (paid ? ('Accepter · ' + pl) : 'Accepter') + '</button>' +
      '<button type="button" class="btn btn-secondary" onclick="cdcClosePaidModal()" style="flex:1">Annuler</button></div>';
    document.getElementById('cdcPaidOverlay').style.display = 'flex';
    var btn = document.getElementById('cdcAcceptBtn');
    if (btn) {
      btn.onclick = async function () {
        if (paid) {
          var chk = document.getElementById('cdcNonRefund');
          if (!chk || !chk.checked) {
            if (typeof showToast === 'function') showToast('Merci d\'accepter la clause de non-remboursement.', 'error');
            return;
          }
        }
        closePaidModal();
        await doJoin(ev.id, paid);
      };
    }
  }

  async function doJoin(eventId, paid) {
    if (!uid()) {
      if (typeof showToast === 'function') showToast('Connecte-toi pour participer.', 'error');
      if (typeof go === 'function') go('plans');
      return;
    }
    var client = window.supabaseClient || window.supabase;
    if (!client) return;
    var prev = plan();
    try {
      // Contourne le lock FREE de app.js le temps de l'insert
      try { currentPlan = 'STANDARD'; } catch (e) {}
      window.currentPlan = 'STANDARD';
      var { error } = await client.from('event_participants').insert({
        event_id: eventId,
        user_id: uid()
      });
      if (error && !/duplicate|unique|23505/i.test(String(error.message || '') + String(error.code || ''))) {
        if (typeof showToast === 'function') showToast('Erreur : ' + (error.message || error), 'error');
        return;
      }
      if (typeof showToast === 'function') {
        showToast(paid ? '🎉 Place réservée (paiement simulé) !' : '🎉 Tu es inscrit !', 'success');
      }
      if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
    } finally {
      try { currentPlan = prev; } catch (e2) {}
      window.currentPlan = prev;
    }
  }

  function patchJoin() {
    if (typeof window.joinRealEvent !== 'function') return false;
    // Toujours re-patcher pour gagner sur join-events-fix / staff-events
    if (window._cdcJoin === window.joinRealEvent) return true;

    var orig = window.joinRealEvent;
    window.joinRealEvent = async function (eventId) {
      var ev = getEv(eventId);
      // Staff : laisser staff-events gérer le refus d'inscription
      if (typeof isStaff === 'function' && isStaff()) {
        return orig.apply(this, arguments);
      }
      // 1 + 6 : staff payant OU tout événement payant → modal avant accept
      if (ev && (staffPaid(ev) || isPaid(ev))) {
        openPaidModal(ev);
        return;
      }
      // FREE peut rejoindre sorties publiques gratuites (communauté)
      if (plan() === 'FREE' && ev) {
        var vis = String(ev.visibility || 'public').toLowerCase();
        var freeOk = vis === 'public' && !isPaid(ev) && !ev.is_special_aupygo;
        if (freeOk || staffPaid(ev)) {
          return doJoin(eventId, false);
        }
      }
      return orig.apply(this, arguments);
    };
    window._cdcJoin = window.joinRealEvent;
    return true;
  }

  /** 1 — Déverrouille les cartes staff-payantes pour FREE + affiche le prix */
  function unlockPaidCards() {
    (window.cachedEvents || []).forEach(function (ev) {
      if (!ev || !ev.id) return;
      document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(function (card) {
        // Afficher prix pour TOUS (CDC 6)
        if (isPaid(ev)) {
          if (!card.querySelector('.cdc-price')) {
            var p = document.createElement('p');
            p.className = 'event-details cdc-price';
            p.style.cssText = 'font-weight:800;color:#7c3aed';
            p.textContent = '💶 Payant · ' + priceLabel(ev);
            card.appendChild(p);
          }
        } else if (!card.querySelector('.cdc-free') && (staffPaid(ev) || isStaffCreator(ev))) {
          // noop
        }

        // FREE + staff payant : remplacer cadenas par bouton rejoindre
        if (staffPaid(ev) || isPaid(ev)) {
          var locked = card.querySelector('.btn-locked, .event-upgrade');
          if (locked) {
            locked.className = 'btn btn-primary event-join';
            locked.textContent = isPaid(ev) ? ('💶 ' + priceLabel(ev)) : '✨ Participer';
            locked.onclick = function (e) {
              e.preventDefault();
              e.stopPropagation();
              openPaidModal(ev);
            };
          }
        }
      });
    });
  }

  /* ========================================================================
   * 2 — Identité expéditeur (pseudo · date/heure) sur TOUS les messages
   * ======================================================================== */
  function patchBubbles() {
    if (typeof window.appendBubble !== 'function') return false;
    if (window._cdcBubble === window.appendBubble) return true;

    window.appendBubble = function (text, isMe, createdAt, senderId) {
      if (typeof text === 'string' && /a quitté le groupe/i.test(text)) {
        var box0 = document.getElementById('chatMessages');
        if (!box0) return;
        var ph0 = box0.querySelector('.chat-placeholder');
        if (ph0) box0.innerHTML = '';
        var sys = document.createElement('div');
        sys.className = 'chat-system-msg';
        sys.textContent = text;
        box0.appendChild(sys);
        box0.scrollTop = box0.scrollHeight;
        return;
      }
      var box = document.getElementById('chatMessages');
      if (!box) return;
      var ph = box.querySelector('.chat-placeholder');
      if (ph) box.innerHTML = '';

      try {
        if (typeof getDateKey === 'function' && typeof formatMessageDate === 'function') {
          var dk = getDateKey(createdAt || new Date());
          if (dk && dk !== window.lastBubbleDateKey) {
            var sep = document.createElement('div');
            sep.className = 'chat-date-separator';
            sep.innerHTML = '<span>' + formatMessageDate(createdAt || new Date()) + '</span>';
            box.appendChild(sep);
            window.lastBubbleDateKey = dk;
          }
        }
      } catch (e) {}

      var sid = senderId || (isMe && uid()) || null;
      var wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;margin:6px 0;' +
        (isMe ? 'align-items:flex-end' : 'align-items:flex-start');
      var lab = document.createElement('div');
      lab.style.cssText = 'font-size:11px;font-weight:700;color:' + (isMe ? '#7c3aed' : '#334155') + ';margin:0 6px 2px';
      lab.textContent = nameOf(sid, !!isMe) + ' · ' + fmtTime(createdAt);
      var bubble = document.createElement('div');
      bubble.className = 'bubble' + (isMe ? ' me' : '');
      bubble.textContent = text;
      wrap.appendChild(lab);
      wrap.appendChild(bubble);
      box.appendChild(wrap);
      box.scrollTop = box.scrollHeight;
    };
    window._cdcBubble = window.appendBubble;

    // loadConversationHistory → passer sender_id
    if (typeof window.loadConversationHistory === 'function' && !window._cdcHistWrapped) {
      window._cdcHistWrapped = true;
      var origHist = window.loadConversationHistory;
      window.loadConversationHistory = async function (convId) {
        if (typeof isStaff === 'function' && isStaff()) {
          return origHist.apply(this, arguments);
        }
        var box = document.getElementById('chatMessages');
        var client = window.supabaseClient || window.supabase;
        if (!box || !convId || !client) return origHist.apply(this, arguments);
        try {
          var res = await client.from('messages')
            .select('id, content, sender_id, created_at')
            .eq('conversation_id', convId)
            .order('created_at', { ascending: true })
            .limit(300);
          var data = res.data || [];
          box.innerHTML = '';
          window.lastBubbleDateKey = null;
          if (!data.length) {
            box.innerHTML = '<div class="chat-placeholder"><p>Aucun message.</p></div>';
            return;
          }
          data.forEach(function (m) {
            window.appendBubble(m.content, !!(uid() && m.sender_id === uid()), m.created_at, m.sender_id);
          });
          box.scrollTop = box.scrollHeight;
        } catch (e) {
          return origHist.apply(this, arguments);
        }
      };
    }
    return true;
  }

  /* ========================================================================
   * 3 — Compteurs messages FREE & STANDARD visibles en permanence
   * ======================================================================== */
  function injectQuotaCSS() {
    if (document.getElementById('cdcQuotaStyle')) return;
    var st = document.createElement('style');
    st.id = 'cdcQuotaStyle';
    st.textContent =
      '#messagesQuota.cdc-visible, #cdcQuotaBar {' +
      '  display:block!important;visibility:visible!important;opacity:1!important;' +
      '  background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;' +
      '  padding:8px 12px;margin:0 0 10px;font-size:13px;font-weight:700;color:#6b21a8;text-align:center' +
      '}' +
      'body.cdc-premium #messagesQuota, body.cdc-premium #cdcQuotaBar { display:none!important }';
    document.head.appendChild(st);
  }

  async function syncQuota() {
    injectQuotaCSS();
    var p = plan();
    document.body.classList.toggle('cdc-premium', p === 'PREMIUM');
    if (p === 'PREMIUM') {
      var el0 = document.getElementById('messagesQuota');
      if (el0) el0.style.display = 'none';
      var b0 = document.getElementById('cdcQuotaBar');
      if (b0) b0.style.display = 'none';
      return;
    }

    // Forcer refresh natif
    var q = null;
    if (typeof refreshMessagesQuotaUI === 'function') {
      try { q = await refreshMessagesQuotaUI(); } catch (e) {}
    }

    var el = document.getElementById('messagesQuota');
    if (el) {
      el.classList.add('cdc-visible');
      el.style.display = 'block';
    }

    // Barre sticky permanente
    var page = document.getElementById('messages');
    if (!page) return;
    var bar = document.getElementById('cdcQuotaBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'cdcQuotaBar';
      var anchor = document.getElementById('messagesQuota') || document.getElementById('messagesNotice') || page.firstChild;
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(bar, anchor.nextSibling);
      } else {
        page.insertBefore(bar, page.firstChild);
      }
    }
    bar.style.display = 'block';
    if (el && el.textContent) {
      bar.textContent = '💬 ' + el.textContent;
    } else if (q && q.max !== Infinity) {
      bar.textContent = '💬 ' + q.left + '/' + q.max +
        (p === 'FREE' ? ' messages restants (FREE)' : ' messages restants aujourd\'hui');
    } else {
      bar.textContent = p === 'FREE'
        ? '💬 FREE : 10 messages max (compte)'
        : '💬 STANDARD : 10 messages / jour';
    }
  }

  /* ========================================================================
   * 4 — Bouton Déconnexion entre Profil (avatar) et Language
   * ======================================================================== */
  function injectLogout() {
    var actions = document.querySelector('.header-actions');
    if (!actions) return;
    var btn = document.getElementById('headerLogoutBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.id = 'headerLogoutBtn';
      btn.setAttribute('aria-label', 'Déconnexion');
      btn.title = 'Déconnexion';
      btn.textContent = '🚪';
      btn.style.cssText = 'border:0;background:#f1f5f9;border-radius:10px;padding:6px 10px;cursor:pointer;font-size:16px;margin:0 4px';
      btn.onclick = function (e) {
        e.preventDefault();
        if (!uid()) return;
        if (!confirm('Se déconnecter ?')) return;
        if (typeof handleLogout === 'function') handleLogout('manual');
        else if (window.supabaseClient) window.supabaseClient.auth.signOut();
      };
      var lang = actions.querySelector('.lang-select') || actions.querySelector('#language');
      if (lang) actions.insertBefore(btn, lang);
      else actions.appendChild(btn);
    }
    btn.style.display = uid() ? '' : 'none';
  }

  /* ========================================================================
   * 5 — Notifications uniformes (tous plans / staff)
   * ======================================================================== */
  function uniformNotifs() {
    if (document.getElementById('cdcNotifStyle')) return;
    var st = document.createElement('style');
    st.id = 'cdcNotifStyle';
    st.textContent =
      '.messages-badge, #messagesBadge, #headerMessagesBadge, #messagesBadgeBottom, #bottomMessagesBadge, .home-btn-badge {' +
      '  min-width:16px!important;height:16px!important;padding:0 4px!important;' +
      '  border-radius:999px!important;background:#ef4444!important;color:#fff!important;' +
      '  font-size:10px!important;font-weight:800!important;line-height:16px!important' +
      '}';
    document.head.appendChild(st);

    if (typeof window.updateMessagesBadge === 'function' && !window._cdcNotifPatched) {
      window._cdcNotifPatched = true;
      var orig = window.updateMessagesBadge;
      window.updateMessagesBadge = function () {
        orig.apply(this, arguments);
        var n = 0;
        try {
          if (typeof getTotalUnreadCount === 'function') n = getTotalUnreadCount() || 0;
        } catch (e) {}
        ['messagesBadge','headerMessagesBadge','messagesBadgeBottom','bottomMessagesBadge'].forEach(function (id) {
          var el = document.getElementById(id);
          if (!el) return;
          if (n > 0) {
            el.style.display = 'block';
            el.textContent = n > 99 ? '99+' : String(n);
            el.classList.add('show');
          }
        });
      };
    }
  }

  /* ========================================================================
   * 7 — Pop-up agenda centré + descriptif complet (scroll)
   * ======================================================================== */
  function ensureAgendaModal() {
    if (document.getElementById('cdcAgendaOverlay')) return;
    var ov = document.createElement('div');
    ov.id = 'cdcAgendaOverlay';
    ov.style.cssText = 'display:none;position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.5);align-items:center;justify-content:center;padding:16px';
    ov.innerHTML = '<div id="cdcAgendaCard" style="background:#fff;border-radius:18px;max-width:480px;width:100%;max-height:85vh;overflow:auto;-webkit-overflow-scrolling:touch;box-shadow:0 24px 60px rgba(0,0,0,.28)"></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) closeAgenda(); });
    document.body.appendChild(ov);
  }
  function closeAgenda() {
    var ov = document.getElementById('cdcAgendaOverlay');
    if (ov) ov.style.display = 'none';
  }
  window.cdcCloseAgenda = closeAgenda;

  function openAgenda(eventId) {
    var ev = getEv(eventId);
    if (!ev) return;
    ensureAgendaModal();
    var card = document.getElementById('cdcAgendaCard');
    if (!card) return;
    var paid = isPaid(ev);
    var dateStr = (typeof formatEventDate === 'function') ? formatEventDate(ev.event_date) : String(ev.event_date || '');
    var desc = String(ev.description || '')
      .replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]/g, '')
      .replace(/\[STAFF_PRESENCE\]/g, '')
      .replace(/\[HOST_COUNTRY:[^\]]*\]/g, '')
      .trim();
    card.innerHTML =
      '<div style="padding:18px;position:sticky;top:0;background:#fff;border-bottom:1px solid #f1f5f9;z-index:2">' +
      '<button type="button" onclick="cdcCloseAgenda()" style="float:right;border:0;background:0;font-size:22px;cursor:pointer">×</button>' +
      '<div style="font-size:32px">' + esc(ev.emoji || '🎉') + '</div>' +
      '<h3 style="margin:6px 0">' + esc(ev.title || '') + '</h3>' +
      '<p style="margin:2px 0;color:#64748b;font-size:13px">📍 ' + esc(ev.address || '') + '</p>' +
      '<p style="margin:2px 0;color:#64748b;font-size:13px">🕐 ' + esc(dateStr) + '</p>' +
      '<p style="margin:8px 0 0;font-weight:800;color:' + (paid ? '#7c3aed' : '#15803d') + '">' +
      (paid ? ('💶 Payant · ' + priceLabel(ev)) : '✅ Gratuit') + '</p></div>' +
      '<div style="padding:14px 18px 24px">' +
      '<div style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:6px;text-transform:uppercase">Descriptif</div>' +
      '<div style="font-size:14px;line-height:1.55;color:#334155;white-space:pre-wrap;word-break:break-word;min-height:80px">' +
      (desc ? esc(desc) : '<em style="color:#94a3b8">Aucun descriptif.</em>') +
      '</div>' +
      '<p style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:center">↕ Faites défiler pour tout lire</p></div>';
    document.getElementById('cdcAgendaOverlay').style.display = 'flex';
  }
  window.cdcOpenAgenda = openAgenda;

  function wireAgendaClicks() {
    if (window._cdcAgendaWired) return;
    window._cdcAgendaWired = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('button, a, .btn, input, select, textarea')) return;
      var card = t.closest('[data-event-id]');
      if (!card) return;
      var page = (typeof getActivePage === 'function') ? getActivePage() : '';
      var inAgenda = page === 'agenda' || !!card.closest('#agenda, #agendaCalendar, .agenda-week, #personalAgendaBox');
      if (!inAgenda) return;
      var eid = card.getAttribute('data-event-id');
      if (!eid) return;
      e.preventDefault();
      e.stopPropagation();
      openAgenda(eid);
    }, true);
  }

  /* ---------- boot ---------- */
  function tick() {
    patchJoin();
    patchBubbles();
    unlockPaidCards();
    injectLogout();
    uniformNotifs();
    wireAgendaClicks();
  }

  function boot() {
    tick();
    syncQuota();
  }

  if (typeof window.go === 'function' && !window._cdcGoPatched) {
    window._cdcGoPatched = true;
    var prevGo = window.go;
    window.go = function (page) {
      prevGo.apply(this, arguments);
      setTimeout(boot, 200);
      setTimeout(boot, 800);
      if (page === 'messages') setTimeout(syncQuota, 400);
      if (page === 'events' || page === 'agenda') setTimeout(unlockPaidCards, 500);
    };
  }

  if (typeof window.loadAndRenderEvents === 'function' && !window._cdcLoadEvPatched) {
    window._cdcLoadEvPatched = true;
    var prevLoad = window.loadAndRenderEvents;
    window.loadAndRenderEvents = async function () {
      var r = await prevLoad.apply(this, arguments);
      setTimeout(unlockPaidCards, 100);
      setTimeout(unlockPaidCards, 600);
      return r;
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  setTimeout(boot, 500);
  setTimeout(boot, 1500);
  setTimeout(boot, 3000);
  // Re-gagner le patch join si un autre script le réécrit
  setInterval(function () {
    patchJoin();
    patchBubbles();
    injectLogout();
    unlockPaidCards();
  }, 2500);
  setInterval(syncQuota, 4000);

  console.log('[AUPYGO] cdc-fixes.js — 7 points CDC actifs');
})();
/* ===== AUPYGO — suppression compte via Edge Function delete-user (Resend) ===== */
(function () {
  'use strict';

  window.handleDeleteProfile = async function handleDeleteProfile() {
    if (!window.currentUser) {
      if (typeof showToast === 'function') {
        showToast(
          typeof t === 'function' ? t('profile.delete_login_required') : 'Connecte-toi',
          'error'
        );
      }
      return;
    }

    var confirmed = confirm(
      'Vous êtes sur le point de supprimer définitivement votre compte.\n\n' +
      'Cette action est irréversible.\n\n' +
      'Toutes vos données personnelles, vos informations de profil, vos amis, vos messages et vos contenus associés seront supprimés définitivement.\n\n' +
      'Votre abonnement ne sera pas remboursé pour la période en cours.\n' +
      'Son renouvellement automatique sera annulé.\n\n' +
      'Continuer ?'
    );
    if (!confirmed) return;

    var client = window.supabaseClient || window.supabase;
    if (!client) {
      if (typeof showToast === 'function') showToast('Connexion indisponible', 'error');
      return;
    }

    try {
      if (typeof showToast === 'function') showToast('Suppression du compte...', 'success');

      var sessionRes = await client.auth.getSession();
      var token = sessionRes && sessionRes.data && sessionRes.data.session && sessionRes.data.session.access_token;
      if (!token) throw new Error('Session expirée, reconnecte-toi.');

      var base =
        (window.SUPABASE_URL || window.supabaseUrl || client.supabaseUrl || '').replace(/\/$/, '');
      if (!base) throw new Error('SUPABASE_URL manquant');

      var anon =
        window.SUPABASE_ANON_KEY ||
        window.supabaseAnonKey ||
        (window.AUPYGO_CONFIG && window.AUPYGO_CONFIG.supabaseAnonKey) ||
        '';

      var res = await fetch(base + '/functions/v1/delete-user', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          apikey: anon,
          'Content-Type': 'application/json'
        }
      });

      var body = {};
      try { body = await res.json(); } catch (e) {}
      if (!res.ok) {
        throw new Error(body.error || body.message || ('HTTP ' + res.status));
      }

      console.log('[delete-user]', body);

      if (typeof showToast === 'function') {
        showToast(
          (typeof t === 'function' && t('profile.delete_done')) ||
            'Compte supprimé définitivement. À bientôt.',
          'success'
        );
      }

      try { if (typeof stopIdleWatch === 'function') stopIdleWatch(); } catch (e) {}
      try { if (typeof teardownMessagesRealtime === 'function') teardownMessagesRealtime(); } catch (e) {}
      try { if (typeof setOnlineStatus === 'function') await setOnlineStatus(false); } catch (e) {}

      localStorage.clear();
      sessionStorage.clear();

      try {
        await client.auth.signOut({ scope: 'global' });
      } catch (e) {
        try { await client.auth.signOut(); } catch (e2) {}
      }

      window.currentUser = null;
      try { currentUser = null; } catch (e) {}
      window.currentPlan = 'FREE';
      try { currentPlan = 'FREE'; } catch (e) {}
      window.profileSaved = false;
      try { profileSaved = false; } catch (e) {}

      if (typeof unlockIdentityFields === 'function') unlockIdentityFields();
      if (typeof updatePlanUI === 'function') updatePlanUI();
      if (typeof go === 'function') go('plans');
    } catch (e) {
      console.error('[handleDeleteProfile]', e);
      if (typeof showToast === 'function') {
        showToast((e && e.message) || 'Erreur suppression', 'error');
      }
    }
  };

  console.log('[AUPYGO] handleDeleteProfile → Edge Function delete-user');
})();
/* ===== AUPYGO — Tarifs sorties + descriptif au clic (abonnés) ===== */
(function () {
  'use strict';

  function plan() {
    try {
      return String(window.currentPlan || (typeof currentPlan !== 'undefined' ? currentPlan : 'FREE') || 'FREE').toUpperCase();
    } catch (e) { return 'FREE'; }
  }

  function isAmiral() {
    try {
      if (typeof isAmiral === 'function' && window.isAmiral !== isAmiral && isAmiral()) return true;
    } catch (e) {}
    try {
      if (typeof window.isAmiral === 'function' && window.isAmiral()) return true;
      if (typeof isAdmin === 'function' && isAdmin()) return true;
      var p = window.currentUserProfile;
      if (p && (p.is_admin === true || String(p.role || '').toLowerCase() === 'amiral')) return true;
    } catch (e2) {}
    return false;
  }

  function isStaffEv(ev) {
    if (!ev) return false;
    if (ev.is_special_aupygo === true || ev.is_special_aupygo === 'true') return true;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return true;
    if (String(ev.type || '') === 'special') return true;
    try {
      var c = (window.profiles || []).find(function (x) { return x && x.id === ev.creator_id; });
      if (!c) return false;
      if (c.is_admin === true) return true;
      var r = String(c.role || '').toLowerCase();
      return ['amiral','admin_general','admin','host','moderator','major_staff','sergent_staff','major_moderateur','sergent_moderateur'].indexOf(r) !== -1;
    } catch (e) { return false; }
  }

  function isPaidEv(ev) {
    return !!(ev && (ev.is_paid === true || ev.is_paid === 'true') && Number(ev.price) > 0);
  }

  function priceTxt(ev) {
    if (!isPaidEv(ev)) return '';
    return Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /** Libellé tarif affiché sur les cartes */
  function tariffLabel(ev) {
    if (isPaidEv(ev)) {
      if (isStaffEv(ev)) {
        // Événement AUPYGO payant : note dédiée + montant
        return '💶 Événement AUPYGO payant — ' + priceTxt(ev) + ' (voir descriptif)';
      }
      return '💶 Entrée payante (voir descriptif)';
    }
    return '🆓 Gratuit — entrée libre';
  }

  /** Note d'attention sous le titre */
  function attentionNote(ev) {
    if (isPaidEv(ev) && isStaffEv(ev)) {
      return '⚠️ Sortie AUPYGO monétisée — l’entrée est payante. Détails et tarif dans le descriptif.';
    }
    if (isPaidEv(ev)) {
      return '⚠️ Entrée payante — consulte le descriptif avant de t’inscrire.';
    }
    return '✅ Entrée gratuite — libre d’accès selon les places disponibles.';
  }

  /* ---------- 1) Formulaire création : libellés + Amiral seul pour payant ---------- */
  function fixCreateFormLabels() {
    var hint = document.querySelector('.wizard-step-hint');
    if (hint && /payante|monétisée|Gratuit par défaut/i.test(hint.textContent || '')) {
      hint.textContent = 'Tarif de la sortie — Gratuit par défaut. Seul l’admin AUPYGO (Amiral) peut publier une sortie payante monétisée.';
    }

    var freeLab = document.querySelector('label[for="eventPaidFree"], #eventPaidFree');
    if (freeLab) {
      var freeSpan = freeLab.closest('label') || freeLab.parentElement;
      if (freeSpan) {
        var fs = freeSpan.querySelector('span');
        if (fs) fs.innerHTML = '🆓 <strong>Gratuit</strong> — entrée libre';
      }
    }

    var paidLab = document.querySelector('label[for="eventPaidPaid"], #eventPaidPaid');
    if (paidLab) {
      var paidWrap = paidLab.closest('label') || paidLab.parentElement;
      if (paidWrap) {
        var ps = paidWrap.querySelector('span');
        if (ps) {
          ps.innerHTML = isAmiral()
            ? '💶 <strong>Payant</strong> — montant personnalisé (Amiral)'
            : '💶 <strong>Entrée payante</strong> (voir descriptif) — réservé à l’Amiral';
        }
      }
    }

    // Non-Amiral : forcer gratuit, cacher montant
    if (!isAmiral()) {
      var paidRadio = document.getElementById('eventPaidPaid');
      var freeRadio = document.getElementById('eventPaidFree');
      var priceWrap = document.getElementById('createEventPriceWrap');
      var priceInput = document.getElementById('createEventPrice');
      var priceStep = document.getElementById('wizardStep_price');
      if (paidRadio) {
        paidRadio.checked = false;
        paidRadio.disabled = true;
      }
      if (freeRadio) freeRadio.checked = true;
      if (priceWrap) priceWrap.style.display = 'none';
      if (priceInput) { priceInput.value = ''; priceInput.disabled = true; }
      if (priceStep) priceStep.style.display = 'none';
      if (paidLab) {
        var hide = paidLab.closest('label') || paidLab.parentElement;
        if (hide) hide.style.opacity = '0.45';
      }
    } else {
      var paidRadio2 = document.getElementById('eventPaidPaid');
      if (paidRadio2) paidRadio2.disabled = false;
      var priceStep2 = document.getElementById('wizardStep_price');
      if (priceStep2) priceStep2.style.display = '';
    }
  }

  /* ---------- 2) Badges tarif sur les cartes ---------- */
  function applyTariffBadges() {
    (window.cachedEvents || []).forEach(function (ev) {
      if (!ev || !ev.id) return;
      document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(function (card) {
        var line = card.querySelector('.aupygo-tariff-line');
        if (!line) {
          line = document.createElement('p');
          line.className = 'event-details aupygo-tariff-line';
          line.style.cssText = 'font-weight:700;margin:6px 0 2px;font-size:13px';
          card.insertBefore(line, card.firstChild.nextSibling || card.firstChild);
        }
        line.textContent = tariffLabel(ev);
        line.style.color = isPaidEv(ev) ? '#7c3aed' : '#15803d';

        var note = card.querySelector('.aupygo-attention-note');
        if (!note) {
          note = document.createElement('p');
          note.className = 'event-details aupygo-attention-note';
          note.style.cssText = 'font-size:12px;color:#64748b;margin:0 0 6px';
          line.parentNode.insertBefore(note, line.nextSibling);
        }
        note.textContent = attentionNote(ev);

        // Clic carte → descriptif (abonnés STANDARD / PREMIUM + staff)
        if (!card._aupygoDescBound) {
          card._aupygoDescBound = true;
          card.style.cursor = 'pointer';
          card.addEventListener('click', function (e) {
            // ne pas intercepter boutons / liens
            if (e.target && (e.target.closest('button') || e.target.closest('a') || e.target.closest('input'))) return;
            openEventDescModal(ev);
          });
        }
      });
    });
  }

  /* ---------- 3) Modal descriptif (abonnés) ---------- */
  function ensureDescModal() {
    if (document.getElementById('aupygoDescOverlay')) return;
    var ov = document.createElement('div');
    ov.id = 'aupygoDescOverlay';
    ov.style.cssText =
      'display:none;position:fixed;inset:0;z-index:10070;background:rgba(15,23,42,.55);' +
      'align-items:center;justify-content:center;padding:16px';
    ov.innerHTML =
      '<div id="aupygoDescCard" style="background:#fff;border-radius:16px;max-width:440px;width:100%;' +
      'padding:20px;max-height:90vh;overflow:auto;box-shadow:0 20px 50px rgba(0,0,0,.25)"></div>';
    ov.addEventListener('click', function (e) {
      if (e.target === ov) closeDescModal();
    });
    document.body.appendChild(ov);
  }

  function closeDescModal() {
    var ov = document.getElementById('aupygoDescOverlay');
    if (ov) ov.style.display = 'none';
  }
  window.aupygoCloseDescModal = closeDescModal;

  function openEventDescModal(ev) {
    if (!ev) return;
    var p = plan();
    var staff = false;
    try { staff = typeof isStaff === 'function' && isStaff(); } catch (e) {}

    // FREE : peut voir le tarif, mais pas le descriptif complet → inviter à upgrader
    // (sauf si tu veux aussi le montrer aux FREE : retire ce bloc)
    if (p === 'FREE' && !staff && !isAmiral()) {
      if (typeof showToast === 'function') {
        showToast('🔒 Le descriptif détaillé est réservé aux abonnés STANDARD / PREMIUM.', 'info');
      }
      // Afficher quand même un aperçu minimal (tarif + note)
      ensureDescModal();
      var card0 = document.getElementById('aupygoDescCard');
      if (!card0) return;
      card0.innerHTML =
        '<button type="button" onclick="aupygoCloseDescModal()" style="float:right;border:0;background:0;font-size:22px;cursor:pointer">×</button>' +
        '<div style="font-size:28px">' + esc(ev.emoji || '🎉') + '</div>' +
        '<h3 style="margin:8px 0">' + esc(ev.title || '') + '</h3>' +
        '<p style="font-weight:700;color:' + (isPaidEv(ev) ? '#7c3aed' : '#15803d') + '">' + esc(tariffLabel(ev)) + '</p>' +
        '<p style="font-size:13px;color:#64748b">' + esc(attentionNote(ev)) + '</p>' +
        '<p style="margin-top:12px;font-size:13px">Passe en STANDARD pour lire le descriptif complet et t’inscrire aux sorties.</p>' +
        '<button type="button" class="btn btn-primary" style="width:100%;margin-top:12px" onclick="aupygoCloseDescModal();if(typeof go===\'function\')go(\'plans\')">Voir les forfaits</button>';
      document.getElementById('aupygoDescOverlay').style.display = 'flex';
      return;
    }

    // STANDARD / PREMIUM / staff : descriptif complet
    ensureDescModal();
    var card = document.getElementById('aupygoDescCard');
    if (!card) return;

    var dateStr = typeof formatEventDate === 'function' ? formatEventDate(ev.event_date) : String(ev.event_date || '');
    var desc = String(ev.description || '')
      .replace(/\[STAFF_EVENT\]/g, '')
      .replace(/\[STAFF_PRESENCE\]/g, '')
      .replace(/\[HOST_COUNTRY:[^\]]*\]/g, '')
      .replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]/g, '')
      .trim();

    card.innerHTML =
      '<button type="button" onclick="aupygoCloseDescModal()" style="float:right;border:0;background:0;font-size:22px;cursor:pointer">×</button>' +
      '<div style="font-size:28px">' + esc(ev.emoji || '🎉') + '</div>' +
      '<h3 style="margin:8px 0">' + esc(ev.title || '') + '</h3>' +
      '<p style="margin:4px 0;color:#64748b;font-size:13px">📍 ' + esc(ev.address || '') + '</p>' +
      '<p style="margin:4px 0;color:#64748b;font-size:13px">🕐 ' + esc(dateStr) + '</p>' +
      '<p style="font-weight:700;margin:10px 0 4px;color:' + (isPaidEv(ev) ? '#7c3aed' : '#15803d') + '">' +
      esc(tariffLabel(ev)) + '</p>' +
      '<p style="font-size:12px;color:#64748b;margin:0 0 10px">' + esc(attentionNote(ev)) + '</p>' +
      (desc
        ? '<div style="margin:12px 0;padding:12px;border-radius:12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:14px;white-space:pre-wrap">' +
          esc(desc) + '</div>'
        : '<p style="color:#94a3b8;font-size:13px">Pas de descriptif pour cette sortie.</p>') +
      '<button type="button" class="btn btn-secondary" style="width:100%;margin-top:8px" onclick="aupygoCloseDescModal()">Fermer</button>';

    document.getElementById('aupygoDescOverlay').style.display = 'flex';
  }
  window.openEventDescModal = openEventDescModal;

  function boot() {
    fixCreateFormLabels();
    applyTariffBadges();
  }

  boot();
  setInterval(boot, 1500);
  setTimeout(boot, 400);
  setTimeout(boot, 1200);

  // Après chaque rechargement d’événements
  if (typeof window.loadAndRenderEvents === 'function' && !window._aupygoTariffLoadPatched) {
    window._aupygoTariffLoadPatched = true;
    var origLoad = window.loadAndRenderEvents;
    window.loadAndRenderEvents = async function () {
      var r = await origLoad.apply(this, arguments);
      setTimeout(boot, 50);
      setTimeout(boot, 300);
      return r;
    };
  }

  console.log('[AUPYGO] tarifs sorties + descriptif au clic — ready');
})();
