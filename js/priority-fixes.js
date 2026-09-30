/* AUPYGO priority-fixes.js
 * Cahier des charges — corrections prioritaires
 * 1. Événements payants staff visibles par tous (FREE/STANDARD/PREMIUM)
 * 2. Identité expéditeur sur tous les messages (DM + groupes)
 * 3. Compteurs messages restants visibles (FREE & STANDARD)
 * 4. Bouton Déconnexion entre Profil et Language
 * 5. Notifications uniformes (tous plans / staff)
 * 6. Pop-up acceptation : Gratuit/Payant + prix + clause non-remboursement
 * 7. Pop-up agenda centré avec descriptif complet (swipe/scroll)
 */
(function () {
  'use strict';

  var NON_REFUND_TEXT =
    'Clause de non-remboursement : une fois l\'invitation acceptée et le paiement validé, ' +
    'aucun remboursement ne sera accordé, sauf obligation légale impérative. ' +
    'En cochant la case ci-dessous, vous reconnaissez avoir lu et accepté cette condition.';

  /* ------------------------------------------------------------
   * 1. Visibilité / join des événements payants créés par le staff
   * ------------------------------------------------------------ */
  function isStaffCreatedEvent(ev) {
    if (!ev) return false;
    if (ev.is_special_aupygo === true) return true;
    if (ev.visibility === 'admin' || ev.visibility === 'admin_only') return true;
    var creator = (window.profiles || []).find(function (p) { return p && p.id === ev.creator_id; });
    if (!creator) return false;
    if (creator.is_admin === true) return true;
    var r = String(creator.role || '').toLowerCase();
    return [
      'amiral', 'admin_general', 'admin', 'host', 'moderator',
      'major_staff', 'sergent_staff', 'major_moderateur', 'sergent_moderateur'
    ].indexOf(r) !== -1;
  }

  function isPaidEvent(ev) {
    return !!(ev && ev.is_paid && Number(ev.price) > 0);
  }

  function isStaffPaidVisibleToAll(ev) {
    return isStaffCreatedEvent(ev) && isPaidEvent(ev);
  }

  function patchJoinForStaffPaid() {
    if (typeof window.joinRealEvent !== 'function' || window._pfJoinPatched) return;
    window._pfJoinPatched = true;
    var orig = window.joinRealEvent;
    window.joinRealEvent = async function (eventId) {
      var ev = (window.cachedEvents || []).find(function (e) { return e && e.id === eventId; }) || null;
      // Staff paid → visible et joignable par tous (y compris FREE)
      if (ev && isStaffPaidVisibleToAll(ev)) {
        return openPaidAcceptModal(ev);
      }
      // Autres payants : toujours afficher Gratuit/Payant avant accept
      if (ev && isPaidEvent(ev)) {
        return openPaidAcceptModal(ev);
      }
      return orig.apply(this, arguments);
    };
  }

  // Ne plus verrouiller les cartes d'événements staff payants pour FREE
  function patchEventCardLock() {
    // Observateur DOM : retire le cadenas sur les events staff payants
    function unlockCards() {
      (window.cachedEvents || []).forEach(function (ev) {
        if (!isStaffPaidVisibleToAll(ev)) return;
        document.querySelectorAll('[data-event-id="' + ev.id + '"]').forEach(function (card) {
          var lockedBtn = card.querySelector('.btn-locked, .event-upgrade');
          if (lockedBtn) {
            var priceLabel = Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €';
            lockedBtn.className = 'btn btn-primary event-join';
            lockedBtn.textContent = '💶 ' + priceLabel;
            lockedBtn.onclick = function (e) {
              e.preventDefault();
              openPaidAcceptModal(ev);
            };
          }
          // Afficher le prix si absent
          if (isPaidEvent(ev) && !card.querySelector('.pf-price-badge')) {
            var badge = document.createElement('p');
            badge.className = 'event-details pf-price-badge';
            badge.style.cssText = 'font-weight:800;color:#7c3aed';
            badge.textContent = '💶 Payant · ' + Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €';
            card.appendChild(badge);
          }
        });
      });
    }
    setInterval(unlockCards, 1500);
    setTimeout(unlockCards, 800);
  }

  /* ------------------------------------------------------------
   * 6. Pop-up acceptation payant + clause non-remboursement
   * ------------------------------------------------------------ */
  function ensurePaidAcceptOverlay() {
    var ov = document.getElementById('pfPaidAcceptOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'pfPaidAcceptOverlay';
    ov.style.cssText =
      'display:none;position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,0.55);' +
      'align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML =
      '<div id="pfPaidAcceptCard" style="background:#fff;border-radius:16px;max-width:420px;width:100%;' +
      'padding:20px;box-shadow:0 20px 50px rgba(0,0,0,.25);max-height:90vh;overflow:auto"></div>';
    ov.addEventListener('click', function (e) {
      if (e.target === ov) closePaidAcceptModal();
    });
    document.body.appendChild(ov);
    return ov;
  }

  function closePaidAcceptModal() {
    var ov = document.getElementById('pfPaidAcceptOverlay');
    if (ov) ov.style.display = 'none';
  }
  window.closePaidAcceptModal = closePaidAcceptModal;

  function openPaidAcceptModal(ev) {
    if (!ev) return;
    var ov = ensurePaidAcceptOverlay();
    var card = document.getElementById('pfPaidAcceptCard');
    if (!card) return;

    var paid = isPaidEvent(ev);
    var priceLabel = paid ? (Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €') : '';
    var dateStr = typeof formatEventDate === 'function' ? formatEventDate(ev.event_date) : String(ev.event_date || '');
    var title = ev.title || 'Événement';

    card.innerHTML =
      '<button type="button" onclick="closePaidAcceptModal()" aria-label="Fermer" ' +
      'style="float:right;border:0;background:transparent;font-size:22px;cursor:pointer;line-height:1">×</button>' +
      '<div style="font-size:28px;margin-bottom:8px">' + (ev.emoji || '🎉') + '</div>' +
      '<h3 style="margin:0 0 8px;font-size:18px">' + escapeSafe(title) + '</h3>' +
      '<p style="margin:4px 0;color:#64748b;font-size:13px">📍 ' + escapeSafe(ev.address || '') + '</p>' +
      '<p style="margin:4px 0;color:#64748b;font-size:13px">🕐 ' + escapeSafe(dateStr) + '</p>' +
      '<div style="margin:14px 0;padding:12px;border-radius:12px;background:' +
      (paid ? '#faf5ff;border:1px solid #e9d5ff' : '#f0fdf4;border:1px solid #bbf7d0') + '">' +
      '<div style="font-weight:800;font-size:15px;color:' + (paid ? '#7c3aed' : '#15803d') + '">' +
      (paid ? ('💶 Événement payant — ' + priceLabel) : '✅ Événement gratuit') +
      '</div></div>' +
      (paid
        ? '<label style="display:flex;gap:10px;align-items:flex-start;margin:12px 0;font-size:12px;color:#334155;cursor:pointer">' +
          '<input type="checkbox" id="pfNonRefundCheck" style="margin-top:3px;flex-shrink:0">' +
          '<span>' + NON_REFUND_TEXT + '</span></label>'
        : '') +
      '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">' +
      '<button type="button" class="btn btn-primary" id="pfAcceptBtn" style="flex:1;min-width:120px">' +
      (paid ? ('Accepter · ' + priceLabel) : 'Accepter') + '</button>' +
      '<button type="button" class="btn btn-secondary" onclick="closePaidAcceptModal()" style="flex:1;min-width:100px">Annuler</button>' +
      '</div>';

    ov.style.display = 'flex';

    var btn = document.getElementById('pfAcceptBtn');
    if (btn) {
      btn.onclick = async function () {
        if (paid) {
          var chk = document.getElementById('pfNonRefundCheck');
          if (!chk || !chk.checked) {
            if (typeof showToast === 'function') {
              showToast('Merci d\'accepter la clause de non-remboursement avant de continuer.', 'error');
            }
            return;
          }
        }
        closePaidAcceptModal();
        await forceJoinEvent(ev.id, paid);
      };
    }
  }
  window.openPaidAcceptModal = openPaidAcceptModal;

  async function forceJoinEvent(eventId, isPaid) {
    // Contourne le lock FREE pour les événements staff payants autorisés
    var prevPlan = typeof currentPlan !== 'undefined' ? currentPlan : window.currentPlan;
    var prevWin = window.currentPlan;
    try {
      // Temporairement STANDARD pour passer les checks d'app.js
      try { currentPlan = 'STANDARD'; } catch (e) {}
      window.currentPlan = 'STANDARD';

      // Appeler l'original sans repasser par notre patch (évite boucle)
      // On utilise l'insert direct si possible
      if (!window.currentUser) {
        if (typeof showToast === 'function') showToast('Connecte-toi pour participer.', 'error');
        if (typeof go === 'function') go('plans');
        return;
      }
      var client = window.supabaseClient || window.supabase;
      if (!client) return;

      var { error } = await client.from('event_participants').insert({
        event_id: eventId,
        user_id: window.currentUser.id
      });
      if (error) {
        // déjà inscrit ?
        if (!/duplicate|unique|23505/i.test(String(error.message || '') + String(error.code || ''))) {
          if (typeof showToast === 'function') showToast('Erreur : ' + (error.message || error), 'error');
          return;
        }
      }
      if (typeof showToast === 'function') {
        showToast(isPaid ? '🎉 Place réservée (paiement simulé) !' : '🎉 Tu es inscrit !', 'success');
      }
      if (typeof loadAndRenderEvents === 'function') await loadAndRenderEvents();
    } finally {
      try { currentPlan = prevPlan; } catch (e2) {}
      window.currentPlan = prevWin || prevPlan;
    }
  }

  /* ------------------------------------------------------------
   * 2. Identité de l'expéditeur sur tous les messages
   * ------------------------------------------------------------ */
  function formatMsgTime(ts) {
    try {
      var d = ts ? new Date(ts) : new Date();
      if (isNaN(d.getTime())) d = new Date();
      var dd = String(d.getDate()).padStart(2, '0');
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var hh = String(d.getHours()).padStart(2, '0');
      var mi = String(d.getMinutes()).padStart(2, '0');
      return dd + '/' + mm + ' · ' + hh + ':' + mi;
    } catch (e) {
      return '';
    }
  }

  function senderName(senderId, isMe) {
    if (isMe) {
      var me = window.currentUserProfile || (window.profiles || []).find(function (p) {
        return p && window.currentUser && p.id === window.currentUser.id;
      });
      return (me && me.display_name) || 'Moi';
    }
    var p = (window.profiles || []).find(function (x) { return x && x.id === senderId; });
    return (p && p.display_name) || 'Membre';
  }

  function patchAppendBubble() {
    if (typeof window.appendBubble !== 'function' || window._pfBubblePatched) return;
    window._pfBubblePatched = true;
    var orig = window.appendBubble;

    // Nouvelle signature compatible : (text, isMe, createdAt, senderId?)
    window.appendBubble = function (text, isMe, createdAt, senderId) {
      // Messages système inchangés
      if (typeof text === 'string' && /a quitté le groupe/i.test(text)) {
        return orig(text, isMe, createdAt);
      }
      var box = document.getElementById('chatMessages');
      if (!box) return orig(text, isMe, createdAt);

      var placeholder = box.querySelector('.chat-placeholder');
      if (placeholder) box.innerHTML = '';

      // Date separator si disponible
      try {
        if (typeof getDateKey === 'function' && typeof formatMessageDate === 'function') {
          var dateKey = getDateKey(createdAt || new Date());
          if (dateKey && dateKey !== window.lastBubbleDateKey) {
            var sep = document.createElement('div');
            sep.className = 'chat-date-separator';
            sep.innerHTML = '<span>' + formatMessageDate(createdAt || new Date()) + '</span>';
            box.appendChild(sep);
            window.lastBubbleDateKey = dateKey;
          }
        }
      } catch (e) {}

      var sid = senderId;
      if (!sid && isMe && window.currentUser) sid = window.currentUser.id;
      var name = senderName(sid, !!isMe);
      var time = formatMsgTime(createdAt);

      var wrap = document.createElement('div');
      wrap.className = 'pf-msg-wrap';
      wrap.style.cssText =
        'display:flex;flex-direction:column;margin:6px 0;' +
        (isMe ? 'align-items:flex-end;' : 'align-items:flex-start;');

      var label = document.createElement('div');
      label.className = 'pf-sender-label';
      label.style.cssText =
        'font-size:11px;font-weight:700;color:' + (isMe ? '#7c3aed' : '#334155') +
        ';margin:0 6px 2px;opacity:0.9';
      label.textContent = name + (time ? ' · ' + time : '');

      var bubble = document.createElement('div');
      bubble.className = 'bubble' + (isMe ? ' me' : '');
      bubble.textContent = text;

      wrap.appendChild(label);
      wrap.appendChild(bubble);
      box.appendChild(wrap);
      box.scrollTop = box.scrollHeight;
    };

    // Patch loadConversationHistory pour passer sender_id
    if (typeof window.loadConversationHistory === 'function' && !window._pfHistPatched) {
      window._pfHistPatched = true;
      var origHist = window.loadConversationHistory;
      window.loadConversationHistory = async function (convId) {
        // Staff a son propre render — laisser passer
        if (typeof isStaff === 'function' && isStaff()) {
          return origHist.apply(this, arguments);
        }
        var box = document.getElementById('chatMessages');
        if (!box || !convId) return origHist.apply(this, arguments);
        try {
          var client = window.supabaseClient || window.supabase;
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
            window.appendBubble(
              m.content,
              !!(window.currentUser && m.sender_id === window.currentUser.id),
              m.created_at,
              m.sender_id
            );
          });
          box.scrollTop = box.scrollHeight;
        } catch (e) {
          return origHist.apply(this, arguments);
        }
      };
    }
  }

  /* ------------------------------------------------------------
   * 3. Compteurs messages restants visibles (FREE & STANDARD)
   * ------------------------------------------------------------ */
  function ensureQuotaVisible() {
    function placeQuota() {
      var plan = String(window.currentPlan || (typeof currentPlan !== 'undefined' ? currentPlan : 'FREE')).toUpperCase();
      if (plan === 'PREMIUM') {
        var elH = document.getElementById('messagesQuota');
        if (elH) elH.style.display = 'none';
        var sticky = document.getElementById('pfQuotaSticky');
        if (sticky) sticky.style.display = 'none';
        return;
      }

      // Élément natif app.js
      var el = document.getElementById('messagesQuota');
      if (el) {
        el.style.display = 'block';
        el.style.visibility = 'visible';
        el.style.opacity = '1';
      }

      // Barre sticky permanente au-dessus de la zone messages
      var page = document.getElementById('messages');
      if (!page) return;
      var sticky = document.getElementById('pfQuotaSticky');
      if (!sticky) {
        sticky = document.createElement('div');
        sticky.id = 'pfQuotaSticky';
        sticky.style.cssText =
          'position:sticky;top:0;z-index:20;padding:8px 12px;margin:0 0 8px;' +
          'background:#faf5ff;border:1px solid #e9d5ff;border-radius:10px;' +
          'font-size:13px;font-weight:700;color:#6b21a8;text-align:center';
        var list = document.getElementById('chatMessages') || page.querySelector('.chat-area') || page.firstChild;
        if (list && list.parentNode) list.parentNode.insertBefore(sticky, list);
        else page.insertBefore(sticky, page.firstChild);
      }
      sticky.style.display = 'block';

      // Sync texte depuis messagesQuota ou calcul
      if (el && el.textContent) {
        sticky.textContent = '💬 ' + el.textContent;
      } else if (typeof refreshMessagesQuotaUI === 'function') {
        refreshMessagesQuotaUI().then(function (q) {
          if (!q || q.max === Infinity) {
            sticky.style.display = 'none';
            return;
          }
          sticky.textContent = '💬 ' + q.left + '/' + q.max +
            (plan === 'FREE' ? ' messages restants (compte FREE)' : ' messages restants aujourd\'hui');
        });
      }
    }

    if (typeof window.refreshMessagesQuotaUI === 'function' && !window._pfQuotaPatched) {
      window._pfQuotaPatched = true;
      var origQ = window.refreshMessagesQuotaUI;
      window.refreshMessagesQuotaUI = async function () {
        var r = await origQ.apply(this, arguments);
        setTimeout(placeQuota, 50);
        return r;
      };
    }

    setInterval(placeQuota, 2000);
    setTimeout(placeQuota, 600);
    setTimeout(placeQuota, 2000);
  }

  /* ------------------------------------------------------------
   * 4. Bouton Déconnexion entre Profil et Language
   * ------------------------------------------------------------ */
  function injectLogoutButton() {
    if (document.getElementById('headerLogoutBtn')) {
      var existing = document.getElementById('headerLogoutBtn');
      existing.style.display = window.currentUser ? '' : 'none';
      return;
    }
    var actions = document.querySelector('.header-actions');
    if (!actions) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'headerLogoutBtn';
    btn.className = 'header-logout-btn';
    btn.setAttribute('aria-label', 'Déconnexion');
    btn.title = 'Déconnexion';
    btn.textContent = '🚪';
    btn.style.cssText =
      'border:0;background:#f1f5f9;border-radius:10px;padding:6px 10px;' +
      'cursor:pointer;font-size:16px;line-height:1;margin:0 4px';

    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (!window.currentUser) return;
      if (!confirm('Se déconnecter ?')) return;
      if (typeof handleLogout === 'function') handleLogout('manual');
      else if (window.supabaseClient) window.supabaseClient.auth.signOut();
    };

    // Position : entre Profil et Language
    var lang = actions.querySelector('.lang-select') || actions.querySelector('#language') ||
      actions.querySelector('[id*="lang"]');
    var profileBtn = actions.querySelector('[data-nav="profile"], #headerProfileBtn, #navProfile');

    if (lang) {
      actions.insertBefore(btn, lang);
    } else if (profileBtn && profileBtn.nextSibling) {
      actions.insertBefore(btn, profileBtn.nextSibling);
    } else {
      actions.appendChild(btn);
    }

    btn.style.display = window.currentUser ? '' : 'none';
  }

  function syncLogoutVisibility() {
    var btn = document.getElementById('headerLogoutBtn');
    if (btn) btn.style.display = window.currentUser ? '' : 'none';
  }

  /* ------------------------------------------------------------
   * 5. Notifications uniformes (tous comptes)
   * ------------------------------------------------------------ */
  function uniformNotifications() {
    // CSS : mêmes badges / pastilles pour tout le monde
    if (!document.getElementById('pfUniformNotifStyle')) {
      var st = document.createElement('style');
      st.id = 'pfUniformNotifStyle';
      st.textContent =
        /* Badges messages identiques */
        '.messages-badge, #messagesBadge, #headerMessagesBadge, #messagesBadgeBottom, #bottomMessagesBadge {' +
        '  min-width:16px!important;height:16px!important;padding:0 4px!important;' +
        '  border-radius:999px!important;background:#ef4444!important;color:#fff!important;' +
        '  font-size:10px!important;font-weight:800!important;line-height:16px!important;' +
        '}' +
        /* Pas de style alternatif selon plan */
        'body.plan-free .messages-badge, body.plan-standard .messages-badge, body.plan-premium .messages-badge,' +
        'body.is-staff .messages-badge { background:#ef4444!important; }' +
        /* Toast uniformes */
        '.toast, .show-toast, [class*="toast"] { font-family:inherit; }';
      document.head.appendChild(st);
    }

    // Forcer updateMessagesBadge sans branche plan
    if (typeof window.updateMessagesBadge === 'function' && !window._pfNotifPatched) {
      window._pfNotifPatched = true;
      var orig = window.updateMessagesBadge;
      window.updateMessagesBadge = function () {
        orig.apply(this, arguments);
        // Ré-afficher badges si count > 0, quel que soit le plan
        var n = 0;
        try {
          if (typeof getTotalUnreadCount === 'function') n = getTotalUnreadCount() || 0;
        } catch (e) {}
        ['messagesBadge', 'headerMessagesBadge', 'messagesBadgeBottom', 'bottomMessagesBadge'].forEach(function (id) {
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

  /* ------------------------------------------------------------
   * 7. Pop-up agenda centré + descriptif complet (scroll)
   * ------------------------------------------------------------ */
  function ensureAgendaDetailOverlay() {
    var ov = document.getElementById('pfAgendaDetailOverlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'pfAgendaDetailOverlay';
    ov.style.cssText =
      'display:none;position:fixed;inset:0;z-index:10040;background:rgba(15,23,42,0.5);' +
      'align-items:center;justify-content:center;padding:16px;';
    ov.innerHTML =
      '<div id="pfAgendaDetailCard" style="background:#fff;border-radius:18px;max-width:480px;width:100%;' +
      'max-height:85vh;overflow:auto;-webkit-overflow-scrolling:touch;' +
      'box-shadow:0 24px 60px rgba(0,0,0,.28);padding:0"></div>';
    ov.addEventListener('click', function (e) {
      if (e.target === ov) closeAgendaDetail();
    });
    document.body.appendChild(ov);
    return ov;
  }

  function closeAgendaDetail() {
    var ov = document.getElementById('pfAgendaDetailOverlay');
    if (ov) ov.style.display = 'none';
  }
  window.closeAgendaDetail = closeAgendaDetail;

  function cleanDescription(desc) {
    if (!desc) return '';
    return String(desc)
      .replace(/\[EN_ATTENTE_VALIDATION_ADMIN\]/gi, '')
      .replace(/\[STAFF_PRESENCE\]/gi, '')
      .replace(/\[HOST_COUNTRY:[^\]]*\]/gi, '')
      .trim();
  }

  function openAgendaDetail(eventId) {
    var ev = (window.cachedEvents || []).find(function (e) { return e && e.id === eventId; });
    if (!ev) return;
    var ov = ensureAgendaDetailOverlay();
    var card = document.getElementById('pfAgendaDetailCard');
    if (!card) return;

    var paid = isPaidEvent(ev);
    var priceLabel = paid ? (Number(ev.price).toFixed(2).replace(/\.00$/, '') + ' €') : 'Gratuit';
    var dateStr = typeof formatEventDate === 'function' ? formatEventDate(ev.event_date) : String(ev.event_date || '');
    var desc = cleanDescription(ev.description);

    card.innerHTML =
      '<div style="padding:18px 18px 8px;position:sticky;top:0;background:#fff;z-index:2;border-bottom:1px solid #f1f5f9">' +
      '<button type="button" onclick="closeAgendaDetail()" aria-label="Fermer" ' +
      'style="float:right;border:0;background:transparent;font-size:22px;cursor:pointer">×</button>' +
      '<div style="font-size:32px">' + (ev.emoji || '🎉') + '</div>' +
      '<h3 style="margin:6px 0 4px;font-size:18px">' + escapeSafe(ev.title || 'Événement') + '</h3>' +
      '<p style="margin:2px 0;color:#64748b;font-size:13px">📍 ' + escapeSafe(ev.address || '') + '</p>' +
      '<p style="margin:2px 0;color:#64748b;font-size:13px">🕐 ' + escapeSafe(dateStr) + '</p>' +
      '<p style="margin:6px 0 0;font-weight:800;color:' + (paid ? '#7c3aed' : '#15803d') + ';font-size:14px">' +
      (paid ? '💶 Payant · ' + priceLabel : '✅ Gratuit') + '</p>' +
      '</div>' +
      '<div style="padding:14px 18px 24px">' +
      '<div style="font-size:12px;font-weight:700;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em">Descriptif</div>' +
      '<div style="font-size:14px;line-height:1.55;color:#334155;white-space:pre-wrap;word-break:break-word;min-height:80px">' +
      (desc ? escapeSafe(desc) : '<em style="color:#94a3b8">Aucun descriptif.</em>') +
      '</div>' +
      '<p style="margin-top:16px;font-size:11px;color:#94a3b8;text-align:center">↕ Faites défiler pour tout lire</p>' +
      '</div>';

    ov.style.display = 'flex';
  }
  window.openAgendaDetail = openAgendaDetail;

  function wireAgendaClicks() {
    if (window._pfAgendaClickWired) return;
    window._pfAgendaClickWired = true;
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      // Clic sur une carte événement dans l'agenda (déjà accepté / inscrit)
      var card = t.closest('[data-event-id]');
      if (!card) return;
      // Ne pas intercepter les boutons d'action
      if (t.closest('button, a, .btn, [onclick]')) return;
      var page = typeof getActivePage === 'function' ? getActivePage() : '';
      if (page !== 'agenda' && !card.closest('#agenda, #agendaCalendar, .agenda-week')) return;
      var eid = card.getAttribute('data-event-id');
      if (!eid) return;
      e.preventDefault();
      openAgendaDetail(eid);
    }, true);
  }

  /* ------------------------------------------------------------
   * Helpers
   * ------------------------------------------------------------ */
  function escapeSafe(s) {
    return String(s || '')
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  /* ------------------------------------------------------------
   * Boot
   * ------------------------------------------------------------ */
  function boot() {
    patchJoinForStaffPaid();
    patchEventCardLock();
    patchAppendBubble();
    ensureQuotaVisible();
    injectLogoutButton();
    syncLogoutVisibility();
    uniformNotifications();
    wireAgendaClicks();
  }

  // Patch go pour ré-appliquer UI
  function patchGo() {
    if (typeof window.go !== 'function' || window._pfGoPatched) return;
    window._pfGoPatched = true;
    var prev = window.go;
    window.go = function (page) {
      prev(page);
      setTimeout(boot, 200);
      setTimeout(boot, 800);
      if (page === 'messages' && typeof refreshMessagesQuotaUI === 'function') {
        setTimeout(function () { refreshMessagesQuotaUI(); }, 400);
      }
    };
  }

  function tryBoot() {
    boot();
    patchGo();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryBoot);
  } else {
    tryBoot();
  }
  setTimeout(tryBoot, 600);
  setTimeout(tryBoot, 1500);
  setTimeout(tryBoot, 3000);
  setInterval(function () {
    injectLogoutButton();
    syncLogoutVisibility();
  }, 3000);

  console.log('[AUPYGO] priority-fixes.js chargé (7 points CDC)');
})();
